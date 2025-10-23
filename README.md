# VoIP Traffic Dashboard

This project is a tool for visualizing key performance indicators (KPIs) related to VoIP traffic. It provides clear statistical tables and dynamic charts to analyze traffic patterns, quality metrics, and trends.

The interface is designed to highlight the most relevant values for operators and engineers working with real-time voice traffic.

## Purpose

The main goal is to present VoIP traffic data in a clear and structured way, helping to quickly identify anomalies, trends, and performance issues.

## Features

- KPI tables with filtering and delta comparison
- Interactive charts for time-based analysis
- Lightweight and responsive UI
- Data-driven layout focused on operational clarity
- Typeahead filters for `Customer`, `Supplier`, `Destination` with server-side suggestions

## Typeahead (Customer/Supplier/Destination)

- Frontend module lives in `static/js/dom/components/typeahead.js` and is initialized from `static/js/init/typeahead-init.js` (imported by `static/js/main.js`).
- Dropdown appears under the input, fetches suggestions via API as you type (no result limit by design).
- Browser native autofill/history is suppressed specifically for these three inputs.

### API endpoints

Both Tornado and FastAPI stacks expose the same routes:

- `GET /api/suggest/customer?q=<prefix>`
- `GET /api/suggest/supplier?q=<prefix>`
- `GET /api/suggest/destination?q=<prefix>`

Response format:

```json
{ "items": ["...", "..."] }
```

Data is queried from `sonus_aggregation_new` using a case-insensitive prefix filter.

### Frontend initialization

- Initialization is encapsulated in `initTypeaheadFilters()` (`static/js/init/typeahead-init.js`) and attaches Typeahead to `#customerInput`, `#supplierInput`, `#destinationInput`.
- The module also applies measures to disable native browser suggestions for these three fields only.

No additional NPM dependencies are required; all code is plain ES modules bundled by Vite.

## D3.js

- Installed via npm: `d3`
- Entry module: `static/js/init/d3-init.js`
- Imported and invoked from `static/js/main.js` (`initD3()`), which exposes `window.d3` for console debugging.
- Use `import { d3 } from "../init/d3-init.js"` inside feature modules or import specific D3 submodules directly (e.g., `import { scaleLinear } from 'd3-scale'`).

## Notes

This project is built using AI-assisted development as a personal tool for visualizing internal traffic statistics.

Licensed under the Apache License, Version 2.0.

## Charts ↔ Table Hierarchy & Zoom (Contract)

- **Charts are authoritative** for the visual time window. Zoom selection is stored in `window.__chartsZoomRange`.
- **Table is a pure consumer** and must not affect charts. Loading Summary Table never updates global chart data.
- **Zoom application**:
  - Charts use `window.__chartsZoomRange` for view-only rendering (does not mutate filter inputs).
  - Summary Table and Find may override ONLY request params (`from/to`) with the zoom range for that specific request.
  - Global filters (`setFilters`) persist the original input values so charts know the base range.
- **Zoom reset (RMB)**:
  - Steps back through a local zoom stack. When empty, clears zoom to the base range.
  - Does not trigger any data fetching by itself.

Relevant files:
- `static/js/charts/zoom/brushZoom.js` — zoom overlay, stack, and hierarchy notes.
- `static/js/dom/filters.js` — Find/Summary behaviors honoring the contract above.

## Initialization Order & Anti-Flicker (Strict Sequence)

To avoid race conditions and UI flicker, the app follows a strict sequence for initialization and rendering.

- **Filters init** (`static/js/dom/filters.js` → `initFilters(isStateLoaded)`)
  - Initializes date/time widgets (`initFlatpickr()`, `initTimeControls()`).
  - Sets default date range only when ALL inputs are empty AND there is no URL state. If URL state exists, defaults are skipped but handlers/subscriptions are still attached (no early return).
  - Subscribes to `appState:statusChanged`/`appState:dataChanged` to keep the table hidden while loading and ensure charts are visible.

- **Charts init** (`static/js/init/d3-dashboard.js` → `initD3Dashboard()`)
  - Waits for `#charts-container` and `#chart-area-1` via `whenReadyForCharts()` before any render.
  - Ensures chart registry defaults via `ensureDefaults()` and overrides the `line` renderer with `renderMultiLineChart()` if available.
  - Builds toolbar buttons and interval controls deterministically and fixes chart area height (`ensureFixedChartHeight()`) so DOM changes do not cause jumps.
  - Renders the selected chart with the base filters or the active zoom view-only range. Attaches zoom overlay (`attachChartZoom()`), which updates `window.__chartsZoomRange` and triggers a smooth re-render (no filter mutation).

- **Find flow (data refresh)** (`filters.js` → `handleFindClick()`)
  - Sets status to `loading`, hides summary metrics and table, sets `window.__hideTableUntilSummary = true`, and hard-destroys previous table DOM to prevent residual flashes.
  - Validates inputs (`validateFilterParams()`), builds request params (`buildFilterParams()`), and applies a zoom override to request `from/to` only if zoom is active (does not mutate inputs/state).
  - Persists original inputs via `setFilters()`; on success triggers `setMetricsData()` which emits `appState:dataChanged` to re-render charts. The table stays hidden until the user clicks Summary.

