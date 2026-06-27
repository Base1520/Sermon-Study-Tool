import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { PhrasingAnalysis } from '../types/phrasing'
import { BASE } from '../theme'

interface Message { role: 'user' | 'assistant'; content: string }

// ── Octagon thinking indicator ─────────────────────────────────────────────────
function OctagonThinking({ loading }: { loading: boolean }) {
  const N = 8
  const R = 27, cx = 36, cy = 36

  const [cursor, setCursor]   = useState(0)
  const [phase, setPhase]     = useState<'idle' | 'building' | 'glowing' | 'fading'>('idle')
  const timer                 = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (loading) {
      setPhase('building')
      setCursor(0)
      const id = setInterval(() => setCursor(c => (c + 1) % N), 420)
      return () => clearInterval(id)
    } else if (phase !== 'idle') {
      setPhase('glowing')
      timer.current = setTimeout(() => {
        setPhase('fading')
        timer.current = setTimeout(() => setPhase('idle'), 400)
      }, 950)
    }
  }, [loading])

  if (phase === 'idle') return null

  const verts = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }
  })
  const polyPts = verts.map(v => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ')

  const trailLen = 3
  function isTrail(i: number) {
    const behind = (cursor - i + N) % N
    return behind > 0 && behind <= trailLen
  }

  return (
    <motion.div
      animate={{ opacity: phase === 'fading' ? 0 : 1, scale: phase === 'fading' ? 1.1 : 1 }}
      transition={{ duration: 0.35 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0 8px' }}
    >
      <svg width={72} height={80} viewBox="0 0 72 80" style={{ overflow: 'visible' }}>

        {/* Dim base octagon */}
        <polygon points={polyPts} fill="none"
          stroke={BASE.border} strokeWidth={0.6} strokeOpacity={0.22} />

        {/* Edge segments — trail lights up behind cursor */}
        {verts.map((v, i) => {
          const next = verts[(i + 1) % N]
          const isCur  = i === cursor
          const trail  = isTrail(i)
          const glowing = phase === 'glowing' || phase === 'fading'
          return (
            <line key={`e${i}`} x1={v.x} y1={v.y} x2={next.x} y2={next.y}
              stroke={glowing || isCur || trail ? BASE.gold : BASE.border}
              strokeWidth={glowing ? 1.8 : isCur ? 1.6 : trail ? 0.9 : 0.4}
              strokeOpacity={glowing ? 0.85 : isCur ? 0.9 : trail ? 0.35 - (((cursor - i + N) % N) - 1) * 0.1 : 0.1}
              style={{ transition: 'stroke-opacity 0.25s, stroke-width 0.25s' }}
            />
          )
        })}

        {/* Vertex dots */}
        {verts.map((v, i) => {
          const isCur  = i === cursor && phase === 'building'
          const trail  = isTrail(i)
          const glowing = phase === 'glowing' || phase === 'fading'
          return (
            <g key={`v${i}`}>
              {/* Pulse halo on active vertex */}
              {isCur && (
                <circle cx={v.x} cy={v.y} r={10} fill={BASE.gold} fillOpacity={0.1}>
                  <animate attributeName="r" values="7;13;7" dur="0.84s" repeatCount="indefinite" />
                  <animate attributeName="fill-opacity" values="0.1;0.22;0.1" dur="0.84s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Full glow halo when complete */}
              {glowing && (
                <circle cx={v.x} cy={v.y} r={9} fill={BASE.gold} fillOpacity={0.12}>
                  <animate attributeName="r" values="7;12;7" dur="0.9s" repeatCount="2" />
                  <animate attributeName="fill-opacity" values="0.12;0.28;0.12" dur="0.9s" repeatCount="2" />
                </circle>
              )}
              <circle cx={v.x} cy={v.y}
                r={glowing ? 4 : isCur ? 4.5 : trail ? 3 : 2.5}
                fill={glowing ? BASE.gold : isCur ? BASE.gold : trail ? `${BASE.gold}70` : `${BASE.bg}cc`}
                stroke={glowing ? BASE.gold : isCur ? BASE.gold : trail ? `${BASE.gold}55` : BASE.border}
                strokeWidth={glowing ? 1.5 : isCur ? 1.5 : 1}
                style={{ transition: 'r 0.2s, fill 0.3s' }}
              />
            </g>
          )
        })}

        {/* Complete glow polygon overlay */}
        {phase === 'glowing' && (
          <polygon points={polyPts} fill={`${BASE.gold}0a`} stroke={BASE.gold} strokeWidth={1.5} strokeOpacity={0.7}>
            <animate attributeName="stroke-opacity" values="0.4;0.9;0.4" dur="0.9s" repeatCount="2" />
            <animate attributeName="fill-opacity" values="0.04;0.14;0.04" dur="0.9s" repeatCount="2" />
          </polygon>
        )}

        {/* Status label */}
        <text x={36} y={70} textAnchor="middle"
          fontSize={5.5} fontFamily="JetBrains Mono" letterSpacing="0.18em"
          fill={BASE.steel} fillOpacity={phase === 'glowing' ? 0.8 : 0.45}
          style={{ transition: 'fill-opacity 0.3s' }}
        >{phase === 'glowing' ? 'COMPLETE' : 'THINKING'}</text>

      </svg>
    </motion.div>
  )
}

interface Props {
  inline?: boolean
  isOpen?: boolean
  onClose?: () => void
  analysis: PhrasingAnalysis | null
  apiKey: string
  onOpenProfile: () => void
  historyId?: string | null
  initialMessages?: { role: 'user' | 'assistant'; content: string }[]
}

const BASE_QUESTIONS = [
  "Don't miss this — what is the single weight-bearing theological claim of this text?",
  "Think of it like this: how does this passage fit the larger story of Scripture?",
  "Let's be honest — what does this actually demand of the people in the room?",
  "Here is something really cool in the text — what word or phrase is doing heavy lifting?",
  "What would a first-century reader have heard that we almost certainly miss today?",
]

function getSuggestedQuestions(analysis: { reference: string; mainTheme?: string } | null) {
  if (!analysis) return BASE_QUESTIONS
  const book = analysis.reference.replace(/\s+\d.*/, '').toLowerCase()
  const bookQuestions: Record<string, string[]> = {
    galatians: [
      "Don't miss this — what is Paul's actual argument and why does it matter for preaching?",
      "Think of it like this: what does 'works of the law' mean for someone sitting in a pew today?",
      "Let's be honest — how does the Abraham narrative actually change how we hear this passage?",
      "Here is something really cool in the text — what is Paul doing rhetorically in this argument?",
      "What is the relationship between law and promise, and how do I preach that without losing people?",
    ],
    romans: [
      "Don't miss this — what is Paul's covenantal argument and how does it hold together?",
      "Think of it like this: what does 'righteousness of God' actually mean in context?",
      "Let's be honest — how does Israel's story undergird this passage in a way that shapes the sermon?",
      "Here is something really cool in the text — what does this reveal about Jew-Gentile dynamics?",
      "How does this connect to new creation theology in a way I can actually preach?",
    ],
    revelation: [
      "Don't miss this — what is John actually saying to first-century churches under pressure?",
      "Think of it like this: what Old Testament imagery is being evoked and why does it matter?",
      "Let's be honest — how do I preach Revelation without making people weird or scared?",
      "Here is something really cool in the text — what does the Lamb imagery mean in its context?",
      "How does inaugurated eschatology help me interpret this vision faithfully?",
    ],
    luke: [
      "Don't miss this — how does Luke position Jesus as the fulfillment of Israel's story here?",
      "Think of it like this: what Second Temple expectations does this passage engage?",
      "Let's be honest — what is this passage really asking of Gentile readers then and now?",
      "Here is something really cool in the text — what does Luke's structure tell us about his theology?",
      "How does this passage fit Luke's travel narrative and what does that mean for preaching it?",
    ],
    acts: [
      "Don't miss this — how does this moment advance the 'to the ends of the earth' mission?",
      "Think of it like this: what is Luke showing us about how the Spirit moves here?",
      "Let's be honest — what does this Jewish-Gentile dynamic mean for a church like mine?",
      "Here is something really cool in the text — what OT background is Luke drawing on?",
      "How does this fit the exodus-new-creation pattern running through Acts?",
    ],
    psalms: [
      "Don't miss this — what is the psalmist actually feeling and why does that matter to preach?",
      "Think of it like this: how does this psalm function within Israel's covenant story?",
      "Let's be honest — how do I preach lament to people who think Christians shouldn't doubt?",
      "Here is something really cool in the text — what does this reveal about Israel's view of YHWH?",
      "How does this psalm point forward to Christ in a way that doesn't feel forced?",
    ],
    ephesians: [
      "Don't miss this — what is the cosmic scope of what Paul is claiming here?",
      "Think of it like this: what does 'in the heavenly places' actually mean for daily life?",
      "Let's be honest — how does the Jew-Gentile unity theme land in a church that is still divided?",
      "Here is something really cool in the text — what is the significance of the 'principalities and powers' language?",
      "How does this passage connect to new creation theology in a way worth preaching?",
    ],
    colossians: [
      "Don't miss this — what is Paul claiming about Christ's supremacy and how far does it go?",
      "Think of it like this: how does 'fullness' (pleroma) function in the argument here?",
      "Let's be honest — what does this hymn actually demand of how we live Monday through Saturday?",
      "Here is something really cool in the text — what Wisdom literature is Paul drawing on?",
      "How does this passage shape the theology behind expository preaching itself?",
    ],
  }
  return bookQuestions[book] ?? BASE_QUESTIONS
}

export function ScholarChat({ inline = false, isOpen, onClose, analysis, apiKey, onOpenProfile, historyId, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const historyIdRef = useRef(historyId)
  useEffect(() => { historyIdRef.current = historyId }, [historyId])

  // Init: restore saved messages or show greeting
  const initKey = inline ? analysis?.reference ?? 'empty' : isOpen ? analysis?.reference ?? 'empty' : null
  useEffect(() => {
    if (!initKey) return
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages)
    } else {
      setMessages([{
        role: 'assistant',
        content: analysis
          ? `I've worked through ${analysis.reference}. Here is something really cool — I can already see ${analysis.culturalNotes?.length ?? 0} cultural pressure point${(analysis.culturalNotes?.length ?? 0) !== 1 ? 's' : ''} worth unpacking before you step in the pulpit. What do you want to dig into?`
          : "Load a passage and let's go. I want to help you see what the text is actually doing — not just what it says, but what it demands. Think of it like this: good exegesis changes how you see everything else.",
      }])
    }
  }, [initKey])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (inline || isOpen) setTimeout(() => inputRef.current?.focus(), 200) }, [inline, isOpen])

  function persistChat(msgs: Message[]) {
    const id = historyIdRef.current
    if (!id) return
    ;(window as any).electronAPI.sessionUpdateChat(id, msgs).catch(() => {})
  }

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const userMsg: Message = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const apiMessages = newMessages
        .filter(m => !(m.role === 'assistant' && m === messages[0]))
        .map(m => ({ role: m.role, content: m.content }))
      const reply = await (window as any).electronAPI.scholarChat({ messages: apiMessages, passageContext: analysis ?? null, apiKey })
      const updatedMessages = [...newMessages, { role: 'assistant' as const, content: reply }]
      setMessages(updatedMessages)
      persistChat(updatedMessages)
      if (updatedMessages.filter(m => m.role === 'user').length >= 2)
        (window as any).electronAPI.profileExtractInsights({ messages: updatedMessages.slice(-6), apiKey }).catch(() => {})
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err?.message ?? 'Something went wrong'}` }])
    } finally { setLoading(false) }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const content = (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: inline ? 'transparent' : `${BASE.bg}f8`,
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 24px 14px',
        borderBottom: `1px solid ${BASE.borderDim}`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        background: inline ? `${BASE.olive}55` : `${BASE.olive}cc`,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: `${BASE.green}44`,
          border: `1.5px solid ${BASE.moss}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Crimson Pro, serif', fontSize: 16, color: BASE.gold, flexShrink: 0,
        }}>λ</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.bone, fontWeight: 500 }}>
            Scholar in Residence
          </div>
          {analysis?.mainTheme && (
            <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 11.5, color: BASE.boneDim, marginTop: 1, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {analysis.mainTheme}
            </div>
          )}
        </div>
        {analysis && (
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.08em', color: BASE.gold,
            background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
            borderRadius: 6, padding: '3px 8px',
          }}>{analysis.reference}</div>
        )}
        {!inline && onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: BASE.steel, fontSize: 16, padding: 4 }}>×</button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
          >
            {msg.role === 'assistant' && (
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.1em', marginBottom: 4, opacity: 0.6 }}>
                scholar
              </div>
            )}
            <div style={{
              maxWidth: '88%',
              background: msg.role === 'user' ? BASE.goldDim : `${BASE.olive}44`,
              border: `1px solid ${msg.role === 'user' ? BASE.borderGold : BASE.border}`,
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              padding: '10px 14px',
            }}>
              <p style={{
                fontFamily: 'Crimson Pro, serif', fontSize: 14.5, lineHeight: 1.7,
                color: msg.role === 'user' ? BASE.bone : BASE.boneMid,
                margin: 0, whiteSpace: 'pre-wrap',
              }}>{msg.content}</p>
            </div>
          </motion.div>
        ))}

        <OctagonThinking loading={loading} />
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      {messages.filter(m => m.role === 'user').length === 0 && (
        <div style={{ padding: '0 24px 12px', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em', marginBottom: 2 }}>
            suggested questions
          </div>
          {getSuggestedQuestions(analysis).map((q, i) => (
            <button key={i} onClick={() => send(q)} style={{
              background: `${BASE.olive}33`, border: `1px solid ${BASE.borderDim}`,
              borderRadius: 8, padding: '7px 12px', cursor: 'pointer', textAlign: 'left',
              fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget.style.background = `${BASE.green}33`); (e.currentTarget.style.borderColor = BASE.border) }}
            onMouseLeave={e => { (e.currentTarget.style.background = `${BASE.olive}33`); (e.currentTarget.style.borderColor = BASE.borderDim) }}
            >{q}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '12px 24px 20px', borderTop: `1px solid ${BASE.borderDim}`, flexShrink: 0 }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          background: `${BASE.olive}33`, border: `1px solid ${BASE.border}`,
          borderRadius: 12, padding: '10px 12px',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about the passage, a clause, a cultural note…"
            rows={1}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
              fontFamily: 'Crimson Pro, serif', fontSize: 14, color: BASE.bone,
              lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
            }}
            onInput={e => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 120) + 'px'
            }}
          />
          <button onClick={() => send()} disabled={!input.trim() || loading} style={{
            background: input.trim() && !loading ? BASE.goldMid : `${BASE.olive}44`,
            border: `1px solid ${input.trim() && !loading ? BASE.borderGold : BASE.borderDim}`,
            borderRadius: 8, width: 32, height: 32,
            cursor: input.trim() && !loading ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'all 0.15s',
          }}>
            <span style={{ color: input.trim() && !loading ? BASE.gold : BASE.steel, fontSize: 13 }}>↑</span>
          </button>
        </div>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, marginTop: 6, letterSpacing: '0.08em', opacity: 0.5 }}>
          enter to send · shift+enter for new line · powered by opus
        </div>
      </div>
    </div>
  )

  if (inline) {
    return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>{content}</div>
  }

  // Legacy drawer mode (kept for backwards compat if needed)
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} style={{ position: 'fixed', top: 44, left: 0, right: 0, bottom: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)' }} />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            style={{ position: 'fixed', top: 44, right: 0, bottom: 0, width: 480, zIndex: 201 }}
          >{content}</motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
