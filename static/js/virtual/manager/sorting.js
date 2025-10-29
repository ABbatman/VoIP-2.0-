// static/js/virtual/manager/sorting.js
// Layer: sorting helpers for main/peer/hourly rows

import { getState } from '../../state/tableState.js';

function toLower(x) { return (x ?? '').toString().toLowerCase(); }

export function attachSorting() {
  // Memoization cache for mainRows sorting: WeakMap<Array, { key: string, out: Array }>
  const _mainSortCache = new WeakMap();
  function getCurrentTableState() {
    try { return getState(); } catch (_) { return { multiSort: [] }; }
  }

  function normalizeMultiSort(multiSort) {
    const arr = Array.isArray(multiSort) ? [...multiSort] : [];
    if (arr.length === 0) return arr;
    const primary = arr[0]?.key;
    const hasMain = arr.some(s => s.key === 'main');
    const hasDest = arr.some(s => s.key === 'destination');
    if (hasMain && hasDest && (primary === 'main' || primary === 'destination')) {
      const destItem = arr.find(s => s.key === 'destination');
      const mainItem = arr.find(s => s.key === 'main');
      const others = arr.filter(s => s.key !== 'main' && s.key !== 'destination');
      return primary === 'destination'
        ? [destItem, mainItem, ...others].filter(Boolean)
        : [mainItem, destItem, ...others].filter(Boolean);
    }
    return arr;
  }

  function applyOrderSort(rows, order) {
    if (!order || order.length === 0) return rows;
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const result = rows.slice().sort((a, b) => {
      for (let i = 0; i < order.length; i++) {
        const { key, dir } = order[i];
        let aVal = a[key];
        let bVal = b[key];
        if (aVal == null) aVal = '';
        if (bVal == null) bVal = '';
        if (!isNaN(parseFloat(aVal)) && !isNaN(parseFloat(bVal))) {
          aVal = parseFloat(aVal); bVal = parseFloat(bVal);
          if (aVal !== bVal) return dir === 'desc' ? bVal - aVal : aVal - bVal;
        } else {
          aVal = toLower(aVal); bVal = toLower(bVal);
          if (aVal !== bVal) return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
      }
      return 0;
    });
    const t2 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const dt = t2 - t1;
    try {
      if (typeof window !== 'undefined' && window.DEBUG && dt > 10) {
        // eslint-disable-next-line no-console
        console.warn('⚠️ Sorting >10ms', { ms: Math.round(dt), count: rows?.length || 0, order });
      }
    } catch (_) {
      // Ignore sorting errors
    }
    return result;
  }

  function applySortingToMainRows(mainRows) {
    const { multiSort } = getCurrentTableState();
    const order = normalizeMultiSort(multiSort);
    // Memoization key based on order JSON
    const orderKey = JSON.stringify(order);
    try {
      const cached = _mainSortCache.get(mainRows);
      if (cached && cached.key === orderKey && Array.isArray(cached.out)) {
        return cached.out;
      }
    } catch (_) {
      // Ignore sorting errors
    }
    const out = applyOrderSort(mainRows, order);
    try { _mainSortCache.set(mainRows, { key: orderKey, out }); } catch (_) {
      // Ignore sorting errors
    }
    return out;
  }

  function applySortingToPeerRows(peerRows) {
    const { multiSort } = getCurrentTableState();
    const order = normalizeMultiSort(multiSort);
    return applyOrderSort(peerRows, order);
  }

  function applySortingToHourlyRows(hourlyRows) {
    const { multiSort } = getCurrentTableState();
    const order = normalizeMultiSort(multiSort);
    return applyOrderSort(hourlyRows, order);
  }

  return {
    getCurrentTableState,
    normalizeMultiSort,
    applySortingToMainRows,
    applySortingToPeerRows,
    applySortingToHourlyRows,
  };
}
