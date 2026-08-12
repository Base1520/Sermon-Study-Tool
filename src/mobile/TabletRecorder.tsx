import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteSermonRecording,
  listSermonRecordings,
  recordingFile,
  saveSermonRecording,
  type SermonRecording,
} from './recordings'

export type SermonRecorderStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'saving'

export interface SermonRecorderController {
  status: SermonRecorderStatus
  elapsedMs: number
  error: string | null
  recordings: SermonRecording[]
  start: () => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => void
  share: (recording: SermonRecording) => Promise<void>
  remove: (recording: SermonRecording) => Promise<void>
  clearError: () => void
}

function recordingId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `recording-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function preferredMimeType() {
  const candidates = [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
  ]
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || ''
}

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${minutes}:${String(remaining).padStart(2, '0')}`
}

function recordingTitle(reference: string, createdAt: string) {
  const time = new Date(createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${reference || 'Sermon'} — ${time}`
}

export function useSermonRecorder(ownerKey: string, reference: string): SermonRecorderController {
  const [status, setStatus] = useState<SermonRecorderStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [recordings, setRecordings] = useState<SermonRecording[]>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const referenceRef = useRef(reference)
  const ownerKeyRef = useRef(ownerKey)
  const startedAtRef = useRef<number | null>(null)
  const accumulatedMsRef = useRef(0)

  useEffect(() => { referenceRef.current = reference }, [reference])
  useEffect(() => { ownerKeyRef.current = ownerKey }, [ownerKey])

  const refresh = useCallback(async () => {
    const stored = await listSermonRecordings(ownerKeyRef.current, referenceRef.current).catch(() => [])
    setRecordings(stored)
  }, [])

  useEffect(() => { void refresh() }, [ownerKey, reference, refresh])

  useEffect(() => {
    if (status !== 'recording') return
    const update = () => {
      const active = startedAtRef.current ? Date.now() - startedAtRef.current : 0
      setElapsedMs(accumulatedMsRef.current + active)
    }
    update()
    const interval = window.setInterval(update, 250)
    return () => window.clearInterval(interval)
  }, [status])

  useEffect(() => () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const start = useCallback(async () => {
    if (status !== 'idle') return
    setStatus('requesting')
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Recording is not available on this device build.')
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = preferredMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const capturedReference = referenceRef.current || 'Sermon'
      const capturedOwnerKey = ownerKeyRef.current || 'unlinked'
      chunksRef.current = []
      streamRef.current = stream
      recorderRef.current = recorder
      accumulatedMsRef.current = 0
      startedAtRef.current = Date.now()
      setElapsedMs(0)

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        setError('The microphone stopped unexpectedly. The recording may be incomplete.')
      }
      recorder.onstop = () => {
        const stoppedAt = Date.now()
        if (startedAtRef.current) accumulatedMsRef.current += stoppedAt - startedAtRef.current
        startedAtRef.current = null
        const chunks = chunksRef.current
        chunksRef.current = []
        const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/mp4' })
        const createdAt = new Date().toISOString()
        const recording: SermonRecording = {
          id: recordingId(),
          ownerKey: capturedOwnerKey,
          reference: capturedReference,
          title: recordingTitle(capturedReference, createdAt),
          mimeType: audio.type || 'audio/mp4',
          durationMs: accumulatedMsRef.current,
          size: audio.size,
          createdAt,
          audio,
        }
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        if (!audio.size) {
          setError('The microphone returned an empty recording. Try again and keep The Operator open.')
          setStatus('idle')
          return
        }
        setStatus('saving')
        void saveSermonRecording(recording)
          .then(() => {
            if (ownerKeyRef.current === capturedOwnerKey && referenceRef.current === capturedReference) {
              setRecordings((current) => [recording, ...current.filter((item) => item.id !== recording.id)])
            } else {
              void refresh()
            }
          })
          .catch(() => setError('The sermon was recorded, but this tablet could not save it locally.'))
          .finally(() => setStatus('idle'))
      }

      recorder.start(1_000)
      setStatus('recording')
    } catch (caught) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      recorderRef.current = null
      const denied = caught instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(caught.name)
      setError(denied
        ? 'Microphone access is off. Allow The Operator to use the microphone in this tablet’s settings, then try again.'
        : caught instanceof Error ? caught.message : 'The microphone could not start.')
      setStatus('idle')
    }
  }, [refresh, status])

  const pause = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    recorder.pause()
    if (startedAtRef.current) accumulatedMsRef.current += Date.now() - startedAtRef.current
    startedAtRef.current = null
    setElapsedMs(accumulatedMsRef.current)
    setStatus('paused')
  }, [])

  const resume = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'paused') return
    recorder.resume()
    startedAtRef.current = Date.now()
    setStatus('recording')
  }, [])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    setStatus('saving')
    recorder.stop()
  }, [])

  const share = useCallback(async (recording: SermonRecording) => {
    setError(null)
    const file = recordingFile(recording)
    const shareData = { title: recording.title, text: `Sermon recording for ${recording.reference}`, files: [file] }
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData)
        return
      }
      const url = URL.createObjectURL(file)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = file.name
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError('The recording is saved, but the share sheet could not open.')
    }
  }, [])

  const remove = useCallback(async (recording: SermonRecording) => {
    await deleteSermonRecording(recording.id)
    setRecordings((current) => current.filter((item) => item.id !== recording.id))
  }, [])

  return useMemo(() => ({
    status,
    elapsedMs,
    error,
    recordings,
    start,
    pause,
    resume,
    stop,
    share,
    remove,
    clearError: () => setError(null),
  }), [elapsedMs, error, pause, recordings, remove, resume, share, start, status, stop])
}

export function TabletRecorder({ controller, compact = false }: {
  controller: SermonRecorderController
  compact?: boolean
}) {
  const active = ['recording', 'paused', 'saving'].includes(controller.status)
  return (
    <section className={`tablet-recorder ${compact ? 'compact' : ''} ${active ? 'active' : ''}`}>
      <div className="tablet-recorder-status">
        <i />
        <span>{controller.status === 'requesting' ? 'OPENING MIC'
          : controller.status === 'saving' ? 'SAVING'
          : controller.status === 'paused' ? 'PAUSED'
          : controller.status === 'recording' ? 'RECORDING'
          : 'SERMON RECORDER'}</span>
        <strong>{formatDuration(controller.elapsedMs)}</strong>
      </div>
      <div className="tablet-recorder-actions">
        {controller.status === 'idle' && <button className="record" onClick={() => { void controller.start() }}>● RECORD</button>}
        {controller.status === 'requesting' && <button disabled>OPENING…</button>}
        {controller.status === 'recording' && <button onClick={controller.pause}>Ⅱ PAUSE</button>}
        {controller.status === 'paused' && <button onClick={controller.resume}>▶ RESUME</button>}
        {['recording', 'paused'].includes(controller.status) && <button className="stop" onClick={controller.stop}>■ SAVE</button>}
        {controller.status === 'saving' && <button disabled>SAVING…</button>}
      </div>
      {controller.error && <button className="tablet-recorder-error" onClick={controller.clearError}>{controller.error} ×</button>}
      {!compact && controller.recordings.length > 0 && (
        <div className="tablet-recording-list">
          <span>SAVED ON THIS DEVICE</span>
          {controller.recordings.slice(0, 5).map((recording) => (
            <article key={recording.id}>
              <button className="tablet-recording-share" onClick={() => { void controller.share(recording) }}>
                <strong>{new Date(recording.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong>
                <span>{formatDuration(recording.durationMs)}</span>
                <b>SHARE ↗</b>
              </button>
              <button className="tablet-recording-delete" onClick={() => { void controller.remove(recording) }}>DELETE</button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
