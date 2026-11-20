import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ImportPreviewDialog } from '../../components/ImportPreviewDialog'
import { PointPanel } from '../../components/PointPanel'
import { Sidebar } from '../../components/Sidebar'
import type { MapDataContent } from '../../exchange/mapdata'

const PREVIEW: MapDataContent = {
  format: 'geolists.mapdata',
  version: 1,
  list: { id: 'list', name: 'Places', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  points: [],
}

describe('component accessibility semantics', () => {
  it('provides names and focus targets for the point dialog', () => {
    const markup = renderToStaticMarkup(<PointPanel point={null} coordinates={{ latitude: 0, longitude: 0 }} error={null} saving={false} onClose={vi.fn()} onSave={vi.fn()} onDelete={null} />)

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('aria-label="Close point details"')
    expect(markup).toContain('data-dialog-initial-focus=""')
  })

  it('connects the import dialog title and description and exposes an initial focus target', () => {
    const markup = renderToStaticMarkup(<ImportPreviewDialog preview={PREVIEW} error={null} saving={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)

    expect(markup).toContain('aria-labelledby="import-title"')
    expect(markup).toContain('aria-describedby="import-description"')
    expect(markup).toContain('data-dialog-initial-focus=""')
  })

  it('announces list loading and exposes a roving map-source radio group', () => {
    const mapSourceState = {
      requestId: 1,
      requestedMode: 'online' as const,
      requestedRevision: '',
      activeMode: 'online' as const,
      activeRevision: '',
      phase: 'active' as const,
      error: null,
    }
    const markup = renderToStaticMarkup(<Sidebar requestedMode="online" mapSourceState={mapSourceState} lists={[]} pointCounts={{}} activeListId={null} points={[]} loading onModeChange={vi.fn()} onCreateList={vi.fn()} onSelectList={vi.fn()} onRenameList={vi.fn()} onDeleteList={vi.fn()} onOpenPoint={vi.fn()} onExport={vi.fn()} onImport={vi.fn()} onMapInstalled={vi.fn()} />)

    expect(markup).toContain('aria-label="Loading lists"')
    expect(markup).toContain('role="radiogroup"')
    expect(markup).toContain('id="map-source-online"')
    expect(markup).toContain('aria-checked="true"')
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('id="map-source-local"')
    expect(markup).toContain('aria-checked="false"')
    expect(markup).toContain('tabindex="-1"')
  })
})
