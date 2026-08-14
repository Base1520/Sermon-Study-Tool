import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const srcRoot = path.join(projectRoot, 'src')
const mobileRoot = path.join(srcRoot, 'mobile')
let passed = 0
let failed = 0

function check(name, test) {
  try {
    test()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name} — ${error.message}`)
  }
}

function compileCommonJs(source, filename, overrides = new Map()) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: filename.replace(/\.audit\.cjs$/, ''),
  }).outputText
  const compiled = new Module(filename)
  compiled.filename = filename
  compiled.paths = Module._nodeModulePaths(path.dirname(filename))
  const load = compiled.require.bind(compiled)
  compiled.require = (id) => overrides.has(id) ? overrides.get(id) : load(id)
  compiled._compile(output, filename)
  return compiled.exports
}

const modelPath = path.join(mobileRoot, 'tabletDeskModel.ts')
const model = await import(`${pathToFileURL(modelPath).href}?tablet-ui-test=${Date.now()}`)
const document = {
  reference: 'Romans 8:1-4',
  mainClaim: 'Life in Christ answers condemnation.',
  mainClaimSources: ['Romans 8:1-4'],
  textUnits: [{ heading: 'No condemnation', ref: 'Romans 8:1', anchor: 'no condemnation', explanation: 'The controlling claim.' }],
  situation: { when: 'First century', where: 'Rome', pressure: 'Sin and death', sourceRefs: ['Romans 8:1-4'] },
  covenant: [],
  guardrails: [],
  application: {
    toThemFirst: 'Hear the gospel promise.',
    enduringTruth: 'Christ frees his people.',
    today: 'Walk by the Spirit.',
    corporate: 'Bear witness together.',
    mission: 'Proclaim freedom in Christ.',
    response: 'Trust and obey.',
    sourceRefs: ['Romans 8:1-4'],
  },
}
const passage = {
  text: 'There is therefore now no condemnation.',
  verses: [{ verse: 1, text: 'There is therefore now no condemnation.' }],
}
const expectedVisible = ['passage', 'big-idea', 'structure', 'context', 'application', 'outline', 'manuscript']
const expectedHidden = ['ink-1', 'map', 'lineage', 'timeline', 'temple', 'commentary']
const workspace = model.createTabletSermonWorkspace(document, passage)

check('new sermon desk seeds exactly thirteen tiles', () => assert.equal(workspace.nodes.length, 13))
check('new sermon desk opens with the exact seven core tiles', () => {
  assert.deepEqual(workspace.nodes.filter((node) => !node.hidden).map((node) => node.id), expectedVisible)
})
check('tile library starts with the exact six secondary tiles', () => {
  assert.deepEqual(workspace.nodes.filter((node) => node.hidden).map((node) => node.id), expectedHidden)
})

const saved = JSON.parse(JSON.stringify(workspace))
saved.nodes.find((node) => node.id === 'passage').hidden = true
saved.nodes.find((node) => node.id === 'temple').hidden = false
const normalized = model.normalizeTabletSermonWorkspace(saved, document, passage)
check('saved close and restore state survives model normalization', () => {
  assert.equal(normalized.nodes.find((node) => node.id === 'passage').hidden, true)
  assert.equal(normalized.nodes.find((node) => node.id === 'temple').hidden, false)
})

const deskPath = path.join(mobileRoot, 'TabletSermonDesk.tsx')
const deskSource = fs.readFileSync(deskPath, 'utf8')
const deskAst = ts.createSourceFile(deskPath, deskSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const declaration = (name) => {
  const found = deskAst.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name)
  if (!found) throw new Error(`missing ${name} declaration`)
  return found.getText(deskAst)
}
const adapterSource = [
  'type TabletDeskNode = any',
  'type TabletFlowNode = any',
  declaration('flowNode'),
  declaration('dimension'),
  declaration('serializedNode'),
  'export { flowNode, serializedNode }',
].join('\n')
const deskAdapters = compileCommonJs(adapterSource, `${deskPath}.audit.cjs`)
check('flow conversion and serialization preserve both hidden states', () => {
  for (const hidden of [false, true]) {
    const seed = { ...workspace.nodes[0], hidden }
    assert.equal(deskAdapters.flowNode(seed).hidden, hidden)
    assert.equal(deskAdapters.serializedNode(deskAdapters.flowNode(seed)).hidden, hidden)
  }
})

function createHookHarness() {
  const slots = []
  let cursor = 0
  const useState = (initial) => {
    const index = cursor++
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
    const setState = (next) => {
      slots[index] = typeof next === 'function' ? next(slots[index]) : next
    }
    return [slots[index], setState]
  }
  return {
    react: {
      createContext: () => ({ Provider: ({ children }) => children }),
      useCallback: (callback) => callback,
      useContext: () => null,
      useEffect: () => {},
      useMemo: (factory) => factory(),
      useRef: (initial) => {
        const [ref] = useState({ current: initial })
        return ref
      },
      useState,
    },
    beginRender: () => { cursor = 0 },
    useState,
  }
}

function findElement(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }
  if (!React.isValidElement(node)) return null
  if (predicate(node)) return node
  return findElement(node.props.children, predicate)
}

function elementText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(elementText).join(' ')
  if (!React.isValidElement(node)) return ''
  return elementText(node.props.children)
}

function createDeskHarness(seedWorkspace) {
  const hooks = createHookHarness()
  const TabletPreachMode = () => null
  const componentStub = () => null
  const flowStub = {
    Background: 'xy-background',
    MiniMap: 'xy-minimap',
    NodeResizer: 'xy-node-resizer',
    ReactFlow: 'xy-react-flow',
    ReactFlowProvider: 'xy-react-flow-provider',
    useNodesState: (initial) => {
      const [nodes, setNodes] = hooks.useState(initial)
      return [nodes, setNodes, () => {}]
    },
    useReactFlow: () => ({
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport: () => Promise.resolve(),
    }),
  }
  const deskModule = compileCommonJs(deskSource, `${deskPath}.audit.cjs`, new Map([
    ['react', hooks.react],
    ['react/jsx-runtime', jsxRuntime],
    ['@xyflow/react', flowStub],
    ['@xyflow/react/dist/style.css', {}],
    ['./TabletAgentPanel', {
      TabletAgentPanel: componentStub,
      TABLET_AGENT_META: {
        exegetical: { label: 'EXEGETICAL', icon: 'α' },
        theological: { label: 'THEOLOGICAL', icon: '†' },
        homiletical: { label: 'HOMILETICAL', icon: '◇' },
        scholar: { label: 'SCHOLAR', icon: 'λ' },
      },
    }],
    ['./clipboard', { copyToClipboard: async () => {}, readFromClipboard: async () => '' }],
    ['./TabletCommentaryTile', { TabletCommentaryTile: componentStub }],
    ['./TabletManuscriptEditor', { TabletManuscriptEditor: componentStub }],
    ['./TabletPreachMode', { TabletPreachMode }],
    ['./TabletRecorder', { TabletRecorder: componentStub }],
    ['./TabletReferenceTiles', { TabletReferenceTile: componentStub }],
    ['./tabletDeskModel', model],
  ]))
  const props = {
    studyId: 'study-test',
    analysis: {},
    workspaceKey: 'workspace-test',
    workspace: seedWorkspace,
    recorder: { status: 'idle' },
    syncAvailable: false,
    syncState: 'local-only',
    syncRevision: 0,
    onWorkspaceChange: async () => {},
  }
  return {
    TabletPreachMode,
    render: () => {
      hooks.beginRender()
      return deskModule.TabletSermonDeskInner(props)
    },
  }
}

check('not-ready PREACH tap explains the manuscript gate without opening Preach Mode', () => {
  const harness = createDeskHarness(workspace)
  let tree = harness.render()
  const button = findElement(tree, (element) => element.props.className === 'tablet-preach-button')
  assert.ok(button, 'PREACH button is missing')
  assert.notEqual(button.props.disabled, true, 'PREACH must remain tappable so it can explain the gate')
  button.props.onClick()
  tree = harness.render()
  const notice = findElement(tree, (element) => element.props.role === 'alert')
  assert.ok(notice, 'not-ready PREACH tap did not render the desk notice')
  assert.match(elementText(notice), /AT LEAST 40 CHARACTERS UNDER THE MANUSCRIPT HEADING/)
  assert.match(elementText(notice), /THE OUTLINE ABOVE IT DOES NOT COUNT/)
  assert.equal(findElement(tree, (element) => element.type === harness.TabletPreachMode), null)
})

check('ready PREACH tap opens Preach Mode without a gate notice', () => {
  const readyWorkspace = JSON.parse(JSON.stringify(workspace))
  const manuscript = readyWorkspace.nodes.find((node) => node.id === 'manuscript')
  manuscript.data.content += 'Christ frees his people from condemnation and calls them to walk by the Spirit.'
  const harness = createDeskHarness(readyWorkspace)
  let tree = harness.render()
  const button = findElement(tree, (element) => element.props.className === 'tablet-preach-button')
  assert.ok(button, 'PREACH button is missing')
  button.props.onClick()
  tree = harness.render()
  assert.ok(findElement(tree, (element) => element.type === harness.TabletPreachMode), 'ready manuscript did not open Preach Mode')
  assert.equal(findElement(tree, (element) => element.props.role === 'alert'), null)
})

const worshipPath = path.join(srcRoot, 'components', 'WorshipStructure.tsx')
const worshipSource = fs.readFileSync(worshipPath, 'utf8')
const worshipModule = compileCommonJs(worshipSource, `${worshipPath}.audit.cjs`, new Map([
  ['./VerseHover', { VerseHover: ({ children }) => children }],
]))
check('rendered SVG keeps the legacy 620×500 scene anchor centered at three tile sizes', () => {
  for (const [width, height] of [[620, 578], [726, 596], [480, 430]]) {
    const diagramHeight = height - 78
    const centerX = width / 2
    const centerY = diagramHeight / 2
    const markup = renderToStaticMarkup(React.createElement(worshipModule.default, { width, height }))
    assert.ok(markup.includes(`translate(${centerX},${centerY}) scale(1) translate(${-centerX},${-centerY})`))
    assert.ok(markup.includes(`translate(${centerX - 310},${centerY - 250})`))
  }
})

function sourceFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name)
    return entry.isDirectory() ? sourceFiles(target) : [target]
  })
}
check('theological agent uses the text dagger on all three intended surfaces', () => {
  const intended = [
    path.join(srcRoot, 'App.tsx'),
    path.join(srcRoot, 'components', 'AgentChat.tsx'),
    path.join(mobileRoot, 'TabletAgentPanel.tsx'),
  ]
  for (const filename of intended) {
    assert.ok(/icon:\s*'†'/.test(fs.readFileSync(filename, 'utf8')), `text dagger missing from ${path.relative(srcRoot, filename)}`)
  }
  for (const filename of sourceFiles(srcRoot)) {
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filename)) continue
    assert.equal(fs.readFileSync(filename, 'utf8').includes(String.fromCodePoint(0x271d)), false, filename)
  }
})

check('tile library copy presents the hidden set as addable tiles', () => {
  const source = fs.readFileSync(deskPath, 'utf8')
  assert.ok(/>\+ TILES /.test(source), 'add-tiles button label is missing')
  assert.ok(/ADD A TILE TO THE DESK/.test(source), 'hidden-tile prompt is missing')
  assert.ok(/EVERY TILE IS ON THE DESK/.test(source), 'empty-library prompt is missing')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
