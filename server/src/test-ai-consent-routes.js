const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const server = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
const client = fs.readFileSync(path.join(__dirname, '../../src/mobile/api.ts'), 'utf8')

function routeSource(startMarker, endMarker) {
  const start = server.indexOf(startMarker)
  const end = server.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0, `missing route ${startMarker}`)
  assert.ok(end > start, `missing route boundary after ${startMarker}`)
  return server.slice(start, end)
}

for (const [start, end] of [
  ["app.post('/v1/quick-study'", "app.post('/v1/guided-study'"],
  ["app.post('/v1/guided-study'", "app.post('/v1/ask'"],
  ["app.post('/v1/ask'", "const SERMON_AGENT_ROLES"],
  ["app.post('/v1/sermon-assist'", "app.get('/v1/studies/:id/commentary'"],
]) {
  const route = routeSource(start, end)
  assert.match(route, /aiConsentVersion/)
  assert.match(route, /AI_CONSENT_REQUIRED/)
  assert.match(route, /AI_PROCESSING_CONSENT_VERSION/)
}

const askClientStart = client.indexOf('export function askQuestion')
const askClientEnd = client.indexOf('export async function askSermonAgent', askClientStart)
const askClient = client.slice(askClientStart, askClientEnd)
assert.match(askClient, /aiConsentVersion:\s*AI_PROCESSING_CONSENT_VERSION/)

console.log('mobile AI-consent route contract passed')
