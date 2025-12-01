// static/js/dom/table-controls.js
// Responsibility: Table UI controls (expand/collapse, filters)
import {
  setFullData,
  setColumnFilter,
  resetAllFilters,
  setMultiSort
} from '../state/tableState.js';
import { expandAllPeers, collapseAllPeers } from '../table/features/bulkToggle.js';
import { showTableControls, updateSortArrows } from './table-ui.js';
import { updateTopScrollbar } from './top-scrollbar.js';
import { getVirtualManager } from '../state/moduleRegistry.js';
import { logWarn, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const IDS = {
  expandCollapseBtn: 'btnExpandCollapseAll',
  tableBody: 'tableBody',
  globalFilter: 'table-filter-input',
  filterRow: 'column-filters-row'
};

const DEFAULT_SORT = [
  { key: 'destination', dir: 'asc' },
  { key: 'main', dir: 'asc' }
];

const SCROLLBAR_UPDATE_DELAY = 100;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getElement(id) {
  return document.getElementById(id);
}

function refreshVirtualTable() {
  const vm = getVirtualManager();
  if (vm?.isActive) {
    vm.refreshVirtualTable();
  }
}

async function reconnectFilterHandlers() {
  try {
    const { connectFilterEventHandlers } = await import('./table-ui.js');
    if (typeof connectFilterEventHandlers === 'function') {
      connectFilterEventHandlers();
    }
  } catch {
    // filter handlers reconnection failed
  }
}

// ─────────────────────────────────────────────────────────────
// Expand/Collapse All
// ─────────────────────────────────────────────────────────────

function initExpandCollapseAll() {
  const btn = getElement(IDS.expandCollapseBtn);
  if (!btn) return;

  // clone to remove old listeners
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', () => {
    const isShowAll = newBtn.dataset.state !== 'shown' || newBtn.textContent === 'Show All';

    if (isShowAll) {
      expandAllPeers();
    } else {
      collapseAllPeers();
    }

    setTimeout(updateTopScrollbar, SCROLLBAR_UPDATE_DELAY);
  });
}

// ─────────────────────────────────────────────────────────────
// Filter clearing
// ─────────────────────────────────────────────────────────────

function clearFilterInputs() {
  const globalInput = getElement(IDS.globalFilter);
  if (globalInput) globalInput.value = '';

  const filterRow = getElement(IDS.filterRow);
  if (filterRow) {
    // use indexed loop instead of forEach
    const inputs = filterRow.querySelectorAll('input');
    const len = inputs.length;
    for (let i = 0; i < len; i++) {
      inputs[i].value = '';
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initTableControls(mainRows, peerRows, hourlyRows = []) {
  setFullData(mainRows, peerRows, hourlyRows);

  initExpandCollapseAll();
  showTableControls();

  try {
    setMultiSort(DEFAULT_SORT);
  } catch {
    logWarn(ErrorCategory.TABLE, 'initTableControls', 'Could not set default sort');
  }

  updateSortArrows();
  setupAutoFilterClearing();
}

export function clearAllTableFilters() {
  resetAllFilters();
  clearFilterInputs();
  refreshVirtualTable();
  reconnectFilterHandlers();
}

export function setupAutoFilterClearing() {
  // handled by table-ui.js filter handlers
}

export function clearColumnFilter(columnKey) {
  setColumnFilter(columnKey, '');

  const filterRow = getElement(IDS.filterRow);
  const input = filterRow?.querySelector(`input[data-filter-key="${columnKey}"]`);
  if (input) input.value = '';

  refreshVirtualTable();
}
