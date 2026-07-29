const { app, BrowserWindow, Menu, ipcMain, shell, dialog, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const packageMetadata = require('../package.json')
const {
  isRetrievalEnabled,
  passageBook,
  selectScopedResults,
  validateCommentarySynthesis,
} = require('./commentary-contract')
const isDev = process.env.NODE_ENV === 'development'

// Manual beta builds do not have a trusted update channel yet. Updates stay
// off unless a future signed release explicitly enables them at launch.
let autoUpdater
if (!isDev && process.env.BASE1520_ENABLE_AUTO_UPDATE === 'true') {
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'A new version of The Operator has been downloaded. It will install when you restart the app.',
        buttons: ['Restart Now', 'Later'],
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
    })
    autoUpdater.checkForUpdatesAndNotify()
  } catch (e) {
    console.log('[updater] skipped:', e.message)
  }
}

// electron-store loaded after app path is set
let store

const SECRET_STORE_KEY = 'encrypted-api-secrets'
const SECRET_NAMES = ['ANTHROPIC_KEY', 'ESV_KEY', 'OPENAI_KEY']

function secretStatus() {
  return Object.fromEntries(SECRET_NAMES.map((name) => [name, Boolean(readSecret(name))]))
}

function readSecret(name) {
  const encrypted = store?.get(SECRET_STORE_KEY, {})?.[name]
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return ''
  }
}

function saveSecrets(values = {}) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is unavailable on this computer.')
  }
  const encrypted = { ...(store?.get(SECRET_STORE_KEY, {}) ?? {}) }
  for (const name of SECRET_NAMES) {
    const value = typeof values[name] === 'string' ? values[name].trim() : ''
    if (!value) continue
    if (value.length > 1024) throw new Error(`Invalid ${name}.`)
    encrypted[name] = safeStorage.encryptString(value).toString('base64')
  }
  store?.set(SECRET_STORE_KEY, encrypted)
  return secretStatus()
}

function requireSecret(name, label) {
  const value = readSecret(name)
  if (!value) throw new Error(`${label} API key required — add it in Settings.`)
  return value
}

function buildMenu() {
  const template = [
    { role: 'appMenu' },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'pasteAndMatchStyle' }, { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0a0a0f',
    // hiddenInset + traffic lights are macOS-only; Windows/Linux get a standard frame
    ...(isMac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev
      ? url.startsWith('http://localhost:5173')
      : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.webContents.on('did-finish-load', () => {
    const z = store?.get('ui-zoom', 1) ?? 1
    if (z !== 1) win.webContents.setZoomFactor(z)
  })
}

app.whenReady().then(async () => {
  const Store = (await import('electron-store')).default
  store = new Store()
  buildMenu()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// IPC: Call Claude API from main process (has full node access)
const Anthropic = require('@anthropic-ai/sdk')

// Retry with exponential backoff for 529 overloaded errors
async function withRetry(fn, maxAttempts = 4, baseDelayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const is529 = err?.status === 529 || err?.message?.includes('overloaded')
      if (is529 && attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1) // 3s, 6s, 12s
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
}

// Robust JSON extraction from model output — handles code fences, prose
// wrappers, trailing commas, and both object and array roots.
function parseModelJSON(res) {
  const rawText = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
  let raw = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const firstBrace = raw.indexOf('{'), firstBracket = raw.indexOf('[')
  const isArray = firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)
  const start = isArray ? firstBracket : firstBrace
  const end = isArray ? raw.lastIndexOf(']') : raw.lastIndexOf('}')
  if (start !== -1 && end > start) raw = raw.slice(start, end + 1)
  raw = raw.replace(/,(\s*[}\]])/g, '$1')
  try { return JSON.parse(raw) }
  catch (e) {
    console.error('[parseModelJSON] failed:', e.message, '| excerpt:', raw.slice(Math.max(0, raw.length - 300)))
    throw new Error('The model returned malformed data — please try again.')
  }
}

function theologyRetrievalRoot() {
  if (process.env.THEOLOGY_RETRIEVAL_PATH) return process.env.THEOLOGY_RETRIEVAL_PATH
  return app.isPackaged
    ? path.join(process.resourcesPath, 'theology-retrieval')
    : path.join(__dirname, '../resources/theology-retrieval')
}

function runTheologyRetrieval(query) {
  const root = theologyRetrievalRoot()
  const script = path.join(root, 'theology_retrieval.py')
  const db = path.join(root, 'library.sqlite3')
  return new Promise((resolve, reject) => {
    execFile('python3', [script, '--db', db, 'query', query, '--limit', '64', '--source-type', 'commentary', '--json'], {
      cwd: root,
      timeout: 15000,
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('[theology-retrieval] failed:', stderr || error.message)
        reject(new Error('The local commentary library could not be searched.'))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error('The local commentary library returned malformed data.'))
      }
    })
  })
}

function loadRetrievalManifest() {
  const manifestPath = path.join(theologyRetrievalRoot(), 'bundle-manifest.json')
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
}

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('secret-status', () => secretStatus())

ipcMain.handle('save-api-keys', (_, values) => saveSecrets(values))

ipcMain.handle('migrate-legacy-api-keys', (_, rendererValues = {}) => {
  const migrated = {}
  for (const name of SECRET_NAMES) {
    const value = typeof rendererValues[name] === 'string' ? rendererValues[name].trim() : ''
    if (value) migrated[name] = value
  }

  const dir = path.join(app.getPath('documents'), 'BASE1520')
  const file = path.join(dir, 'keys.txt')
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*(ANTHROPIC_KEY|ESV_KEY|OPENAI_KEY)\s*=\s*(.+)\s*$/)
      if (match && match[2].trim() && !match[2].trim().startsWith('#')) {
        migrated[match[1]] = match[2].trim()
      }
    }
  }

  if (Object.keys(migrated).length) saveSecrets(migrated)

  if (fs.existsSync(file)) {
    fs.writeFileSync(file, `# BASE 1520 API keys were migrated into protected app storage.
# Manage or replace them from Settings inside BASE 1520.

ANTHROPIC_KEY=
ESV_KEY=
OPENAI_KEY=
`, { mode: 0o600 })
    try { fs.chmodSync(file, 0o600) } catch {}
  }

  return secretStatus()
})

// A saved key is not the same thing as a usable key. Test the exact model the
// study path needs before onboarding tells a reader setup is complete. This is
// intentionally a one-token request: model-list endpoints can verify a key while
// missing an exhausted credit balance, which is the failure this check exists to
// catch.
ipcMain.handle('test-anthropic-key', async (_, rawKey) => {
  const apiKey = String(rawKey ?? '').trim()
  if (!apiKey) throw new Error('An Anthropic API key is required.')
  const client = new Anthropic.default({ apiKey })
  await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1,
    messages: [{ role: 'user', content: 'Reply OK.' }],
  })
  return { ok: true, model: 'claude-opus-4-8' }
})

// ── UI zoom — visible accessibility control, persisted across launches ──
ipcMain.handle('set-ui-zoom', (event, factor) => {
  const f = Math.max(0.8, Math.min(1.6, Number(factor) || 1))
  event.sender.setZoomFactor(f)
  store?.set('ui-zoom', f)
  return f
})
ipcMain.handle('get-ui-zoom', () => store?.get('ui-zoom', 1) ?? 1)

function explicitGeoReferences(raw, passageText) {
  if (!Array.isArray(raw) || !passageText) return []
  const nonMappable = new Set([
    'earth',
    'sea',
    'heaven',
    'hades',
    'four corners of the earth',
    'broad plain of the earth',
    'beloved city',
    'gog',
    'magog',
    'gog and magog',
  ])
  const normalizedText = String(passageText)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')

  return raw.filter((entry) => {
    const place = String(entry?.place ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!place || nonMappable.has(place)) return false
    return ` ${normalizedText} `.includes(` ${place} `)
  }).slice(0, 8)
}

