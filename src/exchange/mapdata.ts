import type { MapList, MapPoint, PointFields } from '../types/data'
import { GEOGRAPHIC_COORDINATE_LIMITS } from '../config/appConfig'
import { validateListName, validatePointFields, ValidationError } from '../storage/validation'
import { isNull, isUndefined } from '../utils/nullish'

export const MAPDATA_FORMAT = 'geolists.mapdata'
export const MAPDATA_VERSION = 1
export const MAX_MAPDATA_BYTES = 10 * 1024 * 1024
export const MAX_MAPDATA_POINTS = 10_000
const ISO_DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}T/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const UNSAFE_FILENAME_CHARACTER_PATTERN = /[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/g
const SAFE_FILENAME_MAX_LENGTH = 180

export type MapDataPoint = Omit<MapPoint, 'listId'>

export interface MapDataContent {
  format: typeof MAPDATA_FORMAT
  version: typeof MAPDATA_VERSION
  list: Omit<MapList, 'id'> & { id: string }
  points: MapDataPoint[]
}

export interface MapDataDocument extends MapDataContent {
  checksum: string
}

export class MapDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MapDataError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && !isNull(value) && !Array.isArray(value)
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  const serialized: string | undefined = JSON.stringify(value)

  if (isUndefined(serialized)) {
    throw new MapDataError('The file contains an unsupported value.')
  }

  return serialized
}

async function sha256(value: string): Promise<string> {
  const digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createMapData(list: MapList, points: MapPoint[]): Promise<string> {
  const content: MapDataContent = {
    format: MAPDATA_FORMAT,
    version: MAPDATA_VERSION,
    list: { id: list.id, name: list.name, createdAt: list.createdAt, updatedAt: list.updatedAt },
    points: points.map((point) => ({ id: point.id, name: point.name, organization: point.organization, address: point.address, latitude: point.latitude, longitude: point.longitude, workingHours: point.workingHours, website: point.website, comment: point.comment, createdAt: point.createdAt, updatedAt: point.updatedAt })),
  }
  const checksum: string = await sha256(stableStringify(content))

  return JSON.stringify({ ...content, checksum }, null, 2)
}

function readString(record: Record<string, unknown>, key: string): string {
  const value: unknown = record[key]

  if (typeof value !== 'string') {
    throw new MapDataError(`The “${key}” field must be a string.`)
  }

  return value
}

function readIsoDate(record: Record<string, unknown>, key: string): string {
  const value: string = readString(record, key)

  if (!ISO_DATE_PREFIX_PATTERN.test(value) || !Number.isFinite(Date.parse(value)) || value.length > 40) {
    throw new MapDataError(`The “${key}” field contains an invalid date.`)
  }
  return value
}

function validatePoint(value: unknown): MapDataPoint {
  if (!isRecord(value)) {
    throw new MapDataError('Invalid point structure.')
  }
  const id: string = readString(value, 'id')

  if (!id || id.length > 100) {
    throw new MapDataError('Invalid point ID.')
  }
  if (typeof value.latitude !== 'number' || typeof value.longitude !== 'number') {
    throw new MapDataError('Point coordinates must be numbers.')
  }
  const raw: PointFields = {
    name: readString(value, 'name'),
    organization: readString(value, 'organization'),
    address: readString(value, 'address'),
    latitude: value.latitude,
    longitude: value.longitude,
    workingHours: readString(value, 'workingHours'),
    website: readString(value, 'website'),
    comment: readString(value, 'comment'),
  }
  try {
    return { id, ...validatePointFields(raw), createdAt: readIsoDate(value, 'createdAt'), updatedAt: readIsoDate(value, 'updatedAt') }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new MapDataError(error.message)
    }
    throw error
  }
}

export async function parseMapData(text: string): Promise<MapDataContent> {
  if (new TextEncoder().encode(text).byteLength > MAX_MAPDATA_BYTES) {
    throw new MapDataError('File size exceeds 10 MB.')
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new MapDataError('The file is not valid JSON.')
  }
  if (!isRecord(raw)) {
    throw new MapDataError('Invalid file structure.')
  }
  if (raw.format !== MAPDATA_FORMAT) {
    throw new MapDataError('This is not a GeoLists .mapdata file.')
  }
  if (raw.version !== MAPDATA_VERSION) {
    throw new MapDataError('The file version is not supported.')
  }
  if (!isRecord(raw.list) || !Array.isArray(raw.points)) {
    throw new MapDataError('The file does not contain a list or points array.')
  }
  if (raw.points.length > MAX_MAPDATA_POINTS) {
    throw new MapDataError(`The file contains more than ${MAX_MAPDATA_POINTS} points.`)
  }
  const checksum: unknown = raw.checksum

  if (typeof checksum !== 'string' || !SHA256_PATTERN.test(checksum)) {
    throw new MapDataError('Invalid checksum.')
  }

  const contentForHash: Record<string, unknown> = {
    format: raw.format,
    version: raw.version,
    list: raw.list,
    points: raw.points,
  }

  if ((await sha256(stableStringify(contentForHash))) !== checksum) {
    throw new MapDataError('Checksum mismatch: the file is corrupted or has been modified.')
  }

  const listId: string = readString(raw.list, 'id')

  if (!listId || listId.length > 100) {
    throw new MapDataError('Invalid list ID.')
  }
  let name: string

  try {
    name = validateListName(readString(raw.list, 'name'))
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      throw new MapDataError(error.message)
    }
    throw error
  }
  const points: MapDataPoint[] = raw.points.map(validatePoint)
  const ids: Set<string> = new Set<string>([listId])

  for (const point of points) {
    if (ids.has(point.id)) {
      throw new MapDataError('The file contains duplicate IDs.')
    }
    ids.add(point.id)
  }
  return {
    format: MAPDATA_FORMAT,
    version: MAPDATA_VERSION,
    list: {
      id: listId,
      name,
      createdAt: readIsoDate(raw.list, 'createdAt'),
      updatedAt: readIsoDate(raw.list, 'updatedAt'),
    },
    points,
  }
}

export function buildTwoGisUrl(longitude: number, latitude: number): string {
  const invalidLongitude: boolean = !Number.isFinite(longitude)
    || longitude < GEOGRAPHIC_COORDINATE_LIMITS.longitude.minimum
    || longitude > GEOGRAPHIC_COORDINATE_LIMITS.longitude.maximum
  const invalidLatitude: boolean = !Number.isFinite(latitude)
    || latitude < GEOGRAPHIC_COORDINATE_LIMITS.latitude.minimum
    || latitude > GEOGRAPHIC_COORDINATE_LIMITS.latitude.maximum

  if (invalidLongitude || invalidLatitude) {
    throw new MapDataError('Invalid coordinates for the 2GIS link.')
  }
  return `https://2gis.ru/geo/${encodeURIComponent(`${longitude},${latitude}`)}`
}

export function safeMapDataFilename(value: string): string {
  const normalized: string = value.normalize('NFC').trim().replace(UNSAFE_FILENAME_CHARACTER_PATTERN, '_')
  const cleaned: string = Array.from(normalized).slice(0, SAFE_FILENAME_MAX_LENGTH).join('') || 'geolists'
  return cleaned.toLowerCase().endsWith('.mapdata') ? cleaned : `${cleaned}.mapdata`
}
