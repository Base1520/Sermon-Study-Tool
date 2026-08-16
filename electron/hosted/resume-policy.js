/**
 * Decide what a restore-only reading may do.
 *
 * The renderer does not own either piece of evidence this decision depends on:
 * the verified document cache and the persisted hosted study id both live in
 * Electron's main process. Keep the policy here so a launch/history restore can
 * never fall through to local generation or a fresh hosted claim.
 */
function resumeDecision({ cachedDocument, hostedEnabled, studyId }) {
  if (cachedDocument?.verification?.status === 'ok') return 'cached'
  if (hostedEnabled && studyId) return 'resume'
  return 'none'
}

/**
 * One network call per document/study pair.
 *
 * React StrictMode deliberately replays effects in development, and a reader
 * can also open PLAIN while a background restore is still running. Both callers
 * may await the same promise; only the first starts the hosted request. Failed
 * promises are evicted too, so a later explicit retry is still possible.
 */
function createSingleFlight() {
  const inFlight = new Map()

  return {
    run(key, start) {
      const current = inFlight.get(key)
      if (current) return current

      const pending = Promise.resolve().then(start)
      inFlight.set(key, pending)
      const clear = () => {
        if (inFlight.get(key) === pending) inFlight.delete(key)
      }
      pending.then(clear, clear)
      return pending
    },
  }
}

module.exports = { resumeDecision, createSingleFlight }
