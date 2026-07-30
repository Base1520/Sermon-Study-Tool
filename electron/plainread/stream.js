/**
 * stream.js — an incremental top-level-key extractor for a JSON object that is
 * still arriving.
 *
 * WHY THIS EXISTS. The PLAIN READ document is one JSON object, ~2,400 words at
 * the plain level, written by one model call. The wall-clock is real composition
 * time, not overhead, so it cannot be shortened — Cole ruled that explicitly:
 * the reader gets MORE explanation, not less. What can be removed is the
 * WAITING. If the renderer can put `situation` on screen the moment the model
 * finishes writing it, the man is reading while the rest is still being
 * composed. Same total seconds, none of them spent staring at a spinner.
 *
 * You cannot render half-parsed JSON, so this file answers exactly one
 * question: which TOP-LEVEL keys have CLOSED? Feed it text chunks; it hands back
 * the ones that finished in that chunk, already parsed.
 *
 * THE WHOLE CORRECTNESS RISK IS THE STRING STATE. A brace inside a quoted
 * string — "he was in a bind {like this}" — will miscount depth in any naive
 * counter and cause a key to be declared complete in the middle of its own
 * value, or never at all. So this tracks quotes and backslash escapes
 * character by character, and a brace seen inside a string is not a brace.
 *
 * IT NEVER THROWS. A truncated stream, a fenced response, prose before the
 * object, a value whose slice will not parse — every one of those returns what
 * genuinely completed and nothing more. This is a RENDERING aid sitting in front
 * of a model call; it must never be the thing that kills a reading. The real
 * document is still parsed and validated in full by pipeline.js after the
 * stream closes. Nothing here is authoritative.
 *
 * DEEPENING — why depth 1 alone was not enough. Measured on a real run: the
 * first key, `reference`, landed in 2.4s and the renderer then sat still for
 * ~90 seconds. The cause is `work` — ONE top-level key holding all six reasoning
 * steps (genre, setting, surroundings, words, story, doing), each with body,
 * youCanCheck and theMove. Eighteen fields, the bulk of the document, and at
 * depth 1 not one character of it can be shown until the last one is written.
 * The document does not get shorter (Cole ruled that) and the key order does not
 * change, so the only thing left to remove is the waiting INSIDE that key.
 *
 * `createSectionExtractor({ deepen: ['work'] })` says: for these keys, also
 * report when a CHILD closes one level in. Deepening is strictly OPT-IN — with
 * no option the extractor behaves exactly as it did, because
 * scripts/plainread-live.js and the pre-generated program path depend on that.
 *
 * NO DEPENDENCIES. Hand-rolled on purpose.
 */

'use strict'

/* Character-class helpers kept tiny and local — this loop runs per character
 * over ~20KB of text, several times a minute. */
function isWhitespace(c) {
  return c === ' ' || c === '\n' || c === '\r' || c === '\t'
}

/**
 * Create a stateful extractor.
 *
 * @param {object}   [options]
 * @param {string[]} [options.deepen]  top-level keys whose CHILDREN should also
 *   be reported as they close. Omit it and behaviour is byte-identical to the
 *   depth-1-only extractor.
 *
 * @returns {{
 *   push: (chunk: string) => Array<{ key: string, value: any }>,
 *   done: () => { rootClosed: boolean, keys: string[] },
 *   keys: () => string[],
 * }}
 *
 * `push(chunk)` returns the keys that COMPLETED during that chunk, in the order
 * the model wrote them, each with its parsed value. Most chunks complete
 * nothing and return an empty array. A key is reported AT MOST ONCE for the
 * life of one extractor: if a malformed document repeats a top-level key, the
 * first occurrence is the one that is emitted, because the renderer has already
 * drawn it and a silent second render of the same section is a worse bug than
 * dropping a duplicate the validator is about to reject anyway.
 *
 * DEEPENED KEYS ARE THE ONE EXCEPTION to "at most once", and the shape was
 * chosen so the renderer needs no new branch. A deepened key is emitted under
 * ITS OWN NAME — `work` — carrying the PARTIAL object accumulated so far:
 *
 *     { key: 'work', value: { genre: {…} } }
 *     { key: 'work', value: { genre: {…}, setting: {…} } }
 *     …
 *     { key: 'work', value: {…all six steps, parsed from the whole slice…} }
 *
 * Each payload is a strict superset of the one before it, so a renderer that
 * already merges by key (`sections[key] = value`) simply redraws a fuller
 * `work` — exactly what it does today when the final document is swapped in.
 * The alternative, emitting `'work.genre'`, would have forced every consumer to
 * learn a compound-key convention and to know which parent to fold it into, for
 * no gain. The cost of this shape is re-sending a growing payload six times;
 * these are in-process objects, and the reader getting the fourth reasoning step
 * ninety seconds earlier is worth more than the copies.
 *
 * A deepened key only deepens if its value is an OBJECT. A string, an array or a
 * scalar under a deepened name is emitted once at depth 1 like anything else —
 * a half-filled array has no unambiguous partial form.
 *
 * NOTHING EMITTED HERE IS TRUSTED. A partial `work` is pre-validation and
 * pre-completion by definition; the document parsed after the stream closes is
 * the only authority.
 *
 * `done()` flushes nothing. A trailing scalar that never saw its `,` or `}` is
 * NOT complete and is not invented — that is the truncated-stream contract. It
 * reports whether the root object actually closed, which is the honest signal
 * for "the model finished the object" as opposed to "the socket died".
 */
