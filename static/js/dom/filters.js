// static/js/dom/filters.js
// Responsibility: Filter UI handlers and data fetching orchestration
import { fetchMetrics } from '../data/fetchMetrics.js';
import {
  isReverseMode, setReverseMode, setMetricsData, setAppStatus,
  getAppStatus, setFilters, setUI, setShowTable, getUI
} from '../state/appState.js';
import { subscribe } from '../state/eventBus.js';
import { saveStateToUrl } from '../state/urlState.js';
import { hideTableUI, renderTableHeader, renderTableFooter, showTableControls, initTableView } from './table-ui.js';
import { resetExpansionState } from '../state/expansionState.js';
import { initTableControls, clearAllTableFilters, setupAutoFilterClearing, clearColumnFilter } from './table-controls.js';
import { buildFilterParams, setDefaultDateRange, validateFilterParams, refreshFilterValues } from './filter-helpers.js';
import { initFlatpickr, initTimeControls } from './ui-widgets.js';
import { initTableInteractions } from './table.js';
import { initStickyFooter, initStickyHeader } from './sticky-table-chrome.js';
import { renderCoordinator } from '../rendering/render-coordinator.js';
import { getCachedMetrics, putCachedMetrics } from '../data/metricsCache.js';
import { toast } from '../ui/notify.js';
import {
  isSummaryDelegationInstalled, setSummaryDelegationInstalled,
  isSummaryFetchInProgress, setSummaryFetchInProgress,
  isChartsIntervalFetchSubscribed, setChartsIntervalFetchSubscribed,
  isIntervalFetchInFlight, setIntervalFetchInFlight,
  getChartsZoomRange, clearChartsZoomRange,
  getChartsCurrentInterval, setChartsCurrentInterval,
  shouldHideTableUntilSummary, setHideTableUntilSummary,
  setChartsRenderRequested, setManualFindInProgress,
  setChartsUsedZoomForLastFetch, setTableNeedsRebuild
} from '../state/runtimeFlags.js';
import { getVirtualManager, setVirtualManager, getTableRenderer, setTableRenderer } from '../state/moduleRegistry.js';
import { logError, logWarn, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 3600e3;
const MAX_5M_DAYS = 5;
const DEBOUNCE_MS = 250;
const MANUAL_FIND_COOLDOWN_MS = 100;
const SPIN_ANIMATION_MS = 300;

const ELEMENT_IDS = {
  findButton: 'findButton',
  summaryButton: 'btnSummary',
  reverseButton: 'btnReverse',
  loadingOverlay: 'loading-overlay',
  summaryMetrics: 'summaryMetrics',
  chartsContainer: 'charts-container',
  chartsControls: 'charts-controls',
  chartSlider: 'chart-slider',
  chartArea: 'chart-area-1',
  modeControls: 'tableModeControls',
  resultsDisplay: '.results-display',
  tableControls: 'table-controls',
  tableBody: 'tableBody',
  virtualContainer: 'virtual-scroll-container'
};

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function safeCall(fn, context = 'filters') {
  try {
    fn();
  } catch (e) {
    logError(ErrorCategory.FILTER, context, e);
  }
}

function debounce(fn, wait = DEBOUNCE_MS) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// cache DOM elements to avoid repeated getElementById calls
const _elemCache = new Map();

function getElement(id) {
  let el = _elemCache.get(id);
  if (el === undefined) {
    el = document.getElementById(id);
    _elemCache.set(id, el);
  }
  // check if element is still in DOM
  if (el && !document.body.contains(el)) {
    el = document.getElementById(id);
    _elemCache.set(id, el);
  }
  return el;
}

function getElementBySelector(selector) {
  return document.querySelector(selector);
}

function toggleHidden(el, hidden) {
  if (el) el.classList.toggle('is-hidden', hidden);
}

function setDisplay(el, show, displayValue = 'flex') {
  if (el) el.style.display = show ? displayValue : 'none';
}

// ─────────────────────────────────────────────────────────────
// Date range helpers
// ─────────────────────────────────────────────────────────────

// pre-defined date input IDs
const DATE_INPUT_IDS = ['fromDate', 'toDate', 'fromTime', 'toTime'];

function areAllDateInputsEmpty() {
  for (let i = 0; i < DATE_INPUT_IDS.length; i++) {
    const el = getElement(DATE_INPUT_IDS[i]);
    if (el?.value?.trim()) return false;
  }
  return true;
}

function hasUrlState() {
  const urlParams = new URLSearchParams(window.location.search);
  const hasShortLink = !!urlParams.get('s');
  const hasLegacyHash = window.location.hash?.startsWith('#state=');
  return hasShortLink || hasLegacyHash;
}

function initDefaultDateRange(isStateLoaded) {
  if (isStateLoaded) return;
  if (!areAllDateInputsEmpty()) return;
  if (hasUrlState()) return;

  setDefaultDateRange();
}

// ─────────────────────────────────────────────────────────────
// Button handlers setup
// ─────────────────────────────────────────────────────────────

function setupFindButton(btn) {
  if (!btn) return;

  const debouncedHandler = debounce(() => {
    if (getAppStatus?.() === 'loading') return;
    handleFindClick();
  });

  btn.addEventListener('click', debouncedHandler);
}

function setupSummaryDelegation() {
  if (isSummaryDelegationInstalled()) return;

  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('#btnSummary');
    if (!btn || isSummaryFetchInProgress()) return;
    handleSummaryClick();
  }, false);

  setSummaryDelegationInstalled(true);
}

