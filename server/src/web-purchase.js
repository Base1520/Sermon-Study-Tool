const crypto = require('crypto')
const { PLANS, PAID_PLAN_KEYS } = require('./entitlement')

const WEB_PLAN_KEYS = [...PAID_PLAN_KEYS]
const OPEN_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])
const DOWNLOAD_CONSENT_VERSION = 'operator-download-v1'
const DOWNLOAD_ASSETS = Object.freeze({
  'mac-apple-silicon': 'https://github.com/Base1520/Sermon-Study-Tool/releases/latest/download/The-Operator-mac-apple-silicon.dmg',
  'mac-intel': 'https://github.com/Base1520/Sermon-Study-Tool/releases/latest/download/The-Operator-mac-intel.dmg',
  windows: 'https://github.com/Base1520/Sermon-Study-Tool/releases/latest/download/The-Operator-windows.exe',
})

function preferredSubscription(subscriptions) {
  const rank = { active: 5, trialing: 5, past_due: 4, unpaid: 4, paused: 3, incomplete: 2, canceled: 1, incomplete_expired: 0 }
  return [...subscriptions].sort((left, right) =>
    (rank[right.status] ?? 0) - (rank[left.status] ?? 0) || (right.created ?? 0) - (left.created ?? 0))[0]
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null
  return email
}

function normalizeDownloadEmail(value) {
  const email = normalizeEmail(value)
  return email && !email.endsWith('.invalid') ? email : null
}

function webPlan(value) {
  const key = String(value || '').trim().toLowerCase()
  return WEB_PLAN_KEYS.includes(key) ? { key, ...PLANS[key] } : null
}

function downloadAsset(value) {
  const platform = String(value || '').trim().toLowerCase()
  const url = DOWNLOAD_ASSETS[platform]
  return url ? { platform, url } : null
}

