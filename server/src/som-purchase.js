const crypto = require('crypto')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { normalizeEmail, optedIntoMarketing } = require('./web-purchase')
const { stageMarketingSync, syncMarketingContact } = require('./mailchimp')

const SOM_SOURCE = 'som-digital-early-access'
const SOM_CONSENT_VERSION = 'som-digital-v1'
const DOWNLOAD_TOKEN_TTL_SECONDS = 24 * 60 * 60
const PRESIGNED_URL_TTL_SECONDS = 15 * 60
const DEFAULT_OBJECT_KEY = 'the-spiritual-operators-manual-2026-08-06.pdf'
const DEFAULT_FILENAME = "The Spiritual Operator's Manual — Cole Permenter.pdf"

const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function apiOriginFor(req, configuredOrigin) {
  if (configuredOrigin) return configuredOrigin.replace(/\/$/, '')
  const host = String(req.get('host') || '')
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) return `${req.protocol}://${host}`
  return 'https://api-production-15e5e.up.railway.app'
}

function objectId(value) {
  if (!value) return null
  return typeof value === 'string' ? value : value.id || null
}

function sessionEmail(session) {
  return normalizeEmail(
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.email,
  )
}

function isPaidSomSession(session) {
  if (
    session?.mode !== 'payment' ||
    session?.metadata?.source !== SOM_SOURCE ||
    session?.status !== 'complete'
  ) return false
  if (session.payment_status === 'paid') return true
  return session.payment_status === 'no_payment_required' && Number(session.amount_total) === 0
}

async function recordSomPurchase(db, session) {
  if (!isPaidSomSession(session)) return null
  const email = sessionEmail(session)
  if (!email) return null
  const marketingOptIn = optedIntoMarketing(session.metadata?.marketing_opt_in)
  const { rows } = await db.query(
    `INSERT INTO som_purchase
          (session_id, email, stripe_customer_id, payment_intent_id,
           amount_total, currency, status, source, marketing_opt_in, consent_version)
          VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7, $8, $9)
     ON CONFLICT (session_id) DO UPDATE
            SET email = EXCLUDED.email,
                stripe_customer_id = EXCLUDED.stripe_customer_id,
                payment_intent_id = EXCLUDED.payment_intent_id,
                amount_total = EXCLUDED.amount_total,
                currency = EXCLUDED.currency,
                status = CASE WHEN som_purchase.status = 'refunded' THEN 'refunded' ELSE 'paid' END,
                marketing_opt_in = som_purchase.marketing_opt_in OR EXCLUDED.marketing_opt_in,
                consent_version = CASE
                  WHEN EXCLUDED.marketing_opt_in THEN EXCLUDED.consent_version
                  ELSE som_purchase.consent_version
                END,
                updated_at = now()
     RETURNING session_id, email, status, amount_total, currency, download_count, purchased_at`,
    [
      session.id,
      email,
      objectId(session.customer),
      objectId(session.payment_intent),
      Number(session.amount_total) || 0,
      String(session.currency || 'usd').toLowerCase(),
      SOM_SOURCE,
      marketingOptIn,
      marketingOptIn ? SOM_CONSENT_VERSION : null,
    ],
  )
  return rows[0] || null
}

/**
 * Push an opted-in SOM buyer into the marketing audience (Mailchimp), tagged as a book buyer.
 * Best-effort and idempotent: staging records the intent under an advisory lock, then
 * syncMarketingContact PUTs the member by email hash and no-ops when Mailchimp is unconfigured.
 * It never throws into the webhook — a mail outage must not fail paid fulfilment. Returns a
 * small status object for tests/logging.
 */
