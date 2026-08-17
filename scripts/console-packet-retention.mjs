import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const CONSOLE_PACKET_PATHS = [
  'store/apple-console-completion-packet.md',
  'store/google-console-completion-packet.md',
  'store/console-action-packet.md',
]

export const CONSOLE_PACKET_ARCHIVE_HOME_RELATIVE = path.join(
  'Claude',
  'System',
  'AI-Collaboration',
  'store-packets',
)

const RELOCATED_COMPLETION_PACKETS = new Set(CONSOLE_PACKET_PATHS.slice(0, 2))
const CONFIGURED_CONSOLE_PACKET_PATHS = new Set(CONSOLE_PACKET_PATHS)

export function consolePacketInputCandidates({
  root,
  relative,
  homeDirectory = os.homedir(),
}) {
  if (!CONFIGURED_CONSOLE_PACKET_PATHS.has(relative)) return []

  const candidates = [{
    source: 'repository',
    filePath: path.resolve(root, relative),
  }]

  if (RELOCATED_COMPLETION_PACKETS.has(relative)) {
    candidates.push({
      source: 'approved-vault-archive',
      filePath: path.resolve(
        homeDirectory,
        CONSOLE_PACKET_ARCHIVE_HOME_RELATIVE,
        path.basename(relative),
      ),
    })
  }

  return candidates
}

export function readConsolePacketInput({
  root,
  relative,
  homeDirectory = os.homedir(),
  readFile = fs.readFileSync,
}) {
  const candidates = consolePacketInputCandidates({ root, relative, homeDirectory })
  for (const candidate of candidates) {
    try {
      const value = readFile(candidate.filePath)
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
      return {
        available: true,
        ...candidate,
        buffer,
        text: buffer.toString('utf8'),
      }
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') continue
      return {
        available: false,
        ...candidate,
        buffer: Buffer.alloc(0),
        text: '',
        errorCode: String(error?.code || 'READ_ERROR'),
      }
    }
  }

  return {
    available: false,
    source: 'unavailable',
    filePath: '',
    buffer: Buffer.alloc(0),
    text: '',
    errorCode: candidates.length === 0 ? 'UNCONFIGURED_INPUT' : 'ENOENT',
  }
}

