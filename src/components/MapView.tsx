import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import {
  GeoJSONSource,
  Map,
  NavigationControl,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMapStyle, inspectLocalArchive, localArchiveErrorMessage, type LocalArchiveStatus } from '../config/mapSources'
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
import type { Coordinates, MapSourceMode, MapViewport, OfflineRegion } from '../types/map'
import { isUndefined } from '../utils/nullish'
import {
  createMapPointData,
  MAP_CLUSTER_COUNT_LAYER_ID,
  MAP_CLUSTER_LAYER_ID,
  MAP_POINT_CLUSTER_OPTIONS,
  MAP_POINT_LABEL_LAYER_ID,
  MAP_POINT_LAYER_ID,
  MAP_POINT_SOURCE_ID,
  MAP_SELECTED_POINT_LAYER_ID,
} from './MapView/mapPointData'

const DEFAULT_CENTER: [number, number] = [0, 20]
const DEFAULT_ZOOM = 2
const STYLE_LOAD_TIMEOUT_MS = 15_000
const POINT_SELECTION_ZOOM = 15
const MAX_CLUSTER_EXPANSION_ZOOM = 20
// Cap automatic region fitting at MapLibre logical zoom level 12 so the selected area remains visible with context.
const REGION_FIT_MAX_ZOOM_LEVEL = 12
const CLUSTER_COLOR = '#1c6d4e'
const SELECTED_POINT_COLOR = '#a2362c'
const POINT_STROKE_COLOR = '#ffffff'
const SELECTION_STROKE_COLOR = '#4f8069'
const POINT_LABEL_COLOR = '#263b31'
const CLUSTER_RADIUS_SMALL = 18
const CLUSTER_RADIUS_MEDIUM = 23
const CLUSTER_RADIUS_LARGE = 28
const MEDIUM_CLUSTER_SIZE = 100
const LARGE_CLUSTER_SIZE = 1_000
const POINT_RADIUS = 8
const SELECTED_POINT_RADIUS = 12
const POINT_INTERACTION_LAYER_IDS = [MAP_POINT_LAYER_ID, MAP_SELECTED_POINT_LAYER_ID, MAP_POINT_LABEL_LAYER_ID]
const CLUSTER_INTERACTION_LAYER_IDS = [MAP_CLUSTER_LAYER_ID, MAP_CLUSTER_COUNT_LAYER_ID]
maplibregl.setWorkerUrl(versionMapLibreWorkerUrl(maplibreWorkerUrl))
const EMPTY_STYLE = { version: 8 as const, sources: {}, layers: [{ id: 'unavailable', type: 'background' as const, paint: { 'background-color': '#e5e9e4' } }] }

type MapLibreMap = Map
type TMapProps = ConstructorParameters<typeof Map>[0]

interface Props {
  requestedMode: MapSourceMode
  mapRevision: string
  activeRegion: OfflineRegion | null
  points: MapPoint[]
  activeListId: string | null
  focusedPoint: MapPoint | null
  onMapClick: (point: Coordinates) => void
  onPointOpen: (point: MapPoint) => void
  onRequestOnline: () => void
  onSourceStateChange: (state: MapSourceState) => void
  onViewportChange: (viewport: MapViewport) => void
}

