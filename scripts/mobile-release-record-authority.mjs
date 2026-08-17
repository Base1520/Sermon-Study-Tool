import { activeMarkdown } from './console-packet-retention.mjs'

function stripAuthorityContainerPrefixes(line) {
  let content = line

  while (content) {
    const blockQuote = /^ {0,3}>[ \t]?/.exec(content)
    if (blockQuote) {
      content = content.slice(blockQuote[0].length)
      continue
    }

    const listItem = /^ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|$)/.exec(content)
    if (listItem) {
      content = content.slice(listItem[0].length)
      continue
    }

    break
  }

  return content
}

function authorityEntries(text) {
  const originalLines = text.split(/\r?\n/)
  const containerStripped = originalLines.map(stripAuthorityContainerPrefixes)
  const parsed = parseInlineCode(activeMarkdown(containerStripped.join('\n')))
  const activeLines = parsed.text.split('\n')

  return originalLines.map((rawLine, index) => ({
    rawLine,
    activeLine: activeLines[index] || '',
    index,
    originalLines,
  })).filter(({ activeLine }) => (
    activeLine.trim() !== ''
      && !/^ {0,3}\[[^\]\r\n]+\]:/.test(activeLine)
  ))
}

function hasClosedPhysicalRecordBoundary({ rawLine, index, originalLines }) {
  const nextLine = originalLines[index + 1]
  if (nextLine === undefined || /^\s*$/.test(nextLine)) return true

  const listItem = /^( {0,3})(?:[*+-]|\d{1,9}[.)])(?:[ \t]|$)/.exec(rawLine)
  if (!listItem) return false

  const nextListItem = /^( {0,3})(?:[*+-]|\d{1,9}[.)])(?:[ \t]|$)/.exec(nextLine)
  return Boolean(nextListItem && nextListItem[1].length <= listItem[1].length)
}

export function activeAuthorityLines(text) {
  return authorityEntries(text).map(({ rawLine }) => rawLine)
}

export function parseInlineCode(text) {
  let index = 0
  let rendered = ''

  while (index < text.length) {
    const openingStart = text.indexOf('`', index)
    if (openingStart === -1) {
      rendered += text.slice(index)
      return { balanced: true, text: rendered }
    }

    rendered += text.slice(index, openingStart)
    let openingEnd = openingStart
    while (text[openingEnd] === '`') openingEnd += 1
    const delimiterLength = openingEnd - openingStart
    let cursor = openingEnd
    let closingEnd = -1

    while (cursor < text.length) {
      const candidateStart = text.indexOf('`', cursor)
      if (candidateStart === -1) break
      let candidateEnd = candidateStart
      while (text[candidateEnd] === '`') candidateEnd += 1
      if (candidateEnd - candidateStart === delimiterLength) {
        closingEnd = candidateEnd
        break
      }
      cursor = candidateEnd
    }

    if (closingEnd === -1) {
      return {
        balanced: false,
        text: `${rendered}${text.slice(openingStart)}`,
      }
    }

    rendered += text.slice(openingStart, closingEnd).replace(/[^\n]/g, ' ')
    index = closingEnd
  }

  return { balanced: true, text: rendered }
}

export function hasUnmatchedInlineCode(text) {
  return !parseInlineCode(text).balanced
}

export function stripInlineCode(text) {
  return parseInlineCode(text).text
}

export function uniqueAuthorityLine(text, predicate, { singlePhysicalLine = false } = {}) {
  const matches = authorityEntries(text).filter((entry) => (
    predicate(entry.rawLine)
      && (!singlePhysicalLine || hasClosedPhysicalRecordBoundary(entry))
  ))
  return matches.length === 1 ? matches[0].rawLine : ''
}

export function lineStarting(text, prefix, options) {
  return uniqueAuthorityLine(text, (line) => line.startsWith(prefix), options)
}

export function lineContaining(text, fragment, {
  prefix = '',
  singlePhysicalLine = false,
} = {}) {
  const matchingEntries = authorityEntries(text).filter(({ rawLine }) => (
    stripInlineCode(rawLine).includes(fragment)
  ))
  const occurrences = matchingEntries.reduce((total, { rawLine }) => (
    total + stripInlineCode(rawLine).split(fragment).length - 1
  ), 0)
  if (occurrences !== 1 || matchingEntries.length !== 1) return ''

  const [entry] = matchingEntries
  if (prefix && !entry.rawLine.startsWith(prefix)) return ''
  if (singlePhysicalLine && !hasClosedPhysicalRecordBoundary(entry)) return ''
  return entry.rawLine
}

