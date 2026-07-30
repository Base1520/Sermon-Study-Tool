/**
 * pipeline.js — PLAIN READ orchestration.
 *
 * Imports NOTHING from Electron. Everything it needs is injected. That means:
 *   - it can be require()d by a plain Node script for headless prompt tuning
 *     (no rebuild loop, no UI)
 *   - it drops into a Worker for the web port without a rewrite
 *
 * One model call in, one validated document out. No chat surface — see the
 * note at the bottom of this file for why that is a design decision, not an
 * omission.
 */

const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

const { PLAIN_READ_SYSTEM, PROMPT_VERSION, OUTLINE_SCHEMA_HINT, buildSystem } = require('./prompt')
const { normalizeLevel } = require('./levels')

/**
 * The level PLAIN READ generates at when the caller names none.
 *
 * NOT levels.js's DEFAULT_LEVEL, and the difference is deliberate. That constant
 * is the fallback for an UNRECOGNISED value — "I was handed junk, land somewhere
 * safe." This is a product choice: what the layman surface asks for when nobody
 * chose. Two different questions, so two different constants; do not collapse
 * them.
 *
 * WHY 'plain'. PLAIN READ is the layman surface. The standing complaint is that
 * it "reads like a scholar" and that a new reader is "intimidated by just a ton
 * of info." levels.js's 'standard' spec says in as many words that "grace,
 * covenant, gospel, epistle, repentance" may be used "without stopping to define
 * them" — which is the correct setting for a trained reader and the wrong one
 * for the man this surface exists for. Nothing in the app sends a level, so
 * every document ever generated has been 'standard'. The level built to answer
 * the complaint has never once run in front of a reader.
 *
 * MEASURED, not assumed. Ephesians 2:8-10, generated live at both levels off the
 * same cached analysis, counting terms a reader eight weeks old would not own
 * (covenant, righteousness, grace, circumcision, Gentile, "neuter form") that
 * appear with no gloss in the sentence they sit in:
 *     standard  1967 words of prose, 16 unexplained
 *     plain     2386 words of prose,  6 unexplained
 * 21% LONGER and 62% fewer unexplained terms. That is the ruling working —
 * "i never said keep it short... i expect there to be more explanation becuase
 * he has more questions that he doesnt even know he has." Length was never the
 * complaint. Unexplained density was.
 *
 * The reading does not move with the level; levels.js's assertSameReading()
 * enforces that, and the two live documents agreed on outline, faces, dominant
 * face, step kind, misread and restraints.
 *
 * REVERSIBLE IN ONE WORD. If a level control ever ships, it passes `level`
 * explicitly and this constant stops being consulted. Level is already in the
 * cache key, so flipping it cannot serve anyone a stale document at the wrong
 * level — the old 'standard' entries simply stop being hit.
 */
const PLAIN_READ_DEFAULT_LEVEL = 'plain'
// The situation block's JSON fragment, stated once in situation.js so the
// system prompt and this user-turn schema cannot drift apart.
const { SITUATION_SCHEMA_HINT } = require('./situation')
const { validatePlainRead, PlainReadValidationError, PSYCH_ELIGIBLE_KINDS, PULPIT_LEAK } = require('./validate')
const { verifyPlainRead, skippedVerification } = require('./verify')
const { lookupPassage, packMeta, GROUNDING_KEY } = require('./vault/index.js')
// Progressive RENDERING only. See requestDocument() below — nothing this
// module reports is authoritative, and the whole document is still parsed and
// validated after the stream closes.
const { createSectionExtractor } = require('./stream')

const MODEL = 'claude-opus-4-8'
/**
 * Output ceiling. Raised from 4500 when the exegetical outline became a REQUIRED
 * block: six steps x three fields, plus the outline's shape and units, now share
 * one response, and 4500 was measured against a document that had no outline in
 * it. A response that runs past the ceiling comes back as truncated JSON, which
 * is a parse failure, not a short document — the reader gets nothing. Output is
 * billed by what is actually produced, so headroom that goes unused costs zero.
 */
const MAX_TOKENS = 6000
const MIXED_REVELATION_AUDIENCE_REPAIR =
  'John addresses seven churches in different conditions: some are faithful or afflicted, while others are compromised, complacent, or self-deceived.'

function repairKnownValidationFailure(doc, err) {
  if (
    !doc ||
    err?.code !== 'REVELATION_MIXED_AUDIENCE' ||
    typeof err.path !== 'string' ||
    typeof err.sentence !== 'string'
  ) {
    return false
  }

  const parts = err.path.split('.').filter(Boolean)
  if (!parts.length) return false

  let parent = doc
  for (const part of parts.slice(0, -1)) {
    if (!parent || typeof parent !== 'object' || !(part in parent)) return false
    parent = parent[part]
  }

  const key = parts[parts.length - 1]
  if (!parent || typeof parent[key] !== 'string' || !parent[key].includes(err.sentence)) {
    return false
  }

  parent[key] = parent[key].replace(err.sentence, MIXED_REVELATION_AUDIENCE_REPAIR)
  return true
}

function validateWithKnownRepairs(doc, options, initialError) {
  let validationError = initialError

  for (let repairs = 0; repairs < 8; repairs += 1) {
    if (!repairKnownValidationFailure(doc, validationError)) throw validationError
    try {
      return validatePlainRead(doc, options)
    } catch (err) {
      validationError = err
    }
  }

  throw validationError
}

/* ------------------------------------------------------------------ *
 * mechanics — the psych layer, gated on clinical review
 * ------------------------------------------------------------------ */

let _mechanicsCache = null

/**
 * Returns the mechanics that may render, or [] if the clinical review has not
 * happened. An empty list means PlainRead.tsx renders the step with NO psych
 * caveat block at all.
 *
 * The psych layer is ABSENT rather than UNREVIEWED. A forgotten review degrades
 * the product instead of creating an incident. Do not "fix" this by filling in
 * clinical_review.by to unblock a build.
 */
function loadMechanics({ mechanicsPath } = {}) {
  if (_mechanicsCache) return _mechanicsCache
  const file = mechanicsPath || path.join(__dirname, 'mechanics.json')
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    // A missing or malformed mechanics file must never break a reading.
    _mechanicsCache = { reviewed: false, mechanics: [] }
    return _mechanicsCache
  }
  const reviewed = Boolean(parsed?.clinical_review?.by)
  _mechanicsCache = {
    reviewed,
    reviewedBy: parsed?.clinical_review?.by ?? null,
    reviewedOn: parsed?.clinical_review?.date ?? null,
    mechanics: reviewed ? (parsed.mechanics || []) : [],
  }
  return _mechanicsCache
}

/** Test seam. */
function _resetMechanicsCache() { _mechanicsCache = null }

