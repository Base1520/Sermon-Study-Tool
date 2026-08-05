/**
 * entitlement.js — what a given account is allowed to do, and what it costs.
 *
 * THE SHAPE OF THE PRODUCT, in one file:
 *
 *   Download it and it works. No account, no key, no setup — that is the whole
 *   lesson of the beta, where seven men asked for the tool, two downloaded it,
 *   and none ran a study. The wall was never the app; it was being asked to go
 *   get an API key first.
 *
 *   FREE gets the pre-generated library and ONE live study, ever. The library
 *   costs a fixed amount to build once and serves every free user forever at
 *   zero marginal cost, because a cache hit never touches a model. The single
 *   live study is what makes the free tier honest — a man gets to run HIS OWN
 *   passage, not a demo someone chose for him — and it is bounded: a thousand
 *   free users is a one-time cost, not a recurring one.
 *
 *   PAID gets a monthly allowance. The upgrade prompt appears when the free
 *   study is spent, at the exact moment its value has just been demonstrated.
 *
 * WHY ENTITLEMENT IS SERVER-SIDE AND KEYED TO AN ACCOUNT, NOT A DEVICE:
 * a phone has to be able to pick up the same subscription later. Tie it to a
 * machine and mobile becomes a migration; tie it to an account and mobile is
 * just another sign-in.
 */

/**
 * The tiers. Every allowance is priced so the tier is profitable even if every
 * subscriber maxes it out, and every tier is CHEAPER PER STUDY than buying a
 * top-up — so nobody can save money by staying small and topping up, which is
 * how a badly-priced overage cannibalises its own subscriptions.
 */
/** Where "move up" actually goes. Heavy is the top, so it has no next. */
const NEXT_PLAN_UP = { free: 'starter', starter: 'standard', standard: 'heavy' }

const PLANS = {
  free: {
    label: 'Field',
    priceUsd: 0,
    studiesPerMonth: 0,
    lifetimeStudies: 1,          // one live study, ever — the taste of the real thing
    library: true,
  },
  starter: { label: 'Starter',  priceUsd: 30,  studiesPerMonth: 40,  library: true },
  standard:{ label: 'Standard', priceUsd: 50,  studiesPerMonth: 80,  library: true },
  heavy:   { label: 'Heavy',    priceUsd: 150, studiesPerMonth: 300, library: true },

  /**
   * Comped access. Not for sale and never shown in the plan picker.
   *
   * Exists because the people who most need to use this daily — Cole, Rikki,
   * and anyone he hands a code to — must not be paying Stripe to use their own
   * product, and must not be quietly consuming a paid tier's allowance either.
   * It is a distinct plan rather than "just set them to heavy" so that revenue
   * reporting can tell a customer from a comp, and so a comped account never
   * looks like an active subscription that Stripe will one day fail to renew.
   *
   * The allowance is high but NOT infinite. An unmetered account is a hole in
   * the same global ceiling that protects the Anthropic bill, and a bug in a
   * loop does not care whose account it is running under.
   */
  comp:    { label: 'Comp',     priceUsd: 0,   studiesPerMonth: 500, library: true, hidden: true },
}

/** Bought deliberately, never auto-charged. Priced ABOVE every tier's per-study rate. */
const TOPUP = { label: 'Top-up', priceUsd: 15, studies: 15 }

/** Per-study price at each tier, and the guarantee that the ladder points the right way. */
function perStudy(plan) {
  const p = PLANS[plan]
  if (!p || !p.studiesPerMonth) return null
  return p.priceUsd / p.studiesPerMonth
}

/**
 * Resolve what this account may do right now.
 *
 * Deliberately tolerant of a missing or unknown plan — an account row that has
 * drifted out of step with Stripe should degrade to free, never to an error. A
 * man who cannot be identified still gets the library.
 */
