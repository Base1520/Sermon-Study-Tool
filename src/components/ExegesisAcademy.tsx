import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BASE, FONT, MOTION } from '../theme'
import {
  SKILLS, LEVEL_THRESHOLDS, PASS_THRESHOLD, LESSON_XP, QUIZ_PASS_XP,
  getAcademyProgress, saveAcademyProgress, getSkillProgress, getLevel,
  type Skill, type AcademyProgress, type QuizQuestion,
} from '../data/academyData'

// ── Deterministic option ordering ─────────────────────────────────────────────
// The authored data clusters correct answers in one slot. Rather than trusting
// the author's shuffling, derive a stable per-question permutation from the
// question text so the correct answer lands in a different position per
// question — and in the SAME position every time that question is shown, so
// results, review, and retakes all agree.

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Returns display order as an array of ORIGINAL option indices. */
function optionOrder(q: QuizQuestion): number[] {
  const idx = q.options.map((_, i) => i)
  let seed = hashString(q.q) || 1
  const rand = () => {
    // xorshift32 — deterministic, no dependencies
    seed ^= seed << 13; seed >>>= 0
    seed ^= seed >>> 17
    seed ^= seed << 5;  seed >>>= 0
    return seed / 4294967296
  }
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx
}

const CARD   = BASE.bgCard
const KHAKI  = BASE.khaki
const GOLD   = BASE.gold
const BORDER = `${KHAKI}30`
const TEXT   = BASE.bone

interface Props {
  onClose: () => void
}

type View = 'home' | 'lessons' | 'lesson' | 'quiz'

