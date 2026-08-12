import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'store/metadata.json'), 'utf8'))
const readinessSource = fs.readFileSync(path.join(root, 'server/src/readiness.js'), 'utf8')
const expectedSchema = readinessSource.match(/const SCHEMA_VERSION = '([^']+)'/)?.[1] || ''
const apiUrl = String(process.env.OPERATOR_API_URL || 'https://api-production-15e5e.up.railway.app').replace(/\/+$/, '')
const platform = String(process.env.OPERATOR_STORE_PLATFORM || 'all').toLowerCase()
const failures = []
const warnings = []
const passes = []

const pass = (message) => passes.push(message)
const fail = (message) => failures.push(message)
const warn = (message) => warnings.push(message)
const check = (condition, message) => condition ? pass(message) : fail(message)

async function request(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    return await fetch(url, { redirect: 'follow', ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function probePage(label, url, expectedText, expectedPath) {
  try {
    const response = await request(url)
    const body = await response.text()
    const finalUrl = new URL(response.url)
    check(response.status === 200, `${label} returns HTTP 200`)
    check(finalUrl.pathname.replace(/\/+$/, '') === expectedPath.replace(/\/+$/, ''), `${label} stays on its product-specific URL`)
    check(expectedText.test(body), `${label} contains Operator-specific content`)
  } catch (error) {
    fail(`${label} could not be reached: ${error.message}`)
  }
}

async function probeRoute(label, route, options) {
  try {
    const response = await request(`${apiUrl}${route}`, options)
    check(response.status !== 404, `${label} is deployed`)
    check(response.status < 500, `${label} rejects an empty unauthenticated probe without a server failure`)
  } catch (error) {
    fail(`${label} could not be reached: ${error.message}`)
  }
}

try {
  const response = await request(`${apiUrl}/health`)
  const health = await response.json()
  check(response.status === 200, 'Production health endpoint returns HTTP 200')
  check(health.service === 'operator-api', 'Production identifies as the Operator API')
  check(health.version === metadata.app.version, 'Production API version matches the store candidate')
  check(Boolean(health.commit) && health.commit !== 'local', 'Production reports a deployed source commit')
  check(Boolean(expectedSchema) && health.schema === expectedSchema, 'Production schema marker matches the store candidate')
  check(health.releaseStage === 'full', 'Production release stage is full')
  check(health.ok === true, 'Production core readiness passes')
  check(health.capabilities?.account_recovery_email === true, 'Account recovery email is operational')
  if (platform === 'all' || platform === 'apple') check(health.capabilities?.apple_iap === true, 'Apple purchase verification is operational')
  if (platform === 'all' || platform === 'google') check(health.capabilities?.google_iap === true, 'Google purchase verification is operational')
  if (health.capabilities?.marketing_sync !== true) warn('Marketing sync is degraded; account creation must still remain functional')
} catch (error) {
  fail(`Production health could not be verified: ${error.message}`)
}

const emptyPost = {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-install-id': '00000000-0000-4000-8000-000000000000' },
  body: '{}',
}
await probeRoute('Quick Study route', '/v1/quick-study', emptyPost)
await probeRoute('Guided Study route', '/v1/guided-study', emptyPost)
await probeRoute('Ask route', '/v1/ask', emptyPost)
await probeRoute('Specialist-agent route', '/v1/sermon-assist', emptyPost)
await probeRoute('Store verification route', '/v1/iap/verify', emptyPost)
await probeRoute('Commentary route', '/v1/studies/00000000-0000-4000-8000-000000000000/commentary', { headers: { 'x-install-id': '00000000-0000-4000-8000-000000000000' } })
await probeRoute('Workspace sync route', '/v1/studies/00000000-0000-4000-8000-000000000000/workspace', { ...emptyPost, method: 'PATCH' })

await probePage('Privacy policy', metadata.app.privacyUrl, /The Operator|operator-privacy/i, '/operator/privacy')
await probePage('Terms of use', metadata.app.termsUrl, /The Operator|Operator Terms/i, '/operator/terms')
await probePage('Account deletion page', metadata.app.accountDeletionUrl, /Delete Your Account|Delete.*Operator Account/i, '/operator/account-deletion')
await probePage('Support page', metadata.app.supportUrl, /contact|support|info@base1520\.com/i, '/contact')

console.log(`\nThe Operator live store readiness\n${'='.repeat(35)}`)
for (const message of passes) console.log(`PASS  ${message}`)
for (const message of warnings) console.log(`WARN  ${message}`)
for (const message of failures) console.log(`FAIL  ${message}`)
console.log(`\n${passes.length} passed · ${warnings.length} warnings · ${failures.length} failed`)

if (failures.length) process.exitCode = 1
