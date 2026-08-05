/**
 * engine.js — the server's adapter onto the reading engine.
 *
 * The engine itself is untouched: electron/plainread/* imports nothing from
 * Electron and takes every dependency by injection. This file supplies the
 * server's versions of those dependencies — a Postgres-backed cache instead of
 * electron-store, the server's key instead of the user's, a usage recorder that
 * writes to a table instead of a file.
 *
 * Nothing here reimplements the engine. If a reading differs between the
 * desktop app and the server, that is a bug in this file.
 */

const path = require('path')
const Anthropic = require('@anthropic-ai/sdk')

const ENGINE = path.join(__dirname, '../../electron/plainread')
const { plainRead } = require(path.join(ENGINE, 'pipeline'))
const { withRetry, parseModelJSON, checkGenerationInput } = require(path.join(ENGINE, 'runtime'))
const { priceCall } = require(path.join(ENGINE, 'usage'))
const { analyzePassage, analysisCacheKey } = require(path.join(ENGINE, 'analyze'))

/**
 * A cache backed by Postgres, shaped like the one the engine expects.
 *
 * SHARED ACROSS EVERY ACCOUNT, ON PURPOSE. The engine's cache key is content-
 * addressed — it contains no user identity — so the second man to study Romans 8
 * gets the first man's document at zero marginal cost. That is the single
 * biggest margin lever in the hosted model and it costs nothing to take.
 *
 * get() is synchronous in the engine's contract, so the row is loaded before
 * the call and handed in as a plain object.
 */
function makeCache(preloaded, onWrite) {
  return {
    get: (key) => preloaded.get(key) ?? null,
    set: (key, value) => { preloaded.set(key, value); onWrite?.(key, value) },
  }
}

/** Load any cached documents this request might hit, in one round trip. */
async function preloadCache(db, keys) {
  const map = new Map()
  if (!keys.length) return map
  const { rows } = await db.query(
    `SELECT cache_key, document FROM document_cache WHERE cache_key = ANY($1)`,
    [keys],
  )
  for (const r of rows) map.set(r.cache_key, r.document)
  return map
}

/** Persist a generated document so nobody ever pays for it twice. */
async function writeCache(db, key, document) {
  await db.query(
    `INSERT INTO document_cache (cache_key, document)
          VALUES ($1, $2)
     ON CONFLICT (cache_key) DO UPDATE SET document = $2, updated_at = now()`,
    [key, document],
  )
}

/**
 * Record one model call, priced from Anthropic's own returned token counts.
 *
 * This is what finally replaces an estimated cost-per-study with a measured
 * one. Every row carries the study id, so the analyze fan-out, the document,
 * its retries and the verify pass roll up into a single number per study.
 */
