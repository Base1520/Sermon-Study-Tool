/**
 * SituationCard.tsx — the briefing that runs before the passage.
 *
 * WHY IT IS FIRST. A reader who does not know what was pressing on the first
 * hearers will read their own pressure into the text and never notice they did
 * it. Everything below this card — the passage, the outline, the six steps —
 * assumes the reader has been told what room they are walking into. So it sits
 * above the passage, and it is built to be read in about eight seconds: two
 * tight labels, one paragraph, one payoff line.
 *
 * WHAT IT IS NOT. It is not an introduction, not a warm-up, and not delivery
 * apparatus. It states a setting and says what the setting changes.
 *
 * ON CONFIDENCE. Most historical settings in the Bible are reconstructions —
 * built out of the letter itself plus what is known of the period — and a
 * reader is owed that distinction. It is shown as one quiet word, never as a
 * percentage, a bar, or a score, because dressing a reconstruction up as a
 * measurement is a worse lie than saying nothing. When it is not 'documented'
 * a single dim line at the foot says plainly what that means.
 *
 * ON vaultSourced. It is internal. It gets no label, no mark, no tooltip, and
 * no styling difference. It is not read in this file at all.
 */

import { useState } from 'react'
import { BASE } from '../theme'
import type { PlainReadSituation, SituationConfidence } from '../types/phrasing'

/**
 * What each confidence word means, in the reader's terms.
 *
 * `documented` gets no line. Saying "this is documented" under a documented
 * setting is noise, and the word in the header already carries it.
 */
const CONFIDENCE_NOTE: Record<SituationConfidence, string | null> = {
  documented: null,
  reconstructed:
    'Reconstructed. The text and the period give enough to build this; no outside record states it ' +
    'outright. Take it as the best available account of the room, not as a record of it.',
  uncertain:
    'Uncertain. Careful readers place this differently, and the passage has to make sense on more ' +
    'than one setting. Do not let the setting carry weight the text itself does not.',
}

/** Blank-safe. A field the engine left empty is skipped, not rendered empty. */
function has(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0
}

function Label({ children }: { children: string }) {
  return (
    <div style={{
      fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.18em',
      color: BASE.steel, textTransform: 'uppercase',
      flexShrink: 0, width: 44, paddingTop: 2,
    }}>
      {children}
    </div>
  )
}

/**
 * when / where render in mono, not serif. That is deliberate: it is the
 * difference between a briefing and an essay, and it is the one visual cue
 * that says "these two lines are facts, the paragraph below is reading".
 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 7 }}>
      <Label>{label}</Label>
      <div style={{
        fontFamily: 'JetBrains Mono', fontSize: 10.5, lineHeight: 1.55,
        color: BASE.khaki, letterSpacing: '0.01em', minWidth: 0,
      }}>
        {value}
      </div>
    </div>
  )
}

export function SituationCard({ situation }: { situation: PlainReadSituation | null | undefined }) {
  /* Expanded by default, always. This is the one block that must be on screen
     when the document first paints — a reader who has to open it to find out
     the passage was written from a prison cell has already read it wrong. */
  const [open, setOpen] = useState(true)

  if (!situation) return null

  const { when, where, pressure, soWhat } = situation
  /* An engine that sends an unrecognised value is treated as a reconstruction
     rather than as documented. The safe direction to fail is toward telling the
     reader the setting is built rather than found. */
  const confidence: SituationConfidence =
    situation.confidence === 'documented' || situation.confidence === 'uncertain'
      ? situation.confidence
      : 'reconstructed'

  // Nothing to brief with. Render nothing rather than an empty card.
  if (!has(when) && !has(where) && !has(pressure) && !has(soWhat)) return null

  const note = CONFIDENCE_NOTE[confidence]

  return (
    <section style={{
      border: `1px solid ${BASE.border}`,
      background: `${BASE.bgCard}aa`,
      marginBottom: 30,
    }}>
      {/* ── Header. The whole bar is the toggle, so the target is the width of
             the card rather than a 12px chevron. Collapsed, it still carries
             `when` — the card can be shut, but the date cannot go missing. ── */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) }
        }}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 12, cursor: 'pointer',
          padding: '11px 16px',
          borderBottom: open ? `1px solid ${BASE.borderDim}` : 'none',
          outline: 'none',
        }}
        onFocus={e => { (e.currentTarget as HTMLElement).style.boxShadow = `inset 0 0 0 1px ${BASE.borderGold}` }}
        onBlur={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
      >
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 7.5, letterSpacing: '0.2em',
          color: BASE.gold, textTransform: 'uppercase', flexShrink: 0,
        }}>
          Before you read this
        </span>

        {/* The collapsed summary. Present only when shut, so the header does
            not say the same thing twice. */}
        {!open && has(when) && (
          <span style={{
            fontFamily: 'JetBrains Mono', fontSize: 8.5, letterSpacing: '0.04em',
            color: BASE.khaki, whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis', minWidth: 0, flex: 1,
          }}>
            {when}
          </span>
        )}

        <span style={{ flex: open ? 1 : undefined }} />

        {/* Quiet, and not hidden. No border, no fill, no colour weight — it
            reads as metadata, which is what it is. */}
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.14em',
          color: confidence === 'documented' ? BASE.steel : BASE.khaki,
          textTransform: 'uppercase', flexShrink: 0, opacity: 0.9,
        }}>
          {confidence}
        </span>

        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 10, color: BASE.steel,
          flexShrink: 0, width: 10, textAlign: 'center', lineHeight: 1,
        }}>
          {open ? '−' : '+'}
        </span>
      </div>

      {open && (
        <div style={{ padding: '14px 16px 16px' }}>
          {has(when)  && <Field label="When"  value={when} />}
          {has(where) && <Field label="Where" value={where} />}

          {has(pressure) && (
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 16, lineHeight: 1.75,
              color: BASE.boneMid, marginTop: 13,
            }}>
              {pressure}
            </div>
          )}

          {/* The payoff. Set apart on the gold rule, because this is the line
              that changes how the passage below gets read — the rest of the
              card is the setup for it. */}
          {has(soWhat) && (
            <div style={{
              marginTop: 15, borderLeft: `2px solid ${BASE.gold}`,
              background: BASE.goldDim, padding: '11px 14px',
            }}>
              <div style={{
                fontFamily: 'JetBrains Mono', fontSize: 7, letterSpacing: '0.18em',
                color: BASE.gold, textTransform: 'uppercase', marginBottom: 6,
              }}>
                So what
              </div>
              <div style={{
                fontFamily: 'Crimson Pro, serif', fontSize: 16.5, lineHeight: 1.7,
                color: BASE.bone,
              }}>
                {soWhat}
              </div>
            </div>
          )}

          {note && (
            <div style={{
              marginTop: 14, paddingTop: 11, borderTop: `1px solid ${BASE.borderDim}`,
              fontFamily: 'Crimson Pro, serif', fontSize: 13.5, lineHeight: 1.65,
              color: BASE.steel,
            }}>
              {note}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
