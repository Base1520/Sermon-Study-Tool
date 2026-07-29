/**
 * test-doctrine.js — both directions on the doctrinal fence backstop.
 *
 * The check in validate.js exists because coleLens.js is prose, and this
 * codebase already proved what a prose guardrail is worth. But a doctrinal
 * regex that fires on a RESTRAINT FENCE ("this does not mean Christ inherited
 * a fallen nature") or on a named position ("some readers take Babylon as
 * Jerusalem") would delete good readings — which is worse than the leak it
 * prevents. So every rule is tested in BOTH directions here, and the must-pass
 * list is longer than the must-throw list on purpose.
 *
 * No API key. Exits non-zero on failure.
 */

const assert = require('assert')
const {
  assertNoDoctrineLeak,
  assertInterpretiveNeutrality,
  validatePlainRead,
  PlainReadValidationError,
} = require('./validate')

let pass = 0
let fail = 0

function test(name, fn) {
  try {
    fn()
    pass += 1
    console.log(`PASS  ${name}`)
  } catch (err) {
    fail += 1
    console.log(`FAIL  ${name}\n      ${err.message}`)
  }
}

function throwsOn(text) {
  assert.throws(
    () => assertNoDoctrineLeak({ probe: text }),
    PlainReadValidationError,
    `should have thrown on: ${text}`
  )
}

function allowsIt(text) {
  assertNoDoctrineLeak({ probe: text })
}

/* ------------------------------------------------------------------ *
 * MUST THROW — the assertion shapes a reader would walk away believing
 * ------------------------------------------------------------------ */

test('Babylon identity is treated as disputed, not hard-coded', () => {
  ;[
    'Babylon is Jerusalem, the city that killed the prophets.',
    'Babylon stands for Jerusalem in the seven-hills imagery.',
    'Babylon is Rome, the imperial city.',
  ].forEach(allowsIt)
})

test('Revelation dating is treated as disputed, not hard-coded', () => {
  ;[
    'Revelation was written under Nero, which sets the whole book in the 60s.',
    'Revelation was composed before the fall of Jerusalem.',
    'Revelation was written late, around AD 95, under Domitian.',
  ].forEach(allowsIt)
})

test('Revelation 20 disputed conclusions must be qualified', () => {
  ;[
    'The thousand years is a symbolic picture of the present church age.',
    'The one seated on the throne is Christ.',
    'Gog and Magog are shorthand for every enemy of God.',
    "By John's time these names had become shorthand for every enemy of God.",
    'In Ezekiel 38-39, Gog and Magog stand for every enemy God ever faced.',
    'In Ezekiel 38-39 and Revelation 20, Gog and Magog are modern Russia.',
    'Gog and Magog come from an old prophecy, so those names stand for every enemy God ever faced.',
    'This vision is not a calendar or timeline.',
    'The book uses numbers as symbols all the way through.',
    'Everyone who has ever died stands before the throne and is judged.',
    'Everyone who ever died stands before it, and each person is judged.',
    'The last word is a courtroom every person will stand in.',
    'Deeds are the evidence examined in the courtroom. The book of life decides the outcome.',
    'The one behind all the deceiving is wiped out by fire and then thrown into the lake of fire.',
    'The original readers knew those figures pointed at the Roman Empire.',
    'These churches lived under pressure to say Caesar is Lord.',
    'The author is steadying frightened people by showing them how it ends.',
    'Hades literally means grave.',
    'Satan is destroyed in the lake of fire.',
  ].forEach((text) => {
    assert.throws(
      () => assertInterpretiveNeutrality({ probe: text }, { reference: 'Revelation 20:7-15' }),
      PlainReadValidationError
    )
  })

  ;[
    'An amillennial reading understands the thousand years as symbolic.',
    'Some readers identify the one on the throne as Christ; the verse does not name the figure.',
    '“Gog and Magog” are names John has borrowed from Ezekiel 38–39.',
    'Read Ezekiel 38-39, where Gog and Magog are the massed enemy nations, then read verse 8 here.',
    "'Gog and Magog' is inherited prophetic language for the massed enemies of God, not a code for a country you can point to.",
    'Gog and Magog may function as inherited imagery rather than a modern nation.',
    'Satan gathers the army, and the army is consumed by fire before Satan is thrown into the lake of fire.',
    'Some readers understand the deeds as evidence and the book of life as determining the outcome; the passage itself does not explain the relationship.',
    'The original readers may have associated the beast with Roman imperial power.',
    'John reports the throne vision after the defeat of Satan; whether the visions map a strict historical sequence is disputed.',
    "Satan's defeat is total, the judgment is universal and fair, death itself is destroyed.",
    'The seven churches form a mixed audience: some were afflicted, while others were compromised or complacent.',
    'The text calls those before the throne “the dead, great and small”; readers differ over whether this scene includes believers, unbelievers, or both.',
    'The passage does not settle whether human final punishment is eternal conscious torment or final destruction.',
  ].forEach((text) => {
    assert.doesNotThrow(
      () => assertInterpretiveNeutrality({ probe: text }, { reference: 'Revelation 20:7-15' })
    )
  })
})

