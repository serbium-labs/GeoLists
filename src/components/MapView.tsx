import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { Marker, NavigationControl, type Map as MapLibreMap } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMapStyle, hasLocalArchive } from '../config/mapSources'
import { versionMapLibreWorkerUrl } from '../config/mapWorker'
import type { MapPoint } from '../types/data'
import type { Coordinates, MapSourceMode } from '../types/map'

const SPB_CENTER: [number, number] = [30.3351, 59.9343]
maplibregl.setWorkerUrl(versionMapLibreWorkerUrl(maplibreWorkerUrl))
const EMPTY_STYLE = { version: 8 as const, sources: {}, layers: [{ id: 'unavailable', type: 'background' as const, paint: { 'background-color': '#e5e9e4' } }] }

interface Props {
  mode: MapSourceMode
  points: MapPoint[]
  activeListId: string | null
  focusedPoint: MapPoint | null
  onMapClick: (point: Coordinates) => void
  onPointOpen: (point: MapPoint) => void
  onRequestOnline: () => void
}

export function MapView({ mode, points, activeListId, focusedPoint, onMapClick, onPointOpen, onRequestOnline }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef(new Map<string, Marker>())
  const onMapClickRef = useRef(onMapClick)
  const onPointOpenRef = useRef(onPointOpen)
  const pointsRef = useRef(points)
  const activeListIdRef = useRef(activeListId)
  const appliedModeRef = useRef<MapSourceMode | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { onPointOpenRef.current = onPointOpen }, [onPointOpen])
  useEffect(() => { pointsRef.current = points }, [points])
  useEffect(() => { activeListIdRef.current = activeListId }, [activeListId])
  useEffect(() => {
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)
    return () => maplibregl.removeProtocol('pmtiles')
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({ container: containerRef.current, style: EMPTY_STYLE, center: SPB_CENTER, zoom: 11, attributionControl: { compact: true }, locale: { 'NavigationControl.ZoomIn': 'Увеличить масштаб', 'NavigationControl.ZoomOut': 'Уменьшить масштаб', 'NavigationControl.ResetBearing': 'Сбросить поворот' } })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.on('click', (event) => {
      if (activeListIdRef.current) onMapClickRef.current({ longitude: event.lngLat.lng, latitude: event.lngLat.lat })
    })
    map.on('error', (event) => { if (event.error?.message) setError(`Не удалось загрузить карту: ${event.error.message}`) })
    mapRef.current = map
    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || appliedModeRef.current === mode) return
    const controller = new AbortController()
    const applySource = async () => {
      if (mode === 'local' && !(await hasLocalArchive(controller.signal))) {
        map.setStyle(EMPTY_STYLE)
        appliedModeRef.current = 'local'
        setError('Локальная карта не найдена. Добавьте настоящий архив public/maps/spb.pmtiles или переключитесь на онлайн-карту.')
        return
      }
      if (!controller.signal.aborted) { setError(null); map.setStyle(getMapStyle(mode)); appliedModeRef.current = mode }
    }
    void applySource().catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError('Не удалось переключить источник карты.') })
    return () => controller.abort()
  }, [mode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const visibleIds = new Set(points.map((point) => point.id))
    markersRef.current.forEach((marker, id) => {
      if (!visibleIds.has(id)) { marker.remove(); markersRef.current.delete(id) }
    })
    points.forEach((point) => {
      const position: [number, number] = [point.longitude, point.latitude]
      const existing = markersRef.current.get(point.id)
      if (existing) { existing.setLngLat(position); existing.getElement().setAttribute('aria-label', point.name); return }
      const element = document.createElement('button')
      element.className = 'point-marker'
      element.type = 'button'
      element.setAttribute('aria-label', point.name)
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        const current = pointsRef.current.find((candidate) => candidate.id === point.id)
        if (current) onPointOpenRef.current(current)
      })
      markersRef.current.set(point.id, new Marker({ element, anchor: 'bottom' }).setLngLat(position).addTo(map))
    })
  }, [points, activeListId])

  useEffect(() => {
    if (!focusedPoint || !mapRef.current) return
    mapRef.current.flyTo({ center: [focusedPoint.longitude, focusedPoint.latitude], zoom: Math.max(mapRef.current.getZoom(), 15) })
  }, [focusedPoint])

  return <main className="map-area">
    <div ref={containerRef} className="map-container" aria-label="Интерактивная карта Санкт-Петербурга" />
    {error && <div className="map-error" role="alert"><strong>Карта недоступна</strong><span>{error}</span>{mode === 'local' && <button type="button" onClick={onRequestOnline}>Перейти на онлайн-карту</button>}</div>}
    {!activeListId && <div className="map-hint">Создайте или выберите список, чтобы добавлять точки</div>}
  </main>
}
