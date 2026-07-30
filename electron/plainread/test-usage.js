// Cost accounting tests. No network, no API cost.
//   node electron/plainread/test-usage.js

const { priceCall, createRecorder, summarize, ratesFor, RATES } = require('./usage')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol

console.log('\nPRICING — arithmetic against published rates')
{
  // Opus 4.8: $5/MTok in, $25/MTok out.
  const p = priceCall({ input_tokens: 1_000_000, output_tokens: 0 }, 'claude-opus-4-8')
  ok('1M input tokens on opus costs $5.00', near(p.costUsd, 5.0), String(p.costUsd))

  const q = priceCall({ input_tokens: 0, output_tokens: 1_000_000 }, 'claude-opus-4-8')
  ok('1M output tokens on opus costs $25.00', near(q.costUsd, 25.0), String(q.costUsd))

  // Cache write is 1.25x input; read is 0.1x.
  const w = priceCall({ cache_creation_input_tokens: 1_000_000 }, 'claude-opus-4-8')
  ok('1M cache-write tokens costs $6.25', near(w.costUsd, 6.25), String(w.costUsd))

  const r = priceCall({ cache_read_input_tokens: 1_000_000 }, 'claude-opus-4-8')
  ok('1M cache-read tokens costs $0.50', near(r.costUsd, 0.5), String(r.costUsd))

  // Sonnet must be priced at the POST-August rate, not the expiring intro rate.
  const s = priceCall({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, 'claude-sonnet-4-6')
  ok('sonnet is budgeted at the post-Aug-31 rate ($3 + $15)', near(s.costUsd, 18.0), String(s.costUsd))

  const h = priceCall({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, 'claude-haiku-4-5-20251001')
  ok('haiku prices correctly ($1 + $5)', near(h.costUsd, 6.0), String(h.costUsd))
}

console.log('\nA REAL MEASURED CALL')
{
  // The actual numbers logged from a live run on 2026-07-29.
  const p = priceCall({
    input_tokens: 5246,
    cache_creation_input_tokens: 13210,
    cache_read_input_tokens: 0,
    output_tokens: 5606,
  }, 'claude-opus-4-8')
  // in 5246*5/1e6 = 0.02623 | cw 13210*6.25/1e6 = 0.0825625 | out 5606*25/1e6 = 0.14015
  ok('the logged 2026-07-29 document call prices to ~$0.249',
    near(p.costUsd, 0.2489425, 1e-5), String(p.costUsd))

  // Same call once the cache is warm: the 13,210 becomes a read, not a write.
  const warm = priceCall({
    input_tokens: 5246,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 13210,
    output_tokens: 5606,
  }, 'claude-opus-4-8')
  ok('a warm cache is materially cheaper than a cold one', warm.costUsd < p.costUsd)
  ok('the cache saves about 30% on that call',
    (p.costUsd - warm.costUsd) / p.costUsd > 0.25, String((p.costUsd - warm.costUsd) / p.costUsd))
}

console.log('\nSAFETY — accounting must never break a study')
{
  ok('a missing usage object returns null, does not throw',
    createRecorder(() => {})('x', null, 'claude-opus-4-8') === null)

  const boom = createRecorder(() => { throw new Error('disk full') })
  let threw = null
  try { boom('x', { input_tokens: 1 }, 'claude-opus-4-8') } catch (e) { threw = e }
  ok('a failing writer is swallowed, not propagated', threw === null)

  ok('an unknown model falls back rather than throwing', ratesFor('some-future-model').in > 0)
  ok('an unknown model over-reports rather than under-reports',
    ratesFor('some-future-model').out >= Math.max(...Object.values(RATES).map((r) => r.out)))

  ok('garbage token counts price to zero, not NaN',
    priceCall({ input_tokens: 'abc', output_tokens: undefined }, 'claude-opus-4-8').costUsd === 0)
}

console.log('\nTHE LEDGER')
{
  const lines = []
  const rec = createRecorder((l) => lines.push(l), () => '2026-07-30T12:00:00Z')

  rec('analyze.theme', { input_tokens: 2000, output_tokens: 1500 }, 'claude-opus-4-8', { studyId: 's1' })
  rec('analyze.culture', { input_tokens: 2000, output_tokens: 2000 }, 'claude-sonnet-4-6', { studyId: 's1' })
  rec('plain-read', { input_tokens: 5246, cache_creation_input_tokens: 13210, output_tokens: 5606 }, 'claude-opus-4-8', { studyId: 's1' })
  rec('verify', { input_tokens: 3000, output_tokens: 1200 }, 'claude-opus-4-8', { studyId: 's1' })

  ok('one line per call', lines.length === 4)
  const rows = lines.map((l) => JSON.parse(l))
  ok('each line is valid JSON', rows.every((r) => typeof r.usd === 'number'))
  ok('the call is labelled', rows[0].label === 'analyze.theme')
  ok('the study id is carried', rows.every((r) => r.studyId === 's1'))

  const s = summarize(rows)
  ok('every call is counted', s.calls === 4)
  ok('costs are grouped by call type', Object.keys(s.byLabel).length === 4)
  ok('one study is identified', s.studies === 1)
  ok('a per-study cost is produced', s.perStudy && s.perStudy.median > 0)
  ok('the total is the sum of the parts',
    near(s.totalUsd, Number(rows.reduce((a, r) => a + r.usd, 0).toFixed(4)), 1e-3))

  // The number the whole business turns on.
  ok('a cap guide is produced', s.capGuide && s.capGuide.atMedian['$29'] > 0)
  console.log(`       measured study cost: $${s.perStudy.median} | $29 breaks even at ${s.capGuide.atMedian['$29']} studies`)
}

console.log('\nEMPTY AND MALFORMED LEDGERS')
{
  ok('an empty ledger summarizes without throwing', summarize([]).calls === 0)
  ok('null rows are ignored', summarize([null, undefined, {}]).calls === 0)
  ok('rows with no studyId still count toward call totals',
    summarize([{ label: 'x', usd: 1 }]).calls === 1)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
