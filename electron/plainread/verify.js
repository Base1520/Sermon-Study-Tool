/**
 * verify.js — the adversarial second pass for PLAIN READ.
 *
 * WHY THIS EXISTS
 * Four of the six reasoning steps (setting, words, story, doing) are fresh model
 * generation with no grounding source behind them. validate.js stops known
 * failure SHAPES — pulpit language, a missing restraint block, a duty step on a
 * grief passage. It does not check a single CLAIM. A fabricated first-century
 * custom or a fabricated grammatical feature walks through every existing gate
 * untouched, and because the output is six confident numbered steps, the reader
 * ends up MORE certain of the fabrication, not less.
 *
 * The real case: a draft of the spec for this feature claimed Philippians 4:13
 * "opens with a connector that reaches back to that list." Phil 4:13 is
 * ASYNDETIC — there is no conjunction there. That error sat in the step whose
 * whole job is grammatical precision, in the passage most famous for being
 * misread, inside the document written to prevent that harm. Nothing caught it.
 *
 * In the normal sermon mode a pastor is the verifier in the loop. PLAIN READ
 * removes him. This file is what stands in that gap.
 *
 * HOW IT WORKS
 *   1. Claims are extracted from doc.work IN CODE, not by a model. Deterministic
 *      extraction means the whole claim-selection layer is testable with no API
 *      key and cannot itself hallucinate a claim that was never written.
 *   2. One separate model call adjudicates those claims. Its ONLY job is to
 *      refute. It never sees the generator's prompt, only the passage and the
 *      sentences.
 *   3. Verdicts are applied in code: REFUTED sentences are cut, UNVERIFIABLE
 *      claims are surfaced in doc.unknowns, everything is recorded on
 *      doc.verification.
 *
 * MODEL CHOICE — the honest version
 * The verifier runs claude-opus-4-8, the SAME model as the generator. That is a
 * real weakness and it is worth naming: a shared blind spot is invisible to this
 * design. If the generator invents a first-century custom that the model
 * "believes," the verifier will believe it too, and CONFIRMED will be wrong.
 * The alternative — a weaker model as verifier — is worse: it would miss real
 * fabrications AND manufacture false REFUTATIONs against correct text, and a
 * verifier that strips true sentences is more damaging than one that misses
 * false ones. Two mitigations are built in instead: the verifier gets a
 * hostile-adversary framing rather than the generator's teaching framing, and
 * it is told to reach for UNVERIFIABLE rather than CONFIRMED when it cannot
 * check something. Correlated error is reduced, not eliminated. If a genuinely
 * independent model becomes available, swap VERIFY_MODEL and re-run the evals.
 *
 * COST
 * The verify call is small in, small out: the system prompt (~800 tokens), the
 * passage text (capped at 6000 chars ≈ 1.5K tokens), and the extracted claim
 * sentences (~20-900 tokens) go in; a line of JSON per claim comes back
 * (~400-900 tokens out, more when a step has to be rewritten). At the published
 * Opus 4.8 rate of $5 / 1M input and $25 / 1M output that is roughly
 * $0.02-$0.04 per reading, against roughly $0.12-$0.15 for the generation call
 * it is checking — about a 20-25% surcharge on a PLAIN READ. Cache hits pay it
 * once, not per view, because the verified document is what gets cached.
 */

const {
  assertNoPulpitLeak,
  assertNoFenceDisclosure,
  assertNoDoctrineLeak,
  PlainReadValidationError,
} = require('./validate')
const { GROUNDING_KEY } = require('./vault/index.js')
const {
  SITUATION_CHECKED_STEPS,
  SITUATION_MIN_CLAIM_CHARS,
  isSituationStep,
  // Needed to tell a short mono FACT ROW (when / where) from the prose field
  // (pressure) when a refuted claim leaves nothing behind — see applyVerdicts.
  situationField,
  readStepBody,
  writeStepBody,
} = require('./situation')

/** Same model as the generator. See the model-choice note at the top. */
const VERIFY_MODEL = 'claude-opus-4-8'
const VERIFY_MAX_TOKENS = 3000

/** Bumped by hand whenever VERIFIER_SYSTEM or the extraction rules change. */
const VERIFY_PROMPT_VERSION = 4

/** Steps checked, in descending order of fabrication risk. */
const CHECKED_STEPS = ['setting', 'words', 'story', 'doing', 'surroundings', 'genre']

/**
 * The situation block is pure historical assertion — when a text was written,
 * where from, what pressure it walked into. That is the highest-density factual
 * surface in the document and nothing checked one word of it until now. The
 * step names, the read/write helpers and the shorter claim floor come from
 * situation.js's documented verifier hook, so this file does not reach into
 * that block's shape.
 *
 * ONE DELIBERATE DIVERGENCE from the hook's suggested wiring: it proposes
 * putting the situation steps at the FRONT of CHECKED_STEPS. They are appended
 * instead. CHECKED_STEPS is ordered by fabrication risk and the tail is what
 * gets dropped at MAX_CLAIMS, so front-loading would push the six steps toward
 * the cliff and would silently reorder every claim id in the document. The
 * situation block is protected by a reserved share of the budget instead —
 * same guarantee, no reordering.
 */
const SITUATION_STEPS = SITUATION_CHECKED_STEPS

/** Claim slots held back from MAX_CLAIMS for the situation block. */
const SITUATION_RESERVE = 6

/** Bounds the verify call. Claims past this are dropped from the LOWEST-risk steps first. */
const MAX_CLAIMS = 24

/** Passage text handed to the verifier, truncated to bound cost. */
const MAX_PASSAGE_CHARS = 6000

/** A sentence shorter than this is not a claim worth a round trip. */
const MIN_CLAIM_CHARS = 30

/** A step body shorter than this after stripping is not worth keeping. */
const MIN_BODY_CHARS = 40

/** How many "could not confirm" lines may be appended before the list stops being read. */
const MAX_UNKNOWNS_ADDED = 6

/**
 * Replaces a step body when a claim was refuted, could not be cleanly cut, and
 * the verifier offered no usable rewrite. Saying nothing is correct here.
 * Saying something invented would be the whole failure this file exists to stop.
 */
const STRIPPED_BODY =
  'A claim in this step did not survive a check against the passage, so it was removed. ' +
  'There is nothing left here I can stand behind.'

/** The same notice, worded for a field that is not one of the six steps. */
const STRIPPED_FIELD =
  'A claim here did not survive a check against the passage, so it was removed. ' +
  'There is nothing left here I can stand behind.'

/**
 * Stands in for a verifier reason that used delivery language.
 *
 * The checker is allowed to NAME the problem it found — "this reads like a
 * sermon aside" is a legitimate finding — but the words it uses to say so still
 * land inside the document, and assertNoPulpitLeak reads the whole document.
 * Without this substitution a correct reading dies because the fact-checker
 * described the failure accurately. The finding survives; the wording does not.
 */
