import { describe, expect, it } from 'vitest'
import { MAPLIBRE_WORKER_REVISION, versionMapLibreWorkerUrl } from './mapWorker'

describe('MapLibre worker URL', () => {
  it('changes the cache key after the production MIME migration', () => {
    expect(versionMapLibreWorkerUrl('/assets/maplibre-gl-worker-hash.mjs')).toBe(
      `/assets/maplibre-gl-worker-hash.mjs?geolists-worker=${MAPLIBRE_WORKER_REVISION}`,
    )
  })

  it('preserves an existing query string', () => {
    expect(versionMapLibreWorkerUrl('/worker.mjs?v=6')).toContain('&geolists-worker=')
  })
})
