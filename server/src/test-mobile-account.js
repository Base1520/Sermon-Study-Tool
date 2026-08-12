const test = require('node:test')
const assert = require('node:assert/strict')

process.env.TRIAL_IDENTITY_SECRET ||= 'test-only-trial-identity-secret-at-least-32-characters'

const mailchimpCalls = []
let mailchimpFailure = null
const mailchimpPath = require.resolve('./mailchimp')
require.cache[mailchimpPath] = {
  id: mailchimpPath,
  filename: mailchimpPath,
  loaded: true,
  exports: {
    async stageMarketingSync() {},
    async syncMarketingContact() {},
    subscriberHash() { return '0123456789abcdef0123456789abcdef' },
    async stageMarketingDeletion(client) {
      await client.query(
        `INSERT INTO marketing_deletion_outbox (subscriber_hash)
              VALUES ($1)
         ON CONFLICT (subscriber_hash) DO UPDATE
                SET next_attempt_at = now(), last_error = NULL, updated_at = now()`,
        ['0123456789abcdef0123456789abcdef'],
      )
    },
    async processMarketingDeletionOutbox() {
      mailchimpCalls.push('pastor@example.com')
      if (mailchimpFailure) throw mailchimpFailure
      return { claimed: 1, completed: 1 }
    },
  },
}

const {
  MobileAccountError,
  claimAnonymousInstallData,
  deleteAccountData,
  trialIdentitySecret,
} = require('./mobile-account')

function deletionDb({
  providers = [],
  deleted = true,
  legacyStripe = false,
  activeWork = false,
  activeWorkSequence = null,
  deletingAt = null,
} = {}) {
  const workSequence = activeWorkSequence || [activeWork, activeWork]
  const state = {
    connected: false,
    connectCount: 0,
    committed: false,
    commitCount: 0,
    rolledBack: false,
    rollbackCount: 0,
    released: false,
    statements: [],
    workCheckCount: 0,
  }
  const client = {
    async query(sql, params = []) {
      state.statements.push({ sql, params })
      if (sql === 'BEGIN') return { rows: [] }
      if (sql === 'COMMIT') {
        state.committed = true
        state.commitCount += 1
        return { rows: [] }
      }
      if (sql === 'ROLLBACK') {
        state.rolledBack = true
        state.rollbackCount += 1
        return { rows: [] }
      }
      if (/SELECT id, email, install_id, free_studies_used/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rows: [{
          id: params[0], email: 'pastor@example.com',
          install_id: 'install-original', free_studies_used: 1, free_asks_used: 3,
          stripe_subscription_id: legacyStripe ? 'sub_legacy' : null,
          deleting_at: deletingAt,
        }] }
      }
      if (/SELECT DISTINCT provider/.test(sql)) {
        return { rows: providers.map((provider) => ({ provider })) }
      }
      if (/FROM study_reservation/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rows: workSequence[state.workCheckCount] ? [{ id: 'study-hold' }] : [] }
      }
      if (/FROM ask_reservation/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rows: [] }
      }
      if (/SELECT id, state FROM study/.test(sql) && /FOR UPDATE/.test(sql)) {
        const active = Boolean(workSequence[state.workCheckCount])
        state.workCheckCount += 1
        return { rows: active ? [{ id: 'study-reading', state: 'reading' }] : [{ id: 'study-ready', state: 'analyzed' }] }
      }
      if (/UPDATE account SET deleting_at = COALESCE/.test(sql)) return { rows: [], rowCount: 1 }
      if (/UPDATE account SET deleting_at = NULL/.test(sql)) return { rows: [], rowCount: 1 }
      if (/SELECT id FROM account WHERE id = \$1 AND deleting_at IS NOT NULL FOR UPDATE/.test(sql)) {
        return { rows: [{ id: params[0] }] }
      }
      if (/SELECT install_id FROM device/.test(sql)) {
        return { rows: [{ install_id: 'install-original' }, { install_id: 'install-phone' }] }
      }
      if (/INSERT INTO free_trial_tombstone/.test(sql)) return { rows: [], rowCount: params[0].length }
      if (/UPDATE usage_event/.test(sql)) return { rows: [], rowCount: 2 }
      if (/UPDATE ask_reservation/.test(sql) && /install_id = NULL/.test(sql)) return { rows: [], rowCount: 2 }
      if (/DELETE FROM feedback/.test(sql)) return { rows: [], rowCount: 2 }
      if (/DELETE FROM access_code_use/.test(sql)) return { rows: [], rowCount: 1 }
      if (/DELETE FROM anon_install/.test(sql)) return { rows: [], rowCount: 2 }
      if (/DELETE FROM account_recovery_request/.test(sql)) return { rows: [], rowCount: 2 }
      if (/DELETE FROM account_registration_code/.test(sql)) return { rows: [], rowCount: 2 }
      if (/DELETE FROM study/.test(sql)) return { rows: [], rowCount: 3 }
      if (/INSERT INTO marketing_deletion_outbox/.test(sql)) return { rows: [], rowCount: 1 }
      if (/DELETE FROM download_lead/.test(sql)) return { rows: [], rowCount: 1 }
      if (/DELETE FROM account/.test(sql)) {
        return { rows: deleted ? [{ id: params[0], email: 'pastor@example.com' }] : [] }
      }
      throw new Error(`Unhandled client SQL: ${sql}`)
    },
    release() {
      state.released = true
    },
  }
  return {
    state,
    async query(sql, params = []) {
      return client.query(sql, params)
    },
    async connect() {
      state.connected = true
      state.connectCount += 1
      return client
    },
  }
}

