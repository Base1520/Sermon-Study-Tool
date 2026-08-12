const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  answerSermonAgent,
  buildSermonAssistSystem,
  cleanHistory,
} = require('./sermon-assist')

const doc = {
  reference: 'John 3:16-18',
  mainClaim: 'God gave his Son so that believers receive life rather than condemnation.',
  textUnits: [{ ref: 'vv. 16-18', heading: 'God gives the Son and exposes the dividing response' }],
  guardrails: ['Belief receives the gift; it does not earn it.'],
}
const analysis = { reference: 'John 3:16-18', passageText: 'For God so loved the world...' }

let passed = 0
let failed = 0
async function test(name, operation) {
  try {
    await operation()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name} — ${error.message}`)
  }
}

;(async () => {
  console.log('\nSERMON SPECIALIST CONTRACT')

  await test('each specialist is bounded by the verified study and cannot write a full manuscript', () => {
    for (const agent of ['exegetical', 'theological', 'homiletical', 'scholar']) {
      const prompt = buildSermonAssistSystem({ agent, doc, analysis })
      assert.match(prompt, /only evidentiary base/i)
      assert.match(prompt, /Never write a full sermon or manuscript/i)
      assert.match(prompt, /John 3:16-18/)
    }
  })

  await test('history is role-checked, bounded, and capped', () => {
    const history = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: 'x'.repeat(3000),
    }))
    const cleaned = cleanHistory(history)
    assert.strictEqual(cleaned.length, 12)
    assert.ok(cleaned.every((message) => message.content.length < 2100))
  })

  await test('personal counsel is refused before any model call', async () => {
    let calls = 0
    const result = await answerSermonAgent({
      agent: 'homiletical', doc, analysis, question: 'Should I leave my wife over this?', history: [],
      apiKey: 'test', createClient: () => ({ messages: { create: async () => { calls += 1 } } }),
    })
    assert.strictEqual(calls, 0)
    assert.match(result.answer, /question for a person/i)
  })

  await test('a grounded homiletical outline is allowed and usage is labelled', async () => {
    const labels = []
    const result = await answerSermonAgent({
      agent: 'homiletical', doc, analysis, question: 'Give me a compact text-driven outline.', history: [],
      apiKey: 'test',
      createClient: () => ({ messages: { create: async () => ({
        content: [{ type: 'text', text: '1. God gives the Son (v. 16)\n2. Belief receives life (vv. 16-18)\n3. Unbelief remains under condemnation (v. 18)' }],
        usage: { input_tokens: 100, output_tokens: 60 },
      }) } }),
      onUsage: (label) => labels.push(label),
    })
    assert.match(result.answer, /God gives the Son/)
    assert.deepStrictEqual(labels, ['sermon-assist.homiletical'])
  })

  await test('the route reads the owned server study and enforces current consent', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
    const start = source.indexOf("app.post('/v1/sermon-assist'")
    const end = source.indexOf("app.get('/v1/studies/:id/commentary'", start)
    const route = source.slice(start, end)
    assert.ok(start >= 0)
    assert.match(route, /AI_CONSENT_REQUIRED/)
    assert.match(route, /SELECT analysis, document/)
    assert.match(route, /engine\.runSermonAssist/)
    assert.doesNotMatch(route, /doc: req\.body/)
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
})()
