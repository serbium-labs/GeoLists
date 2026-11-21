import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  estimateRegionSize,
  findInstalledRegion,
  installExtractedRegion,
  readRegionRegistry,
  regionCenter,
  validateRegionSelection,
} from '../map-regions.mjs'

const temporaryDirectories = []
const limits = {
  maxArchiveBytes: 100_000_000,
  maxStoredBytes: 200_000_000,
  minFreeBytes: 0,
  maxRegionAreaKm2: 10_000,
  maxZoom: 15,
  retainedInactiveArchives: 1,
}
const selection = { name: 'Berlin centre', bounds: [13.35, 52.48, 13.48, 52.55], maxZoom: 15 }

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

async function fixture() {
  const mapsDir = await mkdtemp(join(tmpdir(), 'geolists-regions-'))
  temporaryDirectories.push(mapsDir)
  return {
    mapsDir,
    registryPath: join(mapsDir, 'regions.json'),
    pointerPath: join(mapsDir, 'active.json'),
  }
}

describe('custom offline regions', () => {
  it('validates bounds, zoom, names and configured limits before extraction', () => {
    expect(validateRegionSelection(selection, limits)).toEqual(selection)
    expect(() => validateRegionSelection({ ...selection, bounds: [14, 52, 13, 53] }, limits)).toThrow('bounds')
    expect(() => validateRegionSelection({ ...selection, maxZoom: 16 }, limits)).toThrow('zoom')
    expect(() => validateRegionSelection({ ...selection, maxZoom: 1_000 }, limits)).toThrow('zoom')
    expect(() => validateRegionSelection({ ...selection, name: ' ' }, limits)).toThrow('required')
  })

  it('returns a deterministic positive estimate and geographic center', () => {
    expect(estimateRegionSize(selection)).toBeGreaterThan(0)
    expect(estimateRegionSize({ ...selection, maxZoom: 14 })).toBeLessThan(estimateRegionSize(selection))
    expect(regionCenter([10, 20, 14, 24])).toEqual([12, 22])
  })

  it('extracts, verifies, registers and activates a region atomically', async () => {
    const paths = await fixture()
    const archive = Buffer.concat([Buffer.from('PMTiles'), Buffer.from([3]), Buffer.from('region data')])
    const extract = vi.fn(async ({ targetPath }) => writeFile(targetPath, archive))
    const ensureCapacity = vi.fn(async () => {})

    const region = await installExtractedRegion({
      selection,
      sourceUrl: 'https://build.protomaps.com/20261121.pmtiles',
      ...paths,
      activeFile: null,
      limits,
      ensureCapacity,
      extract,
      signal: new AbortController().signal,
    })

    expect(region).toMatchObject({ name: selection.name, bounds: selection.bounds, maxZoom: 15, size: archive.length })
    expect(region.url).toBe(`/maps/regions/${region.id}.pmtiles`)
    expect(ensureCapacity).toHaveBeenCalledTimes(2)
    expect(await readRegionRegistry(paths.registryPath)).toEqual([region])
    expect(JSON.parse(await readFile(paths.pointerPath, 'utf8'))).toMatchObject({ regionId: region.id, file: region.file })
    await expect(findInstalledRegion({ id: region.id, registryPath: paths.registryPath, mapsDir: paths.mapsDir })).resolves.toEqual(region)
  })

  it('does not register a failed or invalid extraction', async () => {
    const paths = await fixture()
    const extract = async ({ targetPath }) => writeFile(targetPath, 'not pmtiles')

    await expect(installExtractedRegion({
      selection,
      sourceUrl: 'https://build.protomaps.com/20261121.pmtiles',
      ...paths,
      activeFile: null,
      limits,
      ensureCapacity: async () => {},
      extract,
      signal: new AbortController().signal,
    })).rejects.toThrow('PMTiles')
    await expect(readRegionRegistry(paths.registryPath)).resolves.toEqual([])
  })
})
