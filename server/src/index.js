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
const {
  entitlementFor,
  upgradePrompt,
  PLANS,
  monthlyPriceUsd,
  annualSavingsUsd,
} = require('./entitlement')
const meter = require('./meter')
const { invalidCodeResponse } = require('./access-code-policy')
const engine = require('./engine')
const readResume = require('./read-resume')
const { checkGenerationInput } = require('../../electron/plainread/runtime')
const { redeemAccessCode } = require('./redeem')
const installDataAdoption = require('./install-data-adoption')
const generation = require('./routes/generation')
const community = require('./routes/community')
const { resolveOwnedStudyDocument } = require('./study-ai-access')
const { buildStudyCommentaryHandler } = require('./study-commentary')
const mobile = require('./mobile')
const stripeApi = require('./stripe')
const iap = require('./iap')
const billing = require('./billing')
const { billingPeriodFor } = require('./billing-period')
const { processMarketingDeletionOutbox } = require('./mailchimp')
const { trialIdentitySecret, trialIdentityHash } = require('./mobile-account')
const { probeReadiness, releaseStage, runtimeIdentity } = require('./readiness')
const { purgeExpiredRegistrationCodes } = require('./account-registration')

// Trial tombstones are a security boundary, not an optional feature. Starting
// without their dedicated key would let account deletion mint another free
// trial after the next deploy changes whichever unrelated fallback key was used.
trialIdentitySecret()

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
stripeApi.mountWebhook(app, db)
mobile.mountCors(app)

app.patch('/v1/studies/:id/workspace', express.json({ limit: '520kb' }), (_req, _res, next) => next())
app.use(express.json({ limit: '256kb' }))   // a passage is small; anything larger is abuse
app.use(express.urlencoded({ extended: false, limit: '16kb' }))
app.use(auth.middleware(db))
app.use(installDataAdoption.middleware(db))

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', route(async (_req, res) => {
  try {
    const readiness = await probeReadiness(db)
    res.status(readiness.ok ? 200 : 503).json(readiness)
  } catch (e) {
    res.status(503).json({
      ...runtimeIdentity(),
      ok: false,
      missing: ['database_probe'],
    })
  }
}))

// ── Who am I and what may I do ──────────────────────────────────────────────
// The client calls this on launch to decide what to show. It never 401s.
app.get('/v1/me', route(async (req, res) => {
  const ent = entitlementFor(req.identity.account)
  const { periodStart } = billingPeriodFor(req.identity.account)
  let used = 0
  let billingProvider = req.identity.account?.stripeSubscriptionId ? 'stripe' : null
  if (req.identity.account) {
    if (ent.plan === 'free') {
      used = req.identity.account.freeStudiesUsed
    } else {
      const { rows } = await db.query(
        `SELECT studies_used FROM usage_period WHERE account_id = $1 AND period_start = $2`,
        [req.identity.account.id, periodStart],
      )
      used = rows[0]?.studies_used ?? 0
    }
    const subscriptions = await db.query(
      `SELECT provider, plan, status, current_period_end
         FROM billing_subscription WHERE account_id = $1`,
      [req.identity.account.id],
    ).catch(() => ({ rows: [] }))
    billingProvider = billing.preferredEntitlement(subscriptions.rows)?.provider || billingProvider
  } else if (req.identity.installId) {
    const installIdentityHash = trialIdentityHash('install', req.identity.installId)
    const { rows } = await db.query(
      `SELECT GREATEST(
          COALESCE((SELECT studies_used FROM anon_install WHERE install_id = $1), 0),
          COALESCE((SELECT MAX(free_studies_used) FROM free_trial_tombstone WHERE identity_hash = $2), 0)
        )::int AS studies_used`,
      [req.identity.installId, installIdentityHash],
    )
    used = rows[0]?.studies_used ?? 0
  }
  res.json({
    anonymous: req.identity.anonymous,
    accountId: req.identity.account?.id ?? null,
    email: req.identity.account?.email ?? null,
    billingProvider,
    ...ent,
    used,
    remaining: mobile.remainingStudyCount(ent, used, Boolean(req.identity.account)),
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, {
      label: v.label,
      family: v.family ?? k,
      priceUsd: v.priceUsd,
      studiesPerMonth: v.studiesPerMonth,
      billingInterval: v.billingInterval ?? null,
      monthlyEquivalentUsd: monthlyPriceUsd(v),
      annualSavingsUsd: annualSavingsUsd(v),
      hidden: Boolean(v.hidden),
    }])),
  })
}))

