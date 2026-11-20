import { describe, expect, it } from 'vitest'
import { mapSourceForKey } from '../../components/mapSourceKeyboard'

describe('map-source keyboard navigation', () => {
  it('moves between sources with arrow keys and wraps at both ends', () => {
    expect(mapSourceForKey('online', 'ArrowRight')).toBe('local')
    expect(mapSourceForKey('local', 'ArrowRight')).toBe('online')
    expect(mapSourceForKey('online', 'ArrowLeft')).toBe('local')
    expect(mapSourceForKey('local', 'ArrowUp')).toBe('online')
  })

  it('supports Home and End without intercepting unrelated keys', () => {
    expect(mapSourceForKey('local', 'Home')).toBe('online')
    expect(mapSourceForKey('online', 'End')).toBe('local')
    expect(mapSourceForKey('online', 'Tab')).toBeNull()
  })
})
