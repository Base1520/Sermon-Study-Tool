import { useState, useRef } from 'react'
import { NodeProps } from '@xyflow/react'
import { VerseHover } from './VerseHover'

const BASE_BG = '#10120F'
const CARD_BG = '#1d2417'
const DEEP_BG = '#0c0e0b'
const GOLD    = '#D8B33F'
const KHAKI   = '#B8B49D'
const STEEL   = '#7A8C6E'
const BONE    = '#F5F2E8'

// ── 3D Orthographic engine ────────────────────────────────────────────────────
// Module-level rotation — updated before each render (synchronous React renders)
const _rot = { az: -Math.PI / 4, el: 0.52 }

interface S { scale: number; ox: number; oy: number; cx: number; cy: number; cz: number }

function p(wx: number, wy: number, wz: number, s: S): [number, number] {
  const cosA = Math.cos(_rot.az), sinA = Math.sin(_rot.az)
  const cosE = Math.cos(_rot.el), sinE = Math.sin(_rot.el)
  const dx = wx - s.cx, dy = wy - s.cy, dz = wz - s.cz
  const rx = dx * cosA + dz * sinA
  const rz = -dx * sinA + dz * cosA
  return [
    s.ox + rx * s.scale,
    s.oy - (dy * cosE - rz * sinE) * s.scale
  ]
}

