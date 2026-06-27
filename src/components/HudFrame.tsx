import type { ReactNode, CSSProperties } from 'react'
import { BASE } from '../theme'

interface Props {
  children: ReactNode
  style?: CSSProperties
  cornerSize?: number
  cornerColor?: string
  label?: string
  labelPosition?: 'top-left' | 'top-right'
  active?: boolean
}

export function HudFrame({
  children,
  style,
  cornerSize = 14,
  cornerColor,
  label,
  labelPosition = 'top-left',
  active = false,
}: Props) {
  const color = cornerColor ?? (active ? BASE.gold : BASE.moss)
  const c = cornerSize

  const corner = (pos: 'tl' | 'tr' | 'bl' | 'br') => {
    const isTop = pos === 'tl' || pos === 'tr'
    const isLeft = pos === 'tl' || pos === 'bl'
    return (
      <svg
        width={c} height={c}
        style={{
          position: 'absolute',
          top: isTop ? 0 : undefined,
          bottom: !isTop ? 0 : undefined,
          left: isLeft ? 0 : undefined,
          right: !isLeft ? 0 : undefined,
          zIndex: 5,
          transition: 'all 0.4s ease',
        }}
      >
        {pos === 'tl' && <><line x1={0} y1={c} x2={0} y2={0} stroke={color} strokeWidth={1.5} /><line x1={0} y1={0} x2={c} y2={0} stroke={color} strokeWidth={1.5} /></>}
        {pos === 'tr' && <><line x1={c} y1={c} x2={c} y2={0} stroke={color} strokeWidth={1.5} /><line x1={c} y1={0} x2={0} y2={0} stroke={color} strokeWidth={1.5} /></>}
        {pos === 'bl' && <><line x1={0} y1={0} x2={0} y2={c} stroke={color} strokeWidth={1.5} /><line x1={0} y1={c} x2={c} y2={c} stroke={color} strokeWidth={1.5} /></>}
        {pos === 'br' && <><line x1={c} y1={0} x2={c} y2={c} stroke={color} strokeWidth={1.5} /><line x1={c} y1={c} x2={0} y2={c} stroke={color} strokeWidth={1.5} /></>}
      </svg>
    )
  }

  return (
    <div style={{ position: 'relative', ...style }}>
      {corner('tl')}
      {corner('tr')}
      {corner('bl')}
      {corner('br')}
      {label && (
        <div style={{
          position: 'absolute',
          top: -9,
          left: labelPosition === 'top-left' ? 20 : undefined,
          right: labelPosition === 'top-right' ? 20 : undefined,
          fontFamily: 'JetBrains Mono',
          fontSize: 7,
          letterSpacing: '0.14em',
          color: active ? BASE.gold : BASE.steel,
          background: BASE.bg,
          padding: '0 6px',
          zIndex: 6,
          transition: 'color 0.4s',
        }}>
          {label}
        </div>
      )}
      {children}
    </div>
  )
}
