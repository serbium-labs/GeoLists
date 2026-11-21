import { describe, expect, it } from 'vitest'
import { formatMapSize, MAP_UPDATE_POLL_INTERVAL_MS } from './MapUpdates'

describe('map update presentation', () => {
  it('formats manifest and download sizes for the interface', () => {
    expect(formatMapSize(512)).toBe('512 B')
    expect(formatMapSize(92_610_255)).toBe('88.3 MB')
    expect(formatMapSize(2_147_483_648)).toBe('2.0 GB')
  })

  it('polls download progress no more than once per second', () => {
    expect(MAP_UPDATE_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(1_000)
  })
})
