import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const liveScript = path.join(root, 'scripts/check-mobile-store-live.mjs')
const fetchFixture = path.join(root, 'scripts/test-mobile-store-live-fetch.mjs')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const storeReadme = fs.readFileSync(path.join(root, 'store/README.md'), 'utf8')
let passed = 0
let failed = 0

function run(variant, platform = 'apple', capabilityVariant = 'all-ready', probeMode = 'full') {
  const requestProfile = probeMode === 'full' ? 'full' : probeMode === 'public-get' ? 'public-get' : 'none'
  return spawnSync(process.execPath, ['--import', fetchFixture, liveScript], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPERATOR_API_URL: 'https://api.example.test',
      OPERATOR_STORE_PLATFORM: platform,
      OPERATOR_TEST_PRIVACY_VARIANT: variant,
      OPERATOR_TEST_CAPABILITY_VARIANT: capabilityVariant,
      OPERATOR_LIVE_PROBE_MODE: probeMode,
      OPERATOR_TEST_REQUEST_PROFILE: requestProfile,
    },
  })
}

function runPublicGetMutant(replacements) {
  let source = fs.readFileSync(liveScript, 'utf8')
  source = source.replace(
    "const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')",
    'const root = process.cwd()',
  )
  for (const [from, to] of replacements) {
    const before = source
    source = source.replace(from, to)
    assert.notEqual(source, before, `Mutation did not apply: ${from}`)
  }
  return spawnSync(process.execPath, ['--import', fetchFixture, '--input-type=module', '--eval', source], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPERATOR_API_URL: 'https://api.example.test',
      OPERATOR_STORE_PLATFORM: 'apple',
      OPERATOR_TEST_PRIVACY_VARIANT: 'complete',
      OPERATOR_TEST_CAPABILITY_VARIANT: 'all-ready',
      OPERATOR_LIVE_PROBE_MODE: 'public-get',
      OPERATOR_TEST_REQUEST_PROFILE: 'public-get',
    },
  })
}

function runWithProbeModeAbsent() {
  const env = {
    ...process.env,
    OPERATOR_API_URL: 'https://api.example.test',
    OPERATOR_STORE_PLATFORM: 'apple',
    OPERATOR_TEST_PRIVACY_VARIANT: 'complete',
    OPERATOR_TEST_CAPABILITY_VARIANT: 'all-ready',
    OPERATOR_TEST_REQUEST_PROFILE: 'full',
  }
  delete env.OPERATOR_LIVE_PROBE_MODE
  return spawnSync(process.execPath, ['--import', fetchFixture, liveScript], {
    cwd: root,
    encoding: 'utf8',
    env,
  })
}

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`PASS  ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL  ${name}: ${error.message}`)
  }
}

test('the current checked-in privacy notice passes the actual live-store script', () => {
  const result = run('complete')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /^The Operator full live store readiness$/m)
  assert.match(result.stdout, /40 passed · 0 warnings · 0 failed/)
})

test('an absent probe mode preserves the full twelve-request profile', () => {
  const result = runWithProbeModeAbsent()
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /PASS  Quick Study route is deployed/)
  assert.match(result.stdout, /PASS  Workspace sync route is deployed/)
  assert.match(result.stdout, /40 passed · 0 warnings · 0 failed/)
})

test('the named npm commands pin full and public-get modes against ambient downgrade', () => {
  assert.equal(
    packageJson.scripts['mobile:store:check:live'],
    'OPERATOR_LIVE_PROBE_MODE=full node scripts/check-mobile-store-live.mjs',
  )
  assert.equal(
    packageJson.scripts['mobile:store:check:public'],
    'OPERATOR_LIVE_PROBE_MODE=public-get node scripts/check-mobile-store-live.mjs',
  )
  assert.match(storeReadme, /non-substitutable partial evidence/)
  assert.match(storeReadme, /full `npm run mobile:store:check:live` only with fresh action-time approval/)
})

test('an invalid store platform scope fails closed by name', () => {
  const result = run('complete', 'appple')
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /FAIL  Store platform scope is valid/)
  assert.match(result.stdout, /37 passed · 0 warnings · 1 failed/)
})

