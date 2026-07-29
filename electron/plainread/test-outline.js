#!/usr/bin/env node
/**
 * test-outline.js — checks for the exegetical outline guardrails.
 *
 * NO API KEY REQUIRED. Everything under test is deterministic: the outline is
 * validated by regex and integer comparison, and none of that needs a network.
 *
 * The load-bearing test in this file is the hortatory-heading check, in BOTH
 * directions. An exegetical heading describes the text; a homiletical heading
 * commands the reader. A false positive here silently deletes good outlines,
 * so the passing cases matter as much as the throwing ones.
 *
 * Run:  node electron/plainread/test-outline.js
 * Exits non-zero on any failure.
 */

const assert = require('assert')

const {
  validatePlainRead,
  validateOutline,
  isHortatoryHeading,
  hortatoryReason,
  assertNoPulpitLeak,
  parsePassageRange,
  parseUnitRange,
  PlainReadValidationError,
} = require('./validate')

/* ------------------------------------------------------------------ *
 * harness
 * ------------------------------------------------------------------ */

const results = []

function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (err) {
    results.push({ name, ok: false, err })
  }
}

function throwsValidation(fn, matcher) {
  assert.throws(fn, (err) => {
    assert.ok(
      err instanceof PlainReadValidationError,
      `expected PlainReadValidationError, got ${err && err.name}: ${err && err.message}`
    )
    if (matcher) assert.match(err.message, matcher)
    return true
  })
}

/* ------------------------------------------------------------------ *
 * fixtures
 * ------------------------------------------------------------------ */

const REFERENCE = 'Philippians 4:10-13'

function validOutline(overrides = {}) {
  return {
    shape:
      'Simply linear: a thank-you, then the claim it provokes, then a one-line summary of the claim.',
    units: [
      {
        ref: 'v. 10',
        heading: 'v. 10 — the writer names the gift and dates its arrival',
        logic: null,
        children: null,
      },
      {
        ref: 'vv. 11-12',
        heading: 'vv. 11-12 — the claim: he learned contentment in both directions',
        logic: 'Ground. He heads off the reading that he was complaining about need.',
        children: [
          {
            ref: 'v. 11',
            heading: 'v. 11 — the disclaimer, stated flatly',
            logic: 'Opens the unit.',
          },
          {
            ref: 'v. 12',
            heading: 'v. 12 — the pair of extremes that bound the claim',
            logic: 'Escalation: the flat statement is spelled out as two opposite conditions.',
          },
        ],
      },
      {
        ref: 'v. 13',
        heading: 'v. 13 — the summary line, bounded by the two verses before it',
        logic: 'Restatement. The whole claim compressed into one sentence.',
        children: null,
      },
    ],
    ...overrides,
  }
}

/**
 * The situation block, written for THIS fixture's passage.
 *
 * situation became a required block after these fixtures were written. The
 * quick repair was to splice in situation.js's SITUATION_EXAMPLE, but that
 * example is Romans — its expulsion-from-Rome pressure describes a different
 * letter. A Philippians document carrying Romans history is a fixture that
 * lies. Confidence is "reconstructed" because the letter's provenance is
 * argued, not settled.
 */
function philippiansSituation() {
  return {
    when:
      'around AD 62, late in a stretch of custody, though a minority place the letter earlier and from a different prison',
    where: 'written from custody in a Roman city, sent to a Roman colony in northern Greece',
    pressure:
      'The congregation had put money together and sent it a long way to a man in chains. They were not a wealthy group, and the gift cost them something real. Months had passed with no word back, long enough for the senders to wonder whether it had ever arrived. The man they had paid to keep alive was a prisoner whose case could still end either way.',
    soWhat:
      'The line about contentment is not a maxim floating free of a situation. It sits inside a thank-you note from a prisoner to the people whose money was keeping him fed.',
    confidence: 'reconstructed',
    vaultSourced: false,
  }
}

