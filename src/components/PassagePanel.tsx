import { motion } from 'motion/react'
import { BASE } from '../theme'

interface Props {
  text: string
  reference: string
  onClose: () => void
}

function parseVerses(text: string): { num: string; content: string }[] {
  // Try to split on verse numbers like "[1]", "1 ", or verse-number patterns
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length > 1) {
    return lines.map((l, i) => {
      const m = l.match(/^(\d+)\s+(.*)/)
      return m ? { num: m[1], content: m[2] } : { num: '', content: l }
    })
  }
  // Single block — split on inline verse numbers like "[2]" or "2 " after sentence end
  const parts = text.split(/(?=\[\d+\]|\s+\d+\s)/).filter(Boolean)
  if (parts.length > 1) {
    return parts.map(p => {
      const m = p.match(/^\[?(\d+)\]?\s*(.*)/)
      return m ? { num: m[1], content: m[2].trim() } : { num: '', content: p.trim() }
    })
  }
  return [{ num: '', content: text }]
}

export function PassagePanel({ text, reference, onClose }: Props) {
  const verses = parseVerses(text)

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      style={{
        flexShrink: 0, overflow: 'hidden',
        background: `${BASE.bgCard}f4`,
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        borderRight: `1px solid ${BASE.borderGold}`,
        display: 'flex', flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: `1px solid ${BASE.borderDim}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel,
            letterSpacing: '0.14em', marginBottom: 3,
          }}>
            PASSAGE TEXT
          </div>
          <div style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 16, color: BASE.bone, fontWeight: 400,
          }}>
            {reference}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 24, height: 24, borderRadius: 0,
            border: `1px solid ${BASE.borderDim}`,
            background: 'transparent', color: BASE.steel,
            cursor: 'pointer', fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel }}
        >
          ×
        </button>
      </div>

      {/* Gold accent line */}
      <div style={{ height: 1, background: `linear-gradient(to right, ${BASE.gold}44, transparent)`, flexShrink: 0 }} />

      {/* Verse text */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 24px' }}>
        {verses.map((v, i) => (
          <div key={i} style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {v.num && (
              <span style={{
                fontFamily: 'JetBrains Mono', fontSize: 7.5, color: BASE.gold,
                opacity: 0.6, marginTop: 4, flexShrink: 0, letterSpacing: '0.06em',
                minWidth: 14, textAlign: 'right',
              }}>
                {v.num}
              </span>
            )}
            <span style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.boneMid,
              lineHeight: 1.75, letterSpacing: '0.01em',
            }}>
              {v.content}
            </span>
          </div>
        ))}
      </div>

      {/* Bottom fade */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, pointerEvents: 'none',
        background: `linear-gradient(to top, ${BASE.bgCard}f0, transparent)`,
      }} />
    </motion.div>
  )
}
