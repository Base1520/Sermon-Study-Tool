const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { accessCodeUnavailable, invalidCodeResponse, compAccountEmail } = require('./access-code-policy')

test('revoked, exhausted, and unknown codes are all refused', () => {
  assert.equal(accessCodeUnavailable(undefined), true)
  assert.equal(accessCodeUnavailable({ revoked_at: new Date(), uses_max: null, uses_count: 0 }), true)
  assert.equal(accessCodeUnavailable({ revoked_at: null, uses_max: 1, uses_count: 1 }), true)
  assert.equal(accessCodeUnavailable({ revoked_at: null, uses_max: 2, uses_count: 1 }), false)
  assert.equal(accessCodeUnavailable({ revoked_at: null, uses_max: null, uses_count: 999 }), false)
})

test('every unavailable-code class receives the same non-oracle response', () => {
  const unavailable = [
    undefined,
    { revoked_at: new Date(), uses_max: null, uses_count: 0 },
    { revoked_at: null, uses_max: 1, uses_count: 1 },
  ]
  const responses = unavailable.filter(accessCodeUnavailable).map(() => invalidCodeResponse())
  assert.equal(responses.length, 3)
  assert.deepEqual(responses[0], responses[1])
  assert.deepEqual(responses[1], responses[2])
  assert.deepEqual(responses[0], {
    error: 'INVALID_CODE',
    message: "That code isn't valid. Check it and try again.",
  })
})

test('the redeem route applies the policy before reinstall lookup', () => {
  const route = fs.readFileSync(require.resolve('./index'), 'utf8')
  const guard = route.indexOf('if (accessCodeUnavailable(code)) return refuse()')
  const priorUse = route.indexOf('SELECT account_id FROM access_code_use')
  assert.ok(guard >= 0, 'redeem must invoke the shared access-code policy')
  assert.ok(priorUse >= 0, 'redeem reinstall lookup must remain identifiable')
  assert.ok(guard < priorUse, 'revocation must be checked before reinstall token recovery')
})

test('comp account email never embeds the access code or install id', () => {
  const code = 'OPERATOR-PRIVATE-CREDENTIAL'
  const installId = 'private-install-identifier'
  const email = compAccountEmail(code, installId)

  assert.match(email, /^[a-f0-9]{64}@comp\.invalid$/)
  assert.equal(email.includes(code.toLowerCase()), false)
  assert.equal(email.includes(installId.toLowerCase()), false)
  assert.equal(compAccountEmail(code, installId), email)
  assert.notEqual(compAccountEmail(code, `${installId}-other`), email)

  const route = fs.readFileSync(require.resolve('./index'), 'utf8')
  assert.ok(route.includes('compAccountEmail(raw, installId)'), 'redeem must derive a non-secret synthetic email')
  assert.equal(route.includes('`${raw.toLowerCase()}.${installId}@comp.invalid`'), false)
})
