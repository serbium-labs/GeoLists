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
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
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
    if (!response.ok) throw new Error('Управление картой доступно при запуске через npm run serve')
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
      if (!response.ok) throw new Error(value.error || 'Не удалось проверить карту')
      if (!silent) setMessage(value.updateAvailable ? `Доступна версия ${value.version}` : 'Установлена актуальная версия')
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка проверки')
    } finally { setBusy(false) }
  }

  useEffect(() => {
    let cancelled = false
    void refresh().then((next) => {
      if (!cancelled && next.updatesConfigured) void check(true)
    }).catch((error: unknown) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : 'Локальный сервер недоступен')
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!status || !['downloading', 'verifying'].includes(status.phase)) return
    const timer = window.setInterval(() => void refresh().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Не удалось получить прогресс')
    }), 500)
    return () => window.clearInterval(timer)
  }, [status?.phase])

  const update = async () => {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/maps/update', { method: 'POST' })
      const value = await response.json() as { error?: string }
      if (!response.ok) throw new Error(value.error || 'Не удалось начать скачивание')
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка скачивания') } finally { setBusy(false) }
  }

  if (!status) return <div className="map-updates"><p className="map-update-note">{message || 'Проверка офлайн-карты…'}</p></div>
  const percent = status.total ? Math.min(100, Math.round(status.received / status.total * 100)) : 0
  const working = status.phase === 'downloading' || status.phase === 'verifying'
  const downloadSize = status.total || status.available?.size
  return <div className="map-updates">
    <p>{status.active ? `Карта установлена: ${status.active.version}${status.active.size ? ` · ${formatMapSize(status.active.size)}` : ''}` : 'Офлайн-карта отсутствует'}</p>
    {!status.active && status.available?.updateAvailable && <p className="map-update-available">Карта доступна: {status.available.version} · {formatMapSize(status.available.size)}</p>}
    {status.active && status.available?.updateAvailable && <p className="map-update-available">Доступно обновление {status.available.version} · {formatMapSize(status.available.size)}</p>}
    {working && <><progress max={100} value={status.phase === 'verifying' ? 100 : percent} /><small>{status.phase === 'verifying' ? 'Проверка SHA-256 и формата…' : `Скачивание: ${percent}%${downloadSize ? ` · ${formatMapSize(status.received)} из ${formatMapSize(downloadSize)}` : ''}`}</small></>}
    {status.phase === 'complete' && <p className="map-update-success">Карта установлена и готова к работе.</p>}
    {status.phase === 'failed' && <p className="form-error">Ошибка: {status.error}</p>}
    {message && <p className="map-update-note">{message}</p>}
    <div className="map-update-actions">
      <button type="button" disabled={busy || working || !status.updatesConfigured} onClick={() => void check()}>{busy && !working ? 'Проверка…' : 'Проверить'}</button>
      <button type="button" disabled={busy || working || !status.available?.updateAvailable} onClick={() => void update()}>{status.active ? 'Скачать обновление' : 'Скачать карту'}</button>
    </div>
    {!status.updatesConfigured && <small>Источник карты ещё не опубликован или не настроен в дистрибутиве.</small>}
  </div>
}