function createSectionExtractor(options) {
  // Opt-in, and defensively so: a bad `deepen` degrades to "no deepening"
  // rather than to a throw inside a stream handler.
  const deepen = new Set()
  const wanted = options && options.deepen
  if (Array.isArray(wanted)) {
    for (const k of wanted) if (typeof k === 'string' && k) deepen.add(k)
  }

  // Everything from the root '{' onward. Kept whole because a completed value
  // is a SLICE of it, and a value can span any number of chunks.
  let buf = ''
  // Text seen before the root '{' was found — a ```json fence, a stray "Here
  // is the document:", whatever. Held only until the brace shows up.
  let preamble = ''
  let started = false

  let i = 0            // cursor into buf; only ever moves forward
  let depth = 0        // 1 === directly inside the root object
  let inString = false
  let esc = false      // previous character was a backslash INSIDE a string

  // 'key'        — at depth 1, expecting a key string (or the closing brace)
  // 'afterKey'   — key read, expecting ':'
  // 'value'      — after ':', reading the value
  // 'afterValue' — value closed, expecting ',' or '}'
  let mode = 'key'

  let keyStart = -1    // index of the opening quote of the current key
  let curKey = null    // the parsed current key
  let valStart = -1    // index of the first character of the current value
  let valIsString = false

  let rootClosed = false
  let dead = false     // an unrecoverable parse position; stop emitting

  const emitted = []
  const seen = new Set()      // depth-1 values already emitted IN FULL
  const reported = new Set()  // keys handed to the caller at least once

  /* --- deepening state: a second, identical state machine one level in ---
   * These are live only while the cursor is inside a deepened key's object.
   * Every branch that reads them also checks `depth === 2`, so anything nested
   * deeper is skipped exactly the way depth-1 parsing skips depth 2. */
  let deepening = false
  let deepKey = null      // the depth-1 key currently being deepened
  let deepChildren = null // children parsed so far, in written order
  let d2mode = 'key'      // same vocabulary as `mode`, one level in
  let d2keyStart = -1
  let d2key = null
  let d2valStart = -1
  let d2valIsString = false

  function endDeepen() {
    deepening = false
    deepKey = null
    deepChildren = null
    d2mode = 'key'
    d2keyStart = -1
    d2key = null
    d2valStart = -1
    d2valIsString = false
  }

  /** Record a key as reported, preserving first-seen order, without duplicates. */
  function report(key) {
    if (reported.has(key)) return
    reported.add(key)
    emitted.push(key)
  }

  /** Slice a completed depth-1 value out of buf and parse it. */
  function complete(endExclusive, out) {
    const key = curKey
    curKey = null
    const start = valStart
    valStart = -1
    valIsString = false
    mode = 'afterValue'
    endDeepen()
    if (!key || start < 0 || seen.has(key)) return
    const raw = buf.slice(start, endExclusive).trim()
    if (!raw) return
    let value
    try {
      value = JSON.parse(raw)
    } catch {
      // The slice did not parse. That is a bug in this extractor or a
      // genuinely malformed document; either way the answer is the same —
      // say nothing about this key and let the real parse downstream decide.
      return
    }
    // seen is set here and only here: the FULL value has now gone out, so any
    // later repeat of this top-level key is the duplicate we drop.
    seen.add(key)
    report(key)
    out.push({ key, value })
  }

  /**
   * A child of a deepened key just closed. Fold it in and re-emit the parent
   * under its own name with everything gathered so far.
   *
   * This deliberately does NOT set `seen`: the parent has not finished, and its
   * complete value must still be emitted when it does.
   */
  function completeChild(endExclusive, out) {
    const key = d2key
    d2key = null
    const start = d2valStart
    d2valStart = -1
    d2valIsString = false
    d2mode = 'afterValue'
    if (!deepening || !deepKey || !key || start < 0) return
    // The parent already went out whole (a repeated top-level key); adding to it
    // now would redraw a section the renderer has settled.
    if (seen.has(deepKey)) return
    const raw = buf.slice(start, endExclusive).trim()
    if (!raw) return
    let value
    try {
      value = JSON.parse(raw)
    } catch {
      return
    }
    deepChildren[key] = value
    report(deepKey)
    // A fresh shallow copy per emission — the caller must never be handed an
    // object that keeps growing under it after it has rendered.
    out.push({ key: deepKey, value: { ...deepChildren } })
  }

  function push(chunk) {
    const out = []
    if (dead || rootClosed) return out
    if (typeof chunk !== 'string' || chunk === '') return out

    if (!started) {
      preamble += chunk
      const at = preamble.indexOf('{')
      if (at === -1) {
        // Don't hold an unbounded preamble if the model never opens an object.
        if (preamble.length > 1_000_000) dead = true
        return out
      }
      buf = preamble.slice(at)
      preamble = ''
      started = true
      i = 1
      depth = 1
      mode = 'key'
    } else {
      buf += chunk
    }

    while (i < buf.length) {
      const c = buf[i]

      if (inString) {
        if (esc) {
          esc = false
        } else if (c === '\\') {
          esc = true
        } else if (c === '"') {
          inString = false
          if (depth === 1 && mode === 'key') {
            try {
              curKey = JSON.parse(buf.slice(keyStart, i + 1))
            } catch {
              curKey = null
            }
            if (typeof curKey !== 'string') curKey = null
            mode = 'afterKey'
          } else if (depth === 1 && mode === 'value' && valIsString) {
            // A string value at depth 1 ends at its closing quote — no comma
            // required, which matters for the LAST key in the object.
            complete(i + 1, out)
          } else if (deepening && depth === 2 && d2mode === 'key') {
            try {
              d2key = JSON.parse(buf.slice(d2keyStart, i + 1))
            } catch {
              d2key = null
            }
            if (typeof d2key !== 'string') d2key = null
            d2mode = 'afterKey'
          } else if (deepening && depth === 2 && d2mode === 'value' && d2valIsString) {
            completeChild(i + 1, out)
          }
        }
        i += 1
        continue
      }

      if (c === '"') {
        inString = true
        esc = false
        if (depth === 1 && mode === 'key') {
          keyStart = i
        } else if (depth === 1 && mode === 'value' && valStart === -1) {
          valStart = i
          valIsString = true
        } else if (deepening && depth === 2 && d2mode === 'key') {
          d2keyStart = i
        } else if (deepening && depth === 2 && d2mode === 'value' && d2valStart === -1) {
          d2valStart = i
          d2valIsString = true
        }
        i += 1
        continue
      }

      if (c === '{' || c === '[') {
        if (depth === 1 && mode === 'value' && valStart === -1) {
          valStart = i
          valIsString = false
          // An OBJECT value under a deepened key: start reporting its children
          // as they close. An array is left alone — a half-filled array has no
          // unambiguous partial form, so it waits for depth 1 like everything else.
          if (c === '{' && curKey && deepen.has(curKey) && !seen.has(curKey)) {
            deepening = true
            deepKey = curKey
            deepChildren = {}
            d2mode = 'key'
            d2keyStart = -1
            d2key = null
            d2valStart = -1
            d2valIsString = false
          }
        } else if (deepening && depth === 2 && d2mode === 'value' && d2valStart === -1) {
          d2valStart = i
          d2valIsString = false
        }
        depth += 1
        i += 1
        continue
      }

      if (c === '}' || c === ']') {
        depth -= 1
        if (deepening && depth === 2 && d2mode === 'value' && d2valStart !== -1) {
          // A child object/array just closed back to the deepened container.
          completeChild(i + 1, out)
        }
        // Nothing is done for a trailing bare scalar child — `…,"christPathway":
        // null}` closes on the same character as the container, and the depth-1
        // completion immediately below emits the parent WHOLE, parsed from the
        // whole slice. Emitting a partial first would only redraw the section
        // twice on the same character.
        if (depth === 1 && mode === 'value' && valStart !== -1) {
          // A nested object/array value just closed back to the root level.
          complete(i + 1, out)
        } else if (depth === 0) {
          // The root object closed. A bare scalar can still be open here —
          // {"a": 1} ends the value and the object on the same character.
          if (mode === 'value' && valStart !== -1 && !valIsString) complete(i, out)
          rootClosed = true
          i += 1
          break
        } else if (depth < 0) {
          dead = true
          break
        }
        i += 1
        continue
      }

      if (c === ':' && depth === 1 && mode === 'afterKey') {
        mode = 'value'
        valStart = -1
        valIsString = false
        i += 1
        continue
      }

      if (c === ':' && deepening && depth === 2 && d2mode === 'afterKey') {
        d2mode = 'value'
        d2valStart = -1
        d2valIsString = false
        i += 1
        continue
      }

      if (c === ',' && depth === 1) {
        if (mode === 'value' && valStart !== -1 && !valIsString) complete(i, out)
        mode = 'key'
        i += 1
        continue
      }

      if (c === ',' && deepening && depth === 2) {
        if (d2mode === 'value' && d2valStart !== -1 && !d2valIsString) completeChild(i, out)
        d2mode = 'key'
        i += 1
        continue
      }

      if (isWhitespace(c)) {
        i += 1
        continue
      }

      // Anything else at depth 1 inside a value is the first character of a
      // bare scalar — a number, true, false, null. It completes at the next
      // ',' or '}', which is handled above.
      if (depth === 1 && mode === 'value' && valStart === -1) {
        valStart = i
        valIsString = false
      } else if (deepening && depth === 2 && d2mode === 'value' && d2valStart === -1) {
        // The same, one level in: a scalar child of a deepened key.
        d2valStart = i
        d2valIsString = false
      }
      i += 1
    }

    return out
  }

  return {
    push,
    done: () => ({ rootClosed, keys: emitted.slice() }),
    keys: () => emitted.slice(),
  }
}

module.exports = { createSectionExtractor }
