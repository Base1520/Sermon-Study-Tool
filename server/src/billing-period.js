function addUtcMonthsClamped(anchor, months) {
  const source = new Date(anchor)
  const targetMonth = source.getUTCMonth() + months
  const year = source.getUTCFullYear() + Math.floor(targetMonth / 12)
  const month = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(
    year,
    month,
    Math.min(source.getUTCDate(), lastDay),
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds(),
  ))
}

function calendarMonth(now) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() }
}

function anchoredPeriod(account, now) {
  const anchor = new Date(account?.usageAnchorAt || 0)
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(anchor.getTime()) || anchor.getTime() <= 0) {
    return calendarMonth(Number.isFinite(now.getTime()) ? now : new Date())
  }

  let months = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth())
  if (addUtcMonthsClamped(anchor, months).getTime() > now.getTime()) months -= 1
  if (months < 0) return calendarMonth(now)

  return {
    periodStart: addUtcMonthsClamped(anchor, months).toISOString(),
    periodEnd: addUtcMonthsClamped(anchor, months + 1).toISOString(),
  }
}

function billingPeriodFor(account, at = new Date()) {
  let now = new Date(at)
  // An active subscription past its recorded paid-through date is waiting on a
  // renewal nobody has written down yet. entitlementFor keeps it working for
  // RENEWAL_GRACE_MS, but only inside the month it already paid for: its buckets
  // are counted from the usage anchor, so the next one would otherwise open at
  // paid_through and hand a lapsed subscriber a whole new allowance. A recorded
  // renewal moves paid_through, and the new month opens then.
  //
  // Buckets always come from the ONE anchor series. Counting some of them back from
  // paid_through was tried and rejected: every switch between two series lands on
  // a never-used row, which is an extra allowance each month for any subscription
  // whose renewal day has drifted from its anchor, and at month ends for aligned
  // ones. Known limit: when a store moves the renewal date (a hold or billing-retry
  // recovery), the anchor does not follow, so that subscription's month opens on the
  // anchor day instead of the renewal day. Still exactly one allowance a month, but
  // its final month can open a few days before paid_through.
  const paidThrough = new Date(account?.paidThrough || 0).getTime()
  if (account?.status === 'active' && paidThrough > 0 && now.getTime() >= paidThrough) {
    now = new Date(paidThrough - 1)
  }
  return anchoredPeriod(account, now)
}

module.exports = { addUtcMonthsClamped, billingPeriodFor }
