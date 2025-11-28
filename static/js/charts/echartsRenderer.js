// static/js/charts/echartsRenderer.js
// Lightweight ECharts renderers parallel to existing D3 ones.
// This file does not alter existing dashboard wiring. Consumers can opt-in
// by importing and registering these renderers behind a feature flag.

import * as echarts from 'echarts';
import { renderBarChartEcharts as renderBarEcharts } from './echartsBarChart.js';
import { buildMultiOption } from './echarts/builders/MultiLineBuilder.js';
import { attach as attachZoom, applyRange as applyZoomRange } from './echarts/services/zoomManager.js';
import { makeBarLineLikeTooltip } from './echarts/helpers/tooltip.js';
import { getStepMs } from './echarts/helpers/time.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

export async function registerEchartsRenderers() {
  const { registerChart } = await import('./registry.js');
  registerChart('line', renderMultiLineChartEcharts);
  registerChart('bar', renderBarEcharts);
}

// Removed old tooltip helpers and unused builders (findPrevWithin, makeGrid, buildPrevDayPairs)

function ensureContainer(container) {
  if (typeof container === 'string') {
    const el = document.querySelector(container);
    if (!el) throw new Error(`[echartsRenderer] Container not found: ${container}`);
    return el;
  }
  if (!container) throw new Error('[echartsRenderer] Container is required');
  return container;
}


// Wait for element to have dimensions, returns true if dimensions are valid
function waitForDimensions(el, maxWait = 1000) {
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
        resolve(false); // timeout - dimensions still 0
      }
    }, 32);
  });
}

// Check if element has valid dimensions for ECharts
function hasDimensions(el) {
  if (!el) return false;
  const w = el.clientWidth || el.getBoundingClientRect().width;
  const h = el.clientHeight || el.getBoundingClientRect().height;
  return w > 0 && h > 0;
}

