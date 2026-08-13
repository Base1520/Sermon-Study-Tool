// Entitlement and pricing-ladder tests. No network, no API cost.
//
// The invariant that matters most here is the one a badly-priced overage
// breaks: every tier must be CHEAPER PER STUDY than a top-up. Get that
// backwards and a rational customer buys the smallest plan forever and tops up,
// which quietly replaces recurring revenue with lumpy one-off purchases.
//
//   node server/src/test-entitlement.js

const {
  PLANS,
  TOPUP,
  entitlementFor,
  upgradePrompt,
  perStudy,
  monthlyPriceUsd,
  annualSavingsUsd,
} = require('./entitlement')

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

console.log('\nTHE PRICING LADDER POINTS THE RIGHT WAY')
{
  const topup = TOPUP.priceUsd / TOPUP.studies
  for (const key of ['starter', 'standard', 'heavy']) {
    const rate = perStudy(key)
    ok(`${PLANS[key].label} is cheaper per study than a top-up`,
      rate < topup, `$${rate.toFixed(2)} vs $${topup.toFixed(2)}`)
  }
  ok('bigger tiers are cheaper per study than smaller ones',
    perStudy('starter') > perStudy('standard') && perStudy('standard') > perStudy('heavy'),
    `${perStudy('starter').toFixed(2)} > ${perStudy('standard').toFixed(2)} > ${perStudy('heavy').toFixed(2)}`)

  // The cannibalisation check, stated as money rather than as a rate.
  // Reaching Heavy's volume by stacking top-ups onto Starter must cost MORE
  // than simply buying Heavy, or nobody will ever buy Heavy.
  const need = PLANS.heavy.studiesPerMonth
  const viaTopups = PLANS.starter.priceUsd +
    Math.ceil((need - PLANS.starter.studiesPerMonth) / TOPUP.studies) * TOPUP.priceUsd
  ok('reaching Heavy volume via top-ups costs MORE than buying Heavy',
    viaTopups > PLANS.heavy.priceUsd, `$${viaTopups} vs $${PLANS.heavy.priceUsd}`)
}

console.log('\nEVERY MONTHLY TIER SURVIVES A USER WHO MAXES IT OUT')
{
  // $0.42 is the upper-bound estimate for a cold study; Stripe takes 2.9% + 30c
  // plus the 0.7% Billing fee. If a tier is profitable here it is profitable in
  // reality, because almost nobody maxes out.
  const COST = 0.42
  for (const key of ['starter', 'standard', 'heavy']) {
    const p = PLANS[key]
    const stripe = p.priceUsd * 0.029 + 0.30 + p.priceUsd * 0.007
    const net = p.priceUsd - stripe - p.studiesPerMonth * COST
    ok(`${p.label} is profitable at 100% usage`, net > 0,
      `net $${net.toFixed(2)}`)
  }

  for (const key of ['starter_annual', 'standard_annual', 'heavy_annual']) {
    const p = PLANS[key]
    const stripe = p.priceUsd * 0.029 + 0.30 + p.priceUsd * 0.007
    const net = p.priceUsd - stripe - p.studiesPerMonth * 12 * COST
    ok(`${p.label} annual is profitable at 100% usage all year`, net > 0,
      `net $${net.toFixed(2)}`)
  }
}

console.log('\nANNUAL BILLING NEVER BECOMES AN ANNUAL USAGE BUCKET')
{
  const expected = {
    starter: { annual: 299.99, monthly: 299.99 / 12, saving: 59.89 },
    standard: { annual: 499.99, monthly: 499.99 / 12, saving: 99.89 },
    heavy: { annual: 1649.99, monthly: 1649.99 / 12, saving: 149.89 },
  }
  for (const [family, values] of Object.entries(expected)) {
    const monthly = PLANS[family]
    const annual = PLANS[`${family}_annual`]
    ok(`${annual.label} annual charges $${values.annual} once a year`,
      annual.priceUsd === values.annual && annual.billingInterval === 'year')
    ok(`${annual.label} annual keeps ${monthly.studiesPerMonth} studies each month`,
      annual.studiesPerMonth === monthly.studiesPerMonth)
    ok(`${annual.label} annual has the intended monthly equivalent`,
      Math.abs(monthlyPriceUsd(annual) - values.monthly) < 1e-9)
    ok(`${annual.label} annual saves $${values.saving} against twelve monthly payments`,
      annualSavingsUsd(annual) === values.saving)
  }
}