function setupReverseButton(btn) {
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (getAppStatus?.() === 'loading') return;
    handleReverseClick();
  });
}

// ─────────────────────────────────────────────────────────────
// Status subscription
// ─────────────────────────────────────────────────────────────

function setupStatusSubscription(findBtn, reverseBtn) {
  safeCall(() => {
    subscribe('appState:statusChanged', (status) => {
      const isLoading = status === 'loading';
      const isIntervalFetch = isIntervalFetchInFlight();
      const isSummaryFetch = isSummaryFetchInProgress();

      // table visibility
      if (isLoading && isSummaryFetch) {
        safeCall(() => setShowTable(false));
      }
      if (shouldHideTableUntilSummary()) {
        safeCall(() => setShowTable(false));
      }

      // overlay visibility
      const overlay = getElement(ELEMENT_IDS.loadingOverlay);
      if (overlay) {
        const showOverlay = isLoading && !isIntervalFetch && !isSummaryFetch;
        toggleHidden(overlay, !showOverlay);
      }

      // charts visibility
      if ((isLoading || status === 'success') && !isSummaryFetch) {
        safeCall(() => setUI({ showCharts: true, showModeControls: true }));
      }

      // button states
      if (findBtn) findBtn.disabled = isLoading;
      if (reverseBtn) reverseBtn.disabled = isLoading;
    });
  }, 'setupStatusSubscription');
}

// ─────────────────────────────────────────────────────────────
// Init filters
// ─────────────────────────────────────────────────────────────

export function initFilters(isStateLoaded) {
  const findButton = getElement(ELEMENT_IDS.findButton);
  const reverseButton = getElement(ELEMENT_IDS.reverseButton);

  setUI({ showTable: false });

  // init date/time widgets
  safeCall(() => {
    initFlatpickr();
    initTimeControls();
  }, 'initFilters:widgets');

  // set default date range if needed
  safeCall(() => initDefaultDateRange(isStateLoaded), 'initFilters:defaults');

  // setup button handlers
  setupFindButton(findButton);
  safeCall(setupSummaryDelegation, 'initFilters:summaryDelegation');
  setupReverseButton(reverseButton);

  // setup event subscriptions
  setupStatusSubscription(findButton, reverseButton);

  // setup other subscriptions
  safeCall(setupIntervalSubscription, 'initFilters:intervalSub');
  safeCall(setupFiltersChangedSubscription, 'initFilters:filtersSub');
  safeCall(setupDataChangedSubscription, 'initFilters:dataSub');
  safeCall(setupUIChangedSubscription, 'initFilters:uiSub');
}

