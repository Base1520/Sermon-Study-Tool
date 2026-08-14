import type { GuidedStudyDoc, PassageResult } from './api'

export const MAX_TABLET_DESK_NODES = 32

export type TabletDeskTileKind =
  | 'passage'
  | 'big-idea'
  | 'structure'
  | 'context'
  | 'application'
  | 'outline'
  | 'manuscript'
  | 'map'
  | 'lineage'
  | 'timeline'
  | 'temple'
  | 'commentary'
  | 'note'
  | 'illustration'
  | 'ink'

export type TabletAgentRole = 'exegetical' | 'theological' | 'homiletical' | 'scholar'

export interface TabletAgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export type TabletAgentThreads = Record<TabletAgentRole, TabletAgentMessage[]>

export interface TabletInkPoint {
  x: number
  y: number
  pressure: number
}

export interface TabletInkStroke {
  color: string
  width: number
  points: TabletInkPoint[]
}

export interface TabletDeskTileData {
  kind: TabletDeskTileKind
  eyebrow: string
  title: string
  content: string
  editable: boolean
  sourceRefs: string[]
  accent: 'gold' | 'khaki' | 'red' | 'blue'
  strokes?: TabletInkStroke[]
}

export interface TabletDeskNode {
  id: string
  type: 'textTile' | 'inkTile' | 'manuscriptTile' | 'referenceTile' | 'commentaryTile'
  position: { x: number; y: number }
  width: number
  height: number
  hidden?: boolean
  data: TabletDeskTileData
}

export interface TabletDeskViewport {
  x: number
  y: number
  zoom: number
}

export interface TabletSermonWorkspace {
  version: 1
  reference: string
  nodes: TabletDeskNode[]
  viewport: TabletDeskViewport | null
  locked: boolean
  agentThreads: TabletAgentThreads
  updatedAt: string
}

const TILE_KINDS = new Set<TabletDeskTileKind>([
  'passage',
  'big-idea',
  'structure',
  'context',
  'application',
  'outline',
  'manuscript',
  'map',
  'lineage',
  'timeline',
  'temple',
  'commentary',
  'note',
  'illustration',
  'ink',
])

const AGENT_ROLES: TabletAgentRole[] = ['exegetical', 'theological', 'homiletical', 'scholar']

export function emptyTabletAgentThreads(): TabletAgentThreads {
  return { exegetical: [], theological: [], homiletical: [], scholar: [] }
}

function normalizeAgentThreads(value: unknown): TabletAgentThreads {
  const threads = emptyTabletAgentThreads()
  if (!value || typeof value !== 'object') return threads
  const raw = value as Record<string, unknown>
  for (const role of AGENT_ROLES) {
    const messages = Array.isArray(raw[role]) ? raw[role] as unknown[] : []
    threads[role] = messages.slice(-20).flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return []
      const message = candidate as Record<string, unknown>
      const roleValue = message.role === 'user' || message.role === 'assistant' ? message.role : null
      const content = cleanText(message.content, 8_000).trim()
      return roleValue && content ? [{ role: roleValue, content }] : []
    })
  }
  return threads
}

function cleanText(value: unknown, limit = 60_000) {
  return String(value ?? '').replace(/\r\n/g, '\n').slice(0, limit)
}

function cleanSources(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 12)
}

function finite(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback
}

export function normalizeTabletInkStrokes(value: unknown) {
  if (!Array.isArray(value)) return []
  let remainingPoints = 3_500
  const strokes: TabletInkStroke[] = []
  for (const candidate of value.slice(-160).reverse()) {
    if (!candidate || typeof candidate !== 'object' || remainingPoints <= 0) break
    const raw = candidate as Record<string, unknown>
    const rawPoints = Array.isArray(raw.points) ? raw.points : []
    const points: TabletInkPoint[] = []
    for (const point of rawPoints.slice(-remainingPoints)) {
      if (remainingPoints <= 0 || !point || typeof point !== 'object') break
      const rawPoint = point as Record<string, unknown>
      points.push({
        x: Math.round(finite(rawPoint.x, 0, 0, 1) * 10_000) / 10_000,
        y: Math.round(finite(rawPoint.y, 0, 0, 1) * 10_000) / 10_000,
        pressure: Math.round(finite(rawPoint.pressure, .5, .05, 1) * 1_000) / 1_000,
      })
      remainingPoints -= 1
    }
    if (points.length) {
      strokes.push({
        color: /^#[0-9a-f]{6}$/i.test(String(raw.color || '')) ? String(raw.color) : '#f2d05f',
        width: finite(raw.width, 4, 1, 16),
        points,
      })
    }
  }
  return strokes.reverse()
}

