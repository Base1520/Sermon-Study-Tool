/**
 * hostedError.ts — recovering a paywall from an Electron IPC error.
 *
 * Electron flattens an Error thrown in the main process before it reaches the
 * renderer: the message survives, every custom property does not. So attaching
 * the server's upgrade offer as `err.upgrade` silently produced `undefined`
 * here, `if (e?.upgrade)` never fired, and every 402 rendered as a red error box
 * with no subscribe buttons — meaning no one could have paid even if they wanted
 * to.
 *
 * main.js therefore encodes the offer INTO the message behind this tag, and this
 * pulls it back out. Both sides must agree on the tag; it is defined once in
 * each file and asserted by test-hosted-error.
 */

export const OFFER_TAG = '__OPERATOR_OFFER__'

export interface UpgradeOffer {
  error?: string
  code?: string
  status?: number
  headline?: string
  body?: string
  message?: string
  used?: number
  allowance?: number
  actions?: Array<{ kind?: string; plan?: string; label: string }>
}

/**
 * Pull the server's offer out of an IPC error, or null if this is an ordinary
 * failure. Never throws: a malformed payload is treated as "not an offer", so a
 * bad parse degrades to the normal error path rather than hiding the error too.
 */
export function offerFromError(e: unknown): UpgradeOffer | null {
  const message = typeof e === 'string' ? e : (e as any)?.message
  if (typeof message !== 'string') return null
  const at = message.indexOf(OFFER_TAG)
  if (at === -1) return null
  try {
    const parsed = JSON.parse(message.slice(at + OFFER_TAG.length))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
