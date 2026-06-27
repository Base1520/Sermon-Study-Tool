import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'

const GOLD  = BASE.gold
const KHAKI = BASE.khaki
const STEEL = BASE.steel

// ── Feature catalogue ──────────────────────────────────────────────────────────
interface Feature {
  icon: string
  name: string
  desc: string
  how: string
  badge?: string
}

interface Section {
  label: string
  color: string
  features: Feature[]
}

const SECTIONS: Section[] = [
  {
    label: 'CANVAS & TILES',
    color: GOLD,
    features: [
      {
        icon: '✦',
        name: 'Phrasing Diagram',
        desc: 'Auto-generated clause tree showing how each phrase in the passage relates to the main verb.',
        how: 'Analyze any passage — it appears automatically. Click any clause to select it.',
        badge: 'auto',
      },
      {
        icon: '⊕',
        name: 'Geography Map',
        desc: 'Interactive topographical map of the ANE and Roman world. Highlights cities mentioned in your passage.',
        how: 'Opens automatically after analysis. Scroll to zoom, drag to pan. Click a city for details.',
        badge: 'auto',
      },
      {
        icon: '♚',
        name: 'Monarchy Timeline',
        desc: 'Full historical timeline: kings of Israel & Judah, foreign empires (Assyria, Babylon, Persia, Rome), prophets, and world events. Era auto-highlights to your passage.',
        how: 'Click + ADD TILE → ♚ MONARCHY. Resize by dragging corners. Click any bar for details.',
      },
      {
        icon: '✎',
        name: 'Study Notes',
        desc: 'Free-form note cards you can place anywhere on the infinite canvas.',
        how: 'Click + ADD TILE → ✦ BLANK NOTE. Rename the title by clicking it.',
      },
      {
        icon: '♛',
        name: 'Kings List',
        desc: 'Side-by-side monarchy viewer — all kings of Judah and Israel (931–586 BC), color-coded by spiritual rating. Filter by righteous, good, mixed, or evil. Click any king for full details and archaeological notes.',
        how: 'Click + ADD TILE → ♛ KINGS LIST. Filter with the rating buttons at the top.',
        badge: 'new',
      },
      {
        icon: '✦',
        name: 'OT Worship Structures',
        desc: 'Interactive floor plans for the Tabernacle, Solomon\'s Temple, and Herod\'s Temple. Click any zone (Holy of Holies, altar, court of Gentiles, the Veil) for theological details and verse references.',
        how: 'Click + ADD TILE → ✦ WORSHIP PLAN. Switch structures using the tab bar.',
        badge: 'new',
      },
      {
        icon: '⊳',
        name: 'Lineage Viewer',
        desc: 'Four complete genealogical trees: Patriarchal Line (Adam→Christ), the 12 Tribes, Davidic Royal Line, and High Priestly Line. Each person has full theological significance, dates, and biblical references.',
        how: 'Click + ADD TILE → ⊳ LINEAGE VIEWER. Search any name, reference, or theme. Click a name for its full profile.',
        badge: 'new',
      },
      {
        icon: '⤢',
        name: 'Resize Tiles',
        desc: 'Any tile on the canvas can be resized by dragging its edges or corners.',
        how: 'Hover the edge of a tile — resize handles appear. Drag to any size.',
      },
      {
        icon: '×',
        name: 'Close Tiles',
        desc: 'Remove any tile from the canvas when you\'re done with it.',
        how: 'Click the × badge in the top-right corner of the tile, or in the tile\'s header.',
      },
    ],
  },
  {
    label: 'TEXT ANALYSIS',
    color: '#7090c0',
    features: [
      {
        icon: 'Aa',
        name: 'Word Study',
        desc: 'Deep lexical dive on any Greek or Hebrew word — semantic range, cognates, usage across canon.',
        how: 'Click any word in the phrasing diagram → Word Study panel opens on the right.',
        badge: 'click word',
      },
      {
        icon: '⚑',
        name: 'Eisegesis Flagger',
        desc: 'AI guard that watches for interpretive overreach — projection, anachronism, or forced typology.',
        how: 'Always running. Red warning indicators appear on clauses where you may be reading in.',
        badge: 'always on',
      },
      {
        icon: '🏛',
        name: 'Cultural Context',
        desc: 'Ancient Near Eastern or Greco-Roman background for culturally loaded phrases.',
        how: 'Click the ◈ marker on any highlighted phrase to open the cultural context panel.',
      },
      {
        icon: '⇌',
        name: 'Cross-References',
        desc: 'Canon-wide intertextual links — where this text echoes, quotes, or anticipates other passages.',
        how: 'Shown in the canonical strip below the toolbar after analysis. Click any ref to load it.',
        badge: 'auto',
      },
      {
        icon: '⊞',
        name: 'Canonical Strip',
        desc: 'Shows genre, canonical context, and thematic tags for the analyzed passage.',
        how: 'Appears automatically below the toolbar. Scroll right to see all tags.',
        badge: 'auto',
      },
    ],
  },
  {
    label: 'AI AGENTS',
    color: KHAKI,
    features: [
      {
        icon: 'λ',
        name: 'Scholar Chat',
        desc: 'Conversational theological dialogue. Ask anything about the text — exegesis, theology, history, application.',
        how: 'Click the λ SCHOLAR button in the top toolbar. Switch back to DESK to return to the canvas.',
        badge: 'top toolbar',
      },
      {
        icon: '⬡',
        name: 'Specialist Agents',
        desc: 'Targeted agents: Exegetical (text-critical), Theological (doctrinal), Homiletical (preaching structure).',
        how: 'On the welcome screen, click any agent orb. Or use the orbital controls when no passage is loaded.',
      },
      {
        icon: '✍',
        name: 'Sermon Draft',
        desc: 'Full sermon outline with big idea, introduction, points, illustrations, gospel bridge, and conclusion.',
        how: 'After analysis, expand the DRAFT tile on the canvas. The draft appears automatically.',
        badge: 'auto',
      },
    ],
  },
  {
    label: 'STUDY AIDS',
    color: '#50a080',
    features: [
      {
        icon: '📖',
        name: 'Commentary Panel',
        desc: 'Pulls relevant commentary notes and scholarship on the passage.',
        how: 'Available in the right sidebar after analysis.',
      },
      {
        icon: '≡',
        name: 'Sermon Series',
        desc: 'Organize passages into a teaching series — track where you\'ve been and plan ahead.',
        how: 'Click the ≡ button in the top toolbar.',
        badge: 'top toolbar',
      },
      {
        icon: '↷',
        name: 'Passage History',
        desc: 'Every passage you\'ve studied is saved. Reload any previous session instantly.',
        how: 'Click the history icon in the top toolbar. Click any entry to reload it.',
        badge: 'top toolbar',
      },
      {
        icon: '↓',
        name: 'PDF Export',
        desc: 'Export your analysis, outline, and sermon draft as a formatted PDF preaching sheet.',
        how: 'Click the ↓ button in the top toolbar. Only visible after analysis.',
        badge: 'top toolbar',
      },
      {
        icon: '⚙',
        name: 'API Keys',
        desc: 'Manage your Anthropic and ESV Bible API keys. Keys are stored locally, never sent to any server.',
        how: 'Click the ⚙ gear in the top toolbar.',
        badge: 'top toolbar',
      },
      {
        icon: '🖼',
        name: 'Custom Portrait & City Images',
        desc: 'Drop images into ~/Desktop/BASE Assets/people/ and ~/Desktop/BASE Assets/cities/ — the app auto-discovers them and shows portraits in biography panels and city popup headers.',
        how: 'Name the file to match the person or city (e.g. nebuchadnezzar.jpg, jerusalem.jpg). Restart or re-open the tile to refresh.',
        badge: 'local files',
      },
    ],
  },
]

