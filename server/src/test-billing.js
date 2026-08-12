const test = require('node:test')
const assert = require('node:assert/strict')

const {
  BillingError,
  normalizedStatus,
  activelyEntitled,
  preferredEntitlement,
  reconcileAccountEntitlement,
  upsertSubscription,
} = require('./billing')

const FUTURE = '2999-01-01T00:00:00.000Z'
const LATER = '2999-02-01T00:00:00.000Z'
const PAST = '2000-01-01T00:00:00.000Z'

test('effective status expires active and trialing subscriptions at period end', () => {
  assert.equal(normalizedStatus('active', FUTURE), 'active')
  assert.equal(normalizedStatus('trialing', FUTURE), 'active')
  assert.equal(normalizedStatus('active', PAST), 'canceled')
  assert.equal(normalizedStatus('trialing', PAST), 'canceled')
  assert.equal(normalizedStatus('past_due', FUTURE), 'past_due')
  assert.equal(activelyEntitled({ status: 'active', current_period_end: PAST }), false)
})

test('an effective active entitlement outranks a richer but expired row', () => {
  const chosen = preferredEntitlement([
    { provider: 'apple', plan: 'heavy', status: 'active', current_period_end: PAST },
    { provider: 'stripe', plan: 'starter', status: 'active', current_period_end: FUTURE },
  ])

  assert.equal(chosen.provider, 'stripe')
  assert.equal(chosen.plan, 'starter')
})

test('plan allowance and then paid-through date break ties between active rows', () => {
  const richer = preferredEntitlement([
    { provider: 'stripe', plan: 'starter', status: 'active', current_period_end: LATER },
    { provider: 'google', plan: 'standard', status: 'trialing', current_period_end: FUTURE },
  ])
  assert.equal(richer.provider, 'google')

  const later = preferredEntitlement([
    { provider: 'apple', plan: 'standard', status: 'active', current_period_end: FUTURE },
    { provider: 'stripe', plan: 'standard', status: 'active', current_period_end: LATER },
  ])
  assert.equal(later.provider, 'stripe')
  assert.equal(preferredEntitlement([]), null)
})

test('a recoverable past-due subscription outranks an older canceled rich plan', () => {
  const chosen = preferredEntitlement([
    { provider: 'apple', plan: 'heavy', status: 'canceled', current_period_end: LATER },
    { provider: 'google', plan: 'starter', status: 'past_due', current_period_end: FUTURE },
  ])

  assert.equal(chosen.provider, 'google')
  assert.equal(chosen.plan, 'starter')
})

test('reconciliation writes the effective entitlement instead of an expired higher plan', async () => {
  const updates = []
  const db = {
    async query(sql, params) {
      if (/SELECT id, plan, status FROM account/.test(sql)) {
        return { rows: [{ id: 'acct-1', plan: 'standard', status: 'active' }] }
      }
      if (/FROM billing_subscription/.test(sql)) {
        return {
          rows: [
            { provider: 'apple', plan: 'heavy', status: 'active', current_period_end: PAST },
            { provider: 'google', plan: 'starter', status: 'active', current_period_end: FUTURE },
          ],
        }
      }
      if (/UPDATE account\s+SET plan/.test(sql)) {
        updates.push(params)
        return { rows: [] }
      }
      throw new Error(`Unhandled SQL: ${sql}`)
    },
  }

  const entitlement = await reconcileAccountEntitlement(db, 'acct-1')

  assert.deepEqual(entitlement, {
    plan: 'starter',
    status: 'active',
    paidThrough: FUTURE,
    usageAnchorAt: null,
    provider: 'google',
  })
  assert.deepEqual(updates, [['acct-1', 'starter', 'active', FUTURE, null]])
})

