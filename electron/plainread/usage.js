// Token accounting. What a study ACTUALLY costs, not what it was estimated to.
//
// Every number in the pricing work so far — $0.42 a cold study, $0.21 warm,
// ~$7.50 a month blended — is derived from max_tokens ceilings and a handful of
// logged runs. Models rarely run to their ceiling, so those figures are upper
// bounds wearing the clothes of measurements. A price set on them is a guess.
//
// Anthropic returns exact counts on every response. This records them, prices
// them, and appends one line per call. Twenty real studies turns every estimate
// in the plan into a fact — and the cap number, which is the single most
// important figure in a metered product, stops being guesswork.
//
// Pure Node. The writer is injected, so this unit-tests without touching disk
// and moves to the server unchanged.

/**
 * Published rates, US dollars per million tokens.
 *
 * VERIFIED 2026-07-30 against https://platform.claude.com/docs/en/about-claude/pricing
 *
 * TIME BOMB: Sonnet's introductory rate ends 2026-08-31, when input goes $2 -> $3
 * and output $10 -> $15. That is a 50% jump landing five weeks before the Oct 5-10
 * launch. The table below already carries the POST-increase Sonnet numbers, so
 * margins computed here are the ones that will still be true on launch day
 * rather than the ones that expire.
 */
const RATES = {
  'claude-opus-4-8':           { in: 5.00, out: 25.00 },
  'claude-opus-5':             { in: 5.00, out: 25.00 },
  'claude-sonnet-4-6':         { in: 3.00, out: 15.00 },
  'claude-sonnet-5':           { in: 3.00, out: 15.00 },
  'claude-haiku-4-5-20251001': { in: 1.00, out: 5.00 },
  'claude-haiku-4-5':          { in: 1.00, out: 5.00 },
}

// Cache writes cost 1.25x the input rate; reads cost 0.1x. Both are multipliers
// on the model's own input price, not flat figures.
const CACHE_WRITE_MULT = 1.25
const CACHE_READ_MULT = 0.10

/** Rates for a model id, falling back to Opus so an unknown model over-reports rather than under-reports. */
function ratesFor(model) {
  if (RATES[model]) return RATES[model]
  const prefix = Object.keys(RATES).find((k) => typeof model === 'string' && model.startsWith(k))
  return prefix ? RATES[prefix] : RATES['claude-opus-4-8']
}

/**
 * Price a single API response.
 *
 * @param {object} usage Anthropic's usage object
 * @param {string} model
 * @returns {{ costUsd:number, inputTokens:number, outputTokens:number,
 *             cacheWriteTokens:number, cacheReadTokens:number, breakdown:object }}
 */
function priceCall(usage, model) {
  const r = ratesFor(model)
  const inTok = Number(usage?.input_tokens) || 0
  const outTok = Number(usage?.output_tokens) || 0
  const cwTok = Number(usage?.cache_creation_input_tokens) || 0
  const crTok = Number(usage?.cache_read_input_tokens) || 0

  const breakdown = {
    input: (inTok / 1e6) * r.in,
    output: (outTok / 1e6) * r.out,
    cacheWrite: (cwTok / 1e6) * r.in * CACHE_WRITE_MULT,
    cacheRead: (crTok / 1e6) * r.in * CACHE_READ_MULT,
  }

  return {
    costUsd: breakdown.input + breakdown.output + breakdown.cacheWrite + breakdown.cacheRead,
    inputTokens: inTok,
    outputTokens: outTok,
    cacheWriteTokens: cwTok,
    cacheReadTokens: crTok,
    breakdown,
  }
}

/**
 * Build a recorder that appends one JSONL line per call.
 *
 * @param {(line:string)=>void} write injected — a file appender in the app, a
 *        database insert on the server, a no-op in tests
 * @param {()=>string} now injected so tests are deterministic
 */
function createRecorder(write, now = () => new Date().toISOString()) {
  return function record(label, usage, model, extra = {}) {
    if (!usage) return null
    const priced = priceCall(usage, model)
    const row = {
      at: now(),
      label,                       // which call: 'analyze.theme', 'plain-read', 'verify'...
      model,
      in: priced.inputTokens,
      out: priced.outputTokens,
      cacheWrite: priced.cacheWriteTokens,
      cacheRead: priced.cacheReadTokens,
      usd: Number(priced.costUsd.toFixed(6)),
      ...extra,
    }
    try {
      write(JSON.stringify(row) + '\n')
    } catch {
      // Accounting must never take down a study in progress.
    }
    return row
  }
}

/**
 * Summarize a ledger into the numbers that actually set a price.
 *
 * @param {object[]} rows parsed JSONL
 * @returns per-call and per-study costs, plus what a monthly cap would cost
 */
function summarize(rows = []) {
  const valid = rows.filter((r) => r && typeof r.usd === 'number')
  if (!valid.length) return { calls: 0, totalUsd: 0, note: 'no data yet' }

  const byLabel = {}
  for (const r of valid) {
    const b = (byLabel[r.label] ??= { calls: 0, usd: 0, in: 0, out: 0, cacheRead: 0 })
    b.calls++
    b.usd += r.usd
    b.in += r.in || 0
    b.out += r.out || 0
    b.cacheRead += r.cacheRead || 0
  }
  for (const b of Object.values(byLabel)) b.avgUsd = Number((b.usd / b.calls).toFixed(4))

  // A "study" is one full journey: the analyze fan-out, the document, the
  // verifier. Group by the studyId the caller stamps on each row.
  const studies = {}
  for (const r of valid) {
    if (!r.studyId) continue
    studies[r.studyId] = (studies[r.studyId] || 0) + r.usd
  }
  const studyCosts = Object.values(studies).sort((a, b) => a - b)
  const pct = (p) => (studyCosts.length ? studyCosts[Math.min(studyCosts.length - 1, Math.floor(studyCosts.length * p))] : 0)

  const median = pct(0.5)
  const totalUsd = valid.reduce((s, r) => s + r.usd, 0)

  return {
    calls: valid.length,
    totalUsd: Number(totalUsd.toFixed(4)),
    byLabel,
    studies: studyCosts.length,
    perStudy: studyCosts.length ? {
      min: Number(studyCosts[0].toFixed(4)),
      median: Number(median.toFixed(4)),
      p90: Number(pct(0.9).toFixed(4)),
      max: Number(studyCosts[studyCosts.length - 1].toFixed(4)),
      mean: Number((studyCosts.reduce((s, c) => s + c, 0) / studyCosts.length).toFixed(4)),
    } : null,
    // The number that sets the cap: at the median study cost, how many studies
    // does a given monthly price support before margin is gone?
    capGuide: median > 0 ? {
      atMedian: {
        '$19': Math.floor(19 / median),
        '$29': Math.floor(29 / median),
        '$49': Math.floor(49 / median),
      },
      note: 'studies at BREAK-EVEN, before payment fees. For 80% gross margin, take ~20% of these.',
    } : null,
  }
}

module.exports = { RATES, priceCall, createRecorder, summarize, ratesFor, CACHE_WRITE_MULT, CACHE_READ_MULT }
