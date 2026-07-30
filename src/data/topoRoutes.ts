/**
 * ROUTES — ordered journeys, drawn only when a reader asks for them.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Cole's ask: "we need possible journeys in wilderness, into the land, conquest
 * etc... as an option in OT text." The operative word is OPTION. A route never
 * draws on its own. The primary view stays about the passage in front of the
 * reader; the wider movement is one deliberate click away, and a second click
 * clears it.
 *
 * ── WHAT A LEG IS ─────────────────────────────────────────────────────────────
 *
 * A leg is ONE RECORDED MOVEMENT between two named places, carrying the reference
 * that records it and one plain sentence about what happened at the far end.
 *
 * The line between the two marks ORIGIN AND DESTINATION, NOT THE ROAD TAKEN.
 * Nobody walked a straight line from Antioch to Derbe; the Taurus mountains are in
 * the way. Where a text names intermediate places that cannot be located — Succoth,
 * Marah, Elim, Makkedah, Libnah — they are named in the sentence and left off the
 * line rather than pinned to invented coordinates. Where a text names places that
 * CAN be located but that the passage does not put the traveller in, they are left
 * out entirely.
 *
 * ── THE CHAINING RULE (load-bearing) ──────────────────────────────────────────
 *
 * Within a route, `legs[i].to === legs[i + 1].from`. Always. The check script
 * enforces it.
 *
 * This is not tidiness. If legs did not chain, a renderer drawing the whole route
 * as one polyline would connect the end of one journey to the start of an unrelated
 * one and draw a line nobody ever travelled. That is why the exile is three routes
 * and not one with a gap in the middle, and why Paul's journeys are four. A journey
 * that cannot chain gets its own entry; routes that belong together share a `group`.
 *
 * ── CONFIDENCE ────────────────────────────────────────────────────────────────
 *
 *   located      every waypoint is a securely identified site
 *   approximate  the movement is recorded, but a waypoint is a region, or a site
 *                identification is held rather than settled
 *   disputed     the location itself is genuinely argued — draw DASHED and show
 *                `disputedNote`
 *
 * A confident solid line through contested ground is the cartographic version of
 * asserting a disputed date. This app refuses to do that in prose, so it refuses to
 * do it on the map.
 *
 * ── SIX FAMILIES ──────────────────────────────────────────────────────────────
 *
 * Paul's journeys · into the land · the conquest · exile and return · Abraham ·
 * the Exodus. Not every trip in Scripture. Six that matter beat sixty that are
 * noise. Eleven entries below, because four of them are Paul's and three are the
 * exile — the families are still six.
 *
 * Every `from` and `to` resolves to a city in TOPO_CITIES, a region in
 * TOPO_REGIONS, or a feature in TOPO_FEATURES. A leg naming a place that exists in
 * none of the three is a silent broken line, so the check script proves it.
 */

export interface TopoRouteLeg {
  /** Must resolve to a TOPO_CITIES name/alias, a TOPO_REGIONS one, or a TOPO_FEATURES one. */
  from: string
  to: string
  /** The passage that records the movement. */
  ref: string
  /** One plain sentence about what happened at the far end. */
  note: string
}

export interface TopoRoute {
  id: string
  name: string
  /** The span of text the route belongs to, e.g. "Exodus 12 – Deuteronomy 34". */
  scope: string
  legs: TopoRouteLeg[]
  confidence: 'located' | 'approximate' | 'disputed'
  /** REQUIRED when confidence is 'disputed'. Stated plainly, no scholar named. */
  disputedNote?: string
  /** Family label, for routes that belong together in the UI. */
  group?: string
  /** Standing caveat about the route as a whole. */
  note?: string
}

