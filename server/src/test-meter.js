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
  reserveAsk, settleAskReservation, releaseAskReservation,
  heartbeatAskReservation, heartbeatStudyReservation,
  reserveAnonymousStudy, settleStudyReservation, holdStudyReservationForReading,
  releaseStudyReservation, refundStudyReservation,
  sweepStaleReservations, committedSpend, ceilingStatus,
  STUDY_RESERVE_USD, QUICK_STUDY_RESERVE_USD, GUIDED_STUDY_RESERVE_USD, ASK_RESERVE_USD,
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
    if (/SELECT id FROM study\s/.test(sql)) return { rows: [] }
    if (/SELECT id FROM study_reservation/.test(sql)) return { rows: [] }
    if (/SELECT id FROM ask_reservation/.test(sql)) return { rows: [] }
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
    if (/FROM study_reservation/.test(sql) && /SUM\(reserved_usd\)/.test(sql)) {
      return { rows: [{ in_flight: 0 }] }
    }
    if (/FROM ask_reservation/.test(sql) && /SUM\(reserved_usd\)/.test(sql)) {
      return { rows: [{ in_flight: 0 }] }
    }
    if (/SUM\(reserved_usd\).*AS in_flight/s.test(sql)) {
      let res = 0
      for (const r of rows.values()) res += Number(r.reserved_usd ?? 0)
      return { rows: [{ in_flight: res }] }
    }

    throw new Error('unhandled SQL in fake: ' + sql.slice(0, 60))
  }
}

/**
 * A transaction-aware fake for ASK reservations.
 *
 * Postgres advisory locks live for the whole transaction, not one statement.
 * This mutex therefore holds from BEGIN through COMMIT/ROLLBACK so concurrent
 * requests exercise the same serialization boundary as production.
 */
