import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'motion/react'
import { PHASES } from '../covenant/phases'
import { BASE } from '../theme'
import { friendlyApiErrorText } from '../lib/apiErrors'
import type {
  GroupGuide as GroupGuideData,
  GroupGuideAnswerClass,
  GroupGuideQuestion,
  PhrasingAnalysis,
  PlainReadDoc,
} from '../types/phrasing'

interface Props {
  analysis: PhrasingAnalysis
  plainDoc: PlainReadDoc | null
  apiKey: string
  onClose: () => void
  onOpenSettings?: () => void
}

type View = 'participant' | 'leader' | 'edit'

const ANSWER_LABELS: Record<GroupGuideAnswerClass, string> = {
  TEXT_EXPLICIT: 'TEXT',
  INTERPRETATION_BOUNDED: 'BOUNDED INTERPRETATION',
  DISPUTED: 'DISPUTED',
  PASTORAL_OPEN: 'PASTORAL — NO SINGLE ANSWER',
}

function copyGuide(guide: GroupGuideData): GroupGuideData {
  return JSON.parse(JSON.stringify(guide))
}

function Button({
  children,
  onClick,
  disabled = false,
  primary = false,
  title,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        border: `1px solid ${primary ? BASE.gold : BASE.borderGold}`,
        background: primary ? BASE.gold : `${BASE.gold}0d`,
        color: primary ? BASE.bg : BASE.gold,
        borderRadius: 7,
        minHeight: 34,
        padding: '7px 12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'Saira, sans-serif',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
      }}
    >
      {children}
    </button>
  )
}

