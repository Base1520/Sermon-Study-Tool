'use strict'

const crypto = require('crypto')
const { lookupPassage } = require('../plainread/vault/index.js')

const MODEL = 'claude-opus-4-8'
const PROMPT_VERSION = 3
const MAX_TOKENS = 16000
const SOURCE_CHAR_BUDGET = 6000

const COVENANT_STEPS = [
  {
    id: 'contextualize',
    letter: 'C',
    title: 'Contextualize',
    question: 'What did this mean to them before it can mean anything to us?',
  },
  {
    id: 'observe',
    letter: 'O',
    title: 'Observe the Covenant Narrative',
    question: "Where am I in God's unfolding plan of redemption?",
  },
  {
    id: 'verify',
    letter: 'V',
    title: 'Verify Authorial Intent',
    question: 'What did the human author, inspired by the Spirit, mean to communicate?',
  },
  {
    id: 'examine',
    letter: 'E',
    title: 'Examine Genre',
    question: 'What rules of interpretation does this kind of writing demand?',
  },
  {
    id: 'name',
    letter: 'N',
    title: 'Name the Faithfulness of God',
    question: 'What is God doing, and how is He keeping His promises?',
  },
  {
    id: 'anchor',
    letter: 'A',
    title: 'Anchor Every Text in Christ',
    question: 'How does this passage point to, prepare for, or find fulfillment in Jesus?',
  },
  {
    id: 'navigate',
    letter: 'N',
    title: 'Navigate Tensions',
    question: 'What hard truths does this passage hold, and how do I honor them?',
  },
  {
    id: 'teach',
    letter: 'T',
    title: 'Teach for Transformation',
    question: 'How does this truth change who we are and how we live?',
  },
]

const STEP_IDS = new Set(COVENANT_STEPS.map((step) => step.id))
const PHASES = ['observation', 'interpretation', 'application']
const ANSWER_CLASSES = [
  'TEXT_EXPLICIT',
  'INTERPRETATION_BOUNDED',
  'DISPUTED',
  'PASTORAL_OPEN',
]
const CLAIM_STATUSES = ['sourced', 'inferred', 'disputed']

class GroupGuideValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GroupGuideValidationError'
  }
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function cleanText(value, max = 2000) {
  return isText(value) ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function nullableText(value, max = 2000) {
  const text = cleanText(value, max)
  return text || null
}

function cleanList(value, maxItems = 8, maxChars = 600) {
  if (!Array.isArray(value)) return []
  return value.map((item) => cleanText(item, maxChars)).filter(Boolean).slice(0, maxItems)
}

function classifySourceNote(note) {
  const text = String(note || '')
  if (
    /\b(?:amil|premil|postmil|dispensational|idealist|preterist|futurist|conditionalist)\b/i.test(text) ||
    /\b(?:most naturally reads|key text for|one view|another view|disputed|debated|argued)\b/i.test(text)
  ) return 'disputed'

  if (
    /\b(?:pastoral force|reading rule|echoes|hinge|stands behind|stands for|symbolic|shorthand|portray|signif|fulfill|tension)\b/i.test(text) ||
    /\s=\s/.test(text)
  ) return 'interpretive'

  return 'background'
}

function looksTruncatedSourceNote(note) {
  const text = String(note || '').trim()
  if (!text) return true
  if (/\b(?:the|a|an|and|or|but|of|to|for|with|from|in|on|at|by|as|that|which|who|whose|its|their|this|these|those)\.$/i.test(text)) {
    return true
  }
  const quoteCount = (text.match(/["“”]/g) || []).length
  if (quoteCount % 2 !== 0) return true
  return (text.match(/\(/g) || []).length !== (text.match(/\)/g) || []).length
}

function collectSourceNotes(reference) {
  const hit = lookupPassage(reference, { maxNotes: 18, maxBookNotes: 6 })
  if (!hit?.notes?.length) return []

  const notes = []
  let chars = 0
  for (const raw of hit.notes) {
    const text = cleanText(raw, 1600)
    if (!text) continue
    if (looksTruncatedSourceNote(text)) continue
    if (chars + text.length > SOURCE_CHAR_BUDGET) break
    notes.push({ status: classifySourceNote(text), text })
    chars += text.length
  }
  return notes
}

function sourcePayload(analysis, plainDoc) {
  const verificationOk = plainDoc?.verification?.status === 'ok'
  return {
    reference: analysis?.reference ?? null,
    passageText: analysis?.passageText ?? null,
    translation: analysis?.translation ?? null,
    provisionalAnalysis: {
      phrases: Array.isArray(analysis?.phrases)
        ? analysis.phrases.map((phrase) => ({
            text: phrase.text,
            type: phrase.type,
            connective: phrase.connective ?? null,
          }))
        : [],
      genre: analysis?.genre ?? null,
    },
    verifiedPlainRead: verificationOk
      ? {
          meaning: plainDoc.meaning ?? null,
          outline: plainDoc.outline ?? null,
          restraint: plainDoc.restraint ?? [],
          differ: plainDoc.differ ?? null,
          unknowns: plainDoc.unknowns ?? [],
        }
      : null,
    sourceNotes: collectSourceNotes(analysis?.reference ?? ''),
  }
}

function guideKeyFor(analysis) {
  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      reference: analysis?.reference ?? null,
      passageText: analysis?.passageText ?? null,
      mainTheme: analysis?.mainTheme ?? null,
      authorIntent: analysis?.authorIntent ?? null,
      phrases: analysis?.phrases ?? null,
    }))
    .digest('hex')
    .slice(0, 12)
  return `group-guide-v${PROMPT_VERSION}-${fingerprint}`
}

const GUIDE_SYSTEM = `
You build an editable small-group Bible discussion guide from one passage.

This is not a sermon, a manuscript, or a devotional monologue. The guide helps a
leader walk a group through the C.O.V.E.N.A.N.T. method without burying them in
text. Each step gets a short summary and only the questions assigned to it.

THE COVENANT PATH
1. C — Contextualize: What did this mean to them before it can mean anything to us?
2. O — Observe the Covenant Narrative: Where is this in God's unfolding plan?
3. V — Verify Authorial Intent: What is the author doing with these words?
4. E — Examine Genre: What reading rules does this kind of writing require?
5. N — Name the Faithfulness of God: What is God doing and revealing here?
6. A — Anchor Every Text in Christ: What warranted pathway connects this text to Christ?
7. N — Navigate Tensions: What must remain unresolved, qualified, or disputed?
8. T — Teach for Transformation: What text-native response follows in worship, obedience, or mission?

SOURCE DISCIPLINE
- The supplied passage text is the controlling authority.
- "provisionalAnalysis" is a lead, not an authority. Correct it when the passage
  does not support it.
- "verifiedPlainRead" has passed a claim check, but interpretation inside it is
  still interpretation. Do not turn a reading into an explicit statement of the text.
- Source notes carry a status:
  BACKGROUND may support a careful historical statement.
  INTERPRETIVE must be labeled as an inference or reading.
  DISPUTED may appear only as a disputed view paired with a real alternative.
- Never invent Roman customs, Jewish practices, geography, Greek or Hebrew
  details, dates, quotations, or named scholarly conclusions.
- Never identify a modern nation from an apocalyptic symbol.
- Never make chronology, millennial systems, the identity of a symbol, the
  participants in a judgment scene, or the nature of final punishment sound
  settled when careful orthodox readers disagree.
- Do not flatten a mixed audience into one spiritual condition. In Revelation,
  the seven churches include faithful, afflicted, compromised, complacent, and
  self-deceived congregations. Address them as a mixed church audience receiving
  both comfort and warning, not simply as "a persecuted church."
- If the passage does not settle a question, the leader key must say so.

QUESTION CONTRACT
- Return exactly 10 questions: 3 observation, then 4 interpretation, then 3 application.
- Observation questions use TEXT_EXPLICIT and are answerable from the supplied passage.
- Interpretation questions use INTERPRETATION_BOUNDED or DISPUTED.
- Application questions use PASTORAL_OPEN. They have no single correct personal
  answer and conciseAnswer must be null.
- Every question has a COVENANT step. Across the ten questions, all eight steps
  must appear at least once.
- Every question names one or more passage anchors.
- Never put the conclusion inside the question. Ask "What evidence supports each
  reading?" rather than "Why is this the same battle?"
- Application must trace to the text. Never grade vulnerability, force disclosure,
  assign a hidden reason for suffering, promise immediate relief, or demand public confession.
- A participant may pass on any personal question.

LEADER KEY
- TEXT_EXPLICIT: give the concise textual answer and exact evidence.
- INTERPRETATION_BOUNDED: give the best bounded answer, the evidence, and its limit.
- DISPUTED: give at least two views, evidence for each, and the shared certainty.
- PASTORAL_OPEN: say there is no single answer; give a facilitator aim and safety boundary.
- "acceptableRange" names faithful responses, not preferred wording.
- "answerLimits" names what the passage does not establish.

The provider will place your compact guide serialization inside one guideJson
string. Fill that string with one complete JSON object and no markdown fence.
`.trim()

const SCHEMA_PROMPT = `
Write a complete JSON serialization inside guideJson with this compact shape:
{
  "reference": "string",
  "title": "string",
  "bigIdea": "string",
  "openingPrompt": "string",
  "openingLeaderNote": "string",
  "stepSummaries": {
    "contextualize": "string", "observe": "string", "verify": "string",
    "examine": "string", "name": "string", "anchor": "string",
    "navigate": "string", "teach": "string"
  },
  "questions": {
    "q1": {
      "covenantStep": "one exact step id",
      "passageAnchors": ["verse reference"],
      "participantPrompt": "question ending in ?",
      "answerClass": "phase-appropriate class",
      "conciseAnswer": "string",
      "textualEvidence": ["string"],
      "acceptableRange": ["string"],
      "disputedViews": ["view plus its evidence"],
      "answerLimits": ["string"],
      "pastoralGuidance": "string"
    }
  },
  "prayerPrompt": "string"
}

Fill q1 through q10 with that same question shape. q1-q3 are observation and
must use TEXT_EXPLICIT. q4-q7 are interpretation and must use
INTERPRETATION_BOUNDED or DISPUTED. q8-q10 are application and must use
PASTORAL_OPEN with conciseAnswer set to an empty string. Assign all eight
COVENANT step ids across the ten questions. For a DISPUTED answer,
disputedViews must contain at least two concise strings, each naming a view and
the evidence that supports it.
`.trim()

const QUESTION_SLOTS = [
  { id: 'q1', phase: 'observation' },
  { id: 'q2', phase: 'observation' },
  { id: 'q3', phase: 'observation' },
  { id: 'q4', phase: 'interpretation' },
  { id: 'q5', phase: 'interpretation' },
  { id: 'q6', phase: 'interpretation' },
  { id: 'q7', phase: 'interpretation' },
  { id: 'q8', phase: 'application' },
  { id: 'q9', phase: 'application' },
  { id: 'q10', phase: 'application' },
]

function outputStringArraySchema() {
  return {
    type: 'array',
    items: { type: 'string' },
  }
}

function outputCompactQuestionSchema(phase) {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'covenantStep',
      'passageAnchors',
      'participantPrompt',
      'answerClass',
      'conciseAnswer',
      'textualEvidence',
      'acceptableRange',
      'disputedViews',
      'answerLimits',
      'pastoralGuidance',
    ],
    properties: {
      covenantStep: { type: 'string', enum: [...STEP_IDS] },
      passageAnchors: outputStringArraySchema(),
      participantPrompt: { type: 'string' },
      answerClass: {
        type: 'string',
        enum: phase === 'application'
          ? ['PASTORAL_OPEN']
          : phase === 'observation'
            ? ['TEXT_EXPLICIT']
            : ['INTERPRETATION_BOUNDED', 'DISPUTED'],
      },
      conciseAnswer: { type: 'string' },
      textualEvidence: outputStringArraySchema(),
      acceptableRange: outputStringArraySchema(),
      disputedViews: outputStringArraySchema(),
      answerLimits: outputStringArraySchema(),
      pastoralGuidance: { type: 'string' },
    },
  }
}

