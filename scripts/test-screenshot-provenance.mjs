import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  APPLE_SCREENSHOT_PATHS,
  ANDROID_SCREENSHOT_PATHS,
  APPLE_IPAD_LANDSCAPE_DIMENSIONS,
  STORE_SCREENSHOT_SETS,
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
  screenshotReceiptGitCustodyIsValid,
  screenshotDimensionsMatch,
} from './screenshot-provenance.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const screenshotPlan = fs.readFileSync(path.join(root, 'store/screenshots.md'), 'utf8')
const appleScreenshotReceiptSource = fs.readFileSync(path.join(root, 'store/apple-screenshot-verification.json'), 'utf8')
const appleScreenshotReceipt = parseAppleScreenshotReceipt(appleScreenshotReceiptSource)
assert.ok(appleScreenshotReceipt)
const androidScreenshotReceiptSource = fs.readFileSync(path.join(root, 'store/android-screenshot-verification.json'), 'utf8')
const androidScreenshotReceipt = parseAndroidScreenshotReceipt(androidScreenshotReceiptSource)
assert.ok(androidScreenshotReceipt)
const releaseChecklist = fs.readFileSync(path.join(root, 'store/release-checklist.md'), 'utf8')
const releaseLedger = fs.readFileSync(path.join(root, 'store/release-ledger.md'), 'utf8')
const readinessSource = fs.readFileSync(path.join(root, 'scripts/check-mobile-store-readiness.mjs'), 'utf8')
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'store/metadata.json'), 'utf8'))
const pbxproj = fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')
const androidBuild = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8')
const expectedSourceCommit = releaseChecklist.match(
  /canonical release source for uploaded build \d+ is `([0-9a-f]{40})`/,
)?.[1] || ''
assert.match(expectedSourceCommit, /^[0-9a-f]{40}$/)
assert.equal(
  execFileSync('git', ['rev-parse', 'v1.4.5^{}'], { cwd: root, encoding: 'utf8' }).trim(),
  expectedSourceCommit,
)
const cleanReceiptGitCustody = (receiptPath) => Object.freeze({
  receiptPath,
  tracked: true,
  ignored: false,
  worktreeRegularFile: true,
  worktreeExecutable: false,
  parsedSourceSha256: 'c'.repeat(64),
  workingTreeSha256: 'c'.repeat(64),
  indexSha256: 'c'.repeat(64),
  committedSha256: 'c'.repeat(64),
  indexMode: '100644',
  committedMode: '100644',
})
const expectedAppleBuildIdentity = {
  bundleId: metadata.app.bundleId,
  marketingVersion: metadata.app.version,
  buildNumber: Number(pbxproj.match(/CURRENT_PROJECT_VERSION = ([1-9][0-9]*);/)?.[1] || 0),
}
const actualAppleScreenshots = APPLE_SCREENSHOT_PATHS.map((relative) => ({
  path: relative,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex'),
}))
const appleReceiptContext = {
  actualScreenshots: actualAppleScreenshots,
  expectedSourceCommit,
  expectedBuildIdentity: expectedAppleBuildIdentity,
  receiptGitCustody: cleanReceiptGitCustody('store/apple-screenshot-verification.json'),
  now: new Date('2026-08-16T18:00:00-05:00'),
}
const expectedBuildIdentity = {
  applicationId: metadata.app.bundleId,
  versionName: metadata.app.version,
  versionCode: Number(androidBuild.match(/\bversionCode\s+([1-9][0-9]*)/)?.[1] || 0),
}
const actualScreenshots = ANDROID_SCREENSHOT_PATHS.map((relative) => ({
  path: relative,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex'),
}))
const receiptContext = {
  actualScreenshots,
  expectedSourceCommit,
  expectedBuildIdentity,
  receiptGitCustody: cleanReceiptGitCustody('store/android-screenshot-verification.json'),
  now: new Date('2026-08-16T18:00:00-05:00'),
}
const clone = (value) => JSON.parse(JSON.stringify(value))
const verifiedReceipt = () => ({
  ...clone(androidScreenshotReceipt),
  status: 'verified',
  reviewedSourceCommit: expectedSourceCommit,
  buildIdentity: clone(expectedBuildIdentity),
  visualReview: {
    result: 'PASS',
    reviewedBy: 'Independent visual reviewer',
    reviewedAt: '2026-08-16T17:00:00-05:00',
  },
  screenshots: clone(actualScreenshots),
})
const verifiedAppleReceipt = () => ({
  ...clone(appleScreenshotReceipt),
  status: 'verified',
  reviewedSourceCommit: expectedSourceCommit,
  buildIdentity: clone(expectedAppleBuildIdentity),
  visualReview: {
    result: 'PASS',
    reviewedBy: 'Independent visual reviewer',
    reviewedAt: '2026-08-16T17:00:00-05:00',
  },
  screenshots: clone(actualAppleScreenshots),
})