function AnswerKey({ question }: { question: GroupGuideQuestion }) {
  const key = question.leaderKey
  return (
    <div style={{
      marginTop: 10,
      padding: '12px 14px',
      background: 'rgba(103,112,79,0.12)',
      borderLeft: `3px solid ${key.answerClass === 'DISPUTED' ? BASE.gold : BASE.moss}`,
      borderRadius: '0 8px 8px 0',
    }}>
      <div style={{
        fontFamily: 'Saira, sans-serif',
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: '0.13em',
        color: key.answerClass === 'DISPUTED' ? BASE.gold : BASE.khaki,
        marginBottom: 8,
      }}>
        {ANSWER_LABELS[key.answerClass]}
      </div>

      <KeyLine
        label={key.conciseAnswer ? 'Leader answer' : 'Leader aim'}
        text={key.conciseAnswer ?? 'There is no single personal answer. Keep the response tied to the passage.'}
      />
      <KeyLine label="Textual evidence" text={key.textualEvidence.join(' · ')} />
      {key.acceptableRange.length > 0 && (
        <KeyLine label="Faithful range" text={key.acceptableRange.join(' · ')} />
      )}
      {key.disputedViews.length > 0 && (
        <div style={{ marginTop: 9, display: 'grid', gap: 7 }}>
          {key.disputedViews.map((view, index) => (
            <div key={`${question.id}-view-${index}`} style={{
              padding: '8px 10px',
              border: `1px solid ${BASE.borderDim}`,
              background: `${BASE.bg}88`,
              borderRadius: 6,
            }}>
              <div style={{ color: BASE.bone, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12.5, lineHeight: 1.5 }}>
                <strong style={{ color: BASE.gold }}>{view.view}</strong>
                {view.supportingEvidence.length ? ` — ${view.supportingEvidence.join(' · ')}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {key.answerLimits.length > 0 && (
        <KeyLine label="Do not claim" text={key.answerLimits.join(' · ')} warning />
      )}
      {key.pastoralGuidance && (
        <KeyLine label="Facilitation" text={key.pastoralGuidance} />
      )}
    </div>
  )
}

function KeyLine({ label, text, warning = false }: { label: string; text: string; warning?: boolean }) {
  return (
    <div style={{
      marginTop: 6,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 12.5,
      lineHeight: 1.55,
      color: warning ? '#d88a78' : BASE.boneMid,
    }}>
      <strong style={{ color: warning ? '#d88a78' : BASE.bone }}>{label}:</strong> {text}
    </div>
  )
}

function QuestionEditor({
  question,
  onChange,
}: {
  question: GroupGuideQuestion
  onChange: (next: GroupGuideQuestion) => void
}) {
  return (
    <div style={{
      border: `1px solid ${BASE.borderGold}`,
      background: `${BASE.bg}aa`,
      borderRadius: 10,
      padding: 14,
    }}>
      <div style={{
        fontFamily: 'Saira, sans-serif',
        color: BASE.gold,
        fontSize: 9,
        letterSpacing: '0.12em',
        marginBottom: 7,
      }}>
        {question.phase.toUpperCase()} · {question.passageAnchors.join(', ')}
      </div>
      <label style={{ display: 'block' }}>
        <span style={labelStyle}>Participant question</span>
        <textarea
          value={question.participantPrompt}
          onChange={(event) => onChange({ ...question, participantPrompt: event.target.value })}
          rows={3}
          style={fieldStyle}
        />
      </label>
      {question.leaderKey.answerClass !== 'PASTORAL_OPEN' && (
        <label style={{ display: 'block', marginTop: 10 }}>
          <span style={labelStyle}>Leader answer</span>
          <textarea
            value={question.leaderKey.conciseAnswer ?? ''}
            onChange={(event) => onChange({
              ...question,
              leaderKey: { ...question.leaderKey, conciseAnswer: event.target.value },
            })}
            rows={4}
            style={fieldStyle}
          />
        </label>
      )}
      <label style={{ display: 'block', marginTop: 10 }}>
        <span style={labelStyle}>Facilitation note</span>
        <textarea
          value={question.leaderKey.pastoralGuidance ?? ''}
          onChange={(event) => onChange({
            ...question,
            leaderKey: { ...question.leaderKey, pastoralGuidance: event.target.value || null },
          })}
          rows={3}
          style={fieldStyle}
        />
      </label>
    </div>
  )
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'Saira, sans-serif',
  fontSize: 9,
  color: BASE.khaki,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 5,
}

const fieldStyle: CSSProperties = {
  width: '100%',
  resize: 'vertical',
  border: `1px solid ${BASE.border}`,
  borderRadius: 7,
  padding: '9px 10px',
  background: BASE.bgCard,
  color: BASE.bone,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  lineHeight: 1.5,
  userSelect: 'text',
}

export function GroupGuide({ analysis, plainDoc, apiKey, onClose, onOpenSettings }: Props) {
  const [guide, setGuide] = useState<GroupGuideData | null>(null)
  const [savedGuide, setSavedGuide] = useState<GroupGuideData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [view, setView] = useState<View>('participant')
  const [busy, setBusy] = useState<string | null>(null)
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const dialogRef = useRef<HTMLDivElement>(null)

  const loadOrBuild = useCallback(async (force = false) => {
    const api = (window as any).electronAPI
    setLoading(true)
    setError(null)
    try {
      if (!force) {
        const existing = await api.groupGuideLoad({ analysis })
        if (existing) {
          setGuide(existing)
          setSavedGuide(copyGuide(existing))
          return
        }
      }
      const generated = await api.groupGuideGenerate({
        analysis,
        plainDoc,
        apiKey,
        force,
      })
      setGuide(generated)
      setSavedGuide(copyGuide(generated))
      setStepIndex(0)
      setCompleted(new Set())
    } catch (caught: any) {
      setError(friendlyApiErrorText(caught))
    } finally {
      setLoading(false)
    }
  }, [analysis, apiKey, plainDoc])

  useEffect(() => {
    loadOrBuild()
  }, [loadOrBuild])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    dialog?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [onClose])

  const activePhase = PHASES[stepIndex]
  const activeStep = guide?.steps.find((step) => step.id === activePhase.id)
  const activeQuestions = useMemo(() => {
    if (!guide || !activeStep) return []
    const byId = new Map(guide.questions.map((question, index) => [question.id, { question, index }]))
    return activeStep.questionIds.map((id) => byId.get(id)).filter(Boolean) as Array<{
      question: GroupGuideQuestion
      index: number
    }>
  }, [activeStep, guide])

  const dirty = useMemo(
    () => Boolean(guide && savedGuide && JSON.stringify(guide) !== JSON.stringify(savedGuide)),
    [guide, savedGuide]
  )

  async function save() {
    if (!guide) return
    setBusy('save')
    setError(null)
    try {
      const saved = await (window as any).electronAPI.groupGuideSave({
        analysis,
        plainDoc,
        guide,
        apiKey,
      })
      setGuide(saved)
      setSavedGuide(copyGuide(saved))
      setView('leader')
    } catch (caught: any) {
      setError(friendlyApiErrorText(caught))
    } finally {
      setBusy(null)
    }
  }

  async function exportPdf(variant: 'participant' | 'leader') {
    if (!guide) return
    setBusy(`export-${variant}`)
    setError(null)
    try {
      await (window as any).electronAPI.groupGuideExportPdf({ guide, variant })
    } catch (caught: any) {
      setError(caught?.message ?? 'The PDF could not be created.')
    } finally {
      setBusy(null)
    }
  }

  function updateQuestion(index: number, next: GroupGuideQuestion) {
    if (!guide) return
    const questions = [...guide.questions]
    questions[index] = next
    setGuide({ ...guide, questions })
  }

  function markCurrentDone() {
    const next = new Set(completed)
    next.add(activePhase.id)
    setCompleted(next)
    if (stepIndex < PHASES.length - 1) setStepIndex(stepIndex + 1)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'grid',
        placeItems: 'center',
        padding: 22,
        background: 'rgba(4,5,3,0.82)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-guide-title"
        tabIndex={-1}
        initial={{ y: 16, scale: 0.985 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 16, scale: 0.985 }}
        style={{
          width: 'min(1120px, 96vw)',
          height: 'min(820px, 93vh)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: `1px solid ${BASE.borderGold}`,
          borderTop: `5px solid ${BASE.gold}`,
          borderRadius: 14,
          background: `linear-gradient(145deg, #202716 0%, ${BASE.bg} 60%)`,
          boxShadow: '0 30px 90px rgba(0,0,0,0.65)',
        }}
      >
        <header style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 18px',
          borderBottom: `1px solid ${BASE.borderDim}`,
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: 'Saira, sans-serif',
              color: BASE.gold,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.17em',
            }}>
              BASE 1520 · COVENANT GROUP GUIDE
            </div>
            <h1 id="group-guide-title" style={{
              margin: '3px 0 0',
              color: BASE.bone,
              fontFamily: 'Saira, sans-serif',
              fontSize: 21,
              lineHeight: 1.1,
            }}>
              {analysis.reference}
            </h1>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {guide?.verification?.status === 'verified' && (
              <span aria-live="polite" style={{
                fontFamily: 'Saira, sans-serif',
                fontSize: 8,
                letterSpacing: '0.1em',
                color: BASE.moss,
                border: `1px solid ${BASE.moss}66`,
                borderRadius: 12,
                padding: '4px 8px',
              }}>
                SOURCE CHECKED
              </span>
            )}
            <Button onClick={() => loadOrBuild(true)} disabled={loading || Boolean(busy)} title="Regenerate the whole verified guide">
              REBUILD
            </Button>
            <Button onClick={() => exportPdf('participant')} disabled={!guide || Boolean(busy)}>
              {busy === 'export-participant' ? 'BUILDING…' : 'PARTICIPANT PDF'}
            </Button>
            <Button onClick={() => exportPdf('leader')} disabled={!guide || Boolean(busy)}>
              {busy === 'export-leader' ? 'BUILDING…' : 'LEADER PDF'}
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close group guide"
              style={{
                width: 34,
                height: 34,
                borderRadius: 7,
                border: `1px solid ${BASE.borderDim}`,
                background: 'transparent',
                color: BASE.boneMid,
                cursor: 'pointer',
                fontSize: 18,
              }}
            >
              ×
            </button>
          </div>
        </header>

        <nav aria-label="COVENANT guide steps" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
          gap: 6,
          padding: '11px 14px',
          borderBottom: `1px solid ${BASE.borderDim}`,
          flexShrink: 0,
        }}>
          {PHASES.map((phase, index) => {
            const active = index === stepIndex
            const done = completed.has(phase.id)
            return (
              <button
                type="button"
                key={phase.id}
                onClick={() => setStepIndex(index)}
                aria-current={active ? 'step' : undefined}
                title={`${phase.letter} — ${phase.title}`}
                style={{
                  minHeight: 49,
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: `1px solid ${active ? BASE.gold : done ? `${BASE.moss}88` : BASE.borderDim}`,
                  background: active ? `${BASE.gold}18` : done ? `${BASE.moss}12` : 'transparent',
                  color: active ? BASE.gold : done ? BASE.moss : BASE.steel,
                  fontFamily: 'Saira, sans-serif',
                  display: 'grid',
                  placeItems: 'center',
                  alignContent: 'center',
                  gap: 1,
                }}
              >
                <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{phase.letter}</span>
                <span style={{ fontSize: 7, letterSpacing: '0.08em' }}>{index + 1}/8{done ? ' ✓' : ''}</span>
              </button>
            )
          })}
        </nav>

        {loading ? (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 30 }}>
            <div>
              <div style={{ color: BASE.gold, fontFamily: 'Saira, sans-serif', fontSize: 12, letterSpacing: '0.14em' }}>
                BUILDING THE COVENANT PATH
              </div>
              <p style={{ color: BASE.boneMid, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, lineHeight: 1.6, marginTop: 9 }}>
                Writing the guide, then checking every answer against the passage.
              </p>
            </div>
          </div>
        ) : error && !guide ? (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 30 }}>
            <div style={{ maxWidth: 520, textAlign: 'center' }}>
              <div style={{ color: BASE.red, fontFamily: 'Saira, sans-serif', letterSpacing: '0.12em' }}>GUIDE NOT READY</div>
              <p style={{ color: BASE.boneMid, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.6, margin: '10px 0 18px' }}>{error}</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                <Button onClick={() => loadOrBuild(true)} primary>TRY AGAIN</Button>
                {onOpenSettings && <Button onClick={onOpenSettings}>API SETTINGS</Button>}
              </div>
            </div>
          </div>
        ) : guide && activeStep ? (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px 0',
              flexShrink: 0,
            }}>
              {(['participant', 'leader', 'edit'] as View[]).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setView(mode)}
                  aria-pressed={view === mode}
                  style={{
                    border: 0,
                    borderBottom: `2px solid ${view === mode ? BASE.gold : 'transparent'}`,
                    padding: '7px 8px',
                    background: 'transparent',
                    color: view === mode ? BASE.gold : BASE.steel,
                    cursor: 'pointer',
                    fontFamily: 'Saira, sans-serif',
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: '0.11em',
                    textTransform: 'uppercase',
                  }}
                >
                  {mode}
                </button>
              ))}
              {dirty && (
                <span aria-live="polite" style={{ marginLeft: 6, color: BASE.khaki, fontFamily: 'Inter, sans-serif', fontSize: 11 }}>
                  Unsaved edits
                </span>
              )}
              {view === 'edit' && (
                <div style={{ marginLeft: 'auto' }}>
                  <Button onClick={save} disabled={!dirty || busy === 'save'} primary>
                    {busy === 'save' ? 'RECHECKING…' : 'RECHECK + SAVE'}
                  </Button>
                </div>
              )}
            </div>

            <main style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: '250px minmax(0, 1fr)',
              gap: 18,
              padding: '12px 16px 14px',
              overflow: 'hidden',
            }}>
              <aside style={{
                border: `1px solid ${BASE.borderDim}`,
                background: `${BASE.olive}66`,
                borderRadius: 11,
                padding: 16,
                overflowY: 'auto',
              }}>
                <div style={{
                  width: 54,
                  height: 54,
                  display: 'grid',
                  placeItems: 'center',
                  background: BASE.olive,
                  border: `1px solid ${BASE.borderGold}`,
                  color: BASE.gold,
                  borderRadius: 10,
                  fontFamily: 'Saira, sans-serif',
                  fontSize: 30,
                  fontWeight: 900,
                }}>
                  {activePhase.letter}
                </div>
                <div style={{ marginTop: 13, color: BASE.steel, fontFamily: 'Saira, sans-serif', fontSize: 8, letterSpacing: '0.12em' }}>
                  STEP {stepIndex + 1} OF 8
                </div>
                <h2 style={{ margin: '4px 0 0', color: BASE.bone, fontFamily: 'Saira, sans-serif', fontSize: 20, lineHeight: 1.15 }}>
                  {activePhase.title}
                </h2>
                <p style={{ color: BASE.gold, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, lineHeight: 1.55, fontStyle: 'italic', marginTop: 10 }}>
                  {activePhase.question}
                </p>
                <div style={{ height: 1, background: BASE.borderGold, margin: '14px 0' }} />
                <p style={{ color: BASE.boneMid, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13.5, lineHeight: 1.62 }}>
                  {activeStep.summary}
                </p>
                {stepIndex === 0 && (
                  <div style={{
                    marginTop: 15,
                    padding: 10,
                    border: `1px solid ${BASE.borderDim}`,
                    borderRadius: 7,
                    color: BASE.khaki,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: 11.5,
                    lineHeight: 1.5,
                  }}>
                    Open with: {guide.opening.prompt}<br /><br />
                    Anyone may pass on a personal question.
                  </div>
                )}
                {stepIndex === PHASES.length - 1 && (
                  <div style={{
                    marginTop: 15,
                    padding: 10,
                    borderLeft: `3px solid ${BASE.gold}`,
                    color: BASE.boneMid,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: 11.5,
                    lineHeight: 1.5,
                  }}>
                    <strong style={{ color: BASE.gold }}>Pray the text:</strong><br />
                    {guide.prayerPrompt}
                  </div>
                )}
              </aside>

              <section aria-live="polite" style={{
                minWidth: 0,
                overflowY: 'auto',
                paddingRight: 5,
              }}>
                {activeQuestions.length === 0 ? (
                  <div style={{
                    minHeight: 220,
                    display: 'grid',
                    placeItems: 'center',
                    border: `1px dashed ${BASE.borderGold}`,
                    borderRadius: 11,
                    color: BASE.steel,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    textAlign: 'center',
                    padding: 30,
                  }}>
                    This step prepares the next discussion block. Read the summary, then move forward.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {activeQuestions.map(({ question, index }, localIndex) => (
                      view === 'edit' ? (
                        <QuestionEditor
                          key={question.id}
                          question={question}
                          onChange={(next) => updateQuestion(index, next)}
                        />
                      ) : (
                        <article key={question.id} style={{
                          border: `1px solid ${BASE.borderDim}`,
                          background: `${BASE.bgCard}dd`,
                          borderRadius: 11,
                          padding: '15px 16px',
                        }}>
                          <div style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            fontFamily: 'Saira, sans-serif',
                            fontSize: 8,
                            letterSpacing: '0.11em',
                            color: BASE.steel,
                          }}>
                            <span style={{ color: BASE.gold }}>QUESTION {index + 1}</span>
                            <span>·</span>
                            <span>{question.phase.toUpperCase()}</span>
                            <span>·</span>
                            <span>{question.passageAnchors.join(', ')}</span>
                          </div>
                          <h3 style={{
                            margin: '8px 0 0',
                            color: BASE.bone,
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontSize: 16,
                            fontWeight: 600,
                            lineHeight: 1.5,
                          }}>
                            {question.participantPrompt}
                          </h3>
                          {view === 'participant' ? (
                            <div style={{ marginTop: 12 }}>
                              {Array.from({ length: question.phase === 'application' ? 4 : 3 }, (_, lineIndex) => (
                                <div key={`${question.id}-line-${lineIndex}`} style={{
                                  height: 25,
                                  borderBottom: `1px solid ${BASE.border}`,
                                }} />
                              ))}
                            </div>
                          ) : (
                            <AnswerKey question={question} />
                          )}
                          {localIndex === activeQuestions.length - 1 && question.phase === 'application' && (
                            <div style={{ marginTop: 10, color: BASE.steel, fontFamily: 'Inter, sans-serif', fontSize: 11 }}>
                              A faithful answer stays tied to the text.
                            </div>
                          )}
                        </article>
                      )
                    ))}
                  </div>
                )}
              </section>
            </main>

            <footer style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderTop: `1px solid ${BASE.borderDim}`,
              flexShrink: 0,
            }}>
              <Button onClick={() => setStepIndex(Math.max(0, stepIndex - 1))} disabled={stepIndex === 0}>
                ← PREVIOUS
              </Button>
              <div style={{
                flex: 1,
                textAlign: 'center',
                color: BASE.steel,
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 11,
              }}>
                One block at a time · {completed.size}/8 complete
              </div>
              {stepIndex < PHASES.length - 1 ? (
                <Button onClick={markCurrentDone} primary>
                  MARK DONE · NEXT →
                </Button>
              ) : (
                <Button onClick={() => {
                  const next = new Set(completed)
                  next.add(activePhase.id)
                  setCompleted(next)
                }} primary>
                  {completed.has(activePhase.id) ? 'GUIDE COMPLETE ✓' : 'MARK GUIDE COMPLETE'}
                </Button>
              )}
            </footer>
          </>
        ) : null}

        {error && guide && (
          <div role="alert" style={{
            position: 'absolute',
            left: '50%',
            bottom: 70,
            transform: 'translateX(-50%)',
            maxWidth: 620,
            border: `1px solid ${BASE.red}88`,
            background: '#2a1511',
            color: '#efb7aa',
            borderRadius: 8,
            padding: '9px 12px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 12,
            boxShadow: '0 12px 30px rgba(0,0,0,.4)',
          }}>
            {error}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
