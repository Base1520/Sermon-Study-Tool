// Tests for the hosted client — the half of "download and go" that runs on the
// reader's machine.
//
// fetch is stubbed, so this exercises the parts that actually break in the
// field: a torn NDJSON line, a 402 that must stay an offer rather than become an
// error, an install id that must not regenerate, and a stream that dies without
// saying so.
//
//   node electron/hosted/test-client.js

const client = require('./client')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const fakeStore = (init = {}) => {
  const m = new Map(Object.entries(init))
  return { get: (k, d = null) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v), _m: m }
}

/** Build a Response whose body streams the given chunks verbatim. */
function streamResponse(chunks, { status = 200 } = {}) {
  const enc = new TextEncoder()
  let i = 0
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length
          ? { done: false, value: enc.encode(chunks[i++]) }
          : { done: true, value: undefined }),
      }),
    },
    text: async () => chunks.join(''),
  }
}
const jsonResponse = (obj, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(obj),
  json: async () => obj,
})

const withFetch = async (impl, fn) => {
  const real = global.fetch
  global.fetch = impl
  try { return await fn() } finally { global.fetch = real }
}
const withEnv = async (url, fn) => {
  const prev = process.env.OPERATOR_API_URL
  if (url === null) delete process.env.OPERATOR_API_URL
  else process.env.OPERATOR_API_URL = url
  try { return await fn() } finally {
    if (prev === undefined) delete process.env.OPERATOR_API_URL
    else process.env.OPERATOR_API_URL = prev
  }
}

