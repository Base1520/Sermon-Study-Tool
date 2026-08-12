const crypto = require('crypto')
const {
  stageMarketingSync,
  syncMarketingContact,
} = require('./mailchimp')
const {
  MOBILE_CONSENT_VERSION,
  MobileAccountError,
  claimAnonymousInstallData,
  normalizeEmail,
  trialIdentityHash,
} = require('./mobile-account')
const {
  RECOVERY_TTL_MINUTES,
  RECOVERY_MAX_ATTEMPTS,
  RECOVERY_MAX_REQUESTS_PER_HOUR,
  AccountRecoveryError,
  generateRecoveryCode,
  recoverySecret,
  sendRecoveryCode,
} = require('./account-recovery')

const REGISTRATION_TTL_MINUTES = RECOVERY_TTL_MINUTES
const REGISTRATION_MAX_ATTEMPTS = RECOVERY_MAX_ATTEMPTS
const REGISTRATION_MAX_REQUESTS_PER_HOUR = RECOVERY_MAX_REQUESTS_PER_HOUR
const REGISTRATION_MAX_REQUESTS_PER_IP_PER_HOUR = RECOVERY_MAX_REQUESTS_PER_HOUR
const REGISTRATION_MAX_REQUESTS_PER_DAY = 250
const REGISTRATION_RETENTION_HOURS = 48
const REGISTRATION_COOLDOWN_MS = 60_000

class AccountRegistrationError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function registrationDigest(value) {
  try {
    return crypto.createHmac('sha256', recoverySecret())
      .update(`registration:${String(value)}`)
      .digest('hex')
  } catch (error) {
    if (error instanceof AccountRecoveryError) {
      throw new AccountRegistrationError(
        503,
        'REGISTRATION_NOT_CONFIGURED',
        'Email verification is not available right now.',
      )
    }
    throw error
  }
}

function registrationEmailHash(email) {
  return registrationDigest(`email:${email}`)
}

function registrationInstallHash(installId) {
  return registrationDigest(`install:${String(installId || '').trim()}`)
}

function registrationSourceIpHash(sourceIp) {
  return registrationDigest(`source-ip:${String(sourceIp || 'unknown').trim() || 'unknown'}`)
}

function registrationCodeHash({ emailHash, installHash, code }) {
  return registrationDigest(`code:${emailHash}:${installHash}:${code}`)
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function registrationEmailFailure(error) {
  if (error instanceof AccountRegistrationError) return error
  return new AccountRegistrationError(
    503,
    'REGISTRATION_EMAIL_FAILED',
    'The verification email could not be sent. Try again in a moment.',
  )
}

async function lockRegistrationIdentity(client, emailHash, installHash, sourceIpHash) {
  const keys = ['global', `email:${emailHash}`, `install:${installHash}`, `source-ip:${sourceIpHash}`].sort()
  for (const key of keys) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`operator-registration:${key}`])
  }
}

async function purgeExpiredRegistrationCodes(db) {
  const result = await db.query(
    `DELETE FROM account_registration_code
      WHERE created_at < now() - ($1 || ' hours')::interval`,
    [REGISTRATION_RETENTION_HOURS],
  )
  return Number(result.rowCount || 0)
}

