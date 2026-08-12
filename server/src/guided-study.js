const crypto = require('crypto')

const { checkGenerationInput, parseModelJSON, withRetry } = require('../../electron/plainread/runtime')
const { lookupPassage } = require('../../electron/plainread/vault')
const { assertNoDoctrineLeak, assertNoPulpitLeak } = require('../../electron/plainread/validate')

const GUIDED_STUDY_MODEL = 'claude-haiku-4-5-20251001'
const GUIDED_STUDY_PROMPT_VERSION = 16
const GUIDED_STUDY_VALIDATOR_VERSION = 14
const GUIDED_FOUNDATION_MAX_TOKENS = 1200
const GUIDED_COVENANT_MAX_TOKENS = 1150
const GUIDED_APPLICATION_MAX_TOKENS = 850
const GUIDED_STUDY_MAX_TOKENS = GUIDED_FOUNDATION_MAX_TOKENS
  + GUIDED_COVENANT_MAX_TOKENS
  + GUIDED_APPLICATION_MAX_TOKENS

const COVENANT_STEPS = [
  { id: 'contextualize', letter: 'C', title: 'Contextualize', question: 'What did this mean in its original context?' },
  { id: 'observe', letter: 'O', title: 'Observe the Covenant Narrative', question: "Where does this sit in God's unfolding plan of redemption?" },
  { id: 'verify', letter: 'V', title: 'Verify Authorial Intent', question: 'What did the inspired human author mean to communicate?' },
  { id: 'examine', letter: 'E', title: 'Examine Genre', question: 'What reading rules does this kind of writing require?' },
  { id: 'name', letter: 'N', title: 'Name the Faithfulness of God', question: 'What is God doing, and how is He keeping His promises?' },
  { id: 'anchor', letter: 'A', title: 'Anchor Every Text in Christ', question: 'How does this passage point to, prepare for, or find fulfillment in Christ?' },
  { id: 'navigate', letter: 'N', title: 'Navigate Tensions', question: 'What tension, dispute, or limit must a careful reading preserve?' },
  { id: 'teach', letter: 'T', title: 'Teach for Transformation', question: 'How does the truth of this passage shape faithful life?' },
]

const PHILIPPIANS_TWO_PUBLIC_GROUNDING = [
  "Immediate literary context: Philippians 2:1-4 addresses corporate unity, selfish ambition, empty glory, humility, and looking to others' interests; verse 5 introduces Christ's mindset as the pattern for that appeal.",
  "Broader literary context: Philippians 1:27-30 names opponents and suffering for Christ, but external opposition must not displace the immediate 2:1-4 concern for the church's unity and shared mindset.",
  "Canonical connection: Philippians 2:10-11 echoes Isaiah 45:23's every-knee and every-tongue language, placing Jesus as Lord in the position occupied by YHWH in Isaiah's universal homage, to the glory of God the Father; this does not teach universal salvation.",
  "Canonical setting: Acts 16:12 identifies Philippi as a Roman colony, while Philippians 3:20 uses citizenship language; this civic-status backdrop may illuminate the letter but must remain secondary to Philippians 2:1-11.",
  "Limited historical background: crucifixion was a Roman public execution associated with shame; Philippians 2:8 itself names only 'death of the cross,' so do not build beyond that narrow point.",
]

const PSALM_TWENTY_THREE_PUBLIC_GROUNDING = [
  "Interpretive restraint: Psalm 23:6's final phrase can describe dwelling in the LORD's house for length of days; do not present it as an explicit, settled promise of heaven, afterlife, or eternal life.",
  "Canonical connection: the LORD (YHWH) is the shepherd named in Psalm 23. John 10 later presents Jesus as the Good Shepherd; do not rewrite Psalm 23 as naming 'God the Father' or Jesus in its original wording.",
]

const STRING = { type: 'string' }

function stringListSchema() {
  return { type: 'array', items: STRING }
}

function objectSchema(properties) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

const GUIDED_STUDY_SCHEMAS = {
  foundation: objectSchema({
    mainClaim: { type: 'string', description: 'One clear paragraph, no more than 38 words.' },
    mainClaimSources: stringListSchema(1, 4),
    situation: objectSchema({
      when: { type: 'string', description: 'No more than 18 words.' },
      where: { type: 'string', description: 'No more than 18 words.' },
      pressure: { type: 'string', description: 'No more than 30 words.' },
      whyItChangesReading: { type: 'string', description: 'No more than 30 words.' },
      confidence: { type: 'string', enum: ['documented', 'reconstructed', 'uncertain'] },
      sourceRefs: stringListSchema(1, 4),
    }),
    textUnits: {
      type: 'array',
      items: objectSchema({
        ref: STRING,
        heading: STRING,
        anchor: { type: 'string', description: 'An exact contiguous 3-12 word phrase copied from the passage; no ellipses.' },
        explanation: { type: 'string', description: 'No more than 30 words.' },
        logic: { type: ['string', 'null'], description: 'No more than 14 words, or null.' },
      }),
    },
    keyTerms: {
      type: 'array',
      items: objectSchema({
        term: STRING,
        meaningHere: { type: 'string', description: 'No more than 24 words.' },
        functionInArgument: { type: 'string', description: 'No more than 24 words.' },
        whyItMatters: { type: 'string', description: 'No more than 24 words.' },
      }),
    },
  }),
  covenant: objectSchema({
    covenant: {
      type: 'array',
      items: objectSchema({
        id: { type: 'string', enum: COVENANT_STEPS.map((step) => step.id) },
        finding: { type: 'string', description: 'One or two sentences, no more than 34 words.' },
        check: { type: 'string', description: 'No more than 16 words.' },
        restraint: { type: ['string', 'null'], description: 'No more than 14 words, or null.' },
        sourceRefs: stringListSchema(1, 2),
      }),
    },
  }),
  application: objectSchema({
    application: objectSchema({
      toThemFirst: { type: 'string', description: 'No more than 28 words.' },
      enduringTruth: { type: 'string', description: 'No more than 28 words.' },
      today: { type: 'string', description: 'Individual application, no more than 28 words.' },
      corporate: { type: 'string', description: 'Church or community application, no more than 28 words.' },
      mission: { type: 'string', description: 'Mission-facing application, no more than 28 words.' },
      response: { type: 'string', description: 'One concrete next response, no more than 28 words.' },
      sourceRefs: stringListSchema(1, 3),
    }),
    guardrails: stringListSchema(2, 2),
    questions: {
      type: 'array',
      items: objectSchema({
        question: STRING,
        answer: { type: 'string', description: 'No more than 32 words.' },
        sourceRefs: stringListSchema(1, 3),
      }),
    },
  }),
}

