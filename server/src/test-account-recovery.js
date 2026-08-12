const test = require('node:test')
const assert = require('node:assert/strict')

process.env.ACCOUNT_RECOVERY_SECRET ||= 'test-only-account-recovery-secret-at-least-32-characters'
process.env.RESEND_API_KEY ||= 're_test_account_recovery'
process.env.OPERATOR_AUTH_FROM_EMAIL ||= 'The Operator <access@example.com>'

const {
  RECOVERY_MAX_ATTEMPTS,
  RECOVERY_MAX_REQUESTS_PER_HOUR,
  AccountRecoveryError,
  confirmRecoveryCode,
  generateRecoveryCode,
  recoveryEmailHash,
  recoveryInstallHash,
  requestRecoveryCode,
  sendRecoveryCode,
} = require('./account-recovery')

function recoveryDb({
  account = {
    id: 'acct-1',
    email: 'pastor@example.com',
    plan: 'free',
    status: 'none',
    deleting_at: null,
  },
  devices = [],
  codes = [],
  requests = [],
} = {}) {
  const state = {
    account,
    codes: codes.map((code) => ({ ...code })),
    requests: requests.map((request) => ({ ...request })),
    devices: devices.map((device) => ({ ...device })),
    commits: 0,
    rollbacks: 0,
    released: 0,
    statements: [],
  }
  let nextCodeId = state.codes.length + 1

  async function query(sql, params = []) {
    state.statements.push({ sql, params })
    if (sql === 'BEGIN') return { rows: [] }
    if (sql === 'COMMIT') {
      state.commits += 1
      return { rows: [] }
    }
    if (sql === 'ROLLBACK') {
      state.rollbacks += 1
      return { rows: [] }
    }
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] }
    if (/DELETE FROM account_recovery_request/.test(sql)) {
      const cutoff = Date.now() - Number(params[0]) * 60 * 60 * 1000
      state.requests = state.requests.filter((request) => new Date(request.created_at).getTime() >= cutoff)
      return { rows: [] }
    }
    if (/FROM account_recovery_request/.test(sql)) {
      const [emailHash, installHash] = params
      const matchingEmail = state.requests.filter((request) => request.email_hash === emailHash)
      const matchingInstall = state.requests.filter((request) => request.install_hash === installHash)
      const recent = (requestsForIdentity) => requestsForIdentity.filter((request) => (
        new Date(request.created_at).getTime() > Date.now() - 60 * 60 * 1000
      ))
      const latest = (requestsForIdentity) => requestsForIdentity.reduce((current, request) => (
        !current || new Date(request.created_at) > new Date(current) ? request.created_at : current
      ), null)
      return { rows: [{
        email_hourly: recent(matchingEmail).length,
        email_last_created_at: latest(matchingEmail),
        install_hourly: recent(matchingInstall).length,
        install_last_created_at: latest(matchingInstall),
      }] }
    }
    if (/SELECT id, email FROM account/.test(sql)) {
      const found = state.account
        && state.account.email.toLowerCase() === params[0]
        && !state.account.deleting_at
      return { rows: found ? [state.account] : [] }
    }
    if (/SELECT id, email, plan, status FROM account/.test(sql)) {
      const found = state.account
        && state.account.email.toLowerCase() === params[0]
        && !state.account.deleting_at
      return { rows: found ? [state.account] : [] }
    }
    if (/INSERT INTO account_recovery_request/.test(sql)) {
      state.requests.push({
        account_id: params[0],
        email_hash: params[1],
        install_hash: params[2],
        created_at: new Date(),
      })
      return { rows: [], rowCount: 1 }
    }
    if (/COUNT\(\*\) FILTER/.test(sql) && /FROM account_recovery_code/.test(sql)) {
      const recent = state.codes.filter((code) => (
        code.account_id === params[0]
        && new Date(code.created_at).getTime() > Date.now() - 60 * 60 * 1000
      ))
      const latest = recent.reduce((current, code) => {
        if (!current || new Date(code.created_at) > new Date(current)) return code.created_at
        return current
      }, null)
      return { rows: [{ hourly: recent.length, last_created_at: latest }] }
    }
    if (/SET consumed_at = COALESCE\(consumed_at, now\(\)\)/.test(sql)) {
      for (const code of state.codes) {
        if (code.account_id === params[0] && code.install_hash === params[1] && !code.consumed_at) {
          code.consumed_at = new Date()
        }
      }
      return { rows: [] }
    }
    if (/INSERT INTO account_recovery_code/.test(sql)) {
      const created = {
        id: `recovery-${nextCodeId++}`,
        account_id: params[0],
        install_hash: params[1],
        code_hash: params[2],
        attempts: 0,
        created_at: new Date(),
        expires_at: new Date(Date.now() + Number(params[3]) * 60 * 1000),
        consumed_at: null,
      }
      state.codes.push(created)
      return { rows: [{ id: created.id }] }
    }
    if (/SELECT id, code_hash, attempts/.test(sql)) {
      const matches = state.codes
        .filter((code) => (
          code.account_id === params[0]
          && code.install_hash === params[1]
          && !code.consumed_at
          && new Date(code.expires_at).getTime() > Date.now()
        ))
        .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
      return { rows: matches.slice(0, 1) }
    }
    if (/SET attempts = attempts \+ 1/.test(sql)) {
      const code = state.codes.find((entry) => entry.id === params[0])
      if (code) {
        code.attempts += 1
        if (code.attempts >= Number(params[1])) code.consumed_at = new Date()
      }
      return { rows: [] }
    }
    if (/UPDATE account_recovery_code SET consumed_at = now\(\)/.test(sql)) {
      const code = state.codes.find((entry) => entry.id === params[0])
      if (code && !code.consumed_at) code.consumed_at = new Date()
      return { rows: [], rowCount: code ? 1 : 0 }
    }
    if (/UPDATE device SET revoked_at = now\(\)/.test(sql) && /install_id = \$2/.test(sql)) {
      for (const device of state.devices) {
        if (device.account_id === params[0] && device.install_id === params[1] && !device.revoked_at) {
          device.revoked_at = new Date()
        }
      }
      return { rows: [] }
    }
    if (/SELECT COUNT\(\*\)::int AS count FROM device/.test(sql)) {
      const count = state.devices.filter((device) => device.account_id === params[0] && !device.revoked_at).length
      return { rows: [{ count }] }
    }
    if (/UPDATE device SET revoked_at = now\(\)/.test(sql) && /ORDER BY COALESCE/.test(sql)) {
      const oldest = state.devices
        .filter((device) => device.account_id === params[0] && !device.revoked_at)
        .sort((left, right) => (
          new Date(left.last_seen_at || left.created_at) - new Date(right.last_seen_at || right.created_at)
        ))[0]
      if (oldest) oldest.revoked_at = new Date()
      return { rows: [], rowCount: oldest ? 1 : 0 }
    }
    if (/UPDATE (study|study_reservation|ask_reservation|usage_event)/.test(sql)) {
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`Unhandled recovery SQL: ${sql}`)
  }

  return {
    state,
    async connect() {
      return {
        query,
        release() { state.released += 1 },
      }
    },
    query,
  }
}

