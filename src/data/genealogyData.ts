// Genealogy / lineage data for the Lineage Viewer tile
// Each tree is a standalone dataset; nodes link to biblical references and short bios

export interface GenealogyNode {
  id: string
  name: string
  generation: number    // 0 = root
  parentIds: string[]
  spouse?: string       // display only — not a separate node
  dates?: string
  significance: string  // one-line theological role
  refs: string[]
  desc: string          // 2-3 sentences
  sex?: 'M' | 'F'
  notable?: boolean     // highlight in gold
}

export interface GenealogyTree {
  id: string
  label: string
  subtitle: string
  desc: string
  nodes: GenealogyNode[]
}

// ── 1. PATRIARCHAL LINE: Adam → Abraham → Jesus ─────────────────────────────
export const PATRIARCHAL_TREE: GenealogyTree = {
  id: 'patriarchal',
  label: 'Patriarchal Line',
  subtitle: 'Adam → Abraham → David → Christ',
  desc: 'The redemptive spine of the OT. Genesis 5 and 11 trace an unbroken line from Adam through Noah to Abraham — the genealogy of promise. Matthew 1 and Luke 3 then carry that line through David to Jesus, making the genealogy the skeleton of the entire biblical story.',
  nodes: [
    { id: 'adam',     name: 'Adam',        generation: 0, parentIds: [],          dates: 'c. 4000 BC (symbolic)',  notable: true,
      significance: 'Federal head of humanity; the first Adam whose failure necessitates the Last Adam',
      refs: ['Gen 2-5', 'Rom 5:12-21', '1 Cor 15:45-49', 'Luke 3:38'],
      desc: 'Created from the dust of the ground, animated by the breath of God. Placed in Eden as priest-king with dominion over creation. His disobedience brought death, exile, and corruption to all. Paul\'s theology of Christ as the "Last Adam" makes Adam the central typological figure of the entire Bible.' },
    { id: 'seth',     name: 'Seth',        generation: 1, parentIds: ['adam'],    dates: 'Gen 5:3-8',
      significance: 'Appointed replacement for Abel; line of promise begins through him',
      refs: ['Gen 4:25-26', 'Gen 5:3-8', 'Luke 3:38'],
      desc: 'Eve names him Seth ("appointed/granted") saying "God has granted me another child in place of Abel." It is through Seth\'s line — not Cain\'s — that the redemptive genealogy runs. Gen 4:26 notes: "At that time people began to call on the name of the LORD" — the first mention of corporate worship.' },
    { id: 'enosh',    name: 'Enosh',       generation: 2, parentIds: ['seth'],    dates: 'Gen 5:6-11', significance: 'Seth\'s son; name means "mortal man"', refs: ['Gen 5:6-11', 'Luke 3:38'], desc: 'His name (\'enosh) emphasizes human frailty and mortality, contrasting with the divine calling on the line.' },
    { id: 'kenan',    name: 'Kenan',       generation: 3, parentIds: ['enosh'],   dates: 'Gen 5:9-14',  significance: 'Link in the antediluvian chain', refs: ['Gen 5:9-14'], desc: 'Part of the long-lived antediluvian patriarchs. The extraordinary lifespans in Genesis 5 have been interpreted as literal, as dynasty names, or as a literary device emphasizing the contrast with post-Flood shortening of life.' },
    { id: 'mahalalel',name: 'Mahalalel',   generation: 4, parentIds: ['kenan'],   dates: 'Gen 5:12-17', significance: 'Name means "praise of God"', refs: ['Gen 5:12-17'], desc: 'His name (Mahalal-El, "the blessed God" or "praise of God") continues the embedded theology of the Genesis 5 genealogy — the names together tell a story of the human condition and God\'s grace.' },
    { id: 'jared',    name: 'Jared',       generation: 5, parentIds: ['mahalalel'],dates: 'Gen 5:15-20', significance: 'Father of Enoch; name means "descent"', refs: ['Gen 5:15-20'], desc: 'Father of the remarkable Enoch. His name meaning "descent" may carry thematic weight.' },
    { id: 'enoch',    name: 'Enoch',       generation: 6, parentIds: ['jared'],   dates: 'Gen 5:18-24',  notable: true,
      significance: '"Walked with God and was not, for God took him" — the pre-Flood type of translation/rapture',
      refs: ['Gen 5:18-24', 'Heb 11:5', 'Jude 1:14-15'],
      desc: 'The most theologically remarkable antediluvian patriarch. He "walked with God" — the same language used of Noah (Gen 6:9) and of Adam in the garden (Gen 3:8). He did not die but "God took him" (Gen 5:24). Hebrews 11:5 interprets: "He was commended as one who pleased God." Jude 1:14-15 quotes an Enoch prophecy about the coming judgment.' },
    { id: 'methuselah',name: 'Methuselah', generation: 7, parentIds: ['enoch'],   dates: 'Gen 5:21-27',
      significance: 'Longest-lived person in the Bible (969 years); name possibly means "his death shall bring"',
      refs: ['Gen 5:21-27'],
      desc: 'His name may encode a prophecy: "his death shall bring [it]" — the Flood came the year Methuselah died, according to the biblical chronology. If so, his lifespan was God\'s patience extended to the maximum before judgment.' },
    { id: 'lamech-s',  name: 'Lamech',     generation: 8, parentIds: ['methuselah'], dates: 'Gen 5:25-31',
      significance: 'Prophesied rest through Noah; name means "powerful"',
      refs: ['Gen 5:25-31'],
      desc: 'At Noah\'s birth declared: "He will comfort us in the labor and painful toil of our hands caused by the ground the LORD has cursed" — a messianic-toned prophecy looking for relief from the Adamic curse. Distinct from Cain\'s descendant Lamech (Gen 4:23-24) who boasted of violence.' },
    { id: 'noah',     name: 'Noah',        generation: 9, parentIds: ['lamech-s'], dates: 'c. 2400 BC',   notable: true,
      significance: 'New Adam; the flood and the ark are the great re-creation/new creation pattern in Scripture',
      refs: ['Gen 6-9', 'Heb 11:7', '1 Pet 3:20-21', '2 Pet 2:5', 'Matt 24:37-39'],
      desc: 'Found "grace" in the LORD\'s eyes (Gen 6:8 — first use of "grace" in Scripture). The flood narrative is deliberately structured as an un-creation and re-creation: the earth reverts to watery chaos and God re-creates with Noah as the new Adam. God establishes his covenant with Noah and all creation (Gen 9) — the first explicit covenant in Scripture. 1 Pet 3:20-21 uses the ark\'s water as a type of baptism.' },
    { id: 'shem',     name: 'Shem',        generation: 10, parentIds: ['noah'],   dates: 'Gen 10:1',      notable: true,
      significance: 'Ancestor of the Semitic peoples; "Semite" derived from his name; line of Abraham and Israel',
      refs: ['Gen 9:26', 'Gen 10:21-31', 'Gen 11:10-26', 'Luke 3:36'],
      desc: 'Noah blessed Shem: "Blessed be the LORD, the God of Shem!" (Gen 9:26) — identifying YHWH as specifically the God of Shem\'s line. The Table of Nations (Gen 10) shows Shem\'s descendants as the Semitic peoples of the ancient Near East. The line runs directly through Shem to Abraham.' },
    { id: 'arphaxad', name: 'Arphaxad',    generation: 11, parentIds: ['shem'],   dates: 'Gen 11:10-13',  significance: 'Post-flood link in the Shemite genealogy', refs: ['Gen 11:10-13', 'Luke 3:36'], desc: 'Born two years after the flood. The genealogy in Genesis 11 shows a sharp decline in lifespans from the antediluvian era, moving toward ordinary human longevity.' },
    { id: 'shelah',   name: 'Shelah',      generation: 12, parentIds: ['arphaxad'],dates: 'Gen 11:12-15', significance: 'Link in the post-flood chain', refs: ['Gen 11:12-15', 'Luke 3:35'], desc: 'Part of the narrowing genealogy from Shem to Abraham.' },
    { id: 'eber',     name: 'Eber',        generation: 13, parentIds: ['shelah'],  dates: 'Gen 11:14-17',  notable: true,
      significance: '"Hebrew" derived from his name (Eber → Ibri); ancestor of the Hebrew people',
      refs: ['Gen 11:14-17', 'Num 24:24'],
      desc: 'His name is the probable root of the term "Hebrew" (\'ivri). Balaam\'s oracle references "ships of Kittim" afflicting "Eber" (Num 24:24). His son Peleg\'s name connects to "the earth was divided" (Gen 10:25) — possibly the Tower of Babel dispersion.' },
    { id: 'peleg',    name: 'Peleg',       generation: 14, parentIds: ['eber'],   dates: 'Gen 11:16-19',  significance: '"In his days the earth was divided" — Tower of Babel/dispersion era', refs: ['Gen 10:25', 'Gen 11:16-19'], desc: 'His name means "division." Genesis 10:25 notes "in his time the earth was divided" — most likely referring to the dispersion of peoples after Babel (Gen 11).' },
    { id: 'reu',      name: 'Reu',         generation: 15, parentIds: ['peleg'],  dates: 'Gen 11:18-21', significance: 'Link in the chain from Shem to Abraham', refs: ['Gen 11:18-21'], desc: 'Part of the post-Babel genealogy narrowing toward Abraham.' },
    { id: 'serug',    name: 'Serug',       generation: 16, parentIds: ['reu'],    dates: 'Gen 11:20-23', significance: 'Grandfather of Terah; great-great-grandfather of Abraham', refs: ['Gen 11:20-23'], desc: 'His name appears in ancient Mesopotamian records as a place name near Haran — consistent with the patriarchal homeland geography.' },
    { id: 'nahor1',   name: 'Nahor',       generation: 17, parentIds: ['serug'],  dates: 'Gen 11:22-25', significance: 'Abraham\'s grandfather', refs: ['Gen 11:22-25'], desc: 'The lesser-known Nahor (the grandfather), not to be confused with Abraham\'s brother Nahor.' },
    { id: 'terah',    name: 'Terah',       generation: 18, parentIds: ['nahor1'], dates: 'Gen 11:24-32',  notable: true,
      significance: 'Abraham\'s father; began the journey from Ur to Canaan but stopped and died in Haran',
      refs: ['Gen 11:24-32', 'Josh 24:2', 'Acts 7:2-4'],
      desc: 'Joshua 24:2 reveals: "Your ancestors, including Terah the father of Abraham and Nahor, lived beyond the Euphrates River and worshiped other gods." Terah set out for Canaan from Ur but "came to Haran and settled there." His partial obedience — starting the journey but stopping short — foreshadows the incomplete obedience pattern that Israel will repeat. He died in Haran.' },
    { id: 'abraham',  name: 'Abraham',     generation: 19, parentIds: ['terah'],  dates: 'c. 2166-1991 BC', notable: true, spouse: 'Sarah',
      significance: 'Father of faith; recipient of the foundational covenant; through him all nations will be blessed',
      refs: ['Gen 12-25', 'Rom 4', 'Gal 3', 'Heb 11:8-19', 'John 8:56'],
      desc: 'Called by God to leave Ur for a land he had never seen, with a promise and no map (Gen 12:1-3). Three interlocking promises: land, descendants, blessing to all nations. Paul makes Abraham the prototype of justification by faith (Rom 4; Gal 3). The binding of Isaac (Akedah, Gen 22) is the OT\'s supreme act of obedient faith — "God himself will provide the lamb" (22:8). James uses Abraham to show that genuine faith acts (Jas 2:21-24). Jesus says "Abraham rejoiced at the thought of seeing my day; he saw it and was glad" (John 8:56).' },
    { id: 'isaac',    name: 'Isaac',       generation: 20, parentIds: ['abraham'], dates: 'c. 2066-1886 BC', notable: true, spouse: 'Rebekah',
      significance: 'Child of promise; type of Christ as the offered son; covenant carried through him not Ishmael',
      refs: ['Gen 21-28', 'Rom 9:7', 'Gal 4:28', 'Heb 11:17-20'],
      desc: 'Born miraculously when Abraham was 100 and Sarah 90 — "Is anything too hard for the LORD?" (Gen 18:14). His near-sacrifice at Moriah (Gen 22) is the OT\'s deepest typological foreshadowing of the atonement: the father\'s willingness, the son\'s submission, the ram provided as substitute. Paul uses Isaac as the type of children "born according to the Spirit" and the promise (Gal 4:28).' },
    { id: 'jacob',    name: 'Jacob/Israel', generation: 21, parentIds: ['isaac'],  dates: 'c. 2006-1859 BC', notable: true, spouse: 'Leah & Rachel',
      significance: 'Renamed Israel at Peniel; father of the 12 tribes; the entire nation takes its name from him',
      refs: ['Gen 25-50', 'Hos 12:2-6', 'John 1:51'],
      desc: 'Born grasping his twin Esau\'s heel, he lived his name ("he deceives") until the night at Peniel where he wrestled with God and was renamed Israel ("he struggles with God"). His 12 sons become the 12 tribes — the literal flesh-and-blood origin of the nation of Israel. The Joseph narrative (Gen 37-50) is the OT\'s most sophisticated literary unit.' },
    { id: 'judah',    name: 'Judah',       generation: 22, parentIds: ['jacob'],  dates: 'c. 1885-1750 BC', notable: true,
      significance: 'The royal tribe; the scepter will not depart from Judah until Shiloh comes (Gen 49:10)',
      refs: ['Gen 38', 'Gen 49:8-12', 'Rev 5:5', 'Heb 7:14'],
      desc: 'Jacob\'s fourth son (by Leah) who became the ancestor of the royal line. Genesis 49:10 is one of the OT\'s clearest messianic texts: "The scepter will not depart from Judah, nor the ruler\'s staff from between his feet, until he to whom it belongs shall come." Revelation 5:5 identifies Jesus as "the Lion of the tribe of Judah, the Root of David."' },
    { id: 'perez',    name: 'Perez',       generation: 23, parentIds: ['judah'],  dates: 'Gen 38:29',
      significance: 'Born of Judah and Tamar in the scandalous levirate episode; ancestor of David and Jesus',
      refs: ['Gen 38', 'Ruth 4:18-22', 'Matt 1:3'],
      desc: 'His birth story (Gen 38) is one of the Bible\'s most surprising passages — born from Judah\'s union with his daughter-in-law Tamar whom he had wronged. Yet he appears in both Ruth\'s genealogy (Ruth 4:18) and Matthew\'s Messianic genealogy (Matt 1:3). God\'s covenant purposes run through deeply broken stories.' },
    { id: 'hezron',   name: 'Hezron',      generation: 24, parentIds: ['perez'],  dates: 'Gen 46:12; Ruth 4:18', significance: 'Link from Perez to the Davidic line', refs: ['Ruth 4:18', 'Matt 1:3'], desc: 'Part of the genealogy linking Perez to Boaz and David, preserved in Ruth 4:18-22 — one of the most important genealogical texts in the OT.' },
    { id: 'ram',      name: 'Ram',         generation: 25, parentIds: ['hezron'], dates: 'Ruth 4:19', significance: 'Link in the Davidic chain', refs: ['Ruth 4:19', 'Matt 1:3'], desc: 'Continues the line from Hezron toward Boaz.' },
    { id: 'amminadab',name: 'Amminadab',   generation: 26, parentIds: ['ram'],    dates: 'Ruth 4:19', significance: 'Father of Nahshon — leader of Judah in the Exodus generation', refs: ['Num 1:7', 'Ruth 4:19', 'Matt 1:4'], desc: 'His son Nahshon was the prince/leader of the tribe of Judah during the Exodus — the generation that came out of Egypt.' },
    { id: 'nahshon',  name: 'Nahshon',     generation: 27, parentIds: ['amminadab'], dates: 'Num 1:7',
      significance: 'Prince of Judah during the Exodus; his family bridges Egypt to Canaan',
      refs: ['Num 1:7', 'Num 2:3', 'Ruth 4:20', 'Matt 1:4'],
      desc: 'Leader of the tribe of Judah when Israel was camped at Sinai. According to Jewish tradition, he was the first to step into the Red Sea in faith before the waters parted.' },
    { id: 'salmon',   name: 'Salmon',      generation: 28, parentIds: ['nahshon'], dates: 'Ruth 4:20', spouse: 'Rahab', notable: true,
      significance: 'Father of Boaz; married Rahab the Canaanite — a Gentile woman of faith in the Messianic line',
      refs: ['Ruth 4:20', 'Matt 1:4-5'],
      desc: 'Matthew 1:5 explicitly names Rahab as Salmon\'s wife and Boaz\'s mother. This is theologically remarkable: a Canaanite prostitute from Jericho — whose faith led her to hide the spies (Josh 2) — enters the Messianic genealogy. God\'s grace regularly includes the unexpected.' },
    { id: 'boaz',     name: 'Boaz',        generation: 29, parentIds: ['salmon'],  dates: 'c. 1150 BC', spouse: 'Ruth', notable: true,
      significance: 'The kinsman-redeemer of Ruth; type of Christ as the redeemer who pays the full price',
      refs: ['Ruth 2-4', 'Matt 1:5'],
      desc: 'A man of standing in Bethlehem who notices a Moabite widow gleaning in his fields and chooses to act as kinsman-redeemer (go\'el). The entire book of Ruth is a masterpiece of hesed (covenant love). Boaz\'s willing redemption of Ruth and the inheritance is one of the OT\'s richest types of the atonement: Christ as the one who has the right and willingness to redeem.' },
    { id: 'obed',     name: 'Obed',        generation: 30, parentIds: ['boaz'],   dates: 'Ruth 4:17', significance: 'Son of Ruth and Boaz; grandfather of David', refs: ['Ruth 4:17', 'Matt 1:5'], desc: 'The women of Bethlehem name him Obed ("servant/worshipper"). Ruth 4:17 — "A son has been born to Naomi!" — is one of the most moving moments in Scripture: the widowed exile finds restoration through a son.' },
    { id: 'jesse',    name: 'Jesse',        generation: 31, parentIds: ['obed'],   dates: '1 Sam 16',   notable: true,
      significance: 'Father of David; "the stump of Jesse" (Isa 11:1) is the messianic metaphor for the Davidic line',
      refs: ['1 Sam 16', 'Isa 11:1', 'Rom 15:12'],
      desc: 'The Bethlehemite who brought his sons before Samuel for anointing — and nearly lost the greatest of them because "the LORD does not look at the things people look at" (1 Sam 16:7). Isaiah 11:1 — "A shoot will come up from the stump of Jesse; from his roots a Branch will bear fruit" — is the metaphor for the Davidic Messiah arising from what appeared to be a dead lineage.' },
    { id: 'david',    name: 'David',        generation: 32, parentIds: ['jesse'],  dates: 'c. 1010-970 BC', notable: true, spouse: 'Bathsheba (among others)',
      significance: 'The defining king; the Davidic covenant makes his throne eternal; type of Christ the King',
      refs: ['2 Sam 7', 'Ps 2', 'Ps 22', 'Ps 110', 'Matt 1:1', 'Rev 22:16'],
      desc: 'The "man after God\'s own heart" (1 Sam 13:14) who was also an adulterer and murderer — showing that the Messiah\'s lineage runs through broken people. The Davidic Covenant (2 Sam 7) is the OT\'s most direct Messianic promise: "Your house and your kingdom will endure forever before me; your throne will be established forever" (7:16). His psalms make him the supreme poet-theologian of Israel. Matthew opens his Gospel: "This is the genealogy of Jesus the Messiah the son of David, the son of Abraham" (1:1).' },
    { id: 'solomon',  name: 'Solomon',      generation: 33, parentIds: ['david'],  dates: 'c. 970-931 BC', notable: true,
      significance: 'Builder of the First Temple; his wisdom pointed to Christ; his apostasy warned against',
      refs: ['1 Kgs 1-11', 'Matt 12:42', 'Matt 6:29'],
      desc: 'David\'s son by Bathsheba — again, the scandalous backstory in the genealogy. Built the temple, wrote Proverbs, Ecclesiastes, and Song of Songs (attributed). Received divine wisdom but ended in apostasy through foreign wives and their gods (1 Kgs 11). Jesus says "something greater than Solomon is here" (Matt 12:42). The Davidic line continued through Solomon to the exile.' },
    { id: 'davidic-line', name: '...Davidic Kings...', generation: 34, parentIds: ['solomon'],
      significance: 'The royal line from Solomon to the Babylonian exile (14 generations — Matt 1:6-11)',
      refs: ['Matt 1:6-11', '2 Kgs 8-25', '2 Chr 21-36'],
      desc: 'Matthew compresses 14 generations from Solomon to the exile: Rehoboam → Abijah → Asa → Jehoshaphat → Jehoram → Uzziah → Jotham → Ahaz → Hezekiah → Manasseh → Amon → Josiah → Jeconiah → the Babylonian exile (586 BC). The royal line did not die in Babylon — it narrowed to a single surviving thread.' },
    { id: 'shealtiel', name: 'Shealtiel',   generation: 35, parentIds: ['davidic-line'],
      significance: 'Post-exile survivor of the Davidic dynasty; father of Zerubbabel',
      refs: ['Matt 1:12', 'Ezra 3:2', 'Hag 1:1'],
      desc: 'The Davidic line survived the Babylonian exile. Shealtiel\'s son Zerubbabel led the first return from exile and laid the foundation of the Second Temple.' },
    { id: 'zerubbabel', name: 'Zerubbabel', generation: 36, parentIds: ['shealtiel'], notable: true,
      significance: 'Governor of Judah; rebuilt the temple; named as messianic type in Haggai and Zechariah',
      refs: ['Ezra 3-6', 'Hag 2:20-23', 'Zech 4:6-10', 'Matt 1:12'],
      desc: '"Not by might nor by power, but by my Spirit, says the LORD Almighty. What are you, mighty mountain? Before Zerubbabel you will become level ground" (Zech 4:6-7). Haggai 2:23 designates him as God\'s signet ring — the Davidic line continuing. Herod\'s temple would later dwarf what Zerubbabel built, but the tears of the old men who had seen Solomon\'s temple (Ezra 3:12) show the weight of the moment.' },
    { id: 'post-exile-line', name: '...Post-Exile Line...', generation: 37, parentIds: ['zerubbabel'],
      significance: 'The "silent" generations from Zerubbabel to Joseph — 9 obscure names in Matthew 1:13-16',
      refs: ['Matt 1:13-16'],
      desc: 'Matthew lists Abiud → Eliakim → Azor → Zadok → Akim → Eliud → Eleazar → Matthan → Jacob → Joseph. These names are otherwise unknown in the OT. The Davidic line survived not in kingly power but in obscurity — a carpenter in Nazareth holding the title.' },
    { id: 'joseph',   name: 'Joseph',       generation: 38, parentIds: ['post-exile-line'], spouse: 'Mary', notable: true,
      significance: 'Legal (not biological) father of Jesus; through him Jesus holds the legal Davidic title',
      refs: ['Matt 1:16-25', 'Luke 1:27', 'Luke 2:4'],
      desc: 'A carpenter in Nazareth, betrothed to Mary. Matthew\'s genealogy gives him as the legal father — "Joseph the husband of Mary, of whom was born Jesus" (Matt 1:16, using the feminine "of whom" to signal virgin birth). Through Joseph, Jesus is the legal heir of the Davidic throne. Through Mary (Luke 3\'s genealogy through Nathan rather than Solomon), he has the biological Davidic descent. Both lines converge in him.' },
    { id: 'jesus',    name: 'Jesus the Messiah', generation: 39, parentIds: ['joseph'], notable: true,
      significance: 'The fulfillment of every promise in the genealogy — Last Adam, true Israel, Son of David, Son of Abraham',
      refs: ['Matt 1:1', 'Luke 3:23-38', 'Gal 3:16', 'Rom 1:3-4', 'Rev 5:5', 'Rev 22:16'],
      desc: '"A record of the genealogy of Jesus the Messiah the son of David, the son of Abraham" (Matt 1:1). Matthew\'s genealogy deliberately includes four women — Tamar, Rahab, Ruth, Bathsheba ("the wife of Uriah") — all involving Gentiles, scandal, or irregular unions, foreshadowing the universal and grace-saturated nature of the gospel. Luke\'s genealogy runs backward to Adam, making Jesus "the Son of Adam, the Son of God" — the Last Adam who succeeds where the first failed (Rom 5:12-21). "He is the Lion of the tribe of Judah, the Root of David" (Rev 5:5).' },
  ]
}