function cleanText(value, max = 1800) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanList(value, maxItems, maxChars = 500) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item, maxChars)).filter(Boolean).slice(0, maxItems)
    : []
}

function comparable(value) {
  return cleanText(String(value || '').replace(/\[\s*\d+[a-z]?\s*\]/gi, ' '), 100_000)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function isPhilippiansTwo(reference) {
  return /^philippians 2\b/i.test(cleanText(reference, 120))
}

function isPsalmTwentyThree(reference) {
  return /^psalm(?:s)? 23\b/i.test(cleanText(reference, 120))
}

function compactPassageAnchor(value) {
  const anchor = cleanText(value, 700)
  const words = anchor.split(/\s+/).filter(Boolean)
  if (words.length <= 12) return anchor

  const fragments = anchor
    .split(/(?<=[,;:.!?])\s+/)
    .map((fragment) => cleanText(fragment, 320))
    .filter((fragment) => {
      const count = fragment.split(/\s+/).filter(Boolean).length
      return count >= 3 && count <= 12
    })
  if (fragments.length) {
    return fragments.sort((left, right) => {
      const wordDifference = right.split(/\s+/).length - left.split(/\s+/).length
      return wordDifference || anchor.indexOf(left) - anchor.indexOf(right)
    })[0]
  }

  const first = words.slice(0, 12).join(' ')
  const last = words.slice(-12).join(' ')
  const incompleteEdge = /\b(?:a|an|and|as|at|but|for|from|in|of|or|that|the|to|which|who|with)\W*$/i
  return incompleteEdge.test(first) && !incompleteEdge.test(last) ? last : first
}

function containsUnnegatedClaim(value, claimPattern, actionPattern) {
  return cleanText(value, 100_000)
    .split(/(?<=[.!?;])\s+/)
    .some((fragment) => {
      if (!claimPattern.test(fragment)) return false
      const action = fragment.match(actionPattern)
      if (!action || typeof action.index !== 'number') return true
      const lead = fragment.slice(Math.max(0, action.index - 100), action.index)
      return !/\b(?:not|never|without)\b|\b(?:avoid|deny|denies|reject|refus(?:e|es|ed))\b/i.test(lead)
    })
}

const PHILIPPIANS_TWO_LEXICAL_ASSERTION = /(?:\b(?:did not|refused to|rather than|not)\b[^.?!]{0,70}\b(?:seiz(?:e|ing)|exploit(?:ing)?|grasp(?:ing)?)\b|\b(?:took|takes|taking) no advantage\b)/i
const PHILIPPIANS_TWO_LEXICAL_QUALIFIER = /\b(?:one|a) disputed reading\b|\bsome (?:read|understand)\b|\bon one reading\b/i
const DIVINITY_SURRENDER_CLAIM = /\b(?:christ|jesus|the son|he)\b[^.?!]{0,100}\b(?:empt(?:y|ied)|divest(?:s|ed)?|surrender(?:s|ed)?|gave up|laid aside)\b[^.?!]{0,60}\b(?:deity|divinity|divine (?:nature|attributes?|privileges?))\b/i
const DIVINITY_SURRENDER_ACTION = /\b(?:empt(?:y|ied)|divest(?:s|ed)?|surrender(?:s|ed)?|gave up|laid aside)\b/i

function normalizePhilippiansTwoLexicalClaims(value, insideNavigate = false) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizePhilippiansTwoLexicalClaims(item, insideNavigate))
  }
  if (value && typeof value === 'object') {
    const navigates = insideNavigate || cleanText(value.id, 40).toLowerCase() === 'navigate'
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      normalizePhilippiansTwoLexicalClaims(item, navigates),
    ]))
  }
  if (typeof value !== 'string' || insideNavigate
    || !PHILIPPIANS_TWO_LEXICAL_ASSERTION.test(value)
    || PHILIPPIANS_TWO_LEXICAL_QUALIFIER.test(value)) return value
  return `On one disputed reading, ${value.charAt(0).toLowerCase()}${value.slice(1)}`
}

