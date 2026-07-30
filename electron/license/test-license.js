// Licensing tests. No network, no API cost — run these on every change.
//   node electron/license/test-license.js

const crypto = require('crypto')
const { verifyLicense, describeLicense, GRACE_DAYS } = require('./verify')
const { issue } = require('./sign')
const { effectiveFeatures, hasFeature, FREE_FEATURES, paidFeatureIds } = require('./features')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// A throwaway keypair so the suite never needs Cole's real signing key and can
// run anywhere, including CI.
const kp = crypto.generateKeyPairSync('ed25519')
const TEST_PUB = kp.publicKey.export({ type: 'spki', format: 'pem' })

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function mint(payload, key = kp.privateKey) {
  const p = b64url(JSON.stringify(payload))
  return `${p}.${b64url(crypto.sign(null, Buffer.from(p, 'utf8'), key))}`
}

const basePayload = (over = {}) => ({
  v: 1,
  licenseId: crypto.randomUUID(),
  issuedTo: 'pastor@church.org',
  org: null,
  tier: 'operator',
  features: ['pulpit.outline', 'atlas.map'],
  seats: 1,
  issued: '2026-07-30',
  expires: '2027-07-30',
  ...over,
})

console.log('\nAUTHENTICITY')
{
  const lic = mint(basePayload())
  const r = verifyLicense(lic, { publicKeyPem: TEST_PUB, now: new Date('2026-08-01') })
  ok('a well-formed license verifies', r.valid, r.reason)
  ok('grants come through', r.features.includes('pulpit.outline'))

  // Tamper with the payload, keep the signature.
  const [p, s] = lic.split('.')
  const evil = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
  evil.features = paidFeatureIds()
  const forged = `${b64url(JSON.stringify(evil))}.${s}`
  ok('a tampered payload is rejected',
    !verifyLicense(forged, { publicKeyPem: TEST_PUB }).valid)

  // Signed by the wrong key.
  const other = crypto.generateKeyPairSync('ed25519')
  ok('a license signed by another key is rejected',
    !verifyLicense(mint(basePayload(), other.privateKey), { publicKeyPem: TEST_PUB }).valid)

  ok('garbage is rejected', !verifyLicense('not-a-license', { publicKeyPem: TEST_PUB }).valid)
  ok('empty is rejected', !verifyLicense('', { publicKeyPem: TEST_PUB }).valid)
  ok('null is rejected', !verifyLicense(null, { publicKeyPem: TEST_PUB }).valid)
  ok('a truncated license is rejected',
    !verifyLicense(lic.slice(0, lic.length - 10), { publicKeyPem: TEST_PUB }).valid)
}

console.log('\nWHAT A REAL PERSON PASTES')
{
  const lic = mint(basePayload())
  ok('surrounding whitespace is tolerated',
    verifyLicense(`\n  ${lic}  \n`, { publicKeyPem: TEST_PUB, now: new Date('2026-08-01') }).valid)
  ok('line wrapping from an email client is tolerated',
    verifyLicense(lic.replace(/(.{40})/g, '$1\n'), { publicKeyPem: TEST_PUB, now: new Date('2026-08-01') }).valid)
}

console.log('\nEXPIRY — must never lock out a paying man abruptly')
{
  const lic = mint(basePayload({ expires: '2026-08-01' }))

  const before = verifyLicense(lic, { publicKeyPem: TEST_PUB, now: new Date('2026-07-30') })
  ok('valid before expiry', before.valid && !before.expired)

  const during = verifyLicense(lic, { publicKeyPem: TEST_PUB, now: new Date('2026-08-05') })
  ok('still works inside the grace window', during.valid, during.reason)
  ok('grace is reported so the UI can nudge', during.inGrace)

  const after = verifyLicense(lic, { publicKeyPem: TEST_PUB, now: new Date('2026-09-15') })
  ok('stops working past grace', !after.valid && after.reason === 'expired')
  ok('an expired license is still identified as a real customer', after.payload?.issuedTo === 'pastor@church.org')

  const perpetual = mint(basePayload({ expires: null }))
  const pr = verifyLicense(perpetual, { publicKeyPem: TEST_PUB, now: new Date('2099-01-01') })
  ok('a perpetual license never expires', pr.valid && pr.daysLeft === null)
}

console.log('\nFORWARD COMPATIBILITY — a newer license must not brick an older app')
{
  const future = mint(basePayload({
    v: 99,
    features: ['pulpit.outline', 'feature.that.does.not.exist.yet'],
    somethingNew: { nested: true },
  }))
  const r = verifyLicense(future, { publicKeyPem: TEST_PUB, now: new Date('2026-08-01') })
  ok('an unknown schema version still verifies', r.valid, r.reason)
  ok('unknown fields are ignored', r.valid)
  ok('unknown feature ids are carried, not dropped',
    r.features.includes('feature.that.does.not.exist.yet'))
  ok('known grants still work alongside unknown ones', r.features.includes('pulpit.outline'))
}

console.log('\nSEATS — enterprise-ready from the first license')
{
  const orgLic = mint(basePayload({ seats: 25, org: 'Grace Seminary' }))
  const r = verifyLicense(orgLic, { publicKeyPem: TEST_PUB, now: new Date('2026-08-01') })
  ok('seat count is carried', r.seats === 25, String(r.seats))
  ok('organization is carried', r.payload.org === 'Grace Seminary')
  ok('a license with no seats field defaults to one',
    verifyLicense(mint(basePayload({ seats: undefined })), { publicKeyPem: TEST_PUB, now: new Date('2026-08-01') }).seats === 1)
}

console.log('\nTHE FREE TIER')
{
  ok('free features work with no license at all',
    hasFeature(FREE_FEATURES[0], []))
  ok('a paid feature is locked with no license',
    !hasFeature(paidFeatureIds()[0], []))
  ok('a license adds to free rather than replacing it',
    effectiveFeatures(['pulpit.outline']).has(FREE_FEATURES[0]))
  ok('the free list and the paid list do not overlap',
    paidFeatureIds().every((f) => !FREE_FEATURES.includes(f)))
  ok('there is something worth paying for', paidFeatureIds().length > 0)
  ok('the free tier is not empty', FREE_FEATURES.length > 0)
}

console.log('\nTHE SIGNER')
{
  let threw = null
  try { issue({}) } catch (e) { threw = e }
  ok('refuses to issue without an email', threw !== null)

  threw = null
  try { issue({ email: 'a@b.c', plan: 'no-such-plan' }) } catch (e) { threw = e }
  ok('refuses an unknown plan', threw !== null)

  threw = null
  try { issue({ email: 'a@b.c', features: 'not.a.real.feature' }) } catch (e) { threw = e }
  ok('refuses unknown feature ids', threw !== null)

  threw = null
  try { issue({ email: 'a@b.c', features: FREE_FEATURES.join(',') }) } catch (e) { threw = e }
  ok('refuses a license that grants only free features', threw !== null)
}

console.log('\nSUPPORT MESSAGES')
{
  ok('no license reads as free, not as an error',
    /free/i.test(describeLicense(verifyLicense('', { publicKeyPem: TEST_PUB }))))
  const good = verifyLicense(mint(basePayload({ org: 'Grace Seminary' })), { publicKeyPem: TEST_PUB, now: new Date('2026-08-01') })
  ok('a licensed org is named back to the user', /Grace Seminary/.test(describeLicense(good)))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
