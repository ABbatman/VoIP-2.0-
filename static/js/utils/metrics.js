// static/js/utils/metrics.js
// Common helpers for metric parsing/formatting and anomaly classes

export function parseNum(val) {
  if (val == null) return NaN;
  if (typeof val === 'number') return val;
  const cleaned = val.toString().replace(/\s+/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
}

export function computeDeltaPercent(curr, prev) {
  const a = parseNum(curr);
  const b = parseNum(prev);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(b) === 0 && a !== 0) return 100;
  if (Math.abs(b) === 0 && a === 0) return 0;
  return ((a - b) / Math.abs(b)) * 100;
}

export function pickDeltaDisplay(curr, prev, providedDelta) {
  const dp = computeDeltaPercent(curr, prev);
  let r = null;
  if (typeof dp === 'number') r = Math.round(dp);
  else if (Number.isFinite(parseNum(providedDelta))) r = Math.round(parseNum(providedDelta));
  let display = '';
  let cls = '';
  if (r && r !== 0) {
    display = Math.abs(r).toString();
    cls = r > 0 ? 'cell-positive' : 'cell-negative';
  }
  return { display, className: cls };
}

export function formatMetricValue(name, val) {
  const n = parseNum(val);
  if (name === 'Min' && Number.isFinite(n)) return Math.round(n);
  if ((name === 'ACD' || name === 'ASR') && Number.isFinite(n)) {
    return Number.isInteger(n) ? n : Number(parseFloat(n.toFixed(1)));
  }
  return Number.isFinite(n) ? n : (val ?? '');
}

export function getAnomalyClass(metric, value, yesterdayValue, deltaPercent) {
  // Disable anomaly highlight for Min, SCall, TCall on ALL rows
  if (metric === 'Min' || metric === 'SCall' || metric === 'TCall') return '';
  if (typeof deltaPercent === 'number') {
    if (deltaPercent <= -10) return 'cell-negative';
    if (deltaPercent >= 10) return 'cell-positive';
  }
  return '';
}
