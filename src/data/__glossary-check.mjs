/**
 * __glossary-check.mjs — smoke test for studyGlossary.ts.
 *
 * Run:  node src/data/__glossary-check.mjs
 *
 * Node strips the TypeScript types on import (Node 22.6+ with
 * --experimental-strip-types, on by default from Node 23), so there is no build
 * step and nothing to keep in sync. studyGlossary.ts is written in erasable
 * syntax only — no enums, no parameter properties — which is what that requires.
 *
 * Checks the things that break quietly:
 *   - duplicate ids, duplicate surface forms across entries
 *   - empty short/why, seeAlso pointing at nothing
 *   - the Romans-1 case: "a formal greeting" lights up
 *   - longest-match-first, no double counting on overlapping phrases
 *   - cost over a 5,000-word document
 */

import { GLOSSARY, findGlossTerms, getGloss } from './studyGlossary.ts'

let failures = 0
const fail = (msg) => { failures++; console.error(`  FAIL  ${msg}`) }
const ok = (msg) => console.log(`  ok    ${msg}`)

function check(name, cond, detail = '') {
  if (cond) ok(name)
  else fail(`${name}${detail ? ' — ' + detail : ''}`)
}

console.log(`\nstudyGlossary — ${GLOSSARY.length} entries\n`)

/* ── 1. shape and uniqueness ───────────────────────────────────────────────── */

const ids = new Map()
for (const e of GLOSSARY) {
  if (ids.has(e.id)) fail(`duplicate id: ${e.id}`)
  ids.set(e.id, e)
}
check('no duplicate ids', ids.size === GLOSSARY.length, `${GLOSSARY.length - ids.size} collisions`)

const surfaces = new Map()
let dupSurface = 0
for (const e of GLOSSARY) {
  for (const raw of e.match) {
    const key = raw.toLowerCase().trim()
    if (surfaces.has(key)) {
      dupSurface++
      fail(`duplicate match string "${key}" in ${e.id} and ${surfaces.get(key)}`)
    } else surfaces.set(key, e.id)
  }
}
check('no duplicate match strings across entries', dupSurface === 0)

let emptyField = 0
for (const e of GLOSSARY) {
  if (!e.term || !e.term.trim()) { emptyField++; fail(`empty term on ${e.id}`) }
  if (!e.short || !e.short.trim()) { emptyField++; fail(`empty short on ${e.id}`) }
  if (!e.why || !e.why.trim()) { emptyField++; fail(`empty why on ${e.id}`) }
  if (!e.match.length) { emptyField++; fail(`empty match[] on ${e.id}`) }
}
check('every entry has term, short, why, match[]', emptyField === 0)

let shortIsShort = 0
for (const e of GLOSSARY) {
  // 'short' is one sentence. Allow an internal abbreviation but flag prose.
  const sentences = e.short.split(/[.?!]\s+/).filter(Boolean).length
  if (sentences > 1) { shortIsShort++; fail(`short is ${sentences} sentences on ${e.id}`) }
}
check('short is one sentence', shortIsShort === 0)

let thinWhy = 0
for (const e of GLOSSARY) {
  const words = e.why.trim().split(/\s+/).length
  if (words < 25) { thinWhy++; fail(`why is only ${words} words on ${e.id}`) }
}
check('why carries real content (>= 25 words)', thinWhy === 0)

let badSeeAlso = 0
for (const e of GLOSSARY) {
  for (const ref of e.seeAlso ?? []) {
    if (!ids.has(ref)) { badSeeAlso++; fail(`${e.id} seeAlso -> unknown id "${ref}"`) }
    if (ref === e.id) { badSeeAlso++; fail(`${e.id} seeAlso points at itself`) }
  }
}
check('every seeAlso resolves', badSeeAlso === 0)

check('getGloss returns an entry', getGloss('greeting')?.term.length > 0)
check('getGloss returns null on a bad id', getGloss('no-such-entry') === null)

check('coverage is 70-110 entries', GLOSSARY.length >= 70 && GLOSSARY.length <= 110, `${GLOSSARY.length}`)

/* ── 2. the Romans-1 case ──────────────────────────────────────────────────── */

const romans =
  'Verses 1 through 7 are a formal greeting, but the sender formula runs far ' +
  'longer than convention allowed, and the thanksgiving section does not begin ' +
  'until verse 8.'

const hits = findGlossTerms(romans)
const found = hits.map(h => romans.slice(h.start, h.end))
check(
  'finds "formal greeting" in a Romans-1-style sentence',
  hits.some(h => h.entry.id === 'greeting' && romans.slice(h.start, h.end).toLowerCase() === 'formal greeting'),
  JSON.stringify(found),
)
check('also finds sender formula and thanksgiving section',
  hits.some(h => h.entry.id === 'sender-formula') && hits.some(h => h.entry.id === 'thanksgiving-section'),
  JSON.stringify(found))
