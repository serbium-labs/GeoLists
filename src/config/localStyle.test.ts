import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalStyle } from './localStyle'

afterEach(() => vi.unstubAllGlobals())

describe('createLocalStyle', () => {
  it('keeps all offline resources same-origin and labels above geometry', () => {
    vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:4173' } })
    const style = createLocalStyle()
    const layerIds = style.layers.map((layer) => layer.id)

    expect(style.glyphs).toBe('http://127.0.0.1:4173/map-assets/fonts/{fontstack}/{range}.pbf')
    expect(style.sources.protomaps).toMatchObject({ url: 'pmtiles:///maps/spb.pmtiles' })
    expect(layerIds.indexOf('road-labels')).toBeGreaterThan(layerIds.indexOf('roads'))
    expect(layerIds.indexOf('place-labels')).toBeGreaterThan(layerIds.indexOf('buildings'))
  })

  it('adds an encoded revision to force PMTiles to open a newly installed archive', () => {
    vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:4173' } })
    expect(createLocalStyle('2026-11-13 ready').sources.protomaps).toMatchObject({
      url: 'pmtiles:///maps/spb.pmtiles?v=2026-11-13%20ready',
    })
  })
})
