import { motion, AnimatePresence } from 'motion/react'
import type { WordStudy } from '../types/phrasing'
import { BASE } from '../theme'
import type { FriendlyError } from '../lib/apiErrors'

interface Props {
  study: WordStudy | null
  loading: boolean
  error?: FriendlyError | null
  onClose: () => void
  onOpenSettings?: () => void
  onRetry?: () => void
}

export function WordStudyDrawer({ study, loading, error, onClose, onOpenSettings, onRetry }: Props) {
  return (
    <AnimatePresence>
      {(study || loading || error) && (
        <motion.div
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: 340, zIndex: 80,
            background: `${BASE.bg}f8`,
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            borderTop: `1px solid ${BASE.borderGold}`,
            padding: '16px 24px 20px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: BASE.khaki, letterSpacing: '0.14em' }}>
              WORD STUDY · CONTEXT CONTROLS MEANING
            </div>
            <button onClick={onClose} style={{
              width: 24, height: 24, borderRadius: '50%',
              border: `1px solid ${BASE.borderDim}`,
              background: BASE.goldDim, color: BASE.steel,
              cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>

          {loading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 16, color: BASE.boneMid }}>
                Looking up original language…
              </p>
            </div>
          )}

          {error && !loading && (
            <div role="alert" style={{
              flex: 1,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
            }}>
              <div style={{ maxWidth: 520 }}>
                <div style={{
                  fontFamily: 'Saira, sans-serif',
                  fontSize: 13,
                  fontWeight: 800,
                  color: BASE.red,
                  letterSpacing: '0.08em',
                }}>
                  {error.headline}
                </div>
                <p style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 14,
                  color: BASE.boneMid,
                  lineHeight: 1.6,
                }}>
                  {error.detail}
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                  {onRetry && (
                    <button onClick={onRetry} style={{
                      border: `1px solid ${BASE.borderDim}`,
                      background: 'transparent',
                      color: BASE.boneMid,
                      padding: '7px 14px',
                      cursor: 'pointer',
                      fontFamily: 'Saira, sans-serif',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                    }}>
                      TRY AGAIN
                    </button>
                  )}
                  {onOpenSettings && (
                    <button onClick={onOpenSettings} style={{
                      border: `1px solid ${BASE.borderGold}`,
                      background: `${BASE.gold}12`,
                      color: BASE.gold,
                      padding: '7px 14px',
                      cursor: 'pointer',
                      fontFamily: 'Saira, sans-serif',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                    }}>
                      CHECK API SETTINGS
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {study && !loading && (
            <div style={{ display: 'flex', gap: 28, flex: 1, overflow: 'hidden' }}>
              {/* Left: identity */}
              <div style={{ flexShrink: 0, minWidth: 160 }}>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 32, color: BASE.bone, fontWeight: 500, lineHeight: 1 }}>
                  {study.original}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: BASE.gold, marginTop: 6, letterSpacing: '0.06em', opacity: 0.8 }}>
                  {study.transliteration}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, marginTop: 4 }}>
                  {study.strongs}
                </div>
                <div style={{ marginTop: 10, fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.boneMid, fontStyle: 'italic' }}>
                  "{study.gloss}"
                </div>
                {study.parsing && (
                  <div style={{ marginTop: 8, fontFamily: 'JetBrains Mono', fontSize: 10, color: BASE.boneMid, letterSpacing: '0.04em' }}>
                    {study.parsing}
                  </div>
                )}
                {study.confidence && (
                  <div style={{
                    display: 'inline-block', marginTop: 12, padding: '4px 7px',
                    border: `1px solid ${study.confidence === 'high' ? BASE.borderGold : BASE.borderDim}`,
                    fontFamily: 'JetBrains Mono', fontSize: 8, fontWeight: 700,
                    color: study.confidence === 'high' ? BASE.gold : BASE.khaki,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                  }}>
                    {study.confidence} confidence
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: BASE.borderDim, flexShrink: 0 }} />

              {/* Right: semantic range + key uses */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: BASE.khaki, letterSpacing: '0.11em', marginBottom: 6 }}>
                    WHAT THE WORD CAN MEAN
                  </div>
                  <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 15.5, color: BASE.bone, lineHeight: 1.6, margin: 0 }}>
                    {study.semanticRange}
                  </p>
                </div>
                {study.translationNote && (
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: BASE.khaki, letterSpacing: '0.11em', marginBottom: 5 }}>
                      WHY THE ENGLISH READS THIS WAY
                    </div>
                    <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14.5, color: BASE.boneMid, lineHeight: 1.55, margin: 0 }}>
                      {study.translationNote}
                    </p>
                  </div>
                )}
                {study.whyItMatters && (
                  <div style={{
                    background: '#263519',
                    borderLeft: `4px solid ${BASE.gold}`,
                    borderTop: `1px solid ${BASE.borderGold}`,
                    borderRight: `1px solid ${BASE.borderGold}`,
                    borderBottom: `1px solid ${BASE.borderGold}`,
                    padding: '10px 12px',
                  }}>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, color: BASE.gold, letterSpacing: '0.12em', marginBottom: 5 }}>
                      WHY IT MATTERS HERE
                    </div>
                    <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 16, color: BASE.bone, lineHeight: 1.55, margin: 0 }}>
                      {study.whyItMatters}
                    </p>
                  </div>
                )}
                {(study.keyUses?.length ?? 0) > 0 && (
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: BASE.khaki, letterSpacing: '0.1em', marginBottom: 6 }}>
                      SAME LEMMA ELSEWHERE
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(study.keyUses ?? []).map((u, i) => (
                        <span key={i} style={{
                          fontFamily: 'Crimson Pro, serif', fontSize: 12,
                          background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
                          borderRadius: 6, padding: '2px 8px', color: BASE.khaki,
                        }}>{u}</span>
                      ))}
                    </div>
                  </div>
                )}
                {study.limits && (
                  <p style={{
                    fontFamily: 'Crimson Pro, serif', fontSize: 13.5,
                    color: BASE.steel, lineHeight: 1.5, margin: 0,
                    borderTop: `1px solid ${BASE.borderDim}`, paddingTop: 8,
                  }}>
                    <strong style={{ color: BASE.khaki }}>Limit:</strong> {study.limits}
                  </p>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
