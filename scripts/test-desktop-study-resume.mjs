#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const require = createRequire(import.meta.url)
const { resumeDecision, createSingleFlight } = require('../electron/hosted/resume-policy.js')

let passed = 0
let failed = 0
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ok   ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\nRESTORE-ONLY POLICY')
const verified = { verification: { status: 'ok' }, marker: 'document' }
check('a verified local document wins without hosting or a study id',
  resumeDecision({ cachedDocument: verified, hostedEnabled: false, studyId: null }) === 'cached')
check('an unfinished cache resumes only with hosting and a remembered id',
  resumeDecision({ cachedDocument: { verification: { status: 'pending' } }, hostedEnabled: true, studyId: 'study-1' }) === 'resume')
check('a malformed cache is never accepted as completed',
  resumeDecision({ cachedDocument: { document: true }, hostedEnabled: false, studyId: null }) === 'none')
check('a missing id cannot create hosted work during restore',
  resumeDecision({ cachedDocument: null, hostedEnabled: true, studyId: null }) === 'none')
check('local mode cannot generate work during restore',
  resumeDecision({ cachedDocument: null, hostedEnabled: false, studyId: 'study-1' }) === 'none')

console.log('\nHOSTED REQUEST SINGLE-FLIGHT')
const flights = createSingleFlight()
let starts = 0
let release
const held = new Promise(resolve => { release = resolve })
const first = flights.run('doc|study-1', async () => { starts += 1; await held; return 'finished' })
const second = flights.run('doc|study-1', async () => { starts += 1; return 'duplicate' })
check('two concurrent callers start one hosted request', starts === 0)
await Promise.resolve()
check('the first request starts exactly once', starts === 1)
check('both callers receive the same promise', first === second)
release()
check('both callers receive the finished document',
  (await first) === 'finished' && (await second) === 'finished')

let failedStarts = 0
try {
  await flights.run('retryable', async () => { failedStarts += 1; throw new Error('offline') })
} catch {}
await flights.run('retryable', async () => { failedStarts += 1; return 'retried' })
check('a failed flight is evicted so one explicit retry can run', failedStarts === 2)

console.log('\nREAL-PATH WIRING')
const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8')
const client = fs.readFileSync(path.join(root, 'electron/hosted/client.js'), 'utf8')
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')

check('the existing plain-read IPC accepts an explicit restore-only request',
  /resumeOnly\s*=\s*false/.test(main))
check('restore-only refuses missing analysis before generation',
  /resumeOnly\s*&&\s*!analysis[\s\S]{0,180}return null/.test(main))
check('restore-only none returns before the hosted branch', (() => {
  const stop = main.indexOf("if (resumeOnly && restore === 'none')")
  const hostedBranch = main.indexOf('if (hostedEnabled)', stop)
  return stop >= 0 && hostedBranch > stop && main.slice(stop, hostedBranch).includes('return null')
})())
check('verified cache is served even when restoreOnly also carries force',
  /restore === 'cached'\s*&&\s*\(!force \|\| resumeOnly\)/.test(main))
check('hosted reads use the single-flight cost boundary',
  /hostedPlainReadFlights\.run\([\s\S]{0,260}hosted\.plainRead/.test(main))
check('the completed authoritative id is retained for Scholar and Ask',
  /completedStudyId\) rememberStudy\(reference, completedStudyId, \{ finished: true \}\)/.test(main) &&
    !/forgetStudy\s*\(/.test(main))
check('the hosted client captures the done-frame id and returns it with the document',
  /completedStudyId = msg\.studyId \?\? completedStudyId/.test(client) &&
    /return \{ document, studyId: completedStudyId \}/.test(client))
check('restore-only intent crosses main into the hosted client', (() => {
  const callStart = main.indexOf('() => hosted.plainRead(store, {')
  const callEnd = main.indexOf('\n        }),', callStart)
  if (callStart < 0 || callEnd < 0) return false
  return /\n\s*resumeOnly,/.test(main.slice(callStart, callEnd))
})())
check('the hosted client serializes only an explicit restore-only boolean',
  /resumeOnly\s*=\s*false/.test(client) &&
    /restoreOnly:\s*resumeOnly\s*===\s*true/.test(client) &&
    !/\n\s*resumeOnly:\s*resumeOnly\s*===\s*true/.test(client))
check('launch restore is guarded against StrictMode replay',
  /if \(sessionRestoreStarted\.current\) return[\s\S]{0,100}sessionRestoreStarted\.current = true/.test(app))
check('launch and history open both use the restore-only path',
  (app.match(/resumeStoredStudy\(entry, studyToken\)/g) || []).length === 2 &&
    /resumeOnly:\s*true/.test(app))
check('automatic generation stays suppressed until a deliberate PLAIN action',
  /if \(suppressAutomaticRead\.current\) return/.test(app) &&
    /if \(!plainMode\) suppressAutomaticRead\.current = false/.test(app))
check('keyless hosted analyze refreshes after asynchronous capability detection', (() => {
  const start = app.indexOf('const handleAnalyze = useCallback')
  const end = app.indexOf('\n\n  const handleLoadHistory', start)
  if (start < 0 || end < 0) return false
  const callback = app.slice(start, end)
  const dependencies = callback.match(/\},\s*\[([^\]]*)\]\)\s*$/)?.[1]
    .split(',')
    .map(value => value.trim()) ?? []
  return /if \(!apiKey && !hostedOn\)/.test(callback) &&
    dependencies.includes('apiKey') &&
    dependencies.includes('hostedOn')
})())
check('a stale background result cannot overwrite a newer study or request',
  /activeStudyToken\.current !== studyToken/.test(app) &&
    /plainRequestRef\.current !== requestId/.test(app))
check('manual retry explicitly releases the restore suppression',
  /onRetry=\{\(\) => \{[\s\S]{0,120}suppressAutomaticRead\.current = false[\s\S]{0,120}setPlainNonce/.test(app))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
