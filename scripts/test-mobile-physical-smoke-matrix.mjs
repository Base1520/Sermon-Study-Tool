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
  'Private configured-code comparison (after evidence entry)',
]

const privateCodeAttestation = 'PASS — compared privately; no configured code recorded'

function activeMarkdown(markdown) {
  // Multiline comments can conceal whole table rows. Single-line comment syntax inside an
  // otherwise active row is retained so the source-level redaction guard still rejects secrets
  // that someone tries to conceal in an evidence or candidate cell.
  const withoutComments = markdown.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => (
    comment.includes('\n') ? comment.replace(/[^\n]/g, '') : comment
  ))
  const activeLines = []
  let fence = null
  let rawHtml = null

  const rawHtmlStart = (line) => {
    const typeOne = /^ {0,3}<(pre|script|style|textarea)(?:\s|>|$)/i.exec(line)
    if (typeOne) return { until: new RegExp(`</${typeOne[1]}\\s*>`, 'i') }
    if (/^ {0,3}<\?/.test(line)) return { until: /\?>/ }
    if (/^ {0,3}<![A-Z]/.test(line)) return { until: />/ }
    if (/^ {0,3}<!\[CDATA\[/.test(line)) return { until: /\]\]>/ }
    const openingTag = /^ {0,3}<([A-Za-z][A-Za-z0-9-]*)(?:\s|\/?>|$)/.exec(line)
    if (openingTag) return { until: new RegExp(`</${openingTag[1]}\\s*>`, 'i') }
    if (/^ {0,3}<\/[A-Za-z][A-Za-z0-9-]*(?:\s|>|$)/.test(line)) return { untilBlank: true }
    return null
  }

  for (const line of withoutComments.split('\n')) {
    if (fence) {
      const closingFence = new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`)
      if (closingFence.test(line)) fence = null
      activeLines.push('')
      continue
    }

    if (rawHtml) {
      if ((rawHtml.until && rawHtml.until.test(line)) || (rawHtml.untilBlank && /^\s*$/.test(line))) {
        rawHtml = null
      }
      activeLines.push('')
      continue
    }

    const openingFence = /^ {0,3}(`{3,}|~{3,})(?:[^`].*)?$/.exec(line)
    if (openingFence) {
      fence = {
        marker: openingFence[1][0],
        length: openingFence[1].length,
      }
      activeLines.push('')
      continue
    }

    const openingRawHtml = rawHtmlStart(line)
    if (openingRawHtml) {
      if (!(openingRawHtml.until && openingRawHtml.until.test(line))) rawHtml = openingRawHtml
      activeLines.push('')
      continue
    }

    activeLines.push(/^(?: {4}|\t)/.test(line) ? '' : line)
  }

  return activeLines.join('\n')
}

const candidateTableHeader = '| Field | iPhone | iPad | Android phone | Android tablet |'
const candidateTableDelimiter = '| --- | --- | --- | --- | --- |'
const functionalTableHeader = '| ID | Lane | Platforms | Required physical action and observable pass condition | iPhone | iPad | Android phone | Android tablet | Device-matched non-secret evidence pointers / precise blockers |'
const functionalTableDelimiter = '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
const legalTableHeader = '| ID | App control | Exact destination | iPhone | iPad | Android phone | Android tablet | Device-matched evidence / blocker |'
const eightColumnTableDelimiter = '| --- | --- | --- | --- | --- | --- | --- | --- |'
const controlTableHeader = '| ID | Surface | Required traversal | iPhone | iPad | Android phone | Android tablet | Device-matched evidence / blocker |'

function boundTableRows(markdown, header, delimiter) {
  const lines = markdown.split('\n')
  const starts = lines
    .map((line, index) => (line === header && lines[index + 1] === delimiter ? index : -1))
    .filter((index) => index >= 0)
  if (starts.length !== 1) return []

  const rows = []
  for (let index = starts[0] + 2; index < lines.length && lines[index].startsWith('| '); index += 1) {
    rows.push(lines[index].split('|').slice(1, -1).map((cell) => cell.trim()))
  }
  return rows
}

function validate({ matrix, readme, checklist }) {
  const failures = []
  const activeMatrix = activeMarkdown(matrix)
  const compact = activeMatrix.replace(/\s+/g, ' ')
  const functionalRows = boundTableRows(activeMatrix, functionalTableHeader, functionalTableDelimiter)
    .filter(([id]) => /^M\d{2}$/.test(id))
  const controlRows = boundTableRows(activeMatrix, controlTableHeader, eightColumnTableDelimiter)
    .filter(([id]) => /^C\d{2}$/.test(id))
  const legalRows = boundTableRows(activeMatrix, legalTableHeader, eightColumnTableDelimiter)
    .filter(([id]) => /^L\d{2}$/.test(id))
  const candidateRows = boundTableRows(activeMatrix, candidateTableHeader, candidateTableDelimiter)

  if (functionalRows.map(([id]) => id).join(',') !== [...expectedFunctionalRows.keys()].join(',')) {
    failures.push('functional smoke matrix keeps the exact M01-M11 sequence')
  }
  for (const [id, lane] of expectedFunctionalRows) {
    if (functionalRows.find(([candidate]) => candidate === id)?.[1] !== lane) {
      failures.push(`functional smoke matrix retains ${id} ${lane}`)
    }
  }
  const validResult = (value) => ['—', 'PASS', 'FAIL', 'BLOCKED'].includes(value) || /^N\/A — \S/.test(value)
  if (!activeMatrix.includes('| ID | Lane | Platforms | Required physical action and observable pass condition | iPhone | iPad | Android phone | Android tablet | Device-matched non-secret evidence pointers / precise blockers |')
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
  const plainSixDigitPattern = /(?:^|[^\p{Nd}])\p{Nd}{6}(?!\p{Nd})/u
  const emailPattern = /[^\s/@]+@[^\s/@]+\.[^\s/@]+/gu
  const assetDensityPointerPattern = /^(?:.*\/)?[^/@\s]+@\d+(?:\.\d+)?x\.(?:png|jpe?g|webp|heic|pdf)$/i
  const contextualProhibitedPatterns = [
    /OPR-[A-Z0-9]{4}-[A-Z0-9]{4}/i,
    /opr_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/,
    /\bbearer(?:[ _-]?token)?\s*[:=]\s*[A-Za-z0-9._~+/=-]{8,}\b/i,
    /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
    /\bverification[ _-]?code\s*[:=]\s*[^\s;]+/i,
    /\bdevice[ _-]?link[ _-]?code\s*[:=]\s*[^\s;]+/i,
    /\bcomp(?:ensation)?[ _-]?code\s*[:=]\s*[^\s;]+/i,
    /\breceipt[ _-]?body\s*[:=]\s*[^\s;]+/i,
    /\b(?:account|install)[ _-]?id\s*[:=]\s*[^\s;]+/i,
    /\brecording[ _-]?content\s*[:=]\s*[^\s;]+/i,
    /(?:verification|device[ _-]?link|comp(?:ensation)?)[ _-]?code\s+\d{6}\b/i,
    /BUY-(?:[A-F0-9]{4}-){5}[A-F0-9]{4}/i,
    /OPERATOR[-_][A-Z0-9]+(?:[-_][A-Z0-9]+)*/i,
  ]
  const namedEntityValues = new Map([
    ['amp', '&'], ['commat', '@'], ['colon', ':'], ['equals', '='], ['sol', '/'],
    ['frasl', '/'], ['bsol', '\\'], ['period', '.'], ['hyphen', '-'], ['lowbar', '_'],
    ['tab', ' '], ['newline', ' '], ['nbsp', ' '], ['quot', ''], ['apos', ''],
    ['ldquo', ''], ['rdquo', ''], ['lsquo', ''], ['rsquo', ''], ['ast', ''],
    ['lowast', ''], ['grave', ''], ['excl', ''], ['lbrack', ''], ['rbrack', ''],
    ['lpar', ''], ['rpar', ''], ['lcub', ''], ['rcub', ''], ['lrm', ''], ['rlm', ''],
    ['zerowidthspace', ''], ['zwnj', ''], ['zwj', ''],
  ])
  const decodeSensitiveEscapes = (value) => {
    let decoded = String(value)
    while (true) {
      const next = decoded
        .replace(/&#(x[0-9a-f]+|\d+);?/gi, (entity, encoded) => {
          const isHex = encoded[0]?.toLowerCase() === 'x'
          const codePoint = Number.parseInt(isHex ? encoded.slice(1) : encoded, isHex ? 16 : 10)
          return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
            ? String.fromCodePoint(codePoint)
            : entity
        })
        .replace(/%([0-9a-f]{2})/gi, (escape, encoded) => {
          const codePoint = Number.parseInt(encoded, 16)
          return codePoint >= 0x20 && codePoint <= 0x7e ? String.fromCodePoint(codePoint) : escape
        })
        .replace(/&([a-z][a-z0-9]+);?/gi, (entity, name) => namedEntityValues.get(name.toLowerCase()) ?? '')
      if (next === decoded) break
      decoded = next
    }
    return decoded
  }
  const normalizeSensitiveSyntax = (value) => {
    const source = decodeSensitiveEscapes(value)
    const renderedMarkup = source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, '$1')
      .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    const scanSource = renderedMarkup === source ? source : `${renderedMarkup} ${source}`
    return scanSource
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, '$1 $2 $1')
      .replace(/\\(?=[:=*!`'"[\](){}<>])/g, '')
      .replace(/\\/g, '/')
      .replace(/[!`'"“”‘’„‟‚‛«»‹›*~[\](){}<>\p{Cf}\uFE00-\uFE0F]/gu, '')
      .replace(/\s*([/._:-])\s*/g, '$1')
  }
  const labelledCodePathPattern = /(verification(?:[ _./:-]*code)?|device[ _./:-]*link(?:[ _./:-]*code)?|(?:comp(?:ensation)?|access|redeem|redemption|promo)[ _./:-]*code)[-_./:=]*([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)(?=$|[\s./:])/gi
  const explicitCodeLabelPattern = /(?:verification(?:[ _./:-]*code)?|device[ _./:-]*link(?:[ _./:-]*code)?|(?:comp(?:ensation)?|access|redeem|redemption|promo)[ _./:-]*code)(?=$|[^\s])/i
  const valueFreeCodeScreenshotPointerPattern = /^(?:[A-Za-z0-9._-]+\/)*(?:verification|device[-_.]?link|comp(?:ensation)?)[-_.]?code[-_.]?screenshot(?:[-_](?:iphone|ipad|android|phone|tablet|dark|light|before|after|\d+))*\.(?:png|jpe?g|webp|heic|pdf|txt|json|log)$/i
  const containsDeviceLinkEquivalent = (value) => {
    const upper = value.toUpperCase()
    return /O[^A-Z0-9]*P[^A-Z0-9]*R(?:[^A-Z0-9]*[A-HJ-NP-Z2-9]){8}(?![A-Z0-9])/.test(upper)
  }
  const containsContextualSecret = (value) => {
    const normalized = normalizeSensitiveSyntax(value)
    const emailMatches = [...normalized.matchAll(emailPattern)].map(([match]) => match)
    if (emailMatches.some((match) => !assetDensityPointerPattern.test(match))) return true
    if (contextualProhibitedPatterns.some((pattern) => pattern.test(normalized))) return true
    if (containsDeviceLinkEquivalent(String(value)) || containsDeviceLinkEquivalent(normalized)) return true
    if (explicitCodeLabelPattern.test(normalized) && !valueFreeCodeScreenshotPointerPattern.test(normalized)) return true
    if (/(?:verification(?:[ _./:-]*code)?|device[ _./:-]*link(?:[ _./:-]*code)?|(?:comp(?:ensation)?|access|redeem|redemption|promo)[ _./:-]*code)[-_./:=]*[A-Z0-9]{6}(?=$|[\s._/:-])/i.test(normalized)) return true
    return [...normalized.matchAll(labelledCodePathPattern)]
      .some(() => !valueFreeCodeScreenshotPointerPattern.test(normalized))
  }
  const exactHexPointerPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64}|sha-?1:[0-9a-f]{40}|sha-?256:[0-9a-f]{64})$/i
  const containsUnscopedSixDigitCode = (value) => {
    const markdownPointer = /^!?\[([^\]]*)\]\(([^)]*)\)$/.exec(String(value).trim())
    const representations = markdownPointer ? [markdownPointer[1], markdownPointer[2]] : [value]
    return representations.some((representation) => {
      const normalized = normalizeSensitiveSyntax(representation)
      if (exactHexPointerPattern.test(normalized)) return false
      const unscoped = normalized
        .replace(/\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}/g, '')
        .replace(/(^|[^A-Za-z0-9])(build[-_.])\d{6}(?=$|[^0-9])/gi, '$1$2')
      return plainSixDigitPattern.test(unscoped)
    })
  }
  const candidateTesterTimestampIsValid = (value) => {
    const match = /^(\S(?:.*\S)?) · (\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([+-])(\d{2}):(\d{2})$/.exec(value)
    if (!match) return false
    const [, , yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, fractionRaw = '0', sign, offsetHourRaw, offsetMinuteRaw] = match
    const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = [
      yearRaw,
      monthRaw,
      dayRaw,
      hourRaw,
      minuteRaw,
      secondRaw,
      offsetHourRaw,
      offsetMinuteRaw,
    ].map(Number)
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
      || hour > 23 || minute > 59 || second > 59
      || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)
      || (sign === '-' && offsetHour === 0 && offsetMinute === 0)) return false
    const fraction = Number(fractionRaw.slice(0, 3).padEnd(3, '0'))
    const offset = (offsetHour * 60 + offsetMinute) * (sign === '+' ? 1 : -1)
    const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, fraction) - offset * 60_000
    return Number.isFinite(timestamp) && timestamp <= Date.now()
  }
  const evidenceCells = [
    ...functionalRows.filter((row) => row.length === 9).map((row) => row[8]),
    ...controlRows.filter((row) => row.length === 8).map((row) => row[7]),
    ...legalRows.filter((row) => row.length === 8).map((row) => row[7]),
  ]
  const resultCells = [
    ...functionalRows.filter((row) => row.length === 9).flatMap((row) => row.slice(4, 8)),
    ...controlRows.filter((row) => row.length === 8).flatMap((row) => row.slice(3, 7)),
    ...legalRows.filter((row) => row.length === 8).flatMap((row) => row.slice(3, 7)),
  ]
  const evidenceHasPlainCode = evidenceCells.some((value) => {
    const evidence = parseDeviceEvidence(value)
    if (!evidence.valid) return containsUnscopedSixDigitCode(value)
    return [...evidence.entries.values()].some(containsUnscopedSixDigitCode)
  })
  if (
    [...resultCells, ...evidenceCells].some(containsContextualSecret)
    || resultCells.some(containsUnscopedSixDigitCode)
    || evidenceHasPlainCode
  ) {
    failures.push('recorded physical evidence excludes prohibited sensitive data')
  }
  const candidateValues = candidateRows.flatMap(([, ...values]) => values)
  const candidateTesterValues = candidateRows
    .find(([field]) => field === 'Tester and local timestamp')
    ?.slice(1) ?? []
  const candidatePointerValues = candidateRows
    .filter(([field]) => [
      'Candidate receipt/checksum pointer',
      'Installed identity evidence pointer',
    ].includes(field))
    .flatMap(([, ...values]) => values)
  if (
    candidateValues.some(containsContextualSecret)
    || candidateValues.some((value) => /^\d{6}$/.test(value.trim()))
    || candidateTesterValues.some(containsUnscopedSixDigitCode)
    || candidatePointerValues.some(containsUnscopedSixDigitCode)
  ) {
    failures.push('recorded candidate identity excludes prohibited sensitive data')
  }
  if (candidateTesterValues.some((value) => value !== '—' && !candidateTesterTimestampIsValid(value))) {
    failures.push('candidate tester values use an identified local RFC3339 timestamp with a known offset')
  }
  if (!compact.includes('system browser to open the exact HTTPS destination below')
    || !compact.includes("the return path to preserve the app's Account surface and state")) {
    failures.push('legal-link matrix requires destination, load, and return-path proof')
  }

  if (!activeMatrix.includes('| Field | iPhone | iPad | Android phone | Android tablet |')
    || candidateRows.map(([field]) => field).join(',') !== candidateFields.join(',')
    || candidateRows.some((row) => row.length !== 5)
    || !compact.includes('Record app version and build as `<marketing version> (<platform build number>)`')
    || !compact.includes('Record tester and local timestamp as `<identified tester> · <RFC3339 timestamp with numeric offset>`')
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
  const reviewedSourceValues = candidateValuesByField.get('Reviewed source commit') ?? []
  if (reviewedSourceValues.some((value) => value !== '—' && !/^[0-9a-f]{40}$/.test(value))) {
    failures.push('candidate reviewed source commits use full 40-character lowercase Git object IDs')
  }
  let unrecordedStructuredValueIsInvalid = false
  for (let deviceIndex = 0; deviceIndex < deviceLabels.length; deviceIndex += 1) {
    if (recordedDeviceIndexes.has(deviceIndex)) continue
    const expectedChannel = deviceIndex < 2 ? 'TestFlight' : 'Play internal'
    const channel = candidateValuesByField.get('Distribution channel (TestFlight / Play internal)')?.[deviceIndex]
    const versionBuild = candidateValuesByField.get('App version and build')?.[deviceIndex]
    const bundleId = candidateValuesByField.get('Bundle/package ID')?.[deviceIndex]
    const privateComparison = candidateValuesByField.get('Private configured-code comparison (after evidence entry)')?.[deviceIndex]
    if ((channel && channel !== '—' && channel !== expectedChannel)
      || (versionBuild && versionBuild !== '—' && !/^\d+(?:\.\d+){2} \(\d+\)$/.test(versionBuild))
      || (bundleId && bundleId !== '—' && bundleId !== '`com.base1520.theoperator`')
      || (privateComparison && privateComparison !== '—' && privateComparison !== privateCodeAttestation)) {
      unrecordedStructuredValueIsInvalid = true
    }
  }
  if (unrecordedStructuredValueIsInvalid) {
    failures.push('candidate identity values use valid field-specific formats before results are recorded')
  }
  const completeCandidateValuesByDevice = new Map()
  for (const deviceIndex of recordedDeviceIndexes) {
    const device = deviceLabels[deviceIndex]
    const values = candidateFields.map((field) => candidateValuesByField.get(field)?.[deviceIndex] ?? '')
    if (values.some((value) => !value || value === '—')) {
      failures.push(`recorded ${device} results require all eight candidate-identity and redaction values`)
      continue
    }
    const expectedChannel = deviceIndex < 2 ? 'TestFlight' : 'Play internal'
    if (values[0] !== expectedChannel) {
      failures.push(`recorded ${device} results require the ${expectedChannel} distribution channel`)
    }
    if (values[2] !== '`com.base1520.theoperator`') {
      failures.push(`recorded ${device} results require the canonical bundle/package ID`)
    }
    if (values[7] !== privateCodeAttestation) {
      failures.push(`recorded ${device} results require the exact private configured-code comparison attestation`)
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
    'Candidate-identity values and evidence pointers may identify',
    'full 40-character lowercase Git object ID',
    'must not contain an email address',
    'verification/device-link/comp code',
    'bearer',
    'receipt body',
    'account ID',
    'install ID',
    'recording content',
    'bare 40/64-character hexadecimal object or digest',
    'An isolated six-digit value or path segment is forbidden',
    'checks only its syntax and cross-device consistency',
    'static pattern matching cannot prove an unlabeled arbitrary string safe',
    'Enter `PASS — compared privately; no configured code recorded` only after comparing every value, result reason, and evidence pointer for that device against the private configured-code inventory.',
    'The guard verifies that this attestation is present, not that the private comparison was truthful or complete.',
    'the timestamp must not be in the future',
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
  if (!readmeCompact.includes('Neither command authorizes upload or submission or replaces physical-device, sandbox-purchase, TestFlight, or Play internal-track testing.')) {
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

function expectFailures(input, failures, context) {
  assert.deepEqual(validate(input), failures, context)
}

function fillCandidateIdentities(source, deviceIndexes = [0, 1, 2, 3]) {
  const valuesByField = new Map([
    ['Distribution channel (TestFlight / Play internal)', ['TestFlight', 'TestFlight', 'Play internal', 'Play internal']],
    ['App version and build', ['9.9.9 (999)', '9.9.9 (999)', '9.9.9 (999)', '9.9.9 (999)']],
    ['Bundle/package ID', Array(4).fill('`com.base1520.theoperator`')],
    ['Reviewed source commit', Array(4).fill('0123456789abcdef0123456789abcdef01234567')],
    ['Candidate receipt/checksum pointer', ['iphone-receipt', 'ipad-receipt', 'android-phone-receipt', 'android-tablet-receipt']],
    ['Installed identity evidence pointer', ['iphone-identity', 'ipad-identity', 'android-phone-identity', 'android-tablet-identity']],
    ['Tester and local timestamp', [
      'Tester iPhone · 2026-08-16T12:00:00-05:00',
      'Tester iPad · 2026-08-16T12:00:00-05:00',
      'Tester Android phone · 2026-08-16T12:00:00-05:00',
      'Tester Android tablet · 2026-08-16T12:00:00-05:00',
    ]],
    ['Private configured-code comparison (after evidence entry)', Array(4).fill(privateCodeAttestation)],
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

function buildRecordedIpadM02PassFixture() {
  return replaceRequired(
    fillCandidateIdentities(actual.matrix, [1]),
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: ipad-registration |',
  )
}

function replacePrivateCodeAttestationRow(source, render) {
  const prefix = '| Private configured-code comparison (after evidence entry) |'
  const rows = source.split('\n').filter((line) => line.startsWith(prefix))
  assert.equal(rows.length, 1)
  return replaceRequired(source, rows[0], render(rows[0]))
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
    'recorded iPad results require all eight candidate-identity and redaction values',
  ])
})

check('a complete TestFlight iPad identity permits the same recorded result', () => {
  const matrix = replaceRequired(
    fillCandidateIdentities(actual.matrix, [1]),
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: ipad-registration |',
  )
  expectFailures({ ...actual, matrix }, [])

  const falseAttestation = replaceRequired(
    matrix,
    `| Private configured-code comparison (after evidence entry) | — | ${privateCodeAttestation} | — | — |`,
    '| Private configured-code comparison (after evidence entry) | — | PASS | — | — |',
  )
  expectFailures({ ...actual, matrix: falseAttestation }, [
    'recorded iPad results require the exact private configured-code comparison attestation',
  ])
})

const missingActiveCandidateFailures = [
  'matrix binds results to one exact distributed candidate',
  'recorded iPad results require all eight candidate-identity and redaction values',
]

check('candidate rows hidden in a Markdown HTML comment cannot authorize a recorded iPad PASS', () => {
  const matrix = replacePrivateCodeAttestationRow(
    buildRecordedIpadM02PassFixture(),
    (row) => `<!--\n${row}\n-->`,
  )
  expectFailures({ ...actual, matrix }, missingActiveCandidateFailures)
})

check('candidate rows hidden in a fenced Markdown code block cannot authorize a recorded iPad PASS', () => {
  const matrix = replacePrivateCodeAttestationRow(
    buildRecordedIpadM02PassFixture(),
    (row) => `\`\`\`text\n${row}\n\`\`\``,
  )
  expectFailures({ ...actual, matrix }, missingActiveCandidateFailures)
})

check('candidate rows hidden in indented Markdown code blocks cannot authorize a recorded iPad PASS', () => {
  for (const indent of ['    ', '\t']) {
    const matrix = replacePrivateCodeAttestationRow(
      buildRecordedIpadM02PassFixture(),
      (row) => `${indent}${row}`,
    )
    expectFailures({ ...actual, matrix }, missingActiveCandidateFailures, JSON.stringify(indent))
  }
})

check('candidate attestation hidden in CommonMark raw HTML blocks cannot authorize a recorded iPad PASS', () => {
  const wrappers = [
    ['pre', (row) => `<pre>\n${row}\n</pre>`],
    ['script', (row) => `<script>\n\n${row}\n</script>`],
    ['style', (row) => `<style>\n${row}\n</style>`],
    ['textarea', (row) => `<textarea>\n${row}\n</textarea>`],
    ['processing instruction', (row) => `<?operator\n${row}\n?>`],
    ['declaration', (row) => `<!UPPER\n${row}\n>`],
    ['CDATA', (row) => `<![CDATA[\n${row}\n]]>`],
    ['div block', (row) => `<div>\n${row}\n</div>\n`],
    ['table block', (row) => `<table>\n${row}\n</table>\n`],
    ['template block across a blank line', (row) => `<template>\n\n${row}\n</template>`],
    ['details block across a blank line', (row) => `<details>\n\n${row}\n</details>`],
    ['custom block across a blank line', (row) => `<operator-audit>\n\n${row}\n</operator-audit>`],
  ]

  for (const [variant, wrap] of wrappers) {
    const matrix = replacePrivateCodeAttestationRow(buildRecordedIpadM02PassFixture(), wrap)
    expectFailures({ ...actual, matrix }, missingActiveCandidateFailures, variant)
  }
})

check('candidate attestation hidden in an unclosed generic HTML block cannot authorize a recorded iPad PASS', () => {
  const fixture = buildRecordedIpadM02PassFixture()
  const prefix = '| Private configured-code comparison (after evidence entry) |'
  const attestationRow = fixture.split('\n').find((line) => line.startsWith(prefix))
  assert.ok(attestationRow)

  for (const tag of ['template', 'details', 'operator-audit']) {
    const matrix = `${replaceRequired(fixture, attestationRow, '')}\n\n<${tag}>\n\n${attestationRow}`
    expectFailures({ ...actual, matrix }, missingActiveCandidateFailures, `unclosed ${tag}`)
  }
})

check('candidate attestation disconnected from its rendered table cannot authorize a recorded iPad PASS', () => {
  const fixture = buildRecordedIpadM02PassFixture()
  const prefix = '| Private configured-code comparison (after evidence entry) |'
  const attestationRow = fixture.split('\n').find((line) => line.startsWith(prefix))
  assert.ok(attestationRow)

  const afterBlankLine = replaceRequired(fixture, attestationRow, `\n${attestationRow}`)
  expectFailures({ ...actual, matrix: afterBlankLine }, missingActiveCandidateFailures, 'blank before attestation')

  const movedStandalone = `${replaceRequired(fixture, attestationRow, '')}\n\n${attestationRow}`
  expectFailures({ ...actual, matrix: movedStandalone }, missingActiveCandidateFailures, 'standalone attestation')
})

check('disconnected functional, legal, and control rows are excluded from their rendered tables', () => {
  for (const [id, header, delimiter] of [
    ['M11', functionalTableHeader, functionalTableDelimiter],
    ['L04', legalTableHeader, eightColumnTableDelimiter],
    ['C06', controlTableHeader, eightColumnTableDelimiter],
  ]) {
    const row = actual.matrix.split('\n').find((line) => line.startsWith(`| ${id} |`))
    assert.ok(row)
    const matrix = `${replaceRequired(actual.matrix, row, '')}\n\n${row}`
    assert.equal(boundTableRows(activeMarkdown(matrix), header, delimiter).some(([candidate]) => candidate === id), false)
  }
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

const sensitiveRecordExamples = [
  ['an email address', [
    'cole@example.com',
    'josé@example.com',
    'δοκιμή@παράδειγμα.δοκιμή',
    'cole&commat;example.com',
    'cole&amp;commat;example.com',
    'cole@exam<em>ple</em>.com',
    'local/person@example.com/m02@2x.png',
  ]],
  ['a six-digit verification code', '123456'],
  ['an Operator device-link code', [
    'OPR-AAAA-AAAA',
    'O\u0301PR-AAAA-AAAA',
    'OPR-A\u0301AAA-AAAA',
    'OPR-AAAA-A\u0300AAA',
    'OÁPR-AAAA-AAAA',
    'OéPR-AAAA-AAAA',
    'OPR-ÁAAAA-AAAA',
    'OPR-AAÁAA-AAAA',
    'O&lrm;P&lrm;R-A-B-C-D-E-F-G-H',
  ]],
  ['a compact redemption-equivalent device-link code', ['OPRAAAAAAAA', 'OPR:AA:AA:AA:AA']],
  ['a slash-form redemption-equivalent device-link code', [
    'OPR/AAAA/AAAA',
    'O/P/R/AAAA/AAAA',
    'OPR/A/A/A/A/A/A/A/A',
    'local/OPR/A/B/C/D/E/F/G/H.txt',
    'local/device-link-code-screenshot/ABCDEF.txt',
  ]],
  ['a space-form redemption-equivalent device-link code', ['OPR AAAA AAAA', 'O P R A A A A A A A A']],
  ['an underscore-form redemption-equivalent device-link code', 'OPR_AAAA_AAAA'],
  ['a dotted redemption-equivalent device-link code', 'O.P.R.A.A.A.A.A.A.A.A'],
  ['a website purchase code', [
    'BUY-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF',
    'receipt_BUY-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF.png',
    'BUY-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF_receipt.png',
  ]],
  ['an Operator comp code', ['OPERATOR-ABC123', 'receipt_OPERATOR-ABC123.png']],
  ['an underscored Operator comp code', 'OPERATOR_SECRET'],
  ['a lowercase redemption-equivalent Operator comp code', 'operator-abc123'],
  ['a bearer credential', ['Bearer abcdefghijklmnop', `opr_${'A'.repeat(43)}`]],
  ['a labeled bearer credential', [
    'bearer: abcdefghijklmnop',
    'bearer&colon;&Tab;abcdefghijklmnop',
    'bearer&amp;colon; abcdefghijklmnop',
    'bearer&amp;#58; abcdefghijklmnop',
    'bearer%253A abcdefghijklmnop',
    'bear<em>er</em>: abcdefghijklmnop',
    'bear<!--x-->er: abcdefghijklmnop',
    'bear~~er~~: abcdefghijklmnop',
    '~~bearer~~: abcdefghijklmnop',
    '[bear<em>er</em>](https://example.com): abcdefghijklmnop',
    '<!-- bearer: abcdefghijklmnop -->',
    '<a href="https://example.com?bearer=abcdefghijklmnop">receipt</a>',
    '<img alt="bearer: abcdefghijklmnop">',
  ]],
  ['a labeled verification code', [
    'verification_code=private-code',
    'verification-code123456.png',
    'verificationcode123456.png',
    'verifi<em>cation</em> code: ABCDEF',
    'verifi~~cation~~ code: ABCDEF',
    '<https://example.com?verification_code=123456>',
    'local/verification-code-screenshot/ABCDEF.txt',
    '[verification](https://x.invalid)[ code](https://x.invalid): ABCDEF',
    '[verification code][ref]: ABCDEF',
  ]],
  ['a labeled comp code', [
    'comp_code=private-code',
    'compcode-FREEPASS2026',
    'comp%252Dcode%253DFREEPASS2026',
    'access-code-FREEPASS2026',
    'redeem-code-FREEPASS2026',
    'redemption-code-FREEPASS2026',
    'promo-code-FREEPASS2026',
    'local/comp-code-$FREEPASS2026.txt',
    'local/comp-code-+FREEPASS2026.txt',
    'local/comp-code-秘密.txt',
    'local/comp-code-screenshot.PRIVATE.txt',
    '[comp](https://x.invalid)[ code](https://x.invalid)-FREEPASS2026',
  ]],
  ['a receipt body', 'receipt_body=private-receipt'],
  ['an account ID', 'account_id=private-account'],
  ['an install ID', 'install ID=private-install'],
  ['recording content', 'recording_content=private-words'],
]

for (const [name, rawExamples] of sensitiveRecordExamples) {
  check(`physical evidence rejects ${name}`, () => {
    for (const evidence of Array.isArray(rawExamples) ? rawExamples : [rawExamples]) {
      const matrix = replaceRequired(
        fillCandidateIdentities(actual.matrix, [1]),
        /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
        `$1 — | PASS | — | — | iPad: ${evidence} |`,
      )
      expectFailures({ ...actual, matrix }, evidence.includes(';') ? [
        'recorded physical results require device-matched non-secret evidence pointers or precise blockers',
        'recorded physical evidence excludes prohibited sensitive data',
      ] : [
        'recorded physical evidence excludes prohibited sensitive data',
      ], evidence)
    }
  })
}

for (const [name, rawExamples] of sensitiveRecordExamples) {
  check(`candidate identity rejects ${name}`, () => {
    for (const value of Array.isArray(rawExamples) ? rawExamples : [rawExamples]) {
      let matrix = fillCandidateIdentities(actual.matrix, [1])
      matrix = replaceRequired(
        matrix,
        '| Candidate receipt/checksum pointer | — | ipad-receipt | — | — |',
        `| Candidate receipt/checksum pointer | — | ${value} | — | — |`,
      )
      expectFailures({ ...actual, matrix }, [
        'recorded candidate identity excludes prohibited sensitive data',
      ], value)
    }
  })
}

check('candidate tester details reject an embedded six-digit verification code', () => {
  let matrix = fillCandidateIdentities(actual.matrix, [1])
  matrix = replaceRequired(
    matrix,
    '| Tester and local timestamp | — | Tester iPad · 2026-08-16T12:00:00-05:00 | — | — |',
    '| Tester and local timestamp | — | Tester 123456 · 2026-08-16T12:00:00-05:00 | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded candidate identity excludes prohibited sensitive data',
  ])
})

check('candidate identity rejects a whitespace-labeled verification code', () => {
  let matrix = fillCandidateIdentities(actual.matrix, [1])
  matrix = replaceRequired(
    matrix,
    '| Candidate receipt/checksum pointer | — | ipad-receipt | — | — |',
    '| Candidate receipt/checksum pointer | — | verification code 123456 | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded candidate identity excludes prohibited sensitive data',
  ])
})

check('candidate identity rejects a filename-labeled verification code', () => {
  let matrix = fillCandidateIdentities(actual.matrix, [1])
  matrix = replaceRequired(
    matrix,
    '| Candidate receipt/checksum pointer | — | ipad-receipt | — | — |',
    '| Candidate receipt/checksum pointer | — | local/verification-code-123456.png | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded candidate identity excludes prohibited sensitive data',
  ])
})

for (const [name, value] of [
  ['slash-delimited verification code', 'local/verification-code/123456.png'],
  ['dot-delimited verification code', 'local/verification-code.123456.png'],
  ['repeated-delimiter verification code', 'local/verification-code--123456.png'],
  ['filename-labeled alphanumeric comp code', 'local/comp-code-ABCDEF.txt'],
  ['numeric-only pointer segment', 'local/screenshots/123456.png'],
  ['slash-split alphanumeric verification code', 'local/verification/code/ABCDEF.txt'],
  ['dot-split alphanumeric verification code', 'local/verification.code.ABCDEF.txt'],
  ['slash-split alphanumeric device-link code', 'local/device/link/code/ABCDEF.txt'],
  ['separator-split alphanumeric verification code', 'local/verification-code-AB-CD-EF.txt'],
  ['prefixed Operator comp code', 'local/comp-code-OPERATOR-ABC123.png'],
  ['lowercase prefixed Operator comp code', 'local/comp-code-operator-abc123.png'],
  ['spaced split-label code', 'local/comp / code / ABCDEF.txt'],
  ['labeled code with a numeric suffix', 'local/verification-code-123456-note.png'],
  ['labeled code with an alphanumeric suffix', 'local/verification-code-ABCDEF-note.png'],
  ['unlabeled numeric filename suffix', [
    'local/screenshot-123456.png',
    'local/screenshot123456.png',
    'local/123456note.png',
    'local/x123456y.png',
    'local/123456/build-654321.png',
    'C:\\screenshots\\123456\\build-654321.png',
    'build-123456-654321.png',
    'local/١٢٣٤٥٦.png',
    'local/۱۲۳۴۵۶.png',
    'local/१२३४५६.png',
  ]],
  ['hidden numeric filename segment', 'local/screenshots/.123456.png'],
  ['dot-delimited numeric filename segment', 'local/screenshot.123456.png'],
  ['Windows numeric-only path segment', 'C:\\screenshots\\123456.png'],
  ['Markdown-link verification label', '[verification code](https://example.com): ABCDEF'],
  ['arbitrary configured comp-code filename', 'local/comp-code-PRIVATE-COMP-CODE.txt'],
  ['arbitrary configured compact comp-code filename', 'local/comp-code-FREEPASS2026.txt'],
]) {
  check(`candidate identity rejects a ${name}`, () => {
    for (const example of Array.isArray(value) ? value : [value]) {
      let matrix = fillCandidateIdentities(actual.matrix, [1])
      matrix = replaceRequired(
        matrix,
        '| Candidate receipt/checksum pointer | — | ipad-receipt | — | — |',
        `| Candidate receipt/checksum pointer | — | ${example} | — | — |`,
      )
      expectFailures({ ...actual, matrix }, [
        'recorded candidate identity excludes prohibited sensitive data',
      ])
    }
  })
}

check('candidate identity rejects a Markdown-wrapped bearer', () => {
  let matrix = fillCandidateIdentities(actual.matrix, [1])
  matrix = replaceRequired(
    matrix,
    '| Candidate receipt/checksum pointer | — | ipad-receipt | — | — |',
    '| Candidate receipt/checksum pointer | — | bearer: `abcdefghijklmnop` | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded candidate identity excludes prohibited sensitive data',
  ])
})

