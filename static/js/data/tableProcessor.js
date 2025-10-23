// static/js/data/tableProcessor.js
import { getState, getFullData } from "../state/tableState.js";

function getFilteredAndSortedData() {
  const { mainRows, peerRows } = getFullData();
  const { globalFilterQuery, columnFilters, multiSort } = getState();

  let filteredMainRows = mainRows;

  // --- NEW LOGIC FOR COLUMN FILTERS ---
  // This logic correctly handles the case where a filter is applied to the 'peer' column.
  if (Object.keys(columnFilters).length > 0) {
    const peerFilter = columnFilters.peer?.toLowerCase();

    filteredMainRows = mainRows.filter((mainRow) => {
      // Check if the main row itself passes all non-peer filters
      let mainRowPasses = true;
      for (const key in columnFilters) {
        if (key === "peer") continue; // Skip peer filter for the main row
        if (!passesColumnFilter(mainRow[key], columnFilters[key])) {
          mainRowPasses = false;
          break;
        }
      }

      // If a peer filter exists, we need to check children
      if (peerFilter) {
        // Find if any child peer of this main row passes the peer filter
        const hasMatchingPeer = peerRows.some(
          (peerRow) =>
            peerRow.main === mainRow.main &&
            peerRow.destination === mainRow.destination &&
            (peerRow.peer ?? "").toString().toLowerCase().includes(peerFilter)
        );

        // A main row is kept if:
        // 1. It passes all non-peer filters AND has a matching peer child.
        // 2. OR if there's no peer filter and it just passes its own filters.
        return mainRowPasses && hasMatchingPeer;
      }

      // If no peer filter, just return if the main row passed its own filters.
      return mainRowPasses;
    });
  }

  // --- GLOBAL FILTER (no change) ---
  if (globalFilterQuery) {
    const query = globalFilterQuery.toLowerCase();
    filteredMainRows = filteredMainRows.filter((row) => {
      for (const key in row) {
        if ((row[key] ?? "").toString().toLowerCase().includes(query)) {
          return true;
        }
      }
      return false;
    });
  }

  // --- SORTING (ensure main has priority over destination) ---
  if (multiSort && multiSort.length > 0) {
    const order = normalizeMultiSort(multiSort);
    filteredMainRows = filteredMainRows.slice().sort((a, b) => {
      for (let i = 0; i < order.length; i++) {
        const { key, dir } = order[i];
        let aVal = a[key],
          bVal = b[key];
        if (aVal == null) aVal = "";
        if (bVal == null) bVal = "";
        if (!isNaN(parseFloat(aVal)) && !isNaN(parseFloat(bVal))) {
          aVal = parseFloat(aVal);
          bVal = parseFloat(bVal);
          if (aVal !== bVal) return dir === "desc" ? bVal - aVal : aVal - bVal;
        } else {
          aVal = aVal.toString().toLowerCase();
          bVal = bVal.toString().toLowerCase();
          if (aVal !== bVal)
            return dir === "asc"
              ? aVal.localeCompare(bVal)
              : bVal.localeCompare(aVal);
        }
      }
      return 0;
    });
  }

  return { data: filteredMainRows, count: filteredMainRows.length };
}

// Ensure that when both 'main' and 'destination' are present, 'main' is primary
function normalizeMultiSort(multiSort) {
  const arr = Array.isArray(multiSort) ? [...multiSort] : [];
  const keys = arr.map(s => s.key);
  const hasMain = keys.includes('main');
  const hasDest = keys.includes('destination');
  if (hasMain && hasDest) {
    // Now Destination is primary, then Main
    const destItem = arr.find(s => s.key === 'destination');
    const mainItem = arr.find(s => s.key === 'main');
    const others = arr.filter(s => s.key !== 'main' && s.key !== 'destination');
    return [destItem, mainItem, ...others].filter(Boolean);
  }
  return arr;
}

export function getProcessedData() {
  // Virtual Scroller Integration: Return all filtered data for virtualization
  const { data, count } = getFilteredAndSortedData();
  return { pagedData: data, totalFiltered: count };
}

