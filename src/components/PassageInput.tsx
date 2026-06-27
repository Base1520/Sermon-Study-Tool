import { useState, useEffect } from 'react'
import { BASE } from '../theme'

interface Props {
  onAnalyze: (text: string, reference: string) => void
  loading: boolean
  prefillRef?: string | null
  onPrefillUsed?: () => void
  esvKey?: string
  onExpandPassage?: (text: string, reference: string) => void
}

const EXAMPLES = [
  { ref: 'Ephesians 2:8-10' },
  { ref: 'Romans 8:1' },
  { ref: 'John 1:1-5' },
]

const EXAMPLE_TEXTS: Record<string, string> = {
  'Ephesians 2:8-10': 'For by grace you have been saved through faith. And this is not your own doing; it is the gift of God, not a result of works, so that no one may boast. For we are his workmanship, created in Christ Jesus for good works, which God prepared beforehand, that we should walk in them.',
  'Romans 8:1': 'There is therefore now no condemnation for those who are in Christ Jesus.',
  'John 1:1-5': 'In the beginning was the Word, and the Word was with God, and the Word was God. He was in the beginning with God. All things were made through him, and without him was not any thing made that was made. In him was life, and the life was the light of men. The light shines in the darkness, and the darkness has not overcome it.',
}

export function PassageInput({ onAnalyze, loading, prefillRef, onPrefillUsed, esvKey, onExpandPassage }: Props) {
  const [reference, setReference] = useState('')
  const [text, setText] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [refFocused, setRefFocused] = useState(false)
  const [textFocused, setTextFocused] = useState(false)
  const canAnalyze = !loading && text.trim() && reference.trim()
  const canFetch = !!esvKey && reference.trim().length > 0 && !fetching && !loading

  useEffect(() => {
    if (prefillRef) { setReference(prefillRef); onPrefillUsed?.() }
  }, [prefillRef])

  async function handleFetchEsv() {
    if (!canFetch) return
    setFetching(true); setFetchError(null)
    try {
      const result = await (window as any).electronAPI.fetchEsv({ reference: reference.trim(), esvKey })
      setText(result)
    } catch (e: any) {
      setFetchError(e?.message ?? 'Could not fetch passage')
    } finally { setFetching(false) }
  }

  const label = (text: string, active?: boolean) => (
    <div style={{
      fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.16em',
      color: active ? BASE.gold : BASE.steel,
      marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
      transition: 'color 0.2s',
    }}>
      <span style={{ color: active ? BASE.gold : BASE.moss, opacity: active ? 1 : 0.6 }}>[ </span>
      {text}
      <span style={{ color: active ? BASE.gold : BASE.moss, opacity: active ? 1 : 0.6 }}> ]</span>
    </div>
  )

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    flex: 1, width: '100%',
    background: focused ? `${BASE.olive}44` : `${BASE.olive}22`,
    border: `1px solid ${focused ? BASE.moss : BASE.borderDim}`,
    borderRadius: 0, padding: '9px 12px',
    fontSize: 13, color: BASE.bone,
    fontFamily: 'Crimson Pro, serif',
    outline: 'none', transition: 'all 0.2s',
    boxShadow: focused ? `0 0 0 1px ${BASE.border}` : 'none',
  })

  return (
    <div style={{
      padding: '18px 16px 14px',
      borderBottom: `1px solid ${BASE.borderDim}`,
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .hud-input::placeholder { color: ${BASE.steel}; opacity: 0.5; }
        .hud-btn-analyze { transition: all 0.2s; }
        .hud-btn-analyze:hover:not(:disabled) {
          background: ${BASE.goldMid} !important;
          border-color: ${BASE.borderGold} !important;
          box-shadow: 0 0 24px ${BASE.gold}22 !important;
        }
      `}</style>

      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
      }}>
        <div style={{
          width: 3, height: 14, background: BASE.gold, flexShrink: 0,
          boxShadow: `0 0 6px ${BASE.gold}80`,
        }} />
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 7.5, letterSpacing: '0.18em',
          color: BASE.gold, opacity: 0.8,
        }}>MISSION INTEL</span>
        <div style={{ flex: 1, height: 1, background: BASE.borderDim }} />
        <div style={{
          width: 5, height: 5, borderRadius: '50%',
          background: loading ? BASE.gold : BASE.moss,
          boxShadow: loading ? `0 0 8px ${BASE.gold}` : 'none',
          animation: loading ? 'blink 1s ease infinite' : 'none',
        }} />
      </div>

      {/* Reference */}
      {label('TARGET REFERENCE', refFocused)}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, alignItems: 'stretch' }}>
        <input
          className="selectable hud-input"
          value={reference}
          onChange={e => { setReference(e.target.value); setFetchError(null) }}
          onKeyDown={e => e.key === 'Enter' && handleFetchEsv()}
          onFocus={() => setRefFocused(true)}
          onBlur={() => setRefFocused(false)}
          placeholder="e.g. Romans 8:1"
          style={{ ...inputStyle(refFocused), borderRight: esvKey ? 'none' : undefined }}
        />
        {esvKey && (
          <button
            onClick={handleFetchEsv}
            disabled={!canFetch}
            title="Fetch from ESV"
            style={{
              padding: '0 11px',
              background: canFetch ? `${BASE.olive}55` : `${BASE.olive}22`,
              borderTop: `1px solid ${canFetch ? BASE.moss : BASE.borderDim}`,
              borderRight: `1px solid ${canFetch ? BASE.moss : BASE.borderDim}`,
              borderBottom: `1px solid ${canFetch ? BASE.moss : BASE.borderDim}`,
              borderLeft: 'none',
              borderRadius: 0,
              cursor: canFetch ? 'pointer' : 'not-allowed',
              color: canFetch ? BASE.gold : BASE.steel,
              fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.08em',
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'all 0.2s', whiteSpace: 'nowrap',
            }}
          >
            {fetching ? (
              <span style={{
                display: 'inline-block', width: 8, height: 8,
                border: `1.5px solid ${BASE.moss}`, borderTopColor: BASE.gold,
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }} />
            ) : <span>↓</span>}
            esv
          </button>
        )}
      </div>

      {fetchError && (
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 7.5, color: BASE.red,
          marginBottom: 10, letterSpacing: '0.08em', padding: '4px 8px',
          border: `1px solid ${BASE.red}33`, background: `${BASE.red}11`,
        }}>
          ⚠ {fetchError}
        </div>
      )}

      {/* Passage text */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {label('PASSAGE FEED', textFocused)}
        {text && onExpandPassage && (
          <button
            onClick={() => onExpandPassage(text, reference)}
            title="View full passage"
            style={{
              background: 'none', border: `1px solid ${BASE.borderDim}`, borderRadius: 0,
              color: BASE.steel, cursor: 'pointer', padding: '1px 6px',
              fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.08em',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = BASE.moss }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}
          >
            ⤢
          </button>
        )}
      </div>
      <textarea
        className="selectable hud-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onFocus={() => setTextFocused(true)}
        onBlur={() => setTextFocused(false)}
        placeholder={esvKey ? 'Enter reference + ↓ esv to fetch…' : 'Paste passage text here…'}
        style={{
          ...inputStyle(textFocused),
          resize: 'none', lineHeight: 1.65,
          minHeight: 80,
          height: text ? Math.min(Math.max(Math.ceil(text.length / 38) * 20, 80), 200) : 80,
          transition: 'height 0.2s ease',
        }}
      />

      {/* Initiate Analysis */}
      <button
        className="hud-btn-analyze"
        onClick={() => canAnalyze && onAnalyze(text.trim(), reference.trim())}
        disabled={!canAnalyze}
        style={{
          marginTop: 12, width: '100%', padding: '11px 0',
          background: canAnalyze ? `${BASE.olive}66` : `${BASE.olive}22`,
          border: `1px solid ${canAnalyze ? BASE.moss : BASE.borderDim}`,
          borderRadius: 0,
          cursor: canAnalyze ? 'pointer' : 'not-allowed',
          color: canAnalyze ? BASE.bone : BASE.steel,
          fontFamily: 'JetBrains Mono',
          fontSize: 8.5, letterSpacing: '0.18em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          position: 'relative', overflow: 'hidden',
        }}
      >
        {/* left accent bar */}
        {canAnalyze && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
            background: BASE.gold, boxShadow: `0 0 8px ${BASE.gold}`,
          }} />
        )}
        {loading ? (
          <>
            <span style={{
              display: 'inline-block', width: 10, height: 10,
              border: `1.5px solid ${BASE.moss}`, borderTopColor: BASE.gold,
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            ANALYZING…
          </>
        ) : (
          <>
            <span style={{ color: canAnalyze ? BASE.gold : BASE.steel }}>◈</span>
            SEND IT
          </>
        )}
      </button>

      {/* Example passages */}
      <div style={{ marginTop: 16 }}>
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel,
          letterSpacing: '0.14em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ color: BASE.moss, opacity: 0.6 }}>[ </span>SAMPLE TARGETS<span style={{ color: BASE.moss, opacity: 0.6 }}> ]</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {EXAMPLES.map(ex => (
            <button key={ex.ref}
              onClick={() => { setReference(ex.ref); setText(EXAMPLE_TEXTS[ex.ref] ?? ''); setFetchError(null) }}
              style={{
                textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'Crimson Pro, serif', fontSize: 13,
                color: BASE.steel, padding: '4px 0',
                display: 'flex', alignItems: 'center', gap: 7,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget.style.color = BASE.boneMid)
                const dot = e.currentTarget.querySelector('.ref-dot') as HTMLElement
                if (dot) dot.style.background = BASE.gold
              }}
              onMouseLeave={e => {
                (e.currentTarget.style.color = BASE.steel)
                const dot = e.currentTarget.querySelector('.ref-dot') as HTMLElement
                if (dot) dot.style.background = BASE.moss
              }}
            >
              <span className="ref-dot" style={{
                width: 4, height: 4, borderRadius: '50%', background: BASE.moss,
                flexShrink: 0, transition: 'background 0.15s',
              }} />
              {ex.ref}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
