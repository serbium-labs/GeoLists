import { timingSafeEqual } from 'node:crypto'
import { HttpStatus } from './server-config.mjs'
import { isUndefined } from './value-utils.mjs'

export const MAP_API_CSRF_HEADER = 'x-geolists-csrf'
export const MAP_API_CSRF_VALUE = '1'
const MAP_API_MUTATION_PATHS = new Set([
  '/api/maps/check',
  '/api/maps/update',
  '/api/regions/estimate',
  '/api/regions/download',
  '/api/regions/activate',
  '/api/regions/cancel',
  '/api/geocoding/reverse',
])
const IPV4_LOOPBACK_PATTERN = /^127\./
const IPV4_MAPPED_LOOPBACK_PATTERN = /^::ffff:127\./i

export function isMapApiMutation(method, pathname) {
  return method === 'POST' && MAP_API_MUTATION_PATHS.has(pathname)
}

function isLoopbackAddress(address) {
  if (typeof address !== 'string') {
    return false
  }

  return address === '::1' || IPV4_LOOPBACK_PATTERN.test(address) || IPV4_MAPPED_LOOPBACK_PATTERN.test(address)
}

function isTrustedLocalDeployment(request, env) {
  const remoteAddress = request.socket?.remoteAddress
  return isLoopbackAddress(remoteAddress) || env.MAP_UPDATE_API_LOCAL_ONLY === 'true'
}

function bearerToken(authorization) {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return null
  }

  const token = authorization.slice('Bearer '.length).trim()
  return token || null
}

function tokenMatches(expected, actual) {
  if (typeof expected !== 'string' || !expected || typeof actual !== 'string') {
    return false
  }

  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)
  if (expectedBuffer.length !== actualBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, actualBuffer)
}

function hasValidConfiguredToken(request, configuredToken) {
  const suppliedToken = bearerToken(request.headers.authorization)
  return tokenMatches(configuredToken, suppliedToken)
}

function isSameOrigin(request) {
  const origin = request.headers.origin
  if (isUndefined(origin)) {
    return true
  }

  if (typeof origin !== 'string' || typeof request.headers.host !== 'string') {
    return false
  }

  try {
    return new URL(origin).host.toLowerCase() === request.headers.host.toLowerCase()
  } catch {
    return false
  }
}

function denied(status, error) {
  return { allowed: false, status, error }
}

export function authorizeMapApiMutation(request, env = process.env) {
  const configuredToken = env.MAP_UPDATE_API_TOKEN
  const hasConfiguredToken = typeof configuredToken === 'string' && configuredToken.length > 0

  if (hasConfiguredToken && !hasValidConfiguredToken(request, configuredToken)) {
    return denied(HttpStatus.UNAUTHORIZED, 'Map update API authentication required')
  }

  if (!hasConfiguredToken && !isTrustedLocalDeployment(request, env)) {
    return denied(HttpStatus.FORBIDDEN, 'Map update API is disabled for external access')
  }

  if (request.headers[MAP_API_CSRF_HEADER] !== MAP_API_CSRF_VALUE) {
    return denied(HttpStatus.FORBIDDEN, 'Map update API CSRF validation failed')
  }

  if (!isSameOrigin(request)) {
    return denied(HttpStatus.FORBIDDEN, 'Map update API origin validation failed')
  }

  return { allowed: true }
}
