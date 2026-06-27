import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { PERSON_BIOS } from '../data/personBios'
import { useNodeId, useStore, useReactFlow, NodeResizer } from '@xyflow/react'
import { BASE } from '../theme'
import { useAssetImages, findImage } from '../hooks/useAssetImages'

// ── Theme — matches phrasing diagram palette ───────────────────────────────────
const GOLD   = BASE.gold
const KHAKI  = BASE.khaki
const STEEL  = BASE.steel
const BG     = '#1d2417'   // BASE.bgCard — same as phrasing card bg



// ── Time constants ─────────────────────────────────────────────────────────────
const YEAR_MIN  = -1100
const YEAR_MAX  = 120
const FULL_SPAN = YEAR_MAX - YEAR_MIN   // 1220 yrs

// ── Row layout ─────────────────────────────────────────────────────────────────
const LABEL_W = 88
const ROW_H   = 24
const ROW_GAP = 4

const ROWS = [
  { key:'egypt',    label:'EGYPT',       color:'#c09060', y:0   },
  { key:'assyria',  label:'ASSYRIA',     color:'#9060b0', y:32  },
  { key:'babylon',  label:'BABYLON',     color:'#c07030', y:64  },
  { key:'persia',   label:'PERSIA/MEDES',color:'#50a080', y:96  },
  { key:'greece',   label:'GREECE',      color:'#5080b0', y:128 },
  { key:'rome',     label:'ROME',        color:'#a05050', y:160 },
  { key:'sep1',     label:'',            color:'',        y:196 }, // separator
  { key:'prophets', label:'PROPHETS',    color: KHAKI,    y:204 },
  { key:'judah',    label:'JUDAH',       color:'#7090c0', y:236 },
  { key:'israel',   label:'ISRAEL',      color:'#c07070', y:316 },
]

const CONTENT_H = 400  // total canvas height

// ── Data types ─────────────────────────────────────────────────────────────────
interface Ruler { id:string; name:string; start:number; end:number; desc:string; refs?:string[] }
interface WorldEvent { year:number; label:string; desc:string; color?:string }
interface Connection { fromId:string; toId:string; label:string; year:number }

// ── Egypt ──────────────────────────────────────────────────────────────────────
const EGYPT: Ruler[] = [
  { id:'eg-thutmose',  name:'Thutmose III',    start:-1479,end:-1425, desc:'Possible pharaoh of oppression. Brought Egypt to peak power with 17 campaigns in Canaan.',refs:['Ex 1-2 (possible)'] },
  { id:'eg-ramesses',  name:'Ramesses II',      start:-1279,end:-1213, desc:'Popular candidate for pharaoh of the Exodus. Extensive building projects using forced labor.',refs:['Ex 5-14 (possible)'] },
  { id:'eg-shishak',   name:'Shishak (Shoshenq)',start:-945,end:-924,  desc:'Raided Jerusalem in Rehoboam\'s 5th year, plundering the temple treasures and the shields of gold.',refs:['1 Kgs 14:25-26','2 Chr 12'] },
  { id:'eg-tirhakah',  name:'Tirhakah',         start:-690,end:-664,  desc:'Cushite pharaoh; Hezekiah appealed to him when Sennacherib threatened Jerusalem (2 Kgs 19:9).',refs:['2 Kgs 19:9'] },
  { id:'eg-necho',     name:'Pharaoh Necho II', start:-610,end:-595,  desc:'Killed Josiah at Megiddo (609 BC); temporarily controlled Judah; deposed Jehoahaz, installed Jehoiakim.',refs:['2 Kgs 23:29-35','Jer 46'] },
  { id:'eg-hophra',    name:'Pharaoh Hophra',   start:-589,end:-570,  desc:'Egypt that Zedekiah foolishly trusted against Babylon; briefly diverted Nebuchadnezzar\'s siege of Jerusalem.',refs:['Jer 37:5-11','Ezek 29:6-7'] },
]

// ── Assyria ─────────────────────────────────────────────────────────────────────
const ASSYRIA: Ruler[] = [
  { id:'as-shalm3',   name:'Shalmaneser III', start:-858,end:-824, desc:'First Assyrian king to mention Israel. Battled a coalition including Ahab at Qarqar (853 BC). Jehu later paid him tribute (Black Obelisk).',refs:['1 Kgs 22:1 (context)'] },
  { id:'as-tiglath',  name:'Tiglath-Pileser III',start:-745,end:-727,desc:'Invaded Israel during Pekah\'s reign; carried away much of the population. Ahaz submitted to him against the Syro-Ephraimite threat.',refs:['2 Kgs 15:29','2 Kgs 16:7-10','Isa 7'] },
  { id:'as-shalm5',   name:'Shalmaneser V',   start:-727,end:-722, desc:'Besieged Samaria for 3 years after Hoshea made alliance with Egypt. Died during the siege.',refs:['2 Kgs 17:3-5'] },
  { id:'as-sargon',   name:'Sargon II',        start:-722,end:-705, desc:'Completed the fall of Samaria (722 BC); deported Israelites and repopulated with foreign peoples — origin of the Samaritans.',refs:['2 Kgs 17:6','Isa 20'] },
  { id:'as-sennach',  name:'Sennacherib',      start:-705,end:-681, desc:'Invaded Judah, taking 46 walled cities. Besieged Jerusalem under Hezekiah; 185,000 Assyrian troops killed by the angel of the LORD overnight.',refs:['2 Kgs 18-19','Isa 36-37','2 Chr 32'] },
  { id:'as-esarh',    name:'Esarhaddon',       start:-681,end:-669, desc:'Conquered Egypt (671 BC). Manasseh of Judah was briefly his vassal and taken to Babylon.',refs:['2 Kgs 19:37','2 Chr 33:11'] },
  { id:'as-ashurb',   name:'Ashurbanipal',     start:-669,end:-631, desc:'Last great Assyrian king; amassed the great library at Nineveh. Empire began to unravel after his death.',refs:['Ezra 4:10 (Osnapper)'] },
]

// ── Babylon ────────────────────────────────────────────────────────────────────
const BABYLON: Ruler[] = [
  { id:'ba-nabopol',  name:'Nabopolassar',     start:-626,end:-605, desc:'Founded the Neo-Babylonian empire. Allied with Medes to destroy Nineveh (612 BC). Father of Nebuchadnezzar.',refs:['Jer 25:9'] },
  { id:'ba-nebuch',   name:'Nebuchadnezzar II',start:-605,end:-562, desc:'Greatest Babylonian king. Three deportations: 605 BC (Daniel), 597 BC (Ezekiel/Jehoiachin), 586 BC (Jerusalem falls). Destroyed the temple.',refs:['2 Kgs 24-25','Dan 1-4','Jer 39','Ezek 1:1-3'] },
  { id:'ba-evilmer',  name:'Evil-Merodach',    start:-562,end:-560, desc:'Released Jehoiachin from prison after 37 years and gave him a seat of honor at the royal table.',refs:['2 Kgs 25:27-30','Jer 52:31-34'] },
  { id:'ba-nerigl',   name:'Neriglissar',      start:-560,end:-556, desc:'Son-in-law of Nebuchadnezzar; brief reign. Possibly the Nergal-Sharezer in Jeremiah 39.',refs:['Jer 39:3'] },
  { id:'ba-nabonid',  name:'Nabonidus',        start:-556,end:-539, desc:'Last Babylonian king; devoted to the moon god Sin; left Babylon for 10 years. His son Belshazzar served as co-regent.',refs:['Dan 5'] },
]

