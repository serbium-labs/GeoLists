import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { contentTypeFor, parseByteRange, resolveStaticFile } from './http-utils.mjs'
import { installMapArchive } from './map-installer.mjs'
import { authorizeMapApiMutation, isMapApiMutation } from './map-api-security.mjs'
import {
  archiveResponsePolicy,
  IMMUTABLE_ARCHIVE_CACHE_CONTROL,
  NO_STORE_CACHE_CONTROL,
} from './map-cache-policy.mjs'
import {
  activateRegion,
  estimateRegionSize,
  findInstalledRegion,
  installExtractedRegion,
  readRegionRegistry,
  regionCenter,
  validateRegionSelection,
  writeRegionRegistry,
} from './map-regions.mjs'
import { applyRetentionPolicy, ensureDownloadCapacity, regionAreaKm2, storageLimits, validateDownloadLimits } from './map-storage.mjs'
import { activeArchivePath, publicAvailable, validManifest, withSpatialMetadata } from './map-update-utils.mjs'
import { createReverseGeocoder, GEOCODING_SOURCE, reverseGeocodingEndpoint, ReverseGeocodingError } from './reverse-geocoding.mjs'
import { httpHost } from './server-config.mjs'

const root = resolve(import.meta.dirname, '..')
const distDir = join(root, 'dist')
const mapsDir = resolve(process.env.GEOLISTS_MAPS_DIR || join(root, 'data/maps'))
const pointerPath = join(mapsDir, 'active.json')
const regionRegistryPath = join(mapsDir, 'regions.json')
const port = Number(process.env.PORT || 4173)
const host = httpHost(process.env)
const updateConfigPath = join(root, 'config/map-updates.json')
const updateConfig = await readFile(updateConfigPath, 'utf8').then(JSON.parse, () => ({ manifestUrl: '' }))
const updateManifestUrl = process.env.MAP_UPDATE_MANIFEST_URL || updateConfig.manifestUrl || ''
const mapStorageLimits = storageLimits(process.env)
const currentBuildDate = new Date().toISOString().slice(0, 10).replaceAll('-', '')
const regionSourceUrl = process.env.MAP_REGION_SOURCE_URL || `https://build.protomaps.com/${currentBuildDate}.pmtiles`
const geocodingEndpoint = reverseGeocodingEndpoint(process.env)
const reverseGeocodeAddress = geocodingEndpoint ? createReverseGeocoder({ endpoint: geocodingEndpoint }) : null
if (!regionSourceUrl.startsWith('https://')) {
  throw new Error('MAP_REGION_SOURCE_URL must use HTTPS')
}
const state = { phase: 'idle', received: 0, total: 0, error: '', available: null }
const regionOperation = { phase: 'idle', region: null, error: '', controller: null }
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
    return { ...info, bounds: info.bounds || [29.4, 59.63, 31.05, 60.25], maxZoom: info.maxZoom ?? 15, path }
  } catch {
    const legacy = join(root, 'public/maps/spb.pmtiles')
    try { await access(legacy); return { version: 'manual', file: 'spb.pmtiles', bounds: [29.4, 59.63, 31.05, 60.25], maxZoom: 15, path: legacy } } catch { return null }
  }
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 16_384) {
      throw new Error('Request body is too large')
    }
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('Request body must be valid JSON')
  }
}

function publicRegion(region) {
  return {
    id: region.id,
    name: region.name,
    bounds: region.bounds,
    center: region.center || regionCenter(region.bounds),
    maxZoom: region.maxZoom,
    size: region.size,
    url: region.url,
    revision: region.revision,
    createdAt: region.createdAt,
  }
}

