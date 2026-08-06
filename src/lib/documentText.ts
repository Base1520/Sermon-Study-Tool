/**
 * documentText.ts — a reading, as plain text you can paste into a document.
 *
 * WHY THIS EXISTS. Clint Riggin's beta feedback, verbatim: he wanted to copy the
 * output into his own documents and could not. Two things were in the way — the
 * whole app had `user-select: none` (fixed in index.css), and there was no way
 * to take a whole reading at once. Selecting a long document by dragging across
 * a scrolling pane is miserable even when it works.
 *
 * PLAIN TEXT, NOT MARKDOWN. It is going into Word, Pages, Google Docs or a
 * sermon manuscript. Markdown asterisks would arrive as literal asterisks in
 * every one of them.
 *
 * NOTHING IS INVENTED HERE. Every line is a field the model actually produced;
 * a section that is missing is simply omitted rather than filled with a heading
 * over nothing.
 */

interface AnyDoc { [k: string]: any }

const clean = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : ''

/** A heading plus its body, or nothing at all if the body is empty. */
function block(title: string, body: string): string {
  const text = body.trim()
  if (!text) return ''
  return `${title.toUpperCase()}\n${text}\n`
}

function list(items: unknown): string {
  if (!Array.isArray(items)) return ''
  return items.map(clean).filter(Boolean).map((s) => `• ${s}`).join('\n')
}

/** Turn one reading into text a person can paste anywhere. */
export function documentToText(doc: AnyDoc | null | undefined): string {
  if (!doc || typeof doc !== 'object') return ''

  const parts: string[] = []
  const ref = clean(doc.reference)
  if (ref) parts.push(`${ref}\n${'='.repeat(ref.length)}\n`)

  const situation = doc.situation ?? {}
  parts.push(block('The situation', [
    clean(situation.when), clean(situation.where),
    clean(situation.pressure), clean(situation.soWhat),
  ].filter(Boolean).join('\n\n')))

  const meaning = doc.meaning ?? {}
  parts.push(block('What it means', clean(meaning.plain)))
  parts.push(block('A common misreading', clean(meaning.misread)))
  parts.push(block('What it assumes you know', clean(meaning.assumes)))

  const work = doc.work ?? {}
  parts.push(block('How anyone knows that', [
    clean(work.genre), clean(work.setting), clean(work.surroundings),
    clean(work.words), clean(work.story), clean(work.doing),
    clean(work.christPathway),
  ].filter(Boolean).join('\n\n')))

  parts.push(block('The distance', clean(doc.distance)))

  const outline = doc.outline ?? {}
  const units = Array.isArray(outline.units) ? outline.units : []
  if (units.length) {
    const shape = clean(outline.shape)
    const body = units.map((u: AnyDoc, i: number) => {
      const head = [clean(u.label), clean(u.verses)].filter(Boolean).join(' — ')
      const detail = [clean(u.says), clean(u.does), clean(u.kind)].filter(Boolean).join('\n   ')
      return `${i + 1}. ${head}${detail ? `\n   ${detail}` : ''}`
    }).join('\n')
    parts.push(block('Outline', [shape, body].filter(Boolean).join('\n\n')))
  }

  const application = doc.application ?? {}
  parts.push(block('To them first', clean(application.toThemFirst)))
  parts.push(block('Then to you', clean(application.thenToYou)))
  parts.push(block('One step', clean(application.step)))

  parts.push(block('Restraints', list(doc.restraint)))
  parts.push(block('Still open', list(doc.unknowns)))
  parts.push(block('Where this hands off', clean(doc.handoff)))

  // Provenance last, so a pasted excerpt can be traced back to what produced it.
  const trail = [ref, clean(doc.readingLevel) && `level: ${clean(doc.readingLevel)}`]
    .filter(Boolean).join(' · ')
  if (trail) parts.push(`\n—\nThe Operator · ${trail}`)

  return parts.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** The analysis desk, as text. Same rules. */
export function analysisToText(analysis: AnyDoc | null | undefined): string {
  if (!analysis || typeof analysis !== 'object') return ''
  const parts: string[] = []

  const ref = clean(analysis.reference)
  if (ref) parts.push(`${ref}\n${'='.repeat(ref.length)}\n`)

  parts.push(block('Main theme', clean(analysis.mainTheme)))

  const intent = analysis.authorIntent ?? {}
  parts.push(block('What the author is doing', [
    clean(intent.doing), clean(intent.inOrderThat),
  ].filter(Boolean).join('\n\n')))

  const outline = Array.isArray(analysis.outline) ? analysis.outline : []
  if (outline.length) {
    parts.push(block('Outline', outline.map((p: AnyDoc) => {
      const head = [clean(p.point), clean(p.verses), clean(p.label)].filter(Boolean).join(' ')
      const subs = Array.isArray(p.sub)
        ? p.sub.map((x: AnyDoc) => `    ${clean(x.point)} ${clean(x.label)}`.trimEnd()).join('\n')
        : ''
      return [head, subs].filter(Boolean).join('\n')
    }).join('\n')))
  }

  const notes = Array.isArray(analysis.culturalNotes) ? analysis.culturalNotes : []
  if (notes.length) {
    parts.push(block('Cultural background', notes.map((n: AnyDoc) => {
      const term = clean(n.term)
      const status = clean(n.claimStatus)
      // The claim status travels with the claim. A background note pasted into a
      // manuscript without "disputed" attached is how a maybe becomes a fact.
      return `• ${term}${status ? ` [${status}]` : ''}\n  ${clean(n.explanation)}`
    }).join('\n\n')))
  }

  const questions = Array.isArray(analysis.questionsToConsider) ? analysis.questionsToConsider : []
  parts.push(block('Questions to wrestle with', list(questions)))

  const canon = analysis.canonicalContext ?? {}
  parts.push(block('Canonical context', [
    clean(canon.bookTheme) && `Book theme: ${clean(canon.bookTheme)}`,
    clean(canon.passageRole) && `Role: ${clean(canon.passageRole)}`,
    Array.isArray(canon.biblicalThemes) && canon.biblicalThemes.length
      ? `Themes: ${canon.biblicalThemes.map(clean).filter(Boolean).join(', ')}` : '',
    clean(canon.canonicalConnections) && `Connections: ${clean(canon.canonicalConnections)}`,
  ].filter(Boolean).join('\n')))

  if (ref) parts.push(`\n—\nThe Operator · ${ref}`)
  return parts.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
