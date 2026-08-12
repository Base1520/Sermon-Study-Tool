const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { GoogleAuth, OAuth2Client } = require('google-auth-library')
const {
  Environment,
  NotificationTypeV2,
  SignedDataVerifier,
  Subtype,
} = require('@apple/app-store-server-library')

const billing = require('./billing')
const catalog = require('./iap-products.json')
const { PLANS } = require('./entitlement')
const { capabilityChecks } = require('./readiness')

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
const REQUEST_TIMEOUT_MS = 15_000
const GOOGLE_ACKNOWLEDGMENT_INTERVAL_MS = 60_000
const GOOGLE_ACKNOWLEDGMENT_LEASE_MINUTES = 5
const APPLE_PRODUCT_BY_ID = new Map(catalog.products.map((product) => [product.appleProductId, product]))
const GOOGLE_PRODUCT_BY_PLAN = new Map(catalog.products.map((product) => [
  `${product.googleProductId}:${product.androidBasePlanId}`,
  product,
]))
const APPLE_ROOT_CERTIFICATES = [
  'AppleIncRootCertificate.cer',
  'AppleRootCA-G2.cer',
  'AppleRootCA-G3.cer',
].map((filename) => fs.readFileSync(path.join(__dirname, '..', 'certs', filename)))
const GOOGLE_ACKNOWLEDGMENT_WORKERS = new WeakSet()

class IapError extends Error {
  constructor(status, code, message, details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

function appleProductFor(productId) {
  return APPLE_PRODUCT_BY_ID.get(String(productId || '')) || null
}

function googleProductFor(productId, basePlanId) {
  return GOOGLE_PRODUCT_BY_PLAN.get(`${String(productId || '')}:${String(basePlanId || '')}`) || null
}

function googleProductForLineItem(lineItem) {
  return googleProductFor(lineItem?.productId, lineItem?.offerDetails?.basePlanId)
}

function decodeJwsPayload(jws) {
  try {
    const payload = String(jws || '').split('.')[1]
    return payload ? JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) : null
  } catch {
    return null
  }
}

function appleVerifierFor(jws) {
  const unverified = decodeJwsPayload(jws)
  const environment = unverified?.environment || unverified?.data?.environment
  if (![Environment.SANDBOX, Environment.PRODUCTION].includes(environment)) {
    throw new IapError(400, 'APPLE_ENVIRONMENT_INVALID', 'That App Store transaction could not be verified.')
  }
  const appAppleId = environment === Environment.PRODUCTION
    ? Number(process.env.APPLE_APP_ID || 0)
    : undefined
  if (environment === Environment.PRODUCTION && !appAppleId) {
    throw new IapError(503, 'APPLE_NOT_CONFIGURED', 'App Store verification is not configured yet.')
  }
  return {
    environment,
    verifier: new SignedDataVerifier(
      APPLE_ROOT_CERTIFICATES,
      true,
      environment,
      catalog.bundleId,
      appAppleId,
    ),
  }
}

function appleStatus(transaction, notificationType, subtype) {
  if (transaction.revocationDate || [NotificationTypeV2.REFUND, NotificationTypeV2.REVOKE].includes(notificationType)) {
    return 'canceled'
  }
  if ([NotificationTypeV2.EXPIRED, NotificationTypeV2.GRACE_PERIOD_EXPIRED].includes(notificationType)) {
    return 'canceled'
  }
  if (notificationType === NotificationTypeV2.DID_FAIL_TO_RENEW) {
    return subtype === Subtype.GRACE_PERIOD ? 'active' : 'past_due'
  }
  if (transaction.expiresDate && transaction.expiresDate <= Date.now()) return 'canceled'
  return 'active'
}

async function verifiedAppleTransaction(jws) {
  if (!jws || String(jws).length > 100_000) {
    throw new IapError(400, 'APPLE_TRANSACTION_REQUIRED', 'A signed App Store transaction is required.')
  }
  try {
    const { verifier, environment } = appleVerifierFor(jws)
    const transaction = await verifier.verifyAndDecodeTransaction(jws)
    const product = appleProductFor(transaction.productId)
    if (!product) throw new IapError(400, 'UNKNOWN_PRODUCT', 'That subscription is not an Operator plan.')
    return { transaction, product, environment, verifier }
  } catch (error) {
    if (error instanceof IapError) throw error
    throw new IapError(400, 'APPLE_VERIFICATION_FAILED', 'The App Store could not verify that subscription.')
  }
}

function googleCredentials() {
  const raw = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim()
  if (!raw) throw new IapError(503, 'GOOGLE_NOT_CONFIGURED', 'Google Play verification is not configured yet.')
  try {
    return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    throw new IapError(503, 'GOOGLE_NOT_CONFIGURED', 'Google Play verification credentials are invalid.')
  }
}

async function googleAccessToken() {
  const auth = new GoogleAuth({ credentials: googleCredentials(), scopes: [GOOGLE_SCOPE] })
  const token = await auth.getAccessToken()
  if (!token) throw new IapError(503, 'GOOGLE_NOT_CONFIGURED', 'Google Play verification could not authenticate.')
  return token
}

async function googleRequest(pathname, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const token = await googleAccessToken()
    const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3${pathname}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    })
    const text = await response.text()
    let body = {}
    try { body = text ? JSON.parse(text) : {} } catch { body = {} }
    if (!response.ok) {
      throw new IapError(
        response.status === 404 ? 400 : 502,
        'GOOGLE_VERIFICATION_FAILED',
        'Google Play could not verify that subscription.',
      )
    }
    return body
  } finally {
    clearTimeout(timeout)
  }
}

