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

test('an active subscription waiting on its renewal stays inside the month it paid for', () => {
  const account = { status: 'active', usageAnchorAt: '2026-08-11T13:00:00.000Z', paidThrough: '2026-09-11T13:00:00.000Z' }
  const lastHour = billingPeriodFor(account, '2026-09-11T12:00:00.000Z')
  const inGrace = billingPeriodFor(account, '2026-09-12T12:00:00.000Z')
  assert.deepEqual(inGrace, lastHour, 'the renewal grace window must not open a new usage period')
  assert.equal(inGrace.periodEnd, '2026-09-11T13:00:00.000Z')
})

test('a recorded renewal opens the new month', () => {
  const renewed = { status: 'active', usageAnchorAt: '2026-08-11T13:00:00.000Z', paidThrough: '2026-10-11T13:00:00.000Z' }
  assert.equal(billingPeriodFor(renewed, '2026-09-12T12:00:00.000Z').periodStart, '2026-09-11T13:00:00.000Z')
})

test('an annual subscription waiting on its renewal does not open a new month either', () => {
  const annual = { status: 'active', usageAnchorAt: '2025-09-11T10:00:00.000Z', paidThrough: '2026-09-11T10:00:00.000Z' }
  assert.equal(billingPeriodFor(annual, '2026-09-11T10:00:01.000Z').periodStart, '2026-08-11T10:00:00.000Z')
})

test('only an active subscription is held in its paid month', () => {
  const pastDue = { status: 'past_due', usageAnchorAt: '2026-08-11T13:00:00.000Z', paidThrough: '2026-09-11T13:00:00.000Z' }
  assert.equal(billingPeriodFor(pastDue, '2026-09-12T12:00:00.000Z').periodStart, '2026-09-11T13:00:00.000Z')
  const comp = { status: 'active', usageAnchorAt: '2026-08-11T13:00:00.000Z', paidThrough: null }
  assert.equal(billingPeriodFor(comp, '2026-09-12T12:00:00.000Z').periodStart, '2026-09-11T13:00:00.000Z')
})

test('an aligned subscription keeps the bucket it always had, so no usage row resets', () => {
  const aligned = { status: 'active', usageAnchorAt: '2026-01-15T18:30:00.000Z', paidThrough: '2027-01-15T18:30:00.000Z' }
  assert.deepEqual(
    billingPeriodFor(aligned, '2026-08-08T12:00:00.000Z'),
    billingPeriodFor({ usageAnchorAt: aligned.usageAnchorAt }, '2026-08-08T12:00:00.000Z'),
  )
})

// Walk a subscription hour by hour, applying each renewal when it is recorded, and
// return every usage bucket it opens. A bucket that is left and later reopened is a
// second allowance for the same month, so it fails immediately.
function bucketsOpened(account, renewals, from, to) {
  const opened = []
  for (let t = Date.parse(from); t <= Date.parse(to); t += 60 * 60 * 1000) {
    const recorded = renewals.filter((renewal) => Date.parse(renewal.recordedAt) <= t).at(-1)
    const { periodStart } = billingPeriodFor({ ...account, ...(recorded ? { paidThrough: recorded.paidThrough } : {}) }, new Date(t))
    if (opened.at(-1) !== periodStart) {
      assert.ok(!opened.includes(periodStart), `bucket ${periodStart} reopened at ${new Date(t).toISOString()}`)
      opened.push(periodStart)
    }
  }
  return opened
}

test('a month-end anchor with late-recorded renewals opens exactly one bucket per paid month', () => {
  const account = { status: 'active', usageAnchorAt: '2026-10-31T09:00:00.000Z', paidThrough: '2026-11-30T09:00:00.000Z' }
  const renewals = [
    { recordedAt: '2026-11-30T15:00:00.000Z', paidThrough: '2026-12-31T09:00:00.000Z' },
    { recordedAt: '2026-12-31T15:00:00.000Z', paidThrough: '2027-01-31T09:00:00.000Z' },
  ]
  assert.deepEqual(bucketsOpened(account, renewals, '2026-11-01T00:00:00.000Z', '2027-01-15T00:00:00.000Z'), [
    '2026-10-31T09:00:00.000Z', '2026-11-30T09:00:00.000Z', '2026-12-31T09:00:00.000Z',
  ])
})

test('a leap-day annual anchor waiting on its renewal keeps the month it already used', () => {
  const account = { status: 'active', usageAnchorAt: '2024-02-29T09:00:00.000Z', paidThrough: '2025-02-28T09:00:00.000Z' }
  const renewals = [{ recordedAt: '2025-02-28T12:00:00.000Z', paidThrough: '2026-02-28T09:00:00.000Z' }]
  assert.deepEqual(bucketsOpened(account, renewals, '2025-01-20T00:00:00.000Z', '2025-03-10T00:00:00.000Z'), [
    '2024-12-29T09:00:00.000Z', '2025-01-29T09:00:00.000Z', '2025-02-28T09:00:00.000Z',
  ])
})

test('a subscription whose renewal day drifted from its anchor still gets exactly one bucket a month', () => {
  // A Google hold recovery moved renewals to the 8th; the stored anchor stayed on the 1st.
  const account = { status: 'active', usageAnchorAt: '2026-08-01T00:00:00.000Z', paidThrough: '2026-10-08T00:00:00.000Z' }
  const renewals = [
    { recordedAt: '2026-10-08T00:30:00.000Z', paidThrough: '2026-11-08T00:00:00.000Z' },
    { recordedAt: '2026-11-08T00:30:00.000Z', paidThrough: '2026-12-08T00:00:00.000Z' },
  ]
  assert.deepEqual(bucketsOpened(account, renewals, '2026-09-10T00:00:00.000Z', '2026-12-05T00:00:00.000Z'), [
    '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z',
  ])
})

test('an Apple renewal charged a day before its anchor day does not open a second bucket while it is recorded', () => {
  const account = { status: 'active', usageAnchorAt: '2026-09-10T14:00:00.000Z', paidThrough: '2026-10-11T13:00:00.000Z' }
  const renewals = [{ recordedAt: '2026-10-11T17:00:00.000Z', paidThrough: '2026-11-11T13:00:00.000Z' }]
  assert.deepEqual(bucketsOpened(account, renewals, '2026-09-20T00:00:00.000Z', '2026-11-05T00:00:00.000Z'), [
    '2026-09-10T14:00:00.000Z', '2026-10-10T14:00:00.000Z',
  ])
})
