/**
 * stripe.js — checkout, the customer portal, and the webhook.
 *
 * TWO RULES THIS FILE IS BUILT AROUND, both from other people's expensive
 * mistakes:
 *
 *  1. STRIPE IS THE LEDGER, THIS DATABASE IS A CACHE OF IT. Every webhook does
 *     the same thing: re-read the subscription from Stripe and write the result
 *     down. Never trust the event payload to be complete, ordered, or delivered
 *     once — there are hundreds of event types, they arrive out of order, and
 *     some never arrive at all. One function, one code path, idempotent.
 *
 *  2. FAILED PAYMENT MUST BE EXPLICIT. Stripe's default grace period leaves a
 *     subscription reading "active" after a card fails. For a metered AI product
 *     that is the most expensive default in the entire stack — a non-paying user
 *     burning tokens for days. `past_due` here means the allowance stops. The
 *     library and everything already studied keep working, because taking those
 *     away would punish someone whose card merely expired.
 */

const express = require('express')
const Stripe = require('stripe')
const auth = require('./auth')
const { PLANS, PAID_PLAN_KEYS, TOPUP } = require('./entitlement')
const billing = require('./billing')
const {
  mountWebPurchase,
  preferredSubscription,
  OPEN_SUBSCRIPTION_STATUSES,
  openStoreSubscription,
  storeConflictMessage,
} = require('./web-purchase')
const {
  SOM_SOURCE,
  mountSomPurchase,
  recordSomPurchase,
  syncSomBuyerMarketing,
  markSomPurchaseRefunded,
  markSomPurchaseDisputed,
  restoreSomPurchaseAfterWonDispute,
  objectId,
} = require('./som-purchase')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })
const TOPUP_SOURCE = 'operator-topup'
const TOPUP_REFUND_RETRY_MS = 24 * 60 * 60 * 1000
const DISPUTE_EVENTS = new Set([
  'charge.dispute.created',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.closed',
])

/**
 * Same wrapper as index.js, and needed for the same reason.
 *
 * express 4 does not catch a rejected handler promise. Every route in this file
 * awaits Stripe's API — the single most likely thing in the stack to time out or
 * 500 — and an unwrapped rejection means the request gets NO response at all:
 * the app's subscribe button spins forever, and the rejection escapes to the
 * process, where Node's default is to terminate.
 */
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/** Map a Stripe price id to one of our plans. Set these in the environment. */
function planPriceIds() {
  return {
    starter: process.env.STRIPE_PRICE_STARTER,
    standard: process.env.STRIPE_PRICE_STANDARD,
    heavy: process.env.STRIPE_PRICE_HEAVY,
    starter_annual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    standard_annual: process.env.STRIPE_PRICE_STANDARD_ANNUAL,
    heavy_annual: process.env.STRIPE_PRICE_HEAVY_ANNUAL,
  }
}

const PRICE_TO_PLAN = Object.fromEntries(
  Object.entries(planPriceIds())
    .filter(([, priceId]) => Boolean(priceId))
    .map(([plan, priceId]) => [priceId, plan]),
)

async function listAllSubscriptions(stripeClient, customerId) {
  const subscriptions = []
  const cursors = new Set()
  let startingAfter = null

  while (true) {
    const page = await stripeClient.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    if (!Array.isArray(page?.data)) throw new Error('Stripe returned an invalid subscription page.')
    subscriptions.push(...page.data)
    if (!page.has_more) return subscriptions

    const nextCursor = page.data.at(-1)?.id
    if (!nextCursor || cursors.has(nextCursor)) {
      throw new Error('Stripe subscription pagination did not advance.')
    }
    cursors.add(nextCursor)
    startingAfter = nextCursor
  }
}

/**
 * The ONE function that writes subscription state. Both the webhook and the
 * post-checkout return call it, so there is exactly one path that can change
 * what a man is entitled to — the "split brain" that makes Stripe integrations
 * rot is two code paths disagreeing about the same customer.
 */
