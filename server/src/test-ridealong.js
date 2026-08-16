// A study is charged ONCE, even though it runs in two halves.
//
// /v1/analyze reserves, spends and settles. /v1/read then rides that same claim.
// Every rule that keeps this from either double-billing an honest user or
// handing a dishonest one free work is asserted here.
//
//   node server/src/test-ridealong.js

const meter = require('./meter')
const engine = require('./engine')
const readResume = require('./read-resume')

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
  const accounts = new Map()   // id -> { topup_studies }
  const studies = new Map()
  const reservations = new Map() // id -> { state }
  let queue = Promise.resolve()
  const api = {
    _periods: periods, _events: events, _accounts: accounts, _studies: studies, _reservations: reservations,
    setTopUp: (id, n) => accounts.set(id, { topup_studies: n }),
    setStudy: (id, study) => studies.set(id, { id, ...study }),
    setReservation: (id, state) => reservations.set(id, { state }),
    row: (a, s) => periods.get(a + '|' + s),
    addEvent: (e) => events.push(e),
    // A rejection belongs to the caller that asked; it must not poison the
    // serial queue for every query after it (a real row lock releases on error).
    query(sql, params) { const p = queue.then(() => run(sql, params)); queue = p.catch(() => {}); return p },
  }
  return api

  function run(sql, p) {
    if (/SELECT id FROM account/.test(sql) && /deleting_at IS NULL/.test(sql)) {
      return { rows: [{ id: p[0] }], rowCount: 1 }
    }
    if (/UPDATE study\s+SET state = 'reading'/.test(sql)) {
      const row = studies.get(p[0])
      const owns = /account_id = \$2/.test(sql)
        ? row?.account_id === p[1]
        : row?.install_id === p[1] && !row?.account_id
      if (!row || !owns || row.state !== 'analyzed') return { rows: [], rowCount: 0 }
      row.state = 'reading'
      return { rows: [{ id: row.id }], rowCount: 1 }
    }
    // MUST come before the generic study-state read below: that pattern also
    // matches 'SELECT state FROM study_reservation' and would answer for it.
    if (/UPDATE study_reservation\s+SET state = 'held'/.test(sql)) {
      if (api.failReservationHolds) throw new Error('synthetic reservation hold failure')
      const r = reservations.get(p[0])
      if (!r || r.state !== 'settled') return { rows: [], rowCount: 0 }
      r.state = 'held'
      return { rows: [], rowCount: 1 }
    }
    if (/SELECT state FROM study_reservation/.test(sql)) {
      if (api.failReservationReads) throw new Error('synthetic reservation read failure')
      const r = reservations.get(p[0])
      return { rows: r ? [{ state: r.state }] : [], rowCount: r ? 1 : 0 }
    }
    if (/UPDATE study SET state = 'stranded'/.test(sql)) {
      const row = studies.get(p[0])
      if (!row || row.state !== 'reading') return { rows: [], rowCount: 0 }
      row.state = 'stranded'
      return { rows: [], rowCount: 1 }
    }
    if (/UPDATE study SET state = 'analyzed'/.test(sql)) {
      const row = studies.get(p[0])
      if (!row || row.state !== 'reading') return { rows: [], rowCount: 0 }
      row.state = 'analyzed'
      return { rows: [], rowCount: 1 }
    }
    if (/SELECT document FROM study/.test(sql)) {
      const row = studies.get(p[0])
      const owns = /account_id = \$2/.test(sql)
        ? row?.account_id === p[1]
        : row?.install_id === p[1] &&
          (!/account_id IS NULL/.test(sql) || !row?.account_id)
      const found = row && owns && row.state === 'done' && row.document != null
      return { rows: found ? [{ document: row.document }] : [] }
    }
    if (/SELECT state FROM study/.test(sql)) {
      const row = studies.get(p[0])
      const owns = /account_id = \$2/.test(sql)
        ? row?.account_id === p[1]
        : row?.install_id === p[1] && !row?.account_id
      return { rows: row && owns ? [{ state: row.state }] : [] }
    }
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
    if (/AND install_id = \$2 AND account_id IS NULL/.test(sql)) {
      return { rows: events.filter(e =>
        e.study_id === p[0] && e.install_id === p[1] && !e.account_id).slice(0, 1) }
    }
    if (/WHERE study_id = \$1 AND account_id = \$2/.test(sql)) {
      return { rows: events.filter(e => e.study_id === p[0] && e.account_id === p[1]).slice(0, 1) }
    }
    if (/SUM\(usd\).*AS reconciled/s.test(sql)) {
      return { rows: [{ reconciled: events.reduce((n, e) => n + e.usd, 0) }] }
    }
    if (/SUM\(reserved_usd\).*AS in_flight/s.test(sql)) {
      let res = 0
      for (const r of periods.values()) res += r.reserved
      return { rows: [{ in_flight: res }] }
    }
    if (/SUM\(usd\)/.test(sql)) {
      const usd = events.filter(e => e.study_id === p[0]).reduce((n, e) => n + e.usd, 0)
      return { rows: [{ usd }] }
    }
    if (/UPDATE account/.test(sql) && /topup_studies = topup_studies - 1/.test(sql)) {
      const a = accounts.get(p[0])
      if (a && a.topup_studies > 0) { a.topup_studies--; return { rows: [{ topup_studies: a.topup_studies }] } }
      return { rows: [] }
    }
    if (/FROM settings/.test(sql)) return { rows: [{ value: '50' }] }
    throw new Error('unhandled SQL: ' + sql.replace(/\s+/g, ' ').slice(0, 70))
  }
}