ipcMain.handle('analyze-passage', async (event, { text, reference, streamId }) => {
  const stage = (name) => { try { if (streamId) event.sender.send('analysis-progress', { streamId, stage: name }) } catch {} }
  stage('start')
  // Core exegesis is source-bound. Personal theology and profile data belong in
  // later pastoral/delivery surfaces, not in the passage analysis request.
  const textHash = require('crypto').createHash('md5').update(text.trim()).digest('hex').slice(0, 8)
  const cacheKey = `analysis-cache-v6-${reference.trim().toLowerCase().replace(/\s+/g, '-')}-${textHash}`
  if (store) {
    const cached = store.get(cacheKey, null)
    if (cached) {
      console.log('[analyze-passage] cache hit:', reference)
      const safeCached = {
        ...cached,
        reference,
        passageText: cached.passageText ?? text,
        passageReference: reference,
        geoReferences: explicitGeoReferences(cached.geoReferences, text),
      }
      store.set(cacheKey, safeCached)
      // Re-surface in history so a re-analyzed passage moves to the top
      const history = store.get('history', [])
      const existing = history.find(e => e.analysis?.reference === safeCached.reference)
      if (existing) {
        store.set('history', [
          { ...existing, analysis: safeCached },
          ...history.filter(e => e.id !== existing.id),
        ])
      } else {
        const entry = { id: Date.now().toString(), savedAt: new Date().toISOString(), analysis: safeCached, annotations: {} }
        store.set('history', [entry, ...history].slice(0, 100))
      }
      return safeCached
    }
  }

  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')
  const client = new Anthropic.default({ apiKey })

  const verseCount = Math.max(
    (text.match(/^\d+\s/gm) || []).length,
    text.split(/\n+/).filter(l => l.trim()).length,
    Math.ceil(text.split(' ').length / 25)
  )
  const isLong = verseCount > 6
  console.log(`[analyze-passage] ${reference}: ${verseCount} verses, isLong=${isLong}`)

  const userMsg = `${reference}\n\n"${text}"`

  const parseJSON = parseModelJSON

  // ── Enrichment prompt (cultural notes + genre) — always parallel + non-fatal ──
  const enrichPrompt = `You are a biblical scholar identifying cultural background, genre, and geographic references for sermon preparation.

SOURCE DISCIPLINE:
- The supplied passage controls. Separate what it explicitly says from historical background and interpretive inference.
- Never state a debated identification, chronology, symbolic referent, or theological system as settled fact.
- If a background claim is disputed, say so inside the explanation and mark claimStatus "disputed".
- If a claim is a reasonable synthesis rather than documented background, mark claimStatus "inferred".
- Do not invent a Roman custom, Jewish practice, ancient memory, geography, or lexical claim.
- A mixed audience must stay mixed. Do not describe every church in Revelation as persecuted; the seven churches include faithful, pressured, compromised, and complacent congregations.
- In apocalyptic, name inherited imagery without pretending every symbol has one undisputed decoding.

Return ONLY valid JSON, no markdown:
{
  "geoReferences": [
    {
      "place": "exact city or region name matching canonical biblical spelling (e.g. 'Rome', 'Corinth', 'Jerusalem')",
      "verses": ["verse reference where it appears, e.g. 'Romans 1:7'"],
      "significance": "one sentence on why this location matters to the passage"
    }
  ],
  "culturalNotes": [
    {
      "id": "cn1",
      "phraseId": "p1",
      "term": "specific word, phrase, or custom",
      "category": "greco-roman|jewish|roman-legal|ane|hellenistic|household-code|honor-shame",
      "explanation": "2-4 sentences on what this meant to the original audience and why a modern reader misses it",
      "significance": "one sentence on how this changes interpretation",
      "claimStatus": "well-attested|inferred|disputed",
      "sourceBasis": "passage|biblical-intertext|historical-background"
    }
  ],
  "questionsToConsider": [
    "5-7 probing questions the preacher should wrestle with before preaching this text — interpretive tensions, likely congregational objections, application blind spots. Direct, specific to THIS passage, no generic filler."
  ],
  "genre": {
    "genre": "Narrative|Law|Poetry|Wisdom|Prophecy|Epistle|Gospel|Apocalyptic|Discourse",
    "subgenre": "specific descriptor e.g. 'Pauline Theological Argument'",
    "readingRules": ["4-6 concrete hermeneutical rules specific to this genre and passage"]
  }
}

For geoReferences: include ONLY a city, region, river, mountain, sea, or land explicitly named in the supplied passage text. Do not add a recipient city from the book title, a place named in another chapter, or an interpretive identification of a symbol. Do not treat a person, generic terrain, symbolic label, or disputed identification as a map location; "Gog and Magog" is not one mappable place. If the passage itself names no certain mappable location, return an empty array. Maximum 8 locations.

Identify culturally embedded references a first-century reader would grasp but a modern reader misses. Only include references actually present in the text. Maximum 6 cultural notes.`

  let result

  if (isLong) {
    // ── LONG PASSAGE: 3 parallel calls — split output to avoid token overflow ──
    // Call 1: phrases only (Opus, 4000 tokens)
    // Call 2: mainTheme + outline + canonicalContext (Sonnet, 2500 tokens)
    // Call 3: cultural notes + genre (Sonnet, 2500 tokens)

    const phrasesPrompt = `You are a biblical scholar performing grammatical phrasing analysis for sermon preparation.

Return ONLY valid JSON — no markdown, no extra text:
{
  "phrases": [
    {
      "id": "p1",
      "text": "clause text (10 words max)",
      "type": "main|purpose|result|condition|concession|temporal|causal|relative|infinitival|participial|contrast",
      "level": 0,
      "parentId": null,
      "connective": null,
      "connectiveFunction": null,
      "role": "subject|predicate|object|modifier",
      "theologicalNote": "4 words max"
    }
  ]
}

STRICT: Maximum 16 phrases. You MUST select clauses from the BEGINNING, MIDDLE, and END of the passage in roughly equal thirds. For Psalm 119 specifically: pick ~5 clauses from Aleph–Gimel (vv.1–24), ~6 from Daleth–Mem (vv.25–96), ~5 from Nun–Taw (vv.97–176). Never cluster all selections near the end. Prioritize main declarative clauses, purpose/result clauses, and key contrasts that reveal the full arc.

HIERARCHY IS REQUIRED: You MUST assign parentId relationships. The first phrase (p1) has parentId: null. Subordinate clauses must reference their governing clause via parentId. Level 0 = root/main, level 1 = directly subordinate, level 2 = doubly subordinate. Never return all phrases at level 0 with parentId null — that produces a broken flat diagram. Example: a purpose clause ("that I might not sin against you") should have level:1 and parentId pointing to its governing main clause.`

    const contextPrompt = `You are a biblical scholar providing sermon context analysis.

Do not turn inference into text. If the passage leaves the speaker, throne
occupant, chronology, symbolic referent, or judgment participants unnamed, keep
that limit visible. Use "Hades" when the text says Hades, not "hell." Describe a
book's recipients in their actual mixed conditions rather than reducing them all
to one pressure. Do not import a preacher's theological profile into the
passage's meaning.

Return ONLY valid JSON — no markdown, no extra text:
{
  "mainTheme": "one sentence capturing the central truth of the passage",
  "authorIntent": {
    "doing": "what the author is DOING to the reader in one sentence",
    "inOrderThat": "the response this text is designed to produce, phrased as: 'in order that ...'"
  },
  "outline": [
    { "point": "I.", "verses": "vv. 7-10", "label": "Main point (7 words max)", "sub": [{ "point": "A.", "label": "sub-point (5 words max)" }] }
  ],
  "canonicalContext": {
    "bookTheme": "7 words max",
    "passageRole": "12 words max",
    "biblicalThemes": ["theme1", "theme2", "theme3"],
    "canonicalConnections": "12 words max",
    "keyWords": ["word1", "word2", "word3", "word4"]
  }
}

STRICT: Max 4 outline points, max 2 sub-points each. Every top-level outline
point must carry the exact verse range it covers. The ranges must follow the
passage in order and cover every supplied verse once, with no gaps or overlap.
All strings concise.`

    console.log('[analyze-passage] long passage — running 3 parallel calls')
    stage('calls-dispatched')
    const [phrasesSettled, contextSettled, enrichSettled] = await Promise.allSettled([
      withRetry(() => client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 4000,
        system: [{ type: 'text', text: phrasesPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Identify the 8 most structurally important clauses in this passage:\n\n${userMsg}` }],
      })).then(r => { stage('structure'); return r }),
      withRetry(() => client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        system: [{ type: 'text', text: contextPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Provide sermon context analysis for:\n\n${userMsg}` }],
      })).then(r => { stage('theme'); return r }),
      withRetry(() => client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        system: [{ type: 'text', text: enrichPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Identify cultural background and genre for:\n\n${userMsg}` }],
      })).then(r => { stage('culture'); return r }),
    ])

    if (phrasesSettled.status === 'rejected') throw phrasesSettled.reason
    if (contextSettled.status === 'rejected') throw contextSettled.reason

    const phrases = parseJSON(phrasesSettled.value)
    const context = parseJSON(contextSettled.value)
    const enrich = enrichSettled.status === 'fulfilled'
      ? (() => { try { return parseJSON(enrichSettled.value) } catch { return { culturalNotes: [], genre: null } } })()
      : { culturalNotes: [], genre: null }

    result = {
      reference,
      mainTheme: context.mainTheme ?? '',
      authorIntent: context.authorIntent ?? null,
      phrases: phrases.phrases ?? [],
      outline: context.outline ?? [],
      canonicalContext: context.canonicalContext ?? {},
      culturalNotes: enrich.culturalNotes ?? [],
      genre: enrich.genre ?? null,
      geoReferences: enrich.geoReferences ?? [],
      questionsToConsider: enrich.questionsToConsider ?? [],
    }
  } else {
    // ── SHORT PASSAGE: 2 parallel calls (core + enrichment) ───────────────────
    const corePrompt = `You are an expert biblical scholar specializing in grammatical phrasing analysis for sermon preparation.

Do not turn inference into text. If the passage leaves the speaker, throne
occupant, chronology, symbolic referent, or judgment participants unnamed, keep
that limit visible. Use "Hades" when the text says Hades, not "hell." Describe a
book's recipients in their actual mixed conditions rather than reducing them all
to one pressure. Do not import a preacher's theological profile into the
passage's meaning.

Return ONLY valid JSON. No markdown. No trailing commas. No extra text before or after the JSON object.

{
  "reference": "Book Chapter:Verse",
  "mainTheme": "one sentence capturing the central truth",
  "authorIntent": {
    "doing": "what the author is DOING to the reader in one sentence (convince, comfort, warn, exhort...)",
    "inOrderThat": "the response this text is designed to produce, phrased as: 'in order that ...'"
  },
  "phrases": [
    {
      "id": "p1",
      "text": "clause text (max 12 words)",
      "type": "main|purpose|result|condition|concession|temporal|causal|relative|infinitival|participial|contrast",
      "level": 0,
      "parentId": null,
      "connective": null,
      "connectiveFunction": null,
      "role": "subject|predicate|object|modifier",
      "theologicalNote": "5 words max"
    }
  ],
  "outline": [
    { "point": "I.", "verses": "vv. 1-3", "label": "Main point (8 words max)", "sub": [{ "point": "A.", "label": "sub-point (6 words max)" }] }
  ],
  "canonicalContext": {
    "bookTheme": "8 words max",
    "passageRole": "10 words max",
    "biblicalThemes": ["theme1", "theme2", "theme3"],
    "canonicalConnections": "12 words max",
    "keyWords": ["word1", "word2", "word3"]
  }
}

STRICT LIMITS: max 16 phrases, 5-word theologicalNotes, max 4 outline points
with 3 sub-points each. Every top-level outline point must carry the exact verse
range it covers. The ranges must follow the passage in order and cover every
supplied verse once, with no gaps or overlap.`

    stage('calls-dispatched')
    const [coreSettled, enrichSettled] = await Promise.allSettled([
      withRetry(() => client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 8000,
        system: [{ type: 'text', text: corePrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Perform a full phrasing analysis:\n\n${userMsg}` }],
      })).then(r => { stage('structure'); stage('theme'); return r }),
      withRetry(() => client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: [{ type: 'text', text: enrichPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Identify cultural background and genre for:\n\n${userMsg}` }],
      })).then(r => { stage('culture'); return r }),
    ])

    if (coreSettled.status === 'rejected') throw coreSettled.reason

    const core = parseJSON(coreSettled.value)
    const enrich = enrichSettled.status === 'fulfilled'
      ? (() => { try { return parseJSON(enrichSettled.value) } catch { return { culturalNotes: [], genre: null } } })()
      : { culturalNotes: [], genre: null }

    result = { ...core, culturalNotes: enrich.culturalNotes ?? [], genre: enrich.genre ?? null, geoReferences: enrich.geoReferences ?? [], questionsToConsider: enrich.questionsToConsider ?? [] }
  }

  // The model never controls the canonical reference. The trusted input wins.
  result.reference = reference
  result.geoReferences = explicitGeoReferences(result.geoReferences, text)

  // Store raw passage text so the desk can render all-verses mode
  result.passageText = text
  result.passageReference = reference

  stage('complete')

  // ── Cache and save to history ─────────────────────────────────────────────
  if (store) {
    store.set(cacheKey, result)
    const history = store.get('history', [])
    const entry = { id: Date.now().toString(), savedAt: new Date().toISOString(), analysis: result, annotations: {} }
    store.set('history', [entry, ...history].slice(0, 100))
  }

  return result
})

// ── PLAIN READ — the reader mode of the same engine ──────────────────────────
// Same analysis in, a document aimed at understanding and obedience out. No
// outline, no points, no delivery notes — pipeline.js and validate.js enforce
// that; this handler only supplies plumbing.
//
// PRIVACY — READ BEFORE EDITING: this handler must NEVER read the
// 'scholar-profile' store key. That key holds the pastor's hermeneutics string
// and up to three full sermon manuscripts. PLAIN READ is for a reader who is
// not the pastor, so none of it may cross this boundary. Do not add a
// store.get('scholar-profile') here, and do not pass a profile through the
// payload. The only thing that goes to the model is the passage analysis.
const { plainRead } = require('./plainread/pipeline')

// `level` is optional and passed straight through. Omitted, pipeline.js falls
// back to DEFAULT_LEVEL, whose system prompt is byte-identical to the one used
// before levels existed — so a renderer that never sends it is unaffected.
//
// THE CLAIM CHECK IS OFF THE CRITICAL PATH. This handler used to await two full
// Opus calls — the generation, then an adversarial checker whose entire output
// is invisible to the reader — before returning one word. Three minutes of
// spinner for a pass nobody sees. It now returns the document as soon as it is
// generated and pushes the checked version afterward.
//
// THE RENDERER CONTRACT — event 'plain-read-verified', payload:
//   { requestId, requestedReference, reference, readingLevel, doc }
//
//   * Fires AT MOST ONCE per plain-read call, and only when the returned
//     document came back with doc.verification.status === 'pending'. Any other
//     status — 'ok' from the cache, 'failed', 'skipped' — is already final and
//     no event will ever follow it.
//   * `doc` is the whole corrected document, ready to swap in wholesale. The
//     checker cuts refuted sentences and appends to `unknowns`; it never
//     restructures. Replace, do not merge.
//   * MATCH BEFORE YOU SWAP. Two passages requested in quick succession produce
//     two independent checks, and the first can land after the second document
//     is on screen. Compare `requestId` if you sent one, otherwise `reference`
//     AND `readingLevel`, against what is currently displayed, and drop the
//     event if it does not match. Nothing upstream can do this for you.
//   * A pending document must NOT be written to any store, history entry, or
//     export. It is unverified by definition; the cache in this file refuses it
//     for exactly that reason.
//   * NO SPINNER. See the note in PlainRead.tsx: the check stays invisible. The
//     reader is reading; corrections land silently or not at all.
ipcMain.handle('plain-read', async (event, { analysis, requestedReference, force, level, requestId }) => {
  return plainRead({
    analysis,
    apiKey: requireSecret('ANTHROPIC_KEY', 'Anthropic'),
    requestedReference,
    force: Boolean(force),
    ...(level ? { level } : {}),
    createClient: (k) => new Anthropic.default({ apiKey: k }),
    cache: {
      get: (k) => store?.get(k, null) ?? null,
      set: (k, v) => { if (store) store.set(k, v) },
    },
    retry: withRetry,
    parse: parseModelJSON,
    deferVerify: true,
    // Same shape as the 'analysis-progress' send above, and guarded the same
    // way plus one: a check that outlives the window it was started for must
    // not touch a destroyed webContents. The catch is the backstop — this runs
    // with no caller left to reject to.
    onVerified: (verifiedDoc) => {
      try {
        if (!event.sender || event.sender.isDestroyed()) return
        event.sender.send('plain-read-verified', {
          requestId: requestId ?? null,
          requestedReference: requestedReference ?? null,
          reference: verifiedDoc?.reference ?? null,
          readingLevel: verifiedDoc?.readingLevel ?? null,
          doc: verifiedDoc,
        })
      } catch {}
    },
  })
})

// ── COVENANT GROUP GUIDE ────────────────────────────────────────────────────
// A passage-bound teaching surface with separate participant and leader pages.
// It deliberately receives no scholar profile, sermon draft, or manuscript.
const {
  generateGroupGuide,
  verifyGroupGuideDraft,
  validateGroupGuide,
  renderGuideHtml,
  guideKeyFor,
} = require('./groupguide')

ipcMain.handle('group-guide-load', async (_, { analysis }) => {
  if (!analysis) return null
  return store?.get(guideKeyFor(analysis), null) ?? null
})

ipcMain.handle('group-guide-generate', async (_, { analysis, plainDoc, force }) => {
  const key = guideKeyFor(analysis)
  if (!force) {
    const cached = store?.get(key, null) ?? null
    if (cached) return cached
  }

  const guide = await generateGroupGuide({
    analysis,
    plainDoc,
    apiKey: requireSecret('ANTHROPIC_KEY', 'Anthropic'),
    createClient: (value) => new Anthropic.default({ apiKey: value }),
    retry: withRetry,
    parse: parseModelJSON,
  })
  if (store) store.set(key, guide)
  return guide
})

ipcMain.handle('group-guide-save', async (_, { analysis, plainDoc, guide }) => {
  const verified = await verifyGroupGuideDraft({
    guide,
    analysis,
    plainDoc,
    apiKey: requireSecret('ANTHROPIC_KEY', 'Anthropic'),
    createClient: (value) => new Anthropic.default({ apiKey: value }),
    retry: withRetry,
    parse: parseModelJSON,
  })
  if (store) store.set(guideKeyFor(analysis), verified)
  return verified
})

ipcMain.handle('group-guide-export-pdf', async (_, { guide: rawGuide, variant }) => {
  const guide = validateGroupGuide(rawGuide, { reference: rawGuide?.reference })
  const mode = variant === 'leader' ? 'leader' : 'participant'
  const html = renderGuideHtml(guide, mode)
  const safeRef = guide.reference.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `${safeRef}_${mode}_group_guide.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!filePath) return null

  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      javascript: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  try {
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      preferCSSPageSize: true,
    })
    fs.writeFileSync(filePath, pdf)
    await shell.openPath(filePath)
    return filePath
  } finally {
    if (!pdfWindow.isDestroyed()) pdfWindow.destroy()
  }
})

