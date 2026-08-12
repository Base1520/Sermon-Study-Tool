// The serializer that makes a reading pasteable.
//
// Beta feedback identified that users could not get the output into their own
// documents. These assert the two things that would make a "Copy" button a lie:
// inventing text the model never produced, and dropping text it did.
//
//   node src/lib/test-documentText.mjs

import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { pathToFileURL } from 'node:url'

const src = readFileSync(new URL('./documentText.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const { documentToText, analysisToText } = mod

let pass = 0, fail = 0
const ok = (n, c, d = '') => c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log(`  FAIL ${n}${d ? ' — ' + d : ''}`))

const DOC = {
  reference: 'Romans 8:1',
  situation: { when: 'Written to Rome.', where: 'A mixed church.', pressure: 'Under suspicion.', soWhat: 'It lands hard.' },
  meaning: { plain: 'The verdict is gone.', misread: 'Not a promise of ease.', assumes: 'A courtroom.' },
  work: { genre: 'Epistle.', words: 'katakrima is a sentence.', doing: 'Reassuring.' },
  distance: 'Two thousand years.',
  outline: { shape: 'Two moves', units: [{ label: 'The verdict', verses: 'v1a', says: 'No condemnation.' }] },
  application: { toThemFirst: 'To Rome first.', thenToYou: 'Then to you.', step: 'Name the accusation.' },
  restraint: ['Not a trouble-free life.', 'The verdict, not the feeling.'],
  unknowns: ['How much of "in Christ" is meant here.'],
  handoff: 'Goes on into verse 2.',
  readingLevel: 'plain',
}

console.log('\nA READING BECOMES PASTEABLE TEXT')
{
  const t = documentToText(DOC)
  ok('the reference heads it', t.startsWith('Romans 8:1'))
  ok('the plain meaning is present', t.includes('The verdict is gone.'))
  ok('the misreading is kept', t.includes('Not a promise of ease.'))
  ok('restraints survive as a list', t.includes('• Not a trouble-free life.'))
  ok('open questions survive', t.includes('• How much of "in Christ" is meant here.'))
  ok('the outline is numbered', t.includes('1. The verdict — v1a'))
  ok('application is there', t.includes('Name the accusation.'))
  ok('it is traceable back to the tool', t.includes('The Operator · Romans 8:1'))

  ok('NO markdown asterisks — this goes into Word', !t.includes('**'))
  ok('no runs of blank lines', !/\n{3,}/.test(t))
  ok('it ends with a single newline', t.endsWith('\n') && !t.endsWith('\n\n'))
}

console.log('\nMISSING SECTIONS ARE OMITTED, NEVER INVENTED')
{
  const sparse = documentToText({ reference: 'John 3:16', meaning: { plain: 'God gave.' } })
  ok('what exists is kept', sparse.includes('God gave.'))
  ok('an absent section prints no heading', !sparse.includes('RESTRAINTS'))
  ok('and no empty outline', !sparse.includes('OUTLINE'))
  ok('no undefined leaks into the text', !/undefined|null|\[object/.test(sparse))

  ok('an empty document is empty, not a skeleton', documentToText({}).trim() === '')
  ok('null is safe', documentToText(null) === '')
  ok('a non-object is safe', documentToText('nope') === '')
}

console.log('\nTHE ANALYSIS COPIES TOO')
{
  const t = analysisToText({
    reference: 'Romans 8:1',
    mainTheme: 'No condemnation.',
    authorIntent: { doing: 'Reassuring.', inOrderThat: 'in order that they rest.' },
    outline: [{ point: 'I.', verses: 'v1', label: 'The verdict', sub: [{ point: 'A.', label: 'Gone' }] }],
    culturalNotes: [{ term: 'katakrima', explanation: 'A sentence passed.', claimStatus: 'disputed' }],
    questionsToConsider: ['What accuses you?'],
    canonicalContext: { bookTheme: 'Righteousness', biblicalThemes: ['law', 'grace'] },
  })
  ok('the theme is present', t.includes('No condemnation.'))
  ok('the outline nests', t.includes('I. v1 The verdict') && t.includes('A. Gone'))
  ok('canonical themes join cleanly', t.includes('Themes: law, grace'))
  ok('a question survives', t.includes('• What accuses you?'))

  // The one that matters most for a manuscript.
  ok('a DISPUTED claim carries its status into the paste', t.includes('katakrima [disputed]'))
  ok('empty analysis is safe', analysisToText(null) === '' && analysisToText({}).trim() === '')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
