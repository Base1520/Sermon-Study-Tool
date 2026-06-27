import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'

interface Commentator {
  name: string
  era: string
  summary: string
  distinctiveContribution: string
}

interface CommentaryData {
  commentators: Commentator[]
  convergence: string
  divergence: string
}

interface Props {
  reference: string
  mainTheme: string
  apiKey: string
}

const ERA_COLOR: Record<string, string> = {
  'Matthew Henry': BASE.khaki,
  'John Calvin': BASE.gold,
  'Charles Spurgeon': BASE.moss,
  'John Chrysostom': BASE.steel,
}

export function CommentaryPanel({ reference, mainTheme, apiKey }: Props) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<CommentaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (data) { setOpen(o => !o); return }
    setOpen(true)
    setLoading(true)
    setError(null)
    try {
      const result = await (window as any).electronAPI.fetchCommentary({ reference, mainTheme, apiKey })
      setData(result)
    } catch (e: any) {
      setError('Could not load commentary.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ borderTop: `1px solid ${BASE.borderDim}` }}>
      <button
        onClick={load}
        style={{
          width: '100%', padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BASE.gold}08` }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.14em' }}>
            COMMENTARY VOICES
          </span>
          {loading && (
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6, color: BASE.gold, letterSpacing: '0.1em' }}>
              loading…
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {data && (
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold,
              background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
              borderRadius: 10, padding: '1px 7px',
            }}>{data.commentators.length}</span>
          )}
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel }}>
            {open ? '▴' : '▾'}
          </span>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 12px 14px' }}>
              {loading && (
                <div style={{ display: 'flex', gap: 5, padding: '12px 0' }}>
                  {[0, 1, 2].map(i => (
                    <motion.div key={i}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      style={{ width: 5, height: 5, borderRadius: '50%', background: BASE.gold }}
                    />
                  ))}
                </div>
              )}

              {error && (
                <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.steel, margin: '8px 0' }}>
                  {error}
                </p>
              )}

              {data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.commentators.map(c => {
                    const color = ERA_COLOR[c.name] ?? BASE.steel
                    return (
                      <div key={c.name} style={{
                        background: `${color}08`, border: `1px solid ${color}22`,
                        borderRadius: 8, padding: '10px 12px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color, fontWeight: 600 }}>
                            {c.name}
                          </span>
                          <span style={{
                            fontFamily: 'JetBrains Mono', fontSize: 6.5, color: `${color}80`,
                            letterSpacing: '0.08em',
                          }}>{c.era}</span>
                        </div>
                        <p style={{
                          fontFamily: 'Crimson Pro, serif', fontSize: 12.5, color: BASE.boneMid,
                          lineHeight: 1.6, margin: '0 0 6px',
                        }}>{c.summary}</p>
                        <p style={{
                          fontFamily: 'JetBrains Mono', fontSize: 7, color: `${color}80`,
                          letterSpacing: '0.04em', margin: 0, lineHeight: 1.5,
                        }}>{c.distinctiveContribution}</p>
                      </div>
                    )
                  })}

                  {(data.convergence || data.divergence) && (
                    <div style={{
                      borderTop: `1px solid ${BASE.borderDim}`,
                      paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      {data.convergence && (
                        <div>
                          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, color: BASE.gold, letterSpacing: '0.1em' }}>
                            ALL AGREE:{' '}
                          </span>
                          <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.boneMid }}>
                            {data.convergence}
                          </span>
                        </div>
                      )}
                      {data.divergence && (
                        <div>
                          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, color: BASE.steel, letterSpacing: '0.1em' }}>
                            DIVERGE:{' '}
                          </span>
                          <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.boneMid }}>
                            {data.divergence}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
