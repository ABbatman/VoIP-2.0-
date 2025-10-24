// static/js/charts/echartsRenderer.js
// Lightweight ECharts renderers parallel to existing D3 ones.
// This file does not alter existing dashboard wiring. Consumers can opt-in
// by importing and registering these renderers behind a feature flag.

/* global window */
import * as echarts from 'echarts';
import { toast } from '../ui/notify.js';

export async function registerEchartsRenderers() {
  const { registerChart } = await import('./registry.js');
  registerChart('line', renderMultiLineChartEcharts);
  registerChart('bar', renderBarChartEcharts);
  registerChart('hybrid', renderHybridChartEcharts);
  registerChart('heatmap', renderHeatmapEcharts);
}

function ensureContainer(container) {
  if (typeof container === 'string') {
    const el = document.querySelector(container);
    if (!el) throw new Error(`[echartsRenderer] Container not found: ${container}`);
    return el;
  }
  if (!container) throw new Error('[echartsRenderer] Container is required');
  return container;
}

function computeGrids(heightPx) {
  // 4 stacked panels with small gaps
  const topPad = 8;
  const bottomPad = 76; // leave more space for slider dataZoom (additional +10px lower)
  const gap = 8;
  const usable = Math.max(160, (heightPx || 600) - topPad - bottomPad - gap * 3);
  const h = Math.floor(usable / 4);
  const grids = Array.from({ length: 4 }, (_, i) => ({
    left: 40,
    right: 16,
    top: topPad + i * (h + gap),
    height: h,
  }));
  return grids;
}

function toPairs(arr) {
  // Expects elements as { x: Date|number|string, y: number|null }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(d => d && d.x != null && (d.y == null || isFinite(Number(d.y))))
    .map(d => {
      const t = d.x instanceof Date ? d.x.getTime() : (typeof d.x === 'number' ? d.x : Date.parse(d.x));
      return [t, d.y == null ? null : Number(d.y)];
    })
    .filter(p => Number.isFinite(p[0]));
}

function seriesLine(name, data, xAxisIndex, yAxisIndex, color, { area = false, smooth = false, connectNulls = false, showSymbol = false, sampling = 'lttb' } = {}) {
  return {
    name,
    type: 'line',
    xAxisIndex,
    yAxisIndex,
    showSymbol: !!showSymbol,
    ...(sampling && sampling !== 'none' ? { sampling } : {}),
    symbolSize: showSymbol ? 4 : 0,
    connectNulls: !!connectNulls,
    smooth: !!smooth,
    lineStyle: { width: 1.8, color },
    areaStyle: area ? { opacity: 0.15, color } : undefined,
    data,
    emphasis: { focus: 'series' },
  };
}

