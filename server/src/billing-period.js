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

function billingPeriodFor(account, at = new Date()) {
  const now = new Date(at)
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

module.exports = { addUtcMonthsClamped, billingPeriodFor }
