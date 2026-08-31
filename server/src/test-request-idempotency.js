const test = require('node:test')
const assert = require('node:assert/strict')

const {
  classifyAskRow,
  describe,
} = require('./request-idempotency')
const { reconcilePersistedStudy } = require('./routes/generation')
const fs = require('node:fs')
const path = require('node:path')

test('request identity is stable across object-key order and isolated by owner and route', () => {
  const first = describe({
    ownerId: 'account-a',
    route: 'ask',
    requestId: 'request-00000001',
    payload: { question: 'What does it mean?', history: [{ content: 'Prior', role: 'user' }] },
  })
  const reordered = describe({
    ownerId: 'account-a',
    route: 'ask',
    requestId: 'request-00000001',
    payload: { history: [{ role: 'user', content: 'Prior' }], question: 'What does it mean?' },
  })
  const otherOwner = describe({
    ownerId: 'account-b',
    route: 'ask',
    requestId: 'request-00000001',
    payload: { question: 'What does it mean?', history: [{ content: 'Prior', role: 'user' }] },
  })
  assert.deepEqual(first, reordered)
  assert.notEqual(first.id, otherOwner.id)

  const quick = describe({
    ownerId: 'account-a', route: 'quick-study', requestId: 'request-00000001',
    payload: { reference: 'John 3:16', translation: 'esv' },
  })
  const guided = describe({
    ownerId: 'account-a', route: 'guided-study', requestId: 'request-00000001',
    payload: { reference: 'John 3:16', translation: 'esv' },
  })
  assert.notEqual(quick.id, guided.id)
})

test('a completed Ask replays only for the exact request payload', () => {
  const row = { state: 'settled', request_hash: 'exact-hash', response: { answer: 'Saved answer' } }
  assert.deepEqual(classifyAskRow(row, 'exact-hash'), {
    kind: 'replay', status: 200, body: { answer: 'Saved answer' },
  })
  assert.equal(classifyAskRow(row, 'different-hash').body.error, 'REQUEST_ID_REUSED')
})

test('pending, closed, and settled-without-response requests never run implicitly again', () => {
  assert.equal(classifyAskRow({ state: 'held', request_hash: 'h', response: null }, 'h').body.error, 'REQUEST_IN_PROGRESS')
  assert.equal(classifyAskRow({ state: 'released', request_hash: 'h', response: null }, 'h').body.error, 'REQUEST_CLOSED')
  assert.equal(classifyAskRow({ state: 'settled', request_hash: 'h', response: null }, 'h').body.error, 'REQUEST_RESULT_UNAVAILABLE')
})

test('malformed request IDs fail before any reservation can be described', () => {
  for (const requestId of ['', 'short', 'spaces are invalid', 'x'.repeat(101)]) {
    assert.throws(
      () => describe({ ownerId: 'account-a', route: 'ask', requestId, payload: {} }),
      /valid requestId/,
    )
  }
})

test('safety-only answers return before Ask quota or model admission is reserved', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  for (const [start, end] of [
    ["app.post('/v1/ask'", 'const SERMON_AGENT_ROLES'],
    ["app.post('/v1/sermon-assist'", "app.get('/v1/studies/:id/commentary'"],
  ]) {
    const route = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
    assert.ok(route.indexOf('precheckQuestion(') >= 0)
    assert.ok(route.indexOf('precheckQuestion(') < route.indexOf('meter.reserveAsk('))
  }
})

test('a saved result is never replayed until its held charge settles', async () => {
  let state = 'held'
  let markedUncertain = 0
  const meter = {
    async studyReservationState() { return state },
    async settleStudyReservation() { state = 'settled'; return true },
    async markStudyReservationAccountingUncertain() { markedUncertain += 1; return true },
  }
  const engine = { async studyCost() { return 0.42 } }
  assert.deepEqual(await reconcilePersistedStudy({ db: {}, meter, engine, studyId: 'saved' }), {
    ok: true, state: 'settled',
  })
  assert.equal(markedUncertain, 0)

  state = 'held'
  engine.studyCost = async () => { throw new Error('ledger unavailable') }
  assert.deepEqual(await reconcilePersistedStudy({ db: {}, meter, engine, studyId: 'saved' }), {
    ok: false, retryable: true, state: 'held',
  })
  assert.equal(markedUncertain, 1)

  state = 'released'
  assert.deepEqual(await reconcilePersistedStudy({ db: {}, meter, engine, studyId: 'saved' }), {
    ok: false, retryable: false, state: 'released',
  })
})

