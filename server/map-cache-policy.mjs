export const IMMUTABLE_ARCHIVE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
export const NO_STORE_CACHE_CONTROL = 'no-store'

export function archiveResponsePolicy(requestedVersion, currentVersion) {
  if (!requestedVersion) {
    return { servable: true, cacheControl: NO_STORE_CACHE_CONTROL }
  }

  return {
    servable: requestedVersion === currentVersion,
    cacheControl: IMMUTABLE_ARCHIVE_CACHE_CONTROL,
  }
}
