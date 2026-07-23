// Exegesis Academy — skill tree, lessons, and quiz data

export interface Lesson {
  id: string
  title: string
  content: string       // the teaching
  exercise: string      // what to do in the tool right now
  toolHint?: string     // which feature to look at (shown as a callout)
}

export interface QuizQuestion {
  q: string
  options: string[]
  answer: number        // index of correct answer
  explanation: string
}

export interface Skill {
  slug: string
  number: number
  title: string
  subtitle: string
  icon: string
  color: string
  lessons: Lesson[]
  quiz: QuizQuestion[]  // 10 questions; need 8/10 (80%) to pass
}

// ── Skills ─────────────────────────────────────────────────────────────────────

export const SKILLS: Skill[] = [
  {
    slug: 'observation',
    number: 1,
    title: 'Observation',
    subtitle: 'Learn to See',
    icon: '◉',
    color: '#7090c0',
    lessons: [
      {
        id: 'obs-1',
        title: 'Why Observation Comes First',
        content: `Most people skip straight to application — "what does this mean for me?" But before you interpret, you have to see. Observation is the discipline of looking before leaping. Howard Hendricks put it bluntly: "The most important skill you can develop as a Bible student is the ability to observe." A lawyer who misses evidence loses cases. An interpreter who misses what's in the text imposes their own ideas onto it.`,
        exercise: 'Open any passage in the tool. Before reading the analysis, read the raw text slowly and just list 5 things you notice — people, actions, repeated words, emotions, location.',
        toolHint: 'Phrasing Diagram — read each clause in order before looking at the analysis',
      },
      {
        id: 'obs-2',
        title: 'The 5 Questions',
        content: `Every text can be interrogated with five questions: Who is speaking or acting? What is happening? Where does this take place? When — what's the timing or sequence? How and Why — what causes or explains the action? These aren't clever tricks. They're the basic categories of human meaning. Writers encode answers to these in every sentence, and readers miss them because they move too fast.`,
        exercise: 'Pull up Romans 1:1–7 in the tool. Answer all five questions from the text alone — no commentaries, no background knowledge yet.',
        toolHint: 'Use the Phrasing Diagram to see the clause structure while you answer the 5W+H',
      },
      {
        id: 'obs-3',
        title: 'Structural Markers',
        content: `Words like "therefore," "but," "because," "so that," and "for" are load-bearing walls. They tell you the logical relationship between ideas. "Therefore" signals a conclusion drawn from what came before. "But" signals a contrast. "Because" gives a reason. "So that" gives a purpose or result. Missing these words means missing the author's argument.`,
        exercise: 'In the Phrasing Diagram, find every conjunction in your passage (therefore, but, because, for, so that, however). What is each one connecting? What logic does it signal?',
        toolHint: 'Phrasing Diagram — conjunctions are often the hinge points of the whole argument',
      },
      {
        id: 'obs-4',
        title: 'Repetition and Emphasis',
        content: `Authors repeat what they want you to notice. In John 15, "abide" appears 11 times in 17 verses. In Philippians 4, "rejoice" is repeated when Paul is in prison — the repetition is the point. Whenever you see a word, image, or idea repeated in a short space, underline it. That's usually the central teaching, not a side point.`,
        exercise: 'Search your passage for repeated words or ideas. Look at the Phrasing Diagram — does any word or concept appear in multiple clauses? What does that repetition tell you?',
        toolHint: 'Phrasing Diagram — scan the full clause tree for words that appear more than once',
      },
      {
        id: 'obs-5',
        title: 'What You See vs. What You Import',
        content: `There's a critical difference between observation and interpretation. "Paul uses the word 'grace' four times" is an observation. "This passage teaches justification by faith" is an interpretation. Mixing these up is how eisegesis starts — you call your interpretation an observation and stop looking. The discipline is to stay in observation mode longer than feels comfortable. Write down what the text says before you write what it means.`,
        exercise: 'Write 5 observations and 5 interpretations from the same passage. Keep them in separate columns. Notice how the observations are specific and concrete; the interpretations are broader and require reasoning.',
        toolHint: 'Use the Eisegesis Flagger (always running) — see if any of your interpretations have a red flag',
      },
    ],
    quiz: [
      {
        q: 'What is the primary goal of the observation step in Bible study?',
        options: [
          'To find the main application for today\'s life',
          'To see what is actually in the text before interpreting it',
          'To compare different Bible translations',
          'To identify what the author\'s biography tells us',
        ],
        answer: 1,
        explanation: 'Observation comes before interpretation. You must see what the text says before you decide what it means.',
      },
      {
        q: 'When you encounter the word "therefore" in a passage, what does it signal?',
        options: [
          'A new topic is beginning that is unrelated to what came before',
          'A conclusion drawn from the argument that preceded it',
          'A command directed at the reader',
          'A historical reference to a past event',
        ],
        answer: 1,
        explanation: '"Therefore" is a logical connector — it draws a conclusion. Romans 12:1 ("Therefore I urge you...") only makes sense after you\'ve read Romans 1–11.',
      },
      {
        q: 'If an author repeats a word or phrase multiple times in a short passage, what should you conclude?',
        options: [
          'It is probably a translation error or scribal duplication',
          'The passage is poetic and shouldn\'t be taken literally',
          'The author is deliberately emphasizing it as the central idea',
          'It is a common filler phrase with no special meaning',
        ],
        answer: 2,
        explanation: 'Biblical authors were intentional. Repetition is emphasis. John\'s use of "abide" 11 times in John 15:1–17 is not accidental.',
      },
      {
        q: 'Which of these is an observation rather than an interpretation?',
        options: [
          '"This passage teaches justification by faith alone"',
          '"Paul uses the word \'grace\' four times in these five verses"',
          '"This applies to Christians struggling with legalism today"',
          '"Jesus is showing that love is more important than law"',
        ],
        answer: 1,
        explanation: 'Counting word occurrences is pure observation — it\'s what\'s actually in the text. The other three require interpretive reasoning.',
      },
      {
        q: 'The word "but" in a passage typically signals:',
        options: [
          'A supporting detail for the preceding idea',
          'A geographic transition between locations',
          'A contrast with what came immediately before',
          'The beginning of a new chapter or section',
        ],
        answer: 2,
        explanation: '"But" introduces contrast. "For the wages of sin is death, but the gift of God is eternal life" (Rom 6:23) — the "but" is the hinge of the whole verse.',
      },
      {
        q: 'The phrase "so that" in a text indicates:',
        options: [
          'A definition of a key term',
          'A purpose or intended result',
          'A historical background note',
          'An imperative command',
        ],
        answer: 1,
        explanation: '"So that" signals purpose or result. John 20:31: "These are written so that you may believe..." — the phrase tells you why the Gospel of John exists.',
      },
      {
        q: 'What is the danger of skipping observation and going straight to application?',
        options: [
          'Your sermon will be too short',
          'You miss word study opportunities in the original language',
          'You read your own ideas into the text instead of seeing what\'s there',
          'You\'ll preach the wrong theological tradition',
        ],
        answer: 2,
        explanation: 'Eisegesis — reading meaning INTO the text — almost always starts when someone skips observation. You fill in what you didn\'t see with what you already believed.',
      },
      {
        q: 'The 5 observation questions are: Who, What, Where, When, and ___',
        options: [
          'Worship',
          'Which translation',
          'How / Why',
          'What doctrine',
        ],
        answer: 2,
        explanation: 'Who, What, Where, When, How/Why — these categories cover the basic dimensions of any human communication and ensure you\'re looking at the whole text.',
      },
      {
        q: 'When should you move from observation to interpretation?',
        options: [
          'After the first read-through of the passage',
          'Only after using a commentary',
          'After you\'ve thoroughly catalogued what is actually in the text',
          'Observation and interpretation should happen simultaneously',
        ],
        answer: 2,
        explanation: 'Stay in observation mode longer than feels comfortable. The more thoroughly you observe, the more accurate your interpretation will be.',
      },
      {
        q: 'The Phrasing Diagram in this tool primarily helps you with:',
        options: [
          'Comparing the passage in original Greek or Hebrew',
          'Seeing visually how each clause relates to the main idea',
          'Finding sermon illustrations from church history',
          'Generating a list of cross-references automatically',
        ],
        answer: 1,
        explanation: 'The Phrasing Diagram displays the clause structure visually — it\'s an observation tool that shows you the logic and emphasis of the text.',
      },
    ],
  },

  {
    slug: 'genre',
    number: 2,
    title: 'Genre Recognition',
    subtitle: 'Know Your Map',
    icon: '◈',
    color: '#80a870',
    lessons: [
      {
        id: 'gen-1',
        title: 'Genre Changes the Rules',
        content: `You read a stop sign differently than a poem. You read a recipe differently than a novel. Genre is the contract between author and reader — it sets the rules for how meaning is communicated. The Bible is a library of different genres: narrative, law, poetry, wisdom, prophecy, gospel, epistle, and apocalyptic. Reading a Psalm like a legal contract, or reading Levitical law like a personal letter, produces catastrophic misinterpretation. Your first question after "what does the text say?" is "what kind of text is this?"`,
        exercise: 'Without using the tool, identify the genre of these: Psalm 23, Romans 8, Genesis 22, Proverbs 3:5–6, Revelation 13. Then open each in the tool and compare your answer to the Genre tag.',
        toolHint: 'Canonical Context tile — the GENRE tag identifies the genre and subgenre of your passage',
      },
      {
        id: 'gen-2',
        title: 'Reading Biblical Narrative',
        content: `Narrative is the dominant genre of Scripture — roughly 40% of the Bible is story. Narrative communicates through scene, character, plot, tension, and resolution — not through direct propositional statements. The narrator controls what you see, hear, and feel. Notice what the narrator emphasizes. Notice what is left out. The conflict in the story is usually theological: will God's purposes be realized? The resolution reveals God's character. Don't moralize the characters — the human characters are not the heroes.`,
        exercise: 'Open Genesis 22 (Abraham and Isaac). Identify: the scene, the main character, the tension, the resolution, and what the narrator emphasizes. What does the story reveal about God?',
        toolHint: 'Phrasing Diagram — narrative structure becomes visible in the clause tree',
      },
      {
        id: 'gen-3',
        title: 'Reading Epistle',
        content: `Paul's letters (and James, Peter, John, Hebrews) follow a logical argument structure. Paul rarely states a truth and then moves on — he argues for it, defends it, applies it, and connects it to other truths. The key is to trace his argument like a thread. Where is he coming from? What is he responding to? What does he want the reader to believe or do? The theological sections typically precede the ethical sections, and they're connected by "therefore" — right belief is the foundation of right behavior.`,
        exercise: 'Open Romans 12:1–2. Read the two preceding verses (Romans 11:33–36). Now ask: what is the "therefore" in 12:1 responding to? What had Paul argued in Romans 1–11 that makes 12:1 a logical conclusion?',
        toolHint: 'Canonical Context tile — shows the passage\'s role and context within its book',
      },
      {
        id: 'gen-4',
        title: 'Reading Poetry and Prophecy',
        content: `Hebrew poetry works by parallelism — the second line restates, contrasts, or extends the first. "The LORD is my shepherd / I shall not want" — these two lines say the same thing in different language. Don't treat the second line as new information. Prophecy uses symbolic language, metaphor, and cosmic imagery. When Isaiah says "the mountains will melt" (34:3), he is using conventional prophetic idiom for divine judgment — not predicting geological events. Apocalyptic literature (Daniel, Revelation) intensifies this: the imagery is encoded cultural communication, not newspaper prediction.`,
        exercise: 'Open Psalm 1. Identify the parallelism in each verse — where does the second line restate, contrast, or extend the first? Now look at the imagery (tree planted by water, chaff blown by wind). What does each image communicate about the two kinds of people?',
        toolHint: 'Phrasing Diagram — poetic structure is visible; word study the key images',
      },
      {
        id: 'gen-5',
        title: 'Genre and the Gospel Narratives',
        content: `The Gospels are a unique genre — theological biography written to produce faith. They are not purely objective historical reporting (Luke says so himself in 1:1–4: "an orderly account"), but they are historically reliable. Each Gospel has a distinct theological purpose: Matthew presents Jesus as the Jewish Messiah and King, Mark as the Suffering Servant, Luke as the Savior of all people, John as the eternal Word of God. Reading a Gospel means understanding which Jesus the author is emphasizing — and why. The selection of stories and the order matters.`,
        exercise: 'Compare the same event in two Gospels: the feeding of the 5,000 (Matthew 14:13–21 and John 6:1–15). What details does each author include or omit? What theological emphasis does each version reflect?',
        toolHint: 'Use the Genre tag and Canonical Context — then use Scholar Chat to ask about the Synoptic differences',
      },
    ],
    quiz: [
      {
        q: 'Why does recognizing genre matter for biblical interpretation?',
        options: [
          'Different genres determine whether a passage is historically reliable',
          'Different genres have different rules for how meaning is communicated',
          'Genre tells you which passages are relevant for preaching',
          'All Scripture should be read the same way regardless of genre',
        ],
        answer: 1,
        explanation: 'Genre is the contract between author and reader. Reading a Psalm like a legal code, or a prophecy like a news article, systematically produces wrong interpretations.',
      },
      {
        q: 'The Psalms are primarily which genre?',
        options: [
          'Narrative',
          'Prophecy',
          'Poetry and Wisdom',
          'Epistle',
        ],
        answer: 2,
        explanation: 'The Psalms are Hebrew poetry — they work by parallelism, imagery, and emotional register, not by propositional logic.',
      },
      {
        q: 'In an epistle, the word "therefore" (like Romans 12:1) usually signals:',
        options: [
          'The end of the letter',
          'A quotation from the Old Testament',
          'The ethical response grounded in the theological argument that preceded it',
          'A new topic unrelated to what came before',
        ],
        answer: 2,
        explanation: '"Therefore" in Paul connects the "indicative" (what God has done — Romans 1–11) to the "imperative" (how we should live — Romans 12–16). Ethics flows from theology.',
      },
      {
        q: 'When reading a narrative passage, what should you primarily look for?',
        options: [
          'Propositional truth statements to memorize',
          'The human characters as moral examples to imitate',
          'Scene, character, conflict, and resolution — and what it reveals about God',
          'Commands to obey directly',
        ],
        answer: 2,
        explanation: 'Narrative communicates through story, not bullet points. The theological insight is embedded in how the scene unfolds and resolves — especially what it shows about God.',
      },
      {
        q: 'Hebrew poetry primarily works through:',
        options: [
          'Rhyming end words',
          'Parallelism — where the second line restates, contrasts, or extends the first',
          'Strict metrical rhythm',
          'Allegory where every detail has a hidden meaning',
        ],
        answer: 1,
        explanation: 'Hebrew poetry doesn\'t rhyme — it uses parallelism. The second line of a poetic couplet is doing something deliberate in relation to the first line.',
      },
      {
        q: 'Apocalyptic literature (like Revelation) uses heavy symbolic imagery because:',
        options: [
          'The author didn\'t know how to write clearly',
          'The events described are fictional',
          'It was written in encoded cultural language for a persecuted audience',
          'Greek didn\'t have words for what the author wanted to say',
        ],
        answer: 2,
        explanation: 'Apocalyptic is a Jewish and early Christian genre with conventional imagery — beasts, horns, numbers — that the original audience recognized. It is not newspaper prophecy.',
      },
      {
        q: 'The book of Proverbs is best understood as:',
        options: [
          'Absolute promises from God that always come true',
          'Descriptions of how life generally works in God\'s moral universe',
          'Commands to be obeyed as literally as the Ten Commandments',
          'Prophecies about the Messiah hidden in wisdom language',
        ],
        answer: 1,
        explanation: 'Proverbs are generalizations, not guarantees. "Train up a child in the way he should go" is a general wisdom observation, not a theological promise with no exceptions.',
      },
      {
        q: 'Each of the four Gospels presents Jesus differently because:',
        options: [
          'The authors disagreed about who Jesus was',
          'They were written for different audiences with distinct theological purposes',
          'They were written at different times and the authors forgot details',
          'They are four independent biographies with no relationship to each other',
        ],
        answer: 1,
        explanation: 'Matthew, Mark, Luke, and John each present a theologically shaped portrait of Jesus for a specific audience — Jewish Christians, Roman Gentiles, all people, and the whole world, respectively.',
      },
      {
        q: 'When you see cosmic imagery in Isaiah (mountains melting, stars falling), you should interpret it as:',
        options: [
          'Literal geological and astronomical predictions',
          'Conventional prophetic language for divine judgment and cosmic upheaval',
          'Pure poetry with no connection to historical events',
          'Symbols for specific nations decoded by modern prophecy scholars',
        ],
        answer: 1,
        explanation: 'Cosmic imagery is conventional prophetic idiom — borrowed from ancient Near Eastern literature — for the shattering of the existing order under divine judgment.',
      },
      {
        q: 'What does the Genre tag in the Canonical Context tile help you do?',
        options: [
          'Tells you the date and authorship of the book',
          'Lists every cross-reference to the passage in the rest of the canon',
          'Identifies the genre and subgenre of your passage to guide how you read it',
          'Shows whether the passage is disputed or textually uncertain',
        ],
        answer: 2,
        explanation: 'The Genre tag gives you the genre and subgenre — Epistle / Argumentative, Narrative / Historical, Poetry / Lament, etc. — so you know which interpretive rules apply.',
      },
    ],
  },

  {
    slug: 'context',
    number: 3,
    title: 'Context',
    subtitle: 'Zoom Out Before You Zoom In',
    icon: '⊞',
    color: '#c09040',
    lessons: [
      {
        id: 'ctx-1',
        title: 'The Most Common Exegetical Error',
        content: `D.A. Carson called it "the greatest source of theological error": taking a verse out of context. A text without a context is a pretext — you can make it say almost anything. Every verse exists inside a paragraph, inside a chapter, inside a book, inside a testament, inside the whole canon. Understanding a verse means understanding its location in all of those concentric circles. You zoom out before you zoom in.`,
        exercise: 'Take Jeremiah 29:11 ("For I know the plans I have for you..."). Without looking it up: who is speaking? To whom? In what situation? Now look at Jeremiah 29:1–23 for context. Does the context change how you read the verse?',
        toolHint: 'Canonical Context tile — shows the passage\'s role within the book and canon',
      },
      {
        id: 'ctx-2',
        title: 'Immediate Context',
        content: `Immediate context is the paragraph or section your verse lives in. Before you study your verse, read the five verses before it and the five after it. Read the whole chapter. Ask: what was the author just talking about? Where is he going next? What problem is he solving? What argument is he making? The immediate context usually resolves most interpretive questions that seem difficult in isolation.`,
        exercise: 'Open Philippians 4:13 ("I can do all things through him who strengthens me"). Read Philippians 4:10–14. What is Paul actually talking about? What does "all things" refer to in context? How does the context change how you\'d preach this verse?',
        toolHint: 'Analyze Philippians 4:10–14 as your passage — see the full clause structure in context',
      },
      {
        id: 'ctx-3',
        title: 'Book Context',
        content: `Every passage belongs to a book with a purpose, an argument, and a flow. Understanding book context means knowing: what is this book about? Who wrote it, to whom, and why? What problem is the author addressing? How does my passage fit into the overall argument or narrative arc? You don't need to memorize every detail — you need to know the spine of the book well enough to locate your passage within it.`,
        exercise: 'Open Romans 8:28 ("all things work together for good"). Now ask: what has Paul been arguing in Romans 1–8? What is the "good" he\'s talking about? What does verse 29 say that defines it? The book context makes the verse far richer than it looks alone.',
        toolHint: 'Use Scholar Chat to ask: "Summarize the argument of Romans 1–8 in 3 sentences"',
      },
      {
        id: 'ctx-4',
        title: 'Canonical Context',
        content: `Canonical context asks where your passage fits in the whole story of Scripture. The Bible tells one story with four movements: Creation, Fall, Redemption, New Creation. Every passage is located somewhere in that story and contributes to it. An Old Testament passage points forward to Christ. A New Testament passage looks back to the cross and forward to consummation. Reading canonically means asking: how does this passage fit into the unfolding revelation of God?`,
        exercise: 'Open Exodus 12 (the Passover). Canonical context asks: how does this event anticipate Christ? Read 1 Corinthians 5:7. How does Paul connect them? The Passover is not just history — it is typology.',
        toolHint: 'Cross-Reference strip and Canonical Context tile — see how the passage connects across the canon',
      },
      {
        id: 'ctx-5',
        title: 'Historical-Cultural Context',
        content: `The Bible was written in times and places very different from ours. The original readers understood things we miss entirely — because they lived there. Knowing that Roman crucifixion was reserved for slaves and rebels changes how you read the cross. Knowing that "eating with sinners" was a radical social violation changes how you read Luke 15. Historical-cultural context doesn't change the meaning of the text; it recovers the meaning that was always there.`,
        exercise: 'Open John 4 (the Woman at the Well). List every cultural detail you notice: gender, ethnicity, the time of day, the location, the number of husbands. Look at the cultural context markers (◈). How do each of these details carry meaning the original audience understood immediately?',
        toolHint: 'Cultural Context (◈ markers on the phrasing diagram) — click any highlighted phrase for background',
      },
    ],
    quiz: [
      {
        q: 'D.A. Carson called what "the greatest source of theological error"?',
        options: [
          'Ignoring the original languages',
          'Using too many commentaries',
          'Taking a verse out of context',
          'Applying Old Testament law to New Testament Christians',
        ],
        answer: 2,
        explanation: 'A text without a context is a pretext. Context — immediate, book, canonical, and historical — is not optional: it\'s the difference between reading and misreading.',
      },
      {
        q: 'Jeremiah 29:11 ("I know the plans I have for you...") is most faithfully read as:',
        options: [
          'A personal promise to every individual Christian',
          'A word of hope to the exiles in Babylon facing a 70-year captivity',
          'A New Testament promise about career success',
          'An unconditional guarantee of prosperity',
        ],
        answer: 1,
        explanation: 'Jeremiah 29:11 is addressed to the Jewish exiles in Babylon — God promises restoration after 70 years of exile. Applying it without context strips it of its actual meaning.',
      },
      {
        q: 'Philippians 4:13 ("I can do all things through him who strengthens me") in context refers to:',
        options: [
          'Achieving any goal or ambition with God\'s help',
          'Athletic performance and physical achievement',
          'Paul\'s contentment whether in abundance or in need',
          'Victory in spiritual warfare',
        ],
        answer: 2,
        explanation: 'Verses 11–12 make the context explicit: "I have learned, in whatever state I am, to be content... I know how to be abased and how to abound." The "all things" is contentment in any circumstance.',
      },
      {
        q: '"Immediate context" means:',
        options: [
          'The historical background of the book',
          'The most obvious surface meaning of the words',
          'The verses and paragraphs surrounding your passage',
          'The immediate application for today\'s reader',
        ],
        answer: 2,
        explanation: 'Immediate context = the nearest surrounding text. Read five verses before and after, then the whole chapter. Most interpretive questions are answered here.',
      },
      {
        q: 'Understanding "book context" requires knowing:',
        options: [
          'The book\'s purpose, argument, and where your passage fits in its flow',
          'The date and authorship of every chapter',
          'Every cross-reference in the whole Bible for that book',
          'The Greek or Hebrew title of the book',
        ],
        answer: 0,
        explanation: 'Book context = knowing the spine: what is this book about, why was it written, what is the author arguing, and where does my passage fit in that argument?',
      },
      {
        q: 'Canonical context asks:',
        options: [
          'Which Bible translation is most accurate for this passage',
          'How does this passage fit into the unfolding story of Scripture',
          'Whether the passage is in the Protestant or Catholic canon',
          'What church tradition has said about this passage',
        ],
        answer: 1,
        explanation: 'Canonical context locates your passage within the four-movement drama of Creation, Fall, Redemption, and New Creation — and asks how it contributes to that whole.',
      },
      {
        q: 'The Passover in Exodus 12, read canonically, functions as:',
        options: [
          'A Jewish dietary regulation with no NT relevance',
          'A historical event with no connection to the New Testament',
          'A type — an event that anticipates and is fulfilled in Christ',
          'An allegory of personal spiritual deliverance',
        ],
        answer: 2,
        explanation: '1 Corinthians 5:7 — "Christ, our Passover lamb, has been sacrificed." The Passover is a type; Christ is the antitype. Canonical context makes this connection visible.',
      },
      {
        q: 'Historical-cultural context primarily helps you:',
        options: [
          'Find new applications for the passage that earlier readers missed',
          'Recover the meaning the original audience would have understood',
          'Determine whether the historical events in the Bible are accurate',
          'Find out what theologians throughout history have said about the passage',
        ],
        answer: 1,
        explanation: 'Historical-cultural context doesn\'t add meaning — it recovers meaning that was always there. The original audience already knew it; we have to do the work to learn it.',
      },
      {
        q: 'Why does knowing that Roman crucifixion was reserved for slaves and rebels matter for reading the crucifixion accounts?',
        options: [
          'It confirms the historical reliability of the Gospels',
          'It explains why Jesus was crucified instead of stoned',
          'It shows the depth of Christ\'s humiliation and the scandal of the cross to first-century readers',
          'It provides background for Paul\'s legal arguments in his letters',
        ],
        answer: 2,
        explanation: 'Roman citizens were horrified by crucifixion. Paul\'s "word of the cross is foolishness" (1 Cor 1:18) and "a stumbling block" makes full sense when you understand the cultural shame attached to it.',
      },
      {
        q: 'What does the Canonical Context tile in this tool show you?',
        options: [
          'A complete list of every commentator\'s view on the passage',
          'The passage in every available Bible translation',
          'Genre, biblical themes, key words, passage role, and canonical connections',
          'The historical-critical analysis of the passage\'s authorship',
        ],
        answer: 2,
        explanation: 'The Canonical Context tile gives you genre, book theme, thematic tags, the passage\'s role within the book, and canon-wide connections — all at a glance.',
      },
    ],
  },

  {
    slug: 'grammar',
    number: 4,
    title: 'Grammatical Structure',
    subtitle: 'Follow the Logic',
    icon: '⊟',
    color: '#7090c0',
    lessons: [
      {
        id: 'gram-1',
        title: 'Find the Main Verb',
        content: `Every sentence has a main verb — an anchor around which everything else orbits. In English and especially Greek, the main verb carries the central assertion. Everything else in the sentence (participial phrases, subordinate clauses, prepositional phrases) is supporting the main verb — qualifying it, explaining it, or showing its result. If you can find the main verb and its subject, you've found the central idea of the sentence.`,
        exercise: 'Open Ephesians 1:3–14 (a single sentence in Greek). Find the main verb. Hint: it\'s in verse 3. Everything else in those 12 verses supports it. How does seeing the structure change how you read the passage?',
        toolHint: 'Phrasing Diagram — the main clause is typically displayed prominently in the tree structure',
      },
      {
        id: 'gram-2',
        title: 'Subordinate Clauses',
        content: `Subordinate clauses can't stand alone — they depend on the main clause. "Because God so loved the world" is a subordinate clause. "He gave his only Son" is the main clause. The subordinate clause explains the cause or reason for the main action. Learning to identify subordinate clauses means you can separate the central assertion from its supporting ideas. You won't preach the support as if it's the point.`,
        exercise: 'Open John 3:16. Identify every clause. Which clause is the main assertion? Which clauses explain why, how, or with what result? Map the logical relationships.',
        toolHint: 'Phrasing Diagram — subordinate clauses appear as branches below the main clause',
      },
      {
        id: 'gram-3',
        title: 'Participles — The Action Modifiers',
        content: `Participles are verb forms that function as modifiers. In Greek (and reflected in English translations), participles often express the manner, means, or circumstances of the main action. "Having been raised with Christ" (Col 3:1) is a participle — it tells you the basis of what comes next. Confusing a participle with the main verb is a common way to get the emphasis wrong.`,
        exercise: 'Open Colossians 3:1–4. Find the main verb (it\'s in verse 2: "Set your minds"). What are the participial phrases? What is their relationship to the main command?',
        toolHint: 'Phrasing Diagram — click individual clauses to see their grammatical type in the word study panel',
      },
      {
        id: 'gram-4',
        title: 'Conjunctions as Logic',
        content: `Conjunctions are the joints of the argument. "For" introduces a reason. "Therefore" introduces a conclusion. "But" introduces a contrast. "So that" introduces a purpose. "Although" introduces a concession. When you map every conjunction in a passage, you map the author\'s logic. You can see exactly why he says what he says, and in what order. This is the foundation of genuine exegesis.`,
        exercise: 'Open Romans 5:1–5. List every conjunction. Draw the logical relationships: what causes what? What results from what? Why does each statement follow the previous one?',
        toolHint: 'Phrasing Diagram — conjunctions are highlighted in the clause tree; click each one',
      },
      {
        id: 'gram-5',
        title: 'Structure Is Theology',
        content: `The structure of a passage is not just grammatical — it is theological. The indicative (what is true) comes before the imperative (what to do). The theological foundation comes before the ethical application. When Paul says "you were buried with Christ... therefore put to death what is earthly" (Colossians 3), the sequence is not optional — the identity statement is the basis of the command. Getting the structure right means getting the theology right.`,
        exercise: 'Open any of Paul\'s letters and find a passage that moves from indicative to imperative. How does the indicative (the "is") ground the imperative (the "ought")? What happens theologically if you reverse the order?',
        toolHint: 'Phrasing Diagram — look for the structural shift from theological assertion to ethical command',
      },
    ],
    quiz: [
      {
        q: 'In a sentence, the main verb is significant because:',
        options: [
          'It is always the longest word in the sentence',
          'It carries the central assertion around which everything else orbits',
          'It determines the date the passage was written',
          'It tells you the original language of the text',
        ],
        answer: 1,
        explanation: 'The main verb is the anchor. Find the main verb and its subject, and you\'ve found the central idea of the sentence.',
      },
      {
        q: 'A subordinate clause differs from a main clause in that:',
        options: [
          'It is always shorter than the main clause',
          'It cannot stand alone — it depends on the main clause for its meaning',
          'It contains the main idea the author wants to communicate',
          'It always begins with a conjunction',
        ],
        answer: 1,
        explanation: 'Subordinate clauses are dependent — they explain, qualify, or expand the main clause but can\'t stand alone. They support the main assertion.',
      },
      {
        q: 'The conjunction "for" in a passage (e.g. "For God so loved...") typically introduces:',
        options: [
          'A command to the reader',
          'A contrast with the previous idea',
          'The reason or explanation for what came before',
          'A result or consequence',
        ],
        answer: 2,
        explanation: '"For" introduces a reason. "God demonstrates his love for us in this: while we were still sinners, Christ died for us — FOR this is love..." "For" answers the question "why?"',
      },
      {
        q: 'Ephesians 1:3–14 is one long Greek sentence. Its main verb appears in verse 3 and is:',
        options: [
          '"predestined"',
          '"chose"',
          '"blessed" (God has blessed us)',
          '"seated"',
        ],
        answer: 2,
        explanation: '"Blessed be the God and Father of our Lord Jesus Christ, who has blessed us..." — the main assertion. Every "in him," "through him," and "according to" phrase for the next 12 verses explains how.',
      },
      {
        q: 'What is the theological significance of the indicative-imperative pattern in Paul\'s letters?',
        options: [
          'It shows that behavior comes before belief',
          'It shows that God\'s commands make identity possible',
          'It shows that who you are in Christ is the basis for how you should live',
          'It is a Greek literary convention with no theological meaning',
        ],
        answer: 2,
        explanation: 'Paul always grounds imperatives in indicatives. "You died and your life is hidden with Christ" (Col 3:3 — indicative) comes before "put to death what is earthly" (3:5 — imperative).',
      },
      {
        q: 'A Greek participle in a passage typically expresses:',
        options: [
          'The main command of the sentence',
          'The manner, means, basis, or circumstance of the main action',
          'A historical note unrelated to the main argument',
          'A definition of the key term',
        ],
        answer: 1,
        explanation: 'Participles modify — they tell you how, why, or on what basis the main action happens. "Having been raised with Christ" (Col 3:1) tells you the basis for the command that follows.',
      },
      {
        q: 'The conjunction "therefore" in Romans 12:1 ("Therefore I urge you...") signals:',
        options: [
          'A new section unrelated to Romans 1–11',
          'A conclusion and application drawn from the theological argument of Romans 1–11',
          'A summary of the Old Testament law',
          'A personal aside from Paul',
        ],
        answer: 1,
        explanation: '"Therefore" is the hinge of Romans. The entire ethical section (12–16) is grounded in the theological argument (1–11). Remove the "therefore" and you lose the foundation.',
      },
      {
        q: 'When you map every conjunction in a passage, you are primarily doing what?',
        options: [
          'Identifying the literary style of the author',
          'Tracing the author\'s logical argument',
          'Finding word study candidates in the original language',
          'Preparing a topical sermon outline',
        ],
        answer: 1,
        explanation: 'Conjunctions are joints — they show why one idea follows another, what causes what, what results from what. Mapping them maps the logic of the argument.',
      },
      {
        q: 'Getting the grammatical structure of a passage right is important because:',
        options: [
          'It satisfies academic exegetical standards',
          'Structure is theology — the order and relationship of ideas carries meaning',
          'It allows you to preach from the original Greek or Hebrew',
          'It gives you more sermon points',
        ],
        answer: 1,
        explanation: 'The structure of a passage is not ornamental — it\'s theological. The sequence, subordination, and relationship of clauses encode the author\'s meaning.',
      },
      {
        q: 'The Phrasing Diagram in this tool displays the clause structure of a passage visually. Its primary purpose is to help you:',
        options: [
          'See word frequencies across the passage',
          'Compare translations side by side',
          'Identify the main clause and trace how supporting clauses relate to it',
          'Generate a verse-by-verse commentary',
        ],
        answer: 2,
        explanation: 'The Phrasing Diagram is a structural observation tool — it shows you the main clause and how every other clause relates to it, making the author\'s logic visible.',
      },
    ],
  },

  {
    slug: 'word-study',
    number: 5,
    title: 'Word Study',
    subtitle: 'Mining the Words',
    icon: 'Aa',
    color: '#a070b0',
    lessons: [
      {
        id: 'wrd-1',
        title: 'Not Every Word Needs a Word Study',
        content: `Word studies are powerful — and overused. Not every word in every passage needs to be looked up in a lexicon. You look up load-bearing words: words that are central to the argument, theologically significant, or ones where the English translation might be hiding something important. Ask: which words are the passage depending on? Which words, if misunderstood, would change the meaning? Those are your word study candidates.`,
        exercise: 'Open any passage and identify 2–3 words that carry the theological weight of the passage. Ignore the transition words and common verbs. Click those load-bearing words in the Phrasing Diagram to open the Word Study panel.',
        toolHint: 'Click any word in the Phrasing Diagram → Word Study panel opens on the right',
      },
      {
        id: 'wrd-2',
        title: 'Semantic Range',
        content: `Every word has a range of meaning — not a single fixed definition. The Greek word "sarx" can mean flesh (physical body), sinful nature, or humanity depending on context. "Pistis" can mean faith, faithfulness, or the body of Christian belief. The job of a word study is to discover the full semantic range, then ask: which meaning fits this specific context? Etymology (the word's origin) often misleads — what matters is how the word was used by this author, in this period, in this genre.`,
        exercise: 'Look up the word "love" in 1 Corinthians 13:4 using the Word Study panel. What is the Greek word? What are the other Greek words for love? Why did Paul use this specific word here?',
        toolHint: 'Word Study panel — shows semantic range, cognates, usage across the canon',
      },
      {
        id: 'wrd-3',
        title: 'Usage Determines Meaning',
        content: `The fatal error in word study is the etymological fallacy — assuming a word means what its root words suggest. "Dynamite" comes from the Greek "dynamis" (power), but dynamite does not mean "power" in English. The word "agape" is not special just because it's called the "God-word for love" — its meaning is determined by how it was used in the first century, not by what it sounds like. Always ask: how did this author use this word? How was it used by contemporaries?`,
        exercise: 'Use the Word Study panel to look up "ekklesia" (church/assembly). Look at its secular usage in Greek. How does knowing that "ekklesia" was a civic assembly term change how you read passages about the church?',
        toolHint: 'Word Study panel — look at the canon-wide usage section and compare contexts',
      },
      {
        id: 'wrd-4',
        title: 'Cognates and Word Families',
        content: `Words in a language come in families — same root, different forms. The root "pisteuo" (believe) is related to "pistis" (faith) and "pistos" (faithful/trustworthy). Understanding the word family can illuminate a passage. Hebrews 11 defines "pistis" — and that definition informs every instance of "pisteuo" in the NT. Word families also create patterns across a book: an author who uses a root word repeatedly is developing a theme.`,
        exercise: 'Look up the word "righteousness" in Romans 1:17 using the Word Study panel. What is the Greek root? How many times does it and its cognates appear in Romans? What is Paul building?',
        toolHint: 'Word Study panel — cognates section shows related words across the biblical canon',
      },
      {
        id: 'wrd-5',
        title: 'The Word Study Is Not the Sermon',
        content: `Word studies serve interpretation — they don't replace it. A common preacher mistake is spending 10 minutes on a Greek word in the pulpit and calling it exegesis. The word study is a tool that confirms or clarifies the meaning of a passage; it's one input among many. The congregation doesn't need your Greek homework — they need you to have done it, synthesized it, and turned it into clear proclamation of the text.`,
        exercise: 'After completing a word study on a key word, write one sentence that captures what you learned and how it changes (or confirms) your reading of the whole passage.',
        toolHint: 'Word Study panel → use the findings to sharpen your reading of the Phrasing Diagram',
      },
    ],
    quiz: [
      {
        q: 'Which words in a passage are most worth doing a word study on?',
        options: [
          'Every word, systematically, to be thorough',
          'The longest and most unusual words',
          'Load-bearing words central to the argument — ones the passage depends on',
          'Only the words that appear in the original Greek or Hebrew',
        ],
        answer: 2,
        explanation: 'Not every word needs study. Focus on words that are theologically significant, semantically ambiguous, or central to the passage\'s argument.',
      },
      {
        q: 'The "semantic range" of a word means:',
        options: [
          'The word\'s origin and etymology',
          'The full range of meanings the word can carry in context',
          'The geographic range of where the word was used',
          'The number of times the word appears in the Bible',
        ],
        answer: 1,
        explanation: 'Every word has a range of possible meanings. Context determines which meaning applies. The job of word study is to discover the range and then identify the contextual meaning.',
      },
      {
        q: 'The "etymological fallacy" in word study is:',
        options: [
          'Using a lexicon that is out of date',
          'Assuming a word\'s meaning based on its root words rather than its actual usage',
          'Studying too many words in a single passage',
          'Ignoring the original language entirely',
        ],
        answer: 1,
        explanation: '"Dynamite" comes from "dynamis" (power) but doesn\'t mean power. Etymology doesn\'t determine meaning — usage does. The fallacy is treating roots as definitions.',
      },
      {
        q: 'What primarily determines the meaning of a word in a passage?',
        options: [
          'Its dictionary definition in a standard lexicon',
          'Its etymology and root words',
          'How the author and contemporaries actually used it in context',
          'The translation chosen by your preferred Bible version',
        ],
        answer: 2,
        explanation: 'Usage determines meaning. The question is: how did this author use this word, in this genre, in this period, in this context? The lexicon is a starting point, not the endpoint.',
      },
      {
        q: 'The Greek word "agape" (love) is sometimes called the "God-word for love." What is the problem with this approach?',
        options: [
          'Agape is actually the wrong Greek word for divine love',
          'Meaning comes from usage, not from the word\'s reputation — agape was used in secular Greek with no special spiritual meaning',
          'God\'s love cannot be captured in any human word',
          'Agape appears too rarely in the NT to make claims about',
        ],
        answer: 1,
        explanation: 'The "agape is God\'s special love" teaching is etymological fallacy. Agape was used in secular Greek for ordinary preferences. Paul fills it with meaning through the argument; the word doesn\'t arrive pre-loaded.',
      },
      {
        q: 'Understanding a word family (cognates) helps because:',
        options: [
          'It proves the text is historically authentic',
          'It reveals an author\'s repeated emphasis and developing theme across a book',
          'It replaces the need to read commentaries',
          'It shows which translation is closest to the original',
        ],
        answer: 1,
        explanation: 'Authors use word families deliberately. Paul\'s "righteousness" (dikaiosyne), "justify" (dikaioo), and "just" (dikaios) are the same root — he\'s developing a single theological theme across Romans.',
      },
      {
        q: 'Why do word studies not replace interpretation?',
        options: [
          'Word studies are unreliable because scholars disagree',
          'Word studies are just one input — interpretation requires seeing how words function in context, structure, and genre',
          'Most congregations don\'t care about original language study',
          'Word studies only work for Greek, not Hebrew',
        ],
        answer: 1,
        explanation: 'A word study tells you what a word can mean. Interpretation tells you what it means here — in this passage, in this argument, in this genre. The word study serves the interpretation.',
      },
      {
        q: 'The Word Study panel in this tool opens when you:',
        options: [
          'Click the "Aa" button in the toolbar',
          'Click any word in the Phrasing Diagram',
          'Right-click the passage reference',
          'Open the Cross-Reference strip',
        ],
        answer: 1,
        explanation: 'Click any word in the Phrasing Diagram — the Word Study panel opens on the right, showing semantic range, cognates, and usage across the canon.',
      },
      {
        q: 'When should you bring word study results into your sermon?',
        options: [
          'Always — it shows your preparation and helps the congregation understand the original',
          'Never — word studies are academic and congregation members don\'t need them',
          'When it clarifies or deepens the meaning for the listener — synthesized, not displayed',
          'Only when the passage is from the New Testament',
        ],
        answer: 2,
        explanation: 'Word study results should be synthesized, not displayed. You don\'t show your homework — you do it, let it sharpen your understanding, then proclaim the text clearly.',
      },
      {
        q: 'If you discover that a Greek word has multiple possible meanings, the next step is to:',
        options: [
          'Choose the most spiritually significant meaning',
          'Choose the meaning that best fits the immediate context and the author\'s usage elsewhere',
          'Use all the meanings together in your sermon for richness',
          'Defer to the majority opinion of commentators',
        ],
        answer: 1,
        explanation: 'Context is king. When a word has a range of meanings, the immediate context, book context, and the author\'s usage elsewhere determines which meaning applies here.',
      },
    ],
  },

  {
    slug: 'historical-background',
    number: 6,
    title: 'Historical Background',
    subtitle: 'Enter the Ancient World',
    icon: '⊕',
    color: '#50a080',
    lessons: [
      {
        id: 'hist-1',
        title: 'The 2,000-Year Gap',
        content: `There is a gap between us and the biblical text — cultural, linguistic, historical, and geographical. The original readers needed no explanation of what Roman crucifixion meant socially, or what a Pharisee was, or why "eating with sinners" was scandalous. We do. Historical background study is the discipline of crossing the gap: learning what the original audience already knew so we can understand what the author assumed.`,
        exercise: 'Open Luke 15:1–2 ("the Pharisees and the scribes grumbled, saying, \'This man receives sinners and eats with them\'"). What is the cultural weight of "eating with"? Why would this be shocking? Look at the Cultural Context marker (◈) if there is one.',
        toolHint: 'Cultural Context (◈) markers on the Phrasing Diagram — click any highlighted phrase',
      },
      {
        id: 'hist-2',
        title: 'Geography Shapes the Text',
        content: `Places are not just backdrops — they carry meaning. Samaria was despised by Jews; Jesus going through Samaria (John 4) is a deliberate, loaded choice. The Sea of Galilee in a storm (Matthew 8) evokes the chaos waters of Genesis and the Psalms. Jerusalem is the city of the covenant. Babylon is the city of exile. Knowing the geography means knowing the theological freight that comes with the location.`,
        exercise: 'Open the Geography Map tile. Analyze Romans 1:1–7. Rome, the city Paul is writing to, is shown. What does it mean that the gospel Paul is about to explain has reached the capital of the empire that crucified Jesus?',
        toolHint: 'Geography Map tile — zoom to the passage\'s key cities; click each city for background',
      },
      {
        id: 'hist-3',
        title: 'Political and Social Structures',
        content: `The Roman Empire, Jewish temple system, Greco-Roman household codes, patronage networks, trade guilds — these structures are assumed on every page of the NT. When Paul tells slaves to obey masters (Ephesians 6:5), understanding the Roman slave economy matters. When he says "Caesar is Lord" is replaced by "Jesus is Lord," understanding what Kyrios (Lord) meant as a Roman political title matters. The political context is the water the authors were swimming in.`,
        exercise: 'Look at Philippians 1:27 — "Let your manner of life be worthy of the gospel of Christ." The word translated "manner of life" is "politeuesthe" — it\'s a citizenship word. Philippi was a Roman colony; its citizens were proud Roman citizens. What does Paul mean when he uses that word for the gospel community?',
        toolHint: 'Word Study panel + Cultural Context markers — explore the political dimension of key terms',
      },
      {
        id: 'hist-4',
        title: 'The Temple, Sacrifice, and Covenant',
        content: `Much of the NT makes no sense without understanding the Jewish temple system, the sacrificial economy, and the covenant structure of the OT. When Hebrews calls Jesus "our great high priest" (4:14), it assumes you know what a high priest did on Yom Kippur. When Paul calls Jesus "our Passover lamb" (1 Cor 5:7), it assumes you know Exodus 12. The OT institutions are the scaffolding that the NT writers are dismantling — and replacing with Christ.`,
        exercise: 'Open Hebrews 9:1–14. Without looking at a commentary: what OT institution is being described? What is the Holy of Holies? What happened once a year? Now ask how Christ\'s sacrifice is being compared to it.',
        toolHint: 'OT Worship Structures tile — shows the Tabernacle and Temple floor plans with theological notes',
      },
      {
        id: 'hist-5',
        title: 'Using the Tool\'s Historical Features',
        content: `This tool puts historical-cultural resources directly in the workflow. The Geography Map shows every biblical city with archaeological and theological notes. The Cultural Context markers (◈) flag phrases that carry hidden historical freight. The Monarchy Timeline shows the political history behind the prophets and kings. The OT Worship Structures tile shows the Tabernacle and Temples. Use these tools actively, not passively — they are designed to bridge the 2,000-year gap.`,
        exercise: 'Open 1 Kings 18 (Elijah and the prophets of Baal on Mount Carmel). Open the Geography Map and find Mount Carmel. Open the Monarchy Timeline and find Ahab. How does seeing the historical moment change how you read the narrative?',
        toolHint: 'Geography Map + Monarchy Timeline tiles — zoom to Israel; find Ahab on the timeline',
      },
    ],
    quiz: [
      {
        q: 'What is the primary goal of historical-cultural background study?',
        options: [
          'To prove the historical accuracy of the Bible',
          'To understand what the original audience already knew so we can understand what the author assumed',
          'To find modern parallels to the ancient text',
          'To determine the date and authorship of each book',
        ],
        answer: 1,
        explanation: 'Historical background crosses the gap between us and the text. The original readers needed no explanation of what Pharisees, Roman crucifixion, or Passover meant — we do.',
      },
      {
        q: 'Why is geography significant for interpretation — not just background?',
        options: [
          'Geography determines which events are historically verifiable',
          'Places carry theological freight — Samaria, Babylon, Jerusalem are loaded with meaning',
          'Geography helps us identify which manuscripts are authentic',
          'Geographic knowledge separates scholarly from popular Bible study',
        ],
        answer: 1,
        explanation: 'Samaria was despised. Babylon meant exile. Jerusalem meant covenant. Jesus going through Samaria (John 4) is a deliberate theological statement, not just a route choice.',
      },
      {
        q: 'When Paul says "Jesus is Lord" (Kyrios Iesous), understanding Roman politics helps because:',
        options: [
          'It shows that Paul was a Roman citizen',
          '"Kyrios" (Lord) was the title used for Caesar, making "Jesus is Lord" a politically subversive claim',
          'Rome had a special relationship with the early church',
          'The Roman courts would have known about Jesus\'s teachings',
        ],
        answer: 1,
        explanation: '"Caesar is Lord" (Kyrios Kaisar) was the Roman confession of loyalty. "Jesus is Lord" is a direct counter-claim with political and cosmic implications.',
      },
      {
        q: 'Hebrews 4:14 calls Jesus "our great high priest." Understanding this requires knowing:',
        options: [
          'The history of the priesthood in Greek religion',
          'What a Jewish high priest did on Yom Kippur — entering the Holy of Holies with blood for the people',
          'The political relationship between priests and Roman governors',
          'How Paul and the author of Hebrews disagreed about Jesus\'s role',
        ],
        answer: 1,
        explanation: 'The high priest\'s Yom Kippur role — entering the Holy of Holies once a year with atoning blood — is the entire backdrop for Hebrews\'s argument that Jesus is the final, superior High Priest.',
      },
      {
        q: 'The word "politeuesthe" in Philippians 1:27 ("let your manner of life be worthy") is a citizenship term. Why does this matter for interpreting the verse?',
        options: [
          'It proves Philippi had a democratic government',
          'Philippi was a Roman colony with proud Roman citizens — Paul is calling the church to live as citizens of a better kingdom',
          'It shows Paul was writing from a Roman prison',
          'It means the command only applies to Philippian Christians',
        ],
        answer: 1,
        explanation: 'Philippi\'s citizens prided themselves on Roman citizenship. Paul uses the civic language to call believers to a higher citizenship — the gospel commonwealth — with its own values and allegiances.',
      },
      {
        q: 'Understanding the Jewish sacrificial system is essential for reading the New Testament because:',
        options: [
          'Christians are still required to follow the Levitical sacrifices',
          'The NT writers constantly use the temple and sacrifice as the interpretive framework for understanding Christ\'s death',
          'The sacrificial system disproves later Jewish interpretations of the OT',
          'It shows how Jesus broke with Jewish tradition',
        ],
        answer: 1,
        explanation: '"Christ our Passover lamb" (1 Cor 5:7), "the Lamb of God" (John 1:29), "our great high priest" (Heb 4:14) — the NT is full of temple and sacrifice language. Without knowing the system, the language is hollow.',
      },
      {
        q: 'Jesus going through Samaria in John 4 is theologically significant because:',
        options: [
          'It was the shortest route from Judea to Galilee',
          'Samaria was the site of the original Garden of Eden',
          'Jews typically avoided Samaria because of deep ethnic and religious hostility — Jesus crosses this barrier deliberately',
          'John\'s Gospel was written primarily for Samaritan Christians',
        ],
        answer: 2,
        explanation: 'Jewish-Samaritan hostility was intense and centuries old. Jesus going through Samaria and talking with a Samaritan woman is loaded with social and theological significance — the gospel crossing every barrier.',
      },
      {
        q: 'The Cultural Context markers (◈) in the Phrasing Diagram appear on:',
        options: [
          'Grammatically difficult clauses in the original Greek or Hebrew',
          'Phrases that carry historical or cultural freight a first-century reader would recognize but a modern reader might miss',
          'Every verse that is theologically important',
          'Words that have been disputed in textual criticism',
        ],
        answer: 1,
        explanation: 'The ◈ markers flag culturally embedded references — the kind of things the original audience understood immediately that we need to excavate. Click them for background.',
      },
      {
        q: 'The Monarchy Timeline in this tool is most useful for studying:',
        options: [
          'The genealogies in Matthew and Luke',
          'The prophetic books — understanding which king was reigning when each prophet spoke',
          'The dating of NT epistles',
          'The geography of Paul\'s missionary journeys',
        ],
        answer: 1,
        explanation: 'Isaiah, Jeremiah, Ezekiel, Amos, Hosea — all prophesied during specific reigns. The Monarchy Timeline shows you the political and historical moment each prophet was speaking into.',
      },
      {
        q: 'The OT Worship Structures tile (Tabernacle, Solomon\'s Temple, Herod\'s Temple) is especially valuable when studying:',
        options: [
          'The Psalms of ascent',
          'Hebrews, and any NT passage that references priestly, sacrificial, or temple imagery',
          'The prophetic books of Ezra and Nehemiah',
          'The Wisdom literature',
        ],
        answer: 1,
        explanation: 'Hebrews especially, but also John 2, Mark 11–12, and Revelation use temple imagery extensively. Seeing the layout and function of the structures makes the theological argument visible.',
      },
    ],
  },

  {
    slug: 'intertextual',
    number: 7,
    title: 'Intertextual Connections',
    subtitle: 'Scripture Interprets Scripture',
    icon: '⇌',
    color: '#c09040',
    lessons: [
      {
        id: 'int-1',
        title: 'The Bible as a Unified Book',
        content: `The Bible is not a collection of 66 independent books — it is one book with one Author telling one story. The NT writers read the OT constantly and deliberately. They quote it, echo it, allude to it, and fulfill it. A NT writer who quotes Isaiah is not just illustrating a point — he is claiming that Isaiah's words are being fulfilled now, in this way. Missing these connections means missing the author's primary interpretive framework.`,
        exercise: 'Open Matthew 2:15 ("Out of Egypt I called my son"). This quotes Hosea 11:1. Read Hosea 11:1 in context — it\'s about Israel. Why does Matthew apply it to Jesus? What is he claiming?',
        toolHint: 'Cross-Reference strip — appears below the toolbar after analysis; click any reference',
      },
      {
        id: 'int-2',
        title: 'Quotation vs. Allusion vs. Echo',
        content: `The NT uses the OT in three ways. Explicit quotations are introduced with "as it is written" or "the Scripture says" — they're unmissable. Allusions are deliberate but unlabeled references that assume familiarity ("the Lamb of God" alludes to the whole sacrificial system and specifically to Isaiah 53). Echoes are the faintest category — a phrase, image, or pattern that resonates with the OT without being intended as a direct citation. Learning to hear all three levels is the art of intertextual reading.`,
        exercise: 'Open John 1:1 ("In the beginning was the Word"). This is not a quotation, but what is it echoing? How does hearing that echo change your reading of the entire prologue to John?',
        toolHint: 'Cross-Reference strip + Scholar Chat — ask: "What OT texts does John 1:1–18 echo?"',
      },
      {
        id: 'int-3',
        title: 'Typology — The Shadow and the Substance',
        content: `Typology is the interpretive method by which the NT reads the OT: persons, events, and institutions in the OT that foreshadow and are fulfilled in Christ. Adam is a type of Christ (Romans 5). The Passover lamb is a type of Christ (1 Cor 5:7). The high priest is a type of Christ (Hebrews). The promised land is a type of the new creation. God embedded these patterns in history — they are not arbitrary; they are the shape of his redemptive purposes. Typology is not allegory — it requires a real historical referent.`,
        exercise: 'Open Hebrews 4:1–11 (the rest of Canaan as a type). Identify: what is the OT type? What is the NT fulfillment? What is the application? How does recognizing the typology change how you read the passage?',
        toolHint: 'Cross-Reference strip — the canonical connections in the Canonical Context tile often point to typological links',
      },
      {
        id: 'int-4',
        title: 'The Principle: Scripture Interprets Scripture',
        content: `The Reformation principle "Scripture interprets Scripture" means that the clearest passages of Scripture shed light on the more obscure ones. If you're unsure what a passage means, look for parallel passages that address the same topic more clearly. If Paul's teaching in Romans seems obscure, look at how he addresses the same issue in Galatians. This doesn't mean forcing harmony — genuine tensions in Scripture should be held honestly — but it means the whole canon is your interpretive resource.`,
        exercise: 'Open James 2:24 ("a person is justified by works and not by faith alone"). Now compare Romans 3:28 ("a person is justified by faith apart from works"). How do context and the different usage of "justified" resolve the apparent tension?',
        toolHint: 'Cross-Reference strip + Scholar Chat — ask about the apparent tension between James and Paul',
      },
      {
        id: 'int-5',
        title: 'Using the Cross-Reference Strip',
        content: `The cross-reference strip below the toolbar in this tool generates canon-wide intertextual links for your passage — where it echoes, quotes, or anticipates other texts. These are not random "see also" references — they're the actual network of connections the biblical authors were participating in. Use them to hear the full chord the passage is playing, not just the note. A passage studied in isolation is a note; a passage studied in its intertextual context is a chord.`,
        exercise: 'Open Psalm 22. Look at the cross-reference strip. How many NT connections does the cross-reference system surface? Click each one. How does the psalm\'s canonical connections help you understand both the psalm and the NT passages?',
        toolHint: 'Cross-Reference strip — appears after analysis below the toolbar; click any ref to load it',
      },
    ],
    quiz: [
      {
        q: 'When Matthew quotes "Out of Egypt I called my son" (Hosea 11:1) about Jesus\'s return from Egypt, he is claiming:',
        options: [
          'Matthew misread Hosea, which was written about Israel',
          'Jesus recapitulates and fulfills Israel\'s story — he is the true Israel',
          'The quote is symbolic and not intended as literal fulfillment',
          'The Hosea passage has two separate literal fulfillments',
        ],
        answer: 1,
        explanation: 'Matthew\'s typological reading says Jesus is the true Israel — he does what Israel failed to do. His use of Hosea 11:1 is claiming that Jesus\'s life is the fulfillment of Israel\'s history.',
      },
      {
        q: 'An "echo" of an OT text in the NT differs from an "allusion" in that:',
        options: [
          'Echoes are shorter and allusions are longer',
          'Echoes are Old Testament quoting New Testament',
          'An echo is the faintest resonance — a phrase or pattern that resonates without necessarily being a deliberate citation',
          'Echoes require scholarly consensus to identify; allusions are obvious',
        ],
        answer: 2,
        explanation: 'The spectrum runs from explicit quotation to deliberate allusion to faint echo. Echoes are the most subtle — a pattern or image that resonates with the OT without necessarily being a conscious reference.',
      },
      {
        q: 'Typology in biblical interpretation means:',
        options: [
          'Reading the OT as pure allegory with no historical reality',
          'OT persons, events, and institutions that foreshadow and are fulfilled in Christ',
          'Matching personality types with biblical characters',
          'Using the OT as illustrations for NT doctrines',
        ],
        answer: 1,
        explanation: 'Typology requires real historical referents — Adam, the Passover, the high priest, the temple. These are not allegories; they are historical realities that God embedded with a forward-pointing shape.',
      },
      {
        q: 'The Reformation principle "Scripture interprets Scripture" means:',
        options: [
          'Every passage interprets itself without need for outside resources',
          'Clear passages of Scripture shed light on more obscure passages',
          'Only Scripture should be used in theological method, never reason or tradition',
          'Different books of the Bible never teach the same thing twice',
        ],
        answer: 1,
        explanation: 'Scripture interprets Scripture means the whole canon is your interpretive resource. When a passage is unclear, look for clearer parallel passages addressing the same topic.',
      },
      {
        q: 'John 1:1 ("In the beginning was the Word") is echoing:',
        options: [
          'Genesis 1:1 — using the same opening phrase to claim Jesus was present at creation',
          'Proverbs 8 exclusively — the personification of wisdom',
          'The introduction to Luke\'s Gospel',
          'The Greek philosophical concept of the Logos only',
        ],
        answer: 0,
        explanation: '"In the beginning" (en arche) is the identical opening of Genesis 1:1 (LXX). John is claiming that the Word who became flesh was present at creation itself — and is the agent of all creation.',
      },
      {
        q: 'James 2:24 ("justified by works") and Romans 3:28 ("justified by faith") appear to conflict. The resolution is found by:',
        options: [
          'Choosing one passage over the other as more authoritative',
          'Recognizing that James and Paul use "justified" and "works" in different senses',
          'Admitting the Bible contradicts itself here',
          'Reading James as correcting Paul\'s earlier teaching',
        ],
        answer: 1,
        explanation: 'James uses "justified" to mean demonstrated/vindicated (before people), and "works" to mean the fruit of genuine faith. Paul uses both terms in the forensic sense (before God). Same words, different usage, no contradiction.',
      },
      {
        q: 'Psalm 22 is especially significant for reading the Gospel passion narratives because:',
        options: [
          'It was written by David as a prediction of the Messiah\'s crucifixion',
          'Jesus quotes it from the cross — inviting hearers into the whole psalm, including its resolution in praise',
          'It contains the clearest OT statement of substitutionary atonement',
          'The NT authors cite it more than any other psalm',
        ],
        answer: 1,
        explanation: 'Jesus\'s cry "My God, my God, why have you forsaken me?" quotes Psalm 22:1 — meaning he is praying the whole psalm, including its ending in vindication and praise. Intertextual reading hears the whole chord.',
      },
      {
        q: 'The Cross-Reference strip in this tool shows you:',
        options: [
          'Related passages randomly chosen by translation committees',
          'The actual intertextual network — where the passage echoes, quotes, or is anticipated by other biblical texts',
          'Commentary footnotes from respected theologians',
          'Parallel passages only from the same book of the Bible',
        ],
        answer: 1,
        explanation: 'The Cross-Reference strip generates the canon-wide intertextual connections for your passage — the actual network of echoes, quotations, and fulfillments the biblical authors were participating in.',
      },
      {
        q: 'The Passover in Exodus 12 as a "type" of Christ means:',
        options: [
          'The Passover is a fictional story that teaches the truth of Christ\'s death',
          'The Passover was a real historical event that God designed to foreshadow and be fulfilled by Christ\'s sacrifice',
          'Christians should still celebrate Passover to remember Jesus',
          'The Passover and Christ\'s death are completely separate and unrelated events',
        ],
        answer: 1,
        explanation: 'Types require historical reality. The Passover really happened; God designed it to have a shape that would be filled and surpassed by Christ. 1 Corinthians 5:7 makes the typological connection explicit.',
      },
      {
        q: 'Studying a passage "in its intertextual context" means:',
        options: [
          'Reading it in the original language only',
          'Comparing it to what secular first-century writers said on the same topic',
          'Hearing the full chord of canon-wide connections the passage plays, not just the isolated note',
          'Looking at every passage written around the same time period',
        ],
        answer: 2,
        explanation: 'A passage studied alone is a note; a passage in its intertextual context is a chord. The meaning is richer, fuller, and more precise when you hear the whole biblical conversation it\'s participating in.',
      },
    ],
  },

  {
    slug: 'theological-synthesis',
    number: 8,
    title: 'Theological Synthesis',
    subtitle: 'What Does This Teach About God?',
    icon: '⬡',
    color: '#c08060',
    lessons: [
      {
        id: 'theo-1',
        title: 'Every Passage Teaches Something About God',
        content: `Every passage of Scripture, rightly interpreted, teaches something about who God is, what he does, and how he relates to his creation. This is not imposed on the text — it is the nature of Scripture. Even the genealogies reveal God's faithfulness to his covenant across generations. Even the laws reveal God's character. Theological synthesis asks: after all the exegetical work I've done, what does this passage say about God? That is the organizing question.`,
        exercise: 'Open Ruth 1. After reading it: what does this passage reveal about the character of God? He doesn\'t appear directly. Where do you see his hand? What does the passage teach about covenant loyalty (hesed)?',
        toolHint: 'Scholar Chat — ask: "What does Ruth 1 reveal about the character of God?"',
      },
      {
        id: 'theo-2',
        title: 'Biblical Theology vs. Systematic Theology',
        content: `Biblical theology traces how a theme or doctrine develops progressively through Scripture — following the plotline. Systematic theology organizes what Scripture teaches on a topic across all of Scripture at once. Both are legitimate and necessary. When exegeting a passage, start with biblical theology: what does this passage contribute to the developing story? Don't flatten the text by jumping too quickly to your systematic category. Let the passage speak within its own historical moment first.`,
        exercise: 'Open Genesis 12:1–3 (the Abrahamic covenant). In biblical theology: where are we in the story? What has happened (Genesis 1–11)? What does God\'s promise do to the narrative? In systematic theology: what doctrine does this establish? Work in that order.',
        toolHint: 'Canonical Context tile + Cross-Reference strip — see how the Abrahamic covenant echoes forward through the canon',
      },
      {
        id: 'theo-3',
        title: 'The Main Thing and the Secondary Things',
        content: `Every passage has a main theological claim and secondary implications. The main claim is what the passage is centrally arguing or asserting. Secondary implications are true things the passage implies or assumes without making the central point. Preaching secondary implications as if they are the main point is how sermons go sideways. The Big Idea of your sermon should correspond to the main theological claim of the passage — not a supporting detail.`,
        exercise: 'Open Romans 3:21–26. What is the main theological claim? Now list 3 secondary theological truths the passage implies. Which one would you be tempted to preach as the main point? Why might that be a mistake?',
        toolHint: 'Sermon outline — after analysis, look at how the Big Idea in the tool captures the main claim',
      },
      {
        id: 'theo-4',
        title: 'The Big Idea',
        content: `Haddon Robinson called it "the big idea" — one sentence that captures the main theological claim of the passage. It should be: complete (subject + predicate), specific to this passage, and faithful to what the text is actually arguing. A good Big Idea is hard to write — it requires you to have done all the preceding steps. If you can't write one sentence, you haven't understood the passage yet. The Big Idea is not the sermon title; it is the theological core that controls the whole message.`,
        exercise: 'Choose any passage you\'ve studied this week. Write a Big Idea sentence: one complete sentence, theological, specific to this text. Compare it to the "mainTheme" the tool generates. Where do they agree? Where do they differ?',
        toolHint: 'The Big Idea is shown at the top of the Sermon Outline tile — compare yours to the tool\'s analysis',
      },
      {
        id: 'theo-5',
        title: 'Checking Your Theology Against the Text',
        content: `The final step of theological synthesis is the test: does the text require this conclusion? Not "can I support it from this text," but "does this text demand it?" Eisegesis often happens here — a theologian confirms a doctrine from a passage that's really about something else. Every theological conclusion you draw from a passage should be falsifiable by returning to the text. If the conclusion doesn't actually require the text, the text doesn't support it.`,
        exercise: 'Take a theological conclusion you drew from a passage this week. Ask the test: "Does this text require this conclusion?" Re-read the passage looking for evidence that your conclusion is wrong. What do you find?',
        toolHint: 'Eisegesis Flagger — the red warning indicators show where the analysis suggests potential eisegesis',
      },
    ],
    quiz: [
      {
        q: 'What is the organizing theological question for exegesis?',
        options: [
          '"How can I apply this passage to my congregation?"',
          '"What does this passage say about God — his character, action, and relationship with creation?"',
          '"What doctrine does this passage prove?"',
          '"What does this passage tell me about how to live?"',
        ],
        answer: 1,
        explanation: 'Every passage of Scripture teaches something about God. The question "what does this reveal about God?" is the organizing question that keeps you from moralizing or proof-texting.',
      },
      {
        q: 'Biblical theology differs from systematic theology in that:',
        options: [
          'Biblical theology is more reliable because it uses only the Bible',
          'Biblical theology traces how themes develop progressively through the story of Scripture; systematic theology organizes themes across all of Scripture at once',
          'Biblical theology is for academics; systematic theology is for preaching',
          'They are the same thing called by different names',
        ],
        answer: 1,
        explanation: 'Biblical theology follows the plotline; systematic theology organizes by topic. Both are necessary. In exegesis, start with biblical theology — let the passage speak within its own historical moment.',
      },
      {
        q: 'The "Big Idea" of a passage, as Haddon Robinson defined it, should be:',
        options: [
          'A catchy sermon title that summarizes the message',
          'A complete sentence (subject + predicate) capturing the main theological claim',
          'A list of three application points from the passage',
          'A quote from the passage that best summarizes it',
        ],
        answer: 1,
        explanation: 'The Big Idea is one complete theological sentence — not a title, not a list. If you can\'t write one sentence that captures the main claim, you haven\'t finished your exegesis.',
      },
      {
        q: 'What is the danger of preaching a secondary theological implication as if it is the main point?',
        options: [
          'It makes the sermon too long',
          'It causes the congregation to memorize the wrong verse',
          'The sermon\'s logic is disconnected from what the passage is actually arguing — truth, but not this text\'s truth',
          'It violates copyright on other people\'s sermons',
        ],
        answer: 2,
        explanation: 'Secondary implications are true, but preaching them as the main point untethers the sermon from the passage\'s actual argument. The congregation gets biblical truth but not this text\'s truth.',
      },
      {
        q: 'The test "does this text require this conclusion?" is designed to protect against:',
        options: [
          'Preaching a passage out of chronological order',
          'Eisegesis — importing a conclusion into the text rather than drawing it from the text',
          'Over-use of Greek and Hebrew in the pulpit',
          'Spending too long on a single passage',
        ],
        answer: 1,
        explanation: '"Can I support it from this text?" is too weak — eisegesis passes that test. "Does this text require this conclusion?" is the real test. If the text doesn\'t demand it, the text doesn\'t support it.',
      },
      {
        q: 'Reading Genesis 12:1–3 (the Abrahamic covenant) in biblical theology means asking first:',
        options: [
          'What does this teach about personal faith?',
          'How does this relate to justification by faith in Paul?',
          'Where are we in the story? What has happened in Genesis 1–11, and what does God\'s promise do to the narrative now?',
          'Which nations descended from Abraham?',
        ],
        answer: 2,
        explanation: 'Biblical theology asks: where are we in the story? Genesis 12 comes after the catastrophe of Genesis 1–11 (fall, flood, Babel). God\'s promise to Abraham is the beginning of the answer to that catastrophe.',
      },
      {
        q: 'Every passage of Scripture ultimately reveals something about God because:',
        options: [
          'It is a theological convention imposed by biblical scholars',
          'Scripture is God\'s self-disclosure — its purpose is to reveal who God is and what he has done',
          'Only the Psalms and Epistles are directly about God',
          'We can read anything into Scripture if we look hard enough',
        ],
        answer: 1,
        explanation: 'Scripture is not a moral handbook or a history book — it is God\'s self-revelation. Even historical narratives, laws, and genealogies disclose the character, purposes, and faithfulness of God.',
      },
      {
        q: 'What is the relationship between the Big Idea of the passage and the Big Idea of the sermon?',
        options: [
          'They should be completely different — the sermon adapts the passage for today',
          'They should correspond — the sermon\'s controlling idea should be the passage\'s main theological claim',
          'The sermon should have multiple Big Ideas for different audience segments',
          'The Big Idea of the passage becomes the sermon\'s conclusion, not its thesis',
        ],
        answer: 1,
        explanation: 'The sermon\'s controlling idea should correspond to the passage\'s main theological claim. Deviation here means the sermon is not actually from the passage — it\'s inspired by it, which is not the same thing.',
      },
      {
        q: 'Why should you start with biblical theology before moving to systematic theology when exegeting a passage?',
        options: [
          'Systematic theology is less reliable than biblical theology',
          'The systematic categories came later and are less accurate',
          'Starting with systematic categories can flatten a passage into a proof text before you\'ve let it speak in its own historical moment',
          'Systematic theology should never be applied to individual passages',
        ],
        answer: 2,
        explanation: 'Jumping to the systematic category first risks turning the passage into a proof text. Let it speak within its own canonical moment — then connect it to the broader systematic picture.',
      },
      {
        q: 'The Eisegesis Flagger in this tool is most useful in the theological synthesis step because:',
        options: [
          'It translates the passage into plain language',
          'It flags places where your analysis may be reading your conclusions into the text rather than drawing them out',
          'It compares your interpretation to published commentaries',
          'It generates the Big Idea sentence automatically',
        ],
        answer: 1,
        explanation: 'The Eisegesis Flagger watches for interpretive overreach — projection, anachronism, forced application. At the synthesis step, this is the check on whether your theological conclusions are actually required by the text.',
      },
    ],
  },

  {
    slug: 'homiletical-bridge',
    number: 9,
    title: 'Homiletical Bridge',
    subtitle: 'Ancient Meaning, Modern Relevance',
    icon: '✍',
    color: '#80a870',
    lessons: [
      {
        id: 'hom-1',
        title: 'One Meaning, Many Applications',
        content: `A passage has one meaning — what the author intended to communicate to his original audience in that historical context. But it may have many applications — the legitimate ways that one meaning addresses different situations, cultures, and people today. Confusing meaning and application is one of the most common homiletical errors. You don't change the meaning for your audience; you apply the same meaning to their situation. The meaning is the anchor; application is the range.`,
        exercise: 'Open Philippians 4:11 ("I have learned in whatever state I am to be content"). What is the meaning? Now list 3 different applications for 3 different people in your congregation — a struggling single parent, a wealthy businessman, a grieving widow. Same meaning, different applications.',
        toolHint: 'Sermon Draft tile — look at the Applications section to see how the tool bridges meaning to contemporary life',
      },
      {
        id: 'hom-2',
        title: 'The Principalizing Bridge',
        content: `The principalizing bridge moves from the specific historical particulars of a passage to the universal theological principle that underlies them — then applies that principle to the present. Specific situation: Paul tells Timothy to "bring my cloak from Troas" (2 Tim 4:13). Universal principle: God's servants have genuine physical needs and legitimate dependence on the community. Application: the church should care for the material needs of those in ministry. The principle is the bridge.`,
        exercise: 'Open 1 Timothy 5:17–18 (double honor for elders who lead well). Build the bridge: what is the specific historical situation? What is the universal theological principle? What is the contemporary application?',
        toolHint: 'Scholar Chat — ask: "What is the principalizing bridge from 1 Timothy 5:17–18 to a contemporary church?"',
      },
      {
        id: 'hom-3',
        title: 'The Danger of Moralizing',
        content: `Moralizing is making the human characters in a narrative the primary example to follow — or avoid. "Be like Daniel." "Don't be like Jonah." This is not wrong if the text is teaching about human behavior. But it becomes moralizing when it replaces the text's God-centered focus with a human-centered one. Most narrative in Scripture is primarily about what God is doing, not what the human character does. David and Goliath is not primarily about having courage — it's about God delivering his people through an unexpected deliverer.`,
        exercise: 'Open 1 Samuel 17 (David and Goliath). What is the passage primarily about — David\'s courage, or God\'s faithfulness to deliver through an unexpected agent? How does the answer change the sermon\'s focus?',
        toolHint: 'Sermon Draft tile + Scholar Chat — ask the Scholar about the theological center of 1 Samuel 17',
      },
      {
        id: 'hom-4',
        title: 'The Gospel Bridge',
        content: `Every passage of Scripture, rightly applied, should connect to the gospel — the person and work of Jesus Christ. This is not artificial — the whole Bible is moving toward and flows from Christ. An OT passage shows the need, the shadow, or the type that Christ fulfills. An NT epistle grounds ethics in the gospel indicative. A narrative shows God's faithfulness that reaches its ultimate expression in Christ. The gospel bridge is not a tag-on at the end; it is the narrative logic of the whole Bible.`,
        exercise: 'Open Leviticus 16 (the Day of Atonement). Build the gospel bridge: what does this passage make you feel the need of? How does Christ fulfill and surpass what this passage anticipates? Read Hebrews 9:11–14 alongside it.',
        toolHint: 'Cross-Reference strip — see how the Leviticus 16 cross-references point to Hebrews and the NT',
      },
      {
        id: 'hom-5',
        title: 'From Exegesis to Proclamation',
        content: `All the exegetical work — observation, genre, context, grammar, word study, background, intertextual connections, theological synthesis — is preparation. The sermon is not the research paper; it is the proclamation that all the research serves. The congregation should feel the weight of the text, not watch you display your homework. Your job is to take them to the text — to make them feel what it would have felt like to be there, to hear the argument's logic, to feel the theological weight — and then to bring them home to the present moment.`,
        exercise: 'Write a one-paragraph sermon introduction for a passage you\'ve studied this week. Don\'t start with background information. Start with the human condition the text addresses. Draw the listener into the need before you give them the answer.',
        toolHint: 'Sermon Draft tile — look at the Introduction section for structure; customize it in the draft',
      },
    ],
    quiz: [
      {
        q: 'A passage has ___ meaning and ___ applications.',
        options: [
          'Many meanings / one application',
          'One meaning / many applications',
          'No fixed meaning / unlimited applications',
          'One meaning / one application',
        ],
        answer: 1,
        explanation: 'The meaning is what the author intended for his original audience — it is fixed. Applications are the legitimate ways that meaning addresses different contemporary situations. The meaning anchors; applications flow from it.',
      },
      {
        q: 'The "principalizing bridge" moves from:',
        options: [
          'The Greek text to the English translation',
          'The specific historical particulars to the universal theological principle, then to contemporary application',
          'The Old Testament to the New Testament',
          'The academic commentary to the popular application',
        ],
        answer: 1,
        explanation: 'Specific historical situation → universal theological principle → contemporary application. The principle is the bridge that allows the ancient text to speak to the present without losing its meaning.',
      },
      {
        q: '"Moralizing" in preaching means:',
        options: [
          'Preaching on the topic of morality',
          'Making human characters the primary example while missing the passage\'s God-centered focus',
          'Applying the text too directly to contemporary ethics',
          'Over-emphasizing Old Testament law in a New Testament church',
        ],
        answer: 1,
        explanation: 'Moralizing replaces "here\'s what God did" with "here\'s what this human character did — be like them." Most biblical narrative is primarily about God, not about the human characters as moral examples.',
      },
      {
        q: 'David and Goliath (1 Samuel 17) is primarily a passage about:',
        options: [
          'The importance of individual courage and faith',
          'God delivering his people through an unexpected, unlikely agent',
          'The superiority of skill and preparation over brute strength',
          'The danger of pride in leaders like Saul',
        ],
        answer: 1,
        explanation: 'The story is about God\'s faithfulness to deliver Israel through a shepherd boy when the king and army failed. Preaching "be courageous like David" turns the protagonist into a moral example and misses the theological center.',
      },
      {
        q: 'The gospel bridge in preaching is:',
        options: [
          'An optional addition for evangelistic sermons only',
          'The narrative logic connecting every passage to the person and work of Christ',
          'A quote from John 3:16 added to the end of every message',
          'Reserved for passages in the New Testament',
        ],
        answer: 1,
        explanation: 'The gospel bridge is not a tag-on — it is the narrative logic of the whole Bible. Every passage exists on the trajectory toward or from Christ. OT passages show the need or shadow; NT passages show the fulfillment.',
      },
      {
        q: 'The purpose of all the exegetical work (observation, genre, context, grammar, etc.) is:',
        options: [
          'To prove the preacher has done adequate preparation',
          'To produce a research paper that can be published',
          'To serve the proclamation — to take the congregation into the weight and life of the text',
          'To satisfy seminary or church requirements for sermon preparation',
        ],
        answer: 2,
        explanation: 'Exegesis is preparation, not the goal. The goal is proclamation — taking the congregation into the text so they feel its weight, hear its logic, and encounter God. You don\'t display your homework; you do it so they don\'t have to.',
      },
      {
        q: 'The "meaning" of a passage is:',
        options: [
          'What the passage means to me personally',
          'What the passage meant in the original language',
          'What the author intended to communicate to his original audience',
          'What the church has traditionally said the passage means',
        ],
        answer: 2,
        explanation: 'Meaning is authorial intent — what the human author (under divine inspiration) intended to communicate to his original audience. This is fixed. Application is flexible; meaning is not.',
      },
      {
        q: 'How does recognizing the Day of Atonement (Leviticus 16) as a type help you preach it?',
        options: [
          'It lets you skip the OT passage and only preach Hebrews 9',
          'It shows that the passage is no longer relevant for Christians',
          'It allows you to build the gospel bridge — showing what the passage creates need for, and how Christ surpasses it',
          'It proves the Levitical system was ineffective',
        ],
        answer: 2,
        explanation: 'Typology creates the gospel bridge. Leviticus 16 makes you feel the weight of the need for atonement; Hebrews 9 shows how Christ fulfills and surpasses the type. Preaching the type deepens the antitype.',
      },
      {
        q: 'A good sermon introduction should:',
        options: [
          'Begin with the historical background of the passage',
          'Start with the human condition the text addresses — drawing the listener into need before giving the answer',
          'Open with the Big Idea so the congregation knows where the sermon is going',
          'Begin with a three-point outline of what will be covered',
        ],
        answer: 1,
        explanation: 'The best introductions create need before they supply the answer. They make the congregation feel why this passage matters to them before explaining what it says.',
      },
      {
        q: 'Paul telling Timothy "bring my cloak from Troas" (2 Tim 4:13) can be applied today through the principle that:',
        options: [
          'Christians should keep warm in cold weather',
          'God\'s servants have genuine material needs and legitimate dependence on the community',
          'All requests from apostles should be honored immediately',
          'The church should preserve historical artifacts from the apostolic period',
        ],
        answer: 1,
        explanation: 'The specific historical particular (a cloak in Troas) yields a universal principle (God\'s servants have genuine human needs; community should care for them). That principle applies in every century.',
      },
    ],
  },

  {
    slug: 'eisegesis-guard',
    number: 10,
    title: 'Eisegesis Awareness',
    subtitle: 'Guard the Text',
    icon: '⚑',
    color: '#c05050',
    lessons: [
      {
        id: 'eis-1',
        title: 'What Eisegesis Is',
        content: `Exegesis means to "lead out" — drawing the meaning out of the text. Eisegesis means to "lead into" — reading your own meaning into the text. Eisegesis is not always malicious; often it's unconscious. You come to the text with your theology, your preferences, your experiences, and your culture — and you see what you expected to see, not what's there. The discipline of exegesis is the perpetual effort to let the text challenge and correct your pre-existing beliefs, not confirm them.`,
        exercise: 'Choose a "favorite" passage you know well. Ask: what do I expect this passage to say? Now read it slowly as if for the first time. Is there anything in the text that doesn\'t fit your expectation? That\'s the place to pay attention.',
        toolHint: 'Eisegesis Flagger — always running; red indicators flag potential interpretive overreach',
      },
      {
        id: 'eis-2',
        title: 'Three Common Forms of Eisegesis',
        content: `Anachronism: reading modern concepts back into ancient texts (e.g., reading individualistic self-actualization into "I can do all things through Christ"). Projection: reading your own situation into the text and then claiming the text says what you need it to say. Forced typology: making everything point to Christ when the text doesn't require it — turning a coincidental detail into a theological pattern. All three produce sermons that are sincere but untrue to the text.`,
        exercise: 'Find 3 popular Bible verses that are frequently misused through anachronism or projection. What does each verse actually say in context? What is the popular reading projecting into it?',
        toolHint: 'Eisegesis Flagger + Scholar Chat — ask the Scholar to evaluate your interpretation for anachronism',
      },
      {
        id: 'eis-3',
        title: 'The Authority Test',
        content: `One of the most clarifying questions in hermeneutics: "Does the text require this interpretation?" Not "can I make this text support it" — you can make almost any text support almost any position if you ignore context. The question is whether the text demands this reading. A faithful interpretation is one that the text itself necessitates. If another plausible reading exists that the text equally or better supports, your interpretation is not yet certain.`,
        exercise: 'Take an interpretation you\'ve heard from a pulpit or read in a commentary. Ask: does the text actually require this? What alternative readings exist? What would you have to ignore or minimize in the text to hold the popular interpretation?',
        toolHint: 'Scholar Chat — ask the Scholar to present alternative interpretations of a passage you\'re studying',
      },
      {
        id: 'eis-4',
        title: 'Cognitive Biases That Distort Interpretation',
        content: `Confirmation bias: you find what you were looking for. Availability bias: you interpret the text through the lens of your most vivid recent experience. In-group bias: you interpret "us" as your group and "them" as your opponents. Affect heuristic: you read passages that feel good as correct, and resist passages that challenge you. These are not signs of bad faith — they are features of human cognition that disciplined exegesis must consciously resist.`,
        exercise: 'For a passage you find challenging or uncomfortable, ask: am I resisting this reading because the text actually doesn\'t support it, or because it challenges something I prefer to believe? Be honest.',
        toolHint: 'Eisegesis Flagger + Scholar Chat — use the Scholar as a check on your own confirmation bias',
      },
      {
        id: 'eis-5',
        title: 'Humility and the Open Posture',
        content: `The final word in eisegesis awareness is not technique — it is posture. The exegete who is most protected against eisegesis is the one who comes to the text asking "what does God say?" rather than "what does God say to confirm what I already believe?" This is a spiritual disposition before it is a hermeneutical method. The 10 skills in this academy are worthless without the posture of submission to the text as God's authoritative word. The text is not your resource; you are its servant.`,
        exercise: 'Before your next study session, pray before you open the text: "God, show me what is here, including what I don\'t want to see." Then write down one thing the passage challenged in your existing beliefs or preferences.',
        toolHint: 'The entire tool is designed to help you see more of the text than you\'d see alone — use it with humility',
      },
    ],
    quiz: [
      {
        q: 'Eisegesis means:',
        options: [
          'Drawing the meaning out of the text',
          'Reading your own meaning into the text',
          'Studying the text in the original language',
          'Applying the text to contemporary life',
        ],
        answer: 1,
        explanation: '"Eisegesis" = "lead into." Exegesis = "lead out." The difference is whether you are discovering the author\'s meaning or importing your own. Both can feel identical from the inside.',
      },
      {
        q: 'Reading Philippians 4:13 ("I can do all things through Christ") as a promise for career success or athletic achievement is an example of:',
        options: [
          'Valid application of a universal promise',
          'Anachronism — reading modern individualistic self-achievement into Paul\'s statement about contentment',
          'Sound exegesis confirmed by the immediate context',
          'Typological interpretation',
        ],
        answer: 1,
        explanation: 'The verse is about contentment in all circumstances — explicitly stated in 4:11–12. Reading career ambition into it is anachronism: importing a modern, individualistic achievement framework into Paul\'s ancient text.',
      },
      {
        q: 'The "authority test" in hermeneutics asks:',
        options: [
          '"Which church authority confirms this interpretation?"',
          '"Does the text actually require this interpretation, or can I just make it support it?"',
          '"Is this interpretation from a recognized scholar?"',
          '"Did the early church fathers hold this view?"',
        ],
        answer: 1,
        explanation: '"Does the text require this?" is the right question. You can make almost any text "support" almost any view with selective reading. The question is whether the text demands your interpretation.',
      },
      {
        q: '"Projection" as a form of eisegesis means:',
        options: [
          'Using PowerPoint slides in your sermon',
          'Reading your own situation into the text and then claiming the text says what you need it to say',
          'Applying the text to the future rather than the present',
          'Over-emphasizing the prophetic dimension of a passage',
        ],
        answer: 1,
        explanation: 'Projection is using your own circumstances, needs, or anxieties as the lens through which you read the text — and then claiming the text speaks to your situation when you actually imposed that situation on it.',
      },
      {
        q: 'Confirmation bias in Bible study means you are likely to:',
        options: [
          'Confirm your interpretation by checking multiple commentaries',
          'Unconsciously find in the text what you already believed before you read it',
          'Over-confirm historical details with archaeological evidence',
          'Agree too quickly with other people\'s interpretations',
        ],
        answer: 1,
        explanation: 'Confirmation bias leads you to see what you expected to see. You read the text and find what you already believed — which can feel like exegesis but is actually eisegesis.',
      },
      {
        q: 'Forced typology occurs when:',
        options: [
          'You see Christ in every OT passage',
          'You connect an OT passage to Christ when the text doesn\'t actually require or support that connection',
          'You preach the OT without mentioning Jesus',
          'You apply NT typological methods to the Psalms',
        ],
        answer: 1,
        explanation: 'Not every OT detail points to Christ typologically. Forced typology turns coincidental details or general themes into deliberate patterns when the text doesn\'t require it — turning coincidence into fabricated symbolism.',
      },
      {
        q: 'What is the most important disposition that protects against eisegesis?',
        options: [
          'Academic rigor and mastery of the original languages',
          'Having the right commentary library',
          'Coming to the text with submission — "what does God say?" rather than "what confirms what I believe?"',
          'Extensive seminary training',
        ],
        answer: 2,
        explanation: 'Technique alone doesn\'t protect against eisegesis. The posture of submission — coming to the text to hear God rather than to confirm yourself — is the spiritual foundation beneath all the hermeneutical skills.',
      },
      {
        q: 'If another plausible reading of a passage exists that the text equally or better supports:',
        options: [
          'Your interpretation is wrong and must be abandoned',
          'Your interpretation is not yet certain — you should hold it more tentatively and investigate further',
          'Both interpretations are equally valid and you can choose either',
          'You should consult the church\'s official position',
        ],
        answer: 1,
        explanation: 'The existence of an equally or better supported alternative reading doesn\'t make your interpretation wrong — it makes it uncertain. Epistemic humility means holding uncertain interpretations with appropriate tentativeness.',
      },
      {
        q: 'The Eisegesis Flagger in this tool is designed to:',
        options: [
          'Catch grammatical errors in your sermon notes',
          'Flag places where the analysis may be reading conclusions into the text rather than out of it',
          'Compare your interpretation to the official church position',
          'Alert you when a passage is theologically controversial',
        ],
        answer: 1,
        explanation: 'The Eisegesis Flagger watches for interpretive overreach — projection, anachronism, forced typology — and flags it with a warning indicator so you can re-examine your conclusions.',
      },
      {
        q: 'The 10 skills in this academy are most effective when practiced with:',
        options: [
          'A fast exegetical method that produces results quickly',
          'The right software and reference tools',
          'The spiritual posture of submission — coming to the text as its servant, not its master',
          'Daily Greek and Hebrew vocabulary review',
        ],
        answer: 2,
        explanation: 'Skills are tools. Tools are only as good as the craftsman\'s posture. The exegete who comes to the text asking "what does God say?" — willing to be challenged — is the one all 10 skills serve most effectively.',
      },
    ],
  },
]

