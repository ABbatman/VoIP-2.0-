// static/js/charts/echarts/helpers/labelOverlay.js
// overlay labels: customSeries on top of bars (no calc here)
import * as echarts from 'echarts';
import { getStableColor, PROVIDER_COLORS } from './colors.js';

// read CSS variables once
function readCssVar(name, fallback) { // read css var
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (_) { return fallback; }
}

const CSS_BG = () => readCssVar('--ds-color-bg', '#ffffff');
const CSS_FG = () => readCssVar('--ds-color-fg', '#111827');

function formatMetricText(metric, value) { // visual-only
  const v = Number(value);
  if (!Number.isFinite(v)) return '';
  if (metric === 'ASR') return v.toFixed(1); // % visually implied
  if (metric === 'ACD') return v.toFixed(1);
  if (metric === 'Minutes') return Math.round(v).toString();
  if (metric === 'TCalls') return Math.round(v).toString();
  return v.toFixed(1);
}

// compute compact vertical gap so that N items fit into available height (no scaling)
function computeCompactGap(count, itemHeight, baseGap, availablePx) { // gap reducer only
  try {
    const n = Number(count) | 0;
    const h = Math.max(0, Number(itemHeight) || 0);
    const g0 = Math.max(0, Number(baseGap) || 0);
    const avail = Math.max(0, Number(availablePx) || 0);
    if (n <= 1) return g0;
    const need = (n - 1) * (h + g0);
    if (need <= avail) return g0; // nothing to compact
    const g = Math.floor(avail / (n - 1) - h);
    return Math.max(1, Math.min(g0, Number.isFinite(g) ? g : g0));
  } catch (_) {
    return Math.max(1, Number(baseGap) || 4);
  }
}

// throttle helper for renderItem (avoid re-render on every hover)
function makeThrottled(fn, waitMs) { // simple throttle
  let last = 0;
  let lastKey = null;
  let cached = null;
  return function throttled(params, api) {
    const now = Date.now();
    let key = null;
    try { key = Number(api && api.value ? api.value(0) : null); } catch (_) { key = (params && Number.isFinite(params.dataIndex)) ? params.dataIndex : null; }
    if (cached != null && key === lastKey && (now - last) < (waitMs || 80)) return cached;
    cached = fn(params, api);
    last = now;
    lastKey = key;
    return cached;
  };
}