for (const [name, wrapper] of [
  ['bold Markdown', '**'],
  ['Unicode curly quotes', '“”'],
  ['HTML code tags', '<code></code>'],
]) {
  check(`candidate identity rejects a bearer wrapped in ${name}`, () => {
    let matrix = fillCandidateIdentities(actual.matrix, [1])
    const [open, close] = wrapper === '“”'
      ? [...wrapper]
      : wrapper === '<code></code>'
        ? ['<code>', '</code>']
        : [wrapper, wrapper]
    matrix = replaceRequired(
      matrix,
      '| Candidate receipt/checksum pointer | — | ipad-receipt | — | — |',
      `| Candidate receipt/checksum pointer | — | bearer: ${open}abcdefghijklmnop${close} | — | — |`,
    )
    expectFailures({ ...actual, matrix }, [
      'recorded candidate identity excludes prohibited sensitive data',
    ])
  })
}

for (const [name, value] of [
  ['Markdown-escaped delimiter', 'bearer\\: abcdefghijklmnop'],
  ['zero-width delimiter', 'bearer:\u200Babcdefghijklmnop'],
  ['HTML-entity quote wrapper', 'bearer: &quot;abcdefghijklmnop&quot;'],
  ['numeric-entity code wrapper', 'bearer: &#96;abcdefghijklmnop&#96;'],
  ['uppercase-hex numeric-entity delimiter', 'bearer&#X3A; abcdefghijklmnop'],
  ['Markdown image wrapper', 'bearer: ![abcdefghijklmnop](token)'],
  ['Markdown-link label', '[bearer](https://example.com): abcdefghijklmnop'],
  ['percent-encoded delimiter', 'bearer%3A abcdefghijklmnop'],
  ['deeply percent-encoded delimiter', 'bearer%25252525253A abcdefghijklmnop'],
  ['semicolonless numeric-entity delimiter', 'bearer&#58 abcdefghijklmnop'],
  ['semicolonless numeric-entity purchase-code separator', 'BUY&#45AAAA-BBBB-CCCC-DDDD-EEEE-FFFF'],
  ['semicolonless numeric-entity Operator split', 'OPERA&#8203TOR-ABC123'],
]) {
  check(`candidate identity rejects a bearer with a ${name}`, () => {
    let matrix = fillCandidateIdentities(actual.matrix, [1])
    matrix = replaceRequired(
      matrix,
      '| Candidate receipt/checksum pointer | — | ipad-receipt | — | — |',
      `| Candidate receipt/checksum pointer | — | ${value} | — | — |`,
    )
    expectFailures({ ...actual, matrix }, [
      'recorded candidate identity excludes prohibited sensitive data',
    ])
  })
}

