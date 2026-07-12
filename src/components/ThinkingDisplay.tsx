import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'

const N = 8
const R = 88
const CX = 130
const CY = 130

const VERTEX_LABELS = [
  'LEXICAL',
  'GRAMMAR',
  'THEOLOGY',
  'CANON',
  'HOMILETICS',
  'CULTURE',
  'STRUCTURE',
  'SYNTHESIS',
]

const STAGES = [
  { label: 'PARSING GRAMMATICAL STRUCTURE',   sub: 'Identifying clause types and syntax…' },
  { label: 'READING THE ORIGINAL LANGUAGE',   sub: 'Tracing lexical range and semantic weight…' },
  { label: 'MAPPING THEOLOGICAL THEMES',      sub: 'Locating doctrinal anchors in the text…' },
  { label: 'TRACING CANONICAL CONTEXT',       sub: 'Situating the passage in redemptive history…' },
  { label: 'IDENTIFYING CULTURAL NOTES',      sub: 'Surfacing Second Temple and Greco-Roman context…' },
  { label: 'BUILDING SERMON OUTLINE',         sub: 'Deriving points from the text\'s natural structure…' },
]

function vertPos(i: number) {
  const a = (i / N) * Math.PI * 2 - Math.PI / 2
  return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) }
}

const VERTS = Array.from({ length: N }, (_, i) => vertPos(i))

