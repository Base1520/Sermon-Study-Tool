import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BASE } from '../theme'

interface SermonMeta { id: string; title: string; addedAt: string }
interface SermonFull extends SermonMeta { text: string }

interface Profile {
  identity: string
  theology: string
  preachingMethod: string
  congregation: string
  hermeneutics: string
  voiceModels?: string
  sermons: SermonFull[]
  learnedInsights: string[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  apiKey?: string
}

const LABEL: React.CSSProperties = {
  fontFamily: 'JetBrains Mono', fontSize: 8,
  color: BASE.gold, letterSpacing: '0.12em', opacity: 0.7,
  display: 'block', marginBottom: 5,
}

const FIELD: React.CSSProperties = {
  width: '100%', background: BASE.goldDim,
  border: `1px solid ${BASE.borderDim}`, borderRadius: 10,
  padding: '10px 12px', fontSize: 13, color: BASE.bone,
  fontFamily: 'Crimson Pro, serif', lineHeight: 1.6,
  outline: 'none', resize: 'vertical', boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}

export function ScholarProfile({ isOpen, onClose }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tab, setTab] = useState<'profile' | 'sermons' | 'insights'>('profile')
  const [saving, setSaving] = useState(false)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SermonMeta[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedSermon, setSelectedSermon] = useState<SermonFull | null>(null)
  const [sermonTotal, setSermonTotal] = useState(0)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [addTitle, setAddTitle] = useState('')
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    if (isOpen && !profile) {
      ;(window as any).electronAPI.profileGet().then((p: Profile) => {
        setProfile(p)
        setSermonTotal(p.sermons?.length ?? 0)
      })
    }
    if (isOpen && tab === 'sermons' && searchResults.length === 0 && !searching) {
      loadSermons('')
    }
  }, [isOpen, tab])

  async function loadSermons(q: string) {
    setSearching(true)
    const results = await (window as any).electronAPI.profileSearchSermons(q)
    setSearchResults(results)
    setSearching(false)
  }

  function handleSearch(q: string) {
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadSermons(q), 250)
  }

  async function openSermon(meta: SermonMeta) {
    const full = await (window as any).electronAPI.profileGetSermon(meta.id)
    setSelectedSermon(full)
  }

  async function save() {
    if (!profile) return
    setSaving(true)
    await (window as any).electronAPI.profileSave(profile)
    setSaving(false)
  }

  async function addSermon() {
    if (!addTitle.trim() || !addText.trim()) return
    setAdding(true)
    await (window as any).electronAPI.profileAddSermon({ title: addTitle.trim(), text: addText.trim() })
    const updated = await (window as any).electronAPI.profileGet()
    setProfile(updated)
    setSermonTotal(updated.sermons?.length ?? 0)
    setAddTitle(''); setAddText(''); setShowAdd(false); setAdding(false)
    loadSermons(query)
  }

  async function removeInsight(i: number) {
    if (!profile) return
    const updated = { ...profile, learnedInsights: profile.learnedInsights.filter((_, j) => j !== i) }
    setProfile(updated)
    await (window as any).electronAPI.profileSave(updated)
  }

  const tabCount = (t: string) => {
    if (t === 'sermons') return sermonTotal
    if (t === 'insights') return profile?.learnedInsights?.length ?? 0
    return null
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', top: 44, left: 0, right: 0, bottom: 0, zIndex: 210, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            style={{
              position: 'fixed', top: 44, right: 0, bottom: 0, width: 540, zIndex: 211,
              background: `${BASE.bg}f8`,
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              borderLeft: `1px solid ${BASE.borderGold}`,
              display: 'flex', flexDirection: 'column',
              boxShadow: `-20px 0 60px rgba(0,0,0,0.6)`,
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0,
                  color: BASE.gold,
                }}>✦</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 15, color: BASE.bone, fontWeight: 500 }}>My Theology</div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.1em', marginTop: 1 }}>
                    trains all agents · grows over time
                  </div>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: BASE.steel, fontSize: 18, padding: '0 4px', lineHeight: 1 }}>×</button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${BASE.borderDim}` }}>
                {(['profile', 'sermons', 'insights'] as const).map(t => {
                  const count = tabCount(t)
                  const active = tab === t
                  return (
                    <button key={t} onClick={() => setTab(t)} style={{
                      padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.1em',
                      color: active ? BASE.gold : BASE.steel,
                      borderBottom: active ? `1px solid ${BASE.gold}` : '1px solid transparent',
                      marginBottom: -1, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      {t}
                      {count !== null && (
                        <span style={{
                          background: active ? BASE.goldDim : `${BASE.olive}22`,
                          border: `1px solid ${active ? BASE.borderGold : BASE.borderDim}`,
                          borderRadius: 8, padding: '1px 5px', fontSize: 7,
                          color: active ? BASE.gold : BASE.steel,
                        }}>{count}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* PROFILE TAB */}
              {tab === 'profile' && (
                !profile ? (
                  <div style={{ color: BASE.steel, fontFamily: 'JetBrains Mono', fontSize: 9, marginTop: 20 }}>loading…</div>
                ) : (
                  <>
                    <style>{`.profile-field::placeholder { color: ${BASE.steel}; opacity: 0.45; font-style: italic; }`}</style>
                    <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.steel, lineHeight: 1.6 }}>
                      Fill in your details below — all agents read this before every conversation and use it to give you congregation-specific applications.
                    </div>
                    {([
                      ['identity', 'WHO YOU ARE', 3,
                        'e.g. John Smith — Lead Pastor, Grace Community Church, Nashville, TN (8 years). M.Div., Southern Baptist Theological Seminary. Southern Baptist.'],
                      ['congregation', 'YOUR CONGREGATION', 3,
                        'e.g. Grace Community — suburban, theologically mixed, mostly young families. Strong in worship attendance, weaker in weekday discipleship. Many come from unchurched backgrounds.'],
                      ['theology', 'YOUR THEOLOGY', 4,
                        'e.g. Reformed Baptist. Affirms the 1689 London Baptist Confession. Emphasis on grace, the sovereignty of God, and the authority of Scripture. Complementarian. Cessationist.'],
                      ['preachingMethod', 'PREACHING METHOD', 4,
                        'e.g. Expository, book-by-book. Preaches 35–40 minutes. Uses manuscript but preaches conversationally. Application is central — moves from text to life in every point. Avoids heavy theological vocabulary without explanation.'],
                      ['hermeneutics', 'HERMENEUTICAL APPROACH', 3,
                        'e.g. Historical-grammatical method. Text means what it meant to its original audience. Christocentric reading of the OT. Lets the genre shape the sermon form.'],
                    ] as [keyof Profile, string, number, string][]).map(([key, label, rows, placeholder]) => (
                      <div key={key}>
                        <label style={LABEL}>{label}</label>
                        <textarea
                          value={profile[key] as string}
                          onChange={e => setProfile({ ...profile, [key]: e.target.value })}
                          rows={rows}
                          placeholder={placeholder}
                          className="profile-field"
                          style={{ ...FIELD, color: BASE.bone }}
                          onFocus={e => { e.target.style.borderColor = BASE.borderGold }}
                          onBlur={e => { e.target.style.borderColor = BASE.borderDim }}
                        />
                      </div>
                    ))}
                    <button onClick={save} disabled={saving} style={{
                      padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                      background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
                      color: BASE.gold, fontFamily: 'Crimson Pro, serif', fontSize: 14,
                      transition: 'all 0.2s',
                    }}>{saving ? 'Saving…' : 'Save Profile'}</button>
                  </>
                )
              )}

              {/* SERMONS TAB */}
              {tab === 'sermons' && (
                selectedSermon ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <button onClick={() => setSelectedSermon(null)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.gold,
                      letterSpacing: '0.1em', padding: 0, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.7,
                    }}>← back to library</button>
                    <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 16, color: BASE.bone, lineHeight: 1.4 }}>
                      {selectedSermon.title}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.08em' }}>
                      {new Date(selectedSermon.addedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    <div style={{
                      fontFamily: 'Crimson Pro, serif', fontSize: 13.5, color: BASE.boneMid,
                      lineHeight: 1.75, whiteSpace: 'pre-wrap',
                      background: BASE.goldDim, border: `1px solid ${BASE.borderDim}`,
                      borderRadius: 10, padding: '14px 16px',
                    }}>
                      {selectedSermon.text}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Search */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: BASE.goldDim, border: `1px solid ${BASE.borderDim}`,
                      borderRadius: 10, padding: '8px 12px',
                    }}>
                      <span style={{ color: BASE.steel, fontSize: 12 }}>⌕</span>
                      <input
                        value={query}
                        onChange={e => handleSearch(e.target.value)}
                        placeholder={`Search ${sermonTotal} sermons…`}
                        style={{
                          flex: 1, background: 'none', border: 'none', outline: 'none',
                          fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.bone,
                        }}
                      />
                      {query && (
                        <button onClick={() => { setQuery(''); loadSermons('') }} style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: BASE.steel, fontSize: 14, padding: 0,
                        }}>×</button>
                      )}
                    </div>

                    {/* Add sermon toggle */}
                    <button onClick={() => setShowAdd(v => !v)} style={{
                      background: showAdd ? BASE.goldDim : 'none',
                      border: `1px solid ${showAdd ? BASE.borderGold : BASE.borderDim}`,
                      borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                      fontFamily: 'JetBrains Mono', fontSize: 8,
                      color: showAdd ? BASE.gold : BASE.steel, letterSpacing: '0.08em', textAlign: 'left',
                    }}>{showAdd ? '− cancel' : '+ add sermon manuscript'}</button>

                    {/* Add sermon form */}
                    {showAdd && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px', background: BASE.goldDim, borderRadius: 10, border: `1px solid ${BASE.borderGold}` }}>
                        <div>
                          <label style={LABEL}>TITLE / REFERENCE</label>
                          <input value={addTitle} onChange={e => setAddTitle(e.target.value)}
                            placeholder="e.g. Galatians 3:23-29 — No Longer Under a Guardian"
                            style={{ ...FIELD, resize: undefined as any }} />
                        </div>
                        <div>
                          <label style={LABEL}>MANUSCRIPT TEXT</label>
                          <textarea value={addText} onChange={e => setAddText(e.target.value)}
                            placeholder="Paste the full sermon text here…"
                            rows={6} style={FIELD} />
                        </div>
                        <button onClick={addSermon} disabled={adding || !addTitle.trim() || !addText.trim()} style={{
                          padding: '9px 0', borderRadius: 8, cursor: 'pointer',
                          background: BASE.goldMid, border: `1px solid ${BASE.borderGold}`,
                          color: BASE.gold, fontFamily: 'Crimson Pro, serif', fontSize: 14,
                        }}>{adding ? 'Adding…' : 'Add Sermon'}</button>
                      </div>
                    )}

                    {/* Results */}
                    {searching ? (
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, padding: '8px 0' }}>searching…</div>
                    ) : (
                      <>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, letterSpacing: '0.08em', opacity: 0.6 }}>
                          {query ? `${searchResults.length} results` : `${searchResults.length} manuscripts · most recent first`}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {searchResults.map(s => (
                            <button key={s.id} onClick={() => openSermon(s)} style={{
                              background: BASE.goldDim, border: `1px solid ${BASE.borderDim}`,
                              borderRadius: 8, padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
                              transition: 'all 0.12s',
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.background = BASE.goldMid
                              ;(e.currentTarget as HTMLElement).style.borderColor = BASE.borderGold
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.background = BASE.goldDim
                              ;(e.currentTarget as HTMLElement).style.borderColor = BASE.borderDim
                            }}>
                              <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13.5, color: BASE.boneMid, lineHeight: 1.35 }}>
                                {s.title}
                              </div>
                              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel, marginTop: 4, letterSpacing: '0.06em' }}>
                                {new Date(s.addedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                              </div>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )
              )}

              {/* INSIGHTS TAB */}
              {tab === 'insights' && (
                !profile ? (
                  <div style={{ color: BASE.steel, fontFamily: 'JetBrains Mono', fontSize: 9, marginTop: 20 }}>loading…</div>
                ) : (
                  <>
                    <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.steel, lineHeight: 1.6 }}>
                      Things the agents have learned about you from your conversations. Grows automatically as you use Scholar Chat.
                    </div>
                    {profile.learnedInsights?.length === 0 ? (
                      <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.steel, fontStyle: 'italic', marginTop: 8, opacity: 0.6 }}>
                        No insights yet — use the Scholar or agent chats and they'll start learning your instincts.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {profile.learnedInsights.map((insight, i) => (
                          <div key={i} style={{
                            padding: '9px 12px', background: BASE.goldDim,
                            border: `1px solid ${BASE.borderDim}`, borderRadius: 8,
                            display: 'flex', gap: 10, alignItems: 'flex-start',
                          }}>
                            <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.boneMid, margin: 0, flex: 1, lineHeight: 1.6 }}>
                              {insight}
                            </p>
                            <button onClick={() => removeInsight(i)} style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: BASE.steel, fontSize: 14, padding: 0, flexShrink: 0, lineHeight: 1, opacity: 0.5,
                            }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
