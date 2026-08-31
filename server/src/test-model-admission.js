const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const meter = require('./meter')
const modelAdmission = require('./model-admission')

const ACCOUNT_A = '00000000-0000-4000-8000-00000000000a'
const ACCOUNT_B = '00000000-0000-4000-8000-00000000000b'

function fakeDb(settingOverrides = {}) {
  const settings = new Map(Object.entries({
    ...modelAdmission.MODEL_ADMISSION_DEFAULTS,
    ...settingOverrides,
  }).map(([name, value]) => [modelAdmission.MODEL_ADMISSION_SETTING_KEYS[name], String(value)]))
  const admissions = new Map()
  let transactionTail = Promise.resolve()
  let failInsertOnce = false

  function cloneAdmissions() {
    return new Map([...admissions].map(([id, row]) => [id, { ...row }]))
  }

  function restoreAdmissions(snapshot) {
    admissions.clear()
    for (const [id, row] of snapshot) admissions.set(id, row)
  }

  const db = {
    _admissions: admissions,
    failNextInsert() {
      failInsertOnce = true
    },
    setSetting(name, value) {
      settings.set(modelAdmission.MODEL_ADMISSION_SETTING_KEYS[name], String(value))
    },
    deleteSetting(name) {
      settings.delete(modelAdmission.MODEL_ADMISSION_SETTING_KEYS[name])
    },
    seed(input, { state = 'active', ageMs = 0 } = {}) {
      const at = new Date(Date.now() - ageMs)
      admissions.set(input.id, {
        id: input.id,
        account_id: input.accountId || null,
        install_id: input.installId || null,
        route: input.route,
        provider_slots: modelAdmission.providerSlots(input.route),
        state,
        created_at: at,
        updated_at: at,
      })
    },
    async connect() {
      let unlock = null
      let snapshot = null
      return {
        async query(sql, params = []) {
          if (sql === 'BEGIN') {
            const turn = transactionTail
            transactionTail = new Promise((resolve) => { unlock = resolve })
            await turn
            snapshot = cloneAdmissions()
            return { rows: [], rowCount: 0 }
          }
          if (sql === 'COMMIT') {
            unlock?.()
            unlock = null
            return { rows: [], rowCount: 0 }
          }
          if (sql === 'ROLLBACK') {
            if (snapshot) restoreAdmissions(snapshot)
            unlock?.()
            unlock = null
            return { rows: [], rowCount: 0 }
          }
          if (/pg_advisory_xact_lock/.test(sql)) return { rows: [], rowCount: 1 }
          return run(sql, params)
        },
        release() {
          unlock?.()
          unlock = null
        },
      }
    },
    query(sql, params = []) {
      return run(sql, params)
    },
  }

  return db

  function run(sql, params) {
    if (/SELECT key, value FROM settings/.test(sql)) {
      return Promise.resolve({ rows: [...settings].map(([key, value]) => ({ key, value })) })
    }
    if (/FROM model_admission/.test(sql) && /global_recent/.test(sql)) {
      const windowMs = Number(params[0]) * 1000
      const activeMs = Number(params[1]) * 60_000
      const accountId = params[2]
      const installId = params[3]
      const now = Date.now()
      const rows = [...admissions.values()]
      const owns = (row) => accountId
        ? row.account_id === accountId || (!row.account_id && row.install_id === installId)
        : !row.account_id && row.install_id === installId
      const recent = (row) => now - row.created_at.getTime() < windowMs
      const active = (row) => row.state === 'active' && now - row.updated_at.getTime() < activeMs
      return Promise.resolve({ rows: [{
        global_recent: rows.filter(recent).length,
        global_active: rows.filter(active).length,
        global_provider_active: rows.filter(active).reduce((total, row) => total + row.provider_slots, 0),
        identity_recent: rows.filter((row) => owns(row) && recent(row)).length,
        identity_active: rows.filter((row) => owns(row) && active(row)).length,
        identity_provider_active: rows
          .filter((row) => owns(row) && active(row))
          .reduce((total, row) => total + row.provider_slots, 0),
      }] })
    }
    if (/INSERT INTO model_admission/.test(sql)) {
      if (failInsertOnce) {
        failInsertOnce = false
        return Promise.reject(new Error('synthetic model admission insert failure'))
      }
      if (admissions.has(params[0])) return Promise.reject(new Error('duplicate model admission'))
      const at = new Date()
      admissions.set(params[0], {
        id: params[0],
        account_id: params[1],
        install_id: params[2],
        route: params[3],
        provider_slots: params[4],
        state: 'active',
        created_at: at,
        updated_at: at,
      })
      return Promise.resolve({ rows: [], rowCount: 1 })
    }
    if (/UPDATE model_admission SET updated_at = now/.test(sql)) {
      const row = admissions.get(params[0])
      if (!row || row.state !== 'active') return Promise.resolve({ rows: [], rowCount: 0 })
      row.updated_at = new Date()
      return Promise.resolve({ rows: [], rowCount: 1 })
    }
    if (/UPDATE model_admission SET state = 'finished'/.test(sql) && /WHERE id = \$1/.test(sql)) {
      const row = admissions.get(params[0])
      if (!row || row.state !== 'active') return Promise.resolve({ rows: [], rowCount: 0 })
      row.state = 'finished'
      row.updated_at = new Date()
      return Promise.resolve({ rows: [], rowCount: 1 })
    }
    if (/UPDATE model_admission SET state = 'finished'/.test(sql)) {
      let rowCount = 0
      const cutoff = Date.now() - Number(params[0]) * 60_000
      for (const row of admissions.values()) {
        if (row.state === 'active' && row.updated_at.getTime() < cutoff) {
          row.state = 'finished'
          row.updated_at = new Date()
          rowCount += 1
        }
      }
      return Promise.resolve({ rows: [], rowCount })
    }
    if (/DELETE FROM model_admission/.test(sql)) {
      let rowCount = 0
      const cutoff = Date.now() - Number(params[0]) * 86_400_000
      for (const [id, row] of admissions) {
        if (row.state === 'finished' && row.created_at.getTime() < cutoff) {
          admissions.delete(id)
          rowCount += 1
        }
      }
      return Promise.resolve({ rows: [], rowCount })
    }
    return Promise.reject(new Error(`unhandled model admission SQL: ${String(sql).slice(0, 80)}`))
  }
}

