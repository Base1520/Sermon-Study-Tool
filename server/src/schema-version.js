const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const SCHEMA_VERSION = 'operator-generation-integrity-v10'
const SCHEMA_PATH = path.join(__dirname, 'schema.sql')

function readSchemaSql() {
  return fs.readFileSync(SCHEMA_PATH, 'utf8')
}

function schemaSha256(sql = readSchemaSql()) {
  return crypto.createHash('sha256').update(sql).digest('hex')
}

module.exports = {
  SCHEMA_PATH,
  SCHEMA_VERSION,
  readSchemaSql,
  schemaSha256,
}
