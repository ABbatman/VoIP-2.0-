// static/js/charts/echarts/helpers/labelOverlay.js
// overlay labels: customSeries on top of bars (no calc here)
import * as echarts from 'echarts';
import { getStableColor, PROVIDER_COLORS } from './colors.js';

// read CSS variables once
function readCssVar(name, fallback) { // read css var
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch(_) { return fallback; }
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

export function buildLabelOverlay({ metric, timestamps, labels, colorMap, gridIndex, xAxisIndex, yAxisIndex, secondary = false, stepMs, align = 'current', providerKey, providerRows }) {
  // custom series: draw labels via renderItem only
  const dataTs = Array.isArray(timestamps)
    ? Array.from(new Set(timestamps.map(t => Number(t)).filter(Number.isFinite))).sort((a,b) => a - b)
    : [];
  const id = `labels_overlay_${metric || ''}_${xAxisIndex}_${yAxisIndex}`;
  const getByTs = (ts) => {
    const sec = Math.floor(Number(ts) / 1000);
    return (labels && (labels[ts] || labels[String(ts)] || labels[sec] || labels[String(sec)])) || [];
  };

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
    z: 100,
    zlevel: 100,
    renderItem: (_params, api) => {
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
          const NAME_KEYS = ['name','supplier','provider','peer','vendor','carrier','operator','route','trunk','gateway','partner','supplier_name','provider_name','vendor_name','carrier_name','peer_name'];
          const ID_KEYS = ['supplierId','providerId','vendorId','carrierId','peerId','id','supplier_id','provider_id','vendor_id','carrier_id','peer_id'];
          let sid = null;
          let name = null;
          if (it && typeof it === 'object') {
            for (const k of ID_KEYS) { if (sid == null && Object.prototype.hasOwnProperty.call(it, k)) sid = it[k]; }
            for (const k of NAME_KEYS) { if (name == null && Object.prototype.hasOwnProperty.call(it, k)) name = it[k]; }
          }
          const val = Number(it && (it.value ?? it.v ?? it.ASR ?? it.ACD));
          return { supplierId: sid ?? null, name: (name != null ? String(name) : null), value: val };
        })
        .filter(e => Number.isFinite(e.value));
      if (!entries.length) return null;
      // sort asc visually (no business calc)
      entries.sort((a,b) => a.value - b.value);
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
        // average value for display; use first for supplier identity/color
        let sum = 0; for (const g of group) sum += Number(g.value) || 0;
        const avg = group.length ? (sum / group.length) : (Number(group[0]?.value) || 0);
        const first = group[0] || { supplierId: null, name: null };
        return { supplierId: first.supplierId, name: first.name, value: avg };
      });
      try {
        if (typeof window !== 'undefined' && window.__chartsDebug) {
          console.debug('[overlay] grouped.len', grouped.length, grouped.slice(0, 3));
        }
      } catch(_) {}
      const children = [];
      if (!grouped.length) return null;
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
        } catch(_) { /* keep center */ }
        const font = '600 11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        const txt = formatMetricText(metric, value);
        const tr = (echarts && echarts.format && typeof echarts.format.getTextRect === 'function')
          ? echarts.format.getTextRect(txt, font)
          : { width: (String(txt).length * 7), height: 12 };
        const padX = 6; const padY = 3; const h = Math.round(tr.height + padY * 2);
        const w = Math.round(tr.width + padX * 2);
        const y = Math.round(c[1] - i * (h + 4)); // visual stacking upwards
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
        } catch(_) {
          color = getStableColor('default');
        }
        if (!color) { color = PROVIDER_COLORS[i % PROVIDER_COLORS.length] || '#ff7f0e'; }
        try { if (typeof window !== 'undefined' && window.__chartsDebug) console.debug('[overlay] color', { supplierId, name, color }); } catch(_) {}

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
          },
          cursor: 'pointer',
          enterFrom: { style: { opacity: 0 } },
          transition: ['style','shape'],
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
    },
    data: dataTs.map(ts => [ts])
  };
}

// compatibility helper if older import name is used
export const createLabelOverlaySeries = (args) =>
  buildLabelOverlay({ metric: args?.metric, timestamps: args?.timestamps, labels: args?.labelsMap || args?.labels, colorMap: args?.colorMap, gridIndex: args?.gridIndex, xAxisIndex: args?.xAxisIndex, yAxisIndex: args?.yAxisIndex, secondary: args?.secondary, providerKey: args?.providerKey, providerRows: args?.providerRows });
