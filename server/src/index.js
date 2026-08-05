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

/**
 * Claim a study, or explain why not.
 *
 * Shared by both spending routes so the free tier, the paid allowance and the
 * global brake are enforced identically. Returns null when the caller may
 * proceed, or the response body to send back when they may not.
 */
async function claimStudy(req, { ent, accountId, periodStart, periodEnd }) {
  const ceiling = await meter.ceilingStatus(db)
  if (ceiling.blockEverything) {
    return { status: 503, body: {
      error: 'SERVICE_PAUSED',
      message: 'The Operator is paused for a moment. Nothing you have studied is affected.',
    } }
  }

  // Anonymous users get their one lifetime study, tracked against the install.
  if (!accountId) {
    const installId = req.identity.installId
    if (!installId) return { status: 400, body: { error: 'x-install-id header required' } }
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
      return { status: 402, body: { error: 'UPGRADE_REQUIRED', ...upgradePrompt(ent) } }
    }
    return null
  }

  const claim = await meter.reserveStudy(db, { accountId, allowance: ent.allowance, periodStart, periodEnd })
  if (!claim.ok) {
    return { status: 402, body: {
      error: 'UPGRADE_REQUIRED',
      used: claim.used,
      allowance: claim.allowance,
      ...upgradePrompt(ent, { used: claim.used }),
    } }
  }
  return null
}

const newStudyId = () =>
  `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`

// ── The analysis ────────────────────────────────────────────────────────────
// The first half of a study, and the reason this route exists at all: until it
// did, the only thing that could produce an `analysis` was the desktop app using
// the user's own Anthropic key — so "download it and go" was impossible.
//
// THIS is where a study is charged. /v1/read then rides the same reservation, so
// the full flow costs one study and not two. See the studyId branch below.
app.post('/v1/analyze', async (req, res) => {
  const { text, reference } = req.body || {}
  if (!text || !reference) {
    return res.status(400).json({ error: 'text and reference are required' })
  }

  const ent = entitlementFor(req.identity.account)
  const accountId = req.identity.account?.id ?? null
  const { periodStart, periodEnd } = period()

  const refused = await claimStudy(req, { ent, accountId, periodStart, periodEnd })
  if (refused) return res.status(refused.status).json(refused.body)

  const studyId = newStudyId()
  try {
    const { analysis, cached } = await engine.runAnalyze(db, {
      text, reference, accountId, studyId, installId: req.identity.installId,
    })
    if (accountId) {
      const actualUsd = await engine.studyCost(db, studyId)
      await meter.settleStudy(db, { accountId, periodStart, actualUsd }).catch(() => {})
    }
    res.json({ analysis, studyId, cached })
  } catch (e) {
    // A study that never ran must not eat the allowance.
    if (accountId) await meter.releaseStudy(db, { accountId, periodStart }).catch(() => {})
    const code = e?.code === 'INPUT_TOO_LARGE' ? 'INPUT_TOO_LARGE' : 'ANALYSIS_FAILED'
    res.status(code === 'INPUT_TOO_LARGE' ? 413 : 500)
       .json({ error: code, message: e?.message || 'The analysis could not be completed.' })
  }
})

// ── The reading ─────────────────────────────────────────────────────────────
app.post('/v1/read', async (req, res) => {
  const { analysis, reference, level, studyId: priorStudyId } = req.body || {}
  if (!analysis || !reference) {
    return res.status(400).json({ error: 'analysis and reference are required' })
  }

  const ent = entitlementFor(req.identity.account)
  const accountId = req.identity.account?.id ?? null
  const { periodStart, periodEnd } = period()

  // ONE STUDY, NOT TWO. A reading is the second half of work /v1/analyze already
  // charged for, so a client that passes back the studyId it was given rides
  // that same reservation. The id cannot be forged into free work: it only
  // exists because analyze reserved and billed against this very caller, and one
  // reservation buys exactly one document — a replayed id whose document already
  // exists falls through and pays again.
  //
  // THE FREE USER RIDES TOO, and must. A free install gets one lifetime study;
  // analyze spends it. If the reading then refused them, every single person who
  // downloads this app would get an analysis and a paywall, and the paywall's own
  // words — "it stays here, read it, export it" — would be describing a document
  // that was never written. One credit has to buy a whole study.
  const ridesPriorClaim =
    !!priorStudyId &&
    await engine.studyBelongsTo(db, priorStudyId, { accountId, installId: req.identity.installId }) &&
    !(await engine.studyHasDocument(db, priorStudyId))

  if (!ridesPriorClaim) {
    const refused = await claimStudy(req, { ent, accountId, periodStart, periodEnd })
    if (refused) return res.status(refused.status).json(refused.body)
  }

  // Reusing the analyze id keeps the fan-out, the document, its retries and the
  // verify pass rolled up as one study in the ledger — which is what makes
  // cost-per-study a measured number rather than an estimate.
  const studyId = ridesPriorClaim ? priorStudyId : newStudyId()
  let settled = false
  const release = async () => {
    // Nothing to give back if this reading was riding a claim it did not make.
    if (settled || !accountId || ridesPriorClaim) return
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

  // Charge the DELTA, not the total. On a ride-along the analyze half is already
  // in usage_event under this same study id and has already been booked — summing
  // the whole study here would bill that half twice.
  const spentBefore = accountId ? await engine.studyCost(db, studyId) : 0

  try {
    const doc = await engine.runPlainRead(db, {
      analysis, requestedReference: reference, level, accountId, studyId,
      installId: req.identity.installId,
      onSection: (section) => { if (!aborted) send({ type: 'section', section }) },
    })

    clearInterval(beat)

    if (accountId) {
      settled = true
      const actualUsd = (await engine.studyCost(db, studyId)) - spentBefore
      // A fresh claim still holds its $0.75 reservation and must release it.
      // A ride-along's hold was released when analyze settled.
      await (ridesPriorClaim
        ? meter.recordAdditionalSpend(db, { accountId, periodStart, actualUsd })
        : meter.settleStudy(db, { accountId, periodStart, actualUsd })
      ).catch(() => {})
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
