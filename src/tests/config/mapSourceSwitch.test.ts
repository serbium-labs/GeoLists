import { describe, expect, it } from 'vitest'
import {
  beginMapSourceSwitch,
  completeMapSourceSwitch,
  failMapSourceSwitch,
  initialMapSourceState,
} from '../../config/mapSourceSwitch'

describe('map source switching', () => {
  it('keeps only the latest request during rapid switching', () => {
    let state = initialMapSourceState('online', '')
    state = beginMapSourceSwitch(state, 'online', '')
    const onlineRequest = state.requestId
    state = beginMapSourceSwitch(state, 'local', '2026-11-20')
    const localRequest = state.requestId

    expect(completeMapSourceSwitch(state, onlineRequest)).toBe(state)
    state = completeMapSourceSwitch(state, localRequest)

    expect(state).toMatchObject({ requestedMode: 'local', activeMode: 'local', phase: 'active' })
  })

  it('reports a loading failure without changing the active source', () => {
    let state = initialMapSourceState('online', '')
    state = completeMapSourceSwitch(beginMapSourceSwitch(state, 'online', ''), 1)
    state = beginMapSourceSwitch(state, 'local', '2026-11-20')
    state = failMapSourceSwitch(state, state.requestId, 'The local map failed to load.')

    expect(state).toMatchObject({ requestedMode: 'local', activeMode: 'online', phase: 'failed' })
    expect(state.error).toBe('The local map failed to load.')
  })

  it('ignores stale errors after a newer source becomes active', () => {
    let state = initialMapSourceState('online', '')
    state = beginMapSourceSwitch(state, 'local', 'old')
    const staleRequest = state.requestId
    state = beginMapSourceSwitch(state, 'online', '')
    state = completeMapSourceSwitch(state, state.requestId)

    expect(failMapSourceSwitch(state, staleRequest, 'Stale failure')).toBe(state)
    expect(state).toMatchObject({ activeMode: 'online', phase: 'active', error: null })
  })

  it('does not activate a source after its request has already failed', () => {
    let state = initialMapSourceState('online', '')
    state = beginMapSourceSwitch(state, 'online', '')
    const requestId = state.requestId
    state = failMapSourceSwitch(state, requestId, 'Loading failed')

    expect(completeMapSourceSwitch(state, requestId)).toBe(state)
    expect(state).toMatchObject({ activeMode: null, phase: 'failed' })
  })

  it('preserves the previous working source when a replacement fails', () => {
    let state = initialMapSourceState('local', 'installed')
    state = completeMapSourceSwitch(beginMapSourceSwitch(state, 'local', 'installed'), 1)
    state = beginMapSourceSwitch(state, 'online', '')
    state = failMapSourceSwitch(state, state.requestId, 'The online map failed to load.')

    expect(state.activeMode).toBe('local')
    expect(state.activeRevision).toBe('installed')
  })
})
