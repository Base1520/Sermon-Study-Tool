import { useState } from 'react'
import type { PhrasingAnalysis } from '../types/phrasing'

const CARD_BG  = '#2c3820'
const CANVAS_BG = '#243018'

const GOLD  = '#D8B33F'
const KHAKI = '#B8B49D'
const BONE  = '#E8E0CC'

interface Props {
  analysis: PhrasingAnalysis
  apiKey?: string
}

interface Slide {
  id: string
  type: 'title' | 'big-idea' | 'point' | 'sub' | 'scripture' | 'blank'
  heading: string
  body?: string
  tag?: string
}

function buildSlides(analysis: PhrasingAnalysis): Slide[] {
  const slides: Slide[] = []

  // 1. Title slide
  slides.push({
    id: 's-title',
    type: 'title',
    heading: analysis.reference ?? '',
    body: analysis.mainTheme ?? '',
    tag: analysis.canonicalContext?.bookTheme ?? '',
  })

  // 2. Big idea
  if (analysis.mainTheme) {
    slides.push({
      id: 's-bigidea',
      type: 'big-idea',
      heading: 'THE BIG IDEA',
      body: analysis.mainTheme,
    })
  }

  // 3. One slide per outline point + sub-points as bullets
  for (const pt of analysis.outline ?? []) {
    slides.push({
      id: `s-${pt.point}`,
      type: 'point',
      heading: pt.label,
      tag: pt.point,
      body: (pt.sub ?? []).map(s => `${s.point}  ${s.label}`).join('\n'),
    })
  }

  // 4. Blank closing slide
  slides.push({
    id: 's-blank',
    type: 'blank',
    heading: '',
  })

  return slides
}

function SlidePreview({ slide, active, onClick }: { slide: Slide; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        flexShrink: 0,
        width: 120, height: 68,
        background: active ? `${GOLD}18` : '#181a14',
        border: `1px solid ${active ? GOLD : KHAKI + '30'}`,
        borderRadius: 4,
        cursor: 'pointer',
        overflow: 'hidden',
        padding: '6px 8px',
        transition: 'all 0.15s',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}
    >
      {slide.tag && (
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 5, color: GOLD, opacity: 0.7, marginBottom: 3, letterSpacing: '0.1em' }}>
          {slide.tag}
        </div>
      )}
      <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: slide.type === 'title' ? 9 : 8, color: BONE, lineHeight: 1.3, overflow: 'hidden' }}>
        {slide.heading || <span style={{ opacity: 0.3, fontStyle: 'italic' }}>blank</span>}
      </div>
      {slide.body && (
        <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 6.5, color: KHAKI, lineHeight: 1.3, marginTop: 2, opacity: 0.8, overflow: 'hidden', maxHeight: 24 }}>
          {slide.body.slice(0, 60)}
        </div>
      )}
    </div>
  )
}

