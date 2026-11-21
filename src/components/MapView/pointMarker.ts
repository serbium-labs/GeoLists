export interface PointMarkerPresentation {
  accessibleLabel: string
  className: string
  pressed: string
}

export function pointMarkerPresentation(pointName: string, selected: boolean): PointMarkerPresentation {
  return {
    accessibleLabel: selected ? `${pointName}, selected` : `Select ${pointName}`,
    className: selected ? 'point-marker selected' : 'point-marker',
    pressed: String(selected),
  }
}