async function syncCustomer(db, customerId, stripeClient = stripe, options = {}) {
  const observedAt = new Date((options.now || Date.now)()).toISOString()
  const subscriptions = await listAllSubscriptions(stripeClient, customerId)
  const accountResult = await db.query(
    `SELECT id FROM account WHERE stripe_customer_id = $1`,
    [customerId],
  )
  const accountId = accountResult.rows[0]?.id
  if (!accountId) return { plan: 'free', status: 'none' }
  const recognized = subscriptions.filter((sub) => PRICE_TO_PLAN[sub.items.data[0]?.price?.id])
  const preferred = preferredSubscription(recognized)
  const client = typeof db.connect === 'function' ? await db.connect() : db
  const ownsClient = client !== db
  let transactionOpen = false
  let accountDeleting = false
  const deletionSignal = new Error('account deletion in progress')
  try {
    if (ownsClient) {
      await client.query('BEGIN')
      transactionOpen = true
    }
    const locked = await client.query(
      `SELECT id, deleting_at FROM account WHERE id = $1 FOR UPDATE`,
      [accountId],
    )
    if (!locked.rows.length || locked.rows[0].deleting_at) {
      accountDeleting = true
      if (transactionOpen) {
        await client.query('ROLLBACK')
        transactionOpen = false
      }
    }
    if (accountDeleting) throw deletionSignal
    const synchronizedIds = []
    for (const sub of recognized) {
      const priceId = sub.items.data[0]?.price?.id
      const plan = PRICE_TO_PLAN[priceId]
      const status =
        sub.status === 'active' || sub.status === 'trialing' ? 'active'
        : sub.status === 'past_due' || sub.status === 'unpaid' || sub.status === 'paused' || sub.status === 'incomplete' ? 'past_due'
        : 'canceled'
      synchronizedIds.push(sub.id)
      // A query-only handle, never the checked-out client itself: upsertSubscription
      // treats anything with .connect() as a pool, and a pg pool client has one — so
      // it called connect() on an already-connected client, pg refused, and every
      // Stripe sync for a real subscriber threw. The transaction and lock are ours.
      await billing.upsertSubscription({ query: (...args) => client.query(...args) }, {
        accountId,
        provider: 'stripe',
        externalId: sub.id,
        productId: priceId,
        plan,
        status,
        currentPeriodEnd: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        billingAnchorAt: (sub.billing_cycle_anchor || sub.start_date || sub.current_period_start)
          ? new Date((sub.billing_cycle_anchor || sub.start_date || sub.current_period_start) * 1000).toISOString()
          : null,
        providerEventAt: observedAt,
        providerEventRank: status === 'canceled' ? 100 : status === 'past_due' ? 50 : 10,
        environment: sub.livemode === false ? 'sandbox' : 'production',
        // When this period began, so the sweep can keep asking about a renewal whose
        // charge Stripe had not yet attempted when the new period was written down.
        metadata: {
          customerId,
          currentPeriodStart: sub.current_period_start
            ? new Date(sub.current_period_start * 1000).toISOString()
            : null,
        },
      })
    }
    if (synchronizedIds.length) {
      await client.query(
        `DELETE FROM billing_subscription
          WHERE account_id = $1 AND provider = 'stripe'
            AND NOT (external_id = ANY($2::text[]))
            AND (provider_event_at IS NULL OR provider_event_at < $3)`,
        [accountId, synchronizedIds, observedAt],
      )
    } else {
      await client.query(
        `DELETE FROM billing_subscription
          WHERE account_id = $1 AND provider = 'stripe'
            AND (provider_event_at IS NULL OR provider_event_at < $2)`,
        [accountId, observedAt],
      )
    }
    await client.query(
      `UPDATE account SET stripe_subscription_id = $2 WHERE id = $1`,
      [accountId, preferred?.id || null],
    )
    const entitlement = await billing.reconcileAccountEntitlement(client, accountId)
    if (transactionOpen) {
      await client.query('COMMIT')
      transactionOpen = false
    }
    return entitlement
  } catch (error) {
    if (error !== deletionSignal) {
      if (transactionOpen) await client.query('ROLLBACK').catch(() => {})
      throw error
    }
  } finally {
    if (ownsClient) client.release()
  }

  // A checkout can finish while deletion is being confirmed. Never recreate a
  // local entitlement for a deleting account and leave the external charge
  // alive: close every open Stripe subscription returned by the source ledger.
  for (const subscription of subscriptions.filter((item) => OPEN_SUBSCRIPTION_STATUSES.has(item.status))) {
    await stripeClient.subscriptions.cancel(subscription.id)
  }
  return { plan: 'free', status: 'none' }
}

/**
 * The webhook, mounted SEPARATELY and FIRST.
 *
 * Stripe signs raw bytes. If express.json() has already run, this route receives
 * a parsed object and constructEvent() rejects it — which is exactly what was
 * happening: every event 400'd, so a successful payment never reached the
 * database and a failed card never stopped anyone's allowance. It lives in its
 * own function purely so index.js can mount it above the parser.
 */
function mountWebhook(app, db) {
  app.post('/v1/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    let event
    try {
      event = stripe.webhooks.constructEvent(
        req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)
    } catch (e) {
      // An unverified event is not an event. Never act on one.
      return res.status(400).send(`signature check failed: ${e.message}`)
    }

    try {
      await handleWebhookEvent(db, event)
      res.json({ received: true })
    } catch (e) {
      console.error('[stripe] event handling failed for', event.type, e.message)
      res.status(500).json({ error: 'WEBHOOK_PROCESSING_FAILED' })
    }
  })
}

