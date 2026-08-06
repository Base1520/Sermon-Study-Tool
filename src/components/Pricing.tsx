import { BASE, FONT } from '../theme'

/**
 * Pricing — three plans, side by side, with the saving made obvious.
 *
 * THE ONE JOB: make the comparison do the selling. The tiers are already priced
 * so that going up is cheaper per study, and that fact was invisible — the old
 * panel listed three prices in a row and left the reader to divide. Nobody
 * divides. So the per-study number and the percentage saved are printed on the
 * card, and Standard is marked because it is the honest recommendation for a man
 * who preaches weekly and studies more than he expects to.
 *
 * SAVINGS ARE COMPUTED, NEVER TYPED. Every figure here is derived from the
 * server's own priceUsd/studiesPerMonth. If Cole re-prices a tier, the badges
 * follow automatically — a hardcoded "SAVE 17%" that survives a price change is
 * a lie printed on the checkout screen.
 */

export interface Plan {
  label: string
  priceUsd: number
  studiesPerMonth: number
}

interface Props {
  plans: Record<string, Plan>
  currentPlan?: string
  busy?: boolean
  onChoose: (planKey: string) => void
  /** Shown above the cards when the server sent a refusal with its own words. */
  headline?: string
  body?: string
}

const ORDER = ['starter', 'standard', 'heavy']

/** Why each tier exists, in the terms a preacher actually thinks in. */
const FOR_WHOM: Record<string, string> = {
  starter: 'One sermon a week, with room to chase a tangent.',
  standard: 'Weekly preaching plus a class, a study, or a series you are working ahead on.',
  heavy: 'A teaching pastor, a staff sharing one login, or a writing project.',
}

export function Pricing({ plans, currentPlan, busy, onChoose, headline, body }: Props) {
  const tiers = ORDER.map((key) => plans[key]).filter(Boolean)
  if (!tiers.length) return null

  // The baseline every saving is measured against — the cheapest entry tier,
  // taken from the data rather than assumed to be 'starter'.
  const perStudy = (p: Plan) => p.priceUsd / p.studiesPerMonth
  const base = Math.max(...ORDER.map((k) => (plans[k] ? perStudy(plans[k]) : 0)))

  return (
    <div>
      {headline && (
        <div style={{
          font: `600 19px ${FONT.display}`, color: BASE.bone,
          textAlign: 'center', marginBottom: 6,
        }}>{headline}</div>
      )}
      {body && (
        <div style={{
          font: `400 14px/1.6 ${FONT.serif}`, color: BASE.boneMid,
          textAlign: 'center', maxWidth: 460, margin: '0 auto 22px',
        }}>{body}</div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tiers.length}, 1fr)`,
        gap: 12,
        alignItems: 'stretch',
      }}>
        {ORDER.map((key) => {
          const plan = plans[key]
          if (!plan) return null

          const per = perStudy(plan)
          const saved = Math.round((1 - per / base) * 100)
          const featured = key === 'standard'
          const isCurrent = currentPlan === key

          return (
            <button
              key={key}
              disabled={busy || isCurrent}
              onClick={() => onChoose(key)}
              style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                textAlign: 'left',
                background: featured ? BASE.bgCard : BASE.bg,
                border: `1px solid ${featured ? BASE.gold : BASE.border}`,
                borderRadius: 6,
                // The featured card sits a little proud of the others rather
                // than being a different colour — louder is not clearer.
                padding: featured ? '26px 18px 18px' : '20px 18px 18px',
                marginTop: featured ? -6 : 0,
                cursor: busy || isCurrent ? 'default' : 'pointer',
                opacity: busy ? 0.55 : 1,
                boxShadow: featured ? `0 10px 30px rgba(0,0,0,0.35)` : 'none',
                transition: 'transform 0.12s ease, border-color 0.12s ease',
              }}
              onMouseEnter={(e) => { if (!busy && !isCurrent) e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
            >
              {featured && (
                <div style={{
                  position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
                  font: `700 8px ${FONT.mono}`, letterSpacing: '0.16em',
                  color: BASE.bg, background: BASE.gold,
                  padding: '3px 10px', borderRadius: 3, whiteSpace: 'nowrap',
                }}>
                  MOST CHOOSE THIS
                </div>
              )}

              <div style={{
                font: `700 9px ${FONT.mono}`, letterSpacing: '0.16em',
                color: featured ? BASE.gold : BASE.steel, marginBottom: 8,
              }}>
                {plan.label.toUpperCase()}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 2 }}>
                <span style={{ font: `700 30px ${FONT.display}`, color: BASE.bone, lineHeight: 1 }}>
                  ${plan.priceUsd}
                </span>
                <span style={{ font: `400 12px ${FONT.mono}`, color: BASE.steel }}>/mo</span>
              </div>

              <div style={{ font: `400 13px ${FONT.mono}`, color: BASE.boneMid, marginBottom: 12 }}>
                {plan.studiesPerMonth} studies a month
              </div>

              {/* THE COMPARISON, which is the whole point of showing three. */}
              <div style={{
                borderTop: `1px solid ${BASE.borderDim}`,
                paddingTop: 10, marginBottom: 12,
              }}>
                <div style={{ font: `600 13px ${FONT.mono}`, color: BASE.bone }}>
                  ${per.toFixed(2)}
                  <span style={{ font: `400 11px ${FONT.mono}`, color: BASE.steel }}> per study</span>
                </div>
                {saved > 0 ? (
                  <div style={{
                    display: 'inline-block', marginTop: 6,
                    font: `700 9px ${FONT.mono}`, letterSpacing: '0.1em',
                    color: BASE.gold, background: BASE.goldDim,
                    border: `1px solid ${BASE.borderGold}`,
                    padding: '3px 7px', borderRadius: 3,
                  }}>
                    SAVE {saved}%
                  </div>
                ) : (
                  <div style={{ font: `400 10px ${FONT.mono}`, color: BASE.steel, marginTop: 6 }}>
                    where most people start
                  </div>
                )}
              </div>

              <div style={{
                font: `400 12px/1.55 ${FONT.serif}`, color: BASE.boneMid,
                flex: 1, marginBottom: 14,
              }}>
                {FOR_WHOM[key]}
              </div>

              <div style={{
                font: `700 10px ${FONT.mono}`, letterSpacing: '0.1em', textAlign: 'center',
                color: isCurrent ? BASE.steel : (featured ? BASE.bg : BASE.bone),
                background: isCurrent ? 'transparent' : (featured ? BASE.gold : BASE.green),
                border: `1px solid ${isCurrent ? BASE.border : (featured ? BASE.gold : BASE.borderGold)}`,
                borderRadius: 4, padding: '11px 8px',
              }}>
                {isCurrent ? 'YOUR PLAN' : 'CHOOSE'}
              </div>
            </button>
          )
        })}
      </div>

      <div style={{
        font: `400 11px/1.6 ${FONT.mono}`, color: BASE.steel,
        textAlign: 'center', marginTop: 14,
      }}>
        Cancel any time, from inside the app. Everything you have already studied stays yours.
      </div>
    </div>
  )
}
