import { useState } from 'react'
import { NodeProps } from '@xyflow/react'

// ── Theme ────────────────────────────────────────────────────────────────────
const BASE_BG   = '#10120F'
const CARD_BG   = '#1d2417'
const DEEP_BG   = '#0c0e0b'
const GOLD      = '#D8B33F'
const KHAKI     = '#B8B49D'
const STEEL     = '#7A8C6E'
const BONE      = '#F5F2E8'

// ── Zone data ────────────────────────────────────────────────────────────────
interface Zone {
  id: string
  label: string
  abbrev: string
  x: number   // 0-1 fraction of diagram width
  y: number   // 0-1 fraction of diagram height
  w: number
  h: number
  color: string
  access: string  // who could enter
  refs: string[]
  desc: string
}

// ── TABERNACLE layout (bird's-eye view, facing west) ────────────────────────
const TABERNACLE_ZONES: Zone[] = [
  {
    id: 'tab-outer', label: 'Outer Court', abbrev: 'OUTER COURT',
    x: 0, y: 0, w: 1, h: 1,
    color: `${KHAKI}25`,
    access: 'All Israelites (men)',
    refs: ['Exod 27:9-18', 'Exod 38:9-20'],
    desc: 'The enclosure of the Tabernacle complex. 100 cubits long, 50 cubits wide. Linen curtains on bronze pillars. All Israelite men could enter to bring offerings.'
  },
  {
    id: 'tab-altar', label: 'Altar of Burnt Offering', abbrev: 'BRONZE ALTAR',
    x: 0.35, y: 0.72, w: 0.30, h: 0.20,
    color: '#8B4513aa',
    access: 'Priests (to minister)',
    refs: ['Exod 27:1-8', 'Exod 38:1-7', 'Lev 1-7'],
    desc: 'Acacia wood overlaid with bronze. 5 cubits square, 3 cubits high. All animal sacrifices (burnt, peace, sin, guilt offerings) were offered here. A continual fire burned on it (Lev 6:13). The place of atonement where blood was applied to the horns.'
  },
  {
    id: 'tab-laver', label: 'Bronze Laver', abbrev: 'LAVER',
    x: 0.40, y: 0.53, w: 0.20, h: 0.12,
    color: '#4a7a9baa',
    access: 'Priests only',
    refs: ['Exod 30:17-21', 'Exod 38:8'],
    desc: 'Made from the bronze mirrors of the women who served at the entrance. Priests washed their hands and feet here before approaching the altar or entering the tent. Failure to wash meant death (Exod 30:20-21).'
  },
  {
    id: 'tab-tent', label: 'The Tent (Mishkan)', abbrev: 'HOLY PLACE',
    x: 0.30, y: 0.20, w: 0.40, h: 0.28,
    color: '#2a3a2aaa',
    access: 'Priests only (daily ministry)',
    refs: ['Exod 26', 'Exod 40:1-33', 'Heb 9:2-6'],
    desc: 'The tent itself: 30 cubits long, 10 cubits wide, 10 cubits high. Constructed of acacia wood boards overlaid with gold, with linen curtains decorated with cherubim. The outer room contained three pieces of furniture: the menorah, the table of showbread, and the altar of incense. Priests ministered here daily — trimming the lamps, replacing the showbread, and burning incense morning and evening.'
  },
  {
    id: 'tab-menorah', label: 'Menorah (Lampstand)', abbrev: 'MENORAH',
    x: 0.31, y: 0.27, w: 0.10, h: 0.13,
    color: `${GOLD}99`,
    access: 'Priests only',
    refs: ['Exod 25:31-40', 'Exod 37:17-24', 'Lev 24:1-4'],
    desc: 'Pure gold, hammered from a single piece. Seven branches with cups shaped like almond flowers. Burned continually (lamp kept trimmed daily). Typologically: the light of God\'s presence; NT — Christ the Light of the World (John 8:12), the seven churches (Rev 1:12-20).'
  },
  {
    id: 'tab-showbread', label: 'Table of Showbread', abbrev: 'SHOWBREAD',
    x: 0.59, y: 0.27, w: 0.10, h: 0.13,
    color: `${KHAKI}66`,
    access: 'Priests only',
    refs: ['Exod 25:23-30', 'Lev 24:5-9', '1 Sam 21:1-6', 'Matt 12:4'],
    desc: '12 loaves (one per tribe) placed in two stacks every Sabbath. Replaced loaves were eaten by the priests. The table was acacia wood overlaid with gold. Typologically: the bread of God\'s presence; Christ as the Bread of Life (John 6:35). Jesus cites this when defending his disciples\' sabbath gleaning (Matt 12:4).'
  },
  {
    id: 'tab-incense', label: 'Altar of Incense', abbrev: 'INCENSE',
    x: 0.44, y: 0.23, w: 0.12, h: 0.10,
    color: '#9b7a4aaa',
    access: 'Priests only (High Priest)',
    refs: ['Exod 30:1-10', 'Exod 37:25-28', 'Luke 1:9-11', 'Rev 5:8', 'Rev 8:3-4'],
    desc: 'Acacia wood overlaid with gold, directly before the veil to the Holy of Holies. Incense burned every morning and evening when the lamps were tended. Only the High Priest entered before it on Yom Kippur. In NT: Zechariah is burning incense when Gabriel appears (Luke 1:9-11). Revelation uses incense as the prayers of the saints (5:8; 8:3-4).'
  },
  {
    id: 'tab-hoh', label: 'Holy of Holies (Debir)', abbrev: 'HOLY OF HOLIES',
    x: 0.38, y: 0.20, w: 0.24, h: 0.06,
    color: `${GOLD}50`,
    access: 'High Priest only — once per year (Yom Kippur)',
    refs: ['Exod 26:31-34', 'Lev 16', 'Heb 9:3-8', 'Heb 10:19-22'],
    desc: 'The innermost chamber, separated from the Holy Place by the thick embroidered veil. A perfect cube — 10 cubits in every direction. Contains only the Ark of the Covenant. The High Priest entered once per year on the Day of Atonement with sacrificial blood and burning incense. The glory of God (Shekinah) dwelt between the cherubim on the mercy seat. The tearing of the veil at the crucifixion (Matt 27:51) opened permanent access to God through Christ (Heb 10:19-22).'
  },
  {
    id: 'tab-ark', label: 'Ark of the Covenant', abbrev: 'ARK',
    x: 0.43, y: 0.205, w: 0.14, h: 0.045,
    color: `${GOLD}cc`,
    access: 'No one except the High Priest on Yom Kippur',
    refs: ['Exod 25:10-22', 'Exod 37:1-9', 'Lev 16:2', 'Heb 9:4-5', '1 Sam 4-6'],
    desc: 'Acacia wood overlaid with gold inside and out. Contained the stone tablets of the Law, Aaron\'s budding rod, and a jar of manna (Heb 9:4). The mercy seat (atonement cover) of pure gold with two cherubim facing each other. God spoke from between the cherubim (Exod 25:22). The Ark\'s capture by the Philistines (1 Sam 4-6) was a theological catastrophe. Typologically: Christ is both the mercy seat (hilasterion in Rom 3:25 — same word used in LXX for the cover) and the Law-keeper it contained.'
  },
]

