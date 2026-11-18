import type { StyleSpecification } from 'maplibre-gl'
import type { MapSource, MapSourceMode } from '../types/map'
import { createLocalStyle } from './localStyle'

export const LOCAL_ARCHIVE_URL = '/maps/spb.pmtiles'
export const ONLINE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export type LocalArchiveStatus =
  | { available: true }
  | { available: false; reason: 'not-found' | 'invalid' | 'range-unsupported' | 'http' | 'network'; status?: number }

export const MAP_SOURCES: Record<MapSourceMode, MapSource> = {
  local: {
    id: 'local',
    label: 'Локальная',
    attribution: 'Protomaps · © OpenStreetMap contributors',
  },
  online: {
    id: 'online',
    label: 'Онлайн',
    attribution: 'OpenFreeMap · © OpenStreetMap contributors',
  },
}

export function getMapStyle(mode: MapSourceMode, revision?: string): string | StyleSpecification {
  return mode === 'online' ? ONLINE_STYLE_URL : createLocalStyle(revision)
}

export async function inspectLocalArchive(signal: AbortSignal, revision?: string): Promise<LocalArchiveStatus> {
  try {
    const url = revision ? `${LOCAL_ARCHIVE_URL}?v=${encodeURIComponent(revision)}` : LOCAL_ARCHIVE_URL
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-6' },
      cache: 'no-store',
      signal,
    })

    if (response.status === 404) return { available: false, reason: 'not-found', status: 404 }
    if (!response.ok) return { available: false, reason: 'http', status: response.status }
    if (response.status !== 206 || !response.headers.get('content-range')) {
      await response.body?.cancel()
      return { available: false, reason: 'range-unsupported', status: response.status }
    }

    const reader = response.body?.getReader()
    if (!reader) return { available: false, reason: 'invalid' }
    const { value } = await reader.read()
    await reader.cancel()
    if (!value || value.byteLength < 7) return { available: false, reason: 'invalid' }
    const signature = new TextDecoder().decode(value.slice(0, 7))
    return signature === 'PMTiles' ? { available: true } : { available: false, reason: 'invalid' }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return { available: false, reason: 'network' }
  }
}

export function localArchiveErrorMessage(status: Exclude<LocalArchiveStatus, { available: true }>): string {
  switch (status.reason) {
    case 'not-found': return 'Локальная карта не установлена. Запустите сервер с подготовленным PMTiles-архивом или перейдите на онлайн-карту.'
    case 'invalid': return 'Файл локальной карты повреждён или не является архивом PMTiles.'
    case 'range-unsupported': return 'Сервер локальной карты не поддерживает Range-запросы. Запустите карту через сервер GeoLists.'
    case 'http': return `Сервер не смог открыть локальную карту (HTTP ${status.status ?? 'ошибка'}).`
    case 'network': return 'Сервер локальной карты недоступен. При разработке запустите npm run serve вместе с Vite.'
  }
}
