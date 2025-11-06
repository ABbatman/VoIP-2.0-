// static/js/charts/echarts/helpers/time.js
// time helpers: step detection and predicates
export function getStepMs(interval, fallbackStep) {
  // move logic
  if (Number.isFinite(fallbackStep)) return Number(fallbackStep);
  if (interval === '5m') return 5 * 60e3;
  if (interval === '1h') return 3600e3;
  if (interval === '1d') return 24 * 3600e3;
  return 3600e3;
}

export const isFiveMin = (interval) => String(interval) === '5m';
export const isHourly = (interval) => String(interval) === '1h';
