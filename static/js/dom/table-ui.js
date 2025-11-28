// static/js/dom/table-ui.js
// This module contains functions that manage the UI aspects of the table,
// like headers, sort arrows, and controls.

import {
  getState,
  setMultiSort,
  getSearchDebounceMs,
} from "../state/tableState.js";
import { isReverseMode } from "../state/appState.js";
import { subscribe } from "../state/eventBus.js";
import { computeAggregates } from "../data/tableProcessor.js";
// import { getYColumnToggleIcon } from "./hideYColumns.js"; // unused here
import { renderHeaderCellString } from './components/header-cell.js';
import { renderFilterCell as renderFilterCellComponent } from './components/filter-cell.js';
import { applySortSafe } from "../table/features/sortControl.js";
import { getVirtualManager } from "../state/moduleRegistry.js";
const DEBUG = (typeof window !== 'undefined' && window.DEBUG === true);

const arrowSvg = `<svg viewBox="0 0 24 24">
  <polyline points="9 6 15 12 9 18"/>
</svg>`;

/**
 * The single source of truth for the table's column structure.
 */
export function getColumnConfig() {
  // We define which columns are filterable and their placeholders
  return [
    {
      label: (rev) => (rev ? "Supplier" : "Customer"),
      key: "main",
      filterable: true,
    },
    {
      label: (rev) => (rev ? "Customer" : "Supplier"),
      key: "peer",
      filterable: true,
    },
    {
      label: () => "Destination",
      key: "destination",
      filterable: true,
      placeholder: "Destination",
    },
    { label: () => "Min", key: "Min", filterable: true },
    { label: () => "YMin", key: "YMin", filterable: true, isYColumn: true },
    {
      label: () => "Δ",
      key: "Min_delta",
      filterable: true,
      headerClass: "th-delta", // For specific styling
    },
    { label: () => "ACD", key: "ACD", filterable: true },
    { label: () => "YACD", key: "YACD", filterable: true, isYColumn: true },
    {
      label: () => "Δ",
      key: "ACD_delta",
      filterable: true,
      headerClass: "th-delta", // For specific styling
    },
    { label: () => "ASR", key: "ASR", filterable: true },
    { label: () => "YASR", key: "YASR", filterable: true, isYColumn: true },
    {
      label: () => "Δ",
      key: "ASR_delta",
      filterable: true,
      headerClass: "th-delta", // For specific styling
    },
    { label: () => "SCal", key: "SCall", filterable: true },
    { label: () => "YSCal", key: "YSCall", filterable: true, isYColumn: true },
    {
      label: () => "Δ",
      key: "SCall_delta",
      filterable: true,
      headerClass: "th-delta", // For specific styling
    },
    { label: () => "TCal", key: "TCall", filterable: true },
    { label: () => "YTCal", key: "YTCall", filterable: true, isYColumn: true },
    {
      label: () => "Δ",
      key: "TCall_delta",
      filterable: true,
      headerClass: "th-delta", // For specific styling
    },
  ];
}

// Install delegated click handler for sort arrows once (covers floating and real headers)
let _sortDelegationInstalled = false;
function initDelegatedSortHandlers() {
  if (_sortDelegationInstalled) return;
  let _lastHandledTs = 0;
  const handle = (e) => {
    const now = Date.now();
    if (now - _lastHandledTs < 50) return; // защита от повторного срабатывания в одном тике
    _lastHandledTs = now;
    const arrow = e.target.closest('.sort-arrow');
    if (!arrow) return;
    const inHeader = arrow.closest('#summaryTable thead') || arrow.closest('.floating-table-header thead');
    if (!inHeader) return;
    const key = arrow.dataset.sortKey;
    if (!key) return;
    // Prevent scroll jump immediately
    e.preventDefault();
    e.stopPropagation();
    try {
      applySortSafe(key);
    } catch (err) {
      if (DEBUG) console.warn('Delegated sort handler error', err);
    }
  };
  // Делегированные слушатели (реальный и плавающий thead)
  document.addEventListener('click', handle, false);
  _sortDelegationInstalled = true;
}