function optedIntoMarketing(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

function generatePurchaseCode() {
  const raw = crypto.randomBytes(12).toString('hex').toUpperCase()
  return `BUY-${raw.match(/.{1,4}/g).join('-')}`
}

function isPurchaseCode(value) {
  return /^BUY-(?:[A-F0-9]{4}-){5}[A-F0-9]{4}$/.test(String(value || '').trim().toUpperCase())
}

function hashPurchaseCode(value) {
  return crypto.createHash('sha256').update(String(value || '').trim().toUpperCase()).digest('hex')
}

async function claimPurchasedAccount(db, { code, installId }) {
  if (!isPurchaseCode(code) || !installId) return null
  const { rows } = await db.query(
    `UPDATE account
        SET purchase_redeemed_install_id = COALESCE(purchase_redeemed_install_id, $2),
            install_id = $2
      WHERE purchase_code_hash = $1
        AND status = 'active'
        AND plan = ANY($3::text[])
        AND (purchase_redeemed_install_id IS NULL OR purchase_redeemed_install_id = $2)
      RETURNING id, email, plan, status`,
    [hashPurchaseCode(code), installId, WEB_PLAN_KEYS],
  )
  return rows[0] || null
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function shell({ title, eyebrow, body, script = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)} · The Operator</title>
  <style>
    :root{--gold:#e5be49;--army:#283517;--field:#0d0d0d;--card:#171717;--edge:#2c2c2c;--text:#e8e8e8;--muted:#9a9a9a}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 0,#1b2613 0,#0d0d0d 45%);color:var(--text);font-family:Inter,system-ui,sans-serif;min-height:100vh;padding:28px}
    main{width:min(760px,100%);margin:5vh auto;background:rgba(23,23,23,.96);border:1px solid var(--edge);border-top:4px solid var(--gold);border-radius:14px;padding:clamp(26px,6vw,54px);box-shadow:0 24px 70px rgba(0,0,0,.45)}
    .eyebrow{color:var(--gold);font:700 11px/1.4 Saira,system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;margin-bottom:12px}
    h1,h2{font-family:Saira,system-ui,sans-serif;text-transform:uppercase;color:#fff;letter-spacing:.02em}h1{font-size:clamp(30px,6vw,48px);line-height:1.05;margin:0 0 16px}h2{font-size:19px;margin:30px 0 10px}
    p{font-size:16px;line-height:1.7;color:#c9c9c9}.code{font:700 clamp(15px,3vw,22px)/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.07em;color:var(--gold);background:#0d0d0d;border:1px solid rgba(229,190,73,.45);padding:18px;border-radius:8px;text-align:center;overflow-wrap:anywhere;margin:18px 0 12px}
    .actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.button{display:inline-block;border-radius:6px;padding:14px 20px;text-decoration:none;text-transform:uppercase;letter-spacing:.06em;font:700 13px Saira,system-ui,sans-serif;border:1px solid var(--gold);cursor:pointer}.primary{background:var(--gold);color:#111}.secondary{background:transparent;color:var(--gold)}
    .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:24px}.step{background:#10120f;border:1px solid var(--edge);border-radius:8px;padding:16px}.step b{display:block;color:#fff;font:700 13px Saira,system-ui,sans-serif;text-transform:uppercase;margin-bottom:6px}.step span{color:var(--muted);font-size:13px;line-height:1.5}
    .fine{font-size:13px;color:var(--muted)}a{color:var(--gold)}@media(max-width:680px){body{padding:12px}main{margin:2vh auto;padding:26px 20px}.steps{grid-template-columns:1fr}.actions{display:grid}.button{text-align:center}}
  </style>
</head>
<body><main><div class="eyebrow">${escapeHtml(eyebrow)}</div>${body}</main>${script}</body>
</html>`
}

function renderPurchaseComplete({ code, plan, email, redeemed = false }) {
  const safeCode = escapeHtml(code)
  const safeEmail = escapeHtml(email)
  const safeLabel = escapeHtml(plan.label)
  const body = redeemed
    ? `<h1>Your ${safeLabel} plan is active</h1>
       <p>This purchase has already been activated on a computer. Open The Operator there and keep studying. If you changed computers, email <a href="mailto:cole@base1520.com">cole@base1520.com</a> and we will move it.</p>`
    : `<h1>Your ${safeLabel} plan is active</h1>
       <p>Stripe confirmed the subscription for <strong>${safeEmail}</strong>. One last step connects it to The Operator.</p>
       <h2>Your one-time activation code</h2>
       <div class="code" id="purchase-code">${safeCode}</div>
       <button class="button secondary" id="copy-code" type="button">Copy activation code</button>
       <div class="steps">
         <div class="step"><b>01 · Download</b><span>Install The Operator if it is not already on this computer.</span></div>
         <div class="step"><b>02 · Open Settings</b><span>Open <strong>Your Access</strong> inside the app.</span></div>
         <div class="step"><b>03 · Paste</b><span>Paste this code once. Your plan activates immediately.</span></div>
       </div>
       <p class="fine">The code works on one computer and can be retried on that same computer. Keep this page open until the app says your subscription is active.</p>
       <div class="actions">
         <a class="button primary" href="https://github.com/Base1520/Sermon-Study-Tool/releases/latest/download/The-Operator-mac-apple-silicon.dmg">Download for Mac</a>
         <a class="button secondary" href="https://github.com/Base1520/Sermon-Study-Tool/releases/latest/download/The-Operator-windows.exe">Download for Windows</a>
       </div>`
  const script = redeemed ? '' : `<script>
    document.getElementById('copy-code').addEventListener('click',async function(){
      await navigator.clipboard.writeText(document.getElementById('purchase-code').textContent.trim());
      this.textContent='Copied';
    });
  </script>`
  return shell({ title: 'Purchase complete', eyebrow: 'BASE 1520 · The Operator', body, script })
}

function renderPurchaseMessage({ title, message, status = 'Return to The Operator' }) {
  return shell({
    title,
    eyebrow: 'BASE 1520 · The Operator',
    body: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><div class="actions"><a class="button primary" href="https://www.base1520.com/operator/">${escapeHtml(status)}</a></div>`,
  })
}

const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

function apiOriginFor(req, configuredOrigin) {
  if (configuredOrigin) return configuredOrigin.replace(/\/$/, '')
  const host = String(req.get('host') || '')
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) return `${req.protocol}://${host}`
  return 'https://api-production-15e5e.up.railway.app'
}

function mountWebPurchase(app, db, stripeClient, syncCustomerFn, options = {}) {
  app.post('/v1/download', route(async (req, res) => {
    if (String(req.body?.company || '').trim()) {
      return res.status(400).type('html').send(renderPurchaseMessage({
        title: 'Download could not start',
        message: 'Return to The Operator page and try again.',
      }))
    }

    const email = normalizeDownloadEmail(req.body?.email)
    const asset = downloadAsset(req.body?.platform)
    if (!email || !asset) {
      return res.status(400).type('html').send(renderPurchaseMessage({
        title: 'Check the download details',
        message: 'Enter a valid email address and choose a supported installer.',
      }))
    }

    const marketingOptIn = optedIntoMarketing(req.body?.marketing_opt_in)
    try {
      await db.query(
        `INSERT INTO download_lead
              (email, source, last_platform, marketing_opt_in, consent_version)
              VALUES ($1, 'operator-website', $2, $3, $4)
         ON CONFLICT (email) DO UPDATE
                SET last_platform = EXCLUDED.last_platform,
                    marketing_opt_in = download_lead.marketing_opt_in OR EXCLUDED.marketing_opt_in,
                    consent_version = CASE
                      WHEN EXCLUDED.marketing_opt_in THEN EXCLUDED.consent_version
                      ELSE download_lead.consent_version
                    END,
                    download_count = download_lead.download_count + 1,
                    last_downloaded_at = now()`,
        [email, asset.platform, marketingOptIn, marketingOptIn ? DOWNLOAD_CONSENT_VERSION : null],
      )
    } catch (error) {
      console.error('[download] lead capture failed:', error.message)
    }

    res.set('Cache-Control', 'no-store')
    res.redirect(303, asset.url)
  }))

  app.get('/v1/download-leads', route(async (req, res) => {
    if (!req.identity?.account?.isAdmin) {
      return res.status(403).json({ error: 'FORBIDDEN' })
    }
    const limit = Math.min(Number(req.query?.limit) || 250, 1000)
    const { rows } = await db.query(
      `SELECT email, source, last_platform, marketing_opt_in, consent_version,
              download_count, first_downloaded_at, last_downloaded_at
         FROM download_lead
        ORDER BY last_downloaded_at DESC
        LIMIT $1`,
      [limit],
    )
    res.json({ leads: rows })
  }))

  app.post('/v1/web-checkout', route(async (req, res) => {
    if (String(req.body?.company || '').trim()) {
      return res.status(400).type('html').send(renderPurchaseMessage({
        title: 'Checkout could not start',
        message: 'Return to The Operator page and try again.',
      }))
    }

    const plan = webPlan(req.body?.plan)
    const email = normalizeEmail(req.body?.email)
    if (!plan || !email) {
      return res.status(400).type('html').send(renderPurchaseMessage({
        title: 'Check the purchase details',
        message: 'Choose a plan and enter a valid email address.',
      }))
    }
    const priceId = options.prices?.[plan.key]
    if (!priceId) {
      return res.status(503).type('html').send(renderPurchaseMessage({
        title: 'This plan is not available yet',
        message: 'The payment configuration is incomplete. Contact Cole before trying again.',
      }))
    }

    const existingResult = await db.query(
      `SELECT id, stripe_customer_id, stripe_subscription_id, status
         FROM account WHERE lower(email) = $1
         ORDER BY created_at DESC LIMIT 1`,
      [email],
    )
    const existing = existingResult.rows[0] || null
    let customerId = existing?.stripe_customer_id || null

    if (customerId) {
      const subscriptions = await stripeClient.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
      if (subscriptions.data.some((subscription) => OPEN_SUBSCRIPTION_STATUSES.has(subscription.status))) {
        return res.status(409).type('html').send(renderPurchaseMessage({
          title: 'This email already has an active plan',
          message: 'Open The Operator and use Settings → Your Access. If you changed computers, contact Cole and we will reconnect it without charging you twice.',
        }))
      }
    } else {
      const customer = await stripeClient.customers.create({ email, metadata: { source: 'operator-website' } })
      customerId = customer.id
    }

    const code = generatePurchaseCode()
    const codeHash = hashPurchaseCode(code)
    if (existing) {
      await db.query(
        `UPDATE account
            SET stripe_customer_id = $2,
                purchase_code_hash = $3,
                purchase_redeemed_install_id = NULL
          WHERE id = $1`,
        [existing.id, customerId, codeHash],
      )
    } else {
      await db.query(
        `INSERT INTO account (email, stripe_customer_id, purchase_code_hash)
              VALUES ($1, $2, $3)`,
        [email, customerId, codeHash],
      )
    }

    const session = await stripeClient.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: code,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${apiOriginFor(req, options.apiOrigin)}/purchase/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: options.cancelUrl || 'https://www.base1520.com/operator/?checkout=cancelled',
      allow_promotion_codes: true,
      metadata: { source: 'operator-website', plan: plan.key },
      subscription_data: { metadata: { source: 'operator-website', plan: plan.key } },
    })
    res.redirect(303, session.url)
  }))

  app.get('/purchase/complete', route(async (req, res) => {
    const sessionId = String(req.query?.session_id || '')
    if (!sessionId) {
      return res.status(400).type('html').send(renderPurchaseMessage({
        title: 'Purchase not found',
        message: 'The checkout reference is missing. Contact Cole if Stripe charged you.',
      }))
    }

    const session = await stripeClient.checkout.sessions.retrieve(sessionId)
    if (session.mode !== 'subscription' || session.metadata?.source !== 'operator-website') {
      return res.status(404).type('html').send(renderPurchaseMessage({
        title: 'Purchase not found',
        message: 'This checkout does not belong to The Operator website.',
      }))
    }

    const code = String(session.client_reference_id || '')
    const state = await syncCustomerFn(db, String(session.customer), stripeClient)
    if (state.status !== 'active') {
      return res.status(409).type('html').send(renderPurchaseMessage({
        title: 'Stripe is still confirming the purchase',
        message: 'Wait a moment and reload this page. If it still does not clear, contact Cole before starting another checkout.',
        status: 'Return to the plan page',
      }))
    }

    const codeHash = hashPurchaseCode(code)
    const accountResult = await db.query(
      `UPDATE account
          SET purchase_code_hash = CASE
                WHEN purchase_redeemed_install_id IS NULL THEN $2
                ELSE purchase_code_hash
              END
        WHERE stripe_customer_id = $1
        RETURNING email, plan, status, purchase_code_hash, purchase_redeemed_install_id`,
      [String(session.customer), codeHash],
    )
    const account = accountResult.rows[0]
    if (!account || account.purchase_code_hash !== codeHash) {
      return res.status(409).type('html').send(renderPurchaseMessage({
        title: 'This purchase is already connected',
        message: 'Another activation is already attached to this subscription. Contact Cole before starting another checkout.',
        status: 'Return to the plan page',
      }))
    }

    res.type('html').send(renderPurchaseComplete({
      code,
      plan: PLANS[state.plan],
      email: account.email,
      redeemed: Boolean(account.purchase_redeemed_install_id),
    }))
  }))
}

module.exports = {
  WEB_PLAN_KEYS,
  OPEN_SUBSCRIPTION_STATUSES,
  preferredSubscription,
  normalizeEmail,
  normalizeDownloadEmail,
  webPlan,
  downloadAsset,
  optedIntoMarketing,
  generatePurchaseCode,
  isPurchaseCode,
  hashPurchaseCode,
  claimPurchasedAccount,
  renderPurchaseComplete,
  renderPurchaseMessage,
  mountWebPurchase,
}
