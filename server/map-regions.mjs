import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { regionAreaKm2, validateDownloadLimits } from './map-storage.mjs'

const ESTIMATED_BYTES_PER_KM2_AT_ZOOM_15 = 18_000
const ESTIMATE_SAFETY_FACTOR = 1.2
const MAX_REGION_NAME_LENGTH = 80
const CUSTOM_REGION_ID_PATTERN = /^region-[a-f\d-]{36}$/
const REGION_ID_PATTERN = /^(?:region-[a-f\d-]{36}|legacy)$/

function validBounds(bounds) {
  return Array.isArray(bounds) && bounds.length === 4
    && bounds.every((coordinate) => Number.isFinite(coordinate))
    && bounds[0] >= -180 && bounds[0] < bounds[2] && bounds[2] <= 180
    && bounds[1] >= -85 && bounds[1] < bounds[3] && bounds[3] <= 85
}

function normalizedName(value) {
  if (typeof value !== 'string') {
    throw new Error('Region name must be text')
  }

  const name = value.normalize('NFC').trim()
  if (!name) {
    throw new Error('Region name is required')
  }

  if (Array.from(name).length > MAX_REGION_NAME_LENGTH || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
    throw new Error(`Region name must contain at most ${MAX_REGION_NAME_LENGTH} printable characters`)
  }

  return name
}

export function validateRegionSelection(value, limits) {
  if (!value || !validBounds(value.bounds)) {
    throw new Error('Region bounds must contain valid west, south, east, and north coordinates')
  }

  if (!Number.isSafeInteger(value.maxZoom) || value.maxZoom < 0) {
    throw new Error('Region maximum zoom must be a non-negative integer')
  }

  if (value.maxZoom > limits.maxZoom) {
    throw new Error('Map zoom level exceeds the configured limit')
  }

  const selection = { name: normalizedName(value.name), bounds: value.bounds, maxZoom: value.maxZoom }
  validateDownloadLimits({ ...selection, size: estimateRegionSize(selection) }, limits)
  return selection
}

export function estimateRegionSize({ bounds, maxZoom }) {
  const zoomScale = 4 ** (maxZoom - 15)
  const estimated = regionAreaKm2(bounds) * ESTIMATED_BYTES_PER_KM2_AT_ZOOM_15 * zoomScale * ESTIMATE_SAFETY_FACTOR
  return Math.max(1, Math.ceil(estimated))
}

export function regionCenter(bounds) {
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
}

export function regionArchiveName(id) {
  if (!CUSTOM_REGION_ID_PATTERN.test(id)) {
    throw new Error('Invalid region identifier')
  }

  return `${id}.pmtiles`
}

export async function readRegionRegistry(registryPath) {
  try {
    const value = JSON.parse(await readFile(registryPath, 'utf8'))
    return Array.isArray(value.regions) ? value.regions : []
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

export async function writeRegionRegistry(registryPath, regions) {
  const temporary = `${registryPath}.tmp`
  await writeFile(temporary, `${JSON.stringify({ regions }, null, 2)}\n`, { flag: 'w' })
  await rename(temporary, registryPath)
}

export async function activateRegion({ region, pointerPath }) {
  const pointer = {
    regionId: region.id,
    version: region.revision,
    file: region.file,
    sha256: region.sha256,
    size: region.size,
    bounds: region.bounds,
    maxZoom: region.maxZoom,
    name: region.name,
  }
  const temporary = `${pointerPath}.tmp`
  await writeFile(temporary, `${JSON.stringify(pointer, null, 2)}\n`, { flag: 'w' })
  await rename(temporary, pointerPath)
  return pointer
}

export async function verifyExtractedRegion(path, maximumBytes) {
  const info = await stat(path)
  if (!info.isFile() || info.size <= 0 || info.size > maximumBytes) {
    throw new Error('Extracted region exceeds the configured archive size limit')
  }

  const header = Buffer.alloc(8)
  const handle = await open(path, 'r')
  try {
    await handle.read(header, 0, header.length, 0)
  } finally {
    await handle.close()
  }

  if (header.subarray(0, 7).toString() !== 'PMTiles' || header[7] !== 3) {
    throw new Error('Extractor did not produce a PMTiles v3 archive')
  }

  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }

  return { size: info.size, sha256: hash.digest('hex') }
}

export function runPmtilesExtract({ sourceUrl, targetPath, bounds, maxZoom, signal, binary = process.env.PMTILES_BIN || 'pmtiles' }) {
  const bbox = bounds.join(',')
  const argumentsList = ['extract', sourceUrl, targetPath, `--bbox=${bbox}`, `--maxzoom=${maxZoom}`]

  return new Promise((resolve, reject) => {
    const child = spawn(binary, argumentsList, { stdio: ['ignore', 'ignore', 'pipe'], signal })
    let errorOutput = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-4_000)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(errorOutput.trim() || `PMTiles extractor exited with code ${code}`))
    })
  })
}

export async function installExtractedRegion({ selection, sourceUrl, mapsDir, registryPath, pointerPath, activeFile, limits, ensureCapacity, extract = runPmtilesExtract, signal }) {
  const id = `region-${randomUUID()}`
  const file = regionArchiveName(id)
  const finalPath = join(mapsDir, file)
  const temporaryPath = join(mapsDir, `.extract-${id}.pmtiles`)
  const estimatedSize = estimateRegionSize(selection)
  let finalInstalled = false
  await ensureCapacity({
    mapsDir,
    manifest: { ...selection, version: id, file, size: estimatedSize },
    activeFile,
    limits,
  })

  try {
    await extract({ sourceUrl, targetPath: temporaryPath, bounds: selection.bounds, maxZoom: selection.maxZoom, signal })
    const verified = await verifyExtractedRegion(temporaryPath, limits.maxArchiveBytes)
    await ensureCapacity({
      mapsDir,
      manifest: { ...selection, version: id, file, size: verified.size },
      activeFile,
      limits,
    })
    await rename(temporaryPath, finalPath)
    finalInstalled = true
    const region = {
      id,
      name: selection.name,
      bounds: selection.bounds,
      center: regionCenter(selection.bounds),
      maxZoom: selection.maxZoom,
      file,
      url: `/maps/regions/${id}.pmtiles`,
      revision: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      sourceUrl,
      ...verified,
    }
    const regions = await readRegionRegistry(registryPath)
    await writeRegionRegistry(registryPath, [...regions, region])
    await activateRegion({ region, pointerPath })
    finalInstalled = false
    return region
  } catch (error) {
    await unlink(temporaryPath).catch(() => {})
    if (finalInstalled) {
      await unlink(finalPath).catch(() => {})
    }
    throw error
  }
}

export async function findInstalledRegion({ id, registryPath, mapsDir }) {
  if (!REGION_ID_PATTERN.test(id)) {
    return null
  }

  const regions = await readRegionRegistry(registryPath)
  const region = regions.find((candidate) => candidate.id === id)
  if (!region) {
    return null
  }

  const expectedFile = CUSTOM_REGION_ID_PATTERN.test(id) ? regionArchiveName(id) : region.file
  if (region.file !== expectedFile || !/^(?:spb-[\w.-]+|region-[a-f\d-]{36})\.pmtiles$/.test(region.file)) {
    return null
  }

  await access(join(mapsDir, region.file))
  return region
}
