import { useRef, type ReactElement } from 'react'
import type { MapDataContent } from '../../exchange/mapdata'
import { useDialogFocus } from '../../hooks/useDialogFocus'

interface Props {
  preview: MapDataContent
  error: string | null
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ImportPreviewDialog({ preview, error, saving, onCancel, onConfirm }: Props): ReactElement {
  const dialogRef = useRef<HTMLElement>(null)
  useDialogFocus(dialogRef, onCancel)

  return <div className="panel-backdrop">
    <section ref={dialogRef} className="import-preview" role="dialog" aria-modal="true" aria-labelledby="import-title" aria-describedby="import-description" tabIndex={-1}>
      <h2 id="import-title">Import preview</h2>
      <dl><div><dt>List name</dt><dd>{preview.list.name}</dd></div><div><dt>Number of points</dt><dd>{preview.points.length}</dd></div></dl>
      <p id="import-description">The list and its points will be added with new identifiers. Existing data will not be changed.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><span /><button data-dialog-initial-focus="" className="secondary-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" type="button" disabled={saving} onClick={onConfirm}>{saving ? 'Importing…' : 'Import'}</button></div>
    </section>
  </div>
}
