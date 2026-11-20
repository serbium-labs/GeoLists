import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeoListsDatabase, GeoListsRepository } from '../../storage/database'

const VALID_POINT = {
  name: 'Warehouse',
  organization: '',
  address: 'Saint Petersburg',
  latitude: 59.934312345,
  longitude: 30.335112345,
  workingHours: '',
  website: 'https://example.com',
  comment: '',
}

let database: GeoListsDatabase
let repository: GeoListsRepository

beforeEach(() => {
  database = new GeoListsDatabase(`GeoLists-point-count-test-${crypto.randomUUID()}`)
  repository = new GeoListsRepository(database)
})

afterEach(async () => {
  database.close()
  await database.delete()
})

describe('point count aggregation', () => {
  it('counts points for all lists without loading point objects per list', async () => {
    const firstList = await repository.createList('First')
    const secondList = await repository.createList('Second')
    await repository.createPoint(firstList.id, VALID_POINT)
    await repository.createPoint(firstList.id, { ...VALID_POINT, name: 'Second point' })
    await repository.createPoint(secondList.id, { ...VALID_POINT, name: 'Third point' })
    const getPoints = vi.spyOn(repository, 'getPoints')

    const result = await repository.getListsWithPointCounts()

    expect(result.lists).toHaveLength(2)
    expect(new Set(result.lists.map((list) => list.id))).toEqual(new Set([firstList.id, secondList.id]))
    expect(result.pointCounts).toEqual({ [firstList.id]: 2, [secondList.id]: 1 })
    expect(getPoints).not.toHaveBeenCalled()
  })

  it('keeps aggregated counts correct across point CRUD operations', async () => {
    const list = await repository.createList('Locations')
    const point = await repository.createPoint(list.id, VALID_POINT)
    expect((await repository.getListsWithPointCounts()).pointCounts[list.id]).toBe(1)

    await repository.updatePoint(list.id, point.id, { ...VALID_POINT, name: 'Updated location' })
    expect((await repository.getListsWithPointCounts()).pointCounts[list.id]).toBe(1)

    await repository.deletePoint(list.id, point.id)
    expect((await repository.getListsWithPointCounts()).pointCounts[list.id]).toBe(0)
  })
})
