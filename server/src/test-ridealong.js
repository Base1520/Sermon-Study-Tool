// A study is charged ONCE, even though it runs in two halves.
//
// /v1/analyze reserves, spends and settles. /v1/read then rides that same claim.
// Every rule that keeps this from either double-billing an honest user or
// handing a dishonest one free work is asserted here.
//
//   node server/src/test-ridealong.js

const meter = require('./meter')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const close = (a, b) => Math.abs(a - b) < 1e-9

/** Enough of Postgres to exercise the money columns. Writes serialise, as a row lock does. */
function fakeDb() {
  const periods = new Map()
  const events = []            // { study_id, account_id, label, usd }
  let queue = Promise.resolve()
  const api = {
    _periods: periods, _events: events,
    row: (a, s) => periods.get(a + '|' + s),
    addEvent: (e) => events.push(e),
    query(sql, params) { queue = queue.then(() => run(sql, params)); return queue },
  }
  return api

  function run(sql, p) {
    if (/INSERT INTO usage_period/.test(sql)) {
      const [acct, start, , allowance, reserve] = p
      const k = acct + '|' + start
      const r = periods.get(k)
      if (!r) { periods.set(k, { used: 1, reserved: Number(reserve), actual: 0 }); return { rows: [{ studies_used: 1, allowance }] } }
      if (r.used < allowance) { r.used++; r.reserved += Number(reserve); return { rows: [{ studies_used: r.used, allowance }] } }
      return { rows: [] }
    }
    if (/SET reserved_usd = GREATEST\(reserved_usd - \$3, 0\),\s*\n?\s*actual_usd\s*= actual_usd \+ \$4/.test(sql)) {
      const r = periods.get(p[0] + '|' + p[1])
      if (r) { r.reserved = Math.max(r.reserved - Number(p[2]), 0); r.actual += Number(p[3]) }
      return { rows: [] }
    }
    if (/SET actual_usd = actual_usd \+ \$3/.test(sql)) {
      const r = periods.get(p[0] + '|' + p[1])
      if (r) r.actual += Number(p[2])
      return { rows: [] }
    }
    if (/SET studies_used = GREATEST/.test(sql)) {
      const r = periods.get(p[0] + '|' + p[1])
      if (r) { r.used = Math.max(r.used - 1, 0); r.reserved = Math.max(r.reserved - Number(p[2]), 0) }
      return { rows: [] }
    }
    if (/label LIKE 'plain-read%'/.test(sql)) {
      return { rows: events.filter(e => e.study_id === p[0] && /^plain-read/.test(e.label)).slice(0, 1) }
    }
    if (/WHERE study_id = \$1 AND account_id = \$2/.test(sql)) {
      return { rows: events.filter(e => e.study_id === p[0] && e.account_id === p[1]).slice(0, 1) }
    }
    if (/SUM\(usd\)/.test(sql)) {
      const usd = events.filter(e => e.study_id === p[0]).reduce((n, e) => n + e.usd, 0)
      return { rows: [{ usd }] }
    }
    if (/SUM\(actual_usd\)/.test(sql)) {
      let a = 0, res = 0
      for (const r of periods.values()) { a += r.actual; res += r.reserved }
      return { rows: [{ reconciled: a, in_flight: res }] }
    }
    if (/FROM settings/.test(sql)) return { rows: [{ value: '50' }] }
    throw new Error('unhandled SQL: ' + sql.replace(/\s+/g, ' ').slice(0, 70))
  }
}

// The two guards, exactly as engine.js implements them.
const studyBelongsTo = async (db, studyId, accountId) => {
  if (!studyId || !accountId) return false
  const { rows } = await db.query('WHERE study_id = $1 AND account_id = $2', [studyId, accountId])
  return rows.length > 0
}
const studyHasDocument = async (db, studyId) => {
  const { rows } = await db.query("label LIKE 'plain-read%'", [studyId])
  return rows.length > 0
}
const studyCost = async (db, studyId) => {
  const { rows } = await db.query('SUM(usd)', [studyId])
  return Number(rows[0].usd)
}

const ACCT = 'acct-1'
const START = '2026-08-01T00:00:00Z'
const claim = { accountId: ACCT, allowance: 40, periodStart: START, periodEnd: '2026-09-01T00:00:00Z' }

