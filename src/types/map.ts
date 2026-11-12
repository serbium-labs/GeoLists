export type MapSourceMode = 'local' | 'online'

export interface Coordinates {
  longitude: number
  latitude: number
}

export interface MapSource {
  id: MapSourceMode
  label: string
  attribution: string
}
