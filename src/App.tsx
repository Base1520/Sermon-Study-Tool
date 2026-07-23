import { useState, useCallback, useMemo, useEffect, lazy, Suspense } from 'react'
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
import { IntentCard, QuestionsCard } from './components/SidebarIntel'
import { CovenantRail } from './components/CovenantRail'
import { ScholarChat } from './components/ScholarChat'
import { ScholarProfile } from './components/ScholarProfile'
import { AgentChat } from './components/AgentChat'
import type { AgentType } from './components/AgentChat'
import { Onboarding, shouldShowOnboarding } from './components/Onboarding'
import { PassagePanel } from './components/PassagePanel'
import { CommentaryPanel } from './components/CommentaryPanel'
import { SetupWizard } from './components/SetupWizard'
import bIcon from './assets/b-icon.png'
// Heavy panels — lazy-loaded so they don't weigh down cold start
const SeriesPanel     = lazy(() => import('./components/SeriesPanel').then(m => ({ default: m.SeriesPanel })))
const FeatureTour     = lazy(() => import('./components/FeatureTour').then(m => ({ default: m.FeatureTour })))
const ExegesisAcademy = lazy(() => import('./components/ExegesisAcademy').then(m => ({ default: m.ExegesisAcademy })))
const BetaFeedback    = lazy(() => import('./components/BetaFeedback').then(m => ({ default: m.BetaFeedback })))
const BookCompass     = lazy(() => import('./components/BookCompass').then(m => ({ default: m.BookCompass })))
const HymnSelector    = lazy(() => import('./components/HymnSelector').then(m => ({ default: m.HymnSelector })))
const CommandPalette  = lazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })))
const SermonCalendar  = lazy(() => import('./components/SermonCalendar').then(m => ({ default: m.SermonCalendar })))
const PreachChecklist = lazy(() => import('./components/PreachChecklist').then(m => ({ default: m.PreachChecklist })))
const RehearsalReview = lazy(() => import('./components/RehearsalReview').then(m => ({ default: m.RehearsalReview })))
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
  const [showHymns, setShowHymns] = useState(false)
  const [showBookCompass, setShowBookCompass] = useState(false)
  const [showAcademy, setShowAcademy] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [showRehearsal, setShowRehearsal] = useState(false)

  // ⌘K / Ctrl+K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowPalette(p => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [savedDraft, setSavedDraft] = useState<string | undefined>(undefined)
  const [agentDraftSkeleton, setAgentDraftSkeleton] = useState<string | undefined>(undefined)
  const [savedChat, setSavedChat] = useState<ChatMessage[] | undefined>(undefined)
  const [passagePanel, setPassagePanel] = useState<{ text: string; reference: string } | null>(null)
  const [phraseMode, setPhraseMode] = useState<'key' | 'all'>('key')

  // Pull keys from Documents/BASE1520/keys.txt on launch — the one-folder setup.
  // Non-empty file values win over what's stored, so rotating a key = edit the file.
  useEffect(() => {
    ;(window as any).electronAPI.getLocalKeys?.().then((k: any) => {
      if (!k) return
      if (k.ANTHROPIC_KEY) {
        setApiKey(k.ANTHROPIC_KEY); localStorage.setItem('sermon-tool-key', k.ANTHROPIC_KEY)
        setShowKeyModal(false)
      }
      if (k.ESV_KEY)    { setEsvKey(k.ESV_KEY); localStorage.setItem('sermon-tool-esv-key', k.ESV_KEY) }
      if (k.OPENAI_KEY) { localStorage.setItem('sermon-tool-openai-key', k.OPENAI_KEY) }
    }).catch(() => {})
  }, [])

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

  const handleSaveKey = useCallback((key: string, esv = '') => {
    const cleanKey = key.trim()
    const cleanEsv = esv.trim()
    setApiKey(cleanKey); localStorage.setItem('sermon-tool-key', cleanKey)
    if (cleanEsv) { setEsvKey(cleanEsv); localStorage.setItem('sermon-tool-esv-key', cleanEsv) }
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
      const result = await (window as any).electronAPI.analyzePassage({ text, reference, apiKey, streamId: `an-${Date.now()}` })
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

  const handleExportStudyNotes = useCallback(async () => {
    if (!analysis) return
    const html = buildStudyNotesHtml(analysis)
    await (window as any).electronAPI.exportPdf({ html, reference: `${analysis.reference} Study Notes` })
  }, [analysis])

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
        position: 'relative', zIndex: 60,
      }}>
        {/* HUD scan line in title bar */}
        <style>{`
          @keyframes titleScan {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
          @keyframes hudBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
          .tab-hud:hover:not(:disabled) { background: rgba(229,190,73,0.08) !important; }
          .hud-tip { position: relative; }
          .hud-tip:hover::after {
            content: attr(data-tip);
            position: absolute; top: 36px; right: 0;
            background: #1c2314; color: #E5BE49;
            border: 1px solid rgba(229,190,73,0.4);
            font-family: 'Saira', sans-serif; font-size: 11px;
            letter-spacing: 0.12em; padding: 3px 9px; border-radius: 5px;
            white-space: nowrap; z-index: 10000; pointer-events: none;
            box-shadow: 0 6px 18px rgba(0,0,0,0.5);
          }
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


        {/* LEFT — BASE 1520 mark (margin clears macOS traffic lights; none on Windows) */}
        <div className="no-drag" style={{
          marginLeft: (window as any).electronAPI?.platform === 'darwin' ? 72 : 12,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 1, minWidth: 0,
        }}>
          {/* BASE B icon mark */}
          <img src={bIcon} alt="BASE" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />
          <div>
            <div style={{
              fontFamily: 'Saira', fontSize: 17, color: BASE.gold,
              letterSpacing: '0.18em', lineHeight: 1,
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
              fontFamily: 'Courier Prime, monospace', fontSize: 8, color: loading ? BASE.gold : BASE.steel,
              letterSpacing: '0.1em', whiteSpace: 'nowrap', overflow: 'hidden',
              textOverflow: 'ellipsis', maxWidth: 170, display: 'inline-block',
            }}>
              {loading ? 'ANALYZING…' : analysis ? `OP · ${analysis.reference.toUpperCase()}` : 'STANDING BY'}
            </span>
          </div>
        </div>

        {/* CENTER — Agent buttons (in-flow: cannot overlap at any zoom) */}
        <div className="no-drag" style={{
          flex: 1, minWidth: 0, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'safe center', gap: 6,
          padding: '0 8px',
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
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0,
                padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                background: `${agent.color}14`, border: `1px solid ${agent.color}40`,
                transition: 'all 0.18s',
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
          <button onClick={() => setShowBookCompass(true)} data-tip="BOOK COMPASS" className="hud-tip" style={iconBtn}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1" opacity="0.7"/>
              <line x1="8" y1="1.5" x2="8" y2="3.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              <line x1="8" y1="12.8" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              <line x1="1.5" y1="8" x2="3.2" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              <line x1="12.8" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              <polygon points="8,3.5 6.5,8 8,7 9.5,8" fill={BASE.gold}/>
              <polygon points="8,12.5 6.5,8 8,9 9.5,8" fill="#c05050" opacity="0.85"/>
            </svg>
          </button>
          <button onClick={() => setShowSeries(true)} data-tip="SERMON SERIES" className="hud-tip" style={iconBtn}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}>≡</button>
          {analysis && (<>
            <button onClick={() => setShowHymns(true)} data-tip="WORSHIP PLANNING" className="hud-tip" style={iconBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}>♪</button>
            <button onClick={handleExport} data-tip="EXPORT PREACHING NOTES" className="hud-tip" style={{ ...iconBtn, fontSize: 15, fontWeight: 700 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}>↓</button>
            <button onClick={handleExportStudyNotes} data-tip="EXPORT STUDY NOTES" className="hud-tip" style={iconBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}>⇩</button>
          </>)}
          <HistoryPanel onLoad={handleLoadHistory} currentRef={analysis?.reference} />
          <button onClick={() => setShowRehearsal(t => !t)} data-tip="DELIVERY REVIEW" className="hud-tip"
            style={{ ...iconBtn, ...(showRehearsal ? { color: BASE.gold, borderColor: `${BASE.gold}55` } : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
            onMouseLeave={e => { if (!showRehearsal) { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim } }}>
            ⏺
          </button>
          <button onClick={() => setShowChecklist(t => !t)} data-tip="FINAL CLEARANCE" className="hud-tip"
            style={{ ...iconBtn, ...(showChecklist ? { color: BASE.gold, borderColor: `${BASE.gold}55` } : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
            onMouseLeave={e => { if (!showChecklist) { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim } }}>
            ☑
          </button>
          <button onClick={() => setShowCalendar(t => !t)} data-tip="SERMON CALENDAR" className="hud-tip"
            style={{ ...iconBtn, ...(showCalendar ? { color: BASE.gold, borderColor: `${BASE.gold}55` } : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
            onMouseLeave={e => { if (!showCalendar) { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim } }}>
            ▦
          </button>
          <button onClick={() => setShowFeedback(t => !t)} data-tip="BETA FEEDBACK" className="hud-tip"
            style={{ ...iconBtn, ...(showFeedback ? { color: BASE.gold, borderColor: `${BASE.gold}55` } : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
            onMouseLeave={e => { if (!showFeedback) { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim } }}>
            ✉
          </button>
          <button onClick={() => setShowAcademy(t => !t)} data-tip="EXEGESIS ACADEMY" className="hud-tip"
            style={{ ...iconBtn, ...(showAcademy ? { color: BASE.gold, borderColor: `${BASE.gold}55` } : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
            onMouseLeave={e => { if (!showAcademy) { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim } }}>
            ◎
          </button>
          <button onClick={() => setShowFeatureTour(t => !t)} data-tip="FEATURES & TIPS" className="hud-tip"
            style={{ ...iconBtn, ...(showFeatureTour ? { color: BASE.gold, borderColor: `${BASE.gold}55` } : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
            onMouseLeave={e => { if (!showFeatureTour) { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim } }}>?</button>
          <button onClick={() => setShowKeyModal(true)} data-tip="SETTINGS" className="hud-tip" style={iconBtn}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}>⚙</button>
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
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: 14 }}>
              {/* Commentary front and center — no scrolling to find it */}
              <CommentaryPanel
                reference={analysis.reference}
                mainTheme={analysis.mainTheme}
                apiKey={apiKey}
              />
              {/* Study anchors — intent + questions (cultural notes live on the desk tile) */}
              <IntentCard intent={(analysis as any).authorIntent} />
              <QuestionsCard questions={(analysis as any).questionsToConsider} />
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
                transition={{ duration: 0.2 }} style={{ position: 'absolute', inset: 0, display: 'flex' }}>
                {/* COVENANT Mission Rail — the framework as the app's spine */}
                <CovenantRail
                  analysis={analysis}
                  savedDraft={savedDraft}
                  onAction={(action) => {
                    if (action === 'agent-exegetical')  setAgentPanel('exegetical')
                    if (action === 'agent-theological') setAgentPanel('theological')
                    if (action === 'agent-homiletical') setAgentPanel('homiletical')
                    if (action === 'compass')   setShowBookCompass(true)
                    if (action === 'checklist') setShowChecklist(true)
                    if (action === 'scholar')   setTab('scholar')
                  }}
                />
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <Desk
                  analysis={analysis}
                  annotations={annotations}
                  onAnnotate={handleAnnotate}
                  onWordClick={handleWordClick}
                  culturalPhraseIds={culturalPhraseIds}
                  selectedPhraseId={selectedPhraseId}
                  onSelectPhrase={setSelectedPhraseId}
                  apiKey={apiKey}
                  esvKey={esvKey}
                  historyId={currentHistoryId}
                  initialDraft={agentDraftSkeleton ?? savedDraft}
                  onDraftChange={(text) => setSavedDraft(text)}
                  phraseMode={phraseMode}
                  onPhraseModeChange={setPhraseMode}
                  onLoadRef={handleLoadRef}
                />
                <WordStudyDrawer
                  study={wordStudy}
                  loading={wordStudyLoading}
                  onClose={() => { setWordStudy(null); setWordStudyLoading(false) }}
                />
                </div>
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
        <ApiKeyModal onSave={handleSaveKey} onClose={() => setShowKeyModal(false)} existingKey={apiKey} existingEsvKey={esvKey}
          onDemo={() => {
            import('./data/demoAnalysis').then(m => {
              setAnalysis(m.DEMO_ANALYSIS as any)
              setCurrentHistoryId(null)
              setShowKeyModal(false)
              setTab('desk')
            })
          }}
        />
      )}

      <Suspense fallback={null}>
      {showHymns && analysis && (
        <HymnSelector
          reference={analysis.reference}
          mainTheme={analysis.mainTheme}
          outline={analysis.outline}
          apiKey={apiKey}
          onClose={() => setShowHymns(false)}
        />
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
        {showFeedback && (
          <BetaFeedback
            onClose={() => setShowFeedback(false)}
            isAdmin={import.meta.env.VITE_ADMIN === 'true'}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAcademy && (
          <ExegesisAcademy onClose={() => setShowAcademy(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBookCompass && (
          <BookCompass
            initialBook={analysis?.reference}
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

      <AnimatePresence>
        {showRehearsal && (
          <RehearsalReview
            apiKey={apiKey}
            reference={analysis?.reference}
            savedDraft={savedDraft}
            onClose={() => setShowRehearsal(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showChecklist && (
          <PreachChecklist
            analysis={analysis as any}
            apiKey={apiKey}
            savedDraft={savedDraft}
            onClose={() => setShowChecklist(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCalendar && (
          <SermonCalendar
            onClose={() => setShowCalendar(false)}
            onLoadReference={(ref) => setPrefillRef(ref)}
            currentReference={analysis?.reference}
          />
        )}
      </AnimatePresence>

      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          onGoToReference={(ref) => setPrefillRef(ref)}
          onLoadHistory={handleLoadHistory}
          actions={[
            { id: 'checks',   icon: '☑', label: 'Open Pre-Preach Checks',       run: () => setShowChecklist(true) },
            { id: 'review',   icon: '⏺', label: 'Open Delivery Review',         run: () => setShowRehearsal(true) },
            { id: 'calendar', icon: '▦', label: 'Open Sermon Calendar',        run: () => setShowCalendar(true) },
            { id: 'compass',  icon: '◉', label: 'Open Book Compass',          run: () => setShowBookCompass(true) },
            { id: 'series',   icon: '≡', label: 'Open Sermon Series',          run: () => setShowSeries(true) },
            { id: 'academy',  icon: '◎', label: 'Open Exegesis Academy',       run: () => setShowAcademy(true) },
            { id: 'feedback', icon: '✉', label: 'Open Beta Feedback',          run: () => setShowFeedback(true) },
            { id: 'hymns',    icon: '♪', label: 'Open Worship Planning',       run: () => setShowHymns(true) },
            { id: 'tour',     icon: '?', label: 'Open Features & Tips',        run: () => setShowFeatureTour(true) },
            { id: 'profile',  icon: '⚈', label: 'Open Scholar Profile',        run: () => setProfileOpen(true) },
            { id: 'settings', icon: '⚙', label: 'Open Settings (API Keys)',    run: () => setShowKeyModal(true) },
          ]}
        />
      )}
      </Suspense>
    </div>
  )
}

// ── Study Notes export — congregation handout ────────────────────────────────
function buildStudyNotesHtml(analysis: PhrasingAnalysis) {
  const outlineHtml = analysis.outline.map(p =>
    `<div class="point">
      <div class="point-row">
        <span class="point-num">${p.point}</span>
        <span class="point-label">${p.label}</span>
      </div>
      <div class="fill-line"></div>
      ${(p.sub ?? []).map(s => `
        <div class="sub-row">
          <span class="sub-num">${s.point}</span>
          <span class="sub-label">${s.label}</span>
        </div>
        <div class="fill-line fill-line--sub"></div>
      `).join('')}
    </div>`
  ).join('')

  const culturalHtml = (analysis.culturalNotes ?? []).slice(0, 4).map(n =>
    `<div class="cultural-note">
      <span class="cn-term">${n.term}</span>
      <span class="cn-cat">${n.category.replace(/-/g,' ')}</span>
      <p class="cn-body">${n.significance}</p>
    </div>`
  ).join('')

  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>${analysis.reference} — Study Notes</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'EB Garamond',Georgia,serif;background:#fff;color:#1A2010;font-size:15px;line-height:1.6}
  .page{max-width:680px;margin:0 auto;padding:40px 36px}
  .header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #3E5229;padding-bottom:16px;margin-bottom:24px}
  .ref{font-size:30px;font-weight:600;line-height:1.1}
  .date{font-family:'JetBrains Mono',monospace;font-size:8px;color:#6E7568;letter-spacing:.14em;text-transform:uppercase;margin-top:4px}
  .big-idea{background:#FDF8EC;border-left:4px solid #D8B33F;padding:12px 16px;margin-bottom:24px;border-radius:0 6px 6px 0}
  .bi-label{font-family:'JetBrains Mono',monospace;font-size:8px;color:#8A6E20;letter-spacing:.16em;text-transform:uppercase;margin-bottom:5px}
  .bi-text{font-size:16px;font-style:italic;color:#1A2010;line-height:1.55}
  .section{margin-bottom:28px}
  .section-head{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.18em;color:#3E5229;text-transform:uppercase;border-bottom:1px solid #C8C4B0;padding-bottom:5px;margin-bottom:14px}
  .point{margin-bottom:18px}
  .point-row{display:flex;gap:10px;align-items:baseline;margin-bottom:6px}
  .point-num{font-family:'JetBrains Mono',monospace;font-size:10px;color:#3E5229;font-weight:500;min-width:20px;flex-shrink:0}
  .point-label{font-size:15px;font-weight:600;color:#1A2010}
  .sub-row{display:flex;gap:10px;align-items:baseline;margin:6px 0 4px 24px}
  .sub-num{font-family:'JetBrains Mono',monospace;font-size:9px;color:#6E7568;min-width:16px;flex-shrink:0}
  .sub-label{font-size:14px;color:#3A4830}
  .fill-line{border-bottom:1px solid #D0CCBA;height:28px;margin:0 0 4px 0}
  .fill-line--sub{margin-left:24px}
  .cultural-note{margin-bottom:12px;padding:8px 12px;border:1px solid #D0CCBA;border-radius:6px;display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}
  .cn-term{font-weight:600;font-size:14px;color:#1A2010}
  .cn-cat{font-family:'JetBrains Mono',monospace;font-size:8px;color:#6E7568;background:#F0EDE6;padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.06em}
  .cn-body{width:100%;font-size:13px;color:#4A5840;line-height:1.55;margin-top:2px}
  .notes-block{margin-top:4px}
  .note-line{border-bottom:1px solid #D0CCBA;height:30px}
  @media print{body{background:#fff}.page{padding:24px 28px}}
</style></head>
<body><div class="page">

<div class="header">
  <div>
    <div class="ref">${analysis.reference}</div>
    <div class="date">${date}</div>
  </div>
</div>

<div class="big-idea">
  <div class="bi-label">Big Idea</div>
  <div class="bi-text">${analysis.mainTheme}</div>
</div>

<div class="section">
  <div class="section-head">Message Outline</div>
  ${outlineHtml}
</div>

${culturalHtml ? `<div class="section">
  <div class="section-head">Background</div>
  ${culturalHtml}
</div>` : ''}

<div class="section">
  <div class="section-head">Notes</div>
  <div class="notes-block">
    ${Array(12).fill('<div class="note-line"></div>').join('')}
  </div>
</div>

</div></body></html>`
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%',
  border: `1px solid ${BASE.borderDim}`,
  background: 'transparent',
  color: BASE.steel,
  cursor: 'pointer', fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
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