const REASON_WITHHELD =
  'the wording of this finding was withheld — it used delivery language'

/* ------------------------------------------------------------------ *
 * sentence splitting
 * ------------------------------------------------------------------ */

/** Sentinel standing in for a period that must NOT end a sentence. */
const DOT = '\u0000'

/**
 * Protects the periods that are not sentence ends. Verse references are the
 * whole problem here: a naive split on /[.!?]\s/ shatters "Phil. 4:13" and
 * "v. 10" into fragments, and a fragment cannot be matched back into the body
 * to be removed. Everything protected here is restored before the sentence is
 * returned, so each sentence stays a verbatim substring of the original body.
 */
function protectPeriods(text) {
  return String(text)
    .replace(/\be\.g\./gi, `e${DOT}g${DOT}`)
    .replace(/\bi\.e\./gi, `i${DOT}e${DOT}`)
    .replace(/\bA\.D\./g, `A${DOT}D${DOT}`)
    .replace(/\bB\.C\.E\./g, `B${DOT}C${DOT}E${DOT}`)
    .replace(/\bB\.C\./g, `B${DOT}C${DOT}`)
    .replace(/\bC\.E\./g, `C${DOT}E${DOT}`)
    .replace(/\b(cf|etc|vs|approx|ca|al|St|Mr|Mrs|Dr|Prof)\./gi, `$1${DOT}`)
    // Any short token whose period is followed by a number: "v. 10", "vv. 3-4",
    // "ch. 2", "Phil. 4:13", "1 Cor. 8:6", "c. 60".
    .replace(/\b([A-Za-z]{1,6})\.(?=\s*\d)/g, `$1${DOT}`)
    // Single-letter initials: "J. B."
    .replace(/\b([A-Z])\.(?=\s+[A-Z])/g, `$1${DOT}`)
}

function restorePeriods(text) {
  return String(text).split(DOT).join('.')
}

/**
 * Splits a body into sentences. Each returned sentence is a verbatim substring
 * of the input (trimmed), which is what makes surgical removal possible later.
 */
