// static/js/charts/echarts/helpers/barChartData.js
// Responsibility: data preparation utilities for bar chart
import { detectProviderKey, parseRowTs } from './dataTransform.js';
import { getStableColor } from './colors.js';
import { getStepMs } from './time.js';
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Color map building
// ─────────────────────────────────────────────────────────────

const ID_CANDIDATE_KEYS = [
  'supplierId', 'providerId', 'vendorId', 'carrierId', 'peerId', 'id',
  'supplier_id', 'provider_id', 'vendor_id', 'carrier_id', 'peer_id'
];

export function buildColorMap({ providerRows, labels }) {
  const map = Object.create(null);

  try {
    const rows = Array.isArray(providerRows) ? providerRows : [];
    const key = detectProviderKey(rows);

    if (rows.length && key) {
      for (const r of rows) {
        const name = String(r?.[key] ?? '').trim();
        const idKey = ID_CANDIDATE_KEYS.find(k => r && Object.prototype.hasOwnProperty.call(r, k));
        const rawId = idKey ? r[idKey] : undefined;
        const id = rawId != null ? String(rawId) : undefined;

        if (!name && !id) continue;

        const color = getStableColor(name || id);
        if (name && !map[name]) map[name] = color;
        if (id && !map[id]) map[id] = color;
      }
    }

    // fallback: seed from labels when rows/key not available
    if (Object.keys(map).length === 0 && labels && (labels.ASR || labels.ACD)) {
      const entries = collectLabelEntries(labels);
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
  } catch (e) {
    logError(ErrorCategory.CHART, 'barChartData:buildColorMap', e);
  }

  return map;
}

function collectLabelEntries(labels) {
  const collect = (obj) => {
    if (!obj || typeof obj !== 'object') return [];
    const all = [];

    for (const ts of Object.keys(obj)) {
      const arr = obj[ts] || obj[String(ts)] || [];
      if (!Array.isArray(arr)) continue;

      for (const it of arr) {
        const sid = it?.supplierId ?? it?.supplier ?? it?.id ?? it?.name ?? null;
        if (sid == null) continue;

        const name = String(it.name ?? it.supplier ?? '').trim();
        const id = String(sid);
        all.push({ id, name });
      }
    }
    return all;
  };

  return [...collect(labels.ASR), ...collect(labels.ACD)];
}

// ─────────────────────────────────────────────────────────────
// Labels effective building
// ─────────────────────────────────────────────────────────────

const NAME_KEYS = [
  'name', 'supplier', 'provider', 'peer', 'vendor', 'carrier', 'operator',
  'route', 'trunk', 'gateway', 'partner', 'supplier_name', 'provider_name',
  'vendor_name', 'carrier_name', 'peer_name'
];

const ID_KEYS = [
  'supplierId', 'providerId', 'vendorId', 'carrierId', 'peerId', 'id',
  'supplier_id', 'provider_id', 'vendor_id', 'carrier_id', 'peer_id'
];

function hasSupplierInfo(obj) {
  if (!obj || typeof obj !== 'object') return false;

  for (const k of Object.keys(obj)) {
    const arr = obj[k];
    if (!Array.isArray(arr)) continue;

    for (const it of arr) {
      if (it && typeof it === 'object') {
        if ('supplierId' in it || 'id' in it || 'supplier' in it || 'name' in it) {
          return true;
        }
      }
    }
  }
  return false;
}

export function buildLabelsEffective({ labels, providerRows, stepMs, interval }) {
  try {
    const le = {
      ASR: labels?.ASR || {},
      ACD: labels?.ACD || {}
    };

    const needBuild = !(hasSupplierInfo(le.ASR) || hasSupplierInfo(le.ACD));
    if (!needBuild) return le;

    const rows = Array.isArray(providerRows) ? providerRows : [];
    if (!rows.length) return le;

    const step = Number(stepMs) || getStepMs(interval);
    const slotCenter = (t) => {
      const s = Number.isFinite(step) && step > 0 ? step : 3600e3;
      const slotBase = Math.floor(t / s) * s;
      return slotBase + Math.floor(s / 2);
    };

    const aggASR = new Map();
    const aggACD = new Map();

    for (const r of rows) {
      const t = parseRowTs(r.time || r.slot || r.hour || r.timestamp);
      if (!Number.isFinite(t)) continue;

      const c = slotCenter(t);
      let name = null;
      let sid = null;

      for (const k of ID_KEYS) {
        if (sid == null && Object.prototype.hasOwnProperty.call(r, k)) sid = r[k];
      }
      for (const k of NAME_KEYS) {
        if (name == null && Object.prototype.hasOwnProperty.call(r, k)) name = r[k];
      }

      const key = String(sid ?? name ?? '');
      if (!key) continue;

      const asr = Number(r.ASR ?? r.asr);
      const acd = Number(r.ACD ?? r.acd);

      if (Number.isFinite(asr)) {
        let m = aggASR.get(c);
        if (!m) { m = new Map(); aggASR.set(c, m); }
        const cell = m.get(key) || { sum: 0, cnt: 0, name: name != null ? String(name) : null, id: sid != null ? String(sid) : null };
        cell.sum += asr;
        cell.cnt += 1;
        m.set(key, cell);
      }

      if (Number.isFinite(acd)) {
        let m = aggACD.get(c);
        if (!m) { m = new Map(); aggACD.set(c, m); }
        const cell = m.get(key) || { sum: 0, cnt: 0, name: name != null ? String(name) : null, id: sid != null ? String(sid) : null };
        cell.sum += acd;
        cell.cnt += 1;
        m.set(key, cell);
      }
    }

    const toArrMap = (agg) => {
      const out = {};
      for (const [ts, m] of agg.entries()) {
        const arr = [];
        for (const [k, v] of m.entries()) {
          const val = v.cnt > 0 ? (v.sum / v.cnt) : null;
          if (Number.isFinite(val)) {
            arr.push({ supplierId: v.id ?? v.name ?? k, name: v.name ?? null, value: val });
          }
        }
        out[ts] = arr;
      }
      return out;
    };

    return { ASR: toArrMap(aggASR), ACD: toArrMap(aggACD) };
  } catch (e) {
    logError(ErrorCategory.CHART, 'barChartData:buildLabelsEffective', e);
    return { ASR: labels?.ASR || {}, ACD: labels?.ACD || {} };
  }
}

// ─────────────────────────────────────────────────────────────
// Capsule tooltip data provider
// ─────────────────────────────────────────────────────────────

const DEST_CANDIDATES = ['destination', 'Destination', 'dst', 'Dst', 'country', 'Country', 'prefix', 'Prefix', 'route', 'Route', 'direction', 'Direction'];
const CUST_CANDIDATES = ['customer', 'Customer', 'client', 'Client', 'account', 'Account', 'buyer', 'Buyer', 'main', 'Main'];

function detectFieldKey(rows, candidates) {
  try {
    const lowerPref = candidates.map(k => k.toLowerCase());
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
  } catch (e) {
    logError(ErrorCategory.CHART, 'barChartData:detectFieldKey', e);
  }
  return null;
}

function normalizeArrayField(byTs, keys) {
  for (const k of keys) {
    if (Array.isArray(byTs[k])) return byTs[k];
  }
  const firstVal = byTs[keys[0]];
  return firstVal != null ? [firstVal] : [];
}

function lookupByTimestamp(source, ts) {
  if (!source) return null;
  return source[ts] || source[String(ts)] ||
         source[Math.floor(Number(ts) / 1000)] ||
         source[String(Math.floor(Number(ts) / 1000))] || null;
}

function enrichWithPerSupplierData({ ret, providerRows, providerKey, ts, stepMs, interval }) {
  const rows = Array.isArray(providerRows) ? providerRows : [];
  if (!rows.length || !providerKey) return;

  const destKey = detectFieldKey(rows, DEST_CANDIDATES);
  const custKey = detectFieldKey(rows, CUST_CANDIDATES);
  if (!destKey && !custKey) return;

  const step = Number(stepMs) || getStepMs(interval);
  const bucketCenter = (t) => {
    const base = Math.floor(t / step) * step;
    return base + Math.floor(step / 2);
  };

  const custBySup = Object.create(null);
  const destBySup = Object.create(null);

  for (const r of rows) {
    const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour);
    if (!Number.isFinite(rt)) continue;
    if (bucketCenter(rt) !== ts) continue;

    const prov = String(r[providerKey] || '').trim();
    if (!prov) continue;

    if (custKey) {
      const c = String(r[custKey] || '').trim();
      if (c) {
        if (!custBySup[prov]) custBySup[prov] = [];
        if (!custBySup[prov].includes(c)) custBySup[prov].push(c);
      }
    }

    if (destKey) {
      const d = String(r[destKey] || '').trim();
      if (d) {
        if (!destBySup[prov]) destBySup[prov] = [];
        if (!destBySup[prov].includes(d)) destBySup[prov].push(d);
      }
    }
  }

  if (Object.keys(custBySup).length) ret.customersBySupplier = custBySup;
  if (Object.keys(destBySup).length) ret.destinationsBySupplier = destBySup;
}

