import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from 'react'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { motion, AnimatePresence } from 'motion/react'
import { friendlyApiError, type FriendlyError } from './lib/apiErrors'
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
const BookCompass     = lazy(() => import('./components/BookCompass').then(m => ({ default: m.BookCompass })))
const HymnSelector    = lazy(() => import('./components/HymnSelector').then(m => ({ default: m.HymnSelector })))
const CommandPalette  = lazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })))
const SermonCalendar  = lazy(() => import('./components/SermonCalendar').then(m => ({ default: m.SermonCalendar })))
const PreachChecklist = lazy(() => import('./components/PreachChecklist').then(m => ({ default: m.PreachChecklist })))
const RehearsalReview = lazy(() => import('./components/RehearsalReview').then(m => ({ default: m.RehearsalReview })))
const PlainRead       = lazy(() => import('./components/PlainRead').then(m => ({ default: m.PlainRead })))
const StudyHistory    = lazy(() => import('./components/StudyHistory').then(m => ({ default: m.StudyHistory })))
const GroupGuide      = lazy(() => import('./components/GroupGuide').then(m => ({ default: m.GroupGuide })))
import { BASE } from './theme'
import type { PhrasingAnalysis, Phrase, WordStudy, HistoryEntry, ChatMessage, PlainReadDoc, PlainReadCorrection } from './types/phrasing'

type Tab = 'desk' | 'scholar'

/**
 * One finished block of a reading, as it comes off the engine on
 * 'plain-read-section'.
 *
 * Declared here rather than in types/phrasing.ts because the engine half of
 * this is being built in parallel and that file is not this agent's to move.
 * Every field is optional and `value` is `unknown` on purpose: this arrives
 * inside an event handler, and a renderer that trusts the shape of a message it
 * did not construct is a renderer that throws where nothing can catch it.
 *
 * `key` is a top-level field name of PlainReadDoc — 'situation', 'outline',
 * 'meaning', 'work', 'distance', 'application' and so on — with one reserved
 * exception: '__reset__' means a validation retry happened, so discard whatever
 * has been shown and start filling again. Silently.
 */
type PlainReadSectionMsg = {
  /** The token the renderer sent with this reading's plain-read call. */
  requestId?: string | null
  /** Which block this is, or '__reset__'. */
  key?: string
  /** The block, whole. Never a fragment, never appended to. */
  value?: unknown
}

/**
 * The six reasoning steps, plus the pathway that sits beside them. These are
 * the fields of `work` — the ONE top-level key that is not a block but a
 * container of six of them, and the reason a reader used to sit through a
 * ninety-second dead stretch: `work` could not be emitted until all eighteen
 * of its strings were written, which is the bulk of the document.
 *
 * Named here because this is where an incoming block gets placed, and placing
 * a step requires knowing that `work.genre` belongs inside `work` rather than
 * beside it. Nothing else in PlainReadDoc is called any of these, so a bare
 * step name can never shadow a real top-level field.
 */
const WORK_FIELDS = new Set([
  'genre', 'setting', 'surroundings', 'words', 'story', 'doing', 'christPathway',
])

/**
 * Place one finished block into the reading as it stands.
 *
 * WHAT THE ENGINE ACTUALLY SENDS, read out of electron/plainread/stream.js:
 * `work` is a DEEPENED key, emitted repeatedly under its own name carrying the
 * partial object accumulated so far —
 *
 *     { key: 'work', value: { genre } }
 *     { key: 'work', value: { genre, setting } }
 *     … { key: 'work', value: { …all six, parsed from the whole slice } }
 *
 * — each payload a strict superset of the one before it. Against that shape
 * alone a flat `{ ...prev, [key]: value }` would in fact have worked, since
 * replacing with a superset loses nothing.
 *
 * IT IS MERGED ANYWAY, and that is deliberate. The superset guarantee is a
 * property of one extractor's implementation, not of the wire format, and the
 * failure it protects against is the worst kind: if a future engine ever emits
 * only the step it just finished, a replacing renderer deletes the five steps
 * already on the page and the reader watches the document eat itself. Merging
 * is correct under BOTH readings and costs one spread. The path branch below
 * is the same insurance against the other shape this could have taken.
 *
 * Returns `prev` UNCHANGED — same reference, so React does not re-render — for
 * anything this renderer cannot honestly place. Guessing at a path it was not
 * taught is how a block ends up rendered under the wrong heading.
 */
function placeSection(
  prev: Partial<PlainReadDoc> | null,
  key: string,
  value: unknown,
): Partial<PlainReadDoc> | null {
  const base = prev ?? {}
  const work = (base.work ?? {}) as PlainReadDoc['work']

  // 'work.genre'. NOT what today's engine sends — stream.js rejected the
  // compound-key convention on purpose — but a renderer that silently drops a
  // step is indistinguishable from a hung page, so the branch stays.
  const dot = key.indexOf('.')
  if (dot > 0) {
    const head = key.slice(0, dot)
    const tail = key.slice(dot + 1)
    if (head === 'work' && WORK_FIELDS.has(tail)) {
      return { ...base, work: { ...work, [tail]: value } as PlainReadDoc['work'] }
    }
    // A path into something this build does not know how to place. Drop it and
    // let the validated document — which is arriving regardless — say it.
    return prev
  }

  // A step addressed by its bare name. Cheap to honour and impossible to
  // confuse, since PlainReadDoc has no top-level field by any of these names.
  if (WORK_FIELDS.has(key)) {
    return { ...base, work: { ...work, [key]: value } as PlainReadDoc['work'] }
  }

  // `work` itself — merged, for the reason above. A non-object value cannot be
  // merged, so it falls through and is assigned; the step guards in PlainRead
  // then find nothing renderable in it and draw nothing, which is correct.
  if (key === 'work' && value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...base, work: { ...work, ...(value as object) } as PlainReadDoc['work'] }
  }

  return { ...base, [key]: value }
}

