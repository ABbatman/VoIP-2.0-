// static/js/charts/echartsBarChartHelper.js
import { makeBarOverlayTooltipFormatter } from './tooltipBar.js';
// Build provider-stacked data for ECharts Bar

const CANDIDATE_PROVIDER_KEYS = [
  'provider','Provider','supplier','Supplier','vendor','Vendor','carrier','Carrier','operator','Operator',
  'peer','Peer','trunk','Trunk','gateway','Gateway','route','Route','partner','Partner',
  'provider_name','supplier_name','vendor_name','carrier_name','peer_name',
  'providerId','supplierId','vendorId','carrierId','peerId',
  'provider_id','supplier_id','vendor_id','carrier_id','peer_id'
];

// try common destination column names
const CANDIDATE_DEST_KEYS = [
  'destination','Destination','dst','Dst','country','Country','prefix','Prefix','route','Route','direction','Direction'
];

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

// Lightweight overlay: draw labels as text only using existing axes
// values come from backend without any calculations here
export function createLabelOverlaySeries({ timestamps, labelsMap, gridIndex, xAxisIndex, yAxisIndex }) {
  // move label logic: series builder only
  const dataTs = Array.isArray(timestamps)
    ? Array.from(new Set(timestamps.map(t => Number(t)).filter(Number.isFinite))).sort((a,b) => a - b)
    : [];
  return {
    id: `labels_overlay_${xAxisIndex}_${yAxisIndex}`,
    name: 'LabelsOverlay',
    type: 'custom',
    coordinateSystem: 'cartesian2d',
    gridIndex: Number.isFinite(gridIndex) ? Number(gridIndex) : undefined,
    xAxisIndex: Number(xAxisIndex),
    yAxisIndex: Number(yAxisIndex),
    silent: true,
    tooltip: { show: false },
    z: 100,
    zlevel: 100,
    renderItem: (params, api) => {
      // layout labels: sort asc, stack vertically, no overlap math
      const ts = api.value(0);
      let values = (labelsMap && (labelsMap[ts] || labelsMap[String(ts)] || labelsMap[Math.floor(Number(ts)/1000)] || labelsMap[String(Math.floor(Number(ts)/1000))])) || [];
      if (!Array.isArray(values) || values.length === 0) return null;
      values = values.map(v => Number(v)).filter(Number.isFinite).sort((a,b) => a - b);
      const children = [];
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        const c = api.coord([ts, v]);
        const x = Math.round(c[0]);
        const y = Math.round(c[1] - i * 14); // simple vertical stacking
        children.push({
          type: 'text',
          style: {
            text: v.toFixed(1),
            x,
            y,
            align: 'center',
            verticalAlign: 'middle',
            fontSize: 11,
            fontWeight: 600,
            fill: '#fff',
          },
          silent: true,
        });
      }
      if (!children.length) return null;
      return { type: 'group', children };
    },
    data: dataTs.map(ts => [ts])
  };
}

// Build labels series for ASR and ACD bar panels from backend labels
// opts.labels = { ASR: { tsSec: [vals...] }, ACD: { tsSec: [vals...] } }
export function buildBarLabelsSeries({ opts, setsA, setsC, stepMs, asrAxis = { x: 1, y: 1 }, acdAxis = { x: 3, y: 3 } }) {
  // move label logic to helper
  const list = [];
  try {
    const labelsASR = (opts && opts.labels && opts.labels.ASR) || {};
    const labelsACD = (opts && opts.labels && opts.labels.ACD) || {};
    const totalASRMap = new Map((setsA && setsA.curr) || []);
    const totalACDMap = new Map((setsC && setsC.curr) || []);
    if (labelsASR && Object.keys(labelsASR).length) {
      list.push(makeBackendLabelsSeries('ASR__labels', Number(asrAxis.x ?? 1), Number(asrAxis.y ?? 1), totalASRMap, labelsASR, Number(stepMs)));
    }
    if (labelsACD && Object.keys(labelsACD).length) {
      list.push(makeBackendLabelsSeries('ACD__labels', Number(acdAxis.x ?? 3), Number(acdAxis.y ?? 3), totalACDMap, labelsACD, Number(stepMs)));
    }
  } catch(_) { /* safe no-op */ }
  return list;
}