/** A full document, shaped as the model is asked to return one. */
function validDoc(overrides = {}) {
  return {
    reference: REFERENCE,
    sensitive: false,
    situation: philippiansSituation(),
    meaning: {
      plain:
        'The writer thanks a group that sent him money and says he has learned to be steady whether he has plenty or nothing.',
      misread: null,
      assumes: 'That the writer is describing his own settled state, not issuing a rule for everyone.',
      level: null,
    },
    work: {
      genre: { body: 'An occasional letter.', youCanCheck: 'Read the opening and closing lines.', theMove: 'Ask what kind of writing you hold.' },
      setting: { body: 'The man behind it is in custody.', youCanCheck: 'Find the two places money is named.', theMove: 'Ask what the first readers knew.' },
      surroundings: { body: 'The lines on either side name the gift.', youCanCheck: 'Read four lines each way.', theMove: 'Read the neighbors first.' },
      words: { body: 'The verb is one of learning by experience.', youCanCheck: 'Compare v. 11 and v. 12.', theMove: 'Slow down on the main verb.' },
      story: { body: 'A late letter from a man near the end.', youCanCheck: 'Note who is named in v. 10.', theMove: 'Place the passage in the arc.' },
      doing: { body: 'He is closing an account, warmly.', youCanCheck: 'Read v. 10 and v. 14 together.', theMove: 'Ask what the writer is doing.' },
      christPathway: null,
    },
    distance: 'A first-century prisoner writing to a colony that had funded him.',
    application: {
      faces: ['character'],
      dominantFace: 'character',
      toThemFirst: 'They were being told their gift landed and was not a rescue of a desperate man.',
      thenToYou: 'You are being shown a settledness that does not move with the balance.',
      step: { kind: 'practice', cue: 'When the account balance moves', action: 'name out loud what has not changed', question: null },
    },
    restraint: [
      'This does not promise the money will come.',
      'This does not make contentment a feeling to manufacture.',
    ],
    differ: null,
    unknowns: ['Whether the gift arrived once or twice.'],
    handoff: 'If money is the pressure under this, say so to a pastor or a believer you trust.',
    outline: validOutline(),
    ...overrides,
  }
}

/* ------------------------------------------------------------------ *
 * 1. the outline is required, and it must actually analyze
 * ------------------------------------------------------------------ */

test('a valid outline passes inside a full document', () => {
  const doc = validatePlainRead(validDoc(), { reference: REFERENCE })
  assert.ok(doc.outline, 'outline survived validation')
  assert.strictEqual(doc.outline.units.length, 3)
  assert.strictEqual(doc.outline.units[0].logic, null, 'first unit has no joint before it')
  assert.strictEqual(doc.outline.units[1].children.length, 2)
  assert.match(doc.outline.shape, /linear/i)
})

test('a missing outline throws', () => {
  throwsValidation(
    () => validatePlainRead(validDoc({ outline: undefined }), { reference: REFERENCE }),
    /outline block missing/i
  )
})

test('an empty shape throws', () => {
  throwsValidation(
    () => validateOutline(validOutline({ shape: '   ' }), { reference: REFERENCE }),
    /outline\.shape is empty/i
  )
})

test('a single unit throws — one unit is a failure to analyze', () => {
  const one = validOutline()
  one.units = [one.units[0]]
  throwsValidation(
    () => validateOutline(one, { reference: REFERENCE }),
    /at least two real movements/i
  )
})

test('zero units throws', () => {
  throwsValidation(
    () => validateOutline(validOutline({ units: [] }), { reference: REFERENCE }),
    /at least two real movements/i
  )
})

test('a single verse may have one honest unit', () => {
  const one = {
    shape: 'One compact statement.',
    units: [{
      ref: 'v. 13',
      heading: 'v. 13 — the summary claim in one sentence',
      logic: null,
      children: null,
    }],
  }
  const result = validateOutline(one, { reference: 'Philippians 4:13' })
  assert.strictEqual(result.units.length, 1)
})

test('a unit with an empty ref or heading throws', () => {
  const noRef = validOutline()
  noRef.units[1].ref = ''
  throwsValidation(() => validateOutline(noRef, { reference: REFERENCE }), /\.ref is empty/i)

  const noHeading = validOutline()
  noHeading.units[1].heading = '  '
  throwsValidation(() => validateOutline(noHeading, { reference: REFERENCE }), /\.heading is empty/i)
})

test('a missing logic on a non-first unit throws', () => {
  const o = validOutline()
  o.units[2].logic = null
  throwsValidation(() => validateOutline(o, { reference: REFERENCE }), /logic is empty/i)
})