// ── 2. THE 12 TRIBES ─────────────────────────────────────────────────────────
export const TWELVE_TRIBES_TREE: GenealogyTree = {
  id: 'twelve-tribes',
  label: 'The 12 Tribes',
  subtitle: "Jacob's Sons → The Nation of Israel",
  desc: "Jacob's 12 sons became the 12 tribes of Israel — the structural backbone of the entire OT narrative. Their birth stories (Gen 29-30; 35) involve rivalry, pain, and God's sovereign working through dysfunctional families. Jacob's deathbed blessings (Gen 49) are one of the OT's most concentrated prophetic texts.",
  nodes: [
    { id: 'jacob-t', name: 'Jacob / Israel', generation: 0, parentIds: [], notable: true, spouse: 'Leah, Rachel, Bilhah, Zilpah',
      significance: 'Father of the 12 tribes; renamed Israel at Peniel', refs: ['Gen 29-35', 'Gen 49'], desc: 'Jacob\'s four wives/concubines bore 12 sons and at least one daughter (Dinah). The tribal structure of Israel is inseparable from the messiness of Jacob\'s family.' },
    { id: 'reuben',   name: 'Reuben',   generation: 1, parentIds: ['jacob-t'], significance: 'Firstborn; forfeited his birthright by sleeping with Bilhah', refs: ['Gen 29:32', 'Gen 49:3-4', 'Gen 35:22'], desc: 'Unstable as water — lost his primacy by defiling his father\'s concubine Bilhah. Yet it was Reuben who tried to save Joseph (Gen 37:21-22). A complex figure of wasted potential.' },
    { id: 'simeon',   name: 'Simeon',   generation: 1, parentIds: ['jacob-t'], significance: 'Scattered in Israel (Gen 49:5-7); tribe absorbed into Judah', refs: ['Gen 29:33', 'Gen 49:5-7'], desc: 'With Levi, massacred the men of Shechem in revenge for Dinah. Jacob\'s curse — "I will scatter them in Jacob and disperse them in Israel" — was fulfilled: Simeon had no independent territory, scattered within Judah.' },
    { id: 'levi',     name: 'Levi',     generation: 1, parentIds: ['jacob-t'], notable: true, significance: 'The priestly tribe; no land allotment — God is their inheritance; includes Moses, Aaron, and the priesthood', refs: ['Gen 29:34', 'Gen 49:5-7', 'Num 3:11-13', 'Deut 10:8-9', 'Heb 7:5-10'], desc: 'Cursed alongside Simeon for the Shechem massacre, yet the curse became a blessing: Levi\'s descendants received no territorial allotment (God himself was their portion) but were distributed through all Israel as priests and Levites — becoming the spiritual backbone of the nation. Moses, Aaron, and Miriam were all Levites.' },
    { id: 'judah-t',  name: 'Judah',    generation: 1, parentIds: ['jacob-t'], notable: true, significance: 'Royal tribe; scepter promise (Gen 49:10); David, Solomon, and Jesus come through Judah', refs: ['Gen 29:35', 'Gen 49:8-12', 'Rev 5:5'], desc: 'Named by Leah "this time I will praise the LORD." Jacob\'s blessing in Gen 49:8-12 is one of the OT\'s clearest messianic texts: "The scepter will not depart from Judah... until he to whom it belongs shall come and the obedience of the nations shall be his."' },
    { id: 'dan',      name: 'Dan',      generation: 1, parentIds: ['jacob-t'], significance: 'Judge/serpent imagery (Gen 49:16-17); set up the first idolatrous shrine in Israel (Judg 18)', refs: ['Gen 30:6', 'Gen 49:16-17', 'Judg 18'], desc: 'A "serpent by the roadside, a viper along the path, that bites the horse\'s heels" (Gen 49:17). The tribe of Dan set up the idolatrous shrine at Laish and is conspicuously absent from the list of sealed tribes in Rev 7.' },
    { id: 'naphtali', name: 'Naphtali', generation: 1, parentIds: ['jacob-t'], significance: '"A doe set free, bearing beautiful fawns" (Gen 49:21); Galilee of the Gentiles — Jesus\'s ministry base', refs: ['Gen 30:8', 'Gen 49:21', 'Isa 9:1-2', 'Matt 4:13-16'], desc: 'The territory of Naphtali (around the Sea of Galilee) became "Galilee of the Gentiles" — the very region Isaiah promised would "see a great light" (Isa 9:1-2), fulfilled in Jesus\'s Galilean ministry (Matt 4:13-16).' },
    { id: 'gad',      name: 'Gad',      generation: 1, parentIds: ['jacob-t'], significance: '"A troop shall troop upon him, but he shall triumph at last" (Gen 49:19)', refs: ['Gen 30:11', 'Gen 49:19'], desc: 'Settled Transjordan (east of the Jordan). Jacob\'s blessing uses military wordplay on the name Gad.' },
    { id: 'asher',    name: 'Asher',    generation: 1, parentIds: ['jacob-t'], significance: '"His food will be rich; he will provide delicacies fit for a king" (Gen 49:20)', refs: ['Gen 30:13', 'Gen 49:20', 'Luke 2:36-38'], desc: 'The tribe settled the fertile coastal plain of northern Canaan. The prophetess Anna at the temple was from the tribe of Asher (Luke 2:36-38) — one of the few NT tribal identifications.' },
    { id: 'issachar', name: 'Issachar', generation: 1, parentIds: ['jacob-t'], significance: '"A raw-boned donkey lying down between two saddlebags" (Gen 49:14)', refs: ['Gen 30:18', 'Gen 49:14-15', '1 Chr 12:32'], desc: '1 Chronicles 12:32 praises the men of Issachar as "men who understood the times and knew what Israel should do" — making "sons of Issachar" a biblical image for wise discernment.' },
    { id: 'zebulun',  name: 'Zebulun',  generation: 1, parentIds: ['jacob-t'], significance: '"He will live by the seashore and become a haven for ships" (Gen 49:13)', refs: ['Gen 30:20', 'Gen 49:13', 'Isa 9:1', 'Matt 4:13'], desc: 'Territory in the lower Galilee region. Like Naphtali, Zebulun is named in Isaiah 9:1 and Matthew 4:13 as part of the "Galilee of the Gentiles" that would see great light.' },
    { id: 'joseph-t', name: 'Joseph', generation: 1, parentIds: ['jacob-t'], notable: true, significance: 'Beloved son; type of Christ as the rejected-then-exalted savior; his two sons (Manasseh, Ephraim) became separate tribes', refs: ['Gen 37-50', 'Acts 7:9-16', 'Ps 105:17-22'], desc: 'The most Christ-like figure in Genesis: beloved son, rejected by his brothers, sold for silver, wrongly condemned, exalted to the right hand of Pharaoh, saves many including his own brothers who tried to kill him, and reveals himself to them with forgiveness. Acts 7 and Hebrews read Joseph typologically. His two sons replaced him in the tribal list, giving Israel effectively 13 tribes (Levi had no territory).' },
    { id: 'ephraim',  name: 'Ephraim',  generation: 2, parentIds: ['joseph-t'], notable: true, significance: 'Dominant northern tribe; "Ephraim" becomes a synonym for the Northern Kingdom; the "lost" tribe returned to', refs: ['Gen 48:14-20', 'Isa 7:9', 'Hos 4-14', 'Ezek 37:16'], desc: 'Jacob deliberately crossed his hands to give Ephraim (the younger) the greater blessing over Manasseh — the pattern of the younger supplanting the elder that runs through Genesis. Ephraim became the dominant tribe of the North; Hosea addresses the Northern Kingdom almost entirely as "Ephraim."' },
    { id: 'manasseh', name: 'Manasseh', generation: 2, parentIds: ['joseph-t'], significance: 'Joseph\'s firstborn; received the secondary blessing but still became a significant tribe', refs: ['Gen 48:14-20', 'Num 32:39-42'], desc: 'Though passed over for the primary blessing, Manasseh received a significant allotment on both sides of the Jordan (Num 32).' },
    { id: 'benjamin', name: 'Benjamin', generation: 1, parentIds: ['jacob-t'], notable: true, significance: 'Youngest son; tribe of Saul (first king) and Paul ("a Benjaminite... a Hebrew of Hebrews")', refs: ['Gen 35:18', 'Gen 49:27', '1 Sam 9:1-2', 'Phil 3:5', 'Rom 11:1'], desc: 'Born as Rachel died — she named him Ben-Oni ("son of my sorrow") but Jacob renamed him Benjamin ("son of my right hand"). The tribe of Saul, the first king; also the tribe of the apostle Paul, who in Romans 11:1 uses his Benjaminite identity to argue "God has not rejected his people."' },
  ]
}

