import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { Marker, NavigationControl, type Map as MapLibreMap } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMapStyle, inspectLocalArchive, localArchiveErrorMessage } from '../config/mapSources'
import {
  beginMapSourceSwitch,
  completeMapSourceSwitch,
  failMapSourceSwitch,
  initialMapSourceState,
  isMapSourceActive,
  type MapSourceState,
} from '../config/mapSourceSwitch'
import { versionMapLibreWorkerUrl } from '../config/mapWorker'
import type { MapPoint } from '../types/data'
import type { Coordinates, MapSourceMode } from '../types/map'

const SPB_CENTER: [number, number] = [30.3351, 59.9343]
const STYLE_LOAD_TIMEOUT_MS = 15_000
maplibregl.setWorkerUrl(versionMapLibreWorkerUrl(maplibreWorkerUrl))
const EMPTY_STYLE = { version: 8 as const, sources: {}, layers: [{ id: 'unavailable', type: 'background' as const, paint: { 'background-color': '#e5e9e4' } }] }

interface Props {
  requestedMode: MapSourceMode
  mapRevision: string
  points: MapPoint[]
  activeListId: string | null
  focusedPoint: MapPoint | null
  onMapClick: (point: Coordinates) => void
  onPointOpen: (point: MapPoint) => void
  onRequestOnline: () => void
  onSourceStateChange: (state: MapSourceState) => void
}

export function MapView({ requestedMode, mapRevision, points, activeListId, focusedPoint, onMapClick, onPointOpen, onRequestOnline, onSourceStateChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef(new Map<string, Marker>())
  const onMapClickRef = useRef(onMapClick)
  const onPointOpenRef = useRef(onPointOpen)
  const pointsRef = useRef(points)
  const activeListIdRef = useRef(activeListId)
  const sourceStateRef = useRef(initialMapSourceState(requestedMode, mapRevision))
  const activeStyleRef = useRef<ReturnType<MapLibreMap['getStyle']> | null>(null)
  const onSourceStateChangeRef = useRef(onSourceStateChange)
  const [sourceState, setSourceState] = useState(sourceStateRef.current)

  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { onPointOpenRef.current = onPointOpen }, [onPointOpen])
  useEffect(() => { pointsRef.current = points }, [points])
  useEffect(() => { activeListIdRef.current = activeListId }, [activeListId])
  useEffect(() => { onSourceStateChangeRef.current = onSourceStateChange }, [onSourceStateChange])
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
    if (!map) {
      return
    }
    const currentMap: MapLibreMap = map
    const started = beginMapSourceSwitch(sourceStateRef.current, requestedMode, mapRevision)
    sourceStateRef.current = started
    setSourceState(started)
    onSourceStateChangeRef.current(started)
    if (isMapSourceActive(started, requestedMode, mapRevision)) {
      const completed = completeMapSourceSwitch(started, started.requestId)
      sourceStateRef.current = completed
      setSourceState(completed)
      onSourceStateChangeRef.current(completed)
      return
    }

    const requestId = started.requestId
    const controller = new AbortController()
    let styleLoadTimer: number | undefined
    let listeningForStyle = false
    let disposed = false

    const stopWaitingForStyle = (): void => {
      if (styleLoadTimer !== undefined) {
        window.clearTimeout(styleLoadTimer)
      }
      if (listeningForStyle) {
        currentMap.off('style.load', handleStyleLoad)
      }
      styleLoadTimer = undefined
      listeningForStyle = false
    }

    const restoreActiveStyle = (): void => {
      const fallbackStyle = activeStyleRef.current
      currentMap.setStyle(fallbackStyle ?? EMPTY_STYLE)
    }

    const fail = (message: string): void => {
      if (disposed) {
        return
      }
      const failed = failMapSourceSwitch(sourceStateRef.current, requestId, message)
      if (failed === sourceStateRef.current) {
        return
      }
      stopWaitingForStyle()
      sourceStateRef.current = failed
      setSourceState(failed)
      onSourceStateChangeRef.current(failed)
      restoreActiveStyle()
    }

    function handleStyleLoad(): void {
      if (disposed) {
        return
      }
      const completed = completeMapSourceSwitch(sourceStateRef.current, requestId)
      if (completed === sourceStateRef.current) {
        return
      }
      stopWaitingForStyle()
      activeStyleRef.current = currentMap.getStyle()
      sourceStateRef.current = completed
      setSourceState(completed)
      onSourceStateChangeRef.current(completed)
    }

    const applySource = async (): Promise<void> => {
      if (requestedMode === 'local') {
        const archive = await inspectLocalArchive(controller.signal, mapRevision)
        if (!archive.available) {
          fail(localArchiveErrorMessage(archive))
          return
        }
      }
      if (!controller.signal.aborted) {
        listeningForStyle = true
        currentMap.on('style.load', handleStyleLoad)
        styleLoadTimer = window.setTimeout(() => {
          const message = requestedMode === 'online'
            ? 'The online map failed to load. Check your internet connection and access to OpenFreeMap.'
            : 'The local map could not be displayed. Check the PMTiles archive and local server.'
          fail(message)
        }, STYLE_LOAD_TIMEOUT_MS)
        currentMap.setStyle(getMapStyle(requestedMode, mapRevision))
      }
    }
    void applySource().catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        return
      }
      fail(requestedMode === 'online' ? 'Could not connect to the online map.' : 'Could not connect to the local map.')
    })
    return () => {
      disposed = true
      controller.abort()
      stopWaitingForStyle()
    }
  }, [requestedMode, mapRevision])

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
    <div ref={containerRef} className="map-container" aria-label="Interactive map of Saint Petersburg" />
    {sourceState.phase === 'loading' && <div className="map-loading" role="status">Loading {sourceState.requestedMode === 'online' ? 'online map' : 'local map'}…</div>}
    {sourceState.phase === 'failed' && <div className="map-error" role="alert"><strong>Map unavailable</strong><span>{sourceState.error}</span>{sourceState.activeMode && <span>The {sourceState.activeMode} map remains active.</span>}{sourceState.requestedMode === 'local' && <button type="button" onClick={onRequestOnline}>Switch to online map</button>}</div>}
    {!activeListId && <div className="map-hint">Create or select a list to add points</div>}
  </main>
}