console.log('\nDOWNLOAD AND IT WORKS — no account, no key')
{
  const anon = entitlementFor(null)
  ok('an unknown user still gets the library', anon.library)
  ok('and one live study, ever', anon.lifetimeStudies === 1)
  ok('but no monthly allowance', anon.allowance === 0)
  ok('and is not marked as paying', !anon.paying)
}

console.log('\nAN ACCOUNT OUT OF STEP WITH STRIPE DEGRADES, NEVER ERRORS')
{
  ok('an unknown plan falls back to free', entitlementFor({ plan: 'enterprise-galactic' }).plan === 'free')
  ok('a missing status is not treated as paying', !entitlementFor({ plan: 'standard' }).paying)
  ok('a past_due account stops getting an allowance',
    entitlementFor({ plan: 'standard', status: 'past_due' }).allowance === 0)
  ok('...but keeps the library', entitlementFor({ plan: 'standard', status: 'past_due' }).library)
  ok('a canceled account gets no allowance',
    entitlementFor({ plan: 'heavy', status: 'canceled' }).allowance === 0)
}

console.log('\nA PAYING ACCOUNT GETS WHAT IT PAID FOR')
{
  const e = entitlementFor({ plan: 'standard', status: 'active' })
  ok('paying is recognised', e.paying)
  ok('the allowance matches the plan', e.allowance === PLANS.standard.studiesPerMonth)
  ok('the per-study rate is exposed', Math.abs(e.perStudyUsd - 49.99 / 80) < 1e-9)

  const annual = entitlementFor({ plan: 'standard_annual', status: 'active' })
  ok('annual billing is recognised as paying', annual.paying)
  ok('annual billing exposes the same monthly allowance', annual.allowance === 80)
  ok('annual billing is named plainly', annual.billingInterval === 'year' && /annual/.test(annual.label))
}

console.log('\nTHE UPGRADE PROMPT LEADS WITH WHAT HE STILL HAS')
{
  const free = upgradePrompt(entitlementFor(null))
  ok('the free prompt names the moment plainly', free.code === 'FREE_STUDY_SPENT')
  ok('it says the study STAYS', /stays here/i.test(free.body))
  ok('it offers a way forward', free.actions.length >= 2)

  const paid = upgradePrompt(entitlementFor({ plan: 'starter', status: 'active' }))
  ok('the paid prompt names the number', /40 studies/.test(paid.headline))
  ok('it reassures before it sells', /nothing you paid for goes away/i.test(paid.body))
  ok('a top-up is offered', paid.actions.some(a => a.kind === 'topup'))
  ok('and an upgrade, since Starter is not the top tier',
    paid.actions.some(a => a.kind === 'upgrade'))

  const top = upgradePrompt(entitlementFor({ plan: 'heavy', status: 'active' }))
  ok('the top tier is not told to upgrade to nothing',
    !top.actions.some(a => a.kind === 'upgrade'))

  const annual = upgradePrompt(entitlementFor({ plan: 'starter_annual', status: 'active' }))
  ok('an annual upgrade stays annual',
    annual.actions.some(a => a.kind === 'upgrade' && a.plan === 'standard_annual'))
}

console.log('\nNOTHING AUTO-CHARGES')
{
  const paid = upgradePrompt(entitlementFor({ plan: 'starter', status: 'active' }))
  const topup = paid.actions.find(a => a.kind === 'topup')
  ok('the top-up is an explicit action, not a setting', Boolean(topup))
  ok('its price is stated up front', /\$15/.test(topup.label))
  ok('no action implies an automatic charge',
    !paid.actions.some(a => /auto|automatic/i.test(a.label)))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
