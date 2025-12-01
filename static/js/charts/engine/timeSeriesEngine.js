// static/js/charts/engine/timeSeriesEngine.js
// Responsibility: Time series binning and aggregation for charts
import { parseRowTs } from '../echarts/helpers/dataTransform.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const METRIC_NAMES = ['TCalls', 'ASR', 'Minutes', 'ACD'];
const TIME_KEYS = ['time', 'slot', 'hour', 'Time', 'timestamp'];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function getRowTimestamp(row) {
  for (const k of TIME_KEYS) {
    if (row[k] != null) return parseRowTs(row[k]);
  }
  return NaN;
}

function createEmptyBins(count, alignedFrom, stepMs) {
  return Array.from({ length: count }, (_, i) => ({
    x: alignedFrom + i * stepMs,
    sum: 0,
    count: 0
  }));
}

// ─────────────────────────────────────────────────────────────
// Metric extraction
// ─────────────────────────────────────────────────────────────

function extractMetrics(row) {
  return {
    tcall: Number(row.TCall ?? row.TCalls ?? row.total_calls ?? 0) || 0,
    asr: Number(row.ASR ?? 0),
    min: Number(row.Min ?? row.Minutes ?? 0) || 0,
    acd: Number(row.ACD ?? 0)
  };
}

// ─────────────────────────────────────────────────────────────
// Bin value computation
// ─────────────────────────────────────────────────────────────

function getBinValue(bin, isAverage) {
  if (!bin || !bin.count) return null;
  return isAverage ? bin.sum / bin.count : bin.sum;
}

function binsToSeries({ binsArr, binCount, alignedFrom, fromTs, toTs, stepMs, isAverage }) {
  const out = [];

  // add all bins
  for (let i = 0; i < binCount; i++) {
    const bin = binsArr[i];
    if (bin) {
      out.push({ x: bin.x, y: getBinValue(bin, isAverage) });
    }
  }

  // add explicit edge points
  const leftIdx = clamp(Math.floor((fromTs - alignedFrom) / stepMs), 0, binCount - 1);
  const rightIdx = clamp(Math.floor((toTs - 1 - alignedFrom) / stepMs), 0, binCount - 1);

  const leftBin = binsArr[leftIdx];
  const rightBin = binsArr[rightIdx];

  if (leftBin) out.push({ x: fromTs, y: getBinValue(leftBin, isAverage) });
  if (rightBin) out.push({ x: toTs, y: getBinValue(rightBin, isAverage) });

  // sort and dedupe
  out.sort((a, b) => a.x - b.x);

  const deduped = [];
  for (const p of out) {
    if (deduped.length && deduped[deduped.length - 1].x === p.x) {
      deduped[deduped.length - 1] = p;
    } else {
      deduped.push(p);
    }
  }

  return deduped;
}

// ─────────────────────────────────────────────────────────────
// Main binning function
// ─────────────────────────────────────────────────────────────

