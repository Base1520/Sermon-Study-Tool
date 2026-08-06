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
const { plainRead, cacheKeyFor } = require(path.join(ENGINE, 'pipeline'))
const { withRetry, parseModelJSON, checkGenerationInput } = require(path.join(ENGINE, 'runtime'))
const { priceCall } = require(path.join(ENGINE, 'usage'))
const { analyzePassage, analysisCacheKey, forGeneration } = require(path.join(ENGINE, 'analyze'))
const { askAboutPassage } = require(path.join(ENGINE, 'ask'))

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
function makeRecorder(db, { accountId, studyId, reference, installId }, pending) {
  return (label, usage, model) => {
    if (!usage) return null
    const priced = priceCall(usage, model)
    // Never let accounting delay or break a study in progress — but DO keep the
    // promise. Settlement sums these rows the instant the engine returns, and a
    // fire-and-forget insert can lose that race: studyCost() reads zero, the
    // reservation is released, and real spend never reaches the ledger or the
    // global ceiling. Collected here and awaited before anyone asks for a total.
    const write = db.query(
      `INSERT INTO usage_event
         (account_id, study_id, label, model, input_tokens, output_tokens,
          cache_write_tokens, cache_read_tokens, usd, reference, install_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [accountId ?? null, studyId, label, model,
       priced.inputTokens, priced.outputTokens,
       priced.cacheWriteTokens, priced.cacheReadTokens,
       priced.costUsd, reference ?? null, installId ?? null],
    ).catch((e) => console.error('[usage] write failed:', e.message))
    pending?.push(write)
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
async function runPlainRead(db, { analysis: rawAnalysis, requestedReference, level, accountId, studyId, installId, onSection }) {
  checkGenerationInput({ reference: requestedReference })

  // Strip per-user keys BEFORE anything hashes this. historyId rides in from the
  // renderer and would make every cache key unique — see forGeneration().
  const analysis = forGeneration(rawAnalysis)

  const pending = []
  const record = makeRecorder(db, { accountId, studyId, reference: requestedReference, installId }, pending)
  const writes = []
  // THE MARGIN LEVER, and it was switched off. This used to preload an EMPTY
  // key list, so the shared document cache could never hit and every account
  // paid full generation cost for a passage already written. cacheKeyFor() is
  // the pipeline's own key function, so the key we look up is by construction
  // the key it will look for.
  const preloaded = await preloadCache(db, [cacheKeyFor(analysis, level)])
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

  await Promise.allSettled([...writes, ...pending])
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

  const pending = []
  const record = makeRecorder(db, { accountId, studyId, reference, installId }, pending)
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
  await Promise.allSettled(pending)   // settlement reads these rows next
  return { analysis, cached: false }
}

/**
 * Answer a question about a reading already delivered.
 *
 * NOT a study, and deliberately not billed as one. The paywall's own words are
 * "read it, ask about it, export it" — charging a whole study to ask a follow-up
 * would make that sentence a lie. It is one small call against a document the
 * reader already paid for.
 *
 * Its cost is still recorded, so it reaches the global ceiling like everything
 * else. What bounds it is askCountToday() at the route.
 */
async function runAsk(db, { doc, analysis, question, history, vaultNotes, accountId, installId }) {
  const record = makeRecorder(db, {
    accountId, studyId: `ask-${Date.now().toString(36)}`,
    reference: analysis?.reference, installId,
  }, [])
  return askAboutPassage({
    doc, analysis, question, history, vaultNotes,
    apiKey: process.env.ANTHROPIC_API_KEY,
    createClient: (k) => new Anthropic.default({ apiKey: k }),
    retry: withRetry,
    parse: parseModelJSON,
    onUsage: record,
  })
}

/** How many questions this caller has asked in the last day. The bound on asks. */
async function askCountToday(db, { accountId, installId }) {
  const col = accountId ? 'account_id' : 'install_id'
  const val = accountId || installId
  if (!val) return Number.MAX_SAFE_INTEGER
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM usage_event
      WHERE ${col} = $1 AND label LIKE 'ask%' AND at > now() - interval '24 hours'`,
    [val],
  )
  return rows[0].n
}

/**
 * Is this exact reading already written?
 *
 * Checked BEFORE anyone is charged. The route used to claim a study first and
 * only look in the cache deep inside generation, which meant a document that
 * costs nothing to serve was still billed — every time. It is the difference
 * between "re-opening a study is free" and a free user losing his one credit to
 * a document already sitting in the database.
 */
async function cachedDocument(db, analysis, level) {
  try {
    const key = cacheKeyFor(forGeneration(analysis), level)
    const { rows } = await db.query(
      `SELECT document FROM document_cache WHERE cache_key = $1`, [key])
    return rows[0]?.document ?? null
  } catch {
    // A cache lookup must never be the thing that fails a reading.
    return null
  }
}

/**
 * Write the claim, the moment it is charged for.
 *
 * MUST NOT depend on model usage. It used to: ownership was inferred from
 * usage_event, so a CACHE HIT — which spends nothing and writes no usage rows —
 * produced a study its owner could not prove. In the product's most common path
 * (someone studies a passage another user already ran) a free user spent their
 * one lifetime credit and was then refused the reading.
 */
async function openStudy(db, { studyId, accountId, installId, reference }) {
  await db.query(
    `INSERT INTO study (id, account_id, install_id, reference, state)
          VALUES ($1, $2, $3, $4, 'analyzed')
     ON CONFLICT (id) DO NOTHING`,
    [studyId, accountId ?? null, installId ?? null, reference ?? null],
  )
}

/**
 * Try to take this study's ONE document, atomically.
 *
 * Returns true only for the caller that wins. The old check was a SELECT
 * followed by a decision, so two simultaneous readings could both see "no
 * document yet" and both generate — one claim, two bills, both paid by Cole.
 * A conditional UPDATE makes the winner unambiguous.
 *
 * The identity clause is the ownership check too, so a study can only be
 * claimed by the account that bought it or, for a free study, by the install
 * that bought it. `account_id IS NULL` on the anonymous branch stops a leaked
 * study id being used to ride a paying customer's reservation.
 */
async function claimStudyForReading(db, { studyId, accountId, installId }) {
  if (!studyId) return false
  const identity = accountId
    ? { clause: 'account_id = $2', param: accountId }
    : { clause: 'install_id = $2 AND account_id IS NULL', param: installId }
  if (!identity.param) return false

  const { rows } = await db.query(
    `UPDATE study
        SET state = 'reading', updated_at = now()
      WHERE id = $1 AND ${identity.clause} AND state = 'analyzed'
      RETURNING id`,
    [studyId, identity.param],
  )
  return rows.length > 0
}

/** The document was delivered. The claim is spent. */
async function finishStudy(db, studyId) {
  await db.query(`UPDATE study SET state = 'done', updated_at = now() WHERE id = $1`, [studyId])
}

/**
 * The reading failed. Put the claim back so a retry can ride it.
 *
 * Without this, a man whose document failed validation would be charged a second
 * study to try again for something he never received.
 */
const MAX_RETRIES_PER_STUDY = 3

async function releaseStudyForRetry(db, studyId) {
  // COUNTED. An unconditional release is a free-generation machine: ride the
  // claim, disconnect mid-stream, the claim returns to 'analyzed', ride it
  // again — every attempt spending real Opus tokens and none of them ever
  // costing a study. Three attempts covers every honest failure (a validation
  // retry, a dropped connection, a crash) and closes the loop.
  // 'stranded', NOT 'done'. Marking an exhausted claim 'done' said a document
  // had been delivered when none had — the user was left with no reading, no
  // retry and no refund, and the client kept replaying a dead id. A distinct
  // state lets the route hand the credit back and lets Cole find these rows.
  const { rows } = await db.query(
    `UPDATE study
        SET state = CASE WHEN retries >= $2 THEN 'stranded' ELSE 'analyzed' END,
            retries = retries + 1,
            updated_at = now()
      WHERE id = $1 AND state = 'reading'
      RETURNING state`,
    [studyId, MAX_RETRIES_PER_STUDY])
  return rows[0]?.state ?? null
}

module.exports = {
  runPlainRead, runAnalyze, makeRecorder, makeCache, preloadCache, writeCache,
  studyCost, openStudy, claimStudyForReading, finishStudy, releaseStudyForRetry,
  runAsk, askCountToday, MAX_RETRIES_PER_STUDY, cachedDocument,
}
