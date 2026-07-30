// License verification. Pure Node — imports nothing from Electron so it can be
// unit-tested directly and later moved to a server unchanged.
//
// FORMAT
//   <base64url(payload JSON)>.<base64url(ed25519 signature)>
//
// The signature covers the base64url payload STRING exactly as transmitted, not
// a re-serialized object. That removes canonical-JSON problems entirely: there
// is no way for the signer and the verifier to disagree about key order,
// whitespace or unicode escaping, because neither of them re-serializes.
//
// FAILING SAFE
//   The dangerous failure here is not piracy, it is locking a paying pastor out
//   of his study on a Sunday morning. So verification is strict about
//   authenticity (a forged signature is always rejected) and generous about
//   everything else: expiry has a grace period, unknown fields are ignored, and
//   a corrupt license file degrades to the free tier rather than to an error.

const crypto = require('crypto')

/**
 * The public half of Cole's signing key. Safe to ship — it can only verify.
 * The private half lives at ~/.operator-license-key on his machine and is
 * never in this repo, never in the app bundle, and never in a build artifact.
 */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAg9ohS+2HZ/q9emNGqBOPlShvq/4XAWvDCdl/4vk1zSQ=
-----END PUBLIC KEY-----`

/**
 * Days a license keeps working after its expiry date.
 *
 * A renewal that is slow to process, a card that needed re-authorizing, a
 * webhook that fired late — none of those should take the tool out of a man's
 * hands mid-week. Two weeks is long enough to notice and fix, short enough that
 * it is not a free extra month.
 */
const GRACE_DAYS = 14

const b64urlDecode = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

/**
 * Verify a license string.
 *
 * Never throws. Returns a result object in every case so callers can branch on
 * `valid` without a try/catch around the whole app.
 *
 * @param {string} licenseString
 * @param {{ now?: Date, publicKeyPem?: string }} [opts]
 * @returns {{
 *   valid: boolean,
 *   reason: string,
 *   payload: object|null,
 *   features: string[],
 *   seats: number,
 *   expired: boolean,
 *   inGrace: boolean,
 *   daysLeft: number|null,
 * }}
 */
function verifyLicense(licenseString, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date()
  const publicKeyPem = opts.publicKeyPem || PUBLIC_KEY_PEM

  const fail = (reason) => ({
    valid: false,
    reason,
    payload: null,
    features: [],
    seats: 0,
    expired: false,
    inGrace: false,
    daysLeft: null,
  })

  if (typeof licenseString !== 'string' || !licenseString.trim()) {
    return fail('no-license')
  }

  // Tolerate what a real person pastes: wrapped lines, stray spaces, an
  // accidental trailing newline from an email client.
  const cleaned = licenseString.replace(/\s+/g, '')
  const parts = cleaned.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return fail('malformed')

  const [payloadB64, sigB64] = parts

  // Authenticity first. Nothing in the payload is trusted until the signature
  // over it checks out.
  let signatureOk = false
  try {
    signatureOk = crypto.verify(
      null,
      Buffer.from(payloadB64, 'utf8'),
      crypto.createPublicKey(publicKeyPem),
      b64urlDecode(sigB64),
    )
  } catch {
    return fail('bad-signature')
  }
  if (!signatureOk) return fail('bad-signature')

  let payload
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'))
  } catch {
    return fail('bad-payload')
  }
  if (!payload || typeof payload !== 'object') return fail('bad-payload')

  // Expiry. A null or missing `expires` is a perpetual license, which is what a
  // one-time or lifetime purchase issues.
  let expired = false
  let inGrace = false
  let daysLeft = null

  if (payload.expires) {
    const expiresAt = new Date(payload.expires)
    if (Number.isNaN(expiresAt.getTime())) return fail('bad-expiry')

    const msLeft = expiresAt.getTime() - now.getTime()
    daysLeft = Math.ceil(msLeft / 86400000)

    if (msLeft < 0) {
      expired = true
      inGrace = -msLeft <= GRACE_DAYS * 86400000
      if (!inGrace) {
        // Signature was good — this really was a paying customer — so say so
        // precisely. The UI can offer to renew rather than treating him like a
        // stranger holding a forged key.
        return {
          valid: false,
          reason: 'expired',
          payload,
          features: [],
          seats: Number(payload.seats) || 1,
          expired: true,
          inGrace: false,
          daysLeft,
        }
      }
    }
  }

  // Unknown feature ids are carried through untouched. A license signed by a
  // future version of the signer may grant something this build has never heard
  // of; dropping it would silently downgrade a paying user, and rejecting the
  // license outright would lock him out over a string he cannot see.
  const features = Array.isArray(payload.features)
    ? payload.features.filter((f) => typeof f === 'string')
    : []

  return {
    valid: true,
    reason: inGrace ? 'in-grace' : 'ok',
    payload,
    features,
    seats: Number(payload.seats) || 1,
    expired,
    inGrace,
    daysLeft,
  }
}

/** Human-readable one-liner for the settings screen and for support. */
function describeLicense(result) {
  if (!result || !result.valid) {
    const map = {
      'no-license': 'No license — running the free version.',
      malformed: "That license key doesn't look complete. Check it copied in full.",
      'bad-signature': "That license key isn't valid.",
      'bad-payload': "That license key is damaged. Ask for a fresh one.",
      'bad-expiry': 'That license key is damaged. Ask for a fresh one.',
      expired: 'Your license has expired.',
    }
    return map[result?.reason] || 'Running the free version.'
  }
  const p = result.payload || {}
  const who = p.org || p.issuedTo || 'this computer'
  if (result.inGrace) {
    return `Licensed to ${who} — expired, still working for ${GRACE_DAYS + (result.daysLeft || 0)} more days. Renew when you can.`
  }
  if (result.daysLeft == null) return `Licensed to ${who}.`
  return `Licensed to ${who} — ${result.daysLeft} days remaining.`
}

module.exports = { verifyLicense, describeLicense, PUBLIC_KEY_PEM, GRACE_DAYS }
