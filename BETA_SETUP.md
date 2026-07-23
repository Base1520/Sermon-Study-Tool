# Beta Launch Checklist

## Building (the only commands you need)

```bash
npm run build:admin      # → your copy (Comply/Ignore controls)
npm run build:beta       # → Mac beta for pastors
npm run build:beta-win   # → Windows beta
```

The admin flag is passed inline by these scripts — it overrides every `.env`
file, so the old `.env` copy-dance is gone (it was silently broken: Vite's
`.env.local` outranks `.env`, which shipped admin builds to beta).

Output lands in `dist-electron/`. Rename before sharing:
- `BASE 1520-<version>.dmg` from build:admin → `BASE1520-Admin.dmg`
- `BASE 1520-<version>.dmg` from build:beta → `BASE1520-Beta.dmg`
- `BASE 1520 Setup <version>.exe` → `BASE1520-Beta-Windows.exe`

## Supabase (done — table exists)

Optional upgrade — run in the SQL Editor to capture app version + platform
with each feedback row (the app degrades gracefully without it):

```sql
alter table beta_feedback
  add column if not exists version text,
  add column if not exists platform text;
```

## Sharing

1. Upload the beta builds to Google Drive → Share → Anyone with the link
2. Mac testers: right-click → Open the first time (Gatekeeper)
3. Windows testers: SmartScreen will warn (unsigned) → More info → Run anyway
4. Each tester needs an Anthropic API key. Cleanest: create one key per
   tester in your Anthropic console (Settings → API keys) — billed to you,
   revocable individually, per-key usage visible.

## Watching feedback

Your admin copy → ✉ → Live Feed. Comply/Ignore on each item; testers see
your decision. Failed submissions now show an error instead of fake success.
