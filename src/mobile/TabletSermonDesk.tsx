import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Background,
  MiniMap,
  NodeResizer,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { PhrasingAnalysis } from '../types/phrasing'
import { TabletAgentPanel, TABLET_AGENT_META } from './TabletAgentPanel'
import { copyToClipboard, readFromClipboard } from './clipboard'
import { TabletCommentaryTile } from './TabletCommentaryTile'
import { TabletManuscriptEditor } from './TabletManuscriptEditor'
import { TabletPreachMode } from './TabletPreachMode'
import { TabletRecorder, type SermonRecorderController } from './TabletRecorder'
import { TabletReferenceTile } from './TabletReferenceTiles'
import {
  createTabletDeskNote,
  MAX_TABLET_DESK_NODES,
  normalizeTabletInkStrokes,
  type TabletAgentRole,
  type TabletAgentThreads,
  type TabletDeskNode,
  type TabletDeskTileData,
  type TabletInkPoint,
  type TabletInkStroke,
  type TabletSermonWorkspace,
} from './tabletDeskModel'

type TabletFlowData = TabletDeskTileData & Record<string, unknown>
type TabletFlowNode = Node<TabletFlowData, TabletDeskNode['type']>

interface TabletDeskActions {
  locked: boolean
  analysis: PhrasingAnalysis
  reference: string
  studyId: string
  updateContent: (id: string, content: string) => void
  updateStrokes: (id: string, strokes: TabletInkStroke[]) => void
  closeNode: (id: string) => void
  openManuscript: () => void
}

const TabletDeskContext = createContext<TabletDeskActions | null>(null)

function useTabletDeskActions() {
  const value = useContext(TabletDeskContext)
  if (!value) throw new Error('Tablet desk actions are unavailable.')
  return value
}

function flowNode(node: TabletDeskNode): TabletFlowNode {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    width: node.width,
    height: node.height,
    dragHandle: '.tablet-tile-drag-handle',
    deletable: false,
    hidden: Boolean(node.hidden),
    style: { width: node.width, height: node.height },
    data: node.data as TabletFlowData,
  }
}

