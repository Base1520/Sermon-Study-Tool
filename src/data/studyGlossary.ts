/**
 * studyGlossary.ts — the study vocabulary a PLAIN READ reader actually meets.
 *
 * PLAIN READ explains a passage to somebody who wants to understand it. In the
 * course of that it says things like "this is a formal greeting" or "the aorist
 * here summarises the action" — true, load-bearing, and opaque to the person
 * the mode exists for. The document cannot stop and define every one of those
 * without turning into a textbook, so the definition lives here and the reader
 * pulls it when they want it.
 *
 * THE 'why' FIELD IS THE PRODUCT. 'short' says what a term is; anybody can
 * write that. 'why' says what changes in the reading when you know it. An entry
 * that cannot answer that does not belong in the file.
 *
 * RULES THIS FILE HOLDS TO
 * - No scholar, commentator, author or book is named. Positions and traditions
 *   may be named; people may not.
 * - No invented historical or grammatical detail. Where something is genuinely
 *   disputed, the entry says so in a clause rather than asserting.
 * - No pulpit language. Nothing here is scaffolding for a talk.
 *
 * MATCHING is exposed through findGlossTerms(): longest phrase first,
 * case-insensitive, whole words only, no overlaps, document order.
 */

export interface GlossEntry {
  /** Stable kebab-case key. Referenced by seeAlso and by getGloss(). */
  id: string
  /** Canonical display term. */
  term: string
  /** Lowercase surface forms that should light up in prose. */
  match: string[]
  /** ONE sentence: what it is. */
  short: string
  /** 2-4 sentences: why it matters for reading this kind of text. */
  why: string
  /** ids of related entries. */
  seeAlso?: string[]
}

/* ────────────────────────────────────────────────────────────────────────── *
 * THE ENTRIES
 * Grouped by the part of the reading they serve. Order inside the array is
 * presentational only — matching is driven by the index built below it.
 * ────────────────────────────────────────────────────────────────────────── */

