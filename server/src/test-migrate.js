const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const migratePath = require.resolve('./migrate')
const migrateSource = fs.readFileSync(migratePath, 'utf8')
const schemaFixture = '-- schema fixture'
const schemaHash = 'a'.repeat(64)
const schemaVersion = 'operator-test-schema-v1'

function remediationLogs(logs) {
  return logs.filter((line) => (
    line.includes('remediated leaked-code grants')
      || line.includes('minted from leaked codes')
  ))
}

async function runMigration({
  devicesRevoked = 0,
  accountsDowngraded = 0,
  appliedHash = null,
} = {}) {
  const queries = []
  const logs = []
  const errors = []
  let ended = false
  let released = false
  let exitCode = null

  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params })
      if (/^BEGIN$/.test(sql)) return { rows: [], rowCount: 0 }
      if (/^SET LOCAL /.test(sql)) return { rows: [], rowCount: 0 }
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [], rowCount: 1 }
      if (/CREATE TABLE IF NOT EXISTS schema_migration/.test(sql)) return { rows: [], rowCount: 0 }
      if (/SELECT schema_sha256 FROM schema_migration/.test(sql)) {
        return { rows: appliedHash ? [{ schema_sha256: appliedHash }] : [], rowCount: appliedHash ? 1 : 0 }
      }
      if (/to_regclass\('public\.account'\)/.test(sql)) return { rows: [{ account_table: null }] }
      if (sql === schemaFixture) return { rows: [], rowCount: 0 }
      if (/INSERT INTO schema_migration/.test(sql)) return { rows: [], rowCount: 1 }
      if (/UPDATE access_code SET revoked_at/.test(sql)) return { rows: [], rowCount: 0 }
      if (/SELECT DISTINCT account_id FROM access_code_use/.test(sql)) {
        return { rows: [
          { account_id: 'historical-account-1' },
          { account_id: 'historical-account-2' },
          { account_id: 'historical-account-3' },
        ] }
      }
      if (/UPDATE device SET revoked_at/.test(sql)) return { rows: [], rowCount: devicesRevoked }
      if (/UPDATE account SET plan = 'free'/.test(sql)) return { rows: [], rowCount: accountsDowngraded }
      if (/^COMMIT$/.test(sql) || /^ROLLBACK$/.test(sql)) return { rows: [], rowCount: 0 }
      throw new Error(`unexpected migration query: ${String(sql).slice(0, 80)}`)
    },
    release() {
      released = true
    },
  }

  class FakePool {
    async connect() {
      return client
    }

    async end() {
      ended = true
    }
  }

  const completion = vm.runInNewContext(migrateSource, {
    console: {
      log: (...args) => logs.push(args.join(' ')),
      error: (...args) => errors.push(args.join(' ')),
    },
    process: {
      env: {},
      exit: (code) => { exitCode = code },
    },
    require: (specifier) => {
      if (specifier === 'pg') return { Pool: FakePool }
      if (specifier === './schema-version') {
        return {
          SCHEMA_VERSION: schemaVersion,
          readSchemaSql: () => schemaFixture,
          schemaSha256: () => schemaHash,
        }
      }
      throw new Error(`unexpected migration dependency: ${specifier}`)
    },
  }, { filename: migratePath })

  await completion
  assert.equal(ended, true)
  assert.equal(released, true)
  return { queries, logs, errors, exitCode }
}

test('the migration is one advisory-locked transaction with exact schema identity', async () => {
  const result = await runMigration()
  assert.equal(result.exitCode, null)
  assert.deepEqual(result.errors, [])
  assert.equal(result.queries[0].sql, 'BEGIN')
  assert.deepEqual(result.queries.slice(1, 4).map((query) => query.sql), [
    "SET LOCAL lock_timeout = '5s'",
    "SET LOCAL statement_timeout = '120s'",
    "SET LOCAL idle_in_transaction_session_timeout = '120s'",
  ])
  assert.match(result.queries[4].sql, /pg_advisory_xact_lock/)
  assert.equal(result.queries.at(-1).sql, 'COMMIT')
  const schemaWrite = result.queries.findIndex((query) => query.sql === schemaFixture)
  const identityWrite = result.queries.findIndex((query) => /INSERT INTO schema_migration/.test(query.sql))
  assert.ok(schemaWrite > 0)
  assert.ok(identityWrite > schemaWrite)
  assert.deepEqual(Array.from(result.queries[identityWrite].params), [schemaVersion, schemaHash])
  assert.match(result.logs.at(-1), new RegExp(`schema applied \\(${schemaVersion} ${schemaHash.slice(0, 12)}\\)`))
})

test('an exact applied schema skips replaying schema DDL while still running deploy reconciliation', async () => {
  const result = await runMigration({ appliedHash: schemaHash })
  assert.equal(result.exitCode, null)
  assert.equal(result.queries.some((query) => query.sql === schemaFixture), false)
  assert.equal(result.queries.some((query) => /INSERT INTO schema_migration/.test(query.sql)), false)
  assert.equal(result.queries.some((query) => /UPDATE access_code SET revoked_at/.test(query.sql)), true)
  assert.match(result.logs.at(-1), new RegExp(`schema verified \\(${schemaVersion} ${schemaHash.slice(0, 12)}\\)`))
})

test('a no-op leaked-code reconciliation emits no recurring security event', async () => {
  const { logs } = await runMigration({ devicesRevoked: 0, accountsDowngraded: 0 })
  assert.deepEqual(remediationLogs(logs), [])
})

test('leaked-code reconciliation reports only rows actually changed', async () => {
  const { logs } = await runMigration({ devicesRevoked: 2, accountsDowngraded: 1 })
  assert.deepEqual(remediationLogs(logs), [
    'remediated leaked-code grants accounts_downgraded=1 devices_revoked=2',
  ])
})

test('schema drift under an existing version rolls back before schema application', async () => {
  const result = await runMigration({ appliedHash: 'b'.repeat(64) })
  assert.equal(result.exitCode, 1)
  assert.equal(result.queries.at(-1).sql, 'ROLLBACK')
  assert.equal(result.queries.some((query) => query.sql === schemaFixture), false)
  assert.match(result.errors.at(-1), /changed without a version bump/)
})
