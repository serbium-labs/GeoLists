export const MAPLIBRE_WORKER_REVISION = 'task004-mime-1'

export function versionMapLibreWorkerUrl(workerUrl: string): string {
  const separator = workerUrl.includes('?') ? '&' : '?'
  return `${workerUrl}${separator}geolists-worker=${MAPLIBRE_WORKER_REVISION}`
}