/** Picks the mechanic (if any) that applies to this step kind. */
function mechanicForStep(stepKind, opts) {
  if (!PSYCH_ELIGIBLE_KINDS.includes(stepKind)) return null
  const { mechanics } = loadMechanics(opts)
  return mechanics.find((m) => (m.applies_to || []).includes(stepKind)) || null
}

/* ------------------------------------------------------------------ *
 * passage widening
 * ------------------------------------------------------------------ */

// The period matters. A layman types "Phil. 4:13", "1 Cor. 8:6", "Rom. 8:1" —
// the abbreviated form is the COMMON form — and a book pattern of [\w\s] only
// could not match any of them. The widening notice then silently did not fire
// on exactly the inputs it exists for, and the reader was left believing the
// document was about the one verse they asked for. Dots are part of a book name.
const SINGLE_VERSE = /^\s*([\w\s.]+?)\s*(\d+):(\d+)\s*$/

/**
 * A verse means what it means inside its paragraph. If the reader handed us a
 * single verse, we say so ON SCREEN before any content — we never silently
 * widen and let them think they asked for the paragraph.
 */
function describeWidening(requestedRef, analysisRef) {
  if (!requestedRef || !analysisRef) return { expandedReference: null, expandReason: null }
  const wasSingleVerse = SINGLE_VERSE.test(requestedRef)
  const widened = requestedRef.trim() !== String(analysisRef).trim()
  if (!wasSingleVerse || !widened) return { expandedReference: null, expandReason: null }
  return {
    expandedReference: String(analysisRef),
    expandReason:
      `You gave me one verse. A verse means what it means inside its paragraph — ` +
      `I loaded ${analysisRef} and read ${requestedRef.trim()} off of it.`,
  }
}

/* ------------------------------------------------------------------ *
 * cache key
 * ------------------------------------------------------------------ */

/**
 * Keys on the input that actually varies.
 *
 * analyze-passage keys on `analysis-cache-v3-${profileVersion}-${ref}-${textHash}`
 * where profileVersion busts the cache when the pastor's hermeneutics change.
 * Keying PLAIN READ on the passage text alone reintroduces that exact bug one
 * layer up: profile changes -> analysis changes materially -> passage bytes are
 * identical -> PLAIN READ serves a document built from the discarded analysis,
 * permanently, for that passage.
 */
// The default here MUST be the same constant plainRead() defaults to. This
// helper is exported and is how a caller looks up a document plainRead wrote;
// if the two defaults drift, a lookup with no level silently misses forever.
function cacheKeyFor(analysis, level = PLAIN_READ_DEFAULT_LEVEL) {
  const analysisHash = crypto
    .createHash('md5')
    .update(JSON.stringify(analysis ?? {}))
    .digest('hex')
    .slice(0, 8)
  const ref = analysis?.reference ?? 'unknown'
  // The reading LEVEL is part of the key, because it changes the document the
  // model writes but changes nothing else in this key. PROMPT_VERSION is one
  // number per build, so without this two levels of the same passage hash
  // identically and silently overwrite each other — a newcomer generates and a
  // standard reader is served the newcomer's document, or the reverse. Both
  // render perfectly, so nothing surfaces the swap. Nothing requests a
  // non-default level yet; this is here so that the day something does, the
  // bug is already closed rather than waiting to be discovered by a reader.
  return `plain-read-v2-${PROMPT_VERSION}-${normalizeLevel(level)}-${ref}-${analysisHash}`
}

/* ------------------------------------------------------------------ *
 * vault grounding
 *
 * Until now PLAIN READ ran entirely on model recall. The pack under ./vault is
 * distilled from the pastor's own chapter-by-chapter work — historical setting,
 * genre, canonical placement, the restraint fences a passage needs — which is
 * exactly the material the model is most likely to invent and least likely to
 * be caught inventing. Handing it over as grounding is strictly better than
 * asking a model to remember it.
 *
 * THREE RULES GOVERN THIS BLOCK.
 *
 * 1. A MISS IS SILENT. Most of the New Testament has book-level notes only, and
 *    plenty of references have nothing at all. lookupPassage returns null and
 *    the payload is byte-identical to what it was before this feature existed.
 *    No filler, no apology, no "the vault had nothing" line for the model to
 *    read and repeat. The reading is not degraded by a miss; it is simply the
 *    reading we were already shipping.
 *
 * 2. NOTES ARE SANITIZED BEFORE INJECTION. The vault was written for a pastor's
 *    eyes. Its prose is allowed to say things PLAIN READ's own document may not,
 *    and a note that carried delivery language into the prompt would come back
 *    out in the document and throw at validation — turning the grounding
 *    feature into a source of dead readings. Every note is screened against the
 *    same PULPIT_LEAK regex validate.js enforces, and a note that trips it is
 *    dropped. Real data: 2 of the pack's 4020 notes trip it today, one on
 *    "last point" and one on a verbatim quote of Ruth 1:16 ("your people shall
 *    be my people"). Both are correct drops as far as this pipeline is
 *    concerned — the cost of losing a note is one less grounded fact; the cost
 *    of keeping it is a reader who gets nothing at all.
 *
 * 3. THE BUDGET IS FIXED IN CHARACTERS, NOT HOPE. See VAULT_CHAR_BUDGET.
 * ------------------------------------------------------------------ */

/**
 * Roughly 1,500 tokens at ~4 characters per token — the middle of the 1,200-1,800
 * band this feature was scoped to. Measured against the real pack: a chapter node
 * carries at most 2,483 characters of notes and a book node at most about 1,300,
 * so a single-chapter reference never comes close to the ceiling. The budget
 * exists for the case that CAN blow up — a range reference, where lookupPassage
 * will merge up to six chapter nodes ("Revelation 1-6") and the notes stack.
 */
const VAULT_CHAR_BUDGET = 6000

/**
 * Note ceilings handed to the loader. Its own defaults (14 / 4) are tuned for a
 * caller with no budget of its own; this caller has one, so it asks for the
 * whole chapter node (12 notes is the pack's maximum) plus a wider band of book
 * background behind it, then cuts to VAULT_CHAR_BUDGET here.
 */
const VAULT_MAX_NOTES = 18
const VAULT_MAX_BOOK_NOTES = 6

/**
 * The sentence that tells the model what these notes ARE. Without it the notes
 * read as one more field of the analysis and carry no more weight than the
 * model's own recall — which is the whole point of supplying them.
 */
const GROUNDING_INSTRUCTION =
  'These notes are supplied background for this passage, drawn from a curated ' +
  'reference collection rather than from your own memory. Each note is labeled. ' +
  'BACKGROUND may support a careful historical statement. INTERPRETIVE is a ' +
  'reading, not a fact, and must be qualified as an inference. DISPUTED may appear ' +
  'only in "where honest readers differ," paired with a real alternative; never ' +
  'encode it as the document\'s settled meaning. Where a BACKGROUND note and your ' +
  'own recall disagree, the note wins. Do not quote the notes, mention that you ' +
  'were given them, or stretch one into a claim it does not make. They are ' +
  'background, not a script.'

