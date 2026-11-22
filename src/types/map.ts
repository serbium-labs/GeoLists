export type MapSourceMode = 'local' | 'online'

export interface Coordinates {
  longitude: number
  latitude: number
}

export type MapBounds = [number, number, number, number]

export interface MapViewport {
  bounds: MapBounds
  zoom: number
}

export interface OfflineRegion {
  id: string
  name: string
  bounds: MapBounds
  center: [number, number]
  maxZoom: number
  size: number
  url: string
  revision: string
  createdAt: string
}

export interface MapSource {
  id: MapSourceMode
  label: string
  attribution: string
}
