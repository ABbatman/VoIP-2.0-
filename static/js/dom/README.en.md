# Dashboard UI Documentation (English)

## Overview
This document describes the dashboard UI architecture and the recent stability improvements across renderer, DOM patcher, charts, filters, and typeahead.

- The renderer builds and updates the HTML framework only (no table rows rendering).
- The virtualization engine renders table rows inside fixed containers.
- The DOM patcher applies minimal diffs safely without disrupting virtualization or charts.
- The charts module renders D3 charts and exposes a small toolbar to switch types and intervals.
- The filters module owns inputs, validation, and the Find flow (including loading feedback).

## HTML Framework (Rendered by `static/js/dom/renderer.js`)
```
page-container
├── page-title
├── filters-panel
├── summary-display
├── results-display
│   ├── table-controls
│   ├── top-scrollbar-container
│   ├── virtual-scroll-container  ← virtualization mount
│   │   ├── tableHead
│   │   ├── tableBody
│   │   └── table-footer-info
│   └── virtual-scroller-status
├── time-controls                ← time popup (N/Z/+/−)
└── overlays                     ← global overlays (loading, toasts)
```

### Renderer responsibilities
- Build the full framework (to string) and update specific parts (filters, buttons, classes).
- Never render table rows (the virtualization engine does).
- Provide `#virtual-scroll-container` for the row virtualization engine.
- Provide charts mounts: `#charts-container`, `#chart-area-1`, `#charts-controls`.

### Non-destructive filter updates
- `_updateFilters()` uses "defensive" setters:
  - Do not overwrite focused inputs.
  - Do not overwrite non-empty values unless truly changed by state.
  - Date inputs respect flatpickr presence and avoid re-entrancy.

## DOM Patcher (Morphdom) (`static/js/utils/domPatcher.js`)
- Applies minimal DOM diffs from renderer output.
- Explicitly protects critical mounts from updates/removal:
  - Virtualization: `#virtual-scroll-container`, `#summaryTable`, `#tableHead`, `#tableBody` (and descendants).
  - Charts: `#charts-container`, `#charts-controls`, `#chart-area-1` (and descendants).
- Skips any patch on `appState:filtersChanged` to avoid writing previous values back during typing.
- Re-initializes UI widgets (flatpickr, time controls) post-patch only when needed.

## Charts (`static/js/init/d3-dashboard.js` + `static/js/charts/*`)
- Lazily registers renderers via `charts/registry.js` (line, bar, heatmap, hybrid).
- Toolbar allows switching type and interval; handlers are rebound if controls are re-created.
- Rendering rules to eliminate flicker:
  - Do not render while there is no data and `status !== 'success'`.
  - Preserve mount contents in `cleanup()` (no blanking the chart area).
  - Do not re-render on `filtersChanged` (typing) — re-render only on `dataChanged` or toolbar actions.
- Unified binning pipeline uses backend `hourly_rows` to shape data per renderer type:
  - line: multi-series (TCalls, Minutes, ASR, ACD).
  - bar: TCalls per bin (x labeled as HH:MM).
  - hybrid: bars (TCalls) + line (Minutes).
  - heatmap: cells by day (Y-m-d) × time (HH:MM) with TCalls sum.

## Filters (`static/js/dom/filters.js` and helpers)
- Source of truth for query values is the DOM at the moment of clicking Find.
- `refreshFilterValues()` syncs flatpickr → input.value just before validation/building params.
- `validateFilterParams()` ensures `from/to` exist and returns normalized `from/to` (kept in UTC format `Y-m-d HH:MM:SS`).
- `buildFilterParams()` reads all input values (customer/supplier/destination/groups + dates).
- `populateFiltersFromState()` avoids overwriting when there is recent manual input.

### Loading overlay and status
- Global overlay `#loading-overlay` is shown on `status: 'loading'` and hidden on `dataChanged`/`success`.
- Buttons (Find/Reverse/Summary) are disabled while loading.
- A lightweight success toast (“Data loaded”) is shown on `appState:dataChanged`.

## Typeahead (`static/js/init/typeahead-init.js` + `dom/components/typeahead.js`)
- Typeahead attaches to `customerInput`, `supplierInput`, `destinationInput`.
- Browser history/autofill is suppressed WITHOUT toggling `readOnly`:
  - Randomized `autocomplete` and `name` attributes on every focus.
  - `aria-autocomplete="none"`.
  - Attach an empty `datalist#ta-block` and set it via `list` attribute.
  - A hidden dummy password input is inserted before each field to further defeat autofill.
- Inputs remain fully editable; caret is visible; backspace/delete by char/word/selection work normally.
- Keyboard handling inside dropdown prevents default only when the dropdown is open (arrows/Enter/Escape).

## Events and Re-rendering Rules
- filtersChanged: no DOM patch, no charts re-render (typing should not flicker UI).
- statusChanged: show/hide overlay; keep charts and toolbar visible.
- dataChanged: hide overlay; render charts once with real data; show success toast.
- dashboardViewChanged/preferencesChanged: patch DOM with normal morphdom flow.

## Troubleshooting
- Chart briefly appears then disappears: ensure `hourly_rows` is present; guards skip empty renders.
- Buttons in charts toolbar not working: controls may have been replaced; handlers are rebound on `filtersChanged`.
- Input values revert while typing: DOM patches on `filtersChanged` are disabled; renderer uses defensive updates.
- Caret not visible or delete doesn’t work: verify the latest `typeahead-init.js` is loaded (no readOnly toggling).

## Recent Changes (Changelog)
- Disabled DOM patching on `filtersChanged` to protect in-flight typing.
- Protected charts and virtualization mounts from morphdom updates/removal.
- Stopped clearing `#chart-area-1` during `cleanup()` to avoid empty shaded area.
- Unified data shaping per chart type; guaranteed fallback to line renderer.
- Suppressed browser autofill/history via randomized attributes and dummy inputs.
- Added success toast and consistent loading overlay handling.

## Compatibility
- Preserves original element IDs and class names used by other modules.
- Works alongside the existing virtualization engine without interfering with scroll/row mounts.

## Modules Index
- Renderer: `static/js/dom/renderer.js`
- DOM Patcher: `static/js/utils/domPatcher.js`
- Charts entry: `static/js/init/d3-dashboard.js`
- Filters: `static/js/dom/filters.js`
- Filter helpers: `static/js/dom/filter-helpers.js`
- Typeahead init: `static/js/init/typeahead-init.js`
- Typeahead component: `static/js/dom/components/typeahead.js`
