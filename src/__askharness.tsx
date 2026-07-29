/* TEMPORARY VERIFICATION HARNESS — deleted immediately after screenshotting.
   Not imported by the app. Renders the two new surfaces against fixtures. */
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { BASE } from './theme'
import { SituationCard } from './components/SituationCard'
import { AskPanel, ASK_ICON } from './components/AskPanel'
import type { PlainReadDoc, PhrasingAnalysis, PlainAskResult } from './types/phrasing'

const situation = {
  when: 'c. AD 62, written from house arrest in Rome',
  where: 'To Philippi — a Roman colony in Macedonia, settled with army veterans',
  pressure:
    'The people receiving this had watched their founder get jailed in their own city, and now he was ' +
    'in chains again, a thousand miles away, with a capital trial pending. They had sent money and a ' +
    'man to help him, and the man had nearly died. They were being leaned on locally for refusing the ' +
    'civic religion, and two women near the centre of the church were not speaking.',
  soWhat:
    'Every line about joy in this letter is written by a man who may be executed, to people who are ' +
    'losing standing in their own town. It is not a mood. It is a position taken under load.',
  confidence: 'reconstructed' as const,
  vaultSourced: true,
}

const doc = {
  reference: 'Philippians 4:10-13',
  expandedReference: 'Philippians 4:10-13',
  situation,
  handoff:
    'If the pressure in your own life is the reason this passage caught you, that is worth saying out ' +
    'loud to somebody who knows you.',
  meaning: { misread: { claim: 'I can do anything I set my mind to' } },
  outline: {
    units: [
      { ref: 'vv. 10-11', heading: 'The thanks, and the correction', logic: null },
      { ref: 'vv. 12-13', heading: 'What was learned, and where the strength comes from', logic: 'restatement, then the ground under it' },
    ],
  },
} as unknown as PlainReadDoc

const analysis = {
  reference: 'Philippians 4:10-13',
  canonicalContext: { keyWords: ['contentment', 'learned'] },
} as unknown as PhrasingAnalysis

/* Stubbed bridge: first question refuses as personal-counsel, later ones answer.
   The 2.5s delay is there so the pending state can be seen. */
let n = 0
;(window as any).electronAPI = {
  plainAsk: (_p: unknown): Promise<PlainAskResult> =>
    new Promise(res => setTimeout(() => {
      n += 1
      if (n === 1) {
        res({
          answer: null,
          refusal: { kind: 'personal-counsel', message: '' },
          suggested: null,
        })
      } else {
        res({
          answer:
            'The word behind "content" is not a feeling word. It described a city or a person that ' +
            'needed no supply from outside to keep functioning.\n\nThat is why the next line matters: ' +
            'the self-sufficiency is explicitly borrowed, not native.',
          refusal: null,
          suggested: ['Where else does this word appear?', 'What does "learned" imply about the timeline?'],
        })
      }
    }, 2500)),
}

const RAIL = ['⌖', '‖', '⌥', '⚯', '♛', '◷', '⌂', '⌘']

function Harness() {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ background: BASE.bg, minHeight: '100vh', color: BASE.bone }}>
      {/* glyph parity check: the new icon beside the eight it has to match */}
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BASE.border}`, display: 'flex', gap: 22, alignItems: 'center' }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.18em' }}>GLYPH PARITY</span>
        {RAIL.map(g => <span key={g} style={{ fontSize: 22, color: BASE.steel }}>{g}</span>)}
        <span style={{ fontSize: 22, color: BASE.gold }}>{ASK_ICON}</span>
        <button onClick={() => setOpen(o => !o)} style={{ marginLeft: 'auto', padding: '6px 14px', background: 'transparent', border: `1px solid ${BASE.border}`, color: BASE.khaki, fontFamily: 'JetBrains Mono', fontSize: 8, cursor: 'pointer' }}>TOGGLE ASK</button>
      </div>

      {/* document column + docked ask panel, in the same relative frame the app uses */}
      <div style={{ position: 'relative', height: 'calc(100vh - 52px)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: 780, margin: '0 auto', padding: '34px 44px 120px' }}>
            <SituationCard situation={situation} />
            <SituationCard situation={{ ...situation, confidence: 'documented', when: 'c. AD 57, from Corinth', soWhat: 'A documented setting gets no footnote — the word in the header carries it.' }} />
            <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 17, lineHeight: 1.85, color: BASE.boneMid }}>
              I rejoiced in the Lord greatly that now at length you have revived your concern for me.
              You were indeed concerned for me, but you had no opportunity. Not that I am speaking of
              being in need, for I have learned in whatever situation I am to be content.
            </div>
          </div>
        </div>
        {open && (
          <AskPanel doc={doc} analysis={analysis} apiKey="test" reference="Philippians 4:10-13" onClose={() => setOpen(false)} />
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
