// static/js/dom/table-ui.js
// Responsibility: Table UI (headers, sort arrows, filters, aggregates)
import { getState, setMultiSort, getSearchDebounceMs } from '../state/tableState.js';
import { isReverseMode } from '../state/appState.js';
import { subscribe } from '../state/eventBus.js';
import { computeAggregates } from '../data/tableProcessor.js';
import { renderHeaderCellString } from './components/header-cell.js';
import { renderFilterCell as renderFilterCellComponent } from './components/filter-cell.js';
import { applySortSafe } from '../table/features/sortControl.js';
import { getVirtualManager } from '../state/moduleRegistry.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { getPendingFilterFocus, setPendingFilterFocus, clearPendingFilterFocus } from '../state/runtimeFlags.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEBUG = typeof window !== 'undefined' && window.DEBUG === true;

const SELECTORS = {
  table: '.results-display__table',
  controls: '.results-display__controls',
  footer: '.results-display__footer',
  container: 'virtual-scroll-container',
  globalFilter: 'table-filter-input',
  filterRow: 'column-filters-row',
  tableBody: 'tableBody',
  footerInfo: 'table-footer-info',
  floatingFooter: '.floating-table-footer tfoot',
  realFooter: '#summaryTable tfoot'
};

const SORT_DEBOUNCE_MS = 50;
const SCROLL_RESTORE_DELAY = 50;
const DEFAULT_FILTER_DEBOUNCE = 150;

const ARROW_SVG = `<svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg>`;

// Y-column indices in metrics array (0-based) - use Set for O(1) lookup
const Y_COLUMN_INDICES = new Set([1, 4, 7, 10, 13]);
// Delta column positions in 15-metric sequence (1-based) - use Set for O(1) lookup
const DELTA_POSITIONS = new Set([3, 6, 9, 12, 15]);

// ─────────────────────────────────────────────────────────────
// Column configuration
// ─────────────────────────────────────────────────────────────

const COLUMN_CONFIG = [
  { label: rev => rev ? 'Supplier' : 'Customer', key: 'main', filterable: true },
  { label: rev => rev ? 'Customer' : 'Supplier', key: 'peer', filterable: true },
  { label: () => 'Destination', key: 'destination', filterable: true, placeholder: 'Destination' },
  { label: () => 'Min', key: 'Min', filterable: true },
  { label: () => 'YMin', key: 'YMin', filterable: true, isYColumn: true },
  { label: () => 'Δ', key: 'Min_delta', filterable: true, headerClass: 'th-delta' },
  { label: () => 'ACD', key: 'ACD', filterable: true },
  { label: () => 'YACD', key: 'YACD', filterable: true, isYColumn: true },
  { label: () => 'Δ', key: 'ACD_delta', filterable: true, headerClass: 'th-delta' },
  { label: () => 'ASR', key: 'ASR', filterable: true },
  { label: () => 'YASR', key: 'YASR', filterable: true, isYColumn: true },
  { label: () => 'Δ', key: 'ASR_delta', filterable: true, headerClass: 'th-delta' },
  { label: () => 'SCal', key: 'SCall', filterable: true },
  { label: () => 'YSCal', key: 'YSCall', filterable: true, isYColumn: true },
  { label: () => 'Δ', key: 'SCall_delta', filterable: true, headerClass: 'th-delta' },
  { label: () => 'TCal', key: 'TCall', filterable: true },
  { label: () => 'YTCal', key: 'YTCall', filterable: true, isYColumn: true },
  { label: () => 'Δ', key: 'TCall_delta', filterable: true, headerClass: 'th-delta' }
];

export function getColumnConfig() {
  return COLUMN_CONFIG;
}

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let sortDelegationInstalled = false;
let globalFilterTimeout = null;
const columnFilterTimeouts = new Map();

// ─────────────────────────────────────────────────────────────
// Sort delegation
// ─────────────────────────────────────────────────────────────

