const test = require('node:test')
const assert = require('node:assert/strict')

process.env.STRIPE_PRICE_STARTER = 'price_starter'
process.env.STRIPE_PRICE_HEAVY = 'price_heavy'
process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder'

const { cancelAccountSubscriptions, operatorWebUrl, syncCustomer } = require('./stripe')

function subscription(id, status, priceId, created) {
  return {
    id,
    status,
    created,
    livemode: true,
    current_period_start: created,
    current_period_end: created + 2_592_000,
    billing_cycle_anchor: created,
    items: { data: [{ price: { id: priceId } }] },
  }
}

function fakeBillingDb({ deleting = false } = {}) {
  const state = {
    account: {
      id: 'acct-1',
      plan: 'heavy',
      status: 'active',
      stripeSubscriptionId: 'sub_old_heavy',
    },
    subscriptions: new Map([
      ['sub_old_heavy', {
        provider: 'stripe', external_id: 'sub_old_heavy', product_id: 'price_heavy',
        plan: 'heavy', status: 'active', current_period_end: '2999-01-01T00:00:00.000Z',
        billing_anchor_at: '2026-01-01T00:00:00.000Z',
      }],
      ['sub_orphan', {
        provider: 'stripe', external_id: 'sub_orphan', product_id: 'price_heavy',
        plan: 'heavy', status: 'active', current_period_end: '2999-01-01T00:00:00.000Z',
        billing_anchor_at: '2026-01-01T00:00:00.000Z',
      }],
    ]),
  }

  async function query(sql, params = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 }
    if (/stripe_customer_id = \$1/.test(sql)) return { rows: [{ id: state.account.id }] }
    if (/SELECT id, deleting_at FROM account WHERE id = \$1 FOR UPDATE/.test(sql)) {
      return { rows: [{ id: state.account.id, deleting_at: deleting ? '2026-08-08T00:00:00.000Z' : null }] }
    }
    if (/INSERT INTO billing_subscription/.test(sql)) {
      const existing = state.subscriptions.get(params[2])
      const incomingEventAt = new Date(params[7]).getTime()
      const existingEventAt = new Date(existing?.provider_event_at || 0).getTime()
      const incomingRank = params[8]
      const existingRank = existing?.provider_event_rank || 0
      const shouldWrite = !existing?.provider_event_at || incomingEventAt > existingEventAt ||
        (incomingEventAt === existingEventAt && incomingRank >= existingRank)
      if (!shouldWrite) return { rows: [], rowCount: 0 }
      state.subscriptions.set(params[2], {
        provider: params[1], external_id: params[2], product_id: params[3],
        plan: params[4], status: params[5], current_period_end: params[6],
        billing_anchor_at: params[9], provider_event_at: params[7],
        provider_event_rank: params[8],
      })
      return { rows: [], rowCount: 1 }
    }
    if (/SELECT id, plan, status FROM account/.test(sql)) {
      return { rows: [{ id: state.account.id, plan: state.account.plan, status: state.account.status }] }
    }
    if (/^\s*SELECT/.test(sql) && /FROM billing_subscription/.test(sql) && /WHERE account_id = \$1/.test(sql)) {
      return { rows: [...state.subscriptions.values()] }
    }
    if (/UPDATE account\s+SET plan/.test(sql)) {
      state.account.plan = params[1]
      state.account.status = params[2]
      return { rows: [], rowCount: 1 }
    }
    if (/DELETE FROM billing_subscription/.test(sql) && /NOT \(external_id = ANY/.test(sql)) {
      for (const id of [...state.subscriptions.keys()]) {
        const row = state.subscriptions.get(id)
        if (
          !params[1].includes(id) &&
          (!row.provider_event_at || new Date(row.provider_event_at).getTime() < new Date(params[2]).getTime())
        ) state.subscriptions.delete(id)
      }
      return { rows: [], rowCount: 1 }
    }
    if (/DELETE FROM billing_subscription/.test(sql)) {
      for (const [id, row] of state.subscriptions) {
        if (!row.provider_event_at || new Date(row.provider_event_at).getTime() < new Date(params[1]).getTime()) {
          state.subscriptions.delete(id)
        }
      }
      return { rows: [], rowCount: 1 }
    }
    if (/UPDATE account SET stripe_subscription_id/.test(sql)) {
      state.account.stripeSubscriptionId = params[1]
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`Unhandled Stripe sync SQL: ${sql.replace(/\s+/g, ' ').slice(0, 140)}`)
  }

  return {
    state,
    query,
    async connect() { return { query, release() {} } },
  }
}

