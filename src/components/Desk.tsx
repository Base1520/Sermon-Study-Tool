import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Panel,
  Handle, Position, EdgeLabelRenderer, NodeResizer,
  useReactFlow, useNodesState, useEdgesState, useNodeId, useStore,
  type NodeProps, type EdgeProps, type Node, type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { motion, AnimatePresence } from 'motion/react'
import type { PhrasingAnalysis, Phrase, ClauseType } from '../types/phrasing'
import { CLAUSE_COLORS } from '../services/colors'
import { BASE } from '../theme'
import { TopoMap } from './TopoMap'
import { MonarchyCardNode } from './MonarchyCard'
import { KingsListNode } from './KingsList'
import { WorshipStructureNode } from './WorshipStructure'
import { LineageViewerNode } from './LineageViewer'

// ── Layout constants ───────────────────────────────────────────────────────────
const NODE_W = 320
const NODE_H = 110
const INDENT = 76
const GAP_Y = 48
const PHRASE_X = 80          // phrase tree left column
const PHRASE_Y = 60
// Phrase tree max right edge: 80 + 3*76 + 320 = 628. Add 60px gap → CARD_X = 690
const CARD_X = 690           // col 1: Outline (top) + Draft (bottom)
const CARD_W = 400           // width of col-1 cards
const CARD_W2 = 380          // width of col-2 cards
const CARD_GAP_X = 24        // horizontal gap between col 1 and col 2
const CARD_X2 = CARD_X + CARD_W + CARD_GAP_X   // col 2: Theme (top) + Cultural (bottom)
const CARD_H_TOP = 380       // height of top-row cards
const CARD_GAP_Y = 24        // vertical gap between rows
const DRAFT_Y = PHRASE_Y + CARD_H_TOP + CARD_GAP_Y  // row 2 y position
const CARD_H_BOT = 460       // height of bottom-row cards


// ── Shared types ───────────────────────────────────────────────────────────────
type PhraseData = Phrase & {
  selectedId: string | null
  annotation: string | null
  hasCulturalNote: boolean
  onWordClick: (word: string, phrase: Phrase) => void
  onAnnotate: (phraseId: string, text: string) => void
}

interface Props {
  analysis: PhrasingAnalysis
  annotations: Record<string, string>
  onAnnotate: (phraseId: string, text: string) => void
  onWordClick: (word: string, phrase: Phrase) => void
  culturalPhraseIds: Set<string>
  selectedPhraseId: string | null
  onSelectPhrase: (id: string | null) => void
  apiKey: string
  historyId: string | null
  initialDraft?: string
  onDraftChange?: (text: string) => void
  phraseMode?: 'key' | 'all'
  onPhraseModeChange?: (mode: 'key' | 'all') => void
}

// ── Tilt card wrapper ──────────────────────────────────────────────────────────
// Perspective tilt + a gold sheen that follows the cursor across the card face.
// Transform is written straight to the DOM so hover never triggers a re-render;
// tilt is skipped while a mouse button is down so card dragging stays stable.
function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const sheenRef = useRef<HTMLDivElement>(null)

  function onMove(e: React.MouseEvent) {
    const el = ref.current
    if (!el || e.buttons) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    el.style.transform = `perspective(1100px) rotateX(${(0.5 - py) * 2.6}deg) rotateY(${(px - 0.5) * 2.6}deg)`
    const sheen = sheenRef.current
    if (sheen) {
      sheen.style.opacity = '1'
      sheen.style.background = `radial-gradient(300px circle at ${px * 100}% ${py * 100}%, rgba(216,179,63,0.06), transparent 65%)`
    }
  }

  function onLeave() {
    const el = ref.current
    if (!el) return
    el.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg)'
    if (sheenRef.current) sheenRef.current.style.opacity = '0'
  }

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}
      style={{ position: 'relative', transition: 'transform 0.25s ease-out', willChange: 'transform' }}>
      {children}
      <div ref={sheenRef} style={{
        position: 'absolute', inset: 0, borderRadius: 16,
        pointerEvents: 'none', opacity: 0, transition: 'opacity 0.3s',
      }} />
    </div>
  )
}

