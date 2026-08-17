import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  readConsolePacketInput,
} from './console-packet-retention.mjs'
import {
  authoritySemanticFailures,
  lineContaining,
  lineStarting,
  stripInlineCode,
} from './mobile-release-record-authority.mjs'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function validate({ checklist, ledger, matrix, applePacket, screenshots }) {
  const failures = []
  const require = (condition, message) => {
    if (!condition) failures.push(message)
  }

  const checklistAuthority = lineContaining(
    checklist,
    '**Submission-target authority reconciled',
    {
      prefix: '  - ✅ **Submission-target authority reconciled',
      singlePhysicalLine: true,
    },
  )
  const ledgerSummary = lineContaining(
    ledger,
    '🚀 **DESKTOP v1.4.4 IS LIVE AS OF',
    {
      prefix: '> 🚀 **DESKTOP v1.4.4 IS LIVE AS OF',
      singlePhysicalLine: true,
    },
  )
  const latestReconciliation = lineContaining(
    ledger,
    '**LATEST RECONCILIATION',
    {
      prefix: '> **LATEST RECONCILIATION',
      singlePhysicalLine: true,
    },
  )
  const externalGate = lineContaining(
    ledger,
    'are preserved but must not be attached, selected, or submitted. Build',
    { prefix: '1. Historical builds `1.4.2 (4)` and `(5)`' },
  )
  const appleBuildBoundary = lineContaining(
    applePacket,
    '**Build boundary updated',
    { prefix: '- **Build boundary updated' },
  )
  const screenshotHold = lineContaining(
    screenshots,
    'Apple submission hold:',
    { prefix: '> Apple submission hold:' },
  )
  const mobileSourceLineage = lineContaining(
    checklist,
    '**Mobile-source lineage, verified',
    { prefix: '  - **Mobile-source lineage, verified' },
  )
  const latestUploadedArtifact = lineContaining(
    ledger,
    '**The latest uploaded Apple artifact is build ',
    { prefix: '**The latest uploaded Apple artifact is build ' },
  )
  const uploadedSourceMatch = mobileSourceLineage.match(
    /canonical release source for uploaded build (\d+) is `([0-9a-f]{40})`/,
  )
  const uploadedBuild = Number(uploadedSourceMatch?.[1] || 0)
  const uploadedSource = uploadedSourceMatch?.[2] || ''

  const currentAuthorityRows = [
    ['checklist', checklistAuthority],
    ['ledger summary', ledgerSummary],
    ['latest reconciliation', latestReconciliation],
  ]

  for (const [name, rawRow] of currentAuthorityRows) {
    require(Boolean(rawRow), `current ${name} records release-target authority`)
    const row = stripInlineCode(rawRow)
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
    failures.push(...authoritySemanticFailures(name, rawRow))
  }

  require(
    stripInlineCode(checklistAuthority).includes(
      'the complete static gate remains intentionally red on its three recorded blockers',
    ),
    'current checklist authority row preserves the exact three-failure static board',
  )

  require(
    stripInlineCode(latestReconciliation).includes(
      'The three static failures remain: synchronized console-packet retention, the Apple screenshot hold, and the Android screenshot hold',
    ) &&
      stripInlineCode(latestReconciliation).includes(
        'The complete checker independently reproduces **179/1/3**.',
      ),
    'current latest reconciliation preserves the exact three-failure static board',
  )

  require(
    uploadedBuild === 6 &&
      Boolean(uploadedSource) &&
      mobileSourceLineage.includes('Repository evidence may advance on clean pushed descendants of that immutable candidate only when all provenance-guarded mobile release inputs and synced native payloads remain byte-identical to the candidate') &&
      mobileSourceLineage.includes('The pushed evidence tip is `4b25c05db5054da079202a4ab05daf1048ee5502`') &&
      mobileSourceLineage.includes('Later pushed repository commits are permitted only by the exact pinned package-manifest transition while every other provenance-guarded input remains byte-identical to the evidence tip') &&
      mobileSourceLineage.includes('receipt evidence must never redefine the candidate source') &&
      latestUploadedArtifact.includes(
        `**The latest uploaded Apple artifact is build ${uploadedBuild}; processing/selectability and listing attachment remain unproved.**`,
      ) &&
      latestUploadedArtifact.includes(
        `Build ${uploadedBuild} is tied to immutable tagged release source \`${uploadedSource}\` and Xcode build number \`${uploadedBuild}\``,
      ) &&
      latestUploadedArtifact.includes('The pushed evidence tip is `4b25c05db5054da079202a4ab05daf1048ee5502`') &&
      latestUploadedArtifact.includes('Later pushed repository commits are permitted only by the exact pinned package-manifest transition while every other provenance-guarded input remains byte-identical to the evidence tip') &&
      latestUploadedArtifact.includes(
        'the upload receipt says only that the package is processing',
      ) &&
      latestUploadedArtifact.includes('No later candidate is required for source parity') &&
      latestUploadedArtifact.includes('must not be attached, selected, or submitted without a fresh approval after a real processing/selectability receipt') &&
      !latestUploadedArtifact.includes('current eligible App Store submission candidate') &&
      authoritySemanticFailures('uploaded artifact', latestUploadedArtifact).length === 0,
    'release records keep uploaded build 6 processing-only and approval-bound',
  )

  require(
    matrix.includes('Build `1.4.2 (5)` must fail C05') &&
      matrix.includes('A later candidate passes this') &&
      matrix.includes('not-ready tap explains') &&
      matrix.includes('ready tap opens Preach Mode'),
    'candidate evidence retains the exact build-5 C05 known-positive',
  )

  require(
    externalGate.includes('Historical builds `1.4.2 (4)` and `(5)` are preserved but must not be attached, selected, or submitted') &&
      externalGate.includes('Build `1.4.2 (6)` is archived from the executed clean `v1.4.5` sync') &&
      externalGate.includes('accepted by App Store Connect') &&
      externalGate.includes('receipt says only that the package is processing') &&
      externalGate.includes('Confirm build-6 processing completion/selectability') &&
      externalGate.includes('attach build 6') &&
      externalGate.includes('only under separate fresh approval') &&
      externalGate.includes('build-6-proven screenshot set') &&
      authoritySemanticFailures('external gate', externalGate).length === 0,
    'external Apple gate keeps build 5 historical and build 6 approval-bound',
  )

  require(
    applePacket.includes('does not prove that provenance-clean build `1.4.2 (6)` exists') &&
      applePacket.includes('Builds 4 and 5 are historical evidence only') &&
      appleBuildBoundary.includes('build 5 fails required C05') &&
      appleBuildBoundary.includes('without inventing a historical Cole choice') &&
      appleBuildBoundary.includes('must NOT be attached, selected, or submitted') &&
      appleBuildBoundary.includes('provenance-clean build **6**') &&
      authoritySemanticFailures('Apple packet', applePacket).length === 0,
    'retained Apple completion packet stays fail-closed as historical evidence',
  )

  require(
    screenshotHold.includes('build 5 fails required C05') &&
      screenshotHold.includes('build 6 is the current fail-closed final-screenshot path') &&
      screenshotHold.includes('without inventing a historical Cole choice') &&
      screenshotHold.includes('Build 6 now exists as a source-bound uploaded artifact') &&
      screenshotHold.includes('no final screenshot set is proven against its packaged UI') &&
      screenshotHold.includes('pixel-equivalence of any reused build-5 draft against packaged build 6') &&
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

function expectFailureIncludes(name, sources, expected) {
  const actual = validate(sources)
  if (!actual.includes(expected)) {
    throw new Error(`${name}: expected ${JSON.stringify(expected)} in ${JSON.stringify(actual)}`)
  }
}

function replaceRequired(text, before, after, label) {
  const changed = text.replace(before, after)
  if (changed === text) throw new Error(`${label}: mutation did not change its input`)
  return changed
}

function sectionStarting(text, heading) {
  const marker = `## ${heading}`
  const start = text.indexOf(marker)
  if (start === -1) throw new Error(`${heading}: section heading not found`)
  const next = text.indexOf('\n## ', start + marker.length)
  return text.slice(start, next === -1 ? text.length : next)
}

function runDirectReadinessWithSources({ checklist, ledger, applePacket, screenshots }) {
  const harness = [
    'import fs from "node:fs"',
    'import path from "node:path"',
    'const root = process.cwd()',
    'const checklistPath = path.join(root, "store/release-checklist.md")',
    'const ledgerPath = path.join(root, "store/release-ledger.md")',
    'const applePacketPath = path.join(root, "store/apple-console-completion-packet.md")',
    'const screenshotsPath = path.join(root, "store/screenshots.md")',
    'const injected = JSON.parse(fs.readFileSync(0, "utf8"))',
    'const originalRead = fs.readFileSync.bind(fs)',
    'fs.readFileSync = (file, ...args) => {',
    '  const resolved = path.resolve(String(file))',
    '  if (resolved === checklistPath) return injected.checklist',
    '  if (resolved === ledgerPath) return injected.ledger',
    '  if (resolved === applePacketPath) return injected.applePacket',
    '  if (resolved === screenshotsPath) return injected.screenshots',
    '  return originalRead(file, ...args)',
    '}',
    'const originalLog = console.log.bind(console)',
    'console.log = (...args) => {',
    '  const value = args.join(" ")',
    '  if (value.startsWith("FAIL") || value.includes("passed ·")) originalLog(value)',
    '}',
    'await import("./scripts/check-mobile-store-readiness.mjs?authority-fixture")',
  ].join('\n')

  return spawnSync(process.execPath, ['--input-type=module', '-e', harness], {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify({ checklist, ledger, applePacket, screenshots }),
    maxBuffer: 4 * 1024 * 1024,
  })
}

function expectDirectAuthorityFailure(
  name,
  checklist,
  ledger = canonical.ledger,
  expectedFailure = 'Release records preserve historical authority audit evidence and the processing-only build-6 boundary',
  extraSources = {},
) {
  const sources = {
    checklist,
    ledger,
    applePacket: extraSources.applePacket || canonical.applePacket,
    screenshots: extraSources.screenshots || canonical.screenshots,
  }
  if (Object.entries(sources).every(([key, value]) => value === canonical[key])) {
    throw new Error(`${name}: mutation did not change its input`)
  }

  const result = runDirectReadinessWithSources(sources)
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  if (result.status !== 1 ||
      !output.includes(`FAIL  ${expectedFailure}`) ||
      !output.includes('178 passed · 1 warnings · 4 failed')) {
    throw new Error(`${name}: unexpected result ${JSON.stringify({
      status: result.status,
      output: output.trim(),
    })}`)
  }
}

const applePacketInput = readConsolePacketInput({
  root,
  relative: 'store/apple-console-completion-packet.md',
})

const canonical = {
  checklist: read('store/release-checklist.md'),
  ledger: read('store/release-ledger.md'),
  matrix: read('store/mobile-physical-smoke-matrix.md'),
  applePacket: applePacketInput.text,
  screenshots: read('store/screenshots.md'),
}

const tests = [
  {
    name: 'Console packet input is configured and readable: store/apple-console-completion-packet.md',
    run() {
      if (!applePacketInput.available) {
        throw new Error('configured Apple completion packet input is unavailable')
      }
    },
  },
  ...(applePacketInput.available ? [
  {
    name: 'canonical records keep build 6 fail-closed without inventing Cole\'s decision',
    run() {
      expectFailures('canonical', canonical, [])
    },
  },
  {
    name: 'the direct readiness checker rejects inactive safe authority shadows across every release-boundary selector',
    run() {
      const authority = lineContaining(canonical.checklist, '**Submission-target authority reconciled')
      const fence = '`'.repeat(3)
      const checklist = canonical.checklist.replace(
        authority,
        `${fence}text\n${authority}\n${fence}\n${authority} Build 6 is submission-ready today.`,
      )
      expectDirectAuthorityFailure('direct-readiness-inactive-authority', checklist)

      const sourceBoundary = lineContaining(
        canonical.checklist,
        'BUILD 6 ARCHIVE + DIRECT APP STORE CONNECT UPLOAD PROVEN',
      )
      const checklistWithSourceOverclaim = canonical.checklist.replace(
        sourceBoundary,
        `${fence}text\n${sourceBoundary}\n${fence}\n${sourceBoundary} Build 6 is processed and selectable today.`,
      )
      expectDirectAuthorityFailure(
        'direct-build-6-archive-inactive-shadow',
        checklistWithSourceOverclaim,
        canonical.ledger,
        'Release records bind the uploaded Apple build to its immutable source while the pushed evidence tip preserves release inputs',
      )

      const uploadedArtifact = lineContaining(
        canonical.ledger,
        '**The latest uploaded Apple artifact is build',
      )
      const ledger = canonical.ledger.replace(
        uploadedArtifact,
        `${fence}text\n${uploadedArtifact}\n${fence}\n${uploadedArtifact} Build 6 is processed and selectable today.`,
      )
      expectDirectAuthorityFailure(
        'direct-uploaded-artifact-inactive-shadow',
        canonical.checklist,
        ledger,
        'Release records bind the uploaded Apple build to its immutable source while the pushed evidence tip preserves release inputs',
      )

      const processingBoundary = lineContaining(
        canonical.checklist,
        'Processing/selectability remains unverified.',
      )
      const checklistWithProcessingOverclaim = canonical.checklist.replace(
        processingBoundary,
        `${fence}text\n${processingBoundary}\n${fence}\n${processingBoundary} Build 6 is processed and selectable today.`,
      )
      expectDirectAuthorityFailure(
        'direct-processing-boundary-inactive-shadow',
        checklistWithProcessingOverclaim,
        canonical.ledger,
        'Release checklist keeps every superseded Apple build out of the final selection path',
      )

      const boundaryCases = [
        {
          name: 'final-screenshot-boundary',
          source: 'checklist',
          marker: 'The remaining screenshot provenance failure is fail-closed',
          expectedFailure: 'Release checklist keeps every superseded Apple build out of the final selection path',
        },
        {
          name: 'preach-checklist-boundary',
          source: 'checklist',
          marker: 'Silent PREACH-gate affordance AUDIT CONFIRMED',
          expectedFailure: 'Release checklist keeps every superseded Apple build out of the final selection path',
        },
        {
          name: 'apple-open-ledger-boundary',
          source: 'ledger',
          marker: '**Still open in App Store Connect:**',
          expectedFailure: 'Release ledger forward actions track uploaded build 6 without promoting processing',
        },
        {
          name: 'preach-ledger-boundary',
          source: 'ledger',
          marker: '| PREACH not-ready affordance (build-6 packaged) |',
          expectedFailure: 'Release ledger forward actions track uploaded build 6 without promoting processing',
        },
        {
          name: 'ipad-screenshot-ledger-boundary',
          source: 'ledger',
          marker: '| iPad screenshots |',
          expectedFailure: 'Release ledger forward actions track uploaded build 6 without promoting processing',
        },
        {
          name: 'native-package-parity-ledger-boundary',
          source: 'ledger',
          marker: '| Native package artifact parity |',
          expectedFailure: 'Release ledger binds build-6 package parity to its immutable tagged source',
        },
        {
          name: 'apple-console-build-boundary',
          source: 'applePacket',
          marker: 'Build boundary updated',
          expectedFailure: 'Release ledger forward actions track uploaded build 6 without promoting processing',
        },
        {
          name: 'apple-screenshot-hold-boundary',
          source: 'screenshots',
          marker: 'Apple submission hold:',
          expectedFailure: 'Release ledger forward actions track uploaded build 6 without promoting processing',
        },
      ]
      for (const boundaryCase of boundaryCases) {
        const original = canonical[boundaryCase.source]
        const boundary = lineContaining(original, boundaryCase.marker)
        const mutated = original.replace(
          boundary,
          `${fence}text\n${boundary}\n${fence}\n${boundary} Build 6 is processed and selectable today.`,
        )
        const sources = {
          checklist: canonical.checklist,
          ledger: canonical.ledger,
          applePacket: canonical.applePacket,
          screenshots: canonical.screenshots,
          [boundaryCase.source]: mutated,
        }
        expectDirectAuthorityFailure(
          `direct-${boundaryCase.name}-inactive-shadow`,
          sources.checklist,
          sources.ledger,
          boundaryCase.expectedFailure,
          {
            applePacket: sources.applePacket,
            screenshots: sources.screenshots,
          },
        )
      }

      for (const sectionName of ['External release gates', 'Signing evidence still required']) {
        const section = sectionStarting(canonical.ledger, sectionName)
        const ledgerWithSectionOverclaim = canonical.ledger.replace(
          section,
          `${fence}text\n${section}\n${fence}\n${section}\nBuild 6 is processed and selectable today.`,
        )
        expectDirectAuthorityFailure(
          `direct-${sectionName.toLowerCase().replaceAll(' ', '-')}-inactive-shadow`,
          canonical.checklist,
          ledgerWithSectionOverclaim,
          'Release ledger forward actions track uploaded build 6 without promoting processing',
        )
      }
    },
  },
  {
    name: 'the direct readiness checker rejects a blockquote-nested reference definition',
    run() {
      const authority = lineContaining(canonical.checklist, '**Submission-target authority reconciled')
      const checklist = canonical.checklist.replace(
        authority,
        `> [authority-shadow]: / "${authority}"`,
      )
      expectDirectAuthorityFailure('direct-blockquote-reference', checklist)
    },
  },
  {
    name: 'the direct readiness checker rejects a blockquote-nested fenced block',
    run() {
      const authority = lineContaining(canonical.checklist, '**Submission-target authority reconciled')
      const checklist = canonical.checklist.replace(
        authority,
        `> ~~~md\n> ${authority}\n> ~~~`,
      )
      expectDirectAuthorityFailure('direct-blockquote-fence', checklist)
    },
  },
  {
    name: 'the direct readiness checker rejects a blockquote-nested raw HTML block',
    run() {
      const authority = lineContaining(canonical.checklist, '**Submission-target authority reconciled')
      const checklist = canonical.checklist.replace(
        authority,
        `> <div>\n> ${authority}\n> </div>\n>`,
      )
      expectDirectAuthorityFailure('direct-blockquote-raw-html', checklist)
    },
  },
  {
    name: 'the direct readiness checker rejects a multiline inline-code authority row',
    run() {
      const authority = lineContaining(canonical.checklist, '**Submission-target authority reconciled')
      const checklist = canonical.checklist.replace(
        authority,
        `\`\n${authority}\n\``,
      )
      expectDirectAuthorityFailure('direct-multiline-inline-code', checklist)
    },
  },
  {
    name: 'the direct readiness checker rejects a multiline reference-definition title',
    run() {
      const authority = lineContaining(canonical.checklist, '**Submission-target authority reconciled')
      const checklist = canonical.checklist.replace(
        authority,
        `[authority-shadow]:\n  /destination\n  "${authority}"`,
      )
      expectDirectAuthorityFailure('direct-multiline-reference-title', checklist)
    },
  },
  {
    name: 'the direct readiness checker rejects authority text in an inline HTML attribute',
    run() {
      const authority = lineContaining(canonical.checklist, '**Submission-target authority reconciled')
      const checklist = canonical.checklist.replace(
        authority,
        `ordinary prose <span title="${authority}">shadow</span>`,
      )
      expectDirectAuthorityFailure('direct-inline-html-attribute', checklist)
    },
  },
  {
    name: 'the direct readiness checker rejects two authority markers on one active line',
    run() {
      const authority = lineContaining(canonical.checklist, '**Submission-target authority reconciled')
      const checklist = canonical.checklist.replace(
        authority,
        `${authority} **Submission-target authority reconciled**`,
      )
      expectDirectAuthorityFailure('direct-same-line-duplicate', checklist)
    },
  },
  ...[
    ['Path A authorization', 'Path A is authorized now.'],
    ['build-5 selectability', 'Build 5 remains selectable for submission today.'],
    ['build-6 processing', 'Build 6 is processed and selectable today.'],
    ['invented Cole decision', 'Cole already chose build 6.'],
  ].map(([label, overclaim]) => ({
    name: `the direct readiness checker rejects ${label}`,
    run() {
      const authority = lineContaining(canonical.checklist, '**Submission-target authority reconciled')
      const checklist = canonical.checklist.replace(authority, `${authority} ${overclaim}`)
      expectDirectAuthorityFailure(`direct-${label.replaceAll(' ', '-')}`, checklist)
    },
  })),
  {
    name: 'the direct readiness checker rejects an overclaim in the current ledger summary',
    run() {
      const summary = lineStarting(canonical.ledger, '> 🚀 **DESKTOP v1.4.4 IS LIVE')
      const ledger = canonical.ledger.replace(
        summary,
        `${summary} Build 5 remains selectable for submission today.`,
      )
      expectDirectAuthorityFailure('direct-ledger-summary-overclaim', canonical.checklist, ledger)
    },
  },
  ...[
    ['lazy', ''],
    ['four-space', '    '],
    ['six-space', '      '],
  ].map(([label, indentation]) => ({
    name: `the direct readiness checker rejects a ${label} checklist authority continuation`,
    run() {
      const authority = lineContaining(canonical.checklist, '**Submission-target authority reconciled')
      const checklist = canonical.checklist.replace(
        authority,
        `${authority}\n${indentation}Build 6 is submission-ready today.`,
      )
      expectDirectAuthorityFailure(`direct-checklist-${label}-continuation`, checklist)
    },
  })),
  ...[
    [
      'ledger summary',
      '🚀 **DESKTOP v1.4.4 IS LIVE AS OF',
      'Build 5 remains selectable for submission today.',
    ],
    [
      'historical ledger authority record',
      '**HISTORICAL AUTHORITY AUDIT RECORD —',
      'Build 6 is submission-ready today.',
    ],
    [
      'current ledger authority record',
      '**CURRENT POST-BUILD-6 AUTHORITY RECORD —',
      'Build 6 is processed and selectable today.',
    ],
    [
      'latest reconciliation',
      '**LATEST RECONCILIATION —',
      'Build 6 is submission-ready today.',
    ],
  ].map(([label, marker, overclaim]) => ({
    name: `the direct readiness checker rejects a ${label} blockquote continuation`,
    run() {
      const authority = lineContaining(canonical.ledger, marker)
      const ledger = canonical.ledger.replace(
        authority,
        `${authority}\n> ${overclaim}`,
      )
      expectDirectAuthorityFailure(
        `direct-${label.replaceAll(' ', '-')}-continuation`,
        canonical.checklist,
        ledger,
      )
    },
  })),
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
    name: 'the latest reconciliation cannot regress to a four-failure static board',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const mutatedLatest = latest
        .replaceAll('179/1/3', '178/1/4')
        .replace(
          'The three static failures remain: synchronized console-packet retention, the Apple screenshot hold, and the Android screenshot hold',
          'The four static failures remain: synchronized console-packet retention, packaged-bundle age, the Apple screenshot hold, and the Android screenshot hold',
        )
      if (mutatedLatest === latest) {
        throw new Error('latest-static-board: mutation did not change its input')
      }
      const ledger = canonical.ledger.replace(latest, mutatedLatest)
      expectFailures('latest-static-board', { ...canonical, ledger }, [
        'current latest reconciliation preserves the exact three-failure static board',
      ])
    },
  },
  {
    name: 'the checklist authority row cannot regress to four blockers',
    run() {
      const checklist = replaceRequired(
        canonical.checklist,
        'the complete static gate remains intentionally red on its three recorded blockers',
        'the complete static gate remains intentionally red on its four recorded blockers',
        'checklist-static-board',
      )
      expectFailures('checklist-static-board', { ...canonical, checklist }, [
        'current checklist authority row preserves the exact three-failure static board',
      ])
    },
  },
  {
    name: 'uploaded build 6 cannot be called an eligible submission candidate',
    run() {
      const ledger = replaceRequired(
        canonical.ledger,
        '**The latest uploaded Apple artifact is build 6; processing/selectability and listing attachment remain unproved.**',
        '**The current eligible App Store submission candidate is build 6.**',
        'latest-artifact-eligible-candidate',
      )
      expectFailures('latest-artifact-eligible-candidate', { ...canonical, ledger }, [
        'release records keep uploaded build 6 processing-only and approval-bound',
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
    name: 'the latest reconciliation cannot claim build 6 is processed or selectable',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest} Build 6 is processed and selectable today.`,
      )
      expectFailures('latest-build-6-processed-selectable', { ...canonical, ledger }, [
        'current latest reconciliation does not falsely claim build 6 is processed or selectable',
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
    name: 'a fenced safe reconciliation cannot shadow an active build-5 authorization',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const unsafe = `${latest} Build 5 remains selectable for submission today.`
      const ledger = canonical.ledger.replace(
        latest,
        `\`\`\`text\n${latest}\n\`\`\`\n${unsafe}`,
      )
      expectFailureIncludes('fenced-reconciliation-shadow', { ...canonical, ledger },
        'current latest reconciliation contains no contradictory build-5 authorization')
    },
  },
  {
    name: 'an HTML-commented safe reconciliation cannot shadow an active build-5 authorization',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const unsafe = `${latest} Build 5 remains selectable for submission today.`
      const ledger = canonical.ledger.replace(
        latest,
        `<!--\n${latest}\n-->\n${unsafe}`,
      )
      expectFailureIncludes('commented-reconciliation-shadow', { ...canonical, ledger },
        'current latest reconciliation contains no contradictory build-5 authorization')
    },
  },
  {
    name: 'a raw-HTML safe reconciliation cannot shadow an active build-5 authorization',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const unsafe = `${latest} Build 5 remains selectable for submission today.`
      const ledger = canonical.ledger.replace(
        latest,
        `<div>\n${latest}\n</div>\n\n${unsafe}`,
      )
      expectFailureIncludes('raw-html-reconciliation-shadow', { ...canonical, ledger },
        'current latest reconciliation contains no contradictory build-5 authorization')
    },
  },
  {
    name: 'an indented-code safe checklist row cannot shadow active Path A authorization',
    run() {
      const authority = lineContaining(canonical.checklist, 'Submission-target authority reconciled')
      const unsafe = `${authority} Path A is authorized now;`
      const checklist = canonical.checklist.replace(
        authority,
        `    ${authority.trimStart()}\n${unsafe}`,
      )
      expectFailureIncludes('indented-checklist-shadow', { ...canonical, checklist },
        'current checklist does not authorize historical Path A')
    },
  },
  {
    name: 'a reference-definition safe checklist row cannot shadow active Path A authorization',
    run() {
      const authority = lineContaining(canonical.checklist, 'Submission-target authority reconciled')
      const unsafe = `${authority} Path A is authorized now;`
      const checklist = canonical.checklist.replace(
        authority,
        `[authority-shadow]: / "${authority}"\n${unsafe}`,
      )
      expectFailureIncludes('reference-definition-checklist-shadow', { ...canonical, checklist },
        'current checklist does not authorize historical Path A')
    },
  },
  {
    name: 'an inline-code safe checklist row cannot shadow active Path A authorization',
    run() {
      const authority = lineContaining(canonical.checklist, 'Submission-target authority reconciled')
      const unsafe = `${authority} Path A is authorized now;`
      const checklist = canonical.checklist.replace(
        authority,
        `\`${authority}\`\n${unsafe}`,
      )
      expectFailureIncludes('inline-code-checklist-shadow', { ...canonical, checklist },
        'current checklist does not authorize historical Path A')
    },
  },
  {
    name: 'a longer inline-code span cannot shadow active Path A authorization',
    run() {
      const authority = lineContaining(canonical.checklist, 'Submission-target authority reconciled')
      const unsafe = `${authority} Path A is authorized now;`
      const checklist = canonical.checklist.replace(
        authority,
        `\`\`${authority}\`\`\n${unsafe}`,
      )
      expectFailureIncludes('longer-inline-code-checklist-shadow', { ...canonical, checklist },
        'current checklist does not authorize historical Path A')
    },
  },
  {
    name: 'a longer inline-code span cannot supply active authority evidence',
    run() {
      const authority = lineContaining(canonical.checklist, 'Submission-target authority reconciled')
      const headingEnd = authority.indexOf('.** ') + 4
      if (headingEnd < 4) throw new Error('longer-inline-code-authority: heading boundary missing')
      const checklist = canonical.checklist.replace(
        authority,
        `${authority.slice(0, headingEnd)}\`\`${authority.slice(headingEnd)}\`\``,
      )
      expectFailureIncludes('longer-inline-code-authority', { ...canonical, checklist },
        'current checklist does not invent a historical Path A / Path B decision')
    },
  },
  {
    name: 'multiple active latest-reconciliation markers fail closed',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest}\n${latest} Build 5 remains selectable for submission today.`,
      )
      expectFailureIncludes('duplicate-active-reconciliation', { ...canonical, ledger },
        'current latest reconciliation records release-target authority')
    },
  },
  {
    name: 'a one-space container prefix cannot hide a duplicate latest reconciliation',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest}\n ${latest} Build 5 remains selectable for submission today.`,
      )
      expectFailureIncludes('one-space-duplicate-reconciliation', { ...canonical, ledger },
        'current latest reconciliation records release-target authority')
    },
  },
  {
    name: 'a three-space container prefix cannot hide a duplicate latest reconciliation',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest}\n   ${latest} Build 5 remains selectable for submission today.`,
      )
      expectFailureIncludes('three-space-duplicate-reconciliation', { ...canonical, ledger },
        'current latest reconciliation records release-target authority')
    },
  },
  {
    name: 'a list-nested block quote cannot hide a duplicate latest reconciliation',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest}\n- ${latest} Build 5 remains selectable for submission today.`,
      )
      expectFailureIncludes('list-nested-duplicate-reconciliation', { ...canonical, ledger },
        'current latest reconciliation records release-target authority')
    },
  },
  {
    name: 'a no-space block quote marker cannot hide a duplicate latest reconciliation',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest}\n>${latest.slice(2)} Build 5 remains selectable for submission today.`,
      )
      expectFailureIncludes('no-space-duplicate-reconciliation', { ...canonical, ledger },
        'current latest reconciliation records release-target authority')
    },
  },
  {
    name: 'a nested block quote cannot hide a duplicate latest reconciliation',
    run() {
      const latest = lineStarting(canonical.ledger, '> **LATEST RECONCILIATION')
      const ledger = canonical.ledger.replace(
        latest,
        `${latest}\n> ${latest} Build 5 remains selectable for submission today.`,
      )
      expectFailureIncludes('nested-duplicate-reconciliation', { ...canonical, ledger },
        'current latest reconciliation records release-target authority')
    },
  },
  {
    name: 'weakening the detailed external Apple gate fails closed',
    run() {
      const external = lineStarting(canonical.ledger, '1. Historical builds `1.4.2 (4)` and `(5)`')
      const mutatedExternal = replaceRequired(
        external,
        'Historical builds `1.4.2 (4)` and `(5)` are preserved but must not be attached, selected, or submitted',
        'Historical builds `1.4.2 (4)` and `(5)` are preserved and may be selected',
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
  ] : []),
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
