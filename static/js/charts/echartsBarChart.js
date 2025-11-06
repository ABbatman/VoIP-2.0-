// static/js/charts/echartsBarChart.js
import * as echarts from 'echarts';
import { makeBarLineLikeTooltip } from './echarts/helpers/tooltip.js';
// move logic: use modular helpers/builders
import { buildCenters, makePairSets } from './echarts/helpers/dataTransform.js';
import { getStepMs } from './echarts/helpers/time.js';
import { buildBarSeries } from './echarts/builders/BarChartBuilder.js';
import { subscribe } from '../state/eventBus.js';
import { initChart, setOptionWithZoomSync } from './echarts/renderer/EchartsRenderer.js';

function ensureContainer(container) {
  if (typeof container === 'string') {
    const el = document.querySelector(container);
    if (!el) throw new Error(`[echartsBarChart] Container not found: ${container}`);
    return el;
  }
  if (!container) throw new Error('[echartsBarChart] Container is required');
  return container;
}

// remove legacy inline helpers (moved to helpers/dataTransform.js)

export function renderBarChartEcharts(container, data = [], options = {}) {
  const el = ensureContainer(container);
  try {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  } catch (_) {
    // Ignore error if chart instance doesn't exist
  }
  const chart = initChart(el);
  let unsubscribeToggle = null; // event unsubscribe handle

  const base = {
    fromTs: options.fromTs || null,
    toTs: options.toTs || null,
    height: options.height || (el.clientHeight || 300),
    interval: options.interval || (options.stepMs === 5 * 60e3 ? '5m' : (options.stepMs === 3600e3 ? '1h' : '1d')),
    stepMs: getStepMs(options.interval, options.stepMs),
    // series for all metrics to support 4-panel bar chart
    tCallsSeries: Array.isArray(options.tCallsSeries) ? options.tCallsSeries : [],
    asrSeries: Array.isArray(options.asrSeries) ? options.asrSeries : [],
    minutesSeries: Array.isArray(options.minutesSeries) ? options.minutesSeries : [],
    acdSeries: Array.isArray(options.acdSeries) ? options.acdSeries : [],
    labels: (options && typeof options.labels === 'object') ? options.labels : {}, // use backend labels
    colorMap: (options && typeof options.colorMap === 'object') ? options.colorMap : undefined, // color mapping per supplier
  };
  try {
    // reset zoom if filters range expanded
    const w = (typeof window !== 'undefined') ? window : {};
    const prev = w.__chartsLastFilters || null;
    const f = Number(base.fromTs);
    const t = Number(base.toTs);
    if (prev && Number.isFinite(f) && Number.isFinite(t)) {
      const pf = Number(prev.fromTs);
      const pt = Number(prev.toTs);
      if ((Number.isFinite(pf) && f < pf) || (Number.isFinite(pt) && t > pt)) {
        // clear persisted zoom to show full new range
        try { w.__chartsZoomRange = null; } catch(_) {}
      }
    }
    try { w.__chartsLastFilters = { fromTs: f, toTs: t }; } catch(_) {}
  } catch(_) {
    // Ignore zoom reset errors
  }

  // remove legacy buildPairs (moved to helpers/dataTransform.js)

  const buildOption = (opts, d) => {
    const fromTs = Number(opts.fromTs);
    const toTs = Number(opts.toTs);
    const step = Number(opts.stepMs) || getStepMs(opts.interval);
    const dayMs = 24 * 3600e3;

    const centers = buildCenters(fromTs, toTs, step);

    const setsT = makePairSets(opts, d, (Array.isArray(opts.tCallsSeries) && opts.tCallsSeries.length) ? opts.tCallsSeries : (Array.isArray(d?.TCalls) ? d.TCalls : []), centers);
    const setsA = makePairSets(opts, d, (Array.isArray(opts.asrSeries) && opts.asrSeries.length) ? opts.asrSeries : (Array.isArray(d?.ASR) ? d.ASR : []), centers);
    const setsM = makePairSets(opts, d, (Array.isArray(opts.minutesSeries) && opts.minutesSeries.length) ? opts.minutesSeries : (Array.isArray(d?.Minutes) ? d.Minutes : []), centers);
    const setsC = makePairSets(opts, d, (Array.isArray(opts.acdSeries) && opts.acdSeries.length) ? opts.acdSeries : (Array.isArray(d?.ACD) ? d.ACD : []), centers);

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
    } catch (_) {
      // Ignore zoom range errors
    }
    try {
      if (!(Number.isFinite(startVal) && Number.isFinite(endVal) && endVal > startVal)) {
        startVal = Number.isFinite(fromTs) ? fromTs : null;
        endVal = Number.isFinite(toTs) ? toTs : null;
      }
    } catch (_) {
      // Ignore zoom range init errors
    }

    // compute 4 grids
    const topPad = 8;
    const bottomPad = 76;
    const gap = 8;
    const usable = Math.max(160, (opts.height || el.clientHeight || 600) - topPad - bottomPad - gap * 3);
    const h = Math.floor(usable / 4);
    const grids = Array.from({ length: 4 }, (_, i) => ({ left: 40, right: 16, top: topPad + i * (h + gap), height: h }));
    // A thin preview grid positioned inside the slider track area (drawn underneath the slider)
    const sliderBottom = 8;
    const sliderHeight = 32;
    const previewInset = 4;
    const previewGrid = { left: 40, right: 16, bottom: sliderBottom + previewInset, height: sliderHeight - 2 * previewInset };
    grids.push(previewGrid);
    const xAxes = grids.map((g, i) => ({
      type: 'time', gridIndex: i, min: Number.isFinite(fromTs) ? fromTs : null, max: Number.isFinite(toTs) ? toTs : null,
      axisLabel: (i === 4 ? { show: false } : { color: '#6e7781' }),
      axisLine: (i === 4 ? { show: false } : { lineStyle: { color: '#888' } }),
      axisTick: (i === 4 ? { show: false } : { alignWithLabel: true, length: 6 }),
      splitLine: (i === 4 ? { show: false } : { show: true, lineStyle: { color: '#eaeef2' } }),
      axisPointer: (i === 4 ? { show: false } : { show: true, snap: true, triggerTooltip: true })
    }));
    const yAxes = grids.map((g, i) => ({ type: 'value', gridIndex: i, axisLabel: { show: false }, splitLine: { show: false }, axisLine: (i === 4 ? { show: false } : { lineStyle: { color: '#000' } }) }));

    const colorMain = '#4f86ff';
    const colors = { TCalls: colorMain, ASR: colorMain, Minutes: colorMain, ACD: colorMain };
    const axisNames = ['TCalls', 'ASR', 'Minutes', 'ACD'];
    // Build panel labels like in Line chart
    let graphicLabels = [];
    try {
      graphicLabels = axisNames.map((name, i) => {
        const isFirst = i === 0;
        const y = isFirst ? (grids[i].top + 6) : (grids[i].top + 4);
        return {
          type: 'text', left: 6, top: y,
          z: 10,
          style: { text: name, fill: '#6e7781', font: '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }
        };
      });
    } catch (_) {
      // Ignore graphic label creation errors
      graphicLabels = [];
    }

    // remove suppliers branching; chart builds the same way

    const showLabels = (() => { try { return !!(typeof window !== 'undefined' && window.__chartsBarPerProvider); } catch(_) { return false; } })();
    const out = {
      animation: true,
      animationDurationUpdate: 200,
      animationEasingUpdate: 'cubicOut',
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross', snap: true }, confine: true, order: 'valueAsc', formatter: makeBarLineLikeTooltip({ chart, stepMs: step }) },
      axisPointer: { link: [{ xAxisIndex: [0,1,2,3] }] },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0,1,2,3,4],
          startValue: startVal,
          endValue: endVal,
          throttle: 80,
          zoomOnMouseWheel: 'shift',
          moveOnMouseWheel: false,
          moveOnMouseMove: true,
        },
        {
          type: 'slider',
          xAxisIndex: [0,4],
          startValue: startVal,
          endValue: endVal,
          height: 32,
          bottom: 8,
          throttle: 80,
          // Keep the slider visuals translucent to reveal preview bars underneath
          backgroundColor: 'rgba(0,0,0,0)',
          fillerColor: 'rgba(79,134,255,0.12)',
          showDataShadow: false,
          dataBackground: { lineStyle: { color: 'rgba(0,0,0,0)' }, areaStyle: { color: 'rgba(0,0,0,0)' } }
        }
      ],
      series: buildBarSeries({ setsT, setsA, setsM, setsC, centers, interval: opts.interval, stepMs: step, labels: opts.labels, colorMap: opts.colorMap }),
      graphic: graphicLabels
    };
    if (!showLabels) {
      try {
        out.series = Array.isArray(out.series) ? out.series.filter(s => !(s && s.type === 'custom' && s.name === 'LabelsOverlay')) : out.series;
      } catch(_) {/* keep series */}
    }
    return out;
  };

  const option = buildOption(base, data);
  setOptionWithZoomSync(chart, option, { onAfterSet: () => {
    try { requestAnimationFrame(() => setTimeout(applyDynamicBarWidth, 0)); } catch (_) {}
  } });

  // react to Suppliers checkbox toggle: re-render overlay labels visibility
  try {
    unsubscribeToggle = subscribe('charts:bar:perProviderChanged', () => {
      try { const next = buildOption(base, data); setOptionWithZoomSync(chart, next); } catch(_) {}
    });
  } catch(_) { /* ignore subscription errors */ }

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
    } catch (_) {
      // Ignore step width computation errors
      return null;
    }
  };

  const applyDynamicBarWidth = () => {
    const w = computeStepWidthPx();
    if (Number.isFinite(w)) {
      // leave a small gap between bars (~8%)
      const desired = Math.max(2, Math.floor(w * 0.92));
      try {
        // each bar narrower to fit two slots per step and keep larger outer gap
        const each = Math.max(2, Math.floor(desired * 0.35));
        const cur = chart.getOption();
        const upd = (cur.series || []).filter(s => s && s.type === 'bar').map(s => ({ id: s.id, barWidth: each }));
        if (upd.length) chart.setOption({ series: upd }, { lazyUpdate: true });
      } catch (_) {
        // Ignore bar width update errors
      }
    }
  };
  // move logic: initial bar width adjustment scheduled in onAfterSet above

  // remove legacy dataZoom handler (handled by renderer)

  // Re-apply bar width after any setOption finishes (resize, update, etc.)
  try { chart.on('finished', applyDynamicBarWidth); } catch (_) {
    // Event handler registration might fail
  }

  function update(newData = data, newOptions = {}) {
    const merged = { ...base, ...newOptions };
    // keep base in sync for computeStepWidthPx
    try {
      base.fromTs = merged.fromTs;
      base.toTs = merged.toTs;
      base.interval = merged.interval || base.interval;
      base.stepMs = Number.isFinite(merged.stepMs) ? Number(merged.stepMs) : getStepMs(base.interval);
      base.tCallsSeries = Array.isArray(merged.tCallsSeries) ? merged.tCallsSeries : base.tCallsSeries;
      base.asrSeries = Array.isArray(merged.asrSeries) ? merged.asrSeries : base.asrSeries;
      base.minutesSeries = Array.isArray(merged.minutesSeries) ? merged.minutesSeries : base.minutesSeries;
      base.acdSeries = Array.isArray(merged.acdSeries) ? merged.acdSeries : base.acdSeries;
    } catch (_) {
      // Ignore base update errors
    }
    const next = buildOption(merged, newData);
    setOptionWithZoomSync(chart, next, { onAfterSet: () => { try { applyDynamicBarWidth(); } catch (_) {} } });
    try {
      const baseLo = Number(merged.fromTs);
      const baseHi = Number(merged.toTs);
      const zr = (typeof window !== 'undefined') ? window.__chartsZoomRange : null;
      const clamp = (v) => (Number.isFinite(baseLo) && Number.isFinite(baseHi)) ? Math.max(baseLo, Math.min(baseHi, v)) : v;
      let sv = Number.isFinite(zr?.fromTs) ? clamp(Number(zr.fromTs)) : baseLo;
      let ev = Number.isFinite(zr?.toTs) ? clamp(Number(zr.toTs)) : baseHi;
      if (Number.isFinite(sv) && Number.isFinite(ev) && ev > sv) {
        chart.setOption({ dataZoom: [ { startValue: sv, endValue: ev }, { startValue: sv, endValue: ev } ] }, { lazyUpdate: true });
      }
    } catch (_) {
      // Ignore zoom update errors
    }
  }

  function dispose() { try { if (typeof unsubscribeToggle === 'function') unsubscribeToggle(); } catch(_) {}
    try { chart.dispose(); } catch (_) {
    // Chart might already be disposed
  } }
  function getInstance() { return chart; }

  return { update, dispose, getInstance };
}