// Build ECharts custom-series from backend-provided labels (no arithmetic)
// - values already rounded/deduped on backend
// - here we only sort, layout, prevent overlap, and render
export function makeBackendLabelsSeries(id, xAxisIndex, yAxisIndex, totalsMap, labelsMap, stepMs) {
  // prepare data points [ts(ms), value]
  const seriesData = [];
  try {
    const keys = Object.keys(labelsMap || {}).sort((a, b) => Number(a) - Number(b)); // sort by ts asc
    for (const k of keys) {
      const ts = Number(k) * 1000; // seconds -> ms
      const vals = Array.isArray(labelsMap[k]) ? labelsMap[k].slice().sort((a, b) => a - b) : [];
      for (const v of vals) seriesData.push([ts, Number(v)]);
    }
  } catch(_) { /* safe no-op */ }
  const layoutMap = new Map(); // ts -> used ranges
  return {
    id,
    name: id,
    type: 'custom',
    coordinateSystem: 'cartesian2d',
    xAxisIndex,
    yAxisIndex,
    silent: true,
    tooltip: { show: false },
    z: 100,
    zlevel: 100,
    renderItem: (params, api) => {
      // layout labels (no value math)
      const ts = api.value(0);
      const val = api.value(1);
      const total = Number(totalsMap?.get?.(ts) || 0);
      if (!Number.isFinite(ts) || !Number.isFinite(val) || !(total > 0)) return null;
      const half = Math.floor(stepMs / 2);
      const p0 = api.coord([ts - half, 0]);
      const p1 = api.coord([ts + half, 0]);
      const base = api.coord([ts, 0])[1];
      const topY = api.coord([ts, total])[1];
      const fullW = Math.abs(p1[0] - p0[0]);
      const height = Math.abs(base - topY);
      const barW = Math.max(2, Math.round(fullW * 0.32));
      const xStripe = Math.round((p0[0] + p1[0]) / 2 - barW / 2);
      const yPix = api.coord([ts, val])[1];
      const pillH = Math.max(8, Math.min(14, Math.round(height * 0.12)));
      // inside the bar bounds
      const minY = Math.min(base, topY);
      const maxY = Math.max(base, topY);
      let py0 = Math.max(minY, Math.min(maxY - pillH, Math.round(yPix - pillH / 2)));
      // prevent overlap by stacking vertically per ts
      const arr = layoutMap.get(ts) || [];
      const overlaps = (a,b,c,d) => !(d <= a || c >= b);
      let gy = py0; let guard = 0;
      while (arr.some(([s,e]) => overlaps(s,e,gy,gy+pillH)) && guard++ < 50) {
        const next = Math.min(maxY - pillH, gy + pillH + 2);
        if (next === gy) break;
        gy = next;
      }
      arr.push([gy, gy + pillH]);
      layoutMap.set(ts, arr);
      // unified pill style
      const rect = { type: 'rect', shape: { x: xStripe, y: gy, width: barW, height: pillH, r: Math.round(pillH/2) }, style: { fill: '#4f86ff', opacity: 0.9, shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.18)' }, silent: true };
      const text = { type: 'text', style: { text: String(val), x: Math.round(xStripe + barW/2), y: Math.round(gy + pillH/2), fill: '#ffffff', font: '600 10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif', align: 'center', verticalAlign: 'middle' }, silent: true };
      return { type: 'group', children: [rect, text] };
    },
    data: seriesData
  };
}

function detectDestinationKey(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  // prefer well-known destination-like keys
  const lowerPref = CANDIDATE_DEST_KEYS.map(k => k.toLowerCase());
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    for (const k of Object.keys(r)) {
      const kl = String(k).toLowerCase();
      if (!lowerPref.includes(kl)) continue;
      const v = r[k];
      if (v == null) continue;
      const s = (typeof v === 'string') ? v.trim() : (typeof v === 'number' ? String(v) : '');
      if (s) return k;
    }
  }
  return null;
}

function detectProviderKey(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const timeKeys = new Set(['time','Time','timestamp','Timestamp','slot','Slot','hour','Hour','date','Date']);
  const metricKeys = new Set(['TCall','TCalls','total_calls','Min','Minutes','ASR','ACD']);
  const lowerPref = CANDIDATE_PROVIDER_KEYS.map(k => k.toLowerCase());

  // 1) Prefer known provider/supplier synonyms (string or number)
  const candUniqs = new Map();
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    for (const k of Object.keys(r)) {
      const kl = String(k).toLowerCase();
      if (!lowerPref.includes(kl)) continue;
      const v = r[k];
      if (v == null) continue;
      const s = (typeof v === 'string') ? v.trim() : (typeof v === 'number' ? String(v) : '');
      if (!s) continue;
      let set = candUniqs.get(k);
      if (!set) { set = new Set(); candUniqs.set(k, set); }
      set.add(s);
      if (set.size > 200) break;
    }
  }
  const eligibleCand = Array.from(candUniqs.entries()).filter(([, set]) => (set?.size || 0) >= 2).sort((a,b) => b[1].size - a[1].size);
  if (eligibleCand.length) return eligibleCand[0][0];

  // 2) Fallback: scan generic keys but only strings, ignore time/metric columns
  const keyUniqs = new Map();
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    for (const k of Object.keys(r)) {
      if (timeKeys.has(k) || metricKeys.has(k)) continue;
      const v = r[k];
      if (typeof v !== 'string') continue;
      const s = v.trim();
      if (!s) continue;
      let set = keyUniqs.get(k);
      if (!set) { set = new Set(); keyUniqs.set(k, set); }
      set.add(s);
      if (set.size > 200) break;
    }
  }
  const eligible = Array.from(keyUniqs.entries()).filter(([, set]) => set && set.size >= 2);
  if (eligible.length === 0) return null;
  eligible.sort((a,b) => b[1].size - a[1].size);
  return eligible[0][0];
}

function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

function metricExtractors() {
  return {
    TCalls: (r) => (toNum(r.TCall ?? r.TCalls ?? r.total_calls ?? 0) ?? 0),
    Minutes: (r) => (toNum(r.Min ?? r.Minutes ?? 0) ?? 0),
    ASR: (r) => toNum(r.ASR),
    ACD: (r) => toNum(r.ACD),
  };
}

