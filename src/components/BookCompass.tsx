import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Book {
  name: string
  abbr: string
  genre: string
  author: string
  date: string
  chapters: number
  audience: string
  occasion: string
  purpose: string
  bigIdea: string
  overview: string
  keyVerse: string
  themes: [string, string, string]
  preachingAdvice: string
}

// ── Book Data ─────────────────────────────────────────────────────────────────

const OT_BOOKS: Book[] = [
  { name: 'Genesis', abbr: 'Gen', genre: 'Narrative', author: 'Moses', date: 'c. 1445–1400 BC', chapters: 50,
    audience: 'Israel preparing to enter Canaan after 40 years in the wilderness.',
    occasion: 'Israel needed to understand their identity, God\'s ownership of the land, and the promise that sustained them.',
    purpose: 'To establish the theological foundations of the faith: creation, fall, redemption\'s beginning, and covenant promise.',
    bigIdea: 'God creates, humanity falls, and initiates the covenant promise that will redeem all nations through Abraham\'s seed.',
    overview: 'Genesis divides naturally into primeval history (chs. 1–11) and patriarchal history (chs. 12–50). The first section covers creation, the fall, Cain and Abel, the flood, and Babel — establishing the universal problem of sin. The second tracks God\'s solution through Abraham, Isaac, Jacob, and Joseph, with the Abrahamic covenant (ch. 12, 15, 17) as its theological spine. Joseph\'s story closes the book with God\'s providence overruling human evil to preserve the covenant family in Egypt.',
    keyVerse: 'Gen 12:3 — "In you all the families of the earth shall be blessed."',
    themes: ['Creation & fall', 'Covenant promise', 'Election & calling'],
    preachingAdvice: 'Resist treating Genesis as a science text — its first concern is theology. Preach the primeval narratives as addressing the universal human condition, not just ancient history. The patriarchal narratives reward close attention to narrative art: repetition, irony, and type-scenes (well meetings, barren wives) are intentional. Always trace how each passage advances the covenant promise toward Christ. Genesis 3, 12, and 15 are load-bearing chapters for the whole canon.' },
  { name: 'Exodus', abbr: 'Exod', genre: 'Narrative', author: 'Moses', date: 'c. 1445–1400 BC', chapters: 40,
    audience: 'The newly redeemed nation of Israel in the wilderness.',
    occasion: 'God\'s people needed identity, law, and a worship system after liberation from Egypt.',
    purpose: 'To show how God redeems, covenants with, and dwells among his people through a mediator.',
    bigIdea: 'God rescues his enslaved people through a mediator to make them his covenant nation and dwell among them.',
    overview: 'Exodus moves from slavery (chs. 1–12) through redemption at the sea (chs. 13–18) to covenant at Sinai (chs. 19–24) and tabernacle instructions and construction (chs. 25–40). The Passover is the book\'s pivot — everything before is oppression, everything after is the shape of a redeemed community. The tabernacle section (nearly half the book) shows that God\'s goal in redemption is to dwell with his people.',
    keyVerse: 'Exod 19:5 — "You shall be my treasured possession among all peoples."',
    themes: ['Redemption from slavery', 'Covenant at Sinai', 'God\'s presence'],
    preachingAdvice: 'The Exodus is the OT\'s defining redemptive event — every prophet, psalm, and NT writer echoes it. Read each passage asking: what does this reveal about the God who redeems? The plagues are theological (each targets an Egyptian deity). The law is covenant stipulation, not a merit system. The tabernacle is a theology of access — preach it with Hebrews nearby. Moses as mediator anticipates Christ throughout.' },
  { name: 'Leviticus', abbr: 'Lev', genre: 'Law', author: 'Moses', date: 'c. 1445–1400 BC', chapters: 27,
    audience: 'Israel at Sinai, just having received the tabernacle and needing to know how to approach a holy God.',
    occasion: 'With God now dwelling among them, Israel required detailed instruction on maintaining covenant access.',
    purpose: 'To teach Israel the sacrificial and purity system that sustains life with a holy God in their midst.',
    bigIdea: 'God instructs his holy people in the sacrificial system that provides atonement and sustained access to his presence.',
    overview: 'Leviticus falls into three movements: the sacrifice system (chs. 1–7), the ordination of priests and the catastrophic death of Nadab and Abihu (chs. 8–10), and the holiness code (chs. 11–27). The Day of Atonement (ch. 16) is the theological center. The refrain "be holy for I am holy" (19:2) governs the whole. The book answers: how does a sinful people survive the presence of a consuming-fire God?',
    keyVerse: 'Lev 19:2 — "You shall be holy, for I the Lord your God am holy."',
    themes: ['Holiness', 'Atonement & sacrifice', 'Priestly access'],
    preachingAdvice: 'Preach Leviticus with Hebrews as your commentary — the NT author does the heavy lifting on how Christ fulfills the sacrificial system. Don\'t moralize the food laws; instead show their function: maintaining Israel\'s distinctiveness as a holy people. The Day of Atonement (ch. 16) is one of the richest Christ-texts in the OT. Leviticus 19\'s holiness code is surprisingly practical and social — justice to the poor, honesty in business, love for neighbor.' },
  { name: 'Numbers', abbr: 'Num', genre: 'Narrative', author: 'Moses', date: 'c. 1445–1400 BC', chapters: 36,
    audience: 'Israel in the wilderness — both the faithless generation (who died) and the new generation (who inherited).',
    occasion: 'Israel\'s repeated failure and God\'s sustained faithfulness across 40 years of wandering.',
    purpose: 'To demonstrate that unbelief forfeits blessing but cannot ultimately cancel God\'s covenant purposes.',
    bigIdea: 'Israel\'s unbelief delays the promised land, but God\'s faithfulness carries a new generation to its threshold.',
    overview: 'Numbers covers the census and preparation (chs. 1–10), the wilderness journey and its failures (chs. 11–25), and renewed preparation for conquest (chs. 26–36). The devastating pivot is the spy narrative (chs. 13–14), where Israel\'s refusal to trust God costs them an entire generation. The Balaam oracles (chs. 22–24) show God blessing Israel despite themselves. Paul cites Numbers as a warning to the Corinthians (1 Cor 10).',
    keyVerse: 'Num 14:8 — "If the Lord delights in us, he will bring us into this land."',
    themes: ['Wilderness wandering', 'Judgment & grace', 'God\'s faithfulness'],
    preachingAdvice: 'Numbers is about the gap between redemption and inheritance — a gap filled with grumbling, failure, and grace. Preach it as a mirror: how does a church drift from what God has done toward nostalgia for Egypt? The bronze serpent (ch. 21, cited in John 3), Balaam\'s donkey, and the water-from-rock narratives repay careful exposition. 1 Corinthians 10 and Hebrews 3–4 are essential NT cross-references.' },
  { name: 'Deuteronomy', abbr: 'Deut', genre: 'Law', author: 'Moses', date: 'c. 1406 BC', chapters: 34,
    audience: 'The new generation of Israel on the plains of Moab, about to enter the promised land without Moses.',
    occasion: 'Moses\' final sermons before his death, renewing the Sinai covenant with the second generation.',
    purpose: 'To call Israel to wholehearted covenant love as the condition for life and blessing in the land.',
    bigIdea: 'Moses calls the new generation to covenant loyalty as the condition for life and blessing in the promised land.',
    overview: 'Deuteronomy is structured as a suzerainty treaty: preamble (1:1–5), historical prologue (1:6–4:43), stipulations (4:44–26:19), sanctions/blessings and curses (27–30), and succession arrangements (31–34). It is Moses\' three farewell sermons. The Shema (6:4–5) is its theological heart. Chapters 27–30 warn of exile but promise restoration. The book is massively cited in the NT, particularly by Jesus in his wilderness temptations.',
    keyVerse: 'Deut 6:5 — "You shall love the Lord your God with all your heart and with all your soul and with all your might."',
    themes: ['Covenant renewal', 'Obedience & blessing', 'Love for God'],
    preachingAdvice: 'Deuteronomy is the most quoted OT book in the NT and Jesus\' primary weapon against Satan. Preach it as a love document, not a legal code — the repeated appeal is to the heart. The blessings and curses (chs. 27–30) are not abstract — they map directly onto Israel\'s history and are fulfilled in the exile and restoration. Moses as a type of Christ reaches its apex here: the prophet greater than Moses is coming (18:15). Preach each law in light of "why did God give this to a people he loves?"' },
  { name: 'Joshua', abbr: 'Josh', genre: 'Historical Narrative', author: 'Joshua', date: 'c. 1400–1370 BC', chapters: 24,
    audience: 'Israel entering Canaan after 40 years of wilderness wandering.',
    occasion: 'The generation raised in the wilderness needed to trust God for conquest after Moses\' death.',
    purpose: 'To record God\'s faithfulness in giving the land he promised, and to call Israel to covenant fidelity in it.',
    bigIdea: 'God faithfully gives Israel the promised land through holy war, fulfilling every word he swore to Abraham.',
    overview: 'Joshua divides into entry and conquest (chs. 1–12), distribution of the land (chs. 13–21), and covenant renewal and farewell (chs. 22–24). Rahab and Achan form a moral contrast: the outsider who believes is saved; the insider who covets is destroyed. The conquest is theological — God fighting for Israel — not a model for geopolitical violence. The book ends with every promise fulfilled (21:45).',
    keyVerse: 'Josh 21:45 — "Not one word of all the good promises that the Lord had made to the house of Israel had failed."',
    themes: ['Conquest & inheritance', 'God\'s faithfulness', 'Covenant obedience'],
    preachingAdvice: 'The conquest narratives are difficult; acknowledge their historical-theological particularity (holy war against specific Canaanite nations at a specific moment) before applying them. The real hero is God, not Israel\'s military prowess. Rahab (a model of faith, cited in Heb 11) and Achan (a model of covenant breaking) are the book\'s two great character studies. Joshua 1 and 24 are the best entry points for preaching the whole-book message.' },
  { name: 'Judges', abbr: 'Judg', genre: 'Historical Narrative', author: 'Unknown', date: 'c. 1050–1000 BC', chapters: 21,
    audience: 'Israel reflecting on the dark period between the conquest and the monarchy.',
    occasion: 'Compiled during the monarchy to explain how Israel fell so far so fast after Joshua.',
    purpose: 'To expose the chaos produced by covenant unfaithfulness and to create longing for a righteous king.',
    bigIdea: 'Israel\'s repeated cycle of apostasy, oppression, and rescue reveals the desperate need for a righteous king.',
    overview: 'Judges is structured around a repeating cycle: Israel sins, God sends oppression, Israel cries out, God raises a judge, Israel rests, and then repeats. The judges descend in moral quality — from Othniel (exemplary) to Samson (deeply compromised). The final two appendices (chs. 17–21) are placed chronologically earlier but literarily last as the nadir: no king, everyone doing what is right in their own eyes.',
    keyVerse: 'Judg 21:25 — "In those days there was no king in Israel. Everyone did what was right in his own eyes."',
    themes: ['Cycle of sin', 'Need for kingship', 'God\'s patient mercy'],
    preachingAdvice: 'Resist moralizing the judges as heroes — the book deliberately shows their failures to indict the entire period. Gideon starts strong and ends as an idolater; Samson is a walking disaster who still gets in Hebrews 11. The book\'s message is that even the best human deliverers are insufficient — only a divine King will do. Preach the cycle as diagnostic for any community that loses its center.' },
  { name: 'Ruth', abbr: 'Ruth', genre: 'Historical Narrative', author: 'Unknown', date: 'c. 1000 BC', chapters: 4,
    audience: 'Israel during the time of the judges, set against the darkness of that period as a counter-narrative.',
    occasion: 'A short story of faithfulness embedded in an era of faithlessness, pointing toward the Davidic line.',
    purpose: 'To demonstrate God\'s hesed (loyal love) working through ordinary faithful people, culminating in David\'s lineage.',
    bigIdea: 'God\'s faithful covenant love (hesed) sovereignly provides redemption through a Gentile and a kinsman-redeemer.',
    overview: 'Ruth is a four-act literary masterpiece. Naomi loses everything in Moab and returns bitter to Bethlehem (ch. 1). Ruth gleans in Boaz\'s field and finds favor (ch. 2). Naomi orchestrates the threshing floor encounter (ch. 3). Boaz redeems Ruth at the city gate (ch. 4), and the genealogy closes with David\'s name — the whole story is part of how God prepared his king. The word hesed (loyal love) is the book\'s controlling concept.',
    keyVerse: 'Ruth 1:16 — "Your people shall be my people, and your God my God."',
    themes: ['Hesed / loyal love', 'Kinsman-redeemer', 'Providence'],
    preachingAdvice: 'Ruth rewards attention to literary craft — it is one of the most beautifully constructed narratives in Scripture. Preach the hesed of Ruth, Boaz, and ultimately God as concentric rings of loyal love. Boaz as kinsman-redeemer is a rich christological type. Don\'t miss that a Moabite woman is in the Davidic — and therefore Messianic — genealogy: the gospel\'s reach was never only for Israel.' },
  { name: '1 Samuel', abbr: '1 Sam', genre: 'Historical Narrative', author: 'Unknown', date: 'c. 930–722 BC', chapters: 31,
    audience: 'Israel during the transition from theocracy through judges to monarchy.',
    occasion: 'The people demanded a king; God gave them what they wanted and what they needed — but not in that order.',
    purpose: 'To show God\'s sovereign hand establishing kingship while exposing the difference between outward and inward fitness for leadership.',
    bigIdea: 'God transitions Israel from judges to monarchy, choosing a man after his own heart to replace a failed king.',
    overview: '1 Samuel moves through Samuel\'s birth and ministry (chs. 1–7), Saul\'s rise and failure (chs. 8–15), and David\'s rise as Saul falls (chs. 16–31). The contrast between Saul and David is the book\'s engine: Saul has the right appearance but the wrong heart; David has the right heart but is deeply flawed. Hannah\'s song (ch. 2) previews the whole theological arc: God raises the lowly and brings down the proud.',
    keyVerse: '1 Sam 16:7 — "The Lord looks on the heart."',
    themes: ['Kingship & failure', 'David\'s rise', 'Heart vs. outward appearance'],
    preachingAdvice: 'The David and Goliath story (ch. 17) is beloved but frequently misread as "be brave like David." The text\'s point is that the giant-killer is the unlikely, anointed, Spirit-empowered one — it points forward to Christ. Saul is a tragic figure worth extended attention: his failure is incremental, self-justifying, and deeply familiar to congregations. Hannah\'s prayer is the theological key to the book and worth a standalone sermon.' },
  { name: '2 Samuel', abbr: '2 Sam', genre: 'Historical Narrative', author: 'Unknown', date: 'c. 930–722 BC', chapters: 24,
    audience: 'Israel reflecting on David\'s reign — its heights and its devastating failures.',
    occasion: 'The record of David\'s unified kingdom, God\'s covenant with him, and the consequences of his sin.',
    purpose: 'To establish the Davidic covenant as God\'s vehicle for his kingdom and to show that even the anointed king needs redemption.',
    bigIdea: 'David\'s kingdom expands under God\'s covenant promise, but unrepented sin brings lasting consequences even to the anointed.',
    overview: '2 Samuel splits at chapter 11: before David\'s sin with Bathsheba (chs. 1–10, a reign of blessing) and after (chs. 11–24, a reign of chaos and consequence). The Davidic covenant (ch. 7) is the theological centerpiece — God will build David a house, not vice versa, and one of his descendants will reign forever. Chapters 13–20 trace the horror that follows David\'s sin: rape, murder, rebellion.',
    keyVerse: '2 Sam 7:16 — "Your house and your kingdom shall be made sure forever before me."',
    themes: ['Davidic covenant', 'Sin & consequences', 'God\'s enduring promise'],
    preachingAdvice: '2 Samuel 7 (the Davidic covenant) is one of the most important chapters in the OT — preach it as a direct line to the throne of Christ. The Bathsheba narrative (chs. 11–12) and Nathan\'s confrontation are gold for preaching on repentance, power abuse, and the devastating reach of hidden sin. David\'s lament over Absalom (18:33) is one of Scripture\'s most human moments. The whole second half shows that consequences persist even after forgiveness.' },
  { name: '1 Kings', abbr: '1 Kgs', genre: 'Historical Narrative', author: 'Unknown', date: 'c. 550–560 BC', chapters: 22,
    audience: 'Exilic Israel needing to understand how they got to Babylon.',
    occasion: 'The Deuteronomistic historian compiled the record of the monarchy to explain exile as theological, not political, failure.',
    purpose: 'To demonstrate that covenant faithfulness — particularly to exclusive worship — determines Israel\'s national destiny.',
    bigIdea: 'Israel\'s united and divided kingdoms demonstrate that covenant faithfulness determines national destiny.',
    overview: '1 Kings opens with Solomon\'s glorious reign (chs. 1–10) and then traces his catastrophic failure as he allows his foreign wives to turn his heart to idols (ch. 11). The kingdom splits (ch. 12), and the narrator then runs two parallel royal stories — Israel in the north, Judah in the south. Elijah\'s ministry (chs. 17–21) is the book\'s dramatic high point, ending with Ahab and Jezebel as the apostate north\'s nadir.',
    keyVerse: '1 Kgs 9:3 — "I have consecrated this house that you have built, by putting my name there forever."',
    themes: ['Solomon\'s wisdom & failure', 'Division of the kingdom', 'Prophetic word'],
    preachingAdvice: 'Solomon\'s failure is more instructive than his success — he had unprecedented wisdom and still chose idolatry. Preach it as a warning that knowledge of God without love for God leads nowhere good. Elijah on Carmel (ch. 18) and under the juniper tree (ch. 19) are two sides of the same prophet — courage and despair — and are remarkably pastoral. The still small voice in ch. 19 is often misread; God was not absent from the wind or fire, but the voice revealed his intimacy.' },
  { name: '2 Kings', abbr: '2 Kgs', genre: 'Historical Narrative', author: 'Unknown', date: 'c. 550–560 BC', chapters: 25,
    audience: 'Exilic Israel in Babylon, processing the destruction of Jerusalem.',
    occasion: 'Both kingdoms fell — the north to Assyria (722 BC) and the south to Babylon (586 BC). The history needed theological explanation.',
    purpose: 'To show that exile was not the failure of God but the fulfillment of his covenant warnings in Deuteronomy.',
    bigIdea: 'Israel\'s compounding apostasy leads to exile, confirming that no king can save without covenant obedience.',
    overview: '2 Kings continues the Elisha narrative (chs. 1–8), then tracks the accelerating decline of both kingdoms. The fall of the northern kingdom to Assyria (ch. 17) receives a full theological explanation: they followed the sins of Jeroboam and ignored the prophets. Hezekiah and Josiah are bright reform exceptions in Judah, but their reforms cannot stop the momentum of Manasseh\'s evil. The book ends with Jerusalem burned and the people in exile.',
    keyVerse: '2 Kgs 17:23 — "The Lord removed Israel out of his sight... so Israel was exiled from their own land."',
    themes: ['Exile as judgment', 'Prophetic warning', 'Covenant consequences'],
    preachingAdvice: 'Elisha\'s ministry (early chapters) is more domestic and intimate than Elijah\'s — healings, provision, resurrection. It is worth sustained attention. Hezekiah\'s illness and recovery (ch. 20) is a vivid portrait of prayer changing outcomes within God\'s sovereignty. The book as a whole teaches that no cultural momentum, no legacy, and no reform is sufficient without sustained covenant loyalty — a searching word for any institution.' },
  { name: '1 Chronicles', abbr: '1 Chr', genre: 'Historical Narrative', author: 'Ezra (tradition)', date: 'c. 450–400 BC', chapters: 29,
    audience: 'The post-exilic Jewish community in Jerusalem, needing identity and hope after the devastation of exile.',
    occasion: 'The returned exiles needed to understand their continuity with pre-exilic Israel and their calling to restore worship.',
    purpose: 'To reframe Israel\'s history around the Davidic line and temple worship as the true center of restored community.',
    bigIdea: 'David\'s preparations for the temple establish that true worship at the right place is central to Israel\'s identity.',
    overview: '1 Chronicles opens with nine chapters of genealogy (chs. 1–9) — not tedious but theologically strategic, tracing the line from Adam to the post-exilic community. The rest focuses exclusively on David (chs. 10–29), with Saul\'s death as prologue. Notably absent: David\'s sin with Bathsheba and Absalom\'s rebellion. The Chronicler\'s David is the worshipper-king who prepares everything for the temple Solomon will build. Temple, Levites, and music receive enormous attention.',
    keyVerse: '1 Chr 29:11 — "Yours, O Lord, is the greatness and the power and the glory and the victory."',
    themes: ['Davidic lineage', 'Temple worship', 'True Israel'],
    preachingAdvice: 'Don\'t skip the genealogies — in their original context they were the post-exilic community\'s proof of covenant continuity. Names matter to God. David\'s preparation for the temple (chs. 22–29) is remarkable: a man of war denied the privilege of building, but who channels his energy into preparation for his son to do it. That is a profound model of generational faithfulness.' },
  { name: '2 Chronicles', abbr: '2 Chr', genre: 'Historical Narrative', author: 'Ezra (tradition)', date: 'c. 450–400 BC', chapters: 36,
    audience: 'Post-exilic returnees needing to understand their history and the basis for hope going forward.',
    occasion: 'The Chronicler retells the monarchy with a post-exilic lens: what can restored Israel learn from the kings?',
    purpose: 'To show that the measure of every king is their relationship to the temple, worship, and covenant — and to end with Cyrus\'s decree as hope.',
    bigIdea: 'The Davidic kings\' covenant fidelity—measured by temple worship—determines Israel\'s fate, ending in hope.',
    overview: '2 Chronicles runs from Solomon\'s temple dedication (chs. 1–9) through the divided kingdom (following only Judah\'s kings) to exile and Cyrus\'s decree (ch. 36). The reform narratives — Asa, Jehoshaphat, Hezekiah, Josiah — receive extended treatment as models of what covenant renewal looks like. The Chronicler\'s great question: when a king prays and seeks God, what happens? The answer is consistently: God responds.',
    keyVerse: '2 Chr 7:14 — "If my people who are called by my name humble themselves... I will heal their land."',
    themes: ['Temple & prayer', 'Reform & revival', 'Exile & hope'],
    preachingAdvice: '2 Chronicles 7:14 is one of the most preached and most misapplied verses in the OT — it was spoken to Solomon about Israel, not as a universal political promise. Preach it in context: God responds to his covenant people\'s humility and prayer. Jehoshaphat\'s prayer in ch. 20 and Hezekiah\'s in chs. 29–32 are outstanding models of corporate repentance and dependence. The book\'s ending — Cyrus\'s decree — is deliberately hopeful: God\'s word cannot be permanently silenced.' },
  { name: 'Ezra', abbr: 'Ezra', genre: 'Historical Narrative', author: 'Ezra', date: 'c. 450–400 BC', chapters: 10,
    audience: 'The Jewish community returning from Babylonian exile under Zerubbabel and then Ezra.',
    occasion: 'Two waves of return (Zerubbabel\'s and Ezra\'s) required narrative documentation and theological interpretation.',
    purpose: 'To show God keeping his promise of restoration and to call the returned community to Torah faithfulness.',
    bigIdea: 'God keeps his promise by restoring his people from exile and reconstituting them around the law and the temple.',
    overview: 'Ezra-Nehemiah was originally one book. Ezra covers Zerubbabel\'s return and temple rebuilding (chs. 1–6) and then Ezra\'s return and reform (chs. 7–10) — separated by nearly 60 years. The opposition narrative (chs. 4–5) shows that restoration faces resistance. Ezra\'s great prayer of confession (ch. 9) is the theological core, acknowledging that the exile was deserved and that God\'s restoration is pure grace.',
    keyVerse: 'Ezra 7:10 — "Ezra had set his heart to study the Law of the Lord, and to do it and to teach his statutes."',
    themes: ['Return from exile', 'Restoration', 'Torah obedience'],
    preachingAdvice: 'Ezra 7:10 is one of the finest descriptions of pastoral calling in the Bible: study, do, teach — in that order. The controversy over mixed marriages (chs. 9–10) is about covenant identity, not racial purity; context is everything. Preach the book as God-keeps-his-word after catastrophic failure. The gap between the glorious promises of Isaiah 40–55 and the modest reality of the return is theologically important — full restoration still awaits.' },
  { name: 'Nehemiah', abbr: 'Neh', genre: 'Historical Narrative', author: 'Nehemiah', date: 'c. 445–420 BC', chapters: 13,
    audience: 'The returned exilic community in Jerusalem under Persian governance.',
    occasion: 'Jerusalem\'s walls were still rubble 70+ years after the first return — shame and vulnerability for the community.',
    purpose: 'To record community restoration through prayer, leadership, and corporate covenant renewal centered on God\'s word.',
    bigIdea: 'God rebuilds his community spiritually and physically as Nehemiah leads the reconstruction of Jerusalem\'s walls.',
    overview: 'Nehemiah\'s memoir covers wall-building under opposition (chs. 1–7), the great Torah reading and revival under Ezra (ch. 8), covenant renewal (chs. 9–10), repopulation of Jerusalem (chs. 11–12), and Nehemiah\'s reforms on his second visit (ch. 13). Chapter 8\'s public reading of the Law — with explanation — is one of Scripture\'s most moving depictions of biblical exposition. The book ends on a troubled note: the reforms don\'t hold.',
    keyVerse: 'Neh 8:8 — "They read from the book, from the Law of God, clearly, and they gave the sense."',
    themes: ['Rebuilding Jerusalem', 'Covenant renewal', 'Leadership & prayer'],
    preachingAdvice: 'Nehemiah is a goldmine for preaching on leadership: his arrow prayer (2:4), his night survey (2:12–15), his response to opposition (4:9 — pray and post a guard), and his willingness to name sin in ch. 13. The chapter 8 revival is a biblical theology of preaching: word read, sense given, people weeping, joy following. Don\'t domesticate Nehemiah into a self-help leadership book; his power is his constant reference to God\'s hand.' },
  { name: 'Esther', abbr: 'Esth', genre: 'Historical Narrative', author: 'Unknown', date: 'c. 480 BC (events)', chapters: 10,
    audience: 'Jews living in the Diaspora under Persian rule, far from the land and the temple.',
    occasion: 'Haman\'s genocidal plot against the Jews under Ahasuerus (Xerxes I) in Persia.',
    purpose: 'To show God\'s hidden providence protecting his covenant people even when his name is never mentioned.',
    bigIdea: 'God\'s hidden providence preserves his people from annihilation through the courage of an unexpected Jewish queen.',
    overview: 'Esther is one of two OT books that never mention God (along with Song of Solomon). Yet his fingerprints are on every "coincidence" — Vashti\'s removal, Esther\'s selection, Mordecai\'s uncovered plot, Haman\'s gallows turned against himself. The story moves from threat (Haman\'s edict) through risk (Esther\'s unsummoned approach to the king) to reversal (Haman hanged, Jews defended). The Purim festival commemorates the deliverance.',
    keyVerse: 'Esth 4:14 — "Who knows whether you have not come to the kingdom for such a time as this?"',
    themes: ['Providence', 'Courage', 'Reversal of fortune'],
    preachingAdvice: 'The absence of God\'s name is the book\'s most powerful literary and theological move — God\'s invisibility in diaspora is the point. Esther is not primarily about courage; it is about the God who orchestrates circumstances so that his people survive. The "such a time as this" passage is best preached as a call to recognize providential positioning, not self-aggrandizement. The sexual politics of the book (a woman selected by beauty for a harem) should be acknowledged honestly.' },
  { name: 'Job', abbr: 'Job', genre: 'Wisdom', author: 'Unknown', date: 'Unknown (patriarchal era?)', chapters: 42,
    audience: 'Anyone suffering innocently, and the community that witnesses or counsels the sufferer.',
    occasion: 'The suffering of a righteous man that shatters the comfortable equation of obedience = prosperity.',
    purpose: 'To confront the retribution principle — that suffering always signals sin — and to defend God\'s sovereign freedom.',
    bigIdea: 'God\'s sovereignty over suffering transcends human categories of retributive justice and is vindicated in the whirlwind.',
    overview: 'Job is a wisdom disputation in poetic form bracketed by a prose prologue and epilogue. The prologue (chs. 1–2) gives the reader divine perspective that Job never has. Three cycles of dialogue with Eliphaz, Bildad, and Zophar (chs. 3–31) argue the retribution principle that Job resists. Elihu speaks (chs. 32–37) and anticipates the divine speech. God\'s speeches from the whirlwind (chs. 38–41) don\'t explain Job\'s suffering — they display God\'s incomprehensible sovereignty. Job is restored (ch. 42) not because he was right about everything, but because he was honest.',
    keyVerse: 'Job 19:25 — "I know that my Redeemer lives, and at the last he will stand upon the earth."',
    themes: ['Suffering & theodicy', 'Divine sovereignty', 'Wisdom\'s limits'],
    preachingAdvice: 'The friends are not wrong about God in the abstract — their problem is misapplication. Don\'t flatten them into villains. Job is not wrong to lament and protest — God vindicates his honesty over the friends\' pious platitudes (42:7). Preach the whirlwind speeches as an invitation to awe, not an evasion: God\'s answer to suffering is the revelation of himself, not an explanation. This book is irreplaceable for preaching in communities experiencing inexplicable loss.' },
  { name: 'Psalms', abbr: 'Ps', genre: 'Poetry', author: 'David, Asaph, Sons of Korah, et al.', date: 'c. 1000–400 BC', chapters: 150,
    audience: 'The worshipping community of Israel in temple, synagogue, and private prayer across the full span of life.',
    occasion: 'Compiled over centuries as Israel\'s official hymnbook for liturgy, personal prayer, and national expression.',
    purpose: 'To give God\'s people a full-range prayer vocabulary and a vision of the Messiah who will reign forever.',
    bigIdea: 'Israel\'s hymnbook gives God\'s people a full-range vocabulary for prayer, praise, and trust in every season of life.',
    overview: 'The Psalter is organized into five books (1–41, 42–72, 73–89, 90–106, 107–150), each ending with a doxology, mirroring the five books of Moses. The genres include hymns, laments (the largest single category), thanksgiving psalms, royal/messianic psalms, wisdom psalms, and pilgrimage psalms. Psalms 1 and 2 serve as a programmatic introduction: the blessed man of Torah and the enthroned Messiah-King. The Psalter moves from lament-heavy to praise-heavy, ending in unbounded doxology (146–150).',
    keyVerse: 'Ps 1:1–2 — "Blessed is the man... his delight is in the law of the Lord."',
    themes: ['Praise & lament', 'Messianic hope', 'Torah meditation'],
    preachingAdvice: 'The lament psalms (about a third of the Psalter) are the most neglected in contemporary preaching — and the most needed. Preach the full emotional range. The messianic psalms (2, 16, 22, 45, 72, 89, 110) are NT-cited extensively; handle them with both original context and christological fulfillment. Psalm 22\'s opening cry is Jesus on the cross — the whole psalm matters. When preaching a Psalm, identify the genre first; it shapes how to apply it.' },
  { name: 'Proverbs', abbr: 'Prov', genre: 'Wisdom', author: 'Solomon, Agur, Lemuel', date: 'c. 1000–700 BC', chapters: 31,
    audience: 'Young men (specifically addressed) entering adult life in ancient Israel\'s covenant community.',
    occasion: 'Court wisdom and household instruction collected and edited under Solomon and later Hezekiah\'s scribes.',
    purpose: 'To impart the skill of godly living — wisdom — rooted in the fear of the Lord, covering all domains of life.',
    bigIdea: 'Wisdom—the skill of living well in God\'s ordered world—belongs to all who fear the Lord and heed instruction.',
    overview: 'Proverbs divides into an extended wisdom discourse (chs. 1–9), where Wisdom and Folly call out to the young man, and a vast collection of individual proverbs (chs. 10–31). The frame of chs. 1–9 gives the Proverbs their theological anchor: wisdom is personified as a woman who was with God at creation (ch. 8), and she calls out in contrast to the seductive but deadly Woman Folly. The famous woman of valor in ch. 31 closes the book as wisdom embodied.',
    keyVerse: 'Prov 9:10 — "The fear of the Lord is the beginning of wisdom."',
    themes: ['Fear of the Lord', 'Wisdom vs. folly', 'Speech & relationships'],
    preachingAdvice: 'Don\'t preach individual proverbs as absolute guarantees — they are observations about how life generally works in God\'s ordered world, not promises. Proverbs 8 (Wisdom personified) is an important NT connection point: John 1 and Colossians 1 draw on it for Christology. The extended instruction speeches (chs. 1–9) work well as sermon series on parenting, sexual ethics, or the nature of wisdom. The fear of the Lord (1:7, 9:10) is not terror — it is the reverent, love-shaped awe that orients all of life correctly.' },
  { name: 'Ecclesiastes', abbr: 'Eccl', genre: 'Wisdom', author: 'Qohelet (Solomon)', date: 'c. 935–931 BC', chapters: 12,
    audience: 'Anyone who has pursued achievement, pleasure, and wisdom only to find them unsatisfying.',
    occasion: 'A sage\'s extended reflection on the limits and meaning of human existence "under the sun."',
    purpose: 'To deconstruct all substitutes for God and drive the reader to fear God as the only foundation for a meaningful life.',
    bigIdea: 'Life under the sun without reference to God is vanity; fearing God and embracing his gifts gives it meaning.',
    overview: 'Qohelet ("the Preacher" or "the Gatherer") is a royal experiment: what if the wisest, wealthiest man tried every avenue of meaning? The answer, repeated throughout, is "vanity of vanities" (hebel — breath, vapor). Yet the book is not nihilistic — Qohelet repeatedly commends the enjoyment of God\'s gifts (food, work, marriage) as good within limits. The epilogue (12:9–14) is the narrator\'s frame, affirming Qohelet\'s wisdom while pointing beyond him: fear God.',
    keyVerse: 'Eccl 12:13 — "Fear God and keep his commandments, for this is the whole duty of man."',
    themes: ['Vanity', 'Enjoyment of life', 'Fear of God'],
    preachingAdvice: 'Ecclesiastes is the most mispreached wisdom book — often treated as either hopeless pessimism or self-help about "enjoying life." Its real move is apologetic: it demolishes every secular meaning-system from within. Preach it as the Bible\'s most honest engagement with existential despair. The "enjoyment passages" (2:24, 3:12–13, 9:7–9) are not hedonism — they are creational gratitude within covenant limits. This book connects powerfully with post-Christian, secular congregants.' },
  { name: 'Song of Solomon', abbr: 'Song', genre: 'Poetry', author: 'Solomon', date: 'c. 965–935 BC', chapters: 8,
    audience: 'Israel celebrating and instructing in the goodness of romantic love within the covenant community.',
    occasion: 'A wedding celebration and/or wisdom instruction about the beauty and danger of sexual love.',
    purpose: 'To affirm erotic love within marriage as a genuine good of creation and a reflection of divine-human covenant love.',
    bigIdea: 'The passionate love between a man and woman reflects the beauty of covenantal love and the divine love it images.',
    overview: 'Song of Solomon is a collection of love poems between a woman (who speaks the majority of lines — remarkable for the ancient world) and her beloved. It has no narrative plot but a lyric arc of longing, union, and celebration. The garden imagery deliberately echoes Eden. The woman\'s voice is the dominant voice — her desire, her agency, her praise. The interpretive tradition has long read it both literally (celebrating marriage) and allegorically (God and Israel / Christ and the church).',
    keyVerse: 'Song 8:6 — "Love is strong as death... its flashes are flashes of fire, the very flame of the Lord."',
    themes: ['Romantic love', 'Covenant fidelity', 'Divine love'],
    preachingAdvice: 'Preach the literal sense first — the church has been too embarrassed about embodied love, and the Song corrects that. Marriage and sexuality as good creation gifts need unembarrassed celebration in the pulpit. The allegorical dimension is not wrong — Ephesians 5 and Revelation 19 explicitly connect marriage to Christ and the church — but don\'t use allegory to escape the earthy particularity. The woman\'s dominant voice is a countercultural gift: her desire matters, her pursuit is celebrated.' },
  { name: 'Isaiah', abbr: 'Isa', genre: 'Prophecy', author: 'Isaiah', date: 'c. 740–680 BC', chapters: 66,
    audience: 'Judah under Uzziah, Jotham, Ahaz, and Hezekiah — a nation facing Assyrian threat and tempted toward political alliances over God.',
    occasion: 'The Assyrian crisis, Ahaz\'s faithlessness, and the looming specter of Babylonian exile that Isaiah foresees.',
    purpose: 'To call Judah to trust God alone and to announce the Servant who will accomplish a new exodus for all nations.',
    bigIdea: 'God judges faithless Israel and the nations but promises a new exodus, a Suffering Servant, and a new creation.',
    overview: 'Isaiah is the OT\'s most comprehensive theological vision. Chapters 1–39 (First Isaiah) focus on judgment on Judah and the nations with messianic promise woven throughout. Chapters 40–55 (Second Isaiah) open with the great comfort passage and climax in the four Servant Songs, culminating in Isaiah 53. Chapters 56–66 envision the new creation and the inclusion of the nations. The book is cited more in the NT than any other OT book except Psalms.',
    keyVerse: 'Isa 53:5 — "He was pierced for our transgressions; he was crushed for our iniquities."',
    themes: ['Judgment & salvation', 'Suffering Servant', 'New creation'],
    preachingAdvice: 'Isaiah 40–55 is essential for preaching the gospel from the OT — read it regularly. The Servant Songs (42:1–4, 49:1–6, 50:4–9, 52:13–53:12) are christologically transparent and devastatingly powerful when preached with NT fulfillment. Don\'t treat chs. 1–39 as merely negative — the messianic texts (7:14, 9:1–7, 11:1–9) are extraordinary. Isaiah is best preached in extended series; the book rewards sustained immersion.' },
  { name: 'Jeremiah', abbr: 'Jer', genre: 'Prophecy', author: 'Jeremiah', date: 'c. 627–580 BC', chapters: 52,
    audience: 'Judah in the final decades before Babylonian exile, under kings Josiah through Zedekiah.',
    occasion: 'The impending and then actual Babylonian conquest — a community needing to understand why and what comes next.',
    purpose: 'To deliver God\'s final warnings, to call for surrender to Babylon as God\'s instrument, and to announce the new covenant.',
    bigIdea: 'God\'s final warnings to Judah before exile announce the new covenant that will replace the broken old one.',
    overview: 'Jeremiah is not chronologically arranged — it is a collection of oracles, narratives, and laments. His "confessions" (11:18–12:6, 15:10–21, 17:14–18, 18:19–23, 20:7–18) are raw, honest, and unique in prophecy. The new covenant passage (31:31–34) is the theological climax and is extensively quoted in Hebrews. Jeremiah suffers enormously for his message — he is a type of the Suffering Servant and of Christ.',
    keyVerse: 'Jer 31:33 — "I will put my law within them, and I will write it on their hearts."',
    themes: ['Judgment & exile', 'New covenant', 'Prophetic suffering'],
    preachingAdvice: 'Jeremiah\'s confessions are extraordinary — they model honest, even angry prayer in crisis. Preach them as permission for the congregation to bring their raw pain to God. The potter and clay (ch. 18) and the new covenant (ch. 31) are the two great standalone texts. The book\'s political context — Jeremiah urges surrender to Babylon — is counter-intuitive but theological: God uses even pagan empires as his instruments. Don\'t expect resolution; Jeremiah ends in exile.' },
  { name: 'Lamentations', abbr: 'Lam', genre: 'Poetry', author: 'Jeremiah', date: 'c. 586 BC', chapters: 5,
    audience: 'Survivors of Jerusalem\'s destruction sitting in the rubble of their city.',
    occasion: 'The sacking of Jerusalem and burning of the temple by Nebuchadnezzar in 586 BC.',
    purpose: 'To give voice to unbearable communal grief and to anchor hope in God\'s covenant mercies that cannot be exhausted.',
    bigIdea: 'God\'s just judgment on Jerusalem calls for honest grief and anchors hope in his enduring covenant mercies.',
    overview: 'Five acrostic poems (each following the Hebrew alphabet) give shape to chaos. Chapter 1: Jerusalem personified as a bereaved widow. Chapter 2: God as the agent of destruction — shocking, honest theology. Chapter 3: the pivot — personal lament descending into hope in God\'s steadfast love (3:22–23). Chapter 4: the siege\'s horrors. Chapter 5: a communal cry for restoration that ends without resolution. The book teaches that grief is not faithlessness.',
    keyVerse: 'Lam 3:22–23 — "The steadfast love of the Lord never ceases... they are new every morning."',
    themes: ['Lament & grief', 'God\'s justice', 'Hope in desolation'],
    preachingAdvice: 'Lamentations is the church\'s most neglected grief resource. It belongs in any series on suffering, loss, or community trauma. The famous hope passage (3:22–23) only works if you let the full weight of grief in chapters 1–2 land first — strip it from context and it becomes greeting-card optimism. Chapter 2\'s depiction of God as the agent of Jerusalem\'s destruction is theologically difficult but honest; preach it as the alternative to blaming everyone else.' },
  { name: 'Ezekiel', abbr: 'Ezek', genre: 'Prophecy', author: 'Ezekiel', date: 'c. 593–570 BC', chapters: 48,
    audience: 'Jewish exiles in Babylon — refugees who had lost land, temple, and the visible signs of God\'s presence.',
    occasion: 'The exile and the destruction of Jerusalem; exiles needed to know whether God was still God.',
    purpose: 'To vindicate God\'s justice in the exile, to announce the departure and return of his glory, and to promise restoration by his Spirit.',
    bigIdea: 'God\'s glory departs from a defiled temple but will return when he gives his people a new heart and Spirit.',
    overview: 'Ezekiel is structured in three movements: judgment on Israel (chs. 1–24), judgment on the nations (chs. 25–32), and restoration oracles (chs. 33–48). The departure of God\'s glory from the temple (chs. 8–11) is the book\'s most devastating theological moment. The valley of dry bones (ch. 37) and the new covenant with a new spirit (ch. 36) are its great hope passages. The visionary temple of chs. 40–48 is still debated — a literal future temple, or a theological portrait of restored worship.',
    keyVerse: 'Ezek 36:26 — "I will give you a new heart, and a new spirit I will put within you."',
    themes: ['God\'s glory', 'New heart & Spirit', 'Restoration of Israel'],
    preachingAdvice: 'Ezekiel\'s bizarre visions (ch. 1, the chariot-throne) are not mysticism for its own sake — they establish that God\'s glory is mobile and not confined to Jerusalem. The glory can depart, and it does. The "son of man" address (used 90+ times) is significant for understanding Jesus\'s self-designation. Ezekiel 36:24–27 (new heart, new spirit) is one of the OT\'s clearest anticipations of the new birth and is essential for preaching regeneration.' },
  { name: 'Daniel', abbr: 'Dan', genre: 'Prophecy / Apocalyptic', author: 'Daniel', date: 'c. 605–530 BC', chapters: 12,
    audience: 'Jewish exiles in Babylon, and later Jews under Seleucid (Greek) persecution.',
    occasion: 'Faithful Jews under pressure to compromise with pagan imperial culture needed assurance that God still reigned.',
    purpose: 'To demonstrate God\'s sovereignty over all kingdoms and to assure the faithful that his eternal kingdom will prevail.',
    bigIdea: 'God sovereignly rules over history and pagan empires, vindicating his faithful people and establishing his eternal kingdom.',
    overview: 'Daniel divides into court narratives (chs. 1–6) and apocalyptic visions (chs. 7–12), with chapters 2–7 in Aramaic (the international language). The court stories — fiery furnace, lion\'s den, the writing on the wall — illustrate faithful witness under pressure. The vision of chapter 7 (the Son of Man receiving an everlasting kingdom) is Jesus\'s most frequent self-reference and crucial for NT Christology.',
    keyVerse: 'Dan 7:14 — "His dominion is an everlasting dominion, which shall not pass away."',
    themes: ['God\'s sovereignty', 'Faithful witness', 'Apocalyptic hope'],
    preachingAdvice: 'The court narratives (chs. 1–6) are entry points for preaching cultural resistance — how does a minority community maintain its identity in a powerful hostile culture? The answer is not isolation but faithful, bold presence. Chapter 7\'s Son of Man is the most important single OT text for Jesus\'s self-understanding. The apocalyptic sections (chs. 8–12) require historical grounding in Seleucid history; don\'t jump straight to end-times speculation.' },
  { name: 'Hosea', abbr: 'Hos', genre: 'Prophecy', author: 'Hosea', date: 'c. 755–715 BC', chapters: 14,
    audience: 'The northern kingdom of Israel (Ephraim) in its final decades before Assyrian conquest.',
    occasion: 'Israel\'s Baal worship and political instability — she was spiritually and politically committing adultery.',
    purpose: 'To embody God\'s wounded, relentless love for his unfaithful people and to call them to return before judgment falls.',
    bigIdea: 'God\'s unrequited love for unfaithful Israel—embodied in Hosea\'s marriage—calls her to return and promises covenant renewal.',
    overview: 'Hosea\'s marriage to the unfaithful Gomer (chs. 1–3) is the lived parable of God\'s relationship with Israel. The rest of the book is a collection of oracles alternating between accusation and appeal, judgment and promise. The tenderness of God in 11:8 ("How can I give you up, O Ephraim?") is one of Scripture\'s most moving divine moments. Chapter 14 closes with an invitation to return and a vision of fruitful restoration.',
    keyVerse: 'Hos 6:6 — "I desire steadfast love and not sacrifice, the knowledge of God rather than burnt offerings."',
    themes: ['Covenant love', 'Spiritual adultery', 'Call to return'],
    preachingAdvice: 'The marriage metaphor must be handled with pastoral care — it can be misapplied to pressure abuse victims to return to dangerous situations. In context it is God\'s unique relationship with Israel, not a universal marriage principle. Hosea 11 (God as grieving parent) is extraordinary — it shows the pathos of God in terms of parenthood, not just marriage. The word hesed (steadfast love) runs throughout; 6:6 is cited twice by Jesus (Matt 9:13, 12:7).' },
  { name: 'Joel', abbr: 'Joel', genre: 'Prophecy', author: 'Joel', date: 'c. 830–750 BC', chapters: 3,
    audience: 'Judah, apparently reeling from a devastating locust plague and drought.',
    occasion: 'A locust swarm of unprecedented scale that Joel interprets as a preview of the Day of the Lord.',
    purpose: 'To call the community to genuine repentance and to announce the outpouring of the Spirit that will transcend all social barriers.',
    bigIdea: 'The Day of the Lord brings devastating judgment but also the outpouring of God\'s Spirit on all flesh.',
    overview: 'Joel moves from locust plague (ch. 1) to the call to lament and repent (ch. 2:1–17) to God\'s response and promise (2:18–32) to judgment on the nations and restoration of Judah (ch. 3). The pivot is the call to "rend your hearts and not your garments" (2:13). The Spirit outpouring on all flesh (2:28–32) is Peter\'s text at Pentecost — Joel anchors the entire NT mission.',
    keyVerse: 'Joel 2:28 — "I will pour out my Spirit on all flesh."',
    themes: ['Day of the Lord', 'Spirit outpouring', 'Restoration'],
    preachingAdvice: 'Joel is short enough to preach as a whole-book unit or in two parts (judgment/lament and promise/restoration). The Pentecost connection (Acts 2:16–21) makes Joel 2:28–32 essential preaching material. The "rend your hearts" call (2:13) is a powerful diagnostic for religious community that performs repentance without practicing it. The locust imagery — past judgment as preview of future judgment — is a pastoral tool for interpreting present suffering.' },
  { name: 'Amos', abbr: 'Amos', genre: 'Prophecy', author: 'Amos', date: 'c. 760–750 BC', chapters: 9,
    audience: 'The prosperous northern kingdom of Israel during Jeroboam II\'s reign — a time of economic boom and moral collapse.',
    occasion: 'Israel\'s wealth was built on the exploitation of the poor while religious observance continued as normal.',
    purpose: 'To expose the lie that religious ritual can substitute for social justice and to announce God\'s judgment on privilege.',
    bigIdea: 'God\'s justice cannot be bought by religious ritual—it must roll like a river through righteous social living.',
    overview: 'Amos opens with oracles against the surrounding nations (chs. 1–2) — a rhetorical trap that snares Israel when she is condemned last. Three cycles of judgment speeches follow (chs. 3–6), with five visions (chs. 7–9). The five visions escalate from negotiable (locusts, fire) to non-negotiable (plumb line, basket of summer fruit, the Lord at the altar). The book ends with a brief but luminous restoration promise (9:11–15).',
    keyVerse: 'Amos 5:24 — "Let justice roll down like waters, and righteousness like an ever-flowing stream."',
    themes: ['Social justice', 'Empty religion', 'God\'s judgment on privilege'],
    preachingAdvice: 'Amos is the most socially uncomfortable prophet — his target is comfortable, prosperous, religious people who oppress the vulnerable. That describes many contemporary congregations. The "I hate, I despise your feasts" passage (5:21–24) is a prophetic wrecking ball at any church that treats worship as insulation from justice demands. Preach it honestly. James 5 is Amos\'s NT echo. The oracles-against-nations opener (chs. 1–2) is a masterful rhetorical setup worth preaching.' },
  { name: 'Obadiah', abbr: 'Obad', genre: 'Prophecy', author: 'Obadiah', date: 'c. 586–550 BC', chapters: 1,
    audience: 'Judah in the aftermath of Jerusalem\'s fall, when Edom celebrated and profited from the disaster.',
    occasion: 'Edom (descendants of Esau) had aided Babylon, blocked Jewish refugees, and gloated over Jerusalem\'s destruction.',
    purpose: 'To pronounce judgment on Edom\'s pride and treachery and to assure Judah of God\'s ultimate vindication.',
    bigIdea: 'Edom\'s pride and betrayal of Israel will be repaid as God vindicates Zion on the Day of the Lord.',
    overview: 'The shortest OT book is a sustained oracle against Edom, rooted in the ancient rivalry of Esau and Jacob. Verses 1–14 indict Edom\'s pride and treachery; verses 15–21 expand to the Day of the Lord for all nations and the restoration of Israel. The lex talionis principle — "As you have done, it shall be done to you" (v.15) — governs the judgment. Edom became a symbol in prophetic literature for all nations that oppress God\'s people.',
    keyVerse: 'Obad 15 — "The day of the Lord is near upon all the nations. As you have done, it shall be done to you."',
    themes: ['Pride goes before a fall', 'Judgment on Edom', 'Zion\'s triumph'],
    preachingAdvice: 'Obadiah\'s shortness makes it ideal for a single-sermon treatment. The theological payoff is the judgment on pride — specifically the pride that glories in another\'s suffering. Edom\'s sin is defined in v.12 as "gloating over your brother\'s day of misfortune." That is a very human sin, worth naming. The book also raises the question of God\'s memory — the betrayal happened long before judgment falls, teaching that God\'s justice operates on a longer timeline than ours.' },
  { name: 'Jonah', abbr: 'Jon', genre: 'Narrative / Prophecy', author: 'Jonah', date: 'c. 780–750 BC', chapters: 4,
    audience: 'Israel in the 8th century, inclined to see God\'s love as their exclusive property.',
    occasion: 'A prophet\'s dramatic resistance to God\'s mission to Nineveh, the hated Assyrian capital.',
    purpose: 'To expose Israel\'s nationalistic narrowness and to reveal a God whose compassion extends to the nations.',
    bigIdea: 'God\'s relentless compassion for the nations exposes the narrowness of his prophet\'s resistance to Gentile inclusion.',
    overview: 'Jonah is a brilliantly crafted narrative, not a fish story. The fish is barely mentioned. The real drama is Jonah\'s resistance to God\'s mercy toward the enemy. The book\'s irony is savage: pagan sailors pray and are saved; Israel\'s prophet refuses to go. Nineveh repents at the minimal preaching Jonah delivers; Jonah is furious (ch. 4). The book ends with God\'s unanswered question: "Should I not pity Nineveh?" — the reader must answer.',
    keyVerse: 'Jon 4:11 — "Should I not pity Nineveh, that great city?"',
    themes: ['God\'s mercy to nations', 'Repentance', 'Prophet\'s heart'],
    preachingAdvice: 'Preach Jonah as a mirror on the congregation\'s own theological nationalism and selective compassion. Jesus cited Jonah\'s three days in the fish as a type of his death and resurrection (Matt 12:40) — but also cited Nineveh\'s repentance as a judgment on Israel\'s unbelief (Matt 12:41). The final chapter (Jonah\'s sulking) is the most important — where is the heart of God\'s messenger? Don\'t let the fish dominate; it\'s a single verse.' },
  { name: 'Micah', abbr: 'Mic', genre: 'Prophecy', author: 'Micah', date: 'c. 735–700 BC', chapters: 7,
    audience: 'Both Israel and Judah during the Assyrian crisis, under Jotham, Ahaz, and Hezekiah.',
    occasion: 'Social injustice rampant among the ruling classes while prophets preached for hire and priests taught for pay.',
    purpose: 'To indict corrupt leadership, announce divine judgment, and promise a humble ruler from Bethlehem who will shepherd the remnant.',
    bigIdea: 'God demands justice, mercy, and humility rather than sacrifice, and promises a ruler from Bethlehem who will shepherd his people.',
    overview: 'Micah follows a three-part structure of judgment-promise cycles (chs. 1–2, 3–5, 6–7). The famous covenant lawsuit of chapter 6 — "what does the Lord require?" — leads to the summary of 6:8. Chapter 5:2 predicts a ruler from Bethlehem who will be "great to the ends of the earth" — cited in Matthew 2 at Jesus\'s birth. The book ends (7:18–20) with one of the OT\'s most exuberant celebrations of divine forgiveness.',
    keyVerse: 'Mic 6:8 — "Do justice, and to love kindness, and to walk humbly with your God."',
    themes: ['Justice & mercy', 'Messianic ruler', 'Covenant lawsuit'],
    preachingAdvice: 'Micah 6:8 is the OT\'s most compact ethical summary and rewards careful exposition: "do justice" (public, structural), "love kindness" (hesed — relational loyalty), "walk humbly with your God" (the vertical that grounds the horizontal). Micah 5:2 is an essential Advent text. The book\'s ending (7:18–20) — "Who is a God like you?" — is one of the great doxologies of the minor prophets and worth standalone preaching.' },
  { name: 'Nahum', abbr: 'Nah', genre: 'Prophecy', author: 'Nahum', date: 'c. 663–612 BC', chapters: 3,
    audience: 'Judah under Assyrian domination, traumatized by Nineveh\'s cruelty and seemingly invincible power.',
    occasion: 'Nineveh\'s continued and escalating brutality a century after Jonah\'s preaching — the temporary repentance had not held.',
    purpose: 'To announce Nineveh\'s imminent and total destruction as comfort for an oppressed Judah and as a declaration of God\'s justice.',
    bigIdea: 'The fall of Nineveh declares that God\'s patience with the wicked has a limit and his justice will ultimately prevail.',
    overview: 'Nahum is a theological bookend to Jonah: where Jonah showed God\'s mercy to Nineveh, Nahum announces her final doom. The book opens with a theophany hymn (1:2–8) establishing God\'s character — jealous, avenging, patient but not endlessly so. Chapters 2–3 are vivid poetic descriptions of Nineveh\'s siege and fall, historically fulfilled in 612 BC. The final verse — "all who hear the news about you clap their hands" — is jarring but honest about the moral satisfaction of justice.',
    keyVerse: 'Nah 1:7 — "The Lord is good, a stronghold in the day of trouble."',
    themes: ['God\'s justice', 'Comfort for oppressed', 'Fall of Assyria'],
    preachingAdvice: 'Nahum requires honest engagement with divine wrath — don\'t soften it into mere "consequences." God is explicitly the avenger here. But this is comfort, not cruelty: Nahum is written for victims of imperial violence who needed assurance that the oppressor would not win forever. 1:7 is the hinge — "the Lord is good" is not separate from his vengeance; it is the reason for it. The oppressed need to know God is a stronghold.' },
  { name: 'Habakkuk', abbr: 'Hab', genre: 'Prophecy', author: 'Habakkuk', date: 'c. 609–598 BC', chapters: 3,
    audience: 'Judah watching Babylon rise as a brutal world power while the righteous suffer.',
    occasion: 'A prophet\'s struggle with God\'s plan to use the more wicked Babylonians to punish less wicked Judah.',
    purpose: 'To model honest theological wrestling with God\'s ways and to arrive at faith in God\'s sovereignty over history.',
    bigIdea: 'The righteous shall live by faith, trusting God\'s sovereign plan even when evil appears to go unchecked.',
    overview: 'Habakkuk is a dialogue: the prophet complains (1:2–4), God responds (1:5–11), the prophet complains again more boldly (1:12–2:1), God responds with the vision (2:2–20), and the prophet concludes with a psalm of trembling trust (ch. 3). The movement from complaint to confidence is the whole arc. Habakkuk 2:4 ("the righteous shall live by his faith") is cited three times in the NT (Rom 1:17, Gal 3:11, Heb 10:38).',
    keyVerse: 'Hab 2:4 — "The righteous shall live by his faith."',
    themes: ['Faith amid injustice', 'God\'s sovereignty', 'Waiting on God'],
    preachingAdvice: 'Habakkuk is the most pastoral of the minor prophets for congregations experiencing cultural and political despair. The prophet\'s complaint is not faithlessness — God takes it seriously and answers. Chapter 3\'s closing declaration (3:17–19) — "Though the fig tree should not blossom... yet I will rejoice in the Lord" — is one of Scripture\'s greatest statements of faith stripped of all visible grounds for hope. Preach it as the destination after honest struggle, not as a starting point.' },
  { name: 'Zephaniah', abbr: 'Zeph', genre: 'Prophecy', author: 'Zephaniah', date: 'c. 640–625 BC', chapters: 3,
    audience: 'Judah under Josiah, before his reforms, when Manasseh\'s corruption still ran deep.',
    occasion: 'Judah\'s syncretism and pride — worshipping Baal alongside the Lord, assuming Josiah\'s politics would protect them.',
    purpose: 'To announce the Day of the Lord as total cosmic judgment while holding out the promise of a purified, humble remnant.',
    bigIdea: 'The Day of the Lord purges Jerusalem of pride but leaves a humble remnant whom God himself joyfully restores.',
    overview: 'Zephaniah opens with a stunning vision of total divine judgment — creation reversal, everything undone (1:2–3). The oracles of woe on Jerusalem and the nations follow. The pivot comes in 2:3: "Seek the Lord, all you humble of the land." Chapter 3 moves from indictment to restoration, culminating in 3:17 — God himself singing over his redeemed people. It is one of the OT\'s most tender divine portraits.',
    keyVerse: 'Zeph 3:17 — "He will rejoice over you with gladness; he will quiet you by his love."',
    themes: ['Day of the Lord', 'Remnant', 'God\'s joy over his people'],
    preachingAdvice: '3:17 is one of the most emotionally powerful texts in the Minor Prophets — God not merely tolerating his people but singing over them. Preach it with its full context: the God who sings is the same God who purged. The book\'s portrait of the "humble remnant" (2:3, 3:12) is searching: the people God keeps are the meek, not the powerful. Zephaniah pairs naturally with Revelation 7 (the great multitude) and Luke 15 (God\'s joy over the found).' },
  { name: 'Haggai', abbr: 'Hag', genre: 'Prophecy', author: 'Haggai', date: 'c. 520 BC', chapters: 2,
    audience: 'The returned exiles in Jerusalem who had stopped rebuilding the temple to focus on their own houses.',
    occasion: 'Sixteen years after the return, the temple foundation lay incomplete while the people\'s priorities had drifted.',
    purpose: 'To call the community to finish the temple as the visible center of restored covenant life and worship.',
    bigIdea: 'God calls his returned exiles to prioritize rebuilding his temple as the visible evidence of covenant restoration.',
    overview: 'Haggai is four brief messages delivered over four months in 520 BC, precisely dated. The first calls for temple rebuilding (1:1–15). The second assures that the new temple\'s future glory will surpass Solomon\'s (2:1–9). The third explains why the community\'s crops have failed — unholiness is contagious (2:10–19). The fourth is a messianic oracle to Zerubbabel (2:20–23). The temple is completed four years later in 516 BC.',
    keyVerse: 'Hag 2:9 — "The latter glory of this house shall be greater than the former."',
    themes: ['Temple priority', 'Covenant renewal', 'Messianic expectation'],
    preachingAdvice: 'Haggai\'s first message is the diagnostic question for any drifted community: "Is it a time for you to dwell in your paneled houses while this house lies in ruins?" (1:4). Apply it to whatever the congregation has allowed to atrophy while prioritizing personal comfort. The "consider your ways" refrain (1:5, 7) is an invitation to honest self-examination. 2:9\'s "latter glory" is ultimately fulfilled in the temple of Jesus\'s body (John 2:19–21).' },
  { name: 'Zechariah', abbr: 'Zech', genre: 'Prophecy', author: 'Zechariah', date: 'c. 520–480 BC', chapters: 14,
    audience: 'The returned exiles in Jerusalem, discouraged by the gap between glorious prophetic promises and modest post-exilic reality.',
    occasion: 'Temple rebuilding was stalled; the community needed renewed vision of what God was doing in history.',
    purpose: 'To encourage the builders with visions of cosmic restoration centered on a coming King-Priest who will reign and cleanse his people.',
    bigIdea: 'Visions of cosmic restoration center on a coming King-Priest who will cleanse and reign over his people forever.',
    overview: 'Zechariah divides into eight night visions (chs. 1–6), two messages on fasting (chs. 7–8), and two apocalyptic oracles (chs. 9–14). The visions are dense and symbolic: the four horsemen, the high priest Joshua\'s cleansing, the lampstand, the flying scroll. The messianic passages in the second half are extraordinary: the humble king on a donkey (9:9), the one they pierced (12:10), the shepherd struck (13:7 — cited at Gethsemane), and the final battle and kingdom (ch. 14).',
    keyVerse: 'Zech 9:9 — "Behold, your king is coming to you; righteous and having salvation is he."',
    themes: ['Messianic king', 'Spiritual cleansing', 'Cosmic victory'],
    preachingAdvice: 'Zechariah is second only to Isaiah in NT messianic citations — Matthew\'s passion narrative draws on it repeatedly. 9:9 (Palm Sunday), 11:12–13 (thirty pieces of silver), 12:10 (they look on the one they pierced), 13:7 (strike the shepherd) — all are fulfilled in the passion. Preach these in Holy Week context with enormous power. The night visions (chs. 1–6) require patience but reward it: they map God\'s cosmic supervision of post-exilic history.' },
  { name: 'Malachi', abbr: 'Mal', genre: 'Prophecy', author: 'Malachi', date: 'c. 460–430 BC', chapters: 4,
    audience: 'Post-exilic Judah grown cynical after the return — priests offering blemished sacrifices, people withholding tithes, men divorcing their wives.',
    occasion: 'The disillusionment of a community that expected glorious restoration and got hard circumstances instead.',
    purpose: 'To confront covenant mediocrity, call for genuine repentance, and point toward the forerunner who will prepare for the Lord\'s coming.',
    bigIdea: 'God confronts his people\'s half-hearted worship and calls them to covenant faithfulness as they await the forerunner.',
    overview: 'Malachi is structured as six disputations — God makes a charge, the people object, God responds. Topics include: God\'s love for Israel (1:1–5), priests\' corrupt offerings (1:6–2:9), covenant faithlessness in marriage and divorce (2:10–16), the coming messenger and refiner\'s fire (2:17–3:5), robbing God of tithes (3:6–12), and the arrogance of the faithless versus the reward of the faithful (3:13–4:6). The book ends the OT with a promise of Elijah before the Day of the Lord — fulfilled in John the Baptist.',
    keyVerse: 'Mal 3:1 — "Behold, I send my messenger, and he will prepare the way before me."',
    themes: ['Covenant faithfulness', 'Half-hearted worship', 'Coming forerunner'],
    preachingAdvice: 'Malachi speaks directly to comfortable, post-revival Christianity that maintains the forms of faith without the fire. The "bringing blemished offerings" charge (1:8) applies to any community that gives God its leftovers. The tithing passage (3:10) is often misapplied as a fundraising text — in context it is a call to trust God\'s provision. The book closes the OT canon pointing forward: 400 years of silence until the forerunner arrives. Preach it in Advent as the final note before the dawn.' },
]

