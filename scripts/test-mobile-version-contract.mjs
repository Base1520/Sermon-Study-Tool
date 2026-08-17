import { readFileSync } from 'node:fs'
import { mobileVersionContract } from './mobile-version-contract.mjs'

let passed = 0
let failed = 0

function check(condition, message) {
  if (condition) {
    passed += 1
    console.log(`PASS  ${message}`)
  } else {
    failed += 1
    console.error(`FAIL  ${message}`)
  }
}

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
check(
  packageLock.version === packageJson.version && packageLock.packages?.['']?.version === packageJson.version,
  'root package and both lockfile declarations match',
)

const valid = {
  desktopVersion: '1.4.5',
  desktopLockVersion: '1.4.5',
  desktopLockRootVersion: '1.4.5',
  storeVersion: '1.4.2',
  serverVersion: '1.4.2',
  serverLockVersion: '1.4.2',
  serverLockRootVersion: '1.4.2',
  xcodeReleaseSettings: 'MARKETING_VERSION = 1.4.2;',
  androidBuild: 'versionName "1.4.2"',
}

const baseline = mobileVersionContract(valid)
check(baseline.length === 6, 'contract keeps six independently named version checks')
check(baseline.every(({ ok }) => ok), 'desktop 1.4.5 and its lockfile are valid while the mobile candidate remains 1.4.2')
check(
  !baseline.some(({ message }) => message === 'Package and store versions match'),
  'mobile readiness no longer requires desktop and store versions to match',
)

const cases = [
  ['malformed desktop version fails closed', { desktopVersion: 'release-next' }, ['Desktop package version is a valid release version', 'Desktop lockfile version matches its package']],
  ['desktop lock top-level drift is rejected', { desktopLockVersion: '1.4.4' }, ['Desktop lockfile version matches its package']],
  ['desktop lock root drift is rejected', { desktopLockRootVersion: '1.4.4' }, ['Desktop lockfile version matches its package']],
  ['server drift is rejected', { serverVersion: '1.4.1' }, ['Server and store versions match', 'Server lockfile version matches its package']],
  ['server lock drift is rejected', { serverLockRootVersion: '1.4.1' }, ['Server lockfile version matches its package']],
  ['Xcode Release drift is rejected', { xcodeReleaseSettings: 'MARKETING_VERSION = 1.4.1;' }, ['Xcode Release marketing version matches metadata']],
  ['Android drift is rejected', { androidBuild: 'versionName "1.4.1"' }, ['Android version name matches metadata']],
]

for (const [label, mutation, expectedFailures] of cases) {
  const results = mobileVersionContract({ ...valid, ...mutation })
  const failures = results.filter(({ ok }) => !ok).map(({ message }) => message)
  check(
    JSON.stringify(failures) === JSON.stringify(expectedFailures),
    `${label} with exactly its dependent assertions`,
  )
}

console.log(`\n${passed}/${passed + failed} passed`)
if (failed) process.exit(1)