// ── 3. DAVIDIC ROYAL LINE ────────────────────────────────────────────────────
export const DAVIDIC_TREE: GenealogyTree = {
  id: 'davidic',
  label: 'Davidic Royal Line',
  subtitle: 'The Covenant Kings of Judah',
  desc: "The Davidic covenant (2 Sam 7) promised an eternal throne. The line ran from David through 20 kings of Judah — saints and sinners, reformers and apostates — until the Babylonian exile. Then in apparent silence for 600 years until Jesus of Nazareth, the carpenter's son from Bethlehem, was revealed as the heir.",
  nodes: [
    { id: 'd-david',  name: 'David',       generation: 0, parentIds: [], notable: true, dates: 'c. 1010-970 BC',
      significance: 'Covenant of eternal kingship; "a man after God\'s own heart"', refs: ['2 Sam 7', 'Ps 89', 'Acts 13:22'], desc: 'Established Jerusalem as the capital; brought the Ark there; desired to build the temple. The Davidic covenant is the OT\'s most direct promise of the Messiah.' },
    { id: 'd-solomon',name: 'Solomon',      generation: 1, parentIds: ['d-david'],  dates: 'c. 970-931 BC',
      significance: 'Built the First Temple; wisdom pointing to Christ; ended in apostasy', refs: ['1 Kgs 1-11', 'Ps 72'], desc: 'At his best, a type of the messianic king of peace and wisdom (Ps 72). At his worst, a warning against the compromise of accumulated wealth, women, and horses (Deut 17:16-17).' },
    { id: 'd-rehoboam',name: 'Rehoboam',   generation: 2, parentIds: ['d-solomon'], dates: '931-913 BC',
      significance: 'His folly split the kingdom; ruled only Judah thereafter', refs: ['1 Kgs 12', '2 Chr 10-12'], desc: 'Chose the counsel of young men over elders; Jeroboam led ten tribes in secession. The kingdom of David was divided — a wound the OT prophets longed to see healed (Ezek 37:15-28).' },
    { id: 'd-abijah',  name: 'Abijah',      generation: 3, parentIds: ['d-rehoboam'], dates: '913-911 BC', significance: 'Mixed reign; maintained the Davidic line', refs: ['1 Kgs 15:1-8', '2 Chr 13'], desc: 'His heart was not fully devoted to God but the lamp of David was not extinguished (1 Kgs 15:4).' },
    { id: 'd-asa',     name: 'Asa',         generation: 4, parentIds: ['d-abijah'],   dates: '911-870 BC', notable: true, significance: 'Faithful reformer for most of his reign; removed idols and deposed his grandmother from her position', refs: ['1 Kgs 15:9-24', '2 Chr 14-16'], desc: 'One of Judah\'s good kings. His failure in his later years (relying on Aram rather than God; imprisoning a prophet) shows that even the best kings needed a greater successor.' },
    { id: 'd-jehoshaphat', name: 'Jehoshaphat', generation: 5, parentIds: ['d-asa'], dates: '870-848 BC', notable: true, significance: 'Sent teachers of the Law throughout Judah; the battle where Judah sang and God fought', refs: ['1 Kgs 22', '2 Chr 17-20'], desc: '2 Chr 20 is one of the OT\'s great faith passages: Judah sang praise while God set ambushes against Moab and Ammon. His alliance with the wicked house of Ahab (marrying his son to Ahab\'s daughter) brought lasting spiritual damage.' },
    { id: 'd-jehoram', name: 'Jehoram',     generation: 6, parentIds: ['d-jehoshaphat'], dates: '848-841 BC', significance: 'Married Athaliah; killed his brothers; evil', refs: ['2 Kgs 8:16-24', '2 Chr 21'], desc: 'The house of Ahab\'s influence entered Judah through his marriage to Athaliah. He killed all his brothers. Yet "the LORD was not willing to destroy the house of David because of the covenant he had made with David" (2 Chr 21:7).' },
    { id: 'd-ahaziah-j', name: 'Ahaziah',   generation: 7, parentIds: ['d-jehoram'],  dates: '841 BC', significance: 'Killed by Jehu; reigned only one year', refs: ['2 Kgs 8:25-9:29'], desc: 'Walked in the ways of Ahab; died alongside Joram of Israel in Jehu\'s purge.' },
    { id: 'd-athaliah', name: 'Athaliah (Queen)', generation: 7, parentIds: ['d-jehoram'], dates: '841-835 BC', notable: true,
      significance: 'Usurped the throne; tried to kill all the royal seed; the Davidic line preserved by a priest', refs: ['2 Kgs 11', '2 Chr 22:10-23:21'], desc: 'The closest the Davidic line came to extinction before Christ. Athaliah killed all the royal children — except the infant Joash, hidden in the temple by Jehosheba. For six years, the covenant of David\'s eternal throne hung on a baby hidden in a priest\'s house.' },
    { id: 'd-joash',   name: 'Joash',       generation: 8, parentIds: ['d-ahaziah-j'], dates: '835-796 BC', notable: true, significance: 'Hidden infant who became king; good under Jehoiada; apostate after', refs: ['2 Kgs 11-12', '2 Chr 23-24'], desc: 'Hidden from Athaliah as an infant; crowned at age 7. His reign shows the power of spiritual mentorship — faithful while Jehoiada lived, apostate after his death, ordering the stoning of Zechariah the priest (Jehoiada\'s son) in the very temple court.' },
    { id: 'd-amaziah', name: 'Amaziah',     generation: 9, parentIds: ['d-joash'],  dates: '796-767 BC', significance: 'Mixed; defeated Edom but imported their gods', refs: ['2 Kgs 14:1-20', '2 Chr 25'], desc: 'Did what was right but not wholeheartedly. After defeating Edom, brought back their gods and worshipped them — one of the OT\'s most inexplicable apostasies.' },
    { id: 'd-uzziah',  name: 'Uzziah',      generation: 10, parentIds: ['d-amaziah'], dates: '792-740 BC', notable: true, significance: 'Powerful and prosperous; struck with leprosy for priestly presumption; Isaiah\'s call vision connected to his death', refs: ['2 Kgs 15:1-7', '2 Chr 26', 'Isa 6:1'], desc: '"In the year that King Uzziah died, I saw the Lord" (Isa 6:1). His leprosy for presuming to burn incense (the priests\'  exclusive role) is a concentrated lesson on the distinction of priestly and royal offices — a distinction Christ alone perfectly unites.' },
    { id: 'd-jotham',  name: 'Jotham',      generation: 11, parentIds: ['d-uzziah'],  dates: '750-735 BC', significance: 'Good king; built the Upper Gate', refs: ['2 Kgs 15:32-38', '2 Chr 27'], desc: 'Did right in the eyes of the LORD — one of the simpler evaluations in Kings. The high places remained.' },
    { id: 'd-ahaz',    name: 'Ahaz',         generation: 12, parentIds: ['d-jotham'],  dates: '735-715 BC', notable: true, significance: 'Most wicked Judean king before Manasseh; context of Isaiah 7 (Immanuel prophecy)', refs: ['2 Kgs 16', '2 Chr 28', 'Isa 7-8'], desc: 'Refused to ask God for a sign (Isa 7:12 — a false piety); appealed to Assyria instead of God; installed a pagan altar in the temple. Yet God gave the Immanuel sign anyway — "The virgin will conceive and give birth to a son" (Isa 7:14). The darkest reign produced one of the brightest promises.' },
    { id: 'd-hezekiah', name: 'Hezekiah',   generation: 13, parentIds: ['d-ahaz'],    dates: '715-686 BC', notable: true, significance: 'Greatest reforming king; trusted God at Sennacherib\'s invasion; the tunnel, the prayer, the 15 years', refs: ['2 Kgs 18-20', '2 Chr 29-32', 'Isa 36-39'], desc: 'Destroyed the bronze serpent (Nehushtan) that Israel had been worshipping — even a God-given object can become an idol. Faced Sennacherib\'s 185,000-man army with prayer and received miraculous deliverance. The Siloam Tunnel (still visitable today) is his engineering feat preparing Jerusalem\'s water supply for the siege.' },
    { id: 'd-manasseh', name: 'Manasseh',   generation: 14, parentIds: ['d-hezekiah'], dates: '697-642 BC', notable: true, significance: 'Longest reign; most wicked; shed innocent blood; yet repented in Babylon (2 Chr 33)', refs: ['2 Kgs 21:1-18', '2 Chr 33:1-20'], desc: 'His 55-year reign undid all of Hezekiah\'s reform. 2 Kings 23:26-27 blames him for the ultimate exile. Yet 2 Chronicles 33:10-20 records his capture, humbling, prayer, and partial restoration — one of the OT\'s most unexpected repentances. No one is beyond God\'s reach.' },
    { id: 'd-amon',    name: 'Amon',         generation: 15, parentIds: ['d-manasseh'], dates: '642-640 BC', significance: 'Followed Manasseh\'s evil ways; did not humble himself; assassinated', refs: ['2 Kgs 21:19-26', '2 Chr 33:21-25'], desc: 'The son who learned the wickedness but not the repentance.' },
    { id: 'd-josiah',  name: 'Josiah',       generation: 16, parentIds: ['d-amon'],    dates: '640-609 BC', notable: true, significance: 'The greatest reforming king; the Book of the Law found; Passover celebrated as never before', refs: ['2 Kgs 22-23', '2 Chr 34-35', '1 Kgs 13:2'], desc: 'At age 8 became king; at 16 began seeking God; at 20 began purging idolatry; at 26 the Book of the Law was discovered. His comprehensive reform destroyed every high place and idolatrous installation in Judah — and in what had been the Northern Kingdom. When he read the Law and wept, Huldah the prophetess told him he would not see the coming disaster because of his tender heart. Killed at Megiddo — an inexplicable death that shattered Judah.' },
    { id: 'd-jehoiakim', name: 'Jehoiakim', generation: 17, parentIds: ['d-josiah'],   dates: '609-598 BC', notable: true, significance: 'Burned Jeremiah\'s scroll; Nebuchadnezzar\'s vassal; Daniel deported in his reign', refs: ['2 Kgs 23:35-24:7', 'Jer 36', 'Dan 1:1-2'], desc: 'A mercenary king installed by Necho, then submitted to Babylon. His burning of Jeremiah\'s scroll (Jer 36) is one of history\'s most vivid scenes of human arrogance against the word of God — and God\'s response: "So Jeremiah took another scroll and dictated to Baruch all the words of the scroll that Jehoiakim king of Judah had burned in the fire."' },
    { id: 'd-jehoiachin', name: 'Jehoiachin', generation: 18, parentIds: ['d-jehoiakim'], dates: '598-597 BC', notable: true, significance: 'Taken to Babylon; ration tablets confirm his captivity; released after 37 years', refs: ['2 Kgs 24:8-17', '2 Kgs 25:27-30', 'Jer 52:31-34'], desc: 'Reigned only 3 months before surrendering to Nebuchadnezzar. Taken to Babylon with 10,000 of Jerusalem\'s leading citizens — including Ezekiel. Babylonian administrative tablets ("Yaukin king of Judah") confirm his captivity. Released by Evil-Merodach and given a seat of honor — 2 Kings ends with this glimmer of hope for the Davidic line.' },
    { id: 'd-zedekiah', name: 'Zedekiah',   generation: 17, parentIds: ['d-josiah'],   dates: '597-586 BC', notable: true, significance: 'Last king of Judah; Jerusalem fell on his watch; eyes put out; taken to Babylon in chains', refs: ['2 Kgs 24:18-25:21', 'Jer 37-39', 'Ezek 12:13'], desc: 'Placed by Nebuchadnezzar as a puppet king. Repeatedly consulted Jeremiah privately but refused to obey him publicly. Rebelled in 589 BC; Jerusalem fell July 586 BC. His sons killed before his eyes, then blinded — fulfilling both Jeremiah\'s and Ezekiel\'s prophecies. The last Davidic king to sit on the throne of Jerusalem — until the resurrection.' },
  ]
}

