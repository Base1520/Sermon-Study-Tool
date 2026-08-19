import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const canonical = {
  packet: read('store/desktop-restored-study-field-test.md'),
  readme: read('store/README.md'),
  checklist: read('store/release-checklist.md'),
  ledger: read('store/release-ledger.md'),
  packageJson: read('package.json'),
  historyPanel: read('src/components/HistoryPanel.tsx'),
  studyHistory: read('src/components/StudyHistory.tsx'),
  scholarChat: read('src/components/ScholarChat.tsx'),
  app: read('src/App.tsx'),
  electronMain: read('electron/main.js'),
  readResume: read('server/src/read-resume.js'),
  serverIndex: read('server/src/index.js'),
}

const command = 'node scripts/test-desktop-restored-study-field-test.mjs'

function validate(input) {
  const failures = []
  const packetCompact = input.packet.replace(/\s+/g, ' ')

  if (!input.packet.includes('Stage A must not reserve a fresh study')
    || !input.packet.includes('Do not click Run, Analyze, or any equivalent regeneration control.')) {
    failures.push('field packet keeps Stage A from reserving or manually regenerating a fresh study')
  }

  const resumeStart = input.app.indexOf('const resumeStoredStudy')
  const resumeEnd = input.app.indexOf('\n\n  useEffect(', resumeStart)
  const resumeSource = resumeStart >= 0 && resumeEnd > resumeStart
    ? input.app.slice(resumeStart, resumeEnd)
    : ''
  const readRouteStart = input.serverIndex.indexOf("app.post('/v1/read'")
  const readRouteEnd = input.serverIndex.indexOf("\napp.post('/v1/ask'", readRouteStart)
  const readRouteSource = readRouteStart >= 0 && readRouteEnd > readRouteStart
    ? input.serverIndex.slice(readRouteStart, readRouteEnd)
    : ''
  if (!input.packet.includes('`resumeOnly` may finish an already-reserved hosted reading, call the provider, incur operator spend, and change server reading state.')
    || !input.packet.includes('Do **not** run Stage A without Cole\'s fresh action-time approval for that possible completion work.')
    || !input.packet.includes('After Cole gives fresh action-time approval for Stage A\'s possible completion work:')
    || !resumeSource.includes('resumeOnly: true')
    || !readRouteSource.includes('engine.runPlainRead')) {
    failures.push('field packet truthfully approval-gates possible Stage A completion spend')
  }

  if (!input.packet.includes('**BLOCKED before Stage A.**')
    || !input.packet.includes('No package receipt binds those changes to that installed app.')
    || !input.packet.includes('Do not execute this packet until a non-secret candidate receipt records the installed app version/build, package SHA-256, reviewed source commit, and current server deployment/release identity.')
    || input.packet.includes('Target the currently installed **The Operator** desktop app')) {
    failures.push('field packet refuses an unbound installed binary and requires candidate provenance')
  }

  if (!input.packet.includes('Stage B sends one Scholar request and may consume one paid Ask.')
    || !input.packet.includes('Do **not** run Stage B without Cole\'s fresh action-time approval.')
    || !input.packet.includes('After Cole gives fresh action-time approval for one paid Ask:')) {
    failures.push('field packet requires fresh action-time approval for one potentially paid Scholar request')
  }

  if (!input.packet.includes('`In one sentence, what is the main contrast in Romans 8:1-4?`')
    || !input.packet.includes('Send it once. Do not retry automatically.')
    || !input.packet.includes('retry performed: NO')) {
    failures.push('field packet pins one fixed Scholar question and forbids automatic retry')
  }

  const requiredOutcomes = [
    'Checking study context…',
    'Speaking generally · this chat is not grounded in Romans 8:1-4.',
    'Record Stage B FAIL even if the answer sounds correct.',
    'STUDY_READING_REQUIRED',
    'STUDY_NOT_FOUND',
    'STUDY_RESTORE_UNAVAILABLE',
    'That saved study cannot be resumed. Run the reading again when you want it rebuilt.',
    'Do not regenerate as part of this test.',
    'Any purchase, access-code, API-key, or device-link prompt',
  ]
  if (!requiredOutcomes.every((value) => input.packet.includes(value))) {
    failures.push('field packet retains fail-closed UI and server outcomes')
  }

  const resultFields = [
    'candidate installed app: <marketing version> (<build>)',
    'candidate package/source receipt: <non-secret package SHA-256 + reviewed source commit pointer>',
    'server identity at run: <non-secret deployment/version/stage pointer>',
    'Stage A approval: APPROVED AT <time> / NOT APPROVED',
    'Stage A restore: PASS / FAIL',
    'Stage A pre-send context badge: <exact visible text>',
    'Stage B approval: APPROVED AT <time> / NOT APPROVED',
    'Stage B Scholar: PASS / FAIL / NOT RUN',
    'Stage B post-answer context badge: <exact visible text> / NOT RUN',
    'visible result or exact error: <non-secret text>',
    'screenshot captured: YES / NO (must contain no credentials or private notes)',
  ]
  if (!resultFields.every((value) => input.packet.includes(value))) {
    failures.push('field packet separates restore, approval, Scholar, and value-safe evidence')
  }

  if (!input.readme.includes('`desktop-restored-study-field-test.md`')
    || !input.checklist.includes('- [ ] Owned Ask and specialist requests distinguish a study whose reading has not finished from a missing or unauthorized study before reserving model spend.')
    || !input.checklist.includes('Stage A and Stage B remain **NOT RUN**')
    || !input.ledger.includes('`store/desktop-restored-study-field-test.md` is the canonical physical UI packet')
    || !input.ledger.includes('Stage A and Stage B remain `NOT RUN`')) {
    failures.push('canonical records route the packet and keep the physical result open')
  }

  if (!input.packet.includes('automation access blocked before Stage A; no product verdict')
    || !input.packet.includes('Computer Use returned no accessibility state and timed out/reset')
    || !input.packet.includes('No click, typing, history selection, regeneration, or Scholar request occurred.')) {
    failures.push('field packet distinguishes automation blockage from an Operator verdict')
  }

  const groundedBadgeSource = "Study attached · ${analysis?.reference ?? 'finished study'}"
  const generalBadgeSource = 'Speaking generally · this chat is not grounded in ${analysis.reference}.'
  if (!input.scholarChat.includes(groundedBadgeSource)
    || !input.scholarChat.includes(generalBadgeSource)
    || !input.packet.includes('Wait for the context badge to settle at exactly `Study attached · Romans 8:1-4`.')
    || !input.packet.includes('Stage A fails and Stage B must not be sent.')
    || !packetCompact.includes('Stage A passes only if the saved study opens without a fresh-study prompt or restore error, Scholar\'s input is available, and the pre-send badge is exactly `Study attached · Romans 8:1-4`.')
    || !input.packet.includes('confirm the context badge still reads exactly `Study attached · Romans 8:1-4`')
    || !packetCompact.includes('Stage B passes only if Scholar returns a non-empty answer, the badge reads exactly `Study attached · Romans 8:1-4` both before and after the send')
    || input.packet.includes('| A non-empty Scholar answer | End-to-end restored-study → Scholar field path passes')) {
    failures.push('field packet requires the authoritative grounded badge before and after the paid Ask')
  }

  const labelPairs = [
    ['PASSAGE HISTORY', input.historyPanel],
    ['Search your studies', input.studyHistory],
    ['Ask about the passage, a clause, a cultural note…', input.scholarChat],
    ['That saved study cannot be resumed. Run the reading again when you want it rebuilt.', input.readResume],
  ]
  // Standing-chat mode (Cole, 2026-08-15): a missing binding sends null and
  // answers generally — the old refusal is retired and must stay retired, and
  // the null-send marker is the wiring that replaced it.
  if (input.electronMain.includes('Open a finished study from your library')) {
    failures.push('the retired Scholar refusal must not return to electron/main.js')
  }
  if (!input.electronMain.includes('studyId: studyId ?? null')) {
    failures.push('electron/main.js must send the null studyId that makes the Scholar a standing chat')
  }
  // The other three specialists (Clint, 2026-08-19): on a hosted build the
  // agent-chat handler must reach hosted.sermonAssist with the agent role before
  // it can ever ask for a local Anthropic key — otherwise every Exegetical /
  // Theological / Homiletical question answers with the "not on our servers
  // yet" dead end while the Scholar works.
  const agentHandlerStart = input.electronMain.indexOf("ipcMain.handle('agent-chat'")
  const agentHandler = agentHandlerStart === -1 ? '' : input.electronMain.slice(agentHandlerStart, agentHandlerStart + 6000)
  const hostedAt = agentHandler.indexOf('hosted.sermonAssist(store, {')
  const keyAt = agentHandler.indexOf("requireSecret('ANTHROPIC_KEY'")
  if (hostedAt === -1 || keyAt === -1 || hostedAt > keyAt
    || !agentHandler.slice(0, hostedAt).includes('if (hosted.hostedBaseUrl()) {')
    || !agentHandler.slice(hostedAt, keyAt).includes('agent: role')) {
    failures.push('electron/main.js agent-chat must route exegetical/theological/homiletical through hosted.sermonAssist before any local key lookup')
  }
  if (input.packet.includes('emits the finished-study/library message when it is absent')
    || !input.packet.includes('when it is absent, the current standing-chat path sends a null ID and answers generally instead of emitting the retired library refusal.')) {
    failures.push('field packet source basis matches the current standing-chat behavior')
  }
  if (labelPairs.some(([value, source]) => (
    !source.toLocaleLowerCase().includes(value.toLocaleLowerCase())
    || !input.packet.toLocaleLowerCase().includes(value.toLocaleLowerCase())
  ))) {
    failures.push('field packet UI labels and failure copy match current implementation')
  }

  let scripts = {}
  try {
    scripts = JSON.parse(input.packageJson).scripts ?? {}
  } catch {
    failures.push('field-packet contract package wiring is valid JSON')
  }
  const directSteps = (value = '') => value
    .split(/\s*&&\s*/)
    .map((step) => step.trim())
  const countDirectStep = (value = '') => directSteps(value)
    .filter((step) => step === command).length
  // Counting the exact text is not enough: `true # && node ...` leaves a
  // parser-visible step that the shell comments out, and `exit 0 && node ...`
  // returns success before it. These aggregate release commands deliberately
  // need only direct node/bash/tsc steps, so reject control flow, comments,
  // redirects, wrappers, assignments, and other shell syntax fail-closed.
  const safeDirectStep = (step) => (
    /^(?:node|bash)(?: [A-Za-z0-9_./:@+=-]+)+$/.test(step)
    || step === 'tsc --noEmit'
  )
  const isSafeDirectChain = (value = '') => {
    const steps = directSteps(value)
    return steps.length > 0 && steps.every(safeDirectStep)
  }
  if (scripts['test:desktop-restored-study-field-test'] !== command
    || countDirectStep(scripts['mobile:store:check']) !== 1
    || countDirectStep(scripts['test:release']) !== 1
    || !isSafeDirectChain(scripts['mobile:store:check'])
    || !isSafeDirectChain(scripts['test:release'])) {
    failures.push('canonical store and release commands run the field-packet contract directly')
  }

  return failures
}