function addPointLayers(map: MapLibreMap): void {
  map.addLayer({
    id: MAP_CLUSTER_LAYER_ID,
    type: 'circle',
    source: MAP_POINT_SOURCE_ID,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': CLUSTER_COLOR,
      'circle-radius': ['step', ['get', 'point_count'], CLUSTER_RADIUS_SMALL, MEDIUM_CLUSTER_SIZE, CLUSTER_RADIUS_MEDIUM, LARGE_CLUSTER_SIZE, CLUSTER_RADIUS_LARGE],
      'circle-stroke-color': POINT_STROKE_COLOR,
      'circle-stroke-width': 3,
    },
  })
  map.addLayer({
    id: MAP_CLUSTER_COUNT_LAYER_ID,
    type: 'symbol',
    source: MAP_POINT_SOURCE_ID,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
    },
    paint: { 'text-color': POINT_STROKE_COLOR },
  })
  map.addLayer({
    id: MAP_POINT_LAYER_ID,
    type: 'circle',
    source: MAP_POINT_SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': CLUSTER_COLOR,
      'circle-radius': POINT_RADIUS,
      'circle-stroke-color': POINT_STROKE_COLOR,
      'circle-stroke-width': 3,
    },
  })
  map.addLayer({
    id: MAP_SELECTED_POINT_LAYER_ID,
    type: 'circle',
    source: MAP_POINT_SOURCE_ID,
    filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'selected'], true]],
    paint: {
      'circle-color': SELECTED_POINT_COLOR,
      'circle-radius': SELECTED_POINT_RADIUS,
      'circle-stroke-color': SELECTION_STROKE_COLOR,
      'circle-stroke-width': 5,
    },
  })
  map.addLayer({
    id: MAP_POINT_LABEL_LAYER_ID,
    type: 'symbol',
    source: MAP_POINT_SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['case', ['==', ['get', 'selected'], true], 13, 11],
      'text-anchor': 'left',
      'text-offset': [1.2, 0],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': POINT_LABEL_COLOR,
      'text-halo-color': POINT_STROKE_COLOR,
      'text-halo-width': 2,
    },
  })
}

function syncPointLayers(map: MapLibreMap, points: MapPoint[], selectedPointId: string | null): void {
  if (!map.isStyleLoaded()) {
    return
  }

  const data: ReturnType<typeof createMapPointData> = createMapPointData(points, selectedPointId)
  const existingSource: ReturnType<MapLibreMap['getSource']> = map.getSource(MAP_POINT_SOURCE_ID)

  if (existingSource) {
    const pointSource = existingSource as GeoJSONSource
    pointSource.setData(data)
    return
  }

  map.addSource(MAP_POINT_SOURCE_ID, {
    type: 'geojson',
    data,
    ...MAP_POINT_CLUSTER_OPTIONS,
  })
  addPointLayers(map)
}

function pointCoordinates(feature: MapGeoJSONFeature): [number, number] | null {
  if (feature.geometry.type !== 'Point') {
    return null
  }

  const [longitude, latitude] = feature.geometry.coordinates
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null
}

type ClusterSelection = {
  center: [number, number] | null
  clusterId: unknown
  source: unknown
}

type ValidClusterSelection = {
  center: [number, number]
  clusterId: number
  source: GeoJSONSource
}

function isValidClusterSelection(selection: ClusterSelection): selection is ValidClusterSelection {
  return Boolean(
    selection.center
    && Number.isSafeInteger(selection.clusterId)
    && selection.source instanceof GeoJSONSource,
  )
}