const toSVG = (pts: [number,number][]) =>
  pts.map(([x,y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

function shade(hex: string, f: number): string {
  if (!hex || hex.length < 7) return hex
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  const d = (v:number) => Math.max(0,Math.min(255,Math.round(v*f))).toString(16).padStart(2,'0')
  return `#${d(r)}${d(g)}${d(b)}`
}

// Top face: warm sunlight highlight
function shadeWarm(hex: string, f: number): string {
  if (!hex || hex.length < 7) return hex
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  const c = (v:number, add=0) => Math.max(0,Math.min(255,Math.round(v*f+add))).toString(16).padStart(2,'0')
  return `#${c(r,14)}${c(g,8)}${c(b,0)}`
}

// Right face: cool shadow (slight blue-ambient tint)
function shadeCool(hex: string, f: number): string {
  if (!hex || hex.length < 7) return hex
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  const c = (v:number, add=0) => Math.max(0,Math.min(255,Math.round(v*f+add))).toString(16).padStart(2,'0')
  return `#${c(r,-8)}${c(g,-3)}${c(b,7)}`
}

function isoCircle(cx: number, cz: number, y: number, r: number, s: S, n=16): [number,number][] {
  return Array.from({length:n}, (_,i) => {
    const a = (i/n)*Math.PI*2
    return p(cx + r*Math.cos(a), y, cz + r*Math.sin(a), s)
  })
}

// ── Primitives ────────────────────────────────────────────────────────────────
type Mat = 'gold'|'stone'|'cedar'|'bronze'|'linen'|undefined

interface BoxProps {
  x:number; z:number; y:number; w:number; d:number; h:number
  color:string; s:S; opacity?:number; selected?:boolean; stroke?:string
  onClick?:()=>void; clickable?:boolean; glow?:boolean; mat?:Mat
}
function Box({x,z,y,w,d,h,color,s,opacity=1,selected=false,onClick,clickable=false,stroke,glow=false,mat}:BoxProps) {
  const top   = [p(x,y+h,z,s), p(x+w,y+h,z,s), p(x+w,y+h,z+d,s), p(x,y+h,z+d,s)]
  const front = h>0?[p(x,y,z,s), p(x+w,y,z,s), p(x+w,y+h,z,s), p(x,y+h,z,s)]:null
  const right = h>0?[p(x+w,y,z,s), p(x+w,y,z+d,s), p(x+w,y+h,z+d,s), p(x+w,y+h,z,s)]:null
  const edge    = selected ? GOLD   : (stroke || 'rgba(4,6,3,0.45)')
  const edgeDim = selected ? GOLD   : (stroke || 'rgba(2,3,2,0.55)')
  const ew      = selected ? 1.8    : (stroke ? 0.7 : 0.5)
  const topFill = mat ? `url(#mat-${mat})` : shadeWarm(color, 1.05)
  return (
    <g onClick={onClick} className={clickable?'zone3d':undefined}
       style={{cursor:clickable?'pointer':'default'}} opacity={opacity}
       filter={glow ? 'url(#goldGlow)' : undefined}>
      {right && <polygon points={toSVG(right)} fill={shadeCool(color,0.34)} stroke={edgeDim} strokeWidth={ew} strokeLinejoin='round'/>}
      {front && <polygon points={toSVG(front)} fill={shade(color,0.60)}     stroke={edge}    strokeWidth={ew} strokeLinejoin='round'/>}
      <polygon points={toSVG(top)} fill={topFill} stroke={edge} strokeWidth={ew} strokeLinejoin='round'/>
    </g>
  )
}

// ── Altar fire + smoke — anchored in world space, animated in screen space ─────
function AltarFire({x, y, z, s, size=1}:{x:number; y:number; z:number; s:S; size?:number}) {
  const [bx, by] = p(x, y, z, s)
  const u = 6 * size * s.scale * 0.2  // base unit scaled to structure
  return (
    <g transform={`translate(${bx},${by})`} style={{pointerEvents:'none'}}>
      {/* Flames — three flickering tongues */}
      <path d={`M${-u*0.8} 0 Q${-u*0.9} ${-u*1.8} 0 ${-u*2.6} Q${u*0.9} ${-u*1.8} ${u*0.8} 0 Z`}
        fill='url(#flameGrad)' className='flameA'/>
      <path d={`M${-u*0.45} 0 Q${-u*0.5} ${-u*1.2} 0 ${-u*1.7} Q${u*0.5} ${-u*1.2} ${u*0.45} 0 Z`}
        fill='#f8d860' opacity={0.85} className='flameB'/>
      {/* Smoke column — staggered rising puffs */}
      {[0,1,2,3].map(i=>(
        <circle key={i} cx={0} cy={-u*2.5} r={u*(0.8+i*0.28)}
          fill='#8d887c' className={`smokePuff sp${i}`}/>
      ))}
    </g>
  )
}

// ── Glory pillar — the cloud/fire over the sanctuary (Exod 40:38) ─────────────
function GloryPillar({x, y, z, s, h=120}:{x:number; y:number; z:number; s:S; h?:number}) {
  const [bx, by] = p(x, y, z, s)
  return (
    <g transform={`translate(${bx},${by})`} style={{pointerEvents:'none'}} className='gloryPillar'>
      {/* Column of light */}
      <rect x={-9} y={-h} width={18} height={h} fill='url(#gloryGrad)' rx={9}/>
      {/* Cloud crown */}
      <ellipse cx={0}   cy={-h+6}  rx={22} ry={11} fill='#efe9d8' opacity={0.30}/>
      <ellipse cx={-12} cy={-h+12} rx={15} ry={8}  fill='#e8e0cc' opacity={0.26}/>
      <ellipse cx={12}  cy={-h+10} rx={16} ry={9}  fill='#f4eedd' opacity={0.24}/>
      {/* Inner fire core */}
      <rect x={-3.5} y={-h*0.85} width={7} height={h*0.85} fill='url(#gloryCore)' rx={3.5}/>
    </g>
  )
}

interface CylProps { cx:number; cz:number; y:number; r:number; h:number; color:string; s:S; opacity?:number }
function Cyl({cx,cz,y,r,h,color,s,opacity=1}:CylProps) {
  const top  = isoCircle(cx,cz,y+h,r,s)
  const bot  = isoCircle(cx,cz,y,r,s)
  const n    = top.length
  const half = Math.floor(n/2)
  const sideL = [...bot.slice(0,half+1),...top.slice(0,half+1).reverse()]
  const sideR = [...bot.slice(half),...top.slice(half).reverse()]
  const edge  = 'rgba(8,10,6,0.28)'
  return (
    <g opacity={opacity}>
      <polygon points={toSVG(sideR)} fill={shadeCool(color,0.34)} stroke={edge} strokeWidth={0.4}/>
      <polygon points={toSVG(sideL)} fill={shade(color,0.60)}     stroke={edge} strokeWidth={0.4}/>
      <polygon points={toSVG(top)}   fill={shadeWarm(color,1.05)} stroke={edge} strokeWidth={0.4}/>
    </g>
  )
}

interface RoofProps { x:number; z:number; y:number; w:number; d:number; ridgeH:number; color:string; s:S }
function Roof({x,z,y,w,d,ridgeH,color,s}:RoofProps) {
  const mz = z + d/2
  const rY = y + ridgeH
  const fr = [p(x,y,z,s),    p(x+w,y,z,s),    p(x+w,rY,mz,s), p(x,rY,mz,s)]
  const bk = [p(x,y,z+d,s),  p(x+w,y,z+d,s),  p(x+w,rY,mz,s), p(x,rY,mz,s)]
  const lf = [p(x,y,z,s),    p(x,rY,mz,s),     p(x,y,z+d,s)]
  const rt = [p(x+w,y,z,s),  p(x+w,rY,mz,s),   p(x+w,y,z+d,s)]
  const edge = 'rgba(4,6,3,0.45)'
  return (
    <g>
      <polygon points={toSVG(bk)} fill={shadeCool(color,0.38)} stroke={edge} strokeWidth={0.4}/>
      <polygon points={toSVG(fr)} fill={shade(color,0.62)}     stroke={edge} strokeWidth={0.4}/>
      <polygon points={toSVG(lf)} fill={shadeCool(color,0.38)} stroke={edge} strokeWidth={0.4}/>
      <polygon points={toSVG(rt)} fill={shade(color,0.72)}     stroke={edge} strokeWidth={0.4}/>
    </g>
  )
}

interface ColProps { cx:number; cz:number; y:number; h:number; r:number; color:string; s:S }
function Col({cx,cz,y,h,r,color,s}:ColProps) {
  return (
    <g>
      <Box x={cx-r*1.4} z={cz-r*1.4} y={y} w={r*2.8} d={r*2.8} h={r*0.6} color={shade(color,0.85)} s={s}/>
      <Cyl cx={cx} cz={cz} y={y+r*0.6} r={r} h={h} color={color} s={s}/>
      <Box x={cx-r*1.5} z={cz-r*1.5} y={y+r*0.6+h} w={r*3} d={r*3} h={r*0.7} color={shade(color,0.9)} s={s}/>
    </g>
  )
}

// ── Cherub ────────────────────────────────────────────────────────────────────
// Two swept wing panels + a small body cylinder. Wings spread in the ±z direction.
interface CherubProps { cx:number; cz:number; y:number; bodyH:number; wingR:number; s:S; color?:string }
function Cherub({cx,cz,y,bodyH,wingR,s,color=GOLD}:CherubProps) {
  const yMid = y + bodyH * 0.62
  const yTop = y + bodyH * 0.96
  const yTipHi = y + bodyH * 0.88     // wing tip — upper edge, angled slightly down
  const yTipLo = y + bodyH * 0.46     // wing tip — lower edge

  // South wing (toward low z)
  const sw = [p(cx, yMid, cz, s), p(cx, yTop, cz, s), p(cx, yTipHi, cz-wingR, s), p(cx, yTipLo, cz-wingR, s)]
  // North wing (toward high z)
  const nw = [p(cx, yMid, cz, s), p(cx, yTop, cz, s), p(cx, yTipHi, cz+wingR, s), p(cx, yTipLo, cz+wingR, s)]
  // Forward-facing secondary wing panel (angled in x)
  const fw = [p(cx, yMid, cz, s), p(cx, yTop, cz, s), p(cx+wingR*0.4, yTipHi, cz, s), p(cx+wingR*0.4, yTipLo, cz, s)]

  const ec = shade(color, 0.55)
  const bw = Math.max(wingR * 0.06, 0.3)
  return (
    <g filter='url(#goldGlow)'>
      {/* Back wings */}
      <polygon points={toSVG(sw)} fill={shade(color,0.70)} stroke={ec} strokeWidth={0.5} opacity={0.92}/>
      <polygon points={toSVG(nw)} fill={shade(color,0.82)} stroke={ec} strokeWidth={0.5} opacity={0.92}/>
      <polygon points={toSVG(fw)} fill={shade(color,0.90)} stroke={ec} strokeWidth={0.5} opacity={0.82}/>
      {/* Body */}
      <Cyl cx={cx} cz={cz} y={y} r={bw} h={bodyH * 0.9} color={color} s={s}/>
    </g>
  )
}

interface ColRowProps { x0:number; z0:number; y:number; count:number; spacing:number; dir:'x'|'z'; h:number; r:number; color:string; s:S }
function ColRow({x0,z0,y,count,spacing,dir,h,r,color,s}:ColRowProps) {
  return (
    <g>
      {Array.from({length:count},(_,i)=>(
        <Col key={i}
          cx={x0+(dir==='x'?i*spacing:0)}
          cz={z0+(dir==='z'?i*spacing:0)}
          y={y} h={h} r={r} color={color} s={s}/>
      ))}
    </g>
  )
}

interface LabelProps { x:number; z:number; y:number; text:string; s:S; color?:string; size?:number }
function Label({x,z,y,text,s,color=GOLD,size=5.5}:LabelProps) {
  const [sx,sy] = p(x,y,z,s)
  const w = text.length * size * 0.6 + 6
  return (
    <g>
      <rect x={sx-w/2} y={sy-size-6} width={w} height={size+4} fill='rgba(12,14,11,0.72)' rx={2}/>
      <text x={sx} y={sy-4} textAnchor='middle' fill={color} fontSize={size}
        fontFamily='JetBrains Mono' letterSpacing='0.07em' fontWeight='500'>{text}</text>
      <circle cx={sx} cy={sy} r={1.2} fill={color} opacity={0.6}/>
    </g>
  )
}

// ── Zone / Structure types ────────────────────────────────────────────────────
interface Zone { label:string; access:string; refs:string[]; desc:string }
interface Structure3D {
  label:string; date:string; ref:string; desc:string; s:S
  render:(sel:string|null, onZone:(id:string)=>void)=>React.ReactNode
  zones:Record<string,Zone>
}

// ── TABERNACLE ────────────────────────────────────────────────────────────────
// Court: 100×50 cubits. x=E-W (east=high x), z=N-S (north=high z), y=up
const TS: S = {scale:5.0, ox:310, oy:250, cx:50, cy:0, cz:25}

function TabernacleScene({sel,onZone}:{sel:string|null; onZone:(id:string)=>void}) {
  const s = TS
  const zp = (id:string) => ({clickable:true, selected:sel===id, onClick:()=>onZone(id)})
  const posts = (axis:'x'|'z', fixed:number, from:number, to:number) =>
    Array.from({length:Math.floor((to-from)/5)+1},(_,i)=>from+i*5).map(v=>(
      <Box key={`${axis}${fixed}${v}`}
        x={axis==='x'?fixed:v} z={axis==='z'?fixed:v} y={0}
        w={0.5} d={0.5} h={5.5} color='#8a7030' s={s}/>
    ))
  const curtains = (axis:'x'|'z', fixed:number, from:number, to:number) =>
    Array.from({length:Math.floor((to-from)/5)},(_,i)=>from+i*5).map(v=>(
      <Box key={`c${axis}${fixed}${v}`}
        x={axis==='x'?fixed:v+0.5} z={axis==='z'?fixed:v+0.5} y={0.6}
        w={axis==='x'?0.3:4.5} d={axis==='z'?4.5:0.3} h={4.5}
        color='#ece8d8' s={s} opacity={0.75} {...zp('outer-court')}/>
    ))
  return (
    <g>
      {/* Ground */}
      <Box x={0} z={0} y={0} w={100} d={50} h={0.3} color='#9a8450' s={s} mat='stone' {...zp('outer-court')}/>
      <Box x={1} z={1} y={0.3} w={98} d={48} h={0.15} color='#b09a60' s={s}/>
      {/* Far walls (north + west) */}
      {posts('z', 48.5, 0, 100)}
      {curtains('z', 48.5, 0, 100)}
      {posts('x', 0, 0, 45)}
      {curtains('x', 0, 0, 45)}
      {/* Tent boards (gold-overlaid acacia) */}
      <Box x={9} z={19} y={0.45} w={32} d={12} h={0.5} color='#8a6818' s={s} mat='cedar'/>
      <Box x={9} z={19} y={0.95} w={32} d={0.7} h={10} color='#c8a030' s={s} mat='gold' {...zp('holy-place')}/>
      <Box x={9} z={30.3} y={0.95} w={32} d={0.7} h={10} color='#b89028' s={s} mat='gold'/>
      <Box x={9} z={19} y={0.95} w={0.7} d={12} h={10} color='#c09828' s={s} mat='gold' {...zp('hoh')}/>
      {/* Veil */}
      <Box x={19.5} z={19} y={0.95} w={0.4} d={12} h={9.8} color='#7030a0' s={s} opacity={0.85} {...zp('hoh')}/>
      {/* Tent entrance screen */}
      <Box x={41} z={19} y={0.95} w={0.5} d={4}  h={9} color='#3050c0' s={s} opacity={0.6}/>
      <Box x={41} z={23} y={0.95} w={0.5} d={4}  h={9} color='#8030b0' s={s} opacity={0.6}/>
      <Box x={41} z={27} y={0.95} w={0.5} d={4}  h={9} color='#a03020' s={s} opacity={0.6}/>
      {/* Tent roof — 3 layered coverings */}
      <Roof x={8} z={18} y={10.95} w={34} d={14} ridgeH={2.5} color='#888878' s={s}/>
      <Roof x={9} z={19} y={10.95} w={32} d={12} ridgeH={2.5} color='#8a3020' s={s}/>
      <Roof x={9.5} z={19.5} y={11.45} w={31} d={11} ridgeH={2} color='#3a3028' s={s}/>
      {/* Interior furniture */}
      <Box x={37} z={20} y={0.95} w={0.6} d={0.6} h={6} color='#D8B33F' s={s} {...zp('menorah')}/>
      <Box x={36} z={20} y={5.5} w={2.5} d={0.3} h={0.3} color='#D8B33F' s={s}/>
      <Box x={36} z={20.3} y={4.5} w={2.5} d={0.3} h={0.3} color='#D8B33F' s={s}/>
      <Label x={37} z={20} y={14} text='MENORAH' s={s}/>
      <Box x={37} z={29} y={0.95} w={2.5} d={1.5} h={2.5} color='#c09030' s={s} {...zp('showbread')}/>
      <Box x={36.5} z={28.7} y={3.45} w={3} d={2} h={0.3} color='#e0b840' s={s}/>
      <Label x={38} z={29} y={13} text='SHOWBREAD' s={s}/>
      <Box x={21} z={23.5} y={0.95} w={1.5} d={3} h={5.5} color='#8a6010' s={s} {...zp('incense')}/>
      <Box x={20.5} z={23} y={6.45} w={2.5} d={4} h={0.4} color='#a07818' s={s}/>
      <Label x={22} z={25} y={14} text='INCENSE' s={s}/>
      <Box x={11} z={22.5} y={0.95} w={2.5} d={5} h={1.5} color='#D8B33F' s={s} glow {...zp('ark')}/>
      <Box x={11} z={22.5} y={2.45} w={2.5} d={5} h={0.3} color='#f0e050' s={s} glow/>
      <Box x={10.5} z={22} y={2.75} w={3.5} d={2} h={0.25} color='#f0d040' s={s} glow/>
      <Box x={10.5} z={25} y={2.75} w={3.5} d={2} h={0.25} color='#f0d040' s={s} glow/>
      <Label x={13} z={25} y={14} text='ARK' s={s}/>
      {/* Laver */}
      <Cyl cx={64} cz={24.5} y={0.45} r={1.0} h={2.5} color='#2a5a7a' s={s}/>
      <Cyl cx={64} cz={24.5} y={2.95} r={2.0} h={0.8} color='#3a7a9b' s={s} {...zp('laver')}/>
      <Cyl cx={64} cz={24.5} y={3.75} r={2.2} h={0.3} color='#5090b5' s={s}/>
      <Label x={64} z={24.5} y={7} text='LAVER' s={s}/>
      {/* Altar — 5×5×3 cubits with ramp approach from south (Exod 20:26 forbids steps) */}
      <Box x={78} z={21} y={0.45} w={5} d={8} h={0.6} color='#6a3f0c' s={s}/>
      <Box x={78} z={21} y={1.05} w={5} d={8} h={3} color='#7a4a10' s={s} {...zp('altar')}/>
      {[[78,21],[83,21],[78,29],[83,29]].map(([hx,hz])=>(
        <Box key={`${hx}${hz}`} x={hx-0.5} z={hz-0.5} y={4.05} w={1} d={1} h={0.9} color='#5a3208' s={s}/>
      ))}
      {/* Ramp — priest approach from south (low z side) */}
      <Box x={79} z={14} y={0.45} w={3} d={7} h={0.5} color='#8a5010' s={s}/>
      <Box x={79} z={16} y={0.95} w={3} d={5} h={0.5} color='#7a4810' s={s}/>
      <Box x={79} z={18} y={1.45} w={3} d={3} h={0.5} color='#6a3808' s={s}/>
      <Label x={81} z={25} y={7} text='ALTAR' s={s}/>
      {/* Perpetual fire on the altar (Lev 6:13) */}
      <AltarFire x={80.5} y={4.3} z={25} s={s} size={1}/>
      {/* Pillar of cloud/fire over the sanctuary (Exod 40:38) */}
      <GloryPillar x={14} y={14} z={25} s={s} h={130}/>
      {/* Zone labels */}
      <Label x={68} z={35} y={0.8} text='OUTER COURT' s={s} color={KHAKI}/>
      <Label x={28} z={25} y={0.8} text='HOLY PLACE' s={s} color={KHAKI}/>
      <Label x={14} z={25} y={0.8} text='HOH' s={s} color={GOLD}/>
      {/* East wall — front/near, render last */}
      {posts('x', 99, 0, 13)}
      {curtains('x', 99, 0, 13)}
      {posts('x', 99, 37, 50)}
      {curtains('x', 99, 37, 50)}
      {[15,22,29,36].map(zv=>(
        <Box key={zv} x={99} z={zv} y={0} w={0.5} d={0.5} h={7} color='#D8B33F' s={s}/>
      ))}
      <Box x={99} z={15.5} y={0.8} w={0.6} d={6.5} h={5.5} color='#3050a0' s={s} opacity={0.7} {...zp('outer-court')}/>
      <Box x={99} z={22.5} y={0.8} w={0.6} d={6.5} h={5.5} color='#8030b0' s={s} opacity={0.7}/>
      <Box x={99} z={29.5} y={0.8} w={0.6} d={6.5} h={5.5} color='#a03020' s={s} opacity={0.7}/>
      {/* Gate screen top bar */}
      <Box x={99} z={15} y={6.3} w={0.6} d={21.5} h={0.5} color='#D8B33F' s={s}/>
      <Label x={99} z={25} y={9} text='GATE' s={s} color={GOLD}/>
    </g>
  )
}

// ── SOLOMON'S TEMPLE ─────────────────────────────────────────────────────────
const SS: S = {scale:3.0, ox:310, oy:265, cx:70, cy:0, cz:60}

function SolomonScene({sel,onZone}:{sel:string|null; onZone:(id:string)=>void}) {
  const s = SS
  const zp = (id:string) => ({clickable:true, selected:sel===id, onClick:()=>onZone(id)})
  return (
    <g>
      <Box x={0} z={0} y={0} w={140} d={120} h={0.5} color='#706858' s={s} mat='stone' {...zp('outer-court')}/>
      <Box x={0} z={118} y={0} w={140} d={2} h={8} color='#c0b898' s={s} mat='stone' {...zp('outer-court')}/>
      <Box x={0} z={0} y={0} w={2} d={120} h={8} color='#c8c0a0' s={s} mat='stone'/>
      {/* Inner court terrace */}
      <Box x={18} z={12} y={0.5} w={102} d={96} h={2}   color='#a09878' s={s} {...zp('inner-court')}/>
      <Box x={20} z={14} y={2.5} w={98}  d={92} h={1.5} color='#b0a880' s={s}/>
      <Box x={22} z={16} y={4}   w={94}  d={88} h={1.5} color='#c0b890' s={s} {...zp('inner-court')}/>
      <Box x={22} z={103} y={5.5} w={94} d={1.5} h={9} color='#d4ccaa' s={s} {...zp('inner-court')}/>
      <Box x={22} z={16}  y={5.5} w={1.5} d={88} h={9} color='#dcd4b2' s={s}/>
      <ColRow x0={35} z0={100} y={5.5} count={6} spacing={10} dir='x' h={10} r={1.8} color='#d8d0b0' s={s}/>
      <ColRow x0={35} z0={18}  y={5.5} count={6} spacing={10} dir='x' h={10} r={1.8} color='#d8d0b0' s={s}/>
      {/* Bronze sea — 12 oxen, 3 per compass point (1 Kgs 7:25) */}
      {/* North group: facing +z */}
      {[99,103,107].map(ox=>(
        <g key={`on${ox}`}>
          <Box x={ox} z={68} y={5.5} w={2.5} d={4.5} h={2.8} color='#7a6020' s={s}/>
          <Box x={ox+0.5} z={72} y={7.4} w={1.5} d={2.5} h={2.2} color='#8a7030' s={s}/>
        </g>
      ))}
      {/* South group: facing -z */}
      {[99,103,107].map(ox=>(
        <g key={`os${ox}`}>
          <Box x={ox} z={57} y={5.5} w={2.5} d={4.5} h={2.8} color='#7a6020' s={s}/>
          <Box x={ox+0.5} z={54.5} y={7.4} w={1.5} d={2.5} h={2.2} color='#8a7030' s={s}/>
        </g>
      ))}
      {/* East group: facing +x */}
      {[61,65,69].map(oz=>(
        <g key={`oe${oz}`}>
          <Box x={109} z={oz} y={5.5} w={4.5} d={2.5} h={2.8} color='#7a6020' s={s}/>
          <Box x={113} z={oz+0.5} y={7.4} w={2.5} d={1.5} h={2.2} color='#8a7030' s={s}/>
        </g>
      ))}
      {/* West group: facing -x */}
      {[61,65,69].map(oz=>(
        <g key={`ow${oz}`}>
          <Box x={96} z={oz} y={5.5} w={4.5} d={2.5} h={2.8} color='#7a6020' s={s}/>
          <Box x={93.5} z={oz+0.5} y={7.4} w={2.5} d={1.5} h={2.2} color='#8a7030' s={s}/>
        </g>
      ))}
      <Cyl cx={104} cz={65} y={9.0} r={5.5} h={0.5} color='#4a7890' s={s}/>
      <Cyl cx={104} cz={65} y={9.5} r={5.0} h={2.5} color='#3a6a80' s={s} {...zp('sea')}/>
      <Cyl cx={104} cz={65} y={12}  r={5.5} h={0.5} color='#5a90a8' s={s}/>
      <Label x={104} z={65} y={16} text='BRONZE SEA' s={s}/>
      {/* 10 bronze lavers */}
      {[28,37,46,55,64].map((zv,i)=>(
        <g key={i}>
          <Box x={86} z={zv} y={5.5} w={3} d={3} h={2.5} color='#7a6020' s={s}/>
          <Cyl cx={87.5} cz={zv+1.5} y={8} r={2} h={1.5} color='#3a6888' s={s} {...zp('altar')}/>
        </g>
      ))}
      {/* Bronze altar (2 Chr 4:1 — 20×20×10 cubits) with ramp */}
      <Box x={62} z={43} y={5.5} w={4}  d={4}  h={1}   color='#5a3508' s={s} mat='bronze'/>
      <Box x={60} z={41} y={6.5} w={8}  d={8}  h={1.5} color='#6a4010' s={s} mat='bronze'/>
      <Box x={59} z={40} y={8.0} w={10} d={10} h={8}   color='#7a4a12' s={s} mat='bronze' {...zp('altar')}/>
      {/* Altar ramp — approach from south */}
      <Box x={60} z={33} y={5.5} w={8} d={7}  h={0.8} color='#6a4010' s={s}/>
      <Box x={60} z={35} y={6.3} w={8} d={5}  h={0.8} color='#7a4810' s={s}/>
      <Box x={60} z={37} y={7.1} w={8} d={3}  h={0.9} color='#8a5218' s={s}/>
      <Label x={64} z={45} y={20} text='BRONZE ALTAR' s={s}/>
      {/* Perpetual altar fire */}
      <AltarFire x={64} y={16} z={45} s={s} size={1.6}/>
      {/* Temple podium */}
      <Box x={18} z={38} y={5.5} w={4}  d={44} h={4} color='#a09070' s={s}/>
      <Box x={22} z={36} y={9.5} w={38} d={48} h={2} color='#c0b890' s={s}/>
      {/* Side chambers (yatsiah) — 3 stories, each story wider, wrapping S/N/W */}
      {/* South face */}
      <Box x={22} z={36} y={11.5} w={30} d={4}   h={5} color='#a09058' s={s}/>
      <Box x={22} z={35.5} y={16.5} w={30} d={4.5} h={5} color='#b0a068' s={s}/>
      <Box x={22} z={35} y={21.5} w={30} d={5}   h={5} color='#c0b078' s={s}/>
      {/* North face (symmetric) */}
      <Box x={22} z={80} y={11.5} w={30} d={4}   h={5} color='#a09058' s={s}/>
      <Box x={22} z={80} y={16.5} w={30} d={4.5} h={5} color='#b0a068' s={s}/>
      <Box x={22} z={80} y={21.5} w={30} d={5}   h={5} color='#c0b078' s={s}/>
      {/* West face (rear of temple) */}
      <Box x={18} z={40} y={11.5} w={4}   d={40} h={5} color='#a09058' s={s}/>
      <Box x={17.5} z={40} y={16.5} w={4.5} d={40} h={5} color='#b0a068' s={s}/>
      <Box x={17}   z={40} y={21.5} w={5}   d={40} h={5} color='#c0b078' s={s}/>
      {/* Hekal — Holy Place (cedar-paneled interior) */}
      <Box x={22} z={40} y={11.5} w={28} d={40} h={28} color='#c89048' s={s} mat='cedar' {...zp('holy-place')}/>
      <Box x={22} z={40} y={11.5} w={0.8} d={40} h={28} color='#b07830' s={s}/>
      {/* Debir — Holy of Holies (pure gold, glow) */}
      <Box x={22} z={48} y={11.5} w={18} d={24} h={28} color='#D8B33F' s={s} mat='gold' opacity={0.92} glow {...zp('hoh')}/>
      <Box x={39.5} z={48} y={11.5} w={0.6} d={24} h={28} color='#f0d040' s={s} glow/>
      {/* Ark */}
      <Box x={26} z={57} y={11.5} w={4} d={6} h={2.5} color='#f0d040' s={s} glow {...zp('ark')}/>
      <Box x={25.5} z={56.5} y={14} w={5} d={7} h={0.5} color='#f8e050' s={s} glow/>
      {/* Two massive 10-cubit olive-wood cherubim, gold-covered, wings spanning 20 cubits */}
      {/* South cherub: cz=55, wings span z=50–60 */}
      <Cherub cx={29} cz={55} y={11.5} bodyH={10} wingR={5} s={s} color='#E8C840'/>
      {/* North cherub: cz=65, wings span z=60–70 */}
      <Cherub cx={29} cz={65} y={11.5} bodyH={10} wingR={5} s={s} color='#D8B830'/>
      {/* Ulam (porch) — tall tower entrance (Chronicles: 120 cubits) */}
      <Box x={50} z={40} y={11.5} w={12} d={40} h={50} color='#d8d0b0' s={s} {...zp('porch')}/>
      <Box x={48} z={38} y={61.5} w={16} d={44} h={2}  color='#e0d8b8' s={s}/>
      {/* Jachin (south) + Boaz (north) at east face x=62 */}
      <Cyl cx={62} cz={44} y={11.5} r={1.5} h={20} color='#9a7020' s={s} {...zp('pillars')}/>
      <Box x={59.8} z={41.8} y={31.5} w={4.5} d={4.5} h={4} color='#b08030' s={s}/>
      <Label x={62} z={44} y={39} text='JACHIN' s={s} color='#d4a830'/>
      <Cyl cx={62} cz={76} y={11.5} r={1.5} h={20} color='#9a7020' s={s} {...zp('pillars')}/>
      <Box x={59.8} z={73.8} y={31.5} w={4.5} d={4.5} h={4} color='#b08030' s={s}/>
      <Label x={62} z={76} y={39} text='BOAZ' s={s} color='#d4a830'/>
      {/* Labels */}
      <Label x={29} z={60} y={26} text='ARK + CHERUBIM' s={s} color={GOLD}/>
      <Label x={35} z={60} y={44} text='HOLY OF HOLIES' s={s}/>
      <Label x={50} z={60} y={44} text='HOLY PLACE' s={s} color={KHAKI}/>
      <Label x={58} z={60} y={66} text='ULAM' s={s} color={KHAKI}/>
    </g>
  )
}

// ── HEROD'S TEMPLE ────────────────────────────────────────────────────────────
const HS: S = {scale:1.0, ox:310, oy:250, cx:220, cy:0, cz:140}

function HerodScene({sel,onZone}:{sel:string|null; onZone:(id:string)=>void}) {
  const s = HS
  const zp = (id:string) => ({clickable:true, selected:sel===id, onClick:()=>onZone(id)})
  return (
    <g>
      <Box x={0}   z={0}   y={0}  w={440} d={280} h={18}  color='#706848' s={s} mat='stone'/>
      <Box x={0}   z={0}   y={18} w={440} d={280} h={0.8} color='#a09870' s={s} mat='stone' {...zp('gentiles')}/>
      {[0,3,6,9,12,15].map(y2=>(
        <Box key={`s${y2}`} x={0}   z={0} y={y2} w={440} d={0.5} h={2.8} color={shade('#706848', 0.75+(y2/15)*0.2)} s={s}/>
      ))}
      {[0,3,6,9,12,15].map(y2=>(
        <Box key={`e${y2}`} x={439} z={0} y={y2} w={0.5} d={280} h={2.8} color={shade('#706848', 0.55+(y2/15)*0.15)} s={s}/>
      ))}
      {/* Royal Stoa */}
      <Box x={60} z={0} y={18.8} w={320} d={30} h={4} color='#c0b8a0' s={s}/>
      <ColRow x0={70} z0={3}  y={18.8} count={18} spacing={14} dir='x' h={16} r={2.2} color='#d0c8a8' s={s}/>
      <ColRow x0={70} z0={11} y={18.8} count={18} spacing={14} dir='x' h={16} r={2.2} color='#c8c0a0' s={s}/>
      <ColRow x0={70} z0={19} y={18.8} count={18} spacing={14} dir='x' h={16} r={2.2} color='#c8c0a0' s={s}/>
      <ColRow x0={70} z0={27} y={18.8} count={18} spacing={14} dir='x' h={16} r={2.2} color='#c0b898' s={s}/>
      <Box x={60} z={0} y={35} w={320} d={30} h={3} color='#b0a890' s={s}/>
      <Label x={220} z={15} y={42} text='ROYAL STOA' s={s} color={KHAKI}/>
      <ColRow x0={430} z0={40}  y={18.8} count={8}  spacing={18} dir='z' h={14} r={2} color='#c8c0a0' s={s}/>
      <ColRow x0={60}  z0={268} y={18.8} count={20} spacing={14} dir='x' h={14} r={2} color='#c8c0a0' s={s}/>
      {/* Soreg */}
      <Box x={80} z={40}  y={18.8} w={280} d={0.8} h={3.5} color='#786848' s={s} opacity={0.7} {...zp('soreg')}/>
      <Box x={80} z={40}  y={18.8} w={0.8} d={180} h={3.5} color='#786848' s={s} opacity={0.7}/>
      <Box x={80} z={220} y={18.8} w={280} d={0.8} h={3.5} color='#786848' s={s} opacity={0.7}/>
      <Box x={360} z={40} y={18.8} w={0.8} d={180} h={3.5} color='#786848' s={s} opacity={0.7}/>
      <Label x={220} z={42} y={24} text='SOREG BARRIER' s={s} color='#a09070'/>
      {/* Court of Women */}
      <Box x={170} z={60}  y={18.8} w={110} d={160} h={1}  color='#988860' s={s} {...zp('women')}/>
      <Box x={170} z={219} y={18.8} w={110} d={2}   h={9}  color='#c8c0a0' s={s}/>
      <Box x={280} z={60}  y={18.8} w={2}   d={160} h={9}  color='#d0c8a8' s={s}/>
      {[[170,60],[278,60],[170,218],[278,218]].map(([tx,tz])=>(
        <Box key={`${tx}${tz}`} x={tx} z={tz} y={18.8} w={10} d={10} h={14} color='#b8b098' s={s}/>
      ))}
      <Label x={225} z={140} y={22} text='COURT OF WOMEN' s={s} color={KHAKI}/>
      {/* Nicanor Gate (Beautiful Gate) — Corinthian bronze, Acts 3:2 */}
      <Box x={168} z={110} y={18.8} w={8} d={40} h={22} color='#907030' s={s} mat='bronze'/>
      {/* Flanking columns */}
      <Col cx={176} cz={112} y={18.8} h={24} r={2.2} color='#b09040' s={s}/>
      <Col cx={176} cz={148} y={18.8} h={24} r={2.2} color='#b09040' s={s}/>
      <Box x={173} z={108} y={42.8} w={4} d={44} h={3} color='#c0a040' s={s}/>
      <Label x={172} z={130} y={50} text='NICANOR GATE' s={s} color='#c09040'/>
      {/* Court of Israel */}
      <Box x={138} z={70} y={18.8} w={32} d={120} h={0.8} color='#887850' s={s} {...zp('israel')}/>
      {/* Court of Priests */}
      <Box x={100} z={55} y={18.8} w={70} d={150} h={0.8} color='#807040' s={s} {...zp('priests')}/>
      {/* Great altar */}
      <Box x={140} z={100} y={19.6} w={6}  d={6}  h={2} color='#5a3a08' s={s}/>
      <Box x={138} z={98}  y={21.6} w={10} d={10} h={3} color='#6a4a10' s={s}/>
      <Box x={135} z={95}  y={24.6} w={16} d={16} h={6} color='#7a5012' s={s} mat='bronze' {...zp('altar')}/>
      <Box x={143} z={80}  y={19}   w={5}  d={15} h={5} color='#6a4008' s={s}/>
      <Label x={143} z={103} y={35} text='GREAT ALTAR' s={s}/>
      {/* Perpetual altar fire */}
      <AltarFire x={143} y={30.6} z={103} s={s} size={5}/>
      {/* Temple building */}
      <Box x={88} z={90} y={18.8} w={50} d={80} h={5} color='#c0b890' s={s}/>
      <Box x={90} z={92} y={23.8} w={46} d={76} h={3} color='#ccc0a0' s={s}/>
      {/* Holy Place — white Herodian marble */}
      <Box x={95} z={98} y={26.8} w={30} d={64} h={45} color='#dcd8cc' s={s} mat='stone' {...zp('naos')}/>
      {/* Marble course lines on Holy Place */}
      {[8,16,24,32,40].map(dy=>(
        <Box key={`mc${dy}`} x={95} z={98} y={26.8+dy} w={30} d={64} h={0.5} color='#a8a49a' s={s}/>
      ))}
      {/* Holy of Holies (gold glow) */}
      <Box x={95} z={105} y={26.8} w={20} d={50} h={45} color='#D8B33F' s={s} mat='gold' opacity={0.92} glow {...zp('hoh')}/>
      <Box x={114} z={105} y={26.8} w={1}  d={50} h={45} color='#f0d030' s={s} glow/>
      {/* Veil */}
      <Box x={114} z={105} y={26.8} w={0.8} d={50} h={43} color='#7030a0' s={s} opacity={0.7} {...zp('veil')}/>
      {/* Porch (Ulam) — tower-like, taller than Holy Place behind it */}
      <Box x={125} z={95} y={26.8} w={12} d={70} h={55} color='#e8e4d8' s={s} mat='stone' {...zp('naos')}/>
      {/* Marble courses on porch */}
      {[10,20,30,40,50].map(dy=>(
        <Box key={`pc${dy}`} x={125} z={95} y={26.8+dy} w={12} d={70} h={0.5} color='#b4b0a6' s={s}/>
      ))}
      {/* Porch entrance columns — tall Corinthian, flanking the golden door */}
      <Col cx={137} cz={103} y={26.8} h={56} r={2.8} color='#eeeac0' s={s}/>
      <Col cx={137} cz={112} y={26.8} h={56} r={2.8} color='#eeeac0' s={s}/>
      <Col cx={137} cz={148} y={26.8} h={56} r={2.8} color='#e8e4b8' s={s}/>
      <Col cx={137} cz={157} y={26.8} h={56} r={2.8} color='#e8e4b8' s={s}/>
      {/* Entablature over columns */}
      <Box x={135} z={99} y={82.8} w={3} d={62} h={3.5} color='#e0dcc8' s={s}/>
      {/* Gold roof spikes grid — Josephus: "golden spikes to prevent birds settling" */}
      {[102,109,116,123,130,137,144,151,158].map(zv=>(
        [97,103,109,115,121].map(xv=>(
          <Box key={`sp${xv}${zv}`} x={xv} z={zv} y={71.8} w={0.9} d={0.9} h={7} color='#f0d020' s={s}/>
        ))
      ))}
      {/* Antonia Fortress */}
      <Box x={360} z={215} y={18.8} w={80} d={65} h={20} color='#706060' s={s}/>
      {[[360,215],[360,270],[430,215],[430,270]].map(([tx,tz])=>(
        <Box key={`a${tx}${tz}`} x={tx} z={tz} y={18.8} w={18} d={18} h={28} color='#605050' s={s}/>
      ))}
      <Label x={400} z={248} y={50} text='ANTONIA FORTRESS' s={s} color='#908080'/>
      <Label x={110} z={130} y={78} text='HOLY OF HOLIES' s={s} color={GOLD}/>
      <Label x={220} z={60} y={25} text='COURT OF GENTILES' s={s} color={`${KHAKI}90`}/>
    </g>
  )
}

// ── Structure registry ────────────────────────────────────────────────────────
type SK = 'tabernacle'|'solomon'|'herod'

const STRUCTURES: Record<SK, Structure3D> = {
  tabernacle: {
    label:'Tabernacle', date:'c. 1446 BC', ref:'Exod 25–40; Heb 9',
    desc: 'Portable wilderness sanctuary — 100×50 cubit court. Bronze altar, laver, and the Tent of Meeting (30×10×10 cubits) with four layered coverings over gold-overlaid acacia boards.',
    s: TS,
    render: (sel,onZone) => <TabernacleScene sel={sel} onZone={onZone}/>,
    zones: {
      'outer-court':{ label:'Outer Court', access:'All Israelite men', refs:['Exod 27:9-18','Exod 38:9-20'], desc:'100×50 cubits. 60 bronze pillars spaced 5 cubits apart with 5-cubit linen curtains between them. All Israelite men could enter. The boundary between the world and the presence of God.' },
      'altar':{ label:'Altar of Burnt Offering', access:'Priests (to minister)', refs:['Exod 27:1-8','Lev 6:13'], desc:'5×5×3 cubits. Acacia wood overlaid with bronze, four horns at corners. All sacrifices offered here. A continual fire burned on it (Lev 6:13). The place of atonement — blood applied to the four horns.' },
      'laver':{ label:'Bronze Laver', access:'Priests only', refs:['Exod 30:17-21','Exod 38:8'], desc:'Made from the bronze mirrors of the serving women. Priests washed here before approaching the altar or entering the tent. Failure to wash meant death (Exod 30:20-21). Cleansing precedes service.' },
      'holy-place':{ label:'Holy Place', access:'Priests only (daily ministry)', refs:['Exod 26','Heb 9:2-6'], desc:'20×10×10 cubits. Contains the golden lampstand (south), table of showbread (north), and altar of incense (west, before the veil). Priests ministered daily — trimming lamps, replacing showbread, burning incense.' },
      'hoh':{ label:'Holy of Holies', access:'High Priest only — once per year', refs:['Exod 26:31-34','Lev 16','Heb 10:19-22'], desc:'A perfect 10-cubit cube. Thick embroidered veil of blue, purple, and scarlet. High Priest entered once per year on Yom Kippur with blood and incense. The veil torn at the crucifixion opened permanent access through Christ (Heb 10:19-22).' },
      'ark':{ label:'Ark of the Covenant', access:'No one (except High Priest on Yom Kippur)', refs:['Exod 25:10-22','Heb 9:4-5','Rom 3:25'], desc:'2.5×1.5×1.5 cubits. Acacia overlaid with gold. Contained the tablets, Aaron\'s rod, and manna. Gold mercy seat with two cherubim. Christ is the hilasterion (mercy seat, Rom 3:25) and the Law-keeper it contained.' },
      'menorah':{ label:'Golden Lampstand', access:'Priests only', refs:['Exod 25:31-40','Lev 24:1-4'], desc:'Pure gold, hammered from a single piece. Seven branches with almond-flower cups. Burned continually. Christ the Light of the World (John 8:12). The seven churches of Revelation (1:12-20).' },
      'showbread':{ label:'Table of Showbread', access:'Priests only', refs:['Exod 25:23-30','Lev 24:5-9'], desc:'12 loaves (one per tribe) placed every Sabbath. Acacia wood overlaid with gold. Christ as the Bread of Life (John 6:35). Jesus cites this when defending his disciples (Matt 12:4).' },
      'incense':{ label:'Altar of Incense', access:'Priests only', refs:['Exod 30:1-10','Luke 1:9-11','Rev 8:3-4'], desc:'Acacia overlaid with gold, directly before the veil. Burned morning and evening. Zechariah burns incense here when Gabriel appears (Luke 1:9). Revelation: incense as the prayers of the saints (5:8; 8:3-4).' },
    }
  },
  solomon: {
    label:"Solomon's Temple", date:'c. 966–587 BC', ref:'1 Kgs 5–8; 2 Chr 2–7',
    desc:"First Temple on terraced sacred mount. Ulam (porch), Hekal (Holy Place, cedar-and-gold), Debir (Holy of Holies, pure gold cube). Bronze Sea on 12 oxen. Jachin and Boaz pillars. Destroyed 586 BC.",
    s: SS,
    render: (sel,onZone) => <SolomonScene sel={sel} onZone={onZone}/>,
    zones: {
      'outer-court':{ label:'Outer Court (Large Court)', access:'Israelites and later Gentiles', refs:['1 Kgs 6:36','2 Chr 4:9','John 2:14-16'], desc:'The large outer court surrounding the temple complex. Jesus taught and cleansed the temple here. Jeremiah preached in the courts (Jer 26:2). Later divided into Jewish and Gentile courts.' },
      'inner-court':{ label:"Inner Court (Priests' Court)", access:'Priests only', refs:['1 Kgs 6:36','2 Chr 4:9'], desc:'Three courses of dressed stone with a cedar-beam course (1 Kgs 6:36). Three-tiered stone terrace. Contains the bronze altar, bronze sea, and ten basins. Restricted to priests performing their service.' },
      'altar':{ label:'Bronze Altar', access:'Priests (to minister)', refs:['2 Chr 4:1','1 Kgs 8:22','2 Kgs 16:14-15'], desc:'20×20×10 cubits — massive expansion over the Tabernacle altar. At the dedication, Solomon offered 22,000 cattle and 120,000 sheep. Ahaz later displaced it to install an Assyrian altar (2 Kgs 16:14-15).' },
      'sea':{ label:'Bronze Sea (Molten Sea)', access:'Priests only', refs:['1 Kgs 7:23-26','2 Chr 4:2-5','Rev 4:6'], desc:'10 cubits in diameter, 5 cubits high, 30 cubits in circumference. 12 bronze oxen supporting it. Nebuchadnezzar broke it up (2 Kgs 25:13). Revelation 4:6 echoes this in the "sea of glass" before the heavenly throne.' },
      'porch':{ label:'Ulam (Vestibule/Porch)', access:'Priests entering', refs:['1 Kgs 6:3','2 Chr 3:4','1 Kgs 7:21'], desc:'20 cubits wide, 10 cubits deep. Chronicles records 120 cubits high — a monumental tower-like entrance. Flanked by the two free-standing bronze pillars Jachin and Boaz.' },
      'pillars':{ label:'Jachin & Boaz', access:'Decorative — entrance markers', refs:['1 Kgs 7:15-22','2 Chr 3:15-17','Jer 52:17-23'], desc:'18-cubit bronze shafts with 5-cubit lily-and-pomegranate capitals. Free-standing, not load-bearing. Jachin ("he establishes") south; Boaz ("in him is strength") north. Destroyed by Babylon (Jer 52:17-23).' },
      'holy-place':{ label:'Hekal (Holy Place)', access:'Priests only (daily ministry)', refs:['1 Kgs 6:14-22','1 Kgs 7:48-51','Heb 9:2-6'], desc:'40×20×30 cubits. Cedar-paneled entirely, no stone visible (1 Kgs 6:18). Carved with cherubim, palms, and flowers. 10 golden lampstands, 10 showbread tables, golden incense altar. Cedar interior overlaid with gold.' },
      'hoh':{ label:'Debir (Holy of Holies)', access:'High Priest only — once per year', refs:['1 Kgs 6:19-28','1 Kgs 8:10-11','2 Chr 5:7-10'], desc:'A perfect 20-cubit cube, covered entirely in gold. Two massive olive-wood cherubim 10 cubits tall. The Shekinah glory filled the temple at dedication so that priests could not stand to minister (1 Kgs 8:10-11).' },
      'ark':{ label:'Ark of the Covenant', access:'High Priest only on Yom Kippur', refs:['1 Kgs 8:1-9','2 Chr 5:2-10'], desc:'Placed beneath the cherubim wings, containing only the two stone tablets. The Ark was lost in the Babylonian destruction. Its absence from the Second Temple was the great open wound of post-exilic Judaism.' },
    }
  },
  herod: {
    label:"Herod's Temple", date:'20 BC – 70 AD', ref:'John 2:20; Mark 13:1-2; Josephus',
    desc:"Largest sacred precinct in the ancient world — ~485×300m. Ashlar retaining walls (some blocks over 100 tons). Royal Stoa: 4 rows of 162 Corinthian columns. Destroyed by Rome, 70 AD, exactly as Jesus foretold.",
    s: HS,
    render: (sel,onZone) => <HerodScene sel={sel} onZone={onZone}/>,
    zones: {
      'gentiles':{ label:'Court of the Gentiles', access:'Anyone (including Gentiles)', refs:['Mark 11:15-17','John 2:14-16','Acts 21:28','Eph 2:14'], desc:'The vast outer court. Money changers and dove sellers were here — hence Jesus\'s cleansing. Paul\'s "dividing wall of hostility" (Eph 2:14) refers to the Soreg separating this court from the Jewish courts.' },
      'soreg':{ label:'Soreg (Warning Barrier)', access:'Death penalty for Gentile violation', refs:['Acts 21:28','Eph 2:14','Josephus War 5.193-194'], desc:'Stone lattice barrier with Greek and Latin inscriptions: "No foreigner may enter within the barrier. Whoever is caught will be responsible for their own death." Almost certainly Paul\'s "dividing wall of hostility" (Eph 2:14).' },
      'women':{ label:'Court of the Women', access:'All Jews (men and women)', refs:['Luke 21:1-4','John 8:20','Mark 12:41-44'], desc:'13 trumpet-shaped offering boxes — where Jesus watched the widow\'s offering (Mark 12:41-44). The treasury was here (John 8:20). Anna the prophetess worshipped here (Luke 2:36-38).' },
      'israel':{ label:'Court of Israel', access:'Jewish men only (ritually pure)', refs:['Luke 1:8-10','Josephus Ant. 15.418-420'], desc:'A narrow court immediately before the Priests\' Court. Jewish laymen stood here to watch the offerings. Zechariah was ministering here when Gabriel appeared (Luke 1:8-10).' },
      'priests':{ label:"Court of the Priests", access:'Priests only (active service)', refs:['Luke 1:8-11','Matt 12:5'], desc:'Contains the great altar and laver. Priests performed all sacrificial rituals here. Death penalty for unauthorized entry by non-priests.' },
      'altar':{ label:'Altar of Burnt Offering', access:'Priests only', refs:['Matt 5:23-24','Matt 23:35','Mishnah Middot 3'], desc:'~32 cubits square at base. Continual fire. A ramp 32 cubits long. Jesus references this altar in Matt 5:23-24 and 23:35.' },
      'naos':{ label:'Temple Building (Naos)', access:'Priests only', refs:['John 2:19-21','Luke 1:9-11','Matt 27:51'], desc:'White marble and gold leaf — "a mountain of snow" (Josephus). When Jesus says "destroy this temple" (John 2:19), he uses naos — pointing to his body as the true locus of divine presence.' },
      'veil':{ label:'The Veil (Parokhet)', access:'Impenetrable except by High Priest', refs:['Matt 27:51','Mark 15:38','Heb 10:20'], desc:'Mishnah: a handbreadth thick (~4 inches), 820,000 threads, 55 cubits high. Torn from top to bottom at Jesus\'s death. Hebrews 10:20: "a new and living way through the curtain, that is, his body."' },
      'hoh':{ label:'Holy of Holies (Debir)', access:'High Priest only — once per year', refs:['Heb 9:3-8','Lev 16'], desc:'Empty in Herod\'s temple — the Ark had been lost since 586 BC. Only an elevated foundation stone remained. Josephus: completely empty. Jesus\'s resurrection is the NT answer: the Shekinah has come in flesh (John 1:14).' },
    }
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props { width:number; height:number }

export default function WorshipStructure({ width, height }: Props) {
  const [structure, setStructure] = useState<SK>('tabernacle')
  const [selZone,   setSelZone]   = useState<string|null>(null)
  const [az, setAz] = useState(-Math.PI / 4)
  const [el, setEl] = useState(0.52)
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const drag = useRef<{x:number; y:number; az:number; el:number}|null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync rotation into the module-level variable before render
  _rot.az = az
  _rot.el = el

  const HEADER_H  = 44
  const TAB_H     = 32
  const DETAIL_H  = selZone ? 195 : 0
  const DIAGRAM_H = height - HEADER_H - TAB_H - DETAIL_H - 2

  const cfg  = STRUCTURES[structure]
  const zone = selZone ? cfg.zones[selZone] : null

  function onZone(id: string) { setSelZone(selZone === id ? null : id) }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    drag.current = {x: e.clientX, y: e.clientY, az, el}
    setIsDragging(true)
    containerRef.current?.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    setAz(drag.current.az + dx * 0.008)
    setEl(Math.max(0.08, Math.min(1.45, drag.current.el - dy * 0.005)))
  }
  function onPointerUp(e: React.PointerEvent) {
    drag.current = null
    setIsDragging(false)
    containerRef.current?.releasePointerCapture(e.pointerId)
  }

  function resetView() { setAz(-Math.PI/4); setEl(0.52); setZoom(1) }
  function gateView()  { setAz(-Math.PI/2 + 0.12); setEl(0.16); setZoom(1.15) }
  function topView()   { setAz(-Math.PI/4); setEl(1.42); setZoom(1) }

  function onWheel(e: React.WheelEvent) {
    e.stopPropagation()
    setZoom(z => Math.max(0.55, Math.min(2.4, z * (e.deltaY > 0 ? 0.92 : 1.08))))
  }

  return (
    <div style={{
      width, height, background:BASE_BG,
      border:`2px solid ${KHAKI}55`, boxShadow:`0 0 0 1px ${KHAKI}18`,
      borderRadius:16, display:'flex', flexDirection:'column',
      overflow:'hidden', fontFamily:'JetBrains Mono', boxSizing:'border-box',
    }}>

      {/* Header */}
      <div style={{
        height:HEADER_H, padding:'0 16px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        cursor:'grab', borderBottom:`1px solid ${KHAKI}20`,
        background:`${KHAKI}08`, flexShrink:0,
      }}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:8,letterSpacing:'0.18em',color:`${KHAKI}90`}}>✦</span>
          <span style={{fontSize:8,letterSpacing:'0.14em',color:STEEL}}>OT WORSHIP STRUCTURES</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          {([['GATE',gateView],['TOP',topView],['RESET',resetView]] as [string,()=>void][]).map(([lbl,fn])=>(
            <button key={lbl} onClick={fn} style={{
              fontSize:6, color:`${KHAKI}70`, background:`${KHAKI}10`,
              border:`1px solid ${KHAKI}25`, borderRadius:3,
              padding:'2px 7px', cursor:'pointer', letterSpacing:'0.08em', fontFamily:'JetBrains Mono',
            }}>{lbl}</button>
          ))}
          <span style={{fontSize:7,color:`${KHAKI}50`,letterSpacing:'0.1em',marginLeft:4}}>{cfg.ref}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        height:TAB_H, display:'flex', alignItems:'stretch',
        borderBottom:`1px solid ${KHAKI}15`, background:DEEP_BG, flexShrink:0,
      }}>
        {(Object.entries(STRUCTURES) as [SK,Structure3D][]).map(([key,s])=>{
          const active = structure === key
          return (
            <button key={key}
              onClick={()=>{setStructure(key);setSelZone(null);resetView()}}
              style={{
                flex:1, background:active?`${GOLD}18`:'transparent',
                border:'none', borderBottom:active?`2px solid ${GOLD}`:'2px solid transparent',
                cursor:'pointer', fontFamily:'JetBrains Mono',
                color:active?GOLD:`${KHAKI}60`,
                fontSize:7, letterSpacing:'0.1em', transition:'all 0.15s',
              }}>
              <div>{s.label.toUpperCase()}</div>
              <div style={{fontSize:6,opacity:0.7,marginTop:1}}>{s.date}</div>
            </button>
          )
        })}
      </div>

      {/* Diagram — drag to rotate */}
      <div
        ref={containerRef}
        className="nowheel"
        style={{width,height:DIAGRAM_H,background:DEEP_BG,flexShrink:0,overflow:'hidden',
          cursor:isDragging?'grabbing':'grab', touchAction:'none'}}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <svg width={width} height={DIAGRAM_H} style={{display:'block',userSelect:'none'}}>
          <defs>
            {/* Spotlight background */}
            <radialGradient id="spotlight" cx="50%" cy="44%" r="58%" gradientUnits="userSpaceOnUse"
              fx={width*0.5} fy={DIAGRAM_H*0.44}
              x1="0" y1="0" x2={width} y2={DIAGRAM_H}>
              <stop offset="0%"   stopColor="#1c2518" stopOpacity="1"/>
              <stop offset="70%"  stopColor="#0d1009" stopOpacity="1"/>
              <stop offset="100%" stopColor="#050605" stopOpacity="1"/>
            </radialGradient>
            {/* Vignette overlay */}
            <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
              <stop offset="0%"   stopColor="#000000" stopOpacity="0"/>
              <stop offset="100%" stopColor="#000000" stopOpacity="0.55"/>
            </radialGradient>
            {/* Gold luminosity filter */}
            <filter id="goldGlow" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="5" result="blur"/>
              <feFlood floodColor="#D8B33F" floodOpacity="0.45" result="color"/>
              <feComposite in="color" in2="blur" operator="in" result="glow"/>
              <feMerge>
                <feMergeNode in="glow"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            {/* Soft shadow under structures */}
            <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000000" floodOpacity="0.4"/>
            </filter>
            {/* Material gradients — objectBoundingBox so they follow each face */}
            <linearGradient id="mat-gold" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="objectBoundingBox">
              <stop offset="0%"   stopColor="#f8e870"/>
              <stop offset="45%"  stopColor="#E8C840"/>
              <stop offset="100%" stopColor="#b07a10"/>
            </linearGradient>
            <linearGradient id="mat-stone" x1="0%" y1="0%" x2="80%" y2="100%" gradientUnits="objectBoundingBox">
              <stop offset="0%"   stopColor="#e8e0c8"/>
              <stop offset="100%" stopColor="#c8c0a8"/>
            </linearGradient>
            <linearGradient id="mat-cedar" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="objectBoundingBox">
              <stop offset="0%"   stopColor="#e0a050"/>
              <stop offset="100%" stopColor="#a06028"/>
            </linearGradient>
            <linearGradient id="mat-bronze" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="objectBoundingBox">
              <stop offset="0%"   stopColor="#c09040"/>
              <stop offset="100%" stopColor="#705010"/>
            </linearGradient>
            <linearGradient id="mat-linen" x1="0%" y1="0%" x2="60%" y2="100%" gradientUnits="objectBoundingBox">
              <stop offset="0%"   stopColor="#f8f4e8"/>
              <stop offset="100%" stopColor="#e0d8c8"/>
            </linearGradient>
            {/* Altar flame */}
            <linearGradient id="flameGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%"   stopColor="#c05010"/>
              <stop offset="55%"  stopColor="#e89020"/>
              <stop offset="100%" stopColor="#f8d860" stopOpacity="0.6"/>
            </linearGradient>
            {/* Glory pillar — cloud by day, fire within */}
            <linearGradient id="gloryGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="#f6efdc" stopOpacity="0.34"/>
              <stop offset="60%"  stopColor="#e9ddb8" stopOpacity="0.20"/>
              <stop offset="100%" stopColor="#D8B33F" stopOpacity="0.05"/>
            </linearGradient>
            <linearGradient id="gloryCore" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="#f8e070" stopOpacity="0.55"/>
              <stop offset="100%" stopColor="#e8a020" stopOpacity="0.10"/>
            </linearGradient>
          </defs>
          <style>{`
            .zone3d:hover polygon { filter: brightness(1.3) saturate(1.1); }
            .flameA { animation: flick 0.9s ease-in-out infinite alternate; transform-origin: 0 0; }
            .flameB { animation: flick 0.7s ease-in-out infinite alternate-reverse; transform-origin: 0 0; }
            @keyframes flick {
              from { transform: scaleY(1)    scaleX(1);    opacity: 0.95; }
              to   { transform: scaleY(1.25) scaleX(0.88); opacity: 0.75; }
            }
            .smokePuff { animation: puffRise 3.2s ease-out infinite; opacity: 0; }
            .sp0 { animation-delay: 0s; }   .sp1 { animation-delay: 0.8s; }
            .sp2 { animation-delay: 1.6s; } .sp3 { animation-delay: 2.4s; }
            @keyframes puffRise {
              0%   { transform: translateY(0)     scale(0.5); opacity: 0.32; }
              80%  { opacity: 0.10; }
              100% { transform: translateY(-46px) scale(1.6); opacity: 0; }
            }
            .gloryPillar { animation: gloryPulse 5s ease-in-out infinite; }
            @keyframes gloryPulse {
              0%, 100% { opacity: 0.85; }
              50%      { opacity: 1.0; }
            }
          `}</style>
          {/* Background with spotlight */}
          <rect width={width} height={DIAGRAM_H} fill="url(#spotlight)"/>
          {/* Subtle horizontal rule at equator */}
          <line x1={0} y1={DIAGRAM_H*0.5} x2={width} y2={DIAGRAM_H*0.5}
            stroke={`${GOLD}06`} strokeWidth={80}/>
          {/* Scene with drop shadow — zoom scales around viewport center.
              The structures were tuned around a 620×500 canvas (ox 310, oy 250);
              the inner translate re-centers that tuned origin for the actual tile size. */}
          <g transform={`translate(${width/2},${DIAGRAM_H/2}) scale(${zoom}) translate(${-width/2},${-DIAGRAM_H/2})`}>
            <g transform={`translate(${width/2 - 310},${DIAGRAM_H/2 - 250})`}>
              <g filter="url(#softShadow)">
                {cfg.render(selZone, onZone)}
              </g>
            </g>
          </g>
          {/* Vignette overlay (non-interactive) */}
          <rect width={width} height={DIAGRAM_H} fill="url(#vignette)" style={{pointerEvents:'none'}}/>
          {/* Controls hint */}
          {!isDragging && (
            <text x={width/2} y={DIAGRAM_H-10} textAnchor='middle'
              fill={`${KHAKI}28`} fontSize={6} fontFamily='JetBrains Mono' letterSpacing='0.12em'>
              DRAG TO ROTATE  ·  SCROLL TO ZOOM  ·  CLICK TO EXPLORE
            </text>
          )}
          {/* Compass rose */}
          <g opacity={0.5}>
            <text x={width-18} y={24} fill={KHAKI} fontSize={9} fontFamily='JetBrains Mono' textAnchor='middle'>↑</text>
            <text x={width-18} y={33} fill={KHAKI} fontSize={6}  fontFamily='JetBrains Mono' textAnchor='middle'>N</text>
          </g>
          {/* Structure title watermark */}
          <text x={16} y={DIAGRAM_H-10} fill={`${GOLD}18`} fontSize={28}
            fontFamily="'Crimson Pro',serif" letterSpacing='0.06em' fontStyle='italic'>
            {cfg.label}
          </text>
        </svg>
      </div>

      {/* Detail panel */}
      {zone && (
        <div style={{
          height:DETAIL_H, flexShrink:0,
          borderTop:`1px solid ${GOLD}30`, background:CARD_BG,
          overflowY:'auto', padding:'10px 16px',
          backgroundImage:`linear-gradient(to bottom, ${GOLD}08, transparent 60px)`,
        }}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:7}}>
            <div>
              <div style={{
                fontSize:14, fontFamily:"'Crimson Pro',serif", color:BONE, fontWeight:600,
                borderLeft:`2px solid ${GOLD}`, paddingLeft:8,
              }}>{zone.label}</div>
              <div style={{fontSize:7,color:`${GOLD}80`,marginTop:3,letterSpacing:'0.08em',paddingLeft:10}}>
                ACCESS — {zone.access.toUpperCase()}
              </div>
            </div>
            <button onClick={()=>setSelZone(null)} style={{fontSize:8,color:`${KHAKI}50`,background:`${KHAKI}10`,border:`1px solid ${KHAKI}20`,borderRadius:3,cursor:'pointer',padding:'2px 6px',fontFamily:'JetBrains Mono'}}>✕</button>
          </div>
          <p style={{fontSize:10.5,fontFamily:"'Crimson Pro',serif",color:KHAKI,lineHeight:1.65,margin:'0 0 8px'}}>{zone.desc}</p>
          {zone.refs.length>0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
              {zone.refs.map(ref=>(
                <VerseHover key={ref} reference={ref}>
                  <span style={{fontSize:7,color:`${KHAKI}75`,background:`${KHAKI}0d`,border:`1px solid ${KHAKI}25`,borderRadius:3,padding:'1px 5px',letterSpacing:'0.04em',cursor:'help'}}>{ref}</span>
                </VerseHover>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Description strip */}
      {!zone && (
        <div style={{
          padding:'8px 16px', flexShrink:0,
          borderTop:`1px solid ${GOLD}18`,
          background:`linear-gradient(to right, ${KHAKI}05, transparent)`,
          display:'flex', alignItems:'center', gap:10, minHeight:44,
        }}>
          <span style={{color:`${GOLD}60`, fontSize:10, flexShrink:0}}>✦</span>
          <span style={{fontSize:9.5,fontFamily:"'Crimson Pro',serif",color:`${KHAKI}65`,lineHeight:1.55}}>
            {cfg.desc.slice(0,220)}{cfg.desc.length>220?'…':''}
          </span>
        </div>
      )}
    </div>
  )
}

export function WorshipStructureNode({ data }: NodeProps) {
  const d = data as {width?:number;height?:number}
  return <WorshipStructure width={d.width??620} height={d.height??600}/>
}