function input(id, { accountId = ACCOUNT_A, installId = 'install-a', route = 'ask' } = {}) {
  return { id, accountId, installId, route }
}

test('the configured defaults are explicit and readable', async () => {
  const result = await modelAdmission.settings(fakeDb())
  assert.deepEqual(result, modelAdmission.MODEL_ADMISSION_DEFAULTS)
})

test('two concurrent jobs per identity are admitted and the third is refused', async () => {
  const db = fakeDb()
  assert.equal((await modelAdmission.reserve(db, input('a1'), meter.withGlobalSpendLock)).ok, true)
  assert.equal((await modelAdmission.reserve(db, input('a2'), meter.withGlobalSpendLock)).ok, true)
  const refused = await modelAdmission.reserve(db, input('a3'), meter.withGlobalSpendLock)
  assert.deepEqual(refused, { ok: false, reason: 'concurrency', retryAfterSeconds: 15 })
  await modelAdmission.finish(db, 'a1')
  assert.equal((await modelAdmission.reserve(db, input('a4'), meter.withGlobalSpendLock)).ok, true)
})

test('fan-out routes consume their real concurrent provider slots', async () => {
  assert.equal(modelAdmission.providerSlots('analyze'), 3)
  assert.equal(modelAdmission.providerSlots('guided-study'), 3)
  assert.equal(modelAdmission.providerSlots('read'), 1)

  const db = fakeDb({ identityConcurrency: 10, identityProviderConcurrency: 4 })
  assert.equal((await modelAdmission.reserve(
    db,
    input('guided', { route: 'guided-study' }),
    meter.withGlobalSpendLock,
  )).ok, true)
  assert.equal((await modelAdmission.reserve(db, input('ask-one'), meter.withGlobalSpendLock)).ok, true)
  const refused = await modelAdmission.reserve(db, input('ask-two'), meter.withGlobalSpendLock)
  assert.deepEqual(refused, { ok: false, reason: 'provider-concurrency', retryAfterSeconds: 15 })
})

