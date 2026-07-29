#!/usr/bin/env node
/**
 * test-verify-async.js — the claim check OFF the critical path.
 *
 * NO API KEY REQUIRED. Every model call is a fake `createClient`, and every one
 * of them is GATED: the fake will not resolve until this file says so. That is
 * the only way to prove the thing this feature exists for — that plainRead
 * returns while the check is still in flight. A test that merely awaits both and
 * checks the result would pass just as happily against the blocking version.
 *
 * What is being defended here, in order of how much damage the regression does:
 *
 *   1. AN UNVERIFIED DOCUMENT MUST NEVER BE CACHED. The fast path now returns a
 *      document marked 'pending' — unchecked, on its way to a reader. Writing it
 *      under the passage's cache key would enshrine unchecked claims forever,
 *      which is the exact bug the `status === 'ok'` guard was added to kill. Two
 *      tests hold this from both sides: pending is refused at return, and a
 *      failed check is refused when it lands.
 *   2. A cache HIT is already verified, so it must not fire a second check.
 *   3. A verify that throws leaves the reader holding the unverified document
 *      and does not reject — there is no caller left to catch it.
 *   4. Two passages in quick succession must not cross their corrections.
 *
 * Run:  node electron/plainread/test-verify-async.js
 * Exits non-zero on any failure.
 */

const assert = require('assert')

const {
  plainRead,
  cacheKeyFor,
  VERIFY_PROMISE,
} = require('./pipeline')

const { validatePlainRead } = require('./validate')
const { extractClaims, skippedVerification } = require('./verify')

/* ------------------------------------------------------------------ *
 * harness
 * ------------------------------------------------------------------ */

const results = []

/**
 * Every test in this file holds a model call open on purpose. That makes a
 * HANG the most likely way to break it — and a hung `await` is the one failure
 * node reports as success: with no timer and no socket left, the event loop
 * drains, the process exits 0, and not one line is printed. This suite hit
 * exactly that while being written.
 *
 * So: names stream as they finish rather than being buffered to a summary, and
 * the watchdog below turns silence into a loud, non-zero failure.
 */
function test(name, fn) {
  const done = (ok, err) => {
    results.push({ name, ok, err })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
    if (!ok) console.log(`      ${err && err.message}`)
  }
  try {
    const out = fn()
    if (out && typeof out.then === 'function') {
      return out.then(() => done(true), (err) => done(false, err))
    }
    done(true)
  } catch (err) {
    done(false, err)
  }
  return Promise.resolve()
}

const WATCHDOG_MS = 20000
const watchdog = setTimeout(() => {
  console.log('')
  console.log(`TIMED OUT after ${WATCHDOG_MS}ms — a gated model call was never released.`)
  console.log(`Last test to finish: ${results.length ? results[results.length - 1].name : '(none)'}`)
  process.exit(1)
}, WATCHDOG_MS)
// Deliberately NOT unref'd. An unref'd watchdog cannot fire on the failure it
// exists to catch: the hang leaves nothing else on the loop, so node would exit
// before the timer ran. It is cleared at the end of main().

/**
 * A promise plus its resolve handle. The whole file turns on being able to hold
 * a model call open across an `await` boundary and assert on what the caller
 * already has while it is still open.
 */
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** Lets every already-queued microtask run, without advancing the gates. */
function flush() {
  return new Promise((res) => setImmediate(res))
}

/* ------------------------------------------------------------------ *
 * fixtures — Philippians 4:10-13, matching test-plainread.js
 *
 * Kept local and self-contained, the way every other suite in this directory
 * keeps its fixtures. The words step carries the fabrication the whole feature
 * exists because of: 4:13 is asyndetic, so there is no connector there.
 * ------------------------------------------------------------------ */

const SETTING_LEDGER_CLAIM =
  'Roman households in the first century kept a written ledger of favors owed between patron and client.'

const WORDS_CONNECTOR_CLAIM =
  'Verse 13 opens with a connector that reaches back to that list.'