async function handleWebhookEvent(db, event, stripeClient = stripe) {
  const eventObject = event.data.object
  const customerId =
    eventObject.customer ||
    (eventObject.object === 'customer' ? eventObject.id : null)

  if (customerId) await syncCustomer(db, customerId, stripeClient)
  if (
    ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) &&
    eventObject.mode === 'payment' &&
    eventObject.metadata?.source === SOM_SOURCE
  ) {
    const purchase = await recordSomPurchase(db, eventObject)
    await syncSomBuyerMarketing(db, purchase, eventObject)
  }
  if (
    ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) &&
    eventObject.mode === 'payment' &&
    eventObject.payment_status === 'paid' &&
    eventObject.metadata?.source === TOPUP_SOURCE
  ) {
    await creditTopUp(db, eventObject)
  }
  if (event.type === 'charge.refunded') {
    await markSomPurchaseRefunded(db, eventObject)
    await revokeOperatorTopUpRefund(db, eventObject, {
      eventId: event.id,
      eventCreated: event.created,
      stripeClient,
    })
  }
  if (DISPUTE_EVENTS.has(event.type)) await handleChargeDispute(db, event, stripeClient)
}

/**
 * Add top-up studies to an account, exactly once.
 *
 * Stripe delivers events more than once, so the session id is the idempotency
 * key: the insert is what grants the credit, and a duplicate event loses the
 * race to the primary key and grants nothing.
 */
async function creditTopUp(db, session) {
  if (session.metadata?.source !== TOPUP_SOURCE) return false
  if (!session.payment_intent) {
    throw new Error(`Operator top-up is missing a PaymentIntent for Checkout Session ${session.id}`)
  }
  const client = typeof db.connect === 'function' ? await db.connect() : db
  const ownsClient = client !== db
  let transactionOpen = false
  try {
    await client.query('BEGIN')
    transactionOpen = true
    const inserted = await client.query(
      `INSERT INTO topup
         (session_id, stripe_customer_id, studies, payment_intent_id, amount_total, currency)
            VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id) DO NOTHING`,
      [session.id, session.customer, TOPUP.studies, session.payment_intent,
        session.amount_total, session.currency],
    )
    if (!inserted.rowCount) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return false
    }
    const credited = await client.query(
      `UPDATE account SET topup_studies = topup_studies + $2 WHERE stripe_customer_id = $1`,
      [session.customer, TOPUP.studies],
    )
    if (credited.rowCount !== 1) {
      throw new Error(`Operator top-up account match failed for Checkout Session ${session.id}`)
    }
    await client.query('COMMIT')
    transactionOpen = false
    console.log(`[stripe] credited ${TOPUP.studies} top-up studies to ${session.customer}`)
    return true
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    if (ownsClient) client.release()
  }
}

/**
 * Was this refunded or disputed Charge an Operator top-up?
 *
 * EVERY charge.refunded on the Stripe account reaches the webhook — subscription
 * invoices, the SOM ebook, and anything else sold through the same account — and
 * the top-up path used to treat each unmatched one as a top-up whose grant had not
 * landed yet. It threw, the webhook answered 500, and Stripe redelivered the same
 * event for a day: one ordinary refund became a day of failures on a live
 * endpoint, and an endpoint that keeps failing is one Stripe disables, which
 * silently stops subscription sync for every customer. Only a charge that really
 * is a top-up may hold its event open for retry or raise a reconciliation alarm.
 *
 * Cheapest evidence first; Stripe, the ledger, has the last word.
 */
async function chargeIsOperatorTopUp(client, charge, stripeClient = stripe, options = {}) {
  const source = charge?.metadata?.source
  if (source) return source === TOPUP_SOURCE
  // /v1/topup is a one-off Checkout payment and creates no invoice.
  if (charge?.invoice) return false
  const paymentIntentId = objectId(charge?.payment_intent)
  if (!paymentIntentId) return false
  const som = await client.query(
    `SELECT 1 FROM som_purchase WHERE payment_intent_id = $1 LIMIT 1`,
    [paymentIntentId],
  )
  if (som.rows.length) return false
  let sessions
  try {
    sessions = await stripeClient.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 })
  } catch (error) {
    // A key that may not read Checkout Sessions never will, and retrying fails the
    // endpoint for days. Leave the charge for a person and acknowledge it.
    if (error?.type !== 'StripePermissionError') throw error
    await recordReconciliationFailure(client, options.eventId, paymentIntentId,
      `${options.kind || 'refund'}-classify-not-permitted`)
    console.error('[stripe] this key may not read the Checkout Session for', paymentIntentId)
    return false
  }
  return (sessions?.data || []).some((session) => session?.metadata?.source === TOPUP_SOURCE)
}

