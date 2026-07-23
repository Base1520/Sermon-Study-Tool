import { useState, useEffect } from 'react'
import { BASE } from '../theme'

interface Props {
  onSave: (anthropicKey: string, esvKey?: string) => void
  onClose: () => void
  onDemo?: () => void
  existingKey: string
  existingEsvKey?: string
}

const ZOOMS = [
  { f: 1,    label: 'NORMAL' },
  { f: 1.15, label: 'LARGE' },
  { f: 1.3,  label: 'X-LARGE' },
  { f: 1.5,  label: 'HUGE' },
]

export function ApiKeyModal({ onSave, onClose, onDemo, existingKey, existingEsvKey = '' }: Props) {
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    ;(window as any).electronAPI.getUiZoom?.().then((z: number) => setZoom(z ?? 1)).catch(() => {})
  }, [])
  function applyZoom(f: number) {
    setZoom(f)
    ;(window as any).electronAPI.setUiZoom?.(f).catch(() => {})
  }
  const [key, setKey]       = useState(existingKey)
  const [esvKey, setEsvKey] = useState(existingEsvKey)
  const [showAnthropicHelp, setShowAnthropicHelp] = useState(!existingKey)

  const canSave = !!key

  const fieldStyle = {
    width: '100%',
    background: BASE.goldDim,
    border: `1px solid ${BASE.borderDim}`,
    borderRadius: 10, padding: '11px 14px',
    fontSize: 13, color: BASE.bone,
    fontFamily: 'JetBrains Mono', outline: 'none',
    letterSpacing: '0.04em', transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  }

  const stepStyle = {
    fontFamily: 'Crimson Pro, serif', fontSize: 12.5,
    color: BASE.boneMid, lineHeight: 1.6,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,12,9,0.75)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <div style={{
        background: `${BASE.bg}f4`,
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: `1px solid ${BASE.borderGold}`,
        borderRadius: 16, padding: 32, width: '100%', maxWidth: 460,
        boxShadow: `0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px ${BASE.borderDim}`,
        position: 'relative', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
          background: `linear-gradient(90deg, transparent, ${BASE.gold}66, transparent)`,
        }} />

        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 8 }}>
          API KEYS
        </div>
        <h2 style={{ fontFamily: 'Crimson Pro, serif', fontSize: 24, color: BASE.bone, marginBottom: 6, fontWeight: 400 }}>
          Connect Your APIs
        </h2>
        <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.steel, lineHeight: 1.6, marginBottom: 24 }}>
          Keys are stored locally on your device and never shared.
        </p>

        {/* Anthropic key */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.gold, letterSpacing: '0.12em', opacity: 0.9 }}>
              ANTHROPIC — all analysis &amp; agent chat
            </div>
            <button
              onClick={() => setShowAnthropicHelp(h => !h)}
              style={{
                fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel,
                background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em',
              }}
            >
              {showAnthropicHelp ? 'hide setup' : 'how to get key'}
            </button>
          </div>

          {showAnthropicHelp && (
            <div style={{
              background: `${BASE.gold}08`, border: `1px solid ${BASE.gold}22`,
              borderRadius: 8, padding: '12px 14px', marginBottom: 10,
            }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.1em', marginBottom: 8 }}>
                GET YOUR FREE API KEY
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <li style={stepStyle}>Go to <strong style={{ color: BASE.bone }}>console.anthropic.com</strong> and create a free account</li>
                <li style={stepStyle}>Click <strong style={{ color: BASE.bone }}>API Keys</strong> in the left sidebar</li>
                <li style={stepStyle}>Click <strong style={{ color: BASE.bone }}>Create Key</strong>, give it any name</li>
                <li style={stepStyle}>Copy the key (starts with <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: BASE.gold }}>sk-ant-</span>) and paste it below</li>
              </ol>
              <div style={{
                marginTop: 10, padding: '6px 10px',
                background: `${BASE.gold}0a`, borderRadius: 6,
                fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.steel, lineHeight: 1.5,
              }}>
                Note: Anthropic charges based on usage. For sermon prep, typical cost is $1–3/month.
              </div>
            </div>
          )}

          <input
            type="password" value={key}
            onChange={e => setKey(e.target.value.trim())}
            placeholder="sk-ant-..."
            autoComplete="off" spellCheck={false}
            style={{ ...fieldStyle, fontFamily: key ? 'JetBrains Mono' : 'Crimson Pro, serif' }}
            onFocus={e => (e.target.style.borderColor = BASE.borderGold)}
            onBlur={e => (e.target.style.borderColor = BASE.borderDim)}
            onKeyDown={e => e.key === 'Enter' && canSave && onSave(key)}
          />
        </div>

        {/* ESV key */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.khaki, letterSpacing: '0.12em', marginBottom: 6, opacity: 0.9 }}>
            ESV API KEY <span style={{ color: BASE.steel, fontWeight: 400 }}>(optional — unlocks ESV translation)</span>
          </div>
          <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.steel, lineHeight: 1.5, marginBottom: 8 }}>
            Free key at <strong style={{ color: BASE.boneMid }}>api.esv.org</strong>. Without it, KJV/ASV/YLT still work with no key required.
          </div>
          <input
            type="password" value={esvKey}
            onChange={e => setEsvKey(e.target.value.trim())}
            placeholder="Leave blank to use KJV / ASV / YLT instead"
            autoComplete="off" spellCheck={false}
            style={{ ...fieldStyle, fontFamily: esvKey ? 'JetBrains Mono' : 'Crimson Pro, serif' }}
            onFocus={e => (e.target.style.borderColor = `${BASE.khaki}66`)}
            onBlur={e => (e.target.style.borderColor = BASE.borderDim)}
            onKeyDown={e => e.key === 'Enter' && canSave && onSave(key, esvKey)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => canSave && onSave(key, esvKey)} disabled={!canSave}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10, cursor: canSave ? 'pointer' : 'not-allowed',
              background: canSave ? BASE.goldMid : `${BASE.olive}22`,
              border: `1px solid ${canSave ? BASE.borderGold : BASE.borderDim}`,
              color: canSave ? BASE.gold : BASE.steel,
              fontFamily: 'Crimson Pro, serif', fontSize: 14,
              letterSpacing: '0.04em', transition: 'all 0.2s',
            }}>
            Connect →
          </button>
          {existingKey && (
            <button onClick={onClose}
              style={{
                padding: '11px 20px', borderRadius: 10, cursor: 'pointer',
                background: 'none', border: `1px solid ${BASE.borderDim}`,
                color: BASE.steel, fontFamily: 'Crimson Pro, serif', fontSize: 14,
              }}>
              Cancel
            </button>
          )}
        </div>

        {/* Text size — accessibility, applies instantly and persists */}
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontFamily: 'Saira, sans-serif', fontSize: 12, letterSpacing: '0.14em',
            color: BASE.khaki, marginBottom: 8,
          }}>
            TEXT SIZE
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {ZOOMS.map(z => (
              <button key={z.f} onClick={() => applyZoom(z.f)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                  background: zoom === z.f ? `${BASE.gold}20` : 'transparent',
                  border: `1px solid ${zoom === z.f ? BASE.gold : BASE.borderDim}`,
                  color: zoom === z.f ? BASE.gold : BASE.steel,
                  fontFamily: 'Saira, sans-serif', fontSize: 11 + (z.f - 1) * 6,
                  letterSpacing: '0.08em', transition: 'all 0.15s',
                }}>
                {z.label}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7.5, color: BASE.steel, opacity: 0.7, marginTop: 5, letterSpacing: '0.06em' }}>
            Applies instantly · remembered next launch · ⌘+ / ⌘− also works anywhere
          </div>
        </div>

        {/* Demo mode — experience the desk without a key */}
        {!existingKey && onDemo && (
          <button onClick={onDemo}
            style={{
              marginTop: 10, width: '100%', padding: '9px 0', borderRadius: 10,
              cursor: 'pointer', background: 'transparent',
              border: `1px dashed ${BASE.gold}45`, color: `${BASE.gold}cc`,
              fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
              letterSpacing: '0.12em', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BASE.gold}10` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
            ✦ EXPLORE DEMO — ROMANS 8 (NO KEY NEEDED)
          </button>
        )}
      </div>
    </div>
  )
}
