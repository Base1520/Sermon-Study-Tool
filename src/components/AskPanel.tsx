/**
 * AskPanel.tsx — ASK THE OPERATOR.
 *
 * A question box over ONE passage. The reader has the reading in front of them
 * and wants to push on it: what does this word carry, why does the argument
 * turn here, where could this be wrong. That is the whole job.
 *
 * ── THE RULE THE NAME CREATES ───────────────────────────────────────────────
 * "ASK THE OPERATOR" is a good name and a dangerous one. A name shaped like a
 * person invites the thing to behave like one, and the moment it does, a reader
 * with a hard marriage or a dying parent will ask it what to do and take the
 * answer as counsel from someone. So:
 *
 *   - No avatar. No name. No face. No "I think", no "friend", no warmth-signal
 *     that implies a person is on the other end.
 *   - The placeholder, the empty state and the answer label all say the same
 *     thing three different ways: you are querying THIS TEXT.
 *   - A question about the reader's own life is refused, calmly, with a real
 *     handoff to real people. That block is the most important thing in here.
 *
 * If this ever starts reading as a persona giving counsel, the NAME changes.
 * The rule does not. ASK_LABEL is one exported constant for exactly that
 * reason — the rename is one line.
 *
 * ── WHY THE CONVERSATION LIVES OUTSIDE THE COMPONENT ────────────────────────
 * The panel unmounts when it closes, and a question can take a while. If the
 * conversation lived in component state, opening the map mid-answer would throw
 * the answer away. It lives in a module-level store keyed by passage, so the
 * request finishes whether or not anyone is watching, and the answer is sitting
 * there when the panel comes back. Same reason it survives switching to another
 * study tool and back.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { motion } from 'motion/react'
import { BASE } from '../theme'
import { friendlyApiError } from '../lib/apiErrors'
import type { FriendlyError } from '../lib/apiErrors'
import type {
  PhrasingAnalysis,
  PlainAskRefusal,
  PlainAskRefusalKind,
  PlainAskResult,
  PlainAskTurn,
  PlainReadDoc,
} from '../types/phrasing'

/**
 * The name, in one place. Changing this changes the rail tile, the panel
 * header and every reference to the surface. Nothing else hard-codes it.
 */
/*
 * Renamed 2026-07-27. The APP is now called The Operator, so a panel called
 * "ASK THE OPERATOR" would read as the app asking itself — and worse, it would
 * point the reader at a persona instead of at the passage. "ASK THE TEXT" says
 * what actually happens: the question goes to this passage, answered from this
 * passage. It also does the guardrail work for free, because a reader who types
 * "should I leave my wife" into something called ASK THE TEXT can already feel
 * the mismatch before the refusal explains it.
 */
export const ASK_LABEL = 'ASK THE TEXT'

/** Rail tile caption — the rail has 60px of width, so the long name will not fit. */
export const ASK_TILE_LABEL = 'ASK'

/**
 * Rail glyph: U+2370 APL FUNCTIONAL SYMBOL QUAD QUESTION.
 *
 * Picked the same way the rail's other seven were, and for the same reason the
 * hourglass had to go. U+231B carried Emoji_Presentation=Yes, so macOS resolved
 * it through Apple Color Emoji and painted it in colour while every other tile
 * rendered monochrome. Checked here before use:
 *
 *   \p{Emoji} = false, \p{Emoji_Presentation} = false  → text-default, no
 *     colour font will ever claim it, and no U+FE0E is needed.
 *   Present in Apple Symbols, Menlo and STIXGeneral — the same coverage
 *     profile as ⌖ U+2316, ⌥ U+2325 and ⌂ U+2302, which sit in the same
 *     Miscellaneous Technical block and already render correctly in this rail.
 *
 * It also reads right: a question mark in a box, next to a house, a target and
 * a crosshair.
 */
export const ASK_ICON = '⍰'

/**
 * The rail is 60px of button plus its 1px left border. The dock stops here so
 * the rail stays visible AND clickable while the dock is open — one click from
 * a question to the map and one click back, which is the whole point.
 */
