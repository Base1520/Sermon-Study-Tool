import { useState, useEffect } from 'react'
import { BASE } from '../theme'
import { friendlyApiError, type FriendlyError } from '../lib/apiErrors'
import { HostedAccount } from './HostedAccount'

interface Props {
  onSave: (anthropicKey: string, esvKey?: string) => Promise<void>
  onClose: () => void
  onDemo?: () => void
  hasExistingKey: boolean
  hasExistingEsvKey?: boolean
}

/** What main reports back about this install's entitlement. */
interface LicenseState {
  licensed: boolean
  message: string
  issuedTo?: string | null
  org?: string | null
  tier?: string | null
  seats?: number
  daysLeft?: number | null
  inGrace?: boolean
  error?: string
  ok?: boolean
}

const ZOOMS = [
  { f: 1,    label: 'NORMAL' },
  { f: 1.15, label: 'LARGE' },
  { f: 1.3,  label: 'X-LARGE' },
  { f: 1.5,  label: 'HUGE' },
]

export function ApiKeyModal({ onSave, onClose, onDemo, hasExistingKey, hasExistingEsvKey = false }: Props) {
  /* On a hosted build the Anthropic key is not the reader's problem — it lives
     on the server. Showing a key form there would rebuild the exact setup wall
     the server exists to remove, so the account panel takes its place. The ESV
     key stays available below either way: that one is genuinely the reader's,
     tied to his own Crossway terms. */
  const [hostedBuild, setHostedBuild] = useState<boolean | null>(null)
  useEffect(() => {
    ;(window as any).electronAPI?.hostedEnabled?.()
      .then((on: boolean) => setHostedBuild(Boolean(on)))
      .catch(() => setHostedBuild(false))
  }, [])

  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    ;(window as any).electronAPI.getUiZoom?.().then((z: number) => setZoom(z ?? 1)).catch(() => {})
  }, [])
  function applyZoom(f: number) {
    setZoom(f)
    ;(window as any).electronAPI.setUiZoom?.(f).catch(() => {})
  }
  const [key, setKey]       = useState('')
  const [esvKey, setEsvKey] = useState('')
  const [showAnthropicHelp, setShowAnthropicHelp] = useState(!hasExistingKey)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState<FriendlyError | null>(null)

  // Licensing. Kept separate from the key fields on purpose: a license is
  // applied on its own, immediately, and must not be hostage to whether the
  // Anthropic key happens to validate at the same moment.
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseState, setLicenseState] = useState<LicenseState | null>(null)
  const [licenseBusy, setLicenseBusy] = useState(false)
  const [licenseError, setLicenseError] = useState<string | null>(null)

  useEffect(() => {
    ;(window as any).electronAPI?.licenseStatus?.()
      .then((s: LicenseState) => setLicenseState(s))
      .catch(() => {})
  }, [])

  async function applyLicense() {
    const value = licenseKey.trim()
    if (!value || licenseBusy) return
    setLicenseBusy(true)
    setLicenseError(null)
    try {
      const result = await (window as any).electronAPI.licenseSet(value)
      if (result?.ok) {
        setLicenseState(result)
        setLicenseKey('')
      } else {
        setLicenseError(result?.error ?? 'That license key did not verify.')
      }
    } catch (e: any) {
      setLicenseError(friendlyApiError(e).detail)
    } finally {
      setLicenseBusy(false)
    }
  }

  const canSave = Boolean(key.trim() || hasExistingKey) && !testing

  async function connect() {
    if (!canSave) return
    setTesting(true)
    setTestError(null)
    try {
      if (key.trim()) {
        const test = (window as any).electronAPI?.testAnthropicKey
        if (test) await test(key.trim())
      }
      await onSave(key.trim(), esvKey.trim())
    } catch (error) {
      setTestError(friendlyApiError(error))
    } finally {
      setTesting(false)
    }
  }

  const fieldStyle = {
    width: '100%',
    background: BASE.goldDim,
    border: `1px solid ${BASE.borderDim}`,
    borderRadius: 10, padding: '11px 14px',
    fontSize: 13, color: BASE.bone,
    fontFamily: 'JetBrains Mono', outline: 'none',
    letterSpacing: '0.04em', transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  }

  const stepStyle = {
    fontFamily: 'Crimson Pro, serif', fontSize: 12.5,
    color: BASE.boneMid, lineHeight: 1.6,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,12,9,0.75)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <div style={{
        background: `${BASE.bg}f4`,
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: `1px solid ${BASE.borderGold}`,
        borderRadius: 16, padding: 32, width: '100%', maxWidth: 460,
        boxShadow: `0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px ${BASE.borderDim}`,
        position: 'relative', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
          background: `linear-gradient(90deg, transparent, ${BASE.gold}66, transparent)`,
        }} />

        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.steel, letterSpacing: '0.14em', marginBottom: 8 }}>
          {hostedBuild ? 'ACCOUNT' : 'API KEYS'}
        </div>
        <h2 style={{ fontFamily: 'Crimson Pro, serif', fontSize: 24, color: BASE.bone, marginBottom: 6, fontWeight: 400 }}>
          {hostedBuild ? 'Your Access' : 'Connect Your APIs'}
        </h2>
        <p style={{ fontFamily: 'Crimson Pro, serif', fontSize: 13, color: BASE.steel, lineHeight: 1.6, marginBottom: 24 }}>
          {hostedBuild
            ? 'No API key needed. Studies run on our servers — enter an access code or subscribe.'
            : 'Keys stay on this Mac and are sent only to the services you connect.'}
        </p>

        {hostedBuild && (
          <div style={{ marginBottom: 24 }}>
            <HostedAccount />
          </div>
        )}

        {/* Anthropic key — hidden on a hosted build; the server holds it. */}
        <div style={{ marginBottom: 20, display: hostedBuild ? 'none' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.gold, letterSpacing: '0.12em', opacity: 0.9 }}>
              ANTHROPIC — required for new studies
            </div>
            <button
              onClick={() => setShowAnthropicHelp(h => !h)}
              style={{
                fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.steel,
                background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em',
              }}
            >
              {showAnthropicHelp ? 'hide setup' : 'how to get key'}
            </button>
          </div>

          {showAnthropicHelp && (
            <div style={{
              background: `${BASE.gold}08`, border: `1px solid ${BASE.gold}22`,
              borderRadius: 8, padding: '12px 14px', marginBottom: 10,
            }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: BASE.gold, letterSpacing: '0.1em', marginBottom: 8 }}>
                SET UP ANTHROPIC
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <li style={stepStyle}>Go to <strong style={{ color: BASE.bone }}>console.anthropic.com</strong> and sign in</li>
                <li style={stepStyle}>Add billing credits; creating a key alone does not fund API use</li>
                <li style={stepStyle}>Open <strong style={{ color: BASE.bone }}>API Keys</strong>, create a key, and give it a name</li>
                <li style={stepStyle}>Copy the key (starts with <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: BASE.gold }}>sk-ant-</span>) and paste it below</li>
              </ol>
              <div style={{
                marginTop: 10, padding: '6px 10px',
                background: `${BASE.gold}0a`, borderRadius: 6,
                fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.steel, lineHeight: 1.5,
              }}>
                Connect runs a tiny live check against the same Claude model the study uses, so a rejected key or empty balance is caught here instead of halfway through a passage.
              </div>
            </div>
          )}

          <input
            type="password" value={key}
            onChange={e => setKey(e.target.value.trim())}
            placeholder={hasExistingKey ? 'Protected key saved — paste a new key to replace it' : 'sk-ant-...'}
            autoComplete="off" spellCheck={false}
            style={{ ...fieldStyle, fontFamily: key ? 'JetBrains Mono' : 'Crimson Pro, serif' }}
            onFocus={e => (e.target.style.borderColor = BASE.borderGold)}
            onBlur={e => (e.target.style.borderColor = BASE.borderDim)}
            onKeyDown={e => e.key === 'Enter' && canSave && void connect()}
          />
          {testError && (
            <div role="alert" style={{
              marginTop: 10,
              padding: '9px 11px',
              border: `1px solid ${BASE.red}55`,
              background: `${BASE.red}10`,
            }}>
              <div style={{ fontFamily: 'Saira, sans-serif', fontSize: 11, color: BASE.red, fontWeight: 700 }}>
                {testError.headline}
              </div>
              <div style={{ ...stepStyle, marginTop: 3 }}>{testError.detail}</div>
              {testError.link && (
                <div style={{ ...stepStyle, color: BASE.gold, marginTop: 4 }}>{testError.link}</div>
              )}
            </div>
          )}
        </div>

        {/* ESV key */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.khaki, letterSpacing: '0.12em', marginBottom: 6, opacity: 0.9 }}>
            ESV API KEY <span style={{ color: BASE.steel, fontWeight: 400 }}>(optional — unlocks ESV translation)</span>
          </div>
          <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.steel, lineHeight: 1.5, marginBottom: 8 }}>
            Free key at <strong style={{ color: BASE.boneMid }}>api.esv.org</strong>. Without it, KJV/ASV/YLT still work with no key required.
          </div>
          <input
            type="password" value={esvKey}
            onChange={e => setEsvKey(e.target.value.trim())}
            placeholder={hasExistingEsvKey ? 'Protected ESV key saved — paste to replace it' : 'Leave blank to use KJV / ASV / YLT instead'}
            autoComplete="off" spellCheck={false}
            style={{ ...fieldStyle, fontFamily: esvKey ? 'JetBrains Mono' : 'Crimson Pro, serif' }}
            onFocus={e => (e.target.style.borderColor = `${BASE.khaki}66`)}
            onBlur={e => (e.target.style.borderColor = BASE.borderDim)}
            onKeyDown={e => e.key === 'Enter' && canSave && void connect()}
          />
        </div>

        {/* License. Applied on its own button so it never waits on the API key. */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: BASE.khaki, letterSpacing: '0.12em', marginBottom: 6, opacity: 0.9 }}>
            LICENSE KEY <span style={{ color: BASE.steel, fontWeight: 400 }}>(optional — unlocks new studies)</span>
          </div>

          {licenseState?.licensed ? (
            <div style={{
              fontFamily: 'Crimson Pro, serif', fontSize: 12, lineHeight: 1.5,
              color: BASE.boneMid, background: `${BASE.olive}18`,
              border: `1px solid ${BASE.borderGold}`, borderRadius: 10, padding: '10px 13px',
            }}>
              {/* Named, deliberately and persistently. A man will not run a tool
                  with another man's name on it — which is most of the defence a
                  shareable key can honestly have. */}
              <span style={{ color: BASE.gold }}>Licensed</span>
              {licenseState.org
                ? <> to <strong style={{ color: BASE.bone }}>{licenseState.org}</strong></>
                : licenseState.issuedTo
                  ? <> to <strong style={{ color: BASE.bone }}>{licenseState.issuedTo}</strong></>
                  : null}
              {typeof licenseState.seats === 'number' && licenseState.seats > 1 && <> · {licenseState.seats} seats</>}
              {licenseState.inGrace
                ? <div style={{ color: BASE.khaki, marginTop: 4 }}>Expired, still working while you renew.</div>
                : typeof licenseState.daysLeft === 'number'
                  ? <div style={{ color: BASE.steel, marginTop: 4 }}>{licenseState.daysLeft} days remaining.</div>
                  : null}
            </div>
          ) : (
            <>
              <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.steel, lineHeight: 1.5, marginBottom: 8 }}>
                Came in your email as one long line. Without it the Academy, the worked study,
                the maps and everything you have already studied still work.
              </div>
              <input
                type="text" value={licenseKey}
                onChange={e => setLicenseKey(e.target.value)}
                placeholder="Paste your license key"
                autoComplete="off" spellCheck={false}
                style={{ ...fieldStyle, fontFamily: licenseKey ? 'JetBrains Mono' : 'Crimson Pro, serif', fontSize: 11 }}
                onFocus={e => (e.target.style.borderColor = `${BASE.khaki}66`)}
                onBlur={e => (e.target.style.borderColor = BASE.borderDim)}
                onKeyDown={e => e.key === 'Enter' && void applyLicense()}
              />
              {licenseKey.trim() && (
                <button onClick={() => void applyLicense()} disabled={licenseBusy}
                  style={{
                    marginTop: 8, padding: '8px 16px', borderRadius: 10,
                    cursor: licenseBusy ? 'wait' : 'pointer',
                    background: BASE.goldMid, border: `1px solid ${BASE.borderGold}`,
                    color: BASE.gold, fontFamily: 'Crimson Pro, serif', fontSize: 13,
                  }}>
                  {licenseBusy ? 'Checking…' : 'Activate'}
                </button>
              )}
              {licenseError && (
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 12, color: BASE.khaki, marginTop: 8, lineHeight: 1.5 }}>
                  {licenseError}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => void connect()} disabled={!canSave}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10, cursor: canSave ? 'pointer' : 'not-allowed',
              background: canSave ? BASE.goldMid : `${BASE.olive}22`,
              border: `1px solid ${canSave ? BASE.borderGold : BASE.borderDim}`,
              color: canSave ? BASE.gold : BASE.steel,
              fontFamily: 'Crimson Pro, serif', fontSize: 14,
              letterSpacing: '0.04em', transition: 'all 0.2s',
            }}>
            {testing ? 'Checking connection…' : 'Check & Connect →'}
          </button>
          {hasExistingKey && (
            <button onClick={onClose}
              style={{
                padding: '11px 20px', borderRadius: 10, cursor: 'pointer',
                background: 'none', border: `1px solid ${BASE.borderDim}`,
                color: BASE.steel, fontFamily: 'Crimson Pro, serif', fontSize: 14,
              }}>
              Cancel
            </button>
          )}
        </div>

        {/* Text size — accessibility, applies instantly and persists */}
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontFamily: 'Saira, sans-serif', fontSize: 12, letterSpacing: '0.14em',
            color: BASE.khaki, marginBottom: 8,
          }}>
            TEXT SIZE
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {ZOOMS.map(z => (
              <button key={z.f} onClick={() => applyZoom(z.f)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                  background: zoom === z.f ? `${BASE.gold}20` : 'transparent',
                  border: `1px solid ${zoom === z.f ? BASE.gold : BASE.borderDim}`,
                  color: zoom === z.f ? BASE.gold : BASE.steel,
                  fontFamily: 'Saira, sans-serif', fontSize: 11 + (z.f - 1) * 6,
                  letterSpacing: '0.08em', transition: 'all 0.15s',
                }}>
                {z.label}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7.5, color: BASE.steel, opacity: 0.7, marginTop: 5, letterSpacing: '0.06em' }}>
            Applies instantly · remembered next launch · ⌘+ / ⌘− also works anywhere
          </div>
        </div>

        {/* Demo mode — experience the desk without a key */}
        {!hasExistingKey && onDemo && (
          <button onClick={onDemo}
            style={{
              marginTop: 10, width: '100%', padding: '9px 0', borderRadius: 10,
              cursor: 'pointer', background: 'transparent',
              border: `1px dashed ${BASE.gold}45`, color: `${BASE.gold}cc`,
              fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
              letterSpacing: '0.12em', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BASE.gold}10` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
            ✦ EXPLORE DEMO — ROMANS 8 (NO KEY NEEDED)
          </button>
        )}
      </div>
    </div>
  )
}