export const GLOSSARY: GlossEntry[] = [

  /* ── letters: how one is built, and what the shape is doing ─────────────── */

  {
    id: 'epistle',
    term: 'Epistle (letter)',
    match: ['epistle', 'epistles', 'epistolary', 'letter form'],
    short: 'A real letter, written by a named sender to named readers, that was later kept and read by everyone else.',
    why: 'A letter is one half of a conversation. The writer and the first readers both knew the situation, so the letter only says the part they did not already share, and a modern reader is reading somebody else\'s mail with the background missing. That is not a defect to fix with guesswork — it is the reason a careful reader reconstructs the situation from the letter itself before deciding what a line means.',
    seeAlso: ['occasional-letter', 'greeting', 'letter-body'],
  },
  {
    id: 'greeting',
    term: 'Greeting (the letter opening)',
    match: ['formal greeting', 'epistolary opening', 'opening greeting', 'greeting', 'greetings', 'salutation', 'grace and peace'],
    short: 'The fixed opening of an ancient letter: who is writing, who is being written to, and a word of greeting.',
    why: 'Ancient letters opened on a formula — sender, recipient, greeting — the way an email still opens with a subject line. Because the formula was fixed, every bend in it was deliberate and every first reader felt the bend. When a greeting runs six verses instead of one line, the writer is loading his credentials or his theme in before he starts, and the argument he makes later is already standing on it. Skip the greeting and you skip the writer telling you what authority he is claiming and what the letter is about to be about.',
    seeAlso: ['sender-formula', 'recipient-formula', 'thanksgiving-section', 'epistle'],
  },
  {
    id: 'sender-formula',
    term: 'Sender formula',
    match: ['sender formula', 'sender line', 'self-designation'],
    short: 'The first slot in an ancient letter opening, where the writer names himself and says what he is.',
    why: 'The slot is one line wide by convention, so whatever a writer puts in it is what he wants standing over everything that follows. A sender who calls himself a bound servant and a commissioned messenger in the same breath has claimed both no status of his own and full authority to speak — before a single instruction lands. Read the sender line as the writer\'s statement of the ground he is speaking from, then check whether the letter\'s hardest paragraph is leaning on exactly that ground.',
    seeAlso: ['greeting', 'apostle', 'servant-slave'],
  },
  {
    id: 'recipient-formula',
    term: 'Recipient formula',
    match: ['recipient formula', 'addressee', 'addressees', 'address line'],
    short: 'The second slot in a letter opening, naming who the letter is for.',
    why: 'Who is addressed sets who a command was aimed at, and that is the first control on how far it travels. A letter written to one gathered group in one city is not addressed to an individual in private, and most of the commands in it are plural in the original even where English "you" hides that. Watching whether a letter addresses a group, an individual, or a scattered network keeps a reader from turning a corporate instruction into a private rule, or the reverse.',
    seeAlso: ['greeting', 'original-audience', 'occasional-letter'],
  },
  {
    id: 'thanksgiving-section',
    term: 'Thanksgiving section',
    match: ['thanksgiving section', 'thanksgiving', 'prayer report'],
    short: 'The paragraph after the greeting where the writer reports what he thanks God for, or prays for, in these readers.',
    why: 'It was a standard courtesy in letters of the period, which makes it useful twice over. First, it usually previews the letter\'s themes — what the writer is grateful for is often exactly what he is about to press. Second, when a letter drops the thanksgiving entirely and goes straight at the readers, the missing paragraph is itself the signal, and a reader who does not know the section is standard will not notice it is gone.',
    seeAlso: ['greeting', 'letter-body', 'epistle'],
  },
  {
    id: 'letter-body',
    term: 'Body of the letter',
    match: ['letter body', 'body of the letter', 'main body'],
    short: 'The middle of a letter, where the actual business is done.',
    why: 'The opening and closing run on convention; the body is where the writer says the thing he wrote for. Knowing where the body starts stops a reader from mining the formal parts for weight they were never carrying, and it usually marks the point where the writer states the problem he is answering. The joint between the body\'s argument and its instructions is normally the letter\'s spine.',
    seeAlso: ['greeting', 'letter-closing', 'flow-of-thought'],
  },
  {
    id: 'letter-closing',
    term: 'Closing',
    match: ['letter closing', 'closing formula', 'final greetings', 'closing section'],
    short: 'The end of a letter: personal greetings, travel plans, instructions about the letter itself, a final blessing.',
    why: 'Closings look like throwaway material and are the densest historical evidence in the letter. The names, the errands and the travel notes are where a reader learns who was actually in the room, who carried the letter, and what the network around it looked like. A closing also tends to restate in one line the thing the letter was written to secure.',
    seeAlso: ['benediction', 'doxology', 'letter-carrier'],
  },
  {
    id: 'doxology',
    term: 'Doxology',
    match: ['doxology', 'doxologies', 'doxological'],
    short: 'A short burst of praise to God, usually breaking into the middle or the end of a passage.',
    why: 'A doxology is a seam marker. Writers reach for one when an argument has just landed somewhere that will not fit inside the argument, so its position tells you where the writer thought a movement ended. Treating it as decoration loses a structural signal that costs nothing to read.',
    seeAlso: ['benediction', 'letter-closing', 'unit'],
  },
  {
    id: 'benediction',
    term: 'Benediction',
    match: ['benediction', 'benedictions', 'blessing formula'],
    short: 'A spoken blessing pronounced over the hearers, normally at the very end.',
    why: 'A benediction is directed at people, not at God — the writer is asking something for the readers, which makes it a compact statement of what he thinks they most need. Read against the body of the letter, the final blessing often names the exact lack the letter was written to address. It is also a hard boundary marker: once it is spoken, the document is over.',
    seeAlso: ['doxology', 'letter-closing'],
  },
  {
    id: 'occasional-letter',
    term: 'Occasional letter',
    match: ['occasional letter', 'occasional letters', 'occasional document'],
    short: 'A letter written into one specific situation rather than as an all-purpose summary of what the writer believed.',
    why: 'Occasional does not mean casual — it means driven by an occasion. The writer says what that situation required and stays silent about everything it did not raise, so silence in a letter is not denial and emphasis in a letter is not a ranking of importance. The practical rule: reconstruct the problem being answered before deciding what a sentence means, and never build a doctrine on what a letter happened not to mention.',
    seeAlso: ['epistle', 'original-audience', 'historical-background'],
  },
  {
    id: 'amanuensis',
    term: 'Amanuensis (secretary)',
    /* 'dictated' dropped: all 3 occurrences in the stored corpus were the
       ordinary verb ("the oldest male dictated what was best"). */
    match: ['amanuensis', 'secretary', 'dictation'],
    short: 'A trained secretary who physically wrote a letter while the sender dictated it.',
    why: 'Much of the correspondence of the period was produced this way, and it explains features that otherwise look strange: a secretary greeting the readers in his own name, or the sender pointing out that he has taken the pen for the last lines in his own large handwriting. How much freedom a secretary had is genuinely disputed — anywhere from word-for-word dictation to drafting from instructions — which is one honest reason style can vary between letters from the same sender. Knowing the role exists keeps a reader from treating a style difference as automatic evidence about who was behind the letter.',
    seeAlso: ['letter-carrier', 'epistle', 'textual-variant'],
  },
  {
    id: 'letter-carrier',
    term: 'Letter carrier',
    match: ['letter carrier', 'carrier', 'courier', 'bearer of the letter'],
    short: 'The person who physically carried a letter to its readers, since private mail had no postal service.',
    why: 'The state ran a courier system for official business; everyone else sent letters by a traveller they trusted. That person delivered the letter and most likely read it out and answered the questions it raised, which would make the carrier part of the message and means the letter did not have to be self-explanatory. It also explains why letters commend their carrier by name and why some instructions read as compressed: the rest was going to be handled in person.',
    seeAlso: ['read-aloud', 'letter-closing', 'occasional-letter'],
  },
  {
    id: 'read-aloud',
    term: 'Reading aloud',
    match: ['read aloud', 'reading aloud', 'public reading'],
    short: 'These texts were normally heard by a group, not read silently by an individual.',
    why: 'Most first hearers met the text through their ears, in one sitting, in a room with other people. That is why the writing repeats key words, brackets sections with matching phrases, and builds arguments a listener can follow without flipping back. When a reader notices a repeated phrase, they are usually catching a signal designed for hearing, and reading a passage out loud once will surface joints that scanning silently hides.',
    seeAlso: ['inclusio', 'repetition', 'refrain'],
  },

  /* ── genre: what kind of writing this is ────────────────────────────────── */

  {
    id: 'genre',
    term: 'Genre',
    match: ['genre', 'genres', 'kind of writing'],
    short: 'The kind of writing a text is — letter, story, poem, legal material, vision — and the set of rules that come with it.',
    why: 'Genre is the first decision a reader makes and it silently controls every decision after it. The same sentence means different things in a law code, a poem and a narrative report, because each genre has different conventions about exaggeration, sequence and what counts as a promise. Almost every serious misreading of a passage starts with reading it as the wrong kind of writing, so naming the genre before interpreting is the cheapest error-correction available.',
    seeAlso: ['narrative', 'poetry', 'law', 'apocalyptic'],
  },
  {
    id: 'narrative',
    term: 'Narrative',
    match: ['narrative', 'narratives', 'narrative report'],
    short: 'Writing that reports events — who did what, in what order, with what result.',
    why: 'Narrative shows rather than tells, and it often reports things it does not approve of. A story records that a man did something; it usually does not stop to say whether he should have. The reader\'s work is to find where the narrator does signal a verdict — through outcome, through comment, through the shape of the telling — instead of assuming that anything a character does is being held up as an example.',
    seeAlso: ['descriptive-prescriptive', 'genre', 'scene-and-sequence'],
  },
  {
    id: 'poetry',
    term: 'Poetry',
    match: ['poetry', 'poetic', 'poem'],
    short: 'Writing built on lines and images rather than on sentences and paragraphs.',
    why: 'Poetry says true things in figures, and the figure is doing work that a flat paraphrase destroys. It also states things absolutely for effect — a line of praise or of complaint is not a legal claim to be pressed for exceptions. Read the image as an image, ask what it is comparing to what, and do not turn a metaphor into a mechanism.',
    seeAlso: ['parallelism', 'metaphor', 'hyperbole', 'lament'],
  },
  {
    id: 'wisdom-literature',
    term: 'Wisdom literature',
    match: ['wisdom literature', 'wisdom writing', 'wisdom sayings', 'wisdom saying', 'wisdom book'],
    short: 'Writing that observes how life generally runs and how to live skilfully inside it.',
    why: 'Wisdom sayings are observations about the way things normally go, not guarantees. Read as promises they will eventually break on a reader, because life supplies the exceptions and the literature itself supplies them too — one strand of it exists specifically to argue with easy versions of the same sayings. Take a wisdom line as reliable counsel about the ordinary case, and let the harder books stand as the honest limit on it.',
    seeAlso: ['proverb', 'genre', 'lament'],
  },
  {
    id: 'proverb',
    term: 'Proverb',
    match: ['proverb', 'proverbs', 'maxim'],
    short: 'A short, memorable saying that compresses a general truth into a line you can carry.',
    why: 'A proverb is built for memory, which means it is deliberately compressed and slightly overstated. Pressing one for precision is a category mistake — it was never trying to cover every case, and two proverbs can sit side by side giving opposite counsel because each fits a different situation. The skill is knowing which situation the saying fits, which is itself the thing the literature is trying to teach.',
    seeAlso: ['wisdom-literature', 'hyperbole'],
  },
  {
    id: 'prophecy',
    term: 'Prophecy',
    match: ['prophecy', 'prophetic literature', 'prophetic'],
    short: 'Speech delivered on God\'s behalf to a specific people, usually about their covenant obligations and what will follow from keeping or breaking them.',
    why: 'Most prophecy is addressed to the prophet\'s own generation about their own conduct; prediction is one part of it, not the whole. Read as if it were mainly a coded forecast, a prophetic book becomes a puzzle to decode rather than a case being argued, and the argument is where the meaning is. Ask first what this demanded of the people standing in front of the prophet, and only then what it says about later fulfilment.',
    seeAlso: ['oracle', 'covenant', 'sign-act', 'fulfillment'],
  },
  {
    id: 'apocalyptic',
    term: 'Apocalyptic',
    match: ['apocalyptic', 'apocalypse', 'apocalyptic imagery'],
    short: 'Vision writing that pictures history and its outcome in heavy symbols — beasts, numbers, cosmic collapse.',
    why: 'The symbols are the medium, not a code smuggling in literal detail, and they were often written for people under pressure who needed to see their situation from above. Numbers and creatures carry meaning as symbols before they carry any reference to a specific thing. How much of this material describes events near the writer\'s own time and how much is still ahead is one of the sharpest live disagreements among readers who take the text seriously, so a confident single reading is a claim to notice, not a given.',
    seeAlso: ['genre', 'prophecy', 'metaphor'],
  },
  {
    id: 'gospel-genre',
    term: 'Gospel (as a kind of writing)',
    match: ['gospel account', 'gospel narrative', 'the gospels', 'gospels'],
    short: 'An account of Jesus\' life and death written to persuade, whose closest ancient parallel is biography.',
    why: 'Ancient biography selected and arranged material to show what a person was, and did not promise the strict chronological ordering a modern reader expects. That is why the same event can sit in different places in different accounts without either being false — arrangement was a legitimate authorial tool. The classification is argued over, but the practical payoff holds: ask why this writer put this episode here, next to that one.',
    seeAlso: ['narrative', 'genre', 'gospel'],
  },
  {
    id: 'law',
    term: 'Law',
    match: ['law', 'torah', 'legal material', 'case law', 'law code'],
    short: 'Two things at once: the first section of the Hebrew Scriptures, and the covenant obligations recorded inside it.',
    why: 'The legal material is embedded in a story and attached to a covenant, not issued as a free-standing code, so it reads as the terms of a relationship rather than a civil statute book. Much of it is case law — "if this happens, then this follows" — which sets a boundary and a principle rather than covering every situation. How these obligations bind readers now is one of the oldest disagreements in the church, and the traditions that differ on it are all reading the same texts; a reader should know which answer they are assuming. The same English word also renders a general sense — a principle or a force at work — so check which one a sentence means before reading a whole covenant into it.',
    seeAlso: ['covenant', 'gospel', 'fulfillment', 'genre'],
  },
  {
    id: 'lament',
    term: 'Lament',
    match: ['lament', 'laments', 'complaint psalm'],
    short: 'A poem of complaint addressed to God, usually moving from the trouble to a petition and often to a turn toward trust.',
    why: 'Lament is sanctioned speech: the complaint is inside the prayer, not a failure of it. The usual movement — address, complaint, petition, turn — is worth tracking, because knowing the pattern lets a reader see exactly where a particular poem departs from it. At least one lament never turns and ends in darkness, which is itself part of what the collection is willing to say.',
    seeAlso: ['poetry', 'wisdom-literature', 'refrain'],
  },
  {
    id: 'oracle',
    term: 'Oracle',
    match: ['oracle', 'oracles', 'messenger formula', 'thus says'],
    short: 'A single prophetic speech unit, often marked off by a messenger formula like "thus says the LORD".',
    why: 'Prophetic books are collections of speeches, not continuous essays, and the formula is the seam between them. Missing the seam is how a reader accidentally welds the end of one oracle to the start of another and builds a claim out of the joint. Finding the formulas first turns a wall of text into a set of separate messages, each with its own occasion and target.',
    seeAlso: ['prophecy', 'unit', 'discourse-marker'],
  },
  {
    id: 'parable',
    term: 'Parable',
    match: ['parable', 'parables', 'parabolic'],
    short: 'A short invented story that makes its point by comparison.',
    why: 'A parable is aimed at somebody in a specific setting, and the setting usually tells you what it is for — who was listening, and what they had just said. Not every detail is a code: some parables carry a single thrust, some clearly line up several figures, and forcing meaning onto every prop produces readings the story never made. Find who is being addressed and what the story does to them, and let the details serve that rather than the reverse.',
    seeAlso: ['allegory', 'narrative', 'metaphor'],
  },
  {
    id: 'genealogy',
    term: 'Genealogy',
    match: ['genealogy', 'genealogies', 'genealogical'],
    short: 'A list of descent that makes a claim about who someone is and where they belong.',
    why: 'Genealogies are selective and often shaped — the Hebrew phrasing for "father of" can span generations, and lists get arranged into patterns and symmetries on purpose. So a name list is an argument about legitimacy, inheritance or promise, not a modern family tree with every link present. Read it for the claim it is making about the person at the end of it, and note who has been included that a reader would not expect.',
    seeAlso: ['narrative', 'covenant', 'genre'],
  },
  {
    id: 'sign-act',
    term: 'Sign-act',
    match: ['sign-act', 'sign act', 'sign-acts', 'enacted sign', 'enacted parable'],
    short: 'A prophet performing the message physically instead of only speaking it.',
    why: 'A sign-act puts the message in the body — a piece of clothing buried, a pot smashed, a marriage entered — done in public so people would ask what it meant. The oddity is the point: it is built to be remembered and to force the question. Treating one as merely a strange biographical detail loses that the act is the message and the explanation attached to it is the interpretation the text supplies.',
    seeAlso: ['prophecy', 'oracle', 'metaphor'],
  },
  {
    id: 'hymn-fragment',
    term: 'Hymn or confessional fragment',
    match: ['hymn fragment', 'creedal fragment', 'early hymn', 'confessional fragment'],
    short: 'A passage that looks like a piece of worship or confession the writer quoted rather than composed on the spot.',
    why: 'Some passages shift into balanced lines, unusual vocabulary and a rhythm the surrounding prose does not have, which suggests the writer is quoting something the readers already sang or recited. Whether a given passage is such a quotation is disputed and cannot be proved from an English text alone. What survives the dispute is useful anyway: the passage is doing something formal and compressed, and the writer is leaning on shared ground rather than arguing from scratch.',
    seeAlso: ['poetry', 'parallelism', 'letter-body'],
  },

  /* ── structure: how the text is put together ────────────────────────────── */

  {
    id: 'chiasm',
    term: 'Chiasm',
    match: ['chiasm', 'chiastic', 'chiasmus'],
    short: 'A mirrored structure where the second half repeats the first in reverse order, often putting the point at the centre.',
    why: 'When it is really there, a chiasm tells a reader where the weight sits — the turn at the middle rather than the conclusion at the end, which is where a modern reader instinctively looks. The danger is that a mirror can be manufactured out of almost any text with enough effort, and a manufactured one teaches a reader to see patterns that are not there. The test is whether the matching pairs use the same words and ideas plainly enough that another reader would find the same structure without being told.',
    seeAlso: ['inclusio', 'structural-shape', 'parallelism'],
  },
  {
    id: 'inclusio',
    term: 'Inclusio',
    match: ['inclusio', 'bookend', 'bracketing repetition'],
    short: 'The same word or phrase at the start and end of a section, bracketing everything between.',
    why: 'This is how a writer marked a unit before there were paragraph breaks, chapter numbers or headings. Spotting the bracket tells a reader where a section actually begins and ends — which is frequently not where the chapter division falls. It also usually names the section\'s theme twice, because the repeated phrase is normally the thing the section is about.',
    seeAlso: ['unit', 'verse-divisions', 'repetition', 'read-aloud'],
  },
  {
    id: 'parallelism',
    term: 'Parallelism',
    match: ['parallelism', 'parallel lines', 'hebrew poetry'],
    short: 'The line-pair engine of Hebrew poetry, where a second line answers the first.',
    why: 'The second line is rarely just a restatement — it usually sharpens, intensifies, narrows or reverses the first, and the movement between them is where the meaning lives. Reading the pair as one thought said twice flattens the poem and loses the step the poet took. Read line two as a comment on line one and ask what it added.',
    seeAlso: ['poetry', 'refrain', 'repetition'],
  },
  {
    id: 'refrain',
    term: 'Refrain',
    match: ['refrain', 'refrains', 'repeated line'],
    short: 'A line that comes back at intervals through a poem or a section.',
    why: 'A refrain does two jobs at once: it divides the piece into movements, and it states the thing the writer wants left in the ear. Because it marks divisions, a reader can use it to find the structure without any headings. Because it is repeated by choice, small changes in its wording between appearances are almost always deliberate and worth stopping on.',
    seeAlso: ['repetition', 'inclusio', 'parallelism'],
  },
  {
    id: 'unit',
    term: 'Unit',
    match: ['unit', 'units', 'block of text'],
    short: 'A stretch of text that holds together as one move — one scene, one argument, one oracle.',
    why: 'Meaning is carried by units, not by verses, and the boundaries were set by the writer rather than by the numbering. Working out where a unit starts and stops is the single most useful structural move available to an untrained reader, because it decides what the surrounding material is allowed to say about a line. Look for the markers: a change of scene, a change of who is speaking, a connective, or a bracketing phrase.',
    seeAlso: ['pericope', 'inclusio', 'verse-divisions', 'discourse-marker'],
  },
  {
    id: 'pericope',
    term: 'Pericope',
    match: ['pericope', 'pericopes'],
    short: 'A self-contained passage that can be read on its own — one episode or one teaching block.',
    why: 'The word is just a technical name for a unit that was already circulating and being retold as a whole. Its value to a reader is the reminder that a passage has natural edges, and that reading from an arbitrary start point to an arbitrary stop point imports meaning from a place the writer did not intend. Find the edges before deciding what the passage is about.',
    seeAlso: ['unit', 'context', 'immediate-context'],
  },
  {
    id: 'context',
    term: 'Context',
    match: ['context', 'contextual'],
    short: 'Everything around a sentence that constrains what it can mean — the argument it sits in, the book it belongs to, the situation it was written into.',
    why: 'A sentence has a range of possible meanings on its own, and context is what narrows that range to one. This is why a verse can be quoted accurately and still be used to say something its writer never said. Practically: the sentences on either side have more say over a line\'s meaning than any outside idea a reader brings to it.',
    seeAlso: ['immediate-context', 'canonical-context', 'proof-texting', 'historical-background'],
  },
  {
    id: 'immediate-context',
    term: 'Immediate context',
    match: ['immediate context', 'immediate surroundings'],
    short: 'The verses directly before and after — the paragraph the line is standing in.',
    why: 'This is the highest-authority context there is, and the cheapest to check: read the ten verses either side and most disputed lines settle themselves. It is also where connectives do their work, since a "therefore" or a "for" points at the sentence next to it, not at a doctrine three books away. When a reading requires ignoring the sentence immediately before it, the reading is wrong.',
    seeAlso: ['context', 'connective', 'unit'],
  },
  {
    id: 'canonical-context',
    term: 'Canonical context',
    match: ['canonical context', 'canonical', 'canon', 'whole-canon'],
    short: 'Where a passage sits in the whole biblical story, from beginning to end.',
    why: 'A text was written at a point in a developing story, and later material can complete or reframe it — which is a real interpretive move, not a trick. The discipline is order of operations: work out what the passage meant where it stands before importing what comes later. Running it the other way flattens the story into one undifferentiated block and quietly erases the point of everything happening in sequence.',
    seeAlso: ['redemptive-historical', 'context', 'fulfillment', 'typology'],
  },
  {
    id: 'discourse-marker',
    term: 'Discourse marker',
    match: ['discourse marker', 'discourse markers', 'signal word'],
    short: 'A word or phrase that signals what the writer is doing next — starting a new section, drawing a conclusion, changing direction.',
    why: 'These are the writer\'s own road signs, and they are the closest thing the text has to headings. "Now concerning" starts a new topic; "therefore" says the next thing depends on the last; "but" says a reversal is coming. Reading the markers first gives a reader the skeleton of the argument in about a minute, and it is derived from the text rather than imposed on it.',
    seeAlso: ['connective', 'unit', 'flow-of-thought'],
  },
  {
    id: 'connective',
    term: 'Connective',
    match: ['connective', 'connectives', 'conjunction', 'connecting word', 'logical connector'],
    short: 'The small joining words — for, so that, but, because, therefore — that state how two statements relate.',
    why: 'These words carry the logic of a passage, and they are the first thing a reader\'s eye skips. "For" means what follows is the reason; "so that" means it is the purpose; "therefore" means it is the conclusion drawn from what just went. Circling the connectives in a paragraph turns a list of statements into an argument, and it is the fastest way to find out whether a familiar verse is a claim or a reason for one.',
    seeAlso: ['discourse-marker', 'immediate-context', 'flow-of-thought'],
  },
  {
    id: 'verse-divisions',
    term: 'Chapter and verse divisions',
    match: ['chapter break', 'chapter division', 'chapter divisions', 'verse numbers', 'verse division'],
    short: 'The numbering system used to find a passage, added long after the texts were written.',
    why: 'Chapter divisions come from the medieval period and verse numbers from the age of printed Bibles; no biblical writer put them there. They are excellent for reference and unreliable as boundaries — chapter breaks sometimes fall in the middle of an argument, and a verse number can make a clause look like a free-standing sentence. Treat the numbers as an address system and let the text\'s own markers decide where units begin and end.',
    seeAlso: ['unit', 'inclusio', 'paragraph', 'proof-texting'],
  },
  {
    id: 'paragraph',
    term: 'Paragraphing',
    match: ['paragraph break', 'paragraphing', 'paragraph divisions'],
    short: 'The way an edition groups sentences into blocks — an editorial decision, not part of the original text.',
    why: 'Paragraph breaks and section headings in a printed Bible are the work of translators and editors making a judgement about structure. Usually the judgement is good; sometimes it is contested, and different editions divide the same passage differently. Comparing two editions at a disputed point costs a minute and shows a reader exactly where the structure is genuinely unclear.',
    seeAlso: ['verse-divisions', 'unit', 'literal-translation'],
  },
  {
    id: 'structural-shape',
    term: 'Structural shape',
    match: ['structural shape', 'overall structure'],
    short: 'The pattern the whole passage runs on — problem then resolution, statement then command, mirrored halves, or simply straight through.',
    why: 'Naming the shape tells a reader where the weight falls and what any given part is there to do. A passage that states what God did and then what follows for its readers is misread badly if the command half is quoted without the statement half. And a passage that is simply linear should be called linear — claiming a structure that is not there is a worse error than seeing none.',
    seeAlso: ['chiasm', 'inclusio', 'indicative', 'flow-of-thought'],
  },
  {
    id: 'repetition',
    term: 'Repetition',
    match: ['repetition', 'repeated word', 'repeated phrase'],
    short: 'The same word or phrase used more than once inside a stretch of text, deliberately.',
    why: 'These texts were written for the ear, and repetition was the main tool for marking emphasis and structure since there was no bold type. A word that shows up four times in ten verses is the passage announcing its subject. Track the repeats and note where the wording shifts slightly — the variation is normally the point being advanced.',
    seeAlso: ['refrain', 'inclusio', 'read-aloud', 'word-study'],
  },
  {
    id: 'hinge',
    term: 'Hinge',
    match: ['hinge', 'pivot', 'turning point'],
    short: 'The line where a passage turns — the moment the argument or the story changes direction.',
    why: 'Most passages have one, and finding it explains the shape of everything on either side. In a story it is usually where the situation reverses; in an argument it is usually a connective carrying the whole weight. A reader who can name the hinge can summarise the passage honestly, because the turn is what the passage was built to reach.',
    seeAlso: ['structural-shape', 'connective', 'unit'],
  },
  {
    id: 'flow-of-thought',
    term: 'Flow of thought',
    match: ['flow of thought', 'train of thought', 'argument flow'],
    short: 'The chain running through a passage: how each statement hangs on the one before it.',
    why: 'This is the difference between knowing what a passage contains and knowing what it argues. Following the flow is what stops a memorable line from being lifted out and used against the very case it was supporting. The working question is not "what does this verse say" but "how does this hang on the last one" — and it can be asked of any passage, in any book.',
    seeAlso: ['connective', 'discourse-marker', 'immediate-context', 'proof-texting'],
  },
  {
    id: 'scene-and-sequence',
    term: 'Scene',
    match: ['scene', 'scenes', 'change of scene'],
    short: 'One continuous block of narrative — same place, same players, same stretch of time.',
    why: 'Scene boundaries are how narrative divides itself: a change of location, a change of who is present, or a jump in time. Marking them turns a long story into a set of moves and shows what the narrator chose to put next to what. It also exposes what has been left out, and the gaps in a story are often where the narrator is steering hardest.',
    seeAlso: ['narrative', 'unit', 'hinge'],
  },

  /* ── words and grammar, in plain English ────────────────────────────────── */

  {
    id: 'tense',
    term: 'Tense',
    match: ['tense', 'tenses', 'verb tense'],
    short: 'The form of a verb that indicates, roughly, when an action happens and how it is being viewed.',
    why: 'Greek and Hebrew verbs do not map cleanly onto English tenses, because they carry as much information about how an action is portrayed as about when it occurred. That is why translations differ on the same verb and why a comment about a tense can matter. The honest use of a tense observation is modest: it can support a reading the sentence already suggests, and it cannot carry a doctrine on its own.',
    seeAlso: ['aspect', 'aorist', 'perfect-tense', 'participle'],
  },
  {
    id: 'aspect',
    term: 'Aspect',
    /* NOT bare 'aspect'. Measured against the stored corpus (3,529 prose
       strings): 42 of 42 occurrences were ordinary English — "every aspect of
       human life" — and none were the verb category. A gloss that fires there
       teaches the reader the wrong thing about a word they already knew. */
    match: ['verbal aspect', 'aspect of the verb'],
    short: 'Whether a verb presents an action as a whole, as in progress, or as a settled state.',
    why: 'Aspect is the part of the verb system English handles least well, so it is where translation loses the most. A writer choosing to present an action as ongoing rather than complete is making a portrayal choice, and sometimes that choice is the argument. The exact labels are debated among people who work in the original languages, so treat an aspect claim as a nudge in a reading, never as proof.',
    seeAlso: ['tense', 'aorist', 'perfect-tense'],
  },
  {
    id: 'aorist',
    term: 'Aorist',
    match: ['aorist'],
    short: 'A Greek verb form that presents an action as a single whole, usually rendered as a simple past in English.',
    why: 'The aorist is the default way to refer to an action without commenting on its duration — it is the plain, unmarked form. It is widely claimed that an aorist proves a once-for-all, never-repeated act; that claim goes well beyond what the form can carry, and it is the most common overreach in popular teaching about Greek. If a passage teaches that something happened once and for all, it will be the words and the argument that say so, not the tense.',
    seeAlso: ['tense', 'aspect', 'word-study'],
  },
  {
    id: 'perfect-tense',
    term: 'Perfect tense',
    match: ['perfect tense', 'perfect form'],
    short: 'A Greek verb form presenting a past action whose result stands in the present.',
    why: 'The useful part is the standing result: something was done, and the state it produced is still in force. In an argument about status this can be exactly the point being made, since it distinguishes a completed act from an ongoing condition. How much weight the form carries is argued over, so it supports a reading the context already sets up rather than establishing one alone.',
    seeAlso: ['tense', 'aspect', 'aorist'],
  },
  {
    id: 'participle',
    term: 'Participle',
    match: ['participle', 'participles', 'participial'],
    short: 'A verb form acting like an adjective or an adverb — usually the "-ing" form in English.',
    why: 'Greek stacks participles under a single main verb, which shows that one action is the main thing and the others hang off it. English translations often break the stack into separate sentences of equal weight, and the subordination quietly disappears. Knowing this is why a reader should ask, in a long instruction, which verb is the actual command and which parts describe how it is carried out.',
    seeAlso: ['imperative', 'tense', 'literal-translation'],
  },
  {
    id: 'imperative',
    term: 'Imperative',
    match: ['imperative', 'imperatives', 'imperative mood', 'command form'],
    short: 'The verb form used for a command or a request.',
    why: 'Finding the imperatives tells a reader exactly what the text asks, and it is usually fewer things than a summary suggests. Two cautions carry most of the weight: the command is normally grounded in a statement that comes first, and English "you" hides whether a command is aimed at one person or at a group. A command given to a whole congregation is a different instruction from the same words given to an individual.',
    seeAlso: ['indicative', 'participle', 'recipient-formula', 'moralism'],
  },
  {
    id: 'indicative',
    term: 'Indicative',
    match: ['indicative', 'indicatives', 'indicative mood'],
    short: 'The verb form used for a statement of fact — what is, or what happened.',
    why: 'The pattern that runs through much of the biblical letters is statement first, command second: here is what God has done, therefore here is how to live. Cutting the command loose from the statement it depends on turns a consequence into a demand and produces moralism. When a passage feels like a bare list of duties, the fix is usually to read back until the statement it rests on appears.',
    seeAlso: ['imperative', 'moralism', 'structural-shape', 'grace'],
  },
  {
    id: 'passive-voice',
    term: 'Passive voice',
    match: ['passive voice', 'passive construction', 'in the passive'],
    short: 'A verb form where the subject receives the action instead of performing it.',
    why: 'The passive lets a writer leave the actor unnamed, and who is left unnamed is often the interpretive question. In a text about being saved, forgiven or made righteous, the passive is quietly saying that this happened to the person rather than being achieved by them. When a passage is dense with passives, ask who is doing the acting and whether the text names them anywhere nearby.',
    seeAlso: ['divine-passive', 'tense', 'justification'],
  },
  {
    id: 'divine-passive',
    term: 'Divine passive',
    match: ['divine passive'],
    short: 'A passive verb with no actor named, where the implied actor is God.',
    why: 'Reverence for the divine name made this a natural way to speak, so "they will be comforted" can carry "God will comfort them" without saying it. Where the construction is genuinely at work, the passage is more explicitly about God\'s action than it looks in English. The label is also over-applied, so the test is whether the surrounding context is already about God acting — if it is not, the passive may simply be a passive.',
    seeAlso: ['passive-voice', 'idiom'],
  },
  {
    id: 'word-study',
    term: 'Word study',
    match: ['word study', 'word studies'],
    short: 'Looking at how a particular word is used across the text to work out what it means here.',
    why: 'Done well, a word study asks how this writer uses this word in this kind of argument, and lets context choose among the possibilities. Done badly, it becomes a hunt for the most interesting meaning a word can ever bear, which is then imported regardless of the sentence. The single guard: usage in the immediate passage outranks anything a dictionary lists, because meaning is set by use.',
    seeAlso: ['semantic-range', 'root-fallacy', 'cognate', 'immediate-context'],
  },
  {
    id: 'semantic-range',
    term: 'Semantic range',
    match: ['semantic range', 'range of meaning'],
    short: 'The set of senses a word can carry in different contexts.',
    why: 'Words have ranges, not single fixed meanings — the same term can mean spirit, wind or breath, and only the sentence decides which. The common error is stacking the whole range into one occurrence so that a word means all its senses at once; no word behaves that way in any language. Pick the sense the context requires, and note the others only if the writer is deliberately playing on them.',
    seeAlso: ['word-study', 'idiom', 'root-fallacy'],
  },
  {
    id: 'cognate',
    term: 'Cognate',
    match: ['cognate', 'cognates', 'same root', 'word root', 'root word'],
    short: 'A word built from the same root as another word.',
    why: 'Shared roots show a family resemblance, and sometimes a writer uses two cognates close together to make an audible link that English hides. What a shared root does not do is guarantee shared meaning — related words drift apart, and the connection has to be shown in the usage, not assumed from the spelling. Useful when it explains a wordplay in the passage; misleading when it is used to redefine a word by its relatives.',
    seeAlso: ['root-fallacy', 'word-study', 'semantic-range'],
  },
  {
    id: 'root-fallacy',
    term: 'Root fallacy',
    match: ['root fallacy', 'etymology', 'etymological'],
    short: 'Deciding what a word means by taking apart its history or its parts instead of watching how it is used.',
    why: 'Tracing where a word came from is legitimate study; the fallacy is letting that history overrule how the word is actually used. Meaning is set by use, not by origin — a butterfly is not a fly made of butter, and a word\'s ancient parts may say nothing about what it meant to the people reading it. This is the most common way a striking but false claim about an original-language word gets into circulation. When a definition sounds too neat and too memorable, check whether it came from usage or from the parts.',
    seeAlso: ['word-study', 'cognate', 'semantic-range'],
  },
  {
    id: 'idiom',
    term: 'Idiom',
    match: ['idiom', 'idioms', 'idiomatic', 'figure of speech'],
    short: 'A phrase whose meaning is not the sum of its words.',
    why: 'Every language runs on these, and biblical idioms are as opaque to modern readers as "kick the bucket" would be to a translator working from a dictionary. Reading an idiom literally produces either nonsense or a false doctrine that sounds deep. When a phrase reads oddly literal or strangely violent, suspect an idiom and check how the same phrase is used elsewhere.',
    seeAlso: ['metaphor', 'dynamic-translation', 'semantic-range'],
  },
  {
    id: 'literal-translation',
    term: 'Literal translation',
    match: ['literal translation', 'formal equivalence', 'word-for-word', 'formal translation'],
    short: 'A translation that stays close to the original wording and sentence structure.',
    why: 'Staying close to the form preserves things a reader can use — repeated words, ambiguity the writer may have intended, the shape of an argument. The cost is that idioms come through stiff or strange, and structure that is natural in the original reads as awkward in English. No translation is purely literal, because a word-for-word rendering of any language is unreadable; every edition sits somewhere on a spectrum.',
    seeAlso: ['dynamic-translation', 'idiom', 'transliteration'],
  },
  {
    id: 'dynamic-translation',
    term: 'Dynamic translation',
    match: ['dynamic translation', 'dynamic equivalence', 'functional equivalence', 'thought-for-thought'],
    short: 'A translation that renders the meaning of a phrase rather than its individual words.',
    why: 'This produces clearer English and handles idioms well, at the cost of making an interpretive decision on the reader\'s behalf. Where a phrase is genuinely ambiguous, a dynamic rendering usually picks one option and the ambiguity disappears from view. Reading a difficult verse in two editions from different points on the spectrum will show a reader, in seconds, where the real interpretive decision is being made.',
    seeAlso: ['literal-translation', 'idiom', 'paragraph'],
  },
  {
    id: 'transliteration',
    term: 'Transliteration',
    match: ['transliteration', 'transliterated'],
    short: 'Writing a foreign word in English letters instead of translating it.',
    why: 'It lets a reader see the original word without knowing the alphabet, which is useful when a discussion turns on one term. It is also where inflated claims travel best, since a transliterated word looks technical and authoritative on the page. A transliteration is a pointer to a word, not evidence about it — the evidence is still how that word is used in context.',
    seeAlso: ['word-study', 'root-fallacy', 'septuagint'],
  },
  {
    id: 'textual-variant',
    term: 'Textual variant',
    match: ['textual variant', 'manuscript variant', 'some manuscripts', 'variant reading', 'textual footnote'],
    short: 'A place where surviving handwritten copies do not read exactly the same, usually flagged in a footnote.',
    why: 'Everything was copied by hand for centuries, so differences accumulated; the overwhelming majority are spelling and word order and cannot even be shown in translation. The small number that could change a reading are marked in the footnotes of most modern editions, including two longer passages that are commonly bracketed. The practical rule is simple: read the footnote before building anything on a verse that has one, and do not build a case on a bracketed passage.',
    seeAlso: ['amanuensis', 'literal-translation'],
  },
  {
    id: 'septuagint',
    term: 'Septuagint',
    match: ['septuagint', 'greek old testament'],
    short: 'The ancient Greek translation of the Hebrew Scriptures, widely used in the first century.',
    why: 'Many first-century readers met the older Scriptures in Greek rather than Hebrew, and New Testament writers frequently quote in that form. That is why a quotation can differ from the wording of the same verse in an English Old Testament, which is translated from Hebrew — the writer is not misquoting, he is quoting a different edition. Knowing this removes a whole category of false problems and explains many of the footnotes attached to quotations.',
    seeAlso: ['textual-variant', 'fulfillment', 'transliteration'],
  },
  {
    id: 'metaphor',
    term: 'Metaphor',
    match: ['metaphor', 'metaphors', 'metaphorical'],
    short: 'Saying one thing is another to transfer something true from the first to the second.',
    why: 'A metaphor carries a specific point of comparison, not every property of the image — calling God a rock says stability and shelter, not that God is mineral. The interpretive work is naming which feature is being carried across, and the passage almost always signals it. Pushing an image past its point of comparison generates confident nonsense.',
    seeAlso: ['idiom', 'poetry', 'typology', 'allegory'],
  },
  {
    id: 'hyperbole',
    term: 'Hyperbole',
    match: ['hyperbole', 'overstatement', 'hyperbolic'],
    short: 'Deliberate exaggeration for effect, not a claim to be measured.',
    why: 'It was a standard tool of teaching and poetry in this world, used to make a demand unforgettable rather than to set an exact quota. Read literally it produces either impossible obligations or a reader quietly deciding the text cannot mean what it says. Read as hyperbole, the force stays — the point is the seriousness of the claim, not the arithmetic.',
    seeAlso: ['proverb', 'poetry', 'idiom'],
  },
  {
    id: 'rhetorical-question',
    term: 'Rhetorical question',
    match: ['rhetorical question', 'rhetorical questions'],
    short: 'A question asked to make a point, where the writer expects a particular answer.',
    why: 'These are argument moves, not requests for information — the writer is forcing the reader to supply the conclusion themselves, which makes it harder to resist. Working out the expected answer often reveals what the writer assumed his readers already believed. In a dense argument, converting the questions into statements exposes the structure fast.',
    seeAlso: ['flow-of-thought', 'connective', 'letter-body'],
  },
  {
    id: 'antecedent',
    term: 'Antecedent',
    match: ['antecedent', 'antecedents', 'pronoun reference'],
    short: 'The noun a pronoun points back to — who "he" or "they" or "this" actually is.',
    why: 'Long sentences accumulate pronouns, and a reader who guesses wrong about one can invert a passage\'s meaning while reading every word correctly. Ambiguous pronouns are also a genuine source of disagreement in some famous verses, where the grammar allows two candidates. Naming each pronoun\'s referent out loud through a difficult paragraph is slow, cheap and unusually effective.',
    seeAlso: ['immediate-context', 'flow-of-thought', 'crux'],
  },

  /* ── covenant and theology a reader will meet ───────────────────────────── */

  {
    id: 'covenant',
    term: 'Covenant',
    match: ['covenant', 'covenants', 'covenantal'],
    short: 'A binding, sworn relationship with stated obligations, promised benefits, and consequences for breaking it.',
    why: 'It is not a contract between equals — in the biblical cases the greater party sets the terms and binds himself to them, which is why the promises are as fixed as the demands. Because covenant is the frame, a command inside one is a term of relationship rather than a free-floating rule, and a promise inside one is enforceable rather than aspirational. Ask which covenant a passage is operating inside; several are in play across the story and they do not all bind the same people the same way.',
    seeAlso: ['law', 'grace', 'redemptive-historical', 'election'],
  },
  {
    id: 'righteousness',
    term: 'Righteousness',
    match: ['righteousness', 'righteous'],
    short: 'Being in the right — both a moral quality and a standing in relation to someone else.',
    why: 'The word covers behaviour and status, and much of the disagreement in the church about certain letters is a disagreement about which sense is primary in a given passage. It also carries a relational load the English word has lost: the biblical use often means meeting the obligations of a relationship, not clearing an abstract bar. When a passage turns on this word, watch whether it is describing conduct, describing a verdict, or moving between the two.',
    seeAlso: ['justification', 'imputed', 'covenant'],
  },
  {
    id: 'imputed',
    term: 'Imputed',
    match: ['imputed', 'imputation', 'credited to'],
    short: 'Counted to somebody\'s account rather than produced by them.',
    why: 'The image is bookkeeping: something is entered on a ledger in a person\'s name. It matters because it distinguishes a standing that is granted from a quality that is grown, and passages about being counted righteous are making the first kind of claim, not the second. How exactly the mechanism works, and how far the accounting language should be pressed, is a genuine and long-standing disagreement between traditions that all use the word.',
    seeAlso: ['justification', 'righteousness', 'grace'],
  },
  {
    id: 'grace',
    term: 'Grace',
    match: ['grace', 'unmerited favor'],
    short: 'A gift given because the giver chose to give it, not because the recipient earned it.',
    why: 'In this world gifts normally created obligation and were given to people worth investing in, so a gift given without regard to worth was a genuine social shock rather than a soft sentiment. That background is what makes the word carry force instead of feeling vague. It also explains why grace and obligation sit together in these texts without contradiction: a gift that creates a bond is exactly what the culture expected — the scandal was who it was given to.',
    seeAlso: ['gospel', 'covenant', 'indicative', 'justification'],
  },
  {
    id: 'gospel',
    term: 'Gospel',
    match: ['gospel', 'good news'],
    short: 'An announcement of good news — that something has happened, not advice about what to do.',
    why: 'The word was used for public proclamations of a victory or a new ruler, so its native form is a report of an event, delivered to people who were not there. That is why the biblical announcement is stated in the past tense before any instruction follows. A reader who hears the word as "the rules of the faith" has already inverted the order the texts work in.',
    seeAlso: ['indicative', 'grace', 'gospel-genre', 'moralism'],
  },
  {
    id: 'typology',
    term: 'Typology',
    match: ['typology', 'typological', 'antitype'],
    short: 'A real person, event or institution that patterns something later in the story.',
    why: 'Typology depends on the earlier thing being genuinely real and genuinely meaningful in its own time — it is a correspondence across a story, not a code hidden under the surface. The control is whether the pattern is drawn by the text itself rather than by the reader\'s ingenuity. Without that control it slides into allegory, where any detail can be made to stand for anything.',
    seeAlso: ['allegory', 'fulfillment', 'canonical-context', 'redemptive-historical'],
  },
  {
    id: 'fulfillment',
    term: 'Fulfillment',
    match: ['fulfillment', 'fulfilled', 'fulfil', 'fulfills'],
    short: 'A promise, pattern or purpose reaching its intended completion.',
    why: 'The biblical use is broader than "a prediction came true" — it also covers a pattern reaching its full form and a purpose arriving at its goal. This is why a text quoted as fulfilled sometimes was not a prediction at all in its original setting, which looks like misuse until the wider sense is understood. Check what kind of fulfilment is being claimed before deciding whether the original passage supports it.',
    seeAlso: ['typology', 'prophecy', 'canonical-context', 'septuagint'],
  },
  {
    id: 'redemptive-historical',
    term: 'Redemptive-historical',
    match: ['redemptive-historical', 'redemptive history', 'salvation history'],
    short: 'Reading a passage by where it stands in the unfolding story of what God is doing.',
    why: 'It treats the Bible as one developing account rather than a flat collection of quotations, so a text\'s position in the sequence is part of its meaning. The gain is that promises, patterns and institutions are read as steps that go somewhere. The risk is skipping over what a passage meant in its own moment on the way to the destination, which quietly turns every text into the same text.',
    seeAlso: ['canonical-context', 'typology', 'covenant', 'authorial-intent'],
  },
  {
    id: 'justification',
    term: 'Justification',
    match: ['justification', 'justified', 'declared righteous'],
    short: 'Being declared in the right before God, as a verdict rather than a description of progress.',
    why: 'The image is a courtroom: a verdict is announced about a person\'s standing, which is a different kind of statement from a report on their character. Holding that distinction keeps a reader from collapsing a passage about status into a passage about improvement. What the verdict is grounded in, and how it relates to the change that follows, is one of the deepest disagreements between Christian traditions, and honest readers should know they are standing inside it.',
    seeAlso: ['righteousness', 'imputed', 'grace', 'theological-triage'],
  },
  {
    id: 'kingdom-of-god',
    term: 'Kingdom of God',
    match: ['kingdom of god', 'kingdom of heaven', 'the kingdom'],
    short: 'God\'s reign — his rule being exercised — more than a place with borders.',
    why: 'Hearing it as a location produces confusion about how it can be near, among people, and still coming. Hearing it as reign makes those statements coherent: the rule has broken in and is not yet everywhere in force. The two common phrasings for it are used interchangeably by different writers reporting the same sayings; one strand of teaching treats them as two separate things, so a reader should know the difference is claimed rather than obvious.',
    seeAlso: ['already-not-yet', 'gospel', 'covenant'],
  },
  {
    id: 'already-not-yet',
    term: 'Already and not yet',
    match: ['already and not yet', 'already but not yet', 'inaugurated'],
    short: 'The pattern where something has genuinely begun but is not yet complete.',
    why: 'It explains texts that would otherwise look contradictory — a victory announced as won while the fighting continues, a people called holy while being told to change. Without the pattern, a reader has to soften one half of the tension, and both halves are usually load-bearing. With it, the demands make sense as living up to a status already given rather than earning one not yet granted.',
    seeAlso: ['kingdom-of-god', 'indicative', 'holiness', 'apocalyptic'],
  },
  {
    id: 'flesh',
    term: 'The flesh',
    match: ['the flesh'],
    short: 'In some letters, not the body but the self as it operates in rebellion and weakness.',
    why: 'Read as "the physical body," the term turns a text into a case against the body itself, which is not what these letters argue — the body is not the enemy in them. Read as the self turned in on itself, the same passages hold together and the contrast is with life directed by God\'s Spirit. Translations vary on how to render it, which is itself a signal that a reader should slow down where the word appears.',
    seeAlso: ['holiness', 'dynamic-translation', 'semantic-range'],
  },
  {
    id: 'holiness',
    term: 'Holiness',
    match: ['holiness', 'set apart', 'sanctification'],
    short: 'Being set apart as belonging to God, and the process of becoming what that status implies.',
    why: 'The root idea is separateness and belonging rather than niceness, which is why objects and places can be called holy without any moral quality. Once that is clear, the moral demands read as living out an assigned identity instead of qualifying for one. It also explains why these texts can address people as already set apart and immediately tell them to change.',
    seeAlso: ['saints', 'already-not-yet', 'indicative'],
  },
  {
    id: 'saints',
    term: 'Saints',
    match: ['saints'],
    short: 'The ordinary word for all of God\'s set-apart people, not a title for an elite few.',
    why: 'Letters routinely open by addressing whole congregations this way, including congregations the writer is about to correct sharply. Reading it as a term for exceptional individuals makes a general address sound like a narrow one and misidentifies who is being spoken to. It also sets up the standard move in these letters: you are called this, now live like it.',
    seeAlso: ['holiness', 'recipient-formula', 'indicative'],
  },
  {
    id: 'apostle',
    term: 'Apostle',
    match: ['apostle', 'apostles', 'apostolic', 'sent one'],
    short: 'A commissioned envoy — someone sent with the authority of the one who sent him.',
    why: 'The weight is in the sending: an envoy speaks for the sender, so a claim to this title is a claim about whose authority stands behind the letter. That is why the word so often appears in a letter\'s first line, before the writer says anything a reader might resist. The term is used both for a specific commissioned group and more loosely for messengers sent by congregations, so context decides which sense is in play.',
    seeAlso: ['sender-formula', 'greeting', 'servant-slave'],
  },
  {
    id: 'servant-slave',
    term: 'Servant / bondservant',
    match: ['bondservant', 'doulos', 'servant', 'slave'],
    short: 'A word for someone owned by, or wholly bound to, another person.',
    why: 'English editions split between "servant" and "slave" for the same term, and the choice changes the temperature of a verse considerably — one sounds like employment, the other like ownership. When a writer opens a letter by calling himself this, he is stating who owns him, which is a status claim, not a modest gesture. Whether "slave" is the right rendering in every case is genuinely argued, so a reader meeting one word should know the other is behind it. The word also names actual enslaved people in these households, some of whom are addressed directly, so not every occurrence is a figure of speech.',
    seeAlso: ['apostle', 'sender-formula', 'dynamic-translation'],
  },
  {
    id: 'election',
    term: 'Election',
    /* 'chosen' dropped. It was the highest-volume single form in the file —
       96 occurrences in the stored corpus — and almost all of them are the
       plain past participle ("Smyrna was chosen", "the symbols are chosen",
       "Saul is chosen by the people"). 'chosen in him' and 'God's chosen'
       carry the doctrine and are kept as phrases. */
    match: [
      'election', 'elect', 'predestined', 'predestination',
      'chosen in him', 'chosen people', 'chosen ones',
    ],
    short: 'God\'s choosing — of a people, and in some texts of individuals.',
    why: 'The language is everywhere in these texts and its relationship to human response is one of the oldest disagreements in the church, held by traditions that all read the same passages carefully. Much of the heat comes from a prior question a reader can actually check: whether a given passage is speaking about a group being chosen for a purpose or an individual being chosen for salvation. Establish which the text is doing before importing a system, and be honest when a passage does not settle it.',
    seeAlso: ['covenant', 'theological-triage', 'crux'],
  },
  {
    id: 'atonement',
    term: 'Atonement',
    match: ['atonement', 'atoning', 'propitiation', 'expiation'],
    short: 'The dealing-with of sin that restores a broken relationship with God.',
    why: 'The biblical texts describe it with several images at once — sacrifice, ransom, covering, victory, a debt settled — and each image answers a different question about what was wrong. Reducing them all to one image loses the parts of the problem the other images were addressing. Two of the technical terms used here differ over whether the emphasis falls on wrath being turned aside or on sin being removed, which is a real dispute a reader should know exists rather than assume settled.',
    seeAlso: ['covenant', 'righteousness', 'gospel', 'theological-triage'],
  },
  {
    id: 'faith',
    term: 'Faith',
    match: ['faith', 'faithfulness'],
    short: 'Trust and loyalty toward a person, not merely agreement that something is true.',
    why: 'The same word group covers belief, trust and faithfulness, so an English reader can hear "intellectual agreement" where the text means "reliance and allegiance." That shift changes what a text is asking for. In a few well-known verses the grammar leaves it genuinely open whether the phrase means faith in Christ or the faithfulness of Christ, and editions differ — a footnote at that point is worth reading.',
    seeAlso: ['justification', 'grace', 'semantic-range'],
  },
  {
    id: 'repentance',
    term: 'Repentance',
    match: ['repentance', 'repent', 'metanoia'],
    short: 'A change of mind that turns into a change of direction.',
    why: 'The Greek term emphasises a changed mind and the Hebrew background emphasises turning around and going back; both are in play and neither reduces to feeling sorry. Read as an emotion, the word measures the wrong thing entirely. Read as a turn, the biblical demands make sense — the texts consistently look for the direction of a life to change, and they say so in terms a reader can check.',
    seeAlso: ['gospel', 'application', 'moralism'],
  },

  /* ── the reading disciplines ────────────────────────────────────────────── */

  {
    id: 'authorial-intent',
    term: 'Authorial intent',
    match: ['authorial intent', "author's intent", 'intended meaning'],
    short: 'What the writer was actually communicating to the people he was writing to.',
    why: 'This is the anchor that makes a reading checkable by somebody else. Without it, a text means whatever it evokes in the person reading, and there is no way to be wrong — which also means there is no way to be corrected. The claim is not that a reader can read a mind; it is that the words, the situation and the argument are evidence, and a reading has to answer to them.',
    seeAlso: ['original-audience', 'exegesis', 'eisegesis', 'application'],
  },
  {
    id: 'original-audience',
    term: 'Original audience',
    match: ['original audience', 'first readers', 'first hearers', 'original readers'],
    short: 'The actual people the text was written to, in their actual situation.',
    why: 'Nothing in these texts was addressed to a modern reader first, and asking what it demanded of the people who received it is the first honest question. It also protects against a common error: assuming a text speaks directly to a modern circumstance it never had in view. The gap between what it asked of them and what it asks now is where the real work of application happens, and skipping the first half hides the work.',
    seeAlso: ['application', 'historical-background', 'occasional-letter', 'recipient-formula'],
  },
  {
    id: 'application',
    term: 'Application',
    match: ['application', 'applying the text'],
    short: 'Moving from what a passage asked of its first readers to what it asks of a reader now.',
    why: 'Application only holds if it runs through the passage\'s own logic rather than around it — the same claim, the same demand, in a different setting. The two standard failures are steering every text toward a favourite destination it never mentions, and reducing every text to a duty when it was forming a person rather than issuing an order. A good application is specific enough that a reader could tell, a week later, whether they actually did it.',
    seeAlso: ['original-audience', 'moralism', 'restraint', 'descriptive-prescriptive'],
  },
  {
    id: 'exegesis',
    term: 'Exegesis',
    match: ['exegesis', 'exegetical'],
    short: 'Drawing the meaning out of a text from the text\'s own evidence.',
    why: 'The discipline is a direction of travel: evidence first, conclusion second. In practice it means a reader should be able to point at the words, the structure and the situation that produced their reading, and should be willing to abandon it when the evidence does not hold. Any reading that cannot be traced back to something another reader can check has stopped being exegesis.',
    seeAlso: ['eisegesis', 'authorial-intent', 'observation'],
  },
  {
    id: 'eisegesis',
    term: 'Eisegesis',
    match: ['eisegesis', 'reading into the text'],
    short: 'Reading a meaning into a text that was not there.',
    why: 'It is rarely dishonest and almost never obvious from the inside — it usually happens when a reader already knows what a passage should say and finds it. The tell is a reading that stays fixed while the evidence changes, or one that could be attached to any passage equally well. The cure is mechanical: state what in the text produced the reading, and check whether that thing is actually there.',
    seeAlso: ['exegesis', 'proof-texting', 'authorial-intent'],
  },
  {
    id: 'restraint',
    term: 'Restraint',
    /* NOT bare 'restraint'. All 9 occurrences in the stored corpus were the
       ordinary noun — "pastoral restraint", "without restraint", "God
       withdrawing restraint" — and none were the reading discipline. */
    match: ['interpretive restraint', 'exegetical restraint', 'guardrail', 'guardrails'],
    short: 'Stopping where the text stops, instead of extending it to the conclusion you want.',
    why: 'Most damage done with a Bible is done a step past what the passage actually said, by a reader who was right for three moves and kept going. Restraint is naming the point where the evidence runs out and refusing to spend authority beyond it. It is also the difference between saying "the text does not address this" and inventing an answer, and the first is a legitimate result.',
    seeAlso: ['proof-texting', 'crux', 'application', 'theological-triage'],
  },
  {
    id: 'proof-texting',
    term: 'Proof-texting',
    match: ['proof-texting', 'prooftexting', 'proof text', 'proof-text', 'proof texts'],
    short: 'Quoting a verse out of its argument to support a claim it was not making.',
    why: 'It works because the quotation is accurate word for word, which makes the error nearly invisible to anyone who does not go back and read around it. It is also how genuinely bad ideas acquire biblical clothing. The check takes a minute: read the ten verses on either side and ask whether the writer would recognise the use his sentence has been put to.',
    seeAlso: ['context', 'immediate-context', 'flow-of-thought', 'eisegesis'],
  },
  {
    id: 'theological-triage',
    term: 'Theological triage',
    match: ['theological triage', 'triage', 'first-order', 'tertiary'],
    short: 'Sorting convictions by weight — what defines the faith, what divides congregations, and what believers hold differently while staying together.',
    why: 'It exists so that disagreements get handled at their actual size instead of every difference becoming a division or every difference becoming trivial. The honest part is that the ranking is itself a judgement made from somewhere — there is no neutral vantage point from which a question is simply third-order. So a ranking should come with the reason for it and with an account of who holds the other view and how they read the same texts.',
    seeAlso: ['restraint', 'election', 'justification', 'crux'],
  },
  {
    id: 'hermeneutics',
    term: 'Hermeneutics',
    match: ['hermeneutics', 'hermeneutical', 'interpretive method'],
    short: 'The method a reader uses to get from words on a page to meaning.',
    why: 'Everyone has one whether or not they can state it, and an unexamined method is what allows a reader to be confident and wrong at the same time. Making the rules explicit lets them be tested on passages where the answer is not in doubt. A method that produces obvious nonsense on a clear text is not a method to trust on a hard one.',
    seeAlso: ['exegesis', 'authorial-intent', 'scripture-interprets-scripture'],
  },
  {
    id: 'descriptive-prescriptive',
    term: 'Descriptive vs prescriptive',
    match: ['descriptive', 'prescriptive'],
    short: 'The difference between a text reporting what happened and a text commanding what should be done.',
    why: 'Narrative reports a great deal it does not endorse, so "it happened in the Bible" is not by itself an argument that it should happen now. The question is whether the text signals approval — by outcome, by comment, or by a command elsewhere that matches. Getting this backwards is how a single episode becomes a rule, or how a real command gets downgraded to an ancient anecdote.',
    seeAlso: ['narrative', 'application', 'imperative'],
  },
  {
    id: 'cross-reference',
    term: 'Cross-reference',
    match: ['cross-reference', 'cross reference', 'cross-references', 'parallel passage'],
    short: 'Another passage linked to this one by shared wording, theme or subject.',
    why: 'Good cross-references show how a word or idea works elsewhere and can settle a question the immediate passage leaves open. But a reference list is a research tool assembled by editors, not an argument, and a chain of verses with a shared English word can connect passages that are not related in the original. Follow them and read each one in its own context before letting it speak to this one.',
    seeAlso: ['canonical-context', 'word-study', 'proof-texting'],
  },
  {
    id: 'historical-background',
    term: 'Historical background',
    match: ['historical background', 'cultural background', 'background detail'],
    short: 'What the first readers knew about their world that a modern reader does not.',
    why: 'A single detail — a custom, a coin, a road, a title — can turn an opaque line into an obvious one, which is why background is worth having. It is also the easiest place for a confident invention to slip through, because a reader has no way to check a claim about a first-century practice while reading. Weight a background claim by whether the passage still works without it, and treat any reading that depends entirely on one unverifiable detail as provisional.',
    seeAlso: ['original-audience', 'occasional-letter', 'crux'],
  },
  {
    id: 'scripture-interprets-scripture',
    term: 'Scripture interprets Scripture',
    match: ['scripture interprets scripture', 'analogy of faith', 'clearer passages'],
    short: 'Letting clear passages govern the reading of obscure ones.',
    why: 'It is a sound principle against building a position on one hard verse, since a claim resting entirely on the least clear text available is a weak claim. The failure mode is using it to silence a passage that genuinely says something uncomfortable, by declaring it unclear and importing the answer from a favourite text. Use it to constrain speculation, not to flatten a passage into what a reader already held.',
    seeAlso: ['canonical-context', 'hermeneutics', 'crux', 'restraint'],
  },
  {
    id: 'observation',
    term: 'Observation',
    match: ['observation', 'close reading'],
    short: 'Seeing what is actually on the page before deciding what it means.',
    why: 'Most interpretive disagreement dissolves under slower looking — the repeated word, the connective, the shift in who is speaking, the thing the text never says. It is unglamorous and it is where the leverage is, because it produces evidence a reader can hand to somebody else. The rule of thumb: nothing gets interpreted until it has been described.',
    seeAlso: ['exegesis', 'repetition', 'connective', 'unit'],
  },
  {
    id: 'moralism',
    term: 'Moralism',
    match: ['moralism', 'moralistic'],
    short: 'Reducing a passage to a list of behaviours, when the text was doing something larger.',
    why: 'It happens by cutting the commands loose from the statements they depend on, so that a consequence of what God has done becomes a standalone demand. The result is a reading that is technically about the right verses and produces effort in place of trust. The check is whether the reading still needs the first half of the passage; if the commands work fine without it, something has been dropped.',
    seeAlso: ['indicative', 'gospel', 'application', 'grace'],
  },
  {
    id: 'allegory',
    term: 'Allegory',
    match: ['allegory', 'allegorical', 'allegorizing'],
    short: 'Treating the details of a text as symbols standing for something else entirely.',
    why: 'Some texts are written as allegory and announce it; the problem is applying the method to texts that are not. Once every detail can stand for something, the reading is limited only by the reader\'s imagination and no interpretation can be shown to be wrong. The difference from typology is control: a type is a correspondence the wider text itself draws, while an allegorical reading supplies the correspondences from outside.',
    seeAlso: ['typology', 'parable', 'metaphor', 'eisegesis'],
  },
  {
    id: 'crux',
    term: 'Crux',
    match: ['crux', 'interpretive crux'],
    short: 'A point in a text that genuinely resists resolution.',
    why: 'Some difficulties are real: the grammar allows two readings, the referent is ambiguous, or the background needed to decide is not available. Naming one as unresolved is a result, not a failure, and it tells a reader exactly where confidence should drop. The dishonest move is smoothing it over — a reader handed a confident answer at a genuine crux has no way to know they were handed a guess.',
    seeAlso: ['restraint', 'antecedent', 'textual-variant', 'theological-triage'],
  },
]

