// Where the license and the install identity live.
//
// The electron-store instance is injected rather than imported so this file
// stays testable without an Electron runtime, and so it can be swapped for a
// server-side store later without touching the logic.

const crypto = require('crypto')
const { verifyLicense, describeLicense } = require('./verify')
const { effectiveFeatures, FREE_FEATURES } = require('./features')

const LICENSE_KEY = 'license-string'
const INSTALL_ID_KEY = 'install-id'

/**
 * A stable per-install identifier, created once on first call.
 *
 * This does nothing today. It exists because seat ENFORCEMENT — an activation
 * endpoint that knows twenty-five people are using a twenty-five seat license —
 * needs machines to have carried an identity from the beginning. Adding it later
 * would mean asking every existing user to reinstall. It costs a UUID now and is
 * impossible to retrofit cleanly.
 *
 * It is random and local. Not hardware-derived, not a fingerprint, and it leaves
 * this machine only if a future activation step sends it deliberately.
 */
function getInstallId(store) {
  let id = store?.get(INSTALL_ID_KEY)
  if (typeof id !== 'string' || id.length < 8) {
    id = crypto.randomUUID()
    store?.set(INSTALL_ID_KEY, id)
  }
  return id
}

/** The raw license string as pasted, or '' when running free. */
function getLicenseString(store) {
  const s = store?.get(LICENSE_KEY)
  return typeof s === 'string' ? s : ''
}

/**
 * Resolve what this install can currently do.
 *
 * Always returns a usable answer. There is no path here that throws or that
 * leaves the caller without a feature set — the worst case is the free tier,
 * which is a working product.
 */
function entitlements(store, opts = {}) {
  const licenseString = getLicenseString(store)
  const result = verifyLicense(licenseString, opts)

  return {
    features: [...effectiveFeatures(result.valid ? result.features : [])],
    licensed: result.valid,
    reason: result.reason,
    tier: result.valid ? result.payload?.tier ?? null : null,
    org: result.valid ? result.payload?.org ?? null : null,
    issuedTo: result.payload?.issuedTo ?? null,
    seats: result.valid ? result.seats : 0,
    expires: result.payload?.expires ?? null,
    daysLeft: result.daysLeft,
    inGrace: result.inGrace,
    expired: result.expired,
    message: describeLicense(result),
  }
}

/**
 * Store a license the user pasted.
 *
 * Verifies BEFORE saving so a bad paste is rejected at the point the user can
 * still see what they pasted, rather than silently becoming a broken state they
 * discover later. An expired-but-authentic license is still saved: it is a real
 * customer, and keeping it lets the app say "renew" instead of "who are you".
 */
function setLicense(store, licenseString, opts = {}) {
  const cleaned = typeof licenseString === 'string' ? licenseString.trim() : ''

  if (!cleaned) {
    store?.delete(LICENSE_KEY)
    return { ok: true, cleared: true, ...entitlements(store, opts) }
  }

  const result = verifyLicense(cleaned, opts)
  if (!result.valid && result.reason !== 'expired') {
    return { ok: false, error: describeLicense(result), reason: result.reason }
  }

  store?.set(LICENSE_KEY, cleaned)
  return { ok: true, cleared: false, ...entitlements(store, opts) }
}

/** True when this install may use the capability. */
function can(store, featureId, opts = {}) {
  return entitlements(store, opts).features.includes(featureId)
}

module.exports = {
  getInstallId,
  getLicenseString,
  entitlements,
  setLicense,
  can,
  LICENSE_KEY,
  INSTALL_ID_KEY,
  FREE_FEATURES,
}
