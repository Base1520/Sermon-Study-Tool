import { useEffect, useMemo, useRef, useState } from 'react'
import { TabletRecorder, type SermonRecorderController } from './TabletRecorder'

function manuscriptSections(manuscript: string) {
  return manuscript
    .split('\n')
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((item) => item.line && item.line.length < 90 && /^(BIG IDEA|TEXT-DRIVEN MOVEMENT|APPLICATION LANDING|MANUSCRIPT|[IVX]+\.|INTRO|CONCLUSION)/i.test(item.line))
    .slice(0, 12)
}

export function TabletPreachMode({
  reference,
  manuscript,
  recorder,
  onClose,
}: {
  reference: string
  manuscript: string
  recorder: SermonRecorderController
  onClose: () => void
}) {
  const [fontSize, setFontSize] = useState(38)
  const [speed, setSpeed] = useState(20)
  const [scrolling, setScrolling] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(true)
  const [wakeState, setWakeState] = useState<'active' | 'unavailable' | 'failed'>('unavailable')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const sections = useMemo(() => manuscriptSections(manuscript), [manuscript])

  useEffect(() => {
    let cancelled = false
    const requestWakeLock = async () => {
      const api = navigator.wakeLock
      if (!api || document.visibilityState !== 'visible') {
        setWakeState('unavailable')
        return
      }
      const lock = await api.request('screen').catch(() => null)
      setWakeState(lock ? 'active' : 'failed')
      if (cancelled) await lock?.release().catch(() => {})
      else {
        wakeLockRef.current = lock
        lock?.addEventListener('release', () => setWakeState('unavailable'), { once: true })
      }
    }
    void requestWakeLock()
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && wakeLockRef.current && !wakeLockRef.current.released) return
      void requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!scrolling) return
    let frame = 0
    let previous = performance.now()
    const move = (now: number) => {
      const host = scrollRef.current
      if (!host) return
      const elapsed = Math.min(now - previous, 80)
      previous = now
      host.scrollTop += speed * elapsed / 1_000
      if (host.scrollTop + host.clientHeight >= host.scrollHeight - 4) {
        setScrolling(false)
        return
      }
      frame = requestAnimationFrame(move)
    }
    frame = requestAnimationFrame(move)
    return () => cancelAnimationFrame(frame)
  }, [scrolling, speed])

  const jumpToLine = (lineIndex: number) => {
    const line = scrollRef.current?.querySelector<HTMLElement>(`[data-line="${lineIndex}"]`)
    line?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const lines = manuscript.split('\n')

  return (
    <div className={`tablet-preach-mode ${controlsOpen ? 'controls-open' : ''}`}>
      <header className="tablet-preach-header">
        <button onClick={onClose}>← DESK</button>
        <div><span>PREACH MODE</span><strong>{reference}</strong></div>
        <button onClick={() => setControlsOpen((open) => !open)}>{controlsOpen ? 'HIDE' : 'TOOLS'}</button>
      </header>

      {controlsOpen && (
        <aside className="tablet-preach-controls">
          <TabletRecorder controller={recorder} compact />
          <div className="tablet-preach-control-row">
            <button onClick={() => setFontSize((size) => Math.max(26, size - 2))}>A−</button>
            <strong>{fontSize}px</strong>
            <button onClick={() => setFontSize((size) => Math.min(62, size + 2))}>A+</button>
          </div>
          <label className="tablet-preach-speed">
            <span>AUTO-SCROLL</span>
            <input type="range" min="7" max="48" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
            <b>{speed}</b>
          </label>
          <button className={`tablet-preach-scroll ${scrolling ? 'active' : ''}`} onClick={() => setScrolling((running) => !running)}>
            {scrolling ? 'Ⅱ PAUSE SCROLL' : '▶ START SCROLL'}
          </button>
          {sections.length > 0 && <div className="tablet-preach-sections">
            <span>JUMP TO</span>
            {sections.map((section) => <button key={`${section.index}-${section.line}`} onClick={() => jumpToLine(section.index)}>{section.line}</button>)}
          </div>}
        </aside>
      )}

      <main className="tablet-preach-manuscript" ref={scrollRef} onClick={() => setScrolling(false)}>
        <article style={{ fontSize }}>
          {lines.map((line, index) => <p key={index} data-line={index} className={!line.trim() ? 'blank' : undefined}>{line || '\u00a0'}</p>)}
        </article>
      </main>
      <footer className="tablet-preach-footer">
        <span>LAYOUT LOCKED</span>
        <span>{wakeState === 'active' ? 'SCREEN AWAKE' : 'KEEP SCREEN AWAKE MANUALLY'}</span>
        <span>{recorder.status === 'recording' ? '● RECORDING' : 'READY'}</span>
      </footer>
    </div>
  )
}