// ── Persia ──────────────────────────────────────────────────────────────────────
const PERSIA: Ruler[] = [
  { id:'pe-cyrus',    name:'Cyrus the Great',  start:-559,end:-530, desc:'Conquered Babylon in 539 BC. Issued the decree allowing Jews to return and rebuild the temple — fulfilling Isaiah 44:28 by name 150 years in advance.',refs:['Ezra 1:1-4','Isa 44:28','Isa 45:1','2 Chr 36:22-23'] },
  { id:'pe-camb',     name:'Cambyses II',      start:-530,end:-522, desc:'Son of Cyrus; conquered Egypt (525 BC). Temple work was halted during this period of instability.',refs:['Ezra 4:6 (possibly)'] },
  { id:'pe-darius1',  name:'Darius I (the Great)',start:-522,end:-486,desc:'Authorized resumption of temple construction; temple completed in 516 BC under his reign. Battle of Marathon (490 BC). Possibly "Darius the Mede" of Daniel.',refs:['Ezra 5-6','Dan 6:1','Hag 1:1','Zech 1:1'] },
  { id:'pe-xerxes',   name:'Xerxes I (Ahasuerus)',start:-486,end:-465,desc:'The Ahasuerus of Esther; led Persian invasion of Greece (Thermopylae, 480 BC). Esther became queen; Haman\'s plot against the Jews foiled.',refs:['Est 1:1','Ezra 4:6'] },
  { id:'pe-artax1',   name:'Artaxerxes I',     start:-465,end:-424, desc:'Authorized Ezra\'s return (458 BC) and Nehemiah\'s mission to rebuild Jerusalem\'s walls (445 BC). Crucial for Daniel\'s 70-weeks prophecy.',refs:['Ezra 7:1','Neh 2:1','Dan 9:25'] },
  { id:'pe-darius3',  name:'Darius III',       start:-336,end:-330, desc:'Last Persian king; defeated by Alexander the Great at Issus (333 BC) and Gaugamela (331 BC), ending the Persian empire.',refs:['Dan 8:20 (typologically)'] },
]

// ── Greece ────────────────────────────────────────────────────────────────────
const GREECE: Ruler[] = [
  { id:'gr-alex',     name:'Alexander the Great',start:-336,end:-323, desc:'Conquered Persian empire with stunning speed. Spread Greek culture (Hellenism) throughout the Near East — the cultural backdrop of the NT world.',refs:['Dan 8:5-8','Dan 11:3'] },
  { id:'gr-ptol',     name:'Ptolemaic Egypt',   start:-323,end:-198, desc:'Alexander\'s general Ptolemy controlled Egypt and Judea. The Jewish Diaspora in Alexandria flourished; Septuagint (LXX) translated here.',refs:['Dan 11:5-9'] },
  { id:'gr-seleu',    name:'Seleucid Syria',    start:-312,end:-63,  desc:'Alexander\'s general Seleucus controlled Syria. Judea caught between Ptolemies and Seleucids — the context of Daniel 11\'s "king of the north/south."',refs:['Dan 11:6-20'] },
  { id:'gr-antiochus',name:'Antiochus IV Epiphanes',start:-175,end:-164,desc:'Desecrated the Jerusalem temple (167 BC): offered pigs on the altar, erected Zeus statue — "the abomination of desolation." Sparked the Maccabean revolt.',refs:['Dan 8:9-14','Dan 11:21-35','1 Macc 1'] },
  { id:'gr-hasmone',  name:'Hasmonean Kingdom',start:-164,end:-63,  desc:'Maccabean independence; rededicated the temple (Hanukkah, 164 BC). Jewish self-rule until Rome under Pompey (63 BC).',refs:['1 Macc','Dan 11:32-35'] },
]

// ── Rome ──────────────────────────────────────────────────────────────────────
const ROME: Ruler[] = [
  { id:'ro-pompey',   name:'Pompey',            start:-106,end:-48,  desc:'Conquered Jerusalem in 63 BC, ending Jewish independence. Entered the Holy of Holies — a profound desecration though he took nothing.',refs:['Josephus, Ant. 14'] },
  { id:'ro-herod',    name:'Herod the Great',   start:-37, end:-4,   desc:'Client king under Rome; rebuilt the temple in spectacular fashion. Massacred infants in Bethlehem. Jesus born near the end of his reign.',refs:['Matt 2:1-18','Luke 1:5'] },
  { id:'ro-augustus', name:'Augustus',          start:-27, end:14,   desc:'First emperor; Pax Romana. His census decree brought Mary and Joseph to Bethlehem (Luke 2:1). Jesus born under his reign.',refs:['Luke 2:1'] },
  { id:'ro-tiberius', name:'Tiberius',          start:14,  end:37,   desc:'Emperor during the entire public ministry of Jesus and the crucifixion. John the Baptist and Jesus both executed under his reign.',refs:['Luke 3:1','Mark 12:17'] },
  { id:'ro-caligula', name:'Caligula',          start:37,  end:41,   desc:'Attempted to place his statue in the Jerusalem temple — crisis averted by his assassination. Agrippa I ruled Judea briefly.',refs:['Acts 12:1'] },
  { id:'ro-claudius', name:'Claudius',          start:41,  end:54,   desc:'Expelled Jews from Rome (~49 AD), sending Priscilla and Aquila to Corinth where they met Paul. Gallio was his proconsul in Achaia.',refs:['Acts 18:2','Acts 11:28'] },
  { id:'ro-nero',     name:'Nero',              start:54,  end:68,   desc:'Paul appealed to Caesar under Nero. Great Fire of Rome (64 AD) blamed on Christians — first imperial persecution. Paul and Peter likely martyred under him.',refs:['Acts 25:11','1 Pet 4:12-19'] },
  { id:'ro-vespasian',name:'Vespasian/Titus',  start:69,  end:81,   desc:'Vespasian and his son Titus destroyed Jerusalem and the temple (70 AD), fulfilling Jesus\'s prediction in Mark 13. The Arch of Titus depicts the menorah carried off.',refs:['Mark 13:1-2','Luke 21:20-24'] },
  { id:'ro-domitian', name:'Domitian',          start:81,  end:96,   desc:'Demanded "dominus et deus" worship; second major persecution of Christians. John exiled to Patmos; Revelation written in this context. The Beast imagery.',refs:['Rev 1:9','Rev 13','Rev 17'] },
  { id:'ro-nerva',    name:'Nerva/Trajan',      start:96,  end:120,  desc:'Nerva ended Domitian\'s persecution; John likely returned from Patmos. Pliny\'s correspondence with Trajan (c.112 AD) gives earliest Roman account of Christian worship.',refs:[] },
]

