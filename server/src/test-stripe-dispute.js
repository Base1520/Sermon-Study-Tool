// Chargeback handling. No network and no Stripe account — every Stripe call is a fake.
//
// A dispute takes the money back without ever emitting charge.refunded, so it
// needs its own reversal: unspent top-up studies, the ebook download, and a live
// subscription that would otherwise go on billing someone who already disputed.
//
//   node server/src/test-stripe-dispute.js

process.env.STRIPE_SECRET_KEY ||= 'sk_test_placeholder'
process.env.STRIPE_PRICE_STARTER = 'price_starter'

const { isDeepStrictEqual } = require('node:util')
const { handleChargeDispute, handleWebhookEvent } = require('./stripe')
const { TOPUP } = require('./entitlement')

let pass = 0
let fail = 0
function ok(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`  ok   ${name}`) }
  else { fail += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// What a database would execute: SQL comments are not code.
const sqlCode = (sql) => sql.replace(/--.*$/gm, '')

function disputeDb({ som = null, topup = null, balance = 0 } = {}) {
  const state = {
    som: som ? { status: 'paid', ...som } : null,
    topup: topup ? { studies_revoked: 0, refunded_at: null, ...topup } : null,
    balance,
    failures: new Map(),
    transactions: [],
  }
  async function query(sql, params = []) {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      state.transactions.push(sql)
      return { rows: [] }
    }
    // The status guards come from the statement's own WHERE clause, so a lost guard
    // in the real SQL changes the outcome here instead of being quietly re-supplied.
    if (/UPDATE som_purchase/.test(sql) && /SET status = 'disputed'/.test(sql)) {
      const guarded = /AND status = 'paid'/.test(sqlCode(sql))
      if (state.som?.payment_intent_id === params[0] && (!guarded || state.som.status === 'paid')) {
        state.som.status = 'disputed'
        return { rowCount: 1, rows: [] }
      }
      return { rowCount: 0, rows: [] }
    }
    if (/UPDATE som_purchase/.test(sql) && /SET status = 'paid'/.test(sql)) {
      const guarded = /AND status = 'disputed'/.test(sqlCode(sql))
      if (state.som?.payment_intent_id === params[0] && (!guarded || state.som.status === 'disputed')) {
        state.som.status = 'paid'
        return { rowCount: 1, rows: [] }
      }
      return { rowCount: 0, rows: [] }
    }
    if (/SELECT 1 FROM som_purchase/.test(sql)) {
      return { rows: state.som?.payment_intent_id === params[0] ? [{}] : [] }
    }
    if (/SELECT 1 FROM topup/.test(sql) && /refunded_at IS NOT NULL/.test(sql)) {
      return { rows: state.topup?.payment_intent_id === params[0] && state.topup.refunded_at ? [{}] : [] }
    }
    if (/FROM topup WHERE payment_intent_id = \$1 FOR UPDATE/.test(sql)) {
      return { rows: state.topup?.payment_intent_id === params[0] ? [{ ...state.topup }] : [] }
    }
    if (/FROM account WHERE stripe_customer_id = \$1 FOR UPDATE/.test(sql)) {
      return { rows: [{ id: 'acct_1', topup_studies: state.balance }] }
    }
    if (/UPDATE account SET topup_studies = topup_studies -/.test(sql)) {
      state.balance -= params[1]
      return { rowCount: 1, rows: [] }
    }
    if (/UPDATE topup/.test(sql) && /studies_revoked = studies_revoked/.test(sql)) {
      state.topup.studies_revoked += params[1]
      state.topup.refunded_at = new Date().toISOString()
      return { rowCount: 1, rows: [] }
    }
    if (/INSERT INTO topup_reconciliation_failure/.test(sql)) {
      state.failures.set(params[0], params[2])
      return { rowCount: 1, rows: [] }
    }
    throw new Error(`unexpected dispute test query: ${sql.replace(/\s+/g, ' ').slice(0, 120)}`)
  }
  return { state, query, async connect() { return { query, release() {} } } }
}

