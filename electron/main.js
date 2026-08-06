const { app, BrowserWindow, Menu, ipcMain, shell, dialog, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { execFile } = require('child_process')
const packageMetadata = require('../package.json')
const {
  isRetrievalEnabled,
  passageBook,
  selectScopedResults,
  validateCommentarySynthesis,
} = require('./commentary-contract')
const { withRetry, parseModelJSON, checkGenerationInput } = require('./plainread/runtime')
const { createRecorder, summarize } = require('./plainread/usage')
// The analysis fan-out lives in the engine, not here, so the hosted server can
// run the identical calls. This file keeps only what is genuinely the desktop's:
// the electron-store cache, the history dedupe, the gate and the secret.
const { analyzePassage, analysisCacheKey, explicitGeoReferences, forGeneration } = require('./plainread/analyze')
// The hosted path. Inert unless OPERATOR_API_URL is set — see hosted/client.js.
const hosted = require('./hosted/client')

/**
 * studyId carried from the analysis to the reading, keyed by reference.
 *
 * The two halves of a study are two separate IPC calls, and the server needs the
 * id from the first to know the second is riding the same claim rather than
 * buying a new one. It is held here instead of being attached to the analysis
 * object on purpose: the analysis is hashed to build the document cache key, so
 * smuggling a unique id inside it would make every key unique and switch the
 * shared cache off entirely — the exact margin lever this work just repaired.
 */
const STUDY_ID_KEY = 'hosted-study-ids'
const studyKey = (reference) => String(reference ?? '').trim().toLowerCase()

/**
 * PERSISTED, not in-memory.
 *
 * It was a Map, and that quietly cost people money. A free user analyses a
 * passage — spending his ONE lifetime credit — closes the app, comes back and
 * opens the reader. The Map is gone, so the reading cannot ride the claim he
 * already paid for; it asks for a new one, and he has none. He is shown a
 * paywall for the second half of a study he already bought, with no way to
 * recover it. For a subscriber it is the same event billed as a second study.
 */
const rememberStudy = (reference, studyId) => {
  if (!reference || !studyId || !store) return
  const all = store.get(STUDY_ID_KEY, {})
  all[studyKey(reference)] = { studyId, at: Date.now() }
  // Bounded, oldest first, so a long-lived install does not grow this forever.
  const keys = Object.keys(all)
  if (keys.length > 50) {
    keys.sort((a, b) => (all[a].at ?? 0) - (all[b].at ?? 0))
    for (const k of keys.slice(0, keys.length - 50)) delete all[k]
  }
  store.set(STUDY_ID_KEY, all)
}

const recallStudy = (reference) => {
  const entry = store?.get(STUDY_ID_KEY, {})?.[studyKey(reference)]
  if (!entry) return null
  /**
   * NO CLIENT-SIDE EXPIRY.
   *
   * A 24-hour cutoff here re-created the exact double-charge it was added to
   * prevent: the SERVER never expires a claim, so a study analysed yesterday and
   * read today would have had its perfectly valid id withheld and been charged a
   * second time. Whether a claim is still rideable is the server's decision —
   * claimStudyForReading is a conditional UPDATE that simply fails if it is not,
   * and a failed ride costs a study anyway. Sending a stale id is free; refusing
   * to send a good one is not.
   *
   * `at` is still recorded, and is what the eviction above sorts on.
   */
  return entry.studyId
}

const forgetStudy = (reference) => {
  if (!store) return
  const all = store.get(STUDY_ID_KEY, {})
  delete all[studyKey(reference)]
  store.set(STUDY_ID_KEY, all)
}

/**
 * Turn a server refusal into something the renderer can render.
 *
 * A 402 is an OFFER — the server sends the headline, the reassurance and the
 * plan buttons. Rethrowing it as a bare Error would collapse all of that into
 * "request failed", which is how a paywall becomes a bug report.
 */
function asRendererError(e) {
  if (e instanceof hosted.HostedRefusal) {
    /**
     * ELECTRON DESTROYS CUSTOM ERROR PROPERTIES ACROSS IPC.
     *
     * An Error thrown from an ipcMain.handle reaches the renderer as a plain
     * Error whose message is the original message — every extra field is gone.
     * So `err.upgrade = payload` looked right, passed review, and arrived as
     * undefined: the renderer's `if (e?.upgrade)` never fired and every paywall
     * rendered as a red SYSTEM FAULT box. The subscribe buttons were
     * unreachable, which means nobody could ever have paid.
     *
     * The offer therefore travels INSIDE the message, as a tagged JSON string
     * the renderer parses back out. Ugly, and the only thing that survives.
     */
    const err = new Error(`${OFFER_TAG}${JSON.stringify({
      code: e.code,
      status: e.status,
      ...(e.payload || {}),
    })}`)
    err.code = e.code
    return err
  }
  return e
}

/** The marker the renderer looks for. Must match src/lib/hostedError.ts. */
const OFFER_TAG = '__OPERATOR_OFFER__'
const licenseStore = require('./license/store')
const { initLicenseStore, touchClock } = licenseStore
const { FEATURES } = require('./license/features')
const isDev = process.env.NODE_ENV === 'development'

// Updates are ON for packaged builds. Both Mac targets are signed and notarized
// under Developer ID Base 1520 LLC, so the trusted channel the old comment was
// waiting on now exists. The feed is the GitHub release declared in
// package.json's build.publish block.
//
// Set BASE1520_DISABLE_AUTO_UPDATE=true to suppress it for a launch — the escape
// hatch if a bad release ever has to be worked around from the field.
//
// Everything here fails quiet. A reader mid-passage must never be interrupted,
// blocked, or slowed by an update check, so errors log and nothing else.
let autoUpdater
if (!isDev && process.env.BASE1520_DISABLE_AUTO_UPDATE !== 'true') {
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    // Without an error handler electron-updater surfaces failures as unhandled
    // rejections. An unreachable GitHub must be a log line, not a dialog.
    autoUpdater.on('error', (e) => console.log('[updater] error:', e?.message || e))
    autoUpdater.on('update-available', (i) => console.log('[updater] available:', i?.version))
    autoUpdater.on('update-not-available', () => console.log('[updater] up to date'))
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
  } catch (e) {
    console.log('[updater] skipped:', e.message)
    autoUpdater = undefined
  }
}