export async function renderMultiLineChartEcharts(container, data, options = {}) {
  const el = ensureContainer(container);
  
  // Wait for container to have dimensions before init
  await waitForDimensions(el);
  
  // Skip if still no dimensions (element hidden or not in DOM)
  if (!hasDimensions(el)) {
    console.warn('[echartsRenderer] Container has no dimensions, skipping render');
    return { update: () => {}, dispose: () => {}, getInstance: () => null };
  }
  
  try {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer', e);
    // Ignore existing chart disposal errors
  }
  const chart = echarts.init(el);
  const sliderEl = document.getElementById('chart-slider');
  let sliderChart = null;
  if (sliderEl && hasDimensions(sliderEl)) {
    await waitForDimensions(sliderEl);
    try {
      const existingSlider = echarts.getInstanceByDom(sliderEl);
      if (existingSlider) existingSlider.dispose();
    } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer', e); }
    sliderChart = echarts.init(sliderEl);
  }

  // Connect charts for synchronization
  if (chart && sliderChart) {
    echarts.connect([chart, sliderChart]);
  }

  // Fix: Allow scrolling when not zooming (Shift+Wheel = Zoom, Wheel = Scroll)
  el.addEventListener('wheel', (e) => {
    if (!e.shiftKey) {
      e.stopPropagation(); // Prevent ECharts from intercepting
    }
  }, { capture: true, passive: false });

  // use real container height for consistent grid layout
  const realHeight = el.clientHeight || el.getBoundingClientRect().height || options.height || 520;
  const base = {
    fromTs: options.fromTs || null,
    toTs: options.toTs || null,
    height: realHeight,
    interval: options.interval || (options.stepMs === 5 * 60e3 ? '5m' : (options.stepMs === 3600e3 ? '1h' : undefined)),
    noFiveMinData: !!options.noFiveMinData,
  };
  const { main, slider } = buildMultiOption({ data, ...base });
  try {
    const step = getStepMs(base.interval, undefined);
    main.tooltip = {
      ...(main.tooltip || {}),
      formatter: makeBarLineLikeTooltip({ chart, stepMs: step }),
      backgroundColor: 'rgba(255,255,255,0.98)',
      borderColor: '#e6e9ef',
      borderWidth: 1,
      padding: [9, 12],
      textStyle: { color: 'var(--ds-color-fg)' },
      extraCssText: 'border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.07); line-height:1.35;'
    };
  } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer', e); /* keep default tooltip */ }
  
  // Guard against disposed chart (can happen if render is called again before this completes)
  if (chart.isDisposed && chart.isDisposed()) return { update: () => {}, dispose: () => {}, getInstance: () => null };
  
  chart.setOption(main, { notMerge: true, lazyUpdate: true });
  if (sliderChart && slider && !(sliderChart.isDisposed && sliderChart.isDisposed())) {
    sliderChart.setOption(slider, { notMerge: true, lazyUpdate: true });
  }
  if (!(chart.isDisposed && chart.isDisposed())) {
    try { applyZoomRange(chart); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer', e); }
    try { attachZoom(chart); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer', e); }
  }
  if (sliderChart && !(sliderChart.isDisposed && sliderChart.isDisposed())) {
    try { applyZoomRange(sliderChart); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer', e); }
  }

  function update(newData = data, newOptions = {}) {
    // Guard against disposed chart
    if (chart.isDisposed && chart.isDisposed()) return;
    // use current container height for grid calculation
    const currentHeight = el.clientHeight || el.getBoundingClientRect().height || base.height;
    const merged = { ...base, ...newOptions, height: currentHeight };
    const { main: nextMain, slider: nextSlider } = buildMultiOption({ data: newData, ...merged });
    try {
      const step = getStepMs(merged.interval, undefined);
      nextMain.tooltip = {
        ...(nextMain.tooltip || {}),
        formatter: makeBarLineLikeTooltip({ chart, stepMs: step }),
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderColor: '#e6e9ef',
        borderWidth: 1,
        padding: [9, 12],
        textStyle: { color: 'var(--ds-color-fg)' },
        extraCssText: 'border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.07); line-height:1.35;'
      };
    } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer', e); /* keep default tooltip */ }
    if (chart.isDisposed && chart.isDisposed()) return;
    chart.setOption(nextMain, { notMerge: true, lazyUpdate: true });
    if (sliderChart && nextSlider && !(sliderChart.isDisposed && sliderChart.isDisposed())) {
      sliderChart.setOption(nextSlider, { notMerge: true, lazyUpdate: true });
    }
    try { if (!(chart.isDisposed && chart.isDisposed())) applyZoomRange(chart); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer', e); }
    try { if (sliderChart && !(sliderChart.isDisposed && sliderChart.isDisposed())) applyZoomRange(sliderChart); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer', e); }
  }

  function dispose() {
    try { chart.dispose(); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer', e); }
    try { if (sliderChart) sliderChart.dispose(); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer', e); }
  }
  function getInstance() { return chart; }

  return { update, dispose, getInstance };
}

// --- Additional renderers (minimal viable) ---

// Bar renderer moved to './echartsBarChart.js'

export function renderHybridChartEcharts(container, data = { bars: [], line: [] }, _options = {}) {
  const el = ensureContainer(container);
  const chart = echarts.init(el);
  const bars = Array.isArray(data?.bars) ? data.bars.map(d => [d.x, d.y]) : [];
  const line = Array.isArray(data?.line) ? data.line.map(d => [d.x instanceof Date ? d.x.getTime() : d.x, d.y]) : [];
  const option = {
    animation: false,
    xAxis: [{ type: 'category' }],
    yAxis: [{ type: 'value' }],
    tooltip: { trigger: 'axis' },
    series: [
      { type: 'bar', data: bars, xAxisIndex: 0, yAxisIndex: 0, name: 'Bars' },
      { type: 'line', data: line, xAxisIndex: 0, yAxisIndex: 0, name: 'Line', showSymbol: false, smooth: true }
    ]
  };
  chart.setOption(option, { notMerge: true });
  return { update: (d) => chart.setOption({ series: [{ data: (d?.bars || []).map(x => [x.x, x.y]) }, { data: (d?.line || []).map(x => [x.x instanceof Date ? x.x.getTime() : x.x, x.y]) }] }, { replaceMerge: ['series'] }), dispose: () => chart.dispose(), getInstance: () => chart };
}

export function renderHeatmapEcharts(container, data = [], _options = {}) {
  const el = ensureContainer(container);
  const chart = echarts.init(el);
  // Expect data: [{ x: 'HH:MM', y: 'YYYY-MM-DD', v: number }]
  const xCats = Array.from(new Set((data || []).map(d => d.x)));
  const yCats = Array.from(new Set((data || []).map(d => d.y)));
  const seriesData = (data || []).map(d => [xCats.indexOf(d.x), yCats.indexOf(d.y), d.v || 0]);
  const option = {
    animation: false,
    tooltip: { position: 'top' },
    grid: { left: 60, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'category', data: xCats, splitArea: { show: true } },
    yAxis: { type: 'category', data: yCats, splitArea: { show: true } },
    visualMap: { min: 0, max: Math.max(1, Math.max(...seriesData.map(d => d[2] || 0))), calculable: true, orient: 'horizontal', left: 'center', bottom: 0 },
    series: [{ name: 'Heat', type: 'heatmap', data: seriesData, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } } }]
  };
  chart.setOption(option, { notMerge: true });
  return {
    update: (arr) => {
      const xs = Array.from(new Set((arr || []).map(d => d.x)));
      const ys = Array.from(new Set((arr || []).map(d => d.y)));
      const sd = (arr || []).map(d => [xs.indexOf(d.x), ys.indexOf(d.y), d.v || 0]);
      chart.setOption({ xAxis: { data: xs }, yAxis: { data: ys }, visualMap: { max: Math.max(1, Math.max(...sd.map(d => d[2] || 0))) }, series: [{ data: sd }] }, { replaceMerge: ['series'] });
    },
    dispose: () => chart.dispose(),
    getInstance: () => chart,
  };
}