/* ------------------------------------------------------------------ *
 * 2. hortatory headings — the whole point of the check
 * ------------------------------------------------------------------ */

const HORTATORY = [
  ['Point 2: Be Content', 'the classic homiletical point'],
  ['Be content in every circumstance', 'bare imperative'],
  ['Trust God with your finances', 'imperative plus second person'],
  ['We must learn contentment', 'we-must'],
  ['We should remember the gift', 'we-should'],
  ['Let us rejoice in the Lord always', 'let-us'],
  ["Let's press on toward the goal", 'let-us contracted'],
  ['Remember the covenant', 'bare imperative, no second person'],
  ['You can do all things through Christ', 'second person'],
  ["Don't let anxiety rule your life", 'negative imperative'],
  ['Do not be anxious about anything', 'negative imperative, no contraction'],
  ['Apply this to your week', 'application language'],
  ['Seek first the kingdom', 'bare imperative'],
  ['vv. 11-12 — Learn contentment in both directions', 'imperative behind a real verse ref'],
  ['vv. 4-7 — the main idea: God guards the heart', 'talk scaffolding'],
  ['Stand firm in the Lord — the closing charge', 'command with a descriptive tail'],
  ['Never trade your peace for a circumstance', 'never + second person'],
]

test('hortatory headings are rejected (17 phrasings)', () => {
  for (const [heading, why] of HORTATORY) {
    assert.ok(
      isHortatoryHeading(heading),
      `should have been flagged (${why}): "${heading}"`
    )
  }
})

test('a hortatory heading throws through validateOutline', () => {
  const o = validOutline()
  o.units[1].heading = 'Point 2: Be Content'
  throwsValidation(() => validateOutline(o, { reference: REFERENCE }), /exhorts the reader/i)
})

test('a hortatory heading in a CHILD unit throws too', () => {
  const o = validOutline()
  o.units[1].children[0].heading = 'Trust him with your money'
  throwsValidation(
    () => validateOutline(o, { reference: REFERENCE }),
    /children\[0\]\.heading exhorts the reader/i
  )
})

/* ------------------------------------------------------------------ *
 * 3. legitimate exegetical headings must NOT be flagged
 *
 * These are the expensive failures. Every one of these is a heading a good
 * outline would actually produce, and several deliberately contain words the
 * naive version of each check would trip on.
 * ------------------------------------------------------------------ */

const EXEGETICAL = [
  'vv. 11-12 — the claim: he learned contentment in both directions',
  'v. 10 — the writer names the gift and dates its arrival',
  'v. 13 — the summary line, bounded by the two verses before it',
  'vv. 1-3 — exposition: the scene is set and both parties are named',
  'vv. 14-20 — restatement: the account is settled and closed',
  'vv. 2-4 — contrast with the scene before it',
  'vv. 5-6 — trust in the promise grounds the command that follows',
  'vv. 19-25 — three "let us" clauses build the appeal',
  'vv. 4-7 — a chain of imperatives addressed to the congregation at Philippi',
  'vv. 8-9 — the writer turns from the list to the practice of it',
  'v. 12 — the pair of extremes that bound the claim',
  'vv. 21-23 — the greeting closes the letter and names the household',
  'vv. 1-2 — the problem is stated before anyone answers it',
  'vv. 15-18 — the ledger language: giving and receiving, kept as an account',
  'vv. 6-7 — result: the guarding that follows the asking',
  'v. 5 — a hinge, looking back and forward at once',
  'vv. 9-11 — the narrative arc closes where it opened',
  'vv. 3-4 — escalation: the second charge is heavier than the first',
]

test('legitimate exegetical headings pass (18 headings)', () => {
  for (const heading of EXEGETICAL) {
    const reason = hortatoryReason(heading)
    assert.strictEqual(
      reason,
      null,
      `FALSE POSITIVE — this is a good exegetical heading but was flagged (${reason}): "${heading}"`
    )
  }
})

/* ------------------------------------------------------------------ *
 * 4. verse ranges stay inside the passage
 * ------------------------------------------------------------------ */

