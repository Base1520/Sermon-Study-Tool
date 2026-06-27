import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'

interface SermonMeta { id: string; title: string; addedAt: string }
interface SermonFull extends SermonMeta { text: string }

interface Props {
  reference: string | null
}

export function SermonCompanion({ reference }: Props) {
  const [sermons, setSermons] = useState<SermonMeta[]>([])
  const [selected, setSelected] = useState<SermonFull | null>(null)
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!reference) { setSermons([]); return }
    const book = reference.replace(/\s+\d.*/, '').trim()
    setLoading(true)
    setSelected(null)
    const NON_SERMON = /manual|bibliography|handbook|curriculum|syllabus|workbook|study guide/i
    ;(window as any).electronAPI.profileSearchSermons(book).then((results: SermonMeta[]) => {
      const filtered = results.filter(s => !NON_SERMON.test(s.title))
      setSermons(filtered.slice(0, 20))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [reference])

  async function open(meta: SermonMeta) {
    const full = await (window as any).electronAPI.profileGetSermon(meta.id)
    setSelected(full)
  }

  if (!reference || (sermons.length === 0 && !loading)) return null

  const book = reference.replace(/\s+\d.*/, '').trim()

  return (
    <div style={{ borderTop: `1px solid ${BASE.borderDim}`, flexShrink: 0 }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10 }}>◈</span>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.gold, letterSpacing: '0.1em', opacity: 0.7 }}>
            YOUR {book.toUpperCase()} SERMONS
          </span>
          {!loading && (
            <span style={{
              background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
              borderRadius: 8, padding: '1px 6px',
              fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold,
            }}>{sermons.length}</span>
          )}
        </div>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel }}>
          {collapsed ? '▸' : '▾'}
        </span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            {loading ? (
              <div style={{ padding: '4px 16px 12px', fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel }}>
                searching…
              </div>
            ) : selected ? (
              <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => setSelected(null)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold,
                  letterSpacing: '0.08em', padding: '0 4px', display: 'flex', alignItems: 'center', gap: 4,
                  opacity: 0.6,
                }}>← back</button>
                <div style={{
                  fontFamily: 'Crimson Pro, serif', fontSize: 12.5, color: BASE.bone,
                  lineHeight: 1.35, padding: '0 4px',
                }}>{selected.title}</div>
                <div style={{
                  maxHeight: 220, overflowY: 'auto',
                  background: BASE.goldDim, border: `1px solid ${BASE.borderDim}`,
                  borderRadius: 8, padding: '10px 12px',
                  fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.boneMid,
                  lineHeight: 1.7, whiteSpace: 'pre-wrap',
                }}>
                  {selected.text}
                </div>
              </div>
            ) : (
              <div style={{ padding: '0 8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {sermons.map(s => (
                  <button key={s.id} onClick={() => open(s)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    padding: '6px 8px', borderRadius: 6, transition: 'background 0.12s', width: '100%',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = BASE.goldDim)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12.5, color: BASE.boneMid, lineHeight: 1.3 }}>
                      {s.title}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, marginTop: 2, letterSpacing: '0.06em' }}>
                      {new Date(s.addedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
