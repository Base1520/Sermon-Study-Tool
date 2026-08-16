const crypto = require('crypto')
const {
  MobileAccountError,
  claimAnonymousInstallData,
  deleteAccountData,
} = require('./mobile-account')
const {
  AccountRegistrationError,
  requestRegistrationCode,
  confirmRegistrationCode,
} = require('./account-registration')
const {
  AccountRecoveryError,
  requestRecoveryCode,
  confirmRecoveryCode,
} = require('./account-recovery')
const { capabilityChecks } = require('./readiness')

const DEVICE_LINK_TTL_MS = 10 * 60 * 1000
const MAX_ACTIVE_DEVICES = 3
const MAX_NOTES_CHARS = 20_000
const MAX_WORKSPACE_CHARS = 500_000
const PUBLIC_TRANSLATIONS = new Set(['kjv', 'asv', 'ylt', 'darby', 'web', 'bbe'])
const LINK_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DEFAULT_MOBILE_ORIGINS = new Set([
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
])

class MobileRouteError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

function normalizeDeviceLabel(value, fallback = 'Mobile device') {
  const label = String(value || '').trim().replace(/\s+/g, ' ')
  return (label || fallback).slice(0, 80)
}

function normalizePlatform(value) {
  const platform = String(value || '').trim().toLowerCase()
  return ['ios', 'android', 'mac', 'windows', 'web'].includes(platform) ? platform : null
}

function generateDeviceLinkCode(randomBytes = crypto.randomBytes) {
  const bytes = randomBytes(8)
  let value = ''
  for (let index = 0; index < 8; index += 1) {
    value += LINK_ALPHABET[bytes[index] % LINK_ALPHABET.length]
  }
  return `OPR-${value.slice(0, 4)}-${value.slice(4)}`
}

function normalizeDeviceLinkCode(value) {
  const compact = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!/^OPR[A-HJ-NP-Z2-9]{8}$/.test(compact)) return null
  return `OPR-${compact.slice(3, 7)}-${compact.slice(7)}`
}

function allowedOrigins() {
  const configured = String(process.env.OPERATOR_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return new Set([...DEFAULT_MOBILE_ORIGINS, ...configured])
}

function remainingStudyCount(entitlement, used, hasAccount) {
  const limit = entitlement?.plan === 'free'
    ? entitlement?.lifetimeStudies
    : hasAccount ? entitlement?.allowance : entitlement?.lifetimeStudies
  return Math.max(Number(limit || 0) - Number(used || 0), 0)
}

function mobileEsvLicensed(env = process.env) {
  return capabilityChecks(env).esv_mobile
}

function mountCors(app) {
  const allowed = allowedOrigins()
  app.use((req, res, next) => {
    const origin = req.get('origin')
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Vary', 'Origin')
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Install-Id, X-ESV-Key')
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
      res.set('Access-Control-Max-Age', '86400')
      if (req.method === 'OPTIONS') return res.status(204).end()
    }
    next()
  })
}

async function createDeviceLink(db, { accountId, deviceId }) {
  const code = generateDeviceLinkCode()
  const expiresAt = new Date(Date.now() + DEVICE_LINK_TTL_MS)
  await db.query(
    `INSERT INTO device_link (code_hash, account_id, created_by_device_id, expires_at)
          VALUES ($1, $2, $3, $4)`,
    [sha256(code), accountId, deviceId, expiresAt],
  )
  await db.query(
    `DELETE FROM device_link
      WHERE expires_at < now() - interval '1 day'
         OR used_at < now() - interval '1 day'`,
  ).catch(() => {})
  return { code, expiresAt: expiresAt.toISOString(), maxDevices: MAX_ACTIVE_DEVICES }
}

