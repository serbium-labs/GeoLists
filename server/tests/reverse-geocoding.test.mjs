import { describe, expect, it, vi } from 'vitest'
import {
  createReverseGeocoder,
  GEOCODING_SOURCE,
  reverseGeocodingEndpoint,
  ReverseGeocodingError,
} from '../reverse-geocoding.mjs'

describe('reverse geocoding server integration', () => {
  it('does not configure or contact a service without an endpoint', () => {
    expect(reverseGeocodingEndpoint({})).toBeNull()
  })

  it('resolves an address through a configured Nominatim-compatible endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ display_name: '  Alexanderplatz, Berlin  ' })))
    const reverseGeocode = createReverseGeocoder({ endpoint: new URL('https://geocoder.example.test/reverse'), fetchImpl, now: () => 2_000 })

    await expect(reverseGeocode({ latitude: 52.5219, longitude: 13.4132 })).resolves.toEqual({
      address: 'Alexanderplatz, Berlin',
      source: GEOCODING_SOURCE,
    })
    const requestedUrl = fetchImpl.mock.calls[0][0]
    expect(requestedUrl.searchParams.get('lat')).toBe('52.5219')
    expect(requestedUrl.searchParams.get('lon')).toBe('13.4132')
  })

  it('caches repeated coordinate lookups without another upstream request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ display_name: 'Alexanderplatz, Berlin' })))
    const reverseGeocode = createReverseGeocoder({ endpoint: new URL('https://geocoder.example.test/reverse'), fetchImpl, now: () => 2_000 })

    await reverseGeocode({ latitude: 52.5219, longitude: 13.4132 })
    await reverseGeocode({ latitude: 52.5219, longitude: 13.4132 })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reports an empty result without inventing an address', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}'))
    const reverseGeocode = createReverseGeocoder({ endpoint: new URL('https://geocoder.example.test/reverse'), fetchImpl, now: () => 2_000 })

    await expect(reverseGeocode({ latitude: 0, longitude: 0 })).resolves.toEqual({ address: null, source: GEOCODING_SOURCE })
  })

  it('reports network failures without changing point data', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network unavailable'))
    const reverseGeocode = createReverseGeocoder({ endpoint: new URL('https://geocoder.example.test/reverse'), fetchImpl, now: () => 2_000 })

    await expect(reverseGeocode({ latitude: 52, longitude: 13 })).rejects.toEqual(expect.objectContaining({
      name: ReverseGeocodingError.name,
      message: 'The address service is unavailable',
    }))
  })

  it('forwards request cancellation', async () => {
    const cancellation = new DOMException('cancelled', 'AbortError')
    const fetchImpl = vi.fn().mockRejectedValue(cancellation)
    const reverseGeocode = createReverseGeocoder({ endpoint: new URL('https://geocoder.example.test/reverse'), fetchImpl, now: () => 2_000 })

    await expect(reverseGeocode({ latitude: 52, longitude: 13, signal: new AbortController().signal })).rejects.toBe(cancellation)
  })
})