function googleStatus(purchase) {
  const state = purchase.subscriptionState
  if (['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(state)) return 'active'
  if (state === 'SUBSCRIPTION_STATE_CANCELED') {
    const expires = Math.max(...(purchase.lineItems || []).map((item) => new Date(item.expiryTime || 0).getTime()), 0)
    return expires > Date.now() ? 'active' : 'canceled'
  }
  if (['SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_PENDING'].includes(state)) {
    return 'past_due'
  }
  return 'canceled'
}

function providerEventRank(status) {
  if (status === 'canceled') return 100
  if (status === 'past_due') return 50
  return 10
}

function latestEventTimestamp(...values) {
  const timestamp = values
    .map((value) => new Date(value || 0).getTime())
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => right - left)[0]
  return timestamp ? new Date(timestamp).toISOString() : null
}

function googleProviderEventTimestamp(purchase, eventTimeMillis = null, providerObservedAt = null) {
  const timestamp = latestEventTimestamp(providerObservedAt, eventTimeMillis, purchase?.startTime)
  if (!timestamp) {
    throw new IapError(400, 'GOOGLE_TRANSACTION_INVALID', 'Google Play returned a purchase without an event time.')
  }
  return timestamp
}

function sandboxAllowlist() {
  return new Set(String(process.env.IAP_SANDBOX_ACCOUNT_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean))
}

async function assertStoreEnvironmentAllowed(db, { accountId, environment }) {
  if (environment === 'production') return
  const allowed = sandboxAllowlist()
  const { rows } = await db.query(`SELECT email FROM account WHERE id = $1`, [accountId])
  const email = String(rows[0]?.email || '').trim().toLowerCase()
  if (!email || !allowed.has(email)) {
    throw new IapError(403, 'SANDBOX_PURCHASE_FORBIDDEN', 'That test-store purchase cannot unlock a production Operator account.')
  }
}

async function verifiedGooglePurchase(purchaseToken) {
  const token = String(purchaseToken || '').trim()
  if (!token || token.length > 4096) {
    throw new IapError(400, 'GOOGLE_TRANSACTION_REQUIRED', 'A Google Play purchase token is required.')
  }
  const providerObservedAt = new Date().toISOString()
  const purchase = await googleRequest(
    `/applications/${encodeURIComponent(catalog.androidPackage)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
  )
  const lineItems = Array.isArray(purchase.lineItems) ? purchase.lineItems : []
  const item = lineItems
    .map((lineItem) => ({ lineItem, product: googleProductForLineItem(lineItem) }))
    .find((entry) => entry.product)
  if (!item) throw new IapError(400, 'UNKNOWN_PRODUCT', 'That subscription is not an Operator plan.')

  const currentPeriodEnd = item.lineItem.expiryTime || null
  return { purchase, product: item.product, purchaseToken: token, currentPeriodEnd, providerObservedAt }
}

async function acknowledgeGooglePurchase({ purchase, product, purchaseToken }) {
  if (
    purchase.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_PENDING' ||
    googleStatus(purchase) !== 'active'
  ) return false
  await googleRequest(
    `/applications/${encodeURIComponent(catalog.androidPackage)}/purchases/subscriptions/${encodeURIComponent(product.googleProductId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: 'POST', body: '{}' },
  )
  return true
}

function googleAcknowledgmentRequired(purchase) {
  return purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && googleStatus(purchase) === 'active'
}

function googleAcknowledgmentId(purchaseToken) {
  return crypto.createHash('sha256').update(String(purchaseToken || '')).digest('hex')
}

async function enqueueGoogleAcknowledgment(db, { accountId, product, purchaseToken }) {
  await db.query(
    `INSERT INTO google_acknowledgment_outbox
          (purchase_token_hash, purchase_token, account_id, product_id, base_plan_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (purchase_token_hash) DO UPDATE
            SET purchase_token = EXCLUDED.purchase_token,
                account_id = EXCLUDED.account_id,
                product_id = EXCLUDED.product_id,
                base_plan_id = EXCLUDED.base_plan_id,
                next_attempt_at = LEAST(google_acknowledgment_outbox.next_attempt_at, now()),
                last_error = NULL,
                updated_at = now()`,
    [
      googleAcknowledgmentId(purchaseToken),
      purchaseToken,
      accountId,
      product.googleProductId,
      product.androidBasePlanId,
    ],
  )
}

async function clearGoogleAcknowledgment(db, purchaseToken) {
  await db.query(
    `DELETE FROM google_acknowledgment_outbox WHERE purchase_token_hash = $1`,
    [googleAcknowledgmentId(purchaseToken)],
  )
}

function googleAcknowledgmentRetryDelayMs(attempts) {
  const exponent = Math.max(0, Math.min(7, Number(attempts || 1) - 1))
  return Math.min(60 * 60 * 1000, 30_000 * (2 ** exponent))
}

async function recordGoogleAcknowledgmentFailure(db, purchaseToken, error, {
  incrementAttempt = false,
  attempts = 1,
} = {}) {
  await db.query(
    `UPDATE google_acknowledgment_outbox
        SET attempts = attempts + $2,
            next_attempt_at = now() + ($3::double precision * interval '1 millisecond'),
            last_error = $4,
            updated_at = now()
      WHERE purchase_token_hash = $1`,
    [
      googleAcknowledgmentId(purchaseToken),
      incrementAttempt ? 1 : 0,
      googleAcknowledgmentRetryDelayMs(attempts),
      String(error?.message || error || 'Google Play acknowledgment failed.').slice(0, 1000),
    ],
  )
}

async function claimGoogleAcknowledgment(db) {
  const { rows } = await db.query(
    `WITH due AS (
       SELECT purchase_token_hash
         FROM google_acknowledgment_outbox
        WHERE next_attempt_at <= now()
        ORDER BY next_attempt_at, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     UPDATE google_acknowledgment_outbox AS job
        SET attempts = job.attempts + 1,
            next_attempt_at = now() + ($1::double precision * interval '1 minute'),
            updated_at = now()
       FROM due
      WHERE job.purchase_token_hash = due.purchase_token_hash
     RETURNING job.purchase_token, job.attempts`,
    [GOOGLE_ACKNOWLEDGMENT_LEASE_MINUTES],
  )
  return rows[0] || null
}

async function processGoogleAcknowledgmentOutbox(db, {
  verifyPurchase = verifiedGooglePurchase,
  acknowledgePurchase = acknowledgeGooglePurchase,
  limit = 10,
} = {}) {
  let processed = 0
  let pending = 0
  for (let index = 0; index < limit; index += 1) {
    const job = await claimGoogleAcknowledgment(db)
    if (!job) break
    try {
      const verified = await verifyPurchase(job.purchase_token)
      if (googleAcknowledgmentRequired(verified.purchase)) {
        await acknowledgePurchase(verified)
      }
      await clearGoogleAcknowledgment(db, job.purchase_token)
      processed += 1
    } catch (error) {
      await recordGoogleAcknowledgmentFailure(db, job.purchase_token, error, { attempts: job.attempts })
      pending += 1
      console.error('[iap] Google acknowledgment retry failed:', error.message)
    }
  }
  return { processed, pending }
}

function startGoogleAcknowledgmentWorker(db) {
  if (!db || (typeof db !== 'object' && typeof db !== 'function') || GOOGLE_ACKNOWLEDGMENT_WORKERS.has(db)) return null
  GOOGLE_ACKNOWLEDGMENT_WORKERS.add(db)
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await processGoogleAcknowledgmentOutbox(db)
    } catch (error) {
      console.error('[iap] Google acknowledgment worker failed:', error.message)
    } finally {
      running = false
    }
  }
  void run()
  const timer = setInterval(run, GOOGLE_ACKNOWLEDGMENT_INTERVAL_MS)
  timer.unref?.()
  return timer
}

