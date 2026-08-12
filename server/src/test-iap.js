const test = require('node:test')
const assert = require('node:assert/strict')
const {
  Environment,
  NotificationTypeV2,
  Subtype,
} = require('@apple/app-store-server-library')

const {
  IapError,
  catalog,
  appleProductFor,
  googleProductFor,
  googleProductForLineItem,
  appleStatus,
  googleStatus,
  providerEventRank,
  latestEventTimestamp,
  googleProviderEventTimestamp,
  assertStoreEnvironmentAllowed,
  applyAppleTransaction,
  applyGooglePurchase,
  assertPurchaseOwner,
  processGoogleAcknowledgmentOutbox,
  googlePushConfiguration,
  storeCapabilities,
} = require('./iap')

const FUTURE_MS = new Date('2999-01-01T00:00:00.000Z').getTime()
const PAST_MS = new Date('2000-01-01T00:00:00.000Z').getTime()

test('core releases expose no native store capability', () => {
  assert.deepEqual(storeCapabilities({ OPERATOR_RELEASE_STAGE: 'core' }), {
    apple: false,
    google: false,
  })
})

test('full releases expose configured native store capabilities', () => {
  assert.deepEqual(storeCapabilities({
    OPERATOR_RELEASE_STAGE: 'full',
    APPLE_APP_ID: '1234567890',
    IAP_SANDBOX_ACCOUNT_EMAILS: 'tester@example.com',
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: 'service@example.iam.gserviceaccount.com',
      private_key: 'private-key',
      project_id: 'operator',
    }),
    GOOGLE_RTDN_AUDIENCE: 'operator-rtdn',
    GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: 'push@example.iam.gserviceaccount.com',
  }), {
    apple: true,
    google: true,
  })
})

function ownershipDb({ owner = null, existingAccounts = [] } = {}) {
  const queries = []
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params })
      if (/FROM billing_subscription/.test(sql)) {
        return { rows: owner ? [{ account_id: owner }] : [] }
      }
      if (/SELECT 1 FROM account/.test(sql)) {
        return { rows: existingAccounts.includes(params[0]) ? [{ '?column?': 1 }] : [] }
      }
      throw new Error(`Unhandled SQL: ${sql}`)
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

function googlePurchaseDb({ owner = null, failSubscription = false } = {}) {
  const order = []
  const state = {
    oldStatus: 'active',
    subscription: null,
    acknowledgment: null,
  }
  let snapshot = null

  const query = async (sql, params = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    if (normalized === 'BEGIN') {
      snapshot = structuredClone(state)
      order.push('begin')
      return { rows: [] }
    }
    if (normalized === 'COMMIT') {
      snapshot = null
      order.push('commit')
      return { rows: [] }
    }
    if (normalized === 'ROLLBACK') {
      Object.assign(state, snapshot || {})
      snapshot = null
      order.push('rollback')
      return { rows: [] }
    }
    if (/pg_advisory_xact_lock/.test(sql)) {
      order.push(`purchase-lock:${params[0]}`)
      return { rows: [] }
    }
    if (/SELECT id, deleting_at FROM account/.test(sql)) {
      order.push('account-lock')
      return { rows: [{ id: params[0], deleting_at: null }] }
    }
    if (/FROM billing_subscription/.test(sql) && /external_id = ANY/.test(sql)) {
      return { rows: owner ? [{ account_id: owner }] : [] }
    }
    if (/UPDATE billing_subscription/.test(sql)) {
      state.oldStatus = 'canceled'
      order.push('old-canceled')
      return { rows: [], rowCount: 1 }
    }
    if (/INSERT INTO billing_subscription/.test(sql)) {
      order.push('subscription-write')
      if (failSubscription) throw new Error('subscription write failed')
      state.subscription = {
        provider: params[1],
        plan: params[4],
        status: params[5],
        current_period_end: params[6],
      }
      return { rows: [], rowCount: 1 }
    }
    if (/SELECT id, plan, status FROM account/.test(sql)) {
      return { rows: [{ id: params[0], plan: 'free', status: 'none' }] }
    }
    if (/FROM billing_subscription/.test(sql)) {
      return { rows: state.subscription ? [state.subscription] : [] }
    }
    if (/UPDATE account\s+SET plan/.test(sql)) {
      order.push('account-write')
      return { rows: [], rowCount: 1 }
    }
    if (/INSERT INTO google_acknowledgment_outbox/.test(sql)) {
      state.acknowledgment = {
        hash: params[0],
        purchase_token: params[1],
        attempts: state.acknowledgment?.attempts || 0,
        last_error: null,
      }
      order.push('ack-queued')
      return { rows: [], rowCount: 1 }
    }
    if (/WITH due AS/.test(sql)) {
      if (!state.acknowledgment) return { rows: [] }
      state.acknowledgment.attempts += 1
      order.push('ack-claimed')
      return { rows: [{
        purchase_token: state.acknowledgment.purchase_token,
        attempts: state.acknowledgment.attempts,
      }] }
    }
    if (/UPDATE google_acknowledgment_outbox/.test(sql)) {
      if (state.acknowledgment) {
        state.acknowledgment.attempts += Number(params[1] || 0)
        state.acknowledgment.last_error = params[3]
      }
      order.push('ack-deferred')
      return { rows: [], rowCount: state.acknowledgment ? 1 : 0 }
    }
    if (/DELETE FROM google_acknowledgment_outbox/.test(sql)) {
      state.acknowledgment = null
      order.push('ack-cleared')
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`Unhandled SQL: ${sql} ${JSON.stringify(params)}`)
  }

  const client = {
    query,
    release() { order.push('released') },
  }
  const db = {
    query,
    async connect() { return client },
  }
  return { db, order, state }
}

