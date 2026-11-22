import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMapArchive } from './map-installer.mjs'

const temporaryDirectories = []
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

function archiveResponse(contents) {
  const response = new Response(contents, { status: 200, headers: { 'content-length': String(contents.length) } })
  Object.defineProperty(response, 'url', { value: 'https://github.com/owner/repo/releases/download/maps-v1/spb.pmtiles' })
  return response
}

async function fixture() {
  const mapsDir = await mkdtemp(join(tmpdir(), 'geolists-install-'))
  temporaryDirectories.push(mapsDir)
  const pointerPath = join(mapsDir, 'active.json')
  const archive = Buffer.concat([Buffer.from('PMTiles'), Buffer.from([3]), Buffer.from('regional map')])
  const manifest = {
    version: '2026-11-13',
    url: 'https://github.com/owner/repo/releases/download/maps-v1/spb.pmtiles',
    sha256: createHash('sha256').update(archive).digest('hex'),
    size: archive.length,
    bounds: [29.4, 59.63, 31.05, 60.25],
    maxZoom: 15,
  }
  return { mapsDir, pointerPath, archive, manifest }
}

describe('safe map installation', () => {
  it('streams, verifies and activates a valid archive', async () => {
    const { mapsDir, pointerPath, archive, manifest } = await fixture()
    const onProgress = vi.fn()
    const result = await installMapArchive({ manifest, mapsDir, pointerPath, fetchImpl: async () => archiveResponse(archive), onProgress })
    expect(result.file).toBe('spb-2026-11-13.pmtiles')
    expect(await readFile(join(mapsDir, result.file))).toEqual(archive)
    expect(JSON.parse(await readFile(pointerPath, 'utf8'))).toEqual(result)
    expect(onProgress).toHaveBeenLastCalledWith(archive.length, archive.length)
  })

  it('runs capacity checks before starting the network request', async () => {
    const { mapsDir, pointerPath, manifest } = await fixture()
    const fetchImpl = vi.fn()
    const beforeDownload = vi.fn(async () => {
      throw new Error('Not enough free disk space for the map download')
    })

    await expect(installMapArchive({
      manifest,
      mapsDir,
      pointerPath,
      fetchImpl,
      beforeDownload,
    })).rejects.toThrow('Not enough free disk space')
    expect(beforeDownload).toHaveBeenCalledOnce()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps the active pointer and removes the download when SHA-256 is wrong', async () => {
    const { mapsDir, pointerPath, archive, manifest } = await fixture()
    const previous = { version: 'old', file: 'spb-old.pmtiles', sha256: 'a'.repeat(64), size: 10 }
    await writeFile(pointerPath, JSON.stringify(previous))
    await expect(installMapArchive({
      manifest: { ...manifest, sha256: '0'.repeat(64) },
      mapsDir,
      pointerPath,
      fetchImpl: async () => archiveResponse(archive),
    })).rejects.toThrow('SHA-256')
    expect(JSON.parse(await readFile(pointerPath, 'utf8'))).toEqual(previous)
    const files = await import('node:fs/promises').then(({ readdir }) => readdir(mapsDir))
    expect(files.some((file) => file.startsWith('.download-'))).toBe(false)
  })

  it('rejects an incorrect declared size before activation', async () => {
    const { mapsDir, pointerPath, archive, manifest } = await fixture()
    await expect(installMapArchive({
      manifest: { ...manifest, size: archive.length + 1 },
      mapsDir,
      pointerPath,
      fetchImpl: async () => archiveResponse(archive),
    })).rejects.toThrow('Archive size')
  })

  it('reports an HTTP download failure without activating an archive', async () => {
    const { mapsDir, pointerPath, manifest } = await fixture()
    await expect(installMapArchive({
      manifest,
      mapsDir,
      pointerPath,
      fetchImpl: async () => new Response('temporarily unavailable', { status: 503 }),
    })).rejects.toThrow('HTTP 503')
    await expect(readFile(pointerPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a download redirected away from HTTPS', async () => {
    const { mapsDir, pointerPath, archive, manifest } = await fixture()
    const response = new Response(archive, { status: 200, headers: { 'content-length': String(archive.length) } })
    Object.defineProperty(response, 'url', { value: 'http://downloads.example.test/spb.pmtiles' })
    await expect(installMapArchive({
      manifest,
      mapsDir,
      pointerPath,
      fetchImpl: async () => response,
    })).rejects.toThrow('insecure URL')
  })

  it('rejects a correctly hashed file that is not PMTiles v3', async () => {
    const { mapsDir, pointerPath, manifest } = await fixture()
    const invalid = Buffer.from('not-pmtiles-data')
    await expect(installMapArchive({
      manifest: {
        ...manifest,
        size: invalid.length,
        sha256: createHash('sha256').update(invalid).digest('hex'),
      },
      mapsDir,
      pointerPath,
      fetchImpl: async () => archiveResponse(invalid),
    })).rejects.toThrow('PMTiles v3')
  })
})
