const crypto = require('crypto')
const { version } = require('../package.json')
const { claimAnonymousInstallData, normalizeEmail } = require('./mobile-account')

const RECOVERY_TTL_MINUTES = 10
const RECOVERY_MAX_ATTEMPTS = 5
const RECOVERY_MAX_REQUESTS_PER_HOUR = 5
const RECOVERY_COOLDOWN_MS = 60_000
const RECOVERY_REQUEST_RETENTION_HOURS = 24
const MAX_ACTIVE_DEVICES = 3

class AccountRecoveryError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function recoverySecret() {
  const secret = String(process.env.ACCOUNT_RECOVERY_SECRET || '')
  if (secret.length < 32) {
    throw new AccountRecoveryError(503, 'RECOVERY_NOT_CONFIGURED', 'Account recovery is not available right now.')
  }
  return secret
}

function recoveryDigest(value) {
  return crypto.createHmac('sha256', recoverySecret()).update(String(value)).digest('hex')
}

function recoveryInstallHash(installId) {
  return recoveryDigest(`install:${String(installId || '').trim()}`)
}

function recoveryEmailHash(email) {
  return recoveryDigest(`email:${String(email || '').trim().toLowerCase()}`)
}

function recoveryCodeHash({ accountId, installHash, code }) {
  return recoveryDigest(`code:${accountId}:${installHash}:${code}`)
}

function generateRecoveryCode(randomInt = crypto.randomInt) {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

async function lockRecoveryIdentity(client, emailHash, installHash) {
  const keys = [`email:${emailHash}`, `install:${installHash}`].sort()
  for (const key of keys) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`operator-recovery:${key}`])
  }
}

async function sendRecoveryCode(email, code, requestId, fetchImpl = fetch) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  const from = String(process.env.OPERATOR_AUTH_FROM_EMAIL || '').trim()
  if (!apiKey || !from) {
    throw new AccountRecoveryError(503, 'RECOVERY_EMAIL_NOT_CONFIGURED', 'Account recovery email is not configured yet.')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `operator-recovery-${requestId}`,
        'user-agent': `operator-api/${version}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Your Operator sign-in code',
        text: `Your Operator sign-in code is ${code}. It expires in ${RECOVERY_TTL_MINUTES} minutes. If you did not request it, ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;background:#10120f;color:#f5f2e8"><div style="color:#e5be49;font-weight:800;letter-spacing:.12em">THE OPERATOR</div><h1 style="font-size:24px">Your sign-in code</h1><div style="font:700 38px/1.2 monospace;letter-spacing:.18em;margin:24px 0">${code}</div><p style="color:#c7c9bd">It expires in ${RECOVERY_TTL_MINUTES} minutes. If you did not request it, ignore this email.</p></div>`,
        tags: [{ name: 'message_type', value: 'account_recovery' }],
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      await response.text().catch(() => '')
      throw new AccountRecoveryError(503, 'RECOVERY_EMAIL_FAILED', 'The sign-in email could not be sent. Try again in a moment.')
    }
    return response.json().catch(() => ({}))
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AccountRecoveryError(503, 'RECOVERY_EMAIL_TIMEOUT', 'The sign-in email took too long to send.')
    }
    if (error instanceof AccountRecoveryError) throw error
    throw new AccountRecoveryError(503, 'RECOVERY_EMAIL_FAILED', 'The sign-in email could not be sent. Try again in a moment.')
  } finally {
    clearTimeout(timeout)
  }
}

