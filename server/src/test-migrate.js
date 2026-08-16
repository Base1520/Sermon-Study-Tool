const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const migratePath = require.resolve('./migrate')
const migrateSource = fs.readFileSync(migratePath, 'utf8')

function remediationLogs(logs) {
  return logs.filter((line) => (
    line.includes('remediated leaked-code grants')
      || line.includes('minted from leaked codes')
  ))
}

async function runMigration({ devicesRevoked, accountsDowngraded }) {
  const pendingResults = [
    { rows: [{ account_table: null }] },
    { rows: [] },
    { rows: [], rowCount: 0 },
    { rows: [
      { account_id: 'historical-account-1' },
      { account_id: 'historical-account-2' },
      { account_id: 'historical-account-3' },
    ] },
    { rows: [], rowCount: devicesRevoked },
    { rows: [], rowCount: accountsDowngraded },
  ]
  const queries = []
  const logs = []
  const errors = []
  let ended = false

  class FakePool {
    async query(sql, params = []) {
      queries.push({ sql, params })
      assert.ok(pendingResults.length, `unexpected migration query: ${String(sql).slice(0, 80)}`)
      return pendingResults.shift()
    }

    async end() {
      ended = true
    }
  }

  const completion = vm.runInNewContext(migrateSource, {
    __dirname: path.dirname(migratePath),
    console: {
      log: (...args) => logs.push(args.join(' ')),
      error: (...args) => errors.push(args.join(' ')),
    },
    process: {
      env: {},
      exit: (code) => { throw new Error(`migration unexpectedly exited ${code}`) },
    },
    require: (specifier) => {
      if (specifier === 'fs') return { readFileSync: () => '-- schema fixture' }
      if (specifier === 'path') return path
      if (specifier === 'pg') return { Pool: FakePool }
      throw new Error(`unexpected migration dependency: ${specifier}`)
    },
  }, { filename: migratePath })

  await completion
  assert.equal(ended, true)
  assert.equal(pendingResults.length, 0)
  assert.deepEqual(errors, [])
  assert.equal(queries.length, 6)
  assert.match(queries[4].sql, /UPDATE device SET revoked_at/)
  assert.match(queries[5].sql, /UPDATE account SET plan = 'free'/)
  assert.equal(queries[4].params[0].length, 3)
  assert.equal(queries[4].params[0], queries[5].params[0])

  return logs
}

test('a no-op leaked-code reconciliation emits no recurring security event', async () => {
  const logs = await runMigration({ devicesRevoked: 0, accountsDowngraded: 0 })
  assert.deepEqual(remediationLogs(logs), [])
})

test('leaked-code reconciliation reports only rows actually changed', async () => {
  const logs = await runMigration({ devicesRevoked: 2, accountsDowngraded: 1 })
  assert.deepEqual(remediationLogs(logs), [
    'remediated leaked-code grants accounts_downgraded=1 devices_revoked=2',
  ])
})