const RAIL_W = 61

/* ══ the conversation store ═════════════════════════════════════════════════ */

type TurnStatus = 'pending' | 'answered' | 'refused' | 'failed'

interface AskTurn {
  id: string
  question: string
  status: TurnStatus
  answer: string | null
  refusal: PlainAskRefusal | null
  error: FriendlyError | null
  /** Follow-on questions this answer opened up. */
  suggested: string[]
  /**
   * The engine answered, but flagged that the question reached past this
   * passage. The answer still stands and still renders; this only adds the
   * note that says so.
   */
  offText?: boolean
  startedAt: number
}

const STORE = new Map<string, AskTurn[]>()

/**
 * Engine-built starter questions, per passage.
 *
 * These come from generateStarters in electron/plainread/ask.js, reached by
 * sending a BLANK question through the same plainAsk bridge — the `plain-ask`
 * handler in main.js answers that with starters and makes no model call, needs
 * no key, and costs nothing. They are better than the ones derived in this file
 * (genre-aware, and run through the same fences as a real answer), so they win
 * when they arrive.
 *
 * Cached per passage and written exactly once, so the chips cannot change under
 * a finger that is already moving toward one.
 */
const STARTERS = new Map<string, string[]>()
const LISTENERS = new Set<() => void>()

/** Stable identity matters: useSyncExternalStore compares snapshots by reference. */
const NO_TURNS: AskTurn[] = []

function subscribe(fn: () => void): () => void {
  LISTENERS.add(fn)
  return () => { LISTENERS.delete(fn) }
}

function readTurns(key: string): AskTurn[] {
  return STORE.get(key) ?? NO_TURNS
}

function writeTurns(key: string, next: AskTurn[]): void {
  STORE.set(key, next)
  LISTENERS.forEach(fn => fn())
}

function patchTurn(key: string, id: string, patch: Partial<AskTurn>): void {
  writeTurns(key, readTurns(key).map(t => (t.id === id ? { ...t, ...patch } : t)))
}

/* ══ tolerant readers for the IPC result ════════════════════════════════════ */

const KNOWN_REFUSAL_KINDS = new Set<PlainAskRefusalKind>([
  'personal-counsel', 'off-passage', 'out-of-scope', 'unsafe', 'off-text', 'other',
])

/**
 * THE WIRE IS A BARE STRING. This is the bug this function exists to absorb.
 *
 * electron/plainread/ask.js returns `refusal: 'off-text' | 'personal-counsel' |
 * 'unsafe' | null` — a plain token, not `{ kind, message }` — and main.js hands
 * it to the renderer untouched. Reading a bare string as an unknown object gave
 * `{ kind: 'other', message: 'personal-counsel' }`, which meant two things went
 * wrong at once, both silently:
 *
 *   1. The two-tier handoff never rendered, because nothing ever had kind
 *      'personal-counsel'. The reader got a flat grey line instead.
 *   2. That grey line printed the raw token. A reader who asked whether to
 *      leave their husband was answered with the word "personal-counsel", and
 *      a reader in crisis was answered with the word "unsafe" — while the
 *      engine's real text, the one carrying 988, was thrown away.
 *
 * So the token is mapped by name, and the engine's `answer` rides along as the
 * message. `answer` is populated on every refusing path and is the only place
 * the crisis line exists.
 */
function normalizeRefusal(raw: unknown, answer?: unknown): PlainAskRefusal | null {
  if (!raw) return null

  const prose = typeof answer === 'string' ? answer.trim() : ''

  // The shipped shape: a bare token naming the kind.
  if (typeof raw === 'string') {
    const token = raw.trim()
    if (!token) return null
    if (KNOWN_REFUSAL_KINDS.has(token as PlainAskRefusalKind)) {
      return { kind: token as PlainAskRefusalKind, message: prose }
    }
    /* Not a token we know. It is more likely to be a human sentence than a
       kind, so it is shown as one rather than printed as a label. */
    return { kind: 'other', message: token }
  }

  // The object shape, kept working for an engine that later switches to it.
  if (typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    const rawKind = typeof r.kind === 'string' ? r.kind : ''
    const kind: PlainAskRefusalKind =
      KNOWN_REFUSAL_KINDS.has(rawKind as PlainAskRefusalKind)
        ? (rawKind as PlainAskRefusalKind)
        : 'other'
    const message =
      typeof r.message === 'string' && r.message.trim() ? r.message.trim()
        : typeof r.reason === 'string' && r.reason.trim() ? r.reason.trim()
          : prose
    return { kind, message }
  }

  return null
}