console.log(`        matched: ${found.join(' | ')}`)

/* ── 3. longest match first, and no double counting ────────────────────────── */

{
  const t = 'The immediate context settles it; the wider context does not.'
  const h = findGlossTerms(t)
  const slices = h.map(x => t.slice(x.start, x.end))
  check('longest match wins ("immediate context" beats "context")',
    slices[0] === 'immediate context' && h[0].entry.id === 'immediate-context',
    JSON.stringify(slices))
  check('the second, bare "context" still matches on its own',
    h.length === 2 && h[1].entry.id === 'context', JSON.stringify(slices))
}

{
  const t = 'canonical context and immediate context and context'
  const h = findGlossTerms(t)
  let overlap = false
  for (let i = 1; i < h.length; i++) if (h[i].start < h[i - 1].end) overlap = true
  check('overlapping matches never double-count', !overlap,
    JSON.stringify(h.map(x => t.slice(x.start, x.end))))
  check('matches come back in document order',
    h.every((x, i) => i === 0 || x.start > h[i - 1].start))
  check('the word inside a longer match is not re-reported',
    h.length === 3, `${h.length} matches: ${h.map(x => x.entry.id).join(', ')}`)
}

{
  // A phrase must not span punctuation.
  const t = 'He weighed every word. Study the passage first.'
  const h = findGlossTerms(t)
  check('a phrase never spans a sentence boundary',
    !h.some(x => x.entry.id === 'word-study'),
    JSON.stringify(h.map(x => t.slice(x.start, x.end))))
}

{
  // Whole words only.
  const t = 'The uncontextual lawnmower greetings.'
  const h = findGlossTerms(t)
  const slices = h.map(x => t.slice(x.start, x.end))
  check('no match inside a longer word', !slices.includes('law') && !slices.some(s => s === 'context'),
    JSON.stringify(slices))
  check('inflection matches ("greetings")', h.some(x => x.entry.id === 'greeting'), JSON.stringify(slices))
}

{
  check('empty string is safe', findGlossTerms('').length === 0)
  check('no-match prose is safe', findGlossTerms('He walked to the well at noon and sat down.').length === 0)
  check('punctuation-only is safe', findGlossTerms('— , ; ( ) 12:4').length === 0)
}

{
  // Case-insensitive, and possessives still resolve.
  const t = "Chiastic structure. The AORIST here. The covenant's terms."
  const h = findGlossTerms(t)
  const idsFound = h.map(x => x.entry.id)
  check('case-insensitive matching', idsFound.includes('chiasm') && idsFound.includes('aorist'),
    JSON.stringify(h.map(x => t.slice(x.start, x.end))))
  check('possessive form resolves', idsFound.includes('covenant'))
}

/* ── 4. cost ───────────────────────────────────────────────────────────────── */

{
  const sample =
    'The formal greeting runs long because the writer is loading his credentials in early. ' +
    'The immediate context sets the boundary of the unit and the connective marks the joint. ' +
    'A reader who tracks repetition will find the inclusio without any headings at all. ' +
    'Nothing in the aorist proves a once for all action and the participle hangs on the main verb. ' +
    'The covenant frames the command and the indicative comes before the imperative every time. '
  const words = sample.trim().split(/\s+/).length
  const reps = Math.ceil(5000 / words)
  const doc = sample.repeat(reps)
  const docWords = doc.trim().split(/\s+/).length

  findGlossTerms(doc) // warm

  const runs = 20
  const t0 = process.hrtime.bigint()
  let last = 0
  for (let i = 0; i < runs; i++) last = findGlossTerms(doc).length
  const t1 = process.hrtime.bigint()
  const msPerRun = Number(t1 - t0) / 1e6 / runs

  console.log(`\n  timing: ${docWords.toLocaleString()} words, ${last.toLocaleString()} matches, ` +
    `${msPerRun.toFixed(2)} ms per pass (mean of ${runs})`)
  check('5,000-word pass stays under 25 ms', msPerRun < 25, `${msPerRun.toFixed(2)} ms`)
}

/* ── 5. content guards ─────────────────────────────────────────────────────── */

{
  // The strings ship to strangers. These are the two rules that would be
  // embarrassing to break and are cheap to check mechanically.
  const PULPIT = /\b(homilet\w*|pulpit|sub-?points?|big idea|sermon series|delivery note|your (people|flock|congregation))\b/i
  const bad = []
  for (const e of GLOSSARY) {
    const blob = `${e.term} ${e.short} ${e.why}`
    const hit = blob.match(PULPIT)
    if (hit) bad.push(`${e.id}: "${hit[0]}"`)
  }
  check('no pulpit language in user-facing strings', bad.length === 0, bad.join('; '))
}

console.log('')
if (failures) {
  console.error(`FAILED — ${failures} problem(s)\n`)
  process.exit(1)
}
console.log('ALL CHECKS PASSED\n')