/**
 * Claim a study, or explain why not.
 *
 * Shared by both spending routes so the free tier, the paid allowance and the
 * global brake are enforced identically. Returns null when the caller may
 * proceed, or the response body to send back when they may not.
 */
async function claimStudy(req, {
  ent,
  accountId,
  periodStart,
  periodEnd,
  reservationId,
  reserveUsd = meter.STUDY_RESERVE_USD,
}) {
  return meter.withGlobalSpendLock(db, async (client) => {
    if (accountId && !(await meter.accountAvailableForSpend(client, accountId))) {
      return { status: 409, body: {
        error: 'ACCOUNT_UNAVAILABLE',
        message: 'This account is being deleted and cannot start new work.',
      } }
    }
    if (reservationId) {
      const existingReservation = await client.query(
        `SELECT state FROM study_reservation WHERE id = $1 LIMIT 1`,
        [reservationId],
      )
      if (existingReservation.rows.length) {
        const retryable = ['held', 'settled'].includes(existingReservation.rows[0].state)
        return { status: retryable ? 409 : 500, body: {
          error: retryable ? 'STUDY_IN_PROGRESS' : 'STUDY_RESERVATION_CLOSED',
          message: retryable
            ? 'That study is already in progress.'
            : 'That study attempt is closed. Start it again.',
        } }
      }
    }
    const ceiling = await meter.ceilingStatus(client)
    const projected = ceiling.committed + reserveUsd
    if (projected > ceiling.ceiling * 1.5) {
      return { status: 503, body: {
        error: 'SERVICE_PAUSED',
        message: 'The Operator is paused for a moment. Nothing you have studied is affected.',
      } }
    }

    if (!ent.paying && projected > ceiling.ceiling * 0.9) {
      return { status: 503, body: {
        error: 'FREE_TIER_PAUSED',
        headline: 'Free studies are paused right now.',
        message: 'More people started studies today than expected. Subscribers are unaffected, and this clears on its own.',
      } }
    }

    if (!accountId) {
      const installId = req.identity.installId
      if (!installId) return { status: 400, body: { error: 'x-install-id header required' } }
      const claim = await meter.reserveAnonymousStudy(client, {
        installId,
        identityHash: trialIdentityHash('install', installId),
        lifetimeStudies: ent.lifetimeStudies,
        periodStart,
        periodEnd,
        reservationId,
        reserveUsd,
      })
      return claim.ok
        ? null
        : { status: 402, body: { error: 'UPGRADE_REQUIRED', ...upgradePrompt(ent) } }
    }

    const claim = ent.plan === 'free'
      ? await meter.reserveLifetimeStudy(client, {
          accountId,
          lifetimeStudies: ent.lifetimeStudies,
          periodStart,
          periodEnd,
          reservationId,
          reserveUsd,
        })
      : await meter.reserveStudy(client, {
          accountId,
          allowance: ent.allowance,
          periodStart,
          periodEnd,
          reservationId,
          reserveUsd,
        })
    if (!claim.ok) {
      return { status: 402, body: {
        error: 'UPGRADE_REQUIRED',
        used: claim.used,
        allowance: claim.allowance,
        ...upgradePrompt(ent, { used: claim.used }),
      } }
    }
    return null
  })
}

const newStudyId = () =>
  `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`

const AI_PROCESSING_CONSENT_VERSION = 'operator-ai-processing-v1'

function requireGeneratedStudyAccount(req, res) {
  if (releaseStage() !== 'full' || req.identity.account) return true
  res.status(401).json({
    error: 'ACCOUNT_REQUIRED',
    message: 'Create or recover your free Operator account before running generated study tools.',
  })
  return false
}

