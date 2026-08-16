import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const canonical = {
  matrix: fs.readFileSync(path.join(root, 'store/mobile-physical-smoke-matrix.md'), 'utf8'),
  readme: fs.readFileSync(path.join(root, 'store/README.md'), 'utf8'),
  checklist: fs.readFileSync(path.join(root, 'store/release-checklist.md'), 'utf8'),
}

function buildOpenResultFixture(markdown) {
  return markdown
    .split('\n')
    .map((line) => {
      if (!/^\| [MCL]\d{2} \|/.test(line)) return line
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
      const id = cells[0]
      if (id.startsWith('M') && cells.length === 9) {
        const results = ['M07', 'M08'].includes(id)
          ? ['N/A — tablet only', '—', 'N/A — tablet only', '—']
          : ['—', '—', '—', '—']
        return `| ${[...cells.slice(0, 4), ...results, '—'].join(' | ')} |`
      }
      if (id.startsWith('C') && cells.length === 8) {
        const results = ['C05', 'C06'].includes(id)
          ? ['N/A — tablet only', '—', 'N/A — tablet only', '—']
          : ['—', '—', '—', '—']
        return `| ${[...cells.slice(0, 3), ...results, '—'].join(' | ')} |`
      }
      if (id.startsWith('L') && cells.length === 8) {
        return `| ${[...cells.slice(0, 3), '—', '—', '—', '—', '—'].join(' | ')} |`
      }
      return line
    })
    .join('\n')
}

// Mutation probes use a deterministic open-results projection so legitimately filling the
// canonical execution packet cannot make the test harness fail before a mutation is exercised.
const actual = {
  ...canonical,
  matrix: buildOpenResultFixture(canonical.matrix),
}

const expectedFunctionalRows = new Map([
  ['M01', 'Install and launch identity'],
  ['M02', 'Registration'],
  ['M03', 'Study'],
  ['M04', 'Library persistence'],
  ['M05', 'Account and device access'],
  ['M06', 'Offline saved-study access'],
  ['M07', 'Microphone and local recording'],
  ['M08', 'Manuscript export/share'],
  ['M09', 'Purchase'],
  ['M10', 'Restore'],
  ['M11', 'Account deletion'],
])

const expectedFunctionalPlatforms = new Map([
  ['M01', 'All'],
  ['M02', 'iPhone, iPad, Android phone, Android tablet'],
  ['M03', 'All'],
  ['M04', 'All'],
  ['M05', 'All'],
  ['M06', 'All'],
  ['M07', 'iPad, Android tablet'],
  ['M08', 'iPad, Android tablet'],
  ['M09', 'iPhone, iPad, Android phone, Android tablet'],
  ['M10', 'iPhone, iPad, Android phone, Android tablet'],
  ['M11', 'All'],
])

const expectedControlRows = new Map([
  ['C01', 'Intro and account entry'],
  ['C02', 'Study start and reader'],
  ['C03', 'Library'],
  ['C04', 'Account and billing'],
  ['C05', 'Tablet PLAIN/SERMON desk'],
  ['C06', 'Manuscript, recorder, and Preach Mode'],
])

const expectedLegalRows = new Map([
  ['L01', ['PRIVACY POLICY', '`https://www.base1520.com/operator/privacy/`']],
  ['L02', ['TERMS OF USE', '`https://www.base1520.com/operator/terms/`']],
  ['L03', ['ACCOUNT DELETION', '`https://www.base1520.com/operator/account-deletion/`']],
  ['L04', ['CONTACT SUPPORT', '`https://www.base1520.com/contact/`']],
])

const deviceLabels = ['iPhone', 'iPad', 'Android phone', 'Android tablet']
const candidateFields = [
  'Distribution channel (TestFlight / Play internal)',
  'App version and build',
  'Bundle/package ID',
  'Reviewed source commit',
  'Candidate receipt/checksum pointer',
  'Installed identity evidence pointer',
  'Tester and local timestamp',
]