function initDelegatedSortHandlers() {
  if (sortDelegationInstalled) return;

  let lastHandledTs = 0;

  document.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastHandledTs < SORT_DEBOUNCE_MS) return;
    lastHandledTs = now;

    const arrow = e.target.closest('.sort-arrow');
    if (!arrow) return;

    const inHeader = arrow.closest('#summaryTable thead') || arrow.closest('.floating-table-header thead');
    if (!inHeader) return;

    const key = arrow.dataset.sortKey;
    if (!key) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      applySortSafe(key);
    } catch (err) {
      if (DEBUG) console.warn('Sort handler error', err);
    }
  }, false);

  sortDelegationInstalled = true;
}

// ─────────────────────────────────────────────────────────────
// Table view
// ─────────────────────────────────────────────────────────────

export function initTableView() {
  subscribe('appState:reverseModeChanged', updateTableView);
  try {
    initDelegatedSortHandlers();
  } catch (e) {
    logError(ErrorCategory.TABLE, 'initTableView', e);
  }
}

function updateTableView() {
  renderTableHeader();
  renderTableFooter();
  updateSortArrows();
}
// ─────────────────────────────────────────────────────────────
// Header rendering
// ─────────────────────────────────────────────────────────────

export function renderTableHeader() {
  const table = document.querySelector(SELECTORS.table);
  const thead = table?.querySelector('thead');
  if (!thead) return;

  const reverse = isReverseMode();
  const html = COLUMN_CONFIG.map(col => renderHeaderCellString({ col, reverse })).join('');
  thead.innerHTML = `<tr>${html}</tr>`;
}

// ─────────────────────────────────────────────────────────────
// Footer rendering
// ─────────────────────────────────────────────────────────────

function getFilterPlaceholder(key, col, reverse) {
  if (key === 'main') return reverse ? 'Supplier' : 'Customer';
  if (key === 'peer') return reverse ? 'Customer' : 'Supplier';
  return col.placeholder || '≥';
}

function formatAggValue(val) {
  if (val === '' || val == null) return '';
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(n)) return String(val);
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
}

function formatAggIntValue(val) {
  if (val === '' || val == null) return '';
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(n)) return '';
  return Math.round(n).toString();
}

function createMetricCell(val, idx) {
  const td = document.createElement('td');
  const isDelta = DELTA_POSITIONS.has(idx + 1);
  const isMinOrYMin = idx === 0 || idx === 1;

  if (isDelta) {
    const n = typeof val === 'number' ? val : parseFloat(val);
    if (!isNaN(n)) {
      const r = Math.round(n);
      td.textContent = r === 0 ? '' : Math.abs(r).toString();
      if (r > 0) td.classList.add('cell-positive');
      else if (r < 0) td.classList.add('cell-negative');
    }
  } else if (isMinOrYMin) {
    td.textContent = formatAggIntValue(val);
  } else {
    td.textContent = formatAggValue(val);
  }

  if (Y_COLUMN_INDICES.has(idx)) {
    td.setAttribute('data-y-toggleable', 'true');
  }

  return td;
}

function createTopButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--primary scroll-top-btn';
  btn.title = 'Scroll to top';
  btn.textContent = 'Top';
  return btn;
}

