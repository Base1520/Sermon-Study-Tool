/**
 * REGIONS AND FEATURES — the two halves of the map's vocabulary that are not cities.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * `TOPO_CITIES` in components/TopoMap.tsx holds 92 points and nothing else. That is
 * why Exodus 2 opened the map and it did not move: the passage happens at the NILE
 * (a river) and in MIDIAN (a region), and neither can be a point in a city list.
 * The app could say "Paul was in Corinth" and could not say "Moses fled to Midian" —
 * which is most of the Old Testament.
 *
 * This file supplies the missing two thirds:
 *
 *   TOPO_REGIONS   areas   — Midian, Goshen, Galilee, Macedonia …
 *   TOPO_FEATURES  rivers, seas, mountains, and the handful of named sites the
 *                  routes need that are not in TOPO_CITIES
 *
 * ── ON THE BOUNDS ─────────────────────────────────────────────────────────────
 *
 * `bounds` is a ROUGH EXTENT. It is not a border.
 *
 * Ancient regions did not have surveyed edges. Where Gilead stopped and Bashan
 * began was a matter of who was speaking, when, and about what; the line moved with
 * the century and with the writer. Every box here is a reading aid — "this passage
 * happens roughly HERE" — and nothing more.
 *
 * So: do not "correct" these into precision. Tightening Judea to a coastline or
 * splitting Samaria along a wadi would assert a specificity the sources do not
 * support. If a box looks sloppy, that is the box being honest. The renderer should
 * draw these soft — a filled area with a label, never a crisp outline.
 *
 * ── ON THE OVERLAPS ───────────────────────────────────────────────────────────
 *
 * Regions overlap each other, and three of them share a name with an entry in
 * TOPO_CITIES. This is not duplication to be cleaned up — it is the actual state of
 * the geography, and each case is flagged inline:
 *
 *   Samaria     a city AND the region around it (1 Kings 16:24 vs John 4:4)
 *   Goshen      a district of the delta; TOPO_CITIES pins it as a point
 *   Mt. Sinai   present in TOPO_CITIES as a point; repeated in TOPO_FEATURES
 *               because only the feature record carries `disputed: true`
 *
 * A resolver that checks cities first will find the city and be geographically
 * right in all three cases — the coordinates agree deliberately. It will only miss
 * the extent (and, for Sinai, the dispute), so prefer the region/feature record
 * when the caller wants area or confidence.
 *
 * ── ALIASES ───────────────────────────────────────────────────────────────────
 *
 * Lowercase, matching the convention in TOPO_CITIES. Aliases are for genuine
 * alternate names of the SAME place. They are deliberately conservative: several
 * obvious-looking aliases are omitted because they name something else. Those
 * omissions are commented where they are not obvious, so nobody helpfully adds them
 * back and quietly relocates a passage.
 */

// ── Regions ────────────────────────────────────────────────────────────────────

export interface TopoRegion {
  name: string
  aliases: string[]
  /** Rough extent, NOT a border. `[[swLat, swLon], [neLat, neLon]]`. */
  bounds: [[number, number], [number, number]]
  /**
   * Same idea as a city's tier: 1 is a region a reader needs at any zoom, 3 only
   * matters once you are already looking at that stretch of ground.
   */
  tier: 1 | 2 | 3
  era?: 'ot' | 'nt' | 'both'
  /** Sourcing caveat, shown or not at the renderer's discretion. */
  note?: string
}

