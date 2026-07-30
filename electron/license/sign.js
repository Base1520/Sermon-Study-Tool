#!/usr/bin/env node
// Issue a signed license. Run by Cole, on Cole's machine, never in CI and never
// on a server — the private key stays at ~/.operator-license-key.
//
//   node electron/license/sign.js --email pastor@church.org --plan operator
//   node electron/license/sign.js --email admin@seminary.edu --plan org --seats 25 \
//                                 --org "Grace Seminary" --years 1
//
// The output is one line. Paste it into the buyer's email.

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { ALL_FEATURE_IDS, FREE_FEATURES, paidFeatureIds } = require('./features')

const PRIVATE_KEY_PATH = path.join(os.homedir(), '.operator-license-key')

/**
 * What each plan grants.
 *
 * Adding a plan is a line here plus a Stripe price — no app change, because the
 * app reads feature grants off the license rather than mapping a plan name.
 * `null` for expiry means perpetual.
 */
const PLANS = {
  // The individual subscription. Everything.
  operator: { features: () => paidFeatureIds(), seats: 1, months: 12 },

  // Monthly billing, same grants, shorter life so a cancellation lapses.
  'operator-monthly': { features: () => paidFeatureIds(), seats: 1, months: 1 },

  // Founding supporters. Same product, rate held for three years.
  founding: { features: () => paidFeatureIds(), seats: 1, months: 36 },

  // Organizations. Seats are declared here and honored, not counted — real
  // enforcement needs the activation server.
  org: { features: () => paidFeatureIds(), seats: 5, months: 12 },

  // For the seven testers and anyone Cole hands it to directly.
  comp: { features: () => paidFeatureIds(), seats: 1, months: 12 },
}

function parseArgs(argv) {
  const out = {}
  for (let i = 2; i < argv.length; i += 2) {
    const k = argv[i]
    if (!k?.startsWith('--')) continue
    out[k.slice(2)] = argv[i + 1] ?? true
  }
  return out
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function issue({ email, plan = 'operator', seats, org, months, years, features }) {
  if (!email) throw new Error('--email is required')

  const preset = PLANS[plan]
  if (!preset) {
    throw new Error(`unknown plan "${plan}". Known: ${Object.keys(PLANS).join(', ')}`)
  }

  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error(
      `No signing key at ${PRIVATE_KEY_PATH}.\n` +
      `Without it no license can be issued. Restore it from your backup.`,
    )
  }

  const grantedFeatures = features
    ? String(features).split(',').map((s) => s.trim()).filter(Boolean)
    : preset.features()

  // Catch a typo before it becomes a license that grants nothing.
  const unknown = grantedFeatures.filter((f) => !ALL_FEATURE_IDS.includes(f))
  if (unknown.length) {
    throw new Error(`unknown feature ids: ${unknown.join(', ')}`)
  }
  const pointless = grantedFeatures.filter((f) => FREE_FEATURES.includes(f))
  if (pointless.length === grantedFeatures.length && grantedFeatures.length) {
    throw new Error('this license grants only features that are already free')
  }

  const lifeMonths = years ? Number(years) * 12 : months != null ? Number(months) : preset.months
  const issued = new Date()
  let expires = null
  if (lifeMonths != null && Number(lifeMonths) > 0) {
    expires = new Date(issued)
    expires.setMonth(expires.getMonth() + Number(lifeMonths))
  }

  const payload = {
    v: 1,
    licenseId: crypto.randomUUID(),
    issuedTo: String(email),
    org: org ? String(org) : null,
    tier: plan,
    features: grantedFeatures,
    seats: seats != null ? Number(seats) : preset.seats,
    issued: issued.toISOString().slice(0, 10),
    expires: expires ? expires.toISOString().slice(0, 10) : null,
  }

  const payloadB64 = b64url(JSON.stringify(payload))
  const privateKey = crypto.createPrivateKey(fs.readFileSync(PRIVATE_KEY_PATH, 'utf8'))
  const signature = crypto.sign(null, Buffer.from(payloadB64, 'utf8'), privateKey)

  return { license: `${payloadB64}.${b64url(signature)}`, payload }
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv)
    if (args.help || process.argv.length <= 2) {
      console.log('Issue a license for The Operator.\n')
      console.log('  --email    who it is for            (required)')
      console.log(`  --plan     ${Object.keys(PLANS).join(' | ')}`)
      console.log('  --seats    how many people it covers (default: per plan)')
      console.log('  --org      organization name         (optional)')
      console.log('  --years    override length in years')
      console.log('  --months   override length in months (0 = never expires)')
      console.log('  --features comma-separated ids, overrides the plan\n')
      process.exit(0)
    }
    const { license, payload } = issue(args)
    console.log('\n--- LICENSE ---')
    console.log(license)
    console.log('--- END ---\n')
    console.log(`for      ${payload.issuedTo}${payload.org ? ` (${payload.org})` : ''}`)
    console.log(`plan     ${payload.tier}`)
    console.log(`seats    ${payload.seats}`)
    console.log(`grants   ${payload.features.length} features`)
    console.log(`expires  ${payload.expires || 'never'}`)
    console.log(`id       ${payload.licenseId}\n`)
  } catch (e) {
    console.error(`\n${e.message}\n`)
    process.exit(1)
  }
}

module.exports = { issue, PLANS, PRIVATE_KEY_PATH }
