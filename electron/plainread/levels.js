/**
 * levels.js — the LANGUAGE LEVEL for PLAIN READ.
 *
 * The ruling this file encodes, in the words that settled it:
 *
 *   "the newcomer needs his hand held but the process stays the same...
 *    same meaning derived at the text, but the langugae needs to be user
 *    level or it will intimidate."
 *
 * Three things follow, and only the third is a variable.
 *
 *   THE PROCESS IS FIXED.  Same six steps, same order, every reader.
 *   THE MEANING IS FIXED.  A man who opened a Bible for the first time last
 *                          week and a man with a graduate degree in this get
 *                          the SAME reading of the passage. The conclusion
 *                          never softens, never simplifies, never splits.
 *   ONLY THE LANGUAGE MOVES. Vocabulary, sentence length, and how much gets
 *                          explained inline instead of assumed.
 *
 * If two readers ever end up holding two different readings because of a
 * setting, this feature is broken. That is not a UX bug. Handing a newcomer a
 * softer conclusion because he is new is a theological failure — it tells him
 * the text says something different to him than it says to everyone else, which
 * is the one thing it does not do.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS NOT: A RANKING OF THE READER
 *
 * The men who asked for this are, in their own words, brand new to Scripture
 * and say plainly that they know nothing. They are not embarrassed about it and
 * they asked for a starting point. What would insult them is not a starting
 * point — it is a form asking them to file themselves under "beginner" before
 * they are allowed to read.
 *
 * So the control is named by WHAT IT DOES TO THE WORDS ON THE PAGE, never by
 * what it implies about the man reading them. See LEVELS[*].ui below. Every
 * user-facing string in this file describes the OUTPUT. None describes the
 * reader. Keep it that way if you add a level.
 *
 * ---------------------------------------------------------------------------
 * COST — read before wiring this up
 *
 * A second level is a second generation. There is no cheap transform from one
 * to the other, because "explain every term inline" is not a post-process; it
 * is a different document written from the same reading. So:
 *
 *   LIVE PASSAGES (a reader types a reference). Generate ON DEMAND, one level
 *   at a time, and cache PER LEVEL. The cache key MUST include the level.
 *   pipeline.js currently builds it as
 *       `plain-read-v2-${PROMPT_VERSION}-${ref}-${analysisHash}`
 *   which has no level in it, so a reader who generates 'standard' and then
 *   flips to 'plain' would be served the 'standard' document back — silently,
 *   forever, for that passage. Whoever wires the level through owns adding it:
 *       `plain-read-v2-${PROMPT_VERSION}-${level}-${ref}-${analysisHash}`
 *   That is the whole fix, and it is not optional.
 *
 *   PRE-GENERATED PROGRAM SESSIONS (authored ahead of time and shipped). Both
 *   levels are produced ONCE at authoring time and both ship. The marginal cost
 *   to the reader is zero and the flip is instant — no request, no spinner, no
 *   key. Generate both at authoring time and run assertSameReading() over the
 *   pair before shipping, which is the cheapest place in the whole system to
 *   catch a divergence: at the desk, not in a reader's hands.
 */

/* ------------------------------------------------------------------ *
 * the levels
 * ------------------------------------------------------------------ */

const LEVEL_IDS = ['plain', 'standard']

const DEFAULT_LEVEL = 'standard'

/**
 * Descriptor for each level.
 *
 *   id     — the value that goes in the cache key and on the document
 *   ui     — user-facing strings. Named by what happens to the language.
 *   prompt — the fragment spliced into the generation prompt
 */
const LEVELS = {
  plain: {
    id: 'plain',
    ui: {
      // The control itself, above both options.
      controlLabel: 'How much gets explained',
      // The option.
      label: 'Explain every term',
      // One line under the option. Describes the page, not the person.
      help: 'Nothing is assumed. Every term is explained the moment it shows up, and the background is spelled out instead of referred to. Longer, because more is explained.',
      // Shown on the document itself when this level produced it.
      badge: 'Every term explained',
    },
    prompt: {
      vocabulary:
        'Ordinary English. No word a man who has never been in a church would have to look up.',
      terms:
        'Every technical term is explained in the same sentence it appears in — including the ones church people stopped noticing.',
      originalLanguages:
        'No untranslated Greek or Hebrew words at all. Not transliterated, not in parentheses.',
      background:
        'Historical and cultural background is spelled out in full, never referred to as though the reader already has it.',
      sentences:
        'Short sentences. One idea each.',
      expectedLength:
        'LONGER than the other level, sometimes much longer. That is the setting working, not a failure of discipline.',
    },
  },

  standard: {
    id: 'standard',
    ui: {
      controlLabel: 'How much gets explained',
      label: 'Assume I know the terms',
      help: 'Skips the definitions for words you already use. Same reading, same steps, fewer stops.',
      badge: 'Common terms assumed',
    },
    prompt: {
      vocabulary:
        'Plain and direct, but normal churched vocabulary is available.',
      terms:
        'Common terms — grace, covenant, gospel, epistle, repentance — are used without stopping to define them. Genuinely technical terms are still defined in the sentence where they appear.',
      originalLanguages:
        'A Greek or Hebrew word may appear where it carries real weight, always with its plain-English sense attached in the same sentence.',
      background:
        'Historical background may be referred to compactly where a normally-taught reader already has the frame.',
      sentences:
        'Short sentences, but a longer one is allowed where the thought is genuinely one thought.',
      expectedLength:
        'Shorter than the other level, because less has to be explained. Not because anything was cut.',
    },
  },
}

