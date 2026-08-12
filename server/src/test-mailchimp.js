const test = require('node:test')
const assert = require('node:assert/strict')

const {
  marketingMemberPayload,
  processMarketingDeletionOutbox,
  recoverStaleAccountDeletions,
  stageMarketingDeletion,
  stageMarketingSync,
  subscriberHash,
  syncMarketingContact,
} = require('./mailchimp')

test('marketing opt-in requires Mailchimp confirmation instead of subscribing an unverified email', () => {
  assert.deepEqual(marketingMemberPayload(' Pastor@Example.com '), {
    email_address: 'pastor@example.com',
    status_if_new: 'pending',
  })
})

function outboxDb({ action = 'archive' } = {}) {
  const hash = subscriberHash('pastor@example.com')
  const state = {
    job: { id: 1, subscriber_hash: hash },
    lastError: null,
    deleted: false,
    recoveredMarkers: 0,
  }
  return {
    hash,
    state,
    db: {
      async query(sql, params = []) {
        if (/UPDATE account/.test(sql) && /deleting_at = NULL/.test(sql)) {
          state.recoveredMarkers += 1
          return { rows: [], rowCount: 1 }
        }
        if (/WITH due AS/.test(sql)) return { rows: state.deleted ? [] : [state.job] }
        if (/UPDATE marketing_deletion_outbox/.test(sql) && /last_error/.test(sql)) {
          state.lastError = params[1]
          return { rows: [], rowCount: 1 }
        }
        throw new Error(`Unhandled pool SQL: ${sql}`)
      },
      async connect() {
        let pendingDelete = false
        return {
          async query(sql) {
            if (sql === 'BEGIN') return { rows: [] }
            if (sql === 'COMMIT') {
              if (pendingDelete) state.deleted = true
              return { rows: [] }
            }
            if (sql === 'ROLLBACK') {
              pendingDelete = false
              return { rows: [] }
            }
            if (/pg_advisory_xact_lock/.test(sql)) return { rows: [{}] }
            if (/SELECT action, intent_id/.test(sql)) return { rows: action ? [{ action, intent_id: 'intent-current' }] : [] }
            if (/INSERT INTO marketing_contact_state/.test(sql)) return { rows: [], rowCount: 1 }
            if (/DELETE FROM marketing_deletion_outbox/.test(sql)) {
              pendingDelete = true
              return { rows: [], rowCount: 1 }
            }
            throw new Error(`Unhandled client SQL: ${sql}`)
          },
          release() {},
        }
      },
    },
  }
}

test('marketing intents take the same durable subscriber lock and supersede old work', async () => {
  const statements = []
  const transaction = {
    async query(sql, params = []) {
      statements.push({ sql, params })
      return { rows: [], rowCount: 1 }
    },
  }
  const hash = subscriberHash('pastor@example.com')

  await stageMarketingSync(transaction, 'pastor@example.com', 'intent-sync')
  await stageMarketingDeletion(transaction, 'pastor@example.com', 'intent-archive')

  assert.equal(statements.filter(({ sql }) => /pg_advisory_xact_lock/.test(sql)).length, 2)
  assert.deepEqual(statements.filter(({ sql }) => /INSERT INTO marketing_contact_state/.test(sql)).map(({ params }) => params), [
    [hash, 'sync', 'intent-sync'],
    [hash, 'archive', 'intent-archive'],
  ])
  assert.equal(statements.some(({ sql }) => /DELETE FROM marketing_deletion_outbox/.test(sql)), true)
  assert.equal(statements.some(({ sql }) => /INSERT INTO marketing_deletion_outbox/.test(sql)), true)
})

test('a delayed registration sync cannot overwrite a newer deletion tombstone', async () => {
  const original = {
    key: process.env.MAILCHIMP_API_KEY,
    audience: process.env.MAILCHIMP_AUDIENCE_ID,
    fetch: global.fetch,
  }
  process.env.MAILCHIMP_API_KEY = 'test-key-us21'
  process.env.MAILCHIMP_AUDIENCE_ID = 'audience-test'
  let fetchCalls = 0
  global.fetch = async () => {
    fetchCalls += 1
    throw new Error('superseded sync must not reach Mailchimp')
  }
  const client = {
    async query(sql) {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] }
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [{}] }
      if (/SELECT action, intent_id/.test(sql)) return { rows: [{ action: 'archive', intent_id: 'delete-newer' }] }
      throw new Error(`Unhandled sync SQL: ${sql}`)
    },
    release() {},
  }

  try {
    const result = await syncMarketingContact(
      { async connect() { return client } },
      'pastor@example.com',
      { intentId: 'signup-older' },
    )
    assert.equal(result.synced, false)
    assert.equal(result.superseded, true)
    assert.equal(fetchCalls, 0)
  } finally {
    if (original.key === undefined) delete process.env.MAILCHIMP_API_KEY
    else process.env.MAILCHIMP_API_KEY = original.key
    if (original.audience === undefined) delete process.env.MAILCHIMP_AUDIENCE_ID
    else process.env.MAILCHIMP_AUDIENCE_ID = original.audience
    global.fetch = original.fetch
  }
})

test('the deletion outbox retries a provider failure without retaining the email', async () => {
  const { db, hash, state } = outboxDb()

  const failed = await processMarketingDeletionOutbox(db, {
    archive: async () => { throw new Error('provider unavailable') },
  })
  assert.deepEqual(failed, { claimed: 1, completed: 0 })
  assert.equal(state.deleted, false)
  assert.equal(state.lastError, 'provider unavailable')
  assert.equal(JSON.stringify(state).includes('pastor@example.com'), false)

  const recovered = await processMarketingDeletionOutbox(db, {
    archive: async (value) => {
      assert.equal(value, hash)
      return { configured: true, ok: true }
    },
  })
  assert.deepEqual(recovered, { claimed: 1, completed: 1 })
  assert.equal(state.deleted, true)
})

test('a new explicit opt-in invalidates a stale deletion job before it can archive', async () => {
  const { db, state } = outboxDb({ action: 'sync' })
  let archiveCalls = 0

  const result = await processMarketingDeletionOutbox(db, {
    archive: async () => {
      archiveCalls += 1
      return { configured: true, ok: true }
    },
  })

  assert.deepEqual(result, { claimed: 1, completed: 1 })
  assert.equal(archiveCalls, 0)
  assert.equal(state.deleted, true)
})

test('the scheduled lifecycle sweep releases only abandoned committed deletion markers', async () => {
  const statements = []
  const db = {
    async query(sql, params) {
      statements.push({ sql, params })
      return { rows: [], rowCount: 2 }
    },
  }

  assert.equal(await recoverStaleAccountDeletions(db, { leaseMinutes: 15 }), 2)
  assert.match(statements[0].sql, /deleting_at < now\(\) - make_interval/)
  assert.deepEqual(statements[0].params, [15])
})

test('the existing outbox scheduler recovers a crash marker even with no marketing job', async () => {
  let markerSweeps = 0
  const db = {
    async query(sql) {
      if (/UPDATE account/.test(sql) && /deleting_at = NULL/.test(sql)) {
        markerSweeps += 1
        return { rows: [], rowCount: 1 }
      }
      if (/WITH due AS/.test(sql)) return { rows: [] }
      throw new Error(`Unhandled empty scheduler SQL: ${sql}`)
    },
  }

  assert.deepEqual(await processMarketingDeletionOutbox(db), { claimed: 0, completed: 0 })
  assert.equal(markerSweeps, 1)
})