// ── Generated-study surfaces: analyze, Quick Study, Guided Study ─────────────
// Extracted to routes/generation.js (2026-08-15, fixability order). The shared
// spend/account policy stays here and is injected; this call remains at the
// former registration slot before /v1/read, preserving middleware/route order.
generation.mount(app, db, {
  route,
  checkGenerationInput,
  entitlementFor,
  billingPeriodFor,
  claimStudy,
  newStudyId,
  requireGeneratedStudyAccount,
  AI_PROCESSING_CONSENT_VERSION,
  meter,
  engine,
  mobile,
})

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
  try {
    checkGenerationInput({ reference })
  } catch (e) {
    return res.status(413).json({
      error: 'INPUT_TOO_LARGE',
      message: e?.message || 'That passage reference is too long.',
    })
  }

  const ent = entitlementFor(req.identity.account)
  const accountId = req.identity.account?.id ?? null
  const { periodStart, periodEnd } = billingPeriodFor(req.identity.account)

  /**
   * ALREADY WRITTEN? THEN IT IS FREE.
   *
   * Checked before any claim, because serving a cached document costs nothing
   * and charging for nothing is indefensible. This one lookup closes four
   * separate ways a person was billed twice for one reading:
   *   - quitting mid-stream (the server finishes and caches it; his machine
   *     never received it, so he came back and was charged again for a document
   *     that already existed)
   *   - re-opening a saved study whose local copy was missing
   *   - a document whose claim check reported 'failed', which the desktop
   *     refuses to cache — so it was re-bought on every single launch
   *   - the second reader of any passage someone else has already studied
   */
  const alreadyWritten = await engine.cachedDocument(db, analysis, level)
  if (alreadyWritten) {
    await engine.saveStudyDocument(db, {
      studyId: priorStudyId,
      accountId,
      installId: req.identity.installId,
      analysis,
      document: alreadyWritten,
      level,
    }).catch(() => {})
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.write(JSON.stringify({ type: 'done', document: alreadyWritten, cached: true }) + '\n')
    return res.end()
  }

  // ONE STUDY, NOT TWO. A reading is the second half of work /v1/analyze already
  // charged for, so a client that passes back the studyId it was given rides
  // that same reservation. The id cannot be forged into free work: it only
  // exists because analyze reserved and billed against this very caller, and one
  // reservation buys exactly one document. A replayed or simultaneous request
  // is refused below without consuming another claim.
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
  let freshStudyId = null

  if (!ridesPriorClaim) {
    // The shared cache admits only verifier-approved documents, while the
    // owned study row keeps the exact document that was delivered. If that
    // document missed the shared cache (for example, verification did not pass),
    // restore it from its owner-bound row for free. The lookup deliberately
    // propagates database uncertainty: never mint a second study merely because
    // we could not determine whether the first document already exists.
    const finishedDocument = await engine.ownedStudyDocument(db, {
      studyId: priorStudyId, accountId, installId: req.identity.installId,
    })
    if (finishedDocument) {
      res.setHeader('Content-Type', 'application/x-ndjson')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.write(JSON.stringify({
        type: 'done', document: finishedDocument, studyId: priorStudyId, restored: true,
      }) + '\n')
      return res.end()
    }

    const priorState = await engine.ownedStudyState(db, {
      studyId: priorStudyId, accountId, installId: req.identity.installId,
    })
    // Reading/done answer for themselves; a RESTORE may never buy; only a
    // deliberate request reaches mintFresh. The module reads the restore flag
    // from the request itself — this route deliberately never touches it, and
    // the suite asserts the token appears nowhere in this file.
    const outcome = await readResume.resolveNoRide(req, {
      priorState,
      mintFresh: async () => {
        const id = newStudyId()
        const refused = await claimStudy(req, {
          ent, accountId, periodStart, periodEnd, reservationId: id,
        })
        return refused ? { response: { status: refused.status, body: refused.body } } : { freshStudyId: id }
      },
    })
    if (outcome.response) return res.status(outcome.response.status).json(outcome.response.body)
    freshStudyId = outcome.freshStudyId
  }

  // Reusing the analyze id keeps the fan-out, the document, its retries and the
  // verify pass rolled up as one study in the ledger — which is what makes
  // cost-per-study a measured number rather than an estimate.
  const studyId = ridesPriorClaim ? priorStudyId : freshStudyId
  if (ridesPriorClaim) {
    // One question: is the money armed for this ride? Everything behind it —
    // the hold, terminal-vs-transient-vs-unknown, strand or reset — lives and
    // is behaviorally tested in read-resume.js. `held` deliberately does not
    // exist in this route; two audits proved any wiring around it bypassable.
    const ride = await readResume.rideOrResolve(db, studyId)
    if (!ride.ok) return res.status(ride.status).json(ride.body)
  }
  if (!ridesPriorClaim) {
    try {
      await engine.openStudy(db, { studyId, accountId, installId: req.identity.installId, reference })
      const opened = await engine.claimStudyForReading(db, {
        studyId, accountId, installId: req.identity.installId,
      })
      if (!opened) throw new Error('The reading claim could not be opened.')
    } catch (error) {
      await meter.releaseStudyReservation(db, studyId).catch(() => {})
      throw error
    }
  }
  let settled = false
  const release = async (actualUsd) => {
    // A reading that failed must leave the claim rideable again, or a man pays a
    // second study to retry something he never received.
    //
    // If it has now failed too many times the claim is STRANDED, and the credit
    // goes back: he asked for a reading, spent a study, and never got one.
    //
    // BOUNDED, because an UNCONDITIONAL release turns one credit into unlimited
    // generations: disconnect mid-stream, the claim goes back to 'analyzed',
    // ride it again, disconnect again — each attempt spending real Opus tokens
    // and no attempt ever costing a study. releaseStudyForRetry only restores a
    // claim that has not already been retried too many times.
    const state = await engine.releaseStudyForRetry(db, studyId).catch(() => null)

    await meter.settleStudyReservation(db, {
      reservationId: studyId,
      actualUsd,
    })

    if (state === 'stranded') {
      await meter.refundStudyReservation(db, studyId).catch(() => {})
      settled = true
      return
    }

    // A ridden claim stays charged and can be retried. Its read hold is settled
    // above so the global ceiling no longer counts work that has stopped.
    if (settled || ridesPriorClaim) {
      settled = true
      return
    }
    settled = true
    await db.query(
      `UPDATE study SET state = 'stranded', updated_at = now()
        WHERE id = $1 AND state = 'analyzed'`,
      [studyId],
    ).catch(() => {})
    await meter.refundStudyReservation(db, studyId).catch(() => {})
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
  const reservationHeartbeat = studyId
    ? setInterval(() => {
        meter.heartbeatStudyReservation(db, studyId).catch(() => {})
      }, meter.RESERVATION_HEARTBEAT_MS)
    : null
  reservationHeartbeat?.unref?.()

  // If the client hangs up, stop pretending the study is still wanted.
  let aborted = false
  req.on('close', () => { aborted = true })

  // Charge the DELTA, not the total. On a ride-along the analyze half is already
  // in usage_event under this same study id and has already been booked — summing
  // the whole study here would bill that half twice.
  let spentBefore = 0

  try {
    spentBefore = accountId ? await engine.studyCost(db, studyId) : 0
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
    if (reservationHeartbeat) clearInterval(reservationHeartbeat)

    const actualUsd = accountId ? (await engine.studyCost(db, studyId)) - spentBefore : 0
    await meter.settleStudyReservation(db, {
      reservationId: studyId,
      actualUsd,
    })
    settled = true

    await engine.finishStudy(db, studyId, { analysis, document: doc, level }).catch(() => {})
    send({ type: 'done', document: doc, studyId })
    res.end()
  } catch (e) {
    clearInterval(beat)
    if (reservationHeartbeat) clearInterval(reservationHeartbeat)

    /**
     * DID IT ACTUALLY FAIL?
     *
     * The pipeline retries a document that fails validation, and only the LAST
     * attempt's error propagates. A run can therefore write a good document to
     * the shared cache and still throw — which is what a live test just did on
     * Romans 12:2: 40 sections streamed, a validation error surfaced, and the
     * very next request returned a complete 22,749-character document instantly
     * from cache. The work had succeeded; the reader was told it had not.
     *
     * So before reporting a failure, look for the thing the failure would have
     * produced. Costs one indexed lookup on a path that is already over.
     */
    const salvaged = await engine.cachedDocument(db, analysis, level).catch(() => null)
    if (salvaged) {
      const actualUsd = accountId
        ? (await engine.studyCost(db, studyId).catch(() => 0)) - spentBefore
        : 0
      await meter.settleStudyReservation(db, {
        reservationId: studyId,
        actualUsd,
      })
      settled = true
      await engine.finishStudy(db, studyId, { analysis, document: salvaged, level }).catch(() => {})
      send({ type: 'done', document: salvaged, studyId, salvaged: true })
      return res.end()
    }

    const actualUsd = accountId
      ? Math.max((await engine.studyCost(db, studyId).catch(() => 0)) - spentBefore, 0)
      : 0
    await release(actualUsd)   // a study that never ran must not eat the allowance
    const code = e?.code === 'INPUT_TOO_LARGE' ? 'INPUT_TOO_LARGE' : 'GENERATION_FAILED'
    send({ type: 'error', code, message: e?.message || 'The reading could not be completed.' })
    res.end()
  }
}))

