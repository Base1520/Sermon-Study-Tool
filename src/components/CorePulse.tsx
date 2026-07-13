import { useEffect, useRef, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { PhrasingAnalysis, Phrase, ClauseType } from '../types/phrasing'
import { CLAUSE_COLORS } from '../services/colors'
import { BASE } from '../theme'

interface Props {
  analysis?: PhrasingAnalysis | null
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onSwitchTab?: (tab: string) => void
  onOpenAgent?: (type: 'exegetical' | 'theological' | 'homiletical') => void
  currentTab?: string
}

// ── Ring / tick canvas ─────────────────────────────────────────────────────────
function RingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap   = wrapRef.current!
    let animId: number, t = 0

    function resize() {
      const r = wrap.getBoundingClientRect()
      canvas.width  = r.width
      canvas.height = r.height
    }

    requestAnimationFrame(() => { resize(); draw() })
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    function draw() {
      t += 0.005
      const W = canvas.width, H = canvas.height
      if (!W || !H) { animId = requestAnimationFrame(draw); return }
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, W, H)

      const cx = W / 2, cy = H * 0.42
      const base = Math.min(W, H) * 0.46

      for (let p = 0; p < 3; p++) {
        const phase = t * 0.45 + p * (Math.PI * 2 / 3)
        const frac  = (Math.sin(phase) + 1) / 2
        const r     = base * (0.55 + 0.45 * frac)
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(216,179,63,${0.025 * (1 - frac)})`
        ctx.lineWidth = 1; ctx.stroke()
      }

      ;[0.28, 0.46, 0.62, 0.76].forEach((f, i) => {
        const r = f * base * 2
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(103,112,79,${0.06 - i * 0.01})`
        ctx.setLineDash([4, 10]); ctx.lineWidth = 0.5; ctx.stroke()
        ctx.setLineDash([])
      })

      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.07)
      const tickR = base * 0.62
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2
        const isLong = i % 12 === 0, isMed = i % 4 === 0
        const r1 = tickR - (isLong ? 14 : isMed ? 7 : 3.5)
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1)
        ctx.lineTo(Math.cos(a) * tickR, Math.sin(a) * tickR)
        ctx.strokeStyle = `rgba(216,179,63,${isLong ? 0.2 : isMed ? 0.07 : 0.02})`
        ctx.lineWidth = isLong ? 1.5 : 0.5; ctx.stroke()
      }
      ctx.restore()

      animId = requestAnimationFrame(draw)
    }

    return () => { cancelAnimationFrame(animId); ro.disconnect() }
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}

// ── Orbital node positions ─────────────────────────────────────────────────────
function computeOrbit(phrases: Phrase[], cx: number, cy: number, baseR: number) {
  const RADII   = [0, 0.28, 0.46, 0.62, 0.76].map(f => f * baseR)
  const byLevel = new Map<number, Phrase[]>()
  for (const p of phrases) {
    if (!byLevel.has(p.level)) byLevel.set(p.level, [])
    byLevel.get(p.level)!.push(p)
  }
  return phrases.map(p => {
    const r      = RADII[Math.min(p.level, RADII.length - 1)]
    const peers  = byLevel.get(p.level)!
    const idx    = peers.indexOf(p)
    const n      = peers.length
    const offset = p.level * 0.7
    const angle  = n === 1 ? -Math.PI / 2 : (idx / n) * Math.PI * 2 - Math.PI / 2 + offset
    return { phrase: p, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r }
  })
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}

// ── Corner definitions ─────────────────────────────────────────────────────────
const CORNERS = [
  { id: 'phrase',  label: 'PHRASE',  sub: 'Clause · Syntax · Flow',   icon: '⌥', corner: 'tl' as const },
  { id: 'outline', label: 'OUTLINE', sub: 'Argument · Structure',      icon: '≡', corner: 'tr' as const },
  { id: 'scholar', label: 'SCHOLAR', sub: 'Chat · Research',           icon: 'λ', corner: 'bl' as const },
  { id: 'draft',   label: 'DRAFT',   sub: 'Manuscript · Eisegesis',    icon: '✦', corner: 'br' as const },
]

