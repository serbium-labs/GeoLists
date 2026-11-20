import { basename, join } from 'node:path'

const LEGACY_MAP_BOUNDS = [29.4, 59.63, 31.05, 60.25]
const LEGACY_MAP_MAX_ZOOM = 15

export function withSpatialMetadata(manifest) {
  return {
    ...manifest,
    bounds: manifest?.bounds ?? LEGACY_MAP_BOUNDS,
    maxZoom: manifest?.maxZoom ?? LEGACY_MAP_MAX_ZOOM,
  }
}

export function validManifest(value) {
  const manifest = withSpatialMetadata(value)
  return Boolean(value && typeof manifest.version === 'string' && /^[\w.-]{1,80}$/.test(manifest.version)
    && typeof manifest.url === 'string' && /^https:\/\//.test(manifest.url)
    && typeof manifest.sha256 === 'string' && /^[a-f\d]{64}$/i.test(manifest.sha256)
    && Number.isSafeInteger(manifest.size) && manifest.size > 0
    && Array.isArray(manifest.bounds) && manifest.bounds.length === 4
    && manifest.bounds.every((coordinate) => Number.isFinite(coordinate))
    && manifest.bounds[0] >= -180 && manifest.bounds[0] < manifest.bounds[2] && manifest.bounds[2] <= 180
    && manifest.bounds[1] >= -90 && manifest.bounds[1] < manifest.bounds[3] && manifest.bounds[3] <= 90
    && Number.isSafeInteger(manifest.maxZoom) && manifest.maxZoom >= 0 && manifest.maxZoom <= 30)
}

export function activeArchivePath(mapsDir, file) {
  if (typeof file !== 'string' || basename(file) !== file || !/^spb-[\w.-]+\.pmtiles$/.test(file)) return null
  return join(mapsDir, file)
}

export function publicAvailable(manifest) {
  if (!manifest) return null
  return {
    version: manifest.version,
    size: manifest.size,
    updateAvailable: manifest.updateAvailable,
  }
}
