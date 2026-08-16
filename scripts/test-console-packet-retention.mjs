import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CONSOLE_PACKET_PATHS,
  consolePacketRetentionRecordsAreVerified,
} from './console-packet-retention.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const checklistMarker = 'Non-secret console completion/action packets are retained in a reproducible approved location.'
const packetContents = Object.fromEntries(CONSOLE_PACKET_PATHS.map((relative) => [
  relative,
  `verified fixture bytes for ${relative}`,
]))
const packetDigests = Object.fromEntries(CONSOLE_PACKET_PATHS.map((relative) => [
  relative,
  crypto.createHash('sha256').update(packetContents[relative]).digest('hex'),
]))
const receiptId = 'console-packets-2026-08-16T000000-0500'
const destinationClass = 'Cole-approved private release archive'
const verifiedAt = '2026-08-16T00:00:00-05:00'
const receiptFields = [
  `receipt ID \`${receiptId}\``,
  `approved destination class \`${destinationClass}\``,
  `verified at \`${verifiedAt}\``,
  ...CONSOLE_PACKET_PATHS.map((relative) => `\`${relative}\` SHA-256 \`${packetDigests[relative]}\``),
].join('; ')
const positiveChecklist = `- [x] ${checklistMarker}\n  - ✅ **Verified retention receipt:** ${receiptFields}`
const positiveLedger = `| Console packet retention | ${receiptFields} | **✅ VERIFIED / REPRODUCIBLE RETENTION.** All three packet copies were hash-verified at the approved destination. |`
const canonical = {
  releaseChecklist: read('store/release-checklist.md'),
  releaseLedger: read('store/release-ledger.md'),
}
const canonicalPacketDigests = Object.fromEntries(CONSOLE_PACKET_PATHS.map((relative) => [
  relative,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex'),
]))

const verify = (releaseChecklist, releaseLedger, actualPacketDigests = packetDigests) => consolePacketRetentionRecordsAreVerified({
  releaseChecklist,
  releaseLedger,
  actualPacketDigests,
})

test('current canonical records remain blocked rather than inventing retention', () => {
  assert.equal(verify(canonical.releaseChecklist, canonical.releaseLedger, canonicalPacketDigests), false)
})

test('one synchronized complete verified receipt passes', () => {
  assert.equal(verify(positiveChecklist, positiveLedger), true)
})

test('a checked checklist without a matching positive ledger stays blocked', () => {
  assert.equal(verify(positiveChecklist, canonical.releaseLedger), false)
})

test('a positive ledger without a checked checklist stays blocked', () => {
  assert.equal(verify(canonical.releaseChecklist, positiveLedger), false)
})

test('mismatched receipt ids stay blocked', () => {
  assert.equal(verify(positiveChecklist, positiveLedger.replace(receiptId, `${receiptId}-other`)), false)
})

test('mismatched approved destination classes stay blocked', () => {
  assert.equal(verify(positiveChecklist, positiveLedger.replace(destinationClass, `${destinationClass} copy`)), false)
})

test('mismatched verification timestamps stay blocked', () => {
  assert.equal(verify(positiveChecklist, positiveLedger.replace(verifiedAt, '2026-08-16T00:00:01-05:00')), false)
})

test('a missing packet digest stays blocked', () => {
  const missingGoogle = positiveLedger.replace(
    `; \`store/google-console-completion-packet.md\` SHA-256 \`${packetDigests['store/google-console-completion-packet.md']}\``,
    '',
  )
  assert.equal(verify(positiveChecklist, missingGoogle), false)
})

test('a changed packet digest stays blocked', () => {
  const changedDigest = positiveLedger.replace(
    `\`store/console-action-packet.md\` SHA-256 \`${packetDigests['store/console-action-packet.md']}\``,
    `\`store/console-action-packet.md\` SHA-256 \`${'b'.repeat(64)}\``,
  )
  assert.equal(verify(positiveChecklist, changedDigest), false)
})

test('matching receipt records with a digest that does not match the packet bytes stay blocked', () => {
  const wrongDigest = 'b'.repeat(64)
  const falseChecklist = positiveChecklist.replaceAll(packetDigests['store/console-action-packet.md'], wrongDigest)
  const falseLedger = positiveLedger.replaceAll(packetDigests['store/console-action-packet.md'], wrongDigest)
  assert.equal(verify(falseChecklist, falseLedger), false)
})

test('packet bytes changed after the synchronized receipt stay blocked', () => {
  const changedActualDigests = {
    ...packetDigests,
    'store/console-action-packet.md': crypto
      .createHash('sha256')
      .update(`${packetContents['store/console-action-packet.md']} changed`)
      .digest('hex'),
  }
  assert.equal(verify(positiveChecklist, positiveLedger, changedActualDigests), false)
})

test('missing current packet-byte evidence stays blocked', () => {
  const missingActualDigest = { ...packetDigests }
  delete missingActualDigest['store/google-console-completion-packet.md']
  assert.equal(verify(positiveChecklist, positiveLedger, missingActualDigest), false)
})

test('a synchronized positive receipt cannot coexist with a sibling red retention inventory', () => {
  const siblingRed = positiveChecklist.replace(
    '\n  - ✅ **Verified retention receipt:**',
    '\n  - 🔴 Fresh retention inventory: packets remain untracked, ignored, and absent.\n  - ✅ **Verified retention receipt:**',
  )
  assert.equal(verify(siblingRed, positiveLedger), false)
})

test('a synchronized positive receipt cannot coexist with a sibling open-gap claim', () => {
  const siblingOpenGap = positiveChecklist.replace(
    '\n  - ✅ **Verified retention receipt:**',
    '\n  - 🧪 The sibling-section gap remains open.\n  - ✅ **Verified retention receipt:**',
  )
  assert.equal(verify(siblingOpenGap, positiveLedger), false)
})

test('the receipt must live inside the unique retention checklist section', () => {
  const misplacedReceipt = positiveChecklist.replace(
    '\n  - ✅ **Verified retention receipt:**',
    '\n- [x] A separate release item.\n  - ✅ **Verified retention receipt:**',
  )
  assert.equal(verify(misplacedReceipt, positiveLedger), false)
})

test('duplicate checklist receipt rows stay blocked', () => {
  assert.equal(verify(`${positiveChecklist}\n${positiveChecklist.split('\n')[1]}`, positiveLedger), false)
})

test('duplicate ledger receipt rows stay blocked', () => {
  assert.equal(verify(positiveChecklist, `${positiveLedger}\n${positiveLedger}`), false)
})

test('a contradictory blocked claim stays blocked', () => {
  assert.equal(verify(positiveChecklist, `${positiveLedger.slice(0, -1)} Still local-only and unverified. |`), false)
})