export function renderTableFooter() {
  const table = document.querySelector(SELECTORS.table);
  if (!table) return;

  let tfoot = table.querySelector('tfoot');
  if (!tfoot) {
    tfoot = document.createElement('tfoot');
    tfoot.className = 'results-display__footer';
    table.appendChild(tfoot);
  }

  const reverse = isReverseMode();
  const { columnFilters } = getState();

  // filter row
  const filterCells = COLUMN_CONFIG.map(col => {
    const placeholder = getFilterPlaceholder(col.key, col, reverse);
    return renderFilterCellComponent({
      key: col.key,
      placeholder,
      value: columnFilters[col.key] || '',
      isYColumn: !!col.isYColumn
    });
  }).join('');

  tfoot.innerHTML = `<tr id="column-filters-row" class="results-display__column-filters">${filterCells}</tr>`;
  connectFilterEventHandlers();

  // aggregates row
  const aggRow = document.getElementById('aggregates-row') || document.createElement('tr');
  aggRow.id = 'aggregates-row';
  aggRow.className = 'results-display__aggregates';
  aggRow.innerHTML = '';

  const { curr, y, delta } = computeAggregates();
  const cells = [];

  // empty cells for first 3 columns
  for (let i = 0; i < 3; i++) {
    cells.push(document.createElement('td'));
  }

  // metrics: Min, YMin, Δ, ACD, YACD, Δ, ASR, YASR, Δ, SCall, YSCall, Δ, TCall, YTCal, Δ
  const metrics = [
    curr.totalMinutes, y.totalMinutes, delta.totalMinutes,
    curr.acdAvg, y.acdAvg, delta.acdAvg,
    curr.asrAvg, y.asrAvg, delta.asrAvg,
    curr.totalSuccessfulCalls, y.totalSuccessfulCalls, delta.totalSuccessfulCalls,
    curr.totalCalls, y.totalCalls, delta.totalCalls
  ];

  metrics.forEach((val, idx) => cells.push(createMetricCell(val, idx)));

  // top button in first cell
  if (cells[0] && !cells[0].querySelector('.scroll-top-btn')) {
    cells[0].classList.add('aggregates-top-cell');
    cells[0].appendChild(createTopButton());
  }

  cells.forEach(td => aggRow.appendChild(td));
  tfoot.appendChild(aggRow);
}

// ─────────────────────────────────────────────────────────────
// Sort arrows
// ─────────────────────────────────────────────────────────────

export function updateSortArrows() {
  const { multiSort, textFields } = getState();
  // use Map for O(1) lookup of sort index
  const sortIndexMap = new Map(multiSort.map((s, i) => [s.key, i]));
  // use Set for O(1) textFields check
  const textFieldsSet = new Set(textFields);

  const arrows = document.querySelectorAll('.sort-arrow');
  const arrowCount = arrows.length;

  for (let i = 0; i < arrowCount; i++) {
    const arrow = arrows[i];
    const key = arrow.dataset.sortKey;
    arrow.classList.remove('active', 'inactive', 'down', 'up', 'right', 'secondary-sort');
    arrow.innerHTML = ARROW_SVG;

    const idx = sortIndexMap.get(key);
    if (idx === 0) {
      const dir = multiSort[0].dir;
      const isTextField = textFieldsSet.has(key);
      const isDown = (isTextField && dir === 'asc') || (!isTextField && dir === 'desc');
      arrow.classList.add(isDown ? 'down' : 'up', 'active');
    } else if (idx > 0) {
      arrow.classList.add('secondary-sort');
    } else {
      arrow.classList.add('inactive', 'right');
    }
  }
}

// legacy - delegated handler covers all cases
export function attachSortArrowHandlers() {
  if (sortDelegationInstalled) return;

  document.querySelectorAll('.sort-arrow').forEach(arrow => {
    const newArrow = arrow.cloneNode(true);
    arrow.parentNode.replaceChild(newArrow, arrow);

    newArrow.addEventListener('click', () => {
      const key = newArrow.dataset.sortKey;
      const { multiSort, textFields } = getState();
      let newMultiSort = [...multiSort];
      const found = newMultiSort.find(s => s.key === key);

      if (!found) {
        newMultiSort.unshift({ key, dir: textFields.includes(key) ? 'asc' : 'desc' });
      } else if (newMultiSort[0].key === key) {
        found.dir = found.dir === 'asc' ? 'desc' : 'asc';
      } else {
        newMultiSort = [found, ...newMultiSort.filter(s => s.key !== key)];
      }

      setMultiSort(newMultiSort.slice(0, 3));
    });
  });
}

// ─────────────────────────────────────────────────────────────
// UI visibility
// ─────────────────────────────────────────────────────────────

export function hideTableUI() {
  const controls = document.querySelector(SELECTORS.controls);
  if (controls) controls.style.display = 'none';

  const footer = document.querySelector(SELECTORS.footer);
  if (footer) footer.classList.add('is-hidden');
}

export function showTableControls() {
  const controls = document.querySelector(SELECTORS.controls);
  if (controls) controls.style.display = 'flex';

  const footer = document.querySelector(SELECTORS.footer);
  if (footer) footer.classList.remove('is-hidden');
}

