#!/usr/bin/env node
/**
 * test-stream.js — the incremental section extractor.
 *
 * NO API KEY REQUIRED, and no model call of any kind. Every input here is a
 * hand-written chunk sequence, because the failure this file exists to catch is
 * a CHUNK-BOUNDARY failure and a real stream will not reproduce it on demand.
 * The SDK splits wherever the socket splits: mid-key, mid-string, between a
 * backslash and the quote it escapes. Those splits are the bug surface.
 *
 * What is being defended, in order of how much damage the regression does:
 *
 *   1. A BRACE INSIDE A STRING IS NOT A BRACE. Miscount depth once and a
 *      section is declared complete in the middle of its own value — the
 *      reader gets a truncated paragraph rendered as if it were finished.
 *      This is the whole correctness risk of the file.
 *   2. NOTHING THROWS. This runs inside a stream handler in the main process.
 *      A throw here would kill a reading that was otherwise about to succeed,
 *      to save a rendering optimisation. Truncated, fenced, malformed — all of
 *      it must degrade to "emit less".
 *   3. Values come back PARSED and EQUAL to what a whole-document JSON.parse
 *      would have produced. A section that renders differently streamed than
 *      it does from cache is worse than no streaming.
 *
 * Run:  node electron/plainread/test-stream.js
 * Exits non-zero on any failure.
 */

const assert = require('assert')
const { createSectionExtractor } = require('./stream')

/* ------------------------------------------------------------------ *
 * harness
 * ------------------------------------------------------------------ */

const results = []

function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
    console.log(`PASS  ${name}`)
  } catch (err) {
    results.push({ name, ok: false, err })
    console.log(`FAIL  ${name}`)
    console.log(`      ${err && err.message}`)
  }
}

/** Feed a whole document one chunk at a time, collecting every emission. */
function feed(chunks, options) {
  const ex = createSectionExtractor(options)
  const got = []
  for (const c of chunks) got.push(...ex.push(c))
  return { got, state: ex.done(), ex }
}

/** Split a string into fixed-size pieces — the crudest possible chunker, and
 *  the one most likely to land on an awkward boundary. */
