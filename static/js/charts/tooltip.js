// static/js/charts/tooltip.js
// Responsibility: Line/bar chart tooltip formatter
import { formatTimeRange } from './echarts/helpers/time.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const METRIC_NAMES = ['TCalls', 'ASR', 'Minutes', 'ACD'];
const STACK_MAP = { TCalls: 'TCallsStack', ASR: 'ASRStack', Minutes: 'MinutesStack', ACD: 'ACDStack' };
const DEFAULT_STEP = 3600e3;

// ─────────────────────────────────────────────────────────────
// Data extraction
// ─────────────────────────────────────────────────────────────

function toPairs(arr) {
  if (!Array.isArray(arr)) return [];

  const out = [];
  for (const d of arr) {
    let t, y;

    if (Array.isArray(d)) {
      t = Number(d[0]);
      y = d[1];
    } else if (d?.value) {
      t = Number(d.value[0]);
      y = d.value[1];
    } else {
      continue;
    }

    if (Number.isFinite(t)) {
      out.push([t, y == null || isNaN(y) ? null : Number(y)]);
    }
  }

  return out.sort((a, b) => a[0] - b[0]);
}

function getSeriesPairs(chart, name) {
  try {
    const opt = chart.getOption();
    const series = opt.series || [];

    // try by name first
    const byName = series.find(s => s?.name === name);
    if (byName) return toPairs(byName.data || []);

    // try stacked series
    const targetStack = STACK_MAP[name];
    if (!targetStack) return [];

    const stacks = series.filter(s =>
      s?.type === 'bar' &&
      s?.stack === targetStack &&
      typeof s?.name === 'string' &&
      !s.name.endsWith(' -24h')
    );

    if (!stacks.length) return [];

    // sum stacked values
    const acc = new Map();
    for (const s of stacks) {
      for (const [t, y] of toPairs(s.data || [])) {
        acc.set(t, (acc.get(t) || 0) + (y || 0));
      }
    }

    return Array.from(acc.entries()).sort((a, b) => a[0] - b[0]);
  } catch (e) {
    logError(ErrorCategory.CHART, 'tooltip:getSeriesPairs', e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Value lookup (binary search)
// ─────────────────────────────────────────────────────────────

function findValueWithin(pairs, ts, maxDelta) {
  if (!Array.isArray(pairs) || !pairs.length) return null;

  // binary search for last pair <= ts
  let lo = 0;
  let hi = pairs.length - 1;
  let ans = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (Number(pairs[mid][0]) <= ts) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (ans === -1) return null;

  const t = Number(pairs[ans][0]);
  const y = pairs[ans][1];

  if (y == null || isNaN(y)) return null;
  return (ts - t) <= maxDelta ? Number(y) : null;
}

// ─────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────

function formatDecimal(v) {
  if (v == null || isNaN(v)) return '-';
  return (Math.round(Number(v) * 10) / 10).toFixed(1);
}

function formatMetric(name, v) {
  if (v == null || isNaN(v)) return '-';
  if (name === 'TCalls') return Math.round(Number(v)).toLocaleString();
  return formatDecimal(v);
}

// ─────────────────────────────────────────────────────────────
// Timestamp extraction
// ─────────────────────────────────────────────────────────────

function extractTimestamp(arr) {
  // prefer axisValue
  let ts = Number(arr[0]?.axisValue);

  // fallback to parsing label
  if (!Number.isFinite(ts)) {
    try {
      ts = Date.parse(arr[0]?.axisValueLabel);
    } catch (e) {
      logError(ErrorCategory.CHART, 'tooltip:extractTimestamp', e);
    }
  }

  // fallback to first primary item
  if (!Number.isFinite(ts)) {
    const prim = arr.find(p => typeof p?.seriesName === 'string' && !p.seriesName.endsWith(' -24h'));
    if (prim) {
      ts = Array.isArray(prim.data) ? Number(prim.data[0]) : Number(prim.value?.[0]);
    }
  }

  return ts;
}

// ─────────────────────────────────────────────────────────────
// HTML generation
// ─────────────────────────────────────────────────────────────

function buildTooltipHtml(header, metricValues) {
  const rows = METRIC_NAMES.map(name => {
    const val = formatMetric(name, metricValues[name]);
    return `<li style="display:flex;justify-content:space-between;gap:12px;"><span>${name}</span><span style="font-variant-numeric: tabular-nums;">${val}</span></li>`;
  }).join('');

  const list = `<ul style="list-style:none;padding:0;margin:0;">${rows}</ul>`;
  const timeBlock = `<div><div style="font-size:11px;color:#6b7280;">Time</div><div style="font-weight:600;">${header}</div></div>`;

  return `
    <div style="display:flex;flex-direction:column;gap:6px;min-width:200px;">
      <div style="display:grid;grid-template-columns:1fr;row-gap:4px;">
        ${timeBlock}
      </div>
      <div style="height:1px;background:#eef2f7;margin:6px 0;"></div>
      ${list}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export function makeBarLineLikeTooltip({ chart, stepMs }) {
  const step = Number(stepMs) || DEFAULT_STEP;
  const half = Math.max(1, Math.floor(step / 2));

  return (param) => {
    if (!param) return '';

    const arr = Array.isArray(param) ? param : [param];

    // suppress if capsule hover is active
    if (chart?.__capsuleHoverActive) return '';

    // hide if only -24h series under cursor
    const hasPrimary = arr.some(p => typeof p?.seriesName === 'string' && !p.seriesName.endsWith(' -24h'));
    if (!hasPrimary) return '';

    const ts = extractTimestamp(arr);
    if (!Number.isFinite(ts)) return '';

    const tsSnap = Math.round(ts / step) * step;

    // get values for each metric
    const metricValues = {};
    for (const name of METRIC_NAMES) {
      const pairs = getSeriesPairs(chart, name);
      metricValues[name] = findValueWithin(pairs, tsSnap, half);
    }

    const header = formatTimeRange(tsSnap, step);
    return buildTooltipHtml(header, metricValues);
  };
}
