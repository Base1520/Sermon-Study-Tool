import { Capacitor } from '@capacitor/core'
import type { ChatMessage, PhrasingAnalysis, PlainReadDoc } from '../types/phrasing'
import {
  AI_PROCESSING_CONSENT_VERSION,
  clearAccountId,
  clearDeviceToken,
  getDeviceToken,
  getEsvKey,
  getInstallId,
  setAccountId,
  setDeviceToken,
} from './storage'
import type { TabletAgentMessage, TabletAgentRole, TabletSermonWorkspace } from './tabletDeskModel'

const API_URL = (import.meta.env.VITE_OPERATOR_API_URL
  || (import.meta.env.DEV ? '' : 'https://api-production-15e5e.up.railway.app')).replace(/\/+$/, '')
const ANALYZE_TIMEOUT_MS = 180_000
const QUICK_STUDY_TIMEOUT_MS = 120_000
const GUIDED_STUDY_TIMEOUT_MS = 300_000
const STREAM_SILENCE_MS = 90_000
const SERMON_ASSIST_TIMEOUT_MS = 90_000
export const MAX_STUDY_NOTES_CHARS = 20_000

export interface PassageVerse {
  book: string
  chapter: number
  verse: number
  text: string
}

export interface PassageResult {
  reference: string
  translation: string
  text: string
  verses: PassageVerse[]
  copyright: string
}

export interface QuickStudyTextEvidence {
  words: string
  shows: string
}

export interface QuickStudyKeyTerm {
  term: string
  meaning: string
  whyItMatters: string
}

export interface QuickStudyDoc {
  mode: 'quick'
  reference: string
  translation: string
  mainClaim: string
  context: string
  textEvidence: QuickStudyTextEvidence[]
  keyTerms: QuickStudyKeyTerm[]
  wholeBible: string
  whyItMatters: string
  sourceAnchors: {
    mainClaim: string[]
    context: string[]
    wholeBible: string[]
  }
  guardrails: string[]
  questions: string[]
  vaultSourced: boolean
  promptVersion: number
  validatorVersion: number
  fromCache: boolean
}

export type CovenantStepId = 'contextualize' | 'observe' | 'verify' | 'examine' | 'name' | 'anchor' | 'navigate' | 'teach'

export interface GuidedStudyTextUnit {
  ref: string
  heading: string
  anchor: string
  explanation: string
  logic: string | null
}

export interface GuidedStudyKeyTerm {
  term: string
  meaningHere: string
  functionInArgument: string
  whyItMatters: string
}

export interface GuidedStudyCovenantStep {
  id: CovenantStepId
  letter: string
  title: string
  question: string
  finding: string
  check: string
  restraint: string | null
  sourceRefs: string[]
}

export interface GuidedStudyQuestion {
  question: string
  answer: string
  sourceRefs: string[]
}

export interface GuidedStudyDoc {
  mode: 'guided'
  reference: string
  translation: string
  mainClaim: string
  mainClaimSources: string[]
  situation: {
    when: string
    where: string
    pressure: string
    whyItChangesReading: string
    confidence: 'documented' | 'reconstructed' | 'uncertain'
    sourceRefs: string[]
  }
  textUnits: GuidedStudyTextUnit[]
  keyTerms: GuidedStudyKeyTerm[]
  covenant: GuidedStudyCovenantStep[]
  application: {
    toThemFirst: string
    enduringTruth: string
    today: string
    corporate: string
    mission: string
    response: string
    sourceRefs: string[]
  }
  guardrails: string[]
  questions: GuidedStudyQuestion[]
  vaultSourced: boolean
  promptVersion: number
  validatorVersion: number
  fromCache: boolean
}

export type MobileStudyDocument = PlainReadDoc | QuickStudyDoc | GuidedStudyDoc

export interface Entitlement {
  anonymous: boolean
  accountId: string | null
  email: string | null
  plan: string
  label: string
  paying: boolean
  allowance: number
  used: number
  remaining: number
  lifetimeStudies?: number
  status?: string
  billingInterval?: string | null
  billingProvider?: 'stripe' | 'apple' | 'google' | null
}

export interface ReleaseStatus {
  ok: boolean
  releaseStage: 'core' | 'full' | 'invalid'
  capabilities: {
    account_recovery_email: boolean
    marketing_sync: boolean
    apple_iap: boolean
    google_iap: boolean
    esv_mobile: boolean
  }
}

