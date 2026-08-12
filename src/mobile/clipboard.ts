function legacyCopy(value: string) {
  const field = document.createElement('textarea')
  field.value = value
  field.readOnly = true
  field.setAttribute('aria-hidden', 'true')
  field.style.position = 'fixed'
  field.style.inset = '0 auto auto -9999px'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.focus()
  field.select()
  field.setSelectionRange(0, field.value.length)
  const copied = document.execCommand('copy')
  field.remove()
  if (!copied) throw new Error('Clipboard copy is unavailable.')
}

export async function copyToClipboard(value: string) {
  if (!value) return
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Async clipboard unavailable.')
    await navigator.clipboard.writeText(value)
  } catch {
    legacyCopy(value)
  }
}

export async function readFromClipboard() {
  if (!navigator.clipboard?.readText) throw new Error('Clipboard paste is unavailable.')
  return navigator.clipboard.readText()
}
