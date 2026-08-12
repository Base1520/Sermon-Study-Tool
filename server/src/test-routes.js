// Route-level tests: identity, the free-study gate, and the money-safety
// invariants that only show up when the pieces are wired together.
//
// No network, no Postgres, no Stripe, no model calls. The fakes model the
// behaviour that matters — the atomic guard on the anonymous install row, and
// the fact that a failed study must give the allowance back.
//
//   node server/src/test-routes.js

const auth = require('./auth')
const { entitlementFor, upgradePrompt } = require('./entitlement')
const meter = require('./meter')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Fake DB covering only what these paths touch. Writes serialise, as a row lock does. */
function fakeDb() {
  const devices = new Map()      // token_hash -> row
  const anon = new Map()         // install_id -> studies_used
  const periods = new Map()
  let queue = Promise.resolve()
  const api = {
    _devices: devices, _anon: anon, _periods: periods,
    query(sql, params) { queue = queue.then(() => run(sql, params)); return queue },
  }
  return api

  function run(sql, p) {
    if (/FROM device d/.test(sql)) {
      const row = devices.get(p[0])
      return { rows: row ? [row] : [] }
    }
    if (/UPDATE device SET last_seen_at/.test(sql)) return { rows: [] }
    if (/INSERT INTO anon_install/.test(sql)) {
      const [installId, limit] = p
      const used = anon.get(installId) ?? 0
      if (used < limit) { anon.set(installId, used + 1); return { rows: [{ studies_used: used + 1 }] } }
      return { rows: [] }                     // the guard refused
    }
    if (/INSERT INTO usage_period/.test(sql)) {
      const [acct, start, , allowance, reserve] = p
      const k = acct + '|' + start
      const r = periods.get(k)
      if (!r) { periods.set(k, { used: 1, reserved: reserve, actual: 0, at: Date.now() }); return { rows: [{ studies_used: 1, allowance }] } }
      if (r.used < allowance) { r.used++; r.reserved += reserve; return { rows: [{ studies_used: r.used, allowance }] } }
      return { rows: [] }
    }
    if (/SELECT studies_used FROM usage_period/.test(sql)) {
      const r = periods.get(p[0] + '|' + p[1])
      return { rows: r ? [{ studies_used: r.used }] : [] }
    }
    if (/SET studies_used = GREATEST/.test(sql)) {
      const r = periods.get(p[0] + '|' + p[1])
      if (r) { r.used = Math.max(r.used - 1, 0); r.reserved = Math.max(r.reserved - p[2], 0) }
      return { rows: [], rowCount: 1 }
    }
    if (/UPDATE account/.test(sql) && /topup_studies/.test(sql)) return { rows: [] }
    if (/SUM\(usd\).*AS reconciled/s.test(sql)) {
      // Reconciled spend now comes from usage_event; this fake has none, so the
      // committed total is carried entirely by live reservations.
      return { rows: [{ reconciled: 0 }] }
    }
    if (/SUM\(reserved_usd\).*AS in_flight/s.test(sql)) {
      let res = 0
      for (const r of periods.values()) res += r.reserved
      return { rows: [{ in_flight: res }] }
    }
    if (/FROM settings/.test(sql)) return { rows: [{ value: '50' }] }
    throw new Error('unhandled SQL: ' + sql.slice(0, 50))
  }
}