// Инициализация представления таблицы: подписка на смену Reverse и установка делегированных обработчиков сортировки
export function initTableView() {
  subscribe("appState:reverseModeChanged", () => {
    if (DEBUG) console.log("[Event] appState:reverseModeChanged triggered table view update.");
    updateTableView();
  });
  // Установить делегированные обработчики сортировки (однократно)
  try { initDelegatedSortHandlers(); } catch (_) { /* no-op */ }
}

function updateTableView() {
  if (DEBUG) console.log("Updating table view (header and footer)...");
  renderTableHeader();
  renderTableFooter(); // Also update the footer for new placeholders
  // delegated sort handler covers clicks; only refresh visual state
  updateSortArrows();
}
export function renderTableHeader() {
  const reverse = isReverseMode();
  const columns = getColumnConfig();
  const table = document.querySelector('.results-display__table');
  if (!table) return;
  const thead = table.querySelector('thead');
  if (!thead) return;
  // Build header HTML via pure renderer (no DOM mutation inside components)
  const headerHTML = `<tr>${columns.map(col => renderHeaderCellString({ col, reverse })).join('')}</tr>`;
  thead.innerHTML = headerHTML; // safe: inner container only
}

export function renderTableFooter() {
  const reverse = isReverseMode();
  const columns = getColumnConfig();
  const { columnFilters } = getState();

  const table = document.querySelector(".results-display__table");
  if (!table) return;

  let tfoot = table.querySelector("tfoot");
  if (!tfoot) {
    tfoot = document.createElement("tfoot");
    tfoot.className = "results-display__footer";
    table.appendChild(tfoot);
  }
  // Build filter row via pure renderer (no handlers here)
  const filterCellsHTML = columns.map(col => {
    const key = col.key;
    const value = columnFilters[key] || '';
    const placeholder = key === 'main' ? (reverse ? 'Supplier' : 'Customer')
                      : key === 'peer' ? (reverse ? 'Customer' : 'Supplier')
                      : (col.placeholder || '≥');
    return renderFilterCellComponent({ key, placeholder, value, isYColumn: !!col.isYColumn });
  }).join('');
  tfoot.innerHTML = `<tr id="column-filters-row" class="results-display__column-filters">${filterCellsHTML}</tr>`;

  // --- NEW: Connect filter event handlers ---
  connectFilterEventHandlers();

  // --- NEW: Aggregates row under filters ---
  let aggRow = document.getElementById("aggregates-row");
  if (!aggRow) {
    aggRow = document.createElement("tr");
    aggRow.id = "aggregates-row";
    aggRow.className = "results-display__aggregates";
  } else {
    aggRow.innerHTML = "";
  }

  // Ensure Y-columns hidden cells are removed in aggregates row
  // const tableEl = document.querySelector('.results-display__table'); // not used

  const { curr, y, delta } = computeAggregates();

  const cells = [];
  // First three columns: keep empty to avoid label text
  for (let i = 0; i < 3; i++) {
    const td = document.createElement("td");
    cells.push(td);
  }

  // Metrics columns: Min total, YMin (empty), Δ (empty), ACD avg, YACD (empty), Δ (empty), ASR avg, YASR (empty), Δ (empty), SCall total, YSCall (empty), Δ (empty), TCall total, YTCal (empty), Δ (empty)
  // Build metrics sequence for columns n+4: Min, YMin, Δ, ACD, YACD, Δ, ASR, YASR, Δ, SCall, YSCall, Δ, TCall, YTCal, Δ
  const metricsValues = [
    curr.totalMinutes, y.totalMinutes, delta.totalMinutes,
    curr.acdAvg, y.acdAvg, delta.acdAvg,
    curr.asrAvg, y.asrAvg, delta.asrAvg,
    curr.totalSuccessfulCalls, y.totalSuccessfulCalls, delta.totalSuccessfulCalls,
    curr.totalCalls, y.totalCalls, delta.totalCalls,
  ];

  metricsValues.forEach((val, idx) => {
    const td = document.createElement("td");
    const isDeltaColumn = [3, 6, 9, 12, 15].includes(idx + 1); // positions 3,6,9,12,15 in the 15-metric sequence
    const isMinColumn = idx === 0;   // Min
    const isYMinColumn = idx === 1;  // YMin
    if (isDeltaColumn) {
      const n = typeof val === 'number' ? val : parseFloat(val);
      if (!isNaN(n)) {
        const r = Math.round(n);
        td.textContent = r === 0 ? '' : Math.abs(r).toString();
        if (r > 0) td.classList.add('cell-positive');
        else if (r < 0) td.classList.add('cell-negative');
      } else {
        td.textContent = '';
      }
    } else if (isMinColumn || isYMinColumn) {
      td.textContent = formatAggIntValue(val);
    } else {
      td.textContent = formatAggValue(val);
    }
    // Hide Y columns in aggregates row to mirror table layout
    if ([1, 4, 7, 10, 13].includes(idx)) {
      // idx 1=YMin, 4=YACD, 7=YASR, 10=YSCall, 13=YTCal
      td.setAttribute('data-y-toggleable', 'true');
    }
    cells.push(td);
  });

  // Place Top button under main column, in aggregates row first cell
  if (cells.length > 0 && !cells[0].querySelector('.scroll-top-btn')) {
    const topBtn = document.createElement('button');
    topBtn.type = 'button';
    // design system button
    topBtn.className = 'btn btn--primary scroll-top-btn';
    topBtn.title = 'Scroll to top';
    topBtn.textContent = 'Top';
    // use CSS utility class instead of inline styles
    cells[0].classList.add('aggregates-top-cell');
    cells[0].appendChild(topBtn);
  }
  cells.forEach((td) => aggRow.appendChild(td));
  tfoot.appendChild(aggRow);
}

