// static/js/utils/metrics.js
// Responsibility: Metric parsing, formatting, and anomaly detection

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ANOMALY_THRESHOLD = 10;
const NO_ANOMALY_METRICS = new Set(['Min', 'SCall', 'TCall']);
const DECIMAL_METRICS = new Set(['ACD', 'ASR']);

// ─────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────

export function parseNum(val) {
  if (val == null) return NaN;
  if (typeof val === 'number') return val;
  const n = parseFloat(val.toString().replace(/[\s,]/g, ''));
  return isNaN(n) ? NaN : n;
}

// ─────────────────────────────────────────────────────────────
// Delta calculations
// ─────────────────────────────────────────────────────────────

export function computeDeltaPercent(curr, prev) {
  const a = parseNum(curr);
  const b = parseNum(prev);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(b) === 0) return a === 0 ? 0 : 100;
  return ((a - b) / Math.abs(b)) * 100;
}

export function pickDeltaDisplay(curr, prev, providedDelta) {
  const dp = computeDeltaPercent(curr, prev);
  let r = typeof dp === 'number' ? Math.round(dp) : null;

  if (r == null && Number.isFinite(parseNum(providedDelta))) {
    r = Math.round(parseNum(providedDelta));
  }

  if (!r || r === 0) return { display: '', className: '' };

  return {
    display: Math.abs(r).toString(),
    className: r > 0 ? 'cell-positive' : 'cell-negative'
  };
}

// ─────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────

export function formatMetricValue(name, val) {
  const n = parseNum(val);
  if (!Number.isFinite(n)) return val ?? '';

  if (name === 'Min') return Math.round(n);
  if (DECIMAL_METRICS.has(name)) return Number.isInteger(n) ? n : +n.toFixed(1);
  return n;
}

// ─────────────────────────────────────────────────────────────
// Anomaly detection
// ─────────────────────────────────────────────────────────────

export function getAnomalyClass(metric, value, yesterdayValue, deltaPercent) {
  if (NO_ANOMALY_METRICS.has(metric)) return '';
  if (typeof deltaPercent !== 'number') return '';
  if (deltaPercent <= -ANOMALY_THRESHOLD) return 'cell-negative';
  if (deltaPercent >= ANOMALY_THRESHOLD) return 'cell-positive';
  return '';
}
