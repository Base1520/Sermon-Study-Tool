import { useState, useRef, useEffect } from 'react'

// Shared verse-preview tooltip. Wrap any scripture-reference chip:
//   <VerseHover reference="Rom 3:23"><button>Rom 3:23</button></VerseHover>
// Fetches KJV (no key needed) on first hover, caches for the session.

const cache = new Map<string, string>()
const GOLD = '#D8B33F'
const KHAKI = '#B8B49D'

interface Props {
  reference: string
  note?: string          // optional annotation shown under the verse text
  children: React.ReactNode
}

export function VerseHover({ reference, note, children }: Props) {
  const [show, setShow] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [pos, setPos]   = useState({ x: 0, y: 0 })
  const timer = useRef<number | null>(null)
  const alive = useRef(true)

  useEffect(() => () => {
    alive.current = false
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function enter(e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top })
    timer.current = window.setTimeout(async () => {
      if (!alive.current) return
      if (cache.has(reference)) { setText(cache.get(reference)!); setShow(true); return }
      setText(null)
      setShow(true)
      try {
        const t: string = await (window as any).electronAPI.fetchBible({
          reference, translation: 'kjv', esvKey: '',
        })
        const clipped = t.length > 440 ? t.slice(0, 440) + '…' : t
        cache.set(reference, clipped)
        if (alive.current) setText(clipped)
      } catch {
        if (alive.current) setText('Could not load this reference.')
      }
    }, 350)
  }

  function leave() {
    if (timer.current) clearTimeout(timer.current)
    setShow(false)
  }

  return (
    <span onMouseEnter={enter} onMouseLeave={leave} style={{ display: 'inline-flex' }}>
      {children}
      {show && (
        <div style={{
          position: 'fixed', left: pos.x, top: pos.y - 8,
          transform: 'translate(-50%, -100%)', zIndex: 99999,
          width: 300, pointerEvents: 'none',
          background: 'linear-gradient(168deg, #2b3620 0%, #222b18 100%)',
          border: `1px solid ${KHAKI}45`, borderRadius: 8,
          padding: '9px 12px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
        }}>
          <div style={{
            fontSize: 7, fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.12em', color: GOLD, marginBottom: 4,
          }}>
            {reference.toUpperCase()} · KJV
          </div>
          <div style={{
            fontSize: 12, fontFamily: 'Crimson Pro, serif',
            color: '#d8d0b8', lineHeight: 1.6,
          }}>
            {text ?? 'Loading…'}
          </div>
          {note && (
            <div style={{
              fontSize: 9.5, fontFamily: 'Crimson Pro, serif', fontStyle: 'italic',
              color: `${KHAKI}aa`, lineHeight: 1.5, marginTop: 6,
              borderTop: `1px solid ${KHAKI}20`, paddingTop: 5,
            }}>
              {note}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
