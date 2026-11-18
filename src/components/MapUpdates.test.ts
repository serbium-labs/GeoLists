import { describe, expect, it } from 'vitest'
import { formatMapSize } from './MapUpdates'

describe('map update presentation', () => {
  it('formats manifest and download sizes for the interface', () => {
    expect(formatMapSize(512)).toBe('512 Б')
    expect(formatMapSize(92_610_255)).toBe('88.3 МБ')
    expect(formatMapSize(2_147_483_648)).toBe('2.0 ГБ')
  })
})
