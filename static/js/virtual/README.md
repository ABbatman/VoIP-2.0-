# Virtualization Module

This document describes the architecture, responsibilities, and contracts of the Virtualization module. It covers both the Virtual Manager (VM) and the Virtual Scroller sub-systems.

## Goals

- Render very large tables efficiently (virtual scrolling, lazy fetch of visible rows).
- Keep UI responsive during interactions (sort, reverse, filter, expand/collapse groups).
- Provide a clean, maintainable, and testable module structure with thin facades and focused helpers.

## High-Level Architecture

```
static/js/virtual/
│
├─ index.js               # Public entrypoint (initVirtualization)
├─ virtual-manager.js     # Facade: coordinates the virtualization module
├─ virtual-adapter.js     # Adapter between VM and VirtualScroller (DOM integration)
├─ virtual-scroller.js    # Facade: Virtual Scrolling logic (thin)
│
├─ manager/               # VM layers (thin, focused)
│  ├─ selectors.js        # Visible data computation (lazy, filter/sort caches)
│  ├─ toggles.js          # Expand/collapse behavior (Show All / Hide All)
│  ├─ render.js           # Initial render, DOM update callback wiring
│  ├─ header.js           # Table header/footer rendering, sort arrows, Y icon
│  ├─ ui-sync.js          # Sticky (page-fixed) floating header sync
│  ├─ sorting.js          # Sorting helpers (main/peer/hourly)
│  ├─ data-cache.js       # Lazy indices, caches, filter/sort snapshot key
│  ├─ ui-state.js         # updateUI(), shouldUseVirtualization()
│  └─ subscriptions.js    # EventBus subscriptions and reactions (debounced)
│
├─ scroller/              # VirtualScroller helpers (thin, pure-ish)
│  ├─ viewport.js         # Visible range, speed-aware buffer, skip guard
│  ├─ pool.js             # TR pool management (ensure/detach/trim)
│  ├─ diff.js             # Partial row diff (cells/classes/data-*)
│  ├─ measurement.js      # Row height re-measure and spacer correction
│  ├─ dom-callbacks.js    # Soft-throttle DOM update callback
│  ├─ patch.js            # Patch a single row or a range without full render
│  ├─ status.js           # getStatus facade for scroller metrics
│  └─ config-adapter.js   # Apply config based on data volume
└─ tests/                 # Browser-based unit-like tests (ES modules)
```

## Virtual Manager (VM)

### Responsibilities
- Own the virtualization lifecycle (initialize/destroy, connect adapter/scroller).
- Coordinate user actions (sort/reverse/toggles) and visible data (selectors).
- Keep the UI (buttons, header, sticky header) consistent with the state.

### Contracts
- `renderVirtualTable(mainRows, peerRows, hourlyRows)` – initial data rendering.
- `showAllRows() / hideAllRows()` – bulk expand/collapse of groups.
- `updateAllToggleButtons()` – synchronizes +/- icons to current state.
- `getLazyVisibleData()` – delegates to `manager/selectors.js` for lazy visibility.

### Event Handling
- `tableState:changed` is debounced (24ms) to avoid bursty re-sorts/rebuilds.
- `appState:reverseModeChanged` collapses all groups and enforces `Show All` label.
- `tableState:yVisibilityChanged` syncs Y columns icon + floating header.

### Sticky Header
- Implemented in `manager/ui-sync.js` as a page-fixed header (not container-sticky).
- Uses rAF-throttle and early-exit guards to minimize layout work.

## Virtual Scroller

### Responsibilities
- Compute the visible window and render only those rows.
- Maintain a recycling pool of `<tr>` elements; avoid churn.
- Partially patch row cells (classes, data-attributes, text/HTML) when possible.
- Soft-throttle DOM update callback (e.g., to rebind event listeners).

### Contracts (Public API)
- `initialize()` – bind scroll handlers, detect page vs container scroll.
- `setData(data)` – set backing data, apply optimized config, trigger initial render.
- `render(force?: boolean)` – compute visible slice and update DOM.
- `throttledRender()` – timer-based throttled render.
- `scrollToIndex(index, align?)` – programmatic scroll; align = start|center|end.
- `updateRowAt(index, newRowData)` – patch a single visible row.
- `updateRows(rangeStart, rowsArray, options)` – patch a visible range; forceRender opt.
- `recomputeRowHeight()` – measure row height and correct spacer.
- `getStatus()` – report scroller status and metrics.

