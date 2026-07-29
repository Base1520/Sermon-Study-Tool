/**
 * situation.js — the room the text walked into, stated BEFORE the passage.
 *
 * WHY THIS EXISTS
 * A reader who does not know that the emperor expelled Jews from Rome around
 * AD 49 reads the strong-and-weak argument in Romans 14-15 as a general lesson
 * about opinions. A reader who does know it reads a live, painful argument
 * between people who had been separated for five years and came back to a
 * church that had reorganised without them. Same words, different book. That
 * gap is what this block closes, and it has to close BEFORE the reader meets
 * the text, not in a footnote after.
 *
 * THE HIGH-RISK PART — READ THIS BEFORE CHANGING ANYTHING HERE
 * This block is nothing but historical claims. It is the single highest-risk
 * thing PLAIN READ emits:
 *   - It is pure model generation with no grounding source behind it.
 *   - It is exactly the class of claim verify.js exists to catch — a named
 *     custom, a confident date, a claim about what an original audience knew.
 *   - It renders FIRST, which means it frames everything the reader reads
 *     after it. A fabrication here poisons the whole document downstream.
 *   - The reader cannot check any of it. That is the entire reason they wanted
 *     it. An invented edict reads exactly like a real one.
 * So: `confidence` is not decoration, and the extraction hooks at the bottom of
 * this file are not optional plumbing. A situation block that the verifier
 * never sees is the worst artifact this tool could ship.
 *
 * Dependency-free on purpose. validate.js requires this; this requires nothing.
 */

/**
 * The honesty valve.
 *
 * documented    — attested by external record, or stated in the text itself.
 *                 The expulsion from Rome. A letter that says it was written
 *                 from custody.
 * reconstructed — a reasonable historical inference most readers accept. Not
 *                 written down anywhere, but the shape of the evidence points
 *                 one way and few people fight about it.
 * uncertain     — genuinely contested, or thin. Say so and mean it.
 *
 * ONE LABEL, FOUR FIELDS — how to set it when they do not agree.
 * There is a single `confidence` for the whole block, and a block routinely
 * mixes standing: an attested expulsion sitting beside a reconstructed year
 * sitting beside an inference about who was in the room. The label answers for
 * ALL of it, so it answers at the level of the WEAKEST load-bearing claim in
 * the block — never the strongest. One documented fact does not launder the
 * three reconstructions printed next to it, and the reader has no way to tell
 * which sentence the word was aimed at.
 */
const CONFIDENCE_LEVELS = ['documented', 'reconstructed', 'uncertain']

/**
 * What an unusable confidence value coerces to.
 *
 * NOT "documented" — a coercion must never upgrade a claim's standing. NOT
 * "uncertain" either: that would let a garbage value quietly discredit a block
 * that may be perfectly well attested, and a reader who is told everything is
 * uncertain learns to ignore the label. The middle is the honest landing spot
 * for "the model did not tell us".
 */
const DEFAULT_CONFIDENCE = 'reconstructed'

/** Prose fields. All four are required; validate.js throws on any empty one. */
const SITUATION_FIELDS = ['when', 'where', 'pressure', 'soWhat']

/**
 * The JSON fragment, stated ONCE so prompt.js, pipeline.js's schema hint, and
 * any other caller cannot drift apart. prompt.js interpolates it into the
 * system prompt; the caller that owns the user-turn schema hint should splice
 * it in as a top-level key the same way it splices OUTLINE_SCHEMA_HINT.
 */
const SITUATION_SCHEMA_HINT = `
"situation": {
  "when": string,
  "where": string,
  "pressure": string,
  "soWhat": string,
  "confidence": "documented" | "reconstructed" | "uncertain",
  "vaultSourced": boolean
}

"when" is the date or span, written plainly: "around AD 57, near the end of the
third journey". If the date is genuinely disputed, say so in ONE clause inside
this field rather than picking a side silently. Never manufacture a specific
year to sound authoritative.
"where" is where it was written and where it was sent. For narrative, where the
events happen — and, where it differs and is knowable, where the account was
written down.
"pressure" is 3-5 sentences on what the RECIPIENTS were actually dealing with.
"soWhat" is 1-2 sentences naming what changes in the reading of THIS passage
because of it.
"confidence" answers for the WHOLE block, so set it at the level of the weakest
load-bearing claim in it, never the strongest. A block that pairs one attested
event with a reconstructed year and an inference about the room is
"reconstructed". "documented" is the strongest word available to you and it is
earned only when every claim carrying weight here is attested outside the text
or stated in it.
"vaultSourced" is always false. Code sets it, never you.
`.trim()

