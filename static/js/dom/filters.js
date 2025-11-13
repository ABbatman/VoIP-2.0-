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
import { getCachedMetrics, putCachedMetrics } from "../data/metricsCache.js";
import { toast } from "../ui/notify.js";

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

  // Install delegated click handler once to survive DOM re-renders
  try {
    const alreadyDelegated = (() => { try { return !!window.__summaryDelegationInstalled; } catch(_) { return false; } })();
    if (!alreadyDelegated) {
      document.addEventListener('click', (e) => {
        const btn = e.target && (e.target.closest ? e.target.closest('#btnSummary') : null);
        if (!btn) return;
        try { if (typeof window !== 'undefined' && window.__summaryFetchInProgress) return; } catch(_) {}
        handleSummaryClick(e);
      }, false);
      try { window.__summaryDelegationInstalled = true; } catch(_) { /* no-op */ }
    }
  } catch(_) { /* best-effort */ }

  if (reverseButton) {
    reverseButton.addEventListener("click", (e) => {
      // ignore Reverse while loading to prevent races
      if (getAppStatus && getAppStatus() === 'loading') return;
      handleReverseClick(e);
    });
  } else {
    console.warn("⚠️ Reverse button not found");
  }

  // Enforce UI state changes per operation type across DOM patches
  try {
    subscribe("appState:statusChanged", (status) => {
      const w = (typeof window !== 'undefined') ? window : {};
      const isIntervalFetch = !!w.__intervalFetchInFlight; // chart-only fetch
      const isSummaryFetch = !!w.__summaryFetchInProgress; // summary-only fetch
      const hideUntilSummary = !!w.__hideTableUntilSummary; // after Find until user clicks Summary

      // Table visibility
      try {
        if (status === 'loading') {
          // Do NOT hide table for chart-only interval fetches
          if (isSummaryFetch) {
            setShowTable(false);
          }
        }
        // Enforcement from Find flow: keep hidden until Summary is clicked
        if (hideUntilSummary) setShowTable(false);
      } catch(_) {
        // Ignore errors in UI update
      }

      // Toggle global overlay only for non-interval operations (Find/Summary)
      try {
        const overlayEl = document.getElementById('loading-overlay');
        if (overlayEl) overlayEl.classList.toggle('is-hidden', !(status === 'loading' && !isIntervalFetch && !isSummaryFetch));
      } catch(_) {
        // Ignore overlay toggle errors
      }
      // reinforce charts/mode controls visibility across patches
      if ((status === 'loading' || status === 'success') && !isSummaryFetch) {
        try { setUI({ showCharts: true, showModeControls: true }); } catch(_) {
          // Ignore UI state errors
        }
      }
      // disable/enable buttons while loading
      try { if (findButton) findButton.disabled = (status === 'loading'); } catch(_) {
        // Ignore button state errors
      }
      try { if (reverseButton) reverseButton.disabled = (status === 'loading'); } catch(_) {
        // Ignore button state errors
      }
      try { if (summaryTableButton) summaryTableButton.disabled = (status === 'loading' && isSummaryFetch); } catch(_) {
        // Ignore button state errors
      }
    });
  } catch (_) { /* best-effort */ }

  // Auto-fetch data when user switches interval without pressing Find
  try {
    const already = (() => { try { return !!window.__chartsIntervalFetchSubscribed; } catch(_) { return false; } })();
    if (!already) { try { window.__chartsIntervalFetchSubscribed = true; } catch(_) {
        // Ignore global flag errors
      } }
    if (!already) subscribe('charts:intervalChanged', async (payload) => {
      try {
        const interval = payload && payload.interval ? String(payload.interval) : '';
        if (!interval) return;
        // prevent duplicate interval fetches
        try {
          if (getAppStatus && getAppStatus() === 'loading') return;
          if (typeof window !== 'undefined' && window.__intervalFetchInFlight) return;
          if (typeof window !== 'undefined') window.__intervalFetchInFlight = true;
        } catch(_) {
          // Ignore fetch guard errors
        }
        try { refreshFilterValues(); } catch(_) {
          // Ignore filter refresh errors
        }
        const base = buildFilterParams();
        // Prefer zoom window if present
        const zr = (typeof window !== 'undefined') ? window.__chartsZoomRange : null;
        let fromStr = base.from;
        let toStr = base.to;
        let effFromTs = new Date(fromStr.replace(' ', 'T') + 'Z').getTime();
        let effToTs = new Date(toStr.replace(' ', 'T') + 'Z').getTime();
        if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs) {
          effFromTs = zr.fromTs; effToTs = zr.toTs;
          // NOTE: do NOT override fromStr/toStr for the request; requests must use base filters
        }
        if (!Number.isFinite(effFromTs) || !Number.isFinite(effToTs) || effToTs <= effFromTs) {
          try { if (typeof window !== 'undefined') window.__intervalFetchInFlight = false; } catch(_) {
            // Ignore global flag errors
          }
          return;
        }
        // Choose granularity by selected interval based on EFFECTIVE window (zoom if present)
        const diffDays = (effToTs - effFromTs) / (24 * 3600e3);
        const diffHours = (effToTs - effFromTs) / 3600e3;
        let effInterval = interval;
        const userWants5m = effInterval === '5m';
        const userWants1h = effInterval === '1h';
        // Enforce rule: if > 5 days, block 5m and warn (English)
        if (userWants5m && diffDays > 5.0001) {
          try { toast('5-minute interval is available only for ranges up to 5 days. Switching to 1 hour.', { type: 'warning', duration: 3500 }); } catch(_) {
            // Toast might not be available
          }
          effInterval = '1h';
        }
        // Persist chosen interval globally for backend hinting
        try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = effInterval; } catch(_) {
          // Ignore global interval update errors
        }
        let gran = '5m';
        if (diffHours <= 6) {
          gran = '5m';
        } else if (userWants1h || effInterval === '1h') {
          gran = '1h';
        } else if (userWants5m && effInterval === '5m') {
          gran = '5m';
        } else {
          gran = diffDays <= 1.0 ? '5m' : '1h';
        }
        if (gran === '5m' && diffDays > 5.0001) gran = '1h';
        // Build params using EFFECTIVE window (zoom if present)
        const params = { ...base, from: fromStr, to: toStr, granularity: gran, __reverse: !!isReverseMode() };
        // Try cache first
        const cached = getCachedMetrics(params);
        if (cached) {
          setMetricsData(cached);
          setAppStatus('success');
          try { if (typeof window !== 'undefined') window.__intervalFetchInFlight = false; } catch(_) {
            // Ignore global flag errors
          }
          return;
        }
        // No cache -> fetch
        setAppStatus('loading');
        const data = await fetchMetrics(params);
        if (data) {
          setMetricsData(data);
          setAppStatus('success');
          try { putCachedMetrics(params, data); } catch(_) {
            // Ignore cache write errors
          }
        } else {
          setAppStatus('error');
        }
        try { if (typeof window !== 'undefined') window.__intervalFetchInFlight = false; } catch(_) {
          // Ignore global flag errors
        }
      } catch(_) {
        // Ignore interval fetch errors
      }
    });
  } catch(_) { /* best-effort */ }

  // While typing in filters, do NOT hide charts or controls; re-assert visibility
  try {
    subscribe('appState:filtersChanged', () => {
      try { setUI({ showCharts: true, showModeControls: true }); } catch(_) {
        // Ignore UI state errors
      }
    });
  } catch(_) { /* best-effort */ }

  // After data changes, ensure charts stay visible (toast handled centrally by ui-feedback.js)
  try {
    subscribe("appState:dataChanged", () => {
      try { if (typeof window !== 'undefined' && window.__hideTableUntilSummary) setShowTable(false); } catch(_) {
        // Ignore table visibility errors
      }
      try { const overlayEl = document.getElementById('loading-overlay'); if (overlayEl) overlayEl.classList.add('is-hidden'); } catch(_) {
        // Ignore overlay errors
      }
      try { const mount = document.getElementById('chart-area-1'); if (mount) { mount.classList.remove('chart-fade--out'); mount.classList.add('chart-fade--in'); mount.style.opacity = ''; } } catch(_) {
        // Ignore chart animation errors
      }
    });
  } catch (_) { /* best-effort */ }

  // Reflect appState.ui changes in the DOM (single place managing visibility)
  try {
    subscribe('appState:uiChanged', (ui) => {
      try {
        const chartsContainer = document.getElementById('charts-container');
        if (chartsContainer) chartsContainer.style.display = ui?.showCharts ? '' : 'none';
      } catch(_) {
        // Ignore container visibility errors
      }
      try {
        const chartsControls = document.getElementById('charts-controls');
        if (chartsControls) chartsControls.style.display = ui?.showCharts ? '' : 'none';
      } catch(_) {
        // Ignore controls visibility errors
      }
      try {
        const modeControls = document.getElementById('tableModeControls');
        if (modeControls) modeControls.style.display = ui?.showModeControls ? '' : 'none';
      } catch(_) {
        // Ignore mode controls errors
      }
      try {
        const resultsContainer = document.querySelector('.results-display');
        if (resultsContainer) resultsContainer.classList.toggle('is-hidden', !ui?.showTable);
      } catch(_) {
        // Ignore results display errors
      }
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
    try { setShowTable(false); } catch(_) {
      // Ignore table hide errors
    }
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
      } catch(_) {
        // Ignore virtual manager cleanup errors
      }
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
      } catch(_) {
        // Ignore DOM restore errors
      }
    }
    // Also ensure table-specific controls are hidden
    const controls = document.getElementById('table-controls');
    if (controls) controls.style.display = 'none';
  } catch(_) {
    // Ignore table hard destroy errors
  }
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
  try { if (typeof window !== 'undefined') window.__chartsZoomRange = null; } catch(_) {}
  // Ensure charts and mode controls remain visible across re-renders after Find
  try { setUI({ showCharts: true, showModeControls: true }); } catch(_) {
    // Ignore UI state errors
  }
  // Immediately unhide charts container and controls in DOM (defensive against late subscribers)
  try {
    const cc = document.getElementById('charts-container');
    if (cc) cc.style.display = '';
    const ctl = document.getElementById('charts-controls');
    if (ctl) ctl.style.display = '';
    const mount = document.getElementById('chart-area-1');
    if (mount) { mount.classList.remove('chart-fade--out'); mount.classList.add('chart-fade--in'); mount.style.opacity = ''; }
  } catch(_) {
    // Ignore DOM manipulation errors
  }
  // Mark that charts were explicitly requested; charts module will honor this on init as well
  try { if (typeof window !== 'undefined') window.__chartsRenderRequested = true; } catch(_) {
    // Ignore global flag errors
  }
  // Explicitly request charts render tied to Find click
  try { const { publish } = await import('../state/eventBus.js'); publish('charts:renderRequest'); } catch(_) {
    // Ignore event bus errors
  }
  // Hide summary metrics while loading to avoid stale content
  try {
    const summary = document.getElementById("summaryMetrics");
    if (summary) summary.classList.add("is-hidden");
  } catch (_) { /* intentional no-op: summary may not be present */ }

  // Hide UI elements immediately
  try { window.__hideTableUntilSummary = true; } catch(_) {
    // Ignore global flag errors
  }
  destroyTableHard();
  hideTableUI();

  try {
    // Validate filter parameters before making API call
    // Force-sync flatpickr -> inputs to avoid stale dates
    try { refreshFilterValues(); } catch(_) {
      // Ignore filter refresh errors
    }
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
        try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = '1h'; } catch(_) {
          // Ignore interval update errors
        }
      } else {
        fetchParams.granularity = (ci === '5m') ? '5m' : '1h';
      }
    } catch(_) {
      // Ignore granularity calculation errors
    }
    // Preserve current chart zoom state; Find fetch uses filter inputs only

    // Persist original filters from inputs (including customer/supplier/destination)
    // (not the zoom override) so charts and UI keep user-entered values
    try { setFilters(filterParams); } catch (_) {
      // Ignore filter state update errors
    }

    // remember that last fetch did not use zoom
    try { window.__chartsUsedZoomForLastFetch = false; } catch(_) {
      // Ignore global flag errors
    }
    // Try cache before fetching
    const cacheKeyParams = { ...fetchParams, __reverse: isReverseMode ? !!isReverseMode() : false };
    const cached = getCachedMetrics(cacheKeyParams);
    let data;
    if (cached) {
      data = cached;
    } else {
      data = await fetchMetrics(fetchParams);
    }

    if (data) {
      // Set the new data first so appState:dataChanged fires before statusChanged
      setMetricsData(data);
      setAppStatus("success");
      saveStateToUrl();
      try { if (!cached) putCachedMetrics(cacheKeyParams, data); } catch(_) {
        // Ignore cache write errors
      }
      // Explicitly ensure summary metrics are visible after data arrives
      try {
        const summary = document.getElementById("summaryMetrics");
        if (summary) summary.classList.remove("is-hidden");
      } catch (_) { /* intentional no-op: summary may not be present */ }
      // Keep table hidden until user explicitly opens Summary
      try { setShowTable(false); } catch(_) {
        // Ignore table state errors
      }
      // Defensive: ensure overlay is hidden
      try { const overlayEl = document.getElementById('loading-overlay'); if (overlayEl) overlayEl.classList.add('is-hidden'); } catch(_) {
        // Ignore overlay hide errors
      }
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

  // Summary flow should NOT affect charts or global status
  // Mark summary-only fetch in progress (used by UI guards)
  try { if (typeof window !== 'undefined') window.__summaryFetchInProgress = true; } catch(_) {
    // Ignore global flag errors
  }
  try { window.__hideTableUntilSummary = false; } catch(_) {
    // Ignore global flag errors
  }

  // Hide table while loading (temporary), flag is cleared above to allow later show
  try { setShowTable(false); } catch(_) {
    // Ignore table state errors
  }
  hideTableUI();

  // Reset virtual table state AFTER hiding, not before
  resetVirtualTableState();

  // Clear all saved table column filters before building the new table
  try { clearAllTableFilters(); } catch(_) { }

  try {
    // Fetch fresh data with current filter values (force-sync first)
    try { refreshFilterValues(); } catch(_) {
      // Ignore filter refresh errors
    }
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
    } catch (_) {
      // Ignore zoom range parsing errors
    }
    try { window.__chartsUsedZoomForLastFetch = !!usedZoom; } catch(_) {
      // Ignore global flag update errors
    }
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
        try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = '1h'; } catch(_) {
          // Ignore interval update errors
        }
      } else {
        filterParams.granularity = (ci === '5m') ? '5m' : '1h';
      }
    } catch(_) {
      // Ignore granularity calculation errors
    }
    const data = await fetchMetrics(filterParams);

    if (!data) {
      try { renderTableHeader(); } catch(_) {}
      try { renderTableFooter(); } catch(_) {}
      try { showTableControls(); } catch(_) {}
      try {
        const tb = document.getElementById('tableBody');
        if (tb) tb.innerHTML = '<tr><td colspan="24">Error loading data. Please try again.</td></tr>';
      } catch(_) {}
      try { setShowTable(true); } catch(_) {}
      saveStateToUrl();
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
      } catch(_) {
        // Ignore main_rows synthesis errors
      }
    }
    if ((main_rows && main_rows.length) || (peer_rows && peer_rows.length)) {
      await renderCoordinator.requestRender('table', async () => {
        // Prepare
        try { renderTableHeader(); } catch(_) {
          // Ignore header rendering errors
        }
        try { renderTableFooter(); } catch(_) {
          // Ignore footer rendering errors
        }
        try { showTableControls(); } catch(_) {
          // Ignore controls display errors
        }
        initTableControls(main_rows || [], peer_rows || []);
        // Clear
        try { const tb = document.getElementById('tableBody'); if (tb) tb.innerHTML = ''; } catch(_) {
          // Ignore table clearing errors
        }
        // Render (central renderer picks mode and clears opposite)
        const mod = await import('../rendering/table-renderer.js');
        let tr = window.tableRenderer;
        if (!tr) { tr = new mod.TableRenderer(); try { await tr.initialize(); } catch(_) {
          // Ignore renderer initialization errors
        }; window.tableRenderer = tr; }
        const res = await tr.renderTable(main_rows || [], peer_rows || [], hourly_rows || []);
        try {
          const tbody = document.getElementById('tableBody');
          const rowCount = tbody ? tbody.querySelectorAll('tr').length : 0;
          console.debug('[summary] TableRenderer rendered rows:', rowCount, 'mode:', res && res.mode);
        } catch(_) {
          // Ignore debug logging errors
        }
        // Post
        try { setShowTable(true); } catch(_) {
          // Ignore table show errors
        }
        try {
          const resultsContainer = document.querySelector('.results-display');
          if (resultsContainer) resultsContainer.classList.remove('is-hidden');
          const controls = document.getElementById('table-controls');
          if (controls) controls.style.display = 'flex';
          const tableFooter = document.querySelector('.results-display__footer');
          if (tableFooter) tableFooter.classList.remove('is-hidden');
        } catch(_) {
          // Ignore UI update errors
        }
        try { setUI({ showTable: true }); } catch(_) {
          // Ignore UI state update errors
        }
        try { initTableView(); } catch(_) {
          // Ignore table view init errors
        }
        try { initStickyHeader(); } catch(_) {
          // Ignore sticky header init errors
        }
        try { initStickyFooter(); } catch(_) {
          // Ignore sticky footer init errors
        }
        try { initTableInteractions(); } catch(_) {
          // Ignore table interactions init errors
        }
        console.log("✅ Summary Table loaded with fresh data");
      }, { debounceMs: 0, cooldownMs: 0 });
    } else {
      // Show empty state instead of hiding the table entirely
      try { renderTableHeader(); } catch(_) {}
      try { renderTableFooter(); } catch(_) {}
      try { showTableControls(); } catch(_) {}
      try {
        const tb = document.getElementById('tableBody');
        if (tb) tb.innerHTML = '<tr><td colspan="24">No data found for current filters.</td></tr>';
      } catch(_) {}
      try { setShowTable(true); } catch(_) {}
    }

    saveStateToUrl();
  } catch (error) {
    console.error("❌ Error fetching data for Summary Table:", error);
    alert('Error loading data. Please try again.');
  } finally {
    try { if (typeof window !== 'undefined') window.__summaryFetchInProgress = false; } catch(_) {
      // Ignore fetch flag cleanup errors
    }
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
  try { setShowTable(false); } catch(_) {
    // Ignore table hide errors
  }
  try { setUI({ showCharts: true, showModeControls: true }); } catch(_) {
    // Ignore UI update errors
  }
  // Ensure the flow treats table as hidden until explicit Summary click
  try { window.__hideTableUntilSummary = true; } catch(_) {
    // Ignore global flag errors
  }
  // Clear any existing table filters so they don't eliminate rows after reverse
  try { clearAllTableFilters(); } catch(_) {
    // Ignore filter clear errors
  }

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
