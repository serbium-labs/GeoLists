import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyRetentionPolicy, ensureDownloadCapacity, storageLimits, validateDownloadLimits } from '../map-storage.mjs'

const temporaryDirectories = []
const manifest = {
  version: '2026-11-13',
  size: 100,
  bounds: [29.4, 59.63, 31.05, 60.25],
  maxZoom: 15,
}
const limits = {
  maxArchiveBytes: 200,
  maxStoredBytes: 1_000,
  minFreeBytes: 50,
  maxRegionAreaKm2: 10_000,
  maxZoom: 15,
  retainedInactiveArchives: 1,
}

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

async function mapsDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'geolists-storage-'))
  temporaryDirectories.push(directory)
  await mkdir(directory, { recursive: true })
  return directory
}

describe('offline map storage limits', () => {
  it('loads safe defaults and accepts explicit overrides', () => {
    expect(storageLimits({ MAP_MAX_ARCHIVE_BYTES: '500', MAP_RETAINED_INACTIVE_ARCHIVES: '2' }))
      .toMatchObject({ maxArchiveBytes: 500, retainedInactiveArchives: 2 })
    expect(storageLimits({ MAP_RETAINED_INACTIVE_ARCHIVES: '0' }).retainedInactiveArchives).toBe(1)
  })

  it('rejects excessive archive size, region area and zoom', () => {
    expect(() => validateDownloadLimits({ ...manifest, size: 201 }, limits)).toThrow('size limit')
    expect(() => validateDownloadLimits({ ...manifest, bounds: [-10, -10, 10, 10] }, limits)).toThrow('area limit')
    expect(() => validateDownloadLimits({ ...manifest, maxZoom: 16 }, limits)).toThrow('zoom level')
  })

  it('rejects insufficient free space before a download', async () => {
    const mapsDir = await mapsDirectory()
    const activePath = join(mapsDir, 'spb-active.pmtiles')
    await writeFile(activePath, 'active map')
    const statfsImpl = vi.fn(async () => ({ bavail: 149, bsize: 1 }))

    await expect(ensureDownloadCapacity({
      mapsDir,
      manifest,
      activeFile: 'spb-active.pmtiles',
      limits,
      statfsImpl,
    }))
      .rejects.toThrow('Not enough free disk space')
    await expect(readFile(activePath, 'utf8')).resolves.toBe('active map')
  })

  it('rejects a download that would exceed persistent storage', async () => {
    const mapsDir = await mapsDirectory()
    await writeFile(join(mapsDir, 'spb-active.pmtiles'), Buffer.alloc(950))

    await expect(ensureDownloadCapacity({
      mapsDir,
      manifest,
      activeFile: 'spb-active.pmtiles',
      limits,
      statfsImpl: async () => ({ bavail: 10_000, bsize: 1 }),
    })).rejects.toThrow('storage limit')
  })

  it('removes only old inactive archives and preserves the active map and recovery archive', async () => {
    const mapsDir = await mapsDirectory()
    const activePath = join(mapsDir, 'spb-active.pmtiles')
    const recoveryPath = join(mapsDir, 'spb-recovery.pmtiles')
    const obsoletePath = join(mapsDir, 'spb-obsolete.pmtiles')
    await writeFile(activePath, 'active')
    await writeFile(recoveryPath, 'recovery')
    await writeFile(obsoletePath, 'obsolete')
    await utimes(obsoletePath, 1, 1)
    await utimes(recoveryPath, 2, 2)
    await utimes(activePath, 3, 3)

    await applyRetentionPolicy({ mapsDir, activeFile: 'spb-active.pmtiles', retainedInactiveArchives: 1 })

    await expect(readFile(activePath, 'utf8')).resolves.toBe('active')
    await expect(readFile(recoveryPath, 'utf8')).resolves.toBe('recovery')
    await expect(readFile(obsoletePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
