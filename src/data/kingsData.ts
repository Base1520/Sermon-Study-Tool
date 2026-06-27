// Kings of Israel and Judah — data for the KingsList tile
// Synchronized by BC dates so both kingdoms can be displayed side-by-side

export type SpiritualRating = 'good' | 'mixed' | 'evil' | 'best'

export interface King {
  id: string
  name: string
  startBC: number   // negative = BC
  endBC: number     // negative = BC
  reignYears: number
  rating: SpiritualRating
  desc: string
  biblicalRef: string
  notes?: string    // key event / archaeological note
}

// ── JUDAH (southern kingdom, 931 – 586 BC) ─────────────────────────────────
export const JUDAH_KINGS: King[] = [
  {
    id: 'ju-rehoboam', name: 'Rehoboam', startBC: -931, endBC: -913, reignYears: 17,
    rating: 'evil',
    desc: 'Caused the kingdom to split by refusing wise counsel. Led Judah into idolatry.',
    biblicalRef: '1 Kgs 12-14; 2 Chr 10-12',
    notes: 'Shishak of Egypt plundered Jerusalem in his 5th year (925 BC). Confirmed by Shishak\'s own relief at Karnak.'
  },
  {
    id: 'ju-abijah', name: 'Abijah', startBC: -913, endBC: -911, reignYears: 3,
    rating: 'mixed',
    desc: 'Fought against Jeroboam I and won a great battle. His heart was not fully devoted to the LORD.',
    biblicalRef: '1 Kgs 15:1-8; 2 Chr 13',
    notes: 'The parallel account in 2 Chr 13 gives him credit for trusting God in battle against Israel.'
  },
  {
    id: 'ju-asa', name: 'Asa', startBC: -911, endBC: -870, reignYears: 41,
    rating: 'good',
    desc: 'Long, generally faithful reign. Removed idols, deposed his grandmother Maakah. Relied on Aram rather than God in later years.',
    biblicalRef: '1 Kgs 15:9-24; 2 Chr 14-16',
    notes: 'Rebuked by the prophet Hanani for alliance with Aram-Damascus. Died with foot disease he sought physicians for rather than God.'
  },
  {
    id: 'ju-jehoshaphat', name: 'Jehoshaphat', startBC: -870, endBC: -848, reignYears: 25,
    rating: 'good',
    desc: 'One of Judah\'s best kings. Sent priests and Levites to teach the Law throughout Judah. Allied with wicked Ahab — a persistent weakness.',
    biblicalRef: '1 Kgs 22; 2 Chr 17-20',
    notes: '2 Chr 20 — the Battle of Beracah: Judah defeated Moab and Ammon by singing praise while God set ambushes.'
  },
  {
    id: 'ju-jehoram', name: 'Jehoram', startBC: -848, endBC: -841, reignYears: 8,
    rating: 'evil',
    desc: 'Married Ahab\'s daughter Athaliah. Murdered his brothers. Led Judah into Baal worship. Edom revolted under his reign.',
    biblicalRef: '2 Kgs 8:16-24; 2 Chr 21',
    notes: 'Received a letter of judgment from Elijah. Died of a terrible intestinal disease, "unmourned."'
  },
  {
    id: 'ju-ahaziah', name: 'Ahaziah', startBC: -841, endBC: -841, reignYears: 1,
    rating: 'evil',
    desc: 'Son of Jehoram and Athaliah. Walked in the ways of Ahab. Killed by Jehu along with Joram of Israel.',
    biblicalRef: '2 Kgs 8:25-9:29; 2 Chr 22:1-9',
  },
  {
    id: 'ju-athaliah', name: 'Athaliah (Queen)', startBC: -841, endBC: -835, reignYears: 6,
    rating: 'evil',
    desc: 'Daughter of Ahab and Jezebel. Seized the throne after her son\'s death by killing all royal offspring (missing Joash). The only non-Davidic ruler of Judah.',
    biblicalRef: '2 Kgs 11; 2 Chr 22:10-23:21',
    notes: 'Joash hidden in the temple by the priest Jehoiada for 6 years. Athaliah executed when Joash was crowned.'
  },
  {
    id: 'ju-joash', name: 'Joash', startBC: -835, endBC: -796, reignYears: 40,
    rating: 'mixed',
    desc: 'Repaired the temple while Jehoiada the priest lived. After Jehoiada\'s death turned to idolatry and had Jehoiada\'s son Zechariah stoned.',
    biblicalRef: '2 Kgs 12; 2 Chr 23-24',
    notes: 'Temple repair described in detail — the first recorded temple renovation. Assassinated by his servants.'
  },
  {
    id: 'ju-amaziah', name: 'Amaziah', startBC: -796, endBC: -767, reignYears: 29,
    rating: 'mixed',
    desc: 'Did right but not wholeheartedly. Defeated Edom but brought back their gods. Foolishly challenged Israel and was captured.',
    biblicalRef: '2 Kgs 14; 2 Chr 25',
  },
  {
    id: 'ju-uzziah', name: 'Uzziah (Azariah)', startBC: -792, endBC: -740, reignYears: 52,
    rating: 'good',
    desc: 'One of Judah\'s most powerful kings. Built extensive military. Contracted leprosy for presumptuously burning incense in the temple — the priests\' domain.',
    biblicalRef: '2 Kgs 15:1-7; 2 Chr 26',
    notes: 'Isaiah\'s call vision is dated "in the year that King Uzziah died" (Isa 6:1). The Uzziah Tablet in Jerusalem (2nd century BC) records his reburial: "Here were brought the bones of Uzziah, King of Judah — do not open."'
  },
  {
    id: 'ju-jotham', name: 'Jotham', startBC: -750, endBC: -735, reignYears: 16,
    rating: 'good',
    desc: 'Did right in the eyes of the LORD. Built the Upper Gate of the temple. But the high places remained.',
    biblicalRef: '2 Kgs 15:32-38; 2 Chr 27',
  },
  {
    id: 'ju-ahaz', name: 'Ahaz', startBC: -735, endBC: -715, reignYears: 20,
    rating: 'evil',
    desc: 'Most wicked king of Judah. Made his son pass through fire. Appealed to Tiglath-Pileser III against the Syro-Ephraimite coalition (against Isaiah\'s counsel). Installed an Assyrian altar in the temple.',
    biblicalRef: '2 Kgs 16; 2 Chr 28; Isa 7-8',
    notes: 'The Syro-Ephraimite War is the historical setting of Isaiah 7 (the Immanuel prophecy). Ahaz\'s name appears on an ancient seal ("seal of Ahaz").'
  },
  {
    id: 'ju-hezekiah', name: 'Hezekiah', startBC: -715, endBC: -686, reignYears: 29,
    rating: 'best',
    desc: 'The greatest reforming king of Judah after David. Destroyed the high places (uniquely). Trusted God when Sennacherib besieged Jerusalem. 185,000 Assyrians killed by the angel of the LORD overnight. Fifteen years added to his life.',
    biblicalRef: '2 Kgs 18-20; 2 Chr 29-32; Isa 36-39',
    notes: 'The Siloam Tunnel inscription (701 BC) records the tunnel\'s construction. LMLK ("to the king") storage jar handles from his reign are abundant. The broad wall and Siloam Pool are major Jerusalem archaeological features from his reign.'
  },
  {
    id: 'ju-manasseh', name: 'Manasseh', startBC: -697, endBC: -642, reignYears: 55,
    rating: 'evil',
    desc: 'Longest reign, most wicked king of Judah. Rebuilt high places, erected Baal altars in the temple, sacrificed his son, practiced sorcery. Shed much innocent blood. Later repented after being taken to Babylon (2 Chr 33:11-20).',
    biblicalRef: '2 Kgs 21:1-18; 2 Chr 33:1-20',
    notes: 'Mentioned in Assyrian records (Esarhaddon\'s annals) as a vassal. His reign is blamed for the ultimate exile of Judah (2 Kgs 23:26-27).'
  },
  {
    id: 'ju-amon', name: 'Amon', startBC: -642, endBC: -640, reignYears: 2,
    rating: 'evil',
    desc: 'Followed his father Manasseh\'s evil ways. Did not humble himself as Manasseh did. Assassinated by his servants after two years.',
    biblicalRef: '2 Kgs 21:19-26; 2 Chr 33:21-25',
  },
  {
    id: 'ju-josiah', name: 'Josiah', startBC: -640, endBC: -609, reignYears: 31,
    rating: 'best',
    desc: 'The greatest king of Judah. Found the Book of the Law; enacted the most thorough religious reform in Israel\'s history. Destroyed all high places, Bethel\'s altar, the Asherah, and foreign worship. Celebrated Passover not seen since the judges. Killed at Megiddo opposing Pharaoh Necho.',
    biblicalRef: '2 Kgs 22-23; 2 Chr 34-35',
    notes: 'Josiah was prophesied by name 300 years before his birth (1 Kgs 13:2; 2 Kgs 23:16-18). His death is mourned in Zechariah 12:11 ("the mourning of Hadad Rimmon in the plain of Megiddo").'
  },
  {
    id: 'ju-jehoahaz', name: 'Jehoahaz', startBC: -609, endBC: -609, reignYears: 0.25,
    rating: 'evil',
    desc: 'Reigned 3 months; deposed and taken to Egypt by Pharaoh Necho, where he died. Never returned.',
    biblicalRef: '2 Kgs 23:31-34; 2 Chr 36:1-4',
  },
  {
    id: 'ju-jehoiakim', name: 'Jehoiakim', startBC: -609, endBC: -598, reignYears: 11,
    rating: 'evil',
    desc: 'Installed by Necho; later became Nebuchadnezzar\'s vassal, then rebelled. Cut up and burned Jeremiah\'s scroll. Died before being taken to Babylon.',
    biblicalRef: '2 Kgs 23:35-24:7; 2 Chr 36:5-8; Jer 36',
    notes: 'First deportation to Babylon (605 BC, including Daniel) occurred in his reign (Dan 1:1-2).'
  },
  {
    id: 'ju-jehoiachin', name: 'Jehoiachin', startBC: -598, endBC: -597, reignYears: 0.25,
    rating: 'evil',
    desc: 'Reigned 3 months. Surrendered to Nebuchadnezzar; taken to Babylon in 597 BC with 10,000 leading citizens (including Ezekiel). Released by Evil-Merodach after 37 years.',
    biblicalRef: '2 Kgs 24:8-17; 24:27-30; 2 Chr 36:9-10; Jer 52:31-34',
    notes: 'Ration tablets found in Babylon mention "Yaukin king of Judah" (Jehoiachin) receiving oil — direct extrabiblical confirmation.'
  },
  {
    id: 'ju-zedekiah', name: 'Zedekiah', startBC: -597, endBC: -586, reignYears: 11,
    rating: 'evil',
    desc: 'Last king of Judah. Placed by Nebuchadnezzar. Ignored Jeremiah\'s counsel repeatedly. Rebelled against Babylon in 589 BC. Jerusalem fell in 586 BC. His sons were killed before his eyes; he was blinded and taken to Babylon in chains.',
    biblicalRef: '2 Kgs 24:18-25:21; Jer 37-39; 52',
    notes: 'The Lachish Letters (ostraca found at Lachish) — written during the Babylonian siege, mentioning "we are watching for the signals of Lachish" (cf. Jer 34:7) — date to this exact period.'
  },
]