export function updateTableFooter() {
  const footerInfo = document.getElementById(SELECTORS.footerInfo);
  if (footerInfo) footerInfo.textContent = '';
}

// ─────────────────────────────────────────────────────────────
// Filter event handlers
// ─────────────────────────────────────────────────────────────

function clearFilterTimeouts() {
  if (globalFilterTimeout) {
    clearTimeout(globalFilterTimeout);
    globalFilterTimeout = null;
  }
  columnFilterTimeouts.forEach(t => clearTimeout(t));
  columnFilterTimeouts.clear();
}

function getDebounceDelay() {
  return getSearchDebounceMs?.() || DEFAULT_FILTER_DEBOUNCE;
}

// scroll state management
function saveScrollState() {
  const container = document.getElementById(SELECTORS.container);
  return {
    windowX: window.pageXOffset || 0,
    windowY: window.pageYOffset || 0,
    containerX: container?.scrollLeft ?? null,
    containerY: container?.scrollTop ?? null,
    container
  };
}

function disableScrollAnchoring(container) {
  try { document.documentElement.style.overflowAnchor = 'none'; } catch {}
  try { document.body.style.overflowAnchor = 'none'; } catch {}
  try { if (container) container.style.overflowAnchor = 'none'; } catch {}
}

function enableScrollAnchoring(container) {
  try { document.documentElement.style.overflowAnchor = ''; } catch {}
  try { document.body.style.overflowAnchor = ''; } catch {}
  try { if (container) container.style.overflowAnchor = ''; } catch {}
}

function restoreScrollState(state) {
  const { windowX, windowY, containerX, containerY, container } = state;

  const restore = () => {
    try {
      if (container && containerY != null) container.scrollTop = containerY;
      if (container && containerX != null) container.scrollLeft = containerX;
      window.scrollTo(windowX, windowY);
    } catch {}
    enableScrollAnchoring(container);
  };

  // multiple restore attempts for reliability
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
  Promise.resolve().then(restore);
  setTimeout(restore, SCROLL_RESTORE_DELAY);
}

export function connectFilterEventHandlers() {
  clearFilterTimeouts();

  const globalInput = document.getElementById(SELECTORS.globalFilter);
  if (globalInput) {
    globalInput.removeEventListener('input', handleGlobalFilterChangeDebounced);
    globalInput.addEventListener('input', handleGlobalFilterChangeDebounced);
  }

  const filterRow = document.getElementById(SELECTORS.filterRow);
  if (filterRow) {
    filterRow.querySelectorAll('input').forEach(input => {
      input.removeEventListener('input', handleColumnFilterChangeDebounced);
      input.removeEventListener('change', handleColumnFilterChange);
      input.removeEventListener('compositionend', handleColumnFilterChange);
      input.addEventListener('input', handleColumnFilterChangeDebounced);
      input.addEventListener('change', handleColumnFilterChange);
      input.addEventListener('compositionend', handleColumnFilterChange);
    });
  }
}

function handleGlobalFilterChangeDebounced(event) {
  const value = event.target.value.trim();

  if (globalFilterTimeout) clearTimeout(globalFilterTimeout);

  if (!value) {
    handleGlobalFilterChange(event);
    return;
  }

  globalFilterTimeout = setTimeout(() => handleGlobalFilterChange(event), getDebounceDelay());
}

function handleColumnFilterChangeDebounced(event) {
  const key = event.target.dataset.filterKey;
  const value = event.target.value.trim();

  if (columnFilterTimeouts.has(key)) {
    clearTimeout(columnFilterTimeouts.get(key));
  }

  if (!value) {
    handleColumnFilterChange(event);
    return;
  }

  const timeout = setTimeout(() => {
    handleColumnFilterChange(event);
    columnFilterTimeouts.delete(key);
  }, getDebounceDelay());

  columnFilterTimeouts.set(key, timeout);
}

