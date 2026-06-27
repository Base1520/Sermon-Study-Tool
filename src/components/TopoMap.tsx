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
  { name: 'Jerusalem',    lon: 35.22, lat: 31.78, region: 'canaan',      tier: 1, aliases: ['zion','city of david','salem'] },
  { name: 'Jericho',      lon: 35.45, lat: 31.86, region: 'canaan',      tier: 1 },
  { name: 'Bethlehem',    lon: 35.20, lat: 31.70, region: 'canaan',      tier: 2 },
  { name: 'Hebron',       lon: 35.10, lat: 31.53, region: 'canaan',      tier: 2 },
  { name: 'Beersheba',    lon: 34.80, lat: 31.25, region: 'canaan',      tier: 2 },
  { name: 'Gaza',         lon: 34.47, lat: 31.51, region: 'canaan',      tier: 2 },
  { name: 'Joppa',        lon: 34.75, lat: 32.05, region: 'canaan',      tier: 2, aliases: ['jaffa'] },
  { name: 'Caesarea',     lon: 34.89, lat: 32.50, region: 'canaan',      tier: 2 },
  { name: 'Samaria',      lon: 35.20, lat: 32.27, region: 'canaan',      tier: 2 },
  { name: 'Shechem',      lon: 35.28, lat: 32.21, region: 'canaan',      tier: 3 },
  { name: 'Nazareth',     lon: 35.30, lat: 32.70, region: 'canaan',      tier: 1 },
  { name: 'Capernaum',    lon: 35.57, lat: 32.88, region: 'canaan',      tier: 2 },
  { name: 'Megiddo',      lon: 35.18, lat: 32.58, region: 'canaan',      tier: 2 },
  { name: 'Bethel',       lon: 35.22, lat: 31.93, region: 'canaan',      tier: 3 },
  { name: 'Shiloh',       lon: 35.29, lat: 32.06, region: 'canaan',      tier: 3 },
  { name: 'Gilgal',       lon: 35.47, lat: 31.88, region: 'canaan',      tier: 3 },
  { name: 'Dan',          lon: 35.65, lat: 33.25, region: 'canaan',      tier: 2 },
  { name: 'Ai',           lon: 35.28, lat: 31.92, region: 'canaan',      tier: 3 },
  { name: 'Mizpah',       lon: 35.21, lat: 31.85, region: 'canaan',      tier: 3 },
  { name: 'Tyre',         lon: 35.19, lat: 33.27, region: 'canaan',      tier: 1 },
  { name: 'Sidon',        lon: 35.37, lat: 33.56, region: 'canaan',      tier: 2 },
  { name: 'Damascus',     lon: 36.30, lat: 33.51, region: 'canaan',      tier: 1 },
  { name: 'Antioch',      lon: 36.16, lat: 36.20, region: 'anatolia',    tier: 1 },
  { name: 'Ephesus',      lon: 27.34, lat: 37.94, region: 'anatolia',    tier: 1 },
  { name: 'Smyrna',       lon: 27.14, lat: 38.42, region: 'anatolia',    tier: 2 },
  { name: 'Pergamum',     lon: 27.18, lat: 39.12, region: 'anatolia',    tier: 2 },
  { name: 'Haran',        lon: 39.02, lat: 36.86, region: 'anatolia',    tier: 1 },
  { name: 'Carchemish',   lon: 38.01, lat: 36.83, region: 'anatolia',    tier: 2 },
  { name: 'Tarsus',       lon: 34.90, lat: 36.92, region: 'anatolia',    tier: 2 },
  { name: 'Nineveh',      lon: 43.15, lat: 36.36, region: 'mesopotamia', tier: 1 },
  { name: 'Assur',        lon: 43.26, lat: 35.46, region: 'mesopotamia', tier: 2 },
  { name: 'Babylon',      lon: 44.42, lat: 32.54, region: 'mesopotamia', tier: 1 },
  { name: 'Ur',           lon: 46.10, lat: 30.96, region: 'mesopotamia', tier: 1 },
  { name: 'Susa',         lon: 48.26, lat: 32.19, region: 'persia',      tier: 1, aliases: ['shushan'] },
  { name: 'Persepolis',   lon: 52.89, lat: 29.94, region: 'persia',      tier: 2 },
  { name: 'Alexandria',   lon: 29.92, lat: 31.20, region: 'egypt',       tier: 1 },
  { name: 'Memphis',      lon: 31.25, lat: 29.85, region: 'egypt',       tier: 1, aliases: ['noph'] },
  { name: 'Thebes',       lon: 32.64, lat: 25.70, region: 'egypt',       tier: 2, aliases: ['no','no-amon'] },
  { name: 'Mt. Sinai',    lon: 33.97, lat: 28.54, region: 'egypt',       tier: 1, aliases: ['horeb','sinai'] },
  { name: 'Goshen',       lon: 31.90, lat: 30.60, region: 'egypt',       tier: 2 },
  { name: 'Rome',         lon: 12.50, lat: 41.90, region: 'roman',       tier: 1 },
  { name: 'Corinth',      lon: 22.88, lat: 37.91, region: 'roman',       tier: 1 },
  { name: 'Athens',       lon: 23.73, lat: 37.98, region: 'roman',       tier: 1 },
  { name: 'Thessalonica', lon: 22.95, lat: 40.63, region: 'roman',       tier: 2 },
  { name: 'Philippi',     lon: 24.28, lat: 41.01, region: 'roman',       tier: 2 },
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
}

