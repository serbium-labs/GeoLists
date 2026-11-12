import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { contentTypeFor, parseByteRange, resolveStaticFile } from './http-utils.mjs'

const root = resolve(import.meta.dirname, '..')
const distDir = join(root, 'dist')
const mapsDir = resolve(process.env.GEOLISTS_MAPS_DIR || join(root, 'data/maps'))
const pointerPath = join(mapsDir, 'active.json')
const port = Number(process.env.PORT || 4173)
const updateManifestUrl = process.env.MAP_UPDATE_MANIFEST_URL || ''
const state = { phase: 'idle', received: 0, total: 0, error: '', available: null }
await mkdir(mapsDir, { recursive: true })

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function activeInfo() {
  try {
    const info = JSON.parse(await readFile(pointerPath, 'utf8'))
    const path = join(mapsDir, info.file)
    await access(path)
    return { ...info, path }
  } catch {
    const legacy = join(root, 'public/maps/spb.pmtiles')
    try { await access(legacy); return { version: 'manual', file: 'spb.pmtiles', path: legacy } } catch { return null }
  }
}

function validManifest(value) {
  return value && typeof value.version === 'string' && /^[\w.-]{1,80}$/.test(value.version)
    && typeof value.url === 'string' && /^https:\/\//.test(value.url)
    && typeof value.sha256 === 'string' && /^[a-f\d]{64}$/i.test(value.sha256)
    && Number.isSafeInteger(value.size) && value.size > 0
}

async function checkUpdate() {
  if (!updateManifestUrl) throw new Error('MAP_UPDATE_MANIFEST_URL не настроен')
  if (!/^https:\/\//.test(updateManifestUrl)) throw new Error('URL манифеста должен использовать HTTPS')
  const response = await fetch(updateManifestUrl, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Манифест обновления: HTTP ${response.status}`)
  const manifest = await response.json()
  if (!validManifest(manifest)) throw new Error('Некорректный манифест обновления')
  const active = await activeInfo()
  state.available = { ...manifest, currentVersion: active?.version || null, updateAvailable: manifest.version !== active?.version }
  return state.available
}

async function installUpdate() {
  if (['downloading', 'verifying'].includes(state.phase)) throw new Error('Обновление уже выполняется')
  const manifest = state.available || await checkUpdate()
  if (!manifest.updateAvailable) return
  const temp = join(mapsDir, `.download-${process.pid}-${Date.now()}.pmtiles`)
  const finalName = `spb-${manifest.version}.pmtiles`
  const final = join(mapsDir, finalName)
  state.phase = 'downloading'; state.received = 0; state.total = manifest.size; state.error = ''
  try {
    const response = await fetch(manifest.url, { signal: AbortSignal.timeout(3_600_000) })
    if (!response.ok || !response.body) throw new Error(`Архив: HTTP ${response.status}`)
    const length = Number(response.headers.get('content-length') || manifest.size)
    if (length !== manifest.size) throw new Error('Размер архива не совпадает с манифестом')
    const hash = createHash('sha256')
    const meter = new Transform({ transform(chunk, _encoding, callback) { state.received += chunk.length; hash.update(chunk); callback(null, chunk) } })
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(temp, { flags: 'wx' }))
    state.phase = 'verifying'
    if (state.received !== manifest.size) throw new Error('Архив скачан не полностью')
    if (hash.digest('hex').toLowerCase() !== manifest.sha256.toLowerCase()) throw new Error('SHA-256 архива не совпадает')
    const header = Buffer.alloc(8); const handle = await open(temp, 'r')
    await handle.read(header, 0, 8, 0); await handle.close()
    if (header.subarray(0, 7).toString() !== 'PMTiles' || header[7] !== 3) throw new Error('Файл не является архивом PMTiles v3')
    await rename(temp, final)
    const pointerTemp = `${pointerPath}.tmp`
    await writeFile(pointerTemp, JSON.stringify({ version: manifest.version, file: finalName, sha256: manifest.sha256, size: manifest.size }, null, 2))
    await rename(pointerTemp, pointerPath)
    state.available = { ...manifest, currentVersion: manifest.version, updateAvailable: false }
    state.phase = 'complete'
  } catch (error) {
    await unlink(temp).catch(() => {})
    state.phase = 'failed'; state.error = error instanceof Error ? error.message : 'Ошибка обновления'
  }
}

async function serveFile(req, res, path, cache = true) {
  const info = await stat(path); const range = req.headers.range
  const headers = { 'content-type': contentTypeFor(path), 'accept-ranges': 'bytes', 'cache-control': cache ? 'public, max-age=31536000, immutable' : 'no-store' }
  const parsedRange = parseByteRange(range, info.size)
  if (parsedRange) {
    if (!parsedRange.satisfiable) { res.writeHead(416, { 'content-range': parsedRange.contentRange }); return res.end() }
    res.writeHead(206, { ...headers, 'content-range': parsedRange.contentRange, 'content-length': parsedRange.length })
    return createReadStream(path, { start: parsedRange.start, end: parsedRange.end }).pipe(res)
  }
  res.writeHead(200, { ...headers, 'content-length': info.size }); createReadStream(path).pipe(res)
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    if (url.pathname === '/api/maps/status' && req.method === 'GET') {
      const active = await activeInfo()
      return sendJson(res, 200, { ...state, active: active && { version: active.version, size: active.size }, updatesConfigured: Boolean(updateManifestUrl) })
    }
    if (url.pathname === '/api/maps/check' && req.method === 'POST') return sendJson(res, 200, await checkUpdate())
    if (url.pathname === '/api/maps/update' && req.method === 'POST') {
      void installUpdate().catch((error) => { state.phase = 'failed'; state.error = error instanceof Error ? error.message : 'Ошибка обновления' })
      return sendJson(res, 202, { accepted: true })
    }
    if (url.pathname === '/maps/spb.pmtiles') {
      const active = await activeInfo(); if (!active) return sendJson(res, 404, { error: 'Архив карты не установлен' })
      return serveFile(req, res, active.path, false)
    }
    const file = await resolveStaticFile(url.pathname, distDir)
    if (!file) return sendJson(res, 403, { error: 'Forbidden' })
    return serveFile(req, res, file, extname(file) !== '.html')
  } catch (error) { return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Server error' }) }
}).listen(port, '127.0.0.1', () => console.log(`GeoLists: http://127.0.0.1:${port}`))