// Deferred so a slow or dead network never delays the window. Re-checks every
// four hours because the app stays open across a study day.
const UPDATE_RECHECK_MS = 4 * 60 * 60 * 1000
function startUpdateChecks() {
  if (!autoUpdater) return
  const check = () => {
    try {
      autoUpdater.checkForUpdatesAndNotify()
    } catch (e) {
      console.log('[updater] check failed:', e?.message || e)
    }
  }
  setTimeout(check, 8000)
  setInterval(check, UPDATE_RECHECK_MS)
}

// electron-store loaded after app path is set
let store

const SECRET_STORE_KEY = 'encrypted-api-secrets'
const SECRET_NAMES = ['ANTHROPIC_KEY', 'ESV_KEY', 'OPENAI_KEY']

/**
 * Keys baked into a beta build, if any.
 *
 * Absent in the repo and in every normal build — the require throws and this
 * stays empty, so the app asks for a key exactly as it always has. Present only
 * in a build produced by scripts/build-beta.sh, which writes the file from an
 * environment variable and deletes it afterwards.
 *
 * WHY: seven men asked for this tool, were given free keys, and two downloaded
 * it. Zero studies ran. The app was never the obstacle — the four-step key setup
 * was. A beta build that opens and works removes the whole wall.
 *
 * This value lives in the MAIN process only. It is never sent to the renderer,
 * never written to the settings store, and never logged.
 */
let embeddedSecrets = {}
try {
  embeddedSecrets = require('./embedded-key')
  if (embeddedSecrets?.ANTHROPIC_KEY) console.log('[keys] beta build — an embedded key is available')
} catch { /* normal build: no embedded key, and that is the default */ }

/** True when this build can work without the user supplying anything. */
function hasEmbeddedSecret(name) {
  return typeof embeddedSecrets?.[name] === 'string' && embeddedSecrets[name].length > 0
}


/**
 * What the renderer uses to decide whether to demand a key on first launch.
 *
 * A beta build counts as "has a key" so the setup wall never appears — that is
 * the entire point. `embedded` is reported separately so the UI can be honest
 * about whose key is being spent without ever seeing the key itself.
 */
function secretStatus() {
  /**
   * A HOSTED BUILD ALREADY HAS AN ANTHROPIC KEY — IT IS JUST NOT ON THIS MACHINE.
   *
   * This is the flag the renderer uses as "may this install generate?" (App.tsx
   * gates SEND IT and the reader on it). Reporting false on a hosted build made
   * the entire app dead on arrival: the user pressed SEND IT, the renderer
   * returned before any IPC, and the settings modal it opened had no key field
   * to fill in — because on a hosted build the key form is deliberately hidden.
   * Every hosted branch in this file was unreachable code on a downloaded build.
   *
   * Precedent is `hasEmbeddedSecret`, which reports true for a key the user also
   * never sees. Same idea: the question is "can work be done", not "is there a
   * string in this store".
   */
  const hostedKey = Boolean(hosted.hostedBaseUrl())
  const status = Object.fromEntries(
    SECRET_NAMES.map((name) => [
      name,
      Boolean(readSecret(name)) || hasEmbeddedSecret(name) ||
        (name === 'ANTHROPIC_KEY' && hostedKey),
    ]),
  )
  status.embedded = Object.fromEntries(
    SECRET_NAMES.map((name) => [name, hasEmbeddedSecret(name) && !readSecret(name)]),
  )
  // So the UI can say whose key is being spent without ever seeing one.
  status.hosted = hostedKey
  return status
}

