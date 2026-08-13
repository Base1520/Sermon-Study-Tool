# Mobile Store Release Checklist

## Local release candidate

- [ ] The required out-of-band theology database has a verified off-machine master matching `store/external-artifacts.md`; a Git commit alone does not contain it.
- [ ] The desktop license signing key has a verified off-machine backup recorded in `store/external-artifacts.md`; existence on this Mac is not a backup.
- [ ] When the Android upload identity is created, its encrypted off-machine backup is verified and recorded before the first Play upload.

- [x] `npm run mobile:store:check` passes — **152 passed, 2 documented warnings, 0 failed** after aligning package, store metadata, both Xcode configurations, and Android `versionName` at **1.4.2** on 2026-08-12.
  - ✅ **Server-version parity audit-confirmed by Claude.** `server/package.json` and both root entries in `server/package-lock.json` now match 1.4.2, and the static gate checks both server package/store parity and server lockfile/package parity. Baseline is 154/2/0. Codex's server-package mutation failed both assertions; Claude independently changed only the lockfile and got exactly the lockfile assertion failing at 153/2/1, proving the checks are independent. Production still reports 1.4.1 until an approved redeploy, so the live gate remains open.
  - 🧪 **Mutation proof:** reverting Android `versionName` to 1.4.1 was printed at `android/app/build.gradle:26` and failed exactly `Android version name matches metadata` at 151/2/1; restoration returned 152/2/0. Static success does not replace the separate live-readiness gate.
  - ✅ **Drift fix independently verified by Claude 2026-08-12 14:5x:** `package.json` 1.4.2 · `metadata.app.version` 1.4.2 · both `MARKETING_VERSION` 1.4.2 · Android `versionName` 1.4.2; the cited command returns 152/2/0.
  - 🔴 **BUT the three Xcode checks cannot detect a per-configuration mismatch.** `scripts/check-mobile-store-readiness.mjs:161,163,165` test the pbxproj with a whole-file `includes()` / regex, so **one** matching occurrence satisfies them. Claude set **only the Release configuration** (`project.pbxproj:390`) to 1.4.1, left Debug at 1.4.2, and the real command still returned **152 passed, 0 failed**. The same holds for `PRODUCT_BUNDLE_IDENTIFIER` (wrong bundle ID in Release passes) and `CURRENT_PROJECT_VERSION` (Release build number `0` passes). **Release is the configuration that ships**, so every one of these fails in the dangerous direction. The Android mutation above passes only because `build.gradle` declares `versionName` once. Fix: parse the pbxproj per build configuration and assert on the Release block specifically. Until then this row proves the values are *present*, not that the *shipping* configuration is correct.
- [x] `npm run test:release` passes — **re-run by Claude 2026-08-13 07:5x against build-3 source: 717 passed, 0 failed, `tsc --noEmit` clean, exit 0.** Counted across **both** reporter formats (609 in `N passed, M failed` style + 108 in node:test `ℹ pass N` style); a single-format count reads 609 and understates it. Zero `not ok` / `✖` markers — the 82 lines containing "fail" are all `ℹ fail 0` and `N passed, 0 failed`.
  - 📈 **685 → 717 (+32)** — the guards added overnight: access-code policy, release provenance, Windows release workflow, plus billing-period and readiness additions. The prior 685 figure was measured 2026-08-12 06:2x, **before** the iOS platform filter, the `.99` repricing, and every source change of the night. This is the first full-gate run against the source that build 3 was packaged from.
- [x] `npm run mobile:sync` completes from a clean build output.
  - ✅ **2026-08-12 reconciliation:** the corrected full-flagged sync completed; the readiness check confirms subscription UI is present and Android/iOS package the current production bundle byte-for-byte.
- [x] Synced iOS and Android assets were generated with `VITE_OPERATOR_RELEASE_STAGE=full` and `VITE_ESV_MOBILE_LICENSED=false`.
- [x] Packaged native assets contain no simulator fallback, mock/test purchase, or development-checkout copy.
- [x] New iPhone/iPad subscriptions invoke native StoreKit from the app, bind the receipt to the verified Operator account, and never redirect to website checkout.
- [x] iPhone and iPad simulator builds pass with Xcode 26 or later.
  - ✅ **Re-verified by Claude 2026-08-13 09:4x against build-3 source.** `npm run mobile:verify:ios` → **exit 0, zero `error:` lines**; only third-party warnings from `node_modules/@capacitor/app/…/AppPlugin.swift` and the standard `[CP] Embed Pods Frameworks` phase notice. (No `** BUILD SUCCEEDED **` banner appears because the script runs `xcodebuild -quiet`; the exit status is the verdict.) Run with `CODE_SIGNING_ALLOWED=NO` — a pure compile check that cannot touch signing or provisioning assets.
  - **Why it needed re-running:** this row was previously checked and **undated**, and every material input changed after it was last true — the iOS platform filter rewrote `src/mobile/store.ts`, prices moved to `.99`, `mobile:sync` rebuilt the bundle, and build 3 was packaged. **`tsc --noEmit` passing in the release gate does not prove the native Xcode build compiles** — different toolchain, different failure modes. Surfaced by the undated-claim sweep, not by hand.