function authRecorder(db) {
  const issued = []
  return {
    issued,
    async issueDeviceToken(_client, input) {
      issued.push(input)
      const deviceId = `device-issued-${issued.length}`
      db.state.devices.push({
        id: deviceId,
        account_id: input.accountId,
        install_id: input.installId,
        label: input.label,
        platform: input.platform,
        created_at: new Date(),
        last_seen_at: new Date(),
        revoked_at: null,
      })
      return { token: `opr_recovered_${issued.length}`, deviceId }
    },
  }
}

async function captureError(operation) {
  try {
    await operation()
    return null
  } catch (error) {
    return error
  }
}

test('recovery codes are always six padded digits', () => {
  assert.equal(generateRecoveryCode(() => 42), '000042')
  assert.equal(generateRecoveryCode(() => 999_999), '999999')
})

test('request stores only keyed hashes and sends the deterministic code', async () => {
  const db = recoveryDb()
  const deliveries = []
  const result = await requestRecoveryCode(db, {
    email: 'Pastor@Example.com',
    installId: 'install-phone',
  }, {
    randomInt: () => 42,
    async send(email, code, requestId) { deliveries.push({ email, code, requestId }) },
  })

  assert.deepEqual(result, { accepted: true, sent: true })
  assert.deepEqual(deliveries, [{ email: 'pastor@example.com', code: '000042', requestId: 'recovery-1' }])
  assert.equal(db.state.codes.length, 1)
  assert.equal(db.state.codes[0].install_hash, recoveryInstallHash('install-phone'))
  assert.notEqual(db.state.codes[0].install_hash, 'install-phone')
  assert.notEqual(db.state.codes[0].code_hash, '000042')
  assert.equal(Object.hasOwn(db.state.codes[0], 'code'), false)
})

