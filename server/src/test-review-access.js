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

// ── Env-seeded review link hashes (offline mint → hashes in env → seed on deploy) ──
const { mintReviewLinkCodes, parseReviewLinkHashes, seedReviewLinkHashes } = require('./review-access')
const { sha256 } = require('./mobile')

function seedFakeDb({ existing = false, plan = 'free', status = 'none', billing = false, deleting = false, alreadyPresent = [] } = {}) {
  const state = { committed: false, rolledBack: false, links: [], planUpdates: 0, inserted: null }
  const account = {
    id: 'review-account-id',
    deleting_at: deleting ? new Date() : null,
    stripe_customer_id: billing ? 'cus_x' : null,
    stripe_subscription_id: null,
    plan,
    status,
  }
  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN') return { rows: [] }
      if (sql === 'COMMIT') { state.committed = true; return { rows: [] } }
      if (sql === 'ROLLBACK') { state.rolledBack = true; return { rows: [] } }
      if (/SELECT id, deleting_at/.test(sql)) return { rows: existing ? [account] : [] }
      if (/INSERT INTO account \(email, plan, status\)/.test(sql)) {
        state.inserted = { email: params[0] }
        return { rows: [{ ...account, plan: 'comp', status: 'active' }] }
      }
      if (/UPDATE account SET plan = 'comp', status = 'active'/.test(sql)) { state.planUpdates += 1; return { rows: [] } }
      if (/INSERT INTO device_link/.test(sql)) {
        if (alreadyPresent.includes(params[0])) return { rows: [] }
        state.links.push({ hash: params[0], accountId: params[1], expiresAt: params[2] })
        return { rows: [{ code_hash: params[0] }] }
      }
      throw new Error(`Unhandled SQL: ${sql.slice(0, 80)}`)
    },
    release() {},
  }
  return { state, connect: async () => client }
}

test('mint yields the configured count of distinct valid codes and their sha256 hashes', () => {
  const minted = mintReviewLinkCodes({ randomBytes: deterministicRandomBytes() })
  assert.equal(minted.codes.length, REVIEW_CODE_COUNT)
  assert.equal(new Set(minted.codes).size, REVIEW_CODE_COUNT)
  assert.ok(minted.codes.every((code) => /^OPR-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)))
  assert.deepEqual(minted.hashes, minted.codes.map((code) => sha256(code)))
  assert.ok(minted.hashes.every((hash) => /^[0-9a-f]{64}$/.test(hash)))
})

test('hash parsing lowercases, dedups, and counts malformed entries without throwing', () => {
  const good = 'a'.repeat(64)
  const parsed = parseReviewLinkHashes(` ${good.toUpperCase()}, ${good}, not-a-hash, ,${'b'.repeat(63)}`)
  assert.deepEqual(parsed.hashes, [good])
  assert.equal(parsed.rejected, 2)
  assert.deepEqual(parseReviewLinkHashes(''), { hashes: [], rejected: 0 })
})

test('seeding creates the dedicated account on the comp plan and inserts every new hash for 45 days', async () => {
  const db = seedFakeDb()
  const now = new Date('2026-08-18T20:00:00.000Z')
  const hashes = ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)]
  const result = await seedReviewLinkHashes(db, { hashes, now })
  assert.equal(result.accountCreated, true)
  assert.equal(db.state.inserted.email, REVIEW_ACCOUNT_EMAIL)
  assert.equal(result.inserted, 3)
  assert.equal(result.existing, 0)
  assert.equal(new Date(result.expiresAt).getTime() - now.getTime(), REVIEW_LINK_TTL_MS)
  assert.deepEqual(db.state.links.map((link) => link.hash), hashes)
  assert.ok(db.state.links.every((link) => link.accountId === 'review-account-id'))
  assert.equal(db.state.planUpdates, 0)
  assert.equal(db.state.committed, true)
})

test('seeding is idempotent: already-present hashes are counted, not re-inserted, and nothing is revoked', async () => {
  const hashes = ['4'.repeat(64), '5'.repeat(64)]
  const db = seedFakeDb({ existing: true, plan: 'comp', status: 'active', alreadyPresent: [hashes[0]] })
  const result = await seedReviewLinkHashes(db, { hashes })
  assert.equal(result.accountCreated, false)
  assert.equal(result.inserted, 1)
  assert.equal(result.existing, 1)
  assert.deepEqual(db.state.links.map((link) => link.hash), [hashes[1]])
  assert.equal(db.state.planUpdates, 0)
  assert.equal(db.state.committed, true)
})

test('an existing free-tier review account is pinned to comp/active before links are seeded', async () => {
  const db = seedFakeDb({ existing: true, plan: 'free', status: 'none' })
  await seedReviewLinkHashes(db, { hashes: ['6'.repeat(64)] })
  assert.equal(db.state.planUpdates, 1)
  assert.equal(db.state.committed, true)
})

test('seeding refuses an account that has touched billing or deletion, and rolls back', async () => {
  for (const flags of [{ billing: true }, { deleting: true }]) {
    const db = seedFakeDb({ existing: true, ...flags })
    await assert.rejects(
      () => seedReviewLinkHashes(db, { hashes: ['7'.repeat(64)] }),
      (error) => error instanceof ReviewAccessError && /not empty/.test(error.message),
    )
    assert.equal(db.state.committed, false)
    assert.equal(db.state.rolledBack, true)
    assert.equal(db.state.links.length, 0)
  }
})

test('seeding refuses malformed hashes and any email but the dedicated one; empty input is a no-op', async () => {
  await assert.rejects(
    () => seedReviewLinkHashes(seedFakeDb(), { hashes: ['nope'] }),
    (error) => error instanceof ReviewAccessError && /64-hex/.test(error.message),
  )
  await assert.rejects(
    () => seedReviewLinkHashes(seedFakeDb(), { hashes: ['8'.repeat(64)], email: 'other@example.com' }),
    (error) => error instanceof ReviewAccessError && /locked/.test(error.message),
  )
  const db = seedFakeDb()
  const result = await seedReviewLinkHashes(db, { hashes: [] })
  assert.deepEqual(result, { accountId: null, accountCreated: false, inserted: 0, existing: 0 })
  assert.equal(db.state.committed, false)
})