export function computeBinsAndSeries(rows, { fromTs, toTs, stepMs }) {
  const alignedFrom = Math.floor((fromTs - stepMs) / stepMs) * stepMs;
  const alignedTo = Math.ceil((toTs + stepMs) / stepMs) * stepMs;
  const binCount = Math.max(1, Math.ceil((alignedTo - alignedFrom) / stepMs));

  // create bins for each metric
  const bins = {
    TCalls: createEmptyBins(binCount, alignedFrom, stepMs),
    ASR: createEmptyBins(binCount, alignedFrom, stepMs),
    Minutes: createEmptyBins(binCount, alignedFrom, stepMs),
    ACD: createEmptyBins(binCount, alignedFrom, stepMs)
  };

  const includeLo = fromTs - 2 * stepMs;
  const includeHi = toTs + 2 * stepMs;

  // aggregate rows into bins
  for (const r of rows || []) {
    const t = getRowTimestamp(r);
    if (!Number.isFinite(t)) continue;
    if (t < includeLo || t > includeHi) continue;

    const idx = clamp(Math.floor((t - alignedFrom) / stepMs), 0, binCount - 1);
    const { tcall, asr, min, acd } = extractMetrics(r);

    // totals (sum)
    bins.TCalls[idx].sum += tcall;
    bins.TCalls[idx].count += 1;
    bins.Minutes[idx].sum += min;
    bins.Minutes[idx].count += 1;

    // weighted averages
    if (tcall > 0 && Number.isFinite(asr)) {
      bins.ASR[idx].sum += asr * tcall;
      bins.ASR[idx].count += tcall;
    }
    if (min > 0 && Number.isFinite(acd)) {
      bins.ACD[idx].sum += acd * min;
      bins.ACD[idx].count += min;
    }
  }

  // convert bins to series
  const toSeriesParams = { binCount, alignedFrom, fromTs, toTs, stepMs };

  const series = {
    TCalls: binsToSeries({ binsArr: bins.TCalls, ...toSeriesParams, isAverage: false }),
    ASR: binsToSeries({ binsArr: bins.ASR, ...toSeriesParams, isAverage: true }),
    Minutes: binsToSeries({ binsArr: bins.Minutes, ...toSeriesParams, isAverage: false }),
    ACD: binsToSeries({ binsArr: bins.ACD, ...toSeriesParams, isAverage: true })
  };

  return { bins, series, alignedFrom, alignedTo, binCount };
}

// ─────────────────────────────────────────────────────────────
// Data builders
// ─────────────────────────────────────────────────────────────

function formatTime(ts) {
  return new Date(ts).toISOString().slice(11, 16);
}

export function buildBarHybridData(bins, fromTs, toTs, stepMs) {
  const tol = stepMs / 2;

  const bars = (bins.TCalls || [])
    .filter(b => b.x >= fromTs - tol && b.x < toTs + tol)
    .map(b => ({ x: formatTime(b.x), y: b.sum }));

  const line = (bins.Minutes || [])
    .filter(b => b.x >= fromTs - tol && b.x <= toTs + tol)
    .map(b => ({ x: b.x, y: b.sum }));

  return { bars, line };
}

export function buildHeatmapData(bins) {
  const cellMap = new Map();

  for (const b of bins.TCalls || []) {
    const d = new Date(b.x);
    const day = d.toISOString().slice(0, 10);
    const hhmm = d.toISOString().slice(11, 16);
    const key = `${day}|${hhmm}`;

    cellMap.set(key, (cellMap.get(key) || 0) + (b.sum || 0));
  }

  return Array.from(cellMap.entries()).map(([key, v]) => {
    const [day, hhmm] = key.split('|');
    return { x: hhmm, y: day, v };
  });
}

// ─────────────────────────────────────────────────────────────
// Interval conversion
// ─────────────────────────────────────────────────────────────

const INTERVAL_STEPS = {
  '1m': 60e3,
  '5m': 5 * 60e3,
  '1h': 3600e3,
  '1d': 24 * 3600e3,
  '1w': 6 * 3600e3,
  '1M': 24 * 3600e3
};

export function intervalToStep(interval) {
  return INTERVAL_STEPS[interval] || 3600e3;
}

// ─────────────────────────────────────────────────────────────
// Payload shaping
// ─────────────────────────────────────────────────────────────

export function shapeChartPayload(rows, { type, fromTs, toTs, stepMs, height }) {
  const { bins, series } = computeBinsAndSeries(rows, { fromTs, toTs, stepMs });

  if (type === 'line') {
    return {
      data: {
        TCalls: series.TCalls,
        ASR: series.ASR,
        Minutes: series.Minutes,
        ACD: series.ACD
      },
      options: { height, fromTs, toTs, xDomain: [fromTs, toTs] }
    };
  }

  if (type === 'bar') {
    return {
      data: buildBarHybridData(bins, fromTs, toTs, stepMs).bars,
      options: {
        height,
        fromTs,
        toTs,
        tCallsSeries: series.TCalls,
        asrSeries: series.ASR,
        minutesSeries: series.Minutes,
        acdSeries: series.ACD
      }
    };
  }

  return { data: null, options: { height: height || 0 } };
}