function formatAggValue(val) {
  if (val === "" || val == null) return "";
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(n)) return String(val);
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
}

// removed unused formatDeltaAggValue

function formatAggIntValue(val) {
  if (val === "" || val == null) return "";
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(n)) return '';
  return Math.round(n).toString();
}

// ... (rest of the file is correct and remains unchanged)
export function updateSortArrows() {
  const { multiSort, textFields } = getState();
  const activeKeys = multiSort.map((s) => s.key);

  document.querySelectorAll(".sort-arrow").forEach((arrow) => {
    const key = arrow.dataset.sortKey;
    arrow.classList.remove(
      "active",
      "inactive",
      "down",
      "up",
      "right",
      "secondary-sort"
    );
    arrow.innerHTML = arrowSvg;

    const idx = activeKeys.indexOf(key);
    if (idx === 0) {
      const dir = multiSort[0].dir;
      const isTextField = textFields.includes(key);
      if ((isTextField && dir === "asc") || (!isTextField && dir === "desc")) {
        arrow.classList.add("down");
      } else {
        arrow.classList.add("up");
      }
      arrow.classList.add("active");
    } else if (idx > 0) {
      arrow.classList.add("secondary-sort");
    } else {
      arrow.classList.add("inactive", "right");
    }
  });
}
export function hideTableUI() {
  const controls = document.querySelector(".results-display__controls");
  if (controls) controls.style.display = "none";

  const tableFooter = document.querySelector(".results-display__footer");
  if (tableFooter) tableFooter.classList.add("is-hidden");
}
export function showTableControls() {
  const controls = document.querySelector(".results-display__controls");
  if (controls) controls.style.display = "flex";

  const tableFooter = document.querySelector(".results-display__footer");
  if (tableFooter) tableFooter.classList.remove("is-hidden");
}
export function attachSortArrowHandlers() {
  // legacy, to be removed later: delegated handler covers all cases
  if (_sortDelegationInstalled) return; // avoid double-binding and cloneNode churn
  document.querySelectorAll(".sort-arrow").forEach((arrow) => {
    const newArrow = arrow.cloneNode(true);
    arrow.parentNode.replaceChild(newArrow, arrow);

    newArrow.addEventListener("click", () => {
      const key = newArrow.dataset.sortKey;
      const { multiSort, textFields } = getState();
      let newMultiSort = [...multiSort];
      const found = newMultiSort.find((s) => s.key === key);
      if (!found) {
        newMultiSort.unshift({
          key,
          dir: textFields.includes(key) ? "asc" : "desc",
        });
      } else if (newMultiSort[0].key === key) {
        found.dir = found.dir === "asc" ? "desc" : "asc";
      } else {
        newMultiSort = [found, ...newMultiSort.filter((s) => s.key !== key)];
      }
      setMultiSort(newMultiSort.slice(0, 3));
    });
  });
}
export function updateTableFooter() {
  // Pagination removed - no currentPage/rowsPerPage needed
  const footerInfo = document.getElementById("table-footer-info");
  if (!footerInfo) return;

  // Always clear footer info
  footerInfo.textContent = "";
}

