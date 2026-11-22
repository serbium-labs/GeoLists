# UI Architecture and Accessibility Audit

## Responsibility boundaries

- `App` owns application-level orchestration: selected list, point editing workflow, import/export workflow, persisted map-source preference, and errors that cross component boundaries. It passes state and commands down but does not implement map rendering, update transport, or dialog markup.
- `Sidebar` presents list navigation, point navigation, import/export entry points, map-source selection, and the map-update region. It does not access IndexedDB or the map instance.
- `MapView` is the adapter around MapLibre and PMTiles. It owns map lifecycle, styles, markers, map loading and map-specific errors. It reports user intent through callbacks and does not persist lists or map-source preferences.
- `MapUpdates` owns communication with the map status/check/update endpoints and presents update progress. It does not select a map style directly; a completed installation is reported to its parent.
- Dialog components own dialog semantics, focus containment, Escape handling, and their local validation presentation. They do not perform persistence.
- The reverse-geocoding service owns coordinate-to-address transport, cancellation, response validation, loading, empty, and error states. `MapView` only reports coordinates, and storage receives an address only after the user accepts the suggestion.

## State presentation rules

- Loading, empty, error, and success states are distinct and must not replace one another ambiguously.
- Loading regions use `role="status"` with polite announcements. Placeholders approximate the final layout and never appear interactive.
- Errors that block or fail an initiated operation use `role="alert"`. Dismiss controls have explicit accessible names.
- Background progress is exposed through a labelled native `progress` element. Its containing region uses `aria-busy` while work is active.
- Empty states explain the next available action. Disabled controls remain labelled and are only used when the action cannot currently succeed.
- Map-source loading and errors belong to `MapView`; update download progress and errors belong to `MapUpdates`; persistence and import errors belong to `App` or the active dialog.

## Audit findings and remediation

The audit covered dialogs, programmatic names, keyboard operation, focus movement, loading/error/empty states, and component boundaries.

Confirmed defects fixed in Issue #12:

- Point and import dialogs now move focus inside on open, contain Tab navigation, close on Escape, and restore the previously focused element.
- The import dialog was extracted from `App` into a focused presentation component.
- Symbol-only close and dismiss controls now have explicit accessible names.
- The document language now matches the English interface so assistive technology uses the correct pronunciation rules.
- The map-source radio group implements roving tab focus plus Arrow, Home, and End navigation.
- List buttons expose the list name, point count, and current state without relying on visual layout.
- Focus is visibly indicated for buttons, links, form controls, map markers, and the visually hidden import input; reduced-motion preferences disable skeleton animation.
- List loading uses a non-interactive skeleton and polite status announcement.
- Map loading, map update messages, download progress, failures, and application errors use appropriate status or alert semantics.
- Map marker names describe their action rather than exposing only the underlying place name.

The native browser prompt and confirmation flows remain keyboard-operable and modal, so replacing them was not required for this issue. Their visual consistency can be reconsidered only together with a broader dialog design system.

## Unpublished GitHub Issue drafts

These drafts are intentionally not published and do not change the scope of Issue #12.

### Enable keyboard-only point placement on the map

**Type:** ENHANCEMENT

**Priority:** P1

MapLibre navigation is keyboard-operable, and existing markers are buttons, but creating a point still depends on a pointer click at a geographic position. Provide a keyboard workflow that exposes the current map centre and lets a user create a point there without requiring pointer input.

Acceptance criteria:

- A keyboard user can select coordinates and open the new-point dialog without a pointer.
- The action has an accessible name and instructions that do not rely on visual position alone.
- Focus moves predictably between the map action and the point dialog and returns after closing.
- Pointer-based point creation continues to work unchanged.

### Add browser-level accessibility regression checks

**Type:** TASK

**Priority:** P2

The current dependency-free tests verify semantic markup and keyboard state calculations, but they cannot exercise real browser focus order, MapLibre canvas interaction, or computed focus visibility. Add a browser-level accessibility suite when the project adopts an end-to-end test runner.

Acceptance criteria:

- Tests cover dialog initial focus, Tab containment, Escape, and focus restoration in a real browser.
- Tests cover map-source arrow-key navigation and the import file control.
- Automated accessibility checks run against the primary loading, empty, error, dialog, and map states.
- The suite runs in CI without changing production behavior.