export const TOPO_REGIONS: TopoRegion[] = [
  // ── Egypt and the Sinai ──────────────────────────────────────────────────────
  {
    name: 'Egypt',
    aliases: ['land of egypt', 'the land of egypt', 'mizraim'],
    bounds: [[23.9, 29.6], [31.6, 32.9]],
    tier: 1,
    era: 'both',
    note: 'The Nile valley and the delta — the inhabited strip, not the modern state. The Sinai peninsula is treated separately here.',
  },
  {
    name: 'Goshen',
    aliases: ['land of goshen', 'the land of goshen', 'land of rameses'],
    bounds: [[30.2, 31.4], [31.05, 32.25]],
    tier: 2,
    era: 'ot',
    note: 'The eastern delta. The text places it by relationship — near enough to Pharaoh to be summoned, far enough for shepherds — not by boundary. TOPO_CITIES also carries Goshen as a point.',
  },
  {
    name: 'Midian',
    aliases: ['land of midian', 'the land of midian'],
    bounds: [[27.2, 34.8], [29.6, 37.2]],
    tier: 2,
    era: 'ot',
    note: 'North-west Arabia, east of the Gulf of Aqaba. Midian was a people before it was a place, and Midianites appear well outside this box; the extent marks where they are settled in the narrative.',
  },
  {
    name: 'Wilderness of Sin',
    aliases: ['desert of sin', 'the wilderness of sin'],
    bounds: [[28.4, 32.9], [29.6, 33.9]],
    tier: 3,
    era: 'ot',
    note: 'Placed "between Elim and Sinai" (Exodus 16:1). Elim is unlocated, so the extent follows the western side of the peninsula on the traditional southern reading. Not to be confused with the Wilderness of Zin — different word, different place.',
  },
  {
    name: 'Wilderness of Paran',
    aliases: ['desert of paran', 'the wilderness of paran', 'paran'],
    bounds: [[29.2, 33.4], [30.7, 35.0]],
    tier: 3,
    era: 'ot',
  },
  {
    name: 'Wilderness of Zin',
    aliases: ['desert of zin', 'the wilderness of zin', 'zin'],
    bounds: [[30.25, 34.3], [31.0, 35.35]],
    tier: 3,
    era: 'ot',
    note: 'Kadesh sits inside it (Numbers 20:1), and it forms the southern edge of Judah’s allotment (Joshua 15:1).',
  },
  // ── Canaan / the land ────────────────────────────────────────────────────────
  {
    name: 'The Negev',
    aliases: ['negev', 'negeb', 'the negeb'],
    bounds: [[29.9, 34.3], [31.35, 35.4]],
    tier: 2,
    era: 'both',
    // Not aliased to "the south": the Hebrew word is directional and translations
    // use it both ways, so the alias would drag unrelated passages down here.
  },
  {
    name: 'Philistia',
    aliases: ['land of the philistines', 'the land of the philistines'],
    bounds: [[31.3, 34.3], [31.95, 34.95]],
    tier: 2,
    era: 'ot',
    note: 'The southern coastal plain, anchored by the five cities. Philistine pressure reached far inland at times; the extent marks the heartland.',
  },
  {
    name: 'Judea',
    aliases: ['judaea', 'judah', 'land of judah', 'the hill country of judah'],
    bounds: [[31.2, 34.6], [31.95, 35.5]],
    tier: 1,
    era: 'both',
    note: 'The hill country and shephelah. Roman Judea and the earlier kingdom of Judah are not the same administrative thing in the same century; the ground under both is close enough that one extent serves, and the alias is a convenience rather than a claim of identity.',
  },
  {
    name: 'Samaria',
    aliases: ['hill country of ephraim'],
    bounds: [[31.95, 34.9], [32.65, 35.6]],
    tier: 1,
    era: 'both',
    note: 'The central hill country. TOPO_CITIES also carries Samaria as a city — the capital Omri built inside this region. Both are correct and the passage decides which is meant.',
    // Not aliased to "Ephraim": that is a tribe, and also a town (John 11:54).
  },
  {
    name: 'Galilee',
    aliases: ['the galilee', 'lower galilee', 'upper galilee', 'galilee of the gentiles'],
    bounds: [[32.6, 35.0], [33.35, 35.75]],
    tier: 1,
    era: 'both',
  },
  {
    name: 'Decapolis',
    aliases: ['the decapolis'],
    bounds: [[31.9, 35.2], [33.1, 36.5]],
    tier: 2,
    era: 'nt',
    note: 'A league of cities rather than a territory, so the extent is the scatter of the cities themselves. Lists of which ten differ.',
  },
  // ── Transjordan ──────────────────────────────────────────────────────────────
  {
    name: 'Gilead',
    aliases: ['land of gilead', 'the land of gilead', 'mount gilead'],
    bounds: [[31.7, 35.45], [32.6, 36.2]],
    tier: 2,
    era: 'ot',
  },
  {
    name: 'Bashan',
    aliases: ['land of bashan', 'the land of bashan', 'hauran'],
    bounds: [[32.55, 35.7], [33.4, 36.9]],
    tier: 2,
    era: 'ot',
    // Not aliased to "Golan": that is a city of refuge within Bashan, not the region.
  },
  {
    name: 'Ammon',
    aliases: ['land of the ammonites', 'the land of the ammonites'],
    bounds: [[31.7, 35.75], [32.35, 36.4]],
    tier: 2,
    era: 'ot',
    // Not aliased to "Rabbah": that is the capital city, a point, not the region.
  },
  {
    name: 'Moab',
    aliases: ['land of moab', 'the land of moab', 'plains of moab', 'the plains of moab'],
    bounds: [[30.9, 35.35], [31.85, 36.1]],
    tier: 2,
    era: 'ot',
    note: 'Moab proper sits between the Zered and the Arnon; the plains of Moab, where Israel camped opposite Jericho, lie north of the Arnon. The extent covers both because the narrative uses both.',
  },
  {
    name: 'Edom',
    aliases: ['land of edom', 'the land of edom', 'seir', 'mount seir', 'idumea'],
    bounds: [[29.5, 34.9], [30.95, 36.2]],
    tier: 2,
    era: 'ot',
  },
  // ── Syria and Mesopotamia ────────────────────────────────────────────────────
  {
    name: 'Syria',
    aliases: ['aram', 'aram-damascus', 'the region of syria'],
    bounds: [[32.6, 35.6], [36.7, 40.0]],
    tier: 2,
    era: 'both',
    note: 'Aram in the Old Testament, the Roman province in the New. The two are not the same shape; the extent is broad enough to serve both.',
  },
  {
    name: 'Assyria',
    aliases: ['land of assyria', 'the land of assyria', 'asshur'],
    bounds: [[34.8, 41.8], [37.3, 44.6]],
    tier: 1,
    era: 'ot',
    note: 'The heartland on the upper Tigris around Assur, Nineveh and Calah. The empire at its height ran far past this; the extent marks the homeland deportees were carried to.',
  },
  // ── Anatolia and the Greek world ─────────────────────────────────────────────
  {
    name: 'Asia Minor',
    aliases: ['anatolia'],
    bounds: [[36.0, 26.0], [42.1, 41.5]],
    tier: 1,
    era: 'both',
    note: 'A modern geographic term for the peninsula, not a biblical one. Kept because it is how a reader will ask for it.',
  },
  {
    name: 'Asia',
    aliases: ['province of asia', 'the province of asia', 'roman asia'],
    bounds: [[36.8, 26.2], [40.0, 30.8]],
    tier: 1,
    era: 'nt',
    note: 'The Roman province at the western end of the peninsula — Ephesus and the seven churches. Much smaller than Asia Minor, and the two are constantly confused.',
  },
  {
    name: 'Galatia',
    aliases: ['the region of galatia'],
    bounds: [[37.0, 30.3], [40.6, 35.5]],
    tier: 2,
    era: 'nt',
    note: 'The Roman province, which ran from the old Galatian territory in the north down through Pisidia and Lycaonia. Which end of it Paul wrote to is a live question, and the extent covers both rather than deciding it.',
  },
  {
    name: 'Macedonia',
    aliases: ['province of macedonia', 'the province of macedonia'],
    bounds: [[39.9, 20.4], [41.6, 24.9]],
    tier: 1,
    era: 'nt',
  },
  {
    name: 'Achaia',
    aliases: ['greece', 'province of achaia', 'the province of achaia'],
    bounds: [[36.3, 20.9], [38.9, 24.3]],
    tier: 1,
    era: 'nt',
    note: 'Southern Greece. Acts calls it Greece in one place and Achaia in another, so both resolve here.',
  },
]