async function recordReconciliationFailure(client, eventId, paymentIntentId, reason) {
  await client.query(
    `INSERT INTO topup_reconciliation_failure
       (stripe_event_id, payment_intent_id, reason, first_seen_at, last_seen_at, attempt_count)
     VALUES ($1, $2, $3, now(), now(), 1)
     ON CONFLICT (stripe_event_id) DO UPDATE
       SET last_seen_at = now(), attempt_count = topup_reconciliation_failure.attempt_count + 1`,
    [eventId || `unidentified:${paymentIntentId}`, paymentIntentId, reason],
  )
}

async function revokeOperatorTopUpRefund(db, charge, options = {}) {
  if (charge?.refunded !== true || !charge.payment_intent) return false
  return reverseOperatorTopUp(db, charge, { ...options, kind: 'refund' })
}

/**
 * Take back the unspent studies a reversed top-up granted, exactly once.
 * Shared by full refunds and chargebacks; `kind` only labels the ledger.
 */
async function reverseOperatorTopUp(db, charge, options = {}) {
  const kind = options.kind === 'dispute' ? 'dispute' : 'refund'
  const paymentIntentId = objectId(charge?.payment_intent)
  if (!paymentIntentId) return false
  const eventCreatedMs = Number(options.eventCreated) * 1000
  const nowMs = Number(options.nowMs ?? Date.now())
  const insideRetryWindow = Number.isFinite(eventCreatedMs) && nowMs - eventCreatedMs < TOPUP_REFUND_RETRY_MS
  const client = typeof db.connect === 'function' ? await db.connect() : db
  const ownsClient = client !== db
  let transactionOpen = false
  try {
    await client.query('BEGIN')
    transactionOpen = true
    const linked = await client.query(
      `SELECT session_id, stripe_customer_id, studies, studies_revoked, refunded_at
         FROM topup WHERE payment_intent_id = $1 FOR UPDATE`,
      [paymentIntentId],
    )
    const topup = linked.rows[0]
    if (!topup) {
      // Nothing is locked yet, so find out what this charge was before holding
      // anything open — most reversals that reach here were never top-ups.
      await client.query('ROLLBACK')
      transactionOpen = false
      if (!(await chargeIsOperatorTopUp(client, charge, options.stripeClient || stripe, { eventId: options.eventId, kind }))) return false
      if (insideRetryWindow) {
        throw new Error(`Operator top-up ${kind} is waiting for PaymentIntent ${paymentIntentId}`)
      }
      await recordReconciliationFailure(client, options.eventId, paymentIntentId,
        kind === 'refund' ? 'unmatched-full-refund' : 'unmatched-dispute')
      console.error(`[stripe] operator top-up ${kind} requires reconciliation`, paymentIntentId)
      return false
    }
    if (topup.refunded_at) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return false
    }
    const remainingGrant = Math.max(0, Number(topup.studies) - Number(topup.studies_revoked || 0))
    const accountResult = await client.query(
      `SELECT id, topup_studies FROM account WHERE stripe_customer_id = $1 FOR UPDATE`,
      [topup.stripe_customer_id],
    )
    const account = accountResult.rows[0]
    if (!account) {
      // Deleting an account leaves its topup rows behind. With no balance left to
      // revoke, a retry can never succeed — throwing here only made Stripe
      // redeliver for three days and then drop the event with no record anywhere.
      // Close the grant and leave the alarm row instead.
      await client.query(`UPDATE topup SET refunded_at = now() WHERE session_id = $1`, [topup.session_id])
      await recordReconciliationFailure(client, options.eventId, paymentIntentId, `${kind}-account-deleted`)
      await client.query('COMMIT')
      transactionOpen = false
      console.error(`[stripe] operator top-up ${kind} found no account`, topup.session_id)
      return false
    }
    const revoked = Math.min(remainingGrant, Math.max(0, Number(account.topup_studies)))
    const debited = await client.query(
      `UPDATE account SET topup_studies = topup_studies - $2 WHERE id = $1`,
      [account.id, revoked],
    )
    if (debited.rowCount !== 1) throw new Error(`Operator top-up refund debit failed for ${topup.session_id}`)
    const recorded = await client.query(
      `UPDATE topup
          SET studies_revoked = studies_revoked + $2, refunded_at = now()
        WHERE session_id = $1`,
      [topup.session_id, revoked],
    )
    if (recorded.rowCount !== 1) throw new Error(`Operator top-up refund ledger update failed for ${topup.session_id}`)
    await client.query('COMMIT')
    transactionOpen = false
    console.log(`[stripe] revoked ${revoked} top-up studies for ${topup.session_id}`)
    return true
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    if (ownsClient) client.release()
  }
}