export function ExegesisAcademy({ onClose }: Props) {
  const [progress, setProgress]     = useState<AcademyProgress>(getAcademyProgress)
  const [view, setView]             = useState<View>('home')
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null)
  const [activeLesson, setActiveLesson] = useState(0)

  // Quiz state
  const [qIndex, setQIndex]           = useState(0)
  const [answers, setAnswers]         = useState<(number | null)[]>([])
  const [revealed, setRevealed]       = useState(false)
  const [quizDone, setQuizDone]       = useState(false)
  const [score, setScore]             = useState(0)

  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef  = useRef<HTMLDivElement>(null)

  // Lessons are long now — always start a new lesson / question at the top.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [view, activeSkill, activeLesson, qIndex, quizDone])

  function save(p: AcademyProgress) {
    saveAcademyProgress(p)
    setProgress({ ...p })
  }

  function isSkillUnlocked(idx: number) {
    if (idx === 0) return true
    const prev = SKILLS[idx - 1]
    return getSkillProgress(progress, prev.slug).quizPassed
  }

  function passedCount() {
    return SKILLS.filter(s => getSkillProgress(progress, s.slug).quizPassed).length
  }

  function openSkill(skill: Skill) {
    setActiveSkill(skill)
    setActiveLesson(0)
    setView('lessons')
  }

  function completeLesson(skill: Skill, lessonId: string) {
    const p = { ...progress }
    const sp = getSkillProgress(p, skill.slug)
    if (!sp.lessonsCompleted.includes(lessonId)) {
      sp.lessonsCompleted = [...sp.lessonsCompleted, lessonId]
      p.totalXp += LESSON_XP
    }
    p.skills[skill.slug] = sp
    save(p)
  }

  function startQuiz(skill: Skill) {
    setActiveSkill(skill)
    setQIndex(0)
    setAnswers(new Array(skill.quiz.length).fill(null))
    setRevealed(false)
    setQuizDone(false)
    setScore(0)
    setView('quiz')
  }

  function submitAnswer(optIdx: number) {
    if (revealed) return
    const updated = [...answers]
    updated[qIndex] = optIdx
    setAnswers(updated)
    setRevealed(true)
  }

  function nextQuestion() {
    if (!activeSkill) return
    const correct = activeSkill.quiz[qIndex].answer === answers[qIndex] ? 1 : 0
    const newScore = score + correct
    if (qIndex + 1 >= activeSkill.quiz.length) {
      const finalScore = newScore
      const passed = finalScore / activeSkill.quiz.length >= PASS_THRESHOLD
      const p = { ...progress }
      const sp = getSkillProgress(p, activeSkill.slug)
      sp.quizAttempts += 1
      if (finalScore > sp.quizBestScore) sp.quizBestScore = finalScore
      if (passed && !sp.quizPassed) {
        sp.quizPassed = true
        sp.passedAt = new Date().toISOString()
        p.totalXp += QUIZ_PASS_XP
      }
      p.skills[activeSkill.slug] = sp
      save(p)
      setScore(finalScore)
      setQuizDone(true)
    } else {
      setScore(newScore)
      setQIndex(qIndex + 1)
      setRevealed(false)
    }
  }

  const passed   = passedCount()
  const lvl      = getLevel(passed)

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      ref={panelRef}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 560, zIndex: 9000,
        background: `linear-gradient(178deg, #1c2314 0%, ${BASE.bg} 40%)`,
        borderLeft: `1px solid ${BASE.borderGold}`,
        boxShadow: '-24px 0 64px rgba(0,0,0,0.55)',
        display: 'flex', flexDirection: 'column',
        fontFamily: FONT.mono,
        overflow: 'hidden',
      }}
    >
      {/* Gold hairline top */}
      <div style={{
        height: 2, flexShrink: 0,
        background: `linear-gradient(90deg, transparent, ${BASE.gold}88, ${BASE.gold}, ${BASE.gold}88, transparent)`,
      }} />

      {/* ── Classification-strip header ────────────────────── */}
      <div style={{
        padding: '14px 20px 12px',
        borderBottom: `1px solid ${BASE.border}`,
        display: 'flex', alignItems: 'center', gap: 14,
        background: `${BASE.olive}30`,
        flexShrink: 0,
      }}>
        <div style={{ width: 3, alignSelf: 'stretch', background: BASE.gold, borderRadius: 2 }} />
        {view !== 'home' && (
          <button onClick={() => {
            if (view === 'lesson') { setView('lessons'); return }
            if (view === 'quiz') { setView('lessons'); return }
            setView('home')
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}55` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}
            style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              background: 'transparent', border: `1px solid ${BASE.borderDim}`,
              color: BASE.steel, cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: `all ${MOTION.fast}s`,
            }}>
            ←
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT.display, fontSize: 21, color: BASE.bone,
            letterSpacing: '0.1em', lineHeight: 1,
          }}>
            EXEGESIS ACADEMY
          </div>
          <div style={{
            fontFamily: FONT.mono, fontSize: 6.5, color: BASE.steel,
            letterSpacing: '0.22em', marginTop: 4,
          }}>
            TRAINING · {lvl.label.toUpperCase()}
          </div>
        </div>
        {view === 'home' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: BASE.gold, boxShadow: `0 0 8px ${BASE.gold}`,
            }} />
            <span style={{ fontFamily: FONT.type, fontSize: 8, color: BASE.gold, letterSpacing: '0.1em' }}>
              {passed}/{SKILLS.length} SKILLS · {progress.totalXp} XP
            </span>
          </div>
        )}
        <button onClick={onClose}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BASE.gold; (e.currentTarget as HTMLElement).style.borderColor = `${BASE.gold}55` }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = BASE.steel; (e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim }}
          style={{
            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
            background: 'transparent', border: `1px solid ${BASE.borderDim}`,
            color: BASE.steel, cursor: 'pointer', fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: `all ${MOTION.fast}s`,
          }}>
          ×
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <HomeView key="home" skills={SKILLS} progress={progress} onOpen={openSkill} isUnlocked={isSkillUnlocked} passed={passed} lvl={lvl} />
          )}
          {view === 'lessons' && activeSkill && (
            <LessonsView key="lessons" skill={activeSkill} progress={progress}
              onLesson={idx => { setActiveLesson(idx); setView('lesson') }}
              onStartQuiz={() => startQuiz(activeSkill)} />
          )}
          {view === 'lesson' && activeSkill && (
            <LessonView key={`lesson-${activeLesson}`}
              skill={activeSkill} lessonIdx={activeLesson} progress={progress}
              onPrev={() => setActiveLesson(l => Math.max(0, l - 1))}
              onNext={() => {
                completeLesson(activeSkill, activeSkill.lessons[activeLesson].id)
                if (activeLesson < activeSkill.lessons.length - 1) {
                  setActiveLesson(l => l + 1)
                } else {
                  setView('lessons')
                }
              }}
            />
          )}
          {view === 'quiz' && activeSkill && (
            <QuizView key="quiz"
              skill={activeSkill}
              qIndex={qIndex}
              answers={answers}
              revealed={revealed}
              done={quizDone}
              score={score}
              onAnswer={submitAnswer}
              onNext={nextQuestion}
              onRetry={() => startQuiz(activeSkill)}
              onBack={() => setView('lessons')}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer XP bar ──────────────────────────────────── */}
      {view === 'home' && (
        <div style={{ padding: '10px 18px', borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <LevelBar passed={passed} />
        </div>
      )}
    </motion.div>
  )
}

// ── HomeView ──────────────────────────────────────────────────────────────────

function HomeView({ skills, progress, onOpen, isUnlocked, passed, lvl }: {
  skills: Skill[], progress: AcademyProgress
  onOpen: (s: Skill) => void
  isUnlocked: (i: number) => boolean
  passed: number, lvl: typeof LEVEL_THRESHOLDS[number]
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ padding: '18px 18px 24px' }}>

      {/* Level hero */}
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: '16px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: `2px solid ${GOLD}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, background: `${GOLD}18`,
        }}>
          {passed === 0 ? '◎' : passed < 5 ? '◑' : passed < 10 ? '◕' : '●'}
        </div>
        <div>
          <div style={{ fontFamily: FONT.display, fontSize: 20, color: GOLD, letterSpacing: '0.08em', lineHeight: 1 }}>{lvl.label}</div>
          <div style={{ fontSize: 8, color: KHAKI, opacity: 0.65, marginTop: 2 }}>
            {passed} of {skills.length} skills mastered
          </div>
          <div style={{ fontSize: 7, color: KHAKI, opacity: 0.4, marginTop: 1 }}>
            {skills.length - passed > 0
              ? `Next unlock: complete ${skills[passed]?.title ?? 'remaining skills'}`
              : 'All skills mastered — Master Exegete · still under the text, still correctable'}
          </div>
        </div>
      </div>

      {/* Skill grid */}
      <div style={{ fontFamily: FONT.display, fontSize: 14, letterSpacing: '0.12em', color: KHAKI, marginBottom: 10 }}>
        SKILL TREE
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {skills.map((skill, idx) => {
          const sp       = getSkillProgress(progress, skill.slug)
          const unlocked = isUnlocked(idx)
          const done     = sp.quizPassed
          const lessonsN = sp.lessonsCompleted.length
          const allLessons = skill.lessons.length

          return (
            <button key={skill.slug}
              onClick={() => unlocked && onOpen(skill)}
              disabled={!unlocked}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: done ? `${GOLD}0c` : unlocked ? CARD : `${CARD}80`,
                border: `1px solid ${done ? GOLD + '55' : unlocked ? BORDER : BORDER + '60'}`,
                borderRadius: 10, padding: '12px 16px',
                cursor: unlocked ? 'pointer' : 'not-allowed',
                opacity: unlocked ? 1 : 0.4,
                transition: 'all 0.15s', textAlign: 'left', width: '100%',
              }}>
              {/* Icon */}
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: done ? `${skill.color}33` : `${skill.color}18`,
                border: `1px solid ${skill.color}${done ? '55' : '30'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: done ? skill.color : `${skill.color}99`,
                flexShrink: 0,
              }}>
                {done ? '✓' : unlocked ? skill.icon : '🔒'}
              </div>

              {/* Labels */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT.display, fontSize: 15, letterSpacing: '0.06em', color: done ? GOLD : unlocked ? TEXT : KHAKI, lineHeight: 1.1 }}>
                  {skill.number}. {skill.title}
                </div>
                <div style={{ fontSize: 7.5, color: KHAKI, opacity: 0.6, marginTop: 1 }}>
                  {skill.subtitle}
                </div>
                {unlocked && !done && (
                  <div style={{ marginTop: 4, height: 3, background: `${KHAKI}20`, borderRadius: 2, width: 100 }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: lessonsN === allLessons ? GOLD : `${GOLD}80`,
                      width: `${(lessonsN / allLessons) * 100}%`,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                )}
              </div>

              {/* Status */}
              <div style={{ fontSize: 7, color: KHAKI, opacity: 0.5, textAlign: 'right', flexShrink: 0 }}>
                {done ? <span style={{ color: GOLD }}>PASSED</span>
                  : unlocked ? `${lessonsN}/${allLessons} lessons`
                  : 'LOCKED'}
              </div>
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}

// ── LessonsView ───────────────────────────────────────────────────────────────

function LessonsView({ skill, progress, onLesson, onStartQuiz }: {
  skill: Skill, progress: AcademyProgress
  onLesson: (idx: number) => void
  onStartQuiz: () => void
}) {
  const sp       = getSkillProgress(progress, skill.slug)
  const allDone  = sp.lessonsCompleted.length >= skill.lessons.length

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ padding: '18px 18px 24px' }}>

      {/* Skill header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: `${skill.color}25`, border: `1px solid ${skill.color}50`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, color: skill.color,
        }}>
          {skill.icon}
        </div>
        <div>
          <div style={{ fontFamily: FONT.display, fontSize: 19, letterSpacing: '0.06em', color: TEXT, lineHeight: 1.05 }}>{skill.title}</div>
          <div style={{ fontSize: 7.5, color: KHAKI, opacity: 0.6, marginTop: 2 }}>{skill.subtitle}</div>
        </div>
      </div>

      {/* Progress line */}
      <div style={{ fontFamily: FONT.display, fontSize: 13, letterSpacing: '0.12em', color: KHAKI, marginBottom: 10 }}>
        LESSONS — {sp.lessonsCompleted.length}/{skill.lessons.length} COMPLETED
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        {skill.lessons.map((lesson, idx) => {
          const done = sp.lessonsCompleted.includes(lesson.id)
          return (
            <button key={lesson.id}
              onClick={() => onLesson(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: done ? `${GOLD}0a` : CARD,
                border: `1px solid ${done ? GOLD + '40' : BORDER}`,
                borderRadius: 8, padding: '10px 14px',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all 0.15s',
              }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: done ? `${GOLD}30` : `${KHAKI}18`,
                border: `1px solid ${done ? GOLD + '80' : BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: done ? GOLD : KHAKI, flexShrink: 0,
              }}>
                {done ? '✓' : idx + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT.display, fontSize: 14, letterSpacing: '0.05em', color: done ? GOLD : TEXT, lineHeight: 1.1 }}>{lesson.title}</div>
              </div>
              <div style={{ fontSize: 10, color: KHAKI, opacity: 0.4 }}>›</div>
            </button>
          )
        })}
      </div>

      {/* Quiz CTA */}
      <div style={{
        background: allDone ? `${GOLD}12` : `${CARD}`,
        border: `1px solid ${allDone ? GOLD + '55' : BORDER}`,
        borderRadius: 10, padding: '14px 16px',
      }}>
        <div style={{ fontFamily: FONT.display, fontSize: 14, letterSpacing: '0.12em', color: allDone ? GOLD : KHAKI, marginBottom: 4 }}>
          SKILL ASSESSMENT
        </div>
        <div style={{ fontSize: 9.5, color: TEXT, marginBottom: 8 }}>
          {skill.quiz.length}-question quiz · {Math.round(PASS_THRESHOLD * 100)}% to pass · sequential unlock
        </div>
        {sp.quizBestScore > 0 && (
          <div style={{ fontSize: 8, color: sp.quizPassed ? GOLD : '#c07050', marginBottom: 8 }}>
            Best: {sp.quizBestScore}/{skill.quiz.length} · Attempts: {sp.quizAttempts}
            {sp.quizPassed ? ' · ✓ PASSED' : ''}
          </div>
        )}
        <button onClick={onStartQuiz}
          disabled={!allDone}
          style={{
            background: allDone ? GOLD : `${GOLD}40`,
            border: 'none',
            color: allDone ? BASE.bg : GOLD,
            padding: '7px 18px', borderRadius: 6,
            cursor: allDone ? 'pointer' : 'default',
            fontSize: 14, letterSpacing: '0.12em',
            fontFamily: FONT.display,
          }}>
          {sp.quizPassed ? 'RETAKE QUIZ' : allDone ? 'START QUIZ' : 'COMPLETE LESSONS FIRST'}
        </button>
      </div>
    </motion.div>
  )
}