test('Stripe synchronization updates every returned subscription before reconciling', async () => {
  const db = fakeBillingDb()
  const stripeClient = {
    subscriptions: {
      async list() {
        return {
          has_more: false,
          data: [
            subscription('sub_old_heavy', 'canceled', 'price_heavy', 1_700_000_000),
            subscription('sub_new_starter', 'active', 'price_starter', 1_800_000_000),
          ],
        }
      },
    },
  }

  const entitlement = await syncCustomer(db, 'cus_1', stripeClient)

  assert.equal(db.state.subscriptions.get('sub_old_heavy').status, 'canceled')
  assert.equal(db.state.subscriptions.has('sub_orphan'), false)
  assert.equal(db.state.account.stripeSubscriptionId, 'sub_new_starter')
  assert.equal(entitlement.plan, 'starter')
  assert.equal(entitlement.status, 'active')
})

test('a delayed stale active snapshot cannot overwrite a newer canceled snapshot', async () => {
  const db = fakeBillingDb()
  let releaseStaleSnapshot
  const staleSnapshotReady = new Promise((resolve) => { releaseStaleSnapshot = resolve })
  let staleFetchStarted
  const staleFetchDidStart = new Promise((resolve) => { staleFetchStarted = resolve })
  const staleClient = {
    subscriptions: {
      async list() {
        staleFetchStarted()
        await staleSnapshotReady
        return {
          has_more: false,
          data: [subscription('sub_old_heavy', 'active', 'price_heavy', 1_700_000_000)],
        }
      },
    },
  }
  const currentClient = {
    subscriptions: {
      async list() {
        return {
          has_more: false,
          data: [subscription('sub_old_heavy', 'canceled', 'price_heavy', 1_700_000_000)],
        }
      },
    },
  }

  const staleSync = syncCustomer(db, 'cus_1', staleClient, {
    now: () => Date.parse('2026-08-08T12:00:00.000Z'),
  })
  await staleFetchDidStart
  const currentEntitlement = await syncCustomer(db, 'cus_1', currentClient, {
    now: () => Date.parse('2026-08-08T12:00:01.000Z'),
  })
  releaseStaleSnapshot()
  const staleEntitlement = await staleSync

  assert.equal(currentEntitlement.status, 'canceled')
  assert.equal(staleEntitlement.status, 'canceled')
  assert.equal(db.state.subscriptions.get('sub_old_heavy').status, 'canceled')
  assert.equal(
    db.state.subscriptions.get('sub_old_heavy').provider_event_at,
    '2026-08-08T12:00:01.000Z',
  )
})

test('Stripe synchronization exhausts subscription pages before pruning the ledger', async () => {
  const db = fakeBillingDb()
  const firstPage = Array.from({ length: 100 }, (_, index) =>
    subscription(`sub_canceled_${String(index).padStart(3, '0')}`, 'canceled', 'price_heavy', 1_700_000_000 + index))
  const calls = []
  const stripeClient = {
    subscriptions: {
      async list(params) {
        calls.push(params)
        if (!params.starting_after) return { has_more: true, data: firstPage }
        assert.equal(params.starting_after, 'sub_canceled_099')
        return {
          has_more: false,
          data: [subscription('sub_page_two_active', 'active', 'price_starter', 1_800_000_000)],
        }
      },
    },
  }

  const entitlement = await syncCustomer(db, 'cus_1', stripeClient, {
    now: () => Date.parse('2026-08-08T12:00:00.000Z'),
  })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].starting_after, undefined)
  assert.equal(calls[1].starting_after, 'sub_canceled_099')
  assert.equal(db.state.subscriptions.size, 101)
  assert.equal(db.state.subscriptions.has('sub_orphan'), false)
  assert.equal(db.state.account.stripeSubscriptionId, 'sub_page_two_active')
  assert.equal(entitlement.plan, 'starter')
  assert.equal(entitlement.status, 'active')
})

test('a stale snapshot cannot prune subscriptions written by a newer snapshot', async () => {
  const db = fakeBillingDb()
  db.state.subscriptions.set('sub_newer', {
    provider: 'stripe', external_id: 'sub_newer', product_id: 'price_starter',
    plan: 'starter', status: 'active', current_period_end: '2999-01-01T00:00:00.000Z',
    billing_anchor_at: '2026-01-01T00:00:00.000Z',
    provider_event_at: '2026-08-08T12:00:01.000Z', provider_event_rank: 10,
  })
  const stripeClient = {
    subscriptions: {
      async list() {
        return {
          has_more: false,
          data: [subscription('sub_old_heavy', 'canceled', 'price_heavy', 1_700_000_000)],
        }
      },
    },
  }

  await syncCustomer(db, 'cus_1', stripeClient, {
    now: () => Date.parse('2026-08-08T12:00:00.000Z'),
  })

  assert.equal(db.state.subscriptions.has('sub_newer'), true)
})

