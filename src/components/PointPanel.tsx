import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import type { MapPoint, PointFields } from '../types/data'
import { formatCoordinate } from '../utils/coordinates'
import { buildTwoGisUrl } from '../exchange/mapdata'
import { parseCoordinateInput, TEXT_FIELD_RULES, validatePointFields, ValidationError } from '../storage/validation'
import { useDialogFocus } from '../hooks/useDialogFocus'

const EMPTY_TEXT = { name: '', organization: '', address: '', workingHours: '', website: '', comment: '' }

interface Props {
  point: MapPoint | null
  coordinates: { latitude: number; longitude: number }
  error: string | null
  saving: boolean
  onClose: () => void
  onSave: (fields: PointFields) => void
  onDelete: (() => void) | null
}

export function PointPanel({ point, coordinates, error, saving, onClose, onSave, onDelete }: Props): ReactElement {
  const dialogRef = useRef<HTMLElement>(null)
  const [values, setValues] = useState(EMPTY_TEXT)
  const [latitude, setLatitude] = useState(String(coordinates.latitude))
  const [longitude, setLongitude] = useState(String(coordinates.longitude))
  const [validationError, setValidationError] = useState<string | null>(null)
  useDialogFocus(dialogRef, onClose)
  useEffect(() => {
    setValues(point ? { name: point.name, organization: point.organization, address: point.address, workingHours: point.workingHours, website: point.website, comment: point.comment } : EMPTY_TEXT)
    setLatitude(String(point?.latitude ?? coordinates.latitude))
    setLongitude(String(point?.longitude ?? coordinates.longitude))
    setValidationError(null)
  }, [point, coordinates])
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    try {
      const fields = validatePointFields({
        ...values,
        latitude: parseCoordinateInput(latitude),
        longitude: parseCoordinateInput(longitude),
      })
      setValidationError(null)
      onSave(fields)
    } catch (reason) {
      setValidationError(reason instanceof ValidationError ? reason.message : 'Unable to validate the point.')
    }
  }
  const field = (name: keyof typeof EMPTY_TEXT, type = 'text'): ReactElement => {
    const rule = TEXT_FIELD_RULES[name]
    const requiredIndicator = rule.required ? ' *' : ''
    return <label>{rule.label}{requiredIndicator}<input type={type} value={values[name]} aria-required={rule.required} data-dialog-initial-focus={name === 'name' ? '' : undefined} onChange={(event) => setValues({ ...values, [name]: event.target.value })} /></label>
  }
  return <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} className="point-panel" role="dialog" aria-modal="true" aria-labelledby="point-title" tabIndex={-1}>
      <header><div><h2 id="point-title">{point ? 'Point details' : 'New point'}</h2><p>WGS 84 · {formatCoordinate(Number(latitude))}, {formatCoordinate(Number(longitude))}</p></div><button type="button" className="close-button" aria-label="Close point details" onClick={onClose}>×</button></header>
      <form onSubmit={submit}>
        {field('name')}
        {field('organization')}
        {field('address')}
        <div className="form-grid"><label>Latitude *<input inputMode="decimal" value={latitude} aria-required="true" onChange={(event) => setLatitude(event.target.value)} /></label><label>Longitude *<input inputMode="decimal" value={longitude} aria-required="true" onChange={(event) => setLongitude(event.target.value)} /></label></div>
        {field('workingHours')}
        {field('website', 'url')}
        <label>{TEXT_FIELD_RULES.comment.label}<textarea value={values.comment} rows={4} onChange={(event) => setValues({ ...values, comment: event.target.value })} /></label>
        {(validationError || error) && <p className="form-error" role="alert">{validationError || error}</p>}
        {point && <a className="two-gis-button" href={buildTwoGisUrl(point.longitude, point.latitude)} target="_blank" rel="noopener noreferrer">Open in 2GIS</a>}
        <div className="form-actions">{onDelete && <button type="button" className="delete-button" onClick={onDelete}>Delete</button>}<span /><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
      </form>
    </section>
  </div>
}