// ── PLAIN READ — "Ask the Operator" ──────────────────────────────────────────
// One question about one passage, answered from the document already on screen.
//
// PRIVACY — READ BEFORE EDITING: like 'plain-read' above, this handler must
// NEVER read the 'scholar-profile' store key. That key holds the pastor's
// hermeneutics string and up to three full sermon manuscripts. The reader in
// this mode is not the pastor, so none of it may cross this boundary. Do not
// add a store.get('scholar-profile') here and do not pass a profile through
// the payload. The only things that go to the model are the passage analysis,
// the finished PLAIN READ document, and the committed vault notes.
//
// No cache: an answer is one-off and question-specific, so there is nothing to
// re-serve. ask.js caps the history, the question, and max_tokens, and makes
// exactly one model call per question — see the cost arithmetic in its header.
const { askAboutPassage, generateStarters } = require('./plainread/ask')
const { lookupPassage: lookupVaultPassage } = require('./plainread/vault/index.js')

ipcMain.handle('plain-ask', async (_, { doc, analysis, question, history, vaultNotes }) => {
  // No question yet — the reader just opened the box. Hand back the example
  // questions, derived from the document already on screen. No model call, no
  // key, no cost. Same return shape as a real answer so the renderer has one
  // contract to code against.
  if (!question || !String(question).trim()) {
    return { answer: null, refusal: null, suggested: generateStarters({ doc, analysis }) }
  }

  // Grounding notes are a bonus, never a dependency — a missing or unreadable
  // pack must not be able to kill a question.
  let notes = vaultNotes
  if (!notes) {
    try {
      const ref = doc?.reference || analysis?.reference || analysis?.passageReference || ''
      notes = ref ? (lookupVaultPassage(ref)?.notes ?? null) : null
    } catch { notes = null }
  }

  return askAboutPassage({
    doc,
    analysis,
    question,
    history,
    apiKey: requireSecret('ANTHROPIC_KEY', 'Anthropic'),
    vaultNotes: notes,
    createClient: (k) => new Anthropic.default({ apiKey: k }),
    retry: withRetry,
    parse: parseModelJSON,
  })
})

