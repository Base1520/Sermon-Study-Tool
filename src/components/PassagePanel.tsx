import { motion } from 'motion/react'
import type { OutlinePoint } from '../types/phrasing'
import { BASE } from '../theme'

interface Props {
  text: string
  reference: string
  divisions?: OutlinePoint[]
  onWordClick?: (word: string, verseText: string) => void
  onClose: () => void
}

interface PassageVerse {
  num: string
  content: string
  paragraphStart: boolean
}

interface PassageSection {
  id: string
  title: string
  range: string
  verses: PassageVerse[]
}

export function parsePassageVerses(text: string, reference = ''): PassageVerse[] {
  const marker = /\[(\d+)\]\s*/g
  const matches = Array.from(text.matchAll(marker))

  if (matches.length > 0) {
    return matches.map((match, index) => {
      const start = (match.index ?? 0) + match[0].length
      const end = matches[index + 1]?.index ?? text.length
      const previousStart = index > 0
        ? (matches[index - 1].index ?? 0) + matches[index - 1][0].length
        : 0
      const beforeMarker = index > 0
        ? text.slice(previousStart, match.index ?? 0)
        : ''

      return {
        num: match[1],
        content: text.slice(start, end).replace(/\s+/g, ' ').trim(),
        paragraphStart: index === 0 || /\n\s*\n\s*$/.test(beforeMarker),
      }
    })
  }

  const numberedLines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)/)
      return match
        ? { num: match[1], content: match[2].trim(), paragraphStart: true }
        : null
    })
    .filter((verse): verse is PassageVerse => verse !== null)

  if (numberedLines.length > 0) return numberedLines

  const referenceVerse = reference.match(/:(\d+)(?:\D|$)/)?.[1] ?? ''
  return [{
    num: referenceVerse,
    content: text.replace(/\s+/g, ' ').trim(),
    paragraphStart: true,
  }]
}

function rangeBounds(value?: string): [number, number] | null {
  if (!value) return null
  const normalized = value.replace(/[–—]/g, '-').replace(/[a-z](?=\b)/gi, '')
  const versePart = normalized.includes(':')
    ? normalized.slice(normalized.lastIndexOf(':') + 1)
    : normalized
  const numbers = versePart.match(/\d+/g)?.map(Number) ?? []
  if (numbers.length === 0) return null
  return [numbers[0], numbers[1] ?? numbers[0]]
}

function rangeLabel(verses: PassageVerse[]): string {
  const first = verses[0]?.num
  const last = verses[verses.length - 1]?.num
  if (!first) return ''
  return first === last ? `V. ${first}` : `VV. ${first}–${last}`
}

export function buildPassageSections(
  verses: PassageVerse[],
  divisions: OutlinePoint[] = []
): PassageSection[] {
  const numbered = verses.filter((verse) => /^\d+$/.test(verse.num))
  const explicit = divisions
    .map((division, index) => ({
      division,
      index,
      bounds: rangeBounds(division.verses),
    }))
    .filter((item): item is typeof item & { bounds: [number, number] } => item.bounds !== null)
    .map(({ division, index, bounds }) => ({
      id: `outline-${index}`,
      title: `${division.point} ${division.label}`.trim(),
      range: division.verses ?? '',
      verses: verses.filter((verse) => {
        const number = Number(verse.num)
        return Number.isFinite(number) && number >= bounds[0] && number <= bounds[1]
      }),
    }))
    .filter((section) => section.verses.length > 0)

  const explicitAssignments = explicit.flatMap((section) => section.verses)
  const explicitNumbers = new Set(explicitAssignments.map((verse) => verse.num))
  if (
    explicit.length > 0 &&
    explicitAssignments.length === numbered.length &&
    explicitNumbers.size === numbered.length
  ) {
    return explicit
  }

  const paragraphs: PassageVerse[][] = []
  for (const verse of verses) {
    if (paragraphs.length === 0 || verse.paragraphStart) paragraphs.push([])
    paragraphs[paragraphs.length - 1].push(verse)
  }

  return paragraphs.map((paragraph, index) => ({
    id: `paragraph-${index}`,
    title: `Text Division ${index + 1}`,
    range: rangeLabel(paragraph),
    verses: paragraph,
  }))
}

