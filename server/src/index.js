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

const crypto = require('crypto')
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
const { checkGenerationInput } = require('../../electron/plainread/runtime')
const { redeemAccessCode } = require('./redeem')
const installDataAdoption = require('./install-data-adoption')
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

  /**
   * SIZE IS CHECKED BEFORE ANYTHING IS CLAIMED OR WRITTEN.
   *
   * It used to be checked inside the engine, AFTER claimStudy took the credit
   * and openStudy wrote the row. So an oversized paste cost a study, refunded it
   * — and left behind a study row, which is what /v1/ask uses to decide whether
   * a caller has ever run one. A free, token-free 413 therefore unlocked the ask
   * endpoint permanently for any install id that could send a big string.
   */
  try {
    checkGenerationInput({ text, reference })
  } catch (e) {
    return res.status(413).json({
      error: 'INPUT_TOO_LARGE',
      message: e?.message || 'That passage is too long to study in one go.',
    })
  }

  const ent = entitlementFor(req.identity.account)
  const accountId = req.identity.account?.id ?? null
  const { periodStart, periodEnd } = billingPeriodFor(req.identity.account)
  const studyId = newStudyId()

  const refused = await claimStudy(req, {
    ent, accountId, periodStart, periodEnd, reservationId: studyId,
  })
  if (refused) return res.status(refused.status).json(refused.body)

  const reservationHeartbeat = setInterval(() => {
    meter.heartbeatStudyReservation(db, studyId).catch(() => {})
  }, meter.RESERVATION_HEARTBEAT_MS)
  reservationHeartbeat.unref?.()

  // The claim is written BEFORE the work, and never depends on the work. A cache
  // hit spends nothing and writes no usage rows; inferring ownership from usage
  // meant a cached analysis produced a study its owner could not prove — and
  // being served from cache is the COMMON case, not the rare one.
  try {
    await engine.openStudy(db, {
      studyId, accountId, installId: req.identity.installId, reference,
    })
    const { analysis, cached } = await engine.runAnalyze(db, {
      text, reference, accountId, studyId, installId: req.identity.installId,
    })
    await engine.saveStudyAnalysis(db, {
      studyId,
      accountId,
      installId: req.identity.installId,
      analysis,
    }).catch(() => {})
    const actualUsd = await engine.studyCost(db, studyId)
    await meter.settleStudyReservation(db, {
      reservationId: studyId,
      actualUsd,
    }).catch(() => {})
    res.json({ analysis, studyId, cached })
  } catch (e) {
    // "No result returned" is NOT "no money spent". The fan-out runs up to three
    // calls in parallel and only two are fatal, so a failure here routinely lands
    // AFTER real tokens were billed. Book what was actually spent before handing
    // the credit back, or a retry loop burns money the ceiling never sees.
    const spent = await engine.studyCost(db, studyId).catch(() => 0)
    await meter.releaseStudyReservation(db, studyId).catch(() => {})
    if (accountId) {
      await meter.recordAdditionalSpend(db, { accountId, periodStart, actualUsd: spent }).catch(() => {})
    }
    const code = e?.code === 'INPUT_TOO_LARGE' ? 'INPUT_TOO_LARGE' : 'ANALYSIS_FAILED'
    res.status(code === 'INPUT_TOO_LARGE' ? 413 : 500)
       .json({ error: code, message: e?.message || 'The analysis could not be completed.' })
  } finally {
    clearInterval(reservationHeartbeat)
  }
}))

// ── Mobile quick study ─────────────────────────────────────────────────────
// One metered call, one compact answer. The desktop's full analyze + read
// pipeline remains intact; the phone never runs it just to answer a quick
// passage question.
const QUICK_STUDY_TRANSLATIONS = new Set(['kjv', 'asv', 'web', 'ylt', 'esv'])
const QUICK_REQUEST_ID = /^[a-f0-9-]{20,80}$/i
const AI_PROCESSING_CONSENT_VERSION = 'operator-ai-processing-v1'

function requireGeneratedStudyAccount(req, res) {
  if (releaseStage() !== 'full' || req.identity.account) return true
  res.status(401).json({
    error: 'ACCOUNT_REQUIRED',
    message: 'Create or recover your free Operator account before running generated study tools.',
  })
  return false
}

function quickStudyId(req, requestId) {
  const owner = req.identity.account?.id || req.identity.installId || 'anonymous'
  const digest = crypto.createHash('sha256').update(`${owner}:${requestId}`).digest('hex').slice(0, 32)
  return `quick-${digest}`
}

