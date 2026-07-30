import { useEffect, useRef, useMemo, useState } from 'react'
import L from 'leaflet'
import { CITY_DATA } from '../data/cityData'
import { useAssetImages, findImage } from '../hooks/useAssetImages'

// ── City database ──────────────────────────────────────────────────────────────
export const TOPO_CITIES: {
  name: string; lon: number; lat: number
  region: 'canaan' | 'egypt' | 'mesopotamia' | 'anatolia' | 'persia' | 'roman'
  tier: 1 | 2 | 3
  aliases?: string[]
}[] = [
  // ── Canaan / Israel / Judea ────────────────────────────────────────────────
  { name: 'Jerusalem',         lon: 35.22, lat: 31.78, region: 'canaan',      tier: 1, aliases: ['zion','city of david','salem','mount zion'] },
  { name: 'Jericho',           lon: 35.45, lat: 31.86, region: 'canaan',      tier: 1 },
  { name: 'Bethlehem',         lon: 35.20, lat: 31.70, region: 'canaan',      tier: 2 },
  { name: 'Hebron',            lon: 35.10, lat: 31.53, region: 'canaan',      tier: 2 },
  { name: 'Beersheba',         lon: 34.80, lat: 31.25, region: 'canaan',      tier: 2 },
  { name: 'Gaza',              lon: 34.47, lat: 31.51, region: 'canaan',      tier: 2 },
  { name: 'Joppa',             lon: 34.75, lat: 32.05, region: 'canaan',      tier: 2, aliases: ['jaffa'] },
  { name: 'Caesarea',          lon: 34.89, lat: 32.50, region: 'canaan',      tier: 2, aliases: ['caesarea maritima'] },
  { name: 'Caesarea Philippi', lon: 35.69, lat: 33.25, region: 'canaan',      tier: 2 },
  { name: 'Samaria',           lon: 35.20, lat: 32.27, region: 'canaan',      tier: 2 },
  { name: 'Shechem',           lon: 35.28, lat: 32.21, region: 'canaan',      tier: 3, aliases: ['sychar'] },
  { name: 'Nazareth',          lon: 35.30, lat: 32.70, region: 'canaan',      tier: 1 },
  { name: 'Capernaum',         lon: 35.57, lat: 32.88, region: 'canaan',      tier: 2 },
  { name: 'Bethsaida',         lon: 35.63, lat: 32.90, region: 'canaan',      tier: 3 },
  { name: 'Chorazin',          lon: 35.56, lat: 32.91, region: 'canaan',      tier: 3 },
  { name: 'Cana',              lon: 35.33, lat: 32.75, region: 'canaan',      tier: 3 },
  { name: 'Nain',              lon: 35.35, lat: 32.62, region: 'canaan',      tier: 3 },
  { name: 'Megiddo',           lon: 35.18, lat: 32.58, region: 'canaan',      tier: 2, aliases: ['armageddon','har-megiddo'] },
  { name: 'Bethel',            lon: 35.22, lat: 31.93, region: 'canaan',      tier: 3 },
  { name: 'Shiloh',            lon: 35.29, lat: 32.06, region: 'canaan',      tier: 3 },
  { name: 'Gilgal',            lon: 35.47, lat: 31.88, region: 'canaan',      tier: 3 },
  { name: 'Dan',               lon: 35.65, lat: 33.25, region: 'canaan',      tier: 2 },
  { name: 'Ai',                lon: 35.28, lat: 31.92, region: 'canaan',      tier: 3 },
  { name: 'Mizpah',            lon: 35.21, lat: 31.85, region: 'canaan',      tier: 3 },
  { name: 'Emmaus',            lon: 34.99, lat: 31.84, region: 'canaan',      tier: 3 },
  { name: 'Bethany',           lon: 35.26, lat: 31.77, region: 'canaan',      tier: 2, aliases: ['bethany beyond jordan'] },
  { name: 'Bethphage',         lon: 35.25, lat: 31.78, region: 'canaan',      tier: 3 },
  { name: 'Gethsemane',        lon: 35.24, lat: 31.78, region: 'canaan',      tier: 2 },
  { name: 'Golgotha',          lon: 35.23, lat: 31.78, region: 'canaan',      tier: 2, aliases: ['calvary'] },
  { name: 'Tyre',              lon: 35.19, lat: 33.27, region: 'canaan',      tier: 1 },
  { name: 'Sidon',             lon: 35.37, lat: 33.56, region: 'canaan',      tier: 2 },
  { name: 'Damascus',          lon: 36.30, lat: 33.51, region: 'canaan',      tier: 1 },
  { name: 'Dothan',            lon: 35.23, lat: 32.42, region: 'canaan',      tier: 3 },
  { name: 'Ramah',             lon: 35.18, lat: 31.93, region: 'canaan',      tier: 3 },
  { name: 'Gibeah',            lon: 35.22, lat: 31.84, region: 'canaan',      tier: 3 },
  { name: 'Lachish',           lon: 34.85, lat: 31.56, region: 'canaan',      tier: 3 },
  { name: 'Azotus',            lon: 34.65, lat: 31.82, region: 'canaan',      tier: 3, aliases: ['ashdod'] },
  // ── Anatolia / Asia Minor ─────────────────────────────────────────────────
  { name: 'Antioch',           lon: 36.16, lat: 36.20, region: 'anatolia',    tier: 1, aliases: ['antioch of syria','syrian antioch'] },
  { name: 'Antioch of Pisidia',lon: 30.52, lat: 38.31, region: 'anatolia',    tier: 2 },
  { name: 'Ephesus',           lon: 27.34, lat: 37.94, region: 'anatolia',    tier: 1 },
  { name: 'Smyrna',            lon: 27.14, lat: 38.42, region: 'anatolia',    tier: 2, aliases: ['izmir'] },
  { name: 'Pergamum',          lon: 27.18, lat: 39.12, region: 'anatolia',    tier: 2, aliases: ['pergamos','bergama'] },
  { name: 'Thyatira',          lon: 27.84, lat: 38.92, region: 'anatolia',    tier: 2, aliases: ['akhisar'] },
  { name: 'Sardis',            lon: 28.04, lat: 38.49, region: 'anatolia',    tier: 2, aliases: ['sart'] },
  { name: 'Philadelphia',      lon: 28.52, lat: 38.35, region: 'anatolia',    tier: 2, aliases: ['philadelphia in lydia','alasehir'] },
  { name: 'Laodicea',          lon: 29.11, lat: 37.83, region: 'anatolia',    tier: 2, aliases: ['laodicea on the lycus','laodicea in asia'] },
  { name: 'Colossae',          lon: 29.22, lat: 37.77, region: 'anatolia',    tier: 2 },
  { name: 'Hierapolis',        lon: 29.13, lat: 37.93, region: 'anatolia',    tier: 2 },
  { name: 'Patmos',            lon: 26.55, lat: 37.31, region: 'anatolia',    tier: 2 },
  { name: 'Miletus',           lon: 27.28, lat: 37.53, region: 'anatolia',    tier: 2 },
  { name: 'Troas',             lon: 26.39, lat: 39.77, region: 'anatolia',    tier: 2, aliases: ['alexandria troas'] },
  { name: 'Iconium',           lon: 32.48, lat: 37.87, region: 'anatolia',    tier: 2, aliases: ['konya'] },
  { name: 'Lystra',            lon: 32.49, lat: 37.58, region: 'anatolia',    tier: 2 },
  { name: 'Derbe',             lon: 33.39, lat: 37.36, region: 'anatolia',    tier: 2 },
  { name: 'Perga',             lon: 30.85, lat: 36.96, region: 'anatolia',    tier: 2 },
  { name: 'Attalia',           lon: 30.71, lat: 36.89, region: 'anatolia',    tier: 2, aliases: ['antalya'] },
  { name: 'Haran',             lon: 39.02, lat: 36.86, region: 'anatolia',    tier: 1, aliases: ['harran'] },
  { name: 'Carchemish',        lon: 38.01, lat: 36.83, region: 'anatolia',    tier: 2 },
  { name: 'Tarsus',            lon: 34.90, lat: 36.92, region: 'anatolia',    tier: 2 },
  { name: 'Myra',              lon: 29.98, lat: 36.27, region: 'anatolia',    tier: 3 },
  { name: 'Cnidus',            lon: 27.37, lat: 36.67, region: 'anatolia',    tier: 3 },
  // ── Mesopotamia ───────────────────────────────────────────────────────────
  { name: 'Nineveh',           lon: 43.15, lat: 36.36, region: 'mesopotamia', tier: 1 },
  { name: 'Assur',             lon: 43.26, lat: 35.46, region: 'mesopotamia', tier: 2 },
  { name: 'Babylon',           lon: 44.42, lat: 32.54, region: 'mesopotamia', tier: 1 },
  { name: 'Ur',                lon: 46.10, lat: 30.96, region: 'mesopotamia', tier: 1 },
  { name: 'Nippur',            lon: 45.23, lat: 32.12, region: 'mesopotamia', tier: 3 },
  { name: 'Mari',              lon: 40.89, lat: 34.55, region: 'mesopotamia', tier: 3 },
  { name: 'Ugarit',            lon: 35.78, lat: 35.60, region: 'mesopotamia', tier: 3 },
  // ── Persia ────────────────────────────────────────────────────────────────
  { name: 'Susa',              lon: 48.26, lat: 32.19, region: 'persia',      tier: 1, aliases: ['shushan'] },
  { name: 'Persepolis',        lon: 52.89, lat: 29.94, region: 'persia',      tier: 2 },
  { name: 'Ecbatana',          lon: 48.52, lat: 34.80, region: 'persia',      tier: 2, aliases: ['achmetha'] },
  // ── Egypt ─────────────────────────────────────────────────────────────────
  { name: 'Alexandria',        lon: 29.92, lat: 31.20, region: 'egypt',       tier: 1 },
  { name: 'Memphis',           lon: 31.25, lat: 29.85, region: 'egypt',       tier: 1, aliases: ['noph'] },
  { name: 'Thebes',            lon: 32.64, lat: 25.70, region: 'egypt',       tier: 2, aliases: ['no','no-amon'] },
  { name: 'Mt. Sinai',         lon: 33.97, lat: 28.54, region: 'egypt',       tier: 1, aliases: ['horeb','sinai','mount sinai'] },
  { name: 'Goshen',            lon: 31.90, lat: 30.60, region: 'egypt',       tier: 2 },
  { name: 'Rameses',           lon: 31.83, lat: 30.79, region: 'egypt',       tier: 2, aliases: ['raamses'] },
  { name: 'On',                lon: 31.32, lat: 30.13, region: 'egypt',       tier: 3, aliases: ['heliopolis'] },
  // ── Greek / Roman world ───────────────────────────────────────────────────
  { name: 'Rome',              lon: 12.50, lat: 41.90, region: 'roman',       tier: 1 },
  { name: 'Corinth',           lon: 22.88, lat: 37.91, region: 'roman',       tier: 1 },
  { name: 'Athens',            lon: 23.73, lat: 37.98, region: 'roman',       tier: 1 },
  { name: 'Thessalonica',      lon: 22.95, lat: 40.63, region: 'roman',       tier: 2 },
  { name: 'Philippi',          lon: 24.28, lat: 41.01, region: 'roman',       tier: 2 },
  { name: 'Berea',             lon: 22.20, lat: 40.52, region: 'roman',       tier: 2 },
  { name: 'Cenchreae',         lon: 23.00, lat: 37.87, region: 'roman',       tier: 3, aliases: ['cenchrea'] },
  { name: 'Nicopolis',         lon: 20.71, lat: 38.96, region: 'roman',       tier: 3 },
  { name: 'Malta',             lon: 14.44, lat: 35.89, region: 'roman',       tier: 2, aliases: ['melita'] },
  { name: 'Syracuse',          lon: 15.29, lat: 37.08, region: 'roman',       tier: 3 },
  { name: 'Puteoli',           lon: 14.12, lat: 40.83, region: 'roman',       tier: 3, aliases: ['pozzuoli'] },
  { name: 'Rhegium',           lon: 15.65, lat: 38.11, region: 'roman',       tier: 3 },
  { name: 'Crete',             lon: 24.97, lat: 35.24, region: 'roman',       tier: 2, aliases: ['fair havens','lasea'] },
  { name: 'Cyprus',            lon: 33.43, lat: 35.13, region: 'roman',       tier: 2, aliases: ['paphos','salamis'] },
]

