// static/js/dom/table.js
// Responsibility: Standard table rendering and interactions
import { getState, setColumnFilter, areYColumnsVisible } from '../state/tableState.js';
import { renderCoordinator } from '../rendering/render-coordinator.js';
import { renderMainRowString, renderPeerRowString, renderHourlyRowsString } from './table-renderers.js';
import { renderTableHeader, renderTableFooter, updateSortArrows } from './table-ui.js';
import { subscribe } from '../state/eventBus.js';
import { updateTopScrollbar } from './top-scrollbar.js';
import {
  buildMainGroupId, buildPeerGroupId,
  isMainExpanded, isPeerExpanded,
  toggleMain, togglePeer, resetExpansionState
} from '../state/expansionState.js';
import { getVirtualManager } from '../state/moduleRegistry.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const IDS = {
  tableBody: 'tableBody',
  table: 'summaryTable',
  filterRow: 'column-filters-row'
};

const SCROLLBAR_UPDATE_DELAY = 50;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// cache for normalized values to avoid repeated toLowerCase()
const normCache = new Map();
const NORM_CACHE_MAX = 10000;

function norm(v) {
  if (v == null) return '';
  const s = String(v).trim();
  // check cache
  let result = normCache.get(s);
  if (result === undefined) {
    result = s.toLowerCase();
    // limit cache size
    if (normCache.size < NORM_CACHE_MAX) {
      normCache.set(s, result);
    }
  }
  return result;
}

function uniqueBy(arr, keyFn) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const result = [];
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    const r = arr[i];
    const k = keyFn(r);
    if (!seen.has(k)) {
      seen.add(k);
      result.push(r);
    }
  }
  return result;
}

function getElement(id) {
  return document.getElementById(id);
}

// ─────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────

subscribe('appState:dataChanged', resetExpansionState);

export function resetRowOpenState() {
  resetExpansionState();
}

// ─────────────────────────────────────────────────────────────
// Table rendering
// ─────────────────────────────────────────────────────────────

function saveFocusState() {
  const active = document.activeElement;
  if (!active?.closest(`#${IDS.filterRow}`)) return null;
  return {
    key: active.dataset.filterKey,
    pos: active.selectionStart || 0
  };
}

function restoreFocusState(focusState) {
  if (!focusState?.key) return;
  const input = document.querySelector(`input[data-filter-key="${focusState.key}"]`);
  if (input) {
    input.focus();
    input.setSelectionRange(focusState.pos, focusState.pos);
  }
}

function updateYColumnsVisibility() {
  const table = getElement(IDS.table);
  if (table) {
    table.classList.toggle('y-columns-hidden', !areYColumnsVisible());
  }
}

function sortPeers(peers, multiSort) {
  if (!multiSort?.length) return peers;

  return [...peers].sort((a, b) => {
    for (const { key, dir } of multiSort) {
      let aVal = a[key] ?? '';
      let bVal = b[key] ?? '';

      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        if (aNum !== bNum) return dir === 'desc' ? bNum - aNum : aNum - bNum;
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
        if (aVal !== bVal) return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
    }
    return 0;
  });
}

function renderEmptyState(tbody) {
  const colCount = document.querySelectorAll(`#${IDS.table} th`).length;
  tbody.innerHTML = `<tr class="empty-state"><td colspan="${colCount}">No matches found</td></tr>`;
}

function applyMorphdom(tbody, html) {
  try {
    if (window.morphdom) {
      window.morphdom(tbody, `<tbody id="${IDS.tableBody}">${html}</tbody>`);
    } else {
      tbody.innerHTML = html;
    }
  } catch {
    tbody.innerHTML = html;
  }
}