function philippiansSituation() {
  return {
    when:
      'around AD 62, late in a stretch of custody, though a minority place the letter earlier and from a different prison',
    where: 'written from custody in a Roman city, sent to a Roman colony in northern Greece',
    pressure:
      'The congregation had put money together and sent it a long way to a man in chains. They were not a wealthy group, and the gift cost them something real. Months had passed with no word back, long enough for the senders to wonder whether it had ever arrived. The man they had paid to keep alive was a prisoner whose case could still end either way.',
    soWhat:
      'The line about contentment is not a maxim floating free of a situation. It sits inside a thank-you note from a prisoner to the people whose money was keeping him fed.',
    confidence: 'reconstructed',
    vaultSourced: false,
  }
}

function rawDoc(overrides = {}) {
  const base = {
    reference: 'Philippians 4:10-13',
    sensitive: false,
    situation: philippiansSituation(),
    meaning: {
      plain:
        'The writer thanks a group that sent him money and says he has learned to be steady whether he has plenty or nothing.',
      misread: {
        exists: true,
        claim: 'It promises I can accomplish anything I set out to do.',
        whyNot: 'The surrounding lines are about having little and having much, not about achievement.',
        biggerNotSmaller:
          'Steadiness that does not depend on circumstances is a larger claim than winning, not a smaller one.',
      },
      assumes: 'That the writer is describing his own settled state, not issuing a rule for everyone.',
      level: null,
    },
    work: {
      genre: {
        body:
          'This is an occasional letter, not an essay and not a manual. Letters answer situations, so the shape of the argument follows what produced it.',
        youCanCheck: 'Read the opening and closing lines back to back and notice both name specific people.',
        theMove: 'Ask what kind of writing you are holding before you ask what it means.',
      },
      setting: {
        body:
          'This is a letter, and the man behind it is in custody. The letter went to a Roman colony in Macedonia, and its readers had sent him money more than once. ' +
          SETTING_LEDGER_CLAIM,
        youCanCheck: 'Find the two places in the chapter that name money and read them together.',
        theMove: 'Ask what the first readers already knew that you do not.',
      },
      surroundings: {
        body:
          'The two verses before this one name the gift and the people who sent it. The line after turns back to thanking them, which bounds how far the middle can be pushed.',
        youCanCheck: 'Read the four lines on either side without stopping at the famous one.',
        theMove: 'Never read a line without reading its neighbors first.',
      },
      words: {
        body:
          'The sentence runs on a verb of learning, not a verb of feeling. ' +
          WORDS_CONNECTOR_CLAIM +
          ' The word translated as content was a common term for self-sufficiency.',
        youCanCheck: 'Underline every verb in the paragraph and see which ones repeat.',
        theMove: 'Check the sentence structure before you decide what a phrase means.',
      },
      story: {
        body:
          'The letter sits inside a longer story about a people learning to trust provision they did not control. The wilderness generation in Exodus is the pattern being drawn on here.',
        youCanCheck: 'Read the manna account and notice what happens when people store extra.',
        theMove: 'Ask where a passage sits in the whole story before you apply it to your week.',
      },
      doing: {
        body:
          'The writer is closing a thank-you note in the last paragraph without making himself dependent on the gift. He wants the readers to know their gift arrived and did not put him under obligation.',
        youCanCheck: 'Read the last six lines aloud and notice how carefully the gift is described.',
        theMove: 'Ask what the writer is doing with the words, not only what the words say.',
      },
      christPathway: null,
    },
    outline: {
      shape: 'Linear: the gift is named, then qualified, then grounded.',
      units: [
        {
          ref: '4:10',
          heading: 'The writer names the renewed gift and his gladness at it',
          logic: null,
          children: null,
        },
        {
          ref: '4:11-12',
          heading: 'The writer qualifies that gladness so it does not rest on the gift',
          logic: 'restatement — he immediately guards the sentence he has just written',
          children: null,
        },
        {
          ref: '4:13',
          heading: 'The ground of that steadiness is stated',
          logic: 'ground — this line supplies the basis for the contentment just described',
          children: null,
        },
      ],
    },
    distance: 'He is writing from custody to people who had just gone without in order to send him money.',
    application: {
      faces: ['duty', 'character'],
      dominantFace: 'duty',
      toThemFirst: 'They were being told their gift had landed and had not put the writer in their debt.',
      thenToYou: 'You are being asked whether your steadiness currently depends on your circumstances.',
      step: {
        kind: 'plan',
        cue: 'When I catch myself saying I cannot handle this month',
        action: 'I write down what I actually have, before I decide what I lack',
        question: 'Where does my steadiness actually come from this week?',
      },
    },
    restraint: [
      'This is not a guarantee of outcomes.',
      'This is not a statement about physical strength or performance.',
    ],
    differ: null,
    unknowns: ['Whether the gift arrived once or in several parts is not stated.'],
    handoff: 'If money is the pressure under this, say that out loud to a person you trust before you decide anything.',
  }
  return { ...base, ...overrides }
}

