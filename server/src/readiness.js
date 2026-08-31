const { version } = require('../package.json')
const { SCHEMA_VERSION, schemaSha256 } = require('./schema-version')

const SCHEMA_SHA256 = schemaSha256()

const CORE_CONFIGURATION = [
  'ANTHROPIC_API_KEY',
  'TRIAL_IDENTITY_SECRET',
  'ACCOUNT_RECOVERY_SECRET',
  'OPERATOR_RELEASE_STAGE',
  'OPERATOR_API_PUBLIC_URL',
  'OPERATOR_WEB_PUBLIC_URL',
  'OPERATOR_ALLOWED_ORIGINS',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_STARTER_ANNUAL',
  'STRIPE_PRICE_STANDARD',
  'STRIPE_PRICE_STANDARD_ANNUAL',
  'STRIPE_PRICE_HEAVY',
  'STRIPE_PRICE_HEAVY_ANNUAL',
  'STRIPE_PRICE_TOPUP',
]

const OPTIONAL_CONFIGURATION = [
  'RESEND_API_KEY',
  'OPERATOR_AUTH_FROM_EMAIL',
  'MAILCHIMP_API_KEY',
  'MAILCHIMP_AUDIENCE_ID',
  'APPLE_APP_ID',
  'IAP_SANDBOX_ACCOUNT_EMAILS',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
  'GOOGLE_RTDN_AUDIENCE',
  'GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL',
]

function configured(value) {
  const clean = String(value || '').trim()
  return Boolean(clean) && !/(replace[-_ ]?me|replace-with|generate-a-)/i.test(clean)
}

function googleCredentialsConfigured(value) {
  try {
    const raw = String(value || '').trim()
    const credentials = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
    return ['client_email', 'private_key', 'project_id'].every((key) => configured(credentials?.[key]))
  } catch {
    return false
  }
}

function authFromEmailConfigured(value) {
  const clean = String(value || '').trim()
  const match = clean.match(/^(?:[^<>]+\s+<)?([^\s<>@]+@[^\s<>@]+)\>?$/)
  if (!match) return false
  const domain = match[1].split('@')[1].toLowerCase()
  return domain !== 'resend.dev'
}

function sandboxReviewerAllowlistConfigured(value) {
  const addresses = String(value || '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean)
  if (addresses.length === 0) return false

  return addresses.every((address) => {
    const match = address.match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/)
    if (!match) return false
    return !['example.com', 'example.net', 'example.org'].includes(match[1])
  })
}

function releaseStage(env = process.env) {
  const stage = String(env.OPERATOR_RELEASE_STAGE || '').trim().toLowerCase()
  return ['core', 'full'].includes(stage) ? stage : null
}