// disputeStatus is where Stripe says the dispute stands now, whatever an event claims.
function fakeStripe({ charge, invoice = null, subscription = null, cancelError = null, disputeStatus = 'needs_response' } = {}) {
  const calls = []
  const fake = {
    calls,
    disputeStatus,
    disputes: { async retrieve(id) { calls.push(['disputes.retrieve', id]); return { id, status: fake.disputeStatus } } },
    charges: { async retrieve(id) { calls.push(['charges.retrieve', id]); return { id, ...charge } } },
    invoices: { async retrieve(id) { calls.push(['invoices.retrieve', id]); return invoice } },
    subscriptions: {
      async retrieve(id) { calls.push(['subscriptions.retrieve', id]); return subscription },
      async cancel(id) {
        calls.push(['subscriptions.cancel', id])
        if (cancelError) throw cancelError
        subscription.status = 'canceled'
        return subscription
      },
    },
    checkout: { sessions: { async list(params) { calls.push(['checkout.sessions.list', params]); return { data: [] } } } },
  }
  return fake
}

function disputeEvent(type, status, overrides = {}) {
  return {
    id: `evt_${type}_${status}`,
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object: {
      object: 'dispute', id: 'dp_1', charge: 'ch_disputed', payment_intent: 'pi_disputed', status, ...overrides,
    } },
  }
}

// Deliver an event for a dispute that Stripe currently reports with the same status.
function deliver(db, stripe, type, status, options) {
  stripe.disputeStatus = status
  return handleChargeDispute(db, disputeEvent(type, status), stripe, options)
}

function operatorSubscription(overrides = {}) {
  return { id: 'sub_1', status: 'active', items: { data: [{ price: { id: 'price_starter' } }] }, ...overrides }
}

const cancels = (stripe) => stripe.calls.filter(([name]) => name === 'subscriptions.cancel').length

