import { describe, expect, it } from 'vitest'
import {
  archiveResponsePolicy,
  IMMUTABLE_ARCHIVE_CACHE_CONTROL,
  NO_STORE_CACHE_CONTROL,
} from '../map-cache-policy.mjs'

describe('map archive cache policy', () => {
  it('keeps unversioned archive responses uncached', () => {
    expect(archiveResponsePolicy(null, '2026-11-21')).toEqual({
      servable: true,
      cacheControl: NO_STORE_CACHE_CONTROL,
    })
  })

  it('caches byte ranges for the requested active archive version', () => {
    expect(archiveResponsePolicy('2026-11-21', '2026-11-21')).toEqual({
      servable: true,
      cacheControl: IMMUTABLE_ARCHIVE_CACHE_CONTROL,
    })
  })

  it('rejects a stale version instead of serving bytes from a newer archive', () => {
    expect(archiveResponsePolicy('2026-11-20', '2026-11-21')).toEqual({
      servable: false,
      cacheControl: IMMUTABLE_ARCHIVE_CACHE_CONTROL,
    })
  })
})
