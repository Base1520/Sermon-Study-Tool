// Apply schema.sql. Idempotent — every statement is CREATE ... IF NOT EXISTS.
const fs = require('fs'); const path = require('path'); const { Pool } = require('pg')
;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  await db.query(sql)
  console.log('schema applied')

  /**
   * Comp codes come from the ENVIRONMENT, never from this file.
   *
   * They were hardcoded here — in a PUBLIC GitHub repo — and two of them were
   * unlimited-use. Anyone who opened the repository had permanent free access to
   * a metered product billed to Cole's card, and would never have needed to do
   * anything but read a migration script to get it.
   *
   * Format: OPERATOR_COMP_CODES="CODE:Label:maxUses,CODE:Label:" where an empty
   * maxUses means unlimited. Absent, nothing is seeded and the deploy is still
   * valid — a missing code is a locked door, a leaked one is a bill.
   */
  const raw = process.env.OPERATOR_COMP_CODES || ''
  const CODES = raw.split(',').map(s => s.trim()).filter(Boolean).map((entry) => {
    const [code, label, maxUses] = entry.split(':')
    return [code.trim().toUpperCase(), 'comp', (label || '').trim() || null,
            maxUses && maxUses.trim() ? Number(maxUses) : null]
  }).filter(([code]) => code)

  for (const [code, plan, label, usesMax] of CODES) {
    await db.query(
      `INSERT INTO access_code (code, plan, label, uses_max) VALUES ($1,$2,$3,$4)
       ON CONFLICT (code) DO NOTHING`, [code, plan, label, usesMax])
  }
  console.log(CODES.length
    ? `comp codes seeded (${CODES.length})`
    : 'no comp codes in OPERATOR_COMP_CODES — none seeded')

  /**
   * Kill the codes that leaked.
   *
   * OPERATOR-COLE, OPERATOR-RIKKI and OPERATOR-BETA were committed to a PUBLIC
   * repository, and two of them were unlimited-use. They are in the git history
   * permanently, so removing them from the source is not enough — anyone who
   * reads a single old commit still has them. Revoked here rather than deleted
   * so an attempt to use one leaves a row behind and simply fails.
   */
  const BURNED = ['OPERATOR-COLE', 'OPERATOR-RIKKI', 'OPERATOR-BETA']
  const { rowCount } = await db.query(
    `UPDATE access_code SET revoked_at = now()
      WHERE code = ANY($1) AND revoked_at IS NULL`, [BURNED])
  if (rowCount) console.log(`revoked ${rowCount} leaked comp code(s)`)

  await db.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
