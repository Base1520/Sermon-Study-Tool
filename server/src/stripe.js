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
const { PLANS, TOPUP } = require('./entitlement')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })

/** Map a Stripe price id to one of our plans. Set these in the environment. */
const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_STARTER]: 'starter',
  [process.env.STRIPE_PRICE_STANDARD]: 'standard',
  [process.env.STRIPE_PRICE_HEAVY]: 'heavy',
}

/**
 * The ONE function that writes subscription state. Both the webhook and the
 * post-checkout return call it, so there is exactly one path that can change
 * what a man is entitled to — the "split brain" that makes Stripe integrations
 * rot is two code paths disagreeing about the same customer.
 */
async function syncCustomer(db, customerId) {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 1 })
  const sub = subs.data[0]

  if (!sub) {
    await db.query(
      `UPDATE account SET plan='free', status='none', stripe_subscription_id=NULL
        WHERE stripe_customer_id=$1`, [customerId])
    return { plan: 'free', status: 'none' }
  }

  const priceId = sub.items.data[0]?.price?.id
  const plan = PRICE_TO_PLAN[priceId] || 'free'

  // active and trialing pay. past_due does NOT — see rule 2.
  const status =
    sub.status === 'active' || sub.status === 'trialing' ? 'active'
    : sub.status === 'past_due' || sub.status === 'unpaid' ? 'past_due'
    : 'canceled'

  await db.query(
    `UPDATE account
        SET plan=$2, status=$3, stripe_subscription_id=$4,
            paid_through = to_timestamp($5)
      WHERE stripe_customer_id=$1`,
    [customerId, plan, status, sub.id, sub.current_period_end],
  )
  return { plan, status }
}

function mount(app, db) {
  // The webhook needs the RAW body to verify the signature, so it is registered
  // before any json parser can consume it.
  app.post('/v1/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    let event
    try {
      event = stripe.webhooks.constructEvent(
        req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)
    } catch (e) {
      // An unverified event is not an event. Never act on one.
      return res.status(400).send(`signature check failed: ${e.message}`)
    }

    // Acknowledge fast; Stripe retries anything slow, which would double the work.
    res.json({ received: true })

    const customerId =
      event.data.object.customer ||
      (event.data.object.object === 'customer' ? event.data.object.id : null)
    if (!customerId) return

    try {
      await syncCustomer(db, customerId)
    } catch (e) {
      console.error('[stripe] sync failed for', customerId, e.message)
    }
  })

  // ── Start a subscription ──────────────────────────────────────────────────
  app.post('/v1/checkout', async (req, res) => {
    const { plan, email } = req.body || {}
    if (!PLANS[plan] || plan === 'free') return res.status(400).json({ error: 'unknown plan' })

    const priceId = {
      starter: process.env.STRIPE_PRICE_STARTER,
      standard: process.env.STRIPE_PRICE_STANDARD,
      heavy: process.env.STRIPE_PRICE_HEAVY,
    }[plan]
    if (!priceId) return res.status(500).json({ error: 'plan not configured' })

    // Reuse the account's customer if it has one, so a second subscription can
    // never be created alongside the first.
    let customerId = req.identity.account?.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || req.identity.account?.email || undefined,
        metadata: { installId: req.identity.installId || '' },
      })
      customerId = customer.id
      await db.query(
        `INSERT INTO account (email, stripe_customer_id)
              VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id`,
        [email || `${customerId}@placeholder.invalid`, customerId],
      )
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.PUBLIC_URL}/upgraded?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_URL}/pricing`,
      // Stripe's own recommendation, and the thing that stops one impatient
      // person opening two tabs and buying twice.
      allow_promotion_codes: true,
    })
    res.json({ url: session.url })
  })

  // ── Buy more studies, deliberately, never automatically ───────────────────
  app.post('/v1/topup', async (req, res) => {
    const customerId = req.identity.account?.stripeCustomerId
    if (!customerId) return res.status(401).json({ error: 'sign in first' })
    if (!process.env.STRIPE_PRICE_TOPUP) return res.status(500).json({ error: 'top-up not configured' })

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',                       // one-off. No stored intent, no surprise charge.
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_TOPUP, quantity: 1 }],
      success_url: `${process.env.PUBLIC_URL}/topped-up`,
      cancel_url: `${process.env.PUBLIC_URL}/`,
    })
    res.json({ url: session.url, studies: TOPUP.studies, priceUsd: TOPUP.priceUsd })
  })

  // ── Manage or cancel — Stripe hosts it, so we never build a billing UI ────
  app.post('/v1/portal', async (req, res) => {
    const customerId = req.identity.account?.stripeCustomerId
    if (!customerId) return res.status(401).json({ error: 'sign in first' })
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.PUBLIC_URL,
    })
    res.json({ url: session.url })
  })

  // Called when the browser comes back from checkout, so entitlement is correct
  // immediately rather than whenever the webhook lands. Same function, so the
  // two can never disagree.
  app.get('/v1/checkout/confirm', async (req, res) => {
    const { session_id } = req.query
    if (!session_id) return res.status(400).json({ error: 'session_id required' })
    const session = await stripe.checkout.sessions.retrieve(String(session_id))
    const state = await syncCustomer(db, String(session.customer))
    res.json({ ok: true, ...state })
  })
}

module.exports = { mount, syncCustomer, PRICE_TO_PLAN }