function dimension(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function serializedNode(node: TabletFlowNode): TabletDeskNode {
  const fallbackWidth = node.type === 'inkTile' ? 500 : 480
  const fallbackHeight = node.type === 'inkTile' ? 430 : 360
  return {
    id: node.id,
    type: node.type || 'textTile',
    position: node.position,
    width: dimension(node.width ?? node.measured?.width ?? node.style?.width, fallbackWidth),
    height: dimension(node.height ?? node.measured?.height ?? node.style?.height, fallbackHeight),
    hidden: Boolean(node.hidden),
    data: {
      kind: node.data.kind,
      eyebrow: node.data.eyebrow,
      title: node.data.title,
      content: node.data.content,
      editable: node.data.editable,
      sourceRefs: node.data.sourceRefs,
      accent: node.data.accent,
      ...(node.type === 'inkTile' ? { strokes: node.data.strokes || [] } : {}),
    },
  }
}

function TextTileNode({ id, data, selected }: NodeProps<TabletFlowNode>) {
  const actions = useTabletDeskActions()
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const [clipboardState, setClipboardState] = useState<string | null>(null)

  const paste = async () => {
    try {
      const value = await readFromClipboard()
      const editor = editorRef.current
      if (!editor) return
      const start = editor.selectionStart
      const end = editor.selectionEnd
      actions.updateContent(id, `${data.content.slice(0, start)}${value}${data.content.slice(end)}`)
      setClipboardState('PASTED')
    } catch {
      setClipboardState('USE SYSTEM PASTE')
    }
  }

  return (
    <article className={`tablet-desk-tile tablet-text-tile accent-${data.accent} ${selected ? 'selected' : ''}`}>
      <NodeResizer
        isVisible={selected && !actions.locked}
        minWidth={280}
        minHeight={210}
        maxWidth={1_400}
        maxHeight={1_200}
        lineClassName="tablet-node-resizer-line"
        handleClassName="tablet-node-resizer-handle"
      />
      <header className="tablet-tile-drag-handle">
        <div><span>{data.eyebrow}</span><strong>{data.title}</strong></div>
        <div className="tablet-tile-actions nodrag">
          <button onClick={() => {
            void copyToClipboard(data.content).then(() => setClipboardState('COPIED')).catch(() => setClipboardState('LONG-PRESS TO COPY'))
          }}>{clipboardState || 'COPY'}</button>
          {data.editable && <button onClick={() => { void paste() }}>PASTE</button>}
          {!actions.locked && <button className="tablet-tile-close" aria-label={`Close ${data.title}`} onClick={() => actions.closeNode(id)}>×</button>}
        </div>
      </header>
      {data.editable
        ? <textarea
          ref={editorRef}
          className="nodrag nowheel tablet-tile-editor"
          value={data.content}
          onChange={(event) => actions.updateContent(id, event.target.value)}
          spellCheck
          placeholder={data.kind === 'illustration' ? '[ILLUSTRATION NEEDED — VERIFY BEFORE USE]' : 'Write here…'}
        />
        : <div className="nodrag nowheel tablet-tile-copy">{data.content}</div>}
      {data.sourceRefs.length > 0 && <details className="nodrag tablet-tile-evidence">
        <summary>{data.editable ? 'SOURCE STARTING POINTS · RECHECK AFTER EDITING' : 'TEXTUAL GROUNDING'} · {data.sourceRefs.length}</summary>
        {data.sourceRefs.map((source, index) => <p key={`${source}-${index}`}>{source}</p>)}
      </details>}
    </article>
  )
}

function ManuscriptTileNode({ id, data, selected }: NodeProps<TabletFlowNode>) {
  const actions = useTabletDeskActions()
  const words = data.content.trim() ? data.content.trim().split(/\s+/).length : 0
  return (
    <article className={`tablet-desk-tile tablet-manuscript-tile accent-${data.accent} ${selected ? 'selected' : ''}`}>
      <NodeResizer
        isVisible={selected && !actions.locked}
        minWidth={480}
        minHeight={360}
        maxWidth={1_400}
        maxHeight={1_200}
        lineClassName="tablet-node-resizer-line"
        handleClassName="tablet-node-resizer-handle"
      />
      <header className="tablet-tile-drag-handle">
        <div><span>{data.eyebrow}</span><strong>{data.title}</strong></div>
        <div className="tablet-tile-actions nodrag">
          <button onClick={() => { void copyToClipboard(data.content) }}>COPY ALL</button>
          <button className="tablet-manuscript-open" onClick={actions.openManuscript}>OPEN EDITOR</button>
          {!actions.locked && <button className="tablet-tile-close" aria-label="Close manuscript tile" onClick={() => actions.closeNode(id)}>×</button>}
        </div>
      </header>
      <button className="nodrag nowheel tablet-manuscript-preview" onClick={actions.openManuscript}>
        <span>FULL-SCREEN WORD PROCESSOR</span>
        <p>{data.content || 'Open the editor and begin writing.'}</p>
      </button>
      <footer><span>{words.toLocaleString()} WORDS</span><strong>TAP TO WRITE · COPY · PASTE · SAVE · EXPORT</strong></footer>
    </article>
  )
}

function ReferenceTileNode({ id, data, selected, width, height }: NodeProps<TabletFlowNode>) {
  const actions = useTabletDeskActions()
  const tileWidth = dimension(width, data.kind === 'timeline' ? 1_200 : 700)
  const tileHeight = dimension(height, 620)
  return (
    <article className={`tablet-desk-tile tablet-reference-tile accent-${data.accent} ${selected ? 'selected' : ''}`}>
      <NodeResizer
        isVisible={selected && !actions.locked}
        minWidth={420}
        minHeight={380}
        maxWidth={1_400}
        maxHeight={1_200}
        lineClassName="tablet-node-resizer-line"
        handleClassName="tablet-node-resizer-handle"
      />
      <header className="tablet-tile-drag-handle">
        <div><span>{data.eyebrow}</span><strong>{data.title}</strong></div>
        {!actions.locked && <button className="tablet-tile-close nodrag" aria-label={`Close ${data.title}`} onClick={() => actions.closeNode(id)}>×</button>}
      </header>
      <TabletReferenceTile
        kind={data.kind as 'map' | 'lineage' | 'timeline' | 'temple'}
        reference={actions.reference}
        analysis={actions.analysis}
        width={tileWidth}
        height={Math.max(260, tileHeight - 58)}
      />
    </article>
  )
}

function CommentaryTileNode({ id, data, selected }: NodeProps<TabletFlowNode>) {
  const actions = useTabletDeskActions()
  return (
    <article className={`tablet-desk-tile tablet-reference-tile accent-${data.accent} ${selected ? 'selected' : ''}`}>
      <NodeResizer
        isVisible={selected && !actions.locked}
        minWidth={420}
        minHeight={380}
        maxWidth={1_100}
        maxHeight={1_200}
        lineClassName="tablet-node-resizer-line"
        handleClassName="tablet-node-resizer-handle"
      />
      <header className="tablet-tile-drag-handle">
        <div><span>{data.eyebrow}</span><strong>{data.title}</strong></div>
        {!actions.locked && <button className="tablet-tile-close nodrag" aria-label="Close commentaries" onClick={() => actions.closeNode(id)}>×</button>}
      </header>
      <TabletCommentaryTile studyId={actions.studyId} reference={actions.reference} />
    </article>
  )
}

function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): TabletInkPoint {
  const bounds = canvas.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    pressure: event.pressure > 0 ? event.pressure : .5,
  }
}

