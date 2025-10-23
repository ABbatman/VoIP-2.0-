// static/js/dom/filters.js

import { fetchMetrics } from "../data/fetchMetrics.js";
import {
  isReverseMode,
  setReverseMode,
  setMetricsData,
  setAppStatus,
  getAppStatus,
  setFilters,
  setUI,
  setShowTable,
} from "../state/appState.js";
import { subscribe } from "../state/eventBus.js";
import { saveStateToUrl } from "../state/urlState.js";
import { hideTableUI, renderTableHeader, renderTableFooter, showTableControls, initTableView } from "./table-ui.js";
import { initTableControls, clearAllTableFilters, setupAutoFilterClearing, clearColumnFilter } from "./table-controls.js";
import { buildFilterParams, setDefaultDateRange, validateFilterParams, refreshFilterValues } from "./filter-helpers.js";
import { initFlatpickr, initTimeControls } from "./ui-widgets.js";
import { initTableInteractions } from "./table.js";
import { initStickyFooter, initStickyHeader } from "./sticky-table-chrome.js";
import { renderCoordinator } from "../rendering/render-coordinator.js";

export function initFilters(isStateLoaded) {
  const findButton = document.getElementById("findButton");
  const summaryTableButton = document.getElementById("btnSummary");
  const reverseButton = document.getElementById("btnReverse");
  // Initial UI state: keep all filters (including Reverse) visible; charts/modes default hidden via renderer template
  // Table visibility is governed by appState.ui
  setUI({ showTable: false });

  // Note: flatpickr and time controls are now initialized by the renderer
  // We only need to set up event handlers here

  // Ensure date/time widgets are initialized (renderer hook may not run here)
  try {
    initFlatpickr(); // init calendar widgets
    initTimeControls(); // init time popup controls
  } catch (_) { /* no-op if not available */ }

// (moved below) destroyTableHard declared at module scope

  // Force UTC defaults if all inputs are still empty (covers cases with duplicate init flows)
  try {
    const fromDate = document.getElementById("fromDate");
    const toDate = document.getElementById("toDate");
    const fromTime = document.getElementById("fromTime");
    const toTime = document.getElementById("toTime");
    const allEmpty = (!fromDate?.value || fromDate.value.trim() === "") &&
                     (!toDate?.value || toDate.value.trim() === "") &&
                     (!fromTime?.value || fromTime.value.trim() === "") &&
                     (!toTime?.value || toTime.value.trim() === "");
    if (allEmpty) {
      setDefaultDateRange();
    }
  } catch (_) { /* best-effort */ }

  // Only set default date range if inputs are completely empty AND no URL state exists
  if (!isStateLoaded) {
    const fromDate = document.getElementById("fromDate");
    const toDate = document.getElementById("toDate");
    const fromTime = document.getElementById("fromTime");
    const toTime = document.getElementById("toTime");
    
    // Check if ALL date/time inputs are empty
    const allEmpty = (!fromDate || !fromDate.value || fromDate.value.trim() === "") && 
                     (!toDate || !toDate.value || toDate.value.trim() === "") && 
                     (!fromTime || !fromTime.value || fromTime.value.trim() === "") && 
                     (!toTime || !toTime.value || toTime.value.trim() === "");
    
    // Additional check: if there's state in URL, don't set default dates even if inputs appear empty
    const hasUrlState = window.location.hash && window.location.hash.startsWith("#state=");
    
    console.log("🔍 initFilters: Checking if inputs are empty:", {
      fromDate: fromDate?.value,
      toDate: toDate?.value,
      fromTime: fromTime?.value,
      toTime: toTime?.value,
      allEmpty,
      isStateLoaded,
      hasUrlState
    });
    
    if (allEmpty && !hasUrlState) {
      console.log("🔍 initFilters: All inputs empty and no URL state, setting default date range");
      setDefaultDateRange();
    } else if (allEmpty && hasUrlState) {
      console.log("🔍 initFilters: Inputs appear empty but URL state exists, waiting for state restoration - SKIPPING default dates");
      // Don't set default dates if URL state exists - wait for it to be loaded
      // Continue initialization to ensure handlers/subscriptions are attached
    } else {
      console.log("🔍 initFilters: Some inputs have values, skipping default date range");
    }
  } else {
    console.log("🔍 initFilters: State already loaded, skipping default date range");
  }

  // Simple debounce util (no external deps)
  const debounce = (fn, wait = 250) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  };

  if (findButton) {
    // debounce Find to avoid rapid double clicks
    findButton.addEventListener("click", debounce((e) => {
      // ignore if loading
      if (getAppStatus && getAppStatus() === 'loading') return;
      handleFindClick(e);
    }, 250));
  } else {
    console.warn("⚠️ Find button not found");
  }

  if (summaryTableButton) {
    summaryTableButton.addEventListener("click", handleSummaryClick);
  } else {
    console.warn("⚠️ Summary Table button not found");
  }

  if (reverseButton) {
    reverseButton.addEventListener("click", (e) => {
      // ignore Reverse while loading to prevent races
      if (getAppStatus && getAppStatus() === 'loading') return;
      handleReverseClick(e);
    });
  } else {
    console.warn("⚠️ Reverse button not found");
  }

  // Enforce table hidden state during Find across DOM patches
  try {
    subscribe("appState:statusChanged", (status) => {
      if (status === "loading" || (typeof window !== "undefined" && window.__hideTableUntilSummary)) {
        try { setShowTable(false); } catch(_) {}
      }
      // toggle global overlay
      try {
        const overlayEl = document.getElementById('loading-overlay');
        if (overlayEl) overlayEl.classList.toggle('is-hidden', status !== 'loading');
      } catch(_) {}
      // reinforce charts/mode controls visibility across patches
      if (status === 'loading' || status === 'success') {
        try { setUI({ showCharts: true, showModeControls: true }); } catch(_) {}
      }
      // disable/enable buttons while loading
      try { if (findButton) findButton.disabled = (status === 'loading'); } catch(_) {}
      try { if (reverseButton) reverseButton.disabled = (status === 'loading'); } catch(_) {}
      try { if (summaryTableButton) summaryTableButton.disabled = (status === 'loading'); } catch(_) {}
    });
  } catch (_) { /* best-effort */ }

  // Auto-fetch data when user switches interval without pressing Find
  try {
    const already = (() => { try { return !!window.__chartsIntervalFetchSubscribed; } catch(_) { return false; } })();
    if (!already) { try { window.__chartsIntervalFetchSubscribed = true; } catch(_) {} }
    if (!already) subscribe('charts:intervalChanged', async (payload) => {
      try {
        const interval = payload && payload.interval ? String(payload.interval) : '';
        if (!interval) return;
        // prevent duplicate interval fetches
        try {
          if (getAppStatus && getAppStatus() === 'loading') return;
          if (typeof window !== 'undefined' && window.__intervalFetchInFlight) return;
          if (typeof window !== 'undefined') window.__intervalFetchInFlight = true;
        } catch(_) {}
        try { refreshFilterValues(); } catch(_) {}
        const base = buildFilterParams();
        const fmt = (ts) => {
          const d = new Date(ts);
          const p = (n) => String(n).padStart(2, '0');
          const yyyy = d.getUTCFullYear();
          const mm = p(d.getUTCMonth() + 1);
          const dd = p(d.getUTCDate());
          const HH = p(d.getUTCHours());
          const MM = p(d.getUTCMinutes());
          const SS = p(d.getUTCSeconds());
          return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;
        };
        let fromStr = base.from;
        let toStr = base.to;
        let useZoom = false;
        try {
          const zr = window.__chartsZoomRange;
          if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs) {
            fromStr = fmt(zr.fromTs);
            toStr = fmt(zr.toTs);
            useZoom = true;
          }
        } catch(_) {}
        const fromTs = new Date(fromStr.replace(' ', 'T') + 'Z').getTime();
        const toTs = new Date(toStr.replace(' ', 'T') + 'Z').getTime();
        if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) return;
        // Choose granularity by selected interval
        // For zoomed ranges (<= 1 day) always use 5m; for larger base ranges use 1h unless user explicitly selects 5m
        const diffDays = (toTs - fromTs) / (24 * 3600e3);
        const diffHours = (toTs - fromTs) / 3600e3;
        const userWants5m = interval === '5m';
        const userWants1h = interval === '1h';
        let gran = '5m';
        // For very small ranges (<= 6 hours), always force 5m regardless of user selection
        if (diffHours <= 6) {
          gran = '5m';
        } else if (userWants1h) {
          gran = '1h';
        } else if (userWants5m) {
          gran = '5m';
        } else {
          // Auto: choose based on range
          gran = diffDays <= 1.0 ? '5m' : '1h';
        }
        // For very long non-zoomed ranges, force 1h to avoid data overload
        if (gran === '5m' && diffDays > 5.0001 && !useZoom) gran = '1h';
        const params = { ...base, from: fromStr, to: toStr, granularity: gran };
        // Don't clear data - keep old chart visible during fetch
        setAppStatus('loading');
        const data = await fetchMetrics(params);
        if (data) {
          setMetricsData(data);
          setAppStatus('success');
        } else {
          setAppStatus('error');
        }
        try { if (typeof window !== 'undefined') window.__intervalFetchInFlight = false; } catch(_) {}
      } catch(_) {}
    });
  } catch(_) { /* best-effort */ }

  // While typing in filters, do NOT hide charts or controls; re-assert visibility
  try {
    subscribe('appState:filtersChanged', () => {
      try { setUI({ showCharts: true, showModeControls: true }); } catch(_) {}
    });
  } catch(_) { /* best-effort */ }

  // After data changes, ensure charts stay visible (toast handled centrally by ui-feedback.js)
  try {
    subscribe("appState:dataChanged", () => {
      try { if (typeof window !== 'undefined' && window.__hideTableUntilSummary) setShowTable(false); } catch(_) {}
      try { const overlayEl = document.getElementById('loading-overlay'); if (overlayEl) overlayEl.classList.add('is-hidden'); } catch(_) {}
      try { const mount = document.getElementById('chart-area-1'); if (mount) { mount.classList.remove('chart-fade--out'); mount.classList.add('chart-fade--in'); mount.style.opacity = ''; } } catch(_) {}
    });
  } catch (_) { /* best-effort */ }

  // Reflect appState.ui changes in the DOM (single place managing visibility)
  try {
    subscribe('appState:uiChanged', (ui) => {
      try {
        const chartsContainer = document.getElementById('charts-container');
        if (chartsContainer) chartsContainer.style.display = ui?.showCharts ? '' : 'none';
      } catch(_) {}
      try {
        const chartsControls = document.getElementById('charts-controls');
        if (chartsControls) chartsControls.style.display = ui?.showCharts ? '' : 'none';
      } catch(_) {}
      try {
        const modeControls = document.getElementById('tableModeControls');
        if (modeControls) modeControls.style.display = ui?.showModeControls ? '' : 'none';
      } catch(_) {}
      try {
        const resultsContainer = document.querySelector('.results-display');
        if (resultsContainer) resultsContainer.classList.toggle('is-hidden', !ui?.showTable);
      } catch(_) {}
    });
  } catch(_) { /* best-effort */ }
}

