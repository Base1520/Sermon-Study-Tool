const auth = require('./auth')
const {
  MAX_ACTIVE_DEVICES,
  MAX_WORKSPACE_CHARS,
  MAX_NOTES_CHARS,
  MobileRouteError,
  allowedOrigins,
  generateDeviceLinkCode,
  fetchPassage,
  marketingOptInForRelease,
  mobileRegistrationEnabled,
  mobileEsvLicensed,
  normalizeDeviceLinkCode,
  normalizeReference,
  normalizeStudyWorkspace,
  normalizeStudyNotes,
  remainingStudyCount,
  redeemDeviceLink,
  revokeCurrentDevice,
  sha256,
} = require('./mobile')

let passed = 0
let failed = 0

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ok   ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function fakePool({ activeDevices = 1, sameInstallMatches = 0, accountExists = true } = {}) {
  const state = {
    codeHash: sha256('OPR-AAAA-AAAA'),
    linkUsed: false,
    activeDevices,
    sameInstallMatches,
    accountExists,
    issued: [],
    committed: false,
    rolledBack: false,
    released: false,
    transactionEvents: [],
    claimedTables: [],
  }
  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN') { state.transactionEvents.push('BEGIN'); return { rows: [] } }
      if (sql === 'COMMIT') { state.committed = true; state.transactionEvents.push('COMMIT'); return { rows: [] } }
      if (sql === 'ROLLBACK') { state.rolledBack = true; state.transactionEvents.push('ROLLBACK'); return { rows: [] } }
      if (/SELECT account_id\s+FROM device_link/s.test(sql)) {
        return { rows: params[0] === state.codeHash && !state.linkUsed ? [{ account_id: 'acct-1' }] : [] }
      }
      if (/SELECT id, email, plan, status\s+FROM account/s.test(sql)) {
        return { rows: state.accountExists
          ? [{ id: 'acct-1', email: 'pastor@example.com', plan: 'standard', status: 'active' }]
          : [] }
      }
      if (/UPDATE device SET revoked_at/.test(sql)) {
        return { rows: [], rowCount: state.sameInstallMatches }
      }
      if (/SELECT COUNT\(\*\)::int AS count/.test(sql)) return { rows: [{ count: state.activeDevices }] }
      if (/UPDATE device_link SET used_at/.test(sql)) {
        if (state.linkUsed) return { rows: [] }
        state.linkUsed = true
        return { rows: [{ account_id: 'acct-1' }] }
      }
      if (/UPDATE\s+(study|study_reservation|ask_reservation|usage_event)/.test(sql)) {
        state.claimedTables.push(sql.match(/UPDATE\s+([a-z_]+)/i)?.[1])
        return { rows: [], rowCount: 1 }
      }
      if (/INSERT INTO device/.test(sql)) {
        state.issued.push({
          accountId: params[0],
          tokenHash: params[1],
          installId: params[2],
          label: params[3],
          platform: params[4],
        })
        return { rows: [{ id: 'device-new', created_at: new Date().toISOString() }] }
      }
      throw new Error(`Unhandled SQL: ${sql.slice(0, 80)}`)
    },
    release() {
      state.released = true
      state.transactionEvents.push('RELEASE')
    },
  }
  return { state, connect: async () => client }
}