// ── Map tile configurations ────────────────────────────────────────────────────
const TILE_LAYERS = {
  terrain: {
    url:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    attr:  '© Esri',
    label: 'RELIEF',
    // Shift terrain tiles to dark olive-military palette
    filter: 'sepia(60%) hue-rotate(35deg) brightness(0.38) contrast(1.25) saturate(0.85)',
  },
  topo: {
    url:   'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attr:  '© OpenTopoMap',
    label: 'TOPO',
    filter: 'sepia(75%) hue-rotate(12deg) brightness(0.36) contrast(1.3) saturate(0.7)',
  },
  satellite: {
    url:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr:  '© Esri',
    label: 'SAT',
    filter: 'brightness(0.52) saturate(0.5) hue-rotate(12deg)',
  },
  physical: {
    url:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}',
    attr:  '© Esri',
    label: 'PHYSICAL',
    filter: 'sepia(50%) hue-rotate(28deg) brightness(0.40) contrast(1.18)',
  },
} as const

type TileKey = keyof typeof TILE_LAYERS

// ── Military SVG marker ────────────────────────────────────────────────────────
const KHAKI = '#c9b97a'
const GOLD  = '#F5E060'
const OLIVE = '#2c3820'
/** Steel Gray from the brand palette — water reads cool against khaki land. */
const STEEL = '#8b9384'

function makeIcon(fill: string, pulse: boolean, selected: boolean): L.DivIcon {
  const r    = selected ? 6 : 4.5
  const ring = r * 3.0
  const tick = ring * 0.72

  // SMIL animation for pulse ring
  const pulseEl = pulse
    ? `<circle cx="0" cy="0" r="${ring * 1.6}" fill="none" stroke="${fill}" stroke-width="0.9" opacity="0">
         <animate attributeName="r"       values="${ring};${ring * 3.2};${ring}"   dur="2.4s" repeatCount="indefinite"/>
         <animate attributeName="opacity" values="0.6;0;0.6"                      dur="2.4s" repeatCount="indefinite"/>
       </circle>`
    : ''

  // Slow-rotating dashed outer ring for selected
  const selRing = selected
    ? `<circle cx="0" cy="0" r="${ring * 2.2}" fill="none" stroke="${fill}" stroke-width="0.7"
         stroke-dasharray="3,5" opacity="0.4">
         <animateTransform attributeName="transform" type="rotate"
           from="0 0 0" to="360 0 0" dur="20s" repeatCount="indefinite"/>
       </circle>`
    : ''

  const sz   = Math.ceil(ring * 3.2 * 2 + 12)
  const half = sz / 2

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}"
      viewBox="${-half} ${-half} ${sz} ${sz}">
    ${pulseEl}
    ${selRing}
    <circle cx="0" cy="0" r="${ring}" fill="none" stroke="${fill}"
      stroke-width="0.65" opacity="${selected ? 0.92 : 0.5}"/>
    <line x1="${-ring - tick}" y1="0" x2="${-ring + tick * 0.38}" y2="0"
      stroke="${fill}" stroke-width="0.9" opacity="0.82"/>
    <line x1="${ring - tick * 0.38}" y1="0" x2="${ring + tick}" y2="0"
      stroke="${fill}" stroke-width="0.9" opacity="0.82"/>
    <line x1="0" y1="${-ring - tick}" x2="0" y2="${-ring + tick * 0.38}"
      stroke="${fill}" stroke-width="0.9" opacity="0.82"/>
    <line x1="0" y1="${ring - tick * 0.38}" x2="0" y2="${ring + tick}"
      stroke="${fill}" stroke-width="0.9" opacity="0.82"/>
    <circle cx="0" cy="0" r="${r}" fill="${fill}" opacity="${selected ? 1 : 0.88}"/>
    ${selected ? `<circle cx="0" cy="0" r="${r * 0.42}" fill="#060f0a"/>` : ''}
  </svg>`

  return L.divIcon({
    html:       svg,
    className:  '',
    iconSize:   [sz, sz],
    iconAnchor: [half, half],
    popupAnchor:[0, -half],
  })
}

/**
 * Mountains are not cities and must not wear the city marker. A peak reads as a
 * peak: an open chevron sitting on a ground line, no crosshair ring. Disputed
 * peaks — and the location of Sinai genuinely is disputed — draw with a broken
 * outline so the uncertainty is visible on the map itself rather than buried in
 * a popup a reader may never open.
 */
function makePeakIcon(fill: string, important: boolean, disputed: boolean): L.DivIcon {
  const sz = 26
  const half = sz / 2
  const dash = disputed ? ' stroke-dasharray="2.4,2.4"' : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}"
      viewBox="${-half} ${-half} ${sz} ${sz}">
    <path d="M -7.5 5 L 0 -6.5 L 7.5 5 Z" fill="none" stroke="${fill}"
      stroke-width="${important ? 1.5 : 1.05}" stroke-linejoin="round"
      opacity="${important ? 0.95 : 0.6}"${dash}/>
    <path d="M -2.7 -0.4 L 0 -3.6 L 2.7 -0.4" fill="none" stroke="${fill}"
      stroke-width="0.9" opacity="${important ? 0.8 : 0.42}"/>
    <line x1="-9.5" y1="5" x2="9.5" y2="5" stroke="${fill}"
      stroke-width="0.8" opacity="${important ? 0.7 : 0.34}"/>
  </svg>`

  return L.divIcon({
    html:       svg,
    className:  '',
    iconSize:   [sz, sz],
    iconAnchor: [half, half],
    popupAnchor:[0, -half],
  })
}

// ── Regions, features and journeys ─────────────────────────────────────────────
/**
 * The map's whole geographic vocabulary used to be the 92 city points above, and
 * that is why Exodus 2 opened the map and it did not move: the basket is on the
 * NILE (a river) and Moses flees to MIDIAN (a region). Neither can be a point,
 * so the matcher found nothing and the component returned in silence.
 *
 * Regions, water/terrain features and routes are authored in src/data and owned
 * outside this file. They are pulled in through import.meta.glob rather than a
 * static import on purpose: a static import of a file that has not landed yet
 * fails both `tsc` and the build, whereas a glob that matches nothing yields an
 * empty object. Missing data degrades the map back to cities; it never breaks it.
 */
export interface TopoRegion {
  name: string
  aliases?: string[]
  /** SW, NE — in Leaflet's own [lat, lon] order. */
  bounds: [[number, number], [number, number]]
  tier?: 1 | 2 | 3
  era?: 'ot' | 'nt' | 'both'
  note?: string
  disputed?: boolean
}