function buildMultiOption({ data, fromTs, toTs, height, interval, noFiveMinData }) {
  const grids = computeGrids(height);
  const minX = Number.isFinite(fromTs) ? Number(fromTs) : null;
  const maxX = Number.isFinite(toTs) ? Number(toTs) : null;
  const xAxes = grids.map((g, i) => ({
    type: 'time', gridIndex: i, min: minX, max: maxX,
    axisLabel: { color: '#6e7781' }, axisLine: { lineStyle: { color: '#888' } }, axisTick: { alignWithLabel: true },
  }));

  const yAxes = grids.map((g, i) => ({
    type: 'value', gridIndex: i, axisLabel: { show: false }, splitLine: { show: false }, axisLine: { lineStyle: { color: '#000' } }
  }));

  const colors = {
    TCalls: '#2f6feb',
    ASR: '#00a37a',
    Minutes: '#e36209',
    ACD: '#6f42c1',
  };

  // Do not connect across gaps: always keep connectNulls false to prevent bridging disjoint segments
  const conn = !!noFiveMinData;
  const symb = !!noFiveMinData;
  const samp = symb ? 'none' : 'lttb';
  const tcalls = seriesLine('TCalls', toPairs(data?.TCalls), 0, 0, colors.TCalls, { area: true, smooth: true, connectNulls: conn, showSymbol: symb, sampling: samp });
  const asr = seriesLine('ASR', toPairs(data?.ASR), 1, 1, colors.ASR, { area: false, smooth: false, connectNulls: conn, showSymbol: symb, sampling: samp });
  const minutes = seriesLine('Minutes', toPairs(data?.Minutes), 2, 2, colors.Minutes, { area: false, smooth: false, connectNulls: conn, showSymbol: symb, sampling: samp });
  const acd = seriesLine('ACD', toPairs(data?.ACD), 3, 3, colors.ACD, { area: false, smooth: false, connectNulls: conn, showSymbol: symb, sampling: samp });

  let startVal = fromTs || null;
  let endVal = toTs || null;
  try {
    const zr = (typeof window !== 'undefined') ? window.__chartsZoomRange : null;
    if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs) {
      const lo = Number(fromTs);
      const hi = Number(toTs);
      const clamp = (v) => Number.isFinite(lo) && Number.isFinite(hi) ? Math.max(lo, Math.min(hi, v)) : v;
      startVal = clamp(zr.fromTs);
      endVal = clamp(zr.toTs);
    } else {
      const wantPanInit = (typeof window !== 'undefined') && !!window.__chartsPanInit;
      const total = (Number(toTs) - Number(fromTs));
      if (wantPanInit && Number.isFinite(total) && total > 0) {
        let span = 0;
        if (interval === '5m') {
          span = Math.min(total, 24 * 3600e3);
        } else if (interval === '1h') {
          span = Math.min(total, 7 * 24 * 3600e3);
        } else {
          span = Math.min(total, Math.max(Math.floor(total / 4), 7 * 24 * 3600e3));
        }
        startVal = Math.max(Number(fromTs), Number(toTs) - span);
        endVal = Number(toTs);
        try { window.__chartsPanInit = false; } catch(_) {}
      }
    }
  } catch(_) {}
  // Fallback safety: ensure start < end and both finite; else drop to base domain
  try {
    if (!(Number.isFinite(startVal) && Number.isFinite(endVal) && endVal > startVal)) {
      startVal = Number.isFinite(fromTs) ? Number(fromTs) : null;
      endVal = Number.isFinite(toTs) ? Number(toTs) : null;
    }
  } catch(_) {}

  const option = {
    animation: true,
    animationDurationUpdate: 200,
    animationEasingUpdate: 'cubicOut',
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    color: Object.values(colors),
    axisPointer: {
      link: [{ xAxisIndex: [0, 1, 2, 3] }],
      lineStyle: { color: '#999' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      confine: true,
      order: 'valueAsc',
      formatter: (params) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const header = params[0].axisValueLabel || '';
        const fmt = (v) => (v == null || isNaN(v) ? '-' : (Math.round(Number(v) * 10) / 10).toFixed(1));
        const lines = params.map(p => `${p.marker} ${p.seriesName}: ${fmt(p.data && Array.isArray(p.data) ? p.data[1] : p.value?.[1] ?? p.value)}`);
        return [header, ...lines].join('<br/>');
      }
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1, 2, 3],
        startValue: startVal,
        endValue: endVal,
        // Reduce update frequency for wheel to feel smoother and less jittery
        throttle: 80,
        // Keep wheel as zoom, but avoid panning on wheel which often feels "too fast"
        zoomOnMouseWheel: 'shift',
        moveOnMouseWheel: false,
        moveOnMouseMove: true,
        brushSelect: false,
      },
      {
        type: 'slider',
        xAxisIndex: [0, 1, 2, 3],
        startValue: startVal,
        endValue: endVal,
        height: 32, // double thickness
        bottom: 6,
        throttle: 80,
      }
    ],
    series: [tcalls, asr, minutes, acd],
  };
  return option;
}

