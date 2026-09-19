const {
  SOM_SOURCE,
  SOM_CONSENT_VERSION,
  isPaidSomSession,
  recordSomPurchase,
  markSomPurchaseRefunded,
  markSomPurchaseDisputed,
  restoreSomPurchaseAfterWonDispute,
  createDownloadToken,
  verifyDownloadToken,
  durableDownloadUrl,
  somApiOrigin,
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

// What a database would execute: SQL comments are not code.
const sqlCode = (sql) => sql.replace(/--.*$/gm, '')

function fakeDb() {
  const state = { purchase: null, queries: [] }
  return {
    state,
    async query(sql, params = []) {
      state.queries.push({ sql, params })
      if (/INSERT INTO som_purchase/.test(sql)) {
        const priorStatus = state.purchase?.status
        // Which reversed statuses survive a replay is read from the statement's own
        // CASE, so a regression in the real SQL fails here instead of being masked.
        const code = sqlCode(sql)
        const keeps = /status = CASE WHEN som_purchase\.status IN \('refunded', 'disputed'\) THEN som_purchase\.status ELSE 'paid' END/.test(code)
          ? ['refunded', 'disputed']
          : /status = CASE WHEN som_purchase\.status = 'refunded' THEN 'refunded' ELSE 'paid' END/.test(code) ? ['refunded'] : []
        state.purchase = {
          session_id: params[0], email: params[1], stripe_customer_id: params[2],
          payment_intent_id: params[3], amount_total: params[4], currency: params[5],
          status: keeps.includes(priorStatus) ? priorStatus : 'paid', source: params[6],
          marketing_opt_in: Boolean(params[7]), consent_version: params[8],
          download_count: state.purchase?.download_count || 0,
          purchased_at: state.purchase?.purchased_at || new Date().toISOString(),
        }
        return { rows: [{ ...state.purchase }] }
      }
      if (/SET status = 'refunded'/.test(sql)) {
        if (state.purchase?.payment_intent_id === params[0] && (!/AND status <> 'refunded'/.test(sqlCode(sql)) || state.purchase.status !== 'refunded')) {
          state.purchase.status = 'refunded'
          return { rowCount: 1, rows: [] }
        }
        return { rowCount: 0, rows: [] }
      }
      if (/SET status = 'disputed'/.test(sql)) {
        if (state.purchase?.payment_intent_id === params[0] && (!/AND status = 'paid'/.test(sqlCode(sql)) || state.purchase.status === 'paid')) {
          state.purchase.status = 'disputed'
          return { rowCount: 1, rows: [] }
        }
        return { rowCount: 0, rows: [] }
      }
      if (/SET status = 'paid'/.test(sql)) {
        if (state.purchase?.payment_intent_id === params[0] && (!/AND status = 'disputed'/.test(sqlCode(sql)) || state.purchase.status === 'disputed')) {
          state.purchase.status = 'paid'
          return { rowCount: 1, rows: [] }
        }
        return { rowCount: 0, rows: [] }
      }
      if (/SELECT/.test(sql) && /WHERE session_id = \$1 AND status = 'paid'/.test(sql)) {
        return { rows: state.purchase?.session_id === params[0] && state.purchase.status === 'paid' ? [{ ...state.purchase }] : [] }
      }
      if (/SET download_count = download_count \+ 1/.test(sql)) {
        if (/AND status = 'paid'/.test(sql) && state.purchase.status !== 'paid') return { rowCount: 0, rows: [] }
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

  const assert = require('node:assert/strict')
  for (const suffix of ['.', '..extra', '.extra', '.extra.more']) {
    ok(`extra token segments are rejected (${suffix})`, verifyDownloadToken(token + suffix, secret, 1_000_001) === null)
  }
  ok('a token without its signature is rejected', verifyDownloadToken(token.split('.')[0], secret) === null)
  ok('expiry is exclusive', verifyDownloadToken(token, secret, 1_000_000 + 86400_000) === null)
  const rotated = 'another-test-signing-secret-longer-than-thirty-two-characters'
  ok('rotation without a retained key rejects old tokens', verifyDownloadToken(token, rotated, 1_000_001) === null)
  ok('rotation with a retained key preserves old tokens', verifyDownloadToken(token, [rotated, secret], 1_000_001)?.sessionId === 'cs_som_paid')
  const durable = new URL(durableDownloadUrl('cs_som_paid', { signingSecret: secret, apiOrigin: 'https://staging.example/' }))
  const durableToken = durable.searchParams.get('token')
  const parsedDurable = verifyDownloadToken(durableToken, secret)
  ok('durable URL uses the configured origin and route', durable.origin === 'https://staging.example' && durable.pathname === '/v1/som/download')
  ok('durable tokens live for ten years', Math.abs(parsedDurable.expiresAt - Math.floor(Date.now() / 1000) - 3650 * 86400) <= 1)
  ok('the default durable URL serves the PDF (no format param)', !durable.searchParams.has('format'))
  const durableEpub = new URL(durableDownloadUrl('cs_som_paid', { signingSecret: secret, apiOrigin: 'https://staging.example/', format: 'epub' }))
  ok('an epub durable URL carries format=epub and a valid token',
    durableEpub.searchParams.get('format') === 'epub' &&
    verifyDownloadToken(durableEpub.searchParams.get('token'), secret)?.sessionId === 'cs_som_paid')
  assert.throws(() => durableDownloadUrl('cs_paid', { signingSecret: '', apiOrigin: 'https://staging.example' }), /signing secret/)
  for (const origin of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'https://example.com/path']) {
    assert.throws(() => somApiOrigin({ apiOrigin: origin }), /origin/)
  }
  ok('local development origins are allowed', somApiOrigin({ apiOrigin: 'http://localhost:3000/' }) === 'http://localhost:3000')

  // Isolate configuration and transport without changing process.env or contacting a provider.
  const fs = require('node:fs')
  const vm = require('node:vm')
  const { createRequire } = require('node:module')
  function isolatedModule(name, env, overrides = {}) {
    const filename = require.resolve(name)
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module, exports: module.exports, require: createRequire(filename),
      process: { env }, Buffer, URL, console: { error() {} },
      setTimeout, clearTimeout, AbortController, ...overrides,
    }, { filename })
    return module.exports
  }
  const fallbackSom = isolatedModule('./som-purchase', { OPERATOR_API_PUBLIC_URL: 'https://staging-fallback.example/' })
  ok('email links fall back to the configured Operator API', fallbackSom.somApiOrigin() === 'https://staging-fallback.example')
  const explicitSom = isolatedModule('./som-purchase', { SOM_API_ORIGIN: 'https://som.example', OPERATOR_API_PUBLIC_URL: 'https://operator.example' })
  ok('SOM-specific configuration takes precedence', explicitSom.somApiOrigin() === 'https://som.example')
  assert.throws(() => isolatedModule('./som-purchase', {}).somApiOrigin(), /not configured/)
  ok('missing origin fails instead of sending staging buyers to production', true)
  let timingChecks = 0
  const crypto = require('node:crypto')
  const nativeSomRequire = createRequire(require.resolve('./som-purchase'))
  const timingSom = isolatedModule('./som-purchase', {}, {
    require: (name) => name === 'crypto' ? {
      ...crypto, timingSafeEqual: (...args) => { timingChecks += 1; return crypto.timingSafeEqual(...args) },
    } : nativeSomRequire(name),
  })
  timingSom.verifyDownloadToken(token, [rotated, secret], 1_000_001)
  ok('every retained key uses constant-time signature comparison', timingChecks === 2)
  for (const payload of [{ sessionId: 'cs_som_paid' }, { sessionId: {}, expiresAt: 9999999999 }, { sessionId: 'cs_som_paid', expiresAt: '9999999999' }]) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url')
    assert.equal(verifyDownloadToken(`${encoded}.${signature}`, secret), null)
  }
  ok('signed payloads must contain a string session and numeric expiry', true)
  for (const withSecret of [true, false]) {
    const sent = []
    const mailchimp = isolatedModule('./mailchimp', {
      MAILCHIMP_API_KEY: 'fixture-us21', MAILCHIMP_AUDIENCE_ID: 'fixture-audience',
    }, { fetch: async (_url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200 } } })
    const nativeRequire = createRequire(require.resolve('./som-purchase'))
    const som = isolatedModule('./som-purchase', {}, {
      require: (name) => name === './mailchimp' ? mailchimp : nativeRequire(name),
    })
    let intentId
    const client = { release() {}, async query(sql, params) {
      if (/INSERT INTO marketing_contact_state/.test(sql)) intentId = params[2]
      return { rows: /SELECT action, intent_id/.test(sql) ? [{ action: 'sync', intent_id: intentId }] : [] }
    } }
    const result = await som.syncSomBuyerMarketing({ connect: async () => client },
      { email: 'reader@example.com', status: 'paid' }, paidSession(), {
        ...(withSecret ? { signingSecret: secret } : {}), apiOrigin: 'https://staging.example',
      })
    ok(`SOM marketing sync succeeds with signing secret ${withSecret ? 'present' : 'absent'}`, result.synced === true)
    assert.equal(sent[0].status, 'subscribed')
    assert.equal(sent[0].status_if_new, 'subscribed')
    assert.deepEqual(sent[1].tags.map((tag) => tag.name), ['SOM Buyer', "The Spiritual Operator's Manual"])
    if (withSecret) assert.equal(verifyDownloadToken(new URL(sent[0].merge_fields.DLURL).searchParams.get('token'), secret).sessionId, 'cs_som_paid')
    else assert.equal(sent[0].merge_fields, undefined)
  }

  console.log('\nSOM CHECKOUT USES THE EXACT PRICE AND A PRIVATE RETURN PATH')
  const app = captureApp()
  const db = fakeDb()
  const stripeState = { checkout: null, retrieved: paidSession() }
  const stripe = {
    paymentIntents: { async retrieve() { return { status: 'succeeded', latest_charge: { id: 'ch_som', paid: true, refunded: false, disputed: false } } } },
    checkout: { sessions: {
    async create(payload) {
      stripeState.checkout = payload
      return { url: 'https://checkout.stripe.test/som' }
    },
    async retrieve() { return stripeState.retrieved },
  } } }
  let fileUrls = 0
  mountSomPurchase(app, db, stripe, {
    priceId: 'price_som_999',
    apiOrigin: 'https://staging.example',
    signingSecret: secret,
    createDownloadUrl: async () => { fileUrls += 1; return 'https://private-bucket.test/signed-pdf' },
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
    /^https:\/\/staging\.example\//.test(stripeState.checkout?.success_url || ''))

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

  // Exercise the real mounted route, including the storage boundary.
  const redeem = async (value = durableToken) => {
    const res = captureResponse()
    await app.routes.get('GET /v1/som/download')(
      request({ query: { token: value } }), res, (error) => { throw error },
    )
    return res
  }
  ok('durable token replay is intentionally allowed for a paid buyer', (await redeem()).statusCode === 303 && (await redeem()).statusCode === 303)
  ok('a valid signature cannot authorize a never-paid session',
    (await redeem(createDownloadToken('cs_never_paid', secret))).statusCode === 403)
  for (const status of ['refunded', 'disputed']) {
    db.state.purchase.status = status
    ok(`the actual download route blocks a ${status} durable token`, (await redeem()).statusCode === 403)
  }
  db.state.purchase.status = 'paid'
  const livePayment = stripe.paymentIntents.retrieve
  for (const charge of [
    { paid: true, refunded: true, disputed: false },
    { paid: true, refunded: false, disputed: true },
  ]) {
    stripe.paymentIntents.retrieve = async () => ({ status: 'succeeded', latest_charge: { id: 'ch_som', ...charge } })
    stripe.disputes = { list: async () => ({ data: [{ status: 'lost' }], has_more: false }) }
    ok('a reversed live payment blocks a stale paid ledger row', (await redeem()).statusCode === 403)
    const earlyDb = fakeDb()
    if (charge.refunded) await markSomPurchaseRefunded(earlyDb, { payment_intent: 'pi_som', refunded: true })
    else await markSomPurchaseDisputed(earlyDb, 'pi_som')
    await recordSomPurchase(earlyDb, paidSession())
    const earlyApp = captureApp()
    mountSomPurchase(earlyApp, earlyDb, stripe, {
      signingSecret: secret,
      createDownloadUrl: async () => { throw new Error('reversed payment must never sign storage') },
    })
    const earlyResponse = captureResponse()
    await earlyApp.routes.get('GET /v1/som/download')(request({ query: { token: durableToken } }), earlyResponse, (error) => { throw error })
    ok('reversal-before-checkout event ordering cannot grant a download', earlyDb.state.purchase.status === 'paid' && earlyResponse.statusCode === 403)

  }
  for (const status of ['needs_response', 'under_review']) {
    stripe.disputes.list = async () => ({ data: [{ status }], has_more: false })
    ok(`a live ${status} dispute blocks delivery`, (await redeem()).statusCode === 403)
  }
  stripe.disputes.list = async () => ({ data: [{ status: 'won' }], has_more: false })
  ok('a won dispute permits a locally eligible purchase', (await redeem()).statusCode === 303)
  stripe.paymentIntents.retrieve = async () => { throw new Error('provider unavailable') }
  const fileUrlsBeforeFailure = fileUrls
  await assert.rejects(redeem(), /provider unavailable/)
  ok('provider read failure never issues a file URL', fileUrls === fileUrlsBeforeFailure)
  stripe.paymentIntents.retrieve = livePayment
  const originalIntent = db.state.purchase.payment_intent_id
  const originalAmount = db.state.purchase.amount_total
  db.state.purchase.payment_intent_id = null
  ok('a nonzero order without a PaymentIntent cannot download', (await redeem()).statusCode === 403)
  db.state.purchase.amount_total = 0
  ok('a recorded zero-dollar promotion remains downloadable', (await redeem()).statusCode === 303)
  db.state.purchase.payment_intent_id = originalIntent
  db.state.purchase.amount_total = originalAmount
  ok('book ownership requires no Operator account (including a deleted account)', (await redeem()).statusCode === 303 &&
    !db.state.queries.some(({ sql }) => /FROM account/.test(sql)))
  const racingApp = captureApp()
  mountSomPurchase(racingApp, db, stripe, {
    signingSecret: secret,
    createDownloadUrl: async () => { db.state.purchase.status = 'refunded'; return 'https://private-bucket.test/signed-pdf' },
  })
  const racingResponse = captureResponse()
  await racingApp.routes.get('GET /v1/som/download')(request({ query: { token: durableToken } }), racingResponse, (error) => { throw error })
  ok('a reversal while preparing the file URL prevents the redirect', racingResponse.statusCode === 403 && !racingResponse.redirectTo)
  db.state.purchase.status = 'paid'
  const rotationApp = captureApp()
  mountSomPurchase(rotationApp, db, stripe, {
    signingSecret: rotated, previousSigningSecrets: [secret], createDownloadUrl: async () => 'https://private-bucket.test/signed-pdf',
  })
  const rotationResponse = captureResponse()
  await rotationApp.routes.get('GET /v1/som/download')(request({ query: { token: durableToken } }), rotationResponse, (error) => { throw error })
  ok('the mounted route accepts an emailed token after planned rotation', rotationResponse.statusCode === 303)

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

  console.log('\nA CHARGEBACK CLOSES THE DOWNLOAD AND A REPLAY CANNOT REOPEN IT')
  const somDisputeDb = fakeDb()
  await recordSomPurchase(somDisputeDb, paidSession())
  const disputed = await markSomPurchaseDisputed(somDisputeDb, 'pi_som')
  ok('a dispute closes a paid order', disputed && somDisputeDb.state.purchase.status === 'disputed')
  ok('...and only a paid one', somDisputeDb.state.queries.some(({ sql }) =>
    /SET status = 'disputed'/.test(sql) && /AND status = 'paid'/.test(sqlCode(sql))))
  await recordSomPurchase(somDisputeDb, paidSession())
  ok('a replayed checkout event cannot revive a disputed order', somDisputeDb.state.purchase.status === 'disputed')
  ok('...because the upsert keeps a reversed status', somDisputeDb.state.queries.some(({ sql }) =>
    /status IN \('refunded', 'disputed'\) THEN som_purchase\.status/.test(sqlCode(sql))))
  const restored = await restoreSomPurchaseAfterWonDispute(somDisputeDb, 'pi_som')
  ok('a won dispute restores the order', restored && somDisputeDb.state.purchase.status === 'paid')
  const somRefundedDb = fakeDb()
  await recordSomPurchase(somRefundedDb, paidSession())
  await markSomPurchaseRefunded(somRefundedDb, { payment_intent: 'pi_som', refunded: true })
  const revived = await restoreSomPurchaseAfterWonDispute(somRefundedDb, 'pi_som')
  ok('winning a dispute never revives a refunded order', !revived && somRefundedDb.state.purchase.status === 'refunded')
  ok('a dispute with no PaymentIntent touches nothing', (await markSomPurchaseDisputed(fakeDb(), null)) === false)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
