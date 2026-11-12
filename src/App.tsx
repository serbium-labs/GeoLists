import { useCallback, useEffect, useState } from 'react'
import { MapView } from './components/MapView'
import { PointPanel } from './components/PointPanel'
import { Sidebar } from './components/Sidebar'
import { repository } from './storage/database'
import { ValidationError } from './storage/validation'
import type { MapList, MapPoint, PointFields } from './types/data'
import type { Coordinates, MapSourceMode } from './types/map'
import { createMapData, MAX_MAPDATA_BYTES, parseMapData, safeMapDataFilename, type MapDataContent } from './exchange/mapdata'

function messageFrom(error: unknown) {
  if (error instanceof ValidationError || error instanceof Error) return error.message
  return 'Не удалось сохранить изменения.'
}

export default function App() {
  const [mode, setMode] = useState<MapSourceMode>('online')
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
    const nextLists: MapList[] = await repository.getLists()
    const counts = await Promise.all(nextLists.map(async (list) => [list.id, (await repository.getPoints(list.id)).length] as const))
    setLists(nextLists)
    setPointCounts(Object.fromEntries(counts))
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
    const name = window.prompt('Название нового списка')
    if (name === null) return
    try {
      setError(null)
      const list = await repository.createList(name)
      await refreshLists()
      setActiveListId(list.id)
    } catch (reason) { setError(messageFrom(reason)) }
  }

  const renameList = async (list: MapList) => {
    const name = window.prompt('Новое название списка', list.name)
    if (name === null) return
    try { setError(null); await repository.renameList(list.id, name); await refreshLists() } catch (reason) { setError(messageFrom(reason)) }
  }

  const deleteList = async (list: MapList) => {
    if (!window.confirm(`Удалить список «${list.name}» и все его точки?`)) return
    try { setError(null); await repository.deleteList(list.id); await refreshLists() } catch (reason) { setError(messageFrom(reason)) }
  }

  const savePoint = async (fields: PointFields) => {
    if (!activeListId) return
    setSaving(true)
    setError(null)
    try {
      if (editingPoint) await repository.updatePoint(activeListId, editingPoint.id, fields)
      else await repository.createPoint(activeListId, fields)
      setPoints(await repository.getPoints(activeListId))
      await refreshLists()
      setDraftCoordinates(null)
      setEditingPoint(null)
    } catch (reason) { setError(messageFrom(reason)) } finally { setSaving(false) }
  }

  const deletePoint = async () => {
    if (!activeListId || !editingPoint || !window.confirm(`Удалить точку «${editingPoint.name}»?`)) return
    try {
      setError(null)
      await repository.deletePoint(activeListId, editingPoint.id)
      setPoints(await repository.getPoints(activeListId))
      await refreshLists()
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
    const requestedName = window.prompt('Имя экспортируемого файла', list.name)
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
      if (file.size > MAX_MAPDATA_BYTES) throw new Error('Размер файла превышает 10 МБ.')
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
    <Sidebar mode={mode} lists={lists} pointCounts={pointCounts} activeListId={activeListId} points={points} loading={loading} onModeChange={setMode} onCreateList={() => void createList()} onSelectList={setActiveListId} onRenameList={(list) => void renameList(list)} onDeleteList={(list) => void deleteList(list)} onOpenPoint={openPoint} onExport={() => void exportList()} onImport={(file) => void prepareImport(file)} />
    <MapView mode={mode} points={points} activeListId={activeListId} focusedPoint={focusedPoint} onMapClick={(coordinates) => { setError(null); setEditingPoint(null); setDraftCoordinates(coordinates) }} onPointOpen={openPoint} onRequestOnline={() => setMode('online')} />
    {error && !panelCoordinates && <div className="app-error" role="alert">{error}<button type="button" onClick={() => setError(null)}>×</button></div>}
    {panelCoordinates && <PointPanel point={editingPoint} coordinates={panelCoordinates} error={error} saving={saving} onClose={() => { setDraftCoordinates(null); setEditingPoint(null); setError(null) }} onSave={(fields) => void savePoint(fields)} onDelete={editingPoint ? () => void deletePoint() : null} />}
    {importPreview && <div className="panel-backdrop"><section className="import-preview" role="dialog" aria-modal="true" aria-labelledby="import-title"><h2 id="import-title">Предварительный просмотр</h2><dl><div><dt>Название списка</dt><dd>{importPreview.list.name}</dd></div><div><dt>Количество точек</dt><dd>{importPreview.points.length}</dd></div></dl><p>Список и точки будут добавлены с новыми идентификаторами. Существующие данные не изменятся.</p>{error && <p className="form-error">{error}</p>}<div className="form-actions"><span /><button className="secondary-button" type="button" onClick={() => setImportPreview(null)}>Отмена</button><button className="primary-button" type="button" disabled={saving} onClick={() => void confirmImport()}>{saving ? 'Импорт…' : 'Импортировать'}</button></div></section></div>}
  </div>
}
