import { describe, expect, it } from 'vitest'
import { publicErrorResponse } from '../api-errors.mjs'
import { estimateRegionSize, validateRegionSelection } from '../map-regions.mjs'

const selection = { name: 'QA region', bounds: [13.35, 52.48, 13.48, 52.55], maxZoom: 12 }
const limits = {
  maxArchiveBytes: 1_000_000_000,
  maxStoredBytes: 2_000_000_000,
  minFreeBytes: 0,
  maxRegionAreaKm2: 10_000,
  maxZoom: 15,
  retainedInactiveArchives: 1,
}

function responseFor(value, configuredLimits = limits) {
  try {
    const validated = validateRegionSelection(value, configuredLimits)
    return { status: 200, body: { estimatedSize: estimateRegionSize(validated) } }
  } catch (error) {
    return publicErrorResponse(error)
  }
}

describe('offline region API error responses', () => {
  it('accepts a valid region selection', () => {
    expect(responseFor(selection)).toMatchObject({ status: 200, body: { estimatedSize: expect.any(Number) } })
  })

  it('returns a safe client error when the area limit is exceeded', () => {
    expect(responseFor(selection, { ...limits, maxRegionAreaKm2: 1 })).toEqual({
      status: 422,
      body: { error: 'Map region exceeds the configured area limit' },
      internal: false,
    })
  })

  it('returns a safe client error when the archive size limit is exceeded', () => {
    expect(responseFor(selection, { ...limits, maxArchiveBytes: 1 })).toEqual({
      status: 422,
      body: { error: 'Map archive exceeds the configured size limit' },
      internal: false,
    })
  })

  it('returns a safe client error for invalid coordinates', () => {
    expect(responseFor({ ...selection, bounds: [20, 10, 10, 30] })).toEqual({
      status: 400,
      body: { error: 'Region bounds must contain valid west, south, east, and north coordinates' },
      internal: false,
    })
  })

  it('hides unexpected internal error details', () => {
    const response = publicErrorResponse(new Error('/private/maps/secret.pmtiles failed'))

    expect(response).toEqual({ status: 500, body: { error: 'Server error' }, internal: true })
    expect(JSON.stringify(response.body)).not.toContain('secret.pmtiles')
  })
})
