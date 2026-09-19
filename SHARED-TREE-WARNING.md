# ⚠️ TWO CLAUDE SESSIONS SHARE THIS WORKING TREE — READ BEFORE `railway up`

**`railway up` uploads the WORKING TREE, not a commit.** It ships every uncommitted change in
this repo, including changes written by the other session, reviewed or not.

Two sessions work here:
- **the SOM manual session** — the book, its formats, buyer delivery, Mailchimp
- **the Operator session** — the app, entitlements, Stripe money path

Both edit `server/src/som-purchase.js`. There is no lock and, while the tree is uncommitted,
no recovery point either.

**This already went wrong once.** On 2026-09-18 at 17:36Z a deploy intended to ship SOM EPUB
delivery also shipped an entire unreviewed Stripe money-path round (`paymentAllowsDownload`,
permission-error rethrows, dispute-ordering changes, a widened resync sweep). It happened to be
safe — it was tested, and the scopes/merge-field/env-var it depended on had been verified
independently — but nobody chose to ship it.

## Before you deploy
1. `git status --porcelain` — if you see files you did not touch, **stop**. Someone else's work
   is about to ship under your deploy.
2. Say what you are shipping in `System/AI-Collaboration/HANDOFF.md` first.
3. Prefer committing before deploying, so there is something to roll back to.

## Current state (2026-09-18)
Live deployment `cd69f0a1` was built from an UNCOMMITTED tree containing three overlapping
changes from three writers:
1. SOM buyer durable download + `DLURL`
2. Operator/Codex money-path audit round
3. SOM EPUB delivery + `DLURLEPUB`

Snapshots: `../sermon-tool-uncommitted-backups/2026-09-18-post-codex-plus-epub/`
