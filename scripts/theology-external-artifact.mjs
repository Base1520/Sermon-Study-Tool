export const THEOLOGY_DATABASE_PATH = 'resources/theology-retrieval/library.sqlite3'
export const THEOLOGY_DATABASE_SIZE = 7_016_448
export const THEOLOGY_DATABASE_SHA256 = '3acfde0f0dae33963cfb1302773d670b521982e616c76254ac7788f9ffefc134'
export const DESKTOP_LICENSE_PRIVATE_REPO_PATH = '.operator-license-key'
export const DESKTOP_LICENSE_PUBLIC_REPO_PATH = '.operator-license-key.pub'
export const ANDROID_UPLOAD_PROPERTIES_PATH = 'android/operator-upload.properties'
export const ANDROID_UPLOAD_JKS_PATH = 'android/operator-upload.jks'
export const ANDROID_UPLOAD_KEYSTORE_PATH = 'android/operator-upload.keystore'
export const ANDROID_UPLOAD_ENV_NAMES = [
  'OPERATOR_UPLOAD_STORE_FILE',
  'OPERATOR_UPLOAD_STORE_PASSWORD',
  'OPERATOR_UPLOAD_KEY_ALIAS',
  'OPERATOR_UPLOAD_KEY_PASSWORD',
]

const RIGHTS_PATH = 'resources/theology-retrieval/RIGHTS-NOTICE.txt'
const EXPECTED_BACKUP_LINE = '- Authoritative backup: **UNVERIFIED — Cole must choose and verify an off-machine master location before approving a release boundary as reproducible**'
const EXPECTED_CHECKLIST_ROW = '- [ ] The required out-of-band theology database has a verified off-machine master matching `store/external-artifacts.md`; a Git commit alone does not contain it.'
const CHECKLIST_MARKER = 'The required out-of-band theology database has a verified off-machine master matching `store/external-artifacts.md`'
const LEDGER_PREFIX = '| Out-of-band theology database |'
const EXPECTED_DOCKER_COPY = 'COPY resources/theology-retrieval ./resources/theology-retrieval'
const SIGNING_SAFETY_LINE = 'Do not place private-key contents or private-key hashes in this manifest. Record only the expected path, existence, purpose, and verified backup status.'
const DESKTOP_SIGNING_HEADING = '### Desktop license signing identity'
const ANDROID_SIGNING_HEADING = '### Android upload identity'
const EXPECTED_DESKTOP_BACKUP_LINE = '- Authoritative backup: **UNVERIFIED — loss of the private key prevents issuing compatible new licenses and cannot be repaired by rotating an existing install to a new key**'
const EXPECTED_DESKTOP_CHECKLIST_ROW = '- [ ] The desktop license signing key has a verified off-machine backup recorded in `store/external-artifacts.md`; existence on this Mac is not a backup.'
const DESKTOP_CHECKLIST_MARKER = 'The desktop license signing key has a verified off-machine backup recorded in `store/external-artifacts.md`'
const EXPECTED_ANDROID_BACKUP_CHECKLIST_ROW = '- [ ] When the Android upload identity is created, its encrypted off-machine backup is verified and recorded before the first Play upload.'
const ANDROID_BACKUP_CHECKLIST_MARKER = 'When the Android upload identity is created, its encrypted off-machine backup is verified and recorded before the first Play upload.'
const EXPECTED_ANDROID_BUNDLE_CHECKLIST_ROW = '- [ ] A signed Android release bundle compiles with the authorized upload key.'
const ANDROID_BUNDLE_CHECKLIST_MARKER = 'A signed Android release bundle compiles with the authorized upload key.'
const EXPECTED_ANDROID_RECOVERY_CHECKLIST_ROW = '- [ ] A new upload key is securely created or the existing key is recovered; encrypted backup and fingerprints are recorded outside Git.'
const ANDROID_RECOVERY_CHECKLIST_MARKER = 'A new upload key is securely created or the existing key is recovered; encrypted backup and fingerprints are recorded outside Git.'
const SIGNING_LEDGER_PREFIX = '| Out-of-band signing identities |'
const ANDROID_BUNDLE_LEDGER_PREFIX = '| Android App Bundle |'
const EXPECTED_ANDROID_LOCAL_STATE_LINE = '- Local state verified 2026-08-14 00:45 CDT: **NOT CONFIGURED IN THE CURRENT RELEASE ENVIRONMENT** — `android/operator-upload.properties`, the example\'s default `android/operator-upload.jks`, and all four supported `OPERATOR_UPLOAD_*` shell inputs are absent. With the Java/Android SDK/cache environment pinned by the `mobile:verify:android` package script, an offline `:app:bundleRelease --dry-run` configured the app, reached the fail-closed guard in `android/app/build.gradle`, and stopped before bundle tasks executed. This does not rule out an unconfigured key in an external backup.'
const EXPECTED_ANDROID_BACKUP_LINE = '- Authoritative backup: **NOT APPLICABLE YET — record and verify an encrypted off-machine backup at creation, before the first Play upload**'
const EXPECTED_ANDROID_SIGNING_ERROR = 'Operator release signing is not configured. Set OPERATOR_UPLOAD_* or create android/operator-upload.properties from the example.'

