import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CONSOLE_PACKET_ARCHIVE_HOME_RELATIVE,
  CONSOLE_PACKET_PATHS,
  consolePacketRetentionRecordsAreVerified,
  readConsolePacketInput,
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
const verificationNow = '2026-08-16T01:00:00-05:00'
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
const canonicalPacketInputs = Object.fromEntries(CONSOLE_PACKET_PATHS.map((relative) => [
  relative,
  readConsolePacketInput({ root, relative }),
]))
const canonicalPacketDigests = Object.fromEntries(CONSOLE_PACKET_PATHS.map((relative) => [
  relative,
  canonicalPacketInputs[relative].available
    ? crypto.createHash('sha256').update(canonicalPacketInputs[relative].buffer).digest('hex')
    : '',
]))

const verify = (
  releaseChecklist,
  releaseLedger,
  actualPacketDigests = packetDigests,
  now = verificationNow,
) => consolePacketRetentionRecordsAreVerified({
  releaseChecklist,
  releaseLedger,
  actualPacketDigests,
  now,
})

test('current canonical records remain blocked rather than inventing retention', () => {
  assert.equal(verify(canonical.releaseChecklist, canonical.releaseLedger, canonicalPacketDigests), false)
})

for (const relative of CONSOLE_PACKET_PATHS) {
  test(`Console packet input is configured and readable: ${relative}`, () => {
    assert.equal(canonicalPacketInputs[relative].available, true)
  })
}

test('packet routing prefers repository-local bytes', () => {
  const relative = 'store/apple-console-completion-packet.md'
  const repositoryPath = path.resolve('/fixture/repository', relative)
  const archivePath = path.resolve(
    '/fixture/home',
    CONSOLE_PACKET_ARCHIVE_HOME_RELATIVE,
    path.basename(relative),
  )
  const attempts = []
  const input = readConsolePacketInput({
    root: '/fixture/repository',
    relative,
    homeDirectory: '/fixture/home',
    readFile(filePath) {
      attempts.push(filePath)
      if (filePath === repositoryPath) return Buffer.from('repository bytes')
      if (filePath === archivePath) return Buffer.from('archive bytes')
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    },
  })
  assert.equal(input.available, true)
  assert.equal(input.source, 'repository')
  assert.equal(input.text, 'repository bytes')
  assert.deepEqual(attempts, [repositoryPath])
})

test('relocated completion packets resolve from the approved vault archive', () => {
  const relative = 'store/google-console-completion-packet.md'
  const archivePath = path.resolve(
    '/fixture/home',
    CONSOLE_PACKET_ARCHIVE_HOME_RELATIVE,
    path.basename(relative),
  )
  const input = readConsolePacketInput({
    root: '/fixture/repository',
    relative,
    homeDirectory: '/fixture/home',
    readFile(filePath) {
      if (filePath === archivePath) return Buffer.from('approved retained bytes')
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    },
  })
  assert.equal(input.available, true)
  assert.equal(input.source, 'approved-vault-archive')
  assert.equal(input.text, 'approved retained bytes')
})

test('the ignored action packet does not fall back to the completion-packet archive', () => {
  const relative = 'store/console-action-packet.md'
  const repositoryPath = path.resolve('/fixture/repository', relative)
  const archivePath = path.resolve(
    '/fixture/home',
    CONSOLE_PACKET_ARCHIVE_HOME_RELATIVE,
    path.basename(relative),
  )
  const attempts = []
  const input = readConsolePacketInput({
    root: '/fixture/repository',
    relative,
    homeDirectory: '/fixture/home',
    readFile(filePath) {
      attempts.push(filePath)
      if (filePath === archivePath) return Buffer.from('must not be read')
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    },
  })
  assert.equal(input.available, false)
  assert.equal(input.source, 'unavailable')
  assert.equal(input.text, '')
  assert.deepEqual(attempts, [repositoryPath])
})