const GUIDE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['guideJson'],
  properties: {
    guideJson: { type: 'string' },
  },
}

const VERIFY_SYSTEM = `
You are the hostile final editor for a small-group Bible guide. The draft was
written by another model. Return the corrected whole guide using the provider's
compact JSON shape.

Try to break it:
- compare every answer and embedded claim to the supplied passage;
- remove invented background, lexical claims, dates, customs, and geography;
- turn every disputed conclusion into a real two-sided DISPUTED question;
- reject questions that smuggle their answer into the wording;
- keep observation answers inside what the text explicitly says;
- keep application open, optional, non-coercive, and traceable to the text;
- do not let a sermon application masquerade as the author's statement;
- reject any Revelation guide that flattens the seven mixed churches into one
  persecuted, pressured, or suffering audience;
- preserve exactly 10 questions, the 3/4/3 phase mix, and all eight COVENANT steps.

Finding nothing wrong is allowed. Do not add complexity to look useful.
Return JSON only.
`.trim()

const QUALIFIED_DISPUTE = /\b(?:some|other|another|one)\s+(?:readers?|views?|traditions?|interpretations?)\b|\b(?:may|might|could|perhaps|possibly|disputed|debated|uncertain|does not settle|doesn't settle|leaves open)\b/i
const COERCIVE_DISCLOSURE = /\b(?:must|need to|required to)\s+(?:share|tell|confess|reveal)\b|\b(?:deepest trauma|hidden sin|worst thing|most painful secret)\b/i
const PRESUPPOSED_DISPUTE = /\b(?:how does this prove|why is this (?:the same|symbolic|literal)|why does this mean|how does .* symbolize)\b/i
const MODERN_NATION = /\b(?:russia|soviet union|united states|china|iran|turkey|european union)\b/i
const REVELATION_AUDIENCE_FLATTENING =
  /\b(?:a|the)\s+(?:persecuted|pressured|suffering|oppressed)\s+church\b|\bchurch\s+(?:under|facing)\s+(?:real\s+)?(?:pressure|persecution|suffering)\b|\b(?:persecuted believers|suffering saints)\b/i
const REVELATION_MIXED_AUDIENCE =
  /\b(?:mixed audience|mixed church|faithful and compromised|comfort and warning|warning and comfort|afflicted and complacent|some churches?.*others?)\b/i

function textValues(value, found = []) {
  if (typeof value === 'string') {
    found.push(value)
    return found
  }
  if (Array.isArray(value)) {
    for (const item of value) textValues(item, found)
    return found
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) textValues(item, found)
  }
  return found
}