// ── Prophets ───────────────────────────────────────────────────────────────────
const PROPHETS: Ruler[] = [
  { id:'pr-elijah',   name:'Elijah',     start:-875,end:-850, desc:'Prophet of fire; confronted Ahab and Jezebel; called Israel back to YHWH on Carmel. Type of John the Baptist.' },
  { id:'pr-elisha',   name:'Elisha',     start:-850,end:-800, desc:'Elijah\'s successor; ministry of miracles and grace; anointed Jehu; present through Israel\'s oppression by Aram.' },
  { id:'pr-obad',     name:'Obadiah',    start:-845,end:-840, desc:'Oracle against Edom for gloating over Jerusalem\'s distress.' },
  { id:'pr-joel',     name:'Joel',       start:-835,end:-800, desc:'Locust plague as warning of the Day of the Lord; promise of Spirit outpouring (Acts 2).' },
  { id:'pr-jonah',    name:'Jonah',      start:-785,end:-775, desc:'Prophet to Nineveh; God\'s mercy extends beyond Israel.' },
  { id:'pr-amos',     name:'Amos',       start:-760,end:-750, desc:'Shepherd from Tekoa; fierce social justice oracle against northern Israel\'s wealth under Jeroboam II.' },
  { id:'pr-hosea',    name:'Hosea',      start:-755,end:-715, desc:'Marriage as living parable of Israel\'s unfaithfulness. Preached from Jeroboam II through the fall of Samaria.' },
  { id:'pr-isaiah',   name:'Isaiah',     start:-740,end:-700, desc:'Isaiah of Jerusalem; holiness, the Servant, and new creation. Advised Hezekiah; confronted Ahaz.' },
  { id:'pr-micah',    name:'Micah',      start:-737,end:-700, desc:'Contemporary of Isaiah; condemned unjust rulers; prophesied Bethlehem as Messiah\'s birthplace.' },
  { id:'pr-nahum',    name:'Nahum',      start:-663,end:-612, desc:'Oracle of Nineveh\'s fall; God\'s justice catches up with Assyria.' },
  { id:'pr-zeph',     name:'Zephaniah',  start:-640,end:-625, desc:'"Day of the Lord" as cosmic judgment; remnant will be restored.' },
  { id:'pr-hab',      name:'Habakkuk',   start:-620,end:-605, desc:'"The righteous shall live by faith." Wrestles with God using wicked Babylon as his instrument.' },
  { id:'pr-jer',      name:'Jeremiah',   start:-627,end:-585, desc:'The weeping prophet; preached through the fall of Jerusalem; new covenant promise (Jer 31).' },
  { id:'pr-dan',      name:'Daniel',     start:-605,end:-535, desc:'Exiled under Jehoiakim; served in Babylon\'s court; apocalyptic visions spanning to the end of the age.' },
  { id:'pr-ezek',     name:'Ezekiel',    start:-593,end:-571, desc:'Exiled priest; visions of glory and resurrection; temple vision as future hope.' },
  { id:'pr-haggai',   name:'Haggai',     start:-520,end:-516, desc:'Called the post-exilic community to rebuild the temple.' },
  { id:'pr-zech',     name:'Zechariah',  start:-520,end:-480, desc:'Night visions and messianic prophecies; most-quoted OT book in the Passion narratives.' },
  { id:'pr-mal',      name:'Malachi',    start:-450,end:-430, desc:'Final OT prophet; confronted priestly corruption; promised return of Elijah.' },
]

// ── Judah ──────────────────────────────────────────────────────────────────────
const JUDAH: Ruler[] = [
  { id:'ju-saul',      name:'Saul',         start:-1050,end:-1010, desc:'First king of Israel; rejected for disobedience. Transition from theocracy to monarchy.',refs:['1 Sam 9-31'] },
  { id:'ju-david',     name:'David',        start:-1010,end:-970,  desc:'Man after God\'s own heart. Jerusalem as capital; Davidic covenant — eternal throne promise.',refs:['2 Sam 1-1 Kgs 2'] },
  { id:'ju-solomon',   name:'Solomon',      start:-970, end:-931,  desc:'Builder of the First Temple; wisdom and international trade; apostasy through foreign wives.',refs:['1 Kgs 1-11'] },
  { id:'ju-rehoboam',  name:'Rehoboam',     start:-931, end:-913,  desc:'Harsh response split the kingdom. Shishak of Egypt plundered the temple in his 5th year.',refs:['1 Kgs 12-14'] },
  { id:'ju-abijam',    name:'Abijam',       start:-913, end:-911,  desc:'Reigned briefly; fought Jeroboam. Heart not fully devoted.',refs:['1 Kgs 15:1-8'] },
  { id:'ju-asa',       name:'Asa',          start:-911, end:-870,  desc:'Good king; removed idols; later relied on Aram rather than God.',refs:['1 Kgs 15:9-24'] },
  { id:'ju-jehosh',    name:'Jehoshaphat',  start:-873, end:-848,  desc:'Sought the Lord; sent teachers throughout Judah; problematic alliance with Ahab.',refs:['1 Kgs 22; 2 Chr 17-20'] },
  { id:'ju-jehoram',   name:'Jehoram',      start:-848, end:-841,  desc:'Married Ahab\'s daughter Athaliah; killed his brothers; Israel revolted.',refs:['2 Kgs 8:16-24'] },
  { id:'ju-ahaziah',   name:'Ahaziah',      start:-841, end:-841,  desc:'Reigned one year; killed by Jehu during Jehu\'s purge of Ahab\'s house.',refs:['2 Kgs 8:25-9:29'] },
  { id:'ju-athaliah',  name:'Athaliah',     start:-841, end:-835,  desc:'Queen mother who seized the throne; Joash hidden in the temple for 6 years.',refs:['2 Kgs 11'] },
  { id:'ju-joash',     name:'Joash',        start:-835, end:-796,  desc:'Hidden as infant; restored worship and repaired the temple; later killed the prophet Zechariah.',refs:['2 Kgs 12'] },
  { id:'ju-amaziah',   name:'Amaziah',      start:-796, end:-767,  desc:'Did right but not wholeheartedly; defeated Israel then humiliated by Joash of Israel.',refs:['2 Kgs 14:1-20'] },
  { id:'ju-uzziah',    name:'Uzziah',       start:-792, end:-740,  desc:'Long prosperous reign; struck with leprosy for burning incense — a priestly function. Isaiah\'s call was "in the year King Uzziah died."',refs:['2 Kgs 15:1-7','Isa 6:1'] },
  { id:'ju-jotham',    name:'Jotham',       start:-750, end:-735,  desc:'Built the Upper Gate; did right before God. High places remained.',refs:['2 Kgs 15:32-38'] },
  { id:'ju-ahaz',      name:'Ahaz',         start:-735, end:-715,  desc:'Wicked; sacrificed his son; called on Assyria rather than God during the Syro-Ephraimite crisis. Isaiah confronted him.',refs:['2 Kgs 16','Isa 7'] },
  { id:'ju-hezekiah',  name:'Hezekiah',     start:-729, end:-686,  desc:'One of Judah\'s greatest kings; cleansed the temple; trusted God against Sennacherib. 185,000 Assyrians killed by the angel.',refs:['2 Kgs 18-20','Isa 36-39'] },
  { id:'ju-manasseh',  name:'Manasseh',     start:-697, end:-642,  desc:'Longest-reigning and most wicked king; reversed all Hezekiah\'s reforms; shed innocent blood; later repented in exile.',refs:['2 Kgs 21:1-18'] },
  { id:'ju-amon',      name:'Amon',         start:-642, end:-640,  desc:'Wicked like Manasseh; assassinated after two years.',refs:['2 Kgs 21:19-26'] },
  { id:'ju-josiah',    name:'Josiah',       start:-640, end:-609,  desc:'Righteous reformer; discovered the Book of the Law; sweeping covenant renewal. Died at Megiddo opposing Pharaoh Necho.',refs:['2 Kgs 22-23','Jer 1'] },
  { id:'ju-jehoahaz',  name:'Jehoahaz',     start:-609, end:-609,  desc:'3 months; deposed by Pharaoh Necho and taken to Egypt.',refs:['2 Kgs 23:31-34'] },
  { id:'ju-jehoiakim', name:'Jehoiakim',    start:-609, end:-598,  desc:'Vassal of Egypt then Babylon; burned Jeremiah\'s scroll; Babylon\'s deportations began.',refs:['2 Kgs 23:34-24:7','Jer 36'] },
  { id:'ju-jehoiachin',name:'Jehoiachin',   start:-598, end:-597,  desc:'3 months; surrendered to Nebuchadnezzar; taken to Babylon — the first major deportation including Ezekiel.',refs:['2 Kgs 24:8-16'] },
  { id:'ju-zedekiah',  name:'Zedekiah',     start:-597, end:-586,  desc:'Last king of Judah; vacillated between Jeremiah and his officials; Jerusalem fell, temple destroyed, eyes gouged out, taken to Babylon.',refs:['2 Kgs 24:17-25:21','Jer 39'] },
]

