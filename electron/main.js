const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const isDev = process.env.NODE_ENV === 'development'

// Auto-updater (only in production)
let autoUpdater
if (!isDev) {
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'A new version of BASE 1520 has been downloaded. It will install when you restart the app.',
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
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
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

ipcMain.handle('analyze-passage', async (event, { text, reference, apiKey }) => {
  console.log('[analyze-passage] key received, length:', apiKey?.length, 'prefix:', apiKey?.slice(0,12))
  // Load preacher profile first — used for cache key and prompt injection
  const analysisProfile = store?.get('scholar-profile', null)
  const hermeneuticsNote = analysisProfile?.hermeneutics
    ? `\n\nPreacher hermeneutics (filter all interpretation through this): ${analysisProfile.hermeneutics}`
    : ''
  const theologyNote = analysisProfile?.theology
    ? `\nPreacher theology: ${analysisProfile.theology}`
    : ''

  // ── Cache check — keyed on passage + hermeneutics so profile changes bust cache ──
  const profileVersion = analysisProfile?.hermeneutics ? analysisProfile.hermeneutics.slice(0, 16).replace(/\s+/g, '-') : 'no-profile'
  const textHash = require('crypto').createHash('md5').update(text.trim()).digest('hex').slice(0, 8)
  const cacheKey = `analysis-cache-v2-${profileVersion}-${reference.trim().toLowerCase().replace(/\s+/g, '-')}-${textHash}`
  if (store) {
    const cached = store.get(cacheKey, null)
    if (cached) {
      console.log('[analyze-passage] cache hit:', reference)
      return cached
    }
  }

  const client = new Anthropic.default({ apiKey })

  const verseCount = Math.max(
    (text.match(/^\d+\s/gm) || []).length,
    text.split(/\n+/).filter(l => l.trim()).length,
    Math.ceil(text.split(' ').length / 25)
  )
  const isLong = verseCount > 6
  console.log(`[analyze-passage] ${reference}: ${verseCount} verses, isLong=${isLong}`)

  const userMsg = `${reference}\n\n"${text}"`

  const parseJSON = (res) => {
    const rawText = res.content[0].text
    let raw = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) raw = raw.slice(start, end + 1)
    raw = raw.replace(/,(\s*[}\]])/g, '$1')
    try { return JSON.parse(raw) }
    catch (e) {
      console.error('[parseJSON] failed:', e.message, '| excerpt:', raw.slice(Math.max(0, raw.length - 300)))
      throw e
    }
  }

  // ── Enrichment prompt (cultural notes + genre) — always parallel + non-fatal ──
  const enrichPrompt = `You are a biblical scholar identifying cultural background and genre for sermon preparation.

Return ONLY valid JSON, no markdown:
{
  "culturalNotes": [
    {
      "id": "cn1",
      "phraseId": "p1",
      "term": "specific word, phrase, or custom",
      "category": "greco-roman|jewish|roman-legal|ane|hellenistic|household-code|honor-shame",
      "explanation": "2-4 sentences on what this meant to the original audience and why a modern reader misses it",
      "significance": "one sentence on how this changes interpretation"
    }
  ],
  "genre": {
    "genre": "Narrative|Law|Poetry|Wisdom|Prophecy|Epistle|Gospel|Apocalyptic|Discourse",
    "subgenre": "specific descriptor e.g. 'Pauline Theological Argument'",
    "readingRules": ["4-6 concrete hermeneutical rules specific to this genre and passage"]
  }
}

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

Return ONLY valid JSON — no markdown, no extra text:
{
  "mainTheme": "one sentence capturing the central truth of the passage",
  "outline": [
    { "point": "I.", "label": "Main point (7 words max)", "sub": [{ "point": "A.", "label": "sub-point (5 words max)" }] }
  ],
  "canonicalContext": {
    "bookTheme": "7 words max",
    "passageRole": "12 words max",
    "biblicalThemes": ["theme1", "theme2", "theme3"],
    "canonicalConnections": "12 words max",
    "keyWords": ["word1", "word2", "word3", "word4"]
  }
}

STRICT: Max 4 outline points, max 2 sub-points each. All strings concise.${hermeneuticsNote}${theologyNote}`

    console.log('[analyze-passage] long passage — running 3 parallel calls')
    const [phrasesSettled, contextSettled, enrichSettled] = await Promise.allSettled([
      withRetry(() => client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 4000,
        system: phrasesPrompt,
        messages: [{ role: 'user', content: `Identify the 8 most structurally important clauses in this passage:\n\n${userMsg}` }],
      })),
      withRetry(() => client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        system: contextPrompt,
        messages: [{ role: 'user', content: `Provide sermon context analysis for:\n\n${userMsg}` }],
      })),
      withRetry(() => client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        system: enrichPrompt,
        messages: [{ role: 'user', content: `Identify cultural background and genre for:\n\n${userMsg}` }],
      })),
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
      phrases: phrases.phrases ?? [],
      outline: context.outline ?? [],
      canonicalContext: context.canonicalContext ?? {},
      culturalNotes: enrich.culturalNotes ?? [],
      genre: enrich.genre ?? null,
    }
  } else {
    // ── SHORT PASSAGE: 2 parallel calls (core + enrichment) ───────────────────
    const corePrompt = `You are an expert biblical scholar specializing in grammatical phrasing analysis for sermon preparation.

Return ONLY valid JSON. No markdown. No trailing commas. No extra text before or after the JSON object.

{
  "reference": "Book Chapter:Verse",
  "mainTheme": "one sentence capturing the central truth",
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
    { "point": "I.", "label": "Main point (8 words max)", "sub": [{ "point": "A.", "label": "sub-point (6 words max)" }] }
  ],
  "canonicalContext": {
    "bookTheme": "8 words max",
    "passageRole": "10 words max",
    "biblicalThemes": ["theme1", "theme2", "theme3"],
    "canonicalConnections": "12 words max",
    "keyWords": ["word1", "word2", "word3"]
  }
}

STRICT LIMITS: max 16 phrases, 5-word theologicalNotes, max 4 outline points with 3 sub-points each.${hermeneuticsNote}${theologyNote}`

    const [coreSettled, enrichSettled] = await Promise.allSettled([
      withRetry(() => client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 8000,
        system: corePrompt,
        messages: [{ role: 'user', content: `Perform a full phrasing analysis:\n\n${userMsg}` }],
      })),
      withRetry(() => client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: enrichPrompt,
        messages: [{ role: 'user', content: `Identify cultural background and genre for:\n\n${userMsg}` }],
      })),
    ])

    if (coreSettled.status === 'rejected') throw coreSettled.reason

    const core = parseJSON(coreSettled.value)
    const enrich = enrichSettled.status === 'fulfilled'
      ? (() => { try { return parseJSON(enrichSettled.value) } catch { return { culturalNotes: [], genre: null } } })()
      : { culturalNotes: [], genre: null }

    result = { ...core, culturalNotes: enrich.culturalNotes ?? [], genre: enrich.genre ?? null }
  }

  // Store raw passage text so the desk can render all-verses mode
  result.passageText = text
  result.passageReference = reference

  // ── Cache and save to history ─────────────────────────────────────────────
  if (store) {
    store.set(cacheKey, result)
    const history = store.get('history', [])
    const entry = { id: Date.now().toString(), savedAt: new Date().toISOString(), analysis: result, annotations: {} }
    store.set('history', [entry, ...history].slice(0, 100))
  }

  return result
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

