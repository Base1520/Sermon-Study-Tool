import { useState, useMemo, useRef, useEffect, useLayoutEffect, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'
import type { FriendlyError } from '../lib/apiErrors'
import { CulturalNotesPanel } from './CulturalNotesPanel'
import { ParallelPanel } from './ParallelPanel'
import { CrossRefArcs } from './CrossRefArcs'
import type {
  AnalysisProgress,
  PhrasingAnalysis,
  PlainReadDoc,
  PlainReadStep,
  PlainReadOutlineUnit,
  ChristPathway,
} from '../types/phrasing'

/* The passage, cut along the outline. It imports parseVerses and versesInRef
   back out of this file — a deliberate cycle, so one parser answers for both
   views. Both exports are hoisted function declarations and neither module
   calls them at module scope, so the cycle resolves clean. */
import { PassageUnits, ScriptureWords, passageSplits } from './PassageUnits'

/* ══ TermGloss — MOUNTED ════════════════════════════════════════════════════ *
 * Click-to-explain study terms. GlossedText renders a <span> wrapper, so every
 * call site below sits INSIDE its <Prose>, never around it. The fallback stub
 * that stood here while TermGloss.tsx was being built in parallel is gone.
 */
import { GlossedText } from './TermGloss'

/* ══ The briefing, and the question surface ═════════════════════════════════ *
 * SituationCard runs ABOVE the passage — the room the text was written into,
 * before the text. AskPanel is the reader pushing back on what they just read.
 * Both are eager imports, not lazy ones: the briefing is part of the document's
 * first paint (a card that arrives late would shove the passage down the page
 * while someone is reading it aloud), and the ask dock has to open on the first
 * click with nothing to wait for.
 */
import { SituationCard } from './SituationCard'
import { AskPanel, ASK_ICON, ASK_LABEL, ASK_TILE_LABEL, PendingPulse } from './AskPanel'

/* Heavy study surfaces — pulled only when the reader opens one, so the document
   never waits on a map tile or a 55KB timeline it may not look at. */
const TopoMap       = /* @__PURE__ */ lazy(() => import('./TopoMap').then(m => ({ default: m.TopoMap })))
const LineageViewer = /* @__PURE__ */ lazy(() => import('./LineageViewer'))
const KingsList     = /* @__PURE__ */ lazy(() => import('./KingsList'))
const MonarchyCard  = /* @__PURE__ */ lazy(() => import('./MonarchyCard').then(m => ({ default: m.MonarchyCard })))
/* The tabernacle and the two temples. Same standalone (width, height) export as
   the lineage and kings viewers. It lives on the pastor's canvas as a tile, and
   a reader working through Exodus, 1 Kings, Ezekiel or Hebrews needs the floor
   plan more than a pastor does — nothing about it is delivery apparatus. */
const WorshipStructure = /* @__PURE__ */ lazy(() => import('./WorshipStructure'))

export interface Props {
  /**
   * THE FINISHED READING. Validated, and — when the claim check has landed —
   * corrected. It is authoritative: the moment it exists it replaces whatever
   * was streamed in below, wholesale and silently.
   */
  doc: PlainReadDoc | null
  /**
   * THE READING AS IT IS BEING WRITTEN.
   *
   * The engine emits each block the moment that block is finished, and App.tsx
   * merges them into this object as they land. It is the same document, arriving
   * in the order it is composed rather than all at once at the end — the setting,
   * then the shape of the text, then the meaning, then the six steps, then the
   * rest. Nothing here is a preview and nothing here is shortened: it is the
   * real document, minus the parts not yet written.
   *
   * `work` FILLS OVER SEVERAL MESSAGES. It is the one key that is not a block
   * but a container of six — the six reasoning steps — and it used to be the
   * whole problem: eighteen fields that could not be shown until the last of
   * them was written, which is the bulk of the document and about ninety
   * seconds in which nothing on the page changed. App.tsx now MERGES into it
   * rather than replacing it, so it appears here holding one finished step,
   * then two, then six. Every individual step in it is finished when it lands.
   *
   * NOTHING IS RENDERED HALF-WRITTEN. A key appears here only once its whole
   * value has arrived, and each of the six steps is guarded again on its own
   * three fields at the point of render (see stepReady) — so a step is either
   * wholly on the page or not on the page, never a heading over half a
   * sentence. There is no per-step spinner, no skeleton and no "3 of 6":
   * absent means nothing is drawn at all and the page simply grows downward as
   * blocks land. A reserved box that later fills is a jump; a page that grows is
   * a page.
   *
   * `doc` wins over this whenever it exists. If a streamed block disagrees with
   * the validated document, the validated document is right and the swap is
   * silent — the reader is never told a correction happened.
   */
  partial?: Partial<PlainReadDoc> | null
  loading: boolean
  error: FriendlyError | null
  /** The passage itself, from the analysis that produced this reading. */
  passageText?: string
  reference: string
  onRetry?: () => void
  onOpenSettings?: () => void
  /** Feeds the study tools. Absent = the rail simply does not render. */
  analysis?: PhrasingAnalysis | null
  apiKey?: string
  esvKey?: string
  onLoadRef?: (ref: string) => void
  /** Open the original-language study from a word in the PLAIN passage. */
  onWordClick?: (word: string, verseText: string) => void
  /** Open the passage's COVENANT small-group guide. */
  onOpenGroupGuide?: () => void
  /**
   * The FIRST half of the run — `analyze-passage` — is still going. It is a
   * separate wait from `loading`, which covers the reading itself, and the two
   * are consecutive: the analysis has to land before the reading can start.
   *
   * The reader view no longer waits for either one before it paints. The
   * passage text is in hand about a second after SEND IT, so it renders then,
   * and this flag only decides WHICH true sentence sits above it.
   */
  analyzing?: boolean
  /**
   * The token App.tsx sent with `analyze-passage`. Progress messages echo it
   * back, so a late message from a run the reader abandoned cannot drive this
   * run's status line.
   */
  progressStreamId?: string | null
}

/* ── what is actually happening ─────────────────────────────────────────────
 * electron/main.js:322 emits 'analysis-progress' with a named stage every time
 * a real step of the analysis finishes. These are those names, said in the
 * register the rest of this app is written in: short, factual, no percentage,
 * no cheerleading, nothing that claims to know how much is left.
 *
 * A stage this map does not know is printed as ITSELF, tidied — never mapped to
 * a friendlier sentence. The whole value of a status line is that it is true,
 * and a renderer that guesses at a stage it has not been taught is worth less
 * than no line at all.
 */
const STAGE_LABEL: Record<string, string> = {
  'start':            'Passage in',
  'calls-dispatched': 'Working the grammar and the background',
  'structure':        'Structure back',
  'theme':            'Theme back',
  'culture':          'Background back',
  'complete':         'Analysis done',
}

/** What the second half of the run is doing. It reports no stages of its own. */
const WRITING_LABEL = 'Writing the reading'

function stageLabel(stage: string | null): string {
  if (!stage) return STAGE_LABEL.start
  return STAGE_LABEL[stage] ?? stage.replace(/[-_]+/g, ' ').trim()
}

/**
 * The running clock. No bar, no percentage — none of this is measurable, and a
 * bar filling toward a finish it cannot see is a lie told slowly. A number that
 * only counts up claims nothing it cannot back.
 */
function Elapsed({ startedAt }: { startedAt: number }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
  useEffect(() => {
    setSecs(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    const id = window.setInterval(
      () => setSecs(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))),
      1000
    )
    return () => window.clearInterval(id)
  }, [startedAt])
  /* Fixed width so the row cannot twitch as the number grows a digit. */
  return <span style={{ color: BASE.steel, minWidth: 30, display: 'inline-block' }}>{secs}s</span>
}

/* ── the six steps, in the order the engine reasons through them ───────────── */

const STEP_ORDER: { key: keyof Omit<PlainReadDoc['work'], 'christPathway'>; label: string }[] = [
  { key: 'genre',        label: 'What kind of writing this is' },
  { key: 'setting',      label: 'Who wrote it, and to whom' },
  { key: 'surroundings', label: 'What sits on either side of it' },
  { key: 'words',        label: 'The words, and how the sentence works' },
  { key: 'story',        label: 'Where this sits in the whole story' },
  { key: 'doing',        label: 'What the author is doing with it' },
]

/**
 * Every pathway gets a plain-language gloss. A reader who does not already know
 * the word "typology" should not have to go find out what we meant.
 */
const PATHWAY_GLOSS: Record<ChristPathway, string> = {
  'direct-prophecy':            'a straight prediction — this text names ahead of time what Christ would do',
  'typology':                   'a pattern — a person, event, or institution here is shaped like the Christ who comes later',
  'promise-fulfillment':        'a promise made here that Christ later keeps',
  'thematic-fulfillment':       'a theme that runs through the whole Bible and comes to rest in Christ',
  'ethical-mission-continuity': 'the same mission and the same way of living that Christ carries forward',
  'prophet-priest-king':        'an office here — prophet, priest, or king — that Christ finally fills',
}

/* ── step sentence composition ─────────────────────────────────────────────── *
 * The model returns cue and action as SEPARATE fields on purpose. It is not
 * asked to compose the sentence, because a model asked for a finished sentence
 * quietly drifts off the form. We assemble it here, where the form is fixed.
 */
/**
 * Words that keep their capital when a cue gets folded in after "When". The
 * list is short on purpose — the only job is to stop "Sunday" and "I" from
 * being lowercased into "sunday" and "i". Anything not listed is treated as an
 * ordinary word.
 */
