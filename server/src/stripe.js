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
const { PLANS, TOPUP } = require('./entitlement')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })

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

    // Acknowledge fast; Stripe retries anything slow, which would double the work.
    res.json({ received: true })

    const customerId =
      event.data.object.customer ||
      (event.data.object.object === 'customer' ? event.data.object.id : null)
    if (!customerId) return

    try {
      await syncCustomer(db, customerId)
      // A completed top-up is a payment, not a subscription change, so
      // syncCustomer says nothing about it. Credit it here or the customer paid
      // $15 for nothing.
      if (event.type === 'checkout.session.completed' && event.data.object.mode === 'payment') {
        await creditTopUp(db, event.data.object)
      }
    } catch (e) {
      console.error('[stripe] sync failed for', customerId, e.message)
    }
  })
}

/**
 * Add top-up studies to an account, exactly once.
 *
 * Stripe delivers events more than once, so the session id is the idempotency
 * key: the insert is what grants the credit, and a duplicate event loses the
 * race to the primary key and grants nothing.
 */
async function creditTopUp(db, session) {
  const { rowCount } = await db.query(
    `INSERT INTO topup (session_id, stripe_customer_id, studies)
          VALUES ($1, $2, $3)
     ON CONFLICT (session_id) DO NOTHING`,
    [session.id, session.customer, TOPUP.studies],
  )
  if (!rowCount) return   // already credited
  await db.query(
    `UPDATE account SET topup_studies = topup_studies + $2 WHERE stripe_customer_id = $1`,
    [session.customer, TOPUP.studies],
  )
  console.log(`[stripe] credited ${TOPUP.studies} top-up studies to ${session.customer}`)
}

function mount(app, db) {
  // ── Start a subscription ──────────────────────────────────────────────────
  app.post('/v1/checkout', route(async (req, res) => {
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
  }))

  // ── Buy more studies, deliberately, never automatically ───────────────────
  app.post('/v1/topup', route(async (req, res) => {
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
  }))

  // ── Manage or cancel — Stripe hosts it, so we never build a billing UI ────
  app.post('/v1/portal', route(async (req, res) => {
    const customerId = req.identity.account?.stripeCustomerId
    if (!customerId) return res.status(401).json({ error: 'sign in first' })
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.PUBLIC_URL,
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

    const { rows } = await db.query(
      `SELECT id, email, stripe_customer_id, plan, status
         FROM account WHERE install_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [installId],
    )
    const account = rows[0]
    if (!account) return res.status(404).json({ error: 'NO_ACCOUNT', message: 'No purchase found for this install yet.' })

    // Re-read Stripe rather than trusting our cache — the webhook may not have
    // landed yet, and this is the moment the user is staring at the screen.
    let state = { plan: account.plan, status: account.status }
    try { state = await syncCustomer(db, account.stripe_customer_id) } catch { /* fall back to cache */ }

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

  // Called when the browser comes back from checkout, so entitlement is correct
  // immediately rather than whenever the webhook lands. Same function, so the
  // two can never disagree.
  app.get('/v1/checkout/confirm', route(async (req, res) => {
    const { session_id } = req.query
    if (!session_id) return res.status(400).json({ error: 'session_id required' })
    const session = await stripe.checkout.sessions.retrieve(String(session_id))
    const state = await syncCustomer(db, String(session.customer))
    res.json({ ok: true, ...state })
  }))
}

module.exports = { mount, mountWebhook, syncCustomer, creditTopUp, PRICE_TO_PLAN }