test('the IAP catalog uses one Google subscription with six non-overlapping base plans', () => {
  assert.equal(catalog.bundleId, 'com.base1520.theoperator')
  assert.equal(catalog.androidPackage, 'com.base1520.theoperator')
  assert.equal(catalog.products.length, 6)
  assert.equal(new Set(catalog.products.map((product) => product.googleProductId)).size, 1)
  assert.equal(new Set(catalog.products.map((product) => product.androidBasePlanId)).size, 6)
  assert.equal(new Set(catalog.products.map((product) => product.appleProductId)).size, 6)

  for (const configured of catalog.products) {
    assert.deepEqual(appleProductFor(configured.appleProductId), configured)
    assert.deepEqual(
      googleProductFor(configured.googleProductId, configured.androidBasePlanId),
      configured,
    )
    assert.deepEqual(googleProductForLineItem({
      productId: configured.googleProductId,
      offerDetails: { basePlanId: configured.androidBasePlanId },
    }), configured)
  }
  assert.equal(appleProductFor('com.attacker.not-an-operator-plan'), null)
  assert.equal(googleProductFor('com.attacker.not-an-operator-plan', 'starter-monthly'), null)
  assert.equal(googleProductFor(catalog.products[0].googleProductId, 'attacker-plan'), null)
  assert.equal(googleProductForLineItem({ productId: catalog.products[0].googleProductId }), null)
})

test('Apple status honors revocation, expiry, and grace-period renewal failures', () => {
  assert.equal(appleStatus({ expiresDate: FUTURE_MS }), 'active')
  assert.equal(appleStatus({ expiresDate: PAST_MS }), 'canceled')
  assert.equal(appleStatus({ revocationDate: Date.now(), expiresDate: FUTURE_MS }), 'canceled')
  assert.equal(appleStatus({ expiresDate: FUTURE_MS }, NotificationTypeV2.REFUND), 'canceled')
  assert.equal(
    appleStatus({ expiresDate: FUTURE_MS }, NotificationTypeV2.DID_FAIL_TO_RENEW, Subtype.GRACE_PERIOD),
    'active',
  )
  assert.equal(
    appleStatus({ expiresDate: FUTURE_MS }, NotificationTypeV2.DID_FAIL_TO_RENEW, null),
    'past_due',
  )
})

test('Google status preserves canceled access only through its verified expiry', () => {
  assert.equal(googleStatus({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }), 'active')
  assert.equal(googleStatus({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }), 'active')
  assert.equal(googleStatus({
    subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
    lineItems: [{ expiryTime: '2999-01-01T00:00:00.000Z' }],
  }), 'active')
  assert.equal(googleStatus({
    subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
    lineItems: [{ expiryTime: '2000-01-01T00:00:00.000Z' }],
  }), 'canceled')

  for (const state of [
    'SUBSCRIPTION_STATE_ON_HOLD',
    'SUBSCRIPTION_STATE_PAUSED',
    'SUBSCRIPTION_STATE_PENDING',
  ]) {
    assert.equal(googleStatus({ subscriptionState: state }), 'past_due')
  }
  assert.equal(googleStatus({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }), 'canceled')
})

