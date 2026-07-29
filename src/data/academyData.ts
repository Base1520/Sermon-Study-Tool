// Exegesis Academy — skill tree, lessons, and quiz data
//
// Teaching rules this file obeys:
//   1. Method first, tool second. Every lesson is true for someone holding a paper Bible.
//   2. Every exercise is doable with just a Bible.
//   3. No scholar, commentator, author, or book is named. Positions and traditions may be.
//   4. Every technical term is defined in the sentence it appears in.
//   5. Quiz questions test whether the reader can DO the skill on a passage, not whether
//      they can repeat the lesson's wording.
//
// Lesson `content` uses blank lines between paragraphs. The renderer splits on them.

export interface Lesson {
  id: string
  title: string
  content: string       // the teaching
  exercise: string      // what to do with a Bible right now
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
        content: `Most people open a Bible and ask "what does this mean for me?" within about eight seconds. That question is not wrong. It is out of order.

Observation is describing before deciding. You catalogue what is actually on the page — who is there, what they do, what words repeat, how the sentences connect — before you rule on what any of it means.

Here is why the order matters. Two people read the same paragraph. One has seen four things in it. The other has seen twenty-five. The one who saw four will fill the empty space with what he already believed, and he will not know he did it. He will experience that as insight. Careful seeing is not a slow warm-up to study. It is the thing that keeps study honest.

The test of a real observation is boring and checkable: could someone who disagrees with you theologically verify every item on your list by pointing at the page? "The word grace appears four times in five verses" passes. "This passage is about God's unconditional love" does not — that is a conclusion, and it may be a good one, but it is not something you saw.

Slow is the whole technique. There is no shortcut and no substitute, and the people who study well are almost never smarter than you. They just looked longer.`,
        exercise: 'Take Colossians 3:1-4. On a blank sheet, write twelve things that are literally in those four verses — people, actions, locations, repeated words, time references, connecting words. Stop before you write anything about what it means. If you run dry at eight, keep sitting there; the second half is where the passage opens.',
        toolHint: 'Phrasing Diagram — read the raw clauses in order before you look at any analysis',
      },
      {
        id: 'obs-2',
        title: 'Read It Until It Is Familiar, Then Keep Reading',
        content: `The highest-return habit in Bible study costs nothing and requires no training: read the passage many times before you read anything about it.

Not two or three times. Ten, over several days. The first readings only get you to familiar. Familiar is where most people stop, and familiar is exactly the state in which you stop noticing things.

Four ways to break familiarity, all free:

Read it out loud. These texts were written to be read aloud to a room; almost none of the original audience read them silently to themselves. Hearing the sentence makes the emphasis and the repetition surface on their own.

Read the whole book in one sitting, at least once. Most biblical books take under an hour. A letter you have only ever met in fragments becomes a single argument the moment you hear it end to end.

Read a second translation. Some translations track the original word order and sentence structure closely; others smooth it into natural English. Where two good translations diverge, a translator had to make a judgment call — and every one of those spots is a real question hiding in plain sight.

Write it out by hand. Copying forces you through every word at the speed of your pen. People routinely find in the fourth line of a handwritten copy what they missed in ten readings.

None of this is piety. It is how you get more data before you start reasoning.`,
        exercise: 'Pick a chapter you think you know well. Read it aloud, slowly, twice. Then write out the first five verses by hand. Write down every single thing you noticed that you had never noticed before — including things that seem trivial. Trivial is where this starts.',
      },
      {
        id: 'obs-3',
        title: 'The Five Questions, Worked',
        content: `Who, what, where, when, and how or why. These are not a clever trick. They are the basic categories of human communication, and writers answer them in every sentence whether they mean to or not.

Work them on Mark 2:1-12, the paralyzed man let down through a roof.

Who: Jesus, a crowd that fills the house and blocks the door, four men carrying a fifth, and scribes — Jewish legal experts trained in the law — who are described as sitting there.

What: the four dig through a roof and lower the man. Jesus says his sins are forgiven. The scribes object silently. Jesus answers what they were thinking and heals the man.

Where: a house in Capernaum, a fishing town on the Sea of Galilee. Inside is packed; the roof is reachable.

When: after Jesus has already become known enough to draw a crowd that big.

How and why: they got him in by destroying part of someone's roof. And here is the sentence the whole paragraph turns on — the narrator says Jesus saw "their" faith. Plural. Not the paralyzed man's alone.

Notice what happened. The five questions did not produce a devotional thought. They produced a specific, checkable observation — a plural pronoun — and that observation is now the thing you have to interpret. That is the job. Observation does not answer the interpretive question. It finds it.`,
        exercise: 'Run all five questions on Luke 7:36-50 (the woman at the Pharisee\'s dinner) using only the text. Write the answers out. Then circle the one observation that you think creates the biggest interpretive question — and write that question down as a question, not an answer.',
      },
      {
        id: 'obs-4',
        title: 'Six Patterns Worth Circling',
        content: `Once you are looking, look for these six. They account for most of what a writer does deliberately.

Repetition. Repeated words, images, or ideas in a short space are almost always the emphasis. In John 15, one word for staying attached to the vine lands about ten times in seventeen verses. That is not style. That is the point, stated over and over.

Contrast. Watch for "but," "yet," "rather," "instead," and for paired opposites — light and darkness, flesh and Spirit, wise and foolish. Contrast tells you what the writer is arguing against, which usually tells you why he is writing.

Comparison. "Like," "as," "just as ... so also." A comparison always has a point of resemblance and a limit. Find both.

Cause and effect. "Because," "therefore," "so that," "for this reason." These carry the logic. Mark them all before you do anything else with a paragraph.

Conditionals. "If ... then." A conditional makes a claim about a relationship, not a promise about an outcome. Note precisely what is being conditioned on what.

Lists and their order. When a writer lists, the order is rarely random, and the last item often carries the weight.

One caution on repetition. English translations sometimes vary a word for style. If a word looks repeated in your translation but not in another, that is a flag to check, not proof either way — and a footnote or a concordance settles it in a minute.`,
        exercise: 'Take Romans 5:1-5. Mark every cause-and-effect word, then draw the chain: what produces what, in what order, ending where? Then do the same for 1 John 1:5-10 and mark every contrast pair. You should end with two very different-looking diagrams from two very different arguments.',
        toolHint: 'Phrasing Diagram — the connecting words are the joints; the diagram makes the chain visible',
      },
      {
        id: 'obs-5',
        title: 'What Is Missing, and What Is Odd',
        content: `Trained readers notice absences. This is the hardest observation skill and the most valuable one.

Three things to watch for.

The withheld verdict. Biblical narrators frequently report an act and decline to say whether it was right. When a narrator refuses to comment, that refusal is information. Do not supply a verdict he withheld — record that he withheld it, and ask why.

The unresolved ending. The book of Jonah ends with God asking a question and Jonah never answering. The account of the older brother at the end of the lost-son parable stops with him standing outside in the dark while his father pleads. Nothing is reported about what he decided. That gap is not a manuscript problem. It is a device: the question is left standing so it lands on the reader.

The detail that does not pull its weight. When a writer spends words on something that seems unnecessary, he is telling you it is necessary. In 1 Kings 18, a man tells Elijah that a hundred prophets are alive and hidden in two caves — and a few verses later Elijah says, out loud, "I alone am left." The narrator does not correct him. He does not need to. He already gave you the correction, and now he is letting you watch a man say something false and sincere at the same time.

The general rule: a writer's silence is a choice. Log it.`,
        exercise: 'Read 2 Samuel 11 (David and Bathsheba) straight through and list every place the narrator could have told you what he thought and did not. Then read the last verse of the chapter. Where does the narrator finally speak — and what does the delay accomplish?',
      },
      {
        id: 'obs-6',
        title: 'Observation vs. Interpretation',
        content: `Mixing these two is how honest people talk themselves into things.

An observation is a report of what is on the page. An interpretation is a claim about what it means. Both are necessary. The failure is calling an interpretation an observation, because the moment you do, you stop looking — you have already reached the payoff.

Sort these four notes on a single passage:

"Paul uses the word for grace four times in five verses." Observation. Countable.

"Verse 8 begins with 'for,' connecting it back to verse 7." Observation. It is right there.

"This passage teaches that salvation is entirely God's work." Interpretation. Possibly correct, and it required reasoning.

"This is why we should stop trying to earn God's approval." Application. Two steps past observation.

Keep two columns while you study. Left column: what it says. Right column: what I think it means. The right column is allowed to be full of your best thinking — as long as it is in the right column.

You will notice something the first time you do this: the left column is specific and the right column is broad. That is the normal shape. When your right column starts making claims your left column cannot support, you have found the crack in your reading before anyone else did.`,
        exercise: 'Take Ephesians 2:8-10. Write five items in an observation column and five in an interpretation column. Then check each interpretation against the observations: which specific line on the left forced the line on the right? Any interpretation with nothing under it is a guess wearing a suit.',
        toolHint: 'Eisegesis Flagger — it watches for the same failure at the analysis level',
      },
      {
        id: 'obs-7',
        title: 'The Drill: Thirty on Three',
        content: `Here is the drill that makes this real. Take three verses. Write thirty observations.

Not three verses and thirty thoughts. Thirty items you could point at.

The first ten come easily and they are the obvious ones. The second ten are work. The last ten are where the passage actually opens, because by then you have exhausted everything you brought with you and you are finally reading what is there.

Worked on Ruth 1:16-17, where Ruth refuses to leave Naomi. A partial list:

She answers a command with a refusal. She uses the word "urge" — Naomi has been pressing her. She names four things she will follow: going, lodging, people, God. The order runs from physical to national to religious. "Your people shall be my people" comes before "your God my God." She commits to being buried there — she is talking about the end of her life, not the next few weeks. She swears an oath using the covenant name of God. The oath is self-maledictory: she calls down harm on herself if she breaks it. The speech is poetic, with paired lines. She never mentions a husband, or children, or provision. Naomi's reply is not recorded in these verses at all.

That is ten from two verses without a single interpretive claim. And notice that the last three — the oath form, the missing subject, the missing reply — are the ones that make you sit up.

Do this five times on five passages and your reading permanently changes speed.`,
        exercise: 'Pick any three consecutive verses you have never studied. Write thirty observations. Give yourself twenty-five minutes and do not stop early. Then write down the single question those thirty observations most insist you answer.',
      },
    ],
    quiz: [
      {
        q: 'A reader writes four notes on Mark 2:1-5, where four men lower a paralyzed man through a roof. Which one is an observation rather than an interpretation?',
        options: [
          'The four friends show a persistence every believer should imitate',
          'The narrator says Jesus saw "their" faith — plural, not the paralyzed man\'s alone',
          'This teaches that a community\'s faith can carry someone who cannot come himself',
          'Jesus was frustrated that the crowd had blocked the door',
        ],
        answer: 1,
        explanation: 'A plural pronoun is on the page and anyone can check it. The other three are conclusions drawn from it — one of them may even be right, but none of them is something you saw.',
      },
      {
        q: 'What is the strongest test that a list of study notes is genuinely observation and not interpretation in disguise?',
        options: [
          'Every item is written as a complete sentence',
          'The items are drawn only from the verses under study, not the surrounding chapter',
          'Someone who disagreed with you theologically could verify every item by pointing at the page',
          'Every item connects to a doctrine you can name',
        ],
        answer: 2,
        explanation: 'Observation is checkable by anyone regardless of what they believe. The moment an item requires agreeing with your theology, it has become a conclusion.',
      },
      {
        q: 'You notice a word repeated seven times in your translation. A friend\'s translation uses that word three times and a synonym four times. What should you conclude?',
        options: [
          'Your translation is inaccurate and the repetition is not really there',
          'The repetition may well be real in the original — check before you build on it, since translations sometimes vary a word for style',
          'Repetition only counts if every major translation renders it identically',
          'The synonym proves the author was deliberately varying his vocabulary',
        ],
        answer: 1,
        explanation: 'Translators sometimes vary wording for readability. A mismatch between translations is a signal to check a footnote or a concordance, not evidence either way.',
      },
      {
        q: 'A narrative reports that a character does something significant, and the narrator never says whether it was right or wrong. The disciplined observation is:',
        options: [
          'Record that the narrator declines to comment, and treat the silence as deliberate',
          'Assume the act was approved, since it is included in Scripture',
          'Assume the act was condemned, since the narrator did not praise it',
          'Look for a moral verdict elsewhere and read it back into this scene',
        ],
        answer: 0,
        explanation: 'Biblical narrators withhold verdicts on purpose. Supplying one is the reader adding to the text. Logging the silence is the observation — and it is usually a live question worth chasing.',
      },
      {
        q: 'In John 4, the narrator notes the time of day and shows the woman coming to the well alone. Which observation question does that detail answer, and why log it?',
        options: [
          'Where — it tells you the well was outside the town',
          'Who — it identifies her as a Samaritan',
          'When — and time-of-day details in narrative are almost always doing work, not filling space',
          'Why — it explains that Jesus was thirsty',
        ],
        answer: 2,
        explanation: 'It answers "when." Narrators do not spend words on the clock for atmosphere. A timing detail is a flag — you may not yet know what it means, and that is fine; you log it and carry it.',
      },
      {
        q: 'Read this sentence: "We rejoice in our sufferings, because suffering produces endurance, and endurance produces character." Which observation is the most useful next step?',
        options: [
          'The passage uses the word "suffering" twice',
          'The word "because" starts a chain: suffering leads to endurance leads to character — the relationships are stated, not implied',
          'Rejoicing is commanded here',
          'The passage is about how Christians should feel during hardship',
        ],
        answer: 1,
        explanation: 'Counting words is a real observation but a shallow one here. The connecting word makes an explicit causal chain visible, and the chain is what the writer is actually asserting.',
      },
      {
        q: 'You have read a passage four times and stopped noticing anything new. The best next move is:',
        options: [
          'Move on — you have exhausted what is there',
          'Open a commentary and let it tell you what you missed',
          'Change the mode of reading: read it aloud, in a second translation, or copy it out by hand',
          'Skip to writing your application, since the observation stage is finished',
        ],
        answer: 2,
        explanation: 'You have not run out of text; you have gone familiar. Changing the input channel — ear instead of eye, pen instead of screen, different rendering — restarts noticing without adding a single outside source.',
      },
      {
        q: 'A writer lists three things in a row and the third is described at twice the length of the first two. What have you observed?',
        options: [
          'Nothing significant — list lengths are arbitrary',
          'The third item is likely emphasized; proportion is one of the ways a writer signals weight',
          'The first two items are more important because they came first',
          'The list is probably a later addition to the text',
        ],
        answer: 1,
        explanation: 'How many words a writer spends is a deliberate choice. Disproportion is one of the plainest emphasis signals available to a reader with no training and no tools.',
      },
      {
        q: 'Which of these belongs in the "observation" column and not the "interpretation" column?',
        options: [
          'The paragraph is about the sufficiency of Christ',
          'Verse 8 opens with "for," tying it back to the statement in verse 7',
          'The author is correcting a legalistic error in the church',
          'This should change how we approach Sunday worship',
        ],
        answer: 1,
        explanation: 'A connecting word and what it attaches to are visible on the page. The other three are, in order, a theological conclusion, a reconstruction of the situation, and an application — all legitimate later, none of them observation.',
      },
      {
        q: 'The "thirty observations on three verses" drill is designed to work because:',
        options: [
          'Thirty is the number of details in an average biblical paragraph',
          'The last third of the list is where you run out of what you brought with you and start reading what is on the page',
          'It trains you to write faster',
          'Long lists are more persuasive when you teach the passage',
        ],
        answer: 1,
        explanation: 'The first ten observations come from memory and habit. The exercise only starts working when those are spent — which is exactly the point at which most people quit.',
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
        content: `You already read by genre without thinking about it. You read a stop sign, a court summons, a love letter, and a joke by four different sets of rules, and you switch between them instantly. Nobody reads a poem looking for the terms and conditions.

Genre is the unspoken contract between a writer and a reader about how meaning will be delivered. Get the contract wrong and you will read carefully, reason correctly, and arrive at a confident wrong answer.

The Bible is not one kind of book. It is a library containing at least eight: narrative (story), law (covenant terms and case rulings), poetry, wisdom, prophecy, gospel, epistle (letter), and apocalyptic (heavily symbolic visionary writing given to people under pressure).

Here is what happens when you use the wrong rules. A prophet writes that the mountains will melt and the stars will fall. Read as a weather report, that is a prediction about geology. Read as prophecy — where cosmic collapse is the standard, well-worn way of announcing that a nation's world is about to end — it is a judgment oracle against a specific empire, and the original hearers understood it immediately. The words are the same. The rules are not.

So your second question, right after "what does it say," is "what kind of writing is this." You answer it before you interpret a single line.`,
        exercise: 'Without looking anything up, name the genre of each: Psalm 23, Romans 8, Genesis 22, Proverbs 22:6, Revelation 13, Leviticus 19, Luke 15. Then for each one, write a single sentence: "Because this is ___, I have to read it by asking ___."',
        toolHint: 'Canonical Context tile — the genre tag names both the genre and the subgenre',
      },
      {
        id: 'gen-2',
        title: 'Narrative: The Storyteller Is Arguing',
        content: `Roughly two-fifths of the Bible is story, and a story makes its case differently than an argument does. It does not tell you the point. It builds the point out of scene, pace, and what it chooses to show you.

Four tools a biblical narrator uses, all of which you can spot without training:

Selection. He tells you some things and not others. Whole decades vanish in a sentence; a single conversation gets forty verses. What he slows down for is what he wants you to watch.

Point of view. Sometimes you are told what a character is thinking, and sometimes you are locked outside. Being let into one character's head and not another's is a decision, and it shapes your sympathies on purpose.

Repetition and pattern. When a scene happens three times with one thing changed, the change is the message.

Three levels of speech, with three different weights. What the narrator says is reliable — he is the trustworthy voice in the room. What God says in the story carries full authority. What a character says is accurately reported but not necessarily true. This one distinction solves an enormous number of problems. Job's friends speak for thirty chapters, they are quoted exactly, and God says at the end that they were wrong. The Bible records their words faithfully. It does not endorse them.

And the standing warning: the human characters are usually not the point. A story about God rescuing people through a flawed man is not primarily a story about the man.`,
        exercise: 'Read Genesis 22:1-19. Mark every place the narrator slows down (extra detail, dialogue, repeated phrase) and every place he speeds up. Then answer two questions from the text alone: whose thoughts are you given, and whose are you refused? What does that do to you as you read?',
      },
      {
        id: 'gen-3',
        title: 'Law: Covenant Terms, Not a Rulebook',
        content: `Law is the genre modern readers handle worst, usually because they read it as an arbitrary list.

Two forms. Absolute commands state a flat obligation: "You shall not steal." Case rulings work differently: "If a man does X in situation Y, then Z." Ancient legal collections were not exhaustive codes covering every possibility. They were representative rulings — sample cases that show judges the shape of justice so they can rule on the thousand cases the list never mentions. That is why the laws feel oddly specific. They are worked examples.

This changes how you read. When you meet a strange case ruling, do not ask only "what does this require?" Ask "what does this protect, and who does it protect?" A rule about a dangerous ox that gores someone is teaching liability for known risk. A rule about not taking a poor man's cloak overnight as collateral is protecting the one person in the transaction who has no leverage. The specifics are ancient. The thing being protected is not.

And note the frame. At Sinai, God's opening line before a single command is the reminder that he already brought them out of Egypt. Rescue comes first, then terms. Law in the Bible is never how you get into the relationship; it is how you live inside one you were already given. Reading the commands without the preamble turns a covenant into a performance review.`,
        exercise: 'Read Deuteronomy 24:10-22 — a run of short case rulings. For each one, write down: what specific act is regulated, and who is being protected by it. Then write one sentence naming the value the whole cluster is defending.',
      },
      {
        id: 'gen-4',
        title: 'Poetry: How Hebrew Verse Actually Works',
        content: `Hebrew poetry does not rhyme and does not have a fixed meter. It works by pairing lines. That is the engine, and once you see it you can never unsee it.

The second line of a pair does one of three things, and telling them apart is the whole skill.

It echoes and sharpens. "The heavens declare the glory of God; the sky above proclaims his handiwork." The second line restates the first, but it narrows the image and adds specificity. The second line is almost never a mere repeat — it usually intensifies.

It contrasts. "The LORD knows the way of the righteous, but the way of the wicked will perish." The pair works by opposition, and the contrast is the argument.

It extends. The second line takes the first somewhere new — completing a thought, giving a reason, or escalating.

Watch escalation work in Psalm 1:1. The man does not walk in the counsel of the wicked, nor stand in the way of sinners, nor sit in the seat of scoffers. Three verbs: walking, standing, sitting — passing by, stopping, settling in. Three groups: wicked, sinners, scoffers — bad, worse, hardened. Three postures of increasing commitment paired with three stages of increasing corruption. The verse is a slow-motion picture of how a person sinks, built entirely out of parallel lines.

One discipline with poetic images: every metaphor has a point of comparison and a limit. "The LORD is my shepherd" says something about provision, guidance, and protection. It does not say the psalmist is livestock destined for market. Find the point; do not press past it.`,
        exercise: 'Take Psalm 23 and mark each pair of lines. For every pair, label it echo, contrast, or extension. Then find the one place where the imagery changes completely mid-psalm, and ask what that shift is doing.',
        toolHint: 'Phrasing Diagram — the line pairs stack visibly once the clauses are laid out',
      },
      {
        id: 'gen-5',
        title: 'Wisdom: A Proverb Is Not a Promise',
        content: `Wisdom literature observes how life generally goes under God's ordering of the world. That is its genre, and the whole genre collapses if you read it as guarantee.

"Train up a child in the way he should go, and when he is old he will not depart from it" is a true generalization about the power of formation. Read as a promise with no exceptions, it becomes a weapon that tells every grieving parent of a wayward adult child that they failed. That reading is not more faithful to the text. It is a genre error with a body count.

Proverbs are compressed, memorable, situation-dependent, and often deliberately in tension with each other. Two consecutive verses tell you not to answer a fool according to his folly, and then to answer a fool according to his folly. That is not a contradiction to be resolved. That is wisdom saying: this takes discernment; read the situation.

Here is the genre's best-kept secret. The wisdom books argue with each other on purpose. One book states the rule that the righteous flourish. Another gives you an entire book about a righteous man whose life is destroyed, whose friends apply the rule to him, and who is vindicated while they are rebuked. A third book spends twelve chapters on the fact that the same end comes to the wise and the fool, and that much of life is vapor you cannot hold. The canon puts all three in your hands together. The rule, the exception, and the limit are the complete teaching.

So when you handle a proverb, ask: is this always true, usually true, or true in the right situation? And never hand a generalization to a suffering person as a certainty.`,
        exercise: 'Read Proverbs 26:4-5 (the two answers to a fool) and write out the situation in which each would be the right move. Then read Job 8 — one of the friends applying a standard wisdom rule to Job — and note what he gets structurally right and pastorally catastrophic.',
      },
      {
        id: 'gen-6',
        title: 'Prophecy: Mostly Not About the Future',
        content: `The common assumption is that a prophet is a person who predicts. In the Bible, prediction is a minority of the job. A prophet is a covenant prosecutor: he shows up when a nation has broken its agreement with God and states the charges.

The standard shape of an oracle has three parts and you can find them in almost any prophetic paragraph. The indictment — here is what you did, usually stated concretely (courts that take bribes, scales that cheat, worship without justice). The sentence — here is what is coming. And very often the appeal — return, and this can change.

That third part matters more than people expect, because most prophecy is conditional whether or not the condition is stated. There is an explicit statement of this principle: if God announces judgment on a nation and it turns, he relents. This is exactly what happens in Jonah, and it is why Jonah is angry — he was not afraid of being wrong, he was afraid of being right about God's mercy.

Two more reading rules.

Cosmic language is judgment idiom. Sun darkened, moon turned to blood, stars falling, mountains melting, earth shaking — this is stock ancient vocabulary for the collapse of a political and social order. When a prophet uses it against a specific named empire, it means that empire's world is ending, not that the solar system is.

Horizons compress. A prophet can speak of a near event and a far one in a single breath, the way two mountain ranges look adjacent from a distance. That is not confusion; it is perspective. It means you must ask which horizon a line is on, and be honest when the text does not say.`,
        exercise: 'Read Amos 5:1-24. Find the indictment, the sentence, and the appeal, and mark where each begins. Then list the specific social behaviors named in the charges. Notice how concrete the accusations are — this is not general spiritual decline, it is named conduct.',
      },
      {
        id: 'gen-7',
        title: 'Gospel: Four Portraits, One Person',
        content: `The Gospels are a genre of their own: ancient biography written to produce faith. Both halves of that are true and neither cancels the other. One writer says outright that he investigated everything carefully and wrote an orderly account. Another says he wrote so that readers would believe. Historical care and theological purpose are not competitors here.

An ancient biography did not have to be chronological, exhaustive, or neutral. It selected and arranged material to show you who someone was. So the differences between the Gospels are usually not errors — they are editorial decisions, and they are readable.

Each writer has a shape. One presents Jesus relentlessly as the promised King of Israel, structures his book around blocks of teaching, and quotes the Old Testament constantly. One moves fast, keeps the tone urgent, and drives everything toward a cross. One highlights outsiders, women, the poor, and the reach of the message beyond Israel. One works at a different altitude entirely, with long discourses, seven signs, and a prologue that starts before creation.

The practical skill is comparison. When the same event appears in two Gospels, set them side by side and ask what each writer includes, omits, and where he places it. That is not an attack on the text; it is the single fastest way to see what each author is arguing.

One caution. The differences are real and should be worked honestly, not smoothed over with a strained harmonization that no one would accept in any other document. Say what each writer says. Where the accounts are genuinely hard to fit together, say that too.`,
        exercise: 'Set Matthew 14:13-21 and John 6:1-15 side by side (the same feeding). List what each includes that the other does not, including where each one places the event and what happens immediately after. Then write one sentence per Gospel: what is this writer doing with this event?',
      },
      {
        id: 'gen-8',
        title: 'Apocalyptic: Symbols With Rules',
        content: `Apocalyptic is visionary writing, heavy with symbol, given to people under pressure. It was a recognized genre with recognized conventions; the first readers were not confused by beasts and numbers any more than you are confused by a political cartoon with an eagle and a bear in it.

Four rules for reading it, in order.

Let the book explain itself first. These works often define their own images. When a text tells you the lampstands are the churches, or the waters are peoples and nations, that is the interpretation and you do not need to hunt for another one.

Then look to earlier Scripture. Apocalyptic is built almost entirely out of recycled prophetic imagery — beasts from the sea, a son of man, a great harlot city, a dragon. The images come pre-loaded from the prophets, and that is where their meaning was set.

Then ask what it meant to the first hearers. Revelation went to seven actual congregations in Roman Asia — that much is on the page. When it went, and what the great city stands for, are argued, and you should know the argument rather than inherit an answer.

One reading puts it late, near the end of the first century, under an emperor who pressed emperor-worship hard in exactly that province. It leans on early church testimony from the following century that names that reign, and on the state of the seven churches themselves — a congregation that has had time to grow rich and complacent, another that has had time to leave the love it started with. On this reading the great city that sits on seven hills, rules the kings of the earth, and trades with the whole world is imperial Rome.

The other puts it before Jerusalem fell, in the late sixties. It leans on the moment in chapter 11 where John is told to measure a temple that appears to be standing, on the counting of kings in chapter 17, and on chapter 11's description of the great city as the place "where their Lord was crucified" — which is Jerusalem, not Rome. On this reading the harlot city is Jerusalem under judgment, and much of the book lands in that generation.

Both are held by serious people. Both have real evidence and real problems. What matters for your reading is that the question is live and the choice drives everything downstream — so make it deliberately, with the evidence in front of you, and be able to say why.

What survives either answer is the method: a symbol meant something to the people who first heard it, and that meaning was set before you arrived. Start there and you will avoid most of the wreckage in this book's interpretive history.

Only then ask about the future. Some of it is future. But a symbol whose first-century meaning you have skipped is a symbol you are free to make mean anything, and readers have.

On the thousand years and the systems built around it: there are four major frameworks, each of which took its recognizable modern form in a particular historical moment and largely to make sense of that moment. Read chapter twenty on its own terms first, then hold whatever system you find most persuasive as a system — including the one you were raised in. What is not in play is the ending: a real, future, bodily return of Christ, a real resurrection, and a real final judgment. Those are settled ground, not a system.`,
        exercise: 'Read Revelation 1:9-20. Find every symbol in the vision, then find every symbol the passage itself explains before the chapter ends. Write down which images you are given the key to — and resist supplying keys for the rest until you have checked whether the prophets supply them.',
        toolHint: 'Cross-Reference strip — apocalyptic imagery is almost always quoting earlier prophets',
      },
    ],
    quiz: [
      {
        q: 'A prophet writes that the sun will be darkened, the moon turned to blood, and the stars will fall — in an oracle addressed by name to a specific ancient empire. The best reading is:',
        options: [
          'A prediction of astronomical events at the end of world history',
          'Stock ancient judgment language announcing the collapse of that empire\'s order',
          'Poetic decoration with no referent',
          'A coded reference to a modern nation',
        ],
        answer: 1,
        explanation: 'Cosmic-collapse imagery is conventional prophetic idiom for the end of a political and social world. The oracle names its target; the imagery describes what is coming to that target.',
      },
      {
        q: 'In the book of Job, Job\'s friends deliver long speeches that are recorded word for word, and at the end God says they have not spoken rightly. What does this teach about reading narrative?',
        options: [
          'Their speeches were added later and should be skipped',
          'Everything quoted in Scripture carries the same authority',
          'Accurate reporting of what a character said is not the same as endorsement of what he said',
          'God\'s rebuke applies only to their tone, not their content',
        ],
        answer: 2,
        explanation: 'A narrative faithfully records characters who are wrong. The narrator\'s voice and God\'s speech carry weight that a character\'s speech does not — and confusing the three produces bad doctrine from true quotations.',
      },
      {
        q: 'Read this line pair: "The LORD knows the way of the righteous, but the way of the wicked will perish." What kind of parallel is it, and what does that tell you?',
        options: [
          'Echo — the second line restates the first in different words',
          'Contrast — the argument is carried by the opposition between the two halves',
          'Extension — the second line adds a new topic',
          'Chiasm — the lines mirror each other in reverse order',
        ],
        answer: 1,
        explanation: 'The pair works by opposition. In a contrast pair, the point lives in the difference between the lines, not in either line alone.',
      },
      {
        q: 'Psalm 1:1 moves from walking, to standing, to sitting — paired with the wicked, then sinners, then scoffers. The most accurate observation is:',
        options: [
          'The three phrases are synonyms repeated for rhythm',
          'Both series escalate together, picturing a progression from passing exposure to settled belonging',
          'The verbs are literal instructions about posture in worship',
          'The three groups are three separate historical parties in Israel',
        ],
        answer: 1,
        explanation: 'Two parallel escalations run at once: increasing physical commitment and increasing corruption. Read as mere repetition, the verse loses the whole picture it is drawing.',
      },
      {
        q: 'Someone quotes "train up a child in the way he should go, and when he is old he will not depart from it" to a parent whose adult child has walked away from the faith, as proof the parent failed. The error is:',
        options: [
          'A translation problem in the verse',
          'A genre error — reading a wisdom generalization about how formation usually works as an unconditional promise',
          'Quoting the Old Testament to a New Testament believer',
          'Taking the verse out of its immediate context in the chapter',
        ],
        answer: 1,
        explanation: 'Proverbs states how life generally goes in God\'s ordered world. Turning a generalization into a guarantee is the single most common — and most damaging — misuse of the wisdom genre.',
      },
      {
        q: 'Proverbs 26:4 says not to answer a fool according to his folly; 26:5 says to answer a fool according to his folly. The best handling is:',
        options: [
          'One verse is a scribal error',
          'The tension is deliberate: the genre is teaching that this call depends on reading the situation',
          'The second verse cancels the first',
          'They address two different Hebrew words for "fool"',
        ],
        answer: 1,
        explanation: 'Wisdom is situational by design. Setting two opposite maxims side by side is the book telling you that no maxim applies automatically — discernment is the skill being taught.',
      },
      {
        q: 'You are reading a law that says if a man digs a pit and leaves it uncovered and an animal falls in, he must pay. The most fruitful question is:',
        options: [
          '"Does this law bind Christians today, yes or no?"',
          '"What does this ruling protect, and who does it protect?"',
          '"How likely was this scenario in the ancient world?"',
          '"Which later law replaced this one?"',
        ],
        answer: 1,
        explanation: 'Ancient case rulings are representative worked examples, not exhaustive codes. Asking what the ruling protects gets you to the value the law is defending, which is what actually travels.',
      },
      {
        q: 'Two Gospels describe the same event with different details and place it at different points in their books. The disciplined reading is:',
        options: [
          'One of the accounts must be inaccurate',
          'Ancient biography arranged material to make a point, so compare the two and ask what each writer is doing with the event',
          'Merge the accounts into a single composite and study only that',
          'Prefer whichever account is longer',
        ],
        answer: 1,
        explanation: 'Gospel writers select and arrange. Comparison is the fastest way to see each author\'s argument — and honest comparison beats a strained harmonization that flattens both accounts.',
      },
      {
        q: 'In an apocalyptic vision, the text itself states that the seven lampstands are the seven churches. What should you do with that?',
        options: [
          'Treat it as one possible reading among many and keep searching for a deeper meaning',
          'Take it as the interpretation — a book that defines its own symbol has settled that symbol',
          'Apply it only to the first-century churches and look for a second key for today',
          'Look for a numerical significance in "seven" that overrides the stated meaning',
        ],
        answer: 1,
        explanation: 'Rule one of apocalyptic: let the book explain itself. When a text supplies the key to its own image, hunting for a better one is not depth — it is ignoring the author.',
      },
      {
        q: 'A reader wants to interpret the great city in Revelation that rules over the kings of the earth and trades with the whole world. What order of questions gives the most reliable result?',
        options: [
          'Current events first, then earlier prophets, then the first readers',
          'The book\'s own explanations, then earlier prophetic imagery, then what it meant to first-century readers under Roman pressure, then any future reference',
          'Systematic theology first, then the text',
          'Whatever reading the majority of Christians hold today',
        ],
        answer: 1,
        explanation: 'Working inside-out — the book, then its prophetic sources, then its first hearers — anchors the symbol before anyone starts extending it. Skipping the first-century meaning is how a symbol becomes a blank space for whatever the reader already fears.',
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
        title: 'A Text Without a Context Is a Pretext',
        content: `More theological damage is done by ignoring context than by any other single mistake. Not by heresy, not by bad languages work — by lifting a sentence out of the paragraph it lives in.

The reason is mechanical. A sentence pulled out of its surroundings loses the constraints that fixed its meaning, and those constraints are the only thing preventing you from supplying your own. Once they are gone, the verse will say whatever you need it to say, and it will feel like the Bible said it.

Every verse sits inside five nested circles. The paragraph. The book. The occasion — who wrote to whom, and why. The place in the whole storyline of Scripture. And the historical world it was written into.

You work from the outside in, then check your answer from the inside out.

The practical version is simple enough to do every time: before you study a verse, read the paragraph. Before you settle the paragraph, skim the chapter. Before you preach the chapter, know what the book is for.

Most of the interpretive questions that look impossible in a single verse dissolve when you read forty verses around it. Not all. But most — and doing this one thing will make you a better reader than a large majority of people who quote the Bible confidently.`,
        exercise: 'Read Jeremiah 29:11 by itself and write what you think it promises. Then read Jeremiah 29:1-14 and write who is being addressed, where they are, and what time frame is attached to the promise. Then write honestly: what did the surrounding verses take away, and what did they give?',
        toolHint: 'Canonical Context tile — the passage role line tells you where you are standing in the book',
      },
      {
        id: 'ctx-2',
        title: 'Immediate Context: Find the Fence',
        content: `Immediate context is the block of text your verse belongs to. Before anything else, find where that block starts and stops — because chapter and verse numbers are not part of the original text. Chapter divisions were added in the thirteenth century and verse numbers in the sixteenth, and both of them land in the wrong place with some regularity.

Work a famous case. "I can do all things through him who strengthens me" is one of the most quoted sentences in the Bible. Read the four verses before it and the block declares itself: the writer is thanking a church for a financial gift, and he says he has learned to be content in plenty and in hunger, in abundance and in need. "All things" has a stated antecedent, and the antecedent is every circumstance on that list. The sentence is about being unbreakable in either direction — not about achieving whatever you attempt.

Notice what just happened. The context did not shrink the verse into something small. It made it harder and better. A promise of success is cheap. A learned capacity to be at peace, rich or starving, is not, and almost nobody has it.

That is the pattern. Context rarely takes something away without handing back something heavier.

How to find the block: look for a change of topic, audience, place, time, or speaker. Look for a summary sentence closing a thought. Look for a repeated phrase bracketing a section at both ends. Where the topic turns, the fence is.`,
        exercise: 'Take Matthew 7:1 ("judge not"). Read Matthew 7:1-6 and find where the unit ends. Write down every qualification the block itself puts on the opening sentence. Then state in one sentence what the paragraph — not the slogan — actually requires of you.',
      },
      {
        id: 'ctx-3',
        title: 'Book Context: Get the Spine in an Hour',
        content: `You do not need to master a book to read one of its paragraphs well. You need its spine: what it is about, why it was written, and how it moves.

You can get that in about an hour, with nothing but the book itself. Four moves.

Read it straight through in one sitting. Most biblical books take twenty to sixty minutes. Do not stop to study; just take the ride.

Write down every word or idea that keeps coming back. Do not analyze — list. If a word shows up in every chapter, it is a load-bearing wall.

Find the purpose statement if there is one. Several books state outright why they exist — a stated aim that readers may believe, or know they have life, or contend for the faith, or an orderly account so a reader may have certainty. When a writer tells you his purpose, that sentence governs everything else in the book.

Ask who or what the author is arguing against. Almost every letter is a response to something. Identify the pressure and half the letter's odd turns become obvious.

Now go back to your paragraph and ask the only question that matters here: how does this paragraph serve the book's purpose? If you cannot answer that, you have not yet found the passage — you have found some words that live near it.`,
        exercise: 'Read the letter to the Philippians in one sitting (about twenty-five minutes). List every repeated word or theme. Find the sentences where the writer states why he is writing. Then take Philippians 2:1-4 and write one sentence explaining how that paragraph serves the aim of the whole letter.',
        toolHint: 'Canonical Context tile — book theme and passage role, at a glance',
      },
      {
        id: 'ctx-4',
        title: 'Occasion: You Are Reading Someone Else\'s Mail',
        content: `Every letter in the New Testament is one half of a conversation. The other half — the report that arrived, the questions that were asked, the crisis that broke out — is missing, and the original readers had it in their heads.

So you reconstruct. Carefully.

The method is to read the letter's answers backward into the questions. When a writer says "now concerning the matters you wrote about," he is telling you outright that he is answering a list. When he spends three chapters on whether it is acceptable to eat meat that had been sacrificed at a pagan temple, you know that was a live fight in that city. When he insists repeatedly that he did not come with impressive speech, somebody was comparing him unfavorably to someone who did.

Now the discipline, because this method has a failure mode. Not every command implies a problem. A letter telling people to love one another is not proof that the church was full of hatred; writers also state the ordinary and the foundational. Reconstruct the occasion from the strongest signals — direct references to reports, questions, opponents, named disputes — and hold the rest loosely.

Then do the same for a narrative. Old Testament books were compiled and arranged for readers in a specific situation. Books that trace the collapse of the kingdoms read differently once you ask what a reader living in exile — asking how this happened to us — would hear in them. The answer to that reader is not "here are some kings." It is "here is exactly why, and here is the word of God that held through all of it."`,
        exercise: 'Read 1 Corinthians 1:10-17 and 7:1. From those two passages alone, list what you can establish about the situation in that church, and mark each item as either "stated directly" or "inferred." Keep those two labels separate — that habit is most of the discipline.',
      },
      {
        id: 'ctx-5',
        title: 'Canonical Context: Where Are You in the Story?',
        content: `Scripture tells one long story, and every passage sits at a point on that line. Knowing which point changes what a passage can be asked to do.

A workable map: creation; the fracture; a covenant family; a rescued nation under covenant terms; a kingdom that rises and collapses; exile and return; the arrival of Christ; the church sent out; the promised renewal of everything.

Two questions to run on any passage.

What did these people know at this point? The audience of a text written before the exile did not have the exile's answers. A first reader of a promise to a nomad in the ancient Near East did not have the letters that would later explain it. Reading later revelation back into an earlier scene as though the original hearers had it is a quiet form of pretending, and it erases exactly how hard their faith was.

What does this passage contribute that was not there before? Every text moves the story. A promise gets narrower or wider. A problem gets named. A pattern gets set that will be filled later.

You are doing two legitimate readings at once, and both are honest as long as you keep them labeled: what this meant standing at that point on the line, and what it means now that the whole line is visible. The order matters. Read it forward first, then read it in light of the whole. Skipping the first step is how a passage becomes a decoration on a doctrine you already had.`,
        exercise: 'Read Genesis 12:1-3. Write down exactly what is promised, in the terms it is promised — no New Testament language. Then list what the man being spoken to did not yet know. Only then read Galatians 3:8 and note what a later writer says was already in the promise.',
        toolHint: 'Cross-Reference strip — the canonical links show where a passage gets picked back up',
      },
      {
        id: 'ctx-6',
        title: 'Covenant Location: Which Agreement Is Running?',
        content: `This is the context question that most readers never ask, and it does more work than almost any other.

Scripture is organized by covenants — binding agreements God initiates, each with its own parties, promises, signs, and obligations. A command does not float free. It lands inside an agreement, and which agreement is running changes what the command is doing.

Take a well-known verse: if my people, who are called by my name, humble themselves and pray and seek my face and turn from their wicked ways, then I will hear from heaven and heal their land. That sentence is God's answer to a king at the dedication of a temple, addressed to a covenant nation, about a specific land promised in that covenant, with a specific building attached to it. It is not addressed to any modern country, none of which has a covenant with God, a promised land, or a temple.

Say that plainly and you have lost a favorite verse and gained something better: a hard, accurate line about what repentance and mercy actually run on, and an honest account of why the modern application everyone assumes needs more work than a quotation.

The general skill: before applying a command, name the covenant it sits in, then ask what has and has not changed. Some things carry straight across because they rest on God's unchanging character. Some are fulfilled and closed. Some are transformed. Doing this work is the difference between applying Scripture and quoting it.`,
        exercise: 'Take three commands: Leviticus 19:19 (do not sow a field with two kinds of seed), Leviticus 19:18 (love your neighbor as yourself), and Deuteronomy 20 (rules for war on Canaanite cities). For each, name the covenant setting, then decide whether it carries across unchanged, is fulfilled and closed, or is transformed — and write your reason.',
      },
      {
        id: 'ctx-7',
        title: 'Historical Context: What They Already Knew',
        content: `The original readers understood a great deal that they never had to be told. That unspoken knowledge is invisible to us, and its absence is where confident misreadings breed.

Three examples of freight the first hearers carried automatically.

Execution by crucifixion was a public political humiliation, reserved by Rome for slaves and rebels and staged deliberately along roads. It was not merely a painful death; it was a shame ritual designed to make an example. That is why an early writer can call the message of the cross both foolishness and a scandal, and expect readers to nod.

Sharing a meal was not casual. In that world it publicly declared who you belonged with. Which means the recurring charge that a certain teacher eats with the wrong people is not a note about his dinner habits. It is an accusation about his allegiances, and everyone in the room knew it.

Honor and shame ran the social system the way money runs ours. Public reputation was a family's working capital. When you see someone in a Gospel scene calculating in public, they are usually calculating in that currency.

One warning that belongs here. Background illuminates a text; it does not overrule it. If a claimed historical fact makes a passage mean the opposite of what the words say, the problem is the claim. And check your background claims — some of the most repeated ones in preaching have no ancient evidence behind them at all.`,
        exercise: 'Read John 4:1-30 and list every social boundary the scene crosses — ethnic, gender, religious, moral, and the time of day. Use only what the text states. Then ask: which of those would a first-century reader have felt immediately, without any explanation?',
        toolHint: 'Cultural Context markers (◈) — click a flagged phrase for the background a first reader assumed',
      },
    ],
    quiz: [
      {
        q: 'Someone quotes "I can do all things through him who strengthens me" as a promise of success in a hard goal. Reading the four preceding verses shows the writer is describing:',
        options: [
          'His confidence in overcoming persecution',
          'Learned contentment in both abundance and need — strength to be steady in any circumstance',
          'His authority as an apostle',
          'A prayer for the church\'s prosperity',
        ],
        answer: 1,
        explanation: 'The context supplies the antecedent for "all things": the list of circumstances just given, plenty and hunger, abundance and need. The verse is about being unbreakable either way — a harder claim than the popular one.',
      },
      {
        q: 'You want to find where a passage\'s unit begins and ends. Which is the most reliable method?',
        options: [
          'Use the chapter and verse divisions, which mark the original units',
          'Use the section headings printed in your Bible',
          'Look for changes in topic, audience, place, time, or speaker, and for bracketing repeated phrases',
          'Take ten verses before and ten after as a rule of thumb',
        ],
        answer: 2,
        explanation: 'Chapter divisions were added in the thirteenth century and verse numbers in the sixteenth; headings are a modern editor\'s work. The seams the author left — shifts and brackets — are in the text itself.',
      },
      {
        q: 'A verse promising restoration is addressed to people who have just been deported to a foreign empire and told the situation will last seventy years. Applying it as a personal guarantee of a good outcome soon:',
        options: [
          'Is fine, because the character of God does not change',
          'Ignores the addressee, the situation, and the stated time frame — the three things that fixed the promise\'s meaning',
          'Is wrong only if you quote the verse without the reference',
          'Is acceptable in preaching but not in study',
        ],
        answer: 1,
        explanation: 'God\'s character does not change, and that is exactly the ground for a legitimate application — but it has to be built, not assumed. Stripping the addressee and the timeline removes what made the promise mean anything specific.',
      },
      {
        q: 'The fastest way to get a book\'s spine before studying a paragraph in it is:',
        options: [
          'Read a summary of the book\'s themes',
          'Read the book straight through in one sitting, list what recurs, and find any stated purpose',
          'Memorize the outline in a study Bible',
          'Study its first and last chapters closely',
        ],
        answer: 1,
        explanation: 'One sitting gives you the shape; recurring words give you the load-bearing walls; a stated purpose governs everything else. All three come from the book itself, in about an hour.',
      },
      {
        q: 'A letter includes the phrase "now concerning the matters about which you wrote." What does that tell you about the occasion?',
        options: [
          'The writer is changing to a new topic of his own choosing',
          'The writer is answering a list of questions the readers sent, so the material that follows is shaped by their agenda',
          'The letter was co-written',
          'The section is a later addition',
        ],
        answer: 1,
        explanation: 'That phrase is a direct window into the missing half of the conversation. What follows is response, not initiative — which changes how you read its emphases and omissions.',
      },
      {
        q: 'Reconstructing a letter\'s occasion from its commands has a known failure mode. What is it?',
        options: [
          'Assuming every command implies a corresponding problem in that church',
          'Relying on the letter\'s own statements rather than outside history',
          'Reading the letter in one sitting',
          'Treating the writer as a real person in a real situation',
        ],
        answer: 0,
        explanation: 'Writers also state the ordinary and the foundational. Build the occasion from strong signals — stated reports, questions, named disputes — and hold everything inferred from a bare command loosely, and labeled as inferred.',
      },
      {
        q: 'When reading a promise given to an ancient figure, why should you first write out what he did not yet know?',
        options: [
          'Because later revelation is less reliable',
          'Because reading later revelation back in as though the first hearers had it erases how the passage actually functioned — and how hard their faith was',
          'Because the promise changed meaning over time',
          'Because the New Testament should not be used to interpret the Old',
        ],
        answer: 1,
        explanation: 'Both readings are legitimate — the passage at its point in the story, and the passage in light of the whole. The discipline is doing them in that order and keeping them labeled.',
      },
      {
        q: 'A national-repentance promise given to a covenant nation, at the dedication of a temple, about a land granted in that covenant, is applied directly to a modern country. The strongest objection is:',
        options: [
          'The verse is from the Old Testament and no longer applies',
          'The promise is attached to a covenant, a land, and a temple that no modern nation has — so the application has to be built through what has and has not changed, not assumed',
          'Modern nations are more sinful than ancient Israel',
          'The verse was addressed to a king, not to citizens',
        ],
        answer: 1,
        explanation: 'Naming the covenant location does not delete the passage; it forces the honest work. Some things carry across on God\'s unchanging character, and that argument has to be made rather than skipped.',
      },
      {
        q: 'You hear a preacher explain a passage using a historical detail that makes the text mean roughly the opposite of what the words say. What is the right response?',
        options: [
          'Accept it — historical background is specialist knowledge',
          'Reject the whole discipline of historical background',
          'Doubt the claim; background illuminates a text, it does not overturn it, and some widely repeated background claims have no ancient evidence',
          'Look for a third interpretation that splits the difference',
        ],
        answer: 2,
        explanation: 'Real background makes a text land harder in the direction it was already going. When a "fact" reverses the plain sense, suspect the fact — several famous ones in preaching are inventions.',
      },
      {
        q: 'Which sequence best describes disciplined use of context?',
        options: [
          'Verse, then doctrine, then paragraph',
          'Paragraph, then book, then occasion, then place in the storyline, then historical world — then back to the verse',
          'Historical world only, since the rest follows from it',
          'Whole canon first, then the verse, skipping the book',
        ],
        answer: 1,
        explanation: 'Work outward from the paragraph to the widest circle, then come back in. Each circle constrains the next, and the verse is the last thing you settle, not the first.',
      },
    ],
  },

  {
    slug: 'structure',
    number: 4,
    title: 'Structure',
    subtitle: 'Find the Seams',
    icon: '⌗',
    color: '#a08850',
    lessons: [
      {
        id: 'str-1',
        title: 'A Passage Is Built, Not Piled',
        content: `A biblical text is not a heap of verses. It is a built thing, with parts, joints, and a shape — and the shape carries meaning that no individual sentence carries alone.

This is the skill nobody teaches laymen, and it is the one that most changes what you can do on your own. Once you can see how a passage is assembled, you can teach it, remember it, and check anyone else's handling of it.

Three levels, from the outside in.

The unit. Where does this thought start and stop? A unit is the smallest complete argument or scene. Sometimes it matches a chapter. Frequently it does not.

The movements. Inside a unit, where does it turn? A narrative moves through setting, tension, turn, resolution, and aftermath. An argument moves through claim, grounds, objection, answer, and conclusion. Both leave marks.

The weight. Where does the passage spend itself? Count verses. Whatever gets the most words, the center position, or the last position is usually carrying the load.

The discipline underneath all three: your outline should be discovered, not invented. Every division you draw should be defensible by pointing at something in the text — a change of speaker, a repeated bracket, a connective, a shift in tense or topic. If you cannot point at the reason for a break, you did not find it. You imposed it.`,
        exercise: 'Take Mark 4:1-34. Without using any headings, mark where you think each unit begins and ends, and write beside each mark the specific thing in the text that told you (change of audience, formula, topic shift). If any mark has no reason beside it, erase it.',
        toolHint: 'Phrasing Diagram — clause layout makes the seams visible before you name them',
      },
      {
        id: 'str-2',
        title: 'Marking the Seams',
        content: `Here are the signals that a new unit is starting. They are visible in any translation.

Change of speaker. Someone new starts talking, or narration resumes after speech.

Change of audience. The clearest example: a teacher addresses a crowd, then turns to his disciples privately. Same chapter, different unit, and often a different level of explanation.

Change of place or time. "After these things." "On the next day." "When he came down from the mountain." Ancient writers move scenes with these markers because they had no paragraph breaks.

Change of topic, marked or unmarked. "Now concerning..." is a marked topic change. An unmarked one is just as real; you find it by summarizing each paragraph in five words and watching where the summary jumps.

Bracketing — the same phrase or idea at the start and the end of a section, closing a loop. When you see a distinctive phrase repeat after several verses, check whether everything between the two is one unit. This is one of the most common structural devices in Scripture and one of the easiest to spot.

Genre shift. A narrative pauses for a song. An argument pauses for a hymn or a list. The shift itself is usually a structural marker, and the inserted piece is usually the point.

A summary or conclusion sentence. Watch for a line that restates what just happened or draws a result. Writers close units.

Learn these seven and you will rarely be lost in a chapter again.`,
        exercise: 'Read Matthew 5-7 looking only for seam markers — nothing else. List every change of audience, place, formula, and bracket you can find. Pay special attention to the sentences immediately before 5:3 and immediately after 7:27, and note what they do.',
      },
      {
        id: 'str-3',
        title: 'Movements Inside a Unit',
        content: `Once you have the unit, find where it turns.

For narrative, five movements. Setting: who, where, what state of affairs. Tension: the problem, the threat, the impossibility. Turn: the moment things change — often a single verse, often a word from God, often shorter than you expect. Resolution: what the turn produces. Aftermath: the consequence, or the deliberate lack of one.

The turn is the load-bearing verse. Find it first and the rest of the scene organizes itself around it.

For argument, five moves. Claim: the assertion. Grounds: the reasons offered, usually marked by "for" or "because." Objection: the writer voices a counterargument, often as a question — "What shall we say then?" "Does this mean...?" Answer: his response, often opening with a flat denial. Conclusion: marked by "therefore" or "so then."

That objection move is worth its own note, because many readers stumble over it. A writer who states an objection in his own voice is not teaching the objection. If you quote the objection as his position, you have him arguing the opposite of what he means. Watch for the question, then watch for the sharp denial that follows.

The habit: after you read a unit, write its movements in a five-line skeleton with verse numbers. Two minutes. That skeleton is now something you can carry in your head and defend.`,
        exercise: 'Read Romans 6:1-14. Find the objection, the denial, the grounds, and the conclusion, and write the verse numbers for each. Then read 1 Kings 17:8-24 and write its five narrative movements with verse numbers. Notice how short the turn is in each.',
      },
      {
        id: 'str-4',
        title: 'Repetition Patterns: Bookends and Mirrors',
        content: `Two structural patterns show up constantly, and both are findable without any training.

Bookends. A phrase or idea appears at the beginning of a section and again at the end, framing everything inside. When you find bookends, you have found a unit's boundaries and usually its theme, because writers frame with what the section is about.

Mirrors. A section runs A, B, C, then B', A' — moving out to a center and back. The pattern is real and common in both Hebrew and Greek writing. When it is genuinely present, the center is the point, and the center is often the line a modern reader would have skimmed.

Now the honesty rule, because this device attracts invention. People find mirrors everywhere, including in texts that do not have them, because with enough abstraction any list of items can be made to look symmetrical.

Three tests before you trust one. First, is the correspondence verbal — actual repeated words or clear repeated formulas — or did you have to summarize each section vaguely to make the halves rhyme? Vague summaries can make anything symmetrical. Second, does the structure track the unit's real boundaries, or did you have to start mid-sentence and end mid-sentence to make it work? Third, does the center actually carry weight in the passage on other grounds — is it emphatic, surprising, or the turn — or is it just where the diagram happened to land?

If a proposed pattern fails those tests, drop it. A structure you invented will teach beautifully and it will not be true.`,
        exercise: 'Read Psalm 8 and find the bookends. Then read Genesis 6:9-9:19 (the flood) and test whether the events before and after the middle correspond in reverse order. For every pair you claim, write the specific repeated words that justify it — not the theme, the words.',
      },
      {
        id: 'str-5',
        title: 'Building an Outline the Text Gives You',
        content: `Now the payoff. An outline is a map of the text's own divisions, in the text's own proportions, in the text's own order.

Four requirements for an honest one.

Every division is defensible. Beside each point, you can name the seam marker that produced it. This is the whole discipline; if you can do this, your outline is at worst incomplete rather than fabricated.

The proportions match. If the passage spends nine verses on one thing and two on another, your outline should not give them equal billing. Proportion is authorial emphasis, and flattening it silently overrules the writer.

The order matches. Do not rearrange a passage into a more satisfying sequence. If the text puts the reason after the command, then the command lands first and the reason follows, and that ordering is part of what the writer is doing.

The points assert, not label. "Prayer" is a label. "Prayer is what he does before he chooses" is a point. Labels stack topics; points carry the argument. A reader who has your outline should have the shape of the passage's reasoning, not a table of contents.

One thing an honest outline is not: it is not a sermon outline, and it is not required to be memorable, alliterated, or parallel. Those are delivery decisions and they come later, if they come at all. Force alliteration onto the front end and you will bend the text to fit the letter. The order is: find the structure, state it plainly, and only then decide how to say it.`,
        exercise: 'Outline Philippians 2:1-11 in no more than four points. Beside each point write the verse range and the specific textual marker that justified the break. Then check the proportions: how many verses does each point cover, and does your outline reflect that?',
        toolHint: 'Sermon Outline tile — compare the generated structure against the one you built yourself',
      },
      {
        id: 'str-6',
        title: 'Where the Weight Falls',
        content: `Structure tells you the shape. Weight tells you what the shape is for. Four signals, all countable.

Proportion. Count verses per section. A writer who spends two verses stating a miracle and thirty verses on the argument that follows it has told you which one he is writing about.

Position. Final position is emphatic in almost every kind of writing. So is the center of a mirrored structure. So, often, is the thing withheld until last.

Repetition. Whatever the passage keeps returning to is the anchor of the passage, and everything else is orbiting it.

Interruption. When a writer breaks his own flow — a sudden burst of praise mid-argument, a parenthesis, a direct address to the reader — the break is deliberate and it marks intensity.

Then use the weight as a check on yourself. Write down what you plan to say the passage is about. Then ask: does the passage spend its words there? If your main point occupies four words of a forty-verse chapter, you have a subpoint and you are treating it as the thesis. That is not a small error. It is the most common way a study that got every detail right still ends up teaching the wrong thing.

This check takes ninety seconds and it will save you regularly.`,
        exercise: 'Take Luke 15. Count the verses in each of the three stories. Note how much space the third story gives to the older brother compared with the younger. Then state what the chapter is about in one sentence — and check whether the verse count supports your sentence.',
      },
      {
        id: 'str-7',
        title: 'Structure Across Chapters',
        content: `The last level: a chapter is a move in a longer argument, and reading it in isolation costs you most of it.

The rule is cumulative. Read chapter two in light of chapter one. Read chapter three in light of one and two. Do not restart at each chapter break — the writer did not.

Two examples of what this recovers.

A letter's ethics section usually opens with a "therefore" that is loaded with everything that came before it. Read that section by itself and you get a list of duties. Read it after the eleven chapters it is drawing on and you get a conclusion — and the duties change character entirely, because you now know what they are a response to.

In a long narrative, a crisis is set up chapters before it pays off. When a book tells you early that a king has imported a foreign religion and built an altar to it, and several chapters later a prophet stages a public contest between that god and the God of Israel, the contest is not a standalone story about courage. It is the resolution of a conflict the writer planted on purpose, and its outcome is only intelligible against the setup.

So keep a running thread. Before you study a chapter, write two or three sentences answering: what has the book established so far, and what question is still open? Then, after you study it, add one line: what did this chapter just do to that thread?

That running summary is the single most useful thing you can keep while working through a book, and it takes five minutes per chapter.`,
        exercise: 'Read 1 Kings 16:29-34, then 1 Kings 17, then 1 Kings 18. Write the running thread in three lines — one per chapter — showing what each one establishes and what it leaves open. Then answer: what does chapter 18 resolve, and what does it deliberately leave unresolved?',
      },
    ],
    quiz: [
      {
        q: 'You are marking where a unit begins and ends. Which of these is the most trustworthy indicator?',
        options: [
          'The chapter number, since chapters mark the author\'s divisions',
          'The bold heading printed in your Bible',
          'A change of audience, place, or speaker — or a distinctive phrase that brackets the section at both ends',
          'A verse that contains a well-known statement',
        ],
        answer: 2,
        explanation: 'Chapter divisions and headings are later editorial additions. Shifts and brackets are marks the author left, and they are visible in any translation.',
      },
      {
        q: 'In an argument, the writer asks "What shall we say then? Are we to continue in sin?" and immediately answers "By no means!" What is the question doing structurally?',
        options: [
          'It states the writer\'s own position, which he then softens',
          'It is a voiced objection he is about to refute — quoting it as his teaching reverses his meaning',
          'It marks the end of the unit',
          'It is a rhetorical flourish with no structural role',
        ],
        answer: 1,
        explanation: 'Stating an objection in your own voice before demolishing it is a standard argumentative move. Readers who miss it end up attributing to the writer the exact view he is destroying.',
      },
      {
        q: 'A chapter spends two verses on a miracle and thirty verses on the dispute that follows it. What does the proportion tell you?',
        options: [
          'The miracle is the main point and the dispute is background',
          'The writer ran out of material about the miracle',
          'The dispute is what the passage is about; word count is one of the plainest emphasis signals a writer has',
          'Proportion is not a reliable guide in ancient writing',
        ],
        answer: 2,
        explanation: 'How many words a writer spends is a decision. When your stated main point occupies a fraction of the passage, you are almost certainly preaching a subpoint as a thesis.',
      },
      {
        q: 'Someone proposes that a passage is built as a mirror (A B C B\' A\') with a key verse at the center. Which test most reliably tells you whether the pattern is real?',
        options: [
          'Whether the center verse is theologically important',
          'Whether the corresponding sections share actual repeated words or formulas, rather than only a vague thematic summary',
          'Whether the pattern has an odd number of sections',
          'Whether other interpreters have proposed the same structure',
        ],
        answer: 1,
        explanation: 'With enough abstraction, any list can be made symmetrical. Verbal correspondence is the constraint that separates a structure the author built from one the reader assembled.',
      },
      {
        q: 'Which is a genuine outline point rather than a label?',
        options: [
          '"The Problem of Prayer"',
          '"Prayer"',
          '"He prays before he chooses — the decision waits on the night"',
          '"Prayer, Power, and Purpose"',
        ],
        answer: 2,
        explanation: 'A point asserts something the text argues; a label names a topic. Labels stack subjects side by side and lose the reasoning that connects them.',
      },
      {
        q: 'You want your outline to be alliterated so it is memorable, but the third point does not naturally start with the right letter. The right move is:',
        options: [
          'Reword the point until it fits — memorability serves the hearer',
          'Keep the point accurate; alliteration is a delivery decision made after the structure is found, and bending the text to a letter is a real cost',
          'Drop the third point',
          'Reorder the passage so the alliteration works',
        ],
        answer: 1,
        explanation: 'Find the structure, state it plainly, then decide how to say it. Deciding the sound first and fitting the text to it is the point at which the outline stops being the passage\'s.',
      },
      {
        q: 'In a narrative, which movement is usually the shortest and most load-bearing?',
        options: [
          'The setting',
          'The tension',
          'The turn — the moment the situation changes, often a single verse',
          'The aftermath',
        ],
        answer: 2,
        explanation: 'Narrators build tension at length and then flip it fast. Finding the turn first organizes the whole scene around the thing the writer actually built it for.',
      },
      {
        q: 'Why should you keep a running two-or-three-sentence thread while working through a book chapter by chapter?',
        options: [
          'To track how much you have read',
          'Because each chapter is a move in a longer argument, and a chapter read fresh loses the setup that makes it intelligible',
          'Because it is required for sermon preparation',
          'To make sure you cover every verse',
        ],
        answer: 1,
        explanation: 'Writers plant conflicts and claims chapters ahead of their payoff. The running thread is how a reader with no commentary keeps hold of the setup.',
      },
      {
        q: 'A passage puts a command first and the reason for it second. Your outline reverses them because the reason makes a better opening. What is wrong with that?',
        options: [
          'Nothing, as long as both are included',
          'The order is part of what the writer is doing, and rearranging it silently overrules him',
          'It is only a problem in poetry',
          'It is acceptable in study but not in teaching',
        ],
        answer: 1,
        explanation: 'Sequence carries argument. Reordering may produce a smoother talk, but it stops being a map of that text and becomes a map of your preference.',
      },
      {
        q: 'You have drawn a five-point outline and cannot name what in the text produced the break between point two and point three. What should you do?',
        options: [
          'Keep it — five points is a better shape than four',
          'Erase the break; a division you cannot point at is one you imposed rather than found',
          'Look for a commentary that uses the same break',
          'Move the break one verse earlier and see if it feels better',
        ],
        answer: 1,
        explanation: 'The single test of an honest outline is that every division can be defended from a marker in the text. Unjustifiable breaks are where an outline stops describing and starts inventing.',
      },
    ],
  },

  {
    slug: 'grammar',
    number: 5,
    title: 'Grammatical Structure',
    subtitle: 'Follow the Logic',
    icon: '⊟',
    color: '#7090c0',
    lessons: [
      {
        id: 'gram-1',
        title: 'Find the Main Verb',
        content: `Every sentence has a backbone: a main verb and its subject. That pair carries the assertion. Everything else — descriptive phrases, dependent clauses, prepositional phrases — is attached to it, qualifying it, explaining it, or telling you its result.

This matters because in biblical writing, sentences get long. Ephesians 1:3-14 is a single sentence in Greek. Twelve verses, one main assertion, and a cascade of attached phrases explaining it. Read as twelve independent statements, it is a blur of theological vocabulary. Read as one sentence, it has a spine: God is blessed, because he has blessed us — and then eleven verses of how, in whom, when, and to what end.

The method, in any translation.

Strip the sentence to its skeleton. Cross out every phrase starting with a preposition (in, through, according to, for, with, before). Cross out every clause starting with a relative pronoun (who, which, that). Cross out every phrase that describes rather than asserts. What remains standing is the assertion.

Then reattach the pieces one at a time and ask what each one is doing to the assertion: limiting it, timing it, explaining it, or telling you its outcome.

When you find people preaching a subordinate phrase as if it were the main claim, this is the tool that catches it — and it happens often, because subordinate phrases are frequently the most quotable part of the sentence.`,
        exercise: 'Take Ephesians 1:3-14 in a translation that keeps long sentences. Cross out every prepositional phrase and every relative clause until you have a skeleton. Write the skeleton on one line. Then add back three phrases and say what each one contributes.',
        toolHint: 'Phrasing Diagram — the main clause sits at the left margin; everything dependent is indented under it',
      },
      {
        id: 'gram-2',
        title: 'Main and Subordinate Clauses',
        content: `A clause is a group of words with its own subject and verb. A main clause can stand alone. A subordinate clause cannot — it depends on the main clause and does a job for it.

"He gave his only Son" is a main clause. "Because God so loved the world" is subordinate; it supplies the reason. Read the subordinate clause alone and you have half a thought.

Six jobs subordinate clauses do, and the word that introduces them usually tells you which:

Reason — because, since, for.
Purpose — so that, in order that, that.
Result — so that, with the result that. (Note that "so that" can be either purpose or result; you tell them apart by whether the writer is describing an intent or an outcome, and sometimes he means both.)
Condition — if, unless.
Concession — although, though, even though.
Time — when, while, after, before, until.

Now the practical payoff. When you preach or teach, the main clause should be the main thing. If your central claim is drawn from a "when" clause while the sentence's actual assertion goes unmentioned, you have preached the setting and skipped the point.

And be careful with translation differences here. Where translations disagree about how a clause attaches — whether a phrase modifies the verb before it or the one after it — you have found a genuine interpretive fork. Note it. Do not paper over it, and do not build a doctrine on the side you happened to open.`,
        exercise: 'Take John 3:16-18 and identify every clause. Label each one: main, or subordinate with its job (reason, purpose, result, condition, concession, time). Then state the main assertion of the whole span in one short sentence with no modifiers.',
      },
      {
        id: 'gram-3',
        title: 'The Connectors, and What Each One Claims',
        content: `Connecting words are where the argument lives. Learn what each one claims and you can follow reasoning you have never seen before.

For — gives the reason for what was just said. Look backward.
Therefore, so, so then — draws a conclusion from what came before. Look backward, further.
But, yet, however — contrast. The writer is correcting a wrong impression or setting up an opposition.
So that, in order that — purpose or result. Look forward.
Because, since — reason, usually attached to the clause it precedes.
If — condition. Ask exactly what is being conditioned on what, and whether the condition is presented as likely, unlikely, or merely hypothetical.
Although, though — concession. The writer is granting something before pressing his point.
Now, and — sometimes just narrative continuation, sometimes a topic marker. Weak signal; do not over-read it.

Here is the test that makes "therefore" honest. When you hit one, stop, and state in one sentence everything it is drawing on. If you cannot, you have not read enough of what precedes it, and you are about to preach a conclusion without its argument.

The classic case: an ethical section opening with "therefore I urge you" that sits on eleven chapters of argument. The word is doing all the work of connecting how a person is made right with God to how that person then lives. Cut the "therefore" and you have moral advice with no foundation. Keep it, and you have to earn it by knowing what came before.

Map every connector in a paragraph and you have mapped the author's reasoning. That is exegesis, and it requires no original languages.`,
        exercise: 'Take Romans 5:1-11 and circle every connecting word. Draw arrows: does each one point backward to a reason, forward to a purpose, or across to a contrast? Then write the paragraph\'s argument as a numbered chain of five steps.',
      },
      {
        id: 'gram-4',
        title: 'Modifiers: The Trap of Preaching the Attachment',
        content: `Some verb forms modify rather than assert. In English translation they often appear as "-ing" words or as phrases like "having been raised," "knowing this," "going out."

They tell you the manner, means, timing, or basis of the main action. They are not the main action.

Work the most misused example in modern preaching. In the commission at the end of Matthew's Gospel, the central command is "make disciples." "Go," "baptizing," and "teaching" are attached forms clustered around it. Sermons regularly build the whole passage on "go" — and the effect is that the command becomes travel, with discipleship as an optional outcome.

Now say it accurately, because the correction is often overstated in the other direction: the point is not that going is optional. An attached form like that, paired with a command, carries the command's force — you cannot make disciples of all nations without going. The point is that going is not the center. The center is making disciples, and everything else in the sentence is telling you how.

That distinction sounds fine-grained. It is not. It is the difference between a church that measures trips and a church that measures disciples.

The general rule: find the main verb, then ask of every modifier, what is this doing to the main verb? Preach the main verb. Use the modifiers to explain it.`,
        exercise: 'Take Colossians 3:1-4 and Matthew 28:18-20. In each, find the main command, then list every attached modifying phrase and write what it contributes — timing, manner, means, or basis. Then write each passage\'s command in one sentence with the modifiers folded in as explanation.',
      },
      {
        id: 'gram-5',
        title: 'Singular and Plural: The "You" Problem',
        content: `Modern English lost the distinction between singular "you" and plural "you," and that loss silently rewrites large parts of the New Testament.

Most of the "you" language in the letters is plural. It is addressed to a congregation, about a congregation.

Work the clearest case. "Do you not know that you are God's temple and that God's Spirit dwells in you?" Read with a singular "you," it is a statement about your body as an individual. Read with the plural that is actually there, it is a statement that this church, together, is the temple — and the paragraph confirms it, because the surrounding verses are about people splitting the congregation into factions and about what happens to anyone who destroys that temple. The warning is against wrecking a church, not against neglecting a body.

That does not erase the personal application. Another passage in the same letter does say the individual body is a temple of the Spirit. The point is that these are two different arguments in two different paragraphs, and collapsing them means you can no longer preach either one accurately.

How to check without Greek. Look at who is being addressed in the surrounding verses — a group or a person. Watch for plural nouns in the same sentence, like "brothers" or "you all." Check a translation that marks the difference, or a footnote. Some regional English still has a plural form, and reading the passage with it out loud is a surprisingly effective test.

Once you start checking, you will find that a great deal of what popular teaching treats as individual promise was written to a body of people about their life together.`,
        exercise: 'Read 1 Corinthians 3:16-17 and then 6:19-20. For each, decide from the surrounding verses whether the "you" is a group or an individual, and write the evidence. Then state the two different things the two passages are each claiming.',
      },
      {
        id: 'gram-6',
        title: 'Tense and Aspect, Honestly',
        content: `Verb forms carry information about time and about the kind of action — whether it is viewed as ongoing, as a whole, or as a settled state. That information is real and sometimes important.

It is also the single most overclaimed thing in popular preaching, and you should know both halves.

What is legitimate. Sometimes a command's form distinguishes "stop doing what you are doing" from "do not start." Sometimes a verb form presents an action as a completed whole rather than a process, and that shapes emphasis. Sometimes a state is presented as standing — something done in the past whose result continues. Translations often signal these with word choice, and footnotes flag them.

What is overclaimed. You have heard a preacher say the Greek present tense means "keep on continually" and build a whole application on it. That is not reliable. Verb forms in Greek indicate how the writer chose to portray an action, not how long it lasted in real life; context, not the form alone, tells you whether repetition is in view. A form can be used for a habitual action, and it can also just be the ordinary way to say the thing.

The working rule for someone without the languages: never let a claim about a verb form carry weight that the sentence and the paragraph do not already support. If the argument only works because of the tense, and nothing else in the passage points that way, it is probably an artifact of the sermon rather than the text.

Grammar is a constraint, not a treasure hunt. It rules readings out more reliably than it rules them in.`,
        exercise: 'Find two places in a sermon or study guide where the speaker\'s point depends entirely on a claim about a Greek or Hebrew verb form. For each, ask: does the rest of the sentence and paragraph point the same direction? Write down which claims survive that test and which do not.',
      },
      {
        id: 'gram-7',
        title: 'Structure Is Theology',
        content: `The order of a passage is not packaging. It carries the argument.

Watch the pattern that runs through the New Testament letters: statement of what is true, then command. Identity first, then duty. "You were raised with Christ" — then, "put to death what is earthly." "I urge you, in view of God's mercies" — the mercies were the previous eleven chapters. "Walk in a manner worthy of the calling to which you were called" — the calling occupied the first three chapters.

Reverse that order and you have changed the religion. Command first, identity as the reward, is a system where behavior earns standing. Identity first, command as the consequence, is a system where standing produces behavior. Same words, opposite gospels, and the only thing distinguishing them is sequence.

The same pattern shows up at Sinai: God's opening line is the reminder that he already brought them out of Egypt. Rescue, then terms. Never the reverse.

So when you outline, keep the order. When you teach, keep the order. And when you are tempted to open with the command because it is more arresting, notice what you are doing to the logic — and if you still want to open there, find a way to get the ground back in before you ask for anything.

This is why structure is not a technical exercise. Get the order right and the theology comes out right almost by itself. Get it backward and no amount of correct content will fix it.`,
        exercise: 'Find three places in the letters where a "therefore" or "so then" separates a statement of what God has done from a command. For each, write the indicative in one sentence and the imperative in one sentence, then answer: what would be lost if the two were swapped?',
        toolHint: 'Phrasing Diagram — the hinge between the theological section and the ethical one is visible in the clause flow',
      },
    ],
    quiz: [
      {
        q: 'A twelve-verse span in a letter is one sentence in the original. The most useful first move is:',
        options: [
          'Treat each verse as an independent statement and study them one at a time',
          'Strip the prepositional phrases and relative clauses until only the main subject and verb remain, then reattach the pieces',
          'Look up every significant word in a lexicon',
          'Find a translation that breaks it into short sentences and study that instead',
        ],
        answer: 1,
        explanation: 'One sentence makes one assertion. Finding the skeleton first tells you what is being claimed; the attached phrases then explain how, in whom, and to what end.',
      },
      {
        q: 'A preacher builds his entire message on a phrase that, in the sentence, is a "when" clause. What has gone wrong?',
        options: [
          'Nothing — every phrase in Scripture is equally weighted',
          'He has preached the circumstance and skipped the assertion the sentence actually makes',
          'Time clauses cannot be preached',
          'He should have used a different translation',
        ],
        answer: 1,
        explanation: 'Subordinate clauses supply setting, reason, or condition for the main clause. Making one of them the thesis leaves the sentence\'s actual claim unpreached — often unnoticed by everyone in the room.',
      },
      {
        q: 'You hit the word "therefore" at the start of a section. What is the disciplined next step?',
        options: [
          'Note it as a transition and continue',
          'Stop and state, in one sentence, everything the "therefore" is drawing on — and if you cannot, go back and read more',
          'Treat it as the beginning of a new topic',
          'Check whether other translations keep the word',
        ],
        answer: 1,
        explanation: '"Therefore" is a claim that what follows rests on what preceded. If you cannot summarize the ground, you are about to teach a conclusion with its argument missing.',
      },
      {
        q: 'In the sentence "Go therefore and make disciples of all nations, baptizing them and teaching them," which is the main command, and why does it matter?',
        options: [
          '"Go" — because it comes first, and the passage is about mission travel',
          '"Baptize" — because it is the concrete action named',
          '"Make disciples" — the other forms are attached to it, so the passage measures disciples made, not trips taken',
          'All four are equal imperatives',
        ],
        answer: 2,
        explanation: 'The attached forms carry real force — you cannot make disciples of the nations without going — but they orbit the central command. Which verb is central determines what a church counts as success.',
      },
      {
        q: '"Do you not know that you are God\'s temple?" appears in a chapter about factions splitting a congregation, followed by a warning about anyone who destroys that temple. The "you" is most likely:',
        options: [
          'Singular — each believer\'s body is the temple',
          'Plural — the congregation together is the temple, and the warning is about wrecking a church',
          'Impossible to determine without Greek',
          'Both, with no difference in meaning',
        ],
        answer: 1,
        explanation: 'The surrounding argument settles it: the subject is a divided church and the danger is destroying it. A different passage does make the individual-body claim — but it is a different argument in a different paragraph.',
      },
      {
        q: 'Without knowing Greek, how can you check whether a "you" is singular or plural?',
        options: [
          'Assume plural in the letters and singular in the Gospels',
          'Look at who is addressed in the surrounding verses, check for plural nouns in the same sentence, and consult a translation or footnote that marks it',
          'Count how many times the word appears',
          'It cannot be checked in English',
        ],
        answer: 1,
        explanation: 'The context usually settles it, and it costs nothing. This one habit changes how a large amount of the New Testament reads.',
      },
      {
        q: 'A speaker claims the Greek present tense here means "keep on continually," and his whole application depends on that claim. Nothing else in the paragraph points that direction. You should:',
        options: [
          'Accept it, since he knows the language',
          'Hold it loosely — verb forms show how a writer portrays an action, not its real-world duration, and a claim carried only by a tense usually comes from the sermon rather than the text',
          'Reject all appeals to Greek grammar',
          'Look for a second preacher who agrees',
        ],
        answer: 1,
        explanation: 'This is the most overclaimed move in popular preaching. Grammar is better at ruling readings out than at generating them, and a point with no support beyond a tense is standing on air.',
      },
      {
        q: 'Two reliable translations disagree about which verb a phrase attaches to. What have you found?',
        options: [
          'A printing error',
          'A genuine interpretive fork worth noting honestly, not papering over',
          'Proof that one translation is unreliable',
          'A place where the original text is corrupt',
        ],
        answer: 1,
        explanation: 'Where translators split, an actual ambiguity exists. Naming it is more honest — and more useful to a hearer — than picking the version that supports the point you wanted.',
      },
      {
        q: 'What is the theological significance of the pattern "you were raised with Christ ... therefore put to death what is earthly"?',
        options: [
          'It shows that behavior produces identity',
          'It is a Greek stylistic convention with no theological weight',
          'It shows that what is already true of a believer is the ground of the command — reversing the order changes it into earning standing by behavior',
          'It shows that commands matter more than doctrine',
        ],
        answer: 2,
        explanation: 'Identity first, then duty. Flip the sequence and the same words describe a religion of performance. Sequence is doing theological work that no individual word in the sentence carries.',
      },
      {
        q: 'Which statement about mapping connectors is accurate?',
        options: [
          'It requires knowledge of the original languages',
          'It mainly helps you identify literary style',
          'It traces the writer\'s reasoning — what causes what, what concludes from what — and can be done fully in English',
          'It is only useful in the letters, not in narrative',
        ],
        answer: 2,
        explanation: 'Connectors carry the logic and survive translation. Mapping them is real exegesis available to any careful reader with no training in Greek or Hebrew.',
      },
    ],
  },
  {
    slug: 'word-study',
    number: 6,
    title: 'Word Study',
    subtitle: 'Mining the Words',
    icon: 'Aa',
    color: '#a070b0',
    lessons: [
      {
        id: 'wrd-1',
        title: 'Which Words Are Worth the Time',
        content: `Word studies are the most enjoyable part of Bible study and the most abused. The abuse starts with looking up the wrong words.

Three kinds of words are worth the effort.

Load-bearing words. The argument depends on them. If the word changed meaning, the paragraph would change. In a passage arguing that people are declared right with God apart from law-keeping, the words for "righteous," "credited," and "law" are load-bearing. The word "man" is not.

Words the translation may be smoothing. When two good translations render the same word differently — "flesh" versus "sinful nature," "servant" versus "slave," "steadfast love" versus "mercy" — a translator made a judgment call, and the range behind the word is worth seeing.

Words the author himself is defining. Sometimes a writer stops and tells you what he means by a term. When he does, that definition governs — and it is worth more than any lexicon entry.

What is not worth studying: connecting words you already understand, ordinary nouns, and any word you are only looking up because you hope it will yield a sermon point.

That last one is the real disease. If you go into a word looking for something surprising, you will find something surprising, because words have ranges and you can always locate an unusual sense somewhere in the range. Then you preach the unusual sense as a hidden treasure. It is not hidden. It is just not what the word means here.`,
        exercise: 'Take Romans 3:21-26. List every word in the paragraph, then cross out everything that is not load-bearing. You should end with fewer than six. Write one sentence for each surviving word explaining why the argument depends on it.',
        toolHint: 'Word Study panel — click a word in the Phrasing Diagram to open its range and canon-wide usage',
      },
      {
        id: 'wrd-2',
        title: 'A Word Is a Range, Not a Definition',
        content: `Words do not have a meaning. They have a range of possible meanings, and context selects one.

Try it in English. "Run" can mean sprinting, managing a company, a tear in fabric, a stretch of good luck, a route, a candidate's campaign, or what a nose does. Nobody hearing "she runs the department" thinks about sprinting. The context does the selecting silently and instantly, and nobody experiences it as difficult.

Biblical words work the same way. One common New Testament word can mean physical body, human weakness, human descent, or a person's whole self set against God. One word for faith can mean trust, faithfulness, or the body of Christian belief. One word for spirit can mean wind, breath, the human spirit, or the Holy Spirit.

So the goal of a word study is not to find the definition. It is to see the range, and then to identify which sense fits this sentence, this argument, this writer, this genre.

Here is the error that follows from missing this. Someone learns that a word can carry a rich theological sense in some passages, and then imports that sense into every passage where it appears — including places where the writer plainly means the ordinary thing. That is called loading a word with all its possible meanings at once, and it produces readings that sound profound and are not there.

One sense per occurrence. The others are still in the dictionary; they are not in this sentence.`,
        exercise: 'Find four places where your translation uses the word "flesh," across different books. For each, write which sense fits — physical body, human weakness, human descent, or the self opposed to God — and the specific words in the sentence that told you. Notice you did this with no Greek at all.',
      },
      {
        id: 'wrd-3',
        title: 'Usage Beats Origin',
        content: `The most common word-study error is assuming a word means what its parts or its history suggest.

The standard illustration: an English word for a powerful explosive comes from a Greek word for power. That does not mean the Greek word for power means "explosive," and a sermon claiming that the gospel is the "dynamite" of God is running the history backward across two thousand years and a chemistry invention.

Words drift. Origin tells you where a word has been, not where it is. What settles meaning is how the writer and his contemporaries actually used it.

Work the most famous case in popular teaching. There are several Greek words for love, and one of them gets described as the special, selfless, divine kind of love, distinct from mere affection or friendship. That distinction does not hold up in usage. The word in question was ordinary in Greek and gets used for a wide spread of affections, including some the Bible describes negatively — people loving darkness, loving the praise of others, loving the present world.

Which means the meaning is not sitting inside the word waiting to be released. It gets established by the writer, in the argument, with content he supplies. When a writer wants to say what this love is, he defines it — patient, kind, not envious, not self-seeking — or he points at the cross and says, that is what it looks like.

That is a better teaching, and it is true. The word did not arrive pre-loaded. The writer loaded it, and he did it in front of you.`,
        exercise: 'Find three places where your translation uses "love" for something the Bible views as wrong — loving darkness, loving money, loving human praise. Look up which Greek word each uses if you have a tool that shows it. Then write what actually determines the moral quality of the love in each passage.',
      },
      {
        id: 'wrd-4',
        title: 'The Four Word-Study Fallacies',
        content: `Learn these four by name and you will catch most bad word work, including your own.

The root fallacy. Assuming a word's meaning is contained in its parts or its ancestor word. A word for "church" is built from parts meaning "called out," and preachers routinely announce that the church is therefore "the called-out ones." The parts do say that. The word in ordinary usage simply meant an assembly, including a civic town meeting. There is a real theological point available about being called — it just is not sitting inside the etymology.

Total transfer. Importing every meaning a word can have into one occurrence. If a word can mean wind, breath, and Spirit, an occurrence about a strong wind is about a strong wind.

Anachronism. Reading a later meaning back into an earlier text. The classic is defining an ancient word by what its English descendant means now — treating a word for "witness" as if it carried the modern sense of dying for a cause, when that sense developed later out of what happened to witnesses.

One word, one concept. Assuming a concept is present only where its main word appears, and that wherever the word appears, the concept is at full strength. Grace is taught in passages that never use the word; the word appears in passages that are not about grace at all — including ordinary greetings.

The cure for all four is the same and it is boring: look at how the author uses the word elsewhere, in sentences, in context, and let the sentences decide.`,
        exercise: 'Pick a word you have heard explained by its parts in a sermon — "church," "fellowship," "worship," "repent." Find five actual uses of that word in Scripture using a concordance. Then write down whether the parts-based explanation survives contact with the five sentences.',
      },
      {
        id: 'wrd-5',
        title: 'How to Do a Word Study With Almost Nothing',
        content: `You do not need Greek or Hebrew. You need a concordance — a list of every place a word appears — and about forty minutes. Most Bible apps have one built in and it is free.

Six steps.

Confirm you are tracking one word. Look up the entry so you know your English word represents a single underlying word, not three different ones rendered the same way. This step alone prevents most amateur mistakes.

Read every use by the same author first. How a writer uses a word elsewhere is far better evidence than how a different writer three hundred years earlier used it.

Then read the uses in the same genre and period, then wider.

Watch for the author's own definition. Writers sometimes define outright: faith is the assurance of things hoped for; love is patient and kind; this is love, that he laid down his life. When a writer defines his term, the argument is over.

Use parallel lines. In Hebrew poetry the second line often pairs a word with a near-synonym or an opposite. That pairing defines the word for free, and it is the single most efficient tool available for Old Testament vocabulary.

Watch the company it keeps. What words appear alongside it? What is it contrasted with? A word contrasted with "darkness" and a word contrasted with "ignorance" are doing different jobs even if the same English word is used.

Then write one sentence: in this passage, this word means this, and here is the evidence.`,
        exercise: 'Do a full word study on "steadfast love" or "mercy" in the Psalms using only a concordance. Read fifteen occurrences. Note every place the word is paired with another word in a parallel line. Then write your one-sentence conclusion with three pieces of evidence.',
      },
      {
        id: 'wrd-6',
        title: 'Hebrew Words Work Differently',
        content: `Old Testament vocabulary has features worth knowing even if you never learn the language.

Hebrew is concrete. Where English reaches for an abstraction, Hebrew often reaches for a body part or a physical action. Where we say "compassion," a Hebrew word for it is related to the word for a womb. Where we say "anger," the text may say the nose burned. Where we say "stubborn," it says stiff-necked — the image of an ox that will not turn under the yoke.

That concreteness is not primitive. It is a different way of carrying meaning, and it means the physical image is usually part of the point rather than decoration on top of it.

Hebrew vocabulary is also smaller than Greek, so single words cover more ground and lean harder on context. One important word gets rendered steadfast love, lovingkindness, mercy, or covenant faithfulness depending on the translator, because no single English word covers loyal commitment inside a binding relationship. When your translation gives you one of those, remember it is a translator's choice from a range.

And Hebrew builds meaning by pairing. Words come in pairs, phrases come in pairs, lines come in pairs. Watching what a word is paired with, over and over, teaches you the word.

One caution specific to Hebrew: the abundance of vivid images makes it tempting to build sermons on the picture inside a word. Sometimes the image is live and the writer is playing on it. Sometimes the word has simply become the ordinary way to say the thing, the way "breakfast" no longer makes anyone think about breaking a fast. Check whether the passage does anything with the image before you make it the point.`,
        exercise: 'Look up how three different translations render the same Hebrew word in Psalm 136 — the word repeated in every verse. List the English words used. Then write what the range of those English words together tells you that no single one of them says.',
      },
      {
        id: 'wrd-7',
        title: 'What a Word Study Cannot Settle',
        content: `The unit of meaning is the sentence, not the word. Words are the pieces; sentences are where meaning happens.

This has a hard consequence. A word study can never overturn the argument of the paragraph. If your word work produces a meaning that fights the flow of the passage, the word work is wrong. That is not a rule about humility. It is how language functions — context selects the sense, so a sense that does not fit the context was not selected.

Which means word studies are mainly a confirming and sharpening tool. They tell you which of several possible readings the vocabulary supports, they recover freight that English has flattened, and they occasionally show you that a familiar word is doing something you assumed it was not. They rarely produce a whole new interpretation, and when they seem to, be suspicious.

Then the delivery question. If you are teaching this, the hearer does not need your word work. They need what it produced. Ten minutes on a Greek word in front of a congregation usually accomplishes two things: it convinces people the Bible cannot be understood without an expert, and it fills the time that should have been spent making the passage land.

Do the work. Carry the result. Mention the original word only when a hearer genuinely cannot follow without it, and then in one sentence.

The measure of good word study is that your explanation of the passage gets clearer and more specific, and nobody has to know why.`,
        exercise: 'Take the best thing you have learned from any word study you have done and write it as one sentence a person with no training would understand, with no Greek or Hebrew in it. If you cannot, you have not finished the study.',
        toolHint: 'Word Study panel — use it to sharpen your reading of the clause, then close it and say what you found in plain English',
      },
    ],
    quiz: [
      {
        q: 'You are studying a paragraph arguing that people are declared right with God apart from law-keeping. Which word is worth a word study?',
        options: [
          '"And" — because connectives carry logic',
          '"Credited" — because the argument turns on what it means for something to be counted to someone',
          '"Man" — because anthropology matters',
          'Every word, systematically',
        ],
        answer: 1,
        explanation: 'Load-bearing means the argument would change if the word changed. Study the words the passage is leaning on, not the ones you happen to be curious about.',
      },
      {
        q: 'A preacher explains that the Greek word for power is the source of the English word for a powerful explosive, and says the gospel is the "explosive" of God. The problem is:',
        options: [
          'The etymology is incorrect',
          'He is running word history backward across two thousand years — origin shows where a word has been, not what it means',
          'He should have used the Hebrew instead',
          'The word does not appear in that verse',
        ],
        answer: 1,
        explanation: 'The English derivation is real; the inference is not. Meaning is set by how a word was used at the time of writing, and a nineteenth-century invention cannot define a first-century word.',
      },
      {
        q: 'A word can mean wind, breath, or Spirit. In a passage describing a storm, a reader argues that all three senses are present at once, giving the storm a hidden spiritual meaning. This is:',
        options: [
          'Sound, since the word carries all three meanings',
          'The error of loading one occurrence with every meaning a word can have — context selects one sense',
          'Acceptable in poetry but not in narrative',
          'Correct only if another biblical writer makes the connection',
        ],
        answer: 1,
        explanation: 'Ranges live in dictionaries; sentences select. Stacking every possible sense onto one occurrence produces readings that sound rich and are not in the text.',
      },
      {
        q: 'A word for "church" is built from parts meaning "called out," and in ordinary Greek usage it meant an assembly — including a civic town meeting. The disciplined conclusion is:',
        options: [
          'The church is "the called-out ones," and the etymology proves it',
          'The parts do not establish the meaning; usage does — and there is a real theological point about being called, just not one that comes from the word\'s construction',
          'The word has no theological significance at all',
          'The civic usage is irrelevant because Scripture redefines all words',
        ],
        answer: 1,
        explanation: 'The doctrine of calling is taught plainly elsewhere. Hanging it on a word\'s parts is unnecessary and teaches readers a method that will fail them on the next word.',
      },
      {
        q: 'While studying an Old Testament word, you notice it repeatedly appears in the second line of a couplet, paired with a near-synonym. What is that worth?',
        options: [
          'Nothing — poetry is decorative',
          'It is one of the most efficient definition tools available: the pairing shows the writer\'s own sense of the word\'s neighborhood',
          'It proves the word has only one meaning',
          'It means the word is being used figuratively',
        ],
        answer: 1,
        explanation: 'Hebrew poetry defines by pairing. Collecting what a word is repeatedly set beside — or against — gives you usage evidence directly from the text, with no lexicon.',
      },
      {
        q: 'What is the first step of an honest word study using only an English Bible and a concordance?',
        options: [
          'Read the theological dictionary entry',
          'Confirm that your English word represents a single underlying word rather than several different words rendered the same way',
          'Find the most theologically interesting occurrence',
          'Count how many times the word appears in the whole Bible',
        ],
        answer: 1,
        explanation: 'English translations often use one word for several originals and several words for one original. Skipping this check is the fastest way to a study that was never about one word at all.',
      },
      {
        q: 'Your word study produces a meaning that cuts against the flow of the paragraph. What should you conclude?',
        options: [
          'The paragraph must be reread in light of the word study',
          'The word study is wrong — context selects the sense, so a sense that does not fit was not the one in play',
          'Both readings are valid',
          'The translation is at fault',
        ],
        answer: 1,
        explanation: 'The sentence is the unit of meaning. A word study is a confirming and sharpening tool; when it fights the paragraph, the paragraph wins every time.',
      },
      {
        q: 'A writer stops mid-argument and says, in effect, "this is what I mean by this term." How much weight does that carry?',
        options: [
          'Less than a lexicon, which is based on wider evidence',
          'Decisive for that passage — an author defining his own term settles the question',
          'It applies only to that sentence, not the paragraph',
          'It is a rhetorical device, not a definition',
        ],
        answer: 1,
        explanation: 'Authorial definition outranks every outside source. When a writer supplies his own content for a term, the study is essentially over for that context.',
      },
      {
        q: 'Someone argues that one particular Greek word for love always means selfless, divine love. The best correction is:',
        options: [
          'That word is actually the weakest of the Greek love words',
          'Usage shows it covering a wide spread of affections, including ones Scripture condemns — the moral content comes from the writer\'s argument, not from the word itself',
          'Greek has only two words for love, so the distinction is invented',
          'The distinction holds in the letters but not the Gospels',
        ],
        answer: 1,
        explanation: 'Scripture uses that word for loving darkness, money, and human praise. The writers define the love they mean by describing it or by pointing at the cross — which is a better teaching than the word-magic version.',
      },
      {
        q: 'How much of your word study belongs in front of a congregation or a study group?',
        options: [
          'All of it — showing the work builds confidence in the Bible',
          'None of it, ever',
          'The result, in plain English — with the original word mentioned only when a hearer genuinely cannot follow without it',
          'Only the parts drawn from Hebrew, since Greek is more familiar',
        ],
        answer: 2,
        explanation: 'Extended language display teaches people that Scripture is inaccessible without an expert. Do the work, carry the result, and let the passage land in words everyone in the room already has.',
      },
    ],
  },

  {
    slug: 'historical-background',
    number: 7,
    title: 'Historical Background',
    subtitle: 'Enter the Ancient World',
    icon: '⊕',
    color: '#50a080',
    lessons: [
      {
        id: 'hist-1',
        title: 'The Gap, and What Falls Into It',
        content: `Between you and the text is a gap: two to four thousand years, several languages, a different economy, a different legal system, and a social operating system almost nothing like yours.

The first readers did not need any of it explained. That is the problem. What everyone knows never gets written down, so the assumed knowledge is exactly the part missing from the page.

Watch what falls into the gap in one line. A religious leader complains that a certain teacher "receives sinners and eats with them." Read with modern assumptions, that is a complaint about his choice of dinner companions — mildly judgmental, easily dismissed.

Now put the missing knowledge back. In that world, sharing a table was a public declaration of association and mutual acceptance. Who you ate with announced who you belonged with, and it was watched. So the complaint is not about a meal. It is the accusation that this teacher is publicly identifying himself with people the community had formally excluded — and it is a serious charge, made in public, with consequences.

The words did not change. The weight did, by a factor of ten.

That is what background work is for. It does not add meaning. It recovers meaning that was always in the text and that the first hearers got for free.

And note the direction it moves. Real background almost always makes a passage land harder in the direction it was already going. That is a useful test, and the next lessons will sharpen it.`,
        exercise: 'Read Luke 15:1-2, then read the three parables that follow as a single answer to that accusation. Write one sentence explaining what the accusation actually charged, and one sentence on how the third parable answers the accusers specifically.',
        toolHint: 'Cultural Context markers (◈) — flagged phrases carry freight a first reader had automatically',
      },
      {
        id: 'hist-2',
        title: 'Honor, Shame, Patrons, and Households',
        content: `The ancient Mediterranean ran on a social system you do not live in. Four features explain an enormous amount.

Honor and shame were the working currency. Public reputation was a family's real capital — it determined who would deal with you, marry into you, and back you in a dispute. Honor was gained and lost publicly, in front of witnesses, and defending it was not vanity but survival. When you see a public challenge and a clever answer in the Gospels, you are watching a formal exchange everyone in the crowd could score.

Patronage organized much of the economy. A patron with resources granted benefits; a client received them and repaid with loyalty, public praise, and service. A gift of that kind arrived with a relationship attached — that is the ordinary expectation the sources show, though how far it reaches into any particular text is argued over. This is the world in which the language of grace, gift, and the response owed for it does its work, and where it holds, a "free gift" is not a transaction-free gift; it is a gift that creates a bond. Note that this is a reconstruction of a social system, not a sentence of the text — which means the next lesson's fence applies to it too.

The household was the basic unit, not the individual. A household included extended family, servants or slaves, and dependents. When a text says a household believed and was baptized, it is describing a social unit turning, not a coincidence of individual decisions.

Group came before self. People understood themselves primarily by the groups they belonged to — family, town, nation, trade. Modern readers instinctively read the Bible's "you" as "me." Most of the time it is "you people."

None of this is trivia. Get the social system wrong and you will consistently read collective texts as individual ones and public exchanges as private ones.`,
        exercise: 'Read Luke 14:7-14 (the seating at a banquet). Identify the honor exchange: what is at stake in choosing a seat, who is watching, and what the closing instruction about inviting people who cannot repay does to the patronage system. Write it out.',
      },
      {
        id: 'hist-3',
        title: 'Geography Is Argument',
        content: `Places in Scripture carry meaning the way names do. A writer naming a location is often making a claim.

Some of it is physical and practical. Israel is a land bridge between empires, which is why armies keep marching through it and why its politics are never local. Water is scarce and rain-dependent, which is why drought is a covenant sanction with teeth and why a promise of rain is a promise of survival. A journey up to Jerusalem is literally uphill from almost anywhere, which is why the pilgrimage songs are songs of ascent.

Some of it is loaded by history. Egypt means both refuge and slavery. Babylon means exile and the empire that took everything. Samaria means a rival worship center and a bitter ethnic split. A wilderness means testing and formation, because that is what happened there the first time. A mountain means encounter, because that is where the covenant was given.

So when a narrative says a person went through Samaria, or that a confrontation happened on a particular ridge, or that a teacher withdrew to a wilderness for forty days, the location is doing work. Read the place name as a claim and ask what it evokes.

Two practical habits. First, look at a map every time a place is named — not for tourism, but for distance, terrain, and who controlled it. Second, ask why here, and ask whether the writer stated the location at all. Ancient writers did not mention geography for color.`,
        exercise: 'Read 1 Kings 18 and locate Mount Carmel on a map: what territory is it near, what does it overlook, and who would claim it. Then read the number of miles from Carmel to Jezreel and reread the last three verses of the chapter with that distance in mind.',
        toolHint: 'Geography Map tile — distances and terrain are usually the missing half of a narrative',
      },
      {
        id: 'hist-4',
        title: 'Which Empire Is Behind Your Text',
        content: `The Bible spans several imperial eras, and knowing which one your passage sits in tells you what pressures the writer and audience were under.

Egypt: the origin story of the nation is escape from forced labor under a god-king. Every later act of oppression gets measured against it.

Assyria: brutal, expansionist, deportation as policy. It destroys the northern kingdom. Prophets of that era write under the shadow of an army that does not lose.

Babylon: destroys Jerusalem and the temple, deports the leadership, and creates the crisis that the exile literature exists to answer — how do you sing, worship, and stay a people with no land, no king, and no temple.

Persia: allows the return and the rebuilding, and rules a vast, bureaucratic, relatively tolerant empire. The post-exile books read completely differently once you know the returnees are a small, poor province under imperial administration rather than a restored kingdom.

Greece: after Alexander, a cultural empire. The pressure is not primarily military but assimilation — language, education, and custom, with a violent crisis when a ruler tries to force it.

Rome: military occupation, taxation, client kings, and a state cult in which loyalty language was religious language. This is the world of the New Testament, and it is why calling someone Lord and Savior — titles the empire used for its emperor — was never merely devotional.

You do not need dates memorized. You need to know which empire is standing behind the page, because that determines what a promise of deliverance would have meant to the people who first heard it.`,
        exercise: 'Take three passages from different eras: Isaiah 10:5-19, Psalm 137, and Philippians 3:20. For each, name the empire in the background and write one sentence on how that empire changes what the passage is claiming.',
        toolHint: 'Monarchy Timeline — shows which king and which empire stand behind a given prophet',
      },
      {
        id: 'hist-5',
        title: 'Temple, Sacrifice, Priest, Festival',
        content: `A large portion of the New Testament is written in the vocabulary of a worship system that no longer runs. Without the system, the vocabulary is noise.

Four pieces to know.

The sanctuary had graded zones of access — outer courts, then a holy place, then an inner room entered once a year by one man with blood. The architecture was itself an argument about holiness and distance. So a report that the curtain separating that inner room was torn is not scenery. It is a claim about access.

Sacrifice was ordinary, public, and expensive. Different offerings did different jobs — some for atonement, some for thanks, some for fellowship, some entirely burned. When the New Testament calls something a sacrifice, ask which kind.

The priesthood was a mediating office: someone who could approach on behalf of people who could not. Calling Jesus a high priest is a structural claim about mediation, and the argument that runs through Hebrews only works if you know what that office did and how its access was limited.

Festivals were the calendar, and each one retold a story. Passover retells the rescue from Egypt with a lamb and blood on doorposts. So calling Christ our Passover lamb is not a warm image; it names a specific event, a specific mechanism, and a specific deliverance.

You can learn the whole system in a couple of hours by reading Leviticus 16 and Hebrews 9 side by side. That is a genuinely high-return afternoon.`,
        exercise: 'Read Leviticus 16 and list what happens on the Day of Atonement: who enters, how often, with what, what is done with each animal, and what the people do. Then read Hebrews 9:1-14 and mark every place it assumes you know that chapter.',
        toolHint: 'OT Worship Structures tile — the floor plans make the graded access visible at a glance',
      },
      {
        id: 'hist-6',
        title: 'Where Background Stops',
        content: `Now the fence, because this is the skill that goes bad most attractively.

Background illuminates a text. It does not overrule it. If a claimed historical fact makes a passage mean the opposite of what its words say, the claim is what should be doubted.

And some of the most repeated background claims in preaching have no evidence behind them.

The best-known example: the explanation that a certain narrow gate in Jerusalem was called the Needle's Eye, and that a camel could squeeze through kneeling, so the saying about a camel and a needle means salvation is merely difficult. There is no ancient evidence for such a gate. The explanation appears far later, and its effect is to soften a deliberately impossible image — which is exactly why the disciples respond by asking who then can be saved, and why the answer is that it is impossible for people and possible for God. The invented background does not just add color. It deletes the point.

Three questions before you use a background claim.

Where does this come from? A source you can name, or a preacher you heard?

Does it change the passage's direction? Real background intensifies what the text already says. A "fact" that reverses the plain sense should be assumed wrong until proven.

Would the point survive without it? If your whole application collapses when the background claim is removed, you built the house on the least verifiable material available.

Background is scaffolding. It should let you build; it should not be load-bearing.`,
        exercise: 'Write down three background claims you have heard in sermons — about ancient customs, words, or places. For each, ask the three questions. Then find one you cannot source and note what happens to the sermon point when you remove it.',
      },
      {
        id: 'hist-7',
        title: 'Getting Background Honestly With Little',
        content: `You do not need a research library. Three sources will carry most of the load, and you already have the first one.

The Bible itself. Scripture is its own best background source, and it is underused. Institutions, customs, and offices are described inside the text. If you want to know what a Levite did, the law describes it. If you want to know what a Pharisee believed, several passages tell you and one debate turns on it explicitly. If you want to know what exile did to people, the exile literature says so at length. Cross-references and a concordance turn the Bible into a background tool for free.

The text's own assumptions. Ask directly: what does this passage assume I already know? Then go find that. A passage that mentions a ritual, a coin, an office, a festival, or a legal procedure is telling you exactly what to look up. This turns background work from an endless subject into a short, specific list per passage.

A reference work, used narrowly. A Bible dictionary or an atlas answers a defined question in five minutes. The failure mode is reading widely and absorbing colorful claims with no way to check them. Look up the specific thing your passage assumes; stop when you have it.

And label what you have. Sourced means you could show someone where it comes from. Assumed means you are reasoning from a pattern. Heard means you cannot source it and it should not go in front of people as fact. That labeling habit is the whole difference between a teacher who is trustworthy and one who is merely interesting.`,
        exercise: 'Take a passage you are studying and write the list of everything it assumes you know — every office, custom, place, object, and institution. Then answer as many as you can from Scripture alone using cross-references, and mark which ones still need an outside source.',
      },
    ],
    quiz: [
      {
        q: 'A religious leader complains that a teacher "receives sinners and eats with them." Recovering the background shows the complaint is about:',
        options: [
          'Ritual purity rules about food',
          'Public association — sharing a table declared who you belonged with, so the charge is that he is publicly identifying with the excluded',
          'Poor time management',
          'Breaking a Sabbath regulation',
        ],
        answer: 1,
        explanation: 'Table fellowship was a public statement of belonging. Without that, the complaint reads as petty; with it, it is a serious, public accusation — and the parables that follow are the answer to it.',
      },
      {
        q: 'In a patronage economy, what does it change when a text describes salvation as a gift?',
        options: [
          'Nothing — a gift is a gift in any culture',
          'A gift in that world created a bond and an expected response of loyalty, so "free" does not mean relationship-free',
          'It means the gift had to be repaid in money',
          'It means the language is metaphorical only',
        ],
        answer: 1,
        explanation: 'There was no such thing as an unattached benefit. The gift is unearned and it creates a bond — which is why gratitude, loyalty, and allegiance follow in the text rather than being added on later.',
      },
      {
        q: 'A narrative reports that a household believed and was baptized. Reading with the ancient social unit in mind, this describes:',
        options: [
          'A coincidence of separate individual decisions',
          'A social unit — extended family, servants, dependents — turning together, which is how that society made decisions',
          'A later editorial summary',
          'Only the adults in the family',
        ],
        answer: 1,
        explanation: 'The household, not the individual, was the basic social unit. Reading it as a set of independent private choices imports a modern framework the text does not have.',
      },
      {
        q: 'You are told that a narrow gate called the Needle\'s Eye existed in Jerusalem, so the camel saying means salvation is merely difficult. What should you do?',
        options: [
          'Accept it — it makes the passage more understandable',
          'Doubt it: there is no ancient evidence for such a gate, and the claim reverses the passage — which is why the hearers ask who then can be saved',
          'Use it as an illustration but not as exegesis',
          'Check whether the gate still exists today',
        ],
        answer: 1,
        explanation: 'This is the cautionary case for the whole skill. The invented background does not decorate the text; it deletes the impossibility the passage is built on, and the disciples\' reaction proves the impossibility was the point.',
      },
      {
        q: 'What is the most reliable test that a background claim is being used well?',
        options: [
          'It comes from a scholar',
          'It makes the passage more interesting',
          'It intensifies what the passage already says rather than reversing its direction',
          'It is repeated in several commentaries',
        ],
        answer: 2,
        explanation: 'Genuine background recovers meaning that was always there, so it pushes the text harder in its own direction. A claim that turns a text around is the one to investigate first.',
      },
      {
        q: 'Which empire stands behind the New Testament\'s use of "Lord" and "Savior," and why does it matter?',
        options: [
          'Persia — the titles come from Persian court language',
          'Rome — those were titles in imperial usage, so applying them to Jesus was a public allegiance claim, not only a devotional one',
          'Greece — the titles are philosophical',
          'Babylon — the titles come from exile literature',
        ],
        answer: 1,
        explanation: 'Under Roman occupation, loyalty language was religious language. Naming Jesus with the empire\'s own titles was a claim everyone in that world could hear.',
      },
      {
        q: 'Why does a report that the curtain in front of the innermost sanctuary was torn carry weight?',
        options: [
          'It shows the age of the building',
          'The sanctuary had graded zones of access, with that room entered once a year by one man with blood — so the tearing is a claim about access',
          'It signals an earthquake',
          'It marks the end of the sacrificial calendar year',
        ],
        answer: 1,
        explanation: 'The architecture was an argument about holiness and distance. Without the system, the detail reads as scenery; with it, it is the point.',
      },
      {
        q: 'A passage mentions a Levite, a festival, and a specific coin. The most efficient background approach is:',
        options: [
          'Read a general history of the ancient world',
          'Let the passage set your list: look up exactly what it assumes you know, starting with what Scripture itself describes',
          'Skip background and study the grammar instead',
          'Read several commentaries on the passage',
        ],
        answer: 1,
        explanation: 'The text tells you what to research. That turns an unbounded subject into a short list, and Scripture answers a surprising share of it through cross-references alone.',
      },
      {
        q: 'Why does knowing which empire is behind a prophetic book change how you read its promises of deliverance?',
        options: [
          'Because prophecy is always about politics',
          'Because the pressure the audience was under — deportation, assimilation, occupation — determines what deliverance would have meant to them',
          'Because empires determine the genre',
          'Because the prophets wrote after the empires fell',
        ],
        answer: 1,
        explanation: 'The same promise means different things to people facing an unbeatable army, forced assimilation, or occupation. Naming the pressure is how you recover what was actually being promised.',
      },
      {
        q: 'When you teach, how should you label a background claim you heard in a sermon but cannot source?',
        options: [
          'State it as fact; the source does not affect its truth',
          'Do not present it as fact — the difference between sourced, inferred, and merely heard is what makes a teacher trustworthy',
          'Attribute it to the preacher you heard it from',
          'Use it only in illustrations',
        ],
        answer: 1,
        explanation: 'Unsourced claims delivered as fact are how invented background spreads. Labeling costs one clause and protects both you and everyone who repeats you.',
      },
    ],
  },

  {
    slug: 'intertextual',
    number: 8,
    title: 'Intertextual Connections',
    subtitle: 'Scripture Interprets Scripture',
    icon: '⇌',
    color: '#c09040',
    lessons: [
      {
        id: 'int-1',
        title: 'The Writers Read Each Other',
        content: `The biblical authors were readers first. Later writers knew the earlier books, quoted them, argued from them, and built their sentences out of their vocabulary. Reading a New Testament passage without hearing what it is quoting is like walking into an argument at minute forty.

The scale of this surprises people. Some New Testament chapters are almost entirely constructed from earlier Scripture — a phrase here, an image there, a structure borrowed whole. Revelation quotes the Old Testament almost never in a formal way and alludes to it in nearly every verse.

Why they do it matters. A New Testament writer quoting a prophet is not decorating his point with a proof text. He is making a claim: this is what that was about, and it is happening now. The quotation is the argument, not the ornament.

Which means a quotation is a door. When you hit one, stop and go read the source passage in its own context — the whole paragraph, not the quoted line. Then come back and ask three questions. What did it mean there? What is the later writer claiming by using it? And does he use it in the same sense, or is he doing something more complicated?

That third question is where this gets interesting, and it is the subject of the next lessons. But even the simple version of this habit — always read the quoted passage in its own setting — will put you ahead of most readers immediately.`,
        exercise: 'Take Acts 2:14-21. Read the quoted passage from Joel in its own chapter first — the whole thing, including what comes before and after. Then return and write what the preacher in Acts is claiming by using it.',
        toolHint: 'Cross-Reference strip — click a reference to load the source passage in its own context',
      },
      {
        id: 'int-2',
        title: 'Quotation, Allusion, Echo — and How to Tell',
        content: `Earlier Scripture shows up in later Scripture at three volumes.

Quotation. Marked, usually with a formula: "as it is written," "the Scripture says," "David says." Unmissable, and the easiest to work with.

Allusion. Unmarked but deliberate. A distinctive phrase, name, or image the writer expects you to recognize. Calling someone the Lamb of God is an allusion — no formula, no citation, and yet it carries the whole sacrificial system and a particular prophetic passage with it.

Echo. The faintest level. A phrase or pattern resonates with an earlier text without being a deliberate citation, and it may have been unconscious on the writer's part, the way anyone steeped in a book starts to talk like it.

Now the honest part. Echoes are real, and echo-hunting is also where readers manufacture connections that are not there. Any two texts share some words. So use tests before you build anything on one.

Is the wording distinctive? Shared common words prove nothing. Shared rare phrases are evidence.

Was the earlier text available and prominent for this writer and audience? A widely known passage is a plausible source; an obscure one is a harder case.

Does this writer use that earlier book elsewhere? Writers have habits. Someone who quotes a particular prophet six times is a plausible candidate for alluding to him a seventh.

Does the connection do work? A real allusion adds something — it explains a difficulty, sharpens the claim, or accounts for an odd word choice. A connection that adds nothing but a pleasant resonance is probably yours, not the author's.

Rank your finds: certain, probable, possible. Teach the first two. Mention the third as a possibility or not at all.`,
        exercise: 'Read John 1:1-5 and list every phrase that sounds like Genesis 1. For each, decide whether it is quotation, allusion, or echo, and write your evidence. Then answer: what is John claiming by opening this way, and what does it let him assert about the Word before verse 14?',
      },
      {
        id: 'int-3',
        title: 'When the Quotation Does Not Seem to Fit',
        content: `Sooner or later you will read a New Testament quotation, go back to the source, and find that it is not obviously about what the later writer says it is about. This is the moment many readers quietly panic or quietly stop checking.

Do neither. Work it.

Take the clearest case. A Gospel says that a family's return from Egypt fulfilled the words "Out of Egypt I called my son." Go read the source and it is plainly about Israel — a backward look at the nation's rescue, not a prediction about anyone.

So what is the Gospel writer doing? He is making a typological claim, not a prediction claim. He is saying: Israel was called God's son and brought out of Egypt, and now here is Jesus, doing the nation's story again and doing it right — down to the geography. The pattern is the argument. He then makes it repeatedly: forty days in a wilderness where the nation had forty years, a mountain, a testing, quotations drawn from the same book of the nation's wilderness period.

Once you see the method you can read it everywhere, and it stops being a problem to be defended and becomes the point.

Three shapes this takes. Direct prediction and fulfillment — the source really is forward-looking. Pattern fulfillment — an earlier event, person, or institution has a shape that is filled by a later one. And filling out — a later writer sees the full weight of something the earlier text said, which the earlier audience could not have seen yet.

You are allowed to say which one is happening. What you are not allowed to do is pretend a pattern claim is a prediction claim, or wave off the difficulty. State how the writer is using it and defend that.`,
        exercise: 'Read Matthew 2:15 and then read Hosea 11 in full. Write what the Hosea passage is about in its own context. Then write, in your own words, the claim Matthew is making — and label whether it is prediction, pattern, or filling out.',
      },
      {
        id: 'int-4',
        title: 'Typology: What Makes a Type Real',
        content: `Typology is the reading of earlier persons, events, and institutions as divinely shaped patterns that anticipate later fulfillment. It is not an invention of later interpreters; the biblical writers do it explicitly and call attention to it.

But typology has requirements, and a claim that fails them is not typology — it is allegory with a better reputation.

Four tests.

Historical reality. The type must be a real person, event, or institution. Typology is not "this story secretly means something else"; it is "this really happened, and God gave it a shape."

Genuine correspondence. The resemblance must be structural, not incidental. Both involve a sacrifice, a rescue, a mediator, a covenant — not both involve wood, or the number three, or a red object.

Escalation. The fulfillment is greater than the type, and the biblical writers say so explicitly: a greater priest, a better covenant, a more permanent sacrifice, a superior rest. If your proposed pattern has no escalation, check it again.

Canonical warrant. Either a biblical writer makes this connection, or the pattern is traced so broadly across Scripture that it holds on its own weight. A passover lamb, a mediating priest, an exodus, a temple, a king from a particular line — these are developed across the whole canon.

Run the tests on a solid case. Passover: a real event; correspondence in substitution, blood, and deliverance from death; escalation from annual repetition to once for all; and an explicit New Testament statement making the identification. Four for four.

Now run them on the claim that a particular color or object in a narrative secretly represents the blood of Christ. Historical, yes. Correspondence — incidental, not structural. Escalation — none. Canonical warrant — none. That is not a type. It is a color.`,
        exercise: 'Run the four tests on three proposed types: the bronze serpent (see John 3:14-15), the rock in the wilderness (see 1 Corinthians 10:1-4), and the scarlet cord in the window in Joshua 2. Write the verdict and your reasoning for each.',
      },
      {
        id: 'int-5',
        title: 'Where Typology Goes Wrong',
        content: `The failure mode is over-reading, and it is attractive because it produces sermons that feel deep and land well.

Three common forms.

Allegorizing the props. Every object in a scene gets assigned a spiritual meaning. The twelve jars of water poured over an altar become twelve things; the trench becomes surrender; the wood becomes the cross. Ask instead what job the detail is doing in the story. In that scene, the water and trench exist to eliminate any natural explanation for the fire — they are evidence, and that is a complete and sufficient account of them.

Turning every figure into a Christ-figure. Some Old Testament figures do carry a genuine forward-pointing office. Many do not, and the places preachers reach hardest are often the worst candidates. A prophet who mocks his opponents and then executes them does not prefigure the one who, when reviled, did not revile in return. The honest and far more powerful move there is contrast: on that mountain the true prophet kills the false prophets; at the cross the false authorities kill the true prophet, and that death is the one that saves.

Numbers and details as code. Seven, forty, twelve, three — these carry real conventional weight in biblical literature. That is different from decoding every number as a hidden message. The test is whether the text does anything with the number.

The general rule: a detail's job in its own story is the first and usually final account of it. Reach for a second layer only when the text, or the canon, hands it to you.`,
        exercise: 'Take a narrative you have heard preached with heavy symbolic detail. List each detail the preacher assigned a meaning to. Then, for each one, write what job that detail does in the story itself. Compare the two lists and note how many spiritual meanings survive.',
      },
      {
        id: 'int-6',
        title: 'Working an Apparent Contradiction',
        content: `Two passages appear to say opposite things. This is where careless readers pick a side and careless harmonizers force a fit. There is a better method.

Take the standard case. One writer says a person is justified by faith apart from works of the law. Another says a person is justified by works and not by faith alone. Flat contradiction, if the words mean the same thing in both.

Four steps.

Define each writer's terms from his own usage. When the first writer says works, he consistently means law-observance offered as the basis for standing with God. When the second gives examples of works, he gives acts of obedience and mercy that flow from trust. Same English word, different referent.

Identify each writer's question. The first is answering how a guilty person is brought into a right standing with God. The second is answering what kind of faith is real, against people claiming a belief that changes nothing. Different questions produce different answers without either being wrong.

Check each writer's opponent. The first is arguing against people adding law-keeping as a requirement. The second is arguing against people treating bare assent as sufficient. Knowing who each is fighting explains the emphasis.

Only then state the relationship. Trust alone brings a person into right standing, and the trust that does so is never alone in the life that follows. That is a synthesis, and it was earned by four steps of work rather than by picking a favorite.

Now the honesty clause. Some tensions in Scripture do not resolve neatly, and pretending otherwise trains people to distrust you when they eventually notice. When a tension is real, say what each text says, say what is settled, and say where the pressure remains.`,
        exercise: 'Work Romans 3:28 and James 2:24 through all four steps yourself, writing out each step. Then find each writer\'s use of Abraham and note which moment in Abraham\'s life each one appeals to — that detail alone does much of the work.',
      },
      {
        id: 'int-7',
        title: 'Scripture Interprets Scripture — and Its Abuse',
        content: `The principle is old and sound: clearer passages govern more obscure ones. Where a text is genuinely hard, look for places where the same author, or Scripture broadly, treats the subject plainly.

Three legitimate uses.

Clarity governs obscurity. A doctrine built on one ambiguous verse and contradicted by five clear ones is a doctrine built backward.

Direct treatments outweigh passing references. A passage that addresses a topic head-on carries more weight than a text that mentions it in passing while arguing about something else.

The same author explains himself. When a writer is dense in one letter, look at how he handles the same issue where he had more room.

Now the abuse, which is common. The principle gets used to mute the passage in front of you. A text says something uncomfortable, so a reader immediately reaches for a favorite verse somewhere else and reads the difficult passage down until it says nothing.

That is not harmonizing. That is using the canon to avoid a text.

The discipline: let a passage say its own thing first, at full volume, before you bring anything alongside it. Write down what it appears to claim in its own words. Then bring in the clearer texts, and if there is real tension, state it as tension rather than dissolving it.

The best readers you will meet do something recognizable — they can tell you what the hard passage says, in its own terms, even when they end up holding a position that softens it. They earned that position instead of assuming it. Aim there.`,
        exercise: 'Find a passage you have been taught to read quickly past by appealing to another verse. Write out what it appears to claim in its own words, at full strength, before consulting anything. Then bring in the other texts and write the honest result — whether it resolves, qualifies, or remains in tension.',
      },
    ],
    quiz: [
      {
        q: 'A New Testament writer quotes a prophet in the middle of an argument. The best assumption about what he is doing is:',
        options: [
          'Decorating his point with a supporting quotation',
          'Making a claim — that this is what that passage was about, and it is happening now',
          'Demonstrating his familiarity with Scripture',
          'Filling space in the argument',
        ],
        answer: 1,
        explanation: 'For these writers a quotation is the argument, not the ornament. Which is why the first move is always to go read the source passage in its own paragraph.',
      },
      {
        q: 'You find a phrase in a New Testament book that resembles an Old Testament line. Which finding would most strengthen the case that it is a deliberate allusion?',
        options: [
          'Both passages are about God',
          'The shared wording is distinctive and rare, and this writer demonstrably uses that Old Testament book elsewhere',
          'The two passages have the same number of words',
          'Several modern preachers connect them',
        ],
        answer: 1,
        explanation: 'Common words prove nothing; distinctive wording is evidence, and an author\'s established habit of using a book makes one more instance plausible. Rank finds as certain, probable, or possible, and teach only the first two.',
      },
      {
        q: 'A Gospel writer says a return from Egypt fulfilled "Out of Egypt I called my son," but the source passage is plainly about Israel\'s past rescue. The best explanation is:',
        options: [
          'The Gospel writer misread the prophet',
          'He is making a pattern claim: Jesus is retracing and completing Israel\'s story, and the geography is part of the argument',
          'The prophet\'s passage has a second, hidden predictive layer detectable only by inspiration',
          'The quotation is a scribal insertion',
        ],
        answer: 1,
        explanation: 'It is a typological claim, not a prediction claim, and the writer builds the same pattern repeatedly — a wilderness, a testing, quotations from the same period of the nation\'s story.',
      },
      {
        q: 'Which proposed type passes all four tests — historical reality, structural correspondence, escalation, and canonical warrant?',
        options: [
          'A scarlet cord hung in a window, standing for the blood of Christ',
          'The Passover lamb: a real event, substitution and deliverance from death, escalation from annual repetition to once for all, and an explicit New Testament identification',
          'Three days spent inside a fish, standing for the Trinity',
          'The wood of the altar, standing for the cross',
        ],
        answer: 1,
        explanation: 'Passover is four for four. The others fail on correspondence (incidental rather than structural), escalation, or canonical warrant — and usually on more than one.',
      },
      {
        q: 'In a narrative, a prophet has water poured over an altar and a trench dug around it before fire falls. A preacher says the water is your impossibility and the trench is your surrender. The better reading is:',
        options: [
          'Both readings are equally valid',
          'Ask what job the detail does in the story: the water and trench remove any natural explanation for the fire, which is a complete account of them',
          'The details are historical filler with no function',
          'The symbolism is valid because it edifies',
        ],
        answer: 1,
        explanation: 'A detail\'s job in its own story is the first and usually the final account of it. Reach for a second layer only when the text or the canon hands it to you.',
      },
      {
        q: 'A preacher presents a prophet who mocks his opponents and then has them executed as a picture of Christ. The most faithful handling is:',
        options: [
          'Accept the parallel — every Old Testament hero prefigures Christ',
          'Preach the contrast instead: there the true prophet kills the false prophets; at the cross the false authorities kill the true prophet, and that death saves',
          'Skip the passage in teaching',
          'Argue the mockery was justified and therefore Christlike',
        ],
        answer: 1,
        explanation: 'Forcing a parallel here requires ignoring that Christ, when reviled, did not revile in return. The contrast is both more honest and more powerful than the parallel.',
      },
      {
        q: 'Two writers use the word "works" and appear to contradict each other about justification. What is the first step?',
        options: [
          'Decide which writer is more authoritative',
          'Define each writer\'s terms from his own usage, since the same English word may carry different referents',
          'Assume a copyist error',
          'Blend the two statements into a middle position',
        ],
        answer: 1,
        explanation: 'One writer consistently means law-observance offered as the basis of standing; the other gives acts of obedience flowing from trust. Defining terms from usage dissolves most apparent contradictions before harmonizing begins.',
      },
      {
        q: 'After defining terms, what is the next most useful question when two passages seem to conflict?',
        options: [
          'Which is older?',
          'What question is each writer answering, and who is each one arguing against?',
          'Which one is quoted more often in the New Testament?',
          'Which one does your tradition emphasize?',
        ],
        answer: 1,
        explanation: 'Different questions and different opponents produce different emphases without either statement being false. Reconstructing the question is usually what makes the two statements fit without force.',
      },
      {
        q: 'A reader meets an uncomfortable passage and immediately quotes a favorite verse from elsewhere to soften it. What is wrong?',
        options: [
          'Nothing — that is what "Scripture interprets Scripture" means',
          'He is using the canon to avoid a text; a passage should say its own thing at full volume before anything is brought alongside it',
          'The other verse is probably taken out of context',
          'He should have consulted a commentary first',
        ],
        answer: 1,
        explanation: 'The principle means clearer texts govern obscure ones, not that a preferred verse can mute the passage in front of you. Let the hard text speak fully first, then bring the others.',
      },
      {
        q: 'You have worked a tension between two passages carefully and it does not fully resolve. The right move when teaching is:',
        options: [
          'Present a resolution anyway, since unresolved tension undermines confidence',
          'State what each text says, name what is settled, and say honestly where the pressure remains',
          'Teach only the passage that fits your tradition',
          'Declare the passage unknowable and move on',
        ],
        answer: 1,
        explanation: 'Manufactured resolutions fail the moment a hearer notices. Naming a real tension honestly builds far more trust than a tidy answer that does not hold.',
      },
    ],
  },
  {
    slug: 'theological-synthesis',
    number: 9,
    title: 'Theological Synthesis',
    subtitle: 'What Does This Teach About God?',
    icon: '⬡',
    color: '#c08060',
    lessons: [
      {
        id: 'theo-1',
        title: 'Four Questions to Put to Any Passage',
        content: `After the observation, structure, and context work is done, you have to say what the passage teaches. Four questions cover it, and they work on any genre.

What does this show about God? His character, his actions, his commitments, what he is like when he is dealing with people who behave like this.

What does this show about people? What we are, what we do, what we want, what we cannot do for ourselves.

What does this show about the relationship between them? What has been given, what is required, what is broken, what is being restored.

What does this call for in response? Trust, obedience, repentance, endurance, worship, warning.

Start with the first one and stay there longer than feels natural, because it is the one people skip. A genealogy shows a God who keeps track of ordinary people across generations and keeps his word through them. A food regulation shows a God who claims authority over the mundane and makes a people visibly distinct. A story where God is never mentioned — and there is one where his name never appears — shows a God who works through ordinary decisions and unremarkable providence with no announcement.

Then notice the discipline in the fourth question. It comes last and it comes from the first three. The moment response becomes your first question, you will start bending every passage toward whatever response you wanted, and every text will begin to sound like the same sermon.`,
        exercise: 'Run all four questions on Ruth 1 — where God is spoken about but never acts on stage. Write a full paragraph on the first question before you touch the others. Then note what the fourth answer looks like when it is genuinely built on the first three.',
        toolHint: 'Scholar Chat — a useful check after you have written your own four answers, not before',
      },
      {
        id: 'theo-2',
        title: 'The Main Claim and Its Neighbors',
        content: `Every passage has one central assertion and a cluster of true things around it. Mixing them up is the most common way a well-prepared study still ends up teaching the wrong thing.

Work an example. A paragraph about how a guilty person is put right with God will also assume that God is just, that all people have failed, that God is patient, and that this operates through Christ's death. All true. All in the paragraph. Only one of them is what the paragraph is arguing.

If you teach God's patience from that paragraph, you have taught something true, from a text that was not making that point, and your hearers will have no idea that the argument they just heard is not the argument in front of them.

Three tests for the main claim.

Proportion. Where does the passage spend its words? Count.

Structure. What does the argument build toward, or where does the narrative turn? The main claim is where the shape lands.

Removal. Take one candidate out. Does the passage collapse, or does it survive? The claim that cannot be removed without wrecking the paragraph is the main one.

Then a practical rule for teaching: preach the main claim as the main claim, and use the secondary ones as support. Do not pretend the secondary truths are absent — they are there and they matter. Just do not seat them at the head of the table.

If a secondary truth is what you really want to teach, find a passage where it is the main claim. There will be one.`,
        exercise: 'Take Romans 3:21-26. Write the main claim in one sentence, then list four secondary truths the paragraph assumes or implies. Then apply the removal test to each: which one cannot be taken out without the paragraph falling apart?',
      },
      {
        id: 'theo-3',
        title: 'Writing the One-Sentence Claim',
        content: `The discipline that exposes whether you actually understand a passage: state its central claim in one complete sentence.

Four requirements.

It is a complete sentence with a subject and a predicate. "The faithfulness of God" is a topic. "God keeps his promise through the exact people who are trying to sabotage it" is a claim.

It comes from this passage. If you could write the same sentence from twelve other passages, it is a generic statement, not this text's claim.

It is specific enough to be disagreed with. If nobody could possibly argue with your sentence, it says nothing. "God is good" is unfalsifiable and useless as a summary.

It matches proportion and structure. It should be about the thing the passage spends itself on.

Writing it is genuinely hard, and the difficulty is the diagnostic. When you cannot compress a passage into one sentence, you have not finished — you are still holding a pile of interesting observations that have not resolved into a claim.

Here is the discipline that makes it work: write it badly first. Get any sentence down, then attack it. Is it from this text? Is it too broad? Does it match where the weight falls? Rewrite it four times. The fourth is usually the one.

And keep it separate from a title or a theme. A title is for interest. A theme is a topic. The one-sentence claim is what the passage asserts, and it is the thing everything you teach must serve.`,
        exercise: 'Write a one-sentence claim for Jonah 4, then for Psalm 73, then for Mark 8:27-38. Rewrite each one three times. For each final version, check all four requirements and note which requirement your first draft failed.',
        toolHint: 'Sermon Outline tile — compare the generated main theme against the sentence you wrote yourself',
      },
      {
        id: 'theo-4',
        title: 'Follow the Story Before You Sort the Topics',
        content: `There are two legitimate ways to organize what Scripture teaches, and using them in the wrong order flattens texts.

One follows the storyline: how a theme develops across Scripture, in order, growing and changing as revelation unfolds. Sacrifice, kingship, temple, exile, covenant — each of these has a trajectory, and where your passage sits on that trajectory determines what it can be saying.

The other sorts by topic: gathering everything Scripture says about a subject and organizing it into a coherent account. This is necessary and good; it is how the church holds and hands on doctrine.

Do the first before the second.

Here is what goes wrong when you reverse them. You come to a passage already knowing the finished doctrinal category, you spot the vocabulary, you file the passage under the category, and you stop. The passage becomes a proof text. Everything distinctive about how this writer, at this point in the story, was making this argument gets lost — and worse, you no longer notice when the passage is doing something the category does not cover.

Concretely: read a promise made to a wandering man in the ancient Near East first as what it was — a stunning, unsecured promise to a childless nomad with nothing. Feel the shape of it there. Then connect it to how later writers develop it. Reverse the order and you get a doctrine with an illustration attached, which is not the same thing and never carries the same weight.

Both readings are true. The order is what keeps the first one from being swallowed by the second.`,
        exercise: 'Take Genesis 15:1-6. Write what it establishes at that point in the story, using only what a reader with nothing after Genesis could know. Then write what later writers say it means. Keep the two paragraphs separate and notice how much the first one adds to the second.',
      },
      {
        id: 'theo-5',
        title: 'Two Levels, and Say Which One You Are On',
        content: `Some questions get answered at two different altitudes, and a large amount of theological confusion comes from arguing at one altitude while answering at the other.

The clearest case is the language of being chosen.

At the level of the passage: a great deal of the New Testament's chosen-and-called language is written to congregations, about groups, and specifically about outsiders being brought in — the argument that people who were not a people are now included, that a door has opened to nations that had no claim. Read those passages in their own arguments and the frame is corporate, and reading them as if each sentence were about an individual's private status will lose the argument the writer was actually making.

At the level of the system: the historic Reformed answer to how any particular person comes to faith holds that God's choice is decisive and prior. That is a claim assembled from the whole canon about how salvation works in an individual.

Both levels exist. They are not competitors, and neither one is a dodge. The failure is doing one and quietly implying the other — reading a passage corporately in front of people and letting them conclude the system-level question has been settled, or handling a corporate argument as if the writer were talking about individual private status when he plainly is not.

The rule that fixes it costs one clause: say which level you are on, out loud, in the sentence.

"In this passage the argument is about whole peoples being brought in." "At the level of how any individual comes to faith, the historic answer in this tradition is that God's choice is decisive." Both, named. That is not fence-sitting; it is accuracy about what a given passage is doing.

The habit generalizes far past this one topic. Whenever you move from what a text argues to what the whole system concludes, announce the move.`,
        exercise: 'Read Romans 9 and mark, verse by verse, where the argument is about peoples and where it is about individuals. Do not resolve it — just mark it. Then write two sentences: what this chapter argues, and what your tradition holds about how an individual comes to faith. Label each.',
      },
      {
        id: 'theo-6',
        title: 'Does the Text Require It?',
        content: `Here is the test that separates careful theology from confident theology.

The weak question is: can I support this from the text? The answer is almost always yes. Given selective attention, a text can be made to support a great deal.

The strong question is: does this text require this conclusion?

Run it on your own work. Take a conclusion you have drawn. Then argue against yourself for ten minutes. What is the strongest alternative reading? What in the text would someone holding it point to? What would you have to ignore, minimize, or explain away to keep your reading?

Three possible outcomes, all useful.

Your reading survives and is now stronger, because you know its weak point and you know what it costs.

Your reading survives with a qualification. It is probable rather than certain, and now you can say so — which will make people trust you more, not less.

Your reading does not survive. You just caught it in your study instead of in front of a room, and that is the entire point of doing this.

The other half of the discipline is calibrating how you speak. Some conclusions are certain, and you should say them plainly. Some are probable. Some are your best judgment on a genuinely disputed text. Teach all three, and mark which is which. A teacher who says everything in the same confident tone is training people either to swallow everything or to eventually discount everything.`,
        exercise: 'Take a conclusion you have drawn from a passage recently. Spend ten minutes building the strongest case against it from the same passage. Then write your conclusion again with the appropriate confidence level — certain, probable, or best judgment — and one line on what would change your mind.',
        toolHint: 'Eisegesis Flagger — the warnings mark places where the analysis may be reaching past what the text requires',
      },
      {
        id: 'theo-7',
        title: 'Building a Doctrine Without Proof-Texting',
        content: `Eventually you will want to know what the whole Bible teaches on a subject, not just what one passage says. That is legitimate, and there is a right way to do it.

Proof-texting is the wrong way: assembling a list of verses that contain the right keywords, stripped from their arguments, arranged to support a position you already had. It has a distinctive smell — a rapid string of references with no context given for any of them.

Five rules for doing it honestly.

Weight direct treatments over passing mentions. A passage that addresses the subject at length outranks a phrase in a greeting.

Include the passages that cut against your position, and handle them at their strongest. If you have never stated the other side in a form its holders would accept, you have not studied the question; you have collected ammunition.

Watch the whole storyline, not just the verses. Some subjects are handled differently at different points because revelation unfolds. Flattening that produces contradictions that are not there.

Distinguish what Scripture states from what Scripture assumes from what you inferred. All three are legitimate inputs; they carry different weight and should be labeled differently.

Notice emphasis. A subject Scripture treats constantly and one it mentions twice should not end up equally load-bearing in your account of the faith. This one check would quietly correct a great deal of popular teaching.

Then, when you teach the doctrine, teach a few passages properly rather than fifteen in passing. A hearer who has genuinely understood three texts has something they can use. A hearer who has heard fifteen references has heard a performance.`,
        exercise: 'Pick a doctrine you hold confidently. List the passages you would use. Then find the two strongest passages that cut against it and write out what they claim, in the strongest form you can manage. Note honestly whether your position needed adjusting or just needed to be stated more carefully.',
      },
    ],
    quiz: [
      {
        q: 'You are studying a book in which God is spoken about but never acts on stage. Applying the question "what does this show about God" yields:',
        options: [
          'Nothing — the question only works where God is a character',
          'That he works through ordinary decisions and unannounced providence, which is itself a claim about how he operates',
          'That the book is not theological',
          'That the writer was uncertain about God\'s involvement',
        ],
        answer: 1,
        explanation: 'Absence from the stage is not absence from the account. A narrative that never shows God acting and still lands on his faithfulness is making a specific claim about how he usually works.',
      },
      {
        q: 'A paragraph argues that a guilty person is put right with God, while also assuming that God is just, that all have failed, and that God has been patient. A study teaches the patience of God from it. What has gone wrong?',
        options: [
          'Nothing — all four are in the paragraph',
          'A secondary truth has been seated as the main claim, so the hearer never encounters the argument the paragraph is actually making',
          'Patience is not really taught there',
          'The study should have covered all four equally',
        ],
        answer: 1,
        explanation: 'The secondary truths are real and should be acknowledged. The failure is billing one of them as the point, which leaves the passage\'s own argument unpreached.',
      },
      {
        q: 'Which is a usable one-sentence statement of a passage\'s central claim?',
        options: [
          '"The faithfulness of God"',
          '"God is good"',
          '"God keeps his promise through the very people who are trying to sabotage it"',
          '"Faithfulness, Providence, and Hope"',
        ],
        answer: 2,
        explanation: 'It is a complete sentence, it is specific enough that someone could argue with it, and it could not have been written from just any passage — which are three of the four requirements.',
      },
      {
        q: 'What does it mean when you cannot compress a passage into a single claim sentence?',
        options: [
          'The passage has no central claim',
          'You have not finished the work — you are still holding observations that have not resolved into a claim',
          'The passage covers multiple genres',
          'You need a commentary',
        ],
        answer: 1,
        explanation: 'The difficulty is the diagnostic. The sentence is not a summary added at the end; it is the evidence that the study actually converged.',
      },
      {
        q: 'Why should you trace where a theme sits in the unfolding storyline before sorting it into a doctrinal category?',
        options: [
          'Because doctrinal categories are unreliable',
          'Because filing the passage under a finished category first turns it into a proof text and hides whatever it is doing that the category does not cover',
          'Because the storyline approach is more modern',
          'Because systematic categories only apply to the New Testament',
        ],
        answer: 1,
        explanation: 'Both approaches are legitimate and necessary. Reversing the order costs you everything distinctive about how this writer, at this point, made this argument.',
      },
      {
        q: 'A passage argues at length that outsiders who were not a people are now included. Someone teaches it strictly as a statement about an individual\'s private standing. The problem is:',
        options: [
          'Individual standing is not a biblical concept',
          'The passage\'s own argument is about groups being brought in, so handling it only individually loses the argument the writer is making',
          'The passage is about ethnicity, not salvation',
          'Corporate readings are always to be preferred',
        ],
        answer: 1,
        explanation: 'Read the passage on the level it argues. A separate, system-level question about how any individual comes to faith is legitimate — but it is a different level and should be named as one.',
      },
      {
        q: 'What is the rule that prevents confusion when you move from what a passage argues to what the whole system concludes?',
        options: [
          'Only teach one level and leave the other to specialists',
          'Say out loud, in the sentence, which level you are on',
          'Always prefer the system level, since it accounts for more texts',
          'Avoid systematic conclusions in expository teaching',
        ],
        answer: 1,
        explanation: 'Both levels are legitimate. The failure is doing one and letting hearers think the other has been settled — and naming the level costs a single clause.',
      },
      {
        q: '"Can I support this from the text?" is a weak test. What is the strong one?',
        options: [
          '"Do respected teachers hold this?"',
          '"Does the text require this conclusion — and what would I have to ignore to keep my reading?"',
          '"Is this consistent with my tradition?"',
          '"Does this preach well?"',
        ],
        answer: 1,
        explanation: 'Almost anything can be supported from a text with selective attention. Requirement is the real bar, and the way to test it is to argue against yourself before anyone else does.',
      },
      {
        q: 'Your conclusion survives self-attack, but only as a probable reading rather than a certain one. When you teach it, you should:',
        options: [
          'Present it with full confidence — qualifications confuse people',
          'Say plainly that it is probable and name what would change your mind',
          'Leave it out entirely',
          'Present both readings without indicating which you hold',
        ],
        answer: 1,
        explanation: 'A teacher who says everything in the same confident tone trains hearers to swallow everything or discount everything. Marking confidence levels is what makes the certain claims land.',
      },
      {
        q: 'Which practice most distinguishes honest doctrinal synthesis from proof-texting?',
        options: [
          'Using more references',
          'Handling the passages that cut against your position at their strongest, in a form their holders would accept',
          'Quoting only from one testament',
          'Arranging the references in canonical order',
        ],
        answer: 1,
        explanation: 'Collecting supportive verses is easy and proves little. Stating the opposing case in a form its holders would recognize is the work — and it is the thing proof-texting never does.',
      },
    ],
  },

  {
    slug: 'restraint',
    number: 10,
    title: 'Restraint',
    subtitle: 'Know Where the Text Stops',
    icon: '⊘',
    color: '#8a8f7a',
    lessons: [
      {
        id: 'res-1',
        title: 'The Text Has an Edge',
        content: `Every passage says a definite amount and no more. Finding that edge — and stopping at it — is a skill, and it is not the same thing as caution.

Most bad teaching is not built from false statements. It is built from true statements pushed one step past where the text goes, then a second step, until the conclusion is not in the passage at all and everyone in the room believes it is.

The reason this happens is that going past the edge is rewarded. A reading that stays where the text stops sounds ordinary. A reading that adds a layer sounds deep. Nobody in the room can tell the difference, including, usually, the person teaching.

So restraint has to be a deliberate practice rather than a temperament, and it has three parts.

Knowing what the text says. That is everything before this skill.

Knowing what it does not say. That requires stating the boundary explicitly, out loud, in writing.

Being willing to leave the extra material on the floor. This is the hard one, because the material you have to leave is usually your favorite thing you found.

There is a specific relief that comes with this, and it is worth naming for anyone who teaches. If you only claim what the text claims, you never have to defend anything the text will not defend for you. Everything you say is backed. That is a very different way to stand in front of people than defending a structure you built yourself.`,
        exercise: 'Take a passage you have taught or heard taught. Write two lists: what the text says, and what was claimed. Circle every item on the second list that is not on the first. Do not judge them yet — just see the gap and how easily it opened.',
      },
      {
        id: 'res-2',
        title: 'Say, Imply, Permit, Supply',
        content: `A four-way sort that will do more for your accuracy than any other single habit. For any claim you want to make from a passage, ask which of these it is.

Says it. The text asserts this directly. You could underline the words.

Implies it. The text does not state it but requires it — the claim is a necessary consequence of what is stated. Real implication is tight: if the text is true, this must also be true.

Permits it. The text is consistent with this but does not require it. Other readings are equally consistent. This is where most sincere disagreement lives.

Supplies it. You brought it. The text neither states nor requires nor particularly suggests it; it came from your experience, your tradition, or your need for the passage to say something useful right now.

Almost everyone can distinguish the first from the fourth. The work is in the middle two, because "permits" is constantly presented as "implies."

Run a test case. A narrative reports a man praying seven times before the answer came. Says: he prayed repeatedly and the answer came on the seventh look. Implies: persistence in prayer and expectancy are compatible with certainty about God's promise, since he had already been told what would happen. Permits: the number seven has significance here. Supplies: pray seven times for your situation and expect a breakthrough.

Notice that the last one is what gets preached, and notice that nothing in the passage generates it.

When you teach, mark the level. "The text says." "This follows from the text." "This is one reasonable way to take it." Hearers can handle that. What they cannot handle is finding out later that all three sounded identical.`,
        exercise: 'Take Acts 1:12-26 (the selection of a replacement apostle, ending with casting lots). Write four claims about it, one at each level: says, implies, permits, supplies. Be honest about which of the four you have heard preached most.',
      },
      {
        id: 'res-3',
        title: 'Do Not Allegorize the Props',
        content: `In a narrative, physical details do a job. Assigning them a second, spiritual meaning is the most common form of over-reading, and it is popular because it produces material endlessly.

A prophet has an altar rebuilt from twelve stones, has a trench dug around it, and has twelve jars of water poured over the offering until the trench is full. Then fire falls and consumes everything, including the water.

The preacher's temptation is immediate. The water is your impossibility. The trench is your surrender. The twelve jars are twelve of something.

Ask the restraint question instead: what job does this detail do in the story?

The water and the trench eliminate every natural explanation for the fire. They are evidence. The scene is a public trial about which God is real, and the man on trial is making the result impossible to fake. That is the function, it is a complete account, and it is far better material than the invented version — because it teaches the passage's actual argument about proof rather than a metaphor about surrender that nobody in the story is thinking about.

The twelve stones are the exception that shows the rule. That detail is explained inside the text: they correspond to the tribes, and the narrator says so. Which is exactly the standard — when the text supplies the meaning of a detail, use it; when it does not, the detail's job in the story is the meaning.

The test: does this detail do work in the narrative? If yes, that is what it is for. Add a second layer only when the text or the wider canon hands it to you.`,
        exercise: 'Read Joshua 2 (the scouts and the scarlet cord). List every physical detail. For each, write the job it does in the story. Then ask which of them the text itself assigns any further meaning to — and note how the honest answer compares with how the chapter is usually preached.',
      },
      {
        id: 'res-4',
        title: 'Reported Is Not Prescribed',
        content: `A narrative reports what happened. That is not the same as instructing you to do it.

This distinction is simple to state and constantly violated, because narratives are where the good stories are and people want to act on them.

Three examples.

A man asks for a sign involving a fleece and dew, twice, to confirm something God had already told him. This is reported. The narrative context makes it a picture of a man who has already been told and is stalling. It is not a method.

A prophet has his servant look toward the sea seven times before a cloud appears. Reported. He had already been told rain was coming.

A group casts lots to choose between two candidates. Reported — and notably, it never happens again after the Spirit is given, which is itself a signal about how the practice functioned.

Three tests for whether something reported is also prescribed.

Does the text command it, or does another text? A pattern is prescriptive when Scripture prescribes it, not because a good person did it.

Is it repeated as a norm elsewhere? Recurring practice across Scripture, with approval, is real evidence.

Does the narrative approve it? Narrators frequently report what a faithful person did without endorsing it — and sometimes the surrounding story is quietly critical.

None of this makes narrative inapplicable. Narrative teaches enormously — about God, about human nature, about how faith and failure actually look. It just teaches by showing, and what it shows is not automatically what you should replicate.`,
        exercise: 'Take Judges 6:36-40 (the fleece). Run the three tests. Then read the whole chapter and note what God had already told this man, and how many times. Write one sentence on what the episode is showing about him.',
      },
      {
        id: 'res-5',
        title: 'Do Not Force Christ In',
        content: `The whole of Scripture moves toward Christ, and reading it in that light is right. That does not license finding him in every detail.

Four legitimate connections.

Direct promise and fulfillment. The text points forward and the New Testament says it landed.

Pattern with warrant. A type that passes the tests — historical reality, structural correspondence, escalation, and either an explicit New Testament identification or a pattern developed across the canon.

Trajectory. The passage advances the story that arrives at Christ. A promise, a covenant, a failure that shows what is needed — these connect without any decoding.

Contrast. The passage shows what he is not, and the difference is the point.

That last one is underused and frequently better than a forced parallel. On a mountain, a true prophet exposes false prophets and then has them killed. Push a Christ-parallel onto that and you have to ignore that the one who, when reviled, did not revile in return, and who was killed by the false authorities rather than killing them. The contrast preaches, and it is true: there the true prophet kills the false prophets; at the cross the false authorities kill the true prophet, and that is the death that saves.

The failure mode is the reflex of announcing a Christ-connection in every passage regardless of the material, usually with a phrase like "and here we see a picture of Jesus." Hearers learn quickly that this phrase means the actual passage is over.

Ask instead: how does this text contribute to the story that arrives at Christ? That question always has an honest answer. The decoding question often does not.`,
        exercise: 'Take three Old Testament passages you know. For each, write which of the four legitimate connections applies and why. If none of the four fits cleanly, write that honestly and state what the passage contributes to the storyline instead.',
      },
      {
        id: 'res-6',
        title: 'Honest Distance',
        content: `Some passages describe situations that are genuinely not transferable, and the faithful move is to say so plainly rather than to skip the passage or force it into a lesson.

Three categories.

Theocratic actions. Commands and sanctions given to a covenant nation under a legal system God himself established, executed by people acting under direct authorization. A prophet executing false prophets after a public verdict is operating inside a legal framework that no longer exists and that was never transferred to the church. Say what it is, say why it is not ours — the weapons of this warfare are explicitly not physical — and move on.

Direct commissions. A person told by God to do a specific thing has warrant that does not generalize. When a prophet stages a public test of God, his entire defense is that he did it at God's word. He was sent. You were not, and the passage is not a template for demanding signs.

Unique redemptive events. Some things happened once because they were the hinge of the story. They are not patterns to reproduce.

Three rules for handling these.

Do not skip. Skipping teaches people that parts of Scripture are embarrassing, and they will notice which parts.

Do not soften. Say what happened accurately.

Do not transfer. Name plainly why this does not become a model for anything a Christian does to another person.

Then find what does transfer, because there almost always is something — usually the theological claim the episode was making rather than the action itself. The public trial about which God is real transfers. The sword does not.`,
        exercise: 'Take a passage involving warfare, a theocratic sanction, or a direct divine commission. Write three lines: what it is, why it does not transfer, and what does transfer. Practice saying the middle line in one clear sentence without apologizing for the text.',
      },
      {
        id: 'res-7',
        title: 'Write Your Own Fences',
        content: `The practice that makes this a habit instead of a good intention: at the end of every study, write down what the passage does not say.

Two or three lines. Specific, not general. Aimed at the misreadings this particular text invites — including the ones you were drifting toward an hour ago.

Example fences from a public-contest narrative on a mountain: this text does not teach that dramatic proof produces faith — the chapter itself refutes that, since the nation confesses and then changes nothing. It does not authorize demanding a sign from God; the prophet's stated warrant is that he acted at God's word. It does not present the executions as a model for anything. And it does not end in triumph — the next chapter has the same man under a tree asking to die.

Notice what those fences do. They are not hedges or disclaimers. Every one of them is a positive interpretive claim, and together they are most of the chapter's actual argument. The restraint is the teaching.

Three sources for good fences.

Where you were tempted. The reading you almost took is the one your hearers will take.

Where it is commonly misused. If you have heard the passage abused, name it.

Where the text declines to speak. If the writer withheld a verdict, your fence is that he withheld it, and that you are not going to supply one.

Do this at the end of every study for a month and you will notice something: the fences start arriving earlier, during the study, and they start improving the reading rather than trimming it.`,
        exercise: 'Take the last passage you studied and write three fences — specific things this text does not say. Then check each one: is it a real boundary the text sets, or just general caution? A fence that could be attached to any passage is not a fence.',
      },
    ],
    quiz: [
      {
        q: 'A narrative reports that a man prayed and had his servant look toward the sea seven times before the answer came. Which claim is at the "supplies" level — brought by the reader rather than the text?',
        options: [
          'He looked seven times before the cloud appeared',
          'Persistence and certainty about God\'s promise are compatible, since he had already been told rain was coming',
          'Pray seven times over your situation and expect a breakthrough',
          'The answer, when it came, was initially very small',
        ],
        answer: 2,
        explanation: 'Nothing in the passage generates a method from the count. The first and last are what the text says; the second follows from it; the third is imported — and it is the one most often preached.',
      },
      {
        q: 'In the four-way sort — says, implies, permits, supplies — where does most sincere disagreement between careful readers live?',
        options: [
          'Between "says" and "implies"',
          'At "permits" — where a reading is consistent with the text but not required by it, and other readings are equally consistent',
          'At "supplies," which is where all disagreement originates',
          'Nowhere; careful readers agree',
        ],
        answer: 1,
        explanation: 'The frequent failure is presenting a permitted reading as an implied one. Naming the level while you teach lets hearers weigh a claim accurately instead of receiving everything in the same tone.',
      },
      {
        q: 'A preacher says the water poured into a trench around an altar represents the impossibilities in your life. What does the restraint question ask instead?',
        options: [
          'Whether the symbolism edifies the congregation',
          'What job the detail does in the story — here, eliminating every natural explanation for the fire in a public trial about which God is real',
          'Whether another preacher has used the same image',
          'Whether the Hebrew word for water has a secondary meaning',
        ],
        answer: 1,
        explanation: 'A detail\'s function in its own narrative is a complete account of it. And the real function here is better material than the invented one, because it teaches the chapter\'s actual argument.',
      },
      {
        q: 'In the same scene, the altar is rebuilt with twelve stones and the narrator states that they correspond to the tribes. How should that detail be treated?',
        options: [
          'The same as the water and trench — its job in the story is its meaning',
          'Use the meaning the text supplies; when a narrator explains a detail, that explanation is the standard',
          'Assign it a symbolic meaning consistent with the other objects in the scene',
          'Ignore it as an aside',
        ],
        answer: 1,
        explanation: 'This is the exception that establishes the rule. When the text assigns significance to a detail, take it. When it does not, do not invent one.',
      },
      {
        q: 'Which is the strongest test for whether something reported in a narrative is also prescribed?',
        options: [
          'Whether a faithful person did it',
          'Whether the outcome was good',
          'Whether Scripture commands it, whether it recurs as an approved norm, and whether the narrative itself endorses it',
          'Whether it is repeated twice in the same book',
        ],
        answer: 2,
        explanation: 'Good people in Scripture do many things that are reported and not endorsed. Command, recurring approved pattern, and narrative approval are the evidence — a good outcome is not.',
      },
      {
        q: 'A passage shows a prophet who mocks his opponents and then has them killed. A teacher wants to connect it to Christ. The most defensible move is:',
        options: [
          'Draw the parallel — both confronted false religion boldly',
          'Preach the contrast: the true prophet kills the false prophets there, and at the cross the false authorities kill the true prophet — and that is the death that saves',
          'Avoid the chapter',
          'Argue that Christ will act this way at his return, so the parallel holds',
        ],
        answer: 1,
        explanation: 'A forced parallel requires ignoring that the one who was reviled did not revile in return. The contrast is honest, and it preaches harder than the parallel it replaces.',
      },
      {
        q: 'You are teaching a passage where a nation carries out a legal sanction under a covenant system God established. The right handling is:',
        options: [
          'Skip it — it distracts modern hearers',
          'Soften it so it sounds less severe',
          'Say what it is, say plainly why it does not transfer to anything a Christian does to another person, and then teach what does transfer',
          'Apply it as a picture of spiritual boldness',
        ],
        answer: 2,
        explanation: 'Skipping teaches people which parts of Scripture embarrass you. Naming the framework, naming the non-transfer, and finding the theological claim that does carry is the faithful path.',
      },
      {
        q: 'A prophet stages a public test in which God is asked to act. What keeps this from being a template for demanding signs?',
        options: [
          'The event happened in the Old Testament',
          'His stated warrant inside the passage is that he did it at God\'s word — he was sent, and a commission does not generalize',
          'Modern people lack the necessary faith',
          'The test involved fire, which is not repeatable',
        ],
        answer: 1,
        explanation: 'The passage supplies its own limit. A direct commission is warrant for the one commissioned, and reading it as a method skips the sentence in which he says why he is allowed to do it.',
      },
      {
        q: 'What is the difference between a real restraint fence and a general disclaimer?',
        options: [
          'A fence is longer',
          'A fence is specific to what this text invites readers to over-claim; a disclaimer could be attached to any passage',
          'A fence is stated before the teaching, a disclaimer after',
          'There is no meaningful difference',
        ],
        answer: 1,
        explanation: 'A good fence is a positive interpretive claim about this passage. If your fence would fit any text equally well, you wrote caution rather than exegesis.',
      },
      {
        q: 'Why is restraint described as a form of accuracy rather than caution?',
        options: [
          'Because cautious readers are usually more accurate',
          'Because stating exactly what a text does and does not claim is part of describing it correctly — and it means everything you say is backed by the text itself',
          'Because it protects the teacher from criticism',
          'Because it shortens the sermon',
        ],
        answer: 1,
        explanation: 'Fences are claims, not hedges. And the practical payoff is that you never have to defend something the text will not defend for you.',
      },
    ],
  },

  {
    slug: 'triage',
    number: 11,
    title: 'Weighing Disputes',
    subtitle: 'Settled, or Faithfully Disagreed?',
    icon: '⚖',
    color: '#b06840',
    lessons: [
      {
        id: 'tri-1',
        title: 'Not Every Disagreement Is the Same Size',
        content: `Sooner or later your study will produce a conclusion that other Christians do not share. What you do next matters as much as the study did.

Borrow the emergency-room instinct. A nurse who treats a hangnail like a heart attack does harm. A nurse who treats a heart attack like a hangnail does more. Both errors come from failing to rank, and the ranking is a skill you can learn.

Three tiers, defined by what unit of fellowship a disagreement breaks.

First order: what makes someone a Christian at all. Deny these and you are not describing a variant of the faith but a different religion. The deity of Christ. His death, burial, resurrection, and ascension. God as eternal and Creator. The Trinity — one God in three persons, equal in deity, distinct in person. Scripture as God's inspired word. Human sinfulness and salvation by grace through faith.

Second order: convictions that separate denominations but not Christians. Who should be baptized and how. How a church is governed. What happens at the Lord's Table. Whether certain spiritual gifts continue. Two believers can differ here, recognize each other fully as Christians, and still find they cannot run one congregation together.

Third order: convictions two members of the same church hold differently and stay in the same pew. The days of creation and the age of the earth. The manner and timing of Christ's return.

The tiers are not about how strongly you hold something. You can hold a third-order position with deep conviction. The tier describes what the disagreement costs, not how much you care.`,
        exercise: 'Write out ten convictions you hold, and sort them into the three tiers. Then, for any you placed in the first tier, ask: would I say a person denying this is not a Christian? If the answer is no, you have placed it wrong.',
      },
      {
        id: 'tri-2',
        title: 'How a Doctrine Gets Its Rank',
        content: `Placement is not a matter of taste. Five tests do most of the work.

Gospel proximity. Does denying it deny the gospel itself? Scripture uses this ranking language directly — one writer lists the death, burial, and resurrection as matters "of first importance." That phrase is a triage, in the text.

Clarity and emphasis. Is Scripture plain and insistent here, or is this an inference at the edge of the evidence? A doctrine the Bible states rarely and obscurely is a poor place to break fellowship. This test alone quiets many arguments.

Entailment. What else falls if this falls? A doctrine holding up many others is load-bearing and ranks higher. Remove the resurrection and much of the New Testament stops functioning; remove a position on the age of the earth and nothing else moves.

Consequence. Can two people who differ genuinely share this specific thing — this table, this membership, this eldership — without incoherence?

Inherited consensus. What has the church confessed across traditions and centuries? Near-universal, cross-tradition agreement is evidence of weight. Novelty in first-order claims is a warning sign.

And notice Scripture doing this itself. Jesus speaks of the weightier matters of the law while explicitly refusing to discard the lighter ones. That is the whole discipline in one sentence: rank, and do not throw away the low-ranked things.

Run the five tests before you argue, not after. Most of the heat in Christian disagreement comes from two people fighting at different tiers without either one realizing it.`,
        exercise: 'Take one conviction you argue about most. Run all five tests on it in writing. Then write the tier you land on and the strongest reason someone might place it a tier higher or lower.',
      },
      {
        id: 'tri-3',
        title: 'With Whom, For What?',
        content: `The question that resolves most triage confusion: what are we trying to do together?

The tier is not fixed in the abstract. It shifts with the task, and it should.

Running a food pantry with another church tolerates enormous doctrinal difference. Sharing a pulpit tolerates less. Sharing a membership roll less again. Sharing an eldership least of all.

That means the same doctrine can be second order for one purpose and third for another, without anyone being inconsistent. Baptism is the standard example. Two believers who differ about who should be baptized can pray together, serve together, and recognize each other as Christians without strain. But a church whose membership assumes believers' baptism has a doctrine that touches membership itself — so inside that congregation, it functions at a boundary that it does not touch outside.

That is not a contradiction. It is the unit changing.

The practical version, whenever a disagreement comes up: name the unit first. Are we deciding whether to call this person a brother? Whether to plant a church together? Whether he can teach the class? Whether we can work on this project? Each has a different threshold, and half of all doctrinal arguments are two people answering different questions at high volume.

Ask the unit question out loud and watch how many disagreements shrink to their actual size.`,
        exercise: 'Take a doctrine you differ on with someone you respect. Write four rows: pray together, serve on a project together, be members of one church, share the eldership. For each, write whether the difference is a genuine obstacle and why.',
      },
      {
        id: 'tri-4',
        title: 'The Two Ways to Fail',
        content: `Both failures feel like faithfulness from the inside, and both do damage.

Over-triage: treating third-order matters as first-order, so every conviction becomes a test of fellowship. The pattern is a church or a person continually dividing over ever-smaller things, with each division feeling like the defense of truth. The cost is not only broken relationships; it is that the genuinely first-order things get devalued by association. When everything is a hill to die on, no hill means anything.

Under-triage: treating first-order matters as negotiable, so nothing is a test of anything. The pattern is a slow softening in which the deity of Christ, the resurrection, and the authority of Scripture become perspectives rather than the faith. It usually starts as generosity and it costs the thing everyone was being generous about.

Neither is a temperament problem. Both are ranking failures.

The self-diagnosis is uncomfortable and worth doing. Take the last three disagreements you had. On each, did you treat it as bigger or smaller than the five tests say it is? Most people lean consistently one direction, and knowing your direction is most of the correction.

Then the honest note, because you should hear it from a teacher rather than discover it later. In some circles, matters this framework ranks third order — the manner and timing of Christ's return, for instance — are treated as first or second order, and people have divided over them. What is settled is not in dispute: he is returning bodily, there will be a resurrection, there will be a final judgment. That is not a system; it is the faith. The frameworks people build around the surrounding details are a different kind of thing, and treating them as though they were the same kind of thing is over-triage with a long history.`,
        exercise: 'Write down your last three doctrinal disagreements. For each, name the tier you treated it as, and the tier the five tests give. Then answer honestly which direction you lean — over or under — and what that costs you.',
      },
      {
        id: 'tri-5',
        title: 'How to Study a Disputed Passage',
        content: `When you reach a passage where faithful people genuinely differ, there is a procedure. It produces better study than picking a side early.

Read the passage before you read the debate. Get your own observations, structure, and questions down first. Once you know the labeled positions, you cannot unsee them, and you will start sorting evidence into their categories instead of finding what is there.

Name the actual fork. Usually the dispute turns on something small and identifiable: how a clause attaches, whether a term is corporate or individual, whether a genre marker is being read correctly. Find the hinge. Most disputes are one hinge with a large structure on top.

State each major position in a form its holders would accept. This is the test of whether you have understood the debate. If your description of the other view would make its holders say "that is not what we believe," you are arguing with a caricature and you will never be corrected by anything.

Ask what the passage settles and what it does not. Frequently a disputed text settles less than either side claims. Saying so is not weakness; it is the most accurate available report.

Decide, and say how firmly. You are allowed to land. Say whether you hold it as certain, probable, or best judgment, and what would change your mind.

Then teach the fork honestly. Hearers who learn that faithful people differ here — and why — are being equipped. Hearers who are handed one view as the obvious reading will eventually meet a thoughtful person holding the other, and what breaks is not their view of that passage but their trust in you.`,
        exercise: 'Pick a genuinely disputed passage. Write out the two strongest positions, each in a form its holders would accept. Then write one sentence naming the hinge the dispute actually turns on — and one sentence on what the passage settles regardless of which side is right.',
        toolHint: 'Scholar Chat — useful for stating an opposing view fairly after you have done your own reading',
      },
      {
        id: 'tri-6',
        title: 'Name Your Own Position',
        content: `There is no neutral ranking. Where you place a doctrine already encodes theological judgments you hold, and a triage that hides its commitments is not trustworthy.

That is not a reason to abandon ranking. It is a reason to say out loud what your ranking assumes.

Some examples of buried commitments. Placing the way a person is declared right with God at first order is itself a position that another major tradition disputes. A church that requires believers' baptism for membership has already ranked baptism higher for its own unit than a church that does not. Treating a particular view of Scripture's reliability as first order rather than second is a judgment, and thoughtful people in the same tradition disagree about which it is.

None of that means everything is up for grabs. It means the ranking is a theological act, and honest teachers say so.

Two habits.

Name the tradition your placement assumes when it matters. "In our tradition this is a membership question; in others it is not" costs you nothing and makes you far more credible than pretending your map is the view from nowhere.

State the aim. There is a stated purpose behind this whole discipline in Scripture: the goal of instruction is love, from a pure heart and a good conscience and a sincere faith. Not winning. Not being right in public. Not sorting people. Ranking exists so you know what to fight for and what to hold with an open hand, and the second half of that sentence is the half most people skip.

The mature form of this skill is a person who can say, without flinching: here is what I would break fellowship over, here is what I would leave a church over, here is what I would argue about for two hours and then take communion with you.`,
        exercise: 'Write three sentences: what you would separate from a professing Christian over, what you would leave a church over, and what you would argue hard about and then take communion together. Then name, for each, the tradition or commitment your placement assumes.',
      },
    ],
    quiz: [
      {
        q: 'What determines which tier a doctrine belongs in?',
        options: [
          'How strongly you personally hold it',
          'How often it appears in Scripture',
          'What unit of fellowship a disagreement over it actually breaks — a Christian, a denomination, or a congregation',
          'Whether your denomination has an official position on it',
        ],
        answer: 2,
        explanation: 'Tiers describe cost, not conviction. You can hold a third-order view passionately; the tier says what the disagreement breaks, not how much you care.',
      },
      {
        q: 'Two believers differ about who should be baptized. They pray together, serve together, and fully recognize each other as Christians — but cannot form one congregation with a single membership standard. What does this illustrate?',
        options: [
          'One of them is not really a Christian',
          'The tier is relative to the unit: the same doctrine can be no obstacle for one task and a genuine boundary for another',
          'Baptism is a first-order doctrine',
          'Church membership standards are unbiblical',
        ],
        answer: 1,
        explanation: 'Naming the unit first — pray together, serve together, share membership, share eldership — resolves a large share of doctrinal arguments by revealing that the two people are answering different questions.',
      },
      {
        q: 'You are considering whether a doctrine is first order. Which test carries the most weight?',
        options: [
          'Whether respected teachers you follow emphasize it',
          'Whether denying it denies the gospel itself',
          'Whether it appears in the Old Testament as well as the New',
          'Whether it is difficult to understand',
        ],
        answer: 1,
        explanation: 'Gospel proximity is the strongest first-order test, and Scripture uses the ranking language itself when it lists the death, burial, and resurrection as of first importance.',
      },
      {
        q: 'A doctrine is inferred from a handful of obscure verses and stated nowhere plainly. What does the clarity-and-emphasis test suggest?',
        options: [
          'It is likely a hidden truth most Christians have missed',
          'It is a poor place to break fellowship — a doctrine Scripture states rarely and obscurely ranks lower',
          'It should be ranked by how logically it follows from other doctrines',
          'Obscurity has no bearing on rank',
        ],
        answer: 1,
        explanation: 'Perspicuity matters. Positions that require heavy inference from thin evidence can still be held, but they are not the ground on which to divide from other Christians.',
      },
      {
        q: 'A church divides repeatedly over increasingly small matters, each time believing it is defending the truth. What is the failure, and what does it cost?',
        options: [
          'Under-triage; it costs doctrinal precision',
          'Over-triage; and beyond the broken relationships, it devalues the genuinely first-order matters by treating everything as equally decisive',
          'Nothing — rigor is always safer than laxity',
          'A leadership problem rather than a ranking problem',
        ],
        answer: 1,
        explanation: 'When everything is a hill to die on, no hill means anything. Over-triage is a ranking failure, and it hollows out the doctrines it thinks it is protecting.',
      },
      {
        q: 'You are studying a passage that faithful Christians read in two ways. What should you do first?',
        options: [
          'Read the strongest advocate of each view, then read the passage',
          'Read the passage yourself first — once you know the labeled positions, you begin sorting evidence into their categories instead of finding what is there',
          'Determine your tradition\'s position and study from there',
          'Skip it and study a clearer passage',
        ],
        answer: 1,
        explanation: 'Doing your own observation and structure work first is what gives you anything to contribute. After that, reading the debate sharpens you rather than framing you.',
      },
      {
        q: 'How do you know whether you have actually understood an opposing position?',
        options: [
          'You can list its weaknesses',
          'You can state it in a form its own holders would accept as accurate',
          'You can trace its historical origins',
          'You can identify which denominations hold it',
        ],
        answer: 1,
        explanation: 'If your description would make its holders say "that is not what we believe," you are arguing with a caricature — and a caricature can never correct you, which is the real cost.',
      },
      {
        q: 'Your careful study of a disputed text concludes that the passage does not settle the dispute either way. Reporting that is:',
        options: [
          'A failure of nerve',
          'The most accurate available report — disputed texts frequently settle less than either side claims',
          'Acceptable in private study but not in teaching',
          'A sign you need better resources',
        ],
        answer: 1,
        explanation: 'Saying what a text does and does not settle is exegesis, not evasion. Overclaiming a disputed passage is how a hearer\'s trust gets spent on something the text never paid for.',
      },
      {
        q: 'What is the danger of teaching a disputed passage as though only one reading were possible?',
        options: [
          'It makes the sermon too long',
          'The hearer will eventually meet a thoughtful person holding the other view, and what breaks is not their view of the passage but their trust in you',
          'It violates denominational policy',
          'It prevents the passage from being applied',
        ],
        answer: 1,
        explanation: 'Hearers who are told that faithful people differ here — and why — are being equipped. Hearers handed one view as obvious are being set up.',
      },
      {
        q: 'Why should a teacher name the tradition or commitment their ranking assumes?',
        options: [
          'To show academic balance',
          'Because there is no neutral ranking — placement encodes theological judgments, and a triage that hides its own commitments is not trustworthy',
          'Because all rankings are equally valid',
          'To avoid taking a position',
        ],
        answer: 1,
        explanation: 'Naming the commitment is not relativism; it is honesty about a theological act. It costs one clause and makes everything else you say more credible.',
      },
    ],
  },
  {
    slug: 'homiletical-bridge',
    number: 12,
    title: 'Application',
    subtitle: 'Their Town to Ours',
    icon: '✍',
    color: '#80a870',
    lessons: [
      {
        id: 'hom-1',
        title: 'One Meaning, Many Applications',
        content: `A passage means one thing: what the author intended to communicate to the people he was writing to. That is fixed. It was fixed the day it was written and no amount of reading changes it.

What a passage means for you is a different question, and it has more than one legitimate answer.

Keeping these two apart solves an enormous number of problems. A text about learned contentment in plenty and want has one meaning. Applied to a man whose business just failed, a woman whose savings are large and whose marriage is not, and a widow deciding whether to sell her house, that one meaning produces three different specific claims. Nothing about the meaning changed. The situations differ, so the point of contact differs.

The failures come in pairs.

Collapsing the two: treating the text as if it were written directly to you in your situation, so that instructions given to a specific person in a specific first-century circumstance become direct commands to you with no crossing done at all.

Severing the two: holding the passage so tightly to its original setting that it makes no claim on anyone now. Historically interesting, practically dead.

The whole discipline lives between those failures, and it is a discipline — not an instinct and not a devotional mood. The next lessons are the actual method for making the crossing, and it is the same method whether you will preach the passage on Sunday or simply obey it on Tuesday.`,
        exercise: 'Take a passage about contentment. Write its meaning in one sentence, fixed to its original setting. Then write three specific applications for three specific people in genuinely different circumstances, and check that every one of them is the same meaning, landing differently.',
      },
      {
        id: 'hom-2',
        title: 'The Five-Step Crossing',
        content: `The standard method has five steps and a picture: two towns with a river between them.

Grasp it in their town. What did this mean to the original audience? Everything in the earlier skills feeds this step, and you do not proceed until it is done.

Measure the river. What is actually different between their situation and yours? Be specific. Cultural difference — different social system, different economy. Situational — they faced something you do not. Covenantal — they stood at a different point in the story, under different terms.

Cross the bridge. State the theological principle that holds on both banks. It has to be true of their situation and yours, and it has to come out of this text.

Check the map. Test the principle against the rest of Scripture. Does another passage qualify it, extend it, or correct it? A principle that no other text supports and some texts contradict is a principle you built wrong.

Grasp it in our town. Now apply the verified principle to a specific present situation. Specific, not general — general applications are how a passage evaporates.

Work it fast. A first-century church argues about eating meat that had been offered at a pagan temple. Their town: real social pressure, real idols, real weak consciences, and public meals tied to civic religion. The river: wide — nobody around you sacrifices to a civic deity before lunch. The bridge: my liberty is limited by love; the effect on a brother whose conscience is not yet settled outranks my right to exercise a freedom. Check the map: broadly supported, and the same writer argues it elsewhere. Our town: name the actual practice in your life where you are right and it is still costing someone.

Five steps. Skipping step two is what produces the strange applications; skipping step four is what produces the dangerous ones.`,
        exercise: 'Run all five steps on 1 Corinthians 8, writing each step out. Then do it again on Deuteronomy 22:8 (a railing around a flat roof). The second one is harder and it is where the method proves itself.',
      },
      {
        id: 'hom-3',
        title: 'The Altitude Problem',
        content: `Step three, stating the principle, is where most applications go wrong, and the error has a shape: the principle is stated at the wrong altitude.

Too low, and it is still stuck in their world. "Do not muzzle an ox while it is treading grain" restated as "be kind to your farm animals" has barely left the ground, and most readers own no oxen.

Too high, and it is useless. The same text restated as "God cares about fairness" is unobjectionable, unfalsifiable, and could have come from anywhere.

The right altitude is the level at which the principle is genuinely transferable and still specific enough to make a claim on you.

Work the ladder on that text. Ground level: do not muzzle an ox treading grain. One step up: an animal that produces gain should share in what it produces. Another step: a worker should benefit from the work he does. That is the level where it holds on both banks and still says something. And notice the New Testament itself climbs this exact ladder and lands on paying those who labor in ministry — which means the method is not imposed on Scripture; it is modeled by it.

The test for correct altitude: does the principle still require something specific of a particular person, and could you state it to someone in the ancient setting and have them recognize it as what their text was after?

Too low fails the first. Too high fails the second — and generic principles are the reason so many sermons end with a general encouragement nobody could act on if they wanted to.`,
        exercise: 'Take Deuteronomy 25:4 and write the principle at four altitudes, from ground level to "God is good." Circle the one that is transferable and still demanding. Then do the same with a command about greeting one another with a kiss.',
      },
      {
        id: 'hom-4',
        title: 'Four Faces of Application',
        content: `Most people apply only one way: what should I do? That is one face of application and there are four. Running all four on a passage will roughly quadruple what you get out of it, and it will stop you from turning every text into a task.

Duty. What should I do? Concrete action. The face everyone uses.

Character. Who should I be? What kind of person does this text describe, commend, or expose? A passage may generate no immediate task and still demand a change in what you are becoming.

Goals. What should I aim for or value? What does this text tell you is worth wanting? Much of Scripture reorders desires rather than issuing instructions, and if you only have the duty face, all of that material becomes invisible or gets forced into a command it never made.

Discernment. How should I see this situation wisely? What does this text let you recognize that you would otherwise miss — about people, about yourself, about how God works? This is the face that handles everything Scripture teaches for situations rules do not cover.

Run all four on a narrative in which a man wins a public confrontation and collapses the next morning. Duty: plan for the day after the demanding thing; eat and sleep before you evaluate your life. Character: a person who can win and still be honest about being empty. Goals: stop wanting the outcome that you assumed would fix you. Discernment: recognize that a crash after a win is not evidence the win was fake — it is what expensive victories cost, and the answer given in the text is food, sleep, and a quiet word rather than a rebuke.

One passage, four kinds of claim, and only the first is a task.`,
        exercise: 'Take a passage you know well and write all four faces. If any face comes up empty, write why — some texts genuinely do not address one of them, and being able to say which is part of reading accurately.',
      },
      {
        id: 'hom-5',
        title: 'Text-Native Application',
        content: `The hard rule: the application must come from this text.

Not from a true doctrine the text does not teach. Not from the thing you are passionate about. Not from what your people need this week. From this passage.

This is the rule most often broken by good people with good motives, and it breaks in a predictable way: whatever you care about most becomes the destination of every passage. If your burden is evangelism, every text ends in evangelism. If it is missions, every text ends in going. If it is discipline, every text ends in trying harder. The passages vary and the landing never does.

The test is simple and it stings. If your application could have been delivered from a dozen other passages, it did not come from this one.

Second test: does the application follow the shape of the text? A passage about contentment applies to contentment. A passage about how a person is put right with God applies to how a person is put right with God — trust, rest, the end of self-justification — not to some other worthy cause that the text never touches.

Third test: reverse it. Read your application to yourself and ask what passage it would have come from. If the answer is not the one you studied, you have found it.

The cost of this rule is that you will have to leave your favorite point out of some sermons and some studies. The benefit is that the people you teach will actually meet the whole counsel of Scripture instead of hearing your one concern in fifty costumes — and over years, that difference is what a healthy teaching ministry is.`,
        exercise: 'Look at your last five applications, from studies or from talks. Write them in a column. Then ask: are these five different, or one thing five times? Then take one that failed and rebuild it from the shape of the text.',
      },
      {
        id: 'hom-6',
        title: 'Do Not Moralize the Story',
        content: `The most common misapplication of narrative: making a human character the example and the passage a lesson about being like him.

Be brave like the young man with the sling. Be faithful like the exile who kept praying. Do not be like the man who ran the other way.

The problem is not that human examples are never legitimate — Scripture does hold people up as examples. The problem is that most narratives are primarily about God, and the moralizing reading quietly replaces him as the subject.

Test the famous one. A story about a boy and a giant, read as a lesson in courage, produces: face your giants. Read as what the narrative is actually doing, it produces something else entirely. The army is paralyzed. The king — who is a head taller than everyone and was chosen for exactly this — will not go. God delivers his people through an unranked shepherd nobody counted, using a weapon nobody respected, and the boy says out loud that the battle belongs to the LORD and that everyone should learn from this who saves.

The second reading is the text's own claim. It is also better news, because you are not the boy in the story. Nobody preaching that story to a room can tell the people in front of them that their giants will fall if they are brave enough. That is not what happened, and it is not what is promised.

Three questions that catch moralizing. Who is the actor in this scene — really? What does the narrator praise, and where? And could I preach this same message if the human character had failed? If the passage still preaches with the human as an example of failure, you have found the theological center.`,
        exercise: 'Take a well-known narrative and write two applications: the moralizing one, and the one built on what God is doing in the scene. Then write one sentence on what the first one promises that the text does not.',
      },
      {
        id: 'hom-7',
        title: 'Two Endpoints, One Text',
        content: `Study ends in one of two places. Either you are going to teach this passage, or you are going to obey it. The work behind both is identical. Only the last step differs.

If you are going to obey it, the last step is specific and private. Name the situation. Name the change. Name when. An application with no time, no place, and no person is not an application; it is a sentiment. And schedule the review — a week from now, did this actually happen?

If you are going to teach it, the last step is delivery, and three things matter.

Take them to the text, not to your notes. The goal is that people leave able to see in the passage what you saw. If they leave impressed with your preparation, you have taught them to depend on someone with preparation.

Create the need before you supply the answer. Start where the human condition the text addresses is actually felt, not with background information. Background is necessary and it is not an opening.

Say it in words they already have. Everything you learned in the languages, the history, and the structure should show up as clarity, not as vocabulary. The measure of good preparation is that the explanation gets simpler and more specific — never that it gets more technical.

And do not display the homework. The people in front of you do not need your word study; they need what it produced. The best compliment is not that a talk was impressive. It is that a passage became obvious, and that someone went home and did something about it.`,
        exercise: 'Take a passage you have studied. Write the obedience version: the situation, the change, the day, and the review date. Then write the teaching version: an opening paragraph that starts with the need the text addresses and contains no background information at all.',
        toolHint: 'Sermon Draft tile — compare its application section with the one you built through the five steps yourself',
      },
    ],
    quiz: [
      {
        q: 'A passage teaches learned contentment in both plenty and need. Three people in different circumstances receive three different specific applications. What has happened?',
        options: [
          'The meaning changed for each person',
          'One fixed meaning made contact with three situations — meaning is fixed, application is many',
          'Two of the three applications must be wrong',
          'The passage has multiple meanings depending on the reader',
        ],
        answer: 1,
        explanation: 'Meaning is what the author intended for his readers and it does not move. Applications are the legitimate points of contact between that fixed meaning and different situations.',
      },
      {
        q: 'In the five-step crossing, which step is skipped most often, and what does skipping it produce?',
        options: [
          'Step one — producing shallow applications',
          'Step two, measuring the river — producing applications that ignore real differences and treat ancient instructions as if written directly to us',
          'Step five — producing applications that are too abstract',
          'Step three — producing applications with no principle',
        ],
        answer: 1,
        explanation: 'Measuring the difference between their situation and ours is the step that prevents both naive direct transfer and the strange applications that come from pretending the gap is not there.',
      },
      {
        q: 'Which step protects you from an application that is dangerous rather than merely odd?',
        options: [
          'Step two, measuring the river',
          'Step four, checking the principle against the rest of Scripture',
          'Step five, applying it specifically',
          'Step one, grasping it in their town',
        ],
        answer: 1,
        explanation: 'A principle no other text supports and some texts contradict is a principle built wrong. The map check is what catches an application that is internally consistent and canonically indefensible.',
      },
      {
        q: '"Do not muzzle an ox while it is treading grain" is restated as "God cares about fairness." What is wrong with that principle?',
        options: [
          'It is untrue',
          'It is stated at too high an altitude — unobjectionable, unfalsifiable, and it could have come from any passage',
          'It leaves out the agricultural setting',
          'It contradicts the New Testament use of the verse',
        ],
        answer: 1,
        explanation: 'Too low leaves the principle stuck in their world; too high makes it useless. The right altitude is transferable and still demands something specific — here, that a worker should benefit from the work he does.',
      },
      {
        q: 'A passage reorders what a reader should want, without issuing any command. A reader who only applies through the "duty" face will:',
        options: [
          'Apply it correctly, since all application is ultimately about behavior',
          'Miss it, or force it into a command it never made — the goals face exists for exactly this material',
          'Need to consult a commentary',
          'Have to treat the passage as descriptive only',
        ],
        answer: 1,
        explanation: 'Duty, character, goals, and discernment are four different kinds of claim. A reader with only the first face turns everything into a task and loses everything Scripture does to desires and to sight.',
      },
      {
        q: 'Which face of application handles situations that no rule directly covers?',
        options: [
          'Duty',
          'Character',
          'Goals',
          'Discernment — seeing a situation wisely when rules run out',
        ],
        answer: 3,
        explanation: 'Much of Scripture, especially wisdom material and narrative, trains sight rather than issuing instructions. Without this face, that entire body of material has nowhere to land.',
      },
      {
        q: 'You notice that your last five applications, from five different passages, all landed on the same theme you care about most. The most likely diagnosis is:',
        options: [
          'Scripture consistently teaches that theme',
          'Your burden has become the destination of every text, which means the applications are not coming from the passages',
          'You have chosen well-matched passages',
          'The passages were all from the same book',
        ],
        answer: 1,
        explanation: 'If an application could have been delivered from a dozen other passages, it did not come from this one. This is the most common failure among sincere teachers, and only an audit catches it.',
      },
      {
        q: 'A story where a paralyzed army is delivered through an unranked shepherd is preached as "face your giants with courage." What is the main problem?',
        options: [
          'Courage is not a biblical virtue',
          'The moralizing reading replaces God as the subject of the scene — and it promises something the text does not, since the hearers are not the boy in the story',
          'The passage is Old Testament and should not be applied directly',
          'The story is about the king, not the shepherd',
        ],
        answer: 1,
        explanation: 'The narrative says outright who the battle belongs to and what everyone is supposed to learn from it. The moralizing version quietly changes both the subject and the promise.',
      },
      {
        q: 'Which question best tests whether you have found a narrative\'s theological center rather than a moral lesson?',
        options: [
          '"Is the main character admirable?"',
          '"Could I preach this same message if the human character had failed?"',
          '"Does the story have a clear villain?"',
          '"Is the lesson repeated elsewhere in Scripture?"',
        ],
        answer: 1,
        explanation: 'If the message survives the human character failing, it was never resting on his performance — which means you have found what the narrator is actually arguing.',
      },
      {
        q: 'What distinguishes a real personal application from a sentiment?',
        options: [
          'Its emotional weight',
          'Its length',
          'A named situation, a named change, a time, and a review — an application with no person, place, or day is not one',
          'Whether it was written down',
        ],
        answer: 2,
        explanation: 'Specificity is the difference between deciding and feeling. The review date is the part almost everyone skips, and it is the part that turns a study into a change.',
      },
    ],
  },

  {
    slug: 'eisegesis-guard',
    number: 13,
    title: 'Eisegesis Awareness',
    subtitle: 'Guard the Text',
    icon: '⚑',
    color: '#c05050',
    lessons: [
      {
        id: 'eis-1',
        title: 'It Feels Identical From the Inside',
        content: `Two words mark the difference, both built from Greek. Exegesis means leading out — drawing the meaning out of the text. Eisegesis means leading in — reading your meaning into it.

The thing nobody tells you is that from the inside they feel exactly the same. Both feel like discovery. Both produce the experience of the passage opening up. Nobody sits down intending to import a meaning; they sit down and find one, and the finding feels honest because it was sincere.

Which means sincerity is not a defense and never has been. The people who have done the most damage with a Bible in their hands were, in the main, not cynics.

What actually protects you is not a feeling but a set of practices, and you have been building them: reading slowly enough to see what is there, knowing the genre's rules, staying inside the context, following the structure, letting words mean what usage says they mean, asking whether the text requires your conclusion, and writing down what the text does not say.

This last skill adds one more: knowing the specific shapes eisegesis takes, so you can recognize it — first in other people's teaching, where it is easy, and eventually in your own, where it counts.

One test to carry from the start. When you finish a study, ask: did the text tell me anything I did not want to hear? If the answer is never — across months of study — you are almost certainly reading yourself. A book that only ever confirms you is not being read.`,
        exercise: 'Look back at your last several studies. Write down every conclusion that surprised you or cut against something you preferred. If the list is empty, pick a passage you have avoided and study it this week.',
      },
      {
        id: 'eis-2',
        title: 'Six Shapes It Takes',
        content: `Learn these by name. Naming a failure is most of catching it.

Anachronism. Reading a modern concept back into an ancient text. Reading a first-century statement about contentment through a modern framework of personal achievement is anachronism — the framework did not exist, so the writer cannot have meant it.

Projection. Reading your own situation into the text and then hearing the text address it. The tell is that the passage always turns out to be about exactly what you are going through, in the detail you are going through it.

Forced typology. Turning incidental details into deliberate patterns, or making every figure a picture of Christ regardless of the material.

Proof-texting. Using a verse as a container for a position it does not hold, usually with the surrounding argument removed. The tell is a rapid string of references with no context given for any of them.

Importing a system. Arriving with a theological framework fully formed and using the passage as a slot for a category. The text stops being able to say anything the system does not already contain — including the things it was written to say.

Choosing the meaning you needed. A word has a range or a clause has two possible readings, and the one selected is consistently the one that yields the conclusion you wanted. Any single instance is defensible. The pattern is the evidence.

That last one is the most common among careful readers, because every step is legitimate and only the aggregate reveals it.`,
        exercise: 'Take a teaching you have heard that you suspect is off. Identify which of the six shapes it is, and write the specific evidence. Then take one of your own conclusions and do the same, honestly.',
        toolHint: 'Eisegesis Flagger — the warnings name the same categories in the generated analysis',
      },
      {
        id: 'eis-3',
        title: 'The Requirement Test',
        content: `You have met this test twice. It belongs here as the primary defense, stated as sharply as it will go.

Wrong question: can I support this from the text?

Right question: does the text require this?

The wrong question has almost no discriminating power. Given selective attention, a text can be made to support a very wide range of positions, which is why two people can proof-text opposite conclusions from the same chapter and both feel supported.

Requirement is different. It asks whether a reader who did not already hold your conclusion would be driven to it by this passage.

Four questions that operationalize it.

What would a careful reader who does not share my position say this passage means?

What in the text would I have to minimize, reinterpret, or skip to keep my reading?

Is there a reading that accounts for more of the passage than mine does — including the awkward parts?

If I had never heard my conclusion before, would this text have produced it?

That last one is uncomfortable in the best way. A great deal of what people believe a passage teaches is something they learned elsewhere and now see in the text, which is a legitimate way to learn but not evidence that the text teaches it.

The outcome of this test is often not that you were wrong. It is that you learn your conclusion is probable rather than required — and that is not a downgrade. It is knowing what you actually have.`,
        exercise: 'Take an interpretation you hold firmly. Answer all four questions in writing. Be specific about what you would have to minimize. Then rate your conclusion: required, probable, or permitted.',
      },
      {
        id: 'eis-4',
        title: 'Argue Against Yourself First',
        content: `Here is the habit that catches more errors than any other, and it costs ten minutes.

Before you teach a conclusion — or act on one — spend ten minutes trying to destroy it.

Not a token gesture. Genuinely build the case. Three moves.

Build the strongest alternative. Not a weak version you can knock down. The best case for the other reading, stated the way its holders would state it. If you cannot build one, you do not yet understand the passage well enough to teach it confidently.

Find the passage's inconvenient parts. Every reading has verses it handles less comfortably. Find yours and name them. A reading that handles some of the passage badly is not thereby wrong — but you should know exactly where it strains.

Ask what would change your mind. Name the evidence that would move you. If nothing would, you are not holding a conclusion; you are holding a commitment, and it should be labeled as one.

You will notice this is the same discipline as writing fences, aimed inward.

And there is a practical payoff beyond accuracy. When someone challenges you later, you will already have met the objection and thought about it. The person who has argued against himself in private is never rattled in public, and never has to defend a position by volume.`,
        exercise: 'Take a conclusion you plan to teach or act on. Spend ten timed minutes writing the strongest case against it. Then write one sentence: what would change my mind? If you cannot answer, that is the finding.',
      },
      {
        id: 'eis-5',
        title: 'The Passages You Avoid',
        content: `Bias in Bible study is not a character flaw. It is how human cognition works, and disciplined readers assume it rather than deny it.

Four patterns worth knowing.

You find what you were looking for. If you open a passage expecting a theme, you will locate evidence for it and you will not notice the evidence you passed.

Your most vivid recent experience becomes the lens. Whatever you are living through supplies the categories you read with, so the text keeps addressing it.

You read "us" as your group and "them" as the people you already disagree with. Warnings land on others; promises land on you. Reverse the assignment for one reading and see what happens.

Passages that affirm you feel true, and passages that indict you feel like they need more study. This is the one to watch. Notice how much more interpretive effort you are willing to spend on a text that makes you uncomfortable.

The most useful diagnostic in this whole skill is the shortest: list the passages you avoid.

Everyone has them. Texts on money, on the tongue, on submission, on sexual conduct, on judgment, on possessions, on the poor. The ones you skip, the ones you reflexively explain, the ones that always turn out to be about something else once you finish studying them.

That list is your bias map. It is more accurate about you than anything you would say about yourself, and the fastest way to grow as a reader is to work through it deliberately — one avoided passage at a time, with the requirement test running.`,
        exercise: 'Write down three passages you avoid or reflexively explain away. Pick one. Study it properly this week using every skill in this academy. Write what it says at full strength before you write what you think about it.',
      },
      {
        id: 'eis-6',
        title: 'Come to Be Corrected',
        content: `Technique is not the last word here. Posture is.

The reader most protected against reading himself into Scripture is the one who came expecting to be corrected. Not hoping for confirmation with an openness to correction if it happens — actually expecting it, because he assumes his understanding is partial and he wants the gap closed.

That is a disposition, and dispositions are formed by practices. Three of them.

Read the parts that indict you as often as the parts that comfort you, and give the uncomfortable ones the same benefit of the doubt.

Say out loud, regularly, what you do not know. To yourself, and in front of the people you teach. A teacher who has never said "I am not sure" has taught his hearers that certainty is the only acceptable state, and that lesson will do more damage than any single wrong interpretation.

Change your mind in public when you should. Name the change, name what moved you, and do not smuggle it in quietly. People learn how to handle Scripture by watching how you handle being wrong about it.

And keep the aim in view. The point of all thirteen of these skills is not accuracy for its own sake and not the ability to win arguments. The stated goal of instruction, in Scripture's own words, is love — from a pure heart, a good conscience, and a sincere faith. Everything in this academy is in service of that.

The skills are tools. Tools are as good as the hands that hold them, and the hands here belong to someone who is not the master of this text but is under it.`,
        exercise: 'Write down one thing you have changed your mind about in Scripture, and what moved you. Then write one thing you are currently uncertain about and have been presenting as settled. Decide what you will say about it next time it comes up.',
      },
    ],
    quiz: [
      {
        q: 'Why is sincerity not a defense against eisegesis?',
        options: [
          'Because sincere readers rarely study carefully',
          'Because reading meaning into a text feels exactly like discovering it — both produce the experience of a passage opening up',
          'Because sincerity is a modern concept',
          'Because eisegesis is always deliberate',
        ],
        answer: 1,
        explanation: 'Nobody sits down intending to import a meaning. Since the two feel identical from the inside, only practices — not intentions — protect you.',
      },
      {
        q: 'Across months of study, nothing has ever cut against what you already believed or preferred. The most likely explanation is:',
        options: [
          'Your theology is well calibrated',
          'You are reading yourself — a book that only ever confirms you is not being read',
          'You have chosen well-suited passages',
          'You have reached maturity in interpretation',
        ],
        answer: 1,
        explanation: 'This is the cheapest and most reliable diagnostic available. Scripture correcting a reader is normal; its total absence over time is the finding.',
      },
      {
        q: 'A reader consistently chooses, among two legitimate options for a word or a clause, the one that yields the conclusion he wanted. Any single choice is defensible. What is the failure, and how is it detected?',
        options: [
          'There is no failure if each choice is defensible',
          'Choosing the meaning you needed — detected in the aggregate, since the pattern rather than any single instance is the evidence',
          'Proof-texting — detected by counting references',
          'Anachronism — detected by checking dates',
        ],
        answer: 1,
        explanation: 'This is the most common form among careful readers precisely because every individual step survives scrutiny. Only the pattern across many decisions reveals it.',
      },
      {
        q: 'Which question has almost no power to discriminate between good and bad interpretations?',
        options: [
          '"Does the text require this?"',
          '"Can I support this from the text?"',
          '"What would a reader who disagrees with me say this means?"',
          '"What would I have to minimize to keep my reading?"',
        ],
        answer: 1,
        explanation: 'With selective attention almost any text can be made to support almost anything — which is how two people proof-text opposite conclusions from one chapter and both feel supported.',
      },
      {
        q: 'Applying the requirement test, your conclusion turns out to be probable rather than required. This means:',
        options: [
          'You should abandon it',
          'You now know what you actually have, and you can teach it with the right confidence — which is a gain, not a downgrade',
          'The passage is corrupt',
          'You should find a commentary that supports it',
        ],
        answer: 1,
        explanation: 'Knowing whether a conclusion is required, probable, or merely permitted is what lets you speak accurately. Most useful conclusions live in the middle category.',
      },
      {
        q: 'What is the point of building the strongest possible case against your own conclusion before teaching it?',
        options: [
          'To appear balanced',
          'To catch errors in private rather than in public — and to be unrattled later, since you have already met the objection',
          'To find quotations from opposing views',
          'To lengthen the preparation process',
        ],
        answer: 1,
        explanation: 'Ten minutes of genuine self-attack catches more errors than any other habit. It also means you never have to defend a position by volume.',
      },
      {
        q: 'You cannot name any evidence that would change your mind about an interpretation. What does that indicate?',
        options: [
          'The interpretation is certainly correct',
          'You are holding a commitment rather than a conclusion, and it should be labeled as one',
          'The passage is unusually clear',
          'You have studied it thoroughly',
        ],
        answer: 1,
        explanation: 'A conclusion is responsive to evidence by definition. Naming what would move you is how you tell the difference between the two — and both exist legitimately, but they should not be confused.',
      },
      {
        q: 'Which is the sharpest available diagnostic of a reader\'s own bias?',
        options: [
          'The doctrines they hold most firmly',
          'The list of passages they avoid or reflexively explain away',
          'The translation they prefer',
          'How much time they spend in study',
        ],
        answer: 1,
        explanation: 'The avoided list is more accurate about a reader than anything they would say about themselves, and working through it deliberately is the fastest available growth.',
      },
      {
        q: 'A teacher has never once said "I am not sure" in front of the people he teaches. What has he taught them?',
        options: [
          'That he is well prepared',
          'That certainty is the only acceptable state — a lesson that does more damage than any single wrong interpretation',
          'That Scripture is clear',
          'Nothing significant',
        ],
        answer: 1,
        explanation: 'People learn how to handle Scripture by watching how a teacher handles its hard parts and his own limits. Uniform confidence trains hearers to either swallow everything or eventually discount everything.',
      },
      {
        q: 'According to Scripture\'s own statement of purpose for instruction, what are all these skills ultimately in service of?',
        options: [
          'Doctrinal precision',
          'The ability to defend the faith in argument',
          'Love, from a pure heart, a good conscience, and a sincere faith',
          'Depth of biblical knowledge',
        ],
        answer: 2,
        explanation: 'Precision, defense, and knowledge are all real goods and all servants. A method that produces accuracy and no love has missed the aim its own source states.',
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
  { slug: 'newcomer',   label: 'Newcomer',    skills: 0  },
  { slug: 'apprentice', label: 'Apprentice',  skills: 3  },
  { slug: 'student',    label: 'Student',     skills: 6  },
  { slug: 'journeyman', label: 'Journeyman',  skills: 9  },
  { slug: 'exegete',    label: 'Exegete',     skills: 13 },
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