;(async () => {
  console.log('\nIDENTITY NEVER LOCKS ANYONE OUT')
  {
    const db = fakeDb()
    const anon = await auth.identify(db, { installId: 'install-1' })
    ok('no token means anonymous, not 401', anon.anonymous && anon.account === null)
    ok('the install is still identified', anon.installId === 'install-1')

    const stale = await auth.identify(db, { authorization: 'Bearer opr_nonsense', installId: 'i2' })
    ok('an unknown token degrades without trusting its install header',
       stale.anonymous && stale.staleToken && stale.installId === null)

    db._devices.set(auth.hash('opr_good'), {
      device_id: 'd1', revoked_at: null, id: 'acct-1', email: 'a@b.c',
      plan: 'standard', status: 'active', paid_through: null,
      stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
    })
    const known = await auth.identify(db, { authorization: 'Bearer opr_good' })
    ok('a good token resolves the account', !known.anonymous && known.account.plan === 'standard')

    db._devices.get(auth.hash('opr_good')).revoked_at = new Date()
    const revoked = await auth.identify(db, { authorization: 'Bearer opr_good', installId: 'claimed-install' })
    ok('a revoked token loses access to its claimed install identity',
       revoked.anonymous && revoked.installId === null)

    let outageStatus = 0
    let outageBody = null
    let outageNext = false
    await auth.middleware({ query: async () => { throw new Error('database unavailable') } })(
      {
        get(name) {
          if (name === 'authorization') return 'Bearer opr_existing'
          if (name === 'x-install-id') return 'install-existing'
          return null
        },
      },
      {
        status(value) { outageStatus = value; return this },
        json(value) { outageBody = value; return this },
      },
      () => { outageNext = true },
    )
    ok('an auth outage never turns a signed-in device into anonymous', outageStatus === 503 && outageBody?.error === 'AUTH_UNAVAILABLE' && !outageNext)
  }

  console.log('\nTHE FREE STUDY IS EXACTLY ONE, AND IT IS ATOMIC')
  {
    const db = fakeDb()
    const ent = entitlementFor(null)
    const claim = () => db.query('INSERT INTO anon_install ...', ['install-x', ent.lifetimeStudies])

    const first = await claim()
    ok('the first free study is granted', first.rows.length === 1)
    const second = await claim()
    ok('the second is refused', second.rows.length === 0)

    // Two clicks at the same instant on a fresh install.
    const db2 = fakeDb()
    const [a, b] = await Promise.all([
      db2.query('INSERT INTO anon_install ...', ['race', 1]),
      db2.query('INSERT INTO anon_install ...', ['race', 1]),
    ])
    const granted = [a, b].filter(r => r.rows.length === 1).length
    ok('two simultaneous requests cannot both take the one free study', granted === 1,
       `${granted} granted`)
  }

  console.log('\nA FAILED STUDY GIVES THE ALLOWANCE BACK')
  {
    const db = fakeDb()
    const acct = { accountId: 'acct-1', allowance: 5, periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-09-01T00:00:00Z' }
    await meter.reserveStudy(db, acct)
    const k = 'acct-1|2026-08-01T00:00:00Z'
    ok('the study is claimed up front', db._periods.get(k).used === 1)
    await meter.releaseStudy(db, { accountId: 'acct-1', periodStart: acct.periodStart })
    ok('a study that never ran is refunded', db._periods.get(k).used === 0)
    ok('and its reservation is released', db._periods.get(k).reserved === 0)
  }

  console.log('\nWHAT THE USER IS TOLD WHEN THE DOOR CLOSES')
  {
    const free = upgradePrompt(entitlementFor(null))
    ok('the free wall names the moment', free.code === 'FREE_STUDY_SPENT')
    ok('it promises the study stays', /stays here/i.test(free.body))
    ok('it offers real plans, not a generic upsell',
       free.actions.every(a => /\$\d+/.test(a.label)))

    const paid = upgradePrompt(entitlementFor({ plan: 'starter', status: 'active' }))
    ok('the paid wall reassures before selling', /nothing you paid for goes away/i.test(paid.body))
  }

  console.log('\nA PAST-DUE CARD STOPS THE SPEND, NOT THE MAN')
  {
    const e = entitlementFor({ plan: 'standard', status: 'past_due' })
    ok('the allowance is gone', e.allowance === 0)
    ok('the library is not', e.library)
    ok('and he is not billed as active', !e.paying)
  }

  console.log('\nTHE GLOBAL BRAKE IS WIRED TO IN-FLIGHT MONEY')
  {
    const db = fakeDb()
    for (let i = 0; i < 80; i++) {
      await meter.reserveStudy(db, { accountId: 'a' + i, allowance: 10, periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-09-01T00:00:00Z' })
    }
    const s = await meter.ceilingStatus(db)
    ok('committed money is counted even before anything reconciles', s.committed > 0)
    ok('and it trips the signup block', s.blockNewSignups)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
