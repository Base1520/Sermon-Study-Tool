import { useState } from 'react'
import { reportAiOutput } from './api'

export function ReportAiOutput({
  studyId,
  surface,
  content,
}: {
  studyId: string
  surface: 'quick-study' | 'guided-study' | 'ask' | 'specialist'
  content: string
}) {
  const [state, setState] = useState<'idle' | 'confirm' | 'sending' | 'sent' | 'error'>('idle')

  if (state === 'sent') return <span className="mobile-ai-report-sent">REPORTED · THANK YOU</span>
  if (state === 'confirm' || state === 'sending' || state === 'error') {
    return (
      <span className="mobile-ai-report-confirm">
        <small>{state === 'error' ? 'REPORT FAILED · TRY AGAIN?' : 'SEND THIS OUTPUT TO BASE1520 FOR REVIEW?'}</small>
        <button onClick={() => setState('idle')} disabled={state === 'sending'}>CANCEL</button>
        <button onClick={() => {
          setState('sending')
          void reportAiOutput({ studyId, surface, content })
            .then(() => setState('sent'))
            .catch(() => setState('error'))
        }} disabled={state === 'sending'}>{state === 'sending' ? 'SENDING…' : 'SEND REPORT'}</button>
      </span>
    )
  }
  return <button className="mobile-ai-report" onClick={() => setState('confirm')}>REPORT AI OUTPUT</button>
}
