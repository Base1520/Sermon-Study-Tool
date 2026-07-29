#!/usr/bin/env node
/**
 * test-situation.js — checks for the situation block, the language level, and
 * the verifier hook.
 *
 * NO API KEY REQUIRED. Everything under test is deterministic: field checks,
 * regex, a confidence coercion, and a structural comparison. None of it needs
 * a network.
 *
 * The load-bearing tests here are the ones that FAIL a good block. This block
 * is nothing but historical claims a layman cannot check, so the temptation is
 * to make the validator maximally strict — but a validator that rejects the
 * field's own definition ("what changes in YOUR reading") burns a sample on
 * every correct document and eventually gets loosened by whoever is debugging
 * at 11pm. Both directions are pinned.
 *
 * Run:  node electron/plainread/test-situation.js
 * Exits non-zero on any failure.
 */

const assert = require('assert')

const {
  validatePlainRead,
  validateSituation,
  assertSituationDate,
  assertSameReadingAcrossLevels,
  readingSignature,
  hortatoryReason,
  PlainReadValidationError,
} = require('./validate')

const {
  normalizeSituation,
  normalizeConfidence,
  CONFIDENCE_LEVELS,
  DEFAULT_CONFIDENCE,
  SITUATION_FIELDS,
  SITUATION_SCHEMA_HINT,
  SITUATION_EXAMPLE,
  SITUATION_CHECKED_STEPS,
  SITUATION_MIN_CLAIM_CHARS,
  readStepBody,
  writeStepBody,
  isSituationStep,
} = require('./situation')

const { PLAIN_READ_SYSTEM, buildSystem, PROMPT_VERSION } = require('./prompt')

/**
 * levels.js is written by another agent and may or may not be on disk. The
 * tests below run either way: where its presence changes the expected result,
 * the branch is explicit rather than assumed.
 */
let levels = null
try {
  levels = require('./levels')
} catch (err) {
  if (err && err.code !== 'MODULE_NOT_FOUND') throw err
}

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

function validSituation(overrides = {}) {
  return {
    when:
      'around AD 60, while the writer was in custody — the city he was held in is disputed, ' +
      'which moves the date by a few years either way',
    where: 'written from custody, sent to a small church in a Roman colony in northern Greece',
    pressure:
      'The people who got this letter had put money together and sent one of their own men across ' +
      'the sea with it, and he nearly died on the trip. They were a small group in a town proud of ' +
      'its Roman standing, which made them conspicuous. They had heard their man was ill and did ' +
      'not know whether their gift had even landed. Two of the women in the group were in a public ' +
      'disagreement serious enough that it gets named later in the letter.',
    soWhat:
      'The line about being content in plenty and in need is a thank-you note written to people who ' +
      'had just spent money they did not have. It is a report on one man in custody, not a slogan ' +
      'about handling money well.',
    confidence: 'reconstructed',
    vaultSourced: false,
    ...overrides,
  }
}

function validOutline() {
  return {
    shape: 'Simply linear: a thank-you, then the claim it provokes, then a one-line summary.',
    units: [
      { ref: 'v. 10', heading: 'v. 10 — the writer names the gift and dates its arrival', logic: null, children: null },
      {
        ref: 'vv. 11-12',
        heading: 'vv. 11-12 — the claim: he learned contentment in both directions',
        logic: 'Ground. He heads off the reading that he was complaining about need.',
        children: null,
      },
      {
        ref: 'v. 13',
        heading: 'v. 13 — the summary line, bounded by the two verses before it',
        logic: 'Restatement. The whole claim compressed into one sentence.',
        children: null,
      },
    ],
  }
}

