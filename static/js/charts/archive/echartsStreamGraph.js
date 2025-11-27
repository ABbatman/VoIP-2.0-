// Archived: Stream graph is disabled (not wired to registry/UI).
import * as echarts from 'echarts';
import { makeStreamTooltip } from './tooltip.js';

function ensureContainer(container) {
  if (typeof container === 'string') {
    const el = document.querySelector(container);
    if (!el) throw new Error(`[echartsStreamGraph] Container not found: ${container}`);
    return el;
  }
  if (!container) throw new Error('[echartsStreamGraph] Container is required');
  return container;
}

// Build stacked area series per destination with common timestamp grid
function buildStackedAreaData(rows, state, startVal, endVal) {
  const metricMap = { TCalls: 'TCall', ASR: 'ASR', Minutes: 'Min', ACD: 'ACD' };
  const metricKey = metricMap[state.metric] || 'TCall';
  const customerKey = 'main';
  const supplierKey = 'peer';
  const dstKey = 'destination';
  // UI-only: aggregated mode only when neither dropdown nor globals specify concrete values
  const isAll = (v) => (v == null) || String(v) === 'All';
  const filtered = (rows || []).filter(r => {
    if (state.customer && state.customer !== 'All' && String(r[customerKey]) !== String(state.customer)) return false;
    if (state.supplier && state.supplier !== 'All' && String(r[supplierKey]) !== String(state.supplier)) return false;
    if (state.destination && state.destination !== 'All' && String(r[dstKey]) !== String(state.destination)) return false;
    return true;
  });
  // Detect whether globals already narrowed dataset to a specific value
  const uCust = new Set();
  const uSupp = new Set();
  const uDst = new Set();
  for (const r of filtered) {
    uCust.add(String(r[customerKey]));
    uSupp.add(String(r[supplierKey]));
    uDst.add(String(r[dstKey]));
  }
  const noConcreteDropdowns = isAll(state.customer) && isAll(state.supplier) && isAll(state.destination);
  const noConcreteGlobals = (uCust.size > 1) && (uSupp.size > 1) && (uDst.size > 1);
  const aggregateByCustomer = noConcreteDropdowns && noConcreteGlobals;
  // Grouping rule:
  // - Destination selected -> group by Customer (all customers to this direction)
  // - Supplier selected   -> group by Customer (all customers to this supplier)
  // - Customer selected   -> group by Destination (all directions of this customer)
  // - None selected and globals wide -> aggregate by Customer (reduce clutter)
  // - Else default -> Destination
  let nameKey = dstKey;
  if (!isAll(state.destination)) nameKey = customerKey;
  else if (!isAll(state.supplier)) nameKey = customerKey;
  else if (!isAll(state.customer)) nameKey = dstKey;
  else if (aggregateByCustomer) nameKey = customerKey;
  const bySeries = new Map(); // name -> Map<ts, {sum, count}>
  const allTs = new Set();
  const isAvgMetric = (state.metric === 'ASR' || state.metric === 'ACD');
  for (const r of filtered) {
    const name = String(r[nameKey] ?? 'Unknown');
    const t = parseRowTs(r.time || r.slot || r.hour || r.timestamp);
    if (!Number.isFinite(t)) continue;
    allTs.add(t);
    // robust metric value extraction
    let yRaw;
    if (state.metric === 'TCalls') yRaw = (r.TCall ?? r.TCalls ?? r.total_calls);
    else if (state.metric === 'Minutes') yRaw = (r.Min ?? r.Minutes);
    else if (state.metric === 'ASR') yRaw = r.ASR;
    else if (state.metric === 'ACD') yRaw = r.ACD;
    else yRaw = (r.TCall ?? r.TCalls ?? r.total_calls);
    let y = Number(yRaw ?? 0);
    if (!Number.isFinite(y)) continue;
    // ASR: cap at 100
    if (state.metric === 'ASR' && y > 100) y = 100;
    let m = bySeries.get(name);
    if (!m) { m = new Map(); bySeries.set(name, m); }
    const existing = m.get(t) || { sum: 0, count: 0 };
    existing.sum += y;
    existing.count += 1;
    m.set(t, existing);
  }
  const names = Array.from(bySeries.keys());
  const tsList = Array.from(allTs).sort((a,b) => a - b);
  const seriesMap = new Map(); // name -> Array<[ts, value]>
  for (const name of names) {
    const m = bySeries.get(name) || new Map();
    const arr = tsList.map(ts => {
      if (!m.has(ts)) return [ts, null];
      const agg = m.get(ts);
      const val = isAvgMetric ? (agg.count > 0 ? agg.sum / agg.count : 0) : agg.sum;
      return [ts, Number(val || 0)];
    });
    seriesMap.set(name, arr);
  }
  // Insert gap-breaking nulls for periods where there is no data at all
  const diffs = [];
  for (let i = 1; i < tsList.length; i++) {
    const d = tsList[i] - tsList[i-1];
    if (d > 0) diffs.push(d);
  }
  diffs.sort((a,b) => a - b);
  const baseStep = diffs.length ? diffs[0] : 0;
  if (baseStep > 0) {
    const threshold = Math.round(baseStep * 1.5);
    for (const [name, arr] of seriesMap.entries()) {
      const out = [];
      for (let i = 0; i < arr.length; i++) {
        out.push(arr[i]);
        if (i < arr.length - 1) {
          const t0 = arr[i][0];
          const t1 = arr[i+1][0];
          if ((t1 - t0) > threshold) {
            out.push([t0 + baseStep, null]);
          }
        }
      }
      seriesMap.set(name, out);
    }
  }
  return { names, seriesMap, tsList };
}