function passageContent(passage: PassageResult) {
  if (passage.verses.length) {
    return passage.verses.map((verse) => `${verse.verse}  ${verse.text}`).join('\n\n')
  }
  return passage.text
}

function structureContent(document: GuidedStudyDoc) {
  return document.textUnits.map((unit, index) => [
    `${toRoman(index + 1)}. ${unit.heading.toUpperCase()}  ·  ${unit.ref}`,
    `“${unit.anchor}”`,
    unit.explanation,
  ].join('\n')).join('\n\n')
}

function outlineContent(document: GuidedStudyDoc) {
  return document.textUnits.map((unit, index) => [
    `${toRoman(index + 1)}. ${unit.heading.toUpperCase()}  (${unit.ref})`,
    `    Text anchor: “${unit.anchor}”`,
    `    Exegetical movement: ${unit.explanation}`,
  ].join('\n')).join('\n\n')
}

function contextContent(document: GuidedStudyDoc) {
  const christStep = document.covenant.find((step) => step.id === 'anchor')
  const navigateStep = document.covenant.find((step) => step.id === 'navigate')
  return [
    `WHEN\n${document.situation.when}`,
    `WHERE\n${document.situation.where}`,
    `PRESSURE\n${document.situation.pressure}`,
    christStep ? `WHOLE-BIBLE ANCHOR\n${christStep.finding}` : '',
    navigateStep ? `INTERPRETIVE RESTRAINT\n${navigateStep.restraint || navigateStep.finding}` : '',
  ].filter(Boolean).join('\n\n')
}

function applicationContent(document: GuidedStudyDoc) {
  return [
    `TO THEM FIRST\n${document.application.toThemFirst}`,
    `ENDURING TRUTH\n${document.application.enduringTruth}`,
    `INDIVIDUAL\n${document.application.today}`,
    `THE CHURCH\n${document.application.corporate}`,
    `THE MISSION\n${document.application.mission}`,
    `FAITHFUL RESPONSE\n${document.application.response}`,
  ].join('\n\n')
}

function manuscriptScaffold(document: GuidedStudyDoc) {
  return [
    'BIG IDEA',
    document.mainClaim,
    '',
    'TEXT-DRIVEN MOVEMENT',
    outlineContent(document),
    '',
    'APPLICATION LANDING',
    document.application.response,
    '',
    'MANUSCRIPT',
    '',
  ].join('\n')
}

function toRoman(value: number) {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
  return numerals[value - 1] || String(value)
}

function node(
  id: string,
  type: TabletDeskNode['type'],
  x: number,
  y: number,
  width: number,
  height: number,
  data: TabletDeskTileData,
  hidden = false,
): TabletDeskNode {
  return { id, type, position: { x, y }, width, height, hidden, data }
}

