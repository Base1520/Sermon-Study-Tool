const APPLE_SCREENSHOT_HOLD = /^> Apple submission hold:/m
const ANDROID_SCREENSHOT_HOLD = /^> Android creative hold:/m
const OPEN_APPLE_SCREENSHOT_GATE = /^- \[ \] 🔴 Final iPhone and iPad submission screenshots/m

export const APPLE_IPAD_LANDSCAPE_DIMENSIONS = Object.freeze({ width: 2732, height: 2048 })

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