/**
 * Input aliases. NOT level ids and never shown to anyone.
 *
 * The rest of this round's code describes the reader as "the newcomer" in its
 * prose and its test fixtures, and validate.js's own example keys a variant map
 * as ({ standard, newcomer }). Those are labels for a person, so they are not
 * ids here — the id names what happens to the LANGUAGE, which is the whole
 * point of the naming rule at the top of this file.
 *
 * But a caller that passes 'newcomer' to levelBlock() must not silently receive
 * the standard register. That is the exact failure this feature exists to
 * prevent, arriving quietly through a vocabulary mismatch at a seam: no error,
 * no log, and a man who asked for every term explained gets a document that
 * assumes he already knows them. So the word maps to the right level instead of
 * falling through.
 */
const LEVEL_ALIASES = {
  newcomer: 'plain',
  beginner: 'plain',
  simple: 'plain',
  default: 'standard',
  normal: 'standard',
}

/** True when `level` is a level id this build knows about. */
function isLevel(level) {
  return typeof level === 'string' && Object.prototype.hasOwnProperty.call(LEVELS, level)
}

/** Normalises an id or a known alias to a level id, falling back to DEFAULT_LEVEL. */
function normalizeLevel(level) {
  if (isLevel(level)) return level
  if (typeof level === 'string') {
    const alias = LEVEL_ALIASES[level.trim().toLowerCase()]
    if (alias) return alias
  }
  return DEFAULT_LEVEL
}

/* ------------------------------------------------------------------ *
 * the prompt fragment
 *
 * Written so it CANNOT license a different conclusion. The invariant is stated
 * first, stated as an absolute, and stated before any instruction about words —
 * because a model that reads "write simply" before it reads "do not change the
 * finding" will simplify the finding. Order is doing work here.
 * ------------------------------------------------------------------ */

function levelBlock(level) {
  const id = normalizeLevel(level)
  const spec = LEVELS[id].prompt
  const other = id === 'plain' ? 'standard' : 'plain'

  return `
LANGUAGE LEVEL: ${id}

WHAT THIS SETTING DOES NOT TOUCH — read this before the rest.
This setting changes WORDS. It changes nothing else. The reading of the passage
is identical at every level. If this same passage were written at the "${other}"
level instead, every one of these would come out the same:

- the six steps, in the same order, all six present
- the outline: the same number of units, the same unit boundaries, the same
  verse ranges, the same nesting, the same overall structural pattern, and the
  same joint named between each unit and the one before it
- what the author is doing with the text, and where it does or does not connect
  to Christ
- which face the text works by, which face dominates, and what kind of step
  comes out of it
- whether there is a common misreading, and what it is
- whether honest readers differ here, at what rank, and how many positions are
  on the table
- the same NUMBER of restraints and the same NUMBER of unknowns, the handoff,
  and whether the passage is handled as a sensitive one

Those are THE READING. They do not have a beginner version. A reader on the
simpler setting reaches the SAME conclusion as a reader on the other one — he
just gets there in words he already owns. You are re-wording one finding. You
are not producing a second, gentler finding for someone you think can't take
the first one. He can. He asked for this.

THE OUTLINE IS WRITTEN AT THIS LEVEL TOO. Its headings, its logic lines and its
shape sentence are prose, and prose obeys the language rules below like every
other block. Each heading makes the SAME CLAIM about the text at both levels,
in the words this level calls for. Do not carry a heading over unchanged because
it was correct elsewhere. The outline is the first thing a reader scans, so a
heading he cannot read is the earliest place this document loses him.

  Same claim, standard: vv. 11-12 — a qualification of the thanks just given
  Same claim, plain:    vv. 11-12 — he narrows what he just said about the gift

COUNT THE GUARDRAILS BEFORE YOU FINISH. The restraints, the unknowns and the
handoff are the same in number at both levels. The simpler document is the
LONGER one, so if something started to feel like too much, the answer is never
to drop a fence or an open question. The reader on this setting is the one with
the least equipment to notice a guardrail is missing, which is exactly why it
may not go missing.

If a term is hard because the IDEA is hard, explain the idea at length. Do not
swap the idea for an easier one. Difficulty of vocabulary is yours to remove.
Difficulty of substance is the text's, and it stays.

WHAT THIS SETTING DOES CHANGE — the words, and only the words.
- Vocabulary: ${spec.vocabulary}
- Terms: ${spec.terms}
- Original languages: ${spec.originalLanguages}
- Background: ${spec.background}
- Sentences: ${spec.sentences}
- Expected length: ${spec.expectedLength}

Length is not a target and it is not a virtue in either direction. Do not trim
a restraint, an unknown, or the handoff to hit a feel. Do not pad to seem
thorough. Say the same true thing in the words this level calls for, and stop.
`.trim()
}

