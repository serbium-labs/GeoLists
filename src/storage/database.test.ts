import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeoListsDatabase, GeoListsRepository } from './database'
import { createMapData, parseMapData } from '../exchange/mapdata'

const validPoint = {
  name: 'Склад',
  organization: '',
  address: 'Санкт-Петербург',
  latitude: 59.934312345,
  longitude: 30.335112345,
  workingHours: '',
  website: 'https://example.com',
  comment: '',
}

let db: GeoListsDatabase
let repository: GeoListsRepository

beforeEach(() => {
  db = new GeoListsDatabase(`GeoLists-test-${crypto.randomUUID()}`)
  repository = new GeoListsRepository(db)
})

afterEach(async () => {
  db.close()
  await db.delete()
})

describe('GeoListsRepository', () => {
  it('создаёт список', async () => {
    const list = await repository.createList(' Поставщики ')
    expect(list.name).toBe('Поставщики')
    expect(await repository.getLists()).toEqual([list])
  })

  it('переименовывает список', async () => {
    const list = await repository.createList('Первый')
    const renamed = await repository.renameList(list.id, 'Второй')
    expect(renamed.name).toBe('Второй')
    expect((await repository.getLists())[0]?.name).toBe('Второй')
  })

  it('создаёт точку существующего списка', async () => {
    const list = await repository.createList('Поставщики')
    const point = await repository.createPoint(list.id, validPoint)
    expect(point.listId).toBe(list.id)
    expect(await repository.getPoints(list.id)).toEqual([point])
  })

  it('редактирует точку активного списка', async () => {
    const list = await repository.createList('Поставщики')
    const point = await repository.createPoint(list.id, validPoint)
    const updated = await repository.updatePoint(list.id, point.id, { ...validPoint, name: 'Офис', latitude: 60 })
    expect(updated).toMatchObject({ name: 'Офис', latitude: 60 })
  })

  it('удаляет точку', async () => {
    const list = await repository.createList('Поставщики')
    const point = await repository.createPoint(list.id, validPoint)
    await repository.deletePoint(list.id, point.id)
    expect(await repository.getPoints(list.id)).toEqual([])
  })

  it('каскадно удаляет точки в транзакции со списком', async () => {
    const list = await repository.createList('Поставщики')
    await repository.createPoint(list.id, validPoint)
    await repository.createPoint(list.id, { ...validPoint, name: 'Офис' })
    await repository.deleteList(list.id)
    expect(await repository.getLists()).toEqual([])
    expect(await db.points.count()).toBe(0)
  })

  it('отклоняет некорректные координаты', async () => {
    const list = await repository.createList('Поставщики')
    await expect(repository.createPoint(list.id, { ...validPoint, latitude: Number.NaN })).rejects.toThrow('Latitude')
    await expect(repository.createPoint(list.id, { ...validPoint, longitude: 181 })).rejects.toThrow('Longitude')
  })

  it('отклоняет пустые названия', async () => {
    await expect(repository.createList('   ')).rejects.toThrow('List name')
    const list = await repository.createList('Поставщики')
    await expect(repository.createPoint(list.id, { ...validPoint, name: '\t' })).rejects.toThrow('Point name')
  })

  it('отклоняет URL без http/https', async () => {
    const list = await repository.createList('Поставщики')
    await expect(repository.createPoint(list.id, { ...validPoint, website: 'javascript:alert(1)' })).rejects.toThrow('http or https')
  })

  it('сохраняет и читает данные после повторного открытия IndexedDB', async () => {
    const name = db.name
    const list = await repository.createList('Поставщики')
    await repository.createPoint(list.id, validPoint)
    db.close()
    const reopened = new GeoListsDatabase(name)
    const reopenedRepository = new GeoListsRepository(reopened)
    expect((await reopenedRepository.getLists())[0]?.name).toBe('Поставщики')
    expect((await reopenedRepository.getPoints(list.id))[0]?.longitude).toBe(validPoint.longitude)
    reopened.close()
  })

  it('импортирует список атомарно с новыми UUID', async () => {
    const sourceList = await repository.createList('Источник')
    const sourcePoint = await repository.createPoint(sourceList.id, validPoint)
    const data = await parseMapData(await createMapData(sourceList, [sourcePoint]))
    const imported = await repository.importMapData(data)
    const importedPoints = await repository.getPoints(imported.id)
    expect(imported.id).not.toBe(sourceList.id)
    expect(importedPoints[0]?.id).not.toBe(sourcePoint.id)
    expect(importedPoints[0]).toMatchObject({ name: sourcePoint.name, longitude: sourcePoint.longitude })
  })

  it('не оставляет частично импортированный список при ошибке транзакции', async () => {
    const sourceList = await repository.createList('Источник')
    const first = await repository.createPoint(sourceList.id, validPoint)
    const second = await repository.createPoint(sourceList.id, { ...validPoint, name: 'Вторая' })
    const data = await parseMapData(await createMapData(sourceList, [first, second]))
    const randomUuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000')
    await expect(repository.importMapData(data)).rejects.toThrow()
    randomUuid.mockRestore()
    expect((await repository.getLists()).map((item) => item.id)).toEqual([sourceList.id])
  })
})
