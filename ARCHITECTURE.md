# ARCHITECTURE — where to fix things

*Written 2026-08-15 under Cole's order to make the tree "super fixable as it gets bigger."
Rule of thumb: if you can't find the home of a bug from this page in one jump, this page
is the bug — fix it too.*

## The 30-second picture

Four pieces, one core engine:

| Piece | Lives in | What it is |
|---|---|---|
| **The core reading engine** | `electron/plainread/` | Plain Read, analysis, Ask, prompts, pipeline, and validation. Pure Node, dependency-injected, imports nothing from Electron. |
| **Desktop app (main)** | `electron/main.js` + `electron/hosted/`, `license/`, `groupguide/` | IPC handlers, local cache/history, hosted-API client, licensing. |
| **Desktop app (UI)** | `src/App.tsx` + `src/components/` | React renderer. App.tsx holds workspace state; components hold the panels. |
| **Server** | `server/src/` | The hosted API on Railway. Runs the same core Plain Read/analyze/Ask source through `engine.js`; Quick Study, Guided Study, and specialist behavior also have server-owned modules here. |

**The one rule that keeps fixes cheap:** desktop and server import the same
`electron/plainread/` source — `server/src/engine.js` is the hosted adapter, not a copy
of that engine. A fix to the shared core can therefore land on both sides in one edit.
If core behavior differs, start at the adapter and its callers; input/configuration or
packaged-source drift can also cause a mismatch.

## Where do I fix…

| Symptom / feature | Go to |
|---|---|
| The reading's content, sections, prompts, validation | `electron/plainread/pipeline.js`, `prompt.js`, `analyze.js`, `validate.js`, `verify.js` |
| Metering: reservations, settle/refund, allowances, caps | `server/src/meter.js` (ledger primitives) + callers in `server/src/index.js` and `server/src/routes/generation.js`; `server/src/engine.js` records provider usage |
| Server `/v1/read` ride/retry/double-charge behavior | `server/src/read-resume.js` (decisions) + owner-bound study-row access in `server/src/engine.js` + `/v1/read` route in `index.js` |
| Analyze, Quick Study, or Guided Study route wiring | `server/src/routes/generation.js` (route bodies) + shared claim/account policy in `server/src/index.js` |
| Scholar/specialist answers, their prompts & safety rules | `server/src/sermon-assist.js` (both modes: grounded + general) |
| Owned-study Ask, grounded-specialist, and commentary gates | `server/src/study-ai-access.js` |
| Sign-in, tokens, device links, access-code activation | `server/src/auth.js`, `mobile.js`, `account-registration.js`, `account-recovery.js`, `routes/community.js`, `redeem.js` |
| Subscriptions, catalog, Stripe, IAP | Plans/entitlements: `server/src/entitlement.js`; subscription state: `billing.js` + `billing-period.js`; Stripe/web/SOM: `stripe.js` + `web-purchase.js` + `som-purchase.js`; native stores: `iap.js` + `iap-products.json` |
| Desktop ↔ server HTTP (timeouts, streaming, NDJSON) | `electron/hosted/client.js`; IPC error transport: `electron/main.js` + `src/lib/hostedError.ts` |
| Desktop resume-on-launch decisions | `electron/hosted/resume-policy.js` + orchestration in `electron/main.js` and `src/App.tsx` |
| What an error says to the reader | `electron/main.js` + `src/lib/hostedError.ts` (hosted refusal/offer bridge) · `src/lib/apiErrors.ts` (friendly copy) · route bodies (server copy) |
| A specific UI panel | `src/components/<Panel>.tsx` (ScholarChat, AskPanel, CommentaryPanel, …) |
| Workspace state, view switching, top-level effects | `src/App.tsx` |
| A desktop IPC action (`ipcMain.handle('name')`) | `electron/main.js` — grep the handler name |
| Study id memory (reference → hosted study) | `rememberStudy`/`recallStudy` in `electron/main.js` (~lines 47–76) |
| Release pipeline, guards, verifiers | `package.json` scripts + `scripts/release.sh` + `scripts/check-*.sh` + `scripts/verify-*.sh` + `scripts/test-*.{sh,mjs}` + `.github/workflows/windows-release.yml` |
| Store readiness state (always run the current board; static checks alone do not establish submission readiness) | `scripts/check-mobile-store-readiness.mjs` + `store/release-checklist.md` + `store/release-ledger.md` |
| Mobile (Capacitor) app | `src/mobile/` + `capacitor.config.ts` + `vite.mobile.config.ts` + `ios/` + `android/` |

## The deliberate monoliths (and the split plan)

Three files are big on purpose-until-now. The server split is in motion; the Electron
and App splits remain planned — behavior-preserving, test-pinned, one audited step at
a time (see HANDOFF 2026-08-15 22:15 for the unit plan):

- **`server/src/index.js` (~860)** — central route wiring + 7 direct registrations. The
  community and generated-study groups now live in `server/src/routes/community.js`
  and `server/src/routes/generation.js`; the plan-defined model-spend routes `/v1/read`,
  `/v1/ask`, and `/v1/sermon-assist` remain inline because they carry the densest
  structural-test pins and the store push depends on them. These extracted modules use
  `mount(app, db, { ...dependencies })`, export `{ mount }`, and are called from their
  former registration positions in `index.js`.
- **`electron/main.js` (2,641)** — 66 direct `ipcMain.handle(...)` registrations. Split
  planned AFTER the store push; do not rebuild/reinstall solely for this refactor first.
- **`src/App.tsx` (1,772)** — workspace state. New UI should preferentially land in
  `src/components/`; split App last because renderer risk is highest.

## Tests — what protects what

Core named regression: `npm run --ignore-scripts test:release` (current sample 15.85s,
exit 0; its final step is `tsc --noEmit`). `--ignore-scripts` deliberately skips npm
lifecycle hooks, so this runs only the named body. Use `npm run test:release` when the
`pretest:release` lifecycle must also run. Run `npm run mobile:store:check` separately;
the store board intentionally exits 1 while release blockers remain.

- Tests usually colocate with their subsystem (`server/src/test-*.js`,
  `electron/plainread/test-*.js`); cross-cutting UI, release, and record guards live in
  `scripts/`.
- Many tests are **source-structural**: they read a file and pin exact lines (route shapes,
  guard calls, command wiring). These pins are load-bearing audit guards, not trivia — when
  a refactor moves code, every affected pin must move WITH ITS INTENT INTACT, and the move
  gets documented in the HANDOFF unit that made it. Deleting an inconvenient pin is how a
  money guard dies silently.
- The mutation discipline: for high-risk guards, promotion requires a mutation of the
  protected behavior to fail the suite BY NAME, with that kill recorded in HANDOFF.

## Records & coordination

- `store/release-checklist.md` + `store/release-ledger.md` — human-maintained canonical
  release truth. Update synchronized state together, then rerun
  `scripts/check-mobile-store-readiness.mjs`, which checks selected shared predicates.
- `System/AI-Collaboration/HANDOFF.md` (in the vault) — the Claude/Codex war log. One
  task has one implementing owner and one reviewer; the reviewer independently checks
  the highest-risk claims, and the owner records final canonical state. This refactor
  additionally used one-file locks and per-unit adversarial audits.
- Pre-refactor snapshot (directory/key-file existence verified; verify completeness
  before relying on rollback): `~/DevProjects/sermon-tool-SNAPSHOT-pre-refactor-2026-08-15/`.