export interface TopoFeature {
  name: string
  aliases?: string[]
  kind?: string
  /** Tolerated spelling of `kind`, in case the data file names it `type`. */
  type?: string
  /** A river or coastline as an ordered line of [lat, lon] points. */
  path?: Array<[number, number]>
  points?: Array<[number, number]>
  line?: Array<[number, number]>
  /** A sea or an open area, SW then NE. */
  bounds?: [[number, number], [number, number]]
  lat?: number
  lon?: number
  tier?: 1 | 2 | 3
  disputed?: boolean
  note?: string
}

export interface TopoRouteLeg {
  from: string
  to: string
  ref: string
  note: string
}

export interface TopoRoute {
  id: string
  name: string
  /** e.g. "Exodus 12 – Deuteronomy 34", or several ranges. */
  scope: string | string[]
  legs: TopoRouteLeg[]
  confidence: 'located' | 'approximate' | 'disputed'
  disputedNote?: string
}

type TopoDataModule = Record<string, unknown>

const TOPO_DATA_MODULES: Record<string, TopoDataModule> = {
  ...import.meta.glob<TopoDataModule>('../data/topoRegions.ts',  { eager: true }),
  ...import.meta.glob<TopoDataModule>('../data/topoFeatures.ts', { eager: true }),
  ...import.meta.glob<TopoDataModule>('../data/topoRoutes.ts',   { eager: true }),
}

/**
 * Reads the first array exported under any of the given names. No default-export
 * fallback on purpose — grabbing "whatever array is in there" would happily pull
 * regions into the routes list and draw nonsense.
 */
function readDataArray<T>(names: string[]): T[] {
  for (const mod of Object.values(TOPO_DATA_MODULES)) {
    if (!mod) continue
    for (const name of names) {
      const value = mod[name]
      if (Array.isArray(value)) return value as T[]
    }
  }
  return []
}

export const TOPO_REGIONS: TopoRegion[] =
  readDataArray<TopoRegion>(['TOPO_REGIONS', 'REGIONS', 'topoRegions'])
    .filter(r => r && typeof r.name === 'string' && Array.isArray(r.bounds))

export const TOPO_FEATURES: TopoFeature[] =
  readDataArray<TopoFeature>(['TOPO_FEATURES', 'FEATURES', 'topoFeatures'])
    .filter(f => f && typeof f.name === 'string')

export const TOPO_ROUTES: TopoRoute[] =
  readDataArray<TopoRoute>(['TOPO_ROUTES', 'ROUTES', 'topoRoutes'])
    .filter(r => r && typeof r.id === 'string' && Array.isArray(r.legs) && r.legs.length > 0)

// ── Geometry helpers ───────────────────────────────────────────────────────────
type LatLonPair = [number, number]

function isPair(v: unknown): v is LatLonPair {
  return Array.isArray(v) && v.length >= 2 &&
    typeof v[0] === 'number' && typeof v[1] === 'number' &&
    Number.isFinite(v[0]) && Number.isFinite(v[1])
}

/**
 * Bounds arrive as [[latS, lonW], [latN, lonE]]. The only correction made here is
 * for a pair whose first number cannot be a latitude at all — that is a straight
 * [lon, lat] transposition, and drawing it would put Midian in the ocean.
 */
function normalizeBounds(raw: unknown): L.LatLngBounds | null {
  if (!Array.isArray(raw) || raw.length < 2) return null
  const [a, b] = raw
  if (!isPair(a) || !isPair(b)) return null

  let [s, w] = a
  let [n, e] = b
  const canBeLat = (x: number, y: number) => Math.abs(x) <= 90 && Math.abs(y) <= 90
  if (!canBeLat(s, n) && canBeLat(w, e)) {
    ;[s, w] = [w, s]
    ;[n, e] = [e, n]
  }
  if (!canBeLat(s, n)) return null

  return L.latLngBounds(
    [Math.min(s, n), Math.min(w, e)],
    [Math.max(s, n), Math.max(w, e)],
  )
}

/**
 * A region drawn as a rectangle is a claim the sources do not support. Ancient
 * regional boundaries were not lines on a map, so the corners are cut back into
 * a soft octagon: the shape reads as an area of terrain rather than a surveyed
 * border, which is the honest picture.
 */
function softZone(b: L.LatLngBounds): L.LatLngTuple[] {
  const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast()
  const dy = (n - s) * 0.26
  const dx = (e - w) * 0.26
  return [
    [s + dy, w], [n - dy, w], [n, w + dx], [n, e - dx],
    [n - dy, e], [s + dy, e], [s, e - dx], [s, w + dx],
  ]
}

function featurePath(f: TopoFeature): L.LatLngTuple[] | null {
  const raw = f.path ?? f.points ?? f.line
  if (!Array.isArray(raw)) return null
  const pts = raw.filter(isPair).map(p => [p[0], p[1]] as L.LatLngTuple)
  return pts.length >= 2 ? pts : null
}

function featureKind(f: TopoFeature): string {
  return String(f.kind ?? f.type ?? '').toLowerCase()
}

const WATER_KINDS = ['river', 'sea', 'lake', 'brook', 'wadi', 'gulf', 'spring', 'coast', 'water']
const PEAK_KINDS  = ['mountain', 'mount', 'peak', 'hill', 'range']

const isWater = (f: TopoFeature) => WATER_KINDS.some(k => featureKind(f).includes(k))
const isPeak  = (f: TopoFeature) => PEAK_KINDS.some(k => featureKind(f).includes(k))

// ── Place resolution ───────────────────────────────────────────────────────────
export interface LocatedPlace {
  kind: 'city' | 'region' | 'feature'
  name: string
  lat: number
  lon: number
  bounds?: L.LatLngBounds
}

const normPlace = (s: string) =>
  s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

function locateRegion(r: TopoRegion): LocatedPlace | null {
  const b = normalizeBounds(r.bounds)
  if (!b) return null
  const c = b.getCenter()
  return { kind: 'region', name: r.name, lat: c.lat, lon: c.lng, bounds: b }
}

function locateFeature(f: TopoFeature): LocatedPlace | null {
  const path = featurePath(f)
  if (path) {
    const b = L.latLngBounds(path)
    const mid = path[Math.floor(path.length / 2)]
    return { kind: 'feature', name: f.name, lat: mid[0], lon: mid[1], bounds: b }
  }
  const b = normalizeBounds(f.bounds)
  if (b) {
    const c = b.getCenter()
    return { kind: 'feature', name: f.name, lat: c.lat, lon: c.lng, bounds: b }
  }
  if (typeof f.lat === 'number' && typeof f.lon === 'number') {
    return { kind: 'feature', name: f.name, lat: f.lat, lon: f.lon }
  }
  return null
}

/**
 * One index over all three datasets. Cities are registered first and never
 * overwritten, so the existing behaviour for every passage that already worked
 * is untouched — Samaria stays the city it has always been here even if a
 * Samaria region also exists.
 */
const PLACE_INDEX: Map<string, LocatedPlace> = (() => {
  const index = new Map<string, LocatedPlace>()
  const put = (key: string, place: LocatedPlace) => {
    const k = normPlace(key)
    if (k && !index.has(k)) index.set(k, place)
  }

  for (const c of TOPO_CITIES) {
    const place: LocatedPlace = { kind: 'city', name: c.name, lat: c.lat, lon: c.lon }
    put(c.name, place)
    for (const a of c.aliases ?? []) put(a, place)
  }
  for (const r of TOPO_REGIONS) {
    const place = locateRegion(r)
    if (!place) continue
    put(r.name, place)
    for (const a of r.aliases ?? []) put(a, place)
  }
  for (const f of TOPO_FEATURES) {
    const place = locateFeature(f)
    if (!place) continue
    put(f.name, place)
    for (const a of f.aliases ?? []) put(a, place)
  }
  return index
})()

function resolvePlace(name: string): LocatedPlace | undefined {
  if (!name) return undefined
  return PLACE_INDEX.get(normPlace(name))
}

// ── Passage / scope matching ───────────────────────────────────────────────────
const BOOK_NAMES = [
  'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
  '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
  'Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon',
  'Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
  'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah',
  'Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians',
  '2 Corinthians','Galatians','Ephesians','Philippians','Colossians',
  '1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon',
  'Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation',
]

const BOOK_KEYS = BOOK_NAMES.map(b => b.toLowerCase())

function normBook(raw: string): string {
  let s = raw.toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^(first|1st|i)\s+/, '1 ')
       .replace(/^(second|2nd|ii)\s+/, '2 ')
       .replace(/^(third|3rd|iii)\s+/, '3 ')
  if (s === 'song of songs' || s === 'canticles' || s === 'song') s = 'song of solomon'
  if (s === 'psalm') s = 'psalms'
  if (s === 'revelations' || s === 'apocalypse') s = 'revelation'
  return s
}

/** Index in canon order, or -1 when the name is unknown or ambiguous ("Phil"). */
function bookIndex(raw: string): number {
  const q = normBook(raw)
  if (!q) return -1
  const exact = BOOK_KEYS.indexOf(q)
  if (exact >= 0) return exact
  let hit = -1
  for (let i = 0; i < BOOK_KEYS.length; i += 1) {
    if (!BOOK_KEYS[i].startsWith(q)) continue
    if (hit >= 0) return -1
    hit = i
  }
  return hit
}

interface PassagePoint { book: number; chapter: number }