;(async () => {
  console.log('\nAN INQUIRY MOVES NO MONEY AND CHANGES NOTHING')
  {
    const db = disputeDb({ som: { payment_intent_id: 'pi_disputed' } })
    const stripe = fakeStripe({ charge: { payment_intent: 'pi_disputed' }, disputeStatus: 'warning_needs_response' })
    const result = await handleChargeDispute(db, disputeEvent('charge.dispute.created', 'warning_needs_response'), stripe)
    ok('an inquiry is recognised', result === 'inquiry')
    ok('...after reading current status, without changing the order', stripe.calls.length === 1 && db.state.som.status === 'paid')
    stripe.disputeStatus = 'needs_response'
    const escalated = await handleChargeDispute(db, disputeEvent('charge.dispute.created', 'warning_needs_response'), stripe)
    ok('a stale inquiry event cannot hide an escalated chargeback', escalated === 'reversed' && db.state.som.status === 'disputed')
  }

  console.log('\nA DISPUTED TOP-UP GIVES BACK ITS UNSPENT STUDIES, ONCE')
  {
    const db = disputeDb({
      topup: { session_id: 'cs_t', stripe_customer_id: 'cus_1', payment_intent_id: 'pi_disputed', studies: TOPUP.studies },
      balance: 9,
    })
    const stripe = fakeStripe({ charge: { payment_intent: 'pi_disputed', customer: 'cus_1', invoice: null } })
    const result = await deliver(db, stripe, 'charge.dispute.created', 'needs_response')
    ok('the dispute reverses', result === 'reversed')
    ok('unspent top-up studies are revoked', db.state.balance === 0 && db.state.topup.studies_revoked === 9)
    const replay = await deliver(db, stripe, 'charge.dispute.funds_withdrawn', 'needs_response')
    ok('funds_withdrawn for the same dispute revokes nothing twice',
      replay === 'reversed' && db.state.topup.studies_revoked === 9 && db.state.balance === 0)
    ok('a top-up charge cancels no subscription', !stripe.calls.some(([name]) => name.startsWith('subscriptions.')))
    const won = await deliver(db, stripe, 'charge.dispute.closed', 'won')
    ok('winning a dispute on a reversed top-up asks a person to restore the studies',
      won === 'won' && db.state.failures.get('evt_charge.dispute.closed_won') === 'dispute-won-review')
  }

  console.log('\nA DISPUTED EBOOK CLOSES ITS DOWNLOAD; A WON DISPUTE REOPENS IT')
  {
    const db = disputeDb({ som: { payment_intent_id: 'pi_disputed' } })
    const stripe = fakeStripe({ charge: { payment_intent: 'pi_disputed', customer: 'cus_som' } })
    await deliver(db, stripe, 'charge.dispute.created', 'needs_response')
    ok('the order is closed', db.state.som.status === 'disputed')
    ok('...with no alarm and no Checkout lookup', db.state.failures.size === 0 &&
      !stripe.calls.some(([name]) => name === 'checkout.sessions.list'))
    const won = await deliver(db, stripe, 'charge.dispute.closed', 'won')
    ok('a won dispute restores the download', won === 'won' && db.state.som.status === 'paid')
    ok('...and needs no review when nothing else was taken back', db.state.failures.size === 0)

    stripe.disputeStatus = 'won'
    const stale = await handleChargeDispute(db, disputeEvent('charge.dispute.funds_withdrawn', 'needs_response'), stripe)
    ok('a late or resent "opened" event cannot close the ebook of a customer who won', stale === 'won' && db.state.som.status === 'paid')
  }

  console.log('\nA DISPUTED SUBSCRIPTION PAYMENT STOPS THE SUBSCRIPTION')
  {
    const db = disputeDb()
    const subscription = operatorSubscription()
    const synced = []
    const stripe = fakeStripe({
      charge: { payment_intent: 'pi_disputed', customer: 'cus_sub', invoice: 'in_1' },
      invoice: { id: 'in_1', subscription: 'sub_1' },
      subscription,
    })
    const result = await deliver(db, stripe, 'charge.dispute.created', 'needs_response',
      { syncCustomer: async (_db, customerId) => { synced.push(customerId) } })
    ok('the disputed Operator subscription is canceled at Stripe', result === 'reversed' &&
      stripe.calls.some(([name, id]) => name === 'subscriptions.cancel' && id === 'sub_1'))
    ok('...and the account is re-read from Stripe so the allowance stops', isDeepStrictEqual(synced, ['cus_sub']))
    ok('...with no top-up alarm for a subscription charge', db.state.failures.size === 0)
    const lost = await deliver(db, stripe, 'charge.dispute.closed', 'lost', { syncCustomer: async () => {} })
    ok('a lost close re-runs safely without a second cancel', lost === 'reversed' && cancels(stripe) === 1)
    const won = await deliver(db, stripe, 'charge.dispute.closed', 'won')
    ok('winning it is left for a person to reinstate', won === 'won' &&
      db.state.failures.get('evt_charge.dispute.closed_won') === 'dispute-won-review')

    const fresh = fakeStripe({
      charge: { payment_intent: 'pi_disputed', customer: 'cus_sub', invoice: 'in_1' },
      invoice: { id: 'in_1', subscription: 'sub_1' },
      subscription: operatorSubscription(),
      disputeStatus: 'won',
    })
    const staleOpen = await handleChargeDispute(disputeDb(), disputeEvent('charge.dispute.created', 'needs_response'), fresh,
      { syncCustomer: async () => { throw new Error('no sync expected for a won dispute') } })
    ok('a stale "opened" event for a dispute already won cancels nothing', staleOpen === 'won' && cancels(fresh) === 0)
  }

  console.log('\nA CLOSE THAT IS NEITHER WON NOR LOST DOES NOTHING')
  {
    const db = disputeDb({ som: { payment_intent_id: 'pi_disputed' } })
    const stripe = fakeStripe({ charge: { payment_intent: 'pi_disputed' }, disputeStatus: 'warning_closed' })
    const result = await handleChargeDispute(db, disputeEvent('charge.dispute.closed', 'warning_closed'), stripe)
    ok('a closed inquiry changes nothing', result === 'inquiry' && stripe.calls.length === 1 && db.state.som.status === 'paid')
    stripe.disputeStatus = 'prevented'
    const prevented = await handleChargeDispute(db, disputeEvent('charge.dispute.closed', 'prevented'), stripe)
    ok('a close with another status changes nothing', prevented === 'closed' && stripe.calls.length === 2)
  }

  console.log('\nTHIS SERVER ONLY CANCELS WHAT IT SOLD')
  {
    const db = disputeDb()
    const subscription = operatorSubscription({ id: 'sub_other', items: { data: [{ price: { id: 'price_someone_else' } }] } })
    const stripe = fakeStripe({
      charge: { payment_intent: 'pi_disputed', customer: 'cus_other', invoice: 'in_other' },
      invoice: { subscription: 'sub_other' },
      subscription,
    })
    await deliver(db, stripe, 'charge.dispute.created', 'needs_response',
      { syncCustomer: async () => { throw new Error('no sync expected') } })
    ok('a subscription for another product on the account is left alone',
      cancels(stripe) === 0 && subscription.status === 'active')
  }

  console.log('\nA KEY THAT MAY NOT CANCEL LEAVES A RECORD AND FAILS THE WEBHOOK')
  {
    const db = disputeDb()
    const denied = Object.assign(new Error('The provided key does not have the required permissions'),
      { type: 'StripePermissionError' })
    const stripe = fakeStripe({
      charge: { payment_intent: 'pi_disputed', customer: 'cus_sub', invoice: 'in_1' },
      invoice: { subscription: 'sub_1' },
      subscription: operatorSubscription(),
      cancelError: denied,
    })
    let rejected = false
    try { await deliver(db, stripe, 'charge.dispute.created', 'needs_response') } catch { rejected = true }
    ok('a permission refusal rejects the event for retry', rejected)
    ok('...and records it for a person',
      db.state.failures.get('evt_charge.dispute.created_needs_response') === 'dispute-cancel-not-permitted')

    const repaired = fakeStripe({
      charge: { payment_intent: 'pi_disputed', customer: 'cus_sub', invoice: 'in_1' },
      invoice: { subscription: 'sub_1' }, subscription: operatorSubscription(),
    })
    const retried = await deliver(db, repaired, 'charge.dispute.created', 'needs_response', { syncCustomer: async () => {} })
    ok('redelivery after permissions are repaired cancels the subscription', retried === 'reversed' && cancels(repaired) === 1)

    const outage = Object.assign(new Error('Stripe is having a moment'), { type: 'StripeAPIError' })
    const flaky = fakeStripe({
      charge: { payment_intent: 'pi_disputed', customer: 'cus_sub', invoice: 'in_1' },
      invoice: { subscription: 'sub_1' },
      subscription: operatorSubscription(),
      cancelError: outage,
    })
    let outageRejected = false
    try { await deliver(disputeDb(), flaky, 'charge.dispute.created', 'needs_response') } catch { outageRejected = true }
    ok('a transient Stripe failure still rejects so Stripe retries it', outageRejected)
  }

  console.log('\nTHE WEBHOOK ROUTES DISPUTES')
  {
    const db = disputeDb({ som: { payment_intent_id: 'pi_disputed' } })
    const stripe = fakeStripe({ charge: { payment_intent: 'pi_disputed', customer: null } })
    let error = null
    try { await handleWebhookEvent(db, disputeEvent('charge.dispute.created', 'needs_response'), stripe) } catch (caught) { error = caught }
    ok('charge.dispute.created reaches the dispute handler', error === null && db.state.som.status === 'disputed', error?.message)
    ok('...which asks Stripe where the dispute stands', stripe.calls.some(([name, id]) => name === 'disputes.retrieve' && id === 'dp_1'))
  }

  console.log('\nA KEY THAT MAY NOT READ THE DISPUTE LEAVES A RECORD AND REJECTS')
  {
    const { errors } = require('stripe')
    const denied = () => new errors.StripePermissionError({ message: 'The provided key does not have the required permissions', statusCode: 403 })
    const db = disputeDb({ som: { payment_intent_id: 'pi_disputed' } })
    const stripe = fakeStripe({ charge: { payment_intent: 'pi_disputed' } })
    stripe.disputes.retrieve = async () => { throw denied() }
    let error = null
    try { await handleWebhookEvent(db, disputeEvent('charge.dispute.created', 'needs_response'), stripe) } catch (caught) { error = caught }
    ok('a dispute the key may not read rejects the webhook', error?.type === 'StripePermissionError')
    ok('...and is recorded for a person', db.state.failures.get('evt_charge.dispute.created_needs_response') === 'dispute-read-not-permitted')

    const chargeDb = disputeDb({ som: { payment_intent_id: 'pi_disputed' } })
    const chargeStripe = fakeStripe({ charge: { payment_intent: 'pi_disputed' } })
    chargeStripe.charges.retrieve = async () => { throw denied() }
    let chargeError
    try { await deliver(chargeDb, chargeStripe, 'charge.dispute.created', 'needs_response') } catch (error) { chargeError = error }
    ok('a charge the key may not read rejects and is recorded the same way', chargeError?.type === 'StripePermissionError' &&
      chargeDb.state.failures.get('evt_charge.dispute.created_needs_response') === 'dispute-read-not-permitted')
    ok('...and nothing it could not verify is changed', chargeDb.state.som.status === 'paid')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
