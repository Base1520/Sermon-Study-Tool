// The feature catalog — the single source of truth for what can be sold.
//
// A license grants FEATURE IDS, never a tier name. The tier on a license is for
// display and support conversations only. This is deliberate: if the app decided
// internally what "pro" unlocks, then selling a custom bundle to an organization
// would need a new app build and a release. Because grants are explicit, any
// bundle — including one negotiated with a seminary over the phone — is a
// different signed license and nothing else.
//
// TO CHANGE WHAT IS FREE: edit FREE_FEATURES below. That is the only edit needed.
// Nothing else in the codebase should hard-code a free/paid decision.

/**
 * Every sellable capability, keyed by a stable id.
 *
 * Ids are permanent. Renaming one silently revokes it for every license already
 * signed with the old name, so add new ids rather than renaming existing ones.
 */
const FEATURES = {
  // ── The reading engine ──
  'read.plain': {
    label: 'Plain Read',
    blurb: 'Understand what the author meant, and how anyone knows that.',
  },
  'read.levels': {
    label: 'Reading levels',
    blurb: 'The same reading in your language, from new believer to scholar.',
  },
  'read.ask': {
    label: 'Ask the Operator',
    blurb: 'Ask this specific passage a question.',
  },
  'read.history': {
    label: 'Study history',
    blurb: 'Every study you have run, searchable, kept.',
  },

  // ── Seeing the text in its world ──
  'atlas.map': {
    label: 'Maps and journeys',
    blurb: 'Where it happened, and the routes through it.',
  },
  'atlas.timeline': {
    label: 'Timelines and rulers',
    blurb: 'Who was on the throne when this was written.',
  },
  'atlas.lineage': {
    label: 'Lineage and kings',
    blurb: 'The family lines and the divided kingdom.',
  },
  'atlas.crossrefs': {
    label: 'Cross-references',
    blurb: 'Where else Scripture carries this thread.',
  },

  // ── Learning to do it yourself ──
  'academy.exegesis': {
    label: 'Exegesis Academy',
    blurb: 'The course that teaches you to study without the tool.',
  },
  'academy.covenant': {
    label: 'The COVENANT framework',
    blurb: 'The interpretive spine the whole tool runs on.',
  },

  // ── Preaching and teaching ──
  'pulpit.outline': {
    label: 'Pulpit mode',
    blurb: 'Sermon preparation: structure, drafting, delivery review.',
  },
  'pulpit.series': {
    label: 'Series planning',
    blurb: 'Plan and synthesize a series across passages.',
  },
  'pulpit.calendar': {
    label: 'Preaching calendar',
    blurb: 'What you are preaching, and when.',
  },
  'pulpit.export': {
    label: 'Export to PDF',
    blurb: 'Take it out of the app and into the pulpit.',
  },

  // ── Leading others ──
  'group.guide': {
    label: 'Group guides',
    blurb: 'Turn a study into something you can hand a group.',
  },

  // ── Depth ──
  'depth.commentary': {
    label: 'Commentary',
    blurb: 'What the scholars said, and where they disagree.',
  },
  'depth.wordstudy': {
    label: 'Word study',
    blurb: 'The original language, without pretending you read it.',
  },
  'depth.otherviews': {
    label: 'Other views',
    blurb: 'The dating, authorship and interpretive debates in this book.',
  },
}

/**
 * What every install gets, forever, with no license and no payment.
 *
 * The free tier has to be genuinely useful on its own — a man should be able to
 * study well for a year and never pay. What is sold is depth and breadth, not
 * access to Scripture.
 *
 * THIS LIST IS THE FREE/PAID LINE. Edit it here and nowhere else.
 */
const FREE_FEATURES = [
  'read.plain',
  'read.levels',
  'read.ask',
  'read.history',
]

/** Ids that exist in the catalog. Used to sanity-check licenses at sign time. */
const ALL_FEATURE_IDS = Object.keys(FEATURES)

/**
 * Resolve the effective feature set for an install.
 *
 * Unknown ids in `granted` are kept rather than dropped. A license signed after
 * this build shipped may grant a feature this build has never heard of, and the
 * correct behaviour is to carry it harmlessly, not to reject the license.
 *
 * @param {string[]} granted feature ids from a verified license, if any
 * @returns {Set<string>}
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

module.exports = {
  FEATURES,
  FREE_FEATURES,
  ALL_FEATURE_IDS,
  effectiveFeatures,
  hasFeature,
  paidFeatureIds,
}
