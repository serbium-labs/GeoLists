import type { StyleSpecification } from 'maplibre-gl'
import type { MapSource, MapSourceMode } from '../types/map'
import { createLocalStyle } from './localStyle'

export const LOCAL_ARCHIVE_URL = '/maps/spb.pmtiles'
export const ONLINE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const availableArchiveVersions = new Set<string>()

export type LocalArchiveStatus =
  | { available: true }
  | { available: false; reason: 'not-found' | 'invalid' | 'range-unsupported' | 'http' | 'network'; status?: number }

export const MAP_SOURCES: Record<MapSourceMode, MapSource> = {
  local: {
    id: 'local',
    label: 'Local',
    attribution: 'Protomaps · © OpenStreetMap contributors',
  },
  online: {
    id: 'online',
    label: 'Online',
    attribution: 'OpenFreeMap · © OpenStreetMap contributors',
  },
}

export function getMapStyle(mode: MapSourceMode, revision?: string, localArchiveUrl = LOCAL_ARCHIVE_URL): string | StyleSpecification {
  return mode === 'online' ? ONLINE_STYLE_URL : createLocalStyle(revision, localArchiveUrl)
}

export async function inspectLocalArchive(signal: AbortSignal, revision?: string, localArchiveUrl = LOCAL_ARCHIVE_URL): Promise<LocalArchiveStatus> {
  try {
    const url = revision ? `${localArchiveUrl}?v=${encodeURIComponent(revision)}` : localArchiveUrl
    if (revision && availableArchiveVersions.has(url)) {
      return { available: true }
    }

    const response = await fetch(url, {
      headers: { Range: 'bytes=0-6' },
      cache: revision ? 'force-cache' : 'no-store',
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
    if (signature !== 'PMTiles') {
      return { available: false, reason: 'invalid' }
    }

    if (revision) {
      availableArchiveVersions.add(url)
    }

    return { available: true }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return { available: false, reason: 'network' }
  }
}

export function localArchiveErrorMessage(status: Exclude<LocalArchiveStatus, { available: true }>): string {
  switch (status.reason) {
    case 'not-found': return 'The local map is not installed. Start the server with a prepared PMTiles archive or switch to the online map.'
    case 'invalid': return 'The local map file is corrupted or is not a PMTiles archive.'
    case 'range-unsupported': return 'The local map server does not support range requests. Run the map through the GeoLists server.'
    case 'http': return `The server could not open the local map (HTTP ${status.status ?? 'error'}).`
    case 'network': return 'The local map server is unavailable. During development, run npm run serve alongside Vite.'
  }
}