function entitlementFor(account) {
  const planKey = PLANS[account?.plan] ? account.plan : 'free'
  const plan = PLANS[planKey]

  // Status is set explicitly rather than inferred, because Stripe's default
  // grace period leaves a subscription "active" after a card fails — the single
  // most expensive default in this stack for a metered product.
  const paying = planKey !== 'free' && account?.status === 'active'

  return {
    plan: planKey,
    label: plan.label,
    // Carried so callers can tell "never subscribed" from "card just failed".
    // Without it the past_due branch in upgradePrompt could never match, and a
    // lapsed subscriber was shown free-trial copy for a plan he pays for.
    status: account?.status ?? 'none',
    paying,
    library: true,                         // always, for everyone, forever
    allowance: paying ? plan.studiesPerMonth : 0,
    lifetimeStudies: plan.lifetimeStudies ?? 0,
    perStudyUsd: perStudy(planKey),
  }
}

/**
 * The upgrade prompt — what the user is told when the door closes.
 *
 * Two rules, both learned from products that got this wrong:
 *
 *  1. LEAD WITH WHAT HE STILL HAS. Everything already studied stays readable,
 *     forever, licensed or not. It cost real money once and it is his. A paywall
 *     that appears to take something away is the one that gets resented.
 *  2. NEVER AUTO-CHARGE. The top-up is a deliberate two-click purchase. An
 *     unexpected $15 does more damage to a bivocational pastor than a lockout
 *     ever will, and bill shock is the best-documented driver of churn in
 *     usage-priced products.
 */
function upgradePrompt(ent, { used = 0 } = {}) {
  /**
   * A LAPSED CARD IS NOT A FREE TRIAL ENDING.
   *
   * past_due sets paying=false, so a subscriber whose card merely expired fell
   * into the branch below and was told "that was your free study" — about a
   * subscription he has been paying for — and offered buttons that would have
   * started a SECOND subscription alongside the broken one. What he needs is his
   * billing page, not a sales pitch.
   */
  if (ent.status === 'past_due') {
    return {
      code: 'PAYMENT_FAILED',
      headline: 'Your last payment did not go through.',
      body:
        'Everything you have studied is still here, and your plan is waiting — ' +
        'we just could not charge the card on file. Updating it puts you straight back.',
      actions: [{ kind: 'portal', plan: 'portal', label: 'Update payment method' }],
    }
  }

  if (!ent.paying) {
    return {
      code: 'FREE_STUDY_SPENT',
      headline: 'That was your free study.',
      body:
        'It stays here — read it, ask about it, export it, come back to it in a year. ' +
        'So does everything in the library. What a subscription adds is running new ' +
        'passages of your own choosing, whenever you want.',
      actions: [
        { kind: 'subscribe', plan: 'starter',  label: `Starter — $${PLANS.starter.priceUsd}/mo · ${PLANS.starter.studiesPerMonth} studies` },
        { kind: 'subscribe', plan: 'standard', label: `Standard — $${PLANS.standard.priceUsd}/mo · ${PLANS.standard.studiesPerMonth} studies` },
      ],
    }
  }
  return {
    code: 'ALLOWANCE_SPENT',
    headline: `You've used all ${ent.allowance} studies this month.`,
    body:
      'Everything you have already studied is still here — read it, ask about it, ' +
      'export it. Nothing you paid for goes away.',
    // Every action names the thing it DOES. They used to carry only a `kind`,
    // and the renderer keys its buttons off `plan` — so a subscriber who ran out
    // mid-month was shown a heading and no buttons at all, with no way to buy
    // the top-up this very object was offering him.
    actions: [
      { kind: 'topup', plan: 'topup', label: `Add ${TOPUP.studies} studies — $${TOPUP.priceUsd}` },
      ...NEXT_PLAN_UP[ent.plan]
        ? [{
            kind: 'upgrade',
            plan: NEXT_PLAN_UP[ent.plan],
            label: `${PLANS[NEXT_PLAN_UP[ent.plan]].label} — $${PLANS[NEXT_PLAN_UP[ent.plan]].priceUsd}/mo · ` +
                   `${PLANS[NEXT_PLAN_UP[ent.plan]].studiesPerMonth} studies`,
          }]
        : [],
    ],
  }
}

module.exports = { PLANS, TOPUP, entitlementFor, upgradePrompt, perStudy, NEXT_PLAN_UP }
