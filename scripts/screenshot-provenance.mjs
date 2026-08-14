const APPLE_SCREENSHOT_HOLD = /^> Apple submission hold:/m
const OPEN_APPLE_SCREENSHOT_GATE = /^- \[ \] 🔴 Final iPhone and iPad submission screenshots/m

export function hasAppleScreenshotSubmissionHold(screenshotPlan) {
  return APPLE_SCREENSHOT_HOLD.test(screenshotPlan)
}

export function appleScreenshotProvenanceIsConsistent(screenshotPlan, releaseChecklist) {
  const appleScreenshotGateOpen = OPEN_APPLE_SCREENSHOT_GATE.test(releaseChecklist)
  return !appleScreenshotGateOpen || hasAppleScreenshotSubmissionHold(screenshotPlan)
}
