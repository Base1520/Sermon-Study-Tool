/**
 * StudyHistory.tsx — search every study you have ever run.
 *
 * Nothing a reader studies should be lost, and nothing already paid for should
 * cost anything to see again. This is a SEARCH LAYER over the existing history
 * store (history-list / history-delete / history-save-annotations in
 * electron/main.js) — it adds no storage of its own and no new plumbing.
 * Filtering happens in the renderer over the list the store already returns.
 *
 * Reopening a result loads the SAVED analysis. Any reading built from it comes
 * back off the cache key that analysis hashes to, so re-reading an old study
 * makes no API call and costs nothing.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { HistoryEntry } from '../types/phrasing'
import { BASE } from '../theme'

interface Props {
  onLoad: (entry: HistoryEntry) => void
  onClose: () => void
  currentRef?: string
}

/** One searchable field of a saved study. */
interface Field { label: string; text: string }

/** A result, with the field the hit landed in. */
interface Hit {
  entry: HistoryEntry
  /** Lower is better. Reference matches sort above body matches. */
  rank: number
  field: Field | null
  at: number
  length: number
}

/* ── what a study is searchable by ─────────────────────────────────────────── */

function fieldsOf(entry: HistoryEntry): Field[] {
  const a: any = entry.analysis ?? {}
  const out: Field[] = []

  if (a.mainTheme) out.push({ label: 'meaning', text: String(a.mainTheme) })

  // The exegetical outline — headings are how people remember a passage.
  for (const p of (a.outline ?? []) as any[]) {
    const head = [p?.point, p?.label].filter(Boolean).join(' ')
    if (head) out.push({ label: 'outline', text: head })
    for (const s of (p?.sub ?? []) as any[]) {
      const sub = [s?.point, s?.label].filter(Boolean).join(' ')
      if (sub) out.push({ label: 'outline', text: sub })
    }
  }

  // Anything the reader wrote themselves — the most valuable thing to find.
  for (const note of Object.values(entry.annotations ?? {})) {
    if (note && String(note).trim()) out.push({ label: 'your note', text: String(note) })
  }

  if (a.canonicalContext?.bookTheme) out.push({ label: 'book', text: String(a.canonicalContext.bookTheme) })
  if (a.canonicalContext?.passageRole) out.push({ label: 'role', text: String(a.canonicalContext.passageRole) })
  for (const t of (a.canonicalContext?.biblicalThemes ?? []) as string[]) {
    if (t) out.push({ label: 'theme', text: String(t) })
  }

  if (a.passageText) out.push({ label: 'passage', text: String(a.passageText) })

  return out
}

/* ── search ────────────────────────────────────────────────────────────────── */

export function search(entries: HistoryEntry[], raw: string): Hit[] {
  const q = raw.trim().toLowerCase()
  if (!q) {
    return entries.map(entry => ({ entry, rank: 0, field: null, at: -1, length: 0 }))
  }

  const hits: Hit[] = []
  for (const entry of entries) {
    const ref = String(entry.analysis?.reference ?? '')
    const refAt = ref.toLowerCase().indexOf(q)
    if (refAt !== -1) {
      hits.push({ entry, rank: 0, field: { label: 'reference', text: ref }, at: refAt, length: q.length })
      continue
    }
    let best: Hit | null = null
    for (const field of fieldsOf(entry)) {
      const at = field.text.toLowerCase().indexOf(q)
      if (at === -1) continue
      // A note the reader wrote outranks the passage text it sits under.
      const rank = field.label === 'your note' ? 1 : field.label === 'passage' ? 3 : 2
      if (!best || rank < best.rank) best = { entry, rank, field, at, length: q.length }
      if (rank === 1) break
    }
    if (best) hits.push(best)
  }
  return hits.sort((a, b) => a.rank - b.rank)
}

