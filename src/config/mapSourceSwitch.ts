import type { MapSourceMode } from '../types/map'

export type MapSourcePhase = 'loading' | 'active' | 'failed'

export interface MapSourceState {
  requestId: number
  requestedMode: MapSourceMode
  requestedRevision: string
  activeMode: MapSourceMode | null
  activeRevision: string
  phase: MapSourcePhase
  error: string | null
}

export function initialMapSourceState(mode: MapSourceMode, revision: string): MapSourceState {
  return {
    requestId: 0,
    requestedMode: mode,
    requestedRevision: revision,
    activeMode: null,
    activeRevision: '',
    phase: 'loading',
    error: null,
  }
}

export function beginMapSourceSwitch(state: MapSourceState, mode: MapSourceMode, revision: string): MapSourceState {
  return {
    ...state,
    requestId: state.requestId + 1,
    requestedMode: mode,
    requestedRevision: revision,
    phase: 'loading',
    error: null,
  }
}

export function completeMapSourceSwitch(state: MapSourceState, requestId: number): MapSourceState {
  if (state.requestId !== requestId || state.phase !== 'loading') {
    return state
  }
  return {
    ...state,
    activeMode: state.requestedMode,
    activeRevision: state.requestedRevision,
    phase: 'active',
    error: null,
  }
}

export function failMapSourceSwitch(state: MapSourceState, requestId: number, error: string): MapSourceState {
  if (state.requestId !== requestId || state.phase !== 'loading') {
    return state
  }
  return { ...state, phase: 'failed', error }
}

export function isMapSourceActive(state: MapSourceState, mode: MapSourceMode, revision: string): boolean {
  return state.activeMode === mode && (mode !== 'local' || state.activeRevision === revision)
}
