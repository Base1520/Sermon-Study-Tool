const assert = require('assert')
const fs = require('fs')
const path = require('path')

const {
  COVENANT_STEPS,
  GUIDED_APPLICATION_MAX_TOKENS,
  GUIDED_COVENANT_MAX_TOKENS,
  GUIDED_FOUNDATION_MAX_TOKENS,
  GUIDED_STUDY_MODEL,
  GUIDED_STUDY_SCHEMAS,
  PHILIPPIANS_TWO_PUBLIC_GROUNDING,
  PSALM_TWENTY_THREE_PUBLIC_GROUNDING,
  analysisForGuidedStudy,
  buildGuidedStudyPrompt,
  buildGuidedStudyPrompts,
  generateGuidedStudy,
  guidedStudyCacheKey,
  guidedStudyGroundingNotes,
  validateGuidedStudy,
} = require('./guided-study')

const passage = [
  'For God so loved the world, that he gave his only begotten Son,',
  'that whosoever believeth in him should not perish, but have everlasting life.',
  'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
  'He that believeth on him is not condemned: but he that believeth not is condemned already.',
].join(' ')
const vaultNotes = [
  'Jesus is the eternal Word made flesh - God the Son - and believing in Him is life; written "that you may believe.".',
]
const textUnits = [
  {
    ref: 'v. 16',
    heading: 'God gives the Son in love',
    anchor: 'God so loved the world',
    explanation: 'The saving movement begins in God’s love and gift rather than human achievement.',
    logic: null,
  },
  {
    ref: 'v. 17',
    heading: 'The Son comes to save',
    anchor: 'God sent not his Son into the world to condemn the world',
    explanation: 'The mission of the Son is stated as salvation rather than condemnation.',
    logic: 'grounds the promise of life in the Son’s mission',
  },
  {
    ref: 'v. 18',
    heading: 'Belief exposes the present divide',
    anchor: 'he that believeth on him is not condemned',
    explanation: 'The passage locates the decisive distinction in the response to the Son.',
    logic: 'draws the consequence of the mission',
  },
]
const base = {
  mainClaim: 'God gives and sends his Son to save the world, and the passage distinguishes life from condemnation by whether a person believes in him.',
  mainClaimSources: ['P1', 'P3'],
  situation: {
    when: 'The Gospel’s date is debated; it is commonly placed late in the first century.',
    where: 'The scene belongs to Jesus’ conversation about new birth in John 3.',
    pressure: 'The reader must understand life with God as a gift received through the Son rather than as inherited religious standing.',
    whyItChangesReading: 'The verses answer how the life Jesus has described is given and why refusing the Son leaves condemnation in place.',
    confidence: 'uncertain',
    sourceRefs: ['G1', 'P1'],
  },
  textUnits,
  keyTerms: [
    {
      term: 'believeth',
      meaningHere: 'To entrust oneself to the Son presented in the passage.',
      functionInArgument: 'It marks the response that distinguishes life from continuing condemnation.',
      whyItMatters: 'The passage directs confidence toward the Son rather than toward ancestry or achievement.',
    },
  ],
  covenant: COVENANT_STEPS.map((step, index) => ({
    id: step.id,
    finding: step.id === 'examine'
      ? 'This Gospel narrative reports Jesus’ words; read each claim inside the conversation and the Gospel’s stated purpose.'
      : `${step.title} identifies a necessary part of the passage’s meaning without turning it into sermon material.`,
    check: `Read ${textUnits[index % textUnits.length].ref} and verify the quoted words in that unit.`,
    restraint: index === 5 ? 'Do not force a Christ connection beyond the Son whom the passage directly names.' : null,
    sourceRefs: index === 0 ? ['G1', 'P1'] : [`P${(index % textUnits.length) + 1}`],
  })),
  application: {
    toThemFirst: 'The first readers were called to locate life in the Son whom God gave and sent.',
    enduringTruth: 'God’s saving gift is received through belief in the Son, while rejection leaves condemnation in place.',
    today: 'Faithful response begins by resting confidence in Christ rather than in moral or religious standing.',
    corporate: 'The church must center its shared life and welcome on the Son rather than on status or achievement.',
    mission: 'The church bears witness by naming the Son as God’s saving gift to the world.',
    response: 'Name what you are relying on for life with God, then test it against the Son-centered claim of these verses.',
    sourceRefs: ['P1', 'P3'],
  },
  guardrails: [
    'Do not reduce belief to bare agreement detached from the Son the passage presents.',
    'Do not make God’s love erase the passage’s real warning about condemnation.',
  ],
  questions: [
    { question: 'What moves God to give the Son?', answer: 'The text places God’s love at the beginning of the saving action.', sourceRefs: ['P1'] },
    { question: 'Why does the passage say the Son was sent?', answer: 'It states that the Son was sent so the world through him might be saved.', sourceRefs: ['P2'] },
    { question: 'What distinction does verse 18 draw?', answer: 'Belief in the Son is contrasted with remaining under condemnation.', sourceRefs: ['P3'] },
  ],
}

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name} — ${error.message}`)
  }
}

;(async () => {
  console.log('\nGUIDED STUDY CONTRACT')

  await test('the prompt requires a real COVENANT study without sermon construction', () => {
    const input = {
      reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes,
    }
    const prompt = buildGuidedStudyPrompt(input)
    const prompts = buildGuidedStudyPrompts(input)
    assert.match(prompt, /real study, not a quick lookup/i)
    assert.match(prompt, /eight COVENANT movements/i)
    assert.match(prompt, /what the text means, never what it means to the reader/i)
    assert.match(prompt, /\[G1\] Jesus is the eternal Word/i)
    assert.match(prompt, /Never transfer the author's imprisonment/i)
    assert.match(prompt, /remains fully divine and fully human/i)
    assert.match(prompt, /read as a complete phrase rather than ending on a connector/i)
    assert.match(prompt, /individual, corporate, and mission application distinct/i)
    assert.match(prompt, /Never reverse a contrast, purpose, cause, result, command, promise, warning, or named actor/i)
    assert.doesNotMatch(prompt, /Paul is imprisoned; the Philippians are not/i)
    assert.match(prompts.foundation, /FOUNDATION half/i)
    assert.match(prompts.covenant, /COVENANT movement section/i)
    assert.match(prompts.application, /APPLICATION AND QUESTIONS section/i)
    assert.match(prompts.foundation, /exactly and contiguously/i)
    assert.match(prompts.foundation, /contain no ellipsis/i)
    for (const step of COVENANT_STEPS) {
      assert.ok(prompts.covenant.includes(step.question))
    }
    assert.doesNotMatch(prompts.covenant, /P1 means/i)
    assert.doesNotMatch(prompts.covenant, /\["P1"/i)
    assert.doesNotMatch(prompts.application, /\["P1"/i)
  })

  await test('Philippians 2 accuracy rules are included only for Philippians 2', () => {
    const philippiansPrompt = buildGuidedStudyPrompt({
      reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes,
    })
    assert.match(philippiansPrompt, /do not describe this as losing, forfeiting, renouncing, or surrendering divine honor/i)
    assert.match(philippiansPrompt, /do not turn Christ's unique humiliation and exaltation into a rule/i)
    assert.match(philippiansPrompt, /rather than choosing among lexical theories/i)
    assert.match(philippiansPrompt, /Paul is imprisoned; the Philippians are not/i)
    assert.match(philippiansPrompt, /Do not add Roman or crucifixion-practice background/i)
    assert.match(philippiansPrompt, /Outside Navigate Tensions, never state that Christ refused to seize/i)
    assert.match(philippiansPrompt, /keep verse 5 as its own natural unit/i)
    assert.match(philippiansPrompt, /never use Christ's voluntary self-giving to require someone to endure abuse/i)
  })

  await test('Psalm 23 keeps YHWH as shepherd and restrains afterlife claims', () => {
    const prompt = buildGuidedStudyPrompt({
      reference: 'Psalm 23:1-6', text: passage, translation: 'kjv', vaultNotes,
    })
    assert.match(prompt, /keep the LORD \(YHWH\) as the shepherd named by the psalm/i)
    assert.match(prompt, /does not by itself settle an explicit afterlife or heaven claim/i)
    const notes = guidedStudyGroundingNotes('Psalm 23:1-6')
    assert.ok(notes.includes(PSALM_TWENTY_THREE_PUBLIC_GROUNDING[0]))
    assert.ok(notes.includes(PSALM_TWENTY_THREE_PUBLIC_GROUNDING[1]))
    const result = validateGuidedStudy({
      ...base,
      mainClaim: "The psalm culminates in eternal dwelling in God's house.",
      covenant: base.covenant.map((step) => step.id === 'anchor'
        ? { ...step, finding: 'The passage speaks of God the Father as shepherd before Christ fulfills that office.' }
        : step),
    }, { reference: 'Psalm 23:1-6', text: passage, translation: 'kjv', vaultNotes })
    assert.match(result.mainClaim, /does not explicitly settle the afterlife question/i)
    assert.match(result.covenant[5].finding, /the LORD as shepherd/i)
    assert.doesNotMatch(JSON.stringify(result), /God the Father as shepherd|eternal dwelling/i)
  })

  await test('short passages request and accept one natural unit', () => {
    const shortPassage = 'Jesus Christ is the same yesterday, today, and forever.'
    const prompts = buildGuidedStudyPrompts({
      reference: 'Hebrews 13:8', text: shortPassage, translation: 'web', vaultNotes,
    })
    assert.match(prompts.foundation, /Create exactly 1 natural textUnit/i)
    const result = validateGuidedStudy({
      ...base,
      mainClaimSources: ['P1'],
      textUnits: [{
        ref: 'v. 8',
        heading: 'Jesus Christ remains unchanged',
        anchor: 'Jesus Christ is the same',
        explanation: 'The verse identifies the enduring constancy of Jesus Christ across all time.',
        logic: null,
      }],
      keyTerms: [{
        term: 'same',
        meaningHere: 'Unchanging across the time named in the verse.',
        functionInArgument: 'It states the verse’s central affirmation about Jesus Christ.',
        whyItMatters: 'The reader’s confidence rests in Christ’s constancy rather than changing circumstances.',
      }],
      covenant: base.covenant.map((step) => ({ ...step, sourceRefs: ['P1'] })),
      application: { ...base.application, sourceRefs: ['P1'] },
      questions: base.questions.map((question) => ({ ...question, sourceRefs: ['P1'] })),
    }, { reference: 'Hebrews 13:8', text: shortPassage, translation: 'web', vaultNotes })
    assert.strictEqual(result.textUnits.length, 1)
  })

  await test('the route refetches canonical text and uses a smaller guided reserve', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
    const start = source.indexOf("app.post('/v1/guided-study'")
    const end = source.indexOf('// ── The reading', start)
    const route = source.slice(start, end)
    assert.match(route, /mobile\.fetchPassage/)
    assert.match(route, /requestId/)
    assert.match(route, /AI_CONSENT_REQUIRED/)
    assert.match(route, /AI_PROCESSING_CONSENT_VERSION/)
    assert.match(route, /GUIDED_STUDY_RESERVE_USD/)
    assert.match(route, /runGuidedStudy/)
    assert.doesNotMatch(route, /const \{ text,/)
  })

  await test('a complete grounded study is accepted', () => {
    const result = validateGuidedStudy(base, {
      reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes,
    })
    assert.strictEqual(result.mode, 'guided')
    assert.strictEqual(result.covenant.length, 8)
    assert.strictEqual(result.textUnits.length, 3)
    assert.strictEqual(result.questions.length, 3)
    assert.ok(result.application.corporate)
    assert.ok(result.application.mission)
    assert.strictEqual(result.vaultSourced, true)
  })

  await test('source IDs resolve to exact passage and vault evidence', () => {
    const result = validateGuidedStudy(base, {
      reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes,
    })
    assert.deepStrictEqual(result.mainClaimSources, [
      'Passage: God so loved the world',
      'Passage: he that believeth on him is not condemned',
    ])
    assert.match(result.situation.sourceRefs[0], /^Vault G1:/)
  })

  await test('normalized evidence remains valid when a cached study is reopened', () => {
    const first = validateGuidedStudy(base, {
      reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes,
    })
    const reopened = validateGuidedStudy(first, {
      reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes,
    })
    assert.deepStrictEqual(reopened.mainClaimSources, first.mainClaimSources)
    assert.deepStrictEqual(reopened.situation.sourceRefs, first.situation.sourceRefs)
    assert.deepStrictEqual(reopened.covenant.map((step) => step.sourceRefs), first.covenant.map((step) => step.sourceRefs))
  })

  await test('Philippians 2 receives public literary and Isaiah grounding without widening the vault slice', () => {
    const notes = guidedStudyGroundingNotes('Philippians 2:5-11')
    assert.ok(notes.includes(PHILIPPIANS_TWO_PUBLIC_GROUNDING[0]))
    assert.ok(notes.includes(PHILIPPIANS_TWO_PUBLIC_GROUNDING[1]))
    assert.ok(notes.includes(PHILIPPIANS_TWO_PUBLIC_GROUNDING[2]))
    assert.ok(notes.includes(PHILIPPIANS_TWO_PUBLIC_GROUNDING[3]))
    assert.ok(notes.includes(PHILIPPIANS_TWO_PUBLIC_GROUNDING[4]))
    assert.ok(notes.length <= 9)
  })

  await test('invented text divisions are refused', () => {
    assert.throws(() => validateGuidedStudy({
      ...base,
      textUnits: [{ ...textUnits[0], anchor: 'Caesar issued the decree' }],
    }, { reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes }), /natural divisions/i)
  })

  await test('canonical bracketed verse numbers do not break exact cross-verse anchors', () => {
    const numberedPassage = `[16] ${passage
      .replace('For God sent not', '[17] For God sent not')
      .replace('He that believeth', '[18] He that believeth')}`
    const result = validateGuidedStudy({
      ...base,
      textUnits: [
        textUnits[0],
        {
          ...textUnits[1],
          anchor: 'everlasting life For God sent not his Son',
        },
        textUnits[2],
      ],
    }, { reference: 'John 3:16-18', text: numberedPassage, translation: 'kjv', vaultNotes })
    assert.strictEqual(result.textUnits.length, 3)
  })

  await test('long exact anchors are compacted to twelve words', () => {
    const result = validateGuidedStudy({
      ...base,
      textUnits: [
        {
          ...textUnits[0],
          anchor: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth',
        },
        ...textUnits.slice(1),
      ],
    }, { reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes })
    assert.ok(result.textUnits[0].anchor.split(/\s+/).length <= 12)
    assert.strictEqual(result.textUnits[0].anchor, 'that he gave his only begotten Son,')
  })

  await test('key terms must occur in the supplied translation', () => {
    const result = validateGuidedStudy({
      ...base,
      keyTerms: [...base.keyTerms, {
        term: 'agape', meaningHere: 'A Greek word.', functionInArgument: 'Invented.', whyItMatters: 'It is absent.',
      }],
    }, { reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes })
    assert.deepStrictEqual(result.keyTerms.map((item) => item.term), ['believeth'])
  })

  await test('all eight COVENANT movements are required in order', () => {
    assert.throws(() => validateGuidedStudy({ ...base, covenant: base.covenant.slice(0, 7) }, {
      reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes,
    }), /eight COVENANT/i)
    const swapped = [...base.covenant]
    ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
    assert.throws(() => validateGuidedStudy({ ...base, covenant: swapped }, {
      reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes,
    }), /misplaced/i)
  })

  await test('unsupported historical sources are refused', () => {
    assert.throws(() => validateGuidedStudy({
      ...base,
      situation: { ...base.situation, sourceRefs: ['G9'] },
    }, { reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes }), /historical setting/i)
  })

  await test('unsupported historical detail is replaced rather than displayed as documented fact', () => {
    const result = validateGuidedStudy({
      ...base,
      situation: {
        ...base.situation,
        when: 'In AD 400 during the late empire.',
        where: 'London in the British Isles.',
        pressure: 'Viking raiders were attacking the congregation.',
        confidence: 'documented',
        sourceRefs: ['G1'],
      },
    }, { reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes })
    assert.match(result.situation.when, /does not establish a precise date/i)
    assert.match(result.situation.where, /does not establish a precise location/i)
    assert.match(result.situation.pressure, /do not establish a specific external pressure/i)
    assert.strictEqual(result.situation.confidence, 'uncertain')
  })

  await test('main claim evidence, key terms, and guardrails cannot be empty', () => {
    assert.throws(() => validateGuidedStudy({ ...base, mainClaimSources: [] }, {
      reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes,
    }), /main claim/i)
    assert.throws(() => validateGuidedStudy({ ...base, keyTerms: [] }, {
      reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes,
    }), /key term/i)
    assert.throws(() => validateGuidedStudy({ ...base, guardrails: [] }, {
      reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes,
    }), /guardrails/i)
  })

  await test('sermon construction is refused', () => {
    assert.throws(() => validateGuidedStudy({
      ...base,
      guardrails: ['Turn this into three sermon points and close with a story.'],
    }, { reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes }), /sermon construction/i)
  })

  await test('historic Christology is enforced on the tablet study', () => {
    assert.throws(() => validateGuidedStudy({
      ...base,
      mainClaim: 'Jesus emptied himself of his divine attributes and later received them back at exaltation.',
    }, { reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes }), /surrendered his divinity/i)
  })

  await test('Philippians 2 self-emptying cannot be recast as surrendering divine status', () => {
    assert.throws(() => validateGuidedStudy({
      ...base,
      mainClaim: 'Christ voluntarily forfeited divine privilege before taking the form of a servant.',
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes }), /misstated Christ’s self-emptying/i)
    assert.throws(() => validateGuidedStudy({
      ...base,
      covenant: base.covenant.map((step) => step.id === 'observe'
        ? { ...step, finding: 'The divine nature enters genuine human limitation.' }
        : step),
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes }), /misstated Christ’s self-emptying/i)
    assert.throws(() => validateGuidedStudy({
      ...base,
      keyTerms: [{
        ...base.keyTerms[0],
        meaningHere: 'Christ chose a self-emptying of status and a new mode of existing.',
      }],
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes }), /misstated Christ’s self-emptying/i)
    assert.throws(() => validateGuidedStudy({
      ...base,
      questions: [
        { ...base.questions[0], answer: 'Equality with God released its claim upon him.' },
        ...base.questions.slice(1),
      ],
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes }), /misstated Christ’s self-emptying/i)
  })

  await test('negative Christology guardrails do not trigger the affirmative backstop', () => {
    const result = validateGuidedStudy({
      ...base,
      guardrails: [
        'Do not say Christ gave up divine attributes.',
        'Never claim Christ forfeited divine status or that humility earns exaltation.',
      ],
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes })
    assert.strictEqual(result.guardrails.length, 4)
    assert.match(result.guardrails[0], /enduring abuse/i)
    assert.match(result.guardrails[1], /universal salvation/i)
  })

  await test('Philippians 2 repairs a model sentence that says Christ surrendered divinity', () => {
    const result = validateGuidedStudy({
      ...base,
      mainClaim: 'Christ emptied himself of his divine nature before becoming human.',
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes })
    assert.match(result.mainClaim, /remained fully divine/i)
    assert.doesNotMatch(result.mainClaim, /emptied himself of his divine nature/i)
  })

  await test('Philippians 2 lexical theories stay inside Navigate Tensions', () => {
    const qualified = validateGuidedStudy({
      ...base,
      covenant: base.covenant.map((step) => step.id === 'verify'
        ? { ...step, finding: 'Christ did not treat equality as something to seize or exploit.' }
        : step),
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes })
    assert.match(qualified.covenant[2].finding, /^On one disputed reading,/)
    const result = validateGuidedStudy({
      ...base,
      covenant: base.covenant.map((step) => step.id === 'navigate'
        ? { ...step, finding: 'Some read the disputed wording as refusing to seize or exploit equality.' }
        : step),
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes })
    assert.strictEqual(result.covenant[6].id, 'navigate')
  })

  await test('Philippians 2 repairs shorthand that overstates lexical certainty or undermines safety', () => {
    const result = validateGuidedStudy({
      ...base,
      covenant: base.covenant.map((step) => step.id === 'verify'
        ? { ...step, finding: 'Christ’s mindset means not grasping equality for himself.' }
        : step.id === 'observe'
          ? { ...step, finding: 'Christ moved from eternal form as God into humiliation.' }
          : step.id === 'name'
            ? { ...step, finding: "God the Father acts: he perceives Christ's obedience unto death, highly exalts him, and positions him as universal Lord." }
            : step.id === 'teach'
              ? { ...step, finding: 'Faithful life means alignment with the pattern Christ embodied and God the Father honored.' }
        : step),
      application: {
        ...base.application,
        enduringTruth: 'God honors obedience.',
        today: 'Choose voluntary self-humiliation and release the need to defend or advance personal status.',
        corporate: "Build the church around God's vindication of obedience and Christ's refusal of self-regard.",
        mission: 'Choose obedience over self-protection in public witness.',
      },
      questions: [
        { ...base.questions[0], answer: 'His voluntary self-giving defined his renunciation.' },
        ...base.questions.slice(1),
      ],
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes })
    assert.match(result.covenant[2].finding, /^On one disputed reading,/)
    const applicationText = JSON.stringify(result.application)
    assert.doesNotMatch(JSON.stringify(result), /self-humiliation|obedience over self-protection|honors obedience|vindication of obedience|eternal form as God|perceives Christ|positions him as universal Lord|refusal of self-regard|renunciation/i)
    assert.match(applicationText, /without abandoning wise protection/i)
  })

  await test('Philippians 2 cannot become a general exaltation formula', () => {
    assert.throws(() => validateGuidedStudy({
      ...base,
      application: {
        ...base.application,
        enduringTruth: 'God rewards our humility with exaltation.',
      },
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes }), /general reward formula/i)
    assert.throws(() => validateGuidedStudy({
      ...base,
      covenant: base.covenant.map((step) => step.id === 'name'
        ? { ...step, finding: 'God exalts Christ, vindicating obedience and humility.' }
        : step),
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes }), /general reward formula/i)
  })

  await test('the author’s imprisonment cannot be assigned to the Philippian audience', () => {
    assert.throws(() => validateGuidedStudy({
      ...base,
      application: {
        ...base.application,
        toThemFirst: 'The Philippian prisoners needed endurance while they remained in chains.',
      },
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes }), /confused the author/i)
    assert.throws(() => validateGuidedStudy({
      ...base,
      application: {
        ...base.application,
        toThemFirst: 'Paul shows imprisoned Philippians that chains cannot contradict Christ’s example.',
      },
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes }), /confused the author/i)
  })

  await test('unsupported Roman background is refused for Philippians 2', () => {
    assert.throws(() => validateGuidedStudy({
      ...base,
      keyTerms: [{
        ...base.keyTerms[0],
        whyItMatters: 'This was the death Roman power reserved for the lowest in the empire.',
      }],
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes }), /unsupported historical background/i)
    assert.throws(() => validateGuidedStudy({
      ...base,
      keyTerms: [{
        ...base.keyTerms[0],
        whyItMatters: 'The cross was a shameful mode of execution.',
      }],
    }, { reference: 'Philippians 2:5-11', text: passage, translation: 'kjv', vaultNotes }), /unsupported crucifixion background/i)
  })

  await test('uncertain historical sources cannot remain documented', () => {
    const result = validateGuidedStudy({
      ...base,
      situation: {
        ...base.situation,
        confidence: 'documented',
        sourceRefs: ['G1'],
      },
    }, {
      reference: 'John 3:16-18',
      text: passage,
      translation: 'kjv',
      vaultNotes: ['The location is likely Ephesus; some argue Rome.'],
    })
    assert.strictEqual(result.situation.confidence, 'uncertain')
  })

  await test('relativized meaning is refused', () => {
    assert.throws(() => validateGuidedStudy({
      ...base,
      questions: [{ ...base.questions[0], question: 'What does this text mean to you?' }, ...base.questions.slice(1)],
    }, { reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes }), /relativized/i)
  })

  await test('cache keys are stable and translation-specific', () => {
    const first = guidedStudyCacheKey({ reference: 'John 3:16-18', text: passage, translation: 'kjv' })
    const same = guidedStudyCacheKey({ reference: 'John 3:16-18', text: passage, translation: 'kjv' })
    const other = guidedStudyCacheKey({ reference: 'John 3:16-18', text: passage, translation: 'web' })
    assert.strictEqual(first, same)
    assert.notStrictEqual(first, other)
  })

  await test('the guided analysis remains compatible with the synced library', () => {
    const document = validateGuidedStudy(base, {
      reference: 'John 3:16-18', text: passage, translation: 'kjv', vaultNotes,
    })
    const analysis = analysisForGuidedStudy(document, passage)
    assert.strictEqual(analysis.mainTheme, document.mainClaim)
    assert.strictEqual(analysis.passageText, passage)
    assert.strictEqual(analysis.outline.length, document.textUnits.length)
    assert.strictEqual(analysis.genre.genre, 'Gospel')
    assert.strictEqual(analysis.culturalNotes.length, 0)
  })

  await test('phone and tablet cache validation use their intended grounding slices', () => {
    const source = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8')
    const quick = source.slice(source.indexOf('async function runQuickStudy'), source.indexOf('async function runGuidedStudy'))
    const guided = source.slice(source.indexOf('async function runGuidedStudy'), source.indexOf('async function runAsk'))
    assert.match(quick, /lookupPassage\(reference, \{ maxNotes: 10, maxBookNotes: 4 \}\)/)
    assert.doesNotMatch(quick, /guidedStudyGroundingNotes/)
    assert.match(guided, /const vaultNotes = guidedStudyGroundingNotes\(reference\)/)
    assert.match(guided, /vaultNotes,/)
  })

  await test('generation makes three bounded parallel fast-model calls and records usage', async () => {
    const calls = []
    const usage = []
    let active = 0
    let maxActive = 0
    const foundation = {
      mainClaim: base.mainClaim,
      mainClaimSources: base.mainClaimSources,
      situation: base.situation,
      textUnits: base.textUnits,
      keyTerms: base.keyTerms,
    }
    const covenant = {
      covenant: base.covenant,
    }
    const application = {
      application: base.application,
      guardrails: base.guardrails,
      questions: base.questions,
    }
    const document = await generateGuidedStudy({
      text: passage,
      reference: 'John 3:16-18',
      translation: 'kjv',
      apiKey: 'test-key',
      createClient: () => ({
        messages: {
          create: async (request) => {
            calls.push(request)
            active += 1
            maxActive = Math.max(maxActive, active)
            await new Promise((resolve) => setImmediate(resolve))
            active -= 1
            const content = request.messages[0].content
            const section = content.includes('FOUNDATION half')
              ? foundation
              : content.includes('COVENANT movement section')
                ? covenant
                : application
            return {
              content: [{ type: 'text', text: JSON.stringify(section) }],
              usage: { input_tokens: 900, output_tokens: 800 },
            }
          },
        },
      }),
      retry: (call) => call(),
      onUsage: (...entry) => usage.push(entry),
    })
    assert.strictEqual(calls.length, 3)
    assert.strictEqual(maxActive, 3)
    assert.strictEqual(calls[0].model, GUIDED_STUDY_MODEL)
    assert.ok(calls.every((call) => call.output_config?.format?.type === 'json_schema'))
    assert.deepStrictEqual(calls.map((call) => call.output_config.format.schema), [
      GUIDED_STUDY_SCHEMAS.foundation,
      GUIDED_STUDY_SCHEMAS.covenant,
      GUIDED_STUDY_SCHEMAS.application,
    ])
    assert.deepStrictEqual(calls.map((call) => call.max_tokens).sort((a, b) => a - b), [
      GUIDED_APPLICATION_MAX_TOKENS,
      GUIDED_COVENANT_MAX_TOKENS,
      GUIDED_FOUNDATION_MAX_TOKENS,
    ])
    assert.deepStrictEqual(usage.map((entry) => entry[0]).sort(), [
      'guided-study.application',
      'guided-study.covenant',
      'guided-study.foundation',
    ])
    assert.strictEqual(document.mode, 'guided')
  })

  await test('a successful parallel call is metered when its sibling fails', async () => {
    const usage = []
    await assert.rejects(generateGuidedStudy({
      text: passage,
      reference: 'John 3:16-18',
      translation: 'kjv',
      apiKey: 'test-key',
      createClient: () => ({
        messages: {
          create: async (request) => {
            if (request.messages[0].content.includes('COVENANT movement section')) {
              throw new Error('covenant unavailable')
            }
            await new Promise((resolve) => setImmediate(resolve))
            return {
              content: [{ type: 'text', text: JSON.stringify({}) }],
              usage: { input_tokens: 900, output_tokens: 100 },
            }
          },
        },
      }),
      retry: (call) => call(),
      onUsage: (...entry) => usage.push(entry),
    }), /covenant unavailable/)
    assert.deepStrictEqual(usage.map((entry) => entry[0]).sort(), [
      'guided-study.application',
      'guided-study.foundation',
    ])
  })

  await test('one failed document validation receives one bounded parallel retry', async () => {
    let foundationAttempts = 0
    const usage = []
    const foundation = {
      mainClaim: base.mainClaim,
      mainClaimSources: base.mainClaimSources,
      situation: base.situation,
      textUnits: base.textUnits,
      keyTerms: base.keyTerms,
    }
    const document = await generateGuidedStudy({
      text: passage,
      reference: 'John 3:16-18',
      translation: 'kjv',
      apiKey: 'test-key',
      createClient: () => ({
        messages: {
          create: async (request) => {
            const content = request.messages[0].content
            let section
            if (content.includes('FOUNDATION half')) {
              foundationAttempts += 1
              section = foundationAttempts === 1 ? { ...foundation, mainClaimSources: [] } : foundation
            } else if (content.includes('COVENANT movement section')) {
              section = { covenant: base.covenant }
            } else {
              section = { application: base.application, guardrails: base.guardrails, questions: base.questions }
            }
            return { content: [{ type: 'text', text: JSON.stringify(section) }], usage: { input_tokens: 500, output_tokens: 300 } }
          },
        },
      }),
      retry: (call) => call(),
      onUsage: (...entry) => usage.push(entry),
    })
    assert.strictEqual(document.mode, 'guided')
    assert.strictEqual(foundationAttempts, 2)
    assert.strictEqual(usage.length, 6)
    assert.ok(usage.some((entry) => entry[0] === 'guided-study.retry.foundation'))
  })

  await test('a token-limited section fails clearly after all parallel usage is metered', async () => {
    const usage = []
    await assert.rejects(generateGuidedStudy({
      text: passage,
      reference: 'John 3:16-18',
      translation: 'kjv',
      apiKey: 'test-key',
      createClient: () => ({
        messages: {
          create: async (request) => ({
            content: [{ type: 'text', text: JSON.stringify({}) }],
            usage: { input_tokens: 900, output_tokens: request.max_tokens },
            stop_reason: request.messages[0].content.includes('FOUNDATION half') ? 'max_tokens' : 'end_turn',
          }),
        },
      }),
      retry: (call) => call(),
      onUsage: (...entry) => usage.push(entry),
    }), /foundation section exceeded its output limit/)
    assert.strictEqual(usage.length, 3)
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})()
