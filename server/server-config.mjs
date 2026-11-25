import { join, resolve } from 'node:path'

const DEFAULT_HTTP_HOST = '127.0.0.1'
const DEFAULT_HTTP_PORT = 4173

export const MeasurementUnit = Object.freeze({
  BYTES: 'bytes',
  DECIMAL_DEGREES: 'decimal degrees',
  MAPLIBRE_ZOOM_LEVEL: 'MapLibre logical zoom level',
  SQUARE_KILOMETRES: 'square kilometres',
})

export const HttpStatus = Object.freeze({
  OK: 200,
  ACCEPTED: 202,
  PARTIAL_CONTENT: 206,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CONTENT_TOO_LARGE: 413,
  RANGE_NOT_SATISFIABLE: 416,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
})

export const REGION_COORDINATE_LIMITS = Object.freeze({
  longitudeDegrees: Object.freeze({ minimum: -180, maximum: 180, unit: MeasurementUnit.DECIMAL_DEGREES }),
  latitudeDegrees: Object.freeze({ minimum: -90, maximum: 90, unit: MeasurementUnit.DECIMAL_DEGREES }),
  webMercatorLatitudeDegrees: Object.freeze({ minimum: -85, maximum: 85, unit: MeasurementUnit.DECIMAL_DEGREES }),
})

// Saint Petersburg archive bounds are ordered west, south, east, north in WGS 84 decimal degrees.
export const LEGACY_MAP_BOUNDS_DEGREES = Object.freeze([29.4, 59.63, 31.05, 60.25])

export const LEGACY_MAP_METADATA = Object.freeze({
  bounds: LEGACY_MAP_BOUNDS_DEGREES,
  // PMTiles/MapLibre logical zoom level, not a distance or pixel measurement.
  maxZoom: 15,
})

export function httpHost(env = process.env) {
  return env.HTTP_HOST || DEFAULT_HTTP_HOST
}

export function defineServerConfig({ root, env = process.env, configuredManifestUrl = '' }) {
  const mapsDir = resolve(env.GEOLISTS_MAPS_DIR || join(root, 'data/maps'))
  const currentBuildDate = new Date().toISOString().slice(0, 10).replaceAll('-', '')

  return Object.freeze({
    root,
    distDir: join(root, 'dist'),
    mapsDir,
    pointerPath: join(mapsDir, 'active.json'),
    regionRegistryPath: join(mapsDir, 'regions.json'),
    port: Number(env.PORT || DEFAULT_HTTP_PORT),
    host: httpHost(env),
    updateManifestUrl: env.MAP_UPDATE_MANIFEST_URL || configuredManifestUrl || '',
    regionSourceUrl: env.MAP_REGION_SOURCE_URL || `https://build.protomaps.com/${currentBuildDate}.pmtiles`,
    currentBuildDate,
  })
}
