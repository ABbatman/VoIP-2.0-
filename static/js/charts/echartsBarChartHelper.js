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
  const destKey = detectDestinationKey(allRows);

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

        // if supplier metric > bar average -> place above bar
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
            const supVal = (metricName === 'ASR' || metricName === 'ACD') ? (cnt ? (sum / cnt) : 0) : sum;
            if (Number.isFinite(supVal) && supVal > Number(total)) {
              // place stripe just above bar top
              yCenter = Math.round(topY - stripeH - 4);
              // mark for skipping inside-bar clamp
              params.__placeAbove = true;
            }
          }
        } catch(_) {}

        let yStripe = yCenter - Math.round(stripeH / 2);
        const minY = Math.min(base, topY);
        const maxY = Math.max(base, topY);
        // clamp only when not placed above
        if (!params.__placeAbove) {
          if (Number.isFinite(minY) && yStripe < minY) yStripe = minY;
          if (Number.isFinite(maxY) && (yStripe + stripeH) > maxY) yStripe = Math.max(minY, maxY - stripeH);
        }
        const style = api.style({ opacity: 0.95, stroke: '#ffffff', lineWidth: 0.6, fill: color });

        // Build children: current stripe + optional yesterday marker (dimmed)
        const children = [];
        children.push({ type: 'rect', shape: { x: xStripe, y: yStripe, width: barW, height: stripeH }, style });

        // Yesterday marker (same supplier at ts-24h)
        try {
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
              const cx = Math.round(xStripe + barW / 2);
              const r = Math.max(2, Math.round(Math.min(5, barW * 0.12)));
              const styleY = { fill: color, opacity: 0.6, stroke: null };
              children.push({ type: 'circle', shape: { cx, cy: yPix, r }, style: styleY, silent: true });
            }
          }
        } catch(_) {}

        return { type: 'group', children };
      },
      data: arr
    });
  }

  return series;
}