export const TOPO_ROUTES: TopoRoute[] = [
  // ═══ 1. PAUL'S JOURNEYS ═════════════════════════════════════════════════════
  // Built first because they are the best attested and the most likely to be
  // checked by a reader who already knows them.
  {
    id: 'paul-first-journey',
    name: 'Paul’s first journey',
    scope: 'Acts 13–14',
    group: 'Paul’s journeys',
    confidence: 'located',
    legs: [
      {
        from: 'Antioch',
        to: 'Cyprus',
        ref: 'Acts 13:1–5',
        note: 'Sent out by the church at Antioch, Barnabas and Saul sailed from Seleucia and preached in the synagogues at Salamis.',
      },
      {
        from: 'Cyprus',
        to: 'Perga',
        ref: 'Acts 13:13',
        note: 'They crossed to Perga in Pamphylia, where John Mark left them and went back to Jerusalem.',
      },
      {
        from: 'Perga',
        to: 'Antioch of Pisidia',
        ref: 'Acts 13:14–52',
        note: 'Paul preached in the synagogue on the Sabbath, and when the leading men of the city drove them out he turned to the Gentiles.',
      },
      {
        from: 'Antioch of Pisidia',
        to: 'Iconium',
        ref: 'Acts 14:1–5',
        note: 'A great number believed before the city split and a plot to stone them forced them on.',
      },
      {
        from: 'Iconium',
        to: 'Lystra',
        ref: 'Acts 14:6–20',
        note: 'A lame man was healed, the crowd tried to sacrifice to them, and Paul was stoned and dragged out of the city for dead.',
      },
      {
        from: 'Lystra',
        to: 'Derbe',
        ref: 'Acts 14:20–21',
        note: 'They preached the gospel there and made many disciples.',
      },
      {
        from: 'Derbe',
        to: 'Antioch of Pisidia',
        ref: 'Acts 14:21–23',
        note: 'They turned back through Lystra and Iconium to Antioch, strengthening the disciples and appointing elders in every church.',
      },
      {
        from: 'Antioch of Pisidia',
        to: 'Attalia',
        ref: 'Acts 14:24–25',
        note: 'They came back down through Pisidia and Pamphylia, spoke the word in Perga, and went on to the port at Attalia.',
      },
      {
        from: 'Attalia',
        to: 'Antioch',
        ref: 'Acts 14:26–28',
        note: 'They sailed home and reported to the church that God had opened a door of faith to the Gentiles.',
      },
    ],
  },
  {
    id: 'paul-second-journey',
    name: 'Paul’s second journey',
    scope: 'Acts 15:36 – 18:22',
    group: 'Paul’s journeys',
    confidence: 'located',
    legs: [
      {
        from: 'Antioch',
        to: 'Derbe',
        ref: 'Acts 15:36–16:1',
        note: 'Paul and Barnabas split over John Mark, and Paul went overland with Silas through Syria and Cilicia to the churches of the first journey.',
      },
      {
        from: 'Derbe',
        to: 'Lystra',
        ref: 'Acts 16:1–3',
        note: 'Timothy was well spoken of by the brothers there, and Paul took him along.',
      },
      {
        from: 'Lystra',
        to: 'Troas',
        ref: 'Acts 16:6–8',
        note: 'Kept from speaking in Asia and from entering Bithynia, they passed by Mysia and came down to the coast at Troas.',
      },
      {
        from: 'Troas',
        to: 'Philippi',
        ref: 'Acts 16:9–40',
        note: 'A vision of a man of Macedonia turned the mission west; at Philippi Lydia believed and Paul and Silas were beaten and jailed.',
      },
      {
        from: 'Philippi',
        to: 'Thessalonica',
        ref: 'Acts 17:1–9',
        note: 'They passed through Amphipolis and Apollonia to a city with a synagogue, and a mob dragged Jason before the authorities.',
      },
      {
        from: 'Thessalonica',
        to: 'Berea',
        ref: 'Acts 17:10–14',
        note: 'The Bereans received the word eagerly and examined the Scriptures daily to see whether these things were so.',
      },
      {
        from: 'Berea',
        to: 'Athens',
        ref: 'Acts 17:15–34',
        note: 'Paul reasoned in the synagogue and the marketplace and then addressed the council at the Areopagus.',
      },
      {
        from: 'Athens',
        to: 'Corinth',
        ref: 'Acts 18:1–11',
        note: 'He worked as a tentmaker with Aquila and Priscilla and stayed a year and six months teaching the word of God.',
      },
      {
        from: 'Corinth',
        to: 'Cenchreae',
        ref: 'Acts 18:18',
        note: 'He cut his hair at the port because of a vow before sailing for Syria.',
      },
      {
        from: 'Cenchreae',
        to: 'Ephesus',
        ref: 'Acts 18:19–21',
        note: 'He reasoned in the synagogue, left Priscilla and Aquila there, and promised to return if God willed.',
      },
      {
        from: 'Ephesus',
        to: 'Caesarea',
        ref: 'Acts 18:22',
        note: 'He landed at Caesarea and went up and greeted the church.',
      },
      {
        from: 'Caesarea',
        to: 'Antioch',
        ref: 'Acts 18:22',
        note: 'The journey ended where it began, at the sending church.',
      },
    ],
  },
  {
    id: 'paul-third-journey',
    name: 'Paul’s third journey',
    scope: 'Acts 18:23 – 21:17',
    group: 'Paul’s journeys',
    confidence: 'located',
    legs: [
      {
        from: 'Antioch',
        to: 'Ephesus',
        ref: 'Acts 18:23; 19:1–10',
        note: 'He went through the Galatian and Phrygian country and then taught in the hall of Tyrannus for two years.',
      },
      {
        from: 'Ephesus',
        to: 'Macedonia',
        ref: 'Acts 19:23–20:1',
        note: 'After the silversmiths’ riot over Artemis he encouraged the disciples and left for Macedonia.',
      },
      {
        from: 'Macedonia',
        to: 'Achaia',
        ref: 'Acts 20:2–3',
        note: 'He came into Greece and stayed three months, until a plot against him as he was about to sail changed his route.',
      },
      {
        from: 'Achaia',
        to: 'Philippi',
        ref: 'Acts 20:3–6',
        note: 'He doubled back overland through Macedonia and sailed from Philippi after the days of Unleavened Bread.',
      },
      {
        from: 'Philippi',
        to: 'Troas',
        ref: 'Acts 20:6–12',
        note: 'He stayed seven days and talked until midnight, and Eutychus fell from the third-storey window.',
      },
      {
        from: 'Troas',
        to: 'Miletus',
        ref: 'Acts 20:13–38',
        note: 'He sailed past Ephesus to save time and called its elders down to him for a farewell they knew was final.',
      },
      {
        from: 'Miletus',
        to: 'Tyre',
        ref: 'Acts 21:1–6',
        note: 'The ship unloaded its cargo there, and the disciples told Paul through the Spirit not to go on to Jerusalem.',
      },
      {
        from: 'Tyre',
        to: 'Caesarea',
        ref: 'Acts 21:7–14',
        note: 'Agabus bound his own hands and feet with Paul’s belt and said the owner of it would be bound in Jerusalem.',
      },
      {
        from: 'Caesarea',
        to: 'Jerusalem',
        ref: 'Acts 21:15–17',
        note: 'Paul went up anyway, and the brothers received him gladly.',
      },
    ],
  },
  {
    id: 'paul-voyage-to-rome',
    name: 'The voyage to Rome',
    scope: 'Acts 27–28',
    group: 'Paul’s journeys',
    confidence: 'located',
    legs: [
      {
        from: 'Caesarea',
        to: 'Sidon',
        ref: 'Acts 27:1–3',
        note: 'Paul sailed under guard, and the centurion let him go to his friends there and be cared for.',
      },
      {
        from: 'Sidon',
        to: 'Myra',
        ref: 'Acts 27:4–6',
        note: 'They ran under the lee of Cyprus against the wind and transferred at Myra to a grain ship bound for Italy.',
      },
      {
        from: 'Myra',
        to: 'Cnidus',
        ref: 'Acts 27:7',
        note: 'The sailing was slow for many days and they arrived off the point with difficulty.',
      },
      {
        from: 'Cnidus',
        to: 'Crete',
        ref: 'Acts 27:7–12',
        note: 'They sheltered at Fair Havens, where Paul warned against sailing on and the centurion sided with the pilot and the owner.',
      },
      {
        from: 'Crete',
        to: 'Malta',
        ref: 'Acts 27:14–28:1',
        note: 'A northeaster drove the ship for fourteen days until it ran aground, and every one of the 276 aboard reached land alive.',
      },
      {
        from: 'Malta',
        to: 'Syracuse',
        ref: 'Acts 28:11–12',
        note: 'After three months they sailed in an Alexandrian ship and put in for three days.',
      },
      {
        from: 'Syracuse',
        to: 'Rhegium',
        ref: 'Acts 28:13',
        note: 'They made a circuit up the coast and waited a day for a south wind.',
      },
      {
        from: 'Rhegium',
        to: 'Puteoli',
        ref: 'Acts 28:13–14',
        note: 'They found brothers there and were invited to stay seven days.',
      },
      {
        from: 'Puteoli',
        to: 'Rome',
        ref: 'Acts 28:14–16',
        note: 'Believers came out as far as the Forum of Appius to meet him, and he was allowed to live by himself with the soldier who guarded him.',
      },
    ],
  },

  // ═══ 2. ENTRY INTO THE LAND ═════════════════════════════════════════════════
  {
    id: 'entry-into-the-land',
    name: 'Entry into the land',
    scope: 'Joshua 1–6',
    confidence: 'approximate',
    note: 'Three short moves across about ten miles of ground. Jericho is securely identified; Shittim and Gilgal are placed on the plain rather than pinned, because neither site is settled.',
    legs: [
      {
        from: 'Shittim',
        to: 'Jordan',
        ref: 'Joshua 3:1–13',
        note: 'Israel broke camp and lodged at the river three days before crossing.',
      },
      {
        from: 'Jordan',
        to: 'Gilgal',
        ref: 'Joshua 4:1–24',
        note: 'They crossed on the tenth day of the first month and set up twelve stones taken from the riverbed.',
      },
      {
        from: 'Gilgal',
        to: 'Jericho',
        ref: 'Joshua 6:1–21',
        note: 'They circled the city once a day for six days and seven times on the seventh, and the city fell.',
      },
    ],
  },

  // ═══ 3. THE CONQUEST ════════════════════════════════════════════════════════
  {
    id: 'the-conquest',
    name: 'The conquest',
    scope: 'Joshua 6–12',
    confidence: 'approximate',
    note: 'The book summarises a campaign rather than logging an itinerary, so these legs are the recorded engagements in order, not a march. The site of Ai is argued, and Makkedah, Libnah, Eglon and Debir are named in the text but not securely located, so they are left off the line.',
    legs: [
      {
        from: 'Jericho',
        to: 'Ai',
        ref: 'Joshua 7:1–8:29',
        note: 'Israel was routed on the first attempt because of Achan’s theft and took the city on the second by ambush.',
      },
      {
        from: 'Ai',
        to: 'Shechem',
        ref: 'Joshua 8:30–35',
        note: 'Joshua built an altar on Mount Ebal and read the blessings and the curses to the whole assembly.',
      },
      {
        from: 'Shechem',
        to: 'Gibeon',
        ref: 'Joshua 9:3–10:14',
        note: 'The Gibeonites got a treaty by pretending to come from far off, and Israel marched all night to defend them when five kings besieged the city.',
      },
      {
        from: 'Gibeon',
        to: 'Lachish',
        ref: 'Joshua 10:29–33',
        note: 'The southern campaign moved down into the lowlands, and the city fell on the second day.',
      },
      {
        from: 'Lachish',
        to: 'Hebron',
        ref: 'Joshua 10:36–39',
        note: 'Israel turned back up into the hill country and took Hebron and Debir.',
      },
      {
        from: 'Hebron',
        to: 'Hazor',
        ref: 'Joshua 11:1–15',
        note: 'A northern coalition mustered at the waters of Merom, and Joshua burned Hazor, which had been the head of all those kingdoms.',
      },
    ],
  },

  // ═══ 4. EXILE AND RETURN ════════════════════════════════════════════════════
  // Three movements a century and a half apart. Three routes, because a leg from
  // Assyria to Jerusalem never happened and must never be drawn.
  {
    id: 'exile-of-israel-722',
    name: 'The fall of Samaria',
    scope: '2 Kings 17',
    group: 'Exile and return',
    confidence: 'approximate',
    note: 'The deportation is recorded; the settlement places — Halah, the Habor, Gozan, the cities of the Medes — are only partly identified, so the destination is the Assyrian heartland rather than a point.',
    legs: [
      {
        from: 'Samaria',
        to: 'Assyria',
        ref: '2 Kings 17:5–6',
        note: 'Assyria took the city after a three-year siege and carried Israel away to Halah, the Habor, Gozan and the cities of the Medes.',
      },
    ],
  },
  {
    id: 'exile-of-judah-586',
    name: 'The fall of Jerusalem',
    scope: '2 Kings 25; Jeremiah 39',
    group: 'Exile and return',
    confidence: 'located',
    legs: [
      {
        from: 'Jerusalem',
        to: 'Jericho',
        ref: '2 Kings 25:1–5',
        note: 'Zedekiah broke out of the besieged city by night and was overtaken on the plains below.',
      },
      {
        from: 'Jericho',
        to: 'Riblah',
        ref: '2 Kings 25:6–7',
        note: 'He was brought north to the king of Babylon, sentenced, made to watch his sons killed, and blinded.',
      },
      {
        from: 'Riblah',
        to: 'Babylon',
        ref: '2 Kings 25:7–21',
        note: 'Zedekiah was carried off in bronze chains, and the rest of the people were deported after him.',
      },
    ],
  },
  {
    id: 'return-under-cyrus-539',
    name: 'The return under Cyrus',
    scope: 'Ezra 1–2',
    group: 'Exile and return',
    confidence: 'approximate',
    note: 'Ezra names no stops between the two ends. The line marks origin and destination only; no caravan crossed the desert directly, and the road ran up the Euphrates and down through Syria.',
    legs: [
      {
        from: 'Babylon',
        to: 'Jerusalem',
        ref: 'Ezra 1:1–4; 2:1',
        note: 'Cyrus issued the decree and the first company went up to rebuild the house of God.',
      },
    ],
  },

  // ═══ 5. ABRAHAM'S TRAVELS ═══════════════════════════════════════════════════
  {
    id: 'abraham-travels',
    name: 'Abraham’s travels',
    scope: 'Genesis 11:31 – 21:34',
    confidence: 'approximate',
    note: 'The named sites are identified; the itinerary between them is not recorded. Where Abram went in Egypt is never said, so that leg ends at the land rather than a city.',
    legs: [
      {
        from: 'Ur',
        to: 'Haran',
        ref: 'Genesis 11:31–32',
        note: 'Terah set out for Canaan with the family, settled short of it, and died there.',
      },
      {
        from: 'Haran',
        to: 'Shechem',
        ref: 'Genesis 12:1–7',
        note: 'Abram left at seventy-five on the strength of a promise and came first to the oak of Moreh, where the LORD appeared to him.',
      },
      {
        from: 'Shechem',
        to: 'Bethel',
        ref: 'Genesis 12:8',
        note: 'He pitched his tent in the hill country with Bethel on the west and Ai on the east, and built an altar.',
      },
      {
        from: 'Bethel',
        to: 'Egypt',
        ref: 'Genesis 12:10–20',
        note: 'A famine drove him down, and he passed Sarai off as his sister until Pharaoh found him out and sent him away.',
      },
      {
        from: 'Egypt',
        to: 'The Negev',
        ref: 'Genesis 13:1–2',
        note: 'He came back up with his wife and all he had, now very rich in livestock, silver and gold.',
      },
      {
        from: 'The Negev',
        to: 'Bethel',
        ref: 'Genesis 13:3–4',
        note: 'He returned by stages to the altar he had built and called on the name of the LORD.',
      },
      {
        from: 'Bethel',
        to: 'Hebron',
        ref: 'Genesis 13:8–18',
        note: 'After giving Lot first choice of the land he settled by the oaks of Mamre and built an altar there.',
      },
      {
        from: 'Hebron',
        to: 'Beersheba',
        ref: 'Genesis 21:22–34',
        note: 'He swore a treaty with Abimelech over a disputed well and planted a tamarisk tree there.',
      },
    ],
  },

  // ═══ 6. THE EXODUS AND WILDERNESS YEARS ═════════════════════════════════════
  // The one route on this map that is drawn through genuinely contested ground.
  {
    id: 'exodus-and-wilderness',
    name: 'The Exodus and wilderness years',
    scope: 'Exodus 12 – Deuteronomy 34',
    confidence: 'disputed',
    disputedNote:
      'The location of Mount Sinai and the point at which Israel crossed the sea are both genuinely argued, and they are argued together: a northern crossing and a southern mountain do not sit easily in the same itinerary. Candidate crossings run from the lakes of the isthmus to the Gulf of Aqaba; candidate mountains from the south of the Sinai peninsula to sites in Midian. What is drawn here is one reconstruction, on the traditional southern reading, and it is drawn dashed for that reason. It is not a survey.',
    note: 'Succoth, Marah, Elim and Rephidim are named in the text between these points and cannot be located, so they are left off the line rather than pinned to invented coordinates.',
    legs: [
      {
        from: 'Rameses',
        to: 'Red Sea',
        ref: 'Exodus 12:37–14:31',
        note: 'Israel marched out by way of the wilderness rather than the coast road, and the water was driven back before them and closed over the army behind them.',
      },
      {
        from: 'Red Sea',
        to: 'Wilderness of Sin',
        ref: 'Exodus 16:1–36',
        note: 'The people grumbled for the food of Egypt a month and a half out, and were given bread in the morning and meat at evening.',
      },
      {
        from: 'Wilderness of Sin',
        to: 'Mt. Sinai',
        ref: 'Exodus 19:1 – 40:38',
        note: 'Israel camped before the mountain in the third month, and the covenant, the law and the tabernacle were given there.',
      },
      {
        from: 'Mt. Sinai',
        to: 'Wilderness of Paran',
        ref: 'Numbers 10:11–12',
        note: 'The cloud lifted in the second year and the camp set out for the first time in order of march.',
      },
      {
        from: 'Wilderness of Paran',
        to: 'Kadesh-barnea',
        ref: 'Numbers 13:1–14:38',
        note: 'The spies came back after forty days, the people refused to go up, and the generation that refused was sentenced to a year in the wilderness for every day of the search.',
      },
      {
        from: 'Kadesh-barnea',
        to: 'Moab',
        ref: 'Numbers 20:14 – 22:1',
        note: 'Edom refused them the King’s Highway, so Israel went around it, crossed the Zered and the Arnon, and camped on the plains opposite Jericho.',
      },
      {
        from: 'Moab',
        to: 'Mount Nebo',
        ref: 'Deuteronomy 34:1–8',
        note: 'Moses climbed the mountain, was shown the whole land, and died there without entering it.',
      },
    ],
  },
]
