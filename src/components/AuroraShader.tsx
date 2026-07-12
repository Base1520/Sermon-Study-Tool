import { useEffect, useRef } from 'react'

// ── GPU ambient background ──────────────────────────────────────────────────────
// A single fullscreen fragment shader renders everything the old Canvas-2D
// starfield did — plus volumetric fbm nebula in BASE brand colors, three
// parallax star layers that respond to the cursor, periodic meteors, a slow
// gold scan sweep, cursor light, film grain and vignette. No three.js needed.

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;   // -1..1, +y up
uniform float u_warp;    // 0..1 analysis-complete surge

#define BG    vec3(0.063, 0.071, 0.059)
#define OLIVE vec3(0.157, 0.208, 0.122)
#define GREEN vec3(0.243, 0.322, 0.161)
#define MOSS  vec3(0.404, 0.439, 0.310)
#define GOLD  vec3(0.847, 0.702, 0.247)
#define BONE  vec3(0.961, 0.949, 0.910)

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 0.5));
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return v;
}

float starLayer(vec2 uv, float t, float seed) {
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);
  float n = hash21(id + seed);
  float on = step(0.95, n);
  vec2 offs = (hash22(id + seed) - 0.5) * 0.7;
  float d = length(gv - offs);
  float size = mix(0.02, 0.09, pow(fract(n * 13.7), 3.0));
  float tw = 0.55 + 0.45 * sin(t * (0.6 + fract(n * 7.3) * 2.4) + n * 44.0);
  return on * smoothstep(size, 0.0, d) * tw;
}

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float meteor(vec2 uv, float t) {
  float cycle = 11.0;
  float k  = floor(t / cycle);
  float ft = fract(t / cycle);
  float seed = hash21(vec2(k * 1.37, 7.13));
  float active = step(ft, 0.16);
  float prog = clamp(ft / 0.16, 0.0, 1.0);
  vec2 start = vec2(mix(0.25, 1.05, seed), mix(0.8, 1.05, fract(seed * 9.7)));
  vec2 dir = normalize(vec2(-0.72, -0.42));
  vec2 head = start + dir * prog * 0.85;
  vec2 tail = head - dir * 0.10;
  float d = segDist(uv, tail, head);
  float along = clamp(dot(uv - tail, dir) / 0.10, 0.0, 1.0);
  float body = smoothstep(0.0035, 0.0, d) * along;
  float glow = smoothstep(0.02, 0.0, d) * along * 0.35;
  float fade = sin(prog * 3.14159);
  return active * (body + glow) * fade;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / u_res;
  vec2 p  = (frag - 0.5 * u_res) / u_res.y;
  p *= 1.0 - 0.10 * u_warp;   // zoom surge during warp
  float t = u_time;
  vec2 m = u_mouse;

  // Nebula — domain-warped fbm in olive/green, gold veins in the ridges
  vec2 np = p * 1.4 + vec2(t * 0.008, -t * 0.004) + m * 0.03;
  float q = fbm(np * 2.0 + vec2(t * 0.015, 0.0));
  float n = fbm(np * 2.4 + q * 1.8 + vec2(0.0, t * 0.01));
  vec3 col = BG;
  col = mix(col, OLIVE, smoothstep(0.42, 0.95, n) * 0.55);
  col = mix(col, GREEN, smoothstep(0.62, 1.05, n) * 0.30);
  col += MOSS * smoothstep(0.72, 1.0, n * q) * 0.10;
  col += GOLD * pow(smoothstep(0.66, 1.0, q * n), 3.5) * 0.18;

  // Star layers — deeper layers move less with the cursor
  float s = 0.0;
  s += starLayer(p * 24.0 + m * 0.16 + 3.0,  t, 1.7) * 0.45;
  s += starLayer(p * 14.0 + m * 0.24 + 7.0,  t, 4.3) * 0.85;
  s += starLayer(p *  7.0 + m * 0.34 + 11.0, t, 9.1) * 1.1;
  col += BONE * s * 1.0;
  col += GOLD * s * 0.18;

  // Meteor streak every ~11s
  float mt = meteor(uv, t);
  col += mix(BONE, GOLD, 0.4) * mt * 0.9;

  // Warp surge — radial gold rays racing outward while u_warp is up
  if (u_warp > 0.001) {
    float rad = length(p);
    vec2 dirv = p / max(rad, 0.001);
    float rays = pow(noise(dirv * 6.0 + 3.7), 3.0);
    rays *= 0.6 + 0.4 * sin(rad * 20.0 - t * 14.0);
    rays *= smoothstep(0.12, 0.7, rad);
    col += mix(BONE, GOLD, 0.55) * rays * u_warp * 0.5;
    col *= 1.0 + u_warp * 0.14;
  }

  // Tactical grid
  vec2 gp = mod(frag, 48.0);
  float grid = step(gp.x, 1.0) + step(gp.y, 1.0);
  col += GREEN * grid * 0.055;

  // Gold scan sweep, top to bottom
  float scanY = 1.0 - fract(t / 9.0);
  float scan = exp(-pow((uv.y - scanY) * 26.0, 2.0));
  col += GOLD * scan * 0.030;

  // Cursor light
  vec2 mUv = m * 0.5 + 0.5;
  float cd = length((uv - mUv) * vec2(u_res.x / u_res.y, 1.0));
  col += GOLD * exp(-cd * 3.2) * 0.045;

  // Vignette + grain
  float vig = smoothstep(1.25, 0.35, length(p));
  col *= mix(0.82, 1.0, vig);
  col += (hash21(frag + fract(t) * 137.0) - 0.5) * 0.028;

  gl_FragColor = vec4(col, 1.0);
}
`

let webglChecked = false
let webglOk = false

export function webglAvailable(): boolean {
  if (webglChecked) return webglOk
  webglChecked = true
  try {
    const probe = document.createElement('canvas')
    webglOk = !!probe.getContext('webgl')
  } catch {
    webglOk = false
  }
  return webglOk
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`shader compile failed: ${info}`)
  }
  return sh
}

export function AuroraShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const gl = canvas.getContext('webgl', {
      antialias: false, depth: false, stencil: false, alpha: false,
      powerPreference: 'low-power',
    })
    if (!gl) return

    let program: WebGLProgram
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT)
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
      program = gl.createProgram()!
      gl.attachShader(program, vs)
      gl.attachShader(program, fs)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    } catch {
      return
    }
    gl.useProgram(program)

    // Fullscreen triangle
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes   = gl.getUniformLocation(program, 'u_res')
    const uTime  = gl.getUniformLocation(program, 'u_time')
    const uMouse = gl.getUniformLocation(program, 'u_mouse')
    const uWarp  = gl.getUniformLocation(program, 'u_warp')

    // Cap the render resolution — fbm at full retina is wasted heat
    const DPR = Math.min(window.devicePixelRatio || 1, 1.25)
    function resize() {
      const w = Math.max(1, Math.round(canvas.offsetWidth * DPR))
      const h = Math.max(1, Math.round(canvas.offsetHeight * DPR))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl!.viewport(0, 0, w, h)
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // Smoothed cursor — the shader lags gently behind the real pointer
    const target = { x: 0, y: 0 }
    const mouse  = { x: 0, y: 0 }
    function onMove(e: MouseEvent) {
      target.x = (e.clientX / window.innerWidth) * 2 - 1
      target.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('mousemove', onMove)

    // Warp surge — fired via `window.dispatchEvent(new Event('base-warp'))`
    // when an analysis completes. Sim-time accelerates during the surge so
    // the whole scene (nebula flow, twinkle, sweep) rushes for a beat.
    const WARP_MS = 1600
    let warpStart = -1
    function onWarp() { warpStart = performance.now() }
    window.addEventListener('base-warp', onWarp)

    let animId = 0
    let running = true
    let last = performance.now()
    let simT = 0
    function frame() {
      if (!running) return
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      let warp = 0
      if (warpStart >= 0) {
        const e = (now - warpStart) / WARP_MS
        if (e >= 1) warpStart = -1
        else warp = Math.sin(Math.PI * e)
      }
      simT += dt * (1 + warp * 5)
      mouse.x += (target.x - mouse.x) * 0.045
      mouse.y += (target.y - mouse.y) * 0.045
      gl!.uniform2f(uRes, canvas.width, canvas.height)
      gl!.uniform1f(uTime, simT)
      gl!.uniform2f(uMouse, mouse.x, mouse.y)
      gl!.uniform1f(uWarp, warp)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
      animId = requestAnimationFrame(frame)
    }
    frame()

    function onVisibility() {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(animId)
      } else if (!running) {
        running = true
        last = performance.now()
        frame()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      cancelAnimationFrame(animId)
      ro.disconnect()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('base-warp', onWarp)
      document.removeEventListener('visibilitychange', onVisibility)
      gl.deleteProgram(program)
      gl.deleteBuffer(buf)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}
