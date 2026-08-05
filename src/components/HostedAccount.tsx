import { useState, useEffect, useCallback } from 'react'
import { BASE, FONT } from '../theme'

/**
 * HostedAccount — what this install is entitled to, and how to change it.
 *
 * On a hosted build this REPLACES the API-key panel entirely. That is the whole
 * point of the server: the reader never gets a key, never visits
 * console.anthropic.com, never pastes anything to run one study. Seven men were
 * asked to test this app and zero ran a study, and the setup wall was why.
 *
 * Three states, and the component only ever shows one:
 *   anonymous  — one free study, then the offer
 *   comped     — a code was redeemed; say so plainly and get out of the way
 *   paying     — plan, used, remaining
 */

interface Entitlement {
  anonymous: boolean
  email: string | null
  plan: string
  label: string
  paying: boolean
  allowance: number
  lifetimeStudies?: number
  used: number
  remaining: number
  plans?: Record<string, { label: string; priceUsd: number; studiesPerMonth: number }>
}

/** The server's own words when it refuses. Never paraphrase these. */
export interface UpgradeOffer {
  error?: string
  code?: string
  headline?: string
  body?: string
  message?: string
  actions?: Array<{ kind?: string; plan?: string; label: string }>
}

const api = () => (window as any).electronAPI

