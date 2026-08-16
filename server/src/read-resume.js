// The hold-failure decision for /v1/read, extracted so it can be TESTED AS THE
// ROUTE WILL RUN IT. The first version of this lived inline in the route and
// its test drove the three helpers by hand in the desired order — so replacing
// strand with reset at the call site left every assertion green. This module IS
// the call site now; a mutation here is a mutation of the behavior under test.
//
// Three outcomes, and the difference is load-bearing:
//
//   'stranded'  — the reservation row was READ and is terminal ('released' /
//                 'refunded') or PROVEN absent (zero rows). Money can never
//                 re-arm; retrying the identical request loops forever because
//                 the reset path never counts a retry. Strand the claim so the
//                 next request takes the fresh-claim path.
//
//   'reset'     — the reservation exists in a state the hold lost to
//                 transiently (a race with settle, etc.). Put the claim back
//                 and let the reader try again; the designed path stands.
//
//   'unknown'   — the reservation READ ITSELF FAILED. This is not evidence of
//                 absence. Stranding here would promise "restart fresh" — a
//                 fresh charge — on the strength of a database hiccup, while
//                 the unseen row might still be financially live. Fail closed:
//                 reset, say try again, decide nothing.
const meter = require('./meter')
const engine = require('./engine')

const TERMINAL = new Set(['released', 'refunded'])

async function resolveUnknownReservation(db, studyId) {
  await engine.resetStudyReadingClaim(db, studyId).catch(() => {})
  return {
    kind: 'unknown',
    status: 409,
    body: {
      error: 'STUDY_RESERVATION_UNAVAILABLE',
      message: 'That study could not resume safely. Open it from your Library and try again.',
    },
  }
}

async function resolveFailedReadHold(db, studyId) {
  let reservationState
  try {
    reservationState = await meter.studyReservationState(db, studyId)
  } catch {
    return await resolveUnknownReservation(db, studyId)
  }

  if (reservationState === null || TERMINAL.has(reservationState)) {
    await engine.strandStudyReadingClaim(db, studyId).catch(() => {})
    return {
      kind: 'stranded',
      status: 409,
      body: {
        error: 'STUDY_RESERVATION_UNAVAILABLE',
        message: 'That study attempt had closed. Run the reading again and it will restart fresh.',
      },
    }
  }

  await engine.resetStudyReadingClaim(db, studyId).catch(() => {})
  return {
    kind: 'reset',
    status: 409,
    body: {
      error: 'STUDY_RESERVATION_UNAVAILABLE',
      message: 'That study could not resume safely. Open it from your Library and try again.',
    },
  }
}

/**
 * The WHOLE ride attempt: arm the money, or say exactly why not.
 *
 * The hold call used to live in the route with the resolution below it, and
 * two audits in a row proved that arrangement untestable from outside: first
 * the resolution could be swapped at the call site, then a second `if (!held)`
 * could be inserted ahead of the guarded one. Both bypasses depended on `held`
 * existing in the route at all. It no longer does — the route asks one
 * question and returns the answer, and everything behind that question is
 * exercised by the behavioral suite.
 */
async function rideOrResolve(db, studyId) {
  let held
  try {
    held = await meter.holdStudyReservationForReading(db, studyId)
  } catch {
    // The route has already moved this study from analyzed -> reading. A
    // thrown hold query proves nothing about the reservation: it may still be
    // settled, or the write may have landed and only its response was lost.
    // Never strand (and thereby invite a fresh charge) on that uncertainty.
    const resolved = await resolveUnknownReservation(db, studyId)
    return { ok: false, ...resolved }
  }
  if (held) return { ok: true }
  const resolved = await resolveFailedReadHold(db, studyId)
  return { ok: false, ...resolved }
}

/**
 * What happens when the remembered id cannot ride at all.
 *
 * 'reading' and 'done' answer for themselves. After that the fork is the money
 * fork: a DELIBERATE request may mint a fresh study (mintFresh is the route's
 * closure over its own claim machinery), but a RESTORE may never buy — launch
 * and history-open run this silently, the reader has decided nothing, and a
 * stale id must produce a refusal with zero reservation, not a quiet charge.
 * The test proves that with a spy: restoreOnly returns before mintFresh is
 * ever called.
 */
async function resolveNoRide(req, { priorState, mintFresh }) {
  // Read the flag HERE, from the request itself. The route used to destructure
  // it and pass it through, and an audit proved the pass-through forgeable:
  // `restoreOnly: false,` at the call site survived every test. Now the route
  // never touches the flag — index.js contains no `restoreOnly` token at all
  // (asserted), so discarding it requires forging a request body in the route,
  // which the same assertion catches. Strict === true: only the client's
  // explicit boolean is a restore; strings and truthy junk are deliberate.
  const restoreOnly = req?.body?.restoreOnly === true
  if (priorState === 'reading') {
    return { response: { status: 409, body: {
      error: 'STUDY_IN_PROGRESS',
      message: 'That reading is already being built. Give it a moment, then open it again.',
    } } }
  }
  if (priorState === 'done') {
    return { response: { status: 409, body: {
      error: 'STUDY_ALREADY_FINISHED',
      message: 'That reading is already finished. Open it from your Library.',
    } } }
  }
  if (restoreOnly) {
    return { response: { status: 409, body: {
      error: 'STUDY_RESTORE_UNAVAILABLE',
      message: 'That saved study cannot be resumed. Run the reading again when you want it rebuilt.',
    } } }
  }
  return await mintFresh()
}

module.exports = { resolveFailedReadHold, rideOrResolve, resolveNoRide }
