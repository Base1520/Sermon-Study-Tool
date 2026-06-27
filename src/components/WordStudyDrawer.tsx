import { motion, AnimatePresence } from 'motion/react'
import type { WordStudy } from '../types/phrasing'
import { BASE } from '../theme'

interface Props {
  study: WordStudy | null
  loading: boolean
  onClose: () => void
}

export function WordStudyDrawer({ study, loading, onClose }: Props) {
  return (
    <AnimatePresence>
      {(study || loading) && (
        <motion.div
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: 260, zIndex: 30,
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
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em' }}>
              word study
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
              <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.steel }}>
                Looking up original language…
              </p>
            </div>
          )}

          {study && !loading && (
            <div style={{ display: 'flex', gap: 28, flex: 1, overflow: 'hidden' }}>
              {/* Left: identity */}
              <div style={{ flexShrink: 0, minWidth: 160 }}>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 28, color: BASE.bone, fontWeight: 400, lineHeight: 1 }}>
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
                  <div style={{ marginTop: 8, fontFamily: 'JetBrains Mono', fontSize: 9, color: BASE.steel, letterSpacing: '0.04em' }}>
                    {study.parsing}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: BASE.borderDim, flexShrink: 0 }} />

              {/* Right: semantic range + key uses */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.boneMid, lineHeight: 1.6, margin: 0 }}>
                  {study.semanticRange}
                </p>
                {study.keyUses.length > 0 && (
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.1em', marginBottom: 6 }}>
                      key uses
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {study.keyUses.map((u, i) => (
                        <span key={i} style={{
                          fontFamily: 'Crimson Pro, serif', fontSize: 12,
                          background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
                          borderRadius: 6, padding: '2px 8px', color: BASE.khaki,
                        }}>{u}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