function theologySection(externalArtifacts) {
  const heading = '## Public-domain theology retrieval database'
  const start = externalArtifacts.indexOf(heading)
  if (start < 0) return ''
  const end = externalArtifacts.indexOf('\n## ', start + heading.length)
  return externalArtifacts.slice(start, end < 0 ? undefined : end)
}

function exactHeadingSection(text, heading) {
  const lines = text.split(/\r?\n/)
  const starts = lines
    .map((line, index) => line === heading ? index : -1)
    .filter((index) => index >= 0)
  if (starts.length !== 1) return ''
  const start = starts[0]
  const endOffset = lines
    .slice(start + 1)
    .findIndex((line) => /^#{1,3}\s/.test(line))
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset
  return lines.slice(start, end).join('\n')
}

function parseBundleManifest(bundleManifest) {
  try {
    return JSON.parse(bundleManifest)
  } catch {
    return null
  }
}

function globToRegExp(pattern) {
  let expression = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        while (pattern[index + 1] === '*') index += 1
        if (pattern[index + 1] === '/') {
          expression += '(?:.*/)?'
          index += 1
        } else {
          expression += '.*'
        }
      } else {
        expression += '[^/]*'
      }
      continue
    }
    if (character === '?') {
      expression += '[^/]'
      continue
    }
    if (character === '[') {
      const closing = pattern.indexOf(']', index + 1)
      if (closing > index + 1) {
        let characterClass = pattern.slice(index + 1, closing)
        if (characterClass.startsWith('!')) characterClass = `^${characterClass.slice(1)}`
        expression += `[${characterClass.replace(/\\/g, '\\\\')}]`
        index = closing
        continue
      }
    }
    expression += /[\\^$+?.()|{}\[\]]/.test(character) ? `\\${character}` : character
  }
  return new RegExp(`^${expression}$`)
}

function ignoreRuleMatchesPath(pattern, target) {
  const normalized = pattern
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/\/$/, '')
  if (!normalized) return false

  const candidates = target.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/'))
  const matcher = globToRegExp(normalized)
  if (normalized.includes('/')) return candidates.some((candidate) => matcher.test(candidate))
  return candidates.some((candidate) => matcher.test(candidate.split('/').at(-1)))
}

function pathIsIgnored(ignoreText, target) {
  let ignored = false
  for (const rawLine of ignoreText.split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('\\#') || line.startsWith('\\!')) line = line.slice(1)
    const negated = line.startsWith('!')
    const pattern = negated ? line.slice(1) : line
    if (ignoreRuleMatchesPath(pattern, target)) ignored = !negated
  }
  return ignored
}

function hasExactlyOneLine(text, prefix, expected) {
  const lines = text.split(/\r?\n/).filter((line) => line.startsWith(prefix))
  return lines.length === 1 && lines[0] === expected
}

function hasExactSource(source, expected) {
  return (
    source?.sourceId === expected.sourceId &&
    source?.rightsTier === 'public_domain' &&
    source?.canonicalUrl === expected.canonicalUrl &&
    JSON.stringify(source?.bookRanges) === JSON.stringify(expected.bookRanges) &&
    JSON.stringify(Object.keys(source || {}).sort()) === JSON.stringify(['bookRanges', 'canonicalUrl', 'rightsTier', 'sourceId'])
  )
}

