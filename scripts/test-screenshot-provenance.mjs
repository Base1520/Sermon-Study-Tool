import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appleScreenshotProvenanceIsConsistent,
  hasAppleScreenshotSubmissionHold,
} from './screenshot-provenance.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const screenshotPlan = fs.readFileSync(path.join(root, 'store/screenshots.md'), 'utf8')
const releaseChecklist = fs.readFileSync(path.join(root, 'store/release-checklist.md'), 'utf8')
const readinessSource = fs.readFileSync(path.join(root, 'scripts/check-mobile-store-readiness.mjs'), 'utf8')

const tests = [
  {
    name: 'canonical Apple screenshot hold remains active while the iPad captures predate build 4',
    run: () => assert.equal(hasAppleScreenshotSubmissionHold(screenshotPlan), true),
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
