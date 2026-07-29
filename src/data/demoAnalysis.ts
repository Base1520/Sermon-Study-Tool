import type { PhrasingAnalysis, PlainReadDoc } from '../types/phrasing'

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

export const DEMO_PLAIN_READ: PlainReadDoc = {
  reference: 'Romans 8:1-4',
  expandedReference: null,
  expandReason: null,
  sensitive: false,
  situation: {
    when: 'the first century',
    where: 'written to believers in Rome',
    pressure:
      'The paragraph addresses people who need to understand what God has done about condemnation, sin, and the weakness of the flesh. The passage itself puts the answer in God’s action through the Son and the Spirit.',
    soWhat:
      'That keeps the paragraph from becoming either a slogan about positive thinking or a new demand to earn the verdict it announces.',
    confidence: 'reconstructed',
    vaultSourced: false,
  },
  meaning: {
    plain:
      'Those who are in Christ Jesus are not under condemnation, because God has acted through his Son and now gives life through the Spirit.',
    misread: {
      exists: true,
      claim: '“No condemnation” means nothing a Christian does matters.',
      whyNot:
        'Verse 4 immediately describes a life shaped by the Spirit. The paragraph removes condemnation; it does not erase transformed living.',
      biggerNotSmaller:
        'The verdict and the Spirit-shaped life belong together because both come from what God has done.',
    },
    assumes:
      'This reading takes “therefore” seriously and reads the four verses as one connected argument rather than four detached sayings.',
    level: null,
  },
  work: {
    genre: {
      body: 'This is a tightly connected paragraph inside a letter. Its repeated “for” and “in order that” clauses explain how each claim supports the one before it.',
      youCanCheck: 'Circle “therefore,” both uses of “for,” and “in order that.”',
      theMove: 'In a letter, follow the connecting words before isolating a sentence.',
    },
    setting: {
      body: 'The named audience is made up of people “in Christ Jesus.” The paragraph addresses their standing before God and the kind of life the Spirit produces.',
      youCanCheck: 'Find who verse 1 names and how verse 4 describes them.',
      theMove: 'Name the people addressed before deciding what a promise means for everyone.',
    },
    surroundings: {
      body: 'The opening “therefore” points backward, while verse 4 carries the sentence forward into walking according to the Spirit. Verse 1 is the verdict; verses 2-4 explain its ground and purpose.',
      youCanCheck: 'Read verse 1, then ask what every clause in verses 2-4 contributes to it.',
      theMove: 'Read the sentence on both sides of a favorite line.',
    },
    words: {
      body: 'The paragraph uses “condemnation” as a verdict and then says God condemned sin in the flesh. The repeated word ties the believer’s freedom to God’s action against sin.',
      youCanCheck: 'Compare “no condemnation” in verse 1 with “condemned sin” in verse 3.',
      theMove: 'Track repeated words before reaching for a dictionary.',
    },
    story: {
      body: 'The movement is from inability to divine action: the law could not do what God did by sending his Son, and the Spirit now marks the resulting life.',
      youCanCheck: 'List the subject of each main verb in verses 2-4.',
      theMove: 'Ask who acts, what they do, and what changes as a result.',
    },
    doing: {
      body: 'The writer is assuring the reader and explaining the basis of that assurance. He does not leave the promise unsupported; he grounds it in God’s action.',
      youCanCheck: 'Notice how many explanatory clauses follow the declaration in verse 1.',
      theMove: 'Ask what the author is doing to the reader, not only what facts he states.',
    },
    christPathway: null,
  },
  distance:
    'Modern readers often hear “condemnation” as an inner feeling. This paragraph treats it as a verdict tied to God’s action and then connects it to life in the Spirit.',
  application: {
    faces: ['character', 'discernment'],
    dominantFace: 'discernment',
    toThemFirst:
      'The first readers were being taught to locate their standing in what God had done rather than in the weakness the paragraph openly names.',
    thenToYou:
      'The paragraph trains a reader to distinguish conviction that leads toward Spirit-shaped life from condemnation that Christ has answered.',
    step: {
      kind: 'question',
      cue: null,
      action: null,
      question:
        'When guilt speaks this week, does it move you toward honest repentance and the Spirit’s way of life, or tell you that God’s verdict depends on your ability to repair yourself?',
    },
  },
  restraint: [
    'This paragraph does not say choices no longer matter; verse 4 describes a changed walk.',
    'It does not reduce salvation to a feeling of relief; its center is what God has done through the Son and Spirit.',
  ],
  differ: null,
  unknowns: ['This is a built-in demonstration, not a newly generated or source-checked study.'],
  handoff:
    'If guilt has become heavier than a hard season, bring it to a pastor, a believer you trust, or a counselor instead of carrying it alone.',
  outline: {
    shape: 'A verdict, followed by its ground, means, and purpose.',
    units: [
      {
        ref: 'vv. 1-2',
        heading: 'vv. 1-2 — the verdict and the Spirit’s liberating ground',
        logic: null,
      },
      {
        ref: 'vv. 3-4',
        heading: 'vv. 3-4 — God acts through the Son for Spirit-shaped life',
        logic: 'Deeper ground and purpose: these verses explain how the verdict became possible and what it produces.',
      },
    ],
  },
  mechanic: null,
  verification: {
    status: 'skipped',
    model: null,
    promptVersion: 0,
    checked: 0,
    confirmed: 0,
    unverifiable: 0,
    refuted: 0,
    notes: [],
  },
  vault: {
    sourced: false,
    noteCount: 0,
    packVersion: 0,
    builtOn: null,
  },
  promptVersion: 0,
  readingLevel: 'standard',
  fromCache: true,
}
