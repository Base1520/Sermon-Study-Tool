/**
 * reference.ts — canonical display form for a scripture reference.
 *
 * A man types `romans 1:16` or `1 COR 2` and that raw string was being carried
 * straight through to the header, the document title, the history list and the
 * search index. So the app showed him "romans 1:16" — his typing, echoed back,
 * looking like a bug in a product that is otherwise careful about type.
 *
 * Normalising at the point of ANALYSIS rather than at each display site means
 * one fix reaches every surface, and the stored reference is canonical, so
 * history and search stay tidy too.
 *
 * Deliberately NOT a book-name validator or expander. It does not turn "rom"
 * into "Romans" — the ESV/KJV fetchers already resolve abbreviations, and
 * silently rewriting what a man typed into a different book is a worse failure
 * than showing him a lowercase one. This only fixes CASE.
 */

/** Words that stay lowercase inside a title, unless they lead it. */
const MINOR = new Set(['of', 'the', 'and'])

/** Roman-numeral-ish and ordinal prefixes that are already correct as typed. */
const NUMERIC = /^\d+$/

function capitalizeWord(w: string): string {
  if (!w) return w
  // Preserve any leading punctuation, e.g. a stray quote.
  const m = w.match(/^([^A-Za-z]*)([A-Za-z].*)$/)
  if (!m) return w
  const [, lead, rest] = m
  return lead + rest.charAt(0).toUpperCase() + rest.slice(1).toLowerCase()
}

/**
 * "romans 1:16"        -> "Romans 1:16"
 * "1 corinthians 2"    -> "1 Corinthians 2"
 * "SONG OF SOLOMON 2"  -> "Song of Solomon 2"
 * "1 john 4:7-12"      -> "1 John 4:7-12"
 *
 * The chapter/verse tail is left exactly as typed — it carries no letters worth
 * touching, and mangling "4:7-12" would be far worse than leaving it.
 */
export function formatReference(raw: string): string {
  const input = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!input) return ''

  // Split the book name from the chapter:verse tail. The tail begins at the
  // first token that starts with a digit AND is not the leading book numeral
  // ("1" in "1 Corinthians").
  const tokens = input.split(' ')
  const out: string[] = []
  let seenBookWord = false

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]

    // A bare number before any book word is the book's ordinal — "1 Kings".
    if (!seenBookWord && NUMERIC.test(t)) { out.push(t); continue }

    // Once we hit something with a digit after the book has started, the rest
    // is the chapter/verse reference. Pass it through untouched.
    if (seenBookWord && /\d/.test(t)) { out.push(...tokens.slice(i)); break }

    seenBookWord = true
    const lower = t.toLowerCase()
    out.push(MINOR.has(lower) && out.length > 0 ? lower : capitalizeWord(t))
  }

  return out.join(' ')
}
