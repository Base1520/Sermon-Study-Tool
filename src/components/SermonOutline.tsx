import type { OutlinePoint, Phrase } from '../types/phrasing'
import { CLAUSE_COLORS } from '../services/colors'
import { BASE } from '../theme'

interface Props {
  outline: OutlinePoint[]; mainTheme: string; phrases: Phrase[]
  selectedId: string | null; onSelect: (id: string | null) => void
}

const sectionLabel = {
  fontFamily: 'JetBrains Mono' as const, fontSize: 8, letterSpacing: '0.14em',
  color: BASE.steel, marginBottom: 10,
}

export function SermonOutline({ outline, mainTheme, phrases, selectedId, onSelect }: Props) {
  return (
    <div style={{ padding: '18px 16px' }} className="selectable">

      {/* Central Proposition */}
      <div style={{
        marginBottom: 22, padding: '14px 16px',
        background: BASE.goldDim,
        border: `1px solid ${BASE.borderGold}`,
        borderRadius: 12, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
          background: `linear-gradient(90deg, transparent, ${BASE.gold}55, transparent)`,
        }} />
        <div style={{ ...sectionLabel, marginBottom: 8 }}>central proposition</div>
        <p style={{
          fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.bone,
          lineHeight: 1.6, fontStyle: 'italic', margin: 0,
        }}>
          {mainTheme}
        </p>
      </div>

      {/* Outline */}
      <div style={{ marginBottom: 22 }}>
        <div style={sectionLabel}>sermon outline</div>
        {outline.map(pt => <OutlineItem key={pt.point} point={pt} depth={0} />)}
      </div>

      {/* Phrase index */}
      <div>
        <div style={sectionLabel}>phrase index</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {phrases.map(p => {
            const color = CLAUSE_COLORS[p.type] ?? BASE.steel
            const isSelected = selectedId === p.id
            return (
              <button key={p.id}
                onClick={() => onSelect(isSelected ? null : p.id)}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  background: isSelected ? `${color}14` : BASE.goldDim,
                  border: `1px solid ${isSelected ? `${color}44` : BASE.borderDim}`,
                  transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
                }}>
                {isSelected && (
                  <div style={{
                    position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
                    background: `linear-gradient(90deg, transparent, ${color}55, transparent)`,
                  }} />
                )}
                <div style={{
                  position: 'absolute', top: 10, bottom: 10, left: 0, width: 2,
                  background: color, borderRadius: '0 2px 2px 0',
                  opacity: isSelected ? 0.85 : 0.35,
                }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: isSelected ? `0 0 6px ${color}` : 'none' }} />
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color, textTransform: 'capitalize', letterSpacing: '0.06em' }}>{p.type}</span>
                  {p.connective && (
                    <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel }}>
                      {p.connective}
                    </span>
                  )}
                </div>
                <p style={{
                  fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid,
                  lineHeight: 1.45, overflow: 'hidden', margin: 0,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {p.text}
                </p>
                {p.theologicalNote && (
                  <p style={{
                    fontFamily: 'Crimson Pro, serif', fontSize: 11, color,
                    opacity: isSelected ? 0.75 : 0.35, marginTop: 4, fontStyle: 'italic',
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
                    transition: 'opacity 0.3s',
                  }}>
                    {p.theologicalNote}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function OutlineItem({ point, depth }: { point: OutlinePoint; depth: number }) {
  const isMain = depth === 0
  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <div style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
        <span style={{
          fontFamily: 'Crimson Pro, serif', fontSize: 12, color: isMain ? BASE.gold : BASE.steel,
          flexShrink: 0, width: 20, paddingTop: 1, opacity: isMain ? 0.7 : 0.55,
        }}>{point.point}</span>
        <span style={{
          fontFamily: 'Crimson Pro, serif',
          fontSize: isMain ? 14 : 13,
          color: isMain ? BASE.bone : BASE.boneMid,
          lineHeight: 1.45,
          fontWeight: isMain ? 600 : 400,
        }}>
          {point.label}
        </span>
      </div>
      {point.sub?.map(s => <OutlineItem key={s.point} point={s} depth={depth + 1} />)}
    </div>
  )
}