function slice(text, size) {
  const out = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

function keysOf(got) {
  return got.map((g) => g.key)
}

function valueOf(got, key) {
  const hit = got.find((g) => g.key === key)
  return hit ? hit.value : undefined
}

/* ------------------------------------------------------------------ *
 * a stand-in for the real document shape
 * ------------------------------------------------------------------ */

const DOC = {
  situation: {
    headline: 'A church under pressure',
    body: 'Paul is writing to people who are tired.',
    vaultSourced: false,
  },
  outline: [
    { label: 'v1-3', text: 'The greeting' },
    { label: 'v4-7', text: 'The thanksgiving' },
  ],
  meaning: 'The passage says one thing and it says it plainly.',
  work: 'What the text is doing to the reader.',
  distance: 'What has changed in two thousand years.',
  application: { step: { kind: 'confession', text: 'Say it out loud.' } },
  restraint: 'What this passage does not say.',
  differ: ['Some read this as future.', 'Others read it as past.'],
  unknowns: [],
  handoff: 'Take it to someone.',
  confidence: 0.82,
  verified: true,
  supersedes: null,
}

const DOC_TEXT = JSON.stringify(DOC)
const ALL_KEYS = Object.keys(DOC)

/* ------------------------------------------------------------------ *
 * 1. the ordinary case, split every way that hurts
 * ------------------------------------------------------------------ */

test('a whole document emits every top-level key with the right value', () => {
  const { got, state } = feed([DOC_TEXT])
  assert.deepStrictEqual(keysOf(got), ALL_KEYS, 'every key, in written order')
  assert.strictEqual(state.rootClosed, true, 'root object closed')
  for (const k of ALL_KEYS) {
    assert.deepStrictEqual(valueOf(got, k), DOC[k], `value of ${k} round-trips`)
  }
})

test('the same document split one character at a time emits identically', () => {
  const { got, state } = feed(DOC_TEXT.split(''))
  assert.deepStrictEqual(keysOf(got), ALL_KEYS)
  assert.strictEqual(state.rootClosed, true)
  for (const k of ALL_KEYS) {
    assert.deepStrictEqual(valueOf(got, k), DOC[k])
  }
})

test('every fixed-size split from 1 to 40 emits identically', () => {
  // Brute force, because "mid-key" and "mid-string" are not two cases, they are
  // every offset in the document. If any boundary breaks the state machine,
  // one of these sizes lands on it.
  for (let size = 1; size <= 40; size += 1) {
    const { got, state } = feed(slice(DOC_TEXT, size))
    assert.deepStrictEqual(keysOf(got), ALL_KEYS, `keys at chunk size ${size}`)
    assert.strictEqual(state.rootClosed, true, `closed at chunk size ${size}`)
    assert.deepStrictEqual(
      Object.fromEntries(got.map((g) => [g.key, g.value])),
      DOC,
      `values at chunk size ${size}`
    )
  }
})

test('pretty-printed JSON with newlines and indentation behaves the same', () => {
  const pretty = JSON.stringify(DOC, null, 2)
  const { got, state } = feed(slice(pretty, 7))
  assert.deepStrictEqual(keysOf(got), ALL_KEYS)
  assert.strictEqual(state.rootClosed, true)
  assert.deepStrictEqual(valueOf(got, 'outline'), DOC.outline)
})

test('a section is emitted BEFORE the rest of the document arrives', () => {
  // The entire point of the feature. If this passes only at the end, the
  // reader is still staring at a spinner.
  const ex = createSectionExtractor()
  const head = DOC_TEXT.slice(0, DOC_TEXT.indexOf('"outline"'))
  const first = ex.push(head)
  assert.deepStrictEqual(keysOf(first), ['situation'], 'situation lands early')
  assert.deepStrictEqual(first[0].value, DOC.situation)
  assert.strictEqual(ex.done().rootClosed, false, 'and the document is not done')
})

/* ------------------------------------------------------------------ *
 * 2. THE correctness risk — braces and quotes inside string values
 * ------------------------------------------------------------------ */

test('a brace inside a string value does not close the value', () => {
  const doc = {
    meaning: 'he was in a bind {like this} and stayed there',
    work: 'closing } brace, opening { brace, and a ] bracket',
    handoff: 'done',
  }
  const { got } = feed(slice(JSON.stringify(doc), 3))
  assert.deepStrictEqual(keysOf(got), ['meaning', 'work', 'handoff'])
  assert.strictEqual(valueOf(got, 'meaning'), doc.meaning)
  assert.strictEqual(valueOf(got, 'work'), doc.work)
})

test('braces inside strings nested two levels deep still balance', () => {
  const doc = {
    situation: { body: 'a {  b [ c } d ] e', note: '}}}}}}' },
    outline: [{ text: '{{{' }, { text: '}}}' }],
    handoff: 'ok',
  }
  const { got, state } = feed(slice(JSON.stringify(doc), 2))
  assert.deepStrictEqual(keysOf(got), ['situation', 'outline', 'handoff'])
  assert.deepStrictEqual(valueOf(got, 'situation'), doc.situation)
  assert.deepStrictEqual(valueOf(got, 'outline'), doc.outline)
  assert.strictEqual(state.rootClosed, true)
})

test('an escaped quote does not end the string', () => {
  const doc = {
    meaning: 'Paul says "grace" and means it',
    work: 'a trailing backslash pair \\\\ then more text',
    handoff: 'and "then" a quote',
  }
  const text = JSON.stringify(doc)
  // Split at EVERY offset, so one of the splits necessarily lands between a
  // backslash and the character it escapes.
  for (let at = 1; at < text.length; at += 1) {
    const { got } = feed([text.slice(0, at), text.slice(at)])
    assert.deepStrictEqual(keysOf(got), ['meaning', 'work', 'handoff'], `split at ${at}`)
    assert.strictEqual(valueOf(got, 'meaning'), doc.meaning, `meaning at split ${at}`)
    assert.strictEqual(valueOf(got, 'work'), doc.work, `work at split ${at}`)
  }
})

test('a colon and a comma inside a string do not move the state machine', () => {
  const doc = {
    meaning: 'the list: one, two, three — and "quoted: thing", too',
    handoff: 'x',
  }
  const { got } = feed(slice(JSON.stringify(doc), 5))
  assert.deepStrictEqual(keysOf(got), ['meaning', 'handoff'])
  assert.strictEqual(valueOf(got, 'meaning'), doc.meaning)
})

test('a key containing a brace or a colon is read as a key, not a value', () => {
  const doc = { 'odd{key}': 1, 'a:b': 'two', handoff: 'three' }
  const { got } = feed(slice(JSON.stringify(doc), 3))
  assert.deepStrictEqual(keysOf(got), ['odd{key}', 'a:b', 'handoff'])
  assert.strictEqual(valueOf(got, 'odd{key}'), 1)
  assert.strictEqual(valueOf(got, 'a:b'), 'two')
})

/* ------------------------------------------------------------------ *
 * 3. truncation — return what completed, invent nothing
 * ------------------------------------------------------------------ */

test('a stream cut mid-value emits only the sections that closed', () => {
  const cut = DOC_TEXT.slice(0, DOC_TEXT.indexOf('"distance"') + 30)
  const { got, state } = feed(slice(cut, 9))
  assert.ok(got.length > 0, 'the finished sections still arrive')
  assert.ok(keysOf(got).includes('situation'), 'situation completed')
  assert.ok(keysOf(got).includes('work'), 'work completed')
  assert.ok(!keysOf(got).includes('distance'), 'the half-written one does not')
  assert.ok(!keysOf(got).includes('handoff'), 'and nothing after it does')
  assert.strictEqual(state.rootClosed, false, 'and the document is reported unfinished')
})

test('a stream cut mid-key emits nothing extra and does not throw', () => {
  const cut = DOC_TEXT.slice(0, DOC_TEXT.indexOf('"meaning"') + 4)
  const { got, state } = feed(slice(cut, 4))
  assert.deepStrictEqual(keysOf(got), ['situation', 'outline'])
  assert.strictEqual(state.rootClosed, false)
})

test('a trailing scalar with no comma or closing brace is NOT completed', () => {
  // {"confidence": 0.8   <- 0.8 might still become 0.85. Never guess.
  const { got, state } = feed(['{"handoff":"x","confidence":0.8'])
  assert.deepStrictEqual(keysOf(got), ['handoff'], 'only the closed one')
  assert.strictEqual(state.rootClosed, false)
})

test('an empty stream, whitespace only, and a lone brace all emit nothing', () => {
  assert.deepStrictEqual(feed([]).got, [])
  assert.deepStrictEqual(feed(['']).got, [])
  assert.deepStrictEqual(feed(['   \n\t  ']).got, [])
  assert.deepStrictEqual(feed(['{']).got, [])
  assert.deepStrictEqual(feed(['{}']).got, [])
  assert.strictEqual(feed(['{}']).state.rootClosed, true)
})

/* ------------------------------------------------------------------ *
 * 4. it never throws
 * ------------------------------------------------------------------ */

test('malformed and hostile input never throws', () => {
  const nasty = [
    ['not json at all'],
    ['```json\n'],
    ['{"a":}'],
    ['{"a":,,,}'],
    ['{{{{{{'],
    ['}}}}}}'],
    ['{"a":"unterminated'],
    ['{"a":"\\'],
    ['[1,2,3]'],
    ['null'],
    ['{"a":1}{"b":2}'],
    [null, undefined, 42, {}, ['x'], '{"handoff":"ok"}'],
  ]
  for (const chunks of nasty) {
    assert.doesNotThrow(() => {
      const ex = createSectionExtractor()
      // @ts-ignore — deliberately feeding non-strings; push must shrug them off.
      for (const c of chunks) ex.push(c)
      ex.done()
    }, `chunks: ${JSON.stringify(chunks)}`)
  }
})

test('non-string chunks are ignored without disturbing the parse', () => {
  const ex = createSectionExtractor()
  const got = []
  // @ts-ignore — the SDK will only ever send strings; this proves a bad caller
  // cannot corrupt the state machine.
  got.push(...ex.push('{"meaning":"one"'))
  got.push(...ex.push(null))
  got.push(...ex.push(undefined))
  got.push(...ex.push(42))
  got.push(...ex.push(',"handoff":"two"}'))
  assert.deepStrictEqual(keysOf(got), ['meaning', 'handoff'])
  assert.strictEqual(valueOf(got, 'handoff'), 'two')
})

test('a fence and prose before the object are skipped', () => {
  const chunks = ['```', 'json\n', 'Here is the reading:\n', ...slice(DOC_TEXT, 11), '\n```']
  const { got, state } = feed(chunks)
  assert.deepStrictEqual(keysOf(got), ALL_KEYS)
  assert.strictEqual(state.rootClosed, true)
})

test('text after the root object closes is ignored', () => {
  const { got } = feed([`${DOC_TEXT}\n\`\`\`\nand some trailing prose {"x":1}`])
  assert.deepStrictEqual(keysOf(got), ALL_KEYS, 'no phantom keys from the trailer')
})

/* ------------------------------------------------------------------ *
 * 5. shape of the emissions
 * ------------------------------------------------------------------ */

test('a duplicated top-level key is emitted once', () => {
  const { got } = feed(['{"meaning":"first","meaning":"second","handoff":"x"}'])
  assert.deepStrictEqual(keysOf(got), ['meaning', 'handoff'])
  assert.strictEqual(valueOf(got, 'meaning'), 'first')
})

test('nested keys are never mistaken for top-level keys', () => {
  const doc = {
    situation: { meaning: 'nested', handoff: 'nested', deeper: { work: 'nested' } },
    handoff: 'real',
  }
  const { got } = feed(slice(JSON.stringify(doc), 6))
  assert.deepStrictEqual(keysOf(got), ['situation', 'handoff'])
  assert.strictEqual(valueOf(got, 'handoff'), 'real', 'the TOP-LEVEL handoff wins')
})

test('null, false, 0 and empty containers are emitted, not skipped as falsy', () => {
  const doc = { a: null, b: false, c: 0, d: '', e: [], f: {}, handoff: 'x' }
  const { got } = feed(slice(JSON.stringify(doc), 3))
  assert.deepStrictEqual(keysOf(got), ['a', 'b', 'c', 'd', 'e', 'f', 'handoff'])
  assert.strictEqual(valueOf(got, 'a'), null)
  assert.strictEqual(valueOf(got, 'b'), false)
  assert.strictEqual(valueOf(got, 'c'), 0)
  assert.strictEqual(valueOf(got, 'd'), '')
  assert.deepStrictEqual(valueOf(got, 'e'), [])
  assert.deepStrictEqual(valueOf(got, 'f'), {})
})

test('done() reports the emitted keys and is idempotent', () => {
  const { ex, state } = feed(slice(DOC_TEXT, 13))
  assert.deepStrictEqual(state.keys, ALL_KEYS)
  const again = ex.done()
  assert.deepStrictEqual(again.keys, ALL_KEYS)
  assert.strictEqual(again.rootClosed, true)
  assert.deepStrictEqual(ex.push('{"more":1}'), [], 'nothing new after the root closed')
})

test('deep nesting inside one section still resolves at depth 1', () => {
  const doc = {
    application: { step: { kind: 'x', inner: { deeper: [{ deepest: { z: '}' } }] } } },
    handoff: 'ok',
  }
  const { got, state } = feed(slice(JSON.stringify(doc), 2))
  assert.deepStrictEqual(keysOf(got), ['application', 'handoff'])
  assert.deepStrictEqual(valueOf(got, 'application'), doc.application)
  assert.strictEqual(state.rootClosed, true)
})

test('emission order follows the model, not a fixed schedule', () => {
  // prompt.js is another agent's file and the key order there can change.
  // Nothing downstream may assume a fixed order.
  const reversed = {}
  for (const k of [...ALL_KEYS].reverse()) reversed[k] = DOC[k]
  const { got } = feed(slice(JSON.stringify(reversed), 8))
  assert.deepStrictEqual(keysOf(got), [...ALL_KEYS].reverse())
})

/* ------------------------------------------------------------------ *
 * 6. DEEPENING — the six reasoning steps inside `work`
 *
 * The measured problem: `reference` landed in 2.4s and the renderer then sat
 * still for ~90 seconds, because `work` is ONE key holding genre, setting,
 * surroundings, words, story and doing, each with body / youCanCheck / theMove.
 * Eighteen fields — the bulk of the document — and at depth 1 not one of them
 * can be drawn until the last one is written.
 *
 * The document does not get shorter and the key order does not change. So the
 * extractor learned to report a step AS IT CLOSES, and what is defended here is:
 *
 *   1. OPT-IN, ABSOLUTELY. With no `deepen` the emissions are identical, key
 *      for key and value for value. scripts/plainread-live.js and the
 *      pre-generated program path take that branch.
 *   2. The string state still holds ONE LEVEL IN. A brace in a step's body,
 *      a split between a backslash and its quote, a comma inside prose — the
 *      depth-2 state machine has the same failure surface as the depth-1 one
 *      and gets the same brute-force treatment.
 *   3. PARTIALS ARE PREFIXES. Every `work` payload is a strict superset of the
 *      one before it, and the last one equals what JSON.parse would produce.
 *      A renderer that merges by key needs no other rule.
 *   4. TRUNCATION INVENTS NOTHING. Cut in the middle of the fourth step and
 *      three steps are reported. Never a fourth, never a stub.
 * ------------------------------------------------------------------ */

/** A step of the real shape: body + youCanCheck + theMove. */
function step(n) {
  return {
    body: `Step ${n} body. It runs several sentences, the way the real one does, ` +
      `and it is long enough that a chunk boundary lands inside it.`,
    youCanCheck: `Check ${n}: read the lines on either side.`,
    theMove: `Move ${n}: ask the question before you answer it.`,
  }
}

const WORK_STEPS = ['genre', 'setting', 'surroundings', 'words', 'story', 'doing']

const WORK_DOC = {
  reference: 'Philippians 4:10-13',
  situation: { when: 'around AD 62', vaultSourced: false },
  meaning: { plain: 'He thanks them and says he has learned to be steady.' },
  work: {
    genre: step(1),
    setting: step(2),
    surroundings: step(3),
    words: step(4),
    story: step(5),
    doing: step(6),
    christPathway: null,
  },
  distance: 'Two thousand years of it.',
  handoff: 'Say it out loud to someone.',
}

const WORK_TEXT = JSON.stringify(WORK_DOC)
const WORK_TOP_KEYS = Object.keys(WORK_DOC)
const DEEP = { deepen: ['work'] }

/** Every payload emitted under one key, in order. */
function allValues(got, key) {
  return got.filter((g) => g.key === key).map((g) => g.value)
}

test('deepening OFF is byte-identical to the old behaviour', () => {
  // The non-negotiable. Three ways of saying "no deepening" must all produce
  // exactly what the extractor produced before this feature existed: one
  // emission per top-level key, `work` among them, whole.
  const chunks = slice(WORK_TEXT, 17)
  const baseline = feed(chunks).got
  assert.deepStrictEqual(keysOf(baseline), WORK_TOP_KEYS, 'one emission per top-level key')
  assert.deepStrictEqual(valueOf(baseline, 'work'), WORK_DOC.work, 'work arrives whole, once')

  for (const opt of [undefined, {}, { deepen: [] }, { deepen: ['nothing-called-this'] }]) {
    const { got } = feed(chunks, opt)
    assert.deepStrictEqual(got, baseline, `identical with options ${JSON.stringify(opt)}`)
  }
})

test('a bad deepen option degrades to no deepening instead of throwing', () => {
  const chunks = slice(WORK_TEXT, 17)
  const baseline = feed(chunks).got
  const junk = [
    { deepen: 'work' },        // a string, not an array
    { deepen: null },
    { deepen: 42 },
    { deepen: [null, 7, {}] }, // an array of non-strings
    { deepen: [''] },
  ]
  for (const opt of junk) {
    let got
    assert.doesNotThrow(() => { got = feed(chunks, opt).got }, JSON.stringify(opt))
    assert.deepStrictEqual(got, baseline, `no deepening from ${JSON.stringify(opt)}`)
  }
})

test('each of the six steps is reported as it closes, not all at the end', () => {
  const { got, state } = feed([WORK_TEXT], DEEP)
  const works = allValues(got, 'work')
  assert.ok(works.length >= 6, `work reported once per step (got ${works.length})`)
  // One emission per step, in written order, each carrying everything so far.
  for (let n = 0; n < WORK_STEPS.length; n += 1) {
    assert.deepStrictEqual(
      Object.keys(works[n]),
      WORK_STEPS.slice(0, n + 1),
      `emission ${n} holds steps 0..${n}`
    )
  }
  assert.deepStrictEqual(works[works.length - 1], WORK_DOC.work, 'the last one is the whole thing')
  assert.strictEqual(state.rootClosed, true)
})

test('every partial is a strict superset of the one before it', () => {
  // This is the entire contract the renderer leans on: merge by key, never
  // append, and a later `work` can only ever add.
  const { got } = feed(slice(WORK_TEXT, 3), DEEP)
  const works = allValues(got, 'work')
  for (let n = 1; n < works.length; n += 1) {
    const prev = works[n - 1]
    const cur = works[n]
    assert.ok(
      Object.keys(cur).length > Object.keys(prev).length,
      `emission ${n} grew`
    )
    for (const k of Object.keys(prev)) {
      assert.deepStrictEqual(cur[k], prev[k], `emission ${n} did not rewrite ${k}`)
    }
  }
})

test('a partial handed to the caller never mutates underneath it', () => {
  // The renderer stores what it is given. If the extractor kept handing back the
  // same accumulator, a section rendered at step two would silently become step
  // six's object and React would have no reason to redraw.
  const { got } = feed(slice(WORK_TEXT, 11), DEEP)
  const works = allValues(got, 'work')
  const firstSnapshot = { ...works[0] }
  assert.deepStrictEqual(works[0], firstSnapshot, 'the first payload still holds one step')
  assert.strictEqual(Object.keys(works[0]).length, 1)
  assert.notStrictEqual(works[0], works[1], 'and it is not the same object as the next')
})

test('the other top-level keys still emit exactly once each', () => {
  const { got } = feed(slice(WORK_TEXT, 6), DEEP)
  for (const k of WORK_TOP_KEYS) {
    const n = allValues(got, k).length
    if (k === 'work') assert.ok(n > 1, 'work is the deepened one')
    else assert.strictEqual(n, 1, `${k} emitted once`)
    assert.deepStrictEqual(allValues(got, k).pop(), WORK_DOC[k], `${k} round-trips`)
  }
  assert.deepStrictEqual(
    [...new Set(keysOf(got))],
    WORK_TOP_KEYS,
    'and no key the model never wrote'
  )
})

test('every fixed-size split from 1 to 40 deepens identically', () => {
  // Mid-child, mid-key, mid-string: not three cases, every offset. One of these
  // sizes lands on each of them.
  const oneChar = feed(WORK_TEXT.split(''), DEEP).got
  for (let size = 1; size <= 40; size += 1) {
    const { got, state } = feed(slice(WORK_TEXT, size), DEEP)
    assert.deepStrictEqual(got, oneChar, `emissions at chunk size ${size}`)
    assert.strictEqual(state.rootClosed, true, `closed at chunk size ${size}`)
  }
})

test('a step is on screen before the later steps have been written', () => {
  // The entire point. If the first step only lands when `doing` lands, the
  // reader is still watching a spinner for ninety seconds.
  const ex = createSectionExtractor(DEEP)
  const head = WORK_TEXT.slice(0, WORK_TEXT.indexOf('"words"'))
  const early = ex.push(head)
  const works = allValues(early, 'work')
  assert.ok(works.length >= 3, `three steps arrived early (got ${works.length})`)
  assert.deepStrictEqual(
    Object.keys(works[works.length - 1]),
    ['genre', 'setting', 'surroundings'],
    'and only the ones actually written'
  )
  assert.deepStrictEqual(works[0], { genre: WORK_DOC.work.genre }, 'genre first, parsed')
  assert.strictEqual(ex.done().rootClosed, false, 'while the document is still being written')
})

test('a brace inside a step body does not close the step', () => {
  // The whole correctness risk, moved one level in.
  const doc = {
    work: {
      genre: { body: 'he was in a bind {like this} and stayed', theMove: 'ask } first' },
      setting: { body: 'closing } brace, opening { brace, a ] and a [', theMove: '{{{' },
      words: { body: 'a colon: a comma, and "a quoted: thing", too', theMove: '}}}}' },
    },
    handoff: 'ok',
  }
  const { got, state } = feed(slice(JSON.stringify(doc), 2), DEEP)
  const works = allValues(got, 'work')
  // Three steps, so three partials — plus the depth-1 completion, which is the
  // WHOLE SLICE parsed in one go rather than an accumulation of children. That
  // last emission is the safety net: if any single child had failed to parse on
  // its own, this is where the section still arrives correct and whole. It costs
  // one redundant redraw at the moment the section finishes.
  assert.strictEqual(works.length, 4, 'three steps plus the authoritative whole')
  assert.deepStrictEqual(works[0], { genre: doc.work.genre })
  assert.deepStrictEqual(works[1], { genre: doc.work.genre, setting: doc.work.setting })
  assert.deepStrictEqual(works[2], doc.work)
  assert.deepStrictEqual(works[3], doc.work, 'and the whole-slice parse agrees with it')
  assert.deepStrictEqual(valueOf(got, 'handoff'), 'ok')
  assert.strictEqual(state.rootClosed, true)
})

test('an escaped quote inside a step survives a split at EVERY offset', () => {
  // One of these splits necessarily lands between a backslash and the character
  // it escapes, which is the boundary that breaks a naive counter.
  const doc = {
    work: {
      genre: { body: 'Paul says "grace" and means it', theMove: 'a pair \\\\ then text' },
      setting: { body: 'and "then" a quote, with a {brace}', theMove: 'x' },
    },
    handoff: 'ok',
  }
  const text = JSON.stringify(doc)
  const whole = feed([text], DEEP).got
  assert.deepStrictEqual(allValues(whole, 'work').pop(), doc.work, 'the baseline is right')
  for (let at = 1; at < text.length; at += 1) {
    const { got } = feed([text.slice(0, at), text.slice(at)], DEEP)
    assert.deepStrictEqual(got, whole, `split at ${at}`)
  }
})

test('a step key containing a brace or a colon is read as a key', () => {
  const doc = { work: { 'odd{key}': 1, 'a:b': { body: 'two' } }, handoff: 'x' }
  const { got } = feed(slice(JSON.stringify(doc), 3), DEEP)
  const works = allValues(got, 'work')
  assert.deepStrictEqual(works[0], { 'odd{key}': 1 })
  assert.deepStrictEqual(works.pop(), doc.work)
})

test('a stream cut partway through the FOURTH step reports exactly three', () => {
  const cut = WORK_TEXT.slice(0, WORK_TEXT.indexOf('Step 4 body') + 20)
  const { got, state } = feed(slice(cut, 9), DEEP)
  const works = allValues(got, 'work')
  assert.strictEqual(works.length, 3, 'three closed steps, no more')
  assert.deepStrictEqual(Object.keys(works[2]), ['genre', 'setting', 'surroundings'])
  assert.ok(!('words' in works[2]), 'the half-written step is not invented')
  assert.ok(keysOf(got).includes('situation'), 'the earlier sections still landed')
  assert.ok(!keysOf(got).includes('distance'), 'and nothing after work did')
  assert.strictEqual(state.rootClosed, false, 'the document is reported unfinished')
})

test('a stream cut mid-step-key or mid-escape reports only closed steps', () => {
  const cuts = [
    WORK_TEXT.indexOf('"story"') + 4,       // mid-key
    WORK_TEXT.indexOf('"words"') + 1,       // just inside a key
    WORK_TEXT.indexOf('Step 2 body') + 5,   // mid-string
    WORK_TEXT.indexOf('"work"') + 8,        // just inside the container
  ]
  for (const at of cuts) {
    const { got, state } = feed(slice(WORK_TEXT.slice(0, at), 4), DEEP)
    const works = allValues(got, 'work')
    for (const w of works) {
      // Whatever came out, every step in it is COMPLETE and equal to the source.
      for (const [k, v] of Object.entries(w)) {
        assert.deepStrictEqual(v, WORK_DOC.work[k], `${k} is whole at cut ${at}`)
      }
    }
    assert.strictEqual(state.rootClosed, false, `unfinished at cut ${at}`)
  }
})

test('a trailing scalar child is folded in by the final whole emission', () => {
  // `christPathway: null` closes on the same character as the container. It must
  // arrive — once, in the complete value — and must not produce a duplicate
  // partial on that same character.
  const { got } = feed(slice(WORK_TEXT, 5), DEEP)
  const works = allValues(got, 'work')
  const last = works[works.length - 1]
  assert.deepStrictEqual(last, WORK_DOC.work)
  assert.ok('christPathway' in last, 'the trailing null is present')
  assert.strictEqual(last.christPathway, null)
  const secondToLast = works[works.length - 2]
  assert.ok(!('christPathway' in secondToLast), 'and it appeared exactly once, at the end')
})

test('a deepened key whose value is not an object emits once, whole', () => {
  // A string, an array, a scalar or null under a deepened name. A half-filled
  // array has no unambiguous partial form, so none is invented.
  const cases = [
    { work: 'What the text is doing to the reader.', handoff: 'x' },
    { work: [{ a: 1 }, { b: 2 }, { c: 3 }], handoff: 'x' },
    { work: 42, handoff: 'x' },
    { work: null, handoff: 'x' },
    { work: {}, handoff: 'x' },
  ]
  for (const doc of cases) {
    const { got, state } = feed(slice(JSON.stringify(doc), 3), DEEP)
    assert.deepStrictEqual(keysOf(got), ['work', 'handoff'], `one emission for ${JSON.stringify(doc.work)}`)
    assert.deepStrictEqual(valueOf(got, 'work'), doc.work)
    assert.strictEqual(state.rootClosed, true)
  }
})

test('deep nesting inside a step still resolves at the step, not below it', () => {
  const doc = {
    work: {
      genre: { body: 'x', inner: { deeper: [{ deepest: { z: '}' } }] } },
      setting: { body: 'y' },
    },
    handoff: 'ok',
  }
  const { got, state } = feed(slice(JSON.stringify(doc), 2), DEEP)
  const works = allValues(got, 'work')
  assert.deepStrictEqual(works[0], { genre: doc.work.genre }, 'the whole nested step, at once')
  assert.deepStrictEqual(works.pop(), doc.work)
  assert.strictEqual(state.rootClosed, true)
})

test('a repeated top-level deepened key does not reopen the section', () => {
  const doc = '{"work":{"genre":{"body":"first"}},"work":{"genre":{"body":"second"}},"handoff":"x"}'
  const { got } = feed(slice(doc, 4), DEEP)
  const works = allValues(got, 'work')
  assert.deepStrictEqual(works.pop(), { genre: { body: 'first' } }, 'the first occurrence wins')
  for (const w of works) assert.deepStrictEqual(w.genre, { body: 'first' }, 'no second reading spliced in')
  assert.deepStrictEqual(keysOf(got).filter((k) => k === 'handoff'), ['handoff'])
})

test('nested keys named like steps are not mistaken for steps', () => {
  const doc = {
    situation: { genre: 'nested', setting: 'nested' },
    work: { genre: { body: 'real', setting: 'not a step' } },
    handoff: 'ok',
  }
  const { got } = feed(slice(JSON.stringify(doc), 6), DEEP)
  assert.deepStrictEqual(valueOf(got, 'situation'), doc.situation)
  // `situation` is not deepened, so its `genre`/`setting` never become steps.
  // Inside `work`, `setting` sits at depth 3 — a field of the genre step, not a
  // sibling of it — so it never emits on its own either.
  assert.strictEqual(allValues(got, 'situation').length, 1, 'situation is not deepened')
  const works = allValues(got, 'work')
  assert.strictEqual(works.length, 2, 'one step: its partial, then the whole')
  assert.deepStrictEqual(works[0], doc.work, 'the one step is the whole of work')
  assert.deepStrictEqual(works[1], doc.work)
})

test('deepening several keys at once keeps them independent', () => {
  const doc = {
    work: { genre: { body: 'a' }, setting: { body: 'b' } },
    application: { faces: ['duty'], step: { kind: 'plan' } },
    handoff: 'x',
  }
  const { got } = feed(slice(JSON.stringify(doc), 3), { deepen: ['work', 'application'] })
  assert.deepStrictEqual(allValues(got, 'work'), [
    { genre: { body: 'a' } },
    doc.work,
    doc.work,
  ], 'two steps, then the whole-slice parse')
  const apps = allValues(got, 'application')
  assert.deepStrictEqual(apps[0], { faces: ['duty'] }, 'an array child closes like any other')
  assert.deepStrictEqual(apps.pop(), doc.application)
  // Two containers deepened at once and neither leaked into the other.
  assert.ok(apps.every((a) => !('genre' in a)), 'no work step landed in application')
  assert.ok(allValues(got, 'work').every((w) => !('faces' in w)), 'and nothing the other way')
})

test('done() lists a deepened key once, in written order', () => {
  const { state } = feed(slice(WORK_TEXT, 13), DEEP)
  assert.deepStrictEqual(state.keys, WORK_TOP_KEYS, 'reported once, where the model wrote it')
  assert.strictEqual(state.rootClosed, true)
})

test('malformed and hostile input never throws with deepening on', () => {
  const nasty = [
    ['not json at all'],
    ['```json\n{"work":'],
    ['{"work":{'],
    ['{"work":{"genre":}'],
    ['{"work":{,,,}}'],
    ['{"work":{"genre":{"body":"unterminated'],
    ['{"work":{"genre":"\\'],
    ['{"work":{"genre":{}}}}}}}}'],
    ['{"work":[{"genre":1}'],
    ['{{{{{{'],
    ['}}}}}}'],
    [null, undefined, 42, {}, ['x'], '{"work":{"genre":{"body":"ok"}},"handoff":"ok"}'],
  ]
  for (const chunks of nasty) {
    assert.doesNotThrow(() => {
      const ex = createSectionExtractor(DEEP)
      // @ts-ignore — deliberately feeding non-strings; push must shrug them off.
      for (const c of chunks) ex.push(c)
      ex.done()
    }, `chunks: ${JSON.stringify(chunks)}`)
  }
})

test('a fence, prose, and trailing text around a deepened document are handled', () => {
  const chunks = ['```', 'json\n', 'Here is the reading:\n', ...slice(WORK_TEXT, 11), '\n```\ntrailing {"x":1}']
  const { got, state } = feed(chunks, DEEP)
  assert.deepStrictEqual(allValues(got, 'work').pop(), WORK_DOC.work)
  assert.deepStrictEqual([...new Set(keysOf(got))], WORK_TOP_KEYS, 'no phantom keys')
  assert.strictEqual(state.rootClosed, true)
})

test('pretty-printed JSON deepens the same as compact', () => {
  const pretty = JSON.stringify(WORK_DOC, null, 2)
  const { got, state } = feed(slice(pretty, 7), DEEP)
  const works = allValues(got, 'work')
  assert.strictEqual(works.length, 7, 'six steps plus the whole thing')
  assert.deepStrictEqual(works.pop(), WORK_DOC.work)
  assert.strictEqual(state.rootClosed, true)
})

/* ------------------------------------------------------------------ *
 * 7. THE PIPELINE INTEGRATION
 *
 * The extractor being right is half the job. The other half is that wiring it
 * into pipeline.js changed NOTHING about the document — same model, same token
 * ceiling, same validation, same refusal to cache an unverified reading. These
 * tests hold that line, and they hold the one new obligation streaming creates:
 * an abandoned attempt must un-draw what it drew.
 *
 * Still no API key. The client is a fake with a scripted `stream`.
 * ------------------------------------------------------------------ */

const { plainRead } = require('./pipeline')

/** A fake MessageStream: registers handlers, pumps text, then resolves. */
function fakeStream({ text, error, chunkSize }) {
  const handlers = []
  return {
    on(evt, cb) {
      if (evt === 'text') handlers.push(cb)
      return this
    },
    async finalMessage() {
      for (const piece of slice(text, chunkSize)) {
        await new Promise((r) => setImmediate(r))
        for (const cb of handlers) cb(piece)
      }
      if (error) throw error
      return { content: [{ type: 'text', text }] }
    },
  }
}

/**
 * A createClient that scripts one response per call. Each entry is either a
 * document (streamed as JSON) or { text, error } for a stream that dies partway.
 */
function scriptedStreamingClient(entries, { chunkSize = 23 } = {}) {
  const calls = []
  return {
    calls,
    createClient: () => ({
      messages: {
        create: async (params) => {
          const entry = entries[calls.length]
          calls.push({ mode: 'create', params })
          const text = typeof entry === 'string' ? entry : JSON.stringify(entry)
          return { content: [{ type: 'text', text }] }
        },
        stream: (params) => {
          const entry = entries[calls.length]
          calls.push({ mode: 'stream', params })
          const spec = entry && entry.__stream
            ? entry
            : { text: typeof entry === 'string' ? entry : JSON.stringify(entry) }
          return fakeStream({ text: spec.text, error: spec.error, chunkSize })
        },
      },
    }),
  }
}

/* The Philippians 4:10-13 fixture, kept local and self-contained the way every
 * other suite in this directory keeps its fixtures. */
function rawDoc(overrides = {}) {
  const base = {
    reference: 'Philippians 4:10-13',
    sensitive: false,
    situation: {
      when: 'around AD 62, late in a stretch of custody, though a minority place the letter earlier and from a different prison',
      where: 'written from custody in a Roman city, sent to a Roman colony in northern Greece',
      pressure:
        'The congregation had put money together and sent it a long way to a man in chains. They were not a wealthy group, and the gift cost them something real. Months had passed with no word back, long enough for the senders to wonder whether it had ever arrived. The man they had paid to keep alive was a prisoner whose case could still end either way.',
      soWhat:
        'The line about contentment is not a maxim floating free of a situation. It sits inside a thank-you note from a prisoner to the people whose money was keeping him fed.',
      confidence: 'reconstructed',
      vaultSourced: false,
    },
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
        body: 'This is an occasional letter, not an essay and not a manual. Letters answer situations, so the shape of the argument follows what produced it.',
        youCanCheck: 'Read the opening and closing lines back to back and notice both name specific people.',
        theMove: 'Ask what kind of writing you are holding before you ask what it means.',
      },
      setting: {
        body: 'This is a letter, and the man behind it is in custody. The letter went to a Roman colony in Macedonia, and its readers had sent him money more than once.',
        youCanCheck: 'Find the two places in the chapter that name money and read them together.',
        theMove: 'Ask what the first readers already knew that you do not.',
      },
      surroundings: {
        body: 'The two verses before this one name the gift and the people who sent it. The line after turns back to thanking them, which bounds how far the middle can be pushed.',
        youCanCheck: 'Read the four lines on either side without stopping at the famous one.',
        theMove: 'Never read a line without reading its neighbors first.',
      },
      words: {
        body: 'The sentence runs on a verb of learning, not a verb of feeling. The word translated as content was a common term for self-sufficiency.',
        youCanCheck: 'Underline every verb in the paragraph and see which ones repeat.',
        theMove: 'Check the sentence structure before you decide what a phrase means.',
      },
      story: {
        body: 'The letter sits inside a longer story about a people learning to trust provision they did not control. The wilderness generation in Exodus is the pattern being drawn on here.',
        youCanCheck: 'Read the manna account and notice what happens when people store extra.',
        theMove: 'Ask where a passage sits in the whole story before you apply it to your week.',
      },
      doing: {
        body: 'The writer is closing a thank-you note in the last paragraph without making himself dependent on the gift. He wants the readers to know their gift arrived and did not put him under obligation.',
        youCanCheck: 'Read the last six lines aloud and notice how carefully the gift is described.',
        theMove: 'Ask what the writer is doing with the words, not only what the words say.',
      },
      christPathway: null,
    },
    outline: {
      shape: 'Linear: the gift is named, then qualified, then grounded.',
      units: [
        { ref: '4:10', heading: 'The writer names the renewed gift and his gladness at it', logic: null, children: null },
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

const ANALYSIS = {
  reference: 'Philippians 4:10-13',
  passageText:
    '10 I rejoiced in the Lord greatly that now at length you have revived your concern for me. ' +
    '11 Not that I am speaking of being in need, for I have learned in whatever situation I am to be content. ' +
    '12 I know how to be brought low, and I know how to abound. ' +
    '13 I can do all things through him who strengthens me.',
  mainTheme: 'learned contentment',
  genre: 'letter',
}

/** Async tests get the same streaming-name treatment as the other suites. */
const asyncTests = []
function atest(name, fn) {
  asyncTests.push(async () => {
    try {
      await fn()
      results.push({ name, ok: true })
      console.log(`PASS  ${name}`)
    } catch (err) {
      results.push({ name, ok: false, err })
      console.log(`FAIL  ${name}`)
      console.log(`      ${err && err.message}`)
    }
  })
}

atest('onSection fires per top-level key and the document still validates', async () => {
  const { createClient, calls } = scriptedStreamingClient([rawDoc()])
  const seen = []
  const doc = await plainRead({
    analysis: ANALYSIS,
    apiKey: 'test-key',
    createClient,
    verify: false,
    onSection: (key, value) => seen.push({ key, value }),
  })
  assert.strictEqual(calls[0].mode, 'stream', 'onSection switches the call to streaming')
  assert.ok(seen.length > 5, `sections were pushed (got ${seen.length})`)
  assert.ok(keysOf(seen).includes('situation'), 'situation streamed')
  assert.ok(keysOf(seen).includes('meaning'), 'meaning streamed')
  assert.ok(keysOf(seen).includes('handoff'), 'handoff streamed')
  assert.ok(!keysOf(seen).includes('__reset__'), 'a clean run never resets')
  // The document is the truth, not the sections.
  assert.strictEqual(doc.reference, 'Philippians 4:10-13')
  assert.strictEqual(doc.application.step.kind, 'plan')
  assert.ok('mechanic' in doc, 'the mechanic block was still computed after streaming')
  assert.ok('promptVersion' in doc && 'readingLevel' in doc, 'and so was the rest of the assembly')
})

atest('the streamed parameters are identical to the non-streamed ones', async () => {
  // The whole non-negotiable: this removes waiting, not content. If a future
  // edit trims max_tokens or swaps the model to make streaming look faster,
  // this fails.
  const plain = scriptedStreamingClient([rawDoc()])
  await plainRead({ analysis: ANALYSIS, apiKey: 'k', createClient: plain.createClient, verify: false })

  const streamed = scriptedStreamingClient([rawDoc()])
  await plainRead({
    analysis: ANALYSIS,
    apiKey: 'k',
    createClient: streamed.createClient,
    verify: false,
    onSection: () => {},
  })

  assert.strictEqual(plain.calls[0].mode, 'create', 'no onSection means no stream')
  assert.strictEqual(streamed.calls[0].mode, 'stream')
  assert.deepStrictEqual(
    streamed.calls[0].params,
    plain.calls[0].params,
    'same model, same max_tokens, same prompt, same cache marker'
  )
})

atest('a streamed document equals the non-streamed one field for field', async () => {
  const a = scriptedStreamingClient([rawDoc()])
  const plainDoc = await plainRead({
    analysis: ANALYSIS, apiKey: 'k', createClient: a.createClient, verify: false,
  })
  const b = scriptedStreamingClient([rawDoc()])
  const streamedDoc = await plainRead({
    analysis: ANALYSIS, apiKey: 'k', createClient: b.createClient, verify: false, onSection: () => {},
  })
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(streamedDoc)),
    JSON.parse(JSON.stringify(plainDoc)),
    'streaming is a rendering concern and changes nothing about the document'
  )
})

atest('every streamed section is exactly what the model wrote', async () => {
  const source = rawDoc()
  const { createClient } = scriptedStreamingClient([source], { chunkSize: 5 })
  const seen = []
  await plainRead({
    analysis: ANALYSIS,
    apiKey: 'test-key',
    createClient,
    verify: false,
    onSection: (key, value) => seen.push({ key, value }),
  })
  const modelWritten = [
    'situation', 'meaning', 'work', 'outline', 'distance',
    'application', 'restraint', 'unknowns', 'handoff',
  ]
  for (const key of modelWritten) {
    const hits = seen.filter((s) => s.key === key)
    assert.ok(hits.length > 0, `${key} was streamed`)
    // `work` is deepened, so it arrives once per reasoning step and the LAST
    // one is the finished section. Every other key arrives exactly once.
    if (key !== 'work') assert.strictEqual(hits.length, 1, `${key} arrived once`)
    assert.deepStrictEqual(
      hits[hits.length - 1].value,
      JSON.parse(JSON.stringify(source[key])),
      `the finished ${key} is the model's value, byte for byte`
    )
  }
})

atest('THE FIX: work arrives step by step instead of all at the end', async () => {
  // The measured problem, at the level the renderer actually sees it. `work`
  // holds all six reasoning steps and is the bulk of the document; before this,
  // not one of them could be drawn until the eighteenth field was written.
  const source = rawDoc()
  const { createClient } = scriptedStreamingClient([source], { chunkSize: 7 })
  const seen = []
  const doc = await plainRead({
    analysis: ANALYSIS,
    apiKey: 'test-key',
    createClient,
    verify: false,
    onSection: (key, value) => seen.push({ key, value }),
  })
  const works = seen.filter((s) => s.key === 'work').map((s) => s.value)
  assert.ok(works.length >= 6, `one emission per step (got ${works.length})`)

  const steps = ['genre', 'setting', 'surroundings', 'words', 'story', 'doing']
  for (let n = 0; n < steps.length; n += 1) {
    assert.deepStrictEqual(
      Object.keys(works[n]),
      steps.slice(0, n + 1),
      `emission ${n} carries steps 0..${n} — merge by key, never append`
    )
  }
  // A step that has been shown is never rewritten, only added to.
  for (let n = 1; n < works.length; n += 1) {
    for (const k of Object.keys(works[n - 1])) {
      assert.deepStrictEqual(works[n][k], works[n - 1][k], `${k} stayed put across emission ${n}`)
    }
  }
  // And none of it changed the document.
  assert.deepStrictEqual(works[works.length - 1], doc.work, 'the last emission is the real section')
  assert.strictEqual(doc.application.step.kind, 'plan', 'the rest of the document is untouched')
})

atest('deepening did not change the document, the params, or the guardrails', async () => {
  // Same three lines the depth-1 streaming had to hold, re-held now that a key
  // can arrive more than once. If a future edit trims max_tokens or drops a step
  // to make streaming look faster, this is what fails.
  const plain = scriptedStreamingClient([rawDoc()])
  const plainDoc = await plainRead({
    analysis: ANALYSIS, apiKey: 'k', createClient: plain.createClient, verify: false,
  })
  const streamed = scriptedStreamingClient([rawDoc()])
  const streamedDoc = await plainRead({
    analysis: ANALYSIS, apiKey: 'k', createClient: streamed.createClient, verify: false,
    onSection: () => {},
  })
  assert.deepStrictEqual(
    streamed.calls[0].params,
    plain.calls[0].params,
    'same model, same max_tokens, same prompt, same cache marker'
  )
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(streamedDoc)),
    JSON.parse(JSON.stringify(plainDoc)),
    'and the same document, field for field'
  )
  assert.strictEqual(Object.keys(streamedDoc.work).length, Object.keys(plainDoc.work).length,
    'every reasoning step still present — the document did not get shorter')

  // A document that streams beautifully and validates as garbage is still refused.
  const broken = rawDoc({ application: undefined })
  const bad = scriptedStreamingClient([broken, broken])
  const seen = []
  await assert.rejects(() => plainRead({
    analysis: ANALYSIS, apiKey: 'k', createClient: bad.createClient, verify: false,
    onSection: (key) => seen.push({ key }),
  }), 'validation still runs on the whole document')
  assert.ok(seen.some((s) => s.key === 'work'), 'work had been painted step by step')
  assert.strictEqual(keysOf(seen).pop(), '__reset__', 'and every painted step was taken back down')
})