async function redeemDeviceLink(db, auth, { code, installId, label, platform }) {
  const normalized = normalizeDeviceLinkCode(code)
  if (!normalized || !installId) {
    throw new MobileRouteError(404, 'INVALID_LINK_CODE', 'That link code is not valid or has expired.')
  }

  const client = await db.connect()
  let capacityWarning = null
  try {
    await client.query('BEGIN')
    const linkResult = await client.query(
      `SELECT account_id
         FROM device_link
        WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [sha256(normalized)],
    )
    const accountId = linkResult.rows[0]?.account_id
    if (!accountId) {
      throw new MobileRouteError(404, 'INVALID_LINK_CODE', 'That link code is not valid or has expired.')
    }

    const accountResult = await client.query(
      `SELECT id, email, plan, status
         FROM account
        WHERE id = $1
        FOR UPDATE`,
      [accountId],
    )
    const account = accountResult.rows[0]
    if (!account) {
      throw new MobileRouteError(409, 'ACCOUNT_NOT_ACTIVE', 'That account is not active right now.')
    }

    const sameInstallRevoke = await client.query(
      `UPDATE device SET revoked_at = now()
        WHERE account_id = $1 AND install_id = $2 AND revoked_at IS NULL`,
      [accountId, installId],
    )
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM device
        WHERE account_id = $1 AND revoked_at IS NULL`,
      [accountId],
    )
    const activeDeviceCount = Number(countResult.rows[0]?.count || 0)
    if (activeDeviceCount >= MAX_ACTIVE_DEVICES) {
      capacityWarning = `[device-link] capacity refused same_install_match=${sameInstallRevoke.rowCount > 0 ? 'yes' : 'no'} active_after_tentative_revoke=${activeDeviceCount}`
      throw new MobileRouteError(
        409,
        'DEVICE_LIMIT',
        `This account already has ${MAX_ACTIVE_DEVICES} active devices. Revoke one and try again.`,
      )
    }

    const claimed = await client.query(
      `UPDATE device_link SET used_at = now()
        WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING account_id`,
      [sha256(normalized)],
    )
    if (!claimed.rows.length) {
      throw new MobileRouteError(404, 'INVALID_LINK_CODE', 'That link code is not valid or has expired.')
    }

    await claimAnonymousInstallData(client, accountId, installId)
    const issued = await auth.issueDeviceToken(client, {
      accountId,
      installId,
      label: normalizeDeviceLabel(label),
      platform: normalizePlatform(platform),
    })
    await client.query('COMMIT')
    return { ...issued, account }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
    if (capacityWarning) {
      try { console.warn(capacityWarning) } catch {}
    }
  }
}

async function revokeCurrentDevice(db, auth, identity) {
  if (!identity?.account || !identity?.deviceId) {
    throw new MobileRouteError(401, 'ACCOUNT_REQUIRED', 'This device is not linked to an account.')
  }
  const revoked = await auth.revokeDevice(db, {
    deviceId: identity.deviceId,
    accountId: identity.account.id,
  })
  if (!revoked) throw new MobileRouteError(404, 'DEVICE_NOT_FOUND', 'This device is already signed out.')
  return true
}

function requireAccount(req, res) {
  if (!req.identity?.account) {
    res.status(401).json({ error: 'ACCOUNT_REQUIRED', message: 'Link or activate this device first.' })
    return null
  }
  return req.identity.account
}

function normalizeReference(value) {
  const reference = String(value || '')
    .normalize('NFKC')
    .replace(/[‐‑‒–—―−﹘﹣－]/g, '-')
    .trim()
    .replace(/\s+/g, ' ')
  return reference && reference.length <= 100 ? reference : null
}

function normalizeStudyWorkspace(value) {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MobileRouteError(400, 'INVALID_WORKSPACE', 'The sermon desk could not be saved because its layout was invalid.')
  }
  if (value.version !== 1) {
    throw new MobileRouteError(400, 'INVALID_WORKSPACE_VERSION', 'This sermon desk was created by an unsupported workspace version.')
  }
  const serialized = JSON.stringify(value)
  if (serialized.length > MAX_WORKSPACE_CHARS) {
    throw new MobileRouteError(413, 'WORKSPACE_TOO_LARGE', 'This sermon desk has more content than can be synced. Remove a few large tiles and try again.')
  }
  return serialized
}