function fakeAskDb({ ceiling = 50, reconciled = 0, studyHeld = 0 } = {}) {
  const accounts = new Map()
  const installs = new Map()
  const reservations = new Map()
  let transactionTail = Promise.resolve()

  const db = {
    _accounts: accounts,
    _installs: installs,
    _reservations: reservations,
    connect: async () => {
      let unlock
      let turn
      return {
        async query(sql, params = []) {
          if (/^BEGIN/.test(sql)) {
            turn = transactionTail
            transactionTail = new Promise(resolve => { unlock = resolve })
            await turn
            return { rows: [], rowCount: 0 }
          }
          if (/^(COMMIT|ROLLBACK)/.test(sql)) {
            unlock?.()
            unlock = null
            return { rows: [], rowCount: 0 }
          }
          if (/pg_advisory_xact_lock/.test(sql)) return { rows: [], rowCount: 1 }
          return run(sql, params)
        },
        release() {},
      }
    },
    query(sql, params = []) {
      return run(sql, params)
    },
  }
  return db

  async function run(sql, params) {
    if (/SELECT id FROM account/.test(sql) && /deleting_at IS NULL/.test(sql)) {
      return { rows: [{ id: params[0] }] }
    }
    if (/FROM settings/.test(sql)) return { rows: [{ value: String(ceiling) }] }
    if (/FROM usage_event/.test(sql) && /SUM\(usd\)/.test(sql)) {
      return { rows: [{ reconciled }] }
    }
    if (/FROM usage_period/.test(sql) && /SUM\(reserved_usd\)/.test(sql)) {
      return { rows: [{ in_flight: studyHeld }] }
    }
    if (/FROM study_reservation/.test(sql) && /SUM\(reserved_usd\)/.test(sql)) {
      return { rows: [{ in_flight: 0 }] }
    }
    if (/FROM ask_reservation/.test(sql) && /SUM\(reserved_usd\)/.test(sql)) {
      const inFlight = [...reservations.values()]
        .filter(row => row.state === 'held')
        .reduce((sum, row) => sum + row.reserved_usd, 0)
      return { rows: [{ in_flight: inFlight }] }
    }
    if (/SELECT COUNT\(\*\)::int AS count FROM ask_reservation/.test(sql)) {
      const count = [...reservations.values()]
        .filter(row => row.account_id === params[0] && ['held', 'settled'].includes(row.state))
        .length
      return { rows: [{ count }] }
    }
    if (/UPDATE account SET free_asks_used = free_asks_used \+ 1/.test(sql)) {
      const used = accounts.get(params[0]) || 0
      if (used >= params[1]) return { rows: [], rowCount: 0 }
      accounts.set(params[0], used + 1)
      return { rows: [{ free_asks_used: used + 1 }], rowCount: 1 }
    }
    if (/INSERT INTO anon_install \(install_id, asks_used\)/.test(sql)) {
      const used = installs.get(params[0]) || 0
      if (used >= params[1]) return { rows: [], rowCount: 0 }
      installs.set(params[0], used + 1)
      return { rows: [{ asks_used: used + 1 }], rowCount: 1 }
    }
    if (/INSERT INTO ask_reservation/.test(sql)) {
      if (reservations.has(params[0])) throw new Error('duplicate ask reservation')
      reservations.set(params[0], {
        id: params[0], account_id: params[1], install_id: params[2],
        access_kind: params[3], reserved_usd: params[4], state: 'held', stale: false,
      })
      return { rows: [], rowCount: 1 }
    }
    if (/SET state = 'settled'/.test(sql)) {
      const row = reservations.get(params[0])
      if (!row || row.state !== 'held') return { rows: [], rowCount: 0 }
      row.state = 'settled'
      return { rows: [], rowCount: 1 }
    }
    if (/UPDATE ask_reservation SET updated_at = now/.test(sql)) {
      const row = reservations.get(params[0])
      return { rows: [], rowCount: row?.state === 'held' ? 1 : 0 }
    }
    if (/SET state = 'released'/.test(sql) && /RETURNING account_id/.test(sql)) {
      const row = reservations.get(params[0])
      if (!row || row.state !== 'held') return { rows: [], rowCount: 0 }
      if (params[1] && !row.stale) return { rows: [], rowCount: 0 }
      row.state = 'released'
      return { rows: [{
        account_id: row.account_id,
        install_id: row.install_id,
        access_kind: row.access_kind,
      }], rowCount: 1 }
    }
    if (/UPDATE account SET free_asks_used = GREATEST/.test(sql)) {
      accounts.set(params[0], Math.max((accounts.get(params[0]) || 0) - 1, 0))
      return { rows: [], rowCount: 1 }
    }
    if (/UPDATE anon_install SET asks_used = GREATEST/.test(sql)) {
      installs.set(params[0], Math.max((installs.get(params[0]) || 0) - 1, 0))
      return { rows: [], rowCount: 1 }
    }
    throw new Error('unhandled ASK SQL in fake: ' + sql.slice(0, 80))
  }
}