async function installedRegions() {
  const regions = await readRegionRegistry(regionRegistryPath)
  const active = await activeInfo()
  if (!active || regions.some((region) => region.file === active.file)) {
    return { regions, active }
  }

  const legacy = {
    id: 'legacy',
    name: active.name || 'Existing offline map',
    bounds: active.bounds,
    center: regionCenter(active.bounds),
    maxZoom: active.maxZoom,
    file: active.file,
    url: '/maps/spb.pmtiles',
    revision: active.version,
    createdAt: '1970-01-01T00:00:00.000Z',
    size: active.size,
    sha256: active.sha256,
  }
  const updatedRegions = [legacy, ...regions.filter((region) => region.id !== 'legacy')]
  await writeRegionRegistry(regionRegistryPath, updatedRegions)
  return { regions: updatedRegions, active }
}

async function regionsStatus() {
  const { regions, active } = await installedRegions()
  const activeRegion = regions.find((region) => region.file === active?.file) || null
  return {
    regions: regions.map(publicRegion),
    activeId: activeRegion?.id || null,
    operation: { phase: regionOperation.phase, region: regionOperation.region, error: regionOperation.error },
    sourceDate: currentBuildDate,
  }
}

async function startRegionDownload(selection) {
  if (regionOperation.phase === 'extracting') {
    throw new Error('A region download is already running')
  }

  const active = await activeInfo()
  const controller = new AbortController()
  regionOperation.phase = 'extracting'
  regionOperation.region = selection.name
  regionOperation.error = ''
  regionOperation.controller = controller
  try {
    await installExtractedRegion({
      selection,
      sourceUrl: regionSourceUrl,
      mapsDir,
      registryPath: regionRegistryPath,
      pointerPath,
      activeFile: active?.file,
      limits: mapStorageLimits,
      ensureCapacity: ensureDownloadCapacity,
      signal: controller.signal,
    })
    regionOperation.phase = 'complete'
  } catch (error) {
    regionOperation.phase = controller.signal.aborted ? 'cancelled' : 'failed'
    regionOperation.error = controller.signal.aborted ? '' : error instanceof Error ? error.message : 'Region download failed'
  } finally {
    regionOperation.controller = null
  }
}

