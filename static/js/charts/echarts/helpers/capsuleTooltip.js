// static/js/charts/echarts/helpers/capsuleTooltip.js
// Responsibility: attach separate DOM tooltip for capsule labels (ECharts custom series)
import { formatTimeRange } from './time.js';

let el;

function ensureEl(textColor) { // create singleton
  if (el && document.body.contains(el)) return el;
  el = document.getElementById('capsule-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'capsule-tooltip';
    el.style.position = 'fixed';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '9999';
    el.style.padding = '9px 12px';
    el.style.borderRadius = '8px';
    el.style.background = 'rgba(255,255,255,0.98)';
    el.style.border = '1px solid #e6e9ef';
    el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.07)';
    el.style.font = '500 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    el.style.whiteSpace = 'normal'; // allow HTML layout
    el.style.lineHeight = '1.35';
    el.style.transition = 'opacity 120ms ease';
    el.style.opacity = '0';
    document.body.appendChild(el);
  }
  el.style.color = textColor || 'var(--ds-color-fg)';
  return el;
}

function fmtBlock({ time, suppliers, customers, destinations, metric, customersBySupplier, destinationsBySupplier }) { // render HTML
  // pick compact top values
  const pickName = (arr) => {
    try {
      if (!Array.isArray(arr)) return '—';
      if (arr.length === 0) return '—';
      if (arr.length === 1) {
        if (typeof arr[0] === 'string') return String(arr[0]);
        const it = arr[0] || {};
        // accept wide set of possible field names
        const cand = [
          'name',
          'customer','customername','customer_name',
          'client','clientname','client_name',
          'account','buyer',
          'destination','destinationname','destination_name',
          'direction','route','route_name',
          'country','country_name',
          'dst','dst_name','prefix','prefix_name',
          'peer','peername','peer_name',
          'provider','providername','provider_name',
          'supplier','suppliername','supplier_name',
          'vendor','vendorname','vendor_name',
          'carrier','carriername','carrier_name'
        ];
        // try direct keys
        for (const k of cand) {
          if (Object.prototype.hasOwnProperty.call(it, k) && it[k] != null) {
            const v = String(it[k]).trim();
            if (v) return v;
          }
        }
        // try case-insensitive match
        try {
          const lowerCand = new Set(cand.map(x => x.toLowerCase()));
          for (const k of Object.keys(it)) {
            const kl = String(k).toLowerCase();
            if (!lowerCand.has(kl)) continue;
            const v = it[k];
            if (v != null) {
              const s = String(v).trim();
              if (s) return s;
            }
          }
        } catch(_) {}
        return '—';
      }
      return 'Multiple';
    } catch(_) { return '—'; }
  };
  // normalize any iterable to array
  const toArr = (v) => {
    try {
      if (Array.isArray(v)) return v;
      if (v && typeof v !== 'string' && typeof v[Symbol.iterator] === 'function') return Array.from(v);
    } catch(_) {}
    return Array.isArray(v) ? v : [];
  };
  // get first value-array from map-like by target key or first entry
  const firstFromMapLike = (mapLike, targetKey) => {
    try {
      if (!mapLike) return null;
      // Map instance
      if (mapLike instanceof Map) {
        if (targetKey != null && mapLike.has(targetKey)) return toArr(mapLike.get(targetKey));
        for (const [, v] of mapLike) return toArr(v);
        return null;
      }
      // Plain object
      if (typeof mapLike === 'object' && !Array.isArray(mapLike)) {
        if (targetKey != null && Object.prototype.hasOwnProperty.call(mapLike, targetKey)) return toArr(mapLike[targetKey]);
        const keys = Object.keys(mapLike);
        if (keys.length) return toArr(mapLike[keys[0]]);
        return null;
      }
      // Array of entries/objects
      if (Array.isArray(mapLike)) {
        for (const it of mapLike) {
          if (!it) continue;
          const list = it.values || it.items || it.list || it.arr || it.value || it.customers || it.destinations;
          if (list != null) return toArr(list);
        }
      }
    } catch(_) {}
    return null;
  };
  // pick top supplier name for targeted lookup
  const topSupplierName = (() => {
    try {
      if (!Array.isArray(suppliers) || !suppliers.length) return null;
      const sup = suppliers.slice().sort((a,b) => (Number(b?.value)||0) - (Number(a?.value)||0));
      const s = sup[0] || {};
      const name = (s.name ?? s.supplier ?? s.provider ?? s.id ?? s.supplierId);
      return name != null ? String(name) : null;
    } catch(_) { return null; }
  })();
  // derive top destination/customer with fallback to per-supplier maps
  let custTop = (() => {
    // 1) targeted by top supplier
    try {
      if (topSupplierName && customersBySupplier) {
        const arr = firstFromMapLike(customersBySupplier, topSupplierName);
        if (arr && arr.length) {
          return pickName([arr[0]]);
        }
      }
    } catch(_) {}
    // 2) original array
    try {
      const arr = toArr(customers);
      if (arr && arr.length) return pickName(arr);
    } catch(_) {}
    try {
      const arr = firstFromMapLike(customersBySupplier, null);
      if (arr && arr.length) return pickName([arr[0]]);
    } catch(_) {}
    return '—';
  })();
  let destTop = (() => {
    // 1) targeted by top supplier
    try {
      if (topSupplierName && destinationsBySupplier) {
        const arr = firstFromMapLike(destinationsBySupplier, topSupplierName);
        const first = arr && arr[0];
        if (typeof first === 'string') {
          const s = first;
          const name = s.includes(':') ? s.split(':')[0].trim() : s.trim();
          return name || '—';
        }
        if (first != null) return pickName([first]);
      }
    } catch(_) {}
    // 2) original array
    try {
      const arr = toArr(destinations);
      if (arr && arr.length) return pickName(arr);
    } catch(_) {}
    try {
      const arr = firstFromMapLike(destinationsBySupplier, null);
      if (arr && arr.length) {
        const first = arr[0];
        if (typeof first === 'string') {
          const s = first;
          const name = s.includes(':') ? s.split(':')[0].trim() : s.trim();
          return name || '—';
        }
        return pickName([first]);
      }
    } catch(_) {}
    return '—';
  })();
  // 3) final fallback: read from supplier items
  try {
    if (custTop === '—' && Array.isArray(suppliers) && suppliers.length) {
      const sup = suppliers.slice().sort((a,b) => (Number(b?.value)||0) - (Number(a?.value)||0));
      const keys = ['customer','client','account','buyer','customerName','customer_name'];
      for (const s of sup) {
        for (const k of keys) {
          if (s && s[k] != null) { const v = String(s[k]).trim(); if (v) { custTop = v; break; } }
        }
        if (custTop !== '—') break;
      }
    }
  } catch(_) {}
  try {
    if (destTop === '—' && Array.isArray(suppliers) && suppliers.length) {
      const sup = suppliers.slice().sort((a,b) => (Number(b?.value)||0) - (Number(a?.value)||0));
      const keys = ['destination','direction','country','route','dst','prefix','destinationName','destination_name'];
      for (const s of sup) {
        for (const k of keys) {
          if (s && s[k] != null) { const v = String(s[k]).trim(); if (v) {
            // strip any trailing value part like "name: 12.3"
            const name = v.includes(':') ? v.split(':')[0].trim() : v;
            destTop = name || destTop; break; }
          }
        }
        if (destTop !== '—') break;
      }
    }
  } catch(_) {}
  const metricTop = metric ? String(metric) : '—';

  const supRows = (() => {
    if (!Array.isArray(suppliers) || !suppliers.length) return '';
    const sup = suppliers.slice().sort((a,b) => (Number(b?.value)||0) - (Number(a?.value)||0));
    const items = [];
    for (const s of sup) {
      const name = (s && (s.name ?? s.supplier ?? s.provider ?? s.id ?? s.supplierId)) ?? '';
      const v = (s && s.value != null) ? s.value : '';
      const n = Number(v);
      const val = Number.isFinite(n) ? n.toFixed(1) : String(v); // 0.1
      items.push(`<li style="display:flex;justify-content:space-between;gap:12px;"><span>${String(name)}</span><span style="font-variant-numeric: tabular-nums;">${val}</span></li>`);
    }
    return `<ul style="list-style:none;padding:0;margin:0;">${items.join('')}</ul>`;
  })();

  const destZone = (() => {
    if (!Array.isArray(destinations) || !destinations.length) return '';
    // dedupe by logical destination name (before ':' if present)
    const seen = new Set();
    const items = [];
    for (const raw of destinations) {
      const s = String(raw);
      const name = s.includes(':') ? s.split(':')[0].trim() : s.trim();
      if (!name) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      items.push(s);
    }
    if (!items.length) return '';
    const multi = items.length > 1;
    const body = multi
      ? items.map(x => `<div>• ${x}</div>`).join('')
      : `<div>${items[0]}</div>`;
    return `<div style="margin-top:6px;"><div style="font-size:11px;color:#6b7280;margin-bottom:2px;">Destination(s)</div>${body}</div>`;
  })();

  const custZone = (() => {
    const src = Array.isArray(customers) ? customers : [];
    if (!src.length) return '';
    // dedupe customers visually
    const seen = new Set();
    const items = [];
    for (const raw of src) {
      const s = String(raw).trim();
      if (!s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      items.push(s);
    }
    if (!items.length) return '';
    const multi = items.length > 1;
    const body = multi
      ? items.map(x => `<div>• ${x}</div>`).join('')
      : `<div>${items[0]}</div>`;
    return `<div style="margin-top:6px;"><div style="font-size:11px;color:#6b7280;margin-bottom:2px;">Customer(s)</div>${body}</div>`;
  })();

  const timeBlock = time ? `<div style="margin-top:6px;"><div style="font-size:11px;color:#6b7280;">Time</div><div style="font-weight:600;">${time}</div></div>` : '';

  return `
    <div style="display:flex;flex-direction:column;gap:6px;min-width:200px;">
      <div style="display:grid;grid-template-columns:1fr;row-gap:4px;">
        <div>
          <div style="font-size:11px;color:#6b7280;">Metric</div>
          <div style="font-weight:600;">${metricTop}</div>
        </div>
        ${timeBlock}
      </div>
      <div style="height:1px;background:#eef2f7;margin:6px 0;"></div>
      ${supRows}
      ${destZone}
      ${custZone}
    </div>
  `;
}

// Try to read the numeric value printed inside the hovered capsule (text shape)
function readHoverValueFromEvent(e) {
  try {
    const zrEvt = e && e.event;
    let t = zrEvt && (zrEvt.topTarget || zrEvt.target);
    const readText = (node) => (node && node.style && typeof node.style.text === 'string' && node.style.text) ? node.style.text : null;
    // climb up and also probe children for a text glyph
    while (t) {
      const txt = readText(t);
      if (txt) {
        const num = Number(String(txt).replace(/[^0-9.+-]/g, ''));
        return Number.isFinite(num) ? num : null;
      }
      if (Array.isArray(t.children)) {
        for (const ch of t.children) {
          const ctxt = readText(ch);
          if (ctxt) {
            const num = Number(String(ctxt).replace(/[^0-9.+-]/g, ''));
            return Number.isFinite(num) ? num : null;
          }
        }
      }
      t = t.parent;
    }
  } catch(_) {}
  return null;
}

function toTimeLabel(ts) {
  try {
    const d = new Date(Number(ts));
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch(_) { return ''; }
}

// Filter customers/destinations arrays to a specific supplier when structure allows (best-effort)
function narrowBySupplier(arr, supplierName) {
  try {
    if (!Array.isArray(arr) || !supplierName) return arr;
    const CAND = ['supplier','provider','vendor','carrier','peer','name','supplierName','providerName'];
    const out = [];
    for (const it of arr) {
      if (it && typeof it === 'object') {
        let match = false;
        for (const k of CAND) {
          if (Object.prototype.hasOwnProperty.call(it, k)) {
            const v = it[k];
            if (v != null && String(v).trim() === String(supplierName)) { match = true; break; }
          }
        }
        if (match) out.push(it);
      }
    }
    return out.length ? out : arr;
  } catch(_) { return arr; }
}

function makeHandlers(chart, { getCapsuleData, textColor, metricByGridIndex }) {
  const move = (e) => {
    // if capsule hover active, constantly suppress default chart tooltip
    try { if (chart.__capsuleHoverActive) chart.dispatchAction({ type: 'hideTip' }); } catch(_) {}
    if (!el || el.style.opacity === '0') return;
    const x = (e && e.event && Number.isFinite(e.event.event?.clientX)) ? e.event.event.clientX : (e?.offsetX || 0);
    const y = (e && e.event && Number.isFinite(e.event.event?.clientY)) ? e.event.event.clientY : (e?.offsetY || 0);
    el.style.left = `${x + 12}px`;
    el.style.top = `${y + 12}px`;
  };
  const over = (e) => {
    try {
      if (!e || e.componentType !== 'series') return;
      // Hover over BAR series: when capsule hover is active, suppress bar tooltip entirely
      if (e.seriesType === 'bar') {
        if (chart.__capsuleHoverActive) {
          try { chart.dispatchAction({ type: 'hideTip' }); } catch(_) {}
          return;
        }
        if (el) el.style.opacity = '0';
        try { chart.dispatchAction({ type: 'downplay' }); } catch(_) {}
        try { chart.dispatchAction({ type: 'highlight', seriesIndex: e.seriesIndex }); } catch(_) {}
        // downplay overlays too to match spec
        try {
          const opt = chart.getOption();
          const series = Array.isArray(opt.series) ? opt.series : [];
          series.forEach((s, idx) => { if (s && s.type === 'custom' && s.name === 'LabelsOverlay') { try { chart.dispatchAction({ type: 'downplay', seriesIndex: idx }); } catch(_) {} } });
        } catch(_) {}
        return;
      }
      // Hover over capsule overlay only
      if (typeof e.seriesName !== 'string' || e.seriesName !== 'LabelsOverlay') return;
      chart.__capsuleHoverActive = true;
      const opt = chart.getOption();
      const series = Array.isArray(opt.series) ? opt.series[e.seriesIndex] : null;
      const gridIdx = Number(series?.gridIndex);
      const metric = metricByGridIndex && metricByGridIndex[gridIdx];
      let ts = Array.isArray(e.value) ? Number(e.value[0]) : Number(e?.data?.[0]);
      if (!Number.isFinite(ts)) {
        try {
          if (Number.isFinite(e.dataIndex)) {
            const d = Array.isArray(series?.data) ? series.data[e.dataIndex] : null;
            const val = Array.isArray(d) ? d[0] : (d && d.value ? d.value[0] : null);
            if (Number.isFinite(Number(val))) ts = Number(val);
          }
        } catch(_) {}
      }
      if (!Number.isFinite(ts)) {
        // last resort: convert from pixel X
        try {
          const px = (e && e.event && Number.isFinite(e.event.offsetX)) ? e.event.offsetX : null;
          if (Number.isFinite(px)) {
            const xAxisIndex = Number.isFinite(series?.xAxisIndex) ? series.xAxisIndex : 0;
            const arr = chart.convertFromPixel({ xAxisIndex }, [px, 0]);
            if (Array.isArray(arr) && Number.isFinite(arr[0])) ts = Number(arr[0]);
          }
        } catch(_) {}
      }
      if (!Number.isFinite(ts)) return;
      // detect step from overlay series data (fallback 1h)
      let stepGuess = 3600e3; // default 1h
      try {
        const data = Array.isArray(series?.data) ? series.data : [];
        let prev = null;
        for (const d of data) {
          const t = Array.isArray(d) ? Number(d[0]) : Number(d?.value?.[0]);
          if (!Number.isFinite(t)) continue;
          if (prev == null) { prev = t; continue; }
          if (t !== prev) { stepGuess = Math.abs(t - prev); break; }
        }
      } catch(_) { /* keep default */ }
      let data = (typeof getCapsuleData === 'function') ? getCapsuleData({ metric, ts }) : null;
      if (!data) {
        // build minimal fallback with time only
        try { data = { time: formatTimeRange(ts, stepGuess), suppliers: [], customers: [], destinations: [] }; } catch(_) { return; }
      }
      // If suppliers are missing, read them from option.__labelsEffective (overlay data used for drawing)
      try {
        if (!(Array.isArray(data.suppliers) && data.suppliers.length)) {
          const opt = chart.getOption && chart.getOption();
          const eff = (metric && opt && opt.__labelsEffective) ? opt.__labelsEffective[metric] : null;
          const cand = eff ? (eff[ts] || eff[String(ts)] || eff[Math.floor(Number(ts)/1000)] || eff[String(Math.floor(Number(ts)/1000))]) : null;
          if (Array.isArray(cand) && cand.length) {
            data.suppliers = cand;
          }
        }
      } catch(_) {}
      // best-effort: narrow to the hovered capsule value
      let hoverVal = readHoverValueFromEvent(e);
      if (!Number.isFinite(hoverVal)) {
        // fallback: derive value from pixel Y position inside the overlay grid
        try {
          const evt = e && e.event;
          const px = (evt && Number.isFinite(evt.offsetX)) ? evt.offsetX : null;
          const py = (evt && Number.isFinite(evt.offsetY)) ? evt.offsetY : null;
          const xAxisIndex = Number.isFinite(series?.xAxisIndex) ? series.xAxisIndex : 0;
          const yAxisIndex = Number.isFinite(series?.yAxisIndex) ? series.yAxisIndex : 0;
          if (Number.isFinite(px) && Number.isFinite(py)) {
            const pt = chart.convertFromPixel({ xAxisIndex, yAxisIndex }, [px, py]);
            if (Array.isArray(pt) && Number.isFinite(pt[1])) {
              hoverVal = Number(pt[1]);
            }
          }
        } catch(_) {}
      }
      if (Number.isFinite(hoverVal) && Array.isArray(data.suppliers)) {
        const tol = 0.11; // tolerate rounding diff with overlay text (toFixed(1))
        let matched = data.suppliers.filter(s => Number.isFinite(Number(s?.value)) && Math.abs(Number(s.value) - hoverVal) <= tol);
        // If nothing matched exactly, pick nearest supplier(s) by minimal difference
        if (!matched.length) {
          let bestDiff = Infinity;
          for (const s of data.suppliers) {
            const v = Number(s?.value);
            if (!Number.isFinite(v)) continue;
            const d = Math.abs(v - hoverVal);
            if (d < bestDiff) bestDiff = d;
          }
          // accept a slightly larger tolerance to catch grouped averages
          const widen = Math.max(tol, 0.6);
          matched = data.suppliers.filter(s => Number.isFinite(Number(s?.value)) && Math.abs(Number(s.value) - hoverVal) <= widen && Math.abs(Number(s.value) - hoverVal) <= (bestDiff + 1e-9));
          if (!matched.length && Number.isFinite(bestDiff) && bestDiff < Infinity) {
            // pick single nearest
            let pick = null; let diff = Infinity;
            for (const s of data.suppliers) {
              const v = Number(s?.value); if (!Number.isFinite(v)) continue;
              const d = Math.abs(v - hoverVal); if (d < diff) { diff = d; pick = s; }
            }
            if (pick) matched = [pick];
          }
        }
        if (matched.length) {
          // Build customers/destinations: union across matched suppliers
          const keyList = [];
          for (const s of matched) {
            const id = (s && (s.supplierId ?? s.id)) != null ? String(s.supplierId ?? s.id) : null;
            const nm = (s && (s.name ?? s.supplier ?? s.provider)) != null ? String(s.name ?? s.supplier ?? s.provider) : null;
            if (id) keyList.push(id);
            if (nm && nm !== id) keyList.push(nm);
          }
          const names = Array.from(new Set(keyList.filter(Boolean)));
          let customers = Array.isArray(data.customers) ? [] : [];
          let destinations = Array.isArray(data.destinations) ? [] : [];
          const pushUniq = (arr, v) => { if (v == null) return; const s = String(v); if (!arr.includes(s)) arr.push(s); };
          for (const n of names) {
            try {
              if (data.customersBySupplier && Array.isArray(data.customersBySupplier[n])) {
                for (const c of data.customersBySupplier[n]) pushUniq(customers, c);
              }
            } catch(_) {}
            try {
              if (data.destinationsBySupplier && Array.isArray(data.destinationsBySupplier[n])) {
                for (const d of data.destinationsBySupplier[n]) pushUniq(destinations, d);
              }
            } catch(_) {}
          }
          // Fallback: best-effort filter original arrays when per-supplier maps are not present
          if (!customers.length) {
            for (const n of names) {
              const arr = narrowBySupplier(data.customers, n) || [];
              for (const c of arr) pushUniq(customers, (typeof c === 'string') ? c : (c && (c.name || c.customer || c.client || c.account)));
            }
          }
          if (!destinations.length) {
            for (const n of names) {
              const arr = narrowBySupplier(data.destinations, n) || [];
              for (const d of arr) pushUniq(destinations, (typeof d === 'string') ? d : (d && (d.name || d.destination || d.country || d.route)));
            }
          }
          data = { ...data, time: formatTimeRange(ts, stepGuess), suppliers: matched, customers, destinations };
        } else {
          data = { ...data, time: formatTimeRange(ts, stepGuess) };
        }
      } else {
        data = { ...data, time: formatTimeRange(ts, stepGuess) };
      }
      // hide default ECharts tooltip (separate capsule tooltip only)
      try { chart.dispatchAction({ type: 'hideTip' }); } catch(_) {}
      ensureEl(textColor);
      el.innerHTML = fmtBlock({ ...data, metric });
      el.style.opacity = '1';
      move(e);
      // blur all; capsule overlay stays visible
      try { chart.dispatchAction({ type: 'downplay' }); } catch(_) {}
      // highlight overlay series, optionally by dataIndex if available
      try { chart.dispatchAction({ type: 'highlight', seriesIndex: e.seriesIndex, dataIndex: e.dataIndex }); } catch(_) {}
    } catch(_) {}
  };
  const out = () => {
    if (el) el.style.opacity = '0';
    try { chart.dispatchAction({ type: 'downplay' }); } catch(_) {}
    chart.__capsuleHoverActive = false;
  };
  return { over, out, move };
}

export function attachCapsuleTooltip(chart, { getCapsuleData, textColor = 'var(--ds-color-fg)', metricByGridIndex = {} } = {}) {
  const handlers = makeHandlers(chart, { getCapsuleData, textColor, metricByGridIndex });
  chart.__capsuleTooltip = handlers;
  chart.on('mouseover', handlers.over);
  chart.on('mouseout', handlers.out);
  chart.on('globalout', handlers.out);
  chart.on('mousemove', handlers.move);
}

export function detachCapsuleTooltip(chart) { // cleanup
  const h = chart && chart.__capsuleTooltip;
  if (!h) return;
  try { chart.off('mouseover', h.over); } catch(_) {}
  try { chart.off('mouseout', h.out); } catch(_) {}
  try { chart.off('globalout', h.out); } catch(_) {}
  try { chart.off('mousemove', h.move); } catch(_) {}
  try { delete chart.__capsuleTooltip; } catch(_) {}
  if (el) el.style.opacity = '0';
}