function tableRows(markdown, prefix) {
  return markdown
    .split('\n')
    .filter((line) => new RegExp(`^\\| ${prefix}\\d{2} \\|`).test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
}

function validate({ matrix, readme, checklist }) {
  const failures = []
  const compact = matrix.replace(/\s+/g, ' ')
  const functionalRows = tableRows(matrix, 'M')
  const controlRows = tableRows(matrix, 'C')
  const legalRows = tableRows(matrix, 'L')
  const candidateRows = matrix
    .split('\n')
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter(([field]) => candidateFields.includes(field))

  if (functionalRows.map(([id]) => id).join(',') !== [...expectedFunctionalRows.keys()].join(',')) {
    failures.push('functional smoke matrix keeps the exact M01-M11 sequence')
  }
  for (const [id, lane] of expectedFunctionalRows) {
    if (functionalRows.find(([candidate]) => candidate === id)?.[1] !== lane) {
      failures.push(`functional smoke matrix retains ${id} ${lane}`)
    }
  }
  const validResult = (value) => ['—', 'PASS', 'FAIL', 'BLOCKED'].includes(value) || /^N\/A — \S/.test(value)
  if (!matrix.includes('| ID | Lane | Platforms | Required physical action and observable pass condition | iPhone | iPad | Android phone | Android tablet | Device-matched non-secret evidence pointers / precise blockers |')
    || functionalRows.some((row) => row.length !== 9 || !row[2] || row[2] === '—' || !row[3] || row[3] === '—' || row.slice(4, 8).some((value) => !validResult(value)))) {
    failures.push('functional smoke rows retain platform, action, and valid per-device result cells')
  }
  if ([...expectedFunctionalPlatforms].some(([id, platforms]) => functionalRows.find(([candidate]) => candidate === id)?.[2] !== platforms)) {
    failures.push('functional smoke rows preserve explicit device applicability')
  }
  const tabletOnlyFunctionalRows = ['M07', 'M08'].map((id) => functionalRows.find(([candidate]) => candidate === id))
  if (tabletOnlyFunctionalRows.some((row) => !row || !row[4].startsWith('N/A — tablet only') || !row[6].startsWith('N/A — tablet only'))) {
    failures.push('tablet-only functional rows stay N/A on phone form factors')
  }
  const allDeviceFunctionalRows = functionalRows.filter(([id]) => !['M07', 'M08'].includes(id))
  if (allDeviceFunctionalRows.some((row) => row.slice(4, 8).some((value) => value.startsWith('N/A')))) {
    failures.push('all-device functional rows stay applicable on all four device classes')
  }

  if (controlRows.map(([id]) => id).join(',') !== [...expectedControlRows.keys()].join(',')) {
    failures.push('visible-control matrix keeps the exact C01-C06 sequence')
  }
  for (const [id, lane] of expectedControlRows) {
    if (controlRows.find(([candidate]) => candidate === id)?.[1] !== lane) {
      failures.push(`visible-control matrix retains ${id} ${lane}`)
    }
  }
  if (controlRows.some((row) => row.length !== 8 || !row[2] || row[2] === '—' || row.slice(3, 7).some((value) => !validResult(value)))) {
    failures.push('visible-control rows retain traversal and valid per-device result cells')
  }

  if (legalRows.map(([id]) => id).join(',') !== [...expectedLegalRows.keys()].join(',')) {
    failures.push('legal-link matrix keeps the exact L01-L04 sequence')
  }
  for (const [id, [control, destination]] of expectedLegalRows) {
    const row = legalRows.find(([candidate]) => candidate === id)
    if (row?.[1] !== control || row?.[2] !== destination) {
      failures.push(`legal-link matrix retains ${id} ${control} and its exact destination`)
    }
  }
  if (legalRows.some((row) => row.length !== 8 || row.slice(3, 7).some((value) => !validResult(value)))) {
    failures.push('legal-link rows retain valid per-device result cells')
  }
  const isRecordedResult = (value) => ['PASS', 'FAIL', 'BLOCKED'].includes(value)
  const parseDeviceEvidence = (value) => {
    const entries = new Map()
    if (!value || value === '—') return { entries, valid: true }
    for (const segment of value.split(';')) {
      const match = /^(iPhone|iPad|Android phone|Android tablet):\s*(\S(?:.*\S)?)$/.exec(segment.trim())
      if (!match || match[2] === '—' || entries.has(match[1])) return { entries, valid: false }
      entries.set(match[1], match[2])
    }
    return { entries, valid: true }
  }
  const evidenceDoesNotMatch = (row, start, end, evidenceIndex, expectedLength) => {
    if (row.length !== expectedLength) return false
    const recordedDevices = new Set(row.slice(start, end).flatMap((value, index) => (
      isRecordedResult(value) ? [deviceLabels[index]] : []
    )))
    const evidence = parseDeviceEvidence(row[evidenceIndex])
    return !evidence.valid
      || evidence.entries.size !== recordedDevices.size
      || [...recordedDevices].some((label) => !evidence.entries.has(label))
  }
  if (functionalRows.some((row) => evidenceDoesNotMatch(row, 4, 8, 8, 9))
    || controlRows.some((row) => evidenceDoesNotMatch(row, 3, 7, 7, 8))
    || legalRows.some((row) => evidenceDoesNotMatch(row, 3, 7, 7, 8))) {
    failures.push('recorded physical results require device-matched non-secret evidence pointers or precise blockers')
  }
  const prohibitedEvidencePatterns = [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /(?:^|[^0-9])\d{6}(?![0-9])/,
    /\bOPR-[A-Z0-9]{4}-[A-Z0-9]{4}\b/i,
    /\bbearer(?:[ _-]?token)?\s*[:=]\s*[A-Za-z0-9._~+/=-]{8,}\b/i,
    /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
    /\bverification[ _-]?code\s*[:=]\s*[^\s;]+/i,
    /\bdevice[ _-]?link[ _-]?code\s*[:=]\s*[^\s;]+/i,
    /\bcomp(?:ensation)?[ _-]?code\s*[:=]\s*[^\s;]+/i,
    /\breceipt[ _-]?body\s*[:=]\s*[^\s;]+/i,
    /\b(?:account|install)[ _-]?id\s*[:=]\s*[^\s;]+/i,
    /\brecording[ _-]?content\s*[:=]\s*[^\s;]+/i,
  ]
  const evidenceCells = [
    ...functionalRows.filter((row) => row.length === 9).map((row) => row[8]),
    ...controlRows.filter((row) => row.length === 8).map((row) => row[7]),
    ...legalRows.filter((row) => row.length === 8).map((row) => row[7]),
  ]
  if (evidenceCells.some((value) => prohibitedEvidencePatterns.some((pattern) => pattern.test(value)))) {
    failures.push('recorded physical evidence excludes prohibited sensitive data')
  }
  if (!compact.includes('system browser to open the exact HTTPS destination below')
    || !compact.includes("the return path to preserve the app's Account surface and state")) {
    failures.push('legal-link matrix requires destination, load, and return-path proof')
  }

  if (!matrix.includes('| Field | iPhone | iPad | Android phone | Android tablet |')
    || candidateRows.map(([field]) => field).join(',') !== candidateFields.join(',')
    || candidateRows.some((row) => row.length !== 5)
    || !compact.includes('Record app version and build as `<marketing version> (<platform build number>)`')
    || !compact.includes('Every recorded device in one run must share the same marketing version and reviewed source commit.')
    || !compact.includes('Apple and Android platform build numbers may differ.')
    || !compact.includes('Do not mix builds in one run.')) {
    failures.push('matrix binds results to one exact distributed candidate')
  }

  const recordedDeviceIndexes = new Set()
  for (const [rows, resultStart] of [
    [functionalRows, 4],
    [controlRows, 3],
    [legalRows, 3],
  ]) {
    for (const row of rows) {
      row.slice(resultStart, resultStart + deviceLabels.length).forEach((value, index) => {
        if (isRecordedResult(value)) recordedDeviceIndexes.add(index)
      })
    }
  }
  const candidateValuesByField = new Map(candidateRows.map(([field, ...values]) => [field, values]))
  const completeCandidateValuesByDevice = new Map()
  for (const deviceIndex of recordedDeviceIndexes) {
    const device = deviceLabels[deviceIndex]
    const values = candidateFields.map((field) => candidateValuesByField.get(field)?.[deviceIndex] ?? '')
    if (values.some((value) => !value || value === '—')) {
      failures.push(`recorded ${device} results require all seven candidate-identity values`)
      continue
    }
    const expectedChannel = deviceIndex < 2 ? 'TestFlight' : 'Play internal'
    if (values[0] !== expectedChannel) {
      failures.push(`recorded ${device} results require the ${expectedChannel} distribution channel`)
    }
    if (values[2] !== '`com.base1520.theoperator`') {
      failures.push(`recorded ${device} results require the canonical bundle/package ID`)
    }
    completeCandidateValuesByDevice.set(deviceIndex, values)
  }

  if (completeCandidateValuesByDevice.size === recordedDeviceIndexes.size
    && completeCandidateValuesByDevice.size > 0) {
    const parsedVersionBuildByDevice = new Map()
    let versionBuildFormatValid = true
    for (const [deviceIndex, values] of completeCandidateValuesByDevice) {
      const match = /^(\d+(?:\.\d+){2}) \((\d+)\)$/.exec(values[1])
      if (!match) {
        versionBuildFormatValid = false
        break
      }
      parsedVersionBuildByDevice.set(deviceIndex, {
        full: values[1],
        marketingVersion: match[1],
      })
    }
    if (!versionBuildFormatValid) {
      failures.push('recorded physical results require app version and build as <marketing version> (<platform build number>)')
    } else {
      const marketingVersions = new Set([...parsedVersionBuildByDevice.values()].map(({ marketingVersion }) => marketingVersion))
      if (marketingVersions.size > 1) {
        failures.push('recorded physical results require one consistent marketing version')
      }
      for (const [platform, deviceIndexes] of [
        ['Apple', [0, 1]],
        ['Android', [2, 3]],
      ]) {
        const platformVersionBuilds = deviceIndexes
          .filter((deviceIndex) => recordedDeviceIndexes.has(deviceIndex))
          .map((deviceIndex) => parsedVersionBuildByDevice.get(deviceIndex).full)
        if (new Set(platformVersionBuilds).size > 1) {
          failures.push(`recorded ${platform} results require one consistent app version and build`)
        }
      }
    }
    const reviewedSourceCommits = new Set(
      [...completeCandidateValuesByDevice.values()].map((values) => values[3]),
    )
    if (reviewedSourceCommits.size > 1) {
      failures.push('recorded physical results require one consistent reviewed source commit')
    }
  }

  const safetyPhrases = [
    'Record only `PASS`, `FAIL`, `BLOCKED`, or `N/A`',
    'must not contain an email address',
    'verification/device-link/comp code',
    'bearer',
    'receipt body',
    'account ID',
    'install ID',
    'recording content',
    'Every recorded `PASS`, `FAIL`, or `BLOCKED` needs a device-matched non-secret evidence pointer or precise blocker',
    'Use the exact labels `iPhone:`, `iPad:`, `Android phone:`, and `Android tablet:`',
    'Use a disposable non-review account for registration and deletion.',
    'Never delete the dedicated App Review account.',
    'A disabled control passes only when the user can see the prerequisite or transient reason and the control becomes actionable when that condition is satisfied.',
    'Purchase and restore rows require Apple sandbox/TestFlight or Play internal-track execution; a local or sideloaded build is insufficient.',
  ]
  if (!safetyPhrases.every((phrase) => compact.includes(phrase))) {
    failures.push('matrix evidence rules exclude credentials, identifiers, and reviewer-account deletion')
  }

  const tabletOnlyRows = ['C05', 'C06'].map((id) => controlRows.find(([candidate]) => candidate === id))
  if (tabletOnlyRows.some((row) => !row || !row[3].startsWith('N/A — tablet only') || !row[5].startsWith('N/A — tablet only'))) {
    failures.push('tablet-only control rows stay N/A on phone form factors')
  }

  if (!compact.includes('Creating or statically checking this packet proves none of those assertions.')
    || !compact.includes('Static source/bundle checks are supporting evidence only.')
    || !compact.includes('may be checked only when M01–M11 pass everywhere applicable')
    || !compact.includes('A `PASS` on one device is not evidence for another device.')
    || !compact.includes('Every recorded device result must also have its own matching labeled evidence pointer or blocker.')
    || !compact.includes('may be checked only when L01–L04 pass on every device class')
    || !compact.includes('may be checked only when C01–C06 pass everywhere applicable')) {
    failures.push('matrix preserves the static-versus-physical proof boundary')
  }

  if (!compact.includes('Build `1.4.2 (5)` must fail C05')
    || !compact.includes('not-ready tap explains the gate without opening Preach Mode')
    || !compact.includes('ready tap opens Preach Mode')) {
    failures.push('matrix retains the build-5 PREACH known-positive and future-candidate acceptance path')
  }

  if (!readme.includes('`mobile-physical-smoke-matrix.md`')) {
    failures.push('store README routes the physical smoke matrix')
  }
  const readmeCompact = readme.replace(/\s+/g, ' ')
  if (!readmeCompact.includes('A passing static check does not authorize submission and does not replace physical-device, sandbox-purchase, TestFlight, or Play internal-track testing.')) {
    failures.push('store README keeps static checks subordinate to physical and store-channel testing')
  }
  if (!checklist.includes('- [ ] Physical iPhone/iPad and Android smoke tests cover registration, study, library, account, deletion, microphone, export, and offline saved-study access.')
    || !checklist.includes('- [ ] No staged, mock, disabled, or dead control is visible in the full store build.')
    || !checklist.includes('- [ ] App links open every legal page from a physical device.')
    || checklist.split('`store/mobile-physical-smoke-matrix.md`').length - 1 < 3) {
    failures.push('canonical runtime assertions stay open and route to the execution matrix')
  }

  return failures
}

let passed = 0
let failed = 0

function check(name, run) {
  try {
    run()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  FAIL ${name}`)
    console.error(error instanceof Error ? error.message : String(error))
  }
}

function replaceRequired(source, target, replacement) {
  const mutated = source.replace(target, replacement)
  assert.notEqual(mutated, source, `mutation did not change input: ${String(target)}`)
  return mutated
}

function expectFailures(input, failures) {
  assert.deepEqual(validate(input), failures)
}

function fillCandidateIdentities(source, deviceIndexes = [0, 1, 2, 3]) {
  const valuesByField = new Map([
    ['Distribution channel (TestFlight / Play internal)', ['TestFlight', 'TestFlight', 'Play internal', 'Play internal']],
    ['App version and build', ['9.9.9 (999)', '9.9.9 (999)', '9.9.9 (999)', '9.9.9 (999)']],
    ['Bundle/package ID', Array(4).fill('`com.base1520.theoperator`')],
    ['Reviewed source commit', Array(4).fill('0123456789abcdef0123456789abcdef01234567')],
    ['Candidate receipt/checksum pointer', ['iphone-receipt', 'ipad-receipt', 'android-phone-receipt', 'android-tablet-receipt']],
    ['Installed identity evidence pointer', ['iphone-identity', 'ipad-identity', 'android-phone-identity', 'android-tablet-identity']],
    ['Tester and local timestamp', ['Tester · iPhone', 'Tester · iPad', 'Tester · Android phone', 'Tester · Android tablet']],
  ])
  return source
    .split('\n')
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
      const values = valuesByField.get(cells[0])
      if (!values || cells.length !== 5) return line
      for (const deviceIndex of deviceIndexes) cells[deviceIndex + 1] = values[deviceIndex]
      return `| ${cells.join(' | ')} |`
    })
    .join('\n')
}

function fillRepresentativeResults(source = actual.matrix) {
  let matrix = fillCandidateIdentities(source)
  matrix = replaceRequired(
    matrix,
    /^(\| M03 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 PASS | PASS | PASS | PASS | iPhone: m03-iphone; iPad: m03-ipad; Android phone: m03-android-phone; Android tablet: m03-android-tablet |',
  )
  matrix = replaceRequired(
    matrix,
    /^(\| M07 \|.*? \|) N\/A — tablet only \| — \| N\/A — tablet only \| — \| — \|$/m,
    '$1 N/A — tablet only | PASS | N/A — tablet only | PASS | iPad: m07-ipad; Android tablet: m07-android-tablet |',
  )
  matrix = replaceRequired(
    matrix,
    /^(\| L01 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 PASS | PASS | PASS | PASS | iPhone: l01-iphone; iPad: l01-ipad; Android phone: l01-android-phone; Android tablet: l01-android-tablet |',
  )
  return replaceRequired(
    matrix,
    /^(\| C01 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 PASS | PASS | PASS | PASS | iPhone: c01-iphone; iPad: c01-ipad; Android phone: c01-android-phone; Android tablet: c01-android-tablet |',
  )
}

check('canonical physical-smoke matrix is complete without claiming runtime readiness', () => {
  assert.deepEqual(validate(canonical), [])
})

check('valid recorded results do not collide with open-result mutation fixtures', () => {
  const matrix = fillRepresentativeResults()
  expectFailures({ ...canonical, matrix }, [])
  assert.equal(buildOpenResultFixture(matrix), fillCandidateIdentities(actual.matrix))
})

check('filled canonical rows still fail closed on incomplete device evidence', () => {
  const matrix = replaceRequired(
    fillRepresentativeResults(),
    'iPhone: c01-iphone; iPad: c01-ipad; Android phone: c01-android-phone; Android tablet: c01-android-tablet',
    'iPhone: c01-iphone',
  )
  expectFailures({ ...canonical, matrix }, [
    'recorded physical results require device-matched non-secret evidence pointers or precise blockers',
  ])
})

check('dropping offline access fails the exact functional-lane contract', () => {
  const matrix = replaceRequired(actual.matrix, /^\| M06 \|.*\n/m, '')
  expectFailures({ ...actual, matrix }, [
    'functional smoke matrix keeps the exact M01-M11 sequence',
    'functional smoke matrix retains M06 Offline saved-study access',
    'functional smoke rows preserve explicit device applicability',
  ])
})

check('dropping the tablet desk sweep fails the exact control-lane contract', () => {
  const matrix = replaceRequired(actual.matrix, /^\| C05 \|.*\n/m, '')
  expectFailures({ ...actual, matrix }, [
    'visible-control matrix keeps the exact C01-C06 sequence',
    'visible-control matrix retains C05 Tablet PLAIN/SERMON desk',
    'tablet-only control rows stay N/A on phone form factors',
  ])
})

check('dropping a legal destination fails the exact legal-link contract', () => {
  const matrix = replaceRequired(actual.matrix, /^\| L02 \|.*\n/m, '')
  expectFailures({ ...actual, matrix }, [
    'legal-link matrix keeps the exact L01-L04 sequence',
    'legal-link matrix retains L02 TERMS OF USE and its exact destination',
  ])
})

check('changing a legal destination fails closed', () => {
  const matrix = replaceRequired(
    actual.matrix,
    '`https://www.base1520.com/contact/`',
    '`https://www.base1520.com/operator/`',
  )
  expectFailures({ ...actual, matrix }, [
    'legal-link matrix retains L04 CONTACT SUPPORT and its exact destination',
  ])
})

