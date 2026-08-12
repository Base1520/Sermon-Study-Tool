import { useMemo, useState } from 'react'
import { askSermonAgent } from './api'
import { copyToClipboard } from './clipboard'
import { ReportAiOutput } from './ReportAiOutput'
import type { TabletAgentMessage, TabletAgentRole, TabletAgentThreads } from './tabletDeskModel'

export const TABLET_AGENT_META: Record<TabletAgentRole, {
  icon: string
  label: string
  promise: string
  starters: string[]
}> = {
  exegetical: {
    icon: 'α',
    label: 'EXEGETICAL',
    promise: 'Grammar, words, structure, context, and what the text cannot mean.',
    starters: ['Show me the controlling structure.', 'Where am I most likely to overclaim?', 'Which words carry the argument?'],
  },
  theological: {
    icon: '✝',
    label: 'THEOLOGICAL',
    promise: 'Canonical placement, doctrine, covenant, Christ, and redemptive history.',
    starters: ['Trace the canonical arc.', 'What doctrine is actually at stake?', 'Show me the already / not yet tension.'],
  },
  homiletical: {
    icon: '◈',
    label: 'HOMILETICAL',
    promise: 'Text-driven shape, clarity, transitions, application, and landing.',
    starters: ['Sharpen this into a text-driven outline.', 'Where will people stop following me?', 'How should this text land on real people?'],
  },
  scholar: {
    icon: 'λ',
    label: 'SCHOLAR',
    promise: 'The strongest reading, the strongest objection, and the evidence between them.',
    starters: ['Give me the strongest counter-reading.', 'What evidence would decide this?', 'Audit the whole sermon logic.'],
  },
}

function messageError(value: unknown) {
  return value instanceof Error ? value.message : 'The agent could not answer right now.'
}

export function TabletAgentPanel({
  studyId,
  agent,
  threads,
  onThreadsChange,
  onPushToManuscript,
  onClose,
}: {
  studyId: string
  agent: TabletAgentRole
  threads: TabletAgentThreads
  onThreadsChange: (threads: TabletAgentThreads) => void
  onPushToManuscript: (content: string, agent: TabletAgentRole) => void
  onClose: () => void
}) {
  const [consented, setConsented] = useState(false)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null)
  const meta = TABLET_AGENT_META[agent]
  const messages = threads[agent]
  const lastAnswer = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant')?.content || '', [messages])

  const send = async (starter?: string) => {
    const prompt = (starter || question).trim()
    if (!prompt || busy || !consented) return
    const prior = messages.slice(-12)
    const userMessage: TabletAgentMessage = { role: 'user', content: prompt }
    const waitingThreads = { ...threads, [agent]: [...messages, userMessage] }
    onThreadsChange(waitingThreads)
    setQuestion('')
    setError(null)
    setBusy(true)
    try {
      const result = await askSermonAgent({ studyId, agent, question: prompt, history: prior })
      onThreadsChange({
        ...waitingThreads,
        [agent]: [...waitingThreads[agent], { role: 'assistant', content: result.answer }],
      })
    } catch (caught) {
      setError(messageError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className={`tablet-agent-panel agent-${agent}`}>
      <header>
        <div><span>{meta.icon}</span><section><small>SPECIALIST AGENT</small><strong>{meta.label}</strong></section></div>
        <button onClick={onClose}>×</button>
      </header>
      {!consented ? <div className="tablet-agent-consent">
        <span>BEFORE THIS AGENT OPENS</span>
        <h2>Your study stays yours.</h2>
        <p>Agent questions send this passage’s verified study, your question, and the recent conversation in this agent to Anthropic for an answer. The manuscript itself is not sent. Nothing posts, publishes, or leaves the workspace unless you tap a control.</p>
        <button onClick={() => setConsented(true)}>I AGREE · OPEN {meta.label}</button>
      </div> : <>
        <div className="tablet-agent-purpose">{meta.promise}</div>
        {!messages.length && <div className="tablet-agent-starters">
          {meta.starters.map((starter) => <button key={starter} onClick={() => { void send(starter) }}>{starter}</button>)}
        </div>}
        <div className="tablet-agent-messages">
          {messages.map((message, index) => <article key={`${message.role}-${index}`} className={message.role}>
            <p>{message.content}</p>
            <div>
              <button onClick={() => {
                void copyToClipboard(message.content)
                  .then(() => setCopiedMessage(index))
                  .catch(() => setError('Long-press the answer to copy it.'))
              }}>{copiedMessage === index ? 'COPIED' : 'COPY'}</button>
              {message.role === 'assistant' && <button onClick={() => onPushToManuscript(message.content, agent)}>SEND TO MANUSCRIPT</button>}
              {message.role === 'assistant' && <ReportAiOutput studyId={studyId} surface="specialist" content={`${agent.toUpperCase()}\n\n${message.content}`} />}
            </div>
          </article>)}
          {busy && <article className="assistant thinking">Working from the verified study…</article>}
        </div>
        {error && <div className="tablet-agent-error">{error}</div>}
        {lastAnswer && <button className="tablet-agent-push" onClick={() => onPushToManuscript(lastAnswer, agent)}>SEND LAST ANSWER TO MANUSCRIPT</button>}
        <div className="tablet-agent-composer">
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} autoCorrect="on" placeholder={`Ask the ${meta.label.toLowerCase()} agent…`} />
          <button onClick={() => { void send() }} disabled={!question.trim() || busy}>↑</button>
        </div>
      </>}
    </aside>
  )
}
