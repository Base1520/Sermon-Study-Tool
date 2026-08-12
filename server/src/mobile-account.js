const crypto = require('crypto')
const {
  stageMarketingDeletion,
  processMarketingDeletionOutbox,
} = require('./mailchimp')

const MOBILE_CONSENT_VERSION = 'operator-mobile-v1'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

class MobileAccountError extends Error {
  constructor(status, code, message, details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null
}

function trialIdentitySecret() {
  const secret = String(process.env.TRIAL_IDENTITY_SECRET || '')
  if (secret.length < 32) {
    throw new MobileAccountError(
      503,
      'TRIAL_PROTECTION_NOT_CONFIGURED',
      'Account protection is not configured right now. Try again in a moment.',
    )
  }
  return secret
}

function trialIdentityHash(kind, value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!['email', 'install'].includes(kind) || !normalized) return null
  return crypto.createHmac('sha256', trialIdentitySecret())
    .update(`${kind}:${normalized}`)
    .digest('hex')
}

async function lockedActiveWork(client, accountId) {
  const studyReservations = await client.query(
    `SELECT id FROM study_reservation
      WHERE account_id = $1 AND state = 'held'
      FOR UPDATE`,
    [accountId],
  )
  const askReservations = await client.query(
    `SELECT id FROM ask_reservation
      WHERE account_id = $1 AND state = 'held'
      FOR UPDATE`,
    [accountId],
  )
  const studies = await client.query(
    `SELECT id, state FROM study
      WHERE account_id = $1
      FOR UPDATE`,
    [accountId],
  )
  return Boolean(
    studyReservations.rows.length ||
    askReservations.rows.length ||
    studies.rows.some((row) => row.state === 'reading'),
  )
}

async function claimAnonymousInstallData(client, accountId, installId) {
  if (!accountId || !installId) return
  await client.query(
    `UPDATE study
        SET account_id = $1, updated_at = now()
      WHERE account_id IS NULL AND install_id = $2`,
    [accountId, installId],
  )
  await client.query(
    `UPDATE study_reservation SET account_id = $1
      WHERE account_id IS NULL AND install_id = $2`,
    [accountId, installId],
  )
  await client.query(
    `UPDATE ask_reservation SET account_id = $1
      WHERE account_id IS NULL AND install_id = $2`,
    [accountId, installId],
  )
  await client.query(
    `UPDATE usage_event SET account_id = $1
      WHERE account_id IS NULL AND install_id = $2`,
    [accountId, installId],
  )
}

async function clearDeletionMarker(db, accountId) {
  await db.query(`UPDATE account SET deleting_at = NULL WHERE id = $1`, [accountId])
}