- [x] Android debug compilation passes with target API 36.
  - ✅ **Re-verified by Claude 2026-08-13 10:0x against build-3 source.** `npm run mobile:verify:android` (`clean assembleDebug`) → **`BUILD SUCCESSFUL in 8m 27s`, exit 0, zero error-shaped lines.**
  - **Why it needed re-running:** the iOS Heavy-Annual exclusion rewrote `src/mobile/store.ts`, which is **shared** — the same file serves both platforms, dropping a plan on iOS while Android resolves all six on a composite `googleProductId` + `androidBasePlanId` key. Reading that logic is not compiling it, and shared code is exactly where one platform breaks while the other looks fine.
  - 📌 **Note for future auditors: Gradle prints `BUILD SUCCESSFUL`; the iOS script does not.** `mobile:verify:ios` runs `xcodebuild -quiet`, which suppresses the `** BUILD SUCCEEDED **` banner — searching for it there finds nothing and can read as failure. **On iOS the exit status is the only verdict.**
- [ ] A signed Android release bundle compiles with the authorized upload key.
- [ ] Physical iPhone/iPad and Android smoke tests cover registration, study, library, account, deletion, microphone, export, and offline saved-study access.
- [x] Public-domain translations load; ESV is absent.
- [x] AI-processing permission is required before generated requests and can be withdrawn.
- [x] Account creation requires possession of the six-digit code sent to the submitted email address.
- [x] Local edits are protected from remote-refresh overwrite, and linked anonymous studies/recordings transfer to the verified owner.
- [x] Revoked bearers lose the caller-supplied install identity, cannot read claimed studies, and never delete the account owner's local library.
- [x] Known and unknown recovery emails use the same cooldown ledger; registration metadata is account-bound and deleted with the account.
- [x] Workspace conflicts expose `USE CLOUD` and `KEEP THIS TABLET`; note and desk limits fail visibly; archived studies can be restored.
  - ✅ **Device-neutral source fix is audit-confirmed.** Shared tablet UI now uses `tablet` / `stylus`; Claude mutation-tested the static guard and independently confirmed the rebuilt source state. This does not clear the separate screenshot recapture hold.
- [ ] No staged, mock, disabled, or dead control is visible in the full store build.
- [ ] Final screenshot set contains no loading indicator, `SYNC PENDING`, clipped status text, or provider error.
- [ ] 🔴 Release source is committed and reproducible — **this is a PREREQUISITE of archiving, not a follow-up to it.**
  - **Closed 2026-08-13:** build 3's defining source landed together in `3f692cf` and was pushed to `origin/main` before archiving. The mobile provenance guard passed at `HEAD`; after a deliberate stale-bundle failure, `npm run mobile:sync` rebuilt the native payload and the readiness gate passed 155/2/0 before the archive.
  - ⚠️ **The wording of this row previously read "…after Cole approves the release commit,"** which implies committing happens *later*. For a mobile archive that ordering is backwards and is exactly how the defect recurs. **Commit → archive → upload.**
  - ✅ **The mobile path now enforces this.** `npm run mobile:sync` invokes `scripts/check-mobile-release-provenance.sh` before building or copying native assets. Its isolated mutation test proves a dirty release input is refused rather than silently packaged.
- [x] Cole set Starter to `$29.99 / $299.99`, Standard to `$49.99 / $499.99`, and Heavy Monthly to `$149.99`. Heavy Annual remains `$1,649.99` on web/Google Play and is excluded from iOS because Apple's subscription ceiling cannot represent it profitably.

## Public legal pages

- [x] Privacy policy contains the Operator product-specific notice.
- [x] Terms page publishes the current mobile wording.
- [x] Account-deletion page returns HTTP 200 at the exact URL entered in Google Play.
- [x] Support page returns HTTP 200 and offers a working contact path.
- [ ] App links open every legal page from a physical device.