// Debounce timers for filters
let globalFilterTimeout = null;
const columnFilterTimeouts = new Map();

/**
 * Connect event handlers for table filters
 */
export function connectFilterEventHandlers() {
  // Clear all existing timeouts
  if (globalFilterTimeout) {
    clearTimeout(globalFilterTimeout);
    globalFilterTimeout = null;
  }
  
  columnFilterTimeouts.forEach((timeout) => {
    clearTimeout(timeout);
  });
  columnFilterTimeouts.clear();
  
  // Connect global filter input
  const globalFilterInput = document.getElementById("table-filter-input");
  if (globalFilterInput) {
    // Remove existing listeners to avoid duplicates
    globalFilterInput.removeEventListener("input", handleGlobalFilterChangeDebounced);
    globalFilterInput.addEventListener("input", handleGlobalFilterChangeDebounced);
    if (DEBUG) console.log("🔧 Connected global filter event handler");
  }

  // Connect column filter inputs
  const filterRow = document.getElementById("column-filters-row");
  if (filterRow) {
    const inputs = filterRow.querySelectorAll("input");
    inputs.forEach((input) => {
      // Remove existing listeners to avoid duplicates
      input.removeEventListener("input", handleColumnFilterChangeDebounced);
      input.removeEventListener("input", handleColumnFilterChange);
      input.removeEventListener("change", handleColumnFilterChange);
      input.removeEventListener("compositionend", handleColumnFilterChange);
      // Debounced input processing to avoid UI overload
      input.addEventListener("input", handleColumnFilterChangeDebounced);
      input.addEventListener("change", handleColumnFilterChange);
      // Process after IME commits text (e.g., Cyrillic, CJK)
      input.addEventListener("compositionend", handleColumnFilterChange);
    });
    if (DEBUG) console.log(`🔧 Connected ${inputs.length} column filter event handlers (debounced)`);
  }
}

/**
 * Debounced global filter change handler
 */
function handleGlobalFilterChangeDebounced(event) {
  const value = event.target.value.trim();
  
  if (DEBUG) console.log(`🔍 Global filter debounced: "${value}"`);
  
  // Clear existing timeout
  if (globalFilterTimeout) {
    clearTimeout(globalFilterTimeout);
  }
  
  // If value is empty, process immediately (for clearing filters)
  if (!value) {
    if (DEBUG) console.log("🔍 Processing empty global filter immediately");
    handleGlobalFilterChange(event);
    return;
  }
  
  // Set new timeout for non-empty values
  const delay = getSearchDebounceMs ? getSearchDebounceMs() : 150;
  if (DEBUG) console.log("🔍 Setting timeout for global filter (ms)", delay);
  globalFilterTimeout = setTimeout(() => {
    if (DEBUG) console.log("🔍 Timeout triggered for global filter");
    handleGlobalFilterChange(event);
  }, delay);
}

/**
 * Debounced column filter change handler
 */
