const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { resolveOwnedStudyDocument } = require('./study-ai-access')
const { buildStudyCommentaryHandler } = require('./study-commentary')

let passed = 0
let failed = 0

async function test(name, operation) {
  try {
    await operation()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name} — ${error.message}`)
  }
}

function dbReturning(rows) {
  const calls = []
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params })
      return { rows }
    },
  }
}

function routeSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0, `missing route ${startMarker}`)
  assert.ok(end > start, `missing route boundary after ${startMarker}`)
  return source.slice(start, end)
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

;(async () => {
  console.log('\nOWNED STUDY AI ACCESS')

  await test('a completed owned study returns its server document and analysis', async () => {
    const study = {
      reference: '1 Peter 4:7-11',
      document: { reference: '1 Peter 4' },
      analysis: { mainTheme: 'Serve faithfully' },
    }
    const db = dbReturning([study])
    const result = await resolveOwnedStudyDocument(db, {
      studyId: 'study-1', accountId: 'account-1', installId: 'install-1', surface: 'ask',
    })
    assert.deepEqual(result, { ok: true, study })
    assert.match(db.calls[0].sql, /SELECT reference, analysis, document/)
    assert.deepEqual(db.calls[0].params, ['study-1', 'account-1', 'install-1'])
  })

  await test('an owned study whose reading is unfinished gets an actionable non-404 response', async () => {
    const db = dbReturning([{ document: null, analysis: { mainTheme: 'Serve faithfully' } }])
    const result = await resolveOwnedStudyDocument(db, {
      studyId: 'study-1', accountId: 'account-1', installId: 'install-1', surface: 'specialist',
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 409)
    assert.equal(result.body.error, 'STUDY_READING_REQUIRED')
    assert.match(result.body.message, /open this study's reading/i)
    assert.match(result.body.message, /let it finish/i)
    assert.doesNotMatch(result.body.message, /finished study/i)
  })

  await test('unfinished commentary waits for the owned reading instead of reporting a missing study', async () => {
    const result = await resolveOwnedStudyDocument(dbReturning([{
      reference: '1 Peter 4:7-11', document: null, analysis: { mainTheme: 'Serve faithfully' },
    }]), {
      studyId: 'study-1', accountId: 'account-1', installId: 'install-1', surface: 'commentary',
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 409)
    assert.equal(result.body.error, 'STUDY_READING_REQUIRED')
    assert.match(result.body.message, /open this study's reading/i)
    assert.match(result.body.message, /let it finish/i)
    assert.match(result.body.message, /commentaries/i)
  })

  await test('a missing or unauthorized study stays a non-oracular 404', async () => {
    const result = await resolveOwnedStudyDocument(dbReturning([]), {
      studyId: 'study-other', accountId: 'account-1', installId: 'install-1', surface: 'ask',
    })
    assert.deepEqual(result, {
      ok: false,
      status: 404,
      body: {
        error: 'STUDY_NOT_FOUND',
        message: 'Open a study from your library, then ask from that reading.',
      },
    })
  })

  await test('the ownership query does not discard null documents before the route can distinguish them', async () => {
    const db = dbReturning([{ document: null, analysis: {} }])
    await resolveOwnedStudyDocument(db, {
      studyId: 'study-1', accountId: null, installId: 'install-1', surface: 'ask',
    })
    const { sql, params } = db.calls[0]
    assert.doesNotMatch(sql, /document\s+IS\s+NOT\s+NULL/i)
    assert.match(sql, /account_id\s*=\s*\$2/)
    assert.match(sql, /account_id\s+IS\s+NULL\s+AND\s+install_id\s*=\s*\$3/)
    assert.deepEqual(params, ['study-1', null, 'install-1'])
  })

  await test('both spending routes use the shared gate before reserving an ask', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
    for (const [start, end, surface] of [
      ["app.post('/v1/ask'", 'const SERMON_AGENT_ROLES', 'ask'],
      ["app.post('/v1/sermon-assist'", "app.get('/v1/studies/:id/commentary'", 'specialist'],
    ]) {
      const route = routeSource(source, start, end)
      const gate = route.indexOf(`surface: '${surface}'`)
      const reserve = route.indexOf('meter.reserveAsk')
      assert.ok(gate >= 0, `${surface} route does not invoke the shared study gate`)
      assert.ok(reserve > gate, `${surface} route reserves spend before the study gate`)
      assert.doesNotMatch(route, /document\s+IS\s+NOT\s+NULL/i)
      assert.match(route, /access\.status/)
      assert.match(route, /access\.body/)
    }
  })

  await test('unfinished commentary stops before the commentary library is queried', async () => {
    const db = dbReturning([{
      reference: '1 Peter 4:7-11', document: null, analysis: { mainTheme: 'Serve faithfully' },
    }])
    const retrievals = []
    const handler = buildStudyCommentaryHandler({
      db,
      retrieve: async (input) => {
        retrievals.push(input)
        return { status: 'grounded', message: 'should not run', sources: [] }
      },
    })
    const res = responseRecorder()
    await handler({
      identity: { account: { id: 'account-1' }, installId: 'install-1' },
      params: { id: 'study-1' },
    }, res)

    assert.equal(res.statusCode, 409)
    assert.equal(res.body.error, 'STUDY_READING_REQUIRED')
    assert.deepEqual(retrievals, [])
    assert.deepEqual(db.calls[0].params, ['study-1', 'account-1', 'install-1'])
  })

  await test('completed commentary retrieves with only the gated server reference and analysis', async () => {
    const db = dbReturning([{
      reference: '1 Peter 4:7-11',
      document: { reference: '1 Peter 4:7-11' },
      analysis: { passageText: 'The end of all things is at hand.', mainTheme: 'Serve faithfully' },
    }])
    const retrievals = []
    const expected = { status: 'grounded', message: 'Retrieved.', sources: [] }
    const handler = buildStudyCommentaryHandler({
      db,
      retrieve: async (input) => {
        retrievals.push(input)
        return expected
      },
    })
    const res = responseRecorder()
    await handler({
      identity: { account: { id: 'account-1' }, installId: 'caller-install' },
      params: { id: 'study-1' },
    }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, expected)
    assert.deepEqual(retrievals, [{
      reference: '1 Peter 4:7-11',
      passageText: 'The end of all things is at hand.',
      mainTheme: 'Serve faithfully',
    }])
  })

  await test('the live commentary route mounts the behavior-tested handler', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
    const route = routeSource(
      source,
      "app.get('/v1/studies/:id/commentary'",
      "app.post('/v1/feedback'",
    )
    assert.match(source, /const \{ buildStudyCommentaryHandler \} = require\('\.\/study-commentary'\)/)
    assert.match(route, /route\(buildStudyCommentaryHandler\(\{ db \}\)\)/)
    assert.doesNotMatch(route, /document\s+IS\s+NOT\s+NULL/i)
    assert.doesNotMatch(route, /FROM\s+study/i)
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
})()
