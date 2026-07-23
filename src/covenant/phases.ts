// The C.O.V.E.N.A.N.T. framework as the app's operating spine.
// Eight phases, verbatim from the Spiritual Operator's Manual ch. 2 —
// the book teaches the method; the app runs it.

import type { PhrasingAnalysis } from '../types/phrasing'

export type PhaseStatus = 'open' | 'partial' | 'verified'

export interface VerifyCtx {
  analysis: (PhrasingAnalysis & {
    authorIntent?: { doing: string; inOrderThat: string } | null
    questionsToConsider?: string[]
    geoReferences?: unknown[]
  }) | null
  draft?: string
  manual: Record<string, boolean>   // pastor's own sign-offs, per phase id
}

export interface CovenantPhase {
  id: string
  letter: string
  title: string
  question: string          // the phase's driving question (from the book)
  objective: string         // OPORD voice — what "done" means
  fieldGuide: string[]      // where in the app the work happens
  actions: { label: string; action: string }[]   // dispatched by App
  autoVerify: (ctx: VerifyCtx) => PhaseStatus    // before manual sign-off
}

const has = (v: unknown) => Array.isArray(v) ? v.length > 0 : Boolean(v)

export const PHASES: CovenantPhase[] = [
  {
    id: 'contextualize', letter: 'C', title: 'Contextualize',
    question: 'What did this mean to them before it can mean anything to us?',
    objective: 'Hold the original ground: author, audience, occasion, geography, political and religious climate — before a single modern application is drawn.',
    fieldGuide: ['Cultural Notes (left sidebar) — first-century background', 'Map tile (+ ADD on the desk) — the geography flies to the text'],
    actions: [
      { label: 'ASK THE EXEGETE', action: 'agent-exegetical' },
    ],
    autoVerify: ({ analysis }) =>
      has(analysis?.culturalNotes) && has((analysis as any)?.geoReferences) ? 'verified'
      : has(analysis?.culturalNotes) ? 'partial' : 'open',
  },
  {
    id: 'observe', letter: 'O', title: 'Observe the Covenant Narrative',
    question: "Where am I in God's unfolding plan of redemption?",
    objective: 'Locate the passage in the covenant storyline — which covenant is operative, and how its promises and stipulations shape the text.',
    fieldGuide: ['Canonical strip (under the toolbar) — book theme + biblical themes', 'Book Compass — the whole-Bible position of this book'],
    actions: [
      { label: 'OPEN BOOK COMPASS', action: 'compass' },
      { label: 'ASK THE THEOLOGIAN', action: 'agent-theological' },
    ],
    autoVerify: ({ analysis }) =>
      has(analysis?.canonicalContext?.biblicalThemes) ? 'partial' : 'open',
  },
  {
    id: 'verify', letter: 'V', title: 'Verify Authorial Intent',
    question: 'What did the human author, inspired by the Spirit, mean to communicate?',
    objective: "Drill the grammar until you can state the author's point in one sentence — task and purpose.",
    fieldGuide: ['The phrasing tree — clause hierarchy IS the argument', 'Click any word for original-language study', "Author's intent card (Pre-Preach Checks)"],
    actions: [
      { label: 'OPEN PRE-PREACH CHECKS', action: 'checklist' },
    ],
    autoVerify: ({ analysis }) =>
      has(analysis?.phrases) && has((analysis as any)?.authorIntent) ? 'verified'
      : has(analysis?.phrases) ? 'partial' : 'open',
  },
  {
    id: 'examine', letter: 'E', title: 'Examine Genre',
    question: 'What rules of interpretation does this kind of writing demand?',
    objective: 'Read it the way God inspired it to be read — poetry is not prophecy, epistle is not apocalyptic.',
    fieldGuide: ['Genre card on the desk — reading rules specific to THIS passage'],
    actions: [],
    autoVerify: ({ analysis }) => has(analysis?.genre) ? 'verified' : 'open',
  },
  {
    id: 'name', letter: 'N', title: 'Name the Faithfulness of God',
    question: 'What is God doing, and how is He keeping His promises?',
    objective: 'Shift from human action to divine initiative — name the attributes on display and the promises being kept.',
    fieldGuide: ['Theme card — is the main theme about God or about us?', 'Scholar chat — press on what God is DOING in the text'],
    actions: [
      { label: 'OPEN SCHOLAR CHAT', action: 'scholar' },
    ],
    autoVerify: ({ analysis }) => has(analysis?.mainTheme) ? 'partial' : 'open',
  },
  {
    id: 'anchor', letter: 'A', title: 'Anchor Every Text in Christ',
    question: 'How does this passage point to, prepare for, or find fulfillment in Jesus?',
    objective: "Connect the text to Christ along the pathway the author embedded — promise, prophecy, type, or theme — without forcing it.",
    fieldGuide: ['Canonical connections (canonical strip)', 'Cross-refs bar — the gospel pathways out of this text'],
    actions: [
      { label: 'ASK THE THEOLOGIAN', action: 'agent-theological' },
    ],
    autoVerify: ({ analysis }) =>
      has(analysis?.canonicalContext?.canonicalConnections) ? 'partial' : 'open',
  },
  {
    id: 'navigate', letter: 'N', title: 'Navigate Tensions',
    question: 'What hard truths does this passage hold, and how do I honor them?',
    objective: 'Refuse to flatten biblical tension. Name the paradoxes and preach them as they stand.',
    fieldGuide: ['Think-It-Through questions (Pre-Preach Checks) — the tensions are listed there'],
    actions: [
      { label: 'OPEN THE QUESTIONS', action: 'checklist' },
    ],
    autoVerify: ({ analysis }) =>
      has((analysis as any)?.questionsToConsider) ? 'partial' : 'open',
  },
  {
    id: 'teach', letter: 'T', title: 'Teach for Transformation',
    question: 'How does this truth change who we are and how we live?',
    objective: 'Move from interpretation to Spirit-empowered application. Draft the sermon, run the watchdog, generate the Mission Brief.',
    fieldGuide: ['Draft tile on the desk — the 3-agent pipeline', 'Eisegesis watchdog (FLAG CHECK) before you finalize', 'Mission Brief — the 5-paragraph OPORD'],
    actions: [
      { label: 'ASK THE HOMILETICIAN', action: 'agent-homiletical' },
      { label: 'FINAL CLEARANCE', action: 'checklist' },
    ],
    autoVerify: ({ draft }) => (draft && draft.trim().length > 200) ? 'partial' : 'open',
  },
]

// ── Persistence: manual sign-offs per passage ────────────────────────────────
export function loadCovenantState(reference: string): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(`covenant-${reference}`) ?? '{}') } catch { return {} }
}
export function saveCovenantState(reference: string, manual: Record<string, boolean>) {
  localStorage.setItem(`covenant-${reference}`, JSON.stringify(manual))
}

export function phaseStatus(phase: CovenantPhase, ctx: VerifyCtx): PhaseStatus {
  if (ctx.manual[phase.id]) return 'verified'
  return phase.autoVerify(ctx)
}