test('Apple scope reads only Apple purchase capabilities', () => {
  const result = run('complete', 'apple', 'apple-only')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /PASS  Apple purchase verification is operational/)
  assert.match(result.stdout, /PASS  Apple sandbox reviewer allowlist is configured/)
  assert.doesNotMatch(result.stdout, /Google purchase verification is operational/)
  assert.match(result.stdout, /40 passed · 0 warnings · 0 failed/)
})

test('Google scope reads only Google purchase capability', () => {
  const result = run('complete', 'google', 'google-only')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /PASS  Google purchase verification is operational/)
  assert.doesNotMatch(result.stdout, /Apple purchase verification is operational/)
  assert.doesNotMatch(result.stdout, /Apple sandbox reviewer allowlist is configured/)
  assert.match(result.stdout, /39 passed · 0 warnings · 0 failed/)
})

test('Apple scope fails when its own purchase capabilities are unavailable', () => {
  const result = run('complete', 'apple', 'google-only')
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /FAIL  Apple purchase verification is operational/)
  assert.match(result.stdout, /FAIL  Apple sandbox reviewer allowlist is configured/)
  assert.doesNotMatch(result.stdout, /Google purchase verification is operational/)
  assert.match(result.stdout, /38 passed · 0 warnings · 2 failed/)
})

test('Google scope fails when its own purchase capability is unavailable', () => {
  const result = run('complete', 'google', 'apple-only')
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /FAIL  Google purchase verification is operational/)
  assert.doesNotMatch(result.stdout, /Apple purchase verification is operational/)
  assert.doesNotMatch(result.stdout, /Apple sandbox reviewer allowlist is configured/)
  assert.match(result.stdout, /38 passed · 0 warnings · 1 failed/)
})

test('public-get mode executes only the health and public-page GET slice', () => {
  const result = run('complete', 'apple', 'all-ready', 'public-get')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /^The Operator public live preflight \(GET-only partial evidence\)$/m)
  assert.doesNotMatch(result.stdout, /^The Operator (?:full )?live store readiness$/m)
  assert.match(result.stdout, /WARN  Public GET-only mode skips unauthenticated API route probes; this is partial evidence, not full live readiness/)
  assert.doesNotMatch(result.stdout, /Quick Study route|Workspace sync route/)
  assert.match(result.stdout, /26 passed · 1 warnings · 0 failed/)
})

test('an invalid live probe mode fails closed without running route probes', () => {
  const result = run('complete', 'apple', 'all-ready', 'readonly')
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /^The Operator live preflight \(invalid probe mode\)$/m)
  assert.match(result.stdout, /FAIL  Live probe mode is valid/)
  assert.doesNotMatch(result.stdout, /Quick Study route|Workspace sync route/)
  assert.match(result.stdout, /1 passed · 0 warnings · 1 failed/)
})

test('an explicitly empty live probe mode fails closed before any fetch', () => {
  const result = run('complete', 'apple', 'all-ready', '')
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /FAIL  Live probe mode is valid/)
  assert.match(result.stdout, /1 passed · 0 warnings · 1 failed/)
})

test('public-get route-gate mutation fails before a non-GET request is sent', () => {
  const result = runPublicGetMutant([["if (probeMode === 'full') {", 'if (true) {']])
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /FAIL  Quick Study route could not be reached: Public GET-only mode rejected POST request/)
})

test('combined public-get guards mutation is killed by the independent fetch boundary', () => {
  const result = runPublicGetMutant([
    ["if (probeMode === 'public-get' && method !== 'GET') {", 'if (false) {'],
    ["if (probeMode === 'full') {", 'if (true) {'],
  ])
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /FAIL  Quick Study route could not be reached: public-get fixture rejected POST \/v1\/quick-study/)
})

for (const [variant, failure] of [
  ['missing-ip-hash', 'Public privacy policy discloses the registration-request IP hash'],
  ['missing-raw-ip', 'Public privacy policy discloses that the raw registration IP is not stored'],
  ['missing-retention', 'Public privacy policy discloses the IP-hash retention boundary'],
]) {
  test(`${variant} fails the actual live-store script by name`, () => {
    const result = run(variant)
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout, new RegExp(`FAIL  ${failure}`))
    assert.match(result.stdout, /39 passed · 0 warnings · 1 failed/)
  })
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
