import { useState, useEffect, useMemo, useRef } from 'react'
import { BASE } from '../theme'
import { VerseHover } from './VerseHover'

// Visual cross-reference map — rainbow arcs from the passage under study to
// every connected text, laid across the full canon Genesis → Revelation.

const CANON: { name: string; aliases: string[] }[] = [
  { name: 'Gen', aliases: ['genesis','gen','ge'] }, { name: 'Exod', aliases: ['exodus','exod','ex'] },
  { name: 'Lev', aliases: ['leviticus','lev'] }, { name: 'Num', aliases: ['numbers','num','nu'] },
  { name: 'Deut', aliases: ['deuteronomy','deut','dt'] }, { name: 'Josh', aliases: ['joshua','josh'] },
  { name: 'Judg', aliases: ['judges','judg','jdg'] }, { name: 'Ruth', aliases: ['ruth','ru'] },
  { name: '1Sam', aliases: ['1samuel','1sam','1sa'] }, { name: '2Sam', aliases: ['2samuel','2sam','2sa'] },
  { name: '1Kgs', aliases: ['1kings','1kgs','1ki'] }, { name: '2Kgs', aliases: ['2kings','2kgs','2ki'] },
  { name: '1Chr', aliases: ['1chronicles','1chr','1ch'] }, { name: '2Chr', aliases: ['2chronicles','2chr','2ch'] },
  { name: 'Ezra', aliases: ['ezra','ezr'] }, { name: 'Neh', aliases: ['nehemiah','neh'] },
  { name: 'Esth', aliases: ['esther','esth','est'] }, { name: 'Job', aliases: ['job','jb'] },
  { name: 'Ps', aliases: ['psalms','psalm','pss','ps','psa'] }, { name: 'Prov', aliases: ['proverbs','prov','pr'] },
  { name: 'Eccl', aliases: ['ecclesiastes','eccl','ecc','qoheleth'] }, { name: 'Song', aliases: ['songofsolomon','song','sos','canticles'] },
  { name: 'Isa', aliases: ['isaiah','isa','is'] }, { name: 'Jer', aliases: ['jeremiah','jer'] },
  { name: 'Lam', aliases: ['lamentations','lam'] }, { name: 'Ezek', aliases: ['ezekiel','ezek','eze'] },
  { name: 'Dan', aliases: ['daniel','dan','da'] }, { name: 'Hos', aliases: ['hosea','hos'] },
  { name: 'Joel', aliases: ['joel','jl'] }, { name: 'Amos', aliases: ['amos','am'] },
  { name: 'Obad', aliases: ['obadiah','obad','ob'] }, { name: 'Jonah', aliases: ['jonah','jon'] },
  { name: 'Mic', aliases: ['micah','mic'] }, { name: 'Nah', aliases: ['nahum','nah'] },
  { name: 'Hab', aliases: ['habakkuk','hab'] }, { name: 'Zeph', aliases: ['zephaniah','zeph','zep'] },
  { name: 'Hag', aliases: ['haggai','hag'] }, { name: 'Zech', aliases: ['zechariah','zech','zec'] },
  { name: 'Mal', aliases: ['malachi','mal'] },
  { name: 'Matt', aliases: ['matthew','matt','mt'] }, { name: 'Mark', aliases: ['mark','mk','mrk'] },
  { name: 'Luke', aliases: ['luke','lk','luk'] }, { name: 'John', aliases: ['john','jn','jhn'] },
  { name: 'Acts', aliases: ['acts','ac'] }, { name: 'Rom', aliases: ['romans','rom','ro'] },
  { name: '1Cor', aliases: ['1corinthians','1cor','1co'] }, { name: '2Cor', aliases: ['2corinthians','2cor','2co'] },
  { name: 'Gal', aliases: ['galatians','gal'] }, { name: 'Eph', aliases: ['ephesians','eph'] },
  { name: 'Phil', aliases: ['philippians','phil','php'] }, { name: 'Col', aliases: ['colossians','col'] },
  { name: '1Thess', aliases: ['1thessalonians','1thess','1th'] }, { name: '2Thess', aliases: ['2thessalonians','2thess','2th'] },
  { name: '1Tim', aliases: ['1timothy','1tim','1ti'] }, { name: '2Tim', aliases: ['2timothy','2tim','2ti'] },
  { name: 'Titus', aliases: ['titus','tit'] }, { name: 'Phlm', aliases: ['philemon','phlm','phm'] },
  { name: 'Heb', aliases: ['hebrews','heb'] }, { name: 'Jas', aliases: ['james','jas','jm'] },
  { name: '1Pet', aliases: ['1peter','1pet','1pe'] }, { name: '2Pet', aliases: ['2peter','2pet','2pe'] },
  { name: '1John', aliases: ['1john','1jn','1jo'] }, { name: '2John', aliases: ['2john','2jn'] },
  { name: '3John', aliases: ['3john','3jn'] }, { name: 'Jude', aliases: ['jude','jud'] },
  { name: 'Rev', aliases: ['revelation','rev','re','apocalypse'] },
]