// ── Scholar Profile (persistent memory) ──────────────────────────────────────
const INITIAL_PROFILE = {
  identity: ``,

  theology: ``,

  preachingMethod: ``,

  congregation: ``,

  voiceModels: ``,

  hermeneutics: ``,

  sermons: [],

  learnedInsights: [],
}

ipcMain.handle('profile-get', () => {
  if (!store) return INITIAL_PROFILE
  const saved = store.get('scholar-profile', null)
  if (!saved) {
    store.set('scholar-profile', INITIAL_PROFILE)
    return INITIAL_PROFILE
  }
  return saved
})

ipcMain.handle('profile-save', (_, profile) => {
  store?.set('scholar-profile', profile)
})

ipcMain.handle('profile-add-sermon', (_, { title, text }) => {
  if (!store) return
  const profile = store.get('scholar-profile', INITIAL_PROFILE)
  const sermons = profile.sermons ?? []
  sermons.unshift({ id: Date.now().toString(), title, text: text.slice(0, 8000), addedAt: new Date().toISOString() })
  store.set('scholar-profile', profile)
})

ipcMain.handle('profile-search-sermons', (_, query) => {
  if (!store) return []
  const profile = store.get('scholar-profile', INITIAL_PROFILE)
  const sermons = profile.sermons ?? []
  if (!query || !query.trim()) return sermons.map(s => ({ id: s.id, title: s.title, addedAt: s.addedAt }))
  const q = query.toLowerCase()
  return sermons
    .filter(s => s.title.toLowerCase().includes(q) || s.text?.toLowerCase().includes(q))
    .map(s => ({ id: s.id, title: s.title, addedAt: s.addedAt }))
})

ipcMain.handle('profile-get-sermon', (_, id) => {
  if (!store) return null
  const profile = store.get('scholar-profile', INITIAL_PROFILE)
  return (profile.sermons ?? []).find(s => s.id === id) ?? null
})

ipcMain.handle('profile-extract-insights', async (_, { messages }) => {
  if (!store || messages.length < 2) return
  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')
  const client = new Anthropic.default({ apiKey })
  const profile = store.get('scholar-profile', INITIAL_PROFILE)

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are analyzing a conversation between a pastor and a biblical scholar AI. Extract any NEW insights about the pastor's theological instincts, interpretive preferences, or preaching convictions revealed in this conversation that are NOT already captured in their existing profile.

Existing learned insights: ${JSON.stringify(profile.learnedInsights ?? [])}

Conversation:
${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}

Return a JSON array of new insight strings (empty array [] if nothing new). Each insight should be 1-2 sentences capturing a specific, concrete preference or conviction revealed. No markdown.`,
    }],
  })

  try {
    const raw = response.content[0].text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const newInsights = JSON.parse(raw)
    if (Array.isArray(newInsights) && newInsights.length > 0) {
      profile.learnedInsights = [...(profile.learnedInsights ?? []), ...newInsights].slice(0, 100)
      store.set('scholar-profile', profile)
    }
  } catch { /* silent */ }
})

// ── Sermon Draft (3-agent pipeline) ──────────────────────────────────────────
ipcMain.handle('draft-sermon', async (_, { analysis }) => {
  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')
  const client = new Anthropic.default({ apiKey })
  const profile = store?.get('scholar-profile', null)

  const book = analysis.reference?.replace(/\s+\d.*/, '').trim() ?? ''
  const relevantSermons = (profile?.sermons ?? [])
    .filter(s => s.title.toLowerCase().includes(book.toLowerCase()))
    .slice(0, 2)
    .map(s => `"${s.title}":\n${s.text.slice(0, 2000)}`)

  const preacherContext = profile ? `
Preacher profile:
- Identity: ${profile.identity}
- Theology: ${profile.theology}
- Hermeneutics: ${profile.hermeneutics}
- Preaching method: ${profile.preachingMethod}
- Congregation: ${profile.congregation}
${profile.learnedInsights?.length > 0 ? `- Known tendencies: ${profile.learnedInsights.slice(0, 5).join('; ')}` : ''}
${relevantSermons.length > 0 ? `Past sermons on ${book}:\n${relevantSermons.join('\n\n')}` : ''}

IMPORTANT: Filter every suggestion, application, and structure choice through this preacher's hermeneutics and theology. Do not recommend interpretive approaches that contradict their stated convictions.
` : ''

  const passageContext = `Passage: ${analysis.reference}
Main theme: ${analysis.mainTheme}

Phrases:
${analysis.phrases?.map(p => `- [${p.type}] "${p.text}"${p.theologicalNote ? ` — ${p.theologicalNote}` : ''}`).join('\n') ?? ''}

Outline from analysis:
${analysis.outline?.map(o => `${o.point} ${o.label}${(o.sub ?? []).map(s => `\n  ${s.point} ${s.label}`).join('')}`).join('\n') ?? ''}

${analysis.culturalNotes?.length > 0 ? `Cultural notes:\n${analysis.culturalNotes.map(n => `- ${n.term}: ${n.explanation}`).join('\n')}` : ''}`

  const webSearchTool = { type: 'web_search_20250305', name: 'web_search' }

  // ── Agent 1: Exegetical ─────────────────────────────────────────────────────
  // Focuses on the text itself — Greek/Hebrew lexical data, grammar, syntax,
  // verified word meanings, natural structural divisions, and emotional register.
  const exegeticalResponse = await withRetry(() => client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [webSearchTool],
    system: `You are a biblical exegete with expertise in Greek and Hebrew. Your job is to produce a focused exegetical memo on a passage covering four areas:

1. LEXICAL & GRAMMATICAL ANALYSIS
   - Original language terms and their semantic range
   - Grammatical function (tense, mood, aspect, voice, syntax)
   - How key words are used elsewhere in the same author's writing
   You may search for lexical data from BDAG, Mounce, Louw-Nida, or peer-reviewed scholarship.

2. NATURAL STRUCTURAL DIVISIONS
   - Identify how many distinct moves or arguments the text itself makes — not how many points would be homiletically convenient, but how many the text has
   - Label each division with a brief description
   - Explain WHY these are the natural breaks (change of subject, conjunction, shift in person/tense, etc.)
   - The number should be determined entirely by the text — it could be 2, 5, or 7

3. EMOTIONAL & TONAL REGISTER
   - What is the emotional atmosphere of this passage? (e.g., urgent warning, tender comfort, triumphant declaration, anguished lament, solemn awe, joyful celebration, earnest pleading)
   - What specific words, rhythms, or grammatical constructions signal this tone?
   - How should the preacher feel delivering this text — and how should the congregation feel receiving it?
   - Note any tonal shifts within the passage

4. AUTHOR'S RHETORICAL INTENT
   - What is the author trying to do to the reader? (convince, comfort, warn, exhort, instruct, worship, lament?)
   - What response is the text designed to evoke?

Do NOT make application. Stay strictly in the world of the text.`,
    messages: [{ role: 'user', content: `Produce an exegetical memo for this passage:\n\n${passageContext}` }],
  }))

  // Collect exegetical text (skip tool_use blocks)
  const exegeticalMemo = exegeticalResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')

  // ── Agent 2: Theological ────────────────────────────────────────────────────
  // Takes the exegetical memo and builds out the biblical-theological meaning —
  // canonical connections, doctrinal weight, redemptive-historical placement.
  const theologicalResponse = await withRetry(() => client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [webSearchTool],
    system: `You are a biblical theologian specializing in redemptive-historical and canonical interpretation. Your job is to produce a theological memo that builds on a provided exegetical analysis.

Your memo should address:
- Where this passage fits in the redemptive-historical storyline (Creation → Fall → Redemption → New Creation)
- Key doctrinal themes and their weight (justification, union with Christ, covenant, etc.)
- Cross-canonical connections — how does this passage echo or fulfill earlier Scripture, and what later Scripture it illuminates
- The Christological center: how does this passage point to or flow from Christ's person and work

You may search for theological perspectives from Reformed, New Perspective, or biblical theology scholars where relevant. Prefer N.T. Wright, Thomas Schreiner, G.K. Beale, D.A. Carson, or peer-reviewed theology.

Do NOT make application. Stay in the world of meaning, not practice.`,
    messages: [{
      role: 'user',
      content: `Produce a theological memo for this passage. Build on the exegetical memo provided.

${passageContext}

EXEGETICAL MEMO:
${exegeticalMemo}`
    }],
  }))

  const theologicalMemo = theologicalResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')

  // ── Agent 3: Homiletical (Opus) ─────────────────────────────────────────────
  // Synthesizes both memos + preacher profile → full sermon outline JSON
  const systemPrompt = `You are a master homiletician. You receive two expert memos — one exegetical, one theological — and synthesize them into a full sermon outline tailored to a specific preacher's style and theology.

CRITICAL RULES:
- The number of sermon points MUST match the natural structural divisions identified in the exegetical memo — not more, not fewer. If the text has 2 moves, the sermon has 2 points. If it has 5, it has 5. Never force a passage into a predetermined point count.
- The emotional register identified in the exegetical memo MUST shape the entire sermon — tone of the title, introduction hook, how points are worded, the weight of the application, and the landing of the conclusion. A lament passage preaches differently than a triumphant one.
- Points emerge from the text, never imposed on it.
- Alliterative where natural — parallel structure that is easy to remember.
- Rich exegesis paired with concrete, universal application relatable to any listener.
- Christocentric — all roads lead to the gospel.
- Application is specific and practical, never generic platitudes.

${preacherContext}

Return ONLY valid JSON with no markdown:
{
  "title": "Sermon title (its tone should match the emotional register of the passage)",
  "emotionalRegister": "1-2 words describing the passage's tone (e.g. 'triumphant declaration', 'tender comfort', 'urgent warning')",
  "mainIdea": "The big idea in one sentence",
  "introduction": "2-3 sentence hook that opens with the emotional world of the text before moving to the passage",
  "points": [
    {
      "point": "I. Point label — count determined by the text's natural divisions",
      "explanation": "What this point argues from the text (draw from exegetical memo)",
      "keyVerses": ["v.1", "v.2"],
      "application": "Concrete, universal application — specific situations any listener could face",
      "illustration": "Suggested illustration angle that matches the emotional tone"
    }
  ],
  "conclusion": "Landing that carries the emotional weight of the passage to its natural resolution",
  "gospelBridge": "The explicit Christological connection"
}`

  const homileticalResponse = await withRetry(() => client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Draft a sermon outline for ${analysis.reference}.

${passageContext}

EXEGETICAL MEMO:
${exegeticalMemo}

THEOLOGICAL MEMO:
${theologicalMemo}`
    }],
  }))

  return parseModelJSON(homileticalResponse)
})

