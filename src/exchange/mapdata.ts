import type { MapList, MapPoint, PointFields } from '../types/data'
import { validateListName, validatePointFields, ValidationError } from '../storage/validation'

export const MAPDATA_FORMAT = 'geolists.mapdata'
export const MAPDATA_VERSION = 1
export const MAX_MAPDATA_BYTES = 10 * 1024 * 1024
export const MAX_MAPDATA_POINTS = 10_000

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
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new MapDataError('The file contains an unsupported value.')
  return serialized
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createMapData(list: MapList, points: MapPoint[]): Promise<string> {
  const content: MapDataContent = {
    format: MAPDATA_FORMAT,
    version: MAPDATA_VERSION,
    list: { id: list.id, name: list.name, createdAt: list.createdAt, updatedAt: list.updatedAt },
    points: points.map((point) => ({ id: point.id, name: point.name, organization: point.organization, address: point.address, latitude: point.latitude, longitude: point.longitude, workingHours: point.workingHours, website: point.website, comment: point.comment, createdAt: point.createdAt, updatedAt: point.updatedAt })),
  }
  const checksum = await sha256(stableStringify(content))
  return JSON.stringify({ ...content, checksum }, null, 2)
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value !== 'string') throw new MapDataError(`The “${key}” field must be a string.`)
  return value
}

function readIsoDate(record: Record<string, unknown>, key: string) {
  const value = readString(record, key)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)) || value.length > 40) {
    throw new MapDataError(`The “${key}” field contains an invalid date.`)
  }
  return value
}

function validatePoint(value: unknown): MapDataPoint {
  if (!isRecord(value)) throw new MapDataError('Invalid point structure.')
  const id = readString(value, 'id')
  if (!id || id.length > 100) throw new MapDataError('Invalid point ID.')
  const raw: PointFields = {
    name: readString(value, 'name'),
    organization: readString(value, 'organization'),
    address: readString(value, 'address'),
    latitude: value.latitude as number,
    longitude: value.longitude as number,
    workingHours: readString(value, 'workingHours'),
    website: readString(value, 'website'),
    comment: readString(value, 'comment'),
  }
  if (typeof value.latitude !== 'number' || typeof value.longitude !== 'number') throw new MapDataError('Point coordinates must be numbers.')
  try {
    return { id, ...validatePointFields(raw), createdAt: readIsoDate(value, 'createdAt'), updatedAt: readIsoDate(value, 'updatedAt') }
  } catch (error) {
    if (error instanceof ValidationError) throw new MapDataError(error.message)
    throw error
  }
}

export async function parseMapData(text: string): Promise<MapDataContent> {
  if (new TextEncoder().encode(text).byteLength > MAX_MAPDATA_BYTES) throw new MapDataError('File size exceeds 10 MB.')
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new MapDataError('The file is not valid JSON.') }
  if (!isRecord(raw)) throw new MapDataError('Invalid file structure.')
  if (raw.format !== MAPDATA_FORMAT) throw new MapDataError('This is not a GeoLists .mapdata file.')
  if (raw.version !== MAPDATA_VERSION) throw new MapDataError('The file version is not supported.')
  if (!isRecord(raw.list) || !Array.isArray(raw.points)) throw new MapDataError('The file does not contain a list or points array.')
  if (raw.points.length > MAX_MAPDATA_POINTS) throw new MapDataError(`The file contains more than ${MAX_MAPDATA_POINTS} points.`)
  const checksum = raw.checksum
  if (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/.test(checksum)) throw new MapDataError('Invalid checksum.')

  const contentForHash = { format: raw.format, version: raw.version, list: raw.list, points: raw.points }
  if ((await sha256(stableStringify(contentForHash))) !== checksum) throw new MapDataError('Checksum mismatch: the file is corrupted or has been modified.')

  const listId = readString(raw.list, 'id')
  if (!listId || listId.length > 100) throw new MapDataError('Invalid list ID.')
  let name: string
  try { name = validateListName(readString(raw.list, 'name')) } catch (error) {
    if (error instanceof ValidationError) throw new MapDataError(error.message)
    throw error
  }
  const points = raw.points.map(validatePoint)
  const ids = new Set<string>([listId])
  for (const point of points) {
    if (ids.has(point.id)) throw new MapDataError('The file contains duplicate IDs.')
    ids.add(point.id)
  }
  return { format: MAPDATA_FORMAT, version: MAPDATA_VERSION, list: { id: listId, name, createdAt: readIsoDate(raw.list, 'createdAt'), updatedAt: readIsoDate(raw.list, 'updatedAt') }, points }
}

export function buildTwoGisUrl(longitude: number, latitude: number) {
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new MapDataError('Invalid coordinates for the 2GIS link.')
  }
  return `https://2gis.ru/geo/${encodeURIComponent(`${longitude},${latitude}`)}`
}

export function safeMapDataFilename(value: string) {
  const cleaned = value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180) || 'geolists'
  return cleaned.toLowerCase().endsWith('.mapdata') ? cleaned : `${cleaned}.mapdata`
}