function validateLeaderKey(raw, phase, label) {
  if (!raw || typeof raw !== 'object') {
    throw new GroupGuideValidationError(`${label}.leaderKey is missing`)
  }
  const answerClass = ANSWER_CLASSES.includes(raw.answerClass) ? raw.answerClass : null
  if (!answerClass) {
    throw new GroupGuideValidationError(`${label}.leaderKey.answerClass is invalid`)
  }
  if (phase === 'observation' && answerClass !== 'TEXT_EXPLICIT') {
    throw new GroupGuideValidationError(`${label} observation must use TEXT_EXPLICIT`)
  }
  if (
    phase === 'interpretation' &&
    !['INTERPRETATION_BOUNDED', 'DISPUTED'].includes(answerClass)
  ) {
    throw new GroupGuideValidationError(`${label} interpretation has the wrong answer class`)
  }
  if (phase === 'application' && answerClass !== 'PASTORAL_OPEN') {
    throw new GroupGuideValidationError(`${label} application must use PASTORAL_OPEN`)
  }

  const disputedViews = Array.isArray(raw.disputedViews)
    ? raw.disputedViews
        .map((view) => ({
          view: cleanText(view?.view, 700),
          supportingEvidence: cleanList(view?.supportingEvidence, 6, 500),
        }))
        .filter((view) => view.view)
        .slice(0, 4)
    : []

  if (answerClass === 'DISPUTED' && disputedViews.length < 2) {
    throw new GroupGuideValidationError(`${label} disputed answer needs at least two views`)
  }

  const conciseAnswer = nullableText(raw.conciseAnswer, 1400)
  if (phase === 'application' && conciseAnswer !== null) {
    throw new GroupGuideValidationError(`${label} application cannot have a single answer`)
  }
  if (phase !== 'application' && !conciseAnswer) {
    throw new GroupGuideValidationError(`${label} needs a concise leader answer`)
  }

  const textualEvidence = cleanList(raw.textualEvidence, 8, 700)
  if (textualEvidence.length === 0) {
    throw new GroupGuideValidationError(`${label} needs textual evidence`)
  }

  return {
    answerClass,
    conciseAnswer,
    textualEvidence,
    acceptableRange: cleanList(raw.acceptableRange, 8, 700),
    disputedViews,
    answerLimits: cleanList(raw.answerLimits, 8, 700),
    pastoralGuidance: nullableText(raw.pastoralGuidance, 1200),
  }
}

function normalizeGuideShape(raw) {
  if (
    raw &&
    typeof raw === 'object' &&
    raw.stepSummaries &&
    raw.questions &&
    !Array.isArray(raw.questions)
  ) {
    const questions = QUESTION_SLOTS.map((slot) => {
      const question = raw.questions[slot.id] ?? {}
      return {
        id: slot.id,
        phase: slot.phase,
        covenantStep: question.covenantStep,
        passageAnchors: question.passageAnchors,
        participantPrompt: question.participantPrompt,
        embeddedClaims: [],
        leaderKey: {
          answerClass: question.answerClass,
          conciseAnswer: slot.phase === 'application'
            ? null
            : question.conciseAnswer,
          textualEvidence: question.textualEvidence,
          acceptableRange: question.acceptableRange,
          disputedViews: Array.isArray(question.disputedViews)
            ? question.disputedViews.map((view) => (
                typeof view === 'string'
                  ? { view, supportingEvidence: [] }
                  : view
              ))
            : [],
          answerLimits: question.answerLimits,
          pastoralGuidance: question.pastoralGuidance,
        },
      }
    })

    return {
      reference: raw.reference,
      title: raw.title,
      bigIdea: raw.bigIdea,
      opening: {
        prompt: raw.openingPrompt,
        leaderNote: raw.openingLeaderNote,
        allowPass: true,
      },
      steps: COVENANT_STEPS.map((step) => ({
        id: step.id,
        summary: raw.stepSummaries[step.id],
        questionIds: questions
          .filter((question) => question.covenantStep === step.id)
          .map((question) => question.id),
      })),
      questions,
      prayerPrompt: raw.prayerPrompt,
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw.questions)) return raw
  if (!raw.questions || typeof raw.questions !== 'object') return raw

  return {
    ...raw,
    questions: QUESTION_SLOTS.map((slot) => ({
      ...raw.questions[slot.id],
      id: slot.id,
      phase: slot.phase,
    })),
  }
}

