import { useState, useMemo } from 'react'
import { NodeProps } from '@xyflow/react'
import { ALL_TREES, GenealogyTree, GenealogyNode } from '../data/genealogyData'

// ── Theme ────────────────────────────────────────────────────────────────────
const BASE_BG  = '#10120F'
const CARD_BG  = '#1d2417'
const DEEP_BG  = '#0c0e0b'
const GOLD     = '#D8B33F'
const KHAKI    = '#B8B49D'
const STEEL    = '#7A8C6E'
const BONE     = '#F5F2E8'

const RATING_COLOR: Record<string, string> = {
  notable: GOLD,
  normal: KHAKI,
}

// ── Utility: build generation groups ─────────────────────────────────────────
function groupByGeneration(nodes: GenealogyNode[]): Map<number, GenealogyNode[]> {
  const map = new Map<number, GenealogyNode[]>()
  for (const n of nodes) {
    if (!map.has(n.generation)) map.set(n.generation, [])
    map.get(n.generation)!.push(n)
  }
  return map
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { width: number; height: number }

export default function LineageViewer({ width, height }: Props) {
  const [treeIdx, setTreeIdx]         = useState(0)
  const [selected, setSelected]       = useState<GenealogyNode | null>(null)
  const [search, setSearch]           = useState('')
  const [expandAll, setExpandAll]     = useState(false)

  const tree: GenealogyTree = ALL_TREES[treeIdx]

  const HEADER_H = 44
  const TAB_H    = 32
  const SEARCH_H = 32
  const DETAIL_H = selected ? 230 : 0
  const LIST_H   = height - HEADER_H - TAB_H - SEARCH_H - DETAIL_H - 2

  // Filter nodes by search
  const filtered = useMemo(() => {
    if (!search.trim()) return tree.nodes
    const q = search.toLowerCase()
    return tree.nodes.filter(n =>
      n.name.toLowerCase().includes(q) ||
      n.significance.toLowerCase().includes(q) ||
      n.refs.some(r => r.toLowerCase().includes(q))
    )
  }, [tree, search])

  const generations = useMemo(() => groupByGeneration(filtered), [filtered])
  const sortedGens  = useMemo(() => [...generations.keys()].sort((a, b) => a - b), [generations])

  // Collect which generations have notable nodes visible
  const hasSearch = search.trim().length > 0

  return (
    <div style={{
      width, height, background: BASE_BG,
      border: `2px solid ${KHAKI}55`,
      boxShadow: `0 0 0 1px ${KHAKI}18`,
      borderRadius: 16,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', fontFamily: 'JetBrains Mono',
      boxSizing: 'border-box',
    }}>

      {/* ── Header ── */}
      <div style={{
        height: HEADER_H, padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${KHAKI}20`, background: `${KHAKI}08`,
        cursor: 'grab', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 8, letterSpacing: '0.18em', color: `${KHAKI}90` }}>✦</span>
          <span style={{ fontSize: 8, letterSpacing: '0.14em', color: STEEL }}>LINEAGE VIEWER</span>
        </div>
        <button
          onClick={() => setExpandAll(e => !e)}
          style={{
            fontSize: 6.5, letterSpacing: '0.08em',
            color: expandAll ? GOLD : `${KHAKI}50`,
            background: expandAll ? `${GOLD}12` : 'transparent',
            border: `1px solid ${expandAll ? GOLD + '40' : KHAKI + '20'}`,
            borderRadius: 4, padding: '2px 7px', cursor: 'pointer',
            fontFamily: 'JetBrains Mono',
          }}
        >
          {expandAll ? 'COLLAPSE ALL' : 'EXPAND ALL'}
        </button>
      </div>

      {/* ── Tree selector tabs ── */}
      <div style={{
        height: TAB_H, display: 'flex', alignItems: 'stretch',
        borderBottom: `1px solid ${KHAKI}15`, background: DEEP_BG, flexShrink: 0,
      }}>
        {ALL_TREES.map((t, i) => {
          const active = treeIdx === i
          return (
            <button key={t.id}
              onClick={() => { setTreeIdx(i); setSelected(null); setSearch('') }}
              style={{
                flex: 1, background: active ? `${GOLD}18` : 'transparent',
                border: 'none', borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
                cursor: 'pointer', fontFamily: 'JetBrains Mono',
                color: active ? GOLD : `${KHAKI}60`,
                fontSize: 6.5, letterSpacing: '0.08em',
                transition: 'all 0.15s', padding: '0 4px',
              }}
            >
              {t.label.toUpperCase()}
            </button>
          )
        })}
      </div>

      {/* ── Search ── */}
      <div style={{
        height: SEARCH_H, padding: '0 12px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${KHAKI}15`, background: DEEP_BG, flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: `${KHAKI}40` }}>⌕</span>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null) }}
          placeholder="Search names, refs, significance..."
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: KHAKI, fontFamily: 'JetBrains Mono', fontSize: 9,
            letterSpacing: '0.04em',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{
            fontSize: 8, color: `${KHAKI}40`, background: 'transparent',
            border: 'none', cursor: 'pointer', fontFamily: 'JetBrains Mono',
          }}>✕</button>
        )}
      </div>

      {/* ── Generation list ── */}
      <div style={{
        height: LIST_H, overflowY: 'auto', flexShrink: 0,
        padding: '6px 0',
      }}>
        {!hasSearch && (
          <div style={{
            padding: '4px 14px 8px',
            fontSize: 9, fontFamily: "'Crimson Pro', serif",
            color: `${KHAKI}50`, lineHeight: 1.5,
            borderBottom: `1px solid ${KHAKI}10`, marginBottom: 4,
          }}>
            {tree.desc.slice(0, 180)}{tree.desc.length > 180 ? '…' : ''}
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ padding: '20px 14px', fontSize: 10, color: `${KHAKI}40`, fontFamily: "'Crimson Pro', serif" }}>
            No matches for "{search}"
          </div>
        )}

        {sortedGens.map(gen => {
          const nodes = generations.get(gen)!
          return (
            <GenerationRow
              key={gen}
              gen={gen}
              nodes={nodes}
              selected={selected}
              onSelect={setSelected}
              expandAll={expandAll}
              hasSearch={hasSearch}
            />
          )
        })}
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div style={{
          height: DETAIL_H, flexShrink: 0,
          borderTop: `1px solid ${KHAKI}20`,
          background: CARD_BG, overflowY: 'auto',
          padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
            <div>
              <div style={{ fontSize: 7, letterSpacing: '0.14em', color: selected.notable ? GOLD : STEEL, marginBottom: 2 }}>
                GEN {selected.generation} {selected.spouse ? `· m. ${selected.spouse}` : ''} {selected.dates ? `· ${selected.dates}` : ''}
              </div>
              <div style={{ fontSize: 14, fontFamily: "'Crimson Pro', serif", color: BONE, fontWeight: 600 }}>
                {selected.name}
              </div>
              <div style={{ fontSize: 9.5, fontFamily: "'Crimson Pro', serif", color: `${KHAKI}80`, marginTop: 2, lineHeight: 1.45, fontStyle: 'italic' }}>
                {selected.significance}
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{
              fontSize: 8, color: `${KHAKI}50`, background: 'transparent',
              border: 'none', cursor: 'pointer', fontFamily: 'JetBrains Mono',
            }}>✕</button>
          </div>

          <p style={{
            fontSize: 10.5, fontFamily: "'Crimson Pro', serif",
            color: KHAKI, lineHeight: 1.65, margin: '6px 0 8px',
          }}>
            {selected.desc}
          </p>

          {selected.refs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {selected.refs.map(ref => (
                <span key={ref} style={{
                  fontSize: 7, color: `${KHAKI}75`,
                  background: `${KHAKI}0d`,
                  border: `1px solid ${KHAKI}25`,
                  borderRadius: 3, padding: '1px 5px',
                  letterSpacing: '0.04em',
                }}>
                  {ref}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Generation row ────────────────────────────────────────────────────────────
interface GenRowProps {
  gen: number
  nodes: GenealogyNode[]
  selected: GenealogyNode | null
  onSelect: (n: GenealogyNode | null) => void
  expandAll: boolean
  hasSearch: boolean
}

function GenerationRow({ gen, nodes, selected, onSelect, expandAll, hasSearch }: GenRowProps) {
  const [open, setOpen] = useState(false)
  const isOpen = expandAll || open || hasSearch

  // Show at most 4 nodes inline; rest hidden behind expand
  const hasNotable = nodes.some(n => n.notable)

  return (
    <div style={{ marginBottom: 1 }}>
      {/* Generation label row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 14px', cursor: 'pointer',
          borderLeft: `2px solid ${hasNotable ? GOLD + '60' : KHAKI + '20'}`,
        }}
      >
        <span style={{ fontSize: 6, color: `${KHAKI}30`, fontFamily: 'JetBrains Mono', minWidth: 20 }}>
          {gen === 0 ? 'ROOT' : `G${gen}`}
        </span>
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {nodes.map(n => (
            <span key={n.id} style={{
              fontSize: 7.5,
              color: n.notable ? GOLD : `${KHAKI}80`,
              fontFamily: 'JetBrains Mono',
              letterSpacing: '0.04em',
              background: selected?.id === n.id ? `${GOLD}18` : 'transparent',
              borderRadius: 3, padding: '1px 3px',
            }}>
              {n.notable ? '★ ' : ''}{n.name}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 7, color: `${KHAKI}25` }}>{isOpen ? '▾' : '▸'}</span>
      </button>

      {/* Expanded node cards */}
      {isOpen && (
        <div style={{ padding: '2px 14px 6px 36px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {nodes.map(n => {
            const isSel = selected?.id === n.id
            return (
              <button key={n.id}
                onClick={() => onSelect(isSel ? null : n)}
                style={{
                  background: isSel ? `${GOLD}10` : `${KHAKI}06`,
                  border: `1px solid ${isSel ? GOLD + '50' : KHAKI + '15'}`,
                  borderRadius: 6, padding: '6px 10px',
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'JetBrains Mono',
                  transition: 'all 0.12s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  {n.notable && (
                    <span style={{ fontSize: 7, color: GOLD }}>★</span>
                  )}
                  <span style={{
                    fontSize: 9,
                    color: n.notable ? GOLD : BONE,
                    fontFamily: "'Crimson Pro', serif",
                    fontWeight: n.notable ? 700 : 500,
                  }}>
                    {n.name}
                  </span>
                  {n.dates && (
                    <span style={{ fontSize: 6.5, color: `${KHAKI}45`, letterSpacing: '0.04em' }}>{n.dates}</span>
                  )}
                </div>
                <div style={{
                  fontSize: 9, fontFamily: "'Crimson Pro', serif",
                  color: `${KHAKI}70`, lineHeight: 1.4, fontStyle: 'italic',
                }}>
                  {n.significance}
                </div>
                {n.refs.slice(0, 3).map(r => (
                  <span key={r} style={{
                    fontSize: 6.5, color: `${KHAKI}50`,
                    marginRight: 5, letterSpacing: '0.04em',
                  }}>
                    {r}
                  </span>
                ))}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── React Flow node wrapper ───────────────────────────────────────────────────
export function LineageViewerNode({ data }: NodeProps) {
  const d = data as { width?: number; height?: number }
  return (
    <LineageViewer
      width={d.width  ?? 500}
      height={d.height ?? 580}
    />
  )
}