function readSecret(name) {
  const encrypted = store?.get(SECRET_STORE_KEY, {})?.[name]
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    // The ciphertext can no longer be decrypted. safeStorage ties its key to the
    // app's identity, so the rename to com.base1520.theoperator orphaned every
    // secret stored under the old bundle id. Drop the dead entry rather than
    // leaving it to fail silently forever, and say so in the log — otherwise a
    // tester reporting "I entered my key and it forgot it" has no diagnosis.
    console.log(`[secrets] ${name}: stored value could not be decrypted, clearing it`)
    try {
      const all = { ...(store?.get(SECRET_STORE_KEY, {}) ?? {}) }
      delete all[name]
      store?.set(SECRET_STORE_KEY, all)
    } catch { /* store unavailable; the read still correctly reports "not set" */ }
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

/**
 * The key this build should use, or '' if there is none. Never throws.
 *
 * The user's OWN key always wins. Someone who took the trouble to paste one gets
 * their own billing and their own rate limits, not the shared beta pool.
 *
 * USE THIS, NOT readSecret(), ANYWHERE A KEY IS ACTUALLY SPENT. readSecret is
 * raw storage access and has no embedded-key fallback. Two handlers called it
 * directly and, on a beta build, degraded to their no-key branch on every
 * request — one of them the eisegesis watchdog, whose no-key branch returns an
 * empty flag list, which the UI renders as CLEAN. A check that never ran looked
 * exactly like a check that passed. test-secret-paths.js now fails the build if
 * a new readSecret call site appears outside this block.
 */
function resolveSecret(name) {
  return readSecret(name) || embeddedSecrets[name] || ''
}

function requireSecret(name, label) {
  const value = resolveSecret(name)
  if (!value) {
    /**
     * ON A HOSTED BUILD, "add it in Settings" IS A LIE.
     *
     * The core loop — analyze, read, ask — runs on the server and needs no key.
     * A handful of deeper tools (word study, cross-references, the scholar
     * panel, sermon drafting) still call Anthropic directly and have not been
     * moved to the server yet. On a hosted build there is no key field to add
     * anything to: the settings modal shows the account panel instead. Telling
     * a man to go add a key to a form that is not there is the kind of dead end
     * that makes someone close an app and not reopen it.
     *
     * So: say what is actually true, name what still works, and mark it with a
     * code the renderer can branch on.
     */
    if (name === 'ANTHROPIC_KEY' && hosted.hostedBaseUrl()) {
      const err = new Error(
        'This tool is not on our servers yet — it still needs your own Anthropic key. ' +
        'Studying a passage, reading it, and asking about it all work without one.'
      )
      err.code = 'NEEDS_OWN_KEY'
      throw err
    }
    throw new Error(`${label} API key required — add it in Settings.`)
  }
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

  /**
   * RIGHT-CLICK TO COPY.
   *
   * Electron gives a BrowserWindow no context menu at all — right-clicking a
   * selection does nothing, forever, with no error. Combined with the app-wide
   * `user-select: none` that used to be in index.css, a pastor could neither
   * highlight the output nor copy it. That was Clint Riggin's beta feedback: he
   * wanted to lift the reading into his own documents and had no way to.
   *
   * Built from what is actually under the cursor, so the menu never offers an
   * action that would do nothing. Cmd+C already worked through the app menu's
   * Edit role; this is the gesture people actually reach for.
   */
  win.webContents.on('context-menu', (_event, params) => {
    const items = []
    const selection = (params.selectionText || '').trim()

    if (params.isEditable) {
      items.push(
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { type: 'separator' }, { role: 'selectAll' },
      )
    } else if (selection) {
      items.push({ role: 'copy', label: 'Copy' })
      // Straight to a definition without leaving the app — the macOS gesture a
      // reader already expects on a word they do not know.
      if (process.platform === 'darwin' && selection.length < 40) {
        items.push({ role: 'showDefinitionForSelection', label: `Look Up "${selection.slice(0, 24)}"` })
      }
      items.push({ type: 'separator' }, { role: 'selectAll', label: 'Select All' })
    } else {
      items.push({ role: 'selectAll', label: 'Select All' })
    }

    if (isDev) {
      items.push({ type: 'separator' }, {
        label: 'Inspect Element',
        click: () => win.webContents.inspectElement(params.x, params.y),
      })
    }

    Menu.buildFromTemplate(items).popup({ window: win })
  })
}

app.whenReady().then(async () => {
  const Store = (await import('electron-store')).default

  // electron-store defaults clearInvalidConfig to false, so a corrupt or
  // truncated config.json throws here. With no catch, that rejection meant
  // createWindow() never ran and the user got a bouncing dock icon, no window
  // and no error — nothing to act on and nothing to report. The file is
  // rewritten in full on every set(), so a crash or full disk mid-write is a
  // real way to reach that state.
  //
  // Losing history is bad. Being unable to open the app at all is worse, and it
  // is the one failure a man cannot work around on a Sunday morning.
  try {
    store = new Store()
  } catch (e) {
    console.log('[store] config unreadable, resetting:', e?.message || e)
    try {
      store = new Store({ clearInvalidConfig: true })
      dialog.showMessageBox({
        type: 'warning',
        title: 'Settings were reset',
        message: 'The Operator could not read its settings file and has started fresh.',
        detail: 'Your saved studies may be gone and you may need to paste your keys again. Your license is stored separately and is unaffected.',
        buttons: ['OK'],
      })
    } catch (fatal) {
      dialog.showErrorBox(
        'The Operator could not start',
        `Its settings could not be created or repaired.\n\n${fatal?.message || fatal}\n\nCheck that your disk is not full, then open it again.`,
      )
      app.quit()
      return
    }
  }

  // The license lives in its own file so it can never share a fate with the
  // history store — clearing a corrupt config must not destroy what a man paid
  // for, since he would then need the app to open in order to re-paste the key
  // that the app needs in order to open properly.
  initLicenseStore(Store)
  touchClock()

  buildMenu()
  createWindow()
  startUpdateChecks()
}).catch((e) => {
  // Last line of defence: anything unhandled above must produce a visible
  // failure rather than a silent no-window start.
  console.log('[startup] fatal:', e?.message || e)
  try {
    dialog.showErrorBox('The Operator could not start', String(e?.message || e))
  } catch { /* dialog itself unavailable */ }
  app.quit()
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

// ── Cost ledger ────────────────────────────────────────────────────────────
//
// Appends one line per model call to cost-ledger.jsonl in userData. Nothing in
// the pricing plan has ever been measured — every figure is arithmetic on
// max_tokens ceilings, and models rarely run to ceiling. Sixty days of the
// seven testers using this produces the real number at zero cost, because they
// are on their own keys.
//
// Deliberately a plain append-only file, not the settings store: it must never
// be able to corrupt config.json, and it should be readable with `tail`.

let ledgerPath = null
function ledgerFile() {
  if (!ledgerPath) ledgerPath = path.join(app.getPath('userData'), 'cost-ledger.jsonl')
  return ledgerPath
}

const recordUsage = createRecorder((line) => {
  fs.appendFileSync(ledgerFile(), line)
})

/** One id per study so the analyze calls, the document, its retries and the verify pass roll up together. */
function newStudyId() {
  return crypto.randomUUID().slice(0, 8)
}

ipcMain.handle('cost-summary', () => {
  try {
    const raw = fs.readFileSync(ledgerFile(), 'utf8')
    const rows = raw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } })
    return summarize(rows.filter(Boolean))
  } catch {
    return { calls: 0, totalUsd: 0, note: 'no usage recorded yet' }
  }
})