check('blanking a functional action fails the row-shape contract', () => {
  const matrix = replaceRequired(
    actual.matrix,
    '| M06 | Offline saved-study access | All | After M04, enable airplane mode, cold-launch, open the saved study and notes, then reconnect. Existing local work remains readable; network-only actions fail visibly without erasing it. | — | — | — | — | — |',
    '| M06 | Offline saved-study access | All | — | — | — | — | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'functional smoke rows retain platform, action, and valid per-device result cells',
  ])
})

check('one shared iPad-only result cannot stand in for four-device functional evidence', () => {
  const matrix = replaceRequired(
    fillCandidateIdentities(actual.matrix, [0]),
    /^\| M02 \|.*$/m,
    '| M02 | Registration | iPhone, iPad, Android phone, Android tablet | Complete registration. | PASS | iPad-only observation |',
  )
  expectFailures({ ...actual, matrix }, [
    'functional smoke rows retain platform, action, and valid per-device result cells',
  ])
})

check('tablet-only functional lanes stay explicitly N/A on phone form factors', () => {
  const matrix = replaceRequired(
    actual.matrix,
    '| M07 | Microphone and local recording | iPad, Android tablet | In the SERMON desk, open Record, exercise deny then allow permission, record a short non-sensitive sample, stop, replay, and delete/share it. Every transition is visible and no recording is sent by default. | N/A — tablet only | — | N/A — tablet only | — | — |',
    '| M07 | Microphone and local recording | iPad, Android tablet | In the SERMON desk, open Record, exercise deny then allow permission, record a short non-sensitive sample, stop, replay, and delete/share it. Every transition is visible and no recording is sent by default. | — | — | — | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'tablet-only functional rows stay N/A on phone form factors',
  ])
})

