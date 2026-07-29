import { useState, useRef, useEffect } from 'react'
import { BASE, FONT } from '../theme'
import { OpsPanel } from './OpsPanel'

const DARK  = '#1a2410'
const CARD  = '#2c3820'
const GOLD  = BASE.gold
const KHAKI = BASE.khaki
const TEXT  = '#d8d0b8'
const RED   = '#c07070'

interface Critique {
  overall: string
  strengths: string[]
  critiques: string[]
  fillerWords: string
  pacing: string
  clarity: string
  faithfulness: string
  transcript?: string
  durationMin?: number | null
}

interface Props {
  apiKey: string
  reference?: string
  savedDraft?: string
  onClose: () => void
}

export function RehearsalReview({ reference, savedDraft, onClose }: Props) {
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false)
  const [openaiKeyInput, setOpenaiKeyInput] = useState('')
  const [consented, setConsented] = useState(false)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Critique | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
    recorder.current?.stream.getTracks().forEach(t => t.stop())
  }, [])

  useEffect(() => {
    ;(window as any).electronAPI.secretStatus?.()
      .then((status: Record<string, boolean>) => setHasOpenaiKey(Boolean(status.OPENAI_KEY)))
      .catch(() => {})
  }, [])

  async function saveKey() {
    const value = openaiKeyInput.trim()
    if (!value) return
    const status = await (window as any).electronAPI.saveApiKeys({ OPENAI_KEY: value })
    setHasOpenaiKey(Boolean(status.OPENAI_KEY))
    setOpenaiKeyInput('')
  }

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunks.current = []
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        const buf = await blob.arrayBuffer()
        const b64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''))
        await runReview({ audioBase64: b64, mimeType: 'audio/webm' })
      }
      rec.start()
      recorder.current = rec
      setRecording(true)
      setElapsed(0)
      timer.current = window.setInterval(() => setElapsed(e => e + 1), 1000)
    } catch (e: any) {
      setError(e?.message?.includes('Permission') ? 'Microphone access denied — allow it in System Settings' : (e?.message ?? 'Could not start recording'))
    }
  }

  function stopRecording() {
    if (timer.current) clearInterval(timer.current)
    setRecording(false)
    recorder.current?.stop()
  }

  async function uploadFile() {
    setError(null)
    const picked = await (window as any).electronAPI.pickMediaFile()
    if (!picked) return
    if (picked.sizeMB > 25) { setError(`File is ${picked.sizeMB}MB — the transcription limit is 25MB. Export a lower-bitrate audio version.`); return }
    await runReview({ fileToken: picked.token })
  }

  async function runReview(input: { fileToken?: string; audioBase64?: string; mimeType?: string }) {
    setBusy('Transcribing…')
    setResult(null)
    try {
      // Transcription takes ~real-time/10; critique a few seconds more
      const r = await (window as any).electronAPI.reviewDelivery({
        ...input,
        manuscript: savedDraft ?? '',
        reference: reference ?? '',
      })
      setResult(r)
    } catch (e: any) {
      setError(e?.message ?? 'Review failed')
    } finally { setBusy(null) }
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <OpsPanel
      title="DELIVERY REVIEW"
      tag="REHEARSE · REVIEW · IMPROVE"
      status={recording
        ? { label: `REC ${mmss(elapsed)}`, color: '#c05050' }
        : reference ? { label: reference } : undefined}
      width={540}
      onClose={onClose}
    >
      <div style={{ padding: '16px 18px 28px', fontFamily: FONT.mono }}>

        {/* OpenAI key (transcription) */}
        {!hasOpenaiKey && (
          <div style={{
            background: `${GOLD}0c`, border: `1px solid ${GOLD}40`, borderRadius: 10,
            padding: '11px 14px', marginBottom: 16,
          }}>
            <div style={{ fontFamily: FONT.display, fontSize: 13, letterSpacing: '0.1em', color: GOLD, marginBottom: 6 }}>
              TRANSCRIPTION KEY NEEDED (ONE TIME)
            </div>
            <div style={{ fontSize: 9, color: `${TEXT}bb`, lineHeight: 1.6, marginBottom: 8 }}>
              Speech-to-text uses OpenAI. Paste a paid OpenAI API key; it is protected on this computer and used only for transcription.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={openaiKeyInput}
                onChange={e => setOpenaiKeyInput(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                style={{
                  flex: 1, boxSizing: 'border-box', background: DARK,
                  border: `1px solid ${KHAKI}30`, borderRadius: 6, padding: '8px 12px',
                  color: TEXT, fontSize: 10, fontFamily: FONT.mono, outline: 'none',
                }}
              />
              <button
                onClick={() => void saveKey()}
                disabled={!openaiKeyInput.trim()}
                style={{
                  border: `1px solid ${GOLD}55`, borderRadius: 6, padding: '0 12px',
                  background: `${GOLD}18`, color: GOLD, fontFamily: FONT.display,
                  cursor: openaiKeyInput.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                SAVE
              </button>
            </div>
          </div>
        )}

        {hasOpenaiKey && (
          <label style={{
            display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 16,
            padding: '10px 12px', border: `1px solid ${KHAKI}25`, borderRadius: 8,
            fontSize: 8.5, color: `${TEXT}cc`, lineHeight: 1.55, cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={consented}
              onChange={event => setConsented(event.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              I understand the audio is sent to OpenAI for transcription, then the transcript and any manuscript excerpt are sent to Anthropic for delivery review.
            </span>
          </label>
        )}

        {/* Record / upload */}
        {!busy && !result && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={!hasOpenaiKey || !consented}
              style={{
                flex: 1, padding: '16px 0', borderRadius: 10, cursor: hasOpenaiKey && consented ? 'pointer' : 'not-allowed',
                background: recording ? '#c0505022' : `${GOLD}14`,
                border: `1px solid ${recording ? '#c05050' : GOLD + '50'}`,
                color: recording ? RED : GOLD,
                fontSize: 15, letterSpacing: '0.12em', fontFamily: FONT.display,
                opacity: hasOpenaiKey && consented ? 1 : 0.4,
              }}>
              {recording ? `⏹ STOP — ${mmss(elapsed)}` : '⏺ REHEARSE NOW'}
              <div style={{ fontSize: 6.5, opacity: 0.6, marginTop: 4, letterSpacing: '0.08em', fontFamily: FONT.mono }}>
                {recording ? 'recording your run-through' : 'record into the mic'}
              </div>
            </button>
            <button
              onClick={uploadFile}
              disabled={!hasOpenaiKey || !consented || recording}
              style={{
                flex: 1, padding: '16px 0', borderRadius: 10,
                cursor: hasOpenaiKey && consented && !recording ? 'pointer' : 'not-allowed',
                background: CARD, border: `1px solid ${KHAKI}35`, color: TEXT,
                fontSize: 15, letterSpacing: '0.12em', fontFamily: FONT.display,
                opacity: hasOpenaiKey && consented && !recording ? 1 : 0.4,
              }}>
              ⇪ UPLOAD SERMON
              <div style={{ fontSize: 6.5, opacity: 0.6, marginTop: 4, letterSpacing: '0.08em', fontFamily: FONT.mono }}>
                audio or video · max 25MB
              </div>
            </button>
          </div>
        )}

        {busy && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{
              width: 22, height: 22, margin: '0 auto 12px',
              border: `2px solid ${KHAKI}30`, borderTopColor: GOLD, borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: 9.5, color: KHAKI, letterSpacing: '0.1em', fontFamily: FONT.type }}>{busy}</div>
            <div style={{ fontSize: 8, color: `${KHAKI}50`, marginTop: 6, fontFamily: FONT.type }}>transcription + critique — a sermon-length file can take a couple minutes</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && (
          <div style={{
            fontSize: 9, color: RED, background: '#c0505012', border: '1px solid #c0505035',
            borderRadius: 8, padding: '10px 14px', marginBottom: 14, lineHeight: 1.6,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            <div style={{
              background: `${GOLD}0c`, border: `1px solid ${GOLD}40`, borderRadius: 10,
              padding: '12px 15px', marginBottom: 14,
            }}>
              <div style={{ fontFamily: FONT.display, fontSize: 13, letterSpacing: '0.1em', color: GOLD, marginBottom: 5 }}>
                OVERALL{result.durationMin ? ` · ~${result.durationMin} MIN` : ''}
              </div>
              <div style={{ fontSize: 12, fontFamily: FONT.serif, color: TEXT, lineHeight: 1.65 }}>
                {result.overall}
              </div>
            </div>

            <Section title="✓ WHAT WORKED" color={GOLD} items={result.strengths} />
            <Section title="✗ FIX THESE" color={RED} items={result.critiques} />

            {([['FILLER WORDS', result.fillerWords], ['PACING', result.pacing], ['CLARITY OF THE BIG IDEA', result.clarity], ['FAITHFULNESS TO THE PLAN', result.faithfulness]] as [string, string][])
              .filter(([, v]) => v)
              .map(([h, v]) => (
                <div key={h} style={{ background: CARD, border: `1px solid ${KHAKI}25`, borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                  <div style={{ fontFamily: FONT.display, fontSize: 12.5, letterSpacing: '0.1em', color: `${KHAKI}` , marginBottom: 4 }}>{h}</div>
                  <div style={{ fontSize: 10.5, fontFamily: FONT.serif, color: TEXT, lineHeight: 1.6 }}>{v}</div>
                </div>
              ))}

            <button onClick={() => { setResult(null); setError(null) }}
              style={{
                width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 8, cursor: 'pointer',
                background: `${GOLD}14`, border: `1px solid ${GOLD}40`, color: GOLD,
                fontSize: 14, letterSpacing: '0.12em', fontFamily: FONT.display,
              }}>
              REVIEW ANOTHER TAKE
            </button>
          </>
        )}
      </div>
    </OpsPanel>
  )
}

function Section({ title, color, items }: { title: string; color: string; items: string[] }) {
  if (!items?.length) return null
  return (
    <div style={{ background: CARD, border: `1px solid ${color}30`, borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
      <div style={{ fontFamily: FONT.display, fontSize: 13, letterSpacing: '0.1em', color, marginBottom: 6 }}>{title}</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: i === items.length - 1 ? 0 : 6 }}>
          <span style={{ fontSize: 8, color, flexShrink: 0, marginTop: 2 }}>·</span>
          <span style={{ fontSize: 10.5, fontFamily: FONT.serif, color: TEXT, lineHeight: 1.55 }}>{it}</span>
        </div>
      ))}
    </div>
  )
}