const CHECKLIST_MARKER = 'Non-secret console completion/action packets are retained in a reproducible approved location.'
const RECEIPT_PREFIX = '  - ✅ **Verified retention receipt:** '
const LEDGER_PREFIX = '| Console packet retention |'
const VERIFIED_LEDGER_STATUS = '**✅ VERIFIED / REPRODUCIBLE RETENTION.**'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function activeMarkdown(text) {
  const withoutHtmlComments = text.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => (
    comment.replace(/[^\n]/g, '')
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
    if (openingTag) return { untilBlank: true }
    if (/^ {0,3}<\/[A-Za-z][A-Za-z0-9-]*(?:\s|>|$)/.test(line)) return { untilBlank: true }
    return null
  }

  for (const line of withoutHtmlComments.split('\n')) {
    if (fence) {
      const closingFence = new RegExp(
        `^ {0,3}${escapeRegExp(fence.marker)}{${fence.length},}[ \\t]*$`,
      )
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

    const openingFence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (
      openingFence
      && (openingFence[1][0] === '~' || !openingFence[2].includes('`'))
    ) {
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

function uniqueMatch(text, expression) {
  const matches = [...text.matchAll(expression)]
  return matches.length === 1 ? matches[0][1] : ''
}

function hasKnownOffsetRfc3339Timestamp(value) {
  if (typeof value !== 'string') return false
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/)
  if (!match) return false

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone, , offsetHourText, offsetMinuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  if (
    month < 1
    || month > 12
    || day < 1
    || day > daysInMonth[month - 1]
    || hour > 23
    || minute > 59
    || second > 59
  ) return false

  if (zone !== 'Z') {
    const offsetHour = Number(offsetHourText)
    const offsetMinute = Number(offsetMinuteText)
    if (
      offsetHour > 23
      || offsetMinute > 59
      || zone === '-00:00'
    ) return false
  }

  return Number.isFinite(Date.parse(value))
}

function parseReceipt(text, nowTime) {
  const receiptId = uniqueMatch(text, /receipt ID `([^`\r\n]+)`/gi)
  const destinationClass = uniqueMatch(text, /approved destination class `([^`\r\n]+)`/gi)
  const verifiedAt = uniqueMatch(text, /verified at `(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}))`/gi)
  const digests = Object.fromEntries(CONSOLE_PACKET_PATHS.map((relative) => {
    const expression = new RegExp(
      `${escapeRegExp(`\`${relative}\``)} SHA-256 \`([a-f0-9]{64})\``,
      'gi',
    )
    return [relative, uniqueMatch(text, expression)]
  }))

  if (
    !receiptId
    || !destinationClass
    || !verifiedAt
    || !hasKnownOffsetRfc3339Timestamp(verifiedAt)
    || Date.parse(verifiedAt) > nowTime
    || Object.values(digests).some((digest) => !digest)
  ) return null
  return { receiptId, destinationClass, verifiedAt, digests }
}

function receiptsMatch(left, right) {
  return (
    left?.receiptId === right?.receiptId &&
    left?.destinationClass === right?.destinationClass &&
    left?.verifiedAt === right?.verifiedAt &&
    CONSOLE_PACKET_PATHS.every((relative) => left?.digests[relative] === right?.digests[relative])
  )
}

function receiptMatchesPacketBytes(receipt, actualPacketDigests) {
  return CONSOLE_PACKET_PATHS.every((relative) => (
    /^[a-f0-9]{64}$/.test(actualPacketDigests?.[relative] || '') &&
    receipt?.digests[relative] === actualPacketDigests[relative]
  ))
}

export function consolePacketRetentionRecordsAreVerified({
  releaseChecklist,
  releaseLedger,
  actualPacketDigests,
  now = new Date(),
}) {
  if (typeof releaseChecklist !== 'string' || typeof releaseLedger !== 'string') return false

  const nowTime = now instanceof Date
    ? now.getTime()
    : typeof now === 'number'
      ? now
      : Date.parse(now)
  if (!Number.isFinite(nowTime)) return false

  const checklistLines = activeMarkdown(releaseChecklist).split(/\r?\n/)
  const checklistIndexes = checklistLines
    .map((line, index) => line.includes(CHECKLIST_MARKER) ? index : -1)
    .filter((index) => index >= 0)
  const receiptRows = checklistLines.filter((line) => line.startsWith(RECEIPT_PREFIX))
  const ledgerRows = activeMarkdown(releaseLedger)
    .split(/\r?\n/)
    .filter((line) => line.startsWith(LEDGER_PREFIX))

  if (
    checklistIndexes.length !== 1 ||
    checklistLines[checklistIndexes[0]] !== `- [x] ${CHECKLIST_MARKER}` ||
    receiptRows.length !== 1 ||
    ledgerRows.length !== 1 ||
    !ledgerRows[0].includes(VERIFIED_LEDGER_STATUS)
  ) return false

  const checklistStart = checklistIndexes[0]
  const nextChecklistOffset = checklistLines
    .slice(checklistStart + 1)
    .findIndex((line) => /^- \[[ x]\] /.test(line))
  const checklistEnd = nextChecklistOffset < 0
    ? checklistLines.length
    : checklistStart + 1 + nextChecklistOffset
  const retentionSectionLines = checklistLines.slice(checklistStart, checklistEnd)
  if (!retentionSectionLines.includes(receiptRows[0])) return false

  const retainedStateText = `${retentionSectionLines.join('\n')}\n${ledgerRows[0]}`
  if (
    /\b(?:blocked|untracked|ignored|absent|unverified|local-only)\b|\bno (?:repository|approved|external|retention)\b|\b(?:gap|blocker) (?:remains?|is) open\b/i.test(retainedStateText)
  ) {
    return false
  }

  const checklistReceipt = parseReceipt(receiptRows[0], nowTime)
  const ledgerReceipt = parseReceipt(ledgerRows[0], nowTime)
  return (
    receiptsMatch(checklistReceipt, ledgerReceipt) &&
    receiptMatchesPacketBytes(checklistReceipt, actualPacketDigests)
  )
}
