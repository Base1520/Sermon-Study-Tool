const STUDY_ACCESS_MESSAGES = Object.freeze({
  ask: Object.freeze({
    missing: 'Open a study from your library, then ask from that reading.',
    unfinished: "Open this study's reading and let it finish before asking a question.",
  }),
  specialist: Object.freeze({
    missing: 'Open a study from your library, then ask a specialist from that study.',
    unfinished: "Open this study's reading and let it finish before asking a specialist.",
  }),
  commentary: Object.freeze({
    missing: 'Open a study from your library, then open commentaries from that study.',
    unfinished: "Open this study's reading and let it finish before opening commentaries.",
  }),
})

/**
 * Resolve an owned study without hiding owned-but-unfinished rows behind the
 * same 404 as missing or unauthorized rows. Ownership remains inside the SQL
 * query; only an already-owned row can reveal that its reading is unfinished.
 */
async function resolveOwnedStudyDocument(db, {
  studyId,
  accountId = null,
  installId = null,
  surface,
}) {
  const messages = STUDY_ACCESS_MESSAGES[surface]
  if (!messages) throw new Error(`unsupported study AI surface: ${surface}`)

  const { rows } = await db.query(
    `SELECT reference, analysis, document
       FROM study
      WHERE id = $1
        AND (($2::uuid IS NOT NULL AND account_id = $2)
          OR ($2::uuid IS NULL AND account_id IS NULL AND install_id = $3))
      LIMIT 1`,
    [studyId, accountId, installId || ''],
  )

  if (!rows.length) {
    return {
      ok: false,
      status: 404,
      body: { error: 'STUDY_NOT_FOUND', message: messages.missing },
    }
  }

  const study = rows[0]
  if (study.document == null) {
    return {
      ok: false,
      status: 409,
      body: { error: 'STUDY_READING_REQUIRED', message: messages.unfinished },
    }
  }

  return { ok: true, study }
}

module.exports = { resolveOwnedStudyDocument }