async function checkUpdate() {
  if (!updateManifestUrl) throw new Error('MAP_UPDATE_MANIFEST_URL не настроен')
  if (!/^https:\/\//.test(updateManifestUrl)) throw new Error('URL манифеста должен использовать HTTPS')
  const response = await fetch(updateManifestUrl, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Манифест обновления: HTTP ${response.status}`)
  if (!response.url.startsWith('https://')) throw new Error('Манифест перенаправлен на небезопасный URL')
  const manifest = withSpatialMetadata(await response.json())
  if (!validManifest(manifest)) throw new Error('Некорректный манифест обновления')
  validateDownloadLimits(manifest, mapStorageLimits)
  const active = await activeInfo()
  state.available = { ...manifest, currentVersion: active?.version || null, updateAvailable: manifest.version !== active?.version }
  return state.available
}

async function installUpdate() {
  if (['downloading', 'verifying'].includes(state.phase)) throw new Error('Обновление уже выполняется')
  const manifest = state.available || await checkUpdate()
  if (!manifest.updateAvailable) return
  const active = await activeInfo()
  state.phase = 'downloading'; state.received = 0; state.total = manifest.size; state.error = ''
  try {
    await installMapArchive({
      manifest,
      mapsDir,
      pointerPath,
      beforeDownload: () => ensureDownloadCapacity({
        mapsDir,
        manifest,
        activeFile: active?.file,
        limits: mapStorageLimits,
      }),
      onProgress(received, total) { state.received = received; state.total = total },
      onPhase(phase) { state.phase = phase },
    })
    await applyRetentionPolicy({
      mapsDir,
      activeFile: `spb-${manifest.version}.pmtiles`,
      retainedInactiveArchives: mapStorageLimits.retainedInactiveArchives,
    })
    state.available = { ...manifest, currentVersion: manifest.version, updateAvailable: false }
    state.phase = 'complete'
  } catch (error) {
    state.phase = 'failed'; state.error = error instanceof Error ? error.message : 'Ошибка обновления'
  }
}

async function serveFile(req, res, path, cacheControl = IMMUTABLE_ARCHIVE_CACHE_CONTROL) {
  const info = await stat(path); const range = req.headers.range
  const headers = { 'content-type': contentTypeFor(path), 'accept-ranges': 'bytes', 'cache-control': cacheControl }
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
    if (url.pathname === '/api/regions' && req.method === 'GET') {
      return sendJson(res, 200, await regionsStatus())
    }
    if (url.pathname === '/api/geocoding/status' && req.method === 'GET') {
      return sendJson(res, 200, { configured: Boolean(reverseGeocodeAddress), source: reverseGeocodeAddress ? GEOCODING_SOURCE : null })
    }
    if (url.pathname === '/api/geocoding/reverse' && req.method === 'POST') {
      if (!reverseGeocodeAddress) {
        return sendJson(res, 503, { error: 'Address lookup is not configured' })
      }

      const value = await readJsonBody(req)
      try {
        return sendJson(res, 200, await reverseGeocodeAddress({ latitude: value.latitude, longitude: value.longitude }))
      } catch (error) {
        if (error instanceof ReverseGeocodingError) {
          return sendJson(res, error.status, { error: error.message })
        }
        throw error
      }
    }
    if (url.pathname === '/api/regions/estimate' && req.method === 'POST') {
      const selection = validateRegionSelection(await readJsonBody(req), mapStorageLimits)
      return sendJson(res, 200, { estimatedSize: estimateRegionSize(selection), areaKm2: regionAreaKm2(selection.bounds) })
    }
    if (url.pathname === '/api/regions/download' && req.method === 'POST') {
      if (regionOperation.phase === 'extracting') {
        return sendJson(res, 409, { error: 'A region download is already running' })
      }
      const selection = validateRegionSelection(await readJsonBody(req), mapStorageLimits)
      void startRegionDownload(selection)
      return sendJson(res, 202, { accepted: true })
    }
    if (url.pathname === '/api/regions/cancel' && req.method === 'POST') {
      regionOperation.controller?.abort()
      return sendJson(res, 202, { accepted: Boolean(regionOperation.controller) })
    }
    if (url.pathname === '/api/regions/activate' && req.method === 'POST') {
      const value = await readJsonBody(req)
      const region = typeof value.id === 'string' ? await findInstalledRegion({ id: value.id, registryPath: regionRegistryPath, mapsDir }) : null
      if (!region) {
        return sendJson(res, 404, { error: 'Installed region not found' })
      }
      await activateRegion({ region, pointerPath })
      return sendJson(res, 200, { active: publicRegion(region) })
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
      const cachePolicy = archiveResponsePolicy(url.searchParams.get('v'), active.version)
      if (!cachePolicy.servable) {
        return sendJson(res, 404, { error: 'The requested archive version is no longer active' })
      }

      return serveFile(req, res, active.path, cachePolicy.cacheControl)
    }
    const regionMatch = url.pathname.match(/^\/maps\/regions\/(region-[a-f\d-]{36})\.pmtiles$/)
    if (regionMatch) {
      const region = await findInstalledRegion({ id: regionMatch[1], registryPath: regionRegistryPath, mapsDir })
      if (!region) {
        return sendJson(res, 404, { error: 'Region archive not found' })
      }
      const cachePolicy = archiveResponsePolicy(url.searchParams.get('v'), region.revision)
      if (!cachePolicy.servable) {
        return sendJson(res, 404, { error: 'The requested region version is not available' })
      }

      return serveFile(req, res, join(mapsDir, region.file), cachePolicy.cacheControl)
    }
    const file = await resolveStaticFile(url.pathname, distDir)
    if (!file) return sendJson(res, 403, { error: 'Forbidden' })
    const cacheControl = extname(file) === '.html' ? NO_STORE_CACHE_CONTROL : IMMUTABLE_ARCHIVE_CACHE_CONTROL
    return serveFile(req, res, file, cacheControl)
  } catch (error) { return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Server error' }) }
}).listen(port, host, () => console.log(`GeoLists: http://${host}:${port}`))