test('unconfigured packet names never reach the filesystem', () => {
  const attempts = []
  const input = readConsolePacketInput({
    root: '/fixture/repository',
    relative: 'store/apple-console-completion-packet-copy.md',
    homeDirectory: '/fixture/home',
    readFile(filePath) {
      attempts.push(filePath)
      return Buffer.from('must not be read')
    },
  })
  assert.equal(input.available, false)
  assert.equal(input.errorCode, 'UNCONFIGURED_INPUT')
  assert.deepEqual(attempts, [])
})

test('one synchronized complete verified receipt passes', () => {
  assert.equal(verify(positiveChecklist, positiveLedger), true)
})

test('fully HTML-commented retention records stay blocked', () => {
  const commentedChecklist = ['<!--', positiveChecklist, '-->'].join('\n')
  const commentedLedger = ['<!--', positiveLedger, '-->'].join('\n')
  assert.equal(verify(commentedChecklist, commentedLedger), false)
})

test('fully fenced retention records stay blocked', () => {
  const fencedChecklist = ['```markdown', positiveChecklist, '```'].join('\n')
  const fencedLedger = ['```markdown', positiveLedger, '```'].join('\n')
  assert.equal(verify(fencedChecklist, fencedLedger), false)
})

test('retention records inside a raw HTML block stay blocked', () => {
  const rawChecklist = ['<div>', positiveChecklist, '</div>'].join('\n')
  const rawLedger = ['<div>', positiveLedger, '</div>'].join('\n')
  assert.equal(verify(rawChecklist, rawLedger), false)
})

test('generic raw HTML remains inactive through its first blank line', () => {
  const rawChecklist = ['<div></div>', positiveChecklist].join('\n')
  const rawLedger = ['<div></div>', positiveLedger].join('\n')
  assert.equal(verify(rawChecklist, rawLedger), false)
})

test('retention records after a generic raw HTML blank-line terminator remain active', () => {
  const activeChecklist = ['<div></div>', '', positiveChecklist].join('\n')
  const activeLedger = ['<div></div>', '', positiveLedger].join('\n')
  assert.equal(verify(activeChecklist, activeLedger), true)
})

test('an active retention parent cannot use an HTML-commented receipt', () => {
  const [parent, receipt] = positiveChecklist.split('\n')
  const commentedReceipt = [parent, '<!--', receipt, '-->'].join('\n')
  assert.equal(verify(commentedReceipt, positiveLedger), false)
})

test('inline-code text cannot stand in for an active retention receipt row', () => {
  const [parent, receipt] = positiveChecklist.split('\n')
  const inlineCodeReceipt = [parent, `  \`\`${receipt.trimStart()}\`\``].join('\n')
  assert.equal(verify(inlineCodeReceipt, positiveLedger), false)
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

test('a valid leap-day receipt with a known offset remains accepted', () => {
  const leapDay = '2024-02-29T23:59:59+05:30'
  assert.equal(verify(
    positiveChecklist.replace(verifiedAt, leapDay),
    positiveLedger.replace(verifiedAt, leapDay),
  ), true)
})

for (const [name, invalidTimestamp] of [
  ['an impossible calendar date', '2026-02-30T17:00:00Z'],
  ['hour 24', '2026-08-16T24:00:00Z'],
  ['an unknown negative-zero offset', '2026-08-16T00:00:00-00:00'],
  ['a future verification time', '2099-01-01T00:00:00Z'],
]) {
  test(`${name} cannot verify packet retention`, () => {
    const checklist = positiveChecklist.replace(verifiedAt, invalidTimestamp)
    const ledger = positiveLedger.replace(verifiedAt, invalidTimestamp)
    assert.equal(verify(checklist, ledger), false)
  })
}

test('an invalid verifier clock fails closed', () => {
  assert.equal(verify(positiveChecklist, positiveLedger, packetDigests, 'not-a-time'), false)
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