/** Strings only, trimmed, deduped, capped. Anything else in the array is dropped. */
function cleanList(raw: unknown, cap: number): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const s = item.trim()
    if (!s || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
    if (out.length >= cap) break
  }
  return out
}

/* ══ starter questions ══════════════════════════════════════════════════════ */

/**
 * The chips shown before the first question. Cole asked for these by name, so
 * they are never absent: if the engine shipped starters with the document they
 * win, and if it did not, they are derived here from the outline and the key
 * words. Deriving them locally costs nothing, cannot fail, and cannot make the
 * reader sit and watch a text box think before they have typed anything.
 *
 * Every one of them points AT THE TEXT. None of them asks the panel about the
 * reader, because the panel will refuse that and a starter chip that gets
 * refused is a trap.
 */
function deriveStarters(doc: PlainReadDoc | null, analysis: PhrasingAnalysis | null): string[] {
  const pool: string[] = []

  const claim = doc?.meaning?.misread?.claim?.trim()
  if (claim && claim.length <= 55) {
    pool.push(`Is “${claim.replace(/[.]$/, '')}” a fair reading?`)
  }

  const keyWord = (analysis?.canonicalContext?.keyWords ?? [])
    .find(w => typeof w === 'string' && w.trim().length > 1 && w.trim().length <= 22)
  if (keyWord) pool.push(`What does “${keyWord.trim()}” carry here?`)

  /* `logic` is the link INTO a unit, so the first unit normally has none — the
     first unit that does have one is where the passage changes direction. */
  const turn = (doc?.outline?.units ?? []).find(u => u?.logic && u?.ref)
  if (turn) pool.push(`Why does the passage turn at ${turn.ref}?`)

  pool.push('What would the first readers have taken for granted that I don’t?')
  pool.push('Where could this reading be wrong?')
  pool.push('What is the hardest sentence in this passage?')
  pool.push('What is this passage not saying?')

  return pool.slice(0, 5)
}

/* ══ shared pending state ═══════════════════════════════════════════════════ */

/**
 * An honest wait. Two rules it exists to satisfy: the screen must be doing
 * something legible for as long as the work takes, and it must never imply
 * progress it cannot measure — so there is no percentage and no fake bar
 * filling toward a finish it does not know about. A sweeping line and a
 * counting clock say "still running, this long so far", which is all that is
 * actually known.
 *
 * Exported because the document's own first load has the same problem, and one
 * spinner is better than two.
 */
export function PendingPulse({ label, startedAt }: { label: string; startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))

  useEffect(() => {
    setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    const id = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(id)
  }, [startedAt])

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8,
        fontFamily: 'JetBrains Mono', fontSize: 7.5, letterSpacing: '0.18em',
        color: BASE.gold, textTransform: 'uppercase',
      }}>
        <span>{label}</span>
        {/* Fixed-width so the row cannot twitch as the number grows. */}
        <span style={{ color: BASE.steel, letterSpacing: '0.08em', minWidth: 34 }}>
          {elapsed}s
        </span>
      </div>
      <div style={{ height: 2, background: BASE.borderDim, overflow: 'hidden', position: 'relative' }}>
        <motion.div
          animate={{ x: ['-110%', '360%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute', inset: 0, width: '30%',
            background: `linear-gradient(90deg, transparent, ${BASE.gold}, transparent)`,
          }}
        />
      </div>
    </div>
  )
}

/* ══ the refusal ════════════════════════════════════════════════════════════ */

