import { useState, useMemo } from 'react'
import { JUDAH_KINGS, ISRAEL_KINGS, King, SpiritualRating } from '../data/kingsData'
import { PERSON_BIOS } from '../data/personBios'

// ── Theme ───────────────────────────────────────────────────────────────────
const BASE = { bg: '#10120F', bgCard: '#1d2417', bgDeep: '#0c0e0b' }
const GOLD   = '#D8B33F'
const KHAKI  = '#B8B49D'
const STEEL  = '#7A8C6E'
const BONE   = '#F5F2E8'
const BG     = BASE.bg

const RATING_COLOR: Record<SpiritualRating, string> = {
  best:  '#4CAF8F',   // teal-green — genuinely righteous
  good:  '#6B9E5A',   // green
  mixed: GOLD,        // gold — complex reign
  evil:  '#B05050',   // muted red
}

const RATING_LABEL: Record<SpiritualRating, string> = {
  best:  'RIGHTEOUS',
  good:  'GOOD',
  mixed: 'MIXED',
  evil:  'EVIL',
}

// ── Props ───────────────────────────────────────────────────────────────────
interface Props {
  width: number
  height: number
}

// ── Component ───────────────────────────────────────────────────────────────
export default function KingsList({ width, height }: Props) {
  const [selected, setSelected] = useState<King | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [filterRating, setFilterRating] = useState<SpiritualRating | 'all'>('all')

  const HEADER_H  = 44
  const FILTER_H  = 32
  const DETAIL_H  = selected ? 280 : 0
  const LIST_H    = height - HEADER_H - FILTER_H - DETAIL_H - 2
  const COL_W     = Math.floor((width - 2) / 2)  // two equal columns

  const filteredJudah = useMemo(() =>
    filterRating === 'all' ? JUDAH_KINGS : JUDAH_KINGS.filter(k => k.rating === filterRating),
    [filterRating]
  )
  const filteredIsrael = useMemo(() =>
    filterRating === 'all' ? ISRAEL_KINGS : ISRAEL_KINGS.filter(k => k.rating === filterRating),
    [filterRating]
  )

  function yearLabel(bc: number) {
    return bc < 0 ? `${Math.abs(bc)} BC` : `${bc} AD`
  }

  function reignLabel(k: King) {
    if (k.reignYears < 1) {
      const months = Math.round(k.reignYears * 12)
      return months <= 1 ? '~1 mo' : `~${months} mo`
    }
    return `${Math.round(k.reignYears)} yr`
  }

  // ── King row ────────────────────────────────────────────────────────────
  function KingRow({ king }: { king: King }) {
    const isSelected = selected?.id === king.id
    const isHovered  = hoveredId === king.id
    const color      = RATING_COLOR[king.rating]

    return (
      <div
        onClick={() => setSelected(isSelected ? null : king)}
        onMouseEnter={() => setHoveredId(king.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{
          padding: '6px 10px',
          borderBottom: `1px solid ${KHAKI}12`,
          background: isSelected ? `${color}18` : isHovered ? `${KHAKI}08` : 'transparent',
          cursor: 'pointer',
          transition: 'background 0.12s',
          borderLeft: `2px solid ${isSelected ? color : 'transparent'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* rating dot */}
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: color, flexShrink: 0
          }} />
          {/* name */}
          <span style={{
            fontSize: 10.5, fontFamily: "'Crimson Pro', serif",
            color: isSelected ? BONE : KHAKI,
            fontWeight: isSelected ? 600 : 400,
            flex: 1,
            lineHeight: 1.2,
          }}>
            {king.name}
          </span>
          {/* reign length */}
          <span style={{ fontSize: 7, color: `${KHAKI}60`, letterSpacing: '0.06em' }}>
            {reignLabel(king)}
          </span>
        </div>
        <div style={{
          fontSize: 7, color: `${KHAKI}55`, marginTop: 2, paddingLeft: 12,
          letterSpacing: '0.05em'
        }}>
          {yearLabel(king.startBC)} – {yearLabel(king.endBC)}
        </div>
      </div>
    )
  }

  // ── Detail panel ────────────────────────────────────────────────────────
  const bio = selected ? PERSON_BIOS[selected.id] ?? null : null
  const ratingColor = selected ? RATING_COLOR[selected.rating] : KHAKI

  return (
    <div style={{
      width, height, background: BG,
      border: `2px solid ${KHAKI}55`,
      boxShadow: `0 0 0 1px ${KHAKI}18`,
      borderRadius: 16,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', fontFamily: 'JetBrains Mono', boxSizing: 'border-box'
    }}>

      {/* ── Header ── */}
      <div style={{
        height: HEADER_H, padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', cursor: 'grab',
        borderBottom: `1px solid ${KHAKI}20`,
        background: `${KHAKI}08`, flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 8, letterSpacing: '0.18em', color: `${KHAKI}90` }}>♛</span>
          <span style={{ fontSize: 8, letterSpacing: '0.14em', color: STEEL }}>KINGS OF ISRAEL & JUDAH</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 7, color: `${KHAKI}50`, letterSpacing: '0.1em' }}>
            931 – 586 BC
          </span>
        </div>
      </div>

      {/* ── Rating filter ── */}
      <div style={{
        height: FILTER_H, display: 'flex', alignItems: 'center',
        gap: 6, padding: '0 12px',
        borderBottom: `1px solid ${KHAKI}15`,
        background: `${KHAKI}05`, flexShrink: 0
      }}>
        <span style={{ fontSize: 6.5, color: `${KHAKI}50`, letterSpacing: '0.1em', marginRight: 2 }}>FILTER:</span>
        {(['all', 'best', 'good', 'mixed', 'evil'] as const).map(r => {
          const active = filterRating === r
          const color  = r === 'all' ? KHAKI : RATING_COLOR[r]
          return (
            <button key={r} onClick={() => setFilterRating(r)} style={{
              fontSize: 6.5, letterSpacing: '0.08em',
              color: active ? (r === 'all' ? BG : BG) : color,
              background: active ? color : 'transparent',
              border: `1px solid ${color}60`,
              borderRadius: 3, padding: '2px 6px',
              cursor: 'pointer', fontFamily: 'JetBrains Mono',
            }}>
              {r === 'all' ? 'ALL' : RATING_LABEL[r]}
            </button>
          )
        })}
      </div>

      {/* ── Two-column list ── */}
      <div style={{
        height: LIST_H, display: 'flex',
        flexShrink: 0, overflow: 'hidden'
      }}>
        {/* JUDAH column */}
        <div style={{
          width: COL_W, borderRight: `1px solid ${KHAKI}20`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{
            padding: '5px 10px 4px',
            borderBottom: `1px solid ${KHAKI}15`,
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            <div style={{ width: 6, height: 6, background: GOLD, borderRadius: 1 }} />
            <span style={{ fontSize: 7, letterSpacing: '0.14em', color: GOLD }}>JUDAH</span>
            <span style={{ fontSize: 6.5, color: `${KHAKI}40`, marginLeft: 'auto' }}>
              {filteredJudah.length} kings
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredJudah.map(k => <KingRow key={k.id} king={k} />)}
          </div>
        </div>

        {/* ISRAEL column */}
        <div style={{
          width: COL_W, display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{
            padding: '5px 10px 4px',
            borderBottom: `1px solid ${KHAKI}15`,
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            <div style={{ width: 6, height: 6, background: STEEL, borderRadius: 1 }} />
            <span style={{ fontSize: 7, letterSpacing: '0.14em', color: STEEL }}>ISRAEL (NORTH)</span>
            <span style={{ fontSize: 6.5, color: `${KHAKI}40`, marginLeft: 'auto' }}>
              {filteredIsrael.length} kings
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredIsrael.map(k => <KingRow key={k.id} king={k} />)}
          </div>
        </div>
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div style={{
          height: DETAIL_H, flexShrink: 0,
          borderTop: `1px solid ${KHAKI}20`,
          background: BASE.bgDeep,
          overflowY: 'auto',
          padding: '10px 14px',
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 7, color: ratingColor, letterSpacing: '0.14em', marginBottom: 2 }}>
                {RATING_LABEL[selected.rating]} · {selected.startBC < 0 ? 'BC' : 'AD'}
                {'  '}
                {yearLabel(selected.startBC)} – {yearLabel(selected.endBC)}{'  '}
                ({reignLabel(selected)})
              </div>
              <div style={{ fontSize: 15, fontFamily: "'Crimson Pro', serif", color: BONE, fontWeight: 600 }}>
                {selected.name}
              </div>
              <div style={{ fontSize: 7.5, color: `${KHAKI}80`, letterSpacing: '0.06em', marginTop: 2 }}>
                {selected.biblicalRef}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              style={{
                fontSize: 8, color: `${KHAKI}50`, background: 'transparent',
                border: 'none', cursor: 'pointer', padding: '2px 4px',
                fontFamily: 'JetBrains Mono', letterSpacing: '0.1em',
              }}
            >
              ✕
            </button>
          </div>

          {/* Description */}
          <p style={{
            fontSize: 11, fontFamily: "'Crimson Pro', serif",
            color: KHAKI, lineHeight: 1.62, margin: '0 0 8px',
          }}>
            {selected.desc}
          </p>

          {/* Notes / archaeology */}
          {selected.notes && (
            <div style={{
              fontSize: 9.5, fontFamily: "'Crimson Pro', serif",
              color: `${KHAKI}80`, lineHeight: 1.56,
              borderLeft: `2px solid ${GOLD}40`, paddingLeft: 8,
              marginBottom: 8,
            }}>
              {selected.notes}
            </div>
          )}

          {/* Bio excerpts from personBios if available */}
          {bio && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 6.5, color: `${KHAKI}40`, letterSpacing: '0.1em', marginBottom: 3 }}>
                ARCHAEOLOGICAL & THEOLOGICAL SIGNIFICANCE
              </div>
              <div style={{
                fontSize: 9.5, fontFamily: "'Crimson Pro', serif",
                color: `${KHAKI}80`, lineHeight: 1.58,
              }}>
                {bio.archaeological.slice(0, 280)}{bio.archaeological.length > 280 ? '…' : ''}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── React Flow node wrapper ─────────────────────────────────────────────────
import { NodeProps } from '@xyflow/react'

export function KingsListNode({ data }: NodeProps) {
  const d = data as { width?: number; height?: number }
  return (
    <KingsList
      width={d.width  ?? 500}
      height={d.height ?? 520}
    />
  )
}