;(async () => {
  console.log('\nMOBILE LINK CODE SHAPE')
  const deterministic = generateDeviceLinkCode(() => Buffer.alloc(8))
  check('codes are readable and fixed length', deterministic === 'OPR-AAAA-AAAA', deterministic)
  check('pasted codes normalize without punctuation', normalizeDeviceLinkCode('opr aaaa aaaa') === deterministic)
  check('ambiguous characters are refused', normalizeDeviceLinkCode('OPR-AIAA-AAAA') === null)
  check('native origins are allowed', allowedOrigins().has('capacitor://localhost') && allowedOrigins().has('https://localhost'))
  check('arbitrary web origins are not allowed', !allowedOrigins().has('https://attacker.example'))

  console.log('\nPASSAGE REFERENCE NORMALIZATION')
  check('typographic verse-range dashes normalize for the passage provider',
    normalizeReference('Romans 8:1–11') === 'Romans 8:1-11')
  check('pasted reference whitespace is collapsed',
    normalizeReference('  Romans   8:1—11  ') === 'Romans 8:1-11')
  const priorFetch = global.fetch
  let passageProviderUrl = ''
  global.fetch = async (url) => {
    passageProviderUrl = String(url)
    return {
      ok: true,
      async json() {
        return {
          reference: 'Romans 8:1-11',
          verses: [{ book_name: 'Romans', chapter: 8, verse: 1, text: 'There is therefore now no condemnation.' }],
        }
      },
    }
  }
  await fetchPassage({ reference: 'Romans 8:1–11', translation: 'kjv' })
  global.fetch = priorFetch
  check('every passage consumer sends normalized references to the provider',
    decodeURIComponent(passageProviderUrl).includes('/Romans 8:1-11?'))

  console.log('\nMOBILE ESV LICENSE GATE')
  const priorEsvLicense = process.env.ESV_MOBILE_LICENSED
  delete process.env.ESV_MOBILE_LICENSED
  check('ESV mobile access fails closed without written-license configuration', !mobileEsvLicensed())
  let esvLicenseError = null
  try {
    await fetchPassage({ reference: 'John 3:16', translation: 'esv', esvKey: 'personal-key' })
  } catch (error) { esvLicenseError = error }
  check('a personal API key cannot bypass the commercial-license gate',
    esvLicenseError instanceof MobileRouteError && esvLicenseError.code === 'ESV_LICENSE_REQUIRED')
  check('core cannot expose ESV even when the raw flag is accidentally true', !mobileEsvLicensed({
    OPERATOR_RELEASE_STAGE: 'core',
    ESV_MOBILE_LICENSED: 'true',
  }))
  check('full can expose ESV only when its license flag is explicit', mobileEsvLicensed({
    OPERATOR_RELEASE_STAGE: 'full',
    ESV_MOBILE_LICENSED: 'true',
  }))
  if (priorEsvLicense === undefined) delete process.env.ESV_MOBILE_LICENSED
  else process.env.ESV_MOBILE_LICENSED = priorEsvLicense

  console.log('\nMOBILE MARKETING CAPABILITY GATE')
  check('core registration never claims a marketing opt-in', marketingOptInForRelease(true, {
    OPERATOR_RELEASE_STAGE: 'core',
  }) === false)
  check('full registration preserves opt-in only when Mailchimp is configured', marketingOptInForRelease(true, {
    OPERATOR_RELEASE_STAGE: 'full',
    MAILCHIMP_API_KEY: 'configured-key-us1',
    MAILCHIMP_AUDIENCE_ID: 'audience-id',
  }) === true)

  console.log('\nMOBILE REGISTRATION CAPABILITY GATE')
  check('core is link-only even if a client submits the registration route', !mobileRegistrationEnabled({
    OPERATOR_RELEASE_STAGE: 'core',
    RESEND_API_KEY: 're_configured',
    OPERATOR_AUTH_FROM_EMAIL: 'The Operator <access@example.com>',
  }))
  check('registration opens only with full recovery email capability', mobileRegistrationEnabled({
    OPERATOR_RELEASE_STAGE: 'full',
    RESEND_API_KEY: 're_configured',
    OPERATOR_AUTH_FROM_EMAIL: 'The Operator <access@example.com>',
  }))

  console.log('\nMOBILE ACCOUNT METER')
  check('an unused anonymous study is shown as available',
    remainingStudyCount({ allowance: 0, lifetimeStudies: 1 }, 0, false) === 1)
  check('a spent anonymous study is shown as spent',
    remainingStudyCount({ allowance: 0, lifetimeStudies: 1 }, 1, false) === 0)
  check('a linked account uses its monthly allowance, not the free credit',
    remainingStudyCount({ allowance: 40, lifetimeStudies: 1 }, 7, true) === 33)

  console.log('\nTABLET WORKSPACE SYNC BOUNDS')
  check('a versioned sermon desk is accepted as bounded JSON',
    normalizeStudyWorkspace({ version: 1, reference: 'Romans 8:1–11', nodes: [], locked: false })
      === '{"version":1,"reference":"Romans 8:1–11","nodes":[],"locked":false}')
  let invalidWorkspace = null
  try { normalizeStudyWorkspace(['not', 'a', 'workspace']) } catch (error) { invalidWorkspace = error }
  check('array payloads cannot masquerade as a sermon workspace',
    invalidWorkspace instanceof MobileRouteError && invalidWorkspace.code === 'INVALID_WORKSPACE')
  let oversizedWorkspace = null
  try { normalizeStudyWorkspace({ version: 1, manuscript: 'x'.repeat(MAX_WORKSPACE_CHARS + 1) }) } catch (error) { oversizedWorkspace = error }
  check('oversized workspaces fail before reaching Postgres',
    oversizedWorkspace instanceof MobileRouteError && oversizedWorkspace.code === 'WORKSPACE_TOO_LARGE')

  console.log('\nFIELD NOTE SYNC BOUNDS')
  check('field notes at the published limit are preserved exactly',
    normalizeStudyNotes('x'.repeat(MAX_NOTES_CHARS)).length === MAX_NOTES_CHARS)
  let oversizedNotes = null
  try { normalizeStudyNotes('x'.repeat(MAX_NOTES_CHARS + 1)) } catch (error) { oversizedNotes = error }
  check('oversized field notes fail instead of being silently truncated',
    oversizedNotes instanceof MobileRouteError && oversizedNotes.code === 'NOTES_TOO_LONG')

  console.log('\nONE LINK MEANS ONE DEVICE')
  const pool = fakePool()
  const first = await redeemDeviceLink(pool, auth, {
    code: 'OPR-AAAA-AAAA',
    installId: 'phone-1',
    label: '  Cole   iPhone  ',
    platform: 'ios',
  })
  check('a valid code mints a bearer token', first.token.startsWith(auth.PREFIX))
  check('the transaction commits', pool.state.committed && !pool.state.rolledBack)
  check('the install and platform are bound to the token',
    pool.state.issued[0].installId === 'phone-1' && pool.state.issued[0].platform === 'ios')
  check('device labels are normalized', pool.state.issued[0].label === 'Cole iPhone')
  check('linking claims every anonymous server record for that install',
    pool.state.claimedTables.join(',') === 'study,study_reservation,ask_reservation,usage_event')

  let replayError = null
  try {
    await redeemDeviceLink(pool, auth, {
      code: 'OPR-AAAA-AAAA', installId: 'phone-2', label: 'Other phone', platform: 'android',
    })
  } catch (error) { replayError = error }
  check('the same code cannot be replayed', replayError instanceof MobileRouteError && replayError.code === 'INVALID_LINK_CODE')

  console.log('\nDEVICE CAP IS ENFORCED BEFORE ISSUE')
  const full = fakePool({ activeDevices: MAX_ACTIVE_DEVICES })
  const capacityWarnings = []
  const priorWarn = console.warn
  let capError = null
  console.warn = (...args) => {
    capacityWarnings.push(args)
    full.state.transactionEvents.push('WARN')
  }
  try {
    await redeemDeviceLink(full, auth, {
      code: 'OPR-AAAA-AAAA', installId: 'phone-3', label: 'Full account', platform: 'ios',
    })
  } catch (error) { capError = error }

  const sameInstallFull = fakePool({
    activeDevices: MAX_ACTIVE_DEVICES,
    sameInstallMatches: 1,
  })
  let sameInstallCapError = null
  console.warn = (...args) => {
    capacityWarnings.push(args)
    sameInstallFull.state.transactionEvents.push('WARN')
  }
  try {
    await redeemDeviceLink(sameInstallFull, auth, {
      code: 'OPR-AAAA-AAAA', installId: 'phone-existing', label: 'Existing phone', platform: 'ios',
    })
  } catch (error) { sameInstallCapError = error }
  finally { console.warn = priorWarn }

  check('a fourth active device is refused', capError instanceof MobileRouteError && capError.code === 'DEVICE_LIMIT')
  check('no token is issued over the cap', full.state.issued.length === 0)
  check('the failed transaction rolls back', full.state.rolledBack && !full.state.committed)
  check('capacity telemetry waits for rollback and connection release',
    full.state.transactionEvents.join(',') === 'BEGIN,ROLLBACK,RELEASE,WARN'
      && sameInstallFull.state.transactionEvents.join(',') === 'BEGIN,ROLLBACK,RELEASE,WARN')
  check('same-install over-cap redemption is also refused',
    sameInstallCapError instanceof MobileRouteError && sameInstallCapError.code === 'DEVICE_LIMIT')
  check('capacity telemetry emits exactly one scalar-only marker per refusal',
    capacityWarnings.length === 2 && capacityWarnings.every((args) => args.length === 1))
  check('capacity telemetry distinguishes a new install without identifiers',
    capacityWarnings[0]?.[0] === '[device-link] capacity refused same_install_match=no active_after_tentative_revoke=3')
  check('capacity telemetry distinguishes a same-install match without identifiers',
    capacityWarnings[1]?.[0] === '[device-link] capacity refused same_install_match=yes active_after_tentative_revoke=3')

  const sensitiveFieldNames = /(?:account_id|device_id|install_id|link_code|token|email|label|ip_address|request_id)/i
  check('capacity telemetry contains no identifier or credential field names',
    !sensitiveFieldNames.test(capacityWarnings.flat().join('\n')))

  const loggerFailurePool = fakePool({ activeDevices: MAX_ACTIVE_DEVICES })
  let loggerFailureError = null
  console.warn = () => { throw new Error('simulated logger failure') }
  try {
    await redeemDeviceLink(loggerFailurePool, auth, {
      code: 'OPR-AAAA-AAAA', installId: 'phone-logger', label: 'Logger failure', platform: 'ios',
    })
  } catch (error) { loggerFailureError = error }
  finally { console.warn = priorWarn }
  check('telemetry failure cannot replace the device-limit response',
    loggerFailureError instanceof MobileRouteError && loggerFailureError.code === 'DEVICE_LIMIT')
  check('telemetry failure still follows rollback and release',
    loggerFailurePool.state.transactionEvents.join(',') === 'BEGIN,ROLLBACK,RELEASE')

  const unrelatedWarnings = []
  console.warn = (...args) => unrelatedWarnings.push(args)
  try {
    await redeemDeviceLink(fakePool(), auth, {
      code: 'OPR-AAAA-AAAA', installId: 'phone-ok', label: 'Allowed phone', platform: 'ios',
    })
    try {
      await redeemDeviceLink(fakePool(), auth, {
        code: 'not-a-link', installId: 'phone-invalid', label: 'Invalid link', platform: 'ios',
      })
    } catch {}
    try {
      await redeemDeviceLink(fakePool({ accountExists: false }), auth, {
        code: 'OPR-AAAA-AAAA', installId: 'phone-inactive', label: 'Inactive account', platform: 'ios',
      })
    } catch {}
  } finally { console.warn = priorWarn }
  check('success, invalid-link, and account-inactive paths emit no capacity telemetry',
    unrelatedWarnings.length === 0)

  console.log('\nSIGN OUT REVOKES THIS DEVICE')
  let revokedIdentity = null
  const revokeAuth = {
    async revokeDevice(_db, identity) {
      revokedIdentity = identity
      return true
    },
  }
  await revokeCurrentDevice({}, revokeAuth, {
    account: { id: 'acct-1' },
    deviceId: 'device-current',
  })
  check('sign out revokes the authenticated device only',
    revokedIdentity?.accountId === 'acct-1' && revokedIdentity?.deviceId === 'device-current')

  let anonymousError = null
  try { await revokeCurrentDevice({}, revokeAuth, { anonymous: true }) } catch (error) { anonymousError = error }
  check('anonymous callers cannot revoke account devices',
    anonymousError instanceof MobileRouteError && anonymousError.code === 'ACCOUNT_REQUIRED')

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})()
