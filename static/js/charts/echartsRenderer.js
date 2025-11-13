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
// Removed D3 usage; ECharts is the sole charting system.
// Archived: stream graph is disabled and not registered.

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


export function renderMultiLineChartEcharts(container, data, options = {}) {
  const el = ensureContainer(container);
  try {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  } catch(_) {
    // Ignore existing chart disposal errors
  }
  const chart = echarts.init(el);

  const base = {
    fromTs: options.fromTs || null,
    toTs: options.toTs || null,
    height: options.height || (el.clientHeight || 600),
    interval: options.interval || (options.stepMs === 5 * 60e3 ? '5m' : (options.stepMs === 3600e3 ? '1h' : undefined)),
    noFiveMinData: !!options.noFiveMinData,
  };
  const option = buildMultiOption({ data, ...base });
  try {
    const step = getStepMs(base.interval, undefined);
    option.tooltip = { ...(option.tooltip || {}), formatter: makeBarLineLikeTooltip({ chart, stepMs: step }) };
  } catch(_) { /* keep default tooltip */ }
  chart.setOption(option, { notMerge: true, lazyUpdate: true });
  try { applyZoomRange(chart); } catch(_) {}
  try { attachZoom(chart); } catch(_) {}

  function update(newData = data, newOptions = {}) {
    const merged = { ...base, ...newOptions };
    const next = buildMultiOption({ data: newData, ...merged });
    try {
      const step = getStepMs(merged.interval, undefined);
      next.tooltip = { ...(next.tooltip || {}), formatter: makeBarLineLikeTooltip({ chart, stepMs: step }) };
    } catch(_) { /* keep default tooltip */ }
    chart.setOption(next, { notMerge: true, lazyUpdate: true });
    try { applyZoomRange(chart); } catch(_) {}
  }

  function dispose() { try { chart.dispose(); } catch (_) {
    // Chart might already be disposed
  } }
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
  return { update: (d) => chart.setOption({ series: [ { data: (d?.bars||[]).map(x => [x.x, x.y]) }, { data: (d?.line||[]).map(x => [x.x instanceof Date ? x.x.getTime() : x.x, x.y]) } ] }, { replaceMerge: ['series'] }), dispose: () => chart.dispose(), getInstance: () => chart };
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
