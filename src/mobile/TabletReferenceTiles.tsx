import { lazy, Suspense } from 'react'
import type { PhrasingAnalysis } from '../types/phrasing'
import type { TabletDeskTileKind } from './tabletDeskModel'
import '../leaflet.css'

const TopoMap = lazy(() => import('../components/TopoMap').then((module) => ({ default: module.TopoMap })))
const LineageViewer = lazy(() => import('../components/LineageViewer'))
const MonarchyCard = lazy(() => import('../components/MonarchyCard').then((module) => ({ default: module.MonarchyCard })))
const WorshipStructure = lazy(() => import('../components/WorshipStructure'))

function LoadingReference({ label }: { label: string }) {
  return <div className="tablet-reference-loading"><i /><span>LOADING {label}</span></div>
}

export function TabletReferenceTile({
  kind,
  reference,
  analysis,
  width,
  height,
}: {
  kind: Extract<TabletDeskTileKind, 'map' | 'lineage' | 'timeline' | 'temple'>
  reference: string
  analysis: PhrasingAnalysis
  width: number
  height: number
}) {
  const contentWidth = Math.max(280, width)
  const contentHeight = Math.max(220, height)
  return (
    <div className="tablet-reference-surface nodrag nowheel nopan">
      <Suspense fallback={<LoadingReference label={kind.toUpperCase()} />}>
        {kind === 'map' && <TopoMap
          geoReferences={analysis.geoReferences || []}
          passageRef={reference}
          width={contentWidth}
          height={contentHeight}
        />}
        {kind === 'lineage' && <LineageViewer width={contentWidth} height={contentHeight} />}
        {kind === 'timeline' && <MonarchyCard reference={reference} width={contentWidth} height={contentHeight} />}
        {kind === 'temple' && <WorshipStructure width={contentWidth} height={contentHeight} />}
      </Suspense>
    </div>
  )
}
