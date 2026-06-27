import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { CanonicalContext, GenreAnalysis } from '../types/phrasing'
import { BASE } from '../theme'

interface Props { context: CanonicalContext; reference: string; genre?: GenreAnalysis }

const THEME_COLORS: Record<string, string> = {
  redemption: '#D8B33F', covenant: '#A0AF84', grace:      '#E8CC7A', faith:      '#B8B49D',
  law:        '#67704F', judgment: '#A63A2B', creation:   '#7A9060', restoration:'#C49A2E',
  glory:      '#D8B33F', kingdom:  '#A0AF84', salvation:  '#E8CC7A', love:       '#B8B49D',
}

const GENRE_STYLES: Record<string, { color: string; icon: string }> = {
  'Narrative':   { color: '#A0AF84', icon: '▸' },
  'Law':         { color: '#B8B49D', icon: '§' },
  'Poetry':      { color: '#E8CC7A', icon: '♪' },
  'Wisdom':      { color: '#C49A2E', icon: '◈' },
  'Prophecy':    { color: '#D8624A', icon: '⚡' },
  'Epistle':     { color: '#D8B33F', icon: 'λ' },
  'Gospel':      { color: '#A0C870', icon: '✦' },
  'Apocalyptic': { color: '#C05050', icon: '◉' },
  'Discourse':   { color: '#9AB0C8', icon: '≡' },
}

function themeColor(t: string) {
  const l = t.toLowerCase()
  for (const [k, c] of Object.entries(THEME_COLORS)) if (l.includes(k)) return c
  return BASE.khaki
}

export function CanonicalStrip({ context, reference, genre }: Props) {
  const [rulesOpen, setRulesOpen] = useState(false)
  const gStyle = genre ? (GENRE_STYLES[genre.genre] ?? { color: BASE.gold, icon: '◈' }) : null

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Main strip */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 20, padding: '10px 20px',
        background: `${BASE.bg}d0`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: rulesOpen ? `1px solid ${BASE.borderDim}44` : `1px solid ${BASE.borderDim}`,
        overflow: 'hidden',
      }}>

        {/* Reference */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 3 }}>
            reference
          </div>
          <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 16, color: BASE.bone, letterSpacing: '0.03em', fontWeight: 500 }}>
            {reference}
          </div>
        </div>

        <div style={{ width: 1, height: 36, background: BASE.borderDim, flexShrink: 0, opacity: 0.6, marginTop: 2 }} />

        {/* Genre badge */}
        {genre && gStyle && (
          <>
            <button
              onClick={() => setRulesOpen(o => !o)}
              style={{
                flexShrink: 0, cursor: 'pointer', background: 'none', border: 'none', padding: 0,
                display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left',
              }}
            >
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em' }}>
                genre
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  padding: '2px 10px', borderRadius: 20,
                  background: `${gStyle.color}12`, border: `1px solid ${gStyle.color}40`,
                  fontFamily: 'JetBrains Mono', fontSize: 10, color: gStyle.color,
                  letterSpacing: '0.1em',
                }}>
                  {gStyle.icon} {genre.genre.toUpperCase()}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: gStyle.color, opacity: 0.6 }}>
                  {rulesOpen ? '▴' : '▾'}
                </span>
              </div>
              {genre.subgenre && (
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 11, color: `${gStyle.color}99`, letterSpacing: '0.04em', marginTop: 1 }}>
                  {genre.subgenre}
                </div>
              )}
            </button>
            <div style={{ width: 1, height: 36, background: BASE.borderDim, flexShrink: 0, opacity: 0.6, marginTop: 2 }} />
          </>
        )}

        {/* Passage role */}
        <div style={{ flex: 1, minWidth: 140, overflow: 'hidden' }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 3, whiteSpace: 'nowrap' }}>
            passage role
          </div>
          <div style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid,
            lineHeight: 1.4, overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {context.passageRole}
          </div>
        </div>

        <div style={{ width: 1, height: 36, background: BASE.borderDim, flexShrink: 0, opacity: 0.6, marginTop: 2 }} />

        {/* Themes */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 6 }}>
            themes
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {context.biblicalThemes.slice(0, 5).map(t => {
              const c = themeColor(t)
              return (
                <span key={t} style={{
                  padding: '2px 9px', borderRadius: 20,
                  background: `${c}0f`, border: `1px solid ${c}28`,
                  fontFamily: 'Crimson Pro, serif', fontSize: 11.5, color: c,
                }}>
                  {t}
                </span>
              )
            })}
          </div>
        </div>

        {context.keyWords.length > 0 && (
          <>
            <div style={{ width: 1, height: 36, background: BASE.borderDim, flexShrink: 0, opacity: 0.6, marginTop: 2 }} />
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 6 }}>
                key words
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {context.keyWords.slice(0, 4).map(w => (
                  <span key={w} style={{
                    padding: '2px 9px', borderRadius: 20,
                    background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
                    fontFamily: 'Crimson Pro, serif', fontSize: 11.5, color: BASE.khaki,
                  }}>
                    {w}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Genre reading rules drawer */}
      <AnimatePresence>
        {rulesOpen && genre && gStyle && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '14px 24px 16px',
              background: `${BASE.bgCard}cc`,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderBottom: `1px solid ${BASE.borderDim}`,
              display: 'flex', gap: 32, alignItems: 'flex-start',
            }}>
              {/* Header */}
              <div style={{ flexShrink: 0, minWidth: 120 }}>
                <div style={{
                  fontFamily: 'JetBrains Mono', fontSize: 8, color: gStyle.color,
                  letterSpacing: '0.16em', marginBottom: 6,
                }}>
                  HOW TO READ THIS GENRE
                </div>
                <div style={{
                  fontFamily: 'Crimson Pro, serif', fontSize: 18, color: gStyle.color,
                  letterSpacing: '0.04em', fontWeight: 600,
                }}>
                  {genre.genre}
                </div>
                <div style={{
                  fontFamily: 'Crimson Pro, serif', fontSize: 11, color: `${gStyle.color}88`,
                  marginTop: 3, letterSpacing: '0.04em',
                }}>
                  {genre.subgenre}
                </div>
              </div>

              {/* Rules */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 28px', flex: 1 }}>
                {genre.readingRules.map((rule, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 280, maxWidth: 400 }}>
                    <span style={{
                      fontFamily: 'JetBrains Mono', fontSize: 8, color: `${gStyle.color}80`,
                      marginTop: 3, flexShrink: 0, letterSpacing: '0.1em',
                    }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div style={{
                      fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid,
                      lineHeight: 1.55,
                    }}>
                      {rule}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
