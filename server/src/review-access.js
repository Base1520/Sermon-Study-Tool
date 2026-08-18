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

/**
 * Env-seeded review link codes — the production path when nothing can reach
 * the database from outside Railway.
 *
 * `--apply` above needs DATABASE_URL, which resolves only inside the Railway
 * network. So the codes are minted LOCALLY (`--mint`), the plaintext goes only
 * to a chmod-600 file the operator hands to the store consoles' private
 * reviewer fields, and only their sha256 HASHES travel to production in
 * OPERATOR_REVIEW_LINK_HASHES ("hex64,hex64,…"), where migrate seeds them on
 * deploy — mirroring how OPERATOR_COMP_CODES already works. A hash cannot be
 * turned back into a code, so the variable is configuration, not a secret.
 *
 * Seeding is idempotent (ON CONFLICT DO NOTHING) and never revokes anything,
 * so a redeploy cannot invalidate a code a reviewer is mid-way through using.
 * The dedicated account is created if absent and pinned to the comp plan so a
 * reviewer who links can exercise every feature; an account that has ever
 * touched billing or deletion is refused rather than altered.
 */
const REVIEW_LINK_HASH_PATTERN = /^[0-9a-f]{64}$/

function parseReviewLinkHashes(raw) {
  const hashes = []
  let rejected = 0
  for (const entry of String(raw || '').split(',')) {
    const value = entry.trim().toLowerCase()
    if (!value) continue
    if (!REVIEW_LINK_HASH_PATTERN.test(value)) { rejected += 1; continue }
    if (!hashes.includes(value)) hashes.push(value)
  }
  return { hashes, rejected }
}

function mintReviewLinkCodes({ count = REVIEW_CODE_COUNT, randomBytes = crypto.randomBytes } = {}) {
  const codes = []
  for (let attempt = 0; codes.length < count && attempt < 50; attempt += 1) {
    const code = generateDeviceLinkCode(randomBytes)
    if (!codes.includes(code)) codes.push(code)
  }
  if (codes.length !== count) {
    throw new ReviewAccessError('Could not mint the complete one-time review code set.')
  }
  return { codes, hashes: codes.map((code) => sha256(code)) }
}

async function seedReviewLinkHashes(db, {
  hashes,
  email = REVIEW_ACCOUNT_EMAIL,
  now = new Date(),
} = {}) {
  const normalizedEmail = reviewEmail(email)
  if (normalizedEmail !== REVIEW_ACCOUNT_EMAIL) {
    throw new ReviewAccessError(`Review access is locked to ${REVIEW_ACCOUNT_EMAIL}.`)
  }
  const { hashes: clean, rejected } = parseReviewLinkHashes((hashes || []).join(','))
  if (rejected) {
    throw new ReviewAccessError('Review link hashes must be lowercase 64-hex sha256 digests.')
  }
  if (!clean.length) {
    return { accountId: null, accountCreated: false, inserted: 0, existing: 0 }
  }

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    let accountResult = await client.query(
      `SELECT id, deleting_at, stripe_customer_id, stripe_subscription_id, plan, status
         FROM account
        WHERE lower(email) = $1
        FOR UPDATE`,
      [normalizedEmail],
    )
    let created = false
    if (!accountResult.rows.length) {
      accountResult = await client.query(
        `INSERT INTO account (email, plan, status)
              VALUES ($1, 'comp', 'active')
           RETURNING id, deleting_at, stripe_customer_id, stripe_subscription_id, plan, status`,
        [normalizedEmail],
      )
      created = true
    }
    const account = accountResult.rows[0]
    if (account.deleting_at || account.stripe_customer_id || account.stripe_subscription_id) {
      throw new ReviewAccessError('The dedicated review account is not empty; refusing to alter it.')
    }
    if (account.plan !== 'comp' || account.status !== 'active') {
      await client.query(
        `UPDATE account SET plan = 'comp', status = 'active' WHERE id = $1`,
        [account.id],
      )
    }

    const expiresAt = new Date(now.getTime() + REVIEW_LINK_TTL_MS)
    let inserted = 0
    for (const hash of clean) {
      const result = await client.query(
        `INSERT INTO device_link (code_hash, account_id, created_by_device_id, expires_at)
              VALUES ($1, $2, NULL, $3)
         ON CONFLICT (code_hash) DO NOTHING
         RETURNING code_hash`,
        [hash, account.id, expiresAt],
      )
      if (result.rows.length) inserted += 1
    }
    await client.query('COMMIT')
    return {
      accountId: account.id,
      accountCreated: created,
      inserted,
      existing: clean.length - inserted,
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
  const mode = process.argv[2]
  if (mode === '--mint') {
    // Local, offline. Plaintext + hashes to one private file; nothing printed.
    const outputPath = String(process.env.REVIEW_ACCESS_OUTPUT || '').trim()
    if (!path.isAbsolute(outputPath)) {
      throw new ReviewAccessError('REVIEW_ACCESS_OUTPUT must be an absolute private file path.')
    }
    const minted = mintReviewLinkCodes()
    fs.writeFileSync(outputPath, `${JSON.stringify({
      email: REVIEW_ACCOUNT_EMAIL,
      ttlDays: REVIEW_LINK_TTL_MS / (24 * 60 * 60 * 1000),
      ...minted,
    }, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    fs.chmodSync(outputPath, 0o600)
    console.log(`Review link codes and hashes written to ${outputPath}. Put ONLY the hashes in OPERATOR_REVIEW_LINK_HASHES.`)
    return
  }
  if (mode !== '--apply') {
    throw new ReviewAccessError('Refusing to provision review access without --apply (or --mint for the offline path).')
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
  mintReviewLinkCodes,
  parseReviewLinkHashes,
  provisionReviewAccess,
  reviewEmail,
  seedReviewLinkHashes,
}
