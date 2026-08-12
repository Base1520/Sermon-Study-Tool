/**
 * auth.js — device bearer tokens.
 *
 * No passwords, no OAuth, no sessions. A desktop app cannot hold a browser
 * session and a pastor should not be made to invent a password to read his
 * Bible. Each install gets one long-lived token bound to an account.
 *
 * The raw token is shown exactly once, at issue. Only its SHA-256 lands in the
 * database, so a dump of the table cannot be replayed against the API.
 *
 * Anonymous requests are first-class: the free tier works with no account at
 * all, so an install identifies itself by its own local uuid until the moment
 * someone pays. That is what makes "download it and it works" true.
 */

const crypto = require('crypto')

const TOKEN_BYTES = 32
const PREFIX = 'opr_'

const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex')

/** Mint a token. The raw value is returned once and never stored. */
async function issueDeviceToken(db, { accountId, installId, label, platform }) {
  const raw = PREFIX + crypto.randomBytes(TOKEN_BYTES).toString('base64url')
  const { rows } = await db.query(
    `INSERT INTO device (account_id, token_hash, install_id, label, platform)
          VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
    [accountId, hash(raw), installId ?? null, label ?? null, platform ?? null],
  )
  return { token: raw, deviceId: rows[0].id }
}

/**
 * Identify the caller.
 *
 * Returns an anonymous identity rather than throwing when there is no token —
 * the free tier must work for someone who has never signed up, and treating
 * "no account" as an error would put the setup wall back exactly where the beta
 * proved it kills adoption.
 */
async function identify(db, { authorization, installId }) {
  const raw = (authorization || '').replace(/^Bearer\s+/i, '').trim()

  if (!raw) {
    return { anonymous: true, installId: installId || null, account: null, deviceId: null }
  }

  const { rows } = await db.query(
    `SELECT d.id AS device_id, d.revoked_at,
            a.id, a.email, a.plan, a.status, a.paid_through, a.usage_anchor_at, a.is_admin,
            a.free_studies_used, a.free_asks_used,
            a.stripe_customer_id, a.stripe_subscription_id
      FROM device d
      JOIN account a ON a.id = d.account_id
      WHERE d.token_hash = $1 AND a.deleting_at IS NULL`,
    [hash(raw)],
  )

  // An unknown or revoked token degrades to a stale anonymous identity so the
  // client can clear it without a lockout. It must NOT inherit x-install-id:
  // that header is caller-controlled, and retaining it would let a revoked
  // bearer reach anonymous rows claimed by the former account.
  if (rows.length === 0 || rows[0].revoked_at) {
    return { anonymous: true, installId: null, account: null, deviceId: null, staleToken: true }
  }

  const r = rows[0]
  // Fire and forget — a last-seen write must never delay or fail a study.
  db.query(`UPDATE device SET last_seen_at = now() WHERE id = $1`, [r.device_id]).catch(() => {})

  return {
    anonymous: false,
    installId: installId || null,
    deviceId: r.device_id,
    account: {
      id: r.id,
      email: r.email,
      plan: r.plan,
      status: r.status,
      paidThrough: r.paid_through,
      usageAnchorAt: r.usage_anchor_at,
      stripeCustomerId: r.stripe_customer_id,
      stripeSubscriptionId: r.stripe_subscription_id,
      isAdmin: Boolean(r.is_admin),
      freeStudiesUsed: Number(r.free_studies_used || 0),
      freeAsksUsed: Number(r.free_asks_used || 0),
    },
  }
}

/** Revoke one device without disturbing the others on the account. */
async function revokeDevice(db, { deviceId, accountId }) {
  const { rowCount } = await db.query(
    `UPDATE device SET revoked_at = now()
      WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL`,
    [deviceId, accountId],
  )
  return rowCount > 0
}

/** Express middleware: attaches req.identity and never rejects. */
function middleware(db) {
  return async (req, res, next) => {
    const authorization = req.get('authorization')
    try {
      req.identity = await identify(db, {
        authorization,
        installId: req.get('x-install-id'),
      })
    } catch (e) {
      if (String(authorization || '').trim()) {
        return res.status(503).json({
          error: 'AUTH_UNAVAILABLE',
          message: 'The Operator could not verify this device right now. Saved work remains available; try again in a moment.',
        })
      }
      req.identity = { anonymous: true, installId: req.get('x-install-id') || null, account: null, authError: e.message }
    }
    next()
  }
}

module.exports = { issueDeviceToken, identify, revokeDevice, middleware, hash, PREFIX }