// ── Israel (Northern Kingdom) ─────────────────────────────────────────────────
const ISRAEL: Ruler[] = [
  { id:'is-jerob1',   name:'Jeroboam I',   start:-931,end:-910, desc:'Founded the Northern Kingdom; set up golden calves at Bethel and Dan — "the sin of Jeroboam."',refs:['1 Kgs 12-14'] },
  { id:'is-nadab',    name:'Nadab',        start:-910,end:-909, desc:'Jeroboam\'s son; assassinated by Baasha after two years.',refs:['1 Kgs 15:25-31'] },
  { id:'is-baasha',   name:'Baasha',       start:-909,end:-886, desc:'Killed Jeroboam\'s entire line; continued in the sins of Jeroboam.',refs:['1 Kgs 15:33-16:7'] },
  { id:'is-elah',     name:'Elah',         start:-886,end:-885, desc:'Assassinated by Zimri while drunk.',refs:['1 Kgs 16:8-14'] },
  { id:'is-zimri',    name:'Zimri',        start:-885,end:-885, desc:'Reigned 7 days; burned the palace around himself when Omri besieged Tirzah.',refs:['1 Kgs 16:15-20'] },
  { id:'is-omri',     name:'Omri',         start:-885,end:-874, desc:'Founded Samaria as the new capital. So significant that Assyrian records called Israel "the house of Omri" for generations.',refs:['1 Kgs 16:21-28'] },
  { id:'is-ahab',     name:'Ahab',         start:-874,end:-853, desc:'Most wicked king of Israel; married Jezebel; promoted Baal worship. Elijah\'s great opponent. Naboth\'s vineyard.',refs:['1 Kgs 16:29-22:40'] },
  { id:'is-ahaziah',  name:'Ahaziah',      start:-853,end:-852, desc:'Ahab\'s son; consulted Baal-Zebub; Elijah confronted him.',refs:['1 Kgs 22:51-2 Kgs 1'] },
  { id:'is-joram',    name:'Joram',        start:-852,end:-841, desc:'Ahab\'s son; removed the sacred stone of Baal; Elisha\'s ministry flourished. Killed by Jehu.',refs:['2 Kgs 3-9'] },
  { id:'is-jehu',     name:'Jehu',         start:-841,end:-814, desc:'Anointed by Elisha; violently purged Ahab\'s house and Baal worshipers; but did not depart from Jeroboam\'s sins.',refs:['2 Kgs 9-10'] },
  { id:'is-jehoahaz', name:'Jehoahaz',     start:-814,end:-798, desc:'Israel oppressed by Aram; sought God who raised up a deliverer. Army reduced to almost nothing.',refs:['2 Kgs 13:1-9'] },
  { id:'is-jehoash',  name:'Jehoash',      start:-798,end:-782, desc:'Defeated Aram three times as Elisha prophesied. Also defeated Judah and plundered the temple.',refs:['2 Kgs 13:10-14:16'] },
  { id:'is-jerob2',   name:'Jeroboam II',  start:-793,end:-753, desc:'Long prosperous reign; expanded Israel\'s borders. Social injustice flourished — context for Amos and Hosea.',refs:['2 Kgs 14:23-29','Amos 1:1','Hos 1:1'] },
  { id:'is-zechariah',name:'Zechariah',    start:-753,end:-752, desc:'Last of Jehu\'s dynasty; assassinated by Shallum after 6 months.',refs:['2 Kgs 15:8-12'] },
  { id:'is-shallum',  name:'Shallum',      start:-752,end:-752, desc:'Reigned one month; assassinated by Menahem.',refs:['2 Kgs 15:13-15'] },
  { id:'is-menahem',  name:'Menahem',      start:-752,end:-742, desc:'Paid heavy tribute to Tiglath-Pileser III of Assyria; brutal ruler.',refs:['2 Kgs 15:16-22'] },
  { id:'is-pekahiah', name:'Pekahiah',     start:-742,end:-740, desc:'Menahem\'s son; assassinated by Pekah.',refs:['2 Kgs 15:23-26'] },
  { id:'is-pekah',    name:'Pekah',        start:-752,end:-732, desc:'Allied with Aram against Judah (Syro-Ephraimite crisis); Assyria took much of Israel\'s territory under him.',refs:['2 Kgs 15:27-31','Isa 7'] },
  { id:'is-hoshea',   name:'Hoshea',       start:-732,end:-722, desc:'Last king of Israel; imprisoned by Assyria for seeking Egypt\'s help; Samaria fell after 3-year siege.',refs:['2 Kgs 17'] },
]

