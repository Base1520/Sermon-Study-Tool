/**
 * routes/generation.js — the generated-study entry points.
 *
 * Extracted verbatim from index.js on 2026-08-15 in the fixability sequence:
 * analyze, Quick Study, then Guided Study. Registration still happens at the
 * former position before /v1/read, so middleware and route order are unchanged.
 * The money/account helpers remain owned by index.js and are injected here;
 * this module registers route bodies and owns no server or database lifecycle.
 */

const crypto = require('crypto')

const QUICK_STUDY_TRANSLATIONS = new Set(['kjv', 'asv', 'web', 'ylt', 'esv'])
const QUICK_REQUEST_ID = /^[a-f0-9-]{20,80}$/i

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

function mount(app, db, {
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
}) {
  // ── The analysis ──────────────────────────────────────────────────────────
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

  // ── Mobile quick study ───────────────────────────────────────────────────
  // One metered call, one compact answer. The desktop's full analyze + read
  // pipeline remains intact; the phone never runs it just to answer a quick
  // passage question.
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

  // ── Tablet guided study ──────────────────────────────────────────────────
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
}

module.exports = { mount }
