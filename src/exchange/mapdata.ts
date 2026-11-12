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
  if (serialized === undefined) throw new MapDataError('Файл содержит неподдерживаемое значение.')
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
  if (typeof value !== 'string') throw new MapDataError(`Поле «${key}» должно быть строкой.`)
  return value
}

function readIsoDate(record: Record<string, unknown>, key: string) {
  const value = readString(record, key)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)) || value.length > 40) {
    throw new MapDataError(`Поле «${key}» содержит некорректную дату.`)
  }
  return value
}

function validatePoint(value: unknown): MapDataPoint {
  if (!isRecord(value)) throw new MapDataError('Некорректная структура точки.')
  const id = readString(value, 'id')
  if (!id || id.length > 100) throw new MapDataError('Некорректный ID точки.')
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
  if (typeof value.latitude !== 'number' || typeof value.longitude !== 'number') throw new MapDataError('Координаты точки должны быть числами.')
  try {
    return { id, ...validatePointFields(raw), createdAt: readIsoDate(value, 'createdAt'), updatedAt: readIsoDate(value, 'updatedAt') }
  } catch (error) {
    if (error instanceof ValidationError) throw new MapDataError(error.message)
    throw error
  }
}

export async function parseMapData(text: string): Promise<MapDataContent> {
  if (new TextEncoder().encode(text).byteLength > MAX_MAPDATA_BYTES) throw new MapDataError('Размер файла превышает 10 МБ.')
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new MapDataError('Файл не является корректным JSON.') }
  if (!isRecord(raw)) throw new MapDataError('Некорректная структура файла.')
  if (raw.format !== MAPDATA_FORMAT) throw new MapDataError('Это не файл GeoLists .mapdata.')
  if (raw.version !== MAPDATA_VERSION) throw new MapDataError('Версия файла не поддерживается.')
  if (!isRecord(raw.list) || !Array.isArray(raw.points)) throw new MapDataError('В файле отсутствует список или массив точек.')
  if (raw.points.length > MAX_MAPDATA_POINTS) throw new MapDataError(`Файл содержит более ${MAX_MAPDATA_POINTS} точек.`)
  const checksum = raw.checksum
  if (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/.test(checksum)) throw new MapDataError('Некорректная контрольная сумма.')

  const contentForHash = { format: raw.format, version: raw.version, list: raw.list, points: raw.points }
  if ((await sha256(stableStringify(contentForHash))) !== checksum) throw new MapDataError('Контрольная сумма не совпадает: файл повреждён или изменён.')

  const listId = readString(raw.list, 'id')
  if (!listId || listId.length > 100) throw new MapDataError('Некорректный ID списка.')
  let name: string
  try { name = validateListName(readString(raw.list, 'name')) } catch (error) {
    if (error instanceof ValidationError) throw new MapDataError(error.message)
    throw error
  }
  const points = raw.points.map(validatePoint)
  const ids = new Set<string>([listId])
  for (const point of points) {
    if (ids.has(point.id)) throw new MapDataError('В файле обнаружены повторяющиеся ID.')
    ids.add(point.id)
  }
  return { format: MAPDATA_FORMAT, version: MAPDATA_VERSION, list: { id: listId, name, createdAt: readIsoDate(raw.list, 'createdAt'), updatedAt: readIsoDate(raw.list, 'updatedAt') }, points }
}

export function buildTwoGisUrl(longitude: number, latitude: number) {
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new MapDataError('Некорректные координаты для ссылки 2ГИС.')
  }
  return `https://2gis.ru/geo/${encodeURIComponent(`${longitude},${latitude}`)}`
}

export function safeMapDataFilename(value: string) {
  const cleaned = value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180) || 'geolists'
  return cleaned.toLowerCase().endsWith('.mapdata') ? cleaned : `${cleaned}.mapdata`
}