ipcMain.handle('profile-extract-insights', async (_, { messages, apiKey }) => {
  if (!store || messages.length < 2) return
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
ipcMain.handle('draft-sermon', async (_, { analysis, apiKey }) => {
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
  const exegeticalResponse = await client.messages.create({
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
  })

  // Collect exegetical text (skip tool_use blocks)
  const exegeticalMemo = exegeticalResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')

  // ── Agent 2: Theological ────────────────────────────────────────────────────
  // Takes the exegetical memo and builds out the biblical-theological meaning —
  // canonical connections, doctrinal weight, redemptive-historical placement.
  const theologicalResponse = await client.messages.create({
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
  })

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

  const homileticalResponse = await client.messages.create({
    // Sonnet, not Opus: this agent synthesizes the two memos above into a
    // draft — it writes from already-verified exegesis/theology rather than
    // generating new factual claims, so the accuracy-critical work is upstream.
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Draft a sermon outline for ${analysis.reference}.

${passageContext}

EXEGETICAL MEMO:
${exegeticalMemo}

THEOLOGICAL MEMO:
${theologicalMemo}`
    }],
  })

  const raw = homileticalResponse.content[0].text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  return JSON.parse(raw)
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

ipcMain.handle('series-synthesize', async (_, { series, apiKey }) => {
  const client = new Anthropic.default({ apiKey })
  const passageSummaries = series.passages.map((p, i) =>
    `Week ${i + 1}: ${p.reference}\nTheme: ${p.mainTheme}\nThemes: ${(p.biblicalThemes ?? []).join(', ')}\nOutline: ${(p.outline ?? []).map(o => `${o.point} ${o.label}`).join(' | ')}`
  ).join('\n\n')

  const response = await client.messages.create({
    // Sonnet: this reworks already-analyzed passages into a series synthesis,
    // so it's grounded in verified content rather than generating new facts.
    model: 'claude-sonnet-4-6',
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
  })
  const raw = response.content[0].text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}')
  return JSON.parse(start !== -1 && end > start ? raw.slice(start, end + 1) : raw)
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
ipcMain.handle('get-cross-refs', async (_, { reference, mainTheme, biblicalThemes, apiKey }) => {
  const client = new Anthropic.default({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Given the passage ${reference} with theme "${mainTheme}" and themes: ${biblicalThemes.join(', ')}, suggest 5 cross-reference passages that illuminate the same theme. Return ONLY a JSON array: [{"reference":"Rom 3:23","reason":"one sentence on connection"}]. No markdown.`,
    }],
  })
  const raw = response.content[0].text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(raw)
})

