/**
 * routes/generation.js — the generated-study entry points.
 *
 * Extracted verbatim from index.js on 2026-08-15 in the fixability sequence:
 * analyze, Quick Study, then Guided Study. Registration still happens at the
 * former position before /v1/read, so middleware and route order are unchanged.
 * The money/account helpers remain owned by index.js and are injected here;
 * this module registers route bodies and owns no server or database lifecycle.
 */

const requestIdempotency = require('../request-idempotency')

const QUICK_STUDY_TRANSLATIONS = new Set(['kjv', 'asv', 'web', 'ylt', 'esv'])

async function reconcilePersistedStudy({ db, meter, engine, studyId }) {
  let state
  try {
    state = await meter.studyReservationState(db, studyId)
  } catch {
    return { ok: false, retryable: true, state: 'unknown' }
  }
  if (state === 'settled') return { ok: true, state }
  if (state !== 'held') return { ok: false, retryable: false, state }

  try {
    const actualUsd = await engine.studyCost(db, studyId)
    if (await meter.settleStudyReservation(db, { reservationId: studyId, actualUsd })) {
      return { ok: true, state: 'settled' }
    }
    state = await meter.studyReservationState(db, studyId)
    if (state === 'settled') return { ok: true, state }
    if (state !== 'held') return { ok: false, retryable: false, state }
  } catch {
    // The saved result is the customer's, but it is not deliverable until its
    // charge is known. Keep the allowance held and keep the global brake aware.
  }

  await meter.markStudyReservationAccountingUncertain(db, studyId).catch(() => {})
  return { ok: false, retryable: true, state: 'held' }
}

