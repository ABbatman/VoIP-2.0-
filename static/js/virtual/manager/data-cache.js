// static/js/virtual/manager/data-cache.js
// Responsibility: Data indices and cache lifecycle for virtualization
import { getState } from '../../state/tableState.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const sanitize = x => (x ?? '').toString().replace(/\s+/g, '-').replace(/[^a-z0-9\-_.]/gi, '');
const buildId = (prefix, ...parts) => `${prefix}-${parts.map(sanitize).join('-')}`;

// ─────────────────────────────────────────────────────────────
// Attach to VirtualManager
// ─────────────────────────────────────────────────────────────

export function attachData(vm) {
  // ensure caches exist
  function ensureCaches() {
    vm._mainFilterPass ??= new Map();
    vm._peerRowsCache ??= new Map();
    vm._hourlyRowsCache ??= new Map();
    vm.openMainGroups ??= new Set();
    vm.openHourlyGroups ??= new Set();
  }

  function clearCaches() {
    vm._filterSortKey = '';
    vm._mainFilterPass.clear();
    vm._peerRowsCache.clear();
    vm._hourlyRowsCache.clear();
  }

  function _computeFilterSortKey() {
    try {
      const state = getState();
      const sortState = vm.sorting?.getCurrentTableState?.() || { multiSort: [] };
      return JSON.stringify({
        columnFilters: state.columnFilters || {},
        global: (state.globalFilterQuery || '').trim().toLowerCase(),
        sort: sortState.multiSort || []
      });
    } catch (e) {
      logError(ErrorCategory.TABLE, 'dataCache:filterSortKey', e);
      return '';
    }
  }

  // ───────────────────────────────────────────────────────────
  // Index builders
  // ───────────────────────────────────────────────────────────

  function createMainIndex(rows) {
    return (rows || []).map((row, index) => ({
      index,
      groupId: buildId('main', row.main, row.destination),
      main: row.main,
      destination: row.destination,
      level: 0,
      hasChildren: true
    }));
  }

  function createPeerIndex(rows) {
    return (rows || []).map((row, index) => ({
      index,
      groupId: buildId('peer', row.main, row.peer, row.destination),
      parentId: buildId('main', row.main, row.destination),
      main: row.main,
      peer: row.peer,
      destination: row.destination,
      level: 1,
      hasChildren: true
    }));
  }

  function createHourlyIndex(rows) {
    return (rows || []).map((row, index) => ({
      index,
      groupId: buildId('hour', row.main, row.peer, row.destination, index),
      parentId: buildId('peer', row.main, row.peer, row.destination),
      main: row.main,
      peer: row.peer,
      destination: row.destination,
      date: row.date || row.Date || row.time || row.datetime || row.timestamp,
      level: 2,
      hasChildren: false
    }));
  }

  // ───────────────────────────────────────────────────────────
  // Init
  // ───────────────────────────────────────────────────────────

  function initializeLazyData() {
    ensureCaches();
    const { mainRows = [], peerRows = [], hourlyRows = [] } = vm.rawData || {};

    vm.lazyData = {
      mainRowsCount: mainRows.length,
      peerRowsCount: peerRows.length,
      hourlyRowsCount: hourlyRows.length,
      mainIndex: createMainIndex(mainRows),
      peerIndex: createPeerIndex(peerRows),
      hourlyIndex: createHourlyIndex(hourlyRows)
    };

    clearCaches();
  }

  // ───────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────

  return {
    _computeFilterSortKey,
    initializeLazyData,
    createMainIndex,
    createPeerIndex,
    createHourlyIndex,
    getTotalDataCount: () => {
      const ld = vm.lazyData;
      return ld ? (ld.mainRowsCount || 0) + (ld.peerRowsCount || 0) + (ld.hourlyRowsCount || 0) : 0;
    },
    getMainRowLazy: index => vm.rawData?.mainRows?.[index]
  };
}
