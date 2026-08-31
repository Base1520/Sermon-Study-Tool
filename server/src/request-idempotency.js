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

function describe({ ownerId, route, requestId, payload }) {
  const cleanOwner = String(ownerId || '').trim()
  const cleanRequestId = String(requestId || '').trim()
  if (!cleanOwner) throw new Error('request owner is required')
  if (!REQUEST_ROUTES.has(route)) throw new Error('supported idempotent route is required')
  if (!REQUEST_ID_PATTERN.test(cleanRequestId)) throw new Error('a valid requestId is required')
  const requestHash = digest(JSON.stringify(canonical({ route, payload })))
  return {
    id: `${route}-${digest(`${cleanOwner}:${route}:${cleanRequestId}`)}`,
    requestHash,
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
