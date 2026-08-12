# Mobile Store Release Checklist

## Local release candidate

- [ ] The required out-of-band theology database has a verified off-machine master matching `store/external-artifacts.md`; a Git commit alone does not contain it.
- [ ] The desktop license signing key has a verified off-machine backup recorded in `store/external-artifacts.md`; existence on this Mac is not a backup.
- [ ] When the Android upload identity is created, its encrypted off-machine backup is verified and recorded before the first Play upload.

- [x] `npm run mobile:store:check` passes — **152 passed, 2 documented warnings, 0 failed** after aligning package, store metadata, both Xcode configurations, and Android `versionName` at **1.4.2** on 2026-08-12.
  - 🧪 **Mutation proof:** reverting Android `versionName` to 1.4.1 was printed at `android/app/build.gradle:26` and failed exactly `Android version name matches metadata` at 151/2/1; restoration returned 152/2/0. Static success does not replace the separate live-readiness gate.
  - ✅ **Drift fix independently verified by Claude 2026-08-12 14:5x:** `package.json` 1.4.2 · `metadata.app.version` 1.4.2 · both `MARKETING_VERSION` 1.4.2 · Android `versionName` 1.4.2; the cited command returns 152/2/0.
  - 🔴 **BUT the three Xcode checks cannot detect a per-configuration mismatch.** `scripts/check-mobile-store-readiness.mjs:161,163,165` test the pbxproj with a whole-file `includes()` / regex, so **one** matching occurrence satisfies them. Claude set **only the Release configuration** (`project.pbxproj:390`) to 1.4.1, left Debug at 1.4.2, and the real command still returned **152 passed, 0 failed**. The same holds for `PRODUCT_BUNDLE_IDENTIFIER` (wrong bundle ID in Release passes) and `CURRENT_PROJECT_VERSION` (Release build number `0` passes). **Release is the configuration that ships**, so every one of these fails in the dangerous direction. The Android mutation above passes only because `build.gradle` declares `versionName` once. Fix: parse the pbxproj per build configuration and assert on the Release block specifically. Until then this row proves the values are *present*, not that the *shipping* configuration is correct.
- [x] `npm run test:release` passes — re-run by Claude on 2026-08-12 at 06:2x against the current working tree, **after** the eight source changes that followed the earlier run: **685 passed, 0 failed** across all suites, `tsc --noEmit` clean, exit 0. (The prior figure of 678 was measured before those changes.)
- [x] `npm run mobile:sync` completes from a clean build output.
  - ✅ **2026-08-12 reconciliation:** the corrected full-flagged sync completed; the readiness check confirms subscription UI is present and Android/iOS package the current production bundle byte-for-byte.
- [x] Synced iOS and Android assets were generated with `VITE_OPERATOR_RELEASE_STAGE=full` and `VITE_ESV_MOBILE_LICENSED=false`.
- [x] Packaged native assets contain no simulator fallback, mock/test purchase, or development-checkout copy.
- [x] New iPhone/iPad subscriptions invoke native StoreKit from the app, bind the receipt to the verified Operator account, and never redirect to website checkout.
- [x] iPhone and iPad simulator builds pass with Xcode 26 or later.
- [x] Android debug compilation passes with target API 36.
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
- [ ] Release source is committed and reproducible after Cole approves the release commit.
- [x] Cole locked all six subscription prices and monthly allowances on 2026-08-09: `$30 / $300` for 40, `$50 / $500` for 80, and `$150 / $1,650` for 300 studies each month.

## Public legal pages

- [x] Privacy policy contains the Operator product-specific notice.
- [x] Terms page publishes the current mobile wording.
- [x] Account-deletion page returns HTTP 200 at the exact URL entered in Google Play.
- [x] Support page returns HTTP 200 and offers a working contact path.
- [ ] App links open every legal page from a physical device.

## Apple

- [x] BASE1520 App Store Connect account is active and paid agreements, tax, and banking are complete.
- [x] App record `The Operator by BASE1520` exists for `com.base1520.theoperator` with Apple ID `6799805279`.
- [x] Apple Distribution signing and App Store provisioning produced version `1.4.1` build `1`; App Store Connect accepted and processed it to `Ready to Submit`.
- [ ] Six subscriptions exist in one group and match `server/src/iap-products.json`.
- [ ] StoreKit sandbox purchase, renewal, cancellation, restore, and account-switch tests pass.
- [ ] App privacy answers match `store/privacy-data.md`.
- [ ] Age rating, category, copyright, support URL, privacy URL, and review contact are complete.
  - ✅ **Subscription-description copy fixed locally 2026-08-12.** The staged Apple description now contains price/period, auto-renewal, cancellation, Terms, and Privacy disclosures. It still must be entered and saved in App Store Connect under Cole's action-time approval.
- [x] Final iPhone and iPad submission screenshots come from the production-backed release candidate and pass Apple format checks without provider errors.
  - ⚠️ **Anchored to build 1, which is proven irreproducible and under Cole's do-not-submit order.** Build 2 will come from a different source tree, so this checkmark does not transfer automatically — re-confirm the set against build 2 before submission. Note also that line 23 (no loading indicator / `SYNC PENDING` / clipped text) is still open, so "passes format checks" is not the same as "cleared for review".
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

- [ ] Push the local Windows CI and 1.4.2 source commits after GitHub authentication is repaired; local `main` is seven commits ahead of the last fetched `origin/main`.
  - ⛔ **Corrected again 2026-08-12.** Claude's host-level checks show valid but different credentials: `gh` has `repo` without `workflow`, while Git uses an `osxkeychain` token with `repo` only. Independent `git grep` confirms the beta tester's full name is already on public `origin/main` in five tracked files; rewriting only the seven unpublished commits cannot undo that exposure. The current tree has zero occurrences. Before push, Cole must approve credential routing/scope repair and the push itself. A normal clean-tip update removes the name from current source; replacing the already-published macOS artifact is separate release work. Any full public-history purge is a distinct destructive decision and is not implied by this row.

## Backend full-release gate

- [ ] `npm run mobile:store:check:live` passes with zero failures.
- [ ] Production has Anthropic, Resend, Apple verification, Google Play service-account, and RTDN credentials in the secure environment.
- [ ] Release readiness endpoint reports `full`; each optional provider exposes only its own verified capability.
- [ ] A live Operator sign-in-code email is accepted by Resend and delivered from the configured production sender to an external inbox; the sender domain's required Resend DNS records are published and verified.
  - ⛔ **Live blocker identified 2026-08-12.** `account-recovery.js` uses Resend for the one-time sign-in code. Local readiness now rejects malformed sender addresses and Resend's test domain with mutation-proven coverage, but Claude's live DNS check found the Resend DKIM and sending-subdomain records absent and the root SPF authorizing Google only. Static configuration readiness still cannot close this gate.
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