const KEEP_CAPITAL = new Set([
  'I', 'God', 'Jesus', 'Christ', 'Scripture', 'Sunday', 'Monday', 'Tuesday',
  'Wednesday', 'Thursday', 'Friday', 'Saturday', 'January', 'February', 'March',
  'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November',
  'December',
])

/** Lowercases a leading word only when doing so cannot damage a name. */
function foldFirstWord(s: string): string {
  const first = s.split(/\s+/)[0].replace(/[^A-Za-z']/g, '')
  if (KEEP_CAPITAL.has(first)) return s          // Sunday, I, God …
  if (/^[A-Z]{2,}/.test(first)) return s         // an acronym
  return s.charAt(0).toLowerCase() + s.slice(1)
}

function composeCueAction(cue: string, action: string): string {
  let c = cue.trim().replace(/[.,;:]+$/, '')
  if (/^(when|whenever|if|after|before|as soon as|the moment)\b/i.test(c)) {
    c = c.charAt(0).toUpperCase() + c.slice(1)
  } else {
    c = `When ${foldFirstWord(c)}`
  }

  let a = action.trim().replace(/^then\s+/i, '').replace(/[.]+$/, '')
  a = /^I\b/.test(a) ? a : `I ${foldFirstWord(a)}`

  return `${c}, then ${a}.`
}

/* ── small shared pieces ───────────────────────────────────────────────────── */

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{
        fontFamily: 'Saira, sans-serif', fontSize: 15, fontWeight: 750,
        letterSpacing: '0.07em', lineHeight: 1.35,
        color: BASE.bone, textTransform: 'uppercase',
        background: BASE.olive,
        border: `1px solid ${BASE.borderGold}`,
        borderLeft: `4px solid ${BASE.gold}`,
        padding: '10px 13px', marginBottom: 22,
      }}>
        {label}
      </div>
      {children}
    </section>
  )
}

function Prose({ children, dim = false }: { children: ReactNode; dim?: boolean }) {
  return (
    <p style={{
      fontFamily: 'Crimson Pro, serif', fontSize: 16.5, lineHeight: 1.78,
      color: dim ? BASE.boneMid : BASE.bone, margin: '0 0 14px 0',
      letterSpacing: '0.005em',
    }}>
      {children}
    </p>
  )
}

function MonoLabel({ children, color = BASE.steel }: { children: ReactNode; color?: string }) {
  return (
    <div style={{
      fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.18em',
      color, textTransform: 'uppercase', marginBottom: 6,
    }}>
      {children}
    </div>
  )
}

/* ── the passage, split into verses ────────────────────────────────────────── *
 * Verses are separated so a unit of the outline can light up the exact lines it
 * covers. Nothing else about the text changes.
 */

interface Verse { num: number | null; text: string }

/** Psalm 119 is the longest chapter in the Bible. Nothing above this is a verse. */
const MAX_VERSE = 176

/**
 * The verse a reference starts on, when the reference says so plainly.
 *
 * "Ephesians 2:8-10" → 8.  "Rev 19:11-21" → 11.  "romans 1" → 1 (a whole
 * chapter starts at its first verse).  Anything ambiguous — a chapter-crossing
 * range, or "Philemon 8-21" where the bare numbers could be chapters or verses
 * depending on the book — returns null. This is only a HINT used to pick
 * between candidate verse runs, so guessing here would buy nothing and could
 * cost a wrong alignment.
 */
export function refStartVerse(ref: string): number | null {
  const s = (ref ?? '').trim()
  if (!s) return null
  const colons = (s.match(/:/g) ?? []).length
  if (colons > 1) return null                      // crosses a chapter — no honest answer
  if (colons === 1) {
    const n = Number((/:\s*(\d+)/.exec(s) ?? [])[1])
    return Number.isFinite(n) && n >= 1 && n <= MAX_VERSE ? n : null
  }
  // No colon. Only a bare trailing chapter number is safe to read.
  return /\d\s*$/.test(s) && !/[-–—]/.test(s) ? 1 : null
}

/**
 * Splits "1 There is therefore… 2 For the law…" into verses.
 *
 * WHY THIS IS NOT A SIMPLE SPLIT. The passage arrives as continuous prose and
 * a bare number in it is far more often part of the sentence than a verse
 * marker — Genesis 14 says "318 of them", Acts 13 says "about 450 years". The
 * old rule accepted the FIRST number it saw unconditionally and only then
 * demanded the count continue, so those two passages parsed as a single verse
 * 318 and a single verse 450. Every line after was tagged with a verse number
 * that does not exist, and no outline unit could ever match it.
 *
 * The rule now: markers must form a run that climbs by exactly one. A lone
 * number that never continues is prose. A run that starts where the reference
 * says the passage starts wins over a longer run that starts somewhere else.
 * Bracketed markers ("[7]") are unambiguous and are trusted on their own.
 *
 * When no run survives, every verse comes back with `num: null`. That is the
 * honest answer, not a failure — see `alignable` at the call site.
 */
export function parseVerses(raw: string, startVerse: number | null = null): Verse[] {
  const text = (raw ?? '').trim()
  if (!text) return []
  const unnumbered: Verse[] = [{ num: null, text }]

  type Mark = { num: number; at: number; end: number; bracketed: boolean }
  const marks: Mark[] = []
  /* Two shapes, deliberately held apart.
   *
   * A BRACKETED marker is self-delimiting, so it needs no whitespace on either
   * side. This matters on real text: the ESV emits "…to strengthen you—[12]
   * that is, that we may be…", where an em-dash runs straight into the marker.
   * Requiring a leading space there dropped [12], which broke the run at 11 and
   * silently threw away verses 12-32 of Romans 1 — the outline units for
   * "vv. 16-17" and "vv. 18-32" then lit nothing at all.
   *
   * A BARE number still needs whitespace on both sides, and that guard stays.
   * Loosening it is what let "318 of them" and "about 450 years" parse as verse
   * markers in the first place. */
  const re = /\[(\d+)\]\s*|(?:^|\s)(\d+)\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const num = Number(m[1] ?? m[2])
    if (!Number.isFinite(num) || num < 1 || num > MAX_VERSE) continue
    marks.push({ num, at: m.index, end: m.index + m[0].length, bracketed: m[1] !== undefined })
  }
  if (!marks.length) return unnumbered

  // Bracketed markers are a deliberate typographic convention. If any are
  // present, they are the verse numbers and nothing else competes.
  const bracketed = marks.filter(k => k.bracketed)
  const pool = bracketed.length ? bracketed : marks

  // Every maximal run that climbs by exactly one.
  const runs: Mark[][] = []
  for (const k of pool) {
    const last = runs[runs.length - 1]
    if (last && k.num === last[last.length - 1].num + 1) last.push(k)
    else runs.push([k])
  }

  // Prefer the run that starts where the reference says the passage starts;
  // otherwise the longest run. A run of one is only trusted when the reference
  // vouches for it — otherwise it is prose, and 318 is not a verse.
  let best: Mark[] | null = null
  if (startVerse !== null) best = runs.find(r => r[0].num === startVerse) ?? null
  if (!best) {
    for (const r of runs) if (!best || r.length > best.length) best = r
    if (!best || (best.length < 2 && !bracketed.length)) return unnumbered
  }

  const out: Verse[] = []
  let curNum: number | null = null
  let cursor = 0
  for (const k of best) {
    const body = text.slice(cursor, k.at).trim()
    if (body) out.push({ num: curNum, text: body })
    curNum = k.num
    cursor = k.end
  }
  const tail = text.slice(cursor).trim()
  if (tail) out.push({ num: curNum, text: tail })
  return out.length ? out : unnumbered
}

/**
 * The verse numbers a unit reference covers. Handles "Romans 8:1-2", "8:1-4",
 * "vv. 1-2", "v. 3" and a bare "1-2". A chapter-only reference resolves to
 * nothing rather than guessing, so a click never lights up the wrong line.
 *
 * Checked against every ref form in the cache — "v. 8", "vv. 1-7", "vv. 18-32",
 * "vv.24-32", "4:10-13", "1:1-7" — plus en-dash and em-dash separators. The
 * cache was not the whole story: a live generation emitted "v. 8a" and
 * "vv. 8b-9", forms no cached document contained, and the sub-verse letter cut
 * the range short. Handled below. The main reason clicking did nothing was
 * still parseVerses; see above.
 *
 * A ref that names no verse — a whole chapter, or a one-chapter book written as
 * "2 John 1-6" where the numbers could be chapters — deliberately resolves to
 * nothing. Unit refs carry "vv."; this shape only shows up at passage level.
 */