function makeRecorder(db, { accountId, studyId, reference, installId }) {
  return (label, usage, model) => {
    if (!usage) return null
    const priced = priceCall(usage, model)
    // Never let accounting delay or break a study in progress.
    db.query(
      `INSERT INTO usage_event
         (account_id, study_id, label, model, input_tokens, output_tokens,
          cache_write_tokens, cache_read_tokens, usd, reference, install_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [accountId ?? null, studyId, label, model,
       priced.inputTokens, priced.outputTokens,
       priced.cacheWriteTokens, priced.cacheReadTokens,
       priced.costUsd, reference ?? null, installId ?? null],
    ).catch((e) => console.error('[usage] write failed:', e.message))
    return priced
  }
}

/** Total what a study actually cost, for settling its reservation. */
async function studyCost(db, studyId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(usd), 0) AS usd FROM usage_event WHERE study_id = $1`,
    [studyId],
  )
  return Number(rows[0].usd)
}

/**
 * Run a reading.
 *
 * `onSection` is passed straight through, so sections stream to the client as
 * they complete exactly as they do on the desktop — the reader starts reading
 * while the rest is still being written, rather than watching a spinner for a
 * hundred seconds.
 */
async function runPlainRead(db, { analysis, requestedReference, level, accountId, studyId, installId, onSection }) {
  checkGenerationInput({ reference: requestedReference })

  const record = makeRecorder(db, { accountId, studyId, reference: requestedReference, installId })
  const writes = []
  const preloaded = await preloadCache(db, [])   // engine computes its own key; misses write through
  const cache = makeCache(preloaded, (k, v) => writes.push(writeCache(db, k, v)))

  const doc = await plainRead({
    analysis,
    requestedReference,
    ...(level ? { level } : {}),
    apiKey: process.env.ANTHROPIC_API_KEY,
    createClient: (key) => new Anthropic.default({ apiKey: key }),
    cache,
    retry: withRetry,
    parse: parseModelJSON,
    onSection,
    onUsage: record,
  })

  await Promise.allSettled(writes)
  return doc
}

/**
 * Run the analysis fan-out — the first half of a study.
 *
 * Cached in the same content-addressed table as documents and under the engine's
 * own key function, so the desktop and the server agree on what counts as the
 * same analysis. The second man to open Romans 8 pays nothing for this half
 * either.
 */
async function runAnalyze(db, { text, reference, accountId, studyId, installId, onStage }) {
  const key = analysisCacheKey(reference, text)

  const { rows } = await db.query(
    `SELECT document FROM document_cache WHERE cache_key = $1`, [key])
  if (rows.length) return { analysis: rows[0].document, cached: true }

  const record = makeRecorder(db, { accountId, studyId, reference, installId })
  const analysis = await analyzePassage({
    text,
    reference,
    apiKey: process.env.ANTHROPIC_API_KEY,
    createClient: (k) => new Anthropic.default({ apiKey: k }),
    retry: withRetry,
    parse: parseModelJSON,
    onStage,
    onUsage: record,
  })

  await writeCache(db, key, analysis)
  return { analysis, cached: false }
}

/**
 * Has this study already produced a document?
 *
 * The guard that lets /v1/read ride the reservation /v1/analyze already made.
 * A study id only exists because analyze paid for it, and one reservation buys
 * exactly one document — so a client replaying the same id cannot get a second
 * one for free.
 */
async function studyHasDocument(db, studyId) {
  const { rows } = await db.query(
    `SELECT 1 FROM usage_event WHERE study_id = $1 AND label LIKE 'plain-read%' LIMIT 1`,
    [studyId],
  )
  return rows.length > 0
}

/**
 * Does this study id belong to this caller?
 *
 * ANONYMOUS COUNTS. It used to require an account, and that quietly broke the
 * single most important screen in the product: a free user spent their one
 * lifetime study on /v1/analyze and was then refused the reading — shown a
 * paywall promising "it stays here, read it, export it" about a document that
 * had never been generated. The free study has to deliver a WHOLE study.
 *
 * Still bounded, because riding also requires that the study has not already
 * produced a document: one reservation, one document. A free user cannot get a
 * second one without a new analysis, and that is refused.
 */
async function studyBelongsTo(db, studyId, { accountId, installId }) {
  if (!studyId) return false
  if (accountId) {
    const { rows } = await db.query(
      `SELECT 1 FROM usage_event WHERE study_id = $1 AND account_id = $2 LIMIT 1`,
      [studyId, accountId],
    )
    return rows.length > 0
  }
  if (!installId) return false
  // An anonymous study must ALSO have no account on it, so a leaked study id
  // cannot be used to ride a paying customer's reservation.
  const { rows } = await db.query(
    `SELECT 1 FROM usage_event
      WHERE study_id = $1 AND install_id = $2 AND account_id IS NULL LIMIT 1`,
    [studyId, installId],
  )
  return rows.length > 0
}

module.exports = {
  runPlainRead, runAnalyze, makeRecorder, makeCache, preloadCache, writeCache,
  studyCost, studyHasDocument, studyBelongsTo,
}