function SlideCanvas({ slide, index, total, onEdit }: {
  slide: Slide; index: number; total: number
  onEdit: (field: 'heading' | 'body', val: string) => void
}) {
  if (slide.type === 'title') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '40px 60px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: GOLD, letterSpacing: '0.2em', opacity: 0.8 }}>
          {slide.tag?.toUpperCase()}
        </div>
        <div
          contentEditable suppressContentEditableWarning
          onBlur={e => onEdit('heading', e.currentTarget.textContent ?? '')}
          style={{ fontFamily: 'Crimson Pro, serif', fontSize: 36, color: BONE, lineHeight: 1.2, outline: 'none', maxWidth: 700, textAlign: 'center' }}
        >
          {slide.heading}
        </div>
        <div style={{ width: 60, height: 1, background: `${GOLD}66` }} />
        <div
          contentEditable suppressContentEditableWarning
          onBlur={e => onEdit('body', e.currentTarget.textContent ?? '')}
          style={{ fontFamily: 'Crimson Pro, serif', fontSize: 18, color: KHAKI, lineHeight: 1.6, outline: 'none', maxWidth: 560, textAlign: 'center', fontStyle: 'italic' }}
        >
          {slide.body}
        </div>
        <div style={{ position: 'absolute', bottom: 20, right: 28, fontFamily: 'JetBrains Mono', fontSize: 7, color: KHAKI, opacity: 0.4, letterSpacing: '0.1em' }}>
          {index + 1} / {total}
        </div>
      </div>
    )
  }

  if (slide.type === 'big-idea') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 60px', gap: 20, textAlign: 'center' }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7.5, color: GOLD, letterSpacing: '0.22em' }}>THE BIG IDEA</div>
        <div style={{ width: 40, height: 2, background: GOLD, opacity: 0.5 }} />
        <div
          contentEditable suppressContentEditableWarning
          onBlur={e => onEdit('body', e.currentTarget.textContent ?? '')}
          style={{ fontFamily: 'Crimson Pro, serif', fontSize: 26, color: BONE, lineHeight: 1.45, outline: 'none', maxWidth: 680, textAlign: 'center' }}
        >
          {slide.body}
        </div>
        <div style={{ position: 'absolute', bottom: 20, right: 28, fontFamily: 'JetBrains Mono', fontSize: 7, color: KHAKI, opacity: 0.4, letterSpacing: '0.1em' }}>
          {index + 1} / {total}
        </div>
      </div>
    )
  }

  if (slide.type === 'blank') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: KHAKI, opacity: 0.25, letterSpacing: '0.12em' }}>BLANK SLIDE</div>
        <div style={{ position: 'absolute', bottom: 20, right: 28, fontFamily: 'JetBrains Mono', fontSize: 7, color: KHAKI, opacity: 0.4, letterSpacing: '0.1em' }}>
          {index + 1} / {total}
        </div>
      </div>
    )
  }

  // point / sub
  const subPoints = (slide.body ?? '').split('\n').filter(Boolean)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 72px', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        {slide.tag && (
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: GOLD, opacity: 0.7 }}>{slide.tag}</span>
        )}
        <div
          contentEditable suppressContentEditableWarning
          onBlur={e => onEdit('heading', e.currentTarget.textContent ?? '')}
          style={{ fontFamily: 'Crimson Pro, serif', fontSize: 30, color: BONE, lineHeight: 1.25, outline: 'none', flex: 1 }}
        >
          {slide.heading}
        </div>
      </div>
      {subPoints.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 24, borderLeft: `2px solid ${GOLD}33` }}>
          {subPoints.map((sp, i) => (
            <div key={i} style={{ fontFamily: 'Crimson Pro, serif', fontSize: 18, color: KHAKI, lineHeight: 1.5, opacity: 0.85 }}>
              {sp}
            </div>
          ))}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 20, right: 28, fontFamily: 'JetBrains Mono', fontSize: 7, color: KHAKI, opacity: 0.4, letterSpacing: '0.1em' }}>
        {index + 1} / {total}
      </div>
    </div>
  )
}

