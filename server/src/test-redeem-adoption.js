const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

process.env.TRIAL_IDENTITY_SECRET ||= 'test-only-trial-identity-secret-at-least-32-characters'

const auth = require('./auth')
const { ensureDeviceInstallDataClaimed } = require('./install-data-adoption')
const { redeemAccessCode } = require('./redeem')

function compDb({ adoptionFailure = false } = {}) {
  const state = {
    accessUseAccountId: null,
    accountUseCount: 0,
    adoptedAccountId: null,
    statements: [],
    transactions: [],
    tokenIssues: 0,
    markedDevices: 0,
  }
  const client = {
    async query(sql, params = []) {
      state.statements.push({ sql, params })
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
        state.transactions.push(sql)
        return { rows: [] }
      }
      if (/FROM access_code\s+WHERE code/.test(sql)) {
        return { rows: [{ code: params[0], plan: 'comp', label: 'Private comp', uses_max: null, uses_count: state.accountUseCount, revoked_at: null }] }
      }
      if (/SELECT account_id FROM access_code_use/.test(sql)) {
        return { rows: state.accessUseAccountId ? [{ account_id: state.accessUseAccountId }] : [] }
      }
      if (/UPDATE access_code SET uses_count/.test(sql)) {
        state.accountUseCount += 1
        return { rows: [{ uses_count: state.accountUseCount }] }
      }
      if (/INSERT INTO account/.test(sql)) return { rows: [{ id: 'acct-comp' }] }
      if (/INSERT INTO access_code_use/.test(sql)) {
        state.accessUseAccountId = params[2]
        return { rows: [], rowCount: 1 }
      }
      if (/UPDATE study\s/.test(sql)) {
        if (adoptionFailure) throw new Error('simulated adoption failure')
        state.adoptedAccountId = params[0]
        return { rows: [], rowCount: 1 }
      }
      if (/UPDATE (study_reservation|ask_reservation|usage_event)/.test(sql)) return { rows: [], rowCount: 1 }
      if (/INSERT INTO device/.test(sql)) {
        state.tokenIssues += 1
        return { rows: [{ id: `device-${state.tokenIssues}`, created_at: new Date() }] }
      }
      if (/UPDATE device SET install_data_claimed_at/.test(sql)) {
        state.markedDevices += 1
        return { rows: [], rowCount: 1 }
      }
      if (/SELECT plan, status FROM account/.test(sql)) return { rows: [{ plan: 'comp', status: 'active' }] }
      throw new Error(`Unhandled comp SQL: ${sql}`)
    },
    release() {},
  }
  return { state, async connect() { return client } }
}

