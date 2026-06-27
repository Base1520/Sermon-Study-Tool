import type { ClauseType } from '../types/phrasing'

// All colors drawn from BASE 1520 palette — gold/olive/bone family
export const CLAUSE_COLORS: Record<ClauseType, string> = {
  main:        '#F5F2E8',   // bone white — dominant main clause
  purpose:     '#D8B33F',   // signal gold — the telic goal
  result:      '#A0AF84',   // light olive — outcome/effect
  condition:   '#B8B49D',   // field khaki — conditional/uncertain
  concession:  '#8C896E',   // mid-steel — concessive ("although")
  temporal:    '#67704F',   // ranger moss — time markers
  causal:      '#C49A2E',   // warm amber — cause ("because")
  relative:    '#E8CC7A',   // pale gold — descriptive relative
  infinitival: '#6B8C4A',   // sage green — infinitival purpose
  participial: '#7A9060',   // olive sage — participial clauses
  contrast:    '#A63A2B',   // forge red — contrast/opposition
}

export const CLAUSE_LABELS: Record<ClauseType, string> = {
  main:        'Main Clause',
  purpose:     'Purpose',
  result:      'Result',
  condition:   'Condition',
  concession:  'Concession',
  temporal:    'Temporal',
  causal:      'Causal',
  relative:    'Relative',
  infinitival: 'Infinitival',
  participial: 'Participial',
  contrast:    'Contrast',
}