// ── Licensing ──────────────────────────────────────────────────────────────
// The renderer asks what this install may do; it never decides for itself. UI
// gating is presentation only — every capability that actually calls a model is
// gated here in main by requireFeature(), after that handler's cache return.

// ── Hosted account surface ──────────────────────────────────────────────────
// Everything the renderer needs to show who this install is, take a comp code,
// start a subscription, and collect one after the browser comes back.

/** Is this a hosted build at all? The renderer hides the whole surface if not. */
ipcMain.handle('hosted-enabled', () => Boolean(hosted.hostedBaseUrl()))

/** Entitlement, straight from the server. null when offline — never a downgrade. */
ipcMain.handle('hosted-me', async () => {
  if (!hosted.hostedBaseUrl()) return null
  return hosted.me(store)
})

/** Redeem a comp code. Stores the device token; the app is a subscriber after. */
ipcMain.handle('hosted-redeem', async (_, code) => {
  if (!hosted.hostedBaseUrl()) throw new Error('This build is not connected to the server.')
  try {
    return { ok: true, ...(await hosted.redeem(store, code)) }
  } catch (e) {
    return { ok: false, message: e.message }
  }
})

/** Open Stripe checkout in the real browser. Never inside the app. */
ipcMain.handle('hosted-checkout', async (_, { plan, email }) => {
  if (!hosted.hostedBaseUrl()) throw new Error('This build is not connected to the server.')
  const url = await hosted.checkout(store, { plan, email })
  await shell.openExternal(url)
  return { ok: true, url }
})

