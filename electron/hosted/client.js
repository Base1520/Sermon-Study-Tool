/**
 * client.js — the desktop app talking to the hosted API.
 *
 * WHY THIS EXISTS. Seven men were asked to test The Operator. Two downloaded it.
 * Zero ran a study. The blocker was never interest — it was that running one
 * study required going to console.anthropic.com, creating an account, adding a
 * card, generating a key, and pasting it into a settings panel. Nobody does that
 * to try something.
 *
 * With this file, the app downloads and works. The key lives on the server; the
 * reader never sees one.
 *
 * OPT-IN, AND REVERSIBLE IN ONE VARIABLE. Nothing here runs unless
 * OPERATOR_API_URL is set. Unset, the app behaves exactly as it does today —
 * local key, local cache, no network beyond Anthropic. That keeps the hosted
 * path from being a rewrite of the desktop path, and keeps a bad deploy from
 * being able to break someone who never asked for it.
 *
 * NOTHING HERE MAY THROW A BARE STRING AT THE READER. A 402 is not an error, it
 * is an offer; the upgrade prompt the server sends is passed through intact so
 * the renderer can show a real choice instead of "request failed".
 */

const crypto = require('crypto')

const { DEFAULT_API_URL } = require('./endpoint')

/** How long to wait on the analysis before giving up. The fan-out runs ~40s. */
const ANALYZE_TIMEOUT_MS = 180_000
/**
 * The reading streams for ~163 seconds, and up to ~270 on the retry path. This
 * is a ceiling on SILENCE, not on the request: the server heartbeats every 15s,
 * and each byte received resets the clock. A flat request timeout here would
 * kill studies that are working perfectly.
 */
const STREAM_SILENCE_MS = 90_000

/**
 * A refusal the reader is meant to see, carrying the server's own words.
 *
 * Thrown for 402 and for the paused-service 503 — both are states the app should
 * render as a choice, not as a failure. `payload` is the server's response body:
 * the upgrade prompt, its plans, and what was used against what was allowed.
 */
class HostedRefusal extends Error {
  constructor(payload, status) {
    super(payload?.message || payload?.body || payload?.error || 'Upgrade required')
    this.name = 'HostedRefusal'
    this.code = payload?.error || 'UPGRADE_REQUIRED'
    this.status = status
    this.payload = payload
  }
}

/**
 * Identity that survives a restart but belongs to nobody.
 *
 * The free tier works with no account at all, so the one lifetime study is
 * tracked against an install id rather than a person. Generated once and kept,
 * because regenerating it on every launch would hand out unlimited free studies.
 */
function installId(store) {
  let id = store?.get('operator-install-id', null)
  if (!id) {
    id = crypto.randomUUID()
    store?.set('operator-install-id', id)
  }
  return id
}

function headers(store, extra = {}) {
  const h = {
    'content-type': 'application/json',
    'x-install-id': installId(store),
    ...extra,
  }
  // Present only once a man has actually subscribed. Anonymous is first-class.
  const token = store?.get('operator-device-token', null)
  if (token) h.authorization = `Bearer ${token}`
  return h
}

/**
 * Which server this build talks to, or null for the local-key path.
 *
 * An explicitly EMPTY OPERATOR_API_URL is a real answer, not a missing one: it
 * means "turn hosting off", the escape hatch for someone with his own key when
 * the server is down. `undefined` means nothing was said, so the packaged
 * default applies. Distinguishing those two is the whole reason this is not a
 * one-line `||`.
 */
function hostedBaseUrl() {
  const override = process.env.OPERATOR_API_URL
  const raw = (override === undefined ? DEFAULT_API_URL : override).trim()
  return raw ? raw.replace(/\/+$/, '') : null
}

async function readJsonOrText(res) {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { error: 'BAD_RESPONSE', message: text.slice(0, 400) } }
}

/**
 * The analysis fan-out, run on the server's key.
 *
 * Returns { analysis, studyId }. The studyId matters: handing it back to
 * plainRead() below is what makes the two halves ONE billable study instead of
 * two.
 */