/**
 * THE MOST IMPORTANT STRINGS IN THIS FILE.
 *
 * When a reader asks this thing what to do about their marriage, their child,
 * or their own head, the failure mode is not that it answers badly. It is that
 * it answers at all and feels like enough — so the reader stops there and never
 * takes it to a person. Two tiers, because "talk to someone" is not actionable
 * and "see a professional" is the wrong first move for most of it:
 *
 *   TIER 1  a person who already knows them. Named, specific, do-able today.
 *   TIER 2  a professional, with the threshold stated plainly — because the
 *           people who most need tier 2 are the ones convinced they are not
 *           bad enough to deserve it.
 */
const COUNSEL_LEAD =
  'That is a question about your life, not about this passage. Something reading a text cannot see ' +
  'you, does not know your history, and has no business being the one you settle this with.'

const COUNSEL_TIER_1_LABEL = 'Start here — someone who already knows you'
const COUNSEL_TIER_1 =
  'Your pastor, or one person in your church who has earned the right to speak into your life. Say ' +
  'the actual thing, not the tidy version of it. Someone who knows your history will catch what a ' +
  'page cannot.'

const COUNSEL_TIER_2_LABEL = 'If safety, harm, or crisis is anywhere in it'
const COUNSEL_TIER_2 =
  'Go to a licensed counselor, a doctor, or an emergency line — today, not once you are certain it ' +
  'is bad enough. Not being certain is not a reason to wait.'

/**
 * The engine's refusal prose arrives as one string with blank-line breaks. It
 * has to render as paragraphs — collapsed into a single block, the crisis line
 * ("call or text 988") sits mid-paragraph and is the easiest thing on screen to
 * skim past, which is the one outcome that must not happen here.
 */
function Paragraphs({ text, color, size }: { text: string; color: string; size: number }) {
  const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} style={{
          fontFamily: 'Crimson Pro, serif', fontSize: size, lineHeight: 1.72,
          color, margin: i === paras.length - 1 ? 0 : '0 0 11px 0',
        }}>
          {p}
        </p>
      ))}
    </>
  )
}