// --- NEW: Compute aggregate totals/averages for footer ---
export function computeAggregates() {
  const { data } = getFilteredAndSortedData();
  const { columnFilters, globalFilterQuery } = getState();
  const { peerRows } = getFullData();

  // If peer filter is active, aggregate over matching peer rows (not main totals)
  const peerFilter = (columnFilters?.peer || '').toString().trim().toLowerCase();
  let sourceRows = data; // default: main rows
  if (peerFilter) {
    sourceRows = peerRows.filter((r) => {
      if (!(r.peer ?? '').toString().toLowerCase().includes(peerFilter)) return false;
      // Apply other column filters if present (main, destination, metrics)
      for (const key in columnFilters) {
        if (key === 'peer') continue;
        if (!passesColumnFilter(r[key], columnFilters[key])) return false;
      }
      // Apply global query if any
      if (globalFilterQuery) {
        const q = globalFilterQuery.toLowerCase();
        let match = false;
        for (const k in r) {
          if ((r[k] ?? '').toString().toLowerCase().includes(q)) { match = true; break; }
        }
        if (!match) return false;
      }
      return true;
    });
  }

  const curr = {
    totalMinutes: 0,
    totalSuccessfulCalls: 0,
    totalCalls: 0,
  };
  const y = {
    totalMinutes: 0,
    totalSuccessfulCalls: 0,
    totalCalls: 0,
  };

  for (const row of sourceRows) {
    const min = parseNumber(row.Min);
    const yMin = parseNumber(row.YMin);
    const sCall = parseNumber(row.SCall);
    const ySCall = parseNumber(row.YSCall);
    const tCall = parseNumber(row.TCall);
    const yTCall = parseNumber(row.YTCall);

    if (!isNaN(min)) curr.totalMinutes += min;
    if (!isNaN(yMin)) y.totalMinutes += yMin;
    if (!isNaN(sCall)) curr.totalSuccessfulCalls += sCall;
    if (!isNaN(ySCall)) y.totalSuccessfulCalls += ySCall;
    if (!isNaN(tCall)) curr.totalCalls += tCall;
    if (!isNaN(yTCall)) y.totalCalls += yTCall;
  }

  const currAcdAvg = curr.totalSuccessfulCalls > 0 ? curr.totalMinutes / curr.totalSuccessfulCalls : 0;
  const yAcdAvg = y.totalSuccessfulCalls > 0 ? y.totalMinutes / y.totalSuccessfulCalls : 0;
  const currAsrAvg = curr.totalCalls > 0 ? (curr.totalSuccessfulCalls / curr.totalCalls) * 100 : 0;
  const yAsrAvg = y.totalCalls > 0 ? (y.totalSuccessfulCalls / y.totalCalls) * 100 : 0;

  // Percentage deltas relative to yesterday values (0 if yesterday is 0)
  const percentChange = (now, prev) => (Math.abs(prev) > 0 ? ((now - prev) / Math.abs(prev)) * 100 : 0);
  const delta = {
    totalMinutes: percentChange(curr.totalMinutes, y.totalMinutes),
    acdAvg: percentChange(currAcdAvg, yAcdAvg),
    asrAvg: percentChange(currAsrAvg, yAsrAvg),
    totalSuccessfulCalls: percentChange(curr.totalSuccessfulCalls, y.totalSuccessfulCalls),
    totalCalls: percentChange(curr.totalCalls, y.totalCalls),
  };

  return {
    curr: {
      totalMinutes: curr.totalMinutes,
      acdAvg: currAcdAvg,
      asrAvg: currAsrAvg,
      totalSuccessfulCalls: curr.totalSuccessfulCalls,
      totalCalls: curr.totalCalls,
    },
    y: {
      totalMinutes: y.totalMinutes,
      acdAvg: yAcdAvg,
      asrAvg: yAsrAvg,
      totalSuccessfulCalls: y.totalSuccessfulCalls,
      totalCalls: y.totalCalls,
    },
    delta,
  };
}

function parseNumber(val) {
  if (val == null) return NaN;
  if (typeof val === 'number') return val;
  // Remove thousand separators and spaces
  const cleaned = val.toString().replace(/\s+/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
}

function passesColumnFilter(value, filter) {
  const trimmed = filter.trim();
  // Robust numeric parsing for table values (handles spaces/commas)
  const numericValue = parseNumber(value);

  // Support >=, <=, !=, >, <, = operators
  const twoCharOp = trimmed.slice(0, 2);
  const oneCharOp = trimmed[0];

  const tryNumber = (str) => parseFloat(str.trim());

  // Two-char operators first
  if ([">=", "<=", "!="].includes(twoCharOp)) {
    const number = tryNumber(trimmed.slice(2));
    if (isNaN(number) || isNaN(numericValue)) return true; // non-numeric -> do not block
    switch (twoCharOp) {
      case ">=":
        return numericValue >= number;
      case "<=":
        return numericValue <= number;
      case "!=":
        return numericValue !== number;
    }
  }

  // One-char operators
  if ([">", "<", "="].includes(oneCharOp)) {
    const number = tryNumber(trimmed.slice(1));
    if (isNaN(number) || isNaN(numericValue)) return true;
    switch (oneCharOp) {
      case ">":
        return numericValue > number;
      case "<":
        return numericValue < number;
      case "=":
        return numericValue === number;
    }
  }

  // Plain numeric input means ">=" semantics
  if (!isNaN(tryNumber(trimmed)) && !isNaN(numericValue)) {
    return numericValue >= tryNumber(trimmed);
  }

  // Fallback to substring match for text
  return (value ?? "").toString().toLowerCase().includes(trimmed.toLowerCase());
}

// Pagination function removed - virtualization handles all data display
