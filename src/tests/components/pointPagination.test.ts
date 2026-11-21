import { describe, expect, it } from 'vitest'
import { pageContainingPoint, pointPage, POINTS_PER_PAGE } from '../../components/Sidebar/pointPagination'
import type { MapPoint } from '../../types/data'

function point(index: number): MapPoint {
  return {
    id: `point-${index}`,
    listId: 'list',
    name: `Point ${index}`,
    organization: '',
    address: '',
    latitude: 50,
    longitude: 10,
    workingHours: '',
    website: '',
    comment: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('point pagination', () => {
  const points = Array.from({ length: 10_000 }, (_, index) => point(index))

  it('bounds the number of simultaneously rendered sidebar entries', () => {
    expect(pointPage(points, 0).items).toHaveLength(POINTS_PER_PAGE)
    expect(pointPage(points, 99).items).toHaveLength(POINTS_PER_PAGE)
  })

  it('opens the page containing a selected point', () => {
    expect(pageContainingPoint(points, 'point-9')).toBe(0)
    expect(pageContainingPoint(points, 'point-9999')).toBe(99)
    expect(pageContainingPoint(points, 'missing')).toBeNull()
  })

  it('clamps a page after the point list shrinks', () => {
    expect(pointPage(points.slice(0, 120), 99)).toMatchObject({ page: 1, pageCount: 2 })
  })
})
