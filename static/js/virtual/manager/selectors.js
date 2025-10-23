// static/js/virtual/manager/selectors.js
// Layer: selectors (visibility + data access)
// Goal: encapsulate logic that computes the visible slice for virtualization and
// provides lazy accessors for peer/hourly rows with memoization.
//
// Phase 1 (current): non-invasive shim. We expose a facade that binds to the
// existing methods on VirtualManager so we can start calling through a stable
// layer without changing behavior. In Phase 2 we'll move the implementations
// here and delete the originals from VirtualManager.

/**
 * Create a selectors facade bound to a given VirtualManager instance.
 * This is intentionally thin for Phase 1 to avoid behavior changes.
 */
import { getState } from '../../state/tableState.js';
import { getProcessedData } from '../../data/tableProcessor.js';

// Lightweight logger mirroring VM behavior
function logDebug(...args) {
  try { if (typeof window !== 'undefined' && window.DEBUG) console.log(...args); } catch (_) {}
}

export function attachSelectors(vm) {
  const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());
  // Build a stable key representing current filter state for cache separation
  function filtersKey() {
    try {
      const st = getState();
      const cf = st && st.columnFilters ? st.columnFilters : {};
      const gf = (st && st.globalFilterQuery ? String(st.globalFilterQuery) : '').trim().toLowerCase();
      // Sort keys for stability
      const keys = Object.keys(cf).sort();
      const parts = keys.map(k => `${k}:${(cf[k] ?? '').toString().trim()}`);
      parts.push(`__g:${gf}`);
      return parts.join('|');
    } catch(_) { return ''; }
  }
  // Caches for normalized natural keys by raw index
  if (!vm._peerKeyCache) vm._peerKeyCache = new Map(); // idx -> key
  if (!vm._hourKeyCache) vm._hourKeyCache = new Map(); // idx -> key (incl time)
  const uniqueByKeyFn = (arr, keyFn) => {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    const out = [];
    for (const r of arr) {
      const k = keyFn(r);
      if (!seen.has(k)) { seen.add(k); out.push(r); }
    }
    return out;
  };

  function _parseNumber(val) {
    if (val == null) return NaN;
    if (typeof val === 'number') return val;
    const cleaned = val.toString().replace(/\s+/g, '').replace(/,/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? NaN : n;
  }

  function _passesColumnFilter(value, filter) {
    const trimmed = (filter || '').toString().trim();
    const numericValue = _parseNumber(value);
    const twoCharOp = trimmed.slice(0, 2);
    const oneCharOp = trimmed[0];
    const tryNumber = (str) => parseFloat(str.trim());
    if ([">=", "<=", "!="].includes(twoCharOp)) {
      const number = tryNumber(trimmed.slice(2));
      if (isNaN(number) || isNaN(numericValue)) return true;
      switch (twoCharOp) {
        case ">=": return numericValue >= number;
        case "<=": return numericValue <= number;
        case "!=": return numericValue !== number;
      }
    }
    if ([">", "<", "="].includes(oneCharOp)) {
      const number = tryNumber(trimmed.slice(1));
      if (isNaN(number) || isNaN(numericValue)) return true;
      switch (oneCharOp) {
        case ">": return numericValue > number;
        case "<": return numericValue < number;
        case "=": return numericValue === number;
      }
    }
    if (!isNaN(tryNumber(trimmed)) && !isNaN(numericValue)) {
      return numericValue >= tryNumber(trimmed);
    }
    return (value ?? '').toString().toLowerCase().includes(trimmed.toLowerCase());
  }
  function computeAndResetCachesIfNeeded() {
    if (typeof vm._computeFilterSortKey === 'function') {
      const key = vm._computeFilterSortKey();
      if (key !== vm._filterSortKey) {
        vm._filterSortKey = key;
        try { vm._mainFilterPass?.clear(); } catch (_) {}
        try { vm._peerRowsCache?.clear(); } catch (_) {}
        try { vm._hourlyRowsCache?.clear(); } catch (_) {}
      }
    }
    // Also reset caches if filters have changed (independent of sort key)
    try {
      const fk = filtersKey();
      if (vm._lastFiltersKey !== fk) {
        vm._lastFiltersKey = fk;
        try { vm._mainFilterPass?.clear(); } catch (_) {}
        try { vm._peerRowsCache?.clear(); } catch (_) {}
        try { vm._hourlyRowsCache?.clear(); } catch (_) {}
      }
    } catch(_) {}
  }

  function getLazyVisibleData() {
    const visibleData = [];
    const seen = new Set();
    const keyOf = (r) => {
      const t = r.type || (Number.isFinite(r.level) ? (r.level === 0 ? 'main' : r.level === 1 ? 'peer' : 'hourly') : 'row');
      if (t === 'main') return `m|${norm(r.main)}|${norm(r.destination)}`;
      if (t === 'peer') return `p|${norm(r.main)}|${norm(r.peer)}|${norm(r.destination)}`;
      const timeVal = r.time || r.hour || r.date || r.datetime || r.timestamp;
      return `h|${norm(r.main)}|${norm(r.peer)}|${norm(r.destination)}|${norm(timeVal)}`;
    };
    const loadedCounts = { main: 0, peer: 0, hourly: 0 };

    computeAndResetCachesIfNeeded();

    // Current filters
    let columnFilters = {};
    let globalFilter = '';
    try {
      const state = getState();
      columnFilters = state.columnFilters || {};
      globalFilter = (state.globalFilterQuery || '').trim().toLowerCase();
    } catch (_) {}

    // If processed says empty, short-circuit
    try {
      const { pagedData } = getProcessedData();
      if (!pagedData || pagedData.length === 0) return [];
    } catch (_) {}

    // Iterate main rows lazily
    vm.lazyData.mainIndex.forEach(mainMeta => {
      const fullRow = vm.getMainRowLazy(mainMeta.index);
      const mainRowData = { ...fullRow, ...mainMeta, type: 'main' };

      // Memoized pass per main group
      const cacheHit = vm._mainFilterPass.has(mainMeta.groupId);
      let pass = cacheHit ? vm._mainFilterPass.get(mainMeta.groupId) : undefined;
      if (!cacheHit) {
        pass = true;
        const mainFilter = (columnFilters?.main || '').trim().toLowerCase();
        if (pass && mainFilter) {
          const mainText = (mainRowData.main || '').toString().toLowerCase();
          if (!mainText.includes(mainFilter)) pass = false;
        }
        const destinationFilter = (columnFilters?.destination || '').trim().toLowerCase();
        if (pass && destinationFilter) {
          const destText = (mainRowData.destination || '').toString().toLowerCase();
          if (!destText.includes(destinationFilter)) pass = false;
        }
        if (pass && columnFilters) {
          for (const k in columnFilters) {
            if (k === 'peer') continue;
            const f = (columnFilters[k] ?? '').toString();
            if (!f) continue;
            if (!_passesColumnFilter(mainRowData[k], f)) { pass = false; break; }
          }
        }
        const peerFilter = (columnFilters?.peer || '').toString().trim().toLowerCase();
        if (pass && peerFilter) {
          const hasMatchingPeer = vm.lazyData.peerIndex.some(p => p.parentId === mainMeta.groupId && ((p.peer ?? '').toString().toLowerCase().includes(peerFilter)));
          if (!hasMatchingPeer) pass = false;
        }
        if (pass && globalFilter) {
          const mainText2 = (mainRowData.main || '').toString().toLowerCase();
          const peerText2 = (mainRowData.peer || '').toString().toLowerCase();
          const destinationText2 = (mainRowData.destination || '').toString().toLowerCase();
          if (!mainText2.includes(globalFilter) && !peerText2.includes(globalFilter) && !destinationText2.includes(globalFilter)) pass = false;
        }
        vm._mainFilterPass.set(mainMeta.groupId, !!pass);
      }
      // Keep expansion independent from inclusion, but DO NOT bypass filters.
      // If main itself doesn't pass, include it if any of its peer/hourly children pass the active filters.
      if (!pass) {
        try {
          const peersPassing = getPeerRowsLazy(mainMeta.groupId);
          if (Array.isArray(peersPassing) && peersPassing.length > 0) {
            pass = true;
          }
        } catch(_) {}
      }
      if (!pass) return;

      if (loadedCounts.main === 0) logDebug('🧪 First main row groupId:', mainRowData.groupId);

      const mk = keyOf(mainRowData);
      if (!seen.has(mk)) { seen.add(mk); visibleData.push(mainRowData); }
      loadedCounts.main++;

      const isMainOpen = vm.openMainGroups.has(mainMeta.groupId);
      if (isMainOpen) {
        const peerRows = getPeerRowsLazy(mainMeta.groupId);
        loadedCounts.peer += peerRows.length;
        peerRows.forEach(peerRow => {
          const pk = keyOf(peerRow);
          if (!seen.has(pk)) { seen.add(pk); visibleData.push(peerRow); }
          const isPeerOpen = vm.openHourlyGroups.has(peerRow.groupId);
          if (isPeerOpen) {
            const hourlyRows = getHourlyRowsLazy(peerRow.groupId);
            loadedCounts.hourly += hourlyRows.length;
            hourlyRows.forEach(h => { const hk = keyOf(h); if (!seen.has(hk)) { seen.add(hk); visibleData.push(h); } });
          }
        });
      }
    });

    logDebug(`🔍 getLazyVisibleData: Filtered result: ${visibleData.length} rows (main: ${loadedCounts.main}, peer: ${loadedCounts.peer}, hourly: ${loadedCounts.hourly})`);
    return visibleData;
  }

  function getPeerRowsLazy(mainGroupId) {
    const cacheKey = `${vm._filterSortKey}|${filtersKey()}|${mainGroupId}`;
    if (vm._peerRowsCache.has(cacheKey)) return vm._peerRowsCache.get(cacheKey);
    const peerRows = [];

    const peerMetas = vm.lazyData.peerIndex.filter(p => p.parentId === mainGroupId);
    peerMetas.forEach(peerMeta => {
      const fullPeerRow = vm.rawData.peerRows[peerMeta.index];
      peerRows.push({ ...fullPeerRow, ...peerMeta, type: 'peer' });
    });
    // Deduplicate peer rows by natural key to avoid duplicates in visible data
    const peerKeyOf = (r) => {
      const idx = r.index ?? r._rawIndex ?? null;
      if (idx != null) {
        let k = vm._peerKeyCache.get(idx);
        if (!k) { k = [norm(r.main), norm(r.peer), norm(r.destination)].join('|'); vm._peerKeyCache.set(idx, k); }
        return k;
      }
      return [norm(r.main), norm(r.peer), norm(r.destination)].join('|');
    };
    let base = uniqueByKeyFn(peerRows, peerKeyOf);

    try {
      const { columnFilters, globalFilterQuery } = getState();
      const globalFilter = (globalFilterQuery || '').trim().toLowerCase();
      // Apply full filter set to peers; if a peer doesn't pass itself, include it if any hourly child passes
      const filtered = base.filter(r => {
        // First, check all column filters present
        let ok = true;
        if (columnFilters) {
          for (const k in columnFilters) {
            const f = (columnFilters[k] ?? '').toString();
            if (!f) continue;
            if (!_passesColumnFilter(r[k], f)) { ok = false; break; }
          }
        }
        // Global filter across main/peer/destination
        if (ok && globalFilter) {
          const peerText = (r.peer || '').toString().toLowerCase();
          const destinationText = (r.destination || '').toString().toLowerCase();
          const mainText = (r.main || '').toString().toLowerCase();
          if (!peerText.includes(globalFilter) && !destinationText.includes(globalFilter) && !mainText.includes(globalFilter)) ok = false;
        }
        // If peer itself didn't pass, allow inclusion when any hourly child passes filters
        if (!ok) {
          try { const hours = getHourlyRowsLazy(r.groupId); if (Array.isArray(hours) && hours.length > 0) ok = true; } catch(_) {}
        }
        return ok;
      });
      logDebug(`🔍 Peer rows after filtering: ${filtered.length}/${peerRows.length}`);
      const out = vm.applySortingToPeerRows(filtered);
      const deduped = uniqueByKeyFn(out, peerKeyOf);
      vm._peerRowsCache.set(cacheKey, deduped);
      return deduped;
    } catch (_) {}

    const sorted = vm.applySortingToPeerRows(base);
    const dedupedSorted = uniqueByKeyFn(sorted, peerKeyOf);
    vm._peerRowsCache.set(cacheKey, dedupedSorted);
    return dedupedSorted;
  }

  function getHourlyRowsLazy(peerGroupId) {
    const cacheKey = `${vm._filterSortKey}|${filtersKey()}|${peerGroupId}`;
    if (vm._hourlyRowsCache.has(cacheKey)) return vm._hourlyRowsCache.get(cacheKey);
    const hourlyRows = [];

    const hourlyMetas = vm.lazyData.hourlyIndex.filter(h => h.parentId === peerGroupId);
    hourlyMetas.forEach(meta => {
      const fullHourlyRow = vm.rawData.hourlyRows[meta.index];
      const hourlyMeta = meta; // already contains fields
      hourlyRows.push({ ...fullHourlyRow, ...hourlyMeta, type: 'hourly' });
    });
    // Deduplicate hourly rows by natural key (time or hour) to avoid duplicates
    const timeKey = (hourlyRows && hourlyRows.length && Object.prototype.hasOwnProperty.call(hourlyRows[0], 'time')) ? 'time' : 'hour';
    const hourKeyOf = (r) => {
      const idx = r.index ?? r._rawIndex ?? null;
      if (idx != null) {
        let k = vm._hourKeyCache.get(idx);
        if (!k) { k = [norm(r.main), norm(r.peer), norm(r.destination), norm(r[timeKey])].join('|'); vm._hourKeyCache.set(idx, k); }
        return k;
      }
      return [norm(r.main), norm(r.peer), norm(r.destination), norm(r[timeKey])].join('|');
    };
    let base = uniqueByKeyFn(hourlyRows, hourKeyOf);

    try {
      const { columnFilters, globalFilterQuery } = getState();
      const glob = (globalFilterQuery || '').trim().toLowerCase();
      const filtered = base.filter(r => {
        let ok = true;
        if (columnFilters) {
          for (const k in columnFilters) {
            const f = (columnFilters[k] ?? '').toString();
            if (!f) continue;
            if (!_passesColumnFilter(r[k], f)) { ok = false; break; }
          }
        }
        if (ok && glob) {
          const peerText = (r.peer || '').toString().toLowerCase();
          const destinationText = (r.destination || '').toString().toLowerCase();
          const mainText = (r.main || '').toString().toLowerCase();
          if (!peerText.includes(glob) && !destinationText.includes(glob) && !mainText.includes(glob)) ok = false;
        }
        return ok;
      });
      const out = vm.applySortingToHourlyRows(filtered);
      const deduped = uniqueByKeyFn(out, hourKeyOf);
      vm._hourlyRowsCache.set(cacheKey, deduped);
      return deduped;
    } catch (_) {}

    const sorted = vm.applySortingToHourlyRows(base);
    const dedupedSorted = uniqueByKeyFn(sorted, hourKeyOf);
    vm._hourlyRowsCache.set(cacheKey, dedupedSorted);
    return dedupedSorted;
  }

  return {
    getLazyVisibleData,
    getPeerRowsLazy,
    getHourlyRowsLazy,
    getFilterSortKey: () => (typeof vm._computeFilterSortKey === 'function' ? vm._computeFilterSortKey() : (vm._filterSortKey || '')),
    clearCaches: () => {
      try { vm._mainFilterPass?.clear(); } catch (_) {}
      try { vm._peerRowsCache?.clear(); } catch (_) {}
      try { vm._hourlyRowsCache?.clear(); } catch (_) {}
    }
  };
}