function configurationChecks(env = process.env, keys = CORE_CONFIGURATION) {
  return Object.fromEntries(keys.map((key) => {
    let ready = configured(env[key])
    if (key === 'TRIAL_IDENTITY_SECRET') ready = String(env[key] || '').length >= 32
    if (key === 'ACCOUNT_RECOVERY_SECRET') ready = String(env[key] || '').length >= 32
    if (key === 'OPERATOR_RELEASE_STAGE') ready = Boolean(releaseStage(env))
    if (key === 'STRIPE_SECRET_KEY') ready = /^sk_live_[A-Za-z0-9]+$/.test(String(env[key] || '').trim())
    if (key === 'STRIPE_WEBHOOK_SECRET') ready = /^whsec_[A-Za-z0-9]+$/.test(String(env[key] || '').trim())
    if (key.startsWith('STRIPE_PRICE_')) ready = /^price_[A-Za-z0-9]+$/.test(String(env[key] || '').trim())
    if (key === 'APPLE_APP_ID') {
      const appId = Number(String(env[key] || '').trim())
      ready = Number.isSafeInteger(appId) && appId > 0
    }
    if (key === 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON') ready = googleCredentialsConfigured(env[key])
    return [`config_${key.toLowerCase()}`, ready]
  }))
}

function capabilityChecks(env = process.env) {
  const optional = configurationChecks(env, OPTIONAL_CONFIGURATION)
  const available = (key) => optional[`config_${key.toLowerCase()}`] === true
  const full = releaseStage(env) === 'full'
  return {
    account_recovery_email: full &&
      available('RESEND_API_KEY') &&
      authFromEmailConfigured(env.OPERATOR_AUTH_FROM_EMAIL),
    marketing_sync: full && available('MAILCHIMP_API_KEY') && available('MAILCHIMP_AUDIENCE_ID'),
    // The sandbox allowlist gates test transactions inside iap.js; production
    // receipt verification does not depend on a reviewer account remaining set.
    apple_iap: full && available('APPLE_APP_ID'),
    apple_iap_sandbox_review: full && sandboxReviewerAllowlistConfigured(env.IAP_SANDBOX_ACCOUNT_EMAILS),
    google_iap: full &&
      available('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON') &&
      available('GOOGLE_RTDN_AUDIENCE') &&
      available('GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL'),
    esv_mobile: full && String(env.ESV_MOBILE_LICENSED || '').trim().toLowerCase() === 'true',
  }
}

function runtimeIdentity() {
  const commit = String(
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.SOURCE_VERSION ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    'local',
  ).slice(0, 12)

  return {
    service: 'operator-api',
    version,
    commit,
    schema: SCHEMA_VERSION,
    schemaHash: SCHEMA_SHA256,
  }
}

async function probeReadiness(db, env = process.env) {
  const { rows } = await db.query(`
    SELECT
      to_regclass('public.account') IS NOT NULL AS account_table,
      to_regclass('public.billing_subscription') IS NOT NULL AS billing_subscription_table,
      to_regclass('public.free_trial_tombstone') IS NOT NULL AS free_trial_tombstone_table,
      to_regclass('public.marketing_contact_state') IS NOT NULL AS marketing_contact_state_table,
      to_regclass('public.marketing_deletion_outbox') IS NOT NULL AS marketing_deletion_outbox_table,
      to_regclass('public.google_acknowledgment_outbox') IS NOT NULL AS google_acknowledgment_outbox_table,
      to_regclass('public.device') IS NOT NULL AS device_table,
      to_regclass('public.device_link') IS NOT NULL AS device_link_table,
      to_regclass('public.account_recovery_request') IS NOT NULL AS account_recovery_request_table,
      to_regclass('public.account_recovery_code') IS NOT NULL AS account_recovery_code_table,
      to_regclass('public.account_registration_code') IS NOT NULL AS account_registration_code_table,
      to_regclass('public.usage_period') IS NOT NULL AS usage_period_table,
      to_regclass('public.study_reservation') IS NOT NULL AS study_reservation_table,
      to_regclass('public.ask_reservation') IS NOT NULL AS ask_reservation_table,
      to_regclass('public.model_admission') IS NOT NULL AS model_admission_table,
      to_regclass('public.schema_migration') IS NOT NULL AS schema_migration_table,
      to_regclass('public.settings') IS NOT NULL AS settings_table,
      to_regclass('public.usage_event') IS NOT NULL AS usage_event_table,
      to_regclass('public.study') IS NOT NULL AS study_table,
      to_regclass('public.anon_install') IS NOT NULL AS anon_install_table,
      to_regclass('public.document_cache') IS NOT NULL AS document_cache_table,
      to_regclass('public.feedback') IS NOT NULL AS feedback_table,
      to_regclass('public.download_lead') IS NOT NULL AS download_lead_table,
      to_regclass('public.som_purchase') IS NOT NULL AS som_purchase_table,
      to_regclass('public.access_code') IS NOT NULL AS access_code_table,
      to_regclass('public.access_code_use') IS NOT NULL AS access_code_use_table,
      to_regclass('public.topup') IS NOT NULL AS topup_table,
      to_regclass('public.topup_reconciliation_failure') IS NOT NULL AS topup_reconciliation_failure_table,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'account_registration_code' AND column_name = 'account_id'
      ) AS account_registration_account_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'account_registration_code' AND column_name = 'source_ip_hash'
      ) AS account_registration_source_ip_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'account_registration_code'
           AND column_name = 'source_ip_hash' AND is_nullable = 'NO'
      ) AS account_registration_source_ip_not_null,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'account' AND column_name = 'deleting_at'
      ) AS account_deleting_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'device' AND column_name = 'install_data_claimed_at'
      ) AS device_install_data_claimed_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'billing_subscription' AND column_name = 'billing_anchor_at'
      ) AS billing_anchor_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'billing_subscription' AND column_name = 'provider_event_at'
      ) AS provider_event_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'study' AND column_name = 'workspace'
      ) AS study_workspace_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'study' AND column_name = 'workspace_revision'
      ) AS study_workspace_revision_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'study' AND column_name = 'request_hash'
      ) AS study_request_hash_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'study_reservation' AND column_name = 'accounting_uncertain'
      ) AS study_reservation_accounting_uncertain_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ask_reservation' AND column_name = 'accounting_uncertain'
      ) AS ask_reservation_accounting_uncertain_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ask_reservation' AND column_name = 'request_hash'
      ) AS ask_reservation_request_hash_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ask_reservation' AND column_name = 'response'
      ) AS ask_reservation_response_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'model_admission'
           AND column_name = 'provider_slots' AND is_nullable = 'NO'
      ) AS model_admission_provider_slots_column,
      EXISTS (
        SELECT 1 FROM schema_migration
         WHERE schema_version = $1 AND schema_sha256 = $2
      ) AS schema_migration_exact,
      COALESCE((
        SELECT COUNT(*) = 7 AND BOOL_AND(
          CASE WHEN key = 'model_admission_window_seconds'
            THEN value ~ '^[1-9][0-9]*$'
            ELSE value ~ '^[0-9]+$'
          END
        )
          FROM settings
         WHERE key IN (
           'model_admission_window_seconds',
           'model_admission_global_requests',
           'model_admission_identity_requests',
           'model_admission_global_concurrency',
           'model_admission_identity_concurrency',
           'model_admission_global_provider_concurrency',
           'model_admission_identity_provider_concurrency'
         )
      ), false) AS model_admission_settings,
      EXISTS (
        SELECT 1
          FROM account review_account
         WHERE lower(review_account.email) = 'app-review@base1520.com'
           AND review_account.plan = 'comp'
           AND review_account.status = 'active'
           AND review_account.deleting_at IS NULL
           AND (
             EXISTS (
               SELECT 1 FROM device review_device
                WHERE review_device.account_id = review_account.id
                  AND review_device.revoked_at IS NULL
             )
             OR EXISTS (
               SELECT 1 FROM device_link review_link
                WHERE review_link.account_id = review_account.id
                  AND review_link.used_at IS NULL
                  AND review_link.expires_at > now()
             )
           )
      ) AS review_access_ready
  `, [SCHEMA_VERSION, SCHEMA_SHA256])
  const stage = releaseStage(env)
  const { review_access_ready: reviewAccessReady = false, ...schemaChecks } = rows[0] || {}
  const checks = { ...schemaChecks, ...configurationChecks(env, CORE_CONFIGURATION) }
  const capabilities = {
    ...capabilityChecks(env),
    review_access: stage === 'full' && reviewAccessReady === true,
  }
  const missing = Object.entries(checks)
    .filter(([, available]) => available !== true)
    .map(([name]) => name)

  return {
    ...runtimeIdentity(),
    releaseStage: stage || 'invalid',
    ok: missing.length === 0,
    missing,
    degraded: Object.entries(capabilities)
      .filter(([name, available]) => name !== 'esv_mobile' && !available)
      .map(([name]) => name),
    capabilities,
  }
}

module.exports = {
  SCHEMA_VERSION,
  SCHEMA_SHA256,
  CORE_CONFIGURATION,
  OPTIONAL_CONFIGURATION,
  releaseStage,
  configurationChecks,
  authFromEmailConfigured,
  sandboxReviewerAllowlistConfigured,
  capabilityChecks,
  probeReadiness,
  runtimeIdentity,
}