function parseRowTs(raw) {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    let s = raw.trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00';
    if (!(/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s))) s += 'Z';
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : NaN;
  }
  return NaN;
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(v => v != null && String(v).trim() !== '')));
}

function buildThemeRiverData(rows, state) {
  const metricMap = { TCalls: 'TCall', ASR: 'ASR', Minutes: 'Min', ACD: 'ACD' };
  const metricKey = metricMap[state.metric] || 'TCall';
  // Reverse режим не учитываем для графиков: всегда main как customer, peer как supplier
  const customerKey = 'main';
  const supplierKey = 'peer';
  const dstKey = 'destination';
  const filtered = (rows || []).filter(r => {
    if (state.customer && state.customer !== 'All' && String(r[customerKey]) !== String(state.customer)) return false;
    if (state.supplier && state.supplier !== 'All' && String(r[supplierKey]) !== String(state.supplier)) return false;
    if (state.destination && state.destination !== 'All' && String(r[dstKey]) !== String(state.destination)) return false;
    return true;
  });
  const bySeries = new Map(); // name -> Map<ts, sum>
  const allTs = new Set();
  for (const r of filtered) {
    const name = String(r[dstKey] ?? 'Unknown');
    const t = parseRowTs(r.time || r.slot || r.hour || r.timestamp);
    if (!Number.isFinite(t)) continue;
    allTs.add(t);
    let yRaw;
    if (state.metric === 'TCalls') yRaw = (r.TCall ?? r.TCalls ?? r.total_calls);
    else if (state.metric === 'Minutes') yRaw = (r.Min ?? r.Minutes);
    else if (state.metric === 'ASR') yRaw = r.ASR;
    else if (state.metric === 'ACD') yRaw = r.ACD;
    else yRaw = (r.TCall ?? r.TCalls ?? r.total_calls);
    const y = Number(yRaw ?? 0);
    if (!Number.isFinite(y)) continue;
    let m = bySeries.get(name);
    if (!m) { m = new Map(); bySeries.set(name, m); }
    m.set(t, (m.get(t) || 0) + y);
  }
  const names = Array.from(bySeries.keys());
  const tsList = Array.from(allTs).sort((a,b) => a - b);
  const out = [];
  for (const ts of tsList) {
    for (const name of names) {
      const m = bySeries.get(name);
      const v = (m && m.get(ts)) || 0;
      out.push([ts, v, name]);
    }
  }
  return out;
}

