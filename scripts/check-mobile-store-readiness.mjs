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
  appleScreenshotProvenanceIsConsistent,
  hasAppleScreenshotSubmissionHold,
  screenshotDimensionsMatch,
  STORE_SCREENSHOT_SETS,
} from './screenshot-provenance.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
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
const screenshotPlan = read('store/screenshots.md')
const releaseChecklist = read('store/release-checklist.md')
const releaseLedger = read('store/release-ledger.md')
const productPlan = read('store/products.md')
const consoleActionPacket = read('store/console-action-packet.md')
const appleConsoleCompletionPacket = read('store/apple-console-completion-packet.md')
const reviewNotes = read('store/review-notes.md')

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
    consoleActionPacket.includes('**Only FIVE are purchasable on iOS.**'),
  'Console transcription packet matches canonical store prices, allowances, periods, and iOS scope',
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
check(
  appleReviewNotesRow.includes('store/review-notes.md') &&
    appleReviewNotesRow.includes('device-link code') &&
    !/\b(?:access|comp) code\b/i.test(appleReviewNotesRow),
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
const currentGoogleLiveBoundary = releaseChecklist
  .split(/\r?\n/)
  .find((line) => line.includes('Fresh Google-scoped production measurement')) || ''
const currentGoogleLedgerPreflight = releaseLedger
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Live production preflight |')) || ''
const googlePurchaseVerificationRow = releaseLedger
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Google production purchase verification |')) || ''
const currentGoogleLiveCounts = parseStoreGateCounts(currentGoogleLiveBoundary, 'Google')
const ledgerGoogleLiveCounts = parseStoreGateCounts(currentGoogleLedgerPreflight, 'Google')
const googleVerificationCounts = parseStoreGateCounts(googlePurchaseVerificationRow, 'Google')
const currentGoogleLiveStamp = currentGoogleLiveBoundary
  .match(/at \*\*([^*]+)\*\* returns/)?.[1] || ''
const currentGoogleLiveFailure = currentGoogleLiveBoundary
  .match(/solely `([^`]+)`/)?.[1] || ''
check(
  currentGoogleLiveCounts.length === 3 &&
    currentGoogleLiveCounts.every((count, index) => count === ledgerGoogleLiveCounts[index]) &&
    currentGoogleLiveCounts.every((count, index) => count === googleVerificationCounts[index]) &&
    Boolean(currentGoogleLiveStamp) &&
    googlePurchaseVerificationRow.includes(`on ${currentGoogleLiveStamp}`) &&
    Boolean(currentGoogleLiveFailure) &&
    googlePurchaseVerificationRow.includes(`solely \`${currentGoogleLiveFailure}\``) &&
    !/privacy(?:-disclosure)? failures|plus all three named public privacy/i.test(googlePurchaseVerificationRow),
  'Release records agree Google live preflight is blocked only on purchase verification',
)

const nativePackageArtifactParityRow = releaseLedger
  .split(/\r?\n/)
  .find((line) => line.startsWith('| Native package artifact parity |')) || ''
check(
  nativePackageArtifactParityRow.includes('PASS FOR BUILD-5 BYTES / CURRENT WORKING SOURCE NEWER') &&
    nativePackageArtifactParityRow.includes('Build 5 does not contain the local next-build PREACH affordance fix') &&
    nativePackageArtifactParityRow.includes('package-age assertion is intentionally red') &&
    nativePackageArtifactParityRow.includes('screenshot hold remains separately red') &&
    !/static gate is red only because|only failure is[^|]*screenshot/i.test(nativePackageArtifactParityRow),
  'Release ledger separates build-5 artifact parity from newer working source',
)

const currentStaticGateBoundary = releaseChecklist
  .split(/\r?\n/)
  .find((line) => line.startsWith('- [ ] 🔴 **`npm run mobile:store:check`')) || ''
check(
  currentStaticGateBoundary.includes(
    'complete three-slot iPad set is staged after one remaining clean active-Preach capture',
  ) &&
    currentStaticGateBoundary.includes(
      'two clean build-5 landscape slots are locally ready and one active-Preach original remains missing',
    ) &&
    !currentStaticGateBoundary.includes('three remaining iPad screenshots'),
  'Release checklist preserves the one-capture iPad screenshot completion boundary',
)

