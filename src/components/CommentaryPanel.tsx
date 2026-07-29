import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'

type Provenance = 'SOURCE TEXT' | 'TEXTUAL INFERENCE' | 'EXTERNAL BACKGROUND' | 'THEOLOGICAL SYNTHESIS'

interface Claim {
  text: string
  provenance: Provenance
  citationIds: string[]
}

interface Voice {
  name: string
  era: string
  claims: Claim[]
}

interface Source {
  citationId: string
  author: string
  title: string
  publicationYear: string
  edition: string
  locator: string
  rightsTier: 'public_domain'
  canonicalUrl: string
  excerpt: string
  provenance: 'SOURCE TEXT'
}

interface CommentaryData {
  status: 'grounded' | 'no_result' | 'disabled'
  message: string
  sources: Source[]
  voices: Voice[]
  convergence?: Claim | null
  divergence?: Claim | null
}

interface Props {
  reference: string
  passageText?: string
  mainTheme: string
  apiKey: string
}

const PROVENANCE_COLOR: Record<Provenance, string> = {
  'SOURCE TEXT': BASE.moss,
  'TEXTUAL INFERENCE': BASE.khaki,
  'EXTERNAL BACKGROUND': BASE.steel,
  'THEOLOGICAL SYNTHESIS': BASE.gold,
}

function ProvenanceBadge({ value }: { value: Provenance }) {
  const color = PROVENANCE_COLOR[value]
  return (
    <span style={{
      fontFamily: 'JetBrains Mono', fontSize: 6.5, color,
      border: `1px solid ${color}55`, borderRadius: 10, padding: '2px 6px',
      letterSpacing: '0.08em', whiteSpace: 'nowrap',
    }}>{value}</span>
  )
}

function ClaimBlock({ claim }: { claim: Claim }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <ProvenanceBadge value={claim.provenance} />
      <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13.5, color: BASE.bone, lineHeight: 1.6, margin: 0 }}>
        {claim.text}
      </p>
      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, color: BASE.steel, lineHeight: 1.5 }}>
        {claim.citationIds.map(id => `[${id}]`).join(' ')}
      </span>
    </div>
  )
}

export function CommentaryPanel({ reference, passageText, mainTheme, apiKey }: Props) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<CommentaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOpen(false)
    setData(null)
    setError(null)
    setLoading(false)
  }, [reference])

  async function load() {
    if (data) { setOpen(value => !value); return }
    setOpen(true)
    setLoading(true)
    setError(null)
    try {
      const result = await (window as any).electronAPI.fetchCommentary({ reference, passageText, mainTheme, apiKey })
      setData(result)
    } catch {
      setError('The local commentary library could not be loaded. Nothing was generated from memory.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ borderTop: `1px solid ${BASE.borderDim}` }}>
      <button
        onClick={load}
        style={{
          width: '100%', padding: '10px 16px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Saira, sans-serif', fontSize: 12, color: BASE.khaki, letterSpacing: '0.14em' }}>
            CITED COMMENTARY
          </span>
          {loading && <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6, color: BASE.gold }}>searching local library…</span>}
        </div>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel }}>{open ? '▴' : '▾'}</span>
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
            <div style={{ padding: '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loading && <p style={{ color: BASE.boneMid, fontFamily: 'Crimson Pro, serif' }}>Searching verified excerpts…</p>}
              {error && <p style={{ color: BASE.boneMid, fontFamily: 'Crimson Pro, serif' }}>{error}</p>}
              {data && (
                <p style={{ color: data.status === 'grounded' ? BASE.moss : BASE.boneMid, fontFamily: 'Crimson Pro, serif', fontSize: 13, margin: 0 }}>
                  {data.message}
                </p>
              )}

              {data?.voices.map(voice => (
                <div key={`${voice.name}-${voice.era}`} style={{
                  background: `${BASE.gold}08`, border: `1px solid ${BASE.borderGold}`,
                  borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 9,
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.gold, fontWeight: 600 }}>{voice.name}</span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, color: BASE.steel }}>{voice.era}</span>
                  </div>
                  {voice.claims.map((claim, index) => <ClaimBlock key={`${voice.name}-${index}`} claim={claim} />)}
                </div>
              ))}

              {data?.convergence?.text && <ClaimBlock claim={data.convergence} />}
              {data?.divergence?.text && <ClaimBlock claim={data.divergence} />}

              {data?.sources.map(source => (
                <details key={source.citationId} style={{
                  border: `1px solid ${BASE.borderDim}`, borderRadius: 7, padding: '8px 10px',
                }}>
                  <summary style={{ cursor: 'pointer', color: BASE.bone, fontFamily: 'Crimson Pro, serif', fontSize: 12.5 }}>
                    <ProvenanceBadge value={source.provenance} />{' '}
                    {source.author} — {source.locator} [{source.citationId}]
                  </summary>
                  <p style={{ color: BASE.boneMid, fontFamily: 'Crimson Pro, serif', fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {source.excerpt}
                  </p>
                  <p style={{ color: BASE.steel, fontFamily: 'JetBrains Mono', fontSize: 6.5, margin: 0 }}>
                    {source.title} · {source.edition} · PUBLIC DOMAIN
                  </p>
                </details>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
