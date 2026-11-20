import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { Marker, NavigationControl, type Map as MapLibreMap } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMapStyle, inspectLocalArchive, localArchiveErrorMessage } from '../config/mapSources'
import { versionMapLibreWorkerUrl } from '../config/mapWorker'
import type { MapPoint } from '../types/data'
import type { Coordinates, MapSourceMode } from '../types/map'

const SPB_CENTER: [number, number] = [30.3351, 59.9343]
maplibregl.setWorkerUrl(versionMapLibreWorkerUrl(maplibreWorkerUrl))
const EMPTY_STYLE = { version: 8 as const, sources: {}, layers: [{ id: 'unavailable', type: 'background' as const, paint: { 'background-color': '#e5e9e4' } }] }

interface Props {
  mode: MapSourceMode
  mapRevision: string
  points: MapPoint[]
  activeListId: string | null
  focusedPoint: MapPoint | null
  onMapClick: (point: Coordinates) => void
  onPointOpen: (point: MapPoint) => void
  onRequestOnline: () => void
}

export function MapView({ mode, mapRevision, points, activeListId, focusedPoint, onMapClick, onPointOpen, onRequestOnline }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef(new Map<string, Marker>())
  const onMapClickRef = useRef(onMapClick)
  const onPointOpenRef = useRef(onPointOpen)
  const pointsRef = useRef(points)
  const activeListIdRef = useRef(activeListId)
  const appliedModeRef = useRef<MapSourceMode | null>(null)
  const appliedRevisionRef = useRef('')
  const requestedModeRef = useRef(mode)
  const [error, setError] = useState<string | null>(null)
  const [loadingMap, setLoadingMap] = useState(true)

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
    const map = new maplibregl.Map({ container: containerRef.current, style: EMPTY_STYLE, center: SPB_CENTER, zoom: 11, attributionControl: { compact: true }, locale: { 'NavigationControl.ZoomIn': 'Zoom in', 'NavigationControl.ZoomOut': 'Zoom out', 'NavigationControl.ResetBearing': 'Reset bearing' } })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.on('click', (event) => {
      if (activeListIdRef.current) onMapClickRef.current({ longitude: event.lngLat.lng, latitude: event.lngLat.lat })
    })
    map.on('error', (event) => {
      const detail = event.error?.message ? ` ${event.error.message}` : ''
      const message = requestedModeRef.current === 'online'
        ? `The online map failed to load. Check your internet connection and access to OpenFreeMap.${detail}`
        : `The local map could not be displayed. Check the PMTiles archive and local server.${detail}`
      setLoadingMap(false)
      setError(message)
    })
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
    if (!map) return
    requestedModeRef.current = mode
    if (appliedModeRef.current === mode && (mode !== 'local' || appliedRevisionRef.current === mapRevision)) {
      setLoadingMap(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    const applySource = async () => {
      setLoadingMap(true)
      setError(null)
      if (mode === 'local') {
        const archive = await inspectLocalArchive(controller.signal, mapRevision)
        if (!archive.available) {
          setLoadingMap(false)
          setError(localArchiveErrorMessage(archive))
          return
        }
      }
      if (!controller.signal.aborted) {
        map.once('style.load', () => {
          if (requestedModeRef.current !== mode) return
          appliedModeRef.current = mode
          appliedRevisionRef.current = mapRevision
          setLoadingMap(false)
          setError(null)
        })
        map.setStyle(getMapStyle(mode, mapRevision))
      }
    }
    void applySource().catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setLoadingMap(false)
      setError(mode === 'online' ? 'Could not connect to the online map.' : 'Could not connect to the local map.')
    })
    return () => controller.abort()
  }, [mode, mapRevision])

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
      if (existing) { existing.setLngLat(position); existing.getElement().setAttribute('aria-label', `Open ${point.name}`); return }
      const element = document.createElement('button')
      element.className = 'point-marker'
      element.type = 'button'
      element.setAttribute('aria-label', `Open ${point.name}`)
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

  return <main className="map-area" aria-label="Map">
    <div ref={containerRef} className="map-container" aria-label="Interactive map of Saint Petersburg" />
    {loadingMap && !error && <div className="map-loading" role="status" aria-live="polite">Loading {mode === 'online' ? 'online map' : 'local map'}…</div>}
    {error && <div className="map-error" role="alert"><strong>Map unavailable</strong><span>{error}</span>{mode === 'local' && <button type="button" onClick={onRequestOnline}>Switch to online map</button>}</div>}
    {!activeListId && <div className="map-hint" role="status">Create or select a list to add points</div>}
  </main>
}