function guidedStudyId(req, requestId) {
  const owner = req.identity.account?.id || req.identity.installId || 'anonymous'
  const digest = crypto.createHash('sha256').update(`${owner}:${requestId}`).digest('hex').slice(0, 32)
  return `guided-${digest}`
}

app.post('/v1/quick-study', route(async (req, res) => {
  if (!requireGeneratedStudyAccount(req, res)) return
  const { reference, translation, requestId, aiConsentVersion } = req.body || {}
  const normalizedTranslation = typeof translation === 'string' ? translation.trim().toLowerCase() : ''
  if (aiConsentVersion !== AI_PROCESSING_CONSENT_VERSION) {
    return res.status(400).json({
      error: 'AI_CONSENT_REQUIRED',
      message: 'Review and accept the current AI-processing disclosure before starting a generated study.',
    })
  }
  if (typeof reference !== 'string' || !reference.trim()) {
    return res.status(400).json({ error: 'reference is required' })
  }
  if (!QUICK_STUDY_TRANSLATIONS.has(normalizedTranslation)) {
    return res.status(400).json({ error: 'a supported translation is required' })
  }
  if (typeof requestId !== 'string' || !QUICK_REQUEST_ID.test(requestId)) {
    return res.status(400).json({ error: 'a valid requestId is required' })
  }

  const accountId = req.identity.account?.id ?? null
  const studyId = quickStudyId(req, requestId)
  const existing = await db.query(
    `SELECT state, analysis, document, passage
       FROM study
      WHERE id = $1
        AND (($2::uuid IS NOT NULL AND account_id = $2)
          OR ($2::uuid IS NULL AND account_id IS NULL AND install_id = $3))
      LIMIT 1`,
    [studyId, accountId, req.identity.installId || ''],
  )
  if (existing.rows[0]?.document && existing.rows[0]?.analysis) {
    const storedAnalysis = existing.rows[0].analysis
    return res.json({
      document: existing.rows[0].document,
      analysis: storedAnalysis,
      studyId,
      passage: existing.rows[0].passage || {
        reference: storedAnalysis.reference,
        translation: storedAnalysis.translation || normalizedTranslation,
        text: storedAnalysis.passageText || '',
        verses: [],
        copyright: '',
      },
      cached: true,
      idempotent: true,
    })
  }
  if (existing.rows.length) {
    const failed = existing.rows[0].state === 'failed'
    return res.status(failed ? 500 : 409).json({
      error: failed ? 'QUICK_STUDY_FAILED' : 'STUDY_IN_PROGRESS',
      message: failed
        ? 'That lookup did not finish. Start it again.'
        : 'That Quick Study is still finishing. Give it a moment, then try again.',
    })
  }

  let passage
  try {
    passage = await mobile.fetchPassage({
      reference: reference.trim(),
      translation: normalizedTranslation,
      esvKey: req.get('x-esv-key') || '',
    })
  } catch (e) {
    return res.status(Number(e?.status) || 502).json({
      error: e?.code || 'PASSAGE_UNAVAILABLE',
      message: e?.message || 'That passage could not be loaded.',
    })
  }

  try {
    checkGenerationInput({ text: passage.text, reference: passage.reference })
  } catch (e) {
    return res.status(413).json({
      error: 'INPUT_TOO_LARGE',
      message: e?.message || 'That passage is too long to study in one go.',
    })
  }

  const ent = entitlementFor(req.identity.account)
  const { periodStart, periodEnd } = billingPeriodFor(req.identity.account)
  const refused = await claimStudy(req, {
    ent,
    accountId,
    periodStart,
    periodEnd,
    reservationId: studyId,
    reserveUsd: meter.QUICK_STUDY_RESERVE_USD,
  })
  if (refused) return res.status(refused.status).json(refused.body)

  const reservationHeartbeat = setInterval(() => {
    meter.heartbeatStudyReservation(db, studyId).catch(() => {})
  }, meter.RESERVATION_HEARTBEAT_MS)
  reservationHeartbeat.unref?.()

  try {
    await engine.openStudy(db, {
      studyId, accountId, installId: req.identity.installId, reference: passage.reference,
    })
    const result = await engine.runQuickStudy(db, {
      text: passage.text,
      reference: passage.reference,
      translation: passage.translation,
      accountId,
      studyId,
      installId: req.identity.installId,
    })
    const saved = await engine.saveStudyDocument(db, {
      studyId,
      accountId,
      installId: req.identity.installId,
      analysis: result.analysis,
      document: result.document,
      level: 'quick',
      passage,
    })
    if (!saved) throw new Error('The Quick Study could not be saved.')
    const actualUsd = await engine.studyCost(db, studyId)
    const settled = await meter.settleStudyReservation(db, {
      reservationId: studyId,
      actualUsd,
    })
    if (!settled) throw new Error('The Quick Study could not be settled safely.')
    res.json({ ...result, studyId, passage })
  } catch (e) {
    const spent = await engine.studyCost(db, studyId).catch(() => 0)
    await meter.releaseStudyReservation(db, studyId).catch(() => {})
    await db.query(
      `UPDATE study SET state = 'failed', updated_at = now()
        WHERE id = $1 AND state <> 'done'`,
      [studyId],
    ).catch(() => {})
    if (accountId) {
      await meter.recordAdditionalSpend(db, { accountId, periodStart, actualUsd: spent }).catch(() => {})
    }
    res.status(500).json({
      error: 'QUICK_STUDY_FAILED',
      message: e?.message || 'The quick study could not be completed.',
    })
  } finally {
    clearInterval(reservationHeartbeat)
  }
}))

