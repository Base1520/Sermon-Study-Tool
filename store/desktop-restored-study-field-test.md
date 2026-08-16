# Desktop Restored-Study → Scholar Field Test

This packet closes one specific runtime question: can a source-bound installed desktop candidate reopen Cole's saved `Romans 8:1-4` study, retain the server's finished-study identity, and let Scholar answer from that reading?

It is an execution packet, not evidence that the test has passed. Source tests and deployment health cannot replace this physical UI run.

## Current execution gate

- **BLOCKED before Stage A.** The last recorded installed-app evidence identifies desktop `1.4.4` on 2026-08-15, while the restore/grounding changes under review are uncommitted and absent from current `HEAD` `f5427c6730a78f055e3558fa5fda9e572d883740`. No package receipt binds those changes to that installed app.
- Do not execute this packet until a non-secret candidate receipt records the installed app version/build, package SHA-256, reviewed source commit, and current server deployment/release identity.
- The legacy `Romans 8:1-4` entry's finished hosted identity is not assumed. The exact visible context badge below is the runtime gate; a `checking` or `general` badge cannot pass and must not be followed by the paid Stage B request.

## Boundaries

- Target only the installed **The Operator** candidate named in the recorded package/source receipt and the existing `Romans 8:1-4` history entry.
- Do not delete the history entry, relink the device, rerun the passage analysis, buy anything, or change account/settings state during this test.
- Stage A must not reserve a fresh study, but `resumeOnly` may finish an already-reserved hosted reading, call the provider, incur operator spend, and change server reading state.
- Do **not** run Stage A without Cole's fresh action-time approval for that possible completion work.
- Stage B sends one Scholar request and may consume one paid Ask. Do **not** run Stage B without Cole's fresh action-time approval.
- Record only visible result text and timestamps. Do not copy account IDs, device tokens, access codes, API keys, email addresses, or credential-bearing logs.

## Stage A — restore the saved study (no fresh study reservation; provider completion is possible)

After Cole gives fresh action-time approval for Stage A's possible completion work:

1. Open **The Operator**.
2. If the app is in PLAIN view, select **PULPIT** so the Scholar control can appear.
3. Open the circular-arrow control whose tooltip is **PASSAGE HISTORY**. Alternatively, use **SEARCH YOUR STUDIES** and search `Romans 8:1-4`.
4. Select the existing `Romans 8:1-4` entry once.
5. Wait for the saved passage workspace/reading to settle. Do not click Run, Analyze, or any equivalent regeneration control.
6. Confirm the header shows the **SCHOLAR** control and opening it shows the input `Ask about the passage, a clause, a cultural note…`.
7. Wait for the context badge to settle at exactly `Study attached · Romans 8:1-4`. If it stays at `Checking study context…` or says `Speaking generally · this chat is not grounded in Romans 8:1-4.`, Stage A fails and Stage B must not be sent.

Stage A passes only if the saved study opens without a fresh-study prompt or restore error, Scholar's input is available, and the pre-send badge is exactly `Study attached · Romans 8:1-4`.

## Stage B — prove the end-to-end Scholar path (fresh approval required)

After Cole gives fresh action-time approval for one paid Ask:

1. In Scholar, enter: `In one sentence, what is the main contrast in Romans 8:1-4?`
2. Send it once. Do not retry automatically.
3. Wait for either one non-empty Scholar response or one visible error.
4. After the response settles, confirm the context badge still reads exactly `Study attached · Romans 8:1-4`. The post-answer badge reflects the mode the main process actually used for that request.

Stage B passes only if Scholar returns a non-empty answer, the badge reads exactly `Study attached · Romans 8:1-4` both before and after the send, and none of the failure copies below appear. A plausible Romans answer while the badge says `Speaking generally` is a failure, not grounded proof.

## Attempt log