atest('A STREAMED SECTION IS PRE-VALIDATION and can differ from the final document', async () => {
  // This is the contract the renderer has to honour, and it is not theoretical:
  // validatePlainRead NORMALISES. Here the model writes a reflective `question`
  // on a step kind that is not allowed one, and validation nulls it. The
  // section went out with the question in it.
  //
  // So: render the sections to get the reader reading, then SWAP THE WHOLE
  // RETURNED DOCUMENT IN when plainRead() resolves. Do not keep the pieces.
  const source = rawDoc()
  assert.strictEqual(
    source.application.step.question,
    'Where does my steadiness actually come from this week?',
    'the fixture carries a question the validator will strip'
  )
  const { createClient } = scriptedStreamingClient([source])
  const seen = []
  const doc = await plainRead({
    analysis: ANALYSIS, apiKey: 'k', createClient, verify: false,
    onSection: (key, value) => seen.push({ key, value }),
  })
  const streamedApplication = seen.find((s) => s.key === 'application').value
  assert.strictEqual(
    streamedApplication.step.question,
    'Where does my steadiness actually come from this week?',
    'the section carried the raw value'
  )
  assert.strictEqual(
    doc.application.step.question,
    null,
    'and the validated document did not — the document is the truth'
  )
})

atest('VALIDATION STILL RUNS ON THE WHOLE DOCUMENT — sections do not bypass it', async () => {
  // A document that streams beautifully and validates as garbage must still be
  // rejected. Streaming is a rendering concern; the guardrails did not move.
  const broken = rawDoc({ application: undefined })
  const { createClient } = scriptedStreamingClient([broken, broken])
  const seen = []
  await assert.rejects(
    () => plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient,
      verify: false,
      onSection: (key, value) => seen.push({ key, value }),
    }),
    'an invalid document is refused no matter how well it streamed'
  )
  assert.ok(seen.some((s) => s.key === 'meaning'), 'sections were rendered on the way')
  assert.strictEqual(keysOf(seen).pop(), '__reset__', 'and taken back down at the end')
})