const externalReleaseGates = releaseLedger
  .split('## External release gates\n')[1]?.split('\n## ')[0] || ''
const signingEvidence = releaseLedger
  .split('## Signing evidence still required\n')[1]?.split('\n## ')[0] || ''
check(
  externalReleaseGates.includes('Build `1.4.2 (5)`') &&
    externalReleaseGates.includes('Build 4 must not be attached or selected for final submission') &&
    externalReleaseGates.includes('build-5 captures') &&
    signingEvidence.includes('processing/selectability and listing-selection receipts for build 5') &&
    signingEvidence.includes('The build-5 upload receipt is present') &&
    signingEvidence.includes('build 4 is historical upload evidence only') &&
    !/\b(?:attach|select)[^\n]*\bbuild(?: |-)?4\b/i.test(externalReleaseGates) &&
    !/listing-selection receipt for build 4/i.test(signingEvidence),
  'Release ledger forward actions preserve the build-5 candidate boundary',
)

const historicalBuild4ProcessingBoundary = releaseChecklist
  .split(/\r?\n/)
  .find((line) => line.includes('Processing/selectability remains unverified.')) || ''
check(
  historicalBuild4ProcessingBoundary.includes('Build 5 upload is accepted') &&
    historicalBuild4ProcessingBoundary.includes('Build 4 remains upload history only') &&
    historicalBuild4ProcessingBoundary.includes('must not be selected or submitted') &&
    historicalBuild4ProcessingBoundary.includes('attach/select build 5 under fresh action-time approval') &&
    !/wait for (?:provenance-clean )?build 5 to appear/i.test(historicalBuild4ProcessingBoundary) &&
    !/until build 4 appears/i.test(historicalBuild4ProcessingBoundary) &&
    !/listing is explicitly switched/i.test(historicalBuild4ProcessingBoundary),
  'Release checklist keeps historical build 4 out of the final selection path',
)

const currentMobileSourceBoundary = releaseChecklist
  .split(/\r?\n/)
  .find((line) => line.includes('The uploaded build contains the current mobile source')) || ''
const currentCandidateBoundary = releaseLedger
  .split(/\r?\n/)
  .find((line) => line.startsWith('**The current uploaded App Store candidate artifact is build')) || ''
const releaseSourceBoundary = releaseChecklist
  .split(/\r?\n/)
  .find((line) => line.includes('Mobile-source lineage, verified')) || ''
const canonicalReleaseSource = releaseSourceBoundary
  .match(/canonical release source is `([0-9a-f]{40})`/)?.[1] || ''
const canonicalCandidateBuild = Number(
  releaseSourceBoundary.match(/candidate build number is `(\d+)`/)?.[1] || 0,
)
const xcodeBuildNumbers = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)]
  .map((match) => Number(match[1]))
const canonicalBuildPattern = canonicalCandidateBuild
  ? new RegExp(`\\bbuild\\s+${canonicalCandidateBuild}\\b`, 'i')
  : /$a/
