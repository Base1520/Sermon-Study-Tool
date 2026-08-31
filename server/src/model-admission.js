const MODEL_ADMISSION_ROUTES = new Set([
  'analyze',
  'quick-study',
  'guided-study',
  'read',
  'ask',
  'sermon-assist',
])

const MODEL_ADMISSION_PROVIDER_SLOTS = Object.freeze({
  analyze: 3,
  'quick-study': 1,
  'guided-study': 3,
  read: 1,
  ask: 1,
  'sermon-assist': 1,
})

const MODEL_ADMISSION_SETTING_KEYS = Object.freeze({
  windowSeconds: 'model_admission_window_seconds',
  globalRequests: 'model_admission_global_requests',
  identityRequests: 'model_admission_identity_requests',
  globalConcurrency: 'model_admission_global_concurrency',
  identityConcurrency: 'model_admission_identity_concurrency',
  globalProviderConcurrency: 'model_admission_global_provider_concurrency',
  identityProviderConcurrency: 'model_admission_identity_provider_concurrency',
})

const MODEL_ADMISSION_DEFAULTS = Object.freeze({
  windowSeconds: 60,
  globalRequests: 30,
  identityRequests: 6,
  globalConcurrency: 8,
  identityConcurrency: 2,
  globalProviderConcurrency: 16,
  identityProviderConcurrency: 6,
})

const ACTIVE_TTL_MINUTES = 10
const FINISHED_RETENTION_DAYS = 7

function parseSetting(rows, name, { minimum = 0 } = {}) {
  const key = MODEL_ADMISSION_SETTING_KEYS[name]
  const raw = rows.find((row) => row.key === key)?.value
  const clean = String(raw ?? '').trim()
  if (!/^\d+$/.test(clean)) throw new Error(`invalid model admission setting: ${key}`)
  const value = Number(clean)
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`invalid model admission setting: ${key}`)
  }
  return value
}

async function settings(db) {
  const keys = Object.values(MODEL_ADMISSION_SETTING_KEYS)
  const { rows } = await db.query(
    `SELECT key, value FROM settings WHERE key = ANY($1::text[])`,
    [keys],
  )
  return {
    windowSeconds: parseSetting(rows, 'windowSeconds', { minimum: 1 }),
    globalRequests: parseSetting(rows, 'globalRequests'),
    identityRequests: parseSetting(rows, 'identityRequests'),
    globalConcurrency: parseSetting(rows, 'globalConcurrency'),
    identityConcurrency: parseSetting(rows, 'identityConcurrency'),
    globalProviderConcurrency: parseSetting(rows, 'globalProviderConcurrency'),
    identityProviderConcurrency: parseSetting(rows, 'identityProviderConcurrency'),
  }
}

function validateInput({ id, route, accountId, installId }) {
  if (!id || typeof id !== 'string') throw new Error('model admission id is required')
  if (!MODEL_ADMISSION_ROUTES.has(route)) throw new Error('supported model admission route is required')
  if (!accountId && !installId) throw new Error('model admission identity is required')
}

function providerSlots(route) {
  const slots = MODEL_ADMISSION_PROVIDER_SLOTS[route]
  if (!Number.isSafeInteger(slots) || slots < 1) throw new Error('model admission provider slots are required')
  return slots
}