/**
 * Hard-destroy the table UI to avoid race conditions.
 * Hides container, clears virtual manager, and removes virtual table DOM.
 */
function destroyTableHard() {
  try {
    // Hide container immediately via UI state
    try { setShowTable(false); } catch(_) {}
    // Clear virtual manager if present
    if (window.virtualManager && window.virtualManager.isActive) {
      try {
        window.virtualManager.openMainGroups.clear();
        window.virtualManager.openHourlyGroups.clear();
        window.virtualManager.headersInitialized = false;
        window.virtualManager.sortHandlersAttached = false;
        if (typeof window.virtualManager.destroy === 'function') {
          window.virtualManager.destroy();
        }
      } catch(_) {}
    }
    // Restore DOM content of the virtual table container to default structure
    // matching renderer.js (_renderTableSection): include spacer + table skeleton
    const vwrap = document.getElementById('virtual-scroll-container');
    if (vwrap) {
      try {
        vwrap.innerHTML = (
          '<div id="virtual-scroll-spacer" style="position: absolute; top: 0; left: 0; right: 0; pointer-events: none;"></div>' +
          '<table id="summaryTable" class="results-display__table" style="position: relative;">' +
            '<thead id="tableHead"></thead>' +
            '<tbody id="tableBody"></tbody>' +
            '<tfoot><tr><td id="table-footer-info" colspan="24"></td></tr></tfoot>' +
          '</table>'
        );
      } catch(_) {}
    }
    // Also ensure table-specific controls are hidden
    const controls = document.getElementById('table-controls');
    if (controls) controls.style.display = 'none';
  } catch(_) {}
}

