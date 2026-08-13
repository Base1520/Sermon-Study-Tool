const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

/**
 * Desktop and native mobile releases have independent version trains.
 *
 * The root package version identifies Electron artifacts. The store metadata,
 * server package, Xcode target and Gradle app identify the mobile candidate.
 * Requiring the desktop version to equal the mobile version makes a desktop-only
 * hotfix either rename an already-uploaded mobile build or turn the mobile gate
 * red for a difference that is intentional.
 */
export function mobileVersionContract({
  desktopVersion,
  storeVersion,
  serverVersion,
  serverLockVersion,
  serverLockRootVersion,
  xcodeReleaseSettings,
  androidBuild,
}) {
  return [
    {
      ok: SEMVER.test(desktopVersion),
      message: 'Desktop package version is a valid release version',
    },
    {
      ok: serverVersion === storeVersion,
      message: 'Server and store versions match',
    },
    {
      ok: serverLockVersion === serverVersion && serverLockRootVersion === serverVersion,
      message: 'Server lockfile version matches its package',
    },
    {
      ok: xcodeReleaseSettings.includes(`MARKETING_VERSION = ${storeVersion};`),
      message: 'Xcode Release marketing version matches metadata',
    },
    {
      ok: androidBuild.includes(`versionName "${storeVersion}"`),
      message: 'Android version name matches metadata',
    },
  ]
}