function handleColumnFilterChangeDebounced(event) {
  const key = event.target.dataset.filterKey;
  const value = event.target.value.trim();
  
  if (DEBUG) console.log(`🔍 Column filter debounced: ${key} = "${value}"`);
  
  // Clear existing timeout for this column
  if (columnFilterTimeouts.has(key)) {
    clearTimeout(columnFilterTimeouts.get(key));
  }
  
  // If value is empty, process immediately (for clearing filters)
  if (!value) {
    if (DEBUG) console.log(`🔍 Processing empty column filter immediately: ${key}`);
    handleColumnFilterChange(event);
    return;
  }
  
  // Set new timeout for non-empty values
  const delay = getSearchDebounceMs ? getSearchDebounceMs() : 150;
  if (DEBUG) console.log(`🔍 Setting timeout for column filter: ${key} (ms)`, delay);
  const timeout = setTimeout(() => {
    if (DEBUG) console.log(`🔍 Timeout triggered for column filter: ${key}`);
    handleColumnFilterChange(event);
    columnFilterTimeouts.delete(key);
  }, delay);
  
  columnFilterTimeouts.set(key, timeout);
}

/**
 * Handle global filter change
 */
function handleGlobalFilterChange(event) {
  const value = event.target.value.trim();
  const inputElement = event.target;
  
  if (DEBUG) console.log(`🔍 Global filter changed: "${value}"`);
  
  // Preserve scroll state and temporarily disable scroll anchoring
  const prevX = window.pageXOffset || 0;
  const prevY = window.pageYOffset || 0;
  const container = document.getElementById('virtual-scroll-container');
  const prevCX = container ? container.scrollLeft : null;
  const prevCY = container ? container.scrollTop : null;
  const root = document.documentElement;
  try { if (root) root.style.overflowAnchor = 'none'; } catch(_) {
      // Ignore table UI errors
    }
  try { if (document.body) document.body.style.overflowAnchor = 'none'; } catch(_) {
      // Ignore table UI errors
    }
  try { if (container) container.style.overflowAnchor = 'none'; } catch(_) {
      // Ignore table UI errors
    }
  const restoreScroll = () => {
    // Restore previous scroll positions on next frames (container first, then window)
    requestAnimationFrame(() => {
      try { if (container && prevCY != null) container.scrollTop = prevCY; if (container && prevCX != null) container.scrollLeft = prevCX; } catch (_) {
        // Ignore scroll restore errors
      }
      requestAnimationFrame(() => {
        try { window.scrollTo(prevX, prevY); } catch (_) {
          // Ignore scroll errors
        }
        // Re-enable scroll anchoring
        try { if (root) root.style.overflowAnchor = ''; } catch(_) {
      // Ignore table UI errors
    }
        try { if (document.body) document.body.style.overflowAnchor = ''; } catch(_) {
      // Ignore table UI errors
    }
        try { if (container) container.style.overflowAnchor = ''; } catch(_) {
      // Ignore table UI errors
    }
      });
    });
    // Fallbacks
    Promise.resolve().then(() => {
      try {
        if (container && prevCY != null) container.scrollTop = prevCY;
        if (container && prevCX != null) container.scrollLeft = prevCX;
        window.scrollTo(prevX, prevY);
        if (root) root.style.overflowAnchor = '';
        if (document.body) document.body.style.overflowAnchor = '';
        if (container) container.style.overflowAnchor = '';
      } catch (_) {
        // Ignore scroll restore errors
      }
    });
    setTimeout(() => {
      try {
        if (container && prevCY != null) container.scrollTop = prevCY;
        if (container && prevCX != null) container.scrollLeft = prevCX;
        window.scrollTo(prevX, prevY);
        if (root) root.style.overflowAnchor = '';
        if (document.body) document.body.style.overflowAnchor = '';
        if (container) container.style.overflowAnchor = '';
      } catch (_) {
        // Ignore scroll restore errors
      }
    }, 50);
  };

  // Save focus state
  const wasFocused = document.activeElement === inputElement;
  const cursorPosition = inputElement.selectionStart;
  
  // Import setGlobalFilter dynamically to avoid circular imports
  import("../state/tableState.js").then(({ setGlobalFilter }) => {
    // Set the global filter
    setGlobalFilter(value);
    // Attempt to restore scroll regardless of mode
    restoreScroll();
    
    // If virtual manager is active, refresh the table to show filtered/unfiltered data
    const vm = getVirtualManager();
    if (vm && vm.isActive) {
      if (DEBUG) console.log("🔄 Refreshing table after global filter change...");
      vm.refreshVirtualTable();
      
      // Restore focus after table refresh
      if (wasFocused) {
        requestAnimationFrame(() => {
          const newInput = document.getElementById("table-filter-input");
          if (newInput) {
            newInput.focus();
            const maxPosition = Math.min(cursorPosition, newInput.value.length);
            newInput.setSelectionRange(maxPosition, maxPosition);
            if (DEBUG) console.log("🔧 Restored focus to global filter input");
          }
          restoreScroll();
        });
      }
    }
  });
}

