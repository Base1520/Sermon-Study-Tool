const assert = require('assert')
const fs = require('fs')
const path = require('path')

const {
  QUICK_STUDY_MODEL,
  QUICK_STUDY_MAX_TOKENS,
  analysisForQuickStudy,
  buildQuickStudyPrompt,
  generateQuickStudy,
  quickStudyCacheKey,
  validateQuickStudy,
} = require('./quick-study')

const passage = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'
const base = {
  mainClaim: 'God shows his love by giving his Son so that everyone who believes in him will have everlasting life instead of perishing.',
  context: 'Jesus is explaining to Nicodemus that the life he needs comes from God rather than from status, ancestry, or human achievement.',
  textEvidence: [
    { words: 'God so loved the world', shows: 'The giving of the Son begins in the love of God.' },
    { words: 'whosoever believeth in him', shows: 'The promised life is received through belief in the Son.' },
  ],
  keyTerms: [
    { term: 'gave', meaning: 'God acted by giving his Son.', whyItMatters: 'Love is shown in a concrete act rather than a bare sentiment.' },
  ],
  wholeBible: 'The verse belongs to Scripture’s account of God giving life through his promised Son to people otherwise headed toward death.',
  whyItMatters: 'Christian confidence rests in what God has given and promised, not in a person’s ability to rescue himself.',
  sourceAnchors: {
    mainClaim: ['God so loved the world', 'whosoever believeth in him'],
    context: ['God so loved the world'],
    wholeBible: ['everlasting life'],
  },
  guardrails: ['The verse does not make belief a work that earns the gift.'],
  questions: ['What does the verse say moved God to give?', 'What contrast does the verse draw between perishing and life?'],
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
  console.log('\nQUICK STUDY CONTRACT')

  await test('the prompt defines a lookup rather than sermon preparation', () => {
    const prompt = buildQuickStudyPrompt({
      reference: 'John 3:16', text: passage, translation: 'kjv', vaultNotes: ['Setting: c. AD 85-95 (the latest Gospel).'],
    })
    assert.match(prompt, /not sermon preparation/i)
    assert.match(prompt, /ask "what does it mean\?" Never ask "what does it mean to you\?"/i)
    assert.match(prompt, /Do not write a sermon outline/i)
    assert.match(prompt, /P1 means the first textEvidence quotation/i)
    assert.match(prompt, /\[G1\] Setting: c\. AD 85-95/i)
  })

  await test('the route refetches canonical text and carries idempotency', () => {
    // Route moved verbatim to routes/generation.js on 2026-08-15. Keep this
    // source pin on the owning file, with a tight boundary so Guided Study
    // cannot accidentally satisfy a missing Quick Study invariant.
    const source = fs.readFileSync(path.join(__dirname, 'routes/generation.js'), 'utf8')
    const start = source.indexOf("app.post('/v1/quick-study'")
    const end = source.indexOf('// ── Tablet guided study', start)
    const route = source.slice(start, end)
    assert.match(route, /mobile\.fetchPassage/)
    assert.match(route, /req\.get\('x-esv-key'\)/)
    assert.match(route, /requestId/)
    assert.match(route, /AI_CONSENT_REQUIRED/)
    assert.match(route, /AI_PROCESSING_CONSENT_VERSION/)
    assert.match(route, /QUICK_STUDY_RESERVE_USD/)
    assert.doesNotMatch(route, /const \{ text,/)
  })

  await test('a grounded compact document is accepted', () => {
    const result = validateQuickStudy(base, {
      reference: 'John 3:16', text: passage, translation: 'kjv', vaultNotes: ['Setting: c. AD 85-95 (the latest Gospel).'],
    })
    assert.strictEqual(result.mode, 'quick')
    assert.strictEqual(result.textEvidence.length, 2)
    assert.strictEqual(result.keyTerms.length, 1)
    assert.strictEqual(result.vaultSourced, true)
  })

  await test('compact source IDs resolve to exact passage and vault evidence', () => {
    const result = validateQuickStudy({
      ...base,
      sourceAnchors: {
        mainClaim: ['P1', 'P2'],
        context: ['G1'],
        wholeBible: ['P2'],
      },
    }, {
      reference: 'John 3:16', text: passage, translation: 'kjv', vaultNotes: ['Setting: c. AD 85-95 (the latest Gospel).'],
    })
    assert.deepStrictEqual(result.sourceAnchors.mainClaim, [
      'Passage: God so loved the world',
      'Passage: whosoever believeth in him',
    ])
    assert.deepStrictEqual(result.sourceAnchors.context, [
      'Vault G1: Setting: c. AD 85-95 (the latest Gospel).',
    ])
  })

  await test('evidence not present in the passage is removed', () => {
    const result = validateQuickStudy({
      ...base,
      textEvidence: [
        ...base.textEvidence,
        { words: 'the gates of Rome', shows: 'This was invented.' },
      ],
    }, { reference: 'John 3:16', text: passage, translation: 'kjv', vaultSourced: false })
    assert.strictEqual(result.textEvidence.length, 2)
  })

  await test('a document with no passage evidence is refused', () => {
    assert.throws(() => validateQuickStudy({
      ...base,
      textEvidence: [{ words: 'the gates of Rome', shows: 'This was invented.' }],
    }, { reference: 'John 3:16', text: passage, translation: 'kjv', vaultSourced: false }), /anchor/i)
  })

  // Field bug 2026-08-17 (beta tester, TestFlight build 6): a two-verse memory
  // text was refused because the two-anchor floor applied to a ~33-word passage
  // whose only quotable clause repeats verbatim in both verses.
  const shortPassage = 'Then shall two be in the field; the one shall be taken, and the other left. Two women shall be grinding at the mill; the one shall be taken, and the other left.'
  const shortBase = {
    ...base,
    mainClaim: 'At Christ’s coming, people side by side in ordinary work will be divided: one taken, one left.',
    textEvidence: [{ words: 'the one shall be taken, and the other left', shows: 'The division is sudden and individual, not by group.' }],
    keyTerms: [{ term: 'taken', meaning: 'Removed from where one stood.', whyItMatters: 'The word marks the separation the passage announces.' }],
    sourceAnchors: {
      mainClaim: ['the one shall be taken, and the other left'],
      context: ['two be in the field'],
      wholeBible: ['grinding at the mill'],
    },
  }
  const shortOptions = { reference: 'Matthew 24:40-41', text: shortPassage, translation: 'kjv', vaultSourced: false }

  await test('a short two-verse passage passes with ONE distinct verbatim anchor', () => {
    const result = validateQuickStudy(shortBase, shortOptions)
    assert.strictEqual(result.textEvidence.length, 1)
  })

  await test('a repeated clause quoted twice cannot satisfy the two-anchor floor on a long passage', () => {
    assert.throws(() => validateQuickStudy({
      ...base,
      textEvidence: [
        { words: 'God so loved the world', shows: 'The giving begins in love.' },
        { words: 'God so loved the world', shows: 'Said again, still one clause.' },
      ],
    }, { reference: 'John 3:16', text: `${passage} ${passage}`, translation: 'kjv', vaultSourced: false }), /anchor/i)
  })

  await test('a short passage with only invented evidence is still refused', () => {
    assert.throws(() => validateQuickStudy({
      ...shortBase,
      textEvidence: [{ words: 'the gates of Rome', shows: 'This was invented.' }],
    }, shortOptions), /anchor/i)
  })

  await test('a long passage still demands two distinct anchors', () => {
    assert.throws(() => validateQuickStudy({
      ...base,
      textEvidence: [{ words: 'God so loved the world', shows: 'One anchor only.' }],
    }, { reference: 'John 3:16', text: `${passage} ${passage} ${passage}`, translation: 'kjv', vaultSourced: false }), /anchor/i)
  })

  await test('key terms must be visible in the supplied translation', () => {
    const result = validateQuickStudy({
      ...base,
      keyTerms: [
        ...base.keyTerms,
        { term: 'agape', meaning: 'A Greek word.', whyItMatters: 'It is not in the supplied English text.' },
      ],
    }, { reference: 'John 3:16', text: passage, translation: 'kjv', vaultSourced: false })
    assert.deepStrictEqual(result.keyTerms.map((item) => item.term), ['gave'])
  })

  await test('sermon construction is refused', () => {
    assert.throws(() => validateQuickStudy({ ...base, guardrails: ['Use this as point one in the sermon.'] }, {
      reference: 'John 3:16', text: passage, translation: 'kjv', vaultSourced: false,
    }), /sermon construction/i)
  })

  await test('three-point preaching language is refused', () => {
    assert.throws(() => validateQuickStudy({ ...base, guardrails: ['Preach this in three points and close with a story.'] }, {
      reference: 'John 3:16', text: passage, translation: 'kjv', vaultNotes: [],
    }), /sermon construction/i)
  })

  await test('relativized meaning language is refused', () => {
    assert.throws(() => validateQuickStudy({ ...base, questions: ['What does the text mean to you?'] }, {
      reference: 'John 3:16', text: passage, translation: 'kjv', vaultSourced: false,
    }), /relativized/i)
  })

  await test('meaning for you language is refused', () => {
    assert.throws(() => validateQuickStudy({ ...base, questions: ['What does this text mean for you?'] }, {
      reference: 'John 3:16', text: passage, translation: 'kjv', vaultNotes: [],
    }), /relativized/i)
  })

  await test('unsupported source anchors are refused', () => {
    assert.throws(() => validateQuickStudy({
      ...base,
      sourceAnchors: { ...base.sourceAnchors, context: ['A Roman governor ordered it.'] },
    }, { reference: 'John 3:16', text: passage, translation: 'kjv', vaultNotes: [] }), /source anchors/i)
  })

  await test('cache keys are stable and translation-specific', () => {
    const first = quickStudyCacheKey({ reference: 'John 3:16', text: passage, translation: 'kjv' })
    const same = quickStudyCacheKey({ reference: 'John 3:16', text: passage, translation: 'kjv' })
    const other = quickStudyCacheKey({ reference: 'John 3:16', text: passage, translation: 'web' })
    assert.strictEqual(first, same)
    assert.notStrictEqual(first, other)
  })

  await test('the lightweight analysis remains compatible with the mobile library', () => {
    const document = validateQuickStudy(base, {
      reference: 'John 3:16', text: passage, translation: 'kjv', vaultSourced: true,
    })
    const analysis = analysisForQuickStudy(document, passage)
    assert.strictEqual(analysis.mainTheme, document.mainClaim)
    assert.strictEqual(analysis.passageText, passage)
    assert.strictEqual(analysis.outline.length, document.textEvidence.length)
  })

  await test('generation makes one fast-model call and records its usage', async () => {
    const calls = []
    const usage = []
    const document = await generateQuickStudy({
      text: passage,
      reference: 'John 3:16',
      translation: 'kjv',
      apiKey: 'test-key',
      createClient: () => ({
        messages: {
          create: async (request) => {
            calls.push(request)
            return {
              content: [{ type: 'text', text: JSON.stringify(base) }],
              usage: { input_tokens: 500, output_tokens: 600 },
            }
          },
        },
      }),
      retry: (call) => call(),
      onUsage: (...entry) => usage.push(entry),
    })
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].model, QUICK_STUDY_MODEL)
    assert.strictEqual(calls[0].max_tokens, QUICK_STUDY_MAX_TOKENS)
    assert.match(calls[0].messages[0].content, /latest Gospel/i)
    assert.strictEqual(usage[0][0], 'quick-study')
    assert.strictEqual(document.mode, 'quick')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})()