function identity(overrides = {}) {
  return {
    installId: 'install-phone',
    account: {
      id: 'acct-1',
      email: 'pastor@example.com',
      stripeSubscriptionId: null,
      ...overrides,
    },
  }
}

async function captureError(operation) {
  try {
    await operation()
    return null
  } catch (error) {
    return error
  }
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve))
}

test.beforeEach(() => {
  mailchimpCalls.length = 0
  mailchimpFailure = null
})

test('trial protection requires its own stable secret', () => {
  const configured = process.env.TRIAL_IDENTITY_SECRET
  delete process.env.TRIAL_IDENTITY_SECRET
  try {
    assert.throws(
      () => trialIdentitySecret(),
      (error) => error instanceof MobileAccountError && error.code === 'TRIAL_PROTECTION_NOT_CONFIGURED',
    )
  } finally {
    process.env.TRIAL_IDENTITY_SECRET = configured
  }
})

test('every account transition can claim anonymous install work through one helper', async () => {
  const statements = []
  const client = {
    async query(sql, params) {
      statements.push({ sql, params })
      return { rows: [], rowCount: 1 }
    },
  }

  await claimAnonymousInstallData(client, 'acct-1', 'install-phone')

  assert.equal(statements.length, 4)
  assert.deepEqual(
    statements.map(({ sql }) => sql.match(/UPDATE\s+([a-z_]+)/i)?.[1]),
    ['study', 'study_reservation', 'ask_reservation', 'usage_event'],
  )
  assert.ok(statements.every(({ params }) => params[0] === 'acct-1' && params[1] === 'install-phone'))
})

test('account deletion requires a linked account', async () => {
  const error = await captureError(() => deleteAccountData({}, { anonymous: true }))

  assert.ok(error instanceof MobileAccountError)
  assert.equal(error.status, 401)
  assert.equal(error.code, 'ACCOUNT_REQUIRED')
})

test('active store and legacy Stripe subscriptions require explicit confirmation', async () => {
  const db = deletionDb({ providers: ['apple'], legacyStripe: true })
  let stripeCanceled = false
  const error = await captureError(() => deleteAccountData(
    db,
    identity({ stripeSubscriptionId: 'sub_legacy' }),
    {
      cancelStripeSubscriptions: async () => { stripeCanceled = true },
    },
  ))

  assert.ok(error instanceof MobileAccountError)
  assert.equal(error.status, 409)
  assert.equal(error.code, 'ACTIVE_SUBSCRIPTION')
  assert.deepEqual(error.details.activeProviders.sort(), ['apple', 'stripe'])
  assert.equal(stripeCanceled, false)
  assert.equal(db.state.connectCount, 1)
  assert.equal(db.state.rollbackCount, 1)
  assert.deepEqual(mailchimpCalls, [])
})

test('recoverable past-due store subscriptions require explicit deletion confirmation', async () => {
  const db = deletionDb({ providers: ['google'] })
  const error = await captureError(() => deleteAccountData(db, identity()))

  assert.ok(error instanceof MobileAccountError)
  assert.equal(error.status, 409)
  assert.equal(error.code, 'ACTIVE_SUBSCRIPTION')
  assert.deepEqual(error.details.activeProviders, ['google'])
  const subscriptionQuery = db.state.statements.find(({ sql }) => /FROM billing_subscription/.test(sql))
  assert.match(subscriptionQuery.sql, /past_due/)
  assert.equal(db.state.rollbackCount, 1)
})