async function requestRegistrationCode(db, {
  email: rawEmail,
  installId,
  platform = null,
  label = 'Mobile device',
  marketingOptIn = false,
  sourceIp = null,
}, {
  send = sendRecoveryCode,
  randomInt = crypto.randomInt,
} = {}) {
  const email = normalizeEmail(rawEmail)
  if (!email || !installId) {
    throw new AccountRegistrationError(
      400,
      'REGISTRATION_REQUIRED',
      'Enter a valid email address to start your free study.',
    )
  }
  const emailHash = registrationEmailHash(email)
  const installHash = registrationInstallHash(installId)
  const sourceIpHash = registrationSourceIpHash(sourceIp)
  const client = await db.connect()
  let request
  try {
    await client.query('BEGIN')
    await lockRegistrationIdentity(client, emailHash, installHash, sourceIpHash)
    await purgeExpiredRegistrationCodes(client)
    const recent = await client.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE email_hash = $1 AND created_at > now() - interval '1 hour'
         )::int AS email_hourly,
         MAX(created_at) FILTER (WHERE email_hash = $1) AS email_last_created_at,
         COUNT(*) FILTER (
           WHERE install_hash = $2 AND created_at > now() - interval '1 hour'
         )::int AS install_hourly,
         MAX(created_at) FILTER (WHERE install_hash = $2) AS install_last_created_at,
         COUNT(*) FILTER (
           WHERE source_ip_hash = $3 AND created_at > now() - interval '1 hour'
         )::int AS source_ip_hourly,
         COUNT(*) FILTER (
           WHERE created_at > now() - interval '24 hours'
         )::int AS global_daily
       FROM account_registration_code`,
      [emailHash, installHash, sourceIpHash],
    )
    const limits = recent.rows[0] || {}
    if (
      Number(limits.email_hourly || 0) >= REGISTRATION_MAX_REQUESTS_PER_HOUR ||
      Number(limits.install_hourly || 0) >= REGISTRATION_MAX_REQUESTS_PER_HOUR ||
      Number(limits.source_ip_hourly || 0) >= REGISTRATION_MAX_REQUESTS_PER_IP_PER_HOUR ||
      Number(limits.global_daily || 0) >= REGISTRATION_MAX_REQUESTS_PER_DAY
    ) {
      throw new AccountRegistrationError(
        429,
        'REGISTRATION_RATE_LIMIT',
        'Too many verification codes were requested. Wait an hour and try again.',
      )
    }
    const latestRequestAt = [limits.email_last_created_at, limits.install_last_created_at]
      .filter(Boolean)
      .reduce((latest, value) => Math.max(latest, new Date(value).getTime()), 0)
    if (latestRequestAt && Date.now() - latestRequestAt < REGISTRATION_COOLDOWN_MS) {
      throw new AccountRegistrationError(
        429,
        'REGISTRATION_COOLDOWN',
        'Wait one minute before requesting another verification code.',
      )
    }

    const existing = await client.query(
      `SELECT id FROM account WHERE lower(email) = $1 LIMIT 1`,
      [email],
    )
    await client.query(
      `UPDATE account_registration_code SET consumed_at = COALESCE(consumed_at, now())
        WHERE email_hash = $1 AND install_hash = $2 AND consumed_at IS NULL`,
      [emailHash, installHash],
    )
    const code = generateRecoveryCode(randomInt)
    const deliverable = existing.rows.length === 0
    const storedHash = deliverable
      ? registrationCodeHash({ emailHash, installHash, code })
      : registrationDigest(`decoy:${crypto.randomUUID()}`)
    const inserted = await client.query(
      `INSERT INTO account_registration_code
            (account_id, email_hash, install_hash, source_ip_hash, code_hash, platform, device_label,
             marketing_opt_in, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + ($9 || ' minutes')::interval)
       RETURNING id`,
      [
        existing.rows[0]?.id || null,
        emailHash,
        installHash,
        sourceIpHash,
        storedHash,
        platform,
        String(label || 'Mobile device').slice(0, 80),
        Boolean(marketingOptIn),
        REGISTRATION_TTL_MINUTES,
      ],
    )
    request = { id: inserted.rows[0].id, email, code, deliverable }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  if (request.deliverable) {
    try {
      await send(request.email, request.code, `registration-${request.id}`)
    } catch (error) {
      await db.query(
        `UPDATE account_registration_code SET consumed_at = now()
          WHERE id = $1 AND consumed_at IS NULL`,
        [request.id],
      ).catch(() => {})
      throw registrationEmailFailure(error)
    }
  }
  return { accepted: true }
}

async function createVerifiedMobileAccount(client, auth, {
  email,
  installId,
  platform,
  label,
  marketingOptIn,
}) {
  let account
  let createdAccount = false
  const existing = await client.query(
    `SELECT id, email, plan, status, install_id, deleting_at
       FROM account
      WHERE lower(email) = $1
      FOR UPDATE`,
    [email],
  )
  account = existing.rows[0]
  if (account?.deleting_at) {
    throw new MobileAccountError(409, 'ACCOUNT_DELETING', 'That Operator account is being deleted right now.')
  }
  if (account) {
    throw new MobileAccountError(409, 'ACCOUNT_EXISTS', 'That email already has an Operator account.')
  }

  const identityHashes = [
    trialIdentityHash('email', email),
    trialIdentityHash('install', installId),
  ].filter(Boolean)
  const trialHistory = await client.query(
    `SELECT
       GREATEST(
         COALESCE((SELECT MAX(free_studies_used) FROM free_trial_tombstone WHERE identity_hash = ANY($1::text[])), 0),
         COALESCE((SELECT studies_used FROM anon_install WHERE install_id = $2), 0)
       )::int AS free_studies_used,
       GREATEST(
         COALESCE((SELECT MAX(free_asks_used) FROM free_trial_tombstone WHERE identity_hash = ANY($1::text[])), 0),
         COALESCE((SELECT asks_used FROM anon_install WHERE install_id = $2), 0)
       )::int AS free_asks_used`,
    [identityHashes, installId],
  )
  const priorFreeStudies = Number(trialHistory.rows[0]?.free_studies_used || 0)
  const priorFreeAsks = Number(trialHistory.rows[0]?.free_asks_used || 0)
  const created = await client.query(
    `INSERT INTO account
          (email, plan, status, install_id, free_studies_used, free_asks_used)
          VALUES ($1, 'free', 'none', $2, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING id, email, plan, status, install_id, free_studies_used, free_asks_used`,
    [email, installId, priorFreeStudies, priorFreeAsks],
  )
  account = created.rows[0]
  createdAccount = Boolean(account)
  if (!account) {
    const raced = await client.query(
      `SELECT id, email, plan, status, install_id, deleting_at
         FROM account
        WHERE lower(email) = $1
        FOR UPDATE`,
      [email],
    )
    account = raced.rows[0]
  }
  if (!account || !createdAccount) {
    throw new MobileAccountError(409, 'ACCOUNT_EXISTS', 'That email already has an Operator account.')
  }
  if (account.deleting_at) {
    throw new MobileAccountError(409, 'ACCOUNT_DELETING', 'That Operator account is being deleted right now.')
  }
  const protectedAccount = await client.query(
    `UPDATE account
        SET free_studies_used = GREATEST(free_studies_used, $2),
            free_asks_used = GREATEST(free_asks_used, $3)
      WHERE id = $1
      RETURNING id, email, plan, status, install_id, free_studies_used, free_asks_used`,
    [account.id, priorFreeStudies, priorFreeAsks],
  )
  account = protectedAccount.rows[0] || account

  await claimAnonymousInstallData(client, account.id, installId)
  const issued = await auth.issueDeviceToken(client, {
    accountId: account.id,
    installId,
    platform,
    label,
  })
  await client.query(
    `INSERT INTO download_lead
          (email, source, last_platform, marketing_opt_in, consent_version)
          VALUES ($1, 'operator-mobile', $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
            SET last_platform = EXCLUDED.last_platform,
                marketing_opt_in = download_lead.marketing_opt_in OR EXCLUDED.marketing_opt_in,
                consent_version = CASE
                  WHEN EXCLUDED.marketing_opt_in THEN EXCLUDED.consent_version
                  ELSE download_lead.consent_version
                END,
                download_count = download_lead.download_count + 1,
                last_downloaded_at = now()`,
    [email, platform || 'mobile', Boolean(marketingOptIn), marketingOptIn ? MOBILE_CONSENT_VERSION : null],
  )
  const marketingIntentId = marketingOptIn ? crypto.randomUUID() : null
  if (marketingIntentId) await stageMarketingSync(client, email, marketingIntentId)
  return { ...issued, account, email, marketingIntentId }
}

async function confirmRegistrationCode(db, auth, {
  email: rawEmail,
  code: rawCode,
  installId,
}) {
  const email = normalizeEmail(rawEmail)
  const code = String(rawCode || '').trim()
  if (!email || !/^\d{6}$/.test(code) || !installId) {
    throw new AccountRegistrationError(
      400,
      'REGISTRATION_CODE_INVALID',
      'That verification code is not valid or has expired.',
    )
  }
  const emailHash = registrationEmailHash(email)
  const installHash = registrationInstallHash(installId)
  const client = await db.connect()
  let completed = null
  let invalid = null
  try {
    await client.query('BEGIN')
    const pendingResult = await client.query(
      `SELECT id, code_hash, attempts, platform, device_label, marketing_opt_in
         FROM account_registration_code
        WHERE email_hash = $1 AND install_hash = $2
          AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [emailHash, installHash],
    )
    const pending = pendingResult.rows[0]
    const candidateHash = pending
      ? registrationCodeHash({ emailHash, installHash, code })
      : registrationDigest(`invalid:${emailHash}:${installHash}:${code}`)
    const valid = pending && secureEqual(candidateHash, pending.code_hash)
    if (!valid) {
      if (pending) {
        await client.query(
          `UPDATE account_registration_code
              SET attempts = attempts + 1,
                  consumed_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE consumed_at END
            WHERE id = $1`,
          [pending.id, REGISTRATION_MAX_ATTEMPTS],
        )
      }
      await client.query('COMMIT')
      invalid = new AccountRegistrationError(
        400,
        'REGISTRATION_CODE_INVALID',
        'That verification code is not valid or has expired.',
      )
    } else {
      try {
        completed = await createVerifiedMobileAccount(client, auth, {
          email,
          installId,
          platform: pending.platform,
          label: pending.device_label,
          marketingOptIn: pending.marketing_opt_in,
        })
      } catch (error) {
        if (!(error instanceof MobileAccountError) || !['ACCOUNT_EXISTS', 'ACCOUNT_DELETING'].includes(error.code)) {
          throw error
        }
        await client.query(
          `UPDATE account_registration_code SET consumed_at = now()
            WHERE id = $1 AND consumed_at IS NULL`,
          [pending.id],
        )
        await client.query('COMMIT')
        invalid = new AccountRegistrationError(
          400,
          'REGISTRATION_CODE_INVALID',
          'That verification code is not valid or has expired.',
        )
      }
      if (!invalid) {
        const consumed = await client.query(
          `UPDATE account_registration_code SET consumed_at = now()
            WHERE id = $1 AND consumed_at IS NULL
          RETURNING id`,
          [pending.id],
        )
        if (!consumed.rows.length) {
          throw new AccountRegistrationError(
            400,
            'REGISTRATION_CODE_INVALID',
            'That verification code is not valid or has expired.',
          )
        }
        await client.query(
          `UPDATE account_registration_code
              SET account_id = $2
            WHERE email_hash = $1`,
          [emailHash, completed.account.id],
        )
        await client.query('COMMIT')
      }
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  if (invalid) throw invalid
  if (completed.marketingIntentId) {
    syncMarketingContact(db, completed.email, { intentId: completed.marketingIntentId })
      .catch((error) => console.error('[mailchimp] mobile contact sync failed:', error.message))
  }
  return {
    token: completed.token,
    deviceId: completed.deviceId,
    account: completed.account,
  }
}

module.exports = {
  REGISTRATION_TTL_MINUTES,
  REGISTRATION_MAX_ATTEMPTS,
  REGISTRATION_MAX_REQUESTS_PER_HOUR,
  REGISTRATION_MAX_REQUESTS_PER_IP_PER_HOUR,
  REGISTRATION_MAX_REQUESTS_PER_DAY,
  REGISTRATION_RETENTION_HOURS,
  AccountRegistrationError,
  registrationEmailHash,
  registrationInstallHash,
  registrationSourceIpHash,
  registrationCodeHash,
  purgeExpiredRegistrationCodes,
  requestRegistrationCode,
  confirmRegistrationCode,
}
