const test = require('node:test')
const assert = require('node:assert/strict')

const { SCHEMA_SHA256, SCHEMA_VERSION, probeReadiness, runtimeIdentity, configurationChecks, CORE_CONFIGURATION } = require('./readiness')

const READY_ENV = {
  ANTHROPIC_API_KEY: 'sk-ant-test-ready',
  TRIAL_IDENTITY_SECRET: 'test-only-trial-secret-at-least-32-characters',
  ACCOUNT_RECOVERY_SECRET: 'test-only-recovery-secret-at-least-32-characters',
  OPERATOR_RELEASE_STAGE: 'full',
  RESEND_API_KEY: 're_test_ready',
  OPERATOR_AUTH_FROM_EMAIL: 'The Operator <access@example.com>',
  OPERATOR_API_PUBLIC_URL: 'https://api.example.com',
  OPERATOR_WEB_PUBLIC_URL: 'https://www.example.com/operator',
  OPERATOR_ALLOWED_ORIGINS: 'https://www.example.com',
  MAILCHIMP_API_KEY: 'test-key-us21',
  MAILCHIMP_AUDIENCE_ID: 'audience-test',
  STRIPE_SECRET_KEY: 'sk_live_ready',
  STRIPE_WEBHOOK_SECRET: 'whsec_ready',
  STRIPE_PRICE_STARTER: 'price_starter',
  STRIPE_PRICE_STARTER_ANNUAL: 'price_starterannual',
  STRIPE_PRICE_STANDARD: 'price_standard',
  STRIPE_PRICE_STANDARD_ANNUAL: 'price_standardannual',
  STRIPE_PRICE_HEAVY: 'price_heavy',
  STRIPE_PRICE_HEAVY_ANNUAL: 'price_heavyannual',
  STRIPE_PRICE_TOPUP: 'price_topup',
  APPLE_APP_ID: '1234567890',
  IAP_SANDBOX_ACCOUNT_EMAILS: 'reviewer@base1520.com',
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: 'play@example.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
    project_id: 'operator-test',
  }),
  GOOGLE_RTDN_AUDIENCE: 'operator-rtdn',
  GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: 'rtdn@example.iam.gserviceaccount.com',
}

function schemaChecks(overrides = {}) {
  return {
    account_table: true,
    billing_subscription_table: true,
    free_trial_tombstone_table: true,
    marketing_contact_state_table: true,
    marketing_deletion_outbox_table: true,
    google_acknowledgment_outbox_table: true,
    device_table: true,
    device_link_table: true,
    account_recovery_request_table: true,
    account_recovery_code_table: true,
    account_registration_code_table: true,
    usage_period_table: true,
    study_reservation_table: true,
    ask_reservation_table: true,
    model_admission_table: true,
    schema_migration_table: true,
    settings_table: true,
    usage_event_table: true,
    study_table: true,
    anon_install_table: true,
    document_cache_table: true,
    feedback_table: true,
    download_lead_table: true,
    som_purchase_table: true,
    access_code_table: true,
    access_code_use_table: true,
    topup_table: true,
    topup_reconciliation_failure_table: true,
    account_registration_account_column: true,
    account_registration_source_ip_column: true,
    account_registration_source_ip_not_null: true,
    account_deleting_column: true,
    device_install_data_claimed_column: true,
    billing_anchor_column: true,
    provider_event_column: true,
    study_workspace_column: true,
    study_workspace_revision_column: true,
    study_request_hash_column: true,
    study_reservation_accounting_uncertain_column: true,
    ask_reservation_accounting_uncertain_column: true,
    ask_reservation_request_hash_column: true,
    ask_reservation_response_column: true,
    model_admission_provider_slots_column: true,
    schema_migration_exact: true,
    model_admission_settings: true,
    review_access_ready: true,
    ...overrides,
  }
}