export function ThinkingDisplay() {
  const [lit, setLit] = useState<number>(0)       // how many vertices are lit (0-8)
  const [glowing, setGlowing] = useState(false)   // full octagon glow phase
  const [stageIdx, setStageIdx] = useState(0)
  const phaseRef = useRef<'building' | 'glowing' | 'resetting'>('building')

  // Build octagon one vertex at a time, then glow, then restart
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>

    function step(current: number) {
      if (current < N) {
        setLit(current + 1)
        phaseRef.current = 'building'
        timeout = setTimeout(() => step(current + 1), 520)
      } else {
        // All lit — glow
        phaseRef.current = 'glowing'
        setGlowing(true)
        timeout = setTimeout(() => {
          // Reset
          phaseRef.current = 'resetting'
          setGlowing(false)
          setLit(0)
          timeout = setTimeout(() => step(0), 300)
        }, 900)
      }
    }

    timeout = setTimeout(() => step(0), 200)
    return () => clearTimeout(timeout)
  }, [])

  // Cycle stage text
  useEffect(() => {
    const t = setInterval(() => setStageIdx(i => (i + 1) % STAGES.length), 3000)
    return () => clearInterval(t)
  }, [])

  const stage = STAGES[stageIdx]

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', zIndex: 10, gap: 44,
      background: 'radial-gradient(ellipse at 50% 44%, rgba(16,18,15,0.25), rgba(16,18,15,0.7))',
    }}>

      {/* Octagon build animation */}
      <div style={{
        position: 'relative', width: 260, height: 260,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Rotating gold halo behind the octagon */}
        <div className="halo-spin" style={{
          position: 'absolute', inset: -70, borderRadius: '50%',
          background: `conic-gradient(from 0deg,
            transparent 0deg, rgba(216,179,63,0.12) 40deg, transparent 95deg,
            transparent 175deg, rgba(103,112,79,0.10) 225deg, transparent 290deg)`,
          filter: 'blur(30px)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', inset: -30, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(216,179,63,0.05), transparent 65%)',
          pointerEvents: 'none',
        }} />
      <svg width={260} height={260} style={{ overflow: 'visible', position: 'relative' }}>
        {/* Dim base octagon outline */}
        <polygon
          points={VERTS.map(v => `${v.x},${v.y}`).join(' ')}
          fill="none"
          stroke={BASE.border}
          strokeWidth={0.5}
          strokeOpacity={0.18}
          strokeDasharray="3 5"
        />

        {/* Lit edges — each edge appears as the next vertex lights */}
        {Array.from({ length: N }, (_, i) => {
          if (i >= lit) return null
          const prev = i === 0 ? null : i - 1
          if (prev === null) return null
          const a = VERTS[prev], b = VERTS[i]
          return (
            <motion.line
              key={`edge-${i}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={glowing ? BASE.gold : BASE.moss}
              strokeWidth={glowing ? 1.5 : 1}
              strokeOpacity={glowing ? 0.9 : 0.55}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          )
        })}

        {/* Closing edge — only when all lit */}
        {lit === N && (
          <motion.line
            key="edge-close"
            x1={VERTS[N - 1].x} y1={VERTS[N - 1].y}
            x2={VERTS[0].x} y2={VERTS[0].y}
            stroke={glowing ? BASE.gold : BASE.moss}
            strokeWidth={glowing ? 1.5 : 1}
            strokeOpacity={glowing ? 0.9 : 0.55}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        )}

        {/* Glow fill when complete */}
        {glowing && (
          <motion.polygon
            points={VERTS.map(v => `${v.x},${v.y}`).join(' ')}
            fill={BASE.gold}
            fillOpacity={0}
            stroke={BASE.gold}
            strokeWidth={2}
            strokeOpacity={0.7}
            initial={{ fillOpacity: 0, strokeOpacity: 0.7 }}
            animate={{ fillOpacity: [0, 0.06, 0], strokeOpacity: [0.7, 1, 0.7] }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            style={{ filter: `drop-shadow(0 0 12px ${BASE.gold}88)` }}
          />
        )}

        {/* Vertices */}
        {VERTS.map((v, i) => {
          const isLit = i < lit
          const isFront = i === lit - 1  // the most recently lit vertex
          const label = VERTEX_LABELS[i]

          // Label angle — push text outward from center
          const angle = (i / N) * Math.PI * 2 - Math.PI / 2
          const lx = CX + (R + 28) * Math.cos(angle)
          const ly = CY + (R + 28) * Math.sin(angle)
          const anchor = lx < CX - 4 ? 'end' : lx > CX + 4 ? 'start' : 'middle'

          return (
            <g key={i}>
              {/* Pulse ring on active vertex */}
              {isFront && !glowing && (
                <motion.circle
                  cx={v.x} cy={v.y} r={8}
                  fill={BASE.gold}
                  initial={{ opacity: 0.5, scale: 1 }}
                  animate={{ opacity: 0, scale: 2.5 }}
                  transition={{ duration: 0.9, repeat: Infinity }}
                />
              )}

              {/* Vertex dot */}
              <motion.circle
                cx={v.x} cy={v.y} r={isFront ? 5 : 3.5}
                fill={isLit ? (glowing ? BASE.gold : isFront ? BASE.gold : BASE.moss) : 'transparent'}
                stroke={isLit ? (glowing ? BASE.gold : BASE.moss) : BASE.border}
                strokeWidth={isLit ? 1 : 0.5}
                strokeOpacity={isLit ? 1 : 0.2}
                initial={{ scale: 0 }}
                animate={{
                  scale: isLit ? 1 : 0,
                  filter: glowing ? `drop-shadow(0 0 6px ${BASE.gold})` : 'none',
                }}
                transition={{ duration: 0.25, ease: 'backOut' }}
              />

              {/* Vertex label */}
              {isLit && (
                <motion.text
                  x={lx} y={ly}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fill={glowing ? BASE.gold : isFront ? BASE.gold : BASE.steel}
                  fontSize={6}
                  fontFamily="JetBrains Mono"
                  letterSpacing="0.1em"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: glowing ? 1 : isFront ? 0.9 : 0.45 }}
                  transition={{ duration: 0.4 }}
                >
                  {label}
                </motion.text>
              )}
            </g>
          )
        })}
      </svg>
      </div>

      {/* Stage text */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={stage.label}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.3 }}
            style={{ fontFamily: 'JetBrains Mono', fontSize: 8.5, color: BASE.gold, letterSpacing: '0.14em' }}
          >
            {stage.label}
          </motion.div>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div
            key={stage.sub}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneDim, fontStyle: 'italic' }}
          >
            {stage.sub}
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {STAGES.map((_, i) => (
            <div key={i} style={{
              width: i === stageIdx ? 16 : 4, height: 4, borderRadius: 2,
              background: i === stageIdx ? BASE.gold : i < stageIdx ? BASE.moss : BASE.border,
              opacity: i === stageIdx ? 0.9 : i < stageIdx ? 0.5 : 0.25,
              transition: 'all 0.4s ease',
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}
