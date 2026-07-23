import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, supabaseReady } from '../lib/supabase'
import { BASE, FONT } from '../theme'
import { OpsPanel } from './OpsPanel'

const CARD   = '#2c3820'
const KHAKI  = '#B8B49D'
const GOLD   = '#D8B33F'
const BORDER = `${KHAKI}30`
const TEXT   = '#d8d0b8'

const CATEGORIES = ['Bug', 'Feature', 'UX', 'General'] as const
type Category = typeof CATEGORIES[number]
type Decision = 'comply' | 'ignore' | null

interface FeedbackRow {
  id: string
  created_at: string
  name: string
  category: Category
  body: string
  decision: Decision
  version?: string | null
  platform?: string | null
}

interface Props {
  onClose: () => void
  isAdmin?: boolean   // Cole's build gets true; beta users get false
}

export function BetaFeedback({ onClose, isAdmin = false }: Props) {
  const [tab, setTab]         = useState<'submit' | 'feed'>('submit')
  const [name, setName]       = useState(() => localStorage.getItem('beta-name') ?? '')
  const [category, setCategory] = useState<Category>('General')
  const [body, setBody]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [feed, setFeed]       = useState<FeedbackRow[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [appVersion, setAppVersion] = useState('dev')

  useEffect(() => {
    ;(window as any).electronAPI?.getAppVersion?.()
      .then((v: string) => v && setAppVersion(v))
      .catch(() => {})
  }, [])

  const loadFeed = useCallback(async () => {
    if (!supabase) return
    setFeedLoading(true)
    const { data } = await supabase
      .from('beta_feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) setFeed(data as FeedbackRow[])
    setFeedLoading(false)
  }, [])

  // Real-time subscription
  useEffect(() => {
    if (!supabase || tab !== 'feed') return
    loadFeed()
    const channel = supabase
      .channel('beta_feedback_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beta_feedback' }, () => {
        loadFeed()
      })
      .subscribe()
    return () => { supabase!.removeChannel(channel) }
  }, [tab, loadFeed])

  async function handleSubmit() {
    if (!supabase || !body.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    const n = name.trim() || 'Anonymous'
    localStorage.setItem('beta-name', n)
    const row = { name: n, category, body: body.trim(), decision: null }
    const meta = { version: appVersion, platform: navigator.platform || 'unknown' }

    // Try with version/platform; fall back to plain row if those columns
    // don't exist yet in the table.
    let { error } = await supabase.from('beta_feedback').insert({ ...row, ...meta })
    if (error && /column/i.test(error.message)) {
      ;({ error } = await supabase.from('beta_feedback').insert(row))
    }

    setSubmitting(false)
    if (error) {
      setSubmitError(`Couldn't send — ${error.message}. Check your internet and try again.`)
      return
    }
    setSubmitted(true)
    setBody('')
    setTimeout(() => setSubmitted(false), 3000)
  }

  async function setDecision(id: string, decision: Decision) {
    if (!supabase || !isAdmin) return
    const prev = feed
    // Optimistic update, revert on failure
    setFeed(p => p.map(r => r.id === id ? { ...r, decision } : r))
    const { error } = await supabase.from('beta_feedback').update({ decision }).eq('id', id)
    if (error) setFeed(prev)
  }

  return (
    <OpsPanel
      title="BETA FEEDBACK"
      tag="FIELD REPORTS · DIRECT LINE"
      status={supabaseReady
        ? { label: 'CHANNEL LIVE' }
        : { label: 'OFFLINE MODE', color: '#c07050' }}
      width={480}
      zIndex={9100}
      onClose={onClose}
    >
      {/* Tabs — first row of body content */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${BORDER}`,
        background: CARD, position: 'sticky', top: 0, zIndex: 2,
      }}>
        {(['submit', 'feed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '9px 0 7px', background: 'none',
              border: 'none', borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent',
              color: tab === t ? GOLD : KHAKI, cursor: 'pointer',
              fontSize: 13, letterSpacing: '0.14em', fontFamily: FONT.display,
              transition: 'color 0.15s',
            }}>
            {t === 'submit' ? 'SUBMIT' : 'LIVE FEED'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'submit' && (
          <motion.div key="submit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ padding: '20px 20px 32px', fontFamily: FONT.mono }}>

            {!supabaseReady && (
              <div style={{
                background: '#c0505015', border: `1px solid #c0505040`,
                borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                fontSize: 9, color: '#c07070', lineHeight: 1.6,
              }}>
                Supabase not configured yet — feedback won't save until you add your keys. Still usable for demo.
              </div>
            )}

            {/* Name */}
            <label style={labelStyle}>YOUR NAME</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Pastor John..."
              style={inputStyle}
            />

            {/* Category */}
            <label style={labelStyle}>CATEGORY</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  style={{
                    padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                    background: category === c ? `${GOLD}20` : 'transparent',
                    border: `1px solid ${category === c ? GOLD + '70' : BORDER}`,
                    color: category === c ? GOLD : KHAKI,
                    fontSize: 7.5, letterSpacing: '0.08em',
                    fontFamily: FONT.mono,
                  }}>
                  {c}
                </button>
              ))}
            </div>

            {/* Body */}
            <label style={labelStyle}>FEEDBACK</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="What's working, what's broken, what's missing..."
              rows={6}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: FONT.serif, fontSize: 13, lineHeight: 1.7 }}
            />

            {submitError && (
              <div style={{
                background: '#c0505015', border: '1px solid #c0505040',
                borderRadius: 6, padding: '8px 12px', marginBottom: 10,
                fontSize: 8.5, color: '#c07070', lineHeight: 1.6,
              }}>
                ⚠ {submitError}
              </div>
            )}

            <button onClick={handleSubmit}
              disabled={!body.trim() || submitting}
              style={{
                width: '100%', padding: '10px', borderRadius: 6, border: 'none',
                background: submitted ? `${GOLD}50` : body.trim() ? GOLD : `${GOLD}30`,
                color: BASE.bg, cursor: body.trim() ? 'pointer' : 'default',
                fontSize: 15, letterSpacing: '0.12em',
                fontFamily: FONT.display, marginTop: 4,
                transition: 'all 0.2s',
              }}>
              {submitted ? '✓ SENT' : submitting ? 'SENDING...' : 'SEND FEEDBACK'}
            </button>
          </motion.div>
        )}

        {tab === 'feed' && (
          <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ padding: '16px 16px 32px', fontFamily: FONT.mono }}>

            {feedLoading && (
              <div style={{ fontSize: 8, color: KHAKI, opacity: 0.4, textAlign: 'center', padding: 20 }}>
                Loading feed...
              </div>
            )}

            {!feedLoading && feed.length === 0 && (
              <div style={{ fontSize: 9, color: KHAKI, opacity: 0.4, textAlign: 'center', padding: 30 }}>
                No feedback yet. Share the app and it'll show up here live.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {feed.map(row => (
                <FeedCard key={row.id} row={row} isAdmin={isAdmin} onDecide={setDecision} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </OpsPanel>
  )
}