function splitSentences(body) {
  if (typeof body !== 'string' || !body.trim()) return []
  const protectedText = protectPeriods(body)
  return protectedText
    // Closing quotes and brackets stay WITH the sentence they end. Splitting
    // them off left them orphaned at the front of the body whenever a refuted
    // sentence was cut — a stray " on the reader's page at the exact moment the
    // checker was doing its most visible work.
    .split(/(?<=[.!?]["'’”)\]]{0,3})\s+/)
    .map((s) => restorePeriods(s).trim())
    .filter((s) => s.length > 0)
}

/* ------------------------------------------------------------------ *
 * claim extraction
 * ------------------------------------------------------------------ */

/**
 * A sentence is a CHECKABLE claim if it asserts something about the world that
 * a reader could in principle look up: a date, a custom, a grammatical feature,
 * a vocabulary point, a structural relationship, a canonical connection.
 *
 * A sentence that only interprets ("this is the hinge of the paragraph") is not
 * checked — it is an argument, not a fact, and refuting arguments is not this
 * file's job.
 */
const FACTUAL_MARKERS = [
  // Dates, eras, counts, verse numbers.
  /\b\d/,
  /\b(?:first|second|third|fourth|fifth)[-\s]century\b/i,
  /\bcentur(?:y|ies)\b/i,
  // Language, grammar, vocabulary.
  /\b(?:greek|hebrew|aramaic|latin)\b/i,
  /\b(?:verb|noun|adjective|tense|aorist|perfect|imperfect|participle|imperative|indicative|subjunctive|infinitive|genitive|dative|accusative|nominative|vocative|conjunction|connector|conjunctive|particle|clause|syntax|grammar|grammatical|singular|plural|passive voice|active voice|word order|literally|translat\w*|renders?|rendered|root|cognate|idiom|vocabulary|term)\b/i,
  // Historical setting and culture.
  /\b(?:custom|customary|practice|ritual|roman|jewish|judean|galilean|greco|hellenis\w*|synagogue|temple|priest\w*|sacrific\w*|patron|client|household|slave|freedman|citizen|colony|garrison|prison|imprison\w*|exile|festival|passover|sabbath|census|coin|denarius|talent|marketplace|guild|trade|province|empire|emperor|governor)\b/i,
  // Authorship, audience, occasion.
  /\b(?:wrote|writing|written|author\w*|letter|epistle|audience|readers|recipients|addressed|dictat\w*|sent to|founded|planted|visited)\b/i,
  // Literary structure and canonical context.
  /\b(?:chapter|verse|verses|paragraph|preced\w*|immediately (?:before|after)|repeat\w*|parallel\w*|echo\w*|allud\w*|quotes?|quoting|cites?|citing|structure|chiasm|inclusio|refrain|narrative|poetry|prophec\w*|apocalyp\w*|wisdom|gospel|torah|prophets|psalms|covenant|exodus|creation|resurrection|fulfil\w*)\b/i,
]

/** Sentences that are instructions to the reader, not assertions about the text. */
const NOT_A_CLAIM = /^(?:if you|try |read |notice |ask yourself|look at)\b/i

/**
 * Interpretive judgments that the FACTUAL_MARKERS above catch by accident.
 *
 * "Verses 8-10 are the summary of that rescue" trips the literary-structure
 * marker on the word "verses" and gets shipped to the verifier as if it were a
 * checkable datum. It is not — it is a reading. Left in, the verifier returns
 * UNVERIFIABLE and the reader's "what I couldn't answer" section fills with
 * shrugs about the writer's own analysis, burying the one genuine crux.
 *
 * The model is also told to answer INTERPRETIVE for these (see the prompt), so
 * this is belt-and-braces: screen the obvious ones for free rather than paying
 * tokens to have them classified.
 */
const INTERPRETIVE_SHAPE = new RegExp(
  [
    // characterizations of the text's construction or effect
    '\\b(?:are|is|sits?|stands?|serves?|functions?|works?|reads?|acts?|forms?|marks?)\\s+(?:as|at|in|like)?\\s*(?:the\\s+|a\\s+|an\\s+)?(?:summary|hinge|pivot|climax|turning point|centerpiece|heart|core|key|bridge|capstone|foundation|backbone|crux|fulcrum)\\b',
    '\\bon purpose\\b', '\\bdeliberately\\b', '\\bintentionally\\b',
    '\\bthe (?:whole )?point (?:is|here)\\b',
    '\\bwhat (?:the author|paul|he|she|they|it) (?:is|are) (?:doing|saying|after|driving at)\\b',
    '\\b(?:compressed|dense|loaded|packed|charged)\\b',
    '\\bnot (?:just|merely|only) (?:informing|stating|saying|telling)\\b',
    '\\bis (?:dismantling|rebuilding|reframing|undoing|installing|removing)\\b',
  ].join('|'),
  'i'
)

/**
 * @param {string} sentence
 * @param {object} [opts]
 * @param {number}  [opts.minChars]        length floor for a sentence worth checking
 * @param {boolean} [opts.requireMarker]   demand a factual marker before checking
 *
 * Both options exist for the situation block and both defaults are the old
 * behaviour. The floor drops there because situation.when is routinely under 30
 * characters — "around AD 57, from Corinth" is 26 — and a manufactured year is
 * the most checkable fabrication in the whole document; a length test that
 * skips it is a hole, not a saving. The marker requirement is dropped for the
 * same reason: those fields are DEFINITIONALLY historical assertion, so
 * demanding a keyword before believing that is circular.
 */
function isCheckableSentence(sentence, opts = {}) {
  const minChars = Number.isFinite(opts.minChars) ? opts.minChars : MIN_CLAIM_CHARS
  const requireMarker = opts.requireMarker !== false
  if (sentence.length < minChars) return false
  if (sentence.endsWith('?')) return false
  if (NOT_A_CLAIM.test(sentence)) return false
  if (INTERPRETIVE_SHAPE.test(sentence)) return false
  if (!requireMarker) return true
  return FACTUAL_MARKERS.some((re) => re.test(sentence))
}

/* ------------------------------------------------------------------ *
 * grounded claims — the vault layer
 *
 * WHY THIS EXISTS
 * pipeline.js now hands the generator notes distilled from the pastor's own
 * chapter-by-chapter work. Those notes are SOURCED. This verifier is a general
 * model with general recall, and on exactly the material the notes cover, the
 * general recall is the weaker of the two. Left alone, the check does real
 * damage: a note says Revelation was written c. AD 95 under Domitian, the model
 * writes that down, and a verifier reaching for its own memory of the early-date
 * argument marks it REFUTED and cuts a true sentence off the reader's page. The
 * grounding feature would then make the document WORSE than no grounding at all.
 *
 * WHAT THIS DOES INSTEAD — and what it deliberately does NOT do
 * A grounded claim is not exempted. Exemption would be the easy version and the
 * wrong one: the model is perfectly capable of taking a good note and garbling
 * it — moving a date, hardening a "commonly misread as" into an assertion,
 * turning a documented custom into a universal one. So the claim still goes to
 * the checker; what CHANGES is the question the checker is asked. For a grounded
 * claim the question is not "can you independently confirm this?" but "is this
 * FAITHFUL to the note it came from?", with the note supplied alongside it.
 *
 * The one asymmetry is on UNVERIFIABLE. For an ungrounded claim, "I cannot
 * confirm this" is a real finding and the reader is told. For a grounded claim
 * it is not a finding at all — it means the checker could not independently
 * reproduce something that was never its own to verify, which is the expected
 * result for most of the pack. Those are recorded as GROUNDED and kept silent.
 * REFUTED is still honored in full, because REFUTED against a supplied note
 * means the model garbled the note, which is precisely the failure worth
 * catching.
 *
 * The match is done in code, conservatively. A claim is only treated as grounded
 * when it shares a strong majority of its distinctive vocabulary with one note.
 * A missed match costs nothing — the claim is checked the way it always was.
 * ------------------------------------------------------------------ */

/**
 * Words too common to signal that two sentences are about the same thing.
 * Short tokens are dropped by length, so this only needs the frequent long ones.
 */
const MATCH_STOPWORDS = new Set([
  'that', 'this', 'these', 'those', 'with', 'from', 'they', 'them', 'their',
  'there', 'here', 'what', 'when', 'which', 'while', 'would', 'could', 'should',
  'been', 'were', 'have', 'has', 'had', 'into', 'onto', 'over', 'under', 'than',
  'then', 'also', 'about', 'after', 'before', 'because', 'being', 'both', 'each',
  'other', 'same', 'such', 'through', 'where', 'whose', 'itself', 'himself',
  'very', 'more', 'most', 'some', 'only', 'just', 'like', 'says', 'said', 'said',
  'does', 'did', 'not', 'but', 'and', 'the', 'text', 'passage', 'verse', 'verses',
  'reader', 'readers', 'author', 'writer', 'people', 'thing', 'things', 'written',
  'revelation', 'chapter',
])

/**
 * The distinctive vocabulary of a sentence: words of four letters or more, plus
 * every number. Numbers are kept at any length on purpose — a date is the single
 * most load-bearing token a historical note carries, and "95" would otherwise be
 * thrown away for being short.
 */
function contentTokens(text) {
  const out = new Set()
  const words = String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) || []
  for (const w of words) {
    if (/^\d+$/.test(w)) { out.add(w); continue }
    if (w.length < 4) continue
    if (MATCH_STOPWORDS.has(w)) continue
    out.add(w)
  }
  return out
}

/** A claim must share at least this many distinctive tokens with a note. */
const GROUNDING_MIN_SHARED = 2

/** ...and that share must be at least this much of the claim's own vocabulary. */
const GROUNDING_MIN_RATIO = 0.25

function taggedNote(note) {
  const raw = String(note || '').trim()
  const match = raw.match(/^\[(BACKGROUND|INTERPRETIVE|DISPUTED)\]\s*/i)
  return {
    status: match ? match[1].toUpperCase() : 'BACKGROUND',
    text: match ? raw.slice(match[0].length).trim() : raw,
    raw,
  }
}

/**
 * Finds the supplied note a claim was most likely written from.
 *
 * Deliberately strict. The ratio is measured against the CLAIM's vocabulary, not
 * the note's, so a sentence that takes a note and piles invented detail on top
 * of it falls below the bar and gets checked normally — which is the right
 * answer, because the invented half is exactly what needs checking.
 *
 * @returns {{note: string, shared: number, ratio: number}|null}
 */
function matchNote(claimText, notes) {
  if (!Array.isArray(notes) || notes.length === 0) return null
  const claimTokens = contentTokens(claimText)
  if (claimTokens.size === 0) return null

  let best = null
  for (const rawNote of notes) {
    if (typeof rawNote !== 'string' || !rawNote.trim()) continue
    const parsed = taggedNote(rawNote)
    const noteTokens = contentTokens(parsed.text)
    let shared = 0
    const sharedTokens = []
    for (const t of claimTokens) {
      if (!noteTokens.has(t)) continue
      shared += 1
      sharedTokens.push(t)
    }
    const ratio = shared / claimTokens.size
    if (shared < GROUNDING_MIN_SHARED || ratio < GROUNDING_MIN_RATIO) continue
    if (!sharedTokens.some((token) => /^\d+$/.test(token) || token.length >= 7)) continue
    if (!best || ratio > best.ratio || (ratio === best.ratio && shared > best.shared)) {
      best = {
        note: parsed.text,
        rawNote: parsed.raw,
        status: parsed.status,
        shared,
        ratio,
      }
    }
  }
  return best
}

/** The vault notes pipeline.js put in the payload, or [] when there were none. */
function groundingNotesFrom(payload) {
  const notes = payload?.[GROUNDING_KEY]?.notes
  return Array.isArray(notes) ? notes.filter((n) => typeof n === 'string' && n.trim()) : []
}

/* ------------------------------------------------------------------ *
 * claim extraction
 * ------------------------------------------------------------------ */

/**
 * Pulls every checkable factual claim out of the six steps and the situation
 * block.
 *
 * Claim ids are `${step}-s${sentenceIndex}` — stable across runs for the same
 * document, which is what lets the verifier's verdicts be matched back and what
 * lets a test build a fake response without guessing. Situation claims use the
 * same scheme with the block's own step name ("situation.when-s0"), so ids stay
 * unique and stay parseable by eye, and readStepBody/writeStepBody resolve
 * either kind of step without this file knowing the block's shape.
 *
 * @param {object} doc a validated PlainReadDoc
 * @param {object} [options]
 * @param {string[]} [options.vaultNotes] notes supplied to the generator; a
 *   claim traced to one of them is marked grounded (see the grounding note above)
 * @returns {Array<{id:string, step:string, index:number, text:string,
 *   grounded:boolean, note:string|null}>}
 */
function extractClaims(doc, options = {}) {
  const vaultNotes = Array.isArray(options.vaultNotes) ? options.vaultNotes : []
  const seen = new Set()

  const collect = (step, body, checkOpts, into) => {
    const sentences = splitSentences(body)
    sentences.forEach((text, index) => {
      if (!isCheckableSentence(text, checkOpts)) return
      const dedupeKey = text.toLowerCase()
      if (seen.has(dedupeKey)) return
      seen.add(dedupeKey)
      into.push({ id: `${step}-s${index}`, step, index, text })
    })
  }

  const stepClaims = []
  for (const step of CHECKED_STEPS) {
    collect(step, readStepBody(doc, step), {}, stepClaims)
  }

  const situationClaims = []
  for (const step of SITUATION_STEPS) {
    collect(
      step,
      readStepBody(doc, step),
      { minChars: SITUATION_MIN_CLAIM_CHARS, requireMarker: false },
      situationClaims
    )
  }

  // Over the cap, the lowest-risk steps lose claims first: CHECKED_STEPS is
  // already in descending risk order, so a stable slice does the right thing.
  // The situation block gets a reserved share rather than competing for the
  // tail, because it is the newest and least-checked surface in the document —
  // but it is appended, never prepended, so the existing ordering guarantee
  // (the setting step is checked first) still holds.
  const reserved = Math.min(situationClaims.length, SITUATION_RESERVE)
  const claims = [
    ...stepClaims.slice(0, Math.max(0, MAX_CLAIMS - reserved)),
    ...situationClaims,
  ].slice(0, MAX_CLAIMS)

  for (const claim of claims) {
    const match = vaultNotes.length ? matchNote(claim.text, vaultNotes) : null
    claim.grounded = Boolean(match)
    claim.note = match ? match.note : null
    claim.groundingStatus = match ? match.status : null
  }

  return claims
}

/* ------------------------------------------------------------------ *
 * the verifier prompt
 * ------------------------------------------------------------------ */

const VERIFIER_SYSTEM = `
You are a hostile fact-checker. You are reading claims that another model wrote
about a Bible passage. Your only job is to try to REFUTE them.

You are not here to be fair to the writer and you are not here to be helpful.
Assume the claims were produced by a system that fabricates confident detail,
because that is exactly what it does. A reader is going to act on these
sentences and has no way to check them. You are the only check.

FIRST, THE THRESHOLD QUESTION: IS THIS EVEN A FACTUAL CLAIM?

Only EMPIRICAL claims get verified — statements that could in principle be shown
true or false: what a text says, what a word is, what a custom was, when
something happened, who wrote to whom.

A READING is not an empirical claim. "Verses 8-10 are the summary of that
rescue." "These three verses are dense on purpose." "This sits at a hinge
between two sections." "The author is dismantling their pride." Those are
interpretive judgments about significance, emphasis, structure, or intent. They
are the writer's job. They are not yours to confirm, and they are NOT
uncertainty a reader needs warned about. Flagging them as unconfirmed is a
FAILURE of this check: it buries the one real crux under a pile of shrugging,
and it makes an accurate document look unsure of itself.

THE FOUR VERDICTS
- INTERPRETIVE — not an empirical claim at all. A judgment about meaning,
  significance, structure, emphasis, or authorial intent. Use this freely and
  without hesitation; it is the correct verdict for a large share of good
  sentences. It changes nothing on the page and warns the reader about nothing.
- CONFIRMED — an empirical claim you can show is true from the passage text in
  front of you, or that is background so securely known a careful person would
  not dispute it (the Roman empire existed; Greek has an aorist tense).
  CONFIRMED must be EARNED. It is not the fallback.
- REFUTED — the claim is false, contradicts the passage in front of you, or is
  the kind of specific detail that gets invented: a named custom, a precise
  date, a grammatical feature, a claimed word or connector that is not actually
  in the text. If you cannot verify a specific mechanical detail like that, it
  is REFUTED, not UNVERIFIABLE. Inventing a grammatical feature is the single
  worst failure this check exists to catch.
- UNVERIFIABLE — an EMPIRICAL claim that is plausible and probably fine, but
  that you cannot check from the passage or from secure background knowledge.
  Reserve this for real factual assertions: a historical custom, a date, a
  claim about what an original audience knew or practiced. If you are reaching
  for UNVERIFIABLE on a sentence about what the passage MEANS or how it is
  BUILT, the answer is INTERPRETIVE instead.

NEVER default to CONFIRMED. When you cannot confirm, the answer is a finding.

GROUNDED CLAIMS — A DIFFERENT QUESTION
Some claims arrive with a SOURCE NOTE attached. Those sentences were written
from supplied reference material, not from the writer's memory. The note is the
authority. Your own recall is not, and where the two disagree the note wins.

For a grounded claim do not ask "can I confirm this independently?" — you often
cannot, and that is expected. Ask ONE question: is the claim FAITHFUL to the
note?
- Faithful, or a plain restatement of what the note says -> CONFIRMED.
- Not faithful -> REFUTED. This is the failure that matters here: a date moved,
  a number changed, a place swapped, a "commonly misread as X" turned into an
  assertion that X is true, a documented local custom widened into a universal
  one, or detail added that the note does not carry.
Do NOT mark a grounded claim REFUTED because it disagrees with what you
remember. If the note says a text was written at a certain time, under a certain
ruler, in a certain place, that IS the answer, even if you would have said
otherwise. Marking it REFUTED on your own recollection deletes a sourced fact
from a reader's page and replaces it with your memory. That is the worst
possible outcome of this check.

SOURCE NOTE STATUS CHANGES THE RULE:
- BACKGROUND may support a careful factual statement.
- INTERPRETIVE supports a qualified reading, not a claim that the passage
  explicitly settles the interpretation.
- DISPUTED never supports a flat conclusion. If a claim states a DISPUTED note
  as settled fact, mark it REFUTED even when the words resemble the note.

FINDING NOTHING WRONG IS A VALID AND COMMON OUTCOME. Most well-written steps
are accurate. Do not manufacture a finding to look useful — a false REFUTED
deletes a true sentence from a reader's page, which is its own harm. But a
plausible-sounding historical or cultural detail you cannot verify IS a finding.
Both errors are real. Judge each claim on its own.

WHAT TO CHECK HARDEST
1. Grammar and vocabulary claims. Does the passage in front of you actually
   contain the word, connector, tense, or construction being described? If the
   claim says a verse "opens with a connector" and the verse does not, that is
   REFUTED. Check the text, not your impression of the text.
2. Specific historical or cultural customs. A named practice with confident
   detail and no way for a reader to check it is the highest-risk sentence type
   in the document.
3. Structural claims about what comes before or after. Verify against the
   passage supplied.
4. Canonical claims — that this passage quotes, echoes, or fulfills another one.
5. Audience claims in Revelation. The seven churches are not one uniformly
   persecuted audience. Reject a universal "Caesar is Lord" test, universal
   trade-guild exclusion, or a claim that all recipients were frightened or
   under lethal pressure unless the supplied source establishes that scope.
6. Genre claims in apocalyptic. Calling imagery symbolic does not settle the
   chronology, make every number symbolic, or prove that a passage is "not a
   timeline." Treat those as interpretations, and reject them when written as
   neutral facts.
7. Reuse of older Scripture. Ezekiel's Gog and Magog are a specific prophetic
   image. Reject a claim that they already meant "every enemy everywhere" unless
   it is explicitly qualified as one reading of John's reuse. Also reject an
   unsupported claim that "by John's time" the names had become shorthand for
   every enemy.
8. Revelation 20:9-10 subjects. Fire consumes the gathered nations; Satan is
   thrown into the lake of fire. Reject any sentence that makes Satan, the
   deceiver, or the power behind the deception the one consumed by the falling
   fire.
9. Revelation 20:11-15 participants. The passage says "the dead, great and
   small." Reject an unqualified expansion to every person, everyone who ever
   died, or all humanity.
10. Deeds and the book of life. The passage places both in the scene but does
   not say deeds are merely evidence while the book decides or overrides the
   outcome. Treat that relationship as interpretation, not neutral fact.
11. Audience knowledge. Reject a claim that all original readers knew one exact
   referent for the beast or false prophet.

OUTPUT RULES FOR ANY TEXT YOU WRITE
- Never name a scholar, commentator, author, or book. Not one. Positions and
  traditions may be named; people may not.
- Plain, direct, short sentences. Concrete nouns. Never churchy. No sermon
  language of any kind — no outlines, no points, no illustrations, no delivery
  notes, no audience.
- Every reason is ONE line. No hedging paragraphs.

Return ONE JSON object. No markdown fence, no preamble.
{
  "verdicts": [
    {
      "id": "<the exact claim id you were given>",
      "verdict": "INTERPRETIVE" | "CONFIRMED" | "UNVERIFIABLE" | "REFUTED",
      "reason": "<one line, plain>",
      "correctedStep": "<REFUTED only: the FULL rewritten body of that step with the false statement removed or corrected, same plain voice, nothing else changed. null otherwise>"
    }
  ]
}

Return exactly one verdict per claim id you were given. No extra ids.
`.trim()

function buildVerifyPrompt(claims, payload) {
  const reference = payload?.reference ?? 'unknown reference'
  const rawText = payload?.passageText
  const passage =
    typeof rawText === 'string' && rawText.trim()
      ? rawText.trim().slice(0, MAX_PASSAGE_CHARS)
      : '(passage text was not supplied — check these claims against securely known background only, and be harder on anything you cannot check)'

  // A grounded claim is printed WITH the note it was written from, immediately
  // under it. The pairing has to be local: a list of notes at the top of the
  // prompt and a list of claims at the bottom leaves the checker to guess which
  // note governs which sentence, and it will guess wrong on the ones that
  // matter. Ungrounded claims are printed exactly as before.
  const claimLines = claims
    .map((c) => {
      const head = `[${c.id}] (${c.step}) ${c.text}`
      if (!c.grounded || !isNonEmptyString(c.note)) return head
      const status = c.groundingStatus || 'BACKGROUND'
      return `${head}\n    SOURCE NOTE STATUS: ${status}\n    SOURCE NOTE (judge faithfulness to this, not your own recall): ${c.note.trim()}`
    })
    .join('\n')

  const groundedCount = claims.filter((c) => c.grounded).length
  const groundedLine = groundedCount
    ? `\n${groundedCount} of these claims carry a SOURCE NOTE. For those, the note is the authority — see the grounded-claims rule.\n`
    : ''

  return (
    `PASSAGE UNDER CHECK\n` +
    `Reference: ${reference}\n\n` +
    `Text:\n${passage}\n\n` +
    `CLAIMS TO CHECK (${claims.length})\n${groundedLine}${claimLines}\n\n` +
    `Return one verdict object per claim id above.`
  )
}

/* ------------------------------------------------------------------ *
 * verdict normalization
 * ------------------------------------------------------------------ */

const VERDICTS = ['INTERPRETIVE', 'CONFIRMED', 'UNVERIFIABLE', 'REFUTED']

function normalizeVerdict(value) {
  const v = String(value ?? '').trim().toUpperCase()
  return VERDICTS.includes(v) ? v : null
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function oneLine(value) {
  if (!isNonEmptyString(value)) return null
  return value.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function truncate(text, max) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

/**
 * The reader-facing line for a claim the checker could not confirm.
 *
 * TWO THINGS THIS FIXES, both found by reading real generated output rather
 * than a fixture. Genesis 15 shipped six of these and Ephesians 2 shipped two.
 *
 * 1. THE CHECKER'S `reason` USED TO BE PRINTED HERE. It is written by a second
 *    model for an engineering log, and it reads like one — real examples off
 *    the wire: "(A general historical claim about ancient prisons not checkable
 *    from the passage.)", "(The Hebrew verb and its accounting sense cannot be
 *    confirmed from the English text alone.)". That is apparatus, not a man
 *    explaining, and it discloses how the tool works to a reader who never
 *    asked. It also told him nothing he could act on — he already has the
 *    sentence. The reason stays in verification.notes, which is the log, and
 *    the log is where it belongs. This is the same call the file already made
 *    for a WITHHELD reason, applied to all of them for the same stated reason.
 *
 * 2. "Could not confirm: X" OVERSTATES THE VERDICT. The prompt defines
 *    UNVERIFIABLE as a claim that is "plausible and probably fine" but cannot
 *    be checked against the passage — REFUTED is the verdict for something
 *    likely false. Printed as a bare "could not confirm", a reader with no way
 *    to adjudicate reads it as "this may be invented". Genesis proved the cost:
 *    the document teaches covenant-cutting as the key the chapter is unreadable
 *    without, and then the bottom of the same page appeared to disown it.
 *
 * What it must NOT do is soften. The block exists to catch invented history and
 * an unchecked claim still has to be flagged as unchecked. So the line keeps the
 * claim verbatim (the reader has to know WHICH sentence), keeps the admission
 * first, and adds the one thing that was missing: what to do with it.
 */
function unknownLineFor(claimText) {
  const claim = String(claimText ?? '').replace(/\s+/g, ' ').trim()
  return (
    `I could not check this one: "${claim}" ` +
    'Take it as background, not as something the passage itself settles.'
  )
}

/**
 * True when a candidate string is free of pulpit language AND does not
 * disclose the prompt's private framing.
 *
 * The fence check belongs here for the same reason the pulpit check does: the
 * verifier is a second model call that sees the document, and its reason
 * strings are appended to doc.unknowns, which the reader reads. A verifier
 * that helpfully wrote "this contradicts the doctrinal fence" would otherwise
 * hand a stranger the fact that the app encodes one named man's convictions.
 * Screened, never thrown — a throw here escapes the pipeline's retry.
 */
function isPulpitClean(text) {
  try {
    assertNoPulpitLeak({ probe: text })
    assertNoFenceDisclosure({ probe: text })
    return true
  } catch (err) {
    if (err instanceof PlainReadValidationError) return false
    throw err
  }
}

/**
 * True when a candidate string does not contradict the doctrinal fence.
 *
 * This runs as a SCREEN, never as a throw. validatePlainRead has already
 * doctrine-checked the document, but that ran BEFORE this pass — so a rewrite
 * or a reason authored by the verifier is model text that has never met the
 * fence. Screening it here keeps verify.js's contract intact: the one thing it
 * throws on is a pulpit leak. A checker that correctly reports "this says the
 * return already happened" must not kill a good reading, which is why the
 * finding survives as a placeholder instead.
 */
function isDoctrineClean(text) {
  try {
    assertNoDoctrineLeak({ probe: text })
    return true
  } catch (err) {
    if (err instanceof PlainReadValidationError) return false
    throw err
  }
}

/** True when a candidate is free of pulpit language AND of fence breaks. */
function isSafeToEmit(text) {
  return isPulpitClean(text) && isDoctrineClean(text)
}

/** Returns the text, or the withheld placeholder if it is not safe to emit. */
function safeReason(text) {
  if (!isNonEmptyString(text)) return null
  return isSafeToEmit(text) ? text : REASON_WITHHELD
}

/* ------------------------------------------------------------------ *
 * surgical sentence removal
 * ------------------------------------------------------------------ */

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}


/**
 * Removes one sentence from a body. Returns { ok, body }.
 *
 * Tries a verbatim match first (sentences came out of this body, so it normally
 * hits), then a whitespace-tolerant match in case the body was reflowed.
 */
function removeSentence(body, sentence) {
  const idx = body.indexOf(sentence)
  if (idx !== -1) {
    const next = body.slice(0, idx) + body.slice(idx + sentence.length)
    return { ok: true, body: next.replace(/[ \t]{2,}/g, ' ').replace(/\s+\n/g, '\n').trim() }
  }
  const loose = new RegExp(
    sentence.trim().split(/\s+/).map(escapeRegExp).join('\\s+'),
    'g'
  )
  if (loose.test(body)) {
    const next = body.replace(loose, '')
    return { ok: true, body: next.replace(/[ \t]{2,}/g, ' ').replace(/\s+\n/g, '\n').trim() }
  }
  return { ok: false, body }
}

/* ------------------------------------------------------------------ *
 * applying verdicts
 * ------------------------------------------------------------------ */

function emptyVerification(status) {
  return {
    status,
    model: status === 'ok' ? VERIFY_MODEL : null,
    promptVersion: VERIFY_PROMPT_VERSION,
    checked: 0,
    confirmed: 0,
    interpretive: 0,
    unverifiable: 0,
    refuted: 0,
    missing: 0,
    // Claims that traced to a supplied vault note and were kept on that basis.
    // Counted separately from `confirmed` so the log never claims the checker
    // independently verified something it only found faithful to a note.
    grounded: 0,
    notes: [],
  }
}

const QUALIFIED_DISPUTED_CLAIM =
  /\b(?:some|other|another|one)\s+(?:readers?|views?|traditions?|interpretations?)\b|\b(?:may|might|could|perhaps|possibly|disputed|debated|uncertain|does not settle|doesn't settle|leaves open)\b|\b(?:amillennial|premillennial|postmillennial|dispensational|idealist|preterist|futurist|conditionalist)\s+(?:reading|view|readers?|tradition|interpretation)\b/i

/** The record a UI should render when the verify pass was deliberately skipped. */
function skippedVerification() {
  return emptyVerification('skipped')
}

/**
 * Applies a verdict list to a document. Pure and synchronous — this is the half
 * of the verifier that a test can exercise with no API key at all.
 *
 * REFUTED  -> the offending sentence is cut from the step body if it can be cut
 *             cleanly; otherwise the whole body is replaced by the verifier's
 *             corrected version; otherwise the body is blanked with an honest
 *             notice. A known-false sentence never stays on the page.
 * UNVERIFIABLE -> the text is KEPT and the claim is appended to doc.unknowns in
 *             plain language, so the reader sees exactly what could not be
 *             confirmed instead of trusting all six steps equally.
 * CONFIRMED -> nothing changes.
 *
 * A claim the verifier failed to return a verdict for is recorded as
 * UNVERIFIABLE for the record, but is NOT appended to unknowns: a missing
 * verdict is a plumbing failure on our side, not a finding about the text, and
 * flooding the reader's unknowns list with our own bugs is dishonest in the
 * other direction.
 *
 * @returns {{doc: object, verification: object}}
 */
function applyVerdicts(doc, claims, rawVerdicts) {
  const verification = emptyVerification('ok')

  // First verdict per id wins; unknown ids are dropped.
  const claimIds = new Set(claims.map((c) => c.id))
  const byId = new Map()
  for (const raw of Array.isArray(rawVerdicts) ? rawVerdicts : []) {
    if (!raw || typeof raw !== 'object') continue
    const id = String(raw.id ?? '').trim()
    if (!claimIds.has(id) || byId.has(id)) continue
    const verdict = normalizeVerdict(raw.verdict)
    if (!verdict) continue

    // Every string the verifier authored is screened HERE, at the one boundary
    // where its text enters the document. Downstream code can then treat these
    // fields as safe. Screening only the rewrite was not enough: the reason
    // lands in verification.notes, notes are part of the document, and
    // assertNoPulpitLeak reads the whole document — so a checker that correctly
    // reported "this reads like a sermon aside" threw, and that throw escapes
    // plainRead's validation retry and kills a reading that was fine.
    const rawReason = oneLine(raw.reason)
    const reasonWithheld = Boolean(rawReason) && !isSafeToEmit(rawReason)

    byId.set(id, {
      verdict,
      reason: reasonWithheld ? REASON_WITHHELD : rawReason,
      reasonWithheld,
      correctedStep: isNonEmptyString(raw.correctedStep) ? raw.correctedStep.trim() : null,
    })
  }
  verification.checked = byId.size

  let next = { ...doc, work: { ...doc.work } }
  const unknowns = Array.isArray(doc.unknowns) ? [...doc.unknowns] : []
  const refutedByStep = new Map()
  let unknownsAdded = 0

  for (const claim of claims) {
    const decided = byId.get(claim.id)
    let verdict = decided?.verdict ?? 'UNVERIFIABLE'
    let reason = decided?.reason ?? (decided ? null : 'the check returned no verdict for this claim')

    // A note explicitly classified DISPUTED cannot authorize a settled claim,
    // even if the same model that wrote the sentence later votes to keep it.
    // This is the code backstop against correlated generator/verifier error.
    if (
      claim.groundingStatus === 'DISPUTED' &&
      !QUALIFIED_DISPUTED_CLAIM.test(claim.text)
    ) {
      verdict = 'REFUTED'
      reason = 'a disputed source note was stated as a settled conclusion'
    }

    if (!decided) {
      verification.status = 'failed'
      verification.missing += 1
    }

    // An interpretive judgment is not a factual claim and never reaches the
    // reader as uncertainty. Recorded for the log, invisible on the page.
    if (verdict === 'INTERPRETIVE') {
      verification.interpretive += 1
      verification.notes.push({
        step: claim.step,
        verdict,
        claim: claim.text,
        reason,
        grounded: Boolean(claim.grounded),
        action: 'kept',
        summary: `${claim.step}: interpretive, not checked — ${truncate(claim.text, 110)}`,
      })
      continue
    }

    if (verdict === 'CONFIRMED') {
      verification.confirmed += 1
      verification.notes.push({
        step: claim.step,
        verdict,
        claim: claim.text,
        reason,
        grounded: Boolean(claim.grounded),
        action: 'kept',
        summary: `${claim.step}: ${claim.grounded ? 'confirmed against the supplied note' : 'confirmed'} — ${truncate(claim.text, 110)}`,
      })
      continue
    }

    if (verdict === 'UNVERIFIABLE') {
      // A GROUNDED claim the checker could not independently confirm is not a
      // finding. The claim came from supplied sourced material; "I could not
      // reproduce it from my own knowledge" is a fact about the checker, not
      // about the text, and printing it under "what I could not answer" would
      // teach a reader to distrust the most reliable sentences in the document.
      // Recorded in full for the log, silent on the page. Note that REFUTED is
      // NOT redirected here — a grounded claim can still be garbled, and that
      // verdict is applied exactly like any other.
      if (claim.grounded) {
        verification.grounded += 1
        verification.notes.push({
          step: claim.step,
          verdict: 'GROUNDED',
          claim: claim.text,
          reason,
          grounded: true,
          action: 'kept',
          summary: `${claim.step}: grounded in a supplied note, not independently checkable — ${truncate(claim.text, 110)}`,
        })
        continue
      }

      verification.unverifiable += 1
      verification.notes.push({
        step: claim.step,
        verdict,
        claim: claim.text,
        reason,
        grounded: false,
        action: 'kept',
        summary: `${claim.step}: could not confirm — ${truncate(claim.text, 110)}`,
      })

      // Only a real model verdict earns a line in the reader's unknowns.
      if (decided && unknownsAdded < MAX_UNKNOWNS_ADDED) {
        const line = unknownLineFor(claim.text)
        if (!unknowns.some((u) => u.trim() === line.trim())) {
          unknowns.push(line)
          unknownsAdded += 1
        }
      }
      continue
    }

    // REFUTED — collected per FIELD so a field with two bad sentences is fixed
    // once. Keyed on the claim's path, which is the step body for a work claim
    // and the field itself for a situation claim.
    //
    // A grounded claim lands here like any other. The checker was asked whether
    // the sentence is faithful to the note it came from, and REFUTED is its
    // answer that the model garbled sourced material — the one failure that a
    // grounding feature makes MORE likely, not less, because a supplied note
    // gives a model specific detail to get subtly wrong.
    verification.refuted += 1
    // Keyed on the STEP NAME, which is the one address both kinds of claim
    // already carry. An earlier pass grouped on a claim.path array and resolved
    // it with getAtPath / withPathValue -- but claims are built in extractClaims
    // and are never given a .path, so the fallback ['work', claim.step, 'body']
    // ran every time, which is the wrong address for a situation claim, and
    // neither helper was ever defined in this file. Any REFUTED verdict threw
    // ReferenceError and took the whole verification down with it.
    // situation.js's readStepBody / writeStepBody already resolve both kinds of
    // step without this file knowing the block's shape, and extractClaims reads
    // through them, so the write side now goes back out the same door.
    if (!refutedByStep.has(claim.step)) refutedByStep.set(claim.step, { step: claim.step, entries: [] })
    refutedByStep.get(claim.step).entries.push({
      claim,
      reason,
      correctedStep: decided?.correctedStep ?? null,
    })
  }

  for (const { step, entries } of refutedByStep.values()) {
    const original = String(readStepBody(next, step) ?? '')
    let body = original
    let allCut = true
    for (const entry of entries) {
      const result = removeSentence(body, entry.claim.text)
      if (!result.ok) { allCut = false; break }
      body = result.body
    }

    const strippedIsUsable = allCut && body.trim().length >= MIN_BODY_CHARS
    const correction = entries.map((e) => e.correctedStep).find(isNonEmptyString) ?? null
    // A rewrite REPLACES a step body the reader will read, so it is screened
    // against the fence as well as against delivery language. Validation ran
    // before this pass; this text has never met either check.
    const correctionUsable = isNonEmptyString(correction) && isSafeToEmit(correction)

    let finalBody
    let action
    if (strippedIsUsable) {
      finalBody = body
      action = 'removed'
    } else if (correctionUsable) {
      finalBody = correction.trim()
      action = 'replaced'
    } else {
      // A blanked situation FACT ROW gets nothing, not a notice.
      //
      // `when` and `where` render as short mono lines beside a 44px label, and
      // `when` renders a second time, on one nowrap line, in the card's
      // collapsed header. Writing a 120-character sentence into either of them
      // puts a paragraph inside a field built for "around AD 57, from Corinth"
      // — and when `when` and `pressure` are both refuted, which is the normal
      // case for a fabricated setting, the reader gets the SAME notice twice on
      // one card. SituationCard already skips an empty field, so an empty
      // string is the shape it was built for.
      //
      // It is also what the rest of the document already does: the reader view
      // states outright that the claim check is invisible and that flagged
      // claims are cut before the document exists. A notice in a fact row is
      // the only place that contract was broken. `pressure` is a prose
      // paragraph, so the notice stays there and still tells the reader
      // something was removed. The full record is in verification.notes either
      // way.
      const blankedField = situationField(step)
      if (blankedField === 'when' || blankedField === 'where') {
        finalBody = ''
      } else {
        finalBody = isSituationStep(step) ? STRIPPED_FIELD : STRIPPED_BODY
      }
      action = 'blanked'
      if (isNonEmptyString(correction) && !correctionUsable) {
        verification.notes.push({
          step,
          verdict: 'REFUTED',
          claim: null,
          reason: 'the rewrite offered by the check was discarded — it contained delivery language',
          action: 'rejected-rewrite',
          summary: `${step}: rewrite rejected (delivery language)`,
        })
      }
    }

    next = writeStepBody(next, step, finalBody)

    for (const entry of entries) {
      verification.notes.push({
        step,
        verdict: 'REFUTED',
        claim: entry.claim.text,
        reason: entry.reason,
        grounded: Boolean(entry.claim.grounded),
        action,
        summary: `${step}: refuted, ${action} — ${truncate(entry.claim.text, 110)}`,
      })
    }
  }

  next.unknowns = unknowns
  next.verification = verification

  // A rewrite from the verifier must never be able to introduce pulpit language
  // or disclose the prompt's private framing. Each candidate was screened
  // above; this is the belt on top of the braces, and it covers the unknowns
  // lines too.
  assertNoPulpitLeak(next)
  assertNoFenceDisclosure(next)

  return { doc: next, verification }
}

/* ------------------------------------------------------------------ *
 * main entry
 * ------------------------------------------------------------------ */

/**
 * Runs the adversarial second pass over a validated PLAIN READ document.
 *
 * Never throws on a verification failure. A model error, a malformed response,
 * or a timeout degrades to doc.verification.status === 'failed' with the
 * document otherwise intact — losing a good reading because the checker fell
 * over would be a worse outcome than shipping it marked unverified. The one
 * case that DOES throw is a pulpit leak in the final document, which is a bug,
 * not a degraded result, and is handled the same way validate.js handles it.
 *
 * @param {object}   opts
 * @param {object}   opts.doc           a document that already passed validatePlainRead
 * @param {object}   opts.payload       buildPayload() output — supplies reference + passageText
 * @param {string}   opts.apiKey
 * @param {function} opts.createClient  (apiKey) => Anthropic client
 * @param {function} [opts.retry]       withRetry from main.js
 * @param {function} [opts.parse]       parseModelJSON from main.js
 * @returns {Promise<object>} the document, with verification applied
 */
async function verifyPlainRead({ doc, payload, apiKey, createClient, retry, parse, onUsage }) {
  if (!doc || typeof doc !== 'object') throw new Error('verifyPlainRead: doc is required')

  // The notes pipeline.js supplied to the generator, if any. They travel on the
  // payload, which this function already receives — no new plumbing, and no
  // require of pipeline.js from here (that would be a cycle).
  const vaultNotes = groundingNotesFrom(payload)
  const claims = extractClaims(doc, { vaultNotes })
  if (claims.length === 0) {
    // Nothing checkable — a legitimate outcome on a short or purely
    // interpretive reading, and honest to record as such.
    return { ...doc, verification: emptyVerification('ok') }
  }

  if (!apiKey || typeof createClient !== 'function') {
    const verification = emptyVerification('failed')
    verification.checked = claims.length
    verification.notes.push({
      step: null,
      verdict: null,
      claim: null,
      reason: 'no API access was available to run the check',
      action: 'skipped',
      summary: 'check did not run — no API access',
    })
    return { ...doc, verification }
  }

  const runRetry = typeof retry === 'function' ? retry : (fn) => fn()
  const parseJSON =
    typeof parse === 'function'
      ? parse
      : (res) => {
          const text =
            res?.content?.filter?.((b) => b.type === 'text').map((b) => b.text).join('\n') ?? ''
          return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim())
        }

  let parsed
  try {
    const client = createClient(apiKey)
    const res = await runRetry(() =>
      client.messages.create({
        model: VERIFY_MODEL,
        max_tokens: VERIFY_MAX_TOKENS,
        system: VERIFIER_SYSTEM,
        messages: [{ role: 'user', content: buildVerifyPrompt(claims, payload) }],
      })
    )
    // The verify pass is a full Opus call and was never reported, so every study
    // has been settling short by the cost of its own fact-check — the same class
    // of gap that left the analyze half out of the ledger. A cost-per-study used
    // to set prices has to include every call that actually runs.
    if (typeof onUsage === 'function') {
      try { onUsage('verify', res?.usage, VERIFY_MODEL) } catch { /* never break a study */ }
    }
    parsed = parseJSON(res)
  } catch (err) {
    const verification = emptyVerification('failed')
    verification.checked = claims.length
    verification.notes.push({
      step: null,
      verdict: null,
      claim: null,
      // Screened for the same reason the verdict reasons are: an error string
      // is text we did not write, and it ends up inside the document.
      reason: safeReason(oneLine(err?.message)) ?? 'the check could not be completed',
      action: 'failed',
      summary: 'check did not complete — the claims in this reading were not verified',
    })
    return { ...doc, verification }
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.verdicts)) {
    const verification = emptyVerification('failed')
    verification.checked = claims.length
    verification.notes.push({
      step: null,
      verdict: null,
      claim: null,
      reason: 'the check returned no usable verdict list',
      action: 'failed',
      summary: 'check did not complete — the claims in this reading were not verified',
    })
    return { ...doc, verification }
  }

  const { doc: verified } = applyVerdicts(doc, claims, parsed.verdicts)
  return verified
}

module.exports = {
  verifyPlainRead,
  extractClaims,
  applyVerdicts,
  splitSentences,
  removeSentence,
  skippedVerification,
  matchNote,
  // The situation steps this file actually checks. Exported under the name of
  // the const that exists — the export list previously named `situationFields`,
  // which is defined nowhere in this file, and a module.exports entry for an
  // undefined identifier is a ReferenceError at REQUIRE time. It took down
  // verify.js, and with it pipeline.js, which requires verify.js at load.
  SITUATION_STEPS,
  groundingNotesFrom,
  buildVerifyPrompt,
  VERIFIER_SYSTEM,
  VERIFY_MODEL,
  VERIFY_PROMPT_VERSION,
  CHECKED_STEPS,
  MAX_CLAIMS,
  SITUATION_RESERVE,
  STRIPPED_BODY,
  STRIPPED_FIELD,
}
