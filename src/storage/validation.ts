import type { PointFields } from '../types/data'

const limits = {
  organization: 200,
  address: 500,
  workingHours: 300,
  website: 2048,
  comment: 3000,
} as const

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function required(value: string, label: string, max: number) {
  const trimmed = value.trim()
  if (!trimmed) throw new ValidationError(`${label}: this field is required.`)
  if (trimmed.length > max) throw new ValidationError(`${label}: must be no more than ${max} characters.`)
  return trimmed
}

function optional(value: string, label: string, max: number) {
  const trimmed = value.trim()
  if (trimmed.length > max) throw new ValidationError(`${label}: must be no more than ${max} characters.`)
  return trimmed
}

export function validateListName(name: string) {
  return required(name, 'List name', 100)
}

export function validatePointFields(fields: PointFields): PointFields {
  if (!Number.isFinite(fields.latitude) || fields.latitude < -90 || fields.latitude > 90) {
    throw new ValidationError('Latitude must be a number from −90 to 90.')
  }
  if (!Number.isFinite(fields.longitude) || fields.longitude < -180 || fields.longitude > 180) {
    throw new ValidationError('Longitude must be a number from −180 to 180.')
  }

  const website = optional(fields.website, 'Website', limits.website)
  if (website) {
    try {
      const parsed = new URL(website)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
    } catch {
      throw new ValidationError('Website must be a valid URL using the http or https protocol.')
    }
  }

  return {
    name: required(fields.name, 'Point name', 150),
    organization: optional(fields.organization, 'Business / organization', limits.organization),
    address: optional(fields.address, 'Address', limits.address),
    workingHours: optional(fields.workingHours, 'Business hours', limits.workingHours),
    website,
    comment: optional(fields.comment, 'Comment', limits.comment),
    latitude: fields.latitude,
    longitude: fields.longitude,
  }
}
