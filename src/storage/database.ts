import Dexie, { type EntityTable } from 'dexie'
import type { MapList, MapPoint, PointFields } from '../types/data'
import { validateListName, validatePointFields } from './validation'
import type { MapDataContent } from '../exchange/mapdata'

export type ListsWithPointCounts = {
  lists: MapList[]
  pointCounts: Record<string, number>
}

export class GeoListsDatabase extends Dexie {
  lists!: EntityTable<MapList, 'id'>
  points!: EntityTable<MapPoint, 'id'>

  constructor(name = 'GeoLists') {
    super(name)
    this.version(1).stores({
      lists: 'id, name, createdAt, updatedAt',
      points: 'id, listId, createdAt, updatedAt',
    })
  }
}

export class GeoListsRepository {
  constructor(readonly db: GeoListsDatabase) {}

  async getLists() {
    return this.db.lists.orderBy('createdAt').toArray()
  }

  async getListsWithPointCounts(): Promise<ListsWithPointCounts> {
    return this.db.transaction('r', this.db.lists, this.db.points, async () => {
      const lists = await this.getLists()
      const pointCounts = Object.fromEntries(lists.map((list) => [list.id, 0])) as Record<string, number>

      await this.db.points.orderBy('listId').eachKey((listId) => {
        if (typeof listId === 'string' && Object.hasOwn(pointCounts, listId)) {
          pointCounts[listId] += 1
        }
      })

      return { lists, pointCounts }
    })
  }

  async getPoints(listId: string) {
    return this.db.points.where('listId').equals(listId).sortBy('createdAt')
  }

  async createList(name: string) {
    const now = new Date().toISOString()
    const list: MapList = { id: crypto.randomUUID(), name: validateListName(name), createdAt: now, updatedAt: now }
    await this.db.lists.add(list)
    return list
  }

  async renameList(id: string, name: string) {
    const list = await this.db.lists.get(id)
    if (!list) throw new Error('List not found.')
    const updated = { ...list, name: validateListName(name), updatedAt: new Date().toISOString() }
    await this.db.lists.put(updated)
    return updated
  }

  async deleteList(id: string) {
    await this.db.transaction('rw', this.db.lists, this.db.points, async () => {
      if (!(await this.db.lists.get(id))) throw new Error('List not found.')
      await this.db.points.where('listId').equals(id).delete()
      await this.db.lists.delete(id)
    })
  }

  async createPoint(listId: string, input: PointFields) {
    const values = validatePointFields(input)
    const now = new Date().toISOString()
    const point: MapPoint = { ...values, id: crypto.randomUUID(), listId, createdAt: now, updatedAt: now }
    await this.db.transaction('rw', this.db.lists, this.db.points, async () => {
      if (!(await this.db.lists.get(listId))) throw new Error('The active list no longer exists.')
      await this.db.points.add(point)
    })
    return point
  }

  async updatePoint(listId: string, id: string, input: PointFields) {
    const values = validatePointFields(input)
    return this.db.transaction('rw', this.db.lists, this.db.points, async () => {
      if (!(await this.db.lists.get(listId))) throw new Error('The active list no longer exists.')
      const point = await this.db.points.get(id)
      if (!point || point.listId !== listId) throw new Error('The point does not belong to the active list.')
      const updated: MapPoint = { ...point, ...values, updatedAt: new Date().toISOString() }
      await this.db.points.put(updated)
      return updated
    })
  }

  async deletePoint(listId: string, id: string) {
    await this.db.transaction('rw', this.db.points, async () => {
      const point = await this.db.points.get(id)
      if (!point || point.listId !== listId) throw new Error('The point does not belong to the active list.')
      await this.db.points.delete(id)
    })
  }

  async importMapData(data: MapDataContent) {
    const list: MapList = { ...data.list, id: crypto.randomUUID() }
    const points: MapPoint[] = data.points.map((point) => ({ ...point, id: crypto.randomUUID(), listId: list.id }))
    await this.db.transaction('rw', this.db.lists, this.db.points, async () => {
      await this.db.lists.add(list)
      await this.db.points.bulkAdd(points)
    })
    return list
  }
}

export const database = new GeoListsDatabase()
export const repository = new GeoListsRepository(database)
