#!/usr/bin/env node
/**
 * test-plainread.js — repeatable checks for the PLAIN READ guardrails.
 *
 * NO API KEY REQUIRED. Every model call is a fake `createClient` returning a
 * scripted response, which is the point: the parts of this feature that must
 * never regress — the shape guards in validate.js and the claim-extraction and
 * verdict-application logic in verify.js — are all deterministic, and none of
 * them should need the network to prove they work.
 *
 * Run:  node electron/plainread/test-plainread.js
 * Exits non-zero on any failure.
 */

const assert = require('assert')

const {
  validatePlainRead,
  assertNoPulpitLeak,
  assertNoFenceDisclosure,
  PlainReadValidationError,
} = require('./validate')

const {
  plainRead,
  cacheKeyFor,
  loadMechanics,
  mechanicForStep,
  buildPayload,
  _resetMechanicsCache,
} = require('./pipeline')

const {
  verifyPlainRead,
  extractClaims,
  matchNote,
  splitSentences,
  STRIPPED_BODY,
} = require('./verify')

// The one resolver that turns a claim's step name — an ordinary work step OR a
// "situation.<field>" — into the text it was pulled from.
const { readStepBody } = require('./situation')

/* ------------------------------------------------------------------ *
 * harness
 * ------------------------------------------------------------------ */

const results = []

function test(name, fn) {
  try {
    const out = fn()
    if (out && typeof out.then === 'function') {
      return out.then(
        () => { results.push({ name, ok: true }) },
        (err) => { results.push({ name, ok: false, err }) }
      )
    }
    results.push({ name, ok: true })
  } catch (err) {
    results.push({ name, ok: false, err })
  }
  return Promise.resolve()
}

function throwsValidation(fn, matcher) {
  assert.throws(fn, (err) => {
    assert.ok(
      err instanceof PlainReadValidationError,
      `expected PlainReadValidationError, got ${err && err.name}: ${err && err.message}`
    )
    if (matcher) assert.match(err.message, matcher)
    return true
  })
}

/* ------------------------------------------------------------------ *
 * fixtures
 * ------------------------------------------------------------------ */

const SETTING_LEDGER_CLAIM =
  'Roman households in the first century kept a written ledger of favors owed between patron and client.'

const WORDS_CONNECTOR_CLAIM =
  'Verse 13 opens with a connector that reaches back to that list.'

/**
 * A document shaped exactly like the model is asked to return one. The words
 * step carries the real-world fabrication this whole feature exists because of:
 * Philippians 4:13 is asyndetic — there is no connector there.
 */
/**
 * The situation block, written for THIS fixture's passage.
 *
 * situation became a required block after these fixtures were written, so every
 * one of them failed with "situation block missing". The obvious repair was to
 * splice in situation.js's SITUATION_EXAMPLE, but that example is Romans — its
 * expulsion-from-Rome pressure and its food-and-days soWhat describe a different
 * letter entirely. A Philippians document carrying Romans history is a fixture
 * that lies, and the first test to assert on situation CONTENT rather than its
 * presence would be built on it. So this is Philippians, at the confidence the
 * evidence actually supports: the provenance of the letter is argued, so
 * "reconstructed", not "documented".
 */
function philippiansSituation() {
  return {
    when:
      'around AD 62, late in a stretch of custody, though a minority place the letter earlier and from a different prison',
    where: 'written from custody in a Roman city, sent to a Roman colony in northern Greece',
    pressure:
      'The congregation had put money together and sent it a long way to a man in chains. They were not a wealthy group, and the gift cost them something real. Months had passed with no word back, long enough for the senders to wonder whether it had ever arrived. The man they had paid to keep alive was a prisoner whose case could still end either way.',
    soWhat:
      'The line about contentment is not a maxim floating free of a situation. It sits inside a thank-you note from a prisoner to the people whose money was keeping him fed.',
    confidence: 'reconstructed',
    vaultSourced: false,
  }
}

