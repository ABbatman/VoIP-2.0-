// static/js/charts/echarts/helpers/dataTransform.js
// Responsibility: Pure data transforms for chart data
import { getStepMs } from './time.js';
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 3600e3;
const GAP_THRESHOLD_MINUTES = 125;

const BAR_WIDTH_MAP = {
  '5m': 6,
  '1h': 10,
  '1d': 16
};

// use Set for O(1) lookup
const PROVIDER_KEY_CANDIDATES = new Set([
  'provider', 'Provider', 'supplier', 'Supplier', 'vendor', 'Vendor',
  'carrier', 'Carrier', 'operator', 'Operator', 'peer', 'Peer',
  'trunk', 'Trunk', 'gateway', 'Gateway', 'route', 'Route', 'partner', 'Partner',
  'provider_name', 'supplier_name', 'vendor_name', 'carrier_name', 'peer_name',
  'providerId', 'supplierId', 'vendorId', 'carrierId', 'peerId',
  'provider_id', 'supplier_id', 'vendor_id', 'carrier_id', 'peer_id'
]);

// lowercase version for case-insensitive matching
const PROVIDER_KEY_CANDIDATES_LOWER = new Set(
  Array.from(PROVIDER_KEY_CANDIDATES).map(k => k.toLowerCase())
);

const TIME_KEYS = new Set(['time', 'Time', 'timestamp', 'Timestamp', 'slot', 'Slot', 'hour', 'Hour', 'date', 'Date']);
const METRIC_KEYS = new Set(['TCall', 'TCalls', 'total_calls', 'Min', 'Minutes', 'ASR', 'ACD']);

// ─────────────────────────────────────────────────────────────
// Timestamp parsing
// ─────────────────────────────────────────────────────────────

export function parseRowTs(raw) {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number') return raw;

  if (typeof raw === 'string') {
    let s = raw.trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00';
    if (!(/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s))) s += 'Z';
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : NaN;
  }

  return NaN;
}

// ─────────────────────────────────────────────────────────────
// Pair conversion
// ─────────────────────────────────────────────────────────────

function parseXValue(x) {
  if (x instanceof Date) return x.getTime();
  if (typeof x === 'number') return x;
  return Date.parse(x);
}

export function toPairs(arr) {
  if (!Array.isArray(arr)) return [];

  return arr
    .filter(d => d && d.x != null && (d.y == null || isFinite(Number(d.y))))
    .map(d => [parseXValue(d.x), d.y == null ? null : Number(d.y)])
    .filter(p => Number.isFinite(p[0]));
}

// ─────────────────────────────────────────────────────────────
// Gap handling
// ─────────────────────────────────────────────────────────────

function shouldInsertGap(prevT, currT, stepMs) {
  if (prevT == null) return false;

  const diff = currT - prevT;
  const is5m = stepMs <= 5 * 60e3;
  const approxHourJump = is5m && Math.abs(diff - 3600e3) <= 3 * stepMs;

  // allow gaps up to 2h 5m or 2.2x step
  const threshold = Math.max(stepMs * 2.2, GAP_THRESHOLD_MINUTES * 60 * 1000);

  return !approxHourJump && diff > threshold;
}

export function withGapBreaks(pairs, stepMs) {
  try {
    if (!Array.isArray(pairs) || !pairs.length || !Number.isFinite(stepMs)) {
      return pairs || [];
    }

    const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
    const out = [];
    let prevT = null;

    for (const [t, y] of sorted) {
      if (shouldInsertGap(prevT, t, stepMs)) {
        out.push([t, null]);
      }
      out.push([t, y]);
      prevT = t;
    }

    return out;
  } catch (e) {
    logError(ErrorCategory.CHART, 'dataTransform:withGapBreaks', e);
    return pairs || [];
  }
}

