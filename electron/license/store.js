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
const CLOCK_KEY = 'last-seen-date'

/**
 * The license lives in its own file, separate from the history store.
 *
 * Two reasons, both about not losing a paying customer's access:
 *  - The main config.json is large and rewritten in full on every set(). If it
 *    is ever corrupted, the recovery is to clear it — which must not also
 *    destroy the license someone paid for.
 *  - It deliberately does NOT go through safeStorage. That ties decryption to
 *    app identity, which the rename to com.base1520.theoperator already broke
 *    once, and it throws outright on managed machines where OS encryption is
 *    unavailable. A signed license needs no confidentiality: it is already
 *    tamper-evident, and it is the customer's own key.
 */
let licenseStore = null

/** Called once at startup with electron-store's constructor. */
function initLicenseStore(StoreClass) {
  try {
    licenseStore = new StoreClass({ name: 'license' })
  } catch (e) {
    try {
      licenseStore = new StoreClass({ name: 'license', clearInvalidConfig: true })
    } catch {
      // Running unlicensed is a working product; refusing to start is not.
      console.log('[license] store unavailable, running free:', e?.message || e)
      licenseStore = null
    }
  }
  return licenseStore
}

/** Tests inject their own; main uses the module singleton. */
const resolve = (store) => store || licenseStore

/**
 * Record the furthest date this install has ever seen.
 *
 * Catches the naive attack on an expiring license: set the clock back a year.
 * It does not catch someone who also edits license.json, and that is the right
 * ceiling — the asar is patchable and the repo is public, so more hardening
 * buys nothing.
 */
function touchClock(store) {
  const s = resolve(store)
  const today = new Date().toISOString().slice(0, 10)
  const seen = s?.get(CLOCK_KEY)
  if (typeof seen !== 'string' || today > seen) s?.set(CLOCK_KEY, today)
  return s?.get(CLOCK_KEY) || today
}

/** True when the system clock is behind the furthest date we have recorded. */
function clockRolledBack(store) {
  const seen = resolve(store)?.get(CLOCK_KEY)
  if (typeof seen !== 'string') return false
  return new Date().toISOString().slice(0, 10) < seen
}

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
  const s = resolve(store)
  let id = s?.get(INSTALL_ID_KEY)
  if (typeof id !== 'string' || id.length < 8) {
    id = crypto.randomUUID()
    s?.set(INSTALL_ID_KEY, id)
  }
  return id
}

/** The raw license string as pasted, or '' when running free. */
function getLicenseString(store) {
  const s = resolve(store)?.get(LICENSE_KEY)
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
  let result = verifyLicense(licenseString, opts)

  // A clock behind the high-water mark means dates cannot be trusted, so an
  // expiring license is treated as expired. A perpetual one is unaffected —
  // there is nothing to cheat.
  if (result.valid && result.payload?.expires && clockRolledBack(store)) {
    result = { ...result, valid: false, reason: 'expired', features: [], expired: true, inGrace: false }
  }

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
  const s = resolve(store)
  const cleaned = typeof licenseString === 'string' ? licenseString.trim() : ''

  if (!cleaned) {
    s?.delete(LICENSE_KEY)
    return { ok: true, cleared: true, ...entitlements(store, opts) }
  }

  const result = verifyLicense(cleaned, opts)
  if (!result.valid && result.reason !== 'expired') {
    // Rejected, and deliberately WITHOUT touching what is already stored. A man
    // fumbling a paste of a new key must not lose the working one he already
    // had — that turns a typo into a support ticket and a lockout.
    return { ok: false, error: describeLicense(result), reason: result.reason }
  }

  s?.set(LICENSE_KEY, cleaned)
  return { ok: true, cleared: false, ...entitlements(store, opts) }
}

/** True when this install may use the capability. */
function can(store, featureId, opts = {}) {
  return entitlements(store, opts).features.includes(featureId)
}

module.exports = {
  initLicenseStore,
  touchClock,
  clockRolledBack,
  getInstallId,
  getLicenseString,
  entitlements,
  setLicense,
  can,
  LICENSE_KEY,
  INSTALL_ID_KEY,
  CLOCK_KEY,
  FREE_FEATURES,
}
