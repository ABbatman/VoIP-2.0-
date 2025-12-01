// static/js/charts/echarts/services/zoomManager.js
// Responsibility: Centralized zoom range management and policy enforcement
import { toast } from '../../../ui/notify.js';
import {
  getChartsZoomRange,
  setChartsZoomRange,
  getChartsCurrentInterval,
  setChartsCurrentInterval
} from '../../../state/runtimeFlags.js';
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 3600e3;
const MAX_5M_RANGE_DAYS = 5;
const POLICY_THROTTLE_MS = 600;
const TOAST_DURATION = 3500;

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let lastPolicySwitchTs = 0;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isDisposed(chart) {
  return !chart || (typeof chart.isDisposed === 'function' && chart.isDisposed());
}

function getModelRange(chart) {
  try {
    const model = chart.getModel();
    const xAxis = model?.getComponent('xAxis', 0);
    const scale = xAxis?.axis?.scale;

    if (scale && typeof scale.getExtent === 'function') {
      const [min, max] = scale.getExtent();
      const fromTs = Math.floor(min);
      const toTs = Math.ceil(max);

      if (Number.isFinite(fromTs) && Number.isFinite(toTs) && toTs > fromTs) {
        return { fromTs, toTs };
      }
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'zoomManager:getModelRange', e);
  }

  return null;
}

function isValidRange(range) {
  return range &&
    Number.isFinite(range.fromTs) &&
    Number.isFinite(range.toTs) &&
    range.toTs > range.fromTs;
}

// ─────────────────────────────────────────────────────────────
// Range API
// ─────────────────────────────────────────────────────────────

export function getRange() {
  return getChartsZoomRange();
}

export function setRange(range) {
  setChartsZoomRange(range);
}

// ─────────────────────────────────────────────────────────────
// Apply range to chart
// ─────────────────────────────────────────────────────────────

export function applyRange(chart) {
  if (isDisposed(chart)) return;

  try {
    const range = getRange();
    if (!isValidRange(range)) return;

    const opt = chart.getOption();
    const existing = opt?.dataZoom;
    if (!Array.isArray(existing) || !existing.length) return;

    // update only existing dataZoom components
    const updates = existing.map(() => ({
      startValue: range.fromTs,
      endValue: range.toTs
    }));

    chart.setOption({ dataZoom: updates }, { lazyUpdate: true });
  } catch (e) {
    logError(ErrorCategory.CHART, 'zoomManager:applyRange', e);
  }
}

// ─────────────────────────────────────────────────────────────
// Interval policy
// ─────────────────────────────────────────────────────────────

function shouldSwitchInterval(range) {
  const diffDays = (range.toTs - range.fromTs) / DAY_MS;
  const currentInterval = getChartsCurrentInterval();

  return currentInterval === '5m' &&
    Number.isFinite(diffDays) &&
    diffDays > MAX_5M_RANGE_DAYS;
}

function isThrottled() {
  const now = Date.now();
  if (now - lastPolicySwitchTs <= POLICY_THROTTLE_MS) {
    return true;
  }
  lastPolicySwitchTs = now;
  return false;
}

async function switchTo1hInterval() {
  try {
    toast('5-minute interval is available only for ranges up to 5 days. Switching to 1 hour.', {
      type: 'warning',
      duration: TOAST_DURATION
    });
  } catch (e) {
    logError(ErrorCategory.CHART, 'zoomManager:toast', e);
  }

  setChartsCurrentInterval('1h');

  try {
    const { publish } = await import('../../../state/eventBus.js');
    publish('charts:intervalChanged', { interval: '1h' });
  } catch (e) {
    logError(ErrorCategory.CHART, 'zoomManager:publish', e);
  }
}

function enforceIntervalPolicy(range) {
  if (!shouldSwitchInterval(range)) return;
  if (isThrottled()) return;

  switchTo1hInterval();
}

// ─────────────────────────────────────────────────────────────
// Attach zoom handler
// ─────────────────────────────────────────────────────────────

export function attach(chart, { onZoom } = {}) {
  if (isDisposed(chart)) return;

  // remove existing handler
  try {
    chart.off('dataZoom');
  } catch (e) {
    logError(ErrorCategory.CHART, 'zoomManager:detach', e);
  }

  // attach new handler
  chart.on('dataZoom', () => {
    const range = getModelRange(chart);
    if (!range) return;

    setRange(range);
    enforceIntervalPolicy(range);

    if (typeof onZoom === 'function') {
      try {
        onZoom(range);
      } catch (e) {
        logError(ErrorCategory.CHART, 'zoomManager:onZoom', e);
      }
    }
  });
}
