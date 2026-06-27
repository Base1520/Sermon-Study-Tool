import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'

const STORAGE_KEY = 'sermon-tool-onboarded-v1'

interface Step {
  title: string
  body: string
  cta: string
  // null = centered modal; otherwise spotlight this layout region
  spotlight: null | 'sidebar' | 'canvas'
  tooltipSide: 'center' | 'right' | 'left'
}

const STEPS: Step[] = [
  {
    title: 'Welcome to BASE 1520',
    body: 'Scripture study built for the pulpit. A living passage analysis engine, AI scholar, and real-time eisegesis guard — all in one. Quick three-step tour and you\'re ready.',
    cta: 'Begin Tour',
    spotlight: null,
    tooltipSide: 'center',
  },
  {
    title: 'Step 1 — Enter a Passage',
    body: 'Type any Scripture reference in the sidebar — "Romans 8:1" or "John 3:16-17" — and press SEND IT. The engine will parse the clause structure, themes, and cultural context of the text.',
    cta: 'Got it',
    spotlight: 'sidebar',
    tooltipSide: 'right',
  },
  {
    title: 'Step 2 — Your Core Hub',
    body: 'After analysis, the Core Hub is mission control. Four spokes radiate out: Phrase structure, Outline, Scholar, and Sermon Draft. Click any hub node to navigate.',
    cta: 'Got it',
    spotlight: 'canvas',
    tooltipSide: 'left',
  },
  {
    title: 'Step 3 — Scholar & Flagger',
    body: 'Your AI Scholar is pre-trained on your theology, preaching style, and congregation. The Eisegesis Flagger monitors your manuscript in real time — flagging drift, proof-texting, and anachronism before Sunday.',
    cta: 'Start Studying',
    spotlight: null,
    tooltipSide: 'center',
  },
]

const SIDEBAR_W = 286
const TITLEBAR_H = 48

interface SpotlightProps {
  region: 'sidebar' | 'canvas'
}
function Spotlight({ region }: SpotlightProps) {
  const [vw, setVw] = useState(window.innerWidth)
  const [vh, setVh] = useState(window.innerHeight)
  useEffect(() => {
    const handler = () => { setVw(window.innerWidth); setVh(window.innerHeight) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const rx = region === 'sidebar' ? 0 : SIDEBAR_W
  const rw = region === 'sidebar' ? SIDEBAR_W : vw - SIDEBAR_W
  const ry = TITLEBAR_H
  const rh = vh - TITLEBAR_H

  const dim = 'rgba(0,0,0,0.84)'
  return (
    <>
      {/* top strip */}
      <div style={{ position: 'fixed', inset: 0, top: 0, height: ry, background: dim, zIndex: 9990, pointerEvents: 'none' }} />
      {/* bottom strip */}
      <div style={{ position: 'fixed', left: 0, right: 0, top: ry + rh, bottom: 0, background: dim, zIndex: 9990, pointerEvents: 'none' }} />
      {/* left strip */}
      <div style={{ position: 'fixed', top: ry, left: 0, width: rx, height: rh, background: dim, zIndex: 9990, pointerEvents: 'none' }} />
      {/* right strip */}
      <div style={{ position: 'fixed', top: ry, left: rx + rw, right: 0, height: rh, background: dim, zIndex: 9990, pointerEvents: 'none' }} />
      {/* glowing border */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          position: 'fixed', top: ry - 2, left: rx - 2, width: rw + 4, height: rh + 4,
          border: `2px solid ${BASE.gold}`,
          boxShadow: `0 0 28px ${BASE.gold}66, 0 0 8px ${BASE.gold}44, inset 0 0 32px ${BASE.gold}11`,
          borderRadius: 6, zIndex: 9991, pointerEvents: 'none',
        }}
      >
        {/* animated corner accents */}
        {[['top:0,left:0', 'top left'], ['top:0,right:0', 'top right'], ['bottom:0,left:0', 'bottom left'], ['bottom:0,right:0', 'bottom right']].map(([pos]) => {
          const [tb, lr] = pos.split(',')
          const [side, val] = tb.split(':')
          const [side2, val2] = lr.split(':')
          return (
            <motion.div key={pos}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                [side]: Number(val), [side2]: Number(val2),
                width: 16, height: 16,
                borderTop: side === 'top' ? `2px solid ${BASE.gold}` : undefined,
                borderBottom: side === 'bottom' ? `2px solid ${BASE.gold}` : undefined,
                borderLeft: side2 === 'left' ? `2px solid ${BASE.gold}` : undefined,
                borderRight: side2 === 'right' ? `2px solid ${BASE.gold}` : undefined,
              }}
            />
          )
        })}
      </motion.div>
    </>
  )
}

