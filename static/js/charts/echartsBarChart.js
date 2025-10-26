// static/js/charts/echartsBarChart.js
/* global window */
import * as echarts from 'echarts';
import { toast } from '../ui/notify.js';

function ensureContainer(container) {
  if (typeof container === 'string') {
    const el = document.querySelector(container);
    if (!el) throw new Error(`[echartsBarChart] Container not found: ${container}`);
    return el;
  }
  if (!container) throw new Error('[echartsBarChart] Container is required');
  return container;
}

function toPairs(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(d => d && d.x != null && (d.y == null || isFinite(Number(d.y))))
    .map(d => {
      const t = d.x instanceof Date ? d.x.getTime() : (typeof d.x === 'number' ? d.x : Date.parse(d.x));
      return [t, d.y == null ? null : Number(d.y)];
    })
    .filter(p => Number.isFinite(p[0]));
}

function chooseBarWidthPx(interval) {
  switch (interval) {
    case '5m': return 6;
    case '1h': return 10;
    case '1d': return 16;
    default: return 10;
  }
}

function getStepMs(interval, fallbackStep) {
  if (Number.isFinite(fallbackStep)) return Number(fallbackStep);
  if (interval === '5m') return 5 * 60e3;
  if (interval === '1h') return 3600e3;
  if (interval === '1d') return 24 * 3600e3;
  return 3600e3;
}