/* ------------------------------------------------------------------ *
 * THE STRUCTURAL INVARIANT
 *
 * This is the enforcement, and it is the whole point of the file.
 *
 * Prose is ALLOWED to differ — the six bodies, meaning.plain, distance, the
 * wording of each restraint, the handoff wording. That difference IS the
 * feature. The SKELETON is the reading, and the skeleton may not move.
 *
 * Each field carries a `get` that returns a canonical comparable value, so the
 * comparison is on MEANING-BEARING content rather than on key order or on
 * whitespace the model happened to emit.
 * ------------------------------------------------------------------ */

/**
 * THE OUTLINE IS COMPARED AS STRUCTURE, NOT AS PROSE. Read this before changing it.
 *
 * An earlier version of this file compared `heading`, `logic` and `shape`
 * verbatim. That inverted the feature. Those three fields are free prose that
 * renders to the reader, and the plain level's own rules — "no word a man who
 * has never been in a church would have to look up", "every technical term is
 * explained in the sentence it appears in" — REQUIRE them to be reworded. So a
 * correctly-written plain document was guaranteed to be rejected as a changed
 * reading, and the only way to pass was to leave the outline in the standard
 * register. The outline is the most-scanned block in the document. Freezing its
 * wording hands the newcomer the exact density this feature exists to remove,
 * and it does it in the one place he looks first.
 *
 * Measured, not assumed: a variant of the test fixture whose unit boundaries,
 * unit count, nesting and every structural claim were identical, reworded only
 * to obey the plain-level vocabulary rule, threw ReadingDivergedError on
 * `outline`. Meanwhile a variant that kept the outline byte-identical and shipped
 * two restraint fences instead of four, with the unknowns emptied, PASSED.
 *
 * What is compared now:
 *   - the unit refs, in order (the boundaries ARE the reading)
 *   - the unit COUNT and the nesting, recursively
 *   - whether each unit HAS a heading, and whether it HAS a logic joint — the
 *     first unit's null logic is a structural fact, and a unit that claims a
 *     joint at one level and none at the other has moved the reading
 *   - the shape's structural PATTERN where both levels name one (see below)
 *
 * What is not compared: the words. Whether a heading is TRUE of the text is not
 * a cross-level question anyway — it is a per-document question, and verify.js
 * already puts every heading in front of the adversarial checker on both
 * documents independently. Byte-equality across levels never tested truth; it
 * only tested sameness, and sameness is the thing that is supposed to move.
 */

const isFilled = (v) => typeof v === 'string' && v.trim().length > 0

/**
 * Structural patterns a `shape` sentence can name, keyed to the vocabulary
 * prompt.js actually hands the model in its SHAPE section, plus the plain-English
 * paraphrases the register is likely to reach for instead of the term.
 *
 * This is a FLOOR, not a full parse. It exists to keep one specific guard alive
 * after prose comparison was dropped: prompt.js says a manufactured chiasm is a
 * worse error than calling a passage linear, because "they have no way to catch
 * you at it". A document that claims a fold at one level and a straight line at
 * the other has moved the reading, and that is worth catching even though a
 * general comparison of two English sentences is not available offline.
 */
