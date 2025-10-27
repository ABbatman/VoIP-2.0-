// static/js/charts/echartsBarChartHelper.js
// Build provider-stacked data for ECharts Bar

const CANDIDATE_PROVIDER_KEYS = [
  'provider','Provider','supplier','Supplier','vendor','Vendor','carrier','Carrier','operator','Operator',
  'peer','Peer','trunk','Trunk','gateway','Gateway','route','Route','partner','Partner',
  'provider_name','supplier_name','vendor_name','carrier_name','peer_name',
  'providerId','supplierId','vendorId','carrierId','peerId',
  'provider_id','supplier_id','vendor_id','carrier_id','peer_id'
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

export function buildProviderStacks(rows, { fromTs, toTs, stepMs }) {
  try {
    if (!Array.isArray(rows) || rows.length === 0 || !Number.isFinite(stepMs)) return null;
    const providerKey = detectProviderKey(rows);
    if (!providerKey) return null;
    const dayMs = 24 * 3600e3;
    const ex = metricExtractors();

    // build centers
    const centers = [];
    const start = Math.floor(Number(fromTs) / stepMs) * stepMs;
    const end = Math.ceil(Number(toTs) / stepMs) * stepMs;
    for (let t = start; t <= end; t += stepMs) centers.push(t + Math.floor(stepMs / 2));

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
      if (!acc.has(prov)) acc.set(prov, { TCalls: new Map(), Minutes: new Map(), ASR: { sum: new Map(), cnt: new Map() }, ACD: { sum: new Map(), cnt: new Map() } });
      const a = acc.get(prov);
      const tcall = ex.TCalls(r);
      const minutes = ex.Minutes(r);
      const asr = ex.ASR(r);
      const acd = ex.ACD(r);
      // sums
      a.TCalls.set(bucket, (a.TCalls.get(bucket) || 0) + tcall);
      a.Minutes.set(bucket, (a.Minutes.get(bucket) || 0) + minutes);
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
    if (providers.length < 1) return null;

    const colors = Object.create(null);
    providers.forEach((p, i) => { colors[p] = PROVIDER_COLORS[i % PROVIDER_COLORS.length]; });

    // build pair sets per provider and metric
    const stacks = { TCalls: { curr: {}, prev: {} }, Minutes: { curr: {}, prev: {} }, ASR: { curr: {}, prev: {} }, ACD: { curr: {}, prev: {} } };
    const totals = { TCalls: [], Minutes: [], ASR: [], ACD: [] };

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
      for (const prov of providers) {
        const a = acc.get(prov) || {};
        const tcall = Number(a.TCalls?.get?.(c) || 0);
        const minutes = Number(a.Minutes?.get?.(c) || 0);
        // direct stacking for TCalls/Minutes
        const listT = (stacks.TCalls.curr[prov] = stacks.TCalls.curr[prov] || []);
        const listM = (stacks.Minutes.curr[prov] = stacks.Minutes.curr[prov] || []);
        if (tcall) listT.push([c, tcall]);
        if (minutes) listM.push([c, minutes]);
        // proportional segments for ASR (by calls share) and ACD (by minutes share)
        const asrSeg = (sumT > 0) ? (tcall / sumT) * asrTotal : 0;
        const acdSeg = (sumM > 0) ? (minutes / sumM) * acdTotal : 0;
        const listA = (stacks.ASR.curr[prov] = stacks.ASR.curr[prov] || []);
        const listC = (stacks.ACD.curr[prov] = stacks.ACD.curr[prov] || []);
        if (asrSeg) listA.push([c, asrSeg]);
        if (acdSeg) listC.push([c, acdSeg]);
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
    }

    return { providerKey, providers, colors, stacks, totals, centers };
  } catch(_) { return null; }
}