test('the short-window identity ceiling counts finished jobs', async () => {
  const db = fakeDb({ identityRequests: 3, identityConcurrency: 10 })
  for (const id of ['r1', 'r2', 'r3']) {
    assert.equal((await modelAdmission.reserve(db, input(id), meter.withGlobalSpendLock)).ok, true)
    await modelAdmission.finish(db, id)
  }
  const refused = await modelAdmission.reserve(db, input('r4'), meter.withGlobalSpendLock)
  assert.deepEqual(refused, { ok: false, reason: 'rate', retryAfterSeconds: 60 })
})

test('the global window combines routes and identities', async () => {
  const db = fakeDb({ globalRequests: 2, identityRequests: 10, globalConcurrency: 10, identityConcurrency: 10 })
  const first = input('g1', { route: 'guided-study' })
  const second = input('g2', { accountId: ACCOUNT_B, installId: 'install-b', route: 'read' })
  assert.equal((await modelAdmission.reserve(db, first, meter.withGlobalSpendLock)).ok, true)
  await modelAdmission.finish(db, first.id)
  assert.equal((await modelAdmission.reserve(db, second, meter.withGlobalSpendLock)).ok, true)
  await modelAdmission.finish(db, second.id)
  const refused = await modelAdmission.reserve(db, input('g3', { route: 'sermon-assist' }), meter.withGlobalSpendLock)
  assert.equal(refused.reason, 'rate')
})

test('simultaneous admission is atomic across the shared database lock', async () => {
  const db = fakeDb({ identityRequests: 100, globalRequests: 100 })
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => (
    modelAdmission.reserve(db, input(`race-${index}`), meter.withGlobalSpendLock)
  )))
  assert.equal(results.filter((result) => result.ok).length, 2)
  assert.equal(db._admissions.size, 2)
})

test('account admission counts anonymous work that raced install adoption', async () => {
  const db = fakeDb({ identityRequests: 100, identityConcurrency: 1 })
  db.seed(input('anonymous-before-adoption', { accountId: null, installId: 'install-a' }))
  const refused = await modelAdmission.reserve(
    db,
    input('authenticated-after-adoption', { accountId: ACCOUNT_A, installId: 'install-a' }),
    meter.withGlobalSpendLock,
  )
  assert.deepEqual(refused, { ok: false, reason: 'concurrency', retryAfterSeconds: 15 })
})

test('zero is an emergency stop and malformed settings fail closed', async () => {
  const stopped = fakeDb({ globalRequests: 0 })
  assert.equal((await modelAdmission.reserve(stopped, input('stop'), meter.withGlobalSpendLock)).ok, false)
  assert.equal(stopped._admissions.size, 0)

  const malformed = fakeDb()
  malformed.setSetting('globalRequests', 'unlimited')
  await assert.rejects(
    modelAdmission.reserve(malformed, input('bad'), meter.withGlobalSpendLock),
    /invalid model admission setting/,
  )
  assert.equal(malformed._admissions.size, 0)

  const missing = fakeDb()
  missing.deleteSetting('identityConcurrency')
  await assert.rejects(
    modelAdmission.reserve(missing, input('missing'), meter.withGlobalSpendLock),
    /invalid model admission setting/,
  )
})

test('stale active work cannot hold concurrency forever', async () => {
  const db = fakeDb({ identityConcurrency: 1 })
  db.seed(input('stale'), { ageMs: 11 * 60_000 })
  assert.equal((await modelAdmission.reserve(db, input('fresh'), meter.withGlobalSpendLock)).ok, true)
  assert.equal(await modelAdmission.sweep(db), 1)
  assert.equal(db._admissions.get('stale').state, 'finished')
})