test('a receipt already owned by another Operator account cannot be rebound', async () => {
  const db = ownershipDb({ owner: 'acct-original' })
  const error = await captureError(() => assertPurchaseOwner(db, {
    provider: 'apple',
    externalIds: ['original-transaction-1'],
    accountId: 'acct-new',
    storeAccountId: null,
    restoring: true,
  }))

  assert.ok(error instanceof IapError)
  assert.equal(error.status, 409)
  assert.equal(error.code, 'PURCHASE_ALREADY_LINKED')
})

test('the same account may reverify its own receipt', async () => {
  const db = ownershipDb({ owner: 'acct-1' })

  await assert.doesNotReject(() => assertPurchaseOwner(db, {
    provider: 'google',
    externalIds: ['purchase-token-1'],
    accountId: 'acct-1',
    storeAccountId: 'acct-1',
    restoring: false,
  }))
})

test('a fresh receipt without a signed Operator account id is never bearer-claimable', async () => {
  const db = ownershipDb()
  const error = await captureError(() => assertPurchaseOwner(db, {
    provider: 'apple',
    externalIds: ['unlinked-transaction'],
    accountId: 'acct-1',
    storeAccountId: null,
    restoring: false,
  }))

  assert.ok(error instanceof IapError)
  assert.equal(error.code, 'PURCHASE_ACCOUNT_REQUIRED')
})

test('a fresh purchase cannot carry another account identifier', async () => {
  const db = ownershipDb()
  const error = await captureError(() => assertPurchaseOwner(db, {
    provider: 'apple',
    externalIds: ['transaction-1'],
    accountId: 'acct-new',
    storeAccountId: 'acct-old',
    restoring: false,
  }))

  assert.ok(error instanceof IapError)
  assert.equal(error.code, 'PURCHASE_ACCOUNT_MISMATCH')
  assert.equal(db.queries.length, 1)
})

test('restore allows a deleted prior account but refuses a still-live one', async () => {
  const deletedAccountDb = ownershipDb({ existingAccounts: [] })
  await assert.doesNotReject(() => assertPurchaseOwner(deletedAccountDb, {
    provider: 'apple',
    externalIds: ['transaction-1'],
    accountId: 'acct-new',
    storeAccountId: 'acct-deleted',
    restoring: true,
  }))

  const liveAccountDb = ownershipDb({ existingAccounts: ['acct-live'] })
  const error = await captureError(() => assertPurchaseOwner(liveAccountDb, {
    provider: 'apple',
    externalIds: ['transaction-2'],
    accountId: 'acct-new',
    storeAccountId: 'acct-live',
    restoring: true,
  }))

  assert.ok(error instanceof IapError)
  assert.equal(error.code, 'PURCHASE_ACCOUNT_MISMATCH')
})

test('a rebound receipt accepts its deleted signed account id but never a live foreign account', async () => {
  const deletedAccountDb = ownershipDb({ owner: 'acct-new', existingAccounts: [] })
  await assert.doesNotReject(() => assertPurchaseOwner(deletedAccountDb, {
    provider: 'google',
    externalIds: ['restored-token'],
    accountId: 'acct-new',
    storeAccountId: 'acct-deleted',
    restoring: true,
  }))

  const liveAccountDb = ownershipDb({ owner: 'acct-new', existingAccounts: ['acct-live'] })
  const error = await captureError(() => assertPurchaseOwner(liveAccountDb, {
    provider: 'google',
    externalIds: ['restored-token'],
    accountId: 'acct-new',
    storeAccountId: 'acct-live',
    restoring: true,
  }))

  assert.ok(error instanceof IapError)
  assert.equal(error.code, 'PURCHASE_ACCOUNT_MISMATCH')
})

