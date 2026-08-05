// Apply schema.sql. Idempotent — every statement is CREATE ... IF NOT EXISTS.
const fs = require('fs'); const path = require('path'); const { Pool } = require('pg')
;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  await db.query(sql)
  console.log('schema applied')
  await db.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