// ── World Events ──────────────────────────────────────────────────────────────
const EVENTS: WorldEvent[] = [
  { year:-1446, label:'The Exodus',        desc:'Israel\'s departure from Egypt; foundational salvation event of the OT (traditional date).',        color: GOLD },
  { year:-853,  label:'Qarqar',            desc:'Battle of Qarqar: Assyrian records show Ahab contributed 2,000 chariots to the coalition against Shalmaneser III.', color:'#9060b0' },
  { year:-841,  label:'Black Obelisk',     desc:'Jehu pays tribute to Shalmaneser III — the only extra-biblical image of an Israelite king.',        color:'#9060b0' },
  { year:-722,  label:'722 BC — Samaria Falls', desc:'Sargon II completes the fall of Samaria; Northern Kingdom exiled. The 10 tribes scattered.',   color:'#ff6040' },
  { year:-701,  label:'701 BC — Sennacherib', desc:'Sennacherib invades Judah; 185,000 troops killed by the angel. Jerusalem miraculously spared.',   color:'#9060b0' },
  { year:-612,  label:'612 BC — Nineveh Falls', desc:'Babylon and Medes destroy Nineveh — fulfilling Nahum\'s prophecy. Assyrian power ends.',        color:'#c07030' },
  { year:-605,  label:'605 BC — Babylon Rises', desc:'Battle of Carchemish. Nebuchadnezzar defeats Egypt. First deportation: Daniel taken to Babylon.',color:'#c07030' },
  { year:-597,  label:'597 BC — 2nd Exile', desc:'Nebuchadnezzar besieges Jerusalem; Jehoiachin surrenders. Ezekiel among the exiles.',              color:'#c07030' },
  { year:-586,  label:'586 BC — Jerusalem Falls', desc:'Temple destroyed. Zedekiah\'s eyes gouged out. The great exile begins. The lowest point of OT history.', color:'#ff3020' },
  { year:-539,  label:'539 BC — Persia',   desc:'Cyrus the Great conquers Babylon in a single night — as Isaiah prophesied 150 years earlier. The exile ends.', color:'#50a080' },
  { year:-516,  label:'516 BC — Temple',   desc:'Second Temple completed under Darius I. 70 years after its destruction (586 BC). Haggai and Zechariah\'s ministry fulfilled.', color: GOLD },
  { year:-480,  label:'480 BC — Thermopylae', desc:'Xerxes (Ahasuerus of Esther) invades Greece; defeated at Salamis. The events of Esther occur during this period.', color:'#5080b0' },
  { year:-445,  label:'445 BC — Walls',    desc:'Nehemiah rebuilds Jerusalem\'s walls in 52 days. The city begins its restoration. Daniel\'s 70 weeks likely begins here.', color: KHAKI },
  { year:-333,  label:'333 BC — Alexander', desc:'Alexander defeats Persia at Issus. Hellenistic age begins. Greek becomes the lingua franca — preparing the NT world.', color:'#5080b0' },
  { year:-167,  label:'167 BC — Maccabees', desc:'Antiochus IV desecrates the temple: pigs on the altar, Zeus statue. The Maccabean revolt begins. Hanukkah commemorates its outcome.', color:'#5080b0' },
  { year:-63,   label:'63 BC — Rome',      desc:'Pompey takes Jerusalem. Rome becomes the ruling power. Hasmonean independence ends. Sets the political stage for the NT.', color:'#a05050' },
  { year:-4,    label:'~4 BC — Jesus Born', desc:'Birth of Jesus, King of kings, in Bethlehem of Judah. Fulfillment of the entire OT narrative arc.',  color: GOLD },
  { year:30,    label:'AD 30 — Crucifixion', desc:'The crucifixion and resurrection of Jesus Christ. The hinge of all history.',                       color: GOLD },
  { year:49,    label:'AD 49 — Claudius Edict', desc:'Claudius expels Jews from Rome; Priscilla and Aquila go to Corinth — where they meet Paul (Acts 18:2).', color:'#a05050' },
  { year:70,    label:'AD 70 — Temple Destroyed', desc:'Titus destroys Jerusalem and the temple. Jesus\'s prediction (Mark 13) fulfilled. 1.1 million killed; 97,000 enslaved.', color:'#ff3020' },
  { year:95,    label:'AD 95 — Revelation', desc:'John exiled to Patmos under Domitian\'s persecution; writes Revelation to the seven churches.',       color: GOLD },
]

// ── Connections (empire → biblical figure) ────────────────────────────────────
const CONNECTIONS: Connection[] = [
  { fromId:'as-shalm3',   toId:'is-ahab',     label:'Battle of Qarqar',       year:-853 },
  { fromId:'as-tiglath',  toId:'is-pekah',    label:'Assyrian invasion',       year:-734 },
  { fromId:'as-tiglath',  toId:'ju-ahaz',     label:'Syro-Ephraimite crisis',  year:-734 },
  { fromId:'as-shalm5',   toId:'is-hoshea',   label:'Siege of Samaria',        year:-724 },
  { fromId:'as-sargon',   toId:'is-hoshea',   label:'Fall of Samaria 722 BC',  year:-722 },
  { fromId:'as-sennach',  toId:'ju-hezekiah', label:'Siege of Jerusalem 701 BC',year:-701 },
  { fromId:'eg-necho',    toId:'ju-josiah',   label:'Megiddo 609 BC',          year:-609 },
  { fromId:'ba-nebuch',   toId:'ju-jehoiakim',label:'First deportation 605 BC', year:-605 },
  { fromId:'ba-nebuch',   toId:'ju-zedekiah', label:'Jerusalem falls 586 BC',   year:-586 },
  { fromId:'pe-cyrus',    toId:'pr-dan',      label:'Cyrus decree 539 BC',      year:-539 },
  { fromId:'pe-xerxes',   toId:'pr-zech',     label:'Book of Esther / Xerxes',  year:-480 },
  { fromId:'pe-artax1',   toId:'pr-mal',      label:'Ezra & Nehemiah return',   year:-458 },
  { fromId:'ro-claudius', toId:'pr-ezek',     label:'Acts 18:2 — Priscilla & Aquila', year:49 },  // reuse Ezekiel slot conceptually
]

// ── Era inference ─────────────────────────────────────────────────────────────
function inferEra(ref: string): { start:number; end:number } | null {
  const r = ref.toLowerCase()
  const map: [RegExp, number, number][] = [
    [/genesis|exodus|leviticus|numbers|deuteronomy/, -1500,-1200],
    [/joshua|judges/, -1200,-1000],
    [/1 sam|2 sam|1 samuel|2 samuel/, -1050,-970],
    [/1 kings?|1 kgs?/, -970,-853],
    [/2 kings?|2 kgs?/, -853,-586],
    [/1 chr|2 chr|1 chronicles|2 chronicles/, -970,-586],
    [/ezra|nehemiah/, -450,-400],
    [/esther/, -486,-465],
    [/isaiah|isa\b/, -740,-700],
    [/jeremiah|jer\b/, -627,-585],
    [/lamentations|lam\b/, -586,-580],
    [/ezekiel|ezek/, -593,-571],
    [/daniel|dan\b/, -605,-535],
    [/hosea|hos\b/, -755,-715],
    [/joel\b/, -835,-800],
    [/amos\b/, -760,-750],
    [/obadiah|obad/, -845,-840],
    [/jonah\b/, -785,-775],
    [/micah|mic\b/, -737,-700],
    [/nahum|nah\b/, -663,-612],
    [/habakkuk|hab\b/, -620,-605],
    [/zephaniah|zeph/, -640,-625],
    [/haggai|hag\b/, -520,-516],
    [/zechariah|zech/, -520,-480],
    [/malachi|mal\b/, -450,-430],
    [/matthew|mark|luke|john\b/, 27,33],
    [/acts\b/, 33,65],
    [/romans|rom\b/, 57,57],
    [/1 cor|2 cor|corinthians/, 53,57],
    [/galatians|gal\b/, 48,48],
    [/ephesians|eph\b/, 60,62],
    [/philippians|phil\b/, 60,62],
    [/colossians|col\b/, 60,62],
    [/thessalonians|thess/, 50,52],
    [/timothy|tim\b|titus/, 62,67],
    [/hebrews|heb\b/, 60,70],
    [/james\b/, 45,50],
    [/1 pet|2 pet|peter/, 60,68],
    [/1 john|2 john|3 john|jude/, 85,95],
    [/revelation|rev\b/, 90,96],
  ]
  for (const [re,s,e] of map) if (re.test(r)) return { start:s, end:e }
  return null
}