function buildSuppliersFromRows({ providerRows, providerKey, ts, metric, stepMs, interval }) {
  const rows = Array.isArray(providerRows) ? providerRows : [];
  if (!rows.length || !providerKey) return null;

  const step = Number(stepMs) || getStepMs(interval);
  const bucketCenter = (t) => {
    const base = Math.floor(t / step) * step;
    return base + Math.floor(step / 2);
  };

  const destKey = detectFieldKey(rows, DEST_CANDIDATES);
  const custKey = detectFieldKey(rows, CUST_CANDIDATES);

  const supAgg = new Map();
  const custBySup = new Map();
  const destBySup = new Map();

  for (const r of rows) {
    const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour);
    if (!Number.isFinite(rt)) continue;
    if (bucketCenter(rt) !== ts) continue;

    const prov = String(r[providerKey] || '').trim();
    if (!prov) continue;

    // extract metric value
    let v = null;
    if (metric === 'ASR') v = Number(r.ASR ?? r.asr);
    else if (metric === 'ACD') v = Number(r.ACD ?? r.acd);
    else if (metric === 'Minutes') v = Number(r.Min ?? r.Minutes) || 0;
    else if (metric === 'TCalls') v = Number(r.TCall ?? r.TCalls ?? r.total_calls) || 0;

    if (!Number.isFinite(v)) v = (metric === 'ASR' || metric === 'ACD') ? null : 0;

    // aggregate
    if (v != null || !(metric === 'ASR' || metric === 'ACD')) {
      const a = supAgg.get(prov) || { sum: 0, cnt: 0 };
      a.sum += v || 0;
      a.cnt += 1;
      supAgg.set(prov, a);
    }

    if (custKey) {
      const c = String(r[custKey] || '').trim();
      if (c) {
        let s = custBySup.get(prov);
        if (!s) { s = new Set(); custBySup.set(prov, s); }
        s.add(c);
      }
    }

    if (destKey) {
      const d = String(r[destKey] || '').trim();
      let m = destBySup.get(prov);
      if (!m) { m = new Map(); destBySup.set(prov, m); }
      let g = m.get(d);
      if (!g) { g = { sum: 0, cnt: 0 }; m.set(d, g); }
      if (metric === 'ASR' || metric === 'ACD') {
        if (v != null) { g.sum += v; g.cnt += 1; }
      } else {
        g.sum += v || 0;
      }
    }
  }

  // build result
  const isAvg = metric === 'ASR' || metric === 'ACD';
  const suppliers = Array.from(supAgg.entries())
    .map(([name, a]) => ({
      name,
      value: isAvg ? (a.cnt ? a.sum / a.cnt : null) : a.sum
    }))
    .filter(s => isAvg ? Number.isFinite(s.value) : true)
    .sort((x, y) => (Number(y.value) || 0) - (Number(x.value) || 0));

  const customersBySupplier = {};
  for (const [name, set] of custBySup.entries()) {
    customersBySupplier[name] = Array.from(set.values());
  }

  const destinationsBySupplier = {};
  for (const [name, m] of destBySup.entries()) {
    const arr = [];
    for (const [dest, agg] of m.entries()) {
      const val = isAvg ? (agg.cnt ? agg.sum / agg.cnt : 0) : agg.sum;
      const formatted = metric === 'ASR' ? `${val.toFixed(2)}%` : (metric === 'ACD' ? val.toFixed(2) : `${val}`);
      arr.push(`${dest || '—'}: ${formatted}`);
    }
    arr.sort();
    destinationsBySupplier[name] = arr;
  }

  return {
    time: new Date(Number(ts)).toISOString().replace('T', ' ').replace('Z', ''),
    suppliers,
    customers: [],
    destinations: [],
    customersBySupplier,
    destinationsBySupplier
  };
}