function groundingStatus(note) {
  const text = String(note || '')
  if (
    /\b(?:amil|premil|postmil|dispensational|idealist|preterist|futurist|conditionalist)\b/i.test(text) ||
    /\b(?:most naturally reads|key text for|one view|another view|disputed|debated|argued)\b/i.test(text) ||
    /\b(?:caesar is lord|trade guilds?|satan's throne|emperor worship|imperial cult)\b/i.test(text)
  ) return 'DISPUTED'

  if (
    /\b(?:pastoral force|reading rule|echoes|hinge|stands behind|stands for|symbolic|shorthand|portray|signif|fulfill|tension)\b/i.test(text) ||
    /\s=\s/.test(text)
  ) return 'INTERPRETIVE'

  return 'BACKGROUND'
}

function looksTruncatedGroundingNote(note) {
  const text = String(note || '').trim()
  if (!text) return true
  if (/\b(?:the|a|an|and|or|but|of|to|for|with|from|in|on|at|by|as|that|which|who|whose|its|their|this|these|those)\.$/i.test(text)) {
    return true
  }
  const quoteCount = (text.match(/["“”]/g) || []).length
  if (quoteCount % 2 !== 0) return true
  const opens = (text.match(/\(/g) || []).length
  const closes = (text.match(/\)/g) || []).length
  return opens !== closes
}

/** True when a note carries delivery language and must not enter the prompt. */
function tripsPulpitLeak(note) {
  return PULPIT_LEAK.test(note)
}

/**
 * Collects vault notes for a reference, sanitized and capped.
 *
 * SELECTION — how the "most relevant" notes are chosen when the budget binds.
 * The loader already returns notes in the one order that matters: the chapter
 * node's own notes first (specific to the reference the reader asked about),
 * then book-level notes behind them (background that is true of the whole
 * letter). Within a node the build script preserves the node's authored order,
 * which runs general to specific — genre and setting first, structure and
 * fences after. So relevance is descending by position, and the budget is spent
 * from the front and stops at the first note that will not fit. Nothing is
 * re-ranked. A re-ranker here would be guessing, and a wrong guess drops the
 * historical setting to keep a structural aside.
 *
 * @param {string|null} reference
 * @returns {{notes: string[], noteCount: number, chars: number, dropped: number}|null}
 *   null on any miss — no pack, unparseable reference, nothing indexed, or every
 *   note sanitized away.
 */
function collectVaultGrounding(reference) {
  if (!reference) return null

  let hit = null
  try {
    hit = lookupPassage(reference, {
      maxNotes: VAULT_MAX_NOTES,
      maxBookNotes: VAULT_MAX_BOOK_NOTES,
    })
  } catch (err) {
    // The loader already degrades a missing or corrupt pack to null. A throw
    // here would be something unforeseen, and an unforeseen problem in an
    // OPTIONAL grounding layer must never cost a reader their reading.
    return null
  }
  if (!hit || !Array.isArray(hit.notes) || hit.notes.length === 0) return null

  const notes = []
  let chars = 0
  let dropped = 0

  for (const raw of hit.notes) {
    if (typeof raw !== 'string') continue
    const note = raw.trim()
    if (!note) continue
    if (looksTruncatedGroundingNote(note)) {
      dropped += 1
      continue
    }
    if (tripsPulpitLeak(note)) {
      dropped += 1
      continue
    }
    if (chars + note.length > VAULT_CHAR_BUDGET) break
    notes.push(`[${groundingStatus(note)}] ${note}`)
    chars += note.length
  }

  if (notes.length === 0) return null
  return { notes, noteCount: notes.length, chars, dropped }
}

/* ------------------------------------------------------------------ *
 * the payload we hand the model
 * ------------------------------------------------------------------ */

/**
 * PLAIN READ never reads 'scholar-profile'. That key holds the pastor's
 * hermeneutics string and up to three full sermon manuscripts. It is not
 * fetched here, so there is nothing to leak.
 *
 * It also never receives the private per-chapter vault sections (the
 * "counterpart-verse" and "Cole's-lens" blocks) — those are tuned to one man's
 * documented patterns and sit behind a do-not-infer privacy fence. The pack
 * this function now reads was built with those sections already excluded.
 *
 * Source PATHS are likewise never put in the payload or on the document. They
 * name a private vault's directory structure, they would be one more string for
 * a model to echo, and a reader who was told "Knowledge/Theological/Scripture
 * Analysis Engine/1 Kings 1.md" has learned nothing except that such a file
 * exists. Counts travel; paths do not.
 */
function buildPayload(analysis) {
  const grounding = collectVaultGrounding(analysis?.reference ?? null)
  return {
    reference: analysis?.reference ?? null,
    passageText: analysis?.passageText ?? analysis?.text ?? null,
    translation: analysis?.translation ?? null,
    // PULPIT analysis can be conditioned by the pastor's private profile.
    // PLAIN is a public reader surface, so interpretive conclusions from that
    // object do not cross this boundary. Clause text and hierarchy are retained
    // because they are structural observations; theological notes, author
    // intent, main theme, sermon outline, and canonical synthesis are not.
    genre: analysis?.genre ?? null,
    phrases: Array.isArray(analysis?.phrases)
      ? analysis.phrases.map((p) => ({
          text: p.text,
          level: p.level,
          type: p.type ?? null,
          parentId: p.parentId ?? null,
          connective: p.connective ?? null,
          connectiveFunction: p.connectiveFunction ?? null,
        }))
      : null,
    // A miss adds NOTHING. The key is absent, not null and not an empty list —
    // an empty grounding block in the payload is a sentence the model reads as
    // "the reference collection had nothing for this passage", and it will
    // hedge the whole document accordingly.
    ...(grounding
      ? {
          [GROUNDING_KEY]: {
            howToUse: GROUNDING_INSTRUCTION,
            notes: grounding.notes,
          },
        }
      : {}),
  }
}

/*
 * The schema hint is the LAST and most concrete instruction the model sees, and
 * it says "exactly this shape". So every key validate.js REQUIRES has to be in
 * it. `outline` is required (validate.js throws without it) — leaving it out
 * here put the user turn in direct contradiction with the system prompt, and
 * the user turn wins often enough that a reader gets "Could not finish the
 * reading" after two full model calls. Interpolated from prompt.js so the shape
 * is stated once.
 *
 * `situation` repeated the outline bug exactly. The system prompt teaches the
 * block at length, but this schema — the last, most concrete thing the model
 * reads, the one that says "exactly this shape" — had no situation key in it.
 * The model did as it was told and returned a document without one, validate.js
 * threw "situation block missing", the single retry produced the same document,
 * and every live generation died. The suites never caught it because they build
 * their own fixtures and never go through this string. Same lesson, written
 * twice: a key validate.js REQUIRES must appear HERE, not only in the system
 * prompt.
 */
const SCHEMA_HINT = `
Return JSON of exactly this shape:
{
  "reference": string,
  "sensitive": boolean,
  ${SITUATION_SCHEMA_HINT.split('\n\n')[0].split('\n').join('\n  ')},
  "meaning": {
    "plain": string,
    "misread": { "exists": boolean, "claim": string, "whyNot": string, "biggerNotSmaller": string } | null,
    "assumes": string,
    "level": string | null
  },
  "work": {
    "genre":        { "body": string, "youCanCheck": string, "theMove": string },
    "setting":      { "body": string, "youCanCheck": string, "theMove": string },
    "surroundings": { "body": string, "youCanCheck": string, "theMove": string },
    "words":        { "body": string, "youCanCheck": string, "theMove": string },
    "story":        { "body": string, "youCanCheck": string, "theMove": string },
    "doing":        { "body": string, "youCanCheck": string, "theMove": string },
    "christPathway": "direct-prophecy"|"typology"|"promise-fulfillment"|"thematic-fulfillment"|"ethical-mission-continuity"|"prophet-priest-king"|null
  },
  "distance": string,
  "application": {
    "faces": ("duty"|"character"|"goals"|"discernment")[],
    "dominantFace": "duty"|"character"|"goals"|"discernment",
    "toThemFirst": string,
    "thenToYou": string,
    "step": { "kind": "plan"|"practice"|"reorder"|"question", "cue": string|null, "action": string|null, "question": string|null }
  },
  "restraint": string[],
  "differ": { "tier": "secondary"|"tertiary"|null, "summary": string, "views": string[] } | null,
  "unknowns": string[],
  "handoff": string,
  ${OUTLINE_SCHEMA_HINT.split('\n\n')[0].split('\n').join('\n  ')}
}

${OUTLINE_SCHEMA_HINT.split('\n\n').slice(1).join('\n\n')}

${SITUATION_SCHEMA_HINT.split('\n\n').slice(1).join('\n\n')}

christPathway must be null unless you can NAME the pathway. null is a normal,
correct answer for many passages — your bias is to manufacture a connection to
Christ, not to miss one, so invert it deliberately.

For a "plan" or "practice" step, return cue and action as SEPARATE fields and
leave question null. Do not compose the sentence yourself.
`.trim()

/* ------------------------------------------------------------------ *
 * verification assembly
 *
 * These three helpers exist so the BLOCKING path and the DEFERRED path cannot
 * drift. Whatever a reader receives when the check is awaited must be assembled
 * by the same lines that assemble it when the check lands a minute later — a
 * second copy of this logic would be a silent fork in what "verified" means.
 * ------------------------------------------------------------------ */

/**
 * Where a deferred document carries its own check.
 *
 * A Symbol, not a string key, and defined non-enumerable on top of that. Both
 * matter: this value is a Promise, and a Promise that reached electron-store or
 * the IPC structured clone would throw at the worst possible moment — on the
 * hop that hands a finished reading to the renderer. JSON.stringify, spread,
 * structuredClone and Object.assign all drop it.
 */
const VERIFY_PROMISE = Symbol('plainRead.verifyPromise')

/**
 * The verification record for a document whose check has been KICKED OFF but
 * has not landed yet. Built from skippedVerification() so the shape is
 * identical to every other verification block; only the status differs.
 *
 * 'pending' is a fourth status alongside 'ok' | 'skipped' | 'failed', and it is
 * the one that most needs to stay out of the cache. Every guard in this file
 * tests for 'ok' EXPLICITLY rather than for "not failed", so pending is
 * excluded by the same line that already excludes 'skipped' — no new guard, and
 * no way for a future status to leak in through a negated test.
 *
 * Anything that reads status and asks "is this trustworthy yet" (groupguide's
 * sourcePayload, for one) already answers no for anything that is not 'ok',
 * which is the correct answer for a document still being checked.
 */
function pendingVerification() {
  const v = skippedVerification()
  v.status = 'pending'
  return v
}

/**
 * A document is plain JSON by the time it reaches here — validate.js guarantees
 * it. Cloned rather than shared because the deferred path holds a reference to
 * the document the reader already has, and a nested mutation (situation is an
 * object, unknowns is an array) would otherwise reach back into a document that
 * has already been sent over IPC and rendered.
 *
 * A Symbol-keyed property is dropped by both branches, which is deliberate:
 * VERIFY_PROMISE must never survive a clone into the cache or across IPC.
 */
function cloneDoc(doc) {
  return typeof structuredClone === 'function'
    ? structuredClone(doc)
    : JSON.parse(JSON.stringify(doc))
}

/**
 * Everything that happens to a document once the claim check RESOLVES. Lifted
 * whole out of plainRead so the deferred path runs the identical steps in the
 * identical order; the comments are the original ones and are load-bearing.
 *
 * @param {object} doc         the document to mutate in place
 * @param {object} verified    verifyPlainRead's return (or a degraded stand-in)
 * @param {boolean} vaultSourced whether notes were SUPPLIED to the generator
 */
function finishVerification(doc, verified, { vaultSourced }) {
  Object.assign(doc, verified)
  if (doc.verification?.status === 'failed') {
    const notice =
      'The claim check did not finish, so treat historical, lexical, and interpretive detail here as provisional.'
    if (!Array.isArray(doc.unknowns)) doc.unknowns = []
    if (!doc.unknowns.includes(notice)) doc.unknowns.push(notice)
  }

  // ---- vault provenance, CORRECTED against what was actually grounded ----
  // Above, `vaultSourced` was set from whether notes were SUPPLIED. That is
  // the honest meaning of doc.vault.sourced and it stays. It is NOT the
  // honest meaning of situation.vaultSourced, and the difference was measured,
  // not theorised: across nine live documents EVERY situation block came back
  // stamped true, while the verifier reported grounded:false on thirty of the
  // thirty-one situation claims inside them. A psalm whose own `when` field
  // says "the occasion is not given" still carried the provenance badge.
  //
  // That is the exact claim situation.js took away from the model — "yes, my
  // history came from your sources", self-serving and uncheckable — handed
  // straight back by a truthy length check on a different array.
  //
  // The verifier already answers the real question one claim at a time: it
  // marks a claim `grounded` only when it was matched to a supplied note and
  // then checked for faithfulness to that note. So the block's flag is set
  // from that, and it is set FALSE whenever the verifier did not run. An
  // unverified provenance claim is precisely the one not to assert — which is
  // also why a PENDING document reports false here and is corrected upward
  // only if the check comes back grounded.
  if (doc.situation && typeof doc.situation === 'object' && !Array.isArray(doc.situation)) {
    const vnotes = Array.isArray(doc.verification?.notes) ? doc.verification.notes : []
    doc.situation.vaultSourced =
      vaultSourced &&
      vnotes.some(
        (n) => n && n.grounded === true && String(n.step || '').startsWith('situation.')
      )
  }
  return doc
}

/**
 * The claim check, run AFTER the reader already has the document.
 *
 * Never rejects. There is no caller left to catch it — the reader is already
 * reading — so a rejection here would be an unhandled promise in the main
 * process and, on a strict Electron build, a crash. Every failure lands the
 * same way a blocking failure lands: the document survives, marked 'failed',
 * carrying the provisional notice, and NOT cached.
 *
 * The one thing it cannot do that the blocking path can is spend another
 * generation on a pulpit leak. The blocking path treats that as worth one more
 * sample; here the sample is already on screen, and silently replacing a
 * document a man is reading is worse than leaving it marked unchecked.
 */
async function runDeferredVerification({
  deliveredDoc,
  preVerifyDoc,
  payload,
  apiKey,
  createClient,
  retry,
  parse,
  cache,
  key,
  vaultSourced,
  // DEFAULTED, and the default is the entire point. This parameter shipped
  // without one and without a call site that supplied it, so `verifyFn` was
  // `undefined` on every deferred run: the call below threw TypeError, the catch
  // swallowed it, and every background check landed 'failed'. Deferred mode
  // looked like it worked — a document came back, no error surfaced — while the
  // claim check had silently stopped running and nothing was ever cached again.
  // A test-only override still injects a fake; production must never rely on it.
  verifyFn = verifyPlainRead,
}) {
  let verified
  try {
    verified = await verifyFn({ doc: preVerifyDoc, payload, apiKey, createClient, retry, parse })
  } catch {
    verified = { ...preVerifyDoc, verification: skippedVerification() }
    verified.verification.status = 'failed'
  }

  let finalDoc
  try {
    // Cloned from what the reader HAS, so the mechanic block, promptVersion,
    // readingLevel and fromCache carry forward untouched. `verified` cannot
    // overwrite them: it descends from the pre-mechanic snapshot and has no
    // such keys, and nothing the verifier checks can change which mechanic
    // applies (CHECKED_STEPS covers the work and situation bodies, never
    // application.step.kind).
    finalDoc = cloneDoc(deliveredDoc)
    finishVerification(finalDoc, verified, { vaultSourced })
  } catch {
    finalDoc = cloneDoc(deliveredDoc)
    finalDoc.verification = skippedVerification()
    finalDoc.verification.status = 'failed'
    const notice =
      'The claim check did not finish, so treat historical, lexical, and interpretive detail here as provisional.'
    if (!Array.isArray(finalDoc.unknowns)) finalDoc.unknowns = []
    if (!finalDoc.unknowns.includes(notice)) finalDoc.unknowns.push(notice)
  }

  // The SAME guard as the blocking path, for the same reason: a transient
  // failure on the second hop must not enshrine an unchecked reading under this
  // passage's key forever. 'pending' and 'failed' both fall through it.
  if (cache?.set && finalDoc.verification?.status === 'ok') {
    try { cache.set(key, finalDoc) } catch { /* a dead store loses a cache write, not the reading */ }
  }
  return finalDoc
}

/* ------------------------------------------------------------------ *
 * the generate call — streamed or not
 * ------------------------------------------------------------------ */

/**
 * A section callback is the CALLER's code running inside our stream handler.
 * A throw in it must not kill the reading it is decorating.
 */
function safeSection(onSection, key, value) {
  try { onSection(key, value) } catch { /* the caller's bug, not the reading's */ }
}

/**
 * Ask the model for the document.
 *
 * WITHOUT `onSection` this is exactly what it always was: one `messages.create`
 * inside the caller's retry. Every existing caller — scripts/plainread-live.js,
 * the evaluation runs, the pre-generated program path, every test in this
 * directory with its `{ messages: { create } }` fake — takes this branch and
 * cannot tell that streaming exists.
 *
 * WITH `onSection` the same call is streamed and the text is fed to an
 * incremental extractor, so a finished section reaches the reader the moment
 * the model finishes writing it instead of two minutes later with everything
 * else. THE PARAMETERS ARE IDENTICAL. The model, the token ceiling, the prompt
 * and the cache marker do not change — this removes WAITING, not content. And
 * the return value is identical too: `finalMessage()` hands back the same
 * Message shape `create()` does, so the caller's parse, validation and
 * verification run over the whole document exactly as before. Nothing the
 * extractor said is trusted by anything downstream.
 *
 * A RETRY MUST UN-DRAW WHAT IT DREW. If the stream dies mid-document after
 * sections were already on screen, the retry composes a NEW document — leaving
 * the old fragments up would splice two readings together in front of a reader
 * who has no way to know. So a failed attempt that emitted anything fires
 * '__reset__' before it rethrows, and the extractor is rebuilt per attempt.
 */
async function requestDocument({ client, params, runRetry, onSection }) {
  const canStream = typeof onSection === 'function' &&
    typeof client?.messages?.stream === 'function'

  if (!canStream) {
    // If a caller asked for sections against a client that cannot stream, it
    // gets the document and no sections — never an error. The document is the
    // product; progressive rendering is a nicety.
    return runRetry(() => client.messages.create(params))
  }

  return runRetry(async () => {
    // `work` is one key holding all six reasoning steps — the bulk of the
    // document. At depth 1 it cannot be shown until the eighteenth field is
    // written, which is the ~90-second dead stretch a reader sits through after
    // the briefing lands. Deepening it emits `work` again on each step, carrying
    // everything gathered so far, so the page keeps filling the whole way. Same
    // model, same tokens, same document — this is rendering, not content.
    const extractor = createSectionExtractor({ deepen: ['work'] })
    let emitted = false
    const stream = client.messages.stream(params)
    stream.on('text', (t) => {
      let completed
      try {
        completed = extractor.push(t)
      } catch {
        // stream.js is written not to throw. If it ever does, the reading
        // continues without progressive rendering rather than dying for it.
        return
      }
      for (const section of completed) {
        emitted = true
        safeSection(onSection, section.key, section.value)
      }
    })
    try {
      return await stream.finalMessage()
    } catch (err) {
      if (emitted) safeSection(onSection, '__reset__', null)
      throw err
    }
  })
}

/* ------------------------------------------------------------------ *
 * main entry
 * ------------------------------------------------------------------ */

/**
 * @param {object}   opts
 * @param {object}   opts.analysis      output of analyze-passage
 * @param {string}   opts.apiKey
 * @param {function} opts.createClient  (apiKey) => Anthropic client
 * @param {object}   [opts.cache]       { get(key), set(key, value) }
 * @param {function} [opts.retry]       withRetry from main.js
 * @param {function} [opts.parse]       parseModelJSON from main.js
 * @param {string}   [opts.requestedReference] what the reader actually typed
 * @param {boolean}  [opts.force]       skip cache read
 * @param {boolean}  [opts.verify]      run the adversarial claim check (default true).
 *                                      Turn it OFF only for headless prompt tuning —
 *                                      never for a document a reader will see.
 * @param {boolean}  [opts.deferVerify] return the document WITHOUT awaiting the
 *                                      claim check, and run the check in the
 *                                      background (default false).
 *
 *                                      The reader used to wait on two full Opus
 *                                      calls before seeing one word. The second
 *                                      one is a checker whose entire output is
 *                                      invisible — it cuts refuted sentences and
 *                                      appends to `unknowns`. Making a man stare
 *                                      at a spinner for a pass he will never see
 *                                      is the worst possible trade, so the
 *                                      renderer takes the document at once and
 *                                      the corrections land when they land.
 *
 *                                      Leave it FALSE for anything that needs a
 *                                      finished document in one call —
 *                                      scripts/plainread-live.js, evaluation
 *                                      runs, and the pre-generated program path,
 *                                      which ships documents as data and has no
 *                                      renderer to push a correction to.
 * @param {function} [opts.onVerified]  called once with the FINAL document when a
 *                                      deferred check lands. Never called in
 *                                      blocking mode, and never called on a
 *                                      cache hit — a cached document was
 *                                      verified before it was written.
 * @param {function} [opts.onSection]   (key, value) => void, called as each
 *                                      TOP-LEVEL key of the document finishes
 *                                      being written, so the renderer can put
 *                                      it on screen instead of holding a
 *                                      spinner until the last word lands. The
 *                                      document takes the same total time; the
 *                                      reader spends it reading.
 *
 *                                      PROGRESSIVE RENDERING ONLY. Everything
 *                                      it reports is provisional. When the
 *                                      stream closes, the complete JSON is
 *                                      parsed and validatePlainRead runs over
 *                                      the WHOLE document exactly as it does
 *                                      without this option, and the returned
 *                                      document — not the sections — is the
 *                                      truth. Streaming is a rendering
 *                                      concern; the guardrails are a
 *                                      correctness concern and they did not
 *                                      move.
 *
 *                                      DO NOT ASSUME AN ORDER. The keys arrive
 *                                      in whatever order the model writes them,
 *                                      which is prompt.js's business and can
 *                                      change without this file knowing. Render
 *                                      whatever arrives.
 *
 *                                      A KEY CAN ARRIVE MORE THAN ONCE. `work`
 *                                      holds all six reasoning steps, so it is
 *                                      reported once per step, each time with
 *                                      the steps written so far — a strict
 *                                      superset of the payload before it. Merge
 *                                      by key (sections[key] = value) and the
 *                                      section simply fills in. Never append.
 *
 *                                      onSection('__reset__', null) means
 *                                      DISCARD EVERY SECTION ALREADY SHOWN. It
 *                                      fires when an attempt that had already
 *                                      painted something is thrown away — a
 *                                      dead stream, or a document that failed
 *                                      validation and is being re-generated.
 *                                      The retry writes a different document;
 *                                      leaving the old fragments up would show
 *                                      a reader two readings spliced together.
 *
 *                                      Omitting it keeps the old non-streaming
 *                                      path byte for byte, which is why the
 *                                      pre-generated program path and
 *                                      scripts/plainread-live.js are unaffected.
 * @param {function} [opts.verifyFn]    the claim check itself. Defaults to
 *                                      verifyPlainRead and exists so a test can
 *                                      inject a fake without a network call —
 *                                      ONE seam, shared by the blocking and the
 *                                      deferred path, so a test cannot prove
 *                                      something about a checker the other path
 *                                      does not use. Not for production callers.
 */
async function plainRead({
  analysis,
  apiKey,
  createClient,
  cache,
  retry,
  parse,
  requestedReference,
  force = false,
  verify = true,
  deferVerify = false,
  onVerified,
  onSection,
  onCacheMiss,
  verifyFn = verifyPlainRead,
  mechanicsPath,
  level = PLAIN_READ_DEFAULT_LEVEL,
}) {
  if (!analysis) throw new Error('plainRead: analysis is required')

  // Normalized once, here, so the cache key and the system prompt can never be
  // built from two different spellings of the same level.
  const readingLevel = normalizeLevel(level)

  // One resolved checker for BOTH paths. A caller that passes verifyFn: null or
  // any non-function gets the real verifier rather than a TypeError three awaits
  // later inside a background task nobody is watching — which is exactly how the
  // deferred check died silently once already.
  const runVerify = typeof verifyFn === 'function' ? verifyFn : verifyPlainRead

  // The cache read comes BEFORE the apiKey check on purpose. A document that has
  // already been generated cost real money once and belongs to the reader from
  // then on — requiring a key to hand back something already on disk means a man
  // who clears or rotates his key loses work he paid for. It also blocks the
  // whole pre-generated-program path, where sessions ship as data and no key
  // exists at all. Only GENERATION needs a key.
  //
  // A HIT IS ALREADY VERIFIED, and that is a property of the cache, not a
  // hope: the only line in this file that writes to the cache requires
  // verification.status === 'ok'. So a hit needs no second pass, and none is
  // fired — deferVerify or not, this return happens before a client is ever
  // built. That is also why the deferred contract says a document that comes
  // back verified will never be followed by a correction event: there is
  // nothing left to correct and nothing running that could.
  const key = cacheKeyFor(analysis, readingLevel)
  if (!force && cache?.get) {
    const hit = cache.get(key)
    if (hit) return { ...hit, fromCache: true }
  }

  // Entitlement is checked HERE, for exactly the reason the cache read comes
  // first: a document already generated belongs to the reader whether or not
  // he is currently licensed. Only generation is sold. Placing this any earlier
  // — including in the caller, where apiKey is evaluated as an argument —
  // would take away work he already has.
  if (typeof onCacheMiss === 'function') onCacheMiss()

  if (!apiKey) throw new Error('plainRead: apiKey is required')
  if (typeof createClient !== 'function') throw new Error('plainRead: createClient is required')

  const payload = buildPayload(analysis)
  const client = createClient(apiKey)
  const runRetry = typeof retry === 'function' ? retry : (fn) => fn()
  const parseJSON = typeof parse === 'function' ? parse : (res) => {
    const text = res?.content?.find?.((b) => b.type === 'text')?.text ?? ''
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim())
  }

  let lastError = null
  let lastRejectedDoc = null

  // ---- progressive rendering bookkeeping ------------------------------
  // `painted` is the one thing this function has to remember about the
  // renderer: whether anything from the CURRENT attempt is on screen. If an
  // attempt is thrown away — dead stream, failed validation — whatever it drew
  // has to come down before the next attempt starts drawing a different
  // document over the top of it.
  const streamSections = typeof onSection === 'function' ? onSection : null
  let painted = false
  const trackSection = streamSections
    ? (key, value) => {
        painted = key !== '__reset__'
        safeSection(streamSections, key, value)
      }
    : undefined
  const discardPaintedSections = () => {
    if (!streamSections || !painted) return
    painted = false
    safeSection(streamSections, '__reset__', null)
  }

  // One retry. A validation failure is a bug worth one more sample, not a loop.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // Reached only by a `continue` above — the previous attempt is being
    // abandoned. Take its sections down before this one writes new ones.
    if (attempt > 0) discardPaintedSections()

    /*
     * Cache verification. The system prompt is ~10,750 tokens and carries a
     * cache_control marker — but NOTHING reported whether the marker actually
     * took, and a marker below the model's minimum prefix silently no-ops with
     * no error. That exact failure already happened once here: prompt.js told
     * everyone not to cache because the prefix was ~3,400 tokens, the prompt
     * tripled past the 4,096 floor, and nobody re-measured for weeks.
     *
     * cache_read > 0 means the prefix came back from cache and the marker is
     * earning its keep. cache_write on the first call of a session is expected.
     * BOTH ZERO on a repeat call means it is silently no-opping again.
     */
    const __logUsage = (r) => {
      const u = r?.usage
      if (!u) return
      console.log(
        `[plain-read] tokens  in=${u.input_tokens ?? '?'}` +
        `  cache_write=${u.cache_creation_input_tokens ?? 0}` +
        `  cache_read=${u.cache_read_input_tokens ?? 0}` +
        `  out=${u.output_tokens ?? '?'}`
      )
    }

    const res = await requestDocument({
      client,
      runRetry,
      onSection: trackSection,
      params: {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        /*
         * CACHED, as of 2026-07-29 — and the history matters so nobody turns it
         * off again.
         *
         * prompt.js still carries a comment saying not to cache because the
         * prefix was ~3,400 tokens and Opus 4.8's minimum cacheable prefix is
         * 4,096, so a marker would silently no-op. That was TRUE when it was
         * written. It is no longer true: the outline block, the situation block,
         * the voice layer, the level layer and a doubled coleLens took the system
         * prompt to ~38,700 chars / ~10,750 tokens. It cleared the floor days ago
         * and nobody re-measured — exactly the failure the original comment
         * warned about, in the other direction.
         *
         * Marking the SYSTEM block only. It is the large, byte-stable part; the
         * user turn carries the passage and changes every call, so caching it
         * would be a write with no read. Every passage after the first in a
         * session reads this prefix from cache: ~90% off the input cost of the
         * biggest input we send, and less time to first token.
         *
         * If the prompt is ever cut back below 4,096 tokens this becomes a no-op
         * again — silently, with no error. Re-measure before trusting it.
         */
        system: [
          {
            type: 'text',
            text: buildSystem(readingLevel),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content:
              `${SCHEMA_HINT}\n\n` +
              (attempt > 0 && lastError
                ? (
                    `Your previous attempt was rejected: ${lastError.message}\n` +
                    `Correct that exact failure in the previous object below. Preserve every ` +
                    `field that already works; do not replace the document with a new reading, ` +
                    `and do not move the rejected claim into another field. Return the corrected ` +
                    `whole object.\n\n` +
                    (lastRejectedDoc
                      ? `PREVIOUS REJECTED OBJECT:\n${JSON.stringify(lastRejectedDoc, null, 2)}\n` +
                        `END PREVIOUS REJECTED OBJECT\n\n`
                      : '')
                  )
                : '') +
              `Here is the analysis of the passage:\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
      },
    })

    __logUsage(res)

    // A truncated or prose-wrapped response is the failure a second sample is
    // MOST likely to fix, and it was the one failure that got ZERO retries: the
    // parse error is a plain Error, not a PlainReadValidationError, so it fell
    // straight through the catch below and killed the reading on the first
    // sample. Parsed separately so it retries like everything else, and so the
    // retry turn can tell the model what went wrong.
    let parsedDoc
    try {
      parsedDoc = parseJSON(res)
    } catch (err) {
      lastError = new PlainReadValidationError(
        `the response was not valid JSON (${err?.message ?? 'parse failed'}) — ` +
        'return the whole object again, JSON only, no prose and no fence'
      )
      if (attempt === 0) continue
      // No document is coming. Anything already painted belongs to a reading
      // that will never finish — take it down rather than leaving half a
      // reading under an error message.
      discardPaintedSections()
      throw err
    }

    let doc
    try {
      doc = validatePlainRead(parsedDoc, { reference: payload.reference })
    } catch (err) {
      lastError = err
      lastRejectedDoc = parsedDoc
      if (err instanceof PlainReadValidationError && err.retryable && attempt === 0) continue
      if (
        err instanceof PlainReadValidationError &&
        attempt === 1 &&
        err.code === 'REVELATION_MIXED_AUDIENCE'
      ) {
        doc = validateWithKnownRepairs(
          parsedDoc,
          { reference: payload.reference },
          err
        )
      } else {
        discardPaintedSections()
        throw err
      }
    }

    // ---- post-validation assembly -------------------------------------
    const { expandedReference, expandReason } = describeWidening(
      requestedReference,
      payload.reference
    )
    doc.reference = payload.reference
    doc.expandedReference = expandedReference
    doc.expandReason = expandReason

    // ---- vault provenance ---------------------------------------------
    // CODE sets this, never the model. The model cannot be asked whether it
    // used the notes it was given: it does not know, and the one answer it is
    // biased toward — "yes, I used your sources" — is the answer that would
    // make an ungrounded document look grounded. What is knowable in code is
    // whether notes were SUPPLIED, so that is what the flag means.
    //
    // situation is written by a block built in parallel. It may not exist on a
    // given document, and it is not this function's business to invent one: a
    // half-formed situation object created here would render as a block the
    // model never wrote. Flag it when it is there, leave it alone when it is
    // not, and keep the provenance on doc.vault either way.
    const groundedNotes = payload[GROUNDING_KEY]?.notes ?? null
    const vaultSourced = Array.isArray(groundedNotes) && groundedNotes.length > 0
    if (doc.situation && typeof doc.situation === 'object' && !Array.isArray(doc.situation)) {
      doc.situation.vaultSourced = vaultSourced
    }
    const meta = packMeta()
    doc.vault = {
      sourced: vaultSourced,
      noteCount: vaultSourced ? groundedNotes.length : 0,
      packVersion: meta.version,
      builtOn: meta.builtOn,
    }

    // ---- adversarial second pass --------------------------------------
    // validatePlainRead stopped the known failure SHAPES. Nothing has yet
    // checked a single CLAIM. Four of the six steps (setting, words, story,
    // doing) are ungrounded generation, and the reader of THIS mode is not the
    // pastor who would otherwise catch an invented first-century custom or an
    // invented grammatical feature. See verify.js.
    //
    // Deliberately placed BEFORE the mechanic block: the verifier ends with
    // assertNoPulpitLeak over the whole document, and at this point the document
    // contains only model-generated text — the same surface validate.js already
    // guards. Running it after the mechanic block would put the verbatim
    // mechanics.json strings inside a regex that can throw, which would let an
    // edit to that file kill an otherwise valid reading.
    //
    // Also BEFORE the cache write, so the verified document is what gets stored
    // and re-served. Note that cacheKeyFor() keys on PROMPT_VERSION only —
    // editing verify.js alone will NOT bust cached documents; bump
    // PROMPT_VERSION in prompt.js when the verifier changes materially.
    //
    // verifyPlainRead degrades on every failure EXCEPT one: a pulpit leak in
    // the final document throws. That throw used to escape plainRead entirely,
    // so the reader got "Could not finish the reading" instead of a document.
    // It is treated here exactly like a validation failure — worth one more
    // sample, not a dead reading — and on the last attempt the reading survives
    // marked unverified rather than being thrown away.
    //
    // DEFERRED MODE takes the snapshot HERE, at the same point in the document's
    // life that the blocking call reads from — after assembly and provenance,
    // before the mechanic block. The placement above is not stylistic: it is why
    // the verbatim mechanics.json strings never enter the verifier's
    // assertNoPulpitLeak regex. Deferring the call must not quietly move it.
    const preVerifyDoc = verify && deferVerify ? cloneDoc(doc) : null

    let verified
    if (verify && deferVerify) {
      // No await. The reader gets the document now, marked pending, and the
      // check runs against the snapshot after this function has returned.
      verified = { ...doc, verification: pendingVerification() }
    } else if (verify) {
      try {
        verified = await runVerify({ doc, payload, apiKey, createClient, retry, parse })
      } catch (err) {
        if (err instanceof PlainReadValidationError && attempt === 0) {
          lastError = err
          lastRejectedDoc = parsedDoc
          continue
        }
        verified = { ...doc, verification: skippedVerification() }
        verified.verification.status = 'failed'
      }
    } else {
      verified = { ...doc, verification: skippedVerification() }
    }
    finishVerification(doc, verified, { vaultSourced })

    // The psych caveat renders VERBATIM from mechanics.json or not at all.
    // The model cannot write it, soften it, or paraphrase a citation.
    const mech = mechanicForStep(doc.application.step.kind, { mechanicsPath })
    doc.mechanic = mech
      ? {
          id: mech.id,
          form: mech.form,
          caveat: mech.caveat,
          backfire: mech.backfire,
          deliveryCaveat: mech.delivery_caveat,
          sources: mech.sources,
        }
      : null

    doc.promptVersion = PROMPT_VERSION
    // Stamped so a document recovered from the cache can say which level it was
    // written at. Without it, the only record of the level is the cache key,
    // which the reader's document never carries.
    doc.readingLevel = readingLevel
    doc.fromCache = false

    // ONLY a document whose check actually RAN is allowed into the cache.
    //
    // The verifier degrades instead of throwing, which is right for one view and
    // wrong forever: a single 529 on the second hop used to write an UNVERIFIED
    // reading under this key permanently. Every later view of that passage was
    // then served unchecked claims — the exact harm this feature exists to stop —
    // and nothing in the UI passes `force`, so there was no way out of it. An
    // unverified reading is fine to show once. It is not fine to enshrine.
    //
    // 'skipped' is excluded for the same reason: a headless tuning run with
    // verify:false must not leave an unchecked document behind for a reader.
    //
    // 'pending' is excluded by the same line, and this is the trap in the whole
    // deferred design: the document below is on its way to a reader UNVERIFIED.
    // Writing it here would enshrine an unchecked reading under this passage's
    // key permanently — the exact bug the 'ok' guard was added to kill, walked
    // back in through the fast path. The deferred cache write happens in
    // runDeferredVerification, once, after the check actually returns ok.
    if (cache?.set && doc.verification?.status === 'ok') cache.set(key, doc)

    // ---- the check, off the critical path -------------------------------
    // Started AFTER everything above, so the promise closes over a finished
    // document, and awaited by nobody here — that is the entire point.
    if (preVerifyDoc) {
      const task = runDeferredVerification({
        deliveredDoc: cloneDoc(doc),
        preVerifyDoc,
        payload,
        apiKey,
        createClient,
        retry,
        parse,
        cache,
        key,
        vaultSourced,
        // Was omitted, which left runDeferredVerification's `verifyFn` undefined
        // and turned every background check into a swallowed TypeError. Pass it.
        verifyFn: runVerify,
      })
      if (typeof onVerified === 'function') {
        // The callback is the caller's business and the caller's bug. A throw
        // inside it must not turn into an unhandled rejection in the main
        // process, and must not un-deliver a document the reader already has.
        task.then(
          (finalDoc) => { try { onVerified(finalDoc) } catch { /* caller's problem */ } },
          () => { /* runDeferredVerification does not reject; belt and braces */ }
        )
      }
      // Symbol-keyed and non-enumerable so it cannot be JSON-serialised, sent
      // over IPC, spread into a copy, or written to the cache. Tests and any
      // in-process caller that wants to await the check use this; the renderer
      // never sees it.
      Object.defineProperty(doc, VERIFY_PROMISE, {
        value: task,
        enumerable: false,
        configurable: true,
      })
    }
    return doc
  }

  discardPaintedSections()
  throw lastError || new Error('plainRead: exhausted attempts')
}

/*
 * A note on what is deliberately NOT here: there is no chat surface. One call
 * in, one document out, no follow-up. Partly cost. Mostly pastoral — a chat
 * window lets a reader argue a text into whatever they wanted it to say, with
 * nobody in the room to catch it. The document doesn't argue back and it
 * doesn't move.
 */

module.exports = {
  plainRead,
  VERIFY_PROMISE,
  pendingVerification,
  cacheKeyFor,
  PLAIN_READ_DEFAULT_LEVEL,
  loadMechanics,
  mechanicForStep,
  describeWidening,
  buildPayload,
  collectVaultGrounding,
  MODEL,
  VAULT_CHAR_BUDGET,
  GROUNDING_KEY,
  groundingStatus,
  looksTruncatedGroundingNote,
  _resetMechanicsCache,
}