// ── Tablet guided study ────────────────────────────────────────────────────
// A complete COVENANT-shaped PLAIN study in three parallel bounded calls. It is
// deeper than the phone lookup without invoking the desktop sermon pipeline.
app.post('/v1/guided-study', route(async (req, res) => {
  if (!requireGeneratedStudyAccount(req, res)) return
  const { reference, translation, requestId, aiConsentVersion } = req.body || {}
  const normalizedTranslation = typeof translation === 'string' ? translation.trim().toLowerCase() : ''
  if (aiConsentVersion !== AI_PROCESSING_CONSENT_VERSION) {
    return res.status(400).json({
      error: 'AI_CONSENT_REQUIRED',
      message: 'Review and accept the current AI-processing disclosure before starting a generated study.',
    })
  }
  if (typeof reference !== 'string' || !reference.trim()) {
    return res.status(400).json({ error: 'reference is required' })
  }
  if (!QUICK_STUDY_TRANSLATIONS.has(normalizedTranslation)) {
    return res.status(400).json({ error: 'a supported translation is required' })
  }
  if (typeof requestId !== 'string' || !QUICK_REQUEST_ID.test(requestId)) {
    return res.status(400).json({ error: 'a valid requestId is required' })
  }

  const accountId = req.identity.account?.id ?? null
  const studyId = guidedStudyId(req, requestId)
  const existing = await db.query(
    `SELECT state, analysis, document, passage
       FROM study
      WHERE id = $1
        AND (($2::uuid IS NOT NULL AND account_id = $2)
          OR ($2::uuid IS NULL AND account_id IS NULL AND install_id = $3))
      LIMIT 1`,
    [studyId, accountId, req.identity.installId || ''],
  )
  if (existing.rows[0]?.document && existing.rows[0]?.analysis) {
    const storedAnalysis = existing.rows[0].analysis
    return res.json({
      document: existing.rows[0].document,
      analysis: storedAnalysis,
      studyId,
      passage: existing.rows[0].passage || {
        reference: storedAnalysis.reference,
        translation: storedAnalysis.translation || normalizedTranslation,
        text: storedAnalysis.passageText || '',
        verses: [],
        copyright: '',
      },
      cached: true,
      idempotent: true,
    })
  }
  if (existing.rows.length) {
    const failed = existing.rows[0].state === 'failed'
    return res.status(failed ? 500 : 409).json({
      error: failed ? 'GUIDED_STUDY_FAILED' : 'STUDY_IN_PROGRESS',
      message: failed
        ? 'That guided study did not finish. Start it again.'
        : 'That guided study is still finishing. Give it a moment, then try again.',
    })
  }

  let passage
  try {
    passage = await mobile.fetchPassage({
      reference: reference.trim(),
      translation: normalizedTranslation,
      esvKey: req.get('x-esv-key') || '',
    })
  } catch (e) {
    return res.status(Number(e?.status) || 502).json({
      error: e?.code || 'PASSAGE_UNAVAILABLE',
      message: e?.message || 'That passage could not be loaded.',
    })
  }

  try {
    checkGenerationInput({ text: passage.text, reference: passage.reference })
  } catch (e) {
    return res.status(413).json({
      error: 'INPUT_TOO_LARGE',
      message: e?.message || 'That passage is too long to study in one go.',
    })
  }

  const ent = entitlementFor(req.identity.account)
  const { periodStart, periodEnd } = billingPeriodFor(req.identity.account)
  const refused = await claimStudy(req, {
    ent,
    accountId,
    periodStart,
    periodEnd,
    reservationId: studyId,
    reserveUsd: meter.GUIDED_STUDY_RESERVE_USD,
  })
  if (refused) return res.status(refused.status).json(refused.body)

  const reservationHeartbeat = setInterval(() => {
    meter.heartbeatStudyReservation(db, studyId).catch(() => {})
  }, meter.RESERVATION_HEARTBEAT_MS)
  reservationHeartbeat.unref?.()

  try {
    await engine.openStudy(db, {
      studyId, accountId, installId: req.identity.installId, reference: passage.reference,
    })
    const result = await engine.runGuidedStudy(db, {
      text: passage.text,
      reference: passage.reference,
      translation: passage.translation,
      accountId,
      studyId,
      installId: req.identity.installId,
    })
    const saved = await engine.saveStudyDocument(db, {
      studyId,
      accountId,
      installId: req.identity.installId,
      analysis: result.analysis,
      document: result.document,
      level: 'guided',
      passage,
    })
    if (!saved) throw new Error('The guided study could not be saved.')
    const actualUsd = await engine.studyCost(db, studyId)
    const settled = await meter.settleStudyReservation(db, {
      reservationId: studyId,
      actualUsd,
    })
    if (!settled) throw new Error('The guided study could not be settled safely.')
    res.json({ ...result, studyId, passage })
  } catch (e) {
    const spent = await engine.studyCost(db, studyId).catch(() => 0)
    await meter.releaseStudyReservation(db, studyId).catch(() => {})
    await db.query(
      `UPDATE study SET state = 'failed', updated_at = now()
        WHERE id = $1 AND state <> 'done'`,
      [studyId],
    ).catch(() => {})
    if (accountId) {
      await meter.recordAdditionalSpend(db, { accountId, periodStart, actualUsd: spent }).catch(() => {})
    }
    res.status(500).json({
      error: 'GUIDED_STUDY_FAILED',
      message: e?.message || 'The guided study could not be completed.',
    })
  } finally {
    clearInterval(reservationHeartbeat)
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
    const priorState = await engine.ownedStudyState(db, {
      studyId: priorStudyId, accountId, installId: req.identity.installId,
    })
    if (priorState === 'reading') {
      return res.status(409).json({
        error: 'STUDY_IN_PROGRESS',
        message: 'That reading is already being built. Give it a moment, then open it again.',
      })
    }
    if (priorState === 'done') {
      return res.status(409).json({
        error: 'STUDY_ALREADY_FINISHED',
        message: 'That reading is already finished. Open it from your Library.',
      })
    }
    freshStudyId = newStudyId()
    const refused = await claimStudy(req, {
      ent, accountId, periodStart, periodEnd, reservationId: freshStudyId,
    })
    if (refused) return res.status(refused.status).json(refused.body)
  }

  // Reusing the analyze id keeps the fan-out, the document, its retries and the
  // verify pass rolled up as one study in the ledger — which is what makes
  // cost-per-study a measured number rather than an estimate.
  const studyId = ridesPriorClaim ? priorStudyId : freshStudyId
  if (ridesPriorClaim) {
    const held = await meter.holdStudyReservationForReading(db, studyId)
    if (!held) {
      await engine.resetStudyReadingClaim(db, studyId).catch(() => {})
      return res.status(409).json({
        error: 'STUDY_RESERVATION_UNAVAILABLE',
        message: 'That study could not resume safely. Open it from your Library and try again.',
      })
    }
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
  if (!studyId) return res.status(400).json({ error: 'studyId is required' })
  if (!SERMON_AGENT_ROLES.has(agent)) return res.status(400).json({ error: 'a supported agent is required' })
  if (!question || !String(question).trim()) return res.status(400).json({ error: 'question is required' })
  if (String(question).length > 2000) {
    return res.status(413).json({ error: 'INPUT_TOO_LARGE', message: 'That question is too long.' })
  }
  if (JSON.stringify({ history }).length > MAX_ASK_CHARS) {
    return res.status(413).json({ error: 'INPUT_TOO_LARGE', message: 'That agent conversation is too large.' })
  }

  const accountId = req.identity.account?.id ?? null
  const installId = req.identity.installId
  const access = await resolveOwnedStudyDocument(db, {
    studyId, accountId, installId, surface: 'specialist',
  })
  if (!access.ok) return res.status(access.status).json(access.body)

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
      doc: access.study.document,
      analysis: access.study.analysis,
      question,
      history,
      accountId,
      installId,
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

// ── Beta feedback ───────────────────────────────────────────────────────────
/**
 * Where a tester's report actually lands.
 *
 * It used to POST to a Supabase project that has since been deleted — the host
 * does not resolve — so every submission failed and the app told nobody. Free
 * and unauthenticated on purpose: a man reporting that the app is broken must
 * not be blocked by the part of it that is broken.
 */
app.post('/v1/feedback', route(async (req, res) => {
  const { name, category, body, version, platform } = req.body || {}
  const text = String(body ?? '').trim()
  if (!text) return res.status(400).json({ error: 'body is required' })
  if (text.length > 8000) return res.status(413).json({ error: 'that is too long to submit' })

  const CATEGORIES = new Set(['Bug', 'Feature', 'UX', 'General', 'AI Report'])
  const { rows } = await db.query(
    `INSERT INTO feedback (name, category, body, version, platform, install_id, account_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
    [
      String(name ?? '').slice(0, 120) || null,
      CATEGORIES.has(category) ? category : 'General',
      text,
      String(version ?? '').slice(0, 40) || null,
      String(platform ?? '').slice(0, 40) || null,
      req.identity.installId ?? null,
      req.identity.account?.id ?? null,
    ],
  )
  res.json({ ok: true, id: rows[0].id, createdAt: rows[0].created_at })
}))

/**
 * The feed, newest first.
 *
 * NOT PUBLIC. Every row is a named beta tester's free-text report about a
 * pastor's Bible-study habits, and it was readable by anyone who guessed the
 * URL. Reading it requires a comp account — which in practice means Cole, Rikki
 * or a beta code holder, since comp is not for sale.
 */
app.get('/v1/feedback', route(async (req, res) => {
  if (!req.identity.account?.isAdmin) {
    return res.status(403).json({ error: 'FORBIDDEN' })
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const { rows } = await db.query(
    `SELECT id, created_at, name, category, body, version, platform, decision
       FROM feedback ORDER BY created_at DESC LIMIT $1`, [limit])
  res.json({ feedback: rows })
}))

// ── The corpus: what users' money has actually built ────────────────────────
/**
 * What the cache knows, in a form the vault can act on.
 *
 * THE POINT. Every study a user pays for leaves a content-addressed document
 * behind, and the next person to open that passage gets it free. That is the
 * asset compounding. This endpoint is how the Foundry learns what is in it and,
 * more importantly, WHAT PEOPLE ACTUALLY STUDY — which is information Cole
 * cannot get any other way and does not currently have.
 *
 * PRIVACY IS THE WHOLE DESIGN CONSTRAINT, not a footnote.
 * - No install ids, no account ids, no emails.
 * - No questions. A man's questions about a passage are pastoral material; they
 *   are the single most sensitive thing this server holds, and they are not
 *   exported at any aggregation level.
 * - Only Scripture references and counts leave here. A reference is public;
 *   who asked about it is not.
 *
 * Comp accounts only, same as the feedback feed.
 */
app.get('/v1/corpus', route(async (req, res) => {
  if (!req.identity.account?.isAdmin) {
    return res.status(403).json({ error: 'FORBIDDEN' })
  }

  const [demand, docs, refusals] = await Promise.all([
    // WHAT PEOPLE STUDY. Counted from the per-call ledger, which carries a
    // reference and nothing about who ran it.
    db.query(
      `SELECT reference, COUNT(DISTINCT study_id)::int AS studies
         FROM usage_event
        WHERE reference IS NOT NULL
          AND (label LIKE 'analyze%' OR label IN ('quick-study', 'guided-study'))
        GROUP BY reference
        ORDER BY studies DESC, reference
        LIMIT 200`),
    // WHAT THE CACHE HOLDS. The documents themselves are not returned — only
    // that they exist, so the vault can see coverage without pulling prose it
    // has no right to treat as scholarship.
    db.query(
      `SELECT COUNT(*)::int AS documents,
              COUNT(*) FILTER (WHERE cache_key LIKE 'analysis-cache%')::int AS analyses,
              MIN(created_at) AS first_at,
              MAX(updated_at) AS last_at
         FROM document_cache`),
    // WHERE IT FAILED OR REFUSED. The most useful signal of all, and the one a
    // success-only view hides.
    db.query(
      `SELECT state, COUNT(*)::int AS n FROM study GROUP BY state`),
  ])

  res.json({
    generatedAt: new Date().toISOString(),
    demand: demand.rows,
    cache: docs.rows[0],
    studyStates: Object.fromEntries(refusals.rows.map((r) => [r.state, r.n])),
    note: 'References and counts only. No install ids, no accounts, no questions.',
  })
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

  const refuse = () => res.status(404).json(invalidCodeResponse())

  const redeemed = await redeemAccessCode(db, { code: raw, installId, auth })
  if (!redeemed) return refuse()
  res.json(redeemed)
}))

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