export interface StudySummary {
  id: string
  reference: string
  level: string | null
  notes: string | null
  state: string
  main_theme: string | null
  ready: boolean
  created_at: string
  updated_at: string
  completed_at: string | null
  archived_at: string | null
}

export interface SyncedStudy {
  id: string
  reference: string
  level: string | null
  notes: string | null
  analysis: PhrasingAnalysis
  document: MobileStudyDocument
  passage?: PassageResult | null
  workspace: TabletSermonWorkspace | null
  workspace_revision: number
  created_at: string
  updated_at: string
  completed_at: string | null
  archived_at: string | null
}

export interface CommentarySource {
  citationId: string
  author: string
  title: string
  publicationYear: string
  locator: string
  canonicalUrl: string
  excerpt: string
  rightsTier: 'public_domain'
}

export interface CommentaryResult {
  status: 'grounded' | 'no_result' | 'unavailable'
  message: string
  sources: CommentarySource[]
}

export interface DeviceRecord {
  id: string
  label: string | null
  platform: string | null
  current: boolean
  created_at: string
  last_seen_at: string | null
}

export class OperatorApiError extends Error {
  status: number
  code: string
  payload: Record<string, unknown>

  constructor(status: number, payload: Record<string, unknown>) {
    super(String(payload.message || payload.body || payload.error || `Request failed (${status})`))
    this.name = 'OperatorApiError'
    this.status = status
    this.code = String(payload.error || 'REQUEST_FAILED')
    this.payload = payload
  }
}

async function headers(extra: Record<string, string> = {}) {
  const installId = await getInstallId()
  const token = await getDeviceToken()
  return {
    'content-type': 'application/json',
    'x-install-id': installId,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function bodyOf(response: Response) {
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, any>
  } catch {
    return { error: 'BAD_RESPONSE', message: text.slice(0, 400) }
  }
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: await headers((init.headers || {}) as Record<string, string>),
  })
  const body = await bodyOf(response)
  if (!response.ok) throw new OperatorApiError(response.status, body)
  return body as T
}

export async function fetchPassage(reference: string, translation: string) {
  const esvKey = translation === 'esv' ? await getEsvKey() : null
  const query = new URLSearchParams({ reference, translation })
  return jsonRequest<PassageResult>(`/v1/passage?${query}`, {
    headers: esvKey ? { 'x-esv-key': esvKey } : {},
  })
}

export async function getMe() {
  return jsonRequest<Entitlement>('/v1/me')
}

export function getReleaseStatus() {
  return jsonRequest<ReleaseStatus>('/health')
}

