import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { mobileVersionContract } from './mobile-version-contract.mjs'
import {
  formatScreenshotDimensions,
  candidateEvidenceGitLineageIsValid,
  exactPackageManifestTransitionIsValid,
  mobilePackageLockLineageIsValid,
  packagedCandidateTreeDigestsAreValid,
  iosIpaRuntimeTreeEvidence,
  appleScreenshotReceiptIsValid,
  androidScreenshotReceiptIsValid,
  androidScreenshotProvenanceIsConsistent,
  appleScreenshotProvenanceIsConsistent,
  hasAndroidScreenshotCreativeHold,
  hasAppleScreenshotSubmissionHold,
  parseAppleScreenshotReceipt,
  parseAndroidScreenshotReceipt,
  screenshotReceiptGitCustody,
  screenshotDimensionsMatch,
  STORE_SCREENSHOT_SETS,
} from './screenshot-provenance.mjs'
import {
  ANDROID_UPLOAD_ENV_NAMES,
  ANDROID_UPLOAD_JKS_PATH,
  ANDROID_UPLOAD_KEYSTORE_PATH,
  ANDROID_UPLOAD_PROPERTIES_PATH,
  DESKTOP_LICENSE_PRIVATE_REPO_PATH,
  DESKTOP_LICENSE_PUBLIC_REPO_PATH,
  THEOLOGY_DATABASE_PATH,
  androidUploadSigningRecordsAreCanonical,
  desktopLicenseSigningRecordsAreCanonical,
  theologyExternalArtifactIsCanonical,
} from './theology-external-artifact.mjs'
import {
  activeMarkdown,
  CONSOLE_PACKET_PATHS,
  consolePacketRetentionRecordsAreVerified,
  readConsolePacketInput,
} from './console-packet-retention.mjs'
import {
  authoritySemanticFailures,
  hasUnmatchedInlineCode,
  lineContaining as uniqueActiveAuthorityLineContaining,
  stripInlineCode,
} from './mobile-release-record-authority.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function uniqueActiveMarkdownSection(text, heading) {
  const active = activeMarkdown(text)
  const lines = active.split(/\r?\n/)
  const headingLines = stripInlineCode(active).split(/\r?\n/)
  const marker = `## ${heading}`
  const starts = headingLines.flatMap((line, index) => line === marker ? [index] : [])
  if (starts.length !== 1) return ''
  const start = starts[0] + 1
  const nextHeadingOffset = headingLines.slice(start).findIndex((line) => /^##\s+/.test(line))
  const end = nextHeadingOffset === -1 ? lines.length : start + nextHeadingOffset
  return lines.slice(start, end).join('\n')
}

const MOBILE_PACKAGE_INPUT_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  'vite.mobile.config.ts',
  'capacitor.config.ts',
  'mobile',
  'src',
  'server/src/iap-products.json',
  'store/metadata.json',
  'ios/App/App.xcodeproj/project.pbxproj',
  'ios/App/App/Info.plist',
  'ios/App/App/PrivacyInfo.xcprivacy',
  'android/app/build.gradle',
  'android/app/src/main/AndroidManifest.xml',
])
const MOBILE_RELEASE_LINEAGE_PATHS = Object.freeze([
  ...MOBILE_PACKAGE_INPUT_PATHS.filter((relative) => relative !== 'package-lock.json'),
  'ios/App',
  'android',
])
const MOBILE_DESCENDANT_RELEASE_LINEAGE_PATHS = Object.freeze(
  MOBILE_RELEASE_LINEAGE_PATHS.filter((relative) => relative !== 'package.json'),
)
const CANDIDATE_PACKAGE_MANIFEST_SHA256 = 'ba0809a4adaad80f20385a7c8a8b3210f81fd775a07d934583b67632f5c7ce96'
const PUSHED_PACKAGE_MANIFEST_SHA256 = '93b205f491e7489957fd17f1fa73e9e81bf5fc5f2d18bf5450c9c193c4fed97c'
const BUILD_6_RUNTIME_TREE_DIGEST = '68fd3aed717cbad04fccf4e52e9d260d34523687c4b4a289a267c5cc3b0d5a57'
const BUILD_6_IPA_SHA256 = '4771d80d443d3219a1b7734e7cd07084ae791087ee8cac6a214e800c155577be'
const BUILD_6_IPA_SIZE = 2_193_322
const BUILD_6_IPA_EVIDENCE_PATH = path.resolve(
  root,
  '../../Claude/System/AI-Collaboration/local-release-evidence/ios/1.4.2-build6/TheOperator-1.4.2-build6.ipa',
)
const require = createRequire(import.meta.url)
const { PLANS } = require('../server/src/entitlement.js')
const failures = []
const warnings = []
const passes = []

function stripSourceComments(source) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source)
  let clean = ''
  let cursor = 0
  const templateBraceDepth = []
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken;) {
    const start = scanner.getTokenPos()
    const end = scanner.getTextPos()
    clean += source.slice(cursor, start)
    const text = source.slice(start, end)
    clean += token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia
      ? text.replace(/[^\r\n]/g, ' ')
      : text
    cursor = end
    if (token === ts.SyntaxKind.TemplateHead) {
      templateBraceDepth.push(0)
      token = scanner.scan()
      continue
    }
    if (templateBraceDepth.length && token === ts.SyntaxKind.OpenBraceToken) {
      templateBraceDepth[templateBraceDepth.length - 1] += 1
    } else if (templateBraceDepth.length && token === ts.SyntaxKind.CloseBraceToken) {
      const index = templateBraceDepth.length - 1
      if (templateBraceDepth[index] === 0) {
        clean = clean.slice(0, clean.length - text.length)
        cursor = start
        token = scanner.reScanTemplateToken()
        if (token === ts.SyntaxKind.TemplateTail) templateBraceDepth.pop()
        continue
      }
      templateBraceDepth[index] -= 1
    }
    token = scanner.scan()
  }
  return clean + source.slice(cursor)
}

