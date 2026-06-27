import { useEffect, useRef } from 'react'

interface Star {
  x: number; y: number; r: number
  twinkle: number; speed: number; color: string
}

interface Nebula {
  x: number; y: number; rx: number; ry: number
  color: string; opacity: number
}

export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let animId: number

    function resize() {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // BASE brand star colors — warm bone/gold/khaki tones instead of blue
    const STAR_COLORS = ['#F5F2E8', '#D8B33F', '#B8B49D', '#F0ECD8', '#C8C0A0']

    const stars: Star[] = Array.from({ length: 320 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() < 0.1 ? 1.8 : Math.random() < 0.3 ? 1.2 : 0.6,
      twinkle: Math.random() * Math.PI * 2,
      speed: 0.004 + Math.random() * 0.02,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    }))

    // BASE brand nebulae — olive/green atmospheric glow
    const nebulae: Nebula[] = [
      { x: 0.15, y: 0.3, rx: 180, ry: 120, color: '#28351F', opacity: 0.5 },
      { x: 0.75, y: 0.6, rx: 220, ry: 140, color: '#3E5229', opacity: 0.4 },
      { x: 0.5, y: 0.85, rx: 160, ry: 100, color: '#1d2417', opacity: 0.45 },
      { x: 0.85, y: 0.1, rx: 140, ry: 80, color: '#28351F', opacity: 0.35 },
    ]

    function draw() {
      const W = canvas.width
      const H = canvas.height

      // Night Black background
      ctx.fillStyle = '#10120F'
      ctx.fillRect(0, 0, W, H)

      // Nebula blobs
      for (const n of nebulae) {
        const grd = ctx.createRadialGradient(n.x * W, n.y * H, 0, n.x * W, n.y * H, Math.max(n.rx, n.ry))
        grd.addColorStop(0, n.color + 'cc')
        grd.addColorStop(1, 'transparent')
        ctx.save()
        ctx.scale(1, n.ry / n.rx)
        ctx.beginPath()
        ctx.arc(n.x * W, n.y * H * (n.rx / n.ry), n.rx, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.globalAlpha = n.opacity
        ctx.fill()
        ctx.restore()
        ctx.globalAlpha = 1
      }

      // Stars
      for (const s of stars) {
        s.twinkle += s.speed
        const alpha = 0.2 + 0.8 * Math.pow(Math.abs(Math.sin(s.twinkle)), 2)
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = s.color
        ctx.globalAlpha = alpha
        ctx.fill()
        // Larger stars get a cross-glow
        if (s.r > 1.4) {
          ctx.globalAlpha = alpha * 0.25
          ctx.strokeStyle = s.color
          ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(s.x - s.r * 3, s.y)
          ctx.lineTo(s.x + s.r * 3, s.y)
          ctx.moveTo(s.x, s.y - s.r * 3)
          ctx.lineTo(s.x, s.y + s.r * 3)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      // Tactical grid — tighter with diagonal accent lines
      ctx.lineWidth = 0.5
      const GRID = 48
      ctx.strokeStyle = 'rgba(62, 82, 41, 0.07)'
      for (let gx = 0; gx < W; gx += GRID) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke()
      }
      for (let gy = 0; gy < H; gy += GRID) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
      }
      // Diagonal accent lines at corners (HUD corner marks)
      ctx.strokeStyle = 'rgba(216, 179, 63, 0.06)'
      ctx.lineWidth = 1
      const diagLen = 80
      // top-left
      ctx.beginPath(); ctx.moveTo(0, diagLen); ctx.lineTo(diagLen, 0); ctx.stroke()
      // top-right
      ctx.beginPath(); ctx.moveTo(W, diagLen); ctx.lineTo(W - diagLen, 0); ctx.stroke()
      // bottom-left
      ctx.beginPath(); ctx.moveTo(0, H - diagLen); ctx.lineTo(diagLen, H); ctx.stroke()
      // bottom-right
      ctx.beginPath(); ctx.moveTo(W, H - diagLen); ctx.lineTo(W - diagLen, H); ctx.stroke()

      // Scan line sweep — slow horizontal gold pulse
      const now = Date.now()
      const scanCycle = 8000
      const scanY = ((now % scanCycle) / scanCycle) * (H + 60) - 30
      const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30)
      scanGrad.addColorStop(0, 'rgba(216,179,63,0)')
      scanGrad.addColorStop(0.4, 'rgba(216,179,63,0.018)')
      scanGrad.addColorStop(0.5, 'rgba(216,179,63,0.05)')
      scanGrad.addColorStop(0.6, 'rgba(216,179,63,0.018)')
      scanGrad.addColorStop(1, 'rgba(216,179,63,0)')
      ctx.fillStyle = scanGrad
      ctx.fillRect(0, scanY - 30, W, 60)

      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}
