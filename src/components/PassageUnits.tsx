import { useState, useMemo, useEffect } from 'react'
import type { JSX } from 'react'
import { BASE } from '../theme'
/* The parser lives in PlainRead.tsx and stays there. Both files need the same
   answer about where verse 3 starts, and two parsers would eventually give two
   answers. Both exports are function declarations, so the import cycle that
   appears once PlainRead mounts this component resolves without a hazard. */
import { parseVerses, versesInRef } from './PlainRead'
import type { PlainReadOutline, PlainReadOutlineUnit } from '../types/phrasing'

export interface PassageUnitsProps {
  passageText: string
  outline: PlainReadOutline
  /** Which unit is currently selected, or null. */
  activeRef: string | null
  /** Toggle selection. The parent owns the toggle; a click just reports the ref. */
  onSelectRef: (ref: string) => void
  /** Show the once-per-passage explainer. Default true. */
  teach?: boolean
  /**
   * The verse the reference says the passage starts on, from refStartVerse().
   *
   * WHY IT IS HERE. parseVerses will not trust a run of one bare number on its
   * own — "318 of them" is not verse 318. On a single-verse passage that is
   * exactly the wrong answer: "8 For by grace…" really does start at verse 8,
   * and without this hint the split refused and told the reader the text "came
   * through without verse numbers" while verse 8 sat in plain sight at the head
   * of the line. Pass the same anchor the reader view uses and both views give
   * the same answer.
   */
  startVerse?: number | null
  /** Open the original-language study for a word in its full verse context. */
  onWordClick?: (word: string, verseText: string) => void
}

/** Whatever parseVerses returns — declared once, over there. */
type Verse = ReturnType<typeof parseVerses>[number]

const TEACH_SEEN_KEY = 'plainread-units-teach-seen'

/* ── working out where each unit's text actually is ────────────────────────── *
 * A unit is only worth drawing if its verses can be found. Everything below is
 * about refusing to draw a split we cannot stand behind.
 */

/** Every verse number a unit covers, including anything its children cover. */
function coverageOf(unit: PlainReadOutlineUnit): Set<number> {
  const out = versesInRef(unit.ref)
  for (const child of unit.children ?? []) {
    for (const n of coverageOf(child)) out.add(n)
  }
  return out
}

/** A unit's own ref plus every descendant ref, so a child selection still lights the block. */
function refsOf(unit: PlainReadOutlineUnit): string[] {
  return [unit.ref, ...(unit.children ?? []).flatMap(refsOf)]
}

interface UnitBlock {
  unit: PlainReadOutlineUnit
  verses: Verse[]
}

type Split =
  | { kind: 'split'; blocks: UnitBlock[] }
  /** note === null means there was nothing to align in the first place. */
  | { kind: 'whole'; note: string | null }

const UNALIGNED_NOTE =
  'The divisions could not be lined up with this text, so the passage is left whole.'

/**
 * Cuts the passage along the outline, or refuses.
 *
 * It refuses when the text carries no verse numbers (parseVerses leaves num
 * null and every range test silently misses), when a verse belongs to no unit,
 * when a unit ends up with no verse, or when the units do not run in reading
 * order. Any of those would put the reader in front of a split that looks
 * authoritative and is wrong, which is worse than one block of prose.
 */
function splitPassage(
  passageText: string,
  outline: PlainReadOutline | null,
  startVerse: number | null = null,
): Split {
  const units = outline?.units ?? []
  const verses = parseVerses(passageText ?? '', startVerse)

  if (!verses.length) return { kind: 'whole', note: null }
  if (!units.length) return { kind: 'whole', note: null }

  if (!verses.some(v => v.num !== null)) {
    return {
      kind: 'whole',
      note: 'This text came through without verse numbers, so the divisions could not be lined up with it.',
    }
  }

  const sets = units.map(coverageOf)
  const owners: number[] = []

  for (const v of verses) {
    // parseVerses only ever produces a null number for a fragment ahead of the
    // first marker — a reference line or a heading. It belongs to unit one.
    if (v.num === null) { owners.push(0); continue }
    const owner = sets.findIndex(s => s.has(v.num as number))
    if (owner < 0) return { kind: 'whole', note: UNALIGNED_NOTE }
    owners.push(owner)
  }

  // Non-decreasing owners means each unit takes one unbroken run, in order.
  // Anything else would reorder or duplicate the passage on screen.
  for (let i = 1; i < owners.length; i += 1) {
    if (owners[i] < owners[i - 1]) return { kind: 'whole', note: UNALIGNED_NOTE }
  }

  const blocks: UnitBlock[] = units.map(unit => ({ unit, verses: [] }))
  owners.forEach((owner, i) => { blocks[owner].verses.push(verses[i]) })

  // An empty unit is a division we cannot show the reader. Show none of them.
  if (blocks.some(b => !b.verses.length)) return { kind: 'whole', note: UNALIGNED_NOTE }

  return { kind: 'split', blocks }
}

