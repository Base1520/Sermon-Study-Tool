// Apply schema.sql. Idempotent — every statement is CREATE ... IF NOT EXISTS.
const fs = require('fs'); const path = require('path'); const { Pool } = require('pg')
;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  await db.query(sql)
  console.log('schema applied')

  // Seed the comp codes in the SAME step as the schema. They are the only way
  // Cole and Rikki get into their own product, so a deploy that creates the
  // tables but not the codes is a deploy that locks them out.
  const CODES = [
    ['OPERATOR-COLE',  'comp', 'Cole',  null],
    ['OPERATOR-RIKKI', 'comp', 'Rikki', null],
    ['OPERATOR-BETA',  'comp', 'Beta',  25],
  ]
  for (const [code, plan, label, usesMax] of CODES) {
    await db.query(
      `INSERT INTO access_code (code, plan, label, uses_max) VALUES ($1,$2,$3,$4)
       ON CONFLICT (code) DO NOTHING`, [code, plan, label, usesMax])
  }
  console.log(`comp codes seeded (${CODES.length})`)

  await db.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