## Apple

- [x] BASE1520 App Store Connect account is active and paid agreements, tax, and banking are complete.
- [x] App record `The Operator by BASE1520` exists for `com.base1520.theoperator` with Apple ID `6799805279`.
- [ ] Produce and upload version `1.4.2` build `3` from the final `.99` pricing source; build 2 predates the price and iOS catalog changes and must not be submitted.
  - ✅ Build 3 was archived/exported from committed source and Xcode returned `Upload succeeded` plus `Uploaded package is processing` on 2026-08-13. Keep this parent open until App Store Connect independently shows build 3 processed and selectable.
- [ ] Six subscriptions exist in one group and match `server/src/iap-products.json`.
- [ ] StoreKit sandbox purchase, renewal, cancellation, restore, and account-switch tests pass.
- [ ] App privacy answers match `store/privacy-data.md`.
- [ ] Age rating, category, copyright, support URL, privacy URL, and review contact are complete.
  - ✅ **Subscription-description copy audit-confirmed by Claude 2026-08-13.** The 2,551-character staged Apple description contains all eight checked Guideline 3.1.2 elements: titles, prices, billing periods, auto-renewal, cancellation instructions, Terms, Privacy, and explicit URLs. Claude independently fetched Terms, Privacy, account deletion, and support at HTTP 200. It still must be entered and saved in App Store Connect under Cole's action-time approval.
- [ ] 🔴 Final iPhone and iPad submission screenshots come from the production-backed release candidate and pass Apple format checks without provider errors.
  - ✅ **Format is fine and audit-confirmed by Claude 2026-08-13:** iPhone `1284×2778`, iPad `2064×2752` (the 13-inch size Apple currently prefers), all five `alpha=no`, `space=RGB`. Content in the desk capture is clean — no loading indicator, no `SYNC PENDING`, no provider error, real populated study.
  - 🔴 **UNCHECKED because the whole set predates the build it claims to represent.** Claude opened `ios-ipad-submission/01-infinite-sermon-desk.png` and it renders **`SAVED ON THIS IPAD`** — the device-specific string replaced by `SAVED ON THIS TABLET` at `TabletSermonDesk.tsx:576`. Its status bar reads **Mon Aug 10**. Timestamps confirm the scope is the entire set, not one image: **all five captured Aug-10**, the device-neutral fix landed **Aug-11 19:59**, and the build-3 bundle was made **Aug-12 20:54**. **Every submission screenshot therefore depicts a build that no longer exists.**
  - ⚠️ **No automated check can see this.** Every screenshot gate — dimensions, alpha, colour space, file presence — passes. This row was `[x]` while provably false, which is the same failure as the `152 passed, 0 failed` row and the Apple-scoped live gate. **Recapture all five against build 3, then re-check.**
- [ ] Archive validates in Organizer without critical warnings.
  - ✅ **Build-number prerequisite audit-confirmed 2026-08-12.** Debug and Release are both set to build `2`; build `1` is already consumed in App Store Connect. Archive validation and upload remain separate approval-gated steps.
- [ ] TestFlight external review passes before production submission.

## Google Play

- [ ] Correct BASE1520 Play Console account is active; account ownership and package availability are verified, but payments-profile readiness remains to be confirmed.
- [x] Google Play app record `The Operator` exists for `com.base1520.theoperator`.
- [ ] A new upload key is securely created or the existing key is recovered; encrypted backup and fingerprints are recorded outside Git.
- [ ] Play App Signing is enabled.
- [ ] Subscription and six base plans match `server/src/iap-products.json`.
- [ ] License testers pass purchase, renewal, cancellation, restore, pending purchase, and account-switch cases.
- [ ] Data safety, content rating, target audience, ads declaration, app access, and account-deletion URL are complete.
- [ ] Phone, 7-inch, and 10-inch tablet screenshots plus icon and feature graphic are uploaded.
  - ⚠️ **Source prerequisite fixed locally; recapture still required.** The rebuilt bundle now says `SAVED ON THIS TABLET`, but the existing submitted candidates still visibly contain `SYNC PENDING`, clipped status text, a commentary error, and the old iPad wording. Do not upload them.
  - ⛔ **Recapture environment verified blocked 2026-08-11.** Android platform tooling is installed, but no system image/AVD exists; installing one requires a large download and licence acceptance. Browser-rendered frames from the same production bundle are an explicit capture-method decision, not yet accepted as device evidence.
- [ ] Internal test track install passes from Google Play, not a locally installed APK.