function hasPositiveBackupClaim(ledgerRow) {
  const withoutCanonicalNegative = ledgerRow.replace(
    'desktop license private/public key files exist, but no off-machine backup is verified.',
    '',
  )
  return /\b(?:desktop[^|.]{0,100})?backup\b[^|.]{0,80}\b(?:verified|complete|completed|backed up)\b/i
    .test(withoutCanonicalNegative)
}

function activeSourceLines(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter(Boolean)
}

function hasExactlyOneActiveLine(lines, expected) {
  return lines.filter((line) => line === expected).length === 1
}

function hasExactlyOneActiveSequence(lines, expected) {
  let matches = 0
  for (let index = 0; index <= lines.length - expected.length; index += 1) {
    if (expected.every((line, offset) => lines[index + offset] === line)) matches += 1
  }
  return matches === 1
}

export function desktopLicenseSigningRecordsAreCanonical({
  externalArtifacts,
  gitignore,
  railwayignore,
  releaseChecklist,
  releaseLedger,
  privateKeyIgnored,
  publicKeyIgnored,
  privateKeyTracked,
  publicKeyTracked,
}) {
  const desktopSection = exactHeadingSection(externalArtifacts, DESKTOP_SIGNING_HEADING)
  const headingLines = externalArtifacts.split(/\r?\n/)
  const signingHeadingIndex = headingLines.indexOf('## Signing key material')
  const desktopHeadingIndex = headingLines.indexOf(DESKTOP_SIGNING_HEADING)
  const androidHeadingIndex = headingLines.indexOf(ANDROID_SIGNING_HEADING)
  const checklistRows = releaseChecklist
    .split(/\r?\n/)
    .filter((line) => line.includes(DESKTOP_CHECKLIST_MARKER))
  const ledgerRows = releaseLedger
    .split(/\r?\n/)
    .filter((line) => line.startsWith(SIGNING_LEDGER_PREFIX))
  const ledgerRow = ledgerRows[0] || ''
  const expectedDesktopLines = [
    ['- Private-key path:', '- Private-key path: `~/.operator-license-key`'],
    ['- Public-key path:', '- Public-key path: `~/.operator-license-key.pub`'],
    ['- Local state verified', '- Local state verified 2026-08-12: both files exist; contents were not read'],
    ['- Purpose:', '- Purpose: signs desktop license payloads accepted by existing Operator installs'],
    ['- Authoritative backup:', EXPECTED_DESKTOP_BACKUP_LINE],
  ]
  const railwaySecretPaths = [
    '.env',
    '.env.production',
    DESKTOP_LICENSE_PRIVATE_REPO_PATH,
    DESKTOP_LICENSE_PUBLIC_REPO_PATH,
    'synthetic-license-key',
    'electron/embedded-key.js',
  ]

  return (
    headingLines.filter((line) => line === '## Signing key material').length === 1 &&
    headingLines.filter((line) => line === DESKTOP_SIGNING_HEADING).length === 1 &&
    headingLines.filter((line) => line === ANDROID_SIGNING_HEADING).length === 1 &&
    signingHeadingIndex >= 0 &&
    signingHeadingIndex < desktopHeadingIndex &&
    desktopHeadingIndex < androidHeadingIndex &&
    headingLines.filter((line) => line === SIGNING_SAFETY_LINE).length === 1 &&
    expectedDesktopLines.every(([prefix, expected]) => hasExactlyOneLine(desktopSection, prefix, expected)) &&
    pathIsIgnored(gitignore, DESKTOP_LICENSE_PRIVATE_REPO_PATH) &&
    pathIsIgnored(gitignore, DESKTOP_LICENSE_PUBLIC_REPO_PATH) &&
    pathIsIgnored(gitignore, 'synthetic-license-key') &&
    pathIsIgnored(gitignore, 'electron/embedded-key.js') &&
    railwaySecretPaths.every((relative) => pathIsIgnored(railwayignore, relative)) &&
    privateKeyIgnored === true &&
    publicKeyIgnored === true &&
    privateKeyTracked === false &&
    publicKeyTracked === false &&
    checklistRows.length === 1 &&
    checklistRows[0] === EXPECTED_DESKTOP_CHECKLIST_ROW &&
    ledgerRows.length === 1 &&
    ledgerRow.includes('| BLOCKED ON BACKUP / CONFIGURATION —') &&
    ledgerRow.includes('desktop license private/public key files exist, but no off-machine backup is verified.') &&
    ledgerRow.includes('No private-key contents, passwords, alias values, or private-key hashes were read or recorded.') &&
    !hasPositiveBackupClaim(ledgerRow)
  )
}