test('an insert failure rolls back and remains safely retryable', async () => {
  const db = fakeDb()
  db.failNextInsert()
  await assert.rejects(
    modelAdmission.reserve(db, input('retry'), meter.withGlobalSpendLock),
    /synthetic model admission insert failure/,
  )
  assert.equal(db._admissions.size, 0)
  assert.equal((await modelAdmission.reserve(db, input('retry'), meter.withGlobalSpendLock)).ok, true)
})

test('the public refusal carries retry guidance without internal counts', () => {
  const response = modelAdmission.refusal({ retryAfterSeconds: 60, reason: 'rate' })
  assert.equal(response.status, 429)
  assert.equal(response.retryAfterSeconds, 60)
  assert.equal(response.body.error, 'MODEL_BUSY')
  assert.doesNotMatch(JSON.stringify(response.body), /global|identity|concurrency|limit|capacity/i)
})

test('all six spending routes are wired before their provider boundaries', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  const generationSource = fs.readFileSync(path.join(__dirname, 'routes/generation.js'), 'utf8')
  const meterSource = fs.readFileSync(path.join(__dirname, 'meter.js'), 'utf8')
  const resumeSource = fs.readFileSync(path.join(__dirname, 'read-resume.js'), 'utf8')
  const claimSource = indexSource.match(/async function claimStudy[\s\S]*?\n}\n\nfunction sendClaimRefusal/)?.[0] || ''
  const spendLockSource = meterSource.match(/async function withGlobalSpendLock[\s\S]*?\n}\n\nasync function reserveAsk/)?.[0] || ''

  for (const route of ['analyze', 'quick-study', 'guided-study']) {
    assert.match(generationSource, new RegExp(`modelAdmissionRequest: \\{ id: modelAdmissionId, route: '${route}' \\}`))
  }
  assert.match(indexSource, /modelAdmissionRequest: \{ id: modelAdmissionId, route: 'read' \}/)
  assert.match(indexSource, /readResume\.rideOrResolve\(db, studyId, \{[\s\S]*?route: 'read'/)
  assert.match(indexSource, /modelRoute: 'ask'/)
  assert.match(indexSource, /modelRoute: 'sermon-assist'/)
  assert.ok(claimSource.indexOf("error: 'x-install-id header required'") < claimSource.indexOf('modelAdmission.check'))
  assert.ok(claimSource.indexOf('modelAdmission.check') < claimSource.indexOf('meter.reserveAnonymousStudy'))
  assert.ok(claimSource.indexOf('meter.reserveAnonymousStudy') < claimSource.indexOf('modelAdmission.insert'))
  assert.ok(resumeSource.indexOf('modelAdmission.reserve') < resumeSource.indexOf('holdStudyReservationForReading'))
  assert.ok(meterSource.indexOf('modelAdmission.check') < meterSource.indexOf('INSERT INTO ask_reservation'))
  assert.ok(meterSource.indexOf('INSERT INTO ask_reservation') < meterSource.indexOf('modelAdmission.insert'))
  assert.ok(spendLockSource.indexOf("client.query('BEGIN')") < spendLockSource.indexOf('pg_advisory_xact_lock'))
  assert.ok(spendLockSource.indexOf('pg_advisory_xact_lock') < spendLockSource.indexOf('operation(client)'))
  assert.ok(spendLockSource.indexOf('operation(client)') < spendLockSource.indexOf("client.query('COMMIT')"))
})

test('admission identity follows account lifecycle without blocking deletion', () => {
  const schemaSource = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  const table = schemaSource.match(/CREATE TABLE IF NOT EXISTS model_admission \([\s\S]*?\n\);/)?.[0] || ''
  assert.match(table, /account_id\s+uuid REFERENCES account\(id\) ON DELETE CASCADE/)
  assert.match(table, /provider_slots\s+integer NOT NULL DEFAULT 1 CHECK \(provider_slots BETWEEN 1 AND 3\)/)
  assert.doesNotMatch(table, /ON DELETE SET NULL/)
})