function validDoc(overrides) {
  return validatePlainRead(rawDoc(overrides), { reference: 'Philippians 4:10-13' })
}

const PAYLOAD = {
  reference: 'Philippians 4:10-13',
  passageText:
    '10 I rejoiced in the Lord greatly that now at length you have revived your concern for me. ' +
    '11 Not that I am speaking of being in need, for I have learned in whatever situation I am to be content. ' +
    '12 I know how to be brought low, and I know how to abound. ' +
    '13 I can do all things through him who strengthens me.',
}

const ANALYSIS = {
  reference: 'Philippians 4:10-13',
  passageText: PAYLOAD.passageText,
  mainTheme: 'learned contentment',
  genre: 'letter',
}

/**
 * A SECOND passage — the one that must not receive the first's corrections.
 *
 * Deliberately the next paragraph of the same letter rather than a psalm. The
 * outline block is validated against the reference (units must begin at the
 * first supplied verse and end at the last), so a fixture that borrows this
 * document's outline under a different reference does not validate — it fails
 * before the race under test is ever reached. Same book, adjacent verses, real
 * outline.
 */
const REF_2 = 'Philippians 4:14-20'

const ANALYSIS_2 = {
  reference: REF_2,
  passageText:
    '14 Yet it was kind of you to share my trouble. 15 And you Philippians yourselves know that ' +
    'no church entered into partnership with me except you only. 16 Even in Thessalonica you sent me help. ' +
    '17 Not that I seek the gift, but I seek the fruit that increases to your credit. ' +
    '18 I have received full payment, and more. 19 And my God will supply every need of yours. ' +
    '20 To our God and Father be glory forever and ever. Amen.',
  mainTheme: 'partnership in the gospel',
  genre: 'letter',
}

function rawDoc2() {
  return rawDoc({
    reference: REF_2,
    outline: {
      shape: 'Linear: the partnership is named, then reframed, then closed in praise.',
      units: [
        { ref: '4:14', heading: 'The writer names their sharing in his trouble', logic: null, children: null },
        {
          ref: '4:15-17',
          heading: 'The writer recalls the long history of that partnership',
          logic: 'ground — the record supports the commendation just made',
          children: null,
        },
        {
          ref: '4:18-20',
          heading: 'The account is declared settled and closed in praise',
          logic: 'conclusion — the argument ends where the letter ends',
          children: null,
        },
      ],
    },
  })
}

/**
 * A createClient whose Nth call resolves only when the Nth gate is released.
 * `calls` records every request; `gates` is one deferred per scripted payload.
 */
function gatedClient(payloads) {
  const calls = []
  const gates = payloads.map(() => deferred())
  const create = async (req) => {
    const i = calls.length
    calls.push(req)
    const next = payloads[i]
    if (next === undefined) throw new Error(`unscripted model call #${i + 1}`)
    await gates[i].promise
    if (next instanceof Error) throw next
    return { content: [{ type: 'text', text: JSON.stringify(next) }] }
  }
  return { createClient: () => ({ messages: { create } }), calls, gates }
}

