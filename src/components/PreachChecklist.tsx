import { useState, useEffect } from 'react'
import { BASE, FONT } from '../theme'
import { OpsPanel } from './OpsPanel'
import type { PhrasingAnalysis } from '../types/phrasing'

const CARD  = '#2c3820'
const GOLD  = BASE.gold
const KHAKI = BASE.khaki
const TEXT  = '#d8d0b8'
const RED   = '#c07070'

interface Props {
  analysis: (PhrasingAnalysis & { authorIntent?: { doing: string; inOrderThat: string } | null; questionsToConsider?: string[] }) | null
  apiKey: string
  savedDraft?: string
  onClose: () => void
}

interface Step {
  id: string
  label: string
  hint: string
  auto?: (a: NonNullable<Props['analysis']>, draft?: string) => boolean
}

// The exegesis discipline — auto-checked where the tool can verify it,
// hand-checked where only the pastor can.
const STEPS: Step[] = [
  { id: 'read',      label: 'Read the text in context — multiple translations', hint: 'Parallel Texts tile · read the surrounding chapter, not just the passage' },
  { id: 'genre',     label: 'Genre established + reading rules applied',        hint: 'Genre card on the desk', auto: a => Boolean(a.genre) },
  { id: 'structure', label: 'Grammatical structure analyzed',                   hint: 'The phrasing tree — main clauses vs. subordinate', auto: a => (a.phrases?.length ?? 0) > 0 },
  { id: 'words',     label: 'Key word studies done',                            hint: 'Click any word in the tree for original-language study' },
  { id: 'culture',   label: 'Historical-cultural background reviewed',          hint: 'Cultural notes + the map', auto: a => (a.culturalNotes?.length ?? 0) > 0 },
  { id: 'canon',     label: 'Cross-references + canonical connections explored', hint: '+ cross-refs bar under the desk' },
  { id: 'intent',    label: "Author's intent stated — task + purpose",          hint: 'What is the author DOING, in order that WHAT?', auto: a => Boolean(a.authorIntent) },
  { id: 'bridge',    label: 'Application bridged to YOUR congregation',         hint: 'Concrete and specific — what changes on Tuesday?' },
  { id: 'watchdog',  label: 'Eisegesis watchdog run on the manuscript',         hint: 'Draft tile → FLAG CHECK before you finalize' },
]

interface Brief {
  situation: string; mission: string; execution: string
  sustainment: string; commandSignal: string
}

