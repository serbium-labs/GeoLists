import { rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { generateMapManifest } from '../server/map-manifest.mjs'

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const archivePath = option('--archive')
const version = option('--version')
const url = option('--url')
const output = option('--output')
const bounds = option('--bounds')?.split(',').map(Number)
const maxZoom = Number(option('--max-zoom'))
if (!archivePath || !version || !url || !output || !bounds || !Number.isSafeInteger(maxZoom)) {
  console.error('Usage: npm run map:manifest -- --archive FILE --version VERSION --url HTTPS_URL --bounds WEST,SOUTH,EAST,NORTH --max-zoom NUMBER --output FILE')
  process.exitCode = 1
} else {
  try {
    const manifest = await generateMapManifest({ archivePath: resolve(archivePath), version, url, bounds, maxZoom })
    const target = resolve(output)
    const temporary = `${target}.tmp`
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
    await rename(temporary, target)
    console.log(`Manifest written to ${target} (${manifest.size} bytes, sha256 ${manifest.sha256})`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