function bookIndex(reference: string): number {
  const m = reference.trim().match(/^([1-3]?\s*[A-Za-z .]+?)(?:\s+\d|$)/)
  if (!m) return -1
  const key = m[1].toLowerCase().replace(/[\s.]/g, '')
  return CANON.findIndex(b => b.aliases.includes(key) || b.aliases.some(a => a.startsWith(key) && key.length >= 2))
}

interface XRef { reference: string; reason: string }

interface Props {
  reference: string
  mainTheme?: string
  biblicalThemes?: string[]
  apiKey: string
  onLoadRef?: (ref: string) => void
}

export function CrossRefArcs({ reference, mainTheme, biblicalThemes, apiKey, onLoadRef }: Props) {
  const [refs, setRefs] = useState<XRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(860)

  useEffect(() => {
    const ro = new ResizeObserver(es => { for (const e of es) setW(e.contentRect.width) })
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    ;(window as any).electronAPI.getCrossRefs({
      reference, mainTheme: mainTheme ?? '', biblicalThemes: biblicalThemes ?? [], apiKey,
    }).then((r: XRef[]) => { if (alive) { setRefs(Array.isArray(r) ? r : []); setLoading(false) } })
      .catch((e: any) => { if (alive) { setError(e?.message ?? 'Failed to find connections'); setLoading(false) } })
    return () => { alive = false }
  }, [reference])

  const anchorIdx = useMemo(() => bookIndex(reference), [reference])
  const arcs = useMemo(() => refs
    .map((r, i) => ({ ...r, idx: bookIndex(r.reference), i }))
    .filter(a => a.idx >= 0), [refs])

  // Geometry
  const PAD = 34
  const H = 300
  const baseY = H - 58
  const xFor = (idx: number) => PAD + (idx / (CANON.length - 1)) * (w - PAD * 2)
  const anchorX = anchorIdx >= 0 ? xFor(anchorIdx) : w / 2
  const hueFor = (idx: number) => Math.round((idx / (CANON.length - 1)) * 300)  // rainbow across the canon

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Arc field */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, border: `1.5px solid ${BASE.khaki}`, borderTopColor: BASE.gold, borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.khaki, letterSpacing: '0.12em' }}>TRACING CONNECTIONS</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}
        {error && !loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono', fontSize: 8, color: '#c07070' }}>
            ⚠ {error}
          </div>
        )}
        {!loading && !error && (
          <svg width="100%" height="100%" viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
            {/* Canon baseline */}
            <line x1={PAD} y1={baseY} x2={w - PAD} y2={baseY} stroke={BASE.khaki} strokeOpacity={0.25} strokeWidth={1} />
            {/* Testament divide (Mal | Matt) */}
            <line x1={xFor(38.5)} y1={baseY - 8} x2={xFor(38.5)} y2={baseY + 8} stroke={BASE.khaki} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="2 3" />
            <text x={PAD} y={baseY + 26} fontFamily="Saira" fontSize={11} fill={BASE.khaki} opacity={0.5}>GENESIS</text>
            <text x={w - PAD} y={baseY + 26} textAnchor="end" fontFamily="Saira" fontSize={11} fill={BASE.khaki} opacity={0.5}>REVELATION</text>

            {/* Book ticks */}
            {CANON.map((b, i) => (
              <line key={b.name} x1={xFor(i)} y1={baseY - 2.5} x2={xFor(i)} y2={baseY + 2.5}
                stroke={BASE.khaki} strokeOpacity={i === anchorIdx ? 0.9 : 0.22} strokeWidth={i === anchorIdx ? 2 : 1} />
            ))}

            {/* Rainbow arcs */}
            {arcs.map((a, i) => {
              const x2 = xFor(a.idx)
              const span = Math.abs(x2 - anchorX)
              const apex = Math.min(baseY - 16, 30 + (span / (w - PAD * 2)) * (baseY - 55))
              const hue = hueFor(a.idx)
              const isHov = hovered === i
              return (
                <g key={i} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                  onClick={() => onLoadRef?.(a.reference)}>
                  {/* invisible fat hit path */}
                  <path d={`M ${anchorX} ${baseY} Q ${(anchorX + x2) / 2} ${baseY - apex * 1.9} ${x2} ${baseY}`}
                    fill="none" stroke="transparent" strokeWidth={14} />
                  <path d={`M ${anchorX} ${baseY} Q ${(anchorX + x2) / 2} ${baseY - apex * 1.9} ${x2} ${baseY}`}
                    fill="none"
                    stroke={`hsl(${hue}, ${isHov ? 90 : 65}%, ${isHov ? 65 : 55}%)`}
                    strokeWidth={isHov ? 2.6 : 1.4}
                    strokeOpacity={hovered === null ? 0.75 : isHov ? 1 : 0.18}
                    style={{ transition: 'stroke-opacity 0.15s, stroke-width 0.15s' }} />
                  {/* endpoint */}
                  <circle cx={x2} cy={baseY} r={isHov ? 4.5 : 3}
                    fill={`hsl(${hue}, 75%, 60%)`} fillOpacity={hovered === null || isHov ? 0.95 : 0.25}
                    style={{ transition: 'all 0.15s' }} />
                  {/* endpoint book label */}
                  <text x={x2} y={baseY + 14} textAnchor="middle"
                    fontFamily="JetBrains Mono" fontSize={7}
                    fill={isHov ? `hsl(${hue}, 80%, 70%)` : BASE.khaki}
                    opacity={hovered === null || isHov ? 0.85 : 0.25}>
                    {CANON[a.idx].name}
                  </text>
                </g>
              )
            })}

            {/* Anchor */}
            <circle cx={anchorX} cy={baseY} r={5.5} fill={BASE.gold} style={{ filter: `drop-shadow(0 0 6px ${BASE.gold}aa)` }} />
            <text x={anchorX} y={baseY - 12} textAnchor="middle" fontFamily="Saira" fontSize={13} fill={BASE.gold}>
              {reference.toUpperCase()}
            </text>

            {/* Hover reason readout */}
            {hovered !== null && arcs[hovered] && (
              <g>
                <text x={w / 2} y={22} textAnchor="middle" fontFamily="Saira" fontSize={14} fill={BASE.gold}>
                  {arcs[hovered].reference.toUpperCase()}
                </text>
                <text x={w / 2} y={38} textAnchor="middle" fontFamily="Crimson Pro, serif" fontStyle="italic" fontSize={11.5} fill={BASE.bone}>
                  {arcs[hovered].reason.length > 110 ? arcs[hovered].reason.slice(0, 110) + '…' : arcs[hovered].reason}
                </text>
              </g>
            )}
          </svg>
        )}
      </div>

      {/* Clickable chips with verse previews */}
      {!loading && !error && arcs.length > 0 && (
        <div style={{
          flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: 5,
          padding: '8px 14px 12px', borderTop: `1px solid ${BASE.khaki}18`,
        }}>
          {arcs.map((a, i) => (
            <VerseHover key={i} reference={a.reference} note={a.reason}>
              <button
                onClick={() => onLoadRef?.(a.reference)}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                style={{
                  fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.bone,
                  background: hovered === i ? `hsla(${hueFor(a.idx)}, 60%, 50%, 0.22)` : `${BASE.khaki}10`,
                  border: `1px solid ${hovered === i ? `hsl(${hueFor(a.idx)}, 70%, 55%)` : BASE.khaki + '30'}`,
                  borderRadius: 5, padding: '2px 9px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                {a.reference}
              </button>
            </VerseHover>
          ))}
        </div>
      )}
    </div>
  )
}
