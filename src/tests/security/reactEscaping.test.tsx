import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PointPanel } from '../../components/PointPanel'

describe('React text escaping', () => {
  it('renders XSS-like validation text without creating executable markup', () => {
    const payload = '<img src=x onerror="globalThis.compromised=true">'
    const markup = renderToStaticMarkup(<PointPanel
      point={null}
      coordinates={{ latitude: 0, longitude: 0 }}
      error={payload}
      saving={false}
      onClose={vi.fn()}
      onSave={vi.fn()}
      onDelete={null}
    />)

    expect(markup).toContain('&lt;img src=x onerror=&quot;globalThis.compromised=true&quot;&gt;')
    expect(markup).not.toContain('<img src=x')
  })
})