export function renderGroupedTable(mainRows, peerRows, hourlyRows) {
  // dedupe
  const mRows = uniqueBy(mainRows, r => [norm(r?.main), norm(r?.destination)].join('|'));
  const pRows = uniqueBy(peerRows, r => [norm(r?.main), norm(r?.peer), norm(r?.destination)].join('|'));
  const hKey = (Array.isArray(hourlyRows) && hourlyRows[0]?.time !== undefined) ? 'time' : 'hour';
  const hRows = uniqueBy(hourlyRows, r => [norm(r?.main), norm(r?.peer), norm(r?.destination), norm(r?.[hKey])].join('|'));

  const focusState = saveFocusState();

  renderTableHeader();
  renderTableFooter();
  try { updateSortArrows(); } catch (e) { logError(ErrorCategory.TABLE, 'renderGroupedTable', e); }

  const tbody = getElement(IDS.tableBody);
  if (!tbody) return;
  tbody.innerHTML = '';

  updateYColumnsVisibility();

  if (!mRows?.length) {
    renderEmptyState(tbody);
  } else {
    const { columnFilters, multiSort } = getState();
    const peerFilter = columnFilters.peer?.toLowerCase();
    let html = '';

    mRows.forEach(mainRow => {
      const mainGroupId = buildMainGroupId(mainRow.main, mainRow.destination);
      const isMainOpen = isMainExpanded(mainGroupId);

      html += renderMainRowString(mainRow, { mainGroupId, isMainGroupOpen: isMainOpen });

      // cache normalized main values for comparison
      const mainNorm = norm(mainRow.main);
      const destNorm = norm(mainRow.destination);
      let peers = pRows.filter(p =>
        norm(p.main) === mainNorm && norm(p.destination) === destNorm
      );

      // apply peer filter only when collapsed
      if (peerFilter && !isMainOpen) {
        peers = peers.filter(p => (p.peer ?? '').toString().toLowerCase().includes(peerFilter));
      }

      peers = sortPeers(peers, multiSort);

      peers.forEach(peerRow => {
        const peerGroupId = buildPeerGroupId(peerRow.main, peerRow.peer, peerRow.destination);
        const isPeerOpen = isPeerExpanded(peerGroupId);

        html += renderPeerRowString(peerRow, { mainGroupId, peerGroupId, isMainGroupOpen: isMainOpen, isPeerGroupOpen: isPeerOpen });

        const hours = hRows.filter(h =>
          norm(h.main) === norm(peerRow.main) &&
          norm(h.peer) === norm(peerRow.peer) &&
          norm(h.destination) === norm(peerRow.destination)
        );

        html += renderHourlyRowsString(hours, { peerGroupId, isMainGroupOpen: isMainOpen, isPeerGroupOpen: isPeerOpen, parentPeer: peerRow });
      });
    });

    applyMorphdom(tbody, html);
  }

  updateSortArrows();
  restoreFocusState(focusState);
  setTimeout(updateTopScrollbar, SCROLLBAR_UPDATE_DELAY);
}

// ─────────────────────────────────────────────────────────────
// Table interactions
// ─────────────────────────────────────────────────────────────

async function redrawTable() {
  try {
    const ai = window.appInitializer || window.App?.appInitializer;
    if (ai?.tableController?.redrawTable) {
      ai.tableController.redrawTable();
    } else {
      const mod = await import('../dom/table.js');
      const app = await import('../data/tableProcessor.js');
      const { getMetricsData } = await import('../state/appState.js');
      const data = getMetricsData();
      const { pagedData } = app.getProcessedData();
      mod.renderGroupedTable(pagedData || [], data?.peer_rows || [], data?.hourly_rows || []);
    }
  } catch (e) {
    logError(ErrorCategory.TABLE, 'redrawTable', e);
  }
}

function handleToggleClick(event, btn) {
  event.preventDefault();
  event.stopPropagation();
  try { btn.blur(); } catch {}

  const row = btn.closest('tr');
  if (!row) return;

  const groupId = btn.dataset.targetGroup;
  if (row.classList.contains('main-row')) {
    toggleMain(groupId);
  } else if (row.classList.contains('peer-row')) {
    togglePeer(groupId);
  }

  renderCoordinator.requestRender('table', redrawTable, { debounceMs: 0, cooldownMs: 0 });
}

function handlePeerRowClick(event, row) {
  const vm = getVirtualManager();
  if (vm?.isActive) return;

  const innerBtn = row.querySelector('.toggle-btn');
  if (innerBtn && !event.target.closest('.toggle-btn')) {
    try { innerBtn.click(); } catch {}
    event.preventDefault();
    event.stopPropagation();
  }
}

function handleRowSelection(tbody, row) {
  if (!row || !tbody.contains(row)) return;

  const selected = tbody.querySelector('tr.row-selected');
  if (selected) selected.classList.remove('row-selected');

  if (row !== selected) {
    row.classList.add('row-selected');
  }
}

function handleCellDoubleClick(event) {
  const cell = event.target.closest('td');
  if (!cell || event.target.closest('.toggle-btn') || cell.querySelector('.datetime-cell-container')) {
    return;
  }

  const value = (cell.dataset.filterValue || cell.textContent).trim();
  if (!value || value === '-') return;

  const headerCell = document.querySelector(`#${IDS.table} th:nth-child(${cell.cellIndex + 1})`);
  const filterKey = headerCell?.dataset.sortKey;
  if (!filterKey) return;

  const input = document.querySelector(`#${IDS.filterRow} input[data-filter-key="${filterKey}"]`);
  if (!input) return;

  input.value = value;
  setColumnFilter(filterKey, value);
}

export function initTableInteractions() {
  const tbody = getElement(IDS.tableBody);
  if (!tbody) return;

  tbody.addEventListener('click', (event) => {
    const vm = getVirtualManager();
    if (vm?.isActive) return;

    const toggleBtn = event.target.closest('.toggle-btn');
    if (toggleBtn) {
      handleToggleClick(event, toggleBtn);
      return;
    }

    const row = event.target.closest('tr');
    if (row?.classList.contains('peer-row')) {
      handlePeerRowClick(event, row);
      return;
    }

    handleRowSelection(tbody, row);
  });

  tbody.addEventListener('dblclick', handleCellDoubleClick);
}
