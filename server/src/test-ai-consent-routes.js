const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const server = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
const generation = fs.readFileSync(path.join(__dirname, 'routes/generation.js'), 'utf8')
const client = fs.readFileSync(path.join(__dirname, '../../src/mobile/api.ts'), 'utf8')

function routeSource(source, owner, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0, `${owner} is missing route ${startMarker}`)
  assert.ok(end > start, `${owner} is missing route boundary after ${startMarker}`)
  return source.slice(start, end)
}

// Generation routes moved verbatim on 2026-08-15. These source guards keep the
// extraction itself load-bearing: one mount, no duplicate inline registrations,
// unchanged order, every injected dependency, and pre-claim input validation.
const generationPaths = ['/v1/analyze', '/v1/quick-study', '/v1/guided-study']
const generationStarts = generationPaths.map((routePath) =>
  generation.indexOf(`app.post('${routePath}'`))
assert.ok(generationStarts.every((start) => start >= 0), 'generation module must register all three generated-study routes')
assert.deepEqual([...generationStarts].sort((a, b) => a - b), generationStarts, 'generation routes must retain analyze, Quick, Guided order')
for (const routePath of generationPaths) {
  assert.equal(generation.split(`app.post('${routePath}'`).length - 1, 1, `generation module must register ${routePath} exactly once`)
  assert.equal(server.split(`app.post('${routePath}'`).length - 1, 0, `index.js must not resurrect an inline ${routePath}`)
}

assert.match(server, /^const generation = require\('\.\/routes\/generation'\)$/m, 'index.js must require the generation route module')
const adoption = server.indexOf('app.use(installDataAdoption.middleware(db))')
const mountStart = server.indexOf('generation.mount(app, db, {')
const mountEnd = server.indexOf('\n})', mountStart)
const readStart = server.indexOf("app.post('/v1/read'")
assert.ok(adoption >= 0 && mountStart > adoption && mountEnd > mountStart && readStart > mountEnd,
  'generation mount must remain after adoption middleware and before /v1/read')
assert.equal(server.split('generation.mount(app, db, {').length - 1, 1, 'index.js must mount generation routes exactly once')
const mountSource = server.slice(mountStart, mountEnd)
const moduleMountStart = generation.indexOf('function mount(app, db, {')
const moduleMountEnd = generation.indexOf('}) {', moduleMountStart)
assert.ok(moduleMountStart >= 0 && moduleMountEnd > moduleMountStart,
  'generation module must expose the dependency-injected mount seam')
const moduleMountSource = generation.slice(moduleMountStart, moduleMountEnd)
for (const dependency of [
  'route',
  'checkGenerationInput',
  'entitlementFor',
  'billingPeriodFor',
  'claimStudy',
  'newStudyId',
  'requireGeneratedStudyAccount',
  'AI_PROCESSING_CONSENT_VERSION',
  'meter',
  'engine',
  'mobile',
]) {
  assert.match(mountSource, new RegExp(`\\n\\s{2}${dependency},`), `generation mount must pass ${dependency}`)
  assert.match(moduleMountSource, new RegExp(`\\n\\s{2}${dependency},`), `generation module must receive ${dependency}`)
}
assert.match(generation, /module\.exports = \{ mount \}/, 'generation module must export its mount seam')

const analyzeRoute = routeSource(
  generation,
  'routes/generation.js',
  "app.post('/v1/analyze'",
  '// ── Mobile quick study',
)
const inputCheck = analyzeRoute.indexOf('checkGenerationInput({ text, reference })')
const claim = analyzeRoute.indexOf('claimStudy(req, {')
const open = analyzeRoute.indexOf('engine.openStudy(db, {')
assert.ok(inputCheck >= 0 && inputCheck < claim && claim < open,
  'Analyze must reject oversized input before any claim or study row')

for (const [source, owner, start, end] of [
  [generation, 'routes/generation.js', "app.post('/v1/quick-study'", "app.post('/v1/guided-study'"],
  [generation, 'routes/generation.js', "app.post('/v1/guided-study'", 'module.exports = { mount }'],
  [server, 'index.js', "app.post('/v1/ask'", 'const SERMON_AGENT_ROLES'],
  [server, 'index.js', "app.post('/v1/sermon-assist'", "app.get('/v1/studies/:id/commentary'"],
]) {
  const route = routeSource(source, owner, start, end)
  assert.match(route, /aiConsentVersion/)
  assert.match(route, /AI_CONSENT_REQUIRED/)
  assert.match(route, /AI_PROCESSING_CONSENT_VERSION/)
}

const askClientStart = client.indexOf('export function askQuestion')
const askClientEnd = client.indexOf('export async function askSermonAgent', askClientStart)
const askClient = client.slice(askClientStart, askClientEnd)
assert.match(askClient, /aiConsentVersion:\s*AI_PROCESSING_CONSENT_VERSION/)

console.log('mobile AI-consent and generation extraction contract passed')
