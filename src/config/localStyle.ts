import type { StyleSpecification } from 'maplibre-gl'

const SOURCE_ID = 'protomaps'

/**
 * Offline-only style: every URL is same-origin. The preparation script installs
 * the Cyrillic/Latin Noto Sans glyph ranges used by the label layers.
 */
export function createLocalStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: `${window.location.origin}/map-assets/fonts/{fontstack}/{range}.pbf`,
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
        id: 'road-labels', type: 'symbol', source: SOURCE_ID, 'source-layer': 'roads', minzoom: 12,
        filter: ['has', 'name'],
        layout: {
          'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'], 'text-size': 12, 'symbol-spacing': 350,
        },
        paint: { 'text-color': '#59625d', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      },
      {
        id: 'place-labels', type: 'symbol', source: SOURCE_ID, 'source-layer': 'places', minzoom: 8,
        filter: ['has', 'name'],
        layout: {
          'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 11, 14, 15],
        },
        paint: { 'text-color': '#34463d', 'text-halo-color': '#f7f8f4', 'text-halo-width': 1.5 },
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