/* ────────────────────────────────────────────────────────────────────────── *
 * MATCHING
 *
 * The index is built once at module load. Lookup is a phrase-table walk over
 * word tokens — no per-term regexes, so cost is linear in the number of words
 * and independent of the number of entries.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Words are letters plus internal apostrophes and hyphens, so "proof-texting"
 * and "author's" each arrive as ONE token. Digits are excluded on purpose: a
 * verse number is not a word, and letting it into a token would let "1 Peter"
 * behave differently from "Peter".
 */
const TOKEN_RE = /[A-Za-z][A-Za-z'’-]*/g

/** Lowercases, straightens curly apostrophes, drops a possessive and a trailing hyphen. */
function normalizeToken(raw: string): string {
  let t = raw.toLowerCase().replace(/[‘’]/g, "'")
  t = t.replace(/-+$/, '').replace(/'+$/, '')
  if (t.endsWith("'s")) t = t.slice(0, -2)
  return t
}

/** Normalizes a whole match phrase to the form the token walk will produce. */
function normalizePhrase(raw: string): string {
  const parts = raw.match(TOKEN_RE)
  if (!parts) return ''
  return parts.map(normalizeToken).join(' ')
}

const PHRASE_INDEX = new Map<string, GlossEntry>()
const FIRST_WORDS = new Set<string>()
const BY_ID = new Map<string, GlossEntry>()
let MAX_PHRASE_WORDS = 1

for (const entry of GLOSSARY) {
  if (!BY_ID.has(entry.id)) BY_ID.set(entry.id, entry)
  for (const surface of entry.match) {
    const key = normalizePhrase(surface)
    if (!key) continue
    // First declaration wins. Duplicates are a data bug the smoke test catches;
    // throwing here would take the whole app down over a glossary typo.
    if (!PHRASE_INDEX.has(key)) PHRASE_INDEX.set(key, entry)
    const words = key.split(' ')
    if (words.length > MAX_PHRASE_WORDS) MAX_PHRASE_WORDS = words.length
    FIRST_WORDS.add(words[0])
  }
}

export interface GlossMatch {
  /** Character offset of the first character of the match in the input text. */
  start: number
  /** Character offset one past the last character of the match. */
  end: number
  entry: GlossEntry
}

/**
 * Finds glossary terms in a block of prose.
 *
 * Longest match first, case-insensitive, whole words only. Matches never
 * overlap — once a phrase is taken, the walk resumes after it — and the result
 * is in document order.
 *
 * A multi-word phrase is only matched when nothing but whitespace separates its
 * words, so "the word. Study it" can never become "word study".
 */
export function findGlossTerms(text: string): GlossMatch[] {
  const out: GlossMatch[] = []
  if (!text) return out

  // Single pass: collect token offsets and normalized forms.
  const starts: number[] = []
  const ends: number[] = []
  const words: string[] = []
  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const norm = normalizeToken(m[0])
    if (!norm) continue
    /* TOKEN_RE swallows a trailing apostrophe or hyphen so that "author's" and
       "proof-texting" stay one token. A CLOSING quote is not part of the word,
       though: prose like "the same root sits under 'poem' and 'poet'" was
       reporting the match as `poem'` and underlining the quote mark. Back the
       reported end off over any trailing punctuation. Doing it here also
       tightens the phrase walk below — a quote mark now sits in the gap
       between tokens, so a phrase can no longer run across it. */
    let end = m.index + m[0].length
    while (end > m.index && /['’-]/.test(text[end - 1])) end -= 1
    starts.push(m.index)
    ends.push(end)
    words.push(norm)
  }
  const n = words.length
  if (n === 0) return out

  /**
   * joinable[i] is true when tokens i and i+1 are separated by whitespace only.
   * Punctuation between them blocks a phrase from spanning the gap.
   */
  const joinable: boolean[] = new Array(n - 1)
  for (let i = 0; i < n - 1; i++) {
    const gap = text.slice(ends[i], starts[i + 1])
    joinable[i] = gap.length === 0 || !/\S/.test(gap)
  }

  let i = 0
  while (i < n) {
    if (!FIRST_WORDS.has(words[i])) { i++; continue }

    // How far a phrase may run from here: token supply, phrase ceiling, and the
    // first punctuation break.
    let span = 1
    while (
      span < MAX_PHRASE_WORDS &&
      i + span < n &&
      joinable[i + span - 1]
    ) span++

    // Build candidate keys ascending (cheap, reuses the previous string), then
    // check them descending so the longest phrase wins.
    const keys: string[] = new Array(span)
    let acc = words[i]
    keys[0] = acc
    for (let k = 1; k < span; k++) {
      acc = acc + ' ' + words[i + k]
      keys[k] = acc
    }

    let taken = 0
    for (let len = span; len >= 1; len--) {
      const entry = PHRASE_INDEX.get(keys[len - 1])
      if (entry) {
        out.push({ start: starts[i], end: ends[i + len - 1], entry })
        taken = len
        break
      }
    }

    i += taken > 0 ? taken : 1
  }

  return out
}

/** Looks up an entry by id. Returns null rather than throwing on a bad id. */
export function getGloss(id: string): GlossEntry | null {
  return BY_ID.get(id) ?? null
}