function verdictsFor(claims, overrides = {}) {
  return {
    verdicts: claims.map((c) => {
      const o = overrides[c.id]
      if (!o) return { id: c.id, verdict: 'CONFIRMED', reason: 'stated in the passage', correctedStep: null }
      return { id: c.id, correctedStep: null, ...o }
    }),
  }
}

/** Every claim in `doc` confirmed — a clean check that changes nothing. */
function confirmAll(doc) {
  return verdictsFor(extractClaims(doc))
}

/** The verdict set used everywhere a REFUTED claim needs to be visible. */
function refuteTheConnector() {
  const claims = extractClaims(validDoc())
  const target = claims.find((c) => c.text === WORDS_CONNECTOR_CLAIM)
  assert.ok(target, 'fixture must still carry the fabricated connector claim')
  return verdictsFor(claims, {
    [target.id]: { verdict: 'REFUTED', reason: 'the verse is asyndetic' },
  })
}

/* ------------------------------------------------------------------ *
 * tests
 * ------------------------------------------------------------------ */

async function main() {
  /* ---------------------------------------------------------------- *
   * 1. the point of the whole change: the reader does not wait
   * ---------------------------------------------------------------- */

  await test('deferred mode RETURNS before verification resolves', async () => {
    const { createClient, calls, gates } = gatedClient([rawDoc(), refuteTheConnector()])

    const p = plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient,
      deferVerify: true,
    })

    // Only the generation is released. If plainRead awaited the check, this
    // await would hang forever and the suite would time out rather than fail —
    // so the gate below is also the assertion.
    gates[0].resolve()
    const doc = await p

    assert.strictEqual(doc.verification.status, 'pending', 'the reader gets a pending document')
    assert.ok(
      doc.work.words.body.includes(WORDS_CONNECTOR_CLAIM),
      'nothing has been corrected yet — the check has not run'
    )
    assert.strictEqual(calls.length, 2, 'the check was STARTED, just not awaited')
    assert.ok(doc[VERIFY_PROMISE], 'the in-process handle to the check is attached')

    // Release the check and let it land.
    gates[1].resolve()
    const finalDoc = await doc[VERIFY_PROMISE]

    assert.strictEqual(finalDoc.verification.status, 'ok')
    assert.strictEqual(finalDoc.verification.refuted, 1)
    assert.ok(
      !finalDoc.work.words.body.includes(WORDS_CONNECTOR_CLAIM),
      'the correction landed on the follow-up document'
    )
  })

  await test('the follow-up fires with the CORRECTED document', async () => {
    const { createClient, gates } = gatedClient([rawDoc(), refuteTheConnector()])

    const seen = []
    const doc = await (async () => {
      const p = plainRead({
        analysis: ANALYSIS,
        apiKey: 'test-key',
        createClient,
        deferVerify: true,
        onVerified: (d) => seen.push(d),
      })
      gates[0].resolve()
      return p
    })()

    assert.strictEqual(seen.length, 0, 'nothing fires before the check resolves')

    gates[1].resolve()
    await doc[VERIFY_PROMISE]
    await flush()

    assert.strictEqual(seen.length, 1, 'fires exactly once')
    const pushed = seen[0]
    assert.strictEqual(pushed.verification.status, 'ok')
    assert.ok(!pushed.work.words.body.includes(WORDS_CONNECTOR_CLAIM), 'the refuted sentence is gone')

    // The whole document, ready to swap in — not a diff. Everything the fast
    // path stamped after the verifier's snapshot must survive the round trip,
    // or a renderer that replaces wholesale loses it.
    assert.strictEqual(pushed.reference, 'Philippians 4:10-13')
    assert.strictEqual(pushed.readingLevel, doc.readingLevel)
    assert.strictEqual(pushed.promptVersion, doc.promptVersion)
    assert.ok('mechanic' in pushed, 'the mechanic block survives into the correction')
    assert.ok(Array.isArray(pushed.restraint) && pushed.restraint.length >= 2)

    // And the document the reader already holds is NOT mutated underneath them.
    assert.strictEqual(doc.verification.status, 'pending')
    assert.ok(doc.work.words.body.includes(WORDS_CONNECTOR_CLAIM))
  })

  /* ---------------------------------------------------------------- *
   * 2. the trap: what is allowed into the cache
   * ---------------------------------------------------------------- */

  await test('an UNVERIFIED (pending) document is never written to cache', async () => {
    const { createClient, gates } = gatedClient([rawDoc(), refuteTheConnector()])

    const store = new Map()
    const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }

    const p = plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient,
      cache,
      deferVerify: true,
    })
    gates[0].resolve()
    const doc = await p

    assert.strictEqual(doc.verification.status, 'pending')
    assert.strictEqual(
      store.size,
      0,
      'the pending document must NOT be in the cache — that is the bug this guard exists to stop'
    )
    assert.strictEqual(store.get(cacheKeyFor(ANALYSIS)), undefined)

    // Let it finish so the process does not exit with the check still open.
    gates[1].resolve()
    await doc[VERIFY_PROMISE]
  })

  await test('the VERIFIED document IS cached, once the check lands', async () => {
    const { createClient, gates } = gatedClient([rawDoc(), refuteTheConnector()])

    const store = new Map()
    const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }

    const p = plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient,
      cache,
      deferVerify: true,
    })
    gates[0].resolve()
    const doc = await p
    assert.strictEqual(store.size, 0)

    gates[1].resolve()
    await doc[VERIFY_PROMISE]

    const cached = store.get(cacheKeyFor(ANALYSIS))
    assert.ok(cached, 'the checked document was cached')
    assert.strictEqual(cached.verification.status, 'ok')
    assert.strictEqual(cached.verification.refuted, 1)
    assert.ok(
      !cached.work.words.body.includes(WORDS_CONNECTOR_CLAIM),
      'the CACHED copy is the corrected one, not the one the reader saw first'
    )
    // A Promise reaching electron-store would throw on the structured clone.
    assert.strictEqual(cached[VERIFY_PROMISE], undefined, 'the verify handle never reaches the store')
    assert.strictEqual(
      JSON.stringify(cached).includes('verifyPromise'),
      false,
      'nothing promise-shaped is serialisable off the cached document'
    )
  })

  await test('a FAILED background check is not cached either', async () => {
    // The verifier degrades rather than throwing on a dead API, so this is the
    // realistic transient: a 529 on the second hop. One 529 must not enshrine an
    // unchecked reading under this passage's key forever.
    const { createClient, gates } = gatedClient([rawDoc(), new Error('529 overloaded')])

    const store = new Map()
    const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }

    const p = plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient,
      cache,
      deferVerify: true,
    })
    gates[0].resolve()
    const doc = await p
    gates[1].resolve()
    const finalDoc = await doc[VERIFY_PROMISE]

    assert.notStrictEqual(finalDoc.verification.status, 'ok', 'the check did not succeed')
    assert.strictEqual(store.size, 0, 'a failed check writes nothing to the cache')
    assert.ok(
      finalDoc.unknowns.some((u) => /provisional/i.test(u)),
      'the reader is told the check did not finish'
    )
  })

  /* ---------------------------------------------------------------- *
   * 3. a cache HIT is already verified
   * ---------------------------------------------------------------- */

  await test('a cache HIT returns a verified doc and fires NO second check', async () => {
    const { createClient, gates } = gatedClient([rawDoc(), refuteTheConnector()])

    const store = new Map()
    const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }

    // First read, all the way through, so the cache holds a verified document.
    const p = plainRead({ analysis: ANALYSIS, apiKey: 'test-key', createClient, cache, deferVerify: true })
    gates[0].resolve()
    const first = await p
    gates[1].resolve()
    await first[VERIFY_PROMISE]
    assert.strictEqual(store.size, 1)

    // Second read. A client that throws on ANY call — if the hit path builds a
    // client or fires a check, this test fails loudly instead of silently
    // costing a second Opus call per cached view.
    let hitCalls = 0
    const exploding = () => ({
      messages: { create: async () => { hitCalls += 1; throw new Error('a cache hit must not call the model') } },
    })

    const seen = []
    const doc = await plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient: exploding,
      cache,
      deferVerify: true,
      onVerified: (d) => seen.push(d),
    })
    await flush()

    assert.strictEqual(hitCalls, 0, 'no model call on a cache hit')
    assert.strictEqual(doc.fromCache, true)
    assert.strictEqual(doc.verification.status, 'ok', 'a hit is verified by construction')
    assert.strictEqual(doc[VERIFY_PROMISE], undefined, 'nothing is running to correct')
    assert.strictEqual(seen.length, 0, 'no follow-up event for a document that is already final')
    assert.ok(!doc.work.words.body.includes(WORDS_CONNECTOR_CLAIM), 'the hit carries the corrections')
  })

  /* ---------------------------------------------------------------- *
   * 4. failure that must not become a crash
   * ---------------------------------------------------------------- */

  await test('a verify that THROWS leaves the reader with the unverified doc', async () => {
    const { createClient, gates } = gatedClient([rawDoc()])

    const store = new Map()
    const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }

    // Not a degraded return — an outright throw, which is what verifyPlainRead
    // does on a pulpit leak in the final document. There is no caller left to
    // catch it; in the main process it would be an unhandled rejection.
    let rejected = false
    process.once('unhandledRejection', () => { rejected = true })

    const p = plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient,
      cache,
      deferVerify: true,
      verifyFn: async () => { throw new Error('verifier exploded') },
    })
    gates[0].resolve()
    const doc = await p

    assert.strictEqual(doc.verification.status, 'pending', 'the reader still has the reading')
    assert.ok(doc.work.words.body.includes(WORDS_CONNECTOR_CLAIM))

    const finalDoc = await doc[VERIFY_PROMISE]
    await flush()

    assert.strictEqual(finalDoc.verification.status, 'failed', 'the failure is recorded, not hidden')
    assert.ok(
      finalDoc.work.words.body.includes(WORDS_CONNECTOR_CLAIM),
      'an unchecked document is not silently emptied — the reader keeps what they had'
    )
    assert.ok(
      finalDoc.unknowns.some((u) => /provisional/i.test(u)),
      'and is told to treat the detail as provisional'
    )
    assert.strictEqual(store.size, 0, 'a thrown check writes nothing to the cache')
    assert.strictEqual(rejected, false, 'the background check never rejects')
  })

  await test('an onVerified callback that throws does not take the process down', async () => {
    const { createClient, gates } = gatedClient([rawDoc(), refuteTheConnector()])

    let rejected = false
    process.once('unhandledRejection', () => { rejected = true })

    const p = plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient,
      deferVerify: true,
      onVerified: () => { throw new Error('the renderer went away mid-send') },
    })
    gates[0].resolve()
    const doc = await p
    gates[1].resolve()
    await doc[VERIFY_PROMISE]
    await flush()

    assert.strictEqual(rejected, false, "a caller's bug is the caller's problem, not a crash")
  })

  await test('a window closing mid-verify cannot be observed by the pipeline', async () => {
    // main.js guards the send with event.sender.isDestroyed(). What this file
    // owns is the promise underneath it: the check must still complete, still
    // decide the cache question, and still not reject, whether or not anyone is
    // listening. So: no onVerified at all, which is the same shape as a callback
    // whose window has gone.
    const { createClient, gates } = gatedClient([rawDoc(), refuteTheConnector()])

    const store = new Map()
    const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }

    let rejected = false
    process.once('unhandledRejection', () => { rejected = true })

    const p = plainRead({ analysis: ANALYSIS, apiKey: 'test-key', createClient, cache, deferVerify: true })
    gates[0].resolve()
    const doc = await p
    gates[1].resolve()
    const finalDoc = await doc[VERIFY_PROMISE]
    await flush()

    assert.strictEqual(rejected, false)
    assert.strictEqual(finalDoc.verification.status, 'ok')
    assert.strictEqual(store.size, 1, 'the work still lands in the cache for the next reader')
  })

  await test('a dead cache store loses the write, not the reading', async () => {
    const { createClient, gates } = gatedClient([rawDoc(), refuteTheConnector()])

    const cache = {
      get: () => null,
      set: () => { throw new Error('electron-store is gone') },
    }

    const p = plainRead({ analysis: ANALYSIS, apiKey: 'test-key', createClient, cache, deferVerify: true })
    gates[0].resolve()
    const doc = await p
    gates[1].resolve()
    const finalDoc = await doc[VERIFY_PROMISE]

    assert.strictEqual(finalDoc.verification.status, 'ok', 'the corrected document survives a dead store')
  })

  /* ---------------------------------------------------------------- *
   * 5. two passages in quick succession
   * ---------------------------------------------------------------- */

  await test('two passages in flight do not cross their corrections', async () => {
    const a = gatedClient([rawDoc(), refuteTheConnector()])
    // B's check confirms everything, so B is never corrected. That is the point:
    // if B ends up missing the connector sentence, it received A's correction.
    const b = gatedClient([
      rawDoc2(),
      confirmAll(validatePlainRead(rawDoc2(), { reference: REF_2 })),
    ])

    const store = new Map()
    const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }

    const seen = []

    const pA = plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient: a.createClient,
      cache,
      deferVerify: true,
      onVerified: (d) => seen.push({ tag: 'A', doc: d }),
    })
    const pB = plainRead({
      analysis: ANALYSIS_2,
      apiKey: 'test-key',
      createClient: b.createClient,
      cache,
      deferVerify: true,
      onVerified: (d) => seen.push({ tag: 'B', doc: d }),
    })

    a.gates[0].resolve()
    b.gates[0].resolve()
    const docA = await pA
    const docB = await pB

    assert.strictEqual(docA.reference, 'Philippians 4:10-13')
    assert.strictEqual(docB.reference, REF_2)

    // Land them OUT OF ORDER — the second request's check finishes first. This
    // is the race the renderer contract exists for.
    b.gates[1].resolve()
    await docB[VERIFY_PROMISE]
    a.gates[1].resolve()
    await docA[VERIFY_PROMISE]
    await flush()

    assert.strictEqual(seen.length, 2)
    assert.strictEqual(seen[0].tag, 'B', 'B landed first, as scripted')
    assert.strictEqual(seen[1].tag, 'A')

    // Each correction carries its OWN reference. That is what the renderer
    // matches on before it swaps, and main.js copies it onto the event.
    assert.strictEqual(seen[0].doc.reference, REF_2)
    assert.strictEqual(seen[1].doc.reference, 'Philippians 4:10-13')

    // And they landed under separate cache keys — B's document did not
    // overwrite A's passage.
    const keyA = cacheKeyFor(ANALYSIS)
    const keyB = cacheKeyFor(ANALYSIS_2)
    assert.notStrictEqual(keyA, keyB)
    assert.strictEqual(store.get(keyA).reference, 'Philippians 4:10-13')
    assert.strictEqual(store.get(keyB).reference, REF_2)
    assert.ok(!store.get(keyA).work.words.body.includes(WORDS_CONNECTOR_CLAIM), "A got A's correction")
    assert.ok(store.get(keyB).work.words.body.includes(WORDS_CONNECTOR_CLAIM), "B was not corrected — B had no refutation")
  })

  /* ---------------------------------------------------------------- *
   * 6. the blocking path still exists, unchanged
   * ---------------------------------------------------------------- */

  await test('deferVerify:false still returns a fully verified document in one call', async () => {
    // scripts/plainread-live.js, the evaluation runs and the pre-generated
    // program path all depend on this. There is no renderer there to push a
    // correction to, so the document must be finished when plainRead resolves.
    const { createClient, gates, calls } = gatedClient([rawDoc(), refuteTheConnector()])

    const store = new Map()
    const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }

    const p = plainRead({ analysis: ANALYSIS, apiKey: 'test-key', createClient, cache })

    // Release BOTH up front: in blocking mode plainRead does not resolve until
    // the check has run, so holding gate 1 shut would hang the suite.
    gates[0].resolve()
    gates[1].resolve()
    const doc = await p

    assert.strictEqual(calls.length, 2)
    assert.strictEqual(doc.verification.status, 'ok', 'finished, not pending')
    assert.strictEqual(doc.verification.refuted, 1)
    assert.ok(!doc.work.words.body.includes(WORDS_CONNECTOR_CLAIM))
    assert.strictEqual(doc[VERIFY_PROMISE], undefined, 'nothing runs in the background in blocking mode')
    assert.strictEqual(store.get(cacheKeyFor(ANALYSIS)).verification.status, 'ok')
  })

  await test('the default is BLOCKING — a caller that passes nothing is unchanged', async () => {
    const { createClient, gates } = gatedClient([rawDoc(), refuteTheConnector()])

    let settled = false
    const p = plainRead({ analysis: ANALYSIS, apiKey: 'test-key', createClient }).then((d) => {
      settled = true
      return d
    })

    gates[0].resolve()
    await flush()
    assert.strictEqual(settled, false, 'still waiting on the check, exactly as before')

    gates[1].resolve()
    const doc = await p
    assert.strictEqual(doc.verification.status, 'ok')
  })

  await test('verify:false with deferVerify:true never starts a background check', async () => {
    const { createClient, calls, gates } = gatedClient([rawDoc()])

    const p = plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient,
      verify: false,
      deferVerify: true,
    })
    gates[0].resolve()
    const doc = await p
    await flush()

    assert.strictEqual(calls.length, 1, 'the check is off; deferring it must not turn it back on')
    assert.strictEqual(doc.verification.status, 'skipped')
    assert.strictEqual(doc[VERIFY_PROMISE], undefined)
  })

  /* ---------------------------------------------------------------- *
   * 7. the pending record itself
   * ---------------------------------------------------------------- */

  await test("'pending' is a full verification record, not a half-built one", async () => {
    const { createClient, gates } = gatedClient([rawDoc(), refuteTheConnector()])

    const p = plainRead({ analysis: ANALYSIS, apiKey: 'test-key', createClient, deferVerify: true })
    gates[0].resolve()
    const doc = await p

    // Anything that reads a verification block must find every field it expects,
    // or a renderer that shows counts crashes on the pending document.
    const shape = skippedVerification()
    for (const k of Object.keys(shape)) {
      assert.ok(k in doc.verification, `pending record is missing '${k}'`)
    }
    assert.strictEqual(doc.verification.status, 'pending')
    assert.strictEqual(doc.verification.checked, 0)
    assert.ok(Array.isArray(doc.verification.notes))

    // The provenance badge must NOT be asserted on an unchecked document.
    assert.strictEqual(
      doc.situation.vaultSourced,
      false,
      'an unverified provenance claim is precisely the one not to assert'
    )

    gates[1].resolve()
    await doc[VERIFY_PROMISE]
  })

  /* ---------------------------------------------------------------- *
   * summary
   * ---------------------------------------------------------------- */

  clearTimeout(watchdog)

  const failed = results.filter((r) => !r.ok)
  console.log('')
  console.log(`${results.length - failed.length}/${results.length} passed`)

  if (failed.length) {
    console.log('')
    for (const r of failed) {
      console.log(`--- ${r.name} ---`)
      console.log(r.err && r.err.stack ? r.err.stack : String(r.err))
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('test harness crashed:', err)
  process.exit(1)
})
