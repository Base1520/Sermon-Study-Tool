const test = require('node:test')
const assert = require('node:assert/strict')

process.env.OPERATOR_RELEASE_STAGE = 'full'
process.env.RESEND_API_KEY = 're_test_mobile_registration_routes'
process.env.OPERATOR_AUTH_FROM_EMAIL = 'The Operator <access@example.com>'

class StubRegistrationError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const calls = { requests: [], confirmations: [] }
const registrationPath = require.resolve('./account-registration')
require.cache[registrationPath] = {
  id: registrationPath,
  filename: registrationPath,
  loaded: true,
  exports: {
    AccountRegistrationError: StubRegistrationError,
    async requestRegistrationCode(_db, input) {
      calls.requests.push(input)
      return { accepted: true }
    },
    async confirmRegistrationCode(_db, _auth, input) {
      calls.confirmations.push(input)
      return {
        token: 'opr_verified_route',
        deviceId: 'device-route',
        account: {
          id: 'acct-route', email: 'pastor@example.com', plan: 'free', status: 'none',
        },
      }
    },
  },
}

const { mount } = require('./mobile')

function captureRoutes() {
  const routes = new Map()
  const app = {}
  for (const method of ['get', 'post', 'patch', 'delete']) {
    app[method] = (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler)
  }
  mount(app, {}, {})
  return routes
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this },
    json(value) { this.body = value; return this },
  }
}

test('registration request route returns only a generic accepted response', async () => {
  const routes = captureRoutes()
  const response = responseRecorder()
  await routes.get('POST /v1/mobile/register')({
    identity: { installId: 'install-phone' },
    ip: '203.0.113.8',
    body: {
      email: 'pastor@example.com',
      platform: 'ios',
      label: 'Cole iPhone',
      marketingOptIn: true,
    },
  }, response, (error) => { throw error })

  assert.equal(response.statusCode, 202)
  assert.deepEqual(response.body, {
    ok: true,
    message: 'If that email can be registered, a six-digit verification code is on the way.',
  })
  assert.equal(Object.hasOwn(response.body, 'token'), false)
  assert.equal(Object.hasOwn(response.body, 'accountId'), false)
  assert.equal(calls.requests.length, 1)
  assert.equal(calls.requests[0].sourceIp, '203.0.113.8')
})

test('registration confirmation route is the only registration route returning a bearer', async () => {
  const routes = captureRoutes()
  const response = responseRecorder()
  await routes.get('POST /v1/mobile/register/confirm')({
    identity: { installId: 'install-phone' },
    body: { email: 'pastor@example.com', code: '123456' },
  }, response, (error) => { throw error })

  assert.equal(response.statusCode, 201)
  assert.deepEqual(response.body, {
    token: 'opr_verified_route',
    deviceId: 'device-route',
    accountId: 'acct-route',
    email: 'pastor@example.com',
    plan: 'free',
  })
  assert.deepEqual(calls.confirmations, [{
    email: 'pastor@example.com', code: '123456', installId: 'install-phone',
  }])
})
