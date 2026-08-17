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

Run `npm run mobile:store:check` before every candidate build. Use `npm run mobile:store:check:public` for a non-mutating public refresh of production health plus the legal/support pages; it intentionally skips the unauthenticated API route probes and reports non-substitutable partial evidence. Before any upload or review submission, run the explicitly pinned full `npm run mobile:store:check:live` only with fresh action-time approval because it retains empty POST/PATCH route probes. Neither command authorizes upload or submission or replaces physical-device, sandbox-purchase, TestFlight, or Play internal-track testing.
