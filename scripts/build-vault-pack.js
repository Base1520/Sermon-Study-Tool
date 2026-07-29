#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */

/**
 * build-vault-pack.js — distil the Obsidian vault's Scripture Analysis Engine
 * into a small, shippable JSON pack for PLAIN READ.
 *
 * WHY THIS EXISTS
 *   The vault lives only on the author's machine. A tester's laptop has no vault.
 *   So the knowledge has to be committed data, not a runtime read. This script is
 *   the regeneration path: run it whenever the vault grows.
 *
 * USAGE
 *   node scripts/build-vault-pack.js                 # build from the default vault
 *   node scripts/build-vault-pack.js --vault <dir>   # build from another vault root
 *   node scripts/build-vault-pack.js --out <dir>     # write the pack elsewhere
 *   node scripts/build-vault-pack.js --dry-run       # build + report, write nothing
 *   node scripts/build-vault-pack.js --self-test     # prove the privacy firewall fires
 *   node scripts/build-vault-pack.js --verbose       # per-book note counts
 *
 * WHAT SHIPS
 *   Per chapter (or book, where only a book node exists):
 *     - the historical setting facts the node actually carries
 *     - genre and literary structure
 *     - canonical / redemptive-historical placement
 *     - the restraint fences the node carries ("present the spectrum", "without forcing it")
 *     - "commonly misread as X" warnings
 *
 * WHAT NEVER SHIPS — the privacy firewall (§ FORBIDDEN below)
 *   The vault nodes are tuned to one man behind an explicit do-not-infer privacy
 *   fence. This pack goes to strangers. Anything personal, pastoral-private, or
 *   pulpit-facing is denied at three layers:
 *     1. whole sections are refused by heading (DENY_HEADINGS)
 *     2. individual notes are dropped on content match (FORBIDDEN + CITATION)
 *     3. the finished pack is re-scanned and the build FAILS LOUD if anything got through
 *   Layer 3 is not decoration: it catches bugs in layers 1 and 2. `--self-test`
 *   proves it fires.
 *
 * ALSO NEVER SHIPS
 *   Names of scholars, commentators, authors, or books. Positions and traditions
 *   may be named; people may not. Enforced by CITATION_PATTERNS.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { canonicalizeBook, testamentOf, chapterKey, bookKey } = require('../electron/plainread/vault/books.js');

const PACK_VERSION = 1;

// PRIVACY: this script is committed and ships to strangers. Do NOT hardcode an
// absolute path here — an absolute vault path discloses the author's account
// name and where the private vault lives on disk. Resolve it from the running
// user's home directory instead, and override with VAULT_ROOT or --vault.
const DEFAULT_VAULT = path.join(os.homedir(), 'Claude');
const ENGINE_SUBDIR = path.join('Knowledge', 'Theological', 'Scripture Analysis Engine');
const DEFAULT_OUT = path.join(__dirname, '..', 'electron', 'plainread', 'vault');

// The three method documents distilled below. Recorded so a future run can tell
// the operator the source changed since the distillation was written by hand.
const METHOD_SOURCES = [
  path.join('Knowledge', 'Theological', 'Hermeneutics', 'Application and the Principlizing Bridge.md'),
  path.join('Knowledge', 'Theological', 'Ecclesiology', 'Theological Triage — The Ranking of Doctrines.md'),
  path.join('Knowledge', 'Theological', 'Bibliology', 'Sola Scriptura and Sufficiency.md'),
];

// ---------------------------------------------------------------------------
// § FORBIDDEN — the privacy firewall deny-list.
// ---------------------------------------------------------------------------

// Paths the script refuses to open at all, ever, whatever else it is told to read.
const FORBIDDEN_PATH_FRAGMENTS = [
  'knowledge/mental/',
  'emotional and interior health',
  'about me/',
  'people.md',
  'reference/preaching-voice',
  'reference_cole',
  'feedback_',
  'user_',
];

// Section headings whose contents are refused wholesale. Matched against the
// heading lowercased with numbering and decoration stripped.
const DENY_HEADINGS = [
  'cole',            // "Cole's-lens", "…where Cole lands", "…as Cole preaches it"
  'counterpart',     // "The counterpart-verse", "the counterpart guardrail"
  'rikki',
  'applied protocol',
  'lens',
  'privacy',
  'voice marker',
  'preaching',
  'teaching notes',
  'application',
  'loop log',
  'sources',
  'literature',
  'sermon',
  'pulpit',
];

// Content patterns. A note matching any of these is dropped during extraction,
// and its survival into the finished pack is a build-stopping error.
const FORBIDDEN = [
  // — the man himself and his household —
  /\bcole\b/i,
  /\brikki\b/i,
  /permenter/i,
  /\bhuddie\b/i,
  /\bmagnolia\b/i,
  /\bhudson\b/i,
  /counterpart/i,
  /applied protocol/i,
  // — his organisations and platform —
  /bluff creek/i,
  /creekers/i,
  /base\s?1520/i,
  /spiritual operator/i,
  /\bSOM\b/,
  // — the private-profile topics behind the do-not-infer fence —
  /people[\s-]?pleas/i,
  /execution paralysis/i,
  /\bhis (wife|marriage|family|finances|debt|kids|children|daughters)\b/i,
  /\bmy (wife|marriage|finances|debt)\b/i,
  /emotional and interior health/i,
  /boundary drift/i,
  // — pulpit-facing material; PLAIN READ is not a sermon —
  /\bsermon/i,
  /\bpreach/i,
  /\bpulpit\b/i,
  /\bhomilet/i,
  /manuscript/i,
  /\bbig idea\b/i,
  /\boutline\b/i,
  /\billustration\b/i,
  // — vault machinery that means nothing to a stranger —
  /\bvault\b/i,
  /\bfoundry\b/i,
  /\bobsidian\b/i,
  /\bloop log\b/i,
  /\bthis node\b/i,
  /\bthis brain\b/i,
  /\[sourced/i,
  /\[inferred\]/i,
  /\bfrontier\b/i,
];

// Rule: never name a scholar, commentator, author, or book in a user-facing
// string. Positions and traditions may be named; people may not. A note that
// trips any of these is dropped rather than rewritten — losing a note is cheap,
// shipping a citation is not.
const SCHOLAR_SURNAMES = [
  'aland', 'albright', 'alexander', 'allison', 'alter', 'anderson', 'aquinas', 'arnold', 'athanasius',
  'augustine', 'aune', 'bailey', 'baker', 'barr', 'barrett', 'barth', 'bartholomew', 'bauckham',
  'bauer', 'bavinck', 'beale', 'beasley-murray', 'beckwith', 'belleville', 'berkhof', 'berkouwer',
  'best', 'betz', 'beyer', 'blenkinsopp', 'blomberg', 'block', 'bock', 'boice', 'bonhoeffer',
  'brown', 'bruce', 'brueggemann', 'bultmann', 'calvin', 'campbell', 'carson', 'charles', 'childs',
  'chrysostom', 'ciampa', 'clark', 'clines', 'cogan', 'collins', 'conzelmann', 'craigie', 'cranfield',
  'cross', 'cullmann', 'davies', 'deissmann', 'dodd', 'doriani', 'dumbrell', 'dunn', 'duvall',
  'edwards', 'ehrman', 'eichrodt', 'elliott', 'ellis', 'enns', 'erickson', 'eusebius', 'evans',
  'fee', 'ferguson', 'fitzmyer', 'france', 'frame', 'fretheim', 'gaffin', 'garland', 'gentry',
  'goldingay', 'goldsworthy', 'gordon', 'green', 'grudem', 'gundry', 'gunkel', 'guthrie',
  'hafemann', 'hagner', 'hamilton', 'harris', 'hartley', 'hays', 'hegesippus', 'hendriksen',
  'hengel', 'hess', 'hirsch', 'hodge', 'hoehner', 'holladay', 'horton', 'house', 'hubbard',
  'hurtado', 'irenaeus', 'jeremias', 'jewett', 'jobes', 'josephus', 'kaiser', 'keener', 'keil',
  'kidner', 'kistemaker', 'kitchen', 'kline', 'knight', 'koester', 'kostenberger', 'köstenberger',
  'kruse', 'ladd', 'lane', 'levenson', 'lewis', 'licona', 'lightfoot', 'lincoln', 'longenecker',
  'longman', 'luther', 'luz', 'machen', 'marshall', 'martin', 'mathison', 'mays', 'mcknight',
  'mcquilkin', 'meadors', 'melanchthon', 'metzger', 'meyer', 'milgrom', 'mohler', 'moo', 'morris',
  'motyer', 'moule', 'mounce', 'muller', 'murray', 'nolland', 'oberman', 'oden', 'origen',
  'ortlund', 'osborne', 'oswalt', 'owen', 'packer', 'payne', 'pennington', 'peterson', 'philo',
  'piper', 'plummer', 'pliny', 'poythress', 'provan', 'putman', 'rad', 'ridderbos', 'robertson',
  'robinson', 'rollmann', 'ryken', 'ryrie', 'sailhamer', 'sanders', 'sarna', 'schnabel',
  'schreiner', 'seifrid', 'silva', 'smith', 'snodgrass', 'sproul', 'spurgeon', 'stackhouse',
  'stein', 'stott', 'stuart', 'suetonius', 'tacitus', 'tertullian', 'thielman', 'thiselton',
  'thompson', 'towner', 'turretin', 'vanhoozer', 'vangemeren', 'vos', 'waltke', 'walton',
  'wanamaker', 'ware', 'watson', 'webb', 'weima', 'wellhausen', 'wenham', 'westermann', 'white',
  'wilkins', 'williamson', 'willis', 'witherington', 'wolff', 'wright', 'yarbrough', 'young',
];

// Many of those surnames are also ordinary English words. Matching them
// case-insensitively threw away good notes: "the divided-kingdom regnal frame in
// full stride" was refused because a theologian is named Frame. These are
// matched only in their capitalised form, where they are actually being used as
// a name. Everything else still matches case-insensitively.
const AMBIGUOUS_SURNAMES = new Set([
  'alter', 'best', 'block', 'brown', 'charles', 'childs', 'clark', 'collins', 'cross', 'davies',
  'dodd', 'dunn', 'ellis', 'evans', 'fee', 'ferguson', 'france', 'frame', 'garland', 'gentry',
  'gordon', 'green', 'guthrie', 'harris', 'hays', 'hess', 'horton', 'house', 'hubbard', 'kaiser',
  'knight', 'lane', 'lewis', 'longman', 'marshall', 'martin', 'mays', 'meyer', 'moo', 'morris',
  'moule', 'muller', 'murray', 'owen', 'packer', 'payne', 'peterson', 'plummer', 'robinson',
  'sanders', 'silva', 'smith', 'stein', 'stuart', 'thompson', 'ware', 'watson', 'webb', 'white',
  'willis', 'wright', 'young',
]);

const capitalize = (w) => w.charAt(0).toUpperCase() + w.slice(1);

const SCHOLAR_RE = new RegExp(
  `\\b(?:${SCHOLAR_SURNAMES.filter((s) => !AMBIGUOUS_SURNAMES.has(s)).join('|')})\\b`,
  'i',
);

// Case-sensitive on purpose.
const AMBIGUOUS_SURNAME_RE = new RegExp(
  `\\b(?:${Array.from(AMBIGUOUS_SURNAMES).map(capitalize).join('|')})\\b`,
);

// A surname list can only ever catch the names someone thought of. This catches
// the SHAPE of a citation instead — a possessive proper noun followed by a
// multi-word capitalised title ("Cogan's Imperialism and Religion") — which is
// how an unlisted author's book actually reaches the pack.
const AUTHOR_TITLE_RE = /\b[A-Z][a-z]+'s\s+[A-Z][a-z]+\s+(?:and\s+|of\s+|the\s+)?[A-Z][a-z]+/;

const CITATION_PATTERNS = [
  SCHOLAR_RE,
  AMBIGUOUS_SURNAME_RE,
  AUTHOR_TITLE_RE,
  // commentary series / apparatus / lexicon sigla — jargon a reader can't cash out
  /\b(NIGTC|NICNT|NICOT|BECNT|ZECNT|NIVAC|WBC|TNTC|PNTC|NAC|ICC|AYB|Hermeneia|JPS|UBS\d?|NA\d\d|BDAG|HALOT|TDNT|TWOT|DtrH|LXX|MT|P\d\d)\b/,
  // publication-year parentheticals: "(2001)", "(1st ed. 1981)"
  /\(\s*(?:1[5-9]|20)\d{2}\s*\)/,
  /\b\d(?:st|nd|rd|th)\s+ed\b/i,
  // bibliographic vocabulary
  /\b(commentator|commentators|commentary|commentaries|monograph|festschrift|scholarship|scholars|bibliograph)\b/i,
  /\b(ed\.|eds\.|trans\.|vol\.|pp\.|s\.v\.|cf\.\s+[A-Z])/,
  // "the field", "the literature" style meta-talk about secondary sources
  /\bthe (literature|field's|secondary sources)\b/i,

  // VAULT DOCUMENT TITLES. A surname list catches authors; AUTHOR_TITLE_RE
  // catches "Author's Book Title". Neither catches a bare cross-reference to
  // another vault node, and the vault's own naming convention produces strings
  // a reader cannot tell from a bibliography:
  //   "Backgrounds of Revelation - Applied, The Greco-Roman World of the New
  //    Testament, The Imperial Cult and Emperor Worship"
  //   "( Marriage and Family - The First Field - favoritism's ... )"
  // Both reached the built pack, and the first rides the Revelation BOOK node,
  // so it came back on EVERY Revelation lookup. Rule: no book named, ever — and
  // to a reader these are books, whatever they are to the vault.
  /\s[-–—]\s*Applied\b/,
  /\bthe (?:payoff|point|upshot) of the whole [\w-]+ cluster\b/i,
  /\b[A-Z][a-z]+(?:\s+(?:and|of|the|in|for)\s+[A-Z][a-z]+|\s+[A-Z][a-z]+)+\s+-\s+(?:The|A|An|Applied)\b/,
];

// ---------------------------------------------------------------------------
// § Text cleaning
// ---------------------------------------------------------------------------

// Arrows, dingbats, geometric shapes, variation selectors, ZWJ, and astral emoji.
const EMOJI_RE = /[\u2190-\u21FF\u2300-\u23FF\u25A0-\u27BF\u2B00-\u2BFF\uFE0E\uFE0F\u200B-\u200D\u2028\u2029\u2060]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g;
// Greek, Greek Extended, Hebrew, Arabic — original-language tokens we do not ship unglossed.
const NON_LATIN_SCRIPT_RE = /[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u0600-\u06FF]/;

function stripWikiLinks(s) {
  return s
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

function stripInlineMarkdown(s) {
  return s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/(^|[\s(])_([^_]{2,})_(?=$|[\s.,;:)])/g, '$1$2')
    .replace(/~~([^~]*)~~/g, '$1');
}

// Editorial tags the vault uses to mark provenance and build state. They are
// stripped for readability — but only AFTER the firewall has seen the raw text.
// Stripping first would launder "[sourced: 1:1-2 sermon]" into a clean-looking
// note, which is exactly how a sermon quote once reached the pack.
const TAG_RE = /\[(?:sourced|inferred|named|unsourced|web-verified|verified|gap|todo|status|standing)\b[^\]]*\]/gi;

// Internal cross-references to other vault nodes and to a node's own sections.
// Meaningless to a reader who has no vault: "(see §10)", "see 19's node".
const XREF_RE = /\(?\s*\b(?:see|cf\.)\s+(?:§+\s*[\w.]+|\d+["']?s?\s+node)\s*\)?/gi;
const SECTION_SIGIL_RE = /§+\s*[\w.]*/g;