/**
 * Handles the "Find" button click. Fetches data from the API.
 * CONTRACT:
 * - Charts are the source of truth for visual time range.
 * - If a zoom is active, we override ONLY request params for this fetch (fetchParams),
 *   but persist original input filters via setFilters() so charts know the base range.
 */
async function handleFindClick() {
  // Prevent auto-trigger from running while we're handling a manual click
  window._isManualFindInProgress = true;

  setAppStatus("loading");
  // Ensure charts and mode controls remain visible across re-renders after Find
  try { setUI({ showCharts: true, showModeControls: true }); } catch(_) {}
  // Immediately unhide charts container and controls in DOM (defensive against late subscribers)
  try {
    const cc = document.getElementById('charts-container');
    if (cc) cc.style.display = '';
    const ctl = document.getElementById('charts-controls');
    if (ctl) ctl.style.display = '';
    const mount = document.getElementById('chart-area-1');
    if (mount) { mount.classList.remove('chart-fade--out'); mount.classList.add('chart-fade--in'); mount.style.opacity = ''; }
  } catch(_) {}
  // Mark that charts were explicitly requested; charts module will honor this on init as well
  try { if (typeof window !== 'undefined') window.__chartsRenderRequested = true; } catch(_) {}
  // Explicitly request charts render tied to Find click
  try { const { publish } = await import('../state/eventBus.js'); publish('charts:renderRequest'); } catch(_) {}
  // Hide summary metrics while loading to avoid stale content
  try {
    const summary = document.getElementById("summaryMetrics");
    if (summary) summary.classList.add("is-hidden");
  } catch (_) { /* intentional no-op: summary may not be present */ }

  // Hide UI elements immediately
  try { window.__hideTableUntilSummary = true; } catch(_) {}
  destroyTableHard();
  hideTableUI();

  try {
    // Validate filter parameters before making API call
    // Force-sync flatpickr -> inputs to avoid stale dates
    try { refreshFilterValues(); } catch(_) {}
    const validation = validateFilterParams();
    if (!validation.isValid) {
      throw new Error(`Invalid filter parameters: ${validation.missing.join(", ")}`);
    }

    // Build full params from inputs (includes customer/supplier/destination),
    // but enforce validated from/to to ensure correctness
    const uiParams = buildFilterParams();
    const filterParams = { ...uiParams, ...validation.params }; // keep all text filters, override dates with validated

    // Build fetch params strictly from inputs (IGNORE any active zoom)
    const fetchParams = { ...filterParams };
    // Add API granularity hint based on current chart interval
    try {
      const ci = (typeof window !== 'undefined' && window.__chartsCurrentInterval) ? String(window.__chartsCurrentInterval) : '5m';
      const from = new Date(validation.params.from.replace(' ', 'T') + 'Z');
      const to = new Date(validation.params.to.replace(' ', 'T') + 'Z');
      const diffDays = (to - from) / (24 * 3600e3);
      if (ci === '5m' && diffDays > 5.0001) {
        fetchParams.granularity = '1h';
        try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = '1h'; } catch(_) {}
      } else {
        fetchParams.granularity = (ci === '5m') ? '5m' : '1h';
      }
    } catch(_) {}
    // Clear chart zoom state so next render is full-range per inputs
    try { window.__chartsZoomRange = null; } catch(_) {}
    let usedZoom = false;

    // Persist original filters from inputs (including customer/supplier/destination)
    // (not the zoom override) so charts and UI keep user-entered values
    try { setFilters(filterParams); } catch (_) {}

    // remember that last fetch did not use zoom
    try { window.__chartsUsedZoomForLastFetch = false; } catch(_) {}
    const data = await fetchMetrics(fetchParams);

    if (data) {
      // Set the new data first so appState:dataChanged fires before statusChanged
      setMetricsData(data);
      setAppStatus("success");
      saveStateToUrl();
      // Explicitly ensure summary metrics are visible after data arrives
      try {
        const summary = document.getElementById("summaryMetrics");
        if (summary) summary.classList.remove("is-hidden");
      } catch (_) { /* intentional no-op: summary may not be present */ }
      // Keep table hidden until user explicitly opens Summary
      try { setShowTable(false); } catch(_) {}
      // Defensive: ensure overlay is hidden
      try { const overlayEl = document.getElementById('loading-overlay'); if (overlayEl) overlayEl.classList.add('is-hidden'); } catch(_) {}
    } else {
      setAppStatus("error");
    }
  } catch (error) {
    console.error("❌ Error fetching metrics:", error);
    setAppStatus("error");
  } finally {
    // Clear the flag after a short delay to allow state updates to complete
    setTimeout(() => {
      window._isManualFindInProgress = false;
    }, 100);
  }
}

