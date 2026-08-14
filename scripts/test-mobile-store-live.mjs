import assert from 'node:assert/strict'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const liveScript = path.join(root, 'scripts/check-mobile-store-live.mjs')
const fetchFixture = path.join(root, 'scripts/test-mobile-store-live-fetch.mjs')
let passed = 0
let failed = 0

function run(variant, platform = 'apple', capabilityVariant = 'all-ready') {
  return spawnSync(process.execPath, ['--import', fetchFixture, liveScript], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPERATOR_API_URL: 'https://api.example.test',
      OPERATOR_STORE_PLATFORM: platform,
      OPERATOR_TEST_PRIVACY_VARIANT: variant,
      OPERATOR_TEST_CAPABILITY_VARIANT: capabilityVariant,
    },
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
  assert.match(result.stdout, /40 passed · 0 warnings · 0 failed/)
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