test('account deletion waits for active study or question work', async () => {
  const db = deletionDb({ activeWork: true })
  const error = await captureError(() => deleteAccountData(db, identity()))

  assert.ok(error instanceof MobileAccountError)
  assert.equal(error.status, 409)
  assert.equal(error.code, 'ACCOUNT_BUSY')
  assert.equal(db.state.rollbackCount, 1)
  assert.equal(db.state.statements.some(({ sql }) => /DELETE FROM account/.test(sql)), false)
  assert.deepEqual(mailchimpCalls, [])
})

test('the committed deletion marker catches raced work before external cancellation', async () => {
  const db = deletionDb({ activeWorkSequence: [false, true] })
  let cancellationCalls = 0
  const error = await captureError(() => deleteAccountData(db, identity(), {
    cancelStripeSubscriptions: async () => { cancellationCalls += 1 },
  }))

  assert.ok(error instanceof MobileAccountError)
  assert.equal(error.code, 'ACCOUNT_BUSY')
  assert.equal(cancellationCalls, 0)
  assert.equal(db.state.workCheckCount, 2)
  assert.equal(db.state.rollbackCount, 0)
  assert.equal(db.state.commitCount, 2)
  assert.equal(db.state.statements.some(({ sql }) => /UPDATE account SET deleting_at = NULL/.test(sql)), true)
  assert.equal(db.state.statements.some(({ sql }) => /DELETE FROM account/.test(sql)), false)
})

test('an external cancellation failure clears the committed marker so the bearer can retry', async () => {
  const firstAttempt = deletionDb()
  const crash = new Error('simulated process death after marker')
  const error = await captureError(() => deleteAccountData(firstAttempt, identity(), {
    cancelStripeSubscriptions: async () => { throw crash },
  }))

  assert.equal(error, crash)
  assert.equal(firstAttempt.state.rollbackCount, 0)
  assert.equal(firstAttempt.state.commitCount, 2)
  assert.equal(firstAttempt.state.statements.some(({ sql }) => /UPDATE account SET deleting_at = COALESCE/.test(sql)), true)
  assert.equal(firstAttempt.state.statements.some(({ sql }) => /UPDATE account SET deleting_at = NULL/.test(sql)), true)

  const retry = deletionDb()
  assert.deepEqual(await deleteAccountData(retry, identity(), {
    cancelStripeSubscriptions: async () => {},
  }), { ok: true })
  assert.equal(retry.state.commitCount, 3)
})

test('account deletion closes pending Stripe checkout before erasing the account link', async () => {
  const db = deletionDb()
  const canceled = []

  await deleteAccountData(db, identity(), {
    cancelStripeSubscriptions: async (transaction, accountId) => {
      assert.equal(typeof transaction.query, 'function')
      canceled.push(accountId)
    },
  })
  await flushPromises()

  assert.deepEqual(canceled, ['acct-1'])
})

