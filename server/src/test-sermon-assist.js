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
  verification: { status: 'ok' },
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
      assert.doesNotMatch(prompt, /No study packet is attached/i)
    }
  })

  await test('a finished document that failed its claim check is labelled provisional, never verified', () => {
    for (const agent of ['exegetical', 'theological', 'homiletical', 'scholar']) {
      const prompt = buildSermonAssistSystem({
        agent,
        doc: { ...doc, verification: { status: 'failed' } },
        analysis,
      })
      assert.match(prompt, /PROVISIONAL STUDY PACKET/)
      assert.match(prompt, /did not establish verifier approval/)
      assert.match(prompt, /never imply the packet is verified/i)
      assert.doesNotMatch(prompt, /VERIFIED STUDY PACKET/)
      assert.doesNotMatch(prompt, /<verified-study>/)
      assert.doesNotMatch(prompt, /verified text/i)
      assert.doesNotMatch(prompt, /verified packet/i)
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

  await test('the route resolves the owned server study through the shared document gate', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
    const start = source.indexOf("app.post('/v1/sermon-assist'")
    const end = source.indexOf("app.get('/v1/studies/:id/commentary'", start)
    const route = source.slice(start, end)
    assert.ok(start >= 0)
    assert.match(route, /AI_CONSENT_REQUIRED/)
    assert.match(route, /resolveOwnedStudyDocument/)
    assert.match(route, /doc: generalMode \? null : access\.study\.document/)
    assert.match(route, /surface: 'specialist'/)
    assert.match(route, /access\.status/)
    assert.match(route, /analysis: generalMode \? null : access\.study\.analysis/)
    assert.doesNotMatch(route, /document IS NOT NULL/)
    assert.match(route, /engine\.runSermonAssist/)
    assert.doesNotMatch(route, /doc: req\.body/)
  })

  await test('the registered route requires a generated-study account and derives recurring Ask access', async () => {
    const express = require('express')
    const meter = require('./meter')
    const engine = require('./engine')
    const indexPath = require.resolve('./index')
    const originalListen = express.application.listen
    const originalSetInterval = global.setInterval
    const originalReserveAsk = meter.reserveAsk
    const originalHeartbeatAskReservation = meter.heartbeatAskReservation
    const originalSettleAskReservation = meter.settleAskReservation
    const originalReleaseAskReservation = meter.releaseAskReservation
    const originalRunSermonAssist = engine.runSermonAssist
    const priorEnv = Object.fromEntries([
      'OPERATOR_RELEASE_STAGE',
      'TRIAL_IDENTITY_SECRET',
      'STRIPE_SECRET_KEY',
      'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
      'GOOGLE_RTDN_AUDIENCE',
      'GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL',
    ].map((key) => [key, process.env[key]]))
    const reservations = []
    let modelCalls = 0
    const priorUnhandledRejection = process.listeners('unhandledRejection')
    const priorUncaughtException = process.listeners('uncaughtException')

    const responseRecorder = () => ({
      statusCode: 200,
      body: undefined,
      status(code) { this.statusCode = code; return this },
      json(body) { this.body = body; return this },
    })
    const request = (account) => ({
      identity: { account, installId: 'install-route-test' },
      body: {
        agent: 'scholar',
        question: 'What makes an interpretation responsible?',
        history: [],
        aiConsentVersion: 'operator-ai-processing-v1',
      },
    })
    const invoke = async (handler, req) => {
      const res = responseRecorder()
      let nextError = null
      await handler(req, res, (error) => { nextError = error })
      assert.equal(nextError, null)
      return res
    }

    try {
      if (require.cache[indexPath]) delete require.cache[indexPath]
      process.env.OPERATOR_RELEASE_STAGE = 'full'
      process.env.TRIAL_IDENTITY_SECRET = 'test-only-trial-identity-secret-at-least-32-characters'
      process.env.STRIPE_SECRET_KEY = 'sk_test_sermon_assist_no_network'
      delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
      delete process.env.GOOGLE_RTDN_AUDIENCE
      delete process.env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL
      express.application.listen = () => ({ close() {} })
      global.setInterval = () => ({ unref() {} })
      meter.reserveAsk = async (_db, input) => {
        reservations.push(input)
        return { ok: false, reason: 'daily-limit' }
      }
      meter.heartbeatAskReservation = async () => {}
      meter.settleAskReservation = async () => {}
      meter.releaseAskReservation = async () => {}
      engine.runSermonAssist = async () => { modelCalls += 1; return { answer: 'unused' } }

      const app = require('./index')
      const layer = app._router.stack.find((candidate) =>
        candidate.route?.path === '/v1/sermon-assist' && candidate.route.methods?.post)
      assert.ok(layer, 'registered POST /v1/sermon-assist handler not found')
      const handler = layer.route.stack[0].handle

      const anonymous = await invoke(handler, request(null))
      assert.equal(anonymous.statusCode, 401)
      assert.equal(anonymous.body?.error, 'ACCOUNT_REQUIRED')
      assert.equal(reservations.length, 0)
      assert.equal(modelCalls, 0)

      const free = await invoke(handler, request({ id: 'account-free', plan: 'free', status: 'active' }))
      assert.equal(free.statusCode, 429)
      assert.equal(reservations.at(-1)?.recurringAccess, false)

      const paid = await invoke(handler, request({ id: 'account-paid', plan: 'starter', status: 'active' }))
      assert.equal(paid.statusCode, 429)
      assert.equal(reservations.at(-1)?.recurringAccess, true)
      assert.equal(modelCalls, 0)
    } finally {
      express.application.listen = originalListen
      global.setInterval = originalSetInterval
      meter.reserveAsk = originalReserveAsk
      meter.heartbeatAskReservation = originalHeartbeatAskReservation
      meter.settleAskReservation = originalSettleAskReservation
      meter.releaseAskReservation = originalReleaseAskReservation
      engine.runSermonAssist = originalRunSermonAssist
      delete require.cache[indexPath]
      for (const [key, value] of Object.entries(priorEnv)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      for (const listener of process.listeners('unhandledRejection')) {
        if (!priorUnhandledRejection.includes(listener)) process.removeListener('unhandledRejection', listener)
      }
      for (const listener of process.listeners('uncaughtException')) {
        if (!priorUncaughtException.includes(listener)) process.removeListener('uncaughtException', listener)
      }
    }
    assert.deepEqual(process.listeners('unhandledRejection'), priorUnhandledRejection)
    assert.deepEqual(process.listeners('uncaughtException'), priorUncaughtException)
    assert.equal(global.setInterval, originalSetInterval)
  })

  console.log('\nGENERAL (UNGROUNDED) MODE — every agent is a standing chat in its area')

  await test('the general prompt says it is ungrounded and carries no packet, for every agent', () => {
    for (const agent of ['exegetical', 'theological', 'homiletical', 'scholar']) {
      const prompt = buildSermonAssistSystem({ agent, doc: null, analysis: null })
      assert.match(prompt, /No study packet is attached/)
      assert.doesNotMatch(prompt, /VERIFIED STUDY PACKET/)
      assert.doesNotMatch(prompt, /only evidentiary base/i)
      assert.match(prompt, /Never write a full sermon or manuscript/i)
      assert.match(prompt, /Never fabricate/i)
      assert.match(prompt, /Never give personal counseling/i)
      assert.doesNotMatch(prompt, /not present in the verified packet/i)
      assert.doesNotMatch(prompt, /what the verified text already says/i)
    }
  })

  await test('general exegetical and homiletical roles give coherent no-packet method guidance', () => {
    const exegetical = buildSermonAssistSystem({ agent: 'exegetical', doc: null, analysis: null })
    const homiletical = buildSermonAssistSystem({ agent: 'homiletical', doc: null, analysis: null })
    assert.match(exegetical, /answer at the method level or ask for the text/i)
    assert.match(homiletical, /for general questions, answer at the method level/i)
    assert.match(homiletical, /Never imply that a verified text is attached/i)
  })

  await test('a general ask answers ungrounded, is usage-labelled, and never sees a packet', async () => {
    const systems = []
    const labels = []
    const result = await answerSermonAgent({
      agent: 'scholar', question: 'What is the strongest reading of "works" in James 2?', history: [],
      general: true,
      apiKey: 'test',
      createClient: () => ({ messages: { create: async ({ system }) => {
        systems.push(system)
        return {
          content: [{ type: 'text', text: 'The strongest reading treats works as the evidence of living faith; the strongest counter-reading treats them as its completion. The letter itself favors evidence: the text argues from outcome, not cause.' }],
          usage: { input_tokens: 80, output_tokens: 50 },
        }
      } } }),
      onUsage: (label) => labels.push(label),
    })
    assert.match(result.answer, /living faith/)
    assert.deepStrictEqual(labels, ['sermon-assist.scholar'])
    assert.match(systems[0], /No study packet is attached/)
    assert.doesNotMatch(systems[0], /verified-study/)
  })

  await test('the general flag FORCES the packet out — a passed doc cannot leak into an ungrounded answer', async () => {
    const systems = []
    await answerSermonAgent({
      agent: 'scholar', doc, analysis, question: 'Where does adoption sit in the ordo salutis?', history: [],
      general: true,
      apiKey: 'test',
      createClient: () => ({ messages: { create: async ({ system }) => {
        systems.push(system)
        return { content: [{ type: 'text', text: 'Adoption follows justification in the classical ordering; the texts present it as a distinct legal-familial act.' }], usage: {} }
      } } }),
    })
    assert.doesNotMatch(systems[0], /John 3:16-18/)
    assert.doesNotMatch(systems[0], /VERIFIED STUDY PACKET/)
  })

  await test('a study specialist also answers generally in its own discipline', async () => {
    const systems = []
    const labels = []
    const result = await answerSermonAgent({
      agent: 'homiletical', question: 'What makes a transition between points land?', history: [],
      general: true,
      apiKey: 'test',
      createClient: () => ({ messages: { create: async ({ system }) => {
        systems.push(system)
        return {
          content: [{ type: 'text', text: 'A transition lands when it restates the claim just proven and names the question the next point answers — the hearer crosses on the argument, not on a phrase.' }],
          usage: { input_tokens: 70, output_tokens: 40 },
        }
      } } }),
      onUsage: (label) => labels.push(label),
    })
    assert.match(result.answer, /transition lands/)
    assert.deepStrictEqual(labels, ['sermon-assist.homiletical'])
    assert.match(systems[0], /No study packet is attached/)
    assert.match(systems[0], /HOMILETICAL specialist/)
  })

  await test('without the general flag, a missing document still refuses — grounded requests cannot silently degrade', async () => {
    await assert.rejects(
      () => answerSermonAgent({
        agent: 'scholar', doc: null, analysis: null, question: 'Anything.', history: [],
        apiKey: 'test', createClient: () => ({ messages: { create: async () => ({ content: [] }) } }),
      }),
      /a finished verified study is required/,
    )
  })

  await test('the route treats any missing studyId as general mode and still meters the Ask', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
    const start = source.indexOf("app.post('/v1/sermon-assist'")
    const end = source.indexOf("app.get('/v1/studies/:id/commentary'", start)
    const route = source.slice(start, end)
    assert.ok(start >= 0)
    // General mode is the absence of a studyId, for EVERY agent — the old
    // study-required 400 is gone entirely (Cole's expanded call, 2026-08-15).
    assert.match(route, /const generalMode = !studyId/)
    assert.doesNotMatch(route, /STUDY_ID_REQUIRED/)
    assert.doesNotMatch(route, /studyId is required/)
    // The study gate is skipped ONLY under general mode; grounded keeps it.
    assert.match(route, /if \(!generalMode\) \{[^}]*resolveOwnedStudyDocument/s)
    // The flag reaches the engine, and the Ask reservation is unconditional —
    // general mode has no free-model-call path.
    assert.match(route, /general: generalMode/)
    const reserveIdx = route.indexOf('meter.reserveAsk')
    const generalGateIdx = route.indexOf('if (!generalMode)')
    const runIdx = route.indexOf('engine.runSermonAssist')
    assert.strictEqual((route.match(/meter\.reserveAsk/g) || []).length, 1)
    assert.ok(reserveIdx > 0 && generalGateIdx > 0 && reserveIdx > generalGateIdx,
      'reserveAsk must sit outside the general-mode fork, after it')
    assert.ok(runIdx > reserveIdx, 'reserveAsk must precede the model boundary')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
})()