function validateGroupGuide(raw, { reference } = {}) {
  raw = normalizeGuideShape(raw)
  if (!raw || typeof raw !== 'object') {
    throw new GroupGuideValidationError('The group guide returned no object')
  }

  const guide = {
    reference: cleanText(reference || raw.reference, 120),
    title: cleanText(raw.title, 160),
    bigIdea: cleanText(raw.bigIdea, 700),
    opening: {
      prompt: cleanText(raw.opening?.prompt, 700),
      leaderNote: cleanText(raw.opening?.leaderNote, 900),
      allowPass: true,
    },
    prayerPrompt: cleanText(raw.prayerPrompt, 700),
  }

  if (!guide.reference || !guide.title || !guide.bigIdea) {
    throw new GroupGuideValidationError('The guide header is incomplete')
  }
  if (!guide.opening.prompt || !guide.opening.leaderNote || !guide.prayerPrompt) {
    throw new GroupGuideValidationError('The opening or prayer block is incomplete')
  }

  if (!Array.isArray(raw.steps) || raw.steps.length !== COVENANT_STEPS.length) {
    throw new GroupGuideValidationError('The guide must contain all eight COVENANT steps')
  }
  guide.steps = raw.steps.map((step, index) => {
    const expected = COVENANT_STEPS[index]
    if (step?.id !== expected.id) {
      throw new GroupGuideValidationError(`COVENANT step ${index + 1} must be ${expected.id}`)
    }
    const summary = cleanText(step.summary, 900)
    if (!summary) throw new GroupGuideValidationError(`${expected.id} needs a short summary`)
    return {
      id: expected.id,
      summary,
      questionIds: cleanList(step.questionIds, 10, 30),
    }
  })

  if (!Array.isArray(raw.questions) || raw.questions.length !== 10) {
    throw new GroupGuideValidationError('The guide must contain exactly 10 questions')
  }

  const ids = new Set()
  const stepUse = new Set()
  const phaseCounts = { observation: 0, interpretation: 0, application: 0 }
  let lastPhaseIndex = -1

  guide.questions = raw.questions.map((question, index) => {
    const label = `questions[${index}]`
    const id = cleanText(question?.id, 30)
    if (!id || ids.has(id)) throw new GroupGuideValidationError(`${label}.id is missing or duplicated`)
    ids.add(id)

    const phase = PHASES.includes(question?.phase) ? question.phase : null
    if (!phase) throw new GroupGuideValidationError(`${label}.phase is invalid`)
    const phaseIndex = PHASES.indexOf(phase)
    if (phaseIndex < lastPhaseIndex) {
      throw new GroupGuideValidationError('Questions must move from text to meaning to response')
    }
    lastPhaseIndex = phaseIndex
    phaseCounts[phase] += 1

    const covenantStep = STEP_IDS.has(question?.covenantStep)
      ? question.covenantStep
      : null
    if (!covenantStep) throw new GroupGuideValidationError(`${label}.covenantStep is invalid`)
    stepUse.add(covenantStep)

    const passageAnchors = cleanList(question?.passageAnchors, 6, 80)
    if (passageAnchors.length === 0 || passageAnchors.some((anchor) => !/\d/.test(anchor))) {
      throw new GroupGuideValidationError(`${label} needs verse anchors`)
    }

    const participantPrompt = cleanText(question?.participantPrompt, 500)
    if (!participantPrompt || !participantPrompt.endsWith('?')) {
      throw new GroupGuideValidationError(`${label}.participantPrompt must be a question`)
    }
    if (COERCIVE_DISCLOSURE.test(participantPrompt)) {
      throw new GroupGuideValidationError(`${label} coerces personal disclosure`)
    }
    if (PRESUPPOSED_DISPUTE.test(participantPrompt)) {
      throw new GroupGuideValidationError(`${label} puts a disputed conclusion inside the question`)
    }
    if (MODERN_NATION.test(participantPrompt) && !QUALIFIED_DISPUTE.test(participantPrompt)) {
      throw new GroupGuideValidationError(`${label} identifies a modern nation without qualification`)
    }

    const embeddedClaims = Array.isArray(question?.embeddedClaims)
      ? question.embeddedClaims
          .map((claim) => ({
            claim: cleanText(claim?.claim, 700),
            status: CLAIM_STATUSES.includes(claim?.status) ? claim.status : null,
            source: cleanText(claim?.source, 100),
          }))
          .filter((claim) => claim.claim)
          .slice(0, 8)
      : []
    if (embeddedClaims.some((claim) => !claim.status || !claim.source)) {
      throw new GroupGuideValidationError(`${label} contains an unlabeled claim`)
    }

    return {
      id,
      phase,
      covenantStep,
      passageAnchors,
      participantPrompt,
      embeddedClaims,
      leaderKey: validateLeaderKey(question?.leaderKey, phase, label),
    }
  })

  if (
    phaseCounts.observation !== 3 ||
    phaseCounts.interpretation !== 4 ||
    phaseCounts.application !== 3
  ) {
    throw new GroupGuideValidationError(
      `Question mix must be 3 observation, 4 interpretation, 3 application; got ` +
      `${phaseCounts.observation}/${phaseCounts.interpretation}/${phaseCounts.application}`
    )
  }
  if (stepUse.size !== COVENANT_STEPS.length) {
    throw new GroupGuideValidationError('The questions must walk through all eight COVENANT steps')
  }

  const questionIds = new Set(guide.questions.map((question) => question.id))
  const assigned = new Set()
  for (const step of guide.steps) {
    for (const id of step.questionIds) {
      if (!questionIds.has(id)) {
        throw new GroupGuideValidationError(`${step.id} points to unknown question ${id}`)
      }
      const question = guide.questions.find((candidate) => candidate.id === id)
      if (question.covenantStep !== step.id) {
        throw new GroupGuideValidationError(`${id} is assigned to the wrong COVENANT step`)
      }
      assigned.add(id)
    }
  }
  if (assigned.size !== guide.questions.length) {
    throw new GroupGuideValidationError('Every question must be assigned to one COVENANT step')
  }

  if (/^Revelation\b/i.test(guide.reference)) {
    const flattenedAudience = textValues(guide).find(
      (text) =>
        REVELATION_AUDIENCE_FLATTENING.test(text) &&
        !REVELATION_MIXED_AUDIENCE.test(text)
    )
    if (flattenedAudience) {
      throw new GroupGuideValidationError(
        'A Revelation guide cannot flatten the seven mixed churches into one pressured audience'
      )
    }
  }

  guide.promptVersion = PROMPT_VERSION
  return guide
}