// ── Annotation modal ───────────────────────────────────────────────────────────
function AnnotationModal({ phraseId, initial, onSave, onClose }: {
  phraseId: string; initial: string; onSave: (id: string, text: string) => void; onClose: () => void
}) {
  const [val, setVal] = useState(initial)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }} onClick={e => e.stopPropagation()}
        style={{ background: `${BASE.bg}f8`, backdropFilter: 'blur(32px)', border: `1px solid ${BASE.borderGold}`, borderRadius: 16, padding: 24, width: 360 }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 10 }}>study note</div>
        <textarea autoFocus value={val} onChange={e => setVal(e.target.value)} placeholder="Your observation on this clause…"
          style={{ width: '100%', height: 100, background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`, borderRadius: 10, padding: '10px 12px', color: BASE.bone, fontFamily: 'Crimson Pro, serif', fontSize: 14, resize: 'none', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => { onSave(phraseId, val); onClose() }}
            style={{ flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', background: BASE.goldMid, border: `1px solid ${BASE.borderGold}`, color: BASE.gold, fontFamily: 'Crimson Pro, serif', fontSize: 14 }}>Save</button>
          {initial && (
            <button onClick={() => { onSave(phraseId, ''); onClose() }}
              style={{ padding: '9px 16px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: `1px solid ${BASE.red}44`, color: BASE.red, fontFamily: 'Crimson Pro, serif', fontSize: 14 }}>Remove</button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ── Phrase Node ────────────────────────────────────────────────────────────────
function PhraseNode({ data }: NodeProps) {
  const phrase = data as unknown as PhraseData
  const color = CLAUSE_COLORS[phrase.type as ClauseType] ?? BASE.steel
  const isMain = phrase.type === 'main'
  const isSelected = phrase.selectedId === phrase.id
  const isDimmed = phrase.selectedId !== null && !isSelected

  const words = phrase.text.split(/(\s+)/)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: isDimmed ? 0.1 : 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: phrase.level * 0.06 }}
      onContextMenu={e => { e.preventDefault(); phrase.onAnnotate(phrase.id, phrase.annotation ?? '') }}
      style={{
        width: NODE_W, background: isMain ? `${BASE.bgCard}ee` : `${BASE.bg}cc`,
        backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
        borderRadius: 16, border: `1px solid ${color}${isSelected ? '50' : isMain ? '28' : '16'}`,
        boxShadow: isMain
          ? `0 0 100px ${color}12, 0 32px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)`
          : `0 10px 28px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.025)`,
        padding: '14px 18px 14px 20px', position: 'relative', overflow: 'hidden', cursor: 'pointer',
      }}>
      <div style={{ position: 'absolute', top: 0, left: '18%', right: '18%', height: 1, background: `linear-gradient(90deg, transparent, ${color}${isMain ? 'bb' : '55'}, transparent)` }} />
      <div style={{ position: 'absolute', top: 14, bottom: 14, left: 0, width: 2, background: `linear-gradient(180deg, transparent, ${color}, transparent)`, borderRadius: '0 2px 2px 0', opacity: isMain ? 1 : 0.45 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: color, boxShadow: `0 0 ${isMain ? 12 : 7}px ${color}` }} />
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color, letterSpacing: '0.07em', textTransform: 'capitalize', opacity: 0.9 }}>{phrase.type}</span>
        {phrase.connective && <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel }}>· {phrase.connective}</span>}
        <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono', fontSize: 8, color: `${color}45` }}>{phrase.role}</span>
        {phrase.annotation && <span style={{ fontSize: 10, color: BASE.gold }}>✎</span>}
        {phrase.hasCulturalNote && (
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`, borderRadius: 4, padding: '1px 5px' }}>ctx</span>
        )}
      </div>
      <p style={{ margin: 0, fontFamily: 'Crimson Pro, Georgia, serif', fontSize: isMain ? 15.5 : 14.5, color: isMain ? BASE.bone : BASE.boneMid, lineHeight: 1.55, fontWeight: isMain ? 500 : 400, flexWrap: 'wrap', display: 'flex', gap: 0 }}>
        {words.map((w, i) =>
          w.match(/\s/) ? <span key={i}>{w}</span> : (
            <span key={i}
              onClick={e => { e.stopPropagation(); const clean = w.replace(/[.,;:!?"'()\[\]{}]/g, ''); if (clean) phrase.onWordClick(clean, phrase as unknown as Phrase) }}
              style={{ cursor: 'pointer', borderRadius: 3, transition: 'background 0.12s', padding: '0 1px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}22` }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >{w}</span>
          )
        )}
      </p>
      {phrase.theologicalNote && (
        <p style={{ margin: '8px 0 0', fontFamily: 'Crimson Pro, serif', fontSize: 11.5, fontStyle: 'italic', color, lineHeight: 1.4, opacity: isSelected ? 0.82 : 0.3, transition: 'opacity 0.35s' }}>{phrase.theologicalNote}</p>
      )}
      {phrase.annotation && (
        <p style={{ margin: '6px 0 0', fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.gold, lineHeight: 1.5, borderTop: `1px solid ${BASE.borderGold}`, paddingTop: 6 }}>{phrase.annotation}</p>
      )}
      <Handle type="source" position={Position.Bottom} style={{ left: 18, bottom: 0, opacity: 0, width: 1, height: 1, background: 'transparent', border: 'none', minWidth: 0, minHeight: 0 }} />
      <Handle type="target" position={Position.Left} style={{ top: '50%', left: 0, opacity: 0, width: 1, height: 1, background: 'transparent', border: 'none', minWidth: 0, minHeight: 0 }} />
    </motion.div>
  )
}

// ── Phrase Edge ────────────────────────────────────────────────────────────────
function PhraseEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const { color = BASE.steel, connective, dimmed } = (data ?? {}) as { color: string; connective?: string; dimmed?: boolean }
  const pathD = `M ${sourceX} ${sourceY} L ${sourceX} ${targetY} L ${targetX} ${targetY}`
  const labelX = sourceX, labelY = (sourceY + targetY) / 2
  return (
    <>
      <path d={pathD} fill="none" stroke={color} strokeWidth={8} strokeOpacity={dimmed ? 0 : 0.06} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={dimmed ? 0.04 : 0.55} strokeDasharray="10 7"
        style={{ animation: dimmed ? 'none' : 'phrase-flow 2s linear infinite' }} />
      {connective && !dimmed && (
        <EdgeLabelRenderer>
          <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, background: 'rgba(6,7,26,0.9)', backdropFilter: 'blur(12px)', border: `1px solid ${color}28`, borderRadius: 20, padding: '2px 9px', fontFamily: 'JetBrains Mono', fontSize: 8, color, letterSpacing: '0.05em', pointerEvents: 'none', zIndex: 10 }}>{connective}</div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

// Close button — removes this node from the canvas
function CloseBtn({ color = BASE.steel }: { color?: string }) {
  const id  = useNodeId()
  const { setNodes } = useReactFlow()
  return (
    <button
      onClick={() => setNodes(ns => ns.filter(n => n.id !== id))}
      title="Close tile"
      style={{
        marginLeft: 'auto', width: 20, height: 20, padding: 0,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: `${color}70`, fontSize: 14, lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4,
      }}
      onMouseEnter={e => (e.currentTarget.style.color = BASE.red)}
      onMouseLeave={e => (e.currentTarget.style.color = `${color}70`)}
    >×</button>
  )
}

// Returns the React-Flow-measured pixel dimensions for this node (falls back to defaults)
export function useCardDims(fallbackW: number, fallbackH: number) {
  const id = useNodeId()
  const w = useStore(s => s.nodeLookup.get(id ?? '')?.measured?.width ?? fallbackW)
  const h = useStore(s => s.nodeLookup.get(id ?? '')?.measured?.height ?? fallbackH)
  return { w: w || fallbackW, h: h || fallbackH }
}

// ── Outline Card Node ──────────────────────────────────────────────────────────
function OutlineCardNode({ data }: NodeProps) {
  const { outline, mainTheme, reference } = data as any
  const { w, h } = useCardDims(CARD_W, CARD_H_TOP)
  const hs = { width: 14, height: 14, borderRadius: 4, background: '#2c3820', border: `1px solid ${BASE.khaki}30` }
  const ls = { border: `1px solid ${BASE.khaki}20` }
  return (
    <>
      <NodeResizer minWidth={280} minHeight={120} handleStyle={hs} lineStyle={ls} />
      <TiltCard>
      <div style={{ width: w, height: h, overflow: 'hidden', borderRadius: 16, background: '#2c3820', border: `2px solid ${BASE.khaki}55`, boxShadow: `0 0 0 1px ${BASE.khaki}18`, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ padding: '12px 18px 10px', borderBottom: `1px solid ${BASE.khaki}20`, display: 'flex', alignItems: 'center', gap: 10, cursor: 'grab', background: `${BASE.khaki}08`, flexShrink: 0 }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.khaki, letterSpacing: '0.14em' }}>SERMON OUTLINE</span>
        <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.khaki, marginLeft: 'auto' }}>{reference}</span>
      </div>
      <div className="nowheel" style={{ padding: '14px 18px', overflowY: 'auto', flex: 1 }}>
        <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.gold, fontStyle: 'italic', lineHeight: 1.5, borderLeft: `2px solid ${BASE.gold}44`, paddingLeft: 10, margin: '0 0 14px' }}>{mainTheme}</p>
        {(outline ?? []).map((p: any, i: number) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: BASE.gold, flexShrink: 0 }}>{p.point}</span>
              <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.bone, fontWeight: 500, lineHeight: 1.4 }}>{p.label}</span>
            </div>
            {(p.sub ?? []).map((s: any, j: number) => (
              <div key={j} style={{ display: 'flex', gap: 10, marginLeft: 28, marginTop: 5, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, flexShrink: 0 }}>{s.point}</span>
                <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid }}>{s.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      </div>
      </TiltCard>
    </>
  )
}

