/**
 * validate.js — enforcement for PLAIN READ.
 *
 * Prose guardrails leak. This codebase proves it: SlideDeck.tsx and
 * HymnSelector.tsx both pass agentType:'exegetical' to scholarChat, and the
 * handler never destructures agentType — so two JSON-extraction tasks silently
 * run under the full "You are Cole" persona prompt. That is what a prompt-level
 * assumption is worth.
 *
 * The schema stops FIELDS. The checks below stop SHAPES. Both, not one.
 */

const {
  CONFIDENCE_LEVELS,
  SITUATION_FIELDS,
  normalizeSituation,
} = require('./situation')

/*
 * levels.js is being written by another agent this round. Required defensively
 * so this file loads either way — but the FALLBACK IS NOT A NO-OP.
 *
 * The whole point of assertSameReadingAcrossLevels is that the same-reading
 * invariant is enforced in CODE rather than trusted to a prompt. A version of
 * that check which silently passes whenever a file is missing would be worse
 * than no check at all, because it would report success. So when levels.js is
 * absent this file runs its own structural comparison (readingSignature below)
 * and still throws. When levels.js lands, its assertSameReading wins.
 */
let externalAssertSameReading = null
try {
  const levels = require('./levels')
  if (typeof levels.assertSameReading === 'function') {
    externalAssertSameReading = levels.assertSameReading
  }
} catch (err) {
  if (err && err.code !== 'MODULE_NOT_FOUND') throw err
}

const CHRIST_PATHWAYS = [
  'direct-prophecy', 'typology', 'promise-fulfillment',
  'thematic-fulfillment', 'ethical-mission-continuity', 'prophet-priest-king',
]

const APP_FACES = ['duty', 'character', 'goals', 'discernment']

/** dominantFace -> the only step.kind that face may produce. */
const FACE_TO_STEP = {
  duty: 'plan',
  character: 'practice',
  goals: 'reorder',
  discernment: 'question',
}

/** Faces whose steps may carry the psych caveat block. */
const PSYCH_ELIGIBLE_KINDS = ['plan', 'practice']

/**
 * Passages where the reader is more likely to be in pain than in curiosity.
 * Forces sensitive=true regardless of what the model decided.
 */
const SENSITIVE_REFERENCES = [
  /^job\b/i,
  /^lamentations\b/i,
  /^(ps|psalm|psalms)\.?\s*88\b/i,
  /^(ps|psalm|psalms)\.?\s*22\b/i,
  /^2\s*(sam|samuel)\.?\s*1[12]\b/i,
  /^(hos|hosea)\.?\s*[123]\b/i,
  /^(eccl|ecclesiastes)\b/i,
]

const SENSITIVE_THEME = /\b(grief|griev\w*|despair|suicid\w*|abuse|abusiv\w*|divorce|adulter\w*|miscarriage|bereave\w*|mental illness|depress\w*|dying|death of)\b/i

/**
 * Pulpit language. PLAIN READ aims at understanding a text, not delivering it.
 * A leak here is a BUG, not a degraded result.
 */
/*
 * Four of the original patterns were word-bans that also banned ordinary
 * structural description. That was survivable while PLAIN READ emitted no
 * structure. The exegetical outline emits nothing BUT structure, so each of
 * them is now a live false positive that would kill good readings:
 *
 *   congregation\w*  — "the congregation at Philippi" is who the letter went
 *                      to. coleLens.js already instructs the model to write
 *                      "Christians in one congregation hold both and stay in
 *                      fellowship" into differ.summary, which this pattern
 *                      would have thrown on. That was a latent bug, not a
 *                      new one. Banned senses are possessive and delivery-
 *                      target: "your congregation", "tell the congregation".
 *   illustrat\w*     — "v. 12 illustrates the claim" is description. The
 *                      sermon device is the NOUN. Verb forms are released.
 *   exposition(al)?  — "exposition" is also the standard name for the opening
 *                      movement of a narrative, which is exactly what a unit
 *                      heading calls it. The preaching senses are expository /
 *                      expositional / expositor.
 *   transition to    — "the transition to the closing" is description. The
 *                      sermon sense transitions to a POINT.
 *   point (one|1)... — matched "at this point 2 things happen". Now requires
 *                      the label form ("Point 2:") or the ordinal form
 *                      ("the third point").
 *
 * Each narrowing is covered in both directions in test-outline.js. The existing
 * fixtures in test-plainread.js ("an illustration before the third point",
 * "When you preach this") still throw, by design.
 *
 * THREE MORE, found by walking the ban list against real passages rather than
 * against sermon phrasings. sermon / preach / illustration are not only pulpit
 * vocabulary — they are ORDINARY vocabulary for describing what a biblical text
 * says, and the bare word-ban made whole books unreadable in this mode:
 *
 *   sermons?      — Matthew 5-7 is the Sermon on the Mount. Acts 2 is Peter's
 *                   sermon at Pentecost. Any honest reading of those passages
 *                   names them, threw, retried, threw again, and handed the
 *                   reader an error. Banned sense is the DELIVERY artifact:
 *                   "your sermon", "open the sermon", "sermon outline/series".
 *   preach\w*     — Jonah is sent to preach. Timothy is told to preach the
 *                   word. Ecclesiastes calls its own narrator the Preacher.
 *                   Banned sense is THIS READER as the one delivering it:
 *                   "when you preach this", "preaching it on Sunday".
 *   illustrations? — "Verse 12 is an illustration of the claim" is description,
 *                   and the verb form was already released for the same reason.
 *                   Banned sense is the sermon device being placed: "open with
 *                   an illustration", "your illustration", "an illustration
 *                   here".
 *
 * The prompt remains the primary control on all three. This regex is the net
 * under it, and a net that catches the reader is worse than a hole.
 */
const PULPIT_LEAK = new RegExp(
  [
    '\\bhomilet\\w*\\b', '\\bpulpit\\b',
    '\\bdelivery note\\b', '\\byour (people|flock)\\b', '\\bsermon series\\b',
    '\\bsub-?points?\\b', '\\bbig idea\\b',

    // sermon — the DELIVERY ARTIFACT, not the word. "the Sermon on the Mount"
    // and "Peter's sermon at Pentecost" are what the passage IS.
    '\\b(your|my|our|this) sermons?\\b',
    '\\bsermon (outline|prep|preparation|manuscript|intro|introduction|illustration|point|notes?|title|structure|calendar)\\b',
    '\\b(open|close|start|end|begin|finish|deliver|write|draft|plan|build|structure|preach) (the|this|a|your) sermon\\b',

    // preach — THIS READER doing the delivering. Jonah, Timothy and the
    // Preacher of Ecclesiastes all keep their verb.
    /*
     * SECOND PERSON ONLY. `we` and `i` were removed 2026-07-29 after a live run
     * on 1 CORINTHIANS 2 threw on "I preach".
     *
     * The intent was "THIS READER doing the delivering." But "we preach Christ
     * crucified" (1 Cor 1:23) is Paul, and "I preach" is Paul, and "we preach"
     * is how the apostles describe their own work across most of the New
     * Testament. Banning first person made the letters least readable exactly
     * where they talk about proclamation — the same failure as the "preach it"
     * pattern below it, one pronoun over.
     *
     * The reader-directed sense is almost always second person and usually
     * carries a delivery marker, which the "when you preach" line still catches.
     * A net that catches the reader is worse than a hole.
     */
    '\\byou (are |will |would |should |might |can )?(going to )?(preach|preaching|preached)\\b',

    /*
     * First person WITH DELIVERY INTENT — "I would preach this on a Sunday."
     *
     * Dropping `i` and `we` wholesale (see the note above) let Paul keep "we
     * preach Christ crucified", which was the point — but it also let through a
     * reader planning a sermon in the first person, and test-outline caught it.
     *
     * The tell is not the pronoun. It is a MODAL plus a DEMONSTRATIVE: "I would
     * preach THIS" is a man with a passage and a Sunday. "We preach Christ
     * crucified" has neither and stays readable. Requiring both keeps Paul in
     * and keeps the sermon-planning out.
     */
    '\\b(i|we) (would|will|could|should|might|plan to|intend to|am going to|are going to) (preach|teach) (this|it|that)\\b',
    '\\bwhen (you|we) preach\\b',
    /*
     * REMOVED 2026-07-29, after it killed a real reading.
     *
     * The pattern was:
     *   \b(preach|preaching) (this|it|that)\b(?! (gospel|word|message|...))
     *
     * A live run on ROMANS 1:16 — "I am not ashamed of the gospel" — spent
     * 133.7 SECONDS composing a complete document and then threw the whole
     * thing away because the model wrote "preach it." The reader waited over
     * two minutes and got an error, and the retry costs another two.
     *
     * The lookahead was meant to protect exactly this, but it only exempted
     * NOUNS. "Preach the gospel" passed; "preach it", where `it` IS the
     * gospel, did not. A pronoun defeats the whole exemption, and pronouns are
     * how anyone actually writes a second sentence about a subject.
     *
     * It was also redundant. The banned sense — THIS READER doing the
     * delivering — is already caught by the two patterns above: a second-person
     * subject ("you/we/I ... preach") and "when you preach". Paul preaching,
     * Jonah preaching, Timothy told to preach the word, and the Preacher of
     * Ecclesiastes are all ordinary description of what a text SAYS, and a net
     * that catches the reader is worse than a hole.
     *
     * Romans 1:16, Romans 10:14-15, 1 Corinthians 1:23 and 2 Timothy 4:2 are
     * the regression cases. All four are passages ABOUT proclamation; all four
     * were unreadable while this line existed.
     */
    '\\bpreaching (point|calendar|schedule|notes?|the passage|the text)\\b',

    // illustration — the sermon device being placed, not the ordinary noun.
    '\\b(your|my|our) illustrations?\\b',
    '\\b(open|close|start|end|use|add|drop|insert|find|need|with) (an?|the|your|one|another) illustration\\b',
    '\\ban illustration (here|there)\\b',

    // congregation — possessive, or as the target of an act of delivery
    '\\b(your|my|our) (congregation|flock|listeners|hearers|audience)\\b',
    '\\b(tell|telling|remind|reminding|show|showing|lead|leading|walk|walking|take|taking|give|giving|preach|preaching) (the|this|that) congregation\\b',
    '\\bthe congregation (will|would|should|must|needs? to) (hear|feel|see|remember|understand|leave|walk)\\b',

    '\\bexposit(ional|ory|ors?)\\b',
    '\\b(point|pt\\.?) ?(one|two|three|four|five|\\d+) ?[:.\\u2013\\u2014-]',
    '\\b(first|second|third|fourth|fifth|final|last) point\\b',
    '\\btransition(s|ing)? (to|into) (point|the next point|my next|your next|the second|the third)\\b',
  ].join('|'),
  'i'
)