/**
 * Collect a subscription just paid for.
 *
 * Polled by the renderer after checkout opens, because the app never sees the
 * browser's return. "Not yet" is a normal answer, not an error — the webhook
 * and the customer's browser race each other.
 */
/** Beta feedback — submit and read. */
ipcMain.handle('feedback-submit', async (_, payload) => {
  if (!hosted.hostedBaseUrl()) return { ok: false, message: 'This build is not connected to the server.' }
  try {
    return await hosted.sendFeedback(store, { ...payload, version: app.getVersion(), platform: process.platform })
  } catch (e) {
    return { ok: false, message: e.message }
  }
})
ipcMain.handle('feedback-list', async (_, limit) => {
  if (!hosted.hostedBaseUrl()) return []
  try { return await hosted.listFeedback(store, limit) } catch { return [] }
})

/** Stripe's billing page. Opened in the real browser, never inside the app. */
ipcMain.handle('hosted-portal', async () => {
  if (!hosted.hostedBaseUrl()) throw new Error('This build is not connected to the server.')
  const url = await hosted.portal(store)
  await shell.openExternal(url)
  return { ok: true, url }
})

/** Buy more studies. One-off, never a stored intent. */
ipcMain.handle('hosted-topup', async () => {
  if (!hosted.hostedBaseUrl()) throw new Error('This build is not connected to the server.')
  const url = await hosted.topup(store)
  await shell.openExternal(url)
  return { ok: true, url }
})

ipcMain.handle('hosted-claim', async () => {
  if (!hosted.hostedBaseUrl()) return { ok: false }
  return hosted.claim(store)
})

ipcMain.handle('license-status', () => licenseStore.entitlements())

ipcMain.handle('license-set', (_, licenseString) => licenseStore.setLicense(null, licenseString))

ipcMain.handle('license-catalog', () => ({
  features: FEATURES,
  free: licenseStore.FREE_FEATURES,
  installId: licenseStore.getInstallId(),
}))

/**
 * Throw unless this install is entitled to the capability.
 *
 * Placed after each handler's cache return, so re-opening work a man has
 * already generated stays free forever — which is the promise the free tier
 * makes and the reason the cache read deliberately precedes the key check.
 *
 * This is a checkout counter, not a lock. The repo is public and the asar is
 * patchable, so anyone who could defeat this could simply run from source.
 * Its job is to let people who want to pay, pay.
 */
function requireFeature(featureId) {
  // ENFORCEMENT IS OFF BY DEFAULT, AND MUST STAY OFF UNTIL THE UNLOCK UI EXISTS.
  //
  // The gates below are written, wired and tested. What does not exist yet is
  // any way for a user to DO something about being refused: there is no license
  // field, no error branch, and no buy link in the renderer. Meanwhile the
  // auto-updater is armed with autoDownload and autoInstallOnAppQuit, so a
  // published release reaches every installed copy overnight without anyone
  // choosing it.
  //
  // Turning enforcement on before the unlock path exists would mean seven men
  // who were promised early access open the app one morning, press Study, and
  // are told they have not paid — with nothing on screen to fix it. That is the
  // worst possible first contact with a price, and it lands on friends.
  //
  // Flip this on by setting OPERATOR_ENFORCE=1, in the same commit that ships
  // the license field. Not before.
  if (process.env.OPERATOR_ENFORCE !== '1') return

  if (licenseStore.can(null, featureId)) return
  const err = new Error('This is part of the paid version of The Operator.')
  err.code = 'LICENSE_REQUIRED'
  err.feature = featureId
  throw err
}

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

