// static/js/charts/engine/timeSeriesEngine.js

import { parseUtc } from '../../utils/date.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function parseRowTs(raw) {
  let t = NaN;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'string') {
    try {
      let s = String(raw).trim().replace(' ', 'T');
      if (/([+-]\d{2})(\d{2})$/.test(s)) s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s = s + ':00';
      const hasTZ = /[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s);
      if (!hasTZ) s = s + 'Z';
      t = Date.parse(s);
    } catch(_) {}
    if (!isFinite(t)) {
      try { t = parseUtc(String(raw)); } catch(_) {}
    }
  }
  return Number.isFinite(t) ? t : NaN;
}

export function computeBinsAndSeries(rows, { fromTs, toTs, stepMs }) {
  const alignedFrom = Math.floor((fromTs - stepMs) / stepMs) * stepMs;
  const alignedTo = Math.ceil((toTs + stepMs) / stepMs) * stepMs;
  const binCount = Math.max(1, Math.ceil((alignedTo - alignedFrom) / stepMs));
  const makeBins = () => Array.from({ length: binCount }, (_, i) => ({ x: alignedFrom + i * stepMs, sum: 0, count: 0 }));
  const bins = {
    TCalls: makeBins(),
    ASR: makeBins(),
    Minutes: makeBins(),
    ACD: makeBins(),
  };

  const includeLo = fromTs - 2 * stepMs;
  const includeHi = toTs + 2 * stepMs;

  for (const r of (rows || [])) {
    const raw = r.time || r.slot || r.hour || r.Time || r.timestamp;
    const t = parseRowTs(raw);
    if (!Number.isFinite(t)) continue;
    if (t < includeLo || t > includeHi) continue;
    const idx = clamp(Math.floor((t - alignedFrom) / stepMs), 0, binCount - 1);
    const tcall = Number(r.TCall ?? r.TCalls ?? r.total_calls ?? 0) || 0;
    const asr = Number(r.ASR ?? 0) || 0;
    const min = Number(r.Min ?? r.Minutes ?? 0) || 0;
    const acd = Number(r.ACD ?? 0) || 0;
    bins.TCalls[idx].sum += tcall; bins.TCalls[idx].count += 1;
    bins.Minutes[idx].sum += min; bins.Minutes[idx].count += 1;
    bins.ASR[idx].sum += asr; bins.ACD[idx].sum += acd;
    bins.ASR[idx].count += 1; bins.ACD[idx].count += 1;
  }

  const valOf = (b, avg) => (b.count ? (avg ? (b.sum / b.count) : b.sum) : null);
  const toSeries = (name, avg) => {
    const out = [];
    for (let i = 0; i < binCount; i++) {
      const bin = bins[name][i];
      out.push({ x: bin.x, y: valOf(bin, avg) });
    }
    // explicit edges
    const li = clamp(Math.floor((fromTs - alignedFrom) / stepMs), 0, binCount - 1);
    const ri = clamp(Math.floor(((toTs - 1) - alignedFrom) / stepMs), 0, binCount - 1);
    out.push({ x: fromTs, y: valOf(bins[name][li], avg) });
    out.push({ x: toTs, y: valOf(bins[name][ri], avg) });
    // sort and dedupe by x preferring last
    out.sort((a,b) => a.x - b.x);
    const dedup = [];
    for (const p of out) {
      if (dedup.length && dedup[dedup.length-1].x === p.x) dedup[dedup.length-1] = p; else dedup.push(p);
    }
    return dedup;
  };

  const series = {
    TCalls: toSeries('TCalls', false),
    ASR: toSeries('ASR', true),
    Minutes: toSeries('Minutes', false),
    ACD: toSeries('ACD', true),
  };

  return { bins, series, alignedFrom, alignedTo, binCount };
}

export function buildBarHybridData(bins, fromTs, toTs, stepMs) {
  const fmt = (ts) => new Date(ts).toISOString().slice(11,16);
  const tol = stepMs / 2;
  const bars = (bins.TCalls || []).filter(b => b.x >= (fromTs - tol) && b.x < (toTs + tol)).map(b => ({ x: fmt(b.x), y: b.sum }));
  const line = (bins.Minutes || []).filter(b => b.x >= (fromTs - tol) && b.x <= (toTs + tol)).map(b => ({ x: b.x, y: b.sum }));
  return { bars, line };
}

export function buildHeatmapData(bins) {
  const cellMap = new Map();
  const keyOf = (day, hhmm) => `${day}|${hhmm}`;
  (bins.TCalls || []).forEach(b => {
    const d = new Date(b.x);
    const day = d.toISOString().slice(0,10);
    const hhmm = d.toISOString().slice(11,16);
    const k = keyOf(day, hhmm);
    const prev = cellMap.get(k) || 0;
    cellMap.set(k, prev + (b.sum || 0));
  });
  return Array.from(cellMap.entries()).map(([k, v]) => {
    const [day, hhmm] = k.split('|');
    return { x: hhmm, y: day, v };
  });
}

export function intervalToStep(interval) {
  switch (interval) {
    case '1m': return 60e3;
    case '5m': return 5 * 60e3;
    case '1h': return 3600e3;
    case '1d': return 24 * 3600e3; // day view by day
    case '1w': return 6 * 3600e3;  // 6-hour buckets
    case '1M': return 24 * 3600e3; // daily buckets
    default: return 3600e3;
  }
}

// Unified helper for d3-dashboard thin facade
export function shapeChartPayload(rows, { type, fromTs, toTs, stepMs, height }) {
  const { bins, series } = computeBinsAndSeries(rows, { fromTs, toTs, stepMs });
  let data = null;
  let options = { height: height || 0 };
  if (type === 'line') {
    data = {
      TCalls: series.TCalls,
      ASR: series.ASR,
      Minutes: series.Minutes,
      ACD: series.ACD,
    };
    options = { height, fromTs, toTs, xDomain: [fromTs, toTs] };
  } else if (type === 'bar') {
    data = buildBarHybridData(bins, fromTs, toTs, stepMs).bars;
    options = { height };
  } else if (type === 'hybrid') {
    const bh = buildBarHybridData(bins, fromTs, toTs, stepMs);
    data = { bars: bh.bars, line: bh.line };
    options = { height };
  } else if (type === 'heatmap') {
    data = buildHeatmapData(bins);
    options = { height };
  }
  return { data, options };
}
