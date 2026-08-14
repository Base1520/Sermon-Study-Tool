const { resolveOwnedStudyDocument } = require('./study-ai-access')
const { retrieveCommentary } = require('./commentary')

function buildStudyCommentaryHandler({ db, retrieve = retrieveCommentary }) {
  return async function studyCommentaryHandler(req, res) {
    const accountId = req.identity.account?.id
    if (!accountId) {
      return res.status(401).json({ error: 'ACCOUNT_REQUIRED', message: 'Link or activate this device first.' })
    }

    const access = await resolveOwnedStudyDocument(db, {
      studyId: req.params.id,
      accountId,
      installId: req.identity.installId,
      surface: 'commentary',
    })
    if (!access.ok) return res.status(access.status).json(access.body)

    const analysis = access.study.analysis || {}
    return res.json(await retrieve({
      reference: access.study.reference,
      passageText: analysis.passageText || '',
      mainTheme: analysis.mainTheme || '',
    }))
  }
}

module.exports = { buildStudyCommentaryHandler }
