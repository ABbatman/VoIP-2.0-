// static/js/charts/tooltipBar.js
// Responsibility: Bar chart overlay tooltip formatter
import { parseRowTs } from './echarts/helpers/dataTransform.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

// use Set for O(1) lookup
const DEST_KEYS_LOWER = new Set(['destination', 'dst', 'country', 'prefix', 'route', 'direction']);
const CUST_KEYS_LOWER = new Set(['customer', 'client', 'account', 'buyer']);

// ─────────────────────────────────────────────────────────────
// Key detection
// ─────────────────────────────────────────────────────────────

function detectKey(rows, lowerSet) {
  try {
    for (const r of rows || []) {
      if (!r || typeof r !== 'object') continue;
      for (const k of Object.keys(r)) {
        if (!lowerSet.has(k.toLowerCase())) continue;
        const v = r[k];
        if (v == null) continue;
        const str = typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : '');
        if (str) return k;
      }
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'tooltipBar:detectKey', e);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Metric helpers
// ─────────────────────────────────────────────────────────────

function getMetricValue(metric, row) {
  if (metric === 'Minutes') return Number(row.Min ?? row.Minutes ?? 0) || 0;
  if (metric === 'TCalls') return Number(row.TCall ?? row.TCalls ?? row.total_calls ?? 0) || 0;
  if (metric === 'ASR') { const v = Number(row.ASR); return Number.isFinite(v) ? v : null; }
  if (metric === 'ACD') { const v = Number(row.ACD); return Number.isFinite(v) ? v : null; }
  return null;
}

function formatMetricValue(metric, v) {
  if (!Number.isFinite(v)) return '';
  if (metric === 'ASR') return `${v.toFixed(2)}%`;
  if (metric === 'ACD') return v.toFixed(2);
  return String(v);
}

function isAvgMetric(metric) {
  return metric === 'ASR' || metric === 'ACD';
}

function computeAggValue(metric, agg) {
  return isAvgMetric(metric) ? (agg.cnt ? agg.sum / agg.cnt : null) : agg.sum;
}

// ─────────────────────────────────────────────────────────────
// Row timestamp extraction
// ─────────────────────────────────────────────────────────────

function getRowTime(row) {
  // fast path: check common keys first
  if (row.time != null) return parseRowTs(row.time);
  if (row.Time != null) return parseRowTs(row.Time);
  if (row.timestamp != null) return parseRowTs(row.timestamp);
  if (row.slot != null) return parseRowTs(row.slot);
  if (row.hour != null) return parseRowTs(row.hour);
  return NaN;
}

function computeBucket(ts, stepMs) {
  return Math.floor(ts / stepMs) * stepMs + Math.floor(stepMs / 2);
}

// ─────────────────────────────────────────────────────────────
// Data aggregation
// ─────────────────────────────────────────────────────────────

function aggregateSupplierValues({ rows, ts, stepMs, provKey, metric, custKey, supplierName }) {
  const supVals = new Map();
  const custSet = new Set();

  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;

    const rt = getRowTime(r);
    if (!Number.isFinite(rt)) continue;
    if (computeBucket(rt, stepMs) !== ts) continue;

    const prov = provKey ? String(r[provKey] || '').trim() : '';
    if (!prov) continue;

    const v = getMetricValue(metric, r);

    // aggregate supplier value
    if (isAvgMetric(metric)) {
      if (v == null) continue;
      const acc = supVals.get(prov) || { sum: 0, cnt: 0 };
      acc.sum += v;
      acc.cnt += 1;
      supVals.set(prov, acc);
    } else {
      const acc = supVals.get(prov) || { sum: 0, cnt: 0 };
      acc.sum += v || 0;
      supVals.set(prov, acc);
    }

    // collect customers for hovered supplier
    if (supplierName && prov === supplierName && custKey) {
      const c = String(r[custKey] || '').trim();
      if (c) custSet.add(c);
    }
  }

  return { supVals, custSet };
}

function findSuppliersWithSameValue(supVals, hoveredVal, metric) {
  if (!Number.isFinite(hoveredVal)) return [];

  const EPS = 1e-9;
  const result = [];

  for (const [prov, agg] of supVals.entries()) {
    const val = computeAggValue(metric, agg);
    if (Number.isFinite(val) && Math.abs(val - hoveredVal) <= EPS) {
      result.push({ prov, val });
    }
  }

  return result;
}

