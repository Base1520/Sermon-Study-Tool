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

/** A reservation older than this is assumed dead — a crashed process, a dropped connection. */
const RESERVATION_TTL_MINUTES = 10

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
async function reserveStudy(db, { accountId, allowance, periodStart, periodEnd }) {
  // Guard the zero case in code. ON CONFLICT's WHERE only governs the UPDATE
  // branch — with allowance 0 the INSERT branch would still create a row with
  // used=1 and hand out a free study. This is the exact edge a cancelled
  // subscriber sits on.
  if (!allowance || allowance <= 0) {
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
    [accountId, periodStart, periodEnd, allowance, STUDY_RESERVE_USD],
  )

  if (rows.length === 0) {
    const { rows: cur } = await db.query(
      `SELECT studies_used FROM usage_period WHERE account_id = $1 AND period_start = $2`,
      [accountId, periodStart],
    )
    return { ok: false, reason: 'limit-reached', used: cur[0]?.studies_used ?? allowance, allowance }
  }
  return { ok: true, used: rows[0].studies_used, allowance }
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

/**
 * Sweep reservations left behind by crashed work.
 *
 * Without this, a process that dies mid-study leaks allowance permanently and
 * the account drifts toward a lockout nobody can explain. Run on a schedule.
 */
async function sweepStaleReservations(db) {
  const { rowCount } = await db.query(
    `UPDATE usage_period
        SET reserved_usd = 0, updated_at = now()
      WHERE reserved_usd > 0
        AND updated_at < now() - ($1 || ' minutes')::interval`,
    [RESERVATION_TTL_MINUTES],
  )
  return rowCount
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
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(actual_usd), 0) AS reconciled,
            COALESCE(SUM(reserved_usd), 0) AS in_flight
       FROM usage_period
      WHERE updated_at > now() - ($1 || ' hours')::interval`,
    [hours],
  )
  const reconciled = Number(rows[0].reconciled)
  const inFlight = Number(rows[0].in_flight)
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
  const ceiling = Number(rows[0]?.value ?? 50)
  const { committed } = await committedSpend(db, { hours: 24 })
  const ratio = ceiling > 0 ? committed / ceiling : 1
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
  settleStudy,
  recordAdditionalSpend,
  releaseStudy,
  sweepStaleReservations,
  committedSpend,
  ceilingStatus,
  STUDY_RESERVE_USD,
  RESERVATION_TTL_MINUTES,
}
