// static/js/charts/echartsRenderer.js
// Responsibility: ECharts renderers for line, hybrid, and heatmap charts
import * as echarts from 'echarts';
import { renderBarChartEcharts as renderBarEcharts } from './echartsBarChart.js';
import { buildMultiOption } from './echarts/builders/MultiLineBuilder.js';
import { attach as attachZoom, applyRange as applyZoomRange } from './echarts/services/zoomManager.js';
import { makeBarLineLikeTooltip } from './echarts/helpers/tooltip.js';
import { getStepMs } from './echarts/helpers/time.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────

export async function registerEchartsRenderers() {
  const { registerChart } = await import('./registry.js');
  registerChart('line', renderMultiLineChartEcharts);
  registerChart('bar', renderBarEcharts);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ensureContainer(container) {
  if (typeof container === 'string') {
    const el = document.querySelector(container);
    if (!el) throw new Error(`[echartsRenderer] Container not found: ${container}`);
    return el;
  }
  if (!container) throw new Error('[echartsRenderer] Container is required');
  return container;
}

function isDisposed(chart) {
  return !chart || (typeof chart.isDisposed === 'function' && chart.isDisposed());
}

function hasDimensions(el) {
  if (!el) return false;
  const w = el.clientWidth || el.getBoundingClientRect().width;
  const h = el.clientHeight || el.getBoundingClientRect().height;
  return w > 0 && h > 0;
}

function waitForDimensions(el, maxWait = 1000) {
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
    }, 32);
  });
}

function disposeExisting(el) {
  try {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  } catch (e) {
    logError(ErrorCategory.CHART, 'echartsRenderer:disposeExisting', e);
  }
}

function getContainerHeight(el, fallback = 520) {
  return el.clientHeight || el.getBoundingClientRect().height || fallback;
}

// ─────────────────────────────────────────────────────────────
// Tooltip config (shared)
// ─────────────────────────────────────────────────────────────

function createTooltipConfig(chart, stepMs) {
  return {
    formatter: makeBarLineLikeTooltip({ chart, stepMs }),
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: '#e6e9ef',
    borderWidth: 1,
    padding: [9, 12],
    textStyle: { color: 'var(--ds-color-fg)' },
    extraCssText: 'border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.07); line-height:1.35;'
  };
}

function applyTooltip(option, chart, interval) {
  try {
    const stepMs = getStepMs(interval, undefined);
    option.tooltip = { ...(option.tooltip || {}), ...createTooltipConfig(chart, stepMs) };
  } catch (e) {
    logError(ErrorCategory.CHART, 'echartsRenderer:applyTooltip', e);
  }
}

// ─────────────────────────────────────────────────────────────
// Slider chart init
// ─────────────────────────────────────────────────────────────

async function initSliderChart() {
  const sliderEl = document.getElementById('chart-slider');
  if (!sliderEl || !hasDimensions(sliderEl)) return null;

  await waitForDimensions(sliderEl);
  disposeExisting(sliderEl);

  return echarts.init(sliderEl);
}

// ─────────────────────────────────────────────────────────────
// Null chart result
// ─────────────────────────────────────────────────────────────

const NULL_CHART = { update: () => {}, dispose: () => {}, getInstance: () => null };

// ─────────────────────────────────────────────────────────────
// Multi-line chart renderer
// ─────────────────────────────────────────────────────────────

