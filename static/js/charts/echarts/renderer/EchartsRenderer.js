// static/js/charts/echarts/renderer/EchartsRenderer.js
// init + setOption + zoom sync (no business logic)
import * as echarts from 'echarts';
import { attach as attachZoom, applyRange as applyZoomRange } from '../services/zoomManager.js';

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
  } catch (_) {
    // ignore
  }
  return null;
}

export function initChart(container) {
  // move logic
  const el = ensureContainer(container);
  try {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  } catch (_) { }
  const chart = echarts.init(el);

  // Adaptive resize observer with debounce to avoid resize during init
  let resizeTimeout = null;
  const ro = new ResizeObserver(() => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      try { chart.resize(); } catch (_) { }
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
  // move logic
  chart.setOption(option, { notMerge: true, lazyUpdate: true });
  // apply persisted zoom range (if exists)
  try { applyZoomRange(chart); } catch (_) { }
  // attach unified zoom handler
  try { attachZoom(chart, { onZoom: onDataZoom }); } catch (_) { }
  try { if (typeof onAfterSet === 'function') onAfterSet(); } catch (_) { }
}
