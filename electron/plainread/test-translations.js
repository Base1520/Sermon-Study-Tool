// Translation ids must be ids the Bible API actually serves.
//
// This exists because two buttons shipped dead. The sidebar's ASV button sent
// id `nasb` — NASB is copyrighted and no public-domain API can serve it — and
// both panels' DBY button sent `dby`, which is not the id either. Both requests
// 404'd, so the buttons rendered, clicked, and did nothing. A wrong id fails
// silently and looks exactly like a working button, which is why it survived.
//
// No network: the known-served list is asserted from what was verified live on
// 2026-08-04, so this runs free and offline on every change.
//
//   node electron/plainread/test-translations.js

const fs = require('fs')
const path = require('path')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const src = fs.readFileSync(path.join(__dirname, '../../src/lib/translations.ts'), 'utf8')

// Parse the list out of the TS source rather than importing it — this file is
// plain Node and must not need a TypeScript toolchain to run.
const entries = [...src.matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'\s*,\s*requiresKey:\s*(true|false)/g)]
  .map(([, id, label, requiresKey]) => ({ id, label, requiresKey: requiresKey === 'true' }))
const served = [...src.matchAll(/SERVED_IDS = \[([^\]]+)\]/g)]
  .flatMap(([, body]) => [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]))

console.log('\nTHE LIST PARSES')
ok('translations were found', entries.length > 0, String(entries.length))
ok('the served-id list was found', served.length > 0, String(served.length))

console.log('\nEVERY OFFERED ID IS ONE THE API SERVES')
for (const t of entries) {
  ok(`${t.label} -> "${t.id}"`, served.includes(t.id),
     `"${t.id}" is not in SERVED_IDS — this button will 404 silently`)
}

console.log('\nTHE IDS THAT SHIPPED BROKEN STAY BROKEN-PROOF')
{
  // Regression guards, named. Both of these were live in production.
  ok('no button sends "nasb" (copyrighted, cannot be served)',
    !entries.some((t) => t.id === 'nasb'))
  ok('no button sends "dby" (not the id; the served one is "darby")',
    !entries.some((t) => t.id === 'dby'))
  ok('"nasb" is not claimed as served', !served.includes('nasb'))
  ok('"dby" is not claimed as served', !served.includes('dby'))
}

console.log('\nSANITY')
{
  ok('ESV is the only one requiring a key',
    entries.filter((t) => t.requiresKey).map((t) => t.id).join(',') === 'esv')
  ok('ids are unique', new Set(entries.map((t) => t.id)).size === entries.length)
  ok('labels are unique', new Set(entries.map((t) => t.label)).size === entries.length)
  ok('at least one translation needs no key at all',
    entries.some((t) => !t.requiresKey))
}

console.log('\nONLY ONE LIST EXISTS')
{
  // The root cause was two hand-maintained copies drifting apart.
  const components = ['../../src/components/PassageInput.tsx', '../../src/components/ParallelPanel.tsx']
  for (const rel of components) {
    const body = fs.readFileSync(path.join(__dirname, rel), 'utf8')
    ok(`${path.basename(rel)} defines no list of its own`,
      !/const TRANSLATIONS\s*=\s*\[/.test(body))
    ok(`${path.basename(rel)} imports the shared one`,
      /from '\.\.\/lib\/translations'/.test(body))
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
