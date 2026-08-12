import { useEffect, useState } from 'react'
import type { GuidedStudyDoc, MobileStudyDocument, PassageResult } from './api'
import { PassageCard } from './QuickStudyDocument'
import { ReportAiOutput } from './ReportAiOutput'

function SourceEvidence({ sources }: { sources: string[] }) {
  if (!sources.length) return null
  const readable = (source: string) => source
    .replace(/^Vault G\d+:\s*/i, 'Grounding: ')
    .replace(/^Vault:\s*/i, 'Grounding: ')
  return (
    <details className="mobile-guided-evidence">
      <summary>SEE THE EVIDENCE</summary>
      <ul>{sources.map((source) => <li key={source}>{readable(source)}</li>)}</ul>
    </details>
  )
}

export function isGuidedStudyDocument(document: MobileStudyDocument | null | undefined): document is GuidedStudyDoc {
  return Boolean(document && 'mode' in document && document.mode === 'guided')
}

export function GuidedStudyDocument({
  document,
  passage,
  loading,
  studyId,
}: {
  document: GuidedStudyDoc | null
  passage: PassageResult | null
  loading: boolean
  studyId: string | null
}) {
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => setActiveStep(0), [document?.reference])

  if (loading && !document) {
    return (
      <div className="mobile-guided-scroll">
        <PassageCard passage={passage} />
        <section className="mobile-guided-loading" aria-live="polite">
          <div className="mobile-covenant-loading" aria-hidden="true">
            {'COVENANT'.split('').map((letter, index) => <i key={`${letter}-${index}`}>{letter}</i>)}
          </div>
          <span>GUIDED STUDY</span>
          <strong>Working the text through all eight movements…</strong>
          <p>The passage is ready now. Context, natural divisions, key terms, interpretation, and application are being built in one study.</p>
        </section>
      </div>
    )
  }

  if (!document) return null
  const step = document.covenant[activeStep]

  return (
    <div className="mobile-guided-scroll">
      <PassageCard passage={passage} wordStudies={document.keyTerms.map((term) => ({ term: term.term, meaning: term.meaningHere, whyItMatters: term.whyItMatters }))} />

      <div className="mobile-guided-document">
        <section className="mobile-guided-claim">
          <span>WHAT THE PASSAGE MEANS</span>
          <p>{document.mainClaim}</p>
          <SourceEvidence sources={document.mainClaimSources} />
        </section>

        <section className="mobile-guided-section mobile-guided-situation">
          <div className="mobile-guided-heading">
            <span>THE ROOM IT WALKED INTO</span>
            <small>{document.situation.confidence}</small>
          </div>
          <div className="mobile-guided-facts">
            <article><b>WHEN</b><p>{document.situation.when}</p></article>
            <article><b>WHERE</b><p>{document.situation.where}</p></article>
          </div>
          <h3>What was pressing on them</h3>
          <p>{document.situation.pressure}</p>
          <h3>Why that changes the reading</h3>
          <p>{document.situation.whyItChangesReading}</p>
          <SourceEvidence sources={document.situation.sourceRefs} />
        </section>

        <section className="mobile-guided-section">
          <div className="mobile-guided-heading"><span>THE TEXT’S NATURAL DIVISIONS</span><small>{document.textUnits.length} movements</small></div>
          <div className="mobile-guided-units">
            {document.textUnits.map((unit, index) => (
              <article key={`${unit.ref}-${index}`}>
                <div><b>{unit.ref}</b><strong>{unit.heading}</strong></div>
                <blockquote>“{unit.anchor}”</blockquote>
                <p>{unit.explanation}</p>
                {unit.logic && <small>{index === 0 ? unit.logic : `Connection: ${unit.logic}`}</small>}
              </article>
            ))}
          </div>
        </section>

        {document.keyTerms.length > 0 && (
          <section className="mobile-guided-section">
            <div className="mobile-guided-heading"><span>WORDS DOING THE WORK</span><small>in this context</small></div>
            <div className="mobile-guided-terms">
              {document.keyTerms.map((term) => (
                <article key={term.term}>
                  <strong>{term.term}</strong>
                  <p>{term.meaningHere}</p>
                  <dl>
                    <div><dt>Its job here</dt><dd>{term.functionInArgument}</dd></div>
                    <div><dt>Why it matters</dt><dd>{term.whyItMatters}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="mobile-guided-section mobile-covenant-panel">
          <div className="mobile-guided-heading"><span>THE COVENANT PATH</span><small>{activeStep + 1} of 8</small></div>
          <nav className="mobile-covenant-tabs" aria-label="COVENANT study movements">
            {document.covenant.map((item, index) => (
              <button
                key={item.id}
                className={index === activeStep ? 'active' : ''}
                onClick={() => setActiveStep(index)}
                aria-label={`${item.letter}: ${item.title}`}
              >
                <b>{item.letter}</b><small>{index + 1}</small>
              </button>
            ))}
          </nav>
          {step && (
            <article className="mobile-covenant-step">
              <div className="mobile-covenant-step-title"><b>{step.letter}</b><div><small>STEP {activeStep + 1}</small><h2>{step.title}</h2></div></div>
              <blockquote>{step.question}</blockquote>
              <p>{step.finding}</p>
              <div className="mobile-covenant-check"><span>CHECK IT IN THE TEXT</span><p>{step.check}</p></div>
              {step.restraint && <div className="mobile-covenant-restraint"><span>RESTRAINT</span><p>{step.restraint}</p></div>}
              <SourceEvidence sources={step.sourceRefs} />
            </article>
          )}
        </section>

        <section className="mobile-guided-section mobile-guided-application">
          <div className="mobile-guided-heading"><span>FROM THEN TO NOW</span><small>same truth, faithful distance</small></div>
          <div className="mobile-application-path">
            <article><b>TO THEM FIRST</b><p>{document.application.toThemFirst}</p></article>
            <article><b>THE ENDURING TRUTH</b><p>{document.application.enduringTruth}</p></article>
            <article><b>INDIVIDUAL</b><p>{document.application.today}</p></article>
            <article><b>THE CHURCH</b><p>{document.application.corporate}</p></article>
            <article><b>THE MISSION</b><p>{document.application.mission}</p></article>
            <article><b>A FAITHFUL RESPONSE</b><p>{document.application.response}</p></article>
          </div>
          <SourceEvidence sources={document.application.sourceRefs} />
        </section>

        {document.guardrails.length > 0 && (
          <section className="mobile-guided-section mobile-guided-guardrails">
            <div className="mobile-guided-heading"><span>DON’T MAKE IT SAY</span><small>interpretive restraints</small></div>
            <ul>{document.guardrails.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        )}

        <section className="mobile-guided-section mobile-guided-questions">
          <div className="mobile-guided-heading"><span>WORK IT YOURSELF</span><small>answers stay anchored</small></div>
          <div>
            {document.questions.map((item, index) => (
              <details key={item.question}>
                <summary><b>{String(index + 1).padStart(2, '0')}</b>{item.question}</summary>
                <p>{item.answer}</p>
                <SourceEvidence sources={item.sourceRefs} />
              </details>
            ))}
          </div>
        </section>

        <footer className="mobile-guided-footer">FULL STUDY · PLAIN SIDE · TEXT FIRST</footer>
        {studyId && <ReportAiOutput studyId={studyId} surface="guided-study" content={JSON.stringify(document)} />}
      </div>
    </div>
  )
}