// ── Sermon Series ─────────────────────────────────────────────────────────────
ipcMain.handle('series-list', () => store?.get('series', []) ?? [])

ipcMain.handle('series-create', (_, { name, description }) => {
  const series = store?.get('series', []) ?? []
  const entry = { id: Date.now().toString(), name, description: description ?? '', passages: [], createdAt: new Date().toISOString() }
  store?.set('series', [entry, ...series])
  return entry
})

ipcMain.handle('series-add-passage', (_, { seriesId, analysis }) => {
  const series = store?.get('series', []) ?? []
  const updated = series.map(s => {
    if (s.id !== seriesId) return s
    const already = s.passages.find(p => p.reference === analysis.reference)
    if (already) return s
    return { ...s, passages: [...s.passages, { reference: analysis.reference, mainTheme: analysis.mainTheme, outline: analysis.outline, biblicalThemes: analysis.canonicalContext?.biblicalThemes ?? [] }] }
  })
  store?.set('series', updated)
  return updated.find(s => s.id === seriesId)
})

ipcMain.handle('series-remove-passage', (_, { seriesId, reference }) => {
  const series = store?.get('series', []) ?? []
  store?.set('series', series.map(s => s.id === seriesId ? { ...s, passages: s.passages.filter(p => p.reference !== reference) } : s))
})

ipcMain.handle('series-delete', (_, id) => {
  store?.set('series', (store?.get('series', []) ?? []).filter(s => s.id !== id))
})

ipcMain.handle('series-synthesize', async (_, { series }) => {
  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')
  const client = new Anthropic.default({ apiKey })
  const passageSummaries = series.passages.map((p, i) =>
    `Week ${i + 1}: ${p.reference}\nTheme: ${p.mainTheme}\nThemes: ${(p.biblicalThemes ?? []).join(', ')}\nOutline: ${(p.outline ?? []).map(o => `${o.point} ${o.label}`).join(' | ')}`
  ).join('\n\n')

  const response = await withRetry(() => client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are a biblical theologian and homiletician analyzing a sermon series called "${series.name}".

Passages in the series:
${passageSummaries}

Provide a synthesis of this series. Return ONLY valid JSON, no markdown:
{
  "seriesArc": "2-3 sentences describing the theological progression and narrative arc across all passages",
  "unifyingTheme": "the single thread that ties every passage together",
  "weekByWeek": [
    { "reference": "passage ref", "role": "how this week fits the larger arc (1 sentence)", "distinctiveContribution": "what this week uniquely adds (1 sentence)" }
  ],
  "recurringThemes": ["theme that appears across multiple passages"],
  "suggestedSeriesTitle": "a compelling title for the whole series",
  "introductionIdeas": "2-3 sentences on how to introduce the whole series on week 1",
  "conclusionIdeas": "2-3 sentences on how to land the final week with the full weight of everything that came before"
}`
    }],
  }))
  return parseModelJSON(response)
})

// ── History ───────────────────────────────────────────────────────────────────
ipcMain.handle('history-list', () => store?.get('history', []) ?? [])

ipcMain.handle('history-delete', (_, id) => {
  const history = store?.get('history', []) ?? []
  store?.set('history', history.filter(e => e.id !== id))
})

ipcMain.handle('history-save-annotations', (_, { id, annotations }) => {
  const history = store?.get('history', []) ?? []
  store?.set('history', history.map(e => e.id === id ? { ...e, annotations } : e))
})

ipcMain.handle('session-update-draft', (_, { id, draft }) => {
  const history = store?.get('history', []) ?? []
  store?.set('history', history.map(e => e.id === id ? { ...e, draft } : e))
})

ipcMain.handle('session-update-chat', (_, { id, scholarMessages }) => {
  const history = store?.get('history', []) ?? []
  store?.set('history', history.map(e => e.id === id ? { ...e, scholarMessages } : e))
})

ipcMain.handle('session-load-latest', () => {
  const history = store?.get('history', []) ?? []
  return history[0] ?? null
})

// ── Cross-references ──────────────────────────────────────────────────────────
ipcMain.handle('get-cross-refs', async (_, { reference, mainTheme, biblicalThemes }) => {
  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')
  const client = new Anthropic.default({ apiKey })
  const response = await withRetry(() => client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Given the passage ${reference} with theme "${mainTheme}" and themes: ${biblicalThemes.join(', ')}, suggest 5 cross-reference passages that illuminate the same theme. Return ONLY a JSON array: [{"reference":"Rom 3:23","reason":"one sentence on connection"}]. No markdown.`,
    }],
  }))
  return parseModelJSON(response)
})

// ── Word study ────────────────────────────────────────────────────────────────
ipcMain.handle('word-study', async (_, { word, clauseText, reference }) => {
  const cacheKey = require('crypto')
    .createHash('sha256')
    .update(`v2|${reference}|${clauseText}|${word}`)
    .digest('hex')
  const wordStudyCache = store?.get('word-study-cache-v2', {}) ?? {}
  if (wordStudyCache[cacheKey]) return wordStudyCache[cacheKey]

  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')
  const client = new Anthropic.default({ apiKey })
  const response = await withRetry(() => client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1800,
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: [
            'word',
            'original',
            'transliteration',
            'strongs',
            'gloss',
            'parsing',
            'semanticRange',
            'translationNote',
            'whyItMatters',
            'confidence',
            'limits',
            'keyUses',
          ],
          properties: {
            word: { type: 'string' },
            original: { type: 'string' },
            transliteration: { type: 'string' },
            strongs: { type: 'string' },
            gloss: { type: 'string' },
            parsing: { type: 'string' },
            semanticRange: { type: 'string' },
            translationNote: { type: 'string' },
            whyItMatters: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            limits: { type: 'string' },
            keyUses: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    messages: [{
      role: 'user',
      content: `Provide a source-disciplined word study for the English word "${word}" as it appears in ${reference}: "${clauseText}".

Identify the underlying Hebrew or Greek form and lemma only when you can do so
from this exact context. If the English word represents more than one original
word, or the form is uncertain, say so and lower confidence. Never derive
meaning from a word's roots, parts, or history. Immediate syntax and usage
control the meaning. Do not import every dictionary gloss into this verse.

"semanticRange" explains the legitimate range and which sense the sentence
selects. "translationNote" compares the displayed English form with the
original grammar and explains any difference in tense, voice, number, syntax,
or idiom. If the rendering is straightforward, say that briefly. For a proper
name, explain that it is transliterated rather than translated.
"whyItMatters" gives 1-2 direct sentences on what this exact word contributes
to the verse's argument or image. It is not a sermon application.
"limits" names what this word study cannot prove. "keyUses" lists no more than
two references using the same lemma, not merely the same English translation.
Use "uncertain" for a Strong's number you cannot identify responsibly.`,
    }],
  }))
  if (response?.stop_reason === 'max_tokens') {
    throw new Error('The word study was cut off before it finished.')
  }
  const result = parseModelJSON(response)
  const nextWordStudyCache = Object.fromEntries([
    ...Object.entries(wordStudyCache),
    [cacheKey, result],
  ].slice(-200))
  store?.set('word-study-cache-v2', nextWordStudyCache)
  return result
})