// ── Component ──────────────────────────────────────────────────────────────────
export function TopoMap({ geoReferences, width, height }: TopoMapProps) {
  const divRef      = useRef<HTMLDivElement>(null)
  const mapRef      = useRef<L.Map | null>(null)
  const tileRef     = useRef<L.TileLayer | null>(null)
  const markersRef  = useRef<L.Marker[]>([])
  const activeKey   = useRef<TileKey>('terrain')
  const styleElRef  = useRef<HTMLStyleElement | null>(null)
  const btnGroupRef = useRef<HTMLDivElement>(null)
  const [tileFilter, setTileFilter] = useState<string>(TILE_LAYERS.terrain.filter)
  const assetImages = useAssetImages()

  // Derive referenced cities
  const refMap = useMemo(() => {
    const m = new Map<string, GeoRef>()
    for (const r of geoReferences) {
      const city = TOPO_CITIES.find(c =>
        c.name.toLowerCase() === r.place.toLowerCase() ||
        (c.aliases ?? []).some(a => a === r.place.toLowerCase())
      )
      if (city) m.set(city.name, r)
    }
    return m
  }, [geoReferences])

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

    for (const city of TOPO_CITIES) {
      const ref    = refs.get(city.name)
      const isHL   = !!ref
      const isSel  = city.name === selectedName
      const fill   = isSel ? GOLD : isHL ? KHAKI : `${KHAKI}60`
      const icon   = makeIcon(fill, isHL && !isSel, isSel)
      const marker = L.marker([city.lat, city.lon], { icon })

      marker.addTo(map)

      // City name label — always visible, size/opacity by tier
      const labelColor  = isSel ? GOLD : isHL ? KHAKI : city.tier === 1 ? `${KHAKI}ee` : city.tier === 2 ? `${KHAKI}bb` : `${KHAKI}88`
      const labelSize   = isSel || isHL ? 10 : city.tier === 1 ? 9.5 : city.tier === 2 ? 8.5 : 7.5
      const bgOpacity   = isSel || isHL ? 0.82 : city.tier === 1 ? 0.72 : 0.58
      marker.bindTooltip(`
        <span style="
          font-family:'JetBrains Mono',monospace;
          font-size:${labelSize}px;
          letter-spacing:0.07em;
          color:${labelColor};
          background:rgba(10,16,8,${bgOpacity});
          padding:1px 4px;
          border-radius:2px;
          white-space:nowrap;
          display:inline-block;
        ">${city.name.toUpperCase()}</span>
      `, {
        permanent:  true,
        direction:  city.lon < 35 ? 'left' : 'right',
        offset:     city.lon < 35 ? [-14, 0] : [14, 0],
        className:  'topo-tt',
        opacity:    1,
      })

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

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map

    switchTiles('terrain')
    buildMarkers(map, new Map(), undefined, assetImages.cities)

    return () => {
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

  // ── React to new geo-references → rebuild markers + auto-fly ───────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    buildMarkers(map, refMap, undefined, assetImages.cities)

    if (refMap.size === 0) return

    const matched = TOPO_CITIES.filter(c => refMap.has(c.name))
    if (matched.length === 0) return

    if (matched.length === 1) {
      const { lat, lon } = matched[0]
      map.flyTo([lat, lon], 12, { duration: 1.8, easeLinearity: 0.25 })
    } else {
      const lats = matched.map(c => c.lat)
      const lons = matched.map(c => c.lon)
      const sw: L.LatLngTuple = [Math.min(...lats) - 0.4, Math.min(...lons) - 0.4]
      const ne: L.LatLngTuple = [Math.max(...lats) + 0.4, Math.max(...lons) + 0.4]
      map.flyToBounds(L.latLngBounds(sw, ne), {
        padding:       [60, 60],
        maxZoom:       13,
        duration:      1.8,
        easeLinearity: 0.22,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refMap])

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
      {refMap.size > 0 && (
        <div style={{
          position:'absolute', bottom:36, left:10, zIndex:1000,
          background:`${OLIVE}f0`, border:`1px solid ${KHAKI}45`,
          borderRadius:6, padding:'4px 10px',
          fontFamily:'JetBrains Mono, monospace', fontSize:7,
          color:KHAKI, letterSpacing:'0.1em',
        }}>
          ◉ {refMap.size} LOCATION{refMap.size > 1 ? 'S' : ''} MARKED
        </div>
      )}

      {/* Map div — filter applied here so it doesn't create stacking context issues inside Leaflet's panes */}
      <div ref={divRef} style={{ width:'100%', height:'100%', filter: tileFilter }} />
    </div>
  )
}
