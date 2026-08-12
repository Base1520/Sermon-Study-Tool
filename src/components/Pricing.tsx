import { useEffect, useState } from 'react'
import { BASE, FONT } from '../theme'

export interface Plan {
  label: string
  family?: string
  priceUsd: number
  studiesPerMonth: number
  billingInterval?: 'month' | 'year' | null
  monthlyEquivalentUsd?: number | null
  annualSavingsUsd?: number
  hidden?: boolean
}

interface Props {
  plans: Record<string, Plan>
  currentPlan?: string
  busy?: boolean
  onChoose: (planKey: string) => void
  headline?: string
  body?: string
  onChurch?: () => void
}

const FAMILY_ORDER = ['starter', 'standard', 'heavy']

const FOR_WHOM: Record<string, string> = {
  starter: 'Sunday, plus the passages around it. About nine or ten a week.',
  standard: 'Preaching and teaching in the same week — a series, a class, or a study you are working ahead on.',
  heavy: 'Daily study, or a writing project. Ten a day, every day, without watching the number.',
}

const cycleFromPlan = (plan?: string) => plan?.endsWith('_annual') ? 'year' : 'month'
const keyFor = (family: string, cycle: 'month' | 'year') =>
  cycle === 'year' ? `${family}_annual` : family

export function Pricing({ plans, currentPlan, busy, onChoose, headline, body, onChurch }: Props) {
  const [cycle, setCycle] = useState<'month' | 'year'>(() => cycleFromPlan(currentPlan))

  useEffect(() => {
    if (currentPlan && currentPlan !== 'free' && currentPlan !== 'comp') {
      setCycle(cycleFromPlan(currentPlan))
    }
  }, [currentPlan])

  const visiblePlans = FAMILY_ORDER
    .map((family) => [keyFor(family, cycle), plans[keyFor(family, cycle)]] as const)
    .filter((entry): entry is readonly [string, Plan] => Boolean(entry[1] && !entry[1].hidden))

  if (!visiblePlans.length) return null

  const monthlyEquivalent = (plan: Plan) =>
    plan.monthlyEquivalentUsd ?? plan.priceUsd / (plan.billingInterval === 'year' ? 12 : 1)
  const perStudy = (plan: Plan) => monthlyEquivalent(plan) / plan.studiesPerMonth
  const starter = plans[keyFor('starter', cycle)]
  const baseRate = starter ? perStudy(starter) : Math.max(...visiblePlans.map(([, plan]) => perStudy(plan)))

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
          textAlign: 'center', maxWidth: 520, margin: '0 auto 18px',
        }}>{body}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <div style={{
          display: 'inline-grid', gridTemplateColumns: '1fr 1fr', gap: 3,
          background: BASE.bg, border: `1px solid ${BASE.border}`,
          borderRadius: 5, padding: 3,
        }}>
          {(['month', 'year'] as const).map((value) => {
            const active = cycle === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCycle(value)}
                disabled={busy}
                style={{
                  minWidth: 128, border: 'none', borderRadius: 3, padding: '9px 14px',
                  cursor: busy ? 'default' : 'pointer',
                  background: active ? BASE.gold : 'transparent',
                  color: active ? BASE.bg : BASE.boneMid,
                  font: `700 10px ${FONT.mono}`, letterSpacing: '0.1em',
                }}
              >
                {value === 'month' ? 'MONTHLY' : 'ANNUAL · SAVE'}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{
        font: `400 11px/1.55 ${FONT.mono}`, color: BASE.steel,
        textAlign: 'center', margin: '0 auto 20px', maxWidth: 620,
      }}>
        {cycle === 'year'
          ? 'Pay once for the year. Your study allowance still resets every month — annual billing never becomes one giant usage bucket.'
          : 'Pay month to month. Switch plans or cancel renewal from Stripe.'}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 12,
        alignItems: 'stretch',
      }}>
        {visiblePlans.map(([key, plan]) => {
          const family = plan.family || key.replace('_annual', '')
          const monthly = monthlyEquivalent(plan)
          const rate = perStudy(plan)
          const tierSaving = Math.round((1 - rate / baseRate) * 100)
          const annualSaving = plan.annualSavingsUsd || 0
          const featured = family === 'standard'
          const isCurrent = currentPlan === key

          return (
            <button
              key={key}
              disabled={busy || isCurrent}
              onClick={() => onChoose(key)}
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                textAlign: 'left', background: featured ? BASE.bgCard : BASE.bg,
                border: `1px solid ${featured ? BASE.gold : BASE.border}`, borderRadius: 6,
                padding: featured ? '26px 18px 18px' : '20px 18px 18px',
                marginTop: featured ? -6 : 0,
                cursor: busy || isCurrent ? 'default' : 'pointer', opacity: busy ? 0.55 : 1,
                boxShadow: featured ? '0 10px 30px rgba(0,0,0,0.35)' : 'none',
                transition: 'transform 0.12s ease, border-color 0.12s ease',
              }}
              onMouseEnter={(event) => {
                if (!busy && !isCurrent) event.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(event) => { event.currentTarget.style.transform = 'translateY(0)' }}
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
                <span style={{ font: `400 12px ${FONT.mono}`, color: BASE.steel }}>
                  /{cycle === 'year' ? 'year' : 'month'}
                </span>
              </div>

              {cycle === 'year' && (
                <div style={{ font: `600 11px ${FONT.mono}`, color: BASE.gold, margin: '3px 0 6px' }}>
                  ${Number.isInteger(monthly) ? monthly : monthly.toFixed(2)}/month effective
                </div>
              )}

              <div style={{ font: `400 13px ${FONT.mono}`, color: BASE.boneMid, marginBottom: 12 }}>
                {plan.studiesPerMonth} studies every month
              </div>

              <div style={{ borderTop: `1px solid ${BASE.borderDim}`, paddingTop: 10, marginBottom: 12 }}>
                <div style={{ font: `600 13px ${FONT.mono}`, color: BASE.bone }}>
                  ${rate.toFixed(2)}
                  <span style={{ font: `400 11px ${FONT.mono}`, color: BASE.steel }}> per study</span>
                </div>
                {cycle === 'year' && annualSaving > 0 ? (
                  <div style={{
                    display: 'inline-block', marginTop: 6,
                    font: `700 9px ${FONT.mono}`, letterSpacing: '0.1em',
                    color: BASE.gold, background: BASE.goldDim,
                    border: `1px solid ${BASE.borderGold}`, padding: '3px 7px', borderRadius: 3,
                  }}>
                    SAVE ${annualSaving}/YEAR
                  </div>
                ) : tierSaving > 0 ? (
                  <div style={{
                    display: 'inline-block', marginTop: 6,
                    font: `700 9px ${FONT.mono}`, letterSpacing: '0.1em',
                    color: BASE.gold, background: BASE.goldDim,
                    border: `1px solid ${BASE.borderGold}`, padding: '3px 7px', borderRadius: 3,
                  }}>
                    SAVE {tierSaving}% PER STUDY
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
                {FOR_WHOM[family]}
              </div>

              <div style={{
                font: `700 10px ${FONT.mono}`, letterSpacing: '0.1em', textAlign: 'center',
                color: isCurrent ? BASE.steel : (featured ? BASE.bg : BASE.bone),
                background: isCurrent ? 'transparent' : (featured ? BASE.gold : BASE.green),
                border: `1px solid ${isCurrent ? BASE.border : (featured ? BASE.gold : BASE.borderGold)}`,
                borderRadius: 4, padding: '11px 8px',
              }}>
                {isCurrent ? 'YOUR PLAN' : `CHOOSE ${cycle === 'year' ? 'ANNUAL' : 'MONTHLY'}`}
              </div>
            </button>
          )
        })}
      </div>

      <div style={{
        font: `400 11px/1.6 ${FONT.mono}`, color: BASE.steel,
        textAlign: 'center', marginTop: 14,
      }}>
        One person per subscription. Monthly allowances reset on the first of each month;
        unused studies do not roll forward. Everything already studied stays yours.
      </div>

      {onChurch && (
        <button
          onClick={onChurch}
          disabled={busy}
          style={{
            width: '100%', marginTop: 14, textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 14,
            background: BASE.bg, border: `1px dashed ${BASE.border}`,
            borderRadius: 6, padding: '16px 18px', cursor: busy ? 'default' : 'pointer',
          }}
          onMouseEnter={(event) => { if (!busy) event.currentTarget.style.borderColor = BASE.borderGold }}
          onMouseLeave={(event) => { event.currentTarget.style.borderColor = BASE.border }}
        >
          <div style={{ flex: 1 }}>
            <div style={{
              font: `700 9px ${FONT.mono}`, letterSpacing: '0.16em',
              color: BASE.gold, marginBottom: 6,
            }}>
              FOR A CHURCH OR A TEAM
            </div>
            <div style={{ font: `400 12.5px/1.55 ${FONT.serif}`, color: BASE.boneMid }}>
              Every person on your staff gets their own account and their own studies —
              one code, one invoice, no shared logins. Tell us how your team works and
              we will price it for your church.
            </div>
          </div>
          <div style={{
            font: `700 10px ${FONT.mono}`, letterSpacing: '0.1em', whiteSpace: 'nowrap',
            color: BASE.bone, background: BASE.green,
            border: `1px solid ${BASE.borderGold}`, borderRadius: 4, padding: '11px 14px',
          }}>
            GET A QUOTE
          </div>
        </button>
      )}
    </div>
  )
}