test('unknown email returns the same accepted shape without sending mail', async () => {
  const db = recoveryDb({ account: null })
  let sends = 0
  const result = await requestRecoveryCode(db, {
    email: 'unknown@example.com',
    installId: 'install-phone',
  }, {
    async send() { sends += 1 },
  })

  assert.deepEqual(result, { accepted: true, sent: false })
  assert.equal(sends, 0)
  assert.equal(db.state.commits, 1)
  assert.equal(db.state.requests.length, 1)
  assert.equal(db.state.requests[0].account_id, null)
})

test('wrong code commits an attempt and never issues a device token', async () => {
  const db = recoveryDb()
  await requestRecoveryCode(db, {
    email: 'pastor@example.com', installId: 'install-phone',
  }, {
    randomInt: () => 123456,
    async send() {},
  })
  const auth = authRecorder(db)
  const error = await captureError(() => confirmRecoveryCode(db, auth, {
    email: 'pastor@example.com',
    code: '654321',
    installId: 'install-phone',
    label: 'Cole iPhone',
    platform: 'ios',
  }))

  assert.ok(error instanceof AccountRecoveryError)
  assert.equal(error.code, 'RECOVERY_CODE_INVALID')
  assert.equal(db.state.codes[0].attempts, 1)
  assert.equal(db.state.codes[0].consumed_at, null)
  assert.equal(auth.issued.length, 0)
  assert.equal(db.state.rollbacks, 0)
})

test('fifth wrong attempt consumes the code', async () => {
  const db = recoveryDb()
  await requestRecoveryCode(db, {
    email: 'pastor@example.com', installId: 'install-phone',
  }, {
    randomInt: () => 123456,
    async send() {},
  })
  const auth = authRecorder(db)
  for (let attempt = 0; attempt < RECOVERY_MAX_ATTEMPTS; attempt += 1) {
    await captureError(() => confirmRecoveryCode(db, auth, {
      email: 'pastor@example.com', code: '654321', installId: 'install-phone',
    }))
  }

  assert.equal(db.state.codes[0].attempts, RECOVERY_MAX_ATTEMPTS)
  assert.ok(db.state.codes[0].consumed_at)
})

test('correct code is one-time and binds the replacement device', async () => {
  const db = recoveryDb()
  await requestRecoveryCode(db, {
    email: 'pastor@example.com', installId: 'install-new',
  }, {
    randomInt: () => 123456,
    async send() {},
  })
  const auth = authRecorder(db)
  const result = await confirmRecoveryCode(db, auth, {
    email: 'pastor@example.com',
    code: '123456',
    installId: 'install-new',
    label: 'New iPad',
    platform: 'ios',
  })

  assert.equal(result.token, 'opr_recovered_1')
  assert.deepEqual(auth.issued[0], {
    accountId: 'acct-1', installId: 'install-new', label: 'New iPad', platform: 'ios',
  })
  const claimedTables = db.state.statements
    .filter(({ sql }) => /UPDATE (study|study_reservation|ask_reservation|usage_event)/.test(sql))
  assert.equal(claimedTables.length, 4)
  assert.ok(claimedTables.every(({ params }) => params[0] === 'acct-1' && params[1] === 'install-new'))
  assert.ok(db.state.codes[0].consumed_at)

  const replay = await captureError(() => confirmRecoveryCode(db, auth, {
    email: 'pastor@example.com', code: '123456', installId: 'install-new',
  }))
  assert.ok(replay instanceof AccountRecoveryError)
  assert.equal(replay.code, 'RECOVERY_CODE_INVALID')
  assert.equal(auth.issued.length, 1)
})