function FeedCard({ row, isAdmin, onDecide }: {
  row: FeedbackRow
  isAdmin: boolean
  onDecide: (id: string, d: Decision) => void
}) {
  const catColor: Record<Category, string> = {
    Bug: '#c05050', Feature: '#5090c0', UX: '#9060c0', General: KHAKI,
  }
  const decisionColor = row.decision === 'comply' ? GOLD : row.decision === 'ignore' ? '#888' : 'transparent'

  return (
    <div style={{
      background: CARD, border: `1px solid ${row.decision ? decisionColor + '55' : BORDER}`,
      borderRadius: 8, padding: '12px 14px',
      opacity: row.decision === 'ignore' ? 0.45 : 1,
      fontFamily: FONT.mono,
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 6.5, letterSpacing: '0.12em', padding: '2px 7px',
          border: `1px solid ${catColor[row.category]}55`,
          color: catColor[row.category], borderRadius: 3,
        }}>
          {row.category.toUpperCase()}
        </span>
        <span style={{ fontSize: 8, color: KHAKI, opacity: 0.55 }}>{row.name}</span>
        {row.version && (
          <span style={{ fontSize: 6.5, color: KHAKI, opacity: 0.35 }}>
            v{row.version}{row.platform ? ` · ${row.platform}` : ''}
          </span>
        )}
        <span style={{ fontSize: 7, color: KHAKI, opacity: 0.3, marginLeft: 'auto', fontFamily: FONT.type }}>
          {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.7, fontFamily: FONT.serif, marginBottom: isAdmin ? 10 : 0 }}>
        {row.body}
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={() => onDecide(row.id, row.decision === 'comply' ? null : 'comply')}
            style={{
              padding: '3px 12px', borderRadius: 4, cursor: 'pointer',
              background: row.decision === 'comply' ? `${GOLD}25` : 'transparent',
              border: `1px solid ${row.decision === 'comply' ? GOLD + '70' : BORDER}`,
              color: row.decision === 'comply' ? GOLD : KHAKI,
              fontSize: 7, letterSpacing: '0.1em', fontFamily: FONT.mono,
            }}>
            ✓ COMPLY
          </button>
          <button onClick={() => onDecide(row.id, row.decision === 'ignore' ? null : 'ignore')}
            style={{
              padding: '3px 12px', borderRadius: 4, cursor: 'pointer',
              background: row.decision === 'ignore' ? `#88888825` : 'transparent',
              border: `1px solid ${row.decision === 'ignore' ? '#88888860' : BORDER}`,
              color: row.decision === 'ignore' ? '#aaa' : KHAKI,
              fontSize: 7, letterSpacing: '0.1em', fontFamily: FONT.mono,
            }}>
            ✗ IGNORE
          </button>
          {row.decision && (
            <span style={{ fontSize: 7, color: row.decision === 'comply' ? GOLD : '#888', alignSelf: 'center', marginLeft: 4, fontFamily: FONT.type }}>
              {row.decision === 'comply' ? '→ on the list' : '→ not doing it'}
            </span>
          )}
        </div>
      )}

      {!isAdmin && row.decision && (
        <div style={{ fontSize: 7.5, color: row.decision === 'comply' ? GOLD : '#888', marginTop: 6, fontFamily: FONT.type }}>
          {row.decision === 'comply' ? '✓ Cole is working on this' : '— not planned'}
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 7, letterSpacing: '0.14em',
  color: KHAKI, opacity: 0.55, marginBottom: 6, fontFamily: FONT.mono,
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: CARD, border: `1px solid ${BORDER}`,
  borderRadius: 6, padding: '8px 12px', color: TEXT,
  fontSize: 11, fontFamily: FONT.mono,
  outline: 'none', marginBottom: 14, boxSizing: 'border-box',
}
