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
  gold:    '#D8B33F',  // Signal Gold — CTAs, highlights, active tabs
  goldMid: 'rgba(216,179,63,0.18)',
  goldDim: 'rgba(216,179,63,0.08)',

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
  borderGold: 'rgba(216,179,63,0.25)', // active/highlighted borders
} as const
