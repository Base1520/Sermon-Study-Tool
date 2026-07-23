import { BASE, FONT } from '../theme'

// Compact sidebar intel cards — the analysis anchors that deserve to be
// always-visible while studying: the author's intent, and the questions
// worth wrestling with before Sunday.

export function IntentCard({ intent }: { intent?: { doing: string; inOrderThat: string } | null }) {
  if (!intent) return null
  return (
    <div style={{
      margin: '10px 12px 0', padding: '10px 12px',
      background: `${BASE.gold}0c`, border: `1px solid ${BASE.gold}35`,
      borderRadius: 10, flexShrink: 0,
    }}>
      <div style={{ fontFamily: FONT.display, fontSize: 12, letterSpacing: '0.12em', color: BASE.gold, marginBottom: 5 }}>
        AUTHOR'S INTENT
      </div>
      <div style={{ fontFamily: FONT.serif, fontSize: 12, color: BASE.bone, lineHeight: 1.55 }}>
        {intent.doing}
      </div>
      <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 11.5, color: BASE.gold, lineHeight: 1.5, marginTop: 4 }}>
        …{intent.inOrderThat}
      </div>
    </div>
  )
}

export function QuestionsCard({ questions }: { questions?: string[] }) {
  if (!questions?.length) return null
  return (
    <div style={{
      margin: '10px 12px 0', padding: '10px 12px',
      background: `${BASE.khaki}08`, border: `1px solid ${BASE.borderDim}`,
      borderRadius: 10, flexShrink: 0,
    }}>
      <div style={{ fontFamily: FONT.display, fontSize: 12, letterSpacing: '0.12em', color: BASE.khaki, marginBottom: 7 }}>
        THINK IT THROUGH
      </div>
      {questions.slice(0, 7).map((q, i) => (
        <div key={i} style={{ display: 'flex', gap: 7, marginBottom: i === Math.min(questions.length, 7) - 1 ? 0 : 7 }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 7, color: BASE.gold, flexShrink: 0, marginTop: 3 }}>{i + 1}.</span>
          <span style={{ fontFamily: FONT.serif, fontSize: 11.5, color: BASE.boneMid, lineHeight: 1.5 }}>{q}</span>
        </div>
      ))}
    </div>
  )
}
