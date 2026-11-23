import { useEffect, useState, type KeyboardEvent, type ReactElement } from 'react'
import { MAP_SOURCES } from '../config/mapSources'
import type { MapList, MapPoint } from '../types/data'
import type { MapSourceMode, MapViewport, OfflineRegion } from '../types/map'
import type { MapSourceState } from '../config/mapSourceSwitch'
import { formatCoordinates } from '../utils/coordinates'
import { MapUpdates } from './MapUpdates'
import { mapSourceForKey } from './mapSourceKeyboard'
import { OfflineRegions } from './OfflineRegions'
import { pageContainingPoint, pointPage } from './Sidebar/pointPagination'
import { isPresent } from '../utils/nullish'

interface Props {
  requestedMode: MapSourceMode
  mapSourceState: MapSourceState
  lists: MapList[]
  pointCounts: Record<string, number>
  activeListId: string | null
  points: MapPoint[]
  selectedPointId: string | null
  loading: boolean
  onModeChange: (mode: MapSourceMode) => void
  onCreateList: () => void
  onSelectList: (id: string) => void
  onRenameList: (list: MapList) => void
  onDeleteList: (list: MapList) => void
  onOpenPoint: (point: MapPoint) => void
  onExport: () => void
  onImport: (file: File) => void
  onMapInstalled: (version: string) => void
  viewport: MapViewport | null
  onActiveRegion: (region: OfflineRegion | null) => void
  onRegionActivated: (region: OfflineRegion) => void
}

function mapSourceStatusText(requestedMode: MapSourceMode, state: MapSourceState): string {
  if (state.phase === 'loading') {
    return `Loading ${MAP_SOURCES[requestedMode].label} map…`
  }

  if (state.phase === 'failed') {
    const activeMessage = state.activeMode ? ` ${MAP_SOURCES[state.activeMode].label} remains active.` : ''
    return `${MAP_SOURCES[requestedMode].label} map unavailable.${activeMessage}`
  }

  return `${MAP_SOURCES[state.activeMode ?? requestedMode].label} map active.`
}

