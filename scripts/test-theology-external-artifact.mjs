import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const database = fs.readFileSync(path.join(root, THEOLOGY_DATABASE_PATH))

function gitTracks(relative) {
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

function gitIgnores(relative) {
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

const canonical = {
  externalArtifacts: read('store/external-artifacts.md'),
  databaseEvidence: {
    size: database.byteLength,
    sha256: crypto.createHash('sha256').update(database).digest('hex'),
  },
  rightsNotice: read('resources/theology-retrieval/RIGHTS-NOTICE.txt'),
  bundleManifest: read('resources/theology-retrieval/bundle-manifest.json'),
  gitignore: read('.gitignore'),
  dockerignore: read('.dockerignore'),
  railwayignore: read('.railwayignore'),
  dockerfile: read('server/Dockerfile'),
  releaseChecklist: read('store/release-checklist.md'),
  releaseLedger: read('store/release-ledger.md'),
  databaseIgnored: gitIgnores(THEOLOGY_DATABASE_PATH),
  databaseTracked: gitTracks(THEOLOGY_DATABASE_PATH),
}

const signingCanonical = {
  externalArtifacts: canonical.externalArtifacts,
  gitignore: canonical.gitignore,
  railwayignore: canonical.railwayignore,
  releaseChecklist: canonical.releaseChecklist,
  releaseLedger: canonical.releaseLedger,
  privateKeyIgnored: gitIgnores(DESKTOP_LICENSE_PRIVATE_REPO_PATH),
  publicKeyIgnored: gitIgnores(DESKTOP_LICENSE_PUBLIC_REPO_PATH),
  privateKeyTracked: gitTracks(DESKTOP_LICENSE_PRIVATE_REPO_PATH),
  publicKeyTracked: gitTracks(DESKTOP_LICENSE_PUBLIC_REPO_PATH),
}

const androidDirectoryEntries = fs.readdirSync(path.join(root, 'android'), { withFileTypes: true })
const androidSigningCanonical = {
  externalArtifacts: canonical.externalArtifacts,
  gitignore: canonical.gitignore,
  releaseChecklist: canonical.releaseChecklist,
  releaseLedger: canonical.releaseLedger,
  androidBuild: read('android/app/build.gradle'),
  propertiesPresent: fs.existsSync(path.join(root, ANDROID_UPLOAD_PROPERTIES_PATH)),
  defaultJksPresent: fs.existsSync(path.join(root, ANDROID_UPLOAD_JKS_PATH)),
  defaultKeystorePresent: fs.existsSync(path.join(root, ANDROID_UPLOAD_KEYSTORE_PATH)),
  privateKeyCandidatePresent: androidDirectoryEntries.some((entry) => entry.isFile() && /\.(?:jks|keystore)$/i.test(entry.name)),
  environmentNamesPresent: Object.fromEntries(
    ANDROID_UPLOAD_ENV_NAMES.map((name) => [name, Object.prototype.hasOwnProperty.call(process.env, name)]),
  ),
  propertiesIgnored: gitIgnores(ANDROID_UPLOAD_PROPERTIES_PATH),
  jksIgnored: gitIgnores(ANDROID_UPLOAD_JKS_PATH),
  keystoreIgnored: gitIgnores(ANDROID_UPLOAD_KEYSTORE_PATH),
  propertiesTracked: gitTracks(ANDROID_UPLOAD_PROPERTIES_PATH),
  jksTracked: gitTracks(ANDROID_UPLOAD_JKS_PATH),
  keystoreTracked: gitTracks(ANDROID_UPLOAD_KEYSTORE_PATH),
}

const expectCanonical = (name, sources, expected) => assert.equal(
  theologyExternalArtifactIsCanonical(sources),
  expected,
  name,
)
const expectSigningCanonical = (name, sources, expected) => assert.equal(
  desktopLicenseSigningRecordsAreCanonical(sources),
  expected,
  name,
)
const expectAndroidSigningCanonical = (name, sources, expected) => assert.equal(
  androidUploadSigningRecordsAreCanonical(sources),
  expected,
  name,
)

function replaceRequired(text, from, to, name) {
  const mutated = text.replace(from, to)
  assert.notEqual(mutated, text, `${name}: mutation did not change its input`)
  return mutated
}

const positiveBackupManifest = replaceRequired(
  canonical.externalArtifacts,
  '- Authoritative backup: **UNVERIFIED — Cole must choose and verify an off-machine master location before approving a release boundary as reproducible**',
  '- Authoritative backup: **VERIFIED — synthetic test status**',
  'manifest-backup',
)
const completedBackupChecklist = replaceRequired(
  canonical.releaseChecklist,
  '- [ ] The required out-of-band theology database has a verified off-machine master matching `store/external-artifacts.md`; a Git commit alone does not contain it.',
  '- [x] The required out-of-band theology database has a verified off-machine master matching `store/external-artifacts.md`; a Git commit alone does not contain it.',
  'checklist-backup',
)
const passingBackupLedger = replaceRequired(
  canonical.releaseLedger,
  '| BLOCKED ON BACKUP DECISION — required 7,016,448-byte database',
  '| PASS — required 7,016,448-byte database',
  'ledger-backup',
)
const duplicateManifestChecksum = replaceRequired(
  canonical.externalArtifacts,
  '- SHA-256: `3acfde0f0dae33963cfb1302773d670b521982e616c76254ac7788f9ffefc134`',
  '- SHA-256: `3acfde0f0dae33963cfb1302773d670b521982e616c76254ac7788f9ffefc134`\n- SHA-256: `0000000000000000000000000000000000000000000000000000000000000000`',
  'duplicate-manifest-checksum',
)
const duplicateCheckedChecklistRow = `${canonical.releaseChecklist}\n- [x] The required out-of-band theology database has a verified off-machine master matching \`store/external-artifacts.md\`; a Git commit alone does not contain it.\n`
const duplicatePassingLedgerRow = `${canonical.releaseLedger}\n| Out-of-band theology database | synthetic contradictory row | PASS — synthetic backup claim. |\n`
const commentedDockerCopy = replaceRequired(
  canonical.dockerfile,
  'COPY resources/theology-retrieval ./resources/theology-retrieval',
  '# COPY resources/theology-retrieval ./resources/theology-retrieval',
  'commented-docker-copy',
)
const changedBundleRange = replaceRequired(
  canonical.bundleManifest,
  '"colossians": [{ "start": 0, "end": 886 }]',
  '"colossians": [{ "start": 0, "end": 885 }]',
  'bundle-range',
)
const desktopBackupLine = '- Authoritative backup: **UNVERIFIED — loss of the private key prevents issuing compatible new licenses and cannot be repaired by rotating an existing install to a new key**'
const positiveDesktopBackupManifest = replaceRequired(
  signingCanonical.externalArtifacts,
  desktopBackupLine,
  '- Authoritative backup: **VERIFIED — synthetic test status**',
  'desktop-manifest-backup',
)
const completedDesktopBackupChecklist = replaceRequired(
  signingCanonical.releaseChecklist,
  '- [ ] The desktop license signing key has a verified off-machine backup recorded in `store/external-artifacts.md`; existence on this Mac is not a backup.',
  '- [x] The desktop license signing key has a verified off-machine backup recorded in `store/external-artifacts.md`; existence on this Mac is not a backup.',
  'desktop-checklist-backup',
)
const passingDesktopBackupLedger = replaceRequired(
  signingCanonical.releaseLedger,
  '| BLOCKED ON BACKUP / CONFIGURATION — desktop license private/public key files exist, but no off-machine backup is verified.',
  '| PASS — desktop license signing backup is verified.',
  'desktop-ledger-backup',
)
const privateDesktopPathDrift = replaceRequired(
  signingCanonical.externalArtifacts,
  '- Private-key path: `~/.operator-license-key`',
  '- Private-key path: `~/.synthetic-license-key`',
  'desktop-private-path',
)
const publicDesktopPathDrift = replaceRequired(
  signingCanonical.externalArtifacts,
  '- Public-key path: `~/.operator-license-key.pub`',
  '- Public-key path: `~/.synthetic-license-key.pub`',
  'desktop-public-path',
)
const duplicateDesktopSection = replaceRequired(
  signingCanonical.externalArtifacts,
  '### Android upload identity',
  '### Desktop license signing identity\n\n- Authoritative backup: **VERIFIED — synthetic duplicate section**\n\n### Android upload identity',
  'duplicate-desktop-section',
)
const duplicateDesktopBackupLine = replaceRequired(
  signingCanonical.externalArtifacts,
  desktopBackupLine,
  `${desktopBackupLine}\n- Authoritative backup: **VERIFIED — synthetic duplicate line**`,
  'duplicate-desktop-backup-line',
)
const duplicateCompletedDesktopChecklistRow = `${signingCanonical.releaseChecklist}\n- [x] The desktop license signing key has a verified off-machine backup recorded in \`store/external-artifacts.md\`; existence on this Mac is not a backup.\n`
const duplicatePassingSigningLedgerRow = `${signingCanonical.releaseLedger}\n| Out-of-band signing identities | synthetic contradictory row | PASS — desktop backup verified. |\n`
const contradictoryBlockedSigningLedger = replaceRequired(
  signingCanonical.releaseLedger,
  'desktop license private/public key files exist, but no off-machine backup is verified.',
  'desktop license private/public key files exist, but no off-machine backup is verified. Desktop backup is complete and verified.',
  'contradictory-blocked-signing-ledger',
)
const androidLocalStateLine = '- Local state verified 2026-08-14 00:45 CDT: **NOT CONFIGURED IN THE CURRENT RELEASE ENVIRONMENT** — `android/operator-upload.properties`, the example\'s default `android/operator-upload.jks`, and all four supported `OPERATOR_UPLOAD_*` shell inputs are absent. With the Java/Android SDK/cache environment pinned by the `mobile:verify:android` package script, an offline `:app:bundleRelease --dry-run` configured the app, reached the fail-closed guard in `android/app/build.gradle`, and stopped before bundle tasks executed. This does not rule out an unconfigured key in an external backup.'
const androidBackupLine = '- Authoritative backup: **NOT APPLICABLE YET — record and verify an encrypted off-machine backup at creation, before the first Play upload**'
const positiveAndroidManifest = replaceRequired(
  replaceRequired(
    androidSigningCanonical.externalArtifacts,
    androidLocalStateLine,
    '- Local state verified 2026-08-14 00:45 CDT: **CONFIGURED — synthetic test status**',
    'android-manifest-state',
  ),
  androidBackupLine,
  '- Authoritative backup: **VERIFIED — synthetic test status**',
  'android-manifest-backup',
)
const completedAndroidChecklist = [
  'When the Android upload identity is created, its encrypted off-machine backup is verified and recorded before the first Play upload.',
  'A signed Android release bundle compiles with the authorized upload key.',
  'A new upload key is securely created or the existing key is recovered; encrypted backup and fingerprints are recorded outside Git.',
].reduce(
  (text, marker) => replaceRequired(text, `- [ ] ${marker}`, `- [x] ${marker}`, `android-checklist-${marker}`),
  androidSigningCanonical.releaseChecklist,
)
const passingAndroidLedger = replaceRequired(
  replaceRequired(
    androidSigningCanonical.releaseLedger,
    'For Android, the expected properties file, default keystore, and four supported shell inputs are absent;',
    'For Android, a synthetic upload identity and encrypted backup are verified;',
    'android-signing-ledger',
  ),
  '| **BLOCKED / RUNTIME-PROVEN** — the four supported upload-signing inputs and expected local configuration/default key are absent.',
  '| **PASS** — a synthetic signed Android bundle exists.',
  'android-bundle-ledger',
)
const duplicateAndroidSection = replaceRequired(
  androidSigningCanonical.externalArtifacts,
  '### Android upload identity',
  '### Android upload identity\n\n- Authoritative backup: **VERIFIED — synthetic duplicate section**\n\n### Android upload identity',
  'duplicate-android-section',
)

const tests = [
  {
    name: 'canonical theology artifact identity and unverified-backup records pass',
    run: () => expectCanonical('canonical', canonical, true),
  },
  {
    name: 'a missing local database fails closed',
    run: () => expectCanonical('missing-database', {
      ...canonical,
      databaseEvidence: { size: -1, sha256: '' },
    }, false),
  },
  {
    name: 'a same-size database checksum mutation fails closed',
    run: () => expectCanonical('database-checksum', {
      ...canonical,
      databaseEvidence: { ...canonical.databaseEvidence, sha256: '0'.repeat(64) },
    }, false),
  },
  {
    name: 'a public-domain rights-record mutation fails closed',
    run: () => expectCanonical('rights-record', {
      ...canonical,
      rightsNotice: canonical.rightsNotice.replace('Project Gutenberg eBook 50857', 'Project Gutenberg eBook 00000'),
    }, false),
  },
  {
    name: 'a deploy exclusion for the theology bundle fails closed',
    run: () => expectCanonical('deploy-ignore', {
      ...canonical,
      railwayignore: `${canonical.railwayignore}\nresources/theology-retrieval`,
    }, false),
  },
  {
    name: 'a basename wildcard deploy exclusion fails closed',
    run: () => expectCanonical('basename-deploy-ignore', {
      ...canonical,
      railwayignore: `${canonical.railwayignore}\n*.sqlite3`,
    }, false),
  },
  {
    name: 'a recursive wildcard deploy exclusion fails closed',
    run: () => expectCanonical('recursive-deploy-ignore', {
      ...canonical,
      dockerignore: `${canonical.dockerignore}\n**/*.sqlite3`,
    }, false),
  },
  {
    name: 'a character-class wildcard deploy exclusion fails closed',
    run: () => expectCanonical('character-class-deploy-ignore', {
      ...canonical,
      dockerignore: `${canonical.dockerignore}\n*.[sS][qQ][lL]ite3`,
    }, false),
  },
  {
    name: 'an ordered deploy re-inclusion remains accepted',
    run: () => expectCanonical('deploy-reinclude', {
      ...canonical,
      railwayignore: `${canonical.railwayignore}\n**/*.sqlite3\n!${THEOLOGY_DATABASE_PATH}`,
    }, true),
  },
  {
    name: 'a Git-ignore negation fails closed',
    run: () => expectCanonical('gitignore-negation', {
      ...canonical,
      gitignore: `${canonical.gitignore}\n!${THEOLOGY_DATABASE_PATH}`,
    }, false),
  },
  {
    name: 'missing effective Git-ignore evidence fails closed',
    run: () => expectCanonical('gitignore-evidence', {
      ...canonical,
      databaseIgnored: false,
    }, false),
  },
  {
    name: 'ambiguous Git tracked-state evidence fails closed',
    run: () => expectCanonical('git-tracked-ambiguity', {
      ...canonical,
      databaseTracked: null,
    }, false),
  },
  {
    name: 'a commented Docker COPY fails closed',
    run: () => expectCanonical('commented-docker-copy', {
      ...canonical,
      dockerfile: commentedDockerCopy,
    }, false),
  },
  {
    name: 'a duplicate conflicting manifest checksum fails closed',
    run: () => expectCanonical('duplicate-manifest-checksum', {
      ...canonical,
      externalArtifacts: duplicateManifestChecksum,
    }, false),
  },
  {
    name: 'a duplicate checked checklist row fails closed',
    run: () => expectCanonical('duplicate-checklist-row', {
      ...canonical,
      releaseChecklist: duplicateCheckedChecklistRow,
    }, false),
  },
  {
    name: 'a duplicate passing ledger row fails closed',
    run: () => expectCanonical('duplicate-ledger-row', {
      ...canonical,
      releaseLedger: duplicatePassingLedgerRow,
    }, false),
  },
  {
    name: 'a bundle-manifest range mutation fails closed',
    run: () => expectCanonical('bundle-range', {
      ...canonical,
      bundleManifest: changedBundleRange,
    }, false),
  },
  {
    name: 'a manifest-only false backup promotion fails closed',
    run: () => expectCanonical('manifest-backup', {
      ...canonical,
      externalArtifacts: positiveBackupManifest,
    }, false),
  },
  {
    name: 'a checklist-only false backup promotion fails closed',
    run: () => expectCanonical('checklist-backup', {
      ...canonical,
      releaseChecklist: completedBackupChecklist,
    }, false),
  },
  {
    name: 'a ledger-only false backup promotion fails closed',
    run: () => expectCanonical('ledger-backup', {
      ...canonical,
      releaseLedger: passingBackupLedger,
    }, false),
  },
  {
    name: 'a synchronized false backup promotion still fails closed',
    run: () => expectCanonical('synchronized-backup', {
      ...canonical,
      externalArtifacts: positiveBackupManifest,
      releaseChecklist: completedBackupChecklist,
      releaseLedger: passingBackupLedger,
    }, false),
  },
]

const signingTests = [
  {
    name: 'canonical desktop signing-backup records and secret exclusions pass',
    run: () => expectSigningCanonical('desktop-canonical', signingCanonical, true),
  },
  {
    name: 'a manifest-only desktop backup promotion fails closed',
    run: () => expectSigningCanonical('desktop-manifest-backup', {
      ...signingCanonical,
      externalArtifacts: positiveDesktopBackupManifest,
    }, false),
  },
  {
    name: 'a checklist-only desktop backup promotion fails closed',
    run: () => expectSigningCanonical('desktop-checklist-backup', {
      ...signingCanonical,
      releaseChecklist: completedDesktopBackupChecklist,
    }, false),
  },
  {
    name: 'a ledger-only desktop backup promotion fails closed',
    run: () => expectSigningCanonical('desktop-ledger-backup', {
      ...signingCanonical,
      releaseLedger: passingDesktopBackupLedger,
    }, false),
  },
  {
    name: 'a synchronized desktop backup promotion still fails closed',
    run: () => expectSigningCanonical('desktop-synchronized-backup', {
      ...signingCanonical,
      externalArtifacts: positiveDesktopBackupManifest,
      releaseChecklist: completedDesktopBackupChecklist,
      releaseLedger: passingDesktopBackupLedger,
    }, false),
  },
  {
    name: 'desktop private-key path drift fails closed',
    run: () => expectSigningCanonical('desktop-private-path', {
      ...signingCanonical,
      externalArtifacts: privateDesktopPathDrift,
    }, false),
  },
  {
    name: 'desktop public-key path drift fails closed',
    run: () => expectSigningCanonical('desktop-public-path', {
      ...signingCanonical,
      externalArtifacts: publicDesktopPathDrift,
    }, false),
  },
  {
    name: 'a later private-key Git-ignore negation fails closed',
    run: () => expectSigningCanonical('desktop-gitignore-negation', {
      ...signingCanonical,
      gitignore: `${signingCanonical.gitignore}\n!${DESKTOP_LICENSE_PRIVATE_REPO_PATH}`,
    }, false),
  },
  {
    name: 'a later public-key Railway-ignore negation fails closed',
    run: () => expectSigningCanonical('desktop-railway-negation', {
      ...signingCanonical,
      railwayignore: `${signingCanonical.railwayignore}\n!${DESKTOP_LICENSE_PUBLIC_REPO_PATH}`,
    }, false),
  },
  {
    name: 'a later environment Railway-ignore negation fails closed',
    run: () => expectSigningCanonical('desktop-env-railway-negation', {
      ...signingCanonical,
      railwayignore: `${signingCanonical.railwayignore}\n!.env.production`,
    }, false),
  },
  {
    name: 'missing private-key effective-ignore evidence fails closed',
    run: () => expectSigningCanonical('desktop-private-ignore-evidence', {
      ...signingCanonical,
      privateKeyIgnored: false,
    }, false),
  },
  {
    name: 'ambiguous public-key effective-ignore evidence fails closed',
    run: () => expectSigningCanonical('desktop-public-ignore-ambiguity', {
      ...signingCanonical,
      publicKeyIgnored: null,
    }, false),
  },
  {
    name: 'a tracked private-key path fails closed',
    run: () => expectSigningCanonical('desktop-private-tracked', {
      ...signingCanonical,
      privateKeyTracked: true,
    }, false),
  },
  {
    name: 'ambiguous public-key tracked-state evidence fails closed',
    run: () => expectSigningCanonical('desktop-public-tracked-ambiguity', {
      ...signingCanonical,
      publicKeyTracked: null,
    }, false),
  },
  {
    name: 'a duplicate desktop signing section fails closed',
    run: () => expectSigningCanonical('duplicate-desktop-section', {
      ...signingCanonical,
      externalArtifacts: duplicateDesktopSection,
    }, false),
  },
  {
    name: 'a duplicate contradictory desktop backup line fails closed',
    run: () => expectSigningCanonical('duplicate-desktop-backup-line', {
      ...signingCanonical,
      externalArtifacts: duplicateDesktopBackupLine,
    }, false),
  },
  {
    name: 'a duplicate checked desktop checklist row fails closed',
    run: () => expectSigningCanonical('duplicate-desktop-checklist-row', {
      ...signingCanonical,
      releaseChecklist: duplicateCompletedDesktopChecklistRow,
    }, false),
  },
  {
    name: 'a duplicate passing signing-ledger row fails closed',
    run: () => expectSigningCanonical('duplicate-signing-ledger-row', {
      ...signingCanonical,
      releaseLedger: duplicatePassingSigningLedgerRow,
    }, false),
  },
  {
    name: 'a blocked ledger row with a positive desktop-backup claim fails closed',
    run: () => expectSigningCanonical('contradictory-blocked-signing-ledger', {
      ...signingCanonical,
      releaseLedger: contradictoryBlockedSigningLedger,
    }, false),
  },
  {
    name: 'weakening the value-free signing-manifest boundary fails closed',
    run: () => expectSigningCanonical('desktop-safety-boundary', {
      ...signingCanonical,
      externalArtifacts: replaceRequired(
        signingCanonical.externalArtifacts,
        'Do not place private-key contents or private-key hashes in this manifest. Record only the expected path, existence, purpose, and verified backup status.',
        'Record signing details here.',
        'desktop-safety-boundary',
      ),
    }, false),
  },
]

const androidSigningTests = [
  {
    name: 'canonical Android upload-signing records and value-free absence evidence pass',
    run: () => expectAndroidSigningCanonical('android-canonical', androidSigningCanonical, true),
  },
  {
    name: 'an Android manifest state or backup promotion fails closed',
    run: () => expectAndroidSigningCanonical('android-manifest-promotion', {
      ...androidSigningCanonical,
      externalArtifacts: positiveAndroidManifest,
    }, false),
  },
  {
    name: 'three checked Android signing rows fail closed',
    run: () => expectAndroidSigningCanonical('android-checklist-promotion', {
      ...androidSigningCanonical,
      releaseChecklist: completedAndroidChecklist,
    }, false),
  },
  {
    name: 'passing Android signing ledger claims fail closed',
    run: () => expectAndroidSigningCanonical('android-ledger-promotion', {
      ...androidSigningCanonical,
      releaseLedger: passingAndroidLedger,
    }, false),
  },
  {
    name: 'a synchronized Android signing promotion still fails closed',
    run: () => expectAndroidSigningCanonical('android-synchronized-promotion', {
      ...androidSigningCanonical,
      externalArtifacts: positiveAndroidManifest,
      releaseChecklist: completedAndroidChecklist,
      releaseLedger: passingAndroidLedger,
    }, false),
  },
  {
    name: 'a present Android properties file fails closed without reading it',
    run: () => expectAndroidSigningCanonical('android-properties-present', {
      ...androidSigningCanonical,
      propertiesPresent: true,
    }, false),
  },
  {
    name: 'a present Android private-key candidate fails closed without reading it',
    run: () => expectAndroidSigningCanonical('android-key-present', {
      ...androidSigningCanonical,
      privateKeyCandidatePresent: true,
    }, false),
  },
  ...ANDROID_UPLOAD_ENV_NAMES.map((name) => ({
    name: `${name} presence fails closed without reading its value`,
    run: () => expectAndroidSigningCanonical(`android-env-${name}`, {
      ...androidSigningCanonical,
      environmentNamesPresent: { ...androidSigningCanonical.environmentNamesPresent, [name]: true },
    }, false),
  })),
  {
    name: 'an extra unrecognized Android signing environment name fails closed',
    run: () => expectAndroidSigningCanonical('android-extra-env-name', {
      ...androidSigningCanonical,
      environmentNamesPresent: { ...androidSigningCanonical.environmentNamesPresent, SYNTHETIC_UPLOAD_SECRET: false },
    }, false),
  },
  {
    name: 'weakening Android all-input readiness to any-input fails closed',
    run: () => expectAndroidSigningCanonical('android-readiness-any', {
      ...androidSigningCanonical,
      androidBuild: androidSigningCanonical.androidBuild.replace('.every { it }', '.any { it }'),
    }, false),
  },
  {
    name: 'removing one Android signing input from readiness fails closed',
    run: () => expectAndroidSigningCanonical('android-readiness-missing-input', {
      ...androidSigningCanonical,
      androidBuild: androidSigningCanonical.androidBuild.replace(', uploadKeyPassword].every', '].every'),
    }, false),
  },
  {
    name: 'negating the Android release-signing guard fails closed',
    run: () => expectAndroidSigningCanonical('android-guard-negation', {
      ...androidSigningCanonical,
      androidBuild: androidSigningCanonical.androidBuild.replace(
        'if (appReleaseRequested && !releaseSigningReady) {',
        'if (appReleaseRequested && releaseSigningReady) {',
      ),
    }, false),
  },
  {
    name: 'overwriting the computed Android release-request flag before the throw fails closed',
    run: () => expectAndroidSigningCanonical('android-request-flag-overwrite', {
      ...androidSigningCanonical,
      androidBuild: androidSigningCanonical.androidBuild.replace(
        'if (appReleaseRequested && !releaseSigningReady) {',
        'appReleaseRequested = false\n    if (appReleaseRequested && !releaseSigningReady) {',
      ),
    }, false),
  },
  {
    name: 'commenting out the Android signing exception fails closed',
    run: () => expectAndroidSigningCanonical('android-commented-exception', {
      ...androidSigningCanonical,
      androidBuild: androidSigningCanonical.androidBuild.replace(
        "throw new GradleException('Operator release signing is not configured. Set OPERATOR_UPLOAD_* or create android/operator-upload.properties from the example.')",
        "// throw new GradleException('Operator release signing is not configured. Set OPERATOR_UPLOAD_* or create android/operator-upload.properties from the example.')",
      ),
    }, false),
  },
  {
    name: 'a later Android properties Git-ignore negation fails closed',
    run: () => expectAndroidSigningCanonical('android-properties-negation', {
      ...androidSigningCanonical,
      gitignore: `${androidSigningCanonical.gitignore}\n!${ANDROID_UPLOAD_PROPERTIES_PATH}`,
    }, false),
  },
  {
    name: 'a later Android JKS Git-ignore negation fails closed',
    run: () => expectAndroidSigningCanonical('android-jks-negation', {
      ...androidSigningCanonical,
      gitignore: `${androidSigningCanonical.gitignore}\n!${ANDROID_UPLOAD_JKS_PATH}`,
    }, false),
  },
  {
    name: 'a later Android keystore Git-ignore negation fails closed',
    run: () => expectAndroidSigningCanonical('android-keystore-negation', {
      ...androidSigningCanonical,
      gitignore: `${androidSigningCanonical.gitignore}\n!${ANDROID_UPLOAD_KEYSTORE_PATH}`,
    }, false),
  },
  {
    name: 'missing effective Android ignore evidence fails closed',
    run: () => expectAndroidSigningCanonical('android-ignore-evidence', {
      ...androidSigningCanonical,
      jksIgnored: false,
    }, false),
  },
  {
    name: 'an Android credential path tracked by Git fails closed',
    run: () => expectAndroidSigningCanonical('android-tracked-evidence', {
      ...androidSigningCanonical,
      propertiesTracked: true,
    }, false),
  },
  {
    name: 'a duplicate Android signing section fails closed',
    run: () => expectAndroidSigningCanonical('android-duplicate-section', {
      ...androidSigningCanonical,
      externalArtifacts: duplicateAndroidSection,
    }, false),
  },
]

function runTests(cases, label) {
  let passed = 0
  for (const test of cases) {
    try {
      test.run()
      passed += 1
      console.log(`PASS ${test.name}`)
    } catch (error) {
      console.error(`FAIL ${test.name}`)
      console.error(error.stack || error.message)
    }
  }
  console.log(`\n${passed}/${cases.length} ${label} tests passed`)
  return passed === cases.length
}

const theologyPassed = runTests(tests, 'theology external-artifact')
const signingPassed = runTests(signingTests, 'desktop signing-backup')
const androidSigningPassed = runTests(androidSigningTests, 'Android upload-signing')
if (!theologyPassed || !signingPassed || !androidSigningPassed) process.exitCode = 1