// ── Progress types ──────────────────────────────────────────────────────────────

export interface SkillProgress {
  lessonsCompleted: string[]
  quizPassed: boolean
  quizBestScore: number
  quizAttempts: number
  passedAt?: string
}

export interface AcademyProgress {
  skills: Record<string, SkillProgress>
  totalXp: number
  startedAt: string
}

export const LEVEL_THRESHOLDS = [
  { slug: 'newcomer',  label: 'Newcomer',       skills: 0  },
  { slug: 'apprentice',label: 'Apprentice',      skills: 3  },
  { slug: 'student',   label: 'Student',         skills: 5  },
  { slug: 'journeyman',label: 'Journeyman',      skills: 8  },
  { slug: 'exegete',   label: 'Exegete',         skills: 10 },
]

export const PASS_THRESHOLD = 0.8  // 80% — 8/10
export const LESSON_XP      = 15
export const QUIZ_PASS_XP   = 100

export function getAcademyProgress(): AcademyProgress {
  try {
    const raw = localStorage.getItem('academy-progress')
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return { skills: {}, totalXp: 0, startedAt: new Date().toISOString() }
}

export function saveAcademyProgress(p: AcademyProgress) {
  localStorage.setItem('academy-progress', JSON.stringify(p))
}

export function getSkillProgress(p: AcademyProgress, slug: string): SkillProgress {
  return p.skills[slug] ?? {
    lessonsCompleted: [],
    quizPassed: false,
    quizBestScore: 0,
    quizAttempts: 0,
  }
}

export function getLevel(skillsPassed: number): typeof LEVEL_THRESHOLDS[number] {
  let level = LEVEL_THRESHOLDS[0]
  for (const t of LEVEL_THRESHOLDS) {
    if (skillsPassed >= t.skills) level = t
  }
  return level
}
