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

function refundDb({
  balance = 0, topups = [], failLedgerUpdate = false, zeroLedgerUpdate = false,
  noAccount = false, somPaymentIntents = [],
} = {}) {
  const state = {
    balance,
    topups: topups.map((row) => ({ studies_revoked: 0, refunded_at: null, ...row })),
    failures: new Map(),
    transactions: [],
    refundLookups: [],
    failLedgerUpdate,
    zeroLedgerUpdate,
    noAccount,
    somPaymentIntents,
    reasons: [],
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
            const row = (working || state).topups.find((item) => item[column] === params[0])
            return { rows: row ? [{ ...row }] : [] }
          }
          if (sql.includes('FROM account WHERE stripe_customer_id')) {
            if (state.noAccount) return { rows: [] }
            return { rows: [{ id: 'acct_1', topup_studies: working.balance }] }
          }
          if (sql.includes('SELECT 1 FROM som_purchase WHERE payment_intent_id')) {
            return { rows: state.somPaymentIntents.includes(params[0]) ? [{}] : [] }
          }
          if (sql.includes('UPDATE topup SET refunded_at = now() WHERE session_id')) {
            const row = working.topups.find((item) => item.session_id === params[0])
            row.refunded_at = new Date().toISOString()
            return { rowCount: 1, rows: [] }
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
            const ledger = (working || state).failures
            ledger.set(params[0], (ledger.get(params[0]) || 0) + 1)
            state.reasons.push(params[2])
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

const TOPUP_SESSION = { metadata: { source: 'operator-topup' } }

function stripeSessions(sessions = []) {
  const calls = []
  return {
    calls,
    checkout: { sessions: { async list(params) { calls.push(params); return { data: sessions } } } },
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
      eventId: 'evt_early', eventCreated: Math.floor(nowMs / 1000), nowMs, stripeClient: stripeSessions([TOPUP_SESSION]),
    })
  } catch { earlyRejected = true }
  ok('an out-of-order refund rejects for bounded Stripe retry without an alarm row',
    earlyRejected && earlyDb.state.failures.size === 0)
  earlyDb.state.topups.push(topupRow())
  earlyDb.state.balance = 5
  const recovered = await revokeOperatorTopUpRefund(earlyDb, refund, {
    eventId: 'evt_early', eventCreated: Math.floor(nowMs / 1000), nowMs, stripeClient: stripeSessions([TOPUP_SESSION]),
  })
  ok('the retried refund resolves after its Checkout grant appears', recovered && earlyDb.state.balance === 0)

  const expiredDb = refundDb()
  const expired = await revokeOperatorTopUpRefund(expiredDb, refund, {
    eventId: 'evt_expired', eventCreated: Math.floor((nowMs - 25 * 60 * 60 * 1000) / 1000), nowMs,
    stripeClient: stripeSessions([TOPUP_SESSION]),
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

  console.log('\nONLY A REAL TOP-UP MAY HOLD A REFUND OPEN OR RAISE AN ALARM')
  const inWindow = { eventCreated: Math.floor(nowMs / 1000), nowMs }
  const pastWindow = { eventCreated: Math.floor((nowMs - 25 * 60 * 60 * 1000) / 1000), nowMs }

  const subscriptionDb = refundDb()
  const subscriptionStripe = stripeSessions()
  let subscriptionError = null
  let subscriptionResult
  try {
    subscriptionResult = await revokeOperatorTopUpRefund(subscriptionDb,
      { ...refund, payment_intent: 'pi_invoice', invoice: 'in_renewal' },
      { ...inWindow, eventId: 'evt_sub_refund', stripeClient: subscriptionStripe })
  } catch (error) { subscriptionError = error }
  ok('a refunded subscription invoice resolves at once instead of holding the webhook open',
    subscriptionError === null && subscriptionResult === false, subscriptionError?.message)
  ok('...raises no reconciliation alarm', subscriptionDb.state.failures.size === 0)
  ok('...and needs no Stripe lookup', subscriptionStripe.calls.length === 0)

  const somDb = refundDb({ somPaymentIntents: ['pi_som'] })
  const somStripe = stripeSessions()
  let somError = null
  try {
    await revokeOperatorTopUpRefund(somDb, { ...refund, payment_intent: 'pi_som' },
      { ...inWindow, eventId: 'evt_som_refund', stripeClient: somStripe })
  } catch (error) { somError = error }
  ok('a refunded SOM ebook resolves at once without an alarm or a Stripe lookup',
    somError === null && somDb.state.failures.size === 0 && somStripe.calls.length === 0, somError?.message)

  const foreignDb = refundDb()
  const foreignStripe = stripeSessions([{ metadata: { source: 'som-digital-early-access' } }])
  let foreignError = null
  try {
    await revokeOperatorTopUpRefund(foreignDb, { ...refund, payment_intent: 'pi_foreign' },
      { ...inWindow, eventId: 'evt_foreign_refund', stripeClient: foreignStripe })
  } catch (error) { foreignError = error }
  ok('a refund Stripe says was not a top-up resolves without an alarm',
    foreignError === null && foreignDb.state.failures.size === 0, foreignError?.message)
  ok('...after asking Stripe by its PaymentIntent',
    isDeepStrictEqual(foreignStripe.calls, [{ payment_intent: 'pi_foreign', limit: 1 }]))

  const manualDb = refundDb()
  const manual = await revokeOperatorTopUpRefund(manualDb, { ...refund, payment_intent: 'pi_manual' },
    { ...pastWindow, eventId: 'evt_manual_refund', stripeClient: stripeSessions() })
  ok('a charge with no Checkout Session is never reported as a lost top-up, even past the window',
    manual === false && manualDb.state.failures.size === 0)

  const markedDb = refundDb()
  const markedStripe = stripeSessions()
  let markedRejected = false
  try {
    await revokeOperatorTopUpRefund(markedDb,
      { ...refund, payment_intent: 'pi_marked', metadata: { source: 'operator-topup' } },
      { ...inWindow, eventId: 'evt_marked_refund', stripeClient: markedStripe })
  } catch { markedRejected = true }
  ok('a charge marked as a top-up still waits for its grant, without a Stripe lookup',
    markedRejected && markedStripe.calls.length === 0 && markedDb.state.failures.size === 0)

  console.log('\nA REFUND FOR A DELETED ACCOUNT CLOSES INSTEAD OF RETRYING FOR DAYS')
  const deletedDb = refundDb({ topups: [topupRow()], noAccount: true })
  let deletedError = null
  let deletedResult
  try {
    deletedResult = await revokeOperatorTopUpRefund(deletedDb, refund, { ...inWindow, eventId: 'evt_deleted' })
  } catch (error) { deletedError = error }
  ok('the refund acknowledges instead of throwing', deletedError === null && deletedResult === false, deletedError?.message)
  ok('the grant is closed so a redelivery is a no-op',
    Boolean(deletedDb.state.topups[0].refunded_at) && deletedDb.state.topups[0].studies_revoked === 0)
  ok('a durable alarm row names the reason',
    deletedDb.state.failures.get('evt_deleted') === 1 && deletedDb.state.reasons.includes('refund-account-deleted'))
  ok('it commits in one transaction', isDeepStrictEqual(deletedDb.state.transactions, ['BEGIN', 'COMMIT']))
  const deletedReplay = await revokeOperatorTopUpRefund(deletedDb, refund, { ...inWindow, eventId: 'evt_deleted' })
  ok('a redelivery of that refund is a quiet no-op', deletedReplay === false && deletedDb.state.failures.get('evt_deleted') === 1)

  console.log('\nTHE WEBHOOK ACKNOWLEDGES A SUBSCRIPTION REFUND')
  const webhookDb = refundDb()
  webhookDb.query = async (sql) => {
    if (/UPDATE som_purchase/.test(sql)) return { rowCount: 0, rows: [] }
    if (/SELECT id FROM account WHERE stripe_customer_id/.test(sql)) return { rows: [] }
    throw new Error(`unexpected webhook query: ${sql}`)
  }
  let webhookError = null
  try {
    await handleWebhookEvent(webhookDb, {
      id: 'evt_webhook_sub_refund', created: Math.floor(nowMs / 1000), type: 'charge.refunded',
      data: { object: {
        object: 'charge', id: 'ch_sub', customer: 'cus_paid', refunded: true,
        payment_intent: 'pi_sub_renewal', invoice: 'in_sub_renewal',
      } },
    }, {
      subscriptions: { async list() { return { data: [], has_more: false } } },
      checkout: { sessions: { async list() { throw new Error('no Checkout lookup expected') } } },
    })
  } catch (error) { webhookError = error }
  ok('a subscription refund no longer fails the webhook', webhookError === null, webhookError?.message)
  ok('...and raises no alarm', webhookDb.state.failures.size === 0)

  console.log('\nA KEY THAT MAY NOT READ CHECKOUT SESSIONS LEAVES A RECORD')
  const { errors: stripeErrors } = require('stripe')
  const unreadableDb = refundDb()
  let unreadableError = null
  let unreadableResult
  try {
    unreadableResult = await revokeOperatorTopUpRefund(unreadableDb, { ...refund, payment_intent: 'pi_unreadable' }, {
      ...inWindow,
      eventId: 'evt_unreadable_refund',
      stripeClient: { checkout: { sessions: { async list() {
        throw new stripeErrors.StripePermissionError({ message: 'denied', statusCode: 403 })
      } } } },
    })
  } catch (error) { unreadableError = error }
  ok('a refund the key cannot classify acknowledges instead of failing for days',
    unreadableError === null && unreadableResult === false, unreadableError?.message)
  ok('...and is recorded for a person', unreadableDb.state.failures.get('evt_unreadable_refund') === 1 &&
    unreadableDb.state.reasons.includes('refund-classify-not-permitted'))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