export function shiftForwardPairs(pairs, deltaMs) {
  try {
    if (!Array.isArray(pairs) || !pairs.length || !Number.isFinite(deltaMs)) {
      return [];
    }
    return pairs.map(([t, y]) => [Number(t) + deltaMs, y]);
  } catch (e) {
    logError(ErrorCategory.CHART, 'dataTransform:shiftForwardPairs', e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Bar width
// ─────────────────────────────────────────────────────────────

export function chooseBarWidthPx(interval) {
  return BAR_WIDTH_MAP[interval] || 10;
}

// ─────────────────────────────────────────────────────────────
// Center points
// ─────────────────────────────────────────────────────────────

export function buildCenters(fromTs, toTs, stepMs) {
  const centers = [];

  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || !Number.isFinite(stepMs) || stepMs <= 0) {
    return centers;
  }

  const start = Math.floor(fromTs / stepMs) * stepMs;
  const end = Math.ceil(toTs / stepMs) * stepMs;
  const halfStep = Math.floor(stepMs / 2);

  for (let t = start; t <= end; t += stepMs) {
    centers.push(t + halfStep);
  }

  return centers;
}

// ─────────────────────────────────────────────────────────────
// Pair building
// ─────────────────────────────────────────────────────────────

function getSourceArray(opts, d, srcOverride) {
  if (Array.isArray(srcOverride) && srcOverride.length) return srcOverride;
  if (Array.isArray(opts.acdSeries) && opts.acdSeries.length) return opts.acdSeries;
  if (Array.isArray(d?.ACD)) return d.ACD;
  if (Array.isArray(d)) return d;
  return [];
}

function snapToCenter(t, step) {
  if (!Number.isFinite(step) || step <= 0) return t;
  const base = Math.floor(t / step) * step;
  return base + Math.floor(step / 2);
}

export function buildPairs(opts, d, srcOverride) {
  const src = getSourceArray(opts, d, srcOverride);
  const pairs = toPairs(src).sort((a, b) => a[0] - b[0]);
  const step = Number(opts.stepMs) || getStepMs(opts.interval);

  const map = new Map();
  for (const [t, y] of pairs) {
    if (y == null || isNaN(y)) continue;
    const x = snapToCenter(t, step);
    map.set(x, Number(y));
  }

  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

export function makePairSets(opts, d, srcArr, centers) {
  const currPairs = buildPairs(opts, d, srcArr);
  const currMap = new Map(currPairs);

  const timestamps = (Array.isArray(centers) && centers.length > 0)
    ? centers
    : currPairs.map(p => p[0]);

  const curr = [];
  const prev = [];

  for (const c of timestamps) {
    const yCur = currMap.get(c);
    if (yCur != null && !isNaN(yCur)) curr.push([c, yCur]);

    const yPrev = currMap.get(c - DAY_MS);
    if (yPrev != null && !isNaN(yPrev)) prev.push([c, yPrev]);
  }

  return { curr, prev };
}

// ─────────────────────────────────────────────────────────────
// Provider key detection
// ─────────────────────────────────────────────────────────────

// unified collector with optional filter
function collectUniquesByKey(rows, { includeLower = null, excludeKeys = null, stringsOnly = false, maxUniques = 200 } = {}) {
  const uniquesByKey = new Map();
  const rowCount = rows.length;

  for (let i = 0; i < rowCount; i++) {
    const r = rows[i];
    if (!r || typeof r !== 'object') continue;

    const keys = Object.keys(r);
    const keyCount = keys.length;

    for (let j = 0; j < keyCount; j++) {
      const k = keys[j];

      // filter by include set (case-insensitive)
      if (includeLower && !includeLower.has(k.toLowerCase())) continue;
      // filter by exclude set
      if (excludeKeys && excludeKeys.has(k)) continue;

      const v = r[k];
      if (v == null) continue;

      // strings only mode
      if (stringsOnly && typeof v !== 'string') continue;

      const s = typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : '');
      if (!s) continue;

      let set = uniquesByKey.get(k);
      if (!set) {
        set = new Set();
        uniquesByKey.set(k, set);
      }
      set.add(s);

      if (set.size > maxUniques) break;
    }
  }

  return uniquesByKey;
}

function findBestKey(uniquesByKey, minUniques = 2) {
  const eligible = Array.from(uniquesByKey.entries())
    .filter(([, set]) => (set?.size || 0) >= minUniques)
    .sort((a, b) => b[1].size - a[1].size);

  return eligible.length ? eligible[0][0] : null;
}

export function detectProviderKey(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;

  // try known provider key candidates first
  const candidateUniques = collectUniquesByKey(rows, { includeLower: PROVIDER_KEY_CANDIDATES_LOWER });
  const candidateKey = findBestKey(candidateUniques);
  if (candidateKey) return candidateKey;

  // fallback: find any string key with multiple unique values
  const excludeKeys = new Set([...TIME_KEYS, ...METRIC_KEYS]);
  const stringUniques = collectUniquesByKey(rows, { excludeKeys, stringsOnly: true });

  return findBestKey(stringUniques);
}
