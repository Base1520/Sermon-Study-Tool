import { useState } from 'react'
import { BASE, FONT } from '../theme'
import { OpsPanel } from './OpsPanel'

const GOLD  = BASE.gold
const KHAKI = BASE.khaki
const STEEL = BASE.steel

interface HymnSuggestion {
  title: string
  composer?: string
  year?: string
  connection: string
  howToUse: 'opening' | 'response' | 'invitation' | 'offertory' | 'closing' | 'communion' | 'any'
}

interface Props {
  reference: string
  mainTheme: string
  outline: { point: string; label: string }[]
  apiKey: string
  onClose: () => void
}

const USE_LABELS: Record<string, string> = {
  opening: 'Opening',
  response: 'Response',
  invitation: 'Invitation',
  offertory: 'Offertory',
  closing: 'Closing',
  communion: 'Communion',
  any: 'Any point',
}

const USE_COLORS: Record<string, string> = {
  opening: '#7090c0',
  response: '#c09040',
  invitation: '#80a870',
  offertory: '#a0709a',
  closing: '#6090a8',
  communion: '#c07070',
  any: STEEL,
}

export function HymnSelector({ reference, mainTheme, outline, apiKey, onClose }: Props) {
  const [hymns, setHymns]       = useState<HymnSuggestion[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [copied, setCopied]     = useState(false)
  const [style, setStyle]       = useState<'traditional' | 'contemporary' | 'both'>('both')

  async function generate() {
    if (!apiKey) { setError('Anthropic key required'); return }
    setLoading(true); setError(null)
    try {
      const prompt = `You are a worship planning assistant helping a pastor select songs for a Sunday service.

Passage: ${reference}
Big Idea: ${mainTheme}
Sermon outline: ${outline.map(p => `${p.point} ${p.label}`).join(', ')}
Style preference: ${style === 'both' ? 'traditional hymns AND contemporary worship songs' : style === 'traditional' ? 'traditional hymns only' : 'contemporary worship songs only'}

Suggest 6 songs that connect deeply to the TEXT and theology of this passage — not just the topic. For each, explain specifically which phrase or doctrine in the passage the song addresses.

Return ONLY valid JSON (no markdown):
{
  "hymns": [
    {
      "title": "song title",
      "composer": "author or artist",
      "year": "year written or released",
      "connection": "1-2 sentences on HOW this song connects to the specific text and theology",
      "howToUse": "opening|response|invitation|offertory|closing|communion|any"
    }
  ]
}`

      const res = await (window as any).electronAPI.scholarChat({
        messages: [{ role: 'user', content: prompt }],
        apiKey, agentType: 'exegetical',
      })
      const raw = (res?.content ?? res ?? '').toString()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
      setHymns(parsed.hymns ?? [])
    } catch (e: any) {
      setError(e?.message ?? 'Could not generate suggestions')
    } finally { setLoading(false) }
  }

  function buildCopyText(): string {
    const lines = [
      `WORSHIP SUGGESTIONS — ${reference}`,
      `Big Idea: ${mainTheme}`,
      '',
      ...hymns.map(h =>
        `• ${h.title}${h.composer ? ` (${h.composer}${h.year ? `, ${h.year}` : ''})` : ''}\n  ${USE_LABELS[h.howToUse]} — ${h.connection}`
      ),
    ]
    return lines.join('\n')
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildCopyText()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const footer = hymns.length > 0 ? (
    <div style={{
      padding: '10px 20px',
      display: 'flex', alignItems: 'center', gap: 8,
      background: '#161914',
    }}>
      <span style={{ fontFamily: FONT.type, fontSize: 9, color: STEEL, letterSpacing: '0.06em' }}>
        {hymns.length} songs · send to your music minister
      </span>
      <div style={{ flex: 1 }} />
      <button onClick={handleCopy}
        style={{
          fontFamily: FONT.display, fontSize: 14, letterSpacing: '0.12em',
          padding: '5px 16px', borderRadius: 6,
          background: copied ? `${GOLD}22` : 'transparent',
          border: `1px solid ${copied ? GOLD : GOLD + '55'}`,
          color: GOLD,
          cursor: 'pointer', transition: 'all 0.2s',
        }}>
        {copied ? '✓ COPIED' : 'COPY TO CLIPBOARD'}
      </button>
    </div>
  ) : undefined

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,12,9,0.72)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      zIndex: 60,
    }}>
      <OpsPanel
        title="WORSHIP PLANNING"
        tag={`♪ SONG SELECTION · ${reference.toUpperCase()}`}
        status={loading
          ? { label: 'SUGGESTING' }
          : hymns.length > 0 ? { label: `${hymns.length} SONGS` } : undefined}
        width={560}
        zIndex={61}
        onClose={onClose}
        footer={footer}
      >
        {/* Passage readout */}
        <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${BASE.borderDim}` }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 6.5, color: STEEL, letterSpacing: '0.22em', marginBottom: 5 }}>
            BIG IDEA
          </div>
          <div style={{ fontFamily: FONT.type, fontSize: 12, color: KHAKI, lineHeight: 1.6 }}>
            {mainTheme}
          </div>
        </div>

        {/* Controls */}
        <div style={{
          padding: '12px 20px', borderBottom: `1px solid ${KHAKI}18`,
          display: 'flex', alignItems: 'center', gap: 8,
          position: 'sticky', top: 0, zIndex: 2, background: BASE.bg,
        }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 7, color: STEEL, letterSpacing: '0.12em' }}>STYLE</span>
          {(['both', 'traditional', 'contemporary'] as const).map(s => (
            <button key={s} onClick={() => setStyle(s)}
              style={{
                fontFamily: FONT.mono,
                fontSize: 7, letterSpacing: '0.08em', padding: '2px 8px',
                background: style === s ? `${GOLD}18` : 'transparent',
                border: `1px solid ${style === s ? GOLD : KHAKI + '30'}`,
                color: style === s ? GOLD : KHAKI,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
              {s.toUpperCase()}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={generate} disabled={loading}
            style={{
              fontFamily: FONT.display, fontSize: 14, letterSpacing: '0.12em',
              padding: '5px 16px', borderRadius: 6,
              background: loading ? `${GOLD}80` : GOLD,
              border: 'none',
              color: BASE.bg,
              cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
            {loading && (
              <span style={{ display:'inline-block', width:8, height:8, border:`1.5px solid ${BASE.bg}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            )}
            {loading ? 'SUGGESTING…' : hymns.length > 0 ? 'REGENERATE' : 'SUGGEST SONGS'}
          </button>
        </div>

        {error && (
          <div style={{ padding: '8px 20px', background: `${BASE.red}18`, fontFamily: FONT.type, fontSize: 9, color: BASE.red, letterSpacing: '0.04em' }}>
            ⚠ {error}
          </div>
        )}

        {/* Hymn list */}
        <div style={{ padding: hymns.length > 0 ? '0' : '40px 20px' }}>
          {hymns.length === 0 && !loading && (
            <div style={{ textAlign: 'center', fontFamily: FONT.serif, fontSize: 14, color: STEEL, fontStyle: 'italic', opacity: 0.6 }}>
              Hit "Suggest Songs" to get worship recommendations tied to this passage's theology.
            </div>
          )}
          {hymns.map((h, i) => (
            <div key={i} style={{
              padding: '14px 20px',
              borderBottom: i < hymns.length - 1 ? `1px solid ${KHAKI}14` : 'none',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FONT.display, fontSize: 17, color: BASE.bone, letterSpacing: '0.05em' }}>{h.title}</span>
                {h.composer && (
                  <span style={{ fontFamily: FONT.type, fontSize: 10, color: STEEL, opacity: 0.85 }}>
                    {h.composer}{h.year ? ` · ${h.year}` : ''}
                  </span>
                )}
                <span style={{
                  marginLeft: 'auto', fontFamily: FONT.mono, fontSize: 6.5,
                  color: USE_COLORS[h.howToUse] ?? STEEL,
                  background: `${USE_COLORS[h.howToUse] ?? STEEL}18`,
                  border: `1px solid ${USE_COLORS[h.howToUse] ?? STEEL}44`,
                  padding: '1px 6px', borderRadius: 3, letterSpacing: '0.08em', flexShrink: 0,
                }}>
                  {USE_LABELS[h.howToUse]}
                </span>
              </div>
              <p style={{ fontFamily: FONT.serif, fontSize: 13.5, color: KHAKI, lineHeight: 1.6, margin: 0, opacity: 0.9 }}>
                {h.connection}
              </p>
            </div>
          ))}
        </div>
      </OpsPanel>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
