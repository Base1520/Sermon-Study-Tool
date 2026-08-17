import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const APPLE_SCREENSHOT_HOLD = /^> Apple submission hold:/m
const ANDROID_SCREENSHOT_HOLD = /^> Android creative hold:/m
const OPEN_APPLE_SCREENSHOT_GATE = /^- \[ \] 🔴 Final iPhone and iPad submission screenshots/m
const OPEN_ANDROID_SCREENSHOT_LEDGER_HOLD = /^(?:\| Android (?:7-inch|10-inch) tablet screenshots \|[^\n]*\|[^\n]*\bCREATIVE HOLD\b[^\n]*\||\| Android screenshot creative-hold gate \|[^\n]*\|[^\n]*\bSCREENSHOTS STILL BLOCKED\b[^\n]*\|)/m

export const APPLE_IPAD_LANDSCAPE_DIMENSIONS = Object.freeze({ width: 2732, height: 2048 })

export const APPLE_SCREENSHOT_PATHS = Object.freeze([
  'store/assets/screenshots/ios-iphone-submission/00-quick-study-start.png',
  'store/assets/screenshots/ios-iphone-submission/01-quick-study.png',
  'store/assets/screenshots/ios-ipad-submission/00-covenant-plain-study.png',
  'store/assets/screenshots/ios-ipad-submission/01-infinite-sermon-desk.png',
  'store/assets/screenshots/ios-ipad-submission/02-preach-mode.png',
])

export const ANDROID_SCREENSHOT_PATHS = Object.freeze([
  'store/assets/screenshots/android-phone/00-quick-study-start.png',
  'store/assets/screenshots/android-phone/01-quick-study.png',
  'store/assets/screenshots/android-tablet-7/00-guided-study.png',
  'store/assets/screenshots/android-tablet-7/01-infinite-sermon-desk.png',
  'store/assets/screenshots/android-tablet-10/00-guided-study.png',
  'store/assets/screenshots/android-tablet-10/01-infinite-sermon-desk.png',
])

export const STORE_SCREENSHOT_SETS = Object.freeze([
  Object.freeze({ label: 'Apple iPhone', directory: 'store/assets/screenshots/ios-iphone-submission', dimensions: Object.freeze([{ width: 1284, height: 2778 }]), minCount: 1, maxCount: 10, ios: true }),
  Object.freeze({
    label: 'Apple iPad',
    directory: 'store/assets/screenshots/ios-ipad-submission',
    dimensions: Object.freeze([
      APPLE_IPAD_LANDSCAPE_DIMENSIONS,
      Object.freeze({ width: 2064, height: 2752 }),
    ]),
    minCount: 1,
    maxCount: 10,
    ios: true,
  }),
  Object.freeze({ label: 'Google Play phone', directory: 'store/assets/screenshots/android-phone', dimensions: Object.freeze([{ width: 1080, height: 1920 }]), minCount: 2, maxCount: 8, ios: false }),
  Object.freeze({ label: 'Google Play 7-inch tablet', directory: 'store/assets/screenshots/android-tablet-7', dimensions: Object.freeze([{ width: 1200, height: 1920 }]), minCount: 2, maxCount: 8, ios: false }),
  Object.freeze({ label: 'Google Play 10-inch tablet', directory: 'store/assets/screenshots/android-tablet-10', dimensions: Object.freeze([{ width: 1600, height: 2560 }]), minCount: 2, maxCount: 8, ios: false }),
])

const APPLE_SCREENSHOT_DIRECTORIES = Object.freeze(
  STORE_SCREENSHOT_SETS.filter(({ ios }) => ios).map(({ directory }) => directory),
)
const ANDROID_SCREENSHOT_DIRECTORIES = Object.freeze(
  STORE_SCREENSHOT_SETS.filter(({ ios }) => !ios).map(({ directory }) => directory),
)

export function screenshotDimensionsMatch(image, dimensions) {
  return dimensions.some(({ width, height }) => image.width === width && image.height === height)
}

export function formatScreenshotDimensions(dimensions) {
  return dimensions.map(({ width, height }) => `${width} × ${height}`).join(' or ')
}