test('reference parsing handles the shapes that actually show up', () => {
  assert.deepStrictEqual(parsePassageRange('Philippians 4:10-13'), { chapter: 4, start: 4010, end: 4013 })
  assert.deepStrictEqual(parsePassageRange('1 Corinthians 15:51-58'), { chapter: 15, start: 15051, end: 15058 })
  assert.deepStrictEqual(parsePassageRange('Phil 4:13'), { chapter: 4, start: 4013, end: 4013 })
  assert.strictEqual(parsePassageRange('Psalm 23'), null, 'chapter-only bounds nothing')
  assert.strictEqual(parsePassageRange(''), null)

  assert.deepStrictEqual(parseUnitRange('vv. 11-12', 4), { start: 4011, end: 4012 })
  assert.deepStrictEqual(parseUnitRange('v. 13', 4), { start: 4013, end: 4013 })
  assert.deepStrictEqual(parseUnitRange('4:11-12', 4), { start: 4011, end: 4012 })
  assert.strictEqual(parseUnitRange('the middle bit', 4), null, 'unparseable is skipped, not thrown')
})

test('a unit citing a verse past the end of the passage throws', () => {
  const o = validOutline()
  o.units[2].ref = 'vv. 13-14'
  throwsValidation(
    () => validateOutline(o, { reference: REFERENCE }),
    /outside the passage/i
  )
})

test('a unit citing a verse before the start of the passage throws', () => {
  const o = validOutline()
  o.units[0].ref = 'vv. 8-10'
  throwsValidation(
    () => validateOutline(o, { reference: REFERENCE }),
    /outside the passage/i
  )
})

test('a unit in another chapter throws', () => {
  const o = validOutline()
  o.units[2].ref = '5:1'
  throwsValidation(
    () => validateOutline(o, { reference: REFERENCE }),
    /outside the passage/i
  )
})

test('a child unit outside its parent throws', () => {
  const o = validOutline()
  o.units[1].children[1].ref = 'v. 13'
  throwsValidation(
    () => validateOutline(o, { reference: REFERENCE }),
    /falls outside its parent unit/i
  )
})

test('units running backwards throw', () => {
  const o = validOutline()
  const [a, b, c] = o.units
  o.units = [c, b, a]
  o.units[0].logic = null
  o.units[1].logic = 'Contrast.'
  o.units[2].logic = 'Contrast.'
  throwsValidation(() => validateOutline(o, { reference: REFERENCE }), /runs backwards/i)
})

test('overlapping top-level units throw', () => {
  const o = validOutline()
  o.units[1].ref = 'vv. 10-12'
  throwsValidation(() => validateOutline(o, { reference: REFERENCE }), /overlaps/i)
})

test('a gap between top-level units throws', () => {
  const o = validOutline()
  o.units[1].ref = 'v. 12'
  throwsValidation(() => validateOutline(o, { reference: REFERENCE }), /leaves a gap/i)
})

test('an unparseable unit ref throws when the passage is bounded', () => {
  const o = validOutline()
  o.units[1].ref = 'the middle bit'
  throwsValidation(() => validateOutline(o, { reference: REFERENCE }), /not a readable verse range/i)
})

test('top-level units must begin and end with the passage', () => {
  const o = validOutline()
  o.units = o.units.slice(1)
  o.units[0].logic = null
  throwsValidation(() => validateOutline(o, { reference: REFERENCE }), /does not cover the full passage/i)
})

test('an unparseable passage reference disables range checking rather than guessing', () => {
  const o = validOutline()
  o.units[2].ref = 'vv. 40-41'
  // No reference to bound against — nothing to check, so nothing to throw.
  assert.ok(validateOutline(o, { reference: 'Psalm 23' }))
})

/* ------------------------------------------------------------------ *
 * 5. PULPIT_LEAK still catches sermons, and no longer eats good structure
 * ------------------------------------------------------------------ */

const PULPIT_MUST_THROW = [
  'Close this out with an illustration before the third point.',
  'When you preach this, slow down.',
  'Point 2: God is faithful',
  'Work this into next week I sermon series.'.replace(' I ', ' '),
  'Open the sermon here.',
  'A delivery note: pause after v. 13.',
  'Tell your congregation the account is closed.',
  'Your flock needs to hear this.',
  'This is the sub-point under the second movement.',
  'Use expository form for this paragraph.',
  'Then transition to point three.',
  'The big idea is contentment.',
  'A homiletical outline of the chapter.',

  // the delivery senses of sermon / preach / illustration, which stayed banned
  // when the bare word-bans were narrowed
  'Your sermon should land here.',
  'Build the sermon around v. 13.',
  'Sermon outline: three movements.',
  'I would preach this on a Sunday morning.',
  'When you are preaching this, slow down.',
  'Drop an illustration here.',
]