atest('an abandoned attempt fires __reset__ before the retry paints over it', async () => {
  // Two bad samples: attempt 0 paints and is thrown away, attempt 1 paints and
  // the reading dies. Every painted run must be bracketed by a reset, or the
  // reader sees two different readings spliced together.
  const broken = rawDoc({ application: undefined })
  const { createClient, calls } = scriptedStreamingClient([broken, broken])
  const seen = []
  await assert.rejects(() => plainRead({
    analysis: ANALYSIS,
    apiKey: 'test-key',
    createClient,
    verify: false,
    onSection: (key) => seen.push({ key }),
  }))
  assert.strictEqual(calls.length, 2, 'it retried once, as it always did')
  const resets = keysOf(seen).filter((k) => k === '__reset__')
  assert.strictEqual(resets.length, 2, 'one reset per abandoned attempt')
  // The first reset must land before the second attempt starts painting.
  const firstReset = keysOf(seen).indexOf('__reset__')
  const secondMeaning = keysOf(seen).lastIndexOf('meaning')
  assert.ok(firstReset < secondMeaning, 'the reset comes BEFORE the retry repaints')
})

atest('a stream that dies mid-document resets what it painted', async () => {
  const full = JSON.stringify(rawDoc())
  const { createClient } = scriptedStreamingClient([
    { __stream: true, text: full.slice(0, full.indexOf('"outline"')), error: new Error('socket closed') },
  ])
  const seen = []
  await assert.rejects(() => plainRead({
    analysis: ANALYSIS,
    apiKey: 'test-key',
    createClient,
    verify: false,
    onSection: (key) => seen.push({ key }),
  }), /socket closed/)
  assert.ok(keysOf(seen).includes('situation'), 'it had painted something')
  assert.strictEqual(keysOf(seen).pop(), '__reset__', 'and it took it back down')
})

