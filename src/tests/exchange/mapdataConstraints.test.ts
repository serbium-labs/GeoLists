import { describe, expect, it } from 'vitest'
import type { MapList, MapPoint } from '../../types/data'
import { createMapData, MAX_MAPDATA_BYTES, MAX_MAPDATA_POINTS, parseMapData, safeMapDataFilename } from '../../exchange/mapdata'

const LIST: MapList = {
  id: 'list-source',
  name: 'Places',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z',
}
const POINT: MapPoint = {
  id: 'point-source',
  listId: LIST.id,
  name: 'Cafe',
  organization: '',
  address: 'Main Street 1',
  latitude: 48.137154,
  longitude: 11.576124,
  workingHours: '',
  website: 'https://example.com',
  comment: '',
  createdAt: '2026-01-01T11:00:00.000Z',
  updatedAt: '2026-01-02T11:00:00.000Z',
}

describe('.mapdata constraints', () => {
  it('rejects files larger than 10 MB', async () => {
    await expect(parseMapData(' '.repeat(MAX_MAPDATA_BYTES + 1))).rejects.toThrow('10 MB')
  })

  it('rejects documents containing more than 10,000 points before processing entries', async () => {
    const points = Array.from({ length: MAX_MAPDATA_POINTS + 1 }, () => POINT)
    await expect(parseMapData(await createMapData(LIST, points))).rejects.toThrow(`more than ${MAX_MAPDATA_POINTS} points`)
  })

  it('applies shared normalization rules during import', async () => {
    const document = await createMapData(
      { ...LIST, name: '  Cafe\u0301 lists  ' },
      [{ ...POINT, name: '  東京  ', comment: '  First\r\nSecond  ', website: 'HTTPS://EXAMPLE.COM' }],
    )
    const parsed = await parseMapData(document)

    expect(parsed.list.name).toBe('Café lists')
    expect(parsed.points[0]).toMatchObject({ name: '東京', comment: 'First\nSecond', website: 'https://example.com/' })
  })

  it('creates safe Unicode filenames without splitting supplementary characters', () => {
    expect(safeMapDataFilename('  Sales / 東京 😀  ')).toBe('Sales _ 東京 😀.mapdata')
    expect(safeMapDataFilename('\\/:*?"<>|')).toBe('_________.mapdata')
    expect(safeMapDataFilename('   ')).toBe('geolists.mapdata')
    expect(Array.from(safeMapDataFilename('😀'.repeat(181)).replace('.mapdata', ''))).toHaveLength(180)
  })
})
