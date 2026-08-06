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
  const CODES = []
  for (const entry of raw.split(',').map(x => x.trim()).filter(Boolean)) {
    const [code, label, maxUses] = entry.split(':')
    const clean = (code || '').trim().toUpperCase()
    if (!clean) continue

    // A TYPO MUST NOT TAKE THE API OFFLINE. migrate runs as Railway's
    // preDeployCommand, so anything that throws here blocks the deploy and
    // leaves the previous container serving — or, on a cold start, nothing at
    // all. A malformed entry is skipped and logged; the rest still seed.
    let limit = null
    if (maxUses !== undefined && String(maxUses).trim() !== '') {
      const n = Number(maxUses)
      if (!Number.isInteger(n) || n <= 0) {
        console.error(`[codes] ignoring ${clean}: use count "${maxUses}" is not a positive integer`)
        continue
      }
      limit = n
    } else if (maxUses === undefined) {
      // A MISSING FIELD IS NOT PERMISSION TO BE UNLIMITED. "CODE:Label" with no
      // third field used to mint an unlimited code silently — the same footgun
      // that leaked three unlimited codes into a public repo. Unlimited must be
      // written out as an explicit empty third field: "CODE:Label:".
      console.error(`[codes] ignoring ${clean}: no use count. Write "${clean}:Label:" for unlimited.`)
      continue
    }
    CODES.push([clean, 'comp', (label || '').trim() || null, limit])
  }

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

  /**
   * REVOKING A CODE DOES NOT UNDO WHAT IT ALREADY MINTED.
   *
   * The three leaked codes were live in a public repo. Anyone who redeemed one
   * got a real account and a real device token, and revoking the code leaves
   * both working forever — the token is what authenticates, not the code. So the
   * accounts are downgraded and their tokens revoked too.
   *
   * Scoped strictly to accounts created BY those codes, via access_code_use.
   */
  const { rows: burnedAccounts } = await db.query(
    `SELECT DISTINCT account_id FROM access_code_use
      WHERE code = ANY($1) AND account_id IS NOT NULL`, [BURNED])
  if (burnedAccounts.length) {
    const ids = burnedAccounts.map((r) => r.account_id)
    await db.query(
      `UPDATE device SET revoked_at = now()
        WHERE account_id = ANY($1) AND revoked_at IS NULL`, [ids])
    await db.query(
      `UPDATE account SET plan = 'free', status = 'none'
        WHERE id = ANY($1) AND plan = 'comp'`, [ids])
    console.log(`revoked ${ids.length} account(s) minted from leaked codes`)
  }

  await db.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