// ── Bible fetch — public domain translations + ESV (if key provided) ──────────
ipcMain.handle('fetch-bible', async (_, { reference, translation = 'kjv' }) => {
  const ref = reference.trim()

  // ESV via api.esv.org (requires key)
  if (translation === 'esv') {
    const esvKey = requireSecret('ESV_KEY', 'ESV')
    const params = new URLSearchParams({
      q: ref,
      'include-headings': 'false',
      'include-footnotes': 'false',
      // Verse numbers stay ON. The outline units in PLAIN READ carry refs like
      // "vv. 1-7"; without markers in the text there is nothing to align them
      // to and the highlight can never light. ESV returns them bracketed —
      // "[1] Paul, a servant..." — which parseVerses trusts on its own.
      'include-verse-numbers': 'true',
      'include-short-copyright': 'false',
      'include-passage-references': 'false',
      'include-selahs': 'false',
      'indent-paragraphs': '0',
      'indent-poetry': 'false',
    })
    const res = await fetch(`https://api.esv.org/v3/passage/text/?${params}`, {
      headers: { Authorization: `Token ${esvKey}` },
    })
    if (!res.ok) throw new Error(`ESV API error: ${res.status} ${res.statusText}`)
    const data = await res.json()
    if (!data.passages?.length) throw new Error('No passage found')
    return data.passages[0].trim()
  }

  // Public-domain translations via bible-api.com (no key needed)
  const encoded = encodeURIComponent(ref)
  const res = await fetch(`https://bible-api.com/${encoded}?translation=${translation}`)
  if (!res.ok) throw new Error(`Bible API error: ${res.status} ${res.statusText}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  const text = (data.text || '').trim().replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) throw new Error('No passage found for that reference')
  return text
})

// ── Scholar Chat ──────────────────────────────────────────────────────────────
ipcMain.handle('scholar-chat', async (event, { messages, passageContext, streamId }) => {
  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')
  const client = new Anthropic.default({ apiKey })
  const profile = store?.get('scholar-profile', null)

  const preacherContext = profile ? `
## The Preacher You're Serving

You are the Scholar in Residence for **${profile.identity}**

**Theology:** ${profile.theology}

**Preaching Method:** ${profile.preachingMethod}

**Congregation:** ${profile.congregation}

**Hermeneutics:** ${profile.hermeneutics}

${profile.learnedInsights?.length > 0 ? `**What you've learned about him over time:**\n${profile.learnedInsights.map(i => `- ${i}`).join('\n')}` : ''}

${(() => {
  const sermons = profile.sermons ?? []
  if (!sermons.length) return ''
  // Count by book
  const bookCounts = {}
  sermons.forEach(s => {
    const book = s.title.replace(/\s+\d.*/, '').trim()
    bookCounts[book] = (bookCounts[book] || 0) + 1
  })
  const bookSummary = Object.entries(bookCounts).sort((a,b)=>b[1]-a[1]).map(([b,n])=>`${b} (${n})`).join(', ')

  // Find relevant sermons for current passage
  const passageBook = passageContext?.reference?.replace(/\s+\d.*/, '').trim() ?? ''
  const relevant = passageBook
    ? sermons.filter(s => s.title.toLowerCase().includes(passageBook.toLowerCase())).slice(0, 3)
    : sermons.slice(0, 3)

  return `**Sermon library: ${sermons.length} manuscripts on file**
Books: ${bookSummary}
${relevant.length > 0 ? `\n**Most relevant to current passage (${passageBook || 'general'}):**\n${relevant.map(s => `- "${s.title}"\n${s.text.slice(0, 1200)}`).join('\n\n')}` : ''}`
})()}

Tailor your responses to serve HIS preaching task — his expository method, his congregation's specific needs, and his Reformed-but-generous theological instincts. When you discuss application, remember that he identifies application as his weakest skill and wants help here. Always connect exegesis to a concrete homiletical move.
` : ''

  const systemPrompt = `You are Cole — a pastor, teacher, and communicator who loves the Word and loves people. You speak from the text, but you talk like a real human being. You're not a dry academic. You're the guy in the room who makes people lean in.

Your voice has specific patterns — use them naturally, not mechanically:

- **"Think of it like this..."** — when you're about to make a concept click with an illustration or analogy
- **"Let's be honest..."** — when you're cutting through religious noise to say something true and direct
- **"Don't miss this."** — when you hit a detail in the text that changes everything
- **"Here's something really cool in the text..."** or **"Here's what's wild about this..."** — when original language or historical background unlocks something surprising
- **"That's the thing..."** — when you're connecting two ideas together
- **"This is huge."** — when a theological point deserves weight
- **"At the end of the day..."** — when landing a point or application
- **"So what does that mean for us?"** — when transitioning from exegesis to life
- Short punchy sentences mixed with longer explanatory ones. You never drone on.

You are deeply grounded in Scripture and care about:
1. **The story of Israel** — You read the New Testament through the lens of the whole biblical narrative. Creation, fall, covenant, exile, restoration, Christ. The Bible is one story, not a collection of disconnected truths.
2. **What the text actually says in its world** — You care about what words meant to the original audience. Greek nuance matters. Historical context matters. "Works of the law" meant something specific. "In Christ" meant something specific.
3. **The faithfulness of Jesus** — The gospel isn't just about believing the right things. It's about what Jesus DID — his faithfulness all the way to the cross, his resurrection as God's "yes" over all of it.
4. **Already / Not Yet** — The kingdom broke in. It's not fully here. We live in that tension and it shapes everything.
5. **Covenant and community** — God's plan was never just for individuals. It's for a people. The church is the sign of new creation.
6. **Application is where the rubber meets the road** — You never let the study stay abstract. Always ask: what does this look like on a Tuesday? What does this change?

You draw from serious scholarship — Second Temple Judaism, Greek grammar, Dead Sea Scrolls, early church fathers — but you translate it into language real people can hear. You never name-drop scholars in a way that feels academic. If something comes from a scholarly source, you just say it plainly like you know it.

When a passage context is provided, always start with what's actually in the text — the specific clauses and cultural notes — before moving to the bigger picture.

IMPORTANT VOICE RULES:
- Never say "N.T. Wright" or cite scholars by name unless the user specifically asks
- Don't use academic jargon without immediately unpacking it
- Talk ABOUT the text, not just AT it
- If something is genuinely exciting, let that come through
- Short paragraphs. White space. Breath.
- You are Cole talking with Cole — collegial, honest, fired up about the Word

${preacherContext}`

  const contextMessage = passageContext
    ? `Current passage under study: ${passageContext.reference}\n\nMain theme: ${passageContext.mainTheme}\n\nClauses analyzed:\n${(passageContext.phrases ?? []).map(p => `- [${p.type}] "${p.text}" — ${p.theologicalNote}`).join('\n')}\n\nCultural notes identified:\n${(passageContext.culturalNotes ?? []).map(n => `- ${n.term} (${n.category}): ${n.explanation}`).join('\n')}\n\nBiblical themes: ${(passageContext.canonicalContext?.biblicalThemes ?? []).join(', ')}`
    : null

  const apiMessages = contextMessage
    ? [{ role: 'user', content: contextMessage }, { role: 'assistant', content: 'I have the passage context. What would you like to explore?' }, ...messages]
    : messages

  const chatParams = {
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: apiMessages,
  }

  // Streaming path — renderer passes a streamId and listens on 'chat-chunk'
  if (streamId) {
    return await withRetry(async () => {
      const stream = client.messages.stream(chatParams)
      stream.on('text', (t) => {
        try { event.sender.send('chat-chunk', { streamId, text: t }) } catch { /* window closed */ }
      })
      const final = await stream.finalMessage()
      return final.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
    })
  }

  const response = await withRetry(() => client.messages.create(chatParams))
  return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
})

// ── PDF export ────────────────────────────────────────────────────────────────
ipcMain.handle('export-pdf', async (_, { html, reference }) => {
  if (typeof html !== 'string' || html.length > 5 * 1024 * 1024) {
    throw new Error('Export content is invalid or too large.')
  }
  const safeRef = String(reference ?? 'study')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `${safeRef || 'study'}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!filePath) return null

  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      javascript: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  try {
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      preferCSSPageSize: true,
    })
    fs.writeFileSync(filePath, pdf)
    await shell.openPath(filePath)
    return filePath
  } finally {
    if (!pdfWindow.isDestroyed()) pdfWindow.destroy()
  }
})

