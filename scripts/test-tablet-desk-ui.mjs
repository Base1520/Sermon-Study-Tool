import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import React from 'react'
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