// ── SOLOMON'S TEMPLE layout ──────────────────────────────────────────────────
const SOLOMON_ZONES: Zone[] = [
  {
    id: 'sol-outer', label: 'Outer Court', abbrev: 'OUTER COURT',
    x: 0, y: 0, w: 1, h: 1,
    color: `${KHAKI}20`,
    access: 'Israelites (later: also Gentiles)',
    refs: ['1 Kgs 6:36', '2 Chr 4:9', 'Jer 19:14', 'Jer 26:2'],
    desc: 'The large outer court surrounding the entire temple complex. Later references distinguish between the outer (Gentile) and inner (Israelite) courts. The "large court" mentioned in 2 Chr 4:9. Jeremiah preached in the temple courts (Jer 26:2). Jesus taught and drove out the money changers here (John 2:14-16; Matt 21:12-13).'
  },
  {
    id: 'sol-inner', label: 'Inner Court (Priests\' Court)', abbrev: "PRIESTS' COURT",
    x: 0.12, y: 0.12, w: 0.76, h: 0.76,
    color: `${KHAKI}18`,
    access: 'Priests only',
    refs: ['1 Kgs 6:36', '2 Kgs 23:12', '2 Chr 4:9', 'Jer 36:10'],
    desc: 'The inner court, surrounded by a wall of three courses of dressed stone and one course of cedar beams (1 Kgs 6:36). Contains the bronze altar, the bronze sea, and the ten bronze basins. Access restricted to priests performing their service.'
  },
  {
    id: 'sol-altar', label: 'Bronze Altar', abbrev: 'BRONZE ALTAR',
    x: 0.40, y: 0.70, w: 0.20, h: 0.14,
    color: '#8B4513aa',
    access: 'Priests (to minister)',
    refs: ['2 Chr 4:1', '1 Kgs 8:22', '2 Kgs 16:14-15'],
    desc: 'Massive expansion over the Tabernacle altar: 20 cubits square, 10 cubits high (2 Chr 4:1). At the dedication, Solomon offered 22,000 cattle and 120,000 sheep (1 Kgs 8:63). Ahaz later displaced it to the side to install an Assyrian-style altar (2 Kgs 16:14-15).'
  },
  {
    id: 'sol-sea', label: 'The Bronze Sea (Molten Sea)', abbrev: 'BRONZE SEA',
    x: 0.62, y: 0.65, w: 0.18, h: 0.14,
    color: '#4a7a9baa',
    access: 'Priests only',
    refs: ['1 Kgs 7:23-26', '2 Chr 4:2-5', '2 Kgs 16:17'],
    desc: 'A massive circular bronze basin — 10 cubits across, 5 cubits high, 30 cubits in circumference. Held approximately 2,000 baths of water. Stood on twelve bronze oxen (3 facing each cardinal direction). Used by the priests for washing. Ahaz removed the oxen; Nebuchadnezzar broke it up (2 Kgs 16:17; 25:13). Typologically: Revelation 4:6 echoes this in the "sea of glass" before the heavenly throne.'
  },
  {
    id: 'sol-ulam', label: 'Ulam (Porch/Vestibule)', abbrev: 'PORCH',
    x: 0.38, y: 0.57, w: 0.24, h: 0.08,
    color: '#3a4a3aaa',
    access: 'Priests (to enter)',
    refs: ['1 Kgs 6:3', '2 Chr 3:4', '1 Kgs 7:21'],
    desc: 'The entrance vestibule of the temple — 20 cubits wide, 10 cubits deep, 120 cubits high according to Chronicles. Flanked by the two great bronze pillars: Jachin ("he establishes") on the right and Boaz ("in him is strength") on the left. Their names together: "He establishes strength" — a theological declaration in architecture.'
  },
  {
    id: 'sol-jachin', label: 'Pillar: Jachin', abbrev: 'JACHIN',
    x: 0.48, y: 0.58, w: 0.06, h: 0.06,
    color: '#8B6914aa',
    access: 'Decorative — entrance markers',
    refs: ['1 Kgs 7:15-22', '2 Chr 3:15-17', 'Jer 52:17-23'],
    desc: 'The right (south) pillar. "He establishes." Bronze, 18 cubits high, with a 5-cubit capital of pomegranates and lily work. Destroyed by Babylon (Jer 52:17-23). Their absence marks the breaking of the kingdom.'
  },
  {
    id: 'sol-boaz', label: 'Pillar: Boaz', abbrev: 'BOAZ',
    x: 0.38, y: 0.58, w: 0.06, h: 0.06,
    color: '#8B6914aa',
    access: 'Decorative — entrance markers',
    refs: ['1 Kgs 7:15-22', '2 Chr 3:15-17'],
    desc: 'The left (north) pillar. "In him is strength." Identical in construction to Jachin.'
  },
  {
    id: 'sol-hekal', label: 'Hekal (Holy Place)', abbrev: 'HOLY PLACE',
    x: 0.22, y: 0.25, w: 0.56, h: 0.30,
    color: '#2a3a2aaa',
    access: 'Priests only (daily ministry)',
    refs: ['1 Kgs 6:14-22', '1 Kgs 7:48-51', '2 Chr 3:8-9', 'Heb 9:2-6'],
    desc: 'The main hall — 40 cubits long, 20 cubits wide, 30 cubits high. Cedar-paneled interior with gold overlay; carved with cherubim, palm trees, and open flowers. Contains: 10 golden lampstands (5 on each side), 10 tables for showbread, the golden altar of incense, and all the implements overlaid with gold. The cedar wood from Lebanon was the finest and most aromatic available — the entire interior was clad in it so that no stone was visible (1 Kgs 6:18).'
  },
  {
    id: 'sol-debir', label: 'Debir (Holy of Holies)', abbrev: 'HOLY OF HOLIES',
    x: 0.22, y: 0.25, w: 0.22, h: 0.30,
    color: `${GOLD}45`,
    access: 'High Priest only — once per year (Yom Kippur)',
    refs: ['1 Kgs 6:19-28', '1 Kgs 8:1-13', '2 Chr 3:8-14', '2 Chr 5:7-10'],
    desc: 'A perfect cube — 20 cubits in each dimension. Covered entirely in gold — floor, walls, ceiling. Two massive cherubim of olive wood overlaid with gold, each 10 cubits tall with 10-cubit wingspans, touching the walls and each other. The Ark of the Covenant placed beneath the cherubim at the dedication (1 Kgs 8:6). The Shekinah glory filled the temple at the dedication so that the priests could not stand to minister (1 Kgs 8:10-11). The Debir represents the most concentrated presence of God on earth in the OT.'
  },
  {
    id: 'sol-ark2', label: 'Ark of the Covenant', abbrev: 'ARK',
    x: 0.26, y: 0.35, w: 0.12, h: 0.10,
    color: `${GOLD}cc`,
    access: 'High Priest only on Yom Kippur',
    refs: ['1 Kgs 8:1-9', '2 Chr 5:2-10', '2 Chr 35:3'],
    desc: 'Placed in the Debir containing only the two stone tablets (the jar of manna and Aaron\'s rod, which had been in it in the wilderness, are not mentioned in the temple account). The Ark was not seen after the Babylonian destruction — it appears to have been hidden or destroyed. Josiah instructs the Levites: "Put the sacred ark in the temple that Solomon son of David king of Israel built" (2 Chr 35:3) — suggesting it had been removed at some point.'
  },
]