test('runtime identity exposes a reproducible service and schema version', () => {
  const previous = process.env.RAILWAY_GIT_COMMIT_SHA
  process.env.RAILWAY_GIT_COMMIT_SHA = '1234567890abcdef'
  try {
    assert.deepEqual(runtimeIdentity(), {
      service: 'operator-api',
      version: require('../package.json').version,
      commit: '1234567890ab',
      schema: SCHEMA_VERSION,
      schemaHash: SCHEMA_SHA256,
    })
  } finally {
    if (previous === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA
    else process.env.RAILWAY_GIT_COMMIT_SHA = previous
  }
})

test('runtime identity traces CLI deployments without a Git SHA', () => {
  const previousGit = process.env.RAILWAY_GIT_COMMIT_SHA
  const previousSource = process.env.SOURCE_VERSION
  const previousDeployment = process.env.RAILWAY_DEPLOYMENT_ID
  delete process.env.RAILWAY_GIT_COMMIT_SHA
  delete process.env.SOURCE_VERSION
  process.env.RAILWAY_DEPLOYMENT_ID = 'f93e830c-d4fa-4788-919f-85dd7c33db34'

  try {
    assert.equal(runtimeIdentity().commit, 'f93e830c-d4f')
  } finally {
    if (previousGit === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA
    else process.env.RAILWAY_GIT_COMMIT_SHA = previousGit
    if (previousSource === undefined) delete process.env.SOURCE_VERSION
    else process.env.SOURCE_VERSION = previousSource
    if (previousDeployment === undefined) delete process.env.RAILWAY_DEPLOYMENT_ID
    else process.env.RAILWAY_DEPLOYMENT_ID = previousDeployment
  }
})

test('readiness fails closed when a release-critical schema feature is absent', async () => {
  const db = {
    async query() {
      return { rows: [schemaChecks({ marketing_deletion_outbox_table: false })] }
    },
  }

  const result = await probeReadiness(db, READY_ENV)
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['marketing_deletion_outbox_table'])
  assert.deepEqual(result.degraded, [])
})

test('readiness fails closed when verified-registration storage is absent', async () => {
  const db = {
    async query() {
      return { rows: [schemaChecks({ account_registration_code_table: false })] }
    },
  }

  const result = await probeReadiness(db, READY_ENV)
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['account_registration_code_table'])
})

test('readiness fails closed when recovery throttles cannot treat unknown emails equally', async () => {
  const db = {
    async query() {
      return { rows: [schemaChecks({ account_recovery_request_table: false })] }
    },
  }

  const result = await probeReadiness(db, READY_ENV)
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['account_recovery_request_table'])
})

test('readiness fails closed before the one-time install adoption marker exists', async () => {
  const db = {
    async query() {
      return { rows: [schemaChecks({ device_install_data_claimed_column: false })] }
    },
  }

  const result = await probeReadiness(db, READY_ENV)
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['device_install_data_claimed_column'])
})

test('readiness fails closed without durable model admission', async () => {
  for (const missing of ['model_admission_table', 'model_admission_settings', 'schema_migration_exact']) {
    const db = { async query() { return { rows: [schemaChecks({ [missing]: false })] } } }
    const result = await probeReadiness(db, READY_ENV)
    assert.equal(result.ok, false)
    assert.deepEqual(result.missing, [missing])
  }
})

test('readiness fails closed on every route-critical schema object and accounting marker', async () => {
  for (const missing of [
    'settings_table',
    'feedback_table',
    'som_purchase_table',
    'access_code_table',
    'access_code_use_table',
    'topup_table',
    'topup_reconciliation_failure_table',
    'account_registration_source_ip_not_null',
    'study_reservation_accounting_uncertain_column',
    'ask_reservation_accounting_uncertain_column',
    'study_request_hash_column',
    'ask_reservation_request_hash_column',
    'ask_reservation_response_column',
    'model_admission_provider_slots_column',
  ]) {
    const db = { async query() { return { rows: [schemaChecks({ [missing]: false })] } } }
    const result = await probeReadiness(db, READY_ENV)
    assert.equal(result.ok, false, missing)
    assert.deepEqual(result.missing, [missing])
  }
})

test('readiness passes only when the complete mobile billing schema exists', async () => {
  let queryParams = null
  const db = {
    async query(_sql, params) {
      queryParams = params
      return { rows: [schemaChecks()] }
    },
  }

  const result = await probeReadiness(db, READY_ENV)
  assert.equal(result.ok, true)
  assert.deepEqual(result.missing, [])
  assert.deepEqual(result.degraded, [])
  assert.equal(result.releaseStage, 'full')
  assert.deepEqual(queryParams, [SCHEMA_VERSION, SCHEMA_SHA256])
})