;(async () => {
  console.log('\nTHE FULL FLOW COSTS ONE STUDY, NOT TWO')
  {
    const db = fakeDb()
    // ── /v1/analyze: reserve, spend, settle ──
    await meter.reserveStudy(db, claim)
    const studyId = 'study-A'
    db.addEvent({ study_id: studyId, account_id: ACCT, label: 'analyze.core', usd: 0.21 })
    db.addEvent({ study_id: studyId, account_id: ACCT, label: 'analyze.enrich', usd: 0.04 })
    await meter.settleStudy(db, { accountId: ACCT, periodStart: START, actualUsd: await studyCost(db, studyId) })

    const afterAnalyze = db.row(ACCT, START)
    ok('analyze claims exactly one study', afterAnalyze.used === 1, `${afterAnalyze.used}`)
    ok('and releases its hold', close(afterAnalyze.reserved, 0), `${afterAnalyze.reserved}`)
    ok('booking what it really spent', close(afterAnalyze.actual, 0.25), `${afterAnalyze.actual}`)

    // ── /v1/read: rides the claim ──
    const rides = !!studyId && await studyBelongsTo(db, studyId, ACCT) && !(await studyHasDocument(db, studyId))
    ok('the reading qualifies to ride', rides)

    const before = await studyCost(db, studyId)
    db.addEvent({ study_id: studyId, account_id: ACCT, label: 'plain-read', usd: 0.30 })
    const delta = (await studyCost(db, studyId)) - before
    await meter.recordAdditionalSpend(db, { accountId: ACCT, periodStart: START, actualUsd: delta })

    const done = db.row(ACCT, START)
    ok('the allowance is still down by ONE', done.used === 1, `${done.used}`)
    ok('the reservation is not double-released', close(done.reserved, 0), `${done.reserved}`)
    ok('and the analyze half is not billed twice',
       close(done.actual, 0.55), `${done.actual} (want 0.55, double-bill would be 0.80)`)
  }

  console.log('\nA REPLAYED STUDY ID BUYS NOTHING')
  {
    const db = fakeDb()
    await meter.reserveStudy(db, claim)
    const studyId = 'study-B'
    db.addEvent({ study_id: studyId, account_id: ACCT, label: 'analyze.core', usd: 0.2 })
    db.addEvent({ study_id: studyId, account_id: ACCT, label: 'plain-read', usd: 0.3 })

    const again = !!studyId && await studyBelongsTo(db, studyId, ACCT) && !(await studyHasDocument(db, studyId))
    ok('an id that already produced a document cannot ride again', again === false)

    // ...so it takes a fresh claim, and the allowance moves.
    await meter.reserveStudy(db, claim)
    ok('a second document therefore costs a second study', db.row(ACCT, START).used === 2)
  }

  console.log('\nONE MAN CANNOT RIDE ANOTHER MAN\'S CLAIM')
  {
    const db = fakeDb()
    db.addEvent({ study_id: 'study-C', account_id: 'someone-else', label: 'analyze.core', usd: 0.2 })
    ok('a study id belonging to another account is refused',
       (await studyBelongsTo(db, 'study-C', ACCT)) === false)
    ok('an invented study id is refused',
       (await studyBelongsTo(db, 'no-such-study', ACCT)) === false)
  }

  console.log('\nAN ANONYMOUS CALLER NEVER RIDES')
  {
    const db = fakeDb()
    db.addEvent({ study_id: 'study-D', account_id: null, label: 'analyze.core', usd: 0.2 })
    ok('no account means no ride, so the free tier stays one study',
       (await studyBelongsTo(db, 'study-D', null)) === false)
    ok('and a missing study id is refused outright',
       (await studyBelongsTo(db, undefined, ACCT)) === false)
  }

  console.log('\nA FAILED ANALYSIS GIVES THE STUDY BACK')
  {
    const db = fakeDb()
    await meter.reserveStudy(db, claim)
    ok('the study is claimed up front', db.row(ACCT, START).used === 1)
    await meter.releaseStudy(db, { accountId: ACCT, periodStart: START })
    const r = db.row(ACCT, START)
    ok('a fan-out that threw is refunded', r.used === 0)
    ok('and its hold is released', close(r.reserved, 0), `${r.reserved}`)
  }

  console.log('\nrecordAdditionalSpend TOUCHES ONLY THE MONEY')
  {
    const db = fakeDb()
    await meter.reserveStudy(db, claim)
    const before = { ...db.row(ACCT, START) }
    await meter.recordAdditionalSpend(db, { accountId: ACCT, periodStart: START, actualUsd: 0.4 })
    const after = db.row(ACCT, START)
    ok('the allowance is untouched', after.used === before.used)
    ok('the reservation is untouched', close(after.reserved, before.reserved), `${after.reserved} vs ${before.reserved}`)
    ok('only actual spend moves', close(after.actual, before.actual + 0.4))

    await meter.recordAdditionalSpend(db, { accountId: ACCT, periodStart: START, actualUsd: 0 })
    ok('a zero-cost settle is a no-op', close(db.row(ACCT, START).actual, before.actual + 0.4))
    await meter.recordAdditionalSpend(db, { accountId: ACCT, periodStart: START, actualUsd: -5 })
    ok('a negative delta can never credit an account', close(db.row(ACCT, START).actual, before.actual + 0.4))
  }

  console.log('\nIN-FLIGHT MONEY STILL REACHES THE GLOBAL BRAKE')
  {
    const db = fakeDb()
    // Analyze reserves for many accounts at once; none has settled yet.
    for (let i = 0; i < 80; i++) {
      await meter.reserveStudy(db, { ...claim, accountId: 'a' + i })
    }
    const s = await meter.ceilingStatus(db)
    ok('committed money counts before anything reconciles', s.committed > 0)
    ok('and it trips the signup block', s.blockNewSignups)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
