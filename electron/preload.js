const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  analyzePassage: (payload) => ipcRenderer.invoke('analyze-passage', payload),
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
  profileExtractInsights: (payload) => ipcRenderer.invoke('profile-extract-insights', payload),
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
  setUiZoom: (f) => ipcRenderer.invoke('set-ui-zoom', f),
  getUiZoom: () => ipcRenderer.invoke('get-ui-zoom'),
  missionBrief: (payload) => ipcRenderer.invoke('mission-brief', payload),
  pickMediaFile: () => ipcRenderer.invoke('pick-media-file'),
  getLocalKeys: () => ipcRenderer.invoke('get-local-keys'),
  openKeysFolder: () => ipcRenderer.invoke('open-keys-folder'),
  reviewDelivery: (payload) => ipcRenderer.invoke('review-delivery', payload),
  calendarGet: () => ipcRenderer.invoke('calendar-get'),
  calendarSet: (date, entry) => ipcRenderer.invoke('calendar-set', { date, entry }),
  platform: process.platform,
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
})
