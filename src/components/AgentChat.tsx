import { useState, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import type { PhrasingAnalysis } from '../types/phrasing'
import { BASE } from '../theme'

export type AgentType = 'exegetical' | 'theological' | 'homiletical'

interface Message { role: 'user' | 'assistant'; content: string }

interface Props {
  agentType: AgentType
  analysis: PhrasingAnalysis | null
  apiKey: string
  onClose: () => void
  onPushToDraft?: (content: string) => void
}

const AGENT_META: Record<AgentType, {
  label: string
  subtitle: string
  icon: string
  accentColor: string
  bgColor: string
  greeting: (ref: string | null, noteCount: number) => string
  questions: (book: string) => string[]
}> = {
  exegetical: {
    label: 'Exegetical Agent',
    subtitle: 'Grammar · Syntax · Original Language',
    icon: 'α',
    accentColor: BASE.khaki,
    bgColor: `${BASE.bgCard}cc`,
    greeting: (ref, _) => ref
      ? `Here's what I'm seeing in ${ref}. Don't miss what's happening grammatically — the verb forms and clause structure are doing more work than most preachers realize. What do you want to get into?`
      : `Load a passage and let's get into the Greek. Don't miss this — the grammar almost always tells you something the English translation flattens out.`,
    questions: (book) => {
      const byBook: Record<string, string[]> = {
        ephesians: [
          "Don't miss this — what is the grammatical relationship between grace, faith, and gift in 2:8-9?",
          "Here is something really cool: what does the perfect passive 'have been saved' (sesōsmenoi) actually signal?",
          "Think of it like this: how does the clause structure of 1:3-14 function as a single sentence in Greek?",
          "Let's be honest about what 'in the heavenly places' means grammatically — what kind of phrase is it?",
          "What is the verbal aspect of the imperatives in chapter 4 and how does that shape application?",
        ],
        galatians: [
          "Don't miss this — what does 'works of the law' mean in Second Temple context versus modern reading?",
          "Here is something really cool: what is the rhetorical function of Paul's curse in Galatians 1:8-9?",
          "Think of it like this: how does the syntax of 2:20 work — is it 'the faith of Christ' or 'faith in Christ'?",
          "Let's be honest about what 'justified' means here in terms of Paul's Greek vocabulary.",
          "What is the logical function of 'therefore' (oun) in 5:1 and what argument is it concluding?",
        ],
        romans: [
          "Don't miss this — how does the Greek word order in 1:17 shape the meaning of 'righteousness of God'?",
          "Here is something really cool: what is the grammatical force of 'all' in 3:23?",
          "Think of it like this: what kind of conditional sentence is 8:9 and what does that mean for interpretation?",
          "Let's be honest about what 'imputed' means in 4:3 — what is the verbal form doing?",
          "How does the particle 'gar' function as a structural marker in Romans' argument?",
        ],
      }
      return byBook[book] ?? [
        "Don't miss this — what are the key verb forms in this passage and what do they signal?",
        "Here is something really cool in the text — what does the clause structure reveal about the author's argument?",
        "Think of it like this: what connectives are doing the logical work and what do they mean?",
        "Let's be honest about what the key words in this passage actually meant to the original audience.",
        "What does the syntax of the main clause tell us about what the author most wants us to see?",
      ]
    },
  },

  theological: {
    label: 'Theological Agent',
    subtitle: 'Canon · Doctrine · Redemptive History',
    icon: '✝',
    accentColor: BASE.gold,
    bgColor: `${BASE.bgCard}cc`,
    greeting: (ref, _) => ref
      ? `The doctrinal weight in ${ref} is significant — don't miss this. Let me show you where this passage sits in the whole story of Scripture and what's actually at stake theologically. Where do you want to start?`
      : `Load a passage and let's trace the canon. Think of it like this: every text carries the weight of the whole story. I want to help you see where this moment fits in what God has been doing from the beginning.`,
    questions: (book) => {
      const byBook: Record<string, string[]> = {
        ephesians: [
          "Don't miss this — what does 'in Christ' mean theologically and how many times does Paul use it here?",
          "Think of it like this: how does the 'already/not yet' tension shape the ethics of Ephesians 4-6?",
          "Here is something really cool — how does Ephesians 2:11-22 function as a new temple theology?",
          "Let's be honest about what 'principalities and powers' means in terms of biblical cosmology.",
          "How does Ephesians fit the Jew-Gentile reconciliation that is central to Paul's gospel?",
        ],
        galatians: [
          "Don't miss this — how does the Abraham narrative in Galatians 3 reframe the whole law/gospel debate?",
          "Think of it like this: what is the redemptive-historical function of the law in Paul's argument?",
          "Here is something really cool — how does Galatians read differently when you see it as Paul's rewriting of Israel's story?",
          "Let's be honest about what 'curse of the law' means in terms of Deuteronomy 27-28.",
          "How does the 'seed of Abraham' argument connect to the whole biblical covenant story?",
        ],
        romans: [
          "Don't miss this — what is the 'righteousness of God' as a covenantal concept in Isaiah and the Psalms?",
          "Think of it like this: how does Romans 9-11 answer the question of whether God has been faithful to Israel?",
          "Here is something really cool — how does Adam typology in Romans 5 connect to creation theology?",
          "Let's be honest about the Christological center of Romans — what is Paul most fundamentally claiming about Jesus?",
          "How does 'new creation' eschatology shape the ethics of Romans 12-15?",
        ],
      }
      return byBook[book] ?? [
        "Don't miss this — where does this passage sit in the Creation → Fall → Redemption → New Creation arc?",
        "Think of it like this: what Old Testament echoes are present and why do they matter?",
        "Here is something really cool — how does this text point to Christ's person and work?",
        "Let's be honest about the doctrinal weight here — what theological claims are being made?",
        "How does the 'already/not yet' tension of the kingdom show up in this passage?",
      ]
    },
  },

  homiletical: {
    label: 'Homiletical Agent',
    subtitle: 'Structure · Application · Craft',
    icon: '◈',
    accentColor: BASE.moss,
    bgColor: `${BASE.bgCard}cc`,
    greeting: (ref, _) => ref
      ? `Let's talk about how ${ref} actually becomes a sermon. Think of it like this — the text has a natural shape, and our job is to find it instead of imposing one. I've been looking at the structure and there are some real moves here worth building on. Where do you want to start?`
      : `Load a passage and let's build a sermon. Don't miss this: the best sermons don't impose structure on the text — they find the structure the text already has. Let me help you see it.`,
    questions: (book) => {
      const byBook: Record<string, string[]> = {
        ephesians: [
          "Think of it like this — how do I turn the indicative/imperative structure of Ephesians into a sermon shape?",
          "Don't miss the opportunity here: how do I preach 'by grace through faith' without making it sound like a cliché?",
          "Let's be honest — what kind of introduction hooks people into the cosmic claims of Ephesians 1?",
          "Here is something really cool to do with this text: how do I make the Jew-Gentile unity theme land in a homogeneous congregation?",
          "What illustration angle can carry the weight of 'masterpiece' (poiema) in 2:10 without trivializing it?",
        ],
        galatians: [
          "Think of it like this — how do I preach Paul's argument without losing people in the law/gospel debate?",
          "Don't miss the opportunity in Galatians to land freedom — but what does that actually look like on a Tuesday?",
          "Let's be honest: how do I handle the sharpness of Paul's tone without making it feel like I'm just angry?",
          "Here is something really cool structurally — how does the autobiography in chapters 1-2 function as a sermon move?",
          "What's the emotional register of this passage and how should I stand up there delivering it?",
        ],
        romans: [
          "Think of it like this — how do I organize the argument of Romans into a sermon without losing the logic?",
          "Don't miss the opportunity in Romans 8 to preach hope to people in real suffering.",
          "Let's be honest: how do I preach election from Romans 9 without splitting the room?",
          "Here is something really cool — how does the doxology structure of 11:33-36 suggest a sermon ending?",
          "What kind of illustration can carry 'no condemnation' in 8:1 without undercutting its weight?",
        ],
      }
      return byBook[book] ?? [
        "Think of it like this — what is the natural sermon shape this text demands?",
        "Don't miss the opportunity: what is the most important application move in this passage?",
        "Let's be honest — what kind of introduction would actually draw people into the world of this text?",
        "Here is something really cool to do homiletically with this passage — what illustration angle fits?",
        "What emotional register does this text demand, and how does that shape delivery?",
      ]
    },
  },
}

function looksLikeSermonOutline(text: string): boolean {
  return /^(I\.|II\.|III\.|1\.|2\.|3\.|\*\*I\.|#{1,3}\s)/m.test(text) && text.length > 200
}

export function AgentChat({ agentType, analysis, apiKey, onClose, onPushToDraft }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const meta = AGENT_META[agentType]
  const book = analysis?.reference?.replace(/\s+\d.*/, '').toLowerCase() ?? ''

  useEffect(() => {
    const noteCount = analysis?.culturalNotes?.length ?? 0
    setMessages([{
      role: 'assistant',
      content: meta.greeting(analysis?.reference ?? null, noteCount),
    }])
    setTimeout(() => inputRef.current?.focus(), 200)
  }, [agentType, analysis?.reference])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const userMsg: Message = { role: 'user', content }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const apiMessages = next
        .filter(m => !(m.role === 'assistant' && m === messages[0]))
        .map(m => ({ role: m.role, content: m.content }))
      const reply = await (window as any).electronAPI.agentChat({
        agentType,
        messages: apiMessages,
        passageContext: analysis ?? null,
        apiKey,
      })
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err?.message ?? 'Something went wrong'}` }])
    } finally { setLoading(false) }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const hasUserMessages = messages.filter(m => m.role === 'user').length > 0
  const questions = meta.questions(book)

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      style={{
        position: 'fixed', top: 48, right: 0, bottom: 0,
        width: 500, zIndex: 300,
        background: `${BASE.bg}f8`,
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        borderLeft: `1px solid ${meta.accentColor}44`,
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px 14px',
        borderBottom: `1px solid ${BASE.borderDim}`,
        background: `${BASE.bgMid}cc`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        {/* Agent icon */}
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          background: `${meta.accentColor}18`,
          border: `1.5px solid ${meta.accentColor}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: agentType === 'exegetical' ? 'Crimson Pro, serif' : 'JetBrains Mono',
          fontSize: agentType === 'exegetical' ? 20 : agentType === 'theological' ? 14 : 13,
          color: meta.accentColor,
          flexShrink: 0,
        }}>{meta.icon}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.bone, fontWeight: 500 }}>
            {meta.label}
          </div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: meta.accentColor, letterSpacing: '0.1em', marginTop: 1, opacity: 0.7 }}>
            {meta.subtitle}
          </div>
        </div>

        {analysis && (
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 8, color: meta.accentColor,
            background: `${meta.accentColor}14`, border: `1px solid ${meta.accentColor}33`,
            borderRadius: 6, padding: '3px 8px', flexShrink: 0,
          }}>{analysis.reference}</div>
        )}

        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: BASE.steel, fontSize: 18, padding: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
          >
            {msg.role === 'assistant' && (
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: meta.accentColor, letterSpacing: '0.1em', marginBottom: 4, opacity: 0.6 }}>
                {agentType}
              </div>
            )}
            <div style={{
              maxWidth: '90%',
              background: msg.role === 'user' ? BASE.goldDim : `${meta.accentColor}0d`,
              border: `1px solid ${msg.role === 'user' ? BASE.borderGold : `${meta.accentColor}22`}`,
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              padding: '10px 14px',
            }}>
              <p style={{
                fontFamily: 'Crimson Pro, serif', fontSize: 14.5, lineHeight: 1.72,
                color: msg.role === 'user' ? BASE.bone : BASE.boneMid,
                margin: 0, whiteSpace: 'pre-wrap',
              }}>{msg.content}</p>
            </div>
            {msg.role === 'assistant' && agentType === 'homiletical' && onPushToDraft && looksLikeSermonOutline(msg.content) && (
              <button
                onClick={() => { onPushToDraft(msg.content); onClose() }}
                style={{
                  marginTop: 6, padding: '4px 12px', fontSize: 8,
                  fontFamily: 'JetBrains Mono', letterSpacing: '0.1em',
                  color: BASE.moss, background: `${BASE.moss}12`,
                  border: `1px solid ${BASE.moss}40`, borderRadius: 6,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BASE.moss}22` }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${BASE.moss}12` }}
              >
                → SEND TO DRAFT
              </button>
            )}
          </motion.div>
        ))}

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{
              display: 'flex', gap: 5, padding: '12px 16px',
              background: `${meta.accentColor}0d`, border: `1px solid ${meta.accentColor}22`,
              borderRadius: '14px 14px 14px 4px', width: 'fit-content',
            }}>
              {[0, 1, 2].map(i => (
                <motion.div key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  style={{ width: 5, height: 5, borderRadius: '50%', background: meta.accentColor }}
                />
              ))}
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      {!hasUserMessages && (
        <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.1em', marginBottom: 2 }}>
            suggested questions
          </div>
          {questions.slice(0, 4).map((q, i) => (
            <button key={i} onClick={() => send(q)} style={{
              background: `${meta.accentColor}08`, border: `1px solid ${BASE.borderDim}`,
              borderRadius: 8, padding: '7px 12px', cursor: 'pointer', textAlign: 'left',
              fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget.style.background = `${meta.accentColor}16`); (e.currentTarget.style.borderColor = `${meta.accentColor}44`) }}
            onMouseLeave={e => { (e.currentTarget.style.background = `${meta.accentColor}08`); (e.currentTarget.style.borderColor = BASE.borderDim) }}
            >{q}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '12px 20px 20px', borderTop: `1px solid ${BASE.borderDim}`, flexShrink: 0 }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          background: `${meta.accentColor}0a`, border: `1px solid ${meta.accentColor}28`,
          borderRadius: 12, padding: '10px 12px',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Ask the ${agentType} agent…`}
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
            background: input.trim() && !loading ? `${meta.accentColor}22` : `${BASE.olive}33`,
            border: `1px solid ${input.trim() && !loading ? `${meta.accentColor}55` : BASE.borderDim}`,
            borderRadius: 8, width: 32, height: 32,
            cursor: input.trim() && !loading ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'all 0.15s',
          }}>
            <span style={{ color: input.trim() && !loading ? meta.accentColor : BASE.steel, fontSize: 13 }}>↑</span>
          </button>
        </div>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, marginTop: 6, letterSpacing: '0.08em', opacity: 0.5 }}>
          enter to send · shift+enter for new line · powered by opus
        </div>
      </div>
    </motion.div>
  )
}
