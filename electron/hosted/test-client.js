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
const fs = require('fs')
const path = require('path')

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
      const result = await withFetch(async () => streamResponse(chunks),
        () => client.plainRead(fakeStore(), { analysis: {}, reference: 'r', onSection: (k, v) => seen.push([k, v]) }))
      ok('a line torn across two chunks is reassembled', seen.length === 2, JSON.stringify(seen))
      ok('sections arrive in order with their values', seen[0][0] === 'a' && seen[1][1] === 2)
      // The bug this guards: a one-parameter handler on the server dropped every
      // section's CONTENT, so the stream carried names and no text and the reader
      // saw nothing until the whole document landed at once.
      ok('a section carries its CONTENT, not just its name', seen[0][1] === 'first section text',
         JSON.stringify(seen[0]))
      ok('pings are not mistaken for content', !seen.some(([k]) => k === undefined))
      ok('the document comes back', result.document.ok === true)
      ok('a done frame without an id preserves the id sent by analyze', result.studyId === null)

      // Garbage on the wire must not take down a working study.
      const seen2 = []
      const result2 = await withFetch(async () => streamResponse([
        'not json at all\n{"type":"section","key":"a","value":1}\n{"type":"done","document":{"ok":1}}\n',
      ]), () => client.plainRead(fakeStore(), { analysis: {}, reference: 'r', onSection: (k, v) => seen2.push(k) }))
      ok('an unparseable line is skipped, not fatal', seen2.length === 1 && result2.document.ok === 1)

      // A throwing renderer callback must not kill the read.
      const result3 = await withFetch(async () => streamResponse([
        '{"type":"section","key":"a","value":1}\n{"type":"done","document":{"ok":2}}\n',
      ]), () => client.plainRead(fakeStore(), { analysis: {}, reference: 'r', onSection: () => { throw new Error('window gone') } }))
      ok('a dead window cannot fail the study', result3.document.ok === 2)
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
      const retained = await withFetch(async (_u, opts) => { body = JSON.parse(opts.body); return streamResponse(['{"type":"done","document":{}}\n']) },
        () => client.plainRead(fakeStore(), { analysis: { a: 1 }, reference: 'r', studyId: 'study-7' }))
      ok('the reading sends back the analyze studyId', body.studyId === 'study-7')
      ok('a cached done frame retains the submitted studyId', retained.studyId === 'study-7')

      const rebound = await withFetch(async () => streamResponse([
        '{"type":"done","document":{},"studyId":"study-fresh"}\n',
      ]), () => client.plainRead(fakeStore(), { analysis: { a: 1 }, reference: 'r', studyId: 'study-old' }))
      ok('an authoritative done-frame studyId replaces a stranded id', rebound.studyId === 'study-fresh')
    })
  }

  console.log('\nRESTORE-ONLY INTENT REACHES THE HOSTED BOUNDARY')
  {
    await withEnv('https://api.example.com', async () => {
      let body = null
      await withFetch(
        async (_u, opts) => {
          body = JSON.parse(opts.body)
          return streamResponse(['{"type":"done","document":{},"studyId":"study-old"}\n'])
        },
        () => client.plainRead(fakeStore(), {
          analysis: { a: 1 },
          reference: 'r',
          studyId: 'study-old',
          resumeOnly: true,
        }),
      )
      ok('a restore-only hosted read carries the server no-fresh-claim key',
        body?.restoreOnly === true && !Object.hasOwn(body, 'resumeOnly'))

      let ordinaryBody = null
      await withFetch(
        async (_u, opts) => {
          ordinaryBody = JSON.parse(opts.body)
          return streamResponse(['{"type":"done","document":{},"studyId":"study-new"}\n'])
        },
        () => client.plainRead(fakeStore(), {
          analysis: { a: 1 },
          reference: 'r',
          studyId: 'study-new',
        }),
      )
      ok('an ordinary hosted read does not accidentally become restore-only',
        ordinaryBody?.restoreOnly === false && !Object.hasOwn(ordinaryBody, 'resumeOnly'))
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
      fs.readFileSync(path.join(__dirname, '../../server/src/index.js'), 'utf8')
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

    await withEnv('https://api.example.com', async () => {
      const bodies = []
      for (const agent of ['exegetical', 'theological', 'homiletical', 'scholar']) {
        await withFetch(
          async (_u, opts) => {
            bodies.push(JSON.parse(opts.body))
            return jsonResponse({ answer: 'x' })
          },
          () => client.sermonAssist(fakeStore(), { studyId: null, agent, question: 'q', history: [] }),
        )
      }
      ok('every standing specialist request preserves an explicit null studyId',
        bodies.length === 4 && bodies.every((item) => Object.hasOwn(item, 'studyId') && item.studyId === null))
      ok('null-id requests preserve each requested specialist discipline',
        bodies.map((item) => item.agent).join(',') === 'exegetical,theological,homiletical,scholar')
    })
  }

  console.log('\nTHE SCHOLAR NAMES WHETHER A STUDY IS ATTACHED')
  {
    const mainSource = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8')
    const preloadSource = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8')
    const scholarSource = fs.readFileSync(path.join(__dirname, '../../src/components/ScholarChat.tsx'), 'utf8')
    const errorSource = fs.readFileSync(path.join(__dirname, '../../src/lib/apiErrors.ts'), 'utf8')
    const contextStart = mainSource.indexOf("ipcMain.handle('scholar-chat-context'")
    const chatStart = mainSource.indexOf("ipcMain.handle('scholar-chat'", contextStart + 1)
    const contextHandler = mainSource.slice(contextStart, chatStart)

    // Execute the exact registry policy from main.js with a fake electron-store.
    // This catches the distinction the UI depends on: analyze creates a
    // rideable claim, while only a completed read creates groundable context.
    const registryStart = mainSource.indexOf("const STUDY_ID_KEY = 'hosted-study-ids'")
    const registryEnd = mainSource.indexOf('function asRendererError', registryStart)
    const registrySource = mainSource.slice(registryStart, registryEnd)
    const registryData = {}
    const registryStore = {
      get: (key, fallback) => registryData[key] ?? fallback,
      set: (key, value) => { registryData[key] = value },
    }
    const registry = Function('store', 'hosted', `${registrySource}\nreturn { rememberStudy, recallStudy, recallFinishedStudy, resolveScholarChatContext }`)(
      registryStore,
      { hostedBaseUrl: () => 'https://api.example.com' },
    )

    ok('main owns one shared Scholar context resolver',
      mainSource.includes('const resolveScholarChatContext = (passageContext) =>')
        && (mainSource.match(/resolveScholarChatContext\(passageContext\)/g) || []).length === 2)
    registry.rememberStudy('John 3:16', 'analysis-1')
    ok('an analysis claim stays rideable without pretending a finished study exists',
      registry.recallStudy('John 3:16') === 'analysis-1'
        && registry.recallFinishedStudy('John 3:16') === null
        && registry.resolveScholarChatContext({ reference: 'John 3:16' }).mode === 'general')
    registry.rememberStudy('John 3:16', 'done-1', { finished: true })
    ok('only a completed read promotes Scholar to grounded mode',
      registry.recallFinishedStudy('John 3:16') === 'done-1'
        && registry.resolveScholarChatContext({ reference: 'John 3:16' }).studyId === 'done-1'
        && registry.resolveScholarChatContext({ reference: 'John 3:16' }).mode === 'grounded')
    ok('the real hosted done-frame boundary performs that promotion',
      mainSource.includes("rememberStudy(reference, completedStudyId, { finished: true })")
        && (mainSource.match(/rememberStudy\(reference, completedStudyId, \{ finished: true \}\)/g) || []).length === 1)
    registry.rememberStudy('John 3:16', 'analysis-2')
    ok('a later analysis claim does not erase the last finished grounding row',
      registry.recallStudy('John 3:16') === 'analysis-2'
        && registry.recallFinishedStudy('John 3:16') === 'done-1')
    registryData['hosted-study-ids']['romans 8'] = { studyId: 'legacy-entry', at: Date.now() }
    ok('legacy id-only entries fail closed to general mode instead of claiming completion',
      registry.resolveScholarChatContext({ reference: 'Romans 8' }).mode === 'general')
    ok('the read-only context IPC returns the mode but not the private study id',
      contextStart >= 0 && contextHandler.includes('const { mode } = resolveScholarChatContext(passageContext)')
        && contextHandler.includes('return { mode }') && !contextHandler.includes('return { studyId'))
    ok('preload exposes the Scholar context query',
      preloadSource.includes("scholarChatContext: (payload) => ipcRenderer.invoke('scholar-chat-context', payload)"))
    ok('the renderer asks for mode instead of inferring it from analysis',
      scholarSource.includes('electronAPI?.scholarChatContext')
        && scholarSource.includes("setContextMode(result?.mode === 'grounded' ? 'grounded' : 'general')"))
    const sendStart = scholarSource.indexOf('async function send(')
    const sendEnd = scholarSource.indexOf('function handleKey', sendStart)
    const sendSource = scholarSource.slice(sendStart, sendEnd)
    ok('the renderer refreshes context immediately before every send',
      sendSource.includes('await context({ passageContext: analysis ?? null })')
        && sendSource.indexOf('await context(') < sendSource.indexOf('electronAPI.scholarChat('))
    const hostedChatStart = mainSource.indexOf("if (hosted.hostedBaseUrl()) {", chatStart)
    const localChatStart = mainSource.indexOf("const apiKey = requireSecret('ANTHROPIC_KEY'", hostedChatStart)
    const hostedChatSource = mainSource.slice(hostedChatStart, localChatStart)
    ok('the hosted reply carries the authoritative mode used for that answer',
      hostedChatSource.includes('const { studyId, mode } = resolveScholarChatContext(passageContext)')
        && hostedChatSource.includes('return contextReceipt ? { answer, mode } : answer'))
    ok('the context receipt is opt-in so other scholar-chat IPC consumers keep the legacy string',
      sendSource.includes('contextReceipt: true')
        && mainSource.includes('streamId, contextReceipt = false'))
    ok('the renderer applies the authoritative mode receipt without breaking string replies',
      sendSource.includes("const reply = typeof response === 'string'")
        && sendSource.includes("if (response.mode === 'grounded') setContextMode('grounded')")
        && sendSource.includes("else if (response.mode === 'general') setContextMode('general')"))
    ok('the asynchronous context refresh cannot open two metered sends',
      scholarSource.includes('const sendingRef = useRef(false)')
        && sendSource.includes('if (!content || sendingRef.current) return')
        && sendSource.includes('sendingRef.current = true')
        && sendSource.indexOf('sendingRef.current = true') < sendSource.indexOf('await context(')
        && sendSource.includes('sendingRef.current = false'))
    ok('mode receipts update the badge without reinitializing the active conversation',
      scholarSource.includes('const initializedChatRef = useRef<string | null>(null)')
        && scholarSource.includes('initializedChatRef.current === initKey')
        && !scholarSource.includes("`${analysis?.reference ?? 'empty'}:${contextMode}`"))
    const missingBridgeStart = scholarSource.indexOf("if (typeof context !== 'function')")
    const missingBridgeHandler = scholarSource.slice(missingBridgeStart, missingBridgeStart + 220)
    ok('a missing context bridge fails visibly to general rather than trusting local analysis',
      missingBridgeStart >= 0
        && missingBridgeHandler.includes("setContextMode('general')")
        && !missingBridgeHandler.includes("analysis?.reference ? 'grounded'"))
    ok('general mode is visibly and accessibly disclosed',
      scholarSource.includes('role="status"')
        && scholarSource.includes('aria-live="polite"')
        && scholarSource.includes('data-scholar-context={contextMode}')
        && scholarSource.includes('Speaking generally · open a finished study to ground me in its text.'))
    const badgeStart = scholarSource.indexOf("{contextMode === 'checking'")
    const badgeEnd = scholarSource.indexOf('</div>', badgeStart)
    const badgeSource = scholarSource.slice(badgeStart, badgeEnd)
    let renderBadge = null
    try {
      const expression = badgeSource.slice(1, badgeSource.lastIndexOf('}'))
      renderBadge = Function('contextMode', 'analysis', `return (${expression})`)
    } catch {}
    ok('a referenced general chat cannot display the grounded badge',
      typeof renderBadge === 'function'
        && renderBadge('general', { reference: 'John 3:16' }) ===
          'Speaking generally · this chat is not grounded in John 3:16.')
    ok('grounded mode always names the attached study',
      typeof renderBadge === 'function'
        && renderBadge('grounded', { reference: 'John 3:16' }) === 'Study attached · John 3:16')
    let friendlyApiError = null
    try {
      const ts = require('typescript')
      const output = ts.transpileModule(errorSource, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText
      const errorModule = { exports: {} }
      const localRequire = (specifier) => specifier === './hostedError'
        ? { OFFER_TAG: '__OPERATOR_OFFER__' }
        : require(specifier)
      Function('require', 'module', 'exports', output)(localRequire, errorModule, errorModule.exports)
      friendlyApiError = errorModule.exports.friendlyApiError
    } catch {}
    ok('the unfinished-reading code keeps actionable renderer copy', (() => {
      if (typeof friendlyApiError !== 'function') return false
      const result = friendlyApiError(new Error('STUDY_READING_REQUIRED'))
      return result.headline === "This study's reading hasn't finished"
        && result.detail.includes('Open Plain Read for this passage')
    })())
    ok('the unfinished-reading message shape keeps actionable renderer copy', (() => {
      if (typeof friendlyApiError !== 'function') return false
      const result = friendlyApiError(new Error("Open this study's reading and let it finish before asking the specialist."))
      return result.headline === "This study's reading hasn't finished"
        && result.detail.includes('let it stream to the end')
    })())
    ok('the retired finished-study refusal cannot reappear through main or renderer mapping',
      !mainSource.includes('Open a finished study from your library')
        && !scholarSource.includes('Open a finished study from your library')
        && !errorSource.includes('Open a finished study from your library'))
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
