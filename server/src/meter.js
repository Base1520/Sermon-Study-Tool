/**
 * meter.js — the thing that stands between a stranger's usage and Cole's card.
 *
 * THE ONE FACT THIS FILE EXISTS FOR. On the desktop, every study spends the
 * user's own key and an overrun is his problem. The moment a server holds one
 * key for everybody, every request lands on Cole's card — and he is pre-revenue
 * with real debt. Metering is not a phase-two feature here; it is the reason the
 * server is safe to switch on at all.
 *
 * FOUR RULES, each learned from somebody else's expensive mistake:
 *
 *  1. RESERVE BEFORE SPENDING, NEVER AFTER. A counter incremented after the
 *     model returns can be raced: two requests both read "39 of 40 used", both
 *     pass, both spend. The reserve below is a single atomic statement whose
 *     WHERE clause is the guard, so concurrent callers serialise on the row lock
 *     and the 41st simply finds no row to update.
 *
 *  2. RESERVE THE WORST CASE, SETTLE TO ACTUAL. A study can retry and cost more
 *     than the happy path. Hold the ceiling, refund the difference when the real
 *     token counts come back. Reserving the average is how you discover the
 *     ceiling on an invoice.
 *
 *  3. IN-FLIGHT WORK IS COMMITTED MONEY. A study runs ~163 seconds. Any ceiling
 *     that sums only COMPLETED spend reads zero for everything currently
 *     running — which is precisely when a burst is happening. Committed =
 *     reconciled + reservations still open.
 *
 *  4. A RUNNING STUDY ALWAYS FINISHES. Limits refuse the NEXT one. Nobody ever
 *     watches a document stop halfway because a counter ticked over.
 */

/** Worst case for one study: the analyze fan-out, the document, one retry, the verify pass. */
const STUDY_RESERVE_USD = 0.75
const QUICK_STUDY_RESERVE_USD = 0.03
const GUIDED_STUDY_RESERVE_USD = 0.05
const ASK_RESERVE_USD = 0.08
const GLOBAL_SPEND_LOCK_ID = 15202026

/** Synthetic owner for reservations made before a caller has an account. */
const ANON_LEDGER_ACCOUNT = '00000000-0000-0000-0000-000000000001'

/** A reservation older than this is assumed dead — a crashed process, a dropped connection. */
const RESERVATION_TTL_MINUTES = 10
const RESERVATION_HEARTBEAT_MS = 60_000

async function accountAvailableForSpend(db, accountId) {
  if (!accountId) return true
  const { rows } = await db.query(
    `SELECT id FROM account
      WHERE id = $1 AND deleting_at IS NULL
      FOR SHARE`,
    [accountId],
  )
  return rows.length > 0
}

