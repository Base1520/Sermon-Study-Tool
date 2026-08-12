const test = require('node:test')
const assert = require('node:assert/strict')

const { SCHEMA_VERSION, probeReadiness, runtimeIdentity } = require('./readiness')

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
  STRIPE_SECRET_KEY: 'sk_test_ready',
  STRIPE_WEBHOOK_SECRET: 'whsec_ready',
  STRIPE_PRICE_STARTER: 'price_starter',
  STRIPE_PRICE_STARTER_ANNUAL: 'price_starter_annual',
  STRIPE_PRICE_STANDARD: 'price_standard',
  STRIPE_PRICE_STANDARD_ANNUAL: 'price_standard_annual',
  STRIPE_PRICE_HEAVY: 'price_heavy',
  STRIPE_PRICE_HEAVY_ANNUAL: 'price_heavy_annual',
  STRIPE_PRICE_TOPUP: 'price_topup',
  APPLE_APP_ID: '1234567890',
  IAP_SANDBOX_ACCOUNT_EMAILS: 'reviewer@example.com',
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
    usage_event_table: true,
    study_table: true,
    anon_install_table: true,
    document_cache_table: true,
    download_lead_table: true,
    account_registration_account_column: true,
    account_registration_source_ip_column: true,
    account_deleting_column: true,
    billing_anchor_column: true,
    provider_event_column: true,
    study_workspace_column: true,
    study_workspace_revision_column: true,
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

test('readiness passes only when the complete mobile billing schema exists', async () => {
  const db = {
    async query() {
      return { rows: [schemaChecks()] }
    },
  }

  const result = await probeReadiness(db, READY_ENV)
  assert.equal(result.ok, true)
  assert.deepEqual(result.missing, [])
  assert.deepEqual(result.degraded, [])
  assert.equal(result.releaseStage, 'full')
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

test('production store capabilities do not depend on retaining a sandbox reviewer allowlist', async () => {
  const db = { async query() { return { rows: [schemaChecks()] } } }
  const result = await probeReadiness(db, {
    ...READY_ENV,
    IAP_SANDBOX_ACCOUNT_EMAILS: '',
  })

  assert.equal(result.ok, true)
  assert.equal(result.capabilities.apple_iap, true)
  assert.equal(result.capabilities.google_iap, true)
  assert.ok(!result.degraded.includes('apple_iap'))
  assert.ok(!result.degraded.includes('google_iap'))
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
    'google_iap',
  ])
  assert.deepEqual(result.capabilities, {
    account_recovery_email: false,
    marketing_sync: false,
    apple_iap: false,
    google_iap: false,
    esv_mobile: false,
  })
})

test('an unlabelled deployment never falls through to core', async () => {
  const db = { async query() { return { rows: [schemaChecks()] } } }
  const result = await probeReadiness(db, { ...READY_ENV, OPERATOR_RELEASE_STAGE: '' })
  assert.equal(result.ok, false)
  assert.equal(result.releaseStage, 'invalid')
  assert.deepEqual(result.missing, ['config_operator_release_stage'])
})
