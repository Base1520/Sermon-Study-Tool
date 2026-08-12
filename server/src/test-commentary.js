const assert = require('assert')
const { passageBook, searchTerms, retrieveCommentary } = require('./commentary')

async function main() {
  assert.strictEqual(passageBook('1 Corinthians 13:1-13'), '1 corinthians')
  assert.deepStrictEqual(searchTerms('Christ is supreme over creation and Christ reconciles'), ['christ', 'supreme', 'over', 'creation', 'reconciles'])

  const grounded = await retrieveCommentary({
    reference: 'Colossians 1:15-20',
    passageText: 'the image of the invisible God, the firstborn of every creature, by him were all things created',
    mainTheme: 'Christ is supreme over creation and reconciliation',
  })
  assert.strictEqual(grounded.status, 'grounded')
  assert.ok(grounded.sources.length > 0)
  assert.ok(grounded.sources.every((source) => source.rightsTier === 'public_domain' && source.citationId.startsWith('SRC:')))

  const uncovered = await retrieveCommentary({
    reference: 'Genesis 1:1',
    passageText: 'In the beginning God created the heaven and the earth.',
    mainTheme: 'God created all things',
  })
  assert.strictEqual(uncovered.status, 'no_result')
  assert.deepStrictEqual(uncovered.sources, [])
  console.log('COMMENTARY RETRIEVAL\n  5 passed, 0 failed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
