export function isNull(value: unknown): value is null {
  return Object.is(value, null)
}

export function isUndefined(value: unknown): value is undefined {
  return typeof value === 'undefined'
}

export function isPresent<T>(value: T | null | undefined): value is T {
  return !isNull(value) && !isUndefined(value)
}
