import { basename, join } from 'node:path'

export function validManifest(value) {
  return Boolean(value && typeof value.version === 'string' && /^[\w.-]{1,80}$/.test(value.version)
    && typeof value.url === 'string' && /^https:\/\//.test(value.url)
    && typeof value.sha256 === 'string' && /^[a-f\d]{64}$/i.test(value.sha256)
    && Number.isSafeInteger(value.size) && value.size > 0)
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