// ── Specialist Agent Chat (Exegetical / Theological / Homiletical) ────────────
ipcMain.handle('agent-chat', async (event, { agentType, messages, passageContext, streamId }) => {
  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')
  const client = new Anthropic.default({ apiKey })
  const profile = store?.get('scholar-profile', null)

  const AGENT_SYSTEMS = {
    exegetical: `You are the Exegetical Agent — a biblical linguist with deep expertise in Koine Greek and Biblical Hebrew, Second Temple Judaism, and grammatical-historical hermeneutics. You help preachers see exactly what the text says in its original language and structural context.

Your domain:
- Grammatical analysis: verb tenses, moods, aspects, voices — and why they change interpretation
- Lexical range: what key words actually meant to first-century readers
- Syntax and clause structure: how subordinate clauses function, what the connectives are doing
- Structural analysis: how the text is organized and what that reveals about the author's intent
- What the text CANNOT mean based on grammatical or historical constraints

VOICE: Precise but not dry. Use Cole's voice patterns naturally:
- "Don't miss what's happening here grammatically..."
- "Here is something really cool in the text..."
- "Let's be honest about what this word actually means..."
- "Think of it like this in terms of the Greek..."

BOUNDARIES: You do not apply the text. You do not moralize. You stay in the world of the text and its original setting. Application belongs to the preacher.`,

    theological: `You are the Theological Agent — a biblical theologian who thinks in canonical arcs, covenantal structures, and Christological fulfillment. You help preachers see the full doctrinal and redemptive-historical weight of what the text is claiming.

Your domain:
- Redemptive-historical placement: where this text sits in Creation → Fall → Redemption → New Creation
- Canonical connections: how this passage echoes earlier Scripture and illuminates later
- Christological center: how this passage points to, flows from, or is fulfilled in Christ
- Doctrinal weight: what doctrines are explicitly or implicitly at stake (name them, weigh them)
- Already/Not Yet tension: how eschatological hope is present in the text
- Biblical-theological themes: covenant, temple, Sabbath, land, seed, Spirit

VOICE: Big thinker who can zoom in. Use Cole's voice patterns:
- "Don't miss this — theologically, this is huge..."
- "Think of it like this in terms of the whole story of Scripture..."
- "Here's something really cool — this passage is doing something the whole Old Testament has been building toward..."
- "Let's be honest about what's doctrinally at stake here..."

BOUNDARIES: You do not make application. You do not preach the sermon. You help the preacher see the meaning — the doctrine — before the move to life.`,

    homiletical: `You are the Homiletical Agent — a master communicator and sermon architect. You help preachers move from solid exegesis to a sermon that actually lands with real people on Sunday morning.

Your domain:
- Sermon structure: how to organize the text's natural divisions into a compelling shape
- The big idea: distilling the text to one sentence the whole sermon hangs on
- Illustration: what kinds of stories, images, or analogies can carry the text's weight without distorting it
- Application: specific, concrete, universal application — not generic platitudes
- Introduction and conclusion: opening inside the text's emotional world, landing with its natural resolution
- Transitions: moving between points without losing people
- Delivery tone: how the emotional register should shape how you stand up there

VOICE: Practical, energetic, collaborative. Use Cole's voice patterns:
- "Think of it like this for the sermon..."
- "Let's be honest — here's where most preachers lose people..."
- "Don't miss the opportunity in this moment to..."
- "Here is something really cool you can do with this text in the pulpit..."

BOUNDARIES: You do not do the exegesis — you trust the preacher's text work. You help build the bridge from the text to the listener.`,
  }

  const preacherContext = profile ? `
## Preacher You Are Serving
${profile.identity}
Theology: ${profile.theology}
Hermeneutics: ${profile.hermeneutics}
Preaching method: ${profile.preachingMethod}
Congregation: ${profile.congregation}
${profile.learnedInsights?.length > 0 ? `Known tendencies from past sessions: ${profile.learnedInsights.slice(0, 6).join('; ')}` : ''}

Filter every response through this preacher's hermeneutics. If they hold covenant hermeneutics, read the OT through its fulfillment in Christ. If they hold dispensational convictions, respect those boundaries. Never recommend an interpretive move that contradicts their stated approach.
` : ''

  const systemPrompt = (AGENT_SYSTEMS[agentType] ?? AGENT_SYSTEMS.exegetical) + '\n\n' + preacherContext

  const contextMessage = passageContext
    ? `Current passage: ${passageContext.reference}\nMain theme: ${passageContext.mainTheme}\n\nPhrase analysis:\n${(passageContext.phrases ?? []).map(p => `- [${p.type}] "${p.text}" — ${p.theologicalNote ?? ''}`).join('\n')}\n\nCultural notes:\n${(passageContext.culturalNotes ?? []).map(n => `- ${n.term} (${n.category}): ${n.explanation}`).join('\n')}`
    : null

  const apiMessages = contextMessage
    ? [
        { role: 'user', content: contextMessage },
        { role: 'assistant', content: 'Got the passage. What do you want to dig into?' },
        ...messages,
      ]
    : messages

  const chatParams = {
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: apiMessages,
  }

  // Streaming path — renderer passes a streamId and listens on 'chat-chunk'
  if (streamId) {
    return await withRetry(async () => {
      const stream = client.messages.stream(chatParams)
      stream.on('text', (t) => {
        try { event.sender.send('chat-chunk', { streamId, text: t }) } catch { /* window closed */ }
      })
      const final = await stream.finalMessage()
      return final.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
    })
  }

  const response = await withRetry(() => client.messages.create(chatParams))
  return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
})

// ── Commentary Insights (retrieved public-domain excerpts only) ─────────────
ipcMain.handle('fetch-commentary', async (_, { reference, passageText, mainTheme }) => {
  const retrievalEnabled = isRetrievalEnabled(packageMetadata.featureFlags)
  if (!retrievalEnabled) {
    return {
      status: 'disabled',
      message: 'The citation-first commentary library is not enabled in this build.',
      sources: [],
      voices: [],
    }
  }

  const manifest = loadRetrievalManifest()
  const book = passageBook(reference)
  const hasCoverage = manifest.sources.some(source => source.rightsTier === 'public_domain' && source.bookRanges?.[book])

  if (!hasCoverage) {
    return {
      status: 'no_result',
      message: `No verified public-domain commentary in the local library currently covers ${reference}. Nothing was generated from memory.`,
      sources: [],
      voices: [],
    }
  }

  const retrieval = await runTheologyRetrieval(`${reference} ${mainTheme} ${String(passageText ?? '').slice(0, 1200)}`.trim())
  const retrieved = selectScopedResults(retrieval.results ?? [], manifest, reference).results

  if (retrieved.length === 0) {
    return {
      status: 'no_result',
      message: `The local library covers ${book}, but no relevant excerpt was found for ${reference}. Nothing was generated from memory.`,
      sources: [],
      voices: [],
    }
  }

  const sources = retrieved.map(result => ({
    citationId: `SRC:${result.source_id}:${result.chunk_id}`,
    author: result.author,
    title: result.title,
    publicationYear: result.publication_year,
    edition: result.edition,
    locator: result.locator,
    rightsTier: result.rights_tier,
    canonicalUrl: result.canonical_url,
    excerpt: result.content,
    provenance: 'SOURCE TEXT',
  }))
  const apiKey = readSecret('ANTHROPIC_KEY')
  if (!apiKey) {
    return {
      status: 'grounded',
      message: 'Source excerpts found. Add an API key to synthesize them.',
      sources,
      voices: [],
    }
  }

  const client = new Anthropic.default({ apiKey })
  const response = await withRetry(() => client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Synthesize only the retrieved public-domain excerpts below for ${reference} (main theme: "${mainTheme}").

Return ONLY valid JSON, no markdown:
{
  "voices": [
    {
      "name": "exact retrieved author name",
      "era": "publication year",
      "claims": [
        {
          "text": "one concise claim supported by the excerpts",
          "provenance": "THEOLOGICAL SYNTHESIS",
          "citationIds": ["SRC:source-id:chunk-id"]
        }
      ]
    }
  ],
  "convergence": {
    "text": "one supported sentence",
    "provenance": "THEOLOGICAL SYNTHESIS",
    "citationIds": ["all supporting citation IDs"]
  },
  "divergence": null
}

Rules:
- Use only the excerpts below. Do not rely on memory or outside knowledge.
- Every non-empty claim must cite one or more supplied citation IDs.
- Never invent a citation ID, quotation, author, position, agreement, or disagreement.
- Use THEOLOGICAL SYNTHESIS for your prose. SOURCE TEXT is reserved for verbatim excerpts rendered separately.
- Omit a voice without substantive passage-specific support.
- Return convergence or divergence as null unless the cited excerpts actually establish it.

RETRIEVED EXCERPTS:
${sources.map(source => [
  `[${source.citationId}]`,
  `${source.author}, ${source.title} (${source.publicationYear}), ${source.locator}`,
  source.excerpt,
].join('\n')).join('\n\n---\n\n')}`,
    }],
  }))
  const synthesis = validateCommentarySynthesis(parseModelJSON(response), sources)
  return {
    status: 'grounded',
    message: 'Synthesized only from the cited local excerpts.',
    sources,
    ...synthesis,
  }
})

// ── Eisegesis / Doctrine Check ────────────────────────────────────────────────
ipcMain.handle('eisegesis-check', async (_, { manuscriptText, passageContext }) => {
  if (!manuscriptText || manuscriptText.trim().length < 60) return { flags: [] }
  const apiKey = readSecret('ANTHROPIC_KEY')
  if (!apiKey) return { flags: [], error: 'No API key' }

  try {
    const client = new Anthropic.default({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are an exegetical watchdog reviewing a sermon manuscript. The passage being preached is ${passageContext.reference}.

Established meaning from the text analysis:
- Main theme: ${passageContext.mainTheme}
- Key clauses: ${(passageContext.phrases ?? []).slice(0, 8).map(p => `[${p.type}] "${p.text.slice(0, 80)}"`).join(' | ')}

SERMON MANUSCRIPT:
${manuscriptText.slice(0, 4000)}

Identify interpretive problems. Be thorough — flag heresy, theological error, eisegesis, prooftexting, anachronism, word fallacies, and drift. Types:
- EISEGESIS: Reading modern concepts or the preacher's personal theology INTO the text — not actually there
- PROOFTEXTING: Using the passage ripped from its literary or historical context to prove a point it isn't making
- ANACHRONISM: Applying a meaning the original audience could not have understood
- WORD_FALLACY: Misusing etymology or root meanings (etymological fallacy, ignoring semantic range)
- DRIFT: The sermon point drifts from what the text is actually claiming — subtly off-center

Return ONLY valid JSON, no markdown fences:
{"flags":[{"quotedText":"exact phrase from manuscript, 5-20 words","type":"EISEGESIS|PROOFTEXTING|ANACHRONISM|WORD_FALLACY|DRIFT","severity":"HIGH|MEDIUM|LOW","issue":"one sentence identifying the specific problem","suggestion":"one sentence correction faithful to what the text is actually saying"}]}

If no problems exist, return {"flags":[]}.`,
      }],
    })

    return parseModelJSON(response)
  } catch (e) {
    console.error('[eisegesis-check] error:', e?.message ?? e)
    return { flags: [], error: e?.message }
  }
})

