'use strict';

/**
 * PLAIN READ — vault knowledge pack loader.
 *
 * The pack (./pack.json) is committed data distilled from the author's Obsidian
 * vault by scripts/build-vault-pack.js. The vault itself exists on exactly one
 * machine; a tester's laptop has none. So this module reads the committed JSON
 * and never touches the vault.
 *
 * WHAT THIS RETURNS
 *   Short factual statements about a passage — historical setting, genre and
 *   literary structure, canonical placement, the restraint fences the source
 *   node carries, and "commonly misread as X" warnings — safe to drop into a
 *   prompt as grounding.
 *
 * WHAT IT NEVER RETURNS
 *   A guess. If the pack has nothing for a reference, lookupPassage returns
 *   null. A miss is reported as a miss. Inventing plausible background is the
 *   one failure this module exists to prevent: a reader cannot tell distilled
 *   knowledge from confident fabrication, so the loader must never blur them.
 *
 * CommonJS on purpose — this lives under electron/.
 */

const path = require('path');
const { parseReference, chapterKey, bookKey } = require('./books.js');

const PACK_PATH = path.join(__dirname, 'pack.json');

// Prompt budget. Chapter notes are the specific ones and come first; book-level
// notes are broader and fill in behind them. Callers may raise these per call
// (see lookupPassage's options) — a caller that enforces its own token budget
// downstream wants the widest honest slice, not this conservative default.
const MAX_NOTES = 14;
const MAX_BOOK_NOTES = 4;

/**
 * The payload key under which pipeline.js injects vault grounding for the model.
 *
 * It lives HERE, in the module both sides already depend on, because verify.js
 * has to find the same block pipeline.js wrote and importing pipeline.js from
 * verify.js would be a require cycle (pipeline.js requires verify.js). One
 * spelling, one file, no cycle.
 */
const GROUNDING_KEY = 'groundingNotes';

let packCache;
let packLoadFailed = false;

/**
 * Load the pack once. A missing or corrupt pack degrades to "no knowledge"
 * rather than taking the app down — PLAIN READ still runs, just ungrounded.
 */
function loadPack() {
  if (packCache !== undefined) return packCache;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    packCache = require(PACK_PATH);
    if (!packCache || typeof packCache !== 'object' || !packCache.chapters) {
      packCache = null;
      packLoadFailed = true;
    }
  } catch (err) {
    packCache = null;
    packLoadFailed = true;
  }
  return packCache;
}

function pushUnique(into, values, limit) {
  for (const value of values || []) {
    if (into.length >= limit) return;
    if (typeof value !== 'string' || !value) continue;
    if (into.some((existing) => existing.toLowerCase() === value.toLowerCase())) continue;
    into.push(value);
  }
}

/**
 * Look up grounding notes for a passage reference.
 *
 * Accepts what a person actually types: "Phil 4:13", "Philippians 4:10-13",
 * "1 Kings 15", "1 Tim 2", "II Timothy 2:2", "Rev 21-22", "Song of Songs".
 * Verse numbers are accepted and ignored — the pack is indexed by chapter.
 *
 * Resolution order:
 *   1. the chapter node(s) the reference names
 *   2. the book node, as background behind them
 *   3. the book node alone, when the reference names a book with no chapter node
 *
 * @param {string} reference
 * @param {object} [options]
 * @param {number} [options.maxNotes]     total note ceiling (default 14)
 * @param {number} [options.maxBookNotes] book-level notes behind the chapter
 *                                        notes (default 4)
 * @returns {{notes: string[], sources: string[]}|null} null when the pack holds
 *   nothing for this reference, or the reference names no book of the canon.
 */
function lookupPassage(reference, options) {
  const pack = loadPack();
  if (!pack) return null;

  // Additive and defaulted: an existing caller that passes nothing gets exactly
  // the behaviour it got before.
  const maxNotes = Number.isFinite(options?.maxNotes)
    ? Math.max(0, Math.floor(options.maxNotes))
    : MAX_NOTES;
  const maxBookNotes = Number.isFinite(options?.maxBookNotes)
    ? Math.max(0, Math.floor(options.maxBookNotes))
    : MAX_BOOK_NOTES;

  const parsed = parseReference(reference);
  if (!parsed) return null;

  const notes = [];
  const sources = [];
  const addSource = (source) => {
    if (source && !sources.includes(source)) sources.push(source);
  };

  if (parsed.chapter !== null) {
    const first = parsed.chapter;
    const last = Math.max(parsed.chapterEnd || first, first);
    // A range is capped so "Genesis 1-50" cannot flood the prompt.
    for (let c = first; c <= last && c - first < 6; c += 1) {
      const entry = pack.chapters[chapterKey(parsed.book, c)];
      if (!entry) continue;
      pushUnique(notes, entry.notes, maxNotes);
      addSource(entry.source);
    }
  }

  const bookEntry = pack.books[bookKey(parsed.book)];
  if (bookEntry) {
    const budget = Math.min(maxNotes, notes.length + maxBookNotes);
    const before = notes.length;
    pushUnique(notes, bookEntry.notes, budget);
    if (notes.length > before) addSource(bookEntry.source);
  }

  if (!notes.length) return null;
  return { notes, sources };
}

/**
 * Pack provenance, for a UI that wants to say what it is running on.
 *
 * @returns {{chapters: number, builtOn: string|null, version: number}}
 *   `chapters` counts addressable chapters — every chapter a lookup can hit,
 *   which is larger than the file count because one node may cover a range
 *   ("Revelation 2-3" answers both). Zeroes mean no pack was loaded.
 */
function packMeta() {
  const pack = loadPack();
  if (!pack) return { chapters: 0, builtOn: null, version: 0 };
  const chapters = pack.chapters ? Object.keys(pack.chapters).length : 0;
  return {
    chapters,
    builtOn: typeof pack.builtOn === 'string' ? pack.builtOn : null,
    version: typeof pack.version === 'number' ? pack.version : 0,
  };
}

/**
 * Method-layer notes: how to cross the distance from an ancient text to a
 * present reader, how doctrines rank, what Scripture's sufficiency does and does
 * not claim. Passage-independent, so they are not part of lookupPassage.
 *
 * Additive — not part of the interface other modules code against.
 *
 * @param {'application'|'triage'|'sufficiency'} [topic]
 * @returns {string[]} empty when there is no pack or no such topic.
 */
function methodNotes(topic) {
  const pack = loadPack();
  if (!pack || !pack.method || !pack.method.notes) return [];
  if (!topic) return Object.values(pack.method.notes).flat();
  return pack.method.notes[topic] || [];
}

/** True when pack.json was missing or unreadable. Additive. */
function packMissing() {
  loadPack();
  return packLoadFailed;
}

module.exports = {
  lookupPassage,
  packMeta,
  methodNotes,
  packMissing,
  GROUNDING_KEY,
};