// ── LessonView ────────────────────────────────────────────────────────────────

function LessonView({ skill, lessonIdx, progress, onPrev, onNext }: {
  skill: Skill, lessonIdx: number, progress: AcademyProgress
  onPrev: () => void, onNext: () => void
}) {
  const lesson  = skill.lessons[lessonIdx]
  const done    = getSkillProgress(progress, skill.slug).lessonsCompleted.includes(lesson.id)
  const isFirst = lessonIdx === 0
  const isLast  = lessonIdx === skill.lessons.length - 1

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      style={{ padding: '18px 20px 32px' }}>

      {/* Breadcrumb */}
      <div style={{ fontSize: 7, color: KHAKI, opacity: 0.45, letterSpacing: '0.1em', marginBottom: 12 }}>
        {skill.title.toUpperCase()} · LESSON {lessonIdx + 1} OF {skill.lessons.length}
      </div>

      <h2 style={{ fontFamily: FONT.display, fontSize: 24, color: GOLD, margin: '0 0 18px', fontWeight: 400, letterSpacing: '0.06em', lineHeight: 1.05 }}>
        {lesson.title}
      </h2>

      {/* Content — authored with blank lines between paragraphs */}
      <div style={{
        fontSize: 13, color: TEXT, lineHeight: 1.85,
        fontFamily: FONT.serif,
        marginBottom: 22,
      }}>
        {lesson.content.split(/\n{2,}/).map((para, i) => (
          // pre-line keeps the single-newline list blocks (e.g. the connector
          // table) on their own lines without needing markup in the data.
          <p key={i} style={{ margin: '0 0 14px', whiteSpace: 'pre-line' }}>
            {para.trim()}
          </p>
        ))}
      </div>

      {/* Exercise */}
      <div style={{
        background: `${skill.color}0e`,
        border: `1px solid ${skill.color}35`,
        borderRadius: 8, padding: '12px 16px',
        marginBottom: lesson.toolHint ? 12 : 24,
      }}>
        <div style={{ fontSize: 7, letterSpacing: '0.14em', color: skill.color, marginBottom: 6 }}>EXERCISE</div>
        <div style={{ fontSize: 11.5, color: TEXT, lineHeight: 1.75, fontFamily: FONT.serif }}>
          {lesson.exercise}
        </div>
      </div>

      {/* Tool hint */}
      {lesson.toolHint && (
        <div style={{
          background: `${GOLD}0a`,
          border: `1px solid ${GOLD}30`,
          borderRadius: 8, padding: '10px 14px',
          marginBottom: 24, display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 12, color: GOLD, flexShrink: 0 }}>⌖</span>
          <div>
            <div style={{ fontSize: 7, letterSpacing: '0.12em', color: GOLD, marginBottom: 3 }}>LOOK AT</div>
            <div style={{ fontSize: 10.5, color: KHAKI, lineHeight: 1.6 }}>{lesson.toolHint}</div>
          </div>
        </div>
      )}

      {/* Nav */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!isFirst && (
          <button onClick={onPrev}
            style={{ ...navBtn, background: 'transparent', color: KHAKI, border: `1px solid ${BORDER}` }}>
            ← PREVIOUS
          </button>
        )}
        <button onClick={onNext}
          style={{ ...navBtn, background: GOLD, color: BASE.bg, border: 'none', flex: 1 }}>
          {isLast ? 'FINISH LESSONS' : 'NEXT LESSON →'}
        </button>
      </div>

      {done && (
        <div style={{ marginTop: 10, fontSize: 8, color: GOLD, opacity: 0.7, textAlign: 'center' }}>
          ✓ Lesson completed
        </div>
      )}
    </motion.div>
  )
}

const navBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 6,
  cursor: 'pointer', fontSize: 14, letterSpacing: '0.12em',
  fontFamily: FONT.display, transition: 'all 0.15s',
}

// ── QuizView ──────────────────────────────────────────────────────────────────

function QuizView({ skill, qIndex, answers, revealed, done, score, onAnswer, onNext, onRetry, onBack }: {
  skill: Skill, qIndex: number, answers: (number | null)[]
  revealed: boolean, done: boolean, score: number
  onAnswer: (i: number) => void
  onNext: () => void
  onRetry: () => void
  onBack: () => void
}) {
  const q       = skill.quiz[qIndex]
  const chosen  = answers[qIndex]
  const total   = skill.quiz.length
  const pct     = done ? score / total : qIndex / total
  const passed  = done && score / total >= PASS_THRESHOLD
  // Display order is a stable permutation of the ORIGINAL indices, so the
  // correct answer is not always in the same slot. We always hand the parent
  // the original index, which keeps scoring and review logic unchanged.
  const order   = useMemo(() => optionOrder(q), [q])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ padding: '18px 20px 32px' }}>

      {/* Progress bar */}
      <div style={{ height: 4, background: `${KHAKI}18`, borderRadius: 2, marginBottom: 18 }}>
        <div style={{
          height: '100%', borderRadius: 2, background: passed ? GOLD : `${GOLD}80`,
          width: `${pct * 100}%`, transition: 'width 0.4s',
        }} />
      </div>

      {!done ? (
        <>
          <div style={{ fontSize: 7, color: KHAKI, opacity: 0.5, letterSpacing: '0.1em', marginBottom: 12 }}>
            QUESTION {qIndex + 1} OF {total}
          </div>

          <div style={{
            fontSize: 14, color: TEXT, lineHeight: 1.75,
            fontFamily: FONT.serif, marginBottom: 20,
          }}>
            {q.q}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {order.map((origIdx, i) => {
              const opt       = q.options[origIdx]
              const isCorrect = origIdx === q.answer
              const isChosen  = origIdx === chosen
              let bg: string = CARD, border: string = BORDER, color: string = TEXT
              if (revealed) {
                if (isCorrect) { bg = `${GOLD}20`; border = GOLD; color = GOLD }
                else if (isChosen) { bg = '#c0505015'; border = '#c05050'; color = '#c07070' }
              } else if (isChosen) {
                bg = `${GOLD}15`; border = `${GOLD}70`
              }
              return (
                <button key={origIdx} onClick={() => onAnswer(origIdx)}
                  style={{
                    background: bg, border: `1px solid ${border}`, borderRadius: 8,
                    padding: '10px 14px', cursor: revealed ? 'default' : 'pointer',
                    textAlign: 'left', color, fontSize: 11.5,
                    fontFamily: FONT.serif, lineHeight: 1.55,
                    transition: 'all 0.15s',
                  }}>
                  <span style={{ fontSize: 8, color: KHAKI, marginRight: 8, opacity: 0.6 }}>
                    {String.fromCharCode(65 + i)}.
                  </span>
                  {opt}
                </button>
              )
            })}
          </div>

          {revealed && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: 14,
                background: chosen === q.answer ? `${GOLD}10` : '#c0505010',
                border: `1px solid ${chosen === q.answer ? GOLD + '40' : '#c0505040'}`,
                borderRadius: 8, padding: '10px 14px',
              }}>
              <div style={{ fontSize: 8, letterSpacing: '0.1em', color: chosen === q.answer ? GOLD : '#c07070', marginBottom: 4 }}>
                {chosen === q.answer ? '✓ CORRECT' : '✗ INCORRECT'}
              </div>
              <div style={{ fontSize: 11, color: TEXT, lineHeight: 1.65, fontFamily: FONT.serif }}>
                {q.explanation}
              </div>
            </motion.div>
          )}

          {revealed && (
            <button onClick={onNext}
              style={{ ...navBtn, marginTop: 16, background: GOLD, color: BASE.bg, border: 'none', width: '100%' }}>
              {qIndex + 1 >= total ? 'SEE RESULTS' : 'NEXT QUESTION →'}
            </button>
          )}
        </>
      ) : (
        /* Results screen */
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
          <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>
              {passed ? '🏆' : '📖'}
            </div>
            <div style={{ fontFamily: FONT.display, fontSize: 26, color: passed ? GOLD : TEXT, letterSpacing: '0.08em', lineHeight: 1, marginBottom: 6 }}>
              {passed ? 'SKILL UNLOCKED' : 'NOT PASSED'}
            </div>
            <div style={{ fontSize: 13, color: KHAKI, marginBottom: 4 }}>
              {score}/{total} correct · {Math.round((score / total) * 100)}%
            </div>
            <div style={{ fontSize: 10, color: KHAKI, opacity: 0.5 }}>
              {passed ? `+${QUIZ_PASS_XP} XP earned` : `Need ${Math.ceil(PASS_THRESHOLD * total)}/${total} to pass`}
            </div>
          </div>

          {!passed && (
            <div style={{
              background: `${CARD}`, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: '12px 16px', marginBottom: 18,
            }}>
              <div style={{ fontFamily: FONT.display, fontSize: 13, color: KHAKI, letterSpacing: '0.12em', marginBottom: 8 }}>
                REVIEW MISSED QUESTIONS
              </div>
              {skill.quiz.map((q, i) => {
                const correct = answers[i] === q.answer
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 9, color: correct ? GOLD : '#c07070', flexShrink: 0, marginTop: 1 }}>
                      {correct ? '✓' : '✗'}
                    </span>
                    <div>
                      <div style={{ fontSize: 9.5, color: TEXT, lineHeight: 1.5 }}>{q.q}</div>
                      {!correct && (
                        <div style={{ fontSize: 9, color: GOLD, marginTop: 2, lineHeight: 1.4 }}>
                          Correct: {q.options[q.answer]}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onBack} style={{ ...navBtn, background: 'transparent', color: KHAKI, border: `1px solid ${BORDER}`, flex: 1 }}>
              BACK TO SKILL
            </button>
            {!passed && (
              <button onClick={onRetry} style={{ ...navBtn, background: GOLD, color: BASE.bg, border: 'none', flex: 1 }}>
                RETRY QUIZ
              </button>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

// ── LevelBar ──────────────────────────────────────────────────────────────────

function LevelBar({ passed }: { passed: number }) {
  const total = SKILLS.length
  const next  = LEVEL_THRESHOLDS.find(t => t.skills > passed)
  const pct   = next ? passed / next.skills : 1

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 7, color: KHAKI, opacity: 0.5 }}>
          {passed}/{total} SKILLS MASTERED
        </span>
        {next && (
          <span style={{ fontSize: 7, color: KHAKI, opacity: 0.4 }}>
            → {next.label} at {next.skills}
          </span>
        )}
      </div>
      <div style={{ height: 3, background: `${KHAKI}18`, borderRadius: 2 }}>
        <div style={{
          height: '100%', borderRadius: 2, background: GOLD,
          width: `${Math.min(pct, 1) * 100}%`, transition: 'width 0.4s',
        }} />
      </div>
    </div>
  )
}
