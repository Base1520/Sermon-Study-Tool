const test = require('node:test')
const assert = require('node:assert/strict')
const {
  REVIEW_ACCOUNT_EMAIL,
  REVIEW_CODE_COUNT,
  REVIEW_LINK_TTL_MS,
  ReviewAccessError,
  provisionReviewAccess,
} = require('./review-access')

function fakeDb({ existing = false, studies = 0, subscriptions = 0 } = {}) {
  const state = { committed: false, rolledBack: false, links: [], revokedDevices: false, expiredLinks: false }
  const account = {
    id: 'review-account-id',
    deleting_at: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
  }
  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN') return { rows: [] }
      if (sql === 'COMMIT') { state.committed = true; return { rows: [] } }
      if (sql === 'ROLLBACK') { state.rolledBack = true; return { rows: [] } }
      if (/SELECT id, deleting_at/.test(sql)) return { rows: existing ? [account] : [] }
      if (/INSERT INTO account/.test(sql)) return { rows: [account] }
      if (/SELECT\s+\(SELECT COUNT\(\*\)::int FROM study/s.test(sql)) {
        return { rows: [{ studies, subscriptions }] }
      }
      if (/UPDATE device SET revoked_at/.test(sql)) { state.revokedDevices = true; return { rows: [] } }
      if (/UPDATE device_link SET expires_at/.test(sql)) { state.expiredLinks = true; return { rows: [] } }
      if (/INSERT INTO device_link/.test(sql)) {
        state.links.push({ hash: params[0], accountId: params[1], expiresAt: params[2] })
        return { rows: [{ code_hash: params[0] }] }
      }
      throw new Error(`Unhandled SQL: ${sql.slice(0, 80)}`)
    },
    release() {},
  }
  return { state, connect: async () => client }
}

function deterministicRandomBytes() {
  let seed = 0
  return () => {
    seed += 1
    return Buffer.from(Array.from({ length: 8 }, (_, index) => seed + index))
  }
}

test('provisions five one-time 45-day links only for the empty dedicated account', async () => {
  const db = fakeDb()
  const now = new Date('2026-08-10T20:00:00.000Z')
  const result = await provisionReviewAccess(db, { now, randomBytes: deterministicRandomBytes() })
  assert.equal(result.email, REVIEW_ACCOUNT_EMAIL)
  assert.equal(result.accountCreated, true)
  assert.equal(result.codes.length, REVIEW_CODE_COUNT)
  assert.equal(new Set(result.codes).size, REVIEW_CODE_COUNT)
  assert.equal(new Date(result.expiresAt).getTime() - now.getTime(), REVIEW_LINK_TTL_MS)
  assert.equal(db.state.links.length, REVIEW_CODE_COUNT)
  assert.ok(db.state.links.every((link) => link.accountId === result.accountId))
  assert.equal(db.state.revokedDevices, true)
  assert.equal(db.state.expiredLinks, true)
  assert.equal(db.state.committed, true)
  assert.equal(db.state.rolledBack, false)
})

test('refuses every email except the dedicated review identity', async () => {
  await assert.rejects(
    () => provisionReviewAccess(fakeDb(), { email: 'someone@example.com' }),
    (error) => error instanceof ReviewAccessError && /locked/.test(error.message),
  )
})

test('refuses to overwrite review study or billing data', async () => {
  const db = fakeDb({ existing: true, studies: 1 })
  await assert.rejects(
    () => provisionReviewAccess(db),
    (error) => error instanceof ReviewAccessError && /contains study or billing data/.test(error.message),
  )
  assert.equal(db.state.committed, false)
  assert.equal(db.state.rolledBack, true)
  assert.equal(db.state.links.length, 0)
})
