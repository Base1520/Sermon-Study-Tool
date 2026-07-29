#!/usr/bin/env node
/**
 * plainread-live.js — run PLAIN READ against the LIVE model, headless.
 *
 * Everything in the test suite uses injected fake responses, which proves the
 * deterministic logic and proves nothing about quality. This runs the real
 * thing on a real cached analysis so the output can be read by a human before
 * a reader ever sees it.
 *
 *   node scripts/plainread-live.js "ephesians-2:8-10"
 *   node scripts/plainread-live.js --list
 *   node scripts/plainread-live.js "genesis-15" --json
 *
 * The API key is read from the same file the app writes and is never printed.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const Anthropic = require('@anthropic-ai/sdk')

const STORE = path.join(os.homedir(), 'Library/Application Support/sermon-tool/config.json')
const KEYS = path.join(os.homedir(), 'Documents/BASE1520/keys.txt')

function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const raw = fs.readFileSync(KEYS, 'utf8')
  const m = raw.match(/ANTHROPIC_KEY\s*=\s*(\S+)/)
  if (!m) throw new Error(`No ANTHROPIC_KEY found in ${KEYS}`)
  return m[1]
}

function loadStore() {
  return JSON.parse(fs.readFileSync(STORE, 'utf8'))
}

function analyses(store) {
  return Object.entries(store)
    .filter(([k]) => k.startsWith('analysis-cache'))
    .map(([k, v]) => ({ key: k, ref: v?.reference ?? '?', analysis: v }))
}

/* ---------- rendering, so the output reads the way a reader sees it ---------- */

/**
 * Mirrors composeCueAction() in src/components/PlainRead.tsx. The model returns
 * cue and action as separate fields on purpose, and the sentence is assembled at
 * the edge — so this harness has to assemble it the same way or it misreports
 * the product. (It did, once: naive interpolation produced "When When you…".)
 */
const KEEP_CAPITAL = new Set(['I', 'God', 'Jesus', 'Christ', 'Scripture',
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])

