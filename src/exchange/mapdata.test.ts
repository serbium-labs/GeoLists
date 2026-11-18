import { describe, expect, it } from 'vitest'
import type { MapList, MapPoint } from '../types/data'
import { buildTwoGisUrl, createMapData, MAX_MAPDATA_BYTES, parseMapData } from './mapdata'

const list: MapList = { id: 'list-source', name: 'Поставщики', createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-02T10:00:00.000Z' }
const point: MapPoint = {
  id: 'point-source', listId: list.id, name: 'Склад', organization: 'Организация', address: 'Адрес',
  latitude: 59.934312345, longitude: 30.335112345, workingHours: '09:00–18:00', website: 'https://example.com/path',
  comment: 'Комментарий', createdAt: '2026-01-01T11:00:00.000Z', updatedAt: '2026-01-02T11:00:00.000Z',
}

describe('.mapdata', () => {
  it('экспортируется и повторно импортируется', async () => {
    const parsed = await parseMapData(await createMapData(list, [point]))
    expect(parsed.list.name).toBe(list.name)
    expect(parsed.points).toHaveLength(1)
  })

  it('сохраняет все метаданные и исходную точность координат', async () => {
    const parsed = await parseMapData(await createMapData(list, [point]))
    const { listId: _listId, ...expected } = point
    expect(parsed.points[0]).toEqual(expected)
  })

  it('отклоняет повреждённый JSON', async () => {
    await expect(parseMapData('{broken')).rejects.toThrow('valid JSON')
  })

  it('отклоняет неверную контрольную сумму', async () => {
    const exported = await createMapData(list, [point])
    await expect(parseMapData(exported.replace('Поставщики', 'Получатели'))).rejects.toThrow('Checksum mismatch')
  })

  it('отклоняет дублирующиеся ID', async () => {
    const duplicate = { ...point, name: 'Вторая точка' }
    await expect(parseMapData(await createMapData(list, [point, duplicate]))).rejects.toThrow('duplicate IDs')
  })

  it('отклоняет превышение размера', async () => {
    await expect(parseMapData(' '.repeat(MAX_MAPDATA_BYTES + 1))).rejects.toThrow('10 MB')
  })

  it('отклоняет опасный URL', async () => {
    const unsafe = { ...point, website: 'javascript:alert(1)' }
    await expect(parseMapData(await createMapData(list, [unsafe]))).rejects.toThrow('http or https')
  })

  it('создаёт документированную ссылку 2ГИС в порядке longitude,latitude', () => {
    expect(buildTwoGisUrl(30.335112345, 59.934312345)).toBe('https://2gis.ru/geo/30.335112345%2C59.934312345')
  })
})