check('secret-bearing N/A reasons are rejected', () => {
  for (const secret of [
    'verification_code=private-code',
    `opr_${'A'.repeat(43)}`,
    'josé@example.com',
    'O/P/R/AAAA/AAAA',
    'receipt_BUY-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF.png',
    '<!-- bearer: abcdefghijklmnop -->',
    '[verification](https://x.invalid)[ code](https://x.invalid): ABCDEF',
    'verifi~~cation~~ code: ABCDEF',
    'access-code-FREEPASS2026',
  ]) {
    const matrix = replaceRequired(
      actual.matrix,
      'N/A — tablet only | — | N/A — tablet only | — | — |',
      `N/A — tablet only ${secret} | — | N/A — tablet only | — | — |`,
    )
    expectFailures({ ...actual, matrix }, [
      'recorded physical evidence excludes prohibited sensitive data',
    ])
  }
})

check('Markdown-wrapped bearer values in N/A reasons are rejected', () => {
  const matrix = replaceRequired(
    actual.matrix,
    'N/A — tablet only | — | N/A — tablet only | — | — |',
    'N/A — tablet only bearer: `abcdefghijklmnop` | — | N/A — tablet only | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical evidence excludes prohibited sensitive data',
  ])
})

check('bold Markdown bearer values in N/A reasons are rejected', () => {
  const matrix = replaceRequired(
    actual.matrix,
    'N/A — tablet only | — | N/A — tablet only | — | — |',
    'N/A — tablet only bearer: **abcdefghijklmnop** | — | N/A — tablet only | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical evidence excludes prohibited sensitive data',
  ])
})