/**
 * Ask a question about a reading.
 *
 * NOT billed as a study. The paywall promises "read it, ask about it, export
 * it" about work already paid for; charging a whole study for a follow-up would
 * make that sentence false.
 *
 * What bounds it instead of an allowance:
 *   - a completed, server-owned study is required
 *   - free users get five follow-ups for the lifetime study
 *   - subscribed and comp accounts have a hard daily cap
 *   - the global ceiling is checked first like every other spending route
 */
const MAX_ASKS_PER_DAY = 100
const FREE_LIFETIME_ASKS = 5
/**
 * A real reading is ~20KB. 200K was set "generously" and that was the wrong
 * instinct on a route that runs an Opus call 100 times a day per install id:
 * generosity there is measured in dollars of somebody else's money. 60K still
 * clears the largest genuine document with room to spare.
 */
const MAX_ASK_CHARS = 60_000

app.post('/v1/ask', route(async (req, res) => {
  if (!requireGeneratedStudyAccount(req, res)) return
  const { studyId, question, history, vaultNotes, aiConsentVersion } = req.body || {}
  if (aiConsentVersion !== AI_PROCESSING_CONSENT_VERSION) {
    return res.status(400).json({
      error: 'AI_CONSENT_REQUIRED',
      message: 'Review and accept the current AI-processing disclosure before sending a question.',
    })
  }
  if (!question || !String(question).trim()) return res.status(400).json({ error: 'question is required' })
  if (!studyId) return res.status(400).json({ error: 'studyId is required' })

  const accountId = req.identity.account?.id ?? null
  const installId = req.identity.installId
  const access = await resolveOwnedStudyDocument(db, {
    studyId, accountId, installId, surface: 'ask',
  })
  if (!access.ok) return res.status(access.status).json(access.body)
  const { document: doc, analysis } = access.study

  // The document and analysis now come from the owned server row, not from the
  // request. History and optional grounding notes are still client-supplied and
  // therefore remain bounded before they can become prompt spend.
  const payloadChars = JSON.stringify({ history, vaultNotes }).length
  if (payloadChars > MAX_ASK_CHARS) {
    return res.status(413).json({ error: 'INPUT_TOO_LARGE', message: 'That reading is too large to ask about.' })
  }
  if (String(question).length > 2000) {
    return res.status(413).json({ error: 'INPUT_TOO_LARGE', message: 'That question is too long.' })
  }

  const ent = entitlementFor(req.identity.account)
  const recurringAskAccess = Boolean(req.identity.account && ent.paying)
  const askReservationId = `ask-${newStudyId()}`
  const claim = await meter.reserveAsk(db, {
    id: askReservationId,
    accountId,
    installId,
    recurringAccess: recurringAskAccess,
    freeLimit: FREE_LIFETIME_ASKS,
    dailyLimit: MAX_ASKS_PER_DAY,
  })
  if (!claim.ok) {
    if (claim.reason === 'service-paused' || claim.reason === 'free-tier-paused') {
      return res.status(503).json({
        error: claim.reason === 'service-paused' ? 'SERVICE_PAUSED' : 'FREE_TIER_PAUSED',
        message: 'The Operator is paused for a moment. Nothing you have studied is affected.',
      })
    }
    if (claim.reason === 'account-unavailable') return res.status(409).json({
      error: 'ACCOUNT_UNAVAILABLE',
      message: 'This account is being deleted and cannot start new work.',
    })
    if (claim.reason === 'daily-limit') return res.status(429).json({
      error: 'ASK_LIMIT',
      headline: "That's a lot of questions for one day.",
      message: 'The limit resets in a few hours. Everything you have studied stays available.',
    })
    return res.status(429).json({
      error: 'FREE_ASK_LIMIT',
      headline: 'You have worked this free study all the way through.',
      message: `Your ${FREE_LIFETIME_ASKS} free follow-up questions are used. The study and every answer stay in your library.`,
    })
  }

  const reservationHeartbeat = setInterval(() => {
    meter.heartbeatAskReservation(db, askReservationId).catch(() => {})
  }, meter.RESERVATION_HEARTBEAT_MS)
  reservationHeartbeat.unref?.()
  try {
    const answer = await engine.runAsk(db, {
      doc, analysis, question, history, vaultNotes, accountId, installId,
    })
    await meter.settleAskReservation(db, askReservationId)
    res.json(answer)
  } catch (e) {
    await meter.releaseAskReservation(db, askReservationId).catch(() => {})
    res.status(500).json({ error: 'ASK_FAILED', message: e?.message || 'That question could not be answered.' })
  } finally {
    clearInterval(reservationHeartbeat)
  }
}))

