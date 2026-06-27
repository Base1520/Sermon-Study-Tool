import { BASE } from '../theme'

interface Props {
  size?: number
  opacity?: number
}

export function BaseBMark({ size = 32, opacity = 1 }: Props) {
  // Traced from official BASE 1520 brand asset.
  // B letterform in Furore style:
  //   - Thick left bar (full height)
  //   - Upper bowl: top-right chamfer only, rectangular interior with rounded corners
  //   - Diagonal step at waist (lower bowl is wider)
  //   - Lower bowl: top-right + bottom-right chamfers, rounded interior
  //
  // Holes are filled with the octagon bg color (not evenodd) so they work
  // correctly over any background the B mark is placed on.
  const bg = BASE.olive

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      style={{ flexShrink: 0, opacity, display: 'block' }}
    >
      {/* Dark olive octagon */}
      <polygon
        points="8,0 28,0 36,8 36,28 28,36 8,36 0,28 0,8"
        fill={BASE.olive}
      />

      {/* B outer shape — gold
          Path (clockwise from top-left):
            left bar top → top of upper bowl → chamfer top-right →
            right side upper bowl → diagonal step to wider lower bowl →
            right side lower bowl → chamfer bottom-right → bottom → close
      */}
      <path
        d="M 6,6 L 25,6 L 29,10 L 29,18 L 31,20 L 31,26 L 26,31 L 6,31 Z"
        fill={BASE.gold}
      />

      {/* Upper bowl hole — olive fill with rounded corners (Furore style) */}
      <rect x="12" y="9"  width="12" height="7" rx="2.2" fill={bg} />

      {/* Lower bowl hole — slightly wider, same corner radius */}
      <rect x="12" y="22" width="14" height="7" rx="2.2" fill={bg} />
    </svg>
  )
}
