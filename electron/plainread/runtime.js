// Runtime helpers the reading engine needs — retry and model-output parsing.
//
// These lived in electron/main.js, which meant the engine could not run without
// dragging Electron along even though neither function touches it. The engine
// itself was deliberately built dependency-injected so it could move to a
// server unchanged; these two were the last thing tying the wiring to the
// desktop. Now main.js imports them from here, and a server imports the same
// file, so both sides retry and parse identically.
//
// Pure Node. No Electron, no filesystem, no globals.

/**
 * Retry a call through Anthropic's overload responses.
 *
 * 529 means the model is busy, not that the request was wrong, so it is the one
 * failure worth waiting out. Everything else — a bad key, a malformed request,
 * a refusal — is rethrown immediately, because retrying it just spends money
 * four times to fail four times.
 *
 * Backoff is 3s, 6s, 12s.
 */
async function withRetry(fn, maxAttempts = 4, baseDelayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const is529 = err?.status === 529 || err?.message?.includes('overloaded')
      if (is529 && attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
}

/**
 * Pull JSON out of model output.
 *
 * Models wrap JSON in code fences, prefix it with a sentence of prose, and
 * leave trailing commas. This strips all three rather than failing on any of
 * them, because a parse failure costs a full regeneration.
 */
function parseModelJSON(res) {
  const rawText = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  let raw = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const firstBrace = raw.indexOf('{')
  const firstBracket = raw.indexOf('[')
  const isArray = firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)
  const start = isArray ? firstBracket : firstBrace
  const end = isArray ? raw.lastIndexOf(']') : raw.lastIndexOf('}')
  if (start !== -1 && end > start) raw = raw.slice(start, end + 1)
  raw = raw.replace(/,(\s*[}\]])/g, '$1')
  try {
    return JSON.parse(raw)
  } catch (e) {
    console.error('[parseModelJSON] failed:', e.message, '| excerpt:', raw.slice(Math.max(0, raw.length - 300)))
    throw new Error('The model returned malformed data — please try again.')
  }
}

// ── Input ceilings ─────────────────────────────────────────────────────────
//
// On the desktop, an oversized passage costs the user their own money and is
// their problem. On a server it costs Cole, and the sender pays nothing — so a
// 500KB "passage" pasted into the reference field is real money out of one
// request. ask.js already worked to bounded limits; these are the same
// discipline applied to the generation path.
//
// REJECT, DO NOT TRUNCATE. A silently shortened passage produces a confident
// reading of text the user did not send, at full price. Being told no is
// better than being quietly given the wrong answer.

const LIMITS = {
  passageChars: 12000,   // ~2,500 words. Longer than any single pericope.
  referenceChars: 120,   // "1 Thessalonians 4:13-5:11" is 26.
  questionChars: 600,
  historyChars: 1200,
  phraseCount: 60,
}

class InputTooLarge extends Error {
  constructor(field, actual, limit) {
    super(`That ${field} is too long — ${actual.toLocaleString()} characters against a limit of ${limit.toLocaleString()}. Try a shorter passage.`)
    this.code = 'INPUT_TOO_LARGE'
    this.field = field
    this.actual = actual
    this.limit = limit
  }
}

/** Throw unless the string is within its ceiling. Returns it unchanged. */
function checkLength(value, field, limit) {
  const s = typeof value === 'string' ? value : ''
  if (s.length > limit) throw new InputTooLarge(field, s.length, limit)
  return s
}

/**
 * Validate everything that reaches a model call on the generation path.
 *
 * Called at the edge — the IPC handler today, the HTTP route on a server — so
 * an oversized request is refused before a single token is spent.
 */
function checkGenerationInput({ text, reference, phrases } = {}) {
  checkLength(text, 'passage', LIMITS.passageChars)
  checkLength(reference, 'reference', LIMITS.referenceChars)
  if (Array.isArray(phrases) && phrases.length > LIMITS.phraseCount) {
    throw new InputTooLarge('passage', phrases.length, LIMITS.phraseCount)
  }
  return true
}

module.exports = {
  withRetry,
  parseModelJSON,
  checkLength,
  checkGenerationInput,
  InputTooLarge,
  LIMITS,
}