check('a functional PASS without evidence fails closed', () => {
  const matrix = replaceRequired(
    fillCandidateIdentities(actual.matrix, [1]),
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical results require device-matched non-secret evidence pointers or precise blockers',
  ])
})

check('a visible-control failure without a precise blocker fails closed', () => {
  const matrix = replaceRequired(
    fillCandidateIdentities(actual.matrix, [0]),
    /^(\| C01 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 FAIL | — | — | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical results require device-matched non-secret evidence pointers or precise blockers',
  ])
})

check('a legal-link PASS without evidence fails closed', () => {
  const matrix = replaceRequired(
    fillCandidateIdentities(actual.matrix, [0]),
    /^(\| L01 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 PASS | — | — | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical results require device-matched non-secret evidence pointers or precise blockers',
  ])
})

check('all-device functional results require evidence for all four devices', () => {
  const matrix = replaceRequired(
    fillCandidateIdentities(actual.matrix),
    /^(\| M03 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 PASS | PASS | PASS | PASS | iPad: iPad-only observation |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical results require device-matched non-secret evidence pointers or precise blockers',
  ])
})

check('tablet-only functional results require evidence for both tablets', () => {
  const matrix = replaceRequired(
    fillCandidateIdentities(actual.matrix, [1, 3]),
    /^(\| M07 \|.*? \|) N\/A — tablet only \| — \| N\/A — tablet only \| — \| — \|$/m,
    '$1 N/A — tablet only | PASS | N/A — tablet only | PASS | iPad: iPad recording observation |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical results require device-matched non-secret evidence pointers or precise blockers',
  ])
})

