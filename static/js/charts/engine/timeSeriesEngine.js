// static/js/charts/engine/timeSeriesEngine.js
// Responsibility: Time series binning and aggregation for charts
import { parseRowTs } from '../echarts/helpers/dataTransform.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Constants kept for future use
// const METRIC_NAMES = ['TCalls', 'ASR', 'Minutes', 'ACD'];
// const TIME_KEYS_SET = new Set(['time', 'slot', 'hour', 'Time', 'timestamp']);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function getRowTimestamp(row) {
  // fast path: check common keys first
  if (row.time != null) return parseRowTs(row.time);
  if (row.slot != null) return parseRowTs(row.slot);
  if (row.hour != null) return parseRowTs(row.hour);
  if (row.Time != null) return parseRowTs(row.Time);
  if (row.timestamp != null) return parseRowTs(row.timestamp);
  return NaN;
}

// create all metric bins in one pass
function createAllBins(binCount, alignedFrom, stepMs) {
  const bins = {
    TCalls: new Array(binCount),
    ASR: new Array(binCount),
    Minutes: new Array(binCount),
    ACD: new Array(binCount)
  };

  for (let i = 0; i < binCount; i++) {
    const x = alignedFrom + i * stepMs;
    bins.TCalls[i] = { x, sum: 0, count: 0 };
    bins.ASR[i] = { x, sum: 0, count: 0 };
    bins.Minutes[i] = { x, sum: 0, count: 0 };
    bins.ACD[i] = { x, sum: 0, count: 0 };
  }

  return bins;
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
  // pre-compute edge indices
  const leftIdx = clamp(Math.floor((fromTs - alignedFrom) / stepMs), 0, binCount - 1);
  const rightIdx = clamp(Math.floor((toTs - 1 - alignedFrom) / stepMs), 0, binCount - 1);

  // use Map for O(1) deduplication during build
  const seen = new Map();

  // add all bins
  for (let i = 0; i < binCount; i++) {
    const bin = binsArr[i];
    if (bin) {
      seen.set(bin.x, { x: bin.x, y: getBinValue(bin, isAverage) });
    }
  }

  // add explicit edge points (overwrite if exists)
  const leftBin = binsArr[leftIdx];
  const rightBin = binsArr[rightIdx];

  if (leftBin) seen.set(fromTs, { x: fromTs, y: getBinValue(leftBin, isAverage) });
  if (rightBin) seen.set(toTs, { x: toTs, y: getBinValue(rightBin, isAverage) });

  // convert to sorted array
  return Array.from(seen.values()).sort((a, b) => a.x - b.x);
}

// ─────────────────────────────────────────────────────────────
// Main binning function
// ─────────────────────────────────────────────────────────────

export function computeBinsAndSeries(rows, { fromTs, toTs, stepMs }) {
  // validate inputs
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || !stepMs || stepMs <= 0) {
    return { bins: null, series: { TCalls: [], ASR: [], Minutes: [], ACD: [] } };
  }

  const alignedFrom = Math.floor((fromTs - stepMs) / stepMs) * stepMs;
  const alignedTo = Math.ceil((toTs + stepMs) / stepMs) * stepMs;
  const binCount = Math.max(1, Math.min(10000, Math.ceil((alignedTo - alignedFrom) / stepMs)));

  // create all metric bins in one pass
  const bins = createAllBins(binCount, alignedFrom, stepMs);

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

  // handle invalid input case
  if (!bins) {
    return {
      data: type === 'line' ? { TCalls: [], ASR: [], Minutes: [], ACD: [] } : [],
      options: { height: height || 0, fromTs, toTs, xDomain: [fromTs, toTs] }
    };
  }

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