async function analyze(store, { text, reference, signal }) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('analyze: OPERATOR_API_URL is not set')

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ANALYZE_TIMEOUT_MS)
  signal?.addEventListener('abort', () => ctl.abort(), { once: true })

  let res
  try {
    res = await fetch(`${base}/v1/analyze`, {
      method: 'POST',
      headers: headers(store),
      body: JSON.stringify({ text, reference }),
      signal: ctl.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  const body = await readJsonOrText(res)
  if (res.status === 402 || res.status === 503) throw new HostedRefusal(body, res.status)
  if (!res.ok) throw new Error(body?.message || `analysis failed (${res.status})`)
  return { analysis: body.analysis, studyId: body.studyId, cached: body.cached }
}

/**
 * The reading, streamed.
 *
 * NDJSON, not SSE — one JSON object per line. Sections arrive as they are
 * written, so the reader starts reading while the rest is still being generated
 * rather than watching a spinner for most of three minutes.
 *
 * onSection is called with (key, value) to match the local engine's contract
 * exactly, so main.js can hand the same callback to either path.
 * Returns both the document and the authoritative study id from the done frame.
 * The latter is what keeps Scholar/Ask attached if the server had to replace a
 * stranded reservation while finishing the reading.
 */
async function plainRead(store, {
  analysis, reference, level, studyId, resumeOnly = false, onSection, signal,
}) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('plainRead: OPERATOR_API_URL is not set')

  const ctl = new AbortController()
  signal?.addEventListener('abort', () => ctl.abort(), { once: true })

  const res = await fetch(`${base}/v1/read`, {
    method: 'POST',
    headers: headers(store),
    body: JSON.stringify({
      analysis,
      reference,
      level,
      studyId,
      restoreOnly: resumeOnly === true,
    }),
    signal: ctl.signal,
  })

  if (res.status === 402 || res.status === 503) {
    throw new HostedRefusal(await readJsonOrText(res), res.status)
  }
  if (!res.ok) {
    const body = await readJsonOrText(res)
    throw new Error(body?.message || `reading failed (${res.status})`)
  }

  // Silence watchdog. Reset by every chunk, including the server's 15s pings, so
  // it can only fire when the connection has genuinely gone quiet.
  let quiet = setTimeout(() => ctl.abort(), STREAM_SILENCE_MS)
  const bump = () => {
    clearTimeout(quiet)
    quiet = setTimeout(() => ctl.abort(), STREAM_SILENCE_MS)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let document = null
  let completedStudyId = studyId ?? null
  let failure = null

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bump()
      buffer += decoder.decode(value, { stream: true })

      // A chunk boundary can land mid-line, so the tail is kept for next time.
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        let msg
        try { msg = JSON.parse(line) } catch { continue }   // a torn line is not fatal

        if (msg.type === 'ping') continue
        if (msg.type === 'section') {
          // {type,key,value} on the wire, delivered as the engine's own
          // (key, value) so main.js can hand the SAME callback to either path
          // and the renderer cannot tell them apart.
          try { onSection?.(msg.key, msg.value) } catch {}
        } else if (msg.type === 'done') {
          document = msg.document
          completedStudyId = msg.studyId ?? completedStudyId
        } else if (msg.type === 'error') {
          failure = msg
        }
      }
    }
  } finally {
    clearTimeout(quiet)
  }

  if (failure) {
    const e = new Error(failure.message || 'The reading could not be completed.')
    e.code = failure.code
    throw e
  }
  // A stream that ended without a document is a failure even though no error
  // arrived — a dropped connection looks exactly like this, and silently
  // returning null would render as an empty study.
  if (!document) throw new Error('The reading ended before it finished.')
  return { document, studyId: completedStudyId }
}

