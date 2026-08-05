/**
 * index.js — The Operator API.
 *
 * Two routes that spend money, and everything else is bookkeeping. Deliberately
 * small: every endpoint that exists is one that has to be metered, rate-limited
 * and reasoned about, so anything not needed is a liability.
 *
 * STREAMING. A study runs about 163 seconds and up to ~270 on the retry path.
 * Sections are streamed as newline-delimited JSON rather than SSE — the client
 * is Electron, which reads a chunked body directly, and NDJSON survives proxies
 * that quietly buffer text/event-stream. compression() is NOT applied to the
 * streaming route; it is the single most common way a working stream silently
 * becomes a two-minute stare.
 */

const express = require('express')
const { Pool } = require('pg')

const auth = require('./auth')
const { entitlementFor, upgradePrompt, PLANS } = require('./entitlement')
const meter = require('./meter')
const engine = require('./engine')

const db = new Pool({ connectionString: process.env.DATABASE_URL })
const app = express()
app.set('trust proxy', 1)
app.use(express.json({ limit: '256kb' }))   // a passage is small; anything larger is abuse
app.use(auth.middleware(db))

const period = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() }
}

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1')
    res.json({ ok: true })
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message })
  }
})

// ── Who am I and what may I do ──────────────────────────────────────────────
// The client calls this on launch to decide what to show. It never 401s.
app.get('/v1/me', async (req, res) => {
  const ent = entitlementFor(req.identity.account)
  const { periodStart } = period()
  let used = 0
  if (req.identity.account) {
    const { rows } = await db.query(
      `SELECT studies_used FROM usage_period WHERE account_id = $1 AND period_start = $2`,
      [req.identity.account.id, periodStart],
    )
    used = rows[0]?.studies_used ?? 0
  }
  res.json({
    anonymous: req.identity.anonymous,
    email: req.identity.account?.email ?? null,
    ...ent,
    used,
    remaining: Math.max(ent.allowance - used, 0),
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) =>
      [k, { label: v.label, priceUsd: v.priceUsd, studiesPerMonth: v.studiesPerMonth }])),
  })
})

// ── The reading ─────────────────────────────────────────────────────────────
app.post('/v1/read', async (req, res) => {
  const { analysis, reference, level } = req.body || {}
  if (!analysis || !reference) {
    return res.status(400).json({ error: 'analysis and reference are required' })
  }

  const ent = entitlementFor(req.identity.account)
  const accountId = req.identity.account?.id ?? null
  const { periodStart, periodEnd } = period()

  // The global brake, checked before anything is promised.
  const ceiling = await meter.ceilingStatus(db)
  if (ceiling.blockEverything) {
    return res.status(503).json({
      error: 'SERVICE_PAUSED',
      message: 'The Operator is paused for a moment. Nothing you have studied is affected.',
    })
  }

  // Anonymous users get their one lifetime study, tracked against the install.
  if (!accountId) {
    const installId = req.identity.installId
    if (!installId) return res.status(400).json({ error: 'x-install-id header required' })
    const { rows } = await db.query(
      `INSERT INTO anon_install (install_id, studies_used)
            VALUES ($1, 1)
       ON CONFLICT (install_id) DO UPDATE SET studies_used = anon_install.studies_used + 1,
                                             updated_at = now()
            WHERE anon_install.studies_used < $2
        RETURNING studies_used`,
      [installId, ent.lifetimeStudies],
    )
    if (rows.length === 0) {
      return res.status(402).json({ error: 'UPGRADE_REQUIRED', ...upgradePrompt(ent) })
    }
  } else {
    const claim = await meter.reserveStudy(db, {
      accountId, allowance: ent.allowance, periodStart, periodEnd,
    })
    if (!claim.ok) {
      return res.status(402).json({
        error: 'UPGRADE_REQUIRED',
        used: claim.used,
        allowance: claim.allowance,
        ...upgradePrompt(ent, { used: claim.used }),
      })
    }
  }

  const studyId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  let settled = false
  const release = async () => {
    if (settled || !accountId) return
    settled = true
    await meter.releaseStudy(db, { accountId, periodStart }).catch(() => {})
  }

  // NDJSON. No compression on this route — it is the classic way a live stream
  // turns into a long silence followed by everything at once.
  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (obj) => { res.write(JSON.stringify(obj) + '\n') }

  // A ~63-second silence precedes the first section. Without a heartbeat an
  // idle-timeout somewhere in the path will kill a request that is working fine.
  const beat = setInterval(() => send({ type: 'ping' }), 15000)

  // If the client hangs up, stop pretending the study is still wanted.
  let aborted = false
  req.on('close', () => { aborted = true })

  try {
    const doc = await engine.runPlainRead(db, {
      analysis, requestedReference: reference, level, accountId, studyId,
      onSection: (section) => { if (!aborted) send({ type: 'section', section }) },
    })

    clearInterval(beat)

    if (accountId) {
      settled = true
      const actualUsd = await engine.studyCost(db, studyId)
      await meter.settleStudy(db, { accountId, periodStart, actualUsd }).catch(() => {})
    }

    send({ type: 'done', document: doc, studyId })
    res.end()
  } catch (e) {
    clearInterval(beat)
    await release()   // a study that never ran must not eat the allowance
    const code = e?.code === 'INPUT_TOO_LARGE' ? 'INPUT_TOO_LARGE' : 'GENERATION_FAILED'
    send({ type: 'error', code, message: e?.message || 'The reading could not be completed.' })
    res.end()
  }
})

// ── Stripe ──────────────────────────────────────────────────────────────────
require('./stripe').mount(app, db)

const port = process.env.PORT || 8080
app.listen(port, () => console.log(`[operator] listening on ${port}`))

module.exports = app
