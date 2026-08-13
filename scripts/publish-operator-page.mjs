import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const PAGE_ID = 9839
const API = `https://www.base1520.com/wp-json/wp/v2/pages/${PAGE_ID}`
const PUBLIC_URL = 'https://www.base1520.com/operator/'
const SOURCE = new URL('../website/operator-page.html', import.meta.url)
const CREDENTIAL_FILE = path.join(os.homedir(), '.wp-base1520')
const BACKUP_DIR = '/Users/colepermenter/Claude/Tools/CounterpartOS/.counterpart/website-backups'

async function authorization() {
  const [username, password] = (await readFile(CREDENTIAL_FILE, 'utf8'))
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
  if (!username || !password) throw new Error('WordPress application credential is incomplete')
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(45_000) })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`WordPress ${response.status}: ${body?.message ?? 'request failed'}`)
  return body
}

function assertTarget(page) {
  if (page.id !== PAGE_ID || page.slug !== 'operator' || page.status !== 'publish') {
    throw new Error('Page 9839 is no longer the published Operator page; refusing to overwrite it')
  }
}

async function inspect(auth) {
  const page = await request(`${API}?context=edit&_fields=id,slug,status,modified_gmt,link,content`, {
    headers: { authorization: auth },
  })
  assertTarget(page)
  return page
}

async function verifyPublic() {
  const response = await fetch(PUBLIC_URL, { signal: AbortSignal.timeout(45_000) })
  const html = await response.text()
  if (!response.ok) throw new Error(`Public Operator page returned HTTP ${response.status}`)
  const required = ['$29.99', '$299.99', '$49.99', '$499.99', '$149.99', '$1,649.99']
  const missing = required.filter((value) => !html.includes(value))
  if (missing.length) throw new Error(`Public Operator page is missing ${missing.join(', ')}`)
  if (!/Web (?:&|&amp;) Android only/.test(html)) throw new Error('Public Operator page is missing the Heavy Annual platform boundary')
  return { status: response.status, url: response.url, requiredCopyPresent: true }
}

async function publish(auth) {
  const before = await inspect(auth)
  const source = await readFile(SOURCE, 'utf8')
  if (!source.startsWith('<!-- wp:html -->') || !source.trimEnd().endsWith('<!-- /wp:html -->')) {
    throw new Error('Operator source is not enclosed in one Gutenberg Custom HTML block')
  }

  await mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(BACKUP_DIR, `operator-page-9839-${stamp}.json`)
  await writeFile(backupPath, `${JSON.stringify({ capturedAt: new Date().toISOString(), page: before }, null, 2)}\n`, { mode: 0o600 })
  await chmod(backupPath, 0o600)

  const updated = await request(API, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ content: source }),
  })
  assertTarget(updated)
  const publicResult = await verifyPublic()
  return {
    ok: true,
    backupPath,
    page: { id: updated.id, slug: updated.slug, status: updated.status, modifiedGmt: updated.modified_gmt, link: updated.link },
    public: publicResult,
  }
}

const auth = await authorization()
const command = process.argv[2] ?? 'inspect'
if (command === 'inspect') {
  const page = await inspect(auth)
  console.log(JSON.stringify({ id: page.id, slug: page.slug, status: page.status, modifiedGmt: page.modified_gmt, link: page.link }))
} else if (command === 'publish') {
  console.log(JSON.stringify(await publish(auth), null, 2))
} else {
  throw new Error(`Unknown command: ${command}`)
}