// ── Theme / Context Card Node ──────────────────────────────────────────────────
function ThemeCardNode({ data }: NodeProps) {
  const { biblicalThemes, keyWords, bookTheme, passageRole, canonicalConnections, genre } = data as any
  const { w, h } = useCardDims(CARD_W2, CARD_H_TOP)
  const hs = { width: 14, height: 14, borderRadius: 4, background: '#2c3820', border: `1px solid ${BASE.khaki}30` }
  const ls = { border: `1px solid ${BASE.khaki}20` }
  return (
    <>
      <NodeResizer minWidth={240} minHeight={120} handleStyle={hs} lineStyle={ls} />
      <TiltCard>
      <div style={{ width: w, height: h, overflow: 'hidden', borderRadius: 16, background: '#2c3820', border: `2px solid ${BASE.khaki}55`, boxShadow: `0 0 0 1px ${BASE.khaki}18`, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ padding: '12px 18px 10px', borderBottom: `1px solid ${BASE.khaki}20`, cursor: 'grab', background: `${BASE.khaki}08`, flexShrink: 0 }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.khaki, letterSpacing: '0.14em' }}>CANONICAL CONTEXT</span>
      </div>
      <div className="nowheel" style={{ padding: '14px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {genre && (
          <div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em', marginBottom: 4 }}>GENRE</div>
            <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.gold }}>{genre.genre}</span>
            {genre.subgenre && <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.steel }}> · {genre.subgenre}</span>}
          </div>
        )}
        <div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em', marginBottom: 5 }}>THEMES</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(biblicalThemes ?? []).map((t: string) => (
              <span key={t} style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.khaki, background: `${BASE.khaki}10`, border: `1px solid ${BASE.khaki}25`, borderRadius: 10, padding: '1px 9px' }}>{t}</span>
            ))}
          </div>
        </div>
        {keyWords?.length > 0 && (
          <div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em', marginBottom: 5 }}>KEY WORDS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {keyWords.map((w: string) => (
                <span key={w} style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: BASE.gold, background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`, borderRadius: 8, padding: '2px 8px' }}>{w}</span>
              ))}
            </div>
          </div>
        )}
        {bookTheme && <div><div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em', marginBottom: 3 }}>BOOK THEME</div><p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid, margin: 0 }}>{bookTheme}</p></div>}
        {passageRole && <div><div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em', marginBottom: 3 }}>PASSAGE ROLE</div><p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid, margin: 0 }}>{passageRole}</p></div>}
        {canonicalConnections && <div><div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em', marginBottom: 3 }}>CANONICAL CONNECTIONS</div><p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid, margin: 0 }}>{canonicalConnections}</p></div>}
      </div>
      </div>
      </TiltCard>
    </>
  )
}

// ── Draft Card Node ────────────────────────────────────────────────────────────
function DraftCardNode({ data }: NodeProps) {
  const { initialText, apiKey, analysis, historyId, onTextChange } = data as any
  const { w, h } = useCardDims(CARD_W, CARD_H_BOT)
  const [text, setText] = useState(initialText ?? '')
  const [generating, setGenerating] = useState(false)
  const [stage, setStage] = useState('')
  const [flags, setFlags] = useState<any[]>([])
  const [checking, setChecking] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const histRef = useRef(historyId)
  useEffect(() => { histRef.current = historyId }, [historyId])

  const checkEisegesis = useCallback(async (t: string) => {
    if (!t.trim() || t.trim().length < 80 || !analysis) return
    setChecking(true)
    try {
      const r = await (window as any).electronAPI.flagManuscript({ manuscriptText: t, passageContext: analysis, apiKey })
      setFlags(r?.flags ?? [])
    } catch { /* silent */ }
    setChecking(false)
  }, [apiKey, analysis])

  function handleChange(val: string) {
    setText(val); onTextChange?.(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => checkEisegesis(val), 3000)
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(async () => {
      if (histRef.current) { try { await (window as any).electronAPI.sessionUpdateDraft(histRef.current, val) } catch { /* silent */ } }
    }, 1500)
  }

  async function generate() {
    setGenerating(true); setStage(DRAFT_STAGES[0])
    const timers = DRAFT_STAGES.slice(1).map((s, i) => setTimeout(() => setStage(s), [15000, 35000, 50000, 70000][i]))
    try { handleChange(draftToText(await (window as any).electronAPI.draftSermon({ analysis, apiKey }))) } catch { /* silent */ }
    timers.forEach(clearTimeout); setGenerating(false); setStage('')
  }

  const FLAG_COLORS: Record<string, string> = { EISEGESIS: BASE.red, PROOFTEXTING: '#C49A2E', ANACHRONISM: BASE.khaki, WORD_FALLACY: BASE.moss, DRIFT: BASE.steel }
  const flagged = flags.filter(f => text.includes(f.quotedText))
  const hs = { width: 14, height: 14, borderRadius: 4, background: '#2c3820', border: `1px solid ${BASE.khaki}30` }
  const ls = { border: `1px solid ${BASE.khaki}20` }

  return (
    <>
      <NodeResizer minWidth={380} minHeight={200} handleStyle={hs} lineStyle={ls} />
      <TiltCard>
      <div style={{ width: w, height: h, overflow: 'hidden', borderRadius: 16, background: '#2c3820', border: `2px solid ${BASE.khaki}55`, boxShadow: `0 0 0 1px ${BASE.khaki}18`, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BASE.khaki}20`, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 10, background: `${BASE.khaki}08`, flexShrink: 0 }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.khaki, letterSpacing: '0.14em' }}>SERMON MANUSCRIPT</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {checking && <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, color: BASE.steel }}>checking…</span>}
          {!checking && flagged.length > 0 && <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, color: BASE.red, background: `${BASE.red}12`, border: `1px solid ${BASE.red}30`, borderRadius: 8, padding: '1px 8px' }}>{flagged.length} flag{flagged.length > 1 ? 's' : ''}</span>}
          {!generating && <button className="nodrag" onClick={generate} style={{ fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.1em', color: BASE.gold, background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>{text ? '↺ REGENERATE' : '✦ GENERATE DRAFT'}</button>}
        </div>
      </div>
      {generating && (
        <div className="nodrag" style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.14em', textAlign: 'center' }}>{stage}</div>
          <div style={{ display: 'flex', gap: 6 }}>{[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: BASE.gold, opacity: 0.4, animation: `pulse 1.2s ease-in-out ${i*0.4}s infinite` }} />)}</div>
          <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.steel, textAlign: 'center', lineHeight: 1.5, margin: 0 }}>Three agents are working through the text.<br />This takes about 90 seconds.</p>
        </div>
      )}
      {!generating && (
        <div className="nowheel" style={{ flex: 1, overflow: 'hidden' }}>
          <textarea className="nowheel nodrag" value={text} onChange={e => handleChange(e.target.value)}
            placeholder="Click ✦ GENERATE DRAFT to build a full sermon — or write freely here."
            style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', padding: '16px 18px', color: BASE.bone, fontFamily: 'Crimson Pro, serif', fontSize: 15, lineHeight: 1.75, boxSizing: 'border-box' }}
          />
        </div>
      )}
      {!generating && flagged.length > 0 && (
        <div className="nowheel nodrag" style={{ borderTop: `1px solid ${BASE.red}22`, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
          {flagged.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: FLAG_COLORS[f.type] ?? BASE.red, flexShrink: 0, marginTop: 2, letterSpacing: '0.06em' }}>{f.type}</span>
              <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.boneMid, lineHeight: 1.5 }}>{f.issue}</span>
            </div>
          ))}
        </div>
      )}
      </div>
      </TiltCard>
    </>
  )
}