async function syncSomBuyerMarketing(db, purchase, session) {
  if (!purchase || purchase.status !== 'paid') return { synced: false, reason: 'not-paid' }
  if (!optedIntoMarketing(session?.metadata?.marketing_opt_in)) return { synced: false, reason: 'no-opt-in' }
  const email = purchase.email
  if (!email) return { synced: false, reason: 'no-email' }
  const intentId = crypto.randomUUID()
  try {
    // Stage the sync intent inside a short transaction so the advisory lock is held across
    // both statements, exactly as account registration does.
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await stageMarketingSync(client, email, intentId)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
    return await syncMarketingContact(db, email, {
      intentId,
      tags: ['SOM Buyer', "The Spiritual Operator's Manual"],
      status: 'subscribed', // single opt-in — they explicitly consented at a paid checkout
    })
  } catch (error) {
    console.error('[mailchimp] SOM buyer sync failed:', error?.message || error)
    return { synced: false, error: true }
  }
}

async function markSomPurchaseRefunded(db, charge) {
  const paymentIntentId = objectId(charge?.payment_intent)
  if (!paymentIntentId || charge?.refunded !== true) return false
  const result = await db.query(
    `UPDATE som_purchase
        SET status = 'refunded', updated_at = now()
      WHERE payment_intent_id = $1 AND status <> 'refunded'`,
    [paymentIntentId],
  )
  return result.rowCount > 0
}

function signingSecret(options = {}) {
  return options.signingSecret || process.env.SOM_DOWNLOAD_SIGNING_SECRET || ''
}

function createDownloadToken(sessionId, secret, now = Date.now()) {
  if (!secret || secret.length < 32) throw new Error('SOM download signing secret is not configured')
  const payload = Buffer.from(JSON.stringify({
    sessionId,
    expiresAt: Math.floor(now / 1000) + DOWNLOAD_TOKEN_TTL_SECONDS,
  })).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyDownloadToken(token, secret, now = Date.now()) {
  if (!secret || secret.length < 32) return null
  const [payload, suppliedSignature, extra] = String(token || '').split('.')
  if (!payload || !suppliedSignature || extra) return null
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  const suppliedBuffer = Buffer.from(suppliedSignature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!parsed.sessionId || Number(parsed.expiresAt) < Math.floor(now / 1000)) return null
    return parsed
  } catch {
    return null
  }
}

function storageOptions(options = {}) {
  return {
    endpoint: options.bucketEndpoint || process.env.BUCKET_ENDPOINT,
    accessKeyId: options.bucketAccessKeyId || process.env.BUCKET_ACCESS_KEY_ID,
    secretAccessKey: options.bucketSecretAccessKey || process.env.BUCKET_SECRET_ACCESS_KEY,
    bucket: options.bucketName || process.env.BUCKET_NAME,
    objectKey: options.objectKey || process.env.SOM_OBJECT_KEY || DEFAULT_OBJECT_KEY,
  }
}

async function createStorageDownloadUrl(options = {}) {
  const storage = storageOptions(options)
  if (!storage.endpoint || !storage.accessKeyId || !storage.secretAccessKey || !storage.bucket) {
    throw new Error('SOM private storage is not configured')
  }
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: storage.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
    },
  })
  const command = new GetObjectCommand({
    Bucket: storage.bucket,
    Key: storage.objectKey,
    ResponseContentType: 'application/pdf',
    ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(DEFAULT_FILENAME)}`,
  })
  return getSignedUrl(client, command, { expiresIn: PRESIGNED_URL_TTL_SECONDS })
}

function pageShell({ title, eyebrow, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)} · BASE 1520</title>
  <style>
    :root{--gold:#e5be49;--field:#0d0d0d;--card:#171717;--edge:#333;--text:#efefef;--muted:#aaa}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;padding:24px;background:radial-gradient(circle at 50% 0,#283517 0,#0d0d0d 44%);color:var(--text);font-family:Inter,system-ui,sans-serif}
    main{width:min(760px,100%);margin:5vh auto;padding:clamp(26px,6vw,56px);background:rgba(23,23,23,.97);border:1px solid var(--edge);border-top:4px solid var(--gold);border-radius:14px;box-shadow:0 28px 80px rgba(0,0,0,.5)}
    .eyebrow{margin-bottom:12px;color:var(--gold);font:700 11px/1.4 Saira,system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase}
    h1,h2{margin:0;color:#fff;font-family:Saira,system-ui,sans-serif;text-transform:uppercase}h1{font-size:clamp(32px,7vw,54px);line-height:1.02}h2{margin-top:30px;font-size:20px}
    p{color:#d1d1d1;font-size:17px;line-height:1.7}.receipt{margin:24px 0;padding:18px;background:#10120f;border:1px solid #354122;border-radius:8px}.receipt strong{color:#fff}
    .button{display:inline-block;margin-top:18px;padding:16px 23px;border:1px solid var(--gold);border-radius:6px;background:var(--gold);color:#111;text-decoration:none;text-transform:uppercase;letter-spacing:.06em;font:800 13px Saira,system-ui,sans-serif}.fine{color:var(--muted);font-size:13px}a{color:var(--gold)}
    @media(max-width:620px){body{padding:10px}main{margin:2vh auto;padding:28px 20px}.button{display:block;text-align:center}}
  </style>
</head>
<body><main><div class="eyebrow">${escapeHtml(eyebrow)}</div>${body}</main></body>
</html>`
}