function handleGlobalFilterChange(event) {
  const value = event.target.value.trim();
  const input = event.target;

  const scrollState = saveScrollState();
  disableScrollAnchoring(scrollState.container);

  const wasFocused = document.activeElement === input;
  const cursorPos = input.selectionStart;

  import('../state/tableState.js').then(({ setGlobalFilter }) => {
    setGlobalFilter(value);
    restoreScrollState(scrollState);

    const vm = getVirtualManager();
    if (vm?.isActive) {
      vm.refreshVirtualTable();

      if (wasFocused) {
        requestAnimationFrame(() => {
          const newInput = document.getElementById(SELECTORS.globalFilter);
          if (newInput) {
            newInput.focus();
            const maxPos = Math.min(cursorPos, newInput.value.length);
            newInput.setSelectionRange(maxPos, maxPos);
          }
          restoreScrollState(scrollState);
        });
      }
    }
  });
}

function handleColumnFilterChange(event) {
  const key = event.target.dataset.filterKey;
  const value = event.target.value.trim();
  const input = event.target;

  const scrollState = saveScrollState();
  disableScrollAnchoring(scrollState.container);

  const wasFocused = document.activeElement === input;
  const cursorPos = event?.detail?.cursorPosition ?? input.selectionStart ?? input.value.length;
  const cursorEnd = input.selectionEnd ?? cursorPos;
  const fromFloating = Boolean(event?.detail?.fromFloating) || !!input.closest('.floating-table-footer');
  const inputValue = input.value;

  try {
    setPendingFilterFocus({ key, fromFloating, cursorPosition: cursorPos, cursorEnd, inputValue });
  } catch (e) {
    logError(ErrorCategory.TABLE, 'handleColumnFilterChange', e);
  }

  import('../state/tableState.js').then(({ setColumnFilter }) => {
    setColumnFilter(key, value);
    restoreScrollState(scrollState);

    const vm = getVirtualManager();
    if (vm?.isActive) {
      vm.refreshVirtualTable();

      // clear tbody if no results
      import('../data/tableProcessor.js').then(({ getProcessedData }) => {
        try {
          const { pagedData } = getProcessedData();
          if (!pagedData?.length) {
            const tbody = document.getElementById(SELECTORS.tableBody);
            if (tbody) tbody.innerHTML = '';
          }
        } catch {}
      });

      if (wasFocused || fromFloating) {
        requestAnimationFrame(() => {
          const selector = `input[data-filter-key="${key}"]`;
          const container = fromFloating
            ? document.querySelector(SELECTORS.floatingFooter)
            : document.querySelector(SELECTORS.realFooter);
          const newInput = container?.querySelector(selector) || document.querySelector(selector);

          if (newInput) {
            if (newInput.value !== inputValue) newInput.value = inputValue;
            if (document.activeElement !== newInput) newInput.focus();

            const maxPos = newInput.value.length;
            if (newInput.setSelectionRange) {
              newInput.setSelectionRange(Math.min(cursorPos, maxPos), Math.min(cursorEnd, maxPos));
            }
          }
          restoreScrollState(scrollState);
        });
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Focus restoration
// ─────────────────────────────────────────────────────────────

export function restoreFilterFocusIfPending() {
  try {
    const pending = getPendingFilterFocus();
    if (!pending?.key) return;

    const { key, fromFloating, cursorPosition, cursorEnd, inputValue } = pending;
    const selector = `input[data-filter-key="${key}"]`;
    const container = fromFloating
      ? document.querySelector(SELECTORS.floatingFooter)
      : document.querySelector(SELECTORS.realFooter);
    const target = container?.querySelector(selector) || document.querySelector(selector);

    if (target) {
      if (inputValue !== undefined && target.value !== inputValue) {
        target.value = inputValue;
      }

      const pos = Math.min(cursorPosition ?? target.value.length, target.value.length);
      const end = Math.min(cursorEnd ?? pos, target.value.length);

      if (document.activeElement !== target) target.focus();
      if (target.setSelectionRange) target.setSelectionRange(pos, end);

      clearPendingFilterFocus();
    }
  } catch (e) {
    logError(ErrorCategory.TABLE, 'restoreFilterFocusIfPending', e);
  }
}

// backward compatibility
try { if (typeof window !== 'undefined') window.restoreFilterFocusIfPending = restoreFilterFocusIfPending; } catch {}
