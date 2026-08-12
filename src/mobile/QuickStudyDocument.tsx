import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MobileStudyDocument, PassageResult, QuickStudyDoc } from './api'
import { ReportAiOutput } from './ReportAiOutput'

export function isQuickStudyDocument(document: MobileStudyDocument | null | undefined): document is QuickStudyDoc {
  return Boolean(document && 'mode' in document && document.mode === 'quick')
}

export interface PassageWordStudy {
  term: string
  meaning: string
  whyItMatters: string
}

function normalizedWord(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu

interface IndexedWordStudy {
  study: PassageWordStudy
  tokens: string[]
}

function normalizedTokens(value: string) {
  return Array.from(value.matchAll(WORD_PATTERN), (match) => normalizedWord(match[0])).filter(Boolean)
}

function InteractiveText({ text, studies, onOpen }: { text: string; studies: IndexedWordStudy[]; onOpen: (study: PassageWordStudy) => void }) {
  const words = Array.from(text.matchAll(WORD_PATTERN), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    token: normalizedWord(match[0]),
  }))
  if (!words.length || !studies.length) return text

  const content: ReactNode[] = []
  let textStart = 0
  let wordIndex = 0
  while (wordIndex < words.length) {
    const matched = studies.find(({ tokens }) => tokens.every((token, offset) => words[wordIndex + offset]?.token === token))
    if (!matched) {
      wordIndex += 1
      continue
    }
    const start = words[wordIndex].start
    const end = words[wordIndex + matched.tokens.length - 1].end
    if (start > textStart) content.push(<span key={`text-${textStart}`}>{text.slice(textStart, start)}</span>)
    content.push(
      <button key={`study-${start}-${end}`} className="mobile-passage-word" onClick={() => onOpen(matched.study)}>
        {text.slice(start, end)}
      </button>,
    )
    textStart = end
    wordIndex += matched.tokens.length
  }
  if (textStart < text.length) content.push(<span key={`text-${textStart}`}>{text.slice(textStart)}</span>)
  return content
}

export function PassageCard({ passage, wordStudies = [] }: { passage: PassageResult | null; wordStudies?: PassageWordStudy[] }) {
  const [activeStudy, setActiveStudy] = useState<PassageWordStudy | null>(null)
  const indexedStudies = useMemo(() => wordStudies
    .map((study, index) => ({ study, tokens: normalizedTokens(study.term), index }))
    .filter(({ tokens }) => tokens.length > 0)
    .sort((left, right) => right.tokens.length - left.tokens.length || left.index - right.index)
    .map(({ study, tokens }) => ({ study, tokens })), [wordStudies])
  useEffect(() => setActiveStudy(null), [passage?.reference])
  if (!passage) return null
  return (
    <section className="mobile-quick-passage">
      <div className="mobile-quick-passage-heading">
        <span>THE TEXT</span>
        <strong>{passage.reference}</strong>
        <small>{passage.translation.toUpperCase()}</small>
      </div>
      <div className="mobile-quick-verses">
        {passage.verses.length
          ? passage.verses.map((verse) => <p key={`${verse.chapter}:${verse.verse}`}><b>{verse.verse}</b><InteractiveText text={verse.text} studies={indexedStudies} onOpen={setActiveStudy} /></p>)
          : <p><InteractiveText text={passage.text} studies={indexedStudies} onOpen={setActiveStudy} /></p>}
      </div>
      {indexedStudies.length > 0 && <small className="mobile-passage-word-hint">Highlighted words open their study.</small>}
      {activeStudy && <aside className="mobile-passage-word-study">
        <button onClick={() => setActiveStudy(null)} aria-label="Close word study">×</button>
        <span>WORD IN THIS PASSAGE</span>
        <strong>{activeStudy.term}</strong>
        <p>{activeStudy.meaning}</p>
        <small>WHY IT MATTERS</small>
        <p>{activeStudy.whyItMatters}</p>
      </aside>}
      {passage.copyright && <small className="mobile-quick-copyright">{passage.copyright}</small>}
    </section>
  )
}

export function QuickStudyDocument({
  document,
  passage,
  loading,
  studyId,
}: {
  document: QuickStudyDoc | null
  passage: PassageResult | null
  loading: boolean
  studyId: string | null
}) {
  return (
    <div className="mobile-quick-scroll">
      <PassageCard passage={passage} wordStudies={(document?.keyTerms || []).map((term) => ({ term: term.term, meaning: term.meaning, whyItMatters: term.whyItMatters }))} />

      {loading && !document && (
        <section className="mobile-quick-loading" aria-live="polite">
          <div className="mobile-quick-loading-mark"><i /><i /><i /></div>
          <span>QUICK STUDY</span>
          <strong>Getting the meaning, context, and key words…</strong>
          <p>One text-driven lookup. No sermon outline or manuscript.</p>
        </section>
      )}

      {document && (
        <div className="mobile-quick-document">
          <section className="mobile-quick-section mobile-quick-claim">
            <span>WHAT IT MEANS</span>
            <p>{document.mainClaim}</p>
          </section>

          <section className="mobile-quick-section">
            <span>THE ROOM IT WAS WRITTEN INTO</span>
            <p>{document.context}</p>
          </section>

          <section className="mobile-quick-section">
            <span>WHY IT MEANS THAT</span>
            <div className="mobile-quick-evidence">
              {document.textEvidence.map((item, index) => (
                <article key={`${item.words}-${index}`}>
                  <blockquote>“{item.words}”</blockquote>
                  <p>{item.shows}</p>
                </article>
              ))}
            </div>
          </section>

          {document.keyTerms.length > 0 && (
            <section className="mobile-quick-section">
              <span>WORDS WORTH NOTICING</span>
              <div className="mobile-quick-terms">
                {document.keyTerms.map((item, index) => (
                  <article key={`${item.term}-${index}`}>
                    <strong>{item.term}</strong>
                    <p>{item.meaning}</p>
                    <small>{item.whyItMatters}</small>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="mobile-quick-section">
            <span>WHERE IT SITS IN SCRIPTURE</span>
            <p>{document.wholeBible}</p>
          </section>

          <section className="mobile-quick-section mobile-quick-matters">
            <span>WHY IT MATTERS</span>
            <p>{document.whyItMatters}</p>
          </section>

          {document.guardrails.length > 0 && (
            <section className="mobile-quick-section mobile-quick-guardrails">
              <span>DON’T MAKE IT SAY</span>
              <ul>{document.guardrails.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            </section>
          )}

          {document.questions.length > 0 && (
            <section className="mobile-quick-section mobile-quick-questions">
              <span>KEEP LOOKING</span>
              <ol>{document.questions.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol>
            </section>
          )}

          <footer className="mobile-quick-footer">QUICK STUDY · TEXT FIRST · NOT SERMON CONSTRUCTION</footer>
          {studyId && <ReportAiOutput studyId={studyId} surface="quick-study" content={JSON.stringify(document)} />}
        </div>
      )}
    </div>
  )
}
