export type ClauseType =
  | 'main'
  | 'purpose'
  | 'result'
  | 'condition'
  | 'concession'
  | 'temporal'
  | 'causal'
  | 'relative'
  | 'infinitival'
  | 'participial'
  | 'contrast'

export interface Phrase {
  id: string
  text: string
  type: ClauseType
  level: number
  parentId: string | null
  connective: string | null
  connectiveFunction: string | null
  role: 'subject' | 'predicate' | 'object' | 'modifier'
  theologicalNote: string
}

export interface OutlinePoint {
  point: string
  label: string
  verses?: string
  sub?: OutlinePoint[]
}

export interface CanonicalContext {
  bookTheme: string
  passageRole: string
  biblicalThemes: string[]
  canonicalConnections: string
  keyWords: string[]
}

export type GenreType =
  | 'Narrative'
  | 'Law'
  | 'Poetry'
  | 'Wisdom'
  | 'Prophecy'
  | 'Epistle'
  | 'Gospel'
  | 'Apocalyptic'
  | 'Discourse'

export interface GenreAnalysis {
  genre: GenreType
  subgenre: string        // e.g. "Pauline Theological Argument" or "Historical Narrative"
  readingRules: string[]  // 4–6 hermeneutical principles specific to this genre
}

export interface PhrasingAnalysis {
  reference: string
  passageText?: string
  passageReference?: string
  translation?: string
  mainTheme: string
  authorIntent?: {
    doing: string
    inOrderThat: string
  } | null
  phrases: Phrase[]
  outline: OutlinePoint[]
  canonicalContext: CanonicalContext
  culturalNotes?: CulturalNote[]
  genre?: GenreAnalysis
  geoReferences?: GeoReference[]
  questionsToConsider?: string[]
}

export interface GeoReference {
  place: string
  verses: string[]
  significance: string
}

export interface CrossRef {
  reference: string
  reason: string
}

export interface WordStudy {
  word: string
  original: string
  transliteration: string
  strongs: string
  gloss: string
  parsing?: string
  semanticRange: string
  translationNote?: string
  whyItMatters?: string
  confidence?: 'high' | 'medium' | 'low'
  limits?: string
  keyUses: string[]
}

export type CulturalCategory =
  | 'greco-roman'
  | 'jewish'
  | 'roman-legal'
  | 'ane'
  | 'hellenistic'
  | 'household-code'
  | 'honor-shame'

