# STACK.md — locked decisions (change only with Cole, dated)

| Decision | Locked value | Since |
|---|---|---|
| App shell | Electron (mac dmg + win x64 targets) | pre-2026-07 |
| Frontend | React + TypeScript + Vite | pre-2026-07 |
| Product name / appId | "BASE 1520" / `com.base1520.sermontool` | pre-2026-07 |
| Signing | Base 1520 LLC (6UP72M96Q5), hardened runtime | pre-2026-07 |
| Distribution | Direct dmg/exe to beta pastors (see BETA_SETUP.md); electron-builder `--publish` for releases | pre-2026-07 |
| Admin/beta split | `VITE_ADMIN` build flag | pre-2026-07 |
| Brand | BASE canonical: #e5be49 gold / #283517 army / Saira + Inter (Option A) | 2026-07-10 |
| AI model (if/when AI features land) | Claude via Anthropic SDK; default `claude-opus-4-8` | 2026-07-11 (default, revisit at feature time) |

## APIs / keys the app touches
_(names only — secrets never live in this repo)_
- [DRAFT — owning session: enumerate actual integrations here as they exist]

## Future-known (not yet in scope — do not build ahead)
- Specialist agent chat tabs (Exegetical / Theological / Homiletical) — vault: `project_specialist_agents`
- Convergence with the fitness build into ONE BASE app — vault: `project_big_picture`
