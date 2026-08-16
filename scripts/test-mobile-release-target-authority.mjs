import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function lineStarting(text, prefix) {
  return text.split(/\r?\n/).find((line) => line.startsWith(prefix)) || ''
}

function lineContaining(text, fragment) {
  return text.split(/\r?\n/).find((line) => line.includes(fragment)) || ''
}

function hasUnmatchedInlineCode(text) {
  return (text.match(/`/g) || []).length % 2 !== 0
}

function hasCurrentAuthorization(text, subjectPattern) {
  if (hasUnmatchedInlineCode(text)) return false
  const withoutInlineCode = text.replace(/`[^`\r\n]*`/g, ' ')

  const strongPredicate = /\b(?:authoriz(?:e|ed)|approv(?:e|ed)|allow(?:ed)?|permit(?:ted)?|eligible|selectable|submittable|attachable|executable|proceed(?:s)?|submission path)\b/i
  const actionPredicate = /\b(?:attach(?:ed)?|select(?:ed)?|submit(?:ted)?|ship(?:ped)?)\b/i
  const modality = /\b(?:is|are|was|were|remains|stays|becomes|can|may|must|should|will)\b/i
  const negation = /\b(?:not|never|cannot|must not|may not|should not|will not|do not|does not|did not|neither|no longer)\b/i
  const noncurrent = /\b(?:historical|historically|previously|formerly|prior|archived|superseded|retroactive|until|once|later|future|pending|could|might|would)\b/i
  const current = /\b(?:now|today|currently|at present)\b/i

  const sentences = withoutInlineCode
    .split(/[.!?;]+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  return sentences.some((sentence) => {
    let subjectSeen = false
    return sentence.split(/\b(?:but|however|yet)\b/i).some((segment) => {
      if (subjectPattern.test(segment)) subjectSeen = true
      if (!subjectSeen) return false
      const affirms = strongPredicate.test(segment)
        || (modality.test(segment) && actionPredicate.test(segment))
      if (!affirms || negation.test(segment)) return false
      if (noncurrent.test(segment) && !current.test(segment)) return false
      return true
    })
  })
}

function hasBuild5Authorization(text) {
  const normalized = text.replace(/\b1\.4\.2\s*\(5\)(?!\w)/gi, 'build 5')
  return hasCurrentAuthorization(normalized, /\bbuild(?:\s+|-)5\b/i)
}

function hasBuild5CurrentCandidateLabel(text) {
  if (hasUnmatchedInlineCode(text)) return false
  const normalized = text
    .replace(/`[^`\r\n]*`/g, ' ')
    .replace(/\b1\.4\.2\s*\(5\)(?!\w)/gi, 'build 5')
  const build5 = /\bbuild(?:\s+|-)5\b/i
  const currentCandidate = /(?:\b(?:current(?:ly)?|now|today|at present)\b[^.!?;\n]{0,96}\bcandidate(?:\s+artifact)?\b|\bcandidate(?:\s+artifact)?\b[^.!?;\n]{0,96}\b(?:currently|now|today|at present)\b)/i
  const labelVerb = /\b(?:is|are|remains|stays|becomes)\b/i
  const negation = /\b(?:not|never|cannot|must not|may not|should not|will not|do not|does not|did not|neither|no longer)\b/i
  const noncurrent = /\b(?:historical|historically|previously|formerly|prior|archived|superseded|retroactive|until|once|later|future|pending|could|might|would)\b/i

  const sentences = normalized
    .split(/[.!?;]+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  return sentences.some((sentence) => {
    let subjectSeen = false
    return sentence.split(/\b(?:but|however|yet)\b/i).some((segment) => {
      if (build5.test(segment)) subjectSeen = true
      if (!subjectSeen || !currentCandidate.test(segment) || !labelVerb.test(segment)) return false
      if (negation.test(segment) || noncurrent.test(segment)) return false
      return true
    })
  })
}

function hasBuild6SubmissionReadiness(text) {
  if (hasUnmatchedInlineCode(text)) return false
  const normalized = text
    .replace(/`[^`\r\n]*`/g, ' ')
    .replace(/\b1\.4\.2\s*\(6\)(?!\w)/gi, 'build 6')
  return /\bbuild(?:\s+|-)6\b[^.!?;\n]*\b(?:ready for submission|ready to submit|submission-ready)\b/i.test(normalized)
}

function hasUnexpectedPathA(text) {
  return hasCurrentAuthorization(text, /\bpath\s+a\b/i)
}

function validate({ checklist, ledger, matrix, applePacket, screenshots }) {
  const failures = []
  const require = (condition, message) => {
    if (!condition) failures.push(message)
  }

  const checklistAuthority = lineContaining(
    checklist,
    'Submission-target authority reconciled',
  )
  const ledgerSummary = lineStarting(ledger, '> 🚀 **DESKTOP v1.4.4 IS LIVE')
  const latestReconciliation = lineStarting(ledger, '> **LATEST RECONCILIATION')
  const externalGate = lineStarting(ledger, '1. Historical build `1.4.2 (4)`')
  const appleBuildBoundary = lineContaining(applePacket, 'Build boundary updated')
  const screenshotHold = lineStarting(screenshots, '> Apple submission hold:')
  const mobileSourceLineage = lineContaining(checklist, 'Mobile-source lineage, verified')
  const latestUploadedArtifact = lineStarting(
    ledger,
    '**The latest uploaded Apple artifact is build ',
  )
  const uploadedSourceMatch = mobileSourceLineage.match(
    /canonical release source for uploaded build (\d+) is `([0-9a-f]{40})`/,
  )
  const currentSource = mobileSourceLineage.match(
    /Local `HEAD` and `origin\/main` now resolve to descendant `([0-9a-f]{40})`/,
  )?.[1] || ''
  const uploadedBuild = Number(uploadedSourceMatch?.[1] || 0)
  const uploadedSource = uploadedSourceMatch?.[2] || ''

  const currentAuthorityRows = [
    ['checklist', checklistAuthority],
    ['ledger summary', ledgerSummary],
    ['latest reconciliation', latestReconciliation],
  ]

  for (const [name, row] of currentAuthorityRows) {
    require(Boolean(row), `current ${name} records release-target authority`)
    require(
      !hasUnmatchedInlineCode(row),
      `current ${name} has balanced inline-code delimiters`,
    )
    require(
      row.includes('No recorded Cole decision between the historical Path A / Path B options is being invented.'),
      `current ${name} does not invent a historical Path A / Path B decision`,
    )
    require(
      row.includes('Subsequent candidate evidence proves build 5 fails required C05'),
      `current ${name} derives build 6 from the build-5 C05 failure`,
    )
    require(
      row.includes('evidence-derived gate consequence, not a recorded or retroactive Path B decision'),
      `current ${name} distinguishes evidence-derived state from a retroactive Path B decision`,
    )
    require(
      row.includes('Under the current fail-closed execution plan'),
      `current ${name} names the fail-closed execution plan`,
    )
    require(
      row.includes('build 5 must not be attached, selected, or submitted'),
      `current ${name} keeps build 5 out of submission`,
    )
    require(
      row.includes('build 6 is the only executable submission path'),
      `current ${name} makes build 6 the only executable path`,
    )
    require(
      row.includes('unless Cole makes a new explicit decision'),
      `current ${name} preserves Cole's authority to change the path`,
    )
    require(
      !/Cole (?:already )?(?:chose|selected|approved) build 6/i.test(row),
      `current ${name} does not falsely claim Cole chose build 6`,
    )
    require(
      !hasUnexpectedPathA(row),
      `current ${name} does not authorize historical Path A`,
    )
    require(
      !hasBuild5Authorization(row),
      `current ${name} contains no contradictory build-5 authorization`,
    )
    require(
      !hasBuild6SubmissionReadiness(row),
      `current ${name} does not falsely claim build 6 is submission-ready`,
    )
  }

  require(
    !hasBuild5CurrentCandidateLabel(latestReconciliation),
    'current latest reconciliation does not label build 5 as the current candidate',
  )

  require(
    checklistAuthority.includes(
      'the complete static gate remains intentionally red on its five recorded blockers',
    ),
    'current checklist authority row preserves the exact five-failure static board',
  )

  require(
    latestReconciliation.includes(
      'The five static failures remain: synchronized console-packet retention, current-source/uploaded-build lineage, packaged-bundle age, the Apple screenshot hold, and the Android screenshot hold',
    ) &&
      latestReconciliation.includes(
        'The complete checker independently reproduces **174/1/5**.',
      ),
    'current latest reconciliation preserves the exact five-failure static board',
  )

  require(
    uploadedBuild > 0 &&
      Boolean(uploadedSource) &&
      Boolean(currentSource) &&
      latestUploadedArtifact.includes(
        `**The latest uploaded Apple artifact is build ${uploadedBuild}; no eligible App Store submission candidate currently exists.**`,
      ) &&
      latestUploadedArtifact.includes(
        `Build ${uploadedBuild} is tied to historical pushed source \`${uploadedSource}\` and Xcode build number \`${uploadedBuild}\``,
      ) &&
      latestUploadedArtifact.includes(
        `Current pushed source is \`${currentSource}\`, so provenance-clean build ${uploadedBuild + 1} is required before selection or submission.`,
      ) &&
      latestUploadedArtifact.includes('processing/selectability remains unverified') &&
      !latestUploadedArtifact.includes('current uploaded App Store candidate'),
    'release records distinguish the latest uploaded Apple artifact from an eligible submission candidate',
  )

  require(
    matrix.includes('Build `1.4.2 (5)` must fail C05') &&
      matrix.includes('A later candidate passes this') &&
      matrix.includes('not-ready tap explains') &&
      matrix.includes('ready tap opens Preach Mode'),
    'candidate evidence retains the exact build-5 C05 known-positive',
  )

  require(
    externalGate.includes('Subsequent candidate evidence proves build 5 fails required C05') &&
      externalGate.includes('without inventing a historical Cole choice') &&
      externalGate.includes('build 5 must not be attached, selected, or submitted') &&
      externalGate.includes('Produce provenance-clean build 6') &&
      externalGate.includes('attach build 6') &&
      externalGate.includes('only under separate fresh approval'),
    'external Apple gate keeps build 5 historical and build 6 approval-bound',
  )

  require(
    applePacket.includes('does not prove that provenance-clean build `1.4.2 (6)` exists') &&
      applePacket.includes('Builds 4 and 5 are historical evidence only') &&
      appleBuildBoundary.includes('build 5 fails required C05') &&
      appleBuildBoundary.includes('without inventing a historical Cole choice') &&
      appleBuildBoundary.includes('must NOT be attached, selected, or submitted') &&
      appleBuildBoundary.includes('provenance-clean build **6**'),
    'Apple completion packet derives the approval-bound build-6 boundary from C05',
  )

  require(
    screenshotHold.includes('build 5 fails required C05') &&
      screenshotHold.includes('build 6 is the current fail-closed final-screenshot path') &&
      screenshotHold.includes('without inventing a historical Cole choice') &&
      screenshotHold.includes('build-6-proven replacements'),
    'screenshot hold derives build-6 final provenance from the build-5 failure',
  )

  return failures
}

function expectFailures(name, sources, expected) {
  const actual = validate(sources)
  const same = actual.length === expected.length &&
    actual.every((failure, index) => failure === expected[index])
  if (!same) {
    throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function replaceRequired(text, before, after, label) {
  const changed = text.replace(before, after)
  if (changed === text) throw new Error(`${label}: mutation did not change its input`)
  return changed
}

const canonical = {
  checklist: read('store/release-checklist.md'),
  ledger: read('store/release-ledger.md'),
  matrix: read('store/mobile-physical-smoke-matrix.md'),
  applePacket: read('store/apple-console-completion-packet.md'),
  screenshots: read('store/screenshots.md'),
}

const tests = [
  {
    name: 'canonical records keep build 6 fail-closed without inventing Cole\'s decision',
    run() {
      expectFailures('canonical', canonical, [])
    },
  },
  {
    name: 'authorizing historical Path A in the current ledger summary fails closed',
    run() {
      const summary = lineStarting(canonical.ledger, '> 🚀 **DESKTOP v1.4.4 IS LIVE')
      const mutatedSummary = replaceRequired(
        summary,
        'build 6 is the only executable submission path',
        'Path A may proceed while build 6 remains optional',
        'ledger-summary-path-a',
      )
      const ledger = canonical.ledger.replace(summary, mutatedSummary)
      expectFailures('ledger-summary-path-a', { ...canonical, ledger }, [
        'current ledger summary makes build 6 the only executable path',
        'current ledger summary does not authorize historical Path A',
      ])
    },
  },
  {
    name: 'claiming Cole chose build 6 in the current checklist fails closed',
    run() {
      const checklist = replaceRequired(
        canonical.checklist,
        'No recorded Cole decision between the historical Path A / Path B options is being invented.',
        'Cole already chose build 6.',
        'checklist-false-decision',
      )
      expectFailures('checklist-false-decision', { ...canonical, checklist }, [
        'current checklist does not invent a historical Path A / Path B decision',
        'current checklist does not falsely claim Cole chose build 6',
      ])
    },
  },
  {
    name: 'removing the C05 derivation from the current ledger summary fails closed',
    run() {
      const summary = lineStarting(canonical.ledger, '> 🚀 **DESKTOP v1.4.4 IS LIVE')
      const mutatedSummary = replaceRequired(
        summary,
        'Subsequent candidate evidence proves build 5 fails required C05',
        'Build 5 is merely older',
        'ledger-summary-c05-derivation',
      )
      const ledger = canonical.ledger.replace(summary, mutatedSummary)
      expectFailures('ledger-summary-c05-derivation', { ...canonical, ledger }, [
        'current ledger summary derives build 6 from the build-5 C05 failure',
      ])
    },
  },
  {
    name: 'making build 5 selectable in the latest reconciliation fails closed',
    run() {
      const marker = '> **LATEST RECONCILIATION'
      const latest = lineStarting(canonical.ledger, marker)
      const mutatedLatest = replaceRequired(
        latest,
        'build 5 must not be attached, selected, or submitted',
        'build 5 may be attached, selected, or submitted',
        'latest-build-5-selection',
      )
      const ledger = canonical.ledger.replace(latest, mutatedLatest)
      expectFailures('latest-build-5-selection', { ...canonical, ledger }, [
        'current latest reconciliation keeps build 5 out of submission',
        'current latest reconciliation contains no contradictory build-5 authorization',
      ])
    },
  },
  {
    name: 'adding build-5 selectability to the latest reconciliation fails closed',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest} Build 5 remains selectable for submission today.`,
      )
      expectFailures('latest-build-5-addition', { ...canonical, ledger }, [
        'current latest reconciliation contains no contradictory build-5 authorization',
      ])
    },
  },
  {
    name: 'adding a reverse-order build-5 authorization fails closed',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest} The operator is authorized to submit build 5 today.`,
      )
      expectFailures('latest-build-5-reverse-addition', { ...canonical, ledger }, [
        'current latest reconciliation contains no contradictory build-5 authorization',
      ])
    },
  },
  {
    name: 'an adversative cannot let earlier negation hide build-5 selectability',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest} Build 5 is not authorized, yet it remains selectable today.`,
      )
      expectFailures('latest-build-5-adversative-addition', { ...canonical, ledger }, [
        'current latest reconciliation contains no contradictory build-5 authorization',
      ])
    },
  },
  {
    name: 'the version-and-build alias cannot hide build-5 authorization',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest} Submission of the archived candidate 1.4.2 (5) is now approved.`,
      )
      expectFailures('latest-build-5-version-alias', { ...canonical, ledger }, [
        'current latest reconciliation contains no contradictory build-5 authorization',
      ])
    },
  },
  {
    name: 'the latest reconciliation cannot falsely claim build 6 is submission-ready',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest} Build 6 is ready for submission.`,
      )
      expectFailures('latest-build-6-readiness', { ...canonical, ledger }, [
        'current latest reconciliation does not falsely claim build 6 is submission-ready',
      ])
    },
  },
  {
    name: 'the latest reconciliation cannot regress to the pre-retention static board',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const mutatedLatest = latest
        .replaceAll('174/1/5', '174/1/4')
        .replace(
          'The five static failures remain: synchronized console-packet retention, current-source/uploaded-build lineage, packaged-bundle age, the Apple screenshot hold, and the Android screenshot hold',
          'The four static failures remain: current-source/uploaded-build lineage, packaged-bundle age, the Apple screenshot hold, and the Android screenshot hold',
        )
      if (mutatedLatest === latest) {
        throw new Error('latest-static-board: mutation did not change its input')
      }
      const ledger = canonical.ledger.replace(latest, mutatedLatest)
      expectFailures('latest-static-board', { ...canonical, ledger }, [
        'current latest reconciliation preserves the exact five-failure static board',
      ])
    },
  },
  {
    name: 'the checklist authority row cannot regress to four blockers',
    run() {
      const checklist = replaceRequired(
        canonical.checklist,
        'the complete static gate remains intentionally red on its five recorded blockers',
        'the complete static gate remains intentionally red on its four recorded blockers',
        'checklist-static-board',
      )
      expectFailures('checklist-static-board', { ...canonical, checklist }, [
        'current checklist authority row preserves the exact five-failure static board',
      ])
    },
  },
  {
    name: 'the latest uploaded Apple artifact cannot be called the current candidate',
    run() {
      const ledger = replaceRequired(
        canonical.ledger,
        '**The latest uploaded Apple artifact is build 5; no eligible App Store submission candidate currently exists.**',
        '**The current uploaded App Store candidate artifact is build 5.**',
        'latest-artifact-current-candidate',
      )
      expectFailures('latest-artifact-current-candidate', { ...canonical, ledger }, [
        'release records distinguish the latest uploaded Apple artifact from an eligible submission candidate',
      ])
    },
  },
  {
    name: 'the latest reconciliation cannot label build 5 as the current candidate',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest} The current uploaded App Store candidate artifact is build 5.`,
      )
      expectFailures('latest-build-5-current-candidate-label', { ...canonical, ledger }, [
        'current latest reconciliation does not label build 5 as the current candidate',
      ])
    },
  },
  {
    name: 'a reverse-order build alias cannot hide the current-candidate label',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest} 1.4.2 (5) remains the current App Store submission candidate.`,
      )
      expectFailures('latest-build-5-current-candidate-alias', { ...canonical, ledger }, [
        'current latest reconciliation does not label build 5 as the current candidate',
      ])
    },
  },
  {
    name: 'adding Path A authorization to the current checklist fails closed',
    run() {
      const authority = lineContaining(canonical.checklist, 'Submission-target authority reconciled')
      const checklist = canonical.checklist.replace(
        authority,
        `${authority} Path A is authorized now;`,
      )
      expectFailures('checklist-path-a-addition', { ...canonical, checklist }, [
        'current checklist does not authorize historical Path A',
      ])
    },
  },
  {
    name: 'negative, historical, conditional, and quoted examples remain allowed',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest} Build 5 is not selectable. Build 5 was never authorized. Build 5 was previously approved but is now superseded. Build 5 is not the current App Store candidate. Build 5 was the App Store candidate before it was superseded. Build 5 could become a candidate later if Cole explicitly decides. \`Build 5 remains selectable for submission today.\` \`The current uploaded App Store candidate artifact is build 5.\``,
      )
      const authority = lineContaining(canonical.checklist, 'Submission-target authority reconciled')
      const checklist = canonical.checklist.replace(
        authority,
        `${authority} Path A is not authorized. Path A was historically authorized. Path A may be considered later if Cole decides. \`Path A is authorized now;\``,
      )
      expectFailures('negative-and-historical-controls', { ...canonical, ledger, checklist }, [])
    },
  },
  {
    name: 'an unmatched inline-code delimiter fails authority parsing closed',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest} \`Build 5 remains selectable for submission today.`,
      )
      expectFailures('unmatched-inline-code', { ...canonical, ledger }, [
        'current latest reconciliation has balanced inline-code delimiters',
      ])
    },
  },
  {
    name: 'weakening the detailed external Apple gate fails closed',
    run() {
      const external = lineStarting(canonical.ledger, '1. Historical build `1.4.2 (4)`')
      const mutatedExternal = replaceRequired(
        external,
        'build 5 must not be attached, selected, or submitted',
        'build 5 may be selected',
        'external-build-5-selection',
      )
      const ledger = canonical.ledger.replace(external, mutatedExternal)
      expectFailures('external-build-5-selection', { ...canonical, ledger }, [
        'external Apple gate keeps build 5 historical and build 6 approval-bound',
      ])
    },
  },
  {
    name: 'weakening the candidate C05 known-positive fails closed',
    run() {
      const matrix = replaceRequired(
        canonical.matrix,
        'Build `1.4.2 (5)` must fail C05',
        'Build `1.4.2 (5)` may pass C05',
        'matrix-c05-known-positive',
      )
      expectFailures('matrix-c05-known-positive', { ...canonical, matrix }, [
        'candidate evidence retains the exact build-5 C05 known-positive',
      ])
    },
  },
]

let failed = 0
for (const test of tests) {
  try {
    test.run()
    console.log(`  ok   ${test.name}`)
  } catch (error) {
    failed += 1
    console.error(`  not ok   ${test.name}`)
    console.error(`           ${error.message}`)
  }
}

console.log(`\n${tests.length - failed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