// ── HEROD'S TEMPLE layout ─────────────────────────────────────────────────────
const HEROD_ZONES: Zone[] = [
  {
    id: 'her-outer', label: 'Court of the Gentiles', abbrev: 'COURT OF GENTILES',
    x: 0, y: 0, w: 1, h: 1,
    color: `${KHAKI}18`,
    access: 'Anyone (including Gentiles)',
    refs: ['Mark 11:15-17', 'John 2:14-16', 'Acts 21:28', 'Eph 2:14'],
    desc: 'The vast outer court of Herod\'s temple mount — the largest sacred precinct in the ancient world (approximately 485m x 300m). The money changers and dove sellers were in this court — hence Jesus\'s cleansing (Mark 11:15-17; John 2:14-16). A stone balustrade (Soreg) with warning inscriptions (in Greek and Latin) prohibited Gentiles from proceeding further — "no foreigner may enter within the barrier." Two of these warning inscriptions have been found by archaeologists. Paul was accused of bringing a Gentile (Trophimus) past this barrier (Acts 21:28). Paul\'s theology of Christ breaking down "the dividing wall of hostility" (Eph 2:14) refers to this physical barrier.'
  },
  {
    id: 'her-soreg', label: 'Soreg (Warning Barrier)', abbrev: 'BARRIER',
    x: 0.10, y: 0.10, w: 0.80, h: 0.015,
    color: '#7a3a3aaa',
    access: 'Marks the boundary — Gentiles prohibited beyond',
    refs: ['Acts 21:28', 'Eph 2:14', 'Josephus War 5.193-194'],
    desc: 'The stone lattice barrier (Soreg) with inscribed warnings in Greek and Latin. Josephus describes it as standing "to a height of 3 cubits." Two Greek inscription fragments have been found (one in Istanbul, one in Jerusalem). This is almost certainly what Paul means by "the dividing wall of hostility" in Ephesians 2:14.'
  },
  {
    id: 'her-women', label: "Court of the Women", abbrev: "COURT OF WOMEN",
    x: 0.28, y: 0.15, w: 0.44, h: 0.40,
    color: `${KHAKI}20`,
    access: 'All Jewish men and women (beyond the Soreg)',
    refs: ['Luke 2:22-38', 'Luke 21:1-4', 'John 8:20', 'Mark 12:41-44'],
    desc: 'The first inner court — accessible to all Jewish worshippers who had crossed the Soreg. The 13 trumpet-shaped offering boxes (shofar chests) were here — where Jesus watched the widow\'s offering (Mark 12:41-44). The treasury was here (John 8:20 — "Jesus spoke in the treasury while teaching in the temple courts"). Anna the prophetess worshipped here night and day (Luke 2:36-38). The Beautiful Gate may have been the entrance to this court (Acts 3:2).'
  },
  {
    id: 'her-israel', label: "Court of Israel", abbrev: "COURT OF ISRAEL",
    x: 0.28, y: 0.40, w: 0.44, h: 0.12,
    color: `${KHAKI}22`,
    access: 'Jewish men only (ritually pure)',
    refs: ['Luke 1:8-10', 'Josephus Ant. 15.418-420'],
    desc: 'A narrow court immediately before the Priests\' Court. Jewish laymen stood here to watch the offerings being made on their behalf. This is where Zechariah was ministering near the altar of incense when Gabriel appeared (Luke 1:8-10) — the people were praying in the Court of Israel while the priest ministered inside.'
  },
  {
    id: 'her-priests', label: "Court of the Priests", abbrev: "PRIESTS' COURT",
    x: 0.20, y: 0.52, w: 0.60, h: 0.28,
    color: `${KHAKI}15`,
    access: 'Priests only (active service)',
    refs: ['Luke 1:8-11', '1 Chr 28:12', 'Matt 12:5'],
    desc: 'The innermost court, containing the great bronze altar and the laver. Priests performed all sacrificial rituals here. Gentiles were forbidden under penalty of death; laymen could not enter; women could not enter. The most sacred accessible court in the complex.'
  },
  {
    id: 'her-altar', label: 'Altar of Burnt Offering', abbrev: 'ALTAR',
    x: 0.38, y: 0.58, w: 0.24, h: 0.16,
    color: '#8B4513bb',
    access: 'Priests only',
    refs: ['Matt 5:23-24', 'Luke 1:9', 'Matt 23:35'],
    desc: 'The great altar — according to the Mishnah, approximately 32 cubits square at the base tapering to 24 cubits at the top (10m). Continual fire burned on it. The ramp (not steps — Exod 20:26 prohibited steps to avoid indecency) was 32 cubits long. Jesus references this altar in Matthew 5:23-24 ("if you are offering your gift at the altar and remember that your brother has something against you...") and Matthew 23:35 ("from the blood of righteous Abel to the blood of Zechariah, son of Berekiah, who you murdered between the temple and the altar").'
  },
  {
    id: 'her-temple', label: "Temple Building (Naos)", abbrev: 'TEMPLE',
    x: 0.30, y: 0.62, w: 0.40, h: 0.15,
    color: '#2a3a2aaa',
    access: 'Priests only',
    refs: ['Luke 1:9-11', 'Matt 27:51', 'John 2:19-21', 'Mark 15:38'],
    desc: 'The temple building itself (Greek: naos — the inner sanctuary) as distinct from the whole complex (hieron). Herod\'s temple building was covered in white marble and gold leaf, blazing in the morning sun. Josephus describes it as appearing "like a mountain of snow" in the distance. The Golden Gate, the Porch (40 cubits wide, 20 high, 20 deep), the Holy Place, and the Holy of Holies. The doorway (60 cubits high, 20 cubits wide) was hung with a massive Babylonian tapestry. When Jesus says "destroy this temple" (John 2:19), he uses naos — the inner sanctuary — pointing to his body as the true locus of divine presence.'
  },
  {
    id: 'her-holy', label: 'Holy Place (Hekal)', abbrev: 'HOLY PLACE',
    x: 0.34, y: 0.64, w: 0.20, h: 0.11,
    color: '#1a2a1a99',
    access: 'Priests only (assigned service)',
    refs: ['Luke 1:9-11', 'Heb 9:6'],
    desc: 'Contains the golden lampstand, the table of showbread, and the golden altar of incense. Zechariah was burning incense here when Gabriel appeared (Luke 1:9-11). The burning of incense was assigned by lot — it was considered a great honor, happening only once in a priest\'s lifetime. The Talmud records that "When the lot fell on a priest to burn the incense, his fellow priests would congratulate him."'
  },
  {
    id: 'her-veil', label: 'The Veil (Parokhet)', abbrev: 'VEIL',
    x: 0.34, y: 0.645, w: 0.20, h: 0.012,
    color: '#7a5090cc',
    access: 'Separates Holy Place from Holy of Holies — impenetrable except by High Priest',
    refs: ['Matt 27:51', 'Mark 15:38', 'Luke 23:45', 'Heb 10:20'],
    desc: 'According to the Mishnah (Shekalim 8:5), the temple veil was a handbreadth thick (about 3-4 inches), woven in 72 panes, made of 820,000 threads. Josephus says it was 55 cubits high and 16 cubits wide. At the moment of Jesus\'s death, it "was torn in two from top to bottom" (Matt 27:51) — from top to bottom indicates divine action, not human tearing. Hebrews 10:20 interprets: Christ "opened for us a new and living way through the curtain, that is, his body."'
  },
  {
    id: 'her-hoh', label: 'Holy of Holies (Debir)', abbrev: 'HOLY OF HOLIES',
    x: 0.34, y: 0.657, w: 0.20, h: 0.09,
    color: `${GOLD}40`,
    access: 'High Priest only — once per year',
    refs: ['Heb 9:3-8', 'Lev 16', 'Luke 23:45'],
    desc: 'Empty in Herod\'s temple — the Ark of the Covenant had been lost since the Babylonian destruction (587 BC). Only an elevated stone (the "shetiyah" — foundation stone) remained, on which the High Priest placed the incense and blood on Yom Kippur. Josephus notes it was completely empty. The absence of the Ark was the great open wound in Second Temple Judaism — the Shekinah glory had departed (Ezek 10-11). Jesus\'s death and resurrection are the NT\'s answer: the Shekinah has come in flesh (John 1:14), and access to the Father through him is now permanent and universal.'
  },
]

