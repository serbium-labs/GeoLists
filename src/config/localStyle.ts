import type { StyleSpecification } from 'maplibre-gl'

const SOURCE_ID = 'protomaps'

/**
 * A deliberately label-free starter style for a Protomaps Basemap archive.
 * It uses the documented Basemap layer names and requires no remote assets.
 * A complete local style can later add symbol layers together with local
 * glyph and sprite URLs without changing the PMTiles source integration.
 */
export function createLocalStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      [SOURCE_ID]: {
        type: 'vector',
        url: 'pmtiles:///maps/spb.pmtiles',
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#edf1e7' } },
      {
        id: 'water',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': 'water',
        paint: { 'fill-color': '#a9d5df' },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': 'landuse',
        paint: {
          'fill-color': [
            'match',
            ['get', 'kind'],
            ['park', 'forest', 'grass', 'cemetery'],
            '#cfe3c2',
            '#e5e8de',
          ],
          'fill-opacity': 0.7,
        },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': 'buildings',
        minzoom: 13,
        paint: { 'fill-color': '#d5d0c8', 'fill-outline-color': '#c4beb5' },
      },
      {
        id: 'roads-casing',
        type: 'line',
        source: SOURCE_ID,
        'source-layer': 'roads',
        paint: {
          'line-color': '#c8c2b7',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 16, 6],
        },
      },
      {
        id: 'roads',
        type: 'line',
        source: SOURCE_ID,
        'source-layer': 'roads',
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 16, 4],
        },
      },
    ],
  }
}
