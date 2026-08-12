const {
  mountWebPurchase,
  preferredSubscription,
  OPEN_SUBSCRIPTION_STATUSES,
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

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
