'use strict';

/**
 * Canonical book table + reference parsing for the PLAIN READ vault pack.
 *
 * Shared by scripts/build-vault-pack.js (build time) and ./index.js (run time)
 * so a reference parses the same way in both places.
 *
 * CommonJS on purpose — this lives under electron/.
 */

// [canonical name, testament, aliases...]
const BOOKS = [
  ['Genesis', 'OT', 'gen', 'ge', 'gn'],
  ['Exodus', 'OT', 'exod', 'exo', 'ex'],
  ['Leviticus', 'OT', 'lev', 'le', 'lv'],
  ['Numbers', 'OT', 'num', 'nu', 'nm', 'nb'],
  ['Deuteronomy', 'OT', 'deut', 'deu', 'dt'],
  ['Joshua', 'OT', 'josh', 'jos', 'jsh'],
  ['Judges', 'OT', 'judg', 'jdg', 'jg', 'jdgs'],
  ['Ruth', 'OT', 'rth', 'ru'],
  ['1 Samuel', 'OT', '1sam', '1sa', '1s', '1sm', 'firstsamuel', 'isamuel', 'isam'],
  ['2 Samuel', 'OT', '2sam', '2sa', '2s', '2sm', 'secondsamuel', 'iisamuel', 'iisam'],
  ['1 Kings', 'OT', '1kings', '1kgs', '1ki', '1k', 'firstkings', 'ikings', 'ikgs'],
  ['2 Kings', 'OT', '2kings', '2kgs', '2ki', '2k', 'secondkings', 'iikings', 'iikgs'],
  ['1 Chronicles', 'OT', '1chron', '1chr', '1ch', 'firstchronicles', 'ichronicles', 'ichr'],
  ['2 Chronicles', 'OT', '2chron', '2chr', '2ch', 'secondchronicles', 'iichronicles', 'iichr'],
  ['Ezra', 'OT', 'ezr'],
  ['Nehemiah', 'OT', 'neh', 'ne'],
  ['Esther', 'OT', 'esth', 'est', 'es'],
  ['Job', 'OT', 'jb'],
  ['Psalms', 'OT', 'psalm', 'psa', 'ps', 'pss', 'psl'],
  ['Proverbs', 'OT', 'prov', 'pro', 'prv', 'pr'],
  ['Ecclesiastes', 'OT', 'eccl', 'eccles', 'ecc', 'ec', 'qoheleth'],
  ['Song of Songs', 'OT', 'songofsolomon', 'song', 'songs', 'sos', 'ss', 'canticles', 'cant'],
  ['Isaiah', 'OT', 'isa', 'is'],
  ['Jeremiah', 'OT', 'jer', 'je', 'jr'],
  ['Lamentations', 'OT', 'lam', 'la'],
  ['Ezekiel', 'OT', 'ezek', 'eze', 'ezk'],
  ['Daniel', 'OT', 'dan', 'da', 'dn'],
  ['Hosea', 'OT', 'hos', 'ho'],
  ['Joel', 'OT', 'joe', 'jl'],
  ['Amos', 'OT', 'am'],
  ['Obadiah', 'OT', 'obad', 'oba', 'ob'],
  ['Jonah', 'OT', 'jon', 'jnh'],
  ['Micah', 'OT', 'mic', 'mc'],
  ['Nahum', 'OT', 'nah', 'na'],
  ['Habakkuk', 'OT', 'hab', 'hb'],
  ['Zephaniah', 'OT', 'zeph', 'zep', 'zp'],
  ['Haggai', 'OT', 'hag', 'hg'],
  ['Zechariah', 'OT', 'zech', 'zec', 'zc'],
  ['Malachi', 'OT', 'mal', 'ml'],
  ['Matthew', 'NT', 'matt', 'mat', 'mt'],
  ['Mark', 'NT', 'mrk', 'mk', 'mr'],
  ['Luke', 'NT', 'luk', 'lk'],
  ['John', 'NT', 'jhn', 'jn', 'joh'],
  ['Acts', 'NT', 'act', 'ac', 'actsoftheapostles'],
  ['Romans', 'NT', 'rom', 'ro', 'rm'],
  ['1 Corinthians', 'NT', '1cor', '1co', '1c', 'firstcorinthians', 'icorinthians', 'icor'],
  ['2 Corinthians', 'NT', '2cor', '2co', '2c', 'secondcorinthians', 'iicorinthians', 'iicor'],
  ['Galatians', 'NT', 'gal', 'ga'],
  ['Ephesians', 'NT', 'eph', 'ep'],
  ['Philippians', 'NT', 'phil', 'php', 'pp'],
  ['Colossians', 'NT', 'col', 'co'],
  ['1 Thessalonians', 'NT', '1thess', '1thes', '1th', 'firstthessalonians', 'ithessalonians', 'ithess'],
  ['2 Thessalonians', 'NT', '2thess', '2thes', '2th', 'secondthessalonians', 'iithessalonians', 'iithess'],
  ['1 Timothy', 'NT', '1tim', '1ti', '1tm', 'firsttimothy', 'itimothy', 'itim'],
  ['2 Timothy', 'NT', '2tim', '2ti', '2tm', 'secondtimothy', 'iitimothy', 'iitim'],
  ['Titus', 'NT', 'tit', 'ti'],
  ['Philemon', 'NT', 'philem', 'phlm', 'phm'],
  ['Hebrews', 'NT', 'heb', 'hbr'],
  ['James', 'NT', 'jas', 'jm'],
  ['1 Peter', 'NT', '1pet', '1pe', '1pt', '1p', 'firstpeter', 'ipeter', 'ipet'],
  ['2 Peter', 'NT', '2pet', '2pe', '2pt', '2p', 'secondpeter', 'iipeter', 'iipet'],
  ['1 John', 'NT', '1jn', '1jhn', '1jo', '1j', 'firstjohn', 'ijohn', 'ijn'],
  ['2 John', 'NT', '2jn', '2jhn', '2jo', '2j', 'secondjohn', 'iijohn', 'iijn'],
  ['3 John', 'NT', '3jn', '3jhn', '3jo', '3j', 'thirdjohn', 'iiijohn', 'iiijn'],
  ['Jude', 'NT', 'jud', 'jde'],
  ['Revelation', 'NT', 'rev', 're', 'apocalypse', 'revelations', 'revelationofjohn'],
];