// main factory
export function createCapsuleDataProvider({ labelsEffective, providerRows, stepMs, interval, externalSource }) {
  const pKey = detectProviderKey(Array.isArray(providerRows) ? providerRows : []);

  return function getCapsuleData({ metric, ts }) {
    try {
      // try external source first
      if (externalSource) {
        const key = metric && externalSource[metric] ? metric : (metric && externalSource[String(metric).toUpperCase()] ? String(metric).toUpperCase() : null);
        const perMetric = key ? externalSource[key] : null;
        const byTs = lookupByTimestamp(perMetric, ts);

        if (byTs) {
          const ret = {
            time: byTs.time || new Date(Number(ts)).toISOString().replace('T', ' ').replace('Z', ''),
            suppliers: Array.isArray(byTs.suppliers) ? byTs.suppliers : [],
            customers: normalizeArrayField(byTs, ['customers', 'customer', 'clients', 'client']),
            destinations: normalizeArrayField(byTs, ['destinations', 'destination', 'directions', 'direction']),
            customersBySupplier: byTs.customersBySupplier || byTs.customers_by_supplier,
            destinationsBySupplier: byTs.destinationsBySupplier || byTs.destinations_by_supplier
          };

          // fallback suppliers from labelsEffective
          if (!ret.suppliers.length) {
            const mKey = (metric === 'ASR' || metric === 'ACD') ? metric : null;
            const eff = mKey && labelsEffective?.[mKey];
            const byTs2 = lookupByTimestamp(eff, ts);
            if (Array.isArray(byTs2) && byTs2.length) ret.suppliers = byTs2;
          }

          // populate arrays from maps if empty
          if (!ret.customers.length && ret.customersBySupplier) {
            const acc = [];
            for (const k of Object.keys(ret.customersBySupplier)) {
              const arr = ret.customersBySupplier[k];
              if (Array.isArray(arr) && arr.length) acc.push(String(arr[0]));
              if (acc.length >= 3) break;
            }
            if (acc.length) ret.customers = acc;
          }

          if (!ret.destinations.length && ret.destinationsBySupplier) {
            const acc = [];
            for (const k of Object.keys(ret.destinationsBySupplier)) {
              const arr = ret.destinationsBySupplier[k];
              if (Array.isArray(arr) && arr.length) acc.push(String(arr[0]));
              if (acc.length >= 3) break;
            }
            if (acc.length) ret.destinations = acc;
          }

          if (ret.suppliers.length) return ret;
        }
      }

      // fallback 1: use labels (ASR/ACD only)
      const mKey = (metric === 'ASR' || metric === 'ACD') ? metric : null;
      const lm = labelsEffective?.[mKey];
      if (mKey && lm) {
        const byTs2 = lookupByTimestamp(lm, ts);
        if (Array.isArray(byTs2)) {
          const ret = {
            time: new Date(Number(ts)).toISOString().replace('T', ' ').replace('Z', ''),
            suppliers: byTs2,
            customers: [],
            destinations: []
          };

          enrichWithPerSupplierData({
            ret,
            providerRows,
            providerKey: pKey,
            ts,
            stepMs,
            interval
          });

          return ret;
        }
      }

      // fallback 2: compute from providerRows
      return buildSuppliersFromRows({
        providerRows,
        providerKey: pKey,
        ts,
        metric,
        stepMs,
        interval
      });

    } catch (e) {
      logError(ErrorCategory.CHART, 'barChartData:getCapsuleData', e);
      return null;
    }
  };
}