class PlainReadValidationError extends Error {
  constructor(message, { retryable = true, code = null, path = null, sentence = null } = {}) {
    super(message)
    this.name = 'PlainReadValidationError'
    this.retryable = retryable
    this.code = code
    this.path = path
    this.sentence = sentence
  }
}

/** Throws if any pulpit-shaped language survived into the document. */
function assertNoPulpitLeak(doc) {
  const hit = JSON.stringify(doc).match(PULPIT_LEAK)
  if (hit) {
    throw new PlainReadValidationError(
      `PLAIN READ produced pulpit language: "${hit[0]}"`
    )
  }
}

/* ------------------------------------------------------------------ *
 * fence DISCLOSURE — distinct from fence CONTRADICTION
 *
 * assertNoDoctrineLeak (below) catches a document that BREAKS the fence.
 * This catches a document that TALKS ABOUT it. coleLens.js is injected into
 * the system prompt and is written in the second person about a real man:
 * "the convictions of the pastor this tool speaks for", "the pastor's own
 * practice in the pulpit", "this is a named blind spot and the fence exists
 * because of it". A reader who is handed any of that learns that the app
 * encodes one identifiable person's convictions and that he has a named
 * blind spot. None of it is the reader's business, and none of it was ever
 * meant to leave the prompt.
 *
 * Kept deliberately tight. A false positive costs one retry, but a pattern
 * loose enough to fire on ordinary exegetical prose ("Paul's instructions",
 * "restraint fences", "a reader's blind spot") would burn samples on good
 * documents, so each entry is anchored to wording that only the prompt uses.
 * ------------------------------------------------------------------ */
const FENCE_DISCLOSURE = new RegExp(
  [
    '\\bdoctrinal fence\\b',
    '\\bthe fence (exists|is here|says|above|below)\\b',
    '\\ba named blind spot\\b',
    '\\bthis tool speaks for\\b',
    "\\bthe pastor'?s own practice\\b",
    '\\bthe convictions of the pastor\\b',
    '\\b(my|these) instructions\\b',
    '\\bsystem prompt\\b',
    '\\bI was (told|instructed|asked) to\\b',
    // CAUGHT LIVE, not imagined. A Revelation 20 run shipped situation.when as
    // "around AD 95 ... the late date is THE POSITION FOLLOWED HERE, and it is
    // the one attested by the earliest church memory of the book". That is the
    // softest form of the thing the fence's non-disclosure block bans: it
    // sources a date to the document's own editorial stance instead of to
    // evidence, and it tells a reader who cannot see the fence that a position
    // is being held rather than shown. It passed every check in this file.
    //
    // Kept tight on purpose. A document describing what the TEXT does says "in
    // this passage" or "in v. 4", not "the position taken here" — so the
    // false-positive surface is small, and a trip is retryable.
    '\\b(position|reading|view|stance|dating|date)\\s+(taken|followed|held|adopted|assumed|chosen)\\s+here\\b',
    '\\bthis (tool|reading|document|study) (holds|takes|follows|assumes|adopts|prefers)\\b',
  ].join('|'),
  'i'
)

/**
 * Throws if the document discloses the private framing of its own prompt.
 * Retryable — one more sample is the right cost.
 */
function assertNoFenceDisclosure(doc) {
  const hit = JSON.stringify(doc).match(FENCE_DISCLOSURE)
  if (hit) {
    throw new PlainReadValidationError(
      `PLAIN READ disclosed its own prompt framing: "${hit[0]}"`
    )
  }
}

/* ------------------------------------------------------------------ *
 * the doctrinal fence, backstopped in code
 *
 * coleLens.js carries the fence in prose. This file's own header says what a
 * prose guardrail is worth, and coleLens.js's header says the fence has ALREADY
 * been built wrong once: a generic model asked about Revelation reproduces the
 * early date and Babylon = Jerusalem by default. Nothing in this pipeline
 * caught that. Sensitivity is forced in code precisely because the model cannot
 * be trusted with it; the fence had no equivalent, so it gets one here.
 *
 * Scope is deliberately narrow — historic-Christian boundaries, not one
 * pastor's disputed conclusions. Revelation's date and Babylon's identity are
 * live interpretive questions and therefore do not belong in an assertion
 * backstop. Full preterism and a sinful Christ remain outside the boundary.
 * Millennial systems, the manner of the return, and corporate vs. individual
 * election are left to qualified interpretation.
 * A code check cannot tell a held-loosely position from a stated one, and this
 * tool is not in the business of deleting a reading for naming a view.
 *
 * The check runs sentence by sentence and RELEASES any sentence carrying a
 * negator, a hedge, or an attribution, because the fence explicitly permits
 * naming positions ("some readers take Babylon as Jerusalem") and because a
 * restraint fence states the error in order to forbid it ("this does not mean
 * Christ inherited a fallen nature"). That means the check fails toward FALSE
 * NEGATIVES on purpose. A backstop that deletes a good reading is worse than
 * one that misses a phrasing the prompt already discourages — the same
 * reasoning as THIRD_PERSON_ANCHOR below.
 * ------------------------------------------------------------------ */

/** Sentences carrying any of these are describing a position, not asserting it. */
const DOCTRINE_RELEASE = new RegExp(
  [
    "\\bnot\\b", "\\bnever\\b", "\\bnor\\b", "\\bn['’]t\\b",
    '\\bcannot\\b', '\\bwithout\\b', '\\brather than\\b', '\\binstead of\\b',
    '\\bno one\\b', '\\bnobody\\b', '\\bnothing\\b',
    '\\bwrongly\\b', '\\bmistak\\w*\\b', '\\berror\\b', '\\bfalse\\b',
    '\\bden(y|ies|ied|ial)\\b', '\\breject\\w*\\b', '\\bavoid\\w*\\b',
    '\\bwould be\\b', '\\bif\\b',
    '\\bsome (readers|take|hold|read|argue|say|treat|place)\\b',
    '\\bothers (read|take|hold|argue|say|place)\\b',
    '\\ba minority\\b', '\\bone tradition\\b', '\\banother tradition\\b',
    '\\bthe (claim|idea|view|reading|position|argument) that\\b',
    '\\b(is|are) sometimes\\b', '\\boutside orthodoxy\\b',
    '\\bcommonly (misread|misheard|taken|assumed)\\b',
    '\\bpushed further\\b', '\\bover-?read\\w*\\b',
  ].join('|'),
  'i'
)

/**
 * Each rule is an ASSERTION shape — the form a reader would walk away
 * believing. Named so the retry prompt tells the model what it broke.
 */
const DOCTRINE_RULES = [
  {
    name: 'full preterism — the return, resurrection or judgment placed in the past (the fence: all three are future and real)',
    re: /\b(?:the )?(?:second coming|return of christ|christ['’]?s return|his return|final judgment|last judgment|bodily resurrection|resurrection of the dead)\b[^.?!]{0,60}?\b(?:already (?:happened|occurred|took place|came)|(?:is|was) (?:entirely |wholly |all )?(?:past|behind us)|(?:was|were) fulfilled in (?:a\.?\s?d\.?\s*)?70)\b/i,
  },
  {
    name: 'full preterism — Christ described as having already returned (the fence: the return is future, personal and bodily)',
    re: /\b(?:christ|jesus|the lord)\b[^.?!]{0,40}?\b(?:has )?already (?:returned|come again|come back)\b/i,
  },
  {
    name: 'full preterism — all prophecy closed at AD 70 (the fence: AD 70 is backdrop, not fulfillment)',
    re: /\ball (?:of )?(?:prophecy|biblical prophecy|the prophecies|these things|of it)\b[^.?!]{0,40}?\b(?:was|were|has been|have been)\s+fulfilled\b[^.?!]{0,30}?\b(?:a\.?\s?d\.?\s*)?70\b/i,
  },
  {
    name: 'Christ given a fallen or sinful nature (the fence: he never inherited corruption)',
    re: /\b(?:christ|jesus|the son)\b[^.?!]{0,50}?\b(?:inherited|assumed|took on|took up|bore|shared|received|had|carried)\b[^.?!]{0,40}?\b(?:a |our |the )?(?:fallen|sinful|corrupt(?:ed)?|depraved)\s+(?:human\s+)?(?:nature|humanity|flesh)\b/i,
  },
  {
    name: 'Christ given a fallen or sinful nature (the fence: he never inherited corruption)',
    re: /\b(?:fallen|sinful|corrupt(?:ed)?|depraved)\s+(?:human\s+)?(?:nature|humanity|flesh)\b[^.?!]{0,30}?\bof (?:christ|jesus)\b/i,
  },
]

/** Every string in the document, in no particular order. */
function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out)
  return out
}

