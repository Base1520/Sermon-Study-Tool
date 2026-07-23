import type { PhrasingAnalysis } from '../types/phrasing'
import { BASE, FONT } from '../theme'

interface Props {
  analysis: PhrasingAnalysis
  apiKey: string
  onLoadRef: (reference: string) => void
  phraseMode: 'key' | 'all'
  onPhraseModeChange: (mode: 'key' | 'all') => void
}

// Cross-ref chips retired — the ⌒ Connections Map tile owns that job.
// This strip now carries the phrase-mode toggle only.
export function CrossRefs({ phraseMode, onPhraseModeChange }: Props) {

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
              fontFamily: FONT.display, fontSize: 12, letterSpacing: '0.1em',
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

      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, color: BASE.steel, letterSpacing: '0.12em', opacity: 0.7 }}>
        CONNECTIONS → ⌒ MAP TILE ON THE DESK
      </div>
    </div>
  )
}
