import { Starfield } from './Starfield'

export function LoadingState() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, zIndex: 10, background: 'rgba(3,3,15,0.85)', backdropFilter: 'blur(4px)' }}>
      <Starfield />

      {/* Phrasing skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: 0.4, position: 'relative', zIndex: 1 }}>
        <SkeletonNode width={280} color="#ffd200" />
        <div style={{ marginLeft: 52, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkeletonNode width={240} color="#00d4ff" />
          <div style={{ marginLeft: 52 }}>
            <SkeletonNode width={200} color="#00f2c3" />
          </div>
          <SkeletonNode width={220} color="#ff6b6b" />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
        {/* Animated ring */}
        <div style={{ width: 40, height: 40, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(0,212,255,0.2)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', inset: 0, border: '1.5px solid transparent', borderTopColor: '#00d4ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: '#00d4ff' }}>◈</span>
        </div>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0,212,255,0.5)', letterSpacing: '0.2em' }}>
          PARSING GRAMMATICAL STRUCTURE
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              width: 3, height: 3, borderRadius: '50%', background: '#00d4ff',
              animation: `pulse-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-dot { 0%,100% { opacity: 0.15; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  )
}

function SkeletonNode({ width, color }: { width: number; color: string }) {
  return (
    <div style={{
      width, height: 60, borderRadius: 3, border: `1px solid ${color}30`,
      background: color + '08', borderLeft: `3px solid ${color}50`,
      animation: 'hud-pulse 1.8s ease-in-out infinite',
    }}>
      <style>{`@keyframes hud-pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 0.7; } }`}</style>
    </div>
  )
}
