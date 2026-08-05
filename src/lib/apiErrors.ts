/**
 * apiErrors.ts — turn provider errors into something a human can act on.
 *
 * Errors reach the renderer as a single string, because that is what survives
 * the Electron IPC boundary. When the SDK throws, that string is the whole
 * serialized 400 body — type, request_id, headers, the lot. Putting that in
 * front of a reader who wanted to understand Ephesians is a failure of the
 * product, not a display detail.
 *
 * Every branch below answers two questions: what happened, and what do I do
 * about it. If it cannot answer both, it falls through to the raw message
 * rather than inventing a diagnosis.
 */

export interface FriendlyError {
  headline: string
  detail: string
  /** Where to go fix it, when there is somewhere to go. */
  link?: string
}

/** Pull the human sentence out of an SDK error string, if there is one. */
function innerMessage(raw: string): string {
  // The SDK stringifies as: `400 {"type":"error","error":{...,"message":"..."}}`
  const brace = raw.indexOf('{')
  if (brace !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(brace))
      const msg = parsed?.error?.message ?? parsed?.message
      if (typeof msg === 'string' && msg.trim()) return msg.trim()
    } catch {
      /* not JSON — fall through */
    }
  }
  // Electron prefixes IPC rejections with "Error invoking remote method '...':"
  return raw.replace(/^Error invoking remote method '[^']*':\s*/, '').trim()
}

import { OFFER_TAG } from './hostedError'

