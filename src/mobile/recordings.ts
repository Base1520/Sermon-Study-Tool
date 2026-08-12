const RECORDING_DATABASE = 'operator-sermon-recordings'
const RECORDING_STORE = 'recordings'
const RECORDING_DATABASE_VERSION = 1

export interface SermonRecording {
  id: string
  ownerKey: string
  reference: string
  title: string
  mimeType: string
  durationMs: number
  size: number
  createdAt: string
  audio: Blob
}

let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(RECORDING_DATABASE, RECORDING_DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(RECORDING_STORE)) {
          const store = database.createObjectStore(RECORDING_STORE, { keyPath: 'id' })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('The recording library could not open.'))
    })
  }
  return databasePromise
}

function transaction(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => void) {
  return openDatabase().then((database) => new Promise<void>((resolve, reject) => {
    const current = database.transaction(RECORDING_STORE, mode)
    operation(current.objectStore(RECORDING_STORE))
    current.oncomplete = () => resolve()
    current.onerror = () => reject(current.error || new Error('The recording library could not save.'))
    current.onabort = () => reject(current.error || new Error('The recording library could not save.'))
  }))
}

export function saveSermonRecording(recording: SermonRecording) {
  return transaction('readwrite', (store) => { store.put(recording) })
}

export async function listSermonRecordings(ownerKey: string, reference?: string) {
  const database = await openDatabase()
  return new Promise<SermonRecording[]>((resolve, reject) => {
    const request = database.transaction(RECORDING_STORE, 'readonly').objectStore(RECORDING_STORE).getAll()
    request.onsuccess = () => {
      const recordings = (request.result as SermonRecording[])
        .filter((recording) => recording.ownerKey === ownerKey && (!reference || recording.reference === reference))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      resolve(recordings)
    }
    request.onerror = () => reject(request.error || new Error('The recording library could not load.'))
  })
}

export function deleteSermonRecording(id: string) {
  return transaction('readwrite', (store) => { store.delete(id) })
}

function updateSermonRecordingsForOwner(
  ownerKey: string,
  update: (recording: SermonRecording) => SermonRecording | null,
) {
  if (!ownerKey) return Promise.resolve()
  return transaction('readwrite', (store) => {
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const recording = cursor.value as SermonRecording
      if (recording.ownerKey === ownerKey) {
        const next = update(recording)
        if (next) cursor.update(next)
        else cursor.delete()
      }
      cursor.continue()
    }
  })
}

export function moveSermonRecordings(fromOwnerKey: string, toOwnerKey: string) {
  if (!toOwnerKey || fromOwnerKey === toOwnerKey) return Promise.resolve()
  return updateSermonRecordingsForOwner(fromOwnerKey, (recording) => ({ ...recording, ownerKey: toOwnerKey }))
}

export function deleteSermonRecordingsForOwner(ownerKey: string) {
  return updateSermonRecordingsForOwner(ownerKey, () => null)
}

function fileExtension(mimeType: string) {
  if (/mp4|m4a/i.test(mimeType)) return 'm4a'
  if (/ogg/i.test(mimeType)) return 'ogg'
  return 'webm'
}

function safeFileName(value: string) {
  return value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'operator-sermon'
}

export function recordingFile(recording: SermonRecording) {
  return new File(
    [recording.audio],
    `${safeFileName(recording.title)}.${fileExtension(recording.mimeType)}`,
    { type: recording.mimeType || 'audio/mp4', lastModified: new Date(recording.createdAt).getTime() },
  )
}