// ── Structure configs ────────────────────────────────────────────────────────
type StructureKey = 'tabernacle' | 'solomon' | 'herod'

interface StructureConfig {
  label: string
  date: string
  ref: string
  zones: Zone[]
  desc: string
}

const STRUCTURES: Record<StructureKey, StructureConfig> = {
  tabernacle: {
    label: 'Tabernacle',
    date: 'c. 1446 BC',
    ref: 'Exod 25-40; Heb 9',
    zones: TABERNACLE_ZONES,
    desc: 'The portable wilderness sanctuary — "a tent for a people on the move." Built exactly as God specified (Exod 25:9 — "according to the pattern shown you on the mountain"). Every element foreshadows Christ: the sacrificial system, the high priestly garments, the three-zone structure of increasing holiness. Hebrews 8-10 argues these were "copies and shadows of what is in heaven" (8:5).',
  },
  solomon: {
    label: "Solomon's Temple",
    date: 'c. 966-587 BC',
    ref: '1 Kgs 5-8; 2 Chr 2-7',
    zones: SOLOMON_ZONES,
    desc: 'The First Temple — a permanent house for the Ark of the Covenant. Took 7 years to build (1 Kgs 6:38). The dedication prayer (1 Kgs 8:22-53) is one of the OT\'s greatest theological documents. The Shekinah glory filled the temple at dedication so that priests could not stand to minister (8:10-11). Destroyed by Nebuchadnezzar in 586 BC — the catastrophe from which the entire post-exilic period is oriented.',
  },
  herod: {
    label: "Herod's Temple",
    date: '20 BC – 70 AD',
    ref: 'John 2:20; Luke 21:5-6; Mark 13:1-2',
    zones: HEROD_ZONES,
    desc: 'The Second Temple, massively expanded by Herod the Great beginning c. 20 BC. The largest sacred precinct in the ancient world. Jesus taught, healed, and challenged religious authorities here. He predicted its complete destruction (Mark 13:2: "not one stone here will be left on another"). Destroyed by Rome in 70 AD — Titus\'s legions dismantled every stone to recover the melted gold from the fire. The prophecy fulfilled with devastating precision.',
  },
}

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  width: number
  height: number
}

