// Tests for the extracted analysis fan-out.
//
// No network and no Electron. The fake client returns canned JSON, so what is
// under test is the thing that actually breaks: which calls get dispatched, what
// survives a failure, and whether the trusted input still beats the model.
//
//   node electron/plainread/test-analyze.js

const {
  analyzePassage, analysisCacheKey, explicitGeoReferences, measurePassage,
  CORE_MODEL, SUPPORT_MODEL,
} = require('./analyze')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const SHORT = 'For God so loved the world, that he gave his only Son.'
const LONG = Array.from({ length: 14 }, (_, i) => `${i + 1} And it came to pass in those days.`).join('\n')

/** A client that records what it was asked and replies with canned JSON. */
function fakeClient({ fail: failing = new Set(), bodies = {} } = {}) {
  const calls = []
  return {
    calls,
    messages: {
      create: async (req) => {
        const sys = req.system[0].text
        const which =
          sys.startsWith('You are a biblical scholar identifying cultural') ? 'enrich'
          : sys.startsWith('You are a biblical scholar performing grammatical') ? 'phrases'
          : sys.startsWith('You are a biblical scholar providing sermon context') ? 'context'
          : 'core'
        calls.push({ which, model: req.model, maxTokens: req.max_tokens })
        if (failing.has(which)) throw new Error(`${which} exploded`)
        return {
          _which: which,
          usage: { input_tokens: 100, output_tokens: 200 },
          content: [{ type: 'text', text: JSON.stringify(bodies[which] ?? DEFAULTS[which]) }],
        }
      },
    },
  }
}

const DEFAULTS = {
  phrases: { phrases: [{ id: 'p1', text: 'clause', level: 0, parentId: null }] },
  context: { mainTheme: 'theme', authorIntent: { doing: 'x', inOrderThat: 'y' }, outline: [{ point: 'I.' }], canonicalContext: { bookTheme: 'b' } },
  enrich: { culturalNotes: [{ id: 'cn1' }], genre: { genre: 'Epistle' }, geoReferences: [{ place: 'Rome' }], questionsToConsider: ['q1'] },
  core: { reference: 'MODEL WROTE THIS', mainTheme: 'theme', phrases: [{ id: 'p1' }], outline: [], canonicalContext: {} },
}

const run = (client, over = {}) => analyzePassage({
  text: SHORT, reference: 'John 3:16',
  apiKey: 'sk-test', createClient: () => client,
  parse: (r) => JSON.parse(r.content[0].text),
  ...over,
})