check('prefixed Operator comp codes in N/A reasons are rejected', () => {
  const matrix = replaceRequired(
    actual.matrix,
    'N/A — tablet only | — | N/A — tablet only | — | — |',
    'N/A — tablet only comp-code-operator-abc123 | — | N/A — tablet only | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical evidence excludes prohibited sensitive data',
  ])
})

check('fullwidth six-digit values in N/A reasons are rejected', () => {
  const matrix = replaceRequired(
    actual.matrix,
    'N/A — tablet only | — | N/A — tablet only | — | — |',
    'N/A — tablet only code １２３４５６ | — | N/A — tablet only | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'recorded physical evidence excludes prohibited sensitive data',
  ])
})

for (const [name, value] of [
  ['redemption-equivalent device-link code', 'OPR/AAAA/AAAA'],
  ['arbitrary configured comp code', 'comp-code-PRIVATE-COMP-CODE'],
]) {
  check(`${name} in N/A reasons is rejected`, () => {
    const matrix = replaceRequired(
      actual.matrix,
      'N/A — tablet only | — | N/A — tablet only | — | — |',
      `N/A — tablet only ${value} | — | N/A — tablet only | — | — |`,
    )
    expectFailures({ ...actual, matrix }, [
      'recorded physical evidence excludes prohibited sensitive data',
    ])
  })
}

