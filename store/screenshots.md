# Store Asset Plan

> Apple iPad custody correction, 2026-08-17 09:13 CDT: while Codex's original-pixel intake was in progress, commit `4b25c05db5054da079202a4ab05daf1048ee5502` was created and pushed to `main` / `origin/main`, replacing the three canonical iPad assets with exact input bytes `IMG_0168.PNG` (`ff79e9ea...a2a6b`), `IMG_0173.PNG` (`031aa00c...24eb`), and `IMG_0174.PNG` (`3101d8fa...e1`). Codex did not stage, commit, push, or alter those assets. This custody event does not clear visual review: the SERMON asset's open Scholar panel obscures the bottom-right Desk region and Claude's 09:50 filing says it was deliberately chosen to cover the known clipped minimap; the PREACH asset is byte-identical to the rejected frame with family-identifying manuscript copy and text clipped beneath the footer. `store/apple-screenshot-verification.json` remains untracked at `status: hold` / visual `HOLD`, with no reviewed source and historical iPad hashes that do not match the pushed live bytes. Keep the Apple screenshot hold open and do not upload this set. Replace it with a clean unobscured SERMON frame and a clean unclipped active-Preach frame, then complete candidate/source/byte-bound visual review and receipt custody.

> Apple build-6-session intake, 2026-08-17 08:52 CDT: Codex independently inspected the exact ten new files `IMG_0165.PNG`–`IMG_0174.PNG`; independent second review corroborated the high-risk findings. Every file is a 2732 × 2048, 8-bit RGB PNG without alpha. The earlier workspace/manuscript reference mismatch is absent. `IMG_0166.PNG` is the strongest content-safe PLAIN candidate. The stronger-composition PLAIN frame `IMG_0167.PNG` and strongest SERMON frame `IMG_0170.PNG` expose a Natural Divisions sequence that jumps from `22:10–12` to `22:14–17`, omitting verse 13 even though the passage frame visibly includes verse 13. `IMG_0174.PNG` shows active Preach Mode with a matching passage header, but is rejected because visible manuscript copy contains family-identifying content and its bottom line is clipped beneath the fixed footer. No acceptable SERMON or active-Preach frame therefore exists in this intake. Cole/Claude reported capture from a development-signed `1.4.2 (6)` app made from the uploaded archive, but Codex could not independently reread installed identity at intake. Nothing was staged. Resolve or avoid the visible division gap, capture a clean SERMON frame, capture a clean unclipped active-Preach frame, then run complete candidate/source/byte custody review. Hash-bound intake record: `/Users/colepermenter/Claude/System/AI-Collaboration/local-release-evidence/screenshots/ios-ipad-build6-intake-20260817/README.md`.

> Apple submission hold: the two iPhone files pass format, visual, and capture-provenance review. A dated Aug-14 device read bound the older `IMG_0158.PNG`–`IMG_0160.PNG` drafts to installed metadata `1.4.2 (5)`; the fresh Aug-17 bundle-filtered read now reports the connected iPad's current installed metadata as `1.4.2 (6)`. That later read supersedes current device identity but cannot retroactively establish which bytes produced any earlier capture or distinguish development-signed from TestFlight distribution. These are build-5 visual drafts only. Subsequent candidate evidence proves build 5 fails required C05, so build 6 is the current fail-closed final-screenshot path without inventing a historical Cole choice. Build 6 now exists as a source-bound uploaded artifact, but no final screenshot set is proven against its packaged UI. The currently staged build-6-session iPad set must not be uploaded because its SERMON frame obscures part of the Desk and its active-Preach frame exposes family-identifying copy with footer-clipped text. Replace those two slots or prove pixel-equivalence of any reused build-5 draft against packaged build 6, then stage and recheck the build-6-proven replacements. Do not clear this hold from the completed historical drafts or the current rejected set.

> Android creative hold: the staged Android tablet Desk images still show the former `SYNC PENDING` and commentary error states. Do not upload the Android tablet set until it is recaptured from the corrected build.

Use real app screens from the release candidate. Do not submit design mockups that show controls or content the build cannot reproduce.

## Required exports

- Apple iPhone portrait submission set: `1284 × 2778` 8-bit RGB PNG without alpha or transparency, 1–10 images.
- Apple iPad 13-inch build-5 visual-draft / build-6 final landscape target: `2732 × 2048` 8-bit RGB PNG without alpha or transparency, 1–10 images. The checker also retains the already-staged `2064 × 2752` portrait form because Apple accepts both exact sizes; the separate provenance hold prevents the stale portrait files or unproven build-5 drafts from being promoted.
- Google Play phone: `1080 × 1920` 8-bit RGB PNG, 2–8 images.
- Google Play 7-inch tablet: `1200 × 1920` 8-bit RGB PNG, 2–8 images.
- Google Play 10-inch tablet: `1600 × 2560` 8-bit RGB PNG, 2–8 images.
- Google Play high-resolution icon: `512 × 512` PNG, no transparent outer padding.
- Google Play feature graphic: `1024 × 500` PNG or JPEG.