async function requestRecoveryCode(db, {
  email: rawEmail,
  installId,
}, {
  send = sendRecoveryCode,
  randomInt = crypto.randomInt,
} = {}) {
  const email = normalizeEmail(rawEmail)
  if (!email || !installId) {
    throw new AccountRecoveryError(400, 'RECOVERY_INPUT_REQUIRED', 'Enter the email on your Operator account.')
  }
  const emailHash = recoveryEmailHash(email)
  const installHash = recoveryInstallHash(installId)
  const client = await db.connect()
  let request = null
  try {
    await client.query('BEGIN')
    await lockRecoveryIdentity(client, emailHash, installHash)
    await client.query(
      `DELETE FROM account_recovery_request
        WHERE created_at < now() - ($1 || ' hours')::interval`,
      [RECOVERY_REQUEST_RETENTION_HOURS],
    )
    const recent = await client.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE email_hash = $1 AND created_at > now() - interval '1 hour'
         )::int AS email_hourly,
         MAX(created_at) FILTER (WHERE email_hash = $1) AS email_last_created_at,
         COUNT(*) FILTER (
           WHERE install_hash = $2 AND created_at > now() - interval '1 hour'
         )::int AS install_hourly,
         MAX(created_at) FILTER (WHERE install_hash = $2) AS install_last_created_at
       FROM account_recovery_request
       WHERE email_hash = $1 OR install_hash = $2`,
      [emailHash, installHash],
    )
    const limits = recent.rows[0] || {}
    if (
      Number(limits.email_hourly || 0) >= RECOVERY_MAX_REQUESTS_PER_HOUR ||
      Number(limits.install_hourly || 0) >= RECOVERY_MAX_REQUESTS_PER_HOUR
    ) {
      throw new AccountRecoveryError(429, 'RECOVERY_RATE_LIMIT', 'Too many sign-in codes were requested. Wait an hour and try again.')
    }
    const latestRequestAt = [limits.email_last_created_at, limits.install_last_created_at]
      .filter(Boolean)
      .reduce((latest, value) => Math.max(latest, new Date(value).getTime()), 0)
    if (latestRequestAt && Date.now() - latestRequestAt < RECOVERY_COOLDOWN_MS) {
      throw new AccountRecoveryError(429, 'RECOVERY_COOLDOWN', 'Wait one minute before requesting another code.')
    }
    const accountResult = await client.query(
      `SELECT id, email FROM account
        WHERE lower(email) = $1 AND deleting_at IS NULL
        FOR UPDATE`,
      [email],
    )
    const account = accountResult.rows[0]
    await client.query(
      `INSERT INTO account_recovery_request
            (account_id, email_hash, install_hash)
            VALUES ($1, $2, $3)`,
      [account?.id || null, emailHash, installHash],
    )
    if (!account) {
      await client.query('COMMIT')
      return { accepted: true, sent: false }
    }
    await client.query(
      `UPDATE account_recovery_code SET consumed_at = COALESCE(consumed_at, now())
        WHERE account_id = $1 AND install_hash = $2 AND consumed_at IS NULL`,
      [account.id, installHash],
    )
    const code = generateRecoveryCode(randomInt)
    const inserted = await client.query(
      `INSERT INTO account_recovery_code
            (account_id, install_hash, code_hash, expires_at)
            VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)
       RETURNING id`,
      [account.id, installHash, recoveryCodeHash({ accountId: account.id, installHash, code }), RECOVERY_TTL_MINUTES],
    )
    request = { id: inserted.rows[0].id, account, code }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  try {
    await send(request.account.email, request.code, request.id)
  } catch (error) {
    await db.query(
      `UPDATE account_recovery_code SET consumed_at = now()
        WHERE id = $1 AND consumed_at IS NULL`,
      [request.id],
    ).catch(() => {})
    throw error
  }
  return { accepted: true, sent: true }
}

async function confirmRecoveryCode(db, auth, {
  email: rawEmail,
  code: rawCode,
  installId,
  label,
  platform,
}) {
  const email = normalizeEmail(rawEmail)
  const code = String(rawCode || '').trim()
  if (!email || !/^\d{6}$/.test(code) || !installId) {
    throw new AccountRecoveryError(400, 'RECOVERY_CODE_INVALID', 'That sign-in code is not valid or has expired.')
  }
  const installHash = recoveryInstallHash(installId)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const accountResult = await client.query(
      `SELECT id, email, plan, status FROM account
        WHERE lower(email) = $1 AND deleting_at IS NULL
        FOR UPDATE`,
      [email],
    )
    const account = accountResult.rows[0]
    const recoveryResult = account ? await client.query(
      `SELECT id, code_hash, attempts
         FROM account_recovery_code
        WHERE account_id = $1 AND install_hash = $2
          AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [account.id, installHash],
    ) : { rows: [] }
    const recovery = recoveryResult.rows[0]
    const candidateHash = account
      ? recoveryCodeHash({ accountId: account.id, installHash, code })
      : recoveryDigest(`invalid:${installHash}:${code}`)
    const valid = recovery && secureEqual(candidateHash, recovery.code_hash)
    if (!valid) {
      if (recovery) {
        await client.query(
          `UPDATE account_recovery_code
              SET attempts = attempts + 1,
                  consumed_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE consumed_at END
            WHERE id = $1`,
          [recovery.id, RECOVERY_MAX_ATTEMPTS],
        )
      }
      await client.query('COMMIT')
      throw new AccountRecoveryError(400, 'RECOVERY_CODE_INVALID', 'That sign-in code is not valid or has expired.')
    }

    await client.query(`UPDATE account_recovery_code SET consumed_at = now() WHERE id = $1`, [recovery.id])
    await client.query(
      `UPDATE device SET revoked_at = now()
        WHERE account_id = $1 AND install_id = $2 AND revoked_at IS NULL`,
      [account.id, installId],
    )
    const activeResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM device
        WHERE account_id = $1 AND revoked_at IS NULL`,
      [account.id],
    )
    if (Number(activeResult.rows[0]?.count || 0) >= MAX_ACTIVE_DEVICES) {
      await client.query(
        `UPDATE device SET revoked_at = now()
          WHERE id = (
            SELECT id FROM device
             WHERE account_id = $1 AND revoked_at IS NULL
             ORDER BY COALESCE(last_seen_at, created_at), created_at
             LIMIT 1
          )`,
        [account.id],
      )
    }
    await claimAnonymousInstallData(client, account.id, installId)
    const issued = await auth.issueDeviceToken(client, {
      accountId: account.id,
      installId,
      label,
      platform,
    })
    await client.query('COMMIT')
    return { ...issued, account }
  } catch (error) {
    if (error instanceof AccountRecoveryError && error.code === 'RECOVERY_CODE_INVALID') throw error
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

module.exports = {
  RECOVERY_TTL_MINUTES,
  RECOVERY_MAX_ATTEMPTS,
  RECOVERY_MAX_REQUESTS_PER_HOUR,
  RECOVERY_COOLDOWN_MS,
  AccountRecoveryError,
  recoverySecret,
  recoveryEmailHash,
  recoveryInstallHash,
  recoveryCodeHash,
  generateRecoveryCode,
  sendRecoveryCode,
  requestRecoveryCode,
  confirmRecoveryCode,
}
