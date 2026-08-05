// Meter tests against a fake Postgres that models the real locking behaviour.
//
// The bug this suite exists to prevent is a race: two requests both read
// "39 of 40 used", both pass, both spend. That cannot be caught by reading the
// code — it has to be simulated. The fake below serialises UPDATEs the way a row
// lock does, and evaluates the guard the way ON CONFLICT ... WHERE does.
//
//   node server/src/test-meter.js

const {
  reserveStudy, settleStudy, releaseStudy,
  sweepStaleReservations, committedSpend, ceilingStatus,
  STUDY_RESERVE_USD,
} = require('./meter')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** A fake Postgres: one usage_period row, honouring the guard and the lock. */
function fakeDb(initial = {}) {
  const rows = new Map()
  const settings = new Map([['daily_ceiling_usd', '50']])
  let queue = Promise.resolve()          // serialises writes, as a row lock does

  const key = (a, p) => `${a}|${new Date(p).toISOString()}`
  if (initial.row) rows.set(key(initial.row.account_id, initial.row.period_start), { ...initial.row })

  return {
    _rows: rows,
    query(sql, params) {
      // Every statement takes its turn — this is what makes the race testable.
      queue = queue.then(() => run(sql, params))
      return queue
    },
  }

  function run(sql, params) {
    if (/INSERT INTO usage_period/.test(sql)) {
      const [accountId, periodStart, periodEnd, allowance, reserve] = params
      const k = key(accountId, periodStart)
      const existing = rows.get(k)
      if (!existing) {
        rows.set(k, {
          account_id: accountId, period_start: periodStart, period_end: periodEnd,
          studies_used: 1, reserved_usd: reserve, actual_usd: 0, updated_at: new Date(),
        })
        return { rows: [{ studies_used: 1, allowance }] }
      }
      // The WHERE clause on the UPDATE branch — the guard.
      if (existing.studies_used < allowance) {
        existing.studies_used += 1
        existing.reserved_usd += reserve
        existing.updated_at = new Date()
        return { rows: [{ studies_used: existing.studies_used, allowance }] }
      }
      return { rows: [] }   // guard failed: zero rows, which means refuse
    }
    if (/SELECT studies_used FROM usage_period/.test(sql)) {
      const r = rows.get(key(params[0], params[1]))
      return { rows: r ? [{ studies_used: r.studies_used }] : [] }
    }
    if (/SET reserved_usd = GREATEST\(reserved_usd - \$3, 0\),\s*\n?\s*actual_usd/.test(sql)) {
      const r = rows.get(key(params[0], params[1]))
      if (r) { r.reserved_usd = Math.max(r.reserved_usd - params[2], 0); r.actual_usd += params[3] }
      return { rows: [], rowCount: r ? 1 : 0 }
    }
    if (/SET studies_used = GREATEST\(studies_used - 1, 0\)/.test(sql)) {
      const r = rows.get(key(params[0], params[1]))
      if (r) { r.studies_used = Math.max(r.studies_used - 1, 0); r.reserved_usd = Math.max(r.reserved_usd - params[2], 0) }
      return { rows: [], rowCount: r ? 1 : 0 }
    }
    if (/UPDATE usage_period\s*\n?\s*SET reserved_usd = 0/.test(sql)) {
      let n = 0
      const cutoff = Date.now() - Number(params[0]) * 60000
      for (const r of rows.values()) {
        if (r.reserved_usd > 0 && r.updated_at.getTime() < cutoff) { r.reserved_usd = 0; n++ }
      }
      return { rows: [], rowCount: n }
    }
    if (/SUM\(actual_usd\)/.test(sql)) {
      let a = 0, res = 0
      for (const r of rows.values()) { a += r.actual_usd; res += r.reserved_usd }
      return { rows: [{ reconciled: a, in_flight: res }] }
    }
    if (/FROM settings/.test(sql)) {
      return { rows: [{ value: settings.get('daily_ceiling_usd') }] }
    }
    // No top-up balance in this fake — the top-up path has its own tests.
    if (/UPDATE account/.test(sql) && /topup_studies = topup_studies - 1/.test(sql)) {
      return { rows: [] }
    }
    if (/SUM\(usd\).*AS reconciled/s.test(sql)) return { rows: [{ reconciled: 0 }] }
    if (/SUM\(reserved_usd\).*AS in_flight/s.test(sql)) {
      let res = 0
      for (const r of rows.values()) res += Number(r.reserved_usd ?? 0)
      return { rows: [{ in_flight: res }] }
    }

    throw new Error('unhandled SQL in fake: ' + sql.slice(0, 60))
  }
}