check('candidate reviewed source commits require a full lowercase Git object ID', () => {
  let matrix = fillCandidateIdentities(actual.matrix, [1])
  matrix = replaceRequired(
    matrix,
    '| Reviewed source commit | — | 0123456789abcdef0123456789abcdef01234567 | — | — |',
    '| Reviewed source commit | — | not-a-source-commit | — | — |',
  )
  expectFailures({ ...actual, matrix }, [
    'candidate reviewed source commits use full 40-character lowercase Git object IDs',
  ])
})

for (const [name, row, replacement] of [
  [
    'unrecorded malformed distribution channel',
    '| Distribution channel (TestFlight / Play internal) | — | — | — | — |',
    '| Distribution channel (TestFlight / Play internal) | — | TestFlight-123456 | — | — |',
  ],
  [
    'unrecorded malformed version/build',
    '| App version and build | — | — | — | — |',
    '| App version and build | — | build-123456 | — | — |',
  ],
]) {
  check(`candidate identity rejects an ${name}`, () => {
    const matrix = replaceRequired(actual.matrix, row, replacement)
    expectFailures({ ...actual, matrix }, [
      'candidate identity values use valid field-specific formats before results are recorded',
    ])
  })
}

for (const [name, value] of [
  ['missing timestamp', 'Tester iPad'],
  ['arbitrary text', 'anything'],
  ['impossible timestamp', 'Tester iPad · 2026-02-30T25:61:61-00:00'],
  ['future timestamp', 'Tester iPad · 2099-01-01T00:00:00-05:00'],
]) {
  check(`recorded candidate identity rejects a tester value with ${name}`, () => {
    const matrix = replaceRequired(
      fillRepresentativeResults(),
      'Tester iPad · 2026-08-16T12:00:00-05:00',
      value,
    )
    expectFailures({ ...actual, matrix }, [
      'candidate tester values use an identified local RFC3339 timestamp with a known offset',
    ])
  })
}