function replaceRequired(source, target, replacement) {
  const mutated = source.replace(target, replacement)
  assert.notEqual(mutated, source, `mutation did not change input: ${String(target)}`)
  return mutated
}

function expectFailures(input, failures) {
  assert.deepEqual(validate(input), failures)
}

let passed = 0
let failed = 0

function check(name, run) {
  try {
    run()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  FAIL ${name}`)
    console.error(error instanceof Error ? error.message : String(error))
  }
}

check('canonical desktop restored-study field packet is fail-closed without claiming runtime proof', () => {
  expectFailures(canonical, [])
})

check('allowing Stage A to regenerate fails closed', () => {
  const packet = replaceRequired(
    canonical.packet,
    'Stage A must not reserve a fresh study',
    'Stage A may reserve a fresh study',
  )
  expectFailures({ ...canonical, packet }, [
    'field packet keeps Stage A from reserving or manually regenerating a fresh study',
  ])
})

check('hiding Stage A provider completion spend fails closed', () => {
  const packet = replaceRequired(
    canonical.packet,
    '`resumeOnly` may finish an already-reserved hosted reading, call the provider, incur operator spend, and change server reading state.',
    '`resumeOnly` is guaranteed to stay local and cannot call a provider.',
  )
  expectFailures({ ...canonical, packet }, [
    'field packet truthfully approval-gates possible Stage A completion spend',
  ])
})

check('targeting unbound installed bytes fails closed', () => {
  const packet = replaceRequired(
    canonical.packet,
    'Target only the installed **The Operator** candidate named in the recorded package/source receipt',
    'Target the currently installed **The Operator** desktop app',
  )
  expectFailures({ ...canonical, packet }, [
    'field packet refuses an unbound installed binary and requires candidate provenance',
  ])
})

check('dropping fresh approval for the potentially paid Ask fails closed', () => {
  const packet = replaceRequired(
    canonical.packet,
    'Do **not** run Stage B without Cole\'s fresh action-time approval.',
    'Run Stage B whenever Stage A opens.',
  )
  expectFailures({ ...canonical, packet }, [
    'field packet requires fresh action-time approval for one potentially paid Scholar request',
  ])
})

check('allowing automatic Scholar retry fails closed', () => {
  const packet = replaceRequired(
    canonical.packet,
    'Send it once. Do not retry automatically.',
    'Retry automatically until Scholar answers.',
  )
  expectFailures({ ...canonical, packet }, [
    'field packet pins one fixed Scholar question and forbids automatic retry',
  ])
})

check('dropping the unavailable-restore stop condition fails closed', () => {
  const packet = replaceRequired(canonical.packet, 'STUDY_RESTORE_UNAVAILABLE', 'RESTORE_FAILED')
  expectFailures({ ...canonical, packet }, [
    'field packet retains fail-closed UI and server outcomes',
  ])
})

check('removing approval evidence from the result record fails closed', () => {
  const packet = replaceRequired(
    canonical.packet,
    'Stage B approval: APPROVED AT <time> / NOT APPROVED',
    'Stage B approval: assumed',
  )
  expectFailures({ ...canonical, packet }, [
    'field packet separates restore, approval, Scholar, and value-safe evidence',
  ])
})

check('removing candidate identity from the result record fails closed', () => {
  const packet = replaceRequired(
    canonical.packet,
    'candidate package/source receipt: <non-secret package SHA-256 + reviewed source commit pointer>',
    'candidate package/source receipt: unknown',
  )
  expectFailures({ ...canonical, packet }, [
    'field packet separates restore, approval, Scholar, and value-safe evidence',
  ])
})

check('accepting the Scholar input without a grounded badge fails closed', () => {
  const packet = replaceRequired(
    canonical.packet,
    'Stage A passes only if the saved study opens without a fresh-study prompt or restore error, Scholar\'s input is available, and the pre-send badge is exactly `Study attached · Romans 8:1-4`.',
    'Stage A passes when the saved study opens and Scholar\'s input is available.',
  )
  expectFailures({ ...canonical, packet }, [
    'field packet requires the authoritative grounded badge before and after the paid Ask',
  ])
})

check('accepting any non-empty general answer fails closed', () => {
  const packet = replaceRequired(
    canonical.packet,
    'Stage B passes only if Scholar returns a non-empty answer, the badge reads exactly `Study attached · Romans 8:1-4` both before and after the send, and none of the failure copies below appear.',
    'Stage B passes whenever Scholar returns a non-empty answer.',
  )
  expectFailures({ ...canonical, packet }, [
    'field packet requires the authoritative grounded badge before and after the paid Ask',
  ])
})

check('restoring the retired finished-study refusal to the source basis fails closed', () => {
  const packet = replaceRequired(
    canonical.packet,
    'when it is absent, the current standing-chat path sends a null ID and answers generally instead of emitting the retired library refusal.',
    'when it is absent, electron/main.js emits the finished-study/library message.',
  )
  expectFailures({ ...canonical, packet }, [
    'field packet source basis matches the current standing-chat behavior',
  ])
})

check('dropping the hosted branch from agent-chat fails closed', () => {
  const electronMain = replaceRequired(
    canonical.electronMain,
    "  if (hosted.hostedBaseUrl()) {\n    const role = ['exegetical', 'theological', 'homiletical', 'scholar'].includes(agentType)",
    "  if (false) {\n    const role = ['exegetical', 'theological', 'homiletical', 'scholar'].includes(agentType)",
  )
  expectFailures({ ...canonical, electronMain }, [
    'electron/main.js agent-chat must route exegetical/theological/homiletical through hosted.sermonAssist before any local key lookup',
  ])
})

check('sending the wrong agent role from agent-chat fails closed', () => {
  const electronMain = replaceRequired(
    canonical.electronMain,
    "        agent: role,\n        question,\n        history,\n      })\n      // AgentChat assigns",
    "        agent: 'scholar',\n        question,\n        history,\n      })\n      // AgentChat assigns",
  )
  expectFailures({ ...canonical, electronMain }, [
    'electron/main.js agent-chat must route exegetical/theological/homiletical through hosted.sermonAssist before any local key lookup',
  ])
})

check('asking for the local key before the hosted agent branch fails closed', () => {
  const electronMain = replaceRequired(
    canonical.electronMain,
    "  requireFeature('gen.agents')\n\n  // ── HOSTED",
    "  requireFeature('gen.agents')\n  const apiKey = requireSecret('ANTHROPIC_KEY', 'Anthropic')\n\n  // ── HOSTED",
  )
  expectFailures({ ...canonical, electronMain }, [
    'electron/main.js agent-chat must route exegetical/theological/homiletical through hosted.sermonAssist before any local key lookup',
  ])
})

check('promoting the runtime parent while both stages are unrun fails closed', () => {
  const checklist = replaceRequired(
    canonical.checklist,
    '- [ ] Owned Ask and specialist requests distinguish a study whose reading has not finished from a missing or unauthorized study before reserving model spend.',
    '- [x] Owned Ask and specialist requests distinguish a study whose reading has not finished from a missing or unauthorized study before reserving model spend.',
  )
  expectFailures({ ...canonical, checklist }, [
    'canonical records route the packet and keep the physical result open',
  ])
})

check('calling a controller timeout an Operator failure fails closed', () => {
  const packet = replaceRequired(
    canonical.packet,
    'automation access blocked before Stage A; no product verdict',
    'Operator restore failed',
  )
  expectFailures({ ...canonical, packet }, [
    'field packet distinguishes automation blockage from an Operator verdict',
  ])
})

check('drifting the Scholar input label from implementation fails closed', () => {
  const scholarChat = replaceRequired(
    canonical.scholarChat,
    'Ask about the passage, a clause, a cultural note…',
    'Ask the Scholar…',
  )
  expectFailures({ ...canonical, scholarChat }, [
    'field packet UI labels and failure copy match current implementation',
  ])
})

check('removing direct store-check wiring fails closed', () => {
  const packageJson = replaceRequired(
    canonical.packageJson,
    ` && ${command} && node scripts/test-theology-external-artifact.mjs`,
    ' && node scripts/test-theology-external-artifact.mjs',
  )
  expectFailures({ ...canonical, packageJson }, [
    'canonical store and release commands run the field-packet contract directly',
  ])
})

check('wrapping store-check wiring in a non-executing echo fails closed', () => {
  const packageJson = replaceRequired(
    canonical.packageJson,
    ` && ${command} && node scripts/test-theology-external-artifact.mjs`,
    ` && echo ${command} && node scripts/test-theology-external-artifact.mjs`,
  )
  expectFailures({ ...canonical, packageJson }, [
    'canonical store and release commands run the field-packet contract directly',
  ])
})

check('wrapping release wiring in a non-executing echo fails closed', () => {
  const packageJson = replaceRequired(
    canonical.packageJson,
    ` && ${command} && node electron/hosted/test-client.js`,
    ` && echo ${command} && node electron/hosted/test-client.js`,
  )
  expectFailures({ ...canonical, packageJson }, [
    'canonical store and release commands run the field-packet contract directly',
  ])
})

check('commenting out the store-check command chain fails closed', () => {
  const packageJson = replaceRequired(
    canonical.packageJson,
    '"mobile:store:check": "node scripts/test-mobile-release-target-authority.mjs',
    '"mobile:store:check": "true # && node scripts/test-mobile-release-target-authority.mjs',
  )
  expectFailures({ ...canonical, packageJson }, [
    'canonical store and release commands run the field-packet contract directly',
  ])
})

check('exiting before the release command chain fails closed', () => {
  const packageJson = replaceRequired(
    canonical.packageJson,
    '"test:release": "bash scripts/test-desktop-release-verification.sh',
    '"test:release": "exit 0 && bash scripts/test-desktop-release-verification.sh',
  )
  expectFailures({ ...canonical, packageJson }, [
    'canonical store and release commands run the field-packet contract directly',
  ])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
