import { access } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.pbf': 'application/x-protobuf',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.pmtiles': 'application/vnd.pmtiles',
}
const BYTE_RANGE_PATTERN = /^bytes=(\d+)-(\d*)$/
const PARENT_PATH_PREFIX_PATTERN = /^(\.\.(\/|\\|$))+/
const LEADING_SLASH_PATTERN = /^\//

export function contentTypeFor(path) {
  return MIME_TYPES[extname(path).toLowerCase()] || 'application/octet-stream'
}

export function parseByteRange(range, size) {
  if (!range) {
    return null
  }
  const match = BYTE_RANGE_PATTERN.exec(range)
  if (!match) {
    return { satisfiable: false, contentRange: `bytes */${size}` }
  }
  const start = Number(match[1])
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    return { satisfiable: false, contentRange: `bytes */${size}` }
  }
  return { satisfiable: true, start, end, length: end - start + 1, contentRange: `bytes ${start}-${end}/${size}` }
}

export async function resolveStaticFile(pathname, distDir, fileExists = async (path) => access(path).then(() => true, () => false)) {
  const relative = normalize(decodeURIComponent(pathname))
    .replace(PARENT_PATH_PREFIX_PATTERN, '')
    .replace(LEADING_SLASH_PATTERN, '')
  const requested = join(distDir, relative || 'index.html')
  const insideDist = requested === distDir || requested.startsWith(`${distDir}${sep}`)
  if (!insideDist) {
    return null
  }
  return await fileExists(requested) ? requested : join(distDir, 'index.html')
}
