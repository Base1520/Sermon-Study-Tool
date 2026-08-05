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

/**
 * A pool without an 'error' listener is a process that dies on a dropped idle
 * connection. Postgres closes idle clients routinely — a restart, a failover, a
 * network blip — and node-pg emits that on the POOL, where an unhandled 'error'
 * event is fatal. The pool replaces the client on its own; all this does is stop
 * a routine event from taking the API down with it.
 */
db.on('error', (err) => console.error('[db] idle client error:', err.message))

const app = express()

/**
 * Wrap an async route so a rejection becomes a 500 instead of a dead server.
 *
 * express 4 — which is what package.json pins and the image installs — does NOT
 * catch a rejected promise from a handler. The rejection escapes to the process,
 * and Node's default for an unhandled rejection is to TERMINATE. So one bad
 * request (a Postgres blip inside /v1/me, a malformed body) would take the API
 * down for everyone, mid-study, including people who had already paid.
 *
 * Verify this against the version in server/package.json, not whatever a stray
 * node_modules resolves to: express 5 handles it, express 4 does not, and the
 * difference is the whole bug.
 */
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
app.set('trust proxy', 1)

// THE WEBHOOK IS MOUNTED FIRST, AND THAT ORDER IS THE WHOLE POINT.
//
// Stripe signs the raw request bytes. express.json() consumes the stream and
// hands the route a parsed object, and constructEvent() cannot verify an
// object — so with the parser registered first, EVERY webhook failed its
// signature check and returned 400. Stripe kept retrying, every retry failed,
// and no subscription state ever reached this database: a customer's payment
// succeeded and their account stayed 'free' forever, while a customer whose
// card failed stayed 'active' and kept spending Cole's tokens.
//
// Proven, not assumed: an express app with json() before raw() delivers
// `typeof req.body === 'object'` to the raw handler.
require('./stripe').mountWebhook(app, db)

app.use(express.json({ limit: '256kb' }))   // a passage is small; anything larger is abuse
app.use(auth.middleware(db))

const period = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() }
}

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', route(async (_req, res) => {
  try {
    await db.query('SELECT 1')
    res.json({ ok: true })
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message })
  }
}))