check('source-commit guard explicitly remains syntax-only until independent repository resolution', () => {
  const matrix = replaceRequired(
    actual.matrix,
    '| Reviewed source commit | — | — | — | — |',
    '| Reviewed source commit | — | 0000000000000000000000000000000000000000 | — | — |',
  )
  expectFailures({ ...actual, matrix }, [])
})

check('legitimate hashes, numbered pointers, and timestamps remain accepted', () => {
  let matrix = fillCandidateIdentities(actual.matrix, [1])
  matrix = replaceRequired(
    matrix,
    '| Reviewed source commit | — | 0123456789abcdef0123456789abcdef01234567 | — | — |',
    '| Reviewed source commit | — | abcdef123456abcdef123456abcdef123456abcd | — | — |',
  )
  matrix = replaceRequired(
    matrix,
    '| Candidate receipt/checksum pointer | — | ipad-receipt | — | — |',
    '| Candidate receipt/checksum pointer | — | local/receipts/build-123456.ipa.sha256 | — | — |',
  )
  matrix = replaceRequired(
    matrix,
    '| Installed identity evidence pointer | — | ipad-identity | — | — |',
    '| Installed identity evidence pointer | — | abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcd | — | — |',
  )
  matrix = replaceRequired(
    matrix,
    '| Tester and local timestamp | — | Tester iPad · 2026-08-16T12:00:00-05:00 | — | — |',
    '| Tester and local timestamp | — | Cole · 2026-08-16T12:30:00-05:00 | — | — |',
  )
  expectFailures({ ...actual, matrix }, [])

  for (const timestamp of [
    'Cole · 2026-08-16t12:30:00-05:00',
    'Cole · 2026-08-16T12:30:00.123456-05:00',
    'Cole · 2026-08-16T12:30:00.123456789-05:00',
  ]) {
    const rfc3339Variant = replaceRequired(
      matrix,
      'Cole · 2026-08-16T12:30:00-05:00',
      timestamp,
    )
    expectFailures({ ...actual, matrix: rfc3339Variant }, [])
  }
})

