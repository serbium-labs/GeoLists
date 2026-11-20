import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { generateMapManifest } from './map-manifest.mjs'

const temporaryDirectories = []
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

describe('map manifest generator', () => {
  it('derives the exact size and SHA-256 from a PMTiles v3 archive', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geolists-manifest-'))
    temporaryDirectories.push(directory)
    const archive = Buffer.concat([Buffer.from('PMTiles'), Buffer.from([3]), Buffer.from('map-data')])
    const archivePath = join(directory, 'spb.pmtiles')
    await writeFile(archivePath, archive)
    await expect(generateMapManifest({
      archivePath,
      version: '2026-11-13',
      url: 'https://github.com/owner/repo/releases/download/maps-v1/spb.pmtiles',
      bounds: [29.4, 59.63, 31.05, 60.25],
      maxZoom: 15,
    })).resolves.toEqual({
      version: '2026-11-13',
      url: 'https://github.com/owner/repo/releases/download/maps-v1/spb.pmtiles',
      sha256: createHash('sha256').update(archive).digest('hex'),
      size: archive.length,
      bounds: [29.4, 59.63, 31.05, 60.25],
      maxZoom: 15,
    })
  })

  it('rejects missing spatial metadata required for download limits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geolists-manifest-'))
    temporaryDirectories.push(directory)
    const archivePath = join(directory, 'spb.pmtiles')
    await writeFile(archivePath, Buffer.concat([Buffer.from('PMTiles'), Buffer.from([3])]))

    await expect(generateMapManifest({
      archivePath,
      version: 'v1',
      url: 'https://github.com/owner/repo/file',
    })).rejects.toThrow('Bounds')
  })

  it('rejects non-PMTiles files and non-HTTPS publication addresses', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geolists-manifest-'))
    temporaryDirectories.push(directory)
    const archivePath = join(directory, 'invalid.pmtiles')
    await writeFile(archivePath, 'not a map')
    const metadata = { bounds: [29.4, 59.63, 31.05, 60.25], maxZoom: 15 }
    await expect(generateMapManifest({ archivePath, version: 'v1', url: 'https://github.com/owner/repo/file', ...metadata })).rejects.toThrow('PMTiles v3')
    await expect(generateMapManifest({ archivePath, version: 'v1', url: 'http://localhost/file', ...metadata })).rejects.toThrow('HTTPS')
  })
})