export function buildLabelOverlay({ metric, timestamps, labels, colorMap, gridIndex, xAxisIndex, yAxisIndex, secondary = false, stepMs, align = 'current', providerKey, providerRows }) {
  // custom series: draw labels via renderItem only
  const dataTs = Array.isArray(timestamps)
    ? Array.from(new Set(timestamps.map(t => Number(t)).filter(Number.isFinite))).sort((a, b) => a - b)
    : [];
  const id = `labels_overlay_${metric || ''}_${xAxisIndex}_${yAxisIndex}`;
  const getByTs = (ts) => {
    const sec = Math.floor(Number(ts) / 1000);
    return (labels && (labels[ts] || labels[String(ts)] || labels[sec] || labels[String(sec)])) || [];
  };

  // prepare impl and throttled wrapper
  const renderItemImpl = (_params, api) => {
    // overlay labels: visual-only sorting and formatting
    const ts = api.value(0);
    const raw = getByTs(ts);
    if (!Array.isArray(raw) || raw.length === 0) return null;
    // normalize entries: { supplierId, value }
    const entries = raw
      .map((it) => {
        if (typeof it === 'number') {
          return { supplierId: null, name: null, value: Number(it) };
        }
        const NAME_KEYS = ['name', 'supplier', 'provider', 'peer', 'vendor', 'carrier', 'operator', 'route', 'trunk', 'gateway', 'partner', 'supplier_name', 'provider_name', 'vendor_name', 'carrier_name', 'peer_name'];
        const ID_KEYS = ['supplierId', 'providerId', 'vendorId', 'carrierId', 'peerId', 'id', 'supplier_id', 'provider_id', 'vendor_id', 'carrier_id', 'peer_id'];
        let sid = null;
        let name = null;
        if (it && typeof it === 'object') {
          for (const k of ID_KEYS) { if (sid == null && Object.prototype.hasOwnProperty.call(it, k)) sid = it[k]; }
          for (const k of NAME_KEYS) { if (name == null && Object.prototype.hasOwnProperty.call(it, k)) name = it[k]; }
        }
        // strict normalization: don't synthesize zeros
        let rawVal = (it?.value ?? it?.v ?? it?.ASR ?? it?.ACD);
        // skip missing values
        if (rawVal === undefined || rawVal === null || rawVal === '') {
          return null; // no label when value is missing
        }
        const val = Number(rawVal);
        if (!Number.isFinite(val)) return null;
        return { supplierId: sid ?? null, name: (name != null ? String(name) : null), value: val };
      })
      .filter(Boolean);
    if (!entries.length) return null;
    // sort asc visually (no business calc)
    entries.sort((a, b) => a.value - b.value);
    // group duplicates within tolerance (<= 0.1) into a single aggregated label
    const tol = 0.1;
    const clusters = [];
    for (const e of entries) {
      const last = clusters.length ? clusters[clusters.length - 1] : null;
      if (!last) { clusters.push([e]); continue; }
      const lastVal = last[last.length - 1].value;
      if (Math.abs(e.value - lastVal) <= tol) last.push(e); else clusters.push([e]);
    }
    const grouped = clusters.map(group => {
      // pick max value in cluster (visual-only)
      let maxVal = -Infinity;
      let pick = group[0] || { supplierId: null, name: null, value: null };
      for (const g of group) {
        const v = Number(g.value);
        if (!Number.isFinite(v)) continue;
        if (v > maxVal) { maxVal = v; pick = g; }
      }
      if (!Number.isFinite(maxVal)) {
        maxVal = Number(group[0]?.value) || 0;
      }
      return { supplierId: pick.supplierId ?? null, name: pick.name ?? null, value: maxVal };
    });
    try {
      if (typeof window !== 'undefined' && window.__chartsDebug) {
        console.debug('[overlay] grouped.len', grouped.length, grouped.slice(0, 3));
      }
    } catch (_) { }
    const children = [];
    if (!grouped.length) return null;
    // measure constant capsule height using first label's text (font height is stable)
    const font = '600 11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const sampleTxt = formatMetricText(metric, grouped[0].value);
    const padX = 6; const padY = 3;
    const trSample = (echarts && echarts.format && typeof echarts.format.getTextRect === 'function')
      ? echarts.format.getTextRect(sampleTxt, font)
      : { width: (String(sampleTxt).length * 7), height: 12 };
    const h = Math.round(trSample.height + padY * 2);
    // available area bounds in pixel (grid top/bottom)
    let yBase = 0; let areaTop = 0; let areaBottom = 0;
    try {
      const c0 = api.coord([ts, grouped[0].value]);
      yBase = Array.isArray(c0) ? Number(c0[1]) : 0;
      areaTop = (_params && _params.coordSys && Number.isFinite(_params.coordSys.y)) ? Number(_params.coordSys.y) : 0;
      areaBottom = (_params && _params.coordSys && Number.isFinite(_params.coordSys.height)) ? (areaTop + Number(_params.coordSys.height)) : (areaTop + 1e6);
    } catch (_) { }
    const baseGap = 4; // default visual gap between capsules
    const minGap = 1;  // minimal visual gap when space is tight
    // build ideal (value-tied) positions for current bar
    const yList = grouped.map(g => { try { const c = api.coord([ts, g.value]); return Math.round(Array.isArray(c) ? Number(c[1]) : yBase); } catch (_) { return yBase; } });
    const yTop = Math.min(...yList);
    const yBottom = Math.max(...yList);
    const topBound = areaTop + Math.floor(h / 2);
    const bottomBound = (areaBottom - Math.floor(h / 2));
    const availableSpan = Math.max(0, bottomBound - topBound);
    // check if ideal positions already fit (no compaction)
    let fits = (yTop >= topBound);
    if (fits) {
      for (let i = 1; i < yList.length; i++) {
        if ((yList[i - 1] - yList[i]) < (h + baseGap)) { fits = false; break; }
      }
    }
    // compute final y positions: either ideal, proportionally compressed, or strict stacking
    let yPos = yList.slice();
    if (!fits) {
      const origSpan = Math.max(0, yBottom - yTop);
      if (origSpan > 0 && availableSpan > 0) {
        const scale = availableSpan / origSpan;
        const mapped = yList.map(y => topBound + (y - yTop) * scale);
        // verify minimal gap constraint after mapping
        let ok = (mapped[0] <= bottomBound + 0.5 && mapped[mapped.length - 1] >= topBound - 0.5);
        if (ok) {
          for (let i = 1; i < mapped.length; i++) {
            if ((mapped[i - 1] - mapped[i]) < (h + minGap)) { ok = false; break; }
          }
        }
        if (ok) {
          yPos = mapped;
        } else {
          // fallback: strict stacking from bottom with compact gap
          const vGap = computeCompactGap(grouped.length, h, baseGap, availableSpan);
          yPos = grouped.map((_, i) => bottomBound - i * (h + vGap));
        }
      } else {
        // no span to distribute -> strict stacking
        const vGap = computeCompactGap(grouped.length, h, baseGap, availableSpan);
        yPos = grouped.map((_, i) => bottomBound - i * (h + vGap));
      }
    }
    for (let i = 0; i < grouped.length; i++) {
      const { supplierId, name, value } = grouped[i];
      const c = api.coord([ts, value]);
      // align horizontally to a specific bar within the category band using step-based pixel shift
      let x = Math.round(c[0]);
      try {
        const frac = 0.18; // visual fraction of step to approximate bar center
        const dx = Array.isArray(api.size ? api.size([Number(stepMs) * frac, 0]) : null) ? (api.size([Number(stepMs) * frac, 0])[0] || 0) : 0;
        if (align === 'current') x = Math.round(x - dx);
        else if (align === 'prev') x = Math.round(x + dx);
      } catch (_) { /* keep center */ }
      const txt = formatMetricText(metric, value);
      const tr = (echarts && echarts.format && typeof echarts.format.getTextRect === 'function')
        ? echarts.format.getTextRect(txt, font)
        : { width: (String(txt).length * 7), height: 12 };
      const w = Math.round(tr.width + padX * 2);
      const y = Math.round(yPos[i]); // per-bar compacted/ideal position
      // Resolve color by id, by stringified id, by name, then fallback to stable palette
      let color = undefined;
      try {
        const sidStr = supplierId != null ? String(supplierId) : undefined;
        if (colorMap) {
          if (sidStr && colorMap[sidStr]) color = colorMap[sidStr];
          else if (supplierId != null && colorMap[supplierId]) color = colorMap[supplierId];
          else if (name && colorMap[name]) color = colorMap[name];
        }
        if (!color) {
          // If no supplier info at all, color by index to ensure visible distinction
          if (sidStr == null && (name == null || String(name).trim() === '')) {
            color = PROVIDER_COLORS[i % PROVIDER_COLORS.length] || '#ff7f0e';
          } else {
            color = getStableColor(sidStr || String(name || 'default'));
          }
        }
      } catch (_) {
        color = getStableColor('default');
      }
      if (!color) { color = PROVIDER_COLORS[i % PROVIDER_COLORS.length] || '#ff7f0e'; }
      try { if (typeof window !== 'undefined' && window.__chartsDebug) console.debug('[overlay] color', { supplierId, name, color }); } catch (_) { }

      const rectEl = {
        type: 'rect',
        shape: { x: Math.round(x - Math.floor(w / 2)), y: Math.round(y - Math.floor(h / 2)), width: w, height: h, r: 9 },
        style: {
          fill: CSS_BG(),
          stroke: color,
          lineWidth: 1,
          shadowBlur: 8,
          shadowColor: 'rgba(0,0,0,0.12)',
          shadowOffsetY: 2,
          opacity: secondary ? 0.7 : 1,
          // Fix: attach value to rect so hit-test finds it without climbing to parent
          text: txt,
          textFill: 'rgba(0,0,0,0)', // invisible text for data transport
        },
        cursor: 'pointer',
        enterFrom: { style: { opacity: 0 } },
        transition: ['style', 'shape'],
      };
      const textEl = {
        type: 'text',
        style: {
          text: txt, // visual only
          x,
          y,
          align: 'center',
          verticalAlign: 'middle',
          font,
          fontSize: 11,
          fontWeight: 600,
          fill: color,
          textFill: color,
          color: color,
          opacity: secondary ? 0.9 : 1,
        },
        silent: false,
        cursor: 'pointer',
      };
      children.push(rectEl, textEl);
    }
    if (!children.length) return null;
    return { type: 'group', children };
  };
  const throttledRenderItem = makeThrottled(renderItemImpl, 80);

  return {
    id,
    name: 'LabelsOverlay',
    type: 'custom',
    coordinateSystem: 'cartesian2d',
    clip: true, // keep drawings inside the grid
    gridIndex: Number.isFinite(gridIndex) ? Number(gridIndex) : undefined,
    xAxisIndex: Number(xAxisIndex),
    yAxisIndex: Number(yAxisIndex),
    silent: false,
    tooltip: { show: false },
    renderMode: 'canvas',
    progressive: 200,
    progressiveThreshold: 500,
    emphasis: { disabled: true },
    z: 100,
    zlevel: 100,
    renderItem: throttledRenderItem,
    data: dataTs.map(ts => [ts])
  };
}

// compatibility helper if older import name is used
export const createLabelOverlaySeries = (args) =>
  buildLabelOverlay({ metric: args?.metric, timestamps: args?.timestamps, labels: args?.labelsMap || args?.labels, colorMap: args?.colorMap, gridIndex: args?.gridIndex, xAxisIndex: args?.xAxisIndex, yAxisIndex: args?.yAxisIndex, secondary: args?.secondary, providerKey: args?.providerKey, providerRows: args?.providerRows });