/**
 * A chargeback takes the money back without ever emitting charge.refunded.
 *
 * Stripe withdraws the amount plus a dispute fee the moment a dispute opens, and
 * it never cancels a subscription on its own. With no handler, a disputer kept
 * the top-up studies, the ebook download, and a live subscription that went on
 * billing them — and every further charge to a customer who has already disputed
 * invites another dispute, which is how a Stripe account gets closed.
 *
 * An inquiry (warning_*) moves no money and is left alone. Every step is
 * idempotent, and the dispute's status is read from Stripe rather than the event,
 * so created, funds_withdrawn and a close can arrive in any order, or be resent. A dispute the seller WINS restores the ebook; revoked studies and
 * a canceled subscription are not revived automatically — the win is written to
 * the reconciliation ledger for a person to decide.
 */
/**
 * A Stripe read this key is not permitted to make will never succeed. Throwing
 * answered 500 on every delivery for three days and acted on nothing, so record the
 * dispute for a person (GET /v1/admin/billing-reconciliation) and acknowledge.
 * Anything else still throws so Stripe retries.
 */
async function readForDispute(db, event, payload, read) {
  try {
    return await read()
  } catch (error) {
    if (error?.type !== 'StripePermissionError') throw error
    await recordReconciliationFailure(db, event.id,
      objectId(payload?.payment_intent) || objectId(payload?.charge) || payload?.id, 'dispute-read-not-permitted')
    console.error('[stripe] this key may not read what dispute', payload?.id, 'needs')
    return null
  }
}

async function handleChargeDispute(db, event, stripeClient = stripe, options = {}) {
  const payload = event?.data?.object
  const payloadStatus = String(payload?.status || '')
  if (payloadStatus.startsWith('warning_')) return 'inquiry'
  if (event.type === 'charge.dispute.closed' && !['won', 'lost'].includes(payloadStatus)) return 'closed'
  if (!payload?.id) throw new Error(`Stripe dispute event ${event.id} names no dispute`)
  // An event's status is only what it was when the event was created. Stripe does
  // not deliver in order and an owner can resend an old event, so a late "opened"
  // event must never close the ebook again or cancel a subscription for a customer
  // whose dispute was already won. Stripe says where the dispute stands now.
  const dispute = await readForDispute(db, event, payload, () => stripeClient.disputes.retrieve(payload.id))
  if (!dispute) return 'unreadable'
  const status = String(dispute?.status || '')
  if (status.startsWith('warning_')) return 'inquiry'
  if (!['won', 'lost', 'needs_response', 'under_review'].includes(status)) return 'closed'
  const chargeId = objectId(dispute?.charge) || objectId(payload?.charge)
  if (!chargeId) throw new Error(`Stripe dispute ${payload.id} names no Charge`)
  // Retrieved, not trusted from the payload: this client's pinned API version is
  // what guarantees the Charge still carries the invoice of a subscription payment.
  const charge = await readForDispute(db, event, payload, () => stripeClient.charges.retrieve(chargeId))
  if (!charge) return 'unreadable'
  const paymentIntentId = objectId(charge?.payment_intent) || objectId(dispute?.payment_intent) ||
    objectId(payload?.payment_intent)

  if (status === 'won') {
    await restoreSomPurchaseAfterWonDispute(db, paymentIntentId)
    const reversed = paymentIntentId
      ? await db.query(
          `SELECT 1 FROM topup WHERE payment_intent_id = $1 AND refunded_at IS NOT NULL LIMIT 1`,
          [paymentIntentId],
        )
      : { rows: [] }
    if (reversed.rows.length || charge?.invoice) {
      await recordReconciliationFailure(db, event.id, paymentIntentId || chargeId, 'dispute-won-review')
    }
    return 'won'
  }

  if (paymentIntentId) {
    await markSomPurchaseDisputed(db, paymentIntentId)
    await reverseOperatorTopUp(db, { ...charge, payment_intent: paymentIntentId }, {
      kind: 'dispute',
      eventId: event.id,
      eventCreated: event.created,
      stripeClient,
    })
  }
  await cancelDisputedSubscription(db, charge, event, stripeClient, options)
  return 'reversed'
}

async function cancelDisputedSubscription(db, charge, event, stripeClient = stripe, options = {}) {
  const invoiceId = objectId(charge?.invoice)
  if (!invoiceId) return false
  try {
    const invoice = await stripeClient.invoices.retrieve(invoiceId)
    const subscriptionId = objectId(invoice?.subscription)
    if (!subscriptionId) return false
    const subscription = await stripeClient.subscriptions.retrieve(subscriptionId)
    // Only an Operator plan is this server's to cancel; the same Stripe account
    // can sell other things.
    if (!PRICE_TO_PLAN[subscription?.items?.data?.[0]?.price?.id]) return false
    if (OPEN_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      await stripeClient.subscriptions.cancel(subscriptionId)
      console.log(`[stripe] canceled disputed subscription ${subscriptionId}`)
    }
  } catch (error) {
    // A key that may not cancel never will. Retrying would only fail the endpoint
    // again, so leave it for a person and acknowledge the event.
    if (error?.type !== 'StripePermissionError') throw error
    await recordReconciliationFailure(db, event.id, objectId(charge?.payment_intent) || charge?.id,
      'dispute-cancel-not-permitted')
    console.error('[stripe] disputed subscription could not be canceled with this key', invoiceId)
    return false
  }
  const customerId = objectId(charge?.customer)
  if (customerId) await (options.syncCustomer || syncCustomer)(db, customerId, stripeClient)
  return true
}

