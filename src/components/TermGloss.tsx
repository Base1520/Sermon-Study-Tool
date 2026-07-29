/**
 * TermGloss.tsx — study vocabulary, explained where the reader hits it.
 *
 * PLAIN READ says things like "verses 1-7 are a formal greeting." That is the
 * right sentence and it is opaque to the reader the mode exists for. Stopping
 * the document to define it would bloat every reading, so the term is marked
 * instead: a dotted gold underline, one click, a short panel that answers "why
 * does this matter?" and gets out of the way.
 *
 * DROP-IN, ZERO SETUP
 *   <GlossedText text={step.explanation} />
 * No provider, no context, no store. Every instance owns its own popover, so a
 * page can hold as many as it likes.
 *
 * DESIGN NOTES
 * - Only the FIRST occurrence of a term inside one block is marked. Lighting up
 *   every "covenant" in a paragraph turns prose into a link farm, and the
 *   second one teaches the reader nothing the first did not.
 * - The panel is portaled to <body> and positioned fixed, so opening it can
 *   never shift the prose and no ancestor's overflow can clip it.
 * - The marker is text-decoration rather than a border, so it costs no layout
 *   in the line box either.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { CSSProperties, JSX } from 'react'
import { createPortal } from 'react-dom'
import { BASE } from '../theme'
import { findGlossTerms, getGloss } from '../data/studyGlossary'
import type { GlossEntry } from '../data/studyGlossary'

/* ── geometry ──────────────────────────────────────────────────────────────── */

const PANEL_W = 340
const EDGE = 12      // keep this far off every viewport edge
const GAP = 8        // between the term and the panel
const MIN_H = 160    // below this, a side of the term is not worth using

interface PanelPos {
  left: number
  top?: number
  bottom?: number
  width: number
  maxHeight: number
}

/**
 * Places the panel under the term, or above it when there is more room there.
 * Horizontally it is centred on the term and then clamped inside the viewport.
 *
 * When neither side of the term has usable height — a short window, or a term
 * sitting mid-screen in a small pane — the panel stops trying to hug the term
 * and becomes a side box pinned inside the viewport. It is always fully on
 * screen and it always scrolls internally rather than overflowing.
 */
function placePanel(rect: DOMRect): PanelPos {
  const vw = window.innerWidth
  const vh = window.innerHeight

  const width = Math.min(PANEL_W, Math.max(120, vw - EDGE * 2))
  const left = Math.max(EDGE, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - EDGE))

  const roomBelow = vh - rect.bottom - GAP - EDGE
  const roomAbove = rect.top - GAP - EDGE

  if (roomBelow >= MIN_H) return { left, top: rect.bottom + GAP, width, maxHeight: roomBelow }
  if (roomAbove >= MIN_H) return { left, bottom: vh - rect.top + GAP, width, maxHeight: roomAbove }

  // No usable room on either side: pin it inside the viewport instead.
  return { left, top: EDGE, width, maxHeight: Math.max(80, vh - EDGE * 2) }
}

/** Lets a scroll that did not actually move the term skip a re-render. */
function samePos(a: PanelPos | null, b: PanelPos): boolean {
  return a !== null &&
    a.left === b.left && a.top === b.top && a.bottom === b.bottom &&
    a.width === b.width && a.maxHeight === b.maxHeight
}

/* ── the panel ─────────────────────────────────────────────────────────────── */

interface PanelProps {
  entry: GlossEntry
  /** Set when the reader has followed a seeAlso chip away from the marked term. */
  origin: GlossEntry | null
  pos: PanelPos
  onSelect: (id: string) => void
  onBack: () => void
  onClose: () => void
  panelRef: React.RefObject<HTMLDivElement | null>
}

