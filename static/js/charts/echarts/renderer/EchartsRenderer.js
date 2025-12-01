// static/js/charts/echarts/renderer/EchartsRenderer.js
// Responsibility: ECharts initialization and option management
import * as echarts from 'echarts';
import { attach as attachZoom, applyRange as applyZoomRange } from '../services/zoomManager.js';
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DIMENSION_CHECK_INTERVAL = 32;
const DIMENSION_MAX_WAIT = 1000;
const RESIZE_DEBOUNCE = 100;

// ─────────────────────────────────────────────────────────────
// Container helpers
// ─────────────────────────────────────────────────────────────

export function ensureContainer(container, tag = 'EchartsRenderer') {
  if (typeof container === 'string') {
    const el = document.querySelector(container);
    if (!el) throw new Error(`[${tag}] Container not found: ${container}`);
    return el;
  }
  if (!container) throw new Error(`[${tag}] Container is required`);
  return container;
}

export function hasDimensions(el) {
  if (!el) return false;
  const w = el.clientWidth || el.getBoundingClientRect().width;
  const h = el.clientHeight || el.getBoundingClientRect().height;
  return w > 0 && h > 0;
}

export function waitForDimensions(el, maxWait = DIMENSION_MAX_WAIT) {
  return new Promise((resolve) => {
    if (hasDimensions(el)) return resolve(true);

    const start = Date.now();
    const interval = setInterval(() => {
      if (hasDimensions(el)) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > maxWait) {
        clearInterval(interval);
        resolve(false);
      }
    }, DIMENSION_CHECK_INTERVAL);
  });
}

// ─────────────────────────────────────────────────────────────
// Dispose helpers
// ─────────────────────────────────────────────────────────────

export function disposeExisting(el) {
  try {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  } catch (e) {
    logError(ErrorCategory.CHART, 'EchartsRenderer:disposeExisting', e);
  }
}

export function isDisposed(chart) {
  return !chart || (typeof chart.isDisposed === 'function' && chart.isDisposed());
}

// ─────────────────────────────────────────────────────────────
// Resize observer
// ─────────────────────────────────────────────────────────────

function createResizeObserver(chart) {
  let resizeTimeout = null;

  const observer = new ResizeObserver(() => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      try {
        chart.resize();
      } catch (e) {
        logError(ErrorCategory.CHART, 'EchartsRenderer:resize', e);
      }
    }, RESIZE_DEBOUNCE);
  });

  return observer;
}

function attachResizeObserver(chart, el) {
  const observer = createResizeObserver(chart);
  observer.observe(el);

  // store for cleanup
  chart.__resizeObserver = observer;

  // wrap dispose to cleanup observer
  const originalDispose = chart.dispose;
  chart.dispose = function () {
    if (this.__resizeObserver) {
      this.__resizeObserver.disconnect();
      delete this.__resizeObserver;
    }
    originalDispose.call(this);
  };
}

// ─────────────────────────────────────────────────────────────
// Main exports
// ─────────────────────────────────────────────────────────────

export async function initChart(container) {
  const el = ensureContainer(container);

  await waitForDimensions(el);

  if (!hasDimensions(el)) {
    console.warn('[EchartsRenderer] Container has no dimensions, skipping init');
    return null;
  }

  disposeExisting(el);

  const chart = echarts.init(el);
  attachResizeObserver(chart, el);

  return chart;
}

export function setOptionWithZoomSync(chart, option, { onAfterSet, onDataZoom } = {}) {
  if (isDisposed(chart)) return;

  chart.setOption(option, { notMerge: true, lazyUpdate: true });

  // apply persisted zoom range
  if (!isDisposed(chart)) {
    try {
      applyZoomRange(chart);
    } catch (e) {
      logError(ErrorCategory.CHART, 'EchartsRenderer:applyZoom', e);
    }
  }

  // attach zoom handler
  if (!isDisposed(chart)) {
    try {
      attachZoom(chart, { onZoom: onDataZoom });
    } catch (e) {
      logError(ErrorCategory.CHART, 'EchartsRenderer:attachZoom', e);
    }
  }

  // callback
  if (typeof onAfterSet === 'function') {
    try {
      onAfterSet();
    } catch (e) {
      logError(ErrorCategory.CHART, 'EchartsRenderer:onAfterSet', e);
    }
  }
}