check('legal-link results require evidence for every recorded device', () => {
  const matrix = replaceRequired(
    fillCandidateIdentities(actual.matrix),
    /^(\| L01 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 PASS | PASS | PASS | PASS | iPhone: iPhone-only observation |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical results require device-matched non-secret evidence pointers or precise blockers',
  ])
})

check('visible-control results require evidence for every recorded device', () => {
  const matrix = replaceRequired(
    fillCandidateIdentities(actual.matrix),
    /^(\| C01 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 PASS | PASS | PASS | PASS | Android tablet: tablet-only observation |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical results require device-matched non-secret evidence pointers or precise blockers',
  ])
})

check('complete device-matched evidence is accepted', () => {
  const matrix = replaceRequired(
    fillCandidateIdentities(actual.matrix),
    /^(\| M03 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 PASS | PASS | PASS | PASS | iPhone: iphone-observation; iPad: ipad-observation; Android phone: android-phone-observation; Android tablet: android-tablet-observation |',
  )
  expectFailures({ ...actual, matrix }, [])
})

check('an iPad result cannot be recorded before its complete candidate identity', () => {
  const matrix = replaceRequired(
    actual.matrix,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: ipad-registration |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded iPad results require all seven candidate-identity values',
  ])
})

check('a complete TestFlight iPad identity permits the same recorded result', () => {
  const matrix = replaceRequired(
    fillCandidateIdentities(actual.matrix, [1]),
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: ipad-registration |',
  )
  expectFailures({ ...actual, matrix }, [])
})