test('Stripe synchronization cancels a checkout that lands after account deletion begins', async () => {
  const db = fakeBillingDb({ deleting: true })
  const canceled = []
  const stripeClient = {
    subscriptions: {
      async list() {
        return {
          has_more: false,
          data: [subscription('sub_racing_checkout', 'active', 'price_starter', 1_800_000_000)],
        }
      },
      async cancel(subscriptionId) {
        canceled.push(subscriptionId)
      },
    },
  }

  const entitlement = await syncCustomer(db, 'cus_1', stripeClient)

  assert.deepEqual(entitlement, { plan: 'free', status: 'none' })
  assert.deepEqual(canceled, ['sub_racing_checkout'])
  assert.equal(db.state.subscriptions.has('sub_racing_checkout'), false)
})

test('account cancellation expires open checkouts before canceling subscriptions', async () => {
  const order = []
  const db = {
    async query(sql) {
      if (/SELECT stripe_customer_id FROM account/.test(sql)) {
        return { rows: [{ stripe_customer_id: 'cus_1' }] }
      }
      throw new Error(`Unhandled cancellation SQL: ${sql}`)
    },
  }
  const stripeClient = {
    checkout: {
      sessions: {
        async list() { return { data: [{ id: 'cs_open' }] } },
        async expire(id) { order.push(`expire:${id}`) },
      },
    },
    subscriptions: {
      async list() {
        order.push('list-subscriptions')
        return { data: [subscription('sub_active', 'active', 'price_starter', 1_800_000_000)] }
      },
      async cancel(id) { order.push(`cancel:${id}`) },
    },
  }

  const result = await cancelAccountSubscriptions(db, 'acct-1', stripeClient)

  assert.deepEqual(result, { canceled: 1, expiredCheckouts: 1 })
  assert.deepEqual(order, ['expire:cs_open', 'list-subscriptions', 'cancel:sub_active'])
})

test('account cancellation reaches open subscriptions beyond the first page', async () => {
  const canceled = []
  const calls = []
  const firstPage = Array.from({ length: 100 }, (_, index) =>
    subscription(`sub_closed_${String(index).padStart(3, '0')}`, 'canceled', 'price_starter', 1_700_000_000 + index))
  const db = {
    async query(sql) {
      if (/SELECT stripe_customer_id FROM account/.test(sql)) {
        return { rows: [{ stripe_customer_id: 'cus_1' }] }
      }
      throw new Error(`Unhandled cancellation SQL: ${sql}`)
    },
  }
  const stripeClient = {
    subscriptions: {
      async list(params) {
        calls.push(params)
        if (!params.starting_after) return { has_more: true, data: firstPage }
        return {
          has_more: false,
          data: [subscription('sub_open_on_page_two', 'past_due', 'price_starter', 1_800_000_000)],
        }
      },
      async cancel(id) { canceled.push(id) },
    },
  }

  const result = await cancelAccountSubscriptions(db, 'acct-1', stripeClient)

  assert.equal(calls.length, 2)
  assert.equal(calls[1].starting_after, 'sub_closed_099')
  assert.deepEqual(canceled, ['sub_open_on_page_two'])
  assert.deepEqual(result, { canceled: 1, expiredCheckouts: 0 })
})

test('billing return URLs reject unsafe configuration and never become undefined', () => {
  const configured = process.env.OPERATOR_WEB_PUBLIC_URL
  const legacy = process.env.PUBLIC_URL
  try {
    process.env.OPERATOR_WEB_PUBLIC_URL = 'javascript:alert(1)'
    delete process.env.PUBLIC_URL
    assert.equal(operatorWebUrl(), 'https://www.base1520.com/operator')

    process.env.OPERATOR_WEB_PUBLIC_URL = 'https://www.base1520.com/operator/'
    assert.equal(operatorWebUrl(), 'https://www.base1520.com/operator')
  } finally {
    if (configured === undefined) delete process.env.OPERATOR_WEB_PUBLIC_URL
    else process.env.OPERATOR_WEB_PUBLIC_URL = configured
    if (legacy === undefined) delete process.env.PUBLIC_URL
    else process.env.PUBLIC_URL = legacy
  }
})