const NT_BOOKS: Book[] = [
  { name: 'Matthew', abbr: 'Matt', genre: 'Gospel', author: 'Matthew (Levi)', date: 'c. AD 50–70', chapters: 28,
    audience: 'Jewish Christians and Jewish inquirers who needed to see Jesus as the fulfillment of Israel\'s entire story.',
    occasion: 'The post-resurrection community needed a catechetical Gospel rooted in OT fulfillment for Jewish-Christian dialogue.',
    purpose: 'To demonstrate that Jesus is the Messiah-King who fulfills Torah, prophets, and Psalms, and to commission the church for global mission.',
    bigIdea: 'Jesus is the promised Messiah-King who fulfills Israel\'s entire story and establishes the kingdom of heaven.',
    overview: 'Matthew is the most Jewish Gospel, structured around five great discourses (like the five books of Moses): the Sermon on the Mount (chs. 5–7), Mission Discourse (ch. 10), Parables of the Kingdom (ch. 13), Community Discourse (ch. 18), and Olivet Discourse (chs. 24–25). The "fulfillment formula" ("this was to fulfill what was spoken") appears 10+ times. Jesus is the new Moses, new Israel, and new David. The Great Commission closes the book: make disciples of all nations.',
    keyVerse: 'Matt 28:18 — "All authority in heaven and on earth has been given to me."',
    themes: ['Jesus as Messiah', 'Kingdom of heaven', 'Fulfillment of Scripture'],
    preachingAdvice: 'The Sermon on the Mount (chs. 5–7) is the most preached and most misunderstood section — it is not a new law for earning favor but the character of kingdom citizens. The "but I say to you" antitheses show Jesus interpreting Torah with sovereign authority. Matthew\'s parables of the kingdom (ch. 13) reward extended series preaching. Always trace the OT echoes — they are intentional and dense. The birth narrative (chs. 1–2) with its four women in the genealogy is a remarkable opener.' },
  { name: 'Mark', abbr: 'Mark', genre: 'Gospel', author: 'John Mark', date: 'c. AD 55–65', chapters: 16,
    audience: 'Gentile Christians in Rome (or broadly in the Roman world) facing persecution under Nero.',
    occasion: 'A persecuted church needed to see the suffering Jesus clearly — who he was and why his death was victory, not defeat.',
    purpose: 'To present Jesus as the authoritative Son of God whose service and sacrifice define the shape of true power.',
    bigIdea: 'Jesus is the powerful Son of God who came not to be served but to give his life as a ransom for many.',
    overview: 'Mark is the shortest, most urgent Gospel — "immediately" (euthys) appears 40+ times. It divides at 8:29 (Peter\'s confession): the first half asks "Who is Jesus?" and the second answers "What must he do?" Jesus\'s identity is revealed to demons and disciples but hidden from religious leaders (the "messianic secret"). The passion narrative (chs. 14–16) is disproportionately long — Mark is essentially a passion story with an extended introduction.',
    keyVerse: 'Mark 10:45 — "For even the Son of Man came not to be served but to serve, and to give his life as a ransom for many."',
    themes: ['Servant kingship', 'Urgency', 'Messianic secret'],
    preachingAdvice: 'Mark is the fastest-paced Gospel and preaches with cinematic energy. The structure (identity → mission → passion) is theologically important: you cannot understand why he dies without knowing who he is. The sandwiched or intercalated stories (A-B-A structure, e.g., fig tree around temple cleansing) are intentional literary devices. The disciples\' repeated failure to understand is a mirror for the congregation. Mark 8:34–38 (take up your cross) is the pivot of the whole Gospel.' },
  { name: 'Luke', abbr: 'Luke', genre: 'Gospel', author: 'Luke', date: 'c. AD 60–80', chapters: 24,
    audience: 'Theophilus and a broader Gentile audience, possibly including potential converts and patrons of the early church.',
    occasion: 'A carefully researched historical account to confirm the reliability of what Theophilus had been taught about Jesus.',
    purpose: 'To show Jesus as the universal Savior who reverses the world\'s social order, bringing good news especially to the poor and excluded.',
    bigIdea: 'Jesus is the Savior of all people—especially the poor and marginalized—who inaugurates the year of the Lord\'s favor.',
    overview: 'Luke is the longest Gospel and the first part of a two-volume work (Luke-Acts). It is distinctive for: the birth narrative from Mary\'s perspective, the prominence of women, the poor, outcasts, and Samaritans, and an emphasis on prayer and the Holy Spirit. The travel narrative (9:51–19:44) is the longest single section, filled with unique parables (Good Samaritan, Prodigal Son, Rich Man and Lazarus). The resurrection appearances are in Jerusalem, setting up Acts.',
    keyVerse: 'Luke 19:10 — "The Son of Man came to seek and to save the lost."',
    themes: ['Universal salvation', 'The poor & outsiders', 'Joyful reversal'],
    preachingAdvice: 'Luke\'s unique parables are some of Scripture\'s greatest preaching texts — the Prodigal Son (ch. 15), the Good Samaritan (ch. 10), the Pharisee and Tax Collector (ch. 18). The theme of reversal (the Magnificat, the Beatitudes, the great reversal of 16:19–31) is persistent and prophetically challenging to comfortable congregations. Women play a striking role throughout — note them. The travel narrative\'s sustained focus on the cost of discipleship (9:51–62, 14:25–33) is essential for preaching commitment.' },
  { name: 'John', abbr: 'John', genre: 'Gospel', author: 'John the Apostle', date: 'c. AD 85–95', chapters: 21,
    audience: 'A mixed audience of believers needing deeper Christological grounding and inquirers in a Greek-speaking world.',
    occasion: 'Likely written to address Docetic tendencies (denying Christ\'s humanity) and to deepen the faith of established believers.',
    purpose: 'To prove through carefully selected signs and discourses that Jesus is the incarnate Son of God, so that readers may believe and have life.',
    bigIdea: 'Jesus is the eternal Word and Son of God whose signs reveal his identity so that believers may have eternal life.',
    overview: 'John is structurally unique: a prologue (1:1–18), the Book of Signs (1:19–12:50) featuring seven miraculous signs with accompanying discourses, the Book of Glory (chs. 13–21) focused on the Last Supper discourse and passion. The seven I AM sayings (bread of life, light of the world, gate, good shepherd, resurrection, way/truth/life, vine) are unique to John. Chapters 14–17 (the Upper Room Discourse and High Priestly Prayer) are theologically the deepest ground in the Gospels.',
    keyVerse: 'John 20:31 — "These are written so that you may believe that Jesus is the Christ, the Son of God."',
    themes: ['Believe & eternal life', 'I AM sayings', 'Signs'],
    preachingAdvice: 'The I AM sayings are the richest preaching territory in John — each one is a claim to deity (echoing Exodus 3:14) and a self-description of what Jesus gives. Preach them with the OT background: I am the bread from heaven (manna), I am the light (pillar of fire), I am the good shepherd (Ps 23, Ezek 34). The "hour" motif (his appointed time of glory) runs through the Gospel. John 3, 6, 10, 14–17, and 21 are the great standalone chapters.' },
  { name: 'Acts', abbr: 'Acts', genre: 'Historical Narrative', author: 'Luke', date: 'c. AD 62–70', chapters: 28,
    audience: 'Theophilus and the broader church needing to understand how the risen Jesus\'s mission continued through the Spirit.',
    occasion: 'The church\'s explosive expansion from Jerusalem to Rome needed theological interpretation and historical documentation.',
    purpose: 'To show that the risen Christ continues his work through the Spirit-empowered church as the gospel moves to the ends of the earth.',
    bigIdea: 'The risen Jesus continues his work through the Spirit-empowered church as the gospel advances to the ends of the earth.',
    overview: 'Acts is structured by the 1:8 outline (Jerusalem → Judea and Samaria → ends of the earth), tracing the gospel\'s geographic and ethnic expansion. Peter dominates the first half (chs. 1–12), Paul the second (chs. 13–28). Key transitional moments: Pentecost (ch. 2), Philip and the Ethiopian (ch. 8), Cornelius (ch. 10), the Jerusalem Council (ch. 15). Paul\'s missionary journeys (chs. 13–28) end with him in Rome, the book\'s geographical goal, preaching "with all boldness and without hindrance."',
    keyVerse: 'Acts 1:8 — "You will be my witnesses in Jerusalem and in all Judea and Samaria, and to the end of the earth."',
    themes: ['Spirit-powered mission', 'Gospel to Gentiles', 'Church expansion'],
    preachingAdvice: 'Acts is most productively preached as a narrative theology of mission rather than a church-growth manual. The Spirit is the real protagonist — note every occurrence. The church in Acts is not a model to replicate in every detail but a witness to what the risen Jesus does when his people are yielded to the Spirit. The speeches (Peter\'s in chs. 2–3, Stephen\'s in ch. 7, Paul\'s in chs. 13, 17) are great models of contextual gospel proclamation.' },
  { name: 'Romans', abbr: 'Rom', genre: 'Epistle', author: 'Paul', date: 'c. AD 57', chapters: 16,
    audience: 'The mixed Jewish-Gentile church in Rome, possibly riven by tension after Claudius\'s expulsion of Jews (AD 49) and their return.',
    occasion: 'Paul wrote before visiting Rome to introduce himself, lay out his gospel, and address the Jew-Gentile tensions in the Roman church.',
    purpose: 'To expound the gospel of God\'s righteousness that justifies both Jew and Gentile by faith and produces a united, Spirit-filled community.',
    bigIdea: 'The gospel reveals God\'s righteousness—justifying sinners by faith alone and uniting Jew and Gentile in one body.',
    overview: 'Romans is Paul\'s most systematic theological letter, moving from universal condemnation (1:18–3:20) through justification by faith (3:21–5:21) to new life in the Spirit and assurance (chs. 6–8) to the mystery of Israel\'s salvation (chs. 9–11) to practical community ethics (chs. 12–16). Chapter 8 is arguably the most comprehensive single chapter in the NT on the Christian life. Chapters 9–11 are the most sustained NT treatment of Israel\'s place in God\'s plan.',
    keyVerse: 'Rom 1:17 — "The righteousness of God is revealed from faith for faith... the righteous shall live by faith."',
    themes: ['Justification by faith', 'Jew & Gentile unity', 'Life in the Spirit'],
    preachingAdvice: 'Romans rewards preaching in sustained series — the argument builds and must not be chopped into disconnected units. Chapter 8 alone can sustain a multi-week series. The neglected sections are 9–11 (too theologically complex, people think) and 12–16 (too practical, people think) — both are essential. Romans 12:1–2 is the hinge between doctrine and ethics: the transformed mind. Don\'t reduce chs. 1–3 to an evangelistic tool; they are a theological argument with Israel\'s scriptures.' },
  { name: '1 Corinthians', abbr: '1 Cor', genre: 'Epistle', author: 'Paul', date: 'c. AD 55', chapters: 16,
    audience: 'The divided, charismatic, socially stratified church at Corinth — a Roman colony and major port city.',
    occasion: 'Factions, lawsuits, sexual immorality, disputes about idol food, charismatic disorder, and questions about the resurrection required urgent apostolic address.',
    purpose: 'To reorient a church that had absorbed Greek cultural values above the cross by applying the theology of the crucified Christ to every division and disorder.',
    bigIdea: 'The cross-shaped wisdom of God confronts every form of worldly division, pride, and disorder in the church.',
    overview: 'Paul responds to two sources: Chloe\'s household report (factions, immorality) and a letter from the Corinthians (idol food, marriage, spiritual gifts, the resurrection). The cross as God\'s wisdom (1:18–2:5) is Paul\'s foundation for everything. Major topics: factions and church loyalty (chs. 1–4), sexual ethics (chs. 5–7), idol food and freedom (chs. 8–10), worship order and Lord\'s Supper (chs. 11–14), and the resurrection as the gospel\'s essential claim (ch. 15).',
    keyVerse: '1 Cor 1:18 — "The word of the cross is folly to those who are perishing, but to us who are being saved it is the power of God."',
    themes: ['Cross as wisdom', 'Church unity', 'Resurrection hope'],
    preachingAdvice: '1 Corinthians is the most situationally concrete of Paul\'s letters — every section is responding to real people doing real things wrong. Chapter 13 is not a generic love hymn; it is a rebuke of charismatic pride. Chapter 15 (the resurrection) is one of the NT\'s most logically structured arguments and is essential preaching for the gospel\'s content. The spiritual gifts chapters (12–14) require care: they address excess, not absence, of charismatic expression.' },
  { name: '2 Corinthians', abbr: '2 Cor', genre: 'Epistle', author: 'Paul', date: 'c. AD 56', chapters: 13,
    audience: 'The Corinthian church after a painful visit and a severe letter — a community that has partially reconciled with Paul.',
    occasion: 'False apostles had invaded Corinth, demanding letters of recommendation and attacking Paul\'s apostolic credibility based on his weakness and suffering.',
    purpose: 'To defend Paul\'s gospel ministry by demonstrating that weakness and suffering are the marks of genuine apostolic ministry, not its disqualifications.',
    bigIdea: 'Paul\'s ministry of weakness and suffering displays the surpassing power of God in the new covenant.',
    overview: '2 Corinthians is the most emotionally raw of Paul\'s letters — apology, self-defense, joy, grief, and irony interweave. The "suffering apostle" theme runs throughout: treasure in jars of clay (4:7), ministry in weakness (11:16–12:10), the thorn in the flesh (12:7–10). The "boasting" section (chs. 10–13) is biting irony: Paul "boasts" in sufferings and weakness, subverting the false apostles\' claims to impressive credentials.',
    keyVerse: '2 Cor 12:9 — "My grace is sufficient for you, for my power is made perfect in weakness."',
    themes: ['Weakness & power', 'New covenant ministry', 'Generosity'],
    preachingAdvice: 'This is Paul\'s most vulnerable letter and the most honest about ministry\'s cost. It is ideal for preaching to pastors and ministry workers. The "jars of clay" passage (4:7–18) is one of the most pastorally powerful texts in the NT. The generosity chapters (8–9) use the Macedonians\' sacrificial giving as a model — they are motivated by the "grace of our Lord Jesus Christ" (8:9), not guilt. Don\'t separate these chapters from their theological ground.' },
  { name: 'Galatians', abbr: 'Gal', genre: 'Epistle', author: 'Paul', date: 'c. AD 48–49 or 55', chapters: 6,
    audience: 'The churches of Galatia (a Roman province in modern Turkey) who were being pressured to accept circumcision for full standing before God.',
    occasion: 'Judaizing teachers were insisting that faith in Christ plus Torah observance (especially circumcision) was the complete gospel.',
    purpose: 'To defend the gospel of justification by faith alone and to liberate believers from any addition to the completed work of Christ.',
    bigIdea: 'Justification is by faith in Christ alone, and any addition to the gospel destroys it entirely.',
    overview: 'Galatians is Paul\'s most polemical letter, written in urgent heat. No thanksgiving opener — he moves immediately to "I am astonished." He defends his apostolic authority and the gospel\'s independent divine origin (chs. 1–2), argues that the Abrahamic covenant preceded and overrides the Mosaic law (chs. 3–4), and calls the Galatians to freedom and Spirit-led ethics (chs. 5–6). The "fruit of the Spirit" (5:22–23) is the ethical result of justification, not its basis.',
    keyVerse: 'Gal 2:20 — "I have been crucified with Christ. It is no longer I who live, but Christ who lives in me."',
    themes: ['Justification by faith', 'Freedom from law', 'Gospel defense'],
    preachingAdvice: 'Galatians is the Magna Carta of Christian freedom — preach it as such, not as a theoretical argument. Paul\'s fury is pastoral: the Galatians are being robbed of the gospel. The Abraham argument (chs. 3–4) requires knowing the Abrahamic covenant; preach it with Genesis 15. 5:1 ("For freedom Christ has set us free") is the thesis of the practical section. The fruit of the Spirit (5:22–23) is singular — "fruit," not "fruits" — a unified character, not a checklist.' },
  { name: 'Ephesians', abbr: 'Eph', genre: 'Epistle', author: 'Paul', date: 'c. AD 60–62', chapters: 6,
    audience: 'Possibly a circular letter to churches in the Ephesus region — the least situationally specific of Paul\'s letters.',
    occasion: 'Written from prison (a "prison epistle"), possibly to encourage churches in their cosmic identity and unity.',
    purpose: 'To reveal God\'s eternal plan to unite all things in Christ, with the diverse church as the display of his wisdom to the cosmos.',
    bigIdea: 'God\'s eternal plan unites Jew and Gentile in Christ as one body to display his wisdom to the cosmos.',
    overview: 'Ephesians divides neatly: doctrine (chs. 1–3) and ethics (chs. 4–6), connected by "therefore" (4:1). The doctrinal section is a soaring exposition of election, adoption, redemption, and the mystery of Jew-Gentile unity in one body. Paul\'s two prayers (1:15–23, 3:14–21) are among his greatest. The ethical section covers church unity, new humanity, households, and the spiritual armor of God (6:10–18).',
    keyVerse: 'Eph 2:8–9 — "For by grace you have been saved through faith. And this is not your own doing; it is the gift of God."',
    themes: ['Unity in Christ', 'Spiritual blessings', 'Church as body'],
    preachingAdvice: 'The "blessed be the God" passage (1:3–14) is one of Paul\'s most compressed theological texts — slow down. The two prayers (1:15–23, 3:14–21) are excellent models for pastoral intercession. The Jew-Gentile "one new man" language (2:14–16) has more than cultural diversity in view — it is cosmic reconciliation. The armor of God passage (6:10–18) is often preached atomistically; preach it in context: the church stands together in spiritual warfare, not individuals in isolation.' },
  { name: 'Philippians', abbr: 'Phil', genre: 'Epistle', author: 'Paul', date: 'c. AD 60–62', chapters: 4,
    audience: 'The beloved church at Philippi — Paul\'s first European church plant, marked by generosity and partnership.',
    occasion: 'Paul writes from prison to thank the Philippians for their financial support and to address internal tensions and anxiety.',
    purpose: 'To model and call for joy, unity, and the Christlike humility that grounds both, even in suffering.',
    bigIdea: 'The mind of Christ—self-emptying service—is the pattern for joy, unity, and gospel partnership.',
    overview: 'Philippians is the "joy letter" — "joy" or "rejoice" appears 16 times in four chapters written from prison. The Christ hymn (2:5–11) is the theological centerpiece, calling believers to the same self-emptying humility that characterized Christ\'s incarnation. Paul\'s situation — chains, possible death — is the proving ground for everything he preaches. The Euodias-Syntyche conflict (4:2) shows the letter has a specific pastoral problem to address.',
    keyVerse: 'Phil 4:7 — "The peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus."',
    themes: ['Joy in suffering', 'Humility of Christ', 'Gospel partnership'],
    preachingAdvice: 'The Christ hymn (2:5–11) is one of the most important christological texts in the NT — it traces Christ\'s descent and exaltation and grounds ethics in theology. Preach 2:1–11 as a unity: the call to unity (vv.1–4) grounded in the example of Christ (vv.5–11). Paul\'s contentment passage (4:11–13) is one of the most misquoted — "I can do all things through Christ" in context is about contentment in any circumstance, not general success empowerment.' },
  { name: 'Colossians', abbr: 'Col', genre: 'Epistle', author: 'Paul', date: 'c. AD 60–62', chapters: 4,
    audience: 'The church at Colossae, a small city in Asia Minor Paul had never visited, founded by Epaphras.',
    occasion: 'A "Colossian philosophy" (combining Jewish food laws, asceticism, angel worship, and cosmic speculation) was threatening Christ\'s supremacy.',
    purpose: 'To establish the absolute supremacy and sufficiency of Christ over all powers, philosophies, and religious systems.',
    bigIdea: 'Christ is the fullness of deity and head of all creation—sufficient and supreme for all of life and salvation.',
    overview: 'Colossians centers on two christological passages: 1:15–20 (the cosmic Christ hymn) and 2:9–15 (the fullness of deity). Against the false teaching\'s complex religious system, Paul\'s answer is simple: Christ is the image of the invisible God, the firstborn over all creation, the one in whom the fullness of deity dwells bodily. The practical section (chs. 3–4) grounds ethics in the "above" realities — set your mind on things above.',
    keyVerse: 'Col 1:18 — "He is the head of the body, the church. He is the beginning, the firstborn from the dead."',
    themes: ['Supremacy of Christ', 'Against false teaching', 'New life in Christ'],
    preachingAdvice: 'Colossians is the answer to every religious system that wants to add to Christ. The 1:15–20 hymn is one of the NT\'s highest Christology passages and deserves sustained exposition. "Let no one disqualify you" (2:18) and "shadow vs. substance" (2:17) are the hermeneutical keys to applying Colossians today — identify what in your cultural context claims to supplement Christ. The "household code" (3:18–4:1) is set within a broader theology of the "new self" (3:10–11).' },
  { name: '1 Thessalonians', abbr: '1 Thess', genre: 'Epistle', author: 'Paul', date: 'c. AD 50–51', chapters: 5,
    audience: 'The young church at Thessalonica — a major port city in Macedonia — facing persecution shortly after Paul\'s departure.',
    occasion: 'Paul had been forced to leave Thessalonica abruptly and was anxious about their survival under persecution; he also needed to address grief over believers who had died before Christ\'s return.',
    purpose: 'To encourage a persecuted young church, affirm their faith and love, and instruct them about the return of Christ and holy living.',
    bigIdea: 'The return of Christ grounds comfort, holiness, and perseverance in the face of suffering and death.',
    overview: '1 Thessalonians is one of Paul\'s earliest letters. The first three chapters are warm pastoral memoir — how they received the gospel, Paul\'s love for them, Timothy\'s good report. Chapters 4–5 shift to instruction: sexual holiness (4:1–8), brotherly love (4:9–12), the resurrection and parousia (4:13–5:11), and community life (5:12–22). The resurrection passage (4:13–18) is Paul\'s most detailed NT treatment of what happens to believers who die before Christ returns.',
    keyVerse: '1 Thess 4:16–17 — "The Lord himself will descend from heaven... and we will always be with the Lord."',
    themes: ['Second coming', 'Comfort in grief', 'Holiness'],
    preachingAdvice: '4:13–18 is a pastoral text above all — preach it at funerals and to grieving congregations. The language of "those who sleep" and the assurance that they are not lost is the heart of it. 5:16–18 ("Rejoice always, pray without ceasing, give thanks in all circumstances") is a compressed description of the Spirit-filled life, not a list of three commands. Preach the eschatology not as speculation but as motivation: the returning Lord shapes how we live now.' },
  { name: '2 Thessalonians', abbr: '2 Thess', genre: 'Epistle', author: 'Paul', date: 'c. AD 51', chapters: 3,
    audience: 'The same Thessalonian church, now troubled by false claims that the Day of the Lord had already come, and some members had stopped working.',
    occasion: 'Someone had apparently forged a letter in Paul\'s name claiming the Day of the Lord was present, causing panic and idleness.',
    purpose: 'To correct the false eschatology, provide a framework of events before the Day of the Lord, and call for steady work and faithfulness.',
    bigIdea: 'The Day of the Lord has not yet come—stand firm in revealed truth and work faithfully while waiting.',
    overview: 'Paul corrects the eschatological error by describing events that must precede the Day of the Lord: the apostasy and the revelation of the "man of lawlessness" (2:1–12). He grounds their steadfastness in divine election (2:13–17) and closes with prayer and community instruction — notably the command to work and not to be idle (3:6–15), which appears to address those who stopped working because of misguided eschatological excitement.',
    keyVerse: '2 Thess 2:15 — "Stand firm and hold to the traditions that you were taught by us."',
    themes: ['Day of the Lord', 'Steadfastness', 'Work ethic'],
    preachingAdvice: 'The "man of lawlessness" passage (2:1–12) is notoriously debated — be honest about the interpretive uncertainty and focus on what is clear: something restrains the full manifestation of evil, and Christ will ultimately destroy it. The work ethic instruction (3:6–15) is remarkable in an eschatological letter: the return of Christ is a reason to work harder, not less. Preach it against both speculative escapism and idleness dressed up as "waiting on God."' },
  { name: '1 Timothy', abbr: '1 Tim', genre: 'Pastoral Epistle', author: 'Paul', date: 'c. AD 62–65', chapters: 6,
    audience: 'Timothy, Paul\'s young co-worker left to lead the church at Ephesus against false teachers.',
    occasion: 'False teachers promoting speculative Torah interpretation were causing division and undermining proper church order.',
    purpose: 'To instruct Timothy in sound doctrine, proper worship, leadership qualifications, and community care so the church functions as God\'s household.',
    bigIdea: 'Paul instructs Timothy in sound doctrine, godly leadership, and ordered worship in God\'s household.',
    overview: '1 Timothy addresses specific Ephesian problems: the false teachers (1:3–20), instructions on prayer and gender in worship (ch. 2), qualifications for overseers and deacons (ch. 3), Timothy\'s personal conduct against false asceticism (ch. 4), care for widows and elders (ch. 5), and the danger of wealth (ch. 6). The controlling metaphor is the church as "God\'s household" (3:15) — order, care, and truthful teaching characterize a well-run household.',
    keyVerse: '1 Tim 4:12 — "Let no one despise you for your youth, but set the believers an example."',
    themes: ['Sound doctrine', 'Church order', 'Godly leadership'],
    preachingAdvice: 'The elder/deacon qualifications (ch. 3) are best preached not as a checklist but as a portrait of mature Christian character — the church is to be led by people who have already demonstrated the Christian life at home and in public. The wealth warning (6:6–19) is direct and countercultural. The gender and worship passage (2:11–15) is one of the most disputed in the NT — preach it with exegetical honesty about the interpretive options without dodging its claims.' },
  { name: '2 Timothy', abbr: '2 Tim', genre: 'Pastoral Epistle', author: 'Paul', date: 'c. AD 67', chapters: 4,
    audience: 'Timothy, and through him every pastor, elder, and gospel minister facing discouragement, opposition, and personal cost.',
    occasion: 'Paul\'s final letter, written from a second Roman imprisonment expecting execution — his farewell charge to his closest co-worker.',
    purpose: 'To call Timothy to guard the gospel, endure suffering, maintain faithful proclamation, and pass the truth to the next generation.',
    bigIdea: 'Paul charges Timothy to guard and pass on the gospel regardless of opposition, suffering, or personal cost.',
    overview: '2 Timothy is Paul\'s testament — written in the shadow of death (4:6–8). Four themes weave throughout: suffering as the shape of ministry, the sufficiency of Scripture, the danger of false teaching, and the call to faithful succession. The Scripture passage (3:16–17) is set in the context of pastoral ministry, not abstract doctrinal affirmation. Paul\'s personal farewell (4:6–22) is among the most moving in all literature.',
    keyVerse: '2 Tim 4:7 — "I have fought the good fight, I have finished the race, I have kept the faith."',
    themes: ['Gospel preservation', 'Endurance', 'Scripture\'s sufficiency'],
    preachingAdvice: 'This is the letter every minister needs to return to regularly — it is a theology of pastoral endurance. 3:16–17 ("all Scripture is breathed out by God") is best preached in its full context: Scripture equips the pastor for ministry, not merely establishes inerrancy abstractly. The "entrust to faithful men who will teach others also" (2:2) is a four-generation succession vision. The final chapter\'s loneliness ("only Luke is with me") is honest and pastoral.' },
  { name: 'Titus', abbr: 'Titus', genre: 'Pastoral Epistle', author: 'Paul', date: 'c. AD 63–65', chapters: 3,
    audience: 'Titus, left on Crete to appoint elders and correct false teachers in a culturally challenging environment.',
    occasion: 'The Cretan church needed solid leadership structure and doctrinal grounding against Jewish-influenced false teachers.',
    purpose: 'To instruct Titus in appointing qualified elders and to show how sound doctrine transforms every demographic of community life.',
    bigIdea: 'Sound doctrine produces transformed community that adorns the gospel in every social context.',
    overview: 'Titus is the most compressed of the Pastoral Epistles. It moves from elder qualifications (1:5–9) through rebuking false teachers (1:10–16) to instructions for every demographic — older men, older women, younger women, younger men, slaves (2:1–10) — under the theological banner of 2:11–14 (the grace of God trains us). Chapter 3 grounds community ethics in the gospel of regeneration.',
    keyVerse: 'Titus 2:11–12 — "The grace of God has appeared... training us to renounce ungodliness."',
    themes: ['Doctrine & life', 'Godly community', 'Good works'],
    preachingAdvice: '2:11–14 is one of Paul\'s most concise gospel summaries — grace appears, grace trains, grace awaits consummation. Preach it as the engine of the entire letter\'s ethics. The phrase "adorn the doctrine of God our Savior" (2:10) is a remarkable vision: the community\'s transformed life makes the gospel beautiful and persuasive. 3:4–7 is another compressed gospel statement worth full exposition.' },
  { name: 'Philemon', abbr: 'Phlm', genre: 'Epistle', author: 'Paul', date: 'c. AD 60–62', chapters: 1,
    audience: 'Philemon, a wealthy Colossian believer and slave-owner whose runaway slave Onesimus has been converted under Paul.',
    occasion: 'Onesimus escaped (possibly having taken some of Philemon\'s property), encountered Paul in prison, was converted, and is now being sent back.',
    purpose: 'To appeal for Onesimus\'s reception as a brother in Christ and implicitly for his freedom — without commanding it, relying instead on gospel-shaped love.',
    bigIdea: 'The gospel breaks every social barrier as Paul appeals for Onesimus to be received as a brother in Christ.',
    overview: 'Philemon is Paul\'s shortest and most personal letter — 25 verses, one chapter, addressed to an individual. Paul\'s rhetorical strategy is masterful: he establishes relationship, expresses confidence, makes the appeal as a prisoner, leverages Philemon\'s debt to Paul, and leaves the decision to Philemon\'s gospel-transformed conscience. The unstated but clear implication is that Christian brotherhood is incompatible with slavery between believers.',
    keyVerse: 'Phlm 16 — "No longer as a bondservant but better than a bondservant, as a dear brother."',
    themes: ['Gospel & social barriers', 'Reconciliation', 'Christian appeal'],
    preachingAdvice: 'Philemon is a one-sermon book but a remarkable one. Paul never condemns slavery directly, which bothers modern readers — but the logic of verse 16 ("no longer as a slave but as a dear brother") is socially revolutionary. Preach it as a picture of how the gospel works: not coercion but appeal to transformed conscience. This is the NT\'s most explicit engagement with the social institution of slavery and it points toward abolition without legislating it.' },
  { name: 'Hebrews', abbr: 'Heb', genre: 'Epistle', author: 'Unknown', date: 'c. AD 60–70', chapters: 13,
    audience: 'Jewish Christians under pressure, possibly facing persecution, and tempted to return to the religious safety of Judaism.',
    occasion: 'The recipients were in danger of "drifting away" (2:1), neglecting so great a salvation, and potentially apostatizing back to Judaism.',
    purpose: 'To demonstrate Christ\'s superiority to every element of Judaism — angels, Moses, the Levitical priesthood, and the old covenant — and to call for persevering faith.',
    bigIdea: 'Jesus is the final and superior High Priest, sacrifice, and covenant—so hold fast and don\'t turn back.',
    overview: 'Hebrews is a "word of exhortation" (13:22) — a sermon. It moves through a series of "better" comparisons: Christ is better than angels (chs. 1–2), better than Moses (ch. 3), offers a better rest (ch. 4), a better high priesthood after Melchizedek\'s order (chs. 5–7), a better covenant (ch. 8), a better sacrifice in a better sanctuary (chs. 9–10). Five warning passages (2:1–4, 3:7–4:13, 5:11–6:12, 10:26–31, 12:25–29) punctuate the exposition.',
    keyVerse: 'Heb 4:16 — "Let us then with confidence draw near to the throne of grace."',
    themes: ['Supremacy of Christ', 'New covenant', 'Endurance in faith'],
    preachingAdvice: 'Hebrews is best preached in extended series — the argument is cumulative and each section requires the previous. The warning passages are serious and should not be softened; they are pastoral, not merely doctrinal. The Melchizedek priesthood (chs. 5–7) is strange but crucial: Christ is a priest of an entirely different order than Levi, making the Levitical system provisional from the start. Chapter 11 (the faith gallery) is best preached as a unit that defines faith by example rather than definition.' },
  { name: 'James', abbr: 'Jas', genre: 'Epistle', author: 'James (brother of Jesus)', date: 'c. AD 44–49', chapters: 5,
    audience: 'Jewish Christians of the Diaspora — possibly poor believers being exploited by wealthy landowners in their congregations.',
    occasion: 'A community where faith-talk was flourishing but faith-action — especially toward the poor — was not.',
    purpose: 'To insist that genuine, saving faith necessarily produces concrete works, especially justice toward the poor and control of speech.',
    bigIdea: 'Genuine faith is proved by the works it produces, especially in how the church treats the poor.',
    overview: 'James is the NT\'s wisdom letter — it reads more like Proverbs than Paul. Its topics include: trials and temptation (1:2–18), hearing and doing (1:19–27), favoritism toward the rich (2:1–13), faith and works (2:14–26), the tongue (3:1–12), worldly wisdom vs. heavenly wisdom (3:13–4:12), planning without God (4:13–17), rich oppressors (5:1–6), patience and prayer (5:7–20). Luther\'s complaint that James is "an epistle of straw" is misguided — James and Paul are answering different questions.',
    keyVerse: 'Jas 2:17 — "Faith by itself, if it does not have works, is dead."',
    themes: ['Faith & works', 'Wisdom', 'Care for the poor'],
    preachingAdvice: 'James is among the most practically applicable NT books for preaching — every topic connects directly to congregational life. The tongue passage (3:1–12) is withering and needed. The favoritism passage (2:1–13) confronts class-based church culture directly. The faith-works tension with Paul is not a contradiction: Paul argues against merit-earning works; James argues against faith that produces no transformation. Preach them as two sides of one complete picture.' },
  { name: '1 Peter', abbr: '1 Pet', genre: 'Epistle', author: 'Peter', date: 'c. AD 62–64', chapters: 5,
    audience: 'Dispersed Christians across Asia Minor, likely a mix of Jewish and Gentile believers experiencing social marginalization and persecution.',
    occasion: 'Believers were experiencing "fiery trials" — social ostracism, possible state hostility, and the challenge of maintaining identity as aliens in their own culture.',
    purpose: 'To ground persecuted exiles in their identity as God\'s elect people and to call them to holy, attractive living that may win unbelieving neighbors.',
    bigIdea: 'Suffering exiles are to live as holy strangers in the world, following Christ\'s example as they await his return.',
    overview: '1 Peter is a theology of exile. The controlling metaphor — "elect exiles" (1:1), "sojourners and exiles" (2:11) — sets the frame. Believers are to live beautifully in a hostile world not by accommodation but by distinctive holiness. The Christ-hymn in 2:21–25 (drawing on Isaiah 53) grounds the call to suffering endurance in Christ\'s own example. The "submit to every human institution" ethic (2:13–3:7) is part of the missionary strategy: give no legitimate offense.',
    keyVerse: '1 Pet 2:9 — "You are a chosen race, a royal priesthood, a holy nation, a people for his own possession."',
    themes: ['Suffering & holiness', 'Exile identity', 'Hope in Christ\'s return'],
    preachingAdvice: '2:9 is a direct application of Exodus 19:5–6 to the church — preach the OT background. The "exile" framework is extraordinarily relevant for churches experiencing post-Christendom cultural displacement. The suffering theology here (1:6–7, 4:12–19) is not masochism — it is a realistic and hope-filled account of how God refines his people and how suffering witnesses to the watching world. 3:15 ("always be prepared to give a reason for the hope in you") should be preached in its context of gentle, respectful engagement.' },
  { name: '2 Peter', abbr: '2 Pet', genre: 'Epistle', author: 'Peter', date: 'c. AD 65–68', chapters: 3,
    audience: 'The same broad audience as 1 Peter, now threatened by false teachers arising from within the community.',
    occasion: 'Internal false teachers were exploiting the community\'s freedom, denying the return of Christ, and distorting Paul\'s letters.',
    purpose: 'To call believers to grow in the knowledge of Christ, to expose false teachers, and to defend the certainty of Christ\'s return against mockers.',
    bigIdea: 'False teachers who distort the gospel will face judgment; stand firm in the knowledge of Christ.',
    overview: '2 Peter moves from the call to grow in virtue (ch. 1) through the exposure of false prophets drawn from OT examples (ch. 2) to the defense of Christ\'s return against those who use its delay as disproof (ch. 3). Chapter 1\'s "eyewitness" claim to the Transfiguration (1:16–18) grounds apostolic authority. Chapter 3\'s "with the Lord a day is as a thousand years" is about the patience of God\'s mercy, not a timeline formula.',
    keyVerse: '2 Pet 3:9 — "The Lord is not slow to fulfill his promise... not wishing that any should perish."',
    themes: ['False teaching', 'Judgment & patience', 'Scripture\'s authority'],
    preachingAdvice: 'The description of false teachers (ch. 2) is vivid and uncomfortable — they arose from within, exploit the congregation, and promise freedom while enslaving. Preach it as a realistic description of what spiritual manipulation looks like. 3:9 is one of Scripture\'s most tender statements of divine patience — preach it alongside the call to holiness (3:11–14). The reference to Paul\'s letters as "Scripture" (3:16) is important evidence for early canonical consciousness.' },
  { name: '1 John', abbr: '1 John', genre: 'Epistle', author: 'John the Apostle', date: 'c. AD 85–95', chapters: 5,
    audience: 'A community John knew personally, recently disrupted by a secession of members who had rejected the incarnation of Christ.',
    occasion: 'A proto-Gnostic group had left the community (2:19) claiming superior spiritual knowledge while denying Jesus had come in the flesh.',
    purpose: 'To provide tests of genuine faith — ethical (walking in the light), relational (loving the brothers), and doctrinal (confessing the incarnate Christ).',
    bigIdea: 'Assurance of eternal life comes to those who walk in the light, love one another, and confess Jesus as Christ in flesh.',
    overview: '1 John is structured around three repeated tests of authentic faith: confessing Christ\'s incarnation, loving fellow believers, and walking in righteousness. These cycle repeatedly rather than progressing linearly. "God is light" (1:5) and "God is love" (4:8, 16) are the two great theological declarations. The letter is pastoral assurance — "I write these things to you... that you may know that you have eternal life" (5:13).',
    keyVerse: '1 John 4:8 — "Anyone who does not love does not know God, because God is love."',
    themes: ['Assurance', 'Love as test', 'Incarnation'],
    preachingAdvice: 'The "tests of life" structure makes 1 John excellent for preaching on assurance of salvation — ground it in behavior and confession, not feeling. "God is love" (4:8) is the most distorted verse in popular Christianity; preach it in its full context: love is defined by the propitiation of the cross (4:10), not by affirming everything. The "if we confess our sins" passage (1:9) is for believers who sin, not an evangelistic formula. The fellowship (koinonia) language of the prologue is rich.' },
  { name: '2 John', abbr: '2 John', genre: 'Epistle', author: 'John the Apostle', date: 'c. AD 85–95', chapters: 1,
    audience: '"The elect lady and her children" — probably a house church and its members.',
    occasion: 'Traveling teachers who denied Christ\'s incarnation were being received with hospitality that inadvertently supported their false mission.',
    purpose: 'To warn the community that undiscriminating hospitality toward false teachers makes the host a partner in their error.',
    bigIdea: 'Hospitality must have limits—do not welcome those who deny the full incarnation of Christ.',
    overview: 'The shortest NT book (13 verses) applies the incarnation test of 1 John to a practical scenario: should traveling teachers be received into homes? John\'s answer — not those who deny Christ\'s incarnation — challenges the open hospitality culture of early Christianity. "Walking in the truth" and "love one another" are the positive framework; doctrinal discernment is its necessary complement, not its contradiction.',
    keyVerse: '2 John 9 — "Whoever abides in the teaching of Christ has both the Father and the Son."',
    themes: ['Sound doctrine', 'Discerning hospitality', 'Incarnation'],
    preachingAdvice: 'Preach 2 John alongside 3 John as a pair: 2 John warns against too much hospitality (welcoming false teachers); 3 John warns against too little (refusing legitimate missionaries). Together they describe the discernment required in Christian community. The "teaching of Christ" (v.9) as the test is not sophisticated theology — it is the basic confession that Jesus Christ came in the flesh.' },
  { name: '3 John', abbr: '3 John', genre: 'Epistle', author: 'John the Apostle', date: 'c. AD 85–95', chapters: 1,
    audience: 'Gaius, a leader John commends for his hospitality to traveling missionaries.',
    occasion: 'Diotrephes was refusing to welcome missionaries sent by John and was expelling those who did welcome them.',
    purpose: 'To commend Gaius\'s hospitality, expose Diotrephes\'s power-hungry leadership, and commend Demetrius as a trustworthy messenger.',
    bigIdea: 'Walking in truth means supporting those who go out for the gospel and opposing divisive, self-seeking leaders.',
    overview: 'The shortest NT book (14 verses) is a personal note of three portraits: Gaius (model of faithful hospitality and "walking in truth"), Diotrephes (a local leader who loves preeminence and refuses apostolic authority), and Demetrius (commended as trustworthy). The contrast between Gaius and Diotrephes is the heart: one walks in truth expressed in costly welcome; the other grasps power and excludes.',
    keyVerse: '3 John 4 — "I have no greater joy than to hear that my children are walking in the truth."',
    themes: ['Hospitality for missionaries', 'Church leadership', 'Truth-walking'],
    preachingAdvice: 'Diotrephes is a timeless portrait of toxic church leadership — he loves preeminence, refuses accountability, and weaponizes hospitality (or its refusal) as a control mechanism. Name it clearly. John\'s response is not immediate confrontation but the cultivation of faithful alternatives (Gaius, Demetrius) and promised personal visit. Preach the "greater joy" of verse 4 as a pastoral vision: the greatest satisfaction in ministry is seeing those you have taught walking in truth.' },
  { name: 'Jude', abbr: 'Jude', genre: 'Epistle', author: 'Jude (brother of Jesus)', date: 'c. AD 65', chapters: 1,
    audience: 'A community being infiltrated by antinomian false teachers who turned grace into license.',
    occasion: 'Jude had planned to write about salvation but was compelled to address teachers who were using grace as a cover for immorality.',
    purpose: 'To call the community to vigorous defense of the apostolic faith against teachers who denied Christ\'s lordship by how they lived.',
    bigIdea: 'Contend earnestly for the faith once delivered, for false teachers have secretly crept into the church.',
    overview: 'Jude is a short, fiery letter that draws extensively on OT and Jewish apocalyptic literature (the Exodus generation, Sodom, the angels, Cain, Balaam, Korah, Enoch). The false teachers are characterized by sensuality, denial of authority, and corrupting the love feasts. The letter ends with a call to build up faith, pray, keep in God\'s love, and rescue the wavering — and with one of the NT\'s great benedictions (24–25).',
    keyVerse: 'Jude 3 — "Contend for the faith that was once for all delivered to the saints."',
    themes: ['Contending for faith', 'False teachers', 'God\'s keeping power'],
    preachingAdvice: 'The closing benediction (24–25) — "to him who is able to keep you from stumbling" — is one of the NT\'s most reassuring promises and one of the best benedictions for worship. The OT allusions (Sodom, Korah, Balaam) are rapid-fire and assume the congregation knows these stories — they are worth expounding. Jude models that love for the community requires naming the threat clearly, not accommodating it.' },
  { name: 'Revelation', abbr: 'Rev', genre: 'Apocalyptic', author: 'John the Apostle', date: 'c. AD 95', chapters: 22,
    audience: 'Seven churches in Asia Minor (modern Turkey) under Domitian\'s imperial cult pressure — facing persecution, compromise, and spiritual tepidness.',
    occasion: 'Emperor worship was demanded; churches had to choose between confessing "Caesar is Lord" and confessing "Jesus is Lord," at mortal risk.',
    purpose: 'To unveil the true nature of reality — the Lamb is on the throne, Rome is not — and to call the churches to faithful endurance and worship.',
    bigIdea: 'The Lamb who was slain is Lord of all history and will make all things new—hold fast.',
    overview: 'Revelation is a prophetic-apocalyptic letter to seven real churches. Its structure: prologue and seven letters (chs. 1–3), seven seals (chs. 4–7), seven trumpets (chs. 8–11), cosmic conflict and Babylon (chs. 12–18), the return of Christ and final judgment (chs. 19–20), and new creation (chs. 21–22). The imagery is drawn almost entirely from Daniel, Ezekiel, Isaiah, and Zechariah — a reader fluent in OT prophecy will recognize almost every symbol. Babylon is Rome; the Beast is imperial power; the Lamb is Christ.',
    keyVerse: 'Rev 21:5 — "Behold, I am making all things new."',
    themes: ['Christ\'s final victory', 'Perseverance', 'New creation'],
    preachingAdvice: 'Revelation must be read as first-century apocalyptic addressing first-century churches, not as a newspaper code for current events. The symbolic numbers (7, 12, 144,000, 1,000) are OT-drawn theological quantities, not literal counts or timelines. The seven letters (chs. 2–3) are the most practically preachable section and reward direct application. The book\'s climax is not the tribulation but the new creation (chs. 21–22) — preach toward that. The central message is not "guess the sequence" but "the Lamb wins — worship him and endure."' },
]