// ── 4. HIGH PRIESTS: Aaron → Zadok line ─────────────────────────────────────
export const PRIESTLY_TREE: GenealogyTree = {
  id: 'priestly',
  label: 'High Priestly Line',
  subtitle: 'Aaron → Zadok → The Second Temple',
  desc: "Aaron and his sons were consecrated as the first priests of Israel — a hereditary office that ran through the tribe of Levi. The Zadokite line (from Zadok, High Priest under David and Solomon) became the legitimate line for the Second Temple. Hebrews 7 argues that Jesus holds a greater priesthood — not from Aaron but from Melchizedek — superior in every way to the Levitical system.",
  nodes: [
    { id: 'levi-p',   name: 'Levi',        generation: 0, parentIds: [], significance: 'Father of the priestly tribe; scattered in Israel as God\'s portion', refs: ['Gen 29:34', 'Exod 32:26-29', 'Deut 10:8-9'], desc: 'Levi\'s descendants received no territorial allotment — God himself was their inheritance. The Levites\' zeal at the golden calf (Exod 32:26-29) consecrated them for priestly service.' },
    { id: 'kohath',   name: 'Kohath',      generation: 1, parentIds: ['levi-p'],  significance: 'Son of Levi; his clan carried the most holy things (Ark, etc.)', refs: ['Exod 6:16', 'Num 3:27-32', 'Num 4:4-20'], desc: 'The Kohathites carried the Ark of the Covenant and the most holy objects of the tabernacle — but could not look at them or touch them directly or they would die (Num 4:15-20).' },
    { id: 'amram',    name: 'Amram',       generation: 2, parentIds: ['kohath'],  significance: 'Father of Moses, Aaron, and Miriam — the three leaders of the Exodus', refs: ['Exod 6:18', 'Num 26:59', 'Heb 11:23'], desc: 'His wife Jochebed "hid Moses for three months" when Pharaoh ordered male infants killed — an act of faith commended in Hebrews 11:23.' },
    { id: 'aaron',    name: 'Aaron',       generation: 3, parentIds: ['amram'],   notable: true, spouse: 'Elisheba',
      significance: 'First High Priest of Israel; type of Christ\'s intercession, though imperfect (golden calf, Miriam affair)',
      refs: ['Exod 4:14', 'Exod 28-29', 'Lev 8-9', 'Lev 16', 'Heb 5:1-4', 'Heb 7:11'],
      desc: 'Appointed by God as Moses\'s spokesman and first High Priest. Consecrated with oil, blood, and elaborate garments to "bear the names of the sons of Israel" before God (Exod 28:12). His entry into the Holy of Holies on Yom Kippur (Lev 16) prefigures Christ\'s once-for-all entry into the true holy of holies (Heb 9:11-12). Yet he led the golden calf worship (Exod 32) — showing his priesthood needed to be superseded by a greater High Priest.' },
    { id: 'nadab',    name: 'Nadab',       generation: 4, parentIds: ['aaron'],   significant: true,
      significance: 'Offered unauthorized fire; consumed by fire from the LORD (Lev 10:1-3)',
      refs: ['Lev 10:1-3', 'Num 3:4'],
      desc: '"Aaron\'s sons Nadab and Abihu took their censers, put fire in them and added incense; and they offered unauthorized fire before the LORD, contrary to his command. So fire came out from the presence of the LORD and consumed them." Lev 10:3: "Among those who approach me I will be proved holy." No New Testament commentary on this event — the silence heightens the gravity.' },
    { id: 'abihu',    name: 'Abihu',       generation: 4, parentIds: ['aaron'],   significance: 'Offered unauthorized fire alongside Nadab; both consumed', refs: ['Lev 10:1-3', 'Num 3:4'], desc: 'Died with Nadab for the same offense. Their deaths meant the priesthood passed to Eleazar and Ithamar.' },
    { id: 'eleazar',  name: 'Eleazar',     generation: 4, parentIds: ['aaron'],   notable: true, significance: 'Aaron\'s third son; succeeded Aaron as High Priest; the Zadokite line runs through him', refs: ['Num 20:22-29', 'Num 25:7-13', 'Josh 14:1', 'Heb 7:5'], desc: 'Eleazar\'s zeal in the Baal-Peor incident (Num 25:7-13 — stopping the plague by executing Zimri and Cozbi) won God\'s covenant of a lasting priesthood for his line. Joshua\'s land distribution was done with Eleazar as high priest.' },
    { id: 'phinehas', name: 'Phinehas',    generation: 5, parentIds: ['eleazar'], notable: true,
      significance: 'His zeal stopped the plague at Baal-Peor; received the covenant of a lasting priesthood',
      refs: ['Num 25:7-13', 'Ps 106:30-31'],
      desc: 'Phinehas\'s action in Numbers 25 is cited in Psalm 106:30-31: "Phinehas stood up and intervened, and the plague was checked. This was credited to him as righteousness for endless generations to come." The covenant of peace and lasting priesthood given to him (Num 25:12-13) runs through the Zadokite line.' },
    { id: 'zadok',    name: 'Zadok',       generation: 8, parentIds: ['phinehas'], notable: true,
      significance: 'High Priest under David and Solomon; loyal to David during Absalom\'s revolt; the "Zadokite" line becomes the legitimate priestly line',
      refs: ['2 Sam 8:17', '1 Kgs 1:8', '1 Kgs 2:35', 'Ezek 40:46', 'Ezek 44:15'],
      desc: 'Remained loyal to David when Abiathar sided with Adonijah (1 Kgs 1). Solomon expelled Abiathar (fulfilling the prophecy of 1 Sam 2:31-35) and installed Zadok as sole high priest. Ezekiel\'s vision of the restored temple specifically honors "the Zadokite priests" who "did not go astray" (Ezek 44:15). The Qumran community (Dead Sea Scrolls) considered themselves the true heirs of the Zadokite line.' },
    { id: 'melchizedek', name: 'Melchizedek', generation: 0, parentIds: [], notable: true,
      significance: 'Priest-king of Salem; appears without genealogy; type of Christ\'s eternal priesthood (Ps 110; Heb 7)',
      refs: ['Gen 14:18-20', 'Ps 110:4', 'Heb 5:6', 'Heb 6:20', 'Heb 7:1-28'],
      desc: 'Appears to Abraham after the defeat of the four kings — brings out bread and wine, blesses Abraham, receives a tithe. "Without father or mother, without genealogy, without beginning of days or end of life, like the Son of God he remains a priest forever" (Heb 7:3). Hebrews 7 argues that since Levi (in the loins of Abraham) paid tithe to Melchizedek, the Melchizedekian priesthood is superior to the Levitical — and Jesus holds the Melchizedekian order (Ps 110:4), making him the eternal High Priest who supersedes Aaron.' },
  ]
}

export const ALL_TREES: GenealogyTree[] = [
  PATRIARCHAL_TREE,
  TWELVE_TRIBES_TREE,
  DAVIDIC_TREE,
  PRIESTLY_TREE,
]
