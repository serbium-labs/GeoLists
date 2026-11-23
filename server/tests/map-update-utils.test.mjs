import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { activeArchivePath, publicAvailable, validManifest, withSpatialMetadata } from '../map-update-utils.mjs'

const manifest = {
  version: '2026-11-13',
  url: 'https://maps.example.test/spb.pmtiles',
  sha256: 'a'.repeat(64),
  size: 92_610_255,
  bounds: [29.4, 59.63, 31.05, 60.25],
  maxZoom: 15,
}

describe('map update validation', () => {
  it('accepts a complete HTTPS manifest and rejects unsafe variants', () => {
    expect(validManifest(manifest)).toBe(true)
    expect(validManifest({ ...manifest, url: 'http://maps.example.test/spb.pmtiles' })).toBe(false)
    expect(validManifest({ ...manifest, sha256: 'not-a-hash' })).toBe(false)
    expect(validManifest({ ...manifest, size: 0 })).toBe(false)
    expect(validManifest({ ...manifest, bounds: [-181, 0, 1, 1] })).toBe(false)
    expect(validManifest({ ...manifest, bounds: [1, 0, 0, 1] })).toBe(false)
    expect(validManifest({ ...manifest, maxZoom: 31 })).toBe(false)
  })

  it('adds spatial metadata to legacy manifests without replacing declared values', () => {
    const legacy = withSpatialMetadata({ version: manifest.version })
    const current = withSpatialMetadata(manifest)

    expect(legacy).toMatchObject({ bounds: [29.4, 59.63, 31.05, 60.25], maxZoom: 15 })
    expect(current.bounds).toBe(manifest.bounds)
    expect(current.maxZoom).toBe(manifest.maxZoom)
  })

  it('only resolves managed Saint Petersburg archive names inside the maps directory', () => {
    expect(activeArchivePath('/data/maps', 'spb-2026-11-13.pmtiles')).toBe(join('/data/maps', 'spb-2026-11-13.pmtiles'))
    expect(activeArchivePath('/data/maps', '../secret.pmtiles')).toBeNull()
    expect(activeArchivePath('/data/maps', 'other.pmtiles')).toBeNull()
  })

  it('does not expose the remote archive URL or checksum in status responses', () => {
    expect(publicAvailable({ ...manifest, updateAvailable: true })).toEqual({
      version: manifest.version,
      size: manifest.size,
      updateAvailable: true,
    })
  })
})
