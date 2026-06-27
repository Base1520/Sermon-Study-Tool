import { useState, useCallback, useMemo, useEffect } from 'react'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { motion, AnimatePresence } from 'motion/react'
import { PassageInput } from './components/PassageInput'
import { Desk } from './components/Desk'
import { CanonicalStrip } from './components/CanonicalStrip'
import { ApiKeyModal } from './components/ApiKeyModal'
import { ThinkingDisplay } from './components/ThinkingDisplay'
import { Starfield } from './components/Starfield'
import { CorePulse } from './components/CorePulse'
import { HistoryPanel } from './components/HistoryPanel'
import { WordStudyDrawer } from './components/WordStudyDrawer'
import { CrossRefs } from './components/CrossRefs'
import { CulturalNotesPanel } from './components/CulturalNotesPanel'
import { ScholarChat } from './components/ScholarChat'
import { ScholarProfile } from './components/ScholarProfile'
import { AgentChat } from './components/AgentChat'
import type { AgentType } from './components/AgentChat'
import { Onboarding, shouldShowOnboarding } from './components/Onboarding'
import { PassagePanel } from './components/PassagePanel'
import { CommentaryPanel } from './components/CommentaryPanel'
import { SetupWizard } from './components/SetupWizard'
import { SeriesPanel } from './components/SeriesPanel'
import { FeatureTour } from './components/FeatureTour'
import { BookCompass } from './components/BookCompass'
import { BASE } from './theme'
import type { PhrasingAnalysis, Phrase, WordStudy, HistoryEntry, ChatMessage } from './types/phrasing'

type Tab = 'desk' | 'scholar'


