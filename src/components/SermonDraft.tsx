import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'

interface SermonPoint {
  point: string
  explanation: string
  keyVerses: string[]
  application: string
  illustration: string
}

interface Draft {
  title: string
  emotionalRegister: string
  mainIdea: string
  introduction: string
  points: SermonPoint[]
  conclusion: string
  gospelBridge: string
}

interface EisegesisFlagItem {
  quotedText: string
  type: 'EISEGESIS' | 'PROOFTEXTING' | 'ANACHRONISM' | 'WORD_FALLACY' | 'DRIFT'
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  issue: string
  suggestion: string
}

interface Props {
  inline?: boolean
  isOpen?: boolean
  onClose?: () => void
  analysis: any
  apiKey: string
  historyId?: string | null
  initialDraft?: string
}

const AGENT_LABELS = ['EXEGETICAL', 'THEOLOGICAL', 'HOMILETICAL']

const FLAG_META: Record<EisegesisFlagItem['type'], { label: string; color: string }> = {
  EISEGESIS:    { label: 'Eisegesis',       color: BASE.red },
  PROOFTEXTING: { label: 'Proof-texting',   color: '#C49A2E' },
  ANACHRONISM:  { label: 'Anachronism',     color: BASE.khaki },
  WORD_FALLACY: { label: 'Word Fallacy',    color: BASE.moss },
  DRIFT:        { label: 'Doctrine Drift',  color: BASE.steel },
}

// ── Highlight mirror — renders coloured underlines behind the textarea ─────────
interface Segment { text: string; flag?: EisegesisFlagItem }
function buildSegments(text: string, flags: EisegesisFlagItem[]): Segment[] {
  // Find each flag's char range via quotedText search
  type Range = { start: number; end: number; flag: EisegesisFlagItem }
  const ranges: Range[] = []
  for (const flag of flags) {
    const idx = text.indexOf(flag.quotedText)
    if (idx !== -1) ranges.push({ start: idx, end: idx + flag.quotedText.length, flag })
  }
  // Sort by start, drop overlaps
  ranges.sort((a, b) => a.start - b.start)
  const clean: Range[] = []
  let cursor = 0
  for (const r of ranges) {
    if (r.start >= cursor) { clean.push(r); cursor = r.end }
  }
  // Build segments
  const segs: Segment[] = []
  let pos = 0
  for (const r of clean) {
    if (r.start > pos) segs.push({ text: text.slice(pos, r.start) })
    segs.push({ text: text.slice(r.start, r.end), flag: r.flag })
    pos = r.end
  }
  if (pos < text.length) segs.push({ text: text.slice(pos) })
  return segs
}

function HighlightMirror({
  text, flags, textareaRef,
  fontFamily, fontSize, lineHeight, padding,
}: {
  text: string
  flags: EisegesisFlagItem[]
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  fontFamily: string
  fontSize: number
  lineHeight: number
  padding: string
}) {
  const mirrorRef = useRef<HTMLDivElement>(null)
  // Sync scroll position with textarea
  useEffect(() => {
    const ta = textareaRef.current
    const mirror = mirrorRef.current
    if (!ta || !mirror) return
    const onScroll = () => { mirror.scrollTop = ta.scrollTop }
    ta.addEventListener('scroll', onScroll)
    return () => ta.removeEventListener('scroll', onScroll)
  }, [textareaRef])

  const segs = buildSegments(text, flags)
  return (
    <div ref={mirrorRef} aria-hidden style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      fontFamily, fontSize, lineHeight, padding,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      color: 'transparent', pointerEvents: 'none', zIndex: 0,
    }}>
      {segs.map((seg, i) =>
        seg.flag
          ? <mark key={i} style={{
              background: 'transparent',
              textDecoration: `underline wavy ${FLAG_META[seg.flag.type].color}`,
              textDecorationThickness: '2px',
            }}>{seg.text}</mark>
          : <span key={i}>{seg.text}</span>
      )}
    </div>
  )
}

