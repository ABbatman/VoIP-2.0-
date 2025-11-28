// static/js/virtual/manager/data-cache.js
// Layer: data + cache helpers (indices, keys, caches lifecycle)

import { getState } from '../../state/tableState.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

function sanitizeIdPart(x) {
  return (x ?? '').toString().replace(/\s+/g, '-').replace(/[^a-z0-9\-_.]/gi, '');
}

export function attachData(vm) {
  function ensureCaches() {
    if (!vm._mainFilterPass) vm._mainFilterPass = new Map();
    if (!vm._peerRowsCache) vm._peerRowsCache = new Map();
    if (!vm._hourlyRowsCache) vm._hourlyRowsCache = new Map();
    if (!vm.openMainGroups) vm.openMainGroups = new Set();
    if (!vm.openHourlyGroups) vm.openHourlyGroups = new Set();
  }

  function _computeFilterSortKey() {
    try {
      const state = getState();
      const tableState = vm.sorting && vm.sorting.getCurrentTableState ? vm.sorting.getCurrentTableState() : { multiSort: [] };
      return JSON.stringify({
        columnFilters: state.columnFilters || {},
        global: (state.globalFilterQuery || '').trim().toLowerCase(),
        sort: tableState.multiSort || []
      });
    } catch (e) { logError(ErrorCategory.TABLE, 'dataCache', e);
      return '';
    }
  }

  function initializeLazyData() {
    ensureCaches();
    const { mainRows, peerRows, hourlyRows } = vm.rawData || { mainRows: [], peerRows: [], hourlyRows: [] };
    vm.lazyData = {
      mainRowsCount: mainRows.length,
      peerRowsCount: peerRows.length,
      hourlyRowsCount: hourlyRows.length,
      mainIndex: createMainIndex(mainRows),
      peerIndex: createPeerIndex(peerRows),
      hourlyIndex: createHourlyIndex(hourlyRows)
    };
    // Reset caches when data changes
    vm._filterSortKey = '';
    vm._mainFilterPass.clear();
    vm._peerRowsCache.clear();
    vm._hourlyRowsCache.clear();
  }

  function createMainIndex(mainRows) {
    return (mainRows || []).map((row, index) => ({
      index,
      groupId: `main-${sanitizeIdPart(row.main)}-${sanitizeIdPart(row.destination)}`,
      main: row.main,
      destination: row.destination,
      level: 0,
      hasChildren: true
    }));
  }

  function createPeerIndex(peerRows) {
    return (peerRows || []).map((row, globalIndex) => {
      const parentId = `main-${sanitizeIdPart(row.main)}-${sanitizeIdPart(row.destination)}`;
      return {
        index: globalIndex,
        groupId: `peer-${sanitizeIdPart(row.main)}-${sanitizeIdPart(row.peer)}-${sanitizeIdPart(row.destination)}`,
        parentId,
        main: row.main,
        peer: row.peer,
        destination: row.destination,
        level: 1,
        hasChildren: true
      };
    });
  }

  function createHourlyIndex(hourlyRows) {
    return (hourlyRows || []).map((row, index) => {
      const parentId = `peer-${sanitizeIdPart(row.main)}-${sanitizeIdPart(row.peer)}-${sanitizeIdPart(row.destination)}`;
      return {
        index,
        groupId: `hour-${sanitizeIdPart(row.main)}-${sanitizeIdPart(row.peer)}-${sanitizeIdPart(row.destination)}-${index}`,
        parentId,
        main: row.main,
        peer: row.peer,
        destination: row.destination,
        date: row.date || row.Date || row.time || row.datetime || row.timestamp,
        level: 2,
        hasChildren: false
      };
    });
  }

  return {
    _computeFilterSortKey,
    initializeLazyData,
    createMainIndex,
    createPeerIndex,
    createHourlyIndex,
    getTotalDataCount: () => {
      const ld = vm.lazyData;
      if (!ld) return 0;
      return (ld.mainRowsCount || 0) + (ld.peerRowsCount || 0) + (ld.hourlyRowsCount || 0);
    },
    getMainRowLazy: (index) => {
      const rows = (vm.rawData && vm.rawData.mainRows) ? vm.rawData.mainRows : [];
      return rows[index];
    },
  };
}
