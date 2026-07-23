import React from 'react'

interface State {
  error: Error | null
  copied: boolean
}

// Catches any render crash so beta testers get a recoverable screen
// (and an error they can paste into feedback) instead of a white void.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const details = `${this.state.error.message}\n\n${this.state.error.stack ?? ''}`

    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: '#1a2410', color: '#d8d0b8',
        fontFamily: 'JetBrains Mono, monospace', padding: 40,
      }}>
        <div style={{ fontSize: 28 }}>⚠</div>
        <div style={{ fontSize: 14, color: '#D8B33F', letterSpacing: '0.08em' }}>
          Something broke
        </div>
        <div style={{ fontSize: 10, opacity: 0.7, maxWidth: 480, textAlign: 'center', lineHeight: 1.7 }}>
          The app hit an unexpected error. Copy the details below, then reload —
          your last analysis is saved and will come back. Please paste the error
          into Beta Feedback (✉) so it gets fixed.
        </div>
        <pre style={{
          maxWidth: 560, maxHeight: 160, overflow: 'auto',
          background: '#2c3820', border: '1px solid #B8B49D30',
          borderRadius: 8, padding: '10px 14px', fontSize: 8.5,
          color: '#c07070', whiteSpace: 'pre-wrap',
        }}>
          {details}
        </pre>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => {
              navigator.clipboard.writeText(details)
              this.setState({ copied: true })
            }}
            style={{
              padding: '8px 18px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: '1px solid #B8B49D50',
              color: '#B8B49D', fontSize: 9, letterSpacing: '0.08em',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
            {this.state.copied ? '✓ COPIED' : 'COPY ERROR'}
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 18px', borderRadius: 6, cursor: 'pointer',
              background: '#D8B33F', border: 'none', color: '#1a2410',
              fontSize: 9, letterSpacing: '0.08em', fontWeight: 700,
              fontFamily: 'JetBrains Mono, monospace',
            }}>
            RELOAD APP
          </button>
        </div>
      </div>
    )
  }
}