export function versesInRef(ref: string): Set<number> {
  const out = new Set<number>()
  /* Sub-verse letters are dropped first. The model really does emit "v. 8a" and
   * "vv. 8b-9" when a verse breaks mid-sentence, and the letter used to
   * terminate the number scan: "vv. 8b-9" resolved to {8} and verse 9 belonged
   * to no unit at all, which made the split view refuse to split and fall back
   * to one block. A verse part still lives on the same numbered line, so 8a and
   * 8b both light verse 8 — the smallest thing the rendered text can mark. */
  const s = (ref ?? '').trim().replace(/(\d)[a-d]\b/gi, '$1')
  if (!s) return out

  let tail = ''
  if (s.includes(':')) {
    // A unit that crosses a chapter ("8:39-9:2") has no honest answer here. The
    // verse numbers rendered above are flat and restart at each chapter, so the
    // old read-after-the-last-colon lit verse 2 — a real line, the wrong one.
    // Same rule as a chapter-only ref: light nothing rather than light wrong.
    if ((s.match(/:/g) ?? []).length > 1) return out
    tail = s.slice(s.lastIndexOf(':') + 1)
  }
  else {
    const vv = /\bvv?\.?\s*([\d\s,\-–—]+)/i.exec(s)
    if (vv) tail = vv[1]
    else if (/^[\d\s,\-–—]+$/.test(s)) tail = s
  }
  if (!tail.trim()) return out

  const re = /(\d+)\s*(?:[-–—]\s*(\d+))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tail)) !== null) {
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    for (let i = a; i <= b && i - a < 200; i += 1) out.add(i)
  }
  return out
}

/* ── the shape of the text ─────────────────────────────────────────────────── *
 * The headline feature. A reader who has never been shown a passage's structure
 * cannot see it on their own; this is where they see it. The `logic` field is
 * the link INTO a unit, so it renders between units, on the spine.
 */

/* The contract calls `logic` a one-line field, so this was built as a one-word
   chip. The engine does not write one word: every logic value in the stored
   corpus is a full sentence, 96 to 133 characters. In a nowrap uppercase 7px
   chip the 133-character one measured 704px inside a 692px column — it ran off
   the right edge of the page and squeezed the trailing rule to zero width.
   Short values still get the chip; long ones become readable prose. */
const SHORT_LOGIC = 28