- **Summary Table flow** (`filters.js` → `handleSummaryClick()`)
  - Sets status to `loading`, hides the table, resets virtual table state, and fetches fresh data using current inputs with a zoom override (if active) applied to request params only.
  - Prepares the table structure first: `renderTableHeader()`, `renderTableFooter()`, `showTableControls()`, then initializes controls `initTableControls()` and triggers virtual render.
  - Only after structure and controls are prepared the table container is unhidden to avoid flicker.

- **Zoom behavior** (`charts/zoom/brushZoom.js`)
  - LMB drag selects a range; selection is stored in `window.__chartsZoomRange` and triggers a smooth chart re-render via `onApplyRange`.
  - RMB (context menu) steps back through `window.__chartsZoomStack`; when empty, clears zoom to the base range. No network fetch is triggered by RMB.

These measures ensure:
- No premature table flashes during Find/Summary.
- Charts remain the authoritative source of the visual time window.
- URL state restoration does not break event handler setup.

## UI State Model (appState.ui)

UI visibility is centralized in `appState.ui` to prevent race conditions and rollback of visibility during re-renders.

- Fields (in `static/js/state/appState.js`):
  - `ui.showCharts: boolean` — visibility of `#charts-container` and `#charts-controls`.
  - `ui.showModeControls: boolean` — visibility of `#tableModeControls` (Summary/CDR buttons).
  - `ui.showTable: boolean` — visibility of the Summary table container `.results-display`.
- API:
  - Getters: `getUI()`, `isChartsVisible()`, `isModeControlsVisible()`, `isTableVisible()`.
  - Setters: `setUI({...})`, `setShowCharts(bool)`, `setShowModeControls(bool)`, `setShowTable(bool)`.
  - Events: `appState:uiChanged` emitted only when any of the above flags actually change.
- Consumers:
  - `static/js/dom/renderer.js` reads `getUI()` to render Chart/Controls/Mode-buttons visibility.
  - `static/js/dom/filters.js` subscribes to `appState:uiChanged` to toggle `.results-display` class and keep the table in sync.

### Visibility Contract

- On initial load:
  - Show all filter inputs and Reverse.
  - `ui.showCharts = false`, `ui.showModeControls = false`, `ui.showTable = false`.
- On Find:
  - `setUI({ showCharts: true, showModeControls: true })`.
  - Table stays hidden: `setShowTable(false)`.
- On Summary:
  - After header/footer/controls and virtual data are ready: `setShowTable(true)`.

Note: Do not change chart/table visibility via direct DOM `.style.display` outside of the `appState.ui` flow. This prevents one render path from overwriting another.

## Potential Overwrite Hotspots (checked)

- `static/js/init/d3-dashboard.js`
  - Previously forced `display` for charts/controls; now removed. Re-render is pure; visibility is left to `appState.ui`.
- `static/js/dom/filters.js`
  - Direct `display` usage removed for charts/controls/mode-buttons; table visibility moved to `ui.showTable`. Internal table controls are still managed in `table-ui.js` (OK).
- `static/js/dom/components/typeahead.js`
  - Uses `.style.display` for dropdown. Safe (scoped to typeahead UI) — no interference with charts/table visibility.
- `static/js/dom/table-ui.js`, `static/js/dom/table-renderers.js`, `static/js/virtual/manager/ui-sync.js`
  - Localized visibility toggles (spinners, row groups) are OK. Do not control global container visibility.
- `static/js/dom/ui-widgets.js`, `static/js/dom/sticky-table-chrome.js`, `static/js/dom/table-controls.js`
  - Only internal UI adjustments. No global overrides found.

If you add new UI that affects charts/table/mode-buttons visibility, use `appState.ui` instead of direct DOM toggles.

## State Weak Points & Profit-Oriented Improvements

- Disable multi-flight Find
  - Problem: Rapid clicks can start overlapping requests and out-of-order state.
  - Fix: guard in `handleFindClick()` with an in-flight flag; ignore or cancel previous. Profit: consistent data/render and less server load.

- Disable Find while loading
  - Problem: User can spam Find.
  - Fix: set `[disabled]` on `#findButton` when `status==='loading'`, re-enable on `success/error`. Profit: avoids double fetch and flicker.

- Single-source date parsing
  - Problem: Mixed date parsing scattered in modules.
  - Fix: centralize parse/format helpers (UTC) in one module and reuse in charts/table requests. Profit: fewer timezone bugs, consistent ranges.

- UI event debouncing
  - Problem: Quick changes in date/time inputs can trigger redundant work.
  - Fix: debounce input handlers (300–500ms) before enabling Find. Profit: fewer state churns and fetches.

- Virtual table activation checks
  - Problem: "Virtual Manager: Not active" logs on early calls.
  - Fix: gate render calls with `if (window.virtualManager?.isActive)`, already partially done; ensure Summary path always initializes before render. Profit: cleaner logs and fewer no-op code paths.

- Centralized CSS classes for hidden states
  - Problem: Inline styles harder to override.
  - Fix: prefer adding/removing `is-hidden` class where possible. For charts/mode-buttons, state already centralized in `appState.ui`. Profit: easier theming and fewer inline overrides.