check(
  Boolean(canonicalReleaseSource) &&
    canonicalReleaseSource === gitRef('HEAD') &&
    canonicalReleaseSource === gitRef('origin/main') &&
    canonicalCandidateBuild > 0 &&
    xcodeBuildNumbers.length >= 2 &&
    xcodeBuildNumbers.every((buildNumber) => buildNumber === canonicalCandidateBuild) &&
    canonicalBuildPattern.test(currentMobileSourceBoundary) &&
    currentMobileSourceBoundary.includes('canonical mobile-source lineage row') &&
    canonicalBuildPattern.test(currentCandidateBoundary) &&
    currentCandidateBoundary.includes('canonical mobile-source lineage row') &&
    currentCandidateBoundary.includes('processing/selectability remains unverified') &&
    releaseSourceBoundary.includes('archive payload exactly matches the clean committed iOS public payload') &&
    releaseSourceBoundary.includes('upload receipt records success with no errors') &&
    releaseSourceBoundary.includes('processing completion remains unproven'),
  'Release records bind the uploaded Apple build to current pushed source and Xcode build number',
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
check(gitignore.includes('android/operator-upload.properties'), 'Android upload credentials are ignored by Git')
check(gitignore.includes('android/*.jks') && gitignore.includes('android/*.keystore'), 'Android private signing keys are ignored by Git')
check(!/^resources\/?$/m.test(dockerignore) && !/^resources\/?$/m.test(railwayignore), 'Production deploy archives include the theology-retrieval bundle required by the Dockerfile')
check(
  ['.env', '.env.*', '.operator-license-key', '*-license-key', 'electron/embedded-key.js']
    .every((pattern) => railwayignore.split(/\r?\n/).includes(pattern)),
  'Railway no-gitignore deploys still exclude environment and license-signing secrets',
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
    && serverIndex.match(/account_id IS NULL AND install_id = \$3/g)?.length === 2
    && studyAiAccess.match(/account_id IS NULL AND install_id = \$3/g)?.length === 1
    && serverIndex.match(/resolveOwnedStudyDocument\(db,/g)?.length === 2
    && studyCommentary.match(/resolveOwnedStudyDocument\(db,/g)?.length === 1
    && studyCommentary.includes("surface: 'commentary'"),
  'Revoked bearers cannot reuse a caller-controlled install ID to read claimed studies',
)
check(serverIndex.includes("releaseStage() !== 'full'") && serverIndex.match(/requireGeneratedStudyAccount\(req, res\)/g)?.length === 5, 'The full store backend requires a verified account before generated spend')
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
  directoryDigest('android/app/src/main/assets/public', capacitorGeneratedBundleFiles) === mobileBundleDigest &&
    directoryDigest('ios/App/App/public', capacitorGeneratedBundleFiles) === mobileBundleDigest,
  'Android and iOS package the current mobile production bundle byte-for-byte',
)
check(tabletDeskModel.includes('MAX_TABLET_DESK_NODES = 32') && tabletDesk.includes('DESK FULL') && tabletDesk.includes('NOTHING WAS DELETED'), 'The Infinite Desk refuses excess tiles visibly instead of dropping them')
check(mobileApi.includes('MAX_STUDY_NOTES_CHARS = 20_000') && mobileApp.includes('maxLength={MAX_STUDY_NOTES_CHARS}') && mobileRoutes.includes('normalizeStudyNotes'), 'Field-note limits match across client and server without silent truncation')
check(mobileApp.includes('archiveConfirmId') && mobileApp.includes('restoreStudy') && mobileApp.includes("showArchived ? 'HIDE' : 'SHOW'"), 'Archiving requires confirmation and exposes undo and restore controls')
check(serverIndex.includes('passage: existing.rows[0].passage') && localStudies.includes('syncedPassage?.verses'), 'Cross-device studies preserve verse divisions and copyright when reopening')
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

for (const { label, directory, dimensions, minCount, maxCount, ios } of STORE_SCREENSHOT_SETS) {
  if (!exists(directory)) {
    fail(`${label} screenshot directory exists`)
    continue
  }

  const images = fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()

  check(
    images.length >= minCount && images.length <= maxCount,
    `${label} screenshot count is ${images.length} (${minCount}-${maxCount} required)`,
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

check(!hasAppleScreenshotSubmissionHold(screenshotPlan), 'Apple screenshot set has no unresolved visual submission hold')
check(
  appleScreenshotProvenanceIsConsistent(screenshotPlan, releaseChecklist),
  'Apple screenshot hold matches the canonical build-provenance state',
)
if (/^> Android creative hold:/m.test(screenshotPlan)) warn('Android screenshots remain on a documented creative hold')
check(!/^> PRICE HOLD:/m.test(productPlan), 'Store subscription prices have Cole approval')

for (const relative of [
  'store/README.md',
  'store/products.md',
  'store/privacy-data.md',
  'store/review-notes.md',
  'store/apple-console-completion-packet.md',
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
