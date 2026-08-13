# The Operator — verified state

**Last reconciled: 2026-08-08**

## Executive truth

- **Desktop is shipped.** The signed and notarized macOS `v1.4.0` release is
  live at <https://github.com/Base1520/Sermon-Study-Tool/releases/tag/v1.4.0>.
- **Mobile staged core is live.** Railway now serves the `1.4.1`
  `operator-mobile-billing-v4` API in explicit `core` mode, and the matching
  signed development build with the one-call Quick Study flow is installed and
  launches on Cole's iPhone.
- **The tablet build is now a real PLAIN study.** iPad routes to a full Guided
  Study through all eight COVENANT movements; the final native source is synced
  and passes the iOS Simulator build. The signed development build was compiled,
  installed, and launched successfully on Cole's 12.9-inch iPad Pro on
  2026-08-08 after Developer Mode was enabled.
- **Core is deliberately link-only.** Passage loading, study, notes, sync,
  archive, deletion, and desktop-to-phone account linking are enabled. New
  mobile registration, email recovery, marketing sync, native purchases, and
  mobile ESV remain disabled and fail closed.
- **Mobile is not store-releasable yet.** Public legal pages are incomplete;
  distribution signing, store records, products, provider credentials, and
  physical-device purchase tests are not proven.
- **Do not add mobile download buttons yet.** A debug APK or unsigned Apple
  build is not a release artifact.
- **The current release source is not reproducible from Git.** Most mobile and
  billing files are untracked. Commit only after Cole explicitly approves it.

## Desktop release

Download: <https://github.com/Base1520/Sermon-Study-Tool/releases/tag/v1.4.0>

- Apple Silicon: `The-Operator-1.4.0-arm64.dmg`
- Intel: `The-Operator-1.4.0.dmg`
- Both architectures were verified as anonymous downloads and passed macOS
  Gatekeeper as notarized Developer ID builds.
- Notarization is configured through Developer ID **Base 1520 LLC
  (6UP72M96Q5)** and keychain item `operator-notarize`.

## Mobile product built locally

Mobile v1 is intentionally **PLAIN-first**, not a sermon-writing app:

- Three-step branded onboarding and passage/translation selection.
- One-call Quick Study for meaning, immediate context, text evidence, key
  terms, whole-Bible placement, application, guardrails, and text questions.
  The phone does not generate sermon outlines, manuscripts, preaching points,
  transitions, hooks, or illustrations.
- Full iPad Guided Study for serious reading rather than sermon writing:
  canonical passage, main claim, original setting and confidence, natural text
  divisions, key terms, all eight COVENANT movements, individual/corporate/
  mission application, interpretive guardrails, answered study questions, and
  collapsible passage/grounding evidence.
- Guided Study uses three bounded Haiku calls in parallel, validates the merged
  document, and permits one bounded retry only when the merged study fails the
  contract. Historical claims unsupported by the supplied passage/grounding are
  replaced with an honest uncertainty statement instead of displayed as fact.
- The server fetches the canonical passage; the client cannot submit alternate
  text under a trusted reference. Verse numbers, notes, local library, sync,
  archive, and reopen-finished-study flows remain available.
- Older completed PLAIN readings still reopen. ASK remains available only for
  those full documents because the compact Quick Study contract deliberately
  does not masquerade as the desktop preparation pipeline.
- Secure device token and install id storage through iOS Keychain and Android
  Keystore. Personal ESV-key storage exists behind the disabled license gate.
- Email account registration, three-device management, revocation, sign-out,
  deletion, and a one-time-code lost-device recovery path.
- Account recovery codes expire after ten minutes, are attempt- and
  rate-limited, are stored only as HMAC hashes, and replace the oldest device
  when an account already has three devices.
- Linked-account synchronization for completed studies, notes, and archive
  state.
- A stable owner-scoped request id makes same-session timeout retries
  idempotent. A verified retry returned the same study in 224 ms without a
  second allowance charge.
- Starting a new text now aborts the active mobile request and ignores any stale
  result, so a canceled study cannot repopulate the prior passage later.
- Native Apple and Google subscription purchase, verification, restore, and
  account-scoped entitlement paths.
- Apple uses six subscription product ids in one subscription group. Google
  uses one subscription product with six exact base plans.
- Google acknowledgement is a durable retrying outbox. Restore failures fail
  closed. Native store builds do not expose access-code redemption.

Primary source locations:

- `src/mobile/`, `mobile/`, `vite.mobile.config.ts`, `capacitor.config.ts`
- `ios/`, `android/`, `assets/logo.png`
- `server/src/mobile.js`, `server/src/mobile-account.js`
- `server/src/account-recovery.js`, `server/src/iap.js`
- `server/src/readiness.js`, `server/src/schema.sql`

## Local verification receipts