export function PreachChecklist({ analysis, apiKey, savedDraft, onClose }: Props) {
  const storageKey = analysis ? `checklist-${analysis.reference}` : null
  const [manual, setManual] = useState<Record<string, boolean>>({})
  const [brief, setBrief] = useState<Brief | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)

  useEffect(() => {
    if (!storageKey) return
    try { setManual(JSON.parse(localStorage.getItem(storageKey) ?? '{}')) } catch { setManual({}) }
  }, [storageKey])

  function toggle(id: string) {
    const next = { ...manual, [id]: !manual[id] }
    setManual(next)
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next))
  }

  const isDone = (s: Step) =>
    Boolean(manual[s.id]) || Boolean(analysis && s.auto?.(analysis, savedDraft))

  const doneCount = analysis ? STEPS.filter(isDone).length : 0
  const allDone = doneCount === STEPS.length
  const questions = analysis?.questionsToConsider ?? []

  async function generateBrief() {
    if (!analysis || briefLoading) return
    setBriefLoading(true); setBriefError(null)
    try {
      const b = await (window as any).electronAPI.missionBrief({ analysis, draft: savedDraft ?? '', apiKey })
      setBrief(b)
    } catch (e: any) {
      setBriefError(e?.message ?? 'Brief generation failed')
    } finally { setBriefLoading(false) }
  }

  function copyBrief() {
    if (!brief) return
    navigator.clipboard.writeText(
      `MISSION BRIEF — ${analysis?.reference}\n\n1. SITUATION\n${brief.situation}\n\n2. MISSION\n${brief.mission}\n\n3. EXECUTION\n${brief.execution}\n\n4. SUSTAINMENT\n${brief.sustainment}\n\n5. COMMAND & SIGNAL\n${brief.commandSignal}`
    )
  }

  return (
    <OpsPanel
      title="FINAL CLEARANCE"
      tag="PRE-PREACH CHECKS · GO/NO-GO"
      status={analysis
        ? { label: `${analysis.reference} · ${doneCount}/${STEPS.length}`, color: allDone ? GOLD : KHAKI }
        : undefined}
      width={520}
      onClose={onClose}
    >
      {!analysis ? (
        <div style={{ padding: 40, fontSize: 9.5, color: `${KHAKI}60`, textAlign: 'center', lineHeight: 1.8, fontFamily: FONT.mono }}>
          Analyze a passage first — the checklist tracks your exegesis for the text on the desk.
        </div>
      ) : (
        <div style={{ padding: '14px 18px 28px', fontFamily: FONT.mono }}>

          {/* Progress */}
          <div style={{ height: 4, background: `${KHAKI}18`, borderRadius: 2, marginBottom: 6 }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: allDone ? GOLD : `${GOLD}88`,
              width: `${(doneCount / STEPS.length) * 100}%`, transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: 9, color: allDone ? GOLD : `${KHAKI}55`, letterSpacing: '0.1em', marginBottom: 16, fontFamily: FONT.type }}>
            {allDone ? '✓ CLEARED TO PREACH' : 'GO / NO-GO — WORK THE STEPS'}
          </div>

          {/* Author's intent hero */}
          {analysis.authorIntent && (
            <div style={{
              background: `${GOLD}0c`, border: `1px solid ${GOLD}40`,
              borderRadius: 10, padding: '11px 14px', marginBottom: 16,
            }}>
              <div style={{ fontFamily: FONT.display, fontSize: 13, letterSpacing: '0.1em', color: GOLD, marginBottom: 5 }}>
                AUTHOR'S INTENT — TASK + PURPOSE
              </div>
              <div style={{ fontSize: 12, fontFamily: FONT.serif, color: TEXT, lineHeight: 1.65 }}>
                {analysis.authorIntent.doing}
              </div>
              <div style={{ fontSize: 11.5, fontFamily: FONT.serif, fontStyle: 'italic', color: GOLD, lineHeight: 1.6, marginTop: 4 }}>
                …{analysis.authorIntent.inOrderThat}
              </div>
            </div>
          )}

          {/* Steps */}
          <div style={{ fontFamily: FONT.display, fontSize: 14, letterSpacing: '0.1em', color: KHAKI, marginBottom: 8 }}>
            EXEGESIS STEPS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 20 }}>
            {STEPS.map(step => {
              const autoDone = Boolean(analysis && step.auto?.(analysis, savedDraft))
              const done = isDone(step)
              return (
                <button key={step.id}
                  onClick={() => !autoDone && toggle(step.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left',
                    background: done ? `${GOLD}0a` : CARD,
                    border: `1px solid ${done ? GOLD + '40' : KHAKI + '25'}`,
                    borderRadius: 8, padding: '9px 12px', width: '100%',
                    cursor: autoDone ? 'default' : 'pointer', transition: 'all 0.12s',
                    fontFamily: FONT.mono,
                  }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                    border: `1px solid ${done ? GOLD : KHAKI + '50'}`,
                    background: done ? `${GOLD}25` : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, color: GOLD,
                  }}>
                    {done ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 9.5, color: done ? TEXT : `${TEXT}cc`, lineHeight: 1.4 }}>
                      {step.label}
                      {autoDone && <span style={{ fontSize: 6, color: `${GOLD}80`, marginLeft: 6, letterSpacing: '0.08em' }}>AUTO</span>}
                    </span>
                    <span style={{ display: 'block', fontSize: 7.5, color: `${KHAKI}55`, marginTop: 2, lineHeight: 1.4 }}>
                      {step.hint}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* Think-through questions */}
          {questions.length > 0 && (
            <>
              <div style={{ fontFamily: FONT.display, fontSize: 14, letterSpacing: '0.1em', color: KHAKI, marginBottom: 8 }}>
                THINK IT THROUGH — BEFORE SUNDAY
              </div>
              <div style={{
                background: CARD, border: `1px solid ${KHAKI}25`, borderRadius: 10,
                padding: '11px 14px', marginBottom: 20,
              }}>
                {questions.map((q, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, marginBottom: i === questions.length - 1 ? 0 : 9 }}>
                    <span style={{ fontSize: 8, color: GOLD, flexShrink: 0, marginTop: 2 }}>{i + 1}.</span>
                    <span style={{ fontSize: 11, fontFamily: FONT.serif, color: TEXT, lineHeight: 1.6 }}>{q}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Mission Brief */}
          <div style={{ fontFamily: FONT.display, fontSize: 14, letterSpacing: '0.1em', color: KHAKI, marginBottom: 8 }}>
            MISSION BRIEF — 5 PARAGRAPHS
          </div>
          {!brief && (
            <button onClick={generateBrief} disabled={briefLoading}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8, cursor: briefLoading ? 'default' : 'pointer',
                background: briefLoading ? `${GOLD}30` : GOLD, border: 'none', color: BASE.bg,
                fontSize: 15, letterSpacing: '0.12em',
                fontFamily: FONT.display,
              }}>
              {briefLoading ? 'DRAFTING BRIEF…' : '✦ GENERATE MISSION BRIEF'}
            </button>
          )}
          {briefError && (
            <div style={{ fontSize: 8.5, color: RED, marginTop: 8 }}>⚠ {briefError}</div>
          )}
          {brief && (
            <div style={{ background: CARD, border: `1px solid ${GOLD}35`, borderRadius: 10, padding: '13px 16px' }}>
              {([
                ['1. SITUATION', brief.situation],
                ['2. MISSION', brief.mission],
                ['3. EXECUTION', brief.execution],
                ['4. SUSTAINMENT', brief.sustainment],
                ['5. COMMAND & SIGNAL', brief.commandSignal],
              ] as [string, string][]).map(([h, body]) => (
                <div key={h} style={{ marginBottom: 11 }}>
                  <div style={{ fontFamily: FONT.display, fontSize: 13, letterSpacing: '0.1em', color: GOLD, marginBottom: 3 }}>{h}</div>
                  <div style={{ fontSize: 11.5, fontFamily: FONT.serif, color: TEXT, lineHeight: 1.65 }}>{body}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={copyBrief} style={briefBtn}>COPY</button>
                <button onClick={generateBrief} style={briefBtn}>{briefLoading ? '…' : 'REGENERATE'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </OpsPanel>
  )
}

const briefBtn: React.CSSProperties = {
  flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer',
  background: `${BASE.gold}14`, border: `1px solid ${BASE.gold}40`, color: BASE.gold,
  fontSize: 12, letterSpacing: '0.12em', fontFamily: FONT.display,
}