/**
 * A worked example of the block, for tests and for anyone reading the contract.
 *
 * NOT a fallback and NOT a default. Nothing in this module or in validate.js
 * ever merges this into a real document — a situation block invented by the
 * codebase and printed above a reader's passage would be the exact fabrication
 * this whole file is built to prevent. It is a fixture. Treat it as one.
 */
const SITUATION_EXAMPLE = Object.freeze({
  when: 'around AD 57 — the year is reconstructed, not recorded — written during a stay in Greece near the end of a long collection journey',
  where: 'written from Corinth, sent to the Christians in Rome — a church the writer had never visited',
  pressure:
    'The emperor expelled Jews from Rome, most likely around AD 49 — the year is argued over — and ' +
    'the Jewish believers went with them. For the years that followed the church there ran as a ' +
    'Gentile church, reorganised around Gentile leaders, Gentile assumptions, and a calendar with ' +
    'no Sabbath and no food laws in it. ' +
    'After the emperor died the expelled believers came back to a church that had learned to run ' +
    'without them. Nobody in that room was neutral about who had been right in the meantime.',
  soWhat:
    'The argument about food and days is not a general lesson about tolerating opinions. It is two ' +
    'groups of real people, recently separated and freshly back together, deciding whether they can ' +
    'eat at the same table.',
  /*
   * "reconstructed", not "documented", and the correction is the point of the
   * fixture rather than a detail of it.
   *
   * This example previously read "documented". It is the worked case the whole
   * contract is taught from, and prompt.js teaches the same case in prose — so
   * whatever it models, the model copies, and a worked example outweighs an
   * abstract rule every time.
   *
   * What it was modelling was false. The expulsion itself is attested outside
   * the letter. Almost nothing else in this block is: the AD 49 year is
   * genuinely argued over, the AD 57 year is a reconstruction the letter never
   * states, and "the church ran as a Gentile church for the years that
   * followed" is an inference from the expulsion, not a record of it. One
   * attested fact does not earn the strongest word in the document for the four
   * claims standing next to it. The label answers for the whole block, so it
   * answers at the level of the weakest load-bearing claim in it.
   */
  confidence: 'reconstructed',
  vaultSourced: false,
})

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

/** Collapses internal whitespace and trims. Empty in, empty out. */
function clean(value) {
  if (!isNonEmptyString(value)) return ''
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Coerces any confidence value onto the three-value scale.
 *
 * Never throws. An unusable value is a model formatting slip, not a reason to
 * kill a reading that may be entirely sound.
 */
function normalizeConfidence(value) {
  const v = String(value ?? '').trim().toLowerCase()
  return CONFIDENCE_LEVELS.includes(v) ? v : DEFAULT_CONFIDENCE
}

/**
 * Normalizes a raw situation block into the documented shape.
 *
 * Does NOT throw and does NOT judge content — validate.js owns the throwing.
 * Missing fields come back as empty strings so the validator can name exactly
 * which one the model skipped.
 *
 * vaultSourced is FORCED. Whatever the model claimed about its own sourcing is
 * discarded, because a model asserting that its history came from a vault is
 * the most self-serving claim in the document and there is no way for a reader
 * to check it. Only code that actually consulted the vault may pass
 * `{ vaultSourced: true }` here.
 *
 * @param {object} raw
 * @param {object} [opts]
 * @param {boolean} [opts.vaultSourced] set by the vault layer, never by a model
 * @returns {{when:string, where:string, pressure:string, soWhat:string,
 *            confidence:string, vaultSourced:boolean}}
 */
function normalizeSituation(raw, { vaultSourced = false } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const field of SITUATION_FIELDS) out[field] = clean(src[field])
  out.confidence = normalizeConfidence(src.confidence)
  out.vaultSourced = vaultSourced === true
  return out
}

