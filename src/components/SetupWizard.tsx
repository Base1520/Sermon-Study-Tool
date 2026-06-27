import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'

interface Props {
  onComplete: () => void
}

interface Answer { key: string; question: string; value: string; placeholder: string; hint: string }

const QUESTIONS: Answer[] = [
  {
    key: 'identity',
    question: 'Who are you?',
    placeholder: 'e.g. John Smith — Lead Pastor, Grace Community Church, Austin TX. Been pastoring for 12 years.',
    hint: 'Name, title, church, location. The agents use this to personalize every response.',
    value: '',
  },
  {
    key: 'congregation',
    question: 'Describe your congregation.',
    placeholder: 'e.g. ~200 adults, suburban, theologically mixed. Many come from Catholic or mainline backgrounds. Majority are 30s–50s with young families. Spiritually hungry but biblically undertaught.',
    hint: 'Size, demographics, spiritual maturity, background. This shapes how the agents suggest application.',
    value: '',
  },
  {
    key: 'theology',
    question: 'What is your theological tradition?',
    placeholder: 'e.g. Reformed Baptist. Holds to the 1689 London Baptist Confession. Affirms the five solas, covenant theology, and believers\' baptism. Generous on secondary issues.',
    hint: 'Tradition, confession, distinctive convictions. Agents won\'t recommend approaches that conflict with your theology.',
    value: '',
  },
  {
    key: 'preachingMethod',
    question: 'How do you preach?',
    placeholder: 'e.g. Expository, book-by-book. Preaches 35–40 minutes. Uses 3 main points loosely. Strong on explanation, weaker on illustration. Works from a full manuscript but preaches conversationally.',
    hint: 'Method, length, structure, strengths, weaknesses. The homiletical agent builds sermons that fit your actual style.',
    value: '',
  },
  {
    key: 'hermeneutics',
    question: 'How do you approach the Bible?',
    placeholder: 'e.g. Historical-grammatical method. Reads the NT through the lens of Second Temple Judaism. Christocentric — all roads lead to the gospel. Careful about over-allegorizing OT narrative.',
    hint: 'Interpretive convictions and guardrails. The exegetical agent stays within your hermeneutical boundaries.',
    value: '',
  },
]

export function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const q = QUESTIONS[step]
  const isLast = step === QUESTIONS.length - 1
  const progress = (step / QUESTIONS.length) * 100

  function handleNext() {
    if (isLast) {
      finish()
    } else {
      setStep(s => s + 1)
    }
  }

  async function finish() {
    setSaving(true)
    try {
      const existing = await (window as any).electronAPI.profileGet()
      const updated = {
        ...existing,
        identity: answers.identity ?? existing.identity ?? '',
        congregation: answers.congregation ?? existing.congregation ?? '',
        theology: answers.theology ?? existing.theology ?? '',
        preachingMethod: answers.preachingMethod ?? existing.preachingMethod ?? '',
        hermeneutics: answers.hermeneutics ?? existing.hermeneutics ?? '',
      }
      await (window as any).electronAPI.profileSave(updated)
    } catch { /* silent */ }
    onComplete()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(10,12,9,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 560, padding: '0 24px' }}>
        {/* Progress bar */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.14em' }}>
              SCHOLAR SETUP — {step + 1} OF {QUESTIONS.length}
            </span>
            <button
              onClick={onComplete}
              style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}
            >
              SKIP FOR NOW
            </button>
          </div>
          <div style={{ height: 2, background: BASE.borderDim, borderRadius: 2, overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${progress + (1 / QUESTIONS.length) * 100}%` }}
              transition={{ duration: 0.4 }}
              style={{ height: '100%', background: BASE.gold, borderRadius: 2 }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            {/* Question */}
            <div style={{ marginBottom: 6 }}>
              <h2 style={{
                fontFamily: 'Crimson Pro, serif', fontSize: 28, color: BASE.bone,
                fontWeight: 400, margin: 0, lineHeight: 1.2,
              }}>
                {q.question}
              </h2>
            </div>
            <p style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.steel,
              lineHeight: 1.6, margin: '8px 0 20px',
            }}>
              {q.hint}
            </p>

            <textarea
              autoFocus
              value={answers[q.key] ?? ''}
              onChange={e => setAnswers(a => ({ ...a, [q.key]: e.target.value }))}
              placeholder={q.placeholder}
              rows={4}
              style={{
                width: '100%', background: `${BASE.bgCard}cc`,
                border: `1px solid ${BASE.borderGold}`,
                borderRadius: 12, padding: '14px 16px',
                fontSize: 14, color: BASE.bone,
                fontFamily: 'Crimson Pro, serif', lineHeight: 1.65,
                outline: 'none', resize: 'none', boxSizing: 'border-box',
              }}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleNext() }}
            />
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, marginTop: 6, letterSpacing: '0.08em', opacity: 0.5 }}>
              ⌘ + enter to continue
            </div>
          </motion.div>
        </AnimatePresence>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 28, gap: 10 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                padding: '11px 22px', borderRadius: 10, cursor: 'pointer',
                background: 'none', border: `1px solid ${BASE.borderDim}`,
                color: BASE.steel, fontFamily: 'Crimson Pro, serif', fontSize: 14,
              }}
            >
              ← Back
            </button>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleNext}
            disabled={saving}
            style={{
              padding: '11px 28px', borderRadius: 10, cursor: 'pointer',
              background: BASE.goldMid, border: `1px solid ${BASE.borderGold}`,
              color: BASE.gold, fontFamily: 'Crimson Pro, serif', fontSize: 14,
              letterSpacing: '0.04em',
              boxShadow: `0 0 20px ${BASE.gold}22`,
            }}
          >
            {saving ? 'Saving…' : isLast ? 'Finish Setup →' : 'Next →'}
          </motion.button>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 24 }}>
          {QUESTIONS.map((_, i) => (
            <motion.div
              key={i}
              animate={{ width: i === step ? 20 : 6, background: i <= step ? BASE.gold : BASE.borderDim }}
              transition={{ duration: 0.3 }}
              style={{ height: 4, borderRadius: 2 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}
