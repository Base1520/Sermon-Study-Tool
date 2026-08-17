# Mobile Store-Candidate Physical Smoke Matrix

This is the execution packet for the three open runtime assertions in
`store/release-checklist.md`:

- the physical iPhone, iPad, and Android smoke suite; and
- the full-build sweep for staged, mock, disabled, or dead controls; and
- opening every public legal/help page from the app on physical devices.

Creating or statically checking this packet proves none of those assertions. All stay open until every
applicable row is exercised on the exact store-distributed candidate and the non-secret evidence
pointers below are complete.

## Candidate identity and redaction closure

Complete the first seven rows before testing. Leave the private configured-code comparison row open
until that device's result reasons and evidence pointers are entered; complete it before relying on any
recorded result for that device.

| Field | iPhone | iPad | Android phone | Android tablet |
| --- | --- | --- | --- | --- |
| Distribution channel (TestFlight / Play internal) | — | — | — | — |
| App version and build | — | — | — | — |
| Bundle/package ID | `com.base1520.theoperator` | `com.base1520.theoperator` | `com.base1520.theoperator` | `com.base1520.theoperator` |
| Reviewed source commit | — | — | — | — |
| Candidate receipt/checksum pointer | — | — | — | — |
| Installed identity evidence pointer | — | — | — | — |
| Tester and local timestamp | — | — | — | — |
| Private configured-code comparison (after evidence entry) | — | — | — | — |

Record app version and build as `<marketing version> (<platform build number>)`, for example
`1.4.2 (6)`. Every recorded device in one run must share the same marketing version and reviewed
source commit. The iPhone and iPad must share one exact version/build, and the Android phone and
tablet must share one exact version/build; Apple and Android platform build numbers may differ.

Record tester and local timestamp as `<identified tester> · <RFC3339 timestamp with numeric offset>`,
for example `Tester iPad · 2026-08-16T12:00:00-05:00`. The calendar date and clock must be valid, the
offset must be known (never `-00:00`), and the timestamp must not be in the future.

Do not mix builds in one run. Restart the matrix if any executable, bundled web asset, store
catalog, backend release stage, or candidate source changes.

## Evidence rules

- Record only `PASS`, `FAIL`, `BLOCKED`, or `N/A` in result cells. Every `N/A` needs a reason.
- Candidate-identity values and evidence pointers may identify a local screenshot, screen recording,
  console receipt, installed identity record, tester, timestamp, source commit, or written observation.
  They must not contain an email address, verification/device-link/comp code, bearer, receipt body,
  account ID, install ID, or recording content. Record the reviewed source commit as its full
  40-character lowercase Git object ID; store only pointers to receipts and identity evidence, never
  their private bodies. A path or filename may contain an explicitly labeled build number (for
  example, `build-123456.ipa.sha256`), and a pointer may be a bare 40/64-character hexadecimal object
  or digest (optionally `sha1:`/`sha-1:` or `sha256:`/`sha-256:` prefixed). An isolated six-digit value
  or path segment is forbidden because it is indistinguishable from a verification code. Although the
  reviewed-source field requires a full lowercase Git object ID, this packet guard checks only its
  syntax and cross-device consistency; independently resolve it to a commit in the reviewed repository
  before relying on a completed run. The static redaction guard recognizes the app's device-link
  normalization, known purchase/comp prefixes, and values explicitly labeled as comp codes. Configured
  comp codes have no universal lexical form, so static pattern matching cannot prove an unlabeled
  arbitrary string safe; human review must compare against the private configured codes without
  recording those codes here. Enter `PASS — compared privately; no configured code recorded` only
  after comparing every value, result reason, and evidence pointer for that device against the private
  configured-code inventory. The guard verifies that this attestation is present, not that the private
  comparison was truthful or complete.
- Every recorded `PASS`, `FAIL`, or `BLOCKED` needs a device-matched non-secret evidence pointer or
  precise blocker in that row's final cell. Use the exact labels `iPhone:`, `iPad:`, `Android phone:`,
  and `Android tablet:` for the corresponding recorded result, separated by semicolons. Do not add a
  label for an open or `N/A` device. Example: `iPhone: [pointer or blocker]; iPad: [pointer or blocker]`.
- Use a disposable non-review account for registration and deletion. Never delete the dedicated App Review account.
- A disabled control passes only when the user can see the prerequisite or transient reason and the
  control becomes actionable when that condition is satisfied. A control that merely ignores a tap
  fails.
- Purchase and restore rows require Apple sandbox/TestFlight or Play internal-track execution; a
  local or sideloaded build is insufficient.

## Functional matrix

