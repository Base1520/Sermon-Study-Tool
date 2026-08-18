const crypto = require('crypto')

const { checkGenerationInput, parseModelJSON, withRetry } = require('../../electron/plainread/runtime')
const { lookupPassage } = require('../../electron/plainread/vault')
const { assertNoPulpitLeak } = require('../../electron/plainread/validate')

const QUICK_STUDY_MODEL = 'claude-haiku-4-5-20251001'
const QUICK_STUDY_PROMPT_VERSION = 3
const QUICK_STUDY_VALIDATOR_VERSION = 3
const QUICK_STUDY_MAX_TOKENS = 1200
/** Passages shorter than this need one distinct verbatim anchor; longer need two. */
const QUICK_STUDY_TWO_ANCHOR_WORDS = 40

function cleanText(value, max = 1800) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanList(value, maxItems, maxChars = 500) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item, maxChars)).filter(Boolean).slice(0, maxItems)
    : []
}

function comparable(value) {
  return cleanText(value, 10_000).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function appearsInPassage(candidate, passageText) {
  const needle = comparable(candidate)
  return needle.length >= 2 && comparable(passageText).includes(needle)
}

function appearsMeaningfullyInPassage(candidate, passageText) {
  const needle = comparable(candidate)
  const words = needle.split(' ').filter(Boolean)
  return needle.length >= 5 && words.length >= 2 && comparable(passageText).includes(needle)
}

function appearsInGrounding(candidate, vaultNotes) {
  const needle = comparable(candidate)
  const words = needle.split(' ').filter(Boolean)
  return needle.length >= 8 && words.length >= 2 && vaultNotes.some((note) => comparable(note).includes(needle))
}

function resolveAnchor(anchor, { text, textEvidence, vaultNotes, passageOnly = false }) {
  const value = cleanText(anchor, 700)
  const passageRef = value.match(/^P([1-4])$/i)
  if (passageRef) {
    const evidence = textEvidence[Number(passageRef[1]) - 1]
    return evidence ? `Passage: ${evidence.words}` : null
  }

  const groundingRef = value.match(/^G([1-9]|10)$/i)
  if (!passageOnly && groundingRef) {
    const index = Number(groundingRef[1]) - 1
    const note = vaultNotes[index]
    return note ? `Vault G${index + 1}: ${cleanText(note, 650)}` : null
  }

  if (appearsMeaningfullyInPassage(value, text)) return `Passage: ${value}`
  if (!passageOnly && appearsInGrounding(value, vaultNotes)) return `Vault: ${value}`
  return null
}

function cleanAnchors(value, options) {
  return [...new Set(cleanList(value, 4, 700)
    .map((anchor) => resolveAnchor(anchor, options))
    .filter(Boolean))]
}

function validateQuickStudy(raw, { reference, text, translation, vaultNotes = [] }) {
  if (!raw || typeof raw !== 'object') throw new Error('The quick study did not return a usable object.')

  const mainClaim = cleanText(raw.mainClaim, 650)
  const context = cleanText(raw.context, 800)
  const wholeBible = cleanText(raw.wholeBible, 700)
  const whyItMatters = cleanText(raw.whyItMatters, 700)
  if (!mainClaim || !context || !wholeBible || !whyItMatters) {
    throw new Error('The quick study left out a required section.')
  }

  const seenEvidence = new Set()
  const textEvidence = (Array.isArray(raw.textEvidence) ? raw.textEvidence : [])
    .map((item) => ({
      words: cleanText(item?.words, 260),
      shows: cleanText(item?.shows, 450),
    }))
    .filter((item) => item.words && item.shows && appearsMeaningfullyInPassage(item.words, text))
    // The same quoted words twice is one anchor, not two — a repeated clause
    // (Matthew 24:40-41 says "the one shall be taken, and the other left" in
    // both verses) must not satisfy the count on its own.
    .filter((item) => {
      const key = comparable(item.words)
      if (seenEvidence.has(key)) return false
      seenEvidence.add(key)
      return true
    })
    .slice(0, 3)
  const passageWordCount = comparable(text).split(' ').filter(Boolean).length
  // A short passage cannot supply two DISTINCT verbatim anchors and still be
  // studied honestly — a two-verse memory text (~30 words) has one real clause
  // to quote. The old cutoff (six words) only spared single-phrase inputs and
  // rejected every two-verse passage a Sunday-school teacher would type; a
  // beta tester hit it on Matthew 24:40-41 the first day. Longer passages keep
  // the two-anchor floor so a lazy study cannot ride on one lucky quote.
  const minimumEvidence = passageWordCount < QUICK_STUDY_TWO_ANCHOR_WORDS ? 1 : 2
  if (textEvidence.length < minimumEvidence) {
    throw new Error('The quick study did not anchor its claim in enough of the passage text.')
  }

  const keyTerms = (Array.isArray(raw.keyTerms) ? raw.keyTerms : [])
    .map((item) => ({
      term: cleanText(item?.term, 100),
      meaning: cleanText(item?.meaning, 350),
      whyItMatters: cleanText(item?.whyItMatters, 350),
    }))
    .filter((item) => item.term && item.meaning && item.whyItMatters && appearsInPassage(item.term, text))
    .slice(0, 2)

  try {
    assertNoPulpitLeak(raw)
  } catch {
    throw new Error('The quick study drifted into sermon construction.')
  }
  const forbidden = comparable(JSON.stringify(raw))
  const quickSermonDrift = /\b(?:preach|teach|deliver) (?:this|it|the passage|the text) (?:in|as) (?:\w+ ){0,2}points?\b|\b(?:open|close|start|end|land) with (?:a |an |the )?(?:story|hook|illustration|challenge)\b|\b(?:two|three|four|five|\d+) (?:sermon )?points?\b|\bpoint (?:one|two|three|four|five|\d+)\b|\b(?:message|talk) outline\b/
  if (quickSermonDrift.test(forbidden)) {
    throw new Error('The quick study drifted into sermon construction.')
  }
  if (/\bwhat does (?:it|this|this text|the passage|the text) mean (?:to|for|in) (?:you|us|me)(?:r life)?\b/.test(forbidden)) {
    throw new Error('The quick study relativized the passage meaning.')
  }

  const sourceAnchors = {
    mainClaim: cleanAnchors(raw.sourceAnchors?.mainClaim, {
      text, textEvidence, vaultNotes, passageOnly: true,
    }),
    context: cleanAnchors(raw.sourceAnchors?.context, { text, textEvidence, vaultNotes }),
    wholeBible: cleanAnchors(raw.sourceAnchors?.wholeBible, { text, textEvidence, vaultNotes }),
  }
  if (sourceAnchors.mainClaim.length < minimumEvidence) {
    sourceAnchors.mainClaim = textEvidence.slice(0, minimumEvidence)
      .map((item) => `Passage: ${item.words}`)
  }
  if (sourceAnchors.mainClaim.length < minimumEvidence || !sourceAnchors.context.length || !sourceAnchors.wholeBible.length) {
    throw new Error('The quick study did not provide verifiable source anchors for its claims.')
  }

  return {
    mode: 'quick',
    reference,
    translation,
    mainClaim,
    context,
    textEvidence,
    keyTerms,
    wholeBible,
    whyItMatters,
    sourceAnchors,
    guardrails: cleanList(raw.guardrails, 2),
    questions: cleanList(raw.questions, 2),
    vaultSourced: Boolean(vaultNotes.length),
    promptVersion: QUICK_STUDY_PROMPT_VERSION,
    validatorVersion: QUICK_STUDY_VALIDATOR_VERSION,
    fromCache: false,
  }
}

function buildQuickStudyPrompt({ reference, text, translation, vaultNotes }) {
  const grounding = vaultNotes.length
    ? vaultNotes.map((note, index) => `[G${index + 1}] ${note}`).join('\n')
    : '- No passage-specific vault notes are available. Do not invent historical details.'

  return `You are producing a QUICK LOOKUP for The Operator mobile app.

This is not sermon preparation. Do not write a sermon outline, manuscript, preaching points, transitions, hooks, or illustrations. Ask "what does it mean?" Never ask "what does it mean to you?" Use a historical-grammatical reading. Keep the whole response concise enough to read on a phone in a few minutes.

Use the passage itself as primary evidence. Historical claims may come only from the grounding notes below. Do not invent Greek or Hebrew claims. If an interpretation is disputed, name the restraint in guardrails instead of pretending certainty. Application must state how the text truthfully meets life; do not give personal counsel.

Return JSON only in this exact shape:
{
  "mainClaim": "one clear paragraph stating what the passage means",
  "context": "the immediate literary and first-hearer context that changes how it reads",
  "textEvidence": [{"words":"an exact short quotation from the supplied passage","shows":"what those words establish"}],
  "keyTerms": [{"term":"an exact English word or phrase in the supplied passage","meaning":"its contextual meaning here, not an invented Greek or Hebrew claim","whyItMatters":"why it carries weight in the argument"}],
  "wholeBible": "where this truth sits in the Bible's whole story without forcing a Christ connection",
  "whyItMatters": "a text-derived application stated for believers generally",
  "sourceAnchors": {
    "mainClaim": ["P1", "P2"],
    "context": ["P1", "G1"],
    "wholeBible": ["P2", "G2"]
  },
  "guardrails": ["what not to make the passage say, including real disputes"],
  "questions": ["two or three questions that ask what the text means and how we know"]
}

P1 means the first textEvidence quotation, P2 the second, and so on. G1 means the first grounding note, G2 the second, and so on. Use only IDs that exist and actually support the section. Historical context must cite a G source when it makes a historical claim. If no grounding note supports a claim, omit that claim instead of citing your own memory. Use 2-3 textEvidence items, 0-2 keyTerms, 0-2 guardrails, and exactly 2 questions. Keep every paragraph short. Aim for 300-425 words total.

GROUNDING NOTES:
${grounding}

PASSAGE: ${reference} (${String(translation || '').toUpperCase()})
${text}`
}

async function generateQuickStudy({
  text,
  reference,
  translation,
  apiKey,
  createClient,
  retry = withRetry,
  parse = parseModelJSON,
  onUsage,
}) {
  checkGenerationInput({ text, reference })
  if (!apiKey) throw new Error('generateQuickStudy: apiKey is required')
  if (typeof createClient !== 'function') throw new Error('generateQuickStudy: createClient is required')

  const vault = lookupPassage(reference, { maxNotes: 10, maxBookNotes: 4 })
  const client = createClient(apiKey)
  const response = await retry(() => client.messages.create({
    model: QUICK_STUDY_MODEL,
    max_tokens: QUICK_STUDY_MAX_TOKENS,
    system: 'Return valid JSON only. Be text-driven, concise, and restrained.',
    messages: [{
      role: 'user',
      content: buildQuickStudyPrompt({
        reference,
        text,
        translation,
        vaultNotes: vault?.notes || [],
      }),
    }],
  }))
  if (typeof onUsage === 'function') onUsage('quick-study', response?.usage, QUICK_STUDY_MODEL)
  return validateQuickStudy(parse(response), {
    reference,
    text,
    translation,
    vaultNotes: vault?.notes || [],
  })
}

function quickStudyCacheKey({ reference, text, translation }) {
  const vault = lookupPassage(reference, { maxNotes: 10, maxBookNotes: 4 })
  const groundingDigest = crypto.createHash('sha256')
    .update(JSON.stringify(vault?.notes || []))
    .digest('hex')
  const digest = crypto.createHash('sha256').update(JSON.stringify({
    reference: cleanText(reference).toLowerCase(),
    text: cleanText(text, 100_000),
    translation: cleanText(translation).toLowerCase(),
    promptVersion: QUICK_STUDY_PROMPT_VERSION,
    validatorVersion: QUICK_STUDY_VALIDATOR_VERSION,
    model: QUICK_STUDY_MODEL,
    groundingDigest,
  })).digest('hex')
  return `quick-study-v${QUICK_STUDY_PROMPT_VERSION}-${digest}`
}

function analysisForQuickStudy(document, passageText) {
  return {
    reference: document.reference,
    passageText,
    passageReference: document.reference,
    translation: document.translation,
    mainTheme: document.mainClaim,
    authorIntent: null,
    phrases: [],
    outline: document.textEvidence.map((item, index) => ({
      point: item.shows,
      label: `Text evidence ${index + 1}`,
    })),
    canonicalContext: {
      bookTheme: document.wholeBible,
      passageRole: document.context,
      biblicalThemes: [],
      canonicalConnections: document.wholeBible,
      keyWords: document.keyTerms.map((item) => item.term),
    },
    culturalNotes: [],
    genre: null,
    geoReferences: [],
    questionsToConsider: document.questions,
    mode: 'quick',
  }
}

module.exports = {
  QUICK_STUDY_MODEL,
  QUICK_STUDY_PROMPT_VERSION,
  QUICK_STUDY_VALIDATOR_VERSION,
  QUICK_STUDY_MAX_TOKENS,
  buildQuickStudyPrompt,
  validateQuickStudy,
  generateQuickStudy,
  quickStudyCacheKey,
  analysisForQuickStudy,
}
