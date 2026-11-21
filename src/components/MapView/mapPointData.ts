import type { FeatureCollection, Point } from 'geojson'
import type { MapPoint } from '../../types/data'

export const MAP_POINT_SOURCE_ID = 'geolists-points'
export const MAP_CLUSTER_LAYER_ID = 'geolists-point-clusters'
export const MAP_CLUSTER_COUNT_LAYER_ID = 'geolists-point-cluster-count'
export const MAP_POINT_LAYER_ID = 'geolists-unclustered-points'
export const MAP_SELECTED_POINT_LAYER_ID = 'geolists-selected-point'
export const MAP_POINT_LABEL_LAYER_ID = 'geolists-point-labels'
export const MAP_CLUSTER_MAX_ZOOM = 14
export const MAP_CLUSTER_RADIUS = 50
export const MAP_POINT_CLUSTER_OPTIONS = {
  cluster: true,
  clusterMaxZoom: MAP_CLUSTER_MAX_ZOOM,
  clusterRadius: MAP_CLUSTER_RADIUS,
} as const

export interface MapPointProperties {
  id: string
  name: string
  selected: boolean
}

export function createMapPointData(points: MapPoint[], selectedPointId: string | null): FeatureCollection<Point, MapPointProperties> {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      id: point.id,
      properties: {
        id: point.id,
        name: point.name,
        selected: point.id === selectedPointId,
      },
      geometry: {
        type: 'Point',
        coordinates: [point.longitude, point.latitude],
      },
    })),
  }
}
