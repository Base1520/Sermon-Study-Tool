#!/usr/bin/env node
'use strict'

const assert = require('assert')
const {
  generateGroupGuide,
  validateGroupGuide,
  renderGuideHtml,
  guideKeyFor,
  classifySourceNote,
  looksTruncatedSourceNote,
  GUIDE_JSON_SCHEMA,
  GroupGuideValidationError,
} = require('./index')

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`PASS  ${name}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL  ${name}\n      ${error.message}`)
  }
}

function leaderKey(answerClass, answer = 'The passage states the answer directly.') {
  return {
    answerClass,
    conciseAnswer: answerClass === 'PASTORAL_OPEN' ? null : answer,
    textualEvidence: ['The supplied passage names this explicitly.'],
    acceptableRange: answerClass === 'PASTORAL_OPEN'
      ? ['A response tied to the passage is faithful.']
      : ['Equivalent wording that preserves the text.'],
    disputedViews: answerClass === 'DISPUTED'
      ? [
          { view: 'One reading', supportingEvidence: ['One feature supports it.'] },
          { view: 'Another reading', supportingEvidence: ['Another feature supports it.'] },
        ]
      : [],
    answerLimits: ['Do not claim more than the passage establishes.'],
    pastoralGuidance: 'Let anyone pass on a personal question.',
  }
}

function question(id, phase, covenantStep, answerClass) {
  return {
    id,
    phase,
    covenantStep,
    passageAnchors: ['20:7-15'],
    participantPrompt: `What does question ${id} ask you to notice?`,
    embeddedClaims: [
      { claim: 'The passage contains the named scene.', status: 'sourced', source: 'passage' },
    ],
    leaderKey: leaderKey(answerClass),
  }
}

function fixture() {
  const questions = [
    question('q1', 'observation', 'contextualize', 'TEXT_EXPLICIT'),
    question('q2', 'observation', 'verify', 'TEXT_EXPLICIT'),
    question('q3', 'observation', 'examine', 'TEXT_EXPLICIT'),
    question('q4', 'interpretation', 'observe', 'INTERPRETATION_BOUNDED'),
    question('q5', 'interpretation', 'verify', 'INTERPRETATION_BOUNDED'),
    question('q6', 'interpretation', 'name', 'INTERPRETATION_BOUNDED'),
    question('q7', 'interpretation', 'anchor', 'DISPUTED'),
    question('q8', 'application', 'navigate', 'PASTORAL_OPEN'),
    question('q9', 'application', 'teach', 'PASTORAL_OPEN'),
    question('q10', 'application', 'teach', 'PASTORAL_OPEN'),
  ]
  const assignments = {
    contextualize: ['q1'],
    observe: ['q4'],
    verify: ['q2', 'q5'],
    examine: ['q3'],
    name: ['q6'],
    anchor: ['q7'],
    navigate: ['q8'],
    teach: ['q9', 'q10'],
  }
  return {
    reference: 'Revelation 20:7-15',
    title: 'The End of Every Enemy',
    bigIdea: 'God brings evil, judgment, and death to their final end.',
    opening: {
      prompt: 'Which word or image in the passage first catches your attention?',
      leaderNote: 'Keep the opening low-risk and let anyone pass.',
      allowPass: true,
    },
    steps: Object.entries(assignments).map(([id, questionIds]) => ({
      id,
      summary: `This is the short ${id} summary tied to the passage.`,
      questionIds,
    })),
    questions,
    prayerPrompt: 'Ask God to make the hope and warning of this passage truthful in the group.',
  }
}

function compactFixture() {
  const full = fixture()
  return {
    reference: full.reference,
    title: full.title,
    bigIdea: full.bigIdea,
    openingPrompt: full.opening.prompt,
    openingLeaderNote: full.opening.leaderNote,
    stepSummaries: Object.fromEntries(
      full.steps.map((step) => [step.id, step.summary])
    ),
    questions: Object.fromEntries(
      full.questions.map((item) => [
        item.id,
        {
          covenantStep: item.covenantStep,
          passageAnchors: item.passageAnchors,
          participantPrompt: item.participantPrompt,
          answerClass: item.leaderKey.answerClass,
          conciseAnswer: item.leaderKey.conciseAnswer ?? '',
          textualEvidence: item.leaderKey.textualEvidence,
          acceptableRange: item.leaderKey.acceptableRange,
          disputedViews: item.leaderKey.disputedViews.map(
            (view) => `${view.view}: ${view.supportingEvidence.join(' ')}`
          ),
          answerLimits: item.leaderKey.answerLimits,
          pastoralGuidance: item.leaderKey.pastoralGuidance,
        },
      ])
    ),
    prayerPrompt: full.prayerPrompt,
  }
}

function scriptedClient(outputs) {
  const calls = []
  return {
    calls,
    createClient: () => ({
      messages: {
        create: async (request) => {
          calls.push(request)
          const output = outputs[calls.length - 1]
          return { content: [{ type: 'text', text: JSON.stringify(output) }] }
        },
      },
    }),
  }
}

