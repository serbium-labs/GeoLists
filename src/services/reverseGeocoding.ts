import type { PointFields } from '../types/data'
import { APP_CONFIG } from '../config/appConfig'
import { validateAddress, validateCoordinates } from '../storage/validation'
import { isNull } from '../utils/nullish'

export interface GeocodingSource {
  label: string
  url: string
}

export interface ReverseGeocodingStatus {
  configured: boolean
  source: GeocodingSource | null
}

export interface ReverseGeocodingResult {
  address: string | null
  source: GeocodingSource
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && !isNull(value) && !Array.isArray(value)
}

function parseSource(value: unknown): GeocodingSource | null {
  if (!isRecord(value) || typeof value.label !== 'string' || typeof value.url !== 'string') {
    return null
  }

  let url: URL
  try {
    url = new URL(value.url)
  } catch {
    return null
  }

  return url.protocol === 'https:' ? { label: value.label, url: url.href } : null
}

async function responseValue(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => null)
  if (!isRecord(value)) {
    throw new Error('The address service returned an invalid response.')
  }

  if (!response.ok) {
    throw new Error(typeof value.error === 'string' ? value.error : `Address lookup failed with HTTP ${response.status}.`)
  }

  return value
}

export async function getReverseGeocodingStatus(signal: AbortSignal): Promise<ReverseGeocodingStatus> {
  const response: Response = await fetch(APP_CONFIG.api.geocodingStatus, { cache: 'no-store', signal })
  const value: Record<string, unknown> = await responseValue(response)
  const source: GeocodingSource | null = parseSource(value.source)
  if (typeof value.configured !== 'boolean' || (value.configured && !source)) {
    throw new Error('The address service returned an invalid status.')
  }

  return { configured: value.configured, source }
}

export async function resolveAddress(latitude: number, longitude: number, signal: AbortSignal): Promise<ReverseGeocodingResult> {
  const coordinates: { latitude: number; longitude: number } = validateCoordinates(latitude, longitude)
  const response: Response = await fetch(APP_CONFIG.api.reverseGeocoding, {
    method: 'POST',
    headers: APP_CONFIG.mutationHeaders,
    body: JSON.stringify(coordinates),
    signal,
  })
  const value: Record<string, unknown> = await responseValue(response)
  const source: GeocodingSource | null = parseSource(value.source)
  const hasValidAddressType: boolean = isNull(value.address) || typeof value.address === 'string'
  if (!source || !hasValidAddressType) {
    throw new Error('The address service returned an invalid result.')
  }
  const address: string | null = isNull(value.address) ? null : validateAddress(value.address)

  return { address, source }
}

export function applyResolvedAddress<T extends Pick<PointFields, 'address'>>(values: T, address: string): T {
  return { ...values, address: validateAddress(address) }
}