export function hasAppleScreenshotSubmissionHold(screenshotPlan) {
  return APPLE_SCREENSHOT_HOLD.test(screenshotPlan)
}

export function hasAndroidScreenshotCreativeHold(screenshotPlan) {
  return ANDROID_SCREENSHOT_HOLD.test(screenshotPlan)
}

export function appleScreenshotProvenanceIsConsistent(screenshotPlan, releaseChecklist) {
  const appleScreenshotGateOpen = OPEN_APPLE_SCREENSHOT_GATE.test(releaseChecklist)
  return !appleScreenshotGateOpen || hasAppleScreenshotSubmissionHold(screenshotPlan)
}

export function androidScreenshotProvenanceIsConsistent(screenshotPlan, releaseLedger) {
  const androidScreenshotGateOpen = OPEN_ANDROID_SCREENSHOT_LEDGER_HOLD.test(releaseLedger)
  return !androidScreenshotGateOpen || hasAndroidScreenshotCreativeHold(screenshotPlan)
}

function isExactRecord(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function normalizedPackageLock(source) {
  if (typeof source !== 'string') return ''
  try {
    const parsed = JSON.parse(source)
    if (
      parsed === null
      || typeof parsed !== 'object'
      || Array.isArray(parsed)
      || parsed.packages === null
      || typeof parsed.packages !== 'object'
      || Array.isArray(parsed.packages)
      || parsed.packages[''] === null
      || typeof parsed.packages[''] !== 'object'
      || Array.isArray(parsed.packages[''])
      || typeof parsed.version !== 'string'
      || typeof parsed.packages[''].version !== 'string'
    ) return ''
    return JSON.stringify({
      ...parsed,
      version: '__ROOT_VERSION_METADATA__',
      packages: {
        ...parsed.packages,
        '': {
          ...parsed.packages[''],
          version: '__ROOT_VERSION_METADATA__',
        },
      },
    })
  } catch {
    return ''
  }
}

export function mobilePackageLockLineageIsValid({
  candidateSource,
  evidenceSource,
  pushedEvidenceSource,
  indexSource,
  workingTreeSource,
}) {
  const normalized = [
    candidateSource,
    evidenceSource,
    pushedEvidenceSource,
    indexSource,
    workingTreeSource,
  ].map(normalizedPackageLock)
  return normalized.every(Boolean) && normalized.every((value) => value === normalized[0])
}

export function exactPackageManifestTransitionIsValid({
  candidateSource,
  evidenceSource,
  pushedSource,
  indexSource,
  workingTreeSource,
  candidateSha256,
  pushedSha256,
}) {
  const sources = [candidateSource, evidenceSource, pushedSource, indexSource, workingTreeSource]
  if (
    !sources.every((source) => typeof source === 'string' && source !== '')
    || !isSha256(candidateSha256)
    || !isSha256(pushedSha256)
  ) return false
  const digests = sources.map((source) => crypto.createHash('sha256').update(source).digest('hex'))
  return digests[0] === candidateSha256
    && digests[1] === candidateSha256
    && digests[2] === pushedSha256
    && digests[3] === pushedSha256
    && digests[4] === pushedSha256
}

export function packagedCandidateTreeDigestsAreValid({
  expectedDigest,
  distDigest,
  iosDigest,
  androidDigest,
}) {
  return [expectedDigest, distDigest, iosDigest, androidDigest].every(isSha256)
    && distDigest === expectedDigest
    && iosDigest === expectedDigest
    && androidDigest === expectedDigest
}

export function iosIpaRuntimeTreeEvidence({ ipaPath, ignoredRootFiles = [] }) {
  if (
    typeof ipaPath !== 'string'
    || ipaPath === ''
    || !Array.isArray(ignoredRootFiles)
    || new Set(ignoredRootFiles).size !== ignoredRootFiles.length
    || !ignoredRootFiles.every((name) => (
      typeof name === 'string'
      && name !== ''
      && !name.includes('/')
      && !name.includes('\\')
      && name !== '.'
      && name !== '..'
    ))
  ) return null

  try {
    const stats = fs.lstatSync(ipaPath)
    if (!stats.isFile() || stats.isSymbolicLink()) return null
    const archiveBytes = fs.readFileSync(ipaPath)
    const listedEntries = execFileSync('unzip', ['-Z1', ipaPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/).filter(Boolean)
    const matchedEntries = listedEntries.map((entry) => {
      const match = entry.match(/^(Payload\/[^/]+\.app\/public\/)(.+)$/)
      if (!match || match[2].endsWith('/')) return null
      const relative = match[2]
      if (
        relative.includes('\\')
        || path.posix.isAbsolute(relative)
        || path.posix.normalize(relative) !== relative
        || relative.startsWith('../')
      ) throw new Error('non-canonical IPA public path')
      return { archivePath: entry, prefix: match[1], relative }
    }).filter(Boolean)
    if (
      matchedEntries.length === 0
      || new Set(matchedEntries.map(({ prefix }) => prefix)).size !== 1
      || new Set(matchedEntries.map(({ relative }) => relative)).size !== matchedEntries.length
    ) return null

    const ignored = new Set(ignoredRootFiles)
    const runtimeEntries = matchedEntries
      .filter(({ relative }) => !ignored.has(relative))
      .sort((left, right) => (
        left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0
      ))
    const hash = crypto.createHash('sha256')
    for (const entry of runtimeEntries) {
      hash.update(entry.relative)
      hash.update('\0')
      hash.update(execFileSync('unzip', ['-p', ipaPath, entry.archivePath], {
        encoding: null,
        stdio: ['ignore', 'pipe', 'ignore'],
      }))
      hash.update('\0')
    }
    return {
      archiveSize: stats.size,
      archiveSha256: crypto.createHash('sha256').update(archiveBytes).digest('hex'),
      totalPublicFileCount: matchedEntries.length,
      runtimeFileCount: runtimeEntries.length,
      runtimeDigest: hash.digest('hex'),
    }
  } catch {
    return null
  }
}

function gitBoolean(root, args) {
  try {
    execFileSync('git', args, {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch (error) {
    return error?.status === 1 ? false : null
  }
}

function gitOutput(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

function gitBlobSha256(root, revision, relative) {
  try {
    const contents = execFileSync('git', ['show', `${revision}:${relative}`], {
      cwd: root,
      encoding: null,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return crypto.createHash('sha256').update(contents).digest('hex')
  } catch {
    return ''
  }
}

function gitPathMode(root, args) {
  try {
    const lines = execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split(/\r?\n/).filter(Boolean)
    if (lines.length !== 1) return ''
    return lines[0].match(/^(\d{6})\s/)?.[1] || ''
  } catch {
    return ''
  }
}

function gitRef(root, ref) {
  try {
    return execFileSync('git', ['rev-parse', ref], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

export function candidateEvidenceGitLineageIsValid({
  root,
  candidateSource,
  evidenceHead,
  pushedEvidenceHead,
  candidateTagRef,
  releasePaths,
  descendantReleasePaths,
  worktreePaths,
}) {
  const canonicalPaths = Array.isArray(releasePaths)
    && releasePaths.length > 0
    && new Set(releasePaths).size === releasePaths.length
    && releasePaths.every((relative) => (
      typeof relative === 'string'
      && relative !== ''
      && !relative.includes('\\')
      && !path.posix.isAbsolute(relative)
      && path.posix.normalize(relative) === relative
      && !relative.startsWith('../')
    ))
  const canonicalWorktreePaths = Array.isArray(worktreePaths)
    && worktreePaths.length > 0
    && new Set(worktreePaths).size === worktreePaths.length
    && worktreePaths.every((relative) => (
      typeof relative === 'string'
      && relative !== ''
      && !relative.includes('\\')
      && !path.posix.isAbsolute(relative)
      && path.posix.normalize(relative) === relative
      && !relative.startsWith('../')
    ))
  const canonicalDescendantPaths = Array.isArray(descendantReleasePaths)
    && descendantReleasePaths.length > 0
    && new Set(descendantReleasePaths).size === descendantReleasePaths.length
    && descendantReleasePaths.every((relative) => (
      typeof relative === 'string'
      && relative !== ''
      && !relative.includes('\\')
      && !path.posix.isAbsolute(relative)
      && path.posix.normalize(relative) === relative
      && !relative.startsWith('../')
      && releasePaths.includes(relative)
    ))
  if (
    typeof root !== 'string'
    || root === ''
    || !/^[0-9a-f]{40}$/.test(candidateSource || '')
    || !/^[0-9a-f]{40}$/.test(evidenceHead || '')
    || !/^[0-9a-f]{40}$/.test(pushedEvidenceHead || '')
    || typeof candidateTagRef !== 'string'
    || candidateTagRef === ''
    || !canonicalPaths
    || !canonicalDescendantPaths
    || !canonicalWorktreePaths
  ) return false

  const currentHead = gitRef(root, 'HEAD')
  return currentHead === pushedEvidenceHead
    && gitRef(root, candidateTagRef) === candidateSource
    && gitBoolean(root, ['merge-base', '--is-ancestor', candidateSource, evidenceHead]) === true
    && gitBoolean(root, ['merge-base', '--is-ancestor', evidenceHead, pushedEvidenceHead]) === true
    && gitBoolean(root, ['diff', '--quiet', candidateSource, evidenceHead, '--', ...releasePaths]) === true
    && gitBoolean(root, ['diff', '--quiet', evidenceHead, pushedEvidenceHead, '--', ...descendantReleasePaths]) === true
    && gitBoolean(root, ['diff', '--quiet', currentHead, '--', ...worktreePaths]) === true
    && gitBoolean(root, ['diff', '--cached', '--quiet', currentHead, '--', ...worktreePaths]) === true
    && gitOutput(root, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...worktreePaths]) === ''
}

export function screenshotReceiptGitCustody({ root, receiptPath, workingTreeSource }) {
  const canonicalPath = typeof receiptPath === 'string'
    && receiptPath !== ''
    && !receiptPath.includes('\\')
    && !path.posix.isAbsolute(receiptPath)
    && path.posix.normalize(receiptPath) === receiptPath
    && !receiptPath.startsWith('../')
  if (
    typeof root !== 'string'
    || root === ''
    || !canonicalPath
    || typeof workingTreeSource !== 'string'
  ) return null

  let workingTreeBytes = null
  let worktreeRegularFile = false
  let worktreeExecutable = null
  try {
    const stats = fs.lstatSync(path.join(root, receiptPath))
    worktreeRegularFile = stats.isFile() && !stats.isSymbolicLink()
    worktreeExecutable = (stats.mode & 0o111) !== 0
    workingTreeBytes = fs.readFileSync(path.join(root, receiptPath))
  } catch {
    // The fail-closed record below retains empty/false evidence.
  }

  return {
    receiptPath,
    tracked: gitBoolean(root, ['ls-files', '--error-unmatch', '--', receiptPath]),
    ignored: gitBoolean(root, ['check-ignore', '--no-index', '--quiet', '--', receiptPath]),
    worktreeRegularFile,
    worktreeExecutable,
    parsedSourceSha256: crypto.createHash('sha256').update(workingTreeSource, 'utf8').digest('hex'),
    workingTreeSha256: workingTreeBytes
      ? crypto.createHash('sha256').update(workingTreeBytes).digest('hex')
      : '',
    indexSha256: gitBlobSha256(root, ':0', receiptPath),
    committedSha256: gitBlobSha256(root, 'HEAD', receiptPath),
    indexMode: gitPathMode(root, ['ls-files', '--stage', '--', receiptPath]),
    committedMode: gitPathMode(root, ['ls-tree', 'HEAD', '--', receiptPath]),
  }
}

export function screenshotReceiptGitCustodyIsValid(custody, expectedReceiptPath) {
  return isExactRecord(custody, [
    'receiptPath',
    'tracked',
    'ignored',
    'worktreeRegularFile',
    'worktreeExecutable',
    'parsedSourceSha256',
    'workingTreeSha256',
    'indexSha256',
    'committedSha256',
    'indexMode',
    'committedMode',
  ])
    && custody.receiptPath === expectedReceiptPath
    && custody.tracked === true
    && custody.ignored === false
    && custody.worktreeRegularFile === true
    && custody.worktreeExecutable === false
    && isSha256(custody.parsedSourceSha256)
    && custody.parsedSourceSha256 === custody.workingTreeSha256
    && isSha256(custody.workingTreeSha256)
    && custody.workingTreeSha256 === custody.indexSha256
    && custody.workingTreeSha256 === custody.committedSha256
    && custody.indexMode === '100644'
    && custody.committedMode === '100644'
}

function hasOffsetRfc3339Timestamp(value) {
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

function parseScreenshotReceipt(source) {
  if (typeof source !== 'string') return null

  let cursor = 0
  let duplicateKey = false
  const skipWhitespace = () => {
    while (/\s/.test(source[cursor] || '')) cursor += 1
  }
  const parseString = () => {
    const start = cursor
    if (source[cursor] !== '"') throw new Error('expected JSON string')
    cursor += 1
    while (cursor < source.length) {
      if (source[cursor] === '\\') {
        cursor += 2
        continue
      }
      if (source[cursor] === '"') {
        cursor += 1
        return JSON.parse(source.slice(start, cursor))
      }
      cursor += 1
    }
    throw new Error('unterminated JSON string')
  }
  const parseValue = () => {
    skipWhitespace()
    if (source[cursor] === '{') {
      cursor += 1
      skipWhitespace()
      const keys = new Set()
      if (source[cursor] === '}') {
        cursor += 1
        return
      }
      while (cursor < source.length) {
        skipWhitespace()
        const key = parseString()
        if (keys.has(key)) duplicateKey = true
        keys.add(key)
        skipWhitespace()
        if (source[cursor] !== ':') throw new Error('expected JSON colon')
        cursor += 1
        parseValue()
        skipWhitespace()
        if (source[cursor] === '}') {
          cursor += 1
          return
        }
        if (source[cursor] !== ',') throw new Error('expected JSON object delimiter')
        cursor += 1
      }
      throw new Error('unterminated JSON object')
    }
    if (source[cursor] === '[') {
      cursor += 1
      skipWhitespace()
      if (source[cursor] === ']') {
        cursor += 1
        return
      }
      while (cursor < source.length) {
        parseValue()
        skipWhitespace()
        if (source[cursor] === ']') {
          cursor += 1
          return
        }
        if (source[cursor] !== ',') throw new Error('expected JSON array delimiter')
        cursor += 1
      }
      throw new Error('unterminated JSON array')
    }
    if (source[cursor] === '"') {
      parseString()
      return
    }
    while (cursor < source.length && !/[\s,}\]]/.test(source[cursor])) cursor += 1
  }

  try {
    parseValue()
    skipWhitespace()
    if (cursor !== source.length || duplicateKey) return null
    return JSON.parse(source)
  } catch {
    return null
  }
}

export function parseAppleScreenshotReceipt(source) {
  return parseScreenshotReceipt(source)
}

export function parseAndroidScreenshotReceipt(source) {
  return parseScreenshotReceipt(source)
}

function screenshotReceiptIsValid(receipt, {
  platform,
  screenshotDirectories,
  buildIdentityKeys,
  buildIdentityIsValid,
  actualScreenshots,
  expectedSourceCommit,
  expectedBuildIdentity,
  receiptGitCustody,
  receiptPath,
  now = new Date(),
}) {
  if (!screenshotReceiptGitCustodyIsValid(receiptGitCustody, receiptPath)) return false

  if (!isExactRecord(receipt, [
    'schemaVersion',
    'platform',
    'status',
    'reviewedSourceCommit',
    'buildIdentity',
    'visualReview',
    'screenshots',
  ])) return false

  if (
    receipt.schemaVersion !== 1
    || receipt.platform !== platform
    || receipt.status !== 'verified'
    || !/^[0-9a-f]{40}$/.test(receipt.reviewedSourceCommit || '')
    || receipt.reviewedSourceCommit !== expectedSourceCommit
  ) return false

  if (
    !isExactRecord(receipt.buildIdentity, buildIdentityKeys)
    || !isExactRecord(expectedBuildIdentity, buildIdentityKeys)
    || !buildIdentityKeys.every((key) => receipt.buildIdentity[key] === expectedBuildIdentity[key])
    || !buildIdentityIsValid(receipt.buildIdentity)
  ) return false

  if (
    !isExactRecord(receipt.visualReview, ['result', 'reviewedBy', 'reviewedAt'])
    || receipt.visualReview.result !== 'PASS'
    || typeof receipt.visualReview.reviewedBy !== 'string'
    || receipt.visualReview.reviewedBy.trim() === ''
    || !hasOffsetRfc3339Timestamp(receipt.visualReview.reviewedAt)
  ) return false

  const nowTime = now instanceof Date
    ? now.getTime()
    : typeof now === 'number'
      ? now
      : Date.parse(now)
  if (
    !Number.isFinite(nowTime)
    || Date.parse(receipt.visualReview.reviewedAt) > nowTime
  ) return false

  if (
    !Array.isArray(receipt.screenshots)
    || !Array.isArray(actualScreenshots)
    || actualScreenshots.length === 0
    || receipt.screenshots.length !== actualScreenshots.length
  ) return false

  const pathIsCanonicalDirectChild = (value) => {
    if (typeof value !== 'string' || value.includes('\\')) return false
    return screenshotDirectories.some((directory) => {
      const prefix = `${directory}/`
      if (!value.startsWith(prefix)) return false
      const filename = value.slice(prefix.length)
      return filename !== ''
        && !filename.startsWith('.')
        && !filename.includes('/')
        && filename !== '.'
        && filename !== '..'
    })
  }

  const expectedPaths = new Set()
  const actualByPath = new Map()
  for (const screenshot of actualScreenshots) {
    if (
      !isExactRecord(screenshot, ['path', 'sha256'])
      || !pathIsCanonicalDirectChild(screenshot.path)
      || !isSha256(screenshot.sha256)
      || actualByPath.has(screenshot.path)
    ) return false
    actualByPath.set(screenshot.path, screenshot.sha256)
    expectedPaths.add(screenshot.path)
  }

  const receiptPaths = new Set()
  for (const screenshot of receipt.screenshots) {
    if (
      !isExactRecord(screenshot, ['path', 'sha256'])
      || !expectedPaths.has(screenshot.path)
      || !isSha256(screenshot.sha256)
      || receiptPaths.has(screenshot.path)
      || actualByPath.get(screenshot.path) !== screenshot.sha256
    ) return false
    receiptPaths.add(screenshot.path)
  }

  return receiptPaths.size === expectedPaths.size
    && actualByPath.size === expectedPaths.size
}

export function appleScreenshotReceiptIsValid(receipt, context) {
  return screenshotReceiptIsValid(receipt, {
    ...context,
    platform: 'apple',
    receiptPath: 'store/apple-screenshot-verification.json',
    screenshotDirectories: APPLE_SCREENSHOT_DIRECTORIES,
    buildIdentityKeys: ['bundleId', 'marketingVersion', 'buildNumber'],
    buildIdentityIsValid: (identity) => (
      Number.isInteger(identity.buildNumber)
      && identity.buildNumber > 0
    ),
  })
}

export function androidScreenshotReceiptIsValid(receipt, context) {
  return screenshotReceiptIsValid(receipt, {
    ...context,
    platform: 'android',
    receiptPath: 'store/android-screenshot-verification.json',
    screenshotDirectories: ANDROID_SCREENSHOT_DIRECTORIES,
    buildIdentityKeys: ['applicationId', 'versionName', 'versionCode'],
    buildIdentityIsValid: (identity) => (
      Number.isInteger(identity.versionCode)
      && identity.versionCode > 0
    ),
  })
}