export function renderBarChartEcharts(container, data = [], options = {}) {
  const el = ensureContainer(container);
  try {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  } catch (_) {}
  const chart = echarts.init(el);

  const base = {
    fromTs: options.fromTs || null,
    toTs: options.toTs || null,
    height: options.height || (el.clientHeight || 300),
    interval: options.interval || (options.stepMs === 5 * 60e3 ? '5m' : (options.stepMs === 3600e3 ? '1h' : '1d')),
    stepMs: getStepMs(options.interval, options.stepMs),
    acdSeries: Array.isArray(options.acdSeries) ? options.acdSeries : [],
  };

  const buildPairs = (opts, d) => {
    // Prefer options.acdSeries; fallback to data.ACD; lastly treat data as array
    let src = Array.isArray(opts.acdSeries) && opts.acdSeries.length ? opts.acdSeries : (Array.isArray(d?.ACD) ? d.ACD : (Array.isArray(d) ? d : []));
    let pairs = toPairs(src).sort((a,b) => a[0] - b[0]);
    const step = Number(opts.stepMs) || getStepMs(opts.interval);
    // Snap to step grid and dedupe by snapped x
    const map = new Map();
    for (const [t, y] of pairs) {
      // center bars inside their time bin so barWidth can exactly equal step width
      const base = Number.isFinite(step) && step > 0 ? Math.floor(t / step) * step : t;
      const x = Number.isFinite(step) && step > 0 ? (base + Math.floor(step / 2)) : base;
      if (y == null || isNaN(y)) continue;
      map.set(x, Number(y));
    }
    pairs = Array.from(map.entries()).sort((a,b) => a[0] - b[0]);
    return pairs;
  };

  const buildOption = (opts, d) => {
    const fromTs = Number(opts.fromTs);
    const toTs = Number(opts.toTs);
    const pairs = buildPairs(opts, d);
    const bw = chooseBarWidthPx(opts.interval);

    // Initialize zoom window from global range if present
    let startVal = Number.isFinite(fromTs) ? fromTs : null;
    let endVal = Number.isFinite(toTs) ? toTs : null;
    try {
      const zr = (typeof window !== 'undefined') ? window.__chartsZoomRange : null;
      if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs) {
        const clamp = (v) => (Number.isFinite(fromTs) && Number.isFinite(toTs)) ? Math.max(fromTs, Math.min(toTs, v)) : v;
        startVal = clamp(zr.fromTs);
        endVal = clamp(zr.toTs);
      }
    } catch (_) {}
    try {
      if (!(Number.isFinite(startVal) && Number.isFinite(endVal) && endVal > startVal)) {
        startVal = Number.isFinite(fromTs) ? fromTs : null;
        endVal = Number.isFinite(toTs) ? toTs : null;
      }
    } catch (_) {}

    return {
      animation: true,
      animationDurationUpdate: 200,
      animationEasingUpdate: 'cubicOut',
      grid: { left: 40, right: 16, top: 8, bottom: 56, containLabel: false },
      xAxis: {
        type: 'time',
        min: Number.isFinite(fromTs) ? fromTs : null,
        max: Number.isFinite(toTs) ? toTs : null,
        axisLabel: { color: '#6e7781' },
        axisLine: { lineStyle: { color: '#888' } },
        axisTick: { alignWithLabel: true },
        axisPointer: { show: true, snap: true, triggerTooltip: true }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#6e7781' },
        splitLine: { show: true, lineStyle: { color: 'rgba(0,0,0,0.08)' } },
        axisLine: { lineStyle: { color: '#000' } }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', snap: true },
        confine: true,
        formatter: (params) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const p = params.find(s => s.seriesName === 'ACD') || params[0];
          const header = params[0].axisValueLabel || '';
          const v = (p && p.data && p.data[1]);
          const fmt = (x) => (x == null || isNaN(x) ? '-' : (Math.round(Number(x) * 10) / 10).toFixed(1));
          return `${header}<br/>ACD: ${fmt(v)}`;
        }
      },
      dataZoom: [
        {
          type: 'inside',
          startValue: startVal,
          endValue: endVal,
          throttle: 80,
          zoomOnMouseWheel: 'shift',
          moveOnMouseWheel: false,
          moveOnMouseMove: true,
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          startValue: startVal,
          endValue: endVal,
          height: 32,
          bottom: 8,
          throttle: 80,
          showDataShadow: true,
          dataBackground: {
            lineStyle: { color: '#6f42c1', width: 1 },
            areaStyle: { color: 'rgba(111,66,193,0.18)' }
          }
        }
      ],
      series: [
        {
          id: 'acd',
          name: 'ACD',
          type: 'bar',
          large: true,
          barWidth: bw,
          itemStyle: { color: '#6f42c1' },
          data: pairs
        }
      ]
    };
  };

  const option = buildOption(base, data);
  chart.setOption(option, { notMerge: true, lazyUpdate: true });

  const computeStepWidthPx = () => {
    try {
      const step = Number(base.stepMs) || getStepMs(base.interval);
      // prefer current zoom start; else fromTs; else first data point
      const zr = (typeof window !== 'undefined') ? window.__chartsZoomRange : null;
      const ref = (zr && Number.isFinite(zr.fromTs)) ? zr.fromTs : (Number(base.fromTs) || (Array.isArray(option.series?.[0]?.data) ? option.series[0].data[0]?.[0] : null));
      if (!Number.isFinite(ref) || !Number.isFinite(step) || step <= 0) return null;
      const p0 = chart.convertToPixel({ xAxisIndex: 0 }, ref);
      const p1 = chart.convertToPixel({ xAxisIndex: 0 }, ref + step);
      const w = Math.abs(Number(p1) - Number(p0));
      if (!Number.isFinite(w) || w <= 0) return null;
      return Math.max(2, Math.round(w));
    } catch(_) { return null; }
  };

  const applyDynamicBarWidth = () => {
    const w = computeStepWidthPx();
    if (Number.isFinite(w)) {
      // leave a small gap between bars (~8%)
      const desired = Math.max(2, Math.floor(w * 0.92));
      try {
        chart.setOption({ series: [ { id: 'acd', barWidth: desired } ] }, { replaceMerge: ['series'], lazyUpdate: true });
      } catch(_) {}
    }
  };
  // apply once after initial render
  try { requestAnimationFrame(() => setTimeout(applyDynamicBarWidth, 0)); } catch(_) {}

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
    } catch (_) {}
    return null;
  };

  chart.on('dataZoom', () => {
    const zr = getZoomRange();
    try {
      if (zr) {
        window.__chartsZoomRange = zr;
        // adjust bar width to current zoom scale
        try { applyDynamicBarWidth(); } catch(_) {}
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
        } catch (_) {}
      }
    } catch (_) {}
  });

  // Re-apply bar width after any setOption finishes (resize, update, etc.)
  try { chart.on('finished', applyDynamicBarWidth); } catch(_) {}

  function update(newData = data, newOptions = {}) {
    const merged = { ...base, ...newOptions };
    // keep base in sync for computeStepWidthPx
    try {
      base.fromTs = merged.fromTs;
      base.toTs = merged.toTs;
      base.interval = merged.interval || base.interval;
      base.stepMs = Number.isFinite(merged.stepMs) ? Number(merged.stepMs) : getStepMs(base.interval);
      base.acdSeries = Array.isArray(merged.acdSeries) ? merged.acdSeries : base.acdSeries;
    } catch(_) {}
    const next = buildOption(merged, newData);
    chart.setOption({
      xAxis: next.xAxis,
      series: next.series
    }, { replaceMerge: ['series'], lazyUpdate: true });
    try { applyDynamicBarWidth(); } catch(_) {}
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
        } catch (_) {}
      }
    } catch (_) {}
  }

  function dispose() { try { chart.dispose(); } catch (_) {} }
  function getInstance() { return chart; }

  return { update, dispose, getInstance };
}