export async function runQuickStudy(reference: string, translation: string, requestId: string, signal?: AbortSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), QUICK_STUDY_TIMEOUT_MS)
  const esvKey = translation === 'esv' ? await getEsvKey() : null
  try {
    return await jsonRequest<{
      document: QuickStudyDoc
      analysis: PhrasingAnalysis
      studyId: string
      passage: PassageResult
      cached: boolean
      idempotent?: boolean
    }>('/v1/quick-study', {
      method: 'POST',
      headers: esvKey ? { 'x-esv-key': esvKey } : {},
      body: JSON.stringify({ reference, translation, requestId, aiConsentVersion: AI_PROCESSING_CONSENT_VERSION }),
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export async function runGuidedStudy(reference: string, translation: string, requestId: string, signal?: AbortSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), GUIDED_STUDY_TIMEOUT_MS)
  const esvKey = translation === 'esv' ? await getEsvKey() : null
  try {
    return await jsonRequest<{
      document: GuidedStudyDoc
      analysis: PhrasingAnalysis
      studyId: string
      passage: PassageResult
      cached: boolean
      idempotent?: boolean
    }>('/v1/guided-study', {
      method: 'POST',
      headers: esvKey ? { 'x-esv-key': esvKey } : {},
      body: JSON.stringify({ reference, translation, requestId, aiConsentVersion: AI_PROCESSING_CONSENT_VERSION }),
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export async function analyzePassage(text: string, reference: string) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS)
  try {
    return await jsonRequest<{ analysis: PhrasingAnalysis; studyId: string; cached: boolean }>('/v1/analyze', {
      method: 'POST',
      body: JSON.stringify({ text, reference }),
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function readPassage({
  analysis,
  reference,
  studyId,
  level = 'plain',
  onSection,
}: {
  analysis: PhrasingAnalysis
  reference: string
  studyId: string
  level?: string
  onSection?: (key: string, value: unknown) => void
}) {
  const controller = new AbortController()
  const response = await fetch(`${API_URL}/v1/read`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ analysis, reference, studyId, level }),
    signal: controller.signal,
  })
  if (!response.ok) throw new OperatorApiError(response.status, await bodyOf(response))
  if (!response.body) throw new OperatorApiError(502, { error: 'EMPTY_STREAM', message: 'The reading did not start.' })

  let quiet = window.setTimeout(() => controller.abort(), STREAM_SILENCE_MS)
  const bump = () => {
    window.clearTimeout(quiet)
    quiet = window.setTimeout(() => controller.abort(), STREAM_SILENCE_MS)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let document: PlainReadDoc | null = null
  let returnedStudyId = studyId
  let failure: Record<string, any> | null = null

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bump()
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        let message: Record<string, any>
        try { message = JSON.parse(line) } catch { continue }
        if (message.type === 'section') onSection?.(message.key, message.value)
        else if (message.type === 'done') {
          document = message.document
          returnedStudyId = message.studyId || returnedStudyId
        } else if (message.type === 'error') failure = message
      }
    }
  } finally {
    window.clearTimeout(quiet)
  }

  if (failure) throw new OperatorApiError(500, failure)
  if (!document) throw new OperatorApiError(502, { error: 'INCOMPLETE_STREAM', message: 'The reading ended before it finished.' })
  return { document, studyId: returnedStudyId }
}

export function askQuestion({
  studyId,
  question,
  history,
}: {
  studyId: string
  question: string
  history: ChatMessage[]
}) {
  return jsonRequest<{ answer: string; refusal: string | null; suggested: string[] }>('/v1/ask', {
    method: 'POST',
    body: JSON.stringify({ studyId, question, history, aiConsentVersion: AI_PROCESSING_CONSENT_VERSION }),
  })
}

export async function askSermonAgent({
  studyId,
  agent,
  question,
  history,
}: {
  studyId: string
  agent: TabletAgentRole
  question: string
  history: TabletAgentMessage[]
}) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), SERMON_ASSIST_TIMEOUT_MS)
  try {
    return await jsonRequest<{ answer: string }>('/v1/sermon-assist', {
      method: 'POST',
      body: JSON.stringify({ studyId, agent, question, history, aiConsentVersion: AI_PROCESSING_CONSENT_VERSION }),
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

export function reportAiOutput({
  studyId,
  surface,
  content,
}: {
  studyId: string
  surface: 'quick-study' | 'guided-study' | 'ask' | 'specialist'
  content: string
}) {
  const body = [
    `Surface: ${surface}`,
    `Study: ${studyId}`,
    '',
    String(content || '').slice(0, 7000),
  ].join('\n')
  return jsonRequest<{ ok: true; id: string }>('/v1/feedback', {
    method: 'POST',
    body: JSON.stringify({
      category: 'AI Report',
      body,
      version: '1.4.1',
      platform: Capacitor.getPlatform(),
    }),
  })
}

export function getStudyCommentary(studyId: string) {
  return jsonRequest<CommentaryResult>(`/v1/studies/${encodeURIComponent(studyId)}/commentary`)
}

export function requestMobileRegistration(email: string, marketingOptIn: boolean) {
  const platform = Capacitor.getPlatform()
  return jsonRequest<{ ok: true; message: string }>('/v1/mobile/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      marketingOptIn,
      platform,
      label: platform === 'ios' ? 'iPhone or iPad' : platform === 'android' ? 'Android phone or tablet' : 'Mobile browser',
    }),
  })
}