function draftToPlainText(draft: Draft): string {
  const points = draft.points.map(p =>
    `${p.point}\n\n${p.explanation}\n\nAPPLICATION: ${p.application}${p.illustration ? `\n\nILLUSTRATION ANGLE: ${p.illustration}` : ''}`
  ).join('\n\n---\n\n')

  return `TITLE: ${draft.title}
EMOTIONAL REGISTER: ${draft.emotionalRegister}

BIG IDEA
${draft.mainIdea}

---

INTRODUCTION
${draft.introduction}

---

${points}

---

GOSPEL BRIDGE
${draft.gospelBridge}

---

CONCLUSION
${draft.conclusion}`
}

export function SermonDraft({ inline = false, isOpen, onClose, analysis, apiKey, historyId, initialDraft }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedPoint, setExpandedPoint] = useState<number | null>(null)
  const [agentStage, setAgentStage] = useState('')

  // Manuscript mode
  const [manuscriptMode, setManuscriptMode] = useState(!!initialDraft)
  const [manuscriptText, setManuscriptText] = useState(initialDraft ?? '')
  const [flags, setFlags] = useState<EisegesisFlagItem[]>([])
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState<string>('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const historyIdRef = useRef(historyId)
  useEffect(() => { historyIdRef.current = historyId }, [historyId])

  async function generate() {
    setLoading(true); setError(null); setDraft(null); setManuscriptMode(false)
    setAgentStage('EXEGETICAL AGENT — PARSING THE TEXT…')
    const t1 = setTimeout(() => setAgentStage('EXEGETICAL AGENT — SEARCHING SOURCES…'), 15000)
    const t2 = setTimeout(() => setAgentStage('THEOLOGICAL AGENT — TRACING THE CANON…'), 35000)
    const t3 = setTimeout(() => setAgentStage('THEOLOGICAL AGENT — SEARCHING SCHOLARSHIP…'), 50000)
    const t4 = setTimeout(() => setAgentStage('HOMILETICAL AGENT — DRAFTING…'), 70000)
    try {
      const result = await (window as any).electronAPI.draftSermon({ analysis, apiKey })
      setDraft(result)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to generate draft')
    } finally {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4)
      setLoading(false); setAgentStage('')
    }
  }

  function enterManuscript() {
    if (!draft) return
    setManuscriptText(draftToPlainText(draft))
    setFlags([])
    setManuscriptMode(true)
  }

  const runFlagCheck = useCallback(async (text: string) => {
    if (!analysis || text.trim().length < 60) return
    setChecking(true)
    try {
      const result = await (window as any).electronAPI.flagManuscript({
        manuscriptText: text,
        passageContext: analysis,
        apiKey,
      })
      if (result?.error) console.warn('[eisegesis]', result.error)
      setFlags(result?.flags ?? [])
      setLastChecked(text)
    } catch (e) {
      console.error('[eisegesis] check failed:', e)
    } finally { setChecking(false) }
  }, [analysis, apiKey])

  function persistDraft(text: string) {
    const id = historyIdRef.current
    if (!id) return
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      ;(window as any).electronAPI.sessionUpdateDraft(id, text).catch(() => {})
    }, 1500)
  }

  function handleManuscriptChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    setManuscriptText(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runFlagCheck(text), 3000)
    persistDraft(text)
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
  }, [])

  const activeAgentIdx = agentStage.includes('EXEGETICAL') ? 0 : agentStage.includes('THEOLOGICAL') ? 1 : agentStage.includes('HOMILETICAL') ? 2 : -1

  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  const sortedFlags = [...flags].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent' }}>

      {/* Header */}
      <div style={{
        padding: '18px 24px 14px',
        borderBottom: `1px solid ${BASE.borderDim}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, background: `${BASE.olive}55`,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7.5, color: BASE.gold, letterSpacing: '0.14em', opacity: 0.7 }}>
            {manuscriptMode ? 'SERMON MANUSCRIPT' : 'SERMON DRAFT'}
          </div>
          <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 18, color: BASE.bone, fontWeight: 600, lineHeight: 1.2 }}>
            {analysis?.reference ?? 'No passage'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Manuscript toggle */}
          {draft && !loading && (
            <button onClick={() => manuscriptMode ? setManuscriptMode(false) : enterManuscript()} style={{
              background: manuscriptMode ? BASE.goldMid : 'none',
              border: `1px solid ${manuscriptMode ? BASE.borderGold : BASE.borderDim}`,
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
              fontFamily: 'JetBrains Mono', fontSize: 8,
              color: manuscriptMode ? BASE.gold : BASE.steel, letterSpacing: '0.08em',
            }}>
              {manuscriptMode ? '← outline' : '✎ manuscript'}
            </button>
          )}
          {!draft && !loading && (
            <button onClick={generate} style={{
              background: BASE.goldMid, border: `1px solid ${BASE.borderGold}`,
              borderRadius: 8, padding: '7px 16px', cursor: 'pointer',
              fontFamily: 'JetBrains Mono', fontSize: 9, color: BASE.gold, letterSpacing: '0.08em',
            }}>✦ generate</button>
          )}
          {draft && !loading && !manuscriptMode && (
            <button onClick={generate} style={{
              background: 'none', border: `1px solid ${BASE.borderDim}`,
              borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
              fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.08em',
            }}>regenerate</button>
          )}
          {!inline && onClose && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: BASE.steel, fontSize: 16, padding: 4 }}>✕</button>
          )}
        </div>
      </div>

      {/* Body */}
      {manuscriptMode ? (
        /* ── Manuscript editor ── */
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

          {/* Editor */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: `1px solid ${BASE.borderDim}` }}>
            <div style={{
              padding: '8px 16px', borderBottom: `1px solid ${BASE.borderDim}`,
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              background: `${BASE.bgMid}88`,
            }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em' }}>
                WRITE YOUR MANUSCRIPT
              </span>
              {checking && (
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.08em', opacity: 0.7 }}>
                  · checking…
                </span>
              )}
              {!checking && flags.length > 0 && (
                <span style={{
                  fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.08em',
                  color: BASE.red, opacity: 0.8,
                }}>
                  · {flags.length} flag{flags.length !== 1 ? 's' : ''}
                </span>
              )}
              {!checking && flags.length === 0 && lastChecked && (
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.moss, letterSpacing: '0.08em', opacity: 0.7 }}>
                  · clean
                </span>
              )}
            </div>
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              <HighlightMirror
                text={manuscriptText}
                flags={flags}
                textareaRef={textareaRef}
                fontFamily="Crimson Pro, serif"
                fontSize={15}
                lineHeight={1.8}
                padding="20px 24px"
              />
              <textarea
                ref={textareaRef}
                value={manuscriptText}
                onChange={handleManuscriptChange}
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  resize: 'none', border: 'none', outline: 'none',
                  background: 'transparent', padding: '20px 24px',
                  fontFamily: 'Crimson Pro, serif', fontSize: 15, lineHeight: 1.8,
                  color: BASE.bone, zIndex: 1, boxSizing: 'border-box',
                }}
                placeholder="Write your sermon manuscript here…"
              />
            </div>
          </div>

          {/* Eisegesis flag panel */}
          <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{
              padding: '8px 14px', borderBottom: `1px solid ${BASE.borderDim}`,
              background: `${BASE.bgMid}88`, flexShrink: 0,
            }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em' }}>
                EXEGETICAL WATCHDOG
              </div>
              <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 11, color: BASE.steel, marginTop: 2, lineHeight: 1.4 }}>
                Live eisegesis scan — auto-checks every 3s of inactivity
              </div>
            </div>

            <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sortedFlags.length === 0 && (
                <div style={{
                  paddingTop: 24, textAlign: 'center',
                  fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.steel, lineHeight: 1.6,
                }}>
                  {lastChecked
                    ? 'No interpretive issues detected. Keep writing.'
                    : 'Start writing — the watchdog checks as you go.'}
                </div>
              )}
              {sortedFlags.map((flag, i) => {
                const fm = FLAG_META[flag.type]
                return (
                  <div key={i} style={{
                    borderRadius: 8, overflow: 'hidden',
                    border: `1px solid ${fm.color}33`,
                    background: `${fm.color}08`,
                  }}>
                    <div style={{
                      padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6,
                      borderBottom: `1px solid ${fm.color}22`,
                    }}>
                      <span style={{
                        fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.08em',
                        color: fm.color, background: `${fm.color}18`,
                        border: `1px solid ${fm.color}33`, borderRadius: 4, padding: '1px 5px',
                      }}>{fm.label}</span>
                      <span style={{
                        fontFamily: 'JetBrains Mono', fontSize: 6, color: BASE.steel, letterSpacing: '0.06em',
                        marginLeft: 'auto',
                      }}>{flag.severity}</span>
                    </div>
                    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <p style={{
                        fontFamily: 'Crimson Pro, serif', fontSize: 12, color: fm.color,
                        fontStyle: 'italic', margin: 0, lineHeight: 1.4,
                      }}>
                        "{flag.quotedText}"
                      </p>
                      <p style={{
                        fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.boneMid,
                        margin: 0, lineHeight: 1.5,
                      }}>
                        {flag.issue}
                      </p>
                      <p style={{
                        fontFamily: 'Crimson Pro, serif', fontSize: 11.5, color: BASE.steel,
                        margin: 0, lineHeight: 1.5, fontStyle: 'italic',
                      }}>
                        → {flag.suggestion}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ── Outline view ── */
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

          {/* Thinking state */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 60 }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${BASE.olive}`, borderTopColor: BASE.gold }}
              />
              <motion.div
                key={agentStage}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.gold, letterSpacing: '0.12em', textAlign: 'center', opacity: 0.8 }}
              >{agentStage || 'STARTING PIPELINE…'}</motion.div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 8 }}>
                {AGENT_LABELS.map((label, i) => {
                  const active = i === activeAgentIdx
                  const done = i < activeAgentIdx
                  return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: '50%', transition: 'all 0.5s',
                          background: done ? BASE.moss : active ? BASE.gold : BASE.steel,
                          boxShadow: active ? `0 0 10px ${BASE.gold}80` : 'none',
                        }}>
                          {active && (
                            <motion.div animate={{ scale: [1, 1.8], opacity: [0.5, 0] }} transition={{ duration: 1, repeat: Infinity }}
                              style={{ width: 10, height: 10, borderRadius: '50%', background: BASE.gold }} />
                          )}
                        </div>
                        <div style={{
                          fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.08em',
                          color: done ? BASE.moss : active ? BASE.gold : BASE.steel, transition: 'color 0.5s',
                        }}>{label}</div>
                      </div>
                      {i < AGENT_LABELS.length - 1 && (
                        <div style={{
                          width: 40, height: 1, margin: '-14px 6px 0',
                          background: done ? BASE.moss : BASE.borderDim, transition: 'background 0.5s',
                        }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: 16, borderRadius: 10, background: `${BASE.red}11`, border: `1px solid ${BASE.red}44`, fontFamily: 'JetBrains Mono', fontSize: 10, color: `${BASE.red}cc` }}>
              {error}
            </div>
          )}

          {!loading && !draft && !error && (
            <div style={{ paddingTop: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.boneDim, textAlign: 'center', lineHeight: 1.7, maxWidth: 400 }}>
                Generate a full sermon outline built from the text's natural structure — exegetical, theological, and homiletical agents working together.
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                {AGENT_LABELS.map((l, i) => (
                  <div key={l} style={{
                    fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel,
                    background: `${BASE.olive}33`, border: `1px solid ${BASE.borderDim}`,
                    borderRadius: 6, padding: '4px 10px', letterSpacing: '0.08em',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: [BASE.moss, BASE.green, BASE.gold][i] as string, display: 'inline-block' }} />
                    {l}
                  </div>
                ))}
              </div>
            </div>
          )}

          {draft && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
              {/* Title + emotional register + big idea */}
              <div style={{ borderBottom: `1px solid ${BASE.borderDim}`, paddingBottom: 22 }}>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 24, color: BASE.bone, fontWeight: 700, lineHeight: 1.2, marginBottom: 6 }}>
                  {draft.title}
                </div>
                {draft.emotionalRegister && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 12 }}>
                    <span style={{ fontSize: 8, color: BASE.gold }}>◈</span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7.5, color: BASE.gold, letterSpacing: '0.1em', opacity: 0.7 }}>
                      {draft.emotionalRegister}
                    </span>
                  </div>
                )}
                <div style={{ background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`, borderRadius: 8, padding: '10px 16px' }}>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.1em', marginBottom: 5, opacity: 0.6 }}>BIG IDEA</div>
                  <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.bone, lineHeight: 1.55, fontStyle: 'italic' }}>
                    {draft.mainIdea}
                  </div>
                </div>

                {/* Write manuscript CTA */}
                <button onClick={enterManuscript} style={{
                  marginTop: 14, display: 'flex', alignItems: 'center', gap: 8,
                  background: `${BASE.olive}33`, border: `1px solid ${BASE.borderDim}`,
                  borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
                  fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.08em',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = BASE.goldDim; e.currentTarget.style.borderColor = BASE.borderGold; e.currentTarget.style.color = BASE.gold }}
                onMouseLeave={e => { e.currentTarget.style.background = `${BASE.olive}33`; e.currentTarget.style.borderColor = BASE.borderDim; e.currentTarget.style.color = BASE.steel }}>
                  <span>✎</span>
                  <span>Write full manuscript — with live eisegesis checking</span>
                </button>
              </div>

              {/* Introduction */}
              <div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.12em', marginBottom: 8 }}>INTRODUCTION</div>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14.5, color: BASE.boneMid, lineHeight: 1.75 }}>
                  {draft.introduction}
                </div>
              </div>

              {/* Sermon points */}
              <div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.12em', marginBottom: 10 }}>
                  SERMON POINTS <span style={{ color: BASE.moss, marginLeft: 6 }}>({draft.points.length} from text)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {draft.points.map((p, i) => (
                    <div key={i} style={{ background: `${BASE.olive}33`, border: `1px solid ${BASE.border ?? BASE.borderDim}`, borderRadius: 10, overflow: 'hidden' }}>
                      <button
                        onClick={() => setExpandedPoint(expandedPoint === i ? null : i)}
                        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '13px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', textAlign: 'left' }}
                      >
                        <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 16, color: BASE.bone, fontWeight: 600, lineHeight: 1.3, flex: 1 }}>{p.point}</div>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: BASE.steel, marginLeft: 8, paddingTop: 2 }}>{expandedPoint === i ? '▾' : '▸'}</div>
                      </button>
                      <AnimatePresence>
                        {expandedPoint === i && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                            <div style={{ padding: '0 16px 18px', display: 'flex', flexDirection: 'column', gap: 13 }}>
                              {p.keyVerses?.length > 0 && (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {p.keyVerses.map((v, j) => (
                                    <span key={j} style={{ background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`, borderRadius: 6, padding: '2px 8px', fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.gold }}>{v}</span>
                                  ))}
                                </div>
                              )}
                              <div>
                                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em', marginBottom: 4, opacity: 0.7 }}>EXEGESIS</div>
                                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.boneMid, lineHeight: 1.7 }}>{p.explanation}</div>
                              </div>
                              <div style={{ background: `${BASE.green}22`, borderLeft: `2px solid ${BASE.moss}`, padding: '8px 12px', borderRadius: '0 6px 6px 0' }}>
                                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.moss, letterSpacing: '0.1em', marginBottom: 4 }}>APPLICATION</div>
                                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.boneMid, lineHeight: 1.7 }}>{p.application}</div>
                              </div>
                              {p.illustration && (
                                <div style={{ background: BASE.goldDim, borderLeft: `2px solid ${BASE.gold}55`, padding: '8px 12px', borderRadius: '0 6px 6px 0' }}>
                                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.1em', marginBottom: 4, opacity: 0.6 }}>ILLUSTRATION ANGLE</div>
                                  <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.boneMid, lineHeight: 1.7, fontStyle: 'italic' }}>{p.illustration}</div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gospel bridge */}
              <div style={{ background: `${BASE.green}22`, border: `1px solid ${BASE.border ?? BASE.borderDim}`, borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.12em', marginBottom: 7, opacity: 0.7 }}>GOSPEL BRIDGE</div>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14.5, color: BASE.bone, lineHeight: 1.7 }}>{draft.gospelBridge}</div>
              </div>

              {/* Conclusion */}
              <div style={{ borderTop: `1px solid ${BASE.borderDim}`, paddingTop: 22 }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.12em', marginBottom: 8 }}>CONCLUSION / CALL</div>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14.5, color: BASE.boneMid, lineHeight: 1.75 }}>{draft.conclusion}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  if (inline) {
    return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>{content}</div>
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} style={{ position: 'fixed', top: 44, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', zIndex: 800 }} />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{ position: 'fixed', top: 44, right: 0, bottom: 0, width: 560, background: BASE.bg, borderLeft: `1px solid ${BASE.borderGold}`, zIndex: 900 }}
          >{content}</motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