All of the following passed on 2026-08-08 after the final Guided Study,
recovery, and native purchase hardening changes:

- `npm run test:release`
- `npx tsc --noEmit`
- `npm run mobile:sync` for all six native plugins
- `npm run mobile:verify:ios` — Debug Simulator build, no signing
- `npm run mobile:verify:android` — clean Debug APK, 283 Gradle tasks
- Signed development build installed and launched on Cole's paired physical
  iPhone
- `node scripts/test-native-purchases-patch.cjs`
- Mobile route and capability gates — 26/26 checks
- `git diff --check`
- Root and server `npm audit --omit=dev --audit-level=high` — zero
  vulnerabilities
- Account recovery adversarial suite — 11/11
- Readiness contract suite — 6/6
- Native IAP suite — 18/18
- Stripe synchronization suite — 8/8
- Quick Study contract and adversarial guardrails — 15/15
- Guided Study contract and adversarial guardrails — 36/36
- Final iPad source synced to iOS and Android with all six Capacitor plugins;
  final iOS Simulator Debug build passed; signed development build installed
  and launched on the physical 12.9-inch iPad Pro
- Live uncached KJV Quick Study — HTTP 200 in 11.048 seconds; 3 text evidence
  blocks, 1 key term, verified source anchors, no sermon drift, and no
  relativized “what does it mean to you?” language
- Same-request production retry — HTTP 200 in 224 ms, same study id, and no
  additional allowance charge
- Live uncached KJV Psalm 23 Guided Study — HTTP 200 in 12.615 seconds; 4
  natural text units, 2 key terms, all 8 COVENANT movements, 3 answered
  questions, poetry-aware reading rules, restrained Psalm 23:6 afterlife claim,
  YHWH retained as the psalm's shepherd, no sermon drift, and no relativized
  meaning language
- Same-request Guided Study reopen — HTTP 200 in 404 ms; fresh-request shared
  cache reopen — HTTP 200 in 1.002 seconds with `fromCache: true`, proving the
  normalized evidence remains valid instead of silently regenerating
- Philippians 2:5–11 adversarial production study passed checks for separate
  verse 5, Isaiah 45:23, disputed lexical restraint, full Christology,
  Father/Son distinction, universal-salvation restraint, epistolary genre,
  individual/corporate/mission application, abuse-boundary protection, source
  evidence, no sermon drift, and fixed meaning

Identifiers currently agree:

- Bundle/application id: `com.base1520.theoperator`
- Version: `1.4.1`
- Apple build: `1`
- Android version code: `1`
- Apple team: `6UP72M96Q5`

The Android debug APK is at
`android/app/build/outputs/apk/debug/app-debug.apk`. It must **not** be uploaded
to Google Play.

## Production truth

Current API: <https://api-production-15e5e.up.railway.app>

- `/health` returns HTTP 200 with version `1.4.1`, schema
  `operator-mobile-billing-v4`, `releaseStage: core`, `ok: true`, and no
  missing core contract.
- `/v1/passage` serves public-domain translations; a live KJV probe returned
  John 3:16 with verse data.
- `/v1/quick-study` refetches canonical Scripture, performs one metered Haiku
  lookup, validates exact passage/vault source references, saves the compact
  result, and returns it with the passage in one response. A new completed
  lookup consumes one study; reopening or retrying the same request does not.
- `/v1/guided-study` refetches canonical Scripture, builds the full tablet study
  in three parallel bounded Haiku calls, validates every required section and
  source reference, coalesces identical cold requests, caches by passage,
  translation, grounding, prompt, validator, and model, and performs at most
  one bounded safety retry. Prompt version is `16`; validator version is `14`.
- `/v1/device-links` and `/v1/device-links/redeem` are live and enforce account
  authentication, one-time use, expiry, and the device cap.
- `/v1/mobile/register` returns `503 REGISTRATION_DISABLED`; core cannot create
  an unverified account that has no recovery path.
- `/v1/mobile/recovery/*` returns `503 RECOVERY_DISABLED`.
- `/v1/iap/catalog` returns `enabled: false`, both providers false, and no
  products. The client also rechecks live server capability immediately before
  any native purchase call, so a full-built client cannot charge against core.
- Mobile ESV returns `403 ESV_LICENSE_REQUIRED`, including when a personal key
  is supplied.
- Capacitor CORS was verified live with HTTP 204 and
  `Access-Control-Allow-Origin: capacitor://localhost`.
- Railway project: `operator-api`; service: `api`.
- Current production deployment:
  `303db964-726f-41fb-967b-9c842bc5faf1`, created 2026-08-08 local time.
- Railway predeploy is `npm run migrate`; health check is `/health`.

Cold-generation coalescing currently lives in process memory and production is
one Railway replica. Before increasing the replica count, replace that lock
with a distributed generation lease so two instances cannot buy the same cold
cache fill.

