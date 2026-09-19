// Where a tile goes when it appears on a desk.
//
// Both desks used to answer that question without looking at the desk. The iPad
// desk dropped every added tile at the centre of the viewport, so three notes in
// a row landed on exactly the same spot; the Mac desk hardcoded eight different
// card types to one shared coordinate. Either way the second tile covered the
// first, which is not an arrangement — it is a pile.
//
// So placement is computed from what is already there. `packDeskTiles` lays a
// known set out in centred rows for the opening desk; `nextFreeDeskSlot` finds
// the next seat at the table for anything added or restored afterwards. Both are
// pure and deterministic: the same desk always arranges the same way, which is
// what makes "CLEAN UP" mean something.

export interface DeskSize { width: number; height: number }
export interface DeskPoint { x: number; y: number }
export interface DeskRect extends DeskPoint, DeskSize {}

/** Left/top inset of the whole arrangement. Matches the desks' existing origins. */
export const DESK_MARGIN = 80
/** Breathing room between tiles, and the step the slot finder searches on. */
export const DESK_GUTTER = 40
/** Working width a row fills before wrapping. Roughly three large tiles across. */
export const DESK_ROW_WIDTH = 2600

export interface DeskLayoutOptions {
  margin?: number
  gutter?: number
  rowWidth?: number
}

function settings(options: DeskLayoutOptions = {}) {
  return {
    margin: options.margin ?? DESK_MARGIN,
    gutter: options.gutter ?? DESK_GUTTER,
    rowWidth: options.rowWidth ?? DESK_ROW_WIDTH,
  }
}

/** Strict geometric overlap. Touching edges do not overlap. */
export function deskRectsOverlap(a: DeskRect, b: DeskRect): boolean {
  return a.x < b.x + b.width
    && b.x < a.x + a.width
    && a.y < b.y + b.height
    && b.y < a.y + a.height
}

/** Overlap with a required separation, so placed tiles keep their gutter. */
function clashes(a: DeskRect, b: DeskRect, gutter: number): boolean {
  return a.x < b.x + b.width + gutter
    && b.x < a.x + a.width + gutter
    && a.y < b.y + b.height + gutter
    && b.y < a.y + a.height + gutter
}

/**
 * Lay tiles out in order, wrapping into rows and centring each row on the same
 * axis. Order is preserved exactly — index N of the result positions index N of
 * the input — so a desk's reading order survives its arrangement.
 *
 * A tile wider than the row width gets a row to itself rather than being dropped.
 */
export function packDeskTiles(sizes: DeskSize[], options: DeskLayoutOptions = {}): DeskPoint[] {
  const { margin, gutter, rowWidth } = settings(options)
  const rows: { items: number[]; width: number; height: number }[] = []
  let row = { items: [] as number[], width: 0, height: 0 }

  sizes.forEach((size, index) => {
    const advance = row.items.length ? gutter + size.width : size.width
    if (row.items.length && row.width + advance > rowWidth) {
      rows.push(row)
      row = { items: [], width: 0, height: 0 }
    }
    row.width += row.items.length ? gutter + size.width : size.width
    row.height = Math.max(row.height, size.height)
    row.items.push(index)
  })
  if (row.items.length) rows.push(row)

  const positions: DeskPoint[] = new Array(sizes.length)
  let y = margin
  for (const current of rows) {
    // Rows share a centre line, so a short row sits balanced under a full one
    // instead of hanging off the left edge.
    let x = margin + Math.max(0, (rowWidth - current.width) / 2)
    for (const index of current.items) {
      positions[index] = {
        x: Math.round(x),
        y: Math.round(y + (current.height - sizes[index].height) / 2),
      }
      x += sizes[index].width + gutter
    }
    y += current.height + gutter
  }
  return positions
}

/**
 * The first place a tile of this size fits without touching anything already on
 * the desk. Candidates are the desk origin plus the corners each placed tile
 * opens up — to its right, and below it — scanned top-to-bottom then
 * left-to-right. That makes "add a tile" land in the next visible gap, reading
 * order intact.
 *
 * If nothing fits inside the row width, the tile goes on a fresh row beneath
 * everything rather than on top of something.
 */
export function nextFreeDeskSlot(
  occupied: DeskRect[],
  size: DeskSize,
  options: DeskLayoutOptions = {},
): DeskPoint {
  const { margin, gutter, rowWidth } = settings(options)
  const rightEdge = margin + rowWidth

  const candidates: DeskPoint[] = [{ x: margin, y: margin }]
  for (const rect of occupied) {
    candidates.push({ x: rect.x + rect.width + gutter, y: rect.y })
    candidates.push({ x: rect.x, y: rect.y + rect.height + gutter })
    candidates.push({ x: margin, y: rect.y + rect.height + gutter })
  }

  const seen = new Set<string>()
  const ordered = candidates
    .filter((point) => {
      if (point.x < margin || point.y < margin) return false
      const key = `${point.x}:${point.y}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))

  for (const point of ordered) {
    if (point.x + size.width > rightEdge) continue
    const probe = { x: point.x, y: point.y, width: size.width, height: size.height }
    if (!occupied.some((rect) => clashes(probe, rect, gutter))) return point
  }

  const bottom = occupied.reduce((lowest, rect) => Math.max(lowest, rect.y + rect.height), margin)
  return { x: margin, y: occupied.length ? bottom + gutter : margin }
}

/** Convenience: the rectangles a set of placed tiles occupies. */
export function deskRectsOf<T extends DeskRect>(tiles: T[]): DeskRect[] {
  return tiles.map((tile) => ({ x: tile.x, y: tile.y, width: tile.width, height: tile.height }))
}
