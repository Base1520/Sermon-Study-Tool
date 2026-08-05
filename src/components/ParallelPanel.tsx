import { useState, useEffect, useCallback } from 'react'
import { TRANSLATIONS } from '../lib/translations'


const GOLD    = '#D8B33F'
const KHAKI   = '#B8B49D'
const CARD_BG = '#2c3820'
const TEXT_MID = '#d8d0b8'

interface ColumnData {
  id: string
  label: string
  text: string | null
  loading: boolean
  error: string | null
}

interface Props {
  reference: string
  esvKey?: string
}

function parseVerses(text: string): { num: string; content: string }[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length > 1) {
    return lines.map(l => {
      const m = l.match(/^(\d+)\s+(.*)/)
      return m ? { num: m[1], content: m[2] } : { num: '', content: l }
    })
  }
  return [{ num: '', content: text }]
}

export function ParallelPanel({ reference, esvKey }: Props) {
  const defaultCols = esvKey
    ? ['esv', 'kjv', 'ylt']
    : ['kjv', 'ylt', 'asv']

  const [selected, setSelected]   = useState<string[]>(defaultCols)
  const [columns, setColumns]     = useState<Record<string, ColumnData>>({})

  const fetchTranslation = useCallback(async (id: string) => {
    if (!reference?.trim()) return
    setColumns(prev => ({
      ...prev,
      [id]: { id, label: TRANSLATIONS.find(t => t.id === id)?.label ?? id, text: null, loading: true, error: null },
    }))
    try {
      const result = await (window as any).electronAPI.fetchBible({
        reference: reference.trim(),
        translation: id,
        esvKey: esvKey ?? '',
      })
      setColumns(prev => ({
        ...prev,
        [id]: { ...prev[id], text: result, loading: false },
      }))
    } catch (e: any) {
      setColumns(prev => ({
        ...prev,
        [id]: { ...prev[id], loading: false, error: e?.message ?? 'Fetch failed' },
      }))
    }
  }, [reference, esvKey])

  // Fetch all selected columns when reference or selection changes
  useEffect(() => {
    if (!reference?.trim()) return
    for (const id of selected) {
      fetchTranslation(id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, selected.join(',')])

  function toggleTranslation(id: string) {
    const t = TRANSLATIONS.find(x => x.id === id)!
    if (t.requiresKey && !esvKey) return
    setSelected(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(x => x !== id) : prev
        : [...prev, id].slice(0, 4)
    )
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      background: CARD_BG,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      {/* Translation selector row (no separate header — header lives in card node) */}
      <div style={{
        padding: '6px 12px',
        borderBottom: `1px solid ${KHAKI}18`,
        display: 'flex', alignItems: 'center', gap: 4,
        flexShrink: 0, background: `${CARD_BG}`,
      }}>
        {TRANSLATIONS.map(t => {
          const locked  = t.requiresKey && !esvKey
          const active  = selected.includes(t.id)
          return (
            <button key={t.id}
              onClick={() => toggleTranslation(t.id)}
              title={locked ? 'Add ESV key in Settings to unlock' : t.label}
              style={{
                fontSize: 7, letterSpacing: '0.1em', padding: '2px 8px',
                background: active ? `${GOLD}18` : 'transparent',
                border: `1px solid ${active ? GOLD : KHAKI + '30'}`,
                color: locked ? `${KHAKI}40` : active ? GOLD : KHAKI,
                cursor: locked ? 'not-allowed' : 'pointer',
                opacity: locked ? 0.5 : 1, transition: 'all 0.15s',
              }}
            >
              {t.label}{locked ? ' 🔑' : ''}
            </button>
          )
        })}
        <div style={{ fontSize: 6.5, color: KHAKI, opacity: 0.4, marginLeft: 6 }}>max 4</div>
      </div>


      {/* Columns */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: 0, minHeight: 0 }}>
        {selected.map((id, colIdx) => {
          const col = columns[id]
          const verses = col?.text ? parseVerses(col.text) : []
          const isLast = colIdx === selected.length - 1

          return (
            <div key={id} style={{
              flex: 1,
              borderRight: isLast ? 'none' : `1px solid ${KHAKI}20`,
              overflowY: 'auto',
              padding: '12px 14px 24px',
              position: 'relative',
              background: CARD_BG,
            }}>
              {/* Column label */}
              <div style={{
                fontSize: 7, letterSpacing: '0.14em', color: GOLD,
                opacity: 0.7, marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ color: GOLD, opacity: 0.5 }}>[ </span>
                {TRANSLATIONS.find(t => t.id === id)?.label}
                <span style={{ color: GOLD, opacity: 0.5 }}> ]</span>
              </div>

              {/* Loading */}
              {col?.loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.5 }}>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8,
                    border: `1.5px solid ${KHAKI}`, borderTopColor: GOLD,
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                  <span style={{ fontSize: 8, color: KHAKI, letterSpacing: '0.1em' }}>FETCHING</span>
                </div>
              )}

              {/* Error */}
              {col?.error && !col.loading && (
                <div style={{
                  fontSize: 7.5, color: '#c05050', letterSpacing: '0.06em',
                  padding: '4px 8px', border: '1px solid #c0505033',
                  background: '#c0505011',
                }}>
                  ⚠ {col.error}
                </div>
              )}

              {/* Verse text */}
              {verses.map((v, i) => (
                <div key={i} style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {v.num && (
                    <span style={{
                      fontFamily: 'JetBrains Mono', fontSize: 7, color: GOLD,
                      opacity: 0.55, marginTop: 4, flexShrink: 0,
                      minWidth: 14, textAlign: 'right',
                    }}>
                      {v.num}
                    </span>
                  )}
                  <span style={{
                    fontFamily: 'Crimson Pro, serif', fontSize: 14,
                    color: TEXT_MID, lineHeight: 1.75,
                  }}>
                    {v.content}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
