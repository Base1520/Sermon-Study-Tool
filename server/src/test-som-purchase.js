const {
  SOM_SOURCE,
  SOM_CONSENT_VERSION,
  isPaidSomSession,
  recordSomPurchase,
  markSomPurchaseRefunded,
  createDownloadToken,
  verifyDownloadToken,
  mountSomPurchase,
} = require('./som-purchase')
process.env.STRIPE_SECRET_KEY ||= 'sk_test_placeholder'
const { creditTopUp, handleWebhookEvent } = require('./stripe')

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

function request({
  body = {}, query = {}, identity = { anonymous: true },
  host = 'api-production-15e5e.up.railway.app',
} = {}) {
  return { body, query, identity, protocol: 'https', get(name) { return name === 'host' ? host : null } }
}

function paidSession(overrides = {}) {
  return {
    id: 'cs_som_paid',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 999,
    currency: 'usd',
    customer: 'cus_som',
    payment_intent: 'pi_som',
    customer_details: { email: 'reader@example.com' },
    metadata: {
      source: SOM_SOURCE,
      email: 'reader@example.com',
      marketing_opt_in: 'true',
      consent_version: SOM_CONSENT_VERSION,
    },
    ...overrides,
  }
}

function fakeDb() {
  const state = { purchase: null, queries: [] }
  return {
    state,
    async query(sql, params = []) {
      state.queries.push({ sql, params })
      if (/INSERT INTO som_purchase/.test(sql)) {
        const priorStatus = state.purchase?.status
        state.purchase = {
          session_id: params[0], email: params[1], stripe_customer_id: params[2],
          payment_intent_id: params[3], amount_total: params[4], currency: params[5],
          status: priorStatus === 'refunded' ? 'refunded' : 'paid', source: params[6],
          marketing_opt_in: Boolean(params[7]), consent_version: params[8],
          download_count: state.purchase?.download_count || 0,
          purchased_at: state.purchase?.purchased_at || new Date().toISOString(),
        }
        return { rows: [{ ...state.purchase }] }
      }
      if (/SET status = 'refunded'/.test(sql)) {
        if (state.purchase?.payment_intent_id === params[0] && state.purchase.status !== 'refunded') {
          state.purchase.status = 'refunded'
          return { rowCount: 1, rows: [] }
        }
        return { rowCount: 0, rows: [] }
      }
      if (/WHERE session_id = \$1 AND status = 'paid'/.test(sql)) {
        return { rows: state.purchase?.session_id === params[0] && state.purchase.status === 'paid' ? [{ ...state.purchase }] : [] }
      }
      if (/SET download_count = download_count \+ 1/.test(sql)) {
        state.purchase.download_count += 1
        return { rowCount: 1, rows: [] }
      }
      if (/FROM som_purchase/.test(sql) && /ORDER BY purchased_at DESC/.test(sql)) {
        return { rows: state.purchase ? [{ ...state.purchase }] : [] }
      }
      throw new Error(`unhandled SOM test SQL: ${sql.slice(0, 80)}`)
    },
  }
}

