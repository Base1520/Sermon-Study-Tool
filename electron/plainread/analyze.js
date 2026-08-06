/**
 * analyze.js — the passage analysis fan-out.
 *
 * Lifted out of electron/main.js unchanged in behaviour, for one reason: the
 * hosted server has to be able to run it. /v1/read takes an `analysis` object in
 * its request body, and until this file existed the ONLY thing that could
 * produce one was the Electron main process using the user's own Anthropic key.
 * That made "download it and go" impossible — a hosted user would still have had
 * to get a key to complete step one of two.
 *
 * Same contract as pipeline.js and for the same reason: imports nothing from
 * Electron, takes every dependency by injection. What stays in main.js is what
 * genuinely belongs to the desktop — the electron-store cache, the history
 * dedupe, the feature gate, the secret lookup, the progress events. What lives
 * here is the part that spends money, so both callers spend it identically.
 *
 * ONE COPY. Do not add a second one under server/. Two hand-maintained copies of
 * the same list is exactly what produced the dead ASV button, where the desktop
 * offered a translation the API had never been able to serve.
 */

const crypto = require('crypto')

const { withRetry, parseModelJSON, checkGenerationInput } = require('./runtime')

/** Models, named once. The split is deliberate — see the two branches below. */
const CORE_MODEL = 'claude-opus-4-8'
const SUPPORT_MODEL = 'claude-sonnet-4-6'

/**
 * The cache key both callers must agree on.
 *
 * Content-addressed: reference plus a hash of the passage text, so a different
 * translation of the same reference is a different entry rather than a silent
 * mismatch between the text on screen and the analysis under it.
 */
function analysisCacheKey(reference, text) {
  const textHash = crypto.createHash('md5').update(text.trim()).digest('hex').slice(0, 8)
  return `analysis-cache-v6-${reference.trim().toLowerCase().replace(/\s+/g, '-')}-${textHash}`
}

/**
 * Keep only places the passage ACTUALLY names.
 *
 * The model is asked for locations explicitly present in the text and will still
 * return the recipient city from a book title, a place from a neighbouring
 * chapter, or an interpretive identification of a symbol. Anything that reaches
 * the map is a claim the app is making about the text, so the filter is a
 * substring check against the passage itself rather than a matter of trust.
 * "Gog and Magog" is on the non-mappable list because it is a disputed
 * identification, not one pin.
 */
function explicitGeoReferences(raw, passageText) {
  if (!Array.isArray(raw) || !passageText) return []
  const nonMappable = new Set([
    'earth',
    'sea',
    'heaven',
    'hades',
    'four corners of the earth',
    'broad plain of the earth',
    'beloved city',
    'gog',
    'magog',
    'gog and magog',
  ])
  const normalizedText = String(passageText)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')

  return raw.filter((entry) => {
    const place = String(entry?.place ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!place || nonMappable.has(place)) return false
    return ` ${normalizedText} `.includes(` ${place} `)
  }).slice(0, 8)
}

// ── Prompts ─────────────────────────────────────────────────────────────────
// Verbatim from main.js. Do not "tidy" these — the source-discipline paragraphs
// are load-bearing, and the JSON shapes are what the renderer reads.

