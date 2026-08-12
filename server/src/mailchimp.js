const crypto = require('crypto')

const REQUEST_TIMEOUT_MS = 12_000
const DELETION_MARKER_LEASE_MINUTES = 15

function config() {
  const apiKey = String(process.env.MAILCHIMP_API_KEY || '').trim()
  const audienceId = String(process.env.MAILCHIMP_AUDIENCE_ID || '').trim()
  const datacenter = apiKey.split('-').pop()
  if (!apiKey || !audienceId || !/^us\d+$/i.test(datacenter || '')) return null
  return { apiKey, audienceId, datacenter }
}

function subscriberHash(email) {
  return crypto.createHash('md5').update(String(email).trim().toLowerCase()).digest('hex')
}

function marketingMemberPayload(email, { status } = {}) {
  const address = String(email).trim().toLowerCase()
  // An explicit status (e.g. a paid buyer who ticked consent at checkout) means single
  // opt-in — subscribed outright. Default stays double opt-in (pending), so an unconfirmed
  // lead must still confirm before receiving campaigns.
  if (status) return { email_address: address, status, status_if_new: status }
  return { email_address: address, status_if_new: 'pending' }
}

async function lockMarketingSubscriber(db, hash) {
  await db.query(
    `SELECT pg_advisory_xact_lock(hashtext('operator-marketing'), hashtext($1))`,
    [hash],
  )
}

async function stageMarketingSync(db, email, intentId) {
  if (!intentId) throw new Error('A marketing sync intent id is required.')
  const hash = subscriberHash(email)
  await lockMarketingSubscriber(db, hash)
  await db.query(
    `INSERT INTO marketing_contact_state (subscriber_hash, action, intent_id)
          VALUES ($1, $2, $3)
     ON CONFLICT (subscriber_hash) DO UPDATE
            SET action = EXCLUDED.action,
                intent_id = EXCLUDED.intent_id,
                updated_at = now()`,
    [hash, 'sync', intentId],
  )
  await db.query(`DELETE FROM marketing_deletion_outbox WHERE subscriber_hash = $1`, [hash])
  return { hash, intentId }
}

async function stageMarketingDeletion(db, email, intentId = crypto.randomUUID()) {
  const hash = subscriberHash(email)
  await lockMarketingSubscriber(db, hash)
  await db.query(
    `INSERT INTO marketing_contact_state (subscriber_hash, action, intent_id)
          VALUES ($1, $2, $3)
     ON CONFLICT (subscriber_hash) DO UPDATE
            SET action = EXCLUDED.action,
                intent_id = EXCLUDED.intent_id,
                updated_at = now()`,
    [hash, 'archive', intentId],
  )
  await db.query(
    `INSERT INTO marketing_deletion_outbox (subscriber_hash)
          VALUES ($1)
     ON CONFLICT (subscriber_hash) DO UPDATE
            SET attempts = 0,
                next_attempt_at = now(),
                last_error = NULL,
                updated_at = now()`,
    [hash],
  )
  return { hash, intentId }
}

async function request(path, init = {}) {
  const resolved = config()
  if (!resolved) return { configured: false }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`https://${resolved.datacenter}.api.mailchimp.com/3.0${path}`, {
      ...init,
      headers: {
        authorization: `Basic ${Buffer.from(`operator:${resolved.apiKey}`).toString('base64')}`,
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    })
    if (!response.ok && response.status !== 404) {
      const body = await response.text()
      throw new Error(`Mailchimp answered ${response.status}: ${body.slice(0, 160)}`)
    }
    return { configured: true, ok: response.ok, status: response.status }
  } finally {
    clearTimeout(timeout)
  }
}