function renderSomPurchaseComplete({ email, token }) {
  return pageShell({
    title: 'Your manual is ready',
    eyebrow: 'BASE 1520 · Digital Early Access',
    body: `<h1>Your manual is ready.</h1>
      <p>Stripe confirmed the purchase for <strong>${escapeHtml(email)}</strong>. This is the complete 287-page digital edition of <em>The Spiritual Operator's Manual</em>.</p>
      <div class="receipt"><strong>Download it now.</strong><br>The link below creates a private, short-lived file link. Save the PDF somewhere you can find it.</div>
      <a class="button" href="/v1/som/download?token=${encodeURIComponent(token)}">Download the full PDF</a>
      <h2>What comes next</h2>
      <p>The paperback and Kindle editions launch in October. Your digital copy is available now so you can begin working the COVENANT method before launch week.</p>
      <p class="fine">Your download access is tied to this paid checkout. If the link expires before you save the file, return to this receipt page or email <a href="mailto:cole@base1520.com">cole@base1520.com</a>.</p>`,
  })
}

function renderSomMessage({ title, message, status = 400 }) {
  return {
    status,
    html: pageShell({
      title,
      eyebrow: 'BASE 1520 · Spiritual Operator\'s Manual',
      body: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="button" href="https://www.base1520.com/spiritual-operators-manual/">Return to the manual</a>`,
    }),
  }
}

function mountSomPurchase(app, db, stripeClient, options = {}) {
  app.post('/v1/som/checkout', route(async (req, res) => {
    if (String(req.body?.company || '').trim()) {
      const message = renderSomMessage({ title: 'Checkout could not start', message: 'Return to the manual page and try again.' })
      return res.status(message.status).type('html').send(message.html)
    }
    const email = normalizeEmail(req.body?.email)
    if (!email) {
      const message = renderSomMessage({ title: 'Check your email', message: 'Enter a valid email address so the purchase and download can be recovered.' })
      return res.status(message.status).type('html').send(message.html)
    }
    const priceId = options.priceId || process.env.STRIPE_PRICE_SOM_DIGITAL
    if (!priceId) {
      const message = renderSomMessage({ title: 'Digital checkout is not ready', message: 'The payment configuration is incomplete. Contact Cole before trying again.', status: 503 })
      return res.status(message.status).type('html').send(message.html)
    }
    const marketingOptIn = optedIntoMarketing(req.body?.marketing_opt_in)
    const metadata = {
      source: SOM_SOURCE,
      email,
      marketing_opt_in: marketingOptIn ? 'true' : 'false',
      consent_version: marketingOptIn ? SOM_CONSENT_VERSION : '',
    }
    const session = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      customer_creation: 'always',
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${apiOriginFor(req, options.apiOrigin)}/som/purchase/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: options.cancelUrl || 'https://www.base1520.com/spiritual-operators-manual/?checkout=cancelled',
      allow_promotion_codes: true,
      metadata,
      payment_intent_data: { metadata },
    })
    res.redirect(303, session.url)
  }))

  app.get('/som/purchase/complete', route(async (req, res) => {
    const sessionId = String(req.query?.session_id || '')
    if (!sessionId) {
      const message = renderSomMessage({ title: 'Purchase not found', message: 'The Stripe checkout reference is missing. Contact Cole if you were charged.' })
      return res.status(message.status).type('html').send(message.html)
    }
    const session = await stripeClient.checkout.sessions.retrieve(sessionId)
    if (!isPaidSomSession(session)) {
      const message = renderSomMessage({ title: 'Payment is not complete', message: 'Stripe has not confirmed this purchase. Wait a moment and reload before starting another checkout.', status: 409 })
      return res.status(message.status).type('html').send(message.html)
    }
    const purchase = await recordSomPurchase(db, session)
    if (!purchase || purchase.status !== 'paid') {
      const message = renderSomMessage({ title: 'Download unavailable', message: 'This order is not eligible for download. Contact Cole if that is unexpected.', status: 403 })
      return res.status(message.status).type('html').send(message.html)
    }
    const token = createDownloadToken(session.id, signingSecret(options))
    res.set('Cache-Control', 'no-store')
    res.type('html').send(renderSomPurchaseComplete({ email: purchase.email, token }))
  }))

  app.get('/v1/som/download', route(async (req, res) => {
    const parsed = verifyDownloadToken(req.query?.token, signingSecret(options))
    if (!parsed) {
      const message = renderSomMessage({ title: 'Download link expired', message: 'Return to your Stripe receipt page or contact Cole for a fresh private link.', status: 403 })
      return res.status(message.status).type('html').send(message.html)
    }
    const { rows } = await db.query(
      `SELECT session_id, email, status
         FROM som_purchase
        WHERE session_id = $1 AND status = 'paid'`,
      [parsed.sessionId],
    )
    if (!rows[0]) {
      const message = renderSomMessage({ title: 'Download unavailable', message: 'No active paid order matches this link. Contact Cole if the order should still be active.', status: 403 })
      return res.status(message.status).type('html').send(message.html)
    }
    const downloadUrlFn = options.createDownloadUrl || createStorageDownloadUrl
    const downloadUrl = await downloadUrlFn(options)
    await db.query(
      `UPDATE som_purchase
          SET download_count = download_count + 1,
              last_downloaded_at = now(),
              updated_at = now()
        WHERE session_id = $1`,
      [parsed.sessionId],
    )
    res.set('Cache-Control', 'no-store')
    res.redirect(303, downloadUrl)
  }))

  app.get('/v1/som/purchases', route(async (req, res) => {
    if (!req.identity?.account?.isAdmin) return res.status(403).json({ error: 'FORBIDDEN' })
    const requestedLimit = Number(req.query?.limit)
    const limit = Math.min(Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 250, 1000)
    const { rows } = await db.query(
      `SELECT session_id, email, amount_total, currency, status, source,
              marketing_opt_in, consent_version, download_count,
              purchased_at, last_downloaded_at
         FROM som_purchase
        ORDER BY purchased_at DESC
        LIMIT $1`,
      [limit],
    )
    res.json({ purchases: rows })
  }))
}

module.exports = {
  SOM_SOURCE,
  SOM_CONSENT_VERSION,
  isPaidSomSession,
  recordSomPurchase,
  syncSomBuyerMarketing,
  markSomPurchaseRefunded,
  createDownloadToken,
  verifyDownloadToken,
  createStorageDownloadUrl,
  renderSomPurchaseComplete,
  renderSomMessage,
  mountSomPurchase,
}