/** "Exodus 2:3" · "1 Samuel 17" · "Acts 13:1-3" → { book, chapter }. */
function parseRef(raw: string): PassagePoint | null {
  if (!raw) return null
  const head = String(raw).split(/[–—]|(?<=\d)\s*-\s*(?=\d)/)[0].trim()
  const m = head.match(/^(.*?)(\d+)(?::\s*\d+)?\s*$/)
  if (m) {
    const book = bookIndex(m[1])
    if (book >= 0) return { book, chapter: Number(m[2]) }
  }
  const bookOnly = bookIndex(head)
  return bookOnly >= 0 ? { book: bookOnly, chapter: 1 } : null
}

const CHAPTER_CEILING = 999
const passageKey = (p: PassagePoint) => p.book * 1000 + Math.min(Math.max(p.chapter, 0), CHAPTER_CEILING)

/**
 * "Exodus 12 – Deuteronomy 34" · "Joshua 6–12" · "Acts 13:1 – 14:28".
 * A bare number on the right-hand side means a chapter in the same book.
 */
function scopeContains(scope: string, passage: PassagePoint): boolean {
  if (!scope) return false
  const parts = String(scope).split(/\s*[–—]\s*|\s+-\s+|(?<=\d)\s*-\s*(?=\d)/).map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return false

  const start = parseRef(parts[0])
  if (!start) return false
  const startsWholeBook = !/\d/.test(parts[0])

  let end: PassagePoint
  if (parts.length === 1) {
    end = startsWholeBook
      ? { book: start.book, chapter: CHAPTER_CEILING }
      : { book: start.book, chapter: start.chapter }
  } else {
    const tail = parts[parts.length - 1]
    const bare = tail.match(/^(\d+)(?::\s*\d+)?$/)
    end = bare
      ? { book: start.book, chapter: Number(bare[1]) }
      : parseRef(tail) ?? { book: start.book, chapter: CHAPTER_CEILING }
    if (!/\d/.test(tail)) end = { book: end.book, chapter: CHAPTER_CEILING }
  }

  const key = passageKey(passage)
  return key >= passageKey(start) && key <= passageKey(end)
}

const routeScopes = (r: TopoRoute): string[] =>
  Array.isArray(r.scope) ? r.scope : [r.scope].filter(Boolean) as string[]

/**
 * Which passage is open. The component is only handed geo-references, so the
 * passage is read back out of the verses attached to them: the book named most
 * often, at the earliest chapter cited in it.
 */
function derivePassage(refs: GeoRef[], explicit?: string): PassagePoint | null {
  if (explicit) {
    const direct = parseRef(explicit)
    if (direct) return direct
  }
  const seen = new Map<number, { count: number; chapter: number }>()
  for (const ref of refs) {
    const verses = Array.isArray(ref.verses) ? ref.verses : [ref.verses as unknown as string]
    for (const v of verses) {
      const p = parseRef(String(v ?? ''))
      if (!p) continue
      const prev = seen.get(p.book)
      if (!prev) seen.set(p.book, { count: 1, chapter: p.chapter })
      else seen.set(p.book, { count: prev.count + 1, chapter: Math.min(prev.chapter, p.chapter) })
    }
  }
  let best: PassagePoint | null = null
  let bestCount = 0
  for (const [book, { count, chapter }] of seen) {
    if (count > bestCount) { bestCount = count; best = { book, chapter } }
  }
  return best
}

// ── Region / feature label styling ─────────────────────────────────────────────
interface ZoneLabel {
  el: HTMLElement
  tier: number
  important: boolean
}

/**
 * Zone names behave the opposite way round to city names. A region is a wide
 * thing: its name belongs on a wide view and becomes noise once you are down
 * among the streets of Jerusalem, so it fades in early and back out when the
 * view no longer contains enough of the region to mean anything. A region the
 * passage actually names never fades out — that is the whole reason it is lit.
 */
const ZONE_REVEAL_ZOOM: Record<number, number> = { 1: 4.4, 2: 5.4, 3: 6.4 }
const ZONE_HIDE_ZOOM = 11

function styleZoneLabels(labels: ZoneLabel[], zoom: number): void {
  for (const { el, tier, important } of labels) {
    const reveal = ZONE_REVEAL_ZOOM[tier] ?? 6.4
    const fadeIn  = important ? 1 : Math.max(0, Math.min(1, (zoom - (reveal - 1.2)) / 1.2))
    const fadeOut = important ? 1 : Math.max(0, Math.min(1, 1 - (zoom - ZONE_HIDE_ZOOM) / 1.5))
    const op = fadeIn * fadeOut * (important ? 0.92 : 0.55)

    el.style.opacity = op.toFixed(3)
    el.style.fontSize = `${Math.min(9.5 + Math.max(0, zoom - 6) * 0.55, 15).toFixed(2)}px`
  }
}

// ── Props ──────────────────────────────────────────────────────────────────────
export interface GeoRef {
  place: string
  verses: string[]
  significance: string
}

interface TopoMapProps {
  geoReferences: GeoRef[]
  width: number
  height: number
  /**
   * Optional. When a caller knows the open passage it can say so directly;
   * otherwise it is read back out of the geo-references' own verses.
   */
  passageRef?: string
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Component ──────────────────────────────────────────────────────────────────
interface CityLabel {
  el: HTMLElement
  tier: number
  important: boolean
}

/**
 * Zoom at which each tier's name becomes legible. Below its threshold a city is
 * a dot and nothing else, so a wide view reads as terrain rather than as a wall
 * of type. Cities the passage actually names ignore this entirely.
 *
 * Tier 2 sits just under the map's opening zoom of 8 on purpose: the first view
 * should already carry most of its names, not fade them in once you touch the
 * controls. Tier 3 is the "zoom in and more appears" layer.
 */
const TIER_REVEAL_ZOOM: Record<number, number> = { 1: 6.6, 2: 7.6, 3: 9.6 }

/**
 * Type size at the moment a tier appears. It grows from here.
 *
 * These were ~10px and that was simply too small to read on a dark map. A place
 * name has to be legible at a glance or it is decoration. Sized for reading,
 * not for fitting the most labels on screen.
 */
const TIER_BASE_PX: Record<number, number> = { 1: 12.5, 2: 11.5, 3: 10.5 }

const IMPORTANT_BASE_PX = 13

/**
 * Growth is measured from ONE shared zoom for every label, and deliberately not
 * from each label's own reveal threshold.
 *
 * Measuring from the reveal threshold is what broke this: a highlighted city was
 * given reveal 0 to mean "never hidden", which made its growth term `zoom - 0`.
 * That pinned it to the maximum size at every zoom — so at a wide view one name
 * sat there in 24px type covering half the Aegean. "Never hidden" and "always
 * huge" are different properties and must not share a number.
 */
const GROWTH_REF_ZOOM = 7
const GROWTH_PER_ZOOM = 0.11
const MAX_GROWTH = 1.9
/**
 * Hard ceiling in px. The previous 15.5 was an overcorrection from the bug that
 * pinned one label at 23px on a wide view — it fixed the sprawl and left the
 * type unreadable. The real constraint is the WIDE view, which the growth
 * reference already handles: zoomed out everything sits at its base size, so
 * the ceiling only governs how large a name gets when you are close in, where
 * there is room for it.
 */
const MAX_LABEL_PX = 26

/**
 * Names scale with zoom rather than sitting at a fixed pixel size, so the map
 * reads like a map: come in closer, the place names commit. Below the reference
 * zoom the type stays at its base size — zoomed out is small, always.
 */
function labelPxFor(zoom: number, base: number): number {
  const growth = Math.min(1 + Math.max(0, zoom - GROWTH_REF_ZOOM) * GROWTH_PER_ZOOM, MAX_GROWTH)
  return Math.min(base * growth, MAX_LABEL_PX)
}

/** Fade in over ~1.2 zoom levels instead of popping on. */
function labelOpacityFor(zoom: number, reveal: number): number {
  if (zoom >= reveal) return 1
  const fade = (zoom - (reveal - 1.2)) / 1.2
  return Math.max(0, Math.min(1, fade))
}

function styleCityLabels(labels: CityLabel[], zoom: number): void {
  for (const { el, tier, important } of labels) {
    const reveal = TIER_REVEAL_ZOOM[tier] ?? 9.6
    const base   = important ? IMPORTANT_BASE_PX : (TIER_BASE_PX[tier] ?? 8.5)
    // Important = never hidden. It does NOT mean bigger at every zoom.
    const op     = important ? 1 : labelOpacityFor(zoom, reveal)

    el.style.opacity = String(op)
    // Hidden labels must not eat clicks aimed at the marker underneath them.
    el.style.pointerEvents = op < 0.05 ? 'none' : ''
    el.style.fontSize = `${labelPxFor(zoom, base).toFixed(2)}px`
    // Cleared here and re-applied by the declutter pass below, so a label that
    // no longer collides at this zoom springs back to its true position.
    el.style.transform = ''
  }
  declutterLabels(labels)
}

/**
 * Nudges overlapping labels apart. Leaflet places permanent tooltips at a fixed
 * offset from the marker and does no collision handling at all, so genuinely
 * close places stack into an unreadable pile.
 *
 * The reported case is real geography, not bad data: Jerusalem sits at 35.22/31.78,
 * Golgotha at 35.23/31.78 — about a kilometre — and Bethany at 35.26/31.77. All
 * three have lon > 35, so all three get the SAME direction and the SAME offset and
 * land on the same pixels. At any zoom short of street level they must overlap.
 *
 * Nudging beats hiding. Golgotha is not a footnote to Jerusalem, and a reader
 * looking at a passion passage needs to see all three. Priority only decides who
 * keeps the true position and who moves.
 */
function declutterLabels(labels: CityLabel[]): void {
  const visible = labels.filter(l => l.el.style.opacity !== '0' && l.el.offsetParent !== null)
  if (visible.length < 2) return

  // Selected/highlighted labels hold their ground; lower tiers move around them.
  const ordered = [...visible].sort((a, b) =>
    (a.important === b.important ? a.tier - b.tier : a.important ? -1 : 1))

  const placed: DOMRect[] = []
  const overlaps = (r: DOMRect) => placed.some(p =>
    r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top)

  for (const { el } of ordered) {
    el.style.transform = ''
    let rect = el.getBoundingClientRect()
    if (!overlaps(rect)) { placed.push(rect); continue }

    // Try alternating up/down in one-line steps. Vertical only — horizontal
    // movement would slide a name away from the dot it belongs to.
    const step = Math.max(rect.height + 2, 12)
    let settled = false
    for (let i = 1; i <= 4 && !settled; i += 1) {
      for (const dir of [-1, 1]) {
        el.style.transform = `translateY(${dir * i * step}px)`
        rect = el.getBoundingClientRect()
        if (!overlaps(rect)) { settled = true; break }
      }
    }
    // Still colliding after four rows each way means a genuinely dense cluster.
    // Keep the label rather than hide it — overlapping text a reader can zoom
    // into beats a place that silently is not there.
    placed.push(rect)
  }
}

export function TopoMap({ geoReferences, width, height, passageRef }: TopoMapProps) {
  const divRef      = useRef<HTMLDivElement>(null)
  const mapRef      = useRef<L.Map | null>(null)
  const tileRef     = useRef<L.TileLayer | null>(null)
  const markersRef  = useRef<L.Marker[]>([])
  const labelsRef   = useRef<CityLabel[]>([])
  const zoneLabelsRef = useRef<ZoneLabel[]>([])
  const regionLayersRef  = useRef<L.Layer[]>([])
  const featureLayersRef = useRef<L.Layer[]>([])
  const routeLayersRef   = useRef<L.Layer[]>([])
  const legLayersRef     = useRef<L.Polyline[]>([])
  const routeTimersRef   = useRef<number[]>([])
  const activeKey   = useRef<TileKey>('terrain')
  const styleElRef  = useRef<HTMLStyleElement | null>(null)
  const btnGroupRef = useRef<HTMLDivElement>(null)
  const [tileFilter, setTileFilter] = useState<string>(TILE_LAYERS.terrain.filter)
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null)
  const assetImages = useAssetImages()