async function deleteAccountData(db, identity, {
  confirmSubscriptions = false,
  cancelStripeSubscriptions = null,
} = {}) {
  const account = identity?.account
  if (!account) throw new MobileAccountError(401, 'ACCOUNT_REQUIRED', 'This device is not linked to an account.')

  let current
  let activeProviders = []
  let client = await db.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query(
      `SELECT id, email, install_id, free_studies_used, free_asks_used,
              stripe_subscription_id, deleting_at
         FROM account
        WHERE id = $1
        FOR UPDATE`,
      [account.id],
    )
    current = locked.rows[0]
    if (!current) throw new MobileAccountError(404, 'ACCOUNT_NOT_FOUND', 'This account is already deleted.')
    const resumingCommittedDeletion = Boolean(current.deleting_at)

    const subscriptions = await client.query(
      `SELECT DISTINCT provider
         FROM billing_subscription
        WHERE account_id = $1
          AND (
            (
              provider IN ('apple', 'google')
              AND status IN ('active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete')
            )
            OR (
              provider = 'stripe'
              AND status IN ('active', 'trialing')
              AND (current_period_end IS NULL OR current_period_end > now())
            )
          )`,
      [account.id],
    )
    activeProviders = subscriptions.rows.map((row) => row.provider)
    if (current.stripe_subscription_id && !activeProviders.includes('stripe')) activeProviders.push('stripe')
    if (activeProviders.length && !confirmSubscriptions && !resumingCommittedDeletion) {
      throw new MobileAccountError(
        409,
        'ACTIVE_SUBSCRIPTION',
        'This account still has an active or recoverable subscription. Review the billing warning before deleting it.',
        { activeProviders },
      )
    }
    if (activeProviders.includes('stripe') && !cancelStripeSubscriptions) {
      throw new MobileAccountError(503, 'STRIPE_CANCELLATION_UNAVAILABLE', 'Stripe cancellation is unavailable right now. The account was not deleted.')
    }
    if (await lockedActiveWork(client, account.id)) {
      throw new MobileAccountError(
        409,
        'ACCOUNT_BUSY',
        'A study or question is still being finished. Try deleting the account again after it completes.',
      )
    }
    await client.query(`UPDATE account SET deleting_at = COALESCE(deleting_at, now()) WHERE id = $1`, [account.id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  let accountBusy = false
  client = await db.connect()
  try {
    await client.query('BEGIN')
    const marked = await client.query(
      `SELECT id FROM account WHERE id = $1 AND deleting_at IS NOT NULL FOR UPDATE`,
      [account.id],
    )
    if (!marked.rows.length) throw new MobileAccountError(409, 'ACCOUNT_DELETION_INTERRUPTED', 'Account deletion was interrupted before it became safe. Try again.')
    accountBusy = await lockedActiveWork(client, account.id)
    if (accountBusy) await client.query(`UPDATE account SET deleting_at = NULL WHERE id = $1`, [account.id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    await clearDeletionMarker(db, account.id).catch(() => {})
    throw error
  } finally {
    client.release()
  }
  if (accountBusy) {
    throw new MobileAccountError(
      409,
      'ACCOUNT_BUSY',
      'A study or question started while deletion was being prepared. Nothing was deleted; try again after it completes.',
    )
  }

  try {
    if (cancelStripeSubscriptions) await cancelStripeSubscriptions(db, account.id)
  } catch (error) {
    await clearDeletionMarker(db, account.id).catch(() => {})
    throw error
  }

  client = await db.connect()
  try {
    await client.query('BEGIN')
    const marked = await client.query(
      `SELECT id FROM account WHERE id = $1 AND deleting_at IS NOT NULL FOR UPDATE`,
      [account.id],
    )
    if (!marked.rows.length) throw new MobileAccountError(409, 'ACCOUNT_DELETION_INTERRUPTED', 'Account deletion was interrupted before final removal. Try again.')
    const devices = await client.query(
      `SELECT install_id FROM device WHERE account_id = $1 AND install_id IS NOT NULL`,
      [account.id],
    )
    const rawIdentities = [
      { kind: 'email', value: current.email },
      { kind: 'install', value: current.install_id },
      { kind: 'install', value: identity.installId },
      ...devices.rows.map((row) => ({ kind: 'install', value: row.install_id })),
    ]
    const installIds = [...new Set([
      current.install_id,
      ...devices.rows.map((row) => row.install_id),
    ]
      .filter(Boolean))]
    const identities = rawIdentities
      .map(({ kind, value }) => ({ kind, hash: trialIdentityHash(kind, value) }))
      .filter(({ hash }) => Boolean(hash))
    const uniqueIdentities = [...new Map(identities.map((item) => [item.hash, item])).values()]
    if (uniqueIdentities.length) {
      await client.query(
        `INSERT INTO free_trial_tombstone
              (identity_hash, identity_kind, free_studies_used, free_asks_used)
         SELECT identity_hash, identity_kind, $3, $4
           FROM unnest($1::text[], $2::text[]) AS identity(identity_hash, identity_kind)
         ON CONFLICT (identity_hash) DO UPDATE
                SET free_studies_used = GREATEST(free_trial_tombstone.free_studies_used, EXCLUDED.free_studies_used),
                    free_asks_used = GREATEST(free_trial_tombstone.free_asks_used, EXCLUDED.free_asks_used),
                    last_deleted_at = now()`,
        [
          uniqueIdentities.map((item) => item.hash),
          uniqueIdentities.map((item) => item.kind),
          Number(current.free_studies_used || 0),
          Number(current.free_asks_used || 0),
        ],
      )
    }
    await client.query(
      `UPDATE usage_event
          SET account_id = NULL, install_id = NULL, reference = NULL
        WHERE account_id = $1`,
      [account.id],
    )
    await client.query(
      `UPDATE ask_reservation
          SET account_id = NULL, install_id = NULL
        WHERE account_id = $1 OR install_id = ANY($2::text[])`,
      [account.id, installIds],
    )
    await client.query(
      `DELETE FROM feedback
        WHERE account_id = $1 OR install_id = ANY($2::text[])`,
      [account.id, installIds],
    )
    await client.query(
      `DELETE FROM access_code_use
        WHERE account_id = $1 OR install_id = ANY($2::text[])`,
      [account.id, installIds],
    )
    await client.query(
      `DELETE FROM anon_install WHERE install_id = ANY($1::text[])`,
      [installIds],
    )
    await client.query(`DELETE FROM account_recovery_request WHERE account_id = $1`, [account.id])
    await client.query(`DELETE FROM account_registration_code WHERE account_id = $1`, [account.id])
    await client.query(`DELETE FROM study WHERE account_id = $1`, [account.id])
    await stageMarketingDeletion(client, current.email)
    await client.query(`DELETE FROM download_lead WHERE lower(email) = lower($1)`, [current.email])
    const deleted = await client.query(`DELETE FROM account WHERE id = $1 RETURNING id, email`, [account.id])
    if (!deleted.rows.length) throw new MobileAccountError(404, 'ACCOUNT_NOT_FOUND', 'This account is already deleted.')
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    await clearDeletionMarker(db, account.id).catch(() => {})
    throw error
  } finally {
    client.release()
  }

  processMarketingDeletionOutbox(db).catch((error) => console.error('[mailchimp] deletion outbox failed:', error.message))
  return { ok: true }
}

module.exports = {
  MOBILE_CONSENT_VERSION,
  MobileAccountError,
  normalizeEmail,
  trialIdentitySecret,
  trialIdentityHash,
  claimAnonymousInstallData,
  deleteAccountData,
}