const SHAPE_PATTERNS = [
  ['chiasm', /chiasm|chiastic|folds? in the middle|folds? back on itself|inverted parallel/i],
  ['inclusio', /inclusio|bookend|opens and closes with/i],
  ['linear', /\blinear\b|straight through|runs straight|start to finish/i],
  ['problem-resolution', /problem then resolution|problem,? then .{0,20}(resolution|solution)/i],
  ['indicative-imperative', /indicative then imperative|statement then command/i],
  ['call-response', /call[- ]and[- ]response/i],
  ['narrative-arc', /narrative arc|rising action/i],
]

function shapePatterns(shape) {
  if (!isFilled(shape)) return []
  return SHAPE_PATTERNS.filter(([, re]) => re.test(shape)).map(([name]) => name)
}

/** Recursively canonicalise one outline unit to the fields that are the reading. */
function canonUnit(unit) {
  const u = unit || {}
  const children = Array.isArray(u.children) ? u.children.map(canonUnit) : null
  return {
    ref: u.ref ?? null,
    // Presence, not wording. A dropped heading is a real loss; a reworded one
    // is the feature.
    heading: isFilled(u.heading) ? 'present' : 'missing',
    // null on the first unit is meaningful — it says nothing came before.
    logic: isFilled(u.logic) ? 'present' : 'none',
    children,
  }
}

function canonOutline(doc) {
  const o = doc?.outline
  if (!o) return null
  return {
    shape: isFilled(o.shape) ? 'present' : 'missing',
    units: Array.isArray(o.units) ? o.units.map(canonUnit) : null,
  }
}

/**
 * Compares the structural pattern two `shape` sentences name.
 *
 * Divergent ONLY when both sides name a pattern and the two sets share nothing.
 * Overlap counts as agreement, so a level that extracts one label where the
 * other extracted two — the likely outcome of rewording — does not raise a false
 * alarm. When either side names nothing recognisable the comparison abstains,
 * because an unrecognised sentence is not evidence of disagreement.
 */
function canonShapePattern(doc) {
  return shapePatterns(doc?.outline?.shape)
}

const STRUCTURAL_FIELDS = [
  {
    path: 'outline',
    label: 'outline (unit refs, unit count, nesting, heading/logic presence)',
    get: canonOutline,
  },
  {
    // Not 'outline.shape' — the shape SENTENCE is prose and stays free. What is
    // compared is only the structural pattern that sentence names.
    path: 'outline.shape.pattern',
    label: 'outline.shape.pattern (the structural pattern it names)',
    get: canonShapePattern,
    // Abstains unless both sides name a pattern and the sets are disjoint.
    same: (a, b) => {
      if (!a.length || !b.length) return true
      return a.some((p) => b.includes(p))
    },
  },
  {
    path: 'work.christPathway',
    label: 'work.christPathway',
    get: (d) => d?.work?.christPathway ?? null,
  },
  {
    path: 'application.faces',
    label: 'application.faces',
    // Sorted on purpose. `faces` answers "which faces does this text work by",
    // which is a SET — ['duty','character'] and ['character','duty'] are the
    // same finding, and throwing on the order would block a good pair for a
    // difference that carries no meaning. Which face WINS is not a set, and it
    // is compared exactly, on its own, in the next entry.
    get: (d) => (Array.isArray(d?.application?.faces) ? [...d.application.faces].sort() : null),
  },
  {
    path: 'application.dominantFace',
    label: 'application.dominantFace',
    get: (d) => d?.application?.dominantFace ?? null,
  },
  {
    path: 'application.step.kind',
    label: 'application.step.kind',
    get: (d) => d?.application?.step?.kind ?? null,
  },
  {
    path: 'meaning.misread.exists',
    label: 'meaning.misread.exists',
    // validate.js nulls the whole misread block when exists is false, so a null
    // block and an explicit false are the same finding and must compare equal.
    get: (d) => {
      const m = d?.meaning?.misread
      if (m === null || m === undefined) return false
      return Boolean(m.exists)
    },
  },
  {
    path: 'differ.tier',
    label: 'differ.tier',
    // differ is nullable in the schema; an absent block ranks nothing.
    get: (d) => d?.differ?.tier ?? null,
  },
  {
    path: 'differ.views.length',
    label: 'differ.views.length',
    // COUNT, not content. How many positions are on the table is the reading.
    // How each one is worded is prose, and prose is allowed to differ.
    get: (d) => (Array.isArray(d?.differ?.views) ? d.differ.views.length : 0),
  },
  {
    path: 'sensitive',
    label: 'sensitive',
    get: (d) => Boolean(d?.sensitive),
  },

  /* --- the guardrails ------------------------------------------------ *
   *
   * These three were promised and unenforced. levelBlock() tells the model
   * that "every restraint, every unknown, the handoff" comes out the same at
   * both levels, and voice.js says in its own words that restraints, unknowns
   * and the handoff are "not padding and they are not optional at any length"
   * because "the reader who most needs the guardrails is the man who just
   * started". Nothing checked any of it. Measured: a document identical in
   * every other respect that shipped two restraint fences instead of four with
   * the unknowns emptied passed assertSameReading clean.
   *
   * That is the worst failure this file can have. The plain level is LONGER by
   * design, so the pressure to drop something to keep it manageable lands
   * exactly on the blocks that are cheapest to cut and costliest to lose — and
   * it lands on the reader with the least equipment to notice they are gone.
   *
   * COUNTS, not content. The wording of each fence is prose and is supposed to
   * move; how many fences the reader is handed is the reading.
   * ------------------------------------------------------------------- */
  {
    path: 'restraint.length',
    label: 'restraint.length (how many fences the reader is handed)',
    get: (d) => (Array.isArray(d?.restraint) ? d.restraint.filter(isFilled).length : 0),
  },
  {
    path: 'unknowns.length',
    label: 'unknowns.length (how many open questions are admitted)',
    get: (d) => (Array.isArray(d?.unknowns) ? d.unknowns.filter(isFilled).length : 0),
  },
  // The handoff is deliberately NOT here. validate.js already throws on an empty
  // handoff in EVERY document at every level, so its presence cannot diverge —
  // a field here would duplicate a guarantee that already holds and would lock a
  // prose field this file promises to leave free. Its wording moves like the
  // rest of the prose.
]