function rawDoc(overrides = {}) {
  const base = {
    reference: 'Philippians 4:10-13',
    sensitive: false,
    situation: philippiansSituation(),
    meaning: {
      plain:
        'The writer thanks a group that sent him money and says he has learned to be steady whether he has plenty or nothing.',
      misread: {
        exists: true,
        claim: 'It promises I can accomplish anything I set out to do.',
        whyNot: 'The surrounding lines are about having little and having much, not about achievement.',
        biggerNotSmaller:
          'Steadiness that does not depend on circumstances is a larger claim than winning, not a smaller one.',
      },
      assumes: 'That the writer is describing his own settled state, not issuing a rule for everyone.',
      level: null,
    },
    work: {
      genre: {
        body:
          'This is an occasional letter, not an essay and not a manual. Letters answer situations, so the shape of the argument follows what produced it.',
        youCanCheck: 'Read the opening and closing lines back to back and notice both name specific people.',
        theMove: 'Ask what kind of writing you are holding before you ask what it means.',
      },
      setting: {
        body:
          'This is a letter, and the man behind it is in custody. The letter went to a Roman colony in Macedonia, and its readers had sent him money more than once. ' +
          SETTING_LEDGER_CLAIM,
        youCanCheck: 'Find the two places in the chapter that name money and read them together.',
        theMove: 'Ask what the first readers already knew that you do not.',
      },
      surroundings: {
        body:
          'The two verses before this one name the gift and the people who sent it. The line after turns back to thanking them, which bounds how far the middle can be pushed.',
        youCanCheck: 'Read the four lines on either side without stopping at the famous one.',
        theMove: 'Never read a line without reading its neighbors first.',
      },
      words: {
        body:
          'The sentence runs on a verb of learning, not a verb of feeling. ' +
          WORDS_CONNECTOR_CLAIM +
          ' The word translated as content was a common term for self-sufficiency.',
        youCanCheck: 'Underline every verb in the paragraph and see which ones repeat.',
        theMove: 'Check the sentence structure before you decide what a phrase means.',
      },
      story: {
        body:
          'The letter sits inside a longer story about a people learning to trust provision they did not control. The wilderness generation in Exodus is the pattern being drawn on here.',
        youCanCheck: 'Read the manna account and notice what happens when people store extra.',
        theMove: 'Ask where a passage sits in the whole story before you apply it to your week.',
      },
      doing: {
        body:
          'The writer is closing a thank-you note in the last paragraph without making himself dependent on the gift. He wants the readers to know their gift arrived and did not put him under obligation.',
        youCanCheck: 'Read the last six lines aloud and notice how carefully the gift is described.',
        theMove: 'Ask what the writer is doing with the words, not only what the words say.',
      },
      christPathway: null,
    },
    outline: {
      shape: 'Linear: the gift is named, then qualified, then grounded.',
      units: [
        {
          ref: '4:10',
          heading: 'The writer names the renewed gift and his gladness at it',
          logic: null,
          children: null,
        },
        {
          ref: '4:11-12',
          heading: 'The writer qualifies that gladness so it does not rest on the gift',
          logic: 'restatement — he immediately guards the sentence he has just written',
          children: null,
        },
        {
          ref: '4:13',
          heading: 'The ground of that steadiness is stated',
          logic: 'ground — this line supplies the basis for the contentment just described',
          children: null,
        },
      ],
    },
    distance: 'He is writing from custody to people who had just gone without in order to send him money.',
    application: {
      faces: ['duty', 'character'],
      dominantFace: 'duty',
      toThemFirst: 'They were being told their gift had landed and had not put the writer in their debt.',
      thenToYou: 'You are being asked whether your steadiness currently depends on your circumstances.',
      step: {
        kind: 'plan',
        cue: 'When I catch myself saying I cannot handle this month',
        action: 'I write down what I actually have, before I decide what I lack',
        question: 'Where does my steadiness actually come from this week?',
      },
    },
    restraint: [
      'This is not a guarantee of outcomes.',
      'This is not a statement about physical strength or performance.',
    ],
    differ: null,
    unknowns: ['Whether the gift arrived once or in several parts is not stated.'],
    handoff: 'If money is the pressure under this, say that out loud to a person you trust before you decide anything.',
  }
  return { ...base, ...overrides }
}

/** A validated document — what verify.js is handed in production. */
function validDoc(overrides) {
  return validatePlainRead(rawDoc(overrides), { reference: 'Philippians 4:10-13' })
}

const PAYLOAD = {
  reference: 'Philippians 4:10-13',
  passageText:
    '10 I rejoiced in the Lord greatly that now at length you have revived your concern for me. ' +
    '11 Not that I am speaking of being in need, for I have learned in whatever situation I am to be content. ' +
    '12 I know how to be brought low, and I know how to abound. ' +
    '13 I can do all things through him who strengthens me.',
}

/** A createClient that hands back scripted responses, one per call. */
function scriptedClient(payloads) {
  const calls = []
  const create = async (req) => {
    calls.push(req)
    const next = payloads[calls.length - 1]
    if (next === undefined) throw new Error(`unscripted model call #${calls.length}`)
    if (next instanceof Error) throw next
    return { content: [{ type: 'text', text: JSON.stringify(next) }] }
  }
  return { createClient: () => ({ messages: { create } }), calls }
}

function verdictsFor(claims, overrides = {}) {
  return {
    verdicts: claims.map((c) => {
      const o = overrides[c.id]
      if (!o) return { id: c.id, verdict: 'CONFIRMED', reason: 'stated in the passage', correctedStep: null }
      return { id: c.id, correctedStep: null, ...o }
    }),
  }
}

/* ------------------------------------------------------------------ *
 * 1. validate.js — the shape guards
 * ------------------------------------------------------------------ */