function drawStroke(context: CanvasRenderingContext2D, stroke: TabletInkStroke, width: number, height: number) {
  if (!stroke.points.length) return
  context.beginPath()
  context.strokeStyle = stroke.color
  context.lineWidth = stroke.width
  context.lineCap = 'round'
  context.lineJoin = 'round'
  const first = stroke.points[0]
  context.moveTo(first.x * width, first.y * height)
  for (const point of stroke.points.slice(1)) context.lineTo(point.x * width, point.y * height)
  if (stroke.points.length === 1) context.lineTo(first.x * width + .1, first.y * height + .1)
  context.stroke()
}

function InkTileNode({ id, data, selected }: NodeProps<TabletFlowNode>) {
  const actions = useTabletDeskActions()
  const { getViewport, setViewport } = useReactFlow()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const activeStrokeRef = useRef<TabletInkStroke | null>(null)
  const touchPanRef = useRef<{ pointerId: number; x: number; y: number; viewport: Viewport } | null>(null)
  const [inkWarning, setInkWarning] = useState<string | null>(null)
  const strokes = data.strokes || []

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    const pixelWidth = Math.max(1, Math.round(bounds.width * ratio))
    const pixelHeight = Math.max(1, Math.round(bounds.height * ratio))
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, bounds.width, bounds.height)
    for (const stroke of [...strokes, ...(activeStrokeRef.current ? [activeStrokeRef.current] : [])]) {
      drawStroke(context, stroke, bounds.width, bounds.height)
    }
  }, [strokes])

  useEffect(() => {
    redraw()
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [redraw])

  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch') {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      touchPanRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewport: getViewport() }
      return
    }
    if (actions.locked || !['pen', 'mouse'].includes(event.pointerType)) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    activeStrokeRef.current = {
      color: '#f2d05f',
      width: 2.5 + (event.pressure || .5) * 4,
      points: [pointFromEvent(event, event.currentTarget)],
    }
    redraw()
  }

  const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const touchPan = touchPanRef.current
    if (touchPan?.pointerId === event.pointerId) {
      event.preventDefault()
      event.stopPropagation()
      void setViewport({
        ...touchPan.viewport,
        x: touchPan.viewport.x + event.clientX - touchPan.x,
        y: touchPan.viewport.y + event.clientY - touchPan.y,
      }, { duration: 0 })
      return
    }
    if (!activeStrokeRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    const nextPoint = pointFromEvent(event, event.currentTarget)
    const lastPoint = activeStrokeRef.current.points[activeStrokeRef.current.points.length - 1]
    if (lastPoint && Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y) < .0015) return
    activeStrokeRef.current.points.push(nextPoint)
    redraw()
  }

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (touchPanRef.current?.pointerId === event.pointerId) {
      event.preventDefault()
      event.stopPropagation()
      touchPanRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      return
    }
    const active = activeStrokeRef.current
    if (!active) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    activeStrokeRef.current = null
    const nextStrokes = [...strokes, active]
    const pointCount = nextStrokes.reduce((total, stroke) => total + stroke.points.length, 0)
    if (nextStrokes.length > 160 || pointCount > 3_500) {
      setInkWarning('THIS PAGE IS FULL · ADD ANOTHER PENCIL TILE · NOTHING WAS DELETED')
      redraw()
      return
    }
    setInkWarning(null)
    actions.updateStrokes(id, normalizeTabletInkStrokes(nextStrokes))
  }

  return (
    <article className={`tablet-desk-tile tablet-ink-tile accent-${data.accent} ${selected ? 'selected' : ''}`}>
      <NodeResizer
        isVisible={selected && !actions.locked}
        minWidth={320}
        minHeight={260}
        maxWidth={1_400}
        maxHeight={1_200}
        lineClassName="tablet-node-resizer-line"
        handleClassName="tablet-node-resizer-handle"
      />
      <header className="tablet-tile-drag-handle">
        <div><span>{data.eyebrow}</span><strong>{data.title}</strong></div>
        {!actions.locked && <div className="tablet-ink-actions nodrag">
          <button onClick={() => actions.updateStrokes(id, [])}>CLEAR</button>
          <button className="tablet-tile-close" aria-label="Close Pencil tile" onClick={() => actions.closeNode(id)}>×</button>
        </div>}
      </header>
      <div className="tablet-ink-surface">
        <canvas
          ref={canvasRef}
          className="nodrag"
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
        {!strokes.length && <span>STYLUS WRITES · FINGER PANS THE DESK</span>}
        {inkWarning && <strong className="tablet-ink-capacity">{inkWarning}</strong>}
      </div>
    </article>
  )
}

