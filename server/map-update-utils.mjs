import { basename, join } from 'node:path'
import { LEGACY_MAP_METADATA, REGION_COORDINATE_LIMITS } from './server-config.mjs'

const MAP_VERSION_PATTERN = /^[\w.-]{1,80}$/
const HTTPS_URL_PATTERN = /^https:\/\//
const SHA256_PATTERN = /^[a-f\d]{64}$/i
const MANAGED_ARCHIVE_PATTERN = /^(?:spb-[\w.-]+|region-[a-f\d-]{36})\.pmtiles$/

export function withSpatialMetadata(manifest) {
  return {
    ...manifest,
    bounds: manifest?.bounds ?? LEGACY_MAP_METADATA.bounds,
    maxZoom: manifest?.maxZoom ?? LEGACY_MAP_METADATA.maxZoom,
  }
}

export function validManifest(value) {
  const manifest = withSpatialMetadata(value)
  return Boolean(value && typeof manifest.version === 'string' && MAP_VERSION_PATTERN.test(manifest.version)
    && typeof manifest.url === 'string' && HTTPS_URL_PATTERN.test(manifest.url)
    && typeof manifest.sha256 === 'string' && SHA256_PATTERN.test(manifest.sha256)
    && Number.isSafeInteger(manifest.size) && manifest.size > 0
    && Array.isArray(manifest.bounds) && manifest.bounds.length === 4
    && manifest.bounds.every((coordinate) => Number.isFinite(coordinate))
    && manifest.bounds[0] >= REGION_COORDINATE_LIMITS.longitudeDegrees.minimum
    && manifest.bounds[0] < manifest.bounds[2]
    && manifest.bounds[2] <= REGION_COORDINATE_LIMITS.longitudeDegrees.maximum
    && manifest.bounds[1] >= REGION_COORDINATE_LIMITS.latitudeDegrees.minimum
    && manifest.bounds[1] < manifest.bounds[3]
    && manifest.bounds[3] <= REGION_COORDINATE_LIMITS.latitudeDegrees.maximum
    && Number.isSafeInteger(manifest.maxZoom) && manifest.maxZoom >= 0 && manifest.maxZoom <= 30)
}

export function activeArchivePath(mapsDir, file) {
  if (typeof file !== 'string' || basename(file) !== file || !MANAGED_ARCHIVE_PATTERN.test(file)) {
    return null
  }
  return join(mapsDir, file)
}

export function publicAvailable(manifest) {
  if (!manifest) {
    return null
  }
  return {
    version: manifest.version,
    size: manifest.size,
    updateAvailable: manifest.updateAvailable,
  }
}
