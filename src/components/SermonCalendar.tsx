import { useState, useEffect } from 'react'
import { BASE, FONT } from '../theme'
import { OpsPanel } from './OpsPanel'

const DARK  = '#1a2410'
const CARD  = '#2c3820'
const GOLD  = BASE.gold
const KHAKI = BASE.khaki
const TEXT  = '#d8d0b8'

export interface CalendarEntry {
  reference: string
  title: string
  seriesName?: string
  notes?: string
}

interface Props {
  onClose: () => void
  onLoadReference: (ref: string) => void
  currentReference?: string   // quick-assign the passage on the desk
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['S','M','T','W','T','F','S']

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

export function SermonCalendar({ onClose, onLoadReference, currentReference }: Props) {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [entries, setEntries] = useState<Record<string, CalendarEntry>>({})
  const [editing, setEditing] = useState<string | null>(null)  // ISO date being edited
  const [form, setForm] = useState<CalendarEntry>({ reference: '', title: '', seriesName: '', notes: '' })

  useEffect(() => {
    ;(window as any).electronAPI.calendarGet?.()
      .then((c: Record<string, CalendarEntry>) => setEntries(c ?? {}))
      .catch(() => {})
  }, [])

  function openEditor(date: string) {
    const existing = entries[date]
    setForm(existing ?? { reference: '', title: '', seriesName: '', notes: '' })
    setEditing(date)
  }

  async function save() {
    if (!editing) return
    const entry = form.reference.trim() || form.title.trim()
      ? { ...form, reference: form.reference.trim(), title: form.title.trim() }
      : null
    const updated = await (window as any).electronAPI.calendarSet(editing, entry)
    setEntries(updated ?? {})
    setEditing(null)
  }

  async function remove() {
    if (!editing) return
    const updated = await (window as any).electronAPI.calendarSet(editing, null)
    setEntries(updated ?? {})
    setEditing(null)
  }

  function nav(delta: number) {
    let m = month + delta, y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y); setEditing(null)
  }

