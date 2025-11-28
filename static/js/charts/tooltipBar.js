// static/js/charts/tooltipBar.js
// BAR tooltip helpers (visual only)
import { logError, ErrorCategory } from '../utils/errorLogger.js';

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

const CANDIDATE_DEST_KEYS = ['destination','Destination','dst','Dst','country','Country','prefix','Prefix','route','Route','direction','Direction'];
const CANDIDATE_CUST_KEYS = ['customer','Customer','client','Client','account','Account','buyer','Buyer'];

function detectKey(rows, candidates) {
  try {
    const lowerPref = candidates.map(k => k.toLowerCase());
    for (const r of (rows || [])) {
      if (!r || typeof r !== 'object') continue;
      for (const k of Object.keys(r)) {
        const kl = String(k).toLowerCase();
        if (!lowerPref.includes(kl)) continue;
        const v = r[k];
        if (v == null) continue;
        const s = typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : '');
        if (s) return k;
      }
    }
  } catch (e) { logError(ErrorCategory.CHART, 'tooltipBar', e);}
  return null;
}

function metricValue(metric, row) {
  if (metric === 'Minutes') return Number(row.Min ?? row.Minutes ?? 0) || 0;
  if (metric === 'TCalls') return Number(row.TCall ?? row.TCalls ?? row.total_calls ?? 0) || 0;
  if (metric === 'ASR') { const v = Number(row.ASR); return Number.isFinite(v) ? v : null; }
  if (metric === 'ACD') { const v = Number(row.ACD); return Number.isFinite(v) ? v : null; }
  return null;
}

function formatValue(metric, v) {
  if (!Number.isFinite(v)) return '';
  if (metric === 'ASR') return `${v.toFixed(2)}%`;
  if (metric === 'ACD') return `${v.toFixed(2)}`;
  return `${v}`;
}