test('full readiness fails closed on core configuration and degrades per optional provider', async () => {
  const db = { async query() { return { rows: [schemaChecks()] } } }
  const result = await probeReadiness(db, {
    ...READY_ENV,
    ANTHROPIC_API_KEY: '',
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: '{bad json',
  })

  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['config_anthropic_api_key'])
  assert.equal(result.capabilities.google_iap, false)
  assert.ok(result.degraded.includes('google_iap'))
})

test('paid release readiness rejects Stripe test-mode and malformed billing credentials', async () => {
  const db = { async query() { return { rows: [schemaChecks()] } } }
  for (const envOverride of [
    { STRIPE_SECRET_KEY: 'sk_test_ready' },
    { STRIPE_SECRET_KEY: 'not-a-stripe-key' },
    { STRIPE_WEBHOOK_SECRET: 'test-webhook' },
    { STRIPE_PRICE_STANDARD: 'standard-price' },
  ]) {
    const result = await probeReadiness(db, { ...READY_ENV, ...envOverride })
    assert.equal(result.ok, false)
    assert.equal(result.missing.length, 1)
    assert.match(result.missing[0], /^config_stripe_/)
  }
})

test('store reviewer access is reported independently and cannot pass by configuration alone', async () => {
  const db = { async query() { return { rows: [schemaChecks({ review_access_ready: false })] } } }
  const result = await probeReadiness(db, READY_ENV)
  assert.equal(result.ok, true)
  assert.equal(result.capabilities.review_access, false)
  assert.ok(result.degraded.includes('review_access'))
})