const ENRICH_PROMPT = `You are a biblical scholar identifying cultural background, genre, and geographic references for sermon preparation.

SOURCE DISCIPLINE:
- The supplied passage controls. Separate what it explicitly says from historical background and interpretive inference.
- Never state a debated identification, chronology, symbolic referent, or theological system as settled fact.
- If a background claim is disputed, say so inside the explanation and mark claimStatus "disputed".
- If a claim is a reasonable synthesis rather than documented background, mark claimStatus "inferred".
- Do not invent a Roman custom, Jewish practice, ancient memory, geography, or lexical claim.
- A mixed audience must stay mixed. Do not describe every church in Revelation as persecuted; the seven churches include faithful, pressured, compromised, and complacent congregations.
- In apocalyptic, name inherited imagery without pretending every symbol has one undisputed decoding.

Return ONLY valid JSON, no markdown:
{
  "geoReferences": [
    {
      "place": "exact city or region name matching canonical biblical spelling (e.g. 'Rome', 'Corinth', 'Jerusalem')",
      "verses": ["verse reference where it appears, e.g. 'Romans 1:7'"],
      "significance": "one sentence on why this location matters to the passage"
    }
  ],
  "culturalNotes": [
    {
      "id": "cn1",
      "phraseId": "p1",
      "term": "specific word, phrase, or custom",
      "category": "greco-roman|jewish|roman-legal|ane|hellenistic|household-code|honor-shame",
      "explanation": "2-4 sentences on what this meant to the original audience and why a modern reader misses it",
      "significance": "one sentence on how this changes interpretation",
      "claimStatus": "well-attested|inferred|disputed",
      "sourceBasis": "passage|biblical-intertext|historical-background"
    }
  ],
  "questionsToConsider": [
    "5-7 probing questions the preacher should wrestle with before preaching this text — interpretive tensions, likely congregational objections, application blind spots. Direct, specific to THIS passage, no generic filler."
  ],
  "genre": {
    "genre": "Narrative|Law|Poetry|Wisdom|Prophecy|Epistle|Gospel|Apocalyptic|Discourse",
    "subgenre": "specific descriptor e.g. 'Pauline Theological Argument'",
    "readingRules": ["4-6 concrete hermeneutical rules specific to this genre and passage"]
  }
}

For geoReferences: include ONLY a city, region, river, mountain, sea, or land explicitly named in the supplied passage text. Do not add a recipient city from the book title, a place named in another chapter, or an interpretive identification of a symbol. Do not treat a person, generic terrain, symbolic label, or disputed identification as a map location; "Gog and Magog" is not one mappable place. If the passage itself names no certain mappable location, return an empty array. Maximum 8 locations.

Identify culturally embedded references a first-century reader would grasp but a modern reader misses. Only include references actually present in the text. Maximum 6 cultural notes.`

const PHRASES_PROMPT = `You are a biblical scholar performing grammatical phrasing analysis for sermon preparation.

Return ONLY valid JSON — no markdown, no extra text:
{
  "phrases": [
    {
      "id": "p1",
      "text": "clause text (10 words max)",
      "type": "main|purpose|result|condition|concession|temporal|causal|relative|infinitival|participial|contrast",
      "level": 0,
      "parentId": null,
      "connective": null,
      "connectiveFunction": null,
      "role": "subject|predicate|object|modifier",
      "theologicalNote": "4 words max"
    }
  ]
}

STRICT: Maximum 16 phrases. You MUST select clauses from the BEGINNING, MIDDLE, and END of the passage in roughly equal thirds. For Psalm 119 specifically: pick ~5 clauses from Aleph–Gimel (vv.1–24), ~6 from Daleth–Mem (vv.25–96), ~5 from Nun–Taw (vv.97–176). Never cluster all selections near the end. Prioritize main declarative clauses, purpose/result clauses, and key contrasts that reveal the full arc.

HIERARCHY IS REQUIRED: You MUST assign parentId relationships. The first phrase (p1) has parentId: null. Subordinate clauses must reference their governing clause via parentId. Level 0 = root/main, level 1 = directly subordinate, level 2 = doubly subordinate. Never return all phrases at level 0 with parentId null — that produces a broken flat diagram. Example: a purpose clause ("that I might not sin against you") should have level:1 and parentId pointing to its governing main clause.`

