import { HttpStatus, REGION_COORDINATE_LIMITS } from './server-config.mjs'

const REQUEST_TIMEOUT_MS = 10_000
const MINIMUM_REQUEST_INTERVAL_MS = 1_000
const ADDRESS_MAX_LENGTH = 500
const MAXIMUM_CACHED_RESULTS = 500
const NOMINATIM_USER_AGENT = 'GeoLists/0.1 (+https://github.com/serbium-labs/GeoLists)'
const PRINTABLE_ADDRESS_PATTERN = /^[^\u0000-\u001f\u007f-\u009f]*$/u

export const GEOCODING_SOURCE = {
  label: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
}

export class ReverseGeocodingError extends Error {
  constructor(message, status = HttpStatus.BAD_GATEWAY) {
    super(message)
    this.name = 'ReverseGeocodingError'
    this.status = status
  }
}

export function reverseGeocodingEndpoint(env = process.env) {
  const configured = env.REVERSE_GEOCODING_URL
  if (typeof configured !== 'string' || configured.trim().length === 0) {
    return null
  }

  let endpoint
  try {
    endpoint = new URL(configured)
  } catch {
    throw new Error('REVERSE_GEOCODING_URL must be a valid HTTPS URL')
  }

  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
    throw new Error('REVERSE_GEOCODING_URL must be a valid HTTPS URL without embedded credentials')
  }

  return endpoint
}

function validCoordinate(value, minimum, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function isValidAddress(address) {
  if (!address) {
    return false
  }

  const withinLengthLimit = Array.from(address).length <= ADDRESS_MAX_LENGTH
  const containsOnlyPrintableCharacters = PRINTABLE_ADDRESS_PATTERN.test(address)

  return withinLengthLimit && containsOnlyPrintableCharacters
}

function normalizedAddress(value) {
  if (typeof value !== 'string') {
    return null
  }

  const address = value.normalize('NFC').trim()
  if (!isValidAddress(address)) {
    return null
  }

  return address
}

export function createReverseGeocoder({ endpoint, fetchImpl = fetch, now = Date.now }) {
  let lastRequestStartedAt = Number.NEGATIVE_INFINITY
  const resultCache = new Map()

  return async function reverseGeocode({ latitude, longitude, signal }) {
    const validLatitude = validCoordinate(
      latitude,
      REGION_COORDINATE_LIMITS.latitudeDegrees.minimum,
      REGION_COORDINATE_LIMITS.latitudeDegrees.maximum,
    )
    const validLongitude = validCoordinate(
      longitude,
      REGION_COORDINATE_LIMITS.longitudeDegrees.minimum,
      REGION_COORDINATE_LIMITS.longitudeDegrees.maximum,
    )

    if (!validLatitude || !validLongitude) {
      throw new ReverseGeocodingError('Valid latitude and longitude are required', HttpStatus.BAD_REQUEST)
    }

    const cacheKey = `${latitude},${longitude}`
    if (resultCache.has(cacheKey)) {
      return resultCache.get(cacheKey)
    }

    const currentTime = now()
    if (currentTime - lastRequestStartedAt < MINIMUM_REQUEST_INTERVAL_MS) {
      throw new ReverseGeocodingError('Please wait before requesting another address', HttpStatus.TOO_MANY_REQUESTS)
    }
    lastRequestStartedAt = currentTime

    const url = new URL(endpoint)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('addressdetails', '0')
    url.searchParams.set('lat', String(latitude))
    url.searchParams.set('lon', String(longitude))

    let response
    try {
      response = await fetchImpl(url, {
        headers: {
          accept: 'application/json',
          'accept-language': 'en',
          'user-agent': NOMINATIM_USER_AGENT,
        },
        signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (signal) {
          throw error
        }
        throw new ReverseGeocodingError('The address service timed out', HttpStatus.GATEWAY_TIMEOUT)
      }
      throw new ReverseGeocodingError('The address service is unavailable')
    }

    if (response.status === HttpStatus.NOT_FOUND) {
      const result = { address: null, source: GEOCODING_SOURCE }
      resultCache.set(cacheKey, result)
      return result
    }
    if (!response.ok) {
      throw new ReverseGeocodingError(`The address service returned HTTP ${response.status}`)
    }

    const payload = await response.json().catch(() => {
      throw new ReverseGeocodingError('The address service returned an invalid response')
    })
    const address = normalizedAddress(payload?.display_name)
    const result = { address, source: GEOCODING_SOURCE }
    if (resultCache.size >= MAXIMUM_CACHED_RESULTS) {
      resultCache.delete(resultCache.keys().next().value)
    }
    resultCache.set(cacheKey, result)
    return result
  }
}