;(async () => {
  const secret = 'som-test-signing-secret-that-is-longer-than-thirty-two-characters'

  console.log('\nSOM FULFILLMENT REQUIRES A PAID, OWNED CHECKOUT')
  ok('a paid SOM session is accepted', isPaidSomSession(paidSession()))
  ok('an unpaid session is refused', !isPaidSomSession(paidSession({ payment_status: 'unpaid' })))
  ok('an Operator top-up cannot masquerade as a book purchase',
    !isPaidSomSession(paidSession({ metadata: { source: 'operator-topup' } })))
  ok('a zero-dollar approved promotion can still fulfill', isPaidSomSession(paidSession({
    payment_status: 'no_payment_required', amount_total: 0,
  })))

  const token = createDownloadToken('cs_som_paid', secret, 1_000_000)
  ok('a signed token resolves to its paid session',
    verifyDownloadToken(token, secret, 1_000_001)?.sessionId === 'cs_som_paid')
  ok('a changed token is rejected', verifyDownloadToken(`${token}x`, secret, 1_000_001) === null)
  ok('an expired token is rejected',
    verifyDownloadToken(token, secret, 1_000_000 + (25 * 60 * 60 * 1000)) === null)

  console.log('\nSOM CHECKOUT USES THE EXACT PRICE AND A PRIVATE RETURN PATH')
  const app = captureApp()
  const db = fakeDb()
  const stripeState = { checkout: null, retrieved: paidSession() }
  const stripe = { checkout: { sessions: {
    async create(payload) {
      stripeState.checkout = payload
      return { url: 'https://checkout.stripe.test/som' }
    },
    async retrieve() { return stripeState.retrieved },
  } } }
  mountSomPurchase(app, db, stripe, {
    priceId: 'price_som_999',
    signingSecret: secret,
    createDownloadUrl: async () => 'https://private-bucket.test/signed-pdf',
  })

  const invalidRes = captureResponse()
  await app.routes.get('POST /v1/som/checkout')(
    request({ body: { email: 'not-an-email' } }), invalidRes, (error) => { throw error },
  )
  ok('invalid email is refused before Stripe', invalidRes.statusCode === 400 && stripeState.checkout === null)

  const botRes = captureResponse()
  await app.routes.get('POST /v1/som/checkout')(
    request({ body: { email: 'reader@example.com', company: 'bot' } }), botRes, (error) => { throw error },
  )
  ok('the honeypot refuses bot checkout', botRes.statusCode === 400 && stripeState.checkout === null)

  const checkoutRes = captureResponse()
  await app.routes.get('POST /v1/som/checkout')(
    request({
      body: { email: ' Reader@Example.com ', marketing_opt_in: 'on' },
      host: 'attacker.example',
    }),
    checkoutRes,
    (error) => { throw error },
  )
  ok('checkout redirects directly to Stripe', checkoutRes.statusCode === 303 && /checkout\.stripe/.test(checkoutRes.redirectTo || ''))
  ok('the exact $9.99 price is selected', stripeState.checkout?.line_items?.[0]?.price === 'price_som_999')
  ok('checkout is one-time and creates a recoverable customer',
    stripeState.checkout?.mode === 'payment' && stripeState.checkout?.customer_creation === 'always')
  ok('book metadata is isolated from Operator billing',
    stripeState.checkout?.metadata?.source === SOM_SOURCE &&
      stripeState.checkout?.payment_intent_data?.metadata?.source === SOM_SOURCE)
  ok('an attacker-controlled Host cannot replace the return URL',
    /^https:\/\/api-production-15e5e\.up\.railway\.app\//.test(stripeState.checkout?.success_url || ''))

  console.log('\nONLY THE PAID BUYER RECEIVES THE PRIVATE PDF')
  stripeState.retrieved = paidSession({ payment_status: 'unpaid' })
  const unpaidRes = captureResponse()
  await app.routes.get('GET /som/purchase/complete')(
    request({ query: { session_id: 'cs_som_unpaid' } }), unpaidRes, (error) => { throw error },
  )
  ok('an unpaid return page exposes no download', unpaidRes.statusCode === 409 && !/token=/.test(unpaidRes.body || ''))

  stripeState.retrieved = paidSession()
  const completeRes = captureResponse()
  await app.routes.get('GET /som/purchase/complete')(
    request({ query: { session_id: 'cs_som_paid' } }), completeRes, (error) => { throw error },
  )
  const encodedToken = String(completeRes.body || '').match(/token=([^"&]+)/)?.[1]
  const downloadToken = encodedToken ? decodeURIComponent(encodedToken) : ''
  ok('the paid return page contains one signed download', completeRes.statusCode === 200 && Boolean(downloadToken))
  ok('marketing consent is versioned separately from the purchase',
    db.state.purchase?.marketing_opt_in === true && db.state.purchase?.consent_version === SOM_CONSENT_VERSION)

  const tamperedRes = captureResponse()
  await app.routes.get('GET /v1/som/download')(
    request({ query: { token: `${downloadToken}changed` } }), tamperedRes, (error) => { throw error },
  )
  ok('a tampered download link is refused', tamperedRes.statusCode === 403 && !tamperedRes.redirectTo)

  const downloadRes = captureResponse()
  await app.routes.get('GET /v1/som/download')(
    request({ query: { token: downloadToken } }), downloadRes, (error) => { throw error },
  )
  ok('a valid buyer is redirected to a short-lived private object URL',
    downloadRes.statusCode === 303 && downloadRes.redirectTo === 'https://private-bucket.test/signed-pdf')
  ok('the private download is counted', db.state.purchase?.download_count === 1)

  const publicFeed = captureResponse()
  await app.routes.get('GET /v1/som/purchases')(
    request(), publicFeed, (error) => { throw error },
  )
  ok('the purchase ledger is not public', publicFeed.statusCode === 403)
  const adminFeed = captureResponse()
  await app.routes.get('GET /v1/som/purchases')(
    request({ identity: { anonymous: false, account: { plan: 'comp', isAdmin: true } } }),
    adminFeed,
    (error) => { throw error },
  )
  ok('an explicit admin can read the purchase ledger', adminFeed.body?.purchases?.[0]?.email === 'reader@example.com')

  console.log('\nREFUNDS REVOKE DELIVERY AND BOOK SALES NEVER GRANT STUDIES')
  const refunded = await markSomPurchaseRefunded(db, { payment_intent: 'pi_som', refunded: true })
  ok('a full Stripe refund revokes the order', refunded && db.state.purchase?.status === 'refunded')
  const refundedCompleteRes = captureResponse()
  await app.routes.get('GET /som/purchase/complete')(
    request({ query: { session_id: 'cs_som_paid' } }), refundedCompleteRes, (error) => { throw error },
  )
  ok('reopening the success page cannot revive a refunded order', refundedCompleteRes.statusCode === 403)

  let topupQueries = 0
  const topupDb = { async query() { topupQueries += 1; return { rowCount: 1, rows: [] } } }
  const somCredited = await creditTopUp(topupDb, paidSession())
  ok('a SOM payment grants zero Operator studies', somCredited === false && topupQueries === 0)
  const operatorCredited = await creditTopUp(topupDb, {
    id: 'cs_topup', customer: 'cus_operator', payment_intent: 'pi_topup',
    amount_total: 1500, currency: 'usd', metadata: { source: 'operator-topup' },
  })
  ok('a tagged Operator top-up still grants its studies', operatorCredited === true && topupQueries === 4)

  let topupWebhookQueries = 0
  const topupWebhookDb = { async query() { topupWebhookQueries += 1; return { rowCount: 1, rows: [] } } }
  const topupEvent = (type, paymentStatus) => ({
    type,
    data: { object: paidSession({
      id: 'cs_topup_webhook', customer: null, payment_status: paymentStatus,
      metadata: { source: 'operator-topup' },
    }) },
  })
  await handleWebhookEvent(topupWebhookDb, topupEvent('checkout.session.completed', 'unpaid'))
  ok('an unpaid completed top-up grants no studies', topupWebhookQueries === 0)
  await handleWebhookEvent(topupWebhookDb, topupEvent('checkout.session.async_payment_succeeded', 'paid'))
  ok('a delayed top-up grants after Stripe reports payment success', topupWebhookQueries === 4)


  const directDb = fakeDb()
  const directRecord = await recordSomPurchase(directDb, paidSession())
  ok('webhook fulfillment is idempotently recordable', directRecord?.session_id === 'cs_som_paid')

  const webhookDb = fakeDb()
  await handleWebhookEvent(webhookDb, {
    type: 'checkout.session.completed',
    data: { object: paidSession({ customer: null }) },
  })
  ok('the webhook finishes the purchase write before it can acknowledge Stripe',
    webhookDb.state.purchase?.session_id === 'cs_som_paid')

  let webhookRejected = false
  try {
    await handleWebhookEvent({ async query() { throw new Error('database offline') } }, {
      type: 'checkout.session.completed',
      data: { object: paidSession({ customer: null }) },
    })
  } catch {
    webhookRejected = true
  }
  ok('a failed webhook write rejects so Stripe can retry it', webhookRejected)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