function legacyDeviceDb() {
  const state = {
    accountId: null,
    marker: null,
    connectCount: 0,
    transactions: [],
    adoptionUpdates: 0,
  }
  const client = {
    async query(sql, params = []) {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
        state.transactions.push(sql)
        return { rows: [] }
      }
      if (/SELECT id, install_id, install_data_claimed_at/.test(sql)) {
        return { rows: [{ id: 'device-bound', install_id: 'install-bound', install_data_claimed_at: state.marker }] }
      }
      if (/UPDATE study\s/.test(sql)) {
        state.accountId = params[0]
        state.adoptionUpdates += 1
        return { rows: [], rowCount: 1 }
      }
      if (/UPDATE (study_reservation|ask_reservation|usage_event)/.test(sql)) {
        state.adoptionUpdates += 1
        return { rows: [], rowCount: 1 }
      }
      if (/UPDATE device SET install_data_claimed_at/.test(sql)) {
        state.marker = new Date()
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unhandled legacy SQL: ${sql}`)
    },
    release() {},
  }
  return {
    state,
    async connect() {
      state.connectCount += 1
      return client
    },
  }
}

test('fresh comp redemption adopts before token issue and commits once', async () => {
  const db = compDb()
  const result = await redeemAccessCode(db, { code: 'PRIVATE-COMP-CODE', installId: 'install-comp', auth })

  assert.equal(result.accountId, 'acct-comp')
  assert.equal(typeof result.token, 'string')
  assert.equal(db.state.adoptedAccountId, 'acct-comp')
  assert.equal(db.state.accountUseCount, 1)
  assert.equal(db.state.markedDevices, 1)
  assert.deepEqual(db.state.transactions, ['BEGIN', 'COMMIT'])
  const adoptionIndex = db.state.statements.findIndex(({ sql }) => /UPDATE study\s/.test(sql))
  const tokenIndex = db.state.statements.findIndex(({ sql }) => /INSERT INTO device/.test(sql))
  assert.ok(adoptionIndex >= 0 && adoptionIndex < tokenIndex)
})

test('replayed comp redemption repairs old orphaned data without consuming another use', async () => {
  const db = compDb()
  await redeemAccessCode(db, { code: 'PRIVATE-COMP-CODE', installId: 'install-comp', auth })
  db.state.adoptedAccountId = null
  db.state.transactions.length = 0

  const replay = await redeemAccessCode(db, { code: 'PRIVATE-COMP-CODE', installId: 'install-comp', auth })

  assert.equal(replay.accountId, 'acct-comp')
  assert.equal(db.state.accountUseCount, 1)
  assert.equal(db.state.adoptedAccountId, 'acct-comp')
  assert.deepEqual(db.state.transactions, ['BEGIN', 'COMMIT'])
})

test('an adoption failure rolls back and never issues a success token', async () => {
  const db = compDb({ adoptionFailure: true })
  await assert.rejects(
    redeemAccessCode(db, { code: 'PRIVATE-COMP-CODE', installId: 'install-comp', auth }),
    /simulated adoption failure/,
  )
  assert.deepEqual(db.state.transactions, ['BEGIN', 'ROLLBACK'])
  assert.equal(db.state.tokenIssues, 0)
})

test('a legacy bearer adopts once before any authenticated route continues', async () => {
  const db = legacyDeviceDb()
  const identity = {
    account: { id: 'acct-bound' },
    deviceId: 'device-bound',
    installId: 'install-bound',
    installDataClaimedAt: null,
  }

  assert.equal(await ensureDeviceInstallDataClaimed(db, identity), true)
  assert.equal(db.state.accountId, 'acct-bound')
  assert.equal(db.state.adoptionUpdates, 4)
  assert.deepEqual(db.state.transactions, ['BEGIN', 'COMMIT'])
  assert.ok(identity.installDataClaimedAt instanceof Date)
  assert.equal(await ensureDeviceInstallDataClaimed(db, identity), false)
  assert.equal(db.state.connectCount, 1, 'a marked device must not open another adoption transaction')
})

test('authenticated identity ignores a spoofed install header', async () => {
  const db = {
    async query(sql) {
      if (/FROM device d/.test(sql)) {
        return { rows: [{
          device_id: 'device-bound', device_install_id: 'install-bound', install_data_claimed_at: null,
          revoked_at: null, id: 'acct-bound', email: 'pastor@example.com', plan: 'comp', status: 'active',
          paid_through: null, usage_anchor_at: null, is_admin: false,
          free_studies_used: 0, free_asks_used: 0,
          stripe_customer_id: null, stripe_subscription_id: null,
        }] }
      }
      if (/UPDATE device SET last_seen_at/.test(sql)) return { rows: [] }
      throw new Error(`Unhandled auth SQL: ${sql}`)
    },
  }
  const identity = await auth.identify(db, { authorization: 'Bearer opr_test', installId: 'install-spoofed' })
  assert.equal(identity.installId, 'install-bound')
  assert.equal(identity.deviceId, 'device-bound')
  assert.equal(identity.installDataClaimedAt, null)
})

test('the live stack runs legacy adoption centrally before every route', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  const authMiddleware = indexSource.indexOf('app.use(auth.middleware(db))')
  const adoptionMiddleware = indexSource.indexOf('app.use(installDataAdoption.middleware(db))')
  const firstRoute = indexSource.indexOf("app.get('/health'")
  assert.ok(authMiddleware >= 0 && authMiddleware < adoptionMiddleware)
  assert.ok(adoptionMiddleware < firstRoute)
  // The redeem route moved to routes/community.js (2026-08-15). The guard's
  // intent is unchanged and now has two halves: (1) the moved route still calls
  // the central adoption-aware helper with auth; (2) index.js registers the
  // community mount AFTER the adoption middleware, so the moved route still
  // sits behind it — mount position IS registration order.
  const communitySource = fs.readFileSync(path.join(__dirname, 'routes', 'community.js'), 'utf8')
  const redeemStart = communitySource.indexOf("app.post('/v1/redeem'")
  assert.ok(redeemStart >= 0, 'routes/community.js must register /v1/redeem')
  assert.match(communitySource.slice(redeemStart), /redeemAccessCode\(db, \{ code: raw, installId, auth \}\)/)
  assert.match(communitySource, /Where a tester's report actually lands\./,
    'the moved feedback route must retain its WHY documentation')
  assert.doesNotMatch(indexSource, /Where a tester's report actually lands\./,
    'index.js must not retain orphaned route documentation')
  const communityMount = indexSource.indexOf('community.mount(app, db,')
  assert.ok(communityMount > adoptionMiddleware,
    'community routes must be mounted after the adoption middleware')
  assert.doesNotMatch(indexSource, /app\.post\('\/v1\/redeem'/)
})
