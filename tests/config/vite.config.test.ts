import { describe, expect, it } from 'vitest'
import config from '../../vite.config'

describe('Vite map proxy', () => {
  it('forwards the map archive and map API to the GeoLists server', () => {
    expect(config.server?.proxy).toMatchObject({
      '/api/maps': 'http://127.0.0.1:4173',
      '/maps': 'http://127.0.0.1:4173',
    })
  })
})