async function existingOwner(db, provider, externalIds) {
  const ids = externalIds.filter(Boolean)
  if (!ids.length) return null
  const { rows } = await db.query(
    `SELECT account_id FROM billing_subscription
      WHERE provider = $1 AND external_id = ANY($2::text[])
      ORDER BY updated_at DESC LIMIT 1`,
    [provider, ids],
  )
  return rows[0]?.account_id || null
}

async function assertPurchaseOwner(db, {
  provider,
  externalIds,
  accountId,
  storeAccountId,
  restoring,
}) {
  const owner = await existingOwner(db, provider, externalIds)
  if (owner && owner !== accountId) {
    throw new IapError(409, 'PURCHASE_ALREADY_LINKED', 'That purchase belongs to another Operator account. Link that account instead.')
  }
  if (owner) {
    if (storeAccountId && storeAccountId !== accountId) {
      const { rows } = await db.query(`SELECT 1 FROM account WHERE id = $1`, [storeAccountId])
      if (rows.length) {
        throw new IapError(409, 'PURCHASE_ACCOUNT_MISMATCH', 'The store returned a purchase for a different Operator account.')
      }
    }
    return
  }
  if (!storeAccountId) {
    throw new IapError(409, 'PURCHASE_ACCOUNT_REQUIRED', 'That purchase is missing its signed Operator account identifier.')
  }
  if (storeAccountId === accountId) return
  if (!restoring) {
    throw new IapError(409, 'PURCHASE_ACCOUNT_MISMATCH', 'The store returned a purchase for a different Operator account.')
  }
  const { rows } = await db.query(`SELECT 1 FROM account WHERE id = $1`, [storeAccountId])
  if (rows.length) {
    throw new IapError(409, 'PURCHASE_ACCOUNT_MISMATCH', 'That purchase is still attached to another Operator account. Link that account instead.')
  }
}