test('Revelation restraint cannot smuggle one disputed reading in as a rule', () => {
  assert.throws(
    () => assertInterpretiveNeutrality(
      { restraint: ['Do not turn this vision into a timeline; apocalyptic is not a calendar.'] },
      { reference: 'Revelation 20:7-15' }
    ),
    PlainReadValidationError
  )
})

test('a labeled misread may name the disputed claim it corrects', () => {
  assert.doesNotThrow(
    () => assertInterpretiveNeutrality(
      {
        meaning: {
          misread: {
            claim:
              'The thousand years is a literal calendar block, and the whole point is to nail down the timeline of the end.',
            whyNot: 'The paragraph does not settle the disputed millennial system.',
          },
        },
      },
      { reference: 'Revelation 20:7-15' }
    )
  )
  assert.throws(
    () => assertInterpretiveNeutrality(
      {
        probe:
          'The thousand years is a literal calendar block, and the whole point is to nail down the timeline of the end.',
      },
      { reference: 'Revelation 20:7-15' }
    ),
    PlainReadValidationError
  )
})

test('full preterism throws', () => {
  ;[
    'The second coming already happened, in the events of that generation.',
    'Christ has already returned, and the church has been living after that ever since.',
    'The bodily resurrection is entirely past.',
    'All prophecy was fulfilled in AD 70.',
    'The final judgment was fulfilled in 70.',
  ].forEach(throwsOn)
})

test('Christ given a fallen nature throws', () => {
  ;[
    'Christ inherited a fallen human nature and sanctified it from the inside.',
    'Jesus assumed sinful flesh so that he could heal it.',
    'The Son took on our corrupt humanity.',
    'The fallen nature of Christ is the ground of the healing.',
  ].forEach(throwsOn)
})

test('a fence break anywhere in the document fails validation, not just in prose', () => {
  throwsOn('Christ inherited a fallen human nature.')
  assert.throws(
    () => assertNoDoctrineLeak({
      work: { setting: { body: 'The city named here is Rome.' } },
      restraint: ['Fine fence.', 'Christ has already returned.'],
    }),
    PlainReadValidationError
  )
})

/* ------------------------------------------------------------------ *
 * MUST PASS — the fence permits naming positions, and a restraint fence
 * has to be able to STATE the error in order to forbid it
 * ------------------------------------------------------------------ */

test('the fence\'s own positions pass', () => {
  ;[
    'Babylon is Rome, not Jerusalem.',
    'Revelation was written late, around AD 95, under Domitian.',
    'The great city that trades with the whole world is imperial Rome.',
    'AD 70 is backdrop to the New Testament world, not the fulfillment of this book.',
    'There is a real, future, personal, bodily return of Christ.',
    'Christ did not inherit a fallen human nature.',
    'He is exempt from inherited corruption by the Spirit\'s work at his conception.',
  ].forEach(allowsIt)
})

test('a named position is not an assertion', () => {
  ;[
    'Some readers take Babylon as Jerusalem; this reading takes it as Rome.',
    'Others read the great city as Jerusalem, and the case rests on the seven hills.',
    'One tradition holds that Revelation was written under Nero.',
    'The view that Christ assumed a fallen human nature is outside this reading.',
    'A minority hold that the second coming already happened.',
  ].forEach(allowsIt)
})

test('a restraint fence stating the error passes', () => {
  ;[
    'This does not mean Christ inherited a sinful nature.',
    'This passage is commonly misread as teaching that the second coming already happened.',
    'Nothing here says all prophecy was fulfilled in AD 70.',
    'It would be an error to say Babylon is Jerusalem here.',
    'The text never says Revelation was written under Nero.',
    'If Babylon is Jerusalem, the trade list in the next chapter makes no sense.',
  ].forEach(allowsIt)
})

