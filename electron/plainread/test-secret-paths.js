// Every place a key is SPENT must go through the fallback-aware resolver.
//
// WHY THIS EXISTS. A commit claimed requireSecret() was "the single chokepoint
// for all 14 Anthropic call sites." It counted the requireSecret sites and
// missed two handlers calling readSecret() directly. readSecret is raw storage
// access with no embedded-key fallback, so on a beta build both degraded to
// their no-key branch on every request — and one of them was the eisegesis
// watchdog, whose no-key branch returns { flags: [] }, which the UI renders as
// CLEAN.
//
// A doctrinal check that never ran, displayed as a check that passed. That is a
// worse failure than a crash: a crash gets reported, and this gets preached.
//
// The lesson generalises past this one bug — a claim of "single chokepoint" is
// worth nothing unless something enforces it. This does.
//
//   node electron/plainread/test-secret-paths.js

const fs = require('fs')
const path = require('path')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ''}`) }
}

const mainPath = path.join(__dirname, '../main.js')
const src = fs.readFileSync(mainPath, 'utf8')
const lines = src.split('\n')

console.log('\nTHE RESOLVER EXISTS AND IS THE ONLY DOOR')
{
  ok('resolveSecret() is defined', /function resolveSecret\(/.test(src))
  ok('requireSecret() delegates to it, rather than reimplementing the fallback',
    /function requireSecret\([^)]*\)\s*\{\s*(?:\/\/[^\n]*\n\s*)*const value = resolveSecret\(/.test(src))
}

console.log('\nNO HANDLER READS RAW STORAGE FOR A KEY IT INTENDS TO SPEND')
{
  // readSecret is legitimate inside the secret-management functions themselves.
  // Anywhere else it is the bug this file exists to prevent.
  const ALLOWED_CALLERS = ['function secretStatus', 'function resolveSecret', 'function readSecret']

  const offenders = []
  lines.forEach((line, i) => {
    if (!/\breadSecret\(/.test(line)) return
    if (/^\s*(\/\/|\*)/.test(line)) return          // a comment about it is fine
    if (/function readSecret\(/.test(line)) return  // its own definition

    // Walk back to the enclosing top-level function declaration.
    let owner = '(top level)'
    for (let j = i; j >= 0; j--) {
      const m = lines[j].match(/^(function \w+)/)
      if (m) { owner = m[1]; break }
    }
    if (!ALLOWED_CALLERS.includes(owner)) {
      offenders.push(`main.js:${i + 1} inside ${owner}() -> ${line.trim()}`)
    }
  })

  ok('readSecret() is confined to the secret-management block',
    offenders.length === 0,
    offenders.length
      ? offenders.join('\n         ') + '\n         Use resolveSecret() — readSecret has no embedded-key fallback.'
      : '')
}

console.log('\nTHE TWO SITES THAT SHIPPED WRONG STAY FIXED')
{
  // Named regression guards. Both were live.
  const eisegesis = src.indexOf("ipcMain.handle('eisegesis-check'")
  ok('the eisegesis watchdog resolves with the fallback', eisegesis !== -1 &&
    /resolveSecret\('ANTHROPIC_KEY'\)/.test(src.slice(eisegesis, eisegesis + 900)))

  const commentary = src.indexOf('provenance: \'SOURCE TEXT\'')
  ok('commentary synthesis resolves with the fallback', commentary !== -1 &&
    /resolveSecret\('ANTHROPIC_KEY'\)/.test(src.slice(commentary, commentary + 700)))
}

console.log('\nAN EMPTY RESULT MUST NEVER BE INDISTINGUISHABLE FROM A CLEAN ONE')
{
  // The watchdog's no-key branch must carry an error the UI can tell apart from
  // a genuine pass. Without this, "never ran" and "found nothing" are the same
  // object.
  const h = src.indexOf("ipcMain.handle('eisegesis-check'")
  const body = h === -1 ? '' : src.slice(h, h + 900)
  ok('its no-key branch reports an error alongside the empty flags',
    /return \{ flags: \[\], error:/.test(body))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
