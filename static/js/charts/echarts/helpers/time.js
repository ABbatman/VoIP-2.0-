// static/js/charts/echarts/helpers/time.js
// time helpers: step detection and predicates
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';
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
export function formatTimeRange(ts, stepMs) {
  // format time header as range based on step
  try {
    const step = Number(stepMs) || 3600e3;
    const dayMs = 24 * 3600e3;
    const start = Math.floor(Number(ts) / step) * step;
    const end = start + step;
    const pad = (n) => String(n).padStart(2, '0');
    const dS = new Date(start);
    const dE = new Date(end);
    if (step >= dayMs) {
      return `${dS.getFullYear()}-${pad(dS.getMonth()+1)}-${pad(dS.getDate())}`;
    }
    if (step >= 3600e3) {
      return `${pad(dS.getHours())}:00 – ${pad(dE.getHours())}:00`;
    }
    return `${pad(dS.getHours())}:${pad(dS.getMinutes())} – ${pad(dE.getHours())}:${pad(dE.getMinutes())}`;
  } catch (e) { logError(ErrorCategory.CHART, 'time', e); return ''; }
}
