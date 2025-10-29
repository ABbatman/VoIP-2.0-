import * as echarts from 'echarts';

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
  const filtered = (rows || []).filter(r => {
    if (state.customer && state.customer !== 'All' && String(r[customerKey]) !== String(state.customer)) return false;
    if (state.supplier && state.supplier !== 'All' && String(r[supplierKey]) !== String(state.supplier)) return false;
    if (state.destination && state.destination !== 'All' && String(r[dstKey]) !== String(state.destination)) return false;
    return true;
  });
  const bySeries = new Map(); // name -> Map<ts, sum>
  const allTs = new Set();
  if (Number.isFinite(startVal)) allTs.add(startVal);
  if (Number.isFinite(endVal)) allTs.add(endVal);
  for (const r of filtered) {
    const name = String(r[dstKey] ?? 'Unknown');
    const t = parseRowTs(r.time);
    if (!Number.isFinite(t)) continue;
    allTs.add(t);
    const y = Number(r[metricKey] ?? 0);
    if (!Number.isFinite(y)) continue;
    let m = bySeries.get(name);
    if (!m) { m = new Map(); bySeries.set(name, m); }
    m.set(t, (m.get(t) || 0) + y);
  }
  const names = Array.from(bySeries.keys());
  const tsList = Array.from(allTs).sort((a,b) => a - b);
  const seriesMap = new Map(); // name -> Array<[ts, value]>
  for (const name of names) {
    const m = bySeries.get(name) || new Map();
    const arr = tsList.map(ts => [ts, Number(m.get(ts) || 0)]);
    seriesMap.set(name, arr);
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
    const t = parseRowTs(r.time);
    if (!Number.isFinite(t)) continue;
    allTs.add(t);
    const y = Number(r[metricKey] ?? 0);
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

  let state = {
    metric: 'TCalls',
    customer: 'All',
    supplier: 'All',
    destination: 'All'
  };

  const onControlChange = (id, val) => {
    if (id === 'stream-metric') state.metric = val;
    else if (id === 'stream-customer') state.customer = val;
    else if (id === 'stream-supplier') state.supplier = val;
    else if (id === 'stream-destination') state.destination = val;
    update();
  };

  state = ensureStreamControls(rows, state, onControlChange);

  function buildOption() {
    const startVal = Number.isFinite(base.fromTs) ? base.fromTs : null;
    const endVal = Number.isFinite(base.toTs) ? base.toTs : null;
    const { names, seriesMap } = buildStackedAreaData(rows, state, startVal, endVal);
    const series = names.map((name) => ({
      name,
      type: 'line',
      stack: 'total',
      showSymbol: false,
      areaStyle: {},
      lineStyle: { width: 1 },
      emphasis: { focus: 'self' },
      data: seriesMap.get(name) || []
    }));
    return {
      animation: true,
      animationDurationUpdate: 200,
      animationEasingUpdate: 'cubicOut',
      legend: { show: false },
      grid: { left: 40, right: 16, top: 12, bottom: 56 },
      xAxis: { type: 'time', min: startVal, max: endVal, boundaryGap: false, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
      yAxis: { type: 'value', min: 0, axisLabel: { color: '#6e7781' }, splitLine: { show: true, lineStyle: { color: '#eaeef2' } } },
      tooltip: { show: false },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, startValue: startVal, endValue: endVal, throttle: 80, zoomOnMouseWheel: 'shift', moveOnMouseWheel: false, moveOnMouseMove: true, brushSelect: false },
        { type: 'slider', xAxisIndex: 0, startValue: startVal, endValue: endVal, height: 32, bottom: 8, throttle: 80 }
      ],
      series
    };
  }

  function update() {
    const option = buildOption();
    chart.setOption(option, { notMerge: true, lazyUpdate: true });
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
    });
  } catch(_) {}

  function dispose() { try { chart.dispose(); } catch(_) {} }
  function getInstance() { return chart; }

  return { update, dispose, getInstance };
}
