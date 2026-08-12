import type { PhrasingAnalysis } from '../types/phrasing'
import type { MobileStudyDocument, PassageResult, StudySummary, SyncedStudy } from './api'
import type { TabletSermonWorkspace } from './tabletDeskModel'

const DATABASE_NAME = 'operator-mobile'
const STORE_NAME = 'studies'
const DATABASE_VERSION = 2

export interface LocalStudyRecord {
  ownerKey: string
  id: string
  reference: string
  translation: string
  passage: PassageResult
  analysis: PhrasingAnalysis
  document: MobileStudyDocument
  notes: string
  workspace: TabletSermonWorkspace | null
  workspaceRevision: number
  workspaceDirty?: boolean
  notesDirty?: boolean
  mainTheme: string
  createdAt: string
  updatedAt: string
  completedAt: string
  archivedAt: string | null
}

let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        const store = database.objectStoreNames.contains(STORE_NAME)
          ? request.transaction!.objectStore(STORE_NAME)
          : database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        if (!store.indexNames.contains('ownerKey')) store.createIndex('ownerKey', 'ownerKey', { unique: false })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('The local study library could not open.'))
    })
  }
  return databasePromise
}

function write(operation: (store: IDBObjectStore) => void) {
  return openDatabase().then((database) => new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    operation(transaction.objectStore(STORE_NAME))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('The local study library could not save.'))
    transaction.onabort = () => reject(transaction.error || new Error('The local study library could not save.'))
  }))
}

export function saveLocalStudy(study: LocalStudyRecord) {
  return write((store) => { store.put(study) })
}

export async function getLocalStudy(ownerKey: string, id: string) {
  const database = await openDatabase()
  return new Promise<LocalStudyRecord | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
    request.onsuccess = () => {
      const study = request.result as LocalStudyRecord | undefined
      resolve(study?.ownerKey === ownerKey ? study : null)
    }
    request.onerror = () => reject(request.error || new Error('The saved study could not open.'))
  })
}

export async function listLocalStudies(ownerKey: string, includeArchived = false) {
  const database = await openDatabase()
  return new Promise<LocalStudyRecord[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      const studies = (request.result as LocalStudyRecord[])
        .filter((study) => study.ownerKey === ownerKey && (includeArchived || !study.archivedAt))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      resolve(studies)
    }
    request.onerror = () => reject(request.error || new Error('The local study library could not load.'))
  })
}

export async function updateLocalStudy(ownerKey: string, id: string, changes: Partial<Pick<LocalStudyRecord, 'notes' | 'notesDirty' | 'workspace' | 'workspaceRevision' | 'workspaceDirty' | 'archivedAt'>>) {
  const current = await getLocalStudy(ownerKey, id)
  if (!current) return false
  await saveLocalStudy({ ...current, ...changes, updatedAt: new Date().toISOString() })
  return true
}

export function localStudySummary(study: LocalStudyRecord): StudySummary {
  return {
    id: study.id,
    reference: study.reference,
    level: 'plain',
    notes: study.notes,
    state: 'finished',
    main_theme: study.mainTheme || null,
    ready: true,
    created_at: study.createdAt,
    updated_at: study.updatedAt,
    completed_at: study.completedAt,
    archived_at: study.archivedAt,
  }
}

type SyncedStudyWithPassage = SyncedStudy & {
  passage?: Partial<PassageResult> | null
}

export function fromSyncedStudy(ownerKey: string, study: SyncedStudyWithPassage): LocalStudyRecord {
  const passageText = study.analysis.passageText || ''
  const syncedPassage = study.passage
  const translation = syncedPassage?.translation
    || (typeof study.analysis.translation === 'string' ? study.analysis.translation : 'saved')
  return {
    ownerKey,
    id: study.id,
    reference: study.reference,
    translation,
    passage: {
      reference: syncedPassage?.reference || study.reference,
      translation: syncedPassage?.translation || translation,
      text: syncedPassage?.text || passageText,
      verses: Array.isArray(syncedPassage?.verses) ? syncedPassage.verses : [],
      copyright: typeof syncedPassage?.copyright === 'string' ? syncedPassage.copyright : '',
    },
    analysis: study.analysis,
    document: study.document,
    notes: study.notes || '',
    workspace: study.workspace || null,
    workspaceRevision: Number.isInteger(study.workspace_revision) ? study.workspace_revision : 0,
    workspaceDirty: false,
    notesDirty: false,
    mainTheme: study.analysis.mainTheme || '',
    createdAt: study.created_at,
    updatedAt: study.updated_at,
    completedAt: study.completed_at || study.updated_at,
    archivedAt: study.archived_at,
  }
}

export function claimLegacyStudies(ownerKey: string) {
  return write((store) => {
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const study = cursor.value as LocalStudyRecord & { ownerKey?: string }
      if (!study.ownerKey) cursor.update({ ...study, ownerKey })
      cursor.continue()
    }
  })
}

export function moveLocalStudies(fromOwnerKey: string, toOwnerKey: string) {
  if (fromOwnerKey === toOwnerKey) return Promise.resolve()
  return write((store) => {
    const request = store.index('ownerKey').openCursor(IDBKeyRange.only(fromOwnerKey))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      cursor.update({ ...(cursor.value as LocalStudyRecord), ownerKey: toOwnerKey })
      cursor.continue()
    }
  })
}

export function deleteLocalStudies(ownerKey: string) {
  return write((store) => {
    const request = store.index('ownerKey').openKeyCursor(IDBKeyRange.only(ownerKey))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      store.delete(cursor.primaryKey)
      cursor.continue()
    }
  })
}