const PROVIDER_COLORS = [
  '#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b',
  '#e377c2','#7f7f7f','#bcbd22','#17becf','#4e79a7',
  '#f28e2b','#59a14f','#e15759','#76b7b2','#edc949',
  '#af7aa1','#ff9da7','#9c755f','#bab0ab','#1f77b4'
];

// stable color per supplier across renders
function getStableColor(name, suggested) {
  try {
    const w = (typeof window !== 'undefined') ? window : {};
    w.__supplierColorMap = w.__supplierColorMap || Object.create(null);
    w.__supplierColorIdx = Number.isFinite(w.__supplierColorIdx) ? w.__supplierColorIdx : 0;
    const key = String(name || '').trim();
    if (!key) return suggested || PROVIDER_COLORS[0];
    if (w.__supplierColorMap[key]) return w.__supplierColorMap[key];
    const pool = PROVIDER_COLORS;
    // prefer suggested color once when assigning first time
    const color = suggested || pool[w.__supplierColorIdx % pool.length];
    w.__supplierColorMap[key] = color;
    w.__supplierColorIdx = (w.__supplierColorIdx + 1) % pool.length;
    return color;
  } catch(_) {
    return suggested || PROVIDER_COLORS[0];
  }
}

export function buildProviderStacks(rows, { fromTs, toTs, stepMs }) {
  try {
    if (!Array.isArray(rows) || rows.length === 0 || !Number.isFinite(stepMs)) return null;
    const providerKey = detectProviderKey(rows);
    if (!providerKey) return null;
    const destinationKey = detectDestinationKey(rows);
    const dayMs = 24 * 3600e3;
    const ex = metricExtractors();

    // build centers
    let centers = [];
    try {
      const start = Math.floor(Number(fromTs) / stepMs) * stepMs;
      const end = Math.ceil(Number(toTs) / stepMs) * stepMs;
      for (let t = start; t <= end; t += stepMs) centers.push(t + Math.floor(stepMs / 2));
    } catch(_) {
      // Fallback to empty centers on error
      centers = [];
    }

    // accumulators: provider -> metric -> { sumMap(center), cntMap(center) }
    const provSet = new Set();
    const acc = new Map();
    for (const r of rows) {
      const p = r?.[providerKey];
      if (p == null) continue;
      const prov = String(p).trim();
      if (!prov) continue;
      const t = parseRowTs(
        r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour ||
        r.datetime || r.DateTime || r.ts || r.TS || r.period || r.Period || r.start || r.Start ||
        r.start_time || r.StartTime
      );
      if (!Number.isFinite(t)) continue;
      const bucket = Math.floor(t / stepMs) * stepMs + Math.floor(stepMs / 2);
      if (bucket < centers[0] - stepMs || bucket > centers[centers.length - 1] + stepMs) continue;
      provSet.add(prov);
      if (!acc.has(prov)) acc.set(prov, { TCalls: new Map(), Minutes: new Map(), ASR: { sum: new Map(), cnt: new Map() }, ACD: { sum: new Map(), cnt: new Map() }, BestDest: new Map() });
      const a = acc.get(prov);
      const tcall = ex.TCalls(r);
      const minutes = ex.Minutes(r);
      const asr = ex.ASR(r);
      const acd = ex.ACD(r);
      // sums
      a.TCalls.set(bucket, (a.TCalls.get(bucket) || 0) + tcall);
      a.Minutes.set(bucket, (a.Minutes.get(bucket) || 0) + minutes);
      // track best destination per bucket by contribution weight
      try {
        if (destinationKey) {
          const destVal = r?.[destinationKey];
          const dest = (destVal == null) ? '' : String(destVal).trim();
          if (dest) {
            const w = (Number(tcall) || 0) + (Number(minutes) || 0);
            const cur = a.BestDest.get(bucket);
            if (!cur || w > (cur.w || 0)) a.BestDest.set(bucket, { dest, w });
          }
        }
      } catch(_) {}
      if (asr != null) {
        a.ASR.sum.set(bucket, (a.ASR.sum.get(bucket) || 0) + asr);
        a.ASR.cnt.set(bucket, (a.ASR.cnt.get(bucket) || 0) + 1);
      }
      if (acd != null) {
        a.ACD.sum.set(bucket, (a.ACD.sum.get(bucket) || 0) + acd);
        a.ACD.cnt.set(bucket, (a.ACD.cnt.get(bucket) || 0) + 1);
      }
    }
    const providers = Array.from(provSet.values());
    // Fallback: if centers are empty, derive them from observed buckets in accumulators
    if (centers.length === 0) {
      const set = new Set();
      for (const prov of providers) {
        const a = acc.get(prov) || {};
        try { for (const k of (a.TCalls?.keys?.() || [])) set.add(Number(k)); } catch(_) {
          // Ignore iterator errors
        }
        try { for (const k of (a.Minutes?.keys?.() || [])) set.add(Number(k)); } catch(_) {
          // Ignore iterator errors
        }
        try { for (const k of (a.ASR?.sum?.keys?.() || [])) set.add(Number(k)); } catch(_) {
          // Ignore iterator errors
        }
        try { for (const k of (a.ACD?.sum?.keys?.() || [])) set.add(Number(k)); } catch(_) {
          // Ignore iterator errors  
        }
      }
      centers = Array.from(set.values()).filter(Number.isFinite).sort((a,b) => a - b);
    }
    if (providers.length < 1) return null;

    const colors = Object.create(null);
    providers.forEach((p, i) => { colors[p] = PROVIDER_COLORS[i % PROVIDER_COLORS.length]; });

    // build pair sets per provider and metric
    const stacks = { TCalls: { curr: {}, prev: {} }, Minutes: { curr: {}, prev: {} }, ASR: { curr: {}, prev: {} }, ACD: { curr: {}, prev: {} } };
    const totals = { TCalls: [], Minutes: [], ASR: [], ACD: [] };
    const markers = { TCalls: [], Minutes: [], ASR: [], ACD: [] };

    // Build totals and per-provider series ensuring ASR/ACD segments sum to overall metric
    for (const c of centers) {
      let sumT = 0, sumM = 0;
      let asrSumTot = 0, asrCntTot = 0;
      let acdSumTot = 0, acdCntTot = 0;
      for (const prov of providers) {
        const a = acc.get(prov) || {};
        const tcall = Number(a.TCalls?.get?.(c) || 0);
        const minutes = Number(a.Minutes?.get?.(c) || 0);
        const asrSum = Number(a.ASR?.sum?.get?.(c) || 0);
        const asrCnt = Number(a.ASR?.cnt?.get?.(c) || 0);
        const acdSum = Number(a.ACD?.sum?.get?.(c) || 0);
        const acdCnt = Number(a.ACD?.cnt?.get?.(c) || 0);
        sumT += tcall; sumM += minutes;
        asrSumTot += asrSum; asrCntTot += asrCnt;
        acdSumTot += acdSum; acdCntTot += acdCnt;
      }
      const asrTotal = asrCntTot ? (asrSumTot / asrCntTot) : 0;
      const acdTotal = acdCntTot ? (acdSumTot / acdCntTot) : 0;
      totals.TCalls.push([c, sumT]);
      totals.Minutes.push([c, sumM]);
      totals.ASR.push([c, asrTotal]);
      totals.ACD.push([c, acdTotal]);
      const markerBuckets = { TCalls: [], Minutes: [], ASR: [], ACD: [] };
      for (const prov of providers) {
        const a = acc.get(prov) || {};
        const tcall = Number(a.TCalls?.get?.(c) || 0);
        const minutes = Number(a.Minutes?.get?.(c) || 0);
        const bestDest = (() => { try { return a.BestDest?.get?.(c)?.dest || null; } catch(_) { return null; } })();
        // direct stacking for TCalls/Minutes
        const listT = (stacks.TCalls.curr[prov] = stacks.TCalls.curr[prov] || []);
        const listM = (stacks.Minutes.curr[prov] = stacks.Minutes.curr[prov] || []);
        if (tcall) {
          listT.push([c, tcall]);
          markerBuckets.TCalls.push({ provider: prov, value: tcall, dest: bestDest });
        }
        if (minutes) {
          listM.push([c, minutes]);
          markerBuckets.Minutes.push({ provider: prov, value: minutes, dest: bestDest });
        }
        // proportional segments for ASR (by calls share) and ACD (by minutes share)
        const asrSeg = (sumT > 0) ? (tcall / sumT) * asrTotal : 0;
        const acdSeg = (sumM > 0) ? (minutes / sumM) * acdTotal : 0;
        const listA = (stacks.ASR.curr[prov] = stacks.ASR.curr[prov] || []);
        const listC = (stacks.ACD.curr[prov] = stacks.ACD.curr[prov] || []);
        if (asrSeg) {
          listA.push([c, asrSeg]);
          markerBuckets.ASR.push({ provider: prov, value: asrSeg, dest: bestDest });
        }
        if (acdSeg) {
          listC.push([c, acdSeg]);
          markerBuckets.ACD.push({ provider: prov, value: acdSeg, dest: bestDest });
        }
        // prev day segments (no normalization; used only if present in rows at c - 24h)
        const prevC = c - dayMs;
        const tcallP = Number(a.TCalls?.get?.(prevC) || 0);
        const minutesP = Number(a.Minutes?.get?.(prevC) || 0);
        if (tcallP) {
          const listTP = (stacks.TCalls.prev[prov] = stacks.TCalls.prev[prov] || []);
          listTP.push([c, tcallP]);
        }
        if (minutesP) {
          const listMP = (stacks.Minutes.prev[prov] = stacks.Minutes.prev[prov] || []);
          listMP.push([c, minutesP]);
        }
        // For ASR/ACD prev day, skip provider breakdown (keep total grey bar only in renderer)
      }
      const totalsByMetric = { TCalls: sumT, Minutes: sumM, ASR: asrTotal, ACD: acdTotal };
      for (const metric of Object.keys(markerBuckets)) {
        const bucket = markerBuckets[metric]
          .filter(seg => seg && Number(seg.value) > 0)
          .map(seg => ({
            provider: seg.provider,
            value: Number(seg.value),
            color: colors[seg.provider] || PROVIDER_COLORS[0]
          }))
          .sort((a, b) => a.value - b.value);
        const totalVal = Number(totalsByMetric[metric]);
        if (!bucket.length || !(totalVal > 0)) continue;
        markers[metric].push({
          ts: c,
          total: totalVal,
          segments: bucket
        });
      }
    }

    return { providerKey, providers, colors, stacks, totals, centers, markers };
  } catch(_) {
    // Return null if provider stack building fails
    return null;
  }
}

