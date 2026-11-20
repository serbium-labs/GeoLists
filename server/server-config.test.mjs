import { describe, expect, it } from 'vitest'
import { httpHost } from './server-config.mjs'

describe('httpHost', () => {
  it('binds only to loopback by default', () => {
    expect(httpHost({})).toBe('127.0.0.1')
  })

  it('allows Docker to bind to all interfaces explicitly', () => {
    expect(httpHost({ HTTP_HOST: '0.0.0.0' })).toBe('0.0.0.0')
  })
})