Cole explicitly approved this staged-core production deployment on 2026-08-08.
The core secrets, public URLs/origins, Stripe web configuration, and release
stage are configured in Railway. Values remain only in the secure provider.

The following full-release provider configuration is still absent or unproven:

- `RESEND_API_KEY`
- `OPERATOR_AUTH_FROM_EMAIL`
- `MAILCHIMP_API_KEY`
- `MAILCHIMP_AUDIENCE_ID`
- `APPLE_APP_ID`
- `IAP_SANDBOX_ACCOUNT_EMAILS`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `GOOGLE_RTDN_AUDIENCE`
- `GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL`

Do not enable `full`, set provider values, rotate credentials, or submit a
store build without Cole's explicit approval. Never copy secret values into
this file or Git.

## Existing connection evidence

- The installed Mailchimp connector is authenticated and can read the existing
  Base1520 audience. That proves the account exists; it does not expose a
  server-side API credential that Railway can use.
- The WordPress connector can identify `www.base1520.com`, but reports the
  Jetpack site as disconnected. Site-scoped publishing tools therefore cannot
  update the legal pages until Jetpack is reconnected or the separate secure
  WordPress REST connector is used.
- Xcode knows the paid **Base 1520 LLC** team `6UP72M96Q5`. Automatic signing
  created a development provisioning profile and successfully installed The
  Operator on Cole's iPhone. An App Store distribution identity/profile is
  still not proven.
- No Android `.jks`/`.keystore` or Google Play service-account credential was
  found in the normal project, document, desktop, or local gcloud locations.

## Public legal and licensing state

- <https://www.base1520.com/operator/terms/> is live but currently contains
  generic Terms rather than the Operator-specific staged terms.
- <https://www.base1520.com/operator/account-deletion/> currently returns 404.
- <https://www.base1520.com/privacy-policy/> is live but does not yet contain
  the staged Operator/Resend recovery disclosure.
- Local staged sources are
  `website/operator-terms.html` and
  `website/operator-privacy-addendum.html`.

### ESV is contained until licensed

Crossway's current official API terms permit API use in a mobile app only when
all general conditions are met. Those conditions require noncommercial use,
define a noncommercial site as charging for access to no part of the site, and
state that a commercial organization needs a formal license. The Operator is a
paid product. Having each customer bring a personal ESV API key does **not**
turn the Operator into a noncommercial app.

The store build now omits the ESV picker and key controls by default, and the
server rejects ESV mobile requests unless the explicit
`ESV_MOBILE_LICENSED=true` gate is set. A personal API key cannot bypass that
gate. Public-domain translations remain available, so ESV licensing no longer
blocks the initial store release.

Before ESV can be offered in the paid mobile release, Base 1520 needs written
permission or a commercial mobile-app license from Crossway:

- API conditions: <https://api.esv.org/>
- Crossway permissions: <https://www.crossway.org/permissions/>

Do not enable either the server or client ESV gate until permission is
documented and its exact attribution/display requirements are implemented.
Attribution alone does not cure commercial use.

## External release blockers

1. Full-release email, marketing, and store-provider credentials are absent.
2. Operator-specific Terms, privacy language, and account-deletion page are not
   live.
3. iPhone development signing and installation work, but an App Store
   distribution identity/profile is still absent.
4. Android upload properties/keystore are absent; release builds fail closed by
   design.
5. App Store Connect and Play Console may already exist for Base 1520/Everfit,
   but Operator app records, subscriptions/base plans, notifications, and
   sandbox testers are not yet proven.
6. Store listing copy, screenshots, privacy/data-safety answers, age/content
   declarations, review notes, and support URLs are not finalized.
7. Signed purchase, upgrade, restore, recovery, and deletion tests have not run
   on physical iPhone and Android release candidates.
8. Release-critical source remains untracked and therefore cannot be rebuilt
   reliably from the remote repository.
9. The current development build is installed and launches on the physical
   iPad; the complete Guided Study interaction still needs an on-device human
   walkthrough, and a signed store release candidate remains unproven.

## Smallest safe cutover

The sequence matters. Do not skip forward because a screen looks finished.

1. **Freeze source:** review the dirty tree, exclude local artifacts/secrets,
   and commit the release source after Cole approves the commit.
2. **Publish legal pages:** make Operator Terms, privacy disclosure, and public
   account deletion live and verify their final URLs.
3. **Hold the ESV gate closed:** ship public-domain translations only unless
   Crossway grants written commercial permission.
4. **Promote backend deliberately:** add Resend/Mailchimp/store credentials,
   verify each provider operationally, then change both server and client from
   `core` to `full`; never let an unlabeled deployment fall through.
5. **Re-probe backend:** require the readiness/capability matrix and the mounted
   route matrix before building a store candidate.