export function androidUploadSigningRecordsAreCanonical({
  externalArtifacts,
  gitignore,
  releaseChecklist,
  releaseLedger,
  androidBuild,
  propertiesPresent,
  defaultJksPresent,
  defaultKeystorePresent,
  privateKeyCandidatePresent,
  environmentNamesPresent,
  propertiesIgnored,
  jksIgnored,
  keystoreIgnored,
  propertiesTracked,
  jksTracked,
  keystoreTracked,
}) {
  const androidSection = exactHeadingSection(externalArtifacts, ANDROID_SIGNING_HEADING)
  const headingLines = externalArtifacts.split(/\r?\n/)
  const signingHeadingIndex = headingLines.indexOf('## Signing key material')
  const desktopHeadingIndex = headingLines.indexOf(DESKTOP_SIGNING_HEADING)
  const androidHeadingIndex = headingLines.indexOf(ANDROID_SIGNING_HEADING)
  const activeBuildLines = activeSourceLines(androidBuild)
  const signingLedgerRows = releaseLedger
    .split(/\r?\n/)
    .filter((line) => line.startsWith(SIGNING_LEDGER_PREFIX))
  const bundleLedgerRows = releaseLedger
    .split(/\r?\n/)
    .filter((line) => line.startsWith(ANDROID_BUNDLE_LEDGER_PREFIX))
  const signingLedgerRow = signingLedgerRows[0] || ''
  const bundleLedgerRow = bundleLedgerRows[0] || ''
  const expectedEnvironmentNames = [...ANDROID_UPLOAD_ENV_NAMES].sort()
  const actualEnvironmentNames = Object.keys(environmentNamesPresent || {}).sort()
  const expectedAndroidLines = [
    ['- Expected local configuration:', `- Expected local configuration: \`${ANDROID_UPLOAD_PROPERTIES_PATH}\``],
    ['- Expected private key:', '- Expected private key: the `.jks` or `.keystore` file referenced by that configuration'],
    ['- Local state verified', EXPECTED_ANDROID_LOCAL_STATE_LINE],
    ['- Purpose:', '- Purpose: signs Android App Bundles uploaded to the existing Google Play listing'],
    ['- Authoritative backup:', EXPECTED_ANDROID_BACKUP_LINE],
  ]
  const checklistExpectations = [
    [ANDROID_BACKUP_CHECKLIST_MARKER, EXPECTED_ANDROID_BACKUP_CHECKLIST_ROW],
    [ANDROID_BUNDLE_CHECKLIST_MARKER, EXPECTED_ANDROID_BUNDLE_CHECKLIST_ROW],
    [ANDROID_RECOVERY_CHECKLIST_MARKER, EXPECTED_ANDROID_RECOVERY_CHECKLIST_ROW],
  ]
  const expectedBuildLines = [
    "def uploadPropertiesFile = rootProject.file('operator-upload.properties')",
    'if (uploadPropertiesFile.exists()) {',
    'System.getenv(environmentName) ?: uploadProperties.getProperty(propertyName)',
    "def uploadStoreFile = uploadValue('OPERATOR_UPLOAD_STORE_FILE', 'storeFile')",
    "def uploadStorePassword = uploadValue('OPERATOR_UPLOAD_STORE_PASSWORD', 'storePassword')",
    "def uploadKeyAlias = uploadValue('OPERATOR_UPLOAD_KEY_ALIAS', 'keyAlias')",
    "def uploadKeyPassword = uploadValue('OPERATOR_UPLOAD_KEY_PASSWORD', 'keyPassword')",
    'def releaseSigningReady = [uploadStoreFile, uploadStorePassword, uploadKeyAlias, uploadKeyPassword].every { it }',
    'signingConfig signingConfigs.release',
    'gradle.taskGraph.whenReady { graph ->',
    "it.project == project && it.name.toLowerCase().contains('release')",
    'if (appReleaseRequested && !releaseSigningReady) {',
    `throw new GradleException('${EXPECTED_ANDROID_SIGNING_ERROR}')`,
  ]
  const expectedReleaseGuardSequence = [
    'gradle.taskGraph.whenReady { graph ->',
    'def appReleaseRequested = graph.allTasks.any {',
    "it.project == project && it.name.toLowerCase().contains('release')",
    '}',
    'if (appReleaseRequested && !releaseSigningReady) {',
    `throw new GradleException('${EXPECTED_ANDROID_SIGNING_ERROR}')`,
    '}',
    '}',
  ]

  return (
    headingLines.filter((line) => line === '## Signing key material').length === 1 &&
    headingLines.filter((line) => line === DESKTOP_SIGNING_HEADING).length === 1 &&
    headingLines.filter((line) => line === ANDROID_SIGNING_HEADING).length === 1 &&
    signingHeadingIndex >= 0 &&
    signingHeadingIndex < desktopHeadingIndex &&
    desktopHeadingIndex < androidHeadingIndex &&
    headingLines.filter((line) => line === SIGNING_SAFETY_LINE).length === 1 &&
    expectedAndroidLines.every(([prefix, expected]) => hasExactlyOneLine(androidSection, prefix, expected)) &&
    expectedBuildLines.every((line) => hasExactlyOneActiveLine(activeBuildLines, line)) &&
    hasExactlyOneActiveSequence(activeBuildLines, expectedReleaseGuardSequence) &&
    activeBuildLines.filter((line) => line === 'if (releaseSigningReady) {').length === 2 &&
    propertiesPresent === false &&
    defaultJksPresent === false &&
    defaultKeystorePresent === false &&
    privateKeyCandidatePresent === false &&
    JSON.stringify(actualEnvironmentNames) === JSON.stringify(expectedEnvironmentNames) &&
    ANDROID_UPLOAD_ENV_NAMES.every((name) => environmentNamesPresent[name] === false) &&
    pathIsIgnored(gitignore, ANDROID_UPLOAD_PROPERTIES_PATH) &&
    pathIsIgnored(gitignore, ANDROID_UPLOAD_JKS_PATH) &&
    pathIsIgnored(gitignore, ANDROID_UPLOAD_KEYSTORE_PATH) &&
    propertiesIgnored === true &&
    jksIgnored === true &&
    keystoreIgnored === true &&
    propertiesTracked === false &&
    jksTracked === false &&
    keystoreTracked === false &&
    checklistExpectations.every(([marker, expected]) => {
      const rows = releaseChecklist.split(/\r?\n/).filter((line) => line.includes(marker))
      return rows.length === 1 && rows[0] === expected
    }) &&
    signingLedgerRows.length === 1 &&
    signingLedgerRow.includes('| BLOCKED ON BACKUP / CONFIGURATION —') &&
    signingLedgerRow.includes('For Android, the expected properties file, default keystore, and four supported shell inputs are absent;') &&
    signingLedgerRow.includes('This proves no upload identity is configured in the current release environment, not that no recoverable key exists elsewhere.') &&
    signingLedgerRow.includes('The manifest still requires an encrypted off-machine backup at creation or recovery before first Play upload.') &&
    signingLedgerRow.includes('No private-key contents, passwords, alias values, or private-key hashes were read or recorded.') &&
    bundleLedgerRows.length === 1 &&
    bundleLedgerRow.includes('| **BLOCKED / RUNTIME-PROVEN** —') &&
    bundleLedgerRow.includes('the four supported upload-signing inputs and expected local configuration/default key are absent.') &&
    bundleLedgerRow.includes(`fails exactly \`${EXPECTED_ANDROID_SIGNING_ERROR}\` before any bundle task executes.`) &&
    bundleLedgerRow.includes('A signed AAB, checksum, certificate fingerprints, backup, or Play receipt does not yet exist in the canonical record.')
  )
}

