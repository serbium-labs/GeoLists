import { describe, expect, it } from 'vitest'
import { pointMarkerPresentation } from '../../components/MapView/pointMarker'

describe('point marker presentation', () => {
  it('exposes the point name and unselected state', () => {
    expect(pointMarkerPresentation('Central Library', false)).toEqual({
      accessibleLabel: 'Select Central Library',
      className: 'point-marker',
      pressed: 'false',
    })
  })

  it('announces and styles the selected point', () => {
    expect(pointMarkerPresentation('Central Library', true)).toEqual({
      accessibleLabel: 'Central Library, selected',
      className: 'point-marker selected',
      pressed: 'true',
    })
  })
})
