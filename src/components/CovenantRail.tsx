import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'
import { PHASES, phaseStatus, loadCovenantState, saveCovenantState } from '../covenant/phases'
import type { VerifyCtx, PhaseStatus } from '../covenant/phases'
import type { PhrasingAnalysis } from '../types/phrasing'

interface Props {
  analysis: PhrasingAnalysis | null
  savedDraft?: string
  onAction: (action: string) => void
}

const STATUS_COLOR: Record<PhaseStatus, string> = {
  verified: BASE.gold,
  partial: BASE.moss,
  open: BASE.steel,
}

export function CovenantRail({ analysis, savedDraft, onAction }: Props) {
  const reference = analysis?.reference ?? ''
  const [manual, setManual] = useState<Record<string, boolean>>({})
  const [openPhase, setOpenPhase] = useState<string | null>(null)

  useEffect(() => {
    if (reference) setManual(loadCovenantState(reference))
    setOpenPhase(null)
  }, [reference])

  const ctx: VerifyCtx = useMemo(
    () => ({ analysis: analysis as any, draft: savedDraft, manual }),
    [analysis, savedDraft, manual]
  )

  const statuses = useMemo(() => PHASES.map(p => phaseStatus(p, ctx)), [ctx])
  const verifiedCount = statuses.filter(s => s === 'verified').length
  const active = openPhase ? PHASES.find(p => p.id === openPhase && true) : null
  const activeIdx = openPhase ? PHASES.findIndex(p => p.id === openPhase) : -1

  function toggleManual(id: string) {
    const next = { ...manual, [id]: !manual[id] }
    setManual(next)
    if (reference) saveCovenantState(reference, next)
  }

  if (!analysis) return null

  return (
    <div style={{ position: 'relative', display: 'flex', flexShrink: 0, height: '100%' }}>
      {/* ── The Rail ── */}
      <div style={{
        width: 54, height: '100%', flexShrink: 0,
        background: `${BASE.bg}f4`,
        borderRight: `1px solid ${BASE.borderDim}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 14, gap: 2, zIndex: 30,
      }}>
        <div style={{
          fontFamily: 'Saira', fontSize: 10, color: BASE.steel,
          letterSpacing: '0.15em', marginBottom: 6, writingMode: 'vertical-rl' as any,
          textOrientation: 'mixed' as any, opacity: 0.7,
        }}>
          MISSION
        </div>

        {PHASES.map((phase, i) => {
          const status = statuses[i]
          const color = STATUS_COLOR[status]
          const isOpen = openPhase === phase.id
          // Second N needs a unique key
          const key = `${phase.id}`
          return (
            <button key={key}
              onClick={() => setOpenPhase(isOpen ? null : phase.id)}
              title={`${phase.letter} — ${phase.title} (${status.toUpperCase()})`}
              style={{
                width: 38, height: 44, borderRadius: 9, cursor: 'pointer',
                background: isOpen ? `${BASE.gold}18` : status === 'verified' ? `${BASE.gold}0d` : 'transparent',
                border: `1px solid ${isOpen ? BASE.gold + '70' : status === 'verified' ? BASE.gold + '45' : BASE.borderDim}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 1, transition: 'all 0.15s', position: 'relative',
              }}>
              <span style={{
                fontFamily: 'Saira', fontSize: 19, lineHeight: 1,
                color, opacity: status === 'open' ? 0.45 : 1,
                textShadow: status === 'verified' ? `0 0 8px ${BASE.gold}55` : 'none',
              }}>
                {phase.letter}
              </span>
              <span style={{
                width: 4, height: 4, borderRadius: '50%',
                background: color, opacity: status === 'open' ? 0.25 : 0.9,
              }} />
            </button>
          )
        })}

        <div style={{
          marginTop: 'auto', marginBottom: 12, textAlign: 'center',
          fontFamily: 'Saira', fontSize: 13, color: verifiedCount === 8 ? BASE.gold : BASE.steel,
          letterSpacing: '0.08em',
        }}>
          {verifiedCount}/8
        </div>
      </div>

      {/* ── Phase Dossier drawer ── */}
      <AnimatePresence>
        {active && activeIdx >= 0 && (
          <motion.div
            key={active.id}
            initial={{ x: -12, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -12, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'absolute', left: 54, top: 0, bottom: 0, width: 330,
              background: `linear-gradient(168deg, #232b18 0%, ${BASE.bg} 70%)`,
              borderRight: `1px solid ${BASE.borderGold}`,
              boxShadow: `18px 0 40px rgba(0,0,0,0.45)`,
              zIndex: 29, display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>

            {/* Dossier header */}
            <div style={{ padding: '18px 18px 12px', borderBottom: `1px solid ${BASE.borderDim}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: 'Saira', fontSize: 44, color: BASE.gold, lineHeight: 0.9 }}>
                  {active.letter}
                </span>
                <div>
                  <div style={{ fontFamily: 'Saira', fontSize: 19, color: BASE.bone, letterSpacing: '0.04em' }}>
                    {active.title}
                  </div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, color: STATUS_COLOR[statuses[activeIdx]], letterSpacing: '0.16em', marginTop: 2 }}>
                    PHASE {activeIdx + 1} OF 8 · {statuses[activeIdx].toUpperCase()}
                  </div>
                </div>
                <button onClick={() => setOpenPhase(null)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: BASE.steel, cursor: 'pointer', fontSize: 14 }}>
                  ×
                </button>
              </div>
              <div style={{
                fontFamily: 'Crimson Pro, serif', fontStyle: 'italic', fontSize: 13,
                color: BASE.gold, lineHeight: 1.5, marginTop: 10,
              }}>
                {active.question}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 20px', minHeight: 0 }}>
              {/* Objective */}
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.16em', color: BASE.steel, marginBottom: 6 }}>
                OBJECTIVE
              </div>
              <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.bone, lineHeight: 1.7, marginBottom: 16 }}>
                {active.objective}
              </div>

              {/* Field guide */}
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.16em', color: BASE.steel, marginBottom: 6 }}>
                WORK THE GROUND
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {active.fieldGuide.map((g, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: BASE.gold, fontSize: 9, marginTop: 3, flexShrink: 0 }}>▸</span>
                    <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.boneMid, lineHeight: 1.55 }}>{g}</span>
                  </div>
                ))}
              </div>

              {/* Summon actions */}
              {active.actions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                  {active.actions.map(a => (
                    <button key={a.action + a.label}
                      onClick={() => onAction(a.action)}
                      style={{
                        padding: '9px 0', borderRadius: 7, cursor: 'pointer',
                        background: `${BASE.gold}12`, border: `1px solid ${BASE.gold}40`,
                        color: BASE.gold, fontFamily: 'Saira', fontSize: 13,
                        letterSpacing: '0.12em', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BASE.gold}22` }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${BASE.gold}12` }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Sign-off */}
              <button
                onClick={() => toggleManual(active.id)}
                style={{
                  width: '100%', padding: '11px 0', borderRadius: 8, cursor: 'pointer',
                  background: manual[active.id] ? BASE.gold : 'transparent',
                  border: `1px solid ${manual[active.id] ? BASE.gold : BASE.borderGold}`,
                  color: manual[active.id] ? BASE.bg : BASE.gold,
                  fontFamily: 'Saira', fontSize: 15, letterSpacing: '0.14em',
                  transition: 'all 0.2s',
                }}>
                {manual[active.id] ? '✓ PHASE VERIFIED' : 'SIGN OFF THIS PHASE'}
              </button>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, color: BASE.steel, opacity: 0.6, marginTop: 6, letterSpacing: '0.08em', textAlign: 'center' }}>
                YOUR CALL — THE TOOL DETECTS, THE PREACHER VERIFIES
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