interface TooltipCardProps {
  step: Step
  stepIdx: number
  total: number
  onNext: () => void
  onSkip: () => void
}
function TooltipCard({ step, stepIdx, total, onNext, onSkip }: TooltipCardProps) {
  const isCenter = step.tooltipSide === 'center'

  const posStyle: React.CSSProperties = isCenter
    ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    : step.tooltipSide === 'right'
      // sidebar spotlighted → card floats to the right (in canvas area)
      ? { top: '50%', left: SIDEBAR_W + 40, transform: 'translateY(-50%)' }
      // canvas spotlighted → card sits top-right inside canvas, never overflows
      : { top: TITLEBAR_H + 32, right: 40, transform: 'none' }

  return (
    <motion.div
      key={stepIdx}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed', zIndex: 9995, width: 380, ...posStyle,
        background: `${BASE.bgCard}f8`,
        backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
        border: `1px solid ${BASE.borderGold}`,
        borderRadius: 12, padding: '28px 32px',
        boxShadow: `0 20px 60px rgba(0,0,0,0.7), 0 0 40px ${BASE.gold}22`,
      }}
    >
      {/* Step indicator dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {STEPS.map((_, i) => (
          <motion.div key={i}
            animate={{ width: i === stepIdx ? 20 : 6, background: i === stepIdx ? BASE.gold : BASE.borderDim }}
            transition={{ duration: 0.3 }}
            style={{ height: 6, borderRadius: 3 }}
          />
        ))}
      </div>

      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: BASE.gold, letterSpacing: '0.14em', marginBottom: 10 }}>
        {stepIdx === 0 ? 'WELCOME' : `STEP ${stepIdx} OF ${total - 1}`}
      </div>

      <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 20, color: BASE.bone, fontWeight: 600, marginBottom: 14, lineHeight: 1.25 }}>
        {step.title}
      </div>

      <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.boneMid, lineHeight: 1.65, marginBottom: 24 }}>
        {step.body}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onSkip} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0',
          fontFamily: 'JetBrains Mono', fontSize: 9, color: BASE.steel, letterSpacing: '0.1em',
        }}>
          SKIP TOUR
        </button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onNext}
          style={{
            background: `${BASE.gold}18`, border: `1px solid ${BASE.gold}60`,
            borderRadius: 8, padding: '10px 22px', cursor: 'pointer',
            fontFamily: 'JetBrains Mono', fontSize: 10, color: BASE.gold,
            letterSpacing: '0.12em',
            boxShadow: `0 0 16px ${BASE.gold}30`,
          }}
        >
          {step.cta} →
        </motion.button>
      </div>
    </motion.div>
  )
}

interface Props {
  onComplete: () => void
}

export function Onboarding({ onComplete }: Props) {
  const [stepIdx, setStepIdx] = useState(0)

  const step = STEPS[stepIdx]
  const isLast = stepIdx === STEPS.length - 1

  function advance() {
    if (isLast) {
      finish()
    } else {
      setStepIdx(s => s + 1)
    }
  }

  function finish() {
    localStorage.setItem(STORAGE_KEY, '1')
    onComplete()
  }

  return (
    <AnimatePresence>
      {/* Full-screen dark overlay for non-spotlight steps */}
      {step.spotlight === null && (
        <motion.div
          key="full-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 9990 }}
        />
      )}

      {/* Spotlight for targeted steps */}
      {step.spotlight && (
        <motion.div key={`spotlight-${step.spotlight}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Spotlight region={step.spotlight} />
        </motion.div>
      )}

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <TooltipCard
          key={stepIdx}
          step={step}
          stepIdx={stepIdx}
          total={STEPS.length}
          onNext={advance}
          onSkip={finish}
        />
      </AnimatePresence>
    </AnimatePresence>
  )
}

export function shouldShowOnboarding(): boolean {
  return !localStorage.getItem(STORAGE_KEY)
}
