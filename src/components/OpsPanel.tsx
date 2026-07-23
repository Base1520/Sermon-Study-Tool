import { motion } from 'motion/react'
import { BASE, FONT, MOTION } from '../theme'

// Field Command panel chrome — the one skeleton every overlay panel wears.
// Classification-strip header, Bebas display title, consistent motion.

interface Props {
  title: string
  tag?: string                 // stencil sub-label, e.g. 'PLANNING · SUNDAYS'
  status?: { label: string; color?: string }
  width?: number
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  zIndex?: number
}

export function OpsPanel({ title, tag, status, width = 540, onClose, children, footer, zIndex = 9000 }: Props) {
  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width, zIndex,
        background: `linear-gradient(178deg, #1c2314 0%, ${BASE.bg} 40%)`,
        borderLeft: `1px solid ${BASE.borderGold}`,
        boxShadow: '-24px 0 64px rgba(0,0,0,0.55)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

      {/* Gold hairline top */}
      <div style={{
        height: 2, flexShrink: 0,
        background: `linear-gradient(90deg, transparent, ${BASE.gold}88, ${BASE.gold}, ${BASE.gold}88, transparent)`,
      }} />

      {/* Classification strip header */}
      <div style={{
        padding: '14px 20px 12px',
        borderBottom: `1px solid ${BASE.border}`,
        background: `${BASE.olive}30`,
        display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
      }}>
        <div style={{ width: 3, alignSelf: 'stretch', background: BASE.gold, borderRadius: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT.display, fontSize: 21, color: BASE.bone,
            letterSpacing: '0.1em', lineHeight: 1,
          }}>
            {title}
          </div>
          {tag && (
            <div style={{
              fontFamily: FONT.mono, fontSize: 6.5, color: BASE.steel,
              letterSpacing: '0.22em', marginTop: 4,
            }}>
              {tag}
            </div>
          )}
        </div>
        {status && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: status.color ?? BASE.gold,
              boxShadow: `0 0 8px ${status.color ?? BASE.gold}`,
            }} />
            <span style={{
              fontFamily: FONT.type, fontSize: 8, color: status.color ?? BASE.gold,
              letterSpacing: '0.1em',
            }}>
              {status.label}
            </span>
          </div>
        )}
        <button onClick={onClose}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}55` }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}
          style={{
            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
            background: 'transparent', border: `1px solid ${BASE.borderDim}`,
            color: BASE.steel, cursor: 'pointer', fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: `all ${MOTION.fast}s`,
          }}>
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, position: 'relative' }}>
        {children}
      </div>

      {footer && (
        <div style={{ flexShrink: 0, borderTop: `1px solid ${BASE.border}` }}>
          {footer}
        </div>
      )}
    </motion.div>
  )
}
