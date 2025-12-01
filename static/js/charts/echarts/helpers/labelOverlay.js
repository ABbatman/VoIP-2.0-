// static/js/charts/echarts/helpers/labelOverlay.js
// Responsibility: Custom series overlay labels for bar charts
import * as echarts from 'echarts';
import { getStableColor, PROVIDER_COLORS } from './colors.js';
import { calculateMarkerLayout } from '../../../visualEnhancements/adaptiveMarkers.js';
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const NAME_KEYS = [
  'name', 'supplier', 'provider', 'peer', 'vendor', 'carrier',
  'operator', 'route', 'trunk', 'gateway', 'partner',
  'supplier_name', 'provider_name', 'vendor_name', 'carrier_name', 'peer_name'
];

const ID_KEYS = [
  'supplierId', 'providerId', 'vendorId', 'carrierId', 'peerId', 'id',
  'supplier_id', 'provider_id', 'vendor_id', 'carrier_id', 'peer_id'
];

const BASE_GAP = 4;
const MIN_GAP = 1;
const VALUE_TOLERANCE = 0.1;
const THROTTLE_MS = 80;

// ─────────────────────────────────────────────────────────────
// CSS helpers
// ─────────────────────────────────────────────────────────────

function readCssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) {
    logError(ErrorCategory.CHART, 'labelOverlay:readCssVar', e);
    return fallback;
  }
}

const CSS_BG = () => readCssVar('--ds-color-bg', '#ffffff');

// ─────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────

function formatMetricText(metric, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '';

  if (metric === 'ASR' || metric === 'ACD') return v.toFixed(1);
  if (metric === 'Minutes' || metric === 'TCalls') return Math.round(v).toString();

  return v.toFixed(1);
}

// ─────────────────────────────────────────────────────────────
// Gap computation
// ─────────────────────────────────────────────────────────────

function computeCompactGap(count, itemHeight, baseGap, availablePx) {
  try {
    const n = Number(count) | 0;
    const h = Math.max(0, Number(itemHeight) || 0);
    const g0 = Math.max(0, Number(baseGap) || 0);
    const avail = Math.max(0, Number(availablePx) || 0);

    if (n <= 1) return g0;

    const need = (n - 1) * (h + g0);
    if (need <= avail) return g0;

    const g = Math.floor(avail / (n - 1) - h);
    return Math.max(MIN_GAP, Math.min(g0, Number.isFinite(g) ? g : g0));
  } catch (e) {
    logError(ErrorCategory.CHART, 'labelOverlay:computeCompactGap', e);
    return Math.max(MIN_GAP, Number(baseGap) || BASE_GAP);
  }
}

// ─────────────────────────────────────────────────────────────
// Throttle helper
// ─────────────────────────────────────────────────────────────

function makeThrottled(fn, waitMs) {
  let last = 0;
  let lastKey = null;
  let cached = null;

  return function throttled(params, api) {
    const now = Date.now();
    let key = null;

    try {
      key = api?.value ? Number(api.value(0)) : null;
    } catch (e) {
      logError(ErrorCategory.CHART, 'labelOverlay:throttle', e);
      key = Number.isFinite(params?.dataIndex) ? params.dataIndex : null;
    }

    if (cached != null && key === lastKey && (now - last) < (waitMs || THROTTLE_MS)) {
      return cached;
    }

    cached = fn(params, api);
    last = now;
    lastKey = key;
    return cached;
  };
}

// ─────────────────────────────────────────────────────────────
// Label lookup
// ─────────────────────────────────────────────────────────────

function createLabelLookup(labels) {
  return (ts) => {
    const sec = Math.floor(Number(ts) / 1000);
    return (labels && (labels[ts] || labels[String(ts)] || labels[sec] || labels[String(sec)])) || [];
  };
}

// ─────────────────────────────────────────────────────────────
// Entry normalization
// ─────────────────────────────────────────────────────────────

function extractIdFromObject(obj) {
  for (const k of ID_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) {
      return obj[k];
    }
  }
  return null;
}

function extractNameFromObject(obj) {
  for (const k of NAME_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) {
      return obj[k];
    }
  }
  return null;
}

