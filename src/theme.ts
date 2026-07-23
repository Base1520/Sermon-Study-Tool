export const BASE = {
  // Backgrounds (60% neutrals)
  bg:      '#10120F',  // Night Black — app background
  bgMid:   '#161a10',  // between Night Black and Mission Olive
  bgCard:  '#1d2417',  // card/panel backgrounds

  // Greens (30% structure)
  olive:   '#28351F',  // Mission Olive — sidebar, headers
  green:   '#3E5229',  // Citadel Green — buttons, active states
  moss:    '#67704F',  // Ranger Moss — secondary panels

  // Accent (10%)
  gold:    '#E5BE49',  // Signal Gold — exact match to base1520.com accent
  goldMid: 'rgba(229,190,73,0.18)',
  goldDim: 'rgba(229,190,73,0.08)',

  // Text
  bone:    '#F5F2E8',  // Bone White — primary text
  boneMid: 'rgba(245,242,232,0.65)',
  boneDim: 'rgba(245,242,232,0.3)',

  // Support
  khaki:   '#B8B49D',  // Field Khaki — secondary text, backgrounds
  steel:   '#6E7568',  // Steel Gray — borders, captions, metadata

  // Alert (use sparingly)
  red:     '#A63A2B',  // Forge Red — errors, warnings only

  // Borders
  border:  'rgba(103,112,79,0.25)',    // Ranger Moss border
  borderDim: 'rgba(103,112,79,0.12)',  // subtle dividers
  borderGold: 'rgba(229,190,73,0.25)', // active/highlighted borders
} as const

// ── Field Command v2 — typography + motion doctrine ─────────────────────────
export const FONT = {
  display: "'Saira', sans-serif",            // brand display — matches site + book
  mono:    "'JetBrains Mono', monospace",    // micro-HUD labels (6-9px)
  type:    "'Courier Prime', monospace",     // readouts, quotes, typewriter moments
  serif:   "'Crimson Pro', serif",           // long-form content
} as const

export const MOTION = {
  snap:   'cubic-bezier(0.2, 0.9, 0.3, 1)',  // sharp entrances
  settle: 'cubic-bezier(0.16, 1, 0.3, 1)',   // eased landings
  fast: 0.12, base: 0.24, slow: 0.4,
} as const
