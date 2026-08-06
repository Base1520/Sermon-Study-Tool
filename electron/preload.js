const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  analyzePassage: (payload) => ipcRenderer.invoke('analyze-passage', payload),
  plainRead: (args) => ipcRenderer.invoke('plain-read', args),
  plainAsk: (args) => ipcRenderer.invoke('plain-ask', args),
  groupGuideLoad: (args) => ipcRenderer.invoke('group-guide-load', args),
  groupGuideGenerate: (args) => ipcRenderer.invoke('group-guide-generate', args),
  groupGuideSave: (args) => ipcRenderer.invoke('group-guide-save', args),
  groupGuideExportPdf: (args) => ipcRenderer.invoke('group-guide-export-pdf', args),
  historyList: () => ipcRenderer.invoke('history-list'),
  historyDelete: (id) => ipcRenderer.invoke('history-delete', id),
  historySaveAnnotations: (id, annotations) => ipcRenderer.invoke('history-save-annotations', { id, annotations }),
  getCrossRefs: (payload) => ipcRenderer.invoke('get-cross-refs', payload),
  wordStudy: (payload) => ipcRenderer.invoke('word-study', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export-pdf', payload),
  scholarChat: (payload) => ipcRenderer.invoke('scholar-chat', payload),
  fetchBible: (payload) => ipcRenderer.invoke('fetch-bible', payload),
  profileGet: () => ipcRenderer.invoke('profile-get'),
  profileSave: (profile) => ipcRenderer.invoke('profile-save', profile),
  profileAddSermon: (payload) => ipcRenderer.invoke('profile-add-sermon', payload),
  profileSearchSermons: (query) => ipcRenderer.invoke('profile-search-sermons', query),
  profileGetSermon: (id) => ipcRenderer.invoke('profile-get-sermon', id),
  draftSermon: (payload) => ipcRenderer.invoke('draft-sermon', payload),
  agentChat: (payload) => ipcRenderer.invoke('agent-chat', payload),
  flagManuscript: (payload) => ipcRenderer.invoke('eisegesis-check', payload),
  sessionUpdateDraft: (id, draft) => ipcRenderer.invoke('session-update-draft', { id, draft }),
  sessionUpdateChat: (id, scholarMessages) => ipcRenderer.invoke('session-update-chat', { id, scholarMessages }),
  sessionLoadLatest: () => ipcRenderer.invoke('session-load-latest'),
  fetchCommentary: (payload) => ipcRenderer.invoke('fetch-commentary', payload),
  seriesList: () => ipcRenderer.invoke('series-list'),
  seriesCreate: (payload) => ipcRenderer.invoke('series-create', payload),
  seriesAddPassage: (payload) => ipcRenderer.invoke('series-add-passage', payload),
  seriesRemovePassage: (payload) => ipcRenderer.invoke('series-remove-passage', payload),
  seriesDelete: (id) => ipcRenderer.invoke('series-delete', id),
  seriesSynthesize: (payload) => ipcRenderer.invoke('series-synthesize', payload),
  scanAssetImages: () => ipcRenderer.invoke('scan-asset-images'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  testAnthropicKey: (apiKey) => ipcRenderer.invoke('test-anthropic-key', apiKey),
  secretStatus: () => ipcRenderer.invoke('secret-status'),

  // Licensing. The renderer reads status to decide what to SHOW; it never
  // decides what may RUN — every paid capability is gated in main.
  licenseStatus: () => ipcRenderer.invoke('license-status'),

  // ── Hosted account ────────────────────────────────────────────────────────
  // Present on every build; hostedEnabled() is false on a local-key build and
  // the renderer hides the whole surface.
  hostedEnabled: () => ipcRenderer.invoke('hosted-enabled'),
  hostedMe: () => ipcRenderer.invoke('hosted-me'),
  hostedRedeem: (code) => ipcRenderer.invoke('hosted-redeem', code),
  hostedCheckout: (payload) => ipcRenderer.invoke('hosted-checkout', payload),
  hostedTopup: () => ipcRenderer.invoke('hosted-topup'),
  hostedPortal: () => ipcRenderer.invoke('hosted-portal'),
  feedbackSubmit: (payload) => ipcRenderer.invoke('feedback-submit', payload),
  feedbackList: (limit) => ipcRenderer.invoke('feedback-list', limit),
  hostedClaim: () => ipcRenderer.invoke('hosted-claim'),
  licenseSet: (licenseString) => ipcRenderer.invoke('license-set', licenseString),
  licenseCatalog: () => ipcRenderer.invoke('license-catalog'),
  saveApiKeys: (keys) => ipcRenderer.invoke('save-api-keys', keys),
  migrateLegacyApiKeys: (keys) => ipcRenderer.invoke('migrate-legacy-api-keys', keys),
  setUiZoom: (f) => ipcRenderer.invoke('set-ui-zoom', f),
  getUiZoom: () => ipcRenderer.invoke('get-ui-zoom'),
  missionBrief: (payload) => ipcRenderer.invoke('mission-brief', payload),
  pickMediaFile: () => ipcRenderer.invoke('pick-media-file'),
  reviewDelivery: (payload) => ipcRenderer.invoke('review-delivery', payload),
  calendarGet: () => ipcRenderer.invoke('calendar-get'),
  calendarSet: (date, entry) => ipcRenderer.invoke('calendar-set', { date, entry }),
  platform: process.platform,
  onOpenFeedback: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('open-feedback', handler)
    return () => ipcRenderer.removeListener('open-feedback', handler)
  },
  onAnalysisProgress: (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('analysis-progress', handler)
    return () => ipcRenderer.removeListener('analysis-progress', handler)
  },
  onChatChunk: (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('chat-chunk', handler)
    return () => ipcRenderer.removeListener('chat-chunk', handler)
  },
  /**
   * The claim check landing AFTER plainRead() already resolved.
   *
   * cb receives { requestId, requestedReference, reference, readingLevel, doc }.
   * Fires at most once per plain-read call, and only for a document that came
   * back with verification.status === 'pending'. `doc` is the whole corrected
   * document — swap it in, do not merge it.
   *
   * MATCH BEFORE YOU SWAP: two passages in quick succession produce two checks,
   * and the first can land second. Compare requestId (if you sent one) or
   * reference + readingLevel against what is on screen, and drop anything that
   * does not match. Returns an unsubscribe function; call it on unmount or the
   * handler outlives the component and swaps a document into a dead view.
   */
  onPlainReadVerified: (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('plain-read-verified', handler)
    return () => ipcRenderer.removeListener('plain-read-verified', handler)
  },
  /**
   * A SECTION of the document, the moment the model finishes writing it.
   *
   * cb receives { requestId, requestedReference, key, value }, once per
   * top-level field of the reading. The document is not shorter and the model
   * is not weaker — this removes the WAITING. The reader starts on the first
   * section while the last one is still being composed.
   *
   * DO NOT ASSUME AN ORDER and do not wait for a key you expect. Render what
   * arrives, as it arrives.
   *
   * PROVISIONAL. These sections have not been validated. validatePlainRead runs
   * over the complete document after the stream closes; when plainRead()
   * resolves, swap the whole returned document in and stop trusting the pieces.
   *
   * key === '__reset__' means DISCARD EVERYTHING RENDERED SO FAR and return to
   * the loading state — an attempt was abandoned and the retry is writing a
   * different document.
   *
   * MATCH BEFORE YOU RENDER: compare requestId against the request in flight
   * and drop anything stale. Returns an unsubscribe function; call it on
   * unmount or the handler outlives the component and paints into a dead view.
   */
  onPlainReadSection: (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('plain-read-section', handler)
    return () => ipcRenderer.removeListener('plain-read-section', handler)
  },
})