function buildDirectionLines({ rows, ts, stepMs, provKey, supplierName, destKey, metric }) {
  if (!supplierName) return [];

  const groups = new Map();

  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    if (provKey && String(r[provKey] || '').trim() !== supplierName) continue;

    const rt = getRowTime(r);
    if (!Number.isFinite(rt)) continue;
    if (computeBucket(rt, stepMs) !== ts) continue;

    const dest = destKey ? String(r[destKey] || '').trim() : '';
    let g = groups.get(dest);
    if (!g) { g = { sum: 0, cnt: 0 }; groups.set(dest, g); }

    const v = getMetricValue(metric, r);
    if (isAvgMetric(metric)) {
      if (v != null) { g.sum += v; g.cnt += 1; }
    } else {
      g.sum += v || 0;
    }
  }

  return Array.from(groups.entries())
    .sort((a, b) => computeAggValue(metric, b[1]) - computeAggValue(metric, a[1]))
    .map(([dest, agg]) => {
      const val = computeAggValue(metric, agg);
      return `  - ${dest || '—'}: ${formatMetricValue(metric, val)}`;
    });
}

function buildCustomerMapping({ rows, ts, stepMs, provKey, custKey, sameSuppliers }) {
  if (!custKey || !sameSuppliers.length) return new Map();

  const custMap = new Map();

  for (const r of rows) {
    const rt = getRowTime(r);
    if (!Number.isFinite(rt)) continue;
    if (computeBucket(rt, stepMs) !== ts) continue;

    const prov = provKey ? String(r[provKey] || '').trim() : '';
    if (!sameSuppliers.some(s => s.prov === prov)) continue;

    const cust = String(r[custKey] || '').trim();
    if (cust) custMap.set(cust, prov);
  }

  return custMap;
}

// ─────────────────────────────────────────────────────────────
// HTML formatters
// ─────────────────────────────────────────────────────────────

function formatMultiSupplierTooltip({ hoveredVal, metric, sameSuppliers, custMap }) {
  const head = `Suppliers (same value): ${formatMetricValue(metric, hoveredVal)} ${metric}`;
  const supList = sameSuppliers.map(s => `  - ${s.prov}`).join('\n');

  const custBlock = custMap.size
    ? Array.from(custMap.entries()).map(([c, s]) => `  - ${c} → sends to ${s}`).join('<br/>')
    : '  - —';

  return [head, 'Suppliers:', supList, 'Customers:<br/>' + custBlock].join('<br/>');
}

function formatSingleSupplierTooltip({ supplierName, hoveredVal, metric, custLines, dirLines }) {
  const valStr = Number.isFinite(hoveredVal) ? formatMetricValue(metric, hoveredVal) : '';
  const lines = [
    `Supplier: ${supplierName || ''}`,
    `Value: ${valStr} ${metric}`,
    'Customers:'
  ];

  if (custLines.length) {
    lines.push(...custLines);
  } else {
    lines.push('  - —');
  }

  if (dirLines.length) {
    lines.push('Directions:');
    lines.push(...dirLines);
  }

  return lines.join('<br/>');
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export function makeBarOverlayTooltipFormatter({ metricName, stepMs, providerKey, rows, supplierName }) {
  const allRows = Array.isArray(rows) ? rows : [];
  const provKey = String(providerKey || '').trim();
  const destKey = detectKey(allRows, DEST_KEYS_LOWER);
  const custKey = detectKey(allRows, CUST_KEYS_LOWER);
  const metric = String(metricName);

  return (p) => {
    try {
      const ts = Number(p?.value?.[0]);
      if (!Number.isFinite(ts)) return '';

      // aggregate data
      const { supVals, custSet } = aggregateSupplierValues({
        rows: allRows, ts, stepMs, provKey, metric, custKey, supplierName
      });

      // get hovered supplier value
      let hoveredVal = null;
      if (supplierName && supVals.has(supplierName)) {
        hoveredVal = computeAggValue(metric, supVals.get(supplierName));
      }

      // find suppliers with same value
      const sameSuppliers = findSuppliersWithSameValue(supVals, hoveredVal, metric);

      // multi-supplier case
      if (sameSuppliers.length > 1 && Number.isFinite(hoveredVal)) {
        const custMap = buildCustomerMapping({ rows: allRows, ts, stepMs, provKey, custKey, sameSuppliers });
        return formatMultiSupplierTooltip({ hoveredVal, metric, sameSuppliers, custMap });
      }

      // single supplier case
      const dirLines = buildDirectionLines({ rows: allRows, ts, stepMs, provKey, supplierName, destKey, metric });
      const custLines = Array.from(custSet.values()).map(c => `  - ${c}`);

      return formatSingleSupplierTooltip({ supplierName, hoveredVal, metric, custLines, dirLines });

    } catch (e) {
      logError(ErrorCategory.CHART, 'tooltipBar:formatter', e);
      return '';
    }
  };
}
