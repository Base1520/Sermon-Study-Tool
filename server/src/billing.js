const { PLANS } = require('./entitlement')

const ACTIVE_STATUSES = new Set(['active', 'trialing'])
const DELINQUENT_STATUSES = new Set(['past_due', 'unpaid', 'paused', 'incomplete'])

class BillingError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function normalizedStatus(status, currentPeriodEnd = null) {
  if (
    ACTIVE_STATUSES.has(status) &&
    currentPeriodEnd &&
    Number.isFinite(new Date(currentPeriodEnd).getTime()) &&
    new Date(currentPeriodEnd).getTime() <= Date.now()
  ) return 'canceled'
  if (ACTIVE_STATUSES.has(status)) return 'active'
  if (DELINQUENT_STATUSES.has(status)) return 'past_due'
  return 'canceled'
}

function planWeight(planKey) {
  const plan = PLANS[planKey]
  if (!plan) return -1
  return Number(plan.studiesPerMonth || 0)
}

function activelyEntitled(row) {
  return normalizedStatus(row.status, row.current_period_end) === 'active'
}

function statusWeight(row) {
  const status = normalizedStatus(row.status, row.current_period_end)
  return status === 'active' ? 2 : status === 'past_due' ? 1 : 0
}

function preferredEntitlement(rows) {
  return [...rows].sort((left, right) => {
    const statusDifference = statusWeight(right) - statusWeight(left)
    if (statusDifference) return statusDifference
    const planDifference = planWeight(right.plan) - planWeight(left.plan)
    if (planDifference) return planDifference
    return new Date(right.current_period_end || 0).getTime() - new Date(left.current_period_end || 0).getTime()
  })[0] || null
}

async function reconcileAccountEntitlement(db, accountId) {
  const accountResult = await db.query(
    `SELECT id, plan, status FROM account WHERE id = $1`,
    [accountId],
  )
  const account = accountResult.rows[0]
  if (!account) return null
  if (account.plan === 'comp') return { plan: 'comp', status: 'active' }

  const { rows } = await db.query(
    `SELECT provider, external_id, product_id, plan, status, current_period_end, billing_anchor_at
       FROM billing_subscription
      WHERE account_id = $1`,
    [accountId],
  )
  const chosen = preferredEntitlement(rows)
  const plan = chosen && PLANS[chosen.plan] ? chosen.plan : 'free'
  const status = chosen ? normalizedStatus(chosen.status, chosen.current_period_end) : 'none'
  const paidThrough = chosen?.current_period_end || null
  const usageAnchorAt = chosen?.billing_anchor_at || null

  await db.query(
    `UPDATE account
        SET plan = $2, status = $3, paid_through = $4, usage_anchor_at = $5
      WHERE id = $1`,
    [accountId, plan, status, paidThrough, usageAnchorAt],
  )
  return { plan, status, paidThrough, usageAnchorAt, provider: chosen?.provider || null }
}

async function writeSubscription(db, subscription) {
  const {
    accountId,
    provider,
    externalId,
    productId,
    plan,
    status,
    currentPeriodEnd = null,
    billingAnchorAt = null,
    providerEventAt = null,
    providerEventRank = 0,
    environment = 'production',
    metadata = {},
  } = subscription

  if (!accountId || !['stripe', 'apple', 'google'].includes(provider)) {
    throw new Error('A valid account and billing provider are required.')
  }
  if (!externalId || !productId || !PLANS[plan]) {
    throw new Error('A verified subscription id, product id, and plan are required.')
  }

  await db.query(
    `INSERT INTO billing_subscription
          (account_id, provider, external_id, product_id, plan, status,
           current_period_end, provider_event_at, provider_event_rank,
           billing_anchor_at, environment, metadata, verified_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,now())
     ON CONFLICT (provider, external_id) DO UPDATE
            SET product_id = EXCLUDED.product_id,
                plan = EXCLUDED.plan,
                status = EXCLUDED.status,
                current_period_end = EXCLUDED.current_period_end,
                billing_anchor_at = COALESCE(billing_subscription.billing_anchor_at, EXCLUDED.billing_anchor_at),
                provider_event_at = EXCLUDED.provider_event_at,
                provider_event_rank = EXCLUDED.provider_event_rank,
                environment = EXCLUDED.environment,
                metadata = EXCLUDED.metadata,
                verified_at = now(),
                updated_at = now()
          WHERE billing_subscription.provider_event_at IS NULL
             OR EXCLUDED.provider_event_at > billing_subscription.provider_event_at
             OR (
               EXCLUDED.provider_event_at = billing_subscription.provider_event_at
               AND EXCLUDED.provider_event_rank >= billing_subscription.provider_event_rank
             )`,
    [
      accountId,
      provider,
      externalId,
      productId,
      plan,
      status,
      currentPeriodEnd,
      providerEventAt,
      providerEventRank,
      billingAnchorAt,
      environment,
      JSON.stringify(metadata),
    ],
  )
  return reconcileAccountEntitlement(db, accountId)
}

async function upsertSubscription(db, subscription) {
  if (typeof db.connect !== 'function') return writeSubscription(db, subscription)

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const account = await client.query(
      `SELECT id, deleting_at FROM account WHERE id = $1 FOR UPDATE`,
      [subscription.accountId],
    )
    if (!account.rows.length) {
      throw new BillingError(404, 'ACCOUNT_NOT_FOUND', 'That Operator account no longer exists.')
    }
    if (account.rows[0].deleting_at) {
      throw new BillingError(409, 'ACCOUNT_DELETING', 'That Operator account is being deleted and cannot accept a purchase.')
    }
    const result = await writeSubscription(client, subscription)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

module.exports = {
  ACTIVE_STATUSES,
  DELINQUENT_STATUSES,
  BillingError,
  normalizedStatus,
  activelyEntitled,
  statusWeight,
  planWeight,
  preferredEntitlement,
  reconcileAccountEntitlement,
  upsertSubscription,
}
