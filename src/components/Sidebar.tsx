import { MAP_SOURCES } from '../config/mapSources'
import type { MapList, MapPoint } from '../types/data'
import type { MapSourceMode } from '../types/map'
import { formatCoordinates } from '../utils/coordinates'
import { MapUpdates } from './MapUpdates'

interface Props {
  mode: MapSourceMode
  lists: MapList[]
  pointCounts: Record<string, number>
  activeListId: string | null
  points: MapPoint[]
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
}

export function Sidebar(props: Props) {
  const { mode, lists, pointCounts, activeListId, points, loading } = props
  return <aside className="sidebar">
    <header className="brand"><div className="brand-mark" aria-hidden="true">G</div><div><h1>GeoLists</h1><p>Санкт-Петербург</p></div></header>
    <section className="sidebar-section lists-section">
      <div className="section-heading"><h2>Мои списки</h2><span>{lists.length}</span></div>
      {loading ? <p className="muted">Загрузка…</p> : lists.length === 0 ? <div className="empty-state"><span className="pin-outline" aria-hidden="true" /><p>Списков пока нет</p></div> : <div className="list-stack">
        {lists.map((list) => <div className={`list-row ${activeListId === list.id ? 'active' : ''}`} key={list.id}>
          <button className="list-select" type="button" onClick={() => props.onSelectList(list.id)}><span>{list.name}</span><small>{pointCounts[list.id] ?? 0}</small></button>
          <button className="icon-button" type="button" aria-label={`Переименовать ${list.name}`} onClick={() => props.onRenameList(list)}>✎</button>
          <button className="icon-button danger" type="button" aria-label={`Удалить ${list.name}`} onClick={() => props.onDeleteList(list)}>×</button>
        </div>)}
      </div>}
      <button className="create-button" type="button" onClick={props.onCreateList}>+ Создать список</button>
      <div className="exchange-actions">
        <button type="button" disabled={!activeListId} onClick={props.onExport}>Экспорт</button>
        <label>Импорт<input type="file" accept=".mapdata,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onImport(file); event.currentTarget.value = '' }} /></label>
      </div>
    </section>

    {activeListId && <section className="sidebar-section points-section">
      <div className="section-heading"><h2>Точки</h2><span>{points.length}</span></div>
      {points.length === 0 ? <p className="point-placeholder">Нажмите на карту, чтобы добавить точку</p> : <div className="point-list">
        {points.map((point) => <button key={point.id} type="button" onClick={() => props.onOpenPoint(point)}><strong>{point.name}</strong><span>{formatCoordinates(point)}</span></button>)}
      </div>}
    </section>}

    <section className="sidebar-section source-section"><h2>Источник карты</h2><div className="source-switch" role="radiogroup" aria-label="Источник карты">
      {(Object.keys(MAP_SOURCES) as MapSourceMode[]).map((sourceMode) => <button key={sourceMode} type="button" role="radio" aria-checked={mode === sourceMode} className={mode === sourceMode ? 'active' : ''} onClick={() => props.onModeChange(sourceMode)}>{MAP_SOURCES[sourceMode].label}</button>)}
    </div><MapUpdates onInstalled={props.onMapInstalled} /></section>
  </aside>
}