/**
 * Ask Stripe about every web subscriber whose renewal the webhook never reported.
 *
 * The native apps re-verify their store purchase when they open. A web subscriber
 * had nothing: if the renewal webhook was late, failing, or disabled, his row kept
 * the old period and he dropped to free on renewal day while Stripe went on
 * charging him. This re-reads Stripe, the ledger, for two kinds of row:
 *  - still recorded active past its period end, for up to a week, well inside
 *    entitlement.js's RENEWAL_GRACE_MS so an outage heals before a lockout; and
 *  - whose period began in the last four days, at most hourly. Stripe advances the
 *    period before it attempts the renewal charge, so a row can be written active
 *    for another month and then have that charge fail with no webhook to say so.
 * One failing customer never stops the rest.
 */
async function resyncLapsedStripeSubscriptions(db, stripeClient = stripe, options = {}) {
  const { rows } = await db.query(
    `SELECT DISTINCT a.stripe_customer_id
       FROM billing_subscription s
       JOIN account a ON a.id = s.account_id
      WHERE s.provider = 'stripe'
        AND s.status = 'active'
        AND a.stripe_customer_id IS NOT NULL
        AND (
          (s.current_period_end <= now() AND s.current_period_end > now() - interval '7 days')
          OR (
            (s.metadata->>'currentPeriodStart')::timestamptz > now() - interval '4 days'
            AND s.verified_at < now() - interval '1 hour'
          )
        )
      LIMIT $1`,
    [options.limit || 50],
  )
  let resynced = 0
  for (const { stripe_customer_id: customerId } of rows) {
    try {
      await (options.syncCustomer || syncCustomer)(db, customerId, stripeClient)
      resynced += 1
    } catch (error) {
      console.error('[stripe] lapsed subscription re-read failed for', customerId, error?.message || error)
    }
  }
  return resynced
}

async function cancelAccountSubscriptions(db, accountId, stripeClient = stripe) {
  const { rows } = await db.query(
    `SELECT stripe_customer_id FROM account WHERE id = $1`,
    [accountId],
  )
  const customerId = rows[0]?.stripe_customer_id
  if (!customerId) return { canceled: 0, expiredCheckouts: 0 }
  let expiredCheckouts = 0
  if (stripeClient.checkout?.sessions?.list && stripeClient.checkout?.sessions?.expire) {
    const sessions = await stripeClient.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 })
    for (const session of sessions.data) {
      try {
        await stripeClient.checkout.sessions.expire(session.id)
        expiredCheckouts += 1
      } catch (error) {
        if (error?.code !== 'checkout_session_not_expirable') throw error
      }
    }
  }
  const subscriptions = await listAllSubscriptions(stripeClient, customerId)
  const open = subscriptions.filter((subscription) => OPEN_SUBSCRIPTION_STATUSES.has(subscription.status))
  for (const subscription of open) await stripeClient.subscriptions.cancel(subscription.id)
  return { canceled: open.length, expiredCheckouts }
}

function priceIdFor(plan) {
  return planPriceIds()[plan]
}

function operatorWebUrl() {
  const configured = String(
    process.env.OPERATOR_WEB_PUBLIC_URL ||
    process.env.PUBLIC_URL ||
    'https://www.base1520.com/operator',
  ).trim()
  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw new Error('unsafe URL')
    return url.toString().replace(/\/$/, '')
  } catch {
    return 'https://www.base1520.com/operator'
  }
}