export function createTabletSermonWorkspace(document: GuidedStudyDoc, passage: PassageResult): TabletSermonWorkspace {
  const now = new Date().toISOString()
  return {
    version: 1,
    reference: document.reference,
    viewport: null,
    locked: false,
    agentThreads: emptyTabletAgentThreads(),
    updatedAt: now,
    nodes: [
      node('passage', 'textTile', 80, 80, 650, 540, {
        kind: 'passage', eyebrow: document.reference, title: 'THE TEXT',
        content: passageContent(passage), editable: false, sourceRefs: [], accent: 'gold',
      }),
      node('big-idea', 'textTile', 780, 80, 560, 280, {
        kind: 'big-idea', eyebrow: 'TEXT-DRIVEN', title: 'BIG IDEA',
        content: document.mainClaim, editable: true, sourceRefs: document.mainClaimSources, accent: 'gold',
      }),
      node('structure', 'textTile', 780, 400, 560, 520, {
        kind: 'structure', eyebrow: 'STUDY EVIDENCE', title: 'NATURAL DIVISIONS',
        content: structureContent(document), editable: false,
        sourceRefs: document.textUnits.map((unit) => `Passage: ${unit.anchor}`), accent: 'khaki',
      }),
      node('context', 'textTile', 1390, 80, 500, 500, {
        kind: 'context', eyebrow: 'WHOLE-BIBLE', title: 'CONTEXT + RESTRAINT',
        content: contextContent(document), editable: false,
        sourceRefs: [...document.situation.sourceRefs, ...document.guardrails], accent: 'khaki',
      }),
      node('application', 'textTile', 80, 680, 560, 500, {
        kind: 'application', eyebrow: 'THEN → NOW', title: 'APPLICATION / LANDING',
        content: applicationContent(document), editable: true,
        sourceRefs: document.application.sourceRefs, accent: 'blue',
      }),
      node('outline', 'textTile', 1390, 630, 500, 550, {
        kind: 'outline', eyebrow: 'TEXT-DRIVEN', title: 'SERMON OUTLINE',
        content: outlineContent(document), editable: true,
        sourceRefs: document.textUnits.map((unit) => `Passage: ${unit.anchor}`), accent: 'gold',
      }),
      node('manuscript', 'manuscriptTile', 680, 980, 900, 760, {
        kind: 'manuscript', eyebrow: 'WORKING DRAFT', title: 'MANUSCRIPT',
        content: manuscriptScaffold(document), editable: true,
        sourceRefs: document.mainClaimSources, accent: 'gold',
      }),
      // Secondary tiles start hidden — the desk opens with the core study set
      // and everything below is one tap away in ADD TILES.
      node('ink-1', 'inkTile', 80, 1240, 500, 430, {
        kind: 'ink', eyebrow: 'STYLUS', title: 'PENCIL NOTES',
        content: '', editable: true, sourceRefs: [], accent: 'gold', strokes: [],
      }, true),
      node('map', 'referenceTile', 1950, 80, 760, 600, {
        kind: 'map', eyebrow: 'BIBLICAL WORLD', title: 'PASSAGE MAP',
        content: '', editable: false, sourceRefs: [], accent: 'blue',
      }, true),
      node('lineage', 'referenceTile', 1950, 730, 620, 640, {
        kind: 'lineage', eyebrow: 'REFERENCE', title: 'LINEAGE',
        content: '', editable: false, sourceRefs: [], accent: 'khaki',
      }, true),
      node('timeline', 'referenceTile', 80, 1780, 1200, 620, {
        kind: 'timeline', eyebrow: 'HISTORICAL FRAME', title: 'BIBLICAL TIMELINE',
        content: '', editable: false, sourceRefs: [], accent: 'khaki',
      }, true),
      node('temple', 'referenceTile', 1340, 1780, 760, 680, {
        kind: 'temple', eyebrow: 'TABERNACLE + TEMPLES', title: 'WORSHIP STRUCTURES',
        content: '', editable: false, sourceRefs: [], accent: 'gold',
      }, true),
      node('commentary', 'commentaryTile', 2150, 1420, 650, 650, {
        kind: 'commentary', eyebrow: 'CITATION FIRST', title: 'COMMENTARIES',
        content: '', editable: false, sourceRefs: [], accent: 'gold',
      }, true),
    ],
  }
}

export function createTabletDeskNote(kind: 'note' | 'illustration' | 'ink', index: number): TabletDeskNode {
  const suffix = `${Date.now()}-${index}`
  if (kind === 'ink') {
    return node(`ink-${suffix}`, 'inkTile', 240 + index * 36, 240 + index * 36, 500, 430, {
      kind: 'ink', eyebrow: 'STYLUS', title: 'PENCIL NOTES', content: '', editable: true,
      sourceRefs: [], accent: 'gold', strokes: [],
    })
  }
  const illustration = kind === 'illustration'
  return node(`${kind}-${suffix}`, 'textTile', 240 + index * 36, 240 + index * 36, 460, 320, {
    kind,
    eyebrow: illustration ? 'VERIFY BEFORE USE' : 'FIELD NOTE',
    title: illustration ? 'ILLUSTRATION PLACEHOLDER' : 'BLANK NOTE',
    content: '',
    editable: true,
    sourceRefs: [],
    accent: illustration ? 'red' : 'khaki',
  })
}