const CONTEXT_PROMPT = `You are a biblical scholar providing sermon context analysis.

Do not turn inference into text. If the passage leaves the speaker, throne
occupant, chronology, symbolic referent, or judgment participants unnamed, keep
that limit visible. Use "Hades" when the text says Hades, not "hell." Describe a
book's recipients in their actual mixed conditions rather than reducing them all
to one pressure. Do not import a preacher's theological profile into the
passage's meaning.

Return ONLY valid JSON — no markdown, no extra text:
{
  "mainTheme": "one sentence capturing the central truth of the passage",
  "authorIntent": {
    "doing": "what the author is DOING to the reader in one sentence",
    "inOrderThat": "the response this text is designed to produce, phrased as: 'in order that ...'"
  },
  "outline": [
    { "point": "I.", "verses": "vv. 7-10", "label": "Main point (7 words max)", "sub": [{ "point": "A.", "label": "sub-point (5 words max)" }] }
  ],
  "canonicalContext": {
    "bookTheme": "7 words max",
    "passageRole": "12 words max",
    "biblicalThemes": ["theme1", "theme2", "theme3"],
    "canonicalConnections": "12 words max",
    "keyWords": ["word1", "word2", "word3", "word4"]
  }
}

STRICT: Max 4 outline points, max 2 sub-points each. Every top-level outline
point must carry the exact verse range it covers. The ranges must follow the
passage in order and cover every supplied verse once, with no gaps or overlap.
All strings concise.`

const CORE_PROMPT = `You are an expert biblical scholar specializing in grammatical phrasing analysis for sermon preparation.

Do not turn inference into text. If the passage leaves the speaker, throne
occupant, chronology, symbolic referent, or judgment participants unnamed, keep
that limit visible. Use "Hades" when the text says Hades, not "hell." Describe a
book's recipients in their actual mixed conditions rather than reducing them all
to one pressure. Do not import a preacher's theological profile into the
passage's meaning.

Return ONLY valid JSON. No markdown. No trailing commas. No extra text before or after the JSON object.

{
  "reference": "Book Chapter:Verse",
  "mainTheme": "one sentence capturing the central truth",
  "authorIntent": {
    "doing": "what the author is DOING to the reader in one sentence (convince, comfort, warn, exhort...)",
    "inOrderThat": "the response this text is designed to produce, phrased as: 'in order that ...'"
  },
  "phrases": [
    {
      "id": "p1",
      "text": "clause text (max 12 words)",
      "type": "main|purpose|result|condition|concession|temporal|causal|relative|infinitival|participial|contrast",
      "level": 0,
      "parentId": null,
      "connective": null,
      "connectiveFunction": null,
      "role": "subject|predicate|object|modifier",
      "theologicalNote": "5 words max"
    }
  ],
  "outline": [
    { "point": "I.", "verses": "vv. 1-3", "label": "Main point (8 words max)", "sub": [{ "point": "A.", "label": "sub-point (6 words max)" }] }
  ],
  "canonicalContext": {
    "bookTheme": "8 words max",
    "passageRole": "10 words max",
    "biblicalThemes": ["theme1", "theme2", "theme3"],
    "canonicalConnections": "12 words max",
    "keyWords": ["word1", "word2", "word3"]
  }
}

STRICT LIMITS: max 16 phrases, 5-word theologicalNotes, max 4 outline points
with 3 sub-points each. Every top-level outline point must carry the exact verse
range it covers. The ranges must follow the passage in order and cover every
supplied verse once, with no gaps or overlap.`

/**
 * How the passage gets split across calls.
 *
 * A long passage overflows a single response — the phrasing analysis alone can
 * fill the ceiling — so it runs as three calls with the output divided between
 * them. A short one fits in two. The threshold is measured in clauses rather
 * than characters because that is what actually drives output size.
 */
function measurePassage(text) {
  const verseCount = Math.max(
    (text.match(/^\d+\s/gm) || []).length,
    text.split(/\n+/).filter(l => l.trim()).length,
    Math.ceil(text.split(' ').length / 25),
  )
  return { verseCount, isLong: verseCount > 6 }
}

/**
 * Run the analysis fan-out.
 *
 * Injected, all of it:
 *   apiKey, createClient  — whose money this spends
 *   retry, parse          — defaulted to runtime.js so a caller can pass nothing
 *   onStage(name)         — progress; the desktop forwards it to the renderer
 *   onUsage(label, usage, model)
 *                         — token counts per call. NEW, and not cosmetic: the
 *                           server settles a study's reservation against what it
 *                           actually cost, and the analysis is roughly half of
 *                           that. Without this the meter under-bills every
 *                           study by the entire fan-out.
 *
 * Returns the analysis object. Caching and history are the caller's business,
 * because they mean different things on a desktop and on a server.
 */