function mount(app, db, stripeClient = stripe) {
  const webUrl = operatorWebUrl()
  mountWebPurchase(app, db, stripeClient, syncCustomer, {
    apiOrigin: process.env.OPERATOR_API_PUBLIC_URL,
    prices: planPriceIds(),
  })
  mountSomPurchase(app, db, stripeClient, {
    apiOrigin: process.env.OPERATOR_API_PUBLIC_URL,
    priceId: process.env.STRIPE_PRICE_SOM_DIGITAL,
    cancelUrl: process.env.SOM_SALES_URL,
  })

  // ── Start a subscription ──────────────────────────────────────────────────
  app.post('/v1/checkout', route(async (req, res) => {
    const { plan, email } = req.body || {}
    if (!PAID_PLAN_KEYS.includes(plan)) return res.status(400).json({ error: 'unknown plan' })

    const priceId = priceIdFor(plan)
    if (!priceId) return res.status(500).json({ error: 'plan not configured' })

    // A store subscriber buying again here would be billed by two providers for one plan.
    const storeSubscription = await openStoreSubscription(db, req.identity.account?.id)
    if (storeSubscription) {
      return res.status(409).json({
        error: 'SUBSCRIBED_IN_STORE',
        provider: storeSubscription.provider,
        status: storeSubscription.status,
        message: storeConflictMessage(storeSubscription),
      })
    }

    // Reuse the account's customer if it has one, so a second subscription can
    // never be created alongside the first.
    let customerId = req.identity.account?.stripeCustomerId

    // Reuse the customer this install already has, even when it holds no device
    // token yet. Without this, a second click on Subscribe created a second
    // Stripe customer — two live subscriptions for one man, and a claim lookup
    // that could no longer find the one he paid for.
    if (!customerId && req.identity.installId) {
      const { rows: prior } = await db.query(
        `SELECT stripe_customer_id FROM account
          WHERE install_id = $1 AND stripe_customer_id IS NOT NULL
          ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1`,
        [req.identity.installId],
      )
      customerId = prior[0]?.stripe_customer_id ?? null
    }

    if (!customerId) {
      const customer = await stripeClient.customers.create({
        email: email || req.identity.account?.email || undefined,
        metadata: { installId: req.identity.installId || '' },
      })
      customerId = customer.id
      // DO NOTHING ON CONFLICT. This used to be
      //   ON CONFLICT (email) DO UPDATE SET stripe_customer_id = EXCLUDED...
      // which let anyone who merely TYPED someone else's address repoint that
      // account at a Stripe customer they controlled — before paying a cent —
      // severing the victim from their real subscription and their billing
      // portal. An email a stranger typed is not proof of anything.
      //
      // install_id is what binds this payment back to the app that started it;
      // /v1/claim below is how that install collects its device token.
      await db.query(
        `INSERT INTO account (email, stripe_customer_id, install_id)
              VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING`,
        [email || `${customerId}@placeholder.invalid`, customerId, req.identity.installId || null],
      )
    }

    /**
     * A MAN WHO ALREADY SUBSCRIBES MUST NOT BE SOLD A SECOND SUBSCRIPTION.
     *
     * Round 2 stopped a duplicate CUSTOMER being created. It did not stop a
     * duplicate SUBSCRIPTION on that customer, which is the thing that actually
     * bills — and Stripe Checkout in subscription mode does not deduplicate. So
     * the "Move up" button on the out-of-studies paywall added a $50/mo
     * subscription ALONGSIDE the live $30/mo one. He pays $80/mo, syncCustomer
     * reads subscriptions.list({limit:1}) and writes down exactly one, so
     * nothing in the app or the database ever shows the duplicate. He finds it
     * on a card statement.
     *
     * The same click happens on the retry path: after a claim poll times out,
     * the plan buttons are still live and still say he is not paying.
     *
     * A plan CHANGE belongs in Stripe's own portal, which handles proration and
     * cannot produce two subscriptions.
     */
    const existing = await stripeClient.subscriptions.list({
      customer: customerId, status: 'all', limit: 100,
    })
    if (existing.data.some((subscription) => OPEN_SUBSCRIPTION_STATUSES.has(subscription.status))) {
      const portal = await stripeClient.billingPortal.sessions.create({
        customer: customerId,
        return_url: webUrl,
      })
      return res.json({ url: portal.url, changedPlan: true })
    }

    const session = await stripeClient.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${webUrl}?checkout=success&session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webUrl}?checkout=cancelled`,
      // Stripe's own recommendation, and the thing that stops one impatient
      // person opening two tabs and buying twice.
      allow_promotion_codes: true,
    })
    res.json({ url: session.url })
  }))

  // ── Buy more studies, deliberately, never automatically ───────────────────
  app.post('/v1/topup', route(async (req, res) => {
    const customerId = req.identity.account?.stripeCustomerId
    if (!customerId) return res.status(401).json({ error: 'sign in first' })
    if (!process.env.STRIPE_PRICE_TOPUP) return res.status(500).json({ error: 'top-up not configured' })

    const session = await stripeClient.checkout.sessions.create({
      mode: 'payment',                       // one-off. No stored intent, no surprise charge.
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_TOPUP, quantity: 1 }],
      success_url: `${webUrl}?topup=success`,
      cancel_url: webUrl,
      metadata: { source: TOPUP_SOURCE },
      // Marked on the PaymentIntent as well as the Session, so a refund or dispute
      // can name what the charge bought without a lookup.
      payment_intent_data: { metadata: { source: TOPUP_SOURCE } },
    })
    res.json({ url: session.url, studies: TOPUP.studies, priceUsd: TOPUP.priceUsd })
  }))

  // ── Manage or cancel — Stripe hosts it, so we never build a billing UI ────
  app.post('/v1/portal', route(async (req, res) => {
    const customerId = req.identity.account?.stripeCustomerId
    if (!customerId) return res.status(401).json({ error: 'sign in first' })
    const session = await stripeClient.billingPortal.sessions.create({
      customer: customerId,
      return_url: webUrl,
    })
    res.json({ url: session.url })
  }))

  /**
   * Collect the subscription this install just paid for.
   *
   * THE FLOW HAD NO END. Checkout opened in a browser, the money moved, and the
   * app was never told — issueDeviceToken() had no caller anywhere in the
   * codebase. A man paid $30, came back, and every request was still anonymous
   * and still hit the free-tier wall. This is the missing step.
   *
   * The install id is the binding: /v1/checkout wrote it onto the account it
   * created, so only the app that started the checkout can collect the token.
   * The token is returned ONCE and only its hash is stored.
   */
  app.post('/v1/claim', route(async (req, res) => {
    const installId = req.identity.installId
    if (!installId) return res.status(400).json({ error: 'x-install-id header required' })

    /**
     * THE PAID ROW WINS, NOT THE NEWEST ONE.
     *
     * ORDER BY created_at DESC permanently orphaned real money: a buyer whose
     * first claim timed out clicked subscribe again, /v1/checkout minted a
     * SECOND customer and a second account against the same install, and this
     * query then resolved to the new empty one — so syncCustomer found no
     * subscription and returned 409 forever while the paid subscription sat
     * there unreachable. Every retry appended another empty row, so it could
     * never self-heal.
     */
    const { rows } = await db.query(
      `SELECT id, email, stripe_customer_id, plan, status
         FROM account WHERE install_id = $1
        ORDER BY (status = 'active') DESC,
                 (stripe_subscription_id IS NOT NULL) DESC,
                 created_at DESC
        LIMIT 1`,
      [installId],
    )
    const account = rows[0]
    if (!account) return res.status(404).json({ error: 'NO_ACCOUNT', message: 'No purchase found for this install yet.' })

    // Re-read Stripe rather than trusting our cache — the webhook may not have
    // landed yet, and this is the moment the user is staring at the screen.
    let state = { plan: account.plan, status: account.status }
    try { state = await syncCustomer(db, account.stripe_customer_id, stripeClient) } catch { /* fall back to cache */ }

    if (state.status !== 'active') {
      return res.status(409).json({ error: 'NOT_ACTIVE', status: state.status,
        message: 'The subscription is not active yet. Try again in a moment.' })
    }

    // Destructured — see the note in index.js /v1/redeem. Returning the whole
    // { token, deviceId } object here would hand a paying subscriber a token the
    // client cannot send.
    const { token } = await auth.issueDeviceToken(db, {
      accountId: account.id, installId, label: 'The Operator',
    })
    res.json({ token, email: account.email, ...state })
  }))

  // ── What the webhook could not settle on its own ──────────────────────────
  // Unmatched refunds, refunds for deleted accounts, and dispute outcomes that need
  // a person are written to topup_reconciliation_failure — and nothing read them.
  app.get('/v1/admin/billing-reconciliation', route(async (req, res) => {
    if (!req.identity?.account?.isAdmin) return res.status(403).json({ error: 'FORBIDDEN' })
    const { rows } = await db.query(
      `SELECT stripe_event_id, payment_intent_id, reason, first_seen_at, last_seen_at, attempt_count
         FROM topup_reconciliation_failure
        WHERE last_seen_at > now() - interval '90 days'
        ORDER BY last_seen_at DESC
        LIMIT 200`,
    )
    res.json({ rows })
  }))

  // Called when the browser comes back from checkout, so entitlement is correct
  // immediately rather than whenever the webhook lands. Same function, so the
  // two can never disagree.
  app.get('/v1/checkout/confirm', route(async (req, res) => {
    const { session_id } = req.query
    if (!session_id) return res.status(400).json({ error: 'session_id required' })
    const session = await stripeClient.checkout.sessions.retrieve(String(session_id))
    const state = await syncCustomer(db, String(session.customer), stripeClient)
    res.json({ ok: true, ...state })
  }))
}

module.exports = {
  mount,
  mountWebhook,
  handleWebhookEvent,
  mountWebPurchase,
  syncCustomer,
  creditTopUp,
  revokeOperatorTopUpRefund,
  reverseOperatorTopUp,
  chargeIsOperatorTopUp,
  handleChargeDispute,
  resyncLapsedStripeSubscriptions,
  recordSomPurchase,
  markSomPurchaseRefunded,
  cancelAccountSubscriptions,
  operatorWebUrl,
  preferredSubscription,
  OPEN_SUBSCRIPTION_STATUSES,
  PRICE_TO_PLAN,
}
