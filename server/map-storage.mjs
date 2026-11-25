import { readdir, stat, statfs, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { ClientInputError } from './api-errors.mjs'
import { HttpStatus, REGION_COORDINATE_LIMITS } from './server-config.mjs'

const DEFAULT_MAX_ARCHIVE_BYTES = 1_073_741_824
const DEFAULT_MAX_STORED_BYTES = 2_147_483_648
const DEFAULT_MIN_FREE_BYTES = 536_870_912
const DEFAULT_MAX_REGION_AREA_KM2 = 10_000
const DEFAULT_MAX_ZOOM = 15
const DEFAULT_RETAINED_INACTIVE_ARCHIVES = 1
const ARCHIVE_NAME_PATTERN = /^(?:spb-[\w.-]+|region-[a-f\d-]{36})\.pmtiles$/
const UPDATE_ARCHIVE_NAME_PATTERN = /^spb-[\w.-]+\.pmtiles$/
const KILOMETRES_PER_LATITUDE_DEGREE = 111.32

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback
}

export function storageLimits(env = process.env) {
  return {
    maxArchiveBytes: positiveInteger(env.MAP_MAX_ARCHIVE_BYTES, DEFAULT_MAX_ARCHIVE_BYTES),
    maxStoredBytes: positiveInteger(env.MAP_MAX_STORED_BYTES, DEFAULT_MAX_STORED_BYTES),
    minFreeBytes: nonNegativeInteger(env.MAP_MIN_FREE_BYTES, DEFAULT_MIN_FREE_BYTES),
    maxRegionAreaKm2: positiveInteger(env.MAP_MAX_REGION_AREA_KM2, DEFAULT_MAX_REGION_AREA_KM2),
    maxZoom: nonNegativeInteger(env.MAP_MAX_ZOOM, DEFAULT_MAX_ZOOM),
    retainedInactiveArchives: positiveInteger(
      env.MAP_RETAINED_INACTIVE_ARCHIVES,
      DEFAULT_RETAINED_INACTIVE_ARCHIVES,
    ),
  }
}

export function regionAreaKm2(bounds) {
  const [west, south, east, north] = bounds
  const decimalDegreesPerHalfCircle = REGION_COORDINATE_LIMITS.longitudeDegrees.maximum
  const middleLatitudeRadians = ((south + north) / 2) * Math.PI / decimalDegreesPerHalfCircle
  const width = (east - west) * KILOMETRES_PER_LATITUDE_DEGREE * Math.cos(middleLatitudeRadians)
  const height = (north - south) * KILOMETRES_PER_LATITUDE_DEGREE
  return Math.abs(width * height)
}

export function validateDownloadLimits(manifest, limits) {
  if (manifest.size > limits.maxArchiveBytes) {
    throw new ClientInputError('Map archive exceeds the configured size limit', HttpStatus.UNPROCESSABLE_CONTENT)
  }

  if (regionAreaKm2(manifest.bounds) > limits.maxRegionAreaKm2) {
    throw new ClientInputError('Map region exceeds the configured area limit', HttpStatus.UNPROCESSABLE_CONTENT)
  }

  if (manifest.maxZoom > limits.maxZoom) {
    throw new ClientInputError('Map zoom level exceeds the configured limit', HttpStatus.UNPROCESSABLE_CONTENT)
  }
}

async function managedArchives(mapsDir) {
  const entries = await readdir(mapsDir, { withFileTypes: true })
  const archives = await Promise.all(entries
    .filter((entry) => entry.isFile() && ARCHIVE_NAME_PATTERN.test(entry.name))
    .map(async (entry) => {
      const path = join(mapsDir, entry.name)
      const info = await stat(path)
      return { name: entry.name, path, size: info.size, modifiedAt: info.mtimeMs }
    }))
  return archives.sort((left, right) => right.modifiedAt - left.modifiedAt)
}

export async function applyRetentionPolicy({ mapsDir, activeFile, retainedInactiveArchives }) {
  const archives = await managedArchives(mapsDir)
  const inactiveUpdates = archives.filter((archive) => archive.name !== activeFile && UPDATE_ARCHIVE_NAME_PATTERN.test(archive.name))
  const retainedNames = new Set(inactiveUpdates
    .slice(0, retainedInactiveArchives)
    .map((archive) => archive.name))
  const removable = inactiveUpdates.filter((archive) => !retainedNames.has(archive.name))

  for (const archive of removable) {
    await unlink(archive.path)
  }

  return archives.filter((archive) => !removable.includes(archive))
}

export async function ensureDownloadCapacity({ mapsDir, manifest, activeFile, limits, statfsImpl = statfs }) {
  validateDownloadLimits(manifest, limits)
  const retained = await applyRetentionPolicy({
    mapsDir,
    activeFile,
    retainedInactiveArchives: limits.retainedInactiveArchives,
  })
  const targetName = manifest.file || `spb-${manifest.version}.pmtiles`
  const storedBytes = retained
    .filter((archive) => archive.name !== targetName)
    .reduce((total, archive) => total + archive.size, 0)

  if (storedBytes + manifest.size > limits.maxStoredBytes) {
    throw new Error('Map storage limit would be exceeded')
  }

  const filesystem = await statfsImpl(mapsDir)
  const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize)
  const requiredBytes = manifest.size + limits.minFreeBytes
  if (!Number.isSafeInteger(availableBytes) || availableBytes < requiredBytes) {
    throw new Error('Not enough free disk space for the map download')
  }
}