function durableStudyDb({ refreshStudyOnSelect = false } = {}) {
  const periods = new Map()
  const reservations = new Map()
  const topups = new Map()
  const topupDebitGuards = []
  const accountFree = new Map()
  const anonFree = new Map()
  const studies = new Map()
  const key = (accountId, periodStart) => `${accountId}|${new Date(periodStart).toISOString()}`
  const api = {
    _periods: periods,
    _reservations: reservations,
    _topups: topups,
    _topupDebitGuards: topupDebitGuards,
    _accountFree: accountFree,
    _anonFree: anonFree,
    _studies: studies,
    seed({
      id,
      accountId = null,
      installId = null,
      accessKind,
      periodStart = P.periodStart,
      stale = false,
      reading = false,
      retries = 0,
    }) {
      reservations.set(id, {
        id, account_id: accountId, install_id: installId, access_kind: accessKind,
        period_start: periodStart, reserved_usd: STUDY_RESERVE_USD, state: 'held', stale,
      })
      if (reading) studies.set(id, { id, state: 'reading', stale, retries })
    },
    query: run,
    async connect() {
      return { query: run, release() {} }
    },
  }
  return api

  async function run(sql, params = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 }
    if (/INSERT INTO usage_period/.test(sql)) {
      if (params.length === 4) {
        const [accountId, periodStart, , held] = params
        const periodKey = key(accountId, periodStart)
        const row = periods.get(periodKey) || { used: 0, reserved: 0, actual: 0 }
        row.reserved += Number(held || 0)
        periods.set(periodKey, row)
        return { rows: [], rowCount: 1 }
      }
      const [accountId, periodStart, , allowance, held] = params
      const periodKey = key(accountId, periodStart)
      const row = periods.get(periodKey) || { used: 0, reserved: 0, actual: 0 }
      if (row.used >= allowance) return { rows: [] }
      row.used += 1
      row.reserved += Number(held || 0)
      periods.set(periodKey, row)
      return { rows: [{ studies_used: row.used, allowance }] }
    }
    if (/INSERT INTO study_reservation/.test(sql)) {
      reservations.set(params[0], {
        id: params[0], account_id: params[1], install_id: params[2],
        access_kind: params[3], period_start: params[4], reserved_usd: params[5],
        state: 'held', stale: false,
      })
      return { rows: [], rowCount: 1 }
    }
    if (/SET state = 'settled'/.test(sql)) {
      const row = reservations.get(params[0])
      if (!row || row.state !== 'held') return { rows: [], rowCount: 0 }
      row.state = 'settled'
      return { rows: [{ account_id: row.account_id, period_start: row.period_start }], rowCount: 1 }
    }
    if (/SET state = 'held'/.test(sql) && /state = 'settled'/.test(sql)) {
      const row = reservations.get(params[0])
      if (!row || row.state !== 'settled') return { rows: [], rowCount: 0 }
      row.state = 'held'
      row.stale = false
      return { rows: [], rowCount: 1 }
    }
    if (/UPDATE study_reservation SET updated_at = now/.test(sql)) {
      const row = reservations.get(params[0])
      if (row?.state === 'held') row.stale = false
      return { rows: [], rowCount: row?.state === 'held' ? 1 : 0 }
    }
    if (/UPDATE study SET updated_at = now/.test(sql)) {
      const row = studies.get(params[0])
      if (row?.state === 'reading') row.stale = false
      return { rows: [], rowCount: row?.state === 'reading' ? 1 : 0 }
    }
    if (/SET state = \$2/.test(sql) && /FROM|RETURNING/.test(sql)) {
      const row = reservations.get(params[0])
      if (!row || !params[2].includes(row.state)) return { rows: [], rowCount: 0 }
      if (params[3] && !row.stale) return { rows: [], rowCount: 0 }
      row.state = params[1]
      return { rows: [{
        account_id: row.account_id, install_id: row.install_id,
        access_kind: row.access_kind, period_start: row.period_start,
      }], rowCount: 1 }
    }
    if (/SELECT account_id, install_id, access_kind, period_start, state/.test(sql)) {
      const row = reservations.get(params[0])
      return { rows: row?.stale ? [{ ...row }] : [] }
    }
    if (/UPDATE study\s+SET state = CASE/.test(sql)) {
      const row = studies.get(params[0])
      if (!row || row.state !== 'reading' || !row.stale) return { rows: [], rowCount: 0 }
      row.state = row.retries >= params[2] ? 'stranded' : 'analyzed'
      row.retries += 1
      row.stale = false
      return { rows: [{ state: row.state }], rowCount: 1 }
    }
    if (/SET state = 'refunded'/.test(sql) && /RETURNING id/.test(sql)) {
      const row = reservations.get(params[0])
      if (!row || !['held', 'settled'].includes(row.state)) return { rows: [], rowCount: 0 }
      row.state = 'refunded'
      return { rows: [{ id: row.id }], rowCount: 1 }
    }
    if (/SET actual_usd = actual_usd \+ \$3/.test(sql)) {
      const row = periods.get(key(params[0], params[1]))
      if (row) row.actual += Number(params[2])
      return { rows: [], rowCount: row ? 1 : 0 }
    }
    if (/UPDATE anon_install/.test(sql) && /studies_used = GREATEST/.test(sql)) {
      anonFree.set(params[0], Math.max((anonFree.get(params[0]) || 0) - 1, 0))
      return { rows: [], rowCount: 1 }
    }
    if (/SET studies_used = GREATEST\(studies_used - 1, 0\)/.test(sql)) {
      const row = periods.get(key(params[0], params[1]))
      if (row) row.used = Math.max(row.used - 1, 0)
      return { rows: [], rowCount: row ? 1 : 0 }
    }
    if (/SET topup_studies = topup_studies \+ 1/.test(sql)) {
      topups.set(params[0], (topups.get(params[0]) || 0) + 1)
      return { rows: [], rowCount: 1 }
    }
    if (/SET free_studies_used = GREATEST/.test(sql)) {
      accountFree.set(params[0], Math.max((accountFree.get(params[0]) || 0) - 1, 0))
      return { rows: [], rowCount: 1 }
    }
    if (/SELECT id FROM study\s/.test(sql)) {
      return { rows: [...studies.values()].filter(row => row.state === 'reading' && row.stale).map(({ id }) => ({ id })) }
    }
    if (/SELECT id FROM study_reservation/.test(sql)) {
      const selected = [...reservations.values()].filter(row => row.state === 'held' && row.stale).map(({ id }) => ({ id }))
      if (refreshStudyOnSelect) selected.forEach(({ id }) => { reservations.get(id).stale = false })
      return { rows: selected }
    }
    if (/UPDATE usage_period\s+SET reserved_usd = 0/s.test(sql)) return { rows: [], rowCount: 0 }
    if (/SELECT id FROM ask_reservation/.test(sql)) return { rows: [] }
    if (/FROM usage_event/.test(sql) && /SUM\(usd\)/.test(sql)) return { rows: [{ reconciled: 0 }] }
    if (/FROM usage_period/.test(sql) && /SUM\(reserved_usd\)/.test(sql)) return { rows: [{ in_flight: 0 }] }
    if (/FROM study_reservation/.test(sql) && /SUM\(reserved_usd\)/.test(sql)) {
      const inFlight = [...reservations.values()]
        .filter(row => row.state === 'held')
        .reduce((sum, row) => sum + row.reserved_usd, 0)
      return { rows: [{ in_flight: inFlight }] }
    }
    if (/FROM ask_reservation/.test(sql) && /SUM\(reserved_usd\)/.test(sql)) return { rows: [{ in_flight: 0 }] }
    if (/UPDATE account/.test(sql) && /topup_studies = topup_studies - 1/.test(sql)) {
      topupDebitGuards.push(/AND topup_studies > 0/.test(sql))
      const remaining = topups.get(params[0]) || 0
      if (remaining <= 0) return { rows: [] }
      topups.set(params[0], remaining - 1)
      return { rows: [{ topup_studies: remaining - 1 }] }
    }
    if (/SELECT studies_used FROM usage_period/.test(sql)) return { rows: [] }
    throw new Error('unhandled durable-study SQL: ' + sql.replace(/\s+/g, ' ').slice(0, 100))
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

  console.log('\nA LAPSED SUBSCRIBER KEEPS PURCHASED TOP-UPS')
  {
    const db = durableStudyDb()
    db._topups.set('past-due', 1)
    const r = await reserveStudy(db, {
      accountId: 'past-due', allowance: 0, reservationId: 'past-due-topup', ...P,
    })
    ok('a zero recurring allowance can spend a purchased top-up', r.ok && r.fromTopUp)
    ok('the purchased balance is decremented exactly once', db._topups.get('past-due') === 0)
    ok('the in-flight top-up remains visible to the global ceiling',
      (await committedSpend(db)).inFlight === STUDY_RESERVE_USD)
  }

  console.log('\nA ZERO TOP-UP BALANCE NEVER GOES NEGATIVE')
  {
    const db = durableStudyDb()
    db._topups.set('empty-topup', 0)
    const r = await reserveStudy(db, {
      accountId: 'empty-topup', allowance: 0, reservationId: 'unearned-topup', ...P,
    })
    ok('a lapsed account with no purchased top-up is refused',
      !r.ok && r.reason === 'no-allowance')
    ok('the empty purchased balance remains zero', db._topups.get('empty-topup') === 0)
    ok('no unearned study reservation is created', !db._reservations.has('unearned-topup'))
    ok('the issued debit query itself requires a positive balance',
      db._topupDebitGuards.length === 1 && db._topupDebitGuards[0] === true)
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

  console.log('\nA HUMAN-FORMATTED CEILING CANNOT DISABLE THE BRAKE')
  {
    const db = {
      async query(sql) {
        if (/FROM settings/.test(sql)) return { rows: [{ value: '25 USD' }] }
        if (/FROM usage_event/.test(sql)) return { rows: [{ reconciled: 4200 }] }
        if (/FROM (usage_period|study_reservation|ask_reservation)/.test(sql)) {
          return { rows: [{ in_flight: 0 }] }
        }
        throw new Error('unhandled invalid-ceiling SQL: ' + sql.slice(0, 80))
      },
    }
    const originalError = console.error
    const logged = []
    console.error = (...args) => logged.push(args.join(' '))
    try {
      const status = await ceilingStatus(db)
      ok('invalid text falls back to the safe default instead of NaN', status.ceiling === 50)
      ok('a runaway remains blocked when the setting is malformed', status.blockEverything)
      ok('the malformed setting is visible to operators',
        logged.some(message => message.includes('invalid daily_ceiling_usd')))

      const refused = await reserveAsk(fakeAskDb({ ceiling: '25 USD', reconciled: 4200 }), {
        id: 'malformed-ceiling',
        accountId: 'paid-account',
        installId: 'paid-install',
        recurringAccess: true,
        freeLimit: 5,
        dailyLimit: 100,
      })
      ok('the actual request gate refuses spend when the setting is malformed',
        !refused.ok && refused.reason === 'service-paused')

      const freeRefused = await reserveAsk(fakeAskDb({ ceiling: '25 USD', reconciled: 45 }), {
        id: 'malformed-free-ceiling',
        accountId: 'free-account',
        installId: 'free-install',
        recurringAccess: false,
        freeLimit: 5,
        dailyLimit: 100,
      })
      ok('the free-tier request gate also refuses spend when the setting is malformed',
        !freeRefused.ok && freeRefused.reason === 'free-tier-paused')
    } finally {
      console.error = originalError
    }
  }

  console.log('\nBLANK AND ZERO CEILINGS HAVE DISTINCT SAFE MEANINGS')
  {
    const ceilingDb = (value, committed) => ({
      async query(sql) {
        if (/FROM settings/.test(sql)) return { rows: [{ value }] }
        if (/FROM usage_event/.test(sql)) return { rows: [{ reconciled: committed }] }
        if (/FROM (usage_period|study_reservation|ask_reservation)/.test(sql)) {
          return { rows: [{ in_flight: 0 }] }
        }
        throw new Error('unhandled zero-ceiling SQL: ' + sql.slice(0, 80))
      },
    })
    const originalError = console.error
    let logged = []
    console.error = (...args) => logged.push(args.join(' '))
    try {
      const blank = await ceilingStatus(ceilingDb('   ', 10))
      const blankLogged = logged.some(message => message.includes('invalid daily_ceiling_usd'))
      logged = []
      const stopped = await ceilingStatus(ceilingDb('0', 10))
      const zeroLogged = logged.some(message => message.includes('invalid daily_ceiling_usd'))
      ok('blank text falls back to $50 and logs instead of causing a silent outage',
        blank.ceiling === 50 && blankLogged)
      ok('explicit zero is an emergency full stop once money is committed',
        stopped.ceiling === 0 && stopped.ratio === Infinity && stopped.blockEverything && !zeroLogged)

      const stoppedWhileIdle = await reserveAsk(fakeAskDb({ ceiling: '0', reconciled: 0 }), {
        id: 'zero-ceiling-idle',
        accountId: 'paid-account',
        installId: 'paid-install',
        recurringAccess: true,
        freeLimit: 5,
        dailyLimit: 100,
      })
      ok('explicit zero refuses the next request even before prior spend is committed',
        !stoppedWhileIdle.ok && stoppedWhileIdle.reason === 'service-paused')
    } finally {
      console.error = originalError
    }
  }

  console.log('\nASKS ARE RESERVED BEFORE THE MODEL RUNS')
  {
    const db = fakeAskDb()
    const attempts = Array.from({ length: 200 }, (_, index) => reserveAsk(db, {
      id: `paid-${index}`,
      accountId: 'paid-account',
      installId: 'paid-install',
      recurringAccess: true,
      freeLimit: 5,
      dailyLimit: 100,
    }))
    const results = await Promise.all(attempts)
    const allowed = results.filter(result => result.ok)
    ok('exactly 100 of 200 simultaneous paid asks win', allowed.length === 100,
      `${allowed.length} were allowed`)
    ok('the durable ledger never exceeds the daily allowance',
      [...db._reservations.values()].filter(row => row.state === 'held').length === 100)
    ok('the global brake sees every ask still in flight',
      Math.abs((await committedSpend(db)).inFlight - (100 * ASK_RESERVE_USD)) < 0.000001)
  }

  console.log('\nA FAILED FREE ASK REFUNDS EXACTLY ONCE')
  {
    const db = fakeAskDb()
    const claimed = await reserveAsk(db, {
      id: 'free-failure', accountId: 'free-account', installId: 'free-install',
      recurringAccess: false, freeLimit: 5, dailyLimit: 100,
    })
    const usedAfterClaim = db._accounts.get('free-account')
    const released = await releaseAskReservation(db, 'free-failure')
    const replayed = await releaseAskReservation(db, 'free-failure')
    ok('the free ask is claimed before work begins', claimed.ok && usedAfterClaim === 1)
    ok('the first failure releases the reservation', released)
    ok('a duplicate failure cannot refund it twice', !replayed && db._accounts.get('free-account') === 0)
  }

  console.log('\nTHE GLOBAL ASK CEILING CANNOT BE BURST THROUGH')
  {
    const db = fakeAskDb({ ceiling: 0.10 })
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => reserveAsk(db, {
      id: `ceiling-${index}`,
      accountId: 'ceiling-account',
      installId: 'ceiling-install',
      recurringAccess: true,
      freeLimit: 5,
      dailyLimit: 100,
    })))
    const allowed = results.filter(result => result.ok)
    ok('only the reservation that fits beneath the hard stop runs', allowed.length === 1,
      `${allowed.length} were allowed`)
    ok('later requests see the first hold before deciding',
      results.slice(1).every(result => !result.ok && result.reason === 'service-paused'))
    await settleAskReservation(db, allowed[0].id)
  }

  console.log('\nEVERY STUDY HOLD HAS A DURABLE OWNER')
  {
    const db = durableStudyDb()
    const claim = await reserveStudy(db, {
      accountId: 'paid-account', allowance: 40,
      reservationId: 'study-durable', ...P,
    })
    const period = db._periods.get('paid-account|2026-08-01T00:00:00.000Z')
    ok('the allowance and reservation are created together', claim.ok && db._reservations.has('study-durable'))
    ok('the legacy aggregate does not double-count the durable hold', period.reserved === 0)
    ok('the global brake sees the durable hold', (await committedSpend(db)).inFlight === STUDY_RESERVE_USD)

    const settled = await settleStudyReservation(db, { reservationId: 'study-durable', actualUsd: 0.22 })
    ok('settlement is idempotently attached to that study', settled && db._reservations.get('study-durable').state === 'settled')
    ok('actual cost reaches the billing-period ledger', period.actual === 0.22)
    const refunded = await refundStudyReservation(db, 'study-durable')
    const duplicate = await refundStudyReservation(db, 'study-durable')
    ok('a stranded settled study restores its exact allowance once', refunded && period.used === 0)
    ok('a replay cannot refund the allowance twice', !duplicate && period.used === 0)
  }

  console.log('\nQUICK STUDIES HOLD ONLY THEIR REAL WORST CASE')
  {
    const db = durableStudyDb()
    const claim = await reserveStudy(db, {
      accountId: 'quick-account', allowance: 40,
      reservationId: 'quick-durable', reserveUsd: QUICK_STUDY_RESERVE_USD, ...P,
    })
    const reservation = db._reservations.get('quick-durable')
    ok('the quick lookup still owns a durable reservation', claim.ok && Boolean(reservation))
    ok('one Haiku lookup does not hold the full desktop pipeline amount',
      reservation.reserved_usd === QUICK_STUDY_RESERVE_USD && QUICK_STUDY_RESERVE_USD < STUDY_RESERVE_USD)
  }

  console.log('\nGUIDED STUDIES HOLD THEIR BOUNDED WORST CASE')
  {
    const db = durableStudyDb()
    const claim = await reserveStudy(db, {
      accountId: 'guided-account', allowance: 40,
      reservationId: 'guided-durable', reserveUsd: GUIDED_STUDY_RESERVE_USD, ...P,
    })
    const reservation = db._reservations.get('guided-durable')
    ok('the guided study still owns a durable reservation', claim.ok && Boolean(reservation))
    ok('the tablet study holds more than quick lookup but less than the desktop pipeline',
      reservation.reserved_usd === GUIDED_STUDY_RESERVE_USD
      && GUIDED_STUDY_RESERVE_USD > QUICK_STUDY_RESERVE_USD
      && GUIDED_STUDY_RESERVE_USD < STUDY_RESERVE_USD)
  }

  console.log('\nTHE READ HALF REOPENS THE SAME HOLD')
  {
    const db = durableStudyDb()
    const claim = await reserveStudy(db, {
      accountId: 'read-account', allowance: 40, reservationId: 'study-read', ...P,
    })
    await settleStudyReservation(db, { reservationId: 'study-read', actualUsd: 0.20 })
    const before = db._periods.get('read-account|2026-08-01T00:00:00.000Z')
    const held = await holdStudyReservationForReading(db, 'study-read')
    ok('the read reuses the existing reservation', claim.ok && held && before.used === 1)
    ok('the global brake sees the read in flight', (await committedSpend(db)).inFlight === STUDY_RESERVE_USD)
    await settleStudyReservation(db, { reservationId: 'study-read', actualUsd: 0.31 })
    ok('finishing the read still costs only one study', before.used === 1)
    ok('both phases are booked to actual spend', before.actual === 0.51)
  }

  console.log('\nACTIVE RESERVATIONS KEEP THEIR LEASE')
  {
    const studyDb = durableStudyDb()
    studyDb.seed({ id: 'study-live', accountId: 'paid', accessKind: 'recurring' })
    ok('a running study heartbeat renews its hold', await heartbeatStudyReservation(studyDb, 'study-live'))
    const askDb = fakeAskDb()
    await reserveAsk(askDb, {
      id: 'ask-live', accountId: 'paid', installId: 'phone', recurringAccess: true,
      freeLimit: 5, dailyLimit: 100,
    })
    ok('a running ask heartbeat renews its hold', await heartbeatAskReservation(askDb, 'ask-live'))
  }

  console.log('\nCRASH RECOVERY RESTORES THE RIGHT KIND OF CREDIT')
  {
    const db = durableStudyDb()
    db._periods.set('paid|2026-08-01T00:00:00.000Z', { used: 1, reserved: 0, actual: 0 })
    db._topups.set('topup-account', 0)
    db._accountFree.set('free-account', 1)
    db._anonFree.set('anon-install', 1)
    db.seed({ id: 'stale-paid', accountId: 'paid', accessKind: 'recurring', stale: true })
    db.seed({ id: 'stale-topup', accountId: 'topup-account', accessKind: 'topup', stale: true })
    db.seed({ id: 'stale-free', accountId: 'free-account', accessKind: 'account_free', stale: true })
    db.seed({ id: 'stale-anon', installId: 'anon-install', accessKind: 'anon_free', stale: true })

    const swept = await sweepStaleReservations(db)
    ok('all four crashed reservations are reclaimed', swept === 4)
    ok('a recurring study returns to its monthly allowance', db._periods.get('paid|2026-08-01T00:00:00.000Z').used === 0)
    ok('a top-up returns to the purchased top-up balance', db._topups.get('topup-account') === 1)
    ok('an account free study returns to its lifetime counter', db._accountFree.get('free-account') === 0)
    ok('an anonymous free study returns to its install counter', db._anonFree.get('anon-install') === 0)
    ok('running the sweeper again changes nothing', (await sweepStaleReservations(db)) === 0)
    ok('an explicit duplicate release changes nothing', !(await releaseStudyReservation(db, 'stale-paid')))
  }

  console.log('\nA HEARTBEAT WINS THE SWEEPER RACE')
  {
    const db = durableStudyDb({ refreshStudyOnSelect: true })
    db._periods.set('paid|2026-08-01T00:00:00.000Z', { used: 1, reserved: 0, actual: 0 })
    db.seed({ id: 'race-live', accountId: 'paid', accessKind: 'recurring', stale: true })
    const swept = await sweepStaleReservations(db)
    ok('a renewed hold is not released from a stale candidate list', swept === 0)
    ok('the live study keeps its allowance', db._periods.get('paid|2026-08-01T00:00:00.000Z').used === 1)
    ok('the live reservation remains held', db._reservations.get('race-live').state === 'held')
  }

  console.log('\nAN ASK HEARTBEAT WINS THE SWEEPER RACE')
  {
    const db = fakeAskDb()
    await reserveAsk(db, {
      id: 'ask-race', accountId: 'paid', installId: 'phone', recurringAccess: true,
      freeLimit: 5, dailyLimit: 100,
    })
    await heartbeatAskReservation(db, 'ask-race')
    const released = await releaseAskReservation(db, 'ask-race', { staleOnly: true })
    ok('a renewed ask cannot be released from a stale candidate list', !released)
    ok('the renewed ask remains held', db._reservations.get('ask-race').state === 'held')
  }

  console.log('\nA CRASHED READ BECOMES RETRYABLE WITHOUT A REFUND')
  {
    const db = durableStudyDb()
    db._periods.set('paid|2026-08-01T00:00:00.000Z', { used: 1, reserved: 0, actual: 0 })
    db.seed({ id: 'read-crash', accountId: 'paid', accessKind: 'recurring', stale: true, reading: true })
    const swept = await sweepStaleReservations(db)
    ok('the crashed read is recovered', swept === 1)
    ok('the study may be retried', db._studies.get('read-crash').state === 'analyzed')
    ok('the original study stays charged', db._periods.get('paid|2026-08-01T00:00:00.000Z').used === 1)
    ok('the abandoned read hold is settled', db._reservations.get('read-crash').state === 'settled')
  }

  console.log('\nA DELETED INSTALL CANNOT MINT ANOTHER FREE STUDY')
  {
    const db = {
      query: async (sql) => {
        if (/FROM free_trial_tombstone/.test(sql)) return { rows: [{ studies_used: 1 }] }
        throw new Error('the tombstone should refuse before any allowance write')
      },
    }
    const claim = await reserveAnonymousStudy(db, {
      installId: 'deleted-install', identityHash: 'deadbeef', lifetimeStudies: 1,
      periodStart: P.periodStart, periodEnd: P.periodEnd, reservationId: 'should-not-exist',
    })
    ok('the tombstone blocks the second anonymous trial', !claim.ok && claim.used === 1)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