// ── ISRAEL (northern kingdom, 931 – 722 BC) ────────────────────────────────
export const ISRAEL_KINGS: King[] = [
  {
    id: 'is-jeroboam1', name: 'Jeroboam I', startBC: -931, endBC: -910, reignYears: 22,
    rating: 'evil',
    desc: 'Founded the northern kingdom. Installed golden calves at Bethel and Dan ("here are your gods, O Israel"). Established illegitimate priests and feasts. Became the prototype of every wicked king of Israel.',
    biblicalRef: '1 Kgs 11:26-14:20',
    notes: '"The sins of Jeroboam" is used as the standard indictment of every subsequent northern king.'
  },
  {
    id: 'is-nadab', name: 'Nadab', startBC: -910, endBC: -909, reignYears: 2,
    rating: 'evil',
    desc: 'Son of Jeroboam I. Did evil as his father. Killed by Baasha while besieging Gibbethon.',
    biblicalRef: '1 Kgs 15:25-31',
  },
  {
    id: 'is-baasha', name: 'Baasha', startBC: -909, endBC: -886, reignYears: 24,
    rating: 'evil',
    desc: 'Killed Nadab and exterminated the house of Jeroboam, fulfilling Ahijah\'s prophecy. Yet continued the sins of Jeroboam. Condemned by the prophet Jehu ben Hanani.',
    biblicalRef: '1 Kgs 15:27-16:7',
  },
  {
    id: 'is-elah', name: 'Elah', startBC: -886, endBC: -885, reignYears: 2,
    rating: 'evil',
    desc: 'Son of Baasha. Killed by Zimri while drunk in the house of his steward.',
    biblicalRef: '1 Kgs 16:8-14',
  },
  {
    id: 'is-zimri', name: 'Zimri', startBC: -885, endBC: -885, reignYears: 0.019,
    rating: 'evil',
    desc: 'Reigned only 7 days. Killed Elah and the entire house of Baasha. When the army heard, they made Omri king. Zimri burned the palace over himself.',
    biblicalRef: '1 Kgs 16:15-20',
    notes: '"You are like Zimri, who murdered his master" (2 Kgs 9:31) — Zimri became a byword for treachery.'
  },
  {
    id: 'is-omri', name: 'Omri', startBC: -885, endBC: -874, reignYears: 12,
    rating: 'evil',
    desc: 'Founded the Omride dynasty and the city of Samaria. More evil than all before him. Yet politically the most powerful Israelite king — Assyrian records call Israel "the house of Omri" for a century after his dynasty ended.',
    biblicalRef: '1 Kgs 16:21-28',
    notes: 'The Mesha Stele (Moabite Stone) mentions "Omri king of Israel" — one of the clearest extrabiblical confirmations of an Israelite king. The Tel Dan Stele also references "the house of Omri."'
  },
  {
    id: 'is-ahab', name: 'Ahab', startBC: -874, endBC: -853, reignYears: 22,
    rating: 'evil',
    desc: 'Most notorious king of Israel. Married Jezebel of Sidon; built Baal temple in Samaria; erected an Asherah pole. Central antagonist to Elijah. Naboth\'s vineyard. Died in battle at Ramoth-Gilead; dogs licked his blood as Elijah prophesied.',
    biblicalRef: '1 Kgs 16:29-22:40',
    notes: 'The Battle of Qarqar (853 BC) — recorded in Shalmaneser III\'s Kurkh Monolith — lists "2,000 chariots of Ahab the Israelite." The Samaria Ivories from his palace are in the Rockefeller Museum.'
  },
  {
    id: 'is-ahaziah', name: 'Ahaziah (Israel)', startBC: -853, endBC: -852, reignYears: 2,
    rating: 'evil',
    desc: 'Son of Ahab and Jezebel. Fell through a lattice; inquired of Baal-Zebub of Ekron. Condemned by Elijah. Died without a son; Joram succeeded him.',
    biblicalRef: '1 Kgs 22:51-2 Kgs 1',
  },
  {
    id: 'is-joram', name: 'Joram', startBC: -852, endBC: -841, reignYears: 12,
    rating: 'mixed',
    desc: 'Son of Ahab. Put away the Baal pillar but clung to Jeroboam\'s sins. The ministry of Elisha fills his reign. Killed by Jehu.',
    biblicalRef: '2 Kgs 3-9',
    notes: 'Elisha\'s ministry — healing Naaman, the floating axe head, the Aramean siege of Samaria, raising the Shunammite\'s son — all occur under Joram.'
  },
  {
    id: 'is-jehu', name: 'Jehu', startBC: -841, endBC: -814, reignYears: 28,
    rating: 'mixed',
    desc: 'Anointed by Elisha\'s emissary to destroy the house of Ahab. Killed Joram, Jezebel, and 70 sons of Ahab; destroyed the Baal worshippers. But did not turn from Jeroboam\'s sins. Israel began to lose territory under Aramean pressure.',
    biblicalRef: '2 Kgs 9-10',
    notes: 'Jehu paying tribute to Shalmaneser III is depicted on the Black Obelisk in the British Museum — the only portrait of an Israelite king in existence.'
  },
  {
    id: 'is-jehoahaz', name: 'Jehoahaz', startBC: -814, endBC: -798, reignYears: 17,
    rating: 'evil',
    desc: 'Israel severely oppressed by Hazael and Ben-Hadad of Aram throughout his reign. His army reduced to 50 horsemen, 10 chariots, and 10,000 infantry.',
    biblicalRef: '2 Kgs 13:1-9',
  },
  {
    id: 'is-jehoash', name: 'Jehoash', startBC: -798, endBC: -782, reignYears: 16,
    rating: 'evil',
    desc: 'Visited dying Elisha. Shot arrows as Elisha instructed — but struck only three times, indicating incomplete victory over Aram. Defeated Amaziah of Judah; plundered Jerusalem.',
    biblicalRef: '2 Kgs 13:10-14:16',
  },
  {
    id: 'is-jeroboam2', name: 'Jeroboam II', startBC: -793, endBC: -753, reignYears: 41,
    rating: 'evil',
    desc: 'Longest reign of any Israelite king. Restored Israel\'s borders from Lebo Hamath to the Dead Sea — unprecedented prosperity. Yet continued Jeroboam I\'s sins. The prophets Amos and Hosea both condemned the social injustice and religious corruption of this golden age.',
    biblicalRef: '2 Kgs 14:23-29; Amos; Hosea',
    notes: 'The Samaria Ostraca — 63 administrative records of wine and oil — date to his reign, documenting the elite luxury Amos condemns.'
  },
  {
    id: 'is-zechariah', name: 'Zechariah', startBC: -753, endBC: -752, reignYears: 0.5,
    rating: 'evil',
    desc: 'Son of Jeroboam II; last of the Jehu dynasty (fulfilling God\'s promise of four generations, 2 Kgs 10:30). Reigned 6 months; killed by Shallum.',
    biblicalRef: '2 Kgs 15:8-12',
  },
  {
    id: 'is-shallum', name: 'Shallum', startBC: -752, endBC: -752, reignYears: 0.083,
    rating: 'evil',
    desc: 'Reigned 1 month. Assassinated Zechariah; killed by Menahem.',
    biblicalRef: '2 Kgs 15:13-16',
  },
  {
    id: 'is-menahem', name: 'Menahem', startBC: -752, endBC: -742, reignYears: 10,
    rating: 'evil',
    desc: 'Brutally attacked Tiphsah. Paid Tiglath-Pileser III 1,000 talents of silver to support his rule — taxing the wealthy landowners 50 shekels each.',
    biblicalRef: '2 Kgs 15:17-22',
    notes: 'Menahem is confirmed in Tiglath-Pileser III\'s Annals as paying tribute: "Menihimme of Samerina."'
  },
  {
    id: 'is-pekahiah', name: 'Pekahiah', startBC: -742, endBC: -740, reignYears: 2,
    rating: 'evil',
    desc: 'Son of Menahem. Killed by Pekah in a coup at Samaria.',
    biblicalRef: '2 Kgs 15:23-26',
  },
  {
    id: 'is-pekah', name: 'Pekah', startBC: -752, endBC: -732, reignYears: 20,
    rating: 'evil',
    desc: 'Allied with Rezin of Aram to attack Judah — the Syro-Ephraimite War (context of Isaiah 7). Tiglath-Pileser III conquered much of Israel and deported many Israelites. Assassinated by Hoshea.',
    biblicalRef: '2 Kgs 15:27-16:5; Isa 7',
  },
  {
    id: 'is-hoshea', name: 'Hoshea', startBC: -732, endBC: -722, reignYears: 9,
    rating: 'evil',
    desc: 'Last king of Israel. Made an alliance with Egypt against Assyria — a foolish betrayal of Shalmaneser V. Imprisoned by Shalmaneser. Samaria fell after a 3-year siege in 722 BC; 27,290 Israelites deported by Sargon II.',
    biblicalRef: '2 Kgs 17:1-23',
    notes: 'The fall of Samaria marked the end of the northern kingdom. 2 Kings 17 is the theological autopsy: "This happened because the Israelites sinned against the LORD their God."'
  },
]