function createReceiptCustodyFixture(mode) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-screenshot-receipt-custody-'))
  const git = (args) => execFileSync('git', args, {
    cwd: fixtureRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  const receiptPaths = [
    'store/apple-screenshot-verification.json',
    'store/android-screenshot-verification.json',
  ]

  fs.mkdirSync(path.join(fixtureRoot, 'store'), { recursive: true })
  git(['init', '--quiet'])
  git(['config', 'user.name', 'Receipt Custody Test'])
  git(['config', 'user.email', 'receipt-custody@example.invalid'])
  fs.writeFileSync(path.join(fixtureRoot, 'candidate.txt'), 'immutable candidate bytes\n')
  if (mode === 'ignored') {
    fs.writeFileSync(path.join(fixtureRoot, '.gitignore'), `${receiptPaths.join('\n')}\n`)
  }
  git(['add', '--', 'candidate.txt', ...(mode === 'ignored' ? ['.gitignore'] : [])])
  git(['commit', '--quiet', '-m', 'candidate source'])
  const candidateSourceCommit = git(['rev-parse', 'HEAD'])

  const appleReceipt = verifiedAppleReceipt()
  appleReceipt.reviewedSourceCommit = candidateSourceCommit
  const androidReceipt = verifiedReceipt()
  androidReceipt.reviewedSourceCommit = candidateSourceCommit
  const originalSources = {
    apple: `${JSON.stringify(appleReceipt, null, 2)}\n`,
    android: `${JSON.stringify(androidReceipt, null, 2)}\n`,
  }
  fs.writeFileSync(path.join(fixtureRoot, receiptPaths[0]), originalSources.apple)
  fs.writeFileSync(path.join(fixtureRoot, receiptPaths[1]), originalSources.android)

  if (mode !== 'untracked') {
    git(['add', ...(mode === 'ignored' ? ['--force'] : []), '--', ...receiptPaths])
    git(['commit', '--quiet', '-m', 'reviewed screenshot receipts'])
  }

  let parsedSources = { ...originalSources }
  if (mode === 'staged-only') {
    for (const [index, platform] of ['apple', 'android'].entries()) {
      fs.writeFileSync(path.join(fixtureRoot, receiptPaths[index]), `${originalSources[platform]} `)
    }
    git(['add', '--', ...receiptPaths])
    for (const [index, platform] of ['apple', 'android'].entries()) {
      fs.writeFileSync(path.join(fixtureRoot, receiptPaths[index]), originalSources[platform])
    }
  } else if (mode === 'dirty') {
    parsedSources = {
      apple: `${originalSources.apple} `,
      android: `${originalSources.android} `,
    }
    fs.writeFileSync(path.join(fixtureRoot, receiptPaths[0]), parsedSources.apple)
    fs.writeFileSync(path.join(fixtureRoot, receiptPaths[1]), parsedSources.android)
  } else if (mode === 'committed-byte-drift') {
    fs.writeFileSync(path.join(fixtureRoot, receiptPaths[0]), `${originalSources.apple}\n`)
    fs.writeFileSync(path.join(fixtureRoot, receiptPaths[1]), `${originalSources.android}\n`)
    git(['add', '--', ...receiptPaths])
    git(['commit', '--quiet', '-m', 'replace committed receipt bytes'])
  } else if (mode === 'mode-only') {
    fs.chmodSync(path.join(fixtureRoot, receiptPaths[0]), 0o755)
    fs.chmodSync(path.join(fixtureRoot, receiptPaths[1]), 0o755)
    git(['add', '--', ...receiptPaths])
  } else if (mode === 'symlink') {
    for (const relative of receiptPaths) {
      const absolute = path.join(fixtureRoot, relative)
      const target = `${absolute}.target`
      fs.renameSync(absolute, target)
      fs.symlinkSync(path.basename(target), absolute)
    }
  }

  return {
    candidateSourceCommit,
    evidenceHead: git(['rev-parse', 'HEAD']),
    appleReceipt: parseAppleScreenshotReceipt(parsedSources.apple),
    androidReceipt: parseAndroidScreenshotReceipt(parsedSources.android),
    appleCustody: screenshotReceiptGitCustody({
      root: fixtureRoot,
      receiptPath: receiptPaths[0],
      workingTreeSource: parsedSources.apple,
    }),
    androidCustody: screenshotReceiptGitCustody({
      root: fixtureRoot,
      receiptPath: receiptPaths[1],
      workingTreeSource: parsedSources.android,
    }),
  }
}

function createCandidateEvidenceLineageFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-candidate-evidence-lineage-'))
  const git = (args) => execFileSync('git', args, {
    cwd: fixtureRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  fs.mkdirSync(path.join(fixtureRoot, 'src'), { recursive: true })
  fs.mkdirSync(path.join(fixtureRoot, 'store'), { recursive: true })
  fs.mkdirSync(path.join(fixtureRoot, 'ios/App/App'), { recursive: true })
  fs.mkdirSync(path.join(fixtureRoot, 'android/app/src/main'), { recursive: true })
  git(['init', '--quiet'])
  git(['config', 'user.name', 'Candidate Evidence Test'])
  git(['config', 'user.email', 'candidate-evidence@example.invalid'])
  fs.writeFileSync(path.join(fixtureRoot, 'src/mobile-input.js'), 'export const candidate = true\n')
  fs.writeFileSync(path.join(fixtureRoot, 'ios/App/App/AppDelegate.swift'), 'let candidate = true\n')
  fs.writeFileSync(path.join(fixtureRoot, 'android/app/src/main/MainActivity.java'), 'final boolean candidate = true;\n')
  git(['add', '--', 'src/mobile-input.js', 'ios/App/App/AppDelegate.swift', 'android/app/src/main/MainActivity.java'])
  git(['commit', '--quiet', '-m', 'immutable candidate source'])
  git(['tag', 'candidate-v1'])
  const candidateSource = git(['rev-parse', 'HEAD'])
  fs.writeFileSync(path.join(fixtureRoot, 'store/evidence.json'), '{"verified":true}\n')
  git(['add', '--', 'store/evidence.json'])
  git(['commit', '--quiet', '-m', 'post-candidate evidence'])
  const evidenceHead = git(['rev-parse', 'HEAD'])
  git(['tag', 'evidence-tip'])
  return {
    root: fixtureRoot,
    git,
    candidateSource,
    evidenceHead,
    context: {
      root: fixtureRoot,
      candidateSource,
      evidenceHead,
      pushedEvidenceHead: evidenceHead,
      candidateTagRef: 'candidate-v1^{commit}',
      releasePaths: ['src', 'ios/App', 'android'],
      descendantReleasePaths: ['src', 'ios/App', 'android'],
      worktreePaths: ['src', 'ios/App', 'android'],
    },
  }
}

function assertDynamicScreenshotUniverse({
  validate,
  verified,
  context,
  actual,
  extraPath,
}) {
  const extra = { path: extraPath, sha256: 'a'.repeat(64) }
  const actualWithExtra = [...clone(actual), extra]
  const matchingReceipt = verified()
  matchingReceipt.screenshots = clone(actualWithExtra)
  assert.equal(validate(matchingReceipt, { ...context, actualScreenshots: actualWithExtra }), true)

  assert.equal(validate(verified(), { ...context, actualScreenshots: actualWithExtra }), false)

  const receiptOnlyExtra = verified()
  receiptOnlyExtra.screenshots.push(extra)
  assert.equal(validate(receiptOnlyExtra, context), false)

  for (const invalidPath of [`./${extraPath}`, `${extraPath.slice(0, extraPath.lastIndexOf('/'))}/../outside.png`]) {
    const aliasedActual = [...clone(actual), { path: invalidPath, sha256: extra.sha256 }]
    const aliasedReceipt = verified()
    aliasedReceipt.screenshots = clone(aliasedActual)
    assert.equal(validate(aliasedReceipt, { ...context, actualScreenshots: aliasedActual }), false)
  }
}

const tests = [
  {
    name: 'canonical Apple screenshot hold remains active until a build-6-proven iPad set is complete',
    run: () => assert.equal(hasAppleScreenshotSubmissionHold(screenshotPlan), true),
  },
  {
    name: 'canonical Apple receipt records the historical-pixel hold and cannot clear readiness',
    run: () => assert.equal(
      appleScreenshotReceiptIsValid(appleScreenshotReceipt, appleReceiptContext),
      false,
    ),
  },
  {
    name: 'a complete Apple source/build/byte-anchored visual-attestation PASS satisfies the receipt contract',
    run: () => assert.equal(
      appleScreenshotReceiptIsValid(verifiedAppleReceipt(), appleReceiptContext),
      true,
    ),
  },
  {
    name: 'clean committed Apple and Android receipts remain bound to the earlier immutable candidate source',
    run: () => {
      const fixture = createReceiptCustodyFixture('clean')
      assert.notEqual(fixture.evidenceHead, fixture.candidateSourceCommit)
      assert.equal(
        screenshotReceiptGitCustodyIsValid(
          fixture.appleCustody,
          'store/apple-screenshot-verification.json',
        ),
        true,
      )
      assert.equal(
        screenshotReceiptGitCustodyIsValid(
          fixture.androidCustody,
          'store/android-screenshot-verification.json',
        ),
        true,
      )
      assert.equal(appleScreenshotReceiptIsValid(fixture.appleReceipt, {
        ...appleReceiptContext,
        expectedSourceCommit: fixture.candidateSourceCommit,
        receiptGitCustody: fixture.appleCustody,
      }), true)
      assert.equal(androidScreenshotReceiptIsValid(fixture.androidReceipt, {
        ...receiptContext,
        expectedSourceCommit: fixture.candidateSourceCommit,
        receiptGitCustody: fixture.androidCustody,
      }), true)

      const wrongPathCustody = {
        ...fixture.appleCustody,
        receiptPath: 'store/android-screenshot-verification.json',
      }
      assert.equal(
        screenshotReceiptGitCustodyIsValid(
          wrongPathCustody,
          'store/apple-screenshot-verification.json',
        ),
        false,
      )
      assert.equal(appleScreenshotReceiptIsValid(fixture.appleReceipt, {
        ...appleReceiptContext,
        expectedSourceCommit: fixture.candidateSourceCommit,
        receiptGitCustody: wrongPathCustody,
      }), false)
    },
  },
  {
    name: 'Apple and Android receipts reject untracked, ignored, staged, dirty, byte-drifted, mode-drifted, or symlink custody',
    run: () => {
      for (const mode of [
        'untracked',
        'ignored',
        'staged-only',
        'dirty',
        'committed-byte-drift',
        'mode-only',
        'symlink',
      ]) {
        const fixture = createReceiptCustodyFixture(mode)
        assert.equal(
          screenshotReceiptGitCustodyIsValid(
            fixture.appleCustody,
            'store/apple-screenshot-verification.json',
          ),
          false,
          `Apple ${mode} custody must fail`,
        )
        assert.equal(
          screenshotReceiptGitCustodyIsValid(
            fixture.androidCustody,
            'store/android-screenshot-verification.json',
          ),
          false,
          `Android ${mode} custody must fail`,
        )
        assert.equal(appleScreenshotReceiptIsValid(fixture.appleReceipt, {
          ...appleReceiptContext,
          expectedSourceCommit: fixture.candidateSourceCommit,
          receiptGitCustody: fixture.appleCustody,
        }), false, `Apple ${mode} receipt must fail`)
        assert.equal(androidScreenshotReceiptIsValid(fixture.androidReceipt, {
          ...receiptContext,
          expectedSourceCommit: fixture.candidateSourceCommit,
          receiptGitCustody: fixture.androidCustody,
        }), false, `Android ${mode} receipt must fail`)
      }
    },
  },
  {
    name: 'clean committed Apple and Android receipts reject candidate-source drift',
    run: () => {
      const fixture = createReceiptCustodyFixture('clean')
      const wrongCandidateSource = '0'.repeat(40)
      assert.equal(appleScreenshotReceiptIsValid(fixture.appleReceipt, {
        ...appleReceiptContext,
        expectedSourceCommit: wrongCandidateSource,
        receiptGitCustody: fixture.appleCustody,
      }), false)
      assert.equal(androidScreenshotReceiptIsValid(fixture.androidReceipt, {
        ...receiptContext,
        expectedSourceCommit: wrongCandidateSource,
        receiptGitCustody: fixture.androidCustody,
      }), false)
    },
  },
  {
    name: 'candidate lineage pins an evidence tip, verifies later descendants, and rejects tag, path, or release-input drift',
    run: () => {
      const fixture = createCandidateEvidenceLineageFixture()
      assert.notEqual(fixture.candidateSource, fixture.evidenceHead)
      assert.equal(candidateEvidenceGitLineageIsValid(fixture.context), true)

      const laterPushedFixture = createCandidateEvidenceLineageFixture()
      fs.writeFileSync(path.join(laterPushedFixture.root, 'store/later-record.md'), 'later record\n')
      laterPushedFixture.git(['add', '--', 'store/later-record.md'])
      laterPushedFixture.git(['commit', '--quiet', '-m', 'later pushed record'])
      const laterPushedHead = laterPushedFixture.git(['rev-parse', 'HEAD'])
      assert.equal(candidateEvidenceGitLineageIsValid({
        ...laterPushedFixture.context,
        pushedEvidenceHead: laterPushedHead,
      }), true)

      const laterReleaseDriftFixture = createCandidateEvidenceLineageFixture()
      fs.writeFileSync(path.join(laterReleaseDriftFixture.root, 'src/mobile-input.js'), 'release drift\n')
      laterReleaseDriftFixture.git(['add', '--', 'src/mobile-input.js'])
      laterReleaseDriftFixture.git(['commit', '--quiet', '-m', 'later release drift'])
      assert.equal(candidateEvidenceGitLineageIsValid({
        ...laterReleaseDriftFixture.context,
        pushedEvidenceHead: laterReleaseDriftFixture.git(['rev-parse', 'HEAD']),
      }), false)
      assert.equal(candidateEvidenceGitLineageIsValid({
        ...fixture.context,
        pushedEvidenceHead: fixture.candidateSource,
      }), false)
      assert.equal(candidateEvidenceGitLineageIsValid({
        ...fixture.context,
        candidateTagRef: 'evidence-tip^{commit}',
      }), false)
      assert.equal(candidateEvidenceGitLineageIsValid({
        ...fixture.context,
        releasePaths: ['src', 'src'],
      }), false)
      assert.equal(candidateEvidenceGitLineageIsValid({
        ...fixture.context,
        releasePaths: ['../src'],
      }), false)

      fs.writeFileSync(
        path.join(fixture.root, 'src/mobile-input.js'),
        'export const dirty = true\n',
      )
      assert.equal(candidateEvidenceGitLineageIsValid(fixture.context), false)
      fixture.git(['add', '--', 'src/mobile-input.js'])
      fs.writeFileSync(
        path.join(fixture.root, 'src/mobile-input.js'),
        'export const candidate = true\n',
      )
      assert.equal(candidateEvidenceGitLineageIsValid(fixture.context), false)
      fixture.git(['reset', '--quiet', 'HEAD', '--', 'src/mobile-input.js'])

      fs.writeFileSync(
        path.join(fixture.root, 'android/app/src/main/Injected.java'),
        'final boolean injected = true;\n',
      )
      assert.equal(candidateEvidenceGitLineageIsValid(fixture.context), false)

      const sourceDriftFixture = createCandidateEvidenceLineageFixture()
      fs.writeFileSync(
        path.join(sourceDriftFixture.root, 'src/mobile-input.js'),
        'export const candidate = false\n',
      )
      sourceDriftFixture.git(['add', '--', 'src/mobile-input.js'])
      sourceDriftFixture.git(['commit', '--quiet', '-m', 'release input drift'])
      const driftedHead = sourceDriftFixture.git(['rev-parse', 'HEAD'])
      assert.equal(candidateEvidenceGitLineageIsValid({
        ...sourceDriftFixture.context,
        evidenceHead: driftedHead,
        pushedEvidenceHead: driftedHead,
      }), false)

      const nativeFixture = createCandidateEvidenceLineageFixture()
      fs.writeFileSync(
        path.join(nativeFixture.root, 'ios/App/App/AppDelegate.swift'),
        'let candidate = false\n',
      )
      nativeFixture.git(['add', '--', 'ios/App/App/AppDelegate.swift'])
      nativeFixture.git(['commit', '--quiet', '-m', 'native source drift'])
      const nativeDriftedHead = nativeFixture.git(['rev-parse', 'HEAD'])
      assert.equal(candidateEvidenceGitLineageIsValid({
        ...nativeFixture.context,
        evidenceHead: nativeDriftedHead,
        pushedEvidenceHead: nativeDriftedHead,
      }), false)
    },
  },
  {
    name: 'package-manifest lineage permits only the two exact pinned byte states',
    run: () => {
      const candidate = '{"name":"operator","version":"1.4.5"}\n'
      const pushed = '{"name":"operator","version":"1.4.6"}\n'
      const digest = (source) => crypto.createHash('sha256').update(source).digest('hex')
      const context = {
        candidateSource: candidate,
        evidenceSource: candidate,
        pushedSource: pushed,
        indexSource: pushed,
        workingTreeSource: pushed,
        candidateSha256: digest(candidate),
        pushedSha256: digest(pushed),
      }
      assert.equal(exactPackageManifestTransitionIsValid(context), true)
      assert.equal(exactPackageManifestTransitionIsValid({
        ...context,
        workingTreeSource: '{"name":"operator","version":"1.4.7"}\n',
      }), false)
      assert.equal(exactPackageManifestTransitionIsValid({
        ...context,
        candidateSha256: 'not-a-digest',
      }), false)
    },
  },
  {
    name: 'package-lock lineage allows only root version metadata correction',
    run: () => {
      const candidate = JSON.stringify({
        name: 'operator',
        version: '1.4.4',
        lockfileVersion: 3,
        packages: { '': { name: 'operator', version: '1.4.4' }, 'node_modules/a': { version: '1.0.0' } },
      })
      const corrected = JSON.stringify({
        name: 'operator',
        version: '1.4.5',
        lockfileVersion: 3,
        packages: { '': { name: 'operator', version: '1.4.5' }, 'node_modules/a': { version: '1.0.0' } },
      })
      assert.equal(mobilePackageLockLineageIsValid({
        candidateSource: candidate,
        evidenceSource: candidate,
        pushedEvidenceSource: candidate,
        indexSource: candidate,
        workingTreeSource: corrected,
      }), true)
      const dependencyDrift = corrected.replace('1.0.0', '2.0.0')
      assert.equal(mobilePackageLockLineageIsValid({
        candidateSource: candidate,
        evidenceSource: candidate,
        pushedEvidenceSource: candidate,
        indexSource: candidate,
        workingTreeSource: dependencyDrift,
      }), false)
      assert.equal(mobilePackageLockLineageIsValid({
        candidateSource: candidate,
        evidenceSource: candidate,
        pushedEvidenceSource: candidate,
        indexSource: '{',
        workingTreeSource: corrected,
      }), false)
    },
  },
  {
    name: 'candidate payload digest rejects any single-copy or coordinated ignored-tree drift',
    run: () => {
      const expectedDigest = '6'.repeat(64)
      const valid = {
        expectedDigest,
        distDigest: expectedDigest,
        iosDigest: expectedDigest,
        androidDigest: expectedDigest,
      }
      assert.equal(packagedCandidateTreeDigestsAreValid(valid), true)
      for (const key of ['distDigest', 'iosDigest', 'androidDigest']) {
        assert.equal(packagedCandidateTreeDigestsAreValid({
          ...valid,
          [key]: '7'.repeat(64),
        }), false)
      }
      assert.equal(packagedCandidateTreeDigestsAreValid({
        ...valid,
        distDigest: '7'.repeat(64),
        iosDigest: '7'.repeat(64),
        androidDigest: '7'.repeat(64),
      }), false)

      const preservedIpa = path.resolve(
        root,
        '../../Claude/System/AI-Collaboration/local-release-evidence/ios/1.4.2-build6/TheOperator-1.4.2-build6.ipa',
      )
      assert.deepEqual(iosIpaRuntimeTreeEvidence({
        ipaPath: preservedIpa,
        ignoredRootFiles: ['cordova.js', 'cordova_plugins.js'],
      }), {
        archiveSize: 2_193_322,
        archiveSha256: '4771d80d443d3219a1b7734e7cd07084ae791087ee8cac6a214e800c155577be',
        totalPublicFileCount: 25,
        runtimeFileCount: 23,
        runtimeDigest: '68fd3aed717cbad04fccf4e52e9d260d34523687c4b4a289a267c5cc3b0d5a57',
      })
    },
  },
  {
    name: 'Apple receipt closes over the exact dynamically discovered submission-file universe',
    run: () => assertDynamicScreenshotUniverse({
      validate: appleScreenshotReceiptIsValid,
      verified: verifiedAppleReceipt,
      context: appleReceiptContext,
      actual: actualAppleScreenshots,
      extraPath: 'store/assets/screenshots/ios-ipad-submission/03-extra.png',
    }),
  },
  {
    name: 'coordinated Apple plan and checklist prose clearance cannot clear the canonical receipt hold',
    run: () => {
      const clearedPlan = screenshotPlan.replace(/^> Apple submission hold:.*\n?/m, '')
      const clearedChecklist = releaseChecklist.replace(
        /^- \[ \] 🔴 Final iPhone and iPad submission screenshots.*$/m,
        '- [x] ✅ Final iPhone and iPad submission screenshots verified.',
      )
      assert.equal(hasAppleScreenshotSubmissionHold(clearedPlan), false)
      assert.equal(appleScreenshotProvenanceIsConsistent(clearedPlan, clearedChecklist), true)
      assert.equal(appleScreenshotReceiptIsValid(appleScreenshotReceipt, appleReceiptContext), false)
    },
  },
  {
    name: 'Apple receipt rejects source, build, screenshot, review, and live-byte drift',
    run: () => {
      const receiptMutations = [
        (receipt) => { receipt.reviewedSourceCommit = '0'.repeat(40) },
        (receipt) => { receipt.buildIdentity.bundleId = 'com.example.operator' },
        (receipt) => { receipt.buildIdentity.marketingVersion = '1.4.3' },
        (receipt) => { receipt.buildIdentity.buildNumber += 1 },
        (receipt) => { receipt.screenshots.pop() },
        (receipt) => { receipt.screenshots[0].path = './store/assets/screenshots/ios-iphone-submission/00-quick-study-start.png' },
        (receipt) => { receipt.screenshots[0].sha256 = '0'.repeat(64) },
        (receipt) => { receipt.visualReview.result = 'HOLD' },
        (receipt) => { receipt.visualReview.reviewedAt = '2026-02-30T17:00:00Z' },
        (receipt) => { receipt.notes = 'looks good' },
      ]
      for (const mutate of receiptMutations) {
        const receipt = verifiedAppleReceipt()
        mutate(receipt)
        assert.equal(appleScreenshotReceiptIsValid(receipt, appleReceiptContext), false)
      }

      const driftedActual = clone(actualAppleScreenshots)
      driftedActual[0].sha256 = '0'.repeat(64)
      assert.equal(appleScreenshotReceiptIsValid(verifiedAppleReceipt(), {
        ...appleReceiptContext,
        actualScreenshots: driftedActual,
      }), false)
    },
  },
  {
    name: 'Apple receipt parser rejects conflicting duplicate keys before JSON decoding',
    run: () => {
      const source = JSON.stringify(verifiedAppleReceipt())
      const duplicateSources = [
        source.replace('"status":"verified"', '"status":"hold","status":"verified"'),
        source.replace(
          '"bundleId":"com.base1520.theoperator"',
          '"bundleId":"com.example.wrong","bundleId":"com.base1520.theoperator"',
        ),
        source.replace(
          `"path":"${APPLE_SCREENSHOT_PATHS[0]}"`,
          `"path":"../aliased.png","path":"${APPLE_SCREENSHOT_PATHS[0]}"`,
        ),
      ]
      for (const duplicateSource of duplicateSources) {
        assert.equal(parseAppleScreenshotReceipt(duplicateSource), null)
      }
    },
  },
  {
    name: 'canonical Android screenshot hold remains active until the tablet set is recaptured',
    run: () => assert.equal(hasAndroidScreenshotCreativeHold(screenshotPlan), true),
  },
  {
    name: 'canonical Android screenshot plan and ledger hold agree',
    run: () => assert.equal(
      androidScreenshotProvenanceIsConsistent(screenshotPlan, releaseLedger),
      true,
    ),
  },
  {
    name: 'removing only the Android plan hold cannot clear the ledger-recorded creative hold',
    run: () => assert.equal(
      androidScreenshotProvenanceIsConsistent(
        screenshotPlan.replace(/^> Android creative hold:.*\n?/m, ''),
        releaseLedger,
      ),
      false,
    ),
  },
  {
    name: 'clean Android prose without a verified receipt remains blocked',
    run: () => {
      assert.equal(androidScreenshotProvenanceIsConsistent(
        '> Android tablet set ready: corrected release-candidate captures.',
        '| Android 7-inch tablet screenshots | corrected release-candidate captures | PASS |',
      ), true)
      assert.equal(androidScreenshotReceiptIsValid(androidScreenshotReceipt, receiptContext), false)
    },
  },
  {
    name: 'canonical Android receipt records the current visual hold and cannot clear readiness',
    run: () => assert.equal(
      androidScreenshotReceiptIsValid(androidScreenshotReceipt, receiptContext),
      false,
    ),
  },
  {
    name: 'a complete Android source/build/byte-anchored visual-attestation PASS satisfies the receipt contract',
    run: () => assert.equal(
      androidScreenshotReceiptIsValid(verifiedReceipt(), receiptContext),
      true,
    ),
  },
  {
    name: 'a byte-valid Android visual attestation cannot override the independent pixel-quality hold',
    run: () => {
      const syntheticReceiptIsValid = androidScreenshotReceiptIsValid(
        verifiedReceipt(),
        receiptContext,
      )
      const visualHoldIsActive = hasAndroidScreenshotCreativeHold(screenshotPlan)
      const recordsAreConsistent = androidScreenshotProvenanceIsConsistent(
        screenshotPlan,
        releaseLedger,
      )

      assert.equal(syntheticReceiptIsValid, true)
      assert.equal(visualHoldIsActive, true)
      assert.equal(recordsAreConsistent, true)
      assert.equal(
        !visualHoldIsActive && recordsAreConsistent && syntheticReceiptIsValid,
        false,
      )
    },
  },
  {
    name: 'Android receipt closes over the exact dynamically discovered submission-file universe',
    run: () => assertDynamicScreenshotUniverse({
      validate: androidScreenshotReceiptIsValid,
      verified: verifiedReceipt,
      context: receiptContext,
      actual: actualScreenshots,
      extraPath: 'store/assets/screenshots/android-phone/02-extra.png',
    }),
  },
  {
    name: 'coordinated deletion of every prose hold still cannot clear the canonical receipt hold',
    run: () => {
      const clearedPlan = screenshotPlan.replace(/^> Android creative hold:.*\n?/m, '')
      const clearedLedger = releaseLedger
        .replace(/\bCREATIVE HOLD\b/g, 'PASS')
        .replace(/\bSCREENSHOTS STILL BLOCKED\b/g, 'PASS')
      assert.equal(hasAndroidScreenshotCreativeHold(clearedPlan), false)
      assert.equal(androidScreenshotProvenanceIsConsistent(clearedPlan, clearedLedger), true)
      assert.equal(androidScreenshotReceiptIsValid(androidScreenshotReceipt, receiptContext), false)
    },
  },
  {
    name: 'Android receipt rejects source or exact build-identity drift',
    run: () => {
      const mutations = [
        (receipt) => { receipt.reviewedSourceCommit = '0'.repeat(40) },
        (receipt) => { receipt.buildIdentity.applicationId = 'com.example.operator' },
        (receipt) => { receipt.buildIdentity.versionName = '1.4.3' },
        (receipt) => { receipt.buildIdentity.versionCode += 1 },
        (receipt) => { receipt.buildIdentity.label = 'release' },
      ]
      for (const mutate of mutations) {
        const receipt = verifiedReceipt()
        mutate(receipt)
        assert.equal(androidScreenshotReceiptIsValid(receipt, receiptContext), false)
      }
    },
  },
  {
    name: 'Android receipt parser rejects conflicting duplicate keys at every object depth',
    run: () => {
      const source = JSON.stringify(verifiedReceipt())
      const duplicateSources = [
        source.replace('"status":"verified"', '"status":"hold","status":"verified"'),
        source.replace(
          '"applicationId":"com.base1520.theoperator"',
          '"applicationId":"com.example.wrong","applicationId":"com.base1520.theoperator"',
        ),
        source.replace(
          `"path":"${ANDROID_SCREENSHOT_PATHS[0]}"`,
          `"path":"../aliased.png","path":"${ANDROID_SCREENSHOT_PATHS[0]}"`,
        ),
      ]
      for (const duplicateSource of duplicateSources) {
        assert.equal(parseAndroidScreenshotReceipt(duplicateSource), null)
      }
    },
  },
  {
    name: 'Android receipt rejects screenshot omission, duplication, aliasing, extras, and byte drift',
    run: () => {
      const receiptMutations = [
        (receipt) => { receipt.screenshots.pop() },
        (receipt) => { receipt.screenshots[5] = clone(receipt.screenshots[0]) },
        (receipt) => { receipt.screenshots[0].path = './store/assets/screenshots/android-phone/00-quick-study-start.png' },
        (receipt) => { receipt.screenshots.push({ path: '../extra.png', sha256: '0'.repeat(64) }) },
        (receipt) => { receipt.screenshots[0].sha256 = '0'.repeat(64) },
      ]
      for (const mutate of receiptMutations) {
        const receipt = verifiedReceipt()
        mutate(receipt)
        assert.equal(androidScreenshotReceiptIsValid(receipt, receiptContext), false)
      }

      const driftedActual = clone(actualScreenshots)
      driftedActual[0].sha256 = '0'.repeat(64)
      assert.equal(androidScreenshotReceiptIsValid(verifiedReceipt(), {
        ...receiptContext,
        actualScreenshots: driftedActual,
      }), false)
    },
  },
  {
    name: 'Android receipt rejects non-PASS, anonymous, offsetless, future, or ambiguous review attestations',
    run: () => {
      const mutations = [
        (receipt) => { receipt.status = 'hold' },
        (receipt) => { receipt.visualReview.result = 'HOLD' },
        (receipt) => { receipt.visualReview.reviewedBy = '   ' },
        (receipt) => { receipt.visualReview.reviewedAt = '2026-08-16T17:00:00' },
        (receipt) => { receipt.visualReview.reviewedAt = '2026-08-16T19:00:00-05:00' },
        (receipt) => { receipt.visualReview.reviewedAt = '2026-02-30T17:00:00Z' },
        (receipt) => { receipt.visualReview.reviewedAt = '2026-08-16T24:00:00Z' },
        (receipt) => { receipt.visualReview.reviewedAt = '2026-08-16T17:00:00-00:00' },
        (receipt) => { receipt.visualReview.notes = 'looks good' },
      ]
      for (const mutate of mutations) {
        const receipt = verifiedReceipt()
        mutate(receipt)
        assert.equal(androidScreenshotReceiptIsValid(receipt, receiptContext), false)
      }
    },
  },
  {
    name: 'native build-5 iPad landscape captures match the checker dimensions',
    run: () => {
      const iPadSpec = STORE_SCREENSHOT_SETS.find(({ label }) => label === 'Apple iPad')
      assert.ok(iPadSpec)
      assert.deepEqual(APPLE_IPAD_LANDSCAPE_DIMENSIONS, { width: 2732, height: 2048 })
      assert.equal(
        screenshotDimensionsMatch({ width: 2732, height: 2048 }, iPadSpec.dimensions),
        true,
      )
      assert.equal(
        screenshotDimensionsMatch({ width: 2731, height: 2048 }, iPadSpec.dimensions),
        false,
      )
    },
  },
  {
    name: 'canonical stale-capture requirement and screenshot plan agree',
    run: () => assert.equal(
      appleScreenshotProvenanceIsConsistent(screenshotPlan, releaseChecklist),
      true,
    ),
  },
  {
    name: 'an open Apple screenshot gate without a declared hold is rejected',
    run: () => assert.equal(
      appleScreenshotProvenanceIsConsistent(
        '> Apple submission set ready: partial recapture only.',
        '- [ ] 🔴 Final iPhone and iPad submission screenshots come from the release candidate.',
      ),
      false,
    ),
  },
  {
    name: 'fresh captures do not require a stale-provenance hold',
    run: () => assert.equal(
      appleScreenshotProvenanceIsConsistent(
        '> Apple submission set ready: fresh files.',
        '- [x] ✅ Final iPhone and iPad submission screenshots verified.',
      ),
      true,
    ),
  },
  {
    name: 'the mobile readiness gate requires Apple provenance consistency and the positive receipt',
    run: () => {
      assert.match(
        readinessSource,
        /const appleScreenshotReceiptSource = read\('store\/apple-screenshot-verification\.json'\)[\s\S]*?const appleScreenshotReceipt = parseAppleScreenshotReceipt\(appleScreenshotReceiptSource\)/,
      )
      assert.match(
        readinessSource,
        /check\(\s*!hasAppleScreenshotSubmissionHold\(screenshotPlan\)\s*&&\s*appleScreenshotReceiptIsValid\(appleScreenshotReceipt,/,
      )
      assert.match(
        readinessSource,
        /expectedSourceCommit: canonicalReleaseSource,[\s\S]*?expectedBuildIdentity: candidateAppleBuildIdentity,[\s\S]*?receiptGitCustody: appleScreenshotReceiptGitCustody,/,
      )
      assert.match(
        readinessSource,
        /appleScreenshotProvenanceIsConsistent\(screenshotPlan, releaseChecklist\)/,
      )
    },
  },
  {
    name: 'the mobile readiness gate requires both Android hold records and the positive receipt',
    run: () => {
      assert.match(
        readinessSource,
        /const androidScreenshotReceiptSource = read\('store\/android-screenshot-verification\.json'\)[\s\S]*?const androidScreenshotReceipt = parseAndroidScreenshotReceipt\(androidScreenshotReceiptSource\)/,
      )
      assert.match(
        readinessSource,
        /check\(\s*!hasAndroidScreenshotCreativeHold\(screenshotPlan\)\s*&&\s*androidScreenshotProvenanceIsConsistent\(screenshotPlan, releaseLedger\)\s*&&\s*androidScreenshotReceiptIsValid\(androidScreenshotReceipt,/,
      )
      assert.match(
        readinessSource,
        /expectedSourceCommit: canonicalReleaseSource,[\s\S]*?expectedBuildIdentity: candidateAndroidBuildIdentity,[\s\S]*?receiptGitCustody: androidScreenshotReceiptGitCustody,/,
      )
    },
  },
  {
    name: 'the mobile readiness gate separates immutable candidate source from the pushed evidence tip',
    run: () => {
      assert.match(readinessSource, /candidateEvidenceGitLineageIsValid\(\{[\s\S]*?candidateSource: canonicalReleaseSource,[\s\S]*?evidenceHead: evidenceRepositoryHead,[\s\S]*?pushedEvidenceHead: pushedEvidenceRepositoryHead,[\s\S]*?releasePaths: MOBILE_RELEASE_LINEAGE_PATHS,[\s\S]*?worktreePaths: MOBILE_RELEASE_LINEAGE_PATHS,/)
      assert.match(readinessSource, /mobilePackageLockLineageIsValid\(\{[\s\S]*?candidateSource: candidatePackageLockSource,[\s\S]*?workingTreeSource:/)
      assert.match(
        readinessSource,
        /const BUILD_6_RUNTIME_TREE_DIGEST = '68fd3aed717cbad04fccf4e52e9d260d34523687c4b4a289a267c5cc3b0d5a57'/,
      )
      assert.match(
        readinessSource,
        /const BUILD_6_IPA_SHA256 = '4771d80d443d3219a1b7734e7cd07084ae791087ee8cac6a214e800c155577be'/,
      )
      assert.match(
        releaseChecklist,
        /pinned 23-file runtime digest `68fd3aed717cbad04fccf4e52e9d260d34523687c4b4a289a267c5cc3b0d5a57`/,
      )
      assert.match(
        releaseLedger,
        /pinned to 23-file runtime digest `68fd3aed717cbad04fccf4e52e9d260d34523687c4b4a289a267c5cc3b0d5a57`/,
      )
      assert.match(readinessSource, /expectedDigest: BUILD_6_RUNTIME_TREE_DIGEST/)
      assert.doesNotMatch(readinessSource, /expectedSourceCommit: gitRef\('HEAD'\)/)
      assert.doesNotMatch(readinessSource, /canonicalReleaseSource === gitRef\('HEAD'\)/)
      assert.doesNotMatch(readinessSource, /canonicalReleaseSource === gitRef\('origin\/main'\)/)
    },
  },
  {
    name: 'the mobile readiness gate consumes the shared screenshot dimension contract',
    run: () => {
      assert.match(readinessSource, /for \(const \{ label, directory, dimensions,[^\n]+STORE_SCREENSHOT_SETS\)/)
      assert.match(readinessSource, /screenshotDimensionsMatch\(image, dimensions\)/)
    },
  },
  {
    name: 'the mobile readiness gate binds receipts to every dynamically enumerated submission file',
    run: () => {
      assert.match(readinessSource, /const stagedScreenshotPaths = \{ apple: \[\], android: \[\] \}/)
      assert.match(readinessSource, /const visibleEntries = fs\.readdirSync[\s\S]*?\.filter\(\(entry\) => !entry\.name\.startsWith\('\.'\)\)/)
      assert.match(readinessSource, /const images = visibleEntries\s*\.filter\(\(entry\) => entry\.isFile\(\)\)/)
      assert.match(readinessSource, /visibleEntries\.every\(\(entry\) => entry\.isFile\(\)\)/)
      assert.match(readinessSource, /stagedScreenshotPaths\[ios \? 'apple' : 'android'\]\.push/)
      assert.match(readinessSource, /actualScreenshots: stagedScreenshotPaths\.apple\.map/)
      assert.match(readinessSource, /actualScreenshots: stagedScreenshotPaths\.android\.map/)
      assert.doesNotMatch(readinessSource, /actualScreenshots:\s*APPLE_SCREENSHOT_PATHS\.map/)
      assert.doesNotMatch(readinessSource, /actualScreenshots:\s*ANDROID_SCREENSHOT_PATHS\.map/)
    },
  },
]

let passed = 0
let failed = 0

for (const test of tests) {
  try {
    test.run()
    passed += 1
    console.log(`PASS ${test.name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${test.name}`)
    console.error(error instanceof Error ? error.message : String(error))
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