| ID | Lane | Platforms | Required physical action and observable pass condition | iPhone | iPad | Android phone | Android tablet | Device-matched non-secret evidence pointers / precise blockers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | Install and launch identity | All | Install from the named store test channel, cold-launch, and confirm the exact version/build and canonical bundle/package ID above. | — | — | — | — | — |
| M02 | Registration | iPhone, iPad, Android phone, Android tablet | From a fresh install, submit a disposable email, receive the six-digit message in a real inbox, enter it, and reach the free account without a card. Invalid/incomplete input remains visibly explained. | — | — | — | — | — |
| M03 | Study | All | Open a public-domain translation, run the platform-appropriate Quick or Guided Study, and verify the completed text, evidence, and notes surface without provider/debug copy. | — | — | — | — | — |
| M04 | Library persistence | All | Save the completed study, force-quit, relaunch, open it from Library, archive it, undo/restore it, and confirm the same local work returns. | — | — | — | — | — |
| M05 | Account and device access | All | Open Account, verify the expected plan/allowance, sign out or link a second disposable install as appropriate, and confirm saved work never appears before account possession is proven. | — | — | — | — | — |
| M06 | Offline saved-study access | All | After M04, enable airplane mode, cold-launch, open the saved study and notes, then reconnect. Existing local work remains readable; network-only actions fail visibly without erasing it. | — | — | — | — | — |
| M07 | Microphone and local recording | iPad, Android tablet | In the SERMON desk, open Record, exercise deny then allow permission, record a short non-sensitive sample, stop, replay, and delete/share it. Every transition is visible and no recording is sent by default. | N/A — tablet only | — | N/A — tablet only | — | — |
| M08 | Manuscript export/share | iPad, Android tablet | Write a non-sensitive manuscript, save it, choose `EXPORT RTF · PAGES / WORD`, and confirm the native share/export sheet receives an openable RTF with the expected text. | N/A — tablet only | — | N/A — tablet only | — | — |
| M09 | Purchase | iPhone, iPad, Android phone, Android tablet | With the complete native catalog loaded, start one authorized sandbox/test purchase and confirm the chosen plan, amount, entitlement, and allowance. Cancelled purchase leaves access unchanged. | — | — | — | — | — |
| M10 | Restore | iPhone, iPad, Android phone, Android tablet | On a separately installed but linked disposable device, choose Restore Purchases and confirm the store entitlement returns without acting as a password to another account's studies. | — | — | — | — | — |
| M11 | Account deletion | All | On a separate disposable account, open `DELETE ACCOUNT…`, verify the warning/cancel path, then confirm permanent deletion. The deleted bearer fails afterward and local/account data behavior matches the on-screen result. | — | — | — | — | — |

## Legal-page link matrix

From Account → HELP + PRIVACY, test each app control on every device class. A pass requires the
system browser to open the exact HTTPS destination below, the expected public page to load without
an error/interstitial, and the return path to preserve the app's Account surface and state.

| ID | App control | Exact destination | iPhone | iPad | Android phone | Android tablet | Device-matched evidence / blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L01 | PRIVACY POLICY | `https://www.base1520.com/operator/privacy/` | — | — | — | — | — |
| L02 | TERMS OF USE | `https://www.base1520.com/operator/terms/` | — | — | — | — | — |
| L03 | ACCOUNT DELETION | `https://www.base1520.com/operator/account-deletion/` | — | — | — | — | — |
| L04 | CONTACT SUPPORT | `https://www.base1520.com/contact/` | — | — | — | — | — |

## Visible-control traversal

Run this after the functional rows on each device class. Tap every visible control at least once in
its valid state and once at any visible prerequisite boundary. Record one result per surface.

| ID | Surface | Required traversal | iPhone | iPad | Android phone | Android tablet | Device-matched evidence / blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | Intro and account entry | Continue, registration, existing-account, code validation, retry, and mode-switch controls all respond or explain their prerequisite. | — | — | — | — | — |
| C02 | Study start and reader | Translation, passage load, study start, New Text, Notes, Ask, retry, and scroll/navigation controls respond. | — | — | — | — | — |
| C03 | Library | Open, archive, cancel, undo, archived toggle, and restore respond without losing work. | — | — | — | — | — |
| C04 | Account and billing | Register/recover/link, consent, purchase-plan, restore, manage-subscription, sign-out/device, privacy, and deletion controls respond or show the exact prerequisite. | — | — | — | — | — |
| C05 | Tablet PLAIN/SERMON desk | Side switch, agents, note/illustration/pencil, Tiles, Fit, Lock, Record, manuscript, PREACH, conflicts, and close/dismiss controls respond. | N/A — tablet only | — | N/A — tablet only | — | — |
| C06 | Manuscript, recorder, and Preach Mode | Save, copy/paste, export, record/stop/play/share/delete, wake-lock state, and Preach exit respond. | N/A — tablet only | — | N/A — tablet only | — | — |

### Required known-positive regression check

Build `1.4.2 (5)` must fail C05: its archived `PREACH →` control is visibly disabled until the
manuscript body reaches 40 characters, with no tap explanation. Current reviewed source makes the
control tappable and presents the exact 40-character prerequisite. A later candidate passes this
specific regression only when both behaviors are physically observed: the not-ready tap explains
the gate without opening Preach Mode, and the ready tap opens Preach Mode.

## Completion rule

The physical-smoke checklist row may be checked only when M01–M11 pass everywhere applicable:
every applicable iPhone, iPad, Android phone, and Android tablet result cell must be `PASS`. A `PASS`
on one device is not evidence for another device.
Every recorded device result must also have its own matching labeled evidence pointer or blocker.
The legal-page-link checklist row may be checked only when L01–L04 pass on every device class.
The no-staged/mock/disabled/dead-control row may be checked only when C01–C06 pass everywhere
applicable and no visible control or copy points to a simulator, capture harness, development
checkout, mock purchase, or unavailable implementation. Static source/bundle checks are supporting
evidence only.