const PULPIT_MUST_PASS = [
  // structural description that the old regex would have killed
  'The congregation at Philippi had sent money more than once.',
  'Christians in one congregation hold both views and stay in fellowship.',
  'Verse 12 illustrates the claim with two opposite conditions.',
  'vv. 1-3 — exposition: the scene is set and both parties are named',
  'vv. 8-9 — the transition to the closing greeting',
  'At this point 2 things have already been established.',
  'The main point of the paragraph is the claim in v. 11.',
  'The narrative reaches its climax and then resolves.',

  // ORDINARY vocabulary for describing what a biblical text says. Each of these
  // used to throw twice and hand the reader "Could not finish the reading" —
  // Matthew 5-7, Acts 2, Jonah 3, 2 Timothy 4 and Ecclesiastes were all
  // unreadable in this mode.
  'The Sermon on the Mount begins here, in 5:1.',
  'Peter’s sermon at Pentecost quotes Joel 2 at length.',
  'Jonah is sent to Nineveh to preach against it.',
  'Paul tells Timothy to preach the word, in season and out.',
  'The Preacher of Ecclesiastes says everything is vapor.',
  'The crowd came out to hear John preach in the wilderness.',
  'Paul preached in the synagogue first, then in the hall of Tyrannus.',
  'Verse 12 is an illustration of the claim in verse 11.',
]

test('PULPIT_LEAK still throws on real sermon scaffolding (19 strings)', () => {
  for (const probe of PULPIT_MUST_THROW) {
    assert.throws(
      () => assertNoPulpitLeak({ probe }),
      (err) => err instanceof PlainReadValidationError,
      `should have been caught as pulpit language: "${probe}"`
    )
  }
})

test('PULPIT_LEAK permits structural description (16 strings)', () => {
  for (const probe of PULPIT_MUST_PASS) {
    assert.doesNotThrow(
      () => assertNoPulpitLeak({ probe }),
      `FALSE POSITIVE — legitimate structural description was flagged: "${probe}"`
    )
  }
})

test('an exegetical outline does not trip PULPIT_LEAK inside a whole document', () => {
  const doc = validatePlainRead(validDoc(), { reference: REFERENCE })
  assert.doesNotThrow(() => assertNoPulpitLeak(doc))
})

test('a real sermon point inside the outline DOES trip PULPIT_LEAK', () => {
  // This heading is descriptive in FORM, so the hortatory check lets it by.
  // That is the case the second net exists for.
  const heading = 'vv. 11-12 — the third point of the sermon'
  assert.strictEqual(
    hortatoryReason(heading),
    null,
    'precondition: this phrasing slips the hortatory check'
  )

  const o = validOutline()
  o.units[1].heading = heading
  assert.ok(validateOutline(o, { reference: REFERENCE }), 'and it survives outline validation')

  // The document-level check is what catches it.
  throwsValidation(
    () => validatePlainRead(validDoc({ outline: o }), { reference: REFERENCE }),
    /pulpit language/i
  )
})

/* ------------------------------------------------------------------ *
 * 6. quoting the text is not addressing the reader
 * ------------------------------------------------------------------ */

test('a heading may quote the text\'s own second-person words', () => {
  assert.strictEqual(
    hortatoryReason('vv. 4-5 — the direct address: "let your reasonableness be known"'),
    null,
    'quoted material is the text speaking, not the outline commanding'
  )
})

test('the same words unquoted are still rejected', () => {
  assert.ok(isHortatoryHeading('vv. 4-5 — let your reasonableness be known to everyone'))
})

/* ------------------------------------------------------------------ *
 * report
 * ------------------------------------------------------------------ */

const failed = results.filter((r) => !r.ok)

for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.name}`)
  else console.log(`  FAIL  ${r.name}\n        ${r.err && r.err.message}`)
}

console.log(`\n${results.length - failed.length}/${results.length} passed`)

if (failed.length) {
  console.log(`\n${failed.length} FAILED`)
  process.exit(1)
}
console.log('outline guardrails hold.')
