# CLAUDE.md — sermon-tool (BASE 1520 sermon study app)

Read this first, every session. Spec lives in `SPEC/`, locked decisions in `STACK.md`, reference patterns in `STEAL/`. Scaffold added 2026-07-11 by the counterpart session (Cole's vault: `/Users/colepermenter/Claude`); the build itself is owned by its own chat/sessions — refine these docs there as the product evolves.

## What this is (one breath)
A text-driven sermon **preparation** app — exegeting passages in their proper context, with phrasing diagrams. The "spirit/mind" pillar of BASE 1520's app vision. Working name "The Theologian" is a **placeholder Cole dislikes** — don't bake the name into UI copy or marketing strings; product name in the build config is "BASE 1520".

## Who it's for
Under-resourced pastors and serious lay teachers — the same audience as Cole's COVENANT method and the Spiritual Operator's Manual. Not academics. Assume no seminary Greek; never assume no intelligence.

## Rules of the road
- **THE ASK format:** every build request should read "Build [FEATURE] so that [outcome on the one screen]" — if a request is vaguer than that, check `SPEC/one-screen.md` before improvising scope.
- **Ship the one screen first** (`SPEC/one-screen.md`). Features that don't serve it are v2.
- **Brand:** gold `#e5be49`, army `#283517`, Saira (display) + Inter (body) — the canonical BASE brand system (vault: `Projects/BASE 1520 — Brand System (canonical).md`). No off-brand colors/fonts in UI.
- **Do not touch:** `dist/`, `dist-electron/`, `build/` signing assets (`entitlements.mac.plist`, icons), the `identity` in package.json ("Base 1520 LLC (6UP72M96Q5)").
- **Beta discipline:** beta builds use `npm run build:beta` (`VITE_ADMIN=false`); admin features stay behind `VITE_ADMIN`. Beta pastors are real users — no debug UI in beta builds. See `BETA_SETUP.md`.
- **Theology guardrails:** the tool teaches METHOD (context-first exegesis), it does not preach conclusions. Where doctrinal framing is unavoidable, it follows Cole's documented positions (vault Knowledge tree) — never invent positions for him.
- **Commits:** small, imperative-mood messages; never commit `node_modules`, secrets, or `.env*`.

## Commands
- Dev: `npm run dev` (vite + electron, port 5173)
- Beta build (mac): `npm run build:beta` · Windows: `npm run build:beta-win`
- Admin build: `npm run build:admin`