check('a recorded iPad result rejects a sideloaded distribution channel', () => {
  let matrix = fillCandidateIdentities(actual.matrix, [1])
  matrix = replaceRequired(
    matrix,
    '| Distribution channel (TestFlight / Play internal) | — | TestFlight | — | — |',
    '| Distribution channel (TestFlight / Play internal) | — | sideloaded | — | — |',
  )
  matrix = replaceRequired(
    matrix,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: ipad-registration |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded iPad results require the TestFlight distribution channel',
  ])
})

check('recorded Apple devices reject mixed TestFlight builds', () => {
  const matrix = replaceRequired(
    fillRepresentativeResults(),
    '| App version and build | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (999) |',
    '| App version and build | 9.9.9 (999) | 9.9.9 (998) | 9.9.9 (1) | 9.9.9 (1) |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded Apple results require one consistent app version and build',
  ])
})

check('recorded Android devices reject mixed Play-internal builds', () => {
  const matrix = replaceRequired(
    fillRepresentativeResults(),
    '| App version and build | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (999) |',
    '| App version and build | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (1) | 9.9.9 (2) |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded Android results require one consistent app version and build',
  ])
})

check('one run permits different Apple and Android platform build numbers', () => {
  const matrix = replaceRequired(
    fillRepresentativeResults(),
    '| App version and build | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (999) |',
    '| App version and build | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (1) | 9.9.9 (1) |',
  )
  expectFailures({ ...actual, matrix }, [])
})