// ── Component ──────────────────────────────────────────────────────────────────
export function FeatureTour({ onClose }: { onClose: () => void }) {
  const [activeSection, setActiveSection] = useState(0)
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null)

  const section = SECTIONS[activeSection]

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 380, zIndex: 200,
        background: BASE.bgCard,
        borderLeft: `1px solid ${BASE.border}`,
        boxShadow: `-8px 0 40px rgba(0,0,0,0.5)`,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'JetBrains Mono',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px 14px',
        borderBottom: `1px solid ${BASE.borderGold}`,
        background: BASE.goldDim,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 7, letterSpacing: '0.18em', color: `${GOLD}99`, marginBottom: 4 }}>
              BASE 1520
            </div>
            <div style={{ fontSize: 13, color: GOLD, letterSpacing: '0.06em', fontWeight: 600 }}>
              FEATURES & TIPS
            </div>
            <div style={{ fontSize: 8.5, color: STEEL, marginTop: 4, letterSpacing: '0.06em', lineHeight: 1.5 }}>
              Everything the tool can do — most of it is hidden.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: STEEL,
            fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1,
          }}
            onMouseEnter={e => (e.currentTarget.style.color = BASE.red)}
            onMouseLeave={e => (e.currentTarget.style.color = STEEL)}
          >×</button>
        </div>

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {SECTIONS.map((s, i) => (
            <button key={s.label} onClick={() => { setActiveSection(i); setExpandedFeature(null) }} style={{
              fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.1em',
              padding: '4px 9px', borderRadius: 5, cursor: 'pointer',
              background: i === activeSection ? `${s.color}22` : 'transparent',
              border: `1px solid ${i === activeSection ? `${s.color}70` : `${s.color}30`}`,
              color: i === activeSection ? s.color : `${s.color}80`,
              transition: 'all 0.15s',
            }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feature list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        <AnimatePresence mode="wait">
          <motion.div key={activeSection}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}
          >
            {section.features.map(f => {
              const isOpen = expandedFeature === f.name
              return (
                <div key={f.name}
                  onClick={() => setExpandedFeature(isOpen ? null : f.name)}
                  style={{
                    padding: '12px 20px',
                    borderBottom: `1px solid ${BASE.borderDim}`,
                    cursor: 'pointer',
                    background: isOpen ? `${section.color}08` : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = `${section.color}06` }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: `${section.color}15`,
                      border: `1px solid ${section.color}35`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, color: section.color,
                    }}>{f.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: BASE.bone, letterSpacing: '0.06em' }}>
                          {f.name}
                        </span>
                        {f.badge && (
                          <span style={{
                            fontSize: 6.5, letterSpacing: '0.1em',
                            color: section.color, background: `${section.color}18`,
                            border: `1px solid ${section.color}30`,
                            borderRadius: 3, padding: '1px 5px',
                          }}>{f.badge}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 8.5, color: STEEL, marginTop: 2, lineHeight: 1.5 }}>
                        {f.desc}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, color: `${section.color}60`,
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      flexShrink: 0,
                    }}>▾</span>
                  </div>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{
                          marginTop: 12, marginLeft: 38,
                          padding: '10px 14px',
                          background: `${section.color}10`,
                          border: `1px solid ${section.color}25`,
                          borderRadius: 8,
                        }}>
                          <div style={{ fontSize: 7, color: `${section.color}99`, letterSpacing: '0.12em', marginBottom: 5 }}>
                            HOW TO USE
                          </div>
                          <div style={{ fontSize: 11, color: BASE.bone, fontFamily: 'Crimson Pro, serif', lineHeight: 1.65 }}>
                            {f.how}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 20px',
        borderTop: `1px solid ${BASE.borderDim}`,
        flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 7.5, color: STEEL }}>
          {SECTIONS.reduce((n, s) => n + s.features.length, 0)} features total
        </span>
        <span style={{ fontSize: 7.5, color: `${STEEL}60` }}>click any feature to expand</span>
      </div>
    </motion.div>
  )
}