const SERMON_AGENT_ROLES = new Set(['exegetical', 'theological', 'homiletical', 'scholar'])

app.post('/v1/sermon-assist', route(async (req, res) => {
  if (!requireGeneratedStudyAccount(req, res)) return
  const { studyId, agent, question, history, aiConsentVersion } = req.body || {}
  if (aiConsentVersion !== AI_PROCESSING_CONSENT_VERSION) {
    return res.status(400).json({
      error: 'AI_CONSENT_REQUIRED',
      message: 'Review and accept the current specialist-agent disclosure before sending a question.',
    })
  }
  if (!SERMON_AGENT_ROLES.has(agent)) return res.status(400).json({ error: 'a supported agent is required' })
  // Every agent is a standing conversation in its own discipline — Cole's
  // expanded call, 2026-08-15 ("all the chats need to be chattable in all their
  // areas even if not on a specific passage"), superseding the scholar-only
  // first cut. A missing studyId is a MODE, not an error: the answer is
  // ungrounded, says so, and costs the same one Ask. The grounded path below is
  // byte-identical to what it was.
  const generalMode = !studyId
  if (!question || !String(question).trim()) return res.status(400).json({ error: 'question is required' })
  if (String(question).length > 2000) {
    return res.status(413).json({ error: 'INPUT_TOO_LARGE', message: 'That question is too long.' })
  }
  if (JSON.stringify({ history }).length > MAX_ASK_CHARS) {
    return res.status(413).json({ error: 'INPUT_TOO_LARGE', message: 'That agent conversation is too large.' })
  }

  const accountId = req.identity.account?.id ?? null
  const installId = req.identity.installId
  let access = null
  if (!generalMode) {
    access = await resolveOwnedStudyDocument(db, {
      studyId, accountId, installId, surface: 'specialist',
    })
    if (!access.ok) return res.status(access.status).json(access.body)
  }

  const ent = entitlementFor(req.identity.account)
  const recurringAskAccess = Boolean(req.identity.account && ent.paying)
  const askReservationId = `sermon-assist-${newStudyId()}`
  const claim = await meter.reserveAsk(db, {
    id: askReservationId,
    accountId,
    installId,
    recurringAccess: recurringAskAccess,
    freeLimit: FREE_LIFETIME_ASKS,
    dailyLimit: MAX_ASKS_PER_DAY,
  })
  if (!claim.ok) {
    if (claim.reason === 'service-paused' || claim.reason === 'free-tier-paused') {
      return res.status(503).json({
        error: claim.reason === 'service-paused' ? 'SERVICE_PAUSED' : 'FREE_TIER_PAUSED',
        message: 'The Operator is paused for a moment. Nothing you have studied is affected.',
      })
    }
    if (claim.reason === 'account-unavailable') return res.status(409).json({
      error: 'ACCOUNT_UNAVAILABLE',
      message: 'This account is being deleted and cannot start new work.',
    })
    if (claim.reason === 'daily-limit') return res.status(429).json({
      error: 'ASK_LIMIT',
      message: 'The specialist-question limit resets in a few hours. Your study and agent threads stay available.',
    })
    return res.status(429).json({
      error: 'FREE_ASK_LIMIT',
      message: `Your ${FREE_LIFETIME_ASKS} included follow-up questions are used. The study and every answer stay in your library.`,
    })
  }

  const reservationHeartbeat = setInterval(() => {
    meter.heartbeatAskReservation(db, askReservationId).catch(() => {})
  }, meter.RESERVATION_HEARTBEAT_MS)
  reservationHeartbeat.unref?.()
  try {
    const result = await engine.runSermonAssist(db, {
      agent,
      doc: generalMode ? null : access.study.document,
      analysis: generalMode ? null : access.study.analysis,
      question,
      history,
      accountId,
      installId,
      general: generalMode,
    })
    await meter.settleAskReservation(db, askReservationId)
    res.json(result)
  } catch (error) {
    await meter.releaseAskReservation(db, askReservationId).catch(() => {})
    res.status(500).json({
      error: 'SERMON_ASSIST_FAILED',
      message: error?.message || 'That specialist could not answer right now.',
    })
  } finally {
    clearInterval(reservationHeartbeat)
  }
}))

