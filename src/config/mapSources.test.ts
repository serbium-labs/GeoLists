import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectLocalArchive, localArchiveErrorMessage } from './mapSources'

const controller = () => new AbortController()

afterEach(() => vi.unstubAllGlobals())

describe('inspectLocalArchive', () => {
  it('accepts a PMTiles archive served with byte ranges', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('PMTiles', {
      status: 206,
      headers: { 'content-range': 'bytes 0-6/100' },
    })))

    await expect(inspectLocalArchive(controller().signal)).resolves.toEqual({ available: true })
  })

  it('checks the newly installed version using a cache-busting URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('PMTiles', {
      status: 206,
      headers: { 'content-range': 'bytes 0-6/100' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await inspectLocalArchive(controller().signal, '2026-11-13')
    expect(fetchMock).toHaveBeenCalledWith('/maps/spb.pmtiles?v=2026-11-13', expect.any(Object))
  })

  it('distinguishes a missing archive from an invalid one', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('<html>', {
        status: 206,
        headers: { 'content-range': 'bytes 0-6/100' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(inspectLocalArchive(controller().signal)).resolves.toMatchObject({ available: false, reason: 'not-found' })
    await expect(inspectLocalArchive(controller().signal)).resolves.toEqual({ available: false, reason: 'invalid' })
  })

  it('rejects a server without byte range support', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('PMTiles', { status: 200 })))
    const status = await inspectLocalArchive(controller().signal)
    expect(status).toEqual({ available: false, reason: 'range-unsupported', status: 200 })
    if (!status.available) expect(localArchiveErrorMessage(status)).toContain('range requests')
  })

  it('reports an unavailable development server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const status = await inspectLocalArchive(controller().signal)
    expect(status).toEqual({ available: false, reason: 'network' })
    if (!status.available) expect(localArchiveErrorMessage(status)).toContain('npm run serve')
  })
})