6. **Configure stores:** create Operator app records and exact Apple products /
   Google base plans, enable provider notifications, and create sandbox users.
7. **Sign builds:** install the Apple distribution/profile assets and create or
   recover the Android upload key; archive signed release candidates.
8. **Device test:** run the full free, paid, upgrade, restore, recovery,
   deletion, offline, and failed-payment matrix on physical devices.
9. **Prepare listings:** capture screenshots from the signed candidate, finish
   store disclosures/copy/review notes, and stage — but do not submit.
10. **Cole release approval:** submit only after Cole approves the receipts and
    final release candidate.

## Future polish — Scripture coordinates

After release-critical work is finished, add an optional Base 1520 coordinate
label beside the ordinary Bible reference. Number books within each testament,
then format the book, chapter, verse range, and testament as
`BB.CC.VV[-VV] T`:

- `04.03.16-18 N` = John 3:16–18 (the fourth New Testament book).
- `04.03.16-18 O` = Numbers 3:16–18 (the fourth Old Testament book).

This is a secondary brand detail, never a replacement for the familiar
reference. Accessibility labels, exports, sharing, search, and first-use help
must still say the ordinary book name so the coordinate never creates friction.

## Historical audit note

The older three-round desktop/backend audit found 103 defects. Its raw finding
list previously lived in this file, but it described pre-fix line numbers and
was no longer a trustworthy governing checklist. Current obligations are the
verified blockers and cutover sequence above; old findings must be revalidated
against current source before being resurfaced.

## 2026-08-09 — Mobile store hardening, second adversarial pass

### Changed

- `src/mobile/MobileApp.tsx`, `src/mobile/TabletSermonDesk.tsx`, `src/mobile/tabletDeskModel.ts`, and `src/mobile/mobile.css`: preserve account-local work after revocation/sign-out, clear the active reading surface, expose two-way workspace-conflict resolution, enforce visible note/desk limits, and make archive reversible.
- `server/src/auth.js` and `server/src/index.js`: stale bearers no longer inherit a caller-controlled install ID; anonymous study ownership requires `account_id IS NULL`; generated routes require a verified account in the full store stage.
- `server/src/account-recovery.js`, `server/src/account-registration.js`, `server/src/mobile-account.js`, `server/src/schema.sql`, and `server/src/readiness.js`: recovery enumeration is rate-limited uniformly, registration artifacts are account-bound/deletable, and readiness now requires schema `operator-account-bound-auth-v7`.
- Mobile/server regression tests and `scripts/check-mobile-store-readiness.mjs`: encode the new data-loss, privacy, ownership, recovery, and native-purchase invariants.
- `src/mobile/MobileApp.tsx` and `src/mobile/store.ts`: new mobile subscribers choose and purchase inside the native app; the app calls StoreKit/Google Play directly, binds the receipt to the verified Operator account, and never redirects a new iPhone/iPad subscriber to website checkout.

### Verified

- `npm run test:release` passes with TypeScript exit 0.
- Full-stage, no-ESV assets resynced successfully to iOS and Android.
- iOS simulator compile and Android debug compile pass; packaged release-copy audit passes.
- Static readiness reports `149 passed · 1 warning · 1 failed`; the remaining failure is the intentional hold for visibly broken tablet screenshots.
- The full-stage native bundle was resynced after the in-app purchase copy/guard changes; iOS simulator and Android debug builds both pass, and the packaged assets contain the native subscription path and Apple's Face ID/side-button explanation.
- A development-signed `1.4.1` build was installed and launched on Cole's connected iPhone 14 Pro Max and 12.9-inch iPad Pro on 2026-08-09; both processes remained running and Cole confirmed the app was working on both. The complete registration, purchase, study, microphone, export, offline, and deletion smoke matrix is still open.
- Live readiness remains `22 passed · 1 warning · 14 failed`; production is still the old core backend and the legal pages are incomplete.

### Remaining risks

- No Apple Distribution identity/profile, Android upload key, Operator store records, products, or physical store-track test receipts exist.
- Production has not received the v7 migration/code, full-stage provider credentials, or live Operator-specific legal pages.
- The current tablet screenshots expose loading, pending-sync, and provider-error states and cannot be submitted.
- Subscription pricing is locked at `$29.99 / $299.99`, `$49.99 / $499.99`, and `$149.99 / $1,649.99`, with monthly allowances of 40, 80, and 300 studies. Heavy Annual is web/Google Play only; iOS offers Heavy Monthly because Apple's annual-price ceiling would make that plan uneconomic.
- Release-critical source remains dirty/untracked and is not reproducible from the remote repository.

### Exact next action

Complete physical iPhone/iPad smoke testing and Cole approves the release-source commit boundary. Then publish the three legal pages and deploy the v7 backend before creating store products, distribution signing, or capturing final screenshots.
