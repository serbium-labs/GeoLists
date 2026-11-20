import { describe, expect, it } from 'vitest'
import type { PointFields } from '../../types/data'
import { parseCoordinateInput, TEXT_FIELD_RULES, validateListName, validatePointFields } from '../../storage/validation'

const VALID_FIELDS: PointFields = {
  name: 'Warehouse',
  organization: 'Example GmbH',
  address: 'Musterstraße 1, München',
  latitude: 48.137154,
  longitude: 11.576124,
  workingHours: 'Mon–Fri 09:00–18:00',
  website: 'https://example.com/locations/main',
  comment: 'Accessible entrance',
}

describe('shared input validation', () => {
  it('normalizes surrounding whitespace, line endings, Unicode and URLs', () => {
    const normalized = validatePointFields({
      ...VALID_FIELDS,
      name: '  Cafe\u0301 東京  ',
      comment: '  First line\r\nSecond line  ',
      website: ' HTTPS://EXAMPLE.COM ',
      latitude: -0,
    })

    expect(normalized.name).toBe('Café 東京')
    expect(normalized.comment).toBe('First line\nSecond line')
    expect(normalized.website).toBe('https://example.com/')
    expect(normalized.latitude).toBe(0)
  })

  it('preserves valid Unicode and counts supplementary characters as single characters', () => {
    const maximumUnicodeName = '😀'.repeat(TEXT_FIELD_RULES.name.maxLength)
    expect(validatePointFields({ ...VALID_FIELDS, name: maximumUnicodeName }).name).toBe(maximumUnicodeName)
    expect(validateListName('  Маршрут 東京 🗺️  ')).toBe('Маршрут 東京 🗺️')
  })

  it.each([
    ['name', 'Point name', TEXT_FIELD_RULES.name.maxLength],
    ['organization', 'Business / organization', TEXT_FIELD_RULES.organization.maxLength],
    ['address', 'Address', TEXT_FIELD_RULES.address.maxLength],
    ['workingHours', 'Business hours', TEXT_FIELD_RULES.workingHours.maxLength],
    ['website', 'Website', TEXT_FIELD_RULES.website.maxLength],
    ['comment', 'Comment', TEXT_FIELD_RULES.comment.maxLength],
  ] as const)('enforces the %s length limit with a field-specific message', (field, label, maximum) => {
    expect(() => validatePointFields({ ...VALID_FIELDS, [field]: 'a'.repeat(maximum + 1) }))
      .toThrow(`${label}: must be no more than ${maximum} characters.`)
  })

  it('requires list names, point names and both coordinates', () => {
    expect(() => validateListName('  ')).toThrow('List name: this field is required.')
    expect(() => validateListName('a'.repeat(TEXT_FIELD_RULES.listName.maxLength + 1)))
      .toThrow(`List name: must be no more than ${TEXT_FIELD_RULES.listName.maxLength} characters.`)
    expect(() => validatePointFields({ ...VALID_FIELDS, name: '\t' })).toThrow('Point name: this field is required.')
    expect(() => validatePointFields({ ...VALID_FIELDS, latitude: Number.NaN })).toThrow('Latitude: this field is required')
    expect(() => validatePointFields({ ...VALID_FIELDS, longitude: Number.NaN })).toThrow('Longitude: this field is required')
    expect(parseCoordinateInput('   ')).toBeNaN()
  })

  it('rejects control characters, line breaks in single-line fields and invalid Unicode', () => {
    expect(() => validatePointFields({ ...VALID_FIELDS, address: 'Line one\nLine two' })).toThrow('Address: use only printable single-line characters.')
    expect(() => validatePointFields({ ...VALID_FIELDS, comment: 'Text\u0000value' })).toThrow('Comment: use only printable characters and line breaks.')
    expect(() => validateListName('Broken\uD800')).toThrow('invalid Unicode')
  })

  it('accepts only HTTP and HTTPS URLs and enforces coordinate ranges', () => {
    expect(validatePointFields({ ...VALID_FIELDS, website: 'http://example.com' }).website).toBe('http://example.com/')
    expect(validatePointFields({ ...VALID_FIELDS, website: 'https://example.com' }).website).toBe('https://example.com/')
    expect(() => validatePointFields({ ...VALID_FIELDS, website: 'javascript:alert(1)' })).toThrow('http or https')
    expect(() => validatePointFields({ ...VALID_FIELDS, latitude: 90.000001 })).toThrow('Latitude: must be from -90 to 90.')
    expect(() => validatePointFields({ ...VALID_FIELDS, longitude: -180.000001 })).toThrow('Longitude: must be from -180 to 180.')
    expect(validatePointFields({ ...VALID_FIELDS, latitude: -90, longitude: 180 }))
      .toMatchObject({ latitude: -90, longitude: 180 })
  })
})
