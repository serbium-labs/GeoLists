import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'

function validBounds(bounds) {
  return Array.isArray(bounds) && bounds.length === 4
    && bounds.every((coordinate) => Number.isFinite(coordinate))
    && bounds[0] >= -180 && bounds[0] < bounds[2] && bounds[2] <= 180
    && bounds[1] >= -90 && bounds[1] < bounds[3] && bounds[3] <= 90
}

export async function generateMapManifest({ archivePath, version, url, bounds, maxZoom }) {
  if (typeof version !== 'string' || !/^[\w.-]{1,80}$/.test(version)) throw new Error('Версия должна содержать только буквы, цифры, точки, дефисы и подчёркивания')
  if (!validBounds(bounds)) {
    throw new Error('Bounds must contain west,south,east,north in the valid coordinate range')
  }

  if (!Number.isSafeInteger(maxZoom) || maxZoom < 0 || maxZoom > 30) {
    throw new Error('Maximum zoom must be an integer from 0 to 30')
  }
  let parsedUrl
  try { parsedUrl = new URL(url) } catch { throw new Error('Нужен корректный HTTPS-адрес опубликованного архива') }
  if (parsedUrl.protocol !== 'https:') throw new Error('Адрес архива должен использовать HTTPS')
  const info = await stat(archivePath)
  if (!info.isFile() || info.size <= 0) throw new Error('Архив пуст или не является файлом')
  const header = Buffer.alloc(8)
  const handle = await open(archivePath, 'r')
  try { await handle.read(header, 0, 8, 0) } finally { await handle.close() }
  if (header.subarray(0, 7).toString() !== 'PMTiles' || header[7] !== 3) throw new Error('Файл не является архивом PMTiles v3')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(archivePath)) hash.update(chunk)
  return { version, url: parsedUrl.href, sha256: hash.digest('hex'), size: info.size, bounds, maxZoom }
}