test('terminal provider events outrank active events at the same signed time', () => {
  assert.equal(providerEventRank('active'), 10)
  assert.equal(providerEventRank('past_due'), 50)
  assert.equal(providerEventRank('canceled'), 100)
  assert.equal(
    latestEventTimestamp('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
    '2026-02-01T00:00:00.000Z',
  )
})

test('fresh Google verification can repair an older past-due event without letting a stale response win', () => {
  const purchase = { startTime: '2026-01-01T00:00:00.000Z' }
  const pastDueEvent = new Date('2026-03-01T00:00:00.000Z').getTime()

  assert.equal(
    googleProviderEventTimestamp(purchase, null, '2026-04-01T00:00:00.000Z'),
    '2026-04-01T00:00:00.000Z',
  )
  assert.ok(
    new Date(googleProviderEventTimestamp(purchase, null, '2026-02-01T00:00:00.000Z')).getTime() < pastDueEvent,
  )
  assert.ok(
    new Date(googleProviderEventTimestamp(purchase, null, '2026-04-01T00:00:00.000Z')).getTime() > pastDueEvent,
  )
})

test('sandbox receipts unlock only explicitly allowlisted review accounts', async () => {
  const previous = process.env.IAP_SANDBOX_ACCOUNT_EMAILS
  process.env.IAP_SANDBOX_ACCOUNT_EMAILS = 'review@example.com'
  try {
    const allowedDb = { async query() { return { rows: [{ email: 'Review@Example.com' }] } } }
    await assert.doesNotReject(() => assertStoreEnvironmentAllowed(allowedDb, {
      accountId: 'acct-review', environment: 'sandbox',
    }))

    const blockedDb = { async query() { return { rows: [{ email: 'customer@example.com' }] } } }
    const error = await captureError(() => assertStoreEnvironmentAllowed(blockedDb, {
      accountId: 'acct-customer', environment: 'sandbox',
    }))
    assert.ok(error instanceof IapError)
    assert.equal(error.code, 'SANDBOX_PURCHASE_FORBIDDEN')
  } finally {
    if (previous === undefined) delete process.env.IAP_SANDBOX_ACCOUNT_EMAILS
    else process.env.IAP_SANDBOX_ACCOUNT_EMAILS = previous
  }
})

test('Apple production transactions use the production policy branch', async () => {
  const previous = process.env.IAP_SANDBOX_ACCOUNT_EMAILS
  delete process.env.IAP_SANDBOX_ACCOUNT_EMAILS
  try {
    const { db } = googlePurchaseDb()
    const product = catalog.products.find((item) => item.plan === 'starter')
    const entitlement = await applyAppleTransaction(db, {
      transaction: {
        transactionId: 'apple-production-transaction',
        originalTransactionId: 'apple-production-original',
        appAccountToken: 'acct-1',
        purchaseDate: Date.parse('2026-02-03T04:05:06.000Z'),
        signedDate: Date.parse('2026-02-03T04:05:07.000Z'),
        expiresDate: FUTURE_MS,
      },
      product,
      environment: Environment.PRODUCTION,
      accountId: 'acct-1',
    })

    assert.equal(entitlement.status, 'active')
  } finally {
    if (previous === undefined) delete process.env.IAP_SANDBOX_ACCOUNT_EMAILS
    else process.env.IAP_SANDBOX_ACCOUNT_EMAILS = previous
  }
})

test('Google push authentication fails closed unless both identity settings exist', () => {
  const previousAudience = process.env.GOOGLE_RTDN_AUDIENCE
  const previousEmail = process.env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL
  try {
    process.env.GOOGLE_RTDN_AUDIENCE = 'https://api.example.com/v1/iap/google/notifications'
    delete process.env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL
    assert.throws(
      () => googlePushConfiguration(),
      (error) => error instanceof IapError && error.code === 'GOOGLE_RTDN_NOT_CONFIGURED',
    )

    process.env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL = '  PubSub@Example.com  '
    assert.deepEqual(googlePushConfiguration(), {
      audience: 'https://api.example.com/v1/iap/google/notifications',
      expectedEmail: 'pubsub@example.com',
    })
  } finally {
    if (previousAudience === undefined) delete process.env.GOOGLE_RTDN_AUDIENCE
    else process.env.GOOGLE_RTDN_AUDIENCE = previousAudience
    if (previousEmail === undefined) delete process.env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL
    else process.env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL = previousEmail
  }
})

test('Google is acknowledged only after ownership and entitlement are durably written', async () => {
  const { db, order } = googlePurchaseDb()
  const product = catalog.products.find((item) => item.plan === 'starter')
  const entitlement = await applyGooglePurchase(db, {
    purchase: {
      startTime: '2026-02-03T04:05:06.000Z',
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      externalAccountIdentifiers: { obfuscatedExternalAccountId: 'acct-1' },
      lineItems: [{ expiryTime: '2999-01-01T00:00:00.000Z' }],
    },
    product,
    purchaseToken: 'google-token',
    currentPeriodEnd: '2999-01-01T00:00:00.000Z',
    accountId: 'acct-1',
    providerObservedAt: '2026-02-03T04:05:07.000Z',
    acknowledgePurchase: async () => { order.push('acknowledged') },
  })

  assert.equal(entitlement.status, 'active')
  assert.deepEqual(
    order.filter((entry) => !['begin', 'released'].includes(entry)),
    [
      'purchase-lock:google:google-token',
      'account-lock',
      'subscription-write',
      'account-write',
      'ack-queued',
      'commit',
      'acknowledged',
      'ack-cleared',
    ],
  )
})

test('an acknowledgment outage is durable and the retry re-verifies before acknowledging', async () => {
  const originalError = console.error
  console.error = () => {}
  try {
    const { db, order, state } = googlePurchaseDb()
    const product = catalog.products.find((item) => item.plan === 'starter')
    const entitlement = await applyGooglePurchase(db, {
      purchase: {
        startTime: '2026-02-03T04:05:06.000Z',
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
        externalAccountIdentifiers: { obfuscatedExternalAccountId: 'acct-1' },
        lineItems: [{ expiryTime: '2999-01-01T00:00:00.000Z' }],
      },
      product,
      purchaseToken: 'google-token-pending-ack',
      currentPeriodEnd: '2999-01-01T00:00:00.000Z',
      accountId: 'acct-1',
      providerObservedAt: '2026-02-03T04:05:07.000Z',
      acknowledgePurchase: async () => {
        order.push('ack-attempted')
        throw new Error('temporary outage')
      },
    })

    assert.equal(entitlement.status, 'active')
    assert.equal(entitlement.finalizationPending, true)
    assert.equal(state.acknowledgment.purchase_token, 'google-token-pending-ack')
    assert.equal(state.acknowledgment.attempts, 1)
    assert.equal(state.acknowledgment.last_error, 'temporary outage')
    assert.ok(order.indexOf('commit') < order.indexOf('ack-attempted'))

    const retryOrder = []
    const retry = await processGoogleAcknowledgmentOutbox(db, {
      verifyPurchase: async (purchaseToken) => {
        retryOrder.push('verified')
        return {
          purchase: {
            subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
            acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
          },
          product,
          purchaseToken,
        }
      },
      acknowledgePurchase: async () => { retryOrder.push('acknowledged') },
      limit: 1,
    })

    assert.deepEqual(retry, { processed: 1, pending: 0 })
    assert.deepEqual(retryOrder, ['verified', 'acknowledged'])
    assert.equal(state.acknowledgment, null)
  } finally {
    console.error = originalError
  }
})

test('a linked Google replacement rolls back the old cancellation when the new write fails', async () => {
  const { db, order, state } = googlePurchaseDb({ owner: 'acct-1', failSubscription: true })
  const product = catalog.products.find((item) => item.plan === 'standard')
  let acknowledged = false
  const error = await captureError(() => applyGooglePurchase(db, {
    purchase: {
      startTime: '2026-05-01T00:00:00.000Z',
      linkedPurchaseToken: 'old-google-token',
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      externalAccountIdentifiers: { obfuscatedExternalAccountId: 'acct-1' },
      lineItems: [{ expiryTime: '2999-01-01T00:00:00.000Z' }],
    },
    product,
    purchaseToken: 'new-google-token',
    currentPeriodEnd: '2999-01-01T00:00:00.000Z',
    accountId: 'acct-1',
    providerObservedAt: '2026-05-01T00:00:01.000Z',
    acknowledgePurchase: async () => { acknowledged = true },
  }))

  assert.equal(error.message, 'subscription write failed')
  assert.equal(state.oldStatus, 'active')
  assert.equal(state.subscription, null)
  assert.equal(state.acknowledgment, null)
  assert.equal(acknowledged, false)
  assert.ok(order.indexOf('old-canceled') < order.indexOf('subscription-write'))
  assert.ok(order.indexOf('subscription-write') < order.indexOf('rollback'))
})
