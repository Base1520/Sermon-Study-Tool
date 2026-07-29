const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const {
  isRetrievalEnabled,
  selectScopedResults,
  validateCommentarySynthesis,
} = require('../electron/commentary-contract')

const root = path.join(__dirname, '..')
const retrievalRoot = path.join(root, 'resources', 'theology-retrieval')
const manifest = JSON.parse(fs.readFileSync(path.join(retrievalRoot, 'bundle-manifest.json'), 'utf8'))

const cases = [
  { reference: 'Philemon 15-16', query: 'Philemon receive beloved brother providence', expected: 'grounded' },
  { reference: 'Philemon 17-21', query: 'Philemon receive him debt charge account', expected: 'grounded' },
  { reference: 'Colossians 1:15-20', query: 'Colossians image firstborn creation reconciliation', expected: 'grounded' },
  { reference: 'Revelation 20:7-15', query: 'Revelation final judgment book of life', expected: 'no_result' },
  { reference: 'Zephaniah 1:14-18', query: 'Zephaniah day of the Lord judgment', expected: 'no_result' },
]

function evaluate(testCase) {
  const scopeProbe = selectScopedResults([], manifest, testCase.reference)
  if (!scopeProbe.covered) {
    return { ...testCase, actual: 'no_result', citations: [], pass: testCase.expected === 'no_result' }
  }

  const stdout = execFileSync('python3', [
    path.join(retrievalRoot, 'theology_retrieval.py'),
    '--db', path.join(retrievalRoot, 'library.sqlite3'),
    'query', testCase.query,
    '--limit', '64',
    '--source-type', 'commentary',
    '--json',
  ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  const results = selectScopedResults(JSON.parse(stdout).results, manifest, testCase.reference).results
  const citations = results.map(result => `SRC:${result.source_id}:${result.chunk_id}`)
  const actual = citations.length > 0 ? 'grounded' : 'no_result'
  return {
    ...testCase,
    actual,
    citations,
    authors: [...new Set(results.map(result => result.author))],
    allPublicDomain: results.every(result => result.rights_tier === 'public_domain'),
    pass: actual === testCase.expected && results.every(result => result.rights_tier === 'public_domain'),
  }
}

const results = cases.map(evaluate)
const passed = results.filter(result => result.pass).length
const contractSource = {
  citationId: 'SRC:test-source:1',
  author: 'Test Author',
  title: 'Test Commentary',
  publicationYear: '1900',
  edition: 'Test Edition',
  locator: 'text chunk 1',
  rightsTier: 'public_domain',
  canonicalUrl: 'https://example.test',
  excerpt: 'A grounded excerpt.',
  provenance: 'SOURCE TEXT',
}
const validSynthesis = {
  voices: [{
    name: 'Test Author',
    era: '1900',
    claims: [{
      text: 'A grounded synthesis.',
      provenance: 'THEOLOGICAL SYNTHESIS',
      citationIds: ['SRC:test-source:1'],
    }],
  }],
  convergence: null,
  divergence: null,
}
const contractChecks = [
  { name: 'feature flag defaults off', pass: !isRetrievalEnabled({ theologyRetrieval: false }, {}) },
  { name: 'environment enables feature', pass: isRetrievalEnabled({ theologyRetrieval: false }, { THEOLOGY_RETRIEVAL_ENABLED: 'true' }) },
  { name: 'valid cited synthesis passes', pass: (() => { try { validateCommentarySynthesis(validSynthesis, [contractSource]); return true } catch { return false } })() },
  { name: 'uncited claim rejected', pass: (() => { try { validateCommentarySynthesis({ ...validSynthesis, voices: [{ ...validSynthesis.voices[0], claims: [{ ...validSynthesis.voices[0].claims[0], citationIds: [] }] }] }, [contractSource]); return false } catch { return true } })() },
  { name: 'wrong author rejected', pass: (() => { try { validateCommentarySynthesis({ ...validSynthesis, voices: [{ ...validSynthesis.voices[0], name: 'Invented Author' }] }, [contractSource]); return false } catch { return true } })() },
  { name: 'empty invented voice rejected', pass: (() => { try { validateCommentarySynthesis({ ...validSynthesis, voices: [{ name: 'Invented Author', era: '1900', claims: [] }] }, [contractSource]); return false } catch { return true } })() },
]
const contractPassed = contractChecks.filter(check => check.pass).length
const report = {
  generatedAt: new Date().toISOString(),
  behavior: 'Return cited public-domain excerpts for covered books; otherwise return an honest no-result without model-memory fallback.',
  failureConsequence: 'A false grounded result can misattribute commentary in sermon preparation.',
  candidate: {
    featureFlagDefault: false,
    corpusSources: manifest.sources.length,
    synthesisModel: 'claude-sonnet-4-6',
  },
  metrics: {
    cases: results.length,
    passed,
    safeOutcomeRate: passed / results.length,
    contractChecks: contractChecks.length,
    contractChecksPassed: contractPassed,
    groundedCases: results.filter(result => result.actual === 'grounded').length,
    honestNoResultCases: results.filter(result => result.actual === 'no_result').length,
  },
  results,
  contractChecks,
  limitation: 'This demo-sized evaluation exercises the shared scope, feature-flag, and citation-validation contract but does not launch packaged Electron, call the live synthesis model, establish production readiness, or independently score model prose.',
}

const outputPath = path.join(root, 'evaluations', 'commentary-retrieval-2026-07-23.json')
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (passed !== results.length || contractPassed !== contractChecks.length) process.exitCode = 1
