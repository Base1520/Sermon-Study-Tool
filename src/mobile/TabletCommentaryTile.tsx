import { useEffect, useState } from 'react'
import { getStudyCommentary, OperatorApiError, type CommentaryResult } from './api'
import { copyToClipboard } from './clipboard'

export function TabletCommentaryTile({ studyId, reference }: { studyId: string; reference: string }) {
  const [result, setResult] = useState<CommentaryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    getStudyCommentary(studyId)
      .then(setResult)
      .catch((error) => {
        const accountRequired = error instanceof OperatorApiError && error.code === 'ACCOUNT_REQUIRED'
        setResult({
          status: accountRequired ? 'no_result' : 'unavailable',
          message: error instanceof OperatorApiError
            ? error.message
            : 'The cited commentary index could not be reached. Nothing was generated from memory.',
          sources: [],
        })
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [studyId])

  return (
    <div className="tablet-commentary nodrag nowheel nopan">
      <div className="tablet-commentary-status">
        <span>{reference}</span>
        <button onClick={load} disabled={loading}>{loading ? 'SEARCHING…' : 'REFRESH'}</button>
      </div>
      {loading && <div className="tablet-reference-loading"><i /><span>SEARCHING VERIFIED EXCERPTS</span></div>}
      {!loading && result && <>
        <p className={`status-${result.status}`}>{result.message}</p>
        <div className="tablet-commentary-sources">
          {result.sources.map((source) => <article key={source.citationId}>
            <div>
              <span>{source.publicationYear || 'PUBLIC DOMAIN'}</span>
              <button onClick={() => {
                void copyToClipboard(`${source.author}, ${source.title}, ${source.locator}\n\n${source.excerpt}`)
                  .then(() => setCopied(source.citationId))
                  .catch(() => setCopied(null))
              }}>{copied === source.citationId ? 'COPIED' : 'COPY'}</button>
            </div>
            <strong>{source.author}</strong>
            <small>{source.title} · {source.locator}</small>
            <p>{source.excerpt}</p>
            <code>{source.citationId}</code>
          </article>)}
        </div>
      </>}
    </div>
  )
}