  /**
   * Resolve every place the passage names against ALL THREE datasets, not just
   * cities. This is the fix for the Exodus 2 report: "Nile" and "Midian" are a
   * river and a region, so the old city-only lookup produced an empty match and
   * the map sat still with nothing to say for itself.
   *
   * `unmatched` is kept deliberately — a place the app could not find is worth
   * naming out loud rather than quietly dropping.
   */
  const resolved = useMemo(() => {
    const cityRefs    = new Map<string, GeoRef>()
    const regionRefs  = new Map<string, GeoRef>()
    const featureRefs = new Map<string, GeoRef>()
    const targets: LocatedPlace[] = []
    const unmatched: string[] = []

    for (const r of geoReferences ?? []) {
      const place = resolvePlace(r.place)
      if (!place) {
        if (r.place) unmatched.push(r.place)
        continue
      }
      const bucket = place.kind === 'city' ? cityRefs : place.kind === 'region' ? regionRefs : featureRefs
      if (!bucket.has(place.name)) {
        bucket.set(place.name, r)
        targets.push(place)
      }
    }
    return { cityRefs, regionRefs, featureRefs, targets, unmatched }
  }, [geoReferences])

  const refMap = resolved.cityRefs
  const matchedCount = resolved.targets.length

  const passage = useMemo(
    () => derivePassage(geoReferences ?? [], passageRef),
    [geoReferences, passageRef],
  )

  /**
   * A route never draws on its own. All this does is decide whether the offer is
   * even on the table — the reader has to ask for it.
   */
  const availableRoute = useMemo(() => {
    if (!passage) return null
    return TOPO_ROUTES.find(r => routeScopes(r).some(s => scopeContains(s, passage))) ?? null
  }, [passage])

  const activeRoute = activeRouteId
    ? TOPO_ROUTES.find(r => r.id === activeRouteId) ?? null
    : null

  // Switch tile layer
  function switchTiles(key: TileKey) {
    const map = mapRef.current
    if (!map) return
    const cfg = TILE_LAYERS[key]
    if (tileRef.current) map.removeLayer(tileRef.current)
    const layer = L.tileLayer(cfg.url, { attribution: cfg.attr, maxZoom: 19 })
    layer.addTo(map)
    tileRef.current = layer
    activeKey.current = key
    setTileFilter(cfg.filter)

    // Update button styles
    btnGroupRef.current?.querySelectorAll<HTMLButtonElement>('button').forEach(btn => {
      const isActive = btn.dataset.tkey === key
      btn.style.background  = isActive ? `${KHAKI}30` : `${KHAKI}08`
      btn.style.borderColor = isActive ? `${KHAKI}85` : `${KHAKI}28`
      btn.style.color       = isActive ? KHAKI : `${KHAKI}88`
    })
  }

  // Rebuild all city markers
  function buildMarkers(map: L.Map, refs: Map<string, GeoRef>, selectedName?: string, cityImages: Record<string, string> = {}) {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    labelsRef.current = []

    for (const city of TOPO_CITIES) {
      const ref    = refs.get(city.name)
      const isHL   = !!ref
      const isSel  = city.name === selectedName
      const fill   = isSel ? GOLD : isHL ? KHAKI : `${KHAKI}60`
      const icon   = makeIcon(fill, isHL && !isSel, isSel)
      const marker = L.marker([city.lat, city.lon], { icon })

      marker.addTo(map)

      // City name label. No background box — the name is drawn as haloed text so
      // it stays readable over any tile layer (satellite included) without a
      // black slab covering the terrain underneath it.
      //
      // Labels are also zoom-gated: at low zoom the map is dots only, and names
      // fade in tier by tier as you come down, then grow with the zoom. A
      // highlighted city (one the passage actually names) is never gated — that
      // is the whole reason the map is open.
      // Full strength for every label that is on screen at all. Tier controls
      // WHEN a name appears, not how washed out it is once it does — a
      // permanently dimmed name is just a name that is hard to read.
      const labelColor = isSel ? GOLD : KHAKI
      marker.bindTooltip(
        `<span class="topo-city-name">${city.name.toUpperCase()}</span>`,
        {
          permanent:  true,
          direction:  city.lon < 35 ? 'left' : 'right',
          offset:     city.lon < 35 ? [-13, 0] : [13, 0],
          className:  'topo-tt',
          opacity:    1,
        }
      )

      const tipEl = marker.getTooltip()?.getElement() as HTMLElement | undefined
      if (tipEl) {
        tipEl.style.color = labelColor
        labelsRef.current.push({
          el: tipEl,
          tier: city.tier,
          important: isSel || isHL,
        })
      }

      // Click popup with passage details + exhaustive city data
      const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
      const cityDetail = CITY_DATA[city.name]
      const cityImg = findImage(cityImages, city.name)
      marker.bindPopup(`
        <div style="
          font-family:'JetBrains Mono',monospace;
          background:rgba(16,18,15,0.98);
          border:1px solid ${isHL ? KHAKI : KHAKI + '40'};
          border-radius:10px;
          padding:13px 16px;
          min-width:260px;
          max-width:360px;
          max-height:480px;
          overflow-y:auto;
        ">
          ${cityImg ? `<img src="${cityImg}" alt="${city.name}" style="width:100%;height:110px;object-fit:cover;border-radius:6px;margin-bottom:8px;opacity:0.88;" />` : ''}
          <div style="font-family:'Crimson Pro',serif;font-size:17px;color:${isSel?GOLD:KHAKI};font-weight:600;margin-bottom:2px">
            ${city.name}
          </div>
          <div style="font-size:7px;color:${KHAKI};opacity:0.5;margin-bottom:8px;letter-spacing:0.12em">
            ${cityDetail ? cityDetail.modernName : city.lon.toFixed(2)+'°E · '+city.lat.toFixed(2)+'°N'} · ${city.region.toUpperCase()}
          </div>
          ${ref
            ? `<div style="font-size:7px;color:${KHAKI};letter-spacing:0.1em;margin-bottom:3px;opacity:0.6">PASSAGE REFERENCE</div>
               <div style="font-size:7.5px;color:${KHAKI};letter-spacing:0.08em;margin-bottom:5px;opacity:0.85">
                 ${Array.isArray(ref.verses) ? ref.verses.join(' · ') : ref.verses}
               </div>
               <div style="font-family:'Crimson Pro',serif;font-size:12px;color:${KHAKI};line-height:1.58;opacity:0.92;margin-bottom:${cityDetail ? 10 : 0}px">
                 ${esc(ref.significance)}
               </div>`
            : ''
          }
          ${cityDetail ? `
            <div style="font-size:7px;color:${KHAKI};opacity:0.5;letter-spacing:0.1em;margin-bottom:3px">OVERVIEW</div>
            <div style="font-family:'Crimson Pro',serif;font-size:11.5px;color:${KHAKI};opacity:0.9;line-height:1.6;margin-bottom:8px">
              ${cityDetail.overview.slice(0, 400)}${cityDetail.overview.length > 400 ? '...' : ''}
            </div>
            <div style="font-size:7px;color:${KHAKI};opacity:0.5;letter-spacing:0.1em;margin-bottom:3px">THEOLOGICAL SIGNIFICANCE</div>
            <div style="font-family:'Crimson Pro',serif;font-size:11px;color:${KHAKI};opacity:0.82;line-height:1.58;margin-bottom:8px;border-left:2px solid ${GOLD}30;padding-left:8px">
              ${cityDetail.theological.slice(0, 400)}${cityDetail.theological.length > 400 ? '...' : ''}
            </div>
            ${cityDetail.allReferences.length > 0 ? `
              <div style="font-size:7px;color:${KHAKI};opacity:0.5;letter-spacing:0.1em;margin-bottom:4px">KEY REFERENCES</div>
              <div style="display:flex;flex-wrap:wrap;gap:3px">
                ${cityDetail.allReferences.slice(0, 12).map(r =>
                  `<span style="font-size:7px;color:${KHAKI};opacity:0.75;background:rgba(184,180,157,0.08);border:1px solid rgba(184,180,157,0.2);border-radius:3px;padding:1px 5px">${r}</span>`
                ).join('')}
              </div>` : ''}
          ` : (!ref ? `<div style="font-family:'Crimson Pro',serif;font-size:11.5px;color:${KHAKI};opacity:0.45;font-style:italic">No passage reference for this location.</div>` : '')}
        </div>
      `, {
        className:   'topo-popup',
        maxWidth:    370,
        closeButton: false,
      })

      markersRef.current.push(marker)
    }

    // Apply the zoom-dependent sizing immediately, so labels are correct on the
    // first paint rather than only after the user touches the zoom control.
    styleCityLabels(labelsRef.current, map.getZoom())
  }