test('every study route binds saved output to payload identity and settlement', () => {
  const source = fs.readFileSync(path.join(__dirname, 'routes/generation.js'), 'utf8')
  assert.equal((source.match(/request_hash/g) || []).length >= 3, true)
  assert.equal((source.match(/requestHash: idempotency\.requestHash/g) || []).length, 3)
  assert.equal((source.match(/const settlement = await reconcilePersistedStudy\(\{ db, meter, engine, studyId \}\)/g) || []).length, 3)
  assert.equal((source.match(/markStudyReservationAccountingUncertain\(db, studyId\)/g) || []).length >= 4, true)
})

test('a missing requestId is refused by default and synthesised only where opted in', () => {
  // Default posture is unchanged: no opt-in, no id, no reservation.
  assert.throws(
    () => describe({ ownerId: 'account-a', route: 'ask', payload: {} }),
    /valid requestId/,
  )
  // A supplied id is never replaced, and is not flagged synthetic.
  const supplied = describe({
    ownerId: 'account-a', route: 'ask', requestId: 'request-00000001', payload: {}, allowSynthetic: true,
  })
  assert.equal(supplied.synthetic, false)
  assert.equal(
    supplied.id,
    describe({ ownerId: 'account-a', route: 'ask', requestId: 'request-00000001', payload: {} }).id,
    'opting in must not change the id derived from a real requestId',
  )
})

test('synthesised requests are unique per call, so a legacy client can never collide with a stored row', () => {
  const ids = new Set()
  for (let i = 0; i < 500; i += 1) {
    const built = describe({
      ownerId: 'account-a',
      route: 'ask',
      // Every shape a legacy client can produce: absent, empty, or malformed.
      requestId: [undefined, '', 'short', 'spaces are invalid'][i % 4],
      payload: { question: 'identical every time' },
      allowSynthetic: true,
    })
    assert.equal(built.synthetic, true)
    ids.add(built.id)
  }
  // Identical owner, route and payload every iteration. Before this change these
  // would have been one id; the whole point is that they are 500.
  assert.equal(ids.size, 500, 'synthesised ids must never repeat')

  // A synthesised id therefore never matches a stored row, so the replay and
  // conflict branches stay unreachable — exactly main's pre-idempotency behaviour.
  assert.equal(classifyAskRow(null, 'any-hash').kind, 'new')
})

test('only the three routes that minted their own ids on main may synthesise one', () => {
  // Guard against a future edit quietly loosening quick-study or guided-study,
  // which have always required a client requestId and whose shipped mobile client
  // sends one. Loosening them would silently disable study idempotency.
  const generation = fs.readFileSync(path.join(__dirname, 'routes/generation.js'), 'utf8')
  const at = (marker) => {
    const i = generation.indexOf(marker)
    assert.ok(i >= 0, `${marker} not found`)
    return i
  }
  const analyze = generation.slice(at("app.post('/v1/analyze'"), at("app.post('/v1/quick-study'"))
  const strict = generation.slice(at("app.post('/v1/quick-study'"))
  assert.ok(analyze.includes('allowSynthetic: true'), 'analyze must tolerate a legacy client')
  assert.ok(!strict.includes('allowSynthetic'), 'quick-study and guided-study must keep requiring a requestId')
  assert.equal((generation.match(/allowSynthetic/g) || []).length, 1)

  // ask and sermon-assist share one helper in index.js.
  const index = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  const helper = index.slice(
    index.indexOf('function describeModelRequest('),
    index.indexOf("app.post('/v1/ask'"),
  )
  assert.ok(helper.includes('allowSynthetic: true'), 'ask and sermon-assist must tolerate a legacy client')
})
