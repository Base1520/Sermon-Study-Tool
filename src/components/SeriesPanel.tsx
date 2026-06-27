import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'
import type { PhrasingAnalysis } from '../types/phrasing'

interface SeriesPassage {
  reference: string
  mainTheme: string
  outline: { point: string; label: string }[]
  biblicalThemes: string[]
}

interface Series {
  id: string
  name: string
  description: string
  passages: SeriesPassage[]
  createdAt: string
}

interface Synthesis {
  seriesArc: string
  unifyingTheme: string
  weekByWeek: { reference: string; role: string; distinctiveContribution: string }[]
  recurringThemes: string[]
  suggestedSeriesTitle: string
  introductionIdeas: string
  conclusionIdeas: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  currentAnalysis: PhrasingAnalysis | null
  apiKey: string
}

export function SeriesPanel({ isOpen, onClose, currentAnalysis, apiKey }: Props) {
  const [series, setSeries] = useState<Series[]>([])
  const [selected, setSelected] = useState<Series | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null)
  const [synthesizing, setSynthesizing] = useState(false)
  const [addingTo, setAddingTo] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) load()
  }, [isOpen])

  async function load() {
    const list = await (window as any).electronAPI.seriesList()
    setSeries(list)
  }

  async function createSeries() {
    if (!newName.trim()) return
    const s = await (window as any).electronAPI.seriesCreate({ name: newName.trim(), description: newDesc.trim() })
    setSeries(prev => [s, ...prev])
    setSelected(s)
    setCreating(false)
    setNewName(''); setNewDesc('')
  }

  async function addCurrent(seriesId: string) {
    if (!currentAnalysis) return
    setAddingTo(seriesId)
    const updated = await (window as any).electronAPI.seriesAddPassage({ seriesId, analysis: currentAnalysis })
    setSeries(prev => prev.map(s => s.id === seriesId ? updated : s))
    if (selected?.id === seriesId) setSelected(updated)
    setAddingTo(null)
    setSynthesis(null)
  }

  async function removePassage(reference: string) {
    if (!selected) return
    await (window as any).electronAPI.seriesRemovePassage({ seriesId: selected.id, reference })
    const updated = { ...selected, passages: selected.passages.filter(p => p.reference !== reference) }
    setSelected(updated)
    setSeries(prev => prev.map(s => s.id === selected.id ? updated : s))
    setSynthesis(null)
  }

  async function deleteSeries(id: string) {
    await (window as any).electronAPI.seriesDelete(id)
    setSeries(prev => prev.filter(s => s.id !== id))
    if (selected?.id === id) setSelected(null)
    setSynthesis(null)
  }

  async function synthesize() {
    if (!selected || selected.passages.length < 2) return
    setSynthesizing(true)
    setSynthesis(null)
    try {
      const result = await (window as any).electronAPI.seriesSynthesize({ series: selected, apiKey })
      setSynthesis(result)
    } catch { /* silent */ }
    setSynthesizing(false)
  }

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(10,12,9,0.85)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'stretch',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: 280, background: `${BASE.bg}f8`, borderRight: `1px solid ${BASE.borderGold}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Sidebar header */}
        <div style={{ padding: '20px 16px 14px', borderBottom: `1px solid ${BASE.borderDim}`, flexShrink: 0 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.14em', marginBottom: 8 }}>SERMON SERIES</div>
          <button
            onClick={() => setCreating(true)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
              background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
              fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.gold, letterSpacing: '0.1em',
            }}
          >
            + NEW SERIES
          </button>
        </div>

        {/* Series list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {series.length === 0 && !creating && (
            <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.steel, padding: '16px', lineHeight: 1.6 }}>
              No series yet. Create one to group passages and track thematic threads across a preaching series.
            </p>
          )}
          {series.map(s => (
            <button
              key={s.id}
              onClick={() => { setSelected(s); setSynthesis(null) }}
              style={{
                width: '100%', padding: '10px 16px', textAlign: 'left', cursor: 'pointer',
                background: selected?.id === s.id ? `${BASE.gold}10` : 'none',
                border: 'none', borderLeft: `2px solid ${selected?.id === s.id ? BASE.gold : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.bone }}>{s.name}</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.08em', marginTop: 3 }}>
                {s.passages.length} passage{s.passages.length !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
        </div>

        <button onClick={onClose} style={{ padding: '14px 16px', background: 'none', border: 'none', borderTop: `1px solid ${BASE.borderDim}`, cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em', flexShrink: 0 }}>
          CLOSE
        </button>
      </div>

      {/* Main panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {creating && (
            <motion.div key="create" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 440, background: `${BASE.bgCard}f0`, border: `1px solid ${BASE.borderGold}`, borderRadius: 16, padding: 32 }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.gold, letterSpacing: '0.14em', marginBottom: 16 }}>NEW SERIES</div>
                <input
                  autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Series name (e.g. The Gospel of Mark)"
                  style={{ width: '100%', background: BASE.goldDim, border: `1px solid ${BASE.borderDim}`, borderRadius: 10, padding: '11px 14px', fontSize: 14, color: BASE.bone, fontFamily: 'Crimson Pro, serif', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                  onKeyDown={e => e.key === 'Enter' && createSeries()}
                />
                <textarea
                  value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="Brief description or preaching goal (optional)"
                  rows={2}
                  style={{ width: '100%', background: BASE.goldDim, border: `1px solid ${BASE.borderDim}`, borderRadius: 10, padding: '11px 14px', fontSize: 13, color: BASE.bone, fontFamily: 'Crimson Pro, serif', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 20 }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={createSeries} style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', background: BASE.goldMid, border: `1px solid ${BASE.borderGold}`, color: BASE.gold, fontFamily: 'Crimson Pro, serif', fontSize: 14 }}>
                    Create Series
                  </button>
                  <button onClick={() => setCreating(false)} style={{ padding: '10px 18px', borderRadius: 10, cursor: 'pointer', background: 'none', border: `1px solid ${BASE.borderDim}`, color: BASE.steel, fontFamily: 'Crimson Pro, serif', fontSize: 14 }}>
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {!creating && !selected && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', maxWidth: 380 }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 40, color: BASE.borderDim, marginBottom: 20 }}>≡</div>
                <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 16, color: BASE.steel, lineHeight: 1.7 }}>
                  Select a series to manage passages, or create a new one to start tracking a preaching series.
                </p>
              </div>
            </motion.div>
          )}

          {!creating && selected && (
            <motion.div key={selected.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
              {/* Series header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
                <div>
                  <h1 style={{ fontFamily: 'Crimson Pro, serif', fontSize: 28, color: BASE.bone, fontWeight: 400, margin: 0 }}>{selected.name}</h1>
                  {selected.description && <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.steel, margin: '6px 0 0' }}>{selected.description}</p>}
                </div>
                <button onClick={() => deleteSeries(selected.id)} style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, background: 'none', border: `1px solid ${BASE.borderDim}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', letterSpacing: '0.08em' }}>
                  DELETE
                </button>
              </div>

              {/* Add current passage */}
              {currentAnalysis && (
                <div style={{ marginBottom: 24, padding: '12px 16px', background: `${BASE.gold}08`, border: `1px solid ${BASE.gold}22`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.1em', marginBottom: 3 }}>CURRENT PASSAGE</div>
                    <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.bone }}>{currentAnalysis.reference}</div>
                  </div>
                  <button
                    onClick={() => addCurrent(selected.id)}
                    disabled={addingTo === selected.id || selected.passages.some(p => p.reference === currentAnalysis.reference)}
                    style={{
                      padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                      background: selected.passages.some(p => p.reference === currentAnalysis.reference) ? `${BASE.moss}18` : BASE.goldDim,
                      border: `1px solid ${selected.passages.some(p => p.reference === currentAnalysis.reference) ? BASE.moss : BASE.borderGold}`,
                      fontFamily: 'JetBrains Mono', fontSize: 7,
                      color: selected.passages.some(p => p.reference === currentAnalysis.reference) ? BASE.moss : BASE.gold,
                      letterSpacing: '0.1em',
                    }}
                  >
                    {addingTo === selected.id ? 'ADDING…' : selected.passages.some(p => p.reference === currentAnalysis.reference) ? '✓ ADDED' : '+ ADD TO SERIES'}
                  </button>
                </div>
              )}

              {/* Passages */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 12 }}>PASSAGES IN SERIES</div>
                {selected.passages.length === 0 && (
                  <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.steel }}>No passages yet. Add the current passage above.</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.passages.map((p, i) => (
                    <div key={p.reference} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 16px', background: `${BASE.bgCard}80`, border: `1px solid ${BASE.borderDim}`, borderRadius: 10 }}>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.gold, opacity: 0.5, marginTop: 3, flexShrink: 0, minWidth: 48 }}>WK {i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.bone, marginBottom: 3 }}>{p.reference}</div>
                        <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.steel, lineHeight: 1.5 }}>{p.mainTheme}</div>
                        {p.biblicalThemes.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {p.biblicalThemes.slice(0, 4).map(t => (
                              <span key={t} style={{ fontFamily: 'Crimson Pro, serif', fontSize: 10.5, color: BASE.khaki, background: `${BASE.khaki}10`, border: `1px solid ${BASE.khaki}25`, borderRadius: 10, padding: '1px 8px' }}>{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => removePassage(p.reference)} style={{ color: BASE.steel, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, flexShrink: 0, opacity: 0.4, transition: 'opacity 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.4' }}
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Synthesize button */}
              {selected.passages.length >= 2 && (
                <div style={{ marginBottom: 32 }}>
                  <button
                    onClick={synthesize}
                    disabled={synthesizing}
                    style={{
                      padding: '12px 24px', borderRadius: 10, cursor: synthesizing ? 'default' : 'pointer',
                      background: synthesizing ? `${BASE.moss}10` : `${BASE.moss}18`,
                      border: `1px solid ${synthesizing ? BASE.moss + '40' : BASE.moss + '60'}`,
                      fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.moss, letterSpacing: '0.12em',
                      transition: 'all 0.2s',
                    }}
                  >
                    {synthesizing ? 'SYNTHESIZING SERIES…' : '◈ SYNTHESIZE SERIES ARC'}
                  </button>
                  <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.steel, marginTop: 6 }}>
                    Opus analyzes all passages together — finds the unifying thread, week-by-week roles, and suggests a series title.
                  </div>
                </div>
              )}

              {/* Synthesis output */}
              {synthesis && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ padding: '20px 24px', background: `${BASE.moss}08`, border: `1px solid ${BASE.moss}30`, borderRadius: 12 }}>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.moss, letterSpacing: '0.14em', marginBottom: 10 }}>SUGGESTED SERIES TITLE</div>
                    <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 22, color: BASE.bone, fontWeight: 400 }}>{synthesis.suggestedSeriesTitle}</div>
                  </div>

                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 8 }}>UNIFYING THEME</div>
                    <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.boneMid, lineHeight: 1.7, margin: 0 }}>{synthesis.unifyingTheme}</p>
                  </div>

                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 8 }}>SERIES ARC</div>
                    <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.boneMid, lineHeight: 1.7, margin: 0 }}>{synthesis.seriesArc}</p>
                  </div>

                  {synthesis.recurringThemes.length > 0 && (
                    <div>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 8 }}>RECURRING THREADS</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {synthesis.recurringThemes.map(t => (
                          <span key={t} style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.gold, background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`, borderRadius: 12, padding: '2px 10px' }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 10 }}>WEEK BY WEEK</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {synthesis.weekByWeek.map((w, i) => (
                        <div key={i} style={{ padding: '12px 16px', background: `${BASE.bgCard}80`, border: `1px solid ${BASE.borderDim}`, borderRadius: 8, display: 'flex', gap: 14 }}>
                          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.gold, flexShrink: 0, minWidth: 80, marginTop: 2 }}>{w.reference}</div>
                          <div>
                            <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.bone, marginBottom: 4 }}>{w.role}</div>
                            <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.steel }}>{w.distinctiveContribution}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ padding: '16px', background: `${BASE.bgCard}80`, border: `1px solid ${BASE.borderDim}`, borderRadius: 10 }}>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.12em', marginBottom: 8 }}>WEEK 1 INTRODUCTION</div>
                      <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid, lineHeight: 1.65, margin: 0 }}>{synthesis.introductionIdeas}</p>
                    </div>
                    <div style={{ padding: '16px', background: `${BASE.bgCard}80`, border: `1px solid ${BASE.borderDim}`, borderRadius: 10 }}>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.12em', marginBottom: 8 }}>FINAL WEEK LANDING</div>
                      <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid, lineHeight: 1.65, margin: 0 }}>{synthesis.conclusionIdeas}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
