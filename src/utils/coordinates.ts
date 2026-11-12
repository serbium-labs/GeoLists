import type { Coordinates } from '../types/map'

const DISPLAY_PRECISION = 6

export function formatCoordinate(value: number): string {
  return value.toFixed(DISPLAY_PRECISION)
}

export function formatCoordinates({ longitude, latitude }: Coordinates): string {
  return `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`
}
