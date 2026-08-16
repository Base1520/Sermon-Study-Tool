import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  APPLE_IPAD_LANDSCAPE_DIMENSIONS,
  STORE_SCREENSHOT_SETS,
  appleScreenshotProvenanceIsConsistent,
  hasAndroidScreenshotCreativeHold,
  hasAppleScreenshotSubmissionHold,
  screenshotDimensionsMatch,
} from './screenshot-provenance.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const screenshotPlan = fs.readFileSync(path.join(root, 'store/screenshots.md'), 'utf8')
const releaseChecklist = fs.readFileSync(path.join(root, 'store/release-checklist.md'), 'utf8')
const readinessSource = fs.readFileSync(path.join(root, 'scripts/check-mobile-store-readiness.mjs'), 'utf8')

const tests = [
  {
    name: 'canonical Apple screenshot hold remains active until a build-6-proven iPad set is complete',
    run: () => assert.equal(hasAppleScreenshotSubmissionHold(screenshotPlan), true),
  },
  {
    name: 'canonical Android screenshot hold remains active until the tablet set is recaptured',
    run: () => assert.equal(hasAndroidScreenshotCreativeHold(screenshotPlan), true),
  },
  {
    name: 'a screenshot plan without the Android creative hold is locally clear',
    run: () => assert.equal(
      hasAndroidScreenshotCreativeHold('> Android tablet set ready: corrected release-candidate captures.'),
      false,
    ),
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
    name: 'the mobile readiness gate consumes the shared provenance consistency check',
    run: () => assert.match(
      readinessSource,
      /appleScreenshotProvenanceIsConsistent\(screenshotPlan, releaseChecklist\)/,
    ),
  },
  {
    name: 'the mobile readiness gate fails on the shared Android creative hold',
    run: () => assert.match(
      readinessSource,
      /check\(!hasAndroidScreenshotCreativeHold\(screenshotPlan\), 'Android screenshot set has no unresolved visual submission hold'\)/,
    ),
  },
  {
    name: 'the mobile readiness gate consumes the shared screenshot dimension contract',
    run: () => {
      assert.match(readinessSource, /for \(const \{ label, directory, dimensions,[^\n]+STORE_SCREENSHOT_SETS\)/)
      assert.match(readinessSource, /screenshotDimensionsMatch\(image, dimensions\)/)
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