// The two guards, exactly as engine.js implements them.
const studyBelongsTo = async (db, studyId, { accountId, installId }) => {
  if (!studyId) return false
  if (accountId) {
    const { rows } = await db.query('WHERE study_id = $1 AND account_id = $2', [studyId, accountId])
    return rows.length > 0
  }
  if (!installId) return false
  const { rows } = await db.query('AND install_id = $2 AND account_id IS NULL', [studyId, installId])
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
    const rides = !!studyId && await studyBelongsTo(db, studyId, { accountId: ACCT }) && !(await studyHasDocument(db, studyId))
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

    const again = !!studyId && await studyBelongsTo(db, studyId, { accountId: ACCT }) && !(await studyHasDocument(db, studyId))
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
       (await studyBelongsTo(db, 'study-C', { accountId: ACCT })) === false)
    ok('an invented study id is refused',
       (await studyBelongsTo(db, 'no-such-study', { accountId: ACCT })) === false)
  }

  console.log('\nSIMULTANEOUS READS NEVER BUY A SECOND STUDY')
  {
    const db = fakeDb()
    db.setStudy('study-race', { account_id: ACCT, install_id: 'install-1', state: 'analyzed' })
    const [first, second] = await Promise.all([
      engine.claimStudyForReading(db, { studyId: 'study-race', accountId: ACCT }),
      engine.claimStudyForReading(db, { studyId: 'study-race', accountId: ACCT }),
    ])
    ok('exactly one request takes the reading claim', [first, second].filter(Boolean).length === 1)
    ok('the losing request sees work already in progress',
      await engine.ownedStudyState(db, { studyId: 'study-race', accountId: ACCT }) === 'reading')
    ok('no new allowance was consumed by the loser', db._periods.size === 0)

    db._studies.get('study-race').state = 'done'
    ok('a finished replay is distinguishable from a missing id',
      await engine.ownedStudyState(db, { studyId: 'study-race', accountId: ACCT }) === 'done')
    ok('another account cannot inspect that state',
      await engine.ownedStudyState(db, { studyId: 'study-race', accountId: 'someone-else' }) === null)
  }

  console.log('\nTHE FREE STUDY DELIVERS A WHOLE STUDY')
  {
    // The bug this replaces: anonymous callers were refused the ride, so a free
    // user spent their one credit on the analysis and was shown a paywall
    // instead of the document — a paywall whose own words promised a document
    // that had never been written. This is the first screen every downloader
    // sees, so it is the most expensive bug in the product.
    const db = fakeDb()
    db.addEvent({ study_id: 'study-D', account_id: null, install_id: 'install-1', label: 'analyze.core', usd: 0.2 })

    ok('a free user may finish the study they already paid for',
       (await studyBelongsTo(db, 'study-D', { accountId: null, installId: 'install-1' })) === true)
    ok('but only for a study that has not produced a document yet',
       (await studyHasDocument(db, 'study-D')) === false)

    // ...and once it has, the ride is over.
    db.addEvent({ study_id: 'study-D', account_id: null, install_id: 'install-1', label: 'plain-read', usd: 0.3 })
    ok('a second document on the same free credit is refused',
       (await studyHasDocument(db, 'study-D')) === true)

    ok('another install cannot ride it',
       (await studyBelongsTo(db, 'study-D', { accountId: null, installId: 'install-2' })) === false)
    ok('and neither can a caller with no install id',
       (await studyBelongsTo(db, 'study-D', { accountId: null, installId: null })) === false)
    ok('a missing study id is refused outright',
       (await studyBelongsTo(db, undefined, { accountId: ACCT })) === false)
  }

  console.log('\nA LEAKED STUDY ID CANNOT RIDE A PAYING MAN\'S RESERVATION')
  {
    const db = fakeDb()
    // A subscriber's study. An anonymous caller who somehow learned its id...
    db.addEvent({ study_id: 'study-E', account_id: ACCT, install_id: 'install-9', label: 'analyze.core', usd: 0.2 })
    ok('...cannot ride it anonymously, because the row has an account on it',
       (await studyBelongsTo(db, 'study-E', { accountId: null, installId: 'install-9' })) === false)
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

  console.log('\nA TERMINAL RESERVATION STRANDS THE CLAIM INSTEAD OF LOOPING')
  {
    // The permanent 409 this kills: a settle failure after /v1/analyze left the
    // hold for the sweep to refund, the study stayed 'analyzed' with no
    // document, and every resume then claimed 'reading', failed the hold,
    // reset to 'analyzed' and told the reader to try again — the identical
    // retry, forever, with the retry counter never moving. Stranding the claim
    // hands the NEXT request to the fresh-claim path, which finishes the study
    // under a new reservation.
    //
    // DRIVEN THROUGH read-resume.js — the code the route runs — not through
    // the helpers by hand. The first version called strand/reset itself in the
    // right order, so swapping them at the route's call site kept every
    // assertion green. Now the module IS the call site.
    const db = fakeDb()
    db.setStudy('study-dead', { account_id: ACCT, install_id: 'install-1', state: 'analyzed' })
    db.setReservation('study-dead', 'refunded')

    ok('the claim still rides an analyzed study',
       await engine.claimStudyForReading(db, { studyId: 'study-dead', accountId: ACCT }) === true)
    ok('the hold refuses a refunded reservation',
       await meter.holdStudyReservationForReading(db, 'study-dead') === false)

    const resolved = await readResume.resolveFailedReadHold(db, 'study-dead')
    ok('the resolver strands a refunded reservation', resolved.kind === 'stranded')
    ok('the study is stranded', db._studies.get('study-dead').state === 'stranded')
    ok('the answer is a 409 whose copy promises a fresh restart',
       resolved.status === 409 && /restart fresh/.test(resolved.body.message))
    ok('a stranded study cannot be re-claimed for riding',
       await engine.claimStudyForReading(db, { studyId: 'study-dead', accountId: ACCT }) === false)
    ok('its state is neither reading nor done, so the route falls to a fresh claim',
       await engine.ownedStudyState(db, { studyId: 'study-dead', accountId: ACCT }) === 'stranded')
  }

  console.log('\nA PROVEN-ABSENT RESERVATION ALSO STRANDS')
  {
    const db = fakeDb()
    db.setStudy('study-gone', { account_id: ACCT, install_id: 'install-1', state: 'analyzed' })
    // no reservation row at all
    ok('the claim rides', await engine.claimStudyForReading(db, { studyId: 'study-gone', accountId: ACCT }) === true)
    ok('a missing reservation reads as null, not a throw',
       await meter.studyReservationState(db, 'study-gone') === null)
    const resolved = await readResume.resolveFailedReadHold(db, 'study-gone')
    ok('the resolver strands a proven-absent reservation', resolved.kind === 'stranded')
    ok('the study is stranded', db._studies.get('study-gone').state === 'stranded')
  }

  console.log('\nA FAILED RESERVATION READ DECIDES NOTHING')
  {
    // Defect found in audit: the first version caught a query failure as null
    // and null classified as terminal — a database hiccup stranded the study
    // and promised a fresh restart (a fresh CHARGE) while the unseen row might
    // still be financially live. Unknown is not absent.
    const db = fakeDb()
    db.setStudy('study-blind', { account_id: ACCT, install_id: 'install-1', state: 'analyzed' })
    db.setReservation('study-blind', 'settled')   // financially live, but unreadable
    ok('the claim rides', await engine.claimStudyForReading(db, { studyId: 'study-blind', accountId: ACCT }) === true)

    db.failReservationReads = true
    const resolved = await readResume.resolveFailedReadHold(db, 'study-blind')
    ok('a failed read resolves as unknown, never stranded', resolved.kind === 'unknown')
    ok('the study goes back to analyzed, not stranded',
       db._studies.get('study-blind').state === 'analyzed')
    ok('the copy says try again — it does not promise a restart',
       resolved.status === 409 && /try again/.test(resolved.body.message) && !/restart fresh/.test(resolved.body.message))

    // the hiccup clears; the SAME study now resumes on the designed path
    db.failReservationReads = false
    ok('after the hiccup the claim rides again',
       await engine.claimStudyForReading(db, { studyId: 'study-blind', accountId: ACCT }) === true)
    ok('and the still-settled money re-arms — no second charge ever existed',
       await meter.holdStudyReservationForReading(db, 'study-blind') === true)
  }

  console.log('\nTHE RIDE IS ONE QUESTION, AND THE MODULE ANSWERS ALL OF IT')
  {
    // Three audits taught the shape of this test. The helpers-in-order version
    // missed a strand/reset swap at the call site. The resolver-as-call-site
    // version missed a generic 409 replacing the call. The structural block
    // guard missed a second `if (!held)` inserted ahead of it. Every bypass
    // needed `held` in the route — so the hold moved INTO the module, the
    // route asks one question, and this suite drives that one question across
    // every reservation state the schema can produce.
    const db = fakeDb()
    db.setStudy('ride-ok', { account_id: ACCT, install_id: 'install-1', state: 'analyzed' })
    db.setReservation('ride-ok', 'settled')
    const okRide = await readResume.rideOrResolve(db, 'ride-ok')
    ok('settled money arms and the ride proceeds', okRide.ok === true)
    ok('the settled reservation is now held', db._reservations.get('ride-ok').state === 'held')

    db.setStudy('ride-dead', { account_id: ACCT, install_id: 'install-1', state: 'reading' })
    db.setReservation('ride-dead', 'refunded')
    const dead = await readResume.rideOrResolve(db, 'ride-dead')
    ok('refunded money refuses and strands', dead.ok === false && dead.kind === 'stranded')
    ok('the dead study is stranded', db._studies.get('ride-dead').state === 'stranded')

    db.setStudy('ride-gone', { account_id: ACCT, install_id: 'install-1', state: 'reading' })
    const gone = await readResume.rideOrResolve(db, 'ride-gone')
    ok('proven-absent money refuses and strands', gone.ok === false && gone.kind === 'stranded')

    db.setStudy('ride-race', { account_id: ACCT, install_id: 'install-1', state: 'reading' })
    db.setReservation('ride-race', 'held')
    const race = await readResume.rideOrResolve(db, 'ride-race')
    ok('a transient state refuses and resets', race.ok === false && race.kind === 'reset')
    ok('the racing study is back to analyzed', db._studies.get('ride-race').state === 'analyzed')

    db.setStudy('ride-blind', { account_id: ACCT, install_id: 'install-1', state: 'reading' })
    // NOT 'settled' — a settled reservation would simply arm and ride. The
    // blind case is: the hold loses (state 'held'), and THEN the diagnostic
    // read fails, so the resolver must refuse as unknown.
    db.setReservation('ride-blind', 'held')
    db.failReservationReads = true
    const blind = await readResume.rideOrResolve(db, 'ride-blind')
    db.failReservationReads = false
    ok('a failed read refuses as unknown, deciding nothing',
       blind.ok === false && blind.kind === 'unknown')
    ok('the blind study went back to analyzed, never stranded',
       db._studies.get('ride-blind').state === 'analyzed')
  }

  console.log('\nA FAILED HOLD QUERY DECIDES NOTHING')
  {
    // The route claims first. If the very next hold query throws, propagating
    // that exception leaves the study stuck in reading and every retry sees
    // STUDY_IN_PROGRESS. Unknown is not terminal: reset and preserve the same
    // bought study/reservation for a retry after storage recovers.
    const db = fakeDb()
    db.setStudy('ride-hold-blind', { account_id: ACCT, install_id: 'install-1', state: 'analyzed' })
    db.setReservation('ride-hold-blind', 'settled')
    ok('the claim rides before the hold query',
       await engine.claimStudyForReading(db, { studyId: 'ride-hold-blind', accountId: ACCT }) === true)

    db.failReservationHolds = true
    const blindHold = await readResume.rideOrResolve(db, 'ride-hold-blind')
    ok('a thrown hold query refuses as unknown instead of escaping',
       blindHold.ok === false && blindHold.kind === 'unknown' && blindHold.status === 409)
    ok('the claimed study is reset for the same-id retry',
       db._studies.get('ride-hold-blind').state === 'analyzed')
    ok('the unread reservation is not stranded or rewritten',
       db._reservations.get('ride-hold-blind').state === 'settled')

    db.failReservationHolds = false
    ok('after recovery the same study id claims again',
       await engine.claimStudyForReading(db, { studyId: 'ride-hold-blind', accountId: ACCT }) === true)
    const retry = await readResume.rideOrResolve(db, 'ride-hold-blind')
    ok('and its same reservation re-arms without a new charge',
       retry.ok === true && db._reservations.get('ride-hold-blind').state === 'held')
  }

  console.log('\nTHE ROUTE HOLDS NOTHING ITSELF')
  {
    // What remains structural is deliberately NEGATIVE: the route must not
    // contain the machinery at all. A bypass now has to reimplement the hold —
    // and the only way to arm a reservation is the meter call whose absence
    // is asserted here.
    const fs = require('fs')
    const path = require('path')
    const indexSrc = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
    const active = indexSrc.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

    ok('index.js requires the resolver module',
       /^const readResume = require\('\.\/read-resume'\)$/m.test(indexSrc))
    ok('index.js never calls the hold directly',
       !active.includes('holdStudyReservationForReading'))
    ok('index.js never strands or resets a reading claim directly',
       !active.includes('strandStudyReadingClaim') && !active.includes('resetStudyReadingClaim'))
    ok('index.js asks the one question exactly once',
       (active.match(/readResume\.rideOrResolve\(db, studyId\)/g) || []).length === 1)
    ok('index.js never mints the reservation-unavailable answer itself',
       !active.includes("'STUDY_RESERVATION_UNAVAILABLE'"))
    ok('index.js never mints the restore-refusal answer itself',
       !active.includes("'STUDY_RESTORE_UNAVAILABLE'"))
    ok('index.js resolves the no-ride fork exactly once, handing over the request itself',
       (active.match(/readResume\.resolveNoRide\(req, \{/g) || []).length === 1 &&
       (active.match(/readResume\.resolveNoRide\(/g) || []).length === 1)
    // The audit-proven forgery was `restoreOnly: false,` at the call site.
    // The route no longer touches the flag AT ALL — the module reads it from
    // the request — so any reintroduction of the token here is tampering.
    ok('the restore flag token appears nowhere in the route file',
       !active.includes('restoreOnly'))
  }

  console.log('\nA RESTORE MAY NEVER BUY')
  {
    // The spy IS the proof: under restoreOnly, mintFresh — the only door to a
    // new reservation — is never opened. A deliberate request opens it.
    // The flag arrives THE WAY THE SERVER SEES IT — on the request body. The
    // module reads it itself; passing a pre-digested boolean was the forgeable
    // seam an audit killed.
    let minted = 0
    const mintFresh = async () => { minted += 1; return { freshStudyId: 'fresh-1' } }
    const restoreReq = { body: { restoreOnly: true } }
    const deliberateReq = { body: {} }

    const restore = await readResume.resolveNoRide(restoreReq, { priorState: 'stranded', mintFresh })
    ok('a restore against a non-rideable id is refused', restore.response?.status === 409)
    ok('with the restore-refusal answer', restore.response?.body?.error === 'STUDY_RESTORE_UNAVAILABLE')
    ok('and ZERO reservations were minted', minted === 0)

    const gone = await readResume.resolveNoRide(restoreReq, { priorState: null, mintFresh })
    ok('a restore against a vanished id is also refused, unminted',
       gone.response?.body?.error === 'STUDY_RESTORE_UNAVAILABLE' && minted === 0)

    const reading = await readResume.resolveNoRide(restoreReq, { priorState: 'reading', mintFresh })
    ok('an in-flight reading answers for itself first',
       reading.response?.body?.error === 'STUDY_IN_PROGRESS' && minted === 0)
    const done = await readResume.resolveNoRide(restoreReq, { priorState: 'done', mintFresh })
    ok('a finished reading answers for itself first',
       done.response?.body?.error === 'STUDY_ALREADY_FINISHED' && minted === 0)

    const junk = await readResume.resolveNoRide({ body: { restoreOnly: 'yes' } }, { priorState: 'stranded', mintFresh })
    ok('only the explicit boolean is a restore — truthy junk mints deliberately',
       junk.freshStudyId === 'fresh-1' && minted === 1)

    const deliberate = await readResume.resolveNoRide(deliberateReq, { priorState: 'stranded', mintFresh })
    ok('a deliberate request mints a fresh study', deliberate.freshStudyId === 'fresh-1' && minted === 2)

    const bare = await readResume.resolveNoRide(undefined, { priorState: 'stranded', mintFresh })
    ok('a missing request object is deliberate, not a crash', bare.freshStudyId === 'fresh-1' && minted === 3)

    let refusals = 0
    const refusedMint = async () => { refusals += 1; return { response: { status: 402, body: { error: 'X' } } } }
    const walled = await readResume.resolveNoRide(deliberateReq, { priorState: 'stranded', mintFresh: refusedMint })
    ok('a refused claim propagates as the response',
       walled.response?.status === 402 && refusals === 1)
  }

  console.log('\nA TRANSIENT HOLD LOSS RESETS, NOT STRANDS')
  {
    const db = fakeDb()
    db.setStudy('study-race2', { account_id: ACCT, install_id: 'install-1', state: 'analyzed' })
    db.setReservation('study-race2', 'held')   // e.g. lost a race; not terminal
    ok('the claim rides', await engine.claimStudyForReading(db, { studyId: 'study-race2', accountId: ACCT }) === true)
    const resolved = await readResume.resolveFailedReadHold(db, 'study-race2')
    ok('a non-terminal state resolves as reset', resolved.kind === 'reset')
    ok('the study is back to analyzed for the retry',
       db._studies.get('study-race2').state === 'analyzed')
  }

  console.log('\nTHE HEALTHY RESUME IS UNTOUCHED')
  {
    // The designed path: settled money re-arms for the reading at no new
    // charge. The strand branch above must never fire here.
    const db = fakeDb()
    db.setStudy('study-live', { account_id: ACCT, install_id: 'install-1', state: 'analyzed' })
    db.setReservation('study-live', 'settled')

    ok('the claim rides', await engine.claimStudyForReading(db, { studyId: 'study-live', accountId: ACCT }) === true)
    ok('a settled reservation still re-arms',
       await meter.holdStudyReservationForReading(db, 'study-live') === true)
    ok('the re-armed state is held', db._reservations.get('study-live').state === 'held')
  }

  console.log('\nA FINISHED UNCACHED READING COMES BACK FROM ITS OWN ROW')
  {
    const db = fakeDb()
    const document = { sections: { passage: 'Owned, finished reading' }, verification: { status: 'failed' } }
    db.setStudy('study-finished', {
      account_id: ACCT, install_id: 'install-1', state: 'done', document,
    })
    db.setStudy('study-anon-finished', {
      account_id: null, install_id: 'install-1', state: 'done', document,
    })

    ok('the owner recovers the delivered document even when it was not shared-cached',
       await engine.ownedStudyDocument(db, { studyId: 'study-finished', accountId: ACCT }) === document)
    ok('another account cannot recover it',
       await engine.ownedStudyDocument(db, { studyId: 'study-finished', accountId: 'someone-else' }) === null)
    ok('an anonymous identity cannot recover an account-owned row with the same install id',
       await engine.ownedStudyDocument(db, {
         studyId: 'study-finished', installId: 'install-1',
       }) === null)
    ok('another anonymous install cannot recover it',
       await engine.ownedStudyDocument(db, {
         studyId: 'study-anon-finished', installId: 'install-2',
       }) === null)
    ok('the owning anonymous install recovers its delivered document',
       await engine.ownedStudyDocument(db, {
         studyId: 'study-anon-finished', installId: 'install-1',
       }) === document)
  }

  console.log('\nTHE REGISTERED READ ROUTE PRESERVES RESTORE INTENT')
  {
    // Invoke the handler Express actually registered. Module-only tests proved
    // the decision, but did not prove that the route preserved req.body on the
    // way there: erasing the body immediately before resolveNoRide left all of
    // them green and silently opened the fresh-reservation path.
    const express = require('express')
    const indexPath = require.resolve('./index')
    const originalListen = express.application.listen
    const originalTrialSecret = process.env.TRIAL_IDENTITY_SECRET
    const originalStripeSecret = process.env.STRIPE_SECRET_KEY
    const originalCachedDocument = engine.cachedDocument
    const originalClaimStudyForReading = engine.claimStudyForReading
    const originalOwnedStudyDocument = engine.ownedStudyDocument
    const originalOwnedStudyState = engine.ownedStudyState
    const originalWithGlobalSpendLock = meter.withGlobalSpendLock
    let mintCalls = 0

    const responseRecorder = () => ({
      statusCode: 200,
      body: null,
      headers: {},
      chunks: [],
      ended: false,
      headersSent: false,
      status(code) { this.statusCode = code; return this },
      json(body) { this.body = body; this.headersSent = true; return this },
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this },
      write(chunk) { this.chunks.push(String(chunk)); this.headersSent = true; return true },
      end() { this.ended = true; this.headersSent = true; return this },
    })
    const request = (restoreOnly, studyId = 'stale-route-study') => ({
      body: {
        analysis: { observations: ['route-wire-test'] },
        reference: 'John 1:1',
        level: 'standard',
        studyId,
        restoreOnly,
      },
      identity: { account: null, installId: 'install-route-wire-test' },
    })
    const invoke = async (handler, req) => {
      const res = responseRecorder()
      let nextError = null
      await handler(req, res, (error) => { nextError = error })
      return { res, nextError }
    }

    try {
      if (require.cache[indexPath]) throw new Error('index.js loaded before the registered-route test')
      process.env.TRIAL_IDENTITY_SECRET = 'test-only-trial-identity-secret-at-least-32-characters'
      process.env.STRIPE_SECRET_KEY = 'sk_test_route_wire_no_network'
      express.application.listen = () => ({ close() {} })
      const app = require('./index')
      express.application.listen = originalListen

      const layer = app._router.stack.find((candidate) =>
        candidate.route?.path === '/v1/read' && candidate.route.methods?.post)
      if (!layer) throw new Error('registered POST /v1/read handler not found')
      const handler = layer.route.stack[0].handle

      engine.cachedDocument = async () => null
      engine.claimStudyForReading = async () => false
      const finishedDocument = {
        sections: { passage: 'Recovered from the owned study row' },
        verification: { status: 'failed' },
      }
      engine.ownedStudyState = async () => null
      meter.withGlobalSpendLock = async () => {
        mintCalls += 1
        return { status: 418, body: { error: 'MINT_CALLED' } }
      }

      engine.ownedStudyDocument = async () => { throw new Error('synthetic owned-document read failure') }
      const uncertain = await invoke(handler, request(false, 'uncertain-route-study'))
      ok('an uncertain owned-document read fails closed before any fresh reservation',
         uncertain.nextError?.message === 'synthetic owned-document read failure' && mintCalls === 0)

      engine.ownedStudyDocument = async (_db, { studyId }) =>
        studyId === 'finished-route-study' ? finishedDocument : null
      const recovered = await invoke(handler, request(true, 'finished-route-study'))
      let recoveredFrame = null
      try { recoveredFrame = JSON.parse(recovered.res.chunks.join('').trim()) } catch {}
      ok('the registered route restores an owned finished document outside the shared cache',
         recovered.nextError === null &&
         recovered.res.statusCode === 200 &&
         recovered.res.ended === true &&
         recoveredFrame.type === 'done' &&
         JSON.stringify(recoveredFrame.document) === JSON.stringify(finishedDocument) &&
         recoveredFrame.studyId === 'finished-route-study')
      ok('recovering the finished document mints ZERO fresh reservations', mintCalls === 0)

      const restore = await invoke(handler, request(true))
      ok('the registered route refuses a stale restore with ZERO fresh reservations',
         restore.nextError === null &&
         restore.res.statusCode === 409 &&
         restore.res.body?.error === 'STUDY_RESTORE_UNAVAILABLE' &&
         mintCalls === 0)

      const mintCallsBeforeDeliberate = mintCalls
      const deliberate = await invoke(handler, request(false))
      ok('the same registered route opens the mint boundary only for a deliberate read',
         deliberate.nextError === null &&
         deliberate.res.statusCode === 418 &&
         deliberate.res.body?.error === 'MINT_CALLED' &&
         mintCalls === mintCallsBeforeDeliberate + 1)
    } finally {
      express.application.listen = originalListen
      engine.cachedDocument = originalCachedDocument
      engine.claimStudyForReading = originalClaimStudyForReading
      engine.ownedStudyDocument = originalOwnedStudyDocument
      engine.ownedStudyState = originalOwnedStudyState
      meter.withGlobalSpendLock = originalWithGlobalSpendLock
      if (originalTrialSecret === undefined) delete process.env.TRIAL_IDENTITY_SECRET
      else process.env.TRIAL_IDENTITY_SECRET = originalTrialSecret
      if (originalStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY
      else process.env.STRIPE_SECRET_KEY = originalStripeSecret
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