export function friendlyApiError(err: unknown): FriendlyError {
  const rawWithTag =
    typeof err === 'string' ? err
      : (err as any)?.message ? String((err as any).message)
        : String(err ?? '')

  /**
   * A TAGGED OFFER MUST NEVER BE PRINTED AT A HUMAN.
   *
   * The server's 402 payload travels inside the error message (see
   * hostedError.ts — Electron destroys custom Error properties across IPC). Only
   * one catch site was taught to decode it, so a paywall arriving on the READING
   * path was handed straight to this function and rendered verbatim: a pastor
   * looking at `__OPERATOR_OFFER__{"code":"FREE_STUDY_SPENT",...}` in the reader.
   *
   * Cutting the tag off HERE, rather than only fixing the catch sites, is what
   * makes it impossible to reintroduce: any catch anywhere, written by anyone,
   * degrades to the offer's own headline instead of leaking JSON.
   */
  const tagAt = rawWithTag.indexOf(OFFER_TAG)
  let raw = rawWithTag
  if (tagAt !== -1) {
    try {
      const offer = JSON.parse(rawWithTag.slice(tagAt + OFFER_TAG.length))
      raw = offer?.headline || offer?.message || offer?.body || 'This part needs a subscription.'
    } catch {
      raw = rawWithTag.slice(0, tagAt).trim() || 'This part needs a subscription.'
    }
  }

  const msg = innerMessage(raw)
  const hay = `${raw} ${msg}`.toLowerCase()

  // Licensing first. These are not provider failures — nothing is broken, and a
  // man told "something went wrong" when the real answer is "this part is paid"
  // will go looking for a bug that does not exist. They also have to outrank the
  // generic matchers below, because "LICENSE_REQUIRED" would otherwise never be
  // reached on a string that happens to contain the word billing.

  if (hay.includes('license_required')) {
    return {
      headline: 'This part is in the full version',
      detail:
        'Everything you have already studied is still yours — open it, ask about it, export it, ' +
        'and nothing you have goes away. Running a NEW study is what the full version adds. ' +
        'Paste a license key in settings if you have one.',
    }
  }

  if (hay.includes('license_expired')) {
    return {
      headline: 'Your license has run out',
      detail:
        'Every study you have already run still opens, free, forever. ' +
        'Renewing turns new studies back on — and your key will still be in the same email it came in.',
    }
  }

  if (hay.includes('license_invalid')) {
    return {
      headline: 'That license key did not verify',
      detail:
        'The most common cause is a partial copy — the key is one long line and email clients ' +
        'sometimes cut it. Copy the whole thing and paste it again. Your old key was not touched.',
    }
  }

  if (hay.includes('input_too_large')) {
    return {
      headline: 'That passage is too long',
      detail:
        'Study one passage at a time rather than a whole book — the reading is built to work ' +
        'a unit of thought at a time, and it is a better study for it.',
    }
  }

  if (hay.includes('credit balance is too low') || hay.includes('billing')) {
    return {
      headline: 'Out of API credits',
      detail:
        'The Anthropic account behind this key has no credit left, so it cannot run a new study. ' +
        'Anything you have already studied still opens from history for free.',
      link: 'console.anthropic.com → Plans & Billing',
    }
  }

  if (hay.includes('authentication_error') || hay.includes('invalid x-api-key') || hay.includes('401')) {
    return {
      headline: 'That API key is not working',
      detail:
        'The key was rejected. It may have been revoked, or pasted with a stray space or line break. ' +
        'Re-paste it in settings.',
    }
  }

  if (hay.includes('permission_error') || hay.includes('403')) {
    return {
      headline: 'This key is not allowed to do that',
      detail: 'The key is valid but lacks access to the model this study needs.',
    }
  }

  if (hay.includes('rate_limit') || hay.includes('429')) {
    return {
      headline: 'Too many requests, too fast',
      detail: 'Give it a minute and try again. Nothing was lost.',
    }
  }

  if (hay.includes('overloaded') || hay.includes('529') || hay.includes('503')) {
    return {
      headline: 'Anthropic is overloaded right now',
      detail: 'This is on their end, not yours. Try again in a moment.',
    }
  }

  if (
    hay.includes('enotfound') || hay.includes('econnrefused') || hay.includes('etimedout') ||
    hay.includes('fetch failed') || hay.includes('network') || hay.includes('offline')
  ) {
    return {
      headline: 'Cannot reach the internet',
      detail: 'The study needs a connection. Check your network and try again.',
    }
  }

  if (hay.includes('request_too_large') || hay.includes('413')) {
    return {
      headline: 'That passage is too long',
      detail: 'Try a shorter passage — a paragraph or a chapter rather than a whole book.',
    }
  }

  /* Our own validation, after the retry is spent. Worth naming honestly: the
     tool refused to show something it could not stand behind.

     EVERY FENCE MESSAGE HAS TO MATCH HERE, NOT JUST THE PULPIT ONE.

     The branch used to test only the class name and the literal "pulpit
     language". Three of the four fences throw messages containing neither, so
     they fell through to the raw fallback at the bottom of this function and
     were printed to the reader WORD FOR WORD:

       'PLAIN READ contradicted the doctrinal fence — Babylon read as Jerusalem
        (the fence: Babylon is Rome): "..."'
       'PLAIN READ disclosed its own prompt framing: "My instructions"'
       'the answer credited a named person with a position: "Beale argues"'

     Each of those is the exact thing its own fence exists to keep off the
     screen — the doctrinal position stated in the clear, the prompt's private
     framing, and a named scholar. An error box is user-facing text like any
     other, so a guard that reports its finding in plain sight has published
     what it just refused to publish.

     The class name is not load-bearing either: whether `name` survives the IPC
     boundary depends on Electron's error serialization (a custom Error subclass
     is not in its constructor map), so it cannot be the thing the fence rests
     on. Matched on the MESSAGE SHAPES instead, which this code owns. */
  if (
    hay.includes('plainreadvalidationerror') ||
    hay.includes('pulpit language') ||
    hay.includes('doctrinal fence') ||
    hay.includes('prompt framing') ||
    hay.includes('credited a named person') ||
    hay.includes('named a person as an authority')
  ) {
    return {
      headline: 'The reading did not pass its own checks',
      detail:
        'The tool produced something that broke one of its rules and refused to show it rather than ' +
        'hand you a reading it could not stand behind. Try again — this usually clears on a second run.',
    }
  }

  return {
    headline: 'Could not finish the reading',
    detail: msg || 'Something went wrong and the tool did not get a usable answer.',
  }
}

/** One-line form, for surfaces that only have room for a string. */
export function friendlyApiErrorText(err: unknown): string {
  const f = friendlyApiError(err)
  return f.link ? `${f.headline}. ${f.detail} (${f.link})` : `${f.headline}. ${f.detail}`
}