ipcMain.handle('analyze-passage', async (event, { text, reference, streamId }) => {
  // Ceilings before anything else. The passage arrives from the caller and is
  // interpolated raw into three separate model calls, so an oversized paste is
  // multiplied by three. On the desktop that spends the user's own money; once
  // this runs on a server it spends Cole's, and the sender pays nothing.
  // Refused here, before a token is committed.
  checkGenerationInput({ text, reference })

  // Timing. plain-read already logs its own; without this one we know the total
  // wall clock a reader waits but not how it splits between the analysis fan-out
  // and the document generation — and you cannot make something faster until you
  // know which half is slow.
  const __a0 = Date.now()
  const stage = (name) => {
    try {
      console.log(`[analyze-passage] stage=${name} +${((Date.now() - __a0) / 1000).toFixed(1)}s`)
      if (streamId) event.sender.send('analysis-progress', { streamId, stage: name })
    } catch {}
  }
  stage('start')
  // Core exegesis is source-bound. Personal theology and profile data belong in
  // later pastoral/delivery surfaces, not in the passage analysis request.
  const cacheKey = analysisCacheKey(reference, text)
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
      // Prefer an entry that already holds work. Duplicates created before the
      // miss path deduped are still in people's stores, and a bare .find() can
      // keep returning a blank one forever — pinning the reader to an empty
      // record while his real notes sit in a sibling entry he can only reach
      // through History.
      const matches = history.filter(e => e.analysis?.reference === safeCached.reference)
      const existing = matches.find(e => e.draft || e.scholarMessages?.length ||
        (e.annotations && Object.keys(e.annotations).length)) || matches[0]
      let historyId
      if (existing) {
        historyId = existing.id
        store.set('history', [
          { ...existing, analysis: safeCached },
          ...history.filter(e => e.id !== existing.id),
        ])
      } else {
        const entry = { id: Date.now().toString(), savedAt: new Date().toISOString(), analysis: safeCached, annotations: {} }
        historyId = entry.id
        store.set('history', [entry, ...history].slice(0, 100))
      }
      // The renderer needs this to save anything the user writes afterwards.
      // Returned under a distinct key because the result object is spread
      // straight into `analysis` state — a bare `id` would collide.
      return { ...safeCached, historyId }
    }
  }

  // ── HOSTED ────────────────────────────────────────────────────────────────
  // The whole point of the server: no key on this machine, no setup, no wall.
  // The local branch below is untouched and still runs when OPERATOR_API_URL is
  // unset, so an existing user with his own key notices nothing.
  if (hosted.hostedBaseUrl()) {
    stage('calls-dispatched')
    let remote
    try {
      remote = await hosted.analyze(store, { text, reference })
    } catch (e) {
      throw asRendererError(e)
    }
    stage('structure'); stage('theme'); stage('culture'); stage('complete')

    const hostedResult = remote.analysis
    rememberStudy(reference, remote.studyId)

    // Cached and put in history exactly like a local run, so History, the desk
    // and session-load-latest behave identically on both paths.
    let hostedHistoryId = null
    if (store) {
      store.set(cacheKey, hostedResult)
      const history = store.get('history', [])
      const matches = history.filter(e => e.analysis?.reference === hostedResult.reference)
      const existing = matches.find(e => e.draft || e.scholarMessages?.length ||
        (e.annotations && Object.keys(e.annotations).length)) || matches[0]
      if (existing) {
        hostedHistoryId = existing.id
        store.set('history', [
          { ...existing, analysis: hostedResult },
          ...history.filter(e => e.id !== existing.id),
        ])
      } else {
        const entry = { id: Date.now().toString(), savedAt: new Date().toISOString(), analysis: hostedResult, annotations: {} }
        hostedHistoryId = entry.id
        store.set('history', [entry, ...history].slice(0, 100))
      }
    }
    return hostedHistoryId ? { ...hostedResult, historyId: hostedHistoryId } : hostedResult
  }

  requireFeature('gen.study')
  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')

  // The fan-out itself is electron/plainread/analyze.js — the same function the
  // hosted server calls. Everything around it in this handler (the cache above,
  // the history below, the gate and the secret) is the desktop's job; the model
  // calls are the engine's, so a reading can never differ between the two.
  // The fan-out was never in the cost ledger — createRecorder's own comment
  // promises "the analyze calls, the document, its retries and the verify pass
  // roll up together", but nothing here had ever recorded the analyze half. Every
  // study in the ledger has therefore been under-counted by roughly half its
  // real cost. It gets its own id for now; joining it to the document's study id
  // means threading one id through two separate IPC calls, which is a renderer
  // change, not this one.
  const __analyzeStudyId = newStudyId()

  const result = await analyzePassage({
    text,
    reference,
    apiKey,
    createClient: (key) => new Anthropic.default({ apiKey: key }),
    retry: withRetry,
    parse: parseModelJSON,
    onStage: stage,
    onUsage: (label, usage, model) =>
      recordUsage(label, usage, model, { studyId: __analyzeStudyId, ref: reference }),
  })

  // reference / geoReferences / passageText and stage('complete') are applied
  // inside analyzePassage. Do not re-apply them here — a second copy is how the
  // two drift apart.

  // ── Cache and save to history ─────────────────────────────────────────────
  let historyId = null
  if (store) {
    store.set(cacheKey, result)
    const history = store.get('history', [])
    // Dedupe by reference, exactly as the cache-hit path above does. Without
    // this, re-running the same passage — which happens on every translation
    // switch — appended a fresh blank entry each time, and session-load-latest
    // then restored THAT one instead of the entry holding the reader's work.
    const matches = history.filter(e => e.analysis?.reference === result.reference)
    const existing = matches.find(e => e.draft || e.scholarMessages?.length ||
      (e.annotations && Object.keys(e.annotations).length)) || matches[0]
    if (existing) {
      historyId = existing.id
      store.set('history', [
        { ...existing, analysis: result },
        ...history.filter(e => e.id !== existing.id),
      ])
    } else {
      const entry = { id: Date.now().toString(), savedAt: new Date().toISOString(), analysis: result, annotations: {} }
      historyId = entry.id
      store.set('history', [entry, ...history].slice(0, 100))
    }
  }

  return historyId ? { ...result, historyId } : result
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
const { plainRead, cacheKeyFor } = require('./plainread/pipeline')

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
//
// THE GENERATION IS STREAMED, SECTION BY SECTION — event 'plain-read-section',
// payload: { requestId, requestedReference, key, value }
//
//   * Fires once per TOP-LEVEL key of the document, the moment the model
//     finishes writing that key. The document is not shorter and the model is
//     not weaker; the reader simply starts reading the first section while the
//     last one is still being composed.
//   * `key` is a document field name — 'situation', 'outline', 'meaning' and so
//     on. `value` is that field's parsed value, exactly what the finished
//     document will carry for it.
//   * DO NOT ASSUME AN ORDER, and do not wait for a key you expect. Render what
//     arrives, as it arrives. The order is prompt.js's business.
//   * PROVISIONAL UNTIL THE INVOKE RESOLVES. These sections have not been
//     validated — validatePlainRead runs over the complete document after the
//     stream closes, and the resolved document is the truth. When plainRead()
//     resolves, swap the whole document in and stop trusting the pieces.
//   * key === '__reset__' means THROW AWAY EVERY SECTION ALREADY RENDERED and
//     go back to the loading state. It fires when an attempt is abandoned — a
//     dead stream, or a document that failed validation and is being
//     re-generated. The retry writes a DIFFERENT document; leaving the old
//     fragments on screen would show a reader two readings spliced together.
//   * MATCH BEFORE YOU RENDER, same as 'plain-read-verified' above: compare
//     requestId against the request in flight and drop anything stale. Two
//     passages in quick succession produce two streams.
ipcMain.handle('plain-read', async (event, { analysis, requestedReference, force, level, requestId }) => {
  // Ties this document, its retries and its verify pass to one study in the
  // ledger, so summarize() reports cost per STUDY rather than per API call.
  const __studyId = newStudyId()

  // Timing, logged to the terminal. Added because "it feels slow" and "it IS
  // slow" are different problems with different fixes, and nobody could tell
  // them apart. The generate call writes ~2400 words at the plain level; if
  // that is where the wall-clock goes then the answer is streaming it, not
  // trimming it — Cole ruled explicitly that the document does not get shorter.
  const __t0 = Date.now()
  const __done = (label) => console.log(
    `[plain-read] ${label} ${((Date.now() - __t0) / 1000).toFixed(1)}s` +
    ` ref=${analysis?.reference ?? '?'} level=${level ?? 'default'}`
  )
  // TIME TO FIRST SECTION is now the number that matters. Total time did not
  // change and was never supposed to — the document did not get shorter. What
  // changed is how long the reader waits before there is something to read, and
  // that is the only figure worth watching for a regression. If this creeps
  // back toward the total, streaming has quietly broken.
  let __firstSection = 0

  // ── HOSTED ────────────────────────────────────────────────────────────────
  // Same streaming contract as the local path: onSection(key, value) forwarded
  // to the same renderer event, so the desk cannot tell the two apart.
  if (hosted.hostedBaseUrl()) {
    /**
     * THE LOCAL CACHE IS CHECKED FIRST, and that is not an optimisation.
     *
     * Re-opening a study you already ran must be free. Without this, every
     * re-open went to the server, which CHARGES BEFORE it checks its own cache —
     * so a reader who opened last week's study three times paid three times, and
     * a free user could not re-open his one study at all. The desktop already
     * keeps every document it has generated; hand it back.
     */
    const cleanAnalysis = forGeneration(analysis)
    const localKey = cacheKeyFor(cleanAnalysis, level)
    const cachedDoc = store?.get(localKey, null)
    if (cachedDoc && cachedDoc.verification?.status === 'ok' && !force) {
      __done('served from local cache')
      return cachedDoc
    }

    const priorStudyId = recallStudy(requestedReference ?? analysis?.reference)
    try {
      const doc = await hosted.plainRead(store, {
        analysis: forGeneration(analysis),
        reference: requestedReference ?? analysis?.reference,
        level,
        studyId: priorStudyId,
        // NOT aborted when the window closes. The server finishes a study it
        // has started — that is rule 4 of meter.js — and the document is cached
        // on arrival, so closing the app mid-reading now costs nothing and the
        // finished reading is waiting when he comes back. Dropping the request
        // instead would have burned the claim and lost the document.
        onSection: (key, value) => {
          try {
            if (!event.sender || event.sender.isDestroyed()) return
            if (!__firstSection && key !== '__reset__') {
              __firstSection = Date.now()
              console.log(`[plain-read] FIRST SECTION '${key}' in ${((__firstSection - __t0) / 1000).toFixed(1)}s (hosted)`)
            }
            event.sender.send('plain-read-section', {
              requestId: requestId ?? null,
              requestedReference: requestedReference ?? null,
              key,
              value,
            })
          } catch {}
        },
      })
      // The claim is spent. Holding the id would make a re-read of the same
      // passage try to ride a study the server has already closed.
      forgetStudy(requestedReference ?? analysis?.reference)
      /**
       * ONLY A VERIFIED DOCUMENT MAY BE CACHED.
       *
       * pipeline.js's single cache-write is guarded by
       * verification.status === 'ok', and that guard is the entire reason a
       * cache HIT can skip re-checking: a hit is already verified as a property
       * of the cache, not as a hope. Writing an unchecked document here would
       * break that invariant permanently for that passage — the doctrinal fence
       * would be defeated once and then served from disk forever.
       */
      try {
        if (store && doc && doc.verification?.status === 'ok') store.set(localKey, doc)
      } catch {}
      __done('hosted done')
      return doc
    } catch (e) {
      __done('hosted failed')
      throw asRendererError(e)
    }
  }

  try {
  return await plainRead({
    // Same strip as the server. The local cache is keyed the same way, so this
    // has been silently disabled on the desktop too — every reader has been
    // regenerating documents he had already paid for.
    analysis: forGeneration(analysis),
    apiKey: requireSecret('ANTHROPIC_KEY', 'Anthropic'),
    // Fires only on a cache miss, so a study already generated re-opens free.
    onCacheMiss: () => requireFeature('gen.read'),
    // Records the document call AND each retry separately. A validation
    // failure regenerates the whole 6,000-token document, so the meter counts
    // one study while the bill counts two — invisible unless attempts are
    // logged apart.
    onUsage: (label, usage, model) => recordUsage(label, usage, model, { studyId: __studyId, ref: requestedReference }),
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
    // Guarded exactly like onVerified below, and for the same reason: this
    // fires from inside a live stream handler, which can outlive the window
    // that started it. A destroyed webContents must be a no-op, not a crash in
    // the main process — and a throw here has no caller left to reject to.
    onSection: (key, value) => {
      try {
        if (!event.sender || event.sender.isDestroyed()) return
        if (!__firstSection && key !== '__reset__') {
          __firstSection = Date.now()
          console.log(
            `[plain-read] FIRST SECTION '${key}' in ` +
            `${((__firstSection - __t0) / 1000).toFixed(1)}s` +
            ` ref=${analysis?.reference ?? '?'} level=${level ?? 'default'}`
          )
        }
        event.sender.send('plain-read-section', {
          requestId: requestId ?? null,
          requestedReference: requestedReference ?? null,
          key,
          value,
        })
      } catch {}
    },
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
  } finally {
    // Fires on the success path AND on a throw, so a failed run still reports
    // how long it burned before failing. The gap between the two lines is the
    // waiting that streaming removed; a cache hit prints no FIRST SECTION line
    // at all, because it never called the model.
    __done('returned to renderer in')
    if (__firstSection) {
      console.log(
        `[plain-read] reader was reading for ` +
        `${((Date.now() - __firstSection) / 1000).toFixed(1)}s of that`
      )
    }
  }
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

  requireFeature('gen.groupguide')
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
  requireFeature('gen.groupguide')
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

  // ── HOSTED ────────────────────────────────────────────────────────────────
  // The reader was promised he could ask about a reading he already has. On a
  // hosted build that must not depend on him owning an API key.
  if (hosted.hostedBaseUrl()) {
    try {
      return await hosted.ask(store, { doc, analysis, question, history, vaultNotes: notes })
    } catch (e) {
      throw asRendererError(e)
    }
  }

  requireFeature('gen.ask')
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
  requireFeature('gen.profile')
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
  requireFeature('gen.sermon')
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
  requireFeature('gen.seriesSynth')
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
  requireFeature('gen.crossrefs')
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

  requireFeature('gen.wordstudy')
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
  requireFeature('gen.scholar')
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
  requireFeature('gen.agents')
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
  // resolveSecret, NOT readSecret — readSecret has no embedded-key fallback, so
  // on a beta build this returned '' and told the user to add a key he does not
  // need and would gain nothing from.
  const apiKey = resolveSecret('ANTHROPIC_KEY')
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
  // resolveSecret, NOT readSecret. This bypassed the embedded-key fallback, so
  // on a beta build it returned { flags: [] } on EVERY check, for EVERY user,
  // forever — and an empty flag list renders as CLEAN. The watchdog would have
  // reported a clean manuscript while never having run, which is worse than a
  // visible failure: a silent no-op that looks like good news is how a wrong
  // reading reaches a pulpit.
  const apiKey = resolveSecret('ANTHROPIC_KEY')
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
  requireFeature('gen.mission')
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
  requireFeature('gen.delivery')
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
