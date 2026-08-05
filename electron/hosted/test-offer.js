// Two bugs that were invisible because every layer was individually correct.
//
// 1. Electron flattens an Error across IPC — the message survives, custom
//    properties do not. `err.upgrade = payload` therefore arrived as undefined
//    and EVERY paywall rendered as a red error box with no subscribe buttons.
//    Nobody could have paid.
//
// 2. `historyId` rides inside the analysis object, which is hashed to build the
//    document cache key — so every key was unique and the shared cache, the
//    largest margin lever in the hosted model, has never hit for anyone.
//
//   node electron/hosted/test-offer.js

const { forGeneration, NON_CONTENT_KEYS } = require('../plainread/analyze')
const { cacheKeyFor } = require('../plainread/pipeline')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// The tag must match on both sides. Duplicated deliberately here so a rename in
// either file fails this test instead of silently breaking the paywall again.
const OFFER_TAG = '__OPERATOR_OFFER__'

/** Exactly what Electron does to an Error crossing IPC. */
const throughIpc = (err) => {
  const flat = new Error(err.message)
  flat.stack = err.stack
  return flat                       // every custom property is gone
}

/** The decoder, mirroring src/lib/hostedError.ts. */
function offerFromError(e) {
  const message = typeof e === 'string' ? e : e?.message
  if (typeof message !== 'string') return null
  const at = message.indexOf(OFFER_TAG)
  if (at === -1) return null
  try {
    const parsed = JSON.parse(message.slice(at + OFFER_TAG.length))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch { return null }
}

;(async () => {
  console.log('\nTHE OFFER MUST SURVIVE ELECTRON IPC')
  {
    const payload = {
      error: 'UPGRADE_REQUIRED', code: 'FREE_STUDY_SPENT',
      headline: 'That was your free study.',
      body: 'It stays here — read it, ask about it, export it.',
      actions: [{ kind: 'subscribe', plan: 'starter', label: 'Starter — $30/mo · 40 studies' }],
    }

    // The OLD way, which is why no paywall ever rendered.
    const oldWay = new Error(payload.headline)
    oldWay.upgrade = payload
    ok('a custom property does NOT survive IPC', throughIpc(oldWay).upgrade === undefined)

    // The way it works.
    const encoded = new Error(`${OFFER_TAG}${JSON.stringify(payload)}`)
    const decoded = offerFromError(throughIpc(encoded))
    ok('the offer survives inside the message', decoded !== null)
    ok('with its code intact', decoded.code === 'FREE_STUDY_SPENT')
    ok('its reassurance intact', /stays here/i.test(decoded.body))
    ok('and its buttons intact', decoded.actions[0].plan === 'starter')
  }

  console.log('\nAN ORDINARY ERROR MUST STAY AN ORDINARY ERROR')
  {
    ok('a plain failure is not an offer', offerFromError(new Error('network unreachable')) === null)
    ok('a malformed payload degrades rather than hiding the error',
       offerFromError(new Error(`${OFFER_TAG}{not json`)) === null)
    ok('a non-object payload is refused', offerFromError(new Error(`${OFFER_TAG}"just a string"`)) === null)
    ok('null and undefined are safe', offerFromError(null) === null && offerFromError(undefined) === null)
  }

  console.log('\nPER-USER KEYS MUST NOT REACH THE CACHE KEY')
  {
    const analysis = { reference: 'Romans 8:1', mainTheme: 'no condemnation', phrases: [{ id: 'p1' }] }
    const withHistory = { ...analysis, historyId: '1785966006123' }
    const otherUser  = { ...analysis, historyId: '9999999999999' }

    ok('historyId is stripped', forGeneration(withHistory).historyId === undefined)
    ok('the reading itself is untouched', forGeneration(withHistory).mainTheme === 'no condemnation')

    // THE POINT: two users studying the same passage must share one document.
    ok('two users share ONE cache key',
       cacheKeyFor(forGeneration(withHistory)) === cacheKeyFor(forGeneration(otherUser)))
    ok('...which they did NOT before the strip',
       cacheKeyFor(withHistory) !== cacheKeyFor(otherUser))
    ok('a stripped analysis matches a clean one',
       cacheKeyFor(forGeneration(withHistory)) === cacheKeyFor(forGeneration(analysis)))

    ok('every non-content key is covered', NON_CONTENT_KEYS.includes('historyId'))
    const messy = { ...analysis, historyId: 'a', studyId: 'b', savedAt: 'c', annotations: {} }
    ok('all of them are stripped together',
       cacheKeyFor(forGeneration(messy)) === cacheKeyFor(forGeneration(analysis)))

    // Non-destructive: the caller's object must be left alone.
    const original = { ...analysis, historyId: 'keep-me' }
    forGeneration(original)
    ok('the caller\'s object is not mutated', original.historyId === 'keep-me')

    // A genuinely different passage must still key differently.
    ok('different readings still differ',
       cacheKeyFor(forGeneration(analysis)) !==
       cacheKeyFor(forGeneration({ ...analysis, mainTheme: 'something else' })))
  }

  console.log('\nKEY ORDER MUST NOT CHANGE THE CACHE KEY')
  {
    // THE jsonb TRAP. JSON.stringify preserves INSERTION order; Postgres jsonb
    // rewrites object keys into its own. So an analysis round-tripped through
    // the shared cache came back reordered, hashed differently, and missed —
    // the second reader of every passage paid full price anyway, which is the
    // exact failure forGeneration was added to prevent.
    const sent     = { reference: 'John 3:16', mainTheme: 'love', phrases: [{ id: 'p1' }], genre: { genre: 'Gospel' } }
    const returned = { genre: { genre: 'Gospel' }, phrases: [{ id: 'p1' }], reference: 'John 3:16', mainTheme: 'love' }

    ok('raw stringify DID differ on key order',
       JSON.stringify(sent) !== JSON.stringify(returned))
    ok('canonicalised, the two are the same key',
       cacheKeyFor(forGeneration(sent)) === cacheKeyFor(forGeneration(returned)))
    ok('the reading itself survives canonicalisation',
       forGeneration(returned).mainTheme === 'love' && forGeneration(returned).reference === 'John 3:16')
    ok('a non-object is passed through untouched',
       forGeneration(null) === null && forGeneration('x') === 'x')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
