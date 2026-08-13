import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { PlainReadDocument } from '../components/PlainRead'
import type { ChatMessage, PhrasingAnalysis, PlainReadDoc } from '../types/phrasing'
import {
  MAX_STUDY_NOTES_CHARS,
  OperatorApiError,
  askQuestion,
  confirmAccountRecovery,
  createBillingPortal,
  deleteOperatorAccount,
  fetchPassage,
  getMe,
  getReleaseStatus,
  getStudy,
  listDevices,
  listStudies,
  requestAccountRecovery,
  requestMobileRegistration,
  redeemAccessCode,
  redeemDeviceLink,
  confirmMobileRegistration,
  revokeDevice,
  runGuidedStudy,
  runQuickStudy,
  signOutDevice,
  updateStudy,
  updateStudyWorkspace,
  type DeviceRecord,
  type Entitlement,
  type GuidedStudyDoc,
  type MobileStudyDocument,
  type PassageResult,
  type ReleaseStatus,
  type StudySummary,
} from './api'
import { GuidedStudyDocument, isGuidedStudyDocument } from './GuidedStudyDocument'
import { isQuickStudyDocument, QuickStudyDocument } from './QuickStudyDocument'
import { useSermonRecorder } from './TabletRecorder'
import { ReportAiOutput } from './ReportAiOutput'
import { deleteSermonRecordingsForOwner, moveSermonRecordings } from './recordings'
import {
  createTabletSermonWorkspace,
  normalizeTabletSermonWorkspace,
  type TabletSermonWorkspace,
} from './tabletDeskModel'
import {
  clearAccountId,
  clearDeviceToken,
  getAccountId,
  getEsvKey,
  getInstallId,
  grantAiProcessingConsent,
  hasAiProcessingConsent,
  hasSeenIntro,
  markIntroSeen,
  setAccountId,
  setEsvKey,
  withdrawAiProcessingConsent,
} from './storage'
import {
  claimLegacyStudies,
  deleteLocalStudies,
  fromSyncedStudy,
  getLocalStudy,
  listLocalStudies,
  localStudySummary,
  moveLocalStudies,
  saveLocalStudy,
  updateLocalStudy,
  type LocalStudyRecord,
} from './localStudies'
import {
  isStoreFinalizationPendingError,
  listenForStoreTransactions,
  loadStorePlans,
  manageStoreSubscriptions,
  openExternal,
  purchaseStorePlan,
  reconcilePendingStorePurchases,
  restoreStorePurchases,
  storePlatform,
  verifyPendingStoreTransaction,
  type StorePlan,
} from './store'
import bIcon from '../assets/b-icon.png'

type Tab = 'study' | 'library' | 'account'
type RunState = 'idle' | 'loading-passage' | 'quick-study' | 'guided-study'
type TabletStudyMode = 'plain' | 'sermon'
type WorkspaceSyncState = 'saved' | 'saving' | 'local-only' | 'conflict' | 'error'
type AiConsentAction = 'study' | 'ask' | 'settings'
type WorkspaceConflict = {
  studyId: string
  workspace: TabletSermonWorkspace | null
  revision: number
}
type ArchiveNotice = {
  id: string
  reference: string
}

const MOBILE_FULL_RELEASE = import.meta.env.VITE_OPERATOR_RELEASE_STAGE === 'full'
const MOBILE_ESV_LICENSED = MOBILE_FULL_RELEASE && import.meta.env.VITE_ESV_MOBILE_LICENSED === 'true'
const TRANSLATIONS = [
  { id: 'kjv', label: 'KJV' },
  { id: 'asv', label: 'ASV' },
  { id: 'web', label: 'WEB' },
  { id: 'ylt', label: 'YLT' },
  ...(MOBILE_ESV_LICENSED ? [{ id: 'esv', label: 'ESV' }] : []),
]
const PLAN_USAGE: Record<string, number> = {
  starter: 40,
  starter_annual: 40,
  standard: 80,
  standard_annual: 80,
  heavy: 300,
  heavy_annual: 300,
}
const PLAN_PRICING = {
  starter: { label: 'STARTER', monthly: '$29.99', annual: '$299.99', allowance: 40 },
  standard: { label: 'STANDARD', monthly: '$49.99', annual: '$499.99', allowance: 80 },
  heavy: { label: 'HEAVY', monthly: '$149.99', annual: '$1,649.99', allowance: 300 },
} as const
const PRIVACY_URL = 'https://www.base1520.com/operator/privacy/'
const DELETE_INFO_URL = 'https://www.base1520.com/operator/account-deletion/'
const TERMS_URL = 'https://www.base1520.com/operator/terms/'
const SUPPORT_URL = 'https://www.base1520.com/contact/'
const PLANS_URL = 'https://www.base1520.com/operator/#plans'
const TabletSermonDesk = lazy(() => import('./TabletSermonDesk').then((module) => ({ default: module.TabletSermonDesk })))

function createStudyRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

function isTabletDevice() {
  if ((import.meta.env.DEV || import.meta.env.VITE_OPERATOR_CAPTURE_DEVICE === 'tablet')
    && new URLSearchParams(window.location.search).get('tablet') === '1') return true
  const userAgent = navigator.userAgent || ''
  const isIPad = /iPad/i.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroidTablet = /Android/i.test(userAgent) && !/Mobile/i.test(userAgent)
  const shortestScreenEdge = Math.min(window.screen.width, window.screen.height)
  return isIPad || isAndroidTablet || (navigator.maxTouchPoints > 1 && shortestScreenEdge >= 600)
}

