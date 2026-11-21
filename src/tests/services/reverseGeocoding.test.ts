import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyResolvedAddress, getReverseGeocodingStatus, resolveAddress } from '../../services/reverseGeocoding'
import type { PointFields } from '../../types/data'

const SOURCE = { label: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' }
const FIELDS: PointFields = {
  name: 'Central Library',
  organization: 'City',
  address: 'User-entered address',
  latitude: 52.52,
  longitude: 13.405,
  workingHours: 'Daily',
  website: '',
  comment: 'Keep this text',
}

afterEach(() => vi.unstubAllGlobals())

describe('reverse geocoding client', () => {
  it('reads missing configuration without sending coordinates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ configured: false, source: null })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getReverseGeocodingStatus(new AbortController().signal)).resolves.toEqual({ configured: false, source: null })
    expect(fetchMock).toHaveBeenCalledWith('/api/geocoding/status', expect.objectContaining({ cache: 'no-store' }))
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body')
  })

  it('resolves an address only through an explicit request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ address: 'Alexanderplatz, Berlin', source: SOURCE })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveAddress(52.5219, 13.4132, new AbortController().signal)).resolves.toEqual({ address: 'Alexanderplatz, Berlin', source: SOURCE })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ latitude: 52.5219, longitude: 13.4132 })
  })

  it('preserves point data until the user explicitly applies the result', () => {
    const updated = applyResolvedAddress(FIELDS, 'Alexanderplatz, Berlin')

    expect(FIELDS.address).toBe('User-entered address')
    expect(updated).toEqual({ ...FIELDS, address: 'Alexanderplatz, Berlin' })
  })

  it('returns a valid empty result when no address is found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ address: null, source: SOURCE }))))
    await expect(resolveAddress(0, 0, new AbortController().signal)).resolves.toEqual({ address: null, source: SOURCE })
  })

  it('reports API failures without changing the existing address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'The address service is unavailable' }), { status: 502 })))

    await expect(resolveAddress(FIELDS.latitude, FIELDS.longitude, new AbortController().signal)).rejects.toThrow('unavailable')
    expect(FIELDS.address).toBe('User-entered address')
  })

  it('supports cancelling an active request', async () => {
    const cancellation = new DOMException('cancelled', 'AbortError')
    const fetchMock = vi.fn().mockRejectedValue(cancellation)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    const request = resolveAddress(FIELDS.latitude, FIELDS.longitude, controller.signal)
    controller.abort()
    await expect(request).rejects.toBe(cancellation)
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })
})
