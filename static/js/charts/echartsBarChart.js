// static/js/charts/echartsBarChart.js
import * as echarts from 'echarts';
import { makeBarLineLikeTooltip } from './echarts/helpers/tooltip.js';
// move logic: use modular helpers/builders
import { buildCenters, makePairSets, detectProviderKey, parseRowTs } from './echarts/helpers/dataTransform.js';
import { getStableColor } from './echarts/helpers/colors.js';
import { getStepMs } from './echarts/helpers/time.js';
import { buildBarSeries } from './echarts/builders/BarChartBuilder.js';
import { subscribe } from '../state/eventBus.js';
import { attachCapsuleTooltip, detachCapsuleTooltip } from './echarts/helpers/capsuleTooltip.js';
import { initChart, setOptionWithZoomSync } from './echarts/renderer/EchartsRenderer.js';
import { getRange } from './echarts/services/zoomManager.js';
import { computeChartGrids } from './services/layout.js';

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
  const sliderEl = document.getElementById('chart-slider');
  let sliderChart = null;
  if (sliderEl) {
    try {
      const existingSlider = echarts.getInstanceByDom(sliderEl);
      if (existingSlider) existingSlider.dispose();
    } catch (_) { }
    sliderChart = initChart(sliderEl);
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

  let unsubscribeToggle = null; // event unsubscribe handle
  let capsuleTooltipAttached = false; // capsule tooltip state

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

  // Build a stable color map per supplier using provider rows
  // Note: Colors are neutral and consistent across renders (shared map in window)
  try {
    if (!base.colorMap) {
      const rows = Array.isArray(options?.providerRows) ? options.providerRows : [];
      const key = detectProviderKey(rows);
      const map = Object.create(null);
      // debug: providerRows sample
      try {
        if (typeof window !== 'undefined' && window.__chartsDebug) {
          console.debug('[bar] providerRows.len', rows.length, 'sample.keys', rows[0] ? Object.keys(rows[0]) : null, 'detectedKey', key);
        }
      } catch (_) { }
      if (rows.length && key) {
        const seen = new Set();
        const ID_CAND_KEYS = ['supplierId', 'providerId', 'vendorId', 'carrierId', 'peerId', 'id', 'supplier_id', 'provider_id', 'vendor_id', 'carrier_id', 'peer_id'];
        for (const r of rows) {
          const name = String(r?.[key] ?? '').trim();
          const idKey = ID_CAND_KEYS.find(k => r && Object.prototype.hasOwnProperty.call(r, k));
          const rawId = idKey ? r[idKey] : undefined;
          const id = (rawId != null) ? String(rawId) : undefined;
          if (!name && !id) continue;
          const color = getStableColor(name || id);
          if (name && !map[name]) map[name] = color; // map by human-readable name
          if (id && !map[id]) map[id] = color;       // map by numeric/string id for labels lookup
          const dedupKey = name || id;
          if (dedupKey) seen.add(dedupKey);
        }
      }
      // Fallback: seed from labels when rows/key are not available
      if (Object.keys(map).length === 0 && base.labels && (base.labels.ASR || base.labels.ACD)) {
        const collect = (obj) => {
          if (!obj || typeof obj !== 'object') return [];
          const all = [];
          for (const ts of Object.keys(obj)) {
            const arr = obj[ts] || obj[String(ts)] || [];
            if (!Array.isArray(arr)) continue;
            for (const it of arr) {
              const sid = (it && (it.supplierId ?? it.supplier ?? it.id ?? it.name)) ?? null;
              if (sid == null) continue;
              const name = String(it.name ?? it.supplier ?? '').trim();
              const id = String(sid);
              all.push({ id, name });
            }
          }
          return all;
        };
        const entries = [
          ...collect(base.labels.ASR),
          ...collect(base.labels.ACD)
        ];
        const seen = new Set();
        for (const { id, name } of entries) {
          const key = name || id;
          if (!key || seen.has(key)) continue;
          const color = getStableColor(key);
          if (name && !map[name]) map[name] = color;
          if (id && !map[id]) map[id] = color;
          seen.add(key);
        }
      }
      base.colorMap = map;
      // debug: colorMap size
      try {
        if (typeof window !== 'undefined' && window.__chartsDebug) {
          console.debug('[bar] colorMap.size', Object.keys(map).length);
        }
      } catch (_) { }
    }
  } catch (_) { /* keep default colorMap */ }
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
        try { w.__chartsZoomRange = null; } catch (_) { }
      }
    }
    try { w.__chartsLastFilters = { fromTs: f, toTs: t }; } catch (_) { }
  } catch (_) {
    // Ignore zoom reset errors
  }

  // remove legacy buildPairs (moved to helpers/dataTransform.js)

  const buildOption = (opts, d) => {
    const fromTs = Number(opts.fromTs);
    const toTs = Number(opts.toTs);
    const step = Number(opts.stepMs) || getStepMs(opts.interval);
    const dayMs = 24 * 3600e3;

    // use real container height for grid calculation
    const realHeight = el.clientHeight || el.getBoundingClientRect().height || opts.height || 520;
    const grids = computeChartGrids(realHeight);

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

    // Slider grid (for separate instance)
    const sliderGrid = { left: 40, right: 16, top: 4, bottom: 4, height: 40 };
    const xAxes = grids.map((g, i) => ({
      type: 'time', gridIndex: i, min: Number.isFinite(fromTs) ? fromTs : null, max: Number.isFinite(toTs) ? toTs : null,
      axisLabel: { color: '#6e7781' },
      axisLine: { lineStyle: { color: '#888' } },
      axisTick: { alignWithLabel: true, length: 6 },
      splitLine: { show: true, lineStyle: { color: '#eaeef2' } },
      axisPointer: { show: false }
    }));
    const sliderXAxis = {
      type: 'time', gridIndex: 0, min: Number.isFinite(fromTs) ? fromTs : null, max: Number.isFinite(toTs) ? toTs : null,
      axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }
    };
    const yAxes = grids.map((g, i) => ({ type: 'value', gridIndex: i, axisLabel: { show: false }, splitLine: { show: false }, axisLine: { lineStyle: { color: '#000' } } }));
    const sliderYAxis = { type: 'value', gridIndex: 0, axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false } };

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

    // Build overlay labels per supplier when backend labels have no supplier info
    const labelsEffective = (() => {
      try {
        const hasSupplierInfo = (obj) => {
          if (!obj || typeof obj !== 'object') return false;
          for (const k of Object.keys(obj)) {
            const arr = obj[k];
            if (!Array.isArray(arr)) continue;
            for (const it of arr) {
              if (it && typeof it === 'object' && (
                Object.prototype.hasOwnProperty.call(it, 'supplierId') ||
                Object.prototype.hasOwnProperty.call(it, 'id') ||
                Object.prototype.hasOwnProperty.call(it, 'supplier') ||
                Object.prototype.hasOwnProperty.call(it, 'name')
              )) return true;
            }
          }
          return false;
        };
        const le = { ASR: (opts.labels && opts.labels.ASR) || {}, ACD: (opts.labels && opts.labels.ACD) || {} };
        const needBuild = !(hasSupplierInfo(le.ASR) || hasSupplierInfo(le.ACD));
        try { if (typeof window !== 'undefined' && window.__chartsDebug) console.debug('[bar] labels.hasSupplierInfo', !needBuild); } catch (_) { }
        if (!needBuild) return le;
        const rows = Array.isArray(options?.providerRows) ? options.providerRows : [];
        if (!rows.length) return le;

        const NAME_KEYS = ['name', 'supplier', 'provider', 'peer', 'vendor', 'carrier', 'operator', 'route', 'trunk', 'gateway', 'partner', 'supplier_name', 'provider_name', 'vendor_name', 'carrier_name', 'peer_name'];
        const ID_KEYS = ['supplierId', 'providerId', 'vendorId', 'carrierId', 'peerId', 'id', 'supplier_id', 'provider_id', 'vendor_id', 'carrier_id', 'peer_id'];
        const slotCenter = (t) => {
          const step = Number(step) || Number(opts.stepMs) || getStepMs(opts.interval);
          const s = Number.isFinite(step) && step > 0 ? Math.floor(t / step) * step : t;
          return Number.isFinite(step) && step > 0 ? (s + Math.floor(step / 2)) : s;
        };
        const aggASR = new Map(); // ts -> Map<key,{sum,cnt,name,id}>
        const aggACD = new Map();
        for (const r of rows) {
          const t = parseRowTs(r.time || r.slot || r.hour || r.timestamp);
          if (!Number.isFinite(t)) continue;
          const c = (() => { const stepv = Number(opts.stepMs) || getStepMs(opts.interval); const base = Math.floor(t / stepv) * stepv; return base + Math.floor(stepv / 2); })();
          let name = null; let sid = null;
          for (const k of ID_KEYS) { if (sid == null && Object.prototype.hasOwnProperty.call(r, k)) sid = r[k]; }
          for (const k of NAME_KEYS) { if (name == null && Object.prototype.hasOwnProperty.call(r, k)) name = r[k]; }
          const key = String(sid != null ? sid : (name != null ? name : ''));
          if (!key) continue;
          const asr = Number(r.ASR ?? r.asr);
          const acd = Number(r.ACD ?? r.acd);
          if (Number.isFinite(asr)) {
            let m = aggASR.get(c); if (!m) { m = new Map(); aggASR.set(c, m); }
            const cell = m.get(key) || { sum: 0, cnt: 0, name: (name != null ? String(name) : null), id: (sid != null ? String(sid) : null) };
            cell.sum += asr; cell.cnt += 1; m.set(key, cell);
          }
          if (Number.isFinite(acd)) {
            let m = aggACD.get(c); if (!m) { m = new Map(); aggACD.set(c, m); }
            const cell = m.get(key) || { sum: 0, cnt: 0, name: (name != null ? String(name) : null), id: (sid != null ? String(sid) : null) };
            cell.sum += acd; cell.cnt += 1; m.set(key, cell);
          }
        }
        const toArrMap = (agg) => {
          const out = {};
          for (const [ts, m] of agg.entries()) {
            const arr = [];
            for (const [k, v] of m.entries()) {
              const val = v.cnt > 0 ? (v.sum / v.cnt) : null;
              if (Number.isFinite(val)) arr.push({ supplierId: v.id ?? v.name ?? k, name: v.name ?? null, value: val });
            }
            out[ts] = arr;
          }
          return out;
        };
        const eff = { ASR: toArrMap(aggASR), ACD: toArrMap(aggACD) };
        // debug: labelsEffective shape
        try {
          if (typeof window !== 'undefined' && window.__chartsDebug) {
            const k = Object.keys(eff.ASR || {});
            console.debug('[bar] labelsEffective.ASR.keys.len', k.length, 'firstLens', k.slice(0, 3).map(ts => (eff.ASR[ts] || []).length));
          }
        } catch (_) { }
        return eff;
      } catch (_) { return { ASR: (opts.labels && opts.labels.ASR) || {}, ACD: (opts.labels && opts.labels.ACD) || {} }; }
    })();

    const showLabels = (() => { try { return !!(typeof window !== 'undefined' && window.__chartsBarPerProvider); } catch (_) { return false; } })();
    const out = {
      animation: true,
      animationDurationUpdate: 200,
      animationEasingUpdate: 'cubicOut',
      grid: grids,
      xAxis: xAxes.map(x => ({
        ...x,
        axisPointer: { ...x.axisPointer, label: { show: false }, triggerTooltip: false }
      })),
      yAxis: yAxes.map(y => ({
        ...y,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false }
      })),
      tooltip: {
        trigger: 'item', // User Request: Highlight ONLY the specific bar under mouse
        // axisPointer removed as it applies to axis trigger
        confine: true,
        order: 'valueAsc',
        formatter: makeBarLineLikeTooltip({ chart, stepMs: step }),
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderColor: '#e6e9ef',
        borderWidth: 1,
        padding: [9, 12],
        textStyle: { color: 'var(--ds-color-fg)' },
        extraCssText: 'border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.07); line-height:1.35;'
      },
      // axisPointer: { link: [{ xAxisIndex: [0, 1, 2, 3] }] }, // Removed to prevent group highlight
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1, 2, 3],
          startValue: startVal,
          endValue: endVal,
          throttle: 80,
          zoomOnMouseWheel: 'shift',
          moveOnMouseWheel: false,
          moveOnMouseMove: true,
        }
      ],
      series: buildBarSeries({
        setsT, setsA, setsM, setsC,
        centers,
        interval: opts.interval,
        stepMs: step,
        labels: labelsEffective,
        colorMap: opts.colorMap,
        providerRows: Array.isArray(options?.providerRows) ? options.providerRows : [],
        providerKey: (() => { try { return detectProviderKey(Array.isArray(options?.providerRows) ? options.providerRows : []); } catch (_) { return null; } })()
      }),
      graphic: graphicLabels
    };

    // Slider Option
    const sliderOption = {
      animation: false,
      grid: [sliderGrid],
      xAxis: [sliderXAxis],
      yAxis: [sliderYAxis],
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: 0,
          startValue: startVal,
          endValue: endVal,
          height: 32,
          bottom: 8,
          throttle: 80,
          backgroundColor: 'rgba(0,0,0,0)',
          fillerColor: 'rgba(79,134,255,0.12)',
          showDataShadow: false,
          dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
          selectedDataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } }
        },
        {
          type: 'inside',
          xAxisIndex: 0,
          startValue: startVal,
          endValue: endVal,
          zoomOnMouseWheel: 'shift',
          moveOnMouseWheel: false,
          moveOnMouseMove: true
        }
      ],
      series: [
        // TCalls only - no prev data, only current
        {
          type: 'bar',
          data: (setsT.curr || []).filter(d => d && d[1] != null),
          xAxisIndex: 0,
          yAxisIndex: 0,
          barWidth: 3,
          itemStyle: { color: colorMain },
          silent: true,
          animation: false
        }
      ]
    };
    // expose labelsEffective for tooltip fallback
    try { out.__labelsEffective = labelsEffective; } catch (_) { }
    // post-process overlay series for performance
    try {
      const ser = Array.isArray(out.series) ? out.series : [];
      for (const s of ser) {
        if (s && s.type === 'custom' && s.name === 'LabelsOverlay') {
          s.animation = false; // no animation for overlay
          s.animationDuration = 0;
          s.animationEasing = 'linear';
          s.renderMode = 'canvas';
        }
      }
    } catch (_) { }
    if (!showLabels) {
      try {
        out.series = Array.isArray(out.series) ? out.series.filter(s => !(s && s.type === 'custom' && s.name === 'LabelsOverlay')) : out.series;
      } catch (_) {/* keep series */ }
    }
    return { main: out, slider: sliderOption };
  };

  const { main, slider } = buildOption(base, data);

  // Render Main Chart
  setOptionWithZoomSync(chart, main, {
    onAfterSet: () => {
      try { requestAnimationFrame(() => setTimeout(applyDynamicBarWidth, 0)); } catch (_) { }
      // attach capsule tooltip once
      try {
        if (!capsuleTooltipAttached) {
          const metricByGridIndex = { 0: 'TCalls', 1: 'ASR', 2: 'Minutes', 3: 'ACD' };
          const getCapsuleData = ({ metric, ts }) => {
            try {
              const src = (options && options.capsuleTooltipData) || (typeof window !== 'undefined' ? window.__capsuleTooltipData : null);
              if (src) {
                const key = metric && src[metric] ? metric : (metric && src[String(metric).toUpperCase()] ? String(metric).toUpperCase() : null);
                const perMetric = key ? src[key] : null;
                const byTs = perMetric ? (perMetric[ts] || perMetric[String(ts)] || perMetric[Math.floor(Number(ts) / 1000)] || perMetric[String(Math.floor(Number(ts) / 1000))]) : null;
                if (byTs) {
                  // normalize arrays from possible alt keys
                  const toArr = (v) => Array.isArray(v) ? v : (v != null ? [v] : []);
                  const customersArr = Array.isArray(byTs.customers) ? byTs.customers
                    : Array.isArray(byTs.customer) ? byTs.customer
                      : Array.isArray(byTs.clients) ? byTs.clients
                        : Array.isArray(byTs.client) ? byTs.client
                          : toArr(byTs.customers || byTs.customer || byTs.clients || byTs.client);
                  const destinationsArr = Array.isArray(byTs.destinations) ? byTs.destinations
                    : Array.isArray(byTs.destination) ? byTs.destination
                      : Array.isArray(byTs.directions) ? byTs.directions
                        : Array.isArray(byTs.direction) ? byTs.direction
                          : toArr(byTs.destinations || byTs.destination || byTs.directions || byTs.direction);
                  const ret = {
                    time: byTs.time || new Date(Number(ts)).toISOString().replace('T', ' ').replace('Z', ''),
                    suppliers: Array.isArray(byTs.suppliers) ? byTs.suppliers : [],
                    customers: customersArr,
                    destinations: destinationsArr,
                    customersBySupplier: byTs.customersBySupplier || byTs.customers_by_supplier || byTs.customersPerSupplier || byTs.customers_per_supplier || undefined,
                    destinationsBySupplier: byTs.destinationsBySupplier || byTs.destinations_by_supplier || byTs.destinationBySupplier || byTs.destination_by_supplier || undefined,
                  };
                  // if external source has no suppliers, try labelsEffective fallback before leaving
                  if (!ret.suppliers || ret.suppliers.length === 0) {
                    try {
                      const mKey = (metric === 'ASR' || metric === 'ACD') ? metric : null;
                      const eff = main && main.__labelsEffective && main.__labelsEffective[mKey];
                      if (mKey && eff) {
                        const byTs2 = eff[ts] || eff[String(ts)] || eff[Math.floor(Number(ts) / 1000)] || eff[String(Math.floor(Number(ts) / 1000))];
                        if (Array.isArray(byTs2) && byTs2.length) ret.suppliers = byTs2;
                      }
                    } catch (_) { }
                  }
                  // minimal fallback: populate arrays from maps if arrays are empty
                  try {
                    if ((!ret.customers || ret.customers.length === 0) && ret.customersBySupplier && typeof ret.customersBySupplier === 'object') {
                      const acc = [];
                      for (const k of Object.keys(ret.customersBySupplier)) {
                        const arr = ret.customersBySupplier[k];
                        if (Array.isArray(arr) && arr.length) acc.push(String(arr[0]));
                        if (acc.length >= 3) break;
                      }
                      if (acc.length) ret.customers = acc;
                    }
                    if ((!ret.destinations || ret.destinations.length === 0) && ret.destinationsBySupplier && typeof ret.destinationsBySupplier === 'object') {
                      const acc = [];
                      for (const k of Object.keys(ret.destinationsBySupplier)) {
                        const arr = ret.destinationsBySupplier[k];
                        if (Array.isArray(arr) && arr.length) acc.push(String(arr[0]));
                        if (acc.length >= 3) break;
                      }
                      if (acc.length) ret.destinations = acc;
                    }
                  } catch (_) { }
                  if (ret.suppliers && ret.suppliers.length) return ret;
                  // else continue to providerRows fallback
                }
              }
              // Fallback 1: use labels passed into chart (ASR/ACD only)
              try {
                const mKey = (metric === 'ASR' || metric === 'ACD') ? metric : null;
                const lm = (main && main.__labelsEffective && main.__labelsEffective[mKey]) || (options && options.labels && options.labels[mKey]) || null;
                if (mKey && lm) {
                  const byTs2 = lm[ts] || lm[String(ts)] || lm[Math.floor(Number(ts) / 1000)] || lm[String(Math.floor(Number(ts) / 1000))];
                  if (Array.isArray(byTs2)) {
                    const ret = {
                      time: new Date(Number(ts)).toISOString().replace('T', ' ').replace('Z', ''),
                      suppliers: byTs2,
                      customers: [],
                      destinations: [],
                    };
                    // enrich with per-supplier customers/destinations using providerRows when available (visual-only)
                    try {
                      const rows = Array.isArray(options?.providerRows) ? options.providerRows : [];
                      if (rows.length) {
                        const pKey = detectProviderKey(rows);
                        if (pKey) {
                          const destCand = ['destination', 'Destination', 'dst', 'Dst', 'country', 'Country', 'prefix', 'Prefix', 'route', 'Route', 'direction', 'Direction'];
                          const custCand = ['customer', 'Customer', 'client', 'Client', 'account', 'Account', 'buyer', 'Buyer', 'main', 'Main'];
                          const detectKey = (cands) => {
                            try {
                              const lowerPref = cands.map(k => k.toLowerCase());
                              for (const r of rows) {
                                if (!r || typeof r !== 'object') continue;
                                for (const k of Object.keys(r)) {
                                  const kl = String(k).toLowerCase();
                                  if (!lowerPref.includes(kl)) continue;
                                  const v = r[k];
                                  const s = typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : '');
                                  if (s) return k;
                                }
                              }
                            } catch (_) { }
                            return null;
                          };
                          const destKey = detectKey(destCand);
                          const custKey = detectKey(custCand);
                          const stepLocal = Number(base.stepMs) || getStepMs(base.interval);
                          const bucketCenter = (t) => { const b = Math.floor(t / stepLocal) * stepLocal; return b + Math.floor(stepLocal / 2); };
                          const custBySup = Object.create(null); // name -> string[]
                          const destBySup = Object.create(null); // name -> string[]
                          for (const r of rows) {
                            const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour || r.datetime || r.DateTime || r.ts || r.TS || r.period || r.Period || r.start || r.Start || r.start_time || r.StartTime);
                            if (!Number.isFinite(rt)) continue;
                            if (bucketCenter(rt) !== ts) continue;
                            const prov = String(r[pKey] || '').trim();
                            if (!prov) continue;
                            if (custKey) {
                              const c = String(r[custKey] || '').trim();
                              if (c) {
                                let arr = custBySup[prov];
                                if (!arr) { arr = []; custBySup[prov] = arr; }
                                if (!arr.includes(c)) arr.push(c);
                              }
                            }
                            if (destKey) {
                              const d = String(r[destKey] || '').trim();
                              if (d) {
                                let arr = destBySup[prov];
                                if (!arr) { arr = []; destBySup[prov] = arr; }
                                if (!arr.includes(d)) arr.push(d);
                              }
                            }
                          }
                          if (Object.keys(custBySup).length) ret.customersBySupplier = custBySup;
                          if (Object.keys(destBySup).length) ret.destinationsBySupplier = destBySup;
                        }
                      }
                    } catch (_) { }
                    return ret;
                  }
                }
              } catch (_) { }
              // Fallback: compute from providerRows if available
              const rows = Array.isArray(options?.providerRows) ? options.providerRows : [];
              if (!rows.length) return null;
              const pKey = detectProviderKey(rows);
              if (!pKey) return null;
              const destCand = ['destination', 'Destination', 'dst', 'Dst', 'country', 'Country', 'prefix', 'Prefix', 'route', 'Route', 'direction', 'Direction'];
              const custCand = ['customer', 'Customer', 'client', 'Client', 'account', 'Account', 'buyer', 'Buyer', 'main', 'Main'];
              const detectKey = (cands) => {
                try {
                  const lowerPref = cands.map(k => k.toLowerCase());
                  for (const r of rows) {
                    if (!r || typeof r !== 'object') continue;
                    for (const k of Object.keys(r)) {
                      const kl = String(k).toLowerCase();
                      if (!lowerPref.includes(kl)) continue;
                      const v = r[k];
                      const s = typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : '');
                      if (s) return k;
                    }
                  }
                } catch (_) { }
                return null;
              };
              const destKey = detectKey(destCand);
              const custKey = detectKey(custCand);
              const bucketCenter = (t) => { const base = Math.floor(t / step) * step; return base + Math.floor(step / 2); };
              const supAgg = new Map(); // name -> { sum, cnt }
              const custBySup = new Map(); // name -> Set
              const destBySup = new Map(); // name -> Map(dest->{sum,cnt})
              for (const r of rows) {
                const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour || r.datetime || r.DateTime || r.ts || r.TS || r.period || r.Period || r.start || r.Start || r.start_time || r.StartTime);
                if (!Number.isFinite(rt)) continue;
                if (bucketCenter(rt) !== ts) continue;
                const prov = String(r[pKey] || '').trim();
                if (!prov) continue;
                let v = null;
                if (metric === 'ASR') { const vv = Number(r.ASR ?? r.asr); v = Number.isFinite(vv) ? vv : null; }
                else if (metric === 'ACD') { const vv = Number(r.ACD ?? r.acd); v = Number.isFinite(vv) ? vv : null; }
                else if (metric === 'Minutes') { const vv = Number(r.Min ?? r.Minutes); v = Number.isFinite(vv) ? vv : 0; }
                else if (metric === 'TCalls') { const vv = Number(r.TCall ?? r.TCalls ?? r.total_calls); v = Number.isFinite(vv) ? vv : 0; }
                if (metric === 'ASR' || metric === 'ACD') {
                  if (v == null) { /* skip missing */ } else { const a = supAgg.get(prov) || { sum: 0, cnt: 0 }; a.sum += v; a.cnt += 1; supAgg.set(prov, a); }
                } else {
                  const a = supAgg.get(prov) || { sum: 0, cnt: 0 }; a.sum += (v || 0); supAgg.set(prov, a);
                }
                if (custKey) {
                  const c = String(r[custKey] || '').trim();
                  if (c) { let s = custBySup.get(prov); if (!s) { s = new Set(); custBySup.set(prov, s); } s.add(c); }
                }
                if (destKey) {
                  const d = String(r[destKey] || '').trim();
                  let m = destBySup.get(prov); if (!m) { m = new Map(); destBySup.set(prov, m); }
                  let g = m.get(d); if (!g) { g = { sum: 0, cnt: 0 }; m.set(d, g); }
                  if (metric === 'ASR' || metric === 'ACD') { if (v != null) { g.sum += v; g.cnt += 1; } }
                  else { g.sum += (v || 0); }
                }
              }
              const suppliers = Array.from(supAgg.entries()).map(([name, a]) => ({ name, value: (metric === 'ASR' || metric === 'ACD') ? (a.cnt ? (a.sum / a.cnt) : null) : a.sum })).filter(s => (metric === 'ASR' || metric === 'ACD') ? Number.isFinite(s.value) : true);
              suppliers.sort((x, y) => (Number(y.value) || 0) - (Number(x.value) || 0));
              const customersBySupplier = {};
              for (const [name, set] of custBySup.entries()) customersBySupplier[name] = Array.from(set.values());
              const destinationsBySupplier = {};
              for (const [name, m] of destBySup.entries()) {
                const arr = [];
                for (const [dest, agg] of m.entries()) {
                  const val = (metric === 'ASR' || metric === 'ACD') ? (agg.cnt ? (agg.sum / agg.cnt) : 0) : agg.sum;
                  arr.push(`${dest || '—'}: ${(metric === 'ASR') ? `${val.toFixed(2)}%` : (metric === 'ACD' ? `${val.toFixed(2)}` : `${val}`)}`);
                }
                arr.sort();
                destinationsBySupplier[name] = arr;
              }
              return { time: new Date(Number(ts)).toISOString().replace('T', ' ').replace('Z', ''), suppliers, customers: [], destinations: [], customersBySupplier, destinationsBySupplier };
            } catch (_) { return null; }
          };
          attachCapsuleTooltip(chart, { getCapsuleData, textColor: 'var(--ds-color-fg)', metricByGridIndex });
          capsuleTooltipAttached = true;
        }
      } catch (_) { /* ignore tooltip attach errors */ }
    }
  });

  // Render Slider Chart
  if (sliderChart && slider) {
    setOptionWithZoomSync(sliderChart, slider);
  }

  // sync both charts with current zoom range
  try {
    const zr = getRange();
    if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs)) {
      chart.setOption({ dataZoom: [{ startValue: zr.fromTs, endValue: zr.toTs }] }, { lazyUpdate: true });
      if (sliderChart) {
        sliderChart.setOption({ dataZoom: [{ startValue: zr.fromTs, endValue: zr.toTs }, { startValue: zr.fromTs, endValue: zr.toTs }] }, { lazyUpdate: true });
      }
    }
  } catch (_) { }

  // react to Suppliers checkbox toggle: re-render overlay labels visibility
  try {
    unsubscribeToggle = subscribe('charts:bar:perProviderChanged', () => {
      try {
        const { main: nextMain, slider: nextSlider } = buildOption(base, data);
        setOptionWithZoomSync(chart, nextMain);
        if (sliderChart) setOptionWithZoomSync(sliderChart, nextSlider);
      } catch (_) { }
    });
  } catch (_) { /* ignore subscription errors */ }

  const computeStepWidthPx = () => {
    try {
      // skip if chart is disposed
      if (chart.isDisposed && chart.isDisposed()) return null;
      const step = Number(base.stepMs) || getStepMs(base.interval);
      // prefer current zoom start; else fromTs; else first data point
      const zr = (typeof window !== 'undefined') ? window.__chartsZoomRange : null;
      const ref = (zr && Number.isFinite(zr.fromTs)) ? zr.fromTs : (Number(base.fromTs) || (Array.isArray(main.series?.[0]?.data) ? main.series[0].data[0]?.[0] : null));
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
    // skip if chart is disposed
    if (chart.isDisposed && chart.isDisposed()) return;
    const w = computeStepWidthPx();
    if (Number.isFinite(w)) {
      // leave a small gap between bars (~8%)
      const desired = Math.max(2, Math.floor(w * 0.92));
      try {
        // each bar narrower to fit two slots per step and keep larger outer gap
        const each = Math.max(2, Math.floor(desired * 0.35));
        // skip update if width did not change (prevents layout thrash)
        if (chart.__lastBarWidth === each) return;
        const cur = chart.getOption();
        const upd = (cur.series || []).filter(s => s && s.type === 'bar').map(s => ({ id: s.id, barWidth: each }));
        if (upd.length) {
          chart.setOption({ series: upd }, { lazyUpdate: true });
          chart.__lastBarWidth = each;
        }
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
    const { main: nextMain, slider: nextSlider } = buildOption(merged, newData);
    setOptionWithZoomSync(chart, nextMain, {
      onAfterSet: () => {
        try { applyDynamicBarWidth(); } catch (_) { }
        // reattach capsule tooltip to reflect updated data source if provided
        try { detachCapsuleTooltip(chart); } catch (_) { }
        try {
          const metricByGridIndex = { 0: 'TCalls', 1: 'ASR', 2: 'Minutes', 3: 'ACD' };
          const getCapsuleData = ({ metric, ts }) => {
            try {
              const src = (merged && merged.capsuleTooltipData) || (options && options.capsuleTooltipData) || (typeof window !== 'undefined' ? window.__capsuleTooltipData : null);
              if (src) {
                const key = metric && src[metric] ? metric : (metric && src[String(metric).toUpperCase()] ? String(metric).toUpperCase() : null);
                const perMetric = key ? src[key] : null;
                const byTs = perMetric ? (perMetric[ts] || perMetric[String(ts)] || perMetric[Math.floor(Number(ts) / 1000)] || perMetric[String(Math.floor(Number(ts) / 1000))]) : null;
                if (byTs) {
                  // normalize arrays from possible alt keys (singular/plural variants)
                  const toArr = (v) => Array.isArray(v) ? v : (v != null ? [v] : []);
                  const customersArr = Array.isArray(byTs.customers) ? byTs.customers
                    : Array.isArray(byTs.customer) ? byTs.customer
                      : Array.isArray(byTs.clients) ? byTs.clients
                        : Array.isArray(byTs.client) ? byTs.client
                          : toArr(byTs.customers || byTs.customer || byTs.clients || byTs.client);
                  const destinationsArr = Array.isArray(byTs.destinations) ? byTs.destinations
                    : Array.isArray(byTs.destination) ? byTs.destination
                      : Array.isArray(byTs.directions) ? byTs.directions
                        : Array.isArray(byTs.direction) ? byTs.direction
                          : toArr(byTs.destinations || byTs.destination || byTs.directions || byTs.direction);
                  let ret = {
                    time: byTs.time || new Date(Number(ts)).toISOString().replace('T', ' ').replace('Z', ''),
                    suppliers: Array.isArray(byTs.suppliers) ? byTs.suppliers : [],
                    customers: customersArr,
                    destinations: destinationsArr,
                    customersBySupplier: byTs.customersBySupplier || byTs.customers_by_supplier || byTs.customersPerSupplier || byTs.customers_per_supplier || undefined,
                    destinationsBySupplier: byTs.destinationsBySupplier || byTs.destinations_by_supplier || byTs.destinationBySupplier || byTs.destination_by_supplier || undefined,
                  };
                  if (!ret.suppliers || ret.suppliers.length === 0) {
                    try {
                      const mKey = (metric === 'ASR' || metric === 'ACD') ? metric : null;
                      const eff = (nextMain && nextMain.__labelsEffective && nextMain.__labelsEffective[mKey]) || (merged && merged.labels && merged.labels[mKey]) || (options && options.labels && options.labels[mKey]) || null;
                      if (mKey && eff) {
                        const byTs2 = eff[ts] || eff[String(ts)] || eff[Math.floor(Number(ts) / 1000)] || eff[String(Math.floor(Number(ts) / 1000))];
                        if (Array.isArray(byTs2) && byTs2.length) ret.suppliers = byTs2;
                      }
                    } catch (_) { }
                  }
                  // minimal fallback: populate arrays from maps if arrays are empty
                  try {
                    if ((!ret.customers || ret.customers.length === 0) && ret.customersBySupplier && typeof ret.customersBySupplier === 'object') {
                      const acc = [];
                      for (const k of Object.keys(ret.customersBySupplier)) {
                        const arr = ret.customersBySupplier[k];
                        if (Array.isArray(arr) && arr.length) acc.push(String(arr[0]));
                        if (acc.length >= 3) break;
                      }
                      if (acc.length) ret.customers = acc;
                    }
                    if ((!ret.destinations || ret.destinations.length === 0) && ret.destinationsBySupplier && typeof ret.destinationsBySupplier === 'object') {
                      const acc = [];
                      for (const k of Object.keys(ret.destinationsBySupplier)) {
                        const arr = ret.destinationsBySupplier[k];
                        if (Array.isArray(arr) && arr.length) acc.push(String(arr[0]));
                        if (acc.length >= 3) break;
                      }
                      if (acc.length) ret.destinations = acc;
                    }
                  } catch (_) { }
                  if (ret.suppliers && ret.suppliers.length) return ret;
                  // else continue to providerRows fallback
                }
              }
              // Fallback 1: use labels passed into chart (ASR/ACD only)
              try {
                const mKey = (metric === 'ASR' || metric === 'ACD') ? metric : null;
                const lm = (nextMain && nextMain.__labelsEffective && nextMain.__labelsEffective[mKey]) || (merged && merged.labels && merged.labels[mKey]) || (options && options.labels && options.labels[mKey]) || null;
                if (mKey && lm) {
                  const byTs2 = lm[ts] || lm[String(ts)] || lm[Math.floor(Number(ts) / 1000)] || lm[String(Math.floor(Number(ts) / 1000))];
                  if (Array.isArray(byTs2)) {
                    const ret = {
                      time: new Date(Number(ts)).toISOString().replace('T', ' ').replace('Z', ''),
                      suppliers: byTs2,
                      customers: [],
                      destinations: [],
                    };
                    // enrich with per-supplier customers/destinations using providerRows when available (visual-only)
                    try {
                      const rowsFallback = Array.isArray(merged?.providerRows) ? merged.providerRows : (Array.isArray(options?.providerRows) ? options.providerRows : []);
                      if (rowsFallback.length) {
                        const pKey = detectProviderKey(rowsFallback);
                        if (pKey) {
                          const destCand = ['destination', 'Destination', 'dst', 'Dst', 'country', 'Country', 'prefix', 'Prefix', 'route', 'Route', 'direction', 'Direction'];
                          const custCand = ['customer', 'Customer', 'client', 'Client', 'account', 'Account', 'buyer', 'Buyer', 'main', 'Main'];
                          const detectKey = (cands) => {
                            try {
                              const lowerPref = cands.map(k => k.toLowerCase());
                              for (const r of rowsFallback) {
                                if (!r || typeof r !== 'object') continue;
                                for (const k of Object.keys(r)) {
                                  const kl = String(k).toLowerCase();
                                  if (!lowerPref.includes(kl)) continue;
                                  const v = r[k];
                                  const s = typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : '');
                                  if (s) return k;
                                }
                              }
                            } catch (_) { }
                            return null;
                          };
                          const destKey = detectKey(destCand);
                          const custKey = detectKey(custCand);
                          const stepLocal = Number(base.stepMs) || getStepMs(base.interval);
                          const bucketCenter = (t) => { const b = Math.floor(t / stepLocal) * stepLocal; return b + Math.floor(stepLocal / 2); };
                          const custBySup = Object.create(null); // name -> string[]
                          const destBySup = Object.create(null); // name -> string[]
                          for (const r of rowsFallback) {
                            const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour || r.datetime || r.DateTime || r.ts || r.TS || r.period || r.Period || r.start || r.Start || r.start_time || r.StartTime);
                            if (!Number.isFinite(rt)) continue;
                            if (bucketCenter(rt) !== ts) continue;
                            const prov = String(r[pKey] || '').trim();
                            if (!prov) continue;
                            if (custKey) {
                              const c = String(r[custKey] || '').trim();
                              if (c) {
                                let arr = custBySup[prov];
                                if (!arr) { arr = []; custBySup[prov] = arr; }
                                if (!arr.includes(c)) arr.push(c);
                              }
                            }
                            if (destKey) {
                              const d = String(r[destKey] || '').trim();
                              if (d) {
                                let arr = destBySup[prov];
                                if (!arr) { arr = []; destBySup[prov] = arr; }
                                if (!arr.includes(d)) arr.push(d);
                              }
                            }
                          }
                          if (Object.keys(custBySup).length) ret.customersBySupplier = custBySup;
                          if (Object.keys(destBySup).length) ret.destinationsBySupplier = destBySup;
                        }
                      }
                    } catch (_) { }
                    return ret;
                  }
                }
              } catch (_) { }
              const rows = Array.isArray(merged?.providerRows) ? merged.providerRows : (Array.isArray(options?.providerRows) ? options.providerRows : []);
              if (!rows.length) return null;
              const pKey = detectProviderKey(rows);
              if (!pKey) return null;
              const destCand = ['destination', 'Destination', 'dst', 'Dst', 'country', 'Country', 'prefix', 'Prefix', 'route', 'Route', 'direction', 'Direction'];
              const custCand = ['customer', 'Customer', 'client', 'Client', 'account', 'Account', 'buyer', 'Buyer', 'main', 'Main'];
              const detectKey = (cands) => {
                try {
                  const lowerPref = cands.map(k => k.toLowerCase());
                  for (const r of rows) {
                    if (!r || typeof r !== 'object') continue;
                    for (const k of Object.keys(r)) {
                      const kl = String(k).toLowerCase();
                      if (!lowerPref.includes(kl)) continue;
                      const v = r[k];
                      const s = typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : '');
                      if (s) return k;
                    }
                  }
                } catch (_) { }
                return null;
              };
              const destKey = detectKey(destCand);
              const custKey = detectKey(custCand);
              const bucketCenter = (t) => { const base = Math.floor(t / base.stepMs) * base.stepMs; return base + Math.floor(base.stepMs / 2); };
              const supAgg = new Map();
              const custBySup = new Map();
              const destBySup = new Map();
              for (const r of rows) {
                const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour || r.datetime || r.DateTime || r.ts || r.TS || r.period || r.Period || r.start || r.Start || r.start_time || r.StartTime);
                if (!Number.isFinite(rt)) continue;
                const ctr = (() => { const s = Number(base.stepMs) || getStepMs(base.interval); const basev = Math.floor(rt / s) * s; return basev + Math.floor(s / 2); })();
                if (ctr !== ts) continue;
                const prov = String(r[pKey] || '').trim();
                if (!prov) continue;
                let v = null;
                if (metric === 'ASR') { const vv = Number(r.ASR ?? r.asr); v = Number.isFinite(vv) ? vv : null; }
                else if (metric === 'ACD') { const vv = Number(r.ACD ?? r.acd); v = Number.isFinite(vv) ? vv : null; }
                else if (metric === 'Minutes') { const vv = Number(r.Min ?? r.Minutes); v = Number.isFinite(vv) ? vv : 0; }
                else if (metric === 'TCalls') { const vv = Number(r.TCall ?? r.TCalls ?? r.total_calls); v = Number.isFinite(vv) ? vv : 0; }
                if (metric === 'ASR' || metric === 'ACD') {
                  if (v == null) { /* skip missing */ } else { const a = supAgg.get(prov) || { sum: 0, cnt: 0 }; a.sum += v; a.cnt += 1; supAgg.set(prov, a); }
                } else {
                  const a = supAgg.get(prov) || { sum: 0, cnt: 0 }; a.sum += (v || 0); supAgg.set(prov, a);
                }
                if (custKey) {
                  const c = String(r[custKey] || '').trim();
                  if (c) { let s = custBySup.get(prov); if (!s) { s = new Set(); custBySup.set(prov, s); } s.add(c); }
                }
                if (destKey) {
                  const d = String(r[destKey] || '').trim();
                  let m = destBySup.get(prov); if (!m) { m = new Map(); destBySup.set(prov, m); }
                  let g = m.get(d); if (!g) { g = { sum: 0, cnt: 0 }; m.set(d, g); }
                  if (metric === 'ASR' || metric === 'ACD') { if (v != null) { g.sum += v; g.cnt += 1; } }
                  else { g.sum += (v || 0); }
                }
              }
              const suppliers = Array.from(supAgg.entries()).map(([name, a]) => ({ name, value: (metric === 'ASR' || metric === 'ACD') ? (a.cnt ? (a.sum / a.cnt) : null) : a.sum })).filter(s => (metric === 'ASR' || metric === 'ACD') ? Number.isFinite(s.value) : true);
              suppliers.sort((x, y) => (Number(y.value) || 0) - (Number(x.value) || 0));
              const customersBySupplier = {};
              for (const [name, set] of custBySup.entries()) customersBySupplier[name] = Array.from(set.values());
              const destinationsBySupplier = {};
              for (const [name, m] of destBySup.entries()) {
                const arr = [];
                for (const [dest, agg] of m.entries()) {
                  const s = Number(base.stepMs) || getStepMs(base.interval);
                  const val = (metric === 'ASR' || metric === 'ACD') ? (agg.cnt ? (agg.sum / agg.cnt) : 0) : agg.sum;
                  arr.push(`${dest || '—'}: ${(metric === 'ASR') ? `${val.toFixed(2)}%` : (metric === 'ACD' ? `${val.toFixed(2)}` : `${val}`)}`);
                }
                arr.sort();
                destinationsBySupplier[name] = arr;
              }
              return { time: new Date(Number(ts)).toISOString().replace('T', ' ').replace('Z', ''), suppliers, customers: [], destinations: [], customersBySupplier, destinationsBySupplier };
            } catch (_) { return null; }
          };
          attachCapsuleTooltip(chart, { getCapsuleData, textColor: 'var(--ds-color-fg)', metricByGridIndex });
          capsuleTooltipAttached = true;

        } catch (_) { /* ignore tooltip attach errors */ }
      }
    });

    // Render Slider Chart
    if (sliderChart && nextSlider) {
      setOptionWithZoomSync(sliderChart, nextSlider);
    }

    try {
      const zr = (typeof window !== 'undefined') ? window.__chartsZoomRange : null;
      const baseLo = Number(merged.fromTs);
      const baseHi = Number(merged.toTs);
      const clamp = (v) => (Number.isFinite(baseLo) && Number.isFinite(baseHi)) ? Math.max(baseLo, Math.min(baseHi, v)) : v;
      let sv = Number.isFinite(zr?.fromTs) ? clamp(Number(zr.fromTs)) : baseLo;
      let ev = Number.isFinite(zr?.toTs) ? clamp(Number(zr.toTs)) : baseHi;
      if (Number.isFinite(sv) && Number.isFinite(ev) && ev > sv) {
        chart.setOption({ dataZoom: [{ startValue: sv, endValue: ev }] }, { lazyUpdate: true });
        if (sliderChart) {
          sliderChart.setOption({ dataZoom: [{ startValue: sv, endValue: ev }, { startValue: sv, endValue: ev }] }, { lazyUpdate: true });
        }
      }
    } catch (_) {
      // Ignore zoom update errors
    }
  }

  function dispose() {
    try { if (typeof unsubscribeToggle === 'function') unsubscribeToggle(); } catch (_) { }
    try { chart.dispose(); } catch (_) {
      // Chart might already be disposed
    }
  }
  function getInstance() { return chart; }

  return { update, dispose, getInstance };
}
