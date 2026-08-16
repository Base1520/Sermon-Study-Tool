# Store Asset Plan

> Apple submission hold: the two iPhone files pass format, visual, and capture-provenance review. The connected physical iPad reports installed Operator `1.4.2 (5)`, and three new full-screen originals (`IMG_0158.PNG`–`IMG_0160.PNG`) independently measure 2732 × 2048, opaque RGB PNG. Visual review identifies a clean SERMON desk plus two clean PLAIN-study views; none is the required active Preach-Mode frame. These are build-5 visual drafts only. Subsequent candidate evidence proves build 5 fails required C05, so build 6 is the current fail-closed final-screenshot path without inventing a historical Cole choice. After build 6 exists, reproduce the complete three-slot set or prove pixel-equivalence against packaged build 6, then stage and recheck the build-6-proven replacements. Do not clear this hold from the two completed drafts alone.

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

The iPhone files in commit `ea6eedf` are 1284 × 2778, 8-bit sRGB, opaque, and visually clean: no provider error, personal data, access code, account identifier, or false price claim. Claude disclosed the local Electron capture lineage, and Codex independently verified that `capture-iphone6.js` renders `127.0.0.1:5199` at 428 × 926 CSS, rewrites the capture-only request origin to the shipped `capacitor://localhost` origin, and uses Electron `capturePage()`. Reapplying the disclosed Lanczos conversion to the two 856 × 1852 scratch captures produces zero differing pixels against both committed files (`compare -metric AE = 0`). At capture time, `dist-mobile` and `ios/App/App/public` had no differing common files beyond Capacitor's generated shims and the iOS public tree matched the preserved build-4 archive. That parity is historical: current `ios/App/App/public` was regenerated after `ac04383`, contains the new tile-library copy, and differs from build 4. The three canonical iPad files still have stale provenance and must not be uploaded. Their Desk shows the superseded `SAVED ON THIS IPAD` wording. The newly received build-5 full-screen originals are structurally valid and visually clean for the SERMON desk and PLAIN-study slots, but a true active Preach-Mode original is still absent. Treat all build-5 frames as visual drafts. Stage no partial replacement; after build 6 exists, complete PLAIN study / clean SERMON desk / Preach Mode from build 6 or prove pixel-equivalence against its packaged bytes, then stage and recheck the build-6-proven set for specialist controls, manuscript and preaching actions, recording state, stylus notes, reference tiles, and provider-error absence.

## Android staging screens

- `assets/screenshots/android-phone/00-quick-study-start.png`
- `assets/screenshots/android-phone/01-quick-study.png`
- `assets/screenshots/android-tablet-7/00-guided-study.png`
- `assets/screenshots/android-tablet-7/01-infinite-sermon-desk.png`
- `assets/screenshots/android-tablet-10/00-guided-study.png`
- `assets/screenshots/android-tablet-10/01-infinite-sermon-desk.png`

`npm run mobile:store:check` validates every set's count and every PNG against the set's accepted exact dimensions, bit depth, color type, and iOS transparency state. Passing those static checks does not clear either documented visual/provenance hold.

## Overlay rules

- Keep the app legible; use one short claim per image.
- Do not place price claims in screenshots unless they exactly match the active store territory.
- Do not show ESV in the initial release.
- Do not imply generated output is guaranteed accurate.
- Do not show personal email, notes, device IDs, access codes, receipts, or account data.
- Capture phone and tablet independently; do not stretch one layout into another.
