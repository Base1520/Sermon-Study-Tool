const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
const { generateDeviceLinkCode, sha256 } = require('./mobile')

const REVIEW_ACCOUNT_EMAIL = 'app-review@base1520.com'
const REVIEW_CODE_COUNT = 5
const REVIEW_LINK_TTL_MS = 45 * 24 * 60 * 60 * 1000

class ReviewAccessError extends Error {}

function reviewEmail(value) {
  return String(value || '').trim().toLowerCase()
}

async function provisionReviewAccess(db, {
  email = REVIEW_ACCOUNT_EMAIL,
  now = new Date(),
  randomBytes = crypto.randomBytes,
} = {}) {
  const normalizedEmail = reviewEmail(email)
  if (normalizedEmail !== REVIEW_ACCOUNT_EMAIL) {
    throw new ReviewAccessError(`Review access is locked to ${REVIEW_ACCOUNT_EMAIL}.`)
  }

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    let accountResult = await client.query(
      `SELECT id, deleting_at, stripe_customer_id, stripe_subscription_id
         FROM account
        WHERE lower(email) = $1
        FOR UPDATE`,
      [normalizedEmail],
    )
    let created = false
    if (!accountResult.rows.length) {
      accountResult = await client.query(
        `INSERT INTO account (email)
              VALUES ($1)
           RETURNING id, deleting_at, stripe_customer_id, stripe_subscription_id`,
        [normalizedEmail],
      )
      created = true
    }

    const account = accountResult.rows[0]
    if (account.deleting_at || account.stripe_customer_id || account.stripe_subscription_id) {
      throw new ReviewAccessError('The dedicated review account is not empty; refusing to alter it.')
    }
    const { rows: evidenceRows } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM study WHERE account_id = $1) AS studies,
         (SELECT COUNT(*)::int FROM billing_subscription WHERE account_id = $1) AS subscriptions`,
      [account.id],
    )
    const evidence = evidenceRows[0] || {}
    if (Number(evidence.studies || 0) > 0 || Number(evidence.subscriptions || 0) > 0) {
      throw new ReviewAccessError('The dedicated review account contains study or billing data; refusing to alter it.')
    }

    await client.query(
      `UPDATE device SET revoked_at = now()
        WHERE account_id = $1 AND revoked_at IS NULL`,
      [account.id],
    )
    await client.query(
      `UPDATE device_link SET expires_at = now()
        WHERE account_id = $1 AND used_at IS NULL AND expires_at > now()`,
      [account.id],
    )

    const expiresAt = new Date(now.getTime() + REVIEW_LINK_TTL_MS)
    const codes = []
    const seen = new Set()
    for (let attempt = 0; codes.length < REVIEW_CODE_COUNT && attempt < 50; attempt += 1) {
      const code = generateDeviceLinkCode(randomBytes)
      if (seen.has(code)) continue
      seen.add(code)
      const inserted = await client.query(
        `INSERT INTO device_link (code_hash, account_id, created_by_device_id, expires_at)
              VALUES ($1, $2, NULL, $3)
         ON CONFLICT (code_hash) DO NOTHING
         RETURNING code_hash`,
        [sha256(code), account.id, expiresAt],
      )
      if (inserted.rows.length) codes.push(code)
    }
    if (codes.length !== REVIEW_CODE_COUNT) {
      throw new ReviewAccessError('Could not mint the complete one-time review code set.')
    }

    await client.query('COMMIT')
    return {
      accountId: account.id,
      email: normalizedEmail,
      accountCreated: created,
      codes,
      expiresAt: expiresAt.toISOString(),
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function main() {
  if (process.argv[2] !== '--apply') {
    throw new ReviewAccessError('Refusing to provision review access without --apply.')
  }
  const outputPath = String(process.env.REVIEW_ACCESS_OUTPUT || '').trim()
  if (!path.isAbsolute(outputPath)) {
    throw new ReviewAccessError('REVIEW_ACCESS_OUTPUT must be an absolute private file path.')
  }
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const result = await provisionReviewAccess(db)
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    fs.chmodSync(outputPath, 0o600)
    console.log(`Review access written to ${outputPath}.`)
  } finally {
    await db.end()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = {
  REVIEW_ACCOUNT_EMAIL,
  REVIEW_CODE_COUNT,
  REVIEW_LINK_TTL_MS,
  ReviewAccessError,
  provisionReviewAccess,
  reviewEmail,
}