/** A full document, shaped as the model is asked to return one. */
function validDoc(overrides = {}) {
  return {
    reference: REFERENCE,
    sensitive: false,
    situation: validSituation(),
    meaning: {
      plain: 'The writer thanks a group that sent him money and says he has learned to be steady either way.',
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
 * 1. the happy path
 * ------------------------------------------------------------------ */

test('a valid situation block passes', () => {
  const block = validateSituation(validSituation(), { reference: REFERENCE })
  for (const field of SITUATION_FIELDS) {
    assert.ok(block[field].length > 0, `${field} survived`)
  }
  assert.strictEqual(block.confidence, 'reconstructed')
  assert.strictEqual(block.vaultSourced, false)
})

test('the worked example in situation.js is itself valid', () => {
  const block = validateSituation({ ...SITUATION_EXAMPLE }, { reference: 'Romans 14:1-12' })
  assert.match(block.pressure, /expelled Jews from Rome/)

  /*
   * The example is Romans, and Romans earns "reconstructed", not "documented".
   * Validity was never the risk here — an over-confident label is perfectly
   * valid — so the assertion is on HONESTY. This is the worked case the whole
   * contract is taught from and prompt.js teaches the same case in prose, so
   * whatever it models is what gets copied.
   *
   * Only the expulsion is attested. The AD 49 year is argued over, the AD 57
   * year is a reconstruction the letter never states, and the composition of
   * the room is an inference from the expulsion. One label covers all four
   * fields, so it is set by the weakest load-bearing claim among them.
   */
  assert.strictEqual(block.confidence, 'reconstructed')
  assert.match(block.when, /reconstructed, not recorded/, 'the AD 57 year is not stated flat')
  assert.match(block.pressure, /the year is argued over/, 'the AD 49 year carries its dispute')
})

test('a valid situation block passes inside a full document', () => {
  const doc = validatePlainRead(validDoc(), { reference: REFERENCE })
  assert.ok(doc.situation, 'situation survived validation')
  assert.strictEqual(doc.situation.confidence, 'reconstructed')
  assert.strictEqual(doc.situation.vaultSourced, false)
})

test('normalizeSituation collapses whitespace and never throws on garbage', () => {
  const block = normalizeSituation({ when: '  around\n  AD 57  ', pressure: 42, where: null })
  assert.strictEqual(block.when, 'around AD 57')
  assert.strictEqual(block.pressure, '')
  assert.strictEqual(block.where, '')
  assert.strictEqual(normalizeSituation(null).soWhat, '')
  assert.strictEqual(normalizeSituation(undefined).confidence, DEFAULT_CONFIDENCE)
})

/* ------------------------------------------------------------------ *
 * 2. every field is required
 * ------------------------------------------------------------------ */

test('the block itself is required', () => {
  throwsValidation(() => validateSituation(undefined, { reference: REFERENCE }), /situation block missing/i)
  throwsValidation(() => validateSituation(null, { reference: REFERENCE }), /situation block missing/i)
  throwsValidation(() => validateSituation('AD 57', { reference: REFERENCE }), /situation block missing/i)
})

test('each empty field throws, and the message names the field', () => {
  for (const field of SITUATION_FIELDS) {
    throwsValidation(
      () => validateSituation(validSituation({ [field]: '' }), { reference: REFERENCE }),
      new RegExp(`situation\\.${field} is empty`, 'i')
    )
    throwsValidation(
      () => validateSituation(validSituation({ [field]: '   ' }), { reference: REFERENCE }),
      new RegExp(`situation\\.${field} is empty`, 'i')
    )
    throwsValidation(
      () => validateSituation(validSituation({ [field]: undefined }), { reference: REFERENCE }),
      new RegExp(`situation\\.${field} is empty`, 'i')
    )
  }
})

test('a document with no situation block is rejected, retryably', () => {
  throwsValidation(
    () => validatePlainRead(validDoc({ situation: undefined }), { reference: REFERENCE }),
    /situation block missing/i
  )
  try {
    validatePlainRead(validDoc({ situation: undefined }), { reference: REFERENCE })
    assert.fail('should have thrown')
  } catch (err) {
    assert.strictEqual(err.retryable, true, 'a missing block is worth one more sample')
  }
})

test('an empty field inside a full document throws through validatePlainRead', () => {
  throwsValidation(
    () => validatePlainRead(validDoc({ situation: validSituation({ pressure: '' }) }), { reference: REFERENCE }),
    /situation\.pressure is empty/i
  )
})

/* ------------------------------------------------------------------ *
 * 3. confidence — the honesty valve
 * ------------------------------------------------------------------ */

test('the three confidence values survive untouched', () => {
  for (const level of CONFIDENCE_LEVELS) {
    const block = validateSituation(validSituation({ confidence: level }), { reference: REFERENCE })
    assert.strictEqual(block.confidence, level)
  }
})

test('a bad confidence coerces to reconstructed instead of throwing', () => {
  const bad = ['certain', 'high', 'HIGH', 'documented-ish', '', null, undefined, 5, {}, 'speculative']
  for (const value of bad) {
    const block = validateSituation(validSituation({ confidence: value }), { reference: REFERENCE })
    assert.strictEqual(
      block.confidence,
      'reconstructed',
      `confidence ${JSON.stringify(value)} should coerce, not throw`
    )
  }
})

test('coercion never upgrades a claim to documented', () => {
  for (const value of ['certain', 'proven', 'sure', 'definite', 'attested']) {
    assert.notStrictEqual(normalizeConfidence(value), 'documented')
  }
  assert.strictEqual(normalizeConfidence('DOCUMENTED'), 'documented', 'case is not the failure')
})

test('vaultSourced is set by code, never by the model', () => {
  const claimed = validateSituation(validSituation({ vaultSourced: true }), { reference: REFERENCE })
  assert.strictEqual(claimed.vaultSourced, false, 'a model claiming its own sourcing is ignored')
  const byCode = normalizeSituation(validSituation(), { vaultSourced: true })
  assert.strictEqual(byCode.vaultSourced, true, 'code that consulted the vault may set it')
})

/* ------------------------------------------------------------------ *
 * 4. soWhat describes; it does not exhort
 * ------------------------------------------------------------------ */

test('a hortatory soWhat throws', () => {
  const exhortations = [
    'Trust God with your finances the way this writer did.',
    'Remember that contentment is learned, not given.',
    'You should read chapters 14 and 15 with this in mind.',
    'Ask yourself whether you would have eaten at that table.',
    'Let us read this the way the first hearers did.',
    'We must not flatten this into a slogan about money.',
    'Apply this to the next time your own budget moves.',
    'Your takeaway here is that the gift was costly.',
  ]
  for (const soWhat of exhortations) {
    throwsValidation(
      () => validateSituation(validSituation({ soWhat }), { reference: REFERENCE }),
      /situation\.soWhat exhorts/i
    )
  }
})

test('a DESCRIPTIVE soWhat using "you" or "your" still passes', () => {
  // The field's own definition is "what changes in YOUR reading". A flat
  // second-person ban would reject every correct block, so this direction is
  // pinned as hard as the throwing one.
  const good = [
    'You are reading a letter into a room where two groups had just been forced back together, not a general essay about opinions.',
    'What looks like a private thank-you note is a public receipt, and that changes who the closing lines are aimed at.',
    'The strong-and-weak argument reads as a live dispute between neighbours, not as an abstract principle about conscience.',
    'Your Bible prints this as one chapter, but the pressure behind it runs back five years before the first line was written.',
  ]
  for (const soWhat of good) {
    const block = validateSituation(validSituation({ soWhat }), { reference: REFERENCE })
    assert.strictEqual(block.soWhat, soWhat, `should have passed: ${soWhat}`)
  }
})

test('outline headings keep the STRICT second-person ban', () => {
  // The relaxed mode is opt-in. A regression here would silently let "your"
  // back into outline headings, which is where it does real damage.
  assert.ok(hortatoryReason('vv. 1-3 — what your money says about you'), 'strict by default')
  assert.strictEqual(
    hortatoryReason('vv. 1-3 — what your money says about you', { allowSecondPerson: true }),
    null,
    'relaxed only when asked'
  )
  assert.ok(
    hortatoryReason('vv. 1-3 — you should give more', { allowSecondPerson: true }),
    'a second-person COMMAND is still caught in relaxed mode'
  )
})

/* ------------------------------------------------------------------ *
 * 5. voice rules apply to this block too
 * ------------------------------------------------------------------ */

test('pulpit language anywhere in the block throws', () => {
  const leaks = [
    { pressure: 'Explain to your congregation that the church in Rome had reorganised without them.' },
    { where: 'A useful opening for a sermon series on unity in the local church.' },
    { when: 'Around AD 49 — a natural place to start the sermon introduction.' },
    { soWhat: 'The room was mixed, which is the big idea running under the whole letter.' },
  ]
  for (const override of leaks) {
    throwsValidation(
      () => validateSituation(validSituation(override), { reference: REFERENCE }),
      /pulpit language/i
    )
  }
})

test('a pulpit leak in the situation block throws through validatePlainRead', () => {
  throwsValidation(
    () => validatePlainRead(
      validDoc({ situation: validSituation({ pressure: 'Tell the congregation what the expulsion cost them.' }) }),
      { reference: REFERENCE }
    ),
    /pulpit language/i
  )
})

test('the block may not disclose the prompt framing', () => {
  throwsValidation(
    () => validateSituation(
      validSituation({ soWhat: 'The doctrinal fence behind this tool reads the date one way.' }),
      { reference: REFERENCE }
    ),
    /disclosed its own prompt framing/i
  )
})

/* ------------------------------------------------------------------ *
 * 6. the Revelation date, caught inside the situation block
 * ------------------------------------------------------------------ */

test('Revelation dated before AD 70 in the situation block throws', () => {
  const bad = [
    { when: 'written under Nero, before the fall of Jerusalem' },
    { when: 'in the 60s, during a wave of imperial violence' },
    { when: 'around AD 65' },
    { where: 'sent from exile, written before AD 70' },
    { pressure: 'The churches were under pressure from a persecution that began under Nero.' },
  ]
  for (const override of bad) {
    throwsValidation(
      () => validateSituation(validSituation(override), { reference: 'Revelation 3:14-22' }),
      /dates Revelation before AD 70/i
    )
  }
})

test('the late date passes, and a NAMED position is not an assertion', () => {
  const late = validateSituation(
    validSituation({
      when: 'around AD 95, late in the reign of Domitian',
      where: 'written from exile on a small island, sent to seven churches in western Asia Minor',
    }),
    { reference: 'Revelation 3:14-22' }
  )
  assert.match(late.when, /AD 95/)

  const hedged = validateSituation(
    validSituation({ when: 'around AD 95, though some readers date it under Nero instead' }),
    { reference: 'Revelation 3:14-22' }
  )
  assert.match(hedged.when, /Nero/, 'a described position survives')
})

test('the date check is scoped to Revelation and does not fire elsewhere', () => {
  // Philippians is genuinely dated in the 60s. A check that fired on every book
  // would delete the correct answer.
  const block = validateSituation(validSituation({ when: 'around AD 61, from custody' }), { reference: REFERENCE })
  assert.match(block.when, /AD 61/)
  assert.doesNotThrow(() => assertSituationDate(validSituation({ when: 'in the 60s' }), 'Colossians 1:15-20'))
})

/* ------------------------------------------------------------------ *
 * 7. the verifier hook — the interface verify.js needs
 * ------------------------------------------------------------------ */

test('the situation block is reachable by the verifier', () => {
  assert.ok(SITUATION_CHECKED_STEPS.includes('situation.pressure'), 'pressure is checkable')
  assert.ok(SITUATION_CHECKED_STEPS.includes('situation.when'), 'when is checkable')
  assert.ok(SITUATION_MIN_CLAIM_CHARS < 30, 'a short date is still a claim worth checking')
  assert.ok(isSituationStep('situation.when'))
  assert.ok(!isSituationStep('setting'))
})

test('readStepBody reads situation fields AND ordinary work steps', () => {
  const doc = validDoc()
  assert.match(readStepBody(doc, 'situation.pressure'), /nearly died on the trip/)
  assert.match(readStepBody(doc, 'situation.when'), /AD 60/)
  assert.strictEqual(readStepBody(doc, 'setting'), 'The man behind it is in custody.')
  assert.strictEqual(readStepBody(doc, 'situation.nonsense'), '')
  assert.strictEqual(readStepBody({}, 'setting'), '')
})

test('writeStepBody is copy-on-write and cannot scribble on the original', () => {
  const original = validDoc()
  const next = { ...original }
  writeStepBody(next, 'situation.pressure', 'A claim in this block did not survive a check.')
  assert.match(next.situation.pressure, /did not survive/)
  assert.match(original.situation.pressure, /nearly died on the trip/, 'original untouched')

  writeStepBody(next, 'setting', 'rewritten body')
  assert.strictEqual(next.work.setting.body, 'rewritten body')
  assert.strictEqual(original.work.setting.body, 'The man behind it is in custody.', 'original untouched')
  assert.strictEqual(next.work.setting.youCanCheck, 'Find the two places money is named.', 'siblings kept')
})

/* ------------------------------------------------------------------ *
 * 8. the schema hint is shared, not restated
 * ------------------------------------------------------------------ */

test('SITUATION_SCHEMA_HINT names every field the validator requires', () => {
  for (const field of [...SITUATION_FIELDS, 'confidence', 'vaultSourced']) {
    assert.ok(SITUATION_SCHEMA_HINT.includes(`"${field}"`), `${field} is in the schema hint`)
  }
  for (const level of CONFIDENCE_LEVELS) {
    assert.ok(SITUATION_SCHEMA_HINT.includes(`"${level}"`), `${level} is in the schema hint`)
  }
})

test('the system prompt carries the situation contract and bumped its version', () => {
  assert.strictEqual(typeof PLAIN_READ_SYSTEM, 'string', 'the old export is still a string')
  assert.ok(PLAIN_READ_SYSTEM.includes('"pressure"'), 'the schema fragment is in the prompt')
  assert.ok(/BEFORE THE PASSAGE — THE SITUATION/.test(PLAIN_READ_SYSTEM), 'the instruction block is in the prompt')
  assert.ok(PROMPT_VERSION >= 5, 'the output shape changed, so the cache is stale')
})

test('buildSystem is a function of level and never throws on an unknown one', () => {
  assert.strictEqual(typeof buildSystem, 'function')
  assert.strictEqual(buildSystem('standard'), PLAIN_READ_SYSTEM, 'the default IS the standard prompt')

  const levelIds = levels ? levels.LEVEL_IDS : ['standard']
  for (const level of [...levelIds, 'not-a-level', undefined]) {
    const system = buildSystem(level)
    assert.strictEqual(typeof system, 'string')
    assert.ok(system.includes('"situation"'), `level ${level} still carries the situation block`)
    assert.ok(system.includes('THE SIX STEPS'), `level ${level} still runs the same process`)
    assert.ok(system.includes('BEFORE THE PASSAGE'), `level ${level} still briefs before the passage`)
  }
})

test('the level actually reaches the prompt, and the voice block with it', () => {
  if (!levels) {
    // levels.js not on disk yet — the guarded require degrades to an empty
    // block, which is the documented fallback. Nothing to assert.
    return
  }
  const other = levels.LEVEL_IDS.find((id) => id !== levels.DEFAULT_LEVEL)
  assert.ok(other, 'more than one level exists')
  assert.notStrictEqual(
    buildSystem(other),
    buildSystem(levels.DEFAULT_LEVEL),
    'two levels must not produce the same prompt'
  )
  assert.ok(buildSystem(other).includes(levels.levelBlock(other)), 'the level block is spliced in verbatim')
})

test('the voice block sits AFTER the structure and BEFORE the fence', () => {
  let voice = null
  try {
    voice = require('./voice')
  } catch (err) {
    if (err && err.code !== 'MODULE_NOT_FOUND') throw err
  }
  if (!voice) return

  const system = buildSystem('standard')
  const voiceAt = system.indexOf(voice.voiceBlock())
  const outlineAt = system.indexOf('THE OUTLINE')
  const fenceAt = system.indexOf('SOURCE-DISCIPLINE FENCE')
  assert.ok(voiceAt > -1, 'the voice block is in the prompt')
  assert.ok(voiceAt > outlineAt, 'voice governs how the structure above it is written')
  assert.ok(fenceAt > voiceAt, 'the fence still has the last word before OUTPUT')
})

/* ------------------------------------------------------------------ *
 * 9. a level may move the language, never the reading
 * ------------------------------------------------------------------ */

test('two levels with the same reading pass', () => {
  const standard = validatePlainRead(validDoc(), { reference: REFERENCE })
  const newcomer = validatePlainRead(
    validDoc({
      meaning: {
        plain: 'He says thanks for the money, and says he is steady whether he has a lot or nothing.',
        misread: null,
        assumes: 'That he is talking about himself here, not making a rule for everyone.',
        level: null,
      },
      situation: validSituation({
        pressure:
          'The people who got this letter had pooled their money and sent a man across the sea with ' +
          'it, and he almost died on the way. They were a small group in a proud Roman town, so they ' +
          'stood out. They had heard he was sick and did not know if the money ever arrived. Two of ' +
          'the women in the group were arguing in public.',
        soWhat:
          'The famous line about being content is inside a thank-you note to people who spent money ' +
          'they did not have. It is one man reporting on himself, not a rule about money.',
      }),
    }),
    { reference: REFERENCE }
  )

  assert.strictEqual(assertSameReadingAcrossLevels({ standard, newcomer }, { reference: REFERENCE }), true)
  assert.notStrictEqual(standard.meaning.plain, newcomer.meaning.plain, 'the words did move')
})

test('a level that changes the READING throws', () => {
  const standard = validatePlainRead(validDoc(), { reference: REFERENCE })

  // The classic drift: a simplified variant slides from a character text to a
  // duty text, because commands are easier to write in short words.
  const drifted = validatePlainRead(
    validDoc({
      application: {
        faces: ['duty'],
        dominantFace: 'duty',
        toThemFirst: 'They were told their gift landed.',
        thenToYou: 'You are told to be steady when the money moves.',
        step: { kind: 'plan', cue: 'When the balance drops', action: 'write down what has not changed', question: null },
      },
    }),
    { reference: REFERENCE }
  )

  throwsValidation(
    () => assertSameReadingAcrossLevels({ standard, newcomer: drifted }, { reference: REFERENCE }),
    /language level changed the reading/i
  )
})

test('drift in the outline, the pathway, sensitivity or confidence is caught too', () => {
  const standard = validatePlainRead(validDoc(), { reference: REFERENCE })

  const fewerUnits = validOutline()
  fewerUnits.units = [
    fewerUnits.units[0],
    {
      ref: 'vv. 11-13',
      heading: 'vv. 11-13 — the claim and its summary line',
      logic: 'Ground and restatement.',
      children: null,
    },
  ]

  const cases = [
    ['outline', validDoc({ outline: fewerUnits })],
    ['christPathway', validDoc({ work: { ...validDoc().work, christPathway: 'typology' } })],
    ['confidence', validDoc({ situation: validSituation({ confidence: 'documented' }) })],
    // A sensitive passage never issues an instruction: the validator forces
    // step.kind to "question" and nulls the cue and action. The question has to
    // be supplied or the VARIANT ITSELF fails the schema, and this case would
    // then pass for the wrong reason — a fixture error dressed up as a caught
    // drift. What is under test is the level check, not the schema.
    [
      'sensitive',
      validDoc({
        sensitive: true,
        application: {
          ...validDoc().application,
          step: {
            kind: 'question',
            cue: null,
            action: null,
            question: 'What would it change if this stayed unresolved for a year?',
          },
        },
      }),
    ],
  ]

  for (const [label, raw] of cases) {
    const variant = validatePlainRead(raw, { reference: REFERENCE })
    throwsValidation(
      () => assertSameReadingAcrossLevels([standard, variant], { reference: REFERENCE }),
      /language level changed the reading/i
    )
    assert.ok(label, 'labelled for the failure message')
  }
})

test('equivalent verse-range spellings are the same boundary', () => {
  const standard = validatePlainRead(validDoc(), { reference: REFERENCE })
  const respelled = validOutline()
  respelled.units[1].ref = '4:11-12'
  respelled.units[2].ref = 'verse 13'
  const variant = validatePlainRead(validDoc({ outline: respelled }), { reference: REFERENCE })

  assert.strictEqual(assertSameReadingAcrossLevels([standard, variant]), true)
})

test('one variant, or none, is a no-op rather than a false pass', () => {
  const standard = validatePlainRead(validDoc(), { reference: REFERENCE })
  assert.strictEqual(assertSameReadingAcrossLevels([standard]), true)
  assert.strictEqual(assertSameReadingAcrossLevels([]), true)
  assert.strictEqual(assertSameReadingAcrossLevels(null), true)
})

test('the reading signature holds decisions, not prose', () => {
  const doc = validatePlainRead(validDoc(), { reference: REFERENCE })
  const signature = readingSignature(doc)
  assert.strictEqual(signature['application.dominantFace'], 'character')
  assert.strictEqual(signature['situation.confidence'], 'reconstructed')
  assert.strictEqual(signature['outline.units[].ref'].length, 3)
  const flat = JSON.stringify(signature)
  assert.ok(!flat.includes('contentment'), 'no prose leaked into the signature')
})

/* ------------------------------------------------------------------ *
 * report
 * ------------------------------------------------------------------ */

let failed = 0
for (const r of results) {
  if (r.ok) {
    console.log(`  PASS  ${r.name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${r.name}`)
    console.log(`        ${r.err && r.err.message}`)
  }
}

console.log(`\n${results.length - failed}/${results.length} passed`)
if (failed) {
  console.log('situation block is not safe to ship.')
  process.exit(1)
}
console.log('situation block holds.')