export function HostedAccount({ offer, onClose, onChanged }: {
  offer?: UpgradeOffer | null
  onClose?: () => void
  onChanged?: () => void
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [me, setMe] = useState<Entitlement | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const state = await api()?.hostedMe?.()
      // null means OFFLINE, not "free". Keeping the last known entitlement is
      // deliberate: dropped wifi must never tell a paying man he is not one.
      if (state) setMe(state)
    } catch { /* offline is not an entitlement change */ }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const on = await api()?.hostedEnabled?.()
        if (!alive) return
        setEnabled(Boolean(on))
        if (on) await refresh()
      } catch { if (alive) setEnabled(false) }
    })()
    return () => { alive = false }
  }, [refresh])

  const redeem = useCallback(async () => {
    const trimmed = code.trim()
    if (!trimmed || busy) return
    setBusy(true); setError(null); setNote(null)
    try {
      const res = await api().hostedRedeem(trimmed)
      if (!res?.ok) { setError(res?.message || "That code isn't valid."); return }
      setNote(res.label ? `Unlocked — ${res.label}.` : 'Unlocked.')
      setCode('')
      await refresh()
      onChanged?.()
    } catch (e: any) {
      setError(e?.message || 'That code could not be redeemed.')
    } finally { setBusy(false) }
  }, [code, busy, refresh, onChanged])

  const subscribe = useCallback(async (plan: string) => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      await api().hostedCheckout({ plan })
      setNote('Checkout opened in your browser. Come back when you are done — this will pick it up.')
      // The app never sees the browser's return, so it asks the server instead.
      // "Not yet" is a normal answer here; the webhook and the customer's
      // browser are racing each other.
      let tries = 0
      const poll = setInterval(async () => {
        tries++
        try {
          const res = await api().hostedClaim()
          if (res?.ok) {
            clearInterval(poll)
            setNote('Subscription active. Thank you.')
            await refresh()
            onChanged?.()
          }
        } catch { /* keep waiting */ }
        if (tries > 40) { clearInterval(poll); setNote(null) }
      }, 3000)
    } catch (e: any) {
      setError(e?.message || 'Checkout could not be opened.')
    } finally { setBusy(false) }
  }, [busy, refresh, onChanged])

  // A local-key build has no account surface at all.
  if (enabled === false) return null
  if (enabled === null) return null

  const label = (s: string) => (
    <div style={{ font: `600 9px ${FONT.mono}`, letterSpacing: '0.14em', color: BASE.steel, marginBottom: 6 }}>
      {s}
    </div>
  )

  const headline = offer?.headline || (
    me?.paying ? `${me.label} — ${me.remaining} of ${me.allowance} studies left this month`
    : me?.anonymous ? 'One free study, on the house'
    : 'Your account'
  )

  return (
    <div style={{
      background: BASE.bgCard,
      border: `1px solid ${offer ? BASE.borderGold : BASE.border}`,
      borderRadius: 4,
      padding: 20,
      maxWidth: 520,
    }}>
      <div style={{ font: `600 15px ${FONT.display}`, color: BASE.bone, marginBottom: 8 }}>
        {headline}
      </div>

      {/* The server's own reassurance, verbatim. It is written to say that the
          work already done does not go away, which is the single thing a man
          hitting a paywall most needs to hear. */}
      {(offer?.body || offer?.message) && (
        <div style={{ font: `400 13px/1.55 ${FONT.serif}`, color: BASE.boneMid, marginBottom: 16 }}>
          {offer.body || offer.message}
        </div>
      )}

      {!offer && me && !me.anonymous && !me.paying && (
        <div style={{ font: `400 13px/1.55 ${FONT.serif}`, color: BASE.boneMid, marginBottom: 16 }}>
          Everything you have already studied stays available, always.
        </div>
      )}

      {me?.plan === 'comp' && (
        <div style={{
          font: `400 12px ${FONT.mono}`, color: BASE.gold,
          background: BASE.goldDim, border: `1px solid ${BASE.borderGold}`,
          borderRadius: 3, padding: '8px 10px', marginBottom: 16,
        }}>
          Comped access — {me.remaining} of {me.allowance} studies left this month.
        </div>
      )}

      {/* ── Plans ─────────────────────────────────────────────────────────── */}
      {(offer?.actions?.length || (me && !me.paying)) && (
        <div style={{ marginBottom: 18 }}>
          {label('SUBSCRIBE')}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(offer?.actions?.length
              ? offer.actions.filter(a => a.plan)
              : Object.entries(me?.plans ?? {})
                  .filter(([k]) => k !== 'free' && k !== 'comp')
                  .map(([k, v]) => ({ plan: k, label: `${v.label} — $${v.priceUsd}/mo · ${v.studiesPerMonth} studies` }))
            ).map((a: any) => (
              <button
                key={a.plan}
                disabled={busy}
                onClick={() => subscribe(a.plan)}
                style={{
                  font: `600 11px ${FONT.mono}`, letterSpacing: '0.06em',
                  color: BASE.bone, background: BASE.green,
                  border: `1px solid ${BASE.borderGold}`, borderRadius: 3,
                  padding: '9px 12px', cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Access code ───────────────────────────────────────────────────── */}
      <div>
        {label('ACCESS CODE')}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') redeem() }}
            placeholder="OPERATOR-…"
            spellCheck={false}
            autoCapitalize="characters"
            style={{
              flex: 1, font: `400 13px ${FONT.mono}`, color: BASE.bone,
              background: BASE.bg, border: `1px solid ${BASE.border}`,
              borderRadius: 3, padding: '9px 10px', outline: 'none',
            }}
          />
          <button
            onClick={redeem}
            disabled={busy || !code.trim()}
            style={{
              font: `600 11px ${FONT.mono}`, letterSpacing: '0.06em',
              color: BASE.bg, background: BASE.gold, border: 'none', borderRadius: 3,
              padding: '9px 16px',
              cursor: busy || !code.trim() ? 'default' : 'pointer',
              opacity: busy || !code.trim() ? 0.4 : 1,
            }}
          >
            {busy ? '…' : 'UNLOCK'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ font: `400 12px ${FONT.mono}`, color: BASE.red, marginTop: 12 }}>{error}</div>
      )}
      {note && (
        <div style={{ font: `400 12px ${FONT.mono}`, color: BASE.gold, marginTop: 12 }}>{note}</div>
      )}

      {onClose && (
        <button
          onClick={onClose}
          style={{
            font: `600 10px ${FONT.mono}`, letterSpacing: '0.12em',
            color: BASE.steel, background: 'none', border: 'none',
            marginTop: 18, padding: 0, cursor: 'pointer',
          }}
        >
          CLOSE
        </button>
      )}
    </div>
  )
}
