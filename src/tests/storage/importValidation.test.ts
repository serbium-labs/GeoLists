import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MapDataContent } from '../../exchange/mapdata'
import { GeoListsDatabase, GeoListsRepository } from '../../storage/database'

const IMPORT_DATA: MapDataContent = {
  format: 'geolists.mapdata',
  version: 1,
  list: {
    id: 'import-list',
    name: '  Cafe\u0301 list  ',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
  },
  points: [{
    id: 'import-point',
    name: '  東京  ',
    organization: '  Example  ',
    address: '  Main Street 1  ',
    latitude: 48.137154,
    longitude: 11.576124,
    workingHours: '',
    website: 'HTTPS://EXAMPLE.COM',
    comment: '  First\r\nSecond  ',
    createdAt: '2026-01-01T11:00:00.000Z',
    updatedAt: '2026-01-01T11:00:00.000Z',
  }],
}

let database: GeoListsDatabase
let repository: GeoListsRepository

beforeEach(() => {
  database = new GeoListsDatabase(`GeoLists-import-validation-${crypto.randomUUID()}`)
  repository = new GeoListsRepository(database)
})

afterEach(async () => {
  database.close()
  await database.delete()
})

describe('IndexedDB import validation', () => {
  it('applies the shared normalization rules at the storage boundary', async () => {
    const imported = await repository.importMapData(IMPORT_DATA)
    const [point] = await repository.getPoints(imported.id)

    expect(imported.name).toBe('Café list')
    expect(point).toMatchObject({
      name: '東京',
      organization: 'Example',
      address: 'Main Street 1',
      website: 'https://example.com/',
      comment: 'First\nSecond',
    })
  })

  it('rejects invalid imported fields without writing partial data', async () => {
    const invalid: MapDataContent = {
      ...IMPORT_DATA,
      points: [{ ...IMPORT_DATA.points[0], address: 'Line one\nLine two' }],
    }

    await expect(repository.importMapData(invalid)).rejects.toThrow('Address: use only printable single-line characters.')
    await expect(repository.getLists()).resolves.toEqual([])
    await expect(database.points.count()).resolves.toBe(0)
  })
})