// ── Who am I and what may I do ──────────────────────────────────────────────
// The client calls this on launch to decide what to show. It never 401s.
app.get('/v1/me', route(async (req, res) => {
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
}))

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

  // THE MIDDLE RUNG, which was computed and then never consulted. Without this
  // the brake had exactly one setting — 150% of the ceiling — so the first thing
  // that ever stopped a runaway also stopped every paying customer. At 90% the
  // FREE tier closes and paid work continues: the people who are paying keep
  // working, and the tier anyone can open with a fresh uuid is the one that
  // yields. That ordering is the whole point of having two rungs.
  if (ceiling.blockNewSignups && !accountId) {
    return { status: 503, body: {
      error: 'FREE_TIER_PAUSED',
      headline: 'Free studies are paused right now.',
      message: 'More people started studies today than expected. Subscribers are unaffected, and this clears on its own.',
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
app.post('/v1/analyze', route(async (req, res) => {
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
  // The claim is written BEFORE the work, and never depends on the work. A cache
  // hit spends nothing and writes no usage rows; inferring ownership from usage
  // meant a cached analysis produced a study its owner could not prove — and
  // being served from cache is the COMMON case, not the rare one.
  await engine.openStudy(db, {
    studyId, accountId, installId: req.identity.installId, reference,
  })

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
    // "No result returned" is NOT "no money spent". The fan-out runs up to three
    // calls in parallel and only two are fatal, so a failure here routinely lands
    // AFTER real tokens were billed. Book what was actually spent before handing
    // the credit back, or a retry loop burns money the ceiling never sees.
    if (accountId) {
      const spent = await engine.studyCost(db, studyId).catch(() => 0)
      await meter.releaseStudy(db, { accountId, periodStart }).catch(() => {})
      await meter.recordAdditionalSpend(db, { accountId, periodStart, actualUsd: spent }).catch(() => {})
    } else if (req.identity.installId) {
      // THE FREE CREDIT IS THE ONLY ONE HE WILL EVER GET. Spending it on a
      // crash — a model timeout, a parse failure — and never giving it back
      // means his single impression of the product is an error message and a
      // paywall, permanently, with no way to retry. Give it back.
      await db.query(
        `UPDATE anon_install SET studies_used = GREATEST(studies_used - 1, 0), updated_at = now()
          WHERE install_id = $1`, [req.identity.installId]).catch(() => {})
    }
    const code = e?.code === 'INPUT_TOO_LARGE' ? 'INPUT_TOO_LARGE' : 'ANALYSIS_FAILED'
    res.status(code === 'INPUT_TOO_LARGE' ? 413 : 500)
       .json({ error: code, message: e?.message || 'The analysis could not be completed.' })
  }
}))

// ── The reading ─────────────────────────────────────────────────────────────
/**
 * The analysis is CLIENT-SUPPLIED and goes straight into the model prompt, so
 * its size is a cost the sender chooses and Cole pays. checkGenerationInput only
 * ever bounded the reference string. A real analysis is a few tens of KB; this
 * ceiling is generous enough never to touch one and tight enough that a single
 * request cannot outrun the $0.75 worst-case reservation held against it.
 */
const MAX_ANALYSIS_CHARS = 120_000

app.post('/v1/read', route(async (req, res) => {
  const { analysis, reference, level, studyId: priorStudyId } = req.body || {}
  if (!analysis || !reference) {
    return res.status(400).json({ error: 'analysis and reference are required' })
  }
  const analysisSize = JSON.stringify(analysis).length
  if (analysisSize > MAX_ANALYSIS_CHARS) {
    return res.status(413).json({
      error: 'INPUT_TOO_LARGE',
      message: `That analysis is too large to read (${Math.round(analysisSize / 1000)}KB).`,
    })
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
  // ATOMIC. Two simultaneous readings used to be able to both observe "no
  // document yet" and both generate — one claim, two bills, both Cole's. This is
  // a conditional UPDATE, so exactly one caller can take a study's one document.
  const ridesPriorClaim = await engine.claimStudyForReading(db, {
    studyId: priorStudyId, accountId, installId: req.identity.installId,
  })

  if (!ridesPriorClaim) {
    const refused = await claimStudy(req, { ent, accountId, periodStart, periodEnd })
    if (refused) return res.status(refused.status).json(refused.body)
  }

  // Reusing the analyze id keeps the fan-out, the document, its retries and the
  // verify pass rolled up as one study in the ledger — which is what makes
  // cost-per-study a measured number rather than an estimate.
  const studyId = ridesPriorClaim ? priorStudyId : newStudyId()
  if (!ridesPriorClaim) {
    await engine.openStudy(db, { studyId, accountId, installId: req.identity.installId, reference })
    await engine.claimStudyForReading(db, { studyId, accountId, installId: req.identity.installId })
  }
  let settled = false
  const release = async () => {
    // A reading that failed must leave the claim rideable again, or a man pays a
    // second study to retry something he never received.
    await engine.releaseStudyForRetry(db, studyId).catch(() => {})
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
      // TWO ARGUMENTS. The engine calls onSection(key, value); a one-parameter
      // handler here captured the key and silently dropped every section's
      // CONTENT, so the stream carried 39 section names and no text. The reader
      // saw nothing for the full ~163 seconds and then the whole document at
      // once — the exact failure the note at the top of this file warns about.
      onSection: (key, value) => { if (!aborted) send({ type: 'section', key, value }) },
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

    await engine.finishStudy(db, studyId).catch(() => {})
    send({ type: 'done', document: doc, studyId })
    res.end()
  } catch (e) {
    clearInterval(beat)
    await release()   // a study that never ran must not eat the allowance
    const code = e?.code === 'INPUT_TOO_LARGE' ? 'INPUT_TOO_LARGE' : 'GENERATION_FAILED'
    send({ type: 'error', code, message: e?.message || 'The reading could not be completed.' })
    res.end()
  }
}))

// ── Redeem an access code ───────────────────────────────────────────────────
/**
 * Comped access, no card, no Stripe.
 *
 * Cole and Rikki must not be paying to use their own product, and Cole needs to
 * be able to hand a working copy to a beta tester or a pastor without asking for
 * a credit card first. A code creates a real account and issues a real device
 * token, so a comped user travels the identical code path as a paying one —
 * which is the only way the comped path stays tested.
 *
 * Deliberately NOT a magic build or a hidden flag in the app. A comp that lives
 * on the server can be revoked the moment a code leaks; a comp compiled into a
 * binary is permanent and public the day someone posts it.
 */
app.post('/v1/redeem', route(async (req, res) => {
  const raw = String((req.body || {}).code || '').trim().toUpperCase()
  const installId = req.identity.installId
  if (!raw) return res.status(400).json({ error: 'code required' })
  if (!installId) return res.status(400).json({ error: 'x-install-id header required' })

  const { rows } = await db.query(
    `SELECT code, plan, label, uses_max, uses_count, revoked_at
       FROM access_code WHERE code = $1`, [raw])
  const code = rows[0]

  // One message for "wrong" and "revoked" and "used up", on purpose: a distinct
  // reply for each turns this endpoint into an oracle for guessing codes.
  const refuse = () => res.status(404).json({
    error: 'INVALID_CODE',
    message: "That code isn't valid. Check it and try again.",
  })
  if (!code || code.revoked_at) return refuse()

  // Already redeemed on this install — hand back a token rather than refusing,
  // so reinstalling the app is not a dead end.
  const prior = await db.query(
    `SELECT account_id FROM access_code_use WHERE code = $1 AND install_id = $2`,
    [raw, installId])

  let accountId = prior.rows[0]?.account_id ?? null

  if (!accountId) {
    if (code.uses_max !== null && code.uses_count >= code.uses_max) return refuse()

    // Claim a use FIRST, conditionally, so two simultaneous redemptions of a
    // single-use code cannot both succeed.
    const claimed = await db.query(
      `UPDATE access_code SET uses_count = uses_count + 1
        WHERE code = $1 AND revoked_at IS NULL
          AND (uses_max IS NULL OR uses_count < uses_max)
        RETURNING uses_count`,
      [raw])
    if (claimed.rows.length === 0) return refuse()

    const created = await db.query(
      `INSERT INTO account (email, plan, status, install_id)
            VALUES ($1, $2, 'active', $3)
       ON CONFLICT (email) DO UPDATE SET plan = EXCLUDED.plan, status = 'active'
        RETURNING id`,
      [`${raw.toLowerCase()}.${installId}@comp.invalid`, code.plan, installId],
    )
    accountId = created.rows[0].id
    await db.query(
      `INSERT INTO access_code_use (code, install_id, account_id) VALUES ($1,$2,$3)
       ON CONFLICT (code, install_id) DO NOTHING`,
      [raw, installId, accountId])
  }

  const token = await auth.issueDeviceToken(db, { accountId, installId, label: code.label || 'Comp' })
  const { rows: acct } = await db.query(`SELECT plan, status FROM account WHERE id = $1`, [accountId])
  res.json({ token, ...entitlementFor(acct[0]), label: code.label ?? null })
}))

// ── Stripe ──────────────────────────────────────────────────────────────────
require('./stripe').mount(app, db)

/**
 * The last stop for anything route() caught.
 *
 * Registered AFTER every route, because express picks error handlers by
 * position. If the response has already started streaming there is nothing to
 * send — the headers and part of the body are long gone — so the connection is
 * simply closed rather than corrupted with a JSON error object appended to a
 * half-written document.
 */
app.use((err, _req, res, _next) => {
  console.error('[route] unhandled:', err?.stack || err?.message || err)
  if (res.headersSent) return res.end()
  res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong on our end.' })
})

// A last-resort net. Nothing should reach here now that routes are wrapped, but
// an unhandled rejection anywhere else defaults to KILLING the process, and this
// server is holding live studies people have paid for.
process.on('unhandledRejection', (e) => console.error('[fatal] unhandled rejection:', e?.stack || e))
process.on('uncaughtException', (e) => console.error('[fatal] uncaught exception:', e?.stack || e))

const port = process.env.PORT || 8080
app.listen(port, () => console.log(`[operator] listening on ${port}`))

module.exports = app