function mount(app, db, {
  route,
  checkGenerationInput,
  entitlementFor,
  billingPeriodFor,
  claimStudy,
  sendClaimRefusal,
  newStudyId,
  requireGeneratedStudyAccount,
  AI_PROCESSING_CONSENT_VERSION,
  meter,
  modelAdmission,
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
    if (!requireGeneratedStudyAccount(req, res)) return
    const { text, reference, requestId } = req.body || {}
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

    const accountId = req.identity.account?.id ?? null
    let idempotency
    try {
      idempotency = requestIdempotency.describe({
        ownerId: accountId || req.identity.installId,
        route: 'analyze',
        requestId,
        payload: { text, reference },
        // main used `const studyId = newStudyId()` here and the shipped desktop
        // sends no requestId, so a hard requirement would break Analyze for every
        // installed copy. quick-study and guided-study below stay strict: they
        // already 400 without one on main, and the mobile client sends it.
        allowSynthetic: true,
      })
    } catch {
      return res.status(400).json({
        error: 'REQUEST_ID_REQUIRED',
        message: 'A valid requestId is required for a generated study.',
      })
    }
    const studyId = idempotency.id
    const prior = await engine.ownedStudyAnalysis(db, {
      studyId,
      accountId,
      installId: req.identity.installId,
    })
    if (prior) {
      if (prior.request_hash !== idempotency.requestHash) {
        return res.status(409).json({
          error: 'REQUEST_ID_REUSED',
          message: 'That request identifier was already used for different content. Try again.',
        })
      }
      if (prior.analysis) {
        const settlement = await reconcilePersistedStudy({ db, meter, engine, studyId })
        if (settlement.ok) {
          return res.json({ analysis: prior.analysis, studyId, cached: true, idempotent: true })
        }
        return res.status(settlement.retryable ? 503 : 409).json({
          error: settlement.retryable ? 'ACCOUNTING_UNAVAILABLE' : 'REQUEST_RESULT_UNAVAILABLE',
          message: settlement.retryable
            ? 'The study is saved, but its usage record is still being reconciled. Try again in a moment.'
            : 'That study result could not be matched to a valid charge. Contact support before trying it again.',
        })
      }
      const reservationState = await meter.studyReservationState(db, studyId)
      if (reservationState === 'held') {
        res.setHeader('Retry-After', '5')
        return res.status(409).json({
          error: 'REQUEST_IN_PROGRESS',
          message: 'That study is still being built. Try again in a moment.',
        })
      }
      return res.status(409).json({
        error: reservationState === 'settled' ? 'REQUEST_RESULT_UNAVAILABLE' : 'REQUEST_CLOSED',
        message: reservationState === 'settled'
          ? 'That study was charged but its result could not be recovered. Contact support before trying it again.'
          : 'That study attempt closed without a result. Try again to open a new attempt.',
      })
    }

    const ent = entitlementFor(req.identity.account)
    const { periodStart, periodEnd } = billingPeriodFor(req.identity.account)
    const modelAdmissionId = `analyze-${studyId}`

    const refused = await claimStudy(req, {
      ent, accountId, periodStart, periodEnd, reservationId: studyId,
      modelAdmissionRequest: { id: modelAdmissionId, route: 'analyze' },
    })
    if (refused) return sendClaimRefusal(res, refused)

    const reservationHeartbeat = setInterval(() => {
      meter.heartbeatStudyReservation(db, studyId).catch(() => {})
      modelAdmission.heartbeat(db, modelAdmissionId).catch(() => {})
    }, meter.RESERVATION_HEARTBEAT_MS)
    reservationHeartbeat.unref?.()

    // The claim is written BEFORE the work, and never depends on the work. A cache
    // hit spends nothing and writes no usage rows; inferring ownership from usage
    // meant a cached analysis produced a study its owner could not prove — and
    // being served from cache is the COMMON case, not the rare one.
    let analysisProduced = false
    let analysisSaved = false
    try {
      await engine.openStudy(db, {
        studyId,
        accountId,
        installId: req.identity.installId,
        reference,
        requestHash: idempotency.requestHash,
      })
      const { analysis, cached } = await engine.runAnalyze(db, {
        text, reference, accountId, studyId, installId: req.identity.installId,
      })
      analysisProduced = true
      const saved = await engine.saveStudyAnalysis(db, {
        studyId,
        accountId,
        installId: req.identity.installId,
        analysis,
      })
      if (!saved) throw new Error('The study result could not be saved safely.')
      analysisSaved = true
      const actualUsd = await engine.studyCost(db, studyId)
      const settled = await meter.settleStudyReservation(db, {
        reservationId: studyId,
        actualUsd,
      })
      if (!settled) throw new Error('The study could not be settled safely.')
      res.json({ analysis, studyId, cached })
    } catch (e) {
      // "No result returned" is NOT "no money spent". The fan-out runs up to three
      // calls in parallel and only two are fatal, so a failure here routinely lands
      // AFTER real tokens were billed. Book what was actually spent before handing
      // the credit back, or a retry loop burns money the ceiling never sees.
      const usageAccountingFailed = engine.isUsageAccountingError(e)
      let accountingUncertain = usageAccountingFailed || analysisProduced
      let spent = 0
      try { spent = await engine.studyCost(db, studyId) } catch { accountingUncertain = true }
      if (analysisSaved) {
        await meter.markStudyReservationAccountingUncertain(db, studyId).catch(() => {})
      } else {
        await meter.releaseStudyReservation(db, studyId, { accountingUncertain }).catch(() => {})
        await db.query(
          `UPDATE study SET state = 'failed', updated_at = now()
            WHERE id = $1 AND analysis IS NULL`,
          [studyId],
        ).catch(() => {})
        if (accountId) {
          await meter.recordAdditionalSpend(db, { accountId, periodStart, actualUsd: spent }).catch(() => {})
        }
      }
      const code = analysisSaved || usageAccountingFailed
        ? 'ACCOUNTING_UNAVAILABLE'
        : analysisProduced
          ? 'GENERATION_STATE_UNAVAILABLE'
        : (e?.code === 'INPUT_TOO_LARGE' ? 'INPUT_TOO_LARGE' : 'ANALYSIS_FAILED')
      res.status(code === 'INPUT_TOO_LARGE' ? 413 : (accountingUncertain ? 503 : 500))
         .json({
           error: code,
           message: analysisSaved
             ? 'The study is saved, but its usage record is still being reconciled. Try again in a moment.'
             : usageAccountingFailed
             ? 'The Operator paused that study because usage could not be recorded safely. Try again in a moment.'
             : analysisProduced
               ? 'The Operator finished the model work but could not save the study safely. Try again in a moment.'
             : (e?.message || 'The analysis could not be completed.'),
         })
    } finally {
      await modelAdmission.finish(db, modelAdmissionId).catch(() => {})
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
    const accountId = req.identity.account?.id ?? null
    let idempotency
    try {
      idempotency = requestIdempotency.describe({
        ownerId: accountId || req.identity.installId,
        route: 'quick-study',
        requestId,
        payload: { reference: reference.trim(), translation: normalizedTranslation },
      })
    } catch {
      return res.status(400).json({ error: 'a valid requestId is required' })
    }
    const studyId = idempotency.id
    const existing = await db.query(
      `SELECT state, analysis, document, passage, request_hash
         FROM study
        WHERE id = $1
          AND (($2::uuid IS NOT NULL AND account_id = $2)
            OR ($2::uuid IS NULL AND account_id IS NULL AND install_id = $3))
        LIMIT 1`,
      [studyId, accountId, req.identity.installId || ''],
    )
    const existingStudy = existing.rows[0] || null
    if (existingStudy && existingStudy.request_hash !== idempotency.requestHash) {
      return res.status(409).json({
        error: 'REQUEST_ID_REUSED',
        message: 'That request identifier was already used for different content. Try again.',
      })
    }
    if (existingStudy?.document && existingStudy?.analysis) {
      const settlement = await reconcilePersistedStudy({ db, meter, engine, studyId })
      if (!settlement.ok) {
        return res.status(settlement.retryable ? 503 : 409).json({
          error: settlement.retryable ? 'ACCOUNTING_UNAVAILABLE' : 'REQUEST_RESULT_UNAVAILABLE',
          message: settlement.retryable
            ? 'The Quick Study is saved, but its usage record is still being reconciled. Try again in a moment.'
            : 'That Quick Study could not be matched to a valid charge. Contact support before trying it again.',
        })
      }
      const storedAnalysis = existingStudy.analysis
      return res.json({
        document: existingStudy.document,
        analysis: storedAnalysis,
        studyId,
        passage: existingStudy.passage || {
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
    if (existingStudy) {
      const failed = existingStudy.state === 'failed'
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
    const modelAdmissionId = `quick-${studyId}`
    const refused = await claimStudy(req, {
      ent,
      accountId,
      periodStart,
      periodEnd,
      reservationId: studyId,
      reserveUsd: meter.QUICK_STUDY_RESERVE_USD,
      modelAdmissionRequest: { id: modelAdmissionId, route: 'quick-study' },
    })
    if (refused) return sendClaimRefusal(res, refused)

    const reservationHeartbeat = setInterval(() => {
      meter.heartbeatStudyReservation(db, studyId).catch(() => {})
      modelAdmission.heartbeat(db, modelAdmissionId).catch(() => {})
    }, meter.RESERVATION_HEARTBEAT_MS)
    reservationHeartbeat.unref?.()

    let resultSaved = false
    try {
      await engine.openStudy(db, {
        studyId, accountId, installId: req.identity.installId, reference: passage.reference,
        requestHash: idempotency.requestHash,
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
      resultSaved = true
      const actualUsd = await engine.studyCost(db, studyId)
      const settled = await meter.settleStudyReservation(db, {
        reservationId: studyId,
        actualUsd,
      })
      if (!settled) throw new Error('The Quick Study could not be settled safely.')
      res.json({ ...result, studyId, passage })
    } catch (e) {
      let accountingUncertain = engine.isUsageAccountingError(e)
      let spent = 0
      try { spent = await engine.studyCost(db, studyId) } catch { accountingUncertain = true }
      if (resultSaved) {
        accountingUncertain = true
        await meter.markStudyReservationAccountingUncertain(db, studyId).catch(() => {})
      } else {
        await meter.releaseStudyReservation(db, studyId, { accountingUncertain }).catch(() => {})
        await db.query(
          `UPDATE study SET state = 'failed', updated_at = now()
            WHERE id = $1 AND state <> 'done'`,
          [studyId],
        ).catch(() => {})
        if (accountId) {
          await meter.recordAdditionalSpend(db, { accountId, periodStart, actualUsd: spent }).catch(() => {})
        }
      }
      res.status(accountingUncertain ? 503 : 500).json({
        error: accountingUncertain ? 'ACCOUNTING_UNAVAILABLE' : 'QUICK_STUDY_FAILED',
        message: accountingUncertain
          ? 'The Operator paused that study because usage could not be recorded safely. Try again in a moment.'
          : (e?.message || 'The quick study could not be completed.'),
      })
    } finally {
      await modelAdmission.finish(db, modelAdmissionId).catch(() => {})
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
    const accountId = req.identity.account?.id ?? null
    let idempotency
    try {
      idempotency = requestIdempotency.describe({
        ownerId: accountId || req.identity.installId,
        route: 'guided-study',
        requestId,
        payload: { reference: reference.trim(), translation: normalizedTranslation },
      })
    } catch {
      return res.status(400).json({ error: 'a valid requestId is required' })
    }
    const studyId = idempotency.id
    const existing = await db.query(
      `SELECT state, analysis, document, passage, request_hash
         FROM study
        WHERE id = $1
          AND (($2::uuid IS NOT NULL AND account_id = $2)
            OR ($2::uuid IS NULL AND account_id IS NULL AND install_id = $3))
        LIMIT 1`,
      [studyId, accountId, req.identity.installId || ''],
    )
    const existingStudy = existing.rows[0] || null
    if (existingStudy && existingStudy.request_hash !== idempotency.requestHash) {
      return res.status(409).json({
        error: 'REQUEST_ID_REUSED',
        message: 'That request identifier was already used for different content. Try again.',
      })
    }
    if (existingStudy?.document && existingStudy?.analysis) {
      const settlement = await reconcilePersistedStudy({ db, meter, engine, studyId })
      if (!settlement.ok) {
        return res.status(settlement.retryable ? 503 : 409).json({
          error: settlement.retryable ? 'ACCOUNTING_UNAVAILABLE' : 'REQUEST_RESULT_UNAVAILABLE',
          message: settlement.retryable
            ? 'The guided study is saved, but its usage record is still being reconciled. Try again in a moment.'
            : 'That guided study could not be matched to a valid charge. Contact support before trying it again.',
        })
      }
      const storedAnalysis = existingStudy.analysis
      return res.json({
        document: existingStudy.document,
        analysis: storedAnalysis,
        studyId,
        passage: existingStudy.passage || {
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
    if (existingStudy) {
      const failed = existingStudy.state === 'failed'
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
    const modelAdmissionId = `guided-${studyId}`
    const refused = await claimStudy(req, {
      ent,
      accountId,
      periodStart,
      periodEnd,
      reservationId: studyId,
      reserveUsd: meter.GUIDED_STUDY_RESERVE_USD,
      modelAdmissionRequest: { id: modelAdmissionId, route: 'guided-study' },
    })
    if (refused) return sendClaimRefusal(res, refused)

    const reservationHeartbeat = setInterval(() => {
      meter.heartbeatStudyReservation(db, studyId).catch(() => {})
      modelAdmission.heartbeat(db, modelAdmissionId).catch(() => {})
    }, meter.RESERVATION_HEARTBEAT_MS)
    reservationHeartbeat.unref?.()

    let resultSaved = false
    try {
      await engine.openStudy(db, {
        studyId, accountId, installId: req.identity.installId, reference: passage.reference,
        requestHash: idempotency.requestHash,
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
      resultSaved = true
      const actualUsd = await engine.studyCost(db, studyId)
      const settled = await meter.settleStudyReservation(db, {
        reservationId: studyId,
        actualUsd,
      })
      if (!settled) throw new Error('The guided study could not be settled safely.')
      res.json({ ...result, studyId, passage })
    } catch (e) {
      let accountingUncertain = engine.isUsageAccountingError(e)
      let spent = 0
      try { spent = await engine.studyCost(db, studyId) } catch { accountingUncertain = true }
      if (resultSaved) {
        accountingUncertain = true
        await meter.markStudyReservationAccountingUncertain(db, studyId).catch(() => {})
      } else {
        await meter.releaseStudyReservation(db, studyId, { accountingUncertain }).catch(() => {})
        await db.query(
          `UPDATE study SET state = 'failed', updated_at = now()
            WHERE id = $1 AND state <> 'done'`,
          [studyId],
        ).catch(() => {})
        if (accountId) {
          await meter.recordAdditionalSpend(db, { accountId, periodStart, actualUsd: spent }).catch(() => {})
        }
      }
      res.status(accountingUncertain ? 503 : 500).json({
        error: accountingUncertain ? 'ACCOUNTING_UNAVAILABLE' : 'GUIDED_STUDY_FAILED',
        message: accountingUncertain
          ? 'The Operator paused that study because usage could not be recorded safely. Try again in a moment.'
          : (e?.message || 'The guided study could not be completed.'),
      })
    } finally {
      await modelAdmission.finish(db, modelAdmissionId).catch(() => {})
      clearInterval(reservationHeartbeat)
    }
  }))
}

module.exports = { mount, reconcilePersistedStudy }
