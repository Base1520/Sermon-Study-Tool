process.env.STRIPE_SECRET_KEY ||= 'sk_test_placeholder'
const { isDeepStrictEqual } = require('node:util')
const { creditTopUp, handleWebhookEvent, revokeOperatorTopUpRefund } = require('./stripe')
const { TOPUP } = require('./entitlement')

let pass = 0
let fail = 0
function ok(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`  ok   ${name}`) }
  else { fail += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

function transactionDb({ customers = ['cus_paid'], failNextCredit = false } = {}) {
  const state = {
    topups: new Set(),
    balances: new Map(customers.map((id) => [id, 0])),
    transactions: [],
    failNextCredit,
  }
  let tail = Promise.resolve()
  return {
    state,
    async connect() {
      let stagedSession = null
      let stagedCredit = null
      let unlock = null
      return {
        async query(sql, params = []) {
          if (sql === 'BEGIN') {
            const prior = tail
            tail = new Promise((resolve) => { unlock = resolve })
            await prior
            state.transactions.push('BEGIN')
            return { rowCount: null, rows: [] }
          }
          if (sql === 'COMMIT') {
            if (stagedSession) state.topups.add(stagedSession)
            if (stagedCredit) state.balances.set(stagedCredit.customer, stagedCredit.balance)
            state.transactions.push('COMMIT')
            unlock?.()
            return { rowCount: null, rows: [] }
          }
          if (sql === 'ROLLBACK') {
            stagedSession = null
            stagedCredit = null
            state.transactions.push('ROLLBACK')
            unlock?.()
            return { rowCount: null, rows: [] }
          }
          if (sql.includes('INSERT INTO topup')) {
            if (state.topups.has(params[0])) return { rowCount: 0, rows: [] }
            stagedSession = params[0]
            return { rowCount: 1, rows: [] }
          }
          if (sql.includes('UPDATE account SET topup_studies')) {
            if (state.failNextCredit) {
              state.failNextCredit = false
              throw new Error('simulated account write failure')
            }
            if (!state.balances.has(params[0])) return { rowCount: 0, rows: [] }
            stagedCredit = { customer: params[0], balance: state.balances.get(params[0]) + params[1] }
            return { rowCount: 1, rows: [] }
          }
          throw new Error(`unexpected top-up test query: ${sql}`)
        },
        release() {},
      }
    },
  }
}

function session(overrides = {}) {
  return {
    id: 'cs_topup', customer: 'cus_paid', mode: 'payment', payment_status: 'paid',
    payment_intent: 'pi_topup', amount_total: 1500, currency: 'usd',
    metadata: { source: 'operator-topup' }, ...overrides,
  }
}

function event(type, object) {
  return { type, data: { object } }
}

function refundDb({ balance = 0, topups = [], failLedgerUpdate = false, zeroLedgerUpdate = false } = {}) {
  const state = {
    balance,
    topups: topups.map((row) => ({ studies_revoked: 0, refunded_at: null, ...row })),
    failures: new Map(),
    transactions: [],
    refundLookups: [],
    failLedgerUpdate,
    zeroLedgerUpdate,
  }
  return {
    state,
    async connect() {
      let working = null
      return {
        async query(sql, params = []) {
          if (sql === 'BEGIN') {
            state.transactions.push('BEGIN')
            working = {
              balance: state.balance,
              topups: state.topups.map((row) => ({ ...row })),
              failures: new Map(state.failures),
            }
            return { rows: [] }
          }
          if (sql === 'COMMIT') {
            state.balance = working.balance
            state.topups = working.topups
            state.failures = working.failures
            working = null
            state.transactions.push('COMMIT')
            return { rows: [] }
          }
          if (sql === 'ROLLBACK') {
            working = null
            state.transactions.push('ROLLBACK')
            return { rows: [] }
          }
          if (sql.includes('FROM topup WHERE')) {
            const column = sql.includes('payment_intent_id = $1')
              ? 'payment_intent_id'
              : sql.includes('stripe_customer_id = $1') ? 'stripe_customer_id' : 'unknown'
            state.refundLookups.push({ column, value: params[0] })
            const row = working.topups.find((item) => item[column] === params[0])
            return { rows: row ? [{ ...row }] : [] }
          }
          if (sql.includes('FROM account WHERE stripe_customer_id')) {
            return { rows: [{ id: 'acct_1', topup_studies: working.balance }] }
          }
          if (sql.includes('UPDATE account SET topup_studies = topup_studies -')) {
            working.balance -= params[1]
            return { rowCount: 1, rows: [] }
          }
          if (sql.includes('UPDATE topup') && sql.includes('studies_revoked')) {
            if (state.failLedgerUpdate) throw new Error('simulated refund ledger failure')
            if (state.zeroLedgerUpdate) return { rowCount: 0, rows: [] }
            const row = working.topups.find((item) => item.session_id === params[0])
            row.studies_revoked += params[1]
            row.refunded_at = new Date().toISOString()
            return { rowCount: 1, rows: [] }
          }
          if (sql.includes('INSERT INTO topup_reconciliation_failure')) {
            const prior = working.failures.get(params[0]) || 0
            working.failures.set(params[0], prior + 1)
            return { rowCount: 1, rows: [] }
          }
          throw new Error(`unexpected refund test query: ${sql}`)
        },
        release() {},
      }
    },
  }
}

function topupRow(overrides = {}) {
  return {
    session_id: 'cs_refund', stripe_customer_id: 'cus_paid', payment_intent_id: 'pi_refund',
    studies: TOPUP.studies, ...overrides,
  }
}

;(async () => {
  console.log('\nTOP-UP GRANTS ARE ATOMIC, RETRYABLE, AND IDEMPOTENT')
  const unlinkedDb = transactionDb()
  let unlinkedRejected = false
  try { await creditTopUp(unlinkedDb, session({ payment_intent: null })) } catch { unlinkedRejected = true }
  ok('a grant without a PaymentIntent fails before opening a transaction',
    unlinkedRejected && unlinkedDb.state.transactions.length === 0 && unlinkedDb.state.topups.size === 0)

  const successDb = transactionDb()
  await creditTopUp(successDb, session({ id: 'cs_success' }))
  ok('a successful credit has one explicit transaction boundary',
    isDeepStrictEqual(successDb.state.transactions, ['BEGIN', 'COMMIT']))

  const failureDb = transactionDb({ failNextCredit: true })
  let firstFailed = false
  try { await creditTopUp(failureDb, session()) } catch { firstFailed = true }
  ok('an account-write failure rejects', firstFailed)
  ok('a failed account write leaves neither half committed',
    failureDb.state.topups.size === 0 && failureDb.state.balances.get('cus_paid') === 0)
  const retryGranted = await creditTopUp(failureDb, session())
  ok('the same Checkout Session remains retryable after rollback',
    retryGranted === true && failureDb.state.topups.has('cs_topup') &&
      failureDb.state.balances.get('cus_paid') === TOPUP.studies)
  ok('failed then retried credit has explicit rollback and commit boundaries',
    isDeepStrictEqual(failureDb.state.transactions, ['BEGIN', 'ROLLBACK', 'BEGIN', 'COMMIT']))

  const missingDb = transactionDb({ customers: [] })
  const originalLog = console.log
  const logs = []
  console.log = (...args) => logs.push(args.join(' '))
  let missingRejected = false
  try { await creditTopUp(missingDb, session({ customer: 'cus_missing' })) } catch { missingRejected = true }
  console.log = originalLog
  ok('a zero-row account match fails loudly', missingRejected)
  ok('a zero-row account match remains retryable', missingDb.state.topups.size === 0)
  ok('a zero-row account match never logs success', !logs.some((line) => line.includes('credited')))
  ok('a zero-row account match explicitly rolls back its transaction',
    isDeepStrictEqual(missingDb.state.transactions, ['BEGIN', 'ROLLBACK']))

  const concurrentDb = transactionDb()
  const concurrent = await Promise.all([
    creditTopUp(concurrentDb, session()),
    creditTopUp(concurrentDb, session()),
  ])
  ok('concurrent duplicate delivery grants exactly once',
    concurrent.filter(Boolean).length === 1 &&
      concurrentDb.state.topups.size === 1 &&
      concurrentDb.state.balances.get('cus_paid') === TOPUP.studies)
  ok('the winning delivery commits and the replay closes without a second commit',
    isDeepStrictEqual(concurrentDb.state.transactions, ['BEGIN', 'COMMIT', 'BEGIN', 'ROLLBACK']))

  console.log('\nTOP-UP WEBHOOKS REQUIRE PAID STATE AND HANDLE DELAYED PAYMENT')
  const immediateDb = transactionDb({ customers: [null] })
  await handleWebhookEvent(immediateDb, event('checkout.session.completed', session({ customer: null, payment_status: 'unpaid' })))
  ok('an unpaid completion grants nothing', immediateDb.state.topups.size === 0)
  await handleWebhookEvent(immediateDb, event('checkout.session.completed', session({ customer: null })))
  await handleWebhookEvent(immediateDb, event('checkout.session.completed', session({ customer: null })))
  ok('a paid completion and its replay grant exactly once',
    immediateDb.state.topups.size === 1 && immediateDb.state.balances.get(null) === TOPUP.studies)

  const delayedDb = transactionDb({ customers: [null] })
  const delayed = session({ id: 'cs_delayed', customer: null, payment_status: 'unpaid' })
  await handleWebhookEvent(delayedDb, event('checkout.session.completed', delayed))
  await handleWebhookEvent(delayedDb, event('checkout.session.async_payment_succeeded', {
    ...delayed, payment_status: 'paid', customer: null,
  }))
  await handleWebhookEvent(delayedDb, event('checkout.session.async_payment_succeeded', {
    ...delayed, payment_status: 'paid', customer: null,
  }))
  ok('later async success grants exactly once',
    delayedDb.state.topups.size === 1 && delayedDb.state.balances.get(null) === TOPUP.studies)

  console.log('\nFULL TOP-UP REFUNDS REVOKE ONLY THE LINKED UNUSED BALANCE ONCE')
  const refund = { payment_intent: 'pi_refund', customer: 'cus_paid', refunded: true }
  const fullDb = refundDb({ balance: 8, topups: [topupRow()] })
  const firstRefund = await revokeOperatorTopUpRefund(fullDb, refund)
  const replayRefund = await revokeOperatorTopUpRefund(fullDb, refund)
  ok('a full refund revokes only currently unused studies',
    firstRefund && fullDb.state.balance === 0 && fullDb.state.topups[0].studies_revoked === 8)
  ok('refund lookup is bound only to the Charge PaymentIntent',
    isDeepStrictEqual(fullDb.state.refundLookups, [
      { column: 'payment_intent_id', value: 'pi_refund' },
      { column: 'payment_intent_id', value: 'pi_refund' },
    ]))
  ok('replaying a full refund performs no second debit', !replayRefund && fullDb.state.balance === 0)
  ok('a refund commits once and its replay explicitly rolls back',
    isDeepStrictEqual(fullDb.state.transactions, ['BEGIN', 'COMMIT', 'BEGIN', 'ROLLBACK']))

  const partialDb = refundDb({ balance: 15, topups: [topupRow()] })
  const partial = await revokeOperatorTopUpRefund(partialDb, { ...refund, refunded: false })
  ok('a partial refund performs no debit', !partial && partialDb.state.balance === 15)

  const multipleDb = refundDb({ balance: 20, topups: [
    topupRow({ session_id: 'cs_other', payment_intent_id: 'pi_other', studies: 4 }),
    topupRow({ session_id: 'cs_match', studies: 6 }),
  ] })
  await revokeOperatorTopUpRefund(multipleDb, refund)
  ok('multiple top-ups reverse only the matching PaymentIntent',
    multipleDb.state.balance === 14 && multipleDb.state.topups[0].studies_revoked === 0 &&
      multipleDb.state.topups[1].studies_revoked === 6)

  const consumedDb = refundDb({ balance: 0, topups: [topupRow()] })
  await revokeOperatorTopUpRefund(consumedDb, refund)
  ok('a consumed balance never becomes negative', consumedDb.state.balance === 0)

  const nowMs = Date.now()
  const earlyDb = refundDb()
  let earlyRejected = false
  try {
    await revokeOperatorTopUpRefund(earlyDb, refund, {
      eventId: 'evt_early', eventCreated: Math.floor(nowMs / 1000), nowMs,
    })
  } catch { earlyRejected = true }
  ok('an out-of-order refund rejects for bounded Stripe retry without an alarm row',
    earlyRejected && earlyDb.state.failures.size === 0)
  earlyDb.state.topups.push(topupRow())
  earlyDb.state.balance = 5
  const recovered = await revokeOperatorTopUpRefund(earlyDb, refund, {
    eventId: 'evt_early', eventCreated: Math.floor(nowMs / 1000), nowMs,
  })
  ok('the retried refund resolves after its Checkout grant appears', recovered && earlyDb.state.balance === 0)

  const expiredDb = refundDb()
  const expired = await revokeOperatorTopUpRefund(expiredDb, refund, {
    eventId: 'evt_expired', eventCreated: Math.floor((nowMs - 25 * 60 * 60 * 1000) / 1000), nowMs,
  })
  ok('an unmatched refund becomes a durable reconciliation failure after the retry window',
    !expired && expiredDb.state.failures.get('evt_expired') === 1)

  const rollbackDb = refundDb({ balance: 7, topups: [topupRow()], failLedgerUpdate: true })
  let refundWriteFailed = false
  try { await revokeOperatorTopUpRefund(rollbackDb, refund) } catch { refundWriteFailed = true }
  ok('a refund ledger failure rolls back its account debit',
    refundWriteFailed && rollbackDb.state.balance === 7 && rollbackDb.state.topups[0].studies_revoked === 0 &&
      isDeepStrictEqual(rollbackDb.state.transactions, ['BEGIN', 'ROLLBACK']))

  const zeroLedgerDb = refundDb({ balance: 7, topups: [topupRow()], zeroLedgerUpdate: true })
  let zeroLedgerRejected = false
  try { await revokeOperatorTopUpRefund(zeroLedgerDb, refund) } catch { zeroLedgerRejected = true }
  ok('a zero-row refund ledger update rolls back its account debit',
    zeroLedgerRejected && zeroLedgerDb.state.balance === 7 && zeroLedgerDb.state.topups[0].refunded_at === null &&
      isDeepStrictEqual(zeroLedgerDb.state.transactions, ['BEGIN', 'ROLLBACK']))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