export function renderMultiLineChartEcharts(container, data, options = {}) {
  const el = ensureContainer(container);
  try {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  } catch(_) {}
  const chart = echarts.init(el);

  const base = {
    fromTs: options.fromTs || null,
    toTs: options.toTs || null,
    height: options.height || (el.clientHeight || 600),
    interval: options.interval || (options.stepMs === 5 * 60e3 ? '5m' : (options.stepMs === 3600e3 ? '1h' : undefined)),
    noFiveMinData: !!options.noFiveMinData,
  };
  const option = buildMultiOption({ data, ...base });
  chart.setOption(option, { notMerge: true, lazyUpdate: true });

  try {
    const applyZoom = () => {
      const baseLo = Number(base.fromTs);
      const baseHi = Number(base.toTs);
      const zr = (typeof window !== 'undefined') ? window.__chartsZoomRange : null;
      const clamp = (v) => (Number.isFinite(baseLo) && Number.isFinite(baseHi)) ? Math.max(baseLo, Math.min(baseHi, v)) : v;
      let sv = Number.isFinite(zr?.fromTs) ? clamp(Number(zr.fromTs)) : baseLo;
      let ev = Number.isFinite(zr?.toTs) ? clamp(Number(zr.toTs)) : baseHi;
      if (base.interval === '5m' && base.noFiveMinData) {
        const minSpan = 2 * 3600e3; // 2h
        if (Number.isFinite(sv) && Number.isFinite(ev) && (ev - sv) < minSpan) {
          const mid = (sv + ev) / 2;
          sv = clamp(mid - minSpan / 2);
          ev = clamp(mid + minSpan / 2);
        }
      }
      if (Number.isFinite(sv) && Number.isFinite(ev) && ev > sv) {
        chart.setOption({ dataZoom: [ { startValue: sv, endValue: ev }, { startValue: sv, endValue: ev } ] }, { lazyUpdate: true });
        try {
          const dz = (chart.getOption()?.dataZoom) || [];
          dz.forEach((_, idx) => {
            chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: idx, startValue: sv, endValue: ev });
          });
        } catch(_) {}
      }
    };
    // Delay to ensure option applied
    requestAnimationFrame(() => setTimeout(applyZoom, 0));
  } catch(_) {}

  const getZoomRange = () => {
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
    } catch(_) {}
    return null;
  };

  chart.on('dataZoom', () => {
    const zr = getZoomRange();
    try {
      if (zr) {
        window.__chartsZoomRange = zr;
        // If current interval is 5m and zoom window exceeds 5 days, switch to 1h with a toast
        try {
          const diffDays = (zr.toTs - zr.fromTs) / (24 * 3600e3);
          const curInt = (typeof window !== 'undefined' && window.__chartsCurrentInterval) ? String(window.__chartsCurrentInterval) : '5m';
          if (curInt === '5m' && Number.isFinite(diffDays) && diffDays > 5.0001) {
            const now = Date.now();
            const last = window.__zoomPolicyLastSwitchTs || 0;
            if (now - last > 600) {
              window.__zoomPolicyLastSwitchTs = now;
              try { toast('5-minute interval is available only for ranges up to 5 days. Switching to 1 hour.', { type: 'warning', duration: 3500 }); } catch(_) {}
              try { window.__chartsCurrentInterval = '1h'; } catch(_) {}
              try {
                import('../state/eventBus.js').then(({ publish }) => {
                  try { publish('charts:intervalChanged', { interval: '1h' }); } catch(_) {}
                }).catch(() => {});
              } catch(_) {}
            }
          }
        } catch(_) {}
      }
    } catch(_) {}
  });

  function update(newData = data, newOptions = {}) {
    const merged = { ...base, ...newOptions };
    const next = buildMultiOption({ data: newData, ...merged });
    // Replace only series and xAxis min/max to keep layout stable
    chart.setOption({
      xAxis: next.xAxis,
      series: next.series
    }, { replaceMerge: ['series'], lazyUpdate: true });
    try {
      const baseLo = Number(merged.fromTs);
      const baseHi = Number(merged.toTs);
      const zr = (typeof window !== 'undefined') ? window.__chartsZoomRange : null;
      const clamp = (v) => (Number.isFinite(baseLo) && Number.isFinite(baseHi)) ? Math.max(baseLo, Math.min(baseHi, v)) : v;
      let sv = Number.isFinite(zr?.fromTs) ? clamp(Number(zr.fromTs)) : baseLo;
      let ev = Number.isFinite(zr?.toTs) ? clamp(Number(zr.toTs)) : baseHi;
      if (Number.isFinite(sv) && Number.isFinite(ev) && ev > sv) {
        chart.setOption({ dataZoom: [ { startValue: sv, endValue: ev }, { startValue: sv, endValue: ev } ] }, { lazyUpdate: true });
        try {
          const dz = (chart.getOption()?.dataZoom) || [];
          dz.forEach((_, idx) => {
            chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: idx, startValue: sv, endValue: ev });
          });
        } catch(_) {}
      }
    } catch(_) {}
  }

  function dispose() { try { chart.dispose(); } catch (_) {} }
  function getInstance() { return chart; }

  return { update, dispose, getInstance };
}

// --- Additional renderers (minimal viable) ---

export function renderBarChartEcharts(container, data = [], options = {}) {
  const el = ensureContainer(container);
  const chart = echarts.init(el);
  const pairs = Array.isArray(data) ? data.map(d => [d.x, d.y]) : [];
  const option = {
    animation: false,
    xAxis: { type: 'category' },
    yAxis: { type: 'value' },
    tooltip: { trigger: 'axis' },
    series: [{ type: 'bar', data: pairs }]
  };
  chart.setOption(option, { notMerge: true });
  return { update: (arr) => chart.setOption({ series: [{ data: (arr || []).map(d => [d.x, d.y]) }] }, { replaceMerge: ['series'] }), dispose: () => chart.dispose(), getInstance: () => chart };
}

export function renderHybridChartEcharts(container, data = { bars: [], line: [] }, options = {}) {
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

export function renderHeatmapEcharts(container, data = [], options = {}) {
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
