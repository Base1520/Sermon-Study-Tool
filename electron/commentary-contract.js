function isRetrievalEnabled(featureFlags, env = process.env) {
  return env.THEOLOGY_RETRIEVAL_ENABLED === 'true'
    || (featureFlags?.theologyRetrieval && env.THEOLOGY_RETRIEVAL_ENABLED !== 'false')
}

function passageBook(reference) {
  const match = String(reference ?? '').trim().match(/^((?:[1-3]\s*)?[A-Za-z]+(?:\s+[A-Za-z]+)*?)(?=\s+\d|$)/)
  return match?.[1]?.replace(/\s+/g, ' ').toLowerCase() ?? ''
}

function selectScopedResults(results, manifest, reference, limit = 8) {
  const book = passageBook(reference)
  const sourceScopes = new Map(
    manifest.sources
      .filter(source => source.rightsTier === 'public_domain' && source.bookRanges?.[book])
      .map(source => [source.sourceId, source.bookRanges[book]])
  )
  const scoped = results.filter(result => {
    if (result.rights_tier !== 'public_domain') return false
    const ranges = sourceScopes.get(result.source_id)
    return ranges?.some(range => result.ordinal >= range.start && result.ordinal <= range.end)
  })
  return { book, covered: sourceScopes.size > 0, results: scoped.slice(0, limit) }
}

function validateCommentarySynthesis(data, sources) {
  const sourcesByCitationId = new Map(sources.map(source => [source.citationId, source]))
  const allowedCitationIds = new Set(sourcesByCitationId.keys())
  const validateClaim = claim => {
    if (!claim?.text?.trim()) throw new Error('Commentary synthesis returned an empty claim.')
    if (claim.provenance !== 'THEOLOGICAL SYNTHESIS') {
      throw new Error('Commentary synthesis returned an invalid provenance label.')
    }
    if (!Array.isArray(claim.citationIds) || claim.citationIds.length === 0) {
      throw new Error('Commentary synthesis returned an uncited claim.')
    }
    if (claim.citationIds.some(id => !allowedCitationIds.has(id))) {
      throw new Error('Commentary synthesis cited a source that was not retrieved.')
    }
  }

  if (!Array.isArray(data.voices)) throw new Error('Commentary synthesis returned an invalid voices list.')
  for (const voice of data.voices) {
    if (!voice?.name?.trim() || !voice?.era?.trim() || !Array.isArray(voice.claims) || voice.claims.length === 0) {
      throw new Error('Commentary synthesis returned an unsupported voice.')
    }
    voice.claims.forEach(validateClaim)
    const citedAuthors = new Set(
      voice.claims
        .flatMap(claim => claim.citationIds)
        .map(id => sourcesByCitationId.get(id)?.author)
        .filter(Boolean)
    )
    if (citedAuthors.size !== 1 || !citedAuthors.has(voice.name)) {
      throw new Error('Commentary synthesis attributed a cited claim to the wrong author.')
    }
  }
  if (data.convergence) validateClaim(data.convergence)
  if (data.divergence) validateClaim(data.divergence)
  return data
}

module.exports = {
  isRetrievalEnabled,
  passageBook,
  selectScopedResults,
  validateCommentarySynthesis,
}