// ── Features ───────────────────────────────────────────────────────────────────

/**
 * `site` is the escape hatch: a place that is a point like a city but is not in
 * TOPO_CITIES, and is needed because a route leg names it. Five of them, no more.
 * If TopoMap's city list ever absorbs one, delete it here rather than keeping two.
 */
export type TopoFeatureKind = 'river' | 'sea' | 'lake' | 'mountain' | 'site'

export interface TopoFeature {
  name: string
  aliases: string[]
  kind: TopoFeatureKind
  /**
   * The single anchor, `[lat, lon]`. EVERY feature has one, including the rivers,
   * so a route leg pointing at "Jordan" always resolves to a coordinate. For a
   * line feature the anchor is the stretch a reader most likely means — stated in
   * `note` when the choice is not obvious.
   */
  point: [number, number]
  /** Ordered `[lat, lon]` course for line features. Absent on points. */
  path?: [number, number][]
  tier: 1 | 2 | 3
  era?: 'ot' | 'nt' | 'both'
  /** True only where the location itself is genuinely argued — not merely imprecise. */
  disputed?: boolean
  /** REQUIRED when `disputed` is true. States the argument in plain terms. */
  disputedNote?: string
  note?: string
}

export const TOPO_FEATURES: TopoFeature[] = [
  // ── Rivers ───────────────────────────────────────────────────────────────────
  {
    name: 'Nile',
    aliases: ['the nile', 'nile river', 'river nile'],
    kind: 'river',
    point: [30.05, 31.23],
    path: [
      [24.09, 32.90], // Aswan — the first cataract
      [25.70, 32.64], // Thebes
      [26.16, 32.72], // the Qena bend
      [27.18, 31.18], // Asyut
      [28.09, 30.75], // Minya
      [29.07, 31.10],
      [30.05, 31.23], // the delta apex, at Memphis
      [30.58, 31.50],
      [31.42, 31.81], // Damietta mouth
    ],
    tier: 1,
    era: 'ot',
    note: 'Anchored at the delta apex, since the passages that name the river mostly sit in lower Egypt. Only the eastern branch is drawn; the delta is a fan, not a line.',
    // NOT aliased to "the brook of Egypt" or "the river of Egypt" — that is the
    // wadi at the southern edge of Canaan (Numbers 34:5), a different watercourse
    // two hundred miles away.
  },
  {
    name: 'Jordan',
    aliases: ['the jordan', 'jordan river', 'river jordan'],
    kind: 'river',
    point: [31.84, 35.55],
    path: [
      [33.25, 35.63], // the springs below Hermon
      [32.98, 35.62],
      [32.88, 35.59], // enters the Sea of Galilee
      [32.71, 35.57], // leaves it
      [32.55, 35.57],
      [32.38, 35.55],
      [32.10, 35.53],
      [31.87, 35.54], // the fords opposite Jericho
      [31.77, 35.55], // mouth, at the Dead Sea
    ],
    tier: 1,
    era: 'both',
    note: 'Anchored at the fords opposite Jericho — the crossing of Joshua 3 and the stretch where John was baptising.',
  },
  {
    name: 'Euphrates',
    aliases: ['the euphrates', 'river euphrates', 'the great river', 'perath'],
    kind: 'river',
    point: [34.37, 41.95],
    path: [
      [36.83, 38.01], // the crossing at Carchemish
      [35.95, 39.02],
      [35.34, 40.14],
      [34.55, 40.89], // Mari
      [34.37, 41.95],
      [33.64, 42.83],
      [32.54, 44.42], // Babylon
      [30.96, 46.10], // Ur
      [30.50, 47.80],
    ],
    tier: 2,
    era: 'ot',
    note: 'Anchored mid-course rather than at either end, because "the River" is used as a boundary along its whole length. The crossing at Carchemish is the first point on the path.',
  },
  // ── Seas and lakes ───────────────────────────────────────────────────────────
  {
    name: 'Red Sea',
    aliases: ['the red sea', 'sea of reeds', 'reed sea', 'yam suph'],
    kind: 'sea',
    point: [30.05, 32.52],
    path: [
      [30.57, 32.27], // Lake Timsah
      [30.33, 32.38], // the Bitter Lakes
      [29.97, 32.55], // head of the Gulf of Suez
      [29.20, 32.85],
      [28.20, 33.35],
      [27.30, 33.90],
    ],
    tier: 1,
    era: 'ot',
    disputed: true,
    disputedNote:
      'Both the water meant by yam suph and the point at which Israel crossed it are genuinely argued. Candidates run from the lakes of the isthmus in the north to the Gulf of Aqaba in the east, and the Hebrew phrase does not settle it. The mark shows one candidate area, not a determined crossing.',
  },
  {
    name: 'Dead Sea',
    aliases: ['the dead sea', 'salt sea', 'the salt sea', 'sea of the arabah', 'eastern sea'],
    kind: 'lake',
    point: [31.50, 35.47],
    tier: 1,
    era: 'ot',
  },
  {
    name: 'Sea of Galilee',
    aliases: ['sea of tiberias', 'lake of gennesaret', 'sea of chinnereth', 'sea of kinneret'],
    kind: 'lake',
    point: [32.82, 35.59],
    tier: 1,
    era: 'both',
    // "Chinnereth" alone is left off: it is also a fortified town on the shore
    // (Joshua 19:35), and the compound forms above are unambiguous.
  },
  // ── Mountains ────────────────────────────────────────────────────────────────
  {
    name: 'Mt. Sinai',
    aliases: ['sinai', 'mount sinai', 'mt sinai', 'horeb', 'mount horeb', 'the mountain of god'],
    kind: 'mountain',
    point: [28.54, 33.97],
    tier: 1,
    era: 'ot',
    disputed: true,
    disputedNote:
      'The mountain’s location is genuinely argued. The traditional site is in the south of the Sinai peninsula; other reconstructions place it in the north of the peninsula, and others again across the gulf in Midian. The mark follows the traditional site because the rest of the wilderness itinerary is drawn from it — not because the question is closed.',
    note: 'Deliberately duplicated: TOPO_CITIES carries Mt. Sinai as a point at the same coordinates. Only this record carries the dispute, so prefer it when the caller needs confidence.',
  },
  {
    name: 'Mount Nebo',
    aliases: ['nebo', 'pisgah', 'the top of pisgah'],
    kind: 'mountain',
    point: [31.77, 35.73],
    tier: 2,
    era: 'ot',
    note: 'Deuteronomy 34:1 names the same place two ways — "Mount Nebo, to the top of Pisgah" — so both resolve here.',
  },
  {
    name: 'Mount Carmel',
    aliases: ['mt carmel', 'mt. carmel'],
    kind: 'mountain',
    point: [32.73, 35.05],
    tier: 2,
    era: 'ot',
    // NOT aliased to bare "Carmel": that is a town in the hill country of Judah
    // (1 Samuel 25:2), a hundred miles south. Aliasing it would move Nabal to Elijah.
  },
  // ── Sites the routes need that TOPO_CITIES does not carry ────────────────────
  {
    name: 'Kadesh-barnea',
    aliases: ['kadesh', 'kadesh barnea', 'en-mishpat', 'meribah-kadesh'],
    kind: 'site',
    point: [30.65, 34.42],
    tier: 2,
    era: 'ot',
    note: 'Identified with the spring at Ain el-Qudeirat. That identification is widely held rather than proved, and the surrounding oases are also candidates.',
  },
  {
    name: 'Shittim',
    aliases: ['abel-shittim', 'abel shittim'],
    kind: 'site',
    point: [31.85, 35.65],
    tier: 3,
    era: 'ot',
    note: 'The last camp before the Jordan crossing. Placed on the plains of Moab opposite Jericho; which of the tells there it is remains open.',
  },
  {
    name: 'Gibeon',
    aliases: [],
    kind: 'site',
    point: [31.85, 35.18],
    tier: 3,
    era: 'ot',
  },
  {
    name: 'Hazor',
    aliases: [],
    kind: 'site',
    point: [33.02, 35.57],
    tier: 2,
    era: 'ot',
  },
  {
    name: 'Riblah',
    aliases: [],
    kind: 'site',
    point: [34.45, 36.55],
    tier: 3,
    era: 'ot',
    note: 'On the Orontes, where the Babylonian king held court during the campaign against Jerusalem.',
  },
]
