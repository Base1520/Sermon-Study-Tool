import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { HistoryEntry } from '../types/phrasing'
import { BASE } from '../theme'

interface Props {
  onLoad: (entry: HistoryEntry) => void
  currentRef?: string
}

export function HistoryPanel({ onLoad, currentRef }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [open, setOpen] = useState(false)

  async function refresh() {
    const list = await (window as any).electronAPI.historyList()
    setEntries(list)
  }

  useEffect(() => { refresh() }, [open])

  async function del(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await (window as any).electronAPI.historyDelete(id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  function fmt(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        title="Passage history"
        style={{
          width: 32, height: 32, borderRadius: '50%',
          border: `1px solid ${BASE.borderDim}`,
          background: BASE.goldDim,
          color: BASE.steel,
          cursor: 'pointer', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        ⟳
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.5)' }}
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 36 }}
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: 320, zIndex: 50,
                background: `${BASE.bg}f8`,
                backdropFilter: 'blur(32px)',
                WebkitBackdropFilter: 'blur(32px)',
                borderLeft: `1px solid ${BASE.borderGold}`,
                display: 'flex', flexDirection: 'column',
              }}
            >
              {/* Header */}
              <div style={{
                padding: '20px 20px 14px',
                borderBottom: `1px solid ${BASE.borderDim}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 4 }}>history</div>
                  <h2 style={{ fontFamily: 'Crimson Pro, serif', fontSize: 20, color: BASE.bone, fontWeight: 400, margin: 0 }}>
                    Passages
                  </h2>
                </div>
                <button onClick={() => setOpen(false)} style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: `1px solid ${BASE.borderDim}`,
                  background: BASE.goldDim, color: BASE.steel,
                  cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>×</button>
              </div>

              {/* List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                {entries.length === 0 && (
                  <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.steel, textAlign: 'center', marginTop: 48 }}>
                    No history yet
                  </p>
                )}
                {entries.map(entry => {
                  const isCurrent = entry.analysis.reference === currentRef
                  const noteCount = Object.keys(entry.annotations ?? {}).length
                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => { onLoad(entry); setOpen(false) }}
                      style={{
                        padding: '10px 12px', marginBottom: 4, borderRadius: 10, cursor: 'pointer',
                        background: isCurrent ? BASE.goldDim : `${BASE.bgCard}88`,
                        border: `1px solid ${isCurrent ? BASE.borderGold : BASE.borderDim}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = BASE.goldDim }}
                      onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = `${BASE.bgCard}88` }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.bone,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {entry.analysis.reference}
                        </div>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, marginTop: 3, display: 'flex', gap: 8 }}>
                          <span>{fmt(entry.savedAt)}</span>
                          {noteCount > 0 && <span style={{ color: BASE.gold, opacity: 0.6 }}>{noteCount} note{noteCount > 1 ? 's' : ''}</span>}
                          {(entry.scholarMessages?.length ?? 0) > 0 && <span style={{ color: BASE.moss, opacity: 0.7 }}>λ {Math.floor((entry.scholarMessages!.length) / 2)} msg</span>}
                          {entry.draft && <span style={{ color: BASE.khaki, opacity: 0.6 }}>✦ draft</span>}
                        </div>
                      </div>
                      <button
                        onClick={e => del(entry.id, e)}
                        style={{
                          flexShrink: 0, width: 22, height: 22, borderRadius: 6,
                          border: `1px solid ${BASE.borderDim}`,
                          background: 'transparent', color: BASE.red,
                          cursor: 'pointer', fontSize: 11, opacity: 0.5,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                        ×
                      </button>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