/* ------------------------------------------------------------------ *
 * the verifier hook — interface for verify.js
 *
 * verify.js is owned by another agent this round, so nothing below reaches
 * into it. This is the surface it needs to pull the situation block into the
 * adversarial pass, and it is designed so the change on that side is three
 * lines:
 *
 *   const { SITUATION_CHECKED_STEPS, readStepBody, writeStepBody,
 *           SITUATION_MIN_CLAIM_CHARS } = require('./situation')
 *
 *   const CHECKED_STEPS = [...SITUATION_CHECKED_STEPS, 'setting', 'words',
 *                          'story', 'doing', 'surroundings', 'genre']
 *
 *   // in extractClaims:   const body = readStepBody(doc, step)
 *   // in applyVerdicts:   writeStepBody(next, step, finalBody)
 *
 * Both helpers pass ordinary work-step names through untouched, so the
 * existing six steps keep working with no special-casing.
 * ------------------------------------------------------------------ */

/**
 * Situation fields shipped to the verifier, highest fabrication risk first.
 *
 * `pressure` leads because it is where an invented custom or an invented civic
 * event lands. `when` follows because a manufactured year is the other classic
 * failure. `where` is left OUT by default: it is short, low-variance, and
 * usually restates something the letter itself says, so it is not worth a
 * claim slot against MAX_CLAIMS. Add it here if that stops being true.
 */
const SITUATION_CHECKED_STEPS = ['situation.pressure', 'situation.when']

/** Every situation field a caller MAY check, if it wants to spend the tokens. */
const SITUATION_CHECKABLE_FIELDS = ['pressure', 'when', 'where']

/**
 * KNOWN GAP, stated out loud rather than papered over.
 *
 * verify.js drops any sentence under MIN_CLAIM_CHARS (30) as "not a claim worth
 * a round trip". That threshold was tuned against step bodies, which are
 * paragraphs. `situation.when` is routinely SHORTER than 30 characters —
 * "around AD 57, from Corinth" is 26 — which means the single most checkable
 * fabrication in the document sails past the checker on a length test.
 *
 * A caller wiring the situation block in should use this floor for situation
 * steps instead of the global one. A short date is exactly the kind of claim
 * that needs checking, not the kind that is too small to matter.
 *
 * SET TO 4, NOT 12. Twelve still had the hole in it: a bare `when` of "AD 57"
 * is five characters, so the single most checkable fabrication the block can
 * produce — a manufactured year with nothing around it — walked past the
 * checker on a length test, which is the same failure the paragraph above
 * describes, one size down. The claim budget survives it: verify.js reserves a
 * fixed six slots for this block, so a short fragment can spend a reserved slot
 * and can never crowd out a step claim.
 */
const SITUATION_MIN_CLAIM_CHARS = 4

/** True for a step name that addresses the situation block, e.g. "situation.when". */
function isSituationStep(step) {
  return typeof step === 'string' && step.startsWith('situation.')
}

/** The field name inside the situation block, or null for an ordinary step. */
function situationField(step) {
  if (!isSituationStep(step)) return null
  const field = step.slice('situation.'.length)
  return SITUATION_FIELDS.includes(field) ? field : null
}

/**
 * Reads the checkable text for a step name.
 *
 * Handles both `situation.<field>` and an ordinary work step, so a caller can
 * loop one list without branching.
 */
function readStepBody(doc, step) {
  const field = situationField(step)
  if (field) return doc?.situation?.[field] ?? ''
  return doc?.work?.[step]?.body ?? ''
}

/**
 * Writes the checkable text for a step name, COPY-ON-WRITE.
 *
 * Mutates only the object handed in, and replaces the nested container rather
 * than editing it, so a caller holding a shallow copy of the original document
 * cannot accidentally scribble on the original. Returns the same object for
 * chaining.
 */
function writeStepBody(doc, step, body) {
  if (!doc || typeof doc !== 'object') return doc
  const text = typeof body === 'string' ? body : ''
  const field = situationField(step)
  if (field) {
    doc.situation = { ...(doc.situation || {}), [field]: text }
    return doc
  }
  doc.work = { ...(doc.work || {}) }
  doc.work[step] = { ...(doc.work[step] || {}), body: text }
  return doc
}

module.exports = {
  CONFIDENCE_LEVELS,
  DEFAULT_CONFIDENCE,
  SITUATION_FIELDS,
  SITUATION_SCHEMA_HINT,
  SITUATION_EXAMPLE,
  normalizeSituation,
  normalizeConfidence,
  // verifier hook
  SITUATION_CHECKED_STEPS,
  SITUATION_CHECKABLE_FIELDS,
  SITUATION_MIN_CLAIM_CHARS,
  isSituationStep,
  situationField,
  readStepBody,
  writeStepBody,
}
