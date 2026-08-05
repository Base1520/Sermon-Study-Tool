// The token a client receives must be a STRING it can put in a header.
//
// issueDeviceToken returns { token, deviceId }. Both places that hand a token to
// a client — /v1/redeem and /v1/claim — assigned that whole object once, so the
// response carried token: {token, deviceId}, the desktop stored the object, and
// the Authorization header went out as "Bearer [object Object]". The account was
// real, the subscription was real, and every request still read as anonymous.
//
// No unit test caught it because every layer was individually correct. This one
// asserts the SHAPE at the boundary, which is where it went wrong.
//
//   node server/src/test-token-shape.js

const fs = require('fs')
const path = require('path')
const auth = require('./auth')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

;(async () => {
  console.log('\nissueDeviceToken RETURNS AN OBJECT, NOT A TOKEN')
  {
    const db = { query: async () => ({ rows: [{ id: 'dev-1', created_at: new Date() }] }) }
    const result = await auth.issueDeviceToken(db, { accountId: 'a1', installId: 'i1' })
    ok('it returns an object', typeof result === 'object' && result !== null)
    ok('with the raw token under .token', typeof result.token === 'string')
    ok('prefixed so it is recognisable in a log', result.token.startsWith(auth.PREFIX))
    ok('and a device id beside it', !!result.deviceId)
    ok('so the OBJECT is not itself a usable header value',
       String(result) === '[object Object]')
  }

  console.log('\nEVERY CALLER MUST DESTRUCTURE IT')
  {
    // Static check: no call site may assign the whole object to a `token`.
    const files = ['index.js', 'stripe.js'].map(f => path.join(__dirname, f))
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      const bare = /(?<!\{ )\btoken\s*=\s*await auth\.issueDeviceToken/.test(src)
      ok(`${path.basename(file)} destructures the token`, !bare,
         'assigns the whole { token, deviceId } object')
    }
  }

  console.log('\nWHAT THE CLIENT STORES MUST GO STRAIGHT INTO A HEADER')
  {
    const store = new Map()
    // The shape /v1/redeem now returns.
    const body = { token: 'opr_abc123', plan: 'comp' }
    store.set('operator-device-token', body.token)
    const header = `Bearer ${store.get('operator-device-token')}`
    ok('the header is a real bearer token', header === 'Bearer opr_abc123')
    ok('and contains no object stringification', !/\[object/.test(header))

    // The shape it used to return.
    const broken = { token: { token: 'opr_abc123', deviceId: 'd1' } }
    const brokenHeader = `Bearer ${broken.token}`
    ok('the old shape produced exactly the bug described above',
       brokenHeader === 'Bearer [object Object]')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