// ── Drum Component ─────────────────────────────────────────────────────────────

const ITEM_ANGLE = 17     // degrees between items on the cylinder
const DRUM_RADIUS = 140   // cylinder radius in px
const DRUM_H = 340        // visible drum height

function BookDrum({ books, selected, onChange }: {
  books: Book[]
  selected: number
  onChange: (i: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, startY: 0, startIdx: 0 })
  const selectedRef = useRef(selected)
  const wheelAccum = useRef(0)
  selectedRef.current = selected

  const clamp = (i: number) => Math.max(0, Math.min(books.length - 1, i))

  // Non-passive wheel listener — accumulate 80px before stepping one book
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    wheelAccum.current += e.deltaY
    const STEP = 80
    if (Math.abs(wheelAccum.current) >= STEP) {
      const dir = Math.sign(wheelAccum.current)
      wheelAccum.current = 0
      onChange(clamp(selectedRef.current + dir))
    }
  }, [books.length, onChange])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { active: true, startY: e.clientY, startIdx: selected }
    containerRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    const delta = Math.round((drag.current.startY - e.clientY) / 38)
    onChange(clamp(drag.current.startIdx + delta))
  }

  const onPointerUp = () => { drag.current.active = false }

  return (
    <div
      ref={containerRef}
      style={{ height: DRUM_H, position: 'relative', overflow: 'hidden', perspective: '600px', cursor: 'ns-resize', userSelect: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Cylinder */}
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0, height: 0,
        transformStyle: 'preserve-3d',
        transform: `rotateX(${selected * ITEM_ANGLE}deg)`,
        transition: drag.current.active ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}>
        {books.map((book, i) => {
          const angle = -i * ITEM_ANGLE
          const delta = i - selected
          if (Math.abs(delta) > 6) return null

          const cosine = Math.max(0, Math.cos((delta * ITEM_ANGLE * Math.PI) / 180))
          const itemScale = 0.45 + 0.55 * cosine  // 0.45 at edges → 1.0 at center
          const opacity = 0.2 + 0.8 * cosine
          const fontSize = 8 + 5 * cosine          // 8px at edges → 13px at center

          return (
            <div key={book.name}
              onClick={() => onChange(i)}
              style={{
                position: 'absolute',
                top: -22, left: 0, right: 0, height: 44,
                transform: `rotateX(${angle}deg) translateZ(${DRUM_RADIUS}px) scale(${itemScale})`,
                backfaceVisibility: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                opacity,
                transition: 'opacity 0.15s',
              }}
            >
              <span style={{
                fontFamily: 'JetBrains Mono',
                fontSize,
                color: i === selected ? BASE.gold : BASE.khaki,
                letterSpacing: '0.12em',
                fontWeight: i === selected ? 600 : 400,
              }}>
                {book.name.toUpperCase()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Selection lines */}
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0,
        transform: 'translateY(-22px)', height: 44,
        borderTop: `1px solid ${BASE.gold}50`,
        borderBottom: `1px solid ${BASE.gold}50`,
        background: `${BASE.gold}06`,
        pointerEvents: 'none', zIndex: 10,
      }} />

      {/* Top & bottom gradient masks */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 11,
        background: `linear-gradient(to bottom, ${BASE.bgCard}f0 0%, transparent 32%, transparent 68%, ${BASE.bgCard}f0 100%)`,
      }} />
    </div>
  )
}

