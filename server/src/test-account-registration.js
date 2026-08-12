const test = require('node:test')
const assert = require('node:assert/strict')

process.env.ACCOUNT_RECOVERY_SECRET ||= 'test-only-account-recovery-secret-at-least-32-characters'
process.env.TRIAL_IDENTITY_SECRET ||= 'test-only-trial-identity-secret-at-least-32-characters'
process.env.RESEND_API_KEY ||= 're_test_account_registration'
process.env.OPERATOR_AUTH_FROM_EMAIL ||= 'The Operator <access@example.com>'

const marketing = { staged: [], synced: [] }
const mailchimpPath = require.resolve('./mailchimp')
require.cache[mailchimpPath] = {
  id: mailchimpPath,
  filename: mailchimpPath,
  loaded: true,
  exports: {
    async stageMarketingDeletion() {},
    async processMarketingDeletionOutbox() {},
    async stageMarketingSync(_client, email, intentId) {
      marketing.staged.push({ email, intentId })
    },
    async syncMarketingContact(_db, email, { intentId }) {
      marketing.synced.push({ email, intentId })
    },
  },
}

const {
  REGISTRATION_MAX_ATTEMPTS,
  REGISTRATION_MAX_REQUESTS_PER_DAY,
  REGISTRATION_MAX_REQUESTS_PER_HOUR,
  REGISTRATION_MAX_REQUESTS_PER_IP_PER_HOUR,
  REGISTRATION_RETENTION_HOURS,
  AccountRegistrationError,
  confirmRegistrationCode,
  registrationCodeHash,
  registrationEmailHash,
  registrationInstallHash,
  registrationSourceIpHash,
  purgeExpiredRegistrationCodes,
  requestRegistrationCode,
} = require('./account-registration')
const {
  RECOVERY_MAX_ATTEMPTS,
  RECOVERY_MAX_REQUESTS_PER_HOUR,
} = require('./account-recovery')