export default function WorshipStructure({ width, height }: Props) {
  const [structure, setStructure] = useState<StructureKey>('tabernacle')
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)

  const HEADER_H  = 44
  const TAB_H     = 32
  const DETAIL_H  = selectedZone ? 220 : 0
  const DIAGRAM_H = height - HEADER_H - TAB_H - DETAIL_H - 2

  const config = STRUCTURES[structure]
  const DIAGRAM_W = width - 2

  return (
    <div style={{
      width, height, background: BASE_BG,
      border: `2px solid ${KHAKI}55`,
      boxShadow: `0 0 0 1px ${KHAKI}18`,
      borderRadius: 16,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', fontFamily: 'JetBrains Mono', boxSizing: 'border-box'
    }}>

      {/* ── Header ── */}
      <div style={{
        height: HEADER_H, padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'grab', borderBottom: `1px solid ${KHAKI}20`,
        background: `${KHAKI}08`, flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 8, letterSpacing: '0.18em', color: `${KHAKI}90` }}>✦</span>
          <span style={{ fontSize: 8, letterSpacing: '0.14em', color: STEEL }}>OT WORSHIP STRUCTURES</span>
        </div>
        <span style={{ fontSize: 7, color: `${KHAKI}50`, letterSpacing: '0.1em' }}>
          {config.ref}
        </span>
      </div>

      {/* ── Structure selector tabs ── */}
      <div style={{
        height: TAB_H, display: 'flex', alignItems: 'stretch',
        borderBottom: `1px solid ${KHAKI}15`,
        background: DEEP_BG, flexShrink: 0
      }}>
        {(Object.entries(STRUCTURES) as [StructureKey, StructureConfig][]).map(([key, cfg]) => {
          const active = structure === key
          return (
            <button key={key}
              onClick={() => { setStructure(key); setSelectedZone(null) }}
              style={{
                flex: 1, background: active ? `${GOLD}18` : 'transparent',
                border: 'none', borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
                cursor: 'pointer', fontFamily: 'JetBrains Mono',
                color: active ? GOLD : `${KHAKI}60`,
                fontSize: 7, letterSpacing: '0.1em',
                transition: 'all 0.15s',
              }}
            >
              <div>{cfg.label.toUpperCase()}</div>
              <div style={{ fontSize: 6, opacity: 0.7, marginTop: 1 }}>{cfg.date}</div>
            </button>
          )
        })}
      </div>

      {/* ── Diagram area ── */}
      <div style={{
        width: DIAGRAM_W, height: DIAGRAM_H,
        position: 'relative', flexShrink: 0,
        background: DEEP_BG, overflow: 'hidden',
      }}>
        {/* Compass rose — N arrow */}
        <div style={{
          position: 'absolute', top: 6, right: 8,
          fontSize: 6.5, color: `${KHAKI}40`,
          letterSpacing: '0.08em', textAlign: 'center',
          userSelect: 'none',
        }}>
          <div style={{ fontSize: 9 }}>↑</div>
          <div>N</div>
        </div>

        {/* Zone rectangles */}
        {config.zones.map(zone => {
          const isSelected = selectedZone?.id === zone.id
          const x = zone.x * DIAGRAM_W
          const y = (1 - zone.y - zone.h) * DIAGRAM_H   // flip Y (diagram drawn top=south)
          const w = zone.w * DIAGRAM_W
          const h = zone.h * DIAGRAM_H

          return (
            <div key={zone.id}
              onClick={() => setSelectedZone(isSelected ? null : zone)}
              style={{
                position: 'absolute',
                left: x, top: y, width: w, height: h,
                background: zone.color,
                border: isSelected
                  ? `2px solid ${GOLD}`
                  : `1px solid ${KHAKI}25`,
                borderRadius: 2,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border 0.12s',
                overflow: 'hidden',
              }}
            >
              {h > 16 && w > 40 && (
                <span style={{
                  fontSize: Math.min(6.5, h / 3.5),
                  color: isSelected ? GOLD : KHAKI,
                  letterSpacing: '0.08em',
                  textAlign: 'center',
                  padding: '1px 2px',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                  display: 'block',
                }}>
                  {zone.abbrev}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Detail panel ── */}
      {selectedZone && (
        <div style={{
          height: DETAIL_H, flexShrink: 0,
          borderTop: `1px solid ${KHAKI}20`,
          background: CARD_BG,
          overflowY: 'auto',
          padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 7, letterSpacing: '0.14em', color: GOLD, marginBottom: 2 }}>
                {selectedZone.abbrev}
              </div>
              <div style={{ fontSize: 13, fontFamily: "'Crimson Pro', serif", color: BONE, fontWeight: 600 }}>
                {selectedZone.label}
              </div>
              <div style={{ fontSize: 7.5, color: `${KHAKI}70`, marginTop: 2, letterSpacing: '0.04em' }}>
                Access: {selectedZone.access}
              </div>
            </div>
            <button onClick={() => setSelectedZone(null)} style={{
              fontSize: 8, color: `${KHAKI}50`, background: 'transparent',
              border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'JetBrains Mono',
            }}>✕</button>
          </div>

          <p style={{
            fontSize: 10.5, fontFamily: "'Crimson Pro', serif",
            color: KHAKI, lineHeight: 1.65, margin: '0 0 8px',
          }}>
            {selectedZone.desc}
          </p>

          {selectedZone.refs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {selectedZone.refs.map(ref => (
                <span key={ref} style={{
                  fontSize: 7, color: `${KHAKI}75`,
                  background: `${KHAKI}0d`,
                  border: `1px solid ${KHAKI}25`,
                  borderRadius: 3, padding: '1px 5px',
                  letterSpacing: '0.04em',
                }}>
                  {ref}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom desc strip when no zone selected ── */}
      {!selectedZone && (
        <div style={{
          padding: '7px 14px', flexShrink: 0,
          borderTop: `1px solid ${KHAKI}12`,
          background: DEEP_BG,
          fontSize: 9.5, fontFamily: "'Crimson Pro', serif",
          color: `${KHAKI}60`, lineHeight: 1.55,
          minHeight: 44,
        }}>
          {config.desc.slice(0, 200)}{config.desc.length > 200 ? '…' : ''}
          <span style={{ fontSize: 7, color: `${KHAKI}35`, marginLeft: 6, letterSpacing: '0.08em' }}>
            TAP A ZONE TO EXPLORE
          </span>
        </div>
      )}
    </div>
  )
}

// ── React Flow node wrapper ──────────────────────────────────────────────────
export function WorshipStructureNode({ data }: NodeProps) {
  const d = data as { width?: number; height?: number }
  return (
    <WorshipStructure
      width={d.width  ?? 560}
      height={d.height ?? 560}
    />
  )
}
