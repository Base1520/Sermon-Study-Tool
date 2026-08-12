import { useEffect, useMemo, useRef, useState } from 'react'
import { copyToClipboard, readFromClipboard } from './clipboard'

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'sermon'
}

function escapeRtf(value: string) {
  return Array.from(value).map((character) => {
    if (character === '\\') return '\\\\'
    if (character === '{' || character === '}') return `\\${character}`
    if (character === '\n') return '\\par\n'
    const codePoint = character.codePointAt(0) || 0
    if (codePoint >= 32 && codePoint <= 126) return character
    if (codePoint <= 0xffff) return `\\u${codePoint > 32767 ? codePoint - 65536 : codePoint}?`
    const adjusted = codePoint - 0x10000
    const high = 0xd800 + (adjusted >> 10)
    const low = 0xdc00 + (adjusted & 0x3ff)
    return `\\u${high - 65536}?\\u${low - 65536}?`
  }).join('')
}

function manuscriptDocument(reference: string, content: string) {
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Georgia;}{\\f1 Arial;}}\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440\\f1\\fs36\\b ${escapeRtf(reference)}\\b0\\par\\par\\f0\\fs28\\sl420\\slmult1 ${escapeRtf(content)}}`
}

export function TabletManuscriptEditor({
  reference,
  content,
  syncState,
  syncRevision,
  onChange,
  onSave,
  onClose,
}: {
  reference: string
  content: string
  syncState: 'saved' | 'saving' | 'local-only' | 'conflict' | 'error'
  syncRevision: number
  onChange: (value: string) => void
  onSave: () => Promise<void>
  onClose: () => void
}) {
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const [fontSize, setFontSize] = useState(21)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const words = useMemo(() => content.trim() ? content.trim().split(/\s+/).length : 0, [content])

  const selectedText = () => {
    const editor = editorRef.current
    if (!editor) return content
    return content.slice(editor.selectionStart, editor.selectionEnd) || content
  }

  const replaceSelection = (value: string) => {
    const editor = editorRef.current
    if (!editor) return
    const start = editor.selectionStart
    const end = editor.selectionEnd
    onChange(`${content.slice(0, start)}${value}${content.slice(end)}`)
    window.setTimeout(() => {
      editor.focus()
      editor.setSelectionRange(start + value.length, start + value.length)
    }, 0)
  }

  const copy = async () => {
    try {
      await copyToClipboard(selectedText())
      setNotice(hasSelection ? 'SELECTION COPIED' : 'MANUSCRIPT COPIED')
    } catch {
      setNotice('LONG-PRESS THE TEXT AND TAP COPY')
    }
  }

  const cut = async () => {
    const editor = editorRef.current
    if (!editor || editor.selectionStart === editor.selectionEnd) return setNotice('SELECT TEXT TO CUT')
    try {
      await copyToClipboard(selectedText())
      replaceSelection('')
      setNotice('CUT')
    } catch {
      setNotice('LONG-PRESS THE SELECTION AND TAP CUT')
    }
  }

  const paste = async () => {
    try {
      replaceSelection(await readFromClipboard())
      setNotice('PASTED')
    } catch {
      setNotice('HOLD IN THE PAGE AND TAP PASTE')
    }
  }

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      await onSave()
      setNotice('SAVED')
    } catch {
      setNotice('SAVE FAILED — YOUR LOCAL COPY IS STILL OPEN')
    } finally {
      setSaving(false)
    }
  }

  const exportDocument = async () => {
    const file = new File(
      [manuscriptDocument(reference, content)],
      `${safeFileName(reference)}-manuscript.rtf`,
      { type: 'application/rtf' },
    )
    const shareData = { title: `${reference} manuscript`, text: `${reference} manuscript`, files: [file] }
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData)
        setNotice('EXPORT READY')
        return
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
    const url = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    setNotice('EXPORTED')
  }

  const syncCopy = syncState === 'saved' ? `SYNCED TO YOUR DEVICES · R${syncRevision}`
    : syncState === 'saving' || saving ? 'SAVING…'
    : syncState === 'local-only' ? 'SAVED ON THIS TABLET · CLOUD SYNC PENDING'
    : syncState === 'conflict' ? 'THIS TABLET IS SAFE · REOPEN TO RESOLVE SYNC'
    : 'SAVE ERROR'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      void save()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <section className="tablet-manuscript-editor">
      <header>
        <button onClick={onClose}>← DESK</button>
        <div><span>MANUSCRIPT</span><strong>{reference}</strong><small>{syncCopy}</small></div>
        <button className="primary" onClick={save} disabled={saving}>{saving ? 'SAVING…' : 'SAVE'}</button>
      </header>
      <div className="tablet-manuscript-toolbar">
        <button onClick={() => { editorRef.current?.select(); editorRef.current?.focus() }}>SELECT ALL</button>
        <button onClick={() => { void copy() }}>{hasSelection ? 'COPY SELECTION' : 'COPY ALL'}</button>
        <button onClick={() => { void cut() }}>CUT</button>
        <button onClick={() => { void paste() }}>PASTE</button>
        <i />
        <button onClick={() => setFontSize((value) => Math.max(16, value - 1))}>A−</button>
        <span>{fontSize} PT</span>
        <button onClick={() => setFontSize((value) => Math.min(34, value + 1))}>A+</button>
        <i />
        <button onClick={() => { void exportDocument() }}>EXPORT RTF · PAGES / WORD</button>
      </div>
      <main>
        <textarea
          ref={editorRef}
          value={content}
          onChange={(event) => onChange(event.target.value.slice(0, 60_000))}
          onSelect={(event) => setHasSelection(event.currentTarget.selectionStart !== event.currentTarget.selectionEnd)}
          onPaste={() => setNotice('PASTED')}
          onCopy={() => setNotice('COPIED')}
          onCut={() => setNotice('CUT')}
          spellCheck
          autoCapitalize="sentences"
          autoCorrect="on"
          style={{ fontSize }}
          placeholder="Write the sermon here…"
        />
      </main>
      <footer>
        <span>{words.toLocaleString()} WORDS · {content.length.toLocaleString()} CHARACTERS</span>
        <strong>{notice || 'LONG-PRESS OR USE ⌘C / ⌘V · AUTO-SAVES LOCALLY'}</strong>
      </footer>
    </section>
  )
}
