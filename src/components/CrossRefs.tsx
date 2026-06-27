import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { CrossRef, PhrasingAnalysis } from '../types/phrasing'
import { BASE } from '../theme'

interface Props {
  analysis: PhrasingAnalysis
  apiKey: string
  onLoadRef: (reference: string) => void
  phraseMode: 'key' | 'all'
  onPhraseModeChange: (mode: 'key' | 'all') => void
}

export function CrossRefs({ analysis, apiKey, onLoadRef, phraseMode, onPhraseModeChange }: Props) {
  const [refs, setRefs] = useState<CrossRef[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function fetch() {
    if (loaded) return
    setLoading(true)
    try {
      const result = await (window as any).electronAPI.getCrossRefs({
        reference: analysis.reference,
        mainTheme: analysis.mainTheme,
        biblicalThemes: analysis.canonicalContext.biblicalThemes,
        apiKey,
      })
      setRefs(result)
      setLoaded(true)
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      padding: '6px 20px',
      borderTop: `1px solid ${BASE.borderDim}`,
      background: `${BASE.bg}88`,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      {/* Phrase mode toggle — lives here, out of the canvas */}
      <div style={{
        display: 'flex', background: `${BASE.bg}cc`,
        border: `1px solid ${BASE.borderDim}`, borderRadius: 20,
        padding: 2, gap: 1, flexShrink: 0,
      }}>
        {(['key', 'all'] as const).map(mode => (
          <button key={mode}
            onClick={() => onPhraseModeChange(mode)}
            style={{
              fontFamily: 'JetBrains Mono', fontSize: 7.5, letterSpacing: '0.1em',
              padding: '3px 12px', borderRadius: 16, border: 'none',
              cursor: 'pointer',
              background: phraseMode === mode ? BASE.goldMid : 'transparent',
              color: phraseMode === mode ? BASE.gold : BASE.steel,
              transition: 'all 0.15s',
            }}>
            {mode === 'key' ? 'KEY CLAUSES' : 'ALL VERSES'}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: BASE.borderDim, flexShrink: 0 }} />

      <button
        onClick={fetch}
        disabled={loading}
        style={{
          fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.1em',
          color: loaded ? BASE.steel : BASE.gold,
          background: 'transparent', border: 'none', cursor: loading || loaded ? 'default' : 'pointer',
          padding: '4px 0', flexShrink: 0, whiteSpace: 'nowrap',
        }}>
        {loading ? 'finding…' : loaded ? 'cross-refs' : '+ cross-refs'}
      </button>

      <AnimatePresence>
        {refs.map((ref, i) => (
          <motion.button
            key={ref.reference}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06 }}
            title={ref.reason}
            onClick={() => onLoadRef(ref.reference)}
            style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 13,
              color: BASE.bone,
              background: BASE.goldDim,
              border: `1px solid ${BASE.borderGold}`,
              borderRadius: 6, padding: '3px 10px',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BASE.goldMid }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = BASE.goldDim }}
          >
            {ref.reference}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}