test('ordinary Babylon, Rome and resurrection language passes', () => {
  ;[
    'Babylon destroyed Jerusalem and deported the leadership.',
    'The exiles in Babylon were asked to sing the songs of Jerusalem.',
    'Jerusalem fell in AD 70, and the letter assumes a world in which that is recent.',
    'The resurrection of the dead is what the whole argument is for.',
    'Christ took on real human flesh, born of a woman, under the law.',
    'The millennium in chapter 20 is read four different ways, and each system is held as a system.',
    'The manner of Christ\'s return is ranked tertiary here: Christians in one congregation hold both and stay in fellowship.',
  ].forEach(allowsIt)
})

/* ------------------------------------------------------------------ *
 * wired into validatePlainRead, not just exported
 * ------------------------------------------------------------------ */

/**
 * The situation block, written for THIS fixture's passage.
 *
 * situation became a required block after these fixtures were written. Splicing
 * in situation.js's SITUATION_EXAMPLE would have been quicker, but that example
 * is Romans, and Romans history above a Philippians passage is a fixture that
 * lies. Confidence is "reconstructed": the letter's provenance is argued.
 *
 * Deliberately dates nothing near Revelation and makes no claim the doctrinal
 * fence has a position on — this suite exists to test the fence, so its baseline
 * document must be fence-neutral or every test here would be measuring the
 * fixture instead of the code.
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
  return {
    reference: 'Philippians 4:10-13',
    situation: philippiansSituation(),
    meaning: { plain: 'He learned contentment.', assumes: 'That the letter is one argument.' },
    work: {
      genre: { body: 'A letter.', youCanCheck: 'Read v. 10.', theMove: 'Name the genre first.' },
      setting: { body: 'Written from custody.', youCanCheck: 'Read 1:13.', theMove: 'Ask who is writing.' },
      surroundings: { body: 'The thanks bracket it.', youCanCheck: 'Read v. 10 and v. 18.', theMove: 'Read the edges.' },
      words: { body: 'The verb is one of learning.', youCanCheck: 'Read v. 11.', theMove: 'Find the verb.' },
      story: { body: 'It sits inside the letter.', youCanCheck: 'Read ch. 3.', theMove: 'Place the passage.' },
      doing: { body: 'He is closing a thank-you.', youCanCheck: 'Read v. 18.', theMove: 'Ask what it does.' },
      christPathway: null,
    },
    distance: 'A first-century letter to a congregation that sent money.',
    application: {
      faces: ['character'],
      dominantFace: 'character',
      toThemFirst: 'They had just sent a gift.',
      thenToYou: 'You are not the sender.',
      step: { kind: 'practice', cue: 'When the bank balance drops', action: 'I name one thing I already have' },
    },
    restraint: ['This is not a promise of strength for any goal.', 'It is not a claim about wealth.'],
    unknowns: [],
    handoff: 'Talk to a pastor, or a believer you trust.',
    outline: {
      shape: 'Linear: thanks, then the claim behind the thanks.',
      units: [
        { ref: 'vv. 10-11', heading: 'the thanks is stated and immediately qualified', logic: null },
        { ref: 'vv. 12-13', heading: 'the qualification is grounded in what he learned', logic: 'ground' },
      ],
    },
    ...overrides,
  }
}

test('validatePlainRead accepts a clean document', () => {
  const doc = validatePlainRead(rawDoc(), { reference: 'Philippians 4:10-13' })
  assert.equal(doc.outline.units.length, 2)
})

test('validatePlainRead throws when a step body breaks the fence', () => {
  const raw = rawDoc()
  raw.work.setting.body = 'The writer says Christ inherited a fallen human nature.'
  assert.throws(
    () => validatePlainRead(raw, { reference: 'Philippians 4:10-13' }),
    (err) => err instanceof PlainReadValidationError && /doctrinal fence/.test(err.message)
  )
})

test('a fence break is retryable, not fatal', () => {
  const raw = rawDoc()
  raw.restraint = ['Christ has already returned.', 'A second fence.']
  try {
    validatePlainRead(raw, { reference: 'Philippians 4:10-13' })
    assert.fail('should have thrown')
  } catch (err) {
    assert.ok(err instanceof PlainReadValidationError)
    assert.equal(err.retryable, true)
  }
})

console.log(`\n${pass}/${pass + fail} passed`)
if (fail) process.exit(1)