async function modelObject({ client, system, user, retry, parse }) {
  const run = typeof retry === 'function' ? retry : (fn) => fn()
  const response = await run(() =>
    client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: GUIDE_JSON_SCHEMA,
        },
      },
      system,
      messages: [{ role: 'user', content: user }],
    })
  )
  if (response?.stop_reason === 'max_tokens') {
    throw new GroupGuideValidationError('The guide response was truncated before the JSON object finished.')
  }
  const parsed = parse(response)
  if (parsed?.questions) return parsed
  if (!isText(parsed?.guideJson)) {
    throw new GroupGuideValidationError('The provider returned no serialized guide.')
  }
  const serialized = parsed.guideJson
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(serialized)
  } catch {
    throw new GroupGuideValidationError('The serialized guide was not valid JSON.')
  }
}

async function generateGroupGuide({
  analysis,
  plainDoc,
  apiKey,
  createClient,
  retry,
  parse,
}) {
  if (!analysis?.reference || !analysis?.passageText) {
    throw new Error('A passage analysis with passage text is required.')
  }
  if (!apiKey) throw new Error('An API key is required.')

  const client = createClient(apiKey)
  const sources = sourcePayload(analysis, plainDoc)
  let draft = null
  let lastError = null
  let lastRaw = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await modelObject({
        client,
        system: GUIDE_SYSTEM,
        user:
          `${SCHEMA_PROMPT}\n\n` +
          (lastError ? `The previous draft failed validation: ${lastError.message}\n\n` : '') +
          (lastRaw ? `CORRECT THIS INVALID DRAFT\n${JSON.stringify(lastRaw, null, 2)}\n\n` : '') +
          `SOURCE PACKET\n${JSON.stringify(sources, null, 2)}`,
        retry,
        parse,
      })
      lastRaw = raw
      draft = validateGroupGuide(raw, { reference: analysis.reference })
      break
    } catch (error) {
      lastError = error
    }
  }

  if (!draft) throw lastError || new Error('The guide could not be generated.')

  return verifyGroupGuideDraft({
    guide: draft,
    analysis,
    plainDoc,
    apiKey,
    createClient,
    retry,
    parse,
    client,
    sources,
  })
}

async function verifyGroupGuideDraft({
  guide,
  analysis,
  plainDoc,
  apiKey,
  createClient,
  retry,
  parse,
  client: suppliedClient,
  sources: suppliedSources,
}) {
  if (!analysis?.reference || !analysis?.passageText) {
    throw new Error('A passage analysis with passage text is required.')
  }
  if (!apiKey) throw new Error('An API key is required.')

  const draft = validateGroupGuide(guide, { reference: analysis.reference })
  const client = suppliedClient || createClient(apiKey)
  const sources = suppliedSources || sourcePayload(analysis, plainDoc)
  let verified = null
  let lastError = null
  let lastRaw = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await modelObject({
        client,
        system: VERIFY_SYSTEM,
        user:
          `${SCHEMA_PROMPT}\n\n` +
          (lastError ? `The previous correction failed validation: ${lastError.message}\n\n` : '') +
          (lastRaw ? `CORRECT THIS INVALID VERIFICATION DRAFT\n${JSON.stringify(lastRaw, null, 2)}\n\n` : '') +
          `SOURCE PACKET\n${JSON.stringify(sources, null, 2)}\n\n` +
          `DRAFT GUIDE\n${JSON.stringify(draft, null, 2)}`,
        retry,
        parse,
      })
      lastRaw = raw
      verified = validateGroupGuide(raw, { reference: analysis.reference })
      break
    } catch (error) {
      lastError = error
    }
  }

  if (!verified) {
    throw lastError || new Error('The guide was generated but did not pass verification.')
  }

  verified.verification = {
    status: 'verified',
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    verifiedAt: new Date().toISOString(),
  }
  verified.updatedAt = verified.verification.verifiedAt
  return verified
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderLines(count = 3) {
  return Array.from({ length: count }, () => '<div class="answer-line"></div>').join('')
}

