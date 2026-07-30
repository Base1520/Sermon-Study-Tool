// The feature catalog — the single source of truth for what can be sold.
//
// A license grants FEATURE IDS, never a tier name. The tier on a license is for
// display and support conversations only. This is deliberate: if the app decided
// internally what "annual" unlocks, then selling a custom bundle to an
// organization would need a new app build and a release. Because grants are
// explicit, any package — including one negotiated with a seminary over the
// phone — is a different signed license and nothing else.
//
// WHERE THE LINE IS DRAWN, and why:
//
// The app is bring-your-own-key end to end. Every Anthropic call resolves
// through requireSecret('ANTHROPIC_KEY') to the USER's own key, so Cole's cost
// per subscriber is structurally $0. That means the paywall cannot be about
// protecting Cole's spend — there is none — and it cannot be about audience
// either. PLAIN READ is for laymen and PULPIT for preachers, but PLAIN READ is
// the more expensive path, so gating by audience would charge the wrong people.
//
// So the line is: ANYTHING THAT GENERATES SOMETHING NEW is paid. Anything that
// renders, teaches, or re-opens what you already have is free forever.
//
// That gives a free tier a man can genuinely live in — learn to study in the
// Academy, walk a complete worked example, explore the whole atlas, and re-read
// every study he has ever run — while what he buys is the engine itself.
//
// TO CHANGE WHAT IS FREE: edit FREE_FEATURES below. That is the only edit
// needed. Nothing else in the codebase hard-codes a free/paid decision.

/**
 * Every capability, keyed by a stable id.
 *
 * Ids are permanent. Renaming one silently revokes it for every license already
 * signed with the old name, so add new ids rather than renaming existing ones.
 *
 * `handler` names the IPC channel it gates, so the gate sites in main.js can be
 * traced back here.
 */
const FEATURES = {
  // ══ FREE — no model call, no marginal cost ══════════════════════════════

  'learn.academy': {
    label: 'Exegesis Academy',
    blurb: 'The course that teaches you to study the text without any tool.',
  },
  'learn.demo': {
    label: 'The worked example',
    blurb: 'A complete study of Romans 8, start to finish, free.',
  },
  'view.history': {
    label: 'Your studies, kept',
    blurb: 'Every study you have run stays yours and re-opens free, forever.',
  },
  'view.atlas': {
    label: 'Maps, lineage, kings and timelines',
    blurb: 'Where it happened, who reigned, and how the lines run.',
  },
  'view.versions': {
    label: 'Parallel versions',
    blurb: 'KJV, ASV and YLT side by side.',
  },
  'view.compass': {
    label: 'Book compass',
    blurb: 'Where you are standing in the book.',
  },
  'plan.calendar': {
    label: 'Preaching calendar',
    blurb: 'What you are preaching, and when.',
  },
  'plan.series': {
    label: 'Series shelf',
    blurb: 'Group passages into a series and keep them together.',
  },
  'out.export': {
    label: 'Export to PDF',
    blurb: 'Take anything you already have out of the app.',
  },

  // ══ PAID — each one makes a model call on the user's own key ════════════

  'gen.study': {
    label: 'New studies',
    blurb: 'Run the eight-step analysis on any passage you choose.',
    handler: 'analyze-passage',
  },
  'gen.read': {
    label: 'The reading',
    blurb: 'The full plain-language reading, with the claim-check pass behind it.',
    handler: 'plain-read',
  },
  'gen.ask': {
    label: 'Ask the Operator',
    blurb: 'Ask this specific passage a question and get an answer from the text.',
    handler: 'plain-ask',
  },
  'gen.groupguide': {
    label: 'Group guides',
    blurb: 'Turn a study into something you can hand a group on Wednesday night.',
    handler: 'group-guide-generate',
  },
  'gen.crossrefs': {
    label: 'Cross-references',
    blurb: 'Where else Scripture carries this thread, and why.',
    handler: 'get-cross-refs',
  },
  'gen.wordstudy': {
    label: 'Word study',
    blurb: 'The original language, without pretending you read it.',
    handler: 'word-study',
  },
  'gen.scholar': {
    label: 'Scholar chat',
    blurb: 'Push back on the reading and make it defend itself.',
    handler: 'scholar-chat',
  },
  'gen.agents': {
    label: 'The desks',
    blurb: 'Exegetical, theological and homiletical desks you can question.',
    handler: 'agent-chat',
  },
  'gen.sermon': {
    label: 'Sermon drafting',
    blurb: 'Draft from the study, in your structure.',
    handler: 'draft-sermon',
  },
  'gen.seriesSynth': {
    label: 'Series synthesis',
    blurb: 'Find the arc running through a whole series.',
    handler: 'series-synthesize',
  },
  'gen.mission': {
    label: 'Mission brief',
    blurb: 'The passage aimed at the field.',
    handler: 'mission-brief',
  },
  'gen.profile': {
    label: 'Preacher profile',
    blurb: 'What your own sermons reveal about how you preach.',
    handler: 'profile-extract-insights',
  },
  'gen.delivery': {
    label: 'Delivery review',
    blurb: 'Record a run-through and hear what landed. Needs an OpenAI key too.',
    handler: 'review-delivery',
    // Flagged because it is the one paid feature that requires a SECOND
    // provider key. A buyer who pays and then hits another key wall is a
    // refund, so the pricing page has to say this out loud.
    requiresSecondKey: 'OPENAI_KEY',
  },
}

/**
 * What every install gets, forever, with no license, no account and no payment.
 *
 * This is the free/paid line. It is generous on purpose: it matches "teach
 * high, no games," it costs $0 to honor, and it means nobody has to be talked
 * out of a free license at 9pm — the free version is genuinely good.
 *
 * EDIT HERE AND NOWHERE ELSE.
 */
const FREE_FEATURES = [
  'learn.academy',
  'learn.demo',
  'view.history',
  'view.atlas',
  'view.versions',
  'view.compass',
  'plan.calendar',
  'plan.series',
  'out.export',
]

/** Ids that exist in the catalog. Used to catch typos at sign time. */
const ALL_FEATURE_IDS = Object.keys(FEATURES)

/**
 * Resolve the effective feature set for an install.
 *
 * Unknown ids in `granted` are kept rather than dropped. A license signed after
 * this build shipped may grant a feature this build has never heard of, and the
 * correct behaviour is to carry it harmlessly, not to reject the license.
 */
function effectiveFeatures(granted = []) {
  return new Set([...FREE_FEATURES, ...(Array.isArray(granted) ? granted : [])])
}

/** Is this capability available right now? */
function hasFeature(featureId, granted = []) {
  return effectiveFeatures(granted).has(featureId)
}

/** Everything not free — what a license can meaningfully add. */
function paidFeatureIds() {
  return ALL_FEATURE_IDS.filter((id) => !FREE_FEATURES.includes(id))
}

/** Map an IPC channel back to the feature that gates it, or null if free. */
function featureForHandler(channel) {
  const hit = Object.entries(FEATURES).find(([, f]) => f.handler === channel)
  return hit ? hit[0] : null
}

module.exports = {
  FEATURES,
  FREE_FEATURES,
  ALL_FEATURE_IDS,
  effectiveFeatures,
  hasFeature,
  paidFeatureIds,
  featureForHandler,
}