/**
 * Handles the "Summary Table" button click. Shows the detailed table.
 * CONTRACT:
 * - Table is a consumer and must NOT affect charts.
 * - If a zoom is active, override ONLY request params here; do not update inputs or app state.
 * - Do not call setMetricsData() here to avoid influencing charts.
 */
async function handleSummaryClick() {
  console.log("📊 Summary Table button clicked!");

  // Set loading status
  // Important: allow table to be shown for summary flow
  try { window.__hideTableUntilSummary = false; } catch(_) {}
  setAppStatus("loading");

  // Hide table while loading (temporary), flag is cleared above to allow later show
  try { setShowTable(false); } catch(_) {}
  hideTableUI();

  // Reset virtual table state AFTER hiding, not before
  resetVirtualTableState();

  try {
    // Fetch fresh data with current filter values (force-sync first)
    try { refreshFilterValues(); } catch(_) {}
    const filterParams = buildFilterParams();
    // If a chart zoom is active, use its range for this fetch (do not touch inputs)
    let usedZoom = false;
    try {
      const zr = window.__chartsZoomRange;
      if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs) {
        const fmt = (ts) => {
          const d = new Date(ts);
          const p = (n) => String(n).padStart(2, '0');
          const yyyy = d.getUTCFullYear();
          const mm = p(d.getUTCMonth() + 1);
          const dd = p(d.getUTCDate());
          const HH = p(d.getUTCHours());
          const MM = p(d.getUTCMinutes());
          const SS = p(d.getUTCSeconds());
          return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;
        };
        filterParams.from = fmt(zr.fromTs);
        filterParams.to = fmt(zr.toTs);
        usedZoom = true;
      }
    } catch (_) {}
    try { window.__chartsUsedZoomForLastFetch = !!usedZoom; } catch(_) {}
    if (!filterParams.from || !filterParams.to) {
      throw new Error("Date range is not set. Cannot fetch metrics.");
    }
    
    console.log("🔍 Fetching data for Summary Table with filters:", filterParams);
    // Add API granularity hint for summary flow as well
    try {
      const ci = (typeof window !== 'undefined' && window.__chartsCurrentInterval) ? String(window.__chartsCurrentInterval) : '5m';
      const from = new Date(filterParams.from.replace(' ', 'T') + 'Z');
      const to = new Date(filterParams.to.replace(' ', 'T') + 'Z');
      const diffDays = (to - from) / (24 * 3600e3);
      if (ci === '5m' && diffDays > 5.0001) {
        filterParams.granularity = '1h';
        try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = '1h'; } catch(_) {}
      } else {
        filterParams.granularity = (ci === '5m') ? '5m' : '1h';
      }
    } catch(_) {}
    const data = await fetchMetrics(filterParams);

    if (data) {
      // Do NOT update global metrics data here to avoid affecting charts.
      setAppStatus("success");
    } else {
      setAppStatus("error");
      alert('Error loading data. Please try again.');
      return;
    }

    // Now render and show the table with fresh data using TableRenderer
    let { main_rows, peer_rows, hourly_rows } = data || {};
    // If reverse flow returns only peer_rows, synthesize minimal main_rows for grouping
    if ((!main_rows || main_rows.length === 0) && peer_rows && peer_rows.length) {
      try {
        const map = new Map();
        peer_rows.forEach(p => {
          const k = `${p.main}||${p.destination}`;
          if (!map.has(k)) map.set(k, { main: p.main, destination: p.destination });
        });
        main_rows = Array.from(map.values());
        console.debug('[summary] synthesized main_rows from peer_rows:', main_rows.length);
      } catch(_) {}
    }
    if ((main_rows && main_rows.length) || (peer_rows && peer_rows.length)) {
      await renderCoordinator.requestRender('table', async () => {
        // Prepare
        try { renderTableHeader(); } catch(_) {}
        try { renderTableFooter(); } catch(_) {}
        try { showTableControls(); } catch(_) {}
        initTableControls(main_rows || [], peer_rows || []);
        // Clear
        try { const tb = document.getElementById('tableBody'); if (tb) tb.innerHTML = ''; } catch(_) {}
        // Render (central renderer picks mode and clears opposite)
        const mod = await import('../rendering/table-renderer.js');
        let tr = window.tableRenderer;
        if (!tr) { tr = new mod.TableRenderer(); try { await tr.initialize(); } catch(_) {}; window.tableRenderer = tr; }
        const res = await tr.renderTable(main_rows || [], peer_rows || [], hourly_rows || []);
        try {
          const tbody = document.getElementById('tableBody');
          const rowCount = tbody ? tbody.querySelectorAll('tr').length : 0;
          console.debug('[summary] TableRenderer rendered rows:', rowCount, 'mode:', res && res.mode);
        } catch(_) {}
        // Post
        try { setShowTable(true); } catch(_) {}
        try {
          const resultsContainer = document.querySelector('.results-display');
          if (resultsContainer) resultsContainer.classList.remove('is-hidden');
          const controls = document.getElementById('table-controls');
          if (controls) controls.style.display = 'flex';
          const tableFooter = document.querySelector('.results-display__footer');
          if (tableFooter) tableFooter.classList.remove('is-hidden');
        } catch(_) {}
        try { setUI({ showTable: true }); } catch(_) {}
        try { initTableView(); } catch(_) {}
        try { initStickyHeader(); } catch(_) {}
        try { initStickyFooter(); } catch(_) {}
        try { initTableInteractions(); } catch(_) {}
        console.log("✅ Summary Table loaded with fresh data");
      });
    } else {
      try { setShowTable(false); } catch(_) {}
      hideTableUI();
      alert('No data found for current filters.');
    }

    saveStateToUrl();
  } catch (error) {
    console.error("❌ Error fetching data for Summary Table:", error);
    setAppStatus("error");
    alert('Error loading data. Please try again.');
  }
}

