// static/js/charts/echarts/renderer/EchartsRenderer.js
// init + setOption + zoom sync (no business logic)
import * as echarts from 'echarts';
import { attach as attachZoom, applyRange as applyZoomRange } from '../services/zoomManager.js';
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';

function ensureContainer(container) {
  // refactor
  if (typeof container === 'string') {
    const el = document.querySelector(container);
    if (!el) throw new Error(`[EchartsRenderer] Container not found: ${container}`);
    return el;
  }
  if (!container) throw new Error('[EchartsRenderer] Container is required');
  return container;
}

function getZoomRange(chart) {
  // refactor
  try {
    const model = chart.getModel();
    const xa = model && model.getComponent('xAxis', 0);
    const scale = xa && xa.axis && xa.axis.scale;
    if (scale && typeof scale.getExtent === 'function') {
      const ext = scale.getExtent();
      const fromTs = Math.floor(ext[0]);
      const toTs = Math.ceil(ext[1]);
      if (Number.isFinite(fromTs) && Number.isFinite(toTs) && toTs > fromTs) return { fromTs, toTs };
    }
  } catch (e) { logError(ErrorCategory.CHART, 'EchartsRenderer', e);
    // ignore
  }
  return null;
}

// Wait for element to have dimensions, returns true if valid
async function waitForDimensions(el, maxWait = 1000) {
  return new Promise((resolve) => {
    const check = () => {
      const w = el.clientWidth || el.getBoundingClientRect().width;
      const h = el.clientHeight || el.getBoundingClientRect().height;
      return w > 0 && h > 0;
    };
    if (check()) return resolve(true);
    const start = Date.now();
    const interval = setInterval(() => {
      if (check()) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > maxWait) {
        clearInterval(interval);
        resolve(false);
      }
    }, 32);
  });
}

// Check if element has valid dimensions
function hasDimensions(el) {
  if (!el) return false;
  const w = el.clientWidth || el.getBoundingClientRect().width;
  const h = el.clientHeight || el.getBoundingClientRect().height;
  return w > 0 && h > 0;
}

export async function initChart(container) {
  const el = ensureContainer(container);
  // Wait for container to have dimensions
  await waitForDimensions(el);
  // Return null if still no dimensions
  if (!hasDimensions(el)) {
    console.warn('[EchartsRenderer] Container has no dimensions, skipping init');
    return null;
  }
  try {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  } catch (e) { logError(ErrorCategory.CHART, 'EchartsRenderer', e); }
  const chart = echarts.init(el);

  // Adaptive resize observer with debounce to avoid resize during init
  let resizeTimeout = null;
  const ro = new ResizeObserver(() => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      try { chart.resize(); } catch (e) { logError(ErrorCategory.CHART, 'EchartsRenderer', e); }
    }, 100);
  });
  ro.observe(el);

  // Cleanup on dispose
  chart.__resizeObserver = ro;
  const originalDispose = chart.dispose;
  chart.dispose = function () {
    if (this.__resizeObserver) {
      this.__resizeObserver.disconnect();
      delete this.__resizeObserver;
    }
    originalDispose.call(this);
  };

  return chart;
}

export function setOptionWithZoomSync(chart, option, { onAfterSet, onDataZoom } = {}) {
  // Skip if chart is disposed
  if (!chart || (typeof chart.isDisposed === 'function' && chart.isDisposed())) {
    return;
  }
  // move logic
  chart.setOption(option, { notMerge: true, lazyUpdate: true });
  // apply persisted zoom range (if exists)
  try { if (!chart.isDisposed()) applyZoomRange(chart); } catch (e) { logError(ErrorCategory.CHART, 'EchartsRenderer', e); }
  // attach unified zoom handler
  try { if (!chart.isDisposed()) attachZoom(chart, { onZoom: onDataZoom }); } catch (e) { logError(ErrorCategory.CHART, 'EchartsRenderer', e); }
  try { if (typeof onAfterSet === 'function') onAfterSet(); } catch (e) { logError(ErrorCategory.CHART, 'EchartsRenderer', e); }
}
