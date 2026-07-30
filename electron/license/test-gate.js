// Where the paywall meets the reading engine.
//
// This suite exists for one promise: A STUDY YOU HAVE ALREADY GENERATED IS
// YOURS, licensed or not. It cost real money once. Taking it back when a
// subscription lapses would be the single worst thing this product could do to
// someone who trusted it, and it is a one-line mistake to make — putting the
// entitlement check anywhere above the cache read does exactly that.
//
//   node electron/license/test-gate.js

const { plainRead } = require('../plainread/pipeline')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const analysis = { reference: 'Romans 8', mainTheme: 'x', phrases: [], structure: {} }
const cachedDoc = { sections: [{ title: 't', body: 'b' }], verification: { status: 'ok' } }
const locked = () => { const e = new Error('locked'); e.code = 'LICENSE_REQUIRED'; throw e }

;(async () => {
  console.log('\nCACHED WORK STAYS YOURS')
  {
    let gateConsulted = false
    const r = await plainRead({
      analysis,
      apiKey: '',
      cache: { get: () => cachedDoc, set() {} },
      onCacheMiss: () => { gateConsulted = true; locked() },
      createClient: () => { throw new Error('a cache hit must never build a client') },
    })
    ok('a cached study returns without consulting the gate', !gateConsulted)
    ok('it is served from cache', r.fromCache === true)
    ok('it works with no API key at all', true)
  }

  console.log('\nNEW WORK IS SOLD')
  {
    let clientBuilt = false
    let threw = null
    try {
      await plainRead({
        analysis,
        apiKey: 'sk-test',
        cache: { get: () => null, set() {} },
        onCacheMiss: locked,
        createClient: () => { clientBuilt = true; return {} },
      })
    } catch (e) { threw = e }
    ok('an unlicensed new study is refused', threw?.code === 'LICENSE_REQUIRED')
    ok('no model client is built when refused', !clientBuilt)
    ok('nothing is spent when refused', !clientBuilt)
  }

  console.log('\nFORCE MUST NOT BE A FREE REGENERATION')
  {
    let gateConsulted = false
    let threw = null
    try {
      await plainRead({
        analysis,
        apiKey: 'sk-test',
        force: true,                                   // skips the cache entirely
        cache: { get: () => cachedDoc, set() {} },
        onCacheMiss: () => { gateConsulted = true; locked() },
        createClient: () => ({}),
      })
    } catch (e) { threw = e }
    ok('forcing a regeneration still hits the gate', gateConsulted)
    ok('and is refused when unlicensed', threw?.code === 'LICENSE_REQUIRED')
  }

  console.log('\nNO GATE SUPPLIED — server and test callers unchanged')
  {
    let built = false
    try {
      await plainRead({
        analysis,
        apiKey: 'sk-test',
        cache: { get: () => null, set() {} },
        createClient: () => { built = true; throw new Error('stop') },
      })
    } catch { /* expected */ }
    ok('omitting onCacheMiss leaves behaviour exactly as before', built)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