/** A window of text around the hit, with the hit itself marked. */
function Snippet({ field, at, length }: { field: Field; at: number; length: number }) {
  const PAD = 70
  const start = Math.max(0, at - PAD)
  const end = Math.min(field.text.length, at + length + PAD)
  const head = (start > 0 ? '…' : '') + field.text.slice(start, at)
  const hit = field.text.slice(at, at + length)
  const tail = field.text.slice(at + length, end) + (end < field.text.length ? '…' : '')

  return (
    <div style={{ marginTop: 5, display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{
        fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.14em',
        color: BASE.moss, textTransform: 'uppercase', flexShrink: 0, marginTop: 2,
      }}>
        {field.label}
      </span>
      <span style={{
        fontFamily: 'Crimson Pro, serif', fontSize: 13.5, lineHeight: 1.55,
        color: BASE.boneMid,
      }}>
        {head}
        <mark style={{
          background: BASE.goldMid, color: BASE.gold,
          padding: '0 2px', borderRadius: 2,
        }}>
          {hit}
        </mark>
        {tail}
      </span>
    </div>
  )
}

/* ── the panel ─────────────────────────────────────────────────────────────── */

export function StudyHistory({ onLoad, onClose, currentRef }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    ;(window as any).electronAPI.historyList?.()
      .then((list: HistoryEntry[]) => { setEntries(Array.isArray(list) ? list : []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hits = useMemo(() => search(entries, query), [entries, query])

  function fmt(iso: string) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 120,
          background: 'rgba(8,10,7,0.72)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: '9vh',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          onClick={e => e.stopPropagation()}
          style={{
            width: 'min(720px, 92vw)', maxHeight: '76vh',
            display: 'flex', flexDirection: 'column',
            background: `${BASE.bg}fa`,
            border: `1px solid ${BASE.borderGold}`,
            boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* Search — the whole control surface. No submit, no filters, no modes. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px', borderBottom: `1px solid ${BASE.borderDim}`, flexShrink: 0,
          }}>
            <span style={{ color: BASE.gold, fontSize: 14, opacity: 0.8 }}>⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search your studies — a passage, a phrase, a note you wrote"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: BASE.bone, fontFamily: 'Crimson Pro, serif', fontSize: 17,
              }}
            />
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.14em', color: BASE.steel,
            }}>
              {loaded ? `${hits.length} / ${entries.length}` : ''}
            </span>
            <button onClick={onClose} style={{
              width: 26, height: 26, border: `1px solid ${BASE.borderDim}`,
              background: 'transparent', color: BASE.steel, cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>×</button>
          </div>

          <div style={{ overflowY: 'auto', padding: '8px 10px 12px' }}>
            {loaded && entries.length === 0 && (
              <div style={{ padding: '46px 20px', textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'Crimson Pro, serif', fontSize: 17, color: BASE.boneMid, marginBottom: 6,
                }}>
                  Nothing saved yet.
                </div>
                <div style={{
                  fontFamily: 'Crimson Pro, serif', fontSize: 14.5, color: BASE.steel, lineHeight: 1.6,
                }}>
                  Study a passage and it lands here. Nothing you work through gets lost.
                </div>
              </div>
            )}

            {loaded && entries.length > 0 && hits.length === 0 && (
              <div style={{ padding: '46px 20px', textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'Crimson Pro, serif', fontSize: 17, color: BASE.boneMid, marginBottom: 6,
                }}>
                  No study matches “{query.trim()}”.
                </div>
                <div style={{
                  fontFamily: 'Crimson Pro, serif', fontSize: 14.5, color: BASE.steel, lineHeight: 1.6,
                }}>
                  Searches run over the reference, the passage, the meaning, the outline,
                  and every note you wrote.
                </div>
              </div>
            )}

            {hits.map(({ entry, field, at, length }) => {
              const ref = entry.analysis?.reference ?? '—'
              const isCurrent = ref === currentRef
              const noteCount = Object.keys(entry.annotations ?? {}).length
              return (
                <div
                  key={entry.id}
                  onClick={() => { onLoad(entry); onClose() }}
                  style={{
                    padding: '11px 14px', marginBottom: 3, cursor: 'pointer',
                    background: isCurrent ? BASE.goldDim : 'transparent',
                    borderLeft: `2px solid ${isCurrent ? BASE.gold : 'transparent'}`,
                    transition: 'background 0.14s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BASE.goldDim }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = isCurrent ? BASE.goldDim : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span style={{
                      fontFamily: 'Crimson Pro, serif', fontSize: 17, color: BASE.bone, flexShrink: 0,
                    }}>
                      {ref}
                    </span>
                    <span style={{
                      fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.1em', color: BASE.steel,
                    }}>
                      {fmt(entry.savedAt)}
                    </span>
                    {noteCount > 0 && (
                      <span style={{
                        fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.1em',
                        color: BASE.gold, opacity: 0.75,
                      }}>
                        {noteCount} note{noteCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {field
                    ? <Snippet field={field} at={at} length={length} />
                    : entry.analysis?.mainTheme && (
                        <div style={{
                          fontFamily: 'Crimson Pro, serif', fontSize: 13.5, lineHeight: 1.55,
                          color: BASE.steel, marginTop: 4,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {entry.analysis.mainTheme}
                        </div>
                      )}
                </div>
              )
            })}
          </div>

          <div style={{
            flexShrink: 0, padding: '9px 18px', borderTop: `1px solid ${BASE.borderDim}`,
            fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.14em', color: BASE.steel,
          }}>
            OPENING A STUDY COSTS NOTHING — IT LOADS FROM WHAT IS ALREADY SAVED
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
