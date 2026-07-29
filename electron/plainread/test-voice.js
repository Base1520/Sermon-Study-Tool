/**
 * test-voice.js — checks on the two prompt fragments in voice.js.
 *
 * NO API KEY. Nothing here calls a model. These are string checks, which is
 * exactly the right kind of check for a string that ships to strangers.
 *
 *   node electron/plainread/test-voice.js
 */

const {
  COLE_VOICE,
  DENSITY_RULES,
  voiceBlock,
  MAX_VOICE_BLOCK_CHARS,
} = require('./voice')
/*
 * The REAL regexes, straight from validate.js. Required plainly and on purpose.
 *
 * An earlier version of this file routed around validate.js when it failed to
 * load, because it was briefly unloadable (its export block referenced an
 * undeclared EXTERNAL_STRUCTURAL_FIELDS). That was the wrong shape for a test:
 * it reported green while the module every consumer depends on was broken. If
 * validate.js will not load, this file should fail loudly and immediately,
 * because that is a real failure and it is not this file's to hide.
 */
const { PULPIT_LEAK, FENCE_DISCLOSURE } = require('./validate')

let passed = 0
let failed = 0

function check(name, fn) {
  try {
    fn()
    passed++
    console.log(`  PASS  ${name}`)
  } catch (err) {
    failed++
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err.message}`)
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/**
 * These fragments are hard-wrapped at 78 columns, so any phrase long enough to
 * be worth asserting on has a newline somewhere in the middle of it. Content
 * checks run against this, not against the raw string — otherwise a re-wrap
 * that changed nothing at all would break the test.
 */
function flat(s) {
  return s.replace(/\s+/g, ' ').toLowerCase()
}

/* ------------------------------------------------------------------ *
 * banned name list
 *
 * Rule 4: never name a scholar, commentator, author, or book in user-facing
 * text. The prompt is not user-facing, but a name in the prompt is the most
 * likely route a name takes into the document, so it is banned here too.
 *
 * Drawn from the names that actually circulate in this material: the persona
 * prompt in main.js names one explicitly in order to ban it, and the vault's
 * hermeneutics material cites the rest.
 * ------------------------------------------------------------------ */
const BANNED_NAMES = [
  'N\\.?\\s?T\\.?\\s?Wright', 'Wright', 'Beale', 'Longenecker', 'Enns',
  'Vanhoozer', 'Gadamer', 'Hirsch', 'Osborne', 'K(ö|o)stenberger',
  'Grudem', 'Clowney', 'Greidanus', 'Chapell', 'Kaiser', 'Gentry',
  'Irenaeus', 'Augustine', 'Barth', 'Torrance', 'Irving', 'Bultmann',
  'Wellhausen', 'Gunkel', 'Derrida', 'Searle', 'Thiselton', 'Treier',
  'Schleiermacher', 'Dilthey', 'Heidegger', 'Ricoeur', 'Habermas',
  'Calvin', 'Luther', 'Piper', 'Keller', 'Carson', 'Schreiner', 'Sproul',
  'Ortlund', 'Bavinck', 'Turretin', 'Owen', 'Edwards', 'Spurgeon',
]
const NAME_RE = new RegExp(`\\b(${BANNED_NAMES.join('|')})\\b`)

/* ------------------------------------------------------------------ *
 * first person AS A REAL MAN
 *
 * The register was extracted from a persona prompt written in the first
 * person ("You are Cole"). That framing must not survive into this surface.
 * The tool speaks in the register; it never claims to BE anybody, never
 * signs, and never invents an experience.
 * ------------------------------------------------------------------ */
const FIRST_PERSON_AS_COLE = new RegExp(
  [
    '\\bI (preached|pastored|taught|counsell?ed|wrote|remember|once|used to|grew up|studied|served|planted)\\b',
    '\\bwhen I\\b',
    '\\bmy (church|congregation|people|wife|kids|family|ministry|study|office|experience|first|own)\\b',
    '\\bin my experience\\b',
    '\\bI have (seen|found|watched|sat|been|walked|spent)\\b',
    "\\bI'?ve (seen|found|watched|sat|been)\\b",
    '\\byears ago,? I\\b',
    '\\b(—|-|–)\\s?Cole\\b',
  ].join('|'),
  'i'
)

console.log('\ntest-voice.js\n')

/* ------------------------------------------------------------------ */
console.log('exports')

check('COLE_VOICE is a non-empty string', () => {
  assert(typeof COLE_VOICE === 'string', 'not a string')
  assert(COLE_VOICE.trim().length > 0, 'empty')
})

check('DENSITY_RULES is a non-empty string', () => {
  assert(typeof DENSITY_RULES === 'string', 'not a string')
  assert(DENSITY_RULES.trim().length > 0, 'empty')
})

check('voiceBlock() returns both fragments joined', () => {
  const block = voiceBlock()
  assert(typeof block === 'string', 'not a string')
  assert(block.includes(COLE_VOICE), 'COLE_VOICE missing from voiceBlock()')
  assert(block.includes(DENSITY_RULES), 'DENSITY_RULES missing from voiceBlock()')
})

check('COLE_VOICE is roughly 500-900 words', () => {
  const words = COLE_VOICE.trim().split(/\s+/).length
  assert(words >= 500 && words <= 900, `${words} words, wanted 500-900`)
})

/* ------------------------------------------------------------------ */
console.log('\npulpit leak — the real regex from validate.js')

check('COLE_VOICE does not trip PULPIT_LEAK', () => {
  const hit = COLE_VOICE.match(PULPIT_LEAK)
  assert(!hit, `matched "${hit && hit[0]}"`)
})

check('DENSITY_RULES does not trip PULPIT_LEAK', () => {
  const hit = DENSITY_RULES.match(PULPIT_LEAK)
  assert(!hit, `matched "${hit && hit[0]}"`)
})

check('voiceBlock() does not trip PULPIT_LEAK', () => {
  const hit = voiceBlock().match(PULPIT_LEAK)
  assert(!hit, `matched "${hit && hit[0]}"`)
})

check('voiceBlock() does not trip FENCE_DISCLOSURE', () => {
  const hit = voiceBlock().match(FENCE_DISCLOSURE)
  assert(!hit, `matched "${hit && hit[0]}"`)
})

/* ------------------------------------------------------------------ */
console.log('\nnames')

check('COLE_VOICE names no scholar, commentator or author', () => {
  const hit = COLE_VOICE.match(NAME_RE)
  assert(!hit, `named "${hit && hit[0]}"`)
})

check('DENSITY_RULES names no scholar, commentator or author', () => {
  const hit = DENSITY_RULES.match(NAME_RE)
  assert(!hit, `named "${hit && hit[0]}"`)
})

/* ------------------------------------------------------------------ */
console.log('\nno impersonation')

check('COLE_VOICE makes no first-person claim as a real man', () => {
  const hit = COLE_VOICE.match(FIRST_PERSON_AS_COLE)
  assert(!hit, `matched "${hit && hit[0]}"`)
})

check('DENSITY_RULES makes no first-person claim as a real man', () => {
  const hit = DENSITY_RULES.match(FIRST_PERSON_AS_COLE)
  assert(!hit, `matched "${hit && hit[0]}"`)
})

check('COLE_VOICE states the never-claim-to-be-him rule in the fragment itself', () => {
  const v = flat(COLE_VOICE)
  assert(v.includes('never write in the first person as a human being'),
    'no first-person ban stated')
  assert(v.includes('never sign anything'), 'no signature ban stated')
  assert(v.includes('never invent a memory'), 'no invented-anecdote ban stated')
  assert(v.includes('you do not have a life to draw on'),
    'no ban on borrowing a real life')
})

check('the register carries no personal detail (no named person at all)', () => {
  // A capitalised first+last name pattern would be a person. The fragments
  // should contain none — not even the man whose register this is.
  const hit = voiceBlock().match(/\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/g) || []
  const suspicious = hit.filter((h) => !/^(Careful scholar|In register|Answer in line|Do not|The verb|The passage|The letter|The first|The claim|The instruction|The reader|The exception|Every answer|Poetry makes|Letters back|English uses|Written|Unformed|Read each|Assume the|None of|Both of|Use the|Never send|Short short|One idea|Cut it)$/.test(h))
  assert(suspicious.length === 0, `possible personal name(s): ${suspicious.join(', ')}`)
})

/* ------------------------------------------------------------------ */
console.log('\nno length cap smuggled in')

check('neither fragment imposes a sentence or word budget', () => {
  const BUDGET = /\b(no more than|at most|maximum of|max)\s+\w+\s+(sentences?|words?|paragraphs?)\b|\bkeep it (short|brief|tight)\b|\bbe brief\b|\bunder \d+ (words?|sentences?)\b/i
  const hit = voiceBlock().match(BUDGET)
  assert(!hit, `a length cap leaked in: "${hit && hit[0]}"`)
})

check('DENSITY_RULES says out loud that length is not the enemy', () => {
  const d = flat(DENSITY_RULES)
  assert(d.includes('do not run short'), 'missing "do not run short"')
  assert(d.includes('unexplained density'), 'missing the real metric')
  assert(d.includes('target zero'), 'missing the zero-unexplained-concepts target')
  assert(d.includes('more words, not fewer'), 'missing "more words, not fewer"')
})

check('DENSITY_RULES carries the load-bearing instruction and examples', () => {
  const d = flat(DENSITY_RULES)
  assert(d.includes('does not know he has'), 'missing the implicit-question rule')
  const examples = (DENSITY_RULES.match(/^\s{2}Unformed:/gm) || []).length
  assert(examples >= 3 && examples <= 6, `${examples} worked examples, wanted 3-6`)
})

check('DENSITY_RULES orders the payload first and bans restating', () => {
  const d = flat(DENSITY_RULES)
  assert(d.includes('lead with the point'), 'missing lead-with-the-point')
  assert(d.includes('order, not about length'), 'lead-with-the-point not scoped to order')
  assert(d.includes('do not restate across blocks'), 'missing the no-restating rule')
})

check('DENSITY_RULES protects the guardrails from being cut', () => {
  const d = flat(DENSITY_RULES)
  assert(d.includes('restraints, unknowns, and the handoff'), 'guardrails not protected')
})

/* ------------------------------------------------------------------ */
console.log('\ncharacter budget')

const vLen = COLE_VOICE.length
const dLen = DENSITY_RULES.length
const bLen = voiceBlock().length

check(`voiceBlock() fits the stated budget of ${MAX_VOICE_BLOCK_CHARS} chars`, () => {
  assert(bLen <= MAX_VOICE_BLOCK_CHARS, `${bLen} chars, budget ${MAX_VOICE_BLOCK_CHARS}`)
})

console.log('')
console.log(`  COLE_VOICE      ${String(vLen).padStart(6)} chars  ~${COLE_VOICE.trim().split(/\s+/).length} words`)
console.log(`  DENSITY_RULES   ${String(dLen).padStart(6)} chars  ~${DENSITY_RULES.trim().split(/\s+/).length} words`)
console.log(`  voiceBlock()    ${String(bLen).padStart(6)} chars  budget ${MAX_VOICE_BLOCK_CHARS} (${Math.round((bLen / MAX_VOICE_BLOCK_CHARS) * 100)}% used)`)
console.log(`  rough tokens    ${String(Math.round(bLen / 4)).padStart(6)}  (chars / 4)`)

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')

process.exit(failed === 0 ? 0 : 1)