/**
 * Throws when the document asserts something the doctrinal fence forbids.
 * Retryable — one more sample is the right cost for a fence break.
 */
function assertNoDoctrineLeak(doc) {
  for (const text of collectStrings(doc)) {
    for (const sentence of String(text).split(/(?<=[.?!])\s+|\n+/)) {
      if (!sentence.trim()) continue
      if (DOCTRINE_RELEASE.test(sentence)) continue
      for (const rule of DOCTRINE_RULES) {
        const hit = sentence.match(rule.re)
        if (hit) {
          throw new PlainReadValidationError(
            `PLAIN READ contradicted the doctrinal fence — ${rule.name}: "${hit[0].trim()}"`
          )
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * disputed interpretation — Revelation 20 benchmark backstop
 *
 * The live Revelation 20 audit found the same failure in several forms: the
 * generator named a real debate in `differ`, then stated one side as fact in a
 * normal step. Shape validation cannot catch that contradiction. These rules
 * are intentionally passage-scoped and narrow; they prevent the benchmark's
 * demonstrated overclaims without pretending a regex can arbitrate eschatology.
 * ------------------------------------------------------------------ */

const DISPUTE_QUALIFIER =
  /\b(?:some|other|another|one)\s+(?:readers?|views?|traditions?|interpretations?)\b|\b(?:disputed|debated|uncertain|does not settle|doesn't settle|leaves open|is an inference|can be read)\b|\b(?:may|might|could|perhaps|possibly)\b[^.?!]{0,45}\b(?:be read|function|represent|refer|mean|symboliz|indicate|suggest|identify|recognize|associate|hear|understand|connect)\w*\b|\b(?:amillennial|premillennial|postmillennial|dispensational|idealist|preterist|futurist|conditionalist)\s+(?:reading|view|readers?|tradition|interpretation)\b/i

const REVELATION_AUDIENCE_QUALIFIER =
  /\b(?:some|others?|not every|not all|mixed|varied|faithful and compromised|afflicted and complacent|comfort and warning|warning and comfort|tempted to give in)\b/i

const REVELATION_AUDIENCE_FLATTENING =
  /\b(?:the|these|those|first|john's)?\s*(?:seven\s+)?(?:churches|readers|hearers|recipients|believers|people)\b[^.?!]{0,140}\b(?:persecut\w*|pressur\w*|frightened|cornered|punish\w*|execut\w*|kill\w*|holding the line|staying faithful|under a state)\b|\b(?:frightened|persecuted|pressured|cornered)\s+(?:people|churches|believers|readers)\b/i

const EZEKIEL_GOG_SOURCE_SCOPE =
  /\b(?:in|from|where|read)\s+(?:the\s+(?:vision|prophecy)\s+in\s+)?ezekiel\s+3[89](?:\s*[-–—]\s*39)?\b/i
const EZEKIEL_GOG_SOURCE_DESCRIPTION =
  /\b(?:massed|coalition|prince|land|army|armies|enemy nations?|names?|figures?)\b/i
const EZEKIEL_GOG_OVERCLAIM =
  /\b(?:all|every|universal|worldwide|modern|end-time|russia|soviet|turkey|china|iran)\b|\b(?:means?|represents?|refers? to|stands? for|functions? as|serves? as|shorthand for)\b/i

const REVELATION_20_DISPUTE_RULES = [
  {
    name: 'the thousand years stated as a settled system',
    re: /\b(?:thousand|1,?000)\s+years?\b[^.?!]{0,140}\b(?:is|means?|represents?|symboliz\w*|denotes?|refers to|marks?)\b[^.?!]{0,100}\b(?:literal|symbolic|calendar|church age|present age|future reign)\b/i,
  },
  {
    name: 'Revelation numbers stated as uniformly symbolic',
    re: /\b(?:revelation(?:'s)?|the book(?:'s)?)?\s*numbers?\b[^.?!]{0,100}\b(?:are|is|function as|signify|mean)\b[^.?!]{0,80}\b(?:symbolic|fullness|not a datable span)\b|\b(?:revelation|the book)\b[^.?!]{0,70}\buses?\s+(?:its\s+)?numbers?\s+as\s+symbols?\b/i,
  },
  {
    name: 'apocalyptic genre used to deny chronology',
    re: /\b(?:this|the)\s+(?:passage|text|vision|book|writing)\b[^.?!]{0,100}\b(?:is not|isn't|does not|doesn't|never was)\b[^.?!]{0,70}\b(?:timeline|calendar|schedule|timetable)\b|\b(?:treating|reading|turning)\b[^.?!]{0,80}\b(?:images?|passage|vision|apocalyptic)\b[^.?!]{0,80}\b(?:as|into)\s+(?:a\s+)?(?:timeline|calendar|schedule|timetable)\b[^.?!]{0,80}\b(?:forces?|mistake|misread|error)\b/i,
  },
  {
    name: 'chapters 19 and 20 chronology stated as settled',
    re: /\b(?:chapter|revelation)?\s*19\b[^.?!]{0,150}\b(?:same battle|same conflict|recapitul\w*|retell\w*|sequential|later rebellion|comes after)\b[^.?!]{0,100}\b(?:chapter|revelation)?\s*20\b|\b(?:chapter|revelation)?\s*20\b[^.?!]{0,150}\b(?:same battle|same conflict|recapitul\w*|retell\w*|sequential|later rebellion|comes after)\b[^.?!]{0,100}\b(?:chapter|revelation)?\s*19\b/i,
  },
  {
    name: 'the unnamed throne occupant identified as settled',
    re: /\b(?:one seated|one who sits|occupant|the throne|this throne)\b[^.?!]{0,90}\b(?:is|belongs to|is the throne of)\b[^.?!]{0,40}\b(?:christ|jesus|god|the father)\b|\b(?:christ|jesus|god|the father)\b[^.?!]{0,60}\b(?:sits on|occupies|owns)\b[^.?!]{0,30}\b(?:the )?throne\b/i,
  },
  {
    name: 'the first resurrection identified as settled',
    re: /\bfirst resurrection\b[^.?!]{0,100}\b(?:is|means?|refers to|describes?)\b[^.?!]{0,80}\b(?:bodily|spiritual|conversion|regeneration|heavenly life)\b|\b(?:why|how)\s+(?:is|does)\b[^.?!]{0,40}\bfirst resurrection\b[^.?!]{0,80}\b(?:bodily|spiritual|conversion|regeneration|heavenly life)\b/i,
  },
  {
    name: 'Gog and Magog decoded as one settled referent',
    re: /\bgog\s+(?:and|&)\s+magog\b[^.?!]{0,180}\b(?:is|are|means?|represents?|refers? to|stands? for|functions? as|serves? as|shorthand for)\b\s+(?!(?:names?|figures?|terms?|words?|characters?)\b)[^.?!]{0,100}\b(?:all|every|universal|worldwide|final|modern|end-time|russia|soviet|turkey|china|iran)\b|\bgog\s+(?:and|&)\s+magog\b[^.?!]{0,180}\b(?:those|these|the)\s+(?:names|figures)\b[^.?!]{0,80}\b(?:stand|function|serve|operate)\w*\b[^.?!]{0,80}\b(?:all|every|universal|worldwide|final|modern|end-time|russia|soviet|turkey|china|iran)\b|\bgog\s+(?:and|&)\s+magog\b[^.?!]{0,180}\bheard\s+(?:as\s+)?shorthand\b[^.?!]{0,80}\b(?:all|every|universal|worldwide|final|modern|end-time|russia|soviet|turkey|china|iran)\b/i,
  },
  {
    name: 'Gog and Magog universalized through a pronoun',
    re: /\b(?:these|those|the)\s+(?:names|figures)\b[^.?!]{0,140}\b(?:became|become|are|were|function\w*|serve\w*|operate\w*|stand\w*|shorthand for)\b[^.?!]{0,90}\b(?:every enemy|all enemies|all opposition|enemy everywhere)\b/i,
  },
  {
    name: 'the beloved city identified as settled',
    re: /\b(?:beloved city|camp of the saints)\b[^.?!]{0,100}\b(?:is|means?|represents?|refers? to|stands? for)\b[^.?!]{0,60}\b(?:jerusalem|church|covenant people)\b/i,
  },
  {
    name: 'believers included in or excluded from the throne scene as settled',
    re: /\bbelievers?\b[^.?!]{0,100}\b(?:are|is)\b[^.?!]{0,30}\b(?:absent|excluded|not judged|judged)\b|\b(?:the dead|those before the throne)\b[^.?!]{0,80}\b(?:are|means?)\b[^.?!]{0,40}\b(?:only unbelievers|believers and unbelievers)\b|\b(?:everyone who (?:has )?ever died|everyone|every (?:person|human being)|all (?:humanity|people|human beings))\b[^.?!]{0,140}\b(?:stands?|stood|will stand|answers?|is judged|are judged|will be judged|accounting|courtroom|throne)\b|\b(?:throne|courtroom|judgment|accounting)\b[^.?!]{0,140}\b(?:everyone|every (?:person|human being)|all (?:humanity|people|human beings))\b/i,
  },
  {
    name: 'deeds and the book of life related as a settled system',
    re: /\bbook of life\b[^.?!]{0,100}\b(?:overrides?|decides?|determines?)\b[^.?!]{0,60}\b(?:outcome|destiny|verdict|who)\b|\bdeeds?\b[^.?!]{0,45}\b(?:are|is|serve as|function as)\b[^.?!]{0,35}\b(?:evidence|proof)\b/i,
  },
  {
    name: 'human final punishment system stated as settled by this passage',
    re: /\b(?:people|humans?|unbelievers?|anyone not found)\b[^.?!]{0,120}\b(?:eternal conscious torment|annihilat\w*|cease to exist|tormented forever)\b/i,
  },
  {
    name: 'Hades flattened into a literal grave',
    re: /\bhades\b[^.?!]{0,50}\b(?:literally means?|is simply|is just|equals?)\b[^.?!]{0,30}\b(?:grave|hole|pit)\b/i,
  },
  {
    name: 'Satan described with annihilation language',
    re: /\b(?:satan|the devil|the dragon)\b[^,;:.?!]{0,35}\b(?:(?:is|was|will be|has been)\s+(?:annihilat\w*|destroyed)|ceases?\s+to\s+exist)\b/i,
  },
  {
    name: 'Satan confused with the army consumed by fire',
    re: /\b(?:satan|the devil|the dragon|the deceiver|the one behind[^.?!]{0,70}deceiv\w*)\b[^.?!]{0,220}\b(?:is|was|gets?|got|will be)\s+(?:consumed|wiped out|burned up)\b[^.?!]{0,55}\b(?:by|with)\s+(?:the\s+)?fire\b/i,
  },
  {
    name: 'original readers given one certain imperial referent',
    re: /\b(?:the\s+)?(?:original|first)\s+(?:readers|hearers|audience)\b[^.?!]{0,50}\bknew\b[^.?!]{0,160}\b(?:rome|roman empire|empire|imperial)\b/i,
  },
]

const ARMY_CONSUMED_BY_FIRE =
  /\b(?:army|armies|nations?)\b[^,;:.?!]{0,40}\b(?:is|are|was|were|gets?|got|will be)\s+(?:consumed|wiped out|burned up)\b[^.?!]{0,55}\b(?:by|with)\s+(?:the\s+)?fire\b/i

function collectTextEntries(value, path = [], out = []) {
  if (typeof value === 'string') out.push({ path: path.join('.'), text: value })
  else if (Array.isArray(value)) value.forEach((item, index) => collectTextEntries(item, [...path, String(index)], out))
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectTextEntries(item, [...path, key], out)
  }
  return out
}

function assertInterpretiveNeutrality(doc, { reference } = {}) {
  if (!/^(?:rev(?:elation)?\.?)\s*20\b/i.test(String(reference || doc?.reference || ''))) return

  for (const entry of collectTextEntries(doc)) {
    if (
      entry.path.startsWith('differ.') ||
      entry.path.startsWith('unknowns.') ||
      entry.path === 'meaning.misread.claim' ||
      entry.path === 'meaning.assumes'
    ) continue

    for (const sentence of String(entry.text).split(/(?<=[.?!])\s+|\n+/)) {
      if (!sentence.trim()) continue
      if (
        REVELATION_AUDIENCE_FLATTENING.test(sentence) &&
        !REVELATION_AUDIENCE_QUALIFIER.test(sentence)
      ) {
        throw new PlainReadValidationError(
          `PLAIN READ flattened Revelation's mixed seven churches into one pressured audience: "${sentence.trim()}"`,
          {
            code: 'REVELATION_MIXED_AUDIENCE',
            path: entry.path,
            sentence: sentence.trim(),
          }
        )
      }
      if (DISPUTE_QUALIFIER.test(sentence)) continue
      for (const rule of REVELATION_20_DISPUTE_RULES) {
        if (
          rule.name === 'Gog and Magog decoded as one settled referent' &&
          EZEKIEL_GOG_SOURCE_SCOPE.test(sentence) &&
          EZEKIEL_GOG_SOURCE_DESCRIPTION.test(sentence) &&
          !EZEKIEL_GOG_OVERCLAIM.test(sentence)
        ) {
          continue
        }
        if (
          rule.name === 'Satan confused with the army consumed by fire' &&
          ARMY_CONSUMED_BY_FIRE.test(sentence)
        ) {
          continue
        }
        const hit = sentence.match(rule.re)
        if (!hit) continue
        throw new PlainReadValidationError(
          `PLAIN READ stated a disputed Revelation 20 conclusion as settled — ${rule.name}: "${sentence.trim()}"`,
          {
            code: 'REVELATION_DISPUTED_CONCLUSION',
            path: entry.path,
            sentence: sentence.trim(),
          }
        )
      }
    }
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function assertStep(step, label) {
  if (!step || typeof step !== 'object') {
    throw new PlainReadValidationError(`work.${label} is missing`)
  }
  for (const field of ['body', 'youCanCheck', 'theMove']) {
    if (!isNonEmptyString(step[field])) {
      throw new PlainReadValidationError(`work.${label}.${field} is empty`)
    }
  }
}

/* ------------------------------------------------------------------ *
 * the exegetical outline
 *
 * An exegetical outline describes the TEXT: the author's own units, keyed to
 * verse ranges. A homiletical outline describes a TALK. The first is required
 * here; the second stays banned. The whole difference lands in the heading —
 * "vv. 11-12 — the claim: he learned contentment in both directions" versus
 * "Point 2: Be Content" — so the heading is where the enforcement goes.
 *
 * Every throw below is retryable. That is deliberate: these are heuristics over
 * English, and a false positive should cost one more sample, not a dead reading.
 * ------------------------------------------------------------------ */

/** Quoted spans are the TEXT's own words, not address to the reader. */
function stripQuotedSpans(s) {
  return String(s)
    .replace(/[“"«]([^”"»]*)[”"»]/g, ' ')
    .replace(/‘([^’]*)’/g, ' ')
}

/** Leading "vv. 11-12 —" style reference, so the heading proper can be read. */
const UNIT_REF_PREFIX = /^\s*(?:(?:vv?|vss?|verses?)\.?\s*)?\d+(?::\d+)?(?:\s*[-–—]\s*\d+(?::\d+)?)?\s*[-–—:,.]?\s*/i

const SEGMENT_SPLIT = /[—–:;!?]|(?:\s+-\s+)|\.(?:\s|$)/

const LEADING_FILLER = /^(?:and|then|so|but|now|next|also|therefore|thus|finally|first|second|third|fourth|fifth|again|here|there)\b[\s,]*/i

const SECOND_PERSON = /\b(you|your|yours|yourself|yourselves)\b/i
const WE_MODAL = /\bwe\s+(should|must|need to|ought|have to|are to|are called to)\b/i
const LET_US = /\blet\s+us\b|\blet[’']s\b/i

/** Homiletical furniture that is not caught by PULPIT_LEAK's broader net. */
const HOMILETICAL_HEADING = /\b(main idea|take-?away|call to action|application point|closing challenge|hook|landing)\b/i

/**
 * Verbs that, leading a clause with no subject, read as a command. Curated
 * rather than exhaustive — a false positive here breaks a good outline, so the
 * list stays close to exhortation vocabulary and leans on the anchors below.
 */
const IMPERATIVE_VERBS = new Set([
  'be', 'do', 'dont', 'never', 'always', 'stop', 'start', 'begin',
  'trust', 'obey', 'believe', 'repent', 'pray', 'rejoice', 'remember', 'forget',
  'seek', 'love', 'give', 'choose', 'follow', 'submit', 'surrender', 'commit',
  'embrace', 'apply', 'practice', 'live', 'stand', 'fight', 'guard', 'hold',
  'cling', 'rest', 'wait', 'endure', 'persevere', 'imitate', 'serve', 'forgive',
  'confess', 'share', 'go', 'come', 'stay', 'press', 'lean', 'cast', 'receive',
  'learn', 'keep', 'put', 'take', 'make', 'ask', 'listen', 'look', 'consider',
  'examine', 'reflect', 'meditate', 'resist', 'avoid', 'refuse', 'walk', 'run',
  'watch', 'beware', 'honor', 'fear', 'worship', 'thank', 'praise', 'hope',
  'let', 'turn', 'return', 'draw', 'bring', 'build', 'count', 'carry', 'bear',
  'offer', 'set',
])

/**
 * Anchors that mark a clause as DESCRIPTION rather than command. Scanned over
 * everything after the first word — "be" and "must" are excluded on purpose,
 * since "Do not be anxious" would otherwise rescue itself.
 */
const AUX_ANCHOR = /\b(is|are|was|were|has|have|had|will|would|can|could|may|might|shall|does|did|becomes|became)\b/i

/**
 * KNOWN LIMIT, accepted on purpose. Third-person subjects are what make a
 * clause a description ("trust in the promise grounds the command", "the money
 * he gives"), so they release the imperative test — which means an imperative
 * that happens to contain one gets through: "Follow him wherever he leads"
 * is NOT caught. That is the correct direction to fail. The prompt is the
 * primary control; this check is the backstop, and a backstop that deletes good
 * outlines is worse than one that misses an occasional bad heading.
 */
const THIRD_PERSON_ANCHOR = /\b(he|she|they)\b/i
const STRUCTURAL_VERB = /\b(opens|closes|marks|names|turns|shifts|moves|repeats|restates|answers|explains|follows|echoes|builds|states|shows|sets|bounds|introduces|reports|records|describes|signals|frames|links|connects|returns|ends|begins|grounds|narrows|widens|lands|drives|carries|holds|runs|breaks|gives|takes|adds|stacks|pairs|contrasts|compares|quotes|cites|defines|qualifies|limits|expands|resolves|raises|illustrates)\b/i
const STRUCTURAL_WORD = /\b(claims?|clauses?|verses?|text|author|writer|speaker|narrator|argument|narrative|scene|unit|section|paragraph|lines?|contrast|grounds?|result|escalation|restatement|shift|inclusio|chiasm|chiastic|parallel|parallelism|repetition|imperatives?|indicatives?|refrain|quotations?|structure|movement|thesis|summary|background|setup|exposition|climax|resolution|questions?|answer|appeal|commands?|charge|list|pattern|bracket|sequence|formula|statements?|exhortations?|reason|purpose|evidence|example|aside|digression|address|greeting|closing|opening|pivot|hinge)\b/i

/**
 * Second person in a COMMANDING shape.
 *
 * Outline headings ban the second person outright — a heading is a claim about
 * the text and has no business addressing anybody. situation.soWhat is
 * different: its whole job is to say what changes in YOUR reading, so a flat
 * second-person ban would reject the field's own definition and burn a sample
 * on every good block. What must still be caught there is the slide from
 * describing a reading to instructing a reader.
 */
const SECOND_PERSON_COMMAND =
  /\byou\s+(should|must|need to|ought|have to|are to|are called to|will want to|might want to)\b|\bask yourself\b|\byour (job|task|duty|assignment|responsibility|challenge|homework|takeaway)\b/i

/* ------------------------------------------------------------------ *
 * PROSE MODE — two overrides that beat the descriptive release anchors.
 *
 * The release anchors above were tuned against outline HEADINGS, which are
 * fragments. situation.soWhat is one or two FULL SENTENCES, and a full English
 * sentence nearly always contains "is", or a third-person pronoun, or one of
 * the structural verbs — so in prose the anchors release almost every command
 * put to them. Measured, not guessed; all three of these reached a reader:
 *
 *   "Remember that contentment is learned, not given."  released by "is"
 *   "Apply this to the next time your budget moves."    released by "moves"
 *   "Trust God ... the way this writer did."            released by "writer"
 *
 * Both overrides are scoped to prose mode, so outline headings keep the old
 * behaviour byte for byte.
 * ------------------------------------------------------------------ */

/**
 * An imperative verb followed IMMEDIATELY by a pronoun or demonstrative object.
 * "Remember that", "Apply this", "Hold it" — a noun-phrase subject never starts
 * this way, so no descriptive anchor later in the sentence can rescue it.
 */
const IMPERATIVE_OBJECT =
  /^(?:this|that|these|those|it|them|him|her|us|me|yourself|yourselves|your)\b/i

/**
 * Subordinators. A release anchor sitting AFTER one of these is inside a
 * subordinate clause, which says nothing about whether the main clause is a
 * command — "Trust God with your finances the way this writer did" has a finite
 * verb, but it is buried in a relative clause and the sentence is still an
 * order.
 */
const SUBORDINATOR =
  /\b(that|the way|when|while|whether|because|since|if|who|whom|which|what|where|wherever|until|though|although|so that|in order to|next time|every time|each time)\b/i

/**
 * True when a descriptive anchor genuinely releases the leading imperative.
 *
 * In prose mode an anchor found inside a subordinate clause does not count.
 * Outside prose mode this is the original behaviour: any anchor, anywhere.
 */
function releasedByAnchor(rest, proseMode) {
  for (const re of [AUX_ANCHOR, THIRD_PERSON_ANCHOR, STRUCTURAL_VERB, STRUCTURAL_WORD]) {
    const m = re.exec(rest)
    if (!m) continue
    if (proseMode && SUBORDINATOR.test(rest.slice(0, m.index))) continue
    return true
  }
  return false
}

/**
 * Returns a reason string when a heading exhorts the reader, or null when it
 * describes the text.
 *
 * @param {string} heading
 * @param {object} [options]
 * @param {boolean} [options.allowSecondPerson] permit plain second-person
 *   description ("what you read here changes") while still rejecting
 *   second-person COMMANDS. Default false — outline headings keep the old,
 *   stricter behaviour exactly.
 */
function hortatoryReason(heading, options = {}) {
  const allowSecondPerson = options.allowSecondPerson === true
  const raw = String(heading || '')
  const bare = stripQuotedSpans(raw)

  if (allowSecondPerson) {
    if (SECOND_PERSON_COMMAND.test(bare)) return 'it tells the reader what to do'
  } else if (SECOND_PERSON.test(bare)) {
    return 'it addresses the reader in the second person'
  }
  if (WE_MODAL.test(bare)) return 'it tells the reader what "we" should do'
  if (LET_US.test(bare) && !STRUCTURAL_WORD.test(bare)) return 'it is phrased as an exhortation ("let us")'
  if (HOMILETICAL_HEADING.test(bare)) return 'it is a piece of talk scaffolding, not a description of the text'

  // The leading-imperative test runs per clause, so a descriptive tail cannot
  // rescue a command at the front ("Remember the poor — the closing charge").
  const body = stripQuotedSpans(raw.replace(UNIT_REF_PREFIX, ''))
  for (const rawSegment of body.split(SEGMENT_SPLIT)) {
    let segment = String(rawSegment || '').trim()
    segment = segment.replace(LEADING_FILLER, '').replace(LEADING_FILLER, '').trim()
    if (!segment) continue

    const words = segment.toLowerCase().match(/[a-z’']+/g) || []
    if (!words.length) continue

    const first = words[0].replace(/[’']/g, '')
    if (!IMPERATIVE_VERBS.has(first)) continue

    const rest = words.slice(1).join(' ')

    // Prose mode only: an imperative with a pronoun object is a command no
    // matter what follows it, so no anchor gets a vote.
    const beyondDoubt = allowSecondPerson && IMPERATIVE_OBJECT.test(rest)
    if (!beyondDoubt && releasedByAnchor(rest, allowSecondPerson)) continue

    return `it opens with the command "${segment.split(/\s+/)[0]}"`
  }

  return null
}

/** Convenience predicate for callers and tests. */
function isHortatoryHeading(heading) {
  return hortatoryReason(heading) !== null
}

/* --- verse ranges ---------------------------------------------------- */

const NUMERIC_RANGE = /^(?:(\d+)\s*:\s*)?(\d+)(?:\s*-\s*(?:(\d+)\s*:\s*)?(\d+))?$/

/** chapter+verse as one comparable integer, so cross-chapter ranges just work. */
function ord(chapter, verse) {
  return chapter * 1000 + verse
}

/** Strips a book name and any verse markers, leaving the numbers. */
function numericCore(ref) {
  let s = String(ref || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/^\s*(?:vv?|vss?|verses?)\.?\s*/, '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!s) return null

  const tokens = s.split(' ')
  // "1 Corinthians 15:51-58" — drop the ordinal that belongs to the book name.
  if (/^[1-3]$/.test(tokens[0]) && tokens[1] && !/\d/.test(tokens[1])) tokens.shift()
  let i = 0
  while (i < tokens.length && !/\d/.test(tokens[i])) i += 1
  const core = tokens.slice(i).join(' ').replace(/\s*-\s*/g, '-').replace(/\s*:\s*/g, ':')
  return core || null
}

/**
 * Bounds of the passage under study, or null when it cannot be parsed.
 * A chapter-only reference ("Psalm 23") returns null on purpose: there is no
 * verse bound to check against, and guessing one would invent a constraint.
 */
function parsePassageRange(reference) {
  const core = numericCore(reference)
  if (!core) return null
  const m = NUMERIC_RANGE.exec(core)
  if (!m) return null
  const [, c1, v1, c2, v2] = m
  if (!c1) return null
  const chapter = Number(c1)
  const endChapter = c2 ? Number(c2) : chapter
  const start = ord(chapter, Number(v1))
  const end = ord(endChapter, v2 !== undefined ? Number(v2) : Number(v1))
  if (end < start) return null
  return { chapter, start, end }
}

/** Bounds of one outline unit, resolved against the passage's chapter. */
function parseUnitRange(ref, defaultChapter) {
  const core = numericCore(ref)
  if (!core) return null
  const m = NUMERIC_RANGE.exec(core)
  if (!m) return null
  const [, c1, v1, c2, v2] = m
  const startChapter = c1 ? Number(c1) : defaultChapter
  if (!startChapter) return null
  const endChapter = c2 ? Number(c2) : startChapter
  const start = ord(startChapter, Number(v1))
  const end = ord(endChapter, v2 !== undefined ? Number(v2) : Number(v1))
  if (end < start) return null
  return { start, end }
}

function assertUnitShape(unit, label) {
  if (!unit || typeof unit !== 'object') {
    throw new PlainReadValidationError(`${label} is not an object`)
  }
  if (!isNonEmptyString(unit.ref)) {
    throw new PlainReadValidationError(`${label}.ref is empty — every unit is keyed to a verse range`)
  }
  if (!isNonEmptyString(unit.heading)) {
    throw new PlainReadValidationError(`${label}.heading is empty`)
  }
  const reason = hortatoryReason(unit.heading)
  if (reason) {
    throw new PlainReadValidationError(
      `${label}.heading exhorts the reader instead of describing the text — ${reason}: "${unit.heading}". ` +
      'Headings say what the TEXT DOES in that unit.'
    )
  }
}

/**
 * Validates and normalizes the exegetical outline. Returns the clean block.
 */
function validateOutline(rawOutline, { reference } = {}) {
  if (!rawOutline || typeof rawOutline !== 'object') {
    throw new PlainReadValidationError(
      'outline block missing — the structure of the text is required, not optional'
    )
  }
  if (!isNonEmptyString(rawOutline.shape)) {
    throw new PlainReadValidationError(
      'outline.shape is empty — name the structural pattern, or say plainly that the passage is linear'
    )
  }

  const passage = parsePassageRange(reference)
  const singleVerse = Boolean(passage && passage.start === passage.end)
  const minimumUnits = singleVerse ? 1 : 2
  const rawUnits = Array.isArray(rawOutline.units) ? rawOutline.units : []
  if (rawUnits.length < minimumUnits) {
    throw new PlainReadValidationError(
      singleVerse
        ? 'outline.units is empty — even a single verse needs one structural unit'
        : `outline.units has ${rawUnits.length} unit(s) — a multi-verse passage needs at least two real movements`
    )
  }

  const defaultChapter = passage ? passage.chapter : null

  const inPassage = (range, label) => {
    if (!passage || !range) return
    if (range.start < passage.start || range.end > passage.end) {
      throw new PlainReadValidationError(
        `${label} cites verses outside the passage (${reference}) — the outline maps THIS text, nothing beyond it`
      )
    }
  }

  const units = []
  const parsedRanges = []
  let previousRange = null

  rawUnits.forEach((rawUnit, i) => {
    const label = `outline.units[${i}]`
    assertUnitShape(rawUnit, label)

    const range = parseUnitRange(rawUnit.ref, defaultChapter)
    if (passage && !range) {
      throw new PlainReadValidationError(
        `${label}.ref "${rawUnit.ref}" is not a readable verse range — every unit must map to THIS passage`
      )
    }
    inPassage(range, `${label}.ref "${rawUnit.ref}"`)

    if (range && previousRange) {
      if (range.start < previousRange.start) {
        throw new PlainReadValidationError(
          `${label}.ref "${rawUnit.ref}" runs backwards — units follow the order of the passage`
        )
      }
      if (range.start <= previousRange.end) {
        throw new PlainReadValidationError(
          `${label}.ref "${rawUnit.ref}" overlaps the unit before it — each supplied verse belongs to one top-level unit`
        )
      }

      const priorChapter = Math.floor(previousRange.end / 1000)
      const nextChapter = Math.floor(range.start / 1000)
      const nextVerse = range.start % 1000
      const gapWithinChapter =
        priorChapter === nextChapter && range.start !== previousRange.end + 1
      const gapAcrossChapters =
        nextChapter > priorChapter &&
        (nextChapter !== priorChapter + 1 || nextVerse !== 1)
      if (gapWithinChapter || gapAcrossChapters) {
        throw new PlainReadValidationError(
          `${label}.ref "${rawUnit.ref}" leaves a gap after the unit before it — the outline must cover every supplied verse`
        )
      }
    }
    if (range) {
      previousRange = range
      parsedRanges.push(range)
    }

    // logic is the joint between units. The first unit has nothing before it.
    const logic = isNonEmptyString(rawUnit.logic) ? rawUnit.logic.trim() : null
    if (i > 0 && !logic) {
      throw new PlainReadValidationError(
        `${label}.logic is empty — say how this unit hangs on the one before it (contrast, ground, result, escalation, restatement, shift in scene)`
      )
    }

    // Two levels only. Anything deeper is off-contract, so it is dropped rather
    // than carried into a document the renderer has no shape for.
    const rawChildren = Array.isArray(rawUnit.children) ? rawUnit.children : []
    const children = rawChildren.map((rawChild, j) => {
      const childLabel = `${label}.children[${j}]`
      assertUnitShape(rawChild, childLabel)
      const childRange = parseUnitRange(rawChild.ref, defaultChapter)
      inPassage(childRange, `${childLabel}.ref "${rawChild.ref}"`)
      if (range && childRange && (childRange.start < range.start || childRange.end > range.end)) {
        throw new PlainReadValidationError(
          `${childLabel}.ref "${rawChild.ref}" falls outside its parent unit "${rawUnit.ref}" — a sub-unit is part of the unit above it`
        )
      }
      return {
        ref: String(rawChild.ref).trim(),
        heading: String(rawChild.heading).trim(),
        logic: isNonEmptyString(rawChild.logic) ? rawChild.logic.trim() : null,
      }
    })

    units.push({
      ref: String(rawUnit.ref).trim(),
      heading: String(rawUnit.heading).trim(),
      logic,
      children: children.length ? children : null,
    })
  })

  if (passage && parsedRanges.length) {
    const first = parsedRanges[0]
    const last = parsedRanges[parsedRanges.length - 1]
    if (first.start !== passage.start || last.end !== passage.end) {
      throw new PlainReadValidationError(
        `outline.units does not cover the full passage (${reference}) — the first unit must begin at the first supplied verse and the last must end at the last supplied verse`
      )
    }
  }

  return { shape: rawOutline.shape.trim(), units }
}

/* ------------------------------------------------------------------ *
 * the situation block — the room the text walked into
 *
 * THE HIGH-RISK PART, NAMED. This block is nothing but historical claims. It is
 * exactly the class of output the adversarial checker exists to catch, and
 * exactly the class a layman cannot verify: an invented edict reads the same as
 * a real one, and this block renders FIRST, so a fabrication here frames every
 * word the reader reads after it.
 *
 * Nothing in this file can tell whether a historical claim is TRUE. What it can
 * do is three things, and it does all three:
 *   1. refuse an empty or half-filled block, so the failure is loud;
 *   2. keep `confidence` on the three-value scale so the honesty valve cannot
 *      be bypassed by returning "certain" or "high";
 *   3. hold the block to the same voice rules as the rest of the document.
 * Truth is verify.js's job — see the extraction hook in situation.js, and the
 * cache-key note in the module footer.
 * ------------------------------------------------------------------ */

/**
 * A Revelation date placed before AD 70, caught inside the situation block.
 *
 * assertNoDoctrineLeak already covers this, but its rules anchor on the word
 * "revelation" appearing in the SAME SENTENCE as the date — which is exactly
 * what a situation block does not do. `when` for Revelation reads "written
 * under Nero, before the fall of Jerusalem" with the book named nowhere near
 * it, because the book is the thing being read. The general check would miss
 * it, and this is the single most likely fence break the tool will ever
 * produce: a generic model asked about Revelation reproduces the early date by
 * default, and coleLens.js exists because that has already been built wrong
 * once.
 *
 * Anchored on the REFERENCE instead of the prose, and released by the same
 * hedges as the general check so "some readers date it under Nero" survives.
 */
const REVELATION_REFERENCE = /^\s*(?:the\s+)?(?:rev|revelation|apocalypse)\b/i
const PRE_70_DATE =
  /\bunder nero\b|\bnero['’]?s reign\b|\bin the (?:a\.?\s?d\.?\s*)?60s\b|\bbefore (?:a\.?\s?d\.?\s*70|the fall of jerusalem|the destruction of the temple)\b|\ba\.?\s?d\.?\s*6[0-9]\b/i

function assertSituationDate(situation, reference) {
  if (!REVELATION_REFERENCE.test(String(reference || ''))) return
  for (const field of ['when', 'where', 'pressure']) {
    const text = String(situation[field] || '')
    for (const sentence of text.split(/(?<=[.?!])\s+|\n+/)) {
      if (!sentence.trim()) continue
      if (DOCTRINE_RELEASE.test(sentence)) continue
      const hit = sentence.match(PRE_70_DATE)
      if (hit) {
        throw new PlainReadValidationError(
          `situation.${field} dates Revelation before AD 70 ("${hit[0].trim()}") — ` +
          'it was written late, around AD 95, under Domitian'
        )
      }
    }
  }
}

/**
 * Validates and normalizes the situation block. Returns the clean block.
 *
 * Every throw is retryable: these are formatting and voice failures, and one
 * more sample is the right cost.
 */
function validateSituation(rawSituation, { reference } = {}) {
  if (!rawSituation || typeof rawSituation !== 'object') {
    throw new PlainReadValidationError(
      'situation block missing — the reader gets the room the text walked into BEFORE the passage, not as an optional extra'
    )
  }

  const situation = normalizeSituation(rawSituation)

  for (const field of SITUATION_FIELDS) {
    if (!isNonEmptyString(situation[field])) {
      throw new PlainReadValidationError(`situation.${field} is empty`)
    }
  }

  // confidence never throws — normalizeSituation has already coerced anything
  // off the scale to "reconstructed". Asserted here so a change to that
  // contract fails loudly in this file rather than silently shipping a
  // made-up confidence label above a reader's passage.
  if (!CONFIDENCE_LEVELS.includes(situation.confidence)) {
    throw new PlainReadValidationError(
      `situation.confidence "${situation.confidence}" is not one of ${CONFIDENCE_LEVELS.join(', ')}`
    )
  }

  // soWhat describes a situation. It does not exhort — that is what the
  // application block is for, and a second command in the document is how a
  // reading turns back into the talk PLAIN READ exists to not be.
  const reason = hortatoryReason(situation.soWhat, { allowSecondPerson: true })
  if (reason) {
    throw new PlainReadValidationError(
      `situation.soWhat exhorts the reader instead of describing what changes — ${reason}: ` +
      `"${situation.soWhat}". Say what a reader would otherwise get wrong here.`
    )
  }

  // Same voice rules as everything else. Run against the block on its own so
  // this function is a complete gate by itself, not only when it happens to be
  // called from inside validatePlainRead.
  assertNoPulpitLeak(situation)
  assertNoFenceDisclosure(situation)
  assertSituationDate(situation, reference)

  return situation
}

/**
 * Normalizes and validates a parsed PLAIN READ document in place-ish
 * (returns a new object). Throws PlainReadValidationError on anything the
 * pipeline should retry.
 */
function validatePlainRead(raw, { reference } = {}) {
  if (!raw || typeof raw !== 'object') {
    throw new PlainReadValidationError('PLAIN READ returned no object')
  }
  const doc = { ...raw }

  // --- 1. meaning -------------------------------------------------------
  if (!doc.meaning || typeof doc.meaning !== 'object') {
    throw new PlainReadValidationError('meaning block missing')
  }
  if (!isNonEmptyString(doc.meaning.plain)) {
    throw new PlainReadValidationError('meaning.plain is empty')
  }
  if (!isNonEmptyString(doc.meaning.assumes)) {
    throw new PlainReadValidationError(
      'meaning.assumes is empty — a reading that hides its own commitments is untrustworthy'
    )
  }
  if (doc.meaning.misread && !doc.meaning.misread.exists) {
    doc.meaning.misread = null
  }

  // --- 2. the six steps -------------------------------------------------
  if (!doc.work || typeof doc.work !== 'object') {
    throw new PlainReadValidationError('work block missing')
  }
  for (const label of ['genre', 'setting', 'surroundings', 'words', 'story', 'doing']) {
    assertStep(doc.work[label], label)
  }

  // Named Christ-pathway or no Christ claim. null is a NORMAL answer.
  if (!CHRIST_PATHWAYS.includes(doc.work.christPathway)) {
    doc.work.christPathway = null
  }

  // --- 3. distance ------------------------------------------------------
  if (!isNonEmptyString(doc.distance)) {
    throw new PlainReadValidationError('distance is empty')
  }

  // --- 4. sensitivity, decided in code, not by the model -----------------
  const refHit = SENSITIVE_REFERENCES.some((re) => re.test(String(reference || doc.reference || '')))
  const themeHit = SENSITIVE_THEME.test(JSON.stringify(doc.meaning || {}))
  doc.sensitive = Boolean(doc.sensitive) || refHit || themeHit

  // --- 5. application ---------------------------------------------------
  if (!doc.application || typeof doc.application !== 'object') {
    throw new PlainReadValidationError('application block missing')
  }
  const app = { ...doc.application }

  app.faces = Array.isArray(app.faces) ? app.faces.filter((f) => APP_FACES.includes(f)) : []
  if (app.faces.length === 0) {
    throw new PlainReadValidationError('application.faces produced no valid face')
  }
  if (!app.faces.includes(app.dominantFace)) {
    throw new PlainReadValidationError(
      `application.dominantFace "${app.dominantFace}" is not among faces [${app.faces.join(', ')}]`
    )
  }
  if (!isNonEmptyString(app.toThemFirst) || !isNonEmptyString(app.thenToYou)) {
    throw new PlainReadValidationError('application must run to-them-first then to-you')
  }

  // The face governs the SHAPE of the step. It never suppresses the step.
  app.step = app.step && typeof app.step === 'object' ? { ...app.step } : {}
  const required = FACE_TO_STEP[app.dominantFace]
  if (app.step.kind !== required) app.step.kind = required
  const stepKindBeforeSensitivity = app.step.kind

  // Sensitive passages never issue an instruction. They ask a question.
  if (doc.sensitive) {
    app.step.kind = 'question'
    if (
      stepKindBeforeSensitivity !== 'question' &&
      !isNonEmptyString(app.step.question)
    ) {
      app.step.question =
        'When this passage touches something you are carrying, what would it look like to face that moment with a trusted person beside you?'
    }
  }

  if (app.step.kind === 'question') {
    if (!isNonEmptyString(app.step.question)) {
      throw new PlainReadValidationError('application.step.question is empty')
    }
    app.step.cue = null
    app.step.action = null
  } else {
    // cue + action stay SEPARATE fields; the renderer composes the sentence.
    // No regex on prose form — an earlier draft's /^when .+, ?then i .+/i
    // rejected its own flagship example over an em dash.
    if (!isNonEmptyString(app.step.cue) || !isNonEmptyString(app.step.action)) {
      throw new PlainReadValidationError(
        `application.step of kind "${app.step.kind}" needs both cue and action`
      )
    }
    app.step.question = null
  }
  doc.application = app

  // --- 6. restraint — not optional --------------------------------------
  doc.restraint = Array.isArray(doc.restraint) ? doc.restraint.filter(isNonEmptyString) : []
  if (doc.restraint.length < 2) {
    throw new PlainReadValidationError(
      'restraint needs at least 2 fences — this section ships the guardrails WITH the reading'
    )
  }
  doc.restraint = doc.restraint.slice(0, 4)

  // --- 7. where honest readers differ -----------------------------------
  if (doc.differ) {
    const views = Array.isArray(doc.differ.views) ? doc.differ.views.filter(isNonEmptyString) : []
    if (views.length < 2) {
      // A model that can only produce one side shuts up rather than asserts.
      doc.differ = null
    } else {
      const tier = doc.differ.tier
      doc.differ = {
        tier: tier === 'secondary' || tier === 'tertiary' ? tier : null,
        summary: isNonEmptyString(doc.differ.summary) ? doc.differ.summary : '',
        views,
      }
    }
  } else {
    doc.differ = null
  }

  // --- 8. unknowns — empty array is legal, missing field is not ---------
  if (!Array.isArray(doc.unknowns)) {
    throw new PlainReadValidationError(
      'unknowns[] missing — an honest no-result state is required, not optional'
    )
  }
  doc.unknowns = doc.unknowns.filter(isNonEmptyString)

  // --- 9. handoff -------------------------------------------------------
  if (!isNonEmptyString(doc.handoff)) {
    throw new PlainReadValidationError('handoff is empty')
  }

  // --- 10. the exegetical outline ---------------------------------------
  // The structure of the TEXT, not of a talk. Required.
  doc.outline = validateOutline(doc.outline, {
    reference: reference || doc.reference || '',
  })

  // --- 10b. the situation -----------------------------------------------
  // The room the text walked into. Renders FIRST, so it is validated like a
  // first-class block, not like an ornament hung off the top of the page.
  doc.situation = validateSituation(doc.situation, {
    reference: reference || doc.reference || '',
  })

  // --- 11. shapes, last -------------------------------------------------
  assertNoPulpitLeak(doc)
  assertNoFenceDisclosure(doc)

  // --- 12. the doctrinal fence, last of all -----------------------------
  // Shape first, doctrine second: a document that is not a PLAIN READ at all
  // should fail as that, not as a fence break.
  assertNoDoctrineLeak(doc)
  assertInterpretiveNeutrality(doc, { reference: reference || doc.reference || '' })

  return doc
}

/* ------------------------------------------------------------------ *
 * language level — same reading, different words
 *
 * The ruling this implements: "same meaning derived at the text, but the
 * language needs to be user level or it will intimidate." Process fixed,
 * meaning fixed, language moves.
 *
 * That is easy to say in a prompt and impossible to trust to one. A model told
 * to simplify will simplify the CONCLUSION as readily as the vocabulary: the
 * newcomer variant quietly loses the doctrinal dispute, or drops from a
 * character text to a duty text because commands are easier to write simply,
 * and nobody notices because both documents read fine on their own. A reader
 * would then be handed a different theology because he clicked the easier
 * button. That is a theological failure, not a formatting one, so it is
 * enforced here in code.
 * ------------------------------------------------------------------ */

/**
 * Situation fields that are part of the READING, not part of the wording.
 *
 * levels.js owns the structural field list, and its list cannot include these:
 * the situation block landed in the same round it did. `confidence` belongs
 * here because it is a claim about evidence, not a word choice — a block that
 * says "documented" at one level and "uncertain" at another is telling two
 * different readers two different things about how much weight the history
 * carries. The prose fields are excluded on purpose; every word of them is
 * supposed to change.
 */
const SITUATION_LEVEL_FIELDS = ['confidence']

/**
 * The parts of a reading that must NOT move between language levels.
 *
 * Prose is excluded by design — every word of it is supposed to change. What
 * is compared is the set of decisions the reading made: whether it treated the
 * passage as sensitive, whether it claimed a pathway to Christ, which face of
 * application the text works by, what shape of step that produced, whether a
 * genuine doctrinal dispute was reported and at what tier, how well attested
 * the history was said to be, and where the author's own units start and stop.
 *
 * Unit boundaries are compared as PARSED VERSE RANGES, not as strings, so
 * "vv. 11-12" and "v. 11-12" are the same boundary. Headings are prose and are
 * not compared.
 *
 * THE COUNTS ARE HERE ON PURPOSE. restraint, unknowns and differ.views are
 * compared by how MANY the reader is handed, never by what they say — the words
 * are supposed to move, the number is not. A live generation of Ephesians 2:8-10
 * at both levels returned the whole "where honest readers differ" block at
 * standard (tier tertiary, two named views) and NO such block at plain. The
 * newcomer was handed a confident single reading of the exact clause the
 * tradition splits over, with nothing telling him it was disputed. Counting is
 * what catches that, and nothing was counting.
 */
const FALLBACK_STRUCTURAL_FIELDS = [
  'sensitive',
  'work.christPathway',
  'application.dominantFace',
  'application.step.kind',
  'differ.tier',
  'differ.views.length',
  'situation.confidence',
  'outline.units[].ref',
  'restraint.length',
  'unknowns.length',
]

/** The decisions a reading made, stripped of every word it used to say them. */
function readingSignature(doc) {
  const passage = parsePassageRange(doc?.reference || '')
  const defaultChapter = passage ? passage.chapter : null
  const units = Array.isArray(doc?.outline?.units) ? doc.outline.units : []

  return {
    sensitive: Boolean(doc?.sensitive),
    'work.christPathway': doc?.work?.christPathway ?? null,
    'application.dominantFace': doc?.application?.dominantFace ?? null,
    'application.step.kind': doc?.application?.step?.kind ?? null,
    'differ.tier': doc?.differ ? (doc.differ.tier ?? 'present') : null,
    'differ.views.length': Array.isArray(doc?.differ?.views) ? doc.differ.views.length : 0,
    'situation.confidence': doc?.situation?.confidence ?? null,
    // Counts, not content. How many fences and open questions the reader is
    // handed is the reading; the wording of each one is not.
    'restraint.length': Array.isArray(doc?.restraint)
      ? doc.restraint.filter(isNonEmptyString).length
      : 0,
    'unknowns.length': Array.isArray(doc?.unknowns)
      ? doc.unknowns.filter(isNonEmptyString).length
      : 0,
    'outline.units[].ref': units.map((u) => {
      const range = parseUnitRange(u?.ref, defaultChapter)
      return range ? `${range.start}-${range.end}` : String(u?.ref || '').trim().toLowerCase()
    }),
  }
}

/**
 * Rewrites outline unit refs to a canonical ordinal form, on a COPY.
 *
 * WHY THIS RUNS BEFORE DELEGATION. levels.js compares unit refs as raw strings.
 * "vv. 11-12", "verses 11-12" and "4:11-12" are the SAME BOUNDARY written three
 * ways, and the entire premise of a language level is that the wording moves —
 * so a plain-level document that spells its refs out in words would be reported
 * as a changed READING. That is a false theological alarm, and a false alarm
 * here is expensive: it blocks a legitimate variant and tells the reader the two
 * levels disagree about where the text turns when they agree exactly.
 *
 * Only the SPELLING is normalised. "vv. 11-12" and "vv. 11-13" stay different,
 * because they ARE different, and an unparseable ref is passed through as
 * written rather than dropped, so a malformed ref still surfaces as a
 * difference instead of quietly matching everything.
 *
 * The originals are never mutated. The renderer shows the reader the refs the
 * model actually wrote; this form exists only to be compared.
 */
function withCanonicalUnitRefs(doc) {
  const units = doc?.outline?.units
  if (!Array.isArray(units)) return doc

  const passage = parsePassageRange(doc?.reference || '')
  const defaultChapter = passage ? passage.chapter : null

  const canonRef = (ref) => {
    const range = parseUnitRange(ref, defaultChapter)
    return range ? `${range.start}-${range.end}` : String(ref ?? '').trim().toLowerCase()
  }
  const canonUnit = (u) => ({
    ...u,
    ref: canonRef(u?.ref),
    children: Array.isArray(u?.children) ? u.children.map(canonUnit) : (u?.children ?? null),
  })

  return { ...doc, outline: { ...doc.outline, units: units.map(canonUnit) } }
}

function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => v === b[i])
  }
  return a === b
}

/**
 * Throws when two level variants of the same passage are not the same READING.
 *
 * Accepts either an array of documents or a map keyed by level
 * ({ standard: doc, newcomer: doc }). Fewer than two variants is a no-op —
 * there is nothing to compare, and a single reading cannot contradict itself.
 *
 * Delegates to levels.js's assertSameReading when that module is present, since
 * that file owns the level contract. When it is absent the local signature
 * comparison runs instead. It never silently passes: a check that reports
 * success because a file was missing is worse than no check.
 *
 * Retryable — the remedy is to regenerate the variant that drifted, not to kill
 * both readings.
 */
function assertSameReadingAcrossLevels(variants, { reference } = {}) {
  const entries = Array.isArray(variants)
    ? variants.map((doc, i) => [String(i), doc])
    : Object.entries(variants || {})
  const usable = entries.filter(([, doc]) => doc && typeof doc === 'object')
  if (usable.length < 2) return true

  const [baseLabel, baseDoc] = usable[0]
  const baseSig = externalAssertSameReading ? null : readingSignature(baseDoc)

  for (const [label, doc] of usable.slice(1)) {
    if (externalAssertSameReading) {
      // levels.js owns the structural contract when it is present. Its error
      // lists EVERY diverged field rather than the first, which is the better
      // message — so the message is kept verbatim and only the error TYPE is
      // converted. validate.js's contract is that everything it throws is a
      // PlainReadValidationError, and callers switch on exactly that.
      try {
        externalAssertSameReading(
          withCanonicalUnitRefs(baseDoc),
          withCanonicalUnitRefs(doc),
          { labelA: baseLabel, labelB: label }
        )
      } catch (err) {
        const converted = new PlainReadValidationError(
          `language level changed the reading, not just the words${reference ? ` (${reference})` : ''}: ` +
          `${err && err.message}`
        )
        if (err && Array.isArray(err.fields)) converted.fields = err.fields
        converted.cause = err
        throw converted
      }
    } else {
      const sig = readingSignature(doc)
      for (const field of FALLBACK_STRUCTURAL_FIELDS) {
        if (sameValue(baseSig[field], sig[field])) continue
        const show = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : String(v))
        throw new PlainReadValidationError(
          `language level changed the reading, not just the words: ${field} is ` +
          `${show(baseSig[field])} at "${baseLabel}" but ${show(sig[field])} at "${label}"` +
          (reference ? ` (${reference})` : '') +
          '. Levels move the language. The meaning derived at the text does not move.'
        )
      }
    }

    // The situation block, which levels.js's field list cannot cover. Runs on
    // BOTH paths — this is the one part of the reading this file owns.
    for (const field of SITUATION_LEVEL_FIELDS) {
      const a = baseDoc?.situation?.[field] ?? null
      const b = doc?.situation?.[field] ?? null
      if (a === b) continue
      throw new PlainReadValidationError(
        `language level changed the reading, not just the words: situation.${field} is ` +
        `"${a}" at "${baseLabel}" but "${b}" at "${label}"` +
        (reference ? ` (${reference})` : '') +
        '. How well attested the history is does not depend on who is reading it.'
      )
    }
  }

  return true
}

module.exports = {
  validatePlainRead,
  assertNoPulpitLeak,
  assertNoFenceDisclosure,
  FENCE_DISCLOSURE,
  assertNoDoctrineLeak,
  assertInterpretiveNeutrality,
  REVELATION_20_DISPUTE_RULES,
  DOCTRINE_RULES,
  DOCTRINE_RELEASE,
  PlainReadValidationError,
  CHRIST_PATHWAYS,
  APP_FACES,
  FACE_TO_STEP,
  PSYCH_ELIGIBLE_KINDS,
  PULPIT_LEAK,
  validateOutline,
  isHortatoryHeading,
  hortatoryReason,
  parsePassageRange,
  parseUnitRange,
  // the situation block
  validateSituation,
  assertSituationDate,
  SECOND_PERSON_COMMAND,
  // language level
  assertSameReadingAcrossLevels,
  readingSignature,
  // The fallback list only. levels.js owns STRUCTURAL_FIELDS and its entries
  // are descriptor objects, not path strings — re-exporting one under the
  // other's name would hand a caller two different types under one contract.
  FALLBACK_STRUCTURAL_FIELDS,
  SITUATION_LEVEL_FIELDS,
}

/*
 * ------------------------------------------------------------------
 * INTEGRATION NOTE — pipeline.js, owned by another agent this round
 *
 * Two things have to land there for this round to be correct, and neither can
 * be done from this file:
 *
 * 1. THE LEVEL MUST ENTER THE CACHE KEY.
 *    cacheKeyFor(analysis) currently returns
 *      `plain-read-v2-${PROMPT_VERSION}-${ref}-${analysisHash}`
 *    PROMPT_VERSION is one number per build, so a newcomer reading and a
 *    standard reading of the same passage hash to the SAME key and overwrite
 *    each other. Whoever generates first wins, and the other reader is served
 *    a document written for somebody else — silently, permanently, from cache.
 *    The fix is one interpolation: `...-${level}-${analysisHash}`.
 *
 * 2. THE SCHEMA HINT MUST CARRY `situation`.
 *    SCHEMA_HINT in pipeline.js says "Return JSON of exactly this shape" and is
 *    the LAST instruction the model sees. validateSituation now REQUIRES the
 *    block, so leaving it out of that hint puts the user turn in direct
 *    contradiction with the system prompt — the same failure documented in the
 *    comment above SCHEMA_HINT when `outline` was missing from it, which cost a
 *    reader two full model calls and an error. Splice SITUATION_SCHEMA_HINT
 *    (re-exported from prompt.js) the way OUTLINE_SCHEMA_HINT is spliced.
 * ------------------------------------------------------------------
 */