function WordTokens({
  content,
  onWordClick,
}: {
  content: string
  onWordClick?: (word: string, verseText: string) => void
}) {
  const tokens = content.split(/(\s+|[^\p{L}\p{M}’'-]+)/gu).filter(Boolean)

  return (
    <>
      {tokens.map((token, index) => {
        const isWord = /[\p{L}\p{M}]/u.test(token)
        if (!isWord || !onWordClick) return <span key={`${token}-${index}`}>{token}</span>

        return (
          <button
            key={`${token}-${index}`}
            type="button"
            aria-label={`Study the word ${token}`}
            title={`Study “${token}”`}
            onClick={() => onWordClick(token, content)}
            style={{
              appearance: 'none',
              background: 'transparent',
              borderWidth: 0,
              borderBottomWidth: 1,
              borderBottomStyle: 'dotted',
              borderBottomColor: `${BASE.gold}42`,
              borderRadius: 0,
              padding: 0,
              margin: 0,
              color: 'inherit',
              font: 'inherit',
              lineHeight: 'inherit',
              letterSpacing: 'inherit',
              cursor: 'pointer',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.color = BASE.gold
              event.currentTarget.style.borderBottomColor = BASE.gold
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color = 'inherit'
              event.currentTarget.style.borderBottomColor = `${BASE.gold}42`
            }}
          >
            {token}
          </button>
        )
      })}
    </>
  )
}

export function PassagePanel({
  text,
  reference,
  divisions = [],
  onWordClick,
  onClose,
}: Props) {
  const verses = parsePassageVerses(text, reference)
  const sections = buildPassageSections(verses, divisions)

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 360, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      aria-label={`${reference} passage text`}
      style={{
        flexShrink: 0,
        overflow: 'hidden',
        background: `${BASE.bgCard}f7`,
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        borderRight: `1px solid ${BASE.borderGold}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <div style={{
        padding: '16px 18px 12px',
        borderBottom: `1px solid ${BASE.borderDim}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{
            fontFamily: 'JetBrains Mono',
            fontSize: 9,
            fontWeight: 700,
            color: BASE.khaki,
            letterSpacing: '0.16em',
            marginBottom: 4,
          }}>
            PASSAGE TEXT
          </div>
          <div style={{
            fontFamily: 'Crimson Pro, serif',
            fontSize: 20,
            color: BASE.bone,
            fontWeight: 600,
          }}>
            {reference}
          </div>
          {onWordClick && (
            <div style={{
              marginTop: 5,
              fontFamily: 'JetBrains Mono',
              fontSize: 8,
              color: BASE.gold,
              letterSpacing: '0.08em',
            }}>
              CLICK A WORD FOR ITS STUDY + WHY IT MATTERS
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close passage text"
          style={{
            width: 28,
            height: 28,
            borderRadius: 0,
            border: `1px solid ${BASE.borderDim}`,
            background: 'transparent',
            color: BASE.boneMid,
            cursor: 'pointer',
            fontSize: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      <div style={{
        height: 2,
        background: `linear-gradient(to right, ${BASE.gold}aa, ${BASE.gold}18, transparent)`,
        flexShrink: 0,
      }} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 18px 54px' }}>
        {sections.map((section, sectionIndex) => (
          <section key={section.id} style={{ marginBottom: sectionIndex === sections.length - 1 ? 0 : 28 }}>
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              padding: '9px 11px',
              marginBottom: 14,
              background: '#263519',
              borderLeft: `4px solid ${BASE.gold}`,
              borderTop: `1px solid ${BASE.borderGold}`,
              borderRight: `1px solid ${BASE.borderGold}`,
              borderBottom: `1px solid ${BASE.borderGold}`,
            }}>
              <div style={{
                fontFamily: 'Saira, sans-serif',
                fontSize: 12,
                fontWeight: 750,
                color: BASE.bone,
                letterSpacing: '0.055em',
                lineHeight: 1.25,
                textTransform: 'uppercase',
              }}>
                {section.title}
              </div>
              <div style={{
                flexShrink: 0,
                fontFamily: 'JetBrains Mono',
                fontSize: 10,
                fontWeight: 700,
                color: BASE.gold,
                letterSpacing: '0.08em',
              }}>
                {section.range}
              </div>
            </div>

            {section.verses.map((verse) => (
              <div
                key={`${section.id}-${verse.num}`}
                style={{
                  marginBottom: 15,
                  display: 'grid',
                  gridTemplateColumns: '30px minmax(0, 1fr)',
                  columnGap: 12,
                  alignItems: 'start',
                }}
              >
                <span style={{
                  fontFamily: 'Saira, sans-serif',
                  fontSize: 12,
                  fontWeight: 800,
                  color: BASE.gold,
                  marginTop: 3,
                  lineHeight: 1.4,
                  textAlign: 'right',
                }}>
                  {verse.num}
                </span>
                <span style={{
                  fontFamily: 'Crimson Pro, serif',
                  fontSize: 17,
                  color: BASE.bone,
                  lineHeight: 1.72,
                  letterSpacing: '0.006em',
                }}>
                  <WordTokens content={verse.content} onWordClick={onWordClick} />
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>

      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 42,
        pointerEvents: 'none',
        background: `linear-gradient(to top, ${BASE.bgCard}, transparent)`,
      }} />
    </motion.aside>
  )
}