export function hasCurrentAuthorization(text, subjectPattern) {
  if (hasUnmatchedInlineCode(text)) return false
  const withoutInlineCode = stripInlineCode(text)

  const strongPredicate = /\b(?:authoriz(?:e|ed)|approv(?:e|ed)|allow(?:ed)?|permit(?:ted)?|eligible|selectable|submittable|attachable|executable|proceed(?:s)?|submission path)\b/i
  const actionPredicate = /\b(?:attach(?:ed)?|select(?:ed)?|submit(?:ted)?|ship(?:ped)?)\b/i
  const modality = /\b(?:is|are|was|were|remains|stays|becomes|can|may|must|should|will)\b/i
  const negation = /\b(?:not|never|cannot|must not|may not|should not|will not|do not|does not|did not|neither|no longer)\b/i
  const noncurrent = /\b(?:historical|historically|previously|formerly|prior|archived|superseded|retroactive|until|once|later|future|pending|could|might|would)\b/i
  const current = /\b(?:now|today|currently|at present)\b/i

  const sentences = withoutInlineCode
    .split(/[.!?;]+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  return sentences.some((sentence) => {
    let subjectSeen = false
    return sentence.split(/\b(?:but|however|yet)\b/i).some((segment) => {
      if (subjectPattern.test(segment)) subjectSeen = true
      if (!subjectSeen) return false
      const affirms = strongPredicate.test(segment)
        || (modality.test(segment) && actionPredicate.test(segment))
      if (!affirms || negation.test(segment)) return false
      if (noncurrent.test(segment) && !current.test(segment)) return false
      return true
    })
  })
}

export function hasBuild5Authorization(text) {
  const normalized = text.replace(/\b1\.4\.2\s*\(5\)(?!\w)/gi, 'build 5')
  return hasCurrentAuthorization(normalized, /\bbuild(?:\s+|-)5\b/i)
}

export function hasBuild5CurrentCandidateLabel(text) {
  if (hasUnmatchedInlineCode(text)) return false
  const normalized = stripInlineCode(text)
    .replace(/\b1\.4\.2\s*\(5\)(?!\w)/gi, 'build 5')
  const build5 = /\bbuild(?:\s+|-)5\b/i
  const currentCandidate = /(?:\b(?:current(?:ly)?|now|today|at present)\b[^.!?;\n]{0,96}\bcandidate(?:\s+artifact)?\b|\bcandidate(?:\s+artifact)?\b[^.!?;\n]{0,96}\b(?:currently|now|today|at present)\b)/i
  const labelVerb = /\b(?:is|are|remains|stays|becomes)\b/i
  const negation = /\b(?:not|never|cannot|must not|may not|should not|will not|do not|does not|did not|neither|no longer)\b/i
  const noncurrent = /\b(?:historical|historically|previously|formerly|prior|archived|superseded|retroactive|until|once|later|future|pending|could|might|would)\b/i

  const sentences = normalized
    .split(/[.!?;]+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  return sentences.some((sentence) => {
    let subjectSeen = false
    return sentence.split(/\b(?:but|however|yet)\b/i).some((segment) => {
      if (build5.test(segment)) subjectSeen = true
      if (!subjectSeen || !currentCandidate.test(segment) || !labelVerb.test(segment)) return false
      if (negation.test(segment) || noncurrent.test(segment)) return false
      return true
    })
  })
}

export function hasBuild6SubmissionReadiness(text) {
  if (hasUnmatchedInlineCode(text)) return false
  const normalized = stripInlineCode(text)
    .replace(/\b1\.4\.2\s*\(6\)(?!\w)/gi, 'build 6')
  return /\bbuild(?:\s+|-)6\b[^.!?;\n]*\b(?:ready for submission|ready to submit|submission-ready)\b/i.test(normalized)
}

export function hasBuild6ProcessingOverclaim(text) {
  if (hasUnmatchedInlineCode(text)) return false
  const normalized = stripInlineCode(text)
    .replace(/\b1\.4\.2\s*\(6\)(?!\w)/gi, 'build 6')
  return /\bbuild(?:\s+|-)6\b[^.!?;\n]{0,96}\b(?:is|has been|remains)\s+(?:fully\s+)?(?:processed|selectable|attached|selected)\b/i.test(normalized)
}

export function hasUnexpectedPathA(text) {
  return hasCurrentAuthorization(text, /\bpath\s+a\b/i)
}

export function authoritySemanticFailures(name, rawRow) {
  const failures = []
  const add = (condition, message) => {
    if (condition) failures.push(`current ${name} ${message}`)
  }

  add(hasUnmatchedInlineCode(rawRow), 'has balanced inline-code delimiters')
  const row = stripInlineCode(rawRow)
  add(/Cole (?:already )?(?:chose|selected|approved) build 6/i.test(row), 'does not falsely claim Cole chose build 6')
  add(hasUnexpectedPathA(row), 'does not authorize historical Path A')
  add(hasBuild5Authorization(row), 'contains no contradictory build-5 authorization')
  add(hasBuild5CurrentCandidateLabel(row), 'does not label build 5 as the current candidate')
  add(hasBuild6SubmissionReadiness(row), 'does not falsely claim build 6 is submission-ready')
  add(hasBuild6ProcessingOverclaim(row), 'does not falsely claim build 6 is processed or selectable')

  return failures
}
