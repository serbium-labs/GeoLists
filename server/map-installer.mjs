import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { open, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export async function installMapArchive({ manifest, mapsDir, pointerPath, fetchImpl = fetch, onProgress = () => {}, onPhase = () => {} }) {
  const temp = join(mapsDir, `.download-${process.pid}-${Date.now()}.pmtiles`)
  const finalName = `spb-${manifest.version}.pmtiles`
  const final = join(mapsDir, finalName)
  let received = 0
  try {
    onPhase('downloading')
    const response = await fetchImpl(manifest.url, { signal: AbortSignal.timeout(3_600_000) })
    if (!response.ok || !response.body) throw new Error(`Архив: HTTP ${response.status}`)
    if (!response.url.startsWith('https://')) throw new Error('Архив перенаправлен на небезопасный URL')
    const length = Number(response.headers.get('content-length') || manifest.size)
    if (length !== manifest.size) throw new Error('Размер архива не совпадает с манифестом')
    const hash = createHash('sha256')
    const meter = new Transform({ transform(chunk, _encoding, callback) {
      received += chunk.length
      hash.update(chunk)
      onProgress(received, manifest.size)
      callback(null, chunk)
    } })
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(temp, { flags: 'wx' }))
    onPhase('verifying')
    if (received !== manifest.size) throw new Error('Архив скачан не полностью')
    if (hash.digest('hex').toLowerCase() !== manifest.sha256.toLowerCase()) throw new Error('SHA-256 архива не совпадает')
    const header = Buffer.alloc(8)
    const handle = await open(temp, 'r')
    try { await handle.read(header, 0, 8, 0) } finally { await handle.close() }
    if (header.subarray(0, 7).toString() !== 'PMTiles' || header[7] !== 3) throw new Error('Файл не является архивом PMTiles v3')
    await rename(temp, final)
    const pointerTemp = `${pointerPath}.tmp`
    await writeFile(pointerTemp, JSON.stringify({ version: manifest.version, file: finalName, sha256: manifest.sha256, size: manifest.size }, null, 2))
    await rename(pointerTemp, pointerPath)
    return { version: manifest.version, file: finalName, sha256: manifest.sha256, size: manifest.size }
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
}
