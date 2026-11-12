export interface MapList {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface MapPoint {
  id: string
  listId: string
  name: string
  organization: string
  address: string
  latitude: number
  longitude: number
  workingHours: string
  website: string
  comment: string
  createdAt: string
  updatedAt: string
}

export type PointFields = Omit<MapPoint, 'id' | 'listId' | 'createdAt' | 'updatedAt'>