### Performance Mechanics
- `scroller/viewport.js` computes a speed-aware buffer multiplier.
- Skip-guard avoids re-render for small scroll deltas.
- `scroller/dom-callbacks.js` controls DOM callback cadence via `vm._domEvery`.
- `scroller/diff.js` performs partial diff; falls back to full row replace if needed.
- `manager/ui-sync.js` rAF-throttled sticky header + early-exit guard.

## Integration

### Entry Point
- Import only via `static/js/virtual/index.js` (enforced by ESLint `no-restricted-imports`).
- Example:
```js
import { initVirtualization } from './virtual/index.js';
const { ok, manager } = await initVirtualization();
if (ok) {
  manager.renderVirtualTable(mainRows, peerRows, hourlyRows);
}
```

### Render Row Function (Custom Rendering)
If you provide a custom `renderRowFn(rowData)`, adhere to:
- Stable number/order of table cells for best diff performance.
- Preserve `data-*` attributes used by UI logic:
  - `data-pdd`, `data-atime`, `data-y-toggleable`
  - For filterable cells: `data-filter-value`, `data-full-text`
- Set appropriate cell classes: `.main-cell`, `.peer-cell`, `.destination-cell`, `.hour-datetime`.

### Selectors Cache Key
- `manager/data-cache.js` computes a filter/sort snapshot key.
- Caches (`_peerRowsCache`, `_hourlyRowsCache`) are invalidated when the key changes.

## Testing

Browser-based tests live in `static/js/virtual/tests/`. Open `index.html` in a browser to run.
- `viewport.test.js` – visible window & buffer calculations.
- `diff.test.js` – partial diff of row cells.
- `pool.test.js` – pool ensure/trim.
- `patch.test.js` – patching visible rows.

## Troubleshooting / Tips
- To inspect performance, set `window.DEBUG = true` and watch `🧪 VirtualScroller.render()` logs.
- If you experience choppiness on fast scroll:
  - Slightly increase max buffer multiplier (viewport.js) or base buffer size.
  - Ensure sticky header throttling is active and early-exit is working.
- After reverse mode change, all groups collapse and `Show All` is enforced by VM.

## Future Work
- Idle-time refactors of heavy `onDOMUpdate` consumers.
- Additional tests for header rendering and Y column visibility transitions.
- Optional API `getCurrentManager()` to avoid global dependency.

## Initialization

- Use `static/js/virtual/index.js` as the single entry. The active `VirtualManager` is registered in `static/js/virtual/registry.js` to avoid globals.
- Example:

```js
import { initVirtualization } from './virtual/index.js';
import { getCurrentManager } from './virtual/registry.js';

const { ok } = await initVirtualization();
if (ok) {
  const vm = getCurrentManager();
  vm.renderVirtualTable(mainRows, peerRows, hourlyRows);
}
```

## Buffer tuning

- Central config: `static/js/virtual/scroller/buffer-config.js`.
- `getBufferConfig({ rowHeight })` returns `{ baseBufferSize, maxMult }`.
- `viewport.computeVisibleRange()` uses:
  - base buffer (minimum extra rows beyond viewport)
  - dynamic multiplier capped by `maxMult` based on scroll speed
- Guidance:
  - For very tall rows (`rowHeight > 60`), consider raising `maxMult` to 3.5–4.0.
  - For extremely fast scrolling on large datasets, increase `baseBufferSize` by +2..+5.

## CacheKey rules

- The snapshot key is built in `manager/data-cache.js::_computeFilterSortKey()` and must include all active filters and sorting descriptors.
- When adding a new filter/sort:
  - Update `_computeFilterSortKey()` to include it.
  - Add/adjust a unit test that verifies stability of the key and cache invalidation behavior.
- Recommended format: a normalized JSON string with minimal/no whitespace differences.