check('recorded devices reject mixed marketing versions across platforms', () => {
  const matrix = replaceRequired(
    fillRepresentativeResults(),
    '| App version and build | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (999) |',
    '| App version and build | 9.9.9 (999) | 9.9.9 (999) | 9.9.8 (1) | 9.9.8 (1) |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical results require one consistent marketing version',
  ])
})

check('recorded devices reject mixed reviewed source commits', () => {
  const matrix = replaceRequired(
    fillRepresentativeResults(),
    '| Reviewed source commit | 0123456789abcdef0123456789abcdef01234567 | 0123456789abcdef0123456789abcdef01234567 | 0123456789abcdef0123456789abcdef01234567 | 0123456789abcdef0123456789abcdef01234567 |',
    '| Reviewed source commit | 0123456789abcdef0123456789abcdef01234567 | 0123456789abcdef0123456789abcdef01234567 | fedcba9876543210fedcba9876543210fedcba98 | fedcba9876543210fedcba9876543210fedcba98 |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical results require one consistent reviewed source commit',
  ])
})

check('recorded devices reject ambiguous version and build formatting', () => {
  const matrix = replaceRequired(
    fillRepresentativeResults(),
    '| App version and build | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (999) | 9.9.9 (999) |',
    '| App version and build | version nine build 999 | version nine build 999 | version nine build 1 | version nine build 1 |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical results require app version and build as <marketing version> (<platform build number>)',
  ])
})