async function syncMarketingContact(db, email, {
  intentId,
  tags = ['The Operator', 'Mobile App'],
  status,
} = {}) {
  const resolved = config()
  if (!resolved) return { configured: false }
  if (!intentId || typeof db?.connect !== 'function') {
    throw new Error('A durable marketing sync intent is required.')
  }
  const hash = subscriberHash(email)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await lockMarketingSubscriber(client, hash)
    const current = await client.query(
      `SELECT action, intent_id FROM marketing_contact_state WHERE subscriber_hash = $1`,
      [hash],
    )
    const state = current.rows[0]
    if (state?.action !== 'sync' || state.intent_id !== intentId) {
      await client.query('COMMIT')
      return { configured: true, synced: false, superseded: true }
    }
    await request(`/lists/${encodeURIComponent(resolved.audienceId)}/members/${hash}`, {
      method: 'PUT',
      body: JSON.stringify(marketingMemberPayload(email, { status })),
    })
    await request(`/lists/${encodeURIComponent(resolved.audienceId)}/members/${hash}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags: tags.map((name) => ({ name, status: 'active' })) }),
    })
    await client.query('COMMIT')
    return { configured: true, synced: true }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function archiveMarketingContact(email) {
  return archiveMarketingSubscriberHash(subscriberHash(email))
}

async function archiveMarketingSubscriberHash(hash) {
  const resolved = config()
  if (!resolved) return { configured: false }
  if (!/^[a-f0-9]{32}$/i.test(String(hash || ''))) throw new Error('Invalid Mailchimp subscriber hash.')
  return request(`/lists/${encodeURIComponent(resolved.audienceId)}/members/${hash}`, {
    method: 'DELETE',
  })
}

async function recoverStaleAccountDeletions(db, {
  leaseMinutes = DELETION_MARKER_LEASE_MINUTES,
} = {}) {
  const boundedLease = Math.max(5, Math.min(Number(leaseMinutes) || DELETION_MARKER_LEASE_MINUTES, 1440))
  const { rowCount } = await db.query(
    `UPDATE account
        SET deleting_at = NULL
      WHERE deleting_at IS NOT NULL
        AND deleting_at < now() - make_interval(mins => $1)`,
    [boundedLease],
  )
  return Number(rowCount || 0)
}

async function processMarketingDeletionOutbox(db, { limit = 25, archive = archiveMarketingSubscriberHash } = {}) {
  await recoverStaleAccountDeletions(db)
  const { rows } = await db.query(
    `WITH due AS (
       SELECT id FROM marketing_deletion_outbox
        WHERE next_attempt_at <= now()
        ORDER BY next_attempt_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     UPDATE marketing_deletion_outbox AS job
        SET attempts = job.attempts + 1,
            next_attempt_at = now() + make_interval(mins => LEAST(1440, 5 * (job.attempts + 1))),
            updated_at = now()
       FROM due
      WHERE job.id = due.id
      RETURNING job.id, job.subscriber_hash`,
    [Math.max(1, Math.min(Number(limit) || 25, 100))],
  )

  let completed = 0
  for (const job of rows) {
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await lockMarketingSubscriber(client, job.subscriber_hash)
      const current = await client.query(
        `SELECT action, intent_id FROM marketing_contact_state WHERE subscriber_hash = $1`,
        [job.subscriber_hash],
      )
      let state = current.rows[0]
      if (!state) {
        const intentId = crypto.randomUUID()
        await client.query(
          `INSERT INTO marketing_contact_state (subscriber_hash, action, intent_id)
                VALUES ($1, $2, $3)
           ON CONFLICT (subscriber_hash) DO NOTHING`,
          [job.subscriber_hash, 'archive', intentId],
        )
        state = { action: 'archive', intent_id: intentId }
      }
      if (state.action !== 'archive') {
        await client.query(`DELETE FROM marketing_deletion_outbox WHERE id = $1`, [job.id])
        await client.query('COMMIT')
        completed += 1
        continue
      }
      const result = await archive(job.subscriber_hash)
      if (!result?.configured) throw new Error('Mailchimp is not configured.')
      await client.query(`DELETE FROM marketing_deletion_outbox WHERE id = $1`, [job.id])
      await client.query('COMMIT')
      completed += 1
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      await db.query(
        `UPDATE marketing_deletion_outbox
            SET last_error = $2, updated_at = now()
          WHERE id = $1`,
        [job.id, String(error?.message || error).slice(0, 500)],
      ).catch(() => {})
    } finally {
      client.release()
    }
  }
  return { claimed: rows.length, completed }
}

module.exports = {
  config,
  DELETION_MARKER_LEASE_MINUTES,
  subscriberHash,
  marketingMemberPayload,
  lockMarketingSubscriber,
  stageMarketingSync,
  stageMarketingDeletion,
  syncMarketingContact,
  archiveMarketingContact,
  archiveMarketingSubscriberHash,
  recoverStaleAccountDeletions,
  processMarketingDeletionOutbox,
}