atest('a client that cannot stream still produces the document, minus sections', async () => {
  // Defensive: an older client object, a test fake, anything without .stream.
  // The document is the product; progressive rendering is a nicety.
  const noStream = () => ({
    messages: {
      create: async () => ({ content: [{ type: 'text', text: JSON.stringify(rawDoc()) }] }),
    },
  })
  const seen = []
  const doc = await plainRead({
    analysis: ANALYSIS,
    apiKey: 'test-key',
    createClient: noStream,
    verify: false,
    onSection: (key) => seen.push(key),
  })
  assert.strictEqual(doc.reference, 'Philippians 4:10-13', 'the reading still lands')
  assert.deepStrictEqual(seen, [], 'and nothing was promised that could not be delivered')
})

atest('a throwing onSection callback cannot kill the reading', async () => {
  const { createClient } = scriptedStreamingClient([rawDoc()])
  const doc = await plainRead({
    analysis: ANALYSIS,
    apiKey: 'test-key',
    createClient,
    verify: false,
    onSection: () => { throw new Error('the renderer exploded') },
  })
  assert.strictEqual(doc.reference, 'Philippians 4:10-13')
})

atest('a cache hit returns without streaming a single section', async () => {
  const store = new Map()
  const first = scriptedStreamingClient([rawDoc()])
  const warm = await plainRead({
    analysis: ANALYSIS,
    apiKey: 'test-key',
    createClient: first.createClient,
    verify: false,
    cache: { get: (k) => store.get(k) ?? null, set: (k, v) => store.set(k, v) },
    onSection: () => {},
  })
  // verify:false is 'skipped', which the cache refuses — so seed it by hand to
  // get a hit without pretending an unverified document may be cached.
  assert.strictEqual(store.size, 0, 'an unverified document is still never cached')
  const { cacheKeyFor } = require('./pipeline')
  store.set(cacheKeyFor(ANALYSIS, 'plain'), { ...warm, verification: { status: 'ok' } })

  const exploding = () => ({
    messages: {
      create: async () => { throw new Error('a cache hit must not call the model') },
      stream: () => { throw new Error('a cache hit must not stream') },
    },
  })
  const seen = []
  const hit = await plainRead({
    analysis: ANALYSIS,
    apiKey: 'test-key',
    createClient: exploding,
    verify: false,
    cache: { get: (k) => store.get(k) ?? null, set: (k, v) => store.set(k, v) },
    onSection: (key) => seen.push(key),
  })
  assert.strictEqual(hit.fromCache, true)
  assert.deepStrictEqual(seen, [], 'nothing to stream — it was already written')
})

/* ------------------------------------------------------------------ *
 * summary
 * ------------------------------------------------------------------ */

// A hung await is the one failure node reports as SUCCESS: the loop drains, the
// process exits 0, and not a line is printed. The pipeline tests hold streams
// open on purpose, so the watchdog is not optional. Deliberately not unref'd.
const watchdog = setTimeout(() => {
  console.log('\nFAIL  watchdog — the suite hung')
  process.exit(1)
}, 30_000)

async function main() {
  for (const run of asyncTests) await run()
  clearTimeout(watchdog)

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.log('\nFAILURES:')
    for (const f of failed) console.log(`  - ${f.name}: ${f.err && f.err.message}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.log(`\nFAIL  the harness itself threw: ${err && err.message}`)
  process.exit(1)
})
