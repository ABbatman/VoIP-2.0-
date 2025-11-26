// static/js/charts/echarts/helpers/dataTransform.js
// pure data transforms (no ECharts)
import { getStepMs } from './time.js';

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

export function toPairs(arr) {
  // normalize array of {x,y} to [[t,y]]
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(d => d && d.x != null && (d.y == null || isFinite(Number(d.y))))
    .map(d => {
      const t = d.x instanceof Date ? d.x.getTime() : (typeof d.x === 'number' ? d.x : Date.parse(d.x));
      return [t, d.y == null ? null : Number(d.y)];
    })
    .filter(p => Number.isFinite(p[0]));
}

export function withGapBreaks(pairs, stepMs) {
  try {
    if (!Array.isArray(pairs) || pairs.length === 0 || !Number.isFinite(stepMs)) return pairs || [];
    const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
    const out = [];
    let prevT = null;
    for (const [t, y] of sorted) {
      const is5m = stepMs <= 5 * 60e3;
      const diff = prevT == null ? 0 : (t - prevT);
      const approxHourJump = is5m && Math.abs(diff - 3600e3) <= 3 * stepMs;
      // Allow gaps up to 2h 5m (125 mins) or 2.2x the step, whichever is larger.
      // This covers the 5m case (25 steps) and respects larger intervals like daily.
      const thr = Math.max(stepMs * 2.2, 125 * 60 * 1000);
      if (prevT != null && !approxHourJump && diff > thr) {
        out.push([t, null]);
      }
      out.push([t, y]);
      prevT = t;
    }
    return out;
  } catch (_) {
    return pairs || [];
  }
}

export function shiftForwardPairs(pairs, deltaMs) {
  try {
    if (!Array.isArray(pairs) || pairs.length === 0 || !Number.isFinite(deltaMs)) return [];
    return pairs.map(([t, y]) => [Number(t) + deltaMs, y]);
  } catch (_) {
    return [];
  }
}

// getStepMs is provided by helpers/time.js

export function chooseBarWidthPx(interval) {
  // refactor
  switch (interval) {
    case '5m': return 6;
    case '1h': return 10;
    case '1d': return 16;
    default: return 10;
  }
}

export function buildCenters(fromTs, toTs, stepMs) {
  // refactor
  const centers = [];
  if (Number.isFinite(fromTs) && Number.isFinite(toTs) && Number.isFinite(stepMs) && stepMs > 0) {
    const start = Math.floor(fromTs / stepMs) * stepMs;
    const end = Math.ceil(toTs / stepMs) * stepMs;
    for (let t = start; t <= end; t += stepMs) centers.push(t + Math.floor(stepMs / 2));
  }
  return centers;
}

export function buildPairs(opts, d, srcOverride) {
  // refactor
  let src = Array.isArray(srcOverride) && srcOverride.length
    ? srcOverride
    : (Array.isArray(opts.acdSeries) && opts.acdSeries.length
      ? opts.acdSeries
      : (Array.isArray(d?.ACD) ? d.ACD : (Array.isArray(d) ? d : [])));
  let pairs = toPairs(src).sort((a, b) => a[0] - b[0]);
  const step = Number(opts.stepMs) || getStepMs(opts.interval);
  const map = new Map();
  for (const [t, y] of pairs) {
    const base = Number.isFinite(step) && step > 0 ? Math.floor(t / step) * step : t;
    const x = Number.isFinite(step) && step > 0 ? (base + Math.floor(step / 2)) : base;
    if (y == null || isNaN(y)) continue;
    map.set(x, Number(y));
  }
  pairs = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  return pairs;
}

export function makePairSets(opts, d, srcArr, centers) {
  // refactor
  const currPairs = buildPairs(opts, d, srcArr);
  const currMap = new Map(currPairs);
  const curr = [];
  const prev = [];
  const dayMs = 24 * 3600e3;
  const hasCenters = (Array.isArray(centers) && centers.length > 0) ? centers : currPairs.map(p => p[0]);
  for (const c of hasCenters) {
    const yCur = currMap.get(c);
    if (yCur != null && !isNaN(yCur)) curr.push([c, yCur]);
    const yPrev = currMap.get(c - dayMs);
    if (yPrev != null && !isNaN(yPrev)) prev.push([c, yPrev]);
  }
  return { curr, prev };
}

export function detectProviderKey(rows) {
  // move logic
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const CANDIDATE_PROVIDER_KEYS = [
    'provider', 'Provider', 'supplier', 'Supplier', 'vendor', 'Vendor', 'carrier', 'Carrier', 'operator', 'Operator',
    'peer', 'Peer', 'trunk', 'Trunk', 'gateway', 'Gateway', 'route', 'Route', 'partner', 'Partner',
    'provider_name', 'supplier_name', 'vendor_name', 'carrier_name', 'peer_name',
    'providerId', 'supplierId', 'vendorId', 'carrierId', 'peerId',
    'provider_id', 'supplier_id', 'vendor_id', 'carrier_id', 'peer_id'
  ];
  const timeKeys = new Set(['time', 'Time', 'timestamp', 'Timestamp', 'slot', 'Slot', 'hour', 'Hour', 'date', 'Date']);
  const metricKeys = new Set(['TCall', 'TCalls', 'total_calls', 'Min', 'Minutes', 'ASR', 'ACD']);
  const lowerPref = CANDIDATE_PROVIDER_KEYS.map(k => k.toLowerCase());
  const candUniqs = new Map();
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    for (const k of Object.keys(r)) {
      const kl = String(k).toLowerCase();
      if (!lowerPref.includes(kl)) continue;
      const v = r[k];
      if (v == null) continue;
      const s = (typeof v === 'string') ? v.trim() : (typeof v === 'number' ? String(v) : '');
      if (!s) continue;
      let set = candUniqs.get(k);
      if (!set) { set = new Set(); candUniqs.set(k, set); }
      set.add(s);
      if (set.size > 200) break;
    }
  }
  const eligibleCand = Array.from(candUniqs.entries()).filter(([, set]) => (set?.size || 0) >= 2).sort((a, b) => b[1].size - a[1].size);
  if (eligibleCand.length) return eligibleCand[0][0];
  const keyUniqs = new Map();
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    for (const k of Object.keys(r)) {
      if (timeKeys.has(k) || metricKeys.has(k)) continue;
      const v = r[k];
      if (typeof v !== 'string') continue;
      const s = v.trim();
      if (!s) continue;
      let set = keyUniqs.get(k);
      if (!set) { set = new Set(); keyUniqs.set(k, set); }
      set.add(s);
      if (set.size > 200) break;
    }
  }
  const eligible = Array.from(keyUniqs.entries()).filter(([, set]) => set && set.size >= 2);
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => b[1].size - a[1].size);
  return eligible[0][0];
}
