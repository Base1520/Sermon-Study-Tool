const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  drainUsageWrites,
  isUsageAccountingError,
  makeRecorder,
  studyCost,
  withHostedRetry,
} = require('./engine')

const usage = {
  input_tokens: 1000,
  output_tokens: 500,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

test('a usage insert failure becomes a priced accounting failure', async () => {
  const pending = []
  const db = { query: async () => { throw new Error('usage table unavailable') } }
  const record = makeRecorder(db, {
    accountId: '00000000-0000-4000-8000-000000000001',
    studyId: 'study-accounting-failure',
    reference: 'Romans 8:1',
    installId: 'install-accounting-failure',
  }, pending)

  const priced = record('test.call', usage, 'claude-haiku-4-5')
  await assert.rejects(
    drainUsageWrites(pending),
    (error) => isUsageAccountingError(error) && error.estimatedUsd === priced.costUsd,
  )
})

test('a successful usage insert drains without weakening the exact total', async () => {
  const writes = []
  const pending = []
  const db = { async query(sql, params) { writes.push({ sql, params }); return { rows: [], rowCount: 1 } } }
  const record = makeRecorder(db, {
    accountId: null,
    studyId: 'study-accounting-success',
    reference: 'John 1:1',
    installId: 'install-accounting-success',
  }, pending)

  const priced = record('test.call', usage, 'claude-haiku-4-5')
  await drainUsageWrites(pending)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].params[8], priced.costUsd)
})

test('a failed usage total is accounting uncertainty, never zero', async () => {
  const db = { query: async () => { throw new Error('usage total unavailable') } }
  await assert.rejects(
    studyCost(db, 'study-total-failure'),
    (error) => isUsageAccountingError(error),
  )
})

test('all provider clients disable SDK retries beneath the explicit retry policy', () => {
  const source = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8')
  const clients = [...source.matchAll(/new Anthropic\.default\(\{([^}]*)\}\)/g)]
  assert.equal(clients.length, 6)
  assert.ok(clients.every((match) => /maxRetries:\s*0/.test(match[1])))
})

test('hosted overload retries stop after one bounded retry', async () => {
  let attempts = 0
  const result = await withHostedRetry(async () => {
    attempts += 1
    if (attempts === 1) throw Object.assign(new Error('overloaded'), { status: 529 })
    return 'recovered'
  }, 0)
  assert.equal(result, 'recovered')
  assert.equal(attempts, 2)

  attempts = 0
  await assert.rejects(withHostedRetry(async () => {
    attempts += 1
    throw Object.assign(new Error('overloaded'), { status: 529 })
  }, 0), /overloaded/)
  assert.equal(attempts, 2)
})

test('every spending route preserves accounting uncertainty and read always releases admission', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  const generationSource = fs.readFileSync(path.join(__dirname, 'routes/generation.js'), 'utf8')
  assert.equal((generationSource.match(/accountingUncertain/g) || []).length >= 6, true)
  assert.equal((indexSource.match(/releaseAskReservation\([^\n]*accountingUncertain/g) || []).length, 2)
  assert.match(indexSource, /finally \{[\s\S]*?modelAdmission\.finish\(db, modelAdmissionId\)/)
})
