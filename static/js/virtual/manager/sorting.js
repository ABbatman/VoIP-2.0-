// static/js/virtual/manager/sorting.js
// Responsibility: Sorting helpers for main/peer/hourly rows
import { getState } from '../../state/tableState.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const toLower = x => (x ?? '').toString().toLowerCase();
const perf = () => typeof performance !== 'undefined' ? performance.now() : Date.now();

function compareValues(aVal, bVal, dir) {
  const aNum = parseFloat(aVal);
  const bNum = parseFloat(bVal);

  if (!isNaN(aNum) && !isNaN(bNum)) {
    if (aNum !== bNum) return dir === 'desc' ? bNum - aNum : aNum - bNum;
  } else {
    const aStr = toLower(aVal ?? '');
    const bStr = toLower(bVal ?? '');
    if (aStr !== bStr) return dir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────
// Attach to VirtualManager
// ─────────────────────────────────────────────────────────────

export function attachSorting() {
  const _mainSortCache = new WeakMap();

  function getCurrentTableState() {
    try { return getState(); } catch (e) { logError(ErrorCategory.TABLE, 'sorting:getState', e); return { multiSort: [] }; }
  }

  function normalizeMultiSort(multiSort) {
    if (!Array.isArray(multiSort) || multiSort.length === 0) return [];

    const len = multiSort.length;
    const primary = multiSort[0]?.key;

    // Single pass to find main/dest items and check flags
    let mainItem = null;
    let destItem = null;
    const others = [];

    for (let i = 0; i < len; i++) {
      const s = multiSort[i];
      if (s.key === 'main') mainItem = s;
      else if (s.key === 'destination') destItem = s;
      else others.push(s);
    }

    const hasMain = mainItem !== null;
    const hasDest = destItem !== null;

    if (hasMain && hasDest && (primary === 'main' || primary === 'destination')) {
      // Build result without spread
      const result = primary === 'destination'
        ? [destItem, mainItem]
        : [mainItem, destItem];
      const othersLen = others.length;
      for (let i = 0; i < othersLen; i++) {
        result.push(others[i]);
      }
      return result;
    }

    // Return copy without spread
    const arr = [];
    for (let i = 0; i < len; i++) {
      arr.push(multiSort[i]);
    }
    return arr;
  }

  function applyOrderSort(rows, order) {
    if (!order?.length) return rows;

    const t1 = perf();
    const result = rows.slice().sort((a, b) => {
      for (const { key, dir } of order) {
        const cmp = compareValues(a[key], b[key], dir);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
    const dt = perf() - t1;

    if (typeof window !== 'undefined' && window.DEBUG && dt > 10) {
      logError(ErrorCategory.TABLE, 'sorting:slow', `${Math.round(dt)}ms for ${rows?.length || 0} rows`);
    }
    return result;
  }

  function getSortOrder() {
    return normalizeMultiSort(getCurrentTableState().multiSort);
  }

  function applySortingToMainRows(mainRows) {
    const order = getSortOrder();
    const orderKey = JSON.stringify(order);

    const cached = _mainSortCache.get(mainRows);
    if (cached?.key === orderKey && Array.isArray(cached.out)) return cached.out;

    const out = applyOrderSort(mainRows, order);
    try { _mainSortCache.set(mainRows, { key: orderKey, out }); } catch (e) { logError(ErrorCategory.TABLE, 'sorting:cache', e); }
    return out;
  }

  const applySortingToPeerRows = peerRows => applyOrderSort(peerRows, getSortOrder());
  const applySortingToHourlyRows = hourlyRows => applyOrderSort(hourlyRows, getSortOrder());

  return {
    getCurrentTableState,
    normalizeMultiSort,
    applySortingToMainRows,
    applySortingToPeerRows,
    applySortingToHourlyRows
  };
}
