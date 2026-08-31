const crypto = require('crypto')

const REQUEST_ID_PATTERN = /^[a-z0-9-]{12,100}$/i
const REQUEST_ROUTES = new Set([
  'analyze',
  'quick-study',
  'guided-study',
  'ask',
  'sermon-assist',
])

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    )
  }
  return value
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

/**
 * ALLOWSYNTHETIC EXISTS SO THIS CAN DEPLOY WITHOUT BREAKING THE APPS ALREADY INSTALLED.
 *
 * Idempotency needs a client-supplied requestId. Requiring one outright is correct
 * for the routes that always had it — quick-study and guided-study, which already
 * 400 without one on main and whose shipped mobile client sends it.
 *
 * The other three did NOT have it. On main, analyze / ask / sermon-assist minted
 * their own ids server-side and ignored the client entirely:
 *   analyze        const studyId = newStudyId()
 *   ask            `ask-${newStudyId()}`
 *   sermon-assist  `sermon-assist-${newStudyId()}`
 * Every one of those is random per call. No shipped client has ever sent a
 * requestId for them — desktop v1.4.11 sends none at all, and iOS 1.4.2 build 6
 * sends one only on quick-study and guided-study.
 *
 * So demanding a requestId on those three is not a tightening, it is a break: a
 * 400 on Ask, on all four specialist agents, and on desktop Analyze for every
 * copy of the app in the field — including the iOS build sitting in App Review,
 * which cannot be hotfixed without another review cycle.
 *
 * A synthetic random id reproduces main's behavior exactly: unique per call, so
 * it never matches a prior row and the replay/conflict branches stay unreachable,
 * exactly as they were before idempotency existed. Callers therefore need no
 * special casing; `synthetic` is returned for tests and telemetry.
 *
 * REMOVE THIS once desktop and both store builds carrying the request ledger are
 * live, then make requestId mandatory on all five routes.
 */
function describe({ ownerId, route, requestId, payload, allowSynthetic = false }) {
  const cleanOwner = String(ownerId || '').trim()
  let cleanRequestId = String(requestId || '').trim()
  if (!cleanOwner) throw new Error('request owner is required')
  if (!REQUEST_ROUTES.has(route)) throw new Error('supported idempotent route is required')
  let synthetic = false
  if (!REQUEST_ID_PATTERN.test(cleanRequestId)) {
    if (!allowSynthetic) throw new Error('a valid requestId is required')
    cleanRequestId = crypto.randomUUID()
    synthetic = true
  }
  const requestHash = digest(JSON.stringify(canonical({ route, payload })))
  return {
    id: `${route}-${digest(`${cleanOwner}:${route}:${cleanRequestId}`)}`,
    requestHash,
    synthetic,
  }
}

function classifyAskRow(row, requestHash) {
  if (!row) return { kind: 'new' }
  if (!row.request_hash || row.request_hash !== requestHash) {
    return {
      kind: 'conflict',
      status: 409,
      body: {
        error: 'REQUEST_ID_REUSED',
        message: 'That request identifier was already used for different content. Try again.',
      },
    }
  }
  if (row.state === 'settled' && row.response) {
    return { kind: 'replay', status: 200, body: row.response }
  }
  if (row.state === 'held') {
    return {
      kind: 'pending',
      status: 409,
      retryAfterSeconds: 5,
      body: {
        error: 'REQUEST_IN_PROGRESS',
        message: 'That answer is still being built. Try again in a moment.',
      },
    }
  }
  if (row.state === 'settled') {
    return {
      kind: 'uncertain',
      status: 409,
      body: {
        error: 'REQUEST_RESULT_UNAVAILABLE',
        message: 'That answer was charged but could not be recovered. Contact support before trying it again.',
      },
    }
  }
  return {
    kind: 'closed',
    status: 409,
    body: {
      error: 'REQUEST_CLOSED',
      message: 'That attempt closed without an answer. Try again to open a new attempt.',
    },
  }
}

async function askState(db, id, requestHash) {
  const { rows } = await db.query(
    `SELECT state, request_hash, response
       FROM ask_reservation
      WHERE id = $1
      LIMIT 1`,
    [id],
  )
  return classifyAskRow(rows[0] || null, requestHash)
}

module.exports = {
  REQUEST_ID_PATTERN,
  askState,
  canonical,
  classifyAskRow,
  describe,
}