  // ── Zone label helper ───────────────────────────────────────────────────────
  function addZoneLabel(
    map: L.Map, at: L.LatLngExpression, text: string, tier: number,
    important: boolean, color: string,
  ) {
    const marker = L.marker(at, {
      pane:        'topoZoneLabels',
      interactive: false,
      keyboard:    false,
      icon: L.divIcon({
        className: '',
        html: `<span class="topo-zone-name" style="color:${color}">${escapeHtml(text.toUpperCase())}</span>`,
        iconSize: [0, 0],
      }),
    })
    marker.addTo(map)
    const el = marker.getElement()
    if (el) zoneLabelsRef.current.push({ el, tier, important })
    return marker
  }

  function popupShell(accent: string, inner: string): string {
    return `
      <div style="
        font-family:'JetBrains Mono',monospace;
        background:rgba(16,18,15,0.98);
        border:1px solid ${accent};
        border-radius:10px;
        padding:13px 16px;
        min-width:230px;
        max-width:330px;
      ">${inner}</div>`
  }

  // ── Regions — soft zones, never hard borders ────────────────────────────────
  function buildRegions(map: L.Map, refs: Map<string, GeoRef>) {
    regionLayersRef.current.forEach(l => l.remove())
    regionLayersRef.current = []

    for (const region of TOPO_REGIONS) {
      const bounds = normalizeBounds(region.bounds)
      if (!bounds) continue
      const ref   = refs.get(region.name)
      const isHL  = !!ref
      const tier  = region.tier ?? 2
      const color = isHL ? GOLD : KHAKI

      const zone = L.polygon(softZone(bounds), {
        pane:        'topoRegions',
        color,
        weight:      isHL ? 1.1 : 0.7,
        opacity:     isHL ? 0.5 : 0.22,
        // Dashed even when it is not disputed. The edge of a region is a fade,
        // not a fence, and a solid outline would say otherwise.
        dashArray:   region.disputed ? '3,7' : '2,6',
        fillColor:   color,
        fillOpacity: isHL ? 0.1 : 0.045,
        interactive: isHL,
      })
      zone.addTo(map)
      regionLayersRef.current.push(zone)

      if (isHL && ref) {
        zone.bindPopup(popupShell(`${GOLD}70`, `
          <div style="font-family:'Crimson Pro',serif;font-size:16px;color:${GOLD};font-weight:600;margin-bottom:2px">
            ${escapeHtml(region.name)}
          </div>
          <div style="font-size:7px;color:${KHAKI};opacity:0.5;margin-bottom:8px;letter-spacing:0.12em">
            REGION${region.era ? ' · ' + region.era.toUpperCase() : ''} · EXTENT IS APPROXIMATE
          </div>
          <div style="font-size:7.5px;color:${KHAKI};letter-spacing:0.08em;margin-bottom:5px;opacity:0.85">
            ${escapeHtml(Array.isArray(ref.verses) ? ref.verses.join(' · ') : String(ref.verses))}
          </div>
          <div style="font-family:'Crimson Pro',serif;font-size:12px;color:${KHAKI};line-height:1.58;opacity:0.92">
            ${escapeHtml(ref.significance)}
          </div>
          ${region.note ? `<div style="font-family:'Crimson Pro',serif;font-size:11px;color:${KHAKI};opacity:0.7;line-height:1.55;margin-top:8px;border-left:2px solid ${GOLD}30;padding-left:8px">${escapeHtml(region.note)}</div>` : ''}
        `), { className: 'topo-popup', maxWidth: 340, closeButton: false })
      }

      regionLayersRef.current.push(
        addZoneLabel(map, bounds.getCenter(), region.name, tier, isHL, color),
      )
    }
  }

  // ── Features — rivers, seas, peaks ──────────────────────────────────────────
  function buildFeatures(map: L.Map, refs: Map<string, GeoRef>) {
    featureLayersRef.current.forEach(l => l.remove())
    featureLayersRef.current = []

    for (const feature of TOPO_FEATURES) {
      const ref   = refs.get(feature.name)
      const isHL  = !!ref
      const tier  = feature.tier ?? 2
      const water = isWater(feature)
      const color = isHL ? GOLD : water ? STEEL : KHAKI
      // Uncertainty is drawn, not footnoted.
      const dash  = feature.disputed ? '4,5' : undefined

      const attachPopup = (layer: L.Layer) => {
        if (!isHL || !ref) return
        layer.bindPopup(popupShell(`${GOLD}70`, `
          <div style="font-family:'Crimson Pro',serif;font-size:16px;color:${GOLD};font-weight:600;margin-bottom:2px">
            ${escapeHtml(feature.name)}
          </div>
          <div style="font-size:7px;color:${KHAKI};opacity:0.5;margin-bottom:8px;letter-spacing:0.12em">
            ${escapeHtml((featureKind(feature) || 'FEATURE').toUpperCase())}${feature.disputed ? ' · LOCATION DISPUTED' : ''}
          </div>
          <div style="font-size:7.5px;color:${KHAKI};letter-spacing:0.08em;margin-bottom:5px;opacity:0.85">
            ${escapeHtml(Array.isArray(ref.verses) ? ref.verses.join(' · ') : String(ref.verses))}
          </div>
          <div style="font-family:'Crimson Pro',serif;font-size:12px;color:${KHAKI};line-height:1.58;opacity:0.92">
            ${escapeHtml(ref.significance)}
          </div>
          ${feature.note ? `<div style="font-family:'Crimson Pro',serif;font-size:11px;color:${KHAKI};opacity:0.7;line-height:1.55;margin-top:8px;border-left:2px solid ${GOLD}30;padding-left:8px">${escapeHtml(feature.note)}</div>` : ''}
        `), { className: 'topo-popup', maxWidth: 340, closeButton: false })
      }

      const path = featurePath(feature)
      if (path) {
        const line = L.polyline(path, {
          pane:        'topoFeatures',
          color,
          weight:      isHL ? 2.6 : 1.8,
          opacity:     isHL ? 0.9 : 0.55,
          dashArray:   dash,
          interactive: isHL,
        })
        line.addTo(map)
        attachPopup(line)
        featureLayersRef.current.push(line)
        featureLayersRef.current.push(
          addZoneLabel(map, path[Math.floor(path.length / 2)], feature.name, tier, isHL, color),
        )
        continue
      }

      const bounds = normalizeBounds(feature.bounds)
      if (bounds) {
        const zone = L.polygon(softZone(bounds), {
          pane:        'topoFeatures',
          color,
          weight:      isHL ? 1.1 : 0.7,
          opacity:     isHL ? 0.5 : 0.25,
          dashArray:   dash ?? '2,6',
          fillColor:   color,
          fillOpacity: isHL ? 0.12 : 0.06,
          interactive: isHL,
        })
        zone.addTo(map)
        attachPopup(zone)
        featureLayersRef.current.push(zone)
        featureLayersRef.current.push(
          addZoneLabel(map, bounds.getCenter(), feature.name, tier, isHL, color),
        )
        continue
      }

      if (typeof feature.lat === 'number' && typeof feature.lon === 'number') {
        const at: L.LatLngTuple = [feature.lat, feature.lon]
        const marker = L.marker(at, {
          icon: isPeak(feature)
            ? makePeakIcon(color, isHL, !!feature.disputed)
            : makeIcon(isHL ? GOLD : `${KHAKI}60`, false, false),
        })
        marker.addTo(map)
        attachPopup(marker)
        marker.bindTooltip(
          `<span class="topo-city-name">${escapeHtml(feature.name.toUpperCase())}</span>`,
          {
            permanent: true,
            direction: feature.lon < 35 ? 'left' : 'right',
            offset:    feature.lon < 35 ? [-13, 0] : [13, 0],
            className: 'topo-tt',
            opacity:   1,
          },
        )
        const tipEl = marker.getTooltip()?.getElement() as HTMLElement | undefined
        if (tipEl) {
          tipEl.style.color = color
          // Peaks share the city label machinery on purpose — same scale, same
          // collision problem, so they belong in the same declutter pass.
          labelsRef.current.push({ el: tipEl, tier, important: isHL })
        }
        featureLayersRef.current.push(marker)
      }
    }

    styleCityLabels(labelsRef.current, map.getZoom())
  }