// ── Year label ────────────────────────────────────────────────────────────────
function yearLabel(y: number) {
  if (y < 0) return `${Math.abs(y)} BC`
  if (y === 0) return 'AD 1'
  return `AD ${y}`
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props { reference:string; width:number; height:number }

export function MonarchyCard({ reference, width, height }: Props) {
  const era = useMemo(() => inferEra(reference), [reference])
  const [selected, setSelected] = useState<(Ruler | WorldEvent) | null>(null)
  const [zoom, setZoom] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Pixel-per-year at current zoom
  const ppy = zoom * (width - LABEL_W - 16) / 600  // 600 years visible at 1x

  function xOf(year: number) { return (year - YEAR_MIN) * ppy }
  function totalW() { return FULL_SPAN * ppy }

  // Scroll to passage era on change
  useEffect(() => {
    if (!era || !scrollRef.current) return
    const cx = xOf((era.start + era.end) / 2)
    scrollRef.current.scrollLeft = cx - (width - LABEL_W) / 2
  }, [era, zoom])

  const isHL = useCallback((start:number, end:number) => {
    if (!era) return false
    return start <= era.end + 10 && end >= era.start - 10
  }, [era])

  const click = (item: Ruler | WorldEvent) =>
    setSelected(s => (s !== null && 'id' in s && 'id' in item && s.id === item.id) ? null : item)

  // ── Ruler bar ──────────────────────────────────────────────────────────────
  function RulerBar({ r, color, y, h = ROW_H }: { r:Ruler; color:string; y:number; h?:number }) {
    const hl  = isHL(r.start, r.end)
    const sel = selected && 'id' in selected && selected.id === r.id
    const x   = xOf(r.start)
    const w   = Math.max(xOf(r.end) - x, 2)
    return (
      <g key={r.id} onClick={() => click(r)} style={{ cursor:'pointer' }}>
        <rect x={x} y={y} width={w} height={h} rx={3}
          fill={sel ? GOLD : hl ? color : `${color}30`}
          stroke={sel ? GOLD : hl ? color : `${color}45`}
          strokeWidth={sel ? 1.5 : 0.8}
          opacity={sel ? 1 : hl ? 0.9 : 0.55}
        />
        {w > 28 && (
          <text x={x + 4} y={y + h/2 + 3.5} fontSize={hl ? 8.5 : 7.5}
            fill={sel ? '#111' : hl ? '#fff' : `${color}cc`}
            fontFamily="JetBrains Mono" letterSpacing="0.04em"
            clipPath={`url(#clip-${r.id})`}
          >
            {r.name}
          </text>
        )}
        <clipPath id={`clip-${r.id}`}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </g>
    )
  }

  // ── Stagger rows within a band ─────────────────────────────────────────────
  function stackedBars(rulers: Ruler[], color: string, bandY: number, maxRows = 3) {
    const slots: number[] = []
    return rulers.map(r => {
      const x = xOf(r.start), rx = xOf(r.end)
      let row = 0
      while (row < maxRows - 1 && slots[row] !== undefined && slots[row] > x + 2) row++
      slots[row] = rx
      return <RulerBar key={r.id} r={r} color={color} y={bandY + row * (ROW_H + 2)} />
    })
  }

  // ── Row heights ─────────────────────────────────────────────────────────────
  const BAND = {
    egypt:    { y: 2,   h: ROW_H },
    assyria:  { y: 32,  h: ROW_H },
    babylon:  { y: 62,  h: ROW_H },
    persia:   { y: 92,  h: ROW_H },
    greece:   { y: 122, h: ROW_H + 4 },
    rome:     { y: 154, h: ROW_H * 2 + 4 },
    sep:      { y: 212, h: 2 },
    prophets: { y: 220, h: ROW_H },
    judah:    { y: 252, h: ROW_H * 3 + 6 },
    israel:   { y: 332, h: ROW_H * 3 + 6 },
  }
  const SVG_H = 412

  // ── Connecting lines ───────────────────────────────────────────────────────
  function connectionLines() {
    const allRulers = [...EGYPT, ...ASSYRIA, ...BABYLON, ...PERSIA, ...GREECE, ...ROME, ...JUDAH, ...ISRAEL, ...PROPHETS]
    const rowOf = (id: string): number => {
      if (EGYPT.find(r => r.id === id))    return BAND.egypt.y + ROW_H / 2
      if (ASSYRIA.find(r => r.id === id))  return BAND.assyria.y + ROW_H / 2
      if (BABYLON.find(r => r.id === id))  return BAND.babylon.y + ROW_H / 2
      if (PERSIA.find(r => r.id === id))   return BAND.persia.y + ROW_H / 2
      if (ROME.find(r => r.id === id))     return BAND.rome.y + ROW_H / 2
      if (PROPHETS.find(r => r.id === id)) return BAND.prophets.y + ROW_H / 2
      if (JUDAH.find(r => r.id === id))    return BAND.judah.y + ROW_H / 2
      if (ISRAEL.find(r => r.id === id))   return BAND.israel.y + ROW_H / 2
      return 200
    }
    return CONNECTIONS.map(c => {
      const from = allRulers.find(r => r.id === c.fromId)
      const to   = allRulers.find(r => r.id === c.toId)
      if (!from || !to) return null
      const x1 = xOf(c.year), y1 = rowOf(c.fromId)
      const x2 = xOf(c.year), y2 = rowOf(c.toId)
      const hl = era ? (c.year >= era.start - 5 && c.year <= era.end + 5) : false
      return (
        <g key={`${c.fromId}-${c.toId}`}>
          <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={hl ? GOLD : `${STEEL}40`}
            strokeWidth={hl ? 1.5 : 0.8}
            strokeDasharray={hl ? '3 2' : '2 3'}
            opacity={hl ? 0.9 : 0.4}
          />
          <circle cx={x1} cy={y1} r={2.5}
            fill={hl ? GOLD : `${STEEL}60`} />
          <circle cx={x2} cy={y2} r={2.5}
            fill={hl ? GOLD : `${STEEL}60`} />
        </g>
      )
    })
  }

  // ── Tick labels ─────────────────────────────────────────────────────────────
  function ticks() {
    const step = zoom < 0.5 ? 200 : zoom < 1 ? 100 : zoom < 2 ? 50 : 25
    const tks = []
    for (let y = Math.ceil(YEAR_MIN / step) * step; y <= YEAR_MAX; y += step) {
      const x = xOf(y)
      tks.push(
        <g key={y}>
          <line x1={x} y1={0} x2={x} y2={SVG_H}
            stroke={`${STEEL}12`} strokeWidth={0.5} />
          <text x={x} y={SVG_H - 2} fontSize={7}
            fill={`${STEEL}55`} fontFamily="JetBrains Mono" textAnchor="middle">
            {yearLabel(y)}
          </text>
        </g>
      )
    }
    return tks
  }

  // ── Event markers ──────────────────────────────────────────────────────────
  function eventMarkers() {
    return EVENTS.map(ev => {
      const x = xOf(ev.year)
      const hl = era ? (ev.year >= era.start - 10 && ev.year <= era.end + 10) : false
      const col = ev.color ?? STEEL
      const sel = selected && 'year' in selected && selected.year === ev.year && selected.label === ev.label
      return (
        <g key={`${ev.year}-${ev.label}`} onClick={() => click(ev)} style={{ cursor:'pointer' }}>
          <line x1={x} y1={0} x2={x} y2={SVG_H - 14}
            stroke={sel ? GOLD : hl ? col : `${col}40`}
            strokeWidth={sel ? 2 : hl ? 1.5 : 0.8}
            strokeDasharray={hl || sel ? '' : '3 3'}
          />
          {/* Event label rotated */}
          <text x={x + 3} y={8} fontSize={hl || sel ? 8 : 6.5}
            fill={sel ? GOLD : hl ? col : `${col}80`}
            fontFamily="JetBrains Mono" letterSpacing="0.04em"
            transform={`rotate(90 ${x + 3} 8)`}
          >
            {ev.label}
          </text>
          <circle cx={x} cy={SVG_H - 20} r={hl || sel ? 4 : 2.5}
            fill={sel ? GOLD : hl ? col : `${col}50`}
          />
        </g>
      )
    })
  }

  // ── Era highlight band ─────────────────────────────────────────────────────
  function eraHighlight() {
    if (!era) return null
    const x = xOf(era.start), w = xOf(era.end) - x
    return (
      <rect x={x} y={0} width={Math.max(w, 3)} height={SVG_H - 14}
        fill={`${GOLD}08`}
        stroke={`${GOLD}30`}
        strokeWidth={1}
        strokeDasharray="4 3"
        rx={2}
      />
    )
  }

  // ── Row labels (fixed left column) ─────────────────────────────────────────
  const rowLabelData = [
    { label:'EGYPT',        y: BAND.egypt.y + ROW_H/2 + 4,    color:'#c09060' },
    { label:'ASSYRIA',      y: BAND.assyria.y + ROW_H/2 + 4,  color:'#9060b0' },
    { label:'BABYLON',      y: BAND.babylon.y + ROW_H/2 + 4,  color:'#c07030' },
    { label:'PERSIA/MEDES', y: BAND.persia.y + ROW_H/2 + 4,   color:'#50a080' },
    { label:'GREECE',       y: BAND.greece.y + ROW_H/2 + 4,   color:'#5080b0' },
    { label:'ROME',         y: BAND.rome.y + ROW_H/2 + 4,     color:'#a05050' },
    { label:'PROPHETS',     y: BAND.prophets.y + ROW_H/2 + 4, color: KHAKI    },
    { label:'JUDAH',        y: BAND.judah.y + ROW_H/2 + 4,    color:'#7090c0' },
    { label:'ISRAEL',       y: BAND.israel.y + ROW_H/2 + 4,   color:'#c07070' },
  ]

  const assetImages = useAssetImages()
  const headerH = 44
  const selectedBio = selected && 'id' in selected ? PERSON_BIOS[(selected as Ruler).id] : null
  const selectedImage = selectedBio ? findImage(assetImages.people, selectedBio.name) : null
  const detailH = selected ? (selectedBio ? (selectedImage ? 380 : 320) : 120) : 0
  const canvasH = height - headerH - detailH - 4

  return (
    // Outer shell matches phrasing card: olive-tinted bg, khaki border, rounded 16
    <div style={{ width, height, background: BG,
      border: `2px solid ${KHAKI}55`,
      boxShadow: `0 0 0 1px ${KHAKI}18`,
      borderRadius: 16, display:'flex', flexDirection:'column',
      overflow:'hidden', fontFamily:'JetBrains Mono', boxSizing:'border-box' }}>

      {/* Header — drag handle style matching phrasing card */}
      <div style={{ height: headerH, padding:'0 16px', display:'flex', alignItems:'center',
        justifyContent:'space-between', cursor:'grab',
        borderBottom:`1px solid ${KHAKI}20`,
        background:`${KHAKI}08`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:8, letterSpacing:'0.18em', color:`${KHAKI}90` }}>♚</span>
          <span style={{ fontSize:8, letterSpacing:'0.14em', color: STEEL }}>MONARCHY · EMPIRES · WORLD EVENTS</span>
          {era && (
            <span style={{ fontSize:7.5, color:`${GOLD}bb`, letterSpacing:'0.08em',
              background: BASE.goldDim, border:`1px solid ${BASE.borderGold}`,
              borderRadius:4, padding:'1px 6px' }}>
              {yearLabel(era.start)} – {yearLabel(era.end)}
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {([['−', () => setZoom(z => Math.max(0.3, z - 0.2))],
             ['+', () => setZoom(z => Math.min(4, z + 0.2))],
             ['FIT', () => setZoom(1)]] as const).map(([label, fn]) => (
            <button key={label} onClick={fn} style={{
              fontFamily:'JetBrains Mono', fontSize:8, padding:'2px 7px',
              background: BASE.goldDim, border:`1px solid ${BASE.borderGold}`,
              color: GOLD, borderRadius:4, cursor:'pointer',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Canvas area */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

        {/* Fixed row labels */}
        <div style={{ width:LABEL_W, flexShrink:0, borderRight:`1px solid ${KHAKI}20`, paddingTop:4 }}>
          <svg width={LABEL_W} height={Math.max(canvasH, SVG_H)}>
            {rowLabelData.map(d => (
              <text key={d.label} x={LABEL_W - 6} y={d.y} fontSize={7.5}
                fill={d.color} fontFamily="JetBrains Mono"
                letterSpacing="0.08em" textAnchor="end" opacity={0.85}>
                {d.label}
              </text>
            ))}
            <line x1={0} y1={BAND.sep.y} x2={LABEL_W} y2={BAND.sep.y}
              stroke={`${KHAKI}25`} strokeWidth={0.5} strokeDasharray="2 2" />
          </svg>
        </div>

        {/* Scrollable timeline */}
        <div ref={scrollRef} style={{ flex:1, overflowX:'auto', overflowY:'hidden' }}>
          <svg width={totalW()} height={Math.max(canvasH, SVG_H)} style={{ display:'block' }}>
            {ticks()}
            {eraHighlight()}

            {/* Row background alternating bands */}
            {Object.entries(BAND).map(([k, b]) => k !== 'sep' ? (
              <rect key={k} x={0} y={b.y} width={totalW()} height={b.h}
                fill={`${KHAKI}03`} />
            ) : null)}

            <line x1={0} y1={BAND.sep.y} x2={totalW()} y2={BAND.sep.y}
              stroke={`${KHAKI}25`} strokeWidth={0.5} strokeDasharray="3 3" />

            {stackedBars(EGYPT,    '#c09060', BAND.egypt.y)}
            {stackedBars(ASSYRIA,  '#9060b0', BAND.assyria.y)}
            {stackedBars(BABYLON,  '#c07030', BAND.babylon.y)}
            {stackedBars(PERSIA,   '#50a080', BAND.persia.y)}
            {stackedBars(GREECE,   '#5080b0', BAND.greece.y)}
            {stackedBars(ROME,     '#a05050', BAND.rome.y, 2)}
            {stackedBars(PROPHETS, KHAKI,     BAND.prophets.y)}
            {stackedBars(JUDAH,    '#7090c0', BAND.judah.y)}
            {stackedBars(ISRAEL,   '#c07070', BAND.israel.y)}

            {connectionLines()}
            {eventMarkers()}

            <line x1={0} y1={SVG_H - 14} x2={totalW()} y2={SVG_H - 14}
              stroke={`${KHAKI}20`} strokeWidth={0.5} />
          </svg>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{
          height: detailH, flexShrink:0,
          borderTop:`1px solid ${KHAKI}20`,
          padding:'10px 16px', overflowY:'auto',
          background: BASE.bg,
        }}>
          {'id' in selected ? (
            selectedBio ? (
              // ── Exhaustive bio panel ────────────────────────────────────────
              <div>
                {/* Header row */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start', flex:1 }}>
                    {/* Portrait image — shown when a matching file exists in ~/Desktop/BASE Assets/people/ */}
                    {selectedImage && (
                      <img src={selectedImage} alt={selectedBio.name}
                        style={{ width:56, height:72, objectFit:'cover', objectPosition:'top',
                          borderRadius:4, border:`1px solid ${KHAKI}30`, flexShrink:0 }} />
                    )}
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, letterSpacing:'0.18em', color:`${KHAKI}60`, marginBottom:2 }}>
                        {selectedBio.region.toUpperCase()} · {selectedBio.role.toUpperCase()}
                      </div>
                      <div style={{ fontSize:14, color: isHL(selected.start, selected.end) ? GOLD : KHAKI,
                        fontFamily:'Crimson Pro, serif', fontWeight:600 }}>
                        {selectedBio.name}
                      </div>
                      <div style={{ fontSize:8, color:`${STEEL}80`, marginTop:2 }}>{selectedBio.dates}</div>
                    </div>
                  </div>
                  <span style={{ fontSize:7.5, color:`${STEEL}90`,
                    background: BASE.goldDim, border:`1px solid ${BASE.borderGold}`,
                    borderRadius:3, padding:'2px 8px', flexShrink:0, marginLeft:8, marginTop:4 }}>
                    {yearLabel(selected.start)} – {yearLabel(selected.end)}
                  </span>
                </div>

                {/* Biography */}
                <div style={{ fontSize:7, letterSpacing:'0.14em', color:`${KHAKI}55`, marginBottom:4 }}>BIOGRAPHY</div>
                <div style={{ fontSize:11.5, color:BASE.bone, fontFamily:'Crimson Pro, serif', lineHeight:1.65, marginBottom:10 }}>
                  {selectedBio.biography}
                </div>

                {/* Biblical role */}
                <div style={{ fontSize:7, letterSpacing:'0.14em', color:`${KHAKI}55`, marginBottom:4 }}>BIBLICAL ROLE</div>
                <div style={{ fontSize:11.5, color:BASE.bone, fontFamily:'Crimson Pro, serif', lineHeight:1.65, marginBottom:10 }}>
                  {selectedBio.biblicalRole}
                </div>

                {/* Two-col: Extra-biblical & Archaeological */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:7, letterSpacing:'0.14em', color:`${KHAKI}55`, marginBottom:4 }}>EXTRA-BIBLICAL SOURCES</div>
                    <div style={{ fontSize:11, color:`${BASE.bone}cc`, fontFamily:'Crimson Pro, serif', lineHeight:1.6 }}>
                      {selectedBio.extraBiblical}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:7, letterSpacing:'0.14em', color:`${KHAKI}55`, marginBottom:4 }}>ARCHAEOLOGY</div>
                    <div style={{ fontSize:11, color:`${BASE.bone}cc`, fontFamily:'Crimson Pro, serif', lineHeight:1.6 }}>
                      {selectedBio.archaeological}
                    </div>
                  </div>
                </div>

                {/* Theological significance */}
                <div style={{ border:`1px solid ${GOLD}25`, borderRadius:6, padding:'8px 10px', marginBottom:10,
                  background:`${GOLD}06` }}>
                  <div style={{ fontSize:7, letterSpacing:'0.14em', color:`${GOLD}80`, marginBottom:4 }}>THEOLOGICAL SIGNIFICANCE</div>
                  <div style={{ fontSize:11.5, color:`${BASE.bone}dd`, fontFamily:'Crimson Pro, serif', lineHeight:1.65 }}>
                    {selectedBio.theological}
                  </div>
                </div>

                {/* References */}
                {selectedBio.references.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                    {selectedBio.references.map(ref => (
                      <span key={ref} style={{ fontSize:7.5, color:`${STEEL}80`,
                        background: BASE.goldDim, border:`1px solid ${BASE.borderGold}`,
                        borderRadius:3, padding:'1px 6px' }}>
                        {ref}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // ── Basic detail (no bio yet) ───────────────────────────────────
              <>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontSize:8, letterSpacing:'0.12em',
                    color: isHL(selected.start, selected.end) ? GOLD : KHAKI }}>
                    {selected.name.toUpperCase()}
                  </span>
                  <span style={{ fontSize:7.5, color:`${STEEL}90`,
                    background: BASE.goldDim, border:`1px solid ${BASE.borderGold}`,
                    borderRadius:3, padding:'1px 6px' }}>
                    {yearLabel(selected.start)} – {yearLabel(selected.end)}
                  </span>
                </div>
                <div style={{ fontSize:12, color:BASE.bone,
                  fontFamily:'Crimson Pro, Georgia, serif', lineHeight:1.65 }}>
                  {selected.desc}
                </div>
                {selected.refs?.length ? (
                  <div style={{ marginTop:6, fontSize:8, color:`${STEEL}80`,
                    background: BASE.goldDim, border:`1px solid ${BASE.borderGold}`,
                    borderRadius:4, padding:'3px 8px', display:'inline-block' }}>
                    {selected.refs.join(' · ')}
                  </div>
                ) : null}
              </>
            )
          ) : (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:8, letterSpacing:'0.1em',
                  color:(selected as WorldEvent).color ?? GOLD }}>
                  {(selected as WorldEvent).label.toUpperCase()}
                </span>
                <span style={{ fontSize:7.5, color:`${STEEL}90`,
                  background: BASE.goldDim, border:`1px solid ${BASE.borderGold}`,
                  borderRadius:3, padding:'1px 6px' }}>
                  {yearLabel((selected as WorldEvent).year)}
                </span>
              </div>
              <div style={{ fontSize:12, color:BASE.bone,
                fontFamily:'Crimson Pro, Georgia, serif', lineHeight:1.65 }}>
                {(selected as WorldEvent).desc}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── React Flow node wrapper ────────────────────────────────────────────────────
// Defines useCardDims inline to avoid circular import with Desk.tsx
function useCardDims(fallbackW: number, fallbackH: number) {
  const id = useNodeId()
  const w = useStore(s => s.nodeLookup.get(id ?? '')?.measured?.width  ?? fallbackW)
  const h = useStore(s => s.nodeLookup.get(id ?? '')?.measured?.height ?? fallbackH)
  return { w: w || fallbackW, h: h || fallbackH }
}

export function MonarchyCardNode({ data }: { data: Record<string, unknown> }) {
  const { w, h } = useCardDims(1100, 580)
  const id = useNodeId()
  const { setNodes } = useReactFlow()
  const hs = { width: 14, height: 14, borderRadius: 4, background: '#1d2417', border: `1px solid ${KHAKI}30` }
  const ls = { border: `1px solid ${KHAKI}20` }

  function closeNode() { setNodes(ns => ns.filter(n => n.id !== id)) }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <NodeResizer minWidth={700} minHeight={400} handleStyle={hs} lineStyle={ls} />
      {/* Close button — sits above the card in the top-right corner */}
      <button
        onClick={closeNode}
        title="Close tile"
        style={{
          position: 'absolute', top: -10, right: -10, zIndex: 10,
          width: 22, height: 22, padding: 0, borderRadius: '50%',
          background: BASE.bgCard, border: `1px solid ${KHAKI}40`,
          color: `${STEEL}80`, fontSize: 13, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = BASE.red; e.currentTarget.style.border = `1px solid ${BASE.red}60` }}
        onMouseLeave={e => { e.currentTarget.style.color = `${STEEL}80`; e.currentTarget.style.border = `1px solid ${KHAKI}40` }}
      >×</button>
      <MonarchyCard reference={(data.reference as string) ?? ''} width={w} height={h} />
    </div>
  )
}