test('confirmed deletion cancels Stripe before deleting data and archives Mailchimp', async () => {
  const db = deletionDb({ providers: ['stripe', 'apple'] })
  const order = []

  const result = await deleteAccountData(db, { ...identity(), installId: 'install-foreign' }, {
    confirmSubscriptions: true,
    cancelStripeSubscriptions: async (transaction, accountId) => {
      order.push(`stripe:${accountId}`)
      assert.equal(typeof transaction.query, 'function')
      assert.equal(db.state.commitCount, 2)
    },
  })
  order.push('deleted')
  await flushPromises()

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(order, ['stripe:acct-1', 'deleted'])
  assert.equal(db.state.committed, true)
  assert.equal(db.state.rolledBack, false)
  assert.equal(db.state.released, true)
  assert.deepEqual(mailchimpCalls, ['pastor@example.com'])

  const sqlOrder = db.state.statements.map(({ sql }) => sql.replace(/\s+/g, ' ').trim())
  assert.equal(sqlOrder[0], 'BEGIN')
  assert.match(sqlOrder[1], /^SELECT id, email, install_id, free_studies_used/)
  assert.match(sqlOrder[2], /^SELECT DISTINCT provider/)
  assert.match(sqlOrder[3], /^SELECT id FROM study_reservation/)
  assert.match(sqlOrder[4], /^SELECT id FROM ask_reservation/)
  assert.match(sqlOrder[5], /^SELECT id, state FROM study/)
  assert.match(sqlOrder[6], /^UPDATE account SET deleting_at = COALESCE/)
  assert.equal(sqlOrder[7], 'COMMIT')
  assert.equal(sqlOrder[8], 'BEGIN')
  assert.match(sqlOrder[9], /^SELECT id FROM account WHERE id = \$1 AND deleting_at IS NOT NULL/)
  assert.match(sqlOrder[10], /^SELECT id FROM study_reservation/)
  assert.match(sqlOrder[11], /^SELECT id FROM ask_reservation/)
  assert.match(sqlOrder[12], /^SELECT id, state FROM study/)
  assert.equal(sqlOrder[13], 'COMMIT')
  assert.equal(sqlOrder[14], 'BEGIN')
  assert.match(sqlOrder[15], /^SELECT id FROM account WHERE id = \$1 AND deleting_at IS NOT NULL/)
  assert.match(sqlOrder[16], /^SELECT install_id FROM device/)
  assert.match(sqlOrder[17], /^INSERT INTO free_trial_tombstone/)
  assert.match(sqlOrder[18], /^UPDATE usage_event/)
  assert.match(sqlOrder[19], /^UPDATE ask_reservation/)
  assert.match(sqlOrder[20], /^DELETE FROM feedback/)
  assert.match(sqlOrder[21], /^DELETE FROM access_code_use/)
  assert.match(sqlOrder[22], /^DELETE FROM anon_install/)
  assert.match(sqlOrder[23], /^DELETE FROM account_recovery_request/)
  assert.match(sqlOrder[24], /^DELETE FROM account_registration_code/)
  assert.match(sqlOrder[25], /^DELETE FROM study/)
  assert.match(sqlOrder[26], /^INSERT INTO marketing_deletion_outbox/)
  assert.match(sqlOrder[27], /^DELETE FROM download_lead/)
  assert.match(sqlOrder[28], /^DELETE FROM account/)
  assert.equal(sqlOrder[29], 'COMMIT')
  const tombstone = db.state.statements[17]
  assert.equal(tombstone.params.flat().includes('pastor@example.com'), false)
  assert.equal(tombstone.params[2], 1)
  assert.equal(tombstone.params[3], 3)
  for (const statementIndex of [19, 20, 21, 22]) {
    assert.equal(
      db.state.statements[statementIndex].params.flat().includes('install-foreign'),
      false,
      `destructive statement ${statementIndex} must ignore the caller-supplied install id`,
    )
  }
})

test('a Stripe-backed account is not deleted when cancellation is unavailable', async () => {
  const db = deletionDb({ providers: ['stripe'] })
  const error = await captureError(() => deleteAccountData(db, identity(), {
    confirmSubscriptions: true,
  }))

  assert.ok(error instanceof MobileAccountError)
  assert.equal(error.status, 503)
  assert.equal(error.code, 'STRIPE_CANCELLATION_UNAVAILABLE')
  assert.equal(db.state.connectCount, 1)
  assert.equal(db.state.rollbackCount, 1)
  assert.deepEqual(mailchimpCalls, [])
})

test('Mailchimp failure leaves a durable retry after the database commits', async () => {
  const db = deletionDb()
  mailchimpFailure = new Error('Mailchimp unavailable')
  const originalError = console.error
  const logged = []
  console.error = (...args) => logged.push(args.join(' '))

  try {
    const result = await deleteAccountData(db, identity())
    await flushPromises()

    assert.deepEqual(result, { ok: true })
    assert.equal(db.state.committed, true)
    assert.equal(db.state.rolledBack, false)
    assert.deepEqual(mailchimpCalls, ['pastor@example.com'])
    assert.equal(logged.length, 1)
    assert.match(logged[0], /deletion outbox failed: Mailchimp unavailable/)
    assert.ok(db.state.statements.some(({ sql }) => /INSERT INTO marketing_deletion_outbox/.test(sql)))
  } finally {
    console.error = originalError
  }
})

test('a failed account delete rolls back and does not archive Mailchimp', async () => {
  const db = deletionDb({ deleted: false })
  const error = await captureError(() => deleteAccountData(db, identity()))
  await flushPromises()

  assert.ok(error instanceof MobileAccountError)
  assert.equal(error.status, 404)
  assert.equal(error.code, 'ACCOUNT_NOT_FOUND')
  assert.equal(db.state.commitCount, 2)
  assert.equal(db.state.rolledBack, true)
  assert.equal(db.state.statements.some(({ sql }) => /UPDATE account SET deleting_at = NULL/.test(sql)), true)
  assert.equal(db.state.released, true)
  assert.deepEqual(mailchimpCalls, [])
})