// ── Main export ────────────────────────────────────────────────────────────────
export function CorePulse({ analysis, selectedId, onSelect, onSwitchTab, onOpenAgent, currentTab: propTab }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dims, setDims]                     = useState({ w: 0, h: 0 })
  const [hoveredId, setHoveredId]           = useState<string | null>(null)
  const [hoveredCorner, setHoveredCorner]   = useState<string | null>(null)
  const [activeTab, setActiveTab]           = useState(propTab ?? 'phrase')
  const [expanding, setExpanding]           = useState<string | null>(null)

  useEffect(() => { if (propTab) setActiveTab(propTab) }, [propTab])

  useEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setDims({ w: r.width, h: r.height })
    })
    ro.observe(el)
    const r = el.getBoundingClientRect()
    setDims({ w: r.width, h: r.height })
    return () => ro.disconnect()
  }, [])

  const { w, h } = dims

  // B center and hub orbit geometry
  const bCx = w / 2
  const bCy = h * 0.42
  const hubR = Math.min(w, h) * 0.24

  // Phrase constellation lives in top-left quadrant — nudged in from edges
  const consCx = Math.max(w / 4, 80)
  const consCy = Math.max(h / 4, 80)
  const baseR  = Math.min(w / 2 - 20, h / 2 - 20) * 0.68

  const orbits = useMemo(() => {
    if (!analysis || !w) return []
    return computeOrbit(analysis.phrases, consCx, consCy, baseR)
  }, [analysis, consCx, consCy, baseR])

  const selected = analysis?.phrases.find(p => p.id === selectedId)
  const hovered  = orbits.find(o => o.phrase.id === hoveredId)

  function handleNav(tabId: string) {
    if (expanding) return
    setExpanding(tabId)
    setTimeout(() => {
      setExpanding(null)
      setActiveTab(tabId)
      onSwitchTab?.(tabId)
    }, 320)
  }

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>

      {/* Background ring canvas — reduced opacity so it doesn't compete */}
      <RingCanvas />

      {/* ── B core — translucent logo watermark, no bloom ── */}
      {w > 0 && (
        <img
          src="/b-icon.png"
          alt=""
          style={{
            position: 'absolute',
            left: '50%', top: '42%',
            transform: 'translate(-50%, -50%)',
            width:  Math.min(w, h) * 0.26,
            height: Math.min(w, h) * 0.26,
            opacity: 0.07,
            mixBlendMode: 'screen' as const,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* ── Corner bracket decoration ── */}
      {w > 0 && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}>
          {([
            { x: 10, y: 10, dx: 1, dy: 1 },
            { x: w - 10, y: 10, dx: -1, dy: 1 },
            { x: 10, y: h - 10, dx: 1, dy: -1 },
            { x: w - 10, y: h - 10, dx: -1, dy: -1 },
          ] as const).map(({ x, y, dx, dy }, i) => (
            <g key={i}>
              <line x1={x} y1={y} x2={x + dx * 14} y2={y} stroke={BASE.gold} strokeWidth={1} strokeOpacity={0.35} />
              <line x1={x} y1={y} x2={x} y2={y + dy * 14} stroke={BASE.gold} strokeWidth={1} strokeOpacity={0.35} />
            </g>
          ))}
        </svg>
      )}

      {/* ── Phrase constellation SVG — top-left quadrant ── */}
      {w > 0 && (
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden', zIndex: 7 }}
          onClick={e => { if (e.target === e.currentTarget) onSelect?.(null) }}
        >
          {/* Root → center connector lines */}
          {orbits.filter(o => !o.phrase.parentId).map(({ phrase, x, y }) => {
            const color = CLAUSE_COLORS[phrase.type as ClauseType] ?? BASE.steel
            const angle = Math.atan2(y - consCy, x - consCx)
            const ex = consCx + Math.cos(angle) * 12
            const ey = consCy + Math.sin(angle) * 12
            return (
              <line key={`root-${phrase.id}`} x1={ex} y1={ey} x2={x} y2={y}
                stroke={color} strokeWidth={selectedId === phrase.id ? 1.5 : 0.8}
                strokeOpacity={selectedId === phrase.id ? 0.75 : 0.4}
                strokeDasharray="4 6" style={{ transition: 'all 0.3s' }} />
            )
          })}

          {/* Child → parent connector lines */}
          {orbits.map(({ phrase, x, y }) => {
            if (!phrase.parentId) return null
            const parent = orbits.find(o => o.phrase.id === phrase.parentId)
            if (!parent) return null
            const color    = CLAUSE_COLORS[phrase.type as ClauseType] ?? BASE.steel
            const isActive = selectedId === phrase.id || selectedId === phrase.parentId
            const isHov    = hoveredId === phrase.id
            return (
              <line key={`line-${phrase.id}`} x1={parent.x} y1={parent.y} x2={x} y2={y}
                stroke={color}
                strokeWidth={isActive || isHov ? 1.5 : 0.7}
                strokeOpacity={isActive ? 0.75 : isHov ? 0.55 : 0.3}
                strokeDasharray={isActive ? 'none' : '4 6'}
                style={{ transition: 'all 0.3s' }} />
            )
          })}

          {/* Constellation center — small circle when analysis loaded */}
          {analysis && (
            <circle cx={consCx} cy={consCy} r={11}
              fill={BASE.bgCard} stroke={BASE.borderGold} strokeWidth={0.8} strokeOpacity={0.55} />
          )}

          {/* Phrase nodes */}
          {orbits.map(({ phrase, x, y }) => {
            const color      = CLAUSE_COLORS[phrase.type as ClauseType] ?? BASE.steel
            const isMain     = phrase.type === 'main'
            const isSelected = selectedId === phrase.id
            const isHov      = hoveredId === phrase.id
            const isDimmed   = !!(selectedId && !isSelected && !isMain)
            const r          = isMain ? 12 : 8

            // Abbreviated label — show phrase text below node
            const label = truncate(phrase.text, 22)

            return (
              <g key={phrase.id}
                style={{ cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); onSelect?.(isSelected ? null : phrase.id) }}
                onMouseEnter={() => setHoveredId(phrase.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Pulse ring when selected */}
                {(isSelected || isHov) && (
                  <circle cx={x} cy={y} r={r + 7} fill="none"
                    stroke={color} strokeWidth={1} strokeOpacity={0.45}>
                    {isSelected && <animate attributeName="r" values={`${r+5};${r+13};${r+5}`} dur="2s" repeatCount="indefinite" />}
                  </circle>
                )}
                <circle cx={x} cy={y} r={r + 5}  fill={color} fillOpacity={isSelected ? 0.14 : isHov ? 0.09 : 0.05} />
                <circle cx={x} cy={y} r={r}
                  fill={BASE.bgCard} stroke={color}
                  strokeWidth={isSelected ? 2 : isMain ? 1.5 : 1}
                  strokeOpacity={isDimmed ? 0.2 : isSelected ? 1 : isMain ? 0.95 : 0.7}
                  style={{ transition: 'stroke-opacity 0.3s' }}
                />
                <circle cx={x} cy={y} r={isMain ? 4.5 : 3}
                  fill={color}
                  fillOpacity={isDimmed ? 0.1 : isSelected ? 1 : 0.75}
                  style={{ filter: isSelected ? `drop-shadow(0 0 5px ${color})` : 'none', transition: 'fill-opacity 0.3s' }}
                />

                {/* Clause type label above node */}
                {!isDimmed && (
                  <text x={x} y={y - r - 5} textAnchor="middle" fontSize={6}
                    fontFamily="JetBrains Mono" fill={color} fillOpacity={0.55}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {phrase.type}
                  </text>
                )}

                {/* Phrase text label below node */}
                <text x={x} y={y + r + 10} textAnchor="middle" fontSize={8.5}
                  fontFamily="Crimson Pro, serif" fill={color}
                  fillOpacity={isDimmed ? 0.12 : isSelected ? 0.95 : isHov ? 0.85 : 0.6}
                  style={{ transition: 'fill-opacity 0.3s' }}>
                  {label}
                </text>

                {/* Connective label at midpoint */}
                {phrase.connective && !isDimmed && (() => {
                  const parent = orbits.find(o => o.phrase.id === phrase.parentId)
                  if (!parent) return null
                  const mx = (parent.x + x) / 2, my = (parent.y + y) / 2
                  return (
                    <text x={mx} y={my - 5} textAnchor="middle" fontSize={7}
                      fontFamily="JetBrains Mono" fill={color} fillOpacity={0.65}>
                      {phrase.connective}
                    </text>
                  )
                })()}
              </g>
            )
          })}

        </svg>
      )}

      {/* ── Orbital hub nodes — 4 spokes radiating from center B ── */}
      {w > 0 && (
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden', zIndex: 8 }}
        >
          {CORNERS.map(c => {
            const angle =
              c.id === 'phrase'  ? -Math.PI / 2        :  // top
              c.id === 'outline' ?  0                   :  // right
              c.id === 'scholar' ?  Math.PI / 2         :  // bottom
                                   Math.PI               // left (draft)
            const hx = bCx + hubR * Math.cos(angle)
            const hy = bCy + hubR * Math.sin(angle)
            const isActive = activeTab === c.id
            const isHov = hoveredCorner === c.id
            const color = isActive ? BASE.gold : isHov ? BASE.khaki : BASE.steel

            // Line endpoint: stop short of hub circle edge (r=24) and B center (r=14)
            const dist = Math.sqrt((hx - bCx) ** 2 + (hy - bCy) ** 2)
            const ux = (hx - bCx) / dist, uy = (hy - bCy) / dist
            const lx1 = bCx + ux * 14, ly1 = bCy + uy * 14
            const lx2 = hx  - ux * 26, ly2 = hy  - uy * 26

            return (
              <g key={c.id}
                style={{ cursor: 'pointer' }}
                onClick={() => handleNav(c.id)}
                onMouseEnter={() => setHoveredCorner(c.id)}
                onMouseLeave={() => setHoveredCorner(null)}
              >
                {/* Spoke line */}
                <line x1={lx1} y1={ly1} x2={lx2} y2={ly2}
                  stroke={isActive ? BASE.gold : BASE.border}
                  strokeWidth={isActive ? 1.2 : 0.7}
                  strokeOpacity={isActive ? 0.55 : isHov ? 0.35 : 0.2}
                  strokeDasharray={isActive ? 'none' : '4 8'}
                />

                {/* Outer glow ring when active */}
                {(isActive || isHov) && (
                  <circle cx={hx} cy={hy} r={34}
                    fill={BASE.gold}
                    fillOpacity={isActive ? 0.06 : 0.04}
                  />
                )}

                {/* Hub circle */}
                <circle cx={hx} cy={hy} r={24}
                  fill={isActive ? `${BASE.gold}12` : isHov ? `${BASE.gold}08` : `${BASE.bgCard}cc`}
                  stroke={color}
                  strokeWidth={isActive ? 1.4 : 0.8}
                  strokeOpacity={isActive ? 0.75 : isHov ? 0.5 : 0.28}
                  style={{ transition: 'all 0.2s' }}
                />

                {/* Active pulse ring */}
                {isActive && (
                  <circle cx={hx} cy={hy} r={28} fill="none"
                    stroke={BASE.gold} strokeWidth={0.8} strokeOpacity={0.3}>
                    <animate attributeName="r" values="26;34;26" dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.3;0;0.3" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Icon */}
                <text x={hx} y={hy - 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={c.id === 'scholar' ? 17 : 13}
                  fontFamily={c.id === 'scholar' ? 'Crimson Pro, serif' : 'JetBrains Mono'}
                  fill={color}
                  fillOpacity={isActive ? 1 : isHov ? 0.8 : 0.45}
                  style={{ transition: 'all 0.2s' }}
                >{c.icon}</text>

                {/* Label below icon */}
                <text x={hx} y={hy + 11}
                  textAnchor="middle"
                  fontSize={6.5} fontFamily="JetBrains Mono" letterSpacing="0.12em"
                  fill={color}
                  fillOpacity={isActive ? 0.9 : isHov ? 0.65 : 0.3}
                  style={{ transition: 'all 0.2s' }}
                >{c.label}</text>

                {/* Active dot at spoke midpoint */}
                {isActive && (
                  <circle
                    cx={(lx1 + lx2) / 2} cy={(ly1 + ly2) / 2}
                    r={2} fill={BASE.gold} fillOpacity={0.7}
                  />
                )}
              </g>
            )
          })}
        </svg>
      )}


      {/* Status bar (analysis loaded) */}
      {analysis && w > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          fontFamily: 'JetBrains Mono', fontSize: 5.5, color: BASE.steel, opacity: 0.3,
          letterSpacing: '0.12em', textAlign: 'center', padding: '3px 0',
          pointerEvents: 'none', zIndex: 3,
        }}>
          {`· SYS ONLINE · CORPUS READY · MIND · BODY · SPIRIT ·`}
        </div>
      )}

      {/* Hover tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div key={hovered.phrase.id}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              left: Math.min(hovered.x + 16, w - 240),
              top:  Math.max(hovered.y - 44, 8),
              maxWidth: 220,
              background: `${BASE.bgCard}f0`, backdropFilter: 'blur(16px)',
              border: `1px solid ${CLAUSE_COLORS[hovered.phrase.type as ClauseType] ?? BASE.steel}40`,
              borderRadius: 0, padding: '8px 12px',
              pointerEvents: 'none', zIndex: 20,
            }}
          >
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7,
              color: CLAUSE_COLORS[hovered.phrase.type as ClauseType] ?? BASE.steel,
              textTransform: 'capitalize', marginBottom: 4, letterSpacing: '0.07em' }}>
              {hovered.phrase.type}
            </div>
            <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.bone, lineHeight: 1.45, margin: '0 0 5px' }}>
              {hovered.phrase.text}
            </p>
            {hovered.phrase.theologicalNote && (
              <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 11, color: BASE.boneMid, lineHeight: 1.4, margin: 0, fontStyle: 'italic' }}>
                {hovered.phrase.theologicalNote}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected phrase label */}
      <AnimatePresence mode="wait">
        {analysis && selected && (
          <motion.div key={selectedId}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'absolute',
              left: consCx, top: Math.min(consCy + baseR * 0.8 + 16, h / 2 - 24),
              transform: 'translateX(-50%)',
              width: Math.min(baseR * 2, w / 2 - 20),
              textAlign: 'center', pointerEvents: 'none', zIndex: 5,
            }}
          >
            <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 10,
              color: CLAUSE_COLORS[selected.type as ClauseType] ?? BASE.bone,
              lineHeight: 1.4, fontStyle: 'italic', opacity: 0.85, margin: 0 }}>
              {selected.text.slice(0, 60)}{selected.text.length > 60 ? '…' : ''}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Zoom / expand animation ── */}
      <AnimatePresence>
        {expanding && (
          <motion.div
            key={expanding}
            initial={{ opacity: 0.6, scale: 0.15 }}
            animate={{ opacity: 1,   scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'absolute', inset: 0,
              background: `${BASE.bg}e8`,
              backdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 50,
              transformOrigin:
                expanding === 'phrase'  ? '50% 10%'  :
                expanding === 'outline' ? '90% 42%'  :
                expanding === 'scholar' ? '50% 75%'  : '10% 42%',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <img src="/b-icon.png" alt="" style={{ width: 40, height: 40, opacity: 0.6 }} />
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.gold, letterSpacing: '0.22em' }}>
                {expanding.toUpperCase()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