// Build decorative supplier stripe overlay (silent custom series)
export function makeStripeOverlay(id, xAxisIndex, yAxisIndex, totalsPairs, stacksPerProv, stepMs, providerMeta, metricName, active, rawRows) {
  const normalizeSegments = (segments) => (Array.isArray(segments) ? segments : [])
    .map(seg => {
      const prov = String(seg?.provider ?? seg?.prov ?? seg?.name ?? '').trim();
      const value = Number(seg?.value ?? seg?.v ?? 0);
      if (!prov || !(value > 0)) return null;
      const color = seg?.color || providerMeta?.colors?.[prov] || '#ff7f0e';
      const dest = seg?.dest || null;
      return { prov, v: value, color, dest };
    })
    .filter(Boolean)
    .sort((a, b) => a.v - b.v);

  const buildMarkerData = () => {
    const markerList = Array.isArray(providerMeta?.markers?.[metricName]) ? providerMeta.markers[metricName] : [];
    return markerList
      .map(item => {
        const ts = Number(item?.ts ?? item?.time ?? (Array.isArray(item?.value) ? item.value[0] : null));
        const total = Number(item?.total ?? (Array.isArray(item?.value) ? item.value[1] : null));
        const segments = normalizeSegments(item?.segments);
        if (!(Number.isFinite(ts) && Number.isFinite(total) && total > 0) || !segments.length) return null;
        return { value: [ts, total], segments };
      })
      .filter(Boolean);
  };

  const buildFallbackData = () => {
    const result = [];
    const totalsArr = Array.isArray(totalsPairs) ? totalsPairs : [];
    const providerNames = Object.keys(stacksPerProv || {});
    if (!providerNames.length) return result;
    const cache = new Map();
    for (const [ts, total] of totalsArr) {
      const t = Number(ts);
      const tot = Number(total);
      if (!(Number.isFinite(t) && Number.isFinite(tot) && tot > 0)) continue;
      const segs = [];
      for (const name of providerNames) {
        let map = cache.get(name);
        if (!map) {
          const src = Array.isArray(stacksPerProv?.[name]) ? stacksPerProv[name] : [];
          map = new Map(src.map(([tt, vv]) => [Number(tt), Number(vv)]));
          cache.set(name, map);
        }
        const val = Number(map.get(t) || 0);
        if (val > 0) {
          segs.push({ prov: name, v: val, color: providerMeta?.colors?.[name] || '#ff7f0e' });
        }
      }
      if (segs.length) {
        result.push({ value: [t, tot], segments: segs.sort((a, b) => a.v - b.v) });
      }
    }
    return result;
  };

  let items = buildMarkerData();
  if (!items.length) items = buildFallbackData();

  // Build stacked positions per supplier per timestamp
  const bySupplier = new Map(); // prov -> [{value:[ts,total,y0,y1]}]
  for (const item of items) {
    const ts = Number(item?.value?.[0]);
    const total = Number(item?.value?.[1]);
    const segs = Array.isArray(item?.segments) ? item.segments : [];
    if (!(Number.isFinite(ts) && Number.isFinite(total) && total > 0) || !segs.length) continue;
    let cum = 0;
    for (const s of segs) {
      const v = Number(s?.v || s?.value || 0);
      const prov = String(s?.prov || s?.provider || '').trim();
      if (!(prov && v > 0)) continue;
      const y0 = cum; const y1 = cum + v; cum = y1;
      let arr = bySupplier.get(prov);
      if (!arr) { arr = []; bySupplier.set(prov, arr); }
      arr.push({ value: [ts, total, y0, y1] });
    }
  }

  // Precompute keys and rows for tooltip
  const allRows = Array.isArray(rawRows) ? rawRows : [];
  const provKey = String(providerMeta?.providerKey || '').trim();
  // remove legacy marker logic (unused)

  // merge cache for labels per timestamp
  const __mergeCache = new Map();
  const __mergeDrawn = new Map();
  // stack layout caches (separate for today/yesterday)
  const __layoutToday = new Map();
  const __layoutYest = new Map();
  function __allocY(layoutMap, key, proposedGy, h, minY, maxY) {
    // stack labels vertically if crowded
    const arr = layoutMap.get(key) || [];
    let gy = Math.max(minY, Math.min(maxY - h, proposedGy));
    const pad = 2;
    const overlaps = (a,b,c,d) => !(d <= a || c >= b);
    // push up until no overlap; if overflow, push down
    let triedDown = false;
    let guard = 0;
    while (arr.some(([s,e]) => overlaps(s, e, gy, gy + h)) && guard++ < 50) {
      const nextUp = Math.min(maxY - h, gy + h + pad);
      if (nextUp === gy) {
        if (triedDown) break;
        triedDown = true;
        gy = Math.max(minY, proposedGy - (h + pad));
      } else {
        gy = nextUp;
      }
    }
    arr.push([gy, gy + h]);
    layoutMap.set(key, arr);
    return gy;
  }
  function __computeMergeGroups(ts) {
    const k = `${metricName}|${ts}`;
    if (__mergeCache.has(k)) return __mergeCache.get(k);
    const sums = new Map();
    const cnts = new Map();
    for (const r of allRows) {
      if (!r || typeof r !== 'object') continue;
      const name = String(r[provKey] || '').trim();
      if (!name) continue;
      const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour || r.datetime || r.DateTime || r.ts || r.TS || r.period || r.Period || r.start || r.Start || r.start_time || r.StartTime);
      if (!Number.isFinite(rt)) continue;
      const bucket = Math.floor(rt / stepMs) * stepMs + Math.floor(stepMs / 2);
      if (bucket !== ts) continue;
      let v = null;
      if (metricName === 'ASR') { const t = Number(r.ASR); if (Number.isFinite(t)) v = t; }
      else if (metricName === 'ACD') { const t = Number(r.ACD); if (Number.isFinite(t)) v = t; }
      if (v == null) continue;
      sums.set(name, (sums.get(name) || 0) + v);
      cnts.set(name, (cnts.get(name) || 0) + 1);
    }
    const entries = [];
    for (const [name, s] of sums.entries()) {
      const c = Number(cnts.get(name) || 0);
      if (!c) continue;
      entries.push([name, s / c]);
    }
    entries.sort((a,b) => a[1] - b[1]);
    const groups = [];
    let cur = [];
    for (const [name, val] of entries) {
      if (!cur.length) { cur.push([name, val]); continue; }
      const lastVal = cur[cur.length - 1][1];
      // merge labels if abs(value1 - value2) <= 0.1
      if (Math.abs(val - lastVal) <= 0.1) { cur.push([name, val]); }
      else { if (cur.length > 1) groups.push(cur.slice()); cur = [[name, val]]; }
    }
    if (cur.length > 1) groups.push(cur);
    const result = groups.map(g => ({
      provs: g.map(it => it[0]).sort(),
      avg: g.reduce((acc,it)=>acc+it[1],0)/g.length
    }));
    __mergeCache.set(k, result);
    return result;
  }

  const makeFormatter = (supplierName) => makeBarOverlayTooltipFormatter({
    metricName,
    stepMs,
    providerKey: providerMeta?.providerKey,
    rows: allRows,
    supplierName
  });

  // Build one series per supplier
  const series = [];
  for (const [prov, arr] of bySupplier.entries()) {
    const suggested = providerMeta?.colors?.[prov] || '#ff7f0e';
    const color = getStableColor(prov, suggested);
    const supplierName = prov; // capture for closures
    // keep only modern label rendering
    series.push({
      id: `${id}__${prov}`,
      name: metricName,
      type: 'custom',
      coordinateSystem: 'cartesian2d',
      xAxisIndex,
      yAxisIndex,
      silent: false,
      tooltip: { show: true, trigger: 'item', confine: true, formatter: makeFormatter(prov) },
      emphasis: { focus: 'self' },
      blur: { itemStyle: { opacity: 1 } },
      z: 100,
      zlevel: 100,
      renderItem: (params, api) => {
        if (!active) return null;
        // show labels only for ACD and ASR (today + yesterday)
        if (!(metricName === 'ASR' || metricName === 'ACD')) return null;
        const x = api.value(0);
        const total = api.value(1);
        const y0 = api.value(2);
        const y1 = api.value(3);
        if (!(Number.isFinite(x) && Number.isFinite(total) && total > 0)) return null;
        if (!(Number.isFinite(y0) && Number.isFinite(y1) && y1 > y0)) return null;
        const half = Math.floor(stepMs / 2);
        const p0 = api.coord([x - half, 0]);
        const p1 = api.coord([x + half, 0]);
        const fullW = Math.abs(p1[0] - p0[0]);
        const base = api.coord([x, 0])[1];
        const topY = api.coord([x, total])[1];
        const height = Math.abs(base - topY);
        let stripeH = Math.round(Math.min(10, height * 0.12));
        if (!Number.isFinite(stripeH) || stripeH < 2) stripeH = 2;
        if (Number.isFinite(height) && height > 0) {
          const maxStripe = Math.max(1, Math.round(height));
          stripeH = Math.min(stripeH, maxStripe);
        }
        const barW = Math.max(2, Math.round(fullW * 0.32));
        const gapPx = Math.round(barW * 0.04);
        const binCenter = Math.round((p0[0] + p1[0]) / 2);
        const xStripe = binCenter - Math.round((barW + gapPx) / 2) - Math.round(barW / 2);
        // default: inside bar by ascending order segment center
        const yy0 = api.coord([x, y0])[1];
        const yy1 = api.coord([x, y1])[1];
        let yCenter = Math.round((yy0 + yy1) / 2);

        // if supplier metric > bar average -> keep label inside (top-center)
        let supValNow = null;
        try {
          const rows = Array.isArray(allRows) ? allRows : [];
          const pKey = String(provKey || '').trim();
          if (rows.length && pKey) {
            let sum = 0, cnt = 0;
            for (const r of rows) {
              if (!r || typeof r !== 'object') continue;
              if (String(r[pKey] || '').trim() !== supplierName) continue;
              const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour || r.datetime || r.DateTime || r.ts || r.TS || r.period || r.Period || r.start || r.Start || r.start_time || r.StartTime);
              if (!Number.isFinite(rt)) continue;
              const bucket = Math.floor(rt / stepMs) * stepMs + Math.floor(stepMs / 2);
              if (bucket !== x) continue;
              if (metricName === 'Minutes') { sum += (Number(r.Min ?? r.Minutes ?? 0) || 0); }
              else if (metricName === 'TCalls') { sum += (Number(r.TCall ?? r.TCalls ?? r.total_calls ?? 0) || 0); }
              else if (metricName === 'ASR') { const v = Number(r.ASR); if (Number.isFinite(v)) { sum += v; cnt += 1; } }
              else if (metricName === 'ACD') { const v = Number(r.ACD); if (Number.isFinite(v)) { sum += v; cnt += 1; } }
            }
            supValNow = (metricName === 'ASR' || metricName === 'ACD') ? (cnt ? (sum / cnt) : 0) : sum;
            if (Number.isFinite(supValNow) && supValNow > Number(total)) {
              // label stays within its own bar bounds
              yCenter = Math.round(topY + Math.max(1, stripeH / 2) + 2);
            }
          }
        } catch(_) {}

        // Build children: current stripe + optional yesterday marker (dimmed)
        const children = [];
        // remove legacy marker logic (unused)

        // show labels only for ACD and ASR (today + yesterday)
        if (metricName === 'ASR' || metricName === 'ACD') {
          // apply modern marker style for all markers
          try {
            const segVal = Math.max(0, Number(y1) - Number(y0));
            const labelVal = Number.isFinite(supValNow) ? supValNow : segVal;
            if (Number.isFinite(labelVal) && labelVal > 0) {
              // merge labels if abs(value1 - value2) <= 0.1
              let skipIndividual = false;
              try {
                const groups = __computeMergeGroups(x) || [];
                const grp = groups.find(g => Array.isArray(g.provs) && g.provs.includes(supplierName));
                if (grp && grp.provs.length > 1) {
                  const gKey = `${x}|${grp.provs.join('|')}`;
                  const already = !!__mergeDrawn.get(gKey);
                  if (!already) {
                    const pillW = barW;
                    const pillH = Math.max(stripeH + 2, Math.min(14, Math.round(stripeH * 1.25)));
                    // keep label inside its own bar bounds (today on blue bar)
                    const px = Math.round(xStripe);
                    const yPixM = api.coord([x, grp.avg])[1];
                    // label stays within its own bar bounds
                    const minY = Math.min(base, topY);
                    const maxY = Math.max(base, topY);
                    let py0 = Math.round(yPixM - pillH / 2);
                    py0 = Math.max(minY, Math.min(maxY - pillH, py0));
                    // sort labels by value asc (small at bottom, bigger above)
                    const py = __allocY(__layoutToday, x, py0, pillH, minY, maxY);
                    // apply modern marker style for all markers (today uses main color)
                    const bgN = { fill: color, opacity: 0.9, shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.18)' };
                    children.push({ type: 'rect', shape: { x: px, y: py, width: pillW, height: pillH, r: Math.round(pillH / 2) }, style: bgN, silent: true });
                    // label value = real data value (rounded to 1 decimal)
                    const lblM = grp.avg.toFixed(1);
                    children.push({ type: 'text', style: { text: lblM, x: Math.round(px + pillW / 2), y: Math.round(py + pillH / 2), fill: '#ffffff', font: '600 10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif', align: 'center', verticalAlign: 'middle', shadowBlur: 0 }, silent: true });
                    __mergeDrawn.set(gKey, true);
                  }
                  // skip individual label if supplier included in merged label
                  skipIndividual = true;
                }
              } catch(_) {}

              if (!skipIndividual) {
                const pillW = barW;
                const pillH = Math.max(stripeH + 2, Math.min(14, Math.round(stripeH * 1.25)));
                // keep label inside its own bar bounds (today on blue bar)
                const px = Math.round(xStripe);
                // use real value position for ordering
                const yPixL = api.coord([x, labelVal])[1];
                // label stays within its own bar bounds
                const minY = Math.min(base, topY);
                const maxY = Math.max(base, topY);
                let py0 = Math.round(yPixL - pillH / 2);
                py0 = Math.max(minY, Math.min(maxY - pillH, py0));
                // sort labels by value asc (small at bottom, bigger above)
                const py = __allocY(__layoutToday, x, py0, pillH, minY, maxY);
                const bg = { fill: color, opacity: 0.9, shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.18)' };
                children.push({ type: 'rect', shape: { x: px, y: py, width: pillW, height: pillH, r: Math.round(pillH / 2) }, style: bg, silent: true });
                // label value = real data value (rounded to 1 decimal)
                const lbl = labelVal.toFixed(1);
                children.push({ type: 'text', style: { text: lbl, x: Math.round(px + pillW / 2), y: Math.round(py + pillH / 2), fill: '#ffffff', font: '600 10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif', align: 'center', verticalAlign: 'middle', shadowBlur: 0 }, silent: true });
              }
            }
          } catch(_) {}
        }

        // Yesterday marker (same supplier at ts-24h)
        // show labels only for ACD and ASR (today + yesterday)
        if (metricName === 'ASR' || metricName === 'ACD') try {
          const dayMs = 24 * 3600e3;
          const tsY = x - dayMs;
          let sumY = 0, cntY = 0, hasY = false;
          for (const r of (Array.isArray(allRows) ? allRows : [])) {
            if (!r || typeof r !== 'object') continue;
            if (provKey && String(r[provKey] || '').trim() !== supplierName) continue;
            const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour || r.datetime || r.DateTime || r.ts || r.TS || r.period || r.Period || r.start || r.Start || r.start_time || r.StartTime);
            if (!Number.isFinite(rt)) continue;
            const bucket = Math.floor(rt / stepMs) * stepMs + Math.floor(stepMs / 2);
            if (bucket !== tsY) continue;
            hasY = true;
            if (metricName === 'Minutes') { sumY += (Number(r.Min ?? r.Minutes ?? 0) || 0); }
            else if (metricName === 'TCalls') { sumY += (Number(r.TCall ?? r.TCalls ?? r.total_calls ?? 0) || 0); }
            else if (metricName === 'ASR') { const v = Number(r.ASR); if (Number.isFinite(v)) { sumY += v; cntY += 1; } }
            else if (metricName === 'ACD') { const v = Number(r.ACD); if (Number.isFinite(v)) { sumY += v; cntY += 1; } }
          }
          if (hasY) {
            const valY = (metricName === 'ASR' || metricName === 'ACD') ? (cntY ? (sumY / cntY) : null) : sumY;
            if (Number.isFinite(valY)) {
              const yPix = api.coord([x, valY])[1];
              // position marker in center of grey bar
              const gx = Math.round(binCenter + (gapPx / 2));
              // merge labels if abs(value1 - value2) <= 0.1
              let skipY = false;
              try {
                const groupsY = __computeMergeGroups(tsY) || [];
                const grpY = groupsY.find(g => Array.isArray(g.provs) && g.provs.includes(supplierName));
                if (grpY && grpY.provs.length > 1) {
                  const gKeyY = `Y|${tsY}|${grpY.provs.join('|')}`;
                  const alreadyY = !!__mergeDrawn.get(gKeyY);
                  if (!alreadyY) {
                    const yPixM = api.coord([x, grpY.avg])[1];
                    const pillH = Math.max(stripeH + 2, Math.min(14, Math.round(stripeH * 1.25)));
                    // label stays within its own bar bounds
                    const minYGm = Math.min(base, yPixM);
                    const maxYGm = Math.max(base, yPixM);
                    let gy0M = Math.round(yPixM - pillH / 2);
                    gy0M = Math.max(minYGm, Math.min(maxYGm - pillH, gy0M));
                    // sort labels by value asc (small at bottom, bigger above)
                    const gyM = __allocY(__layoutYest, x, gy0M, pillH, minYGm, maxYGm);
                    // dimmed style for yesterday markers (neutral)
                    const styleYM = { fill: 'rgba(140,148,156,0.7)', opacity: 1, stroke: null, shadowBlur: 4, shadowColor: 'rgba(0,0,0,0.12)' };
                    children.push({ type: 'rect', shape: { x: gx, y: gyM, width: barW, height: pillH, r: Math.round(pillH / 2) }, style: styleYM, silent: true });
                    // label value = real data value (rounded to 1 decimal)
                    const lblYM = grpY.avg.toFixed(1);
                    children.push({ type: 'text', style: { text: lblYM, x: Math.round(gx + barW / 2), y: Math.round(gyM + pillH / 2), fill: '#ffffff', font: '600 10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif', align: 'center', verticalAlign: 'middle' }, silent: true });
                    __mergeDrawn.set(gKeyY, true);
                  }
                  // skip individual label if supplier included in merged label
                  skipY = true;
                }
              } catch(_) {}

              if (!skipY) {
                // same marker shape as main series
                // dimmed style for yesterday markers
                const styleY = { fill: color, opacity: 0.55, stroke: null, shadowBlur: 4, shadowColor: 'rgba(0,0,0,0.12)' };
                const pillH = Math.max(stripeH + 2, Math.min(14, Math.round(stripeH * 1.25)));
                // label stays within its own bar bounds
                const minYG = Math.min(base, yPix);
                const maxYG = Math.max(base, yPix);
                let gy0 = Math.round(yPix - pillH / 2);
                gy0 = Math.max(minYG, Math.min(maxYG - pillH, gy0));
                // sort labels by value asc (small at bottom, bigger above)
                const gy = __allocY(__layoutYest, x, gy0, pillH, minYG, maxYG);
                children.push({ type: 'rect', shape: { x: gx, y: gy, width: barW, height: pillH, r: Math.round(pillH / 2) }, style: styleY, silent: true });
                // label value = real data value (rounded to 1 decimal)
                const lblY = valY.toFixed(1);
                children.push({ type: 'text', style: { text: lblY, x: Math.round(gx + barW / 2), y: Math.round(gy + pillH / 2), fill: '#ffffff', font: '600 10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif', align: 'center', verticalAlign: 'middle' }, silent: true });
              }
            }
          }
        } catch(_) {}

        // add modern group separation between bar clusters
        // removed per request: no grey markers between bars

        return { type: 'group', children };
      },
      data: arr
    });
  }

  return series;
}
