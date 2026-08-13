const INVALID_CODE_RESPONSE = Object.freeze({
  error: 'INVALID_CODE',
  message: "That code isn't valid. Check it and try again.",
})

function accessCodeUnavailable(code) {
  return !code || Boolean(code.revoked_at) ||
    (code.uses_max !== null && code.uses_count >= code.uses_max)
}

function invalidCodeResponse() {
  return { ...INVALID_CODE_RESPONSE }
}

function compAccountEmail(code, installId) {
  const identifier = crypto
    .createHash('sha256')
    .update(`${code}\0${installId}`)
    .digest('hex')
  return `${identifier}@comp.invalid`
}

module.exports = { accessCodeUnavailable, invalidCodeResponse, compAccountEmail }
const crypto = require('crypto')