// ─────────────────────────────────────────────────────────────
// Granularity helpers
// ─────────────────────────────────────────────────────────────

function parseTimestamp(str) {
  return new Date(str.replace(' ', 'T') + 'Z').getTime();
}

function computeGranularity(interval, diffDays, diffHours) {
  const userWants5m = interval === '5m';
  const userWants1h = interval === '1h';

  // enforce 5-day limit for 5m
  if (userWants5m && diffDays > MAX_5M_DAYS) {
    safeCall(() => toast('5-minute interval is available only for ranges up to 5 days. Switching to 1 hour.', { type: 'warning', duration: 3500 }));
    return { interval: '1h', granularity: '1h' };
  }

  let gran = '5m';
  if (diffHours <= 6) {
    gran = '5m';
  } else if (userWants1h) {
    gran = '1h';
  } else if (userWants5m) {
    gran = '5m';
  } else {
    gran = diffDays <= 1.0 ? '5m' : '1h';
  }

  if (gran === '5m' && diffDays > MAX_5M_DAYS) gran = '1h';

  return { interval, granularity: gran };
}

// ─────────────────────────────────────────────────────────────
// Interval subscription
// ─────────────────────────────────────────────────────────────

function setupIntervalSubscription() {
  if (isChartsIntervalFetchSubscribed()) return;
  setChartsIntervalFetchSubscribed(true);

  subscribe('charts:intervalChanged', async (payload) => {
    const interval = payload?.interval ? String(payload.interval) : '';
    if (!interval) return;
    if (getAppStatus?.() === 'loading') return;
    if (isIntervalFetchInFlight()) return;

    setIntervalFetchInFlight(true);

    try {
      safeCall(refreshFilterValues, 'intervalSub:refresh');

      const base = buildFilterParams();
      const zr = getChartsZoomRange();

      let effFromTs = parseTimestamp(base.from);
      let effToTs = parseTimestamp(base.to);

      if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs) {
        effFromTs = zr.fromTs;
        effToTs = zr.toTs;
      }

      if (!Number.isFinite(effFromTs) || !Number.isFinite(effToTs) || effToTs <= effFromTs) {
        setIntervalFetchInFlight(false);
        return;
      }

      const diffDays = (effToTs - effFromTs) / DAY_MS;
      const diffHours = (effToTs - effFromTs) / 3600e3;

      const { interval: effInterval, granularity } = computeGranularity(interval, diffDays, diffHours);
      setChartsCurrentInterval(effInterval);

      const params = { ...base, granularity, __reverse: !!isReverseMode() };

      // try cache first
      const cached = getCachedMetrics(params);
      if (cached) {
        setMetricsData(cached);
        setAppStatus('success');
        setIntervalFetchInFlight(false);
        return;
      }

      // fetch
      setAppStatus('loading');
      const data = await fetchMetrics(params);

      if (data) {
        setMetricsData(data);
        setAppStatus('success');
        safeCall(() => putCachedMetrics(params, data), 'intervalSub:cache');
      } else {
        setAppStatus('error');
      }
    } catch (e) {
      logError(ErrorCategory.FILTER, 'intervalSubscription', e);
    } finally {
      setIntervalFetchInFlight(false);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Other subscriptions
// ─────────────────────────────────────────────────────────────

function setupFiltersChangedSubscription() {
  subscribe('appState:filtersChanged', () => {
    safeCall(() => setUI({ showCharts: true, showModeControls: true }));
  });
}

function setupDataChangedSubscription() {
  subscribe('appState:dataChanged', () => {
    if (shouldHideTableUntilSummary()) safeCall(() => setShowTable(false));

    const overlay = getElement(ELEMENT_IDS.loadingOverlay);
    if (overlay) overlay.classList.add('is-hidden');

    const mount = getElement(ELEMENT_IDS.chartArea);
    if (mount) {
      mount.classList.remove('chart-fade--out');
      mount.classList.add('chart-fade--in');
      mount.style.opacity = '';
    }
  });
}

function setupUIChangedSubscription() {
  subscribe('appState:uiChanged', (ui) => {
    setDisplay(getElement(ELEMENT_IDS.chartsContainer), ui?.showCharts);
    setDisplay(getElement(ELEMENT_IDS.chartsControls), ui?.showCharts);
    setDisplay(getElement(ELEMENT_IDS.chartSlider), ui?.showCharts);
    setDisplay(getElement(ELEMENT_IDS.modeControls), ui?.showModeControls);
    toggleHidden(getElementBySelector(ELEMENT_IDS.resultsDisplay), !ui?.showTable);
  });
}

// ─────────────────────────────────────────────────────────────
// Table destruction
// ─────────────────────────────────────────────────────────────

const EMPTY_TABLE_HTML = `
<div id="virtual-scroll-spacer" style="position: absolute; top: 0; left: 0; right: 0; pointer-events: none;"></div>
<table id="summaryTable" class="results-display__table" style="position: relative;">
<thead id="tableHead"></thead>
<tbody id="tableBody"></tbody>
<tfoot><tr><td id="table-footer-info" colspan="24"></td></tr></tfoot>
</table>`;

function destroyModule(getter, setter, name) {
  const instance = getter();
  if (!instance) return;

  safeCall(() => {
    if (typeof instance.destroy === 'function') {
      instance.destroy();
    }
    setter(null);
  }, `destroyTableHard:${name}`);
}

function destroyTableHard() {
  safeCall(() => setShowTable(false), 'destroyTableHard:showTable');
  safeCall(resetExpansionState, 'destroyTableHard:expansion');
  safeCall(clearAllTableFilters, 'destroyTableHard:filters');

  destroyModule(getTableRenderer, setTableRenderer, 'renderer');
  destroyModule(getVirtualManager, setVirtualManager, 'vm');

  // restore DOM to clean state
  const vwrap = getElement(ELEMENT_IDS.virtualContainer);
  if (vwrap) {
    safeCall(() => { vwrap.innerHTML = EMPTY_TABLE_HTML; }, 'destroyTableHard:dom');
  }

  const controls = getElement(ELEMENT_IDS.tableControls);
  if (controls) controls.style.display = 'none';
}

// ─────────────────────────────────────────────────────────────
// Find click handler
// ─────────────────────────────────────────────────────────────

function showChartsUI() {
  safeCall(() => setUI({ showCharts: true, showModeControls: true }));

  setDisplay(getElement(ELEMENT_IDS.chartsContainer), true);
  setDisplay(getElement(ELEMENT_IDS.chartsControls), true);

  const mount = getElement(ELEMENT_IDS.chartArea);
  if (mount) {
    mount.classList.remove('chart-fade--out');
    mount.classList.add('chart-fade--in');
    mount.style.opacity = '';
  }
}

async function requestChartsRender() {
  setChartsRenderRequested(true);
  try {
    const { publish } = await import('../state/eventBus.js');
    publish('charts:renderRequest');
  } catch (e) {
    logError(ErrorCategory.FILTER, 'handleFindClick:publish', e);
  }
}

function computeFetchGranularity(fromStr, toStr) {
  const from = parseTimestamp(fromStr);
  const to = parseTimestamp(toStr);
  const diffDays = (to - from) / DAY_MS;
  const ci = getChartsCurrentInterval();

  if (ci === '5m' && diffDays > MAX_5M_DAYS) {
    setChartsCurrentInterval('1h');
    return '1h';
  }
  return ci === '5m' ? '5m' : '1h';
}

async function handleFindClick() {
  setManualFindInProgress(true);
  setAppStatus('loading');
  clearChartsZoomRange();

  showChartsUI();
  await requestChartsRender();

  toggleHidden(getElement(ELEMENT_IDS.summaryMetrics), true);

  setHideTableUntilSummary(true);
  destroyTableHard();
  hideTableUI();

  try {
    safeCall(refreshFilterValues, 'handleFindClick:refresh');

    const validation = validateFilterParams();
    if (!validation.isValid) {
      throw new Error(`Invalid filter parameters: ${validation.missing.join(', ')}`);
    }

    const uiParams = buildFilterParams();
    const filterParams = { ...uiParams, ...validation.params };
    const fetchParams = {
      ...filterParams,
      granularity: computeFetchGranularity(validation.params.from, validation.params.to)
    };

    safeCall(() => setFilters(filterParams), 'handleFindClick:setFilters');
    safeCall(() => setChartsUsedZoomForLastFetch(false), 'handleFindClick:zoomFlag');

    const cacheKeyParams = { ...fetchParams, __reverse: !!isReverseMode?.() };
    const cached = getCachedMetrics(cacheKeyParams);
    const data = cached || await fetchMetrics(fetchParams);

    if (data) {
      setMetricsData(data);
      setAppStatus('success');
      saveStateToUrl();

      if (!cached) safeCall(() => putCachedMetrics(cacheKeyParams, data), 'handleFindClick:cache');

      toggleHidden(getElement(ELEMENT_IDS.summaryMetrics), false);
      safeCall(() => setShowTable(false), 'handleFindClick:hideTable');

      const overlay = getElement(ELEMENT_IDS.loadingOverlay);
      if (overlay) overlay.classList.add('is-hidden');
    } else {
      setAppStatus('error');
    }
  } catch (e) {
    logError(ErrorCategory.FILTER, 'handleFindClick', e);
    setAppStatus('error');
  } finally {
    setTimeout(() => setManualFindInProgress(false), MANUAL_FIND_COOLDOWN_MS);
  }
}

// ─────────────────────────────────────────────────────────────
// Summary click handler
// ─────────────────────────────────────────────────────────────

function formatTimestamp(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function applyZoomToParams(params) {
  const zr = getChartsZoomRange();
  if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs) {
    params.from = formatTimestamp(zr.fromTs);
    params.to = formatTimestamp(zr.toTs);
  }
}

function synthesizeMainRows(peerRows) {
  const map = new Map();
  peerRows.forEach(p => {
    const k = `${p.main}||${p.destination}`;
    if (!map.has(k)) map.set(k, { main: p.main, destination: p.destination });
  });
  return Array.from(map.values());
}

function showErrorTable(message) {
  safeCall(renderTableHeader, 'showErrorTable:header');
  safeCall(renderTableFooter, 'showErrorTable:footer');
  safeCall(showTableControls, 'showErrorTable:controls');

  const tb = getElement(ELEMENT_IDS.tableBody);
  if (tb) tb.innerHTML = `<tr><td colspan="24">${message}</td></tr>`;

  safeCall(() => setShowTable(true), 'showErrorTable:show');
}

async function renderSummaryTable(data) {
  let { main_rows, peer_rows, hourly_rows } = data || {};

  // synthesize main_rows if needed
  if ((!main_rows || !main_rows.length) && peer_rows?.length) {
    main_rows = synthesizeMainRows(peer_rows);
  }

  if (!main_rows?.length && !peer_rows?.length) {
    showErrorTable('No data found for current filters.');
    return;
  }

  await renderCoordinator.requestRender('table', async () => {
    safeCall(renderTableHeader, 'renderSummaryTable:header');
    safeCall(renderTableFooter, 'renderSummaryTable:footer');
    safeCall(showTableControls, 'renderSummaryTable:controls');

    const detailedRows = data?.five_min_rows?.length ? data.five_min_rows : (hourly_rows || []);
    initTableControls(main_rows || [], peer_rows || [], detailedRows);

    const tb = getElement(ELEMENT_IDS.tableBody);
    if (tb) tb.innerHTML = '';

    // create fresh renderer
    const mod = await import('../rendering/table-renderer.js');
    destroyModule(getTableRenderer, setTableRenderer, 'summaryRenderer');

    const tr = new mod.TableRenderer();
    safeCall(() => tr.initialize(), 'renderSummaryTable:init');
    setTableRenderer(tr);
    await tr.renderTable(main_rows || [], peer_rows || [], hourly_rows || []);

    // show table UI
    safeCall(() => setShowTable(true), 'renderSummaryTable:show');
    toggleHidden(getElementBySelector(ELEMENT_IDS.resultsDisplay), false);
    setDisplay(getElement(ELEMENT_IDS.tableControls), true);
    toggleHidden(getElementBySelector('.results-display__footer'), false);

    safeCall(() => setUI({ showTable: true }), 'renderSummaryTable:ui');
    safeCall(initTableView, 'renderSummaryTable:view');
    safeCall(initStickyHeader, 'renderSummaryTable:stickyHeader');
    safeCall(initStickyFooter, 'renderSummaryTable:stickyFooter');
    safeCall(initTableInteractions, 'renderSummaryTable:interactions');
  }, { debounceMs: 0, cooldownMs: 0 });
}

async function handleSummaryClick() {
  const ui = getUI();

  // toggle off if visible
  if (ui?.showTable) {
    toggleHidden(getElementBySelector(ELEMENT_IDS.resultsDisplay), true);
    safeCall(() => setShowTable(false), 'handleSummaryClick:hide');
    return;
  }

  // show table
  setSummaryFetchInProgress(true);
  setHideTableUntilSummary(false);
  resetVirtualTableState();
  safeCall(clearAllTableFilters, 'handleSummaryClick:clearFilters');

  try {
    safeCall(refreshFilterValues, 'handleSummaryClick:refresh');
    const filterParams = buildFilterParams();
    applyZoomToParams(filterParams);

    if (!filterParams.from || !filterParams.to) {
      throw new Error('Date range is not set. Cannot fetch metrics.');
    }

    filterParams.granularity = computeFetchGranularity(filterParams.from, filterParams.to);
    const data = await fetchMetrics(filterParams);

    if (!data) {
      showErrorTable('Error loading data. Please try again.');
      saveStateToUrl();
      alert('Error loading data. Please try again.');
      return;
    }

    await renderSummaryTable(data);
    saveStateToUrl();
  } catch (e) {
    logError(ErrorCategory.FILTER, 'handleSummaryClick', e);
    alert('Error loading data. Please try again.');
  } finally {
    setSummaryFetchInProgress(false);
  }
}

// ─────────────────────────────────────────────────────────────
// Virtual table state
// ─────────────────────────────────────────────────────────────

function resetVirtualTableState() {
  safeCall(resetExpansionState, 'resetVirtualTableState:expansion');
  destroyModule(getVirtualManager, setVirtualManager, 'virtualManager');
}

// ─────────────────────────────────────────────────────────────
// Reverse click handler
// ─────────────────────────────────────────────────────────────

function handleReverseClick() {
  setReverseMode(!isReverseMode());

  toggleHidden(getElementBySelector(ELEMENT_IDS.resultsDisplay), true);
  safeCall(() => setShowTable(false), 'handleReverseClick:hide');
  safeCall(() => setTableNeedsRebuild(true), 'handleReverseClick:rebuild');

  // animate button
  const btn = getElement(ELEMENT_IDS.reverseButton);
  if (btn) {
    btn.classList.add('reverse-spin');
    setTimeout(() => btn.classList.remove('reverse-spin'), SPIN_ANIMATION_MS);
  }
}

// ─────────────────────────────────────────────────────────────
// Public filter utilities
// ─────────────────────────────────────────────────────────────

export function clearTableFilters() {
  clearAllTableFilters();
  setupAutoFilterClearing();

  const vm = getVirtualManager();
  if (vm?.isActive) {
    vm.refreshVirtualTable();
  }
}

export function clearSpecificFilter(columnKey) {
  clearColumnFilter(columnKey);

  const vm = getVirtualManager();
  if (vm?.isActive) {
    vm.refreshVirtualTable();
  }
}