  // ── Routes ──────────────────────────────────────────────────────────────────
  function clearRouteLayers() {
    routeTimersRef.current.forEach(t => window.clearTimeout(t))
    routeTimersRef.current = []
    routeLayersRef.current.forEach(l => l.remove())
    routeLayersRef.current = []
    legLayersRef.current = []
  }

  function legPopup(route: TopoRoute, leg: TopoRouteLeg, index: number): string {
    return popupShell(`${GOLD}70`, `
      <div style="font-size:7px;color:${KHAKI};opacity:0.5;letter-spacing:0.12em;margin-bottom:4px">
        LEG ${index + 1} OF ${route.legs.length} · ${escapeHtml(route.name.toUpperCase())}
      </div>
      <div style="font-family:'Crimson Pro',serif;font-size:15px;color:${GOLD};font-weight:600;margin-bottom:3px">
        ${escapeHtml(leg.from)} → ${escapeHtml(leg.to)}
      </div>
      <div style="font-size:7.5px;color:${KHAKI};letter-spacing:0.08em;margin-bottom:6px;opacity:0.85">
        ${escapeHtml(leg.ref)}
      </div>
      <div style="font-family:'Crimson Pro',serif;font-size:12px;color:${KHAKI};line-height:1.58;opacity:0.92">
        ${escapeHtml(leg.note)}
      </div>
      ${route.confidence === 'disputed' && route.disputedNote
        ? `<div style="font-family:'Crimson Pro',serif;font-size:10.5px;color:${KHAKI};opacity:0.68;line-height:1.5;margin-top:9px;border-left:2px solid ${GOLD}35;padding-left:8px">${escapeHtml(route.disputedNote)}</div>`
        : ''}
    `)
  }

  /**
   * Draws the legs in order. The stagger exists so the movement can be read as a
   * sequence — it is NOT a moving dot chasing the line, which would turn a study
   * tool into a documentary.
   *
   * Confidence is in the stroke: a located route is solid, an approximate one is
   * finely broken, and a disputed one is openly dashed with its dispute stated in
   * the panel. Drawing a confident line through contested ground would be the
   * cartographic version of asserting a disputed date.
   */
  function drawRoute(map: L.Map, route: TopoRoute) {
    clearRouteLayers()

    const dashArray = route.confidence === 'disputed'
      ? '6,7'
      : route.confidence === 'approximate' ? '2,5' : undefined

    const drawn: L.LatLngTuple[] = []

    route.legs.forEach((leg, i) => {
      const from = resolvePlace(leg.from)
      const to   = resolvePlace(leg.to)
      if (!from || !to) return

      const a: L.LatLngTuple = [from.lat, from.lon]
      const b: L.LatLngTuple = [to.lat, to.lon]
      drawn.push(a, b)

      const line = L.polyline([a, b], {
        pane:      'topoRoutes',
        color:     GOLD,
        weight:    2.2,
        opacity:   0,
        dashArray,
        lineCap:   'round',
      })
      line.addTo(map)
      line.bindPopup(legPopup(route, leg, i), {
        className: 'topo-popup', maxWidth: 340, closeButton: false,
      })
      routeLayersRef.current.push(line)
      legLayersRef.current.push(line)

      for (const point of [a, b]) {
        const dot = L.circleMarker(point, {
          pane:        'topoRoutes',
          radius:      3,
          color:       GOLD,
          weight:      1,
          opacity:     0,
          fillColor:   GOLD,
          fillOpacity: 0,
          interactive: false,
        })
        dot.addTo(map)
        routeLayersRef.current.push(dot)
        const dotTimer = window.setTimeout(
          () => dot.setStyle({ opacity: 0.75, fillOpacity: 0.8 }), i * 200)
        routeTimersRef.current.push(dotTimer)
      }

      const timer = window.setTimeout(() => line.setStyle({ opacity: 0.88 }), i * 200)
      routeTimersRef.current.push(timer)
    })

    // The reader must never lose where he is inside the larger movement, so the
    // passage's own place keeps a ring of its own for as long as the route is up.
    for (const target of resolved.targets) {
      const halo = L.circleMarker([target.lat, target.lon], {
        pane:        'topoRoutes',
        radius:      13,
        color:       GOLD,
        weight:      1.3,
        opacity:     0.85,
        dashArray:   '2,4',
        fill:        false,
        interactive: false,
      })
      halo.addTo(map)
      routeLayersRef.current.push(halo)
    }

    if (drawn.length > 0) {
      map.flyToBounds(L.latLngBounds(drawn), {
        padding:       [70, 70],
        maxZoom:       9,
        duration:      1.6,
        easeLinearity: 0.22,
      })
    }
  }

  function openLeg(index: number) {
    const map = mapRef.current
    const line = legLayersRef.current[index]
    if (!map || !line) return
    line.setStyle({ opacity: 1, weight: 3 })
    line.openPopup(line.getBounds().getCenter())
  }

  // ── Fly to whatever this passage actually names ─────────────────────────────
  function flyToPassage() {
    const map = mapRef.current
    if (!map) return
    const targets = resolved.targets
    if (targets.length === 0) return

    if (targets.length === 1) {
      const only = targets[0]
      // A region or a river is an area — flying to a point at zoom 12 would put
      // the reader inside it with no way to see its shape.
      if (only.bounds) {
        map.flyToBounds(only.bounds, {
          padding: [60, 60], maxZoom: 10, duration: 1.8, easeLinearity: 0.22,
        })
      } else {
        map.flyTo([only.lat, only.lon], 12, { duration: 1.8, easeLinearity: 0.25 })
      }
      return
    }

    const bounds = L.latLngBounds([])
    for (const t of targets) {
      if (t.bounds) bounds.extend(t.bounds)
      else bounds.extend([t.lat, t.lon])
    }
    map.flyToBounds(bounds.pad(0.12), {
      padding:       [60, 60],
      maxZoom:       13,
      duration:      1.8,
      easeLinearity: 0.22,
    })
  }

  function toggleRoute(route: TopoRoute) {
    const map = mapRef.current
    if (!map) return
    if (activeRouteId === route.id) {
      clearRouteLayers()
      setActiveRouteId(null)
      flyToPassage()
    } else {
      drawRoute(map, route)
      setActiveRouteId(route.id)
    }
  }

  // ── Init Leaflet map (once) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!divRef.current || mapRef.current) return

    // React StrictMode runs effects twice — clear any stale Leaflet state
    const container = divRef.current as HTMLDivElement & { _leaflet_id?: number }
    if (container._leaflet_id) delete container._leaflet_id

    // Inject global overrides for Leaflet chrome
    const style = document.createElement('style')
    style.textContent = `
      .topo-tt {
        background: none !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        /* Font size and opacity are driven per-label from styleCityLabels(). */
        transition: opacity 160ms linear, font-size 120ms linear;
        will-change: opacity, font-size;
      }
      /* Leaflet draws a little pointer triangle on tooltips. With no background
         box to attach to, it reads as a stray dash next to the name. */
      .topo-tt::before { display: none !important; }

      .topo-city-name {
        /* Inter, not JetBrains Mono. The mono face is only loaded at weights
           400 and 500, so at map sizes its strokes are thin enough that the
           halo bleeds into them and the type reads hollow — outlined rather
           than solid. Inter is loaded through 600 and is the brand sans. */
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: inherit;
        font-weight: 600;
        letter-spacing: 0.05em;
        white-space: nowrap;
        -webkit-font-smoothing: antialiased;
        /* The halo replaces the background box. Tight and hard — 1px offsets
           with almost no blur — so it sits OUTSIDE the glyph instead of
           softening into it. One wider, softer pass underneath lifts the whole
           word off busy satellite tiles without touching the letterforms. */
        text-shadow:
           1px  0    1px  rgba(4,9,6,0.98),
          -1px  0    1px  rgba(4,9,6,0.98),
           0    1px  1px  rgba(4,9,6,0.98),
           0   -1px  1px  rgba(4,9,6,0.98),
           1px  1px  1px  rgba(4,9,6,0.98),
          -1px -1px  1px  rgba(4,9,6,0.98),
           1px -1px  1px  rgba(4,9,6,0.98),
          -1px  1px  1px  rgba(4,9,6,0.98),
           0    0    7px  rgba(4,9,6,0.75);
      }
      .topo-zone-name {
        /* Regions and rivers are named the way an atlas names them: wide-tracked,
           quiet, sitting in the terrain rather than on top of it. Deliberately
           lighter than a city name so it never competes with one. */
        position: absolute;
        transform: translate(-50%, -50%);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 500;
        letter-spacing: 0.3em;
        white-space: nowrap;
        text-indent: 0.3em;
        -webkit-font-smoothing: antialiased;
        text-shadow:
           1px  0   1px rgba(4,9,6,0.95),
          -1px  0   1px rgba(4,9,6,0.95),
           0    1px 1px rgba(4,9,6,0.95),
           0   -1px 1px rgba(4,9,6,0.95),
           0    0   8px rgba(4,9,6,0.8);
        transition: opacity 200ms linear, font-size 120ms linear;
      }
      .topo-popup .leaflet-popup-content-wrapper {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      .topo-popup .leaflet-popup-content { margin: 0 !important; }
      .topo-popup .leaflet-popup-tip-container { display: none !important; }
      .leaflet-container { background: #0a140e !important; font-family: 'JetBrains Mono', monospace !important; }
      .leaflet-control-attribution { display: none !important; }
      .leaflet-control-zoom a {
        background: ${OLIVE}ee !important;
        border-color: ${KHAKI}40 !important;
        color: ${KHAKI} !important;
        font-family: 'JetBrains Mono', monospace !important;
      }
      .leaflet-control-zoom a:hover { background: ${KHAKI}22 !important; }
    `
    document.head.appendChild(style)
    styleElRef.current = style