test('one unavailable store or marketing provider does not take down another platform', async () => {
  const db = { async query() { return { rows: [schemaChecks()] } } }
  const result = await probeReadiness(db, {
    ...READY_ENV,
    MAILCHIMP_API_KEY: '',
    MAILCHIMP_AUDIENCE_ID: '',
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: '',
    GOOGLE_RTDN_AUDIENCE: '',
    GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: '',
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.missing, [])
  assert.equal(result.capabilities.account_recovery_email, true)
  assert.equal(result.capabilities.apple_iap, true)
  assert.equal(result.capabilities.marketing_sync, false)
  assert.equal(result.capabilities.google_iap, false)
})

test('production verification stays available while missing sandbox reviewer access is reported separately', async () => {
  const db = { async query() { return { rows: [schemaChecks()] } } }
  const result = await probeReadiness(db, {
    ...READY_ENV,
    IAP_SANDBOX_ACCOUNT_EMAILS: '',
  })

  assert.equal(result.ok, true)
  assert.equal(result.capabilities.apple_iap, true)
  assert.equal(result.capabilities.apple_iap_sandbox_review, false)
  assert.equal(result.capabilities.google_iap, true)
  assert.ok(!result.degraded.includes('apple_iap'))
  assert.ok(result.degraded.includes('apple_iap_sandbox_review'))
  assert.ok(!result.degraded.includes('google_iap'))
})

test('sandbox reviewer readiness rejects malformed and placeholder-only allowlists', async () => {
  const db = { async query() { return { rows: [schemaChecks()] } } }
  for (const allowlist of ['', 'not-an-email', 'reviewer@example.com', 'real@base1520.com, reviewer@example.org']) {
    const result = await probeReadiness(db, { ...READY_ENV, IAP_SANDBOX_ACCOUNT_EMAILS: allowlist })
    assert.equal(result.capabilities.apple_iap_sandbox_review, false, `expected ${allowlist || 'blank'} to be rejected`)
    assert.ok(result.degraded.includes('apple_iap_sandbox_review'))
  }

  const result = await probeReadiness(db, {
    ...READY_ENV,
    IAP_SANDBOX_ACCOUNT_EMAILS: 'primary@base1520.com, backup@base1520.com',
  })
  assert.equal(result.capabilities.apple_iap_sandbox_review, true)
  assert.ok(!result.degraded.includes('apple_iap_sandbox_review'))
})

test('Apple capability requires a positive integer app id', async () => {
  const db = { async query() { return { rows: [schemaChecks()] } } }
  for (const appId of ['0', '-1', '1.5', 'not-an-id']) {
    const result = await probeReadiness(db, { ...READY_ENV, APPLE_APP_ID: appId })
    assert.equal(result.capabilities.apple_iap, false, `expected ${appId} to be rejected`)
    assert.ok(result.degraded.includes('apple_iap'))
  }

  const result = await probeReadiness(db, { ...READY_ENV, APPLE_APP_ID: '6799805279' })
  assert.equal(result.capabilities.apple_iap, true)
  assert.ok(!result.degraded.includes('apple_iap'))
})

test('account recovery capability rejects malformed and Resend test senders', async () => {
  const db = { async query() { return { rows: [schemaChecks()] } } }
  for (const from of ['', 'not-an-email', 'The Operator <access@resend.dev>', 'access@RESEND.DEV']) {
    const result = await probeReadiness(db, { ...READY_ENV, OPERATOR_AUTH_FROM_EMAIL: from })
    assert.equal(result.capabilities.account_recovery_email, false, `expected ${from || 'blank'} to be rejected`)
    assert.ok(result.degraded.includes('account_recovery_email'))
  }

  const result = await probeReadiness(db, {
    ...READY_ENV,
    OPERATOR_AUTH_FROM_EMAIL: 'The Operator <access@base1520.com>',
  })
  assert.equal(result.capabilities.account_recovery_email, true)
  assert.ok(!result.degraded.includes('account_recovery_email'))
})

test('core readiness is explicit and reports unavailable providers without advertising them', async () => {
  const db = { async query() { return { rows: [schemaChecks()] } } }
  const result = await probeReadiness(db, {
    ...READY_ENV,
    OPERATOR_RELEASE_STAGE: 'core',
    RESEND_API_KEY: '',
    OPERATOR_AUTH_FROM_EMAIL: '',
    MAILCHIMP_API_KEY: '',
    MAILCHIMP_AUDIENCE_ID: '',
    APPLE_APP_ID: '',
    IAP_SANDBOX_ACCOUNT_EMAILS: '',
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: '',
    GOOGLE_RTDN_AUDIENCE: '',
    GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: '',
  })

  assert.equal(result.ok, true)
  assert.equal(result.releaseStage, 'core')
  assert.deepEqual(result.missing, [])
  assert.deepEqual(result.degraded, [
    'account_recovery_email',
    'marketing_sync',
    'apple_iap',
    'apple_iap_sandbox_review',
    'google_iap',
    'review_access',
  ])
  assert.deepEqual(result.capabilities, {
    account_recovery_email: false,
    marketing_sync: false,
    apple_iap: false,
    apple_iap_sandbox_review: false,
    google_iap: false,
    esv_mobile: false,
    review_access: false,
  })
})

test('an unlabelled deployment never falls through to core', async () => {
  const db = { async query() { return { rows: [schemaChecks()] } } }
  const result = await probeReadiness(db, { ...READY_ENV, OPERATOR_RELEASE_STAGE: '' })
  assert.equal(result.ok, false)
  assert.equal(result.releaseStage, 'invalid')
  assert.deepEqual(result.missing, ['config_operator_release_stage'])
})

test('a restricted live Stripe key (rk_live_) satisfies readiness; test keys still do not', () => {
  const base = Object.fromEntries(CORE_CONFIGURATION.map((k) => [k, 'x'.repeat(40)]))
  Object.assign(base, { OPERATOR_RELEASE_STAGE: 'full', STRIPE_WEBHOOK_SECRET: 'whsec_' + 'a'.repeat(32) })
  for (const k of CORE_CONFIGURATION) if (k.startsWith('STRIPE_PRICE_')) base[k] = 'price_' + 'a'.repeat(20)
  const rk = configurationChecks({ ...base, STRIPE_SECRET_KEY: 'rk_live_' + 'a'.repeat(99) }, CORE_CONFIGURATION)
  const sk = configurationChecks({ ...base, STRIPE_SECRET_KEY: 'sk_live_' + 'a'.repeat(99) }, CORE_CONFIGURATION)
  const test_ = configurationChecks({ ...base, STRIPE_SECRET_KEY: 'sk_test_' + 'a'.repeat(99) }, CORE_CONFIGURATION)
  assert.equal(rk.config_stripe_secret_key, true, 'rk_live_ is a valid production key')
  assert.equal(sk.config_stripe_secret_key, true)
  assert.equal(test_.config_stripe_secret_key, false, 'a test key must never pass production readiness')
})
