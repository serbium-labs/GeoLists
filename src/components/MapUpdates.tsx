import { useEffect, useRef, useState } from 'react'

export type MapUpdateStatus = {
  phase: 'idle' | 'downloading' | 'verifying' | 'complete' | 'failed'
  received: number
  total: number
  error: string
  active: { version: string; size?: number } | null
  updatesConfigured: boolean
  available: { version: string; size: number; updateAvailable: boolean } | null
}

export const formatMapSize = (bytes?: number) => {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${value.toFixed(unit < 2 ? 0 : 1)} ${units[unit]}`
}

interface Props {
  onInstalled: (version: string) => void
}

export function MapUpdates({ onInstalled }: Props) {
  const [status, setStatus] = useState<MapUpdateStatus | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const knownVersion = useRef<string | null | undefined>(undefined)

  const refresh = async () => {
    const response = await fetch('/api/maps/status', { cache: 'no-store' })
    if (!response.ok) throw new Error('Map management is available when running npm run serve')
    const next = await response.json() as MapUpdateStatus
    setStatus(next)
    const version = next.active?.version ?? null
    if (knownVersion.current === undefined) knownVersion.current = version
    else if (version && version !== knownVersion.current) {
      knownVersion.current = version
      onInstalled(version)
    }
    return next
  }

  const check = async (silent = false) => {
    setBusy(true)
    if (!silent) setMessage('')
    try {
      const response = await fetch('/api/maps/check', { method: 'POST' })
      const value = await response.json() as { version?: string; updateAvailable?: boolean; error?: string }
      if (!response.ok) throw new Error(value.error || 'Failed to check the map')
      if (!silent) setMessage(value.updateAvailable ? `Version ${value.version} is available` : 'The latest version is installed')
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update check failed')
    } finally { setBusy(false) }
  }

  useEffect(() => {
    let cancelled = false
    void refresh().then((next) => {
      if (!cancelled && next.updatesConfigured) void check(true)
    }).catch((error: unknown) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : 'Local server is unavailable')
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!status || !['downloading', 'verifying'].includes(status.phase)) return
    const timer = window.setInterval(() => void refresh().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Failed to get progress')
    }), 500)
    return () => window.clearInterval(timer)
  }, [status?.phase])

  const update = async () => {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/maps/update', { method: 'POST' })
      const value = await response.json() as { error?: string }
      if (!response.ok) throw new Error(value.error || 'Failed to start download')
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Download failed') } finally { setBusy(false) }
  }

  if (!status) return <div className="map-updates"><p className="map-update-note">{message || 'Checking offline map…'}</p></div>
  const percent = status.total ? Math.min(100, Math.round(status.received / status.total * 100)) : 0
  const working = status.phase === 'downloading' || status.phase === 'verifying'
  const downloadSize = status.total || status.available?.size
  return <div className="map-updates">
    <p>{status.active ? `Map installed: ${status.active.version}${status.active.size ? ` · ${formatMapSize(status.active.size)}` : ''}` : 'Offline map is not installed'}</p>
    {!status.active && status.available?.updateAvailable && <p className="map-update-available">Map available: {status.available.version} · {formatMapSize(status.available.size)}</p>}
    {status.active && status.available?.updateAvailable && <p className="map-update-available">Update available: {status.available.version} · {formatMapSize(status.available.size)}</p>}
    {working && <><progress max={100} value={status.phase === 'verifying' ? 100 : percent} /><small>{status.phase === 'verifying' ? 'Verifying SHA-256 and format…' : `Downloading: ${percent}%${downloadSize ? ` · ${formatMapSize(status.received)} of ${formatMapSize(downloadSize)}` : ''}`}</small></>}
    {status.phase === 'complete' && <p className="map-update-success">Map installed and ready to use.</p>}
    {status.phase === 'failed' && <p className="form-error">Error: {status.error}</p>}
    {message && <p className="map-update-note">{message}</p>}
    <div className="map-update-actions">
      <button type="button" disabled={busy || working || !status.updatesConfigured} onClick={() => void check()}>{busy && !working ? 'Checking…' : 'Check for updates'}</button>
      <button type="button" disabled={busy || working || !status.available?.updateAvailable} onClick={() => void update()}>{status.active ? 'Download update' : 'Download map'}</button>
    </div>
    {!status.updatesConfigured && <small>The map source has not been published yet or is not configured in this distribution.</small>}
  </div>
}