async function main() {
  await test('valid guide preserves the 3/4/3 contract and eight steps', () => {
    const guide = validateGroupGuide(fixture(), { reference: 'Revelation 20:7-15' })
    assert.strictEqual(guide.questions.length, 10)
    assert.strictEqual(guide.steps.length, 8)
    assert.strictEqual(guide.questions.filter((item) => item.phase === 'observation').length, 3)
    assert.strictEqual(guide.questions.filter((item) => item.phase === 'interpretation').length, 4)
    assert.strictEqual(guide.questions.filter((item) => item.phase === 'application').length, 3)
  })

  await test('fixed question slots lock every question into its phase', () => {
    const raw = fixture()
    raw.questions = Object.fromEntries(raw.questions.map((item) => [item.id, item]))
    raw.questions.q8.phase = 'interpretation'
    const guide = validateGroupGuide(raw, { reference: raw.reference })
    assert.strictEqual(GUIDE_JSON_SCHEMA.properties.guideJson.type, 'string')
    assert.strictEqual(guide.questions[7].id, 'q8')
    assert.strictEqual(guide.questions[7].phase, 'application')
  })

  await test('compact provider shape expands into the full guide contract', () => {
    const raw = compactFixture()
    const guide = validateGroupGuide(raw, { reference: raw.reference })
    assert.strictEqual(guide.steps.length, 8)
    assert.strictEqual(guide.questions.length, 10)
    assert.strictEqual(guide.questions[7].phase, 'application')
    assert.strictEqual(guide.questions[7].leaderKey.conciseAnswer, null)
    assert.deepStrictEqual(
      guide.steps.find((step) => step.id === 'teach').questionIds,
      ['q9', 'q10']
    )
  })

  await test('application questions never receive a correct personal answer', () => {
    const raw = fixture()
    raw.questions[7].leaderKey.conciseAnswer = 'The participant should say this.'
    assert.throws(
      () => validateGroupGuide(raw, { reference: raw.reference }),
      GroupGuideValidationError
    )
  })

  await test('a question cannot smuggle a disputed conclusion', () => {
    const raw = fixture()
    raw.questions[3].participantPrompt = 'Why is this the same battle as Revelation 19?'
    assert.throws(
      () => validateGroupGuide(raw, { reference: raw.reference }),
      GroupGuideValidationError
    )
  })

  await test('a Revelation guide cannot flatten the seven churches into one pressured audience', () => {
    const raw = fixture()
    raw.steps[0].summary = 'This vision assured a pressured church that the real enemy is doomed.'
    assert.throws(
      () => validateGroupGuide(raw, { reference: raw.reference }),
      (error) =>
        error instanceof GroupGuideValidationError &&
        /mixed churches/.test(error.message)
    )
  })

  await test('source notes are classified conservatively', () => {
    assert.strictEqual(
      classifySourceNote('Historic premil: chapter 19 and 20 are sequential.'),
      'disputed'
    )
    assert.strictEqual(
      classifySourceNote('Reading rule: do not flatten apocalyptic into a datable timeline.'),
      'interpretive'
    )
    assert.strictEqual(
      classifySourceNote('Genre: apocalyptic.'),
      'background'
    )
  })

  await test('truncated vault fragments are refused', () => {
    assert.strictEqual(looksTruncatedSourceNote('Reading rule: the scene is liturgy carrying theology - the.'), true)
    assert.strictEqual(looksTruncatedSourceNote('Genre: apocalyptic.'), false)
  })

  await test('participant PDF omits the answer key; leader PDF includes it', () => {
    const participant = renderGuideHtml(fixture(), 'participant')
    const leader = renderGuideHtml(fixture(), 'leader')
    assert.ok(!participant.includes('Leader answer:'))
    assert.ok(leader.includes('Leader answer:'))
    assert.ok(participant.includes('COVENANT GROUP GUIDE'))
    assert.ok(leader.includes('PASTORAL — NO SINGLE ANSWER'))
  })

  await test('cache key changes when the passage analysis changes', () => {
    const analysis = {
      reference: 'Revelation 20:7-15',
      passageText: 'The passage text.',
      phrases: [],
    }
    assert.notStrictEqual(
      guideKeyFor(analysis),
      guideKeyFor({ ...analysis, passageText: 'Different passage text.' })
    )
  })

  await test('generation runs a draft pass and a verification pass', async () => {
    const raw = fixture()
    const harness = scriptedClient([raw, raw])
    const guide = await generateGroupGuide({
      analysis: {
        reference: raw.reference,
        passageText: '7 When the thousand years are ended ... 15 the lake of fire.',
        phrases: [],
      },
      plainDoc: null,
      apiKey: 'test-key',
      createClient: harness.createClient,
      retry: (fn) => fn(),
      parse: (response) => JSON.parse(response.content[0].text),
    })
    assert.strictEqual(harness.calls.length, 2)
    assert.strictEqual(harness.calls[0].output_config.effort, 'low')
    assert.strictEqual(harness.calls[0].output_config.format.type, 'json_schema')
    assert.ok(harness.calls[0].max_tokens >= 12000)
    assert.strictEqual(guide.verification.status, 'verified')
  })

  await test('a failed draft is returned to the model for correction', async () => {
    const raw = fixture()
    const invalid = fixture()
    invalid.questions[6].leaderKey.conciseAnswer = null
    const harness = scriptedClient([invalid, raw, raw])
    const guide = await generateGroupGuide({
      analysis: {
        reference: raw.reference,
        passageText: '7 When the thousand years are ended ... 15 the lake of fire.',
        phrases: [],
      },
      plainDoc: null,
      apiKey: 'test-key',
      createClient: harness.createClient,
      retry: (fn) => fn(),
      parse: (response) => JSON.parse(response.content[0].text),
    })
    assert.strictEqual(harness.calls.length, 3)
    assert.ok(harness.calls[1].messages[0].content.includes('CORRECT THIS INVALID DRAFT'))
    assert.strictEqual(guide.verification.status, 'verified')
  })

  console.log(`\n${passed}/${passed + failed} passed`)
  if (failed) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
