import { useMemo, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider,
  Handle, Position,
  EdgeLabelRenderer,
  type NodeProps, type EdgeProps, type Node, type Edge,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { motion, AnimatePresence } from 'motion/react'
import type { PhrasingAnalysis, Phrase, ClauseType } from '../types/phrasing'
import { CLAUSE_COLORS } from '../services/colors'
import { BASE } from '../theme'

interface Props {
  analysis: PhrasingAnalysis
  selectedId: string | null
  onSelect: (id: string | null) => void
  annotations: Record<string, string>
  onAnnotate: (phraseId: string, text: string) => void
  onWordClick: (word: string, phrase: Phrase) => void
  culturalPhraseIds?: Set<string>
}

const NODE_W = 320
const NODE_H_APPROX = 110
const INDENT = 76
const GAP_Y = 20
const PAD_X = 40
const PAD_Y = 40

type PhraseData = Phrase & {
  selectedId: string | null
  annotation: string | null
  hasCulturalNote: boolean
  onWordClick: (word: string, phrase: Phrase) => void
  onAnnotate: (phraseId: string, text: string) => void
}

function buildFlow(phrases: Phrase[], selectedId: string | null, annotations: Record<string, string>, culturalPhraseIds: Set<string>, onWordClick: Props['onWordClick'], onAnnotate: Props['onAnnotate']) {
  const childrenOf = new Map<string | null, Phrase[]>()
  for (const p of phrases) {
    const key = p.parentId ?? null
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(p)
  }
  const ordered: Phrase[] = []
  function visit(pid: string | null) {
    for (const p of childrenOf.get(pid) ?? []) { ordered.push(p); visit(p.id) }
  }
  visit(null)

  const nodes: Node<PhraseData>[] = ordered.map((p, i) => ({
    id: p.id,
    type: 'phraseNode',
    position: { x: PAD_X + p.level * INDENT, y: PAD_Y + i * (NODE_H_APPROX + GAP_Y) },
    data: { ...p, selectedId, annotation: annotations[p.id] ?? null, hasCulturalNote: culturalPhraseIds.has(p.id), onWordClick, onAnnotate },
    draggable: false,
  }))

  const edges: Edge[] = phrases
    .filter(p => p.parentId)
    .map(p => ({
      id: `e-${p.parentId}-${p.id}`,
      source: p.parentId!,
      target: p.id,
      type: 'phraseEdge',
      data: {
        color: CLAUSE_COLORS[p.type as ClauseType] ?? BASE.steel,
        connective: p.connective,
        dimmed: selectedId !== null && selectedId !== p.id,
      },
    }))

  return { nodes, edges }
}

// ── Annotation modal ───────────────────────────────────────────────────────────
function AnnotationModal({ phraseId, initial, onSave, onClose }: {
  phraseId: string; initial: string; onSave: (id: string, text: string) => void; onClose: () => void
}) {
  const [val, setVal] = useState(initial)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: `${BASE.bg}f8`, backdropFilter: 'blur(32px)',
          border: `1px solid ${BASE.borderGold}`, borderRadius: 16,
          padding: 24, width: 360,
        }}
      >
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 10 }}>study note</div>
        <textarea
          autoFocus value={val} onChange={e => setVal(e.target.value)}
          placeholder="Your observation on this clause…"
          style={{
            width: '100%', height: 100, background: BASE.goldDim,
            border: `1px solid ${BASE.borderGold}`, borderRadius: 10,
            padding: '10px 12px', color: BASE.bone, fontFamily: 'Crimson Pro, serif', fontSize: 14,
            resize: 'none', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => { onSave(phraseId, val); onClose() }}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
              background: BASE.goldMid, border: `1px solid ${BASE.borderGold}`,
              color: BASE.gold, fontFamily: 'Crimson Pro, serif', fontSize: 14,
            }}>Save</button>
          {initial && (
            <button onClick={() => { onSave(phraseId, ''); onClose() }}
              style={{
                padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${BASE.red}44`,
                color: BASE.red, fontFamily: 'Crimson Pro, serif', fontSize: 14,
              }}>Remove</button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ── Glass card node ────────────────────────────────────────────────────────────
function PhraseNode({ data }: NodeProps) {
  const phrase = data as PhraseData
  const color = CLAUSE_COLORS[phrase.type as ClauseType] ?? BASE.steel
  const isMain = phrase.type === 'main'
  const isSelected = phrase.selectedId === phrase.id
  const isDimmed = phrase.selectedId !== null && !isSelected

  // Render text as individually clickable words
  const words = phrase.text.split(/(\s+)/)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: isDimmed ? 0.12 : 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: phrase.level * 0.06 }}
      onContextMenu={e => { e.preventDefault(); phrase.onAnnotate(phrase.id, phrase.annotation ?? '') }}
      style={{
        width: NODE_W,
        background: isMain ? `${BASE.bgCard}ee` : `${BASE.bg}cc`,
        backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
        borderRadius: 16,
        border: `1px solid ${color}${isSelected ? '50' : isMain ? '28' : '16'}`,
        boxShadow: isMain
          ? `0 0 100px ${color}12, 0 32px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)`
          : isSelected
          ? `0 0 50px ${color}10, 0 20px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)`
          : `0 10px 28px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.025)`,
        padding: '14px 18px 14px 20px',
        position: 'relative', overflow: 'hidden', cursor: 'pointer',
      }}
    >
      {/* Top light line */}
      <div style={{
        position: 'absolute', top: 0, left: '18%', right: '18%', height: 1,
        background: `linear-gradient(90deg, transparent, ${color}${isMain ? 'bb' : '55'}, transparent)`,
      }} />
      {/* Left accent */}
      <div style={{
        position: 'absolute', top: 14, bottom: 14, left: 0, width: 2,
        background: `linear-gradient(180deg, transparent, ${color}, transparent)`,
        borderRadius: '0 2px 2px 0',
        opacity: isMain ? 1 : isSelected ? 0.75 : 0.45,
      }} />
      {/* Bloom */}
      <div style={{
        position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)',
        width: 220, height: 90, pointerEvents: 'none',
        background: `radial-gradient(ellipse, ${color}${isMain ? '14' : '09'} 0%, transparent 70%)`,
      }} />

      {/* Type row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: color, boxShadow: `0 0 ${isMain ? 12 : 7}px ${color}` }} />
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color, letterSpacing: '0.07em', textTransform: 'capitalize', opacity: 0.9 }}>
          {phrase.type}
        </span>
        {phrase.connective && (
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.04em' }}>
            · {phrase.connective}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono', fontSize: 8, color: `${color}45`, letterSpacing: '0.04em' }}>
          {phrase.role}
        </span>
        {/* Note indicator */}
        {phrase.annotation && (
          <span title={phrase.annotation} style={{ fontSize: 10, color: BASE.gold, marginLeft: 2 }}>✎</span>
        )}
        {/* Cultural note indicator */}
        {phrase.hasCulturalNote && (
          <span title="Cultural context note" style={{
            fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.06em',
            color: BASE.gold, background: BASE.goldDim,
            border: `1px solid ${BASE.borderGold}`, borderRadius: 4,
            padding: '1px 5px', marginLeft: 2,
          }}>ctx</span>
        )}
      </div>

      {/* Scripture text — each word is clickable for word study */}
      <p style={{ margin: 0, fontFamily: 'Crimson Pro, Georgia, serif', fontSize: isMain ? 15.5 : 14.5, color: isMain ? BASE.bone : BASE.boneMid, lineHeight: 1.55, fontWeight: isMain ? 500 : 400, flexWrap: 'wrap', display: 'flex', gap: 0 }}>
        {words.map((w, i) =>
          w.match(/\s/) ? (
            <span key={i}>{w}</span>
          ) : (
            <span
              key={i}
              onClick={e => { e.stopPropagation(); const clean = w.replace(/[.,;:!?"'()\[\]{}]/g, ''); if (clean) phrase.onWordClick(clean, phrase as unknown as Phrase) }}
              style={{ cursor: 'pointer', borderRadius: 3, transition: 'background 0.12s', padding: '0 1px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}22` }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >{w}</span>
          )
        )}
      </p>

      {/* Theological note */}
      {phrase.theologicalNote && (
        <p style={{ margin: '8px 0 0', fontFamily: 'Crimson Pro, Georgia, serif', fontSize: 11.5, fontStyle: 'italic', color, lineHeight: 1.4, opacity: isSelected ? 0.82 : 0.3, transition: 'opacity 0.35s ease' }}>
          {phrase.theologicalNote}
        </p>
      )}

      {/* Study annotation */}
      {phrase.annotation && (
        <p style={{ margin: '6px 0 0', fontFamily: 'Crimson Pro, Georgia, serif', fontSize: 12, color: BASE.gold, lineHeight: 1.5, borderTop: `1px solid ${BASE.borderGold}`, paddingTop: 6 }}>
          {phrase.annotation}
        </p>
      )}

      <Handle type="source" position={Position.Bottom}
        style={{ left: 18, bottom: 0, opacity: 0, width: 1, height: 1, background: 'transparent', border: 'none', minWidth: 0, minHeight: 0 }} />
      <Handle type="target" position={Position.Left}
        style={{ top: '50%', left: 0, opacity: 0, width: 1, height: 1, background: 'transparent', border: 'none', minWidth: 0, minHeight: 0 }} />
    </motion.div>
  )
}

