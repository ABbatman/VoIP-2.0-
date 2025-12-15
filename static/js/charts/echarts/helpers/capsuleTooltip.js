// static/js/charts/echarts/helpers/capsuleTooltip.js
// Responsibility: DOM tooltip for capsule labels (ECharts custom series)
import { formatTimeRange } from './time.js';
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';
import {
  narrowBySupplier,
  readHoverValueFromEvent
} from './capsuleTooltipData.js';

// singleton tooltip element
let tooltipEl = null;

// ─────────────────────────────────────────────────────────────
// DOM management
// ─────────────────────────────────────────────────────────────

function ensureTooltipElement(textColor) {
  if (tooltipEl && document.body.contains(tooltipEl)) {
    tooltipEl.style.color = textColor || 'var(--ds-color-fg)';
    return tooltipEl;
  }

  tooltipEl = document.getElementById('capsule-tooltip');
  if (!tooltipEl) {
    tooltipEl = createTooltipElement();
    document.body.appendChild(tooltipEl);
  }

  tooltipEl.style.color = textColor || 'var(--ds-color-fg)';
  return tooltipEl;
}

function createTooltipElement() {
  const el = document.createElement('div');
  el.id = 'capsule-tooltip';
  Object.assign(el.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '9999',
    padding: '9px 12px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.98)',
    border: '1px solid #e6e9ef',
    boxShadow: '0 4px 14px rgba(0,0,0,0.07)',
    font: '500 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    whiteSpace: 'normal',
    lineHeight: '1.35',
    transition: 'opacity 120ms ease',
    opacity: '0'
  });
  return el;
}

// ─────────────────────────────────────────────────────────────
// HTML formatters
// ─────────────────────────────────────────────────────────────

function formatSupplierRows(suppliers) {
  if (!Array.isArray(suppliers) || !suppliers.length) return '';

  const sorted = suppliers.slice().sort((a, b) => (Number(b?.value) || 0) - (Number(a?.value) || 0));
  const items = sorted.map(s => {
    const name = s?.name ?? s?.supplier ?? s?.provider ?? s?.id ?? s?.supplierId ?? '';
    const rawVal = s?.value ?? '';
    const numVal = Number(rawVal);
    const displayVal = Number.isFinite(numVal) ? numVal.toFixed(1) : String(rawVal);
    return `<li style="display:flex;justify-content:space-between;gap:12px;"><span>${String(name)}</span><span style="font-variant-numeric: tabular-nums;">${displayVal}</span></li>`;
  });

  return `<ul style="list-style:none;padding:0;margin:0;">${items.join('')}</ul>`;
}

function formatDestinationZone(destinations) {
  if (!Array.isArray(destinations) || !destinations.length) return '';

  const seen = new Set();
  const items = [];
  for (const raw of destinations) {
    const str = String(raw);
    const name = str.includes(':') ? str.split(':')[0].trim() : str.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    items.push(str);
  }

  if (!items.length) return '';

  const body = items.length > 1
    ? items.map(x => `<div>• ${x}</div>`).join('')
    : `<div>${items[0]}</div>`;

  return `<div style="margin-top:6px;"><div style="font-size:11px;color:#6b7280;margin-bottom:2px;">Destination(s)</div>${body}</div>`;
}

function formatCustomerZone(customers) {
  const src = Array.isArray(customers) ? customers : [];
  if (!src.length) return '';

  const seen = new Set();
  const items = [];
  for (const raw of src) {
    const str = String(raw).trim();
    if (!str || seen.has(str)) continue;
    seen.add(str);
    items.push(str);
  }

  if (!items.length) return '';

  const body = items.length > 1
    ? items.map(x => `<div>• ${x}</div>`).join('')
    : `<div>${items[0]}</div>`;

  return `<div style="margin-top:6px;"><div style="font-size:11px;color:#6b7280;margin-bottom:2px;">Customer(s)</div>${body}</div>`;
}