;(async () => {
  console.log('\nTHE SPLIT IS BY PASSAGE LENGTH, NOT BY GUESS')
  {
    ok('a short passage is short', measurePassage(SHORT).isLong === false)
    ok('fourteen numbered verses is long', measurePassage(LONG).isLong === true)

    const short = fakeClient()
    await run(short)
    ok('a short passage runs 2 calls', short.calls.length === 2, `${short.calls.length}`)
    ok('the core call is Opus', short.calls.find(c => c.which === 'core')?.model === CORE_MODEL)
    ok('enrichment is Sonnet', short.calls.find(c => c.which === 'enrich')?.model === SUPPORT_MODEL)

    const long = fakeClient()
    await run(long, { text: LONG })
    ok('a long passage runs 3 calls', long.calls.length === 3, `${long.calls.length}`)
    ok('and splits phrases out to its own Opus call',
       long.calls.find(c => c.which === 'phrases')?.model === CORE_MODEL)
    ok('with no combined core call', !long.calls.some(c => c.which === 'core'))
  }

  console.log('\nENRICHMENT IS NOT ALLOWED TO KILL A STUDY')
  {
    const c = fakeClient({ fail: new Set(['enrich']) })
    const r = await run(c)
    ok('a failed enrichment still returns an analysis', !!r && r.mainTheme === 'theme')
    ok('cultural notes come back empty rather than undefined', Array.isArray(r.culturalNotes) && r.culturalNotes.length === 0)
    ok('genre is null, not missing', r.genre === null)
    ok('geoReferences is an empty array', Array.isArray(r.geoReferences) && r.geoReferences.length === 0)

    const garbled = fakeClient()
    const r2 = await analyzePassage({
      text: SHORT, reference: 'John 3:16', apiKey: 'k', createClient: () => garbled,
      parse: (res) => { if (res._which === 'enrich') throw new Error('not JSON'); return JSON.parse(res.content[0].text) },
    })
    ok('unparseable enrichment degrades the same way', r2.culturalNotes.length === 0 && r2.genre === null)
  }

  console.log('\nA STRUCTURAL FAILURE MUST NOT RETURN A HALF-ANALYSIS')
  {
    let threw = false
    try { await run(fakeClient({ fail: new Set(['core']) })) } catch { threw = true }
    ok('a failed core call throws', threw)

    let threwLong = false
    try { await run(fakeClient({ fail: new Set(['phrases']) }), { text: LONG }) } catch { threwLong = true }
    ok('a failed phrases call throws', threwLong)

    let threwCtx = false
    try { await run(fakeClient({ fail: new Set(['context']) }), { text: LONG }) } catch { threwCtx = true }
    ok('a failed context call throws', threwCtx)
  }

  console.log('\nTHE TRUSTED INPUT BEATS THE MODEL')
  {
    const r = await run(fakeClient())
    ok('the model cannot rename the passage', r.reference === 'John 3:16', r.reference)
    ok('the raw text is carried for all-verses mode', r.passageText === SHORT)
    ok('and so is the reference the desk renders', r.passageReference === 'John 3:16')
  }

  console.log('\nTHE MAP ONLY SHOWS PLACES THE PASSAGE NAMES')
  {
    const r = await run(fakeClient(), { text: 'Paul, to all who are in Rome.' })
    ok('a place present in the text survives', r.geoReferences.length === 1 && r.geoReferences[0].place === 'Rome')

    const r2 = await run(fakeClient())   // SHORT never says "Rome"
    ok('a place the model invented is dropped', r2.geoReferences.length === 0)

    ok('"Gog and Magog" is never one pin',
       explicitGeoReferences([{ place: 'Gog and Magog' }], 'and Gog and Magog gathered') .length === 0)
    ok('generic terrain is not a location',
       explicitGeoReferences([{ place: 'sea' }, { place: 'earth' }], 'the sea and the earth').length === 0)
    ok('the map is capped at 8',
       explicitGeoReferences(Array.from({ length: 20 }, () => ({ place: 'Rome' })), 'Rome').length === 8)
  }

  console.log('\nEVERY CALL THAT SPENDS MONEY IS BILLED')
  {
    const seen = []
    await run(fakeClient(), { onUsage: (label, usage, model) => seen.push({ label, usage, model }) })
    ok('a short study bills 2 calls', seen.length === 2, `${seen.length}`)
    ok('each carries real token counts', seen.every(s => s.usage.input_tokens === 100))
    ok('each names its model', seen.every(s => s.model === CORE_MODEL || s.model === SUPPORT_MODEL))

    const seenLong = []
    await run(fakeClient(), { text: LONG, onUsage: (l, u, m) => seenLong.push(l) })
    ok('a long study bills all 3', seenLong.length === 3, seenLong.join(','))
    ok('labels are distinct so they roll up per call', new Set(seenLong).size === 3, seenLong.join(','))

    // Accounting must never be able to break a study.
    const r = await run(fakeClient(), { onUsage: () => { throw new Error('ledger is on fire') } })
    ok('a throwing recorder cannot kill the study', r.mainTheme === 'theme')
  }

  console.log('\nSTAGES STILL FIRE, IN ORDER')
  {
    const stages = []
    await run(fakeClient(), { onStage: (s) => stages.push(s) })
    ok('short: dispatched → structure/theme → culture → complete',
       stages[0] === 'calls-dispatched' && stages.includes('structure') &&
       stages.includes('theme') && stages.includes('culture') &&
       stages[stages.length - 1] === 'complete', stages.join(' → '))

    const r = await run(fakeClient(), { onStage: () => { throw new Error('renderer gone') } })
    ok('a throwing progress handler cannot kill the study', r.mainTheme === 'theme')
  }

  console.log('\nREFUSALS HAPPEN BEFORE A TOKEN IS SPENT')
  {
    const c = fakeClient()
    let code = null
    try {
      await analyzePassage({ text: 'x'.repeat(200000), reference: 'John 3:16', apiKey: 'k', createClient: () => c })
    } catch (e) { code = e.code || e.message }
    ok('an oversized passage is refused', code !== null, String(code))
    ok('and no call was ever dispatched', c.calls.length === 0, `${c.calls.length} calls`)

    let noKey = false
    try { await analyzePassage({ text: SHORT, reference: 'John 3:16', createClient: () => c }) } catch { noKey = true }
    ok('a missing key is refused', noKey)
  }

  console.log('\nTHE CACHE KEY IS CONTENT-ADDRESSED')
  {
    const a = analysisCacheKey('Romans 8:1', 'text one')
    ok('same input, same key', a === analysisCacheKey('Romans 8:1', 'text one'))
    ok('different text, different key', a !== analysisCacheKey('Romans 8:1', 'text two'))
    ok('reference case and spacing do not matter',
       analysisCacheKey('  ROMANS 8:1  ', 't') === analysisCacheKey('romans 8:1', 't'))
    ok('a different translation is a different entry',
       analysisCacheKey('John 3:16', 'ESV wording') !== analysisCacheKey('John 3:16', 'KJV wording'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
