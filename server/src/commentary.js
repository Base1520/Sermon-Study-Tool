const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)
const ROOT = path.join(__dirname, '../../resources/theology-retrieval')
const DATABASE = path.join(ROOT, 'library.sqlite3')
const MANIFEST = path.join(ROOT, 'bundle-manifest.json')
const STOP_WORDS = new Set(['about', 'after', 'again', 'against', 'being', 'between', 'from', 'have', 'into', 'that', 'their', 'there', 'these', 'they', 'this', 'through', 'what', 'when', 'where', 'which', 'with', 'your'])

function passageBook(reference) {
  return String(reference || '')
    .replace(/\s+\d.*$/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function manifest() {
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
}

function searchTerms(value) {
  return [...new Set(String(value || '').toLowerCase().match(/[a-z]{4,}/g) || [])]
    .filter((term) => !STOP_WORDS.has(term))
    .slice(0, 16)
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

async function retrieveCommentary({ reference, passageText, mainTheme }) {
  const book = passageBook(reference)
  const bundle = manifest()
  const sources = bundle.sources.filter((source) => source.rightsTier === 'public_domain' && source.bookRanges?.[book])
  if (!sources.length) {
    return {
      status: 'no_result',
      message: `The verified public-domain library does not yet cover ${book || reference}. Nothing was generated from memory.`,
      sources: [],
    }
  }

  const terms = searchTerms(`${mainTheme || ''} ${passageText || ''}`)
  if (!terms.length) {
    return { status: 'no_result', message: `No searchable passage terms were available for ${reference}.`, sources: [] }
  }
  const fts = terms.map((term) => `"${term}"`).join(' OR ')
  const sourceIds = sources.map((source) => sqlString(source.sourceId)).join(', ')
  const query = `
    SELECT c.chunk_id, c.locator, c.content, s.source_id, s.title, s.author,
           s.publication_year, s.rights_tier, s.canonical_url,
           bm25(chunks_fts, 1.0, 0.5) AS score
      FROM chunks_fts
      JOIN chunks c ON c.chunk_id = chunks_fts.rowid
      JOIN sources s ON s.source_id = c.source_id
     WHERE chunks_fts MATCH ${sqlString(fts)}
       AND c.source_id IN (${sourceIds})
     ORDER BY score
     LIMIT 6;`

  try {
    const { stdout } = await execFileAsync('sqlite3', ['-json', DATABASE, query], { maxBuffer: 1024 * 1024 })
    const rows = stdout.trim() ? JSON.parse(stdout) : []
    const results = rows.map((row) => ({
      citationId: `SRC:${row.source_id}:${row.chunk_id}`,
      author: String(row.author || ''),
      title: String(row.title || ''),
      publicationYear: String(row.publication_year || ''),
      locator: String(row.locator || ''),
      canonicalUrl: String(row.canonical_url || ''),
      excerpt: String(row.content || '').slice(0, 2_400),
      rightsTier: 'public_domain',
    }))
    return results.length
      ? { status: 'grounded', message: 'Retrieved only from verified public-domain source text.', sources: results }
      : { status: 'no_result', message: `The library covers ${book}, but no passage-specific excerpt was found. Nothing was generated from memory.`, sources: [] }
  } catch {
    return {
      status: 'unavailable',
      message: 'The cited commentary index is unavailable right now. Nothing was generated from memory.',
      sources: [],
    }
  }
}

module.exports = { passageBook, searchTerms, retrieveCommentary }
