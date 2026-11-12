import type { StyleSpecification } from 'maplibre-gl'
import type { MapSource, MapSourceMode } from '../types/map'
import { createLocalStyle } from './localStyle'

export const LOCAL_ARCHIVE_URL = '/maps/spb.pmtiles'
export const ONLINE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export const MAP_SOURCES: Record<MapSourceMode, MapSource> = {
  local: {
    id: 'local',
    label: 'Локальная',
    attribution: '© OpenStreetMap contributors',
  },
  online: {
    id: 'online',
    label: 'Онлайн',
    attribution: 'OpenFreeMap · © OpenStreetMap contributors',
  },
}

export function getMapStyle(mode: MapSourceMode): string | StyleSpecification {
  return mode === 'online' ? ONLINE_STYLE_URL : createLocalStyle()
}

export async function hasLocalArchive(signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(LOCAL_ARCHIVE_URL, {
      headers: { Range: 'bytes=0-6' },
      cache: 'no-store',
      signal,
    })

    if (!response.ok) return false

    const reader = response.body?.getReader()
    if (!reader) return false
    const { value } = await reader.read()
    await reader.cancel()
    if (!value || value.byteLength < 7) return false
    const signature = new TextDecoder().decode(value.slice(0, 7))
    return signature === 'PMTiles'
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return false
  }
}