    const map = L.map(divRef.current, {
      center:      [32.5, 35.5],
      zoom:        8,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    })

    /**
     * Stacking order, bottom to top: terrain zones, then water and rivers, then
     * their names, then routes, then the city markers and their labels, which
     * Leaflet already puts at 600 and 650. A journey is drawn ON the terrain and
     * UNDER the places it connects — it is not a UI layer floating over the map.
     */
    const PANES: Array<[string, number, boolean]> = [
      ['topoRegions',    350, true],
      ['topoFeatures',   360, true],
      ['topoZoneLabels', 370, false],
      ['topoRoutes',     450, true],
    ]
    for (const [name, z, interactive] of PANES) {
      const pane = map.createPane(name)
      pane.style.zIndex = String(z)
      if (!interactive) pane.style.pointerEvents = 'none'
    }

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map

    // Resize the names on every zoom change. 'zoom' fires continuously during a
    // pinch or wheel zoom so the type tracks the gesture instead of snapping at
    // the end of it; 'zoomend' catches the final resting value.
    const onZoom = () => {
      styleCityLabels(labelsRef.current, map.getZoom())
      styleZoneLabels(zoneLabelsRef.current, map.getZoom())
    }
    map.on('zoom', onZoom)
    map.on('zoomend', onZoom)

    switchTiles('terrain')
    buildMarkers(map, new Map(), undefined, assetImages.cities)

    return () => {
      map.off('zoom', onZoom)
      map.off('zoomend', onZoom)
      routeTimersRef.current.forEach(t => window.clearTimeout(t))
      routeTimersRef.current = []
      labelsRef.current = []
      zoneLabelsRef.current = []
      regionLayersRef.current = []
      featureLayersRef.current = []
      routeLayersRef.current = []
      legLayersRef.current = []
      map.remove()
      mapRef.current = null
      if (styleElRef.current) document.head.removeChild(styleElRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── React to container size changes ────────────────────────────────────────
  useEffect(() => {
    mapRef.current?.invalidateSize()
  }, [width, height])

  // ── React to new geo-references → rebuild layers + auto-fly ────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // A new passage clears any journey that was up. The primary view is always
    // about THIS passage; the wider movement has to be asked for again.
    clearRouteLayers()
    setActiveRouteId(null)

    // Order matters: buildMarkers resets the city-label list, and buildFeatures
    // appends its peaks to it and re-runs the declutter pass over both.
    zoneLabelsRef.current = []
    buildRegions(map, resolved.regionRefs)
    buildMarkers(map, refMap, undefined, assetImages.cities)
    buildFeatures(map, resolved.featureRefs)
    styleZoneLabels(zoneLabelsRef.current, map.getZoom())

    // No silent return. When nothing resolves, the map holds still and the panel
    // says so — see the notice in the render below. A reader who opened the map
    // deserves to know it looked.
    flyToPassage()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved])

  return (
    <div style={{ position:'relative', width, height, background:'#0a140e', overflow:'hidden' }}>
      {/* Tile layer switcher */}
      <div ref={btnGroupRef}
        style={{ position:'absolute', top:10, left:10, zIndex:1000,
          display:'flex', flexDirection:'column', gap:3 }}>
        {(Object.keys(TILE_LAYERS) as TileKey[]).map(key => (
          <button key={key} data-tkey={key}
            onClick={() => switchTiles(key)}
            style={{
              padding:'3px 8px',
              background:   key === 'terrain' ? `${KHAKI}30` : `${KHAKI}08`,
              border:       `1px solid ${key === 'terrain' ? `${KHAKI}85` : `${KHAKI}28`}`,
              borderRadius: 4,
              color:        key === 'terrain' ? KHAKI : `${KHAKI}88`,
              fontFamily:   'JetBrains Mono, monospace',
              fontSize:     7,
              letterSpacing:'0.12em',
              cursor:       'pointer',
              transition:   'all 0.15s',
            }}>
            {TILE_LAYERS[key].label}
          </button>
        ))}
      </div>

      {/* Auto-zoom indicator badge */}
      {matchedCount > 0 && (
        <div style={{
          position:'absolute', bottom:36, left:10, zIndex:1000,
          background:`${OLIVE}f0`, border:`1px solid ${KHAKI}45`,
          borderRadius:6, padding:'4px 10px',
          fontFamily:'JetBrains Mono, monospace', fontSize:7,
          color:KHAKI, letterSpacing:'0.1em',
        }}>
          ◉ {matchedCount} LOCATION{matchedCount > 1 ? 'S' : ''} MARKED
        </div>
      )}

      {/*
        The map used to fail silently: no match meant an early return and a map
        that simply sat there, leaving the reader to wonder whether it was broken.
        It now says what happened, and names the places it could not place.
      */}
      {matchedCount === 0 && (geoReferences?.length ?? 0) > 0 && (
        <div style={{
          position:'absolute', bottom:36, left:10, right:10, zIndex:1000,
          maxWidth:340,
          background:`${OLIVE}f0`, border:`1px solid ${KHAKI}30`,
          borderRadius:6, padding:'6px 10px',
          fontFamily:'JetBrains Mono, monospace', fontSize:7,
          color:KHAKI, letterSpacing:'0.1em', lineHeight:1.7,
        }}>
          <div style={{ opacity:0.85 }}>◌ NO MAPPED LOCATION FOR THIS PASSAGE</div>
          {resolved.unmatched.length > 0 && (
            <div style={{ opacity:0.5, marginTop:2, letterSpacing:'0.06em' }}>
              NOT ON THE MAP — {resolved.unmatched.slice(0, 4).join(' · ').toUpperCase()}
              {resolved.unmatched.length > 4 ? ` +${resolved.unmatched.length - 4}` : ''}
            </div>
          )}
        </div>
      )}

      {/*
        The journey control. Off by default, and only offered at all when the open
        passage sits inside a route's scope — the primary view stays about THIS
        passage and the wider movement is one deliberate click away.
      */}
      {availableRoute && (
        <div style={{
          position:'absolute', top:10, right:10, zIndex:1000,
          display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6,
          maxWidth:'min(300px, calc(100% - 20px))',
        }}>
          <button
            onClick={() => toggleRoute(availableRoute)}
            style={{
              textAlign:'right',
              padding:'5px 10px',
              background:   activeRoute ? `${GOLD}22` : `${KHAKI}0c`,
              border:       `1px solid ${activeRoute ? `${GOLD}70` : `${KHAKI}35`}`,
              borderRadius: 5,
              color:        activeRoute ? GOLD : KHAKI,
              cursor:       'pointer',
              transition:   'all 0.15s',
            }}>
            <div style={{
              fontFamily:'JetBrains Mono, monospace', fontSize:7,
              letterSpacing:'0.16em', opacity:0.75,
            }}>
              {activeRoute ? 'HIDE THE JOURNEY' : 'SHOW THE JOURNEY'}
            </div>
            <div style={{
              fontFamily:"'Crimson Pro', serif", fontSize:12.5,
              lineHeight:1.3, marginTop:1,
            }}>
              {availableRoute.name}
            </div>
          </button>

          {activeRoute && (
            <div style={{
              width:'100%',
              background:`${OLIVE}f2`, border:`1px solid ${KHAKI}30`,
              borderRadius:6, padding:'8px 10px',
              maxHeight:260, overflowY:'auto',
            }}>
              <div style={{
                fontFamily:'JetBrains Mono, monospace', fontSize:6.5,
                letterSpacing:'0.14em', color:KHAKI, opacity:0.5,
              }}>
                {activeRoute.scope} · {activeRoute.confidence.toUpperCase()}
              </div>

              {/* Confidence is shown, not hidden. */}
              {activeRoute.confidence === 'disputed' && activeRoute.disputedNote && (
                <div style={{
                  fontFamily:"'Crimson Pro', serif", fontSize:11,
                  color:KHAKI, opacity:0.72, lineHeight:1.5,
                  marginTop:6, paddingLeft:7, borderLeft:`2px solid ${GOLD}40`,
                }}>
                  {activeRoute.disputedNote}
                </div>
              )}

              <div style={{ marginTop:7, display:'flex', flexDirection:'column', gap:1 }}>
                {activeRoute.legs.map((leg, i) => (
                  <button key={`${leg.from}-${leg.to}-${i}`}
                    onClick={() => openLeg(i)}
                    style={{
                      textAlign:'left', width:'100%',
                      background:'transparent', border:'none',
                      borderRadius:3, padding:'3px 4px',
                      color:KHAKI, cursor:'pointer',
                    }}>
                    <span style={{
                      fontFamily:'JetBrains Mono, monospace', fontSize:6.5,
                      letterSpacing:'0.1em', opacity:0.45, marginRight:5,
                    }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontFamily:"'Crimson Pro', serif", fontSize:11.5, opacity:0.9 }}>
                      {leg.from} → {leg.to}
                    </span>
                    <span style={{
                      fontFamily:'JetBrains Mono, monospace', fontSize:6.5,
                      letterSpacing:'0.08em', opacity:0.4, marginLeft:5,
                    }}>
                      {leg.ref}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Map div — filter applied here so it doesn't create stacking context issues inside Leaflet's panes */}
      <div ref={divRef} style={{ width:'100%', height:'100%', filter: tileFilter }} />
    </div>
  )
}