check('safe local evidence pointers and value-free blockers remain accepted', () => {
  const identified = fillCandidateIdentities(actual.matrix, [1])
  const withPointer = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: local/screenshots/m02-ipad-registration.png |',
  )
  expectFailures({ ...actual, matrix: withPointer }, [])

  const withNumberedPointer = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: local/screenshots/build-123456.png |',
  )
  expectFailures({ ...actual, matrix: withNumberedPointer }, [])

  const withBareNumberedFilename = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: build-123456.ipa.sha256 |',
  )
  expectFailures({ ...actual, matrix: withBareNumberedFilename }, [])

  const withBareDigest = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcd |',
  )
  expectFailures({ ...actual, matrix: withBareDigest }, [])

  const withPrefixedDigest = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: sha256:abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcd |',
  )
  expectFailures({ ...actual, matrix: withPrefixedDigest }, [])

  const withHyphenatedDigestLabels = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: SHA-256:abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcd |',
  )
  expectFailures({ ...actual, matrix: withHyphenatedDigestLabels }, [])

  const withSha1Digest = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: sha1:abcdef123456abcdef123456abcdef123456abcd |',
  )
  expectFailures({ ...actual, matrix: withSha1Digest }, [])

  for (const pointer of [
    '[candidate](local/receipts/build-123456.ipa.sha256)',
    '[checksum](sha256:123456abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd)',
  ]) {
    const withMarkdownPointer = replaceRequired(
      identified,
      /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
      `$1 — | PASS | — | — | iPad: ${pointer} |`,
    )
    expectFailures({ ...actual, matrix: withMarkdownPointer }, [])
  }

  const withBareBuildPointer = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: build-123456 |',
  )
  expectFailures({ ...actual, matrix: withBareBuildPointer }, [])

  const withPrefixedBuildPointer = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: ios-build-123456 |',
  )
  expectFailures({ ...actual, matrix: withPrefixedBuildPointer }, [])

  const withSpacedExtensionlessPath = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: `local/build receipts/build-123456` |',
  )
  expectFailures({ ...actual, matrix: withSpacedExtensionlessPath }, [])

  const withWindowsBuildPath = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: C:\\screenshots\\build-123456.png |',
  )
  expectFailures({ ...actual, matrix: withWindowsBuildPath }, [])

  const withDensityFilenames = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: m02@2x.png |',
  )
  expectFailures({ ...actual, matrix: withDensityFilenames }, [])

  let withCandidateDensityFilenames = replaceRequired(
    identified,
    '| Candidate receipt/checksum pointer | — | ipad-receipt | — | — |',
    '| Candidate receipt/checksum pointer | — | m02@2x.png | — | — |',
  )
  withCandidateDensityFilenames = replaceRequired(
    withCandidateDensityFilenames,
    '| Installed identity evidence pointer | — | ipad-identity | — | — |',
    '| Installed identity evidence pointer | — | build6@3x.png | — | — |',
  )
  expectFailures({ ...actual, matrix: withCandidateDensityFilenames }, [])

  const withSpacedLocalPath = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | PASS | — | — | iPad: `local/build receipts/build-123456.ipa` |',
  )
  expectFailures({ ...actual, matrix: withSpacedLocalPath }, [])

  const withVerificationScreenshotFilename = replaceRequired(
    identified,
    '| Candidate receipt/checksum pointer | — | ipad-receipt | — | — |',
    '| Candidate receipt/checksum pointer | — | local/verification-code-screenshot.png | — | — |',
  )
  expectFailures({ ...actual, matrix: withVerificationScreenshotFilename }, [])

  let withValueFreeFilename = replaceRequired(
    identified,
    '| Candidate receipt/checksum pointer | — | ipad-receipt | — | — |',
    '| Candidate receipt/checksum pointer | — | local/verification-code-screenshot.png | — | — |',
  )
  withValueFreeFilename = replaceRequired(
    withValueFreeFilename,
    '| Installed identity evidence pointer | — | ipad-identity | — | — |',
    '| Installed identity evidence pointer | — | local/comp-code-screenshot.png | — | — |',
  )
  withValueFreeFilename = replaceRequired(
    withValueFreeFilename,
    '| Candidate receipt/checksum pointer | — | local/verification-code-screenshot.png | — | — |',
    '| Candidate receipt/checksum pointer | — | local/OPR-screenshot.png | — | — |',
  )
  expectFailures({ ...actual, matrix: withValueFreeFilename }, [])

  for (const pointer of [
    'local/comp-code-screenshot-ipad.png',
    'local/comp-code-screenshot-dark.png',
    'local/verification-code-screenshot-after.png',
    'local/device-link-code-screenshot-android-tablet.png',
  ]) {
    const withQualifiedValueFreeFilename = replaceRequired(
      identified,
      '| Installed identity evidence pointer | — | ipad-identity | — | — |',
      `| Installed identity evidence pointer | — | ${pointer} | — | — |`,
    )
    expectFailures({ ...actual, matrix: withQualifiedValueFreeFilename }, [])
  }

  const withBlocker = replaceRequired(
    identified,
    /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
    '$1 — | BLOCKED | — | — | iPad: verification code not received, no receipt body was recorded, and no bearer credential was entered |',
  )
  expectFailures({ ...actual, matrix: withBlocker }, [])
})

