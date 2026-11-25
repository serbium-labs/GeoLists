import type { MapSource, MapSourceMode } from '../types/map'

export enum MeasurementUnit {
  Byte = 'B',
  Kilobyte = 'KB',
  Megabyte = 'MB',
  Gigabyte = 'GB',
  DecimalDegrees = 'decimal degrees',
  MapLibreZoomLevel = 'MapLibre logical zoom level',
}

export enum HttpStatus {
  Ok = 200,
  PartialContent = 206,
  NotFound = 404,
}

export const GEOGRAPHIC_COORDINATE_LIMITS = Object.freeze({
  latitude: Object.freeze({ minimum: -90, maximum: 90, unit: MeasurementUnit.DecimalDegrees }),
  longitude: Object.freeze({ minimum: -180, maximum: 180, unit: MeasurementUnit.DecimalDegrees }),
})

type TApiEndpoints = {
  mapStatus: string
  mapCheck: string
  mapUpdate: string
  regions: string
  regionEstimate: string
  regionDownload: string
  regionActivate: string
  regionCancel: string
  geocodingStatus: string
  reverseGeocoding: string
}

type TClientConfig = {
  api: TApiEndpoints
  mutationHeaders: Readonly<Record<string, string>>
  map: {
    localArchiveUrl: string
    onlineStyleUrl: string
    sources: Record<MapSourceMode, MapSource>
  }
}

function defineConfig(config: TClientConfig): Readonly<TClientConfig> {
  return Object.freeze(config)
}

export const APP_CONFIG = defineConfig({
  api: {
    mapStatus: '/api/maps/status',
    mapCheck: '/api/maps/check',
    mapUpdate: '/api/maps/update',
    regions: '/api/regions',
    regionEstimate: '/api/regions/estimate',
    regionDownload: '/api/regions/download',
    regionActivate: '/api/regions/activate',
    regionCancel: '/api/regions/cancel',
    geocodingStatus: '/api/geocoding/status',
    reverseGeocoding: '/api/geocoding/reverse',
  },
  mutationHeaders: {
    'content-type': 'application/json',
    'x-geolists-csrf': '1',
  },
  map: {
    localArchiveUrl: '/maps/spb.pmtiles',
    onlineStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    sources: {
      local: {
        id: 'local',
        label: 'Local',
        attribution: 'Protomaps · © OpenStreetMap contributors',
      },
      online: {
        id: 'online',
        label: 'Online',
        attribution: 'OpenFreeMap · © OpenStreetMap contributors',
      },
    },
  },
})
