export const CONSOLE_PACKET_PATHS = [
  'store/apple-console-completion-packet.md',
  'store/google-console-completion-packet.md',
  'store/console-action-packet.md',
]

const CHECKLIST_MARKER = 'Non-secret console completion/action packets are retained in a reproducible approved location.'
const RECEIPT_MARKER = '**Verified retention receipt:**'
const LEDGER_PREFIX = '| Console packet retention |'
const VERIFIED_LEDGER_STATUS = '**✅ VERIFIED / REPRODUCIBLE RETENTION.**'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniqueMatch(text, expression) {
  const matches = [...text.matchAll(expression)]
  return matches.length === 1 ? matches[0][1] : ''
}

function parseReceipt(text) {
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

  if (!receiptId || !destinationClass || !verifiedAt || Object.values(digests).some((digest) => !digest)) return null
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
}) {
  if (typeof releaseChecklist !== 'string' || typeof releaseLedger !== 'string') return false

  const checklistLines = releaseChecklist.split(/\r?\n/)
  const checklistIndexes = checklistLines
    .map((line, index) => line.includes(CHECKLIST_MARKER) ? index : -1)
    .filter((index) => index >= 0)
  const receiptRows = checklistLines.filter((line) => line.includes(RECEIPT_MARKER))
  const ledgerRows = releaseLedger
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

  const checklistReceipt = parseReceipt(receiptRows[0])
  const ledgerReceipt = parseReceipt(ledgerRows[0])
  return (
    receiptsMatch(checklistReceipt, ledgerReceipt) &&
    receiptMatchesPacketBytes(checklistReceipt, actualPacketDigests)
  )
}
