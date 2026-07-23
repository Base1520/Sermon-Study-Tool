import { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'motion/react'
import { BASE } from '../theme'
import type { HistoryEntry } from '../types/phrasing'

export interface PaletteAction {
  id: string
  label: string
  hint?: string
  icon: string
  run: () => void
}

interface Props {
  actions: PaletteAction[]
  onClose: () => void
  onGoToReference: (ref: string) => void
  onLoadHistory: (entry: HistoryEntry) => void
}

// Looks like a scripture reference the user wants to jump to
const REF_RE = /^\d?\s*[a-z]+\s+\d/i

export function CommandPalette({ actions, onClose, onGoToReference, onLoadHistory }: Props) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [recent, setRecent] = useState<HistoryEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    ;(window as any).electronAPI.historyList?.()
      .then((h: HistoryEntry[]) => setRecent((h ?? []).slice(0, 5)))
      .catch(() => {})
  }, [])

  const q = query.trim().toLowerCase()
  const isRef = REF_RE.test(query.trim())

  const items = useMemo(() => {
    const list: PaletteAction[] = []
    if (isRef) {
      list.push({
        id: 'goto', icon: '→',
        label: `Go to "${query.trim()}"`,
        hint: 'load reference',
        run: () => onGoToReference(query.trim()),
      })
    }
    const filtered = q
      ? actions.filter(a => a.label.toLowerCase().includes(q))
      : actions
    list.push(...filtered)
    // Recent passages when not searching or when they match
    for (const entry of recent) {
      const ref = entry.analysis?.reference ?? ''
      if (!q || ref.toLowerCase().includes(q)) {
        list.push({
          id: `hist-${entry.id}`, icon: '↺',
          label: ref, hint: 'recent passage',
          run: () => onLoadHistory(entry),
        })
      }
    }
    return list.slice(0, 9)
  }, [q, isRef, actions, recent, query, onGoToReference])

  useEffect(() => { setCursor(0) }, [q])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && items[cursor]) {
      items[cursor].run()
      onClose()
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(6,8,5,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '18vh',
      }}>
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 520,
          background: 'linear-gradient(168deg, #2f3b22 0%, #262f1b 100%)',
          border: `1px solid ${BASE.khaki}40`,
          borderRadius: 14,
          boxShadow: `0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px ${BASE.khaki}15`,
          overflow: 'hidden',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${BASE.khaki}20` }}>
          <span style={{ color: BASE.gold, fontSize: 12 }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a reference (Rom 8) or a command…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#e8e2cc', fontSize: 13, fontFamily: 'Crimson Pro, serif',
            }}
          />
          <span style={{ fontSize: 7, color: `${BASE.khaki}50`, letterSpacing: '0.1em' }}>ESC</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '6px 0' }}>
          {items.length === 0 && (
            <div style={{ padding: '18px', fontSize: 9, color: `${BASE.khaki}60`, textAlign: 'center' }}>
              No matches
            </div>
          )}
          {items.map((item, i) => (
            <button key={item.id}
              onClick={() => { item.run(); onClose() }}
              onMouseEnter={() => setCursor(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '9px 18px', border: 'none', cursor: 'pointer',
                background: i === cursor ? `${BASE.gold}14` : 'transparent',
                borderLeft: i === cursor ? `2px solid ${BASE.gold}` : '2px solid transparent',
                textAlign: 'left', transition: 'background 0.08s',
              }}>
              <span style={{ color: i === cursor ? BASE.gold : `${BASE.khaki}80`, fontSize: 11, width: 16, textAlign: 'center' }}>
                {item.icon}
              </span>
              <span style={{ flex: 1, color: i === cursor ? '#f0ead2' : '#cfc9b0', fontSize: 12.5, fontFamily: 'Crimson Pro, serif' }}>
                {item.label}
              </span>
              {item.hint && (
                <span style={{ fontSize: 7, color: `${BASE.khaki}55`, letterSpacing: '0.08em' }}>
                  {item.hint.toUpperCase()}
                </span>
              )}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