app.get('/v1/studies/:id/commentary', route(buildStudyCommentaryHandler({ db })))

// ── Community surfaces: feedback, corpus, redeem ────────────────────────────
// Extracted to routes/community.js (2026-08-15, fixability order). Registered
// here so they still sit BEHIND auth + install-data-adoption middleware — the
// mount call's position in this file IS the registration order.
community.mount(app, db, { route, auth, redeemAccessCode, invalidCodeResponse })

// ── Stripe + mobile account surfaces ────────────────────────────────────────
stripeApi.mount(app, db)
mobile.mount(app, db, auth, { cancelStripeSubscriptions: stripeApi.cancelAccountSubscriptions })
iap.mount(app, db)

/**
 * The last stop for anything route() caught.
 *
 * Registered AFTER every route, because express picks error handlers by
 * position. If the response has already started streaming there is nothing to
 * send — the headers and part of the body are long gone — so the connection is
 * simply closed rather than corrupted with a JSON error object appended to a
 * half-written document.
 */
app.use(iap.errorMiddleware)
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

/**
 * Clear reservations left behind by crashed work.
 *
 * sweepStaleReservations existed and had no caller, so a hold orphaned by a
 * container restart mid-study sat in the table forever. Combined with an
 * unbounded in-flight sum that was a brake tightening on its own with every
 * deploy. Runs every five minutes, and failure is logged rather than fatal —
 * a sweep that cannot run must not take down a server that is otherwise fine.
 */
setInterval(() => {
  meter.sweepStaleReservations(db)
    .then((n) => { if (n) console.log(`[meter] swept ${n} stale reservation(s)`) })
    .catch((e) => console.error('[meter] sweep failed:', e.message))
}, 5 * 60 * 1000).unref()

setInterval(() => {
  purgeExpiredRegistrationCodes(db)
    .then((n) => { if (n) console.log(`[registration] purged ${n} expired code record(s)`) })
    .catch((e) => console.error('[registration] retention sweep failed:', e.message))
}, 5 * 60 * 1000).unref()

setInterval(() => {
  processMarketingDeletionOutbox(db)
    .then(({ completed }) => { if (completed) console.log(`[mailchimp] completed ${completed} deletion job(s)`) })
    .catch((e) => console.error('[mailchimp] deletion sweep failed:', e.message))
}, 5 * 60 * 1000).unref()

const port = process.env.PORT || 8080
app.listen(port, () => console.log(`[operator] listening on ${port}`))

module.exports = app