export function Sidebar(props: Props): ReactElement {
  const { requestedMode, mapSourceState, lists, pointCounts, activeListId, points, selectedPointId, loading } = props
  const [pointPageIndex, setPointPageIndex] = useState(0)
  const currentPointPage = pointPage(points, pointPageIndex)
  useEffect(() => {
    if (currentPointPage.page !== pointPageIndex) {
      setPointPageIndex(currentPointPage.page)
    }
  }, [currentPointPage.page, pointPageIndex])

  useEffect(() => {
    if (!selectedPointId) {
      return
    }

    const selectedPage = pageContainingPoint(points, selectedPointId)
    if (isPresent(selectedPage)) {
      setPointPageIndex(selectedPage)
    }
  }, [points, selectedPointId])

  useEffect(() => {
    if (!selectedPointId) {
      return
    }

    document.getElementById(`point-entry-${selectedPointId}`)?.scrollIntoView({ block: 'nearest' })
  }, [currentPointPage.page, selectedPointId])

  const handleMapSourceKeyDown = (sourceMode: MapSourceMode, event: KeyboardEvent<HTMLButtonElement>): void => {
    const nextMode = mapSourceForKey(sourceMode, event.key)
    if (!nextMode) {
      return
    }

    event.preventDefault()
    props.onModeChange(nextMode)
    document.getElementById(`map-source-${nextMode}`)?.focus()
  }
  return <aside className="sidebar">
    <header className="brand"><div className="brand-mark" aria-hidden="true">G</div><div><h1>GeoLists</h1><p>Offline maps anywhere</p></div></header>
    <section className="sidebar-section lists-section">
      <div className="section-heading"><h2>My lists</h2><span>{lists.length}</span></div>
      {loading ? <div className="list-skeleton" role="status" aria-live="polite" aria-label="Loading lists"><span /><span /><span /></div> : lists.length === 0 ? <div className="empty-state"><span className="pin-outline" aria-hidden="true" /><p>No lists yet</p></div> : <div className="list-stack">
        {lists.map((list) => <div className={`list-row ${activeListId === list.id ? 'active' : ''}`} key={list.id}>
          <button className="list-select" type="button" aria-current={activeListId === list.id ? 'true' : undefined} aria-label={`${list.name}, ${pointCounts[list.id] ?? 0} points`} onClick={() => props.onSelectList(list.id)}><span>{list.name}</span><small aria-hidden="true">{pointCounts[list.id] ?? 0}</small></button>
          <button className="icon-button" type="button" aria-label={`Rename ${list.name}`} onClick={() => props.onRenameList(list)}>✎</button>
          <button className="icon-button danger" type="button" aria-label={`Delete ${list.name}`} onClick={() => props.onDeleteList(list)}>×</button>
        </div>)}
      </div>}
      <button className="create-button" type="button" onClick={props.onCreateList}>+ Create list</button>
      <div className="exchange-actions">
        <button type="button" disabled={!activeListId} onClick={props.onExport}>Export</button>
        <label>Import<input type="file" accept=".mapdata,application/json" onChange={(event) => {
          const file: File | undefined = event.target.files?.[0]

          if (file) {
            props.onImport(file)
          }

          event.currentTarget.value = ''
        }} /></label>
      </div>
    </section>

    {activeListId && <section className="sidebar-section points-section">
      <div className="section-heading"><h2>Points</h2><span>{points.length}</span></div>
      {points.length === 0 ? <p className="point-placeholder">Click the map to add a point</p> : <div className="point-list">
        {currentPointPage.items.map((point) => {
          const selected = selectedPointId === point.id
          return <button id={`point-entry-${point.id}`} key={point.id} type="button" className={selected ? 'selected' : ''} aria-current={selected ? 'true' : undefined} onClick={() => props.onOpenPoint(point)}><strong>{point.name}</strong><span>{formatCoordinates(point)}</span></button>
        })}
      </div>}
      {points.length > 0 && <div className="point-pagination" aria-label="Point list pages">
        <span>Showing {currentPointPage.startIndex + 1}–{currentPointPage.endIndex} of {points.length}</span>
        <div><button type="button" disabled={currentPointPage.page === 0} onClick={() => setPointPageIndex((page) => page - 1)}>Previous</button><span>Page {currentPointPage.page + 1} of {currentPointPage.pageCount}</span><button type="button" disabled={currentPointPage.page === currentPointPage.pageCount - 1} onClick={() => setPointPageIndex((page) => page + 1)}>Next</button></div>
      </div>}
    </section>}

    <section className="sidebar-section source-section"><h2>Map source</h2><div className="source-switch" role="radiogroup" aria-label="Map source">
      {(Object.keys(MAP_SOURCES) as MapSourceMode[]).map((sourceMode) => {
        const active = mapSourceState.activeMode === sourceMode
        const pending = mapSourceState.phase === 'loading' && requestedMode === sourceMode
        const focusable = (mapSourceState.activeMode ?? requestedMode) === sourceMode
        return <button id={`map-source-${sourceMode}`} key={sourceMode} type="button" role="radio" aria-checked={active} aria-busy={pending} tabIndex={focusable ? 0 : -1} className={`${active ? 'active' : ''} ${pending ? 'pending' : ''}`.trim()} onKeyDown={(event) => handleMapSourceKeyDown(sourceMode, event)} onClick={() => props.onModeChange(sourceMode)}>{MAP_SOURCES[sourceMode].label}</button>
      })}
    </div><p className={`source-status ${mapSourceState.phase}`} role="status">{mapSourceStatusText(requestedMode, mapSourceState)}</p><OfflineRegions viewport={props.viewport} onActiveRegion={props.onActiveRegion} onRegionActivated={props.onRegionActivated} /><MapUpdates onInstalled={props.onMapInstalled} /></section>
  </aside>
}