  // Build the month grid
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]
  const todayIso = iso(today)

  return (
    <OpsPanel
      title="SERMON CALENDAR"
      tag="PLANNING · SUNDAYS"
      width={560}
      onClose={onClose}
      footer={editing ? (
        <div style={{
          background: CARD, padding: '12px 18px 16px', fontFamily: FONT.mono,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.12em', color: GOLD, fontFamily: FONT.type }}>
              {new Date(editing + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
            </span>
            <button onClick={() => setEditing(null)}
              style={{ background: 'none', border: 'none', color: `${KHAKI}60`, cursor: 'pointer', fontSize: 12 }}>×</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={form.reference}
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
              placeholder="Passage (e.g. Rom 8:1-4)"
              style={{ ...inputStyle, flex: 1 }}
            />
            {currentReference && (
              <button
                onClick={() => setForm(f => ({ ...f, reference: currentReference }))}
                title={`Use ${currentReference}`}
                style={{
                  fontSize: 6.5, letterSpacing: '0.08em', padding: '0 10px', borderRadius: 6,
                  background: `${GOLD}14`, border: `1px solid ${GOLD}40`, color: GOLD,
                  cursor: 'pointer', fontFamily: FONT.mono, whiteSpace: 'nowrap',
                }}>
                USE CURRENT
              </button>
            )}
          </div>
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Sermon title"
            style={{ ...inputStyle, width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
          />
          <input
            value={form.seriesName ?? ''}
            onChange={e => setForm(f => ({ ...f, seriesName: e.target.value }))}
            placeholder="Series (optional)"
            style={{ ...inputStyle, width: '100%', marginBottom: 10, boxSizing: 'border-box' }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: GOLD, color: BASE.bg, fontSize: 14, letterSpacing: '0.12em',
                fontFamily: FONT.display,
              }}>
              SAVE
            </button>
            {entries[editing]?.reference && (
              <button onClick={() => { onLoadReference(entries[editing].reference); onClose() }}
                style={{
                  padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
                  background: `${GOLD}14`, border: `1px solid ${GOLD}40`, color: GOLD,
                  fontSize: 12, letterSpacing: '0.1em', fontFamily: FONT.display,
                }}>
                OPEN PASSAGE
              </button>
            )}
            {entries[editing] && (
              <button onClick={remove}
                style={{
                  padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', border: '1px solid #c0505040', color: '#c07070',
                  fontSize: 12, letterSpacing: '0.1em', fontFamily: FONT.display,
                }}>
                REMOVE
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          padding: '9px 18px',
          fontSize: 8, color: `${KHAKI}55`, letterSpacing: '0.06em', fontFamily: FONT.type,
        }}>
          Click any day to plan — Sundays are highlighted. Planned days glow gold.
        </div>
      )}
    >
      <div style={{ fontFamily: FONT.mono }}>
        {/* Month nav */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px',
        }}>
          <button onClick={() => nav(-1)} style={navBtn}>←</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 22, fontFamily: FONT.display, color: BASE.bone,
              letterSpacing: '0.08em', lineHeight: 1,
            }}>
              {MONTHS[month]} {year}
            </div>
            <button
              onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
              style={{ fontSize: 6.5, letterSpacing: '0.12em', color: `${GOLD}90`, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT.mono, marginTop: 3 }}>
              TODAY
            </button>
          </div>
          <button onClick={() => nav(1)} style={navBtn}>→</button>
        </div>

        {/* Grid */}
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {DOW.map((d, i) => (
              <div key={i} style={{
                textAlign: 'center', fontSize: 7, letterSpacing: '0.1em', padding: '4px 0',
                color: i === 0 ? GOLD : `${KHAKI}60`,
              }}>{d}</div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />
              const dIso = iso(d)
              const entry = entries[dIso]
              const isSunday = d.getDay() === 0
              const isToday = dIso === todayIso
              return (
                <button key={dIso}
                  onClick={() => openEditor(dIso)}
                  style={{
                    minHeight: 64, padding: '5px 6px', borderRadius: 8, cursor: 'pointer',
                    textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3,
                    background: entry ? `${GOLD}12` : isSunday ? `${KHAKI}0a` : 'transparent',
                    border: entry
                      ? `1px solid ${GOLD}55`
                      : isSunday ? `1px solid ${KHAKI}30` : `1px solid ${KHAKI}12`,
                    outline: isToday ? `1px solid ${GOLD}88` : 'none', outlineOffset: 1,
                    transition: 'all 0.12s',
                    fontFamily: FONT.mono,
                  }}>
                  <span style={{
                    fontSize: 8,
                    color: isSunday ? GOLD : `${KHAKI}70`,
                    fontWeight: isToday ? 700 : 400,
                  }}>
                    {d.getDate()}
                  </span>
                  {entry && (
                    <>
                      <span style={{ fontSize: 7.5, color: GOLD, lineHeight: 1.3, fontWeight: 600 }}>
                        {entry.reference}
                      </span>
                      {entry.title && (
                        <span style={{
                          fontSize: 7, color: `${TEXT}bb`, lineHeight: 1.3,
                          fontFamily: FONT.serif, fontStyle: 'italic',
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {entry.title}
                        </span>
                      )}
                      {entry.seriesName && (
                        <span style={{ fontSize: 6, color: `${KHAKI}70`, letterSpacing: '0.06em' }}>
                          {entry.seriesName.toUpperCase()}
                        </span>
                      )}
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </OpsPanel>
  )
}

const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
  background: `${KHAKI}0d`, border: `1px solid ${KHAKI}30`, color: KHAKI,
  fontSize: 13, fontFamily: FONT.mono,
}

const inputStyle: React.CSSProperties = {
  background: DARK, border: `1px solid ${KHAKI}30`, borderRadius: 6,
  padding: '8px 12px', color: TEXT, fontSize: 11,
  fontFamily: FONT.mono, outline: 'none',
}
