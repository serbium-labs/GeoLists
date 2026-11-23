import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { validManifest } from '../../server/map-update-utils.mjs'

const releaseBase = 'https://github.com/serbium-labs/GeoLists/releases/download/map-spb-20261111'

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), 'utf8'))
}

describe('published Saint Petersburg map configuration', () => {
  it('points at the manifest asset for the configured GitHub Release', async () => {
    const config = await readJson('../map-updates.json')
    expect(config).toEqual({ manifestUrl: `${releaseBase}/spb-latest.json` })
  })

  it('uses the server manifest contract and the verified PMTiles asset metadata', async () => {
    const manifest = await readJson('../../spb-latest.json')
    expect(validManifest(manifest)).toBe(true)
    expect(manifest).toEqual({
      version: '20261111',
      url: `${releaseBase}/spb-20261111.pmtiles`,
      sha256: '184cac07ee2059600f0fc9913abf6a5317b7a59fb4a053c80bb280585e17e029',
      size: 92_610_255,
    })
  })
})