const P = { periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-09-01T00:00:00Z' }

;(async () => {
  console.log('\nTHE ALLOWANCE HOLDS')
  {
    const db = fakeDb()
    const acct = { accountId: 'a1', allowance: 3, ...P }
    const r1 = await reserveStudy(db, acct)
    const r2 = await reserveStudy(db, acct)
    const r3 = await reserveStudy(db, acct)
    const r4 = await reserveStudy(db, acct)
    ok('the first three are allowed', r1.ok && r2.ok && r3.ok)
    ok('the fourth is refused', !r4.ok && r4.reason === 'limit-reached')
    ok('the refusal reports where he stands', r4.used === 3 && r4.allowance === 3)
  }

  console.log('\nTHE RACE — the bug this file exists for')
  {
    const db = fakeDb()
    const acct = { accountId: 'a1', allowance: 40, ...P }
    for (let i = 0; i < 39; i++) await reserveStudy(db, acct)
    // Two requests arrive at the same instant on the last remaining study.
    const [x, y] = await Promise.all([reserveStudy(db, acct), reserveStudy(db, acct)])
    const allowed = [x, y].filter(r => r.ok).length
    ok('exactly ONE of two simultaneous requests wins the last study', allowed === 1,
       `${allowed} were allowed`)
    ok('the counter never exceeds the allowance',
       db._rows.get('a1|2026-08-01T00:00:00.000Z').studies_used === 40)
  }

  console.log('\nA ZERO ALLOWANCE GRANTS NOTHING')
  {
    // The edge a cancelled subscriber sits on. ON CONFLICT's WHERE only guards
    // the UPDATE branch, so an unguarded zero would create a row with used=1
    // and hand out a free study on the way out the door.
    const db = fakeDb()
    const r = await reserveStudy(db, { accountId: 'gone', allowance: 0, ...P })
    ok('a cancelled account gets nothing', !r.ok && r.reason === 'no-allowance')
    ok('and no row was created', db._rows.size === 0)
  }

  console.log('\nRESERVE THE CEILING, SETTLE TO ACTUAL')
  {
    const db = fakeDb()
    const acct = { accountId: 'a1', allowance: 10, ...P }
    await reserveStudy(db, acct)
    const row = () => db._rows.get('a1|2026-08-01T00:00:00.000Z')
    ok('the worst case is held while the study runs', row().reserved_usd === STUDY_RESERVE_USD)
    await settleStudy(db, { accountId: 'a1', periodStart: P.periodStart, actualUsd: 0.19 })
    ok('the reservation is released on settle', row().reserved_usd === 0)
    ok('and the real cost is recorded', row().actual_usd === 0.19)
    ok('settling cost LESS than reserved, as it usually will', 0.19 < STUDY_RESERVE_USD)
  }

  console.log('\nA STUDY THAT NEVER RAN DOES NOT EAT THE ALLOWANCE')
  {
    const db = fakeDb()
    const acct = { accountId: 'a1', allowance: 10, ...P }
    await reserveStudy(db, acct)
    await releaseStudy(db, { accountId: 'a1', periodStart: P.periodStart })
    const row = db._rows.get('a1|2026-08-01T00:00:00.000Z')
    ok('the study count is given back', row.studies_used === 0)
    ok('and so is the reservation', row.reserved_usd === 0)
  }

  console.log('\nCRASHED WORK IS SWEPT, NOT LEAKED FOREVER')
  {
    const db = fakeDb()
    await reserveStudy(db, { accountId: 'a1', allowance: 10, ...P })
    db._rows.get('a1|2026-08-01T00:00:00.000Z').updated_at = new Date(Date.now() - 60 * 60000)
    const n = await sweepStaleReservations(db)
    ok('a dead reservation is reclaimed', n === 1)
    ok('and the money is no longer committed',
       db._rows.get('a1|2026-08-01T00:00:00.000Z').reserved_usd === 0)
  }

  console.log('\nTHE CEILING SEES MONEY STILL IN FLIGHT')
  {
    const db = fakeDb()
    for (let i = 0; i < 20; i++) await reserveStudy(db, { accountId: 'a' + i, allowance: 10, ...P })
    const s = await committedSpend(db)
    ok('nothing has reconciled yet', s.reconciled === 0)
    ok('but 20 running studies ARE committed money', s.inFlight === 20 * STUDY_RESERVE_USD)
    ok('a naive "sum of completed spend" would have read zero here', s.committed > 0)
  }

  console.log('\nTHE BRAKE ESCALATES BEFORE IT BITES')
  {
    const mk = async (n) => {
      const db = fakeDb()
      for (let i = 0; i < n; i++) await reserveStudy(db, { accountId: 'a' + i, allowance: 10, ...P })
      return ceilingStatus(db)
    }
    const quiet = await mk(10)      // $7.50 of $50
    const warn  = await mk(40)      // $30
    const hot   = await mk(65)      // $48.75
    const gone  = await mk(110)     // $82.50
    ok('a quiet day raises nothing', !quiet.alarm && !quiet.blockNewSignups)
    ok('half the ceiling alarms', warn.alarm && !warn.blockNewSignups)
    ok('near the ceiling, new signups stop first', hot.blockNewSignups && !hot.blockEverything)
    ok('paying customers keep working right up to a genuine runaway', !hot.blockEverything)
    ok('a real runaway stops everything', gone.blockEverything)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