export function normalizeTabletSermonWorkspace(
  value: unknown,
  document: GuidedStudyDoc,
  passage: PassageResult,
): TabletSermonWorkspace {
  const fallback = createTabletSermonWorkspace(document, passage)
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Record<string, unknown>
  if (raw.version !== 1) return fallback
  if (cleanText(raw.reference, 200).toLowerCase() !== document.reference.toLowerCase()) return fallback
  const candidates = Array.isArray(raw.nodes) ? raw.nodes : []
  const coreNodes = new Map(fallback.nodes.map((item) => [item.id, item]))
  const normalizedCore = new Map<string, TabletDeskNode>()
  const customNodes: TabletDeskNode[] = []
  const seenIds = new Set<string>()
  for (const candidate of candidates.slice(0, MAX_TABLET_DESK_NODES)) {
    if (!candidate || typeof candidate !== 'object') continue
    const rawNode = candidate as Record<string, unknown>
    const rawData = rawNode.data && typeof rawNode.data === 'object'
      ? rawNode.data as Record<string, unknown>
      : null
    const id = cleanText(rawNode.id, 90)
    if (!id || seenIds.has(id)) continue
    const kind = cleanText(rawData?.kind, 40) as TabletDeskTileKind
    if (!rawData || !TILE_KINDS.has(kind)) continue
    const core = coreNodes.get(id)
    if (!core && !['note', 'illustration', 'ink'].includes(kind)) continue
    seenIds.add(id)
    const normalizedKind = core?.data.kind || kind
    const type: TabletDeskNode['type'] = normalizedKind === 'ink' ? 'inkTile'
      : normalizedKind === 'manuscript' ? 'manuscriptTile'
      : normalizedKind === 'commentary' ? 'commentaryTile'
      : ['map', 'lineage', 'timeline', 'temple'].includes(normalizedKind) ? 'referenceTile'
      : 'textTile'
    const position = rawNode.position && typeof rawNode.position === 'object'
      ? rawNode.position as Record<string, unknown>
      : {}
    const protectedContent = core && ['passage', 'structure', 'context'].includes(core.data.kind)
    const normalized: TabletDeskNode = {
      id,
      type,
      position: {
        x: finite(position.x, core?.position.x ?? 80 + customNodes.length * 24, -10_000, 10_000),
        y: finite(position.y, core?.position.y ?? 80 + customNodes.length * 24, -10_000, 10_000),
      },
      width: finite(rawNode.width, core?.width ?? (type === 'inkTile' ? 500 : 480), 260, 1_400),
      height: finite(rawNode.height, core?.height ?? (type === 'inkTile' ? 430 : 360), 200, 1_200),
      hidden: Boolean(rawNode.hidden),
      data: {
        kind: normalizedKind,
        eyebrow: core?.data.eyebrow || cleanText(rawData.eyebrow, 100),
        title: core?.data.title || cleanText(rawData.title, 140) || 'UNTITLED TILE',
        content: protectedContent ? core.data.content : cleanText(rawData.content),
        editable: core ? core.data.editable : true,
        sourceRefs: core?.data.sourceRefs || cleanSources(rawData.sourceRefs),
        accent: core?.data.accent || (['gold', 'khaki', 'red', 'blue'].includes(String(rawData.accent))
          ? rawData.accent as TabletDeskTileData['accent']
          : 'khaki'),
        ...(type === 'inkTile' ? { strokes: normalizeTabletInkStrokes(rawData.strokes) } : {}),
      },
    }
    if (core) normalizedCore.set(id, normalized)
    else customNodes.push(normalized)
  }
  const nodes = fallback.nodes.map((item) => normalizedCore.get(item.id) || item)
  nodes.push(...customNodes.slice(0, Math.max(0, MAX_TABLET_DESK_NODES - nodes.length)))
  const viewport = raw.viewport && typeof raw.viewport === 'object'
    ? raw.viewport as Record<string, unknown>
    : null
  return {
    version: 1,
    reference: document.reference,
    nodes,
    viewport: viewport ? {
      x: finite(viewport.x, 0, -100_000, 100_000),
      y: finite(viewport.y, 0, -100_000, 100_000),
      zoom: finite(viewport.zoom, .65, .1, 2.5),
    } : null,
    locked: Boolean(raw.locked),
    agentThreads: normalizeAgentThreads(raw.agentThreads),
    updatedAt: cleanText(raw.updatedAt, 80) || new Date().toISOString(),
  }
}

export function tabletWorkspaceJsonSize(workspace: TabletSermonWorkspace) {
  return JSON.stringify(workspace).length
}
