import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMapData, parseMapData } from '../../exchange/mapdata'
import { applyResolvedAddress } from '../../services/reverseGeocoding'
import { GeoListsDatabase, GeoListsRepository } from '../../storage/database'
import type { PointFields } from '../../types/data'

const POINT_FIELDS: PointFields = {
  name: 'Central Library',
  organization: '',
  address: 'Manual address',
  latitude: 52.52,
  longitude: 13.405,
  workingHours: '',
  website: '',
  comment: '',
}

let database: GeoListsDatabase
let repository: GeoListsRepository

beforeEach(() => {
  database = new GeoListsDatabase(`GeoLists-geocoding-test-${crypto.randomUUID()}`)
  repository = new GeoListsRepository(database)
})

afterEach(async () => {
  database.close()
  await database.delete()
})

describe('saving a resolved address', () => {
  it('persists and exports only the address explicitly applied by the user', async () => {
    const list = await repository.createList('Places')
    const fields = applyResolvedAddress(POINT_FIELDS, 'Alexanderplatz, Berlin')
    const saved = await repository.createPoint(list.id, fields)
    const exported = await parseMapData(await createMapData(list, [saved]))

    expect((await repository.getPoints(list.id))[0]?.address).toBe('Alexanderplatz, Berlin')
    expect(exported.points[0]?.address).toBe('Alexanderplatz, Berlin')
    expect(POINT_FIELDS.address).toBe('Manual address')
  })
})