export function theologyExternalArtifactIsCanonical({
  externalArtifacts,
  databaseEvidence,
  rightsNotice,
  bundleManifest,
  gitignore,
  dockerignore,
  railwayignore,
  dockerfile,
  releaseChecklist,
  releaseLedger,
  databaseIgnored,
  databaseTracked,
}) {
  const section = theologySection(externalArtifacts)
  const manifest = parseBundleManifest(bundleManifest)
  const sources = manifest?.sources || []
  const ledgerRows = releaseLedger
    .split(/\r?\n/)
    .filter((line) => line.startsWith(LEDGER_PREFIX))
  const ledgerRow = ledgerRows[0] || ''
  const checklistRows = releaseChecklist
    .split(/\r?\n/)
    .filter((line) => line.includes(CHECKLIST_MARKER))
  const activeDockerCopies = dockerfile
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line === EXPECTED_DOCKER_COPY)
  const expectedSources = [
    {
      sourceId: 'gutenberg-50857-lightfoot-colossians-philemon',
      canonicalUrl: 'https://www.gutenberg.org/ebooks/50857',
      bookRanges: {
        colossians: [{ start: 0, end: 886 }],
        philemon: [{ start: 947, end: 1056 }],
      },
    },
    {
      sourceId: 'gutenberg-37345-maclaren-colossians-philemon',
      canonicalUrl: 'https://www.gutenberg.org/ebooks/37345',
      bookRanges: {
        colossians: [{ start: 0, end: 641 }],
        philemon: [{ start: 643, end: 766 }],
      },
    },
  ]

  const expectedManifestLines = [
    ['- Repository-relative destination:', `- Repository-relative destination: \`${THEOLOGY_DATABASE_PATH}\``],
    ['- Size:', `- Size: ${THEOLOGY_DATABASE_SIZE.toLocaleString('en-US')} bytes`],
    ['- SHA-256:', `- SHA-256: \`${THEOLOGY_DATABASE_SHA256}\``],
    ['- Git state:', '- Git state: ignored by `.gitignore`; absent from tracked files'],
    ['- Deploy state:', '- Deploy state: included by `.dockerignore` and `.railwayignore` rules when deploying from the complete working directory'],
    ['- Rights record:', `- Rights record: \`${RIGHTS_PATH}\``],
    ['- Contents:', '- Contents: indexed excerpts from the public-domain editions named in the rights record; no licensed, owned-private, or vault-synthesis sources'],
    ['- Authoritative backup:', EXPECTED_BACKUP_LINE],
  ]

  return (
    externalArtifacts.split('## Public-domain theology retrieval database').length === 2 &&
    expectedManifestLines.every(([prefix, expected]) => hasExactlyOneLine(section, prefix, expected)) &&
    databaseEvidence?.size === THEOLOGY_DATABASE_SIZE &&
    databaseEvidence?.sha256 === THEOLOGY_DATABASE_SHA256 &&
    databaseIgnored === true &&
    databaseTracked === false &&
    pathIsIgnored(gitignore, THEOLOGY_DATABASE_PATH) &&
    !pathIsIgnored(dockerignore, THEOLOGY_DATABASE_PATH) &&
    !pathIsIgnored(railwayignore, THEOLOGY_DATABASE_PATH) &&
    activeDockerCopies.length === 1 &&
    rightsNotice.includes('This bundle contains indexed excerpts from verified public-domain editions only.') &&
    rightsNotice.includes('It does not include licensed, owned-private, or vault-synthesis sources.') &&
    rightsNotice.includes('Project Gutenberg eBook 50857') &&
    rightsNotice.includes('https://www.gutenberg.org/ebooks/50857') &&
    rightsNotice.includes('Project Gutenberg eBook 37345') &&
    rightsNotice.includes('https://www.gutenberg.org/ebooks/37345') &&
    JSON.stringify(Object.keys(manifest || {}).sort()) === JSON.stringify(['bundleType', 'generatedFrom', 'sources']) &&
    manifest?.bundleType === 'public_domain_only' &&
    manifest?.generatedFrom === 'Tools/theology-retrieval' &&
    sources.length === 2 &&
    expectedSources.every((expected) => sources.some((source) => hasExactSource(source, expected))) &&
    checklistRows.length === 1 &&
    checklistRows[0] === EXPECTED_CHECKLIST_ROW &&
    ledgerRows.length === 1 &&
    ledgerRow.includes('| BLOCKED ON BACKUP DECISION —') &&
    ledgerRow.includes(`${THEOLOGY_DATABASE_SIZE.toLocaleString('en-US')}-byte database`) &&
    ledgerRow.includes(`SHA-256 \`${THEOLOGY_DATABASE_SHA256}\``) &&
    /no off-machine authoritative backup has been verified/i.test(ledgerRow) &&
    ledgerRow.includes('A source commit alone is not a reproducible release.')
  )
}