async function check(db, input) {
  validateInput(input)
  const limits = await settings(db)
  const requestedProviderSlots = providerSlots(input.route)
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE created_at > now() - make_interval(secs => $1::int)
       )::int AS global_recent,
       COUNT(*) FILTER (
         WHERE state = 'active'
           AND updated_at > now() - make_interval(mins => $2::int)
       )::int AS global_active,
       COALESCE(SUM(provider_slots) FILTER (
         WHERE state = 'active'
           AND updated_at > now() - make_interval(mins => $2::int)
       ), 0)::int AS global_provider_active,
       COUNT(*) FILTER (
         WHERE created_at > now() - make_interval(secs => $1::int)
           AND (($3::uuid IS NOT NULL AND (
                  account_id = $3 OR (account_id IS NULL AND install_id = $4)
                ))
             OR ($3::uuid IS NULL AND account_id IS NULL AND install_id = $4))
       )::int AS identity_recent,
       COUNT(*) FILTER (
         WHERE state = 'active'
           AND updated_at > now() - make_interval(mins => $2::int)
           AND (($3::uuid IS NOT NULL AND (
                  account_id = $3 OR (account_id IS NULL AND install_id = $4)
                ))
             OR ($3::uuid IS NULL AND account_id IS NULL AND install_id = $4))
       )::int AS identity_active,
       COALESCE(SUM(provider_slots) FILTER (
         WHERE state = 'active'
           AND updated_at > now() - make_interval(mins => $2::int)
           AND (($3::uuid IS NOT NULL AND (
                  account_id = $3 OR (account_id IS NULL AND install_id = $4)
                ))
             OR ($3::uuid IS NULL AND account_id IS NULL AND install_id = $4))
       ), 0)::int AS identity_provider_active
     FROM model_admission`,
    [limits.windowSeconds, ACTIVE_TTL_MINUTES, input.accountId || null, input.installId || null],
  )
  const counts = rows[0] || {}
  const globalRecent = Number(counts.global_recent || 0)
  const globalActive = Number(counts.global_active || 0)
  const identityRecent = Number(counts.identity_recent || 0)
  const identityActive = Number(counts.identity_active || 0)
  const globalProviderActive = Number(counts.global_provider_active || 0)
  const identityProviderActive = Number(counts.identity_provider_active || 0)

  if (globalRecent >= limits.globalRequests || identityRecent >= limits.identityRequests) {
    return { ok: false, reason: 'rate', retryAfterSeconds: limits.windowSeconds }
  }
  if (globalActive >= limits.globalConcurrency || identityActive >= limits.identityConcurrency) {
    return { ok: false, reason: 'concurrency', retryAfterSeconds: 15 }
  }
  if (
    globalProviderActive + requestedProviderSlots > limits.globalProviderConcurrency ||
    identityProviderActive + requestedProviderSlots > limits.identityProviderConcurrency
  ) {
    return { ok: false, reason: 'provider-concurrency', retryAfterSeconds: 15 }
  }
  return { ok: true }
}

async function insert(db, input) {
  validateInput(input)
  const requestedProviderSlots = providerSlots(input.route)
  await db.query(
    `INSERT INTO model_admission (id, account_id, install_id, route, provider_slots)
          VALUES ($1, $2, $3, $4, $5)`,
    [input.id, input.accountId || null, input.installId || null, input.route, requestedProviderSlots],
  )
  return { ok: true, id: input.id }
}

async function reserve(db, input, withGlobalSpendLock) {
  if (typeof withGlobalSpendLock !== 'function') throw new Error('model admission lock is required')
  return withGlobalSpendLock(db, async (client) => {
    const result = await check(client, input)
    if (!result.ok) return result
    await insert(client, input)
    return { ok: true, id: input.id }
  })
}

async function heartbeat(db, id) {
  if (!id) return false
  const { rowCount } = await db.query(
    `UPDATE model_admission SET updated_at = now()
      WHERE id = $1 AND state = 'active'`,
    [id],
  )
  return rowCount > 0
}

async function finish(db, id) {
  if (!id) return false
  const { rowCount } = await db.query(
    `UPDATE model_admission SET state = 'finished', updated_at = now()
      WHERE id = $1 AND state = 'active'`,
    [id],
  )
  return rowCount > 0
}

async function sweep(db) {
  const stale = await db.query(
    `UPDATE model_admission SET state = 'finished', updated_at = now()
      WHERE state = 'active'
        AND updated_at < now() - make_interval(mins => $1::int)`,
    [ACTIVE_TTL_MINUTES],
  )
  const expired = await db.query(
    `DELETE FROM model_admission
      WHERE state = 'finished'
        AND created_at < now() - make_interval(days => $1::int)`,
    [FINISHED_RETENTION_DAYS],
  )
  return stale.rowCount + expired.rowCount
}

function refusal(result) {
  return {
    status: 429,
    retryAfterSeconds: Math.max(1, Number(result?.retryAfterSeconds || 15)),
    body: {
      error: 'MODEL_BUSY',
      headline: 'The Operator is finishing other work.',
      message: 'Wait a moment and try again. Your saved studies and notes are safe.',
    },
  }
}

module.exports = {
  ACTIVE_TTL_MINUTES,
  FINISHED_RETENTION_DAYS,
  MODEL_ADMISSION_DEFAULTS,
  MODEL_ADMISSION_PROVIDER_SLOTS,
  MODEL_ADMISSION_ROUTES,
  MODEL_ADMISSION_SETTING_KEYS,
  check,
  finish,
  heartbeat,
  insert,
  providerSlots,
  refusal,
  reserve,
  settings,
  sweep,
}
