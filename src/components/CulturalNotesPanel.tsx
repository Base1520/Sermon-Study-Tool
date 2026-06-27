import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { CulturalNote, CulturalCategory } from '../types/phrasing'
import { BASE } from '../theme'

interface Props {
  notes: CulturalNote[]
  selectedPhraseId: string | null
  onSelectPhrase: (id: string) => void
}

// All category colors drawn from BASE palette
const CATEGORY_META: Record<CulturalCategory, { label: string; color: string; abbr: string }> = {
  'greco-roman':    { label: 'Greco-Roman',     color: '#A0AF84', abbr: 'GR'  },
  'jewish':         { label: 'Jewish',           color: '#D8B33F', abbr: 'JW'  },
  'roman-legal':    { label: 'Roman Legal',      color: '#B8B49D', abbr: 'RL'  },
  'ane':            { label: 'Ancient Near East', color: '#C49A2E', abbr: 'ANE' },
  'hellenistic':    { label: 'Hellenistic',      color: '#E8CC7A', abbr: 'HL'  },
  'household-code': { label: 'Household Code',   color: '#7A9060', abbr: 'HC'  },
  'honor-shame':    { label: 'Honor / Shame',    color: '#67704F', abbr: 'HS'  },
}

function CategoryPill({ cat }: { cat: CulturalCategory }) {
  const m = CATEGORY_META[cat] ?? { label: cat, color: BASE.steel, abbr: '??' }
  return (
    <span style={{
      fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.08em',
      color: m.color, background: `${m.color}14`,
      border: `1px solid ${m.color}30`,
      borderRadius: 5, padding: '2px 7px', flexShrink: 0,
    }}>
      {m.label}
    </span>
  )
}

export function CulturalNotesPanel({ notes, selectedPhraseId, onSelectPhrase }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (notes.length === 0) return null

  const sorted = selectedPhraseId
    ? [...notes.filter(n => n.phraseId === selectedPhraseId), ...notes.filter(n => n.phraseId !== selectedPhraseId)]
    : notes

  return (
    <div style={{ borderTop: `1px solid ${BASE.borderDim}`, flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '10px 18px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em' }}>
          cultural context
        </span>
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 9,
          background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
          color: BASE.gold, borderRadius: 10, padding: '1px 7px',
        }}>
          {notes.length}
        </span>
      </div>

      {/* Notes list */}
      <div style={{ padding: '0 12px 16px' }}>
        {sorted.map((note, i) => {
          const catColor = CATEGORY_META[note.category]?.color ?? BASE.steel
          const isHighlighted = note.phraseId === selectedPhraseId
          const isOpen = expanded === note.id
          return (
            <motion.div
              key={note.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              style={{
                marginBottom: 6, borderRadius: 10,
                background: isHighlighted ? BASE.goldDim : `${BASE.bg}88`,
                border: `1px solid ${isHighlighted ? BASE.borderGold : BASE.borderDim}`,
                overflow: 'hidden', transition: 'border-color 0.2s, background 0.2s',
              }}
            >
              {/* Collapsed row */}
              <div
                onClick={() => setExpanded(isOpen ? null : note.id)}
                style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }}
              >
                <div style={{
                  width: 2, alignSelf: 'stretch', flexShrink: 0, borderRadius: 2,
                  background: catColor, opacity: isHighlighted ? 1 : 0.4,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{
                      fontFamily: 'Crimson Pro, serif', fontSize: 14,
                      color: isHighlighted ? BASE.bone : BASE.boneMid,
                      fontWeight: isHighlighted ? 500 : 400,
                    }}>
                      {note.term}
                    </span>
                    <CategoryPill cat={note.category} />
                    {isHighlighted && (
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.08em' }}>
                        selected
                      </span>
                    )}
                  </div>
                  <p style={{
                    fontFamily: 'Crimson Pro, serif', fontSize: 12.5, color: BASE.steel,
                    lineHeight: 1.5, margin: 0,
                    display: isOpen ? 'none' : '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {note.significance}
                  </p>
                </div>
                <span style={{
                  fontSize: 9, color: BASE.steel, flexShrink: 0,
                  transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginTop: 2,
                }}>▾</span>
              </div>

              {/* Expanded content */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ padding: '0 14px 14px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p style={{
                        fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.boneMid,
                        lineHeight: 1.65, margin: 0,
                      }}>
                        {note.explanation}
                      </p>
                      <div style={{
                        background: `${catColor}0d`,
                        border: `1px solid ${catColor}28`,
                        borderRadius: 8, padding: '8px 12px',
                      }}>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em', marginBottom: 4 }}>
                          interpretive significance
                        </div>
                        <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, fontStyle: 'italic', color: catColor, lineHeight: 1.5, margin: 0 }}>
                          {note.significance}
                        </p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); onSelectPhrase(note.phraseId) }}
                        style={{
                          alignSelf: 'flex-start',
                          fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.08em',
                          color: BASE.gold,
                          background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
                          borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                        }}>
                        → highlight clause
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
