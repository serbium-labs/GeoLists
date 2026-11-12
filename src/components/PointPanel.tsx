import { useEffect, useState, type FormEvent } from 'react'
import type { MapPoint, PointFields } from '../types/data'
import { formatCoordinate } from '../utils/coordinates'
import { buildTwoGisUrl } from '../exchange/mapdata'

const emptyText = { name: '', organization: '', address: '', workingHours: '', website: '', comment: '' }

interface Props {
  point: MapPoint | null
  coordinates: { latitude: number; longitude: number }
  error: string | null
  saving: boolean
  onClose: () => void
  onSave: (fields: PointFields) => void
  onDelete: (() => void) | null
}

export function PointPanel({ point, coordinates, error, saving, onClose, onSave, onDelete }: Props) {
  const [values, setValues] = useState(emptyText)
  const [latitude, setLatitude] = useState(String(coordinates.latitude))
  const [longitude, setLongitude] = useState(String(coordinates.longitude))
  useEffect(() => {
    setValues(point ? { name: point.name, organization: point.organization, address: point.address, workingHours: point.workingHours, website: point.website, comment: point.comment } : emptyText)
    setLatitude(String(point?.latitude ?? coordinates.latitude))
    setLongitude(String(point?.longitude ?? coordinates.longitude))
  }, [point, coordinates])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave({ ...values, latitude: Number(latitude), longitude: Number(longitude) })
  }
  const field = (name: keyof typeof emptyText, label: string, maxLength: number, type = 'text') => <label>{label}<input type={type} value={values[name]} maxLength={maxLength} required={name === 'name'} onChange={(event) => setValues({ ...values, [name]: event.target.value })} /></label>
  return <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="point-panel" role="dialog" aria-modal="true" aria-labelledby="point-title">
      <header><div><h2 id="point-title">{point ? 'Карточка точки' : 'Новая точка'}</h2><p>WGS 84 · {formatCoordinate(Number(latitude))}, {formatCoordinate(Number(longitude))}</p></div><button type="button" className="close-button" onClick={onClose}>×</button></header>
      <form onSubmit={submit}>
        {field('name', 'Название точки *', 150)}
        {field('organization', 'Предприятие / организация', 200)}
        {field('address', 'Адрес', 500)}
        <div className="form-grid"><label>Широта<input inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label><label>Долгота<input inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label></div>
        {field('workingHours', 'Часы работы', 300)}
        {field('website', 'Сайт', 2048, 'url')}
        <label>Комментарий<textarea value={values.comment} maxLength={3000} rows={4} onChange={(event) => setValues({ ...values, comment: event.target.value })} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {point && <a className="two-gis-button" href={buildTwoGisUrl(point.longitude, point.latitude)} target="_blank" rel="noopener noreferrer">Открыть в 2ГИС</a>}
        <div className="form-actions">{onDelete && <button type="button" className="delete-button" onClick={onDelete}>Удалить</button>}<span /><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</button></div>
      </form>
    </section>
  </div>
}
