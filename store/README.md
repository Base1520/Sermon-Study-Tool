# The Operator Mobile Store Package

This directory is the single submission source of truth for the iPhone, iPad, and Android releases.

- `metadata.json` — copy for App Store Connect and Google Play.
- `products.md` — subscription identifiers, periods, prices, and allowances.
- `privacy-data.md` — App Privacy and Data safety answers.
- `review-notes.md` — private reviewer instructions and feature disclosures.
- `screenshots.md` — required dimensions and shot sequence.
- `mobile-physical-smoke-matrix.md` — candidate-specific physical execution and visible-control evidence packet.
- `desktop-restored-study-field-test.md` — two-stage Romans 8:1-4 restore/Scholar field packet with an explicit paid-Ask approval boundary.
- `release-checklist.md` — local, legal, console, billing, and backend gates.
- `release-ledger.md` — dated evidence, unresolved blockers, and external-action receipts.
- `ExportOptions.plist` — reproducible App Store Connect export settings after distribution signing is authorized.

Run `npm run mobile:store:check` before every candidate build and `npm run mobile:store:check:live` before any upload or review submission. A passing static check does not authorize submission and does not replace physical-device, sandbox-purchase, TestFlight, or Play internal-track testing.