function RefusalBlock({ refusal, handoff }: { refusal: PlainAskRefusal; handoff?: string | null }) {
  /* 'unsafe' rides with 'personal-counsel' on purpose. If the engine ever flags
     a question as unsafe, the direction to fail is toward handing the reader
     real people, not toward a one-line decline. */
  const counsel = refusal.kind === 'personal-counsel' || refusal.kind === 'unsafe'
  const crisis = refusal.kind === 'unsafe'

  if (!counsel) {
    /* An ordinary decline. Calm, one sentence, no red, no icon, no "error" —
       it is an answer about scope, not a failure. */
    return (
      <div style={{
        borderLeft: `2px solid ${BASE.border}`, paddingLeft: 14,
        fontFamily: 'Crimson Pro, serif', fontSize: 15.5, lineHeight: 1.7,
        color: BASE.boneMid,
      }}>
        {refusal.message || 'That one is outside what this passage can answer.'}
      </div>
    )
  }

  /* In a crisis the professional/emergency tier leads. "Start with someone who
     knows you" is the right first move for a hard marriage and the wrong one
     for somebody who should be calling 988 in the next minute. */
  const tiers = [
    {
      label: COUNSEL_TIER_1_LABEL,
      body: COUNSEL_TIER_1,
      color: BASE.moss,
      text: BASE.boneMid,
    },
    {
      label: COUNSEL_TIER_2_LABEL,
      body: COUNSEL_TIER_2,
      color: BASE.gold,
      text: BASE.bone,
    },
  ]
  if (crisis) tiers.reverse()

  return (
    <div style={{
      border: `1px solid ${BASE.borderGold}`, background: BASE.goldDim, padding: '16px 18px',
    }}>
      <div style={{
        fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.18em',
        color: BASE.gold, textTransform: 'uppercase', marginBottom: 9,
      }}>
        {crisis ? 'This needs a person now' : 'This needs a person'}
      </div>

      {/* The engine's own words when it sent them — that string is written in
          the main process, cannot be softened by the model, and for a crisis it
          is the only place the 988 line exists. The static lead is the fallback
          for an engine that sent a bare token and no prose. */}
      <div style={{ marginBottom: 16 }}>
        <Paragraphs
          text={refusal.message || COUNSEL_LEAD}
          color={BASE.bone}
          size={16}
        />
      </div>

      {tiers.map((t, i) => (
        <div
          key={t.label}
          style={
            i === 0
              ? { marginBottom: 14 }
              : { borderTop: `1px solid ${BASE.borderDim}`, paddingTop: 13 }
          }
        >
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.16em',
            color: t.color, textTransform: 'uppercase', marginBottom: 6,
          }}>
            {t.label}
          </div>
          <div style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 15.5, lineHeight: 1.7, color: t.text,
          }}>
            {t.body}
          </div>
        </div>
      ))}

      {/* The document's own handoff line, when it has one. It is written for
          this passage, so it is more specific than anything generic above. */}
      {handoff && handoff.trim() && (
        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BASE.borderDim}`,
        }}>
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.16em',
            color: BASE.steel, textTransform: 'uppercase', marginBottom: 5,
          }}>
            From this reading
          </div>
          <div style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 14.5, lineHeight: 1.65, color: BASE.khaki,
          }}>
            {handoff}
          </div>
        </div>
      )}
    </div>
  )
}

/* ══ chips ══════════════════════════════════════════════════════════════════ */

function Chip({ text, onClick, disabled }: { text: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
        background: disabled ? 'transparent' : `${BASE.olive}44`,
        border: `1px solid ${disabled ? BASE.borderDim : BASE.border}`,
        color: disabled ? BASE.steel : BASE.khaki,
        fontFamily: 'Crimson Pro, serif', fontSize: 14.5, lineHeight: 1.45,
        padding: '9px 12px', transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        if (disabled) return
        const el = e.currentTarget as HTMLElement
        el.style.background = BASE.goldDim
        el.style.borderColor = BASE.borderGold
        el.style.color = BASE.bone
      }}
      onMouseLeave={e => {
        if (disabled) return
        const el = e.currentTarget as HTMLElement
        el.style.background = `${BASE.olive}44`
        el.style.borderColor = BASE.border
        el.style.color = BASE.khaki
      }}
    >
      {text}
    </button>
  )
}

/* ══ the panel ══════════════════════════════════════════════════════════════ */

interface Props {
  doc: PlainReadDoc | null
  analysis: PhrasingAnalysis | null
  apiKey: string
  /** The passage this conversation belongs to. Also the store key. */
  reference: string
  onClose: () => void
}

export function AskPanel({ doc, analysis, apiKey, reference, onClose }: Props) {
  /* One conversation per passage. Loading a different passage opens a clean
     one and leaves the old one intact for the rest of the session. */
  const key = doc?.expandedReference ?? doc?.reference ?? reference

  const turns = useSyncExternalStore(subscribe, () => readTurns(key), () => NO_TURNS)

  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const pending = turns.some(t => t.status === 'pending')

  /* Engine starters, if this passage has fetched them yet. Reading `?? null`
     keeps the snapshot reference-stable for useSyncExternalStore. */
  const engineStarters = useSyncExternalStore(
    subscribe,
    () => STARTERS.get(key) ?? null,
    () => null,
  )

  /**
   * Fetch the engine's starters once per passage.
   *
   * Deliberately fire-and-forget, and deliberately not awaited by anything the
   * reader can see: the derived list below renders on the first frame, so the
   * panel never opens onto an empty box that is "thinking". If this resolves —
   * it is a local call, so it resolves inside the open animation — the better
   * list quietly takes over. If it fails, nothing happens and the reader never
   * learns there was a second option.
   */
  useEffect(() => {
    if (!doc || STARTERS.has(key)) return
    const api = (window as unknown as {
      electronAPI?: { plainAsk?: (p: unknown) => Promise<PlainAskResult> }
    }).electronAPI
    if (typeof api?.plainAsk !== 'function') return

    let cancelled = false
    api.plainAsk({ doc, analysis, question: '', history: [], apiKey })
      .then((res: PlainAskResult) => {
        if (cancelled || STARTERS.has(key)) return
        const list = cleanList(res?.starters ?? res?.suggested, 5)
        if (!list.length) return
        STARTERS.set(key, list)
        LISTENERS.forEach(fn => fn())
      })
      .catch(() => { /* starters are a bonus, never a dependency */ })

    return () => { cancelled = true }
  }, [key, doc, analysis, apiKey])

  const starters = useMemo(() => {
    const shipped = cleanList(doc?.starters, 5)
    if (shipped.length) return shipped
    if (engineStarters?.length) return engineStarters
    return deriveStarters(doc, analysis)
  }, [doc, analysis, engineStarters])

  /* Escape closes. Deliberately NOT a focus trap: the reader can tab out of
     this panel into the document behind it, and nothing here has the right to
     hold the keyboard hostage. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /* Keyboard-first: open it, start typing. No click required to reach the box. */
  useEffect(() => { inputRef.current?.focus() }, [])

  /* Newest turn visible, always. */
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns])

  function send(question: string) {
    const q = question.trim()
    if (!q) return                                  // empty is a no-op, not an error
    if (pending) return                             // one question in flight at a time
    if (!doc || !analysis) return

    const api = (window as unknown as { electronAPI?: { plainAsk?: (p: unknown) => Promise<PlainAskResult> } }).electronAPI
    if (typeof api?.plainAsk !== 'function') return

    setInput('')

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const prior = readTurns(key)
    writeTurns(key, [...prior, {
      id, question: q, status: 'pending',
      answer: null, refusal: null, error: null, suggested: [], startedAt: Date.now(),
    }])

    /* History carries ANSWERED turns only. A refusal is not context for the
       next question — replaying it invites the engine to treat the decline as
       a topic — and a failed turn is not context at all. */
    const history: PlainAskTurn[] = []
    for (const t of prior) {
      if (t.status !== 'answered' || !t.answer) continue
      history.push({ role: 'user', content: t.question })
      history.push({ role: 'assistant', content: t.answer })
    }

    api.plainAsk({ doc, analysis, question: q, history, apiKey })
      .then((res: PlainAskResult) => {
        const answer = typeof res?.answer === 'string' ? res.answer.trim() : ''
        const refusal = normalizeRefusal(res?.refusal, answer)

        /* 'off-text' is NOT a decline, whatever its name on the wire suggests.
           ask.js sets it when the model redirected a question back to what this
           passage does and does not touch — and it still returns a real answer
           plus real follow-ups. Routing it to the refusal path threw that answer
           away and printed the token instead. It renders as an answer, with a
           quiet note that it reached past the passage. */
        if (refusal && refusal.kind === 'off-text') {
          if (answer) {
            patchTurn(key, id, {
              status: 'answered', answer, offText: true,
              suggested: cleanList(res?.suggested, 3),
            })
            return
          }
        } else if (refusal) {
          /* The engine ships follow-ups alongside a personal-counsel refusal on
             purpose — a way back to the text. It deliberately ships NONE for a
             crisis, and that emptiness is honored rather than backfilled. */
          patchTurn(key, id, {
            status: 'refused', refusal, suggested: cleanList(res?.suggested, 3),
          })
          return
        }

        if (!answer) {
          patchTurn(key, id, {
            status: 'failed',
            error: {
              headline: 'No answer came back',
              detail: 'The request finished but returned nothing usable. Ask it again.',
            },
          })
          return
        }
        patchTurn(key, id, {
          status: 'answered', answer, suggested: cleanList(res?.suggested, 3),
        })
      })
      .catch((e: unknown) => {
        // Never a raw provider error. friendlyApiError already knows about
        // out-of-credits, a dead key, being offline and an overloaded API.
        patchTurn(key, id, { status: 'failed', error: friendlyApiError(e) })
      })
  }

  const ready = !!doc && !!analysis && !!apiKey
  const canSend = ready && !pending && input.trim().length > 0

  return (
    <motion.aside
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 14 }}
      transition={{ duration: 0.18 }}
      aria-label={ASK_LABEL}
      style={{
        position: 'absolute', top: 0, bottom: 0, right: RAIL_W,
        width: `min(430px, calc(100% - ${RAIL_W}px))`,
        zIndex: 12,
        background: `${BASE.bg}f6`,
        backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
        borderLeft: `1px solid ${BASE.borderGold}`,
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* ── Header. No avatar, no name, no face — see the note at the top of
             this file. The second line states what is being queried. ─────── */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 12,
        padding: '13px 16px', borderBottom: `1px solid ${BASE.borderGold}`,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 7.5, letterSpacing: '0.2em',
            color: BASE.gold, marginBottom: 5,
          }}>
            {ASK_LABEL}
          </div>
          <div style={{
            fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.boneMid,
            lineHeight: 1.4,
          }}>
            Questions against {doc?.expandedReference ?? doc?.reference ?? reference}
          </div>
        </div>
        <button
          onClick={onClose}
          title="Close (esc)"
          style={{
            flexShrink: 0, width: 26, height: 26, border: `1px solid ${BASE.borderDim}`,
            background: 'transparent', color: BASE.steel, cursor: 'pointer', fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>

      {/* ── Conversation ──────────────────────────────────────────────────── */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px' }}>
        {turns.length === 0 && (
          <>
            {/* The empty state carries the rule. A reader should learn what
                this is before they type into it, not after it declines. */}
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 15.5, lineHeight: 1.72,
              color: BASE.boneMid, marginBottom: 22,
            }}>
              This asks the passage, not a person. Answers are built from{' '}
              {doc?.expandedReference ?? doc?.reference ?? reference} and the reading on this page.
              It does not know you, and it does not give counsel.
            </div>

            {/* Cole asked for these by name. One click sends — a chip that only
                fills the box is two clicks and a reason to hesitate. */}
            <div style={{
              fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.18em',
              color: BASE.gold, textTransform: 'uppercase', marginBottom: 10,
            }}>
              Start with one of these
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {starters.map((s, i) => (
                <Chip key={i} text={s} disabled={!ready} onClick={() => send(s)} />
              ))}
            </div>

            {!ready && (
              <div style={{
                marginTop: 18, fontFamily: 'Crimson Pro, serif', fontSize: 14.5,
                lineHeight: 1.65, color: BASE.steel,
              }}>
                {apiKey
                  ? 'Still reading the passage. This opens the moment the reading lands.'
                  : 'This needs an API key. Add one in settings and it opens.'}
              </div>
            )}
          </>
        )}

        {turns.map(turn => (
          <div key={turn.id} style={{ marginBottom: 26 }}>
            {/* The question, as asked. */}
            <div style={{ marginBottom: 12 }}>
              <div style={{
                fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.18em',
                color: BASE.steel, textTransform: 'uppercase', marginBottom: 5,
              }}>
                You asked
              </div>
              <div style={{
                fontFamily: 'Crimson Pro, serif', fontSize: 15.5, lineHeight: 1.6,
                color: BASE.khaki, fontStyle: 'italic',
                borderLeft: `2px solid ${BASE.border}`, paddingLeft: 12,
              }}>
                {turn.question}
              </div>
            </div>

            {turn.status === 'pending' && (
              <PendingPulse label="Working the text" startedAt={turn.startedAt} />
            )}

            {turn.status === 'answered' && turn.answer && (
              <>
                {/* The answer is labelled by SOURCE, not by speaker. There is
                    no speaker. */}
                <div style={{
                  fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.18em',
                  color: BASE.gold, textTransform: 'uppercase', marginBottom: 7,
                }}>
                  {turn.offText ? 'Past this passage' : 'From the text'}
                </div>

                {/* The engine reached outside the passage to answer. Said once,
                    quietly, above the answer — so the reader knows which of
                    these two things they are holding. */}
                {turn.offText && (
                  <div style={{
                    fontFamily: 'Crimson Pro, serif', fontSize: 14, lineHeight: 1.6,
                    color: BASE.steel, marginBottom: 10, fontStyle: 'italic',
                  }}>
                    That question reaches past {doc?.expandedReference ?? doc?.reference ?? reference}.
                    Here is what this text does and does not touch.
                  </div>
                )}
                {turn.answer.split(/\n{2,}/).map((para, i) => (
                  <p key={i} style={{
                    fontFamily: 'Crimson Pro, serif', fontSize: 16, lineHeight: 1.75,
                    color: BASE.bone, margin: '0 0 12px 0',
                  }}>
                    {para.trim()}
                  </p>
                ))}

                {turn.suggested.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{
                      fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.16em',
                      color: BASE.steel, textTransform: 'uppercase', marginBottom: 8,
                    }}>
                      Ask next
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {turn.suggested.map((s, i) => (
                        <Chip key={i} text={s} disabled={!ready || pending} onClick={() => send(s)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {turn.status === 'refused' && turn.refusal && (
              <>
                <RefusalBlock refusal={turn.refusal} handoff={doc?.handoff} />

                {/* A way back to the text after a decline. The engine sends
                    these with a personal-counsel refusal and sends NONE with a
                    crisis one — handing somebody a study menu mid-crisis is the
                    wrong move, so an empty list stays empty. */}
                {turn.suggested.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{
                      fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.16em',
                      color: BASE.steel, textTransform: 'uppercase', marginBottom: 8,
                    }}>
                      Back to the text
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {turn.suggested.map((s, i) => (
                        <Chip key={i} text={s} disabled={!ready || pending} onClick={() => send(s)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {turn.status === 'failed' && turn.error && (
              <div style={{
                border: `1px solid ${BASE.border}`, background: `${BASE.bgCard}88`,
                padding: '13px 15px',
              }}>
                <div style={{
                  fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.16em',
                  color: BASE.khaki, textTransform: 'uppercase', marginBottom: 6,
                }}>
                  {turn.error.headline}
                </div>
                <div style={{
                  fontFamily: 'Crimson Pro, serif', fontSize: 15, lineHeight: 1.7,
                  color: BASE.boneMid,
                }}>
                  {turn.error.detail}
                </div>
                {turn.error.link && (
                  <div style={{
                    marginTop: 8, fontFamily: 'JetBrains Mono', fontSize: 9,
                    letterSpacing: '0.06em', color: BASE.gold,
                  }}>
                    {turn.error.link}
                  </div>
                )}
                <button
                  onClick={() => send(turn.question)}
                  disabled={pending}
                  style={{
                    marginTop: 12, background: 'transparent',
                    border: `1px solid ${BASE.border}`, color: BASE.khaki,
                    padding: '5px 16px', cursor: pending ? 'default' : 'pointer',
                    fontFamily: 'JetBrains Mono', fontSize: 7.5, letterSpacing: '0.14em',
                  }}
                >[ ASK IT AGAIN ]</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: '11px 16px 14px', borderTop: `1px solid ${BASE.borderDim}`,
      }}>
        <div style={{
          display: 'flex', gap: 9, alignItems: 'flex-end',
          background: `${BASE.olive}33`, border: `1px solid ${BASE.border}`,
          padding: '9px 11px',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
            }}
            /* The placeholder says what is being queried, in case the header
               scrolled out of a very short window. */
            placeholder={`Ask ${doc?.expandedReference ?? doc?.reference ?? reference} a question…`}
            rows={1}
            disabled={!ready}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
              fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.bone,
              lineHeight: 1.5, maxHeight: 110, overflowY: 'auto',
            }}
            onInput={e => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 110) + 'px'
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!canSend}
            title="Send"
            style={{
              flexShrink: 0, width: 30, height: 30,
              background: canSend ? BASE.goldMid : `${BASE.olive}44`,
              border: `1px solid ${canSend ? BASE.borderGold : BASE.borderDim}`,
              color: canSend ? BASE.gold : BASE.steel,
              cursor: canSend ? 'pointer' : 'default', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >↑</button>
        </div>
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 6.5, letterSpacing: '0.1em',
          color: BASE.steel, marginTop: 6, opacity: 0.75,
        }}>
          enter to send · shift+enter for a new line · esc to close
        </div>
      </div>
    </motion.aside>
  )
}