function normalizeStudyNotes(value) {
  const notes = String(value || '')
  if (notes.length > MAX_NOTES_CHARS) {
    throw new MobileRouteError(
      400,
      'NOTES_TOO_LONG',
      `Field notes cannot exceed ${MAX_NOTES_CHARS.toLocaleString('en-US')} characters. Nothing was saved or truncated.`,
    )
  }
  return notes
}

async function fetchPassage({ reference, translation, esvKey }) {
  const requestedReference = normalizeReference(reference)
  if (!requestedReference) {
    throw new MobileRouteError(400, 'REFERENCE_REQUIRED', 'Enter a valid passage reference.')
  }
  const requestedTranslation = String(translation || 'kjv').trim().toLowerCase()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    if (requestedTranslation === 'esv') {
      if (!mobileEsvLicensed()) {
        throw new MobileRouteError(
          403,
          'ESV_LICENSE_REQUIRED',
          'ESV is unavailable in the mobile release until Base 1520 has written commercial permission from Crossway.',
        )
      }
      if (!esvKey) {
        throw new MobileRouteError(400, 'ESV_KEY_REQUIRED', 'Add your ESV API key in Account, then try again.')
      }
      const params = new URLSearchParams({
        q: requestedReference,
        'include-headings': 'false',
        'include-footnotes': 'false',
        'include-verse-numbers': 'true',
        'include-short-copyright': 'false',
        'include-passage-references': 'false',
        'include-selahs': 'false',
        'indent-paragraphs': '0',
        'indent-poetry': 'false',
      })
      const response = await fetch(`https://api.esv.org/v3/passage/text/?${params}`, {
        headers: { Authorization: `Token ${String(esvKey).trim()}` },
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new MobileRouteError(response.status === 401 ? 401 : 502, 'ESV_UNAVAILABLE', 'The ESV passage could not be loaded.')
      }
      const data = await response.json()
      const text = String(data.passages?.[0] || '').trim()
      if (!text) throw new MobileRouteError(404, 'PASSAGE_NOT_FOUND', 'No passage was found for that reference.')
      return {
        reference: data.canonical || requestedReference,
        translation: 'esv',
        text,
        verses: [],
        copyright: 'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.',
      }
    }

    if (!PUBLIC_TRANSLATIONS.has(requestedTranslation)) {
      throw new MobileRouteError(400, 'UNKNOWN_TRANSLATION', 'Choose one of the translations offered in the app.')
    }
    const response = await fetch(
      `https://bible-api.com/${encodeURIComponent(requestedReference)}?translation=${requestedTranslation}`,
      { signal: controller.signal },
    )
    if (!response.ok) {
      throw new MobileRouteError(response.status === 404 ? 404 : 502, 'PASSAGE_UNAVAILABLE', 'That passage could not be loaded.')
    }
    const data = await response.json()
    if (data.error) throw new MobileRouteError(404, 'PASSAGE_NOT_FOUND', String(data.error))
    const verses = Array.isArray(data.verses)
      ? data.verses.map((verse) => ({
        book: verse.book_name,
        chapter: Number(verse.chapter),
        verse: Number(verse.verse),
        text: String(verse.text || '').trim(),
      }))
      : []
    const text = verses.length
      ? verses.map((verse) => `[${verse.verse}] ${verse.text}`).join(' ')
      : String(data.text || '').trim().replace(/\s+/g, ' ')
    if (!text) throw new MobileRouteError(404, 'PASSAGE_NOT_FOUND', 'No passage was found for that reference.')
    return {
      reference: data.reference || requestedReference,
      translation: requestedTranslation,
      text,
      verses,
      copyright: 'Public domain translation supplied by bible-api.com.',
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new MobileRouteError(504, 'PASSAGE_TIMEOUT', 'The passage source took too long to respond.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function marketingOptInForRelease(value, env = process.env) {
  return capabilityChecks(env).marketing_sync && Boolean(value)
}

function mobileRegistrationEnabled(env = process.env) {
  return capabilityChecks(env).account_recovery_email
}

function mount(app, db, auth, options = {}) {
  const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
  const requireRecoveryEmail = (res) => {
    if (capabilityChecks().account_recovery_email) return true
    res.status(503).json({
      error: 'RECOVERY_DISABLED',
      message: 'Email sign-in is not enabled in this release. Link this phone from The Operator on desktop.',
    })
    return false
  }

  app.post('/v1/mobile/register', route(async (req, res) => {
    if (!mobileRegistrationEnabled()) {
      return res.status(503).json({
        error: 'REGISTRATION_DISABLED',
        message: 'New mobile accounts are not enabled in this release. Link this phone from The Operator on desktop.',
      })
    }
    try {
      const platform = normalizePlatform(req.body?.platform)
      await requestRegistrationCode(db, {
        email: req.body?.email,
        installId: req.identity.installId,
        platform,
        label: normalizeDeviceLabel(req.body?.label, platform === 'ios' ? 'iPhone or iPad' : 'Android phone or tablet'),
        marketingOptIn: marketingOptInForRelease(req.body?.marketingOptIn),
        sourceIp: req.ip,
      })
      res.status(202).json({
        ok: true,
        message: 'If that email can be registered, a six-digit verification code is on the way.',
      })
    } catch (error) {
      if (error instanceof AccountRegistrationError) {
        return res.status(error.status).json({ error: error.code, message: error.message })
      }
      throw error
    }
  }))

  app.post('/v1/mobile/register/confirm', route(async (req, res) => {
    if (!mobileRegistrationEnabled()) {
      return res.status(503).json({
        error: 'REGISTRATION_DISABLED',
        message: 'New mobile accounts are not enabled in this release. Link this phone from The Operator on desktop.',
      })
    }
    try {
      const result = await confirmRegistrationCode(db, auth, {
        email: req.body?.email,
        code: req.body?.code,
        installId: req.identity.installId,
      })
      res.status(201).json({
        token: result.token,
        deviceId: result.deviceId,
        accountId: result.account.id,
        email: result.account.email,
        plan: result.account.plan,
      })
    } catch (error) {
      if (error instanceof AccountRegistrationError) {
        return res.status(error.status).json({ error: error.code, message: error.message })
      }
      throw error
    }
  }))

  app.post('/v1/mobile/recovery/request', route(async (req, res) => {
    if (!requireRecoveryEmail(res)) return
    try {
      await requestRecoveryCode(db, {
        email: req.body?.email,
        installId: req.identity.installId,
      })
      res.status(202).json({
        ok: true,
        message: 'If that email has an Operator account, a six-digit sign-in code is on the way.',
      })
    } catch (error) {
      if (error instanceof AccountRecoveryError) {
        return res.status(error.status).json({ error: error.code, message: error.message })
      }
      throw error
    }
  }))

  app.post('/v1/mobile/recovery/confirm', route(async (req, res) => {
    if (!requireRecoveryEmail(res)) return
    try {
      const platform = normalizePlatform(req.body?.platform)
      const result = await confirmRecoveryCode(db, auth, {
        email: req.body?.email,
        code: req.body?.code,
        installId: req.identity.installId,
        platform,
        label: normalizeDeviceLabel(
          req.body?.label,
          platform === 'ios' ? 'iPhone or iPad' : 'Android phone or tablet',
        ),
      })
      res.json({
        token: result.token,
        deviceId: result.deviceId,
        accountId: result.account.id,
        email: result.account.email,
        plan: result.account.plan,
      })
    } catch (error) {
      if (error instanceof AccountRecoveryError) {
        return res.status(error.status).json({ error: error.code, message: error.message })
      }
      throw error
    }
  }))

  app.get('/v1/passage', route(async (req, res) => {
    const reference = normalizeReference(req.query?.reference)
    if (!reference) return res.status(400).json({ error: 'REFERENCE_REQUIRED', message: 'Enter a valid passage reference.' })
    try {
      const passage = await fetchPassage({
        reference,
        translation: req.query?.translation,
        esvKey: req.get('x-esv-key'),
      })
      res.set('Cache-Control', 'private, max-age=300')
      res.json(passage)
    } catch (error) {
      if (error instanceof MobileRouteError) {
        return res.status(error.status).json({ error: error.code, message: error.message })
      }
      throw error
    }
  }))

  app.post('/v1/device-links', route(async (req, res) => {
    const account = requireAccount(req, res)
    if (!account) return
    const result = await createDeviceLink(db, {
      accountId: account.id,
      deviceId: req.identity.deviceId,
    })
    res.status(201).json(result)
  }))

  app.post('/v1/device-links/redeem', route(async (req, res) => {
    try {
      const result = await redeemDeviceLink(db, auth, {
        code: req.body?.code,
        installId: req.identity.installId,
        label: req.body?.label,
        platform: req.body?.platform,
      })
      res.json({
        token: result.token,
        deviceId: result.deviceId,
        accountId: result.account.id,
        email: result.account.email,
        plan: result.account.plan,
      })
    } catch (error) {
      if (error instanceof MobileRouteError) {
        return res.status(error.status).json({ error: error.code, message: error.message })
      }
      throw error
    }
  }))

  app.get('/v1/devices', route(async (req, res) => {
    const account = requireAccount(req, res)
    if (!account) return
    const { rows } = await db.query(
      `SELECT id, label, platform, install_id, created_at, last_seen_at,
              (id = $2) AS current
         FROM device
        WHERE account_id = $1 AND revoked_at IS NULL
        ORDER BY current DESC, COALESCE(last_seen_at, created_at) DESC`,
      [account.id, req.identity.deviceId],
    )
    res.json({ devices: rows, maxDevices: MAX_ACTIVE_DEVICES })
  }))

  app.delete('/v1/devices/:id', route(async (req, res) => {
    const account = requireAccount(req, res)
    if (!account) return
    if (String(req.params.id) === String(req.identity.deviceId)) {
      return res.status(409).json({ error: 'CURRENT_DEVICE', message: 'Use Sign out to remove this device.' })
    }
    const revoked = await auth.revokeDevice(db, { deviceId: req.params.id, accountId: account.id })
    if (!revoked) return res.status(404).json({ error: 'DEVICE_NOT_FOUND' })
    res.json({ ok: true })
  }))

  app.post('/v1/signout', route(async (req, res) => {
    try {
      await revokeCurrentDevice(db, auth, req.identity)
      res.json({ ok: true })
    } catch (error) {
      if (error instanceof MobileRouteError) {
        return res.status(error.status).json({ error: error.code, message: error.message })
      }
      throw error
    }
  }))

  app.delete('/v1/account', route(async (req, res) => {
    try {
      res.json(await deleteAccountData(db, req.identity, {
        confirmSubscriptions: Boolean(req.body?.confirmSubscriptions),
        cancelStripeSubscriptions: options.cancelStripeSubscriptions,
      }))
    } catch (error) {
      if (error instanceof MobileAccountError) {
        return res.status(error.status).json({ error: error.code, message: error.message, ...error.details })
      }
      throw error
    }
  }))

  app.get('/v1/studies', route(async (req, res) => {
    const account = requireAccount(req, res)
    if (!account) return
    const includeArchived = String(req.query?.archived || '') === 'true'
    const { rows } = await db.query(
      `SELECT id, reference, level, notes, state, created_at, updated_at, completed_at,
              archived_at, analysis->>'mainTheme' AS main_theme,
              (document IS NOT NULL) AS ready
         FROM study
        WHERE account_id = $1
          AND document IS NOT NULL
          AND ($2::boolean OR archived_at IS NULL)
        ORDER BY COALESCE(completed_at, updated_at) DESC
        LIMIT 200`,
      [account.id, includeArchived],
    )
    res.json({ studies: rows })
  }))

  app.get('/v1/studies/:id', route(async (req, res) => {
    const account = requireAccount(req, res)
    if (!account) return
    const { rows } = await db.query(
      `SELECT id, reference, level, notes, workspace, workspace_revision, analysis, document, passage, created_at, updated_at,
              completed_at, archived_at
         FROM study
        WHERE id = $1 AND account_id = $2 AND document IS NOT NULL`,
      [req.params.id, account.id],
    )
    if (!rows.length) return res.status(404).json({ error: 'STUDY_NOT_FOUND' })
    res.json({ study: rows[0] })
  }))

  app.patch('/v1/studies/:id/workspace', route(async (req, res) => {
    const account = requireAccount(req, res)
    if (!account) return
    const expectedWorkspaceRevision = Number(req.body?.workspaceRevision)
    if (!Number.isInteger(expectedWorkspaceRevision) || expectedWorkspaceRevision < 0) {
      return res.status(400).json({ error: 'WORKSPACE_REVISION_REQUIRED', message: 'Reopen this study before syncing its sermon desk.' })
    }
    const workspace = normalizeStudyWorkspace(req.body?.workspace)
    const { rows } = await db.query(
      `UPDATE study
          SET workspace = $3::jsonb, workspace_revision = workspace_revision + 1, updated_at = now()
        WHERE id = $1 AND account_id = $2 AND workspace_revision = $4
        RETURNING id, notes, workspace, workspace_revision, archived_at, updated_at`,
      [req.params.id, account.id, workspace, expectedWorkspaceRevision],
    )
    if (!rows.length) {
      const current = await db.query(
        'SELECT workspace_revision FROM study WHERE id = $1 AND account_id = $2',
        [req.params.id, account.id],
      )
      if (current.rows.length) {
        return res.status(409).json({
          error: 'WORKSPACE_CONFLICT',
          message: 'This sermon desk changed on another device. Your work is still saved on this iPad; reopen the study before syncing again.',
          currentRevision: current.rows[0].workspace_revision,
        })
      }
      return res.status(404).json({ error: 'STUDY_NOT_FOUND' })
    }
    res.json({ study: rows[0] })
  }))

  app.patch('/v1/studies/:id', route(async (req, res) => {
    const account = requireAccount(req, res)
    if (!account) return
    const updates = []
    const params = [req.params.id, account.id]
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) {
      const notes = normalizeStudyNotes(req.body.notes)
      params.push(notes)
      updates.push(`notes = $${params.length}`)
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'archived')) {
      params.push(Boolean(req.body.archived))
      updates.push(`archived_at = CASE WHEN $${params.length} THEN now() ELSE NULL END`)
    }
    if (!updates.length) return res.status(400).json({ error: 'NO_CHANGES' })
    const { rows } = await db.query(
      `UPDATE study SET ${updates.join(', ')}, updated_at = now()
        WHERE id = $1 AND account_id = $2
        RETURNING id, notes, workspace, workspace_revision, archived_at, updated_at`,
      params,
    )
    if (!rows.length) return res.status(404).json({ error: 'STUDY_NOT_FOUND' })
    res.json({ study: rows[0] })
  }))
}

module.exports = {
  DEVICE_LINK_TTL_MS,
  MAX_ACTIVE_DEVICES,
  MAX_NOTES_CHARS,
  MAX_WORKSPACE_CHARS,
  PUBLIC_TRANSLATIONS,
  MobileRouteError,
  sha256,
  generateDeviceLinkCode,
  normalizeDeviceLinkCode,
  normalizeDeviceLabel,
  normalizePlatform,
  normalizeReference,
  normalizeStudyNotes,
  normalizeStudyWorkspace,
  remainingStudyCount,
  mobileEsvLicensed,
  marketingOptInForRelease,
  mobileRegistrationEnabled,
  allowedOrigins,
  mountCors,
  createDeviceLink,
  redeemDeviceLink,
  revokeCurrentDevice,
  fetchPassage,
  mount,
}