const NODE_TYPES: NodeTypes = {
  textTile: TextTileNode,
  inkTile: InkTileNode,
  manuscriptTile: ManuscriptTileNode,
  referenceTile: ReferenceTileNode,
  commentaryTile: CommentaryTileNode,
}

function TabletSermonDeskInner({
  studyId,
  analysis,
  workspaceKey,
  workspace,
  recorder,
  syncAvailable,
  syncState,
  syncRevision,
  onWorkspaceChange,
  conflictActions,
}: {
  studyId: string
  analysis: PhrasingAnalysis
  workspaceKey: string
  workspace: TabletSermonWorkspace
  recorder: SermonRecorderController
  syncAvailable: boolean
  syncState: 'saved' | 'saving' | 'local-only' | 'conflict' | 'error'
  syncRevision: number
  onWorkspaceChange: (workspace: TabletSermonWorkspace) => Promise<void>
  conflictActions?: {
    busy: boolean
    onKeepLocal: () => void
    onUseCloud: () => void
  }
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TabletFlowNode>(workspace.nodes.map(flowNode))
  const [locked, setLocked] = useState(workspace.locked)
  const [agentThreads, setAgentThreads] = useState<TabletAgentThreads>(workspace.agentThreads)
  const [viewport, setViewport] = useState<Viewport>(workspace.viewport || { x: 0, y: 0, zoom: .65 })
  const [preachOpen, setPreachOpen] = useState(false)
  const [manuscriptOpen, setManuscriptOpen] = useState(false)
  const [agentOpen, setAgentOpen] = useState<TabletAgentRole | null>(null)
  const [tilesOpen, setTilesOpen] = useState(false)
  const [recordingsOpen, setRecordingsOpen] = useState(false)
  const [deskNotice, setDeskNotice] = useState<string | null>(null)
  const flowRef = useRef<ReactFlowInstance<TabletFlowNode> | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const mountedKeyRef = useRef(workspaceKey)
  const latestWorkspaceRef = useRef(workspace)
  const persistWorkspaceRef = useRef(onWorkspaceChange)
  persistWorkspaceRef.current = onWorkspaceChange

  useEffect(() => {
    if (mountedKeyRef.current === workspaceKey) return
    mountedKeyRef.current = workspaceKey
    setNodes(workspace.nodes.map(flowNode))
    setLocked(workspace.locked)
    setAgentThreads(workspace.agentThreads)
    const nextViewport = workspace.viewport || { x: 0, y: 0, zoom: .65 }
    setViewport(nextViewport)
    window.setTimeout(() => {
      if (workspace.viewport) void flowRef.current?.setViewport(nextViewport, { duration: 0 })
      else void flowRef.current?.fitView({ padding: .08, maxZoom: .78, duration: 350 })
    }, 80)
  }, [setNodes, workspace, workspaceKey])

  const buildWorkspace = useCallback((): TabletSermonWorkspace => ({
      version: 1,
      reference: workspace.reference,
      nodes: nodes.map(serializedNode),
      viewport,
      locked,
      agentThreads,
      updatedAt: new Date().toISOString(),
    }), [agentThreads, locked, nodes, viewport, workspace.reference])

  useEffect(() => {
    latestWorkspaceRef.current = buildWorkspace()
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      void persistWorkspaceRef.current(latestWorkspaceRef.current)
    }, 320)
  }, [buildWorkspace])

  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      void persistWorkspaceRef.current(latestWorkspaceRef.current)
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  const updateContent = useCallback((id: string, content: string) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, content: content.slice(0, 60_000) } } : node))
  }, [setNodes])

  const updateStrokes = useCallback((id: string, strokes: TabletInkStroke[]) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, strokes } } : node))
  }, [setNodes])

  const closeNode = useCallback((id: string) => {
    setDeskNotice(null)
    setNodes((current) => {
      const target = current.find((node) => node.id === id)
      const removable = target && ['note', 'illustration'].includes(target.data.kind)
        || target?.data.kind === 'ink' && id !== 'ink-1'
      return removable
        ? current.filter((node) => node.id !== id)
        : current.map((node) => node.id === id ? { ...node, hidden: true } : node)
    })
  }, [setNodes])

  const restoreNode = useCallback((id: string) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, hidden: false } : node))
  }, [setNodes])

  const saveNow = useCallback(async () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    const current = buildWorkspace()
    latestWorkspaceRef.current = current
    await persistWorkspaceRef.current(current)
  }, [buildWorkspace])

  const actions = useMemo(() => ({
    locked,
    analysis,
    reference: workspace.reference,
    studyId,
    updateContent,
    updateStrokes,
    closeNode,
    openManuscript: () => setManuscriptOpen(true),
  }), [analysis, closeNode, locked, studyId, updateContent, updateStrokes, workspace.reference])

  const addNode = (kind: 'note' | 'illustration' | 'ink') => {
    if (nodes.length >= MAX_TABLET_DESK_NODES) {
      setDeskNotice(`DESK FULL · CLOSE A CUSTOM TILE BEFORE ADDING ANOTHER · NOTHING WAS DELETED`)
      return
    }
    setDeskNotice(null)
    const created = flowNode(createTabletDeskNote(kind, nodes.length))
    const center = flowRef.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    if (center) created.position = { x: center.x - dimension(created.width, 460) / 2, y: center.y - dimension(created.height, 320) / 2 }
    setNodes((current) => [...current, created])
  }

  const fitDesk = () => {
    void flowRef.current?.fitView({ padding: .08, maxZoom: .82, duration: 350 })
  }

  const manuscript = nodes.find((node) => node.data.kind === 'manuscript')?.data.content || ''
  const manuscriptBody = manuscript.includes('\nMANUSCRIPT\n') ? manuscript.split('\nMANUSCRIPT\n').pop()?.trim() || '' : manuscript.trim()
  const preachReady = manuscriptBody.length >= 40
  const syncCopy = syncState === 'saving' ? 'SAVING…'
    : syncState === 'saved' ? `SYNCED TO DEVICES · R${syncRevision}`
    : syncState === 'local-only' ? syncAvailable ? 'SAVED ON THIS TABLET · SYNC PENDING' : 'SAVED ON THIS TABLET'
    : syncState === 'conflict' ? 'SAVED ON THIS TABLET · SYNC CONFLICT'
    : 'SAVE FAILED'
  const hiddenNodes = nodes.filter((node) => node.hidden)

  const pushAgentAnswer = (content: string, agent: TabletAgentRole) => {
    const label = TABLET_AGENT_META[agent].label
    setNodes((current) => current.map((node) => node.data.kind === 'manuscript'
      ? { ...node, hidden: false, data: { ...node.data, content: `${node.data.content.trimEnd()}\n\n[${label} NOTES]\n${content}\n` } }
      : node))
    setManuscriptOpen(true)
  }

  return (
    <TabletDeskContext.Provider value={actions}>
      <div className="tablet-sermon-desk">
        <div className="tablet-desk-commandbar">
          <div className={`tablet-desk-identity sync-${syncState}`}><span>SERMON SIDE</span><strong>INFINITE DESK</strong><small>{syncCopy}</small></div>
          <div className="tablet-agent-dock" aria-label="Specialist agents">
            {(Object.entries(TABLET_AGENT_META) as [TabletAgentRole, typeof TABLET_AGENT_META[TabletAgentRole]][]).map(([role, meta]) => <button
              key={role}
              className={agentOpen === role ? 'active' : ''}
              onClick={() => setAgentOpen(role)}
            ><b>{meta.icon}</b><span>{meta.label}</span></button>)}
          </div>
          <div className="tablet-desk-tools">
            <button onClick={() => addNode('note')} disabled={locked}>+ NOTE</button>
            <button onClick={() => addNode('illustration')} disabled={locked}>+ ILLUSTRATION</button>
            <button onClick={() => addNode('ink')} disabled={locked}>✎ PENCIL</button>
            <button className={tilesOpen ? 'active' : ''} onClick={() => setTilesOpen((open) => !open)}>+ TILES {hiddenNodes.length ? `· ${hiddenNodes.length}` : ''}</button>
            <button onClick={fitDesk}>FIT</button>
            <button className={locked ? 'active' : ''} onClick={() => setLocked((value) => !value)}>{locked ? '🔒 LOCKED' : 'LOCK DESK'}</button>
          </div>
          <div className="tablet-desk-actions">
            <button className={`tablet-record-button ${recorder.status === 'recording' ? 'active' : ''}`} onClick={() => setRecordingsOpen((open) => !open)}>
              {recorder.status === 'recording' ? '● RECORDING' : '● RECORD'}
            </button>
            <button className="tablet-manuscript-button" onClick={() => setManuscriptOpen(true)}>{preachReady ? 'EDIT MANUSCRIPT' : 'WRITE MANUSCRIPT'}</button>
            <button className="tablet-preach-button" onClick={() => setPreachOpen(true)} disabled={!preachReady}>PREACH →</button>
          </div>
        </div>

        {syncState === 'conflict' && conflictActions && <aside className="tablet-sync-conflict" role="alert">
          <div><span>SYNC CONFLICT</span><strong>Choose which sermon desk to keep.</strong><p>This tablet copy is safe. Use Cloud replaces it with the newest synced desk; Keep This Tablet deliberately replaces the cloud copy.</p></div>
          <button onClick={conflictActions.onUseCloud} disabled={conflictActions.busy}>USE CLOUD</button>
          <button className="primary" onClick={conflictActions.onKeepLocal} disabled={conflictActions.busy}>{conflictActions.busy ? 'RESOLVING…' : 'KEEP THIS TABLET'}</button>
        </aside>}

        {deskNotice && <div className="tablet-desk-notice" role="alert"><span>{deskNotice}</span><button aria-label="Dismiss desk notice" onClick={() => setDeskNotice(null)}>×</button></div>}

        {tilesOpen && <div className="tablet-tile-library">
          <header><div><span>DESK TILES</span><strong>{hiddenNodes.length ? 'ADD A TILE TO THE DESK' : 'EVERY TILE IS ON THE DESK'}</strong></div><button onClick={() => setTilesOpen(false)}>×</button></header>
          {hiddenNodes.map((node) => <button key={node.id} onClick={() => { restoreNode(node.id); setTilesOpen(false) }}><span>+</span><div><strong>{node.data.title}</strong><small>{node.data.eyebrow}</small></div></button>)}
        </div>}

        {recordingsOpen && <div className="tablet-recorder-drawer"><TabletRecorder controller={recorder} /></div>}

        <ReactFlow<TabletFlowNode>
          nodes={nodes}
          onNodesChange={onNodesChange}
          nodeTypes={NODE_TYPES}
          onInit={(instance) => {
            flowRef.current = instance
            window.setTimeout(() => {
              if (workspace.viewport) void instance.setViewport(workspace.viewport, { duration: 0 })
              else void instance.fitView({ padding: .08, maxZoom: .78, duration: 350 })
            }, 70)
          }}
          onMoveEnd={(_, nextViewport) => setViewport(nextViewport)}
          defaultViewport={viewport}
          minZoom={.12}
          maxZoom={2.2}
          nodesDraggable={!locked}
          nodesConnectable={false}
          deleteKeyCode={null}
          elementsSelectable
          panOnDrag
          panOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(229,190,73,.12)" gap={28} size={1} />
          <div className="tablet-desk-overview">
            <header><span>FIELD MAP</span><small>DRAG TO NAVIGATE</small></header>
            <MiniMap
              className="tablet-desk-minimap"
              nodeColor={(node) => node.data?.accent === 'red' ? '#a63a2b' : node.data?.accent === 'blue' ? '#6f98ad' : node.data?.accent === 'khaki' ? '#9ba477' : '#e5be49'}
              nodeStrokeColor="#10120f"
              nodeStrokeWidth={3}
              maskColor="rgba(6,8,5,.72)"
              pannable
              zoomable
            />
            <i className="tablet-overview-crosshair" />
          </div>
        </ReactFlow>

        <div className="tablet-desk-hint">PINCH TO ZOOM · FINGER TO PAN · DRAG HEADERS TO MOVE · TAP A TILE TO RESIZE</div>
        {agentOpen && <TabletAgentPanel
          studyId={studyId}
          agent={agentOpen}
          threads={agentThreads}
          onThreadsChange={setAgentThreads}
          onPushToManuscript={pushAgentAnswer}
          onClose={() => setAgentOpen(null)}
        />}
        {manuscriptOpen && <TabletManuscriptEditor
          reference={workspace.reference}
          content={manuscript}
          syncState={syncState}
          syncRevision={syncRevision}
          onChange={(content) => updateContent('manuscript', content)}
          onSave={saveNow}
          onClose={() => setManuscriptOpen(false)}
        />}
        {preachOpen && <TabletPreachMode reference={workspace.reference} manuscript={manuscriptBody} recorder={recorder} onClose={() => setPreachOpen(false)} />}
      </div>
    </TabletDeskContext.Provider>
  )
}

export function TabletSermonDesk(props: {
  studyId: string
  analysis: PhrasingAnalysis
  workspaceKey: string
  workspace: TabletSermonWorkspace
  recorder: SermonRecorderController
  syncAvailable: boolean
  syncState: 'saved' | 'saving' | 'local-only' | 'conflict' | 'error'
  syncRevision: number
  onWorkspaceChange: (workspace: TabletSermonWorkspace) => Promise<void>
  conflictActions?: {
    busy: boolean
    onKeepLocal: () => void
    onUseCloud: () => void
  }
}) {
  return <ReactFlowProvider><TabletSermonDeskInner {...props} /></ReactFlowProvider>
}