function foldFirstWord(s) {
  const first = s.split(/\s+/)[0].replace(/[^A-Za-z']/g, '')
  if (KEEP_CAPITAL.has(first)) return s
  if (/^[A-Z]{2,}/.test(first)) return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

function composeCueAction(cue, action) {
  let c = String(cue).trim().replace(/[.,;:]+$/, '')
  if (/^(when|whenever|if|after|before|as soon as|the moment)\b/i.test(c)) {
    c = c.charAt(0).toUpperCase() + c.slice(1)
  } else {
    c = `When ${foldFirstWord(c)}`
  }
  let a = String(action).trim().replace(/^then\s+/i, '').replace(/[.]+$/, '')
  a = /^I\b/.test(a) ? a : `I ${foldFirstWord(a)}`
  return `${c}, then ${a}.`
}

const B = (s) => `\x1b[1m${s}\x1b[0m`
const D = (s) => `\x1b[2m${s}\x1b[0m`
const G = (s) => `\x1b[33m${s}\x1b[0m`
const R = (s) => `\x1b[31m${s}\x1b[0m`
const rule = (t) => console.log('\n' + G('━'.repeat(4) + ' ' + t + ' ' + '━'.repeat(Math.max(0, 64 - t.length))))

function wrap(s, w = 78, indent = '') {
  const words = String(s ?? '').split(/\s+/)
  const lines = []
  let cur = ''
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > w) { lines.push(cur.trim()); cur = word }
    else cur += ' ' + word
  }
  if (cur.trim()) lines.push(cur.trim())
  return lines.map(l => indent + l).join('\n')
}

function render(doc) {
  console.log('\n' + B(`PLAIN READ — ${doc.reference}`))
  if (doc.expandReason) console.log(D(wrap(doc.expandReason)))
  if (doc.sensitive) console.log(R('  [sensitive passage — step forced to a question]'))

  rule('THE SHAPE OF THE TEXT')
  console.log(B(wrap(doc.outline?.shape ?? '(none)')))
  for (const u of doc.outline?.units ?? []) {
    console.log()
    if (u.logic) console.log(D(`    ↳ ${u.logic}`))
    console.log(`  ${G(u.ref)}  ${u.heading}`)
    for (const c of u.children ?? []) console.log(`      ${G(c.ref)}  ${c.heading}`)
  }

  rule('WHAT THE AUTHOR MEANT')
  console.log(wrap(doc.meaning?.plain))
  if (doc.meaning?.misread) {
    console.log('\n' + B('  Commonly misread as:') + ' ' + doc.meaning.misread.claim)
    console.log(wrap(doc.meaning.misread.whyNot, 76, '  '))
    if (doc.meaning.misread.biggerNotSmaller) console.log(wrap(doc.meaning.misread.biggerNotSmaller, 76, '  '))
  }
  if (doc.meaning?.level) console.log('\n' + B('  Level named: ') + doc.meaning.level)
  console.log('\n' + D(wrap('Assumes: ' + doc.meaning?.assumes)))

  rule('HOW WE GOT THERE')
  const steps = ['genre', 'setting', 'surroundings', 'words', 'story', 'doing']
  steps.forEach((k, i) => {
    const s = doc.work?.[k]
    if (!s) return
    console.log(`\n${B(`${i + 1}. ${k.toUpperCase()}`)}`)
    console.log(wrap(s.body, 76, '   '))
    console.log(G(wrap('✓ Check it yourself: ' + s.youCanCheck, 74, '   ')))
    console.log(D(wrap('→ The move: ' + s.theMove, 74, '   ')))
  })
  if (doc.work?.christPathway) console.log('\n' + B('  Christ pathway: ') + doc.work.christPathway)
  else console.log('\n' + D('  Christ pathway: null (correct for many passages)'))

  rule('THE DISTANCE')
  console.log(wrap(doc.distance))

  rule('WHAT TO DO WITH IT')
  const a = doc.application ?? {}
  console.log(D(`faces: ${(a.faces ?? []).join(', ')}   dominant: ${a.dominantFace}   step: ${a.step?.kind}`))
  console.log('\n' + B('To them first: ') + wrap(a.toThemFirst, 76).trim())
  console.log('\n' + B('Then to you:   ') + wrap(a.thenToYou, 76).trim())
  console.log()
  if (a.step?.kind === 'question') console.log(G(wrap('  ? ' + a.step.question)))
  else console.log(G(wrap('  ' + composeCueAction(a.step?.cue ?? '', a.step?.action ?? ''))))
  if (doc.mechanic) console.log('\n' + D(wrap('[psych caveat] ' + doc.mechanic.caveat, 76, '  ')))
  else console.log('\n' + D('  (no psych caveat — clinical review gate is closed, as designed)'))

  rule('WHAT NOT TO DO WITH IT')
  for (const r of doc.restraint ?? []) console.log(wrap('• ' + r, 76, '  '))

  if (doc.differ) {
    rule('WHERE HONEST READERS DIFFER')
    if (doc.differ.tier) console.log(B(`  [${doc.differ.tier}] `) + doc.differ.summary)
    else console.log('  ' + doc.differ.summary)
    for (const v of doc.differ.views) console.log(wrap('— ' + v, 76, '    '))
  }

  rule("WHAT I COULDN'T ANSWER")
  if (!doc.unknowns?.length) console.log(D('  nothing flagged'))
  for (const u of doc.unknowns ?? []) console.log(wrap('• ' + u, 76, '  '))

  rule('HANDOFF')
  console.log(wrap(doc.handoff))

  rule('THE CHECKER (invisible to the reader)')
  const v = doc.verification
  if (!v) console.log(D('  no verification recorded'))
  else {
    console.log(`  checked ${B(v.checked ?? 0)}   confirmed ${B(v.confirmed ?? 0)}   ` +
      `interpretive ${D(String(v.interpretive ?? 0))}   ` +
      `unverifiable ${G(String(v.unverifiable ?? 0))}   refuted ${R(String(v.refuted ?? 0))}`)
    for (const n of v.notes ?? []) {
      const line = typeof n === 'string' ? n : (n.summary ?? `${n.step}: ${n.verdict} — ${n.claim}`)
      const tint = n.verdict === 'REFUTED' ? R : n.verdict === 'UNVERIFIABLE' ? G : D
      console.log(tint(wrap('  · ' + line, 74, '  ')))
    }
  }
}

/* ---------------------------------- main ---------------------------------- */

async function main() {
  const args = process.argv.slice(2)
  const store = loadStore()
  const all = analyses(store)

  if (args.includes('--list') || args.length === 0) {
    console.log(`${all.length} cached analyses:`)
    for (const a of all) console.log(`  ${a.ref.padEnd(24)} ${D(a.key)}`)
    return
  }

  const want = args[0].toLowerCase()
  const hit = all.find(a => a.key.toLowerCase().includes(want) || a.ref.toLowerCase().includes(want))
  if (!hit) throw new Error(`No cached analysis matching "${args[0]}". Run --list.`)

  // Diagnostics go to stderr so `--json` produces parseable JSON on stdout.
  console.error(D(`analysis: ${hit.key}`))
  console.error(D('calling the live model — one generate pass, then the adversarial check…'))

  const { plainRead } = require('../electron/plainread/pipeline')
  const t0 = Date.now()

  const doc = await plainRead({
    analysis: hit.analysis,
    apiKey: loadKey(),
    createClient: (k) => new Anthropic.default({ apiKey: k }),
    // No cache: we want a real generation every run, not yesterday's answer.
    cache: null,
    force: true,
    requestedReference: hit.analysis.reference,
  })

  const secs = ((Date.now() - t0) / 1000).toFixed(1)

  if (args.includes('--json')) { console.log(JSON.stringify(doc, null, 2)); return }
  render(doc)
  console.log('\n' + D(`generated in ${secs}s`))
}

main().catch(e => {
  console.error('\n' + R('FAILED: ') + (e?.message ?? e))
  if (e?.stack && process.env.DEBUG) console.error(e.stack)
  process.exit(1)
})
