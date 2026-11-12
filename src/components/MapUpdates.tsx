import { useEffect, useState } from 'react'

type Status = {
  phase: 'idle' | 'downloading' | 'verifying' | 'complete' | 'failed'
  received: number
  total: number
  error: string
  active: { version: string; size?: number } | null
  updatesConfigured: boolean
  available?: { version: string; updateAvailable: boolean } | null
}

const formatSize = (bytes?: number) => bytes ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : ''

export function MapUpdates() {
  const [status, setStatus] = useState<Status | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const response = await fetch('/api/maps/status', { cache: 'no-store' })
    if (!response.ok) throw new Error('Управление обновлениями доступно при запуске через npm run serve')
    setStatus(await response.json() as Status)
  }

  useEffect(() => { void refresh().catch(() => setStatus(null)) }, [])
  useEffect(() => {
    if (!status || !['downloading', 'verifying'].includes(status.phase)) return
    const timer = window.setInterval(() => void refresh(), 500)
    return () => window.clearInterval(timer)
  }, [status?.phase])

  const check = async () => {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/maps/check', { method: 'POST' })
      const value = await response.json() as { version?: string; updateAvailable?: boolean; error?: string }
      if (!response.ok) throw new Error(value.error || 'Не удалось проверить обновление')
      setMessage(value.updateAvailable ? `Доступна версия ${value.version}` : 'Установлена актуальная версия')
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка проверки') } finally { setBusy(false) }
  }

  const update = async () => {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/maps/update', { method: 'POST' })
      const value = await response.json() as { error?: string }
      if (!response.ok) throw new Error(value.error || 'Не удалось начать обновление')
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка обновления') } finally { setBusy(false) }
  }

  if (!status) return <p className="map-update-note">Обновления доступны через локальный сервер.</p>
  const percent = status.total ? Math.min(100, Math.round(status.received / status.total * 100)) : 0
  const working = status.phase === 'downloading' || status.phase === 'verifying'
  return <div className="map-updates">
    <p>{status.active ? `Версия: ${status.active.version} ${formatSize(status.active.size)}` : 'Офлайн-карта не установлена'}</p>
    {working && <><progress max={100} value={status.phase === 'verifying' ? 100 : percent} /><small>{status.phase === 'verifying' ? 'Проверка целостности…' : `Скачивание: ${percent}%`}</small></>}
    {status.phase === 'complete' && <p className="map-update-success">Обновление установлено. Перезагрузите страницу.</p>}
    {status.phase === 'failed' && <p className="form-error">{status.error}</p>}
    {message && <p className="map-update-note">{message}</p>}
    <div className="map-update-actions">
      <button type="button" disabled={busy || working || !status.updatesConfigured} onClick={() => void check()}>Проверить</button>
      <button type="button" disabled={busy || working || !status.available?.updateAvailable} onClick={() => void update()}>Скачать</button>
    </div>
    {!status.updatesConfigured && <small>Источник обновлений не настроен.</small>}
  </div>
}