const read = (relative) => {
  const contents = fs.readFileSync(path.join(root, relative), 'utf8')
  return /\.(?:[cm]?[jt]sx?)$/.test(relative) ? stripSourceComments(contents) : contents
}
const exists = (relative) => fs.existsSync(path.join(root, relative))
const gitRef = (ref) => {
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
const gitTextAt = (ref, relative) => {
  try {
    return execFileSync('git', ['show', `${ref}:${relative}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}
const gitIndexText = (relative) => {
  try {
    return execFileSync('git', ['show', `:${relative}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}
const binaryEvidence = (relative) => {
  try {
    const contents = fs.readFileSync(path.join(root, relative))
    return {
      size: contents.byteLength,
      sha256: crypto.createHash('sha256').update(contents).digest('hex'),
    }
  } catch {
    return { size: -1, sha256: '' }
  }
}
const gitTracks = (relative) => {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relative], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch (error) {
    return error?.status === 1 ? false : null
  }
}
const gitIgnores = (relative) => {
  try {
    execFileSync('git', ['check-ignore', '--quiet', '--', relative], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch (error) {
    return error?.status === 1 ? false : null
  }
}
const xcodeTargetReleaseSettings = (project) => {
  const match = project.match(/\/\* Release \*\/ = \{[\s\S]*?Pods-App\.release\.xcconfig[\s\S]*?buildSettings = \{([\s\S]*?)\n\s*\};\n\s*name = Release;/)
  return match?.[1] || ''
}
const pass = (message) => passes.push(message)
const fail = (message) => failures.push(message)
const warn = (message) => warnings.push(message)
const check = (condition, message) => condition ? pass(message) : fail(message)

function directoryDigest(relative, ignored = new Set()) {
  const directory = path.join(root, relative)
  const hash = crypto.createHash('sha256')
  const files = fs.readdirSync(directory, { recursive: true })
    .filter((entry) => fs.statSync(path.join(directory, entry)).isFile())
    .filter((entry) => !ignored.has(entry))
    .sort()
  for (const entry of files) {
    hash.update(entry)
    hash.update('\0')
    hash.update(fs.readFileSync(path.join(directory, entry)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function pngMetadata(relative) {
  const buffer = fs.readFileSync(path.join(root, relative))
  if (
    buffer.length < 33 ||
    buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
    buffer.readUInt32BE(8) !== 13 ||
    buffer.toString('ascii', 12, 16) !== 'IHDR'
  ) return null

  let offset = 8
  let hasTransparencyChunk = false
  let sawEnd = false
  while (offset + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset)
    if (chunkLength > buffer.length - offset - 12) return null
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8)
    if (chunkType === 'tRNS') hasTransparencyChunk = true
    offset += chunkLength + 12
    if (chunkType === 'IEND') {
      sawEnd = true
      break
    }
  }
  if (!sawEnd) return null

  const colorType = buffer[25]
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType,
    hasAlpha: colorType === 4 || colorType === 6 || hasTransparencyChunk,
  }
}

const metadata = JSON.parse(read('store/metadata.json'))
const catalog = JSON.parse(read('server/src/iap-products.json'))
const packageJson = JSON.parse(read('package.json'))
const packageLock = JSON.parse(read('package-lock.json'))
const serverPackageJson = JSON.parse(read('server/package.json'))
const serverPackageLock = JSON.parse(read('server/package-lock.json'))
const pbxproj = read('ios/App/App.xcodeproj/project.pbxproj')
const xcodeRelease = xcodeTargetReleaseSettings(pbxproj)
const iosInfoPlist = read('ios/App/App/Info.plist')
const androidBuild = read('android/app/build.gradle')
const androidVariables = read('android/variables.gradle')
const androidManifest = read('android/app/src/main/AndroidManifest.xml')
const gitignore = read('.gitignore')
const dockerignore = read('.dockerignore')
const railwayignore = read('.railwayignore')
const mobileApp = read('src/mobile/MobileApp.tsx')
const terms = read('website/operator-terms.html')
const privacy = read('website/operator-privacy-addendum.html')
const serverIndex = read('server/src/index.js')
const generationRoutes = read('server/src/routes/generation.js')
const serverAuth = read('server/src/auth.js')
const studyAiAccess = read('server/src/study-ai-access.js')
const studyCommentary = read('server/src/study-commentary.js')
const serverSchema = read('server/src/schema.sql')
const accountRecovery = read('server/src/account-recovery.js')
const privacyManifest = read('ios/App/App/PrivacyInfo.xcprivacy')
const mobileApi = read('src/mobile/api.ts')
const mobileStore = read('src/mobile/store.ts')
const serverIap = read('server/src/iap.js')
const mobileAccount = read('server/src/mobile-account.js')
const accountRegistration = read('server/src/account-registration.js')
const mobileRoutes = read('server/src/mobile.js')
const localStudies = read('src/mobile/localStudies.ts')
const recordings = read('src/mobile/recordings.ts')
const quickStudyDocument = read('src/mobile/QuickStudyDocument.tsx')
const manuscriptEditor = read('src/mobile/TabletManuscriptEditor.tsx')
const tabletDeskModel = read('src/mobile/tabletDeskModel.ts')
const tabletDesk = read('src/mobile/TabletSermonDesk.tsx')
const tabletRecorder = read('src/mobile/TabletRecorder.tsx')
const mobileSource = fs.readdirSync(path.join(root, 'src/mobile'), { withFileTypes: true, recursive: true })
  .filter((entry) => entry.isFile() && /\.(?:[cm]?[jt]sx?)$/.test(entry.name))
  .map((entry) => read(path.relative(root, path.join(entry.parentPath, entry.name))))
  .join('\n')
const readiness = read('server/src/readiness.js')
const liveStoreGate = read('scripts/check-mobile-store-live.mjs')
const mobileReleaseProvenanceGate = read('scripts/check-mobile-release-provenance.sh')
const screenshotPlan = read('store/screenshots.md')
const appleScreenshotReceiptSource = read('store/apple-screenshot-verification.json')
const appleScreenshotReceipt = parseAppleScreenshotReceipt(appleScreenshotReceiptSource)
const appleScreenshotReceiptGitCustody = screenshotReceiptGitCustody({
  root,
  receiptPath: 'store/apple-screenshot-verification.json',
  workingTreeSource: appleScreenshotReceiptSource,
})
const androidScreenshotReceiptSource = read('store/android-screenshot-verification.json')
const androidScreenshotReceipt = parseAndroidScreenshotReceipt(androidScreenshotReceiptSource)
const androidScreenshotReceiptGitCustody = screenshotReceiptGitCustody({
  root,
  receiptPath: 'store/android-screenshot-verification.json',
  workingTreeSource: androidScreenshotReceiptSource,
})
const releaseChecklist = read('store/release-checklist.md')
const releaseLedger = read('store/release-ledger.md')
const externalArtifacts = read('store/external-artifacts.md')
const theologyRightsNotice = read('resources/theology-retrieval/RIGHTS-NOTICE.txt')
const theologyBundleManifest = read('resources/theology-retrieval/bundle-manifest.json')
const serverDockerfile = read('server/Dockerfile')
const productPlan = read('store/products.md')
const consolePacketInputs = Object.fromEntries(CONSOLE_PACKET_PATHS.map((relative) => [
  relative,
  readConsolePacketInput({ root, relative }),
]))
const consoleActionPacket = consolePacketInputs['store/console-action-packet.md'].text
const appleConsoleCompletionPacket = consolePacketInputs['store/apple-console-completion-packet.md'].text
const googleConsoleCompletionPacket = consolePacketInputs['store/google-console-completion-packet.md'].text
const reviewNotes = read('store/review-notes.md')

for (const relative of CONSOLE_PACKET_PATHS) {
  check(
    consolePacketInputs[relative].available,
    `Console packet input is configured and readable: ${relative}`,
  )
}

const usd = (value) => `$${Number(value).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`
const appleConsoleRows = catalog.products.map((product) => {
  const plan = PLANS[product.plan]
  const cadence = plan.billingInterval === 'year' ? '1 year' : '1 month'
  const suffix = product.plan === 'heavy_annual'
    ? ' ⛔ **DO NOT make purchasable on iOS** — Android/web mapping only'
    : ''
  return `| \`${product.appleProductId}\` | ${plan.label} ${plan.billingInterval === 'year' ? 'Annual' : 'Monthly'} | ${usd(plan.priceUsd)} | ${cadence} | ${plan.studiesPerMonth} studies/mo |${suffix}`
})
const googleConsoleRows = catalog.products.map((product) => {
  const plan = PLANS[product.plan]
  const period = plan.billingInterval === 'year' ? 'P1Y' : 'P1M'
  return `| \`${product.androidBasePlanId}\` | ${usd(plan.priceUsd)} | ${period} | ${plan.studiesPerMonth} studies/mo |`
})

check(
  /platform === ['"]ios['"]\s*\?\s*catalog\.products\.filter\(\(product\) => product\.plan !== ['"]heavy_annual['"]\)\s*:\s*catalog\.products/.test(mobileStore) &&
    /const definitions = catalogForPlatform\(platform\)/.test(mobileStore) &&
    /productIdentifiers: \[\.\.\.new Set\(definitions\.map/.test(mobileStore) &&
    /const productIndexes = requireCompleteStoreCatalog\(definitions, products, platform\)/.test(mobileStore) &&
    /return definitions\.map/.test(mobileStore),
  'iOS excludes the uneconomic Heavy Annual plan from both StoreKit requests and rendered plans',
)

check(
  readiness.includes('apple_iap_sandbox_review: full && sandboxReviewerAllowlistConfigured') &&
    liveStoreGate.includes("health.capabilities?.apple_iap_sandbox_review === true"),
  'Apple live gate requires a non-placeholder sandbox reviewer allowlist',
)

check(
  appleConsoleRows.every((row) => consoleActionPacket.includes(row)) &&
    googleConsoleRows.every((row) => consoleActionPacket.includes(row)) &&
    consoleActionPacket.includes('**Only FIVE are purchasable on iOS.**') &&
    consoleActionPacket.includes('Use the existing **one** subscription group `The Operator Access`; do not create a second group.') &&
    consoleActionPacket.includes('Re-read its live membership before any approved edit.') &&
    !consoleActionPacket.includes('Create **one** group.'),
  'Console transcription packet preserves the existing Apple group and matches canonical store prices, allowances, periods, and iOS scope',
)

const reviewerIdentityInstructions = `${consoleActionPacket}\n${reviewNotes}`
check(
  /SELECT email FROM account WHERE id = \$1/.test(serverIap) &&
    /appAccountToken:\s*accountId/.test(mobileStore) &&
    consoleActionPacket.includes('Add the dedicated Operator reviewer account email to `IAP_SANDBOX_ACCOUNT_EMAILS`') &&
    /Separately\s+configure and use Apple's sandbox tester identity/.test(consoleActionPacket) &&
    reviewNotes.includes('add its exact email to `IAP_SANDBOX_ACCOUNT_EMAILS`') &&
    reviewNotes.includes('Separately configure and use the appropriate Apple/Google sandbox or test purchaser identity') &&
    reviewNotes.includes('Do not assume or require those identities to use the same email') &&
    !/exact (?:account )?email (?:is|must be) (?:also )?present in both/i.test(reviewerIdentityInstructions),
  'Reviewer instructions separate the Operator allowlist identity from the store purchaser identity',
)

const appleIdentityInstruction = consoleActionPacket
  .split(/\r?\n/)
  .find((line) => line.startsWith('**SKU and Primary Language:**')) || ''
check(
  appleIdentityInstruction.includes('Read the existing values in App Store Connect') &&
    /Neither has an\s+independently verified current value in canonical metadata or this packet/.test(consoleActionPacket) &&
    /Do not infer, overwrite,\s+or transcribe either value from an older packet/.test(consoleActionPacket) &&
    !consoleActionPacket.includes('**SKU:**'),
  'Console action packet requires console-read SKU and Primary Language instead of an asserted value',
)

const appleReviewNotesRow = appleConsoleCompletionPacket
  .split(/\r?\n/)
  .find((line) => line.startsWith('| App Review notes |')) || ''
const appleReviewerSignInGapRow = appleConsoleCompletionPacket
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Reviewer sign-in path |')) || ''
check(
  appleReviewNotesRow.includes('store/review-notes.md') &&
    appleReviewNotesRow.includes('device-link code') &&
    !/\b(?:access|comp) code\b/i.test(appleReviewNotesRow) &&
    appleReviewerSignInGapRow.includes('2026-08-13 existence-only scan') &&
    appleReviewerSignInGapRow.includes('No unused device-link code is recorded in the checked-in non-secret sources') &&
    appleReviewerSignInGapRow.includes('current account existence and code availability were not re-queried') &&
    appleReviewerSignInGapRow.includes('Under fresh action-time approval, confirm the account, issue one code') &&
    appleReviewerSignInGapRow.includes('Never write it to Git, chat, logs, or this packet') &&
    !appleReviewerSignInGapRow.includes('no retrievable unused device-link code is locally available') &&
    /App Review notes \+ \*\*one unused reviewer DEVICE-LINK code \(`OPR-…`\)\*\*, issued only under fresh\s+action-time approval/.test(consoleActionPacket) &&
    /The 2026-08-13 existence-only scan found the recorded 2026-08-10 temporary\s+code artifacts absent/.test(consoleActionPacket) &&
    /No unused code is recorded in checked-in non-secret sources, and current\s+account existence and code availability were not re-queried/.test(consoleActionPacket) &&
    /Confirm the account, issue one code,\s+and place it only in App Review Information/.test(consoleActionPacket) &&
    consoleActionPacket.includes('Never write it to Git, chat, logs, or this packet') &&
    !consoleActionPacket.includes('are no longer present at their temporary local path'),
  'Apple completion packet requires a device-link code for App Review',
)

const appleContentRightsRow = appleConsoleCompletionPacket
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Content Rights |')) || ''
check(
  appleContentRightsRow.includes('store/review-notes.md') &&
    appleContentRightsRow.includes('website/operator-terms.html') &&
    appleContentRightsRow.includes('live console declaration not proved') &&
    reviewNotes.includes('initial store build includes public-domain translations only') &&
    terms.includes('only Bible translations BASE1520 is authorized to distribute'),
  'Apple completion packet records a sourced Content Rights basis without claiming console completion',
)

const appleSkuGapRow = appleConsoleCompletionPacket
  .split(/\r?\n/)
  .find((line) => line.startsWith('| SKU |')) || ''
check(
  appleSkuGapRow.includes('No exact SKU is locally recorded') &&
    appleSkuGapRow.includes('bundle ID is not evidence of the SKU') &&
    appleSkuGapRow.includes('Do not infer or replace it'),
  'Apple completion packet records SKU as an explicit non-inferable console gap',
)

const applePrimaryLanguageGapRow = appleConsoleCompletionPacket
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Primary Language |')) || ''
check(
  applePrimaryLanguageGapRow.includes('No exact Primary Language is locally recorded') &&
    applePrimaryLanguageGapRow.includes('English copy does not prove the console selection') &&
    applePrimaryLanguageGapRow.includes('Do not infer it from the listing text'),
  'Apple completion packet records Primary Language as an explicit non-inferable console gap',
)

const appleAgeRatingGapRow = appleConsoleCompletionPacket
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Age-rating questionnaire |')) || ''
check(
  appleAgeRatingGapRow.includes('Neither questionnaire answers nor the resulting rating exists') &&
    appleAgeRatingGapRow.includes('current questionnaire against the current build') &&
    appleAgeRatingGapRow.includes('record the answers and resulting rating') &&
    !/\b(?:complete|completed|saved|ready)\b/i.test(appleAgeRatingGapRow),
  'Apple completion packet records age rating as an unresolved questionnaire-derived console gap',
)

const appleCopyrightGapRow = appleConsoleCompletionPacket
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Copyright |')) || ''
check(
  appleCopyrightGapRow.includes('The ledger says a copyright was previously saved') &&
    appleCopyrightGapRow.includes('its exact string is absent') &&
    appleCopyrightGapRow.includes('locally unverifiable and non-transcribable') &&
    appleCopyrightGapRow.includes('Read the current console value') &&
    appleCopyrightGapRow.includes('correct year and rights-holder text') &&
    appleCopyrightGapRow.includes('record the exact non-secret value locally') &&
    !/(?:\b(?:complete|completed|configured|entered|provided|ready|done)\b|live console (?:saved|verified))/i.test(appleCopyrightGapRow),
  'Apple completion packet records copyright as an unresolved exact-value console gap',
)

const appleReviewContactGapRow = appleConsoleCompletionPacket
  .split(/\r?\n/)
  .find((line) => line.startsWith('| App Review contact |')) || ''
check(
  appleReviewContactGapRow.includes('No explicit review-contact name, email, or phone block exists') &&
    appleReviewContactGapRow.includes('general support email is not evidence of the intended App Review contact') &&
    appleReviewContactGapRow.includes('Cole supplies/approves the name, email, and phone for App Review') &&
    appleReviewContactGapRow.includes('record only the approved non-secret contact fields') &&
    !/\b(?:complete|completed|configured|entered|provided|saved|ready)\b/i.test(appleReviewContactGapRow),
  'Apple completion packet records App Review contact as an explicit approval-bound console gap',
)

check(
  consolePacketRetentionRecordsAreVerified({
    releaseChecklist,
    releaseLedger,
    actualPacketDigests: Object.fromEntries(CONSOLE_PACKET_PATHS.map((relative) => [
      relative,
      consolePacketInputs[relative].available
        ? crypto.createHash('sha256').update(consolePacketInputs[relative].buffer).digest('hex')
        : '',
    ])),
  }),
  'Console completion/action packets lack synchronized verified retention evidence',
)

const parseStoreGateCounts = (row, platform) => {
  const verbose = row.match(
    /(\d+)\s+passed\s*(?:·|,)\s*(\d+)\s+warnings\s*(?:·|,)\s*(\d+)\s+failed/i,
  )
  const compact = row.match(
    new RegExp(`${platform} is \\*\\*(\\d+)\\/(\\d+)\\/(\\d+)\\*\\*`, 'i'),
  )
  const counts = verbose || compact
  return counts ? counts.slice(1, 4).map(Number) : []
}
const parseStoreGateFailure = (row) =>
  row.match(/(?:solely|failing only) `([^`]+)`/i)?.[1] || ''
const expectedGoogleLiveFailure = 'Google purchase verification is operational'
const currentGoogleLiveBoundary = releaseChecklist
  .split(/\r?\n/)
  .find((line) => line.includes('Fresh Google-scoped production measurement')) || ''
const currentGoogleLedgerPreflight = releaseLedger
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Live production preflight |')) || ''
const googlePurchaseVerificationRow = releaseLedger
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Google production purchase verification |')) || ''
const googleChecklistAccessRow = releaseChecklist
  .split(/\r?\n/)
  .find((line) => line.includes('Correct BASE1520 Play Console account access is restored')) || ''
const googlePlayOwnershipRow = releaseLedger
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Google Play record ownership |')) || ''
const googleConsolePacketRow = releaseLedger
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Google console completion packet |')) || ''
const currentGoogleLiveCounts = parseStoreGateCounts(currentGoogleLiveBoundary, 'Google')
const ledgerGoogleLiveCounts = parseStoreGateCounts(currentGoogleLedgerPreflight, 'Google')
const googleVerificationCounts = parseStoreGateCounts(googlePurchaseVerificationRow, 'Google')
const currentGoogleLiveStamp = currentGoogleLiveBoundary
  .match(/at \*\*([^*]+)\*\* returns/)?.[1] || ''
const currentGoogleLiveFailure = parseStoreGateFailure(currentGoogleLiveBoundary)
const ledgerGoogleLiveFailure = parseStoreGateFailure(currentGoogleLedgerPreflight)
const googleVerificationFailure = parseStoreGateFailure(googlePurchaseVerificationRow)
check(
  currentGoogleLiveCounts.length === 3 &&
    currentGoogleLiveCounts.every((count, index) => count === ledgerGoogleLiveCounts[index]) &&
    currentGoogleLiveCounts.every((count, index) => count === googleVerificationCounts[index]) &&
    Boolean(currentGoogleLiveStamp) &&
    googlePurchaseVerificationRow.includes(`on ${currentGoogleLiveStamp}`) &&
    currentGoogleLiveFailure === expectedGoogleLiveFailure &&
    ledgerGoogleLiveFailure === expectedGoogleLiveFailure &&
    googleVerificationFailure === expectedGoogleLiveFailure &&
    googleChecklistAccessRow.includes('on 2026-08-14') &&
    googlePlayOwnershipRow.includes('DATED ACCESS EVIDENCE / OWNERSHIP + DEVELOPER VERIFICATION CLOSED; CURRENT IAB WRONG-IDENTITY SIGNUP BOUNDARY') &&
    googleConsolePacketRow.includes('The 2026-08-14 authenticated session established the real verified organization account') &&
    googleConsolePacketRow.includes('The fresh developer-root read resolved the available in-app browser to `/console/signup` under the personal browser identity') &&
    googleConsoleCompletionPacket.includes('does not prove that the current browser session remains authenticated') &&
    googleConsoleCompletionPacket.includes('A fresh read-only developer-root check on 2026-08-16 02:18 CDT resolved the available in-app browser to `/console/signup`') &&
    googleConsoleCompletionPacket.includes('no account type, `Get started`, signup, or account switch was used') &&
    !googlePlayOwnershipRow.includes('CURRENT BROWSER SESSION NOT RE-READ') &&
    !googleConsolePacketRow.includes('Current browser-session authentication was not re-read in this reconciliation.') &&
    !/\bCole is signed in(?:to)?\b/i.test(`${googlePlayOwnershipRow}\n${googleConsolePacketRow}`) &&
    !/privacy(?:-disclosure)? failures|plus all three named public privacy/i.test(googlePurchaseVerificationRow),
  'Release records agree Google live preflight is blocked only on purchase verification',
)

const migrationDiagnosticChecklistRow = releaseChecklist
  .split(/\r?\n/)
  .find((line) => line.includes('server/src/migrate.js') && line.includes('server/src/test-migrate.js')) || ''
const migrationDiagnosticLedgerRow = releaseLedger
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Leaked-code remediation migration diagnostics |')) || ''
const migrationDiagnosticRecordPair = `${migrationDiagnosticChecklistRow}\n${migrationDiagnosticLedgerRow}`
check(
  migrationDiagnosticChecklistRow.includes('AUDIT CONFIRMED') &&
    migrationDiagnosticChecklistRow.includes('Claude 21:02 CDT HANDOFF entry') &&
    migrationDiagnosticChecklistRow.includes('DIRTY-CLI DEPLOYMENT RECONCILED') &&
    migrationDiagnosticChecklistRow.includes('0973e6a3') &&
    migrationDiagnosticChecklistRow.includes('f9702bb2') &&
    migrationDiagnosticChecklistRow.includes('current source remains uncommitted') &&
    migrationDiagnosticChecklistRow.includes('no changed-row production event is claimed') &&
    migrationDiagnosticLedgerRow.includes('AUDIT CONFIRMED (Claude 2026-08-14 21:02 CDT HANDOFF') &&
    migrationDiagnosticLedgerRow.includes('/ DEPLOYED VIA DIRTY CLI SNAPSHOT / CURRENT SOURCE UNCOMMITTED') &&
    migrationDiagnosticLedgerRow.includes('0973e6a3') &&
    migrationDiagnosticLedgerRow.includes('f9702bb2') &&
    migrationDiagnosticLedgerRow.includes('no reproducible Git-source receipt') &&
    migrationDiagnosticLedgerRow.includes('No changed-row production event is claimed') &&
    !/(?:CLAUDE )?AUDIT PENDING|no `?AUDIT CONFIRMED`? promotion|no audit confirmation|\bUNDEPLOYED\b|No migration (?:or deployment )?ran|production logs were not queried|clean committed deployment|Git-provenanced deployment|changed-row production (?:behavior|effect|result) (?:confirmed|verified|proved)/i.test(migrationDiagnosticRecordPair),
  'Release records preserve the migration-diagnostic audit and dirty-CLI deployment boundary',
)

const authorityAuditChecklistRow = uniqueActiveAuthorityLineContaining(
  releaseChecklist,
  '**Submission-target authority reconciled',
  {
    prefix: '  - ✅ **Submission-target authority reconciled',
    singlePhysicalLine: true,
  },
)
const currentAuthorityLedgerSummaryRow = uniqueActiveAuthorityLineContaining(
  releaseLedger,
  '🚀 **DESKTOP v1.4.4 IS LIVE AS OF',
  {
    prefix: '> 🚀 **DESKTOP v1.4.4 IS LIVE AS OF',
    singlePhysicalLine: true,
  },
)
const historicalAuthorityAuditLedgerRow = uniqueActiveAuthorityLineContaining(
  releaseLedger,
  '**HISTORICAL AUTHORITY AUDIT RECORD —',
  {
    prefix: '> **HISTORICAL AUTHORITY AUDIT RECORD —',
    singlePhysicalLine: true,
  },
)
const currentAuthorityAuditLedgerRow = uniqueActiveAuthorityLineContaining(
  releaseLedger,
  '**CURRENT POST-BUILD-6 AUTHORITY RECORD —',
  {
    prefix: '> **CURRENT POST-BUILD-6 AUTHORITY RECORD —',
    singlePhysicalLine: true,
  },
)
const authorityAuditLatestReconciliationRow = uniqueActiveAuthorityLineContaining(
  releaseLedger,
  '**LATEST RECONCILIATION —',
  {
    prefix: '> **LATEST RECONCILIATION —',
    singlePhysicalLine: true,
  },
)
const authorityAuditRows = [
  authorityAuditChecklistRow,
  currentAuthorityLedgerSummaryRow,
  historicalAuthorityAuditLedgerRow,
  currentAuthorityAuditLedgerRow,
  authorityAuditLatestReconciliationRow,
]
const authorityAuditRecordSet = stripInlineCode(authorityAuditRows.join('\n'))
  .replace(/\b1\.4\.2\s*\(6\)(?!\w)/gi, 'build 6')
const authorityAuditSemanticFailures = authorityAuditRows.flatMap((row, index) => (
  authoritySemanticFailures([
    'checklist',
    'ledger summary',
    'historical ledger authority record',
    'current ledger authority record',
    'latest reconciliation',
  ][index], row)
))
check(
  authorityAuditChecklistRow.includes('alias/adversative follow-up AUDIT CONFIRMED by Claude at 02:05 CDT') &&
    Boolean(currentAuthorityLedgerSummaryRow) &&
    authorityAuditChecklistRow.includes("Claude's independent 7/7 battery") &&
    authorityAuditChecklistRow.includes('focused control is **55/55**') &&
    authorityAuditChecklistRow.includes('Build 6 is now source-bound and accepted for upload, while processing completion, selectability, and listing attachment remain unproved') &&
    authorityAuditChecklistRow.includes('the complete static gate remains intentionally red on its three recorded blockers') &&
    historicalAuthorityAuditLedgerRow.includes('Authority-parser alias/adversative follow-up remains AUDIT CONFIRMED (Claude 2026-08-15 02:05 CDT HANDOFF; independent 7/7 battery; focused 14/0).') &&
    historicalAuthorityAuditLedgerRow.includes('the shared checker control was **174/1/4**') &&
    historicalAuthorityAuditLedgerRow.includes('No build, upload, console, screenshot, or submission state changed in that historical audit') &&
    currentAuthorityAuditLedgerRow.includes('post-build-6 source/processing contract is locally reconciled with Claude audit pending') &&
    currentAuthorityAuditLedgerRow.includes('build 6 is the only executable path after processing/selectability is proven and only under fresh action-time approval') &&
    currentAuthorityAuditLedgerRow.includes('accepted upload is processing-only') &&
    currentAuthorityAuditLedgerRow.includes('target-authority control is **55/55**') &&
    currentAuthorityAuditLedgerRow.includes('complete checker is **179/1/3**') &&
    authorityAuditLatestReconciliationRow.includes('The three static failures remain: synchronized console-packet retention, the Apple screenshot hold, and the Android screenshot hold') &&
    authorityAuditLatestReconciliationRow.includes('The complete checker independently reproduces **179/1/3**.') &&
    authorityAuditLatestReconciliationRow.includes('Static checks do not establish submission readiness') &&
    authorityAuditSemanticFailures.length === 0 &&
    !authorityAuditRows.some(hasUnmatchedInlineCode) &&
    !/(?:alias\/adversative follow-up LOCAL|local and unreviewed)/i.test(authorityAuditRecordSet) &&
    !/\bbuild(?:\s+|-)6\b[^.!?;\n]*\b(?:ready for submission|ready to submit|submission-ready)\b/i.test(authorityAuditRecordSet),
  'Release records preserve historical authority audit evidence and the processing-only build-6 boundary',
)

const nativePackageArtifactParityRow = uniqueActiveAuthorityLineContaining(
  releaseLedger,
  '| Native package artifact parity |',
  { prefix: '| Native package artifact parity |' },
)
check(
  authoritySemanticFailures('native package artifact parity', nativePackageArtifactParityRow).length === 0 &&
    nativePackageArtifactParityRow.includes('PASS FOR BUILD-6 BYTES / IMMUTABLE TAGGED SOURCE / PACKAGE-AGE GREEN') &&
    nativePackageArtifactParityRow.includes('Build 6 contains the PREACH affordance fix') &&
    nativePackageArtifactParityRow.includes('static package-age assertion is green') &&
    nativePackageArtifactParityRow.includes('Apple and Android screenshot holds remain separately red') &&
    !/CURRENT WORKING SOURCE NEWER|package-age assertion is intentionally red|until a future candidate/i.test(nativePackageArtifactParityRow),
  'Release ledger binds build-6 package parity to its immutable tagged source',
)

const currentStaticGateBoundary = uniqueActiveAuthorityLineContaining(
  releaseChecklist,
  'THE POST-BUILD-6 AUTHORITY/LINEAGE ORACLE IS CURRENT',
  { prefix: '- [ ] 🔴 **THE POST-BUILD-6 AUTHORITY/LINEAGE ORACLE IS CURRENT' },
)
check(
  currentStaticGateBoundary.includes('target-authority command passes **55/55**') &&
    currentStaticGateBoundary.includes('direct readiness command completes at **179 passed · 1 warning · 3 failed**') &&
    currentStaticGateBoundary.includes('three failures are synchronized packet retention plus the Apple and Android screenshot holds') &&
    currentStaticGateBoundary.includes('build-6-proven screenshots') &&
    !/one remaining clean active-Preach|two clean build-5 landscape slots|three remaining iPad screenshots/i.test(currentStaticGateBoundary) &&
    authoritySemanticFailures('current static gate boundary', currentStaticGateBoundary).length === 0,
  'Release checklist preserves the build-6-proven iPad screenshot completion boundary',
)

const releaseSourceBoundary = uniqueActiveAuthorityLineContaining(
  releaseChecklist,
  '**Mobile-source lineage, verified',
  { prefix: '  - **Mobile-source lineage, verified' },
)
const archivedReleaseMatch = releaseSourceBoundary
  .match(/canonical release source for uploaded build (\d+) is `([0-9a-f]{40})`/)
const canonicalCandidateBuild = Number(archivedReleaseMatch?.[1] || 0)
const canonicalReleaseSource = archivedReleaseMatch?.[2] || ''
const candidateMetadataSource = gitTextAt(canonicalReleaseSource, 'store/metadata.json')
let candidateMetadata = null
try {
  candidateMetadata = JSON.parse(candidateMetadataSource)
} catch {
  candidateMetadata = null
}
const candidatePbxproj = gitTextAt(canonicalReleaseSource, 'ios/App/App.xcodeproj/project.pbxproj')
const candidateXcodeRelease = xcodeTargetReleaseSettings(candidatePbxproj)
const candidateAndroidBuild = gitTextAt(canonicalReleaseSource, 'android/app/build.gradle')
const candidateAppleBuildIdentity = {
  bundleId: candidateMetadata?.app?.bundleId || '',
  marketingVersion: candidateMetadata?.app?.version || '',
  buildNumber: Number(candidateXcodeRelease.match(/CURRENT_PROJECT_VERSION = ([1-9][0-9]*);/)?.[1] || 0),
}
const candidateAndroidBuildIdentity = {
  applicationId: candidateMetadata?.app?.bundleId || '',
  versionName: candidateMetadata?.app?.version || '',
  versionCode: Number(candidateAndroidBuild.match(/\bversionCode\s+([1-9][0-9]*)/)?.[1] || 0),
}

const externalReleaseGates = uniqueActiveMarkdownSection(releaseLedger, 'External release gates')
const signingEvidence = uniqueActiveMarkdownSection(releaseLedger, 'Signing evidence still required')
const externalReleaseGatesLower = externalReleaseGates.toLowerCase()
const signingEvidenceLower = signingEvidence.toLowerCase()
const preachAffordanceLedgerRow = uniqueActiveAuthorityLineContaining(
  releaseLedger,
  '| PREACH not-ready affordance (build-6 packaged) |',
  { prefix: '| PREACH not-ready affordance (build-6 packaged) |' },
)
const ipadScreenshotLedgerRow = uniqueActiveAuthorityLineContaining(
  releaseLedger,
  '| iPad screenshots |',
  { prefix: '| iPad screenshots |' },
)
const currentAppleOpenBoundary = uniqueActiveAuthorityLineContaining(
  releaseLedger,
  '**Still open in App Store Connect:**',
  {
    prefix: '**Still open in App Store Connect:**',
    singlePhysicalLine: true,
  },
)
const appleConsoleBuildBoundary = uniqueActiveAuthorityLineContaining(
  appleConsoleCompletionPacket,
  'Build boundary updated',
  {
    prefix: '- **Build boundary updated',
    singlePhysicalLine: true,
  },
)
const appleScreenshotHoldBoundary = uniqueActiveAuthorityLineContaining(
  screenshotPlan,
  'Apple submission hold:',
  {
    prefix: '> Apple submission hold:',
    singlePhysicalLine: true,
  },
)
const preachAffordanceLedgerRowLower = preachAffordanceLedgerRow.toLowerCase()
const ipadScreenshotLedgerRowLower = ipadScreenshotLedgerRow.toLowerCase()
const currentAppleOpenBoundaryLower = currentAppleOpenBoundary.toLowerCase()
const appleConsoleBuildBoundaryLower = appleConsoleBuildBoundary.toLowerCase()
const appleScreenshotHoldBoundaryLower = appleScreenshotHoldBoundary.toLowerCase()
check(
  canonicalCandidateBuild === 6 &&
    authoritySemanticFailures('mobile source lineage', releaseSourceBoundary).length === 0 &&
    authoritySemanticFailures('PREACH ledger boundary', preachAffordanceLedgerRow).length === 0 &&
    authoritySemanticFailures('iPad screenshot ledger boundary', ipadScreenshotLedgerRow).length === 0 &&
    authoritySemanticFailures('Apple open-state boundary', currentAppleOpenBoundary).length === 0 &&
    authoritySemanticFailures('external Apple gates', externalReleaseGates).length === 0 &&
    authoritySemanticFailures('Apple signing evidence', signingEvidence).length === 0 &&
    authoritySemanticFailures('Apple console build boundary', appleConsoleBuildBoundary).length === 0 &&
    authoritySemanticFailures('Apple screenshot hold boundary', appleScreenshotHoldBoundary).length === 0 &&
    releaseSourceBoundary.includes('Repository evidence may advance on clean pushed descendants of that immutable candidate only when all provenance-guarded mobile release inputs and synced native payloads remain byte-identical to the candidate') &&
    releaseSourceBoundary.includes('The pushed evidence tip is `4b25c05db5054da079202a4ab05daf1048ee5502`') &&
    releaseSourceBoundary.includes('Later pushed repository commits are permitted only by the exact pinned package-manifest transition while every other provenance-guarded input remains byte-identical to the evidence tip') &&
    releaseSourceBoundary.includes('receipt evidence must never redefine the candidate source') &&
    externalReleaseGates.includes(`\`${metadata.app.version} (4)\``) &&
    externalReleaseGates.includes('and `(5)` are preserved') &&
    externalReleaseGates.includes(`\`${metadata.app.version} (${canonicalCandidateBuild})\``) &&
    externalReleaseGatesLower.includes('historical builds') &&
    externalReleaseGatesLower.includes('must not be attached, selected, or submitted') &&
    externalReleaseGatesLower.includes(`build \`${metadata.app.version} (${canonicalCandidateBuild})\` is archived`) &&
    externalReleaseGatesLower.includes('accepted by app store connect') &&
    externalReleaseGatesLower.includes('receipt says only that the package is processing') &&
    externalReleaseGatesLower.includes(`confirm build-${canonicalCandidateBuild} processing completion/selectability`) &&
    externalReleaseGatesLower.includes(`attach build ${canonicalCandidateBuild}`) &&
    externalReleaseGatesLower.includes('only under separate fresh approval') &&
    externalReleaseGatesLower.includes(`build-${canonicalCandidateBuild}-proven screenshot set`) &&
    externalReleaseGatesLower.includes('pixel-equivalence proof') &&
    signingEvidenceLower.includes(
      `processing-completion/selectability and listing-selection receipts for uploaded build ${canonicalCandidateBuild}`,
    ) &&
    signingEvidenceLower.includes('builds 4 and 5 are historical') &&
    preachAffordanceLedgerRowLower.includes('screenshot from build 5 remains a historical visual draft') &&
    preachAffordanceLedgerRowLower.includes(`pixel-equivalence proof against packaged build ${canonicalCandidateBuild}`) &&
    ipadScreenshotLedgerRowLower.includes('build-5 drafts historical') &&
    ipadScreenshotLedgerRowLower.includes(`build ${canonicalCandidateBuild} now exists as a source-bound uploaded artifact`) &&
    ipadScreenshotLedgerRowLower.includes(
      `pixel-equivalence of any reused draft against packaged build ${canonicalCandidateBuild}`,
    ) &&
    ipadScreenshotLedgerRowLower.includes(`build-${canonicalCandidateBuild}-proven set`) &&
    currentAppleOpenBoundaryLower.includes(
      `build-${canonicalCandidateBuild} processing completion/selectability and listing selection`,
    ) &&
    currentAppleOpenBoundaryLower.includes(
      `build-${canonicalCandidateBuild}-proven ipad screenshots`,
    ) &&
    currentAppleOpenBoundaryLower.includes(`build ${canonicalCandidateBuild} creation/archive/export/upload is proven`) &&
    currentAppleOpenBoundaryLower.includes(
      'existing build-5 frames are visual drafts only',
    ) &&
    appleConsoleBuildBoundaryLower.includes(
      `build \`${metadata.app.version} (5)\` is uploaded/receipted but superseded`,
    ) &&
    appleConsoleBuildBoundaryLower.includes('must not be attached, selected, or submitted') &&
    appleConsoleBuildBoundaryLower.includes(`provenance-clean build **${canonicalCandidateBuild}**`) &&
    appleConsoleCompletionPacket.toLowerCase().includes(`does not prove that provenance-clean build \`${metadata.app.version} (${canonicalCandidateBuild})\` exists, is processed/selectable, or is selected`) &&
    appleScreenshotHoldBoundaryLower.includes(
      'these are build-5 visual drafts only',
    ) &&
    appleScreenshotHoldBoundaryLower.includes(`build ${canonicalCandidateBuild} now exists as a source-bound uploaded artifact`) &&
    appleScreenshotHoldBoundaryLower.includes(
      `pixel-equivalence of any reused build-5 draft against packaged build ${canonicalCandidateBuild}`,
    ) &&
    appleScreenshotHoldBoundaryLower.includes(`build-${canonicalCandidateBuild}-proven replacements`) &&
    !new RegExp('\\b(?:attach|select|submit)\\b[^\\n.]*\\bbuild(?: |-)?(?:4|5)\\b', 'i')
      .test(externalReleaseGates) &&
    !currentAppleOpenBoundaryLower.includes(`build ${canonicalCandidateBuild} creation and upload`) &&
    !ipadScreenshotLedgerRowLower.includes(
      'after build 6 exists',
    ) &&
    !appleScreenshotHoldBoundaryLower.includes(
      'after build 6 exists',
    ),
  'Release ledger forward actions track uploaded build 6 without promoting processing',
)

const currentAppleBuildProcessingBoundary = uniqueActiveAuthorityLineContaining(
  releaseChecklist,
  'Processing/selectability remains unverified.',
  {
    prefix: '  - ⏳ **Processing/selectability remains unverified.',
    singlePhysicalLine: true,
  },
)
const currentAppleBuildProcessingBoundaryLower = currentAppleBuildProcessingBoundary.toLowerCase()
const finalAppleScreenshotChecklistBoundary = uniqueActiveAuthorityLineContaining(
  releaseChecklist,
  'The remaining screenshot provenance failure is fail-closed',
  {
    prefix: '  - ✅ **The remaining screenshot provenance failure is fail-closed',
    singlePhysicalLine: true,
  },
)
const finalAppleScreenshotChecklistBoundaryLower = finalAppleScreenshotChecklistBoundary.toLowerCase()
const preachAffordanceChecklistBoundary = uniqueActiveAuthorityLineContaining(
  releaseChecklist,
  'Silent PREACH-gate affordance AUDIT CONFIRMED',
  {
    prefix: '  - ✅ **Silent PREACH-gate affordance AUDIT CONFIRMED',
    singlePhysicalLine: true,
  },
)
const preachAffordanceChecklistBoundaryLower = preachAffordanceChecklistBoundary.toLowerCase()
check(
  canonicalCandidateBuild === 6 &&
    authoritySemanticFailures('Apple build processing boundary', currentAppleBuildProcessingBoundary).length === 0 &&
    authoritySemanticFailures('final Apple screenshot boundary', finalAppleScreenshotChecklistBoundary).length === 0 &&
    authoritySemanticFailures('PREACH checklist boundary', preachAffordanceChecklistBoundary).length === 0 &&
    currentAppleBuildProcessingBoundaryLower.includes(
      `build ${canonicalCandidateBuild} upload is accepted`,
    ) &&
    currentAppleBuildProcessingBoundaryLower.includes(
      'uploaded package is processing',
    ) &&
    currentAppleBuildProcessingBoundaryLower.includes(
      'builds 4 and 5 are historical upload evidence and must not be selected or submitted',
    ) &&
    currentAppleBuildProcessingBoundaryLower.includes(
      `build ${canonicalCandidateBuild} is the only current executable path`,
    ) &&
    currentAppleBuildProcessingBoundaryLower.includes(
      `attach/select build ${canonicalCandidateBuild} only after app store connect shows it processed/selectable and cole gives fresh action-time approval`,
    ) &&
    finalAppleScreenshotChecklistBoundaryLower.includes(
      'every build-5 frame as a historical visual draft',
    ) &&
    finalAppleScreenshotChecklistBoundaryLower.includes(
      `build ${canonicalCandidateBuild} now exists as a source-bound uploaded artifact`,
    ) &&
    finalAppleScreenshotChecklistBoundaryLower.includes(`pixel-equivalence of any reused draft against packaged build ${canonicalCandidateBuild}`) &&
    finalAppleScreenshotChecklistBoundaryLower.includes(
      `build-${canonicalCandidateBuild}-proven complete set`,
    ) &&
    preachAffordanceChecklistBoundaryLower.includes(
      'build-5 preach-mode screenshot remains valid only as a historical visual draft',
    ) &&
    preachAffordanceChecklistBoundaryLower.includes(
      `pixel-equivalence proof against packaged build ${canonicalCandidateBuild}`,
    ) &&
    !new RegExp('\\b(?:attach|select|submit)\\b[^\\n.]*\\bbuild(?: |-)?(?:4|5)\\b', 'i')
      .test(currentAppleBuildProcessingBoundary) &&
    !/listing is explicitly switched/i.test(currentAppleBuildProcessingBoundary) &&
    !/first produce and upload provenance-clean build 6/i.test(currentAppleBuildProcessingBoundary) &&
    !finalAppleScreenshotChecklistBoundaryLower.includes(
      'after provenance-clean build 6 exists',
    ) &&
    !preachAffordanceChecklistBoundaryLower.includes(
      'next-build source only',
    ),
  'Release checklist keeps every superseded Apple build out of the final selection path',
)

const currentMobileSourceBoundary = uniqueActiveAuthorityLineContaining(
  releaseChecklist,
  'BUILD 6 ARCHIVE + DIRECT APP STORE CONNECT UPLOAD PROVEN',
  {
    prefix: '- [ ] 🟡 **BUILD 6 ARCHIVE + DIRECT APP STORE CONNECT UPLOAD PROVEN',
    singlePhysicalLine: true,
  },
)
const latestUploadedArtifactBoundary = uniqueActiveAuthorityLineContaining(
  releaseLedger,
  '**The latest uploaded Apple artifact is build',
  {
    prefix: '**The latest uploaded Apple artifact is build',
    singlePhysicalLine: true,
  },
)
const checklistEvidenceRepositoryHead = releaseSourceBoundary
  .match(/pushed evidence tip is `([0-9a-f]{40})`/i)?.[1] || ''
const ledgerEvidenceRepositoryHead = latestUploadedArtifactBoundary
  .match(/pushed evidence tip is `([0-9a-f]{40})`/i)?.[1] || ''
const evidenceRepositoryHead = checklistEvidenceRepositoryHead
  && checklistEvidenceRepositoryHead === ledgerEvidenceRepositoryHead
  ? checklistEvidenceRepositoryHead
  : ''
const pushedEvidenceRepositoryHead = gitRef('origin/main')
const candidatePackageManifestSource = gitTextAt(canonicalReleaseSource, 'package.json')
const evidencePackageManifestSource = gitTextAt(evidenceRepositoryHead, 'package.json')
const pushedPackageManifestSource = gitTextAt(pushedEvidenceRepositoryHead, 'package.json')
const indexPackageManifestSource = gitIndexText('package.json')
const canonicalCandidateVersion = (() => {
  try {
    const parsed = JSON.parse(candidatePackageManifestSource)
    return typeof parsed.version === 'string' ? parsed.version : ''
  } catch {
    return ''
  }
})()
const canonicalCandidateTag = canonicalCandidateVersion ? `v${canonicalCandidateVersion}` : ''
const canonicalCandidateTagRef = canonicalCandidateTag
  ? `${canonicalCandidateTag}^{commit}`
  : ''
const taggedReleaseSource = canonicalCandidateTagRef
  ? gitRef(canonicalCandidateTagRef)
  : ''
const candidatePackageLockSource = gitTextAt(canonicalReleaseSource, 'package-lock.json')
const evidencePackageLockSource = gitTextAt(evidenceRepositoryHead, 'package-lock.json')
const pushedEvidencePackageLockSource = gitTextAt(pushedEvidenceRepositoryHead, 'package-lock.json')
const indexPackageLockSource = gitIndexText('package-lock.json')
const configuredMobilePackageInputs = mobileReleaseProvenanceGate
  .match(/RELEASE_INPUTS=\(\n([\s\S]*?)\n\)/)?.[1]
  ?.split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean) || []
const xcodeBuildNumbers = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)]
  .map((match) => Number(match[1]))
const canonicalBuildPattern = canonicalCandidateBuild
  ? new RegExp(`\\bbuild\\s+${canonicalCandidateBuild}\\b`, 'i')
  : /$a/
check(
  Boolean(canonicalReleaseSource) &&
    canonicalReleaseSource === taggedReleaseSource &&
    configuredMobilePackageInputs.join('\0') === MOBILE_PACKAGE_INPUT_PATHS.join('\0') &&
    candidateEvidenceGitLineageIsValid({
      root,
      candidateSource: canonicalReleaseSource,
      evidenceHead: evidenceRepositoryHead,
      pushedEvidenceHead: pushedEvidenceRepositoryHead,
      candidateTagRef: canonicalCandidateTagRef,
      releasePaths: MOBILE_RELEASE_LINEAGE_PATHS,
      descendantReleasePaths: MOBILE_DESCENDANT_RELEASE_LINEAGE_PATHS,
      worktreePaths: MOBILE_RELEASE_LINEAGE_PATHS,
    }) &&
    exactPackageManifestTransitionIsValid({
      candidateSource: candidatePackageManifestSource,
      evidenceSource: evidencePackageManifestSource,
      pushedSource: pushedPackageManifestSource,
      indexSource: indexPackageManifestSource,
      workingTreeSource: fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
      candidateSha256: CANDIDATE_PACKAGE_MANIFEST_SHA256,
      pushedSha256: PUSHED_PACKAGE_MANIFEST_SHA256,
    }) &&
    mobilePackageLockLineageIsValid({
      candidateSource: candidatePackageLockSource,
      evidenceSource: evidencePackageLockSource,
      pushedEvidenceSource: pushedEvidencePackageLockSource,
      indexSource: indexPackageLockSource,
      workingTreeSource: fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'),
    }) &&
    canonicalCandidateBuild > 0 &&
    xcodeBuildNumbers.length >= 2 &&
    xcodeBuildNumbers.every((buildNumber) => buildNumber === canonicalCandidateBuild) &&
    canonicalBuildPattern.test(currentMobileSourceBoundary) &&
    authoritySemanticFailures('current mobile source boundary', currentMobileSourceBoundary).length === 0 &&
    currentMobileSourceBoundary.includes(canonicalReleaseSource) &&
    currentMobileSourceBoundary.includes(`clean pushed tag \`${canonicalCandidateTag}\` at \`${canonicalReleaseSource}\``) &&
    releaseSourceBoundary.includes(`pushed evidence tip is \`${evidenceRepositoryHead}\``) &&
    currentMobileSourceBoundary.includes('payload/source binding') &&
    currentMobileSourceBoundary.includes('Uploaded package is processing') &&
    canonicalBuildPattern.test(latestUploadedArtifactBoundary) &&
    authoritySemanticFailures('uploaded artifact', latestUploadedArtifactBoundary).length === 0 &&
    latestUploadedArtifactBoundary.includes('processing/selectability and listing attachment remain unproved') &&
    latestUploadedArtifactBoundary.includes(`immutable tagged release source \`${canonicalReleaseSource}\` and Xcode build number \`${canonicalCandidateBuild}\``) &&
    latestUploadedArtifactBoundary.includes(`pushed evidence tip is \`${evidenceRepositoryHead}\``) &&
    latestUploadedArtifactBoundary.includes('Later pushed repository commits are permitted only by the exact pinned package-manifest transition while every other provenance-guarded input remains byte-identical to the evidence tip') &&
    latestUploadedArtifactBoundary.includes('upload receipt says only that the package is processing') &&
    latestUploadedArtifactBoundary.includes('must not be attached, selected, or submitted without a fresh approval after a real processing/selectability receipt') &&
    latestUploadedArtifactBoundary.includes('No later candidate is required for source parity') &&
    !latestUploadedArtifactBoundary.includes('current eligible App Store submission candidate') &&
    releaseSourceBoundary.includes('archive payload exactly matches the clean committed iOS public payload') &&
    releaseSourceBoundary.includes('upload receipt records success with no errors') &&
    releaseSourceBoundary.includes('Uploaded package is processing') &&
    releaseSourceBoundary.includes('processing completion, selectability, and listing attachment remain unproven'),
  'Release records bind the uploaded Apple build to its immutable source while the pushed evidence tip preserves release inputs',
)

check(metadata.app.name.length <= 30, 'App name fits both stores')
check(metadata.apple.subtitle.length <= 30, 'Apple subtitle is 30 characters or fewer')
check(metadata.apple.promotionalText.length <= 170, 'Apple promotional text is 170 characters or fewer')
check(metadata.apple.keywords.length <= 100, 'Apple keywords are 100 characters or fewer')
check(metadata.apple.description.length <= 4000, 'Apple description is 4,000 characters or fewer')
check(metadata.google.shortDescription.length <= 80, 'Google short description is 80 characters or fewer')
check(metadata.google.fullDescription.length <= 4000, 'Google full description is 4,000 characters or fewer')
for (const result of mobileVersionContract({
  desktopVersion: packageJson.version,
  desktopLockVersion: packageLock.version,
  desktopLockRootVersion: packageLock.packages?.['']?.version,
  storeVersion: metadata.app.version,
  serverVersion: serverPackageJson.version,
  serverLockVersion: serverPackageLock.version,
  serverLockRootVersion: serverPackageLock.packages?.['']?.version,
  xcodeReleaseSettings: xcodeRelease,
  androidBuild,
})) check(result.ok, result.message)

check(catalog.bundleId === metadata.app.bundleId, 'Apple catalog bundle ID matches metadata')
check(catalog.androidPackage === metadata.app.bundleId, 'Android catalog package matches metadata')
check(xcodeRelease.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${metadata.app.bundleId};`), 'Xcode Release bundle ID matches metadata')
check(androidBuild.includes(`applicationId "${metadata.app.bundleId}"`), 'Android application ID matches metadata')
check(/CURRENT_PROJECT_VERSION = [1-9][0-9]*;/.test(xcodeRelease), 'Apple Release build number is positive')
check(/versionCode [1-9][0-9]*/.test(androidBuild), 'Android version code is positive')
check(/compileSdkVersion = 36/.test(androidVariables), 'Android compiles with API 36')
check(/targetSdkVersion = 36/.test(androidVariables), 'Android targets API 36')
check(
  androidUploadSigningRecordsAreCanonical({
    externalArtifacts,
    gitignore,
    releaseChecklist,
    releaseLedger,
    androidBuild,
    propertiesPresent: exists(ANDROID_UPLOAD_PROPERTIES_PATH),
    defaultJksPresent: exists(ANDROID_UPLOAD_JKS_PATH),
    defaultKeystorePresent: exists(ANDROID_UPLOAD_KEYSTORE_PATH),
    privateKeyCandidatePresent: fs.readdirSync(path.join(root, 'android'), { withFileTypes: true })
      .some((entry) => entry.isFile() && /\.(?:jks|keystore)$/i.test(entry.name)),
    environmentNamesPresent: Object.fromEntries(
      ANDROID_UPLOAD_ENV_NAMES.map((name) => [name, Object.prototype.hasOwnProperty.call(process.env, name)]),
    ),
    propertiesIgnored: gitIgnores(ANDROID_UPLOAD_PROPERTIES_PATH),
    jksIgnored: gitIgnores(ANDROID_UPLOAD_JKS_PATH),
    keystoreIgnored: gitIgnores(ANDROID_UPLOAD_KEYSTORE_PATH),
    propertiesTracked: gitTracks(ANDROID_UPLOAD_PROPERTIES_PATH),
    jksTracked: gitTracks(ANDROID_UPLOAD_JKS_PATH),
    keystoreTracked: gitTracks(ANDROID_UPLOAD_KEYSTORE_PATH),
  }),
  'Android upload identity remains unconfigured, unbacked, and fail-closed without reading credential values',
)
check(gitignore.includes('android/*.jks') && gitignore.includes('android/*.keystore'), 'Android private signing keys are ignored by Git')
check(
  theologyExternalArtifactIsCanonical({
    externalArtifacts,
    databaseEvidence: binaryEvidence(THEOLOGY_DATABASE_PATH),
    rightsNotice: theologyRightsNotice,
    bundleManifest: theologyBundleManifest,
    gitignore,
    dockerignore,
    railwayignore,
    dockerfile: serverDockerfile,
    releaseChecklist,
    releaseLedger,
    databaseIgnored: gitIgnores(THEOLOGY_DATABASE_PATH),
    databaseTracked: gitTracks(THEOLOGY_DATABASE_PATH),
  }),
  'Theology external artifact matches its canonical identity, rights, deploy, and unverified-backup records',
)
check(
  desktopLicenseSigningRecordsAreCanonical({
    externalArtifacts,
    gitignore,
    railwayignore,
    releaseChecklist,
    releaseLedger,
    privateKeyIgnored: gitIgnores(DESKTOP_LICENSE_PRIVATE_REPO_PATH),
    publicKeyIgnored: gitIgnores(DESKTOP_LICENSE_PUBLIC_REPO_PATH),
    privateKeyTracked: gitTracks(DESKTOP_LICENSE_PRIVATE_REPO_PATH),
    publicKeyTracked: gitTracks(DESKTOP_LICENSE_PUBLIC_REPO_PATH),
  }),
  'Desktop license-signing backup remains explicitly unverified and secret paths stay excluded',
)

check(exists('ios/App/App/PrivacyInfo.xcprivacy'), 'Apple privacy manifest exists')
check(privacyManifest.includes('NSPrivacyCollectedDataTypeOtherDiagnosticData'), 'Apple privacy manifest matches declared linked diagnostics')
check(androidManifest.includes('android.permission.RECORD_AUDIO'), 'Android microphone permission is declared')
check(androidManifest.includes('android:allowBackup="false"'), 'Android app backups are disabled')
for (const broadPermission of ['READ_CONTACTS', 'ACCESS_FINE_LOCATION', 'READ_MEDIA_IMAGES', 'AD_ID']) {
  check(!androidManifest.includes(broadPermission), `Android does not request ${broadPermission}`)
}

check(
  /^const MOBILE_ESV_LICENSED = MOBILE_FULL_RELEASE && import\.meta\.env\.VITE_ESV_MOBILE_LICENSED === ['"]true['"]$/m.test(mobileApp) &&
    /\.\.\.\(MOBILE_ESV_LICENSED \? \[\{ id: ['"]esv['"], label: ['"]ESV['"] \}\] : \[\]\)/.test(mobileApp) &&
    /\{MOBILE_ESV_LICENSED && <div className=['"]mobile-account-card['"]>/.test(mobileApp) &&
    mobileApp.match(/\bMOBILE_ESV_LICENSED\b/g)?.length === 3 &&
    mobileApp.match(/label: ['"]ESV['"]/g)?.length === 1,
  'ESV remains behind the explicit mobile license gate and only reaches gated UI call sites',
)
check(!terms.includes("ESV text requires the user's own authorized ESV API key"), 'Terms do not promise the unlicensed ESV-key path')
check(!privacy.includes('<strong>ESV API key:</strong>'), 'Privacy notice matches the initial no-ESV store build')
check(privacy.includes("Anthropic's API") && privacy.includes('asks for permission'), 'Privacy notice discloses third-party AI processing and permission')
check(
  privacy.includes('keyed one-way hash of the registration request IP address') &&
    privacy.includes('for no more than 48 hours') &&
    privacy.includes('the raw IP address is not stored'),
  'Public privacy notice discloses registration IP hashing and the 48-hour retention boundary',
)
check(serverIndex.includes("app.post('/v1/sermon-assist'") && serverIndex.includes('engine.runSermonAssist'), 'Visible tablet specialist agents have a server route')
check(mobileApp.includes('releaseStatus.capabilities.account_recovery_email'), 'Mobile registration follows the live recovery-email capability')
check(mobileRoutes.includes("app.post('/v1/mobile/register/confirm'") && accountRegistration.includes('confirmRegistrationCode'), 'New accounts require a verified email code before bearer issuance')
check(mobileApi.includes("'/v1/mobile/register/confirm'") && mobileApp.includes('VERIFY AND CREATE ACCOUNT'), 'The mobile client completes verified registration instead of treating code delivery as sign-in')
check(mobileApp.includes('&& !accountServiceUnavailable'), 'The included anonymous study remains usable during an account-service outage')
check(mobileApi.includes('GUIDED_STUDY_TIMEOUT_MS = 300_000'), 'Guided Study allows the server retry path to finish')
check(mobileApi.includes('aiConsentVersion: AI_PROCESSING_CONSENT_VERSION'), 'Generated mobile requests carry the current AI-consent version')
check(mobileApi.includes("surface: 'quick-study' | 'guided-study' | 'ask' | 'specialist'"), 'Every generated mobile surface can report unsafe AI output')
check(quickStudyDocument.includes('mobile-passage-word') && quickStudyDocument.includes('whyItMatters'), 'Verified passage terms open text-grounded word studies')
check(manuscriptEditor.includes("application/rtf") && manuscriptEditor.includes('EXPORT RTF'), 'Manuscript export produces an honestly labeled RTF file')
check(!manuscriptEditor.includes("application/msword"), 'Manuscript export does not disguise HTML as a Word document')
check(tabletDeskModel.includes('value.slice(-160).reverse()') && tabletDeskModel.includes('return strokes.reverse()'), 'Pencil limits preserve the newest writing')
check(tabletDesk.includes('THIS PAGE IS FULL') && tabletDesk.includes('NOTHING WAS DELETED'), 'Pencil capacity fails visibly instead of silently dropping older writing')
check(mobileAccount.includes('WHERE account_id IS NULL AND install_id = $2'), 'Account creation claims prior anonymous server studies')
check(mobileRoutes.includes('await claimAnonymousInstallData(client, accountId, installId)'), 'Device linking claims prior anonymous server studies')
check(mobileAccount.includes('DELETE FROM feedback') && mobileAccount.includes('DELETE FROM anon_install') && mobileAccount.includes('SET account_id = NULL, install_id = NULL'), 'Explicit account deletion removes readable account and install records')
check(recordings.includes('moveSermonRecordings') && mobileApp.includes('moveSermonRecordings(installOwnerKey, nextOwnerKey)'), 'Account linking keeps local sermon recordings visible to their owner')
check(localStudies.includes('workspaceDirty') && localStudies.includes('notesDirty') && mobileApp.includes('localChanged'), 'Cloud refreshes cannot overwrite dirty local notes or sermon-desk work')
check(!/if \(reachedServer && state\?\.anonymous\)[\s\S]{0,500}deleteLocalStudies/.test(mobileApp), 'A revoked device token hides account work instead of deleting its local studies')
check(/await signOutDevice\(\)[\s\S]{0,240}clearActiveReading\(\)/.test(mobileApp), 'Sign-out clears former account content from the active reading surface')
check(
  serverAuth.includes('installId: null')
    // Quick and Guided ownership SQL moved verbatim with their route bodies.
    && generationRoutes.match(/account_id IS NULL AND install_id = \$3/g)?.length === 2
    && studyAiAccess.match(/account_id IS NULL AND install_id = \$3/g)?.length === 1
    && serverIndex.match(/resolveOwnedStudyDocument\(db,/g)?.length === 2
    && studyCommentary.match(/resolveOwnedStudyDocument\(db,/g)?.length === 1
    && studyCommentary.includes("surface: 'commentary'"),
  'Revoked bearers cannot reuse a caller-controlled install ID to read claimed studies',
)
check(
  serverIndex.includes("releaseStage() !== 'full'")
    // Declaration + Ask + sermon-assist stay in index; Quick + Guided moved.
    && (serverIndex.match(/requireGeneratedStudyAccount\(req, res\)/g) || []).length === 3
    && (generationRoutes.match(/requireGeneratedStudyAccount\(req, res\)/g) || []).length === 2,
  'The full store backend requires a verified account before generated spend',
)
check(accountRecovery.includes('account_recovery_request') && serverSchema.includes('CREATE TABLE IF NOT EXISTS account_recovery_request'), 'Known and unknown recovery emails share the same persistent cooldown ledger')
check(accountRegistration.includes('SET account_id = $2') && mobileAccount.includes('DELETE FROM account_registration_code'), 'Registration metadata is account-bound and removed during explicit deletion')
check(mobileApp.includes('useCloudWorkspace') && mobileApp.includes('keepLocalWorkspace') && tabletDesk.includes('USE CLOUD') && tabletDesk.includes('KEEP THIS TABLET'), 'Sermon-desk conflicts have explicit cloud and local resolution paths')
check(
  !/(?:THIS IPAD|This iPad|The iPad|iPad Settings|APPLE PENCIL)/.test(mobileSource),
  'Shared tablet UI contains no Android-visible iPad or Apple Pencil wording',
)
const microphoneUsageDescription = iosInfoPlist.match(
  /<key>NSMicrophoneUsageDescription<\/key>\s*<string>([^<]*)<\/string>/,
)?.[1] || ''
check(
  microphoneUsageDescription.length > 0 && !/\biPad\b|Apple Pencil/i.test(microphoneUsageDescription),
  'Apple microphone permission copy is device-neutral for iPhone and iPad',
)
check(
  !/\biPad\b|Apple Pencil/i.test(JSON.stringify(metadata.google)),
  'Google Play metadata contains no Apple-only device wording',
)
const mobileBundleDigest = directoryDigest('dist-mobile')
const capacitorGeneratedBundleFiles = new Set(['cordova.js', 'cordova_plugins.js'])
const preservedBuild6IpaRuntimeTree = iosIpaRuntimeTreeEvidence({
  ipaPath: BUILD_6_IPA_EVIDENCE_PATH,
  ignoredRootFiles: [...capacitorGeneratedBundleFiles],
})
const packagedMobileBuiltAt = fs.statSync(path.join(root, 'dist-mobile/index.html')).mtimeMs
const newestMobileSourceAt = fs.readdirSync(path.join(root, 'src/mobile'), { withFileTypes: true, recursive: true })
  .filter((entry) => entry.isFile() && /\.(?:[cm]?[jt]sx?|css)$/.test(entry.name))
  .reduce((latest, entry) => Math.max(latest, fs.statSync(path.join(entry.parentPath, entry.name)).mtimeMs), 0)
check(
  newestMobileSourceAt <= packagedMobileBuiltAt,
  'Packaged mobile bundle is not older than any mobile source file',
)
const packagedMobileSource = fs.readdirSync(path.join(root, 'dist-mobile'), { withFileTypes: true, recursive: true })
  .filter((entry) => entry.isFile() && /\.(?:js|html)$/.test(entry.name))
  .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
  .join('\n')
check(
  ['SUBSCRIBE IN APP', 'RESTORE PURCHASES', 'You will not be sent to a website checkout', 'Confirming your ']
    .every((copy) => packagedMobileSource.includes(copy)),
  'Packaged mobile bundle contains the full native subscription surface',
)
check(
  packagedCandidateTreeDigestsAreValid({
    expectedDigest: BUILD_6_RUNTIME_TREE_DIGEST,
    distDigest: mobileBundleDigest,
    androidDigest: directoryDigest('android/app/src/main/assets/public', capacitorGeneratedBundleFiles),
    iosDigest: directoryDigest('ios/App/App/public', capacitorGeneratedBundleFiles),
  }) &&
    preservedBuild6IpaRuntimeTree?.archiveSize === BUILD_6_IPA_SIZE &&
    preservedBuild6IpaRuntimeTree?.archiveSha256 === BUILD_6_IPA_SHA256 &&
    preservedBuild6IpaRuntimeTree?.totalPublicFileCount === 25 &&
    preservedBuild6IpaRuntimeTree?.runtimeFileCount === 23 &&
    preservedBuild6IpaRuntimeTree?.runtimeDigest === BUILD_6_RUNTIME_TREE_DIGEST,
  'Android and iOS package the current mobile production bundle byte-for-byte',
)
check(tabletDeskModel.includes('MAX_TABLET_DESK_NODES = 32') && tabletDesk.includes('DESK FULL') && tabletDesk.includes('NOTHING WAS DELETED'), 'The Infinite Desk refuses excess tiles visibly instead of dropping them')
check(mobileApi.includes('MAX_STUDY_NOTES_CHARS = 20_000') && mobileApp.includes('maxLength={MAX_STUDY_NOTES_CHARS}') && mobileRoutes.includes('normalizeStudyNotes'), 'Field-note limits match across client and server without silent truncation')
check(mobileApp.includes('archiveConfirmId') && mobileApp.includes('restoreStudy') && mobileApp.includes("showArchived ? 'HIDE' : 'SHOW'"), 'Archiving requires confirmation and exposes undo and restore controls')
check(generationRoutes.includes('passage: existing.rows[0].passage') && localStudies.includes('syncedPassage?.verses'), 'Cross-device studies preserve verse divisions and copyright when reopening')
check(!mobileApp.includes('IN-APP CHECKOUT IS WIRED, NOT LIVE IN THIS DEVELOPMENT BUILD'), 'Submitted UI contains no development-build checkout message')
check(readiness.includes('configurationChecks(env, CORE_CONFIGURATION)'), 'Optional providers degrade independently instead of taking down every store')
check(!mobileApp.includes("await openExternal(await createBillingPortal())\n      } else") || mobileApp.includes('if (nativePlatform) throw new Error'), 'Native builds do not route digital subscription management into Stripe checkout')
check(mobileApp.includes('You will not be sent to a website checkout') && mobileApp.includes('SUBSCRIBE IN APP'), 'Native subscription UI promises and presents an in-app store purchase path')
check(
  /Confirming your \$\{[\s\S]{0,140}?android[\s\S]{0,60}?Google Play[\s\S]{0,40}?App Store[\s\S]{0,20}?\}\s*purchase/.test(mobileApp),
  'Purchase confirmation names the active native store',
)
check(mobileStore.includes('NativePurchases.purchaseProduct') && mobileStore.includes('appAccountToken: accountId'), 'App Store and Google Play purchases stay native and bind to the verified Operator account')
check(exists('website/operator-account-deletion.html'), 'Account-deletion web source exists')
check(mobileApp.includes("const DELETE_INFO_URL = 'https://www.base1520.com/operator/account-deletion/'"), 'App uses the declared account-deletion URL')

const appleIds = catalog.products.map((product) => product.appleProductId)
const googlePlans = catalog.products.map((product) => `${product.googleProductId}:${product.androidBasePlanId}`)
check(catalog.products.length === 6, 'Catalog contains six subscription options')
check(new Set(appleIds).size === appleIds.length, 'Apple product IDs are unique')
check(new Set(googlePlans).size === googlePlans.length, 'Google subscription/base-plan pairs are unique')
check(catalog.products.every((product) => product.googleProductId === 'com.base1520.theoperator.subscription'), 'Google plans share one subscription product')

const appleIcon = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
if (exists(appleIcon)) {
  const size = pngMetadata(appleIcon)
  check(size?.width === 1024 && size?.height === 1024, 'Apple marketing icon is 1024 × 1024')
  check(size?.bitDepth === 8 && size?.colorType === 2, 'Apple marketing icon is 24-bit RGB without alpha')
} else fail('Apple marketing icon exists')

const expectedStoreAssets = [
  ['store/assets/google-play-icon.png', 512, 512, 8, 6, '32-bit RGBA'],
  ['store/assets/google-play-feature.png', 1024, 500, 8, 2, '24-bit RGB'],
]
for (const [relative, width, height, bitDepth, colorType, encoding] of expectedStoreAssets) {
  if (!exists(relative)) {
    warn(`Missing ${relative} (${width} × ${height})`)
    continue
  }
  const size = pngMetadata(relative)
  check(size?.width === width && size?.height === height, `${relative} is ${width} × ${height}`)
  check(size?.bitDepth === bitDepth && size?.colorType === colorType, `${relative} is ${encoding}`)
}

const stagedScreenshotPaths = { apple: [], android: [] }
for (const { label, directory, dimensions, minCount, maxCount, ios } of STORE_SCREENSHOT_SETS) {
  if (!exists(directory)) {
    fail(`${label} screenshot directory exists`)
    continue
  }

  const visibleEntries = fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name))
  const images = visibleEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
  stagedScreenshotPaths[ios ? 'apple' : 'android'].push(
    ...images.map((name) => path.posix.join(directory, name)),
  )

  check(
    visibleEntries.every((entry) => entry.isFile())
      && images.length >= minCount
      && images.length <= maxCount,
    `${label} screenshot entries are regular files and count is ${images.length} (${minCount}-${maxCount} required)`,
  )

  for (const name of images) {
    const relative = path.join(directory, name)
    const image = pngMetadata(relative)
    check(Boolean(image), `${relative} is a valid PNG`)
    if (!image) continue
    const acceptedDimensions = formatScreenshotDimensions(dimensions)
    check(
      screenshotDimensionsMatch(image, dimensions),
      `${relative} is exactly ${acceptedDimensions}`,
    )
    check(image.bitDepth === 8, `${relative} uses 8-bit PNG samples`)
    check(image.colorType === 2, `${relative} uses 24-bit RGB PNG color type 2`)
    if (ios) check(!image.hasAlpha, `${relative} contains no alpha channel or transparency chunk`)
  }
}

check(
  !hasAppleScreenshotSubmissionHold(screenshotPlan)
    && appleScreenshotReceiptIsValid(appleScreenshotReceipt, {
      actualScreenshots: stagedScreenshotPaths.apple.map((relative) => ({
        path: relative,
        sha256: binaryEvidence(relative).sha256,
      })),
      expectedSourceCommit: canonicalReleaseSource,
      expectedBuildIdentity: candidateAppleBuildIdentity,
      receiptGitCustody: appleScreenshotReceiptGitCustody,
    }),
  'Apple screenshot set has no unresolved visual submission hold',
)
check(
  appleScreenshotProvenanceIsConsistent(screenshotPlan, releaseChecklist),
  'Apple screenshot hold matches the canonical build-provenance state',
)
check(
  !hasAndroidScreenshotCreativeHold(screenshotPlan)
    && androidScreenshotProvenanceIsConsistent(screenshotPlan, releaseLedger)
    && androidScreenshotReceiptIsValid(androidScreenshotReceipt, {
      actualScreenshots: stagedScreenshotPaths.android.map((relative) => ({
        path: relative,
        sha256: binaryEvidence(relative).sha256,
      })),
      expectedSourceCommit: canonicalReleaseSource,
      expectedBuildIdentity: candidateAndroidBuildIdentity,
      receiptGitCustody: androidScreenshotReceiptGitCustody,
    }),
  'Android screenshot set has no unresolved visual submission hold',
)
check(!/^> PRICE HOLD:/m.test(productPlan), 'Store subscription prices have Cole approval')

for (const relative of [
  'store/README.md',
  'store/products.md',
  'store/privacy-data.md',
  'store/review-notes.md',
  'store/screenshots.md',
  'store/release-checklist.md',
  'store/release-ledger.md',
  'store/ExportOptions.plist',
  'scripts/check-mobile-store-live.mjs',
]) check(exists(relative), `${relative} exists`)

warn('Static checks do not prove production readiness; run npm run mobile:store:check:live before review')

console.log(`\nThe Operator mobile store readiness\n${'='.repeat(37)}`)
for (const message of passes) console.log(`PASS  ${message}`)
for (const message of warnings) console.log(`WARN  ${message}`)
for (const message of failures) console.log(`FAIL  ${message}`)
console.log(`\n${passes.length} passed · ${warnings.length} warnings · ${failures.length} failed`)

if (failures.length) process.exitCode = 1