/**
 * Reset virtual table state (clear all opened groups)
 */
function resetVirtualTableState() {
  // Reset virtual manager state if it exists
  if (window.virtualManager && window.virtualManager.isActive) {
    window.virtualManager.openMainGroups.clear();
    window.virtualManager.openHourlyGroups.clear();
    
    // Reset headers flag to allow re-initialization with fresh data
    window.virtualManager.headersInitialized = false;
    
    // Reset sort handlers flag to allow re-attaching sort handlers
    window.virtualManager.sortHandlersAttached = false;
    
    // Force refresh virtual table with cleared state
    window.virtualManager.refreshVirtualTable();
    window.virtualManager.forceImmediateRender();
  }
}

/**
 * Handles the reverse mode toggle.
 */
function handleReverseClick() {
  console.log(
    "🔄 Reverse button clicked. Toggling state and re-fetching data in background."
  );

  // 1. Toggle the reverse mode state.
  setReverseMode(!isReverseMode());

  // 2. Immediately hide the table and keep charts visible
  try { setShowTable(false); } catch(_) {}
  try { setUI({ showCharts: true, showModeControls: true }); } catch(_) {}
  // Ensure the flow treats table as hidden until explicit Summary click
  try { window.__hideTableUntilSummary = true; } catch(_) {}
  // Clear any existing table filters so they don't eliminate rows after reverse
  try { clearAllTableFilters(); } catch(_) {}

  // 3. Trigger a new "Find" operation using current input filters (no zoom override)
  // The user will see "Finding..." and summary metrics will update. Charts remain visible.
  handleFindClick();
}

/**
 * Clear all table filters and refresh the table
 */
export function clearTableFilters() {
  console.log("🧹 Clearing all table filters...");
  
  // Clear all table filters
  clearAllTableFilters();
  
  // Setup automatic filter clearing for future input changes
  setupAutoFilterClearing();
  
  // If virtual manager is active, refresh the table to show unfiltered data
  if (window.virtualManager && window.virtualManager.isActive) {
    console.log("🔄 Refreshing table after filter clear...");
    window.virtualManager.refreshVirtualTable();
  }
  
  console.log("✅ Table filters cleared and table refreshed");
}

/**
 * Clear a specific column filter and refresh the table
 * @param {string} columnKey - The column key to clear filter for
 */
export function clearSpecificFilter(columnKey) {
  console.log(`🧹 Clearing filter for column: ${columnKey}`);
  
  // Clear the specific filter
  clearColumnFilter(columnKey);
  
  // If virtual manager is active, refresh the table to show updated data
  if (window.virtualManager && window.virtualManager.isActive) {
    console.log("🔄 Refreshing table after specific filter clear...");
    window.virtualManager.refreshVirtualTable();
  }
  
  console.log(`✅ Filter for column "${columnKey}" cleared and table refreshed`);
}