check('physical evidence rejects a numeric-only pointer segment', () => {
  for (const pointer of [
    'local/screenshots/123456.png',
    'local/screenshot123456.png',
    'local/123456note.png',
    'local/x123456y.png',
    'local/123456/build-654321.png',
    'C:\\screenshots\\123456\\build-654321.png',
    'build-123456-654321.png',
    'local/١٢٣٤٥٦.png',
    'local/۱۲۳۴۵۶.png',
    'local/१२३४५६.png',
  ]) {
    const matrix = replaceRequired(
      fillCandidateIdentities(actual.matrix, [1]),
      /^(\| M02 \|.*? \|) — \| — \| — \| — \| — \|$/m,
      `$1 — | PASS | — | — | iPad: ${pointer} |`,
    )
    expectFailures({ ...actual, matrix }, [
      'recorded physical evidence excludes prohibited sensitive data',
    ])
  }
})

check('weakening the evidence redaction rule fails closed', () => {
  const matrix = replaceRequired(actual.matrix, 'must not contain an email address', 'may contain an email address')
  expectFailures(
    { ...actual, matrix },
    ['matrix evidence rules exclude credentials, identifiers, and reviewer-account deletion'],
  )
})

check('weakening candidate-identity redaction scope fails closed', () => {
  const matrix = replaceRequired(
    actual.matrix,
    'Candidate-identity values and evidence pointers may identify',
    'Evidence pointers may identify',
  )
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
    'Neither command authorizes upload or submission or replaces physical-device, sandbox-purchase, TestFlight, or Play internal-track testing.',
    'Both commands authorize upload and submission.',
  )
  expectFailures({ ...actual, readme }, [
    'store README keeps static checks subordinate to physical and store-channel testing',
  ])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