function answerClassLabel(value) {
  return {
    TEXT_EXPLICIT: 'TEXT',
    INTERPRETATION_BOUNDED: 'BOUNDED INTERPRETATION',
    DISPUTED: 'DISPUTED',
    PASTORAL_OPEN: 'PASTORAL — NO SINGLE ANSWER',
  }[value] || value
}

function renderGuideHtml(guideInput, variant = 'participant') {
  const guide = validateGroupGuide(guideInput, { reference: guideInput?.reference })
  const leader = variant === 'leader'
  const questions = new Map(guide.questions.map((question, index) => [question.id, { ...question, number: index + 1 }]))

  const stepHtml = COVENANT_STEPS.map((definition) => {
    const step = guide.steps.find((candidate) => candidate.id === definition.id)
    const stepQuestions = step.questionIds.map((id) => questions.get(id)).filter(Boolean)
    const questionHtml = stepQuestions.map((question) => {
      const key = question.leaderKey
      const leaderHtml = leader
        ? `<div class="leader-key">
            <div class="answer-class">${escapeHtml(answerClassLabel(key.answerClass))}</div>
            ${key.conciseAnswer ? `<p><strong>Leader answer:</strong> ${escapeHtml(key.conciseAnswer)}</p>` : '<p><strong>Leader aim:</strong> There is no single personal answer. Keep the response tied to the text.</p>'}
            <p><strong>Textual evidence:</strong> ${key.textualEvidence.map(escapeHtml).join(' · ')}</p>
            ${key.acceptableRange.length ? `<p><strong>Faithful range:</strong> ${key.acceptableRange.map(escapeHtml).join(' · ')}</p>` : ''}
            ${key.disputedViews.length ? `<div class="views">${key.disputedViews.map((view) => `<p><strong>${escapeHtml(view.view)}:</strong> ${view.supportingEvidence.map(escapeHtml).join(' · ')}</p>`).join('')}</div>` : ''}
            ${key.answerLimits.length ? `<p><strong>Do not claim:</strong> ${key.answerLimits.map(escapeHtml).join(' · ')}</p>` : ''}
            ${key.pastoralGuidance ? `<p><strong>Facilitation:</strong> ${escapeHtml(key.pastoralGuidance)}</p>` : ''}
          </div>`
        : renderLines(question.phase === 'application' ? 4 : 3)

      return `<section class="question">
        <div class="question-meta">QUESTION ${question.number} · ${escapeHtml(question.phase.toUpperCase())} · ${escapeHtml(question.passageAnchors.join(', '))}</div>
        <h3>${escapeHtml(question.participantPrompt)}</h3>
        ${leaderHtml}
      </section>`
    }).join('')

    return `<section class="covenant-step">
      <div class="step-head">
        <div class="letter">${escapeHtml(definition.letter)}</div>
        <div>
          <div class="step-kicker">COVENANT ${COVENANT_STEPS.indexOf(definition) + 1} OF 8</div>
          <h2>${escapeHtml(definition.title)}</h2>
          <p class="driving-question">${escapeHtml(definition.question)}</p>
        </div>
      </div>
      <p class="step-summary">${escapeHtml(step.summary)}</p>
      ${questionHtml || '<p class="no-question">Carry this step into the next block.</p>'}
    </section>`
  }).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(guide.reference)} — ${leader ? 'Leader' : 'Participant'} Group Guide</title>