async function withIapTransaction(db, { accountId, provider, externalIds }, operation) {
  if (typeof db.connect !== 'function') return operation(db)
  const client = await db.connect()
  const transactionDb = { query: (...args) => client.query(...args) }
  try {
    await client.query('BEGIN')
    const lockKeys = [...new Set(externalIds.filter(Boolean).map((externalId) => `${provider}:${externalId}`))].sort()
    for (const lockKey of lockKeys) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('operator-iap'), hashtext($1))`, [lockKey])
    }
    const account = await client.query(
      `SELECT id, deleting_at FROM account WHERE id = $1 FOR UPDATE`,
      [accountId],
    )
    if (!account.rows.length) {
      throw new billing.BillingError(404, 'ACCOUNT_NOT_FOUND', 'That Operator account no longer exists.')
    }
    if (account.rows[0].deleting_at) {
      throw new billing.BillingError(409, 'ACCOUNT_DELETING', 'That Operator account is being deleted and cannot accept a purchase.')
    }
    const result = await operation(transactionDb)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function applyAppleTransaction(db, {
  transaction,
  product,
  environment,
  accountId,
  notificationType = null,
  subtype = null,
  restoring = false,
  notificationId = null,
  notificationSignedDate = null,
}) {
  const externalId = transaction.originalTransactionId || transaction.transactionId
  if (!externalId) throw new IapError(400, 'APPLE_TRANSACTION_INVALID', 'The App Store transaction has no identifier.')
  await assertPurchaseOwner(db, {
    provider: 'apple',
    externalIds: [externalId],
    accountId,
    storeAccountId: transaction.appAccountToken,
    restoring,
  })
  const storeEnvironment = environment === Environment.PRODUCTION ? 'production' : 'sandbox'
  await assertStoreEnvironmentAllowed(db, { accountId, environment: storeEnvironment })
  const status = appleStatus(transaction, notificationType, subtype)
  const providerEventAt = latestEventTimestamp(
    transaction.revocationDate,
    notificationSignedDate,
    transaction.signedDate,
    transaction.purchaseDate,
  )
  if (!providerEventAt) {
    throw new IapError(400, 'APPLE_TRANSACTION_INVALID', 'The App Store transaction has no signed event time.')
  }
  return billing.upsertSubscription(db, {
    accountId,
    provider: 'apple',
    externalId,
    productId: product.appleProductId,
    plan: product.plan,
    status,
    currentPeriodEnd: transaction.expiresDate ? new Date(transaction.expiresDate).toISOString() : null,
    billingAnchorAt: latestEventTimestamp(transaction.originalPurchaseDate, transaction.purchaseDate),
    providerEventAt,
    providerEventRank: providerEventRank(status),
    environment: storeEnvironment,
    metadata: {
      transactionId: transaction.transactionId || null,
      notificationType,
      subtype,
      notificationId,
    },
  })
}

async function applyGooglePurchase(db, {
  purchase,
  product,
  purchaseToken,
  currentPeriodEnd,
  accountId,
  restoring = false,
  eventTimeMillis = null,
  providerObservedAt = null,
  acknowledgePurchase = acknowledgeGooglePurchase,
}) {
  const storeAccountId = purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId || null
  const storeEnvironment = purchase.testPurchase ? 'sandbox' : 'production'
  const status = googleStatus(purchase)
  const providerEventAt = googleProviderEventTimestamp(purchase, eventTimeMillis, providerObservedAt)
  const acknowledgmentRequired = googleAcknowledgmentRequired(purchase)
  const externalIds = [purchaseToken, purchase.linkedPurchaseToken]
  const entitlement = await withIapTransaction(db, {
    accountId,
    provider: 'google',
    externalIds,
  }, async (transactionDb) => {
    await assertPurchaseOwner(transactionDb, {
      provider: 'google',
      externalIds,
      accountId,
      storeAccountId,
      restoring,
    })
    await assertStoreEnvironmentAllowed(transactionDb, { accountId, environment: storeEnvironment })
    if (purchase.linkedPurchaseToken) {
      await transactionDb.query(
        `UPDATE billing_subscription
            SET status = 'canceled', provider_event_at = $3,
                provider_event_rank = 100, updated_at = now()
          WHERE provider = 'google' AND external_id = $1 AND account_id = $2
            AND (provider_event_at IS NULL OR provider_event_at <= $3)`,
        [purchase.linkedPurchaseToken, accountId, providerEventAt],
      )
    }
    const result = await billing.upsertSubscription(transactionDb, {
      accountId,
      provider: 'google',
      externalId: purchaseToken,
      productId: `${product.googleProductId}:${product.androidBasePlanId}`,
      plan: product.plan,
      status,
      currentPeriodEnd,
      billingAnchorAt: latestEventTimestamp(purchase.startTime),
      providerEventAt,
      providerEventRank: providerEventRank(status),
      environment: storeEnvironment,
      metadata: {
        linkedPurchaseToken: purchase.linkedPurchaseToken || null,
        subscriptionState: purchase.subscriptionState || null,
        basePlanId: product.androidBasePlanId,
      },
    })
    if (acknowledgmentRequired) {
      await enqueueGoogleAcknowledgment(transactionDb, { accountId, product, purchaseToken })
    }
    return result
  })
  if (!acknowledgmentRequired) {
    clearGoogleAcknowledgment(db, purchaseToken).catch((error) => {
      console.error('[iap] Google acknowledgment cleanup failed:', error.message)
    })
    return entitlement
  }
  try {
    await acknowledgePurchase({ purchase, product, purchaseToken })
    await clearGoogleAcknowledgment(db, purchaseToken)
    return entitlement
  } catch (error) {
    await recordGoogleAcknowledgmentFailure(db, purchaseToken, error, {
      incrementAttempt: true,
      attempts: 1,
    }).catch((recordError) => {
      console.error('[iap] Google acknowledgment retry update failed:', recordError.message)
    })
    console.error('[iap] Google purchase is entitled but acknowledgment is pending:', error.message)
    return { ...entitlement, finalizationPending: true }
  }
}

async function accountForStoreEvent(db, provider, externalIds, storeAccountId) {
  if (storeAccountId) {
    const { rows } = await db.query(
      `SELECT id FROM account WHERE id = $1 AND deleting_at IS NULL`,
      [storeAccountId],
    )
    if (rows.length) return rows[0].id
  }
  return existingOwner(db, provider, externalIds)
}

function googlePushConfiguration() {
  const audience = String(process.env.GOOGLE_RTDN_AUDIENCE || '').trim()
  const expectedEmail = String(process.env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL || '').trim().toLowerCase()
  if (!audience || !expectedEmail) {
    throw new IapError(503, 'GOOGLE_RTDN_NOT_CONFIGURED', 'Google Play notifications are not configured.')
  }
  return { audience, expectedEmail }
}

async function verifyGooglePush(req) {
  const { audience, expectedEmail } = googlePushConfiguration()
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) throw new IapError(401, 'GOOGLE_RTDN_UNAUTHORIZED', 'The Google notification is not authenticated.')
  let ticket
  try {
    ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience })
  } catch {
    throw new IapError(401, 'GOOGLE_RTDN_UNAUTHORIZED', 'The Google notification is not authenticated.')
  }
  const actualEmail = String(ticket.getPayload()?.email || '').trim().toLowerCase()
  if (actualEmail !== expectedEmail) {
    throw new IapError(401, 'GOOGLE_RTDN_UNAUTHORIZED', 'The Google notification identity is not allowed.')
  }
}

function requireAccount(req) {
  if (!req.identity?.account) {
    throw new IapError(401, 'ACCOUNT_REQUIRED', 'Create or link your Operator account first.')
  }
  return req.identity.account
}

function storeCapabilities(env = process.env) {
  const capabilities = capabilityChecks(env)
  return { apple: capabilities.apple_iap, google: capabilities.google_iap }
}

function requireStoreCapability(platform) {
  const capabilities = storeCapabilities()
  if (platform === 'ios' && capabilities.apple) return
  if (platform === 'android' && capabilities.google) return
  throw new IapError(503, 'STORE_DISABLED', 'In-app purchases are not enabled in this release yet.')
}

function mount(app, db) {
  const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
  if (storeCapabilities().google) startGoogleAcknowledgmentWorker(db)

  app.get('/v1/iap/catalog', (_req, res) => {
    const capabilities = storeCapabilities()
    res.json({
      enabled: capabilities.apple || capabilities.google,
      providers: capabilities,
      products: catalog.products.filter(() => capabilities.apple || capabilities.google).map((product) => ({
        ...product,
        label: PLANS[product.plan].label,
        studiesPerMonth: PLANS[product.plan].studiesPerMonth,
        billingInterval: PLANS[product.plan].billingInterval,
      })),
    })
  })

  app.post('/v1/iap/verify', route(async (req, res) => {
    const account = requireAccount(req)
    const restoring = Boolean(req.body?.restoring)
    let entitlement
    if (req.body?.platform === 'ios') {
      requireStoreCapability('ios')
      const verified = await verifiedAppleTransaction(req.body?.jwsRepresentation)
      entitlement = await applyAppleTransaction(db, {
        ...verified,
        accountId: account.id,
        restoring,
      })
    } else if (req.body?.platform === 'android') {
      requireStoreCapability('android')
      const verified = await verifiedGooglePurchase(req.body?.purchaseToken)
      entitlement = await applyGooglePurchase(db, {
        ...verified,
        accountId: account.id,
        restoring,
      })
    } else {
      throw new IapError(400, 'STORE_PLATFORM_REQUIRED', 'Choose the App Store or Google Play purchase source.')
    }
    res.json({ ok: true, entitlement })
  }))

  app.post('/v1/iap/apple/notifications', route(async (req, res) => {
    requireStoreCapability('ios')
    const signedPayload = req.body?.signedPayload
    const { verifier, environment } = appleVerifierFor(signedPayload)
    const notification = await verifier.verifyAndDecodeNotification(signedPayload)
    const signedTransaction = notification.data?.signedTransactionInfo
    if (!signedTransaction) return res.status(204).end()
    const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction)
    const product = appleProductFor(transaction.productId)
    if (!product) return res.status(204).end()
    const externalId = transaction.originalTransactionId || transaction.transactionId
    const accountId = await accountForStoreEvent(
      db,
      'apple',
      [externalId],
      transaction.appAccountToken,
    )
    if (!accountId) return res.status(204).end()
    await applyAppleTransaction(db, {
      transaction,
      product,
      environment,
      accountId,
      notificationType: notification.notificationType || null,
      subtype: notification.subtype || null,
      notificationId: notification.notificationUUID || null,
      notificationSignedDate: notification.signedDate || null,
      restoring: true,
    })
    res.status(204).end()
  }))

  app.post('/v1/iap/google/notifications', route(async (req, res) => {
    requireStoreCapability('android')
    await verifyGooglePush(req)
    let event
    try {
      event = JSON.parse(Buffer.from(String(req.body?.message?.data || ''), 'base64').toString('utf8'))
    } catch {
      throw new IapError(400, 'GOOGLE_RTDN_INVALID', 'The Google Play notification body is invalid.')
    }
    if (event.packageName !== catalog.androidPackage) {
      throw new IapError(400, 'GOOGLE_RTDN_INVALID', 'The Google Play notification is for another app.')
    }
    const purchaseToken = event.subscriptionNotification?.purchaseToken
    if (!purchaseToken) return res.status(204).end()
    const verified = await verifiedGooglePurchase(purchaseToken)
    const storeAccountId = verified.purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId || null
    const accountId = await accountForStoreEvent(
      db,
      'google',
      [purchaseToken, verified.purchase.linkedPurchaseToken],
      storeAccountId,
    )
    if (!accountId) return res.status(204).end()
    await applyGooglePurchase(db, {
      ...verified,
      accountId,
      restoring: true,
      eventTimeMillis: event.eventTimeMillis || null,
    })
    res.status(204).end()
  }))
}

function errorMiddleware(error, _req, res, next) {
  if (error instanceof billing.BillingError) {
    return res.status(error.status).json({ error: error.code, message: error.message })
  }
  if (!(error instanceof IapError)) return next(error)
  res.status(error.status).json({ error: error.code, message: error.message, ...error.details })
}

module.exports = {
  IapError,
  catalog,
  appleProductFor,
  googleProductFor,
  googleProductForLineItem,
  decodeJwsPayload,
  appleStatus,
  googleStatus,
  providerEventRank,
  latestEventTimestamp,
  googleProviderEventTimestamp,
  assertStoreEnvironmentAllowed,
  verifiedAppleTransaction,
  verifiedGooglePurchase,
  acknowledgeGooglePurchase,
  googleAcknowledgmentRequired,
  processGoogleAcknowledgmentOutbox,
  applyAppleTransaction,
  applyGooglePurchase,
  assertPurchaseOwner,
  googlePushConfiguration,
  storeCapabilities,
  mount,
  errorMiddleware,
}