export function makeBarOverlayTooltipFormatter({ metricName, stepMs, providerKey, rows, supplierName }) {
  const allRows = Array.isArray(rows) ? rows : [];
  const provKey = String(providerKey || '').trim();
  const destKey = detectKey(allRows, CANDIDATE_DEST_KEYS);
  const custKey = detectKey(allRows, CANDIDATE_CUST_KEYS);

  return (p) => {
    try {
      const ts = Number(p?.value?.[0]);
      const dt = Number.isFinite(ts) ? new Date(ts).toISOString().replace('T',' ').replace('Z','') : '';
      const metric = String(metricName);

      // compute supplier values at ts
      const supVals = new Map(); // supplier -> {sum, cnt}
      const custSet = new Set(); // all customers for hovered supplier
      for (const r of allRows) {
        if (!r || typeof r !== 'object') continue;
        const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour || r.datetime || r.DateTime || r.ts || r.TS || r.period || r.Period || r.start || r.Start || r.start_time || r.StartTime);
        if (!Number.isFinite(rt)) continue;
        const bucket = Math.floor(rt / stepMs) * stepMs + Math.floor(stepMs / 2);
        if (bucket !== ts) continue;
        const prov = provKey ? String(r[provKey] || '').trim() : '';
        if (!prov) continue;
        const v = metricValue(metric, r);
        if (metric === 'ASR' || metric === 'ACD') {
          if (v == null) continue;
          const acc = supVals.get(prov) || { sum: 0, cnt: 0 };
          acc.sum += v; acc.cnt += 1; supVals.set(prov, acc);
        } else {
          const acc = supVals.get(prov) || { sum: 0, cnt: 0 };
          acc.sum += (v || 0); supVals.set(prov, acc);
        }
        if (supplierName && prov === supplierName && custKey) {
          const c = String(r[custKey] || '').trim();
          if (c) custSet.add(c);
        }
      }

      // value for hovered supplier
      let hoveredVal = null;
      if (supplierName && supVals.has(supplierName)) {
        const a = supVals.get(supplierName);
        hoveredVal = (metric === 'ASR' || metric === 'ACD') ? (a.cnt ? (a.sum / a.cnt) : null) : a.sum;
      }

      // detect suppliers with same value
      let sameSuppliers = [];
      if (Number.isFinite(hoveredVal)) {
        const EPS = 1e-9;
        for (const [prov, a] of supVals.entries()) {
          const val = (metric === 'ASR' || metric === 'ACD') ? (a.cnt ? (a.sum / a.cnt) : null) : a.sum;
          if (Number.isFinite(val) && Math.abs(val - hoveredVal) <= EPS) sameSuppliers.push({ prov, val });
        }
      }

      // build directions for single supplier
      const dirLines = [];
      if (supplierName) {
        const groups = new Map(); // dest -> {sum, cnt}
        for (const r of allRows) {
          if (!r || typeof r !== 'object') continue;
          if (provKey && String(r[provKey] || '').trim() !== supplierName) continue;
          const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour || r.datetime || r.DateTime || r.ts || r.TS || r.period || r.Period || r.start || r.Start || r.start_time || r.StartTime);
          if (!Number.isFinite(rt)) continue;
          const bucket = Math.floor(rt / stepMs) * stepMs + Math.floor(stepMs / 2);
          if (bucket !== ts) continue;
          const dest = destKey ? String(r[destKey] || '').trim() : '';
          let g = groups.get(dest);
          if (!g) { g = { sum: 0, cnt: 0 }; groups.set(dest, g); }
          const v = metricValue(metric, r);
          if (metric === 'ASR' || metric === 'ACD') { if (v != null) { g.sum += v; g.cnt += 1; } }
          else { g.sum += (v || 0); }
        }
        const entries = Array.from(groups.entries());
        entries.sort((a,b) => (b[1].sum/(b[1].cnt||1)) - (a[1].sum/(a[1].cnt||1)));
        for (const [dest, agg] of entries) {
          const val = (metric === 'ASR' || metric === 'ACD') ? (agg.cnt ? (agg.sum / agg.cnt) : 0) : agg.sum;
          const destName = dest || '—';
          dirLines.push(`  - ${destName}: ${formatValue(metric, val)}`);
        }
      }

      // build customers lines
      const custLines = Array.from(custSet.values()).map(c => `  - ${c}`);

      // Combined or single output
      if (sameSuppliers.length > 1 && Number.isFinite(hoveredVal)) {
        const head = `Suppliers (same value): ${formatValue(metric, hoveredVal)} ${metric}`;
        const supList = sameSuppliers.map(s => `  - ${s.prov}`).join('\n');
        // customers mapping to supplier at ts
        const custMap = new Map(); // customer -> supplier
        if (custKey) {
          for (const r of allRows) {
            const rt = parseRowTs(r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || r.hour || r.Hour || r.datetime || r.DateTime || r.ts || r.TS || r.period || r.Period || r.start || r.Start || r.start_time || r.StartTime);
            if (!Number.isFinite(rt)) continue;
            const bucket = Math.floor(rt / stepMs) * stepMs + Math.floor(stepMs / 2);
            if (bucket !== ts) continue;
            const prov = provKey ? String(r[provKey] || '').trim() : '';
            if (!sameSuppliers.some(s => s.prov === prov)) continue;
            const cust = String(r[custKey] || '').trim();
            if (cust) custMap.set(cust, prov);
          }
        }
        const custBlock = 'Customers:<br/>' + (custMap.size ? Array.from(custMap.entries()).map(([c, s]) => `  - ${c} → sends to ${s}`).join('<br/>') : '  - —');
        return [head, 'Suppliers:', supList, custBlock].filter(Boolean).join('<br/>');
      }

      // Single supplier output
      const valStr = Number.isFinite(hoveredVal) ? formatValue(metric, hoveredVal) : '';
      const lines = [];
      lines.push(`Supplier: ${supplierName || ''}`);
      lines.push(`Value: ${valStr} ${metric}`);
      // Customers section is always present
      lines.push('Customers:');
      if (custLines.length) { lines.push(...custLines); } else { lines.push('  - —'); }
      if (dirLines.length) { lines.push('Directions:'); lines.push(...dirLines); }
      return lines.join('<br/>');
    } catch (e) { logError(ErrorCategory.CHART, 'tooltipBar', e); return ''; }
  };
}
