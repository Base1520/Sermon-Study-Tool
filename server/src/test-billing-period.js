const test = require('node:test')
const assert = require('node:assert/strict')
const { billingPeriodFor } = require('./billing-period')

test('usage resets on the subscription anniversary, not the first of the month', () => {
  const period = billingPeriodFor(
    { usageAnchorAt: '2026-01-15T18:30:00.000Z' },
    '2026-08-08T12:00:00.000Z',
  )
  assert.deepEqual(period, {
    periodStart: '2026-07-15T18:30:00.000Z',
    periodEnd: '2026-08-15T18:30:00.000Z',
  })
})

test('annual subscriptions still receive twelve monthly allowance buckets', () => {
  const account = { usageAnchorAt: '2026-01-15T18:30:00.000Z' }
  const january = billingPeriodFor(account, '2026-01-20T00:00:00.000Z')
  const february = billingPeriodFor(account, '2026-02-20T00:00:00.000Z')
  assert.notEqual(january.periodStart, february.periodStart)
  assert.equal(january.periodEnd, february.periodStart)
})

test('month-end anchors clamp without drifting permanently', () => {
  const account = { usageAnchorAt: '2026-01-31T10:00:00.000Z' }
  assert.deepEqual(billingPeriodFor(account, '2026-02-28T12:00:00.000Z'), {
    periodStart: '2026-02-28T10:00:00.000Z',
    periodEnd: '2026-03-31T10:00:00.000Z',
  })
  assert.equal(
    billingPeriodFor(account, '2026-03-31T12:00:00.000Z').periodStart,
    '2026-03-31T10:00:00.000Z',
  )
})

test('free and legacy accounts fall back to UTC calendar months', () => {
  assert.deepEqual(billingPeriodFor({}, '2026-08-08T12:00:00.000Z'), {
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-09-01T00:00:00.000Z',
  })
})