/**
 * Handle column filter change
 */
function handleColumnFilterChange(event) {
  const key = event.target.dataset.filterKey;
  const value = event.target.value.trim();
  const inputElement = event.target;
  
  if (DEBUG) console.log(`🔍 Column filter changed: ${key} = "${value}"`);
  
  // Preserve scroll state and temporarily disable scroll anchoring
  const prevX = window.pageXOffset || 0;
  const prevY = window.pageYOffset || 0;
  const container = document.getElementById('virtual-scroll-container');
  const prevCX = container ? container.scrollLeft : null;
  const prevCY = container ? container.scrollTop : null;
  const root = document.documentElement;
  try { if (root) root.style.overflowAnchor = 'none'; } catch(_) {
      // Ignore table UI errors
    }
  try { if (document.body) document.body.style.overflowAnchor = 'none'; } catch(_) {
      // Ignore table UI errors
    }
  try { if (container) container.style.overflowAnchor = 'none'; } catch(_) {
      // Ignore table UI errors
    }
  const restoreScroll = () => {
    requestAnimationFrame(() => {
      try { if (container && prevCY != null) container.scrollTop = prevCY; if (container && prevCX != null) container.scrollLeft = prevCX; } catch (_) {
        // Ignore scroll restore errors
      }
      requestAnimationFrame(() => {
        try { window.scrollTo(prevX, prevY); } catch (_) {
          // Ignore scroll errors
        }
        try { if (root) root.style.overflowAnchor = ''; } catch(_) {
      // Ignore table UI errors
    }
        try { if (document.body) document.body.style.overflowAnchor = ''; } catch(_) {
      // Ignore table UI errors
    }
        try { if (container) container.style.overflowAnchor = ''; } catch(_) {
      // Ignore table UI errors
    }
      });
    });
    Promise.resolve().then(() => {
      try {
        if (container && prevCY != null) container.scrollTop = prevCY;
        if (container && prevCX != null) container.scrollLeft = prevCX;
        window.scrollTo(prevX, prevY);
        if (root) root.style.overflowAnchor = '';
        if (document.body) document.body.style.overflowAnchor = '';
        if (container) container.style.overflowAnchor = '';
      } catch (_) {
        // Ignore scroll restore errors
      }
    });
    setTimeout(() => {
      try {
        if (container && prevCY != null) container.scrollTop = prevCY;
        if (container && prevCX != null) container.scrollLeft = prevCX;
        window.scrollTo(prevX, prevY);
        if (root) root.style.overflowAnchor = '';
        if (document.body) document.body.style.overflowAnchor = '';
        if (container) container.style.overflowAnchor = '';
      } catch (_) {
        // Ignore scroll restore errors
      }
    }, 50);
  };

  // Save focus state - use detail.cursorPosition if from floating proxy
  const wasFocused = document.activeElement === inputElement;
  const cursorPosition = event?.detail?.cursorPosition ?? inputElement.selectionStart ?? inputElement.value.length;
  const cursorEnd = inputElement.selectionEnd ?? cursorPosition;
  const fromFloating = Boolean(event?.detail?.fromFloating) || !!inputElement.closest('.floating-table-footer');
  const inputValue = inputElement.value; // save current value

  // Global pending focus (prevents race with async re-renders)
  try {
    window._pendingFilterFocus = { key, fromFloating, cursorPosition, cursorEnd, inputValue };
  } catch (_) { /* noop */ }
  
  // Import setColumnFilter dynamically to avoid circular imports
  import("../state/tableState.js").then(({ setColumnFilter }) => {
    // Set the filter (empty string will clear the filter)
    setColumnFilter(key, value);
    // Attempt to restore scroll regardless of mode
    restoreScroll();
    
    // If virtual manager is active, refresh the table to show filtered/unfiltered data
    const vmCol = getVirtualManager();
    if (vmCol && vmCol.isActive) {
      if (DEBUG) console.log("🔄 Refreshing table after filter change...");
      vmCol.refreshVirtualTable();
      // Extra safety: if processor says 0 rows, clear tbody immediately (surface behavior)
      import("../data/tableProcessor.js").then(({ getProcessedData }) => {
        try {
          const { pagedData } = getProcessedData();
          if (!pagedData || pagedData.length === 0) {
            const tbody = document.getElementById("tableBody");
            if (tbody) tbody.innerHTML = ""; // keep header/footer visible
          }
        } catch (e) { /* ignore */ }
      });
      
      // Restore focus after table refresh
      if (wasFocused || fromFloating) {
        // Use requestAnimationFrame for better timing
        requestAnimationFrame(() => {
          const selector = `input[data-filter-key="${key}"]`;
          const cont = fromFloating
            ? document.querySelector('.floating-table-footer tfoot')
            : document.querySelector('#summaryTable tfoot');
          const newInput = cont ? cont.querySelector(selector) : document.querySelector(selector);
          if (newInput) {
            // Restore value if it changed during async refresh
            if (newInput.value !== inputValue) {
              newInput.value = inputValue;
            }
            if (document.activeElement !== newInput) {
              newInput.focus();
            }
            // Restore cursor position
            const maxPos = newInput.value.length;
            const pos = Math.min(cursorPosition, maxPos);
            const end = Math.min(cursorEnd, maxPos);
            if (typeof newInput.setSelectionRange === 'function') {
              newInput.setSelectionRange(pos, end);
            }
            if (DEBUG) console.log(`🔧 Restored focus to ${fromFloating ? 'floating' : 'footer'} filter: ${key}`);
          }
          restoreScroll();
        });
      }
    }
  });
}