test('recovery replaces the oldest device when the account is at its cap', async () => {
  const db = recoveryDb({
    devices: [
      { id: 'oldest', account_id: 'acct-1', install_id: 'mac', created_at: '2026-01-01', last_seen_at: '2026-01-01', revoked_at: null },
      { id: 'middle', account_id: 'acct-1', install_id: 'iphone', created_at: '2026-02-01', last_seen_at: '2026-02-01', revoked_at: null },
      { id: 'newest', account_id: 'acct-1', install_id: 'ipad', created_at: '2026-03-01', last_seen_at: '2026-03-01', revoked_at: null },
    ],
  })
  await requestRecoveryCode(db, {
    email: 'pastor@example.com', installId: 'replacement',
  }, {
    randomInt: () => 777777,
    async send() {},
  })
  const auth = authRecorder(db)
  await confirmRecoveryCode(db, auth, {
    email: 'pastor@example.com', code: '777777', installId: 'replacement', platform: 'android',
  })

  assert.ok(db.state.devices.find((device) => device.id === 'oldest').revoked_at)
  assert.equal(db.state.devices.filter((device) => !device.revoked_at).length, 3)
})

test('delivery failure invalidates the committed code', async () => {
  const db = recoveryDb()
  const error = await captureError(() => requestRecoveryCode(db, {
    email: 'pastor@example.com', installId: 'install-phone',
  }, {
    randomInt: () => 222222,
    async send() { throw new Error('mail provider unavailable') },
  }))

  assert.match(error.message, /mail provider unavailable/)
  assert.ok(db.state.codes[0].consumed_at)
})

test('rate limit is account-wide even when an attacker rotates install ids', async () => {
  const recent = Array.from({ length: RECOVERY_MAX_REQUESTS_PER_HOUR }, (_, index) => ({
    account_id: 'acct-1',
    email_hash: recoveryEmailHash('pastor@example.com'),
    install_hash: recoveryInstallHash(`attacker-${index}`),
    created_at: new Date(Date.now() - (index + 1) * 61_000),
  }))
  const db = recoveryDb({ requests: recent })
  const error = await captureError(() => requestRecoveryCode(db, {
    email: 'pastor@example.com', installId: 'fresh-attacker-id',
  }))

  assert.ok(error instanceof AccountRecoveryError)
  assert.equal(error.code, 'RECOVERY_RATE_LIMIT')
})

test('unknown emails hit the same cooldown and hourly limit as registered emails', async () => {
  const db = recoveryDb({ account: null })
  await requestRecoveryCode(db, {
    email: 'unknown@example.com', installId: 'install-phone',
  })
  const cooldown = await captureError(() => requestRecoveryCode(db, {
    email: 'unknown@example.com', installId: 'install-phone',
  }))

  assert.ok(cooldown instanceof AccountRecoveryError)
  assert.equal(cooldown.code, 'RECOVERY_COOLDOWN')
})

test('provider network failures become a safe recovery error', async () => {
  const error = await captureError(() => sendRecoveryCode(
    'pastor@example.com',
    '123456',
    'recovery-1',
    async () => { throw new Error('socket reset') },
  ))

  assert.ok(error instanceof AccountRecoveryError)
  assert.equal(error.status, 503)
  assert.equal(error.code, 'RECOVERY_EMAIL_FAILED')
})

test('recovery fails closed without a dedicated secret', async () => {
  const configured = process.env.ACCOUNT_RECOVERY_SECRET
  delete process.env.ACCOUNT_RECOVERY_SECRET
  try {
    const db = recoveryDb()
    const error = await captureError(() => requestRecoveryCode(db, {
      email: 'pastor@example.com', installId: 'install-phone',
    }))
    assert.ok(error instanceof AccountRecoveryError)
    assert.equal(error.code, 'RECOVERY_NOT_CONFIGURED')
  } finally {
    process.env.ACCOUNT_RECOVERY_SECRET = configured
  }
})