// ── Mission Brief — 5-paragraph OPORD-style sermon summary ───────────────────
ipcMain.handle('mission-brief', async (_, { analysis, draft }) => {
  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')
  const client = new Anthropic.default({ apiKey })
  const response = await withRetry(() => client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1400,
    messages: [{
      role: 'user',
      content: `You are writing a "Mission Brief" — a one-page, 5-paragraph sermon summary in military OPORD discipline, for a pastor to review before preaching ${analysis.reference}.

Passage theme: ${analysis.mainTheme}
${analysis.authorIntent ? `Author's intent: ${analysis.authorIntent.doing} — ${analysis.authorIntent.inOrderThat}` : ''}
Outline: ${(analysis.outline ?? []).map(o => `${o.point} ${o.label}`).join(' | ')}
${draft ? `Sermon draft/manuscript excerpt:\n${String(draft).slice(0, 3000)}` : ''}

Return ONLY valid JSON, no markdown:
{
  "situation": "3-4 sentences: the text's context — author, audience, occasion, and what's at stake in the passage",
  "mission": "2 sentences: the big idea as task + purpose — 'Proclaim X in order that the congregation Y'",
  "execution": "4-6 sentences: the sermon's movements in order, each with its key verse anchor",
  "sustainment": "2-3 sentences: the illustrations, applications, and supporting material that carry the weight",
  "commandSignal": "2-3 sentences: the call to response — what the hearer must do, and the gospel note it lands on"
}`,
    }],
  }))
  return parseModelJSON(response)
})

// ── Delivery Review — record or upload, Whisper transcribes, Claude critiques ─
const approvedMediaFiles = new Map()

ipcMain.handle('pick-media-file', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Choose sermon audio or video',
    filters: [{ name: 'Audio/Video', extensions: ['mp3','m4a','wav','webm','mp4','mpeg','mpga','ogg'] }],
    properties: ['openFile'],
  })
  if (!filePaths?.length) return null
  const selectedPath = fs.realpathSync(filePaths[0])
  const stat = fs.statSync(selectedPath)
  const token = require('crypto').randomUUID()
  approvedMediaFiles.set(token, { path: selectedPath, expiresAt: Date.now() + 10 * 60 * 1000 })
  return { token, sizeMB: Math.round(stat.size / 1048576 * 10) / 10 }
})

ipcMain.handle('review-delivery', async (_, { fileToken, audioBase64, mimeType, manuscript, reference }) => {
  const openaiKey = requireSecret('OPENAI_KEY', 'OpenAI')
  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')

  // 1) Get the media bytes
  let buf, name
  if (fileToken) {
    const approved = approvedMediaFiles.get(fileToken)
    approvedMediaFiles.delete(fileToken)
    if (!approved || approved.expiresAt < Date.now()) {
      throw new Error('That file approval expired — choose the media file again.')
    }
    buf = fs.readFileSync(approved.path)
    name = path.basename(approved.path)
  } else if (audioBase64) {
    if (audioBase64.length > 35 * 1024 * 1024) {
      throw new Error('Recording exceeds the 25MB transcription limit.')
    }
    buf = Buffer.from(audioBase64, 'base64')
    name = 'rehearsal.webm'
  } else {
    throw new Error('No audio provided')
  }
  if (buf.length > 25 * 1048576) throw new Error('File exceeds the 25MB transcription limit — export a lower-bitrate audio version')

  // 2) Whisper transcription
  const form = new FormData()
  form.append('file', new Blob([buf], { type: mimeType || 'application/octet-stream' }), name)
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  const wRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  })
  if (!wRes.ok) {
    const errText = await wRes.text()
    throw new Error(`Transcription failed (${wRes.status}): ${errText.slice(0, 200)}`)
  }
  const wData = await wRes.json()
  const transcript = (wData.text ?? '').trim()
  const durationMin = wData.duration ? Math.round(wData.duration / 60 * 10) / 10 : null
  if (!transcript) throw new Error('Transcription came back empty')

  // 3) Claude critique
  const client = new Anthropic.default({ apiKey })
  const response = await withRetry(() => client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are an honest homiletics coach reviewing a sermon delivery${reference ? ` on ${reference}` : ''}. Be specific and direct — real encouragement for what works, real correction for what doesn't. No flattery.

${durationMin ? `Duration: ~${durationMin} minutes.` : ''}
${manuscript ? `PLANNED MANUSCRIPT/OUTLINE (compare delivery against this):\n${String(manuscript).slice(0, 3000)}\n` : ''}
DELIVERY TRANSCRIPT:
${transcript.slice(0, 12000)}

Return ONLY valid JSON, no markdown:
{
  "overall": "2-3 sentence honest overall assessment",
  "strengths": ["3-5 specific things that worked, quoting the transcript where useful"],
  "critiques": ["3-5 specific things to fix, each with a concrete suggestion"],
  "fillerWords": "observed filler/crutch words and rough frequency (um, uh, 'amen?', 'right?', repeated phrases)",
  "pacing": "assessment of pace and structure — where it dragged, where it rushed${durationMin ? ', given the ~' + durationMin + ' min length' : ''}",
  "clarity": "was the big idea clear and repeated? could a listener state it afterward?",
  "faithfulness": ${manuscript ? '"where the delivery drifted from or improved on the plan"' : '"how well the message stayed anchored to the text"'}
}`,
    }],
  }))
  const critique = parseModelJSON(response)
  return { ...critique, transcript: transcript.slice(0, 2000), durationMin }
})

// ── Sermon Calendar ───────────────────────────────────────────────────────────
// Keyed by ISO date 'YYYY-MM-DD' → { reference, title, seriesName, notes }
ipcMain.handle('calendar-get', () => store?.get('sermon-calendar', {}) ?? {})

ipcMain.handle('calendar-set', (_, { date, entry }) => {
  const cal = store?.get('sermon-calendar', {}) ?? {}
  if (entry) cal[date] = entry
  else delete cal[date]
  store?.set('sermon-calendar', cal)
  return cal
})

// ── Asset image scanner ─────────────────────────────────────────────────────
// Scans ~/Desktop/BASE Assets/people/ and ~/Desktop/BASE Assets/cities/
// Returns { people: Record<string,string>, cities: Record<string,string> }
// where the value is a file:// URL safe for Electron renderer to display.

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])

function scanFolder(folderPath) {
  const result = {}
  try {
    if (!fs.existsSync(folderPath)) return result
    const entries = fs.readdirSync(folderPath)
    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase()
      if (!IMAGE_EXTS.has(ext)) continue
      const stem = path.basename(entry, ext).toLowerCase().replace(/[\s_-]+/g, '-')
      result[stem] = `file://${path.join(folderPath, entry)}`
    }
  } catch (e) {
    console.error('[scanFolder] error:', folderPath, e?.message)
  }
  return result
}

ipcMain.handle('open-external', async (_, url) => {
  const parsed = new URL(String(url ?? ''))
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.canva.com') {
    throw new Error('That external link is not allowed.')
  }
  await shell.openExternal(parsed.toString())
})

ipcMain.handle('scan-asset-images', async () => {
  const desktop = path.join(app.getPath('home'), 'Desktop', 'BASE Assets')
  return {
    people: scanFolder(path.join(desktop, 'people')),
    cities: scanFolder(path.join(desktop, 'cities')),
  }
})