<style>
  @page { size: Letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f0e4; color: #171a13; font-family: Inter, Arial, sans-serif; font-size: 10.5pt; line-height: 1.48; }
  .page { max-width: 7.5in; margin: 0 auto; }
  .masthead { background: #283517; color: #f5f2e8; padding: 22px 24px 18px; border-top: 7px solid #e5be49; }
  .brand { font-family: Saira, "Arial Narrow", sans-serif; color: #e5be49; font-weight: 800; letter-spacing: .18em; font-size: 9pt; }
  h1, h2, h3 { font-family: Saira, "Arial Narrow", sans-serif; margin: 0; }
  h1 { font-size: 25pt; line-height: 1.08; margin-top: 9px; }
  .subtitle { margin-top: 6px; color: rgba(245,242,232,.76); }
  .mode { display: inline-block; margin-top: 12px; padding: 4px 8px; border: 1px solid rgba(229,190,73,.55); color: #e5be49; font-family: Saira, sans-serif; font-size: 7.5pt; letter-spacing: .12em; }
  .big-idea, .opening, .prayer { border-left: 4px solid #e5be49; background: #fffaf0; padding: 12px 15px; margin: 16px 0; }
  .label, .step-kicker, .question-meta, .answer-class { font-family: Saira, "Arial Narrow", sans-serif; text-transform: uppercase; letter-spacing: .12em; font-size: 7.2pt; font-weight: 700; color: #59634a; }
  .big-idea p, .opening p, .prayer p { margin: 4px 0 0; }
  .covenant-strip { display: grid; grid-template-columns: repeat(8, 1fr); border: 1px solid #b7b49d; margin: 16px 0; }
  .covenant-strip span { padding: 7px 2px; text-align: center; border-right: 1px solid #d5d0bf; font-family: Saira, sans-serif; color: #283517; font-weight: 800; }
  .covenant-strip span:last-child { border-right: 0; }
  .covenant-step { page-break-inside: avoid; border: 1px solid #c9c3af; background: rgba(255,255,255,.48); margin: 14px 0; padding: 15px; }
  .step-head { display: flex; gap: 12px; align-items: flex-start; border-bottom: 1px solid #d9d3c1; padding-bottom: 10px; }
  .letter { width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; background: #283517; color: #e5be49; font-family: Saira, sans-serif; font-weight: 900; font-size: 18pt; }
  h2 { color: #283517; font-size: 15pt; line-height: 1.1; margin-top: 2px; }
  .driving-question { color: #59634a; font-style: italic; margin: 4px 0 0; font-size: 9.5pt; }
  .step-summary { margin: 10px 0; }
  .question { page-break-inside: avoid; margin-top: 13px; padding-top: 12px; border-top: 1px solid #e0dac8; }
  .question:first-of-type { border-top: 0; }
  h3 { font-size: 11.5pt; line-height: 1.35; color: #171a13; margin-top: 4px; }
  .answer-line { height: 20px; border-bottom: 1px solid #c4beaa; }
  .leader-key { margin-top: 8px; background: #edf0e8; border-left: 3px solid #67704f; padding: 9px 11px; font-size: 9.2pt; }
  .leader-key p { margin: 5px 0; }
  .answer-class { color: #283517; margin-bottom: 4px; }
  .views { border-top: 1px solid #c9cfbf; border-bottom: 1px solid #c9cfbf; margin: 7px 0; padding: 4px 0; }
  .no-question { color: #737866; font-style: italic; }
  .footer { margin: 20px 0 8px; padding-top: 10px; border-top: 2px solid #e5be49; display: flex; justify-content: space-between; color: #59634a; font-size: 8pt; }
  .footer strong { font-family: Saira, sans-serif; color: #283517; letter-spacing: .12em; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
<main class="page">
  <header class="masthead">
    <div class="brand">BASE 1520 · COVENANT GROUP GUIDE</div>
    <h1>${escapeHtml(guide.reference)}</h1>
    <div class="subtitle">${escapeHtml(guide.title)}</div>
    <div class="mode">${leader ? 'LEADER GUIDE + ANSWER KEY' : 'PARTICIPANT GUIDE'}</div>
  </header>

  <section class="big-idea">
    <div class="label">Passage Aim</div>
    <p>${escapeHtml(guide.bigIdea)}</p>
  </section>

  <section class="opening">
    <div class="label">Open The Room</div>
    <p>${escapeHtml(guide.opening.prompt)}</p>
    <p><em>Anyone may pass on a personal question.</em></p>
    ${leader ? `<p><strong>Leader note:</strong> ${escapeHtml(guide.opening.leaderNote)}</p>` : ''}
  </section>

  <div class="covenant-strip">${COVENANT_STEPS.map((step) => `<span>${escapeHtml(step.letter)}</span>`).join('')}</div>
  ${stepHtml}

  <section class="prayer">
    <div class="label">Pray The Text</div>
    <p>${escapeHtml(guide.prayerPrompt)}</p>
  </section>

  <footer class="footer">
    <span>Text → Meaning → Response</span>
    <strong>BASE 1520</strong>
  </footer>
</main>
</body>
</html>`
}

module.exports = {
  generateGroupGuide,
  verifyGroupGuideDraft,
  validateGroupGuide,
  renderGuideHtml,
  guideKeyFor,
  collectSourceNotes,
  classifySourceNote,
  looksTruncatedSourceNote,
  sourcePayload,
  COVENANT_STEPS,
  MODEL,
  PROMPT_VERSION,
  GUIDE_JSON_SCHEMA,
  GroupGuideValidationError,
}
