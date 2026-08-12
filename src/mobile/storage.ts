import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage'

const TOKEN_KEY = 'device-token'
const INSTALL_KEY = 'install-id'
const ESV_KEY = 'esv-key'
const INTRO_KEY = 'intro-seen'
const ACCOUNT_KEY = 'account-id'
const AI_PROCESSING_CONSENT_KEY = 'ai-processing-consent'
const AI_PROCESSING_CONSENT_LOCAL_KEY = 'operator-ai-processing-consent'
const AI_PROCESSING_CONSENT_WITHDRAWN = 'withdrawn'
const SIMULATOR_STORAGE_FALLBACK = import.meta.env.VITE_OPERATOR_SIMULATOR_STORAGE_FALLBACK === 'true'
const SIMULATOR_INSTALL_KEY = 'operator-simulator-install-id'

export const AI_PROCESSING_CONSENT_VERSION = 'operator-ai-processing-v1'

let ready: Promise<void> | null = null

function readLocalConsent() {
  try { return window.localStorage.getItem(AI_PROCESSING_CONSENT_LOCAL_KEY) } catch { return null }
}

function writeLocalConsent(value: string) {
  try { window.localStorage.setItem(AI_PROCESSING_CONSENT_LOCAL_KEY, value) } catch { /* keychain sync remains the fallback */ }
}

function getSimulatorInstallId() {
  try {
    const existing = window.localStorage.getItem(SIMULATOR_INSTALL_KEY)
    if (existing) return existing
    const created = randomUuid()
    window.localStorage.setItem(SIMULATOR_INSTALL_KEY, created)
    return created
  } catch {
    return randomUuid()
  }
}

function initialize() {
  if (!ready) {
    ready = (async () => {
      await SecureStorage.setKeyPrefix('operator_')
      await SecureStorage.setSynchronize(false)
      await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly)
    })()
  }
  return ready
}

function randomUuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function getString(key: string) {
  await initialize()
  const value = await SecureStorage.get(key, false, false)
  return typeof value === 'string' ? value : null
}

async function setString(key: string, value: string) {
  await initialize()
  await SecureStorage.set(key, value, false, false, KeychainAccess.whenUnlockedThisDeviceOnly)
}

export async function getInstallId() {
  if (SIMULATOR_STORAGE_FALLBACK) return getSimulatorInstallId()
  const existing = await getString(INSTALL_KEY)
  if (existing) return existing
  const created = randomUuid()
  await setString(INSTALL_KEY, created)
  return created
}

export const getDeviceToken = () => SIMULATOR_STORAGE_FALLBACK ? Promise.resolve(null) : getString(TOKEN_KEY)
export const setDeviceToken = (value: string) => setString(TOKEN_KEY, value)
export const getAccountId = () => SIMULATOR_STORAGE_FALLBACK ? Promise.resolve(null) : getString(ACCOUNT_KEY)
export const setAccountId = (value: string) => setString(ACCOUNT_KEY, value)

export async function clearDeviceToken() {
  await initialize()
  await SecureStorage.remove(TOKEN_KEY, false)
}

export async function clearAccountId() {
  await initialize()
  await SecureStorage.remove(ACCOUNT_KEY, false)
}

export const getEsvKey = () => getString(ESV_KEY)

export async function setEsvKey(value: string) {
  await initialize()
  const clean = value.trim()
  if (clean) await setString(ESV_KEY, clean)
  else await SecureStorage.remove(ESV_KEY, false)
}

export async function hasSeenIntro() {
  if (SIMULATOR_STORAGE_FALLBACK) return true
  return (await getString(INTRO_KEY)) === 'yes'
}

export const markIntroSeen = () => setString(INTRO_KEY, 'yes')

export async function hasAiProcessingConsent() {
  const local = readLocalConsent()
  if (local === AI_PROCESSING_CONSENT_VERSION) return true
  if (local === AI_PROCESSING_CONSENT_WITHDRAWN) return false
  const secure = (await getString(AI_PROCESSING_CONSENT_KEY)) === AI_PROCESSING_CONSENT_VERSION
  if (secure) writeLocalConsent(AI_PROCESSING_CONSENT_VERSION)
  return secure
}

export async function grantAiProcessingConsent() {
  writeLocalConsent(AI_PROCESSING_CONSENT_VERSION)
  void setString(AI_PROCESSING_CONSENT_KEY, AI_PROCESSING_CONSENT_VERSION).catch(() => {})
}

export async function withdrawAiProcessingConsent() {
  writeLocalConsent(AI_PROCESSING_CONSENT_WITHDRAWN)
  void initialize()
    .then(() => SecureStorage.remove(AI_PROCESSING_CONSENT_KEY, false))
    .catch(() => {})
}