// Restore pending filter focus if any (used by virtual/standard refresh points)
try {
  if (!window.restoreFilterFocusIfPending) {
    window.restoreFilterFocusIfPending = function restoreFilterFocusIfPending() {
      const pending = window._pendingFilterFocus;
      if (!pending || !pending.key) return;
      const { key, fromFloating, cursorPosition, cursorEnd, inputValue } = pending;
      const selector = `input[data-filter-key="${key}"]`;
      const container = fromFloating
        ? document.querySelector('.floating-table-footer tfoot')
        : document.querySelector('#summaryTable tfoot');
      const target = container ? container.querySelector(selector) : document.querySelector(selector);
      if (target) {
        // Restore value if needed (prevent value loss during async refresh)
        if (inputValue !== undefined && target.value !== inputValue) {
          target.value = inputValue;
        }
        // Restore cursor position
        const pos = Math.min(cursorPosition ?? target.value.length, target.value.length);
        const end = Math.min(cursorEnd ?? pos, target.value.length);
        if (document.activeElement !== target) {
          target.focus();
        }
        if (typeof target.setSelectionRange === 'function') {
          target.setSelectionRange(pos, end);
        }
        // Clear after successful restore
        try { window._pendingFilterFocus = null; } catch (_) { /* intentional no-op */ }
      }
    };
  }
} catch (_) { /* noop */ }
