import type { MapSourceMode } from '../types/map'

const MAP_SOURCE_ORDER: MapSourceMode[] = ['online', 'local']

export function mapSourceForKey(current: MapSourceMode, key: string): MapSourceMode | null {
  if (key === 'Home') {
    return MAP_SOURCE_ORDER[0]
  }

  if (key === 'End') {
    return MAP_SOURCE_ORDER[MAP_SOURCE_ORDER.length - 1]
  }

  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
    return null
  }

  const currentIndex = MAP_SOURCE_ORDER.indexOf(current)
  const movesBackward = key === 'ArrowLeft' || key === 'ArrowUp'
  const offset = movesBackward ? -1 : 1
  const nextIndex = (currentIndex + offset + MAP_SOURCE_ORDER.length) % MAP_SOURCE_ORDER.length
  return MAP_SOURCE_ORDER[nextIndex]
}