function registrationDb({
  accounts = [],
  codes = [],
  priorStudies = 0,
  priorAsks = 0,
} = {}) {
  const state = {
    accounts: new Map(accounts.map((account) => [account.email.toLowerCase(), { ...account }])),
    codes: codes.map((code) => ({ ...code })),
    priorStudies,
    priorAsks,
    statements: [],
    issued: [],
    commits: 0,
    rollbacks: 0,
    released: 0,
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
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [{}] }
    if (/DELETE FROM account_registration_code/.test(sql) && /created_at/.test(sql)) {
      const cutoff = Date.now() - Number(params[0]) * 60 * 60 * 1000
      const priorLength = state.codes.length
      state.codes = state.codes.filter((entry) => new Date(entry.created_at).getTime() >= cutoff)
      return { rows: [], rowCount: priorLength - state.codes.length }
    }
    if (/COUNT\(\*\) FILTER/.test(sql) && /FROM account_registration_code/.test(sql)) {
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      const emailCodes = state.codes.filter((entry) => entry.email_hash === params[0])
      const installCodes = state.codes.filter((entry) => entry.install_hash === params[1])
      const sourceIpCodes = state.codes.filter((entry) => entry.source_ip_hash === params[2])
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
      const latest = (entries) => entries.reduce((current, entry) => (
        !current || new Date(entry.created_at) > new Date(current) ? entry.created_at : current
      ), null)
      return { rows: [{
        email_hourly: emailCodes.filter((entry) => new Date(entry.created_at).getTime() > oneHourAgo).length,
        email_last_created_at: latest(emailCodes),
        install_hourly: installCodes.filter((entry) => new Date(entry.created_at).getTime() > oneHourAgo).length,
        install_last_created_at: latest(installCodes),
        source_ip_hourly: sourceIpCodes.filter((entry) => new Date(entry.created_at).getTime() > oneHourAgo).length,
        global_daily: state.codes.filter((entry) => new Date(entry.created_at).getTime() > oneDayAgo).length,
      }] }
    }
    if (/SELECT id FROM account WHERE lower\(email\) = \$1 LIMIT 1/.test(sql)) {
      const account = state.accounts.get(params[0])
      return { rows: account ? [{ id: account.id }] : [] }
    }
    if (/SET consumed_at = COALESCE\(consumed_at, now\(\)\)/.test(sql)) {
      for (const entry of state.codes) {
        if (entry.email_hash === params[0] && entry.install_hash === params[1] && !entry.consumed_at) {
          entry.consumed_at = new Date()
        }
      }
      return { rows: [] }
    }
    if (/INSERT INTO account_registration_code/.test(sql)) {
      const created = {
        id: `registration-${nextCodeId++}`,
        account_id: params[0],
        email_hash: params[1],
        install_hash: params[2],
        source_ip_hash: params[3],
        code_hash: params[4],
        platform: params[5],
        device_label: params[6],
        marketing_opt_in: params[7],
        attempts: 0,
        expires_at: new Date(Date.now() + Number(params[8]) * 60 * 1000),
        consumed_at: null,
        created_at: new Date(),
      }
      state.codes.push(created)
      return { rows: [{ id: created.id }] }
    }
    if (/SELECT id, code_hash, attempts, platform, device_label, marketing_opt_in/.test(sql)) {
      const matches = state.codes
        .filter((entry) => (
          entry.email_hash === params[0]
          && entry.install_hash === params[1]
          && !entry.consumed_at
          && new Date(entry.expires_at).getTime() > Date.now()
        ))
        .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
      return { rows: matches.slice(0, 1) }
    }
    if (/SET attempts = attempts \+ 1/.test(sql)) {
      const entry = state.codes.find((candidate) => candidate.id === params[0])
      if (entry) {
        entry.attempts += 1
        if (entry.attempts >= Number(params[1])) entry.consumed_at = new Date()
      }
      return { rows: [] }
    }
    if (/UPDATE account_registration_code SET consumed_at = now\(\)/.test(sql)) {
      const entry = state.codes.find((candidate) => candidate.id === params[0])
      if (entry && !entry.consumed_at) {
        entry.consumed_at = new Date()
        return { rows: /RETURNING id/.test(sql) ? [{ id: entry.id }] : [], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    }
    if (/UPDATE account_registration_code/.test(sql) && /SET account_id = \$2/.test(sql)) {
      for (const entry of state.codes) {
        if (entry.email_hash === params[0]) entry.account_id = params[1]
      }
      return { rows: [], rowCount: state.codes.filter((entry) => entry.email_hash === params[0]).length }
    }
    if (/SELECT id, email, plan, status, install_id, deleting_at/.test(sql)) {
      const account = state.accounts.get(params[0])
      return { rows: account ? [account] : [] }
    }
    if (/FROM free_trial_tombstone/.test(sql) && /AS free_studies_used/.test(sql)) {
      return { rows: [{ free_studies_used: state.priorStudies, free_asks_used: state.priorAsks }] }
    }
    if (/INSERT INTO account/.test(sql) && /ON CONFLICT DO NOTHING/.test(sql)) {
      if (state.accounts.has(params[0])) return { rows: [] }
      const account = {
        id: `acct-${state.accounts.size + 1}`,
        email: params[0],
        plan: 'free',
        status: 'none',
        install_id: params[1],
        free_studies_used: params[2],
        free_asks_used: params[3],
        deleting_at: null,
      }
      state.accounts.set(account.email, account)
      return { rows: [account] }
    }
    if (/UPDATE account/.test(sql) && /free_studies_used = GREATEST/.test(sql)) {
      const account = [...state.accounts.values()].find((candidate) => candidate.id === params[0])
      return { rows: account ? [account] : [] }
    }
    if (/UPDATE (study|study_reservation|ask_reservation|usage_event)/.test(sql)) {
      return { rows: [], rowCount: 1 }
    }
    if (/INSERT INTO download_lead/.test(sql)) return { rows: [], rowCount: 1 }
    throw new Error(`Unhandled registration SQL: ${sql}`)
  }

  return {
    state,
    query,
    async connect() {
      return {
        query,
        release() { state.released += 1 },
      }
    },
  }
}

function authRecorder(db) {
  return {
    async issueDeviceToken(_client, input) {
      db.state.issued.push(input)
      return { token: `opr_verified_${db.state.issued.length}`, deviceId: `device-${db.state.issued.length}` }
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

function pendingCode({
  email,
  installId,
  index,
  sourceIp = 'unknown',
  createdAt = new Date(Date.now() - 2 * 60 * 1000),
}) {
  const emailHash = registrationEmailHash(email)
  const installHash = registrationInstallHash(installId)
  return {
    id: `seed-${index}`,
    email_hash: emailHash,
    install_hash: installHash,
    source_ip_hash: registrationSourceIpHash(sourceIp),
    code_hash: registrationCodeHash({ emailHash, installHash, code: String(index).padStart(6, '0') }),
    platform: 'ios',
    device_label: 'Seed device',
    marketing_opt_in: false,
    attempts: 0,
    expires_at: new Date(Date.now() + 8 * 60 * 1000),
    consumed_at: null,
    created_at: createdAt,
  }
}

test.beforeEach(() => {
  marketing.staged.length = 0
  marketing.synced.length = 0
})

test('registration preserves the recovery brute-force and hourly limits', () => {
  assert.equal(REGISTRATION_MAX_ATTEMPTS, RECOVERY_MAX_ATTEMPTS)
  assert.equal(REGISTRATION_MAX_REQUESTS_PER_HOUR, RECOVERY_MAX_REQUESTS_PER_HOUR)
})

test('registration fails closed without the shared recovery secret', async () => {
  const configured = process.env.ACCOUNT_RECOVERY_SECRET
  delete process.env.ACCOUNT_RECOVERY_SECRET
  try {
    const error = await captureError(() => requestRegistrationCode(registrationDb(), {
      email: 'pastor@example.com', installId: 'install-phone',
    }))
    assert.ok(error instanceof AccountRegistrationError)
    assert.equal(error.code, 'REGISTRATION_NOT_CONFIGURED')
  } finally {
    process.env.ACCOUNT_RECOVERY_SECRET = configured
  }
})

test('request stores only domain-separated hashes and never creates an account or bearer', async () => {
  const db = registrationDb()
  const deliveries = []
  const result = await requestRegistrationCode(db, {
    email: 'Pastor@Example.com',
    installId: 'install-phone',
    platform: 'ios',
    label: 'Cole iPhone',
    marketingOptIn: true,
  }, {
    randomInt: () => 42,
    async send(email, code, requestId) { deliveries.push({ email, code, requestId }) },
  })

  assert.deepEqual(result, { accepted: true })
  assert.deepEqual(deliveries, [{
    email: 'pastor@example.com', code: '000042', requestId: 'registration-registration-1',
  }])
  assert.equal(db.state.accounts.size, 0)
  assert.equal(db.state.issued.length, 0)
  assert.equal(db.state.codes.length, 1)
  assert.equal(db.state.codes[0].email_hash, registrationEmailHash('pastor@example.com'))
  assert.equal(db.state.codes[0].install_hash, registrationInstallHash('install-phone'))
  assert.notEqual(db.state.codes[0].email_hash, 'pastor@example.com')
  assert.notEqual(db.state.codes[0].install_hash, 'install-phone')
  assert.notEqual(db.state.codes[0].code_hash, '000042')
  assert.equal(JSON.stringify(db.state.codes[0]).includes('pastor@example.com'), false)
})

test('existing and new emails receive the same service response without mailing an existing account', async () => {
  const existingDb = registrationDb({
    accounts: [{ id: 'acct-existing', email: 'pastor@example.com', plan: 'free', status: 'none' }],
  })
  const newDb = registrationDb()
  const existingDeliveries = []
  const newDeliveries = []
  const input = { email: 'pastor@example.com', installId: 'install-phone', platform: 'ios' }

  const existingResult = await requestRegistrationCode(existingDb, input, {
    randomInt: () => 123456,
    async send(...args) { existingDeliveries.push(args) },
  })
  const newResult = await requestRegistrationCode(newDb, input, {
    randomInt: () => 123456,
    async send(...args) { newDeliveries.push(args) },
  })

  assert.deepEqual(existingResult, newResult)
  assert.deepEqual(existingResult, { accepted: true })
  assert.equal(existingDeliveries.length, 0)
  assert.equal(newDeliveries.length, 1)
  assert.equal(existingDb.state.codes[0].account_id, 'acct-existing')
  const auth = authRecorder(existingDb)
  const guessed = await captureError(() => confirmRegistrationCode(existingDb, auth, {
    ...input, code: '123456',
  }))
  assert.ok(guessed instanceof AccountRegistrationError)
  assert.equal(guessed.code, 'REGISTRATION_CODE_INVALID')
  assert.equal(existingDb.state.issued.length, 0)
})

test('email and install rotation cannot bypass registration request limits', async () => {
  const sameEmail = Array.from({ length: REGISTRATION_MAX_REQUESTS_PER_HOUR }, (_, index) => pendingCode({
    email: 'pastor@example.com', installId: `install-${index}`, index,
  }))
  const emailDb = registrationDb({ codes: sameEmail })
  const emailError = await captureError(() => requestRegistrationCode(emailDb, {
    email: 'pastor@example.com', installId: 'fresh-install',
  }))
  assert.ok(emailError instanceof AccountRegistrationError)
  assert.equal(emailError.code, 'REGISTRATION_RATE_LIMIT')

  const sameInstall = Array.from({ length: REGISTRATION_MAX_REQUESTS_PER_HOUR }, (_, index) => pendingCode({
    email: `pastor-${index}@example.com`, installId: 'install-phone', index,
  }))
  const installDb = registrationDb({ codes: sameInstall })
  const installError = await captureError(() => requestRegistrationCode(installDb, {
    email: 'fresh@example.com', installId: 'install-phone',
  }))
  assert.ok(installError instanceof AccountRegistrationError)
  assert.equal(installError.code, 'REGISTRATION_RATE_LIMIT')
})

test('rotating both email and caller-controlled install id cannot bypass the source-IP limit', async () => {
  const sourceIp = '203.0.113.8'
  const codes = Array.from({ length: REGISTRATION_MAX_REQUESTS_PER_IP_PER_HOUR }, (_, index) => pendingCode({
    email: `rotated-${index}@example.com`,
    installId: `rotated-install-${index}`,
    sourceIp,
    index,
  }))
  const db = registrationDb({ codes })
  const error = await captureError(() => requestRegistrationCode(db, {
    email: 'fresh@example.com',
    installId: 'fresh-install',
    sourceIp,
  }))

  assert.ok(error instanceof AccountRegistrationError)
  assert.equal(error.code, 'REGISTRATION_RATE_LIMIT')
})

test('the global daily budget caps distributed registration-email abuse', async () => {
  const codes = Array.from({ length: REGISTRATION_MAX_REQUESTS_PER_DAY }, (_, index) => pendingCode({
    email: `distributed-${index}@example.com`,
    installId: `distributed-install-${index}`,
    sourceIp: `198.51.100.${index}`,
    index,
  }))
  const db = registrationDb({ codes })
  const error = await captureError(() => requestRegistrationCode(db, {
    email: 'fresh@example.com',
    installId: 'fresh-install',
    sourceIp: '203.0.113.9',
  }))

  assert.ok(error instanceof AccountRegistrationError)
  assert.equal(error.code, 'REGISTRATION_RATE_LIMIT')
})

test('registration purges metadata beyond the declared retention window before counting requests', async () => {
  const expired = pendingCode({
    email: 'expired@example.com',
    installId: 'expired-install',
    sourceIp: '203.0.113.10',
    index: 1,
    createdAt: new Date(Date.now() - (REGISTRATION_RETENTION_HOURS + 1) * 60 * 60 * 1000),
  })
  const db = registrationDb({ codes: [expired] })

  await requestRegistrationCode(db, {
    email: 'fresh@example.com',
    installId: 'fresh-install',
    sourceIp: '203.0.113.11',
  }, {
    async send() {},
  })

  assert.equal(REGISTRATION_RETENTION_HOURS, 48)
  assert.equal(db.state.codes.some((entry) => entry.id === expired.id), false)
  const purgeIndex = db.state.statements.findIndex(({ sql }) => (
    /DELETE FROM account_registration_code/.test(sql) && /created_at/.test(sql)
  ))
  const countIndex = db.state.statements.findIndex(({ sql }) => /COUNT\(\*\) FILTER/.test(sql))
  assert.ok(purgeIndex > -1)
  assert.ok(countIndex > purgeIndex)
  assert.deepEqual(db.state.statements[purgeIndex].params, [48])
})

test('scheduled retention helper purges without requiring a new registration request', async () => {
  const expired = pendingCode({
    email: 'expired@example.com',
    installId: 'expired-install',
    index: 1,
    createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
  })
  const retained = pendingCode({
    email: 'retained@example.com',
    installId: 'retained-install',
    index: 2,
    createdAt: new Date(Date.now() - 47 * 60 * 60 * 1000),
  })
  const db = registrationDb({ codes: [expired, retained] })

  assert.equal(await purgeExpiredRegistrationCodes(db), 1)
  assert.deepEqual(db.state.codes.map(({ id }) => id), [retained.id])
  assert.equal(await purgeExpiredRegistrationCodes(db), 0)
})

test('registration requests preserve the one-minute cooldown', async () => {
  const db = registrationDb({ codes: [pendingCode({
    email: 'pastor@example.com',
    installId: 'first-install',
    index: 1,
    createdAt: new Date(Date.now() - 30_000),
  })] })
  const error = await captureError(() => requestRegistrationCode(db, {
    email: 'pastor@example.com', installId: 'second-install',
  }))

  assert.ok(error instanceof AccountRegistrationError)
  assert.equal(error.code, 'REGISTRATION_COOLDOWN')
})

test('delivery failure invalidates the committed registration code', async () => {
  const db = registrationDb()
  const error = await captureError(() => requestRegistrationCode(db, {
    email: 'pastor@example.com', installId: 'install-phone',
  }, {
    randomInt: () => 222222,
    async send() { throw new Error('mail provider unavailable') },
  }))

  assert.ok(error instanceof AccountRegistrationError)
  assert.equal(error.code, 'REGISTRATION_EMAIL_FAILED')
  assert.ok(db.state.codes[0].consumed_at)
  assert.equal(db.state.accounts.size, 0)
})

test('wrong codes consume the pending registration on the fifth attempt', async () => {
  const db = registrationDb()
  await requestRegistrationCode(db, {
    email: 'pastor@example.com', installId: 'install-phone',
  }, {
    randomInt: () => 123456,
    async send() {},
  })
  const auth = authRecorder(db)
  for (let attempt = 0; attempt < REGISTRATION_MAX_ATTEMPTS; attempt += 1) {
    const error = await captureError(() => confirmRegistrationCode(db, auth, {
      email: 'pastor@example.com', code: '654321', installId: 'install-phone',
    }))
    assert.ok(error instanceof AccountRegistrationError)
    assert.equal(error.code, 'REGISTRATION_CODE_INVALID')
  }

  assert.equal(db.state.codes[0].attempts, REGISTRATION_MAX_ATTEMPTS)
  assert.ok(db.state.codes[0].consumed_at)
  assert.equal(db.state.accounts.size, 0)
  assert.equal(db.state.issued.length, 0)
})

test('a valid code cannot be moved to a different install', async () => {
  const db = registrationDb()
  await requestRegistrationCode(db, {
    email: 'pastor@example.com', installId: 'install-original',
  }, {
    randomInt: () => 123456,
    async send() {},
  })
  const auth = authRecorder(db)
  const error = await captureError(() => confirmRegistrationCode(db, auth, {
    email: 'pastor@example.com', code: '123456', installId: 'install-attacker',
  }))

  assert.ok(error instanceof AccountRegistrationError)
  assert.equal(error.code, 'REGISTRATION_CODE_INVALID')
  assert.equal(db.state.accounts.size, 0)
  assert.equal(db.state.issued.length, 0)
  assert.equal(db.state.codes[0].consumed_at, null)
})

test('correct code atomically creates the account, preserves trial history, and is one-time', async () => {
  const db = registrationDb({ priorStudies: 1, priorAsks: 5 })
  await requestRegistrationCode(db, {
    email: 'Pastor@Example.com',
    installId: 'install-new',
    platform: 'ios',
    label: 'Cole iPhone',
    marketingOptIn: true,
  }, {
    randomInt: () => 123456,
    async send() {},
  })
  const auth = authRecorder(db)
  const result = await confirmRegistrationCode(db, auth, {
    email: 'pastor@example.com', code: '123456', installId: 'install-new',
  })

  assert.equal(result.token, 'opr_verified_1')
  assert.equal(result.deviceId, 'device-1')
  assert.equal(result.account.free_studies_used, 1)
  assert.equal(result.account.free_asks_used, 5)
  assert.deepEqual(db.state.issued, [{
    accountId: result.account.id,
    installId: 'install-new',
    platform: 'ios',
    label: 'Cole iPhone',
  }])
  assert.ok(db.state.codes[0].consumed_at)
  assert.equal(db.state.codes[0].account_id, result.account.id)
  const claimedTables = db.state.statements
    .filter(({ sql }) => /UPDATE (study|study_reservation|ask_reservation|usage_event)/.test(sql))
  assert.equal(claimedTables.length, 4)
  assert.equal(marketing.staged.length, 1)
  assert.equal(marketing.synced.length, 1)

  const replay = await captureError(() => confirmRegistrationCode(db, auth, {
    email: 'pastor@example.com', code: '123456', installId: 'install-new',
  }))
  assert.ok(replay instanceof AccountRegistrationError)
  assert.equal(replay.code, 'REGISTRATION_CODE_INVALID')
  assert.equal(db.state.issued.length, 1)
})

test('an account created before confirmation consumes the code without issuing another bearer', async () => {
  const db = registrationDb()
  await requestRegistrationCode(db, {
    email: 'pastor@example.com', installId: 'install-phone',
  }, {
    randomInt: () => 777777,
    async send() {},
  })
  db.state.accounts.set('pastor@example.com', {
    id: 'acct-winner', email: 'pastor@example.com', plan: 'free', status: 'none', deleting_at: null,
  })
  const auth = authRecorder(db)
  const error = await captureError(() => confirmRegistrationCode(db, auth, {
    email: 'pastor@example.com', code: '777777', installId: 'install-phone',
  }))

  assert.ok(error instanceof AccountRegistrationError)
  assert.equal(error.code, 'REGISTRATION_CODE_INVALID')
  assert.ok(db.state.codes[0].consumed_at)
  assert.equal(db.state.issued.length, 0)
})