async function main() {
  await test('pulpit leak throws instead of degrading', () => {
    throwsValidation(
      () => validatePlainRead(rawDoc({ distance: 'Close this out with an illustration before the third point.' })),
      /pulpit language/i
    )
    // And the standalone assert catches it anywhere in the document.
    throwsValidation(
      () => assertNoPulpitLeak({ work: { doing: { body: 'When you preach this, slow down.' } } }),
      /pulpit language/i
    )
    // A clean document does not throw.
    assertNoPulpitLeak(validDoc())
  })

  await test('restraint below two fences is rejected', () => {
    throwsValidation(() => validatePlainRead(rawDoc({ restraint: ['Only one fence here.'] })), /restraint/i)
    throwsValidation(() => validatePlainRead(rawDoc({ restraint: [] })), /restraint/i)
    // Two is the floor, and more than four is trimmed rather than rejected.
    const trimmed = validatePlainRead(rawDoc({ restraint: ['a', 'b', 'c', 'd', 'e', 'f'] }))
    assert.strictEqual(trimmed.restraint.length, 4)
  })

  await test('sensitive passage is forced in code, not left to the model', () => {
    // The model said sensitive:false and handed back a duty/plan step.
    // The outline must match the overridden reference: the range check in
    // validateOutline correctly rejects a Philippians outline under a Job ref.
    const doc = validatePlainRead(
      rawDoc({
        reference: 'Job 3:1-10',
        sensitive: false,
        outline: {
          shape: 'Linear lament: the speaker opens his mouth, then curses the day, then curses the night.',
          units: [
            { ref: '3:1-2', heading: 'The narrator frames the speech before it begins', logic: null, children: null },
            {
              ref: '3:3-5',
              heading: 'The speaker curses the day of his birth',
              logic: 'escalation — the framing gives way to the speech itself',
              children: null,
            },
            {
              ref: '3:6-10',
              heading: 'The curse widens from the day to the night that conceived him',
              logic: 'escalation — the same curse reaches further back in time',
              children: null,
            },
          ],
        },
      }),
      { reference: 'Job 3:1-10' }
    )
    assert.strictEqual(doc.sensitive, true, 'Job must be forced sensitive by reference')
    assert.strictEqual(doc.application.step.kind, 'question', 'a sensitive passage never issues an instruction')
    assert.strictEqual(doc.application.step.cue, null)
    assert.strictEqual(doc.application.step.action, null)
    assert.ok(doc.application.step.question && doc.application.step.question.length > 0)

    // The same document on a non-sensitive reference keeps its plan step.
    const ordinary = validDoc()
    assert.strictEqual(ordinary.sensitive, false)
    assert.strictEqual(ordinary.application.step.kind, 'plan')
    assert.strictEqual(ordinary.application.step.question, null)
  })

  await test('forcing sensitivity completes the plan-to-question conversion', () => {
    const candidate = rawDoc()
    candidate.sensitive = true
    candidate.application.step.question = null

    const doc = validatePlainRead(candidate)

    assert.strictEqual(doc.application.step.kind, 'question')
    assert.strictEqual(doc.application.step.cue, null)
    assert.strictEqual(doc.application.step.action, null)
    assert.match(doc.application.step.question, /trusted person beside you/i)
  })

  await test('dominant face governs the step kind', () => {
    const doc = validatePlainRead(
      rawDoc({
        application: {
          ...rawDoc().application,
          faces: ['discernment'],
          dominantFace: 'discernment',
          step: { kind: 'plan', cue: 'x', action: 'y', question: 'What am I actually deciding here?' },
        },
      })
    )
    assert.strictEqual(doc.application.step.kind, 'question')
  })

  /* ---------------------------------------------------------------- *
   * 2. cache key
   * ---------------------------------------------------------------- */

  await test('cache key includes the analysis, not just the passage', () => {
    const a = { reference: 'Philippians 4:10-13', mainTheme: 'contentment under pressure' }
    const b = { reference: 'Philippians 4:10-13', mainTheme: 'generosity of the givers' }

    assert.strictEqual(cacheKeyFor(a), cacheKeyFor({ ...a }), 'identical analysis must produce identical keys')
    assert.notStrictEqual(
      cacheKeyFor(a),
      cacheKeyFor(b),
      'a materially different analysis on the same reference must NOT reuse the cached document'
    )
    assert.ok(cacheKeyFor(a).includes('Philippians 4:10-13'))
    assert.ok(cacheKeyFor(a).startsWith('plain-read-v2-'))
  })

  /* ---------------------------------------------------------------- *
   * 3. the Rikki gate
   * ---------------------------------------------------------------- */

  await test('psych layer is gated CLOSED — absent, not unreviewed', () => {
    _resetMechanicsCache()
    const mechanics = loadMechanics()
    assert.strictEqual(mechanics.reviewed, false, 'clinical_review.by must still be null')
    assert.strictEqual(mechanics.reviewedBy, null)
    assert.deepStrictEqual(mechanics.mechanics, [], 'an unreviewed file must expose no mechanics at all')
    assert.strictEqual(mechanicForStep('plan'), null)
    assert.strictEqual(mechanicForStep('practice'), null)
    assert.strictEqual(mechanicForStep('question'), null)
    _resetMechanicsCache()
  })

  /* ---------------------------------------------------------------- *
   * 4. claim extraction
   * ---------------------------------------------------------------- */

  await test('sentence splitting does not shatter verse references', () => {
    const sentences = splitSentences(
      'Read Phil. 4:13 next. It is not a promise about outcomes. Compare v. 12 and v. 13, e.g. the pair about plenty.'
    )
    assert.strictEqual(sentences.length, 3, `expected 3 sentences, got ${sentences.length}: ${JSON.stringify(sentences)}`)
    assert.strictEqual(sentences[0], 'Read Phil. 4:13 next.')
    assert.ok(sentences[2].includes('v. 12 and v. 13'))
    assert.ok(sentences[2].includes('e.g.'))
  })

  await test('claims are pulled from every step and stay verbatim', () => {
    const doc = validDoc()
    const claims = extractClaims(doc)
    assert.ok(claims.length >= 6, `expected several claims, got ${claims.length}`)

    const texts = claims.map((c) => c.text)
    assert.ok(texts.includes(WORDS_CONNECTOR_CLAIM), 'the grammar fabrication must be extracted')
    assert.ok(texts.includes(SETTING_LEDGER_CLAIM), 'the invented cultural detail must be extracted')

    // Every claim must be findable verbatim in its own step body, or removal
    // later has nothing to cut.
    //
    // Resolved through readStepBody rather than doc.work[step].body: claims now
    // come from the situation block as well as the six work steps, and a
    // situation claim's step is "situation.when", which is not a key under
    // doc.work at all. Reaching into doc.work directly threw on the first one.
    // readStepBody is the same resolver extractClaims and applyVerdicts use, so
    // this assertion now covers exactly what the verifier can actually cut.
    for (const c of claims) {
      assert.ok(
        readStepBody(doc, c.step).includes(c.text),
        `claim ${c.id} is not a verbatim substring of the body of ${c.step}`
      )
    }

    // The situation block is reachable — it is pure historical assertion and
    // the least checkable thing the reader is handed.
    assert.ok(
      claims.some((c) => c.step.startsWith('situation.')),
      'the situation block must reach the verifier'
    )

    // The ungrounded steps are checked first.
    assert.strictEqual(claims[0].step, 'setting')
    assert.ok(claims.some((c) => c.step === 'words'))
    assert.ok(claims.some((c) => c.step === 'story'))
    assert.ok(claims.some((c) => c.step === 'doing'))
  })

  await test('vault matcher traces a paraphrase and preserves dispute status', () => {
    const match = matchNote(
      'In apocalyptic Revelation, the numbers signify fullness rather than a datable calendar span.',
      [
        '[DISPUTED] Revelation\'s numbers are symbolic (7, 12, 1000 = fullness), so the thousand years most naturally reads as symbolic fullness rather than a literal calendar age.',
      ]
    )
    assert.ok(match, 'a close paraphrase should trace to its source note')
    assert.strictEqual(match.status, 'DISPUTED')
    assert.ok(match.shared >= 2)
  })

  await test('PLAIN payload does not inherit private-profile conclusions', () => {
    const payload = buildPayload({
      reference: 'Revelation 20:7-15',
      passageText: '7 And when the thousand years are ended, Satan will be released.',
      mainTheme: 'A profile-conditioned conclusion',
      authorIntent: { doing: 'A private reading', inOrderThat: 'a private result' },
      outline: [{ point: 'I.', label: 'A sermon point' }],
      canonicalContext: {
        bookTheme: 'A private synthesis',
        passageRole: 'A private role',
        biblicalThemes: ['private'],
        canonicalConnections: 'private',
        keyWords: ['private'],
      },
      genre: { genre: 'Apocalyptic', subgenre: 'vision', readingRules: [] },
      phrases: [{
        id: 'p1',
        text: 'Satan will be released',
        type: 'main',
        level: 0,
        parentId: null,
        connective: null,
        connectiveFunction: null,
        theologicalNote: 'private theology',
      }],
    })

    assert.strictEqual(payload.mainTheme, undefined)
    assert.strictEqual(payload.authorIntent, undefined)
    assert.strictEqual(payload.outline, undefined)
    assert.strictEqual(payload.canonicalContext, undefined)
    assert.strictEqual(payload.phrases[0].theologicalNote, undefined)
    assert.strictEqual(payload.phrases[0].text, 'Satan will be released')
    assert.ok(
      payload.groundingNotes.notes.every((note) => /^\[(?:BACKGROUND|INTERPRETIVE|DISPUTED)\]/.test(note)),
      'every supplied note carries a source-status label'
    )
  })

  /* ---------------------------------------------------------------- *
   * 5. verdict application
   * ---------------------------------------------------------------- */

  await test('REFUTED claim is stripped from the step body', async () => {
    const doc = validDoc()
    const claims = extractClaims(doc)
    const target = claims.find((c) => c.text === WORDS_CONNECTOR_CLAIM)
    assert.ok(target, 'fixture must contain the connector claim')

    const { createClient, calls } = scriptedClient([
      verdictsFor(claims, {
        [target.id]: {
          verdict: 'REFUTED',
          reason: 'the verse has no conjunction at all — it is asyndetic',
        },
      }),
    ])

    const out = await verifyPlainRead({ doc, payload: PAYLOAD, apiKey: 'test-key', createClient })

    assert.strictEqual(calls.length, 1, 'exactly one verify call')
    assert.strictEqual(out.verification.status, 'ok')
    assert.strictEqual(out.verification.refuted, 1)
    assert.ok(
      !out.work.words.body.includes(WORDS_CONNECTOR_CLAIM),
      'the refuted sentence must be gone from the body'
    )
    assert.ok(
      out.work.words.body.includes('The sentence runs on a verb of learning'),
      'the surrounding true sentences must survive'
    )
    assert.ok(out.work.words.body.includes('self-sufficiency'))
    assert.ok(!out.work.words.body.includes('  '), 'no doubled spacing left behind')

    const note = out.verification.notes.find((n) => n.verdict === 'REFUTED')
    assert.strictEqual(note.action, 'removed')
    assert.strictEqual(note.step, 'words')
    assert.match(note.reason, /asyndetic/)

    // The original document is not mutated.
    assert.ok(doc.work.words.body.includes(WORDS_CONNECTOR_CLAIM))
  })

  await test('UNVERIFIABLE claim keeps its text and lands in unknowns', async () => {
    const doc = validDoc()
    const claims = extractClaims(doc)
    const target = claims.find((c) => c.text === SETTING_LEDGER_CLAIM)
    assert.ok(target, 'fixture must contain the ledger claim')
    const unknownsBefore = doc.unknowns.length

    const { createClient } = scriptedClient([
      verdictsFor(claims, {
        [target.id]: {
          verdict: 'UNVERIFIABLE',
          reason: 'plausible but I cannot confirm a written ledger from the passage',
        },
      }),
    ])

    const out = await verifyPlainRead({ doc, payload: PAYLOAD, apiKey: 'test-key', createClient })

    assert.strictEqual(out.verification.unverifiable, 1)
    assert.strictEqual(out.verification.refuted, 0)
    assert.ok(
      out.work.setting.body.includes(SETTING_LEDGER_CLAIM),
      'an unverifiable claim is kept, not cut'
    )
    assert.strictEqual(out.unknowns.length, unknownsBefore + 1, 'exactly one unknown appended')

    const added = out.unknowns[out.unknowns.length - 1]
    assert.match(added, /could not check this one/i)
    assert.ok(added.includes('ledger of favors'), 'the reader must see WHICH claim was not confirmed')
    // The checker's `reason` is written for the log, not for a reader. It reads
    // like apparatus and it discloses how the tool works. It stays in
    // verification.notes and must NOT reach the page.
    assert.ok(
      !added.includes('cannot confirm a written ledger'),
      "the checker's internal reason must not reach the reader"
    )
    assert.ok(
      out.verification.notes.some((n) => (n.reason ?? '').includes('cannot confirm a written ledger')),
      'the reason is still recorded in the log'
    )

    // Original untouched.
    assert.strictEqual(doc.unknowns.length, unknownsBefore)
  })

  await test('a missing verdict marks the check failed and does NOT flood unknowns', async () => {
    const doc = validDoc()
    const claims = extractClaims(doc)
    // Return a verdict for exactly one claim; the rest come back missing.
    const { createClient } = scriptedClient([
      { verdicts: [{ id: claims[0].id, verdict: 'CONFIRMED', reason: 'stated outright' }] },
    ])

    const out = await verifyPlainRead({ doc, payload: PAYLOAD, apiKey: 'test-key', createClient })
    assert.strictEqual(out.verification.status, 'failed')
    assert.strictEqual(out.verification.checked, 1)
    assert.strictEqual(out.verification.confirmed, 1)
    assert.strictEqual(out.verification.unverifiable, claims.length - 1)
    assert.strictEqual(out.verification.missing, claims.length - 1)
    assert.deepStrictEqual(
      out.unknowns,
      doc.unknowns,
      'our own plumbing failure is not a finding about the text'
    )
  })

  await test('an uncuttable claim falls back to the corrected step body', async () => {
    // Single-sentence body: removing the claim would empty the step.
    const doc = validDoc({
      work: {
        ...rawDoc().work,
        words: {
          body: WORDS_CONNECTOR_CLAIM,
          youCanCheck: 'Read the verse and look for a conjunction at the front.',
          theMove: 'Check the sentence structure before you decide what a phrase means.',
        },
      },
    })
    const claims = extractClaims(doc)
    const target = claims.find((c) => c.text === WORDS_CONNECTOR_CLAIM)
    const correction =
      'The verse has no connecting word at the front. It stands on its own, which is part of why it gets quoted alone.'

    const { createClient } = scriptedClient([
      verdictsFor(claims, {
        [target.id]: { verdict: 'REFUTED', reason: 'the verse is asyndetic', correctedStep: correction },
      }),
    ])

    const out = await verifyPlainRead({ doc, payload: PAYLOAD, apiKey: 'test-key', createClient })
    assert.strictEqual(out.work.words.body, correction)
    const note = out.verification.notes.find((n) => n.verdict === 'REFUTED' && n.claim)
    assert.strictEqual(note.action, 'replaced')
  })

  await test('the verifier cannot introduce pulpit language', async () => {
    const doc = validDoc({
      work: {
        ...rawDoc().work,
        words: {
          body: WORDS_CONNECTOR_CLAIM,
          youCanCheck: 'Read the verse and look for a conjunction at the front.',
          theMove: 'Check the sentence structure before you decide what a phrase means.',
        },
      },
    })
    const claims = extractClaims(doc)
    const target = claims.find((c) => c.text === WORDS_CONNECTOR_CLAIM)

    const { createClient } = scriptedClient([
      verdictsFor(claims, {
        [target.id]: {
          verdict: 'REFUTED',
          reason: 'move this into a sermon outline instead',
          correctedStep: 'When you preach this verse, open with an illustration about weightlifting.',
        },
      }),
    ])

    const out = await verifyPlainRead({ doc, payload: PAYLOAD, apiKey: 'test-key', createClient })

    assert.strictEqual(out.work.words.body, STRIPPED_BODY, 'a leaking rewrite is discarded, not shipped')
    assert.ok(
      out.verification.notes.some((n) => n.action === 'rejected-rewrite'),
      'the discarded rewrite must be recorded'
    )
    // The whole document — including the verifier reason text — stays clean.
    assertNoPulpitLeak(out)
    assert.ok(!JSON.stringify(out).match(/sermon|preach|illustration/i))
  })

  await test('a reason that DESCRIBES pulpit language does not kill a good reading', async () => {
    // The regression this pins: the checker is allowed to report "this reads
    // like a sermon aside" — that is a legitimate finding. But its wording lands
    // in verification.notes, notes are part of the document, and
    // assertNoPulpitLeak reads the whole document. Before the fix this threw,
    // and the throw escaped plainRead's retry, so a CORRECT reading was lost
    // because the fact-checker described the failure accurately.
    const doc = validDoc()
    const claims = extractClaims(doc)
    const target = claims.find((c) => c.text === SETTING_LEDGER_CLAIM)

    const { createClient } = scriptedClient([
      verdictsFor(claims, {
        [target.id]: {
          verdict: 'UNVERIFIABLE',
          reason: 'this belongs in a sermon outline, not in a reading of the text',
        },
      }),
    ])

    let out
    await assert.doesNotReject(async () => {
      out = await verifyPlainRead({ doc, payload: PAYLOAD, apiKey: 'test-key', createClient })
    })

    assert.strictEqual(out.verification.status, 'ok')
    assert.strictEqual(out.verification.unverifiable, 1)
    // The finding survives; only the wording is withheld.
    const note = out.verification.notes.find((n) => n.verdict === 'UNVERIFIABLE' && n.claim === target.text)
    assert.match(note.reason, /withheld/, 'the reason is replaced, not passed through')
    assert.ok(!/sermon/i.test(JSON.stringify(out)), 'no pulpit language anywhere in the document')

    // The reader-facing unknowns line keeps the claim and drops the wording —
    // an internal note about our own screening would tell them nothing.
    const added = out.unknowns[out.unknowns.length - 1]
    assert.ok(added.includes('ledger of favors'), 'the reader still sees WHICH claim failed')
    assert.ok(!added.includes('withheld'), 'the placeholder never reaches the reader')
  })

  await test('a document that discloses the doctrinal fence is rejected', () => {
    // PRIVACY. coleLens.js is injected into the system prompt and is written
    // about a real, identifiable man — "the convictions of the pastor this tool
    // speaks for", "a named blind spot". A reader is a stranger. A document
    // that attributes its reading to that man, rather than to the text, hands
    // the stranger the author's private framing. Retryable, so the cost of
    // catching it is one more sample.
    const doc = validDoc()
    doc.distance = 'This is where the pastor this tool speaks for lands on it.'
    assert.throws(
      () => assertNoFenceDisclosure(doc),
      (err) => err instanceof PlainReadValidationError && /disclosed its own prompt framing/.test(err.message)
    )

    // Ordinary exegetical prose must survive — a screen loose enough to fire on
    // "Paul's instructions" or "restraint fences" would burn samples on good
    // documents, which is the failure mode that matters here.
    const clean = validDoc()
    clean.distance = 'Paul gives instructions here; the restraint fences around them are tight.'
    assert.doesNotThrow(() => assertNoFenceDisclosure(clean))
  })

  await test('a verifier reason that names the fence does not kill a good reading', async () => {
    // Same shape as the pulpit regression above, one boundary over: the
    // verifier's reason strings land in verification.notes and in the reader's
    // unknowns. A checker that helpfully wrote "this contradicts the doctrinal
    // fence" must lose its wording, not the document.
    const doc = validDoc()
    const claims = extractClaims(doc)
    const target = claims.find((c) => c.text === SETTING_LEDGER_CLAIM)

    const { createClient } = scriptedClient([
      verdictsFor(claims, {
        [target.id]: {
          verdict: 'UNVERIFIABLE',
          reason: 'this sits outside the doctrinal fence the pastor holds',
        },
      }),
    ])

    let out
    await assert.doesNotReject(async () => {
      out = await verifyPlainRead({ doc, payload: PAYLOAD, apiKey: 'test-key', createClient })
    })

    assert.strictEqual(out.verification.status, 'ok')
    assert.ok(!/doctrinal fence/i.test(JSON.stringify(out)), 'the fence is never named in the document')
    const added = out.unknowns[out.unknowns.length - 1]
    assert.ok(added.includes('ledger of favors'), 'the reader still sees WHICH claim failed')
    assert.ok(!added.includes('withheld'), 'the placeholder never reaches the reader')
  })

  await test('cutting a quote-ending sentence leaves no orphaned quote mark', async () => {
    const quoted = 'The term rendered "content" carried the sense of self-sufficiency in the first century.'
    const doc = validDoc({
      work: {
        ...rawDoc().work,
        words: {
          body: `${quoted} The sentence runs on a verb of learning, not a verb of feeling.`,
          youCanCheck: 'Underline every verb in the paragraph and see which ones repeat.',
          theMove: 'Check the sentence structure before you decide what a phrase means.',
        },
      },
    })
    const claims = extractClaims(doc)
    const target = claims.find((c) => c.text === quoted)
    assert.ok(target, `the quoted sentence must extract whole, got ${JSON.stringify(claims.map((c) => c.text))}`)

    const { createClient } = scriptedClient([
      verdictsFor(claims, {
        [target.id]: { verdict: 'REFUTED', reason: 'the passage does not define the term that way' },
      }),
    ])

    const out = await verifyPlainRead({ doc, payload: PAYLOAD, apiKey: 'test-key', createClient })
    assert.strictEqual(
      out.work.words.body,
      'The sentence runs on a verb of learning, not a verb of feeling.',
      'the closing quote must go with the sentence it ends'
    )
    assert.ok(!out.work.words.body.startsWith('"'), 'no orphaned quote mark left on the page')
  })

  await test('a failed verify call degrades instead of destroying the reading', async () => {
    const doc = validDoc()
    const { createClient } = scriptedClient([new Error('529 overloaded')])

    const out = await verifyPlainRead({ doc, payload: PAYLOAD, apiKey: 'test-key', createClient })
    assert.strictEqual(out.verification.status, 'failed')
    assert.strictEqual(out.work.words.body, doc.work.words.body, 'the document survives intact')
    assert.deepStrictEqual(out.unknowns, doc.unknowns)
    assert.ok(out.verification.notes[0].summary.includes('not verified'))

    // A malformed response degrades the same way.
    const junk = scriptedClient([{ nope: true }])
    const out2 = await verifyPlainRead({
      doc,
      payload: PAYLOAD,
      apiKey: 'test-key',
      createClient: junk.createClient,
    })
    assert.strictEqual(out2.verification.status, 'failed')
    assert.strictEqual(out2.work.words.body, doc.work.words.body)
  })

  /* ---------------------------------------------------------------- *
   * 6. pipeline integration
   * ---------------------------------------------------------------- */

  const ANALYSIS = {
    reference: 'Philippians 4:10-13',
    passageText: PAYLOAD.passageText,
    mainTheme: 'learned contentment',
    genre: 'letter',
  }

  await test('plainRead runs the verifier and caches the VERIFIED document', async () => {
    const claims = extractClaims(validDoc())
    const target = claims.find((c) => c.text === WORDS_CONNECTOR_CLAIM)

    const { createClient, calls } = scriptedClient([
      rawDoc(),
      verdictsFor(claims, {
        [target.id]: { verdict: 'REFUTED', reason: 'the verse is asyndetic' },
      }),
    ])

    const store = new Map()
    const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }

    const doc = await plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient,
      cache,
    })

    assert.strictEqual(calls.length, 2, 'one generation call, one verify call')
    assert.strictEqual(calls[1].model, 'claude-opus-4-8')
    assert.strictEqual(doc.verification.status, 'ok')
    assert.strictEqual(doc.verification.refuted, 1)
    assert.ok(!doc.work.words.body.includes(WORDS_CONNECTOR_CLAIM))
    assert.strictEqual(doc.mechanic, null, 'psych layer stays closed')
    assert.strictEqual(doc.fromCache, false)

    const cached = store.get(cacheKeyFor(ANALYSIS))
    assert.ok(cached, 'the document was cached')
    assert.strictEqual(cached.verification.refuted, 1, 'the CACHED copy is the verified one')
    assert.ok(!cached.work.words.body.includes(WORDS_CONNECTOR_CLAIM))
  })

  await test('verify:false skips the second call for headless prompt tuning', async () => {
    const { createClient, calls } = scriptedClient([rawDoc()])

    const doc = await plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient,
      verify: false,
    })

    assert.strictEqual(calls.length, 1, 'no verify call when the pass is turned off')
    assert.strictEqual(doc.verification.status, 'skipped')
    assert.strictEqual(doc.verification.checked, 0)
    assert.ok(
      doc.work.words.body.includes(WORDS_CONNECTOR_CLAIM),
      'nothing is checked, so nothing is stripped — this mode is not for readers'
    )
  })

  await test('a validation failure still gets exactly one retry, then throws', async () => {
    const bad = rawDoc({ restraint: ['only one'] })
    const { createClient, calls } = scriptedClient([bad, bad])

    await assert.rejects(
      () => plainRead({ analysis: ANALYSIS, apiKey: 'test-key', createClient }),
      (err) => err instanceof PlainReadValidationError
    )
    assert.strictEqual(calls.length, 2, 'one sample, one retry, no loop')
    assert.match(calls[1].messages[0].content, /previous attempt was rejected/)
    assert.match(calls[1].messages[0].content, /PREVIOUS REJECTED OBJECT/)
    assert.match(calls[1].messages[0].content, /"restraint": \[/)
  })

  await test('the last retry repairs only a known mixed-audience flattening', async () => {
    const bad = rawDoc({
      reference: 'Revelation 20:7-15',
      situation: {
        ...philippiansSituation(),
        soWhat: 'It is an answer to frightened people.',
      },
      outline: {
        shape: 'Two movements: the last rebellion ends, then the dead stand before the throne.',
        units: [
          {
            ref: '20:7-10',
            heading: 'Satan gathers the nations and is finally judged',
            logic: null,
            children: null,
          },
          {
            ref: '20:11-15',
            heading: 'The dead are judged and Death and Hades are removed',
            logic: 'sequence — the throne scene follows the end of the rebellion',
            children: null,
          },
        ],
      },
    })
    const analysis = {
      reference: 'Revelation 20:7-15',
      passageText: '7 And when the thousand years are ended, Satan will be released.',
      genre: 'apocalyptic',
    }
    const { createClient, calls } = scriptedClient([bad, bad])

    const doc = await plainRead({
      analysis,
      apiKey: 'test-key',
      createClient,
      verify: false,
    })

    assert.strictEqual(calls.length, 2, 'the repair does not add a third model call')
    assert.match(doc.situation.soWhat, /seven churches in different conditions/i)
    assert.doesNotMatch(doc.situation.soWhat, /answer to frightened people/i)
  })

  await test('the last retry repairs a structural outline heading that only drifts into second person', async () => {
    const bad = rawDoc()
    bad.outline.units[0].heading =
      'v. 10 — the core claim: the rescue is grace, received by trust, and it did not come from you'
    const { createClient, calls } = scriptedClient([bad, bad])

    const doc = await plainRead({
      analysis: ANALYSIS,
      apiKey: 'test-key',
      createClient,
      verify: false,
    })

    assert.strictEqual(calls.length, 2, 'the repair does not add a third model call')
    assert.match(doc.outline.units[0].heading, /was not self-generated/i)
    assert.doesNotMatch(doc.outline.units[0].heading, /\byou\b/i)
  })

  await test('the last retry does not launder a non-structural second-person slogan', async () => {
    const bad = rawDoc()
    bad.outline.units[0].heading = 'You can do all things through Christ'
    const { createClient } = scriptedClient([bad, bad])

    await assert.rejects(
      () => plainRead({ analysis: ANALYSIS, apiKey: 'test-key', createClient, verify: false }),
      (err) => err instanceof PlainReadValidationError && /exhorts the reader/i.test(err.message)
    )
  })

  /* ---------------------------------------------------------------- *
   * summary
   * ---------------------------------------------------------------- */

  const failed = results.filter((r) => !r.ok)
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`)
    if (!r.ok) console.log(`      ${r.err && r.err.message}`)
  }
  console.log('')
  console.log(`${results.length - failed.length}/${results.length} passed`)

  if (failed.length) {
    console.log('')
    for (const r of failed) {
      console.log(`--- ${r.name} ---`)
      console.log(r.err && r.err.stack ? r.err.stack : String(r.err))
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('test harness crashed:', err)
  process.exit(1)
})
