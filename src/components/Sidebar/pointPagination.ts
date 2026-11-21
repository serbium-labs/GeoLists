import type { MapPoint } from '../../types/data'

export const POINTS_PER_PAGE = 100

export interface PointPage {
  items: MapPoint[]
  page: number
  pageCount: number
  startIndex: number
  endIndex: number
}

function pageCountFor(points: MapPoint[]): number {
  return Math.max(1, Math.ceil(points.length / POINTS_PER_PAGE))
}

export function pointPage(points: MapPoint[], requestedPage: number): PointPage {
  const pageCount = pageCountFor(points)
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1)
  const startIndex = page * POINTS_PER_PAGE
  const endIndex = Math.min(points.length, startIndex + POINTS_PER_PAGE)

  return {
    items: points.slice(startIndex, endIndex),
    page,
    pageCount,
    startIndex,
    endIndex,
  }
}

export function pageContainingPoint(points: MapPoint[], pointId: string): number | null {
  const pointIndex = points.findIndex((point) => point.id === pointId)
  return pointIndex === -1 ? null : Math.floor(pointIndex / POINTS_PER_PAGE)
}