const ALIAS_TO_BOOK = new Map();
const BOOK_TESTAMENT = new Map();

function squash(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

for (const entry of BOOKS) {
  const canonical = entry[0];
  const testament = entry[1];
  BOOK_TESTAMENT.set(canonical, testament);
  ALIAS_TO_BOOK.set(squash(canonical), canonical);
  for (let i = 2; i < entry.length; i += 1) {
    ALIAS_TO_BOOK.set(squash(entry[i]), canonical);
  }
}

// Roman-numeral / word ordinals people actually type.
const ORDINAL_PREFIX = [
  [/^(i{1,3})\s+/i, (m) => `${m[1].length} `],
  [/^(first)\s+/i, () => '1 '],
  [/^(second)\s+/i, () => '2 '],
  [/^(third)\s+/i, () => '3 '],
];

/**
 * "Phil" / "1 Kgs" / "II Timothy" -> "Philippians" / "1 Kings" / "2 Timothy".
 * Returns null when the string is not a book of the Protestant canon.
 */
function canonicalizeBook(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  for (const [re, fn] of ORDINAL_PREFIX) {
    const m = s.match(re);
    if (m) {
      s = s.replace(re, fn(m));
      break;
    }
  }
  return ALIAS_TO_BOOK.get(squash(s)) || null;
}

function testamentOf(canonicalBook) {
  return BOOK_TESTAMENT.get(canonicalBook) || null;
}

/**
 * Parse a human reference into { book, chapter, chapterEnd }.
 *
 * Handles: "Phil 4:13", "Philippians 4:10-13", "1 Kings 15", "1 Tim 2",
 *          "Rev 21-22", "II Timothy 2:2", "Song of Songs", "Ps 119:105".
 * chapter is null for a whole-book reference ("Philippians", "Jude").
 * Returns null when the book is unrecognizable.
 */
function parseReference(reference) {
  if (!reference) return null;

  let s = String(reference)
    .replace(/[‐-―−]/g, '-') // unicode dashes -> hyphen
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;

  // Drop a trailing parenthetical or translation tag: "John 3:16 (ESV)"
  s = s.replace(/\s*\([^)]*\)\s*$/, '').trim();

  // "1Kings 15" -> "1 Kings 15"; "1st Kings" -> "1 Kings"
  s = s.replace(/^([1-3])(?:st|nd|rd|th)?\s*([A-Za-z])/, '$1 $2');

  // Strip the verse portion; we index by chapter.
  const colon = s.indexOf(':');
  if (colon !== -1) s = s.slice(0, colon).trim();
  // "John 3.16" style
  s = s.replace(/^(.*?[A-Za-z]\s*\d+)\.\d.*$/, '$1').trim();

  let chapter = null;
  let chapterEnd = null;

  // "Rev 21-22"
  let m = s.match(/^(.*?)\s+(\d+)\s*-\s*(\d+)\s*$/);
  if (m) {
    chapter = parseInt(m[2], 10);
    chapterEnd = parseInt(m[3], 10);
    s = m[1];
  } else {
    m = s.match(/^(.*?)\s+(\d+)\s*$/);
    if (m) {
      chapter = parseInt(m[2], 10);
      chapterEnd = chapter;
      s = m[1];
    }
  }

  const book = canonicalizeBook(s);
  if (!book) return null;
  return { book, chapter, chapterEnd: chapterEnd === null ? chapter : chapterEnd };
}

function chapterKey(book, chapter) {
  return `${squash(book)}|${chapter}`;
}

function bookKey(book) {
  return squash(book);
}

module.exports = {
  BOOKS,
  canonicalizeBook,
  testamentOf,
  parseReference,
  chapterKey,
  bookKey,
};