class ReadingDivergedError extends Error {
  constructor(message, fields) {
    super(message)
    this.name = 'ReadingDivergedError'
    /** @type {{path:string,label:string,a:string,b:string}[]} */
    this.fields = fields
  }
}

function preview(value) {
  const s = JSON.stringify(value)
  if (s === undefined) return 'undefined'
  return s.length > 220 ? `${s.slice(0, 217)}...` : s
}

/**
 * Throws if two documents for the SAME passage disagree on anything that is
 * the reading rather than the wording.
 *
 * Intended use: docA and docB are the same passage at two language levels. The
 * error lists EVERY field that diverged, not the first one, because a reading
 * that drifted has usually drifted in more than one place and fixing them one
 * error at a time wastes a generation each round.
 *
 * @param {object} docA
 * @param {object} docB
 * @param {object} [opts]
 * @param {string} [opts.labelA] what to call docA in the error, e.g. a level id
 * @param {string} [opts.labelB]
 * @throws {ReadingDivergedError}
 * @returns {true} when the two documents carry the same reading
 */
function assertSameReading(docA, docB, { labelA = 'A', labelB = 'B' } = {}) {
  if (!docA || !docB) {
    throw new ReadingDivergedError(
      'assertSameReading: both documents are required', []
    )
  }

  const diverged = []
  for (const field of STRUCTURAL_FIELDS) {
    const rawA = field.get(docA) ?? null
    const rawB = field.get(docB) ?? null
    // A field may carry its own comparator when byte-equality is the wrong
    // test — outline.shape abstains rather than raise a false alarm on two
    // sentences that name the same pattern in different words. Default stays
    // exact, so adding a field without a comparator keeps the strict behaviour.
    const equal = typeof field.same === 'function'
      ? field.same(rawA, rawB)
      : JSON.stringify(rawA) === JSON.stringify(rawB)
    if (!equal) {
      diverged.push({
        path: field.path,
        label: field.label,
        a: preview(field.get(docA)),
        b: preview(field.get(docB)),
      })
    }
  }

  if (diverged.length) {
    const lines = diverged.map(
      (d) => `  - ${d.label}\n      ${labelA}: ${d.a}\n      ${labelB}: ${d.b}`
    )
    throw new ReadingDivergedError(
      `The two documents are not the same reading. ` +
        `${diverged.length} structural field${diverged.length === 1 ? '' : 's'} diverged ` +
        `between ${labelA} and ${labelB}:\n${lines.join('\n')}\n` +
        `Language may differ between levels. The reading may not.`,
      diverged
    )
  }

  return true
}

module.exports = {
  LEVELS,
  LEVEL_IDS,
  LEVEL_ALIASES,
  DEFAULT_LEVEL,
  isLevel,
  normalizeLevel,
  levelBlock,
  STRUCTURAL_FIELDS,
  assertSameReading,
  ReadingDivergedError,
  SHAPE_PATTERNS,
  shapePatterns,
}