;(async () => {
  console.log('\nA PACKAGED BUILD IS HOSTED BY DEFAULT')
  {
    const { DEFAULT_API_URL } = require('./endpoint')

    // UNSET is the case that matters most: a double-clicked .app inherits no
    // shell environment, so this is what every downloader gets. If it resolved
    // to null the app would demand an Anthropic key — the exact wall the server
    // exists to remove — and only on someone else's machine.
    await withEnv(null, async () => {
      ok('an unset variable falls back to the packaged endpoint',
         client.hostedBaseUrl() === DEFAULT_API_URL.replace(/\/+$/, ''), String(client.hostedBaseUrl()))
      ok('the packaged endpoint is https', /^https:\/\//.test(DEFAULT_API_URL))
    })

    // EXPLICITLY EMPTY is a real answer, not a missing one: hosting off, back to
    // the local-key path. That distinction is the whole reason hostedBaseUrl
    // checks for `undefined` rather than falsiness.
    await withEnv('', async () => {
      ok('an explicitly empty value turns hosting OFF', client.hostedBaseUrl() === null)
      let threw = false
      try { await client.analyze(fakeStore(), { text: 't', reference: 'r' }) } catch { threw = true }
      ok('and analyze refuses rather than guessing a host', threw)
      ok('me() returns null instead of erroring', (await client.me(fakeStore())) === null)
    })

    await withEnv('https://api.example.com/', async () => {
      ok('an override wins over the packaged default', client.hostedBaseUrl() === 'https://api.example.com')
      ok('and a trailing slash is normalised away', !client.hostedBaseUrl().endsWith('/'))
    })
  }

  console.log('\nTHE INSTALL ID MUST SURVIVE A RESTART')
  {
    const store = fakeStore()
    const first = client.installId(store)
    ok('an id is generated on first use', typeof first === 'string' && first.length > 10)
    ok('and the same one comes back next time', client.installId(store) === first)
    ok('it is persisted, not held in memory', store.get('operator-install-id') === first)
    ok('a different install gets a different id', client.installId(fakeStore()) !== first)
  }

  console.log('\nIDENTITY IS SENT, AND ANONYMOUS IS FIRST-CLASS')
  {
    await withEnv('https://api.example.com', async () => {
      let sent = null
      await withFetch(async (_u, opts) => { sent = opts.headers; return jsonResponse({ analysis: {}, studyId: 's1' }) },
        () => client.analyze(fakeStore(), { text: 't', reference: 'John 3:16' }))
      ok('the install id always rides along', !!sent['x-install-id'])
      ok('an anonymous caller sends no bearer token', !sent.authorization)

      let sent2 = null
      await withFetch(async (_u, opts) => { sent2 = opts.headers; return jsonResponse({ analysis: {}, studyId: 's1' }) },
        () => client.analyze(fakeStore({ 'operator-device-token': 'opr_abc' }), { text: 't', reference: 'r' }))
      ok('a subscriber sends theirs', sent2.authorization === 'Bearer opr_abc')
    })
  }

  console.log('\nA 402 IS AN OFFER, NOT AN ERROR')
  {
    await withEnv('https://api.example.com', async () => {
      const offer = {
        error: 'UPGRADE_REQUIRED',
        code: 'FREE_STUDY_SPENT',
        body: 'Your study stays here.',
        actions: [{ label: '$29.99/mo', plan: 'starter' }],
      }
      let caught = null
      await withFetch(async () => jsonResponse(offer, 402), async () => {
        try { await client.analyze(fakeStore(), { text: 't', reference: 'r' }) } catch (e) { caught = e }
      })
      ok('it is raised as a refusal', caught instanceof client.HostedRefusal)
      ok('carrying the server\'s own code', caught.code === 'UPGRADE_REQUIRED')
      ok('and the whole offer, intact', caught.payload.actions[0].plan === 'starter')
      ok('with words a reader can be shown', /stays here/i.test(caught.payload.body))

      let paused = null
      await withFetch(async () => jsonResponse({ error: 'SERVICE_PAUSED', message: 'paused for a moment' }, 503),
        async () => { try { await client.analyze(fakeStore(), { text: 't', reference: 'r' }) } catch (e) { paused = e } })
      ok('a paused service is also an offer, not a crash', paused instanceof client.HostedRefusal)
      ok('and says so plainly', /paused/i.test(paused.message))
    })
  }

  console.log('\nTHE STREAM SURVIVES REAL NETWORK SHAPES')
  {
    await withEnv('https://api.example.com', async () => {
      // A chunk boundary lands mid-line, and a ping interrupts the sections.
      const chunks = [
        '{"type":"ping"}\n{"type":"sec',
        'tion","key":"a","value":"first section text"}\n',
        '{"type":"ping"}\n',
        '{"type":"section","key":"b","value":2}\n{"type":"done","document":{"ok":true}}\n',
      ]
      const seen = []
      const doc = await withFetch(async () => streamResponse(chunks),
        () => client.plainRead(fakeStore(), { analysis: {}, reference: 'r', onSection: (k, v) => seen.push([k, v]) }))
      ok('a line torn across two chunks is reassembled', seen.length === 2, JSON.stringify(seen))
      ok('sections arrive in order with their values', seen[0][0] === 'a' && seen[1][1] === 2)
      // The bug this guards: a one-parameter handler on the server dropped every
      // section's CONTENT, so the stream carried names and no text and the reader
      // saw nothing until the whole document landed at once.
      ok('a section carries its CONTENT, not just its name', seen[0][1] === 'first section text',
         JSON.stringify(seen[0]))
      ok('pings are not mistaken for content', !seen.some(([k]) => k === undefined))
      ok('the document comes back', doc.ok === true)

      // Garbage on the wire must not take down a working study.
      const seen2 = []
      const doc2 = await withFetch(async () => streamResponse([
        'not json at all\n{"type":"section","key":"a","value":1}\n{"type":"done","document":{"ok":1}}\n',
      ]), () => client.plainRead(fakeStore(), { analysis: {}, reference: 'r', onSection: (k, v) => seen2.push(k) }))
      ok('an unparseable line is skipped, not fatal', seen2.length === 1 && doc2.ok === 1)

      // A throwing renderer callback must not kill the read.
      const doc3 = await withFetch(async () => streamResponse([
        '{"type":"section","key":"a","value":1}\n{"type":"done","document":{"ok":2}}\n',
      ]), () => client.plainRead(fakeStore(), { analysis: {}, reference: 'r', onSection: () => { throw new Error('window gone') } }))
      ok('a dead window cannot fail the study', doc3.ok === 2)
    })
  }

  console.log('\nA STREAM THAT DIES MUST SAY SO')
  {
    await withEnv('https://api.example.com', async () => {
      let err = null
      await withFetch(async () => streamResponse(['{"type":"section","key":"a","value":1}\n']),
        async () => { try { await client.plainRead(fakeStore(), { analysis: {}, reference: 'r' }) } catch (e) { err = e } })
      ok('a stream with no document is an error, not an empty study', !!err)
      ok('and says the reading ended early', /ended before it finished/i.test(err.message))

      let err2 = null
      await withFetch(async () => streamResponse(['{"type":"error","code":"GENERATION_FAILED","message":"nope"}\n']),
        async () => { try { await client.plainRead(fakeStore(), { analysis: {}, reference: 'r' }) } catch (e) { err2 = e } })
      ok('a server-sent error is surfaced', err2?.code === 'GENERATION_FAILED')
      ok('with the server\'s message', err2.message === 'nope')
    })
  }

  console.log('\nTHE TWO HALVES STAY ONE STUDY')
  {
    await withEnv('https://api.example.com', async () => {
      let body = null
      await withFetch(async (_u, opts) => { body = JSON.parse(opts.body); return streamResponse(['{"type":"done","document":{}}\n']) },
        () => client.plainRead(fakeStore(), { analysis: { a: 1 }, reference: 'r', studyId: 'study-7' }))
      ok('the reading sends back the analyze studyId', body.studyId === 'study-7')
    })
  }

  // A missing aiConsentVersion is refused by the server with 400 before it ever
  // reaches a model, and the desktop shipped without it — so asking about a study
  // was dead on a hosted build while running one worked, because /v1/analyze does
  // not require consent and /v1/ask does. The failure is silent on this side: the
  // request looks well-formed and the field is simply absent. Assert the wire
  // body, not the source, and pin it to the server's own constant so the two
  // cannot drift apart again.
  console.log('\nCONSENT TRAVELS ON EVERY GENERATING REQUEST')
  {
    const serverConstant = (
      require('fs').readFileSync(require('path').join(__dirname, '../../server/src/index.js'), 'utf8')
        .match(/AI_PROCESSING_CONSENT_VERSION\s*=\s*'([^']+)'/) || []
    )[1]
    ok('the server still declares a consent version to match', Boolean(serverConstant))

    await withEnv('https://api.example.com', async () => {
      let body = null
      await withFetch(
        async (_u, opts) => { body = JSON.parse(opts.body); return jsonResponse({ answer: 'x' }) },
        () => client.ask(fakeStore(), { doc: {}, analysis: {}, studyId: 's1', question: 'q', history: [] }),
      )
      ok('ask sends aiConsentVersion', body?.aiConsentVersion === serverConstant,
        `sent ${JSON.stringify(body?.aiConsentVersion)}, server wants ${JSON.stringify(serverConstant)}`)
    })

    await withEnv('https://api.example.com', async () => {
      let body = null
      await withFetch(
        async (_u, opts) => { body = JSON.parse(opts.body); return jsonResponse({ answer: 'x' }) },
        () => client.sermonAssist(fakeStore(), { studyId: 's1', agent: 'scholar', question: 'q', history: [] }),
      )
      ok('the Scholar sends aiConsentVersion', body?.aiConsentVersion === serverConstant,
        `sent ${JSON.stringify(body?.aiConsentVersion)}, server wants ${JSON.stringify(serverConstant)}`)
      ok('the Scholar asks for the scholar agent', body?.agent === 'scholar')
      ok('the Scholar carries the studyId the answer is grounded in', body?.studyId === 's1')
    })
  }

  console.log('\nOFFLINE IS NOT A DOWNGRADE')
  {
    await withEnv('https://api.example.com', async () => {
      const r = await withFetch(async () => { throw new Error('ENOTFOUND') }, () => client.me(fakeStore()))
      ok('a dead network returns null rather than "you are on the free tier"', r === null)
    })
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