function LogicLink({ logic }: { logic: string }) {
  const value = logic.trim()

  if (value.length <= SHORT_LOGIC) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '2px 0 2px 0', paddingLeft: 3 }}>
        <div style={{ width: 1, height: 16, background: BASE.borderGold, flexShrink: 0 }} />
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.16em',
          color: BASE.gold, textTransform: 'uppercase', opacity: 0.85,
          border: `1px solid ${BASE.borderGold}`, borderRadius: 2,
          padding: '2px 8px', background: BASE.goldDim, whiteSpace: 'nowrap',
        }}>
          {value}
        </span>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${BASE.borderGold}, transparent)` }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 9, margin: '6px 0 6px 0', paddingLeft: 3 }}>
      <div style={{ width: 1, alignSelf: 'stretch', background: BASE.borderGold, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1, padding: '2px 0 4px 0' }}>
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.18em',
          color: BASE.steel, textTransform: 'uppercase', marginRight: 9,
        }}>
          Joined by
        </span>
        <span style={{
          fontFamily: 'Crimson Pro, serif', fontSize: 14.5, lineHeight: 1.6, color: BASE.khaki,
        }}>
          {value}
        </span>
      </div>
    </div>
  )
}

/**
 * The engine often repeats the reference at the front of the heading — 3 of the
 * 9 headings in the stored corpus read "v. 8 — the rescue is named…". The ref
 * already sits in its own column beside it, so the row rendered "01  v. 8
 * v. 8 — the rescue…". Strip the echo.
 */
function trimHeading(ref: string, heading: string): string {
  const h = (heading ?? '').trim()
  const r = (ref ?? '').trim()
  if (!r || !h.toLowerCase().startsWith(r.toLowerCase())) return h
  const rest = h.slice(r.length).replace(/^\s*[—–:-]\s*/, '')
  return rest || h
}

function OutlineUnit({
  unit, n, depth, activeRef, onSelect,
}: {
  unit: PlainReadOutlineUnit
  n: number
  depth: number
  activeRef: string | null
  onSelect: (ref: string) => void
}) {
  const active = activeRef === unit.ref
  const children = unit.children ?? []

  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 26 }}>
      {unit.logic && <LogicLink logic={unit.logic} />}

      {/* A real control: it takes focus, answers the keyboard, and reports its
          own pressed state. It selects whether or not the passage above can be
          marked — the selection is the unit, the highlight is only its echo. */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        onClick={() => onSelect(unit.ref)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(unit.ref) }
        }}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 12, cursor: 'pointer',
          padding: depth === 0 ? '10px 13px' : '7px 12px',
          marginBottom: 3,
          background: active ? BASE.goldMid : depth === 0 ? `${BASE.bgCard}66` : 'transparent',
          borderLeft: `2px solid ${active ? BASE.gold : depth === 0 ? BASE.border : BASE.borderDim}`,
          outline: 'none',
          boxShadow: active ? `inset 0 0 0 1px ${BASE.borderGold}` : 'none',
          transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
        }}
        onFocus={e => { (e.currentTarget as HTMLElement).style.boxShadow = `inset 0 0 0 1px ${BASE.gold}` }}
        onBlur={e => {
          (e.currentTarget as HTMLElement).style.boxShadow = active ? `inset 0 0 0 1px ${BASE.borderGold}` : 'none'
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = BASE.goldDim }}
        onMouseLeave={e => {
          if (!active) (e.currentTarget as HTMLElement).style.background = depth === 0 ? `${BASE.bgCard}66` : 'transparent'
        }}
      >
        {depth === 0 && (
          <span style={{
            fontFamily: 'JetBrains Mono', fontSize: 9, color: BASE.gold,
            opacity: active ? 1 : 0.6, flexShrink: 0, minWidth: 16,
          }}>
            {String(n).padStart(2, '0')}
          </span>
        )}
        {depth > 0 && (
          <span style={{ color: BASE.moss, fontSize: 10, flexShrink: 0, opacity: 0.8 }}>└</span>
        )}

        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: depth === 0 ? 8.5 : 8,
          letterSpacing: '0.08em', color: active ? BASE.gold : BASE.khaki,
          flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {unit.ref}
        </span>

        <span style={{
          fontFamily: depth === 0 ? 'Saira, sans-serif' : 'Crimson Pro, serif',
          fontSize: depth === 0 ? 14.5 : 15,
          letterSpacing: depth === 0 ? '0.03em' : '0',
          color: active ? BASE.bone : BASE.boneMid,
          lineHeight: 1.45,
        }}>
          {trimHeading(unit.ref, unit.heading)}
        </span>
      </div>

      {children.map((child, i) => (
        <OutlineUnit
          key={`${child.ref}-${i}`}
          unit={child}
          n={i + 1}
          depth={depth + 1}
          activeRef={activeRef}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

/* ── one of the six ────────────────────────────────────────────────────────── */

/**
 * WHETHER THIS STEP IS ON THE PAGE OR IS NOT ON THE PAGE. There is no third
 * state and there must not be one.
 *
 * The six steps land one at a time now, so this guard is what stands between a
 * reader and half a step. A step is three fields — the body, the thing he can
 * check for himself, and the move he keeps — and two of the three is not a
 * step, it is an interruption with a heading on it. So: all three present, all
 * three non-empty, or the step is simply not drawn and the page has not grown
 * yet. It grows a moment later, whole.
 *
 * This is deliberately stricter than the old `work[key] ? …` test. That test
 * was written when all six arrived together inside one validated object, where
 * an object existing and an object being complete were the same fact. They are
 * not the same fact while the document is being written.
 */
function stepReady(step: PlainReadStep | null | undefined): step is PlainReadStep {
  if (!step || typeof step !== 'object') return false
  const s = step as Partial<Record<keyof PlainReadStep, unknown>>
  return (['body', 'youCanCheck', 'theMove'] as const)
    .every(f => typeof s[f] === 'string' && (s[f] as string).trim().length > 0)
}

function WorkStep({ n, label, step }: { n: number; label: string; step: PlainReadStep }) {
  return (
    /* It fades in rather than popping in — 0.22s of opacity and NOTHING ELSE.
       No slide, no height animation, no reserved box collapsing: any of those
       moves the lines under it, and a step that arrives while the reader is two
       paragraphs above must not shove his line. Opacity changes no geometry, so
       the layout is identical on the first frame and the last. It reads as a
       paragraph being written, which is what it is. A step already on the page
       when the validated document swaps in does not re-animate: same component,
       same key, so React reconciles rather than remounts. */
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{ marginBottom: 34 }}
    >
      {/* number + label */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 10, color: BASE.gold,
          opacity: 0.75, flexShrink: 0, minWidth: 16,
        }}>
          {String(n).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'Saira, sans-serif', fontSize: 14, letterSpacing: '0.06em',
          color: BASE.bone, textTransform: 'uppercase',
        }}>
          {label}
        </span>
      </div>

      <div style={{ paddingLeft: 28, borderLeft: `1px solid ${BASE.borderDim}`, marginLeft: 7 }}>
        {/* Glossed. `youCanCheck` and `theMove` below are NOT — they are the
            two lines the reader acts on, and a term that opens under the
            finger there would interrupt the one instruction in the step. */}
        <Prose><GlossedText text={step.body} /></Prose>

        {/* Check it yourself — deliberately the loudest thing in the step. It is
            the only line the reader can falsify without trusting us. */}
        <div style={{
          background: BASE.goldDim,
          borderLeft: `2px solid ${BASE.gold}`,
          padding: '11px 14px', marginBottom: 12,
        }}>
          <MonoLabel color={BASE.gold}>Check it yourself</MonoLabel>
          <div style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 15.5, lineHeight: 1.65,
            color: BASE.bone,
          }}>
            {step.youCanCheck}
          </div>
        </div>

        {/* The move — the part that outlives this passage */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ color: BASE.moss, fontSize: 12, flexShrink: 0 }}>↳</span>
          <div>
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.16em',
              color: BASE.moss, textTransform: 'uppercase', marginRight: 8,
            }}>
              The move
            </span>
            <span style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 15, lineHeight: 1.6,
              color: BASE.khaki, fontStyle: 'italic',
            }}>
              {step.theMove}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ── study tools ───────────────────────────────────────────────────────────── *
 * Every study surface the pastor view has, kept for the reader: the map, the
 * lineage, the kings, the monarchy timeline, the tabernacle/temple floor plans,
 * parallel translations, the cross-reference field, the cultural notes. Nothing
 * here is preaching apparatus, so nothing here is cut.
 *
 * A PASSAGE-SCOPED tool with no data for this passage is not listed at all — the
 * map, the cross-reference field and the cultural notes come and go with the
 * analysis, so there is no empty box and no dead button. The lineage, the kings,
 * the timeline and the temple plans are REFERENCE works: they are always full,
 * they do not depend on the passage, and they are always listed. Each panel
 * mounts only when the reader opens it, so the document never waits on one.
 */

type ToolId = 'map' | 'lineage' | 'kings' | 'monarchy' | 'parallels' | 'crossrefs' | 'culture' | 'temple' | 'ask' | 'group'

interface Tool { id: ToolId; icon: string; label: string; title: string }

function StudyTools({
  analysis, apiKey, esvKey, onLoadRef, onOpenGroupGuide, doc,
}: {
  analysis: PhrasingAnalysis
  apiKey: string
  esvKey?: string
  onLoadRef?: (ref: string) => void
  onOpenGroupGuide?: () => void
  /** Null while the reading is still running. The ask tile waits on it. */
  doc: PlainReadDoc | null
}) {
  const [open, setOpen] = useState<ToolId | null>(null)
  /* ASK is held in its own state rather than in `open`. The other tools cover
     the whole canvas; the ask dock sits beside the rail and leaves the document
     visible, so the two are genuinely different modes and sharing one variable
     would mean closing one to open the other. */
  const [askOpen, setAskOpen] = useState(false)
  const [size, setSize] = useState({ w: 900, h: 560 })
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open || !bodyRef.current) return
    const el = bodyRef.current
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setSize({ w: Math.max(320, e.contentRect.width), h: Math.max(240, e.contentRect.height) })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  const geoRefs = ((analysis as any).geoReferences ?? []) as { place: string; verses: string[]; significance: string }[]
  const culturalNotes = analysis.culturalNotes ?? []

  /* Whether the ask bridge exists in this build at all. Read once, at rail
     construction, so the rail's height is fixed for the whole session — a rail
     that grows a tile partway through a session is a visible twitch on camera,
     and this answer cannot change while the app is running. A build without
     the bridge lists no ask tile rather than listing a dead one. */
  const hasAskBridge = useMemo(
    () => typeof (window as unknown as { electronAPI?: { plainAsk?: unknown } })
      .electronAPI?.plainAsk === 'function',
    []
  )

  const tools = useMemo<Tool[]>(() => {
    const list: Tool[] = []
    /* ASK leads the rail. It is the one tile that is about the passage the
       reader is actually looking at; everything under it is reference. */
    if (hasAskBridge && apiKey) {
      list.push({ id: 'ask', icon: ASK_ICON, label: ASK_TILE_LABEL, title: ASK_LABEL })
    }
    if (onOpenGroupGuide) {
      list.push({
        id: 'group',
        icon: '◫',
        label: 'GUIDE',
        title: 'Build a COVENANT small-group guide from this reading',
      })
    }
    if (geoRefs.length) list.push({ id: 'map', icon: '⌖', label: 'MAP', title: 'Where this happened' })
    list.push({ id: 'parallels', icon: '‖', label: 'VERSIONS', title: 'The same verses in other translations' })
    if (apiKey) list.push({ id: 'crossrefs', icon: '⌥', label: 'LINKS', title: 'Where else the Bible says this' })
    list.push({ id: 'lineage', icon: '⚯', label: 'LINEAGE', title: 'Who came from whom' })
    list.push({ id: 'kings', icon: '♛', label: 'KINGS', title: 'The kings of Israel and Judah' })
    /* ◷ U+25F7, not ⌛ U+231B. U+231B carries Emoji_Presentation=Yes, so macOS
       resolves it through Apple Color Emoji and paints it in full colour while
       the other seven render as monochrome text glyphs — that was the odd one
       out. Every codepoint in this rail was checked: ⌖ U+2316, ‖ U+2016,
       ⌥ U+2325, ⚯ U+26AF, ♛ U+265B, ⌂ U+2302, ⌘ U+2318 are all text-default
       and all carried by Apple Symbols. U+231B was the only emoji-default one.
       U+25F7 is text-default, is in no colour font, and is carried by Apple
       Symbols, Menlo, STIXGeneral and STIXTwoMath. No U+FE0E needed — a text
       variation selector on a text-default glyph is dead weight. */
    list.push({ id: 'monarchy', icon: '◷', label: 'TIMELINE', title: 'When this sits in history' })
    list.push({ id: 'temple', icon: '⌂', label: 'TEMPLE', title: 'The tabernacle and the two temples' })
    if (culturalNotes.length) {
      list.push({
        id: 'culture',
        icon: '⌘',
        label: 'CULTURE',
        title: 'Provisional cultural context — verify before teaching',
      })
    }
    return list
  }, [geoRefs.length, culturalNotes.length, apiKey, hasAskBridge, onOpenGroupGuide])

  if (!tools.length) return null

  const current = tools.find(t => t.id === open) ?? null

  return (
    <>
      {/* The rail. Small, out of the way, always the same seven places. */}
      <div style={{
        position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
        zIndex: 8, display: 'flex', flexDirection: 'column', gap: 1,
        background: `${BASE.bg}e8`, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        borderLeft: `1px solid ${BASE.borderGold}`,
        borderTop: `1px solid ${BASE.borderDim}`, borderBottom: `1px solid ${BASE.borderDim}`,
        padding: '7px 0',
      }}>
        {tools.map(t => {
          const isAsk = t.id === 'ask'
          const isGroup = t.id === 'group'
          const active = isAsk ? askOpen : !isGroup && open === t.id
          /* The ask tile is the only one that can be waiting on something. It
             stays in place and dims until the reading lands, rather than
             appearing late and moving every tile under it. */
          const waiting = (isAsk || isGroup) && !doc
          return (
            <button
              key={t.id}
              onClick={() => {
                if (waiting) return
                if (isAsk) { setAskOpen(o => !o); return }
                if (isGroup) {
                  setAskOpen(false)
                  setOpen(null)
                  onOpenGroupGuide?.()
                  return
                }
                setOpen(active ? null : t.id)
              }}
              disabled={waiting}
              title={waiting ? 'Opens when the reading lands' : t.title}
              style={{
                /* Up ~15% from 52/7/13/5.8. Enough to land under a finger and
                   read at a glance; not enough to start crowding the document,
                   which still owns the middle of the canvas. */
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                width: 60, padding: '8px 0', cursor: waiting ? 'default' : 'pointer',
                background: active ? BASE.goldMid : 'transparent',
                border: 'none', borderRight: `2px solid ${active ? BASE.gold : 'transparent'}`,
                color: active ? BASE.gold : BASE.steel, transition: 'all 0.15s',
                opacity: waiting ? 0.35 : 1,
              }}
              onMouseEnter={e => { if (!waiting) (e.currentTarget as HTMLElement).style.color = BASE.gold }}
              onMouseLeave={e => { if (!waiting) (e.currentTarget as HTMLElement).style.color = active ? BASE.gold : BASE.steel }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{t.icon}</span>
              {/* 7.5px, matching the mono labels the rest of this document uses.
                  6.7 was under the floor for the reader this mode is for, and
                  the longest label (VERSIONS) still measures ~43px inside the
                  60px tile, so nothing wraps. */}
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7.5, letterSpacing: '0.12em' }}>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── ASK THE OPERATOR ───────────────────────────────────────────────── *
             Docked to the LEFT of the rail rather than over the canvas, so the
             document stays readable while a question is being asked about it,
             and so the rail stays live: from an open question it is one click
             to the map and one click back, with the conversation still there.
             The dock is absolutely positioned, so nothing in the document
             reflows when it opens or closes.                                  */}
      <AnimatePresence>
        {askOpen && (
          <AskPanel
            key="ask"
            doc={doc}
            analysis={analysis}
            apiKey={apiKey}
            reference={analysis.reference}
            onClose={() => setAskOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 20,
              background: `${BASE.bg}f4`, backdropFilter: 'blur(26px)', WebkitBackdropFilter: 'blur(26px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: `1px solid ${BASE.borderGold}`,
            }}>
              <div>
                <div style={{
                  fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.2em',
                  color: BASE.gold, marginBottom: 4,
                }}>
                  {current.label}
                </div>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 17, color: BASE.bone }}>
                  {current.title}
                </div>
              </div>
              <button onClick={() => setOpen(null)} style={{
                width: 28, height: 28, border: `1px solid ${BASE.borderDim}`,
                background: 'transparent', color: BASE.steel, cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>×</button>
            </div>

            <div ref={bodyRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'auto' }}>
              <Suspense fallback={null}>
                {current.id === 'map' && (
                  <TopoMap geoReferences={geoRefs as any} width={size.w} height={size.h} />
                )}
                {current.id === 'parallels' && (
                  <ParallelPanel reference={analysis.reference} esvKey={esvKey} />
                )}
                {current.id === 'crossrefs' && (
                  <CrossRefArcs
                    reference={analysis.reference}
                    mainTheme={analysis.mainTheme}
                    biblicalThemes={analysis.canonicalContext?.biblicalThemes}
                    apiKey={apiKey}
                    onLoadRef={onLoadRef}
                  />
                )}
                {current.id === 'lineage' && <LineageViewer width={size.w} height={size.h} />}
                {current.id === 'kings'   && <KingsList width={size.w} height={size.h} />}
                {current.id === 'temple'  && <WorshipStructure width={size.w} height={size.h} />}
                {current.id === 'monarchy' && (
                  <MonarchyCard reference={analysis.reference} width={size.w} height={size.h} />
                )}
                {current.id === 'culture' && (
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{
                      fontFamily: 'Saira, sans-serif', fontSize: 12, fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: BASE.gold, background: BASE.goldDim,
                      border: `1px solid ${BASE.borderGold}`,
                      padding: '9px 12px', marginBottom: 12,
                    }}>
                      Provisional context — verify before teaching
                    </div>
                    <CulturalNotesPanel
                      notes={culturalNotes}
                      selectedPhraseId={null}
                      onSelectPhrase={() => {}}
                    />
                  </div>
                )}
              </Suspense>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/* ── states ────────────────────────────────────────────────────────────────── */

function Shell({
  children, scrollRef,
}: {
  children: ReactNode
  /** The scroller itself, so the passage can be held still — see the pin. */
  scrollRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <motion.div
      className="plain-read-shell"
      key="plain-read"
      ref={scrollRef}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ position: 'absolute', inset: 0, overflowY: 'auto', zIndex: 5 }}
    >
      <div className="plain-read-inner" style={{ maxWidth: 780, margin: '0 auto', padding: '34px 44px 120px' }}>
        {children}
      </div>
    </motion.div>
  )
}

/**
 * The run failed, said once.
 *
 * Lifted out of the document body so the SAME notice can stand alone on an
 * empty screen or sit at the top of a document that had already partly landed
 * when the stream died. Nothing about it changes between the two — same
 * headline, same detail, same buttons — because it is the same failure. Only
 * where it sits changes, and that is decided by whether there is any reading on
 * screen worth keeping.
 */
function ErrorNotice({
  error, onRetry, onOpenSettings,
}: {
  error: FriendlyError
  onRetry?: () => void
  onOpenSettings?: () => void
}) {
  return (
    <div style={{
      border: `1px solid ${BASE.red}55`, padding: '22px 26px',
      background: `${BASE.bgCard}aa`,
    }}>
      <MonoLabel color={BASE.red}>{error.headline}</MonoLabel>
      <Prose dim>{error.detail}</Prose>
      {error.link && (
        <div style={{
          marginTop: 10, marginBottom: 4, fontFamily: 'JetBrains Mono',
          fontSize: 10, letterSpacing: '0.06em', color: BASE.gold,
        }}>{error.link}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onRetry && (
          <button onClick={onRetry} style={{
            background: 'transparent', border: `1px solid ${BASE.red}55`,
            color: BASE.red, padding: '6px 20px', cursor: 'pointer',
            fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.14em',
          }}>[ TRY AGAIN ]</button>
        )}
        {onOpenSettings && (
          <button onClick={onOpenSettings} style={{
            background: `${BASE.gold}10`, border: `1px solid ${BASE.borderGold}`,
            color: BASE.gold, padding: '6px 20px', cursor: 'pointer',
            fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.12em',
          }}>[ CHECK API SETTINGS ]</button>
        )}
      </div>
    </div>
  )
}

/**
 * The reader view: the document, plus the study rail beside it.
 *
 * The rail renders as soon as an analysis exists — it does not wait on the
 * reading, and the reading does not wait on it.
 */
export function PlainRead(props: Props) {
  const { analysis, apiKey, esvKey, onLoadRef, onOpenGroupGuide, doc } = props
  return (
    <>
      <PlainReadDocument {...props} />
      {analysis && (
        <StudyTools
          analysis={analysis}
          apiKey={apiKey ?? ''}
          esvKey={esvKey}
          onLoadRef={onLoadRef}
          onOpenGroupGuide={onOpenGroupGuide}
          /* ASK needs the finished reading to ask against. The rail renders
             before the reading lands, so the tile holds its place and waits. */
          doc={doc}
        />
      )}
    </>
  )
}

export function PlainReadDocument({
  doc: finalDoc,
  partial = null,
  loading,
  error,
  passageText,
  reference,
  onRetry,
  onOpenSettings,
  onWordClick,
  analyzing = false,
  progressStreamId = null,
}: Props) {
  /** Which outline unit is lit. One selection, shared by the split passage and
      the outline list below it — clicking either lights both. */
  const [activeUnit, setActiveUnit] = useState<string | null>(null)
  const selectUnit = (ref: string) => setActiveUnit(cur => (cur === ref ? null : ref))

  /* ── WHAT IS ON SCREEN RIGHT NOW ─────────────────────────────────────────
     One object for every section below to read, so not a single one of them
     has to know whether the reading is still being written.

     THE FINAL DOCUMENT WINS, WHOLESALE AND SILENTLY. It is the validated one —
     validate.js ran on the complete document before it existed, and the claim
     check may already have corrected it. Where a streamed block and the final
     document disagree, the final document is simply right, and the reader is
     told nothing: no badge, no flash, no "updated" tick.

     Typed as a Partial because that is what it honestly is for most of the run.
     Every section below already reads through `doc?.` and guards on its own
     field, which is what makes a document that arrives in pieces paint in
     pieces with no further change down there. */
  const doc: Partial<PlainReadDoc> | null = finalDoc ?? partial

  /* ── THE DOCUMENT ARRIVES IN PIECES ──────────────────────────────────────
     It always did; the reader was simply not shown any of it until the last
     piece landed. The passage text is in hand about a second after SEND IT —
     it is what gets SENT — and the reading itself takes minutes. So `pending`
     does not gate the view any more. It only decides which parts of the
     document exist yet, and which true sentence sits above the passage.

     No section below reads this flag to decide whether to render. Every one of
     them is guarded on ITS OWN field, so a document that fills in field by
     field paints section by section — which is what happens the moment the
     engine hands back anything less than the whole thing at once.

     ASKED OF THE FINAL DOCUMENT, NOT OF WHAT IS ON SCREEN. Sections now land as
     they are written, so `doc` goes truthy seconds in, while most of the reading
     is still being composed. If the wait were measured from that, the status
     line would go quiet and the rule would stop sweeping while the page was
     still visibly filling — the app claiming to be finished over a document that
     is not. The wait ends when the validated document lands. Nothing else. */
  const pending = !finalDoc && !error

  /* When THIS wait started. Restarted when a wait BEGINS, so a retry counts
     its own wait rather than continuing the last one's, and again whenever a
     new run replaces this one. */
  const [waitStartedAt, setWaitStartedAt] = useState(() => Date.now())
  const wasPending = useRef(true)
  useEffect(() => {
    if (pending && !wasPending.current) setWaitStartedAt(Date.now())
    wasPending.current = pending
  }, [pending])
  useEffect(() => { setWaitStartedAt(Date.now()) }, [reference, progressStreamId])

  /* ── real progress, from the process that is actually doing the work ─────
     Nothing here is simulated and nothing is on a timer. If the main process
     stops reporting, the line stops changing and the clock keeps counting —
     which is the honest picture of a run that has gone quiet. */
  const [stage, setStage] = useState<string | null>(null)
  useEffect(() => { setStage(null) }, [reference, progressStreamId])
  useEffect(() => {
    const api = (window as unknown as {
      electronAPI?: {
        onAnalysisProgress?: (cb: (d: AnalysisProgress) => void) => (() => void) | void
      }
    }).electronAPI
    if (typeof api?.onAnalysisProgress !== 'function') return
    const off = api.onAnalysisProgress(d => {
      if (!d || typeof d.stage !== 'string') return
      // A message from a run the reader walked away from is not this run's news.
      if (progressStreamId && d.streamId && d.streamId !== progressStreamId) return
      setStage(d.stage)
    })
    return () => { if (typeof off === 'function') off() }
  }, [progressStreamId])

  /* The analysis half reports stages. The reading half does not, so the only
     true thing to say about it is that it is running. */
  const waitLine = !pending ? null : analyzing ? stageLabel(stage) : WRITING_LABEL

  /* Whether either half of the run is actually in flight — the analysis call
     (`analyzing`) or the reading call (`loading`). The status line above is
     driven by `pending` rather than by this, on purpose: the two calls hand off
     to each other across a React commit, and a line computed from "is a call
     open right this instant" blinks off for the frame in between. This is used
     where the blink cannot happen and the question is different: whether to
     claim a wait at all when there is nothing whatsoever on screen. */
  const running = analyzing || loading

  /* ── the passage does not move when the rest of the document lands ───────
     The briefing has to render ABOVE the passage — a reader who does not know
     what was pressing on the first hearers reads their own pressure in and
     never notices — and it lands minutes after the passage is already on
     screen and already being read out loud.

     Rather than guess at a placeholder height and be wrong by whatever the
     model wrote, the passage's own offset is measured on the last frame before
     the document lands and again on the first frame after, and the scroller is
     moved by the difference. The passage ends up on the same pixel row it was
     already on.

     It pins only when the reader has actually scrolled. Parked at the top with
     the whole document arriving at once, the reveal IS the event and the page
     should lay itself out from the top like a page.

     IT RUNS ON EVERY BLOCK NOW, NOT JUST THE FIRST. It used to fire once, on the
     null → document transition, because that was the only moment the page ever
     changed height above the passage. With the reading streaming in there are
     several such moments — the widening notice, the briefing, and the outline,
     which swaps the passage from one whole block to the split-by-unit view. Each
     one is measured and corrected the same way, so a reader mid-sentence stays
     on the same pixel row however many times the page grows under him. When
     nothing above the passage moved the delta is zero and this does nothing. */
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const passageRef = useRef<HTMLDivElement | null>(null)
  const passageTop = useRef<number | null>(null)

  /* Declared FIRST so it wins the landing frame: effects fire in declaration
     order within one commit, and the recorder below would otherwise overwrite
     the pre-landing offset before this ever read it. */
  useLayoutEffect(() => {
    const el = passageRef.current
    const sc = scrollRef.current
    const before = passageTop.current
    if (!el || !sc || before === null || sc.scrollTop <= 0) return
    const delta = el.offsetTop - before
    if (delta) sc.scrollTop += delta
  }, [doc])

  /* The offset as it stands at the end of THIS commit, which is what the
     correction above compares against on the next one. Unconditional: while the
     document arrived in one piece there was only ever one comparison to set up,
     and now there is one per block. */
  useLayoutEffect(() => {
    if (passageRef.current) passageTop.current = passageRef.current.offsetTop
  })

  /* The reference is the anchor. Passage text arrives as continuous prose, so
     any bare number in it is a coin flip until something outside the prose says
     where the passage starts. */
  const startVerse = useMemo(
    () => refStartVerse(doc?.expandedReference ?? doc?.reference ?? reference),
    [doc?.expandedReference, doc?.reference, reference]
  )
  const verses = useMemo(
    () => parseVerses(passageText ?? '', startVerse),
    [passageText, startVerse]
  )
  const litVerses = useMemo(
    () => (activeUnit ? versesInRef(activeUnit) : new Set<number>()),
    [activeUnit]
  )

  /* Whether the split view below actually cut the passage. "The text has verse
     numbers" is NOT the same question: a chapter-crossing unit ref, a ref the
     model wrote as prose, or a unit that ends up with no verse all make the
     split refuse on text that is fully numbered. Asking the weaker question
     printed "click a unit to light it up above" directly over a block whose own
     note said the divisions could not be lined up. Ask the split itself. */
  const splitOk = useMemo(
    () => passageSplits(passageText ?? '', doc?.outline ?? null, startVerse),
    [passageText, doc?.outline, startVerse]
  )

  /* THE CENTRED SPINNER IS GONE. It used to own this whole function for the
     length of the run: no passage, no reference, no document — one line of
     copy and a sweeping bar for two to three minutes, which is a stretch of
     time nobody sits through and which reads as a hung app on camera. The
     passage is available in about a second, so the passage is on screen in
     about a second, and the wait is spent reading rather than watching. What
     is left of the old state is the fallback below, for the one moment when
     there is genuinely nothing to show. */

  /* ── A RUN THAT DIED ──────────────────────────────────────────────────────
     Nothing of the reading in hand: the failure IS the screen, exactly as it
     always was.

     But a stream that dies halfway leaves real, finished blocks on the page,
     and a man who is part-way through reading them does not want them taken off
     him to be shown a box. So when there is a document — whole or partway — the
     same notice, in the same colours, with the same two buttons, is rendered at
     the top of it instead, and everything that landed stays landed. Same error
     path, same object, same copy; one placement decision, taken on whether
     there is anything to lose. */
  if (error && !doc) {
    return (
      <Shell>
        <div style={{ marginTop: 60 }}>
          <ErrorNotice error={error} onRetry={onRetry} onOpenSettings={onOpenSettings} />
        </div>
      </Shell>
    )
  }

  /* Nothing in hand at all. With the passage handed straight to this view the
     moment it is fetched, this state now lasts about as long as the Bible
     lookup — but a reader who opens a saved study whose text did not survive,
     or who lands here between two runs, still gets a true screen rather than a
     blank one. */
  if (!doc && !passageText) {
    /* No document, no passage, and nothing running: there is no wait to
       report, so report none. The old guard asked `pending`, which is true
       whenever a document is absent — including when nothing has been asked
       for — and printed "Writing the reading" over a run that did not exist. */
    if (!running) return null
    return (
      <Shell>
        <div style={{ paddingTop: 80, textAlign: 'center' }}>
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.24em',
            color: BASE.gold, marginBottom: 14,
          }}>
            READING {reference.toUpperCase()}
          </div>
          <div style={{ maxWidth: 300, margin: '26px auto 0', textAlign: 'left' }}>
            <PendingPulse label={waitLine ?? WRITING_LABEL} startedAt={waitStartedAt} />
          </div>
        </div>
      </Shell>
    )
  }

  /* Every one of these may legitimately be absent while the reading is still
     being written. Each section below is guarded on its own, so the document
     paints as much of itself as exists. */
  const meaning = doc?.meaning
  const work = doc?.work
  const application = doc?.application
  const differ = doc?.differ
  const mechanic = doc?.mechanic
  const step = application?.step
  const outline = doc?.outline ?? null

  /* Whether "How we got there" has anything to say yet.
     `work` now exists from the moment the FIRST of its six steps lands, so its
     mere existence stopped being the question. The question is whether there is
     a finished step — or the pathway note, which is a real block in its own
     right — to put under the heading. Until there is, the heading is not drawn,
     because a heading over empty space is a box that fills later and filling is
     a jump. */
  const workHasContent = work
    ? STEP_ORDER.some(s => stepReady(work[s.key])) || !!work.christPathway
    : false

  /* The split passage renders whenever there is an outline to cut along. When
     it renders it owns the passage AND owns saying why, if it had to leave the
     text whole — so the hint below stops short of repeating it. */
  const splitMounted = !!passageText && !!outline && (outline.units?.length ?? 0) > 0

  /* Whether the scripture above can be marked at all. The passage is fetched
     with verse numbers switched off, so most of the time it cannot — there is
     nothing in the prose to align an outline unit to. That is a fact about the
     text, not a broken control, and the reader gets told so plainly rather
     than being handed a control that promises a highlight and never gives one. */
  const alignable = splitMounted ? splitOk : verses.some(v => v.num !== null)

  // THE CLAIM CHECK IS INVISIBLE. doc.verification is deliberately not read
  // here and must never be rendered — no footer, no badge, no counter, no
  // "verifying" spinner. It already did its work upstream: flagged claims were
  // cut before this document existed, and anything it could not confirm is
  // already sitting in "What I couldn't answer". The reader waits on nothing
  // and reads no scorecard. The field stays on the object for logs.

  return (
    <Shell scrollRef={scrollRef}>
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 26 }}>
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.24em',
          color: BASE.gold, opacity: 0.8, marginBottom: 8,
        }}>
          PLAIN READ
        </div>
        <div style={{
          fontFamily: 'Crimson Pro, serif', fontSize: 34, color: BASE.bone,
          lineHeight: 1.1, letterSpacing: '-0.01em',
        }}>
          {doc?.expandedReference ?? doc?.reference ?? reference}
        </div>

        {/* ── THE STATUS LINE LIVES IN THE STRAPLINE ROW ──────────────────── *
               Not above the passage, not in a banner, not in a box of its own:
               in the row that already exists, at the size it already is. That
               is the whole trick. A status strip added while the run is going
               has to be taken away when it finishes, and taking it away moves
               the passage under a reader who is mid-sentence. This row is
               always there and is always one line tall, so the document is the
               same height before and after and NOTHING moves when the reading
               lands.

               No percentage and no estimate. The stage names come from the
               process doing the work; the clock only counts up.              */}
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.16em',
          color: waitLine ? BASE.gold : BASE.steel, marginTop: 8,
          textTransform: 'uppercase', display: 'flex', gap: 12, alignItems: 'baseline',
        }}>
          {waitLine ? (
            <>
              <span>{waitLine}</span>
              <Elapsed startedAt={waitStartedAt} />
            </>
          ) : (
            <span>
              FOR UNDERSTANDING AND OBEDIENCE{doc?.fromCache ? ' · SAVED READING' : ''}
            </span>
          )}
        </div>

        {/* The rule under the masthead does the moving, so nothing else has to.
            While the run is going a highlight sweeps along it; when the reading
            lands it settles back to the static gradient it always was. Same
            element, same one pixel of height, either way. */}
        <div style={{
          height: 1, marginTop: 16, position: 'relative', overflow: 'hidden',
          background: `linear-gradient(90deg, ${BASE.gold}88, ${BASE.gold}22, transparent)`,
        }}>
          {waitLine && (
            <motion.div
              animate={{ x: ['-110%', '360%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute', inset: 0, width: '30%',
                background: `linear-gradient(90deg, transparent, ${BASE.gold}, transparent)`,
              }}
            />
          )}
        </div>
      </div>

      {/* ── The run stopped, and there is already a reading on the page ─────
             The blocks below are finished and correct; only the ones after the
             break are missing. So they stay, and the failure is stated here
             once, above them. TRY AGAIN is the same button it always was. */}
      {error && (
        <div style={{ marginBottom: 30 }}>
          <ErrorNotice error={error} onRetry={onRetry} onOpenSettings={onOpenSettings} />
        </div>
      )}

      {/* ── Widening notice — FIRST, before any content. We never silently
             widen a verse and let the reader think they got what they asked
             for. ─────────────────────────────────────────────────────────── */}
      {doc?.expandReason && (
        <div style={{
          border: `1px solid ${BASE.borderGold}`, background: BASE.goldDim,
          padding: '13px 16px', marginBottom: 30,
        }}>
          <MonoLabel color={BASE.gold}>I widened the passage</MonoLabel>
          <div style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 15, lineHeight: 1.65, color: BASE.bone,
          }}>
            {doc.expandReason}
          </div>
        </div>
      )}

      {/* ── The setting, before the text. ─────────────────────────────────── *
             It sits above the passage because a reader who does not know what
             was pressing on the first hearers will read their own pressure into
             it and never notice. It renders with the document's first paint —
             it is not lazy and it never arrives late, because a card that
             appears after the fact pushes the passage down the page while
             somebody is reading it out loud.

             It follows the widening notice on purpose: the widening notice is
             about which verses are on screen at all, and that has to be settled
             before anything explains them.

             It is the one block that renders above the passage and cannot be
             there at first paint, because the model writes it. That is what the
             scroll pin above exists for. ──────────────────────────────────── */}
      <SituationCard situation={doc?.situation} />

      {passageText && onWordClick && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          margin: '0 0 16px', padding: '9px 12px',
          background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
          color: BASE.khaki,
        }}>
          <span style={{ color: BASE.gold, fontSize: 13, lineHeight: 1 }}>◎</span>
          <span style={{
            fontFamily: 'Saira, sans-serif', fontSize: 11, fontWeight: 650,
            letterSpacing: '0.05em',
          }}>
            Click any word for its original-language study and why it matters here.
          </span>
        </div>
      )}

      {/* ══ THE PASSAGE ═════════════════════════════════════════════════════ *
             THE FIRST THING ON SCREEN, AND THE POINT OF ALL OF THIS. It does
             not wait on the analysis and it does not wait on the reading. The
             text was fetched before either of them was asked for — it is what
             gets sent — so it paints about a second after SEND IT and the
             reader spends the run reading rather than watching a bar.

             One wrapper around both renderings, on purpose. It is the anchor
             the scroll pin measures, and it has to be the SAME element before
             and after the outline arrives, because the passage swaps from one
             whole block to the split-by-unit view underneath it. ─────────── */}
      <div ref={passageRef}>
      {/* ── Split into the units the outline names. Clicking a unit here and
             clicking it in the list below are the same click: both drive
             `activeUnit`, so both light both. ───────────────────────────── */}
      {passageText && splitMounted && outline && (
        <div style={{ marginBottom: 36 }}>
          <PassageUnits
            passageText={passageText}
            outline={outline}
            activeRef={activeUnit}
            onSelectRef={selectUnit}
            /* Same anchor the reader view parses with. Without it the split
               view refused a single-verse passage and told the reader the text
               arrived without verse numbers while verse 8 sat at the head of
               the line. */
            startVerse={startVerse}
            onWordClick={onWordClick}
          />
        </div>
      )}

      {/* ── No outline to cut along — the passage renders whole, verse-marked
             where the text carries verse numbers. ──────────────────────── */}
      {passageText && !splitMounted && (
        <div style={{
          borderLeft: `2px solid ${BASE.border}`, paddingLeft: 18, marginBottom: 36,
        }}>
          <div style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 17, lineHeight: 1.85,
            color: BASE.boneMid,
          }}>
            {verses.map((v, i) => {
              const lit = v.num !== null && litVerses.has(v.num)
              return (
                <span
                  key={i}
                  style={{
                    background: lit ? BASE.goldMid : 'transparent',
                    color: lit ? BASE.bone : BASE.boneMid,
                    boxShadow: lit ? `0 0 0 4px ${BASE.goldMid}` : 'none',
                    transition: 'background 0.2s, color 0.2s',
                  }}
                >
                  {v.num !== null && (
                    <sup style={{
                      fontFamily: 'JetBrains Mono', fontSize: 10.5, fontWeight: 700,
                      color: lit ? BASE.gold : BASE.steel, marginRight: 4,
                      verticalAlign: 'super',
                    }}>
                      {v.num}
                    </sup>
                  )}
                  <ScriptureWords
                    text={v.text}
                    verseText={v.text}
                    onWordClick={onWordClick}
                  />{' '}
                </span>
              )
            })}
          </div>
        </div>
      )}
      </div>

      {/* ── THE SHAPE OF THE TEXT ────────────────────────────────────────── *
             How the passage is built, and how each unit is joined to the one
             before it. This is the study apparatus — it exists so the reader
             can SEE the structure — and it is not a set of sermon points.    */}
      {outline && outline.units?.length > 0 && (
        <section style={{ marginBottom: 42 }}>
          <div style={{
            fontFamily: 'Saira, sans-serif', fontSize: 14, fontWeight: 750,
            letterSpacing: '0.07em', lineHeight: 1.35,
            color: BASE.bone, textTransform: 'uppercase',
            background: BASE.olive,
            border: `1px solid ${BASE.borderGold}`,
            borderLeft: `4px solid ${BASE.gold}`,
            padding: '10px 13px', marginBottom: 18,
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
          }}>
            <span>The shape of the text</span>
            {/* Say only what is true of THIS passage. When the text came
                through without verse numbers there is nothing to light, and
                promising a highlight that cannot happen is how a control ends
                up looking broken. The unit still selects — that is the part
                that is always true. */}
            {passageText && (
              <span style={{
                fontFamily: 'JetBrains Mono', fontSize: 8.5,
                letterSpacing: '0.08em', color: BASE.khaki,
                textTransform: 'uppercase', opacity: 0.9,
              }}>
                {activeUnit
                  ? 'click again to clear'
                  : alignable
                    ? 'click a unit to light it up above'
                    : splitMounted
                      ? 'click a unit to select it'
                      : 'this text arrived without verse numbers — units select, the passage above stays unmarked'}
              </span>
            )}
          </div>

          {outline.shape && (
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 17, lineHeight: 1.7,
              color: BASE.bone, marginBottom: 20,
              borderLeft: `2px solid ${BASE.gold}`, paddingLeft: 16,
            }}>
              {outline.shape}
            </div>
          )}

          <div>
            {outline.units.map((unit, i) => (
              <OutlineUnit
                key={`${unit.ref}-${i}`}
                unit={unit}
                n={i + 1}
                depth={0}
                activeRef={activeUnit}
                onSelect={selectUnit}
              />
            ))}
          </div>
        </section>
      )}

      {/* ══ THE READING ════════════════════════════════════════════════════ *
             Everything from here down is written by the engine, and every
             section below is guarded on its OWN field rather than on the
             document as a whole. Today they all land together, so all of them
             appear at once. The moment any of them lands earlier than the rest,
             it paints then — no further change here, and no section can be
             held hostage by a sibling that is still being written.

             NOTHING BELOW IS SHORTENED OR THINNED TO SAVE TIME. The wait being
             removed is waiting, not content: the document that arrives is the
             same document, at the same length and the same depth. ────────── */}

      {/* ── What the author meant ────────────────────────────────────────── */}
      {meaning && (
      <Section label="What the author meant">
        <Prose><GlossedText text={meaning.plain} /></Prose>

        {/* `level` was drawn as a small uppercase tag on the assumption it
            holds a label. The engine writes a paragraph: the stored Ephesians
            reading carries 309 characters here, and at 7px in all caps that is
            three lines nobody can read. A tag when it is a tag, prose when it
            is prose. */}
        {meaning.level && (meaning.level.trim().length <= 48 ? (
          <div style={{
            display: 'inline-block', fontFamily: 'JetBrains Mono', fontSize: 7,
            letterSpacing: '0.14em', color: BASE.khaki, textTransform: 'uppercase',
            border: `1px solid ${BASE.borderDim}`, padding: '2px 9px', marginBottom: 16,
          }}>
            {meaning.level}
          </div>
        ) : (
          <div style={{
            border: `1px solid ${BASE.borderDim}`, padding: '12px 15px', margin: '2px 0 18px',
          }}>
            <MonoLabel color={BASE.khaki}>Which level this is read at</MonoLabel>
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 15, lineHeight: 1.7, color: BASE.boneMid,
            }}>
              <GlossedText text={meaning.level} />
            </div>
          </div>
        ))}

        {meaning.misread && (
          <div style={{
            border: `1px solid ${BASE.border}`, background: `${BASE.bgCard}88`,
            padding: '15px 18px', margin: '6px 0 20px',
          }}>
            <MonoLabel color={BASE.khaki}>The common misread</MonoLabel>
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 16, lineHeight: 1.7,
              color: BASE.bone, fontStyle: 'italic', marginBottom: 12,
            }}>
              “{meaning.misread.claim}”
            </div>
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 15.5, lineHeight: 1.7,
              color: BASE.boneMid, marginBottom: 12,
            }}>
              <GlossedText text={meaning.misread.whyNot} />
            </div>
            <div style={{
              borderTop: `1px solid ${BASE.borderDim}`, paddingTop: 11,
              fontFamily: 'Crimson Pro, serif', fontSize: 15.5, lineHeight: 1.7,
              color: BASE.khaki,
            }}>
              <span style={{
                fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.14em',
                color: BASE.moss, textTransform: 'uppercase', marginRight: 8,
              }}>
                Bigger, not smaller
              </span>
              {meaning.misread.biggerNotSmaller}
            </div>
          </div>
        )}

        <div style={{
          borderLeft: `2px solid ${BASE.moss}`, paddingLeft: 16, marginTop: 18,
        }}>
          <MonoLabel color={BASE.moss}>What this reading assumes</MonoLabel>
          <div style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 15.5, lineHeight: 1.7, color: BASE.boneMid,
          }}>
            <GlossedText text={meaning.assumes} />
          </div>
        </div>
      </Section>
      )}

      {/* ── How we got there — the six steps ─────────────────────────────── *
             THE LONGEST STRETCH OF THE DOCUMENT, AND IT NOW ARRIVES IN SIX.
             This one heading used to cover eighteen fields that could not be
             shown until the last of them was written — which is most of the
             writing, and which is the ninety seconds where the page sat still.
             Each step is drawn the moment that step is finished, so the page
             keeps filling the whole way down.

             THE HEADING WAITS FOR THE FIRST STEP. It is not drawn over an empty
             space: a heading with nothing under it is a reserved box, the box
             fills later, and the fill is a jump. Nothing appears until there is
             something real to put under it, and then it appears together. */}
      {work && workHasContent && (
      <Section label="How we got there">
        {/* Per STEP, not per section. Six independent guards, so three finished
            steps are three steps on the page rather than nothing on the page —
            and, just as importantly, so a step that is only half written is not
            on the page at all. See stepReady. Order is taken from STEP_ORDER
            rather than from arrival, so the six always read in the order the
            engine reasons through them however they land. */}
        {STEP_ORDER.map((s, i) =>
          stepReady(work[s.key])
            ? <WorkStep key={s.key} n={i + 1} label={s.label} step={work[s.key]} />
            : null
        )}

        {work.christPathway && (
          <div style={{
            border: `1px solid ${BASE.borderGold}`, padding: '13px 16px', marginTop: 8,
          }}>
            <MonoLabel color={BASE.gold}>How this reaches Christ</MonoLabel>
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 15.5, lineHeight: 1.7, color: BASE.bone,
            }}>
              {work.christPathway.replace(/-/g, ' ')} — {PATHWAY_GLOSS[work.christPathway]}
            </div>
          </div>
        )}
      </Section>
      )}

      {/* ── The distance ─────────────────────────────────────────────────── */}
      {doc?.distance && (
      <Section label="The distance">
        <Prose><GlossedText text={doc.distance} /></Prose>
      </Section>
      )}

      {/* ── What to do with it ───────────────────────────────────────────── */}
      {application && step && (
      <Section label="What to do with it">
        <div style={{ marginBottom: 20 }}>
          <MonoLabel>To them first</MonoLabel>
          <Prose dim>{application.toThemFirst}</Prose>
        </div>

        <div style={{ marginBottom: 24 }}>
          <MonoLabel>Then to you</MonoLabel>
          <Prose>{application.thenToYou}</Prose>
        </div>

        {/* The one step. Its shape is set by the face the text works by. */}
        <div style={{
          border: `1px solid ${BASE.borderGold}`, background: BASE.goldDim,
          padding: '18px 20px',
        }}>
          <MonoLabel color={BASE.gold}>
            {step.kind === 'question' ? 'The question to carry' : 'The one step'}
          </MonoLabel>

          {step.kind === 'question' && step.question && (
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 18, lineHeight: 1.65,
              color: BASE.bone,
            }}>
              {step.question}
            </div>
          )}

          {(step.kind === 'plan' || step.kind === 'practice') && step.cue && step.action && (
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 18, lineHeight: 1.65,
              color: BASE.bone,
            }}>
              {composeCueAction(step.cue, step.action)}
            </div>
          )}

          {/* reorder keeps its two halves apart — the when/then form belongs to
              plan and practice, and stretching it here would misrepresent it. */}
          {step.kind === 'reorder' && step.cue && step.action && (
            <div>
              <div style={{
                fontFamily: 'Crimson Pro, serif', fontSize: 16.5, lineHeight: 1.65,
                color: BASE.boneMid, marginBottom: 10,
              }}>
                {step.cue}
              </div>
              <div style={{
                fontFamily: 'Crimson Pro, serif', fontSize: 18, lineHeight: 1.65,
                color: BASE.bone, borderTop: `1px solid ${BASE.borderDim}`, paddingTop: 10,
              }}>
                {step.action}
              </div>
            </div>
          )}

          <div style={{
            marginTop: 14, paddingTop: 10, borderTop: `1px solid ${BASE.borderDim}`,
            fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.14em',
            color: BASE.steel, textTransform: 'uppercase',
          }}>
            {application.dominantFace}
            {application.faces.length > 1 &&
              ` · also ${application.faces.filter(f => f !== application.dominantFace).join(', ')}`}
          </div>
        </div>

        {/* ── The psych caveat. Renders ONLY when a reviewed mechanic exists.
               While the clinical review gate is closed, mechanic is null and
               nothing here renders — that is the correct state, not a bug.
               `mechanic.sources` is deliberately NOT rendered: no person is
               named in a user-facing string in this product. ─────────────── */}
        {mechanic && (
          <div style={{
            marginTop: 20, border: `1px solid ${BASE.border}`,
            background: `${BASE.bgCard}88`, padding: '16px 18px',
          }}>
            <MonoLabel color={BASE.khaki}>Before you use that step</MonoLabel>
            <div style={{
              fontFamily: 'Courier Prime, monospace', fontSize: 13, lineHeight: 1.6,
              color: BASE.khaki, marginBottom: 12,
            }}>
              {mechanic.form}
            </div>
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 15, lineHeight: 1.7,
              color: BASE.boneMid, marginBottom: 10,
            }}>
              {mechanic.caveat}
            </div>
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 15, lineHeight: 1.7,
              color: BASE.boneMid, marginBottom: 10,
            }}>
              {mechanic.backfire}
            </div>
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 15, lineHeight: 1.7,
              color: BASE.khaki, fontStyle: 'italic',
            }}>
              {mechanic.deliveryCaveat}
            </div>
          </div>
        )}
      </Section>
      )}

      {/* ── What not to do with it — always, once the reading has it ─────── */}
      {doc?.restraint && (
      <Section label="What not to do with it">
        {doc.restraint.map((r, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 12,
          }}>
            <span style={{ color: BASE.red, fontSize: 12, flexShrink: 0, opacity: 0.8 }}>✕</span>
            <span style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 16, lineHeight: 1.7, color: BASE.boneMid,
            }}>
              <GlossedText text={r} />
            </span>
          </div>
        ))}
      </Section>
      )}

      {/* ── Where honest readers differ — only when there is a real dispute ─ */}
      {differ && (
        <Section label="Where honest readers differ">
          {differ.tier && (
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 15, lineHeight: 1.7,
              color: BASE.khaki, fontStyle: 'italic', marginBottom: 14,
              borderLeft: `2px solid ${BASE.moss}`, paddingLeft: 14,
            }}>
              {differ.tier === 'tertiary'
                ? 'Ranked tertiary here: Christians in one congregation hold both and stay in fellowship.'
                : 'Ranked secondary here: it shapes how churches organize, and Christians who differ on it still share one gospel.'}
            </div>
          )}
          {differ.summary && <Prose><GlossedText text={differ.summary} /></Prose>}
          {differ.views.map((view, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 12,
            }}>
              <span style={{
                fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.moss, flexShrink: 0,
              }}>
                {String.fromCharCode(65 + i)}
              </span>
              <span style={{
                fontFamily: 'Crimson Pro, serif', fontSize: 16, lineHeight: 1.7, color: BASE.boneMid,
              }}>
                {view}
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* ── What I couldn't answer — the section renders even when empty, but
             only once the reading exists to be empty. An empty box while the
             engine is still writing would say "nothing flagged" about a
             document that has not been written yet. ───────────────────────── */}
      {doc?.unknowns && (
      <Section label="What I couldn't answer">
        {doc.unknowns.length === 0 ? (
          <div style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 15.5, lineHeight: 1.7, color: BASE.steel,
          }}>
            Nothing flagged. That is not the same as nothing left to find.
          </div>
        ) : (
          doc.unknowns.map((u, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 12,
            }}>
              <span style={{ color: BASE.steel, fontSize: 12, flexShrink: 0 }}>?</span>
              <span style={{
                fontFamily: 'Crimson Pro, serif', fontSize: 16, lineHeight: 1.7, color: BASE.boneMid,
              }}>
                {u}
              </span>
            </div>
          ))
        )}
      </Section>
      )}

      {/* ── Handoff — always. Sensitive passages get the brighter fence. ──── */}
      {doc?.handoff && (
      <div style={{
        border: `1px solid ${doc.sensitive ? BASE.borderGold : BASE.border}`,
        background: doc.sensitive ? BASE.goldDim : `${BASE.bgCard}88`,
        padding: '18px 20px', marginTop: 8,
      }}>
        <MonoLabel color={doc.sensitive ? BASE.gold : BASE.khaki}>Take it to a person</MonoLabel>
        <div style={{
          fontFamily: 'Crimson Pro, serif', fontSize: 16, lineHeight: 1.75, color: BASE.bone,
        }}>
          {doc.handoff}
        </div>
      </div>
      )}

      {/* No verification footer, and no verification anything. See the note
          where doc.verification is deliberately not read — the checker is
          background machinery, and the reader sees its results, never its
          receipts. That holds harder now that the check runs AFTER the reader
          already has the document: when corrections land they are applied
          silently, and a step's wording changing under the reader is the
          accepted cost. Announcing it is not. */}
    </Shell>
  )
}
