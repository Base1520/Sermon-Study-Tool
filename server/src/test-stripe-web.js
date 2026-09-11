process.env.STRIPE_SECRET_KEY ||= 'sk_test_placeholder'
process.env.STRIPE_PRICE_STARTER ||= 'price_starter'
process.env.STRIPE_PRICE_TOPUP ||= 'price_topup'

const {
  mountWebPurchase,
  preferredSubscription,
  OPEN_SUBSCRIPTION_STATUSES,
  storeConflictMessage,
} = require('./web-purchase')

const options = {
  prices: {
    starter: 'price_starter', standard: 'price_standard', heavy: 'price_heavy',
    starter_annual: 'price_starter_annual',
    standard_annual: 'price_standard_annual',
    heavy_annual: 'price_heavy_annual',
  },
}

let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => {
  if (condition) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

function captureApp() {
  const routes = new Map()
  return {
    routes,
    post(path, handler) { routes.set(`POST ${path}`, handler) },
    get(path, handler) { routes.set(`GET ${path}`, handler) },
  }
}

function captureResponse() {
  return {
    statusCode: 200, contentType: null, body: null, redirectTo: null, headers: {},
    status(code) { this.statusCode = code; return this },
    type(value) { this.contentType = value; return this },
    set(name, value) { this.headers[name.toLowerCase()] = value; return this },
    send(value) { this.body = value; return this },
    json(value) { this.body = value; return this },
    redirect(code, value) { this.statusCode = code; this.redirectTo = value; return this },
  }
}

function request({ body = {}, query = {}, identity = { anonymous: true }, host = 'api-production-15e5e.up.railway.app' } = {}) {
  return { body, query, identity, protocol: 'https', get(name) { return name === 'host' ? host : null } }
}

;(async () => {
  console.log('\nDOWNLOAD CAPTURE RELEASES ONLY A REAL OPERATOR INSTALLER')
  const downloadApp = captureApp()
  const captured = { params: null }
  const downloadRows = [{
    email: 'pastor@example.com', source: 'operator-website', last_platform: 'windows',
    marketing_opt_in: true, consent_version: 'operator-download-v1', download_count: 1,
  }]
  const downloadDb = {
    async query(sql, params) {
      if (/INSERT INTO download_lead/.test(sql)) { captured.params = params; return { rows: [] } }
      if (/FROM download_lead/.test(sql)) return { rows: downloadRows }
      throw new Error(`unhandled download SQL: ${sql.slice(0, 60)}`)
    },
  }
  mountWebPurchase(downloadApp, downloadDb, {}, async () => ({}), options)

  const downloadRes = captureResponse()
  await downloadApp.routes.get('POST /v1/download')(
    request({ body: {
      email: ' Pastor@Example.com ', platform: 'windows', marketing_opt_in: '1',
    } }),
    downloadRes,
    (error) => { throw error },
  )
  ok('a valid lead is redirected immediately',
    downloadRes.statusCode === 303 && /The-Operator-windows\.exe$/.test(downloadRes.redirectTo || ''))
  ok('the lead is normalized and consent is versioned',
    captured.params?.[0] === 'pastor@example.com' && captured.params?.[1] === 'windows' &&
      captured.params?.[2] === true && captured.params?.[3] === 'operator-download-v1')
  ok('the redirect is marked no-store', downloadRes.headers['cache-control'] === 'no-store')

  const injectedRes = captureResponse()
  await downloadApp.routes.get('POST /v1/download')(
    request({ body: { email: 'pastor@example.com', platform: 'https://evil.example/payload' } }),
    injectedRes,
    (error) => { throw error },
  )
  ok('an attacker cannot replace the installer URL', injectedRes.statusCode === 400 && !injectedRes.redirectTo)

  const privateFeed = captureResponse()
  await downloadApp.routes.get('GET /v1/download-leads')(
    request(), privateFeed, (error) => { throw error },
  )
  ok('the captured-email feed is not public', privateFeed.statusCode === 403)
  const adminFeed = captureResponse()
  await downloadApp.routes.get('GET /v1/download-leads')(
    request({ identity: { anonymous: false, account: { plan: 'comp', isAdmin: true } } }),
    adminFeed,
    (error) => { throw error },
  )
  ok('an explicit admin can retrieve captured leads', adminFeed.body?.leads?.[0]?.email === 'pastor@example.com')

  console.log('\nSUBSCRIPTION STATE CANNOT HIDE A LIVE PLAN')
  const chosen = preferredSubscription([
    { id: 'sub_new_canceled', status: 'canceled', created: 20 },
    { id: 'sub_old_active', status: 'active', created: 10 },
  ])
  ok('active wins over a newer canceled subscription', chosen.id === 'sub_old_active')
  ok('trialing blocks a second subscription', OPEN_SUBSCRIPTION_STATUSES.has('trialing'))
  ok('past due blocks a second subscription', OPEN_SUBSCRIPTION_STATUSES.has('past_due'))

  console.log('\nTHE WEBSITE CHECKOUT CREATES A RECOVERABLE PURCHASE')
  const app = captureApp()
  const state = { account: null, insertedHash: null, checkout: null }
  const db = {
    async query(sql, params) {
      if (/FROM account WHERE lower\(email\)/.test(sql)) return { rows: state.account ? [state.account] : [] }
      if (/INSERT INTO account/.test(sql)) {
        state.insertedHash = params[2]
        state.account = { id: 'acct-1', email: params[0], stripe_customer_id: params[1], status: 'none' }
        return { rows: [] }
      }
      if (/UPDATE account/.test(sql) && /RETURNING email/.test(sql)) {
        state.insertedHash = state.account.purchase_redeemed_install_id ? state.insertedHash : params[1]
        return { rows: [{
          email: state.account.email, plan: 'standard', status: 'active',
          purchase_code_hash: state.insertedHash,
          purchase_redeemed_install_id: state.account.purchase_redeemed_install_id || null,
        }] }
      }
      throw new Error(`unhandled test SQL: ${sql.slice(0, 60)}`)
    },
  }
  const stripe = {
    customers: { async create({ email }) { return { id: `cus_${email}` } } },
    subscriptions: { async list() { return { data: [] } } },
    checkout: { sessions: {
      async create(payload) { state.checkout = payload; return { url: 'https://checkout.stripe.test/session' } },
      async retrieve() {
        return {
          mode: 'subscription', customer: state.checkout.customer,
          client_reference_id: state.checkout.client_reference_id,
          metadata: { source: 'operator-website', plan: 'standard' },
        }
      },
    } },
  }
  mountWebPurchase(app, db, stripe, async () => ({ plan: 'standard', status: 'active' }), options)

  const startRes = captureResponse()
  await app.routes.get('POST /v1/web-checkout')(
    request({ body: { plan: 'standard', email: 'Pastor@Example.com' }, host: 'attacker.example' }),
    startRes,
    (error) => { throw error },
  )
  ok('checkout redirects to Stripe', startRes.statusCode === 303 && /checkout\.stripe/.test(startRes.redirectTo))
  ok('the exact Standard price is sent', state.checkout.line_items[0].price === 'price_standard')
  ok('the email is normalized before storage', state.account.email === 'pastor@example.com')
  ok('only a hash is stored locally', state.insertedHash?.length === 64 && !state.insertedHash.includes('BUY-'))
  ok('the return URL cannot be replaced through Host', /^https:\/\/api-production-15e5e\.up\.railway\.app\//.test(state.checkout.success_url))

  const completeRes = captureResponse()
  await app.routes.get('GET /purchase/complete')(
    request({ query: { session_id: 'cs_test_1' } }),
    completeRes,
    (error) => { throw error },
  )
  ok('the completed purchase returns the activation code', completeRes.statusCode === 200 && completeRes.body.includes(state.checkout.client_reference_id))
  ok('the completed page includes both download paths', /apple-silicon/.test(completeRes.body) && /windows\.exe/.test(completeRes.body))

  const paidFirstCode = state.checkout.client_reference_id
  state.insertedHash = 'later-unpaid-checkout-hash'
  const reopenedFirstRes = captureResponse()
  await app.routes.get('GET /purchase/complete')(
    request({ query: { session_id: 'cs_test_1' } }),
    reopenedFirstRes,
    (error) => { throw error },
  )
  ok('a paid session repairs a later abandoned checkout code', reopenedFirstRes.statusCode === 200 && reopenedFirstRes.body.includes(paidFirstCode))

  state.account.purchase_redeemed_install_id = 'install-a'
  state.insertedHash = 'already-redeemed-code-hash'
  const replayRes = captureResponse()
  await app.routes.get('GET /purchase/complete')(
    request({ query: { session_id: 'cs_test_1' } }),
    replayRes,
    (error) => { throw error },
  )
  ok('an old checkout cannot reset an activation already claimed elsewhere', replayRes.statusCode === 409)

  console.log('\nANNUAL CHECKOUT USES THE ANNUAL STRIPE PRICE')
  const annualApp = captureApp()
  let annualCheckout = null
  const annualDb = {
    async query(sql, params) {
      if (/FROM account WHERE lower\(email\)/.test(sql)) return { rows: [] }
      if (/INSERT INTO account/.test(sql)) return { rows: [] }
      throw new Error(`unhandled annual SQL: ${sql.slice(0, 60)}`)
    },
  }
  const annualStripe = {
    customers: { async create() { return { id: 'cus_annual' } } },
    subscriptions: { async list() { return { data: [] } } },
    checkout: { sessions: { async create(payload) {
      annualCheckout = payload
      return { url: 'https://checkout.stripe.test/annual' }
    } } },
  }
  mountWebPurchase(annualApp, annualDb, annualStripe, async () => ({}), options)
  const annualRes = captureResponse()
  await annualApp.routes.get('POST /v1/web-checkout')(
    request({ body: { plan: 'heavy_annual', email: 'annual@example.com' } }),
    annualRes,
    (error) => { throw error },
  )
  ok('Heavy annual selects only its yearly price',
    annualCheckout?.line_items?.[0]?.price === 'price_heavy_annual')
  ok('the annual plan key survives into Stripe metadata',
    annualCheckout?.metadata?.plan === 'heavy_annual' &&
      annualCheckout?.subscription_data?.metadata?.plan === 'heavy_annual')

  console.log('\nA SECOND SUBSCRIPTION IS REFUSED')
  const duplicateApp = captureApp()
  const duplicateDb = {
    async query(sql) {
      if (/FROM account WHERE lower\(email\)/.test(sql)) return { rows: [{ id: 'acct-2', stripe_customer_id: 'cus_paid', status: 'active' }] }
      if (/FROM billing_subscription/.test(sql)) return { rows: [] }
      throw new Error('the duplicate path must not write')
    },
  }
  let duplicateCheckoutCreated = false
  const duplicateStripe = {
    customers: { async create() { throw new Error('must reuse the customer') } },
    subscriptions: { async list() { return { data: [{ status: 'trialing' }] } } },
    checkout: { sessions: { async create() { duplicateCheckoutCreated = true } } },
  }
  mountWebPurchase(duplicateApp, duplicateDb, duplicateStripe, async () => ({ plan: 'starter', status: 'active' }), options)
  const duplicateRes = captureResponse()
  await duplicateApp.routes.get('POST /v1/web-checkout')(
    request({ body: { plan: 'starter', email: 'paid@example.com' } }),
    duplicateRes,
    (error) => { throw error },
  )
  ok('trialing returns conflict instead of charging twice', duplicateRes.statusCode === 409)
  ok('no second Checkout Session is created', !duplicateCheckoutCreated)

  console.log('\nA STORE SUBSCRIBER IS NOT SOLD A SECOND PLAN ON THE WEB')
  const storeApp = captureApp()
  const storeQueries = []
  const storeDb = {
    async query(sql, params) {
      storeQueries.push({ sql, params })
      if (/FROM account WHERE lower\(email\)/.test(sql)) return { rows: [{ id: 'acct-apple', stripe_customer_id: null, status: 'active' }] }
      if (/FROM billing_subscription/.test(sql)) return { rows: [{ provider: 'apple' }] }
      throw new Error('the store-subscriber path must not write')
    },
  }
  let storeCustomerCreated = false
  let storeCheckoutCreated = false
  const storeStripe = {
    customers: { async create() { storeCustomerCreated = true; return { id: 'cus_new' } } },
    subscriptions: { async list() { return { data: [] } } },
    checkout: { sessions: { async create() { storeCheckoutCreated = true } } },
  }
  mountWebPurchase(storeApp, storeDb, storeStripe, async () => ({}), options)
  const storeRes = captureResponse()
  await storeApp.routes.get('POST /v1/web-checkout')(
    request({ body: { plan: 'heavy', email: 'iphone@example.com' } }),
    storeRes,
    (error) => { throw error },
  )
  ok('an App Store subscriber gets a conflict instead of a second charge', storeRes.statusCode === 409)
  ok('...without revealing to a stranger which store bills that email', /already has a plan/.test(storeRes.body || '') && !/App Store|Google Play/.test(storeRes.body || ''))
  ok('...before any Stripe customer or Checkout Session exists', !storeCustomerCreated && !storeCheckoutCreated)
  const storeLookup = storeQueries.find(({ sql }) => /FROM billing_subscription/.test(sql))
  ok('the lookup is bound to that account and to store providers only',
    storeLookup?.params?.[0] === 'acct-apple' && /provider IN \('apple', 'google'\)/.test(storeLookup?.sql || ''))
  ok('the lookup honours the renewal grace window', storeLookup?.params?.[1] === 48 * 60 * 60)
  ok('a stranger cannot tell store billing from web billing: both refusals are byte-identical',
    typeof storeRes.body === 'string' && storeRes.body === duplicateRes.body)
  ok('...or when that plan renews', !/turn off renewal/.test(storeRes.body || '') &&
    !/(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}/.test(storeRes.body || ''))

  const heldApp = captureApp()
  const heldDb = {
    async query(sql) {
      if (/FROM account WHERE lower\(email\)/.test(sql)) return { rows: [{ id: 'acct-play', stripe_customer_id: null, status: 'past_due' }] }
      if (/FROM billing_subscription/.test(sql)) {
        return { rows: [{ provider: 'google', status: 'past_due', current_period_end: '2026-09-01T00:00:00.000Z' }] }
      }
      throw new Error('the held-store path must not write')
    },
  }
  let heldCheckoutCreated = false
  mountWebPurchase(heldApp, heldDb, {
    customers: { async create() { throw new Error('no Stripe customer expected') } },
    subscriptions: { async list() { return { data: [] } } },
    checkout: { sessions: { async create() { heldCheckoutCreated = true } } },
  }, async () => ({}), options)
  const heldRes = captureResponse()
  await heldApp.routes.get('POST /v1/web-checkout')(
    request({ body: { plan: 'standard', email: 'android@example.com' } }),
    heldRes,
    (error) => { throw error },
  )
  ok('a Google Play subscriber on hold is not sold a second plan', heldRes.statusCode === 409 && !heldCheckoutCreated)
  ok('...without revealing that a payment failed, or where',
    !/did not go through/.test(heldRes.body || '') && !/Google Play/.test(heldRes.body || ''))
  ok('the signed-in refusal tells a past-due store subscriber how to move to web billing',
    /cancel it in Google Play/.test(storeConflictMessage({ provider: 'google', status: 'past_due' })))
  const pausedCopy = storeConflictMessage({ provider: 'google', status: 'past_due', subscription_state: 'SUBSCRIPTION_STATE_PAUSED' })
  ok('a paused Google Play plan is described as paused, not as a failed payment',
    /paused in Google Play/.test(pausedCopy) && !/did not go through/.test(pausedCopy))
  ok('a pending Google Play purchase is described as waiting on payment',
    /still waiting on payment/.test(storeConflictMessage({ provider: 'google', status: 'past_due', subscription_state: 'SUBSCRIPTION_STATE_PENDING' })))
  ok('the store lookup reads the Google subscription state that copy needs',
    /metadata->>'subscriptionState'/.test(storeLookup?.sql || ''))
  ok('the lookup also covers store subscriptions in billing retry, hold, or pause',
    /status = 'past_due'/.test(storeLookup?.sql || '') && storeLookup?.params?.[2] === 90)

  console.log('\nTHE SIGNED-IN CHECKOUT REFUSES A STORE SUBSCRIBER BEFORE STRIPE IS TOUCHED')
  const { mount: mountStripeRoutes } = require('./stripe')
  const stripeCalls = []
  const recordingStripe = {
    customers: { async create(args) { stripeCalls.push(['customers.create', args]); return { id: 'cus_new' } } },
    subscriptions: { async list(args) { stripeCalls.push(['subscriptions.list', args]); return { data: [], has_more: false } } },
    billingPortal: { sessions: { async create(args) { stripeCalls.push(['billingPortal.sessions.create', args]); return { url: 'https://billing.stripe.test' } } } },
    checkout: { sessions: {
      async create(args) { stripeCalls.push(['checkout.sessions.create', args]); return { url: 'https://checkout.stripe.test/route' } },
      async retrieve(id) { stripeCalls.push(['checkout.sessions.retrieve', id]); return {} },
      async list(args) { stripeCalls.push(['checkout.sessions.list', args]); return { data: [] } },
    } },
  }
  const routeQueries = []
  const routeDb = {
    async query(sql, params) {
      routeQueries.push({ sql, params })
      if (/FROM billing_subscription/.test(sql)) {
        return params?.[0] === 'acct-google'
          ? { rows: [{ provider: 'google', status: 'active', current_period_end: '2026-10-01T00:00:00.000Z' }] }
          : { rows: [] }
      }
      if (/FROM topup_reconciliation_failure/.test(sql)) {
        return { rows: [{ stripe_event_id: 'evt_1', payment_intent_id: 'pi_1', reason: 'dispute-won-review', attempt_count: 1 }] }
      }
      throw new Error(`unhandled route SQL: ${sql.replace(/\s+/g, ' ').slice(0, 80)}`)
    },
  }
  const stripeApp = captureApp()
  mountStripeRoutes(stripeApp, routeDb, recordingStripe)

  const guardedRes = captureResponse()
  let guardedError = null
  await stripeApp.routes.get('POST /v1/checkout')(
    request({ body: { plan: 'starter' }, identity: { anonymous: false, installId: 'install-1', account: { id: 'acct-google', stripeCustomerId: null } } }),
    guardedRes,
    (error) => { guardedError = error },
  )
  ok('a Google Play subscriber gets a conflict from the signed-in checkout',
    guardedError === null && guardedRes.statusCode === 409, guardedError?.message)
  ok('...that names the store and says what lifts it', guardedRes.body?.error === 'SUBSCRIBED_IN_STORE' &&
    guardedRes.body?.provider === 'google' && /Google Play/.test(guardedRes.body?.message || '') &&
    /turn off renewal/.test(guardedRes.body?.message || ''))
  ok('...before any Stripe customer, subscription lookup, or Checkout Session', stripeCalls.length === 0)

  console.log('\nA TOP-UP MARKS ITS PAYMENTINTENT')
  const topupRes = captureResponse()
  let topupError = null
  await stripeApp.routes.get('POST /v1/topup')(
    request({ identity: { anonymous: false, account: { id: 'acct-1', stripeCustomerId: 'cus_topup' } } }),
    topupRes,
    (error) => { topupError = error },
  )
  const topupSession = stripeCalls.find(([name]) => name === 'checkout.sessions.create')?.[1]
  ok('the top-up checkout starts', topupError === null && topupRes.body?.url === 'https://checkout.stripe.test/route', topupError?.message)
  ok('its PaymentIntent carries the marker a refund or dispute can read',
    topupSession?.payment_intent_data?.metadata?.source === 'operator-topup')
  ok('...alongside the Session marker the grant reads', topupSession?.metadata?.source === 'operator-topup')

  console.log('\nTHE RECONCILIATION LEDGER CAN BE READ, BY AN ADMIN ONLY')
  const deniedRes = captureResponse()
  await stripeApp.routes.get('GET /v1/admin/billing-reconciliation')(
    request({ identity: { anonymous: false, account: { id: 'acct-1' } } }), deniedRes, (error) => { throw error })
  ok('a customer cannot read it', deniedRes.statusCode === 403 && !routeQueries.some(({ sql }) => /topup_reconciliation_failure/.test(sql)))
  const ledgerRes = captureResponse()
  await stripeApp.routes.get('GET /v1/admin/billing-reconciliation')(
    request({ identity: { anonymous: false, account: { id: 'acct-admin', isAdmin: true } } }), ledgerRes, (error) => { throw error })
  ok('an admin sees each alarm and its reason', ledgerRes.body?.rows?.[0]?.reason === 'dispute-won-review')
  const ledgerQuery = routeQueries.find(({ sql }) => /FROM topup_reconciliation_failure/.test(sql))
  ok('...newest first and bounded', /ORDER BY last_seen_at DESC/.test(ledgerQuery?.sql || '') && /LIMIT 200/.test(ledgerQuery?.sql || ''))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