function formatTooltipHtml({ time, suppliers, customers, destinations, metric }) {
  const metricDisplay = metric ? String(metric) : '—';
  const timeBlock = time
    ? `<div style="margin-top:6px;"><div style="font-size:11px;color:#6b7280;">Time</div><div style="font-weight:600;">${time}</div></div>`
    : '';

  return `
    <div style="display:flex;flex-direction:column;gap:6px;min-width:200px;">
      <div style="display:grid;grid-template-columns:1fr;row-gap:4px;">
        <div>
          <div style="font-size:11px;color:#6b7280;">Metric</div>
          <div style="font-weight:600;">${metricDisplay}</div>
        </div>
        ${timeBlock}
      </div>
      <div style="height:1px;background:#eef2f7;margin:6px 0;"></div>
      ${formatSupplierRows(suppliers)}
      ${formatDestinationZone(destinations)}
      ${formatCustomerZone(customers)}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────
// Hover data extraction helpers
// ─────────────────────────────────────────────────────────────

// extract timestamp from event
function extractTimestamp(event, series, chart) {
  let ts = Array.isArray(event.value) ? Number(event.value[0]) : Number(event?.data?.[0]);

  // try from series data
  if (!Number.isFinite(ts) && Number.isFinite(event.dataIndex)) {
    try {
      const d = Array.isArray(series?.data) ? series.data[event.dataIndex] : null;
      const val = Array.isArray(d) ? d[0] : (d?.value?.[0] ?? null);
      if (Number.isFinite(Number(val))) ts = Number(val);
    } catch (e) {
      logError(ErrorCategory.CHART, 'capsuleTooltip:extractTimestamp', e);
    }
  }

  // last resort: from pixel X
  if (!Number.isFinite(ts)) {
    try {
      const px = event?.event?.offsetX;
      if (Number.isFinite(px)) {
        const xAxisIndex = Number.isFinite(series?.xAxisIndex) ? series.xAxisIndex : 0;
        const arr = chart.convertFromPixel({ xAxisIndex }, [px, 0]);
        if (Array.isArray(arr) && Number.isFinite(arr[0])) ts = Number(arr[0]);
      }
    } catch (e) {
      logError(ErrorCategory.CHART, 'capsuleTooltip:extractTimestamp', e);
    }
  }

  return ts;
}

// detect step from series data
function detectStep(series) {
  const DEFAULT_STEP = 3600e3; // 1h
  try {
    const data = Array.isArray(series?.data) ? series.data : [];
    let prev = null;
    for (const d of data) {
      const t = Array.isArray(d) ? Number(d[0]) : Number(d?.value?.[0]);
      if (!Number.isFinite(t)) continue;
      if (prev == null) { prev = t; continue; }
      if (t !== prev) return Math.abs(t - prev);
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltip:detectStep', e);
  }
  return DEFAULT_STEP;
}

// fallback suppliers from chart option
function fallbackSuppliers(chart, metric, ts) {
  try {
    const opt = chart.getOption?.();
    const eff = metric && opt?.__labelsEffective?.[metric];
    if (!eff) return null;

    const cand = eff[ts] || eff[String(ts)] ||
      eff[Math.floor(Number(ts) / 1000)] ||
      eff[String(Math.floor(Number(ts) / 1000))];

    return Array.isArray(cand) && cand.length ? cand : null;
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltip:fallbackSuppliers', e);
    return null;
  }
}

// get hover value from pixel position
function getHoverValueFromPixel(event, series, chart) {
  try {
    const evt = event?.event;
    const px = evt?.offsetX;
    const py = evt?.offsetY;
    const xAxisIndex = Number.isFinite(series?.xAxisIndex) ? series.xAxisIndex : 0;
    const yAxisIndex = Number.isFinite(series?.yAxisIndex) ? series.yAxisIndex : 0;

    if (Number.isFinite(px) && Number.isFinite(py)) {
      const pt = chart.convertFromPixel({ xAxisIndex, yAxisIndex }, [px, py]);
      if (Array.isArray(pt) && Number.isFinite(pt[1])) {
        return Number(pt[1]);
      }
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltip:getHoverValueFromPixel', e);
  }
  return null;
}

// match suppliers by hovered value
function matchSuppliersByValue(suppliers, hoverVal) {
  if (!Number.isFinite(hoverVal) || !Array.isArray(suppliers)) return null;

  const tol = 0.11; // tolerance for toFixed(1) rounding

  // exact match
  let matched = suppliers.filter(s => {
    const v = Number(s?.value);
    return Number.isFinite(v) && Math.abs(v - hoverVal) <= tol;
  });

  if (matched.length) return matched;

  // find minimal difference
  let bestDiff = Infinity;
  for (const s of suppliers) {
    const v = Number(s?.value);
    if (!Number.isFinite(v)) continue;
    const diff = Math.abs(v - hoverVal);
    if (diff < bestDiff) bestDiff = diff;
  }

  // widened tolerance
  const widen = Math.max(tol, 0.6);
  matched = suppliers.filter(s => {
    const v = Number(s?.value);
    if (!Number.isFinite(v)) return false;
    const diff = Math.abs(v - hoverVal);
    return diff <= widen && diff <= (bestDiff + 1e-9);
  });

  if (matched.length) return matched;

  // pick single nearest
  if (Number.isFinite(bestDiff) && bestDiff < Infinity) {
    let pick = null;
    let minDiff = Infinity;
    for (const s of suppliers) {
      const v = Number(s?.value);
      if (!Number.isFinite(v)) continue;
      const diff = Math.abs(v - hoverVal);
      if (diff < minDiff) { minDiff = diff; pick = s; }
    }
    if (pick) return [pick];
  }

  return null;
}

// build customer/destination arrays from matched suppliers
function buildRelatedEntities(matched, data) {
  const keyList = [];
  for (const s of matched) {
    const id = (s?.supplierId ?? s?.id) != null ? String(s.supplierId ?? s.id) : null;
    const nm = (s?.name ?? s?.supplier ?? s?.provider) != null ? String(s.name ?? s.supplier ?? s.provider) : null;
    if (id) keyList.push(id);
    if (nm && nm !== id) keyList.push(nm);
  }

  const names = Array.from(new Set(keyList.filter(Boolean)));
  const customers = [];
  const destinations = [];

  const pushUniq = (arr, v) => {
    if (v == null) return;
    const s = String(v);
    if (!arr.includes(s)) arr.push(s);
  };

  // from per-supplier maps
  for (const n of names) {
    try {
      if (data.customersBySupplier?.[n]) {
        for (const c of data.customersBySupplier[n]) pushUniq(customers, c);
      }
    } catch (e) { logError(ErrorCategory.CHART, 'capsuleTooltip:buildRelatedEntities', e); }

    try {
      if (data.destinationsBySupplier?.[n]) {
        for (const d of data.destinationsBySupplier[n]) pushUniq(destinations, d);
      }
    } catch (e) { logError(ErrorCategory.CHART, 'capsuleTooltip:buildRelatedEntities', e); }
  }

  // fallback: filter original arrays
  if (!customers.length) {
    for (const n of names) {
      const arr = narrowBySupplier(data.customers, n) || [];
      for (const c of arr) {
        pushUniq(customers, typeof c === 'string' ? c : (c?.name || c?.customer || c?.client || c?.account));
      }
    }
  }

  if (!destinations.length) {
    for (const n of names) {
      const arr = narrowBySupplier(data.destinations, n) || [];
      for (const d of arr) {
        pushUniq(destinations, typeof d === 'string' ? d : (d?.name || d?.destination || d?.country || d?.route));
      }
    }
  }

  return { customers, destinations };
}

// ─────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────

function makeHandlers(chart, { getCapsuleData, textColor, metricByGridIndex }) {

  const move = (e) => {
    // suppress default tooltip when capsule hover active
    try {
      if (chart.__capsuleHoverActive) chart.dispatchAction({ type: 'hideTip' });
    } catch (err) {
      logError(ErrorCategory.CHART, 'capsuleTooltip:move', err);
    }

    if (!tooltipEl || tooltipEl.style.opacity === '0') return;

    const x = e?.event?.event?.clientX ?? e?.offsetX ?? 0;
    const y = e?.event?.event?.clientY ?? e?.offsetY ?? 0;
    tooltipEl.style.left = `${x + 12}px`;
    tooltipEl.style.top = `${y + 12}px`;
  };

  const over = (e) => {
    try {
      if (!e || e.componentType !== 'series') return;

      // bar series: suppress when capsule hover active
      if (e.seriesType === 'bar') {
        if (chart.__capsuleHoverActive) {
          try { chart.dispatchAction({ type: 'hideTip' }); } catch (err) { logError(ErrorCategory.CHART, 'capsuleTooltip:over', err); }
          return;
        }
        if (tooltipEl) tooltipEl.style.opacity = '0';
        return;
      }

      // only handle LabelsOverlay series
      if (e.seriesName !== 'LabelsOverlay') return;
      chart.__capsuleHoverActive = true;

      const opt = chart.getOption();
      const series = Array.isArray(opt.series) ? opt.series[e.seriesIndex] : null;
      const gridIdx = Number(series?.gridIndex);
      const metric = metricByGridIndex?.[gridIdx];

      const ts = extractTimestamp(e, series, chart);
      if (!Number.isFinite(ts)) return;

      const stepGuess = detectStep(series);

      // get capsule data
      let data = typeof getCapsuleData === 'function' ? getCapsuleData({ metric, ts }) : null;
      if (!data) {
        data = { time: formatTimeRange(ts, stepGuess), suppliers: [], customers: [], destinations: [] };
      }

      // fallback suppliers from chart option
      if (!data.suppliers?.length) {
        const fallback = fallbackSuppliers(chart, metric, ts);
        if (fallback) data.suppliers = fallback;
      }

      // narrow to hovered capsule value
      let hoverVal = readHoverValueFromEvent(e);
      if (!Number.isFinite(hoverVal)) {
        hoverVal = getHoverValueFromPixel(e, series, chart);
      }

      const matched = matchSuppliersByValue(data.suppliers, hoverVal);
      if (matched) {
        const { customers, destinations } = buildRelatedEntities(matched, data);
        data = { ...data, time: formatTimeRange(ts, stepGuess), suppliers: matched, customers, destinations };
      } else {
        data = { ...data, time: formatTimeRange(ts, stepGuess) };
      }

      // render tooltip
      try { chart.dispatchAction({ type: 'hideTip' }); } catch (err) { logError(ErrorCategory.CHART, 'capsuleTooltip:over', err); }
      ensureTooltipElement(textColor);
      tooltipEl.innerHTML = formatTooltipHtml({ ...data, metric });
      tooltipEl.style.opacity = '1';
      move(e);

      // highlight overlay series
      try { chart.dispatchAction({ type: 'downplay' }); } catch (err) { logError(ErrorCategory.CHART, 'capsuleTooltip:over', err); }
      try { chart.dispatchAction({ type: 'highlight', seriesIndex: e.seriesIndex, dataIndex: e.dataIndex }); } catch (err) { logError(ErrorCategory.CHART, 'capsuleTooltip:over', err); }

    } catch (err) {
      logError(ErrorCategory.CHART, 'capsuleTooltip:over', err);
    }
  };

  const out = () => {
    if (tooltipEl) tooltipEl.style.opacity = '0';
    try { chart.dispatchAction({ type: 'downplay' }); } catch (err) { logError(ErrorCategory.CHART, 'capsuleTooltip:out', err); }
    chart.__capsuleHoverActive = false;
  };

  return { over, out, move };
}

export function attachCapsuleTooltip(chart, { getCapsuleData, textColor = 'var(--ds-color-fg)', metricByGridIndex = {} } = {}) {
  // Skip if chart is disposed
  if (!chart || (typeof chart.isDisposed === 'function' && chart.isDisposed())) {
    return;
  }
  const handlers = makeHandlers(chart, { getCapsuleData, textColor, metricByGridIndex });
  chart.__capsuleTooltip = handlers;
  chart.on('mouseover', handlers.over);
  chart.on('mouseout', handlers.out);
  chart.on('globalout', handlers.out);
  chart.on('mousemove', handlers.move);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function detachCapsuleTooltip(chart) {
  if (!chart) return;

  const handlers = chart.__capsuleTooltip;
  if (!handlers) return;

  // skip if disposed
  if (typeof chart.isDisposed === 'function' && chart.isDisposed()) {
    try { delete chart.__capsuleTooltip; } catch (e) { /* ignore */ }
    if (tooltipEl) tooltipEl.style.opacity = '0';
    return;
  }

  // unbind events
  try { chart.off('mouseover', handlers.over); } catch (e) { logError(ErrorCategory.CHART, 'capsuleTooltip:detach', e); }
  try { chart.off('mouseout', handlers.out); } catch (e) { logError(ErrorCategory.CHART, 'capsuleTooltip:detach', e); }
  try { chart.off('globalout', handlers.out); } catch (e) { logError(ErrorCategory.CHART, 'capsuleTooltip:detach', e); }
  try { chart.off('mousemove', handlers.move); } catch (e) { logError(ErrorCategory.CHART, 'capsuleTooltip:detach', e); }

  try { delete chart.__capsuleTooltip; } catch (e) { logError(ErrorCategory.CHART, 'capsuleTooltip:detach', e); }
  if (tooltipEl) tooltipEl.style.opacity = '0';
}