function errorMessage(error: unknown) {
  if (error instanceof OperatorApiError) return error.message
  if (error instanceof Error && error.name === 'AbortError') return 'The connection went quiet. Try again, or check your library in case the study finished.'
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return "The Operator can't reach the study service right now. Your saved studies are still available."
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

function BrandHeader({ onAccount }: { onAccount: () => void }) {
  return (
    <header className="mobile-header">
      <div className="mobile-brand">
        <img src={bIcon} alt="BASE 1520" />
        <div>
          <span>BASE 1520</span>
          <strong>THE OPERATOR</strong>
        </div>
      </div>
      <button className="mobile-icon-button" onClick={onAccount} aria-label="Open account">◎</button>
    </header>
  )
}

function Intro({
  onRequestRegistration,
  onConfirmRegistration,
  onContinue,
  onExisting,
  registrationEnabled,
  accountServiceUnavailable,
  tablet,
}: {
  onRequestRegistration: (email: string, marketingOptIn: boolean) => Promise<void>
  onConfirmRegistration: (email: string, code: string) => Promise<void>
  onContinue: () => void
  onExisting: () => void
  registrationEnabled: boolean
  accountServiceUnavailable: boolean
  tablet: boolean
}) {
  const [step, setStep] = useState(0)
  const [email, setEmail] = useState('')
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [registrationCode, setRegistrationCode] = useState('')
  const [registrationStep, setRegistrationStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slides = [
    {
      eyebrow: 'THE TEXT FIRST',
      title: 'See what the passage actually means.',
      body: 'Look up a passage and get its meaning, context, textual evidence, key words, place in Scripture, and why it matters—without building a sermon.',
    },
    {
      eyebrow: tablet ? 'GUIDED STUDY' : 'QUICK STUDY',
      title: tablet ? 'Work the whole passage without waiting all night.' : 'The answer you need while you are moving.',
      body: tablet
        ? 'The tablet holds both sides: a complete PLAIN study through all eight COVENANT movements, plus a movable sermon desk with manuscript, stylus notes, recording, and Preach Mode.'
        : 'Fast does not mean loose. Every lookup asks how do we know, and what does it mean? Never “what does it mean to you.” The text means what it means.',
    },
    registrationEnabled
      ? {
        eyebrow: 'ONE EMAIL. THEN THE TEXT.',
        title: `Your first ${tablet ? 'Guided Study' : 'Quick Study'} is on us.`,
        body: 'Create a free account so the study belongs to you—not one device. No API key, credit card, or subscription required.',
      }
      : accountServiceUnavailable
        ? {
          eyebrow: 'STUDY NOW. LINK WHEN READY.',
          title: `Your free ${tablet ? 'Guided Study' : 'Quick Study'} still works.`,
          body: 'The account service is temporarily unavailable. Open the text now; this device keeps your study, and you can connect it to an account later.',
        }
      : {
        eyebrow: 'LINK YOUR ACCOUNT',
        title: 'Bring your Operator work with you.',
        body: 'Open The Operator on desktop, choose Settings → Your Access → Link a device, then enter the temporary code here.',
      },
  ]
  const current = slides[step]

  const submit = async () => {
    if (!email.trim() || busy || (registrationStep === 'code' && !/^\d{6}$/.test(registrationCode))) return
    setBusy(true)
    setError(null)
    try {
      if (registrationStep === 'email') {
        await onRequestRegistration(email.trim(), marketingOptIn)
        setRegistrationCode('')
        setRegistrationStep('code')
      } else {
        await onConfirmRegistration(email.trim(), registrationCode)
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mobile-intro">
      <div className="mobile-intro-mark"><img src={bIcon} alt="" /></div>
      <div className="mobile-eyebrow">{current.eyebrow}</div>
      <h1>{current.title}</h1>
      <p>{current.body}</p>
      {registrationEnabled && step === slides.length - 1 && (
        <div className="mobile-intro-form">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="email"
            aria-label="Email address"
            disabled={registrationStep === 'code'}
          />
          {registrationStep === 'email' && <label className="mobile-consent">
            <input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} />
            <span>Send me useful study resources and Operator updates. Unsubscribe anytime.</span>
          </label>}
          {registrationStep === 'code' && <>
            <p className="mobile-registration-help">Enter the six-digit code from your email. It expires in 10 minutes.</p>
            <input
              className="mobile-recovery-code"
              value={registrationCode}
              onChange={(event) => setRegistrationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
            />
          </>}
          {error && <div className="mobile-error">{error}</div>}
        </div>
      )}
      <div className="mobile-dots">{slides.map((_, index) => <i key={index} className={index === step ? 'active' : ''} />)}</div>
      <button className="mobile-primary" disabled={busy || (registrationEnabled && step === slides.length - 1 && (!email.trim() || (registrationStep === 'code' && !/^\d{6}$/.test(registrationCode))))} onClick={() => step < slides.length - 1 ? setStep(step + 1) : registrationEnabled ? void submit() : accountServiceUnavailable ? onContinue() : onExisting()}>
        {step < slides.length - 1 ? 'CONTINUE' : registrationEnabled ? busy ? registrationStep === 'email' ? 'SENDING CODE…' : 'VERIFYING…' : registrationStep === 'email' ? 'EMAIL MY CODE' : 'VERIFY AND OPEN THE TEXT' : accountServiceUnavailable ? 'OPEN THE TEXT' : 'LINK MY ACCOUNT'}
      </button>
      {registrationEnabled && step === slides.length - 1 && registrationStep === 'code' && <button className="mobile-text-button" onClick={() => { setRegistrationStep('email'); setRegistrationCode(''); setError(null) }}>USE A DIFFERENT EMAIL</button>}
      {(registrationEnabled || accountServiceUnavailable) && step === slides.length - 1 && <button className="mobile-text-button" onClick={onExisting}>I ALREADY HAVE AN ACCOUNT</button>}
    </div>
  )
}

function AskSheet({
  studyId,
  doc,
  analysis,
  onClose,
}: {
  studyId: string
  doc: PlainReadDoc | GuidedStudyDoc
  analysis: PhrasingAnalysis
  onClose: () => void
}) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const guidedStarters = 'mode' in doc && doc.mode === 'guided'
    ? doc.questions.map((item) => item.question).filter(Boolean).slice(0, 3)
    : []
  const starters = guidedStarters.length ? guidedStarters : ('starters' in doc && doc.starters?.filter(Boolean).slice(0, 3)) || [
    'What is the main claim of this passage?',
    'What in the text supports that meaning?',
    'What would be a common misreading here?',
  ]

  const ask = async (prompt = question) => {
    const clean = prompt.trim()
    if (!clean || busy) return
    const next = [...messages, { role: 'user' as const, content: clean }]
    setMessages(next)
    setQuestion('')
    setBusy(true)
    setError(null)
    try {
      const result = await askQuestion({ studyId, question: clean, history: messages })
      const answer = result.answer || result.refusal || 'I could not answer that from this passage.'
      setMessages([...next, { role: 'assistant', content: answer }])
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mobile-sheet-backdrop" onClick={onClose}>
      <section className="mobile-sheet mobile-ask-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="mobile-sheet-handle" />
        <div className="mobile-sheet-title"><div><span>ASK THE OPERATOR</span><strong>{analysis.reference}</strong></div><button onClick={onClose}>×</button></div>
        {!messages.length && <div className="mobile-starters">{starters.map((starter) => <button key={starter} onClick={() => ask(starter)}>{starter}</button>)}</div>}
        <div className="mobile-chat">
          {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`mobile-message ${message.role}`}><p>{message.content}</p>{message.role === 'assistant' && <ReportAiOutput studyId={studyId} surface="ask" content={message.content} />}</div>)}
          {busy && <div className="mobile-message assistant">Working from the text…</div>}
        </div>
        {error && <div className="mobile-error">{error}</div>}
        <div className="mobile-ask-input"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask what the passage means…" /><button onClick={() => ask()} disabled={!question.trim() || busy}>↑</button></div>
      </section>
    </div>
  )
}

export default function MobileApp() {
  const [tablet] = useState(isTabletDevice)
  const [tab, setTab] = useState<Tab>('study')
  const [intro, setIntro] = useState(false)
  const [reference, setReference] = useState('')
  const [translation, setTranslation] = useState('kjv')
  const [passage, setPassage] = useState<PassageResult | null>(null)
  const [analysis, setAnalysis] = useState<PhrasingAnalysis | null>(null)
  const [document, setDocument] = useState<MobileStudyDocument | null>(null)
  const [runState, setRunState] = useState<RunState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [account, setAccount] = useState<Entitlement | null>(null)
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatus | null | undefined>(undefined)
  const [studies, setStudies] = useState<StudySummary[]>([])
  const [devices, setDevices] = useState<DeviceRecord[]>([])
  const [currentStudyId, setCurrentStudyId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [tabletMode, setTabletMode] = useState<TabletStudyMode>('plain')
  const [tabletWorkspace, setTabletWorkspace] = useState<TabletSermonWorkspace | null>(null)
  const [workspaceRevision, setWorkspaceRevision] = useState(0)
  const [workspaceSyncState, setWorkspaceSyncState] = useState<WorkspaceSyncState>('saved')
  const [workspaceConflict, setWorkspaceConflict] = useState<WorkspaceConflict | null>(null)
  const [workspaceConflictBusy, setWorkspaceConflictBusy] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesNotice, setNotesNotice] = useState<string | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null)
  const [archiveNotice, setArchiveNotice] = useState<ArchiveNotice | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [accountCode, setAccountCode] = useState('')
  const [accountCodeType, setAccountCodeType] = useState<'link' | 'access'>('link')
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountNote, setAccountNote] = useState<string | null>(null)
  const [accountMode, setAccountMode] = useState<'register' | 'recovery' | 'link'>(MOBILE_FULL_RELEASE ? 'register' : 'link')
  const [esvKey, setEsvKeyState] = useState('')
  const [ownerKey, setOwnerKey] = useState('')
  const [registrationEmail, setRegistrationEmail] = useState('')
  const [registrationCode, setRegistrationCode] = useState('')
  const [registrationStep, setRegistrationStep] = useState<'email' | 'code'>('email')
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryStep, setRecoveryStep] = useState<'email' | 'code'>('email')
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [storePlans, setStorePlans] = useState<StorePlan[]>([])
  const [billingCycle, setBillingCycle] = useState<'month' | 'year'>('month')
  const [storeBusy, setStoreBusy] = useState<string | null>(null)
  const [storeNote, setStoreNote] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'subscription'>('idle')
  const [deleteProviders, setDeleteProviders] = useState<string[]>([])
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [aiProcessingConsent, setAiProcessingConsent] = useState(false)
  const [aiConsentAction, setAiConsentAction] = useState<AiConsentAction | null>(null)
  const notesTimer = useRef<number | null>(null)
  const workspaceTimer = useRef<number | null>(null)
  const workspaceRevisionRef = useRef(0)
  const localEditEpochRef = useRef(0)
  const workspaceEditEpochRef = useRef(0)
  const activeStudyIdRef = useRef<string | null>(null)
  const workspaceRemoteInFlight = useRef(false)
  const workspaceConflictRef = useRef(false)
  const workspaceRemotePending = useRef<{
    studyId: string
    ownerKey: string
    workspace: TabletSermonWorkspace
    revision: number
    editEpoch: number
  } | null>(null)
  const flushWorkspaceRemoteRef = useRef<() => Promise<void>>(async () => {})
  const studyRunLock = useRef(false)
  const studyRequest = useRef<{ key: string; id: string } | null>(null)
  const studyAbort = useRef<AbortController | null>(null)
  const captureAutoRunStarted = useRef(false)
  const captureLatestOpened = useRef(false)
  const recorder = useSermonRecorder(ownerKey || 'unlinked', reference)
  const registrationEnabled = Boolean(
    MOBILE_FULL_RELEASE
    && releaseStatus?.ok
    && releaseStatus.releaseStage === 'full'
    && releaseStatus.capabilities.account_recovery_email,
  )
  const accountServiceUnavailable = MOBILE_FULL_RELEASE && releaseStatus !== undefined && !registrationEnabled

  const cancelStudyRun = useCallback(() => {
    studyAbort.current?.abort()
    studyAbort.current = null
    studyRequest.current = null
    studyRunLock.current = false
    setRunState('idle')
  }, [])

  const selectStudyId = useCallback((id: string | null) => {
    activeStudyIdRef.current = id
    setCurrentStudyId(id)
  }, [])

  const clearActiveReading = useCallback(() => {
    cancelStudyRun()
    if (notesTimer.current) window.clearTimeout(notesTimer.current)
    if (workspaceTimer.current) window.clearTimeout(workspaceTimer.current)
    notesTimer.current = null
    workspaceTimer.current = null
    workspaceRemotePending.current = null
    workspaceConflictRef.current = false
    setReference('')
    setPassage(null)
    setAnalysis(null)
    setDocument(null)
    setNotes('')
    setTabletWorkspace(null)
    workspaceRevisionRef.current = 0
    setWorkspaceRevision(0)
    setWorkspaceSyncState('saved')
    setWorkspaceConflict(null)
    setWorkspaceConflictBusy(false)
    setNotesNotice(null)
    setNotesOpen(false)
    setAskOpen(false)
    setTabletMode('plain')
    selectStudyId(null)
  }, [cancelStudyRun, selectStudyId])

  const refresh = useCallback(async () => {
    const installId = await getInstallId()
    const installOwnerKey = `install:${installId}`
    const storedAccountId = await getAccountId().catch(() => null)
    await claimLegacyStudies(installOwnerKey).catch(() => {})

    let state: Entitlement | null = null
    let reachedServer = false
    try {
      state = await getMe()
      reachedServer = true
      setAccount(state)
    } catch {
      // Keep the last known account state and its local library available offline.
    }

    let nextOwnerKey = storedAccountId ? `account:${storedAccountId}` : installOwnerKey
    if (reachedServer && state?.anonymous) {
      nextOwnerKey = installOwnerKey
      if (storedAccountId) clearActiveReading()
      await Promise.all([
        clearAccountId(),
        clearDeviceToken(),
      ])
    }
    if (state && !state.anonymous && state.accountId) {
      nextOwnerKey = `account:${state.accountId}`
      await setAccountId(state.accountId).catch(() => {})
      await Promise.all([
        moveLocalStudies(installOwnerKey, nextOwnerKey),
        moveSermonRecordings(installOwnerKey, nextOwnerKey),
      ]).catch(() => {})
    }
    setOwnerKey(nextOwnerKey)

    const localRecords = await listLocalStudies(nextOwnerKey, true).catch(() => [])
    const locallyArchived = new Set(localRecords.filter((study) => study.archivedAt).map((study) => study.id))
    const merged = new Map(localRecords.map((study) => [study.id, localStudySummary(study)]))
    if (state && !state.anonymous) {
      const [nextStudies, nextDevices] = await Promise.all([
        listStudies(true).catch(() => []),
        listDevices().catch(() => []),
      ])
      nextStudies.forEach((study) => {
        if (!locallyArchived.has(study.id) || study.archived_at) merged.set(study.id, study)
      })
      setDevices(nextDevices)
    } else if (reachedServer) {
      setDevices([])
    }
    setStudies(Array.from(merged.values())
      .sort((left, right) =>
        String(right.completed_at || right.updated_at).localeCompare(String(left.completed_at || left.updated_at))))
  }, [clearActiveReading])

  const showLocalStudy = (study: LocalStudyRecord) => {
    cancelStudyRun()
    setReference(study.reference)
    setTranslation(study.translation)
    setPassage(study.passage)
    setAnalysis(study.analysis)
    setDocument(study.document)
    selectStudyId(study.id)
    setNotes(study.notes)
    setTabletWorkspace(study.workspace || null)
    const nextRevision = Number.isInteger(study.workspaceRevision) ? study.workspaceRevision : 0
    workspaceRevisionRef.current = nextRevision
    workspaceConflictRef.current = false
    setWorkspaceConflict(null)
    setWorkspaceConflictBusy(false)
    setWorkspaceRevision(nextRevision)
    setWorkspaceSyncState('saved')
    setNotesNotice(null)
    setTabletMode('plain')
    setTab('study')
  }

  useEffect(() => {
    let resumeHandle: Awaited<ReturnType<typeof CapacitorApp.addListener>> | null = null
    let cancelled = false
    ;(async () => {
      const native = Capacitor.isNativePlatform()
      try {
        const [seenIntro, storedEsvKey, storedAiConsent, currentReleaseStatus] = await Promise.all([
          hasSeenIntro().catch(() => false),
          getEsvKey().catch(() => null),
          hasAiProcessingConsent().catch(() => false),
          MOBILE_FULL_RELEASE ? getReleaseStatus().catch(() => null) : Promise.resolve(null),
        ])
        if (cancelled) return
        setIntro(!seenIntro)
        setEsvKeyState(storedEsvKey || '')
        setAiProcessingConsent(storedAiConsent)
        setReleaseStatus(currentReleaseStatus)
        setAccountMode(currentReleaseStatus?.ok
          && currentReleaseStatus.releaseStage === 'full'
          && currentReleaseStatus.capabilities.account_recovery_email
          ? 'register'
          : 'link')
        if (native) {
          await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
          await StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
          await StatusBar.setBackgroundColor({ color: '#10120F' }).catch(() => {})
          if (!cancelled) {
            resumeHandle = await CapacitorApp.addListener('resume', () => {
              void (async () => {
                if (MOBILE_FULL_RELEASE) setReleaseStatus(await getReleaseStatus().catch(() => null))
                if (MOBILE_FULL_RELEASE) await reconcilePendingStorePurchases().catch(() => {})
                await refresh()
              })()
            })
          }
        }
      } finally {
        if (native) await SplashScreen.hide().catch(() => {})
      }
      if (!cancelled) await refresh()
    })().catch(() => {})
    return () => {
      cancelled = true
      void resumeHandle?.remove()
    }
  }, [refresh])

  useEffect(() => () => {
    if (notesTimer.current) window.clearTimeout(notesTimer.current)
    if (workspaceTimer.current) window.clearTimeout(workspaceTimer.current)
  }, [])

  useEffect(() => {
    if (!MOBILE_FULL_RELEASE || tab !== 'account' || !storePlatform()) return
    let cancelled = false
    setStoreNote(null)
    loadStorePlans()
      .then((plans) => {
        if (cancelled) return
        setStorePlans(plans)
        if (!plans.length) setStoreNote('Store plans are not available yet. Try again after the store finishes loading.')
      })
      .catch((caught) => {
        if (!cancelled) {
          setStorePlans([])
          setStoreNote(errorMessage(caught))
        }
      })
    return () => { cancelled = true }
  }, [tab])

  useEffect(() => {
    if (!MOBILE_FULL_RELEASE || !storePlatform()) return
    let listener: Awaited<ReturnType<typeof listenForStoreTransactions>> = null
    let cancelled = false
    void listenForStoreTransactions(async (transaction) => {
      if (cancelled) return
      setStoreBusy('pending')
      setStoreNote(`Confirming your ${storePlatform() === 'android' ? 'Google Play' : 'App Store'} purchase…`)
      try {
        await verifyPendingStoreTransaction(transaction)
        setStoreNote('Your subscription is active.')
        await refresh()
      } catch (caught) {
        if (isStoreFinalizationPendingError(caught)) {
          setStoreNote(caught.message)
          await refresh()
        } else {
          setStoreNote(errorMessage(caught))
        }
      } finally {
        setStoreBusy(null)
      }
    }).then((handle) => { listener = handle })
    return () => {
      cancelled = true
      void listener?.remove()
    }
  }, [refresh])

  useEffect(() => {
    if (!MOBILE_FULL_RELEASE || !account?.accountId || !storePlatform()) return
    let cancelled = false
    void reconcilePendingStorePurchases()
      .then((count) => { if (!cancelled && count) return refresh() })
      .catch(() => {})
    return () => { cancelled = true }
  }, [account?.accountId, account?.status, refresh])

  const loadPassage = async () => {
    const clean = reference.trim()
    if (!clean || runState !== 'idle') return null
    setRunState('loading-passage')
    setError(null)
    try {
      const loaded = await fetchPassage(clean, translation)
      setPassage(loaded)
      setReference(loaded.reference)
      setAnalysis(null)
      setDocument(null)
      setTabletWorkspace(null)
      workspaceRevisionRef.current = 0
      workspaceConflictRef.current = false
      setWorkspaceRevision(0)
      setWorkspaceSyncState('saved')
      setTabletMode('plain')
      selectStudyId(null)
      setNotes('')
      return loaded
    } catch (caught) {
      setError(errorMessage(caught))
      return null
    } finally {
      setRunState('idle')
    }
  }

  const runStudy = async (consentOverride = false, referenceOverride?: string) => {
    if (studyRunLock.current || runState !== 'idle') return
    studyRunLock.current = true
    let controller: AbortController | null = null
    let requestId: string | null = null
    try {
      const studyLabel = tablet ? 'Guided Study' : 'Quick Study'
      const captureAutoRun = import.meta.env.VITE_OPERATOR_CAPTURE_AUTORUN === 'true'
      if (!captureAutoRun && (!account || account.anonymous) && !accountServiceUnavailable) {
        setAccountNote(registrationEnabled
          ? `Create your free account or link an existing one before running a ${studyLabel}. One email keeps the work yours.`
          : `Link this device to the Operator account already active on your desktop, then run the ${studyLabel}.`)
        setTab('account')
        return
      }
      if (!aiProcessingConsent && !consentOverride) {
        setAiConsentAction('study')
        return
      }
      let target = passage
      const requestedReference = (referenceOverride || reference).trim()
      if (!requestedReference) return
      const requestKind = tablet ? 'guided' : 'quick'
      const requestKey = `${requestKind}|${requestedReference.toLowerCase()}|${translation}`
      if (!studyRequest.current || studyRequest.current.key !== requestKey) {
        studyRequest.current = { key: requestKey, id: createStudyRequestId() }
      }
      if (!target || target.reference.toLowerCase() !== requestedReference.toLowerCase() || target.translation !== translation) {
        target = null
        setPassage(null)
        void fetchPassage(requestedReference, translation).then((loaded) => {
          if (studyRequest.current?.key !== requestKey) return
          setPassage(loaded)
          setReference(loaded.reference)
        }).catch(() => {})
      }
      setError(null)
      setAnalysis(null)
      setDocument(null)
      setTabletWorkspace(null)
      workspaceRevisionRef.current = 0
      workspaceConflictRef.current = false
      setWorkspaceRevision(0)
      setWorkspaceSyncState('saved')
      setTabletMode('plain')
      selectStudyId(null)
      requestId = studyRequest.current.id
      controller = new AbortController()
      studyAbort.current = controller
      setRunState(tablet ? 'guided-study' : 'quick-study')
      const result = tablet
        ? await runGuidedStudy(requestedReference, translation, requestId, controller.signal)
        : await runQuickStudy(requestedReference, translation, requestId, controller.signal)
      if (controller.signal.aborted || studyRequest.current?.id !== requestId) return
      target = result.passage
      studyRequest.current = null
      setPassage(target)
      setReference(target.reference)
      setTranslation(target.translation)
      setAnalysis(result.analysis)
      setDocument(result.document)
      selectStudyId(result.studyId)
      const nextWorkspace = tablet && isGuidedStudyDocument(result.document)
        ? createTabletSermonWorkspace(result.document, target)
        : null
      setTabletWorkspace(nextWorkspace)
      workspaceRevisionRef.current = 0
      workspaceConflictRef.current = false
      setWorkspaceRevision(0)
      setWorkspaceSyncState('saved')
      const finishedAt = new Date().toISOString()
      await saveLocalStudy({
        ownerKey,
        id: result.studyId,
        reference: target.reference,
        translation: target.translation,
        passage: target,
        analysis: result.analysis,
        document: result.document,
        notes: '',
        workspace: nextWorkspace,
        workspaceRevision: 0,
        workspaceDirty: Boolean(nextWorkspace),
        notesDirty: false,
        mainTheme: result.document.mainClaim,
        createdAt: finishedAt,
        updatedAt: finishedAt,
        completedAt: finishedAt,
        archivedAt: null,
      }).catch(() => {})
      if (nextWorkspace && account && !account.anonymous) {
        try {
          const synced = await updateStudyWorkspace(result.studyId, nextWorkspace, 0)
          const nextRevision = Number(synced.study.workspace_revision)
          const safeRevision = Number.isInteger(nextRevision) ? nextRevision : 1
          workspaceRevisionRef.current = safeRevision
          setWorkspaceRevision(safeRevision)
          await updateLocalStudy(ownerKey, result.studyId, {
            workspaceRevision: safeRevision,
            workspaceDirty: false,
          })
        } catch {
          setWorkspaceSyncState('local-only')
        }
      }
      await refresh()
    } catch (caught) {
      if (controller?.signal.aborted || (requestId && studyRequest.current?.id !== requestId)) return
      if (caught instanceof OperatorApiError && caught.code !== 'STUDY_IN_PROGRESS') studyRequest.current = null
      setError(errorMessage(caught))
      if (caught instanceof OperatorApiError && ['UPGRADE_REQUIRED', 'FREE_STUDY_SPENT'].includes(caught.code)) setTab('account')
    } finally {
      if (!controller || studyAbort.current === controller) {
        studyAbort.current = null
        setRunState('idle')
        studyRunLock.current = false
      }
    }
  }

  useEffect(() => {
    if (import.meta.env.VITE_OPERATOR_CAPTURE_AUTORUN !== 'true'
      || captureAutoRunStarted.current
      || intro
      || runState !== 'idle'
      || document) return

    captureAutoRunStarted.current = true
    const captureReference = 'Romans 8:1–11'
    setReference(captureReference)
    setAiProcessingConsent(true)
    void grantAiProcessingConsent()
    void runStudy(true, captureReference)
  }, [document, intro, ownerKey, releaseStatus, runState])

  const openStudy = async (id: string) => {
    setError(null)
    const cached = await getLocalStudy(ownerKey, id).catch(() => null)
    if (cached) {
      showLocalStudy(cached)
      if (!account || account.anonymous) return
      const editEpoch = localEditEpochRef.current
      void getStudy(id).then(async (study) => {
        const synced = fromSyncedStudy(ownerKey, study)
        const latest = await getLocalStudy(ownerKey, id).catch(() => null)
        if (!latest) return
        const localChanged = localEditEpochRef.current !== editEpoch
          || latest.updatedAt !== cached.updatedAt
          || Boolean(latest.notesDirty)
          || Boolean(latest.workspaceDirty)
        const remoteIsNewer = synced.updatedAt.localeCompare(latest.updatedAt) > 0
          || synced.workspaceRevision > latest.workspaceRevision
          || (!latest.workspace && Boolean(synced.workspace))
        if (!localChanged && remoteIsNewer) {
          await saveLocalStudy(synced)
          if (activeStudyIdRef.current === id) showLocalStudy(synced)
        } else if (localChanged && synced.workspaceRevision > latest.workspaceRevision && activeStudyIdRef.current === id) {
          workspaceConflictRef.current = true
          setWorkspaceConflict({
            studyId: id,
            workspace: synced.workspace,
            revision: synced.workspaceRevision,
          })
          setWorkspaceSyncState('conflict')
        }
      }).catch(() => {})
      return
    }
    try {
      const study = await getStudy(id)
      const local = fromSyncedStudy(ownerKey, study)
      await saveLocalStudy(local).catch(() => {})
      showLocalStudy(local)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  useEffect(() => {
    if (import.meta.env.VITE_OPERATOR_CAPTURE_OPEN_LATEST !== 'sermon'
      || captureLatestOpened.current
      || !ownerKey
      || document
      || runState !== 'idle') return
    const latestStudy = studies.find((study) => !study.archived_at)
    if (!latestStudy) return
    captureLatestOpened.current = true
    void openStudy(latestStudy.id).then(() => setTabletMode('sermon'))
  }, [document, ownerKey, runState, studies])

  const saveNotes = (value: string) => {
    const safeValue = value.slice(0, MAX_STUDY_NOTES_CHARS)
    setNotes(safeValue)
    setNotesNotice(value.length > MAX_STUDY_NOTES_CHARS
      ? `Field notes stop at ${MAX_STUDY_NOTES_CHARS.toLocaleString()} characters. Nothing was silently cut on the server.`
      : null)
    if (!currentStudyId) return
    localEditEpochRef.current += 1
    if (notesTimer.current) window.clearTimeout(notesTimer.current)
    notesTimer.current = window.setTimeout(() => {
      void (async () => {
        await updateLocalStudy(ownerKey, currentStudyId, { notes: safeValue, notesDirty: true })
        if (!account || account.anonymous) return
        try {
          const result = await updateStudy(currentStudyId, { notes: safeValue })
          const latest = await getLocalStudy(ownerKey, currentStudyId)
          if (latest?.notes === safeValue && result.study.notes === safeValue) {
            await updateLocalStudy(ownerKey, currentStudyId, { notesDirty: false })
          } else if (activeStudyIdRef.current === currentStudyId) {
            setNotesNotice('The cloud copy did not match these field notes. Your local copy is still marked unsynced.')
          }
        } catch (caught) {
          // Local work stays marked dirty until a later successful save.
          if (activeStudyIdRef.current === currentStudyId) setNotesNotice(errorMessage(caught))
        }
      })()
    }, 700)
  }

  flushWorkspaceRemoteRef.current = async () => {
    if (workspaceRemoteInFlight.current || workspaceConflictRef.current) return
    const pending = workspaceRemotePending.current
    if (!pending) return
    workspaceRemotePending.current = null
    workspaceRemoteInFlight.current = true
    let synced = false
    try {
      const result = await updateStudyWorkspace(pending.studyId, pending.workspace, pending.revision)
      const nextRevision = Number(result.study.workspace_revision)
      const safeRevision = Number.isInteger(nextRevision) ? nextRevision : pending.revision + 1
      const queued = workspaceRemotePending.current as typeof pending | null
      const workspaceChanged = workspaceEditEpochRef.current !== pending.editEpoch
      await updateLocalStudy(pending.ownerKey, pending.studyId, {
        workspaceRevision: safeRevision,
        workspaceDirty: workspaceChanged || Boolean(queued),
      })
      if (queued?.studyId === pending.studyId) {
        workspaceRemotePending.current = { ...queued, revision: safeRevision }
      }
      if (currentStudyId === pending.studyId) {
        workspaceRevisionRef.current = safeRevision
        setWorkspaceRevision(safeRevision)
        if (!workspaceRemotePending.current) setWorkspaceSyncState('saved')
      }
      synced = true
    } catch (caught) {
      if (caught instanceof OperatorApiError && caught.code === 'WORKSPACE_CONFLICT') {
        workspaceConflictRef.current = true
        workspaceRemotePending.current = null
        if (currentStudyId === pending.studyId) {
          let remoteWorkspace: TabletSermonWorkspace | null = null
          let remoteRevision = Number(caught.payload.currentRevision)
          try {
            const remote = await getStudy(pending.studyId)
            remoteWorkspace = remote.workspace
            remoteRevision = Number(remote.workspace_revision)
          } catch {
            // The resolution buttons retry this fetch; local work remains untouched.
          }
          setWorkspaceConflict({
            studyId: pending.studyId,
            workspace: remoteWorkspace,
            revision: Number.isInteger(remoteRevision) ? remoteRevision : pending.revision,
          })
          setWorkspaceSyncState('conflict')
        }
      } else {
        if (!workspaceRemotePending.current) workspaceRemotePending.current = pending
        if (currentStudyId === pending.studyId) setWorkspaceSyncState('local-only')
      }
    } finally {
      workspaceRemoteInFlight.current = false
      if (synced && workspaceRemotePending.current && !workspaceConflictRef.current) {
        void flushWorkspaceRemoteRef.current()
      }
    }
  }

  const saveTabletWorkspace = useCallback(async (value: TabletSermonWorkspace) => {
    setTabletWorkspace(value)
    if (!currentStudyId) return
    localEditEpochRef.current += 1
    workspaceEditEpochRef.current += 1
    setWorkspaceSyncState('saving')
    try {
      await updateLocalStudy(ownerKey, currentStudyId, {
        workspace: value,
        workspaceRevision: workspaceRevisionRef.current,
        workspaceDirty: true,
      })
    } catch {
      setWorkspaceSyncState('error')
      return
    }
    if (!account || account.anonymous || workspaceConflictRef.current) {
      setWorkspaceSyncState(workspaceConflictRef.current ? 'conflict' : 'local-only')
      return
    }
    workspaceRemotePending.current = {
      studyId: currentStudyId,
      ownerKey,
      workspace: value,
      revision: workspaceRevisionRef.current,
      editEpoch: workspaceEditEpochRef.current,
    }
    if (workspaceTimer.current) window.clearTimeout(workspaceTimer.current)
    workspaceTimer.current = window.setTimeout(() => {
      void flushWorkspaceRemoteRef.current()
    }, 850)
  }, [account, currentStudyId, ownerKey])

  const useCloudWorkspace = async () => {
    const conflict = workspaceConflict
    if (!conflict || workspaceConflictBusy || activeStudyIdRef.current !== conflict.studyId) return
    setWorkspaceConflictBusy(true)
    const resolutionEpoch = workspaceEditEpochRef.current
    try {
      const remote = await getStudy(conflict.studyId)
      if (workspaceEditEpochRef.current !== resolutionEpoch) {
        setWorkspaceSyncState('conflict')
        return
      }
      const remoteRevision = Number(remote.workspace_revision)
      const safeRevision = Number.isInteger(remoteRevision) ? remoteRevision : conflict.revision
      await updateLocalStudy(ownerKey, conflict.studyId, {
        workspace: remote.workspace,
        workspaceRevision: safeRevision,
        workspaceDirty: false,
      })
      workspaceRemotePending.current = null
      workspaceConflictRef.current = false
      workspaceRevisionRef.current = safeRevision
      setTabletWorkspace(remote.workspace)
      setWorkspaceRevision(safeRevision)
      setWorkspaceConflict(null)
      setWorkspaceSyncState('saved')
    } catch {
      setWorkspaceSyncState('conflict')
    } finally {
      setWorkspaceConflictBusy(false)
    }
  }

  const keepLocalWorkspace = async () => {
    const conflict = workspaceConflict
    if (!conflict || workspaceConflictBusy || activeStudyIdRef.current !== conflict.studyId) return
    setWorkspaceConflictBusy(true)
    try {
      const remote = await getStudy(conflict.studyId)
      const local = await getLocalStudy(ownerKey, conflict.studyId)
      if (!local?.workspace) throw new Error('This tablet no longer has a sermon desk to keep.')
      const resolutionEpoch = workspaceEditEpochRef.current
      const result = await updateStudyWorkspace(conflict.studyId, local.workspace, Number(remote.workspace_revision))
      const nextRevision = Number(result.study.workspace_revision)
      const safeRevision = Number.isInteger(nextRevision) ? nextRevision : Number(remote.workspace_revision) + 1
      const latest = await getLocalStudy(ownerKey, conflict.studyId)
      const changedDuringResolution = workspaceEditEpochRef.current !== resolutionEpoch
        || Boolean(latest && latest.updatedAt !== local.updatedAt)
      await updateLocalStudy(ownerKey, conflict.studyId, {
        workspaceRevision: safeRevision,
        workspaceDirty: changedDuringResolution,
      })
      workspaceConflictRef.current = false
      workspaceRevisionRef.current = safeRevision
      setWorkspaceRevision(safeRevision)
      setWorkspaceConflict(null)
      if (changedDuringResolution && latest?.workspace) {
        workspaceRemotePending.current = {
          studyId: conflict.studyId,
          ownerKey,
          workspace: latest.workspace,
          revision: safeRevision,
          editEpoch: workspaceEditEpochRef.current,
        }
        setWorkspaceSyncState('saving')
        void flushWorkspaceRemoteRef.current()
      } else {
        workspaceRemotePending.current = null
        setWorkspaceSyncState('saved')
      }
    } catch (caught) {
      if (caught instanceof OperatorApiError && caught.code === 'WORKSPACE_CONFLICT') {
        const remote = await getStudy(conflict.studyId).catch(() => null)
        if (remote) {
          setWorkspaceConflict({
            studyId: conflict.studyId,
            workspace: remote.workspace,
            revision: Number(remote.workspace_revision),
          })
        }
      }
      workspaceConflictRef.current = true
      setWorkspaceSyncState('conflict')
    } finally {
      setWorkspaceConflictBusy(false)
    }
  }

  const archiveStudy = async (id: string) => {
    const study = studies.find((candidate) => candidate.id === id)
    const archivedAt = new Date().toISOString()
    await updateLocalStudy(ownerKey, id, { archivedAt }).catch(() => {})
    if (account && !account.anonymous) await updateStudy(id, { archived: true }).catch(() => {})
    setArchiveConfirmId(null)
    setArchiveNotice({ id, reference: study?.reference || 'Study' })
    await refresh()
  }

  const restoreStudy = async (id: string) => {
    try {
      if (account && !account.anonymous) await updateStudy(id, { archived: false })
      await updateLocalStudy(ownerKey, id, { archivedAt: null })
      setArchiveNotice(null)
      await refresh()
    } catch (caught) {
      setArchiveNotice(null)
      setError(errorMessage(caught))
    }
  }

  const openAsk = () => {
    if (aiProcessingConsent) setAskOpen(true)
    else setAiConsentAction('ask')
  }

  const acceptAiProcessing = async () => {
    const action = aiConsentAction
    await grantAiProcessingConsent()
    setAiProcessingConsent(true)
    setAiConsentAction(null)
    if (action === 'study') await runStudy(true)
    else if (action === 'ask') setAskOpen(true)
    else setAccountNote('AI-processing permission is on. You can withdraw it here at any time.')
  }

  const withdrawAiProcessing = async () => {
    await withdrawAiProcessingConsent()
    setAiProcessingConsent(false)
    setAskOpen(false)
    setAiConsentAction(null)
    setAccountNote('AI-processing permission is off. Saved work stays available, but new generated requests will ask again.')
  }

  const submitAccountCode = async () => {
    const code = accountCode.trim()
    if (!code || accountBusy) return
    if (storePlatform() && accountCodeType === 'access') {
      setAccountNote('Purchase codes are redeemed on desktop. Link this device to that Operator account instead.')
      setAccountCodeType('link')
      return
    }
    setAccountBusy(true)
    setAccountNote(null)
    try {
      if (accountCodeType === 'link') await redeemDeviceLink(code)
      else await redeemAccessCode(code)
      setAccountCode('')
      setAccountNote('This device is connected. Your studies will stay in sync.')
      await refresh()
    } catch (caught) {
      setAccountNote(errorMessage(caught))
    } finally {
      setAccountBusy(false)
    }
  }

  const saveEsv = async () => {
    await setEsvKey(esvKey)
    setAccountNote(esvKey.trim() ? 'ESV key saved securely on this device.' : 'ESV key removed.')
  }

  const completeFreeAccount = async (email: string, code: string) => {
    await confirmMobileRegistration(email, code)
    await markIntroSeen()
    setIntro(false)
    setRegistrationEmail('')
    setRegistrationCode('')
    setRegistrationStep('email')
    setAccountMode('register')
    setAccountNote(`Your free account is ready. Your first ${tablet ? 'Guided Study' : 'Quick Study'} is included.`)
    await refresh()
  }

  const requestRegistrationFromIntro = async (email: string, optIn: boolean) => {
    await requestMobileRegistration(email, optIn)
  }

  const confirmRegistrationFromIntro = async (email: string, code: string) => {
    await completeFreeAccount(email.trim().toLowerCase(), code)
  }

  const requestRegistrationFromAccount = async () => {
    if (!registrationEmail.trim() || accountBusy) return
    setAccountBusy(true)
    setAccountNote(null)
    try {
      const email = registrationEmail.trim().toLowerCase()
      const result = await requestMobileRegistration(email, marketingOptIn)
      setRegistrationEmail(email)
      setRegistrationCode('')
      setRegistrationStep('code')
      setAccountNote(result.message)
    } catch (caught) {
      setAccountNote(errorMessage(caught))
    } finally {
      setAccountBusy(false)
    }
  }

  const confirmRegistrationFromAccount = async () => {
    if (!registrationEmail.trim() || !/^\d{6}$/.test(registrationCode) || accountBusy) return
    setAccountBusy(true)
    setAccountNote(null)
    try {
      await completeFreeAccount(registrationEmail.trim().toLowerCase(), registrationCode)
    } catch (caught) {
      setAccountNote(errorMessage(caught))
    } finally {
      setAccountBusy(false)
    }
  }

  const requestRecovery = async () => {
    const email = recoveryEmail.trim().toLowerCase()
    if (!email || recoveryBusy) return
    setRecoveryBusy(true)
    setAccountNote(null)
    try {
      const result = await requestAccountRecovery(email)
      setRecoveryEmail(email)
      setRecoveryCode('')
      setRecoveryStep('code')
      setAccountNote(result.message)
    } catch (caught) {
      setAccountNote(errorMessage(caught))
    } finally {
      setRecoveryBusy(false)
    }
  }

  const confirmRecovery = async () => {
    const email = recoveryEmail.trim().toLowerCase()
    const code = recoveryCode.trim()
    if (!email || !/^\d{6}$/.test(code) || recoveryBusy) return
    setRecoveryBusy(true)
    setAccountNote(null)
    try {
      await confirmAccountRecovery(email, code)
      await markIntroSeen()
      setIntro(false)
      setRecoveryCode('')
      setRecoveryStep('email')
      setAccountNote('Signed in. Your Operator account and saved studies are connected to this device.')
      await refresh()
    } catch (caught) {
      setAccountNote(errorMessage(caught))
    } finally {
      setRecoveryBusy(false)
    }
  }

  const buyStorePlan = async (plan: StorePlan) => {
    if (!account?.accountId || storeBusy) return
    setStoreBusy(plan.plan)
    setStoreNote(null)
    try {
      await purchaseStorePlan(plan, account.accountId)
      setStoreNote('Purchase confirmed. Your new allowance is ready.')
      await refresh()
    } catch (caught) {
      if (isStoreFinalizationPendingError(caught)) {
        setStoreNote(caught.message)
        await refresh()
      } else {
        setStoreNote(errorMessage(caught))
      }
    } finally {
      setStoreBusy(null)
    }
  }

  const restorePurchases = async () => {
    if (storeBusy) return
    if (!account?.accountId) {
      setAccountCodeType('link')
      setAccountNote('Link this device to your Operator account first. A store receipt restores access; it never unlocks someone else’s saved studies.')
      return
    }
    setStoreBusy('restore')
    setStoreNote(null)
    try {
      await restoreStorePurchases()
      setStoreNote('Your active store subscription has been restored.')
      await refresh()
    } catch (caught) {
      setStoreNote(errorMessage(caught))
    } finally {
      setStoreBusy(null)
    }
  }

  const manageBilling = async () => {
    setStoreBusy('manage')
    setStoreNote(null)
    try {
      if (account?.billingProvider === 'stripe') {
        if (nativePlatform) throw new Error('Manage this existing web subscription from BASE1520.com in your browser. The mobile app does not open outside payment pages.')
        await openExternal(await createBillingPortal())
      } else if (account?.billingProvider === 'apple' || account?.billingProvider === 'google') {
        await manageStoreSubscriptions()
      } else {
        throw new Error('No managed subscription is attached to this account.')
      }
    } catch (caught) {
      setStoreNote(errorMessage(caught))
    } finally {
      setStoreBusy(null)
    }
  }

  const deleteAccount = async (confirmSubscriptions: boolean) => {
    if (!account?.accountId || deleteBusy) return
    setDeleteBusy(true)
    setAccountNote(null)
    const deletedOwnerKey = `account:${account.accountId}`
    let serverDeleted = false
    try {
      await deleteOperatorAccount(confirmSubscriptions)
      serverDeleted = true
      await deleteLocalStudies(deletedOwnerKey)
      await deleteSermonRecordingsForOwner(deletedOwnerKey)
      setAccount(null)
      setStudies([])
      setDevices([])
      clearActiveReading()
      setDeleteStep('idle')
      setAccountNote('Your Operator account and saved account data have been deleted.')
      await refresh()
    } catch (caught) {
      if (caught instanceof OperatorApiError && caught.code === 'ACTIVE_SUBSCRIPTION') {
        setDeleteProviders(Array.isArray(caught.payload.activeProviders) ? caught.payload.activeProviders.map(String) : [])
        setDeleteStep('subscription')
      } else if (serverDeleted) {
        setAccount(null)
        setStudies([])
        setDevices([])
        clearActiveReading()
        setDeleteStep('idle')
        setAccountNote('Your online Operator account was deleted, but this device could not erase its saved local studies. Remove the app or contact support before anyone else uses this device.')
      } else {
        setAccountNote(errorMessage(caught))
      }
    } finally {
      setDeleteBusy(false)
    }
  }

  const linkedAccount = Boolean(account && !account.anonymous)
  const nativePlatform = storePlatform()
  const nativeStore = MOBILE_FULL_RELEASE ? nativePlatform : null
  const visibleStorePlans = storePlans.filter((plan) => plan.plan.endsWith('_annual') === (billingCycle === 'year'))
  const activeStudies = studies.filter((study) => !study.archived_at)
  const archivedStudies = studies.filter((study) => Boolean(study.archived_at))
  const quickDocument = isQuickStudyDocument(document) ? document : null
  const guidedDocument = isGuidedStudyDocument(document) ? document : null
  const plainDocument: PlainReadDoc | null = document && !quickDocument && !guidedDocument ? document as PlainReadDoc : null
  const askDocument: PlainReadDoc | GuidedStudyDoc | null = guidedDocument || plainDocument
  const resolvedTabletWorkspace = useMemo(() => {
    if (!guidedDocument || !passage) return null
    const normalized = normalizeTabletSermonWorkspace(tabletWorkspace, guidedDocument, passage)
    if (import.meta.env.VITE_OPERATOR_CAPTURE_HIDE_COMMENTARY !== 'true') return normalized
    return {
      ...normalized,
      nodes: normalized.nodes.map((node) => node.data.kind === 'commentary'
        ? { ...node, hidden: true }
        : node),
    }
  }, [guidedDocument, passage, tabletWorkspace])
  useEffect(() => {
    if (import.meta.env.VITE_OPERATOR_CAPTURE_OPEN_LATEST === 'sermon'
      && guidedDocument
      && currentStudyId
      && analysis) setTabletMode('sermon')
  }, [analysis, currentStudyId, guidedDocument])
  const activeReading = Boolean(document || runState === 'quick-study' || runState === 'guided-study')
  const passageText = passage?.text || analysis?.passageText || ''
  const statusCopy = useMemo(() => {
    if (runState === 'loading-passage') return 'Loading the passage'
    if (runState === 'quick-study') return 'Building the Quick Study'
    if (runState === 'guided-study') return 'Working the COVENANT study'
    return null
  }, [runState])

  if (intro) {
    return <Intro
      onRequestRegistration={requestRegistrationFromIntro}
      onConfirmRegistration={confirmRegistrationFromIntro}
      onContinue={() => {
        void markIntroSeen()
        setIntro(false)
      }}
      registrationEnabled={registrationEnabled}
      accountServiceUnavailable={accountServiceUnavailable}
      tablet={tablet}
      onExisting={() => {
        void markIntroSeen()
        setIntro(false)
        setAccountMode(registrationEnabled ? 'recovery' : 'link')
        if (!registrationEnabled) setAccountNote(accountServiceUnavailable
          ? 'Account creation is temporarily unavailable. You can keep studying on this device or link an existing Operator account.'
          : 'Open The Operator on desktop and create a temporary device-link code.')
        setTab('account')
      }}
    />
  }

  return (
    <div className={`mobile-app ${tablet ? 'mobile-tablet' : 'mobile-phone'}`}>
      <BrandHeader onAccount={() => setTab('account')} />

      <main className={`mobile-main ${activeReading && tab === 'study' ? 'reading-open' : ''}`}>
        {tab === 'study' && !activeReading && (
          <section className="mobile-study-start">
            <div className="mobile-eyebrow">{tablet ? 'COVENANT GUIDED STUDY' : 'QUICK STUDY'}</div>
            <h1>{tablet ? <>Study the text.<br />Build from the text.</> : <>Look it up.<br />Get back to the text.</>}</h1>
            <p className="mobile-lead">{tablet
              ? 'Start with a complete PLAIN study through all eight COVENANT movements, then move the same evidence into an Infinite Desk for outlining, manuscript work, Pencil notes, recording, and preaching.'
              : 'Meaning, context, key words, and why it matters—without building a sermon.'}</p>
            <div className="mobile-reference-card">
              <label htmlFor="mobile-reference">PASSAGE</label>
              <input id="mobile-reference" value={reference} onChange={(event) => {
                studyRequest.current = null
                setReference(event.target.value)
                if (passage && event.target.value.trim().toLowerCase() !== passage.reference.toLowerCase()) setPassage(null)
              }} placeholder="Romans 8:1–11" autoCapitalize="words" autoCorrect="off" />
              <div className="mobile-translation-row">{TRANSLATIONS.map((item) => <button key={item.id} className={translation === item.id ? 'active' : ''} onClick={() => {
                studyRequest.current = null
                setTranslation(item.id)
                if (passage?.translation !== item.id) setPassage(null)
              }}>{item.label}</button>)}</div>
              <button className="mobile-secondary" onClick={loadPassage} disabled={!reference.trim() || runState !== 'idle'}>{runState === 'loading-passage' ? 'LOADING…' : 'READ PASSAGE ONLY'}</button>
            </div>
            {passage && (
              <div className="mobile-passage-preview">
                <div className="mobile-preview-heading"><span>{passage.reference}</span><small>{passage.translation.toUpperCase()}</small></div>
                <div className="mobile-verse-list">
                  {passage.verses.length
                    ? passage.verses.map((verse) => <p key={`${verse.chapter}:${verse.verse}`}><b>{verse.verse}</b>{verse.text}</p>)
                    : <p>{passage.text}</p>}
                </div>
                <small className="mobile-copyright">{passage.copyright}</small>
                <button className="mobile-primary" onClick={() => { void runStudy() }} disabled={runState !== 'idle'}>{tablet ? 'START GUIDED STUDY' : 'BUILD QUICK STUDY'}</button>
              </div>
            )}
            {!passage && <button className="mobile-primary mobile-send-direct" onClick={() => { void runStudy() }} disabled={!reference.trim() || runState !== 'idle'}>{tablet ? 'START GUIDED STUDY' : 'BUILD QUICK STUDY'}</button>}
            {error && <div className="mobile-error">{error}</div>}
          </section>
        )}

        {tab === 'study' && activeReading && (
          <section className={`mobile-reader-stage ${tablet && tabletMode === 'sermon' ? 'sermon-side-open' : ''}`}>
            <div className="mobile-reader-toolbar">
              <button onClick={() => {
                cancelStudyRun()
                setAnalysis(null)
                setDocument(null)
                setPassage(null)
                selectStudyId(null)
                setNotes('')
                setTabletWorkspace(null)
                workspaceRevisionRef.current = 0
                workspaceConflictRef.current = false
                setWorkspaceRevision(0)
                setWorkspaceSyncState('saved')
                setTabletMode('plain')
              }}>‹ NEW TEXT</button>
              <div><span>{passage?.translation.toUpperCase()}</span><strong>{reference}</strong></div>
              <button onClick={() => setNotesOpen(true)}>NOTES</button>
            </div>
            {tablet && guidedDocument && resolvedTabletWorkspace && <div className="tablet-side-switch">
              <button aria-label={`Switch to ${tabletMode === 'plain' ? 'sermon' : 'plain'} side`} onClick={() => setTabletMode((mode) => mode === 'plain' ? 'sermon' : 'plain')}>
                <span className={tabletMode === 'plain' ? 'active' : ''}>PLAIN</span>
                <i>/</i>
                <span className={tabletMode === 'sermon' ? 'active' : ''}>SERMON</span>
              </button>
            </div>}
            {statusCopy && <div className="mobile-run-status"><i />{statusCopy}</div>}
            {error && <div className="mobile-reader-error">{error}<button onClick={() => { void runStudy() }} disabled={runState !== 'idle'}>TRY AGAIN</button></div>}
            <div className={`mobile-reader-host ${tabletMode === 'sermon' ? 'tablet-sermon-host' : ''}`}>
              {tablet && tabletMode === 'sermon' && guidedDocument && resolvedTabletWorkspace && currentStudyId && analysis
                ? <Suspense fallback={<div className="tablet-desk-loading"><i /><strong>OPENING THE INFINITE DESK</strong><span>Your PLAIN study is already safe.</span></div>}>
                  <TabletSermonDesk
                    studyId={currentStudyId}
                    analysis={analysis}
                    workspaceKey={currentStudyId}
                    workspace={resolvedTabletWorkspace}
                    recorder={recorder}
                    syncAvailable={linkedAccount}
                    syncState={workspaceSyncState}
                    syncRevision={workspaceRevision}
                    conflictActions={workspaceConflict?.studyId === currentStudyId ? {
                      busy: workspaceConflictBusy,
                      onUseCloud: () => { void useCloudWorkspace() },
                      onKeepLocal: () => { void keepLocalWorkspace() },
                    } : undefined}
                    onWorkspaceChange={saveTabletWorkspace}
                  />
                </Suspense>
                : guidedDocument || runState === 'guided-study'
                ? <GuidedStudyDocument document={guidedDocument} passage={passage} loading={runState === 'guided-study'} studyId={currentStudyId} />
                : quickDocument || runState === 'quick-study'
                ? <QuickStudyDocument document={quickDocument} passage={passage} loading={runState === 'quick-study'} studyId={currentStudyId} />
                : <PlainReadDocument
                  doc={plainDocument}
                  partial={null}
                  loading={false}
                  analyzing={false}
                  error={null}
                  passageText={passageText}
                  reference={reference}
                />}
            </div>
            {askDocument && analysis && <button className="mobile-ask-fab" onClick={openAsk}>ASK</button>}
          </section>
        )}

        {tab === 'library' && (
          <section className="mobile-page">
            <div className="mobile-eyebrow">SYNCED LIBRARY</div>
            <h1>Your work<br />stays yours.</h1>
            {!linkedAccount && <div className="mobile-empty"><strong>{studies.length ? 'Saved on this device.' : accountServiceUnavailable ? 'Your included study is ready.' : 'Create or link your account first.'}</strong><p>{studies.length
              ? 'This work remains available here. Create or link an account when the account service is ready to sync it across devices.'
              : accountServiceUnavailable
                ? 'Run the study now. It will remain in this device library until you connect an account.'
                : 'Your free study belongs to your account so it can follow you instead of being trapped on one device.'}</p><button className="mobile-secondary" onClick={() => setTab('account')}>{accountServiceUnavailable ? 'ACCOUNT STATUS' : 'OPEN ACCOUNT'}</button></div>}
            {linkedAccount && !activeStudies.length && !archivedStudies.length && <div className="mobile-empty"><strong>No finished studies yet.</strong><p>Run a passage and it will appear here automatically.</p></div>}
            {archiveNotice && <div className="mobile-archive-notice" role="status"><span><strong>{archiveNotice.reference}</strong> archived.</span><button onClick={() => { void restoreStudy(archiveNotice.id) }}>UNDO</button></div>}
            <div className="mobile-study-list">{activeStudies.map((study) => (
              <article key={study.id}>
                <button className="mobile-study-open" onClick={() => openStudy(study.id)}>
                  <span>{new Date(study.completed_at || study.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <strong>{study.reference}</strong>
                  <p>{study.main_theme || 'Open the finished study.'}</p>
                </button>
                {archiveConfirmId === study.id
                  ? <div className="mobile-archive-confirm" role="alert"><strong>ARCHIVE THIS STUDY?</strong><button onClick={() => setArchiveConfirmId(null)}>CANCEL</button><button onClick={() => { void archiveStudy(study.id) }}>ARCHIVE</button></div>
                  : <button className="mobile-archive" onClick={() => setArchiveConfirmId(study.id)}>ARCHIVE</button>}
              </article>
            ))}</div>
            {archivedStudies.length > 0 && <section className="mobile-archived-section">
              <button className="mobile-archived-toggle" onClick={() => setShowArchived((visible) => !visible)}>{showArchived ? 'HIDE' : 'SHOW'} ARCHIVED ({archivedStudies.length})</button>
              {showArchived && <div className="mobile-study-list mobile-archived-list">{archivedStudies.map((study) => <article key={study.id}>
                <div className="mobile-study-open">
                  <span>{study.archived_at ? `ARCHIVED ${new Date(study.archived_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'ARCHIVED'}</span>
                  <strong>{study.reference}</strong>
                  <p>{study.main_theme || 'Archived study.'}</p>
                </div>
                <button className="mobile-archive mobile-restore" onClick={() => { void restoreStudy(study.id) }}>RESTORE</button>
              </article>)}</div>}
            </section>}
          </section>
        )}

        {tab === 'account' && (
          <section className="mobile-page mobile-account-page">
            <div className="mobile-eyebrow">YOUR ACCESS</div>
            <h1>{linkedAccount ? account?.label || 'Your account' : accountMode === 'recovery' ? 'Welcome back.' : accountMode === 'link' ? 'Link your account.' : 'Start free. Link later.'}</h1>
            <div className="mobile-account-meter">
              <div><span>{linkedAccount ? account?.email : 'FREE STUDY'}</span><strong>{account?.remaining ?? '—'}</strong></div>
              <p>{linkedAccount
                ? account?.plan === 'free'
                  ? `${tablet ? 'Guided Study' : 'Quick Study'} remains in your free account`
                  : `of ${account?.allowance ?? 0} studies remain this month`
                : registrationEnabled
                  ? 'Create one free account. No card or API key required.'
                  : accountServiceUnavailable
                    ? 'Your included study still works on this device. Account creation will return when the service is ready.'
                    : 'Link the account already active in The Operator on desktop.'}</p>
            </div>
            {accountNote && <div className="mobile-account-note">{accountNote}</div>}

            {!linkedAccount && accountServiceUnavailable && <div className="mobile-account-card mobile-register-card">
              <span className="mobile-card-label">ACCOUNT SERVICE</span>
              <h2>Study now. Connect later.</h2>
              <p>Your included study and saved work remain usable on this device. New-account creation and email sign-in are temporarily unavailable; an existing account can still be linked below.</p>
            </div>}

            {!linkedAccount && registrationEnabled && accountMode === 'register' && <div className="mobile-account-card mobile-register-card">
              <span className="mobile-card-label">START FREE</span>
              <h2>One email. Then the text.</h2>
              <p>Your first {tablet ? 'Guided Study' : 'Quick Study'} is included. The email makes the study yours and lets it follow you to another device.</p>
              <input
                type="email"
                value={registrationEmail}
                onChange={(event) => setRegistrationEmail(event.target.value)}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                disabled={registrationStep === 'code' || accountBusy}
              />
              {registrationStep === 'email' && <label className="mobile-consent">
                <input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} />
                <span>Send me useful study resources and Operator updates. Unsubscribe anytime.</span>
              </label>}
              {registrationStep === 'code' && <>
                <input
                  className="mobile-recovery-code"
                  value={registrationCode}
                  onChange={(event) => setRegistrationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  disabled={accountBusy}
                />
                <button className="mobile-mode-switch" onClick={() => { setRegistrationStep('email'); setRegistrationCode(''); setAccountNote(null) }}>USE A DIFFERENT EMAIL</button>
              </>}
              {registrationStep === 'email'
                ? <button className="mobile-primary" onClick={requestRegistrationFromAccount} disabled={!registrationEmail.trim() || accountBusy}>{accountBusy ? 'SENDING CODE…' : 'EMAIL MY VERIFICATION CODE'}</button>
                : <button className="mobile-primary" onClick={confirmRegistrationFromAccount} disabled={!/^\d{6}$/.test(registrationCode) || accountBusy}>{accountBusy ? 'VERIFYING…' : 'VERIFY AND CREATE ACCOUNT'}</button>}
              <button className="mobile-mode-switch" onClick={() => { setRegistrationStep('email'); setRegistrationCode(''); setAccountMode(MOBILE_FULL_RELEASE ? 'recovery' : 'link'); setAccountNote(null) }}>I ALREADY HAVE AN ACCOUNT</button>
            </div>}

            {!linkedAccount && registrationEnabled && accountMode === 'recovery' && <div className="mobile-account-card mobile-recovery-card">
              <span className="mobile-card-label">SIGN IN ON THIS DEVICE</span>
              <h2>Email yourself a one-time code.</h2>
              <p>Use the email already attached to your Operator account. No password—and a store receipt never unlocks someone else’s studies.</p>
              <input
                type="email"
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                disabled={recoveryStep === 'code' || recoveryBusy}
              />
              {recoveryStep === 'code' && <input
                className="mobile-recovery-code"
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                disabled={recoveryBusy}
              />}
              {recoveryStep === 'email'
                ? <>
                  <button className="mobile-primary" onClick={() => { void requestRecovery() }} disabled={!recoveryEmail.trim() || recoveryBusy}>{recoveryBusy ? 'SENDING…' : 'EMAIL ME A SIGN-IN CODE'}</button>
                  <button className="mobile-mode-switch" onClick={() => { setAccountMode('register'); setAccountNote(null) }}>I NEED A NEW ACCOUNT</button>
                </>
                : <>
                  <button className="mobile-primary" onClick={() => { void confirmRecovery() }} disabled={!/^\d{6}$/.test(recoveryCode) || recoveryBusy}>{recoveryBusy ? 'SIGNING IN…' : 'SIGN IN'}</button>
                  <div className="mobile-recovery-actions">
                    <button onClick={() => { setRecoveryCode(''); setRecoveryStep('email'); setAccountNote(null) }}>USE A DIFFERENT EMAIL</button>
                    <button onClick={() => { void requestRecovery() }} disabled={recoveryBusy}>SEND A NEW CODE</button>
                  </div>
                </>}
            </div>}

            {!linkedAccount && <div className="mobile-account-card">
              {nativePlatform
                ? <span className="mobile-card-label">LINK EXISTING ACCOUNT</span>
                : <div className="mobile-segment"><button className={accountCodeType === 'link' ? 'active' : ''} onClick={() => setAccountCodeType('link')}>LINK DESKTOP</button><button className={accountCodeType === 'access' ? 'active' : ''} onClick={() => setAccountCodeType('access')}>ACCESS CODE</button></div>}
              <p>{nativePlatform || accountCodeType === 'link' ? 'On desktop, open Settings → Your Access → Link a device. Enter the temporary code here.' : 'Already have an activation or comp code? Enter it here.'}</p>
              <input value={accountCode} onChange={(event) => setAccountCode(event.target.value.toUpperCase())} placeholder={accountCodeType === 'link' ? 'OPR-XXXX-XXXX' : 'BUY-… or OPERATOR-…'} autoCapitalize="characters" autoCorrect="off" />
              <button className="mobile-primary" onClick={submitAccountCode} disabled={!accountCode.trim() || accountBusy}>{accountBusy ? 'CONNECTING…' : 'CONNECT THIS DEVICE'}</button>
              {accountMode === 'link' && registrationEnabled && <button className="mobile-mode-switch" onClick={() => { setAccountMode('register'); setAccountNote(null) }}>I NEED A NEW ACCOUNT</button>}
            </div>}

            {linkedAccount && account?.paying && <div className="mobile-account-card mobile-current-plan">
              <span className="mobile-card-label">CURRENT ACCESS</span>
              <h2>{account.label}</h2>
              <p>{account.allowance} new studies each month. Every finished study remains in your library.</p>
              {(account.billingProvider === 'apple' || account.billingProvider === 'google' || (account.billingProvider === 'stripe' && !nativePlatform)) && <button className="mobile-secondary" onClick={() => { void manageBilling() }} disabled={Boolean(storeBusy)}>{storeBusy === 'manage' ? 'OPENING…' : 'MANAGE SUBSCRIPTION'}</button>}
              {account.billingProvider === 'stripe' && nativePlatform && <div className="mobile-store-staged"><strong>EXISTING WEB SUBSCRIPTION</strong><p>Manage it from BASE1520.com in your browser. The mobile app does not open outside payment or billing pages.</p></div>}
            </div>}

            {linkedAccount && <div className="mobile-account-card mobile-plan-card">
              <span className="mobile-card-label">{account?.paying ? 'CHANGE OR UPGRADE' : 'CHOOSE YOUR PLAN'}</span>
              <h2>Keep working new passages.</h2>
              <p>Every plan unlocks {tablet ? 'COVENANT Guided Study, the Infinite Sermon Desk, recording, Preach Mode,' : 'Quick Studies here'} and the full preparation workflow on desktop. Annual billing costs less, while the allowance still resets each month.</p>
              <div className="mobile-segment"><button className={billingCycle === 'month' ? 'active' : ''} onClick={() => setBillingCycle('month')}>MONTHLY</button><button className={billingCycle === 'year' ? 'active' : ''} onClick={() => setBillingCycle('year')}>ANNUAL</button></div>
              {nativeStore ? <>
                {storePlans.length > 0 ? <>
                  <div className="mobile-plans">
                    {visibleStorePlans.map((plan) => <button className="mobile-plan" key={`${plan.plan}:${plan.androidBasePlanId}`} onClick={() => { void buyStorePlan(plan) }} disabled={Boolean(storeBusy)}>
                      <span>{plan.plan.replace('_annual', '').toUpperCase()}</span>
                      <strong>{plan.priceString}<small>/{billingCycle === 'year' ? 'year' : 'month'}</small></strong>
                      <em>{PLAN_USAGE[plan.plan]} studies every month</em>
                      <b>{storeBusy === plan.plan ? 'CONFIRMING…' : 'SUBSCRIBE IN APP'}</b>
                    </button>)}
                  </div>
                  <div className="mobile-subscription-disclosure">
                    <strong>AUTO-RENEWING SUBSCRIPTION</strong>
                    <p>Tap a plan and confirm with the App Store or Google Play. On iPhone, Apple may ask for Face ID and a double-click of the side button. You will not be sent to a website checkout. Your store account is charged when you confirm. The subscription renews automatically at the displayed price and billing period unless you cancel before renewal. Manage or cancel in your store account. Annual plans are billed for the year, while the study allowance resets every month; unused studies do not roll over.</p>
                    <div><button onClick={() => { void openExternal(TERMS_URL) }}>TERMS OF USE ↗</button><button onClick={() => { void openExternal(PRIVACY_URL) }}>PRIVACY POLICY ↗</button></div>
                  </div>
                </> : <div className="mobile-store-staged"><strong>STORE PLANS ARE TEMPORARILY UNAVAILABLE.</strong><p>The App Store or Google Play did not return the complete Operator plan catalog. Try again after the store finishes loading.</p></div>}
              </> : <>
                <div className="mobile-plans mobile-plan-preview">
                  {Object.entries(PLAN_PRICING).map(([family, plan]) => <article className={`mobile-plan ${family === 'standard' ? 'featured' : ''}`} key={family}>
                    <span>{plan.label}</span>
                    <strong>{billingCycle === 'year' ? plan.annual : plan.monthly}<small>/{billingCycle === 'year' ? 'year' : 'month'}</small></strong>
                    <em>{plan.allowance} studies every month</em>
                    <b>{family === 'standard' ? 'MOST POPULAR' : 'OPERATOR ACCESS'}</b>
                  </article>)}
                </div>
                {nativePlatform
                  ? <div className="mobile-store-staged"><strong>STORE PLANS ARE TEMPORARILY UNAVAILABLE.</strong><p>The App Store or Google Play has not returned the plan catalog yet. Try again after the store finishes loading.</p></div>
                  : <button className="mobile-primary" onClick={() => { void openExternal(PLANS_URL) }}>CHOOSE ON BASE1520.COM</button>}
              </>}
            </div>}

            {nativeStore && <div className="mobile-account-card mobile-restore-card">
              <span className="mobile-card-label">STORE PURCHASE</span>
              <h2>Already subscribed?</h2>
              <p>{linkedAccount ? 'Restore an active App Store or Google Play subscription tied to this store account.' : 'Link your Operator account first, then restore its store subscription. A receipt never acts as a password to saved studies.'}</p>
              <button className="mobile-secondary" onClick={() => { void restorePurchases() }} disabled={Boolean(storeBusy)}>{storeBusy === 'restore' ? 'RESTORING…' : linkedAccount ? 'RESTORE PURCHASES' : 'LINK ACCOUNT FIRST'}</button>
            </div>}

            {storeNote && <div className="mobile-account-note">{storeNote}</div>}

            {MOBILE_ESV_LICENSED && <div className="mobile-account-card">
              <span className="mobile-card-label">BIBLE TEXT</span>
              <h2>Use your ESV key</h2>
              <p>Public-domain translations work without setup. Your ESV API key is stored encrypted in this device’s Keychain or Keystore and sent only over an encrypted connection when you load ESV text.</p>
              <input type="password" value={esvKey} onChange={(event) => setEsvKeyState(event.target.value)} placeholder="Paste ESV key" autoCapitalize="none" autoCorrect="off" />
              <button className="mobile-secondary" onClick={saveEsv}>SAVE ESV KEY</button>
            </div>}

            {linkedAccount && devices.length > 0 && <div className="mobile-account-card"><span className="mobile-card-label">ACTIVE DEVICES</span>{devices.map((device) => <div className="mobile-device" key={device.id}><div><strong>{device.label || device.platform || 'The Operator'}</strong><span>{device.current ? 'This device' : device.last_seen_at ? `Seen ${new Date(device.last_seen_at).toLocaleDateString()}` : 'Linked'}</span></div>{!device.current && <button onClick={async () => { await revokeDevice(device.id); await refresh() }}>REVOKE</button>}</div>)}</div>}

            <div className="mobile-account-card mobile-legal-card">
              <span className="mobile-card-label">HELP + PRIVACY</span>
              <button onClick={() => { aiProcessingConsent ? void withdrawAiProcessing() : setAiConsentAction('settings') }}>AI PROCESSING: {aiProcessingConsent ? 'ON · WITHDRAW' : 'OFF · REVIEW'} <b>›</b></button>
              <button onClick={() => { void openExternal(PRIVACY_URL) }}>PRIVACY POLICY <b>↗</b></button>
              <button onClick={() => { void openExternal(TERMS_URL) }}>TERMS OF USE <b>↗</b></button>
              <button onClick={() => { void openExternal(DELETE_INFO_URL) }}>ACCOUNT DELETION <b>↗</b></button>
              <button onClick={() => { void openExternal(SUPPORT_URL) }}>CONTACT SUPPORT <b>↗</b></button>
            </div>

            {linkedAccount && <div className="mobile-account-card mobile-danger-card">
              <span className="mobile-card-label">DELETE ACCOUNT</span>
              {deleteStep === 'idle' && <><h2>Delete your Operator account</h2><p>This permanently removes your account, synced studies, notes, devices, and email record from The Operator.</p><button className="mobile-danger-button" onClick={() => setDeleteStep('confirm')}>DELETE ACCOUNT…</button></>}
              {deleteStep === 'confirm' && <><h2>This cannot be undone.</h2><p>Your saved account data will be permanently deleted. Store purchases may require a separate cancellation.</p><div className="mobile-danger-actions"><button onClick={() => setDeleteStep('idle')}>KEEP ACCOUNT</button><button className="confirm" onClick={() => { void deleteAccount(false) }} disabled={deleteBusy}>{deleteBusy ? 'DELETING…' : 'PERMANENTLY DELETE'}</button></div></>}
              {deleteStep === 'subscription' && <><h2>Your subscription needs attention.</h2><p>{deleteProviders.includes('stripe') ? 'The Operator will cancel your Stripe subscription when you confirm deletion. ' : ''}{deleteProviders.some((provider) => provider === 'apple' || provider === 'google') ? 'Apple and Google do not let The Operator cancel for you. Open store management first or the store may continue charging after this account is gone.' : ''}</p>{deleteProviders.some((provider) => provider === 'apple' || provider === 'google') && <button className="mobile-secondary" onClick={() => { void manageBilling() }}>OPEN SUBSCRIPTION MANAGEMENT</button>}<div className="mobile-danger-actions"><button onClick={() => setDeleteStep('idle')}>CANCEL</button><button className="confirm" onClick={() => { void deleteAccount(true) }} disabled={deleteBusy}>{deleteBusy ? 'DELETING…' : 'DELETE ANYWAY'}</button></div></>}
            </div>}

            {linkedAccount && <button className="mobile-signout" onClick={async () => {
              try {
                await signOutDevice()
                setAccount(null)
                setStudies([])
                setDevices([])
                clearActiveReading()
                setAccountNote('Signed out and removed this device from your account.')
                await refresh()
              } catch (caught) {
                setAccountNote(errorMessage(caught))
              }
            }}>SIGN OUT ON THIS DEVICE</button>}
          </section>
        )}
      </main>

      <nav className="mobile-nav">
        <button className={tab === 'study' ? 'active' : ''} onClick={() => setTab('study')}><i>⌑</i><span>STUDY</span></button>
        <button className={tab === 'library' ? 'active' : ''} onClick={() => { setTab('library'); void refresh() }}><i>▤</i><span>LIBRARY</span></button>
        <button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}><i>◎</i><span>ACCOUNT</span></button>
      </nav>

      {aiConsentAction && (
        <div className="mobile-ai-consent-backdrop" onClick={() => setAiConsentAction(null)}>
          <section className="mobile-ai-consent-card" role="dialog" aria-modal="true" aria-labelledby="mobile-ai-consent-title" onClick={(event) => event.stopPropagation()}>
            <span>BEFORE ANY GENERATED REQUEST</span>
            <h2 id="mobile-ai-consent-title">Know what leaves this device.</h2>
            <p>To build a study, The Operator sends the Scripture reference, Bible text, and the content needed for your request to Anthropic's API. Ask and specialist-agent questions also send your question and recent conversation.</p>
            <div><strong>NOT SENT BY DEFAULT</strong><p>Your manuscript and local sermon recordings are not sent merely because they are in the workspace.</p></div>
            <button className="mobile-ai-consent-link" onClick={() => { void openExternal(PRIVACY_URL) }}>READ THE PRIVACY POLICY ↗</button>
            <div className="mobile-ai-consent-actions">
              <button onClick={() => setAiConsentAction(null)}>NOT NOW</button>
              <button className="agree" onClick={() => { void acceptAiProcessing() }}>I AGREE · CONTINUE</button>
            </div>
          </section>
        </div>
      )}

      {askOpen && currentStudyId && askDocument && analysis && <AskSheet studyId={currentStudyId} doc={askDocument} analysis={analysis} onClose={() => setAskOpen(false)} />}
      {notesOpen && (
        <div className="mobile-sheet-backdrop" onClick={() => setNotesOpen(false)}>
          <section className="mobile-sheet mobile-notes-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-sheet-handle" />
            <div className="mobile-sheet-title"><div><span>FIELD NOTES</span><strong>{reference}</strong></div><button onClick={() => setNotesOpen(false)}>×</button></div>
            {currentStudyId ? <>
              <textarea value={notes} maxLength={MAX_STUDY_NOTES_CHARS} onChange={(event) => saveNotes(event.target.value)} placeholder="Write what you need to remember…" autoFocus />
              <div className="mobile-notes-meter"><span>{notesNotice || 'Saved locally first. Cloud sync never replaces this copy silently.'}</span><strong>{notes.length.toLocaleString()} / {MAX_STUDY_NOTES_CHARS.toLocaleString()}</strong></div>
            </> : <div className="mobile-empty"><strong>Notes unlock when the study lands.</strong><p>The finished study is what syncs, so your notes attach to that record.</p></div>}
          </section>
        </div>
      )}
    </div>
  )
}