/** What the app may do, according to the server. Never throws; never 401s. */
async function me(store) {
  const base = hostedBaseUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}/v1/me`, { headers: headers(store) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    // Offline is not an entitlement change. The caller falls back to whatever it
    // last knew rather than downgrading a paying man because his wifi dropped.
    return null
  }
}

/** Stripe's own billing page — update a card, cancel, see invoices. */
async function portal(store) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('portal: OPERATOR_API_URL is not set')
  const res = await fetch(`${base}/v1/portal`, { method: 'POST', headers: headers(store) })
  const body = await readJsonOrText(res)
  if (!res.ok) throw new Error(body?.error || `billing portal unavailable (${res.status})`)
  return body.url
}

/** Buy a one-off block of studies. Deliberately separate from checkout(). */
async function topup(store) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('topup: OPERATOR_API_URL is not set')
  const res = await fetch(`${base}/v1/topup`, { method: 'POST', headers: headers(store) })
  const body = await readJsonOrText(res)
  if (!res.ok) throw new Error(body?.error || `top-up failed (${res.status})`)
  return body.url
}

/** Start a subscription. Returns a Stripe URL for the caller to open. */
async function checkout(store, { plan, email }) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('checkout: OPERATOR_API_URL is not set')
  const res = await fetch(`${base}/v1/checkout`, {
    method: 'POST',
    headers: headers(store),
    body: JSON.stringify({ plan, email }),
  })
  const body = await readJsonOrText(res)
  if (!res.ok) throw new Error(body?.error || `checkout failed (${res.status})`)
  return body.url
}

/**
 * Ask a question about a reading, on the server's key.
 *
 * Not a study and not billed as one — see the route. A 429 is a real answer the
 * reader should see plainly, so it comes back as a refusal rather than an error.
 */
/**
 * The AI-processing disclosure version the server demands before it will spend a
 * generation on a question.
 *
 * MUST equal AI_PROCESSING_CONSENT_VERSION in server/src/index.js. Four routes
 * enforce it — /v1/quick-study, /v1/guided-study, /v1/ask and /v1/sermon-assist —
 * and reject a request without it with 400 AI_CONSENT_REQUIRED. /v1/analyze and
 * /v1/plain-read do NOT, which is exactly why running a study kept working on the
 * desktop while asking about one did not: the study path never needed this and the
 * ask path silently did. The mobile client has always sent it (src/mobile/api.ts);
 * this file did not, so every hosted desktop question was refused by the server
 * before it reached a model.
 */
const AI_PROCESSING_CONSENT_VERSION = 'operator-ai-processing-v1'

async function ask(store, { doc, analysis, studyId, question, history, vaultNotes }) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('ask: OPERATOR_API_URL is not set')

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ANALYZE_TIMEOUT_MS)
  let res
  try {
    res = await fetch(`${base}/v1/ask`, {
      method: 'POST',
      headers: headers(store),
      body: JSON.stringify({
        doc, analysis, studyId, question, history, vaultNotes,
        aiConsentVersion: AI_PROCESSING_CONSENT_VERSION,
      }),
      signal: ctl.signal,
    })
  } finally { clearTimeout(timer) }

  const body = await readJsonOrText(res)
  if (res.status === 402 || res.status === 429 || res.status === 503) {
    throw new HostedRefusal(body, res.status)
  }
  if (!res.ok) throw new Error(body?.message || `that question could not be answered (${res.status})`)
  return body
}

/**
 * A specialist agent answering from a finished study — the hosted path for the
 * Scholar in Residence.
 *
 * WHY: the Scholar called Anthropic directly and demanded the reader's own API
 * key. On a hosted build that is a dead end — Settings has no key field, because
 * the whole promise is that he never needs one. A comped beta reader hit exactly
 * that wall while his account page told him "No API key needed."
 *
 * The server already speaks this: /v1/sermon-assist accepts agent roles
 * 'exegetical' | 'theological' | 'homiletical' | 'scholar', grounds the answer in
 * the study row it owns server-side, and meters it as an ask. Nothing new had to
 * be deployed for this to work.
 *
 * studyId, when present, must be a FINISHED study owned by this account — the
 * route reads the document and analysis from its own row and ignores anything the
 * client claims about them. A null studyId is general mode for every specialist
 * (Cole's expanded call, 2026-08-15): each answers ungrounded in its own
 * discipline — and says so — for the same one metered Ask.
 */
async function sermonAssist(store, { studyId, agent, question, history }) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('sermonAssist: OPERATOR_API_URL is not set')

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ANALYZE_TIMEOUT_MS)
  let res
  try {
    res = await fetch(`${base}/v1/sermon-assist`, {
      method: 'POST',
      headers: headers(store),
      body: JSON.stringify({
        studyId, agent, question, history,
        aiConsentVersion: AI_PROCESSING_CONSENT_VERSION,
      }),
      signal: ctl.signal,
    })
  } finally { clearTimeout(timer) }

  const body = await readJsonOrText(res)
  // Same shape as ask(): a 402/429/503 is an offer or a limit, not a crash, and
  // must reach the reader as the server worded it.
  if (res.status === 402 || res.status === 429 || res.status === 503) {
    throw new HostedRefusal(body, res.status)
  }
  if (!res.ok) throw new Error(body?.message || `that question could not be answered (${res.status})`)
  return body
}

/**
 * Submit a beta report.
 *
 * Deliberately not blocked by auth — see the route. A man reporting that the app
 * is broken must not be stopped by the part of it that is broken.
 */
async function sendFeedback(store, { name, category, body, version, platform }) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('feedback: OPERATOR_API_URL is not set')
  const res = await fetch(`${base}/v1/feedback`, {
    method: 'POST',
    headers: headers(store),
    body: JSON.stringify({ name, category, body, version, platform }),
  })
  const out = await readJsonOrText(res)
  if (!res.ok) throw new Error(out?.error || `could not submit (${res.status})`)
  return out
}

/** The feed of reports, for Cole's build. Never throws — an unreachable feed
 *  is an empty list, not an error box. */
async function listFeedback(store, limit = 50) {
  const base = hostedBaseUrl()
  if (!base) return []
  try {
    const res = await fetch(`${base}/v1/feedback?limit=${limit}`, { headers: headers(store) })
    if (!res.ok) return []
    return (await res.json()).feedback ?? []
  } catch {
    return []
  }
}

/**
 * Redeem a comp code. Stores the device token, so the app is a subscriber from
 * the next request onward.
 */
async function redeem(store, code) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('redeem: OPERATOR_API_URL is not set')
  const res = await fetch(`${base}/v1/redeem`, {
    method: 'POST',
    headers: headers(store),
    body: JSON.stringify({ code }),
  })
  const body = await readJsonOrText(res)
  if (!res.ok) throw new Error(body?.message || 'That code could not be redeemed.')
  // The token is returned ONCE. If it is not stored here it is gone for good.
  if (body.token) store?.set('operator-device-token', body.token)
  return body
}

/**
 * Collect a subscription this install just paid for.
 *
 * Called after the browser returns from Stripe. Until this existed the payment
 * flow had no ending — money moved and the app was never told, so a paying man
 * sat behind the free-tier wall he had just bought his way past.
 */
async function claim(store) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('claim: OPERATOR_API_URL is not set')
  const res = await fetch(`${base}/v1/claim`, { method: 'POST', headers: headers(store) })
  const body = await readJsonOrText(res)
  if (!res.ok) return { ok: false, ...body }        // "not yet" is a normal answer here
  if (body.token) store?.set('operator-device-token', body.token)
  return { ok: true, ...body }
}

async function createDeviceLink(store) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('device link: OPERATOR_API_URL is not set')
  const res = await fetch(`${base}/v1/device-links`, { method: 'POST', headers: headers(store) })
  const body = await readJsonOrText(res)
  if (!res.ok) throw new Error(body?.message || `device link unavailable (${res.status})`)
  return body
}

async function devices(store) {
  const base = hostedBaseUrl()
  if (!base) return []
  const res = await fetch(`${base}/v1/devices`, { headers: headers(store) })
  const body = await readJsonOrText(res)
  if (!res.ok) throw new Error(body?.message || `devices unavailable (${res.status})`)
  return body.devices || []
}

async function revokeDevice(store, deviceId) {
  const base = hostedBaseUrl()
  if (!base) throw new Error('device revoke: OPERATOR_API_URL is not set')
  const res = await fetch(`${base}/v1/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    headers: headers(store),
  })
  const body = await readJsonOrText(res)
  if (!res.ok) throw new Error(body?.message || `device could not be revoked (${res.status})`)
  return body
}

module.exports = {
  analyze,
  plainRead,
  ask,
  sermonAssist,
  me,
  checkout,
  topup,
  portal,
  sendFeedback,
  listFeedback,
  redeem,
  claim,
  createDeviceLink,
  devices,
  revokeDevice,
  hostedBaseUrl,
  installId,
  HostedRefusal,
  ANALYZE_TIMEOUT_MS,
  STREAM_SILENCE_MS,
}