function ensureStreamControls(rows, initial, onChange) {
  const controls = document.getElementById('charts-controls');
  if (!controls) return initial;
  let wrap = controls.querySelector('#stream-controls');
  if (wrap) wrap.remove();
  wrap = document.createElement('div');
  wrap.id = 'stream-controls';
  wrap.style.display = 'inline-flex';
  wrap.style.gap = '8px';
  wrap.style.marginLeft = '12px';

  // Reverse режим не учитываем в графике
  const customerKey = 'main';
  const supplierKey = 'peer';
  const dstKey = 'destination';

  const customers = ['All', ...uniq((rows||[]).map(r => r[customerKey])).sort()];
  const suppliers = ['All', ...uniq((rows||[]).map(r => r[supplierKey])).sort()];
  const destinations = ['All', ...uniq((rows||[]).map(r => r[dstKey])).sort()];

  function makeDd(id, label, items, selected) {
    const dd = document.createElement('div');
    dd.className = 'charts-dd';
    dd.id = id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'charts-dd__button';
    btn.textContent = `${label}: ${selected}`;
    const menu = document.createElement('ul');
    menu.className = 'charts-dd__menu';
    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'charts-dd__item';
      li.dataset.value = String(it);
      li.textContent = String(it);
      if (String(it) === String(selected)) li.classList.add('is-selected');
      li.addEventListener('click', () => {
        const val = String(it);
        btn.textContent = `${label}: ${val}`;
        menu.querySelectorAll('.charts-dd__item').forEach(x => x.classList.toggle('is-selected', x === li));
        onChange(id, val);
        // close dropdown after selection
        try { dd.classList.remove('is-open'); } catch(_) {}
        try { btn.blur && btn.blur(); } catch(_) {}
      });
      menu.appendChild(li);
    }
    dd.appendChild(btn);
    dd.appendChild(menu);
    return dd;
  }

  const metrics = ['ACD','ASR','TCalls','Minutes'];
  const state = { ...initial };
  const ddMetric = makeDd('stream-metric', 'Metric', metrics, state.metric);
  const ddCustomer = makeDd('stream-customer', 'Customer', customers, state.customer || 'All');
  const ddSupplier = makeDd('stream-supplier', 'Supplier', suppliers, state.supplier || 'All');
  const ddDestination = makeDd('stream-destination', 'Destination', destinations, state.destination || 'All');

  wrap.appendChild(ddMetric);
  wrap.appendChild(ddCustomer);
  wrap.appendChild(ddSupplier);
  wrap.appendChild(ddDestination);
  controls.appendChild(wrap);

  return state;
}