// ── Survey Panel ───────────────────────────────────────────────────────────────

function SurveyPanel({ book }: { book: Book }) {
  const label = (text: string) => (
    <div style={{ fontSize: 7, fontFamily: 'JetBrains Mono', color: `${BASE.khaki}55`, letterSpacing: '0.18em', marginBottom: 6 }}>
      {text}
    </div>
  )
  return (
    <motion.div key={book.name}
      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 0 0 32px', overflow: 'hidden' }}
    >
      {/* Title — fixed */}
      <div style={{ flexShrink: 0, marginBottom: 16 }}>
        <div style={{ fontSize: 7, fontFamily: 'JetBrains Mono', color: `${BASE.gold}80`, letterSpacing: '0.2em', marginBottom: 4 }}>
          {book.genre.toUpperCase()}
        </div>
        <div style={{ fontSize: 26, fontFamily: 'Crimson Pro, serif', color: BASE.bone, letterSpacing: '0.02em', lineHeight: 1.1 }}>
          {book.name}
        </div>
        <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: BASE.steel, marginTop: 4, letterSpacing: '0.06em' }}>
          {book.author} · {book.date} · {book.chapters} ch.
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, paddingRight: 8, paddingBottom: 16 }}>

        {/* Big Idea */}
        <div style={{ padding: '12px 16px', background: `${BASE.gold}0a`, border: `1px solid ${BASE.gold}25`, borderRadius: 10 }}>
          <div style={{ fontSize: 7, fontFamily: 'JetBrains Mono', color: `${BASE.gold}80`, letterSpacing: '0.18em', marginBottom: 8 }}>BIG IDEA</div>
          <div style={{ fontSize: 13.5, fontFamily: 'Crimson Pro, serif', color: BASE.bone, lineHeight: 1.6 }}>{book.bigIdea}</div>
        </div>

        {/* Audience / Occasion / Purpose — 3-col */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[['AUDIENCE', book.audience], ['OCCASION', book.occasion], ['PURPOSE', book.purpose]].map(([lbl, val]) => (
            <div key={lbl} style={{ padding: '10px 12px', background: `${BASE.khaki}06`, border: `1px solid ${BASE.khaki}15`, borderRadius: 8 }}>
              <div style={{ fontSize: 7, fontFamily: 'JetBrains Mono', color: `${BASE.khaki}55`, letterSpacing: '0.16em', marginBottom: 6 }}>{lbl}</div>
              <div style={{ fontSize: 11.5, fontFamily: 'Crimson Pro, serif', color: `${BASE.khaki}cc`, lineHeight: 1.55 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Overview */}
        <div>
          {label('OVERVIEW')}
          <div style={{ fontSize: 12.5, fontFamily: 'Crimson Pro, serif', color: `${BASE.bone}cc`, lineHeight: 1.7 }}>{book.overview}</div>
        </div>

        {/* Key verse */}
        <div>
          {label('KEY VERSE')}
          <div style={{ fontSize: 12.5, fontFamily: 'Crimson Pro, serif', color: `${BASE.khaki}cc`, lineHeight: 1.65, fontStyle: 'italic' }}>{book.keyVerse}</div>
        </div>

        {/* Themes */}
        <div>
          {label('KEY THEMES')}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {book.themes.map(t => (
              <span key={t} style={{
                fontFamily: 'JetBrains Mono', fontSize: 7.5, letterSpacing: '0.08em',
                color: BASE.khaki, background: `${BASE.khaki}12`,
                border: `1px solid ${BASE.khaki}25`,
                borderRadius: 5, padding: '4px 10px',
              }}>{t}</span>
            ))}
          </div>
        </div>

        {/* Preaching Advice */}
        <div style={{ padding: '12px 16px', background: `${BASE.moss}08`, border: `1px solid ${BASE.moss}20`, borderRadius: 10 }}>
          <div style={{ fontSize: 7, fontFamily: 'JetBrains Mono', color: `${BASE.moss}80`, letterSpacing: '0.18em', marginBottom: 8 }}>PREACHING ADVICE</div>
          <div style={{ fontSize: 12.5, fontFamily: 'Crimson Pro, serif', color: `${BASE.bone}bb`, lineHeight: 1.7 }}>{book.preachingAdvice}</div>
        </div>

      </div>
    </motion.div>
  )
}

// ── Chapter Grid ───────────────────────────────────────────────────────────────

function ChapterGrid({ book, onSelect }: { book: Book; onSelect: (ref: string) => void }) {
  return (
    <motion.div key={book.name + '-ch'}
      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '0 0 0 32px', overflowY: 'auto' }}
    >
      <div style={{ fontSize: 28, fontFamily: 'Crimson Pro, serif', color: BASE.bone }}>
        {book.name}
      </div>
      <div style={{ fontSize: 8, fontFamily: 'JetBrains Mono', color: BASE.steel, letterSpacing: '0.12em', marginTop: -8 }}>
        SELECT A CHAPTER TO STUDY
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Array.from({ length: book.chapters }, (_, i) => i + 1).map(ch => (
          <button key={ch}
            onClick={() => onSelect(`${book.name} ${ch}`)}
            style={{
              width: 40, height: 40, borderRadius: 8,
              fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.05em',
              color: BASE.khaki, background: `${BASE.khaki}0a`,
              border: `1px solid ${BASE.khaki}20`,
              cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = `${BASE.gold}18`
              e.currentTarget.style.borderColor = `${BASE.gold}50`
              e.currentTarget.style.color = BASE.gold
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = `${BASE.khaki}0a`
              e.currentTarget.style.borderColor = `${BASE.khaki}20`
              e.currentTarget.style.color = BASE.khaki
            }}
          >
            {ch}
          </button>
        ))}
      </div>
    </motion.div>
  )
}