export function MapView({ requestedMode, mapRevision, activeRegion, points, activeListId, focusedPoint, onMapClick, onPointOpen, onRequestOnline, onSourceStateChange, onViewportChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onMapClickRef = useRef(onMapClick)
  const onPointOpenRef = useRef(onPointOpen)
  const pointsRef = useRef(points)
  const focusedPointIdRef = useRef(focusedPoint?.id ?? null)
  const activeListIdRef = useRef(activeListId)
  const sourceStateRef = useRef(initialMapSourceState(requestedMode, mapRevision))
  const activeStyleRef = useRef<ReturnType<MapLibreMap['getStyle']> | null>(null)
  const onSourceStateChangeRef = useRef(onSourceStateChange)
  const onViewportChangeRef = useRef(onViewportChange)
  const [sourceState, setSourceState] = useState(sourceStateRef.current)

  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { onPointOpenRef.current = onPointOpen }, [onPointOpen])
  useEffect(() => { pointsRef.current = points }, [points])
  useEffect(() => { focusedPointIdRef.current = focusedPoint?.id ?? null }, [focusedPoint?.id])
  useEffect(() => { activeListIdRef.current = activeListId }, [activeListId])
  useEffect(() => { onSourceStateChangeRef.current = onSourceStateChange }, [onSourceStateChange])
  useEffect(() => { onViewportChangeRef.current = onViewportChange }, [onViewportChange])
  useEffect(() => {
    const protocol: Protocol = new Protocol()

    maplibregl.addProtocol('pmtiles', protocol.tile)

    return () => maplibregl.removeProtocol('pmtiles')
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    let map: MapLibreMap
    try {
      const mapProps: TMapProps = {
        container: containerRef.current,
        style: EMPTY_STYLE,
        center: activeRegion?.center ?? DEFAULT_CENTER,
        zoom: activeRegion ? Math.min(activeRegion.maxZoom, 11) : DEFAULT_ZOOM,
        attributionControl: { compact: true },
        locale: {
          'NavigationControl.ZoomIn': 'Zoom in',
          'NavigationControl.ZoomOut': 'Zoom out',
          'NavigationControl.ResetBearing': 'Reset bearing',
        },
      }

      map = new Map(mapProps)
    } catch {
      const failed: MapSourceState = failMapSourceSwitch(
        sourceStateRef.current,
        sourceStateRef.current.requestId,
        'The map requires WebGL2, which is unavailable in this browser or environment.',
      )
      sourceStateRef.current = failed
      setSourceState(failed)
      onSourceStateChangeRef.current(failed)
      return
    }

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.on('click', POINT_INTERACTION_LAYER_IDS, (event: MapLayerMouseEvent) => {
      const pointId: unknown = event.features?.[0]?.properties?.id
      const point: MapPoint | null = typeof pointId === 'string'
        ? pointsRef.current.find((candidate: MapPoint): boolean => candidate.id === pointId) ?? null
        : null

      if (!point) {
        return
      }

      event.preventDefault()
      onPointOpenRef.current(point)
    })
    map.on('click', CLUSTER_INTERACTION_LAYER_IDS, (event: MapLayerMouseEvent) => {
      const feature: MapGeoJSONFeature | undefined = event.features?.[0]
      const clusterId: unknown = feature?.properties?.cluster_id
      const center: [number, number] | null = feature ? pointCoordinates(feature) : null
      const source: unknown = map.getSource(MAP_POINT_SOURCE_ID)
      const selection: ClusterSelection = { center, clusterId, source }

      if (!isValidClusterSelection(selection)) {
        return
      }

      event.preventDefault()
      void selection.source.getClusterExpansionZoom(selection.clusterId).then((zoom: number) => {
        map.easeTo({ center: selection.center, zoom: Math.min(zoom, MAX_CLUSTER_EXPANSION_ZOOM) })
      }).catch(() => {
        map.easeTo({ center: selection.center, zoom: Math.min(map.getZoom() + 2, MAX_CLUSTER_EXPANSION_ZOOM) })
      })
    })
    map.on('click', (event) => {
      if (event.defaultPrevented || !activeListIdRef.current) {
        return
      }

      onMapClickRef.current({ longitude: event.lngLat.lng, latitude: event.lngLat.lat })
    })
    const showPointer = (): void => { map.getCanvas().style.cursor = 'pointer' }
    const restoreCursor = (): void => { map.getCanvas().style.cursor = '' }
    map.on('mouseenter', POINT_INTERACTION_LAYER_IDS, showPointer)
    map.on('mouseleave', POINT_INTERACTION_LAYER_IDS, restoreCursor)
    map.on('mouseenter', CLUSTER_INTERACTION_LAYER_IDS, showPointer)
    map.on('mouseleave', CLUSTER_INTERACTION_LAYER_IDS, restoreCursor)
    const syncCurrentPoints = (): void => syncPointLayers(map, pointsRef.current, focusedPointIdRef.current)
    map.on('style.load', syncCurrentPoints)
    const reportViewport = (): void => {
      const bounds: ReturnType<MapLibreMap['getBounds']> = map.getBounds()

      onViewportChangeRef.current({
        bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom: map.getZoom(),
      })
    }
    map.on('load', reportViewport)
    map.on('moveend', reportViewport)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map: MapLibreMap | null = mapRef.current

    if (!map) {
      return
    }
    const currentMap: MapLibreMap = map
    const started: MapSourceState = beginMapSourceSwitch(sourceStateRef.current, requestedMode, mapRevision)

    sourceStateRef.current = started
    setSourceState(started)
    onSourceStateChangeRef.current(started)
    if (isMapSourceActive(started, requestedMode, mapRevision)) {
      const completed: MapSourceState = completeMapSourceSwitch(started, started.requestId)
      sourceStateRef.current = completed
      setSourceState(completed)
      onSourceStateChangeRef.current(completed)
      return
    }

    const requestId: number = started.requestId
    const controller: AbortController = new AbortController()
    let styleLoadTimer: number | undefined
    let listeningForStyle: boolean = false
    let disposed: boolean = false

    const stopWaitingForStyle = (): void => {
      if (!isUndefined(styleLoadTimer)) {
        window.clearTimeout(styleLoadTimer)
      }
      if (listeningForStyle) {
        currentMap.off('style.load', handleStyleLoad)
      }
      styleLoadTimer = undefined
      listeningForStyle = false
    }

    const restoreActiveStyle = (): void => {
      const fallbackStyle: ReturnType<MapLibreMap['getStyle']> | null = activeStyleRef.current

      currentMap.setStyle(fallbackStyle ?? EMPTY_STYLE)
    }

    const fail = (message: string): void => {
      if (disposed) {
        return
      }
      const failed: MapSourceState = failMapSourceSwitch(sourceStateRef.current, requestId, message)

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
      const completed: MapSourceState = completeMapSourceSwitch(sourceStateRef.current, requestId)

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
        const archive: LocalArchiveStatus = await inspectLocalArchive(controller.signal, mapRevision, activeRegion?.url)
        if (!archive.available) {
          fail(localArchiveErrorMessage(archive))
          return
        }
      }
      if (!controller.signal.aborted) {
        listeningForStyle = true
        currentMap.on('style.load', handleStyleLoad)
        styleLoadTimer = window.setTimeout(() => {
          const message: string = requestedMode === 'online'
            ? 'The online map failed to load. Check your internet connection and access to OpenFreeMap.'
            : 'The local map could not be displayed. Check the PMTiles archive and local server.'
          fail(message)
        }, STYLE_LOAD_TIMEOUT_MS)
        currentMap.setStyle(getMapStyle(requestedMode, mapRevision, activeRegion?.url))
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
  }, [requestedMode, mapRevision, activeRegion?.url])

  useEffect(() => {
    if (!activeRegion || !mapRef.current) {
      return
    }

    const [west, south, east, north] = activeRegion.bounds
    mapRef.current.fitBounds([[west, south], [east, north]], {
      padding: 40,
      maxZoom: Math.min(activeRegion.maxZoom, REGION_FIT_MAX_ZOOM_LEVEL),
    })
  }, [activeRegion?.id])

  useEffect(() => {
    const map: MapLibreMap | null = mapRef.current

    if (!map) {
      return
    }

    syncPointLayers(map, points, focusedPoint?.id ?? null)
  }, [points, activeListId, focusedPoint?.id])

  useEffect(() => {
    if (!focusedPoint || !mapRef.current) {
      return
    }
    mapRef.current.flyTo({ center: [focusedPoint.longitude, focusedPoint.latitude], zoom: Math.max(mapRef.current.getZoom(), POINT_SELECTION_ZOOM) })
  }, [focusedPoint])

  return <main className="map-area" aria-label="Map">
    <div ref={containerRef} className="map-container" aria-label="Interactive world map" aria-describedby="map-keyboard-instructions" />
    <p id="map-keyboard-instructions" className="visually-hidden">Use the map zoom controls to expand clusters. Every point can also be selected with the paginated buttons in the sidebar.</p>
    {sourceState.phase === 'loading' && <div className="map-loading" role="status" aria-live="polite">Loading {sourceState.requestedMode === 'online' ? 'online map' : 'local map'}…</div>}
    {sourceState.phase === 'failed' && <div className="map-error" role="alert"><strong>Map unavailable</strong><span>{sourceState.error}</span>{sourceState.activeMode && <span>The {sourceState.activeMode} map remains active.</span>}{sourceState.requestedMode === 'local' && <button type="button" onClick={onRequestOnline}>Switch to online map</button>}</div>}
    {!activeListId && <div className="map-hint" role="status">Create or select a list to add points</div>}
  </main>
}
