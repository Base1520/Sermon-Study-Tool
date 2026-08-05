/**
 * translations.ts — the one list of Bible translations the app offers.
 *
 * WHY THIS FILE EXISTS. The list used to be duplicated in PassageInput.tsx and
 * ParallelPanel.tsx, and the two drifted. The sidebar shipped a button labelled
 * ASV whose id was `nasb`, and both panels shipped a DBY button whose id was
 * `dby`. Neither id exists on bible-api.com — NASB is copyrighted and cannot be
 * served by a public-domain API at all — so both requests 404'd and the buttons
 * did nothing. The ASV one was reported by a user; DBY had been dead the whole
 * time and nobody had clicked it.
 *
 * The `id` is not a label. It is sent verbatim as ?translation=<id> to
 * bible-api.com, so it must be a string that service actually recognises.
 * VERIFIED LIVE against the API on 2026-08-04: kjv, asv, ylt, darby, web and bbe
 * all return text; nasb and dby both return 404.
 */

export interface Translation {
  /** Sent verbatim as ?translation=<id>. Must be an id bible-api.com serves. */
  id: string
  /** What the button says. Free to differ from the id — see `darby` / "DBY". */
  label: string
  /** ESV needs a user-supplied key; the public-domain texts need nothing. */
  requiresKey: boolean
}

export const TRANSLATIONS: Translation[] = [
  { id: 'esv',   label: 'ESV', requiresKey: true  },
  { id: 'kjv',   label: 'KJV', requiresKey: false },
  { id: 'asv',   label: 'ASV', requiresKey: false },
  { id: 'ylt',   label: 'YLT', requiresKey: false },
  { id: 'darby', label: 'DBY', requiresKey: false },
]

/**
 * Ids confirmed to return text from bible-api.com, plus 'esv' which goes to
 * api.esv.org instead. Anything not on this list will 404 silently — the button
 * will render, click, and do nothing, which is exactly how both bugs shipped.
 *
 * Asserted by test-translations.js so a new entry cannot be added blind.
 */
export const SERVED_IDS = ['esv', 'kjv', 'asv', 'ylt', 'darby', 'web', 'bbe'] as const