## Screenshot sequence

1. **The text first** — passage entry and translation selector.
2. **Meaning with evidence** — main claim, context, and visible textual support.
3. **Words that matter here** — key-word study tied to the author's argument.
4. **A governed COVENANT path** — visible study movements and restraint checks.
5. **Your work follows you** — library and linked-device sync.
6. **iPad: PLAIN study** — complete Guided Study with natural divisions.
7. **iPad: SERMON desk** — movable tiles and the PLAIN/SERMON switch.
8. **iPad: Write and preach** — manuscript editor, recording, and Preach Mode.

## Apple submission screens

- `assets/screenshots/ios-iphone-submission/00-quick-study-start.png`
- `assets/screenshots/ios-iphone-submission/01-quick-study.png`
- `assets/screenshots/ios-ipad-submission/00-covenant-plain-study.png`
- `assets/screenshots/ios-ipad-submission/01-infinite-sermon-desk.png`
- `assets/screenshots/ios-ipad-submission/02-preach-mode.png`

The iPhone files in commit `ea6eedf` are 1284 × 2778, 8-bit sRGB, opaque, and visually clean: no provider error, personal data, access code, account identifier, or false price claim. Claude disclosed the local Electron capture lineage, and Codex independently verified that `capture-iphone6.js` renders `127.0.0.1:5199` at 428 × 926 CSS, rewrites the capture-only request origin to the shipped `capacitor://localhost` origin, and uses Electron `capturePage()`. Reapplying the disclosed Lanczos conversion to the two 856 × 1852 scratch captures produces zero differing pixels against both committed files (`compare -metric AE = 0`). At capture time, `dist-mobile` and `ios/App/App/public` had no differing common files beyond Capacitor's generated shims and the iOS public tree matched the preserved build-4 archive. That parity is historical: current `ios/App/App/public` was regenerated after `ac04383`, contains the new tile-library copy, and differs from build 4. The three canonical iPad files still have stale provenance and must not be uploaded. Their Desk shows the superseded `SAVED ON THIS IPAD` wording. The newly received build-5 full-screen originals are structurally valid and visually clean for the SERMON desk and PLAIN-study slots, but a true active Preach-Mode original is still absent. Treat all build-5 frames as visual drafts. Stage no partial replacement; build 6 now exists as a source-bound uploaded artifact, but its final screenshot set is still open. Complete PLAIN study / clean SERMON desk / Preach Mode from build 6 or prove pixel-equivalence of any reused build-5 draft against its packaged bytes, then stage and recheck the build-6-proven set for specialist controls, manuscript and preaching actions, recording state, stylus notes, reference tiles, and provider-error absence.

`store/apple-screenshot-verification.json` is the machine-readable Apple clearance receipt. Its current state is `hold`, with all five staged path/hash pairs recorded and no reviewed source asserted. A future clearance requires one explicit `verified` visual `PASS` bound to the exact current Apple bundle ID, marketing version, Xcode build number, immutable candidate-source commit, and live bytes for all five files. The receipt itself must be a nonignored, non-executable regular file tracked with byte- and mode-identical worktree, index, and committed copies; a later evidence commit does not redefine the candidate source. The static receipt validator does not cryptographically prove that a frame was captured from the declared package and does not replace physical/candidate review.

## Android staging screens

- `assets/screenshots/android-phone/00-quick-study-start.png`
- `assets/screenshots/android-phone/01-quick-study.png`
- `assets/screenshots/android-tablet-7/00-guided-study.png`
- `assets/screenshots/android-tablet-7/01-infinite-sermon-desk.png`
- `assets/screenshots/android-tablet-10/00-guided-study.png`
- `assets/screenshots/android-tablet-10/01-infinite-sermon-desk.png`

`store/android-screenshot-verification.json` is the machine-readable Android clearance receipt. Its current state is `hold`, with all six staged path/hash pairs recorded and no reviewed source asserted. A future clearance requires one explicit `verified` visual `PASS` bound to the exact current Android package ID, version name, version code, immutable candidate-source commit, and live bytes for all six files. The receipt itself must be a nonignored, non-executable regular file tracked with byte- and mode-identical worktree, index, and committed copies; a later evidence commit does not redefine the candidate source. The static receipt validator does not cryptographically prove that a frame was captured from the declared package and does not replace physical/candidate review.

`npm run mobile:store:check` validates every set's count and every PNG against the set's accepted exact dimensions, bit depth, color type, and iOS transparency state. Passing those static checks does not clear either documented visual/provenance hold.

## Overlay rules

- Keep the app legible; use one short claim per image.
- Do not place price claims in screenshots unless they exactly match the active store territory.
- Do not show ESV in the initial release.
- Do not imply generated output is guaranteed accurate.
- Do not show personal email, notes, device IDs, access codes, receipts, or account data.
- Capture phone and tablet independently; do not stretch one layout into another.