export function renderStreamGraphEcharts(container, data = [], options = {}) {
  const el = ensureContainer(container);
  try {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  } catch(_) {}
  const chart = echarts.init(el);

  const rows = Array.isArray(data) ? data : (Array.isArray(data?.rows) ? data.rows : []);
  const base = {
    fromTs: options.fromTs || null,
    toTs: options.toTs || null,
    height: options.height || (el.clientHeight || 600),
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
  } catch(_) {}

  // Restore persisted metric or default to ACD
  let state = {
    metric: (typeof window !== 'undefined' && window.__streamMetric) || 'ACD',
    customer: (typeof window !== 'undefined' && window.__streamCustomer) || 'All',
    supplier: (typeof window !== 'undefined' && window.__streamSupplier) || 'All',
    destination: (typeof window !== 'undefined' && window.__streamDestination) || 'All'
  };

  const onControlChange = (id, val) => {
    if (id === 'stream-metric') {
      state.metric = val;
      try { if (typeof window !== 'undefined') window.__streamMetric = val; } catch(_) {}
    }
    else if (id === 'stream-customer') {
      state.customer = val;
      try { if (typeof window !== 'undefined') window.__streamCustomer = val; } catch(_) {}
    }
    else if (id === 'stream-supplier') {
      state.supplier = val;
      try { if (typeof window !== 'undefined') window.__streamSupplier = val; } catch(_) {}
    }
    else if (id === 'stream-destination') {
      state.destination = val;
      try { if (typeof window !== 'undefined') window.__streamDestination = val; } catch(_) {}
    }
    update();
  };

  state = ensureStreamControls(rows, state, onControlChange);
  
  function refreshDropdownsForZoom() {
    try {
      let from = null, to = null;
      try {
        const model = chart.getModel();
        const xa = model && model.getComponent('xAxis', 0);
        const scale = xa && xa.axis && xa.axis.scale;
        if (scale && typeof scale.getExtent === 'function') {
          const ext = scale.getExtent();
          from = Math.floor(ext[0]);
          to = Math.ceil(ext[1]);
        }
      } catch(_) {}
      if (!(Number.isFinite(from) && Number.isFinite(to) && to > from)) {
        const zr = (typeof window !== 'undefined' && window.__chartsZoomRange) || null;
        if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs) {
          from = zr.fromTs; to = zr.toTs;
        }
      }
      if (!(Number.isFinite(from) && Number.isFinite(to) && to > from)) return false;
      const customerKey = 'main';
      const supplierKey = 'peer';
      const dstKey = 'destination';
      const inWin = (rows || []).filter(r => {
        const t = parseRowTs(r.time || r.slot || r.hour || r.timestamp);
        return Number.isFinite(t) && t >= from && t <= to;
      });
      // Interlink dropdowns within the current zoom window
      const activeCustomer = String(state.customer || 'All');
      const activeSupplier = String(state.supplier || 'All');
      // Restrict customers by selected supplier if any
      const rowsForCustomers = (activeSupplier !== 'All')
        ? inWin.filter(r => String(r[supplierKey]) === activeSupplier)
        : inWin;
      // Restrict suppliers by selected customer if any
      const rowsForSuppliers = (activeCustomer !== 'All')
        ? inWin.filter(r => String(r[customerKey]) === activeCustomer)
        : inWin;
      // Destinations respect both selections if present
      const rowsForDest = inWin.filter(r => (
        (activeCustomer === 'All' || String(r[customerKey]) === activeCustomer) &&
        (activeSupplier === 'All' || String(r[supplierKey]) === activeSupplier)
      ));
      const customers = ['All', ...uniq(rowsForCustomers.map(r => r[customerKey])).sort()];
      const suppliers = ['All', ...uniq(rowsForSuppliers.map(r => r[supplierKey])).sort()];
      const destinations = ['All', ...uniq(rowsForDest.map(r => r[dstKey])).sort()];

      function rebuildDd(id, label, items, currentVal) {
        const dd = document.getElementById(id);
        if (!dd) return false;
        const btn = dd.querySelector('.charts-dd__button');
        const menu = dd.querySelector('.charts-dd__menu');
        if (!btn || !menu) return false;
        let selected = currentVal || 'All';
        if (!items.includes(selected)) selected = 'All';
        // Update button text
        try { btn.textContent = `${label}: ${selected}`; } catch(_) {}
        // Rebuild menu
        try { while (menu.firstChild) menu.removeChild(menu.firstChild); } catch(_) {}
        for (const it of items) {
          const li = document.createElement('li');
          li.className = 'charts-dd__item';
          li.dataset.value = String(it);
          li.textContent = String(it);
          if (String(it) === String(selected)) li.classList.add('is-selected');
          li.addEventListener('click', () => {
            const val = String(it);
            try { btn.textContent = `${label}: ${val}`; } catch(_) {}
            try { menu.querySelectorAll('.charts-dd__item').forEach(x => x.classList.toggle('is-selected', x === li)); } catch(_) {}
            onControlChange(id, val);
            try { dd.classList.remove('is-open'); } catch(_) {}
            try { btn.blur && btn.blur(); } catch(_) {}
          });
          menu.appendChild(li);
        }
        // If selected changed versus state, propagate
        const prev = String(currentVal || 'All');
        if (String(selected) !== prev) {
          onControlChange(id, selected);
          return true;
        }
        return false;
      }

      let changed = false;
      changed = rebuildDd('stream-customer', 'Customer', customers, state.customer) || changed;
      changed = rebuildDd('stream-supplier', 'Supplier', suppliers, state.supplier) || changed;
      changed = rebuildDd('stream-destination', 'Destination', destinations, state.destination) || changed;
      return changed;
    } catch(_) { return false; }
  }

  function buildOption() {
    // xAxis reflects global filter range; zoom is applied via dataZoom only
    const filterFrom = Number.isFinite(base.fromTs) ? base.fromTs : null; // global filters: from
    const filterTo = Number.isFinite(base.toTs) ? base.toTs : null;       // global filters: to
    // Restore view (zoom) window if available, otherwise fall back to filters
    const zr = (typeof window !== 'undefined' && window.__chartsZoomRange) || null;
    let zoomStart = (zr && Number.isFinite(zr.fromTs)) ? zr.fromTs : filterFrom;
    let zoomEnd = (zr && Number.isFinite(zr.toTs)) ? zr.toTs : filterTo;
    // clamp zoom window to filter range to avoid invalid view after filters change
    if (Number.isFinite(filterFrom) && Number.isFinite(filterTo) && filterTo > filterFrom) {
      if (Number.isFinite(zoomStart)) zoomStart = Math.max(filterFrom, Math.min(zoomStart, filterTo));
      if (Number.isFinite(zoomEnd)) zoomEnd = Math.max(filterFrom, Math.min(zoomEnd, filterTo));
      if (!(Number.isFinite(zoomStart) && Number.isFinite(zoomEnd) && zoomEnd > zoomStart)) {
        zoomStart = filterFrom; zoomEnd = filterTo;
      }
    }
    const { names, seriesMap } = buildStackedAreaData(rows, state, filterFrom, filterTo);
    // detect sparse data in current zoom view to avoid visual jumps on small values
    const inViewTs = new Set();
    let maxInViewVal = 0; // track max value in current view to detect low amplitude
    for (const arr of seriesMap.values()) {
      for (const d of (arr || [])) {
        const t = Number(d[0]); const y = d[1];
        if (Number.isFinite(t) && (zoomStart == null || t >= zoomStart) && (zoomEnd == null || t <= zoomEnd) && y != null) {
          inViewTs.add(t);
          if (Number.isFinite(y)) maxInViewVal = Math.max(maxInViewVal, Number(y));
        }
      }
    }
    const isSparse = inViewTs.size <= 6; // small number of points in view
    const isLow = maxInViewVal <= 3;     // very small amplitudes (e.g. 1 call)
    const isDense = inViewTs.size >= 200; // large number of points in view
    // Filter out series without any meaningful data in the visible domain
    // Visible domain = zoom window if set, otherwise global filter range
    const inRange = (ts) => {
      const t = Number(ts);
      const hasZoom = Number.isFinite(zoomStart) && Number.isFinite(zoomEnd) && zoomEnd > zoomStart;
      if (hasZoom) return t >= zoomStart && t <= zoomEnd;
      const lo = Number.isFinite(filterFrom) ? Number(filterFrom) : null;
      const hi = Number.isFinite(filterTo) ? Number(filterTo) : null;
      if (lo != null && t < lo) return false;
      if (hi != null && t > hi) return false;
      return true;
    };
    const hasPositive = (arr, onlyView = true) => {
      if (!Array.isArray(arr)) return false;
      for (const d of arr) {
        const t = Number(d && d[0]); const y = d && d[1];
        if (!Number.isFinite(t)) continue;
        if (onlyView && !inRange(t)) continue;
        if (y != null && Number.isFinite(y) && Number(y) > 0) return true;
      }
      return false;
    };
    const effectiveNames = names.filter(name => {
      const arr = seriesMap.get(name) || [];
      // keep only if has positive values inside the visible domain
      return hasPositive(arr, true);
    });
    // Order layers bottom->top by ascending average in visible domain
    const avgInView = (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return 0;
      let s = 0, c = 0;
      for (const d of arr) {
        const t = Number(d && d[0]); const y = d && d[1];
        if (!Number.isFinite(t)) continue;
        if (!inRange(t)) continue;
        if (y != null && Number.isFinite(y)) { s += Number(y); c += 1; }
      }
      if (c === 0) {
        // fallback to overall average when no in-view points (rare)
        for (const d of (arr || [])) { const y = d && d[1]; if (y != null && Number.isFinite(y)) { s += Number(y); c += 1; } }
      }
      return c > 0 ? (s / c) : 0;
    };
    const orderedNames = effectiveNames.slice().sort((a, b) => avgInView(seriesMap.get(a) || []) - avgInView(seriesMap.get(b) || []));
    const yFmt = (val) => {
      const n = Number(val);
      if (!Number.isFinite(n)) return '';
      return Math.round(n).toLocaleString();
    };
    const yMax = (state.metric === 'ASR') ? 100 : null;
    // Palettes: vibrant for detailed (destination), simplified for aggregated (customer-only)
    const modernColors = [
      ['#6366f1', '#8b5cf6'],
      ['#ec4899', '#f472b6'],
      ['#3b82f6', '#60a5fa'],
      ['#10b981', '#34d399'],
      ['#f59e0b', '#fbbf24'],
      ['#8b5cf6', '#a78bfa'],
      ['#06b6d4', '#22d3ee'],
      ['#f97316', '#fb923c'],
      ['#14b8a6', '#2dd4bf'],
      ['#ef4444', '#f87171']
    ];
    const series = orderedNames.map((name, idx) => {
      const [c0, c1] = modernColors[idx % modernColors.length];
      // choose rendering mode based on data density and amplitude
      const showSymbols = isSparse || isLow;
      // apply smoothing for all metrics (stronger for ASR/ACD)
      const smoothFactor = isSparse ? 0.2 : ((state.metric === 'ASR' || state.metric === 'ACD') ? 0.45 : 0.3);
      const useSampling = !isSparse;
      const samplingMode = isDense ? 'average' : 'lttb';
      return {
        name,
        type: 'line',
        stack: 'total',
        // for sparse/low data: show symbols and disable smoothing to prevent curve overshoot
        showSymbol: showSymbols,
        symbol: showSymbols ? 'circle' : 'none',
        symbolSize: showSymbols ? 4 : 0,
        smooth: smoothFactor,
        smoothMonotone: 'x',
        // prevent symbol bounce on hover for tiny datasets
        hoverAnimation: showSymbols ? false : true,
        connectNulls: false,
        // disable sampling when sparse/low to avoid downsampling artifacts
        sampling: useSampling ? samplingMode : undefined,
        clip: true,
        areaStyle: {
          opacity: 0.6,
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: c0 },
              { offset: 1, color: c1 }
            ]
          }
        },
        lineStyle: { width: isLow ? 2 : 1, color: c0 },
        emphasis: { 
          focus: 'series',
          blurScope: 'coordinateSystem', // de-emphasize other series on hover
          lineStyle: { width: 2, color: c0 },
          areaStyle: { opacity: 0.9 }
        },
        blur: {
          lineStyle: { opacity: 0.3 }, // dim line when another series is hovered
          areaStyle: { opacity: 0.3 }  // dim area when another series is hovered
        },
        data: seriesMap.get(name) || []
      };
    });
    return {
      animation: true,
      animationDurationUpdate: 200,
      animationEasingUpdate: 'cubicOut',
      legend: { show: false },
      grid: { left: 40, right: 16, top: 12, bottom: 56 },
      // keep full filter period on axis; zoom is controlled by dataZoom below
      xAxis: { type: 'time', min: filterFrom, max: filterTo, boundaryGap: false, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
      yAxis: { 
        type: 'value', 
        min: 0, 
        max: yMax, 
        minInterval: 1, // force integer ticks
        splitNumber: 5, // nice divisions
        axisLabel: { color: '#6e7781', formatter: yFmt }, 
        splitLine: { show: true, lineStyle: { color: '#eaeef2' } } 
      },
      tooltip: makeStreamTooltip(state, { chart }),
      // apply current zoom window as a view only (does not change xAxis range)
      dataZoom: [
        // avoid moving zoom window on hover/mouse move
        { type: 'inside', xAxisIndex: 0, startValue: zoomStart, endValue: zoomEnd, throttle: 80, zoomOnMouseWheel: 'shift', moveOnMouseWheel: false, moveOnMouseMove: true, brushSelect: false },
        { type: 'slider', xAxisIndex: 0, startValue: zoomStart, endValue: zoomEnd, height: 32, bottom: 8, throttle: 80 }
      ],
      series
    };
  }

  let __initialized = false;
  function update() {
    const option = buildOption();
    if (!__initialized) {
      chart.setOption(option, { notMerge: true, lazyUpdate: true });
      __initialized = true;
    } else {
      // preserve zoom by not touching xAxis/dataZoom; update only yAxis + series
      chart.setOption({ yAxis: option.yAxis, series: option.series }, { notMerge: false, replaceMerge: ['series'], lazyUpdate: true });
    }
    // Keep dropdowns in sync with current zoom window
    try { refreshDropdownsForZoom(); } catch(_) {}
  }

  update();

  // Keep global zoom range in sync (like other charts)
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
  try {
    chart.on('dataZoom', () => {
      const zr = getZoomRange();
      try { if (zr) window.__chartsZoomRange = zr; } catch(_) {}
      try { refreshDropdownsForZoom(); } catch(_) {}
    });
    // Remember hovered series for tooltip to prefer the actual layer under cursor
    chart.on('mouseover', (p) => {
      try {
        if (p && p.componentType === 'series' && typeof p.seriesName === 'string') window.__streamHoveredSeriesName = p.seriesName;
        if (p && p.componentType === 'series' && Number.isFinite(p.seriesIndex)) window.__streamHoveredSeriesIndex = p.seriesIndex;
      } catch(_) {}
    });
    chart.on('globalout', () => {
      try { window.__streamHoveredSeriesName = null; window.__streamHoveredSeriesIndex = null; } catch(_) {}
    });
    // Track mouse pixel position for precise layer pick in tooltip
    const zr = chart.getZr && chart.getZr();
    if (zr && zr.on) {
      zr.on('mousemove', (e) => {
        try {
          window.__streamMouseX = Number(e && (e.offsetX ?? e.offset_x));
          window.__streamMouseY = Number(e && (e.offsetY ?? e.offset_y));
        } catch(_) {}
      });
      zr.on('globalout', () => {
        try { window.__streamMouseX = null; window.__streamMouseY = null; } catch(_) {}
      });
    }
  } catch(_) {}

  function dispose() { try { chart.dispose(); } catch(_) {} }
  function getInstance() { return chart; }

  return { update, dispose, getInstance };
}
