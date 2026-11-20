import { useCallback, useEffect, useState } from 'react'
import { MapView } from './components/MapView'
import { PointPanel } from './components/PointPanel'
import { Sidebar } from './components/Sidebar'
import { repository } from './storage/database'
import { ValidationError } from './storage/validation'
import type { MapList, MapPoint, PointFields } from './types/data'
import type { Coordinates, MapSourceMode } from './types/map'
import { initialMapSourceState, type MapSourceState } from './config/mapSourceSwitch'
import { createMapData, MAX_MAPDATA_BYTES, parseMapData, safeMapDataFilename, type MapDataContent } from './exchange/mapdata'

function messageFrom(error: unknown) {
  if (error instanceof ValidationError || error instanceof Error) return error.message
  return 'Failed to save changes.'
}

export default function App() {
  const [requestedMode, setRequestedMode] = useState<MapSourceMode>(() => localStorage.getItem('geolists.mapMode') === 'local' ? 'local' : 'online')
  const [mapSourceState, setMapSourceState] = useState<MapSourceState>(() => initialMapSourceState(requestedMode, ''))
  const [mapRevision, setMapRevision] = useState('')
  const requestMapMode = (next: MapSourceMode): void => setRequestedMode(next)
  const handleMapSourceState = useCallback((next: MapSourceState) => {
    setMapSourceState(next)
    if (next.phase === 'active' && next.activeMode) {
      localStorage.setItem('geolists.mapMode', next.activeMode)
    }
  }, [])
  const [lists, setLists] = useState<MapList[]>([])
  const [points, setPoints] = useState<MapPoint[]>([])
  const [pointCounts, setPointCounts] = useState<Record<string, number>>({})
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [draftCoordinates, setDraftCoordinates] = useState<Coordinates | null>(null)
  const [editingPoint, setEditingPoint] = useState<MapPoint | null>(null)
  const [focusedPoint, setFocusedPoint] = useState<MapPoint | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<MapDataContent | null>(null)

  const refreshLists = useCallback(async () => {
    const { lists: nextLists, pointCounts: nextPointCounts } = await repository.getListsWithPointCounts()
    setLists(nextLists)
    setPointCounts(nextPointCounts)
    setActiveListId((current) => current && nextLists.some((list: MapList) => list.id === current) ? current : nextLists[0]?.id ?? null)
  }, [])

  useEffect(() => {
    void refreshLists().catch((reason: unknown) => setError(messageFrom(reason))).finally(() => setLoading(false))
  }, [refreshLists])

  useEffect(() => {
    setDraftCoordinates(null)
    setEditingPoint(null)
    setFocusedPoint(null)
    if (!activeListId) { setPoints([]); return }
    void repository.getPoints(activeListId).then(setPoints).catch((reason: unknown) => setError(messageFrom(reason)))
  }, [activeListId])

  const createList = async () => {
    const name = window.prompt('New list name')
    if (name === null) return
    try {
      setError(null)
      const list = await repository.createList(name)
      await refreshLists()
      setActiveListId(list.id)
    } catch (reason) { setError(messageFrom(reason)) }
  }

  const renameList = async (list: MapList) => {
    const name = window.prompt('New list name', list.name)
    if (name === null) return
    try { setError(null); await repository.renameList(list.id, name); await refreshLists() } catch (reason) { setError(messageFrom(reason)) }
  }

  const deleteList = async (list: MapList) => {
    if (!window.confirm(`Delete the list “${list.name}” and all its points?`)) return
    try { setError(null); await repository.deleteList(list.id); await refreshLists() } catch (reason) { setError(messageFrom(reason)) }
  }

  const savePoint = async (fields: PointFields) => {
    if (!activeListId) return
    setSaving(true)
    setError(null)
    try {
      if (editingPoint) {
        const updatedPoint = await repository.updatePoint(activeListId, editingPoint.id, fields)
        setPoints((current) => current.map((point) => point.id === updatedPoint.id ? updatedPoint : point))
        setFocusedPoint((current) => current?.id === updatedPoint.id ? updatedPoint : current)
      } else {
        const createdPoint = await repository.createPoint(activeListId, fields)
        setPoints((current) => [...current, createdPoint])
        setPointCounts((current) => ({ ...current, [activeListId]: (current[activeListId] ?? 0) + 1 }))
      }

      setDraftCoordinates(null)
      setEditingPoint(null)
    } catch (reason) { setError(messageFrom(reason)) } finally { setSaving(false) }
  }

  const deletePoint = async () => {
    if (!activeListId || !editingPoint || !window.confirm(`Delete the point “${editingPoint.name}”?`)) return
    try {
      setError(null)
      await repository.deletePoint(activeListId, editingPoint.id)
      setPoints((current) => current.filter((point) => point.id !== editingPoint.id))
      setPointCounts((current) => ({ ...current, [activeListId]: Math.max(0, (current[activeListId] ?? 0) - 1) }))
      setEditingPoint(null)
      setFocusedPoint(null)
    } catch (reason) { setError(messageFrom(reason)) }
  }

  const openPoint = (point: MapPoint) => {
    setError(null)
    setDraftCoordinates(null)
    setEditingPoint(point)
    setFocusedPoint(point)
  }

  const exportList = async () => {
    const list = lists.find((candidate) => candidate.id === activeListId)
    if (!list) return
    const requestedName = window.prompt('Export file name', list.name)
    if (requestedName === null) return
    try {
      setError(null)
      const contents = await createMapData(list, await repository.getPoints(list.id))
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = safeMapDataFilename(requestedName)
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (reason) { setError(messageFrom(reason)) }
  }

  const prepareImport = async (file: File) => {
    try {
      setError(null)
      if (file.size > MAX_MAPDATA_BYTES) throw new Error('File size exceeds 10 MB.')
      setImportPreview(await parseMapData(await file.text()))
    } catch (reason) { setImportPreview(null); setError(messageFrom(reason)) }
  }

  const confirmImport = async () => {
    if (!importPreview) return
    setSaving(true)
    try {
      setError(null)
      const imported = await repository.importMapData(importPreview)
      setImportPreview(null)
      await refreshLists()
      setActiveListId(imported.id)
    } catch (reason) { setError(messageFrom(reason)) } finally { setSaving(false) }
  }

  const panelCoordinates = editingPoint ?? draftCoordinates
  return <div className="app-shell">
    <Sidebar requestedMode={requestedMode} mapSourceState={mapSourceState} lists={lists} pointCounts={pointCounts} activeListId={activeListId} points={points} loading={loading} onModeChange={requestMapMode} onCreateList={() => void createList()} onSelectList={setActiveListId} onRenameList={(list) => void renameList(list)} onDeleteList={(list) => void deleteList(list)} onOpenPoint={openPoint} onExport={() => void exportList()} onImport={(file) => void prepareImport(file)} onMapInstalled={(version) => { setMapRevision(version); requestMapMode('local') }} />
    <MapView requestedMode={requestedMode} mapRevision={mapRevision} points={points} activeListId={activeListId} focusedPoint={focusedPoint} onMapClick={(coordinates) => { setError(null); setEditingPoint(null); setDraftCoordinates(coordinates) }} onPointOpen={openPoint} onRequestOnline={() => requestMapMode('online')} onSourceStateChange={handleMapSourceState} />
    {error && !panelCoordinates && <div className="app-error" role="alert">{error}<button type="button" onClick={() => setError(null)}>×</button></div>}
    {panelCoordinates && <PointPanel point={editingPoint} coordinates={panelCoordinates} error={error} saving={saving} onClose={() => { setDraftCoordinates(null); setEditingPoint(null); setError(null) }} onSave={(fields) => void savePoint(fields)} onDelete={editingPoint ? () => void deletePoint() : null} />}
    {importPreview && <div className="panel-backdrop"><section className="import-preview" role="dialog" aria-modal="true" aria-labelledby="import-title"><h2 id="import-title">Import preview</h2><dl><div><dt>List name</dt><dd>{importPreview.list.name}</dd></div><div><dt>Number of points</dt><dd>{importPreview.points.length}</dd></div></dl><p>The list and its points will be added with new identifiers. Existing data will not be changed.</p>{error && <p className="form-error">{error}</p>}<div className="form-actions"><span /><button className="secondary-button" type="button" onClick={() => setImportPreview(null)}>Cancel</button><button className="primary-button" type="button" disabled={saving} onClick={() => void confirmImport()}>{saving ? 'Importing…' : 'Import'}</button></div></section></div>}
  </div>
}