- **2026-08-15 13:54–14:00 CDT — automation access blocked before Stage A; no product verdict.** Computer Use returned no accessibility state and timed out/reset when targeting the display name **The Operator**, when enumerating installed apps, and when targeting the exact bundle ID `com.base1520.theoperator`. No click, typing, history selection, regeneration, or Scholar request occurred. A value-safe filesystem read confirms `/Applications/The Operator.app` is present and identifies version `1.4.4`; that does not prove the UI path. Stage A and Stage B remain **NOT RUN** until Cole performs the packet manually or Computer Use can return a fresh UI state.
- **2026-08-16 07:08 CDT — source/packet audit blocked execution before Stage A; no product verdict.** The recorded installed `1.4.4` identity is not a source-bound receipt for the current uncommitted restore/grounding changes, Stage A can resume already-reserved provider work, and the legacy entry's finished-study binding is unproved. The packet now requires candidate/source identity, separate fresh approvals, and the authoritative grounded badge before any Scholar Ask. No app was launched and neither stage ran.

## Stop and record if any of these appear

| Visible outcome | What it isolates |
|---|---|
| The `Romans 8:1-4` entry is absent | This run cannot test the fix; local history/state is missing. |
| The saved workspace opens but **SCHOLAR** is absent in PULPIT view | Renderer/view-state failure before the hosted Scholar call. |
| `Checking study context…` does not settle | No authoritative binding result is visible. Record Stage A FAIL and do not send Stage B. |
| `Speaking generally · this chat is not grounded in Romans 8:1-4.` | Desktop did not retain/re-bind the finished hosted study ID. Record Stage A FAIL and do not send Stage B; a general answer could sound passage-specific without using the saved study. |
| A non-empty answer arrives but the post-answer badge says `Speaking generally` | The request used standing-chat mode. Record Stage B FAIL even if the answer sounds correct. |
| `STUDY_READING_REQUIRED` or its finish-reading message | Server still sees an owned study without a completed reading document. |
| `STUDY_NOT_FOUND` or a not-found message | Hosted study identity/ownership did not resolve. |
| `STUDY_RESTORE_UNAVAILABLE` or `That saved study cannot be resumed. Run the reading again when you want it rebuilt.` | No safe resumable server state was available. Do not regenerate as part of this test. |
| Any purchase, access-code, API-key, or device-link prompt | Stop; this is outside the restored-study proof and may change account or spend state. |
| A non-empty Scholar answer with `Study attached · Romans 8:1-4` before and after send | End-to-end restored-study → grounded Scholar field path passes for the source-bound installed candidate/session. |

## Result record

Copy this block into the handoff or release ledger after the run:

```text
Desktop restored-study field test
verified: YYYY-MM-DD HH:MM CDT via physical installed-app UI
operator: Cole
target: existing Romans 8:1-4 history entry
candidate installed app: <marketing version> (<build>)
candidate package/source receipt: <non-secret package SHA-256 + reviewed source commit pointer>
server identity at run: <non-secret deployment/version/stage pointer>
Stage A approval: APPROVED AT <time> / NOT APPROVED
Stage A restore: PASS / FAIL
Stage A pre-send context badge: <exact visible text>
Stage B approval: APPROVED AT <time> / NOT APPROVED
Stage B Scholar: PASS / FAIL / NOT RUN
Stage B post-answer context badge: <exact visible text> / NOT RUN
visible result or exact error: <non-secret text>
retry performed: NO
screenshot captured: YES / NO (must contain no credentials or private notes)
```

## Source basis

- `src/App.tsx` restores launch/history entries through `resumeStoredStudy(..., resumeOnly: true)` and only renders Scholar in PULPIT view with an analysis loaded; that render condition alone does not prove finished-study binding.
- `src/components/HistoryPanel.tsx` exposes **PASSAGE HISTORY**; `src/components/StudyHistory.tsx` exposes **SEARCH YOUR STUDIES**.
- `electron/main.js` uses a remembered finished study ID for grounded hosted Scholar; when it is absent, the current standing-chat path sends a null ID and answers generally instead of emitting the retired library refusal.
- `src/components/ScholarChat.tsx` exposes the authoritative `Study attached`/`Speaking generally` badge and opts into the post-answer mode receipt used by this packet.
- `server/src/read-resume.js` defines the fail-closed restore outcomes; `server/src/study-ai-access.js` distinguishes unfinished, missing, and owned finished studies before reserving Ask spend.
- `store/release-checklist.md` and `store/release-ledger.md` keep the field result open until a physical run is recorded.
