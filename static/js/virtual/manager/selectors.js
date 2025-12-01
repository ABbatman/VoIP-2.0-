// static/js/virtual/manager/selectors.js
// Responsibility: Compute visible slice for virtualization with lazy accessors and memoization
import { getState } from '../../state/tableState.js';
import { getProcessedData } from '../../data/tableProcessor.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const norm = v => (v == null ? '' : String(v).trim().toLowerCase());

const TWO_CHAR_OPS = new Set(['>=', '<=', '!=']);
const ONE_CHAR_OPS = new Set(['>', '<', '=']);

function parseNumber(val) {
  if (val == null) return NaN;
  if (typeof val === 'number') return val;
  const n = parseFloat(val.toString().replace(/[\s,]/g, ''));
  return isNaN(n) ? NaN : n;
}

function passesColumnFilter(value, filter) {
  const trimmed = (filter || '').toString().trim();
  if (!trimmed) return true;

  const numVal = parseNumber(value);
  const twoOp = trimmed.slice(0, 2);
  const oneOp = trimmed[0];
  const parseOp = str => parseFloat(str.trim());

  if (TWO_CHAR_OPS.has(twoOp)) {
    const num = parseOp(trimmed.slice(2));
    if (isNaN(num) || isNaN(numVal)) return true;
    if (twoOp === '>=') return numVal >= num;
    if (twoOp === '<=') return numVal <= num;
    if (twoOp === '!=') return numVal !== num;
  }

  if (ONE_CHAR_OPS.has(oneOp)) {
    const num = parseOp(trimmed.slice(1));
    if (isNaN(num) || isNaN(numVal)) return true;
    if (oneOp === '>') return numVal > num;
    if (oneOp === '<') return numVal < num;
    if (oneOp === '=') return numVal === num;
  }

  // numeric comparison (>=) or substring match
  const numFilter = parseOp(trimmed);
  if (!isNaN(numFilter) && !isNaN(numVal)) return numVal >= numFilter;
  return (value ?? '').toString().toLowerCase().includes(trimmed.toLowerCase());
}

function uniqueByKey(arr, keyFn) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  return arr.filter(r => { const k = keyFn(r); if (seen.has(k)) return false; seen.add(k); return true; });
}

function filtersKey() {
  try {
    const st = getState();
    const cf = st?.columnFilters || {};
    const gf = (st?.globalFilterQuery || '').trim().toLowerCase();
    const parts = Object.keys(cf).sort().map(k => `${k}:${(cf[k] ?? '').toString().trim()}`);
    parts.push(`__g:${gf}`);
    return parts.join('|');
  } catch (e) {
    logError(ErrorCategory.TABLE, 'selectors:filtersKey', e);
    return '';
  }
}

// ─────────────────────────────────────────────────────────────
// Attach to VirtualManager
// ─────────────────────────────────────────────────────────────