export default function App() {
  const [apiKey, setApiKey]       = useState(() => localStorage.getItem('sermon-tool-key') ?? '')
  const [esvKey, setEsvKey]       = useState(() => localStorage.getItem('sermon-tool-esv-key') ?? '')
  const [showKeyModal, setShowKeyModal] = useState(!localStorage.getItem('sermon-tool-key'))
  const [analysis, setAnalysis]   = useState<PhrasingAnalysis | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [tab, setTab]             = useState<Tab>('desk')
  const [selectedPhraseId, setSelectedPhraseId] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<Record<string, string>>({})
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [wordStudy, setWordStudy] = useState<WordStudy | null>(null)
  const [wordStudyLoading, setWordStudyLoading] = useState(false)
  const [prefillRef, setPrefillRef] = useState<string | null>(null)
  const [agentPanel, setAgentPanel] = useState<AgentType | null>(null)
  // Only show onboarding after API key is saved — never overlap with the key modal
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const [showSeries, setShowSeries] = useState(false)
  const [showFeatureTour, setShowFeatureTour] = useState(false)
  const [showBookCompass, setShowBookCompass] = useState(false)
  const [savedDraft, setSavedDraft] = useState<string | undefined>(undefined)
  const [agentDraftSkeleton, setAgentDraftSkeleton] = useState<string | undefined>(undefined)
  const [savedChat, setSavedChat] = useState<ChatMessage[] | undefined>(undefined)
  const [passagePanel, setPassagePanel] = useState<{ text: string; reference: string } | null>(null)
  const [phraseMode, setPhraseMode] = useState<'key' | 'all'>('key')

  // Show onboarding on launch if key already exists and user hasn't seen it
  useEffect(() => {
    if (localStorage.getItem('sermon-tool-key') && shouldShowOnboarding()) {
      setShowOnboarding(true)
    }
  }, [])

  // Restore last session on launch
  useEffect(() => {
    ;(window as any).electronAPI.sessionLoadLatest().then((entry: HistoryEntry | null) => {
      if (!entry) return
      setAnalysis(entry.analysis)
      setAnnotations(entry.annotations ?? {})
      setCurrentHistoryId(entry.id)
      if (entry.draft) setSavedDraft(entry.draft)
      if (entry.scholarMessages?.length) setSavedChat(entry.scholarMessages)
    }).catch(() => {})
  }, [])

  const culturalPhraseIds = useMemo(
    () => new Set((analysis?.culturalNotes ?? []).map(n => n.phraseId)),
    [analysis]
  )

  const handleSaveKey = useCallback((key: string, esv: string) => {
    const cleanKey = key.trim()
    const cleanEsv = esv.trim()
    setApiKey(cleanKey); localStorage.setItem('sermon-tool-key', cleanKey)
    setEsvKey(cleanEsv); localStorage.setItem('sermon-tool-esv-key', cleanEsv)
    // eslint-disable-next-line no-param-reassign
    key = cleanKey; esv = cleanEsv
    setShowKeyModal(false)
    // Show onboarding tour now that the key is saved — first-time users only
    if (shouldShowOnboarding()) setShowOnboarding(true)
  }, [])

  const handleAnalyze = useCallback(async (text: string, reference: string) => {
    if (!apiKey) { setShowKeyModal(true); return }
    setLoading(true); setError(null); setSelectedPhraseId(null); setWordStudy(null); setAnnotations({})
    setSavedDraft(undefined); setSavedChat(undefined)
    setTab('desk')
    try {
      const result = await (window as any).electronAPI.analyzePassage({ text, reference, apiKey })
      setAnalysis(result)
      setCurrentHistoryId(null)
    } catch (e: any) {
      setError(e.message ?? 'Analysis failed.')
    } finally { setLoading(false) }
  }, [apiKey])

  const handleLoadHistory = useCallback((entry: HistoryEntry) => {
    setAnalysis(entry.analysis)
    setAnnotations(entry.annotations ?? {})
    setCurrentHistoryId(entry.id)
    setSavedDraft(entry.draft)
    setSavedChat(entry.scholarMessages?.length ? entry.scholarMessages : undefined)
    setSelectedPhraseId(null)
    setWordStudy(null)
    setError(null)
    setTab('desk')
  }, [])

  const handleAnnotate = useCallback(async (phraseId: string, text: string) => {
    const next = { ...annotations, [phraseId]: text }
    if (!text) delete next[phraseId]
    setAnnotations(next)
    if (currentHistoryId)
      await (window as any).electronAPI.historySaveAnnotations(currentHistoryId, next)
  }, [annotations, currentHistoryId])

  const handleWordClick = useCallback(async (word: string, phrase: Phrase) => {
    if (!analysis) return
    setWordStudy(null); setWordStudyLoading(true)
    try {
      const result = await (window as any).electronAPI.wordStudy({
        word, clauseText: phrase.text, reference: analysis.reference, apiKey,
      })
      setWordStudy(result)
    } catch { /* silent */ } finally { setWordStudyLoading(false) }
  }, [analysis, apiKey])

  const handleLoadRef = useCallback((reference: string) => setPrefillRef(reference), [])

  const handleExport = useCallback(async () => {
    if (!analysis) return
    const html = buildExportHtml(analysis, annotations)
    await (window as any).electronAPI.exportPdf({ html, reference: analysis.reference })
  }, [analysis, annotations])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: BASE.bg, color: BASE.bone, position: 'relative', overflow: 'hidden',
    }}>

      {/* ── Title bar / HUD Header ────────────────────────────────────────────── */}
      <div className="drag-region" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', height: 48, flexShrink: 0,
        background: `${BASE.bg}f8`,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: `1px solid ${BASE.borderGold}`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* HUD scan line in title bar */}
        <style>{`
          @keyframes titleScan {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
          @keyframes hudBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
          .tab-hud:hover:not(:disabled) { background: rgba(216,179,63,0.08) !important; }
        `}</style>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
          pointerEvents: 'none', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '40%', height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(216,179,63,0.04), transparent)',
            animation: 'titleScan 6s linear infinite',
          }} />
          {/* Bottom accent line */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg, transparent, ${BASE.gold}55, ${BASE.gold}88, ${BASE.gold}55, transparent)`,
          }} />
        </div>

        {/* CENTER — Agent buttons (always visible) */}
        <div className="no-drag" style={{
          position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          pointerEvents: 'none',
        }}>
          {([
            { type: 'exegetical'  as const, icon: 'α',  label: 'EXEGETICAL',  color: BASE.khaki },
            { type: 'theological' as const, icon: '✝',  label: 'THEOLOGICAL', color: BASE.gold },
            { type: 'homiletical' as const, icon: '◈',  label: 'HOMILETICAL', color: BASE.moss },
          ] as const).map(agent => (
            <button
              key={agent.type}
              onClick={() => setAgentPanel(agent.type)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                background: `${agent.color}14`, border: `1px solid ${agent.color}40`,
                transition: 'all 0.18s', pointerEvents: 'auto',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${agent.color}26`; e.currentTarget.style.borderColor = `${agent.color}70` }}
              onMouseLeave={e => { e.currentTarget.style.background = `${agent.color}14`; e.currentTarget.style.borderColor = `${agent.color}40` }}
            >
              <span style={{
                fontFamily: agent.type === 'exegetical' ? 'Crimson Pro, serif' : 'JetBrains Mono',
                fontSize: agent.type === 'exegetical' ? 14 : 11,
                color: agent.color, lineHeight: 1,
              }}>{agent.icon}</span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6, letterSpacing: '0.1em', color: agent.color, opacity: 0.8 }}>{agent.label}</span>
            </button>
          ))}
        </div>

        {/* LEFT — BASE 1520 mark */}
        <div className="no-drag" style={{
          marginLeft: 72, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          {/* BASE B icon mark */}
          <img src="/b-icon.png" alt="BASE" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />
          <div>
            <div style={{
              fontFamily: 'JetBrains Mono', fontSize: 11, color: BASE.gold,
              letterSpacing: '0.22em', fontWeight: 700, lineHeight: 1,
            }}>BASE 1520</div>
            <div style={{
              fontFamily: 'JetBrains Mono', fontSize: 6.5, color: BASE.steel,
              letterSpacing: '0.16em', marginTop: 2,
            }}>SCRIPTURE STUDY · v2</div>
          </div>
          <div style={{ width: 1, height: 24, background: BASE.borderGold, marginLeft: 4 }} />
          {/* System status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: loading ? BASE.gold : BASE.moss,
              boxShadow: loading ? `0 0 8px ${BASE.gold}` : `0 0 5px ${BASE.moss}`,
              animation: loading ? 'hudBlink 0.8s ease infinite' : 'none',
            }} />
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 6.5, color: loading ? BASE.gold : BASE.steel,
              letterSpacing: '0.12em',
            }}>
              {loading ? 'PROCESSING' : analysis ? 'ANALYSIS READY' : 'SYS ONLINE'}
            </span>
          </div>
        </div>

        {/* RIGHT — controls */}
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {analysis && (
            <button
              onClick={() => setTab(tab === 'scholar' ? 'desk' : 'scholar')}
              title="Scholar Chat"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                background: tab === 'scholar' ? `${BASE.khaki}22` : `${BASE.khaki}0a`,
                border: `1px solid ${tab === 'scholar' ? `${BASE.khaki}70` : `${BASE.khaki}30`}`,
                transition: 'all 0.18s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${BASE.khaki}22`; e.currentTarget.style.borderColor = `${BASE.khaki}60` }}
              onMouseLeave={e => { e.currentTarget.style.background = tab === 'scholar' ? `${BASE.khaki}22` : `${BASE.khaki}0a`; e.currentTarget.style.borderColor = tab === 'scholar' ? `${BASE.khaki}70` : `${BASE.khaki}30` }}
            >
              <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.khaki, lineHeight: 1 }}>λ</span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 6, letterSpacing: '0.1em', color: BASE.khaki, opacity: 0.8 }}>SCHOLAR</span>
            </button>
          )}
          <button onClick={() => setShowBookCompass(true)} title="Book Compass" style={iconBtn}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="7" stroke={BASE.boneDim} strokeWidth="1" />
              {/* Cardinal ticks */}
              <line x1="8" y1="1.5" x2="8" y2="3.2" stroke={BASE.boneDim} strokeWidth="1" strokeLinecap="round"/>
              <line x1="8" y1="12.8" x2="8" y2="14.5" stroke={BASE.boneDim} strokeWidth="1" strokeLinecap="round"/>
              <line x1="1.5" y1="8" x2="3.2" y2="8" stroke={BASE.boneDim} strokeWidth="1" strokeLinecap="round"/>
              <line x1="12.8" y1="8" x2="14.5" y2="8" stroke={BASE.boneDim} strokeWidth="1" strokeLinecap="round"/>
              {/* North needle — gold */}
              <polygon points="8,3.5 6.5,8 8,7 9.5,8" fill={BASE.gold} />
              {/* South needle — dim */}
              <polygon points="8,12.5 6.5,8 8,9 9.5,8" fill={BASE.boneDim} opacity="0.45" />
            </svg>
          </button>
          <button onClick={() => setShowSeries(true)} title="Sermon Series" style={iconBtn}>≡</button>
          {analysis && (
            <button onClick={handleExport} title="Export Preaching Notes" style={iconBtn}>↓</button>
          )}
          <HistoryPanel onLoad={handleLoadHistory} currentRef={analysis?.reference} />
          <button
            onClick={() => setShowFeatureTour(t => !t)}
            title="Features & Tips"
            style={{
              ...iconBtn,
              ...(showFeatureTour ? { background: `${BASE.gold}22`, borderColor: `${BASE.gold}70`, color: BASE.gold } : {}),
            }}
          >?</button>
          <button onClick={() => setShowKeyModal(true)} style={iconBtn}>⚙</button>
        </div>
      </div>

      {/* ── Canonical strip ────────────────────────────────────────────────────── */}
      {analysis && (
        <div style={{ flexShrink: 0, background: BASE.bgMid, borderBottom: `1px solid ${BASE.borderDim}` }}>
          <CanonicalStrip context={analysis.canonicalContext} reference={analysis.reference} genre={analysis.genre} />
          <CrossRefs analysis={analysis} apiKey={apiKey} onLoadRef={handleLoadRef} phraseMode={phraseMode} onPhraseModeChange={setPhraseMode} />
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Sidebar */}
        <div style={{
          width: 286, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: `${BASE.bg}ee`,
          backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
          borderRight: `1px solid ${BASE.borderGold}`,
        }}>
          <PassageInput
            onAnalyze={handleAnalyze} loading={loading}
            prefillRef={prefillRef} onPrefillUsed={() => setPrefillRef(null)} esvKey={esvKey}
            onExpandPassage={(text, reference) => setPassagePanel({ text, reference })}
          />
          {analysis && (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {(analysis.culturalNotes?.length ?? 0) > 0 && (
                <CulturalNotesPanel
                  notes={analysis.culturalNotes!}
                  selectedPhraseId={selectedPhraseId}
                  onSelectPhrase={setSelectedPhraseId}
                />
              )}
              <CommentaryPanel
                reference={analysis.reference}
                mainTheme={analysis.mainTheme}
                apiKey={apiKey}
              />
            </div>
          )}
        </div>

        {/* Passage panel — slides in between sidebar and canvas */}
        <AnimatePresence>
          {passagePanel && (
            <PassagePanel
              text={passagePanel.text}
              reference={passagePanel.reference}
              onClose={() => setPassagePanel(null)}
            />
          )}
        </AnimatePresence>

        {/* Canvas */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Starfield />

          {/* Loading — thinking display */}
          {loading && <ThinkingDisplay />}

          {/* Error */}
          {error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
              <div style={{
                background: `${BASE.bg}f0`, backdropFilter: 'blur(24px)',
                border: `1px solid ${BASE.red}66`,
                padding: '28px 32px', maxWidth: 420, textAlign: 'center', position: 'relative',
              }}>
                {/* Corner brackets */}
                {[['top:0,left:0','top','left'],['top:0,right:0','top','right'],['bottom:0,left:0','bottom','left'],['bottom:0,right:0','bottom','right']].map(([,v,h]) => (
                  <svg key={`${v}${h}`} width={12} height={12} style={{ position:'absolute', [v]:0, [h]:0 }}>
                    {v==='top'&&h==='left'&&<><line x1={0} y1={12} x2={0} y2={0} stroke={BASE.red} strokeWidth={1.5}/><line x1={0} y1={0} x2={12} y2={0} stroke={BASE.red} strokeWidth={1.5}/></>}
                    {v==='top'&&h==='right'&&<><line x1={12} y1={12} x2={12} y2={0} stroke={BASE.red} strokeWidth={1.5}/><line x1={12} y1={0} x2={0} y2={0} stroke={BASE.red} strokeWidth={1.5}/></>}
                    {v==='bottom'&&h==='left'&&<><line x1={0} y1={0} x2={0} y2={12} stroke={BASE.red} strokeWidth={1.5}/><line x1={0} y1={12} x2={12} y2={12} stroke={BASE.red} strokeWidth={1.5}/></>}
                    {v==='bottom'&&h==='right'&&<><line x1={12} y1={0} x2={12} y2={12} stroke={BASE.red} strokeWidth={1.5}/><line x1={12} y1={12} x2={0} y2={12} stroke={BASE.red} strokeWidth={1.5}/></>}
                  </svg>
                ))}
                <div style={{ fontFamily:'JetBrains Mono', fontSize:7, letterSpacing:'0.18em', color:BASE.red, marginBottom:12 }}>
                  ⚠ SYSTEM FAULT
                </div>
                <p style={{ fontFamily:'Crimson Pro, serif', fontSize:13.5, color:BASE.boneMid, lineHeight:1.6, margin:0 }}>
                  {error.includes('overloaded') || error.includes('529')
                    ? 'API servers overloaded. Retried 4 times. Try again in a few minutes.'
                    : error}
                </p>
                <button onClick={() => setError(null)} style={{
                  marginTop: 20,
                  background: `${BASE.red}11`, border: `1px solid ${BASE.red}44`,
                  padding: '6px 24px', color: BASE.red,
                  fontFamily: 'JetBrains Mono', fontSize: 8, cursor: 'pointer', letterSpacing: '0.14em',
                }}>[ DISMISS ]</button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && !analysis && tab !== 'scholar' && (
            <CorePulse onSwitchTab={t => setTab(t as Tab)} onOpenAgent={setAgentPanel} currentTab={tab} />
          )}

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {/* Desk — phrase tree + outline + cultural notes + draft on one infinite canvas */}
            {!loading && !error && analysis && tab === 'desk' && (
              <motion.div key="desk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }} style={{ position: 'absolute', inset: 0 }}>
                <Desk
                  analysis={analysis}
                  annotations={annotations}
                  onAnnotate={handleAnnotate}
                  onWordClick={handleWordClick}
                  culturalPhraseIds={culturalPhraseIds}
                  selectedPhraseId={selectedPhraseId}
                  onSelectPhrase={setSelectedPhraseId}
                  apiKey={apiKey}
                  historyId={currentHistoryId}
                  initialDraft={agentDraftSkeleton ?? savedDraft}
                  onDraftChange={(text) => setSavedDraft(text)}
                  phraseMode={phraseMode}
                  onPhraseModeChange={setPhraseMode}
                />
                <WordStudyDrawer
                  study={wordStudy}
                  loading={wordStudyLoading}
                  onClose={() => { setWordStudy(null); setWordStudyLoading(false) }}
                />
              </motion.div>
            )}

            {/* Scholar chat */}
            {!loading && !error && tab === 'scholar' && (
              <motion.div key="scholar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }} style={{ position: 'absolute', inset: 0 }}>
                <PanelGroup orientation="horizontal" style={{ position: 'absolute', inset: 0 }}>
                  <Panel defaultSize={62} minSize={35}>
                    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                      <ScholarChat
                        inline
                        analysis={analysis}
                        apiKey={apiKey}
                        onOpenProfile={() => setProfileOpen(true)}
                        historyId={currentHistoryId}
                        initialMessages={savedChat}
                      />
                    </div>
                  </Panel>
                  <PanelResizeHandle style={{ width: 4, background: BASE.borderDim, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 2, height: 32, background: BASE.border, borderRadius: 2 }} />
                  </PanelResizeHandle>
                  <Panel defaultSize={38} minSize={22}>
                    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                      <CorePulse onSwitchTab={t => setTab(t as Tab)} onOpenAgent={setAgentPanel} currentTab={tab} />
                    </div>
                  </Panel>
                </PanelGroup>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {showKeyModal && (
        <ApiKeyModal onSave={handleSaveKey} onClose={() => setShowKeyModal(false)} existingKey={apiKey} existingEsvKey={esvKey} />
      )}

      {/* Agent chat panels */}
      <AnimatePresence>
        {agentPanel && (
          <AgentChat
            key={agentPanel}
            agentType={agentPanel}
            analysis={analysis}
            apiKey={apiKey}
            onClose={() => setAgentPanel(null)}
            onPushToDraft={(content) => {
              setAgentDraftSkeleton(content)
              setTab('desk')
              setAgentPanel(null)
            }}
          />
        )}
      </AnimatePresence>

      <ScholarProfile
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        apiKey={apiKey}
      />

      {showOnboarding && (
        <Onboarding onComplete={() => {
          setShowOnboarding(false)
          // Prompt setup wizard after tour if profile likely empty
          ;(window as any).electronAPI.profileGet().then((p: any) => {
            if (!p?.identity?.trim()) setShowSetupWizard(true)
          }).catch(() => {})
        }} />
      )}

      <AnimatePresence>
        {showSetupWizard && (
          <SetupWizard onComplete={() => setShowSetupWizard(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFeatureTour && (
          <FeatureTour onClose={() => setShowFeatureTour(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBookCompass && (
          <BookCompass
            onClose={() => setShowBookCompass(false)}
            onNavigate={(ref) => { setPrefillRef(ref); setShowBookCompass(false) }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSeries && (
          <SeriesPanel
            isOpen={showSeries}
            onClose={() => setShowSeries(false)}
            currentAnalysis={analysis}
            apiKey={apiKey}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%',
  border: `1px solid ${BASE.borderDim}`,
  background: 'rgba(16,18,15,0.4)',
  color: BASE.boneDim,
  cursor: 'pointer', fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// ── Export HTML builder — pulpit-ready preaching notes ────────────────────────
function buildExportHtml(analysis: PhrasingAnalysis, annotations: Record<string, string>) {
  const outlineHtml = analysis.outline.map(p =>
    `<div class="point">
      <div class="point-head"><span class="point-num">${p.point}</span> <span class="point-label">${p.label}</span></div>
      ${(p.sub ?? []).map(s => `<div class="sub-point"><span class="point-num">${s.point}</span> ${s.label}</div>`).join('')}
    </div>`
  ).join('')

  const annotated = analysis.phrases.filter(p => annotations[p.id])
  const annotationsHtml = annotated.map(p =>
    `<div class="annotation-item">
      <div class="ann-phrase">"${p.text}"</div>
      <div class="ann-note">${annotations[p.id]}</div>
    </div>`
  ).join('')

  const culturalHtml = (analysis.culturalNotes ?? []).map(n =>
    `<div class="cultural-note">
      <div class="cn-header">
        <span class="cn-term">${n.term}</span>
        <span class="cn-cat">${n.category.replace(/-/g,' ')}</span>
      </div>
      <p class="cn-body">${n.explanation}</p>
      <p class="cn-sig">↳ ${n.significance}</p>
    </div>`
  ).join('')

  const phrasesHtml = analysis.phrases.map(p =>
    `<div class="phrase" style="margin-left:${Math.min(p.level,3) * 20}px">
      <span class="ptype">${p.type}${p.connective ? ` · <em>${p.connective}</em>` : ''}</span>
      <span class="ptext">${p.text}</span>
      ${p.theologicalNote ? `<span class="pnote">— ${p.theologicalNote}</span>` : ''}
      ${annotations[p.id] ? `<div class="pann">✎ ${annotations[p.id]}</div>` : ''}
    </div>`
  ).join('')

  const themes = (analysis.canonicalContext?.biblicalThemes ?? []).map(t => `<span class="theme-pill">${t}</span>`).join('')
  const keywords = (analysis.canonicalContext?.keyWords ?? []).map(w => `<span class="kw-pill">${w}</span>`).join('')

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>${analysis.reference} — Preaching Notes</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'EB Garamond',Georgia,serif;background:#FAFAF7;color:#1A2010;line-height:1.7;font-size:16px}
  .page{max-width:720px;margin:0 auto;padding:48px 40px}
  /* Header */
  .header{border-bottom:2px solid #3E5229;padding-bottom:20px;margin-bottom:28px}
  .ref{font-size:36px;font-weight:600;color:#1A2010;letter-spacing:-.01em;line-height:1.1}
  .byline{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.18em;color:#6E7568;margin-top:6px;text-transform:uppercase}
  .big-idea{background:#fff;border-left:4px solid #D8B33F;padding:14px 18px;border-radius:0 8px 8px 0;margin:20px 0;font-size:17px;font-style:italic;color:#1A2010;line-height:1.6}
  /* Chips */
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 20px}
  .theme-pill{background:#EDF2E8;border:1px solid #A0AF84;color:#3E5229;font-size:12px;padding:2px 10px;border-radius:12px}
  .kw-pill{background:#FDF8EC;border:1px solid #D8B33F88;color:#8A6E20;font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 9px;border-radius:12px;letter-spacing:.03em}
  /* Sections */
  .section{margin-bottom:32px}
  .section-head{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.18em;color:#3E5229;text-transform:uppercase;border-bottom:1px solid #C8C4B0;padding-bottom:6px;margin-bottom:14px}
  /* Outline */
  .point{margin-bottom:12px}
  .point-head{display:flex;gap:10px;align-items:baseline}
  .point-num{font-family:'JetBrains Mono',monospace;font-size:11px;color:#3E5229;font-weight:500;flex-shrink:0}
  .point-label{font-size:16px;color:#1A2010;font-weight:600}
  .sub-point{display:flex;gap:10px;margin-left:28px;margin-top:5px;font-size:14px;color:#4A5840}
  /* Phrases */
  .phrase{margin-bottom:10px;display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;border-left:2px solid #D0CCBA;padding-left:10px}
  .ptype{font-family:'JetBrains Mono',monospace;font-size:8px;color:#6E7568;text-transform:uppercase;letter-spacing:.08em;flex-shrink:0}
  .ptext{font-size:15px;color:#1A2010}
  .pnote{font-size:12px;color:#8A6E20;font-style:italic}
  .pann{width:100%;font-size:13px;color:#5A7040;border-top:1px dashed #C8C4B0;padding-top:4px;margin-top:4px}
  /* Cultural notes */
  .cultural-note{margin-bottom:14px;border-left:3px solid #D8B33F;padding:10px 14px;background:#fff;border-radius:0 8px 8px 0;page-break-inside:avoid}
  .cn-header{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .cn-term{font-size:15px;font-weight:600;color:#1A2010}
  .cn-cat{font-family:'JetBrains Mono',monospace;font-size:9px;color:#6E7568;background:#F0EDE6;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:.06em}
  .cn-body{font-size:14px;color:#2A3020;line-height:1.65;margin-bottom:6px}
  .cn-sig{font-size:13px;font-style:italic;color:#6E7568}
  /* Annotations */
  .annotation-item{margin-bottom:12px;padding:10px 14px;background:#FDF8EC;border:1px solid #D8B33F44;border-radius:8px}
  .ann-phrase{font-size:13px;font-style:italic;color:#6E7568;margin-bottom:4px}
  .ann-note{font-size:14px;color:#1A2010;line-height:1.6}
  /* Canon */
  .canon-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .canon-item{background:#fff;border:1px solid #D0CCBA;border-radius:8px;padding:12px 14px}
  .canon-label{font-family:'JetBrains Mono',monospace;font-size:8px;color:#6E7568;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
  .canon-value{font-size:14px;color:#1A2010;line-height:1.5}
  /* Notes lines */
  .notes-lines{margin-top:8px}
  .note-line{border-bottom:1px solid #D0CCBA;height:32px;margin-bottom:0}
  @media print{
    body{background:#fff} .page{padding:24px 32px}
    .big-idea{border-left:3px solid #D8B33F}
    a{text-decoration:none}
  }
</style></head>
<body><div class="page">

<div class="header">
  <div class="ref">${analysis.reference}</div>
  <div class="byline">Preaching Notes · BASE 1520 · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
</div>

<div class="big-idea">${analysis.mainTheme}</div>

${themes || keywords ? `<div class="chips">${themes}${keywords}</div>` : ''}

<div class="section">
  <div class="section-head">Sermon Outline</div>
  ${outlineHtml}
</div>

${culturalHtml ? `<div class="section">
  <div class="section-head">Cultural Context</div>
  ${culturalHtml}
</div>` : ''}

<div class="section">
  <div class="section-head">Phrase Structure</div>
  ${phrasesHtml}
</div>

${annotationsHtml ? `<div class="section">
  <div class="section-head">Study Notes</div>
  ${annotationsHtml}
</div>` : ''}

<div class="section">
  <div class="section-head">Canonical Context</div>
  <div class="canon-grid">
    <div class="canon-item"><div class="canon-label">Book Theme</div><div class="canon-value">${analysis.canonicalContext?.bookTheme ?? ''}</div></div>
    <div class="canon-item"><div class="canon-label">Passage Role</div><div class="canon-value">${analysis.canonicalContext?.passageRole ?? ''}</div></div>
    <div class="canon-item" style="grid-column:1/-1"><div class="canon-label">Canonical Connections</div><div class="canon-value">${analysis.canonicalContext?.canonicalConnections ?? ''}</div></div>
  </div>
</div>

<div class="section">
  <div class="section-head">Pulpit Notes</div>
  <div class="notes-lines">
    ${Array(10).fill('<div class="note-line"></div>').join('')}
  </div>
</div>

</div></body></html>`
}