- [x] Push the reviewed Windows CI and 1.4.2 source commits after repairing GitHub authentication.
  - ✅ **Completed and remotely verified 2026-08-12.** Cole approved the credential repair and push; GitHub CLI now has `workflow`, and `origin/main` resolves to local `HEAD` `1183459e133146ccf7999dd2733d3780bd012efe`. The unrelated local `.claude/launch.json` change remained uncommitted. The Windows workflow requires a version tag or a manual dispatch with an existing tag, so this source-sync check does not claim a signed Windows artifact exists. The already-published historical name exposure and any history rewrite remain separate, unresolved decisions.
  - ⛔ **Signed-build dispatch is not yet safe.** Fresh local/remote inspection shows existing tag `v1.4.2` still points to `b96313f`, while the reviewed Windows workflow and fixes now end at `1183459`; GitHub has no Windows workflow runs. Manual dispatch with `v1.4.2` would check out the old tag, not current `main`, and the existing 1.4.2 release is already public, so the workflow's upload step would attach assets directly to that public release rather than its intended draft boundary. Do not dispatch until Cole chooses a separately reviewed tag/release strategy.
  - ✅ **Public-release overwrite guard audit-confirmed by Claude.** The workflow now queries `isDraft` and exits before any upload when an existing release is public. `scripts/test-windows-release-workflow.sh` is wired into `scripts/release.sh`. Claude independently proved three mutations fail, including moving `exit 1` after upload—the ordering failure a presence-only check would miss. This prevents accidental public-asset replacement but does not make stale `v1.4.2` safe to build.
  - ✅ **Release-tag version provenance guard audit-confirmed by Claude.** `scripts/release.sh` now refuses to publish when the working package version differs from the version committed at `HEAD`, before credentials, builds, or `gh release create`. The focused regression exercises a committed match and an uncommitted version bump, and requires the guard before publication. Codex killed inverted-comparison and removed-invocation mutations; Claude independently killed a warn-only mutation and verified real behavior and ordering. No published tag was moved. Scope is intentionally version provenance, not an otherwise-clean working tree.

## Backend full-release gate

- [ ] `npm run mobile:store:check:live` passes with zero failures.
  - ✅ **Apple-scoped gate passes.** `OPERATOR_STORE_PLATFORM=apple npm run mobile:store:check:live` → **35 passed, 1 warning, 0 failed** (Claude, 2026-08-13 03:0x). Production reports API version `1.4.2`, stage `full`, account-recovery email and Apple IAP true. The warning is the known Mailchimp state.
  - 🔴 **This row is NOT satisfied — it is written unqualified, and the unqualified command still fails.** Claude ran `npm run mobile:store:check:live` **without** the platform variable: **35 passed · 1 warning · 1 failed** — `FAIL  Google purchase verification is operational`. The box stays `[ ]` until the three Google credentials exist. Recorded explicitly because the Apple-mode result above reads like a pass, and a row checked off on a narrower run than it claims is the exact defect that put "152 passed, 0 failed" on this checklist while the real command was failing.
- [ ] Production has Anthropic, Resend, Apple verification, Google Play service-account, and RTDN credentials in the secure environment.
  - Apple/Resend configuration is now visible through public health capability flags; Google purchase verification remains degraded because the required service-account and RTDN configuration is absent.
- [x] Release readiness endpoint reports `full`; each optional provider exposes only its own verified capability.
  - ✅ **Audit-confirmed by Claude 2026-08-13 03:0x against live `/health`.** Reports `releaseStage: "full"`, `ok: true`, `missing: []`. Each capability tracks its **own** configuration independently rather than the stage: `apple_iap: true` (APPLE_APP_ID present) · `google_iap: false` (its three vars absent) · `marketing_sync: false` (Mailchimp vars absent) · `esv_mobile: false` · `account_recovery_email: true` (Resend key + verified sender). That independence is the property this row asserts, and it is exactly what makes the Google failure legible rather than hidden behind the stage flag.
- [x] A live Operator sign-in-code email is accepted by Resend and delivered from the configured production sender to an external inbox; the sender domain's required Resend DNS records are published and verified.
  - ✅ **End-to-end delivery confirmed 2026-08-13.** Cole triggered registration and received the six-digit code in a real inbox; the account was created and the free tier granted. Claude had already verified the live DKIM, sending-subdomain MX/SPF, unchanged Google Workspace root SPF, `full` stage, and `account_recovery_email: true`. This closes delivery, not the separate production-version or store-product gates.