// ── Word study ────────────────────────────────────────────────────────────────
ipcMain.handle('word-study', async (_, { word, clauseText, reference, apiKey }) => {
  const client = new Anthropic.default({ apiKey })
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Provide a concise word study for the word "${word}" as it appears in ${reference}: "${clauseText}". Return ONLY JSON: {"word":"${word}","original":"Greek or Hebrew word","transliteration":"romanized","strongs":"G#### or H####","gloss":"short definition","parsing":"grammatical parsing if verb/noun","semanticRange":"2-3 sentence note on the word's range of meaning in its biblical context","keyUses":["1-2 other key passages using this word"]}. No markdown.`,
    }],
  })
  const raw = response.content[0].text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(raw)
})

// ── ESV Bible API ─────────────────────────────────────────────────────────────
ipcMain.handle('fetch-esv', async (_, { reference, esvKey }) => {
  const params = new URLSearchParams({
    q: reference,
    'include-headings': 'false',
    'include-footnotes': 'false',
    'include-verse-numbers': 'false',
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
  const passages = data.passages
  if (!passages || passages.length === 0) throw new Error('No passage found for that reference')
  return passages[0].trim()
})

// ── Scholar Chat ──────────────────────────────────────────────────────────────
ipcMain.handle('scholar-chat', async (_, { messages, passageContext, apiKey }) => {
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

  // Cache the passage-context prefix (breakpoint on the assistant ack) so every
  // follow-up turn in the same conversation reuses it at ~10% of input cost.
  const apiMessages = contextMessage
    ? [
        { role: 'user', content: contextMessage },
        { role: 'assistant', content: [{ type: 'text', text: 'I have the passage context. What would you like to explore?', cache_control: { type: 'ephemeral' } }] },
        ...messages,
      ]
    : messages

  const response = await client.messages.create({
    // Sonnet: conversational Q&A where the preacher is in the loop and can
    // push back — the accuracy-critical fact generation happens in analysis.
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    // Cache the large static persona/system prompt — same content every turn.
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: apiMessages,
  })

  return response.content[0].text
})

// ── PDF export ────────────────────────────────────────────────────────────────
ipcMain.handle('export-pdf', async (_, { html, reference }) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `${reference.replace(/[^a-z0-9]/gi, '_')}_phrasing.html`,
    filters: [{ name: 'HTML', extensions: ['html'] }],
  })
  if (!filePath) return null
  const fs = require('fs')
  fs.writeFileSync(filePath, html)
  shell.openPath(filePath)
  return filePath
})

// ── Specialist Agent Chat (Exegetical / Theological / Homiletical) ────────────
ipcMain.handle('agent-chat', async (_, { agentType, messages, passageContext, apiKey }) => {
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

  // Cache the passage-context prefix (breakpoint on the assistant ack) so every
  // follow-up turn in the same conversation reuses it at ~10% of input cost.
  const apiMessages = contextMessage
    ? [
        { role: 'user', content: contextMessage },
        { role: 'assistant', content: [{ type: 'text', text: 'Got the passage. What do you want to dig into?', cache_control: { type: 'ephemeral' } }] },
        ...messages,
      ]
    : messages

  const response = await client.messages.create({
    // Sonnet: specialist chat where the preacher is in the loop; the
    // accuracy-critical fact generation happens upstream in analysis.
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    // Cache the large static agent-persona system prompt — same every turn.
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: apiMessages,
  })

  return response.content[0].text
})

// ── Commentary Insights (public domain) ──────────────────────────────────────
ipcMain.handle('fetch-commentary', async (_, { reference, mainTheme, apiKey }) => {
  const client = new Anthropic.default({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Summarize what the following public domain commentators say about ${reference} (main theme: "${mainTheme}"):
- Matthew Henry (Exposition of the Old and New Testaments, 1710)
- John Calvin (Commentaries, 1540s-1560s)
- Charles Spurgeon (Treasury of David for Psalms; Metropolitan Tabernacle Pulpit for NT)
- John Chrysostom (Homilies, 4th c.) if applicable

Return ONLY valid JSON, no markdown:
{
  "commentators": [
    {
      "name": "Matthew Henry",
      "era": "1710",
      "summary": "2-3 sentences capturing his main interpretive emphasis on this passage",
      "distinctiveContribution": "one sentence on what makes his reading unique or particularly useful"
    }
  ],
  "convergence": "one sentence on what all commentators agree on",
  "divergence": "one sentence on where they differ, if at all"
}

Only include commentators with substantive things to say about this specific passage. Accuracy matters — only include what they actually wrote.`,
    }],
  })
  const raw = response.content[0].text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}')
  return JSON.parse(start !== -1 && end > start ? raw.slice(start, end + 1) : raw)
})

// ── Eisegesis / Doctrine Check ────────────────────────────────────────────────
ipcMain.handle('eisegesis-check', async (_, { manuscriptText, passageContext, apiKey }) => {
  if (!manuscriptText || manuscriptText.trim().length < 60) return { flags: [] }
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

    const raw = response.content[0].text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(raw)
  } catch (e) {
    console.error('[eisegesis-check] error:', e?.message ?? e)
    return { flags: [], error: e?.message }
  }
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

ipcMain.handle('scan-asset-images', async () => {
  const desktop = path.join(app.getPath('home'), 'Desktop', 'BASE Assets')
  return {
    people: scanFolder(path.join(desktop, 'people')),
    cities: scanFolder(path.join(desktop, 'cities')),
  }
})