// ── Cultural Notes Card Node (all notes in one tile) ──────────────────────────
function CulturalNotesCardNode({ data }: NodeProps) {
  const { notes } = data as any
  const { w, h } = useCardDims(CARD_W2, CARD_H_BOT)
  const CAT_COLORS: Record<string, string> = {
    'greco-roman': BASE.khaki, jewish: BASE.gold, 'roman-legal': BASE.steel,
    ane: '#A0AF84', hellenistic: BASE.khaki, 'household-code': BASE.moss,
    'honor-shame': '#C49A2E',
  }
  const hs = { width: 14, height: 14, borderRadius: 4, background: '#2c3820', border: `1px solid ${BASE.khaki}30` }
  const ls = { border: `1px solid ${BASE.khaki}20` }
  return (
    <>
      <NodeResizer minWidth={280} minHeight={200} handleStyle={hs} lineStyle={ls} />
      <TiltCard>
      <div style={{ width: w, height: h, overflow: 'hidden', borderRadius: 16, background: '#2c3820', border: `2px solid ${BASE.khaki}55`, boxShadow: `0 0 0 1px ${BASE.khaki}18`, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ padding: '12px 18px 10px', borderBottom: `1px solid ${BASE.khaki}20`, cursor: 'grab', background: `${BASE.khaki}08`, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.khaki, letterSpacing: '0.14em' }}>CULTURAL CONTEXT</span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: `${BASE.khaki}60`, marginLeft: 'auto' }}>{(notes ?? []).length} notes</span>
      </div>
      <div className="nowheel" style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {(notes ?? []).map((note: any, i: number) => {
          const color = CAT_COLORS[note.category] ?? BASE.steel
          return (
            <div key={i} style={{ padding: '12px 18px', borderBottom: i < notes.length - 1 ? `1px solid ${BASE.borderDim}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color, fontWeight: 600 }}>{note.term}</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6.5, color: `${color}70`, letterSpacing: '0.07em' }}>{note.category.replace(/-/g,' ')}</span>
              </div>
              <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid, lineHeight: 1.65, margin: '0 0 6px' }}>{note.explanation}</p>
              <p style={{ fontFamily: 'JetBrains Mono', fontSize: 7.5, color: `${color}80`, lineHeight: 1.5, margin: 0, letterSpacing: '0.03em' }}>↳ {note.significance}</p>
            </div>
          )
        })}
      </div>
      </div>
      </TiltCard>
    </>
  )
}

// ── Blank Note Card Node ───────────────────────────────────────────────────────
function NoteCardNode({ data }: NodeProps) {
  const [title, setTitle] = useState((data as any).title ?? 'NOTEPAD')
  const [text, setText] = useState((data as any).text ?? '')
  const { w, h } = useCardDims(300, 260)
  const hs = { width: 14, height: 14, borderRadius: 4, background: '#2c3820', border: `1px solid ${BASE.khaki}30` }
  const ls = { border: `1px solid ${BASE.khaki}20` }
  return (
    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', borderRadius: 16, background: '#2c3820', border: `2px solid ${BASE.khaki}55`, boxShadow: `0 0 0 1px ${BASE.khaki}18`, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <NodeResizer minWidth={200} minHeight={150} handleStyle={hs} lineStyle={ls} />
      <div className="nodrag" style={{ padding: '12px 18px 10px', borderBottom: `1px solid ${BASE.khaki}20`, cursor: 'grab', background: `${BASE.khaki}08`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input value={title} onChange={e => setTitle(e.target.value.toUpperCase())}
          onKeyDown={e => e.stopPropagation()}
          style={{ background: 'transparent', border: 'none', outline: 'none', fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.khaki, letterSpacing: '0.14em', width: '100%', cursor: 'text' }} />
        <CloseBtn color={BASE.khaki} />
      </div>
      <textarea className="nodrag nowheel" value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => e.stopPropagation()}
        placeholder="Write freely here..."
        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', padding: '12px 18px', fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.bone, lineHeight: 1.7, boxSizing: 'border-box', cursor: 'text' }} />
    </div>
  )
}

// ── Geographic Map Card Node ───────────────────────────────────────────────────

function MapCardNode({ data }: NodeProps) {
  const { geoReferences = [] } = data as any
  const { w, h } = useCardDims(820, 540)
  const KHAKI = '#c9b97a'
  const hs = { width: 14, height: 14, borderRadius: 4, background: '#2c3820', border: `1px solid ${KHAKI}30` }
  const ls = { border: `1px solid ${KHAKI}20` }
  const headerH = 36

  return (
    <>
      <NodeResizer minWidth={480} minHeight={320} handleStyle={hs} lineStyle={ls} />
      <div style={{ width: w, height: h, display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden', border: `2px solid ${KHAKI}55`, boxShadow: `0 0 0 1px ${KHAKI}18`, boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ height: headerH, padding: '0 16px', borderBottom: `1px solid ${KHAKI}20`, cursor: 'grab', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, background: `#2c3820`, boxSizing: 'border-box' }}>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: KHAKI, letterSpacing: '0.14em' }}>⊕ THEATRE OF OPERATIONS</span>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6, color: `${KHAKI}55`, letterSpacing: '0.1em' }}>
            {geoReferences.length > 0 ? `${geoReferences.length} LOCATIONS MARKED` : 'ANE · ROMAN WORLD'}
          </span>
          <CloseBtn color={KHAKI} />
        </div>
        {/* Map canvas — nodrag + nowheel so d3 zoom owns events */}
        <div className="nodrag nowheel" style={{ flex: 1, overflow: 'hidden' }}>
          <TopoMap geoReferences={geoReferences} width={w - 4} height={h - headerH - 4} />
        </div>
      </div>
    </>
  )
}

const DRAFT_STAGES = [
  'EXEGETICAL AGENT — PARSING THE TEXT…',
  'EXEGETICAL AGENT — SEARCHING SOURCES…',
  'THEOLOGICAL AGENT — TRACING THE CANON…',
  'THEOLOGICAL AGENT — SEARCHING SCHOLARSHIP…',
  'HOMILETICAL AGENT — DRAFTING…',
]

function draftToText(draft: any): string {
  const points = (draft.points ?? []).map((p: any) =>
    `${p.point}\n\n${p.explanation}\n\nAPPLICATION: ${p.application}${p.illustration ? `\n\nILLUSTRATION ANGLE: ${p.illustration}` : ''}`
  ).join('\n\n---\n\n')
  return `TITLE: ${draft.title}\nEMOTIONAL REGISTER: ${draft.emotionalRegister}\n\nBIG IDEA\n${draft.mainIdea}\n\n---\n\nINTRODUCTION\n${draft.introduction}\n\n---\n\n${points}\n\n---\n\nGOSPEL BRIDGE\n${draft.gospelBridge}\n\n---\n\nCONCLUSION\n${draft.conclusion}`
}

// ── Node / edge type registry ──────────────────────────────────────────────────
const nodeTypes = {
  phraseNode: PhraseNode,
  outlineCard: OutlineCardNode,
  themeCard: ThemeCardNode,
  draftCard: DraftCardNode,
  culturalNotesCard: CulturalNotesCardNode,
  noteCard: NoteCardNode,
  mapCard: MapCardNode,
  monarchyCard: MonarchyCardNode,
  kingsList: KingsListNode,
  worshipStructure: WorshipStructureNode,
  lineageViewer: LineageViewerNode,
}
const edgeTypes = { phraseEdge: PhraseEdge }

// ── Build all desk nodes ───────────────────────────────────────────────────────
function buildDesk(
  analysis: PhrasingAnalysis,
  selectedId: string | null,
  annotations: Record<string, string>,
  culturalPhraseIds: Set<string>,
  onWordClick: Props['onWordClick'],
  onAnnotate: Props['onAnnotate'],
  apiKey: string,
  historyId: string | null,
  initialDraft: string | undefined,
  onDraftChange: ((t: string) => void) | undefined,
  phraseMode: 'key' | 'all',
): { nodes: Node[]; edges: Edge[] } {
  // ── Phrase tree ──────────────────────────────────────────────────────────────
  let phraseNodes: Node[]
  let phraseEdges: Edge[]

  if (phraseMode === 'all' && (analysis as any).passageText) {
    // All-verses mode: parse raw passage text line by line
    const lines: string[] = ((analysis as any).passageText as string)
      .split(/\n/)
      .map((l: string) => l.trim())
      // Filter out stanza headers (single words like "Aleph", "Beth", etc.) and very short lines
      .filter((l: string) => l.length > 5 && l.split(/\s+/).length >= 2)

    phraseNodes = lines.map((line, i) => {
      const id = `av-${i}`
      // Strip leading verse numbers like "1 " or "119:1 "
      const clean = line.replace(/^\d+:\d+\s+/, '').replace(/^\d+\s+/, '')
      const syntheticPhrase: Phrase = {
        id, text: clean, type: 'main', level: 0, parentId: null,
        connective: null, connectiveFunction: null, role: 'predicate', theologicalNote: '',
      }
      return {
        id, type: 'phraseNode',
        position: { x: PHRASE_X, y: PHRASE_Y + i * (NODE_H + GAP_Y) },
        data: { ...syntheticPhrase, selectedId, annotation: annotations[id] ?? null, hasCulturalNote: false, onWordClick, onAnnotate } as Record<string, unknown>,
        draggable: false,
      }
    })
    phraseEdges = []
  } else {
    // Key-clauses mode: AI-selected hierarchical phrases
    const childrenOf = new Map<string | null, Phrase[]>()
    for (const p of analysis.phrases) {
      const key = p.parentId ?? null
      if (!childrenOf.has(key)) childrenOf.set(key, [])
      childrenOf.get(key)!.push(p)
    }
    const ordered: Phrase[] = []
    function visit(pid: string | null) { for (const p of childrenOf.get(pid) ?? []) { ordered.push(p); visit(p.id) } }
    visit(null)

    phraseNodes = ordered.map((p, i) => ({
      id: p.id, type: 'phraseNode',
      position: { x: PHRASE_X + p.level * INDENT, y: PHRASE_Y + i * (NODE_H + GAP_Y) },
      data: { ...p, selectedId, annotation: annotations[p.id] ?? null, hasCulturalNote: culturalPhraseIds.has(p.id), onWordClick, onAnnotate } as Record<string, unknown>,
      draggable: false,
    }))

    phraseEdges = analysis.phrases.filter(p => p.parentId).map(p => ({
      id: `e-${p.parentId}-${p.id}`, source: p.parentId!, target: p.id, type: 'phraseEdge',
      data: { color: CLAUSE_COLORS[p.type as ClauseType] ?? BASE.steel, connective: p.connective, dimmed: selectedId !== null && selectedId !== p.id },
    }))
  }

  // ── 2×2 card grid to the right of the phrase tree ───────────────────────────
  const outlineCard: Node = {
    id: 'outline-card', type: 'outlineCard',
    position: { x: CARD_X, y: PHRASE_Y },
    data: { outline: analysis.outline, mainTheme: analysis.mainTheme, reference: analysis.reference },
    draggable: true,
    style: { width: CARD_W, height: CARD_H_TOP, overflow: 'hidden' },
  }
  const themeCard: Node = {
    id: 'theme-card', type: 'themeCard',
    position: { x: CARD_X2, y: PHRASE_Y },
    data: {
      biblicalThemes: analysis.canonicalContext?.biblicalThemes,
      keyWords: analysis.canonicalContext?.keyWords,
      bookTheme: analysis.canonicalContext?.bookTheme,
      passageRole: analysis.canonicalContext?.passageRole,
      canonicalConnections: analysis.canonicalContext?.canonicalConnections,
      genre: analysis.genre,
    },
    draggable: true,
    style: { width: CARD_W2, height: CARD_H_TOP, overflow: 'hidden' },
  }
  const draftCard: Node = {
    id: 'draft-card', type: 'draftCard',
    position: { x: CARD_X, y: DRAFT_Y },
    data: { initialText: initialDraft ?? '', apiKey, analysis, historyId, onTextChange: onDraftChange },
    draggable: true,
    style: { width: CARD_W, height: CARD_H_BOT, overflow: 'hidden' },
  }
  const culturalCard: Node = {
    id: 'cultural-notes-card', type: 'culturalNotesCard',
    position: { x: CARD_X2, y: DRAFT_Y },
    data: { notes: analysis.culturalNotes ?? [], _w: CARD_W2, _h: CARD_H_BOT },
    draggable: true,
    style: { width: CARD_W2, height: CARD_H_BOT, overflow: 'hidden' },
  }

  const MAP_X = CARD_X2 + CARD_W2 + 20
  const mapH = CARD_H_TOP + 20 + CARD_H_BOT
  const mapCard: Node = {
    id: 'map-card', type: 'mapCard',
    position: { x: MAP_X, y: PHRASE_Y },
    data: { geoReferences: (analysis as any).geoReferences ?? [] },
    draggable: true,
    style: { width: 820, height: mapH, overflow: 'hidden' },
  }

  return {
    nodes: [...phraseNodes, outlineCard, themeCard, draftCard, culturalCard, mapCard],
    edges: phraseEdges,
  }
}

// ── Zoom controls + Clean Up ───────────────────────────────────────────────────
function ZoomControls({ onCleanUp }: { onCleanUp: () => void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const btn: React.CSSProperties = {
    width: 30, height: 30, borderRadius: 8, background: `${BASE.bgCard}cc`,
    border: `1px solid ${BASE.borderDim}`, color: BASE.steel, cursor: 'pointer',
    fontFamily: 'JetBrains Mono', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  }
  const hover = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.color = BASE.gold }
  const unhover = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.color = BASE.steel }
  return (
    <div style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button style={btn} onClick={() => zoomIn({ duration: 200 })} onMouseEnter={hover} onMouseLeave={unhover}>+</button>
      <button style={btn} onClick={() => zoomOut({ duration: 200 })} onMouseEnter={hover} onMouseLeave={unhover}>−</button>
      <button style={btn} onClick={() => fitView({ duration: 400, padding: 0.1 })} onMouseEnter={hover} onMouseLeave={unhover} title="Fit all">⊡</button>
      <button style={{ ...btn, fontSize: 10, marginTop: 6, height: 'auto', padding: '5px 0', width: 30 }}
        onClick={onCleanUp} onMouseEnter={hover} onMouseLeave={unhover} title="Clean up — reset card layout">
        ⊞
      </button>
    </div>
  )
}

// ── Legend ─────────────────────────────────────────────────────────────────────
function Legend({ phrases, selectedId, onSelect }: { phrases: Phrase[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const types = [...new Set(phrases.map(p => p.type))]
  return (
    <div style={{ background: `${BASE.bg}cc`, backdropFilter: 'blur(20px)', border: `1px solid ${BASE.borderDim}`, borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.12em', marginBottom: 5 }}>clause types</div>
      {types.map(t => {
        const color = CLAUSE_COLORS[t as ClauseType]
        const active = selectedId && phrases.find(p => p.type === t && p.id === selectedId)
        return (
          <button key={t}
            onClick={() => { const first = phrases.find(p => p.type === t); if (first) onSelect(selectedId === first.id ? null : first.id) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: active ? `${color}18` : 'transparent', border: `1px solid ${active ? `${color}44` : 'transparent'}`, borderRadius: 8, padding: '3px 7px', cursor: 'pointer', transition: 'all 0.2s' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: active ? `0 0 8px ${color}` : 'none' }} />
            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: active ? color : BASE.steel, textTransform: 'capitalize', transition: 'color 0.2s' }}>{t}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Main Desk component ────────────────────────────────────────────────────────
function DeskInner({
  analysis, annotations, onAnnotate, onWordClick,
  culturalPhraseIds, selectedPhraseId, onSelectPhrase,
  apiKey, historyId, initialDraft, onDraftChange,
  phraseMode: phraseModeprop, onPhraseModeChange,
}: Props) {
  const { fitView, getViewport, setCenter } = useReactFlow()
  const [annotatingId, setAnnotatingId] = useState<string | null>(null)
  const [annotationInit, setAnnotationInit] = useState('')
  const [phraseModeLocal, setPhraseModeLocal] = useState<'key' | 'all'>('key')
  const phraseMode = phraseModeprop ?? phraseModeLocal
  const setPhraseMode = (onPhraseModeChange ?? setPhraseModeLocal) as (m: 'key' | 'all') => void
  const [addOpen, setAddOpen] = useState(false)

  function handleAnnotate(phraseId: string, current: string) {
    setAnnotationInit(current)
    setAnnotatingId(phraseId)
  }

  const initialDesk = useMemo(
    () => buildDesk(analysis, selectedPhraseId, annotations, culturalPhraseIds, onWordClick, handleAnnotate, apiKey, historyId, initialDraft, onDraftChange, phraseMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(initialDesk.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialDesk.edges)

  // Track the analysis identity so we know when a truly new passage is loaded
  const analysisRefRef = useRef<string | null>(null)

  // Rebuild desk when analysis or mode changes, preserving dragged positions for cards
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildDesk(
      analysis, selectedPhraseId, annotations, culturalPhraseIds, onWordClick, handleAnnotate, apiKey, historyId, initialDraft, onDraftChange, phraseMode
    )
    const isNewPassage = analysisRefRef.current !== analysis.reference
    analysisRefRef.current = analysis.reference

    setNodes(prev => newNodes.map(n => {
      const existing = prev.find(p => p.id === n.id)
      // Keep user-dragged position for card nodes unless it's a brand-new passage
      if (existing && n.draggable && !isNewPassage) return { ...n, position: existing.position }
      return n
    }))
    setEdges(newEdges)

    // Auto-fit when switching to a new passage
    if (isNewPassage) {
      setTimeout(() => fitView({ duration: 500, padding: 0.08, maxZoom: 0.85 }), 80)
    }
  }, [analysis, selectedPhraseId, annotations, culturalPhraseIds, phraseMode])

  // One-time fit on initial mount — show all tiles
  const didInitialFit = useRef(false)
  useEffect(() => {
    if (!didInitialFit.current) {
      didInitialFit.current = true
      setTimeout(() => fitView({ duration: 400, padding: 0.08, maxZoom: 0.85 }), 150)
    }
  }, [])

  function addTile(type: 'noteCard' | 'mapCard' | 'monarchyCard' | 'kingsList' | 'worshipStructure' | 'lineageViewer') {
    const id = `${type}-${Date.now()}`
    const config = {
      noteCard:     { w: 300,  h: 260, data: {} },
      mapCard:      { w: 820,  h: 540, data: { geoReferences: (analysis as any).geoReferences ?? [] } },
      monarchyCard: { w: 1100, h: 580, data: { reference: analysis.reference } },
      kingsList:        { w: 520,  h: 560, data: {} },
      worshipStructure: { w: 560,  h: 560, data: {} },
      lineageViewer:    { w: 500,  h: 580, data: {} },
    }[type]
    // Place tiles at known canvas positions relative to the fixed layout
    const BELOW_Y = DRAFT_Y + CARD_H_BOT + 60   // below the bottom row of cards
    const RIGHT_X = CARD_X2 + CARD_W2 + 60      // to the right of col-2
    const notePositions: Record<string, { x: number; y: number }> = {
      noteCard:     { x: CARD_X,  y: BELOW_Y },
      mapCard:      { x: RIGHT_X, y: PHRASE_Y },
      monarchyCard: { x: RIGHT_X, y: PHRASE_Y },
      kingsList:        { x: RIGHT_X, y: PHRASE_Y },
      worshipStructure: { x: RIGHT_X, y: PHRASE_Y },
      lineageViewer:    { x: RIGHT_X, y: PHRASE_Y },
    }
    const pos = notePositions[type]
    setNodes(ns => [...ns, {
      id, type,
      position: pos,
      data: config.data,
      draggable: true,
      width: config.w,
      height: config.h,
      style: { width: config.w, height: config.h },
    }])
    // For small tiles zoom in so the card is actually readable; for large tiles fit all
    const targetZoom = type === 'noteCard' ? 0.9 : 0.6
    const cx = pos.x + config.w / 2
    const cy = pos.y + config.h / 2
    setTimeout(() => setCenter(cx, cy, { zoom: targetZoom, duration: 450 }), 500)
    setAddOpen(false)
  }

  // Reset all cards to their default organized positions
  function handleCleanUp() {
    const { nodes: defaultNodes, edges: defaultEdges } = buildDesk(
      analysis, selectedPhraseId, annotations, culturalPhraseIds, onWordClick, handleAnnotate, apiKey, historyId, initialDraft, onDraftChange, phraseMode
    )
    setNodes(defaultNodes)
    setEdges(defaultEdges)
    setTimeout(() => fitView({ duration: 500, padding: 0.08, maxZoom: 0.85 }), 80)
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <style>{`
        @keyframes phrase-flow { from { stroke-dashoffset: 34 } to { stroke-dashoffset: 0 } }
        .react-flow__node { cursor: default !important; }
        .react-flow__node[data-type="outlineCard"],
        .react-flow__node[data-type="themeCard"],
        .react-flow__node[data-type="draftCard"],
        .react-flow__node[data-type="culturalNotesCard"],
        .react-flow__node[data-type="noteCard"],
        .react-flow__node[data-type="mapCard"],
        .react-flow__node[data-type="monarchyCard"] { cursor: grab !important; }
        .react-flow__node[data-type="outlineCard"]:active,
        .react-flow__node[data-type="themeCard"]:active,
        .react-flow__node[data-type="draftCard"]:active,
        .react-flow__node[data-type="culturalNotesCard"]:active,
        .react-flow__node[data-type="noteCard"]:active,
        .react-flow__node[data-type="mapCard"]:active,
        .react-flow__node[data-type="monarchyCard"]:active { cursor: grabbing !important; }
        .react-flow__pane { cursor: grab !important; }
        .react-flow__pane:active { cursor: grabbing !important; }
      `}</style>

      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodeClick={(_, node) => {
          if (node.type === 'phraseNode') onSelectPhrase(selectedPhraseId === node.id ? null : node.id)
        }}
        onPaneClick={() => onSelectPhrase(null)}
        minZoom={0.05} maxZoom={3}
        nodesDraggable={true}
        nodesConnectable={false}
        snapToGrid={true}
        snapGrid={[20, 20]}
        panOnScroll={true}
        panOnScrollMode={'free' as any}
        zoomOnPinch={true}
        zoomOnScroll={false}
        style={{ background: 'transparent' }}
        proOptions={{ hideAttribution: true }}
        nodeDragThreshold={4}
        nodesFocusable={false}
      >
        <Background color={`${BASE.gold}08`} gap={20} size={1} />
        <ZoomControls onCleanUp={handleCleanUp} />
        <Panel position="bottom-left">
          <div style={{ position: 'relative' }}>
            {addOpen && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, background: `${BASE.bgCard}f4`, backdropFilter: 'blur(24px)', border: `1px solid ${BASE.borderDim}`, borderRadius: 10, overflow: 'hidden', minWidth: 160 }}>
                {([
                  { type: 'noteCard' as const,     label: '✦ BLANK NOTE',  color: BASE.khaki },
                  { type: 'mapCard' as const,      label: '⊕ GEO MAP',     color: BASE.khaki },
                  { type: 'monarchyCard' as const, label: '♚ MONARCHY',    color: BASE.gold  },
                  { type: 'kingsList' as const,        label: '♛ KINGS LIST',   color: BASE.gold  },
                  { type: 'worshipStructure' as const, label: '✦ WORSHIP PLAN',   color: BASE.gold  },
                  { type: 'lineageViewer'    as const, label: '⊳ LINEAGE VIEWER', color: BASE.gold  },
                ] as const).map(({ type, label, color }) => (
                  <button key={type} onClick={() => addTile(type)}
                    style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'transparent', border: 'none', borderBottom: type === 'noteCard' ? `1px solid ${BASE.borderDim}` : 'none', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 7.5, color, letterSpacing: '0.1em', textAlign: 'left', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${BASE.gold}0a`)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >{label}</button>
                ))}
              </div>
            )}
            <button onClick={() => setAddOpen(o => !o)}
              style={{ fontFamily: 'JetBrains Mono', fontSize: 7.5, color: addOpen ? BASE.gold : BASE.steel, letterSpacing: '0.12em', background: `${BASE.bgCard}cc`, border: `1px solid ${addOpen ? BASE.borderGold : BASE.borderDim}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', transition: 'all 0.15s' }}>
              {addOpen ? '✕ CLOSE' : '+ ADD TILE'}
            </button>
          </div>
        </Panel>
        {phraseMode === 'key' && (
          <Panel position="top-left">
            <Legend phrases={analysis.phrases} selectedId={selectedPhraseId} onSelect={onSelectPhrase} />
          </Panel>
        )}
      </ReactFlow>

      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', fontFamily: 'JetBrains Mono', fontSize: 7.5, color: 'rgba(120,120,160,0.25)', letterSpacing: '0.18em', pointerEvents: 'none', zIndex: 2, whiteSpace: 'nowrap' }}>
        pinch to zoom · two-finger swipe to pan · drag cards to rearrange · click word to study · right-click phrase to annotate
      </div>

      <AnimatePresence>
        {annotatingId && (
          <AnnotationModal key={annotatingId} phraseId={annotatingId} initial={annotationInit}
            onSave={onAnnotate} onClose={() => setAnnotatingId(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

export function Desk(props: Props) {
  return (
    <ReactFlowProvider>
      <DeskInner {...props} />
    </ReactFlowProvider>
  )
}