/**
 * Does this passage actually cut along this outline?
 *
 * The reader view asks before it prints "click a unit to light it up above".
 * Without this it was reading a weaker fact — "the text has verse numbers" —
 * and promising a highlight in the same breath as the block below said the
 * divisions could not be lined up. One answer, one place.
 */
export function passageSplits(
  passageText: string,
  outline: PlainReadOutline | null,
  startVerse: number | null = null,
): boolean {
  return splitPassage(passageText ?? '', outline, startVerse).kind === 'split'
}

/* ── pieces ────────────────────────────────────────────────────────────────── */

const WORD_PARTS = /([\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*)/gu
const WORD_ONLY = /^[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*$/u

/** Preserve the printed text while making each real word a study control. */
export function ScriptureWords({
  text,
  verseText,
  onWordClick,
}: {
  text: string
  verseText: string
  onWordClick?: (word: string, verseText: string) => void
}) {
  if (!onWordClick) return <>{text}</>

  return (
    <>
      {text.split(WORD_PARTS).map((part, index) => (
        WORD_ONLY.test(part) ? (
          <button
            key={`${part}-${index}`}
            type="button"
            title={`Study “${part}”`}
            aria-label={`Study “${part}”`}
            onClick={(event) => {
              event.stopPropagation()
              onWordClick(part, verseText)
            }}
            style={{
              display: 'inline', margin: 0, padding: 0,
              font: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit',
              color: 'inherit', background: 'transparent',
              border: 'none', borderBottom: `1px dotted ${BASE.borderGold}`,
              borderRadius: 1, cursor: 'pointer',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.color = BASE.gold
              event.currentTarget.style.background = BASE.goldDim
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color = 'inherit'
              event.currentTarget.style.background = 'transparent'
            }}
          >
            {part}
          </button>
        ) : <span key={`${part}-${index}`}>{part}</span>
      ))}
    </>
  )
}

/** The passage in the serif face, with visible verse numbers and study words. */
function Scripture({
  verses,
  lit,
  onWordClick,
}: {
  verses: Verse[]
  lit: boolean
  onWordClick?: (word: string, verseText: string) => void
}) {
  return (
    <div style={{
      fontFamily: 'Crimson Pro, serif', fontSize: 17, lineHeight: 1.85,
      color: lit ? BASE.bone : BASE.boneMid,
      letterSpacing: '0.005em', transition: 'color 0.18s',
    }}>
      {verses.map((v, i) => (
        <span key={i}>
          {v.num !== null && (
            <sup style={{
              fontFamily: 'JetBrains Mono', fontSize: 10.5, fontWeight: 700,
              color: lit ? BASE.gold : BASE.steel, marginRight: 4,
              verticalAlign: 'super', transition: 'color 0.18s',
            }}>
              {v.num}
            </sup>
          )}
          <ScriptureWords text={v.text} verseText={v.text} onWordClick={onWordClick} />{' '}
        </span>
      ))}
    </div>
  )
}

/**
 * The hinge between two units: how the text got from the one before to this
 * one.
 *
 * This was built as a one-word chip — "contrast", "ground", "result" — because
 * the contract calls `logic` a one-line field. The engine does not write one
 * word. Every logic value in the stored corpus is a full sentence, 96 to 133
 * characters, and a 133-character sentence in a nowrap uppercase 7px chip
 * measured 704px inside a 692px column: it ran past the edge of the page and
 * crushed the trailing rule to nothing.
 *
 * So the chip is now a label and the sentence is prose. A short value still
 * reads as the tag it was meant to be; a long one wraps and stays legible.
 */
const SHORT_LOGIC = 28   // at or under this, the value really is a tag

function Connective({ logic }: { logic: string }) {
  const value = logic.trim()
  const short = value.length <= SHORT_LOGIC

  return (
    <div style={{ display: 'flex', gap: 9, margin: '0 0 20px 0', paddingLeft: 2 }}>
      <span style={{ color: BASE.moss, fontSize: 11, lineHeight: 1.6, flexShrink: 0 }}>↓</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.18em',
          color: BASE.steel, textTransform: 'uppercase', marginRight: 9,
        }}>
          Joined by
        </span>
        {short ? (
          <span style={{
            fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.16em',
            color: BASE.gold, textTransform: 'uppercase', opacity: 0.9,
            border: `1px solid ${BASE.borderGold}`, borderRadius: 2,
            padding: '2px 8px', background: BASE.goldDim, whiteSpace: 'nowrap',
          }}>
            {value}
          </span>
        ) : (
          <span style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 14.5, lineHeight: 1.6,
            color: BASE.khaki,
          }}>
            {value}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * The engine often repeats the reference at the front of the heading — 3 of the
 * 9 headings in the stored corpus read "v. 8 — the rescue is named…". The ref
 * already has its own column beside it, so the row rendered "01  v. 8   v. 8 —
 * the rescue…" and the aria-label read the ref twice. Strip the echo.
 */
function trimHeading(ref: string, heading: string): string {
  const h = (heading ?? '').trim()
  const r = (ref ?? '').trim()
  if (!r || !h.toLowerCase().startsWith(r.toLowerCase())) return h
  const rest = h.slice(r.length).replace(/^\s*[—–:-]\s*/, '')
  return rest || h
}

/** One division: its range, its heading, its own lines of the passage. */
function UnitPanel({
  unit, n, verses, active, onSelect, onWordClick,
}: {
  unit: PlainReadOutlineUnit
  n: number
  verses: Verse[]
  active: boolean
  onSelect: () => void
  onWordClick?: (word: string, verseText: string) => void
}) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const heading = trimHeading(unit.ref, unit.heading)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '13px 18px 15px 20px',
        borderLeft: `2px solid ${active ? BASE.gold : BASE.border}`,
        background: active ? BASE.goldMid : hover ? BASE.goldDim : 'transparent',
        /* Inline styles cannot carry :focus-visible, so the ring is state-driven.
           Full-strength gold — a dim ring is the same as no ring. */
        outline: focus ? `1px solid ${BASE.gold}` : 'none',
        outlineOffset: 3,
        transition: 'background 0.18s, border-color 0.18s',
      }}
    >
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${unit.ref} — ${heading}`}
        onClick={onSelect}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: '100%', padding: 0, margin: '0 0 10px 0',
          display: 'flex', alignItems: 'baseline', gap: 12,
          flexWrap: 'wrap', textAlign: 'left', cursor: 'pointer',
          color: 'inherit', background: 'transparent', border: 'none',
        }}
      >
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 9, color: BASE.gold,
          opacity: active ? 1 : 0.55, flexShrink: 0, minWidth: 16,
        }}>
          {String(n).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 8.5, letterSpacing: '0.08em',
          color: active ? BASE.gold : BASE.khaki, flexShrink: 0, whiteSpace: 'nowrap',
          transition: 'color 0.18s',
        }}>
          {unit.ref}
        </span>
        <span style={{
          fontFamily: 'Saira, sans-serif', fontSize: 14.5, letterSpacing: '0.03em',
          color: active ? BASE.bone : BASE.boneMid, lineHeight: 1.45,
          transition: 'color 0.18s',
        }}>
          {heading}
        </span>
      </button>

      <Scripture verses={verses} lit={active} onWordClick={onWordClick} />
    </div>
  )
}

/**
 * The skill, once per passage. Not a note about this text — the thing a reader
 * takes to the next passage and to a paper Bible with no help at all.
 */
function WhyDivided() {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem(TEACH_SEEN_KEY) } catch { return true }
  })
  const [hover, setHover] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(TEACH_SEEN_KEY, '1') } catch { /* private mode — no memory, no harm */ }
  }, [])

  return (
    <div style={{ border: `1px solid ${BASE.border}`, marginBottom: 30 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', cursor: 'pointer', textAlign: 'left',
          background: open || hover ? BASE.goldDim : 'transparent',
          border: 'none', borderLeft: `2px solid ${BASE.gold}`,
          color: BASE.gold, transition: 'background 0.15s',
        }}
      >
        <span style={{ fontSize: 10, lineHeight: 1, width: 10, flexShrink: 0 }}>
          {open ? '▾' : '▸'}
        </span>
        <span style={{
          fontFamily: 'Saira, sans-serif', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          Why the text is divided here
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 16px 18px' }}>
          <p style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 16, lineHeight: 1.75,
            color: BASE.bone, margin: '12px 0 12px 0',
          }}>
            A natural division is a place where the text turns. Watch six things: who is
            speaking, who is being spoken to, the time, the place, the subject, and the mood
            of the verbs — statement, command, wish. When one of those changes,
            the author has moved.
          </p>
          <p style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 16, lineHeight: 1.75,
            color: BASE.boneMid, margin: '0 0 12px 0',
          }}>
            These divisions are not laid on top of the text. They are read off it. The turns
            are already in the grammar and the vocabulary, and the work is noticing them.
          </p>
          <p style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 16, lineHeight: 1.75,
            color: BASE.boneMid, margin: '0 0 14px 0',
          }}>
            Chapter and verse numbers are not the divisions. They were added centuries after
            these books were written, so a line could be found and cited. They land in the
            middle of an argument more often than you would guess. A chapter break is an
            address, not a seam.
          </p>
          <div style={{
            borderTop: `1px solid ${BASE.borderDim}`, paddingTop: 12,
            display: 'flex', gap: 9, alignItems: 'baseline',
          }}>
            <span style={{ color: BASE.moss, fontSize: 12, flexShrink: 0 }}>↳</span>
            <div>
              <span style={{
                fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.16em',
                color: BASE.moss, textTransform: 'uppercase', marginRight: 8,
              }}>
                The move
              </span>
              <span style={{
                fontFamily: 'Crimson Pro, serif', fontSize: 15.5, lineHeight: 1.65,
                color: BASE.khaki, fontStyle: 'italic',
              }}>
                Read the passage twice with a pen and mark every place the subject or the
                direction changes. Do it before you read anyone else's divisions, then
                compare. Where you disagree, go back and find which of the six moved.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** The passage left whole, with the reason it was left whole. */
function WholePassage(
  { passageText, note, startVerse, onWordClick }:
  {
    passageText: string
    note: string | null
    startVerse: number | null
    onWordClick?: (word: string, verseText: string) => void
  },
) {
  const verses = useMemo(() => parseVerses(passageText, startVerse), [passageText, startVerse])
  if (!verses.length) return null

  return (
    <div>
      {note && (
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.12em',
          color: BASE.steel, textTransform: 'uppercase', marginBottom: 10,
          lineHeight: 1.6,
        }}>
          {note}
        </div>
      )}
      <div style={{ borderLeft: `2px solid ${BASE.border}`, paddingLeft: 18 }}>
        <Scripture verses={verses} lit={false} onWordClick={onWordClick} />
      </div>
    </div>
  )
}

/* ── the component ─────────────────────────────────────────────────────────── */

/**
 * The passage, cut along its own divisions instead of poured out as one block.
 *
 * Each unit stands on its own with the text it covers, the hinge word between
 * units says how the text got from one to the next, and the space between them
 * is doing as much teaching as the words are.
 */
export function PassageUnits(props: PassageUnitsProps): JSX.Element {
  const {
    passageText,
    outline,
    activeRef,
    onSelectRef,
    teach = true,
    startVerse = null,
    onWordClick,
  } = props

  const split = useMemo(
    () => splitPassage(passageText, outline, startVerse),
    [passageText, outline, startVerse]
  )

  if (!(passageText ?? '').trim()) return <></>

  return (
    <div>
      {/* The explainer only stands over a passage that was actually divided.
          Printing "why the text is divided here" directly above a block whose
          own note says the divisions could not be lined up reads as a bug and
          teaches nothing the reader can see. */}
      {teach && split.kind === 'split' && <WhyDivided />}

      {split.kind === 'whole' ? (
        <WholePassage
          passageText={passageText}
          note={split.note}
          startVerse={startVerse}
          onWordClick={onWordClick}
        />
      ) : (
        split.blocks.map((block, i) => {
          const active = activeRef !== null && refsOf(block.unit).includes(activeRef)
          return (
            <div key={`${block.unit.ref}-${i}`} style={{ marginBottom: 38 }}>
              {/* The first unit has no logic and nothing before it to hinge on. */}
              {i > 0 && block.unit.logic && <Connective logic={block.unit.logic} />}
              <UnitPanel
                unit={block.unit}
                n={i + 1}
                verses={block.verses}
                active={active}
                onSelect={() => onSelectRef(block.unit.ref)}
                onWordClick={onWordClick}
              />
            </div>
          )
        })
      )}
    </div>
  )
}
