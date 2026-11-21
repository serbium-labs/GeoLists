import { describe, expect, it } from 'vitest'
import { authorizeMapApiMutation, isMapApiMutation, MAP_API_CSRF_HEADER, MAP_API_CSRF_VALUE } from '../map-api-security.mjs'

function request({ remoteAddress = '127.0.0.1', host = '127.0.0.1:4173', origin, authorization, csrf = MAP_API_CSRF_VALUE } = {}) {
  const headers = { host, origin, authorization }
  if (csrf !== null) {
    headers[MAP_API_CSRF_HEADER] = csrf
  }

  return {
    socket: { remoteAddress },
    headers,
  }
}

describe('map update API security', () => {
  it('protects both map mutation endpoints without covering read-only status', () => {
    expect(isMapApiMutation('POST', '/api/maps/check')).toBe(true)
    expect(isMapApiMutation('POST', '/api/maps/update')).toBe(true)
    expect(isMapApiMutation('GET', '/api/maps/status')).toBe(false)
    expect(isMapApiMutation('POST', '/api/regions/estimate')).toBe(true)
    expect(isMapApiMutation('POST', '/api/regions/download')).toBe(true)
    expect(isMapApiMutation('POST', '/api/regions/activate')).toBe(true)
    expect(isMapApiMutation('POST', '/api/regions/cancel')).toBe(true)
    expect(isMapApiMutation('GET', '/api/regions')).toBe(false)
  })

  it('allows a same-origin loopback request without a token', () => {
    const result = authorizeMapApiMutation(request({ origin: 'http://127.0.0.1:4173' }), {})

    expect(result).toEqual({ allowed: true })
  })

  it('rejects a loopback request without CSRF protection', () => {
    const result = authorizeMapApiMutation(request({ csrf: null }), {})

    expect(result).toMatchObject({ allowed: false, status: 403 })
  })

  it('rejects external access when no authentication is configured', () => {
    const result = authorizeMapApiMutation(request({ remoteAddress: '203.0.113.10' }), {})

    expect(result).toMatchObject({ allowed: false, status: 403 })
  })

  it('requires the configured bearer token for external access', () => {
    const env = { MAP_UPDATE_API_TOKEN: 'test-secret' }
    const missing = authorizeMapApiMutation(request({ remoteAddress: '203.0.113.10' }), env)
    const invalid = authorizeMapApiMutation(request({ remoteAddress: '203.0.113.10', authorization: 'Bearer wrong' }), env)
    const valid = authorizeMapApiMutation(request({ remoteAddress: '203.0.113.10', authorization: 'Bearer test-secret' }), env)

    expect(missing).toMatchObject({ allowed: false, status: 401 })
    expect(invalid).toMatchObject({ allowed: false, status: 401 })
    expect(valid).toEqual({ allowed: true })
  })

  it('rejects a cross-origin request even with valid authentication', () => {
    const result = authorizeMapApiMutation(request({
      remoteAddress: '203.0.113.10',
      origin: 'https://attacker.example',
      host: 'maps.example',
      authorization: 'Bearer test-secret',
    }), { MAP_UPDATE_API_TOKEN: 'test-secret' })

    expect(result).toMatchObject({ allowed: false, status: 403 })
  })

  it('allows the explicitly local-only Docker deployment', () => {
    const result = authorizeMapApiMutation(request({ remoteAddress: '172.18.0.1' }), {
      MAP_UPDATE_API_LOCAL_ONLY: 'true',
    })

    expect(result).toEqual({ allowed: true })
  })

  it('does not bypass a configured token in local-only mode', () => {
    const result = authorizeMapApiMutation(request({ remoteAddress: '172.18.0.1' }), {
      MAP_UPDATE_API_LOCAL_ONLY: 'true',
      MAP_UPDATE_API_TOKEN: 'test-secret',
    })

    expect(result).toMatchObject({ allowed: false, status: 401 })
  })
})
