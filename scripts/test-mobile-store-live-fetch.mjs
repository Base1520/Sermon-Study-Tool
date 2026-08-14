import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'store/metadata.json'), 'utf8'))
const readinessSource = fs.readFileSync(path.join(root, 'server/src/readiness.js'), 'utf8')
const schema = readinessSource.match(/const SCHEMA_VERSION = '([^']+)'/)?.[1] || ''
const sourcePrivacy = fs.readFileSync(path.join(root, 'website/operator-privacy-addendum.html'), 'utf8')
const variant = process.env.OPERATOR_TEST_PRIVACY_VARIANT || 'complete'
const capabilityVariant = process.env.OPERATOR_TEST_CAPABILITY_VARIANT || 'all-ready'

const replacements = {
  'missing-ip-hash': [
    'keyed one-way hash of the registration request IP address',
    'temporary registration network signal',
  ],
  'missing-raw-ip': [
    'the raw IP address is not stored',
    'raw network details are handled securely',
  ],
  'missing-retention': [
    'no more than 48 hours',
    'for a limited period',
  ],
}

let privacyBody = sourcePrivacy
if (variant !== 'complete') {
  const replacement = replacements[variant]
  if (!replacement) throw new Error(`Unknown privacy fixture variant: ${variant}`)
  privacyBody = sourcePrivacy.replace(replacement[0], replacement[1])
  if (privacyBody === sourcePrivacy) throw new Error(`Privacy fixture mutation did not apply: ${variant}`)
}

const capabilitiesByVariant = {
  'all-ready': {
    account_recovery_email: true,
    apple_iap: true,
    apple_iap_sandbox_review: true,
    google_iap: true,
    marketing_sync: true,
  },
  'apple-only': {
    account_recovery_email: true,
    apple_iap: true,
    apple_iap_sandbox_review: true,
    google_iap: false,
    marketing_sync: true,
  },
  'google-only': {
    account_recovery_email: true,
    apple_iap: false,
    apple_iap_sandbox_review: false,
    google_iap: true,
    marketing_sync: true,
  },
}
const capabilities = capabilitiesByVariant[capabilityVariant]
if (!capabilities) throw new Error(`Unknown capability fixture variant: ${capabilityVariant}`)

function response(url, status, body, jsonBody = null) {
  return {
    status,
    url,
    async text() {
      return body
    },
    async json() {
      if (jsonBody === null) throw new Error('No JSON fixture for this response')
      return jsonBody
    },
  }
}

globalThis.fetch = async (input) => {
  const url = String(input)
  const parsed = new URL(url)

  if (parsed.hostname === 'api.example.test' && parsed.pathname === '/health') {
    return response(url, 200, '', {
      service: 'operator-api',
      version: metadata.app.version,
      commit: 'fixture-commit',
      schema,
      releaseStage: 'full',
      ok: true,
      capabilities,
    })
  }

  if (parsed.hostname === 'api.example.test' && parsed.pathname.startsWith('/v1/')) {
    return response(url, 401, '{}')
  }

  if (parsed.pathname === '/operator/privacy/') return response(url, 200, privacyBody)
  if (parsed.pathname === '/operator/terms/') return response(url, 200, 'The Operator Terms')
  if (parsed.pathname === '/operator/account-deletion/') return response(url, 200, 'Delete Your Account')
  if (parsed.pathname === '/contact/') return response(url, 200, 'Contact support at info@base1520.com')

  throw new Error(`Unexpected live-store fixture URL: ${url}`)
}