export async function confirmMobileRegistration(email: string, code: string) {
  const body = await jsonRequest<{
    token: string
    accountId: string
    email: string
    plan: string
  }>('/v1/mobile/register/confirm', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
  await setDeviceToken(body.token)
  await setAccountId(body.accountId)
  return body
}

export function requestAccountRecovery(email: string) {
  return jsonRequest<{ ok: true; message: string }>('/v1/mobile/recovery/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function confirmAccountRecovery(email: string, code: string) {
  const platform = Capacitor.getPlatform()
  const body = await jsonRequest<{
    token: string
    accountId: string
    email: string
    plan: string
  }>('/v1/mobile/recovery/confirm', {
    method: 'POST',
    body: JSON.stringify({
      email,
      code,
      platform,
      label: platform === 'ios' ? 'iPhone or iPad' : platform === 'android' ? 'Android phone or tablet' : 'Mobile browser',
    }),
  })
  await setDeviceToken(body.token)
  await setAccountId(body.accountId)
  return body
}

export async function redeemAccessCode(code: string) {
  const body = await jsonRequest<{ token: string; accountId?: string; label?: string; plan?: string }>('/v1/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  if (body.token) await setDeviceToken(body.token)
  if (body.accountId) await setAccountId(body.accountId)
  return body
}

export async function redeemDeviceLink(code: string) {
  const platform = Capacitor.getPlatform()
  const body = await jsonRequest<{ token: string; accountId: string; email: string; plan: string }>('/v1/device-links/redeem', {
    method: 'POST',
    body: JSON.stringify({
      code,
      platform,
      label: platform === 'ios' ? 'iPhone or iPad' : platform === 'android' ? 'Android phone or tablet' : 'Mobile browser',
    }),
  })
  if (body.token) await setDeviceToken(body.token)
  if (body.accountId) await setAccountId(body.accountId)
  return body
}

export function createDeviceLink() {
  return jsonRequest<{ code: string; expiresAt: string; maxDevices: number }>('/v1/device-links', { method: 'POST' })
}

export async function listDevices() {
  return (await jsonRequest<{ devices: DeviceRecord[]; maxDevices: number }>('/v1/devices')).devices
}

export function revokeDevice(id: string) {
  return jsonRequest<{ ok: true }>(`/v1/devices/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function listStudies(includeArchived = false) {
  const query = includeArchived ? '?archived=true' : ''
  return (await jsonRequest<{ studies: StudySummary[] }>(`/v1/studies${query}`)).studies
}

export async function getStudy(id: string) {
  return (await jsonRequest<{ study: SyncedStudy }>(`/v1/studies/${encodeURIComponent(id)}`)).study
}

export function updateStudy(id: string, changes: { notes?: string; archived?: boolean }) {
  return jsonRequest<{ study: Pick<SyncedStudy, 'id' | 'notes' | 'workspace' | 'workspace_revision' | 'archived_at' | 'updated_at'> }>(
    `/v1/studies/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(changes) },
  )
}

export function updateStudyWorkspace(id: string, workspace: TabletSermonWorkspace, workspaceRevision: number) {
  return jsonRequest<{ study: Pick<SyncedStudy, 'id' | 'notes' | 'workspace' | 'workspace_revision' | 'archived_at' | 'updated_at'> }>(
    `/v1/studies/${encodeURIComponent(id)}/workspace`,
    { method: 'PATCH', body: JSON.stringify({ workspace, workspaceRevision }) },
  )
}

export function verifyStorePurchase({
  platform,
  jwsRepresentation,
  purchaseToken,
  restoring = false,
}: {
  platform: 'ios' | 'android'
  jwsRepresentation?: string
  purchaseToken?: string
  restoring?: boolean
}) {
  return jsonRequest<{
    ok: true
    entitlement: {
      plan: string
      status: string
      provider: string | null
      finalizationPending?: boolean
    }
  }>('/v1/iap/verify', {
    method: 'POST',
    body: JSON.stringify({ platform, jwsRepresentation, purchaseToken, restoring }),
  })
}

export async function createBillingPortal() {
  return (await jsonRequest<{ url: string }>('/v1/portal', { method: 'POST' })).url
}

export async function deleteOperatorAccount(confirmSubscriptions = false) {
  const result = await jsonRequest<{ ok: true }>('/v1/account', {
    method: 'DELETE',
    body: JSON.stringify({ confirmSubscriptions }),
  })
  await Promise.all([clearDeviceToken(), clearAccountId()])
  return result
}

export async function signOutDevice() {
  try {
    await jsonRequest<{ ok: true }>('/v1/signout', { method: 'POST' })
  } catch (error) {
    if (!(error instanceof OperatorApiError) || error.status !== 401) throw error
  }
  await clearDeviceToken()
  await clearAccountId()
}

export const operatorApiUrl = API_URL