// ── Book Compass ───────────────────────────────────────────────────────────────

interface BookCompassProps {
  onClose: () => void
  onNavigate: (ref: string) => void
}

export function BookCompass({ onClose, onNavigate }: BookCompassProps) {
  const [testament, setTestament] = useState<'OT' | 'NT'>('OT')
  const [selectedOT, setSelectedOT] = useState(0)
  const [selectedNT, setSelectedNT] = useState(0)
  const [view, setView] = useState<'survey' | 'chapters'>('survey')

  const books = testament === 'OT' ? OT_BOOKS : NT_BOOKS
  const selectedIdx = testament === 'OT' ? selectedOT : selectedNT
  const setSelected = testament === 'OT' ? setSelectedOT : setSelectedNT
  const book = books[selectedIdx]

  const handleTabChange = (t: 'OT' | 'NT') => {
    setTestament(t)
    setView('survey')
  }

  const handleNavigate = (ref: string) => {
    onNavigate(ref)
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(8, 10, 7, 0.85)',
        backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{
          width: 860, maxHeight: '82vh',
          background: BASE.bgCard,
          border: `1px solid ${BASE.borderDim}`,
          borderRadius: 20,
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px 14px',
          borderBottom: `1px solid ${BASE.borderDim}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
          background: `${BASE.khaki}04`,
        }}>
          <div>
            <div style={{ fontSize: 7, fontFamily: 'JetBrains Mono', color: `${BASE.gold}80`, letterSpacing: '0.2em', marginBottom: 3 }}>
              BASE 1520
            </div>
            <div style={{ fontSize: 13, fontFamily: 'JetBrains Mono', color: BASE.gold, letterSpacing: '0.1em' }}>
              BOOK COMPASS
            </div>
          </div>

          {/* OT / NT tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['OT', 'NT'] as const).map(t => (
              <button key={t}
                onClick={() => handleTabChange(t)}
                style={{
                  fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.14em',
                  padding: '6px 16px', borderRadius: 7, cursor: 'pointer',
                  background: testament === t ? `${BASE.gold}18` : 'transparent',
                  border: `1px solid ${testament === t ? `${BASE.gold}55` : `${BASE.khaki}25`}`,
                  color: testament === t ? BASE.gold : `${BASE.khaki}70`,
                  transition: 'all 0.15s',
                }}
              >{t === 'OT' ? 'OLD TESTAMENT' : 'NEW TESTAMENT'}</button>
            ))}
          </div>

          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: BASE.steel, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}
            onMouseEnter={e => (e.currentTarget.style.color = BASE.red)}
            onMouseLeave={e => (e.currentTarget.style.color = BASE.steel)}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: '24px 28px' }}>
          {/* Left: Drum */}
          <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 7, fontFamily: 'JetBrains Mono', color: `${BASE.khaki}40`, letterSpacing: '0.2em', marginBottom: 12, textAlign: 'center' }}>
              {testament} · {books.length} BOOKS
            </div>
            <BookDrum books={books} selected={selectedIdx} onChange={setSelected} />
            <div style={{ fontSize: 7, fontFamily: 'JetBrains Mono', color: `${BASE.khaki}30`, letterSpacing: '0.1em', textAlign: 'center', marginTop: 8 }}>
              scroll or drag
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, background: `${BASE.khaki}12`, margin: '0 0 0 20px', flexShrink: 0 }} />

          {/* Right: Info */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <AnimatePresence mode="wait">
              {view === 'survey'
                ? <SurveyPanel key={book.name} book={book} />
                : <ChapterGrid key={book.name + '-ch'} book={book} onSelect={handleNavigate} />
              }
            </AnimatePresence>
          </div>
        </div>

        {/* Footer: view toggle */}
        <div style={{
          padding: '12px 28px',
          borderTop: `1px solid ${BASE.borderDim}`,
          display: 'flex', gap: 8, flexShrink: 0,
        }}>
          {(['survey', 'chapters'] as const).map(v => (
            <button key={v}
              onClick={() => setView(v)}
              style={{
                fontFamily: 'JetBrains Mono', fontSize: 7.5, letterSpacing: '0.12em',
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                background: view === v ? `${BASE.gold}15` : 'transparent',
                border: `1px solid ${view === v ? `${BASE.gold}50` : `${BASE.khaki}20`}`,
                color: view === v ? BASE.gold : `${BASE.khaki}60`,
                transition: 'all 0.15s',
              }}
            >{v === 'survey' ? '◉ SURVEY' : '⊞ CHAPTERS'}</button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: `${BASE.khaki}30`, alignSelf: 'center', letterSpacing: '0.06em' }}>
            {book.chapters} chapter{book.chapters !== 1 ? 's' : ''} · {testament === 'OT' ? `book ${selectedIdx + 1} of 39` : `book ${selectedIdx + 1} of 27`}
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}