export async function renderMultiLineChartEcharts(container, data, options = {}) {
  const el = ensureContainer(container);

  await waitForDimensions(el);
  if (!hasDimensions(el)) {
    console.warn('[echartsRenderer] Container has no dimensions, skipping render');
    return NULL_CHART;
  }

  disposeExisting(el);
  const chart = echarts.init(el);
  const sliderChart = await initSliderChart();

  // connect charts
  if (chart && sliderChart) {
    echarts.connect([chart, sliderChart]);
  }

  // allow scrolling when not zooming
  el.addEventListener('wheel', (e) => {
    if (!e.shiftKey) e.stopPropagation();
  }, { capture: true, passive: false });

  // base config
  const base = {
    fromTs: options.fromTs || null,
    toTs: options.toTs || null,
    height: getContainerHeight(el, options.height || 520),
    interval: options.interval || (options.stepMs === 5 * 60e3 ? '5m' : (options.stepMs === 3600e3 ? '1h' : undefined)),
    noFiveMinData: !!options.noFiveMinData
  };

  // build options
  const { main, slider } = buildMultiOption({ data, ...base });
  applyTooltip(main, chart, base.interval);

  if (isDisposed(chart)) return NULL_CHART;

  // render main
  chart.setOption(main, { notMerge: true, lazyUpdate: true });

  // render slider
  if (sliderChart && slider && !isDisposed(sliderChart)) {
    sliderChart.setOption(slider, { notMerge: true, lazyUpdate: true });
  }

  // apply zoom
  if (!isDisposed(chart)) {
    try { applyZoomRange(chart); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer:applyZoom', e); }
    try { attachZoom(chart); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer:attachZoom', e); }
  }
  if (sliderChart && !isDisposed(sliderChart)) {
    try { applyZoomRange(sliderChart); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer:applyZoomSlider', e); }
  }

  // ─────────────────────────────────────────────────────────────
  // Update
  // ─────────────────────────────────────────────────────────────

  function update(newData = data, newOptions = {}) {
    if (isDisposed(chart)) return;

    const currentHeight = getContainerHeight(el, base.height);
    const merged = { ...base, ...newOptions, height: currentHeight };
    const { main: nextMain, slider: nextSlider } = buildMultiOption({ data: newData, ...merged });

    applyTooltip(nextMain, chart, merged.interval);

    if (isDisposed(chart)) return;
    chart.setOption(nextMain, { notMerge: true, lazyUpdate: true });

    if (sliderChart && nextSlider && !isDisposed(sliderChart)) {
      sliderChart.setOption(nextSlider, { notMerge: true, lazyUpdate: true });
    }

    if (!isDisposed(chart)) {
      try { applyZoomRange(chart); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer:updateZoom', e); }
    }
    if (sliderChart && !isDisposed(sliderChart)) {
      try { applyZoomRange(sliderChart); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer:updateZoomSlider', e); }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Dispose
  // ─────────────────────────────────────────────────────────────

  function dispose() {
    try { chart.dispose(); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer:dispose', e); }
    try { if (sliderChart) sliderChart.dispose(); } catch (e) { logError(ErrorCategory.CHART, 'echartsRenderer:disposeSlider', e); }
  }

  function getInstance() {
    return chart;
  }

  return { update, dispose, getInstance };
}

// ─────────────────────────────────────────────────────────────
// Hybrid chart renderer (bar + line)
// ─────────────────────────────────────────────────────────────

function formatBarData(bars) {
  return Array.isArray(bars) ? bars.map(d => [d.x, d.y]) : [];
}

function formatLineData(line) {
  return Array.isArray(line)
    ? line.map(d => [d.x instanceof Date ? d.x.getTime() : d.x, d.y])
    : [];
}

export function renderHybridChartEcharts(container, data = { bars: [], line: [] }, _options = {}) {
  const el = ensureContainer(container);
  const chart = echarts.init(el);

  const option = {
    animation: false,
    xAxis: [{ type: 'category' }],
    yAxis: [{ type: 'value' }],
    tooltip: { trigger: 'axis' },
    series: [
      { type: 'bar', data: formatBarData(data?.bars), xAxisIndex: 0, yAxisIndex: 0, name: 'Bars' },
      { type: 'line', data: formatLineData(data?.line), xAxisIndex: 0, yAxisIndex: 0, name: 'Line', showSymbol: false, smooth: true }
    ]
  };

  chart.setOption(option, { notMerge: true });

  function update(d) {
    chart.setOption({
      series: [
        { data: formatBarData(d?.bars) },
        { data: formatLineData(d?.line) }
      ]
    }, { replaceMerge: ['series'] });
  }

  return { update, dispose: () => chart.dispose(), getInstance: () => chart };
}

// ─────────────────────────────────────────────────────────────
// Heatmap chart renderer
// ─────────────────────────────────────────────────────────────

function buildHeatmapData(data) {
  const arr = data || [];
  const xCats = Array.from(new Set(arr.map(d => d.x)));
  const yCats = Array.from(new Set(arr.map(d => d.y)));
  const seriesData = arr.map(d => [xCats.indexOf(d.x), yCats.indexOf(d.y), d.v || 0]);
  const maxVal = Math.max(1, Math.max(...seriesData.map(d => d[2] || 0)));

  return { xCats, yCats, seriesData, maxVal };
}

export function renderHeatmapEcharts(container, data = [], _options = {}) {
  const el = ensureContainer(container);
  const chart = echarts.init(el);

  const { xCats, yCats, seriesData, maxVal } = buildHeatmapData(data);

  const option = {
    animation: false,
    tooltip: { position: 'top' },
    grid: { left: 60, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'category', data: xCats, splitArea: { show: true } },
    yAxis: { type: 'category', data: yCats, splitArea: { show: true } },
    visualMap: {
      min: 0,
      max: maxVal,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0
    },
    series: [{
      name: 'Heat',
      type: 'heatmap',
      data: seriesData,
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } }
    }]
  };

  chart.setOption(option, { notMerge: true });

  function update(arr) {
    const { xCats: xs, yCats: ys, seriesData: sd, maxVal: mv } = buildHeatmapData(arr);
    chart.setOption({
      xAxis: { data: xs },
      yAxis: { data: ys },
      visualMap: { max: mv },
      series: [{ data: sd }]
    }, { replaceMerge: ['series'] });
  }

  return { update, dispose: () => chart.dispose(), getInstance: () => chart };
}
