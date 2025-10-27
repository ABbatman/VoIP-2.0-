// static/js/charts/echartsBarChart.js
/* global window */
import * as echarts from 'echarts';
import { toast } from '../ui/notify.js';
import { makeBarLineLikeTooltip } from './tooltip.js';
import { buildProviderStacks } from './echartsBarChartHelper.js';

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
    // series for all metrics to support 4-panel bar chart
    tCallsSeries: Array.isArray(options.tCallsSeries) ? options.tCallsSeries : [],
    asrSeries: Array.isArray(options.asrSeries) ? options.asrSeries : [],
    minutesSeries: Array.isArray(options.minutesSeries) ? options.minutesSeries : [],
    acdSeries: Array.isArray(options.acdSeries) ? options.acdSeries : [],
    // provider stacking
    perProvider: !!options.perProvider,
    providerRows: Array.isArray(options.providerRows) ? options.providerRows : [],
  };

  const buildPairs = (opts, d, srcOverride) => {
    // Prefer provided srcOverride; otherwise use options.acdSeries; lastly treat input data
    let src = Array.isArray(srcOverride) && srcOverride.length
      ? srcOverride
      : (Array.isArray(opts.acdSeries) && opts.acdSeries.length
        ? opts.acdSeries
        : (Array.isArray(d?.ACD) ? d.ACD : (Array.isArray(d) ? d : [])));
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
    const step = Number(opts.stepMs) || getStepMs(opts.interval);
    const dayMs = 24 * 3600e3;

    const buildCenters = () => {
      const centers = [];
      if (Number.isFinite(fromTs) && Number.isFinite(toTs) && Number.isFinite(step) && step > 0) {
        const start = Math.floor(fromTs / step) * step;
        const end = Math.ceil(toTs / step) * step;
        for (let t = start; t <= end; t += step) centers.push(t + Math.floor(step / 2));
      }
      return centers;
    };
    const centers = buildCenters();

    const makePairSets = (srcArr) => {
      const currPairs = buildPairs(opts, d, srcArr);
      const currMap = new Map(currPairs);
      const curr = [];
      const prev = [];
      const hasCenters = centers.length > 0 ? centers : currPairs.map(p => p[0]);
      for (const c of hasCenters) {
        const yCur = currMap.get(c);
        if (yCur != null && !isNaN(yCur)) curr.push([c, yCur]);
        const yPrev = currMap.get(c - dayMs);
        if (yPrev != null && !isNaN(yPrev)) prev.push([c, yPrev]);
      }
      return { curr, prev };
    };

    const setsT = makePairSets((Array.isArray(opts.tCallsSeries) && opts.tCallsSeries.length) ? opts.tCallsSeries : (Array.isArray(d?.TCalls) ? d.TCalls : []));
    const setsA = makePairSets((Array.isArray(opts.asrSeries) && opts.asrSeries.length) ? opts.asrSeries : (Array.isArray(d?.ASR) ? d.ASR : []));
    const setsM = makePairSets((Array.isArray(opts.minutesSeries) && opts.minutesSeries.length) ? opts.minutesSeries : (Array.isArray(d?.Minutes) ? d.Minutes : []));
    const setsC = makePairSets((Array.isArray(opts.acdSeries) && opts.acdSeries.length) ? opts.acdSeries : (Array.isArray(d?.ACD) ? d.ACD : []));
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
    } catch(_) { graphicLabels = []; }

    // Provider stacking (current bars only). Fallback to simple bars if not applicable.
    let provider = null;
    try {
      if (opts.perProvider && Array.isArray(opts.providerRows) && opts.providerRows.length) {
        provider = buildProviderStacks(opts.providerRows, { fromTs, toTs, stepMs: step });
      }
    } catch(_) { provider = null; }
    // Fallback: if Suppliers is enabled but detection failed, synthesize a single-supplier overlay
    try {
      if (!provider && opts.perProvider) {
        provider = {
          providers: ['Supplier'],
          colors: { 'Supplier': '#ff7f0e' },
          totals: {
            TCalls: setsT.curr,
            ASR: setsA.curr,
            Minutes: setsM.curr,
            ACD: setsC.curr,
          },
          stacks: {
            TCalls: { curr: { 'Supplier': setsT.curr } },
            ASR: { curr: { 'Supplier': setsA.curr } },
            Minutes: { curr: { 'Supplier': setsM.curr } },
            ACD: { curr: { 'Supplier': setsC.curr } },
          }
        };
      }
    } catch(_) {}

    // Build decorative supplier stripe overlay (silent custom series)
    const makeStripeOverlay = (id, xAxisIndex, yAxisIndex, totalsPairs, stacksPerProv, stepMs, providerMeta) => {
      const byTs = new Map();
      (totalsPairs || []).forEach(([t, v]) => { if (Number.isFinite(t) && Number.isFinite(v) && v > 0) byTs.set(Number(t), Number(v)); });
      const data = [];
      for (const [t, total] of byTs.entries()) {
        const segs = [];
        const providers = (providerMeta?.providers) || Object.keys(stacksPerProv || {});
        for (const p of providers) {
          const arr = (stacksPerProv?.[p]) || [];
          // binary search to find exact t
          let lo = 0, hi = arr.length - 1, idx = -1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1; const tt = Number(arr[mid][0]);
            if (tt === t) { idx = mid; break; }
            if (tt < t) lo = mid + 1; else hi = mid - 1;
          }
          const v = idx !== -1 ? Number(arr[idx][1] || 0) : 0;
          if (v > 0) segs.push({ prov: p, v, color: (providerMeta?.colors?.[p]) });
        }
        if (segs.length) data.push({ value: [t, total], segments: segs.sort((a,b) => a.v - b.v) });
      }
      return {
        id,
        name: `${id}-overlay`,
        type: 'custom',
        xAxisIndex,
        yAxisIndex,
        silent: true,
        tooltip: { show: false },
        emphasis: { disabled: true },
        blur: { itemStyle: { opacity: 1 } },
        z: 5,
        zlevel: 1,
        renderItem: (params, api) => {
          const x = api.value(0);
          const total = api.value(1);
          if (!(Number.isFinite(x) && Number.isFinite(total) && total > 0)) return null;
          const d = params.data;
          const segs = Array.isArray(d?.segments) ? d.segments : [];
          if (!segs.length) return null;
          const half = Math.floor(stepMs / 2);
          const p0 = api.coord([x - half, 0]);
          const p1 = api.coord([x + half, 0]);
          const width = Math.max(1, Math.floor((p1[0] - p0[0]) * 0.68));
          const xLeft = Math.round((p0[0] + p1[0]) / 2 - width / 2);
          const base = api.coord([x, 0])[1];
          const topY = api.coord([x, total])[1];
          const height = Math.abs(base - topY);
          if (!(height > 1)) return null;
          const stripeH = Math.max(2, Math.round(Math.min(4, height * 0.06)));
          const children = [];
          let cum = 0;
          if (segs.length === 1) {
            // Single supplier: draw a stripe at the very top of the bar
            const yTop = Math.min(base, topY);
            const yBottom = Math.max(base, topY);
            const topStripeY = Math.round(yTop + 1 + stripeH / 2);
            if (topStripeY > yTop && topStripeY < yBottom) {
              children.push({ type: 'rect', shape: { x: xLeft, y: topStripeY - Math.round(stripeH / 2), width, height: stripeH }, style: { fill: segs[0].color || 'rgba(0,0,0,0.6)', opacity: 0.95, stroke: '#ffffff', lineWidth: 0.6 }, ignore: false });
            }
          } else {
            for (const s of segs) {
              cum += Number(s.v || 0);
              if (!(cum > 0)) continue;
              const y = api.coord([x, cum])[1];
              const yTop = Math.min(base, topY);
              const yBottom = Math.max(base, topY);
              if (y <= yTop + 1 || y >= yBottom - 1) continue;
              children.push({
                type: 'rect',
                shape: { x: xLeft, y: Math.round(y - stripeH / 2), width, height: stripeH },
                style: { fill: s.color || 'rgba(0,0,0,0.6)', opacity: 0.95, stroke: '#ffffff', lineWidth: 0.6 },
                ignore: false
              });
            }
          }
          return { type: 'group', children };
        },
        data
      };
    };

    return {
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
      series: (() => {
        const list = [];
        if (provider) {
          // All main bars in blue, with silent decorative stripe overlays per panel
          list.push({ id: 'tc', name: 'TCalls', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.TCalls }, data: provider.totals.TCalls });
          list.push({ id: 'tcPrev', name: 'TCalls -24h', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsT.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
          list.push(makeStripeOverlay('tcOverlay', 0, 0, provider.totals.TCalls, provider.stacks.TCalls.curr, step, provider));

          list.push({ id: 'as', name: 'ASR', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.ASR }, data: provider.totals.ASR });
          list.push({ id: 'asPrev', name: 'ASR -24h', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsA.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
          list.push(makeStripeOverlay('asOverlay', 1, 1, provider.totals.ASR, provider.stacks.ASR.curr, step, provider));

          list.push({ id: 'mn', name: 'Minutes', type: 'bar', xAxisIndex: 2, yAxisIndex: 2, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.Minutes }, data: provider.totals.Minutes });
          list.push({ id: 'mnPrev', name: 'Minutes -24h', type: 'bar', xAxisIndex: 2, yAxisIndex: 2, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsM.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
          list.push(makeStripeOverlay('mnOverlay', 2, 2, provider.totals.Minutes, provider.stacks.Minutes.curr, step, provider));

          list.push({ id: 'ac', name: 'ACD', type: 'bar', xAxisIndex: 3, yAxisIndex: 3, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.ACD }, data: provider.totals.ACD });
          list.push({ id: 'acPrev', name: 'ACD -24h', type: 'bar', xAxisIndex: 3, yAxisIndex: 3, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsC.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
          list.push(makeStripeOverlay('acOverlay', 3, 3, provider.totals.ACD, provider.stacks.ACD.curr, step, provider));
        } else {
          // Default: two bars per step (all blue), previous grey
          list.push({ id: 'tc', name: 'TCalls', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.TCalls }, data: setsT.curr });
          list.push({ id: 'tcPrev', name: 'TCalls -24h', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsT.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
          list.push({ id: 'as', name: 'ASR', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.ASR }, data: setsA.curr });
          list.push({ id: 'asPrev', name: 'ASR -24h', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsA.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
          list.push({ id: 'mn', name: 'Minutes', type: 'bar', xAxisIndex: 2, yAxisIndex: 2, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.Minutes }, data: setsM.curr });
          list.push({ id: 'mnPrev', name: 'Minutes -24h', type: 'bar', xAxisIndex: 2, yAxisIndex: 2, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsM.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
          list.push({ id: 'ac', name: 'ACD', type: 'bar', xAxisIndex: 3, yAxisIndex: 3, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.ACD }, data: setsC.curr });
          list.push({ id: 'acPrev', name: 'ACD -24h', type: 'bar', xAxisIndex: 3, yAxisIndex: 3, large: true, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsC.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
        }
        // Preview bars under the slider track (grid/xAxis/yAxis index 4)
        const previewData = provider ? provider.totals.TCalls : setsT.curr;
        list.push({ id: 'preview', name: 'Preview', type: 'bar', xAxisIndex: 4, yAxisIndex: 4, large: true, silent: true, barWidth: Math.max(1, Math.floor(bw * 0.66)), itemStyle: { color: '#4f86ff', opacity: 0.45 }, emphasis: { disabled: true }, tooltip: { show: false }, data: previewData });
        return list;
      })(),
      graphic: graphicLabels
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
        // each bar narrower to fit two slots per step and keep larger outer gap
        const each = Math.max(2, Math.floor(desired * 0.35));
        const cur = chart.getOption();
        const upd = (cur.series || []).filter(s => s && s.type === 'bar').map(s => ({ id: s.id, barWidth: each }));
        if (upd.length) chart.setOption({ series: upd }, { replaceMerge: ['series'], lazyUpdate: true });
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
      base.tCallsSeries = Array.isArray(merged.tCallsSeries) ? merged.tCallsSeries : base.tCallsSeries;
      base.asrSeries = Array.isArray(merged.asrSeries) ? merged.asrSeries : base.asrSeries;
      base.minutesSeries = Array.isArray(merged.minutesSeries) ? merged.minutesSeries : base.minutesSeries;
      base.acdSeries = Array.isArray(merged.acdSeries) ? merged.acdSeries : base.acdSeries;
      base.perProvider = !!merged.perProvider;
      base.providerRows = Array.isArray(merged.providerRows) ? merged.providerRows : base.providerRows;
    } catch(_) {}
    const next = buildOption(merged, newData);
    chart.setOption({
      xAxis: next.xAxis,
      yAxis: next.yAxis,
      grid: next.grid,
      series: next.series,
      graphic: next.graphic || []
    }, { replaceMerge: ['grid','xAxis','yAxis','series','graphic'], lazyUpdate: true });
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