export function SlideDeck({ analysis, apiKey }: Props) {
  const [slides, setSlides]       = useState<Slide[]>(() => buildSlides(analysis))
  const [activeIdx, setActiveIdx] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError]     = useState<string | null>(null)
  const active = slides[activeIdx]

  async function handleGenerate() {
    if (!apiKey) { setGenError('Anthropic key required'); return }
    setGenerating(true); setGenError(null)
    try {
      const draft = await (window as any).electronAPI.sessionLoadLatest?.()
      const draftText = draft?.draft ?? ''
      const prompt = `You are building a sermon slide deck. Based on the sermon content below, generate a structured set of slides.

Passage: ${analysis.reference}
Big Idea: ${analysis.mainTheme}
Outline: ${analysis.outline.map(p => `${p.point} ${p.label}`).join(', ')}
${draftText ? `\nSermon Draft:\n${draftText.slice(0, 3000)}` : ''}

Return ONLY valid JSON (no markdown):
{
  "slides": [
    { "type": "title", "heading": "passage reference", "body": "big idea sentence", "tag": "book theme" },
    { "type": "big-idea", "heading": "THE BIG IDEA", "body": "central truth — one punchy sentence" },
    { "type": "point", "heading": "point label", "body": "sub A label\nsub B label", "tag": "I." },
    ...more point slides...
    { "type": "blank", "heading": "" }
  ]
}

Rules: start with title + big-idea slides, then one slide per outline point, end with blank. 6-10 slides total. Keep headings concise (under 8 words). Body text punchy, not academic.`

      const res = await (window as any).electronAPI.scholarChat({
        messages: [{ role: 'user', content: prompt }],
        apiKey, agentType: 'exegetical',
      })
      const raw = (res?.content ?? res ?? '').toString()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
      const newSlides: Slide[] = (parsed.slides ?? []).map((s: any, i: number) => ({
        id: `gen-${i}-${Date.now()}`,
        type: s.type ?? 'point',
        heading: s.heading ?? '',
        body: s.body ?? '',
        tag: s.tag ?? '',
      }))
      if (newSlides.length > 0) { setSlides(newSlides); setActiveIdx(0) }
    } catch (e: any) {
      setGenError(e?.message ?? 'Generation failed')
    } finally { setGenerating(false) }
  }

  function editSlide(idx: number, field: 'heading' | 'body', val: string) {
    setSlides(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s))
  }

  function addBlank() {
    const newSlide: Slide = { id: `s-blank-${Date.now()}`, type: 'blank', heading: '', body: '' }
    setSlides(prev => {
      const next = [...prev]
      next.splice(activeIdx + 1, 0, newSlide)
      return next
    })
    setActiveIdx(activeIdx + 1)
  }

  function removeSlide() {
    if (slides.length <= 1) return
    setSlides(prev => prev.filter((_, i) => i !== activeIdx))
    setActiveIdx(Math.max(0, activeIdx - 1))
  }

  function move(dir: -1 | 1) {
    const next = activeIdx + dir
    if (next < 0 || next >= slides.length) return
    setActiveIdx(next)
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      background: CARD_BG,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      {/* Toolbar */}
      <div style={{
        padding: '6px 12px',
        borderBottom: `1px solid ${GOLD}22`,
        display: 'flex', alignItems: 'center', gap: 6,
        flexShrink: 0, background: `${CARD_BG}`,
      }}>
        <button onClick={handleGenerate} disabled={generating || !apiKey}
          title={!apiKey ? 'Anthropic key required' : 'Generate slides from sermon draft'}
          style={{
            fontSize: 7, letterSpacing: '0.1em', padding: '3px 10px',
            background: generating ? `${GOLD}12` : `${GOLD}1a`,
            border: `1px solid ${GOLD}55`,
            color: !apiKey ? `${GOLD}44` : GOLD,
            cursor: apiKey && !generating ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
          {generating ? (
            <span style={{ display:'inline-block', width:7, height:7, border:`1.5px solid ${GOLD}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          ) : '✦'}
          {generating ? 'GENERATING…' : 'GENERATE SLIDES'}
        </button>
        {genError && <span style={{ fontSize: 7, color: '#c05050' }}>⚠ {genError}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={addBlank}
          style={{ fontSize: 7, color: KHAKI, background: 'transparent', border: `1px solid ${KHAKI}30`, padding: '2px 7px', cursor: 'pointer' }}>
          + SLIDE
        </button>
        <button onClick={removeSlide} disabled={slides.length <= 1}
          style={{ fontSize: 7, color: KHAKI, background: 'transparent', border: `1px solid ${KHAKI}30`, padding: '2px 7px', cursor: slides.length <= 1 ? 'default' : 'pointer', opacity: slides.length <= 1 ? 0.3 : 1 }}>
          − REMOVE
        </button>
        <div style={{ width: 1, height: 14, background: `${KHAKI}20`, margin: '0 2px' }} />
        <button
          onClick={() => (window as any).electronAPI.openExternal?.('https://www.canva.com/create/presentations/')}
          title="Open a new Canva presentation — paste your slide content there"
          style={{ fontSize: 7, color: KHAKI, background: 'transparent', border: `1px solid ${KHAKI}30`, padding: '2px 8px', cursor: 'pointer', letterSpacing: '0.08em' }}>
          ✦ OPEN IN CANVA
        </button>
      </div>

      {/* Main canvas */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, background: CANVAS_BG }}>
        {/* Slide area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0 }}>
          <SlideCanvas
            slide={active}
            index={activeIdx}
            total={slides.length}
            onEdit={(field, val) => editSlide(activeIdx, field, val)}
          />
        </div>

        {/* Nav arrows */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 48, display: 'flex', justifyContent: 'space-between', padding: '0 16px', pointerEvents: 'none' }}>
          <button onClick={() => move(-1)} disabled={activeIdx === 0}
            style={{ pointerEvents: 'all', fontSize: 16, color: activeIdx === 0 ? `${KHAKI}33` : KHAKI, background: 'transparent', border: 'none', cursor: activeIdx === 0 ? 'default' : 'pointer' }}>
            ←
          </button>
          <button onClick={() => move(1)} disabled={activeIdx === slides.length - 1}
            style={{ pointerEvents: 'all', fontSize: 16, color: activeIdx === slides.length - 1 ? `${KHAKI}33` : KHAKI, background: 'transparent', border: 'none', cursor: activeIdx === slides.length - 1 ? 'default' : 'pointer' }}>
            →
          </button>
        </div>
      </div>

      {/* Slide strip */}
      <div style={{
        borderTop: `1px solid ${GOLD}22`, padding: '8px 12px',
        display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0,
        background: CARD_BG,
      }}>
        {slides.map((s, i) => (
          <SlidePreview key={s.id} slide={s} active={i === activeIdx} onClick={() => setActiveIdx(i)} />
        ))}
      </div>
    </div>
  )
}