check('weakening the no-mixed-builds contract fails closed', () => {
  const matrix = replaceRequired(
    actual.matrix,
    'Every recorded device in one run must share the same marketing version and reviewed\nsource commit.',
    'Recorded devices may use unrelated marketing versions and source commits.',
  )
  expectFailures({ ...actual, matrix }, [
    'matrix binds results to one exact distributed candidate',
  ])
})

for (const [name, evidence] of [
  ['an email address', 'cole@example.com'],
  ['a six-digit verification code', '123456'],
  ['an Operator device-link code', 'OPR-AAAA-AAAA'],
  ['a bearer credential', 'Bearer abcdefghijklmnop'],
  ['a labeled bearer credential', 'bearer: abcdefghijklmnop'],
  ['a labeled verification code', 'verification_code=private-code'],
  ['a labeled comp code', 'comp_code=private-code'],
  ['a receipt body', 'receipt_body=private-receipt'],
  ['an account ID', 'account_id=private-account'],
  ['an install ID', 'install ID=private-install'],
  ['recording content', 'recording_content=private-words'],
]) {
  check(`physical evidence rejects ${name}`, () => {
    const matrix = replaceRequired(
      fillCandidateIdentities(actual.matrix, [1]),
      /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
      `$1 — | PASS | — | — | iPad: ${evidence} |`,
    )
    expectFailures({ ...actual, matrix }, [
      'recorded physical evidence excludes prohibited sensitive data',
    ])
  })
}

check('safe local evidence pointers and value-free blockers remain accepted', () => {
  const identified = fillCandidateIdentities(actual.matrix, [1])
  const withPointer = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: local/screenshots/m02-ipad-registration.png |',
  )
  expectFailures({ ...actual, matrix: withPointer }, [])

  const withBlocker = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | BLOCKED | — | — | iPad: verification code not received, no receipt body was recorded, and no bearer credential was entered |',
  )
  expectFailures({ ...actual, matrix: withBlocker }, [])
})

check('weakening the evidence redaction rule fails closed', () => {
  const matrix = replaceRequired(actual.matrix, 'must not contain an email address', 'may contain an email address')
  expectFailures(
    { ...actual, matrix },
    ['matrix evidence rules exclude credentials, identifiers, and reviewer-account deletion'],
  )
})

check('promoting static packet completeness to runtime proof fails closed', () => {
  const matrix = replaceRequired(
    actual.matrix,
    'Creating or statically checking this packet proves none of those assertions.',
    'Creating or statically checking this packet proves all assertions.',
  )
  const checklist = replaceRequired(
    actual.checklist,
    '- [ ] No staged, mock, disabled, or dead control is visible in the full store build.',
    '- [x] No staged, mock, disabled, or dead control is visible in the full store build.',
  )
  expectFailures({ ...actual, matrix, checklist }, [
    'matrix preserves the static-versus-physical proof boundary',
    'canonical runtime assertions stay open and route to the execution matrix',
  ])
})

check('promoting the legal-link row without physical proof fails closed', () => {
  const checklist = replaceRequired(
    actual.checklist,
    '- [ ] App links open every legal page from a physical device.',
    '- [x] App links open every legal page from a physical device.',
  )
  expectFailures({ ...actual, checklist }, [
    'canonical runtime assertions stay open and route to the execution matrix',
  ])
})

check('losing the build-5 PREACH known-positive fails closed', () => {
  const matrix = replaceRequired(actual.matrix, 'Build `1.4.2 (5)` must fail C05', 'Build `1.4.2 (5)` may pass C05')
  expectFailures(
    { ...actual, matrix },
    ['matrix retains the build-5 PREACH known-positive and future-candidate acceptance path'],
  )
})

check('dropping a device class from candidate identity fails closed', () => {
  const matrix = replaceRequired(
    actual.matrix,
    '| Field | iPhone | iPad | Android phone | Android tablet |',
    '| Field | iPhone | iPad | Android phone |',
  )
  expectFailures({ ...actual, matrix }, [
    'matrix binds results to one exact distributed candidate',
  ])
})

check('dropping the README physical-test caveat fails closed', () => {
  const readme = replaceRequired(
    actual.readme,
    'A passing static check does not authorize submission and does not replace physical-device, sandbox-purchase, TestFlight, or Play internal-track testing.',
    'A passing static check authorizes submission.',
  )
  expectFailures({ ...actual, readme }, [
    'store README keeps static checks subordinate to physical and store-channel testing',
  ])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
