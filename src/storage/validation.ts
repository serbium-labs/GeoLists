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
  if (!trimmed) throw new ValidationError(`${label}: заполните поле.`)
  if (trimmed.length > max) throw new ValidationError(`${label}: не более ${max} символов.`)
  return trimmed
}

function optional(value: string, label: string, max: number) {
  const trimmed = value.trim()
  if (trimmed.length > max) throw new ValidationError(`${label}: не более ${max} символов.`)
  return trimmed
}

export function validateListName(name: string) {
  return required(name, 'Название списка', 100)
}

export function validatePointFields(fields: PointFields): PointFields {
  if (!Number.isFinite(fields.latitude) || fields.latitude < -90 || fields.latitude > 90) {
    throw new ValidationError('Широта должна быть числом от −90 до 90.')
  }
  if (!Number.isFinite(fields.longitude) || fields.longitude < -180 || fields.longitude > 180) {
    throw new ValidationError('Долгота должна быть числом от −180 до 180.')
  }

  const website = optional(fields.website, 'Сайт', limits.website)
  if (website) {
    try {
      const parsed = new URL(website)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
    } catch {
      throw new ValidationError('Сайт должен быть корректным URL с протоколом http или https.')
    }
  }

  return {
    name: required(fields.name, 'Название точки', 150),
    organization: optional(fields.organization, 'Предприятие / организация', limits.organization),
    address: optional(fields.address, 'Адрес', limits.address),
    workingHours: optional(fields.workingHours, 'Часы работы', limits.workingHours),
    website,
    comment: optional(fields.comment, 'Комментарий', limits.comment),
    latitude: fields.latitude,
    longitude: fields.longitude,
  }
}