function normalizePhilippiansTwoStudy(raw) {
  const normalized = normalizePhilippiansTwoLexicalClaims(raw)
  const keyTerms = Array.isArray(normalized.keyTerms)
    ? normalized.keyTerms.map((term) => {
      if (comparable(term?.term) === 'made himself of no reputation'
        && /\b(?:advantage|seize|exploit|grasp)\b/i.test(cleanText(term?.meaningHere, 500))) {
        return {
          ...term,
          meaningHere: 'The following clauses explain it: Christ took servant form, became truly human, and humbled himself in obedience to death.',
        }
      }
      if (comparable(term?.term) !== 'form of god'
        || !/\b(?:essential|very) nature\b/i.test(cleanText(term?.meaningHere, 500))) return term
      return {
        ...term,
        meaningHere: "The passage presents Christ as existing in God's form and equal with God; the precise lexical force of 'form' is disputed.",
      }
    })
    : normalized.keyTerms
  const repaired = JSON.parse(JSON.stringify({ ...normalized, keyTerms }), (key, value) => {
    if (typeof value !== 'string') return value
    if (containsUnnegatedClaim(value, DIVINITY_SURRENDER_CLAIM, DIVINITY_SURRENDER_ACTION)) {
      return 'Christ remained fully divine while taking servant form, becoming truly human, and obeying to death.'
    }
    return value
      .replace(/\bvoluntary self-humiliation\b/gi, 'voluntary self-giving service')
      .replace(/\bobedience over self-protection\b/gi, 'faithful obedience without abandoning wise protection')
      .replace(/\bGod(?: the Father)? honou?rs obedience\b/gi, 'God the Father exalted Christ')
      .replace(/\bGod['’]s vindication of obedience\b/gi, "God the Father's exaltation of Christ")
      .replace(/\bunified church facing internal tension\b/gi, 'church facing internal tension')
      .replace(/\beternal form as God\b/gi, "God's form")
      .replace(/\bhe perceives Christ['’]s obedience(?: unto death)?,?\s*/gi, '')
      .replace(/\bpositions him as (?:the )?universal Lord\b/gi, 'brings universal acknowledgment of Jesus as Lord')
      .replace(/\balignment with the pattern Christ embodied and God the Father honou?red\b/gi, "alignment with Christ's self-giving pattern")
      .replace(/\bChrist['’]s refusal of self-regard\b/gi, "Christ's self-giving service")
      .replace(/\breleases the need to defend or advance personal status\b/gi, 'rejects self-promotion and status-seeking')
      .replace(/\bdefined his renunciation\b/gi, 'defines his self-emptying')
      .replace(/\brenunciation\b/gi, 'self-giving')
  })
  const requiredGuardrails = [
    "Christ's voluntary self-giving must never be used to require enduring abuse, abandoning safety, or removing healthy boundaries.",
    'Universal confession of Jesus as Lord does not mean universal salvation.',
  ]
  const guardrails = [
    ...requiredGuardrails,
    ...(Array.isArray(repaired.guardrails) ? repaired.guardrails : []),
  ].filter((item, index, items) => items.findIndex((candidate) => comparable(candidate) === comparable(item)) === index)
  return { ...repaired, guardrails }
}

function normalizePsalmTwentyThreeStudy(raw) {
  return JSON.parse(JSON.stringify(raw), (key, value) => {
    if (typeof value !== 'string') return value
    const fatherRepaired = value.replace(/\bGod the Father as (?:the )?shepherd\b/gi, 'the LORD as shepherd')
    if (/\b(?:culminat(?:e|es|ing) in )?eternal dwelling(?: in (?:God['’]s|the LORD['’]s) house)?\b/i.test(fatherRepaired)
      || /\b(?:this psalm|the psalm|verse 6|the text)\b[^.?!]{0,80}\b(?:promises?|guarantees?|teaches?)\b[^.?!]{0,60}\b(?:heaven|afterlife|eternal life)\b/i.test(fatherRepaired)) {
      return "The psalm ends with confident dwelling in the LORD's house for length of days; it does not explicitly settle the afterlife question."
    }
    return fatherRepaired
  })
}

function hasUnqualifiedPhilippiansTwoLexicalClaim(value, insideNavigate = false) {
  if (Array.isArray(value)) {
    return value.some((item) => hasUnqualifiedPhilippiansTwoLexicalClaim(item, insideNavigate))
  }
  if (value && typeof value === 'object') {
    const navigates = insideNavigate || cleanText(value.id, 40).toLowerCase() === 'navigate'
    return Object.values(value).some((item) => hasUnqualifiedPhilippiansTwoLexicalClaim(item, navigates))
  }
  return typeof value === 'string' && !insideNavigate
    && PHILIPPIANS_TWO_LEXICAL_ASSERTION.test(value)
    && !PHILIPPIANS_TWO_LEXICAL_QUALIFIER.test(value)
}

function appearsInPassage(candidate, text, meaningful = false) {
  const needle = comparable(candidate)
  const words = needle.split(' ').filter(Boolean)
  return needle.length >= (meaningful ? 5 : 2)
    && (!meaningful || words.length >= 2)
    && comparable(text).includes(needle)
}

function appearsInGrounding(candidate, vaultNotes) {
  const needle = comparable(candidate)
  const words = needle.split(' ').filter(Boolean)
  return needle.length >= 8 && words.length >= 2
    && vaultNotes.some((note) => comparable(note).includes(needle))
}

function resolveSourceRef(sourceRef, { text, textUnits, vaultNotes, passageOnly = false }) {
  const value = cleanText(sourceRef, 700)
  const resolvedPassage = value.match(/^Passage:\s*(.+)$/i)
  if (resolvedPassage) {
    const evidence = cleanText(resolvedPassage[1], 650)
    return appearsInPassage(evidence, text, true) ? `Passage: ${evidence}` : null
  }

  const resolvedGrounding = value.match(/^Vault G([1-9]|10):\s*(.+)$/i)
  if (!passageOnly && resolvedGrounding) {
    const index = Number(resolvedGrounding[1]) - 1
    const note = vaultNotes[index]
    const evidence = cleanText(resolvedGrounding[2], 650)
    if (note && (appearsInGrounding(evidence, [note]) || comparable(note).startsWith(comparable(evidence)))) {
      return `Vault G${index + 1}: ${cleanText(note, 650)}`
    }
    return null
  }

  const resolvedVaultPhrase = value.match(/^Vault:\s*(.+)$/i)
  if (!passageOnly && resolvedVaultPhrase) {
    const evidence = cleanText(resolvedVaultPhrase[1], 650)
    return appearsInGrounding(evidence, vaultNotes) ? `Vault: ${evidence}` : null
  }

  const passageRef = value.match(/^P([1-6])$/i)
  if (passageRef) {
    const unit = textUnits[Number(passageRef[1]) - 1]
    return unit ? `Passage: ${unit.anchor}` : null
  }

  const groundingRef = value.match(/^G([1-9]|10)$/i)
  if (!passageOnly && groundingRef) {
    const index = Number(groundingRef[1]) - 1
    const note = vaultNotes[index]
    return note ? `Vault G${index + 1}: ${cleanText(note, 650)}` : null
  }

  if (appearsInPassage(value, text, true)) return `Passage: ${value}`
  if (!passageOnly && appearsInGrounding(value, vaultNotes)) return `Vault: ${value}`
  return null
}

const EVIDENCE_STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'because', 'before', 'being', 'belong', 'belongs',
  'could', 'does', 'during', 'first', 'from', 'have', 'hearers', 'into', 'likely', 'must', 'rather',
  'reader', 'readers', 'scene', 'specific', 'than', 'that', 'their', 'there', 'these', 'they', 'this',
  'through', 'under', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'written',
])

function evidenceTokens(value) {
  return [...new Set(comparable(value).split(' ').filter((token) =>
    token.length >= 4 && !EVIDENCE_STOP_WORDS.has(token)))]
}

function tokensMatch(left, right) {
  return left === right || (left.length >= 5 && right.length >= 5
    && left.slice(0, 5) === right.slice(0, 5))
}

function statementHasEvidence(value, evidence) {
  if (/\b(?:unknown|uncertain|not (?:established|specified)|cannot (?:determine|establish))\b/i.test(value)) return true
  const claimTokens = evidenceTokens(value)
  if (!claimTokens.length) return false
  const sourceTokens = evidenceTokens(evidence)
  const numbers = claimTokens.filter((token) => /\d/.test(token))
  if (numbers.some((token) => !sourceTokens.includes(token))) return false
  const matched = claimTokens.filter((token) => sourceTokens.some((sourceToken) => tokensMatch(token, sourceToken)))
  return matched.length >= Math.min(2, claimTokens.length)
}

function resolveSourceRefs(value, options, maxItems = 4) {
  return [...new Set(cleanList(value, maxItems, 700)
    .map((sourceRef) => resolveSourceRef(sourceRef, options))
    .filter(Boolean))]
}

function requireText(value, message, max) {
  const text = cleanText(value, max)
  if (!text) throw new Error(message)
  return text
}

function validateGuidedStudy(raw, { reference, text, translation, vaultNotes = [] }) {
  if (!raw || typeof raw !== 'object') throw new Error('The guided study did not return a usable object.')

  if (isPhilippiansTwo(reference)) {
    raw = normalizePhilippiansTwoStudy(raw)
  }
  if (isPsalmTwentyThree(reference)) {
    raw = normalizePsalmTwentyThreeStudy(raw)
  }

  try {
    assertNoPulpitLeak(raw)
  } catch {
    throw new Error('The guided study drifted into sermon construction.')
  }
  try {
    assertNoDoctrineLeak(raw)
  } catch {
    throw new Error('The guided study crossed a historic Christian doctrinal boundary.')
  }
  const rawText = cleanText(JSON.stringify(raw), 100_000)
  if (containsUnnegatedClaim(
    rawText,
    DIVINITY_SURRENDER_CLAIM,
    DIVINITY_SURRENDER_ACTION,
  )) {
    throw new Error('The guided study implied that Christ surrendered his divinity.')
  }
  if (/^philippians\b/i.test(cleanText(reference, 120))) {
    const audienceDrift = /\bphilippian (?:prisoners|inmates)\b|\b(?:imprisoned|incarcerated|jailed|chained) philippians\b|\bphilippians\b[^.?!]{0,60}\b(?:in prison|in chains|imprisoned|incarcerated|jailed|chained|external threat)\b|\btheir chains\b/i
    if (audienceDrift.test(rawText)) {
      throw new Error('The guided study confused the author’s imprisonment with the audience’s circumstances.')
    }
  }
  if (isPhilippiansTwo(reference)) {
    if (containsUnnegatedClaim(
      rawText,
      /\b(?:forfeit(?:ed)?|renounc(?:e|ed)|surrender(?:s|ed)?|gave up|laid aside)\b[^.?!]{0,70}\b(?:divine )?(?:honou?r|prestige|privilege|status|rank|equality)\b/i,
      /\b(?:forfeit(?:ed)?|renounc(?:e|ed)|surrender(?:s|ed)?|gave up|laid aside)\b/i,
    )
      || containsUnnegatedClaim(rawText, /\bentered human limitation\b/i, /\bentered\b/i)
      || containsUnnegatedClaim(rawText, /\breleased? (?:its|the) claim (?:upon|on) him\b/i, /\breleased?\b/i)
      || /\bself[- ]emptying (?:of|from) (?:divine )?(?:honou?r|prestige|privilege|status|rank|equality|visibility)\b|\bleaves? behind\b|\bnew mode of existing\b|\bself-displacement\b|\btook no account of his own dignity\b/i.test(rawText)
      || /\b(?:christ|divine nature|form of god)\b[^.?!]{0,100}\benter(?:s|ed)?\b[^.?!]{0,50}\bhuman limitation\b/i.test(rawText)) {
      throw new Error('The guided study misstated Christ’s self-emptying in Philippians 2.')
    }
    if (hasUnqualifiedPhilippiansTwoLexicalClaim(raw)) {
      throw new Error('The guided study presented a disputed Philippians 2 lexical reading as settled.')
    }
    if (containsUnnegatedClaim(
      rawText,
      /\b(?:humility|submission|obedience) (?:always )?(?:leads? to|earns?|receives?|is rewarded with) (?:honou?r|exaltation|vindication|success)\b/i,
      /\b(?:leads? to|earns?|receives?|is rewarded with)\b/i,
    )
      || containsUnnegatedClaim(
        rawText,
        /\bgod (?:answers?|rewards?|responds to) (?:our |faithful )?(?:humility|submission|obedience) with (?:honou?r|exaltation|vindication|success)\b/i,
        /\b(?:answers?|rewards?|responds to)\b/i,
      )
      || /\bvindicat(?:e|es|ed|ing) (?:obedience|humility|submission)\b|\bhonou?r(?:s|ed|ing)? (?:the )?one who obeyed\b|\bcrowns? (?:the )?obedient path\b/i.test(rawText)) {
      throw new Error('The guided study turned Christ’s exaltation into a general reward formula.')
    }
    if (/\b(?:voluntary self-humiliation|obedience over self-protection|God(?: the Father)? honou?rs obedience|God['’]s vindication of obedience|eternal form as God|perceives Christ['’]s obedience|positions him as (?:the )?universal Lord|Christ['’]s refusal of self-regard|renunciation)\b/i.test(rawText)) {
      throw new Error('The guided study made Philippians 2 unsafe or turned Christ’s exaltation into a reward formula.')
    }
    const suppliedEvidence = comparable([text, ...vaultNotes].join(' '))
    if (!/\b(?:roman|empire)\b/.test(suppliedEvidence) && /\b(?:roman|empire)\b/i.test(rawText)) {
      throw new Error('The guided study added unsupported historical background to Philippians 2.')
    }
    if (!/\b(?:shame|execution)\b/.test(suppliedEvidence)
      && /\b(?:shameful (?:death|mode of execution)|mode of execution)\b/i.test(rawText)) {
      throw new Error('The guided study added unsupported crucifixion background to Philippians 2.')
    }
    if (!/\b(?:opposition|threat|persecution)\b/.test(suppliedEvidence)
      && /\bexternal (?:opposition|threat)|\bpersecut(?:e|ed|ion)\b/i.test(rawText)) {
      throw new Error('The guided study overstated the Philippians’ documented pressure.')
    }
  }
  if (isPsalmTwentyThree(reference)
    && /\bGod the Father as (?:the )?shepherd\b|\b(?:culminat(?:e|es|ing) in )?eternal dwelling\b/i.test(rawText)) {
    throw new Error('The guided study overclaimed Psalm 23 or renamed the LORD as God the Father.')
  }
  const forbidden = comparable(JSON.stringify(raw))
  if (/\bwhat does (?:it|this|this text|the passage|the text) mean (?:to|for|in) (?:you|us|me)(?:r life)?\b/.test(forbidden)) {
    throw new Error('The guided study relativized the passage meaning.')
  }
  if (/\b(?:two|three|four|five|\d+) (?:sermon )?points?\b|\b(?:message|talk|sermon) outline\b|\b(?:open|close|start|end) with (?:a |an |the )?(?:story|hook|illustration)\b/.test(forbidden)) {
    throw new Error('The guided study drifted into sermon construction.')
  }

  const mainClaim = requireText(raw.mainClaim, 'The guided study left out the main claim.', 900)
  const textUnits = (Array.isArray(raw.textUnits) ? raw.textUnits : [])
    .map((unit) => ({
      ref: cleanText(unit?.ref, 80),
      heading: cleanText(unit?.heading, 180),
      anchor: compactPassageAnchor(unit?.anchor),
      explanation: cleanText(unit?.explanation, 700),
      logic: cleanText(unit?.logic, 180) || null,
    }))
    .filter((unit) => unit.ref && unit.heading && unit.explanation && appearsInPassage(unit.anchor, text, true))
    .slice(0, 6)
  const passageWordCount = comparable(text).split(' ').filter(Boolean).length
  const minimumUnits = passageWordCount <= 18 ? 1 : 2
  if (textUnits.length < minimumUnits) {
    throw new Error('The guided study did not trace enough natural divisions from the supplied passage.')
  }

  const sourceOptions = { text, textUnits, vaultNotes }
  const rawSituation = raw.situation || {}
  const situationSourceRefs = resolveSourceRefs(rawSituation.sourceRefs, sourceOptions)
  if (!situationSourceRefs.length) {
    throw new Error('The guided study did not ground its historical setting.')
  }
  const situationEvidence = [reference, text, ...vaultNotes].join(' ')
  const rawWhen = requireText(rawSituation.when, 'The guided study left out the original setting.', 300)
  const rawWhere = requireText(rawSituation.where, 'The guided study left out the original setting.', 300)
  const rawPressure = requireText(rawSituation.pressure, 'The guided study left out the first-hearer pressure.', 850)
  const unsupportedWhen = !statementHasEvidence(rawWhen, situationEvidence)
  const unsupportedWhere = !statementHasEvidence(rawWhere, situationEvidence)
  const unsupportedPressure = !statementHasEvidence(rawPressure, situationEvidence)
  const situation = {
    when: unsupportedWhen ? 'The supplied evidence does not establish a precise date.' : rawWhen,
    where: unsupportedWhere ? 'The supplied evidence does not establish a precise location.' : rawWhere,
    pressure: unsupportedPressure
      ? 'The supplied passage and notes do not establish a specific external pressure.'
      : rawPressure,
    whyItChangesReading: requireText(rawSituation.whyItChangesReading, 'The guided study did not explain why context matters here.', 650),
    confidence: unsupportedWhen || unsupportedWhere || unsupportedPressure
      ? 'uncertain'
      : ['documented', 'reconstructed', 'uncertain'].includes(rawSituation.confidence)
      ? rawSituation.confidence
      : 'uncertain',
    sourceRefs: situationSourceRefs,
  }
  if (situation.confidence === 'documented'
    && situation.sourceRefs.some((sourceRef) => /\b(?:c\.|circa|likely|some argue|debated|uncertain|reconstructed|commonly)\b/i.test(sourceRef))) {
    situation.confidence = 'reconstructed'
  }

  const keyTerms = (Array.isArray(raw.keyTerms) ? raw.keyTerms : [])
    .map((term) => ({
      term: cleanText(term?.term, 100),
      meaningHere: cleanText(term?.meaningHere, 420),
      functionInArgument: cleanText(term?.functionInArgument, 500),
      whyItMatters: cleanText(term?.whyItMatters, 500),
    }))
    .filter((term) => term.term && term.meaningHere && term.functionInArgument && term.whyItMatters
      && appearsInPassage(term.term, text))
    .slice(0, 4)
  if (!keyTerms.length) {
    throw new Error('The guided study did not explain a key term from the supplied passage.')
  }

  if (!Array.isArray(raw.covenant) || raw.covenant.length !== COVENANT_STEPS.length) {
    throw new Error('The guided study did not complete all eight COVENANT movements.')
  }
  const covenant = COVENANT_STEPS.map((definition, index) => {
    const step = raw.covenant[index]
    if (!step || cleanText(step.id, 40).toLowerCase() !== definition.id) {
      throw new Error(`The guided study misplaced COVENANT step ${index + 1}.`)
    }
    const sourceRefs = resolveSourceRefs(step.sourceRefs, sourceOptions, 2)
    if (!sourceRefs.length) {
      throw new Error(`The guided study did not ground COVENANT step ${definition.letter}.`)
    }
    return {
      ...definition,
      finding: requireText(step.finding, `The guided study left COVENANT step ${definition.letter} empty.`, 900),
      check: requireText(step.check, `The guided study left COVENANT step ${definition.letter} unchecked.`, 500),
      restraint: cleanText(step.restraint, 500) || null,
      sourceRefs,
    }
  })

  const rawApplication = raw.application || {}
  const application = {
    toThemFirst: requireText(rawApplication.toThemFirst, 'The guided study skipped the original audience.', 650),
    enduringTruth: requireText(rawApplication.enduringTruth, 'The guided study skipped the enduring truth.', 650),
    today: requireText(rawApplication.today, 'The guided study skipped faithful application.', 700),
    corporate: requireText(rawApplication.corporate, 'The guided study skipped corporate application.', 700),
    mission: requireText(rawApplication.mission, 'The guided study skipped mission-facing application.', 700),
    response: requireText(rawApplication.response, 'The guided study skipped a concrete response.', 500),
    sourceRefs: resolveSourceRefs(rawApplication.sourceRefs, sourceOptions, 3),
  }
  if (!application.sourceRefs.length) {
    throw new Error('The guided study did not derive application from the passage.')
  }

  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((item) => ({
      question: cleanText(item?.question, 350),
      answer: cleanText(item?.answer, 700),
      sourceRefs: resolveSourceRefs(item?.sourceRefs, sourceOptions, 3),
    }))
    .filter((item) => item.question && item.answer && item.sourceRefs.length)
    .slice(0, 4)
  if (questions.length < 3) {
    throw new Error('The guided study did not provide enough answered text questions.')
  }

  const mainClaimSources = resolveSourceRefs(raw.mainClaimSources, { ...sourceOptions, passageOnly: true })
  if (!mainClaimSources.length) {
    throw new Error('The guided study did not ground its main claim in the supplied passage.')
  }
  const guardrails = cleanList(raw.guardrails, 4, 600)
  if (guardrails.length < 2) {
    throw new Error('The guided study did not preserve enough interpretive guardrails.')
  }

  return {
    mode: 'guided',
    reference,
    translation,
    mainClaim,
    mainClaimSources,
    situation,
    textUnits,
    keyTerms,
    covenant,
    application,
    guardrails,
    questions,
    vaultSourced: Boolean(vaultNotes.length),
    promptVersion: GUIDED_STUDY_PROMPT_VERSION,
    validatorVersion: GUIDED_STUDY_VALIDATOR_VERSION,
    fromCache: false,
  }
}

function guidedStudyGrounding(vaultNotes) {
  return vaultNotes.length
    ? vaultNotes.map((note, index) => `[G${index + 1}] ${note}`).join('\n')
    : '- No passage-specific vault notes are available. Do not invent historical details.'
}

function guidedStudyGroundingNotes(reference) {
  const vault = lookupPassage(reference, { maxNotes: 10, maxBookNotes: 4 })
  const notes = [...(vault?.notes || [])]
  if (isPhilippiansTwo(reference)) {
    for (const note of PHILIPPIANS_TWO_PUBLIC_GROUNDING) {
      if (!notes.includes(note)) notes.push(note)
    }
  }
  if (isPsalmTwentyThree(reference)) {
    for (const note of PSALM_TWENTY_THREE_PUBLIC_GROUNDING) {
      if (!notes.includes(note)) notes.push(note)
    }
  }
  return notes.slice(0, 10)
}

function guidedStudyPreamble({ reference, text, translation, vaultNotes }) {
  const philippiansTwoRules = isPhilippiansTwo(reference) ? `

For Philippians 2 specifically, stay with Paul's own sequence: Christ is in the form of God; he takes the form of a servant and human likeness; he humbles himself in obedience to death; God highly exalts him. Explain "made himself of no reputation" by the clauses that follow it—taking servant form, becoming truly human, and obeying to death. Do not describe this as losing, forfeiting, renouncing, or surrendering divine honor, privilege, prestige, status, rank, equality, nature, or attributes. Do not say he entered human limitation or that equality released a claim upon him. Do not turn Christ's unique humiliation and exaltation into a rule that humility earns honor or that God rewards submission with temporal exaltation. If the grounding does not establish a disputed lexical conclusion for "robbery," report only the contrast the English text makes rather than choosing among lexical theories.

Paul is imprisoned; the Philippians are not. Never call them imprisoned, chained, prisoners, persecuted, or under external opposition unless a supplied grounding note explicitly says so. Do not use phrases such as "self-emptying of status," "self-displacement," "leaves behind," "new mode of existing," or "enters human limitation." Outside Navigate Tensions, never state that Christ refused to seize, grasp, or exploit equality as the settled meaning of "robbery." In Name the Faithfulness of God, state God's explicit action toward Christ without saying God vindicates obedience, crowns the obedient path, or honors the one who obeyed. Do not add Roman or crucifixion-practice background unless the grounding notes supply it.

For Philippians 2:5-11, keep verse 5 as its own natural unit—the church's command to share Christ's mindset—then trace verses 6-8 and 9-11. Observe the supplied Isaiah 45:23 connection without claiming universal salvation. Examine Genre as epistolary exhortation using elevated, patterned Christological prose; whether Paul is quoting an earlier hymn is disputed. Preserve both truths: Christ's humiliation and exaltation are unique redemptive events, and verse 5 presents his mindset as the church's pattern. Say "God the Father" when contrasting the Father as the actor who exalts the Son; never imply Christ became divine or first became Lord at exaltation.` : ''
  const psalmTwentyThreeRules = isPsalmTwentyThree(reference) ? `

For Psalm 23, keep the LORD (YHWH) as the shepherd named by the psalm. Do not rename the shepherd "God the Father." In the Christ movement, distinguish the psalm's original claim from the later canonical connection to Jesus as the Good Shepherd in John 10. Treat the final dwelling phrase with restraint: it expresses enduring confidence in the LORD's house but does not by itself settle an explicit afterlife or heaven claim.` : ''
  return `You are producing a GUIDED BIBLE STUDY for The Operator on a tablet.

This is a real study, not a quick lookup, and it is not sermon preparation. Do not write preaching points, a manuscript, transitions, hooks, illustrations, or delivery advice. Ask what the text means, never what it means to the reader. Help one serious reader work the text without making the page feel like a textbook.

Use the supplied passage as primary evidence. Historical and canonical claims may come only from the grounding notes below or from the passage itself. Do not invent Greek or Hebrew claims. If the evidence does not establish a detail, say so briefly rather than filling the gap. Keep every block tight, substantive, and written for a serious reader without seminary training.

Keep four layers distinct: what the passage explicitly says, securely established background in the supplied notes, reasonable inference, and disputed interpretation. Never present one layer as another. Meaning is fixed; faithful applications may vary.

Keep every section aligned with the passage's explicit logic. Never reverse a contrast, purpose, cause, result, command, promise, warning, or named actor stated in the text.

Distinguish the author, the original audience, and people inside the passage. Never transfer the author's imprisonment, suffering, office, or circumstances to the audience unless the supplied evidence explicitly does so. Never label the audience weak, fearful, persecuted, wealthy, poor, or compromised without evidence.

Jesus Christ remains fully divine and fully human. Never say he emptied, divested, surrendered, gave up, or laid aside his deity, divine nature, or divine attributes.
${philippiansTwoRules}
${psalmTwentyThreeRules}

These accuracy rules are internal. Never mention the prompt, a hidden lens, an accuracy rubric, or a doctrinal fence in the study.

GROUNDING NOTES:
${guidedStudyGrounding(vaultNotes)}

PASSAGE: ${reference} (${String(translation || '').toUpperCase()})
${text}`
}

function buildGuidedStudyPrompts({ reference, text, translation, vaultNotes }) {
  const preamble = guidedStudyPreamble({ reference, text, translation, vaultNotes })
  const passageWordCount = comparable(text).split(' ').filter(Boolean).length
  const textUnitInstruction = passageWordCount <= 18
    ? 'Create exactly 1 natural textUnit'
    : 'Create 2-4 natural textUnits'
  const foundation = `${preamble}

Build the FOUNDATION half of the study. Return JSON only in this exact shape:
{
  "mainClaim":"one clear paragraph stating what the passage means",
  "mainClaimSources":["P1","P2"],
  "situation":{
    "when":"date or era, restrained when uncertain",
    "where":"where the text or event belongs",
    "pressure":"what the first hearers were facing",
    "whyItChangesReading":"what a modern reader would otherwise miss",
    "confidence":"documented|reconstructed|uncertain",
    "sourceRefs":["G1","P1"]
  },
  "textUnits":[
    {"ref":"verse range","heading":"the author's move","anchor":"an exact contiguous 3-12 word phrase from the supplied passage","explanation":"what this unit contributes","logic":"how it connects to the previous unit or null"}
  ],
  "keyTerms":[
    {"term":"an exact English word or phrase in the supplied passage","meaningHere":"its contextual meaning","functionInArgument":"what it does in this passage","whyItMatters":"why the reading changes if this is missed"}
  ]
}

${textUnitInstruction} and 1-2 keyTerms. Every anchor must be copied exactly and contiguously from the supplied passage, use 3-12 words, contain no ellipsis, and read as a complete phrase rather than ending on a connector such as "to," "and," or "which." Keep the main claim under 38 words; when and where under 18 words each; pressure and why context matters under 30 words each; each unit explanation under 30 words; and each key-term field under 24 words. P1 means the first textUnit anchor, P2 the second, and so on. G1 means the first grounding note. Use only IDs that exist and actually support the claim. Historical context must cite a G source when it makes a historical claim. Key terms explain the supplied English wording in context; when no lexical grounding is supplied, describe what the immediate clauses show rather than claiming an essential-nature definition or importing a disputed original-language conclusion. Aim for 260-340 displayed words.`

  const grounding = vaultNotes.length
    ? 'G1 means the first grounding note, G2 the second, and so on.'
    : 'There are no G sources. State uncertainty instead of inventing background.'
  const passageSpecificApplication = isPhilippiansTwo(reference)
    ? "For Philippians 2, application must first confront people and communities who possess status or power; never use Christ's voluntary self-giving to require someone to endure abuse, abandon safety, or remove healthy boundaries."
    : ''
  const covenantShape = COVENANT_STEPS.map((step) =>
    `    {"id":"${step.id}","finding":"answer ${step.letter} — ${step.title}: ${step.question}","check":"what the reader can verify in the text","restraint":"a real limit or null","sourceRefs":["exact phrase copied from the passage","G1"]}`
  ).join(',\n')
  const covenant = `${preamble}

Build the COVENANT movement section of the study. Walk through all eight COVENANT movements in order. If a matter is disputed or the passage does not supply enough evidence, preserve that restraint.

Return JSON only in this exact shape:
{
  "covenant":[
${covenantShape}
  ]
}

Create exactly 8 COVENANT movements in the order shown, and make every finding answer the named question for that movement rather than repeat a general observation. Examine Genre must name the genre and a reading rule. Name the Faithfulness of God must identify what God does or promises without inventing an unstated covenant promise. Anchor Every Text in Christ must explain Christ's actual role in this text; when Christ is already explicit, do not pretend the passage only points ahead to him. Each finding must be one or two substantive sentences of no more than 34 words. Each check must be no more than 16 words. Each restraint must be no more than 14 words or null. Use exactly one or two sourceRefs per movement. For passage evidence, sourceRefs must copy an exact meaningful 3-10 word phrase from the supplied passage because the study's foundation is being built independently. ${grounding} Use only sources that exist and actually support the claim. Do not repeat the finding inside the check. Aim for 300-400 displayed words.`

  const application = `${preamble}

Build the APPLICATION AND QUESTIONS section of the study. Application must move through the original audience and the passage's own logic before reaching today. Do not personalize the text's meaning; distinguish its one meaning from its faithful applications. Never turn a pattern in the passage into a promise of worldly status, success, health, safety, or temporal exaltation for the reader.

Return JSON only in this exact shape:
{
  "application":{
    "toThemFirst":"what this demanded or supplied to the original hearers",
    "enduringTruth":"the truth that crosses the distance",
    "today":"where that same truth meets an individual life now",
    "corporate":"where it confronts and forms the church together",
    "mission":"how it shapes the church's witness and mission",
    "response":"one concrete response without personal counseling",
    "sourceRefs":["exact phrase copied from the passage"]
  },
  "guardrails":["what not to make the passage say"],
  "questions":[
    {"question":"a question asking what the text means or how we know","answer":"a concise answer","sourceRefs":["exact phrase copied from the passage"]}
  ]
}

Write no more than 28 words in each application field. Keep individual, corporate, and mission application distinct. ${passageSpecificApplication} Create exactly 2 guardrails of no more than 20 words each and exactly 3 answered questions. Each answer must be no more than 32 words. Give each question exactly one sourceRef. For passage evidence, sourceRefs must copy an exact meaningful 3-10 word phrase from the supplied passage because the study's foundation is being built independently. ${grounding} Use only sources that exist and actually support the claim. Aim for 225-300 displayed words.`

  return { foundation, covenant, application }
}

function buildGuidedStudyPrompt(input) {
  const prompts = buildGuidedStudyPrompts(input)
  return `${prompts.foundation}\n\n--- COVENANT PASS ---\n\n${prompts.covenant}\n\n--- APPLICATION PASS ---\n\n${prompts.application}`
}

async function generateGuidedStudy({
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
  if (!apiKey) throw new Error('generateGuidedStudy: apiKey is required')
  if (typeof createClient !== 'function') throw new Error('generateGuidedStudy: createClient is required')

  const vaultNotes = guidedStudyGroundingNotes(reference)
  const client = createClient(apiKey)
  const prompts = buildGuidedStudyPrompts({
    reference,
    text,
    translation,
    vaultNotes,
  })
  const createSection = async (label, content, maxTokens, schema) => {
    const response = await retry(() => client.messages.create({
      model: GUIDED_STUDY_MODEL,
      max_tokens: maxTokens,
      system: 'Return valid JSON only. Be text-driven, complete, concise, and restrained.',
      messages: [{ role: 'user', content }],
      output_config: {
        format: {
          type: 'json_schema',
          schema,
        },
      },
    }))
    if (typeof onUsage === 'function') onUsage(label, response?.usage, GUIDED_STUDY_MODEL)
    if (response?.stop_reason === 'max_tokens') {
      throw new Error(`The ${label.split('.').pop()} section exceeded its output limit.`)
    }
    if (response?.stop_reason === 'refusal') {
      throw new Error(`The ${label.split('.').pop()} section could not be generated.`)
    }
    return response
  }
  const generatePass = async (retrying = false) => {
    const prefix = retrying ? 'guided-study.retry' : 'guided-study'
    const outcomes = await Promise.allSettled([
      createSection(`${prefix}.foundation`, prompts.foundation, GUIDED_FOUNDATION_MAX_TOKENS, GUIDED_STUDY_SCHEMAS.foundation),
      createSection(`${prefix}.covenant`, prompts.covenant, GUIDED_COVENANT_MAX_TOKENS, GUIDED_STUDY_SCHEMAS.covenant),
      createSection(`${prefix}.application`, prompts.application, GUIDED_APPLICATION_MAX_TOKENS, GUIDED_STUDY_SCHEMAS.application),
    ])
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected')
    if (rejected) throw rejected.reason
    const [foundationResponse, covenantResponse, applicationResponse] = outcomes.map((outcome) => outcome.value)
    return {
      ...parse(foundationResponse),
      ...parse(covenantResponse),
      ...parse(applicationResponse),
    }
  }
  const validate = (raw) => validateGuidedStudy(raw, {
      reference,
      text,
      translation,
      vaultNotes,
    })
  const raw = await generatePass()
  try {
    return validate(raw)
  } catch {
    return validate(await generatePass(true))
  }
}

function guidedStudyCacheKey({ reference, text, translation }) {
  const vaultNotes = guidedStudyGroundingNotes(reference)
  const groundingDigest = crypto.createHash('sha256')
    .update(JSON.stringify(vaultNotes))
    .digest('hex')
  const digest = crypto.createHash('sha256').update(JSON.stringify({
    reference: cleanText(reference).toLowerCase(),
    text: cleanText(text, 100_000),
    translation: cleanText(translation).toLowerCase(),
    promptVersion: GUIDED_STUDY_PROMPT_VERSION,
    validatorVersion: GUIDED_STUDY_VALIDATOR_VERSION,
    model: GUIDED_STUDY_MODEL,
    groundingDigest,
  })).digest('hex')
  return `guided-study-v${GUIDED_STUDY_PROMPT_VERSION}-${digest}`
}

function guidedGenreFromFinding(finding) {
  const value = cleanText(finding, 900)
  const genre = [
    [/\b(?:epistle|letter)\b/i, 'Epistle'],
    [/\bgospel\b/i, 'Gospel'],
    [/\bapocalyptic\b/i, 'Apocalyptic'],
    [/\b(?:poetry|poem|psalm|lament)\b/i, 'Poetry'],
    [/\bwisdom\b/i, 'Wisdom'],
    [/\bprophe(?:cy|tic)\b/i, 'Prophecy'],
    [/\b(?:law|legal instruction)\b/i, 'Law'],
    [/\b(?:narrative|history)\b/i, 'Narrative'],
  ].find(([pattern]) => pattern.test(value))?.[1] || 'Genre analysis'
  return {
    genre,
    subgenre: value || 'The COVENANT genre movement was not available.',
    readingRules: value ? [value] : [],
  }
}

function analysisForGuidedStudy(document, passageText) {
  const byId = Object.fromEntries(document.covenant.map((step) => [step.id, step]))
  return {
    reference: document.reference,
    passageText,
    passageReference: document.reference,
    translation: document.translation,
    mainTheme: document.mainClaim,
    authorIntent: {
      doing: byId.verify?.finding || document.mainClaim,
      inOrderThat: byId.teach?.finding || document.application.enduringTruth,
    },
    phrases: [],
    outline: document.textUnits.map((unit) => ({
      point: unit.heading,
      label: unit.explanation,
      verses: unit.ref,
    })),
    canonicalContext: {
      bookTheme: byId.observe?.finding || '',
      passageRole: document.mainClaim,
      biblicalThemes: [],
      canonicalConnections: byId.anchor?.finding || '',
      keyWords: document.keyTerms.map((item) => item.term),
    },
    culturalNotes: [],
    genre: guidedGenreFromFinding(byId.examine?.finding),
    geoReferences: [],
    questionsToConsider: document.questions.map((item) => item.question),
    mode: 'guided',
  }
}

module.exports = {
  GUIDED_STUDY_MODEL,
  GUIDED_STUDY_PROMPT_VERSION,
  GUIDED_STUDY_VALIDATOR_VERSION,
  GUIDED_FOUNDATION_MAX_TOKENS,
  GUIDED_COVENANT_MAX_TOKENS,
  GUIDED_APPLICATION_MAX_TOKENS,
  GUIDED_STUDY_MAX_TOKENS,
  GUIDED_STUDY_SCHEMAS,
  PHILIPPIANS_TWO_PUBLIC_GROUNDING,
  PSALM_TWENTY_THREE_PUBLIC_GROUNDING,
  COVENANT_STEPS,
  buildGuidedStudyPrompt,
  buildGuidedStudyPrompts,
  guidedStudyGroundingNotes,
  validateGuidedStudy,
  generateGuidedStudy,
  guidedStudyCacheKey,
  analysisForGuidedStudy,
}