- [ ] Apple App Store Server Notifications and Google RTDN reach the production backend.
- [ ] Receipt verification rejects wrong bundle/package, unknown products, replay, revoked transactions, and mismatched accounts.
  - 🔍 **Source audited sound by Claude 2026-08-11; live proof outstanding.** `iap.js` verifies the JWS against Apple roots with bundle-ID binding (`:76-82`), normalises environment off the enum (`:475`), gates sandbox behind an allowlist that fails closed (`:206-214`), blocks bearer-claim and cross-account rebinding (`:391-421`), and closes TOCTOU with a sorted per-purchase advisory lock plus `FOR UPDATE` (`:424-452`). Both previously untested load-bearing lines now have independently mutation-proven regressions. **Stays unchecked** because proving actual store rejection needs live sandbox transactions and store products that do not exist yet.
- [ ] Usage allowances reset monthly for annual plans without becoming one annual bucket.
  - 🧪 **Locally mutation-proven 2026-08-12; audit pending.** `billingPeriodFor` derives a new anniversary-aligned key each month and the focused suite is part of both server and release tests. Baseline passes 4/4; forcing every paid account to remain in its anchor bucket prints the mutated source and fails 3/4, including the explicitly named annual-bucket property. Production behavior remains unverified, so the parent checkbox stays unchecked.
- [ ] Fully refunded Stripe top-ups revoke only the unused purchased balance exactly once; partial refunds and webhook replays cannot over-revoke studies.
  - ✅ **Local fix AUDIT CONFIRMED (Claude, 2026-08-12 11:3x CDT); production gate still open.** PaymentIntent-linked transactional revocation, fail-closed unlinked grants, exact-row validation on both account debit and refund ledger writes, bounded retry, durable unmatched-event escalation, and an unapplied migration file are present. Codex mutation-proved the required PaymentIntent, full-refund gate, PaymentIntent-only lookup, and zero-row ledger rollback. Claude then independently mutation-tested all six design properties inside `revokeOperatorTopUpRefund` only — partial-refund acceptance (25/1), dropped `refunded_at` idempotency (24/2), dropped balance clamp (22/4), immediate escalation (25/1), customer-instead-of-PaymentIntent lookup and removed `BEGIN` (both abort) — all six caught, restored baseline 26/0, and reviewed the migration as re-runnable with a correctly partial unique index. **The parent box stays unchecked: the production migration/backfill, deploy, and live webhook proof remain open and are Cole's calls.**
- [ ] Stripe top-ups grant studies only when Checkout reports payment as paid; delayed methods grant on `checkout.session.async_payment_succeeded`, never on an unpaid completion.
  - 🧪 **Local fix / review pending 2026-08-12.** Paid completion, unpaid completion, delayed success, and replay behavior are covered; removing either the paid predicate or async event arm makes the focused suite fail. Production is unchanged.
- [ ] Stripe top-up ledger insertion and account credit are one transaction; a failed or zero-row credit remains safely retryable, cannot log success, and cannot leave a permanent zero-study purchase record.
  - 🧪 **Local fix / review pending 2026-08-12.** Deep-equality assertions read the recorded transaction order for success (`BEGIN→COMMIT`), zero-row rollback (`BEGIN→ROLLBACK`), and winner/replay (`BEGIN→COMMIT→BEGIN→ROLLBACK`). Deleting `BEGIN` fails 5/25 tests; deleting both `BEGIN` and `COMMIT` fails 8/25. Production is unchanged; Claude audit confirmation remains pending.
- [ ] Rate, cost, and concurrency ceilings fail closed.
  - ✅ **Cost** is done and independently proven: the `daily_ceiling_usd` parser and both request gates were mutation-tested by Claude on 2026-08-11 (7 mutations, each caught by the correct assertion).
  - ⛔ **Concurrency implementation gap identified 2026-08-12.** The backend atomically caps daily/allowance counts and includes simultaneous reservations in the dollar brake, but no explicit global, per-account, or per-install maximum for currently executing model requests exists in tracked source. Cost visibility is not a concurrency ceiling. Define the intended limits, enforce them with durable or process-safe claims, and mutation-prove simultaneous acquire/refuse/release behavior before checking this row.
  - 🔍 **Rate remains unaudited.** This parent box stays open until both rate and concurrency controls are independently proven.
- [ ] Database backup and rollback evidence exists.

## Submission boundary

Do not upload a binary, create paid products, change production release stage, publish legal pages, or submit for review without Cole's action-time approval. Save screenshots and receipts from every external action in the release ledger.
