const STORAGE_KEY = 'operator-pending-model-requests-v1'
const MAX_PENDING_REQUESTS = 128
const REQUEST_ID_PATTERN = /^[a-z0-9-]{12,100}$/i

type PendingEntry = {
  id: string
  updatedAt: number
}

type PendingLedger = Record<string, PendingEntry>

export type PendingModelRequest = {
  id: string
  clear: () => void
}

function requestId() {
  return globalThis.crypto?.randomUUID?.()
    || `request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}

function storage() {
  try { return globalThis.localStorage || null } catch { return null }
}

function readLedger(): PendingLedger {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => {
          const entry = value as Partial<PendingEntry> | null
          return Boolean(entry)
            && typeof entry?.id === 'string'
            && REQUEST_ID_PATTERN.test(entry.id)
            && Number.isFinite(entry.updatedAt)
        }) as [string, PendingEntry][],
    )
  } catch {
    return {}
  }
}

function writeLedger(ledger: PendingLedger) {
  try {
    const bounded = Object.fromEntries(
      Object.entries(ledger)
        .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
        .slice(0, MAX_PENDING_REQUESTS),
    )
    storage()?.setItem(STORAGE_KEY, JSON.stringify(bounded))
  } catch {
    // The in-memory caller still prevents a duplicate during this app session.
  }
}

function fallbackFingerprint(value: string) {
  let left = 0x811c9dc5
  let right = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    left = Math.imul(left ^ code, 0x01000193)
    right = Math.imul(right ^ code, 0x85ebca6b)
  }
  return `${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0).toString(16).padStart(8, '0')}`
}

async function fingerprint(route: string, key: string) {
  const source = `${route}\u0000${key}`
  try {
    const bytes = new TextEncoder().encode(source)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
  } catch {
    return fallbackFingerprint(source)
  }
}

export async function openPendingModelRequest(route: string, key: string): Promise<PendingModelRequest> {
  const ledgerKey = await fingerprint(route, key)
  const ledger = readLedger()
  const existing = ledger[ledgerKey]
  const id = existing?.id || requestId()
  ledger[ledgerKey] = { id, updatedAt: Date.now() }
  writeLedger(ledger)

  return {
    id,
    clear() {
      const current = readLedger()
      if (current[ledgerKey]?.id !== id) return
      delete current[ledgerKey]
      writeLedger(current)
    },
  }
}

