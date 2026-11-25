import type { StyleSpecification } from 'maplibre-gl'
import type { MapSource, MapSourceMode } from '../types/map'
import { APP_CONFIG, HttpStatus } from './appConfig'
import { createLocalStyle } from './localStyle'

export const LOCAL_ARCHIVE_URL = APP_CONFIG.map.localArchiveUrl
export const ONLINE_STYLE_URL = APP_CONFIG.map.onlineStyleUrl
const availableArchiveVersions = new Set<string>()

export type LocalArchiveStatus =
  | { available: true }
  | { available: false; reason: 'not-found' | 'invalid' | 'range-unsupported' | 'http' | 'network'; status?: number }

type UnavailableArchiveStatus = Exclude<LocalArchiveStatus, { available: true }>

export const MAP_SOURCES: Record<MapSourceMode, MapSource> = APP_CONFIG.map.sources

export function getMapStyle(mode: MapSourceMode, revision?: string, localArchiveUrl = LOCAL_ARCHIVE_URL): string | StyleSpecification {
  return mode === 'online' ? ONLINE_STYLE_URL : createLocalStyle(revision, localArchiveUrl)
}

export async function inspectLocalArchive(signal: AbortSignal, revision?: string, localArchiveUrl = LOCAL_ARCHIVE_URL): Promise<LocalArchiveStatus> {
  try {
    const url: string = revision ? `${localArchiveUrl}?v=${encodeURIComponent(revision)}` : localArchiveUrl
    if (revision && availableArchiveVersions.has(url)) {
      return { available: true }
    }

    const response: Response = await fetch(url, {
      headers: { Range: 'bytes=0-6' },
      cache: revision ? 'force-cache' : 'no-store',
      signal,
    })

    if (response.status === HttpStatus.NotFound) {
      return { available: false, reason: 'not-found', status: HttpStatus.NotFound }
    }
    if (!response.ok) {
      return { available: false, reason: 'http', status: response.status }
    }
    if (response.status !== HttpStatus.PartialContent || !response.headers.get('content-range')) {
      await response.body?.cancel()
      return { available: false, reason: 'range-unsupported', status: response.status }
    }

    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader()
    if (!reader) {
      return { available: false, reason: 'invalid' }
    }
    const { value } = await reader.read()
    await reader.cancel()
    if (!value || value.byteLength < 7) {
      return { available: false, reason: 'invalid' }
    }
    const signature: string = new TextDecoder().decode(value.slice(0, 7))
    if (signature !== 'PMTiles') {
      return { available: false, reason: 'invalid' }
    }

    if (revision) {
      availableArchiveVersions.add(url)
    }

    return { available: true }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    return { available: false, reason: 'network' }
  }
}

const LOCAL_ARCHIVE_ERROR_MESSAGES: Record<UnavailableArchiveStatus['reason'], (status: UnavailableArchiveStatus) => string> = {
  'not-found': () => 'The local map is not installed. Start the server with a prepared PMTiles archive or switch to the online map.',
  invalid: () => 'The local map file is corrupted or is not a PMTiles archive.',
  'range-unsupported': () => 'The local map server does not support range requests. Run the map through the GeoLists server.',
  http: (status) => `The server could not open the local map (HTTP ${status.status ?? 'error'}).`,
  network: () => 'The local map server is unavailable. During development, run npm run serve alongside Vite.',
}

export function localArchiveErrorMessage(status: UnavailableArchiveStatus): string {
  return LOCAL_ARCHIVE_ERROR_MESSAGES[status.reason](status)
}