const STORED_KEY = 'stored'

export default function App() {
  const [apiKey, setApiKey]       = useState('')
  const [esvKey, setEsvKey]       = useState('')
  const [showKeyModal, setShowKeyModal] = useState(false)
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
  const [wordStudyError, setWordStudyError] = useState<FriendlyError | null>(null)
  const [lastWordRequest, setLastWordRequest] = useState<{ word: string; clauseText: string } | null>(null)
  const wordStudyRequest = useRef(0)
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
  const [showPalette, setShowPalette] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [showRehearsal, setShowRehearsal] = useState(false)
  const [showGroupGuide, setShowGroupGuide] = useState(false)

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

  // ── PLAIN READ — the reader mode. Same engine, different endpoint. ─────────
  const [plainMode, setPlainMode]       = useState(
    () => localStorage.getItem('sermon-tool-view-mode') !== 'pulpit'
  )
  const [plainDoc, setPlainDoc]         = useState<PlainReadDoc | null>(null)
  /* ── THE READING AS IT IS BEING WRITTEN ────────────────────────────────────
     The document is not being made shorter to make it fast — it is roughly two
     and a half thousand words and it is meant to be, because the reader has
     questions he does not yet know he has. What changes is that he stops
     waiting for the last word before he is allowed to see the first: the engine
     emits each block the moment that block is finished, and they are merged in
     here and rendered as they land.

     Only whole blocks land here — that is the engine's guarantee — so nobody
     ever reads half a sentence.

     This is a RENDERING concern and nothing else. validate.js still runs on the
     complete document, the claim check still runs after, and an unverified
     document is still never cached. None of that moves because the page paints
     earlier; `plainDoc` below is still the only thing that counts as finished. */
  const [plainPartial, setPlainPartial] = useState<Partial<PlainReadDoc> | null>(null)
  const [plainLoading, setPlainLoading] = useState(false)
  const [plainError, setPlainError]     = useState<FriendlyError | null>(null)
  // What the reader actually typed, kept so the widening notice can be honest
  // about a single verse having been opened out to its paragraph.
  const [requestedRef, setRequestedRef] = useState<string | null>(null)
  const [plainNonce, setPlainNonce]     = useState(0)
  /* The token sent with THIS reading request. The background claim check lands
     on an event long after plainRead() resolved, and two passages studied in
     quick succession produce two checks whose order is not guaranteed — so a
     correction is matched against this before it is allowed to replace what is
     on screen. A ref, not state: the subscription below is mounted once and
     would otherwise close over the id that was current when it mounted. */
  const plainRequestRef = useRef<string | null>(null)
  /* ── THE PASSAGE, HELD BACK NO LONGER ─────────────────────────────────────
     The Scripture text is fetched BEFORE anything is sent to a model — it is
     what gets sent. It was then held in a local variable inside handleAnalyze
     and thrown away, so the reader saw nothing at all until two model calls
     had finished, which is minutes. Keeping it in state costs nothing and puts
     the passage on screen about a second after SEND IT. `analysis` still owns
     the text once it lands; this is only what stands in until then. */
  const [pendingPassage, setPendingPassage] = useState<{ text: string; reference: string } | null>(null)
  /* The token sent with 'analyze-passage', so the reader view can tell this
     run's progress messages from an abandoned run's. */
  const [analysisStreamId, setAnalysisStreamId] = useState<string | null>(null)
  // Searchable study history — nothing studied should ever be lost, and
  // reopening a saved study is served from cache, so it costs nothing.
  const [showStudySearch, setShowStudySearch] = useState(false)
  const [demoMode, setDemoMode] = useState(false)

  useEffect(() => {
    if (!plainMode || !analysis || demoMode) return
    if (!apiKey) {
      setPlainError({
        headline: 'No API key yet',
        detail: 'Add your key in settings and the study will run.',
      })
      return
    }
    let cancelled = false
    const requestId = `pr-${Date.now()}-${plainNonce}`
    plainRequestRef.current = requestId
    setPlainDoc(null); setPlainPartial(null); setPlainError(null); setPlainLoading(true)
    ;(window as any).electronAPI.plainRead({
      analysis,
      apiKey,
      requestedReference: requestedRef ?? analysis.reference,
      /* Echoed back on the 'plain-read-verified' event so a correction can be
         matched to the run that produced it. Older main processes ignore an
         extra field, so sending it is safe either way. */
      requestId,
    })
      /* THE VALIDATED DOCUMENT, AND IT WINS. Everything streamed in is dropped
         the moment this lands: it went through validate.js whole, the streamed
         blocks did not, and where they disagree this one is simply right. The
         swap is silent — no badge, no flash, nothing that tells the reader a
         document changed under him. */
      .then((doc: PlainReadDoc) => { if (!cancelled) { setPlainDoc(doc); setPlainPartial(null) } })
      /* The partial is deliberately NOT cleared here. A run that dies halfway
         leaves finished blocks on the page; they are still true, and taking
         them off a man who is reading them to show him a box is worse than
         leaving them with the failure stated above them. */
      .catch((e: any) => { if (!cancelled) setPlainError(friendlyApiError(e)) })
      .finally(() => { if (!cancelled) setPlainLoading(false) })
    return () => {
      cancelled = true
      /* This run is abandoned. Drop its token so a check that finishes after
         the reader moved on cannot swap a document into a view that is now
         showing something else. */
      if (plainRequestRef.current === requestId) plainRequestRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plainMode, analysis, apiKey, plainNonce, demoMode])

  /* ── THE READING, ARRIVING IN PIECES ───────────────────────────────────────
     The engine writes the document block by block and emits each one on
     'plain-read-section' the moment it is whole (electron/preload.js →
     onPlainReadSection). Merged here, rendered immediately, in the order they
     are composed: the setting, then the shape of the text, then the meaning,
     then the six steps, then the rest. Same total time as before — the man is
     simply reading through it instead of watching a spinner through it.

     Four rules, all of them enforced below:

       · MATCH BEFORE YOU MERGE. Two passages in quick succession produce two
         streams. A block whose token is not the token on screen is dropped, or
         one passage's meaning lands under another passage's text.
       · '__reset__' MEANS START OVER, SILENTLY. The engine retries a document
         that failed validation. The reader is not told and sees no error — the
         page just clears back and fills again.
       · WHOLE VALUES ONLY. Every block that lands is finished. Nothing is
         appended to and nothing renders mid-sentence. `work` is the one key
         that fills over several messages — six reasoning steps, each finished
         when it arrives — so it is MERGED rather than overwritten, and each
         step is either wholly there or not there at all.
       · THIS NEVER PRODUCES THE FINISHED DOCUMENT. `plainDoc` is the validated
         one and outranks every block here.

     Subscribed defensively, exactly as the claim check below is. The bridge is
     live — electron/preload.js exposes onPlainReadSection over
     'plain-read-section' — but a renderer must never assume its own preload:
     the two ship as one app and are edited as two files, and a build whose
     preload predates this simply never subscribes and reads exactly as it does
     today rather than throwing on launch. */
  useEffect(() => {
    const api = (window as any).electronAPI
    if (typeof api?.onPlainReadSection !== 'function') return
    const off = api.onPlainReadSection((msg: PlainReadSectionMsg | null | undefined) => {
      if (!msg || typeof msg.key !== 'string' || !msg.key) return
      // Not the run on screen. Nothing from it may touch the page.
      if (msg.requestId && msg.requestId !== plainRequestRef.current) return

      /* A validation retry. Everything shown so far belonged to a document that
         is being thrown away, so it goes with it — with no message, no error
         and no flicker of explanation. As far as the reader is concerned the
         page is just still filling. */
      if (msg.key === '__reset__') { setPlainPartial(null); return }

      if (msg.value === undefined) return
      /* Placed, not assigned. The six reasoning steps arrive one at a time and
         all six live inside `work`, so where a block goes is a question with a
         real answer — see placeSection. */
      setPlainPartial(prev => placeSection(prev, msg.key as string, msg.value))
    })
    // Unsubscribe on unmount, or a stream still running when the window closes
    // merges blocks into a dead view.
    return () => { if (typeof off === 'function') off() }
  }, [])

  /* ── THE BACKGROUND CLAIM CHECK, LANDING ───────────────────────────────────
     The reading is handed over as soon as it is written; the adversarial check
     runs after, off the critical path, and pushes a corrected document on
     'plain-read-verified' (electron/preload.js → onPlainReadVerified). The
     contract in electron/main.js is explicit about three things, and all three
     are honoured here:

       · The payload's `doc` is the WHOLE corrected document. Swap it in; do
         not merge it.
       · MATCH BEFORE YOU SWAP. Two passages in quick succession produce two
         independent checks and the first can land second.
       · NO UI. No badge, no toast, no tick, no flash. The corrections land
         silently or not at all. A step's wording may change under the reader;
         that is the accepted cost. Telling the reader is not.

     Subscribed defensively — a build whose preload predates the event simply
     never subscribes, and the reading behaves exactly as it does today. */
  useEffect(() => {
    const api = (window as any).electronAPI
    if (typeof api?.onPlainReadVerified !== 'function') return
    const off = api.onPlainReadVerified((msg: PlainReadCorrection | null | undefined) => {
      const corrected = msg?.doc
      if (!corrected) return
      // The run that asked for this must still be the run on screen.
      if (msg?.requestId && msg.requestId !== plainRequestRef.current) return
      setPlainDoc(prev => {
        // Nothing on screen to correct. Never introduce a document this way.
        if (!prev) return prev
        if (!msg?.requestId) {
          // No token to match on — fall back to what the contract guarantees.
          const ref = msg?.reference ?? msg?.requestedReference ?? null
          if (!ref) return prev
          if (ref !== prev.reference && ref !== prev.expandedReference) return prev
          if (msg?.readingLevel && prev.readingLevel && msg.readingLevel !== prev.readingLevel) return prev
        }
        return corrected
      })
    })
    return () => { if (typeof off === 'function') off() }
  }, [])

  // The reader view occupies the desk slot, so entering PLAIN leaves any other
  // tab. One control, one obvious result.
  const togglePlain = useCallback(() => {
    setPlainMode(p => {
      const next = !p
      localStorage.setItem('sermon-tool-view-mode', next ? 'plain' : 'pulpit')
      return next
    })
    setTab('desk')
  }, [])

  // Belt on top of the braces. The scholar tab renders on `tab === 'scholar'`
  // alone, and its handler reads the pastor's saved profile. If anything ever
  // routes there while PLAIN is on, come straight back to the reader view
  // rather than rendering it — and rather than rendering nothing.
  useEffect(() => {
    if (plainMode && tab === 'scholar') setTab('desk')
  }, [plainMode, tab])

  // Migrate legacy plaintext keys once, then keep only an availability flag in
  // the renderer. Electron's main process owns the protected credentials.
  useEffect(() => {
    const electronAPI = (window as any).electronAPI
    const legacy = {
      ANTHROPIC_KEY: localStorage.getItem('sermon-tool-key') ?? '',
      ESV_KEY: localStorage.getItem('sermon-tool-esv-key') ?? '',
      OPENAI_KEY: localStorage.getItem('sermon-tool-openai-key') ?? '',
    }

    if (!electronAPI?.migrateLegacyApiKeys) {
      setApiKey(legacy.ANTHROPIC_KEY)
      setEsvKey(legacy.ESV_KEY)
      setShowKeyModal(!legacy.ANTHROPIC_KEY)
      return
    }

    electronAPI.migrateLegacyApiKeys(legacy).then((status: Record<string, boolean>) => {
      setApiKey(status.ANTHROPIC_KEY ? STORED_KEY : '')
      setEsvKey(status.ESV_KEY ? STORED_KEY : '')
      setShowKeyModal(!status.ANTHROPIC_KEY)
      localStorage.removeItem('sermon-tool-key')
      localStorage.removeItem('sermon-tool-esv-key')
      localStorage.removeItem('sermon-tool-openai-key')
    }).catch(() => {
      setShowKeyModal(true)
    })
  }, [])

  // Show onboarding on launch if key already exists and user hasn't seen it
  useEffect(() => {
    if (!plainMode && apiKey && shouldShowOnboarding()) {
      setShowOnboarding(true)
    }
  }, [apiKey, plainMode])

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

  const handleSaveKey = useCallback(async (key: string, esv = '') => {
    const cleanKey = key.trim()
    const cleanEsv = esv.trim()
    const status = await (window as any).electronAPI.saveApiKeys({
      ANTHROPIC_KEY: cleanKey,
      ESV_KEY: cleanEsv,
    })
    setApiKey(status.ANTHROPIC_KEY ? STORED_KEY : '')
    setEsvKey(status.ESV_KEY ? STORED_KEY : '')
    setShowKeyModal(false)
    // Show onboarding tour now that the key is saved — first-time users only
    if (!plainMode && shouldShowOnboarding()) setShowOnboarding(true)
  }, [plainMode])

  const handleAnalyze = useCallback(async (text: string, reference: string) => {
    if (!apiKey) { setShowKeyModal(true); return }
    setDemoMode(false)
    setLoading(true); setError(null); setSelectedPhraseId(null); setWordStudy(null); setAnnotations({})
    setSavedDraft(undefined); setSavedChat(undefined)
    setShowGroupGuide(false)
    setRequestedRef(reference)
    setTab('desk')

    /* ── THE PASSAGE GOES UP NOW ────────────────────────────────────────────
       `text` is the Scripture itself, already fetched — it is what we are
       about to send. It used to live and die inside this function while the
       reader watched a spinner for the two model calls that follow. Handing
       it to state here is what puts the text on screen about a second after
       SEND IT instead of about three minutes after.

       The previous reading goes with it. Leaving it up would park a finished
       document from the last passage over the new passage's text. */
    setPendingPassage({ text, reference })
    /* The last reading goes with it — the finished one AND anything the last
       run had streamed in. Either one left up would park the previous passage's
       document over this passage's text. */
    setPlainDoc(null); setPlainPartial(null); setPlainError(null)

    /* The token the progress messages come back stamped with, so a message
       from a run the reader abandoned cannot drive this run's status line. */
    const streamId = `an-${Date.now()}`
    setAnalysisStreamId(streamId)

    try {
      const result = await (window as any).electronAPI.analyzePassage({ text, reference, apiKey, streamId })
      setAnalysis(result)
      // Main returns the history entry this study was saved under. Every
      // autosave — draft, annotations, scholar chat — is guarded by this id, so
      // hardcoding null here meant nothing a man wrote after running a study
      // was ever persisted. It only appeared to work if he relaunched the app
      // or re-opened the study from History first, which is why it survived.
      setCurrentHistoryId(result?.historyId ?? null)
    } catch (e: any) {
      const friendly = friendlyApiError(e)
      setError(`${friendly.headline}. ${friendly.detail}`)
      /* The reader view is hidden while that error is up — but the error is
         dismissible, and the reading it was waiting for is never coming. Give
         the reader view its own copy of the failure so that, dismissed or not,
         it shows what happened and a way to retry instead of a status line for
         a run that is already dead. The stand-in goes with it: there is no
         longer a run behind that passage. */
      setPlainError(friendly)
      setPendingPassage(null)
      setAnalysisStreamId(null)
    } finally { setLoading(false) }
  }, [apiKey])

  const handleLoadHistory = useCallback((entry: HistoryEntry) => {
    setAnalysis(entry.analysis)
    setDemoMode(false)
    /* A saved study carries its own passage text. The stand-in from the last
       live run has nothing to do with it and must not outlive it. */
    setPendingPassage(null)
    setAnalysisStreamId(null)
    // The widening notice is computed from what the reader TYPED. A saved study
    // carries no typed reference, so leaving the last one in place made PLAIN
    // announce "You gave me one verse — I loaded <this passage> and read
    // <a verse from a different book> off of it." Clear it; the fallback is the
    // saved reference, which produces no notice.
    setRequestedRef(null)
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

  const requestWordStudy = useCallback(async (word: string, clauseText: string) => {
    /* The passage is on screen minutes before the analysis is, and the reader
       is invited on that same screen to click any word. The word study needs a
       reference, not an analysis — so it takes the one the reader is looking
       at, whichever half of the run supplied it. Gating this on `analysis`
       made the invitation false for the length of the run. */
    const studyReference = analysis?.reference ?? pendingPassage?.reference ?? null
    if (!studyReference) return
    const requestId = ++wordStudyRequest.current
    setLastWordRequest({ word, clauseText })
    setWordStudy(null); setWordStudyError(null); setWordStudyLoading(true)
    try {
      const result = await (window as any).electronAPI.wordStudy({
        word, clauseText, reference: studyReference, apiKey,
      })
      if (requestId === wordStudyRequest.current) setWordStudy(result)
    } catch (error) {
      if (requestId === wordStudyRequest.current) setWordStudyError(friendlyApiError(error))
    } finally {
      if (requestId === wordStudyRequest.current) setWordStudyLoading(false)
    }
  }, [analysis, pendingPassage, apiKey])

  const handleWordClick = useCallback((word: string, phrase: Phrase) => {
    void requestWordStudy(word, phrase.text)
  }, [requestWordStudy])

  const handlePassageWordClick = useCallback((word: string, verseText: string) => {
    void requestWordStudy(word, verseText)
  }, [requestWordStudy])

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

  /* ── WHAT THE READER VIEW HAS IN HAND ──────────────────────────────────────
     The analysis owns the passage once it lands, and the stand-in covers the
     minutes before that. The handoff between them is invisible on purpose:
     electron/main.js sets `result.passageText = text` — the same string that
     was sent — so the swap changes not one character and moves nothing on the
     page. Until either exists there is no reader view to open.

     THE STAND-IN WINS WHILE IT EXISTS, and that order matters: studying a
     second passage while the first is still loaded leaves the OLD analysis in
     state for the length of the new run, so reading `analysis` first would
     have parked the previous passage over the one the reader just asked for.
     It is cleared wherever a study arrives from somewhere other than SEND IT —
     saved history, the demo — so it can never outlive its own run. */
  const readerPassage = pendingPassage
    ?? (analysis ? { text: analysis.passageText ?? '', reference: analysis.reference } : null)

  /* THE READER VIEW IS OPEN FOR THE WHOLE RUN, not just after it. It used to be
     gated on `!loading && analysis`, which is why the reader got a spinner on
     an empty canvas for the length of two model calls: the one component that
     could have shown them the passage was not mounted yet. It mounts the
     moment the Scripture is fetched and stays mounted — the same element, the
     same key — so the text never unmounts and re-enters underneath them. */
  const readerOpen = plainMode && tab === 'desk' && !error && !!readerPassage

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
            }}>THE OPERATOR</div>
            <div style={{
              fontFamily: 'JetBrains Mono', fontSize: 6.5, color: BASE.steel,
              letterSpacing: '0.16em', marginTop: 2,
            }}>BASE 1520 · SCRIPTURE STUDY</div>
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
            // None of the three agent desks appear in PLAIN. The homiletical one
            // is preaching apparatus outright, and ALL THREE run through the
            // 'agent-chat' handler, which reads the 'scholar-profile' store key
            // (electron/main.js) — the pastor's hermeneutics and his own sermon
            // manuscripts. That key must never be read on the layman path, so
            // the entry points are off-screen here rather than filtered.
          ] as const).filter(() => !plainMode).map(agent => (
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
          {/* Scholar chat runs on the saved hermeneutics profile, so it is a
              pastor-view control. PLAIN never touches that key. */}
          {analysis && !plainMode && (
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
          {/* PULPIT / PLAIN — who this reading is for. PLAIN drops the delivery
              scaffolding entirely and aims at understanding and obedience. */}
          <button onClick={togglePlain}
            data-tip={plainMode ? 'BACK TO PULPIT VIEW' : 'PLAIN READ — FOR UNDERSTANDING'}
            className="hud-tip"
            style={{ ...iconBtn, width: 'auto', borderRadius: 15, padding: '0 11px', gap: 6,
              fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.14em',
              ...(plainMode ? { color: BASE.gold, borderColor: `${BASE.gold}55` } : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
            onMouseLeave={e => { if (!plainMode) { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim } }}>
            <span style={{ opacity: plainMode ? 0.35 : 1 }}>PULPIT</span>
            <span style={{ opacity: 0.3 }}>/</span>
            <span style={{ opacity: plainMode ? 1 : 0.35 }}>PLAIN</span>
          </button>
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
          {!plainMode && (
            <button onClick={() => setShowSeries(true)} data-tip="SERMON SERIES" className="hud-tip" style={iconBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}>≡</button>
          )}
          {analysis && !plainMode && (<>
            <button onClick={() => setShowHymns(true)} data-tip="WORSHIP PLANNING" className="hud-tip" style={iconBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}>♪</button>
            <button onClick={handleExport} data-tip="EXPORT PREACHING NOTES" className="hud-tip" style={{ ...iconBtn, fontSize: 15, fontWeight: 700 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}>↓</button>
          </>)}
          {/* Study-notes export survives into PLAIN — it is study output, not
              delivery output. */}
          {analysis && (
            <button onClick={handleExportStudyNotes} data-tip="EXPORT STUDY NOTES" className="hud-tip" style={iconBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}>⇩</button>
          )}
          {/* Search every study ever run. Reopening one is free. */}
          <button onClick={() => setShowStudySearch(true)} data-tip="SEARCH YOUR STUDIES" className="hud-tip"
            style={{ ...iconBtn, ...(showStudySearch ? { color: BASE.gold, borderColor: `${BASE.gold}55` } : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}44` }}
            onMouseLeave={e => { if (!showStudySearch) { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim } }}>
            ⌕
          </button>
          <HistoryPanel onLoad={handleLoadHistory} currentRef={analysis?.reference} />
          {/* Delivery review, final clearance, sermon calendar — the preaching
              apparatus. Fully live in PULPIT, off-screen in PLAIN. */}
          {!plainMode && (<>
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
          </>)}
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
            mode={plainMode ? 'plain' : 'pulpit'}
            onExpandPassage={(text, reference) => setPassagePanel({ text, reference })}
          />
          {analysis && (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: 14 }}>
              {/* Commentary front and center — no scrolling to find it */}
              <CommentaryPanel
                key={analysis.reference}
                reference={analysis.reference}
                passageText={analysis.passageText}
                mainTheme={analysis.mainTheme}
                apiKey={apiKey}
              />
              {/* Preacher-facing intent and questions stay on the PULPIT side.
                  PLAIN builds its guide from the verified reader document. */}
              {!plainMode && (
                <>
                  <IntentCard intent={(analysis as any).authorIntent} />
                  <QuestionsCard questions={analysis.questionsToConsider} />
                </>
              )}
            </div>
          )}
        </div>

        {/* Passage panel — slides in between sidebar and canvas */}
        <AnimatePresence>
          {passagePanel && (
            <PassagePanel
              text={passagePanel.text}
              reference={passagePanel.reference}
              divisions={analysis?.outline}
              onWordClick={analysis ? handlePassageWordClick : undefined}
              onClose={() => setPassagePanel(null)}
            />
          )}
        </AnimatePresence>

        {/* Canvas */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Starfield />

          {/* Loading — thinking display.
              PULPIT ONLY NOW. In the reader view the passage itself occupies
              this canvas while the run goes, with a status line above it that
              says what is actually happening; a full-canvas thinking animation
              on top of that would cover the one thing the reader came for. */}
          {loading && !readerOpen && <ThinkingDisplay />}

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
                <button onClick={() => setShowKeyModal(true)} style={{
                  marginTop: 8, marginLeft: 8,
                  background: `${BASE.gold}11`, border: `1px solid ${BASE.borderGold}`,
                  padding: '6px 18px', color: BASE.gold,
                  fontFamily: 'JetBrains Mono', fontSize: 8, cursor: 'pointer', letterSpacing: '0.12em',
                }}>[ API SETTINGS ]</button>
              </div>
            </div>
          )}

          {/* Empty state.
              In PLAIN the two pastor-only exits off this screen are closed at
              the CALLBACK, not just at the header buttons. The SCHOLAR node
              here calls onSwitchTab('scholar'), and the scholar tab renders on
              `tab === 'scholar'` alone — so from PLAIN with nothing analyzed
              yet, one click reached ScholarChat, whose 'scholar-chat' handler
              reads the 'scholar-profile' store key. */}
          {!loading && !error && !analysis && tab !== 'scholar' && (
            plainMode ? (
              <div style={{
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                padding: 40, textAlign: 'center',
              }}>
                <div style={{ maxWidth: 520 }}>
                  <div style={{
                    fontFamily: 'Saira, sans-serif', fontSize: 12, color: BASE.gold,
                    letterSpacing: '0.18em', fontWeight: 800,
                  }}>PLAIN SCRIPTURE STUDY</div>
                  <h1 style={{
                    margin: '12px 0 10px', fontFamily: 'Crimson Pro, serif',
                    fontSize: 34, fontWeight: 400, color: BASE.bone,
                  }}>Start with the text.</h1>
                  <p style={{
                    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 16,
                    lineHeight: 1.7, color: BASE.boneMid, margin: 0,
                  }}>
                    Enter a passage in the left panel. The app will load the Scripture,
                    trace its natural divisions, and walk through what the author is doing.
                  </p>
                </div>
              </div>
            ) : (
              <CorePulse
                onSwitchTab={t => setTab(t as Tab)}
                onOpenAgent={setAgentPanel}
                currentTab={tab}
              />
            )
          )}

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {/* PLAIN READ — replaces the Desk while the reader mode is on */}
            {readerOpen && (
              <motion.div key="plain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }} style={{ position: 'absolute', inset: 0 }}>
                <Suspense fallback={null}>
                  <PlainRead
                    doc={plainDoc}
                    /* The blocks that have landed so far. The view renders
                       these until `doc` exists, then `doc` wins wholesale. */
                    partial={plainPartial}
                    loading={plainLoading}
                    error={plainError}
                    passageText={readerPassage?.text}
                    reference={readerPassage?.reference ?? ''}
                    /* Which half of the run is going, and the token its
                       progress messages carry. The status line above the
                       passage is built from these — real stages from the
                       process doing the work, nothing simulated. */
                    analyzing={loading}
                    progressStreamId={analysisStreamId}
                    onRetry={() => setPlainNonce(n => n + 1)}
                    onOpenSettings={() => setShowKeyModal(true)}
                    /* Every study surface stays available to the reader: map,
                       lineage, kings, monarchy timeline, parallel versions,
                       cross-reference field, cultural notes. */
                    analysis={analysis}
                    apiKey={apiKey}
                    esvKey={esvKey}
                    onLoadRef={handleLoadRef}
                    onWordClick={handlePassageWordClick}
                    onOpenGroupGuide={plainDoc && apiKey ? () => setShowGroupGuide(true) : undefined}
                  />
                </Suspense>
              </motion.div>
            )}

            {/* Desk — phrase tree + outline + cultural notes + draft on one infinite canvas */}
            {!loading && !error && analysis && tab === 'desk' && !plainMode && (
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

      <WordStudyDrawer
        study={wordStudy}
        loading={wordStudyLoading}
        error={wordStudyError}
        onOpenSettings={() => setShowKeyModal(true)}
        onRetry={lastWordRequest ? () => void requestWordStudy(lastWordRequest.word, lastWordRequest.clauseText) : undefined}
        onClose={() => {
          wordStudyRequest.current += 1
          setWordStudy(null)
          setWordStudyError(null)
          setWordStudyLoading(false)
        }}
      />

      {showKeyModal && (
        <ApiKeyModal onSave={handleSaveKey} onClose={() => setShowKeyModal(false)} hasExistingKey={Boolean(apiKey)} hasExistingEsvKey={Boolean(esvKey)}
          onDemo={() => {
            import('./data/demoAnalysis').then(m => {
              setAnalysis(m.DEMO_ANALYSIS as any)
              setPlainDoc(m.DEMO_PLAIN_READ)
              setPendingPassage(null)
              setAnalysisStreamId(null)
              setPlainMode(true)
              localStorage.setItem('sermon-tool-view-mode', 'plain')
              setDemoMode(true)
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

      {/* Agent chat panels. Gated on !plainMode at the mount, not just at the
          buttons: 'agent-chat' reads the pastor's saved profile, so no entry
          point — header, core pulse, rail — can reach it from the layman view. */}
      <AnimatePresence>
        {agentPanel && !plainMode && (
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

      {/* The expert / scholar-profile import is a PULPIT-only surface. It holds
          the pastor's hermeneutics and his own sermon manuscripts; a layman has
          no sermons to import and none of that may cross into PLAIN. Gating it
          here keeps the 'scholar-profile' store key unread on that path even if
          some future control tries to open it. */}
      <ScholarProfile
        isOpen={profileOpen && !plainMode}
        onClose={() => setProfileOpen(false)}
        apiKey={apiKey}
      />

      {showOnboarding && !plainMode && (
        <Onboarding onComplete={() => {
          setShowOnboarding(false)
          // Prompt setup wizard after tour if profile likely empty
          ;(window as any).electronAPI.profileGet().then((p: any) => {
            if (!p?.identity?.trim()) setShowSetupWizard(true)
          }).catch(() => {})
        }} />
      )}

      <AnimatePresence>
        {showSetupWizard && !plainMode && (
          <SetupWizard onComplete={() => setShowSetupWizard(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFeatureTour && (
          <FeatureTour onClose={() => setShowFeatureTour(false)} />
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

      <AnimatePresence>
        {showGroupGuide && analysis && plainDoc && apiKey && (
          <GroupGuide
            analysis={analysis}
            plainDoc={plainDoc}
            apiKey={apiKey}
            onClose={() => setShowGroupGuide(false)}
            onOpenSettings={() => setShowKeyModal(true)}
          />
        )}
      </AnimatePresence>

      {/* Searchable study history. Reopening a result loads the saved analysis,
          so the reading comes back off cache — no API call, no cost. */}
      {showStudySearch && (
        <StudyHistory
          onLoad={handleLoadHistory}
          onClose={() => setShowStudySearch(false)}
          currentRef={analysis?.reference}
        />
      )}

      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          onGoToReference={(ref) => setPrefillRef(ref)}
          onLoadHistory={handleLoadHistory}
          actions={[
            { id: 'plain',    icon: '◐', label: plainMode ? 'Back to Pulpit View' : 'Open Plain Read', run: togglePlain },
            { id: 'studies',  icon: '⌕', label: 'Search Your Studies',          run: () => setShowStudySearch(true) },
            ...(analysis ? [
              { id: 'group', icon: '◫', label: 'Build COVENANT Group Guide', run: () => setShowGroupGuide(true) },
            ] : []),
            // Preaching apparatus and the scholar-profile import are listed in
            // PULPIT only. PLAIN keeps every study tool and drops the rest.
            ...(plainMode ? [] : [
              { id: 'checks',   icon: '☑', label: 'Open Pre-Preach Checks',     run: () => setShowChecklist(true) },
              { id: 'review',   icon: '⏺', label: 'Open Delivery Review',       run: () => setShowRehearsal(true) },
              { id: 'calendar', icon: '▦', label: 'Open Sermon Calendar',       run: () => setShowCalendar(true) },
              { id: 'series',   icon: '≡', label: 'Open Sermon Series',         run: () => setShowSeries(true) },
              { id: 'hymns',    icon: '♪', label: 'Open Worship Planning',      run: () => setShowHymns(true) },
              { id: 'profile',  icon: '⚈', label: 'Open Scholar Profile',       run: () => setProfileOpen(true) },
            ]),
            { id: 'compass',  icon: '◉', label: 'Open Book Compass',          run: () => setShowBookCompass(true) },
            { id: 'academy',  icon: '◎', label: 'Open Exegesis Academy',       run: () => setShowAcademy(true) },
            { id: 'tour',     icon: '?', label: 'Open Features & Tips',        run: () => setShowFeatureTour(true) },
            { id: 'settings', icon: '⚙', label: 'Open Settings (API Keys)',    run: () => setShowKeyModal(true) },
          ]}
        />
      )}
      </Suspense>
    </div>
  )
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ── Study Notes export — congregation handout ────────────────────────────────
function buildStudyNotesHtml(analysis: PhrasingAnalysis) {
  const outlineHtml = analysis.outline.map(p =>
    `<div class="point">
      <div class="point-row">
        <span class="point-num">${escapeHtml(p.point)}</span>
        <span class="point-label">${escapeHtml(p.label)}</span>
      </div>
      <div class="fill-line"></div>
      ${(p.sub ?? []).map(s => `
        <div class="sub-row">
          <span class="sub-num">${escapeHtml(s.point)}</span>
          <span class="sub-label">${escapeHtml(s.label)}</span>
        </div>
        <div class="fill-line fill-line--sub"></div>
      `).join('')}
    </div>`
  ).join('')

  const culturalHtml = (analysis.culturalNotes ?? []).slice(0, 4).map(n =>
    `<div class="cultural-note">
      <span class="cn-term">${escapeHtml(n.term)}</span>
      <span class="cn-cat">${escapeHtml(n.category.replace(/-/g,' '))}</span>
      <p class="cn-body">${escapeHtml(n.significance)}</p>
    </div>`
  ).join('')

  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${escapeHtml(analysis.reference)} — Study Notes</title>
<style>
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
    <div class="ref">${escapeHtml(analysis.reference)}</div>
    <div class="date">${date}</div>
  </div>
</div>

<div class="big-idea">
  <div class="bi-label">Big Idea</div>
  <div class="bi-text">${escapeHtml(analysis.mainTheme)}</div>
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
  // Up ~15% from 30/13, to carry the same weight as the study rail beside it.
  width: 34, height: 34, borderRadius: '50%',
  border: `1px solid ${BASE.borderDim}`,
  background: 'transparent',
  color: BASE.steel,
  cursor: 'pointer', fontSize: 15,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
}

// ── Export HTML builder — pulpit-ready preaching notes ────────────────────────
function buildExportHtml(analysis: PhrasingAnalysis, annotations: Record<string, string>) {
  const outlineHtml = analysis.outline.map(p =>
    `<div class="point">
      <div class="point-head"><span class="point-num">${escapeHtml(p.point)}</span> <span class="point-label">${escapeHtml(p.label)}</span></div>
      ${(p.sub ?? []).map(s => `<div class="sub-point"><span class="point-num">${escapeHtml(s.point)}</span> ${escapeHtml(s.label)}</div>`).join('')}
    </div>`
  ).join('')

  const annotated = analysis.phrases.filter(p => annotations[p.id])
  const annotationsHtml = annotated.map(p =>
    `<div class="annotation-item">
      <div class="ann-phrase">"${escapeHtml(p.text)}"</div>
      <div class="ann-note">${escapeHtml(annotations[p.id])}</div>
    </div>`
  ).join('')

  const culturalHtml = (analysis.culturalNotes ?? []).map(n =>
    `<div class="cultural-note">
      <div class="cn-header">
        <span class="cn-term">${escapeHtml(n.term)}</span>
        <span class="cn-cat">${escapeHtml(n.category.replace(/-/g,' '))}</span>
      </div>
      <p class="cn-body">${escapeHtml(n.explanation)}</p>
      <p class="cn-sig">↳ ${escapeHtml(n.significance)}</p>
    </div>`
  ).join('')

  const phrasesHtml = analysis.phrases.map(p =>
    `<div class="phrase" style="margin-left:${Math.min(p.level,3) * 20}px">
      <span class="ptype">${escapeHtml(p.type)}${p.connective ? ` · <em>${escapeHtml(p.connective)}</em>` : ''}</span>
      <span class="ptext">${escapeHtml(p.text)}</span>
      ${p.theologicalNote ? `<span class="pnote">— ${escapeHtml(p.theologicalNote)}</span>` : ''}
      ${annotations[p.id] ? `<div class="pann">✎ ${escapeHtml(annotations[p.id])}</div>` : ''}
    </div>`
  ).join('')

  const themes = (analysis.canonicalContext?.biblicalThemes ?? []).map(t => `<span class="theme-pill">${escapeHtml(t)}</span>`).join('')
  const keywords = (analysis.canonicalContext?.keyWords ?? []).map(w => `<span class="kw-pill">${escapeHtml(w)}</span>`).join('')

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${escapeHtml(analysis.reference)} — Preaching Notes</title>
<style>
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
  <div class="ref">${escapeHtml(analysis.reference)}</div>
  <div class="byline">Preaching Notes · BASE 1520 · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
</div>

<div class="big-idea">${escapeHtml(analysis.mainTheme)}</div>

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
    <div class="canon-item"><div class="canon-label">Book Theme</div><div class="canon-value">${escapeHtml(analysis.canonicalContext?.bookTheme)}</div></div>
    <div class="canon-item"><div class="canon-label">Passage Role</div><div class="canon-value">${escapeHtml(analysis.canonicalContext?.passageRole)}</div></div>
    <div class="canon-item" style="grid-column:1/-1"><div class="canon-label">Canonical Connections</div><div class="canon-value">${escapeHtml(analysis.canonicalContext?.canonicalConnections)}</div></div>
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
