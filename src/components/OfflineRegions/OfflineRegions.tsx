import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { APP_CONFIG } from '../../config/appConfig'
import type { MapBounds, MapViewport, OfflineRegion } from '../../types/map'
import { isNull, isPresent } from '../../utils/nullish'
import { formatMapSize } from '../MapUpdates'

const DEFAULT_MAX_ZOOM = 15

type RegionOperation = {
  phase: 'idle' | 'extracting' | 'complete' | 'failed' | 'cancelled'
  region: string | null
  error: string
}

type RegionStatus = {
  regions: OfflineRegion[]
  activeId: string | null
  operation: RegionOperation
  sourceDate: string
}

interface Props {
  viewport: MapViewport | null
  onActiveRegion: (region: OfflineRegion | null) => void
  onRegionActivated: (region: OfflineRegion) => void
}

async function responseJson<T>(response: Response): Promise<T> {
  const value: T & { error?: string } = await response.json() as T & { error?: string }

  if (!response.ok) {
    throw new Error(value.error || `Region API returned HTTP ${response.status}`)
  }

  return value
}

function boundsLabel(bounds: MapBounds): string {
  return bounds.map((coordinate) => coordinate.toFixed(3)).join(', ')
}

function isRegionDownloadDisabled(
  selection: MapViewport | null,
  estimatedSize: number | null,
  busy: boolean,
  operationPhase: RegionOperation['phase'] | undefined,
): boolean {
  return !selection || isNull(estimatedSize) || busy || operationPhase === 'extracting'
}

export function OfflineRegions({ viewport, onActiveRegion, onRegionActivated }: Props): ReactElement {
  const [status, setStatus] = useState<RegionStatus | null>(null)
  const [selection, setSelection] = useState<MapViewport | null>(null)
  const [name, setName] = useState('My offline region')
  const [maxZoom, setMaxZoom] = useState(DEFAULT_MAX_ZOOM)
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const previousOperationPhase = useRef<RegionOperation['phase']>('idle')

  const refresh = useCallback(async (): Promise<RegionStatus> => {
    const next: RegionStatus = await responseJson<RegionStatus>(await fetch(APP_CONFIG.api.regions, { cache: 'no-store' }))

    setStatus(next)

    const active: OfflineRegion | null = next.regions.find((region: OfflineRegion): boolean => region.id === next.activeId) || null

    onActiveRegion(active)

    if (active && previousOperationPhase.current === 'extracting' && next.operation.phase === 'complete') {
      onRegionActivated(active)
    }
    previousOperationPhase.current = next.operation.phase
    return next
  }, [onActiveRegion, onRegionActivated])

  useEffect(() => {
    void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Region management is unavailable'))
  }, [refresh])

  useEffect(() => {
    if (status?.operation.phase !== 'extracting') {
      return
    }

    const timer: number = window.setInterval(() => void refresh().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Failed to refresh region status')
    }), 1_000)
    return () => window.clearInterval(timer)
  }, [refresh, status?.operation.phase])

  const estimate = async (nextSelection: MapViewport | null = selection): Promise<void> => {
    if (!nextSelection) {
      setMessage('Move the map to the required area, then select the current view.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const value: { estimatedSize: number } = await responseJson<{ estimatedSize: number }>(await fetch(APP_CONFIG.api.regionEstimate, {
        method: 'POST',
        headers: APP_CONFIG.mutationHeaders,
        body: JSON.stringify({ name, bounds: nextSelection.bounds, maxZoom }),
      }))
      setEstimatedSize(value.estimatedSize)
    } catch (error) {
      setEstimatedSize(null)
      setMessage(error instanceof Error ? error.message : 'Could not estimate the region')
    } finally {
      setBusy(false)
    }
  }

  const selectViewport = (): void => {
    if (!viewport) {
      setMessage('The map viewport is not ready yet.')
      return
    }

    setSelection(viewport)
    setEstimatedSize(null)
    void estimate(viewport)
  }

  const download = async (): Promise<void> => {
    if (!selection || isNull(estimatedSize)) {
      setMessage('Select and estimate a region before downloading.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      await responseJson(await fetch(APP_CONFIG.api.regionDownload, {
        method: 'POST',
        headers: APP_CONFIG.mutationHeaders,
        body: JSON.stringify({ name, bounds: selection.bounds, maxZoom }),
      }))
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start the region download')
    } finally {
      setBusy(false)
    }
  }

  const activate = async (id: string): Promise<void> => {
    setBusy(true)
    setMessage('')
    try {
      const value: { active: OfflineRegion } = await responseJson<{ active: OfflineRegion }>(await fetch(APP_CONFIG.api.regionActivate, {
        method: 'POST',
        headers: APP_CONFIG.mutationHeaders,
        body: JSON.stringify({ id }),
      }))
      onActiveRegion(value.active)
      onRegionActivated(value.active)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not activate the region')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (): Promise<void> => {
    await responseJson(await fetch(APP_CONFIG.api.regionCancel, { method: 'POST', headers: APP_CONFIG.mutationHeaders, body: '{}' }))
    await refresh()
  }

  return <section className="offline-regions" aria-labelledby="offline-regions-title">
    <h3 id="offline-regions-title">Offline regions</h3>
    <button type="button" disabled={!viewport || busy} onClick={selectViewport}>Use current map view</button>
    {selection && <p className="region-bounds">Selected bounds: {boundsLabel(selection.bounds)}</p>}
    <label>Region name<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
    <label>Maximum zoom<input type="number" min={0} max={15} value={maxZoom} onChange={(event) => { setMaxZoom(Number(event.target.value)); setEstimatedSize(null) }} /></label>
    <div className="region-actions">
      <button type="button" disabled={!selection || busy} onClick={() => void estimate()}>Estimate</button>
      <button
        type="button"
        disabled={isRegionDownloadDisabled(selection, estimatedSize, busy, status?.operation.phase)}
        onClick={() => void download()}
      >Download</button>
    </div>
    {isPresent(estimatedSize) && <p className="region-estimate" role="status">Estimated download: {formatMapSize(estimatedSize)}</p>}
    {status?.operation.phase === 'extracting' && <div className="region-operation" role="status"><span>Preparing {status.operation.region}…</span><button type="button" onClick={() => void cancel()}>Cancel</button></div>}
    {status?.operation.phase === 'failed' && <p className="form-error" role="alert">{status.operation.error}</p>}
    {message && <p className="form-error" role="alert">{message}</p>}
    <div className="installed-regions">
      <h4>Installed</h4>
      {!status && <p role="status">Loading regions…</p>}
      {status && status.regions.length === 0 && <p>No offline regions installed.</p>}
      {status?.regions.map((region) => <button key={region.id} type="button" className={status.activeId === region.id ? 'active' : ''} aria-pressed={status.activeId === region.id} disabled={busy || status.activeId === region.id} onClick={() => void activate(region.id)}><span>{region.name}</span><small>{formatMapSize(region.size)} · z{region.maxZoom}</small></button>)}
    </div>
  </section>
}