function GlossPanel({ entry, origin, pos, onSelect, onBack, onClose, panelRef }: PanelProps) {
  const related = (entry.seeAlso ?? [])
    .map(getGloss)
    .filter((e): e is GlossEntry => e !== null)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${entry.term} — study term`}
      tabIndex={-1}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        bottom: pos.bottom,
        width: pos.width,
        maxHeight: pos.maxHeight,
        // Padding and borders count inside the width, so the viewport clamp in
        // placePanel() is exact rather than 30px optimistic.
        boxSizing: 'border-box',
        overflowY: 'auto',
        zIndex: 4000,
        background: `${BASE.bgCard}f7`,
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: `1px solid ${BASE.border}`,
        borderTop: `1px solid ${BASE.gold}`,
        boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
        padding: '11px 14px 14px',
        outline: 'none',
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 7, letterSpacing: '0.2em',
            color: BASE.gold, textTransform: 'uppercase', marginBottom: 5,
          }}>
            Study term
          </div>
          <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 17, color: BASE.bone, lineHeight: 1.25 }}>
            {entry.term}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            flexShrink: 0, width: 22, height: 22, lineHeight: 1,
            border: `1px solid ${BASE.borderDim}`, background: 'transparent',
            color: BASE.steel, cursor: 'pointer', fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>

      {/* what it is */}
      <p style={{
        fontFamily: 'Crimson Pro, serif', fontSize: 15, lineHeight: 1.6,
        color: BASE.bone, margin: '10px 0 0 0',
      }}>
        {entry.short}
      </p>

      {/* why it matters — the reason this component exists */}
      <div style={{ borderTop: `1px solid ${BASE.borderDim}`, margin: '12px 0 10px 0' }} />
      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 7, letterSpacing: '0.18em',
        color: BASE.steel, textTransform: 'uppercase', marginBottom: 6,
      }}>
        Why it matters
      </div>
      <p style={{
        fontFamily: 'Crimson Pro, serif', fontSize: 14.5, lineHeight: 1.72,
        color: BASE.boneMid, margin: 0,
      }}>
        {entry.why}
      </p>

      {/* related terms */}
      {related.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 13 }}>
          {related.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 8, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: BASE.gold,
                background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
                borderRadius: 2, padding: '3px 7px', cursor: 'pointer',
                transition: 'background 0.14s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BASE.goldMid }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = BASE.goldDim }}
            >
              {r.term}
            </button>
          ))}
        </div>
      )}

      {/* a way back, so a chip is never a dead end */}
      {origin && (
        <button
          type="button"
          onClick={onBack}
          style={{
            marginTop: 11, background: 'transparent', border: 'none', padding: 0,
            fontFamily: 'JetBrains Mono, monospace', fontSize: 7.5, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: BASE.steel, cursor: 'pointer',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel }}
        >
          ← back to {origin.term}
        </button>
      )}
    </div>
  )
}

/* ── one panel at a time ───────────────────────────────────────────────────── *
 * Every GlossedText owns its own state, which means two paragraphs could each
 * hold an open panel. This is the whole coordination mechanism: a module-scoped
 * set of closers. No context, no provider, nothing for a caller to wire up —
 * <GlossedText text={...} /> still works on its own.
 */
const OPEN_PANELS = new Set<() => void>()

/* ── the marked prose ──────────────────────────────────────────────────────── */

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'term'; value: string; entry: GlossEntry; key: number }

/**
 * Splits prose into plain runs and marked terms, keeping only the first
 * appearance of any given entry.
 */
function buildSegments(text: string): Segment[] {
  if (!text) return []
  const matches = findGlossTerms(text)
  if (matches.length === 0) return [{ kind: 'text', value: text }]

  const segments: Segment[] = []
  const seen = new Set<string>()
  let cursor = 0
  let key = 0

  for (const m of matches) {
    if (seen.has(m.entry.id)) continue
    seen.add(m.entry.id)
    if (m.start > cursor) segments.push({ kind: 'text', value: text.slice(cursor, m.start) })
    segments.push({ kind: 'term', value: text.slice(m.start, m.end), entry: m.entry, key: key++ })
    cursor = m.end
  }
  if (cursor < text.length) segments.push({ kind: 'text', value: text.slice(cursor) })
  return segments
}

interface GlossedTextProps {
  text: string
  className?: string
  style?: CSSProperties
}

/**
 * Renders `text`, marking the study terms in it as clickable.
 *
 * Safe on empty text and on prose with no matches — both render as a plain
 * span. Opening the panel never moves the prose.
 */
export function GlossedText({ text, className, style }: GlossedTextProps): JSX.Element {
  const segments = useMemo(() => buildSegments(text), [text])

  /** Which marked term is open, by segment key. */
  const [openKey, setOpenKey] = useState<number | null>(null)
  /** Which entry the panel is showing — diverges from the term once a chip is followed. */
  const [viewId, setViewId] = useState<string | null>(null)
  const [pos, setPos] = useState<PanelPos | null>(null)

  const anchorsRef = useRef(new Map<number, HTMLSpanElement>())
  const panelRef = useRef<HTMLDivElement | null>(null)

  const openEntry = useMemo(() => {
    if (openKey === null) return null
    const seg = segments.find(s => s.kind === 'term' && s.key === openKey)
    return seg && seg.kind === 'term' ? seg.entry : null
  }, [openKey, segments])

  const shown = viewId ? getGloss(viewId) ?? openEntry : openEntry
  const isOpen = openKey !== null && shown !== null

  const close = useCallback((restoreFocus: boolean) => {
    const anchor = openKey === null ? null : anchorsRef.current.get(openKey)
    setOpenKey(null)
    setViewId(null)
    setPos(null)
    if (restoreFocus && anchor) anchor.focus({ preventScroll: true })
  }, [openKey])

  /* NEW PROSE, NEW TERMS — shut whatever was open.
   *
   * openKey is an index into the segments of the OLD text. When `text` changes
   * on a live instance, key 3 in the new prose is a different word entirely, so
   * the panel stayed open showing a term the reader never clicked, still parked
   * at the coordinates of a span that no longer exists. Today PLAIN READ blanks
   * its document between passages so the instance unmounts and the bug never
   * fires, but GlossedText is documented as a zero-setup drop-in and the next
   * caller may well swap `text` in place. `segments` is memoised on `text`, so
   * this runs exactly when the prose changes and never on a re-render. */
  useEffect(() => {
    setOpenKey(null)
    setViewId(null)
    setPos(null)
  }, [segments])

  /* Kept in a ref so the registered closer is stable for the life of the
     instance while still calling the current close(). */
  const closeSelf = useRef<() => void>(() => {})
  const selfEntry = useRef<() => void>(() => {})
  useEffect(() => { closeSelf.current = () => close(false) }, [close])
  useEffect(() => {
    const fn = () => closeSelf.current()
    selfEntry.current = fn
    OPEN_PANELS.add(fn)
    return () => { OPEN_PANELS.delete(fn) }
  }, [])

  const openAt = useCallback((key: number) => {
    const anchor = anchorsRef.current.get(key)
    if (!anchor) return
    // Shut any panel another block of prose left open.
    for (const fn of OPEN_PANELS) if (fn !== selfEntry.current) fn()
    setPos(placePanel(anchor.getBoundingClientRect()))
    setViewId(null)
    setOpenKey(key)
  }, [])

  /* A term that is already open toggles shut, so a second click is an exit. */
  const toggle = useCallback((key: number) => {
    if (openKey === key) close(true)
    else openAt(key)
  }, [openKey, close, openAt])

  /* Escape closes and hands focus back to the term it came from. */
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(true) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  /* Outside click closes without stealing focus back. */
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (panelRef.current?.contains(t)) return
      const anchor = openKey === null ? null : anchorsRef.current.get(openKey)
      if (anchor?.contains(t)) return
      close(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [isOpen, openKey, close])

  /* Follow the term while the page moves; give up once it has left the window.
     Registered on window AND document in the capture phase: the window listener
     catches scrolling in any nested container, the document one is insurance in
     engines that deliver document scrolls only at their own target. Both are
     passive, and samePos() means a duplicate call costs no render. */
  useEffect(() => {
    if (!isOpen || openKey === null) return
    const reflow = () => {
      const anchor = anchorsRef.current.get(openKey)
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      if (rect.bottom < 0 || rect.top > window.innerHeight) { close(false); return }
      const next = placePanel(rect)
      setPos(prev => (samePos(prev, next) ? prev : next))
    }
    const opts = { capture: true, passive: true } as const
    window.addEventListener('scroll', reflow, opts)
    document.addEventListener('scroll', reflow, opts)
    window.addEventListener('resize', reflow)
    return () => {
      window.removeEventListener('scroll', reflow, opts)
      document.removeEventListener('scroll', reflow, opts)
      window.removeEventListener('resize', reflow)
    }
  }, [isOpen, openKey, close])

  /* Move focus into the panel so the related-term chips are reachable. Nothing
     is trapped — Tab leaves the panel normally, and Escape returns to the term.
     Done straight in the effect rather than on an animation frame, which never
     fires in a backgrounded window. preventScroll keeps the prose still. */
  useEffect(() => {
    if (!isOpen) return
    panelRef.current?.focus({ preventScroll: true })
  }, [isOpen])

  if (segments.length === 0) return <span className={className} style={style} />

  return (
    <span className={className} style={style}>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') return <span key={`t${i}`}>{seg.value}</span>

        const active = openKey === seg.key
        return (
          <span
            key={`g${seg.key}`}
            ref={el => {
              if (el) anchorsRef.current.set(seg.key, el)
              else anchorsRef.current.delete(seg.key)
            }}
            role="button"
            tabIndex={0}
            aria-haspopup="dialog"
            aria-expanded={active}
            title={`${seg.entry.term} — what this means`}
            onClick={e => { e.stopPropagation(); toggle(seg.key) }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault()
                e.stopPropagation()
                toggle(seg.key)
              }
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BASE.goldDim }}
            onMouseLeave={e => {
              if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
            onFocus={e => { (e.currentTarget as HTMLElement).style.background = BASE.goldDim }}
            onBlur={e => {
              if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
            style={{
              cursor: 'pointer',
              color: 'inherit',
              background: active ? BASE.goldMid : 'transparent',
              textDecorationLine: 'underline',
              textDecorationStyle: 'dotted',
              textDecorationColor: active ? BASE.gold : 'rgba(229,190,73,0.5)',
              textDecorationThickness: '1px',
              textUnderlineOffset: '3px',
              borderRadius: 2,
              transition: 'background 0.14s, text-decoration-color 0.14s',
            }}
          >
            {seg.value}
          </span>
        )
      })}

      {isOpen && shown && pos && typeof document !== 'undefined' && createPortal(
        <GlossPanel
          entry={shown}
          origin={openEntry && shown.id !== openEntry.id ? openEntry : null}
          pos={pos}
          panelRef={panelRef}
          onSelect={id => setViewId(id)}
          onBack={() => setViewId(null)}
          onClose={() => close(true)}
        />,
        document.body,
      )}
    </span>
  )
}

export default GlossedText
