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
function makeRecorder(db, { accountId, studyId, reference }) {
  return (label, usage, model) => {
    if (!usage) return null
    const priced = priceCall(usage, model)
    // Never let accounting delay or break a study in progress.
    db.query(
      `INSERT INTO usage_event
         (account_id, study_id, label, model, input_tokens, output_tokens,
          cache_write_tokens, cache_read_tokens, usd, reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [accountId ?? null, studyId, label, model,
       priced.inputTokens, priced.outputTokens,
       priced.cacheWriteTokens, priced.cacheReadTokens,
       priced.costUsd, reference ?? null],
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
async function runPlainRead(db, { analysis, requestedReference, level, accountId, studyId, onSection }) {
  checkGenerationInput({ reference: requestedReference })

  const record = makeRecorder(db, { accountId, studyId, reference: requestedReference })
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

module.exports = { runPlainRead, makeRecorder, makeCache, preloadCache, writeCache, studyCost }
