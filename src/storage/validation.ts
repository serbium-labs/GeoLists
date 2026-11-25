import type { PointFields } from '../types/data'
import { GEOGRAPHIC_COORDINATE_LIMITS } from '../config/appConfig'

export const TEXT_FIELD_RULES = {
  listName: { label: 'List name', maxLength: 100, required: true, multiline: false },
  name: { label: 'Point name', maxLength: 150, required: true, multiline: false },
  organization: { label: 'Business / organization', maxLength: 200, required: false, multiline: false },
  address: { label: 'Address', maxLength: 500, required: false, multiline: false },
  workingHours: { label: 'Business hours', maxLength: 300, required: false, multiline: false },
  website: { label: 'Website', maxLength: 2_048, required: false, multiline: false },
  comment: { label: 'Comment', maxLength: 3_000, required: false, multiline: true },
} as const

export const COORDINATE_RULES = {
  latitude: { label: 'Latitude', ...GEOGRAPHIC_COORDINATE_LIMITS.latitude },
  longitude: { label: 'Longitude', ...GEOGRAPHIC_COORDINATE_LIMITS.longitude },
} as const

type TextFieldRule = (typeof TEXT_FIELD_RULES)[keyof typeof TEXT_FIELD_RULES]
const INVALID_UNICODE_PATTERN = /[\uD800-\uDFFF]/u
const SINGLE_LINE_CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u
const MULTILINE_CONTROL_PATTERN = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/u
const WINDOWS_LINE_ENDING_PATTERN = /\r\n?/g

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function characterCount(value: string): number {
  return Array.from(value).length
}

function normalizeLineEndings(value: string): string {
  return value.replace(WINDOWS_LINE_ENDING_PATTERN, '\n')
}

function validateCharacters(value: string, rule: TextFieldRule): void {
  if (INVALID_UNICODE_PATTERN.test(value)) {
    throw new ValidationError(`${rule.label}: contains invalid Unicode.`)
  }

  const controlPattern = rule.multiline ? MULTILINE_CONTROL_PATTERN : SINGLE_LINE_CONTROL_PATTERN
  if (controlPattern.test(value)) {
    const allowedText = rule.multiline ? 'printable characters and line breaks' : 'printable single-line characters'
    throw new ValidationError(`${rule.label}: use only ${allowedText}.`)
  }
}

function normalizeText(value: unknown, rule: TextFieldRule): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${rule.label}: must be text.`)
  }

  const normalized = normalizeLineEndings(value).normalize('NFC').trim()
  validateCharacters(normalized, rule)

  if (rule.required && normalized.length === 0) {
    throw new ValidationError(`${rule.label}: this field is required.`)
  }

  if (characterCount(normalized) > rule.maxLength) {
    throw new ValidationError(`${rule.label}: must be no more than ${rule.maxLength} characters.`)
  }

  return normalized
}

function validateCoordinate(value: unknown, rule: (typeof COORDINATE_RULES)[keyof typeof COORDINATE_RULES]): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${rule.label}: this field is required and must be a number.`)
  }

  if (value < rule.minimum || value > rule.maximum) {
    throw new ValidationError(`${rule.label}: must be from ${rule.minimum} to ${rule.maximum}.`)
  }

  return Object.is(value, -0) ? 0 : value
}

function normalizeWebsite(value: unknown): string {
  const website = normalizeText(value, TEXT_FIELD_RULES.website)
  if (website.length === 0) {
    return website
  }

  let parsed: URL
  try {
    parsed = new URL(website)
  } catch {
    throw new ValidationError('Website: must be a valid URL using the http or https protocol.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Website: must be a valid URL using the http or https protocol.')
  }

  return normalizeText(parsed.href, TEXT_FIELD_RULES.website)
}

export function parseCoordinateInput(value: string): number {
  const normalized = value.trim()
  return normalized.length === 0 ? Number.NaN : Number(normalized)
}

export function validateListName(name: unknown): string {
  return normalizeText(name, TEXT_FIELD_RULES.listName)
}

export function validateAddress(address: unknown): string {
  return normalizeText(address, TEXT_FIELD_RULES.address)
}

export function validateCoordinates(latitude: unknown, longitude: unknown): Pick<PointFields, 'latitude' | 'longitude'> {
  return {
    latitude: validateCoordinate(latitude, COORDINATE_RULES.latitude),
    longitude: validateCoordinate(longitude, COORDINATE_RULES.longitude),
  }
}

export function validatePointFields(fields: PointFields): PointFields {
  const coordinates = validateCoordinates(fields.latitude, fields.longitude)
  return {
    name: normalizeText(fields.name, TEXT_FIELD_RULES.name),
    organization: normalizeText(fields.organization, TEXT_FIELD_RULES.organization),
    address: validateAddress(fields.address),
    workingHours: normalizeText(fields.workingHours, TEXT_FIELD_RULES.workingHours),
    website: normalizeWebsite(fields.website),
    comment: normalizeText(fields.comment, TEXT_FIELD_RULES.comment),
    ...coordinates,
  }
}
