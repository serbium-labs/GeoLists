import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../../components/Sidebar'
import { POINTS_PER_PAGE } from '../../components/Sidebar/pointPagination'
import type { MapPoint } from '../../types/data'

function point(index: number): MapPoint {
  return {
    id: `point-${index}`,
    listId: 'list',
    name: `Point ${index}`,
    organization: '',
    address: '',
    latitude: 50,
    longitude: 10,
    workingHours: '',
    website: '',
    comment: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('large point list rendering', () => {
  it('renders one sidebar page instead of 10,000 point buttons', () => {
    const points = Array.from({ length: 10_000 }, (_, index) => point(index))
    const mapSourceState = {
      requestId: 1,
      requestedMode: 'online' as const,
      requestedRevision: '',
      activeMode: 'online' as const,
      activeRevision: '',
      phase: 'active' as const,
      error: null,
    }
    const markup = renderToStaticMarkup(<Sidebar requestedMode="online" mapSourceState={mapSourceState} lists={[]} pointCounts={{ list: points.length }} activeListId="list" points={points} selectedPointId={null} loading={false} viewport={null} onModeChange={vi.fn()} onCreateList={vi.fn()} onSelectList={vi.fn()} onRenameList={vi.fn()} onDeleteList={vi.fn()} onOpenPoint={vi.fn()} onExport={vi.fn()} onImport={vi.fn()} onMapInstalled={vi.fn()} onActiveRegion={vi.fn()} onRegionActivated={vi.fn()} />)

    expect(markup.match(/id="point-entry-/g)).toHaveLength(POINTS_PER_PAGE)
    expect(markup).toContain('Showing 1–100 of 10000')
    expect(markup).not.toContain('id="point-entry-point-9999"')
  })
})
