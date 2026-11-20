import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('document language', () => {
  it('declares the language used by the interface', async () => {
    const html = await readFile(new URL('../../../index.html', import.meta.url), 'utf8')

    expect(html).toContain('<html lang="en">')
  })
})