test('reconciliation degrades an account with no verified billing row to free', async () => {
  const updates = []
  const db = {
    async query(sql, params) {
      if (/SELECT id, plan, status FROM account/.test(sql)) {
        return { rows: [{ id: 'acct-1', plan: 'heavy', status: 'active' }] }
      }
      if (/FROM billing_subscription/.test(sql)) return { rows: [] }
      if (/UPDATE account\s+SET plan/.test(sql)) {
        updates.push(params)
        return { rows: [] }
      }
      throw new Error(`Unhandled SQL: ${sql}`)
    },
  }

  const entitlement = await reconcileAccountEntitlement(db, 'acct-1')

  assert.deepEqual(entitlement, {
    plan: 'free',
    status: 'none',
    paidThrough: null,
    usageAnchorAt: null,
    provider: null,
  })
  assert.deepEqual(updates, [['acct-1', 'free', 'none', null, null]])
})

test('an older provider event cannot reactivate a terminal subscription', async () => {
  let subscription = null
  const accountWrites = []
  const upsertSql = []
  const db = {
    async query(sql, params) {
      if (/INSERT INTO billing_subscription/.test(sql)) {
        upsertSql.push(sql)
        const incoming = {
          provider: params[1], external_id: params[2], product_id: params[3],
          plan: params[4], status: params[5], current_period_end: params[6],
          provider_event_at: params[7], provider_event_rank: params[8],
        }
        const currentTime = new Date(subscription?.provider_event_at || 0).getTime()
        const incomingTime = new Date(incoming.provider_event_at || 0).getTime()
        if (
          !subscription || !subscription.provider_event_at || incomingTime > currentTime ||
          (incomingTime === currentTime && incoming.provider_event_rank >= subscription.provider_event_rank)
        ) subscription = incoming
        return { rows: [], rowCount: 1 }
      }
      if (/SELECT id, plan, status FROM account/.test(sql)) {
        return { rows: [{ id: 'acct-1', plan: 'free', status: 'none' }] }
      }
      if (/FROM billing_subscription/.test(sql)) return { rows: subscription ? [subscription] : [] }
      if (/UPDATE account\s+SET plan/.test(sql)) {
        accountWrites.push(params)
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unhandled SQL: ${sql}`)
    },
  }
  const base = {
    accountId: 'acct-1', provider: 'apple', externalId: 'original-1',
    productId: 'com.base1520.theoperator.starter.monthly', plan: 'starter',
    currentPeriodEnd: FUTURE, environment: 'production',
  }
  await upsertSubscription(db, {
    ...base, status: 'canceled', providerEventAt: '2026-02-01T00:00:00.000Z', providerEventRank: 100,
  })
  await upsertSubscription(db, {
    ...base, status: 'active', providerEventAt: '2026-01-01T00:00:00.000Z', providerEventRank: 10,
  })

  assert.equal(subscription.status, 'canceled')
  assert.match(upsertSql[0], /EXCLUDED\.provider_event_at > billing_subscription\.provider_event_at/)
  assert.equal(accountWrites.at(-1)[2], 'canceled')
})

test('a deletion marker blocks store fulfillment before any subscription row is written', async () => {
  const statements = []
  let released = false
  const client = {
    async query(sql) {
      statements.push(sql)
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] }
      if (/SELECT id, deleting_at FROM account/.test(sql)) {
        return { rows: [{ id: 'acct-1', deleting_at: '2026-08-08T00:00:00.000Z' }] }
      }
      throw new Error(`A billing write crossed the deletion lock: ${sql}`)
    },
    release() { released = true },
  }
  const db = { async connect() { return client } }
  const error = await (async () => {
    try {
      await upsertSubscription(db, {
        accountId: 'acct-1', provider: 'apple', externalId: 'original-1',
        productId: 'com.base1520.theoperator.starter.monthly', plan: 'starter',
        status: 'active', currentPeriodEnd: FUTURE,
      })
      return null
    } catch (caught) {
      return caught
    }
  })()

  assert.ok(error instanceof BillingError)
  assert.equal(error.code, 'ACCOUNT_DELETING')
  assert.equal(statements.some((sql) => /INSERT INTO billing_subscription/.test(sql)), false)
  assert.equal(statements.at(-1), 'ROLLBACK')
  assert.equal(released, true)
})
