/**
 * test-levels.js — checks on the language level and the structural invariant.
 *
 * NO API KEY. Nothing here calls a model. The fixtures below are hand-built
 * documents, and the whole point of the file is that a divergence in the
 * READING is catchable without spending a generation to find it.
 *
 *   node electron/plainread/test-levels.js
 */

const {
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
  shapePatterns,
} = require('./levels')
/*
 * The real regexes and the real level-checking entry point, straight from
 * validate.js. Required plainly — if validate.js will not load, this file
 * should fail loudly rather than route around it. See the note in
 * test-voice.js.
 */
const {
  PULPIT_LEAK,
  FENCE_DISCLOSURE,
  assertSameReadingAcrossLevels,
  PlainReadValidationError,
} = require('./validate')

let passed = 0
let failed = 0

function check(name, fn) {
  try {
    fn()
    passed++
    console.log(`  PASS  ${name}`)
  } catch (err) {
    failed++
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err.message}`)
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/** Runs fn, requires it to throw a ReadingDivergedError naming `field`. */
function throwsOn(field, fn) {
  let err = null
  try {
    fn()
  } catch (e) {
    err = e
  }
  assert(err, 'expected a throw, got none')
  assert(
    err instanceof ReadingDivergedError,
    `expected ReadingDivergedError, got ${err.name}: ${err.message}`
  )
  const named = err.fields.some((f) => f.path === field)
  assert(named, `error did not name "${field}". named: ${err.fields.map((f) => f.path).join(', ') || '(none)'}`)
}

const clone = (o) => JSON.parse(JSON.stringify(o))

/* ------------------------------------------------------------------ *
 * FIXTURES
 *
 * Two documents for the same passage. Same reading, different words — this is
 * exactly the pair the feature is supposed to produce. STANDARD is the current
 * register. PLAIN is longer, defines its terms in place, and uses no
 * untranslated Greek. Nothing structural moves between them.
 * ------------------------------------------------------------------ */

const STANDARD_DOC = {
  reference: 'Philippians 4:10-13',
  sensitive: false,
  meaning: {
    plain:
      'Paul thanks the Philippians for a gift and immediately guards against the idea that he needed it to be content.',
    misread: {
      exists: true,
      claim: 'Verse 13 promises that a believer can accomplish anything he sets out to do.',
      whyNot: 'The "all things" is bounded by verses 11-12, which are about plenty and hunger.',
      biggerNotSmaller:
        'The real claim is heavier than the slogan: strength to be content in either direction.',
    },
    assumes: 'That the reader knows a gift in that world carried obligation.',
    level: null,
  },
  work: {
    genre: {
      body: 'A letter, and the closing section of one.',
      youCanCheck: 'Read 4:10 and 4:18 back to back and notice both are about money.',
      theMove: 'Locate a verse inside the letter section it belongs to before quoting it.',
    },
    setting: {
      body: 'Written from custody to a church that had sent support.',
      youCanCheck: 'Read 1:12-14 and note the author names his imprisonment.',
      theMove: 'Ask what the writer’s circumstances cost him before reading his tone.',
    },
    surroundings: {
      body: 'Verse 13 sits between the contentment claim and the thanks that follow.',
      youCanCheck: 'Read v.12 and v.14 with v.13 covered, then uncover it.',
      theMove: 'Read the verse before and the verse after any verse you want to quote.',
    },
    words: {
      body: 'The verb behind "learned" points at a process, not a state.',
      youCanCheck: 'Count how many times "learned" appears in vv. 11-12.',
      theMove: 'Watch for repeated words inside a short span.',
    },
    story: {
      body: 'Contentment here is grounded in provision, not in stoic detachment.',
      youCanCheck: 'Compare with the manna account and note who supplies.',
      theMove: 'Ask which older pattern a New Testament claim is standing on.',
    },
    doing: {
      body: 'He is thanking them without making himself dependent on them.',
      youCanCheck: 'Notice he never asks for more.',
      theMove: 'Ask what the writer is doing, not only what he is saying.',
    },
    christPathway: 'thematic-fulfillment',
  },
  distance:
    'A first-century gift created obligation between giver and receiver; a modern reader hears only generosity.',
  application: {
    faces: ['character', 'goals'],
    dominantFace: 'character',
    toThemFirst: 'They were asked to give without buying influence.',
    thenToYou: 'You are asked to notice what your contentment is actually resting on.',
    step: {
      kind: 'practice',
      cue: 'When you catch yourself calculating what you still need.',
      action: 'Name out loud the one thing you already have that you were counting as missing.',
      question: null,
    },
  },
  restraint: [
    'This does not promise that circumstances improve.',
    'This does not make poverty a virtue or wealth a sin.',
  ],
  differ: {
    tier: 'tertiary',
    summary:
      'Ranked tertiary here: Christians in one congregation hold both and stay in fellowship.',
    views: [
      'Some read v.13 as strength for the specific circumstances just named.',
      'Some read it as a general grant of strength for any assignment given.',
    ],
  },
  unknowns: ['Whether the gift arrived before or after the hearing is not stated.'],
  handoff:
    'If this is landing on a real shortage, take it to a pastor or someone you trust in a church near you. If what you are carrying is heavier than a hard season, that is a doctor or a counselor, today.',
  outline: {
    shape: 'Thanks, then a bounded claim, then a summary line.',
    units: [
      {
        ref: 'v. 10',
        heading: 'the thanks, and the reason for the delay is named for them',
        logic: null,
        children: null,
      },
      {
        ref: 'vv. 11-12',
        heading: 'the claim: he learned contentment in both directions',
        logic: 'a qualification of the thanks just given',
        children: null,
      },
      {
        ref: 'v. 13',
        heading: 'the summary line, bounded by the two verses before it',
        logic: 'restatement that gathers vv. 11-12 into one sentence',
        children: null,
      },
    ],
  },
}

/** Same reading. Every prose field re-worded, and longer. Nothing structural moved. */
const PLAIN_DOC = clone(STANDARD_DOC)
PLAIN_DOC.meaning.plain =
  'Paul says thank you for money that a church sent him. Then he turns around and makes sure they do not think he was falling apart without it. Both halves matter, and he puts them right next to each other on purpose.'
PLAIN_DOC.meaning.misread.claim =
  'A lot of people read verse 13 as a promise that they can pull off anything they decide to attempt.'
PLAIN_DOC.meaning.misread.whyNot =
  'The words "all things" are not floating loose. The two verses before them say what "all things" means here, and both are about having plenty and about going hungry.'
PLAIN_DOC.meaning.misread.biggerNotSmaller =
  'What it actually claims is harder than the poster version, not easier. It claims strength to stay steady with a full plate and with an empty one.'
PLAIN_DOC.meaning.assumes =
  'It assumes you know that accepting a gift in that world put you in someone’s debt socially, which is why the thank-you is so carefully worded.'
PLAIN_DOC.work.genre.body =
  'This is a letter. Not a poem, not a story, not a list of laws. A real man wrote it to real people who knew him, and this piece of it is near the end, where letters in that world handled money and travel and goodbyes.'
PLAIN_DOC.work.setting.body =
  'He wrote it while he was locked up. A prison then did not feed you; people on the outside brought food or you went without. That is why a church sending money is the center of this section and not a polite footnote.'
PLAIN_DOC.work.words.body =
  'The word translated "learned" is the kind of word you use for a skill somebody picked up over time, not for a mood that showed up one morning. He is saying it took him a while.'
PLAIN_DOC.distance =
  'When somebody handed you a gift in that world, you owed them something back, and everyone watching knew it. A reader today just hears kindness with no strings, so the care he takes here looks like overthinking when it was not.'
PLAIN_DOC.application.thenToYou =
  'You are asked to look at what your own steadiness is actually sitting on. Not to feel bad about it. To look at it.'
PLAIN_DOC.restraint = [
  'This is not a promise that your situation gets better. He wrote it from a cell and the cell did not open.',
  'This does not say being broke makes you holy, and it does not say having money makes you guilty. He says he has been on both sides of that line.',
]
PLAIN_DOC.differ.summary =
  'Ranked tertiary here, which means people in the same church land in different places on it and stay in the same church.'
PLAIN_DOC.differ.views = [
  'Some readers take verse 13 as strength for the exact situations he just listed, and nothing wider.',
  'Some readers take it as strength for whatever a person is handed to do.',
]
PLAIN_DOC.handoff =
  'If this is landing on a real shortage in your life, take it to a pastor, or to a believer you trust, or to somebody in a local church near you. And if what you are carrying is heavier than a hard season, that is a doctor or a counselor, today.'

console.log('\ntest-levels.js\n')

/* ------------------------------------------------------------------ */
console.log('levels')

check('exactly two levels ship', () => {
  assert(LEVEL_IDS.length === 2, `${LEVEL_IDS.length} levels, wanted 2`)
  assert(LEVEL_IDS.includes('plain') && LEVEL_IDS.includes('standard'),
    `got ${LEVEL_IDS.join(', ')}`)
  assert(Object.keys(LEVELS).length === 2, 'LEVELS has a level not in LEVEL_IDS')
})

check('the default is a real level', () => {
  assert(isLevel(DEFAULT_LEVEL), `${DEFAULT_LEVEL} is not a level`)
})

check('normalizeLevel falls back instead of throwing', () => {
  assert(normalizeLevel('plain') === 'plain', 'plain did not survive')
  assert(normalizeLevel('standard') === 'standard', 'standard did not survive')
  assert(normalizeLevel('gibberish') === DEFAULT_LEVEL, 'unknown level did not fall back')
  assert(normalizeLevel(undefined) === DEFAULT_LEVEL, 'undefined did not fall back')
  assert(normalizeLevel(null) === DEFAULT_LEVEL, 'null did not fall back')
  assert(normalizeLevel(7) === DEFAULT_LEVEL, 'a number did not fall back')
})

check('"newcomer" resolves to the plain level, not silently to standard', () => {
  // The rest of this round says "newcomer" in its prose and its fixtures. If
  // that word ever reaches levelBlock() it must produce the hand-held
  // document, not quietly produce the other one.
  assert(normalizeLevel('newcomer') === 'plain', 'newcomer did not resolve to plain')
  assert(normalizeLevel('Newcomer') === 'plain', 'alias is case-sensitive')
  assert(normalizeLevel(' newcomer ') === 'plain', 'alias does not tolerate whitespace')
  assert(levelBlock('newcomer') === levelBlock('plain'), 'alias produced a different block')
  assert(levelBlock('newcomer') !== levelBlock('standard'),
    'newcomer silently produced the standard register — the exact quiet failure')
})

check('aliases never become user-facing ids', () => {
  for (const alias of Object.keys(LEVEL_ALIASES)) {
    assert(!LEVEL_IDS.includes(alias), `"${alias}" leaked into LEVEL_IDS`)
    assert(LEVEL_IDS.includes(LEVEL_ALIASES[alias]),
      `alias "${alias}" points at "${LEVEL_ALIASES[alias]}", which is not a level`)
  }
})

check('every user-facing string describes the OUTPUT, never the reader', () => {
  // Nobody should have to file himself under a label to use this. A UI string
  // that ranks the man is the failure this test exists to catch.
  const RANKS_THE_READER =
    /\b(beginner|novice|newbie|basic|simple mode|dumbed|advanced|expert|intermediate|scholar mode|for new believers|new to (the )?bible|level \d)\b/i
  for (const id of LEVEL_IDS) {
    for (const [key, value] of Object.entries(LEVELS[id].ui)) {
      const hit = value.match(RANKS_THE_READER)
      assert(!hit, `LEVELS.${id}.ui.${key} ranks the reader: "${hit && hit[0]}"`)
      assert(value.trim().length > 0, `LEVELS.${id}.ui.${key} is empty`)
    }
  }
})

check('the two option labels are the proposed user-facing strings', () => {
  assert(LEVELS.plain.ui.label === 'Explain every term',
    `plain label is "${LEVELS.plain.ui.label}"`)
  assert(LEVELS.standard.ui.label === 'Assume I know the terms',
    `standard label is "${LEVELS.standard.ui.label}"`)
  assert(LEVELS.plain.ui.controlLabel === LEVELS.standard.ui.controlLabel,
    'the two options disagree on what the control is called')
})

/* ------------------------------------------------------------------ */
console.log('\nlevelBlock')

check('levelBlock returns a non-empty string per level', () => {
  for (const id of LEVEL_IDS) {
    const b = levelBlock(id)
    assert(typeof b === 'string', `${id}: not a string`)
    assert(b.trim().length > 0, `${id}: empty`)
  }
})

check('levelBlock returns a DISTINCT string per level', () => {
  assert(levelBlock('plain') !== levelBlock('standard'), 'both levels produced the same block')
})

check('levelBlock states the invariant before it states the word rules', () => {
  for (const id of LEVEL_IDS) {
    const b = levelBlock(id)
    const invariant = b.indexOf('WHAT THIS SETTING DOES NOT TOUCH')
    const words = b.indexOf('WHAT THIS SETTING DOES CHANGE')
    assert(invariant !== -1, `${id}: invariant block missing`)
    assert(words !== -1, `${id}: word-rules block missing`)
    assert(invariant < words, `${id}: word rules come before the invariant`)
  }
})

check('levelBlock names each protected field so it cannot be re-decided', () => {
  const must = ['outline', 'restraint', 'unknown', 'handoff', 'misread', 'face', 'six steps']
  for (const id of LEVEL_IDS) {
    const b = levelBlock(id).toLowerCase()
    for (const m of must) {
      assert(b.includes(m), `${id}: invariant never mentions "${m}"`)
    }
  }
})

check('levelBlock forbids softening the conclusion', () => {
  for (const id of LEVEL_IDS) {
    const b = levelBlock(id).replace(/\s+/g, ' ').toLowerCase()
    assert(b.includes('reaches the same conclusion'), `${id}: same-conclusion rule missing`)
    assert(b.includes('do not swap the idea for an easier one'),
      `${id}: nothing stops the model swapping a hard idea for an easy one`)
  }
})

check('levelBlock smuggles in no length target', () => {
  const BUDGET = /\b(no more than|at most|maximum of)\s+\w+\s+(sentences?|words?|paragraphs?)\b|\bkeep it (short|brief)\b/i
  for (const id of LEVEL_IDS) {
    const hit = levelBlock(id).match(BUDGET)
    assert(!hit, `${id}: length cap leaked in: "${hit && hit[0]}"`)
  }
})

check('levelBlock does not trip PULPIT_LEAK', () => {
  for (const id of LEVEL_IDS) {
    const hit = levelBlock(id).match(PULPIT_LEAK)
    assert(!hit, `${id}: matched "${hit && hit[0]}"`)
  }
})

check('levelBlock does not trip FENCE_DISCLOSURE', () => {
  for (const id of LEVEL_IDS) {
    const hit = levelBlock(id).match(FENCE_DISCLOSURE)
    assert(!hit, `${id}: matched "${hit && hit[0]}"`)
  }
})

check('levelBlock survives an unknown level', () => {
  assert(levelBlock('nonsense') === levelBlock(DEFAULT_LEVEL), 'no fallback')
})

/* ------------------------------------------------------------------ */
console.log('\nassertSameReading — the pair that should PASS')

check('a doc identical to itself passes', () => {
  assert(assertSameReading(STANDARD_DOC, STANDARD_DOC) === true, 'did not return true')
})

check('two docs differing ONLY in prose pass', () => {
  // Sanity: the fixtures really do differ in prose, or this proves nothing.
  assert(PLAIN_DOC.meaning.plain !== STANDARD_DOC.meaning.plain, 'fixtures are identical')
  assert(PLAIN_DOC.work.genre.body !== STANDARD_DOC.work.genre.body, 'bodies are identical')
  assert(PLAIN_DOC.distance !== STANDARD_DOC.distance, 'distance is identical')
  assert(PLAIN_DOC.handoff !== STANDARD_DOC.handoff, 'handoff is identical')
  assert(
    JSON.stringify(PLAIN_DOC).length > JSON.stringify(STANDARD_DOC).length,
    'the plain doc is not longer, so it is not the document this feature produces'
  )
  assertSameReading(PLAIN_DOC, STANDARD_DOC, { labelA: 'plain', labelB: 'standard' })
})

check('restraint WORDING may differ when the COUNT is the same', () => {
  const a = clone(STANDARD_DOC)
  const b = clone(STANDARD_DOC)
  b.restraint = [
    'Nothing here says your situation is about to improve.',
    'Being broke is not holiness and having money is not guilt.',
  ]
  assert(a.restraint.length === b.restraint.length, 'fixture changed the count')
  assert(a.restraint[0] !== b.restraint[0], 'fixture did not change the wording')
  assertSameReading(a, b)
})

check('differ VIEW wording may differ when the count is the same', () => {
  const a = clone(STANDARD_DOC)
  const b = clone(STANDARD_DOC)
  b.differ.views = [
    'One side keeps verse 13 tied to the situations he just listed.',
    'The other side reads it as strength for anything a person is handed.',
  ]
  assertSameReading(a, b)
})

check('faces in a different ORDER still pass; dominantFace is what is exact', () => {
  const a = clone(STANDARD_DOC)
  const b = clone(STANDARD_DOC)
  b.application.faces = ['goals', 'character']
  assertSameReading(a, b)
})

/* ------------------------------------------------------------------ *
 * THE OUTLINE IS PROSE TOO.
 *
 * These four guard the fix for the inversion this file used to have: heading,
 * logic and shape were compared verbatim, so a plain document that obeyed its
 * own vocabulary rule in the outline was rejected as a changed reading, and the
 * only way to pass was to leave the outline in the standard register. The
 * outline is the first block a reader scans.
 * ------------------------------------------------------------------ */

check('a REWORDED outline heading passes — that is the whole feature', () => {
  const b = clone(STANDARD_DOC)
  b.outline.units[1].heading =
    'the claim: he learned how to be steady whether he had plenty or nothing'
  assertSameReading(STANDARD_DOC, b)
})

check('a REWORDED logic joint passes; the joint is still named', () => {
  const b = clone(STANDARD_DOC)
  b.outline.units[1].logic = 'he narrows the thank-you he just gave'
  b.outline.units[2].logic = 'he says vv. 11-12 over again in one sentence'
  assertSameReading(STANDARD_DOC, b)
})

check('a REWORDED shape sentence passes when it names no rival pattern', () => {
  const b = clone(STANDARD_DOC)
  b.outline.shape =
    'He says thank you, then he narrows what he means, then he sums it up in one line.'
  assertSameReading(STANDARD_DOC, b)
})

check('a whole legitimately-plain outline passes end to end', () => {
  const b = clone(STANDARD_DOC)
  b.outline.shape =
    'He says thank you, then he narrows what he means, then he sums it up in one line.'
  b.outline.units[1].heading =
    'the claim: he learned how to be steady whether he had plenty or nothing'
  b.outline.units[1].logic = 'he narrows the thank-you he just gave'
  b.outline.units[2].logic = 'he says vv. 11-12 over again in one sentence'
  assertSameReading(STANDARD_DOC, b, { labelA: 'standard', labelB: 'plain' })
})

/* ------------------------------------------------------------------ */
console.log('\nassertSameReading — the divergences that must THROW')

check('a DROPPED outline heading throws', () => {
  const b = clone(STANDARD_DOC)
  b.outline.units[1].heading = ''
  throwsOn('outline', () => assertSameReading(STANDARD_DOC, b))
})

check('a unit that GAINS a logic joint where there was none throws', () => {
  const b = clone(STANDARD_DOC)
  // The first unit has nothing before it. Claiming a joint there is a claim
  // about the text, not a choice of words.
  b.outline.units[0].logic = 'it follows from the paragraph before the passage'
  throwsOn('outline', () => assertSameReading(STANDARD_DOC, b))
})

check('a unit that LOSES its logic joint throws', () => {
  const b = clone(STANDARD_DOC)
  b.outline.units[2].logic = null
  throwsOn('outline', () => assertSameReading(STANDARD_DOC, b))
})

check('a shape naming a DIFFERENT structural pattern throws', () => {
  const a = clone(STANDARD_DOC)
  a.outline.shape = 'The passage is a chiasm folding on v. 12.'
  const b = clone(STANDARD_DOC)
  b.outline.shape = 'It runs straight through, start to finish.'
  throwsOn('outline.shape.pattern', () => assertSameReading(a, b))
})

check('a shape reworded around the SAME pattern passes', () => {
  const a = clone(STANDARD_DOC)
  a.outline.shape = 'The passage is a chiasm centred on v. 12.'
  const b = clone(STANDARD_DOC)
  b.outline.shape =
    'The passage folds in the middle. The first line and the last line say the same thing.'
  assertSameReading(a, b)
})

check('a changed dominantFace throws', () => {
  const b = clone(STANDARD_DOC)
  b.application.dominantFace = 'duty'
  throwsOn('application.dominantFace', () => assertSameReading(STANDARD_DOC, b))
})

check('KNOWN LIMIT: a pattern claimed at one level only is NOT caught', () => {
  // Recorded rather than hidden. The shape comparison abstains unless BOTH
  // sentences name a recognisable pattern, because a plain-level sentence that
  // explains a fold without using the word "chiasm" yields nothing to compare —
  // and a false alarm there blocks a good document and tells the reader the two
  // levels disagree about the passage when they do not.
  //
  // The cost: a chiasm asserted at one level against an unrecognised sentence
  // at the other passes here. That claim is still checked per document by
  // verify.js, which is where "is this true of the text" belongs; comparing two
  // levels never tested truth, only sameness.
  const b = clone(STANDARD_DOC)
  b.outline.shape = 'A chiasm centred on v. 12.'
  assert(shapePatterns(STANDARD_DOC.outline.shape).length === 0,
    'fixture shape now names a pattern; this test no longer probes the abstain')
  assertSameReading(STANDARD_DOC, b)
})

check('a changed unit REF throws', () => {
  const b = clone(STANDARD_DOC)
  b.outline.units[1].ref = 'vv. 11-13'
  throwsOn('outline', () => assertSameReading(STANDARD_DOC, b))
})

check('a DROPPED restraint fence throws — the guardrails do not thin out', () => {
  const b = clone(STANDARD_DOC)
  assert(STANDARD_DOC.restraint.length === 2, 'fixture no longer has 2 fences')
  b.restraint = b.restraint.slice(0, 1)
  throwsOn('restraint.length', () => assertSameReading(STANDARD_DOC, b))
})

check('a DROPPED unknown throws', () => {
  const b = clone(STANDARD_DOC)
  b.unknowns = []
  throwsOn('unknowns.length', () => assertSameReading(STANDARD_DOC, b))
})

check('the handoff is left to validate.js, which requires it in every document', () => {
  // Not compared here on purpose: an empty handoff is already fatal at BOTH
  // levels, so it cannot diverge, and locking it would freeze prose this file
  // promises to leave free.
  const b = clone(STANDARD_DOC)
  b.handoff = 'Take it to a pastor. If it is heavier than a hard season, a doctor or counselor, today.'
  assert(b.handoff !== STANDARD_DOC.handoff, 'fixture did not change the wording')
  assertSameReading(STANDARD_DOC, b)
})

check('the live Ephesians failure mode: the differ block vanishes at one level', () => {
  // Reproduces what a real generation actually did. The standard document
  // reported a tertiary dispute with two named views; the plain document
  // omitted the block entirely, handing the newcomer a confident single
  // reading of the exact clause the tradition splits over.
  const b = clone(STANDARD_DOC)
  b.differ = null
  throwsOn('differ.tier', () => assertSameReading(STANDARD_DOC, b))
})

check('a dropped outline unit throws', () => {
  const b = clone(STANDARD_DOC)
  b.outline.units = b.outline.units.slice(0, 2)
  throwsOn('outline', () => assertSameReading(STANDARD_DOC, b))
})

check('a changed christPathway throws', () => {
  const b = clone(STANDARD_DOC)
  b.work.christPathway = null
  throwsOn('work.christPathway', () => assertSameReading(STANDARD_DOC, b))
})

check('a changed step.kind throws', () => {
  const b = clone(STANDARD_DOC)
  b.application.step.kind = 'plan'
  throwsOn('application.step.kind', () => assertSameReading(STANDARD_DOC, b))
})

check('a face added on one level only throws', () => {
  const b = clone(STANDARD_DOC)
  b.application.faces = ['character', 'goals', 'duty']
  throwsOn('application.faces', () => assertSameReading(STANDARD_DOC, b))
})

check('a dropped misread throws', () => {
  const b = clone(STANDARD_DOC)
  b.meaning.misread = null
  throwsOn('meaning.misread.exists', () => assertSameReading(STANDARD_DOC, b))
})

check('an explicit exists:false and a null misread compare EQUAL', () => {
  // validate.js nulls the block when exists is false. Both are the same finding.
  const a = clone(STANDARD_DOC)
  const b = clone(STANDARD_DOC)
  a.meaning.misread = null
  b.meaning.misread = { exists: false, claim: '', whyNot: '', biggerNotSmaller: '' }
  assertSameReading(a, b)
})

check('a changed differ.tier throws', () => {
  const b = clone(STANDARD_DOC)
  b.differ.tier = 'secondary'
  throwsOn('differ.tier', () => assertSameReading(STANDARD_DOC, b))
})

check('a dropped differ view throws on the COUNT', () => {
  const b = clone(STANDARD_DOC)
  b.differ.views = [b.differ.views[0]]
  throwsOn('differ.views.length', () => assertSameReading(STANDARD_DOC, b))
})

check('a flipped sensitive flag throws', () => {
  const b = clone(STANDARD_DOC)
  b.sensitive = true
  throwsOn('sensitive', () => assertSameReading(STANDARD_DOC, b))
})

check('the error lists EVERY diverged field, not just the first', () => {
  const b = clone(STANDARD_DOC)
  b.outline.units[0].heading = ''
  b.application.dominantFace = 'duty'
  b.sensitive = true
  let err = null
  try {
    assertSameReading(STANDARD_DOC, b, { labelA: 'plain', labelB: 'standard' })
  } catch (e) {
    err = e
  }
  assert(err, 'did not throw')
  const paths = err.fields.map((f) => f.path)
  assert(paths.includes('outline'), 'outline not listed')
  assert(paths.includes('application.dominantFace'), 'dominantFace not listed')
  assert(paths.includes('sensitive'), 'sensitive not listed')
  assert(err.message.includes('plain') && err.message.includes('standard'),
    'labels missing from the message')
})

check('a missing document throws rather than passing silently', () => {
  let threw = false
  try { assertSameReading(STANDARD_DOC, null) } catch { threw = true }
  assert(threw, 'a null document passed')
})

check('STRUCTURAL_FIELDS covers exactly the agreed list', () => {
  const want = [
    'outline',
    'work.christPathway',
    'application.faces',
    'application.dominantFace',
    'application.step.kind',
    'meaning.misread.exists',
    'differ.tier',
    'differ.views.length',
    'sensitive',
    // The shape SENTENCE stays prose; only the pattern it names is compared.
    'outline.shape.pattern',
    // The guardrails, by COUNT. Their wording moves; how many the reader is
    // handed does not.
    'restraint.length',
    'unknowns.length',
  ].sort()
  const got = STRUCTURAL_FIELDS.map((f) => f.path).sort()
  assert(JSON.stringify(want) === JSON.stringify(got),
    `\n        want: ${want.join(', ')}\n        got:  ${got.join(', ')}`)
})

check('PROSE fields are NOT in the invariant — the difference is the feature', () => {
  const paths = STRUCTURAL_FIELDS.map((f) => f.path)
  const prose = [
    'meaning.plain', 'distance', 'restraint', 'handoff', 'unknowns',
    'differ.views', 'differ.summary', 'outline.shape',
    'work.genre.body', 'work.setting.body', 'work.surroundings.body',
    'work.words.body', 'work.story.body', 'work.doing.body',
    'application.toThemFirst', 'application.thenToYou',
  ]
  for (const p of prose) {
    assert(!paths.includes(p), `${p} is locked, but prose must be free to differ`)
  }
})

/* ------------------------------------------------------------------ *
 * THE SEAM
 *
 * validate.js owns assertSameReadingAcrossLevels and delegates to this file's
 * assertSameReading when this file is present. That delegation is the whole
 * integration, and it is worth proving rather than assuming — the two files
 * were written by different agents in the same round, against a described
 * interface neither one could see the other build.
 * ------------------------------------------------------------------ */
console.log('\nintegration with validate.js')

check('validate.js picks up this module rather than its own fallback', () => {
  assert(typeof assertSameReadingAcrossLevels === 'function',
    'validate.js does not export assertSameReadingAcrossLevels')
  // The fallback compares a signature and reports ONE field. This module
  // reports every diverged field and attaches them as `fields`. That is the
  // tell for which path ran.
  const b = clone(STANDARD_DOC)
  b.application.dominantFace = 'duty'
  b.sensitive = true
  let err = null
  try {
    assertSameReadingAcrossLevels({ standard: STANDARD_DOC, newcomer: b })
  } catch (e) {
    err = e
  }
  assert(err, 'the seam did not throw on a diverged reading')
  assert(Array.isArray(err.fields),
    'no `fields` on the error — validate.js ran its own fallback, not this module')
  assert(err.fields.length >= 2,
    `only ${err.fields.length} field reported; this module reports all of them`)
})

check('the seam converts the error type but keeps the message', () => {
  const b = clone(STANDARD_DOC)
  b.outline.units[1].heading = ''
  let err = null
  try {
    assertSameReadingAcrossLevels({ standard: STANDARD_DOC, newcomer: b })
  } catch (e) {
    err = e
  }
  assert(err instanceof PlainReadValidationError,
    `expected PlainReadValidationError, got ${err && err.name}`)
  assert(/outline/.test(err.message), 'the diverged field did not survive into the message')
  assert(err.cause instanceof ReadingDivergedError,
    'the original ReadingDivergedError was not preserved as the cause')
})

check('the seam passes a matched prose-only pair', () => {
  assert(
    assertSameReadingAcrossLevels(
      { standard: STANDARD_DOC, newcomer: PLAIN_DOC },
      { reference: 'Philippians 4:10-13' }
    ) === true,
    'a legitimate two-level pair was rejected'
  )
})

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')

process.exit(failed === 0 ? 0 : 1)
