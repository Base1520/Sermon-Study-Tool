/**
 * seed-codes.js — create the comp codes Cole hands out.
 *
 * Run as part of the migration, so the codes exist the moment the server does.
 * Idempotent: ON CONFLICT DO NOTHING, so re-running never resets a use count or
 * un-revokes something Cole killed on purpose.
 *
 *   npm run seed-codes
 */

const { Pool } = require('pg')

const CODES = [
  // Personal, single-install. These are the two that matter on day one.
  { code: 'OPERATOR-COLE',  plan: 'comp', label: 'Cole',  usesMax: null },
  { code: 'OPERATOR-RIKKI', plan: 'comp', label: 'Rikki', usesMax: null },
  // For the seven beta testers. One code, seven installs, revocable in one
  // statement if it ends up somewhere public.
  { code: 'OPERATOR-BETA',  plan: 'comp', label: 'Beta',  usesMax: 25 },
]

async function main() {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (const c of CODES) {
    await db.query(
      `INSERT INTO access_code (code, plan, label, uses_max)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING`,
      [c.code, c.plan, c.label, c.usesMax],
    )
    console.log(`[codes] ${c.code} (${c.label}, ${c.usesMax ?? 'unlimited'} uses)`)
  }
  await db.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
