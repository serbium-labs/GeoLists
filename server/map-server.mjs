import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { contentTypeFor, parseByteRange, resolveStaticFile } from './http-utils.mjs'
import { installMapArchive } from './map-installer.mjs'
import { authorizeMapApiMutation, isMapApiMutation } from './map-api-security.mjs'
import { activeArchivePath, publicAvailable, validManifest } from './map-update-utils.mjs'
import { httpHost } from './server-config.mjs'

const root = resolve(import.meta.dirname, '..')
const distDir = join(root, 'dist')
const mapsDir = resolve(process.env.GEOLISTS_MAPS_DIR || join(root, 'data/maps'))
const pointerPath = join(mapsDir, 'active.json')
const port = Number(process.env.PORT || 4173)
const host = httpHost(process.env)
const updateConfigPath = join(root, 'config/map-updates.json')
const updateConfig = await readFile(updateConfigPath, 'utf8').then(JSON.parse, () => ({ manifestUrl: '' }))
const updateManifestUrl = process.env.MAP_UPDATE_MANIFEST_URL || updateConfig.manifestUrl || ''
const state = { phase: 'idle', received: 0, total: 0, error: '', available: null }
await mkdir(mapsDir, { recursive: true })

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function authorizeMapMutation(req, res) {
  const authorization = authorizeMapApiMutation(req)
  if (authorization.allowed) {
    return true
  }

  sendJson(res, authorization.status, { error: authorization.error })
  return false
}

async function activeInfo() {
  try {
    const info = JSON.parse(await readFile(pointerPath, 'utf8'))
    const path = activeArchivePath(mapsDir, info.file)
    if (!path || typeof info.version !== 'string') return null
    await access(path)
    return { ...info, path }
  } catch {
    const legacy = join(root, 'public/maps/spb.pmtiles')
    try { await access(legacy); return { version: 'manual', file: 'spb.pmtiles', path: legacy } } catch { return null }
  }
}

async function checkUpdate() {
  if (!updateManifestUrl) throw new Error('MAP_UPDATE_MANIFEST_URL не настроен')
  if (!/^https:\/\//.test(updateManifestUrl)) throw new Error('URL манифеста должен использовать HTTPS')
  const response = await fetch(updateManifestUrl, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Манифест обновления: HTTP ${response.status}`)
  if (!response.url.startsWith('https://')) throw new Error('Манифест перенаправлен на небезопасный URL')
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
  state.phase = 'downloading'; state.received = 0; state.total = manifest.size; state.error = ''
  try {
    await installMapArchive({
      manifest,
      mapsDir,
      pointerPath,
      onProgress(received, total) { state.received = received; state.total = total },
      onPhase(phase) { state.phase = phase },
    })
    state.available = { ...manifest, currentVersion: manifest.version, updateAvailable: false }
    state.phase = 'complete'
  } catch (error) {
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
    if (isMapApiMutation(req.method, url.pathname) && !authorizeMapMutation(req, res)) {
      return
    }

    if (url.pathname === '/health' && req.method === 'GET') return sendJson(res, 200, { status: 'ok' })
    if (url.pathname === '/api/maps/status' && req.method === 'GET') {
      const active = await activeInfo()
      return sendJson(res, 200, {
        phase: state.phase,
        received: state.received,
        total: state.total,
        error: state.error,
        available: publicAvailable(state.available),
        active: active && { version: active.version, size: active.size },
        updatesConfigured: Boolean(updateManifestUrl),
      })
    }
    if (url.pathname === '/api/maps/check' && req.method === 'POST') {
      return sendJson(res, 200, await checkUpdate())
    }
    if (url.pathname === '/api/maps/update' && req.method === 'POST') {
      if (['downloading', 'verifying'].includes(state.phase)) return sendJson(res, 409, { error: 'Загрузка уже выполняется' })
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
}).listen(port, host, () => console.log(`GeoLists: http://${host}:${port}`))