async function withGlobalSpendLock(db, operation) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [GLOBAL_SPEND_LOCK_ID])
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function reserveAsk(db, {
  id,
  accountId,
  installId,
  recurringAccess,
  freeLimit,
  dailyLimit,
}) {
  return withGlobalSpendLock(db, async (client) => {
    if (accountId && !(await accountAvailableForSpend(client, accountId))) {
      return { ok: false, reason: 'account-unavailable' }
    }
    const ceiling = await ceilingStatus(client)
    const projected = ceiling.committed + ASK_RESERVE_USD
    const hardLimit = ceiling.ceiling * 1.5
    const freeLimitUsd = ceiling.ceiling * 0.9
    if (projected > hardLimit || (!recurringAccess && projected > freeLimitUsd)) {
      return { ok: false, reason: projected > hardLimit ? 'service-paused' : 'free-tier-paused', ceiling }
    }

    let accessKind = 'recurring'
    if (recurringAccess) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS count FROM ask_reservation
          WHERE account_id = $1
            AND state IN ('held', 'settled')
            AND created_at > now() - interval '24 hours'`,
        [accountId],
      )
      if (Number(rows[0]?.count || 0) >= dailyLimit) {
        return { ok: false, reason: 'daily-limit', used: Number(rows[0]?.count || 0), allowance: dailyLimit }
      }
    } else if (accountId) {
      accessKind = 'account_free'
      const claimed = await client.query(
        `UPDATE account SET free_asks_used = free_asks_used + 1
          WHERE id = $1 AND free_asks_used < $2
          RETURNING free_asks_used`,
        [accountId, freeLimit],
      )
      if (!claimed.rows.length) return { ok: false, reason: 'free-limit', used: freeLimit, allowance: freeLimit }
    } else {
      accessKind = 'anon_free'
      const claimed = await client.query(
        `INSERT INTO anon_install (install_id, asks_used)
              VALUES ($1, 1)
         ON CONFLICT (install_id) DO UPDATE
                SET asks_used = anon_install.asks_used + 1,
                    updated_at = now()
              WHERE anon_install.asks_used < $2
         RETURNING asks_used`,
        [installId, freeLimit],
      )
      if (!claimed.rows.length) return { ok: false, reason: 'free-limit', used: freeLimit, allowance: freeLimit }
    }

    await client.query(
      `INSERT INTO ask_reservation (id, account_id, install_id, access_kind, reserved_usd)
            VALUES ($1, $2, $3, $4, $5)`,
      [id, accountId || null, installId || null, accessKind, ASK_RESERVE_USD],
    )
    return { ok: true, id, accessKind }
  })
}

async function settleAskReservation(db, id) {
  const { rowCount } = await db.query(
    `UPDATE ask_reservation SET state = 'settled', updated_at = now()
      WHERE id = $1 AND state = 'held'`,
    [id],
  )
  return rowCount > 0
}

async function heartbeatAskReservation(db, id) {
  const { rowCount } = await db.query(
    `UPDATE ask_reservation SET updated_at = now()
      WHERE id = $1 AND state = 'held'`,
    [id],
  )
  return rowCount > 0
}

async function releaseAskReservation(db, id, { staleOnly = false } = {}) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE ask_reservation SET state = 'released', updated_at = now()
        WHERE id = $1 AND state = 'held'
          AND (NOT $2::boolean OR updated_at < now() - ($3 || ' minutes')::interval)
        RETURNING account_id, install_id, access_kind`,
      [id, staleOnly, RESERVATION_TTL_MINUTES],
    )
    const released = rows[0]
    if (released?.access_kind === 'account_free') {
      await client.query(
        `UPDATE account SET free_asks_used = GREATEST(free_asks_used - 1, 0) WHERE id = $1`,
        [released.account_id],
      )
    } else if (released?.access_kind === 'anon_free') {
      await client.query(
        `UPDATE anon_install SET asks_used = GREATEST(asks_used - 1, 0), updated_at = now()
          WHERE install_id = $1`,
        [released.install_id],
      )
    }
    await client.query('COMMIT')
    return Boolean(released)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function insertStudyReservation(db, {
  id,
  accountId,
  installId,
  accessKind,
  periodStart,
  reserveUsd = STUDY_RESERVE_USD,
}) {
  if (!id) return
  await db.query(
    `INSERT INTO study_reservation
          (id, account_id, install_id, access_kind, period_start, reserved_usd)
          VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, accountId || null, installId || null, accessKind, periodStart, reserveUsd],
  )
}

/**
 * Claim one study against an account's monthly allowance.
 *
 * The WHERE clause is the entire safety mechanism. Postgres takes a row lock for
 * the UPDATE, so simultaneous callers queue rather than both reading a stale
 * count. Zero rows returned means the allowance is spent — refuse, and spend
 * nothing.
 *
 * @returns {{ok:true, used:number, allowance:number} | {ok:false, reason:string, used:number, allowance:number}}
 */
async function reserveStudy(db, {
  accountId,
  allowance,
  periodStart,
  periodEnd,
  reservationId = null,
  reserveUsd = STUDY_RESERVE_USD,
}) {
  const periodReserveUsd = reservationId ? 0 : reserveUsd
  const spendTopUp = async () => {
    const { rows: topped } = await db.query(
      `UPDATE account
          SET topup_studies = topup_studies - 1
        WHERE id = $1 AND topup_studies > 0
        RETURNING topup_studies`,
      [accountId],
    )
    if (topped.length === 0) return null
    await db.query(
      `INSERT INTO usage_period (account_id, period_start, period_end, studies_used, reserved_usd)
            VALUES ($1, $2, $3, 0, $4)
       ON CONFLICT (account_id, period_start) DO UPDATE
              SET reserved_usd = usage_period.reserved_usd + $4,
                  updated_at   = now()`,
      [accountId, periodStart, periodEnd, periodReserveUsd],
    )
    await insertStudyReservation(db, {
      id: reservationId, accountId, accessKind: 'topup', periodStart, reserveUsd,
    })
    return {
      ok: true,
      used: Math.max(Number(allowance) || 0, 0),
      allowance: Math.max(Number(allowance) || 0, 0),
      reservationId,
      fromTopUp: true,
      topUpRemaining: topped[0].topup_studies,
    }
  }

  // Guard the zero case in code. ON CONFLICT's WHERE only governs the UPDATE
  // branch — with allowance 0 the INSERT branch would still create a row with
  // used=1 and hand out a recurring study. A purchased top-up remains spendable
  // when subscription status makes the recurring allowance zero.
  if (!allowance || allowance <= 0) {
    const topped = await spendTopUp()
    if (topped) return topped
    return { ok: false, reason: 'no-allowance', used: 0, allowance: 0 }
  }

  const { rows } = await db.query(
    `INSERT INTO usage_period (account_id, period_start, period_end, studies_used, reserved_usd)
          VALUES ($1, $2, $3, 1, $5)
     ON CONFLICT (account_id, period_start) DO UPDATE
            SET studies_used = usage_period.studies_used + 1,
                reserved_usd = usage_period.reserved_usd + $5,
                updated_at   = now()
          WHERE usage_period.studies_used < $4
      RETURNING studies_used, $4::int AS allowance`,
    [accountId, periodStart, periodEnd, allowance, periodReserveUsd],
  )

  if (rows.length === 0) {
    // THE MONTHLY ALLOWANCE IS GONE — SPEND A TOP-UP IF HE BOUGHT ONE.
    //
    // Top-ups were sold and never granted: the $15 checkout took the money and
    // no code path anywhere turned it into studies. The decrement is conditional
    // on a positive balance in the same statement, so two simultaneous requests
    // cannot both spend the last one.
    const topped = await spendTopUp()
    if (topped) return topped

    const { rows: cur } = await db.query(
      `SELECT studies_used FROM usage_period WHERE account_id = $1 AND period_start = $2`,
      [accountId, periodStart],
    )
    return { ok: false, reason: 'limit-reached', used: cur[0]?.studies_used ?? allowance, allowance }
  }
  await insertStudyReservation(db, {
    id: reservationId, accountId, accessKind: 'recurring', periodStart, reserveUsd,
  })
  return { ok: true, used: rows[0].studies_used, allowance, reservationId }
}

async function reserveLifetimeStudy(db, {
  accountId,
  lifetimeStudies,
  periodStart,
  periodEnd,
  reservationId = null,
  reserveUsd = STUDY_RESERVE_USD,
}) {
  if (!lifetimeStudies || lifetimeStudies <= 0) {
    return { ok: false, reason: 'no-allowance', used: 0, allowance: 0 }
  }
  const periodReserveUsd = reservationId ? 0 : reserveUsd
  const { rows } = await db.query(
    `WITH claimed AS (
       UPDATE account
          SET free_studies_used = free_studies_used + 1
        WHERE id = $1 AND free_studies_used < $2
        RETURNING free_studies_used
     ), held AS (
       INSERT INTO usage_period (account_id, period_start, period_end, studies_used, reserved_usd)
            SELECT $1, $3, $4, 0, $5 FROM claimed
       ON CONFLICT (account_id, period_start) DO UPDATE
              SET reserved_usd = usage_period.reserved_usd + $5,
                  updated_at = now()
       RETURNING account_id
     )
     SELECT free_studies_used FROM claimed`,
    [accountId, lifetimeStudies, periodStart, periodEnd, periodReserveUsd],
  )
  if (!rows.length) {
    const current = await db.query(`SELECT free_studies_used FROM account WHERE id = $1`, [accountId])
    return {
      ok: false,
      reason: 'limit-reached',
      used: Number(current.rows[0]?.free_studies_used || lifetimeStudies),
      allowance: lifetimeStudies,
    }
  }
  await insertStudyReservation(db, {
    id: reservationId, accountId, accessKind: 'account_free', periodStart, reserveUsd,
  })
  return { ok: true, used: Number(rows[0].free_studies_used), allowance: lifetimeStudies, reservationId }
}

async function releaseLifetimeStudy(db, { accountId, periodStart, releaseReservation = true }) {
  if (!releaseReservation) {
    await db.query(
      `UPDATE account
          SET free_studies_used = GREATEST(free_studies_used - 1, 0)
        WHERE id = $1`,
      [accountId],
    )
    return
  }
  await db.query(
    `WITH released AS (
       UPDATE account
          SET free_studies_used = GREATEST(free_studies_used - 1, 0)
        WHERE id = $1 AND free_studies_used > 0
        RETURNING id
     )
     UPDATE usage_period
        SET reserved_usd = GREATEST(reserved_usd - $3, 0),
            updated_at = now()
      WHERE account_id = $1 AND period_start = $2
        AND EXISTS (SELECT 1 FROM released)`,
    [accountId, periodStart, STUDY_RESERVE_USD],
  )
}

async function reserveAnonymousStudy(db, {
  installId,
  identityHash = null,
  lifetimeStudies,
  periodStart,
  periodEnd,
  reservationId = null,
  reserveUsd = STUDY_RESERVE_USD,
}) {
  if (!installId || !lifetimeStudies || lifetimeStudies <= 0) {
    return { ok: false, reason: 'no-allowance', used: 0, allowance: 0 }
  }
  if (identityHash) {
    const priorTrial = await db.query(
      `SELECT COALESCE(MAX(free_studies_used), 0)::int AS studies_used
         FROM free_trial_tombstone
        WHERE identity_hash = $1`,
      [identityHash],
    )
    const used = Number(priorTrial.rows[0]?.studies_used || 0)
    if (used >= lifetimeStudies) {
      return { ok: false, reason: 'limit-reached', used, allowance: lifetimeStudies }
    }
  }
  const periodReserveUsd = reservationId ? 0 : reserveUsd
  const { rows } = await db.query(
    `WITH claimed AS (
       INSERT INTO anon_install (install_id, studies_used)
            VALUES ($1, 1)
       ON CONFLICT (install_id) DO UPDATE
              SET studies_used = anon_install.studies_used + 1,
                  updated_at = now()
            WHERE anon_install.studies_used < $2
       RETURNING studies_used
     ), held AS (
       INSERT INTO usage_period (account_id, period_start, period_end, studies_used, reserved_usd)
            SELECT $3, $4, $5, 0, $6 FROM claimed
       ON CONFLICT (account_id, period_start) DO UPDATE
              SET reserved_usd = usage_period.reserved_usd + $6,
                  updated_at = now()
       RETURNING account_id
     )
     SELECT studies_used FROM claimed`,
    [installId, lifetimeStudies, ANON_LEDGER_ACCOUNT, periodStart, periodEnd, periodReserveUsd],
  )
  if (!rows.length) return { ok: false, reason: 'limit-reached', used: lifetimeStudies, allowance: lifetimeStudies }
  await insertStudyReservation(db, {
    id: reservationId, installId, accessKind: 'anon_free', periodStart, reserveUsd,
  })
  return { ok: true, used: Number(rows[0].studies_used), allowance: lifetimeStudies, reservationId }
}

async function releaseAnonymousStudy(db, { installId, periodStart, releaseReservation = true }) {
  if (!releaseReservation) {
    await db.query(
      `UPDATE anon_install
          SET studies_used = GREATEST(studies_used - 1, 0), updated_at = now()
        WHERE install_id = $1`,
      [installId],
    )
    return
  }
  await db.query(
    `WITH released AS (
       UPDATE anon_install
          SET studies_used = GREATEST(studies_used - 1, 0), updated_at = now()
        WHERE install_id = $1 AND studies_used > 0
        RETURNING install_id
     )
     UPDATE usage_period
        SET reserved_usd = GREATEST(reserved_usd - $4, 0),
            updated_at = now()
      WHERE account_id = $2 AND period_start = $3
        AND EXISTS (SELECT 1 FROM released)`,
    [installId, ANON_LEDGER_ACCOUNT, periodStart, STUDY_RESERVE_USD],
  )
}

async function settleAnonymousReservation(db, { periodStart }) {
  await db.query(
    `UPDATE usage_period
        SET reserved_usd = GREATEST(reserved_usd - $3, 0),
            updated_at = now()
      WHERE account_id = $1 AND period_start = $2`,
    [ANON_LEDGER_ACCOUNT, periodStart, STUDY_RESERVE_USD],
  )
}

/**
 * Replace a reservation with what the study actually cost.
 *
 * Called after the real token counts arrive. Uses max(actual, 0) and never
 * lets reserved_usd go negative — an accounting bug must not manufacture
 * headroom that does not exist.
 */
async function settleStudy(db, { accountId, periodStart, actualUsd }) {
  const spent = Math.max(Number(actualUsd) || 0, 0)
  await db.query(
    `UPDATE usage_period
        SET reserved_usd = GREATEST(reserved_usd - $3, 0),
            actual_usd   = actual_usd + $4,
            updated_at   = now()
      WHERE account_id = $1 AND period_start = $2`,
    [accountId, periodStart, STUDY_RESERVE_USD, spent],
  )
}

/**
 * Book spend against a reservation that has ALREADY been settled.
 *
 * Exists because a study is charged once but runs in two halves: /v1/analyze
 * reserves, spends and settles; /v1/read then rides the same claim. Calling
 * settleStudy() a second time would release a $0.75 hold that is no longer held
 * — clamped at zero it silently eats some other request's in-flight money, which
 * makes the global ceiling read low at exactly the moment a burst is happening.
 *
 * So: add what was actually spent, touch nothing else.
 */
async function recordAdditionalSpend(db, { accountId, periodStart, actualUsd }) {
  const spent = Math.max(Number(actualUsd) || 0, 0)
  if (!spent) return
  await db.query(
    `UPDATE usage_period
        SET actual_usd = actual_usd + $3,
            updated_at = now()
      WHERE account_id = $1 AND period_start = $2`,
    [accountId, periodStart, spent],
  )
}

/**
 * Give back a reservation for a study that never ran — refused downstream, a
 * dropped connection, a crash. Without this a failed request silently eats a
 * man's allowance, which is the kind of quiet unfairness that loses a customer
 * without ever generating a complaint.
 */
async function releaseStudy(db, { accountId, periodStart }) {
  await db.query(
    `UPDATE usage_period
        SET studies_used = GREATEST(studies_used - 1, 0),
            reserved_usd = GREATEST(reserved_usd - $3, 0),
            updated_at   = now()
      WHERE account_id = $1 AND period_start = $2`,
    [accountId, periodStart, STUDY_RESERVE_USD],
  )
}

async function settleStudyReservation(db, { reservationId, actualUsd = 0 }) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE study_reservation
          SET state = 'settled', updated_at = now()
        WHERE id = $1 AND state = 'held'
        RETURNING account_id, period_start`,
      [reservationId],
    )
    const reservation = rows[0]
    if (reservation?.account_id) {
      await client.query(
        `UPDATE usage_period
            SET actual_usd = actual_usd + $3, updated_at = now()
          WHERE account_id = $1 AND period_start = $2`,
        [reservation.account_id, reservation.period_start, Math.max(Number(actualUsd) || 0, 0)],
      )
    }
    await client.query('COMMIT')
    return Boolean(reservation)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function holdStudyReservationForReading(db, reservationId) {
  const { rowCount } = await db.query(
    `UPDATE study_reservation
        SET state = 'held', updated_at = now()
      WHERE id = $1 AND state = 'settled'`,
    [reservationId],
  )
  return rowCount > 0
}

async function heartbeatStudyReservation(db, reservationId) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const { rowCount } = await client.query(
      `UPDATE study_reservation SET updated_at = now()
        WHERE id = $1 AND state = 'held'`,
      [reservationId],
    )
    if (rowCount) {
      await client.query(
        `UPDATE study SET updated_at = now()
          WHERE id = $1 AND state = 'reading'`,
        [reservationId],
      )
    }
    await client.query('COMMIT')
    return rowCount > 0
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function refundReservationCounter(client, reservation) {
  if (reservation.access_kind === 'recurring') {
    await client.query(
      `UPDATE usage_period
          SET studies_used = GREATEST(studies_used - 1, 0), updated_at = now()
        WHERE account_id = $1 AND period_start = $2`,
      [reservation.account_id, reservation.period_start],
    )
  } else if (reservation.access_kind === 'topup') {
    await client.query(
      `UPDATE account SET topup_studies = topup_studies + 1 WHERE id = $1`,
      [reservation.account_id],
    )
  } else if (reservation.access_kind === 'account_free') {
    await client.query(
      `UPDATE account
          SET free_studies_used = GREATEST(free_studies_used - 1, 0)
        WHERE id = $1`,
      [reservation.account_id],
    )
  } else if (reservation.access_kind === 'anon_free') {
    await client.query(
      `UPDATE anon_install
          SET studies_used = GREATEST(studies_used - 1, 0), updated_at = now()
        WHERE install_id = $1`,
      [reservation.install_id],
    )
  }
}

async function transitionStudyReservation(db, {
  reservationId,
  fromStates,
  toState,
  refund,
  staleOnly = false,
}) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE study_reservation
          SET state = $2, updated_at = now()
        WHERE id = $1 AND state = ANY($3::text[])
          AND (NOT $4::boolean OR updated_at < now() - ($5 || ' minutes')::interval)
        RETURNING account_id, install_id, access_kind, period_start`,
      [reservationId, toState, fromStates, staleOnly, RESERVATION_TTL_MINUTES],
    )
    const reservation = rows[0]
    if (reservation && refund) await refundReservationCounter(client, reservation)
    await client.query('COMMIT')
    return Boolean(reservation)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

function releaseStudyReservation(db, reservationId, { staleOnly = false } = {}) {
  return transitionStudyReservation(db, {
    reservationId,
    fromStates: ['held'],
    toState: 'released',
    refund: true,
    staleOnly,
  })
}

async function recoverStaleReading(db, studyId) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const reservationResult = await client.query(
      `SELECT account_id, install_id, access_kind, period_start, state
         FROM study_reservation
        WHERE id = $1
          AND updated_at < now() - ($2 || ' minutes')::interval
        FOR UPDATE`,
      [studyId, RESERVATION_TTL_MINUTES],
    )
    const reservation = reservationResult.rows[0] || null
    const studyResult = await client.query(
      `UPDATE study
          SET state = CASE WHEN retries >= $3 THEN 'stranded' ELSE 'analyzed' END,
              retries = retries + 1,
              updated_at = now()
        WHERE id = $1 AND state = 'reading'
          AND updated_at < now() - ($2 || ' minutes')::interval
        RETURNING state`,
      [studyId, RESERVATION_TTL_MINUTES, 3],
    )
    const nextState = studyResult.rows[0]?.state || null
    if (!nextState) {
      await client.query('COMMIT')
      return false
    }

    if (reservation && nextState === 'stranded' && ['held', 'settled'].includes(reservation.state)) {
      const refunded = await client.query(
        `UPDATE study_reservation SET state = 'refunded', updated_at = now()
          WHERE id = $1 AND state IN ('held', 'settled')
          RETURNING id`,
        [studyId],
      )
      if (refunded.rows.length) await refundReservationCounter(client, reservation)
    } else if (reservation?.state === 'held') {
      await client.query(
        `UPDATE study_reservation SET state = 'settled', updated_at = now()
          WHERE id = $1 AND state = 'held'`,
        [studyId],
      )
    }
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

function refundStudyReservation(db, reservationId) {
  return transitionStudyReservation(db, {
    reservationId,
    fromStates: ['held', 'settled'],
    toState: 'refunded',
    refund: true,
  })
}

/**
 * Sweep reservations left behind by crashed work.
 *
 * Without this, a process that dies mid-study leaks allowance permanently and
 * the account drifts toward a lockout nobody can explain. Run on a schedule.
 */
async function sweepStaleReservations(db) {
  const staleReadings = await db.query(
    `SELECT id FROM study
      WHERE state = 'reading'
        AND updated_at < now() - ($1 || ' minutes')::interval`,
    [RESERVATION_TTL_MINUTES],
  )
  let recoveredReadings = 0
  for (const row of staleReadings.rows) {
    if (await recoverStaleReading(db, row.id)) recoveredReadings += 1
  }
  const staleStudies = await db.query(
    `SELECT id FROM study_reservation
      WHERE state = 'held'
        AND updated_at < now() - ($1 || ' minutes')::interval`,
    [RESERVATION_TTL_MINUTES],
  )
  let releasedStudies = 0
  for (const row of staleStudies.rows) {
    if (await releaseStudyReservation(db, row.id, { staleOnly: true })) releasedStudies += 1
  }
  const { rowCount } = await db.query(
    `UPDATE usage_period
        SET reserved_usd = 0, updated_at = now()
      WHERE reserved_usd > 0
        AND updated_at < now() - ($1 || ' minutes')::interval`,
    [RESERVATION_TTL_MINUTES],
  )
  const staleAsks = await db.query(
    `SELECT id FROM ask_reservation
      WHERE state = 'held'
        AND updated_at < now() - ($1 || ' minutes')::interval`,
    [RESERVATION_TTL_MINUTES],
  )
  let releasedAsks = 0
  for (const row of staleAsks.rows) {
    if (await releaseAskReservation(db, row.id, { staleOnly: true })) releasedAsks += 1
  }
  return recoveredReadings + releasedStudies + rowCount + releasedAsks
}

/**
 * The global brake — total committed spend in a rolling window, across every
 * account.
 *
 * COMMITTED, not reconciled. Reservations for studies still running are real
 * money already promised to Anthropic; a ceiling that ignores them reads low at
 * exactly the moment it matters. This is the last line of defence and the only
 * one entirely under Cole's control, so it must not be the one that is blind.
 */
async function committedSpend(db, { hours = 24 } = {}) {
  // RECONCILED SPEND COMES FROM usage_event, NOT usage_period, for two reasons
  // that were each independently making this brake useless.
  //
  // 1. ANONYMOUS SPEND WAS INVISIBLE. Free studies never touch usage_period —
  //    they are tracked in anon_install — so every dollar the free tier burned
  //    was absent from the only number the ceiling looks at. Since the install
  //    id is client-supplied, a script rotating it gets unlimited free studies,
  //    and the one safeguard meant to stop a runaway bill could not see a single
  //    cent of it. usage_event has a row for every model call, anonymous or not.
  //
  // 2. THE WINDOW WAS NOT A WINDOW. usage_period rows are monthly, so summing
  //    any row "updated in the last 24 hours" counted the WHOLE month's spend as
  //    today's the moment one small study touched the row. A man at $45 for the
  //    month would trip a $50 daily ceiling on his next click. usage_event rows
  //    are timestamped individually, so the interval means what it says.
  //
  // In-flight reservations still come from usage_period — that is where money
  // promised but not yet spent lives, and it is the whole point of counting
  // committed rather than settled money.
  const spent = await db.query(
      `SELECT COALESCE(SUM(usd), 0) AS reconciled
         FROM usage_event
        WHERE at > now() - ($1 || ' hours')::interval`,
      [hours],
    )
    // TIME-BOUNDED. A reservation is money promised for work in flight, and work
    // in flight lasts minutes. Summing every reserved_usd ever written meant a
    // hold leaked by a crash or a redeploy counted against the ceiling FOREVER —
    // each deploy ratcheting the brake tighter until it eventually paused a
    // service that was spending nothing.
  const held = await db.query(
      `SELECT COALESCE(SUM(reserved_usd), 0) AS in_flight
         FROM usage_period
        WHERE updated_at > now() - ($1 || ' minutes')::interval`,
      [RESERVATION_TTL_MINUTES],
    )
  const studyHeld = await db.query(
    `SELECT COALESCE(SUM(reserved_usd), 0) AS in_flight
       FROM study_reservation
      WHERE state = 'held'
        AND updated_at > now() - ($1 || ' minutes')::interval`,
    [RESERVATION_TTL_MINUTES],
  )
  const askHeld = await db.query(
    `SELECT COALESCE(SUM(reserved_usd), 0) AS in_flight
       FROM ask_reservation
      WHERE state = 'held'
        AND updated_at > now() - ($1 || ' minutes')::interval`,
    [RESERVATION_TTL_MINUTES],
  )
  const reconciled = Number(spent.rows[0].reconciled)
  const inFlight = Number(held.rows[0].in_flight) +
    Number(studyHeld.rows[0].in_flight) +
    Number(askHeld.rows[0].in_flight)
  return { reconciled, inFlight, committed: reconciled + inFlight }
}

/**
 * Should the whole service stop spending?
 *
 * The ceiling lives in the DATABASE, not an environment variable, so it can be
 * lowered from a phone with one SQL statement and no redeploy — at the moment
 * you would most need to.
 *
 * FAILS OPEN FOR EXISTING PAYING USERS, CLOSED FOR NEW SIGNUPS. A cap that
 * silences a pastor mid-preparation is worse than a modest overage; a cap that
 * lets a stranger keep signing up during a runaway is worse than both.
 */
async function ceilingStatus(db) {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = 'daily_ceiling_usd'`)
  const configuredCeiling = rows[0]?.value ?? 50
  const cleanCeiling = String(configuredCeiling).trim()
  const parsedCeiling = Number(cleanCeiling)
  const validCeiling = cleanCeiling !== '' && Number.isFinite(parsedCeiling) && parsedCeiling >= 0
  const ceiling = validCeiling ? parsedCeiling : 50
  if (!validCeiling) {
    console.error('[meter] invalid daily_ceiling_usd; using fail-safe default of 50')
  }
  const { committed } = await committedSpend(db, { hours: 24 })
  const ratio = ceiling > 0 ? committed / ceiling : (committed > 0 ? Infinity : 0)
  return {
    ceiling,
    committed,
    ratio,
    alarm: ratio >= 0.5,           // 50 / 75 / 90 — tell Cole before it bites
    blockNewSignups: ratio >= 0.9,
    blockEverything: ratio >= 1.5, // only a genuine runaway stops paying customers
  }
}

module.exports = {
  reserveStudy,
  withGlobalSpendLock,
  accountAvailableForSpend,
  reserveAsk,
  settleAskReservation,
  heartbeatAskReservation,
  releaseAskReservation,
  reserveLifetimeStudy,
  releaseLifetimeStudy,
  reserveAnonymousStudy,
  releaseAnonymousStudy,
  settleAnonymousReservation,
  settleStudy,
  recordAdditionalSpend,
  releaseStudy,
  settleStudyReservation,
  holdStudyReservationForReading,
  heartbeatStudyReservation,
  releaseStudyReservation,
  refundStudyReservation,
  recoverStaleReading,
  sweepStaleReservations,
  committedSpend,
  ceilingStatus,
  STUDY_RESERVE_USD,
  QUICK_STUDY_RESERVE_USD,
  GUIDED_STUDY_RESERVE_USD,
  ASK_RESERVE_USD,
  GLOBAL_SPEND_LOCK_ID,
  ANON_LEDGER_ACCOUNT,
  RESERVATION_TTL_MINUTES,
  RESERVATION_HEARTBEAT_MS,
}