export interface CulturalNote {
  id: string
  phraseId: string
  term: string
  category: CulturalCategory
  explanation: string
  significance: string
  claimStatus?: 'well-attested' | 'inferred' | 'disputed'
  sourceBasis?: 'passage' | 'biblical-intertext' | 'historical-background'
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface HistoryEntry {
  id: string
  savedAt: string
  analysis: PhrasingAnalysis
  annotations: Record<string, string>
  draft?: string
  scholarMessages?: ChatMessage[]
}

// ── PLAIN READ ────────────────────────────────────────────────────────────────
// The reader-facing second mode. Mirrors the object electron/plainread/pipeline.js
// returns after validate.js has normalized it. Anything validate.js can null out
// is nullable here; anything it throws on is required here.

/** A named route from this passage to Christ. null is a normal, correct answer. */
export type ChristPathway =
  | 'direct-prophecy'
  | 'typology'
  | 'promise-fulfillment'
  | 'thematic-fulfillment'
  | 'ethical-mission-continuity'
  | 'prophet-priest-king'

/** The four ways a text can land on a reader. */
export type ApplicationFace = 'duty' | 'character' | 'goals' | 'discernment'

/** The shape of the single step. The dominant face decides which one. */
export type ApplicationStepKind = 'plan' | 'practice' | 'reorder' | 'question'

/** One of the six reasoning steps. */
export interface PlainReadStep {
  body: string
  /** One thing the reader can verify with a Bible and their own eyes. */
  youCanCheck: string
  /** The transferable skill — what to do next time, on a different passage. */
  theMove: string
}

export interface PlainReadMisread {
  exists: boolean
  claim: string
  whyNot: string
  biggerNotSmaller: string
}

export interface PlainReadMeaning {
  plain: string
  misread: PlainReadMisread | null
  assumes: string
  level: string | null
}

export interface PlainReadWork {
  genre: PlainReadStep
  setting: PlainReadStep
  surroundings: PlainReadStep
  words: PlainReadStep
  story: PlainReadStep
  doing: PlainReadStep
  christPathway: ChristPathway | null
}

/** cue + action stay SEPARATE on purpose — the renderer composes the sentence. */
export interface PlainReadApplicationStep {
  kind: ApplicationStepKind
  cue: string | null
  action: string | null
  question: string | null
}

export interface PlainReadApplication {
  faces: ApplicationFace[]
  dominantFace: ApplicationFace
  toThemFirst: string
  thenToYou: string
  step: PlainReadApplicationStep
}

export interface PlainReadDiffer {
  tier: 'secondary' | 'tertiary' | null
  summary: string
  views: string[]
}

/**
 * The behavior-change caveat. Rendered verbatim from mechanics.json or not at
 * all — null until the clinical review gate opens, which is the correct state.
 */
export interface PlainReadMechanic {
  id: string
  form: string
  caveat: string
  backfire: string
  deliveryCaveat: string
  sources: string[]
}

/**
 * One unit of the exegetical outline — a verse range the author treats as a
 * single move, plus the connective that links it to the unit before it.
 *
 * `logic` is the LINK INTO this unit ("contrast", "ground", "result"), not a
 * description of the unit itself. It renders between units for that reason.
 * The first unit normally has none.
 */
export interface PlainReadOutlineUnit {
  ref: string
  heading: string
  logic: string | null
  children?: PlainReadOutlineUnit[]
}

/**
 * The shape of the text. This is the study apparatus, not preaching
 * scaffolding: it shows the reader how the passage is built, which is the one
 * thing a first-time reader cannot see on their own.
 */
export interface PlainReadOutline {
  /** One line: how the whole passage is put together. */
  shape: string
  units: PlainReadOutlineUnit[]
}

/** What the fact-check pass decided about one claim. */
export type VerificationVerdict =
  | 'INTERPRETIVE'
  | 'CONFIRMED'
  | 'GROUNDED'
  | 'UNVERIFIABLE'
  | 'REFUTED'

export interface PlainReadVerificationNote {
  step: string
  verdict: VerificationVerdict
  claim: string | null
  reason: string | null
  grounded?: boolean
  /** What was done to the text: kept, removed, replaced, blanked, rejected-rewrite. */
  action: string
  summary: string
}

/**
 * The claim-check record, written by electron/plainread/verify.js.
 * 'skipped' means the pass was deliberately not run; 'failed' means it broke
 * and the document is unchecked. Neither is an error the reader must action.
 */
export interface PlainReadVerification {
  status: 'ok' | 'skipped' | 'failed'
  model: string | null
  promptVersion: number
  checked: number
  confirmed: number
  interpretive?: number
  grounded?: number
  unverifiable: number
  refuted: number
  missing?: number
  notes: PlainReadVerificationNote[]
}

/**
 * How solid the historical setting is.
 *
 * This is a DISCLOSURE, not a score. It never renders as a percentage, a bar,
 * or a confidence number — a reader is owed the plain word and nothing that
 * dresses a reconstruction up as a measurement.
 *
 *   documented    — a record outside the text says so.
 *   reconstructed — built from the text and the period; no record states it.
 *   uncertain     — careful readers place it differently.
 */
export type SituationConfidence = 'documented' | 'reconstructed' | 'uncertain'

/**
 * The briefing that runs BEFORE the passage: the room the text was written
 * into. Rendered above everything else in the document, because a reader who
 * does not know what was pressing on the first hearers will read their own
 * pressure into it and never notice they did.
 */
export interface PlainReadSituation {
  /** When it was written, in the reader's terms. Rendered as a tight label. */
  when: string
  /** Where from, and where to. Rendered as a tight label. */
  where: string
  /** What was pressing on the people this was written to. The body of the card. */
  pressure: string
  /** The payoff line — why the pressure changes how the passage reads. */
  soWhat: string
  confidence: SituationConfidence
  /**
   * INTERNAL ONLY. Whether the setting came out of the vault rather than the
   * model's own knowledge. It carries no meaning for a reader and must never
   * be given a user-facing label, badge, mark, or tooltip.
   */
  vaultSourced: boolean
}

export interface PlainReadDoc {
  reference: string
  /** Set only when a single verse was widened to its paragraph. */
  expandedReference: string | null
  /** The on-screen notice that the widening happened. Never silent. */
  expandReason: string | null
  sensitive: boolean
  /**
   * The setting, rendered first. Required by the contract; the renderer still
   * guards on it, because a reader losing the whole document to a missing
   * briefing block is a worse failure than a document with no briefing.
   */
  situation: PlainReadSituation
  /**
   * Starter questions for ASK THE OPERATOR, when the engine computed them with
   * the document. Absent is normal — the panel derives its own from the outline
   * and the key words rather than spending a round trip to open a text box.
   */
  starters?: string[] | null
  /**
   * The exegetical outline. Optional on the type because the engine may not
   * have produced one for this document — the renderer hides the section
   * silently rather than showing an empty box.
   */
  outline?: PlainReadOutline | null
  meaning: PlainReadMeaning
  work: PlainReadWork
  distance: string
  application: PlainReadApplication
  restraint: string[]
  differ: PlainReadDiffer | null
  unknowns: string[]
  handoff: string
  mechanic: PlainReadMechanic | null
  verification?: PlainReadVerification | null
  vault?: {
    sourced: boolean
    noteCount: number
    packVersion: number
    builtOn: string | null
  }
  promptVersion: number
  readingLevel?: string
  fromCache: boolean
}

// ── WHAT THE READER IS TOLD WHILE THE RUN IS STILL RUNNING ──────────────────
// The document is not fast and is not being made shorter to become fast. What
// changes is that the reader stops staring at nothing: the passage is on screen
// about a second after SEND IT, and the line above it says what the machine is
// actually doing. These two types are the wire shapes that make that honest.

/**
 * One `analysis-progress` message, emitted by the `analyze-passage` handler in
 * electron/main.js. `stage` is the handler's own name for the step that just
 * happened — 'start', 'calls-dispatched', 'structure', 'theme', 'culture',
 * 'complete' at time of writing.
 *
 * TYPED AS A BARE STRING ON PURPOSE. A union here would turn a stage the main
 * process adds later into a compile error in the renderer, and the renderer's
 * job is to survive that, not to police it: an unrecognised stage is shown as
 * itself, tidied, because the one thing the status line may never do is invent
 * progress that did not happen.
 *
 * `streamId` is the caller's own token, echoed back, so a late message from an
 * abandoned run cannot drive the status line of the current one.
 */
export interface AnalysisProgress {
  streamId?: string
  stage?: string
}

/**
 * THE BACKGROUND CLAIM CHECK, LANDING.
 *
 * Verification is moving off the critical path in the main process: the reading
 * is handed to the reader as soon as it is written, and the checker's
 * corrections arrive afterwards on an event. This is the shape the renderer
 * accepts when they do — either a document directly, or a document wrapped with
 * the reference it belongs to.
 *
 * THE CHECKER IS INVISIBLE. Nothing on this type may become a badge, a tick, a
 * toast, or a footer. A corrected document replaces the one on screen silently.
 * The reader may see a step's wording change; the reader may never be told that
 * a check happened. `verification` already rides on PlainReadDoc for logs.
 *
 * THE CHANNEL NOW EXISTS. electron/preload.js exposes it as
 * `onPlainReadVerified(cb)` over the 'plain-read-verified' event, and this is
 * the payload that handler receives. Every field is optional here even though
 * the sender fills most of them: App.tsx still discovers the bridge method at
 * runtime, and a renderer that trusts a field to be present is a renderer that
 * throws inside an event handler when it is not.
 *
 * MATCH BEFORE YOU SWAP. Two passages studied in quick succession produce two
 * independent checks, and the first can land second. `requestId` is the token
 * the renderer sent with its own plain-read call, echoed back; it is the only
 * exact answer to "is this correction for what is on screen right now".
 */
export interface PlainReadCorrection {
  /** The token the renderer sent with this reading's plain-read call. */
  requestId?: string | null
  /** The reference the reader asked for, as sent. */
  requestedReference?: string | null
  /** The reference the corrected document belongs to. */
  reference?: string | null
  /** Which reading level the corrected document was written at. */
  readingLevel?: string | null
  /** The whole corrected document. Replace with it — never merge into it. */
  doc?: PlainReadDoc
}

// ── COVENANT GROUP GUIDE ────────────────────────────────────────────────────

export type GroupGuidePhase = 'observation' | 'interpretation' | 'application'

export type GroupGuideStepId =
  | 'contextualize'
  | 'observe'
  | 'verify'
  | 'examine'
  | 'name'
  | 'anchor'
  | 'navigate'
  | 'teach'

export type GroupGuideAnswerClass =
  | 'TEXT_EXPLICIT'
  | 'INTERPRETATION_BOUNDED'
  | 'DISPUTED'
  | 'PASTORAL_OPEN'

export interface GroupGuideClaim {
  claim: string
  status: 'sourced' | 'inferred' | 'disputed'
  source: string
}

export interface GroupGuideView {
  view: string
  supportingEvidence: string[]
}

export interface GroupGuideLeaderKey {
  answerClass: GroupGuideAnswerClass
  conciseAnswer: string | null
  textualEvidence: string[]
  acceptableRange: string[]
  disputedViews: GroupGuideView[]
  answerLimits: string[]
  pastoralGuidance: string | null
}

export interface GroupGuideQuestion {
  id: string
  phase: GroupGuidePhase
  covenantStep: GroupGuideStepId
  passageAnchors: string[]
  participantPrompt: string
  embeddedClaims: GroupGuideClaim[]
  leaderKey: GroupGuideLeaderKey
}

export interface GroupGuideStep {
  id: GroupGuideStepId
  summary: string
  questionIds: string[]
}

export interface GroupGuide {
  reference: string
  title: string
  bigIdea: string
  opening: {
    prompt: string
    leaderNote: string
    allowPass: true
  }
  steps: GroupGuideStep[]
  questions: GroupGuideQuestion[]
  prayerPrompt: string
  promptVersion: number
  verification?: {
    status: 'verified'
    model: string
    promptVersion: number
    verifiedAt: string
  }
  updatedAt?: string
}

// ── ASK THE OPERATOR ──────────────────────────────────────────────────────────
// The question surface over a single passage. It queries THIS TEXT. It is not a
// person, it has no persona, and it gives no counsel — see AskPanel.tsx, where
// that rule is load-bearing on the name itself.

/**
 * Why a question was declined.
 *
 * 'personal-counsel' is the one that matters: the reader asked about their own
 * life, and the honest answer is a person, not a text tool. Everything else is
 * an ordinary out-of-scope decline and renders as one calm sentence.
 *
 * Widened with 'other' on purpose. An unrecognised kind from the engine must
 * degrade to a calm decline, never to an error and never to silence.
 *
 * 'off-text' is the engine's own wire value and is NOT really a refusal — see
 * PlainAskWireRefusal below. It is listed here so a normalizer can name it
 * without falling through to 'other'.
 */
export type PlainAskRefusalKind =
  | 'personal-counsel'
  | 'off-passage'
  | 'out-of-scope'
  | 'unsafe'
  | 'off-text'
  | 'other'

/**
 * WHAT THE ENGINE ACTUALLY PUTS ON THE WIRE.
 *
 * electron/plainread/ask.js returns `refusal` as a BARE STRING, not as an
 * object — `{ answer, refusal: 'off-text'|'personal-counsel'|'unsafe'|null,
 * suggested }` — and electron/main.js passes that through untouched. Reading it
 * as `{ kind, message }` yields `kind: 'other'` and prints the raw wire token
 * ("personal-counsel") at the reader. The renderer normalizes; this type is the
 * record of what it has to normalize FROM.
 *
 * Two things ride with a refusal and must not be dropped:
 *   - `answer` is still populated, and for 'unsafe' it is the only place the
 *     crisis line (988) exists.
 *   - 'off-text' carries a genuine redirect answer. It is a caveat, not a
 *     decline, and the answer is meant to be read.
 */
export type PlainAskWireRefusal =
  | 'off-text'
  | 'personal-counsel'
  | 'unsafe'
  | null

export interface PlainAskRefusal {
  kind: PlainAskRefusalKind
  /** One plain sentence the reader sees. Never an error string. */
  message: string
}

/** One prior turn, sent back as context. */
export interface PlainAskTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface PlainAskRequest {
  doc: PlainReadDoc
  analysis: PhrasingAnalysis
  question: string
  history: PlainAskTurn[]
  apiKey: string
}

/**
 * The IPC result.
 *
 * `answer` and `refusal` are NOT mutually exclusive — that was the original
 * assumption here and it is wrong. The shipped engine sends both together on
 * every refusing path, and the prose in `answer` is the part the reader needs
 * most (it is where the 988 line lives). Read both, always.
 *
 * `refusal` is typed to accept the wire string the engine really sends AND the
 * object form, so a future engine that switches to `{ kind, message }` does not
 * break the renderer. Normalization happens in AskPanel.tsx.
 *
 * `suggested` is the follow-on questions this answer opened up; `starters` may
 * ride along for engines that compute them here rather than with the document.
 * The shipped engine returns starters in `suggested` when the question is
 * blank — see the `plain-ask` handler in electron/main.js.
 */
export interface PlainAskResult {
  answer: string | null
  refusal: PlainAskWireRefusal | PlainAskRefusal | string | null
  suggested: string[] | null
  starters?: string[] | null
}
