// static/js/data/tableProcessor.js
// Responsibility: UI-level data processing (filtering, sorting, search)
import { getState, getFullData } from '../state/tableState.js';
import { getChartsZoomRange } from '../state/runtimeFlags.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

// use Set for O(1) lookup (fallback only)
const TIME_KEYS_SET = new Set(['time', 'Time', 'timestamp', 'Timestamp', 'slot', 'Slot', 'hour', 'Hour', 'datetime', 'DateTime', 'ts', 'TS']);

// metrics list for aggregation
const AGG_METRICS = ['ASR', 'ACD', 'PDD', 'ATime'];

// ─────────────────────────────────────────────────────────────
// Worker client (lazy loaded)
// ─────────────────────────────────────────────────────────────

let workerClient = null;

async function getWorkerClient() {
  if (workerClient === null) {
    try {
      workerClient = await import('../workers/aggregationWorkerClient.js');
    } catch {
      workerClient = false;
    }
  }
  return workerClient || null;
}

// ─────────────────────────────────────────────────────────────
// Timestamp parsing
// ─────────────────────────────────────────────────────────────

function parseRowTs(row) {
  // fast path: check common keys first
  let val = row.time ?? row.Time ?? row.timestamp ?? row.slot ?? row.hour ?? row.ts;

  // fallback to full search if not found
  if (val == null) {
    for (const key of Object.keys(row)) {
      if (TIME_KEYS_SET.has(key)) {
        val = row[key];
        break;
      }
    }
  }

  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const d = new Date(val.replace(' ', 'T') + (val.includes('Z') ? '' : 'Z'));
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────
// Number parsing
// ─────────────────────────────────────────────────────────────

function parseNumber(val) {
  if (val == null) return NaN;
  if (typeof val === 'number') return val;
  const cleaned = val.toString().replace(/\s+/g, '').replace(/,/g, '');
  return parseFloat(cleaned);
}

// ─────────────────────────────────────────────────────────────
// Zoom helpers
// ─────────────────────────────────────────────────────────────

function getValidZoomRange() {
  const zr = getChartsZoomRange();
  if (!zr) return null;
  if (!Number.isFinite(zr.fromTs) || !Number.isFinite(zr.toTs)) return null;
  if (zr.toTs <= zr.fromTs) return null;
  return zr;
}

function filterByZoomRange(rows, zoomRange) {
  return rows.filter(r => {
    const ts = parseRowTs(r);
    return ts >= zoomRange.fromTs && ts <= zoomRange.toTs;
  });
}

// ─────────────────────────────────────────────────────────────
// Sort helpers
// ─────────────────────────────────────────────────────────────

function normalizeMultiSort(multiSort) {
  const arr = Array.isArray(multiSort) ? [...multiSort] : [];
  const keys = arr.map(s => s.key);

  if (keys.includes('main') && keys.includes('destination')) {
    const destItem = arr.find(s => s.key === 'destination');
    const mainItem = arr.find(s => s.key === 'main');
    const others = arr.filter(s => s.key !== 'main' && s.key !== 'destination');
    return [destItem, mainItem, ...others].filter(Boolean);
  }

  return arr;
}

function compareValues(aVal, bVal, dir) {
  const aNum = parseFloat(aVal);
  const bNum = parseFloat(bVal);

  if (!isNaN(aNum) && !isNaN(bNum)) {
    if (aNum !== bNum) return dir === 'desc' ? bNum - aNum : aNum - bNum;
  } else {
    const aStr = String(aVal ?? '').toLowerCase();
    const bStr = String(bVal ?? '').toLowerCase();
    if (aStr !== bStr) return dir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  }

  return 0;
}

function sortRows(rows, multiSort) {
  if (!multiSort?.length) return rows;

  const order = normalizeMultiSort(multiSort);
  return rows.slice().sort((a, b) => {
    for (const { key, dir } of order) {
      const result = compareValues(a[key] ?? '', b[key] ?? '', dir);
      if (result !== 0) return result;
    }
    return 0;
  });
}

// ─────────────────────────────────────────────────────────────
// Column filter helpers
// ─────────────────────────────────────────────────────────────

function tryParseNumber(str) {
  return parseFloat(str.trim());
}

function passesNumericFilter(value, operator, threshold) {
  const numValue = parseNumber(value);
  if (isNaN(numValue) || isNaN(threshold)) return true;

  switch (operator) {
    case '>=': return numValue >= threshold;
    case '<=': return numValue <= threshold;
    case '!=': return numValue !== threshold;
    case '>': return numValue > threshold;
    case '<': return numValue < threshold;
    case '=': return numValue === threshold;
    default: return true;
  }
}

function passesColumnFilter(value, filter) {
  const trimmed = filter.trim();
  const numericValue = parseNumber(value);

  // two-char operators
  const twoCharOp = trimmed.slice(0, 2);
  if (['>=', '<=', '!='].includes(twoCharOp)) {
    return passesNumericFilter(value, twoCharOp, tryParseNumber(trimmed.slice(2)));
  }

  // one-char operators
  const oneCharOp = trimmed[0];
  if (['>', '<', '='].includes(oneCharOp)) {
    return passesNumericFilter(value, oneCharOp, tryParseNumber(trimmed.slice(1)));
  }

  // plain numeric means >=
  const plainNum = tryParseNumber(trimmed);
  if (!isNaN(plainNum) && !isNaN(numericValue)) {
    return numericValue >= plainNum;
  }

  // fallback: substring match
  return String(value ?? '').toLowerCase().includes(trimmed.toLowerCase());
}

// ─────────────────────────────────────────────────────────────
// Filter application
// ─────────────────────────────────────────────────────────────

function applyColumnFilters(mainRows, peerRows, columnFilters) {
  if (!Object.keys(columnFilters).length) return mainRows;

  const peerFilter = columnFilters.peer?.toLowerCase();

  return mainRows.filter(mainRow => {
    // check non-peer filters
    for (const key in columnFilters) {
      if (key === 'peer') continue;
      if (!passesColumnFilter(mainRow[key], columnFilters[key])) return false;
    }

    // check peer filter
    if (peerFilter) {
      return peerRows.some(pr =>
        pr.main === mainRow.main &&
        pr.destination === mainRow.destination &&
        String(pr.peer ?? '').toLowerCase().includes(peerFilter)
      );
    }

    return true;
  });
}

function applyGlobalFilter(rows, query) {
  if (!query) return rows;

  const q = query.toLowerCase();
  return rows.filter(row => {
    // cache keys for this row
    const keys = Object.keys(row);
    const len = keys.length;
    for (let i = 0; i < len; i++) {
      if (String(row[keys[i]] ?? '').toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

// ─────────────────────────────────────────────────────────────
// Main filtering pipeline
// ─────────────────────────────────────────────────────────────

function getFilteredAndSortedData() {
  const { mainRows, peerRows, hourlyRows } = getFullData();
  const { globalFilterQuery, columnFilters, multiSort } = getState();

  let effectiveMainRows = mainRows;
  let effectivePeerRows = peerRows;
  let effectiveHourlyRows = hourlyRows;

  // zoom re-aggregation
  const zoomRange = getValidZoomRange();
  if (zoomRange && hourlyRows?.length) {
    effectiveHourlyRows = filterByZoomRange(hourlyRows, zoomRange);
    effectivePeerRows = aggregatePeerRows(effectiveHourlyRows);
    effectiveMainRows = aggregateMainRows(effectivePeerRows);
  }

  // apply filters
  let filtered = applyColumnFilters(effectiveMainRows, effectivePeerRows, columnFilters);
  filtered = applyGlobalFilter(filtered, globalFilterQuery);
  filtered = sortRows(filtered, multiSort);

  return {
    data: filtered,
    count: filtered.length,
    effectivePeerRows,
    effectiveHourlyRows
  };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function getProcessedData() {
  const { data, count, effectivePeerRows, effectiveHourlyRows } = getFilteredAndSortedData();
  return {
    pagedData: data,
    totalFiltered: count,
    peerRows: effectivePeerRows,
    hourlyRows: effectiveHourlyRows
  };
}

export async function getProcessedDataAsync() {
  const { mainRows, peerRows, hourlyRows } = getFullData();
  const { globalFilterQuery, columnFilters, multiSort } = getState();

  let effectiveMainRows = mainRows;
  let effectivePeerRows = peerRows;
  let effectiveHourlyRows = hourlyRows;

  const zoomRange = getValidZoomRange();

  // use worker for heavy zoom re-aggregation
  if (zoomRange && hourlyRows?.length) {
    const wc = await getWorkerClient();

    if (wc) {
      try {
        const result = await wc.fullReaggregationAsync(hourlyRows, zoomRange.fromTs, zoomRange.toTs);
        effectiveHourlyRows = result.hourlyRows;
        effectivePeerRows = result.peerRows;
        effectiveMainRows = result.mainRows;
      } catch {
        // fallback to sync
        effectiveHourlyRows = filterByZoomRange(hourlyRows, zoomRange);
        effectivePeerRows = aggregatePeerRows(effectiveHourlyRows);
        effectiveMainRows = aggregateMainRows(effectivePeerRows);
      }
    } else {
      effectiveHourlyRows = filterByZoomRange(hourlyRows, zoomRange);
      effectivePeerRows = aggregatePeerRows(effectiveHourlyRows);
      effectiveMainRows = aggregateMainRows(effectivePeerRows);
    }
  }

  // apply filters and sorting
  let filtered = applyColumnFilters(effectiveMainRows, effectivePeerRows, columnFilters);
  filtered = applyGlobalFilter(filtered, globalFilterQuery);
  filtered = sortRows(filtered, multiSort);

  return {
    pagedData: filtered,
    totalFiltered: filtered.length,
    peerRows: effectivePeerRows,
    hourlyRows: effectiveHourlyRows
  };
}

// ─────────────────────────────────────────────────────────────
// Aggregation helpers
// ─────────────────────────────────────────────────────────────

function createEmptyAggregator(keys) {
  return {
    ...keys,
    Min: 0, SCall: 0, TCall: 0,
    sumASR: 0, sumACD: 0, sumPDD: 0, sumATime: 0,
    cntASR: 0, cntACD: 0, cntPDD: 0, cntATime: 0
  };
}

function addToAggregator(agg, row) {
  const min = parseNumber(row.Min);
  const scall = parseNumber(row.SCall);
  const tcall = parseNumber(row.TCall);

  if (!isNaN(min)) agg.Min += min;
  if (!isNaN(scall)) agg.SCall += scall;
  if (!isNaN(tcall)) agg.TCall += tcall;

  const weight = !isNaN(scall) && scall > 0 ? scall : 1;

  // use cached metrics list
  for (let i = 0; i < AGG_METRICS.length; i++) {
    const m = AGG_METRICS[i];
    const val = parseNumber(row[m]);
    if (!isNaN(val)) {
      agg[`sum${m}`] += val * weight;
      agg[`cnt${m}`] += weight;
    }
  }
}

function finalizeAggregator(agg, keyFields) {
  return {
    ...keyFields,
    Min: agg.Min,
    SCall: agg.SCall,
    TCall: agg.TCall,
    ASR: agg.cntASR > 0 ? agg.sumASR / agg.cntASR : 0,
    ACD: agg.cntACD > 0 ? agg.sumACD / agg.cntACD : 0,
    PDD: agg.cntPDD > 0 ? agg.sumPDD / agg.cntPDD : 0,
    ATime: agg.cntATime > 0 ? agg.sumATime / agg.cntATime : 0
  };
}

function aggregatePeerRows(hourlyRows) {
  const map = new Map();

  for (const hr of hourlyRows) {
    const key = `${hr.main}||${hr.peer}||${hr.destination}`;
    if (!map.has(key)) {
      map.set(key, createEmptyAggregator({ main: hr.main, peer: hr.peer, destination: hr.destination }));
    }
    addToAggregator(map.get(key), hr);
  }

  return Array.from(map.values()).map(agg =>
    finalizeAggregator(agg, { main: agg.main, peer: agg.peer, destination: agg.destination })
  );
}

function aggregateMainRows(peerRows) {
  const map = new Map();

  for (const pr of peerRows) {
    const key = `${pr.main}||${pr.destination}`;
    if (!map.has(key)) {
      map.set(key, createEmptyAggregator({ main: pr.main, destination: pr.destination }));
    }

    const agg = map.get(key);
    agg.Min += pr.Min || 0;
    agg.SCall += pr.SCall || 0;
    agg.TCall += pr.TCall || 0;

    const weight = pr.SCall > 0 ? pr.SCall : 1;
    // use cached metrics list
    for (let i = 0; i < AGG_METRICS.length; i++) {
      const m = AGG_METRICS[i];
      if (pr[m]) {
        agg[`sum${m}`] += pr[m] * weight;
        agg[`cnt${m}`] += weight;
      }
    }
  }

  return Array.from(map.values()).map(agg =>
    finalizeAggregator(agg, { main: agg.main, destination: agg.destination })
  );
}

// ─────────────────────────────────────────────────────────────
// Footer aggregates
// ─────────────────────────────────────────────────────────────

function getSourceRowsForAggregates(data, peerRows, columnFilters, globalFilterQuery) {
  const peerFilter = String(columnFilters?.peer || '').trim().toLowerCase();
  if (!peerFilter) return data;

  return peerRows.filter(r => {
    if (!String(r.peer ?? '').toLowerCase().includes(peerFilter)) return false;

    for (const key in columnFilters) {
      if (key === 'peer') continue;
      if (!passesColumnFilter(r[key], columnFilters[key])) return false;
    }

    if (globalFilterQuery) {
      const q = globalFilterQuery.toLowerCase();
      let match = false;
      for (const k in r) {
        if (String(r[k] ?? '').toLowerCase().includes(q)) {
          match = true;
          break;
        }
      }
      if (!match) return false;
    }

    return true;
  });
}

function sumMetrics(rows) {
  const curr = { totalMinutes: 0, totalSuccessfulCalls: 0, totalCalls: 0 };
  const y = { totalMinutes: 0, totalSuccessfulCalls: 0, totalCalls: 0 };

  for (const row of rows) {
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

  return { curr, y };
}

function computeDerivedMetrics(totals) {
  const { curr, y } = totals;

  const currAcd = curr.totalSuccessfulCalls > 0 ? curr.totalMinutes / curr.totalSuccessfulCalls : 0;
  const yAcd = y.totalSuccessfulCalls > 0 ? y.totalMinutes / y.totalSuccessfulCalls : 0;
  const currAsr = curr.totalCalls > 0 ? (curr.totalSuccessfulCalls / curr.totalCalls) * 100 : 0;
  const yAsr = y.totalCalls > 0 ? (y.totalSuccessfulCalls / y.totalCalls) * 100 : 0;

  const pctChange = (now, prev) => Math.abs(prev) > 0 ? ((now - prev) / Math.abs(prev)) * 100 : 0;

  return {
    curr: { ...curr, acdAvg: currAcd, asrAvg: currAsr },
    y: { ...y, acdAvg: yAcd, asrAvg: yAsr },
    delta: {
      totalMinutes: pctChange(curr.totalMinutes, y.totalMinutes),
      acdAvg: pctChange(currAcd, yAcd),
      asrAvg: pctChange(currAsr, yAsr),
      totalSuccessfulCalls: pctChange(curr.totalSuccessfulCalls, y.totalSuccessfulCalls),
      totalCalls: pctChange(curr.totalCalls, y.totalCalls)
    }
  };
}

export function computeAggregates() {
  const { data } = getFilteredAndSortedData();
  const { columnFilters, globalFilterQuery } = getState();
  const { peerRows } = getFullData();

  const sourceRows = getSourceRowsForAggregates(data, peerRows, columnFilters, globalFilterQuery);
  const totals = sumMetrics(sourceRows);

  return computeDerivedMetrics(totals);
}