export function attachSelectors(vm) {
  // ensure key caches
  vm._peerKeyCache ??= new Map();
  vm._hourKeyCache ??= new Map();
  // ───────────────────────────────────────────────────────────
  // Cache management
  // ───────────────────────────────────────────────────────────

  function clearAllCaches() {
    vm._mainFilterPass?.clear();
    vm._peerRowsCache?.clear();
    vm._hourlyRowsCache?.clear();
  }

  function computeAndResetCachesIfNeeded() {
    // check filter/sort key
    if (typeof vm._computeFilterSortKey === 'function') {
      const key = vm._computeFilterSortKey();
      if (key !== vm._filterSortKey) {
        vm._filterSortKey = key;
        clearAllCaches();
      }
    }

    // also check filters independently
    try {
      const fk = filtersKey();
      if (vm._lastFiltersKey !== fk) {
        vm._lastFiltersKey = fk;
        clearAllCaches();
      }
    } catch (e) {
      logError(ErrorCategory.TABLE, 'selectors:cacheReset', e);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Row key generation
  // ───────────────────────────────────────────────────────────

  function rowKey(r) {
    const t = r.type || (Number.isFinite(r.level) ? (r.level === 0 ? 'main' : r.level === 1 ? 'peer' : 'hourly') : 'row');
    if (t === 'main') return `m|${norm(r.main)}|${norm(r.destination)}`;
    if (t === 'peer') return `p|${norm(r.main)}|${norm(r.peer)}|${norm(r.destination)}`;
    const timeVal = r.time || r.hour || r.date || r.datetime || r.timestamp;
    return `h|${norm(r.main)}|${norm(r.peer)}|${norm(r.destination)}|${norm(timeVal)}`;
  }

  // ───────────────────────────────────────────────────────────
  // Main row filter check
  // ───────────────────────────────────────────────────────────

  function checkMainRowPass(mainRowData, mainMeta, columnFilters, globalFilter) {
    // text filters
    const mainFilter = (columnFilters?.main || '').trim().toLowerCase();
    if (mainFilter && !(mainRowData.main || '').toString().toLowerCase().includes(mainFilter)) return false;

    const destFilter = (columnFilters?.destination || '').trim().toLowerCase();
    if (destFilter && !(mainRowData.destination || '').toString().toLowerCase().includes(destFilter)) return false;

    // other column filters (except peer)
    for (const k in columnFilters) {
      if (k === 'peer') continue;
      const f = (columnFilters[k] ?? '').toString();
      if (f && !passesColumnFilter(mainRowData[k], f)) return false;
    }

    // peer filter: check children
    const peerFilter = (columnFilters?.peer || '').toString().trim().toLowerCase();
    if (peerFilter) {
      const hasMatch = vm.lazyData.peerIndex.some(p => p.parentId === mainMeta.groupId && (p.peer ?? '').toString().toLowerCase().includes(peerFilter));
      if (!hasMatch) return false;
    }

    // global filter
    if (globalFilter) {
      const mainText = norm(mainRowData.main);
      const peerText = norm(mainRowData.peer);
      const destText = norm(mainRowData.destination);
      if (!mainText.includes(globalFilter) && !peerText.includes(globalFilter) && !destText.includes(globalFilter)) return false;
    }

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // getLazyVisibleData
  // ───────────────────────────────────────────────────────────

  function getLazyVisibleData() {
    computeAndResetCachesIfNeeded();

    // get current filters
    let columnFilters = {};
    let globalFilter = '';
    try {
      const state = getState();
      columnFilters = state.columnFilters || {};
      globalFilter = (state.globalFilterQuery || '').trim().toLowerCase();
    } catch (e) {
      logError(ErrorCategory.TABLE, 'selectors:getFilters', e);
    }

    // short-circuit if no data
    try {
      const { pagedData } = getProcessedData();
      if (!pagedData?.length) return [];
    } catch (e) {
      logError(ErrorCategory.TABLE, 'selectors:getProcessed', e);
    }

    const visibleData = [];
    const seen = new Set();

    vm.lazyData.mainIndex.forEach(mainMeta => {
      const fullRow = vm.getMainRowLazy(mainMeta.index);
      const mainRowData = { ...fullRow, ...mainMeta, type: 'main' };

      // memoized filter pass
      if (!vm._mainFilterPass.has(mainMeta.groupId)) {
        vm._mainFilterPass.set(mainMeta.groupId, checkMainRowPass(mainRowData, mainMeta, columnFilters, globalFilter));
      }
      if (!vm._mainFilterPass.get(mainMeta.groupId)) return;

      // add main row
      const mk = rowKey(mainRowData);
      if (!seen.has(mk)) { seen.add(mk); visibleData.push(mainRowData); }

      // expanded peers
      if (vm.openMainGroups.has(mainMeta.groupId)) {
        getPeerRowsLazy(mainMeta.groupId).forEach(peerRow => {
          const pk = rowKey(peerRow);
          if (!seen.has(pk)) { seen.add(pk); visibleData.push(peerRow); }

          // expanded hourly
          if (vm.openHourlyGroups.has(peerRow.groupId)) {
            getHourlyRowsLazy(peerRow.groupId).forEach(h => {
              const hk = rowKey(h);
              if (!seen.has(hk)) { seen.add(hk); visibleData.push(h); }
            });
          }
        });
      }
    });

    return visibleData;
  }

  // ───────────────────────────────────────────────────────────
  // Peer/Hourly key builders
  // ───────────────────────────────────────────────────────────

  function peerKeyOf(r) {
    const idx = r.index ?? r._rawIndex ?? null;
    if (idx != null) {
      let k = vm._peerKeyCache.get(idx);
      if (!k) { k = [norm(r.main), norm(r.peer), norm(r.destination)].join('|'); vm._peerKeyCache.set(idx, k); }
      return k;
    }
    return [norm(r.main), norm(r.peer), norm(r.destination)].join('|');
  }

  function hourKeyOf(r, timeKey) {
    const idx = r.index ?? r._rawIndex ?? null;
    if (idx != null) {
      let k = vm._hourKeyCache.get(idx);
      if (!k) { k = [norm(r.main), norm(r.peer), norm(r.destination), norm(r[timeKey])].join('|'); vm._hourKeyCache.set(idx, k); }
      return k;
    }
    return [norm(r.main), norm(r.peer), norm(r.destination), norm(r[timeKey])].join('|');
  }

  // ───────────────────────────────────────────────────────────
  // Generic row filter
  // ───────────────────────────────────────────────────────────

  function filterRows(rows, columnFilters, globalFilter) {
    return rows.filter(r => {
      for (const k in columnFilters) {
        const f = (columnFilters[k] ?? '').toString();
        if (f && !passesColumnFilter(r[k], f)) return false;
      }
      if (globalFilter) {
        const texts = [norm(r.main), norm(r.peer), norm(r.destination)];
        if (!texts.some(t => t.includes(globalFilter))) return false;
      }
      return true;
    });
  }

  // ───────────────────────────────────────────────────────────
  // getPeerRowsLazy
  // ───────────────────────────────────────────────────────────

  function getPeerRowsLazy(mainGroupId) {
    const cacheKey = `${vm._filterSortKey}|${filtersKey()}|${mainGroupId}`;
    const mainOpen = vm.openMainGroups?.has?.(mainGroupId);

    if (!mainOpen && vm._peerRowsCache.has(cacheKey)) return vm._peerRowsCache.get(cacheKey);

    // build peer rows
    const peerMetas = vm.lazyData.peerIndex.filter(p => p.parentId === mainGroupId);
    const peerRows = peerMetas.map(meta => ({ ...vm.rawData.peerRows[meta.index], ...meta, type: 'peer' }));
    let base = uniqueByKey(peerRows, peerKeyOf);

    // if main is open, skip filters
    if (mainOpen) {
      const result = uniqueByKey(vm.applySortingToPeerRows(base), peerKeyOf);
      vm._peerRowsCache.set(cacheKey, result);
      return result;
    }

    // apply filters
    try {
      const { columnFilters, globalFilterQuery } = getState();
      const globalFilter = (globalFilterQuery || '').trim().toLowerCase();
      const filtered = filterRows(base, columnFilters || {}, globalFilter);
      const result = uniqueByKey(vm.applySortingToPeerRows(filtered), peerKeyOf);
      vm._peerRowsCache.set(cacheKey, result);
      return result;
    } catch (e) {
      logError(ErrorCategory.TABLE, 'selectors:peerFilter', e);
    }

    const result = uniqueByKey(vm.applySortingToPeerRows(base), peerKeyOf);
    vm._peerRowsCache.set(cacheKey, result);
    return result;
  }

  // ───────────────────────────────────────────────────────────
  // getHourlyRowsLazy
  // ───────────────────────────────────────────────────────────

  function getHourlyRowsLazy(peerGroupId) {
    const cacheKey = `${vm._filterSortKey}|${filtersKey()}|${peerGroupId}`;
    const peerOpen = vm.openHourlyGroups?.has?.(peerGroupId);

    if (!peerOpen && vm._hourlyRowsCache.has(cacheKey)) return vm._hourlyRowsCache.get(cacheKey);

    // build hourly rows
    const hourlyMetas = vm.lazyData.hourlyIndex.filter(h => h.parentId === peerGroupId);
    const hourlyRows = hourlyMetas.map(meta => ({ ...vm.rawData.hourlyRows[meta.index], ...meta, type: 'hourly' }));

    const timeKey = hourlyRows[0]?.time !== undefined ? 'time' : 'hour';
    const keyFn = r => hourKeyOf(r, timeKey);
    let base = uniqueByKey(hourlyRows, keyFn);

    // if peer is open, skip filters
    if (peerOpen) {
      const result = uniqueByKey(vm.applySortingToHourlyRows(base), keyFn);
      vm._hourlyRowsCache.set(cacheKey, result);
      return result;
    }

    // apply filters
    try {
      const { columnFilters, globalFilterQuery } = getState();
      const globalFilter = (globalFilterQuery || '').trim().toLowerCase();
      const filtered = filterRows(base, columnFilters || {}, globalFilter);
      const result = uniqueByKey(vm.applySortingToHourlyRows(filtered), keyFn);
      vm._hourlyRowsCache.set(cacheKey, result);
      return result;
    } catch (e) {
      logError(ErrorCategory.TABLE, 'selectors:hourlyFilter', e);
    }

    const result = uniqueByKey(vm.applySortingToHourlyRows(base), keyFn);
    vm._hourlyRowsCache.set(cacheKey, result);
    return result;
  }

  // ───────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────

  return {
    getLazyVisibleData,
    getPeerRowsLazy,
    getHourlyRowsLazy,
    getFilterSortKey: () => vm._computeFilterSortKey?.() ?? vm._filterSortKey ?? '',
    clearCaches: clearAllCaches
  };
}