async function analyzePassage({
  text,
  reference,
  apiKey,
  createClient,
  retry = withRetry,
  parse = parseModelJSON,
  onStage,
  onUsage,
}) {
  // Ceilings before anything else. The passage is interpolated raw into up to
  // three separate calls, so an oversized paste is multiplied by three. On the
  // desktop that spends the user's own money; on the server it spends Cole's and
  // the sender pays nothing. Refused here, before a token is committed.
  checkGenerationInput({ text, reference })

  if (!apiKey) throw new Error('analyzePassage: apiKey is required')
  if (typeof createClient !== 'function') {
    throw new Error('analyzePassage: createClient is required')
  }

  const stage = (name) => { try { onStage?.(name) } catch { /* never break a study */ } }
  // Accounting must never delay or break a study in progress.
  const bill = (label, response, model) => {
    if (typeof onUsage !== 'function') return
    try { onUsage(label, response?.usage, model) } catch { /* ditto */ }
  }

  const client = createClient(apiKey)
  const { isLong } = measurePassage(text)
  const userMsg = `${reference}\n\n"${text}"`

  let result

  if (isLong) {
    // ── LONG PASSAGE: 3 parallel calls — split output to avoid token overflow ──
    // Call 1: phrases only (Opus, 4000 tokens)
    // Call 2: mainTheme + outline + canonicalContext (Sonnet, 2500 tokens)
    // Call 3: cultural notes + genre (Sonnet, 2500 tokens)
    stage('calls-dispatched')
    const [phrasesSettled, contextSettled, enrichSettled] = await Promise.allSettled([
      retry(() => client.messages.create({
        model: CORE_MODEL,
        max_tokens: 4000,
        system: [{ type: 'text', text: PHRASES_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Identify the 8 most structurally important clauses in this passage:\n\n${userMsg}` }],
      })).then(r => { bill('analyze.phrases', r, CORE_MODEL); stage('structure'); return r }),
      retry(() => client.messages.create({
        model: SUPPORT_MODEL,
        max_tokens: 2500,
        system: [{ type: 'text', text: CONTEXT_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Provide sermon context analysis for:\n\n${userMsg}` }],
      })).then(r => { bill('analyze.context', r, SUPPORT_MODEL); stage('theme'); return r }),
      retry(() => client.messages.create({
        model: SUPPORT_MODEL,
        max_tokens: 2500,
        system: [{ type: 'text', text: ENRICH_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Identify cultural background and genre for:\n\n${userMsg}` }],
      })).then(r => { bill('analyze.enrich', r, SUPPORT_MODEL); stage('culture'); return r }),
    ])

    // The two structural calls are fatal; enrichment is not. A passage with no
    // cultural notes is still a usable analysis — one with no phrases is not.
    if (phrasesSettled.status === 'rejected') throw phrasesSettled.reason
    if (contextSettled.status === 'rejected') throw contextSettled.reason

    const phrases = parse(phrasesSettled.value)
    const context = parse(contextSettled.value)
    const enrich = enrichSettled.status === 'fulfilled'
      ? (() => { try { return parse(enrichSettled.value) } catch { return { culturalNotes: [], genre: null } } })()
      : { culturalNotes: [], genre: null }

    result = {
      reference,
      mainTheme: context.mainTheme ?? '',
      authorIntent: context.authorIntent ?? null,
      phrases: phrases.phrases ?? [],
      outline: context.outline ?? [],
      canonicalContext: context.canonicalContext ?? {},
      culturalNotes: enrich.culturalNotes ?? [],
      genre: enrich.genre ?? null,
      geoReferences: enrich.geoReferences ?? [],
      questionsToConsider: enrich.questionsToConsider ?? [],
    }
  } else {
    // ── SHORT PASSAGE: 2 parallel calls (core + enrichment) ───────────────────
    stage('calls-dispatched')
    const [coreSettled, enrichSettled] = await Promise.allSettled([
      retry(() => client.messages.create({
        model: CORE_MODEL,
        max_tokens: 8000,
        system: [{ type: 'text', text: CORE_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Perform a full phrasing analysis:\n\n${userMsg}` }],
      })).then(r => { bill('analyze.core', r, CORE_MODEL); stage('structure'); stage('theme'); return r }),
      retry(() => client.messages.create({
        model: SUPPORT_MODEL,
        max_tokens: 3000,
        system: [{ type: 'text', text: ENRICH_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Identify cultural background and genre for:\n\n${userMsg}` }],
      })).then(r => { bill('analyze.enrich', r, SUPPORT_MODEL); stage('culture'); return r }),
    ])

    if (coreSettled.status === 'rejected') throw coreSettled.reason

    const core = parse(coreSettled.value)
    const enrich = enrichSettled.status === 'fulfilled'
      ? (() => { try { return parse(enrichSettled.value) } catch { return { culturalNotes: [], genre: null } } })()
      : { culturalNotes: [], genre: null }

    result = {
      ...core,
      culturalNotes: enrich.culturalNotes ?? [],
      genre: enrich.genre ?? null,
      geoReferences: enrich.geoReferences ?? [],
      questionsToConsider: enrich.questionsToConsider ?? [],
    }
  }

  // The model never controls the canonical reference. The trusted input wins.
  result.reference = reference
  result.geoReferences = explicitGeoReferences(result.geoReferences, text)

  // Store raw passage text so the desk can render all-verses mode
  result.passageText = text
  result.passageReference = reference

  stage('complete')
  return result
}

/**
 * Strip everything that is not the READING from an analysis before it is used to
 * generate or to build a cache key.
 *
 * `historyId` is the offender. main.js merges it into the object it returns, the
 * renderer holds that as `analysis` state and sends it straight back on the next
 * call, and pipeline.js hashes the WHOLE object to build the document cache key.
 * A per-entry id inside it therefore makes every key unique — so the document
 * cache has never hit for anyone, on the desktop or the server, no matter how
 * many people study the same passage. It is the single largest margin lever in
 * the hosted model and it was silently disabled by an id that has nothing to do
 * with the reading.
 *
 * Anything else that is per-user, per-session or per-install belongs here too.
 */
const NON_CONTENT_KEYS = ['historyId', 'studyId', '__studyId', 'savedAt', 'annotations']

function forGeneration(analysis) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return analysis

  /**
   * KEYS ARE SORTED, and that is load-bearing, not tidiness.
   *
   * The document cache key is an md5 of JSON.stringify(analysis), and
   * JSON.stringify preserves INSERTION ORDER. Postgres jsonb does not: it
   * rewrites object keys into its own order on storage. So an analysis served
   * from the shared cache comes back with its keys in a different order than the
   * one the first reader sent, hashes to a different key, and misses — meaning
   * the second reader of every passage still paid full price, which is exactly
   * the failure this function was added to fix.
   *
   * Sorting makes the key depend on the CONTENT and nothing else.
   */
  const drop = new Set(NON_CONTENT_KEYS)

  /**
   * DEEP, not one level.
   *
   * jsonb reorders keys at EVERY depth, and an analysis is mostly nested —
   * canonicalContext, authorIntent, genre, and an array of phrase objects. A
   * top-level sort left all of those free to come back in a different order, so
   * the cache key still changed on a round trip and the shared cache still
   * missed for the second reader of every passage. Arrays keep their order:
   * that is content, not layout.
   */
  const canon = (value, isRoot) => {
    if (Array.isArray(value)) return value.map((v) => canon(v, false))
    if (!value || typeof value !== 'object') return value
    const out = {}
    for (const k of Object.keys(value).sort()) {
      if (isRoot && drop.has(k)) continue
      out[k] = canon(value[k], false)
    }
    return out
  }

  return canon(analysis, true)
}

module.exports = {
  analyzePassage,
  forGeneration,
  NON_CONTENT_KEYS,
  analysisCacheKey,
  explicitGeoReferences,
  measurePassage,
  CORE_MODEL,
  SUPPORT_MODEL,
}