function normalizeEntry(item) {
  if (typeof item === 'number') {
    return { supplierId: null, name: null, value: Number(item) };
  }

  if (!item || typeof item !== 'object') return null;

  const rawVal = item.value ?? item.v ?? item.ASR ?? item.ACD;
  if (rawVal === undefined || rawVal === null || rawVal === '') return null;

  const val = Number(rawVal);
  if (!Number.isFinite(val)) return null;

  return {
    supplierId: extractIdFromObject(item),
    name: extractNameFromObject(item) != null ? String(extractNameFromObject(item)) : null,
    value: val
  };
}

function normalizeEntries(raw) {
  return raw.map(normalizeEntry).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// Clustering
// ─────────────────────────────────────────────────────────────

function clusterByValue(entries) {
  const sorted = [...entries].sort((a, b) => a.value - b.value);
  const clusters = [];

  for (const e of sorted) {
    const last = clusters.length ? clusters[clusters.length - 1] : null;
    if (!last) {
      clusters.push([e]);
      continue;
    }

    const lastVal = last[last.length - 1].value;
    if (Math.abs(e.value - lastVal) <= VALUE_TOLERANCE) {
      last.push(e);
    } else {
      clusters.push([e]);
    }
  }

  return clusters;
}

function pickMaxFromCluster(group) {
  let maxVal = -Infinity;
  let pick = group[0] || { supplierId: null, name: null, value: null };

  for (const g of group) {
    const v = Number(g.value);
    if (Number.isFinite(v) && v > maxVal) {
      maxVal = v;
      pick = g;
    }
  }

  if (!Number.isFinite(maxVal)) {
    maxVal = Number(group[0]?.value) || 0;
  }

  return { supplierId: pick.supplierId ?? null, name: pick.name ?? null, value: maxVal };
}

function groupEntries(entries) {
  const clusters = clusterByValue(entries);
  return clusters.map(pickMaxFromCluster);
}

// ─────────────────────────────────────────────────────────────
// Position calculation
// ─────────────────────────────────────────────────────────────

function measureCapsuleHeight(metric, value) {
  const font = '600 11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const sampleTxt = formatMetricText(metric, value);
  const padY = 3;

  const textRect = echarts?.format?.getTextRect?.(sampleTxt, font)
    || { width: String(sampleTxt).length * 7, height: 12 };

  return Math.round(textRect.height + padY * 2);
}

function getAreaBounds(params, api, ts, firstValue) {
  let yBase = 0;
  let areaTop = 0;
  let areaBottom = 0;

  try {
    const c0 = api.coord([ts, firstValue]);
    yBase = Array.isArray(c0) ? Number(c0[1]) : 0;
    areaTop = Number.isFinite(params?.coordSys?.y) ? Number(params.coordSys.y) : 0;
    areaBottom = Number.isFinite(params?.coordSys?.height)
      ? areaTop + Number(params.coordSys.height)
      : areaTop + 1e6;
  } catch (e) {
    logError(ErrorCategory.CHART, 'labelOverlay:getAreaBounds', e);
  }

  return { yBase, areaTop, areaBottom };
}

function computeIdealPositions(api, ts, grouped, yBase) {
  return grouped.map(g => {
    try {
      const c = api.coord([ts, g.value]);
      return Math.round(Array.isArray(c) ? Number(c[1]) : yBase);
    } catch (e) {
      logError(ErrorCategory.CHART, 'labelOverlay:computeIdealPositions', e);
      return yBase;
    }
  });
}

function checkPositionsFit(yList, h, topBound) {
  if (yList[0] < topBound) return false;

  for (let i = 1; i < yList.length; i++) {
    if ((yList[i - 1] - yList[i]) < (h + BASE_GAP)) return false;
  }

  return true;
}

function computeFinalPositions({ yList, h, topBound, bottomBound, availableSpan, grouped }) {
  const yTop = Math.min(...yList);
  const yBottom = Math.max(...yList);

  if (checkPositionsFit(yList, h, topBound)) {
    return yList.slice();
  }

  const origSpan = Math.max(0, yBottom - yTop);

  if (origSpan > 0 && availableSpan > 0) {
    const scale = availableSpan / origSpan;
    const mapped = yList.map(y => topBound + (y - yTop) * scale);

    // verify constraints
    let ok = mapped[0] <= bottomBound + 0.5 && mapped[mapped.length - 1] >= topBound - 0.5;
    if (ok) {
      for (let i = 1; i < mapped.length; i++) {
        if ((mapped[i - 1] - mapped[i]) < (h + MIN_GAP)) {
          ok = false;
          break;
        }
      }
    }

    if (ok) return mapped;
  }

  // fallback: strict stacking
  const vGap = computeCompactGap(grouped.length, h, BASE_GAP, availableSpan);
  return grouped.map((_, i) => bottomBound - i * (h + vGap));
}

// ─────────────────────────────────────────────────────────────
// Render item implementation
// ─────────────────────────────────────────────────────────────

function createRenderItem({ metric, labels, stepMs, align, secondary, colorMap }) {
  const getByTs = createLabelLookup(labels);

  return (params, api) => {
    const ts = api.value(0);
    const raw = getByTs(ts);

    if (!Array.isArray(raw) || !raw.length) return null;

    const entries = normalizeEntries(raw);
    if (!entries.length) return null;

    const grouped = groupEntries(entries);
    if (!grouped.length) return null;

    const h = measureCapsuleHeight(metric, grouped[0].value);
    const { yBase, areaTop, areaBottom } = getAreaBounds(params, api, ts, grouped[0].value);

    const topBound = areaTop + Math.floor(h / 2);
    const bottomBound = areaBottom - Math.floor(h / 2);
    const availableSpan = Math.max(0, bottomBound - topBound);

    const yList = computeIdealPositions(api, ts, grouped, yBase);
    const yPos = computeFinalPositions({ yList, h, topBound, bottomBound, availableSpan, grouped });

    const children = calculateMarkerLayout(api, {
      ts,
      value: grouped.map(g => g.value),
      metric,
      stepMs,
      align,
      grouped,
      yPos,
      h,
      secondary,
      colorMap,
      formatMetricText,
      CSS_BG,
      getStableColor,
      PROVIDER_COLORS,
      echarts
    });

    if (!children?.length) return null;
    return { type: 'group', children };
  };
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export function buildLabelOverlay({ metric, timestamps, labels, colorMap, gridIndex, xAxisIndex, yAxisIndex, secondary = false, stepMs, align = 'current' }) {
  const dataTs = Array.isArray(timestamps)
    ? Array.from(new Set(timestamps.map(t => Number(t)).filter(Number.isFinite))).sort((a, b) => a - b)
    : [];

  const id = `labels_overlay_${metric || ''}_${xAxisIndex}_${yAxisIndex}`;
  const renderItemImpl = createRenderItem({ metric, labels, stepMs, align, secondary, colorMap });
  const throttledRenderItem = makeThrottled(renderItemImpl, THROTTLE_MS);

  return {
    id,
    name: 'LabelsOverlay',
    type: 'custom',
    coordinateSystem: 'cartesian2d',
    clip: true,
    gridIndex: Number.isFinite(gridIndex) ? Number(gridIndex) : undefined,
    xAxisIndex: Number(xAxisIndex),
    yAxisIndex: Number(yAxisIndex),
    silent: false,
    tooltip: { show: false },
    renderMode: 'canvas',
    progressive: 200,
    progressiveThreshold: 500,
    emphasis: { disabled: true },
    z: 100,
    zlevel: 100,
    renderItem: throttledRenderItem,
    data: dataTs.map(ts => [ts])
  };
}

// compatibility alias
export const createLabelOverlaySeries = (args) => buildLabelOverlay({
  metric: args?.metric,
  timestamps: args?.timestamps,
  labels: args?.labelsMap || args?.labels,
  colorMap: args?.colorMap,
  gridIndex: args?.gridIndex,
  xAxisIndex: args?.xAxisIndex,
  yAxisIndex: args?.yAxisIndex,
  secondary: args?.secondary
});
