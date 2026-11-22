import { describe, expect, it } from 'vitest'
import {
  createMapPointData,
  MAP_POINT_CLUSTER_OPTIONS,
} from '../../components/MapView/mapPointData'
import type { MapPoint } from '../../types/data'

function point(index: number): MapPoint {
  return {
    id: `point-${index}`,
    listId: 'list',
    name: `Point ${index}`,
    organization: '',
    address: '',
    latitude: 50 + index / 100_000,
    longitude: 10 + index / 100_000,
    workingHours: '',
    website: '',
    comment: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('clustered map point data', () => {
  it('represents 10,000 points as GeoJSON data without marker elements', () => {
    const points = Array.from({ length: 10_000 }, (_, index) => point(index))
    const data = createMapPointData(points, 'point-9')

    expect(data.features).toHaveLength(10_000)
    expect(data.features[9].properties.selected).toBe(true)
    expect(MAP_POINT_CLUSTER_OPTIONS).toEqual({ cluster: true, clusterMaxZoom: 14, clusterRadius: 50 })
  })

  it('rebuilds source data when points or selection change', () => {
    const initial = createMapPointData([point(1), point(2)], 'point-1')
    const updated = createMapPointData([point(2)], 'point-2')

    expect(initial.features.map((feature) => feature.properties.selected)).toEqual([true, false])
    expect(updated.features).toHaveLength(1)
    expect(updated.features[0]).toMatchObject({ id: 'point-2', properties: { selected: true } })
  })
})