/**
 * Cutting a cross-link trail — or dropping a clause — can leave behind the "("
 * that opened it. Drop the dangling tail rather than the whole sentence; if what
 * remains is itself a fragment, isFragment refuses it downstream.
 */
function dropDanglingTail(input) {
  let s = String(input).replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
  for (let guard = 0; guard < 4; guard += 1) {
    const opens = (s.match(/\(/g) || []).length;
    const closes = (s.match(/\)/g) || []).length;
    if (opens <= closes) break;
    const cut = s.lastIndexOf('(');
    if (cut === -1) break;
    s = s.slice(0, cut).replace(/[\s,;:-]+$/, '').trim();
  }
  return s.replace(/\s+([.,;:!?])/g, '$1');
}

function cleanText(raw) {
  let s = String(raw);
  s = stripWikiLinks(s);
  // Cut cross-link trails: "… ↔ Leadership and Discipleship · Gods & Deities."
  s = s.replace(/↔[^.!?]*/g, ' ');
  s = s.replace(/→[^.!?]*$/g, ' ');
  s = stripInlineMarkdown(s);
  s = s.replace(TAG_RE, ' ');
  s = s.replace(XREF_RE, ' ');
  s = s.replace(SECTION_SIGIL_RE, ' ');
  s = s.replace(/#[a-z][a-z0-9/_-]*/gi, ' ');
  s = s.replace(EMOJI_RE, ' ');
  // Quote normalisation, curly first. Doing the straight-quote pass first would
  // turn every apostrophe in "Asa's" into a double quote.
  s = s.replace(/[‘’‚‛]/g, "'");
  s = s.replace(/[“”„‟«»]/g, '"');
  s = s.replace(/…/g, '...');
  s = s.replace(/[‐-―−]/g, '-');
  // Unpaired emphasis markers survive stripInlineMarkdown ("shalem*", "***").
  s = s.replace(/\*+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Removing a marker can leave the space in front of its punctuation: "line. ."
  s = s.replace(/\s+([.,;:!?])/g, '$1');
  // "…not imaginary.. Rezin of Damascus" — a doubled stop left by a removed
  // marker. The lookarounds keep a real ellipsis intact.
  s = s.replace(/(?<!\.)([.!?])\.(?!\.)/g, '$1');
  s = dropDanglingTail(s);
  s = s.replace(/^[-*•>:,;.\s]+/, '').trim();
  // "vs. Enuma Elish (Babylon): there the cosmos is formed…" reads as a fragment
  // out of its list; as a comparison it stands on its own.
  s = s.replace(/^vs\.\s*/i, 'Compare ');
  return s;
}

const ABBREV_RE = /\b(vv|v|ch|chs|cf|e\.g|i\.e|c|no|approx|esp|etc|Jr|Sr|St|Mt|Gen|Ex|Lev|Num|Deut|Ps|Prov|Isa|Jer|Ezek|Dan|Matt|Rom|Cor|Gal|Eph|Phil|Col|Thess|Tim|Heb|Rev|Kgs|Chr|Sam)\./g;
const SENTINEL = '';

function splitSentences(text) {
  const guarded = text.replace(ABBREV_RE, (m) => m.replace(/\./g, SENTINEL));
  const parts = guarded
    .split(/(?<=[.!?])\s+(?=["("']?[A-Z0-9])/)
    .map((p) => p.split(SENTINEL).join('.').trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}

// ---------------------------------------------------------------------------
// § Note filtering
// ---------------------------------------------------------------------------

const MIN_NOTE = 45;
const MAX_NOTE = 300;

function violatesFirewall(text) {
  for (const re of FORBIDDEN) {
    if (re.test(text)) return { layer: 'privacy', pattern: String(re) };
  }
  return null;
}

function violatesCitation(text) {
  for (const re of CITATION_PATTERNS) {
    if (re.test(text)) return { layer: 'citation', pattern: String(re) };
  }
  return null;
}

// A modern calendar year never belongs in a grounding note about an ancient
// text. Where one appears it is the author's own preaching calendar or a build
// stamp ("Sun ~Nov 11 2023", "[WEB-VERIFIED, 2026-07-05]").
const MODERN_YEAR_RE = /\b(?:19|20)\d{2}\b/;

/**
 * Structural fragment tests. The sentence splitter cuts on abbreviations and
 * parentheses it cannot see inside, so some output is half a sentence. A half
 * sentence in a prompt is worse than no sentence: it grounds nothing and reads
 * as though the tool is confused.
 */
function isFragment(s) {
  const opens = (s.match(/\(/g) || []).length;
  const closes = (s.match(/\)/g) || []).length;
  if (opens !== closes) return true;
  if ((s.match(/\[/g) || []).length !== (s.match(/\]/g) || []).length) return true;
  if (/[,:;(\[]\s*\.?$/.test(s)) return true;        // trails off on punctuation
  if (/\b(?:vs|and|or|but|the|a|of|in|to|with|as)\.$/i.test(s)) return true;
  if (/\.[A-Z]\.[A-Z]\./.test(s)) return true;       // mangled acronym: ".O.V.E.N."
  // An item lifted out of an enumerated list of views. "B is possible at the
  // textual level but unnecessary" means nothing without the list it came from.
  if (/^(?:View|Option|Reading|Position)\s+[A-Z0-9]\b/.test(s)) return true;
  if (/^[A-Z]\s/.test(s)) return true;
  return false;
}

// Clauses that tell a speaker how to arrange material rather than telling a
// reader what the text will not bear.
const DELIVERY_CLAUSE_RE = /^(?:lead|open|close|start|begin|end)\s+with\b|^(?:land|drive|preach|deliver|teach)\b|\ba footnote\b/i;
// Clauses that are genuine interpretive restraints.
const RESTRAINT_CLAUSE_RE = /^(?:do not|don't|never|avoid|refuse|resist|keep\b[^;]*\bout of)\b|^(?:do not|don't)\s+(?:allegoriz|typologiz|flatten|force)/i;

/**
 * A restraint note in the vault is written as a semicolon list that mixes two
 * things: what not to claim about the text, and how to arrange it for delivery.
 * PLAIN READ wants the first and must not carry the second — it is not a sermon
 * tool, and a "lead with…" instruction in a prompt pulls the output toward one.
 * Clauses are kept or dropped whole; nothing is rewritten.
 */
function trimDeliveryClauses(note) {
  if (!/^restraint:/i.test(note)) return note;
  const body = note.replace(/^restraint:\s*/i, '');
  const kept = body
    .split(/;\s*/)
    .map((c) => c.trim())
    .filter((c) => c && !DELIVERY_CLAUSE_RE.test(c) && RESTRAINT_CLAUSE_RE.test(c));
  if (!kept.length) return null;
  // Removing a clause can orphan a parenthesis that opened in the clause before
  // it, so the result is repaired the same way a truncated sentence is.
  const joined = dropDanglingTail(kept.join('; ')).replace(/[.\s]+$/, '');
  if (!joined) return null;
  return `Restraint: ${joined}.`;
}

/**
 * The same delivery filter, for notes that are NOT restraint lists.
 *
 * trimDeliveryClauses only fires on a note prefixed "Restraint:". A fence note
 * accepted by FENCE_RE has no such prefix, so "Present the spectrum humbly;
 * land the pastoral point." shipped whole — a real note in the built pack, on
 * Revelation 20. The first clause is a genuine fence and belongs to the reader.
 * The second tells a speaker how to land material, which PLAIN READ must never
 * carry. Clauses are kept or dropped whole; nothing is rewritten.
 */
function dropDeliveryClauses(note) {
  if (!note || !note.includes(';')) return note;
  if (/^restraint:/i.test(note)) return note; // already handled, and more strictly
  const kept = note
    .split(/;\s*/)
    .map((c) => c.trim())
    .filter((c) => c && !DELIVERY_CLAUSE_RE.test(c));
  if (!kept.length) return null;
  const joined = dropDanglingTail(kept.join('; ')).replace(/[.\s]+$/, '');
  return joined ? `${joined}.` : null;
}

/**
 * Accept a sentence as a grounding note, or return null.
 * Fails closed: anything ambiguous is dropped.
 *
 * Order matters. The firewall runs against the RAW sentence first, because
 * cleanText removes exactly the provenance tags ("[sourced: … sermon]") that
 * mark a sentence as private or pulpit-derived.
 */
function acceptNote(sentence, options) {
  const raw = String(sentence);
  if (violatesFirewall(raw)) return null;

  // The length floor exists to reject sentence debris. A derived label —
  // "Genre: prophetic narrative." — is short on purpose and is exactly the kind
  // of fact the pack is for, so it gets a lower floor.
  const minLength = (options && options.minLength) || MIN_NOTE;

  let s = cleanText(raw);
  if (!s) return null;
  if (s.length < minLength || s.length > MAX_NOTE) return null;
  if (/^[|+-]/.test(s)) return null;                 // table row / rule
  if (/\|/.test(s)) return null;                     // inline table remains
  if (NON_LATIN_SCRIPT_RE.test(s)) return null;      // unglossed Greek/Hebrew
  if (!/[a-z]/.test(s)) return null;                 // all-caps banner
  if (MODERN_YEAR_RE.test(s)) return null;
  if (isFragment(s)) return null;
  if (!/[.!?]$/.test(s)) s = `${s}.`;
  if (violatesFirewall(s)) return null;
  if (violatesCitation(s)) return null;
  // a note that is mostly citation-ish parentheses is noise
  if ((s.match(/\(/g) || []).length > 3) return null;
  // Sentences lifted mid-list start lowercase; a grounding note should read as
  // a sentence.
  s = s.charAt(0).toUpperCase() + s.slice(1);
  s = trimDeliveryClauses(s);
  s = dropDeliveryClauses(s);
  if (!s || s.length < minLength) return null;
  return s;
}

function harvest(block, limit, extraTest) {
  const out = [];
  for (const line of block.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^#{1,6}\s/.test(t)) continue;
    if (/^\|/.test(t)) continue;
    if (/^[-=]{3,}$/.test(t)) continue;
    const body = t.replace(/^>\s?/, '').replace(/^[-*+]\s+/, '');
    // Compact nodes fold four lenses into one line, separated by bold labels:
    // "**Genre:** … **Backgrounds:** … **Audience:** …". Split on those first or
    // the whole line arrives as one over-long unusable sentence.
    const segments = body.split(/(?=\*\*[A-Z][A-Za-z /&'-]{2,24}:\*\*)/).filter(Boolean);
    for (const sentence of segments.flatMap((seg) => splitSentences(seg))) {
      if (out.length >= limit) return out;
      const note = acceptNote(sentence);
      if (!note) continue;
      if (extraTest && !extraTest(note)) continue;
      if (out.some((n) => n.toLowerCase() === note.toLowerCase())) continue;
      out.push(note);
    }
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// § Node parsing
// ---------------------------------------------------------------------------

function normalizeHeading(h) {
  return cleanText(h)
    .toLowerCase()
    .replace(/^\d+\s*[-–—.]?\s*/, '')
    .replace(/^\d+\s*[-–—]\s*\d+\s*\.?\s*/, '')
    .replace(/[^a-z0-9 &'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headingDenied(normalized) {
  return DENY_HEADINGS.some((d) => normalized.includes(d));
}

function bucketFor(normalized) {
  if (headingDenied(normalized)) return null;
  if (/(genre|literary form|literary context|structure|cumulative flow)/.test(normalized)) return 'structure';
  if (/(historical|background|audience|occasion|author, date)/.test(normalized)) return 'setting';
  if (/(canonical|biblical-theological|biblical theological|christ-connection|christ connection|anchor|trajectory|redemptive)/.test(normalized)) return 'canon';
  if (/(disputed|interpretive issue|critical & interpretive)/.test(normalized)) return 'disputed';
  return null;
}

function parseSections(markdown) {
  const sections = [];
  const lines = markdown.split('\n');
  let current = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      if (current) sections.push(current);
      current = { heading: m[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ heading: s.heading, body: s.body.join('\n') }));
}

// A node whose header block is written around the author's own preaching — his
// Sunday manuscript, his delivery dates, his governing claim — has a header that
// summarises a sermon, not the passage. Genre still holds; the one-line summary
// and the "Date/Setting" field do not, and are dropped for such a node.
// Deliberately narrow. "Moses preaches to the second generation" is a fact about
// Deuteronomy, not a marker of the author's own pulpit work; matching the bare
// verb cost 40-odd good summaries. The real tell is his name or his manuscript
// machinery.
const PERSONAL_HEADER_RE = /\bcole\b|\brikki\b|counterpart|\bmanuscripts?\b|\bhis (?:own )?sermons?\b|\bsermon (?:series|manuscript|corpus)\b|\bdelivery\b/i;

function parseHeaderMeta(markdown) {
  const meta = {};
  const head = markdown.split(/^##\s/m)[0] || '';
  const personalHeader = PERSONAL_HEADER_RE.test(head);
  for (const rawLine of head.split('\n')) {
    const line = rawLine.replace(/^>\s?/, '').trim();
    if (!line) continue;
    if (/^(Book|Genre|Date|Author|Status)\s*:/i.test(line) || line.includes('·')) {
      // The header separates fields with "·" — but a genre value uses "·" inside
      // itself ("Abijam · Asa // Nadab · Baasha"). Splitting on every "·" cut
      // those values into fragments that then failed the fragment test, which is
      // why a third of the nodes shipped with no genre at all. Split only where
      // the next field actually begins.
      for (const field of line.split(/\s·\s(?=\*{0,2}(?:Book|Genre|Date\/Setting|Date|Setting|Status|Authors?|One[- ]line|CitationVerifier|Recurring engine)\b)/i)) {
        const kv = field.match(/^\s*\*{0,2}([A-Za-z/ ]+)\*{0,2}\s*:\s*(.+)$/);
        if (!kv) continue;
        const key = kv[1].trim().toLowerCase();
        const value = cleanText(kv[2]);
        if (!value) continue;
        if (key === 'genre' && !meta.genre) meta.genre = value;
        if (!personalHeader
            && (key === 'date/setting' || key === 'date' || key === 'setting')
            && !meta.setting
            && !MODERN_YEAR_RE.test(value)) {
          meta.setting = value;
        }
      }
    }
    const one = line.match(/^_?\*{0,2}One[- ]line:?\*{0,2}\s*_?(.*)$/i);
    if (one && !meta.oneLine && !personalHeader) {
      meta.oneLine = cleanText(one[1].replace(/_$/, ''));
    }
  }
  meta.personalHeader = personalHeader;
  return meta;
}

// "commonly misread as X" signals
const MISREAD_RE = /(misread|misunderstood|misapplied|commonly (?:read|taken)|often (?:read|taken|assumed)|popular(?:ly)? (?:read|taken|assumption)|is not a proof-text|does not mean|is not about|not a promise|contrary to the popular|frequently flattened)/i;

// restraint / guardrail signals
const FENCE_RE = /(present the spectrum|don't flatten|do not flatten|without forcing|not allegoric|resist|refuse|guard against|be careful|honest about|the text (?:does not|doesn't) (?:resolve|settle|say)|genuinely (?:open|disputed|contested)|hold(?:s)? loosely|neither side|both readings|the limits? of|overreach|beyond the evidence|not attested|held with humility|remains disputed|is disputed|no consensus)/i;

function distilNode(filePath, vaultRoot, relPath) {
  const markdown = fs.readFileSync(filePath, 'utf8');
  const meta = parseHeaderMeta(markdown);
  const sections = parseSections(markdown);

  const buckets = { structure: [], setting: [], canon: [], disputed: [] };
  const usedHeadings = [];
  const deniedHeadings = [];

  // In a node built around the author's own manuscript, a bare "he" is
  // ambiguous between the biblical author and the modern preacher — and it was
  // the modern preacher in every case inspected. Ambiguity is the disqualifier:
  // such a sentence cannot be shipped as a fact about the passage.
  const ambiguousSpeaker = meta.personalHeader
    ? (note) => !/\b(?:he|him|his)\b/i.test(note)
    : null;

  for (const section of sections) {
    const normalized = normalizeHeading(section.heading);
    if (headingDenied(normalized)) {
      deniedHeadings.push(section.heading);
      continue;
    }
    const bucket = bucketFor(normalized);
    if (!bucket) continue;
    usedHeadings.push(section.heading);
    const limit = bucket === 'setting' ? 6 : 5;
    buckets[bucket].push(...harvest(section.body, limit, ambiguousSpeaker));
  }

  const notes = [];
  const push = (note) => {
    if (!note) return;
    if (notes.some((n) => n.toLowerCase() === note.toLowerCase())) return;
    notes.push(note);
  };

  const LABEL_MIN = 18;
  if (meta.genre) {
    push(acceptNote(`Genre: ${meta.genre}.`, { minLength: LABEL_MIN }));
  }
  if (meta.setting) {
    push(acceptNote(`Setting: ${meta.setting}.`, { minLength: LABEL_MIN }));
  }
  if (meta.oneLine) {
    for (const s of splitSentences(meta.oneLine).slice(0, 2)) push(acceptNote(s));
  }

  // fences and misread warnings get priority over generic prose
  const disputedPool = buckets.disputed;
  const fences = disputedPool.filter((n) => FENCE_RE.test(n)).slice(0, 3);
  const misreads = [
    ...buckets.disputed.filter((n) => MISREAD_RE.test(n)),
    ...buckets.structure.filter((n) => MISREAD_RE.test(n)),
    ...buckets.canon.filter((n) => MISREAD_RE.test(n)),
  ].slice(0, 2);

  misreads.forEach(push);
  fences.forEach(push);
  buckets.setting.slice(0, 4).forEach(push);
  buckets.structure.slice(0, 3).forEach(push);
  buckets.canon.slice(0, 2).forEach(push);
  disputedPool.slice(0, 2).forEach(push);

  return {
    notes: notes.slice(0, 12),
    usedHeadings,
    deniedHeadings,
    relPath,
  };
}

// ---------------------------------------------------------------------------
// § The method layer (hand-distilled from three vault documents)
// ---------------------------------------------------------------------------
//
// These three documents are dense with named authors and book titles, which may
// never appear in a user-facing string. So they are distilled by hand into
// de-personalised method statements rather than scraped. The source files are
// hashed at build time; if a hash changes, the build warns that the distillation
// may be stale. They pass through the same firewall as everything else.

const METHOD_NOTES = {
  application: [
    'Every biblical text was written to someone else, about a situation the modern reader does not share, in a language and culture the modern reader does not inhabit. Application is the discipline of crossing that distance honestly.',
    'There are two failure modes. One collapses the distance and reads an ancient instruction as if it were addressed directly to today. The other severs it so completely the text says nothing binding at all.',
    'The standard crossing has five moves: grasp what the text meant to its first hearers; measure how wide the gap is; state the theological principle that spans both sides; check that principle against the rest of Scripture; then apply the checked principle to a present situation.',
    'A principle only spans the gap if it can be stated in terms both audiences would recognize. If it can only be stated in modern terms, it is the reader\'s idea, not the text\'s.',
    'Two tests sort what transfers unchanged from what needs re-expression. First, is the thing itself right or wrong, or does its moral weight depend on a cultural setting that is now gone? Second, is it load-bearing for the gospel, or a cultural expression of something load-bearing?',
    'Application is not only behavior. A text can bind a reader four ways: what to do, who to become, what to aim at and value, and how to see wisely where rules run out.',
    'Where a text sits in the covenant story governs what can be asked of it. A command given under a covenant arrangement that has since been fulfilled does not transfer the way a command inside the same arrangement does.',
    'The honest objection to principle-abstraction: the reader chooses which level of generality counts as "the" principle, and that choice is shaped by the reader\'s own culture. Name the level you chose and why.',
    'One competing method flips the burden of proof: treat a text as applying directly as stated unless the text itself signals a time-bound limit. It is a live alternative, not a footnote.',
    'A text has one meaning and many legitimate applications. The live question is how tightly an application must stay tethered to the meaning before it becomes the reader\'s idea wearing application\'s clothes.',
  ],
  triage: [
    'Not every doctrine carries the same weight, and treating them as if they did is its own error. The classic distinction is between articles whose denial destroys the faith and articles over which the church may differ and remain the church.',
    'A workable three-tier sort by fellowship unit: first-order doctrines are what a person must hold to be a Christian; second-order doctrines divide denominations but not Christians; third-order doctrines are held differently inside one congregation.',
    'First-order examples: the Trinity, the full deity and humanity of Christ, justification by faith, the authority of Scripture, the bodily resurrection. Deny these and you are outside the Christian faith.',
    'Second-order examples: the subjects and mode of baptism, church government, the meaning of the Lord\'s Supper, who may hold church office.',
    'Third-order examples: the timing scheme of the millennium, the length of the creation days, matters of Christian liberty.',
    'Two opposite failures. Over-triage treats third-order matters as first-order, so everything becomes a test of fellowship. Under-triage treats first-order matters as negotiable, so nothing is.',
    'How a doctrine actually gets ranked: how close it stands to the gospel itself; how plainly and how often Scripture presses it; how much else collapses if it falls; whether two who differ can share this table, this eldership, this membership roll.',
    'Scripture models the sort itself. It calls the resurrection a matter of first importance, names weightier matters of the law without discarding the lighter ones, and marks a class of disputable matters not to divide over.',
    'The deepest objection: there is no view from nowhere. Where you place a doctrine already encodes a theological judgment, so triage cannot settle the very disputes it presupposes an answer to. It can be managed, not escaped.',
    'The ranking is task-relative. Working together in mission tolerates far more difference than sharing a communion table, which tolerates more than sharing an eldership.',
  ],
  sufficiency: [
    'Scripture is the norming norm that is not itself normed. Creeds, confessions, councils, reason and experience are real authorities, but they are subordinate courts whose rulings are always answerable to the text.',
    'The claim is not that Scripture is the church\'s only teacher. It is that Scripture is the church\'s only infallible teacher, the one authority that cannot itself be corrected.',
    'One final court, several real but fallible lower courts. Deny the lower courts entirely and you get "just me and my Bible." Make any lower court un-appealable and you have replaced the final court.',
    '"Just me and my Bible" is not the historic doctrine but its mutation: by making every reader his own final court, it reproduces the error it claims to oppose, one person at a time.',
    'The sufficiency claim rests on the purpose clause: the God-breathed writings make the servant of God complete and fully equipped for every good work. Not for some good works, with tradition supplying the rest.',
    'Sufficiency is bounded by purpose. Scripture is sufficient for what it was given for: teaching, reproof, correction, training in righteousness, and the equipping of God\'s servant. It is not a manual for every question a reader can ask.',
    'The don\'t-add texts run the length of the canon: do not add to the word commanded, do not add to his words lest you be found a liar, do not add to the words of this book.',
    'Clarity is a doctrine about what is necessary, not about everything. What must be known for salvation and obedience is plain enough for an ordinary reader; not every passage is equally clear.',
    'Reading in the church is not a second source of revelation. It is the interpretive community in which the one source is read, and it is a real check on private certainty.',
  ],
};

// ---------------------------------------------------------------------------
// § The firewall assertion (layer 3)
// ---------------------------------------------------------------------------

class VaultPackFirewallError extends Error {
  constructor(message, offences) {
    super(message);
    this.name = 'VaultPackFirewallError';
    this.offences = offences;
  }
}

// Structural fields hold file paths and build metadata, not user-facing prose.
// They are checked against the path deny-list instead of the content deny-list
// (a path legitimately contains the word "vault"; a note never should).
const STRUCTURAL_FIELDS = new Set([
  'source', 'path', 'generator', 'vaultSubdir', 'digest', 'builtOn', 'version', 'testament',
]);

function isStructural(at) {
  const leaf = at.split('.').pop().replace(/\[\d+\]$/, '');
  return leaf.startsWith('<key>') || STRUCTURAL_FIELDS.has(leaf);
}

function walkStrings(value, visit, trail) {
  const at = trail || '$';
  if (typeof value === 'string') {
    visit(value, at);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, visit, `${at}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      visit(k, `${at}.<key>${k}`);
      walkStrings(v, visit, `${at}.${k}`);
    }
  }
}

/**
 * Re-scan a finished pack. Throws VaultPackFirewallError if anything forbidden
 * survived extraction. This is the layer that must never be removed: it is what
 * turns a filtering bug into a failed build instead of a shipped leak.
 */
function assertPackClean(pack) {
  const offences = [];
  walkStrings(pack, (str, at) => {
    // Structural fields get the path deny-list; prose gets the content deny-list.
    const lower = str.toLowerCase();
    if (isStructural(at)) {
      for (const frag of FORBIDDEN_PATH_FRAGMENTS) {
        if (lower.includes(frag)) {
          offences.push({ at, pattern: `path:${frag}`, sample: str.slice(0, 160) });
        }
      }
      return;
    }
    const priv = violatesFirewall(str);
    if (priv) offences.push({ at, pattern: priv.pattern, sample: str.slice(0, 160) });
    const cite = violatesCitation(str);
    if (cite) offences.push({ at, pattern: cite.pattern, sample: str.slice(0, 160) });
  });
  if (offences.length) {
    const detail = offences
      .slice(0, 20)
      .map((o) => `  ${o.at}\n    pattern: ${o.pattern}\n    text: ${o.sample}`)
      .join('\n');
    throw new VaultPackFirewallError(
      `PRIVACY FIREWALL TRIPPED — ${offences.length} forbidden string(s) reached the pack. Nothing was written.\n${detail}`,
      offences,
    );
  }
  return true;
}

// ---------------------------------------------------------------------------
// § Build
// ---------------------------------------------------------------------------

function refuseForbiddenPath(relPath) {
  const lower = relPath.toLowerCase().split(path.sep).join('/');
  for (const frag of FORBIDDEN_PATH_FRAGMENTS) {
    if (lower.includes(frag)) {
      throw new VaultPackFirewallError(`Refusing to read a denied path: ${relPath}`, [{ at: relPath, pattern: frag }]);
    }
  }
}

function parseNodeName(basename) {
  // "1 Kings 15" | "Revelation 10-11" | "Philippians" | "Acts 17"
  let m = basename.match(/^(.*?)\s+(\d+)\s*-\s*(\d+)$/);
  if (m) {
    const book = canonicalizeBook(m[1]);
    if (book) return { book, chapter: parseInt(m[2], 10), chapterEnd: parseInt(m[3], 10) };
  }
  m = basename.match(/^(.*?)\s+(\d+)$/);
  if (m) {
    const book = canonicalizeBook(m[1]);
    if (book) return { book, chapter: parseInt(m[2], 10), chapterEnd: parseInt(m[2], 10) };
  }
  const book = canonicalizeBook(basename);
  if (book) return { book, chapter: null, chapterEnd: null };
  return null;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
}

function build(options) {
  const vaultRoot = options.vault;
  const engineDir = path.join(vaultRoot, ENGINE_SUBDIR);
  if (!fs.existsSync(engineDir)) {
    throw new Error(`Scripture Analysis Engine not found at ${engineDir}. Pass --vault <dir>.`);
  }

  const files = fs.readdirSync(engineDir).filter((f) => f.endsWith('.md')).sort();

  const chapters = {};
  const books = {};
  const stats = {
    filesSeen: files.length,
    filesSkipped: [],
    chapterNodes: 0,
    bookNodes: 0,
    emptyAfterFilter: [],
    deniedSections: 0,
    deniedHeadingSamples: new Set(),
    notes: 0,
  };

  for (const file of files) {
    const basename = file.replace(/\.md$/, '');
    if (basename.startsWith('_')) { stats.filesSkipped.push(basename); continue; }
    if (/Book Index|Survey$/i.test(basename) && !canonicalizeBook(basename)) {
      stats.filesSkipped.push(basename);
      continue;
    }

    const parsed = parseNodeName(basename);
    if (!parsed) { stats.filesSkipped.push(basename); continue; }

    const relPath = path.join(ENGINE_SUBDIR, file).split(path.sep).join('/');
    refuseForbiddenPath(relPath);

    const distilled = distilNode(path.join(engineDir, file), vaultRoot, relPath);
    stats.deniedSections += distilled.deniedHeadings.length;
    distilled.deniedHeadings.forEach((h) => stats.deniedHeadingSamples.add(h));

    if (!distilled.notes.length) {
      stats.emptyAfterFilter.push(basename);
      continue;
    }

    if (parsed.chapter === null) {
      books[bookKey(parsed.book)] = {
        ref: parsed.book,
        book: parsed.book,
        testament: testamentOf(parsed.book),
        source: relPath,
        notes: distilled.notes,
      };
      stats.bookNodes += 1;
    } else {
      const entry = {
        ref: parsed.chapterEnd > parsed.chapter
          ? `${parsed.book} ${parsed.chapter}-${parsed.chapterEnd}`
          : `${parsed.book} ${parsed.chapter}`,
        book: parsed.book,
        chapter: parsed.chapter,
        chapterEnd: parsed.chapterEnd,
        source: relPath,
        notes: distilled.notes,
      };
      for (let c = parsed.chapter; c <= parsed.chapterEnd; c += 1) {
        chapters[chapterKey(parsed.book, c)] = entry;
      }
      stats.chapterNodes += 1;
    }
    stats.notes += distilled.notes.length;
  }

  // Method layer: verify the three sources still exist, hash them for drift.
  const method = { notes: {}, sources: [] };
  for (const rel of METHOD_SOURCES) {
    refuseForbiddenPath(rel);
    const abs = path.join(vaultRoot, rel);
    const relPosix = rel.split(path.sep).join('/');
    if (fs.existsSync(abs)) {
      method.sources.push({ path: relPosix, digest: sha256(abs) });
    } else {
      method.sources.push({ path: relPosix, digest: null, missing: true });
      console.warn(`  ! method source missing: ${relPosix}`);
    }
  }
  for (const [key, list] of Object.entries(METHOD_NOTES)) {
    const kept = [];
    for (const note of list) {
      const accepted = cleanText(note);
      if (violatesFirewall(accepted) || violatesCitation(accepted)) {
        throw new VaultPackFirewallError(
          `Hand-distilled method note tripped the firewall (${key}): ${accepted.slice(0, 120)}`,
          [{ at: `method.${key}`, pattern: 'self', sample: accepted }],
        );
      }
      kept.push(accepted);
    }
    method.notes[key] = kept;
  }

  const pack = {
    version: PACK_VERSION,
    builtOn: new Date().toISOString(),
    generator: 'scripts/build-vault-pack.js',
    vaultSubdir: ENGINE_SUBDIR.split(path.sep).join('/'),
    counts: {
      chapters: stats.chapterNodes,
      chapterKeys: Object.keys(chapters).length,
      books: stats.bookNodes,
      notes: stats.notes + Object.values(method.notes).reduce((a, b) => a + b.length, 0),
    },
    method,
    books,
    chapters,
  };

  assertPackClean(pack);
  return { pack, stats };
}

// ---------------------------------------------------------------------------
// § Self-test — prove the firewall actually stops a leak
// ---------------------------------------------------------------------------

function selfTest() {
  const results = [];
  const check = (name, fn) => {
    let pass = false;
    let detail = '';
    try {
      pass = fn() === true;
    } catch (err) {
      detail = err.message.split('\n')[0];
    }
    results.push({ name, pass, detail });
  };

  // 1. assertPackClean throws on a private heading leaking through as a note.
  check('assertPackClean rejects a private-profile note', () => {
    try {
      assertPackClean({ chapters: { x: { notes: ["Cole's own execution paralysis bites here."] } } });
      return false;
    } catch (e) {
      return e instanceof VaultPackFirewallError;
    }
  });

  // 2. assertPackClean throws on a counterpart-verse leak.
  check('assertPackClean rejects a counterpart-verse note', () => {
    try {
      assertPackClean({ chapters: { x: { notes: ['The counterpart-verse for this chapter is v14.'] } } });
      return false;
    } catch (e) {
      return e instanceof VaultPackFirewallError;
    }
  });

  // 3. assertPackClean throws on a named scholar.
  check('assertPackClean rejects a named scholar', () => {
    try {
      assertPackClean({ chapters: { x: { notes: ['Most readers follow Beale on the beast imagery here.'] } } });
      return false;
    } catch (e) {
      return e instanceof VaultPackFirewallError;
    }
  });

  // 4. assertPackClean throws on sermon scaffolding vocabulary.
  check('assertPackClean rejects pulpit scaffolding', () => {
    try {
      assertPackClean({ chapters: { x: { notes: ['A possible outline for the sermon runs in four points.'] } } });
      return false;
    } catch (e) {
      return e instanceof VaultPackFirewallError;
    }
  });

  // 5. A synthetic node with forbidden sections yields none of that content.
  check('distilNode never consumes a denied section', () => {
    const tmp = path.join(require('os').tmpdir(), `vaultpack-selftest-${process.pid}.md`);
    fs.writeFileSync(tmp, [
      '# Fake 1 — Chapter Analysis',
      '> Book: [[Fake]] · Genre: test narrative · Date/Setting: nowhere, no time · Status: developing',
      '> _One-line: a synthetic node used only to prove the privacy firewall refuses the private sections._',
      '',
      '## 2. Genre & literary form',
      'A synthetic narrative built for testing, arranged in two balanced halves that mirror each other.',
      '',
      "## 13. Cole's-lens — deployed (the reason this node exists)",
      "- His people-pleasing and execution paralysis show up right here, and his marriage is the pressure point.",
      '',
      '## 12. ⭐ The counterpart-verse — v14',
      '- The counterpart-verse names the exact spot where his own tank runs empty at home.',
      '',
      '## 11. Application',
      '- Apply this to the congregation on Sunday with a four-point outline.',
      '',
      '## Loop log',
      '- 2026-01-01 — created.',
      '',
    ].join('\n'), 'utf8');
    try {
      const out = distilNode(tmp, '/nowhere', 'fake/Fake 1.md');
      const blob = JSON.stringify(out.notes).toLowerCase();
      const clean = !/cole|counterpart|people-pleas|execution paralysis|marriage|outline|congregation/.test(blob);
      const sawDenied = out.deniedHeadings.length >= 4;
      const keptSomething = out.notes.length > 0;
      return clean && sawDenied && keptSomething;
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  // 6. Path refusal.
  check('refuseForbiddenPath blocks the interior-health note', () => {
    try {
      refuseForbiddenPath('Knowledge/Mental/Emotional and Interior Health for Men.md');
      return false;
    } catch (e) {
      return e instanceof VaultPackFirewallError;
    }
  });

  // 7. A clean note survives (the firewall is not simply rejecting everything).
  check('a clean historical note passes both layers', () => {
    const note = acceptNote('The queen mother held recognized political influence in the Judahite court, so removing her was a constitutional act, not a family quarrel.');
    return typeof note === 'string' && note.length > 0;
  });

  // 8. The laundering bug: cleanText strips "[sourced: … sermon]", so the
  //    firewall has to see the sentence BEFORE it is cleaned. This is the exact
  //    path by which a preaching quote once reached the pack.
  check('a provenance tag cannot launder a sermon quote', () => {
    const raw = 'The apostolic age is over on the criteria Scripture gives for apostleship. [sourced: 1:1-2 sermon]';
    return acceptNote(raw) === null;
  });

  // 9. A preaching-calendar date never ships as historical setting.
  check('a preaching-calendar date is not shipped as setting', () => {
    const dated = acceptNote('Setting: Sun ~Nov 11 2023, Paul to Timothy at Ephesus.');
    const meta = parseHeaderMeta([
      '# 1 Fake 2 — Chapter Analysis',
      '> Book: [[Fake]] · Genre: pastoral epistle · Date/Setting: **Sun ~Nov 11 2023**, Paul to Timothy at Ephesus · Status: developing',
      '> _One-line: the Sunday manuscript, four instructions for the gathered church._',
      '',
      '## 1. Text & translation',
    ].join('\n'));
    return dated === null && !meta.setting && !meta.oneLine && meta.genre === 'pastoral epistle';
  });

  // 10. Half-sentences are dropped, not shipped.
  check('sentence fragments are refused', () => {
    const bad = [
      'The chapter is built on paired contrasts. Abijam (not-shalem) vs.',
      'Falling: Isa 13 [Babylon], Isa 34 [Edom], Ezek 32 [Egypt]) where cosmic de-creation imagery describes.',
      'B is possible at the textual level but unnecessary, on the reading just given.',
      'View B - voluntary imitation, with no requirement imposed from outside.',
    ];
    return bad.every((b) => acceptNote(b) === null);
  });

  // 11b. A restraint note keeps its prohibitions and loses its delivery advice.
  check('delivery clauses are stripped from restraint notes', () => {
    const note = acceptNote("Restraint: lead with 1 Pet 2:23 (the NT's own citation-grade link) and the refused-shortcut line; keep the robe-resonance a footnote; do not allegorize the cave, the darkness, or the three thousand.");
    return note === 'Restraint: do not allegorize the cave, the darkness, or the three thousand.';
  });

  // 11. A sentence whose only defect is a dangling tail is trimmed, not thrown
  //     away — the tail is what a removed cross-link left behind.
  check('a dangling tail is trimmed rather than dropped', () => {
    const note = acceptNote('"Fear of God" (yirat elohim) - the ANE\'s highest religious category (');
    return note === '"Fear of God" (yirat elohim) - the ANE\'s highest religious category.';
  });

  // 11. Apostrophes survive intact (the quote-normalising order bug).
  check('apostrophes are not mangled into double quotes', () => {
    const note = acceptNote("Asa's reform purged the idols his fathers had made, and the queen mother's standing fell with them.");
    return typeof note === 'string' && note.includes("Asa's") && !note.includes('Asa"s');
  });

  const failed = results.filter((r) => !r.pass);
  console.log('\nPRIVACY FIREWALL SELF-TEST');
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(`  ${results.length - failed.length}/${results.length} passed\n`);
  return failed.length === 0;
}

// ---------------------------------------------------------------------------
// § CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { vault: process.env.VAULT_ROOT || DEFAULT_VAULT, out: DEFAULT_OUT, dryRun: false, selfTest: false, verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--vault') opts.vault = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--self-test') opts.selfTest = true;
    else if (a === '--verbose') opts.verbose = true;
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
    return 0;
  }

  if (opts.selfTest) {
    return selfTest() ? 0 : 1;
  }

  console.log(`vault:  ${opts.vault}`);
  console.log(`out:    ${opts.out}`);

  // Always run the firewall self-test before a real build. If the guard is
  // broken, we do not build.
  if (!selfTest()) {
    console.error('Firewall self-test failed. Refusing to build.');
    return 1;
  }

  let built;
  try {
    built = build(opts);
  } catch (err) {
    if (err instanceof VaultPackFirewallError) {
      console.error(`\n${err.message}\n`);
      return 1;
    }
    throw err;
  }

  const { pack, stats } = built;
  const json = JSON.stringify(pack);

  if (!opts.dryRun) {
    fs.mkdirSync(opts.out, { recursive: true });
    fs.writeFileSync(path.join(opts.out, 'pack.json'), json, 'utf8');
  }

  const bytes = Buffer.byteLength(json, 'utf8');
  console.log('PACK');
  console.log(`  chapter nodes ....... ${stats.chapterNodes}`);
  console.log(`  chapter keys ........ ${Object.keys(pack.chapters).length}`);
  console.log(`  book nodes .......... ${stats.bookNodes}`);
  console.log(`  notes ............... ${pack.counts.notes}`);
  console.log(`  bytes ............... ${bytes} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  sections refused .... ${stats.deniedSections}`);
  console.log(`  files skipped ....... ${stats.filesSkipped.length} (${stats.filesSkipped.slice(0, 6).join(', ')}${stats.filesSkipped.length > 6 ? ', …' : ''})`);
  if (stats.emptyAfterFilter.length) {
    console.log(`  nodes with 0 usable notes: ${stats.emptyAfterFilter.length} — ${stats.emptyAfterFilter.slice(0, 12).join(', ')}${stats.emptyAfterFilter.length > 12 ? ', …' : ''}`);
  }
  if (opts.verbose) {
    console.log('\n  refused section headings (sample):');
    Array.from(stats.deniedHeadingSamples).slice(0, 25).forEach((h) => console.log(`    - ${h}`));
  }
  if (opts.dryRun) console.log('\n  --dry-run: nothing written.');
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  build,
  selfTest,
  assertPackClean,
  distilNode,
  acceptNote,
  cleanText,
  refuseForbiddenPath,
  VaultPackFirewallError,
  FORBIDDEN,
  CITATION_PATTERNS,
  DENY_HEADINGS,
  FORBIDDEN_PATH_FRAGMENTS,
  METHOD_NOTES,
  PACK_VERSION,
};
