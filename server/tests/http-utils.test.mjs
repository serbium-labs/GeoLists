import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contentTypeFor, parseByteRange, resolveStaticFile } from '../http-utils.mjs'

describe('production HTTP helpers', () => {
  it('serves Vite module workers as JavaScript', () => {
    expect(contentTypeFor('/assets/maplibre-gl-worker-abc.mjs')).toBe('text/javascript; charset=utf-8')
  })

  it('builds a bounded PMTiles byte range response', () => {
    expect(parseByteRange('bytes=0-6', 92_610_255)).toEqual({
      satisfiable: true,
      start: 0,
      end: 6,
      length: 7,
      contentRange: 'bytes 0-6/92610255',
    })
    expect(parseByteRange('bytes=92610255-', 92_610_255)).toEqual({
      satisfiable: false,
      contentRange: 'bytes */92610255',
    })
  })

  it('falls back to index.html only when the static asset is absent', async () => {
    const dist = '/project/dist'
    const existing = join(dist, 'assets', 'worker.mjs')
    const fileExists = async (path) => path === existing
    await expect(resolveStaticFile('/assets/worker.mjs', dist, fileExists)).resolves.toBe(existing)
    await expect(resolveStaticFile('/lists/one', dist, fileExists)).resolves.toBe(join(dist, 'index.html'))
  })
})
