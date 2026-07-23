import type { PhrasingAnalysis } from '../types/phrasing'

// Canned demo analysis — lets a first-time user experience the full desk
// (phrasing tree, map, cultural notes, outline) before entering an API key.
export const DEMO_ANALYSIS: PhrasingAnalysis & { passageText?: string; passageReference?: string; geoReferences?: any[] } = {
  reference: 'Romans 8:1-4',
  mainTheme: 'In Christ Jesus there is no condemnation, because God did in the Son what the law could not do — and the Spirit now fulfills the law\'s righteous requirement in us.',
  passageReference: 'Romans 8:1-4',
  passageText: `1 There is therefore now no condemnation for those who are in Christ Jesus. 2 For the law of the Spirit of life has set you free in Christ Jesus from the law of sin and death. 3 For God has done what the law, weakened by the flesh, could not do. By sending his own Son in the likeness of sinful flesh and for sin, he condemned sin in the flesh, 4 in order that the righteous requirement of the law might be fulfilled in us, who walk not according to the flesh but according to the Spirit.`,
  phrases: [
    { id: 'p1', text: 'There is therefore now no condemnation', type: 'main', level: 0, parentId: null, connective: 'therefore', connectiveFunction: 'inference from ch. 1-7', role: 'predicate', theologicalNote: 'The verdict — already' },
    { id: 'p2', text: 'for those who are in Christ Jesus', type: 'relative', level: 1, parentId: 'p1', connective: null, connectiveFunction: null, role: 'modifier', theologicalNote: 'Union with Christ' },
    { id: 'p3', text: 'For the law of the Spirit of life has set you free', type: 'causal', level: 1, parentId: 'p1', connective: 'for', connectiveFunction: 'ground of v.1', role: 'predicate', theologicalNote: 'Liberation accomplished' },
    { id: 'p4', text: 'from the law of sin and death', type: 'relative', level: 2, parentId: 'p3', connective: null, connectiveFunction: null, role: 'modifier', theologicalNote: 'The old regime' },
    { id: 'p5', text: 'For God has done', type: 'causal', level: 1, parentId: 'p3', connective: 'for', connectiveFunction: 'deeper ground', role: 'predicate', theologicalNote: 'Divine initiative' },
    { id: 'p6', text: 'what the law, weakened by the flesh, could not do', type: 'relative', level: 2, parentId: 'p5', connective: null, connectiveFunction: null, role: 'object', theologicalNote: 'Law\'s impotence' },
    { id: 'p7', text: 'By sending his own Son', type: 'participial', level: 2, parentId: 'p5', connective: null, connectiveFunction: 'means', role: 'modifier', theologicalNote: 'Incarnation as mission' },
    { id: 'p8', text: 'in the likeness of sinful flesh and for sin', type: 'relative', level: 3, parentId: 'p7', connective: null, connectiveFunction: null, role: 'modifier', theologicalNote: 'True humanity, no sin' },
    { id: 'p9', text: 'he condemned sin in the flesh', type: 'main', level: 2, parentId: 'p5', connective: null, connectiveFunction: null, role: 'predicate', theologicalNote: 'Condemnation relocated' },
    { id: 'p10', text: 'that the righteous requirement of the law might be fulfilled in us', type: 'purpose', level: 3, parentId: 'p9', connective: 'in order that', connectiveFunction: 'purpose of the cross', role: 'predicate', theologicalNote: 'Purpose: fulfilled, not voided' },
    { id: 'p11', text: 'who walk not according to the flesh but according to the Spirit', type: 'relative', level: 4, parentId: 'p10', connective: null, connectiveFunction: null, role: 'modifier', theologicalNote: 'The Spirit-walk' },
  ],
  outline: [
    { point: 'I.', label: 'The Verdict: No Condemnation', sub: [
      { point: 'A.', label: 'Now — not someday' },
      { point: 'B.', label: 'In Christ Jesus' },
    ]},
    { point: 'II.', label: 'The Liberation: Set Free', sub: [
      { point: 'A.', label: 'Two laws, two regimes' },
    ]},
    { point: 'III.', label: 'The Cost: God Sent His Son', sub: [
      { point: 'A.', label: 'What the law could not' },
      { point: 'B.', label: 'Sin condemned in the flesh' },
    ]},
    { point: 'IV.', label: 'The Goal: The Spirit-Walk', sub: [
      { point: 'A.', label: 'Law fulfilled in us' },
    ]},
  ],
  canonicalContext: {
    bookTheme: 'The gospel as God\'s righteousness for all',
    passageRole: 'The hinge from wretchedness (ch. 7) to life in the Spirit',
    biblicalThemes: ['Justification', 'Union with Christ', 'Life in the Spirit'],
    canonicalConnections: 'Answers Rom 7:24; anticipates 8:31-39; echoes Isa 53',
    keyWords: ['condemnation', 'Spirit', 'flesh', 'law'],
  },
  culturalNotes: [
    {
      id: 'cn1', phraseId: 'p1',
      term: 'katakrima (condemnation)',
      category: 'roman-legal',
      explanation: 'A Roman legal term — not the feeling of guilt but the formal sentence handed down after a verdict, including its penal consequences. Paul\'s Roman readers would hear a courtroom door closing: the sentence itself has been abolished, not merely postponed.',
      significance: 'Assurance rests on a legal verdict already rendered, not on the believer\'s performance.',
    },
    {
      id: 'cn2', phraseId: 'p7',
      term: 'sending his own Son',
      category: 'greco-roman',
      explanation: 'In the Greco-Roman world, the sent son carried the full authority of the father — to receive him was to receive the sender. Paul stacks the emphatic "his OWN Son" (ton heautou huion) against every lesser envoy: prophets, angels, Torah.',
      significance: 'The mission\'s cost measures the Father\'s commitment (cf. Rom 8:32).',
    },
    {
      id: 'cn3', phraseId: 'p11',
      term: 'walk (peripateo)',
      category: 'jewish',
      explanation: 'The standard Jewish idiom for one\'s whole conduct of life — halakhah, from halak, "to walk." Paul takes the very word used for Torah-observance and re-founds it on the Spirit rather than the written code.',
      significance: 'Ethics isn\'t abandoned in grace; its power source is replaced.',
    },
  ] as any,
  genre: {
    genre: 'Epistle',
    subgenre: 'Pauline Theological Argument',
    readingRules: [
      'Track the logical connectives (therefore, for, so that) — the argument lives in them',
      'Read v.1\'s "therefore" as gathering all of chapters 5-7, not just 7:25',
      'Let "in Christ" language control the meaning of freedom here',
      'Distinguish what God does FOR us (vv.1-3) from what the Spirit does IN us (v.4)',
      'Resist moralizing v.4 into a new law — it describes Spirit-produced life',
    ],
  },
  geoReferences: [
    { place: 'Rome', verses: ['Romans 1:7'], significance: 'The letter\'s recipients — house churches in the imperial capital, mixed Jewish and Gentile, learning to live one gospel.' },
  ],
}