// ── Edge ───────────────────────────────────────────────────────────────────────
function PhraseEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const { color = BASE.steel, connective, dimmed } = (data ?? {}) as { color: string; connective?: string; dimmed?: boolean }
  const pathD = `M ${sourceX} ${sourceY} L ${sourceX} ${targetY} L ${targetX} ${targetY}`
  const labelX = sourceX, labelY = (sourceY + targetY) / 2
  return (
    <>
      <path d={pathD} fill="none" stroke={color} strokeWidth={8} strokeOpacity={dimmed ? 0 : 0.06} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={dimmed ? 0.04 : 0.55} strokeDasharray="10 7" style={{ animation: dimmed ? 'none' : 'phrase-flow 2s linear infinite' }} />
      {connective && !dimmed && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: 'rgba(6,7,26,0.9)', backdropFilter: 'blur(12px)',
            border: `1px solid ${color}28`, borderRadius: 20, padding: '2px 9px',
            fontFamily: 'JetBrains Mono', fontSize: 8, color, letterSpacing: '0.05em',
            pointerEvents: 'none', zIndex: 10,
          }}>{connective}</div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes = { phraseNode: PhraseNode }
const edgeTypes = { phraseEdge: PhraseEdge }

// ── Legend ─────────────────────────────────────────────────────────────────────
function Legend({ phrases, selectedId, onSelect }: { phrases: Phrase[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const types = [...new Set(phrases.map(p => p.type))]
  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, zIndex: 10,
      background: `${BASE.bg}cc`, backdropFilter: 'blur(20px)',
      border: `1px solid ${BASE.borderGold}`, borderRadius: 12, padding: '10px 12px',
    }}>
      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.12em', marginBottom: 5 }}>clause types</div>
      {types.map(t => {
        const color = CLAUSE_COLORS[t as ClauseType]
        const active = selectedId && phrases.find(p => p.type === t && p.id === selectedId)
        return (
          <button key={t}
            onClick={() => { const first = phrases.find(p => p.type === t); if (first) onSelect(selectedId === first.id ? null : first.id) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: active ? `${color}18` : 'transparent',
              border: `1px solid ${active ? `${color}44` : 'transparent'}`,
              borderRadius: 8, padding: '3px 7px', cursor: 'pointer', transition: 'all 0.2s',
            }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: active ? `0 0 8px ${color}` : 'none' }} />
            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: active ? color : BASE.steel, textTransform: 'capitalize', transition: 'color 0.2s' }}>{t}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────
export function PhrasingDiagram({ analysis, selectedId, onSelect, annotations, onAnnotate, onWordClick, culturalPhraseIds }: Props) {
  const [annotatingId, setAnnotatingId] = useState<string | null>(null)
  const [annotationInit, setAnnotationInit] = useState('')

  function handleAnnotate(phraseId: string, current: string) {
    setAnnotationInit(current)
    setAnnotatingId(phraseId)
  }

  const phraseIds = culturalPhraseIds ?? new Set<string>()

  const { nodes, edges } = useMemo(
    () => buildFlow(analysis.phrases, selectedId, annotations, phraseIds, onWordClick, handleAnnotate),
    [analysis.phrases, selectedId, annotations, phraseIds, onWordClick]
  )

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes} edges={edges}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodeClick={(_, node) => onSelect(selectedId === node.id ? null : node.id)}
          onPaneClick={() => onSelect(null)}
          fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
          onInit={(rf: ReactFlowInstance) => { setTimeout(() => rf.fitView({ padding: 0.12, maxZoom: 1 }), 80) }}
          minZoom={0.1} maxZoom={3}
          nodesDraggable={false} nodesConnectable={false}
          style={{ background: 'transparent' }}
          proOptions={{ hideAttribution: true }}
        >
        </ReactFlow>
      </ReactFlowProvider>

      <Legend phrases={analysis.phrases} selectedId={selectedId} onSelect={onSelect} />

      <div style={{
        position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        fontFamily: 'JetBrains Mono', fontSize: 8,
        color: 'rgba(120,120,160,0.3)', letterSpacing: '0.18em',
        pointerEvents: 'none', zIndex: 2,
      }}>
        click word for study · right-click node to annotate · scroll · drag
      </div>

      <AnimatePresence>
        {annotatingId && (
          <AnnotationModal
            key={annotatingId}
            phraseId={annotatingId}
            initial={annotationInit}
            onSave={onAnnotate}
            onClose={() => setAnnotatingId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
