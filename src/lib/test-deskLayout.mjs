// Tiles must never land on top of each other.
//
// Both desks shipped a placement rule that ignored the desk: the iPad dropped
// every added tile at the viewport centre, the Mac gave eight card types one
// shared coordinate. These assert the property that was missing — an arrangement
// where nothing covers anything else — rather than the specific coordinates,
// so the layout can be retuned without rewriting the tests.
//
//   node src/lib/test-deskLayout.mjs

import { readFileSync } from 'node:fs'
import ts from 'typescript'

const src = readFileSync(new URL('./deskLayout.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const { packDeskTiles, nextFreeDeskSlot, deskRectsOverlap, DESK_MARGIN, DESK_GUTTER, DESK_ROW_WIDTH } = mod

let pass = 0, fail = 0
const ok = (n, c, d = '') => c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log(`  FAIL ${n}${d ? ' — ' + d : ''}`))

const place = (sizes) => packDeskTiles(sizes).map((p, i) => ({ ...p, ...sizes[i] }))
function firstOverlap(rects) {
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (deskRectsOverlap(rects[i], rects[j])) return `#${i} and #${j}`
    }
  }
  return null
}

// The real opening desk: the seven core tiles the iPad seeds, at their real sizes.
const CORE = [
  { width: 650, height: 540 }, // passage
  { width: 560, height: 280 }, // big idea
  { width: 560, height: 520 }, // structure
  { width: 500, height: 500 }, // context
  { width: 560, height: 500 }, // application
  { width: 500, height: 550 }, // outline
  { width: 900, height: 760 }, // manuscript
]

const core = place(CORE)
ok('the opening desk has no overlapping tiles', firstOverlap(core) === null, firstOverlap(core) || '')
ok('every opening tile sits inside the desk margin', core.every((r) => r.x >= DESK_MARGIN && r.y >= DESK_MARGIN))
ok('opening order is preserved (each tile is at or below its predecessor)',
  core.every((r, i) => i === 0 || r.y >= core[i - 1].y || r.x > core[i - 1].x))

// Symmetry: a row that does not fill the width is centred, so the gap on the
// left equals the gap on the right.
const pair = place([{ width: 400, height: 200 }, { width: 400, height: 200 }])
const leftGap = pair[0].x - DESK_MARGIN
const rightGap = (DESK_MARGIN + DESK_ROW_WIDTH) - (pair[1].x + pair[1].width)
ok('a short row is centred, not left-aligned', Math.abs(leftGap - rightGap) <= 1, `left ${leftGap} vs right ${rightGap}`)
ok('tiles in one row share a row and are spaced by the gutter',
  pair[0].y === pair[1].y && pair[1].x - (pair[0].x + pair[0].width) === DESK_GUTTER)

// The regression that started this: adding tiles one at a time.
let desk = core.slice()
for (let i = 0; i < 12; i += 1) {
  const size = { width: 460, height: 320 }
  const spot = nextFreeDeskSlot(desk, size)
  desk.push({ ...spot, ...size })
}
ok('adding twelve tiles one at a time never stacks them', firstOverlap(desk) === null, firstOverlap(desk) || '')
ok('added tiles stay within the desk row width',
  desk.every((r) => r.x + r.width <= DESK_MARGIN + DESK_ROW_WIDTH))

// Adding the SAME tile size repeatedly is what exposed the Mac bug — eight card
// types all resolved to one coordinate.
let same = []
for (let i = 0; i < 8; i += 1) {
  const size = { width: 760, height: 600 }
  same.push({ ...nextFreeDeskSlot(same, size), ...size })
}
ok('eight identical cards do not resolve to one coordinate', firstOverlap(same) === null, firstOverlap(same) || '')
ok('...and they are actually at eight distinct positions',
  new Set(same.map((r) => `${r.x}:${r.y}`)).size === 8)

// Determinism — "CLEAN UP" has to mean something.
ok('the same desk arranges the same way every time',
  JSON.stringify(packDeskTiles(CORE)) === JSON.stringify(packDeskTiles(CORE)))

// A tile too wide for the row still gets placed rather than dropped.
const huge = place([{ width: DESK_ROW_WIDTH + 800, height: 300 }, { width: 400, height: 300 }])
ok('an oversized tile is still placed, on its own row', huge.length === 2 && huge[1].y > huge[0].y)

// An empty desk puts the first tile at the origin, not floating.
ok('the first tile on an empty desk lands at the margin', (() => {
  const spot = nextFreeDeskSlot([], { width: 400, height: 300 })
  return spot.x === DESK_MARGIN && spot.y === DESK_MARGIN
})())

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
