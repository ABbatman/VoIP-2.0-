import { formatTimeRange } from './echarts/helpers/time.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

export function makeBarLineLikeTooltip({ chart, stepMs }) {
  const names = ['TCalls', 'ASR', 'Minutes', 'ACD'];
  const half = Math.max(1, Math.floor((Number(stepMs) || 3600e3) / 2));
  const toPairs = (arr) => {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const d of arr) {
      if (Array.isArray(d)) {
        const t = Number(d[0]); const y = d[1];
        if (Number.isFinite(t)) out.push([t, (y == null || isNaN(y)) ? null : Number(y)]);
      } else if (d && d.value) {
        const t = Number(d.value[0]); const y = d.value[1];
        if (Number.isFinite(t)) out.push([t, (y == null || isNaN(y)) ? null : Number(y)]);
      }
    }
    out.sort((a, b) => a[0] - b[0]);
    return out;
  };
  const getPairs = (name) => {
    try {
      const opt = chart.getOption();
      const ser = (opt.series || []);
      // First try by name (line charts, non-stacked bars)
      const sByName = ser.find(x => x && x.name === name);
      if (sByName) return toPairs(sByName.data || []);
      // If not found, try summing provider stack series (stacked bars)
      const stackMap = { TCalls: 'TCallsStack', ASR: 'ASRStack', Minutes: 'MinutesStack', ACD: 'ACDStack' };
      const targetStack = stackMap[name];
      if (!targetStack) return [];
      const stacks = ser.filter(x => x && x.type === 'bar' && x.stack === targetStack && typeof x.name === 'string' && !x.name.endsWith(' -24h'));
      if (!stacks.length) return [];
      const acc = new Map(); // t -> sum
      for (const s of stacks) {
        const pairs = toPairs(s.data || []);
        for (const [t, y] of pairs) acc.set(t, (acc.get(t) || 0) + (y || 0));
      }
      const out = Array.from(acc.entries()).sort((a, b) => a[0] - b[0]);
      return out;
    } catch (e) { logError(ErrorCategory.CHART, 'tooltip', e); return []; }
  };
  const findPrevWithin = (pairs, ts, maxDelta) => {
    if (!Array.isArray(pairs) || pairs.length === 0) return null;
    let lo = 0, hi = pairs.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const t = Number(pairs[mid][0]);
      if (t <= ts) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (ans === -1) return null;
    const t = Number(pairs[ans][0]);
    const y = pairs[ans][1];
    if (y == null || isNaN(y)) return null;
    return (ts - t) <= maxDelta ? Number(y) : null;
  };
  const fmtDec = (v) => (v == null || isNaN(v) ? '-' : (Math.round(Number(v) * 10) / 10).toFixed(1));
  const fmtMetric = (name, v) => {
    if (v == null || isNaN(v)) return '-';
    if (name === 'TCalls') return Math.round(Number(v)).toLocaleString();
    return fmtDec(v);
  };
  return (param) => {
    if (!param) return '';
    const arr = Array.isArray(param) ? param : [param];
    // Suppress global tooltip if marker hover is active (lightweight check)
    if (chart && chart.__capsuleHoverActive) return '';
    // Hide if only grey (-24h) series are under cursor
    const hasPrimary = arr.some(p => typeof p?.seriesName === 'string' && !p.seriesName.endsWith(' -24h'));
    if (!hasPrimary) return '';
    // Prefer axisValue for timestamp (axis trigger)
    let ts = Number(arr[0]?.axisValue);
    if (!Number.isFinite(ts)) {
      try { ts = Date.parse(arr[0]?.axisValueLabel); } catch (e) { logError(ErrorCategory.CHART, 'tooltip', e);
        // Ignore date parsing errors
      }
    }
    if (!Number.isFinite(ts)) {
      // fallback to first primary item's data value
      const prim = arr.find(p => typeof p?.seriesName === 'string' && !p.seriesName.endsWith(' -24h'));
      if (prim) ts = Array.isArray(prim.data) ? Number(prim.data[0]) : Number(prim.value?.[0]);
    }
    if (!Number.isFinite(ts)) return '';
    const step = Number(stepMs) || 3600e3;
    const tsSnap = Math.round(ts / step) * step;
    // Build bins per call to reflect latest series state
    const bins = Object.create(null);
    for (const n of names) bins[n] = getPairs(n);
    const header = formatTimeRange(tsSnap, step);
    const rows = [];
    const pushRow = (name, val) => {
      rows.push(`<li style="display:flex;justify-content:space-between;gap:12px;"><span>${name}</span><span style="font-variant-numeric: tabular-nums;">${val}</span></li>`);
    };
    pushRow('TCalls', fmtMetric('TCalls', findPrevWithin(bins['TCalls'], tsSnap, half)));
    pushRow('ASR', fmtMetric('ASR', findPrevWithin(bins['ASR'], tsSnap, half)));
    pushRow('Minutes', fmtMetric('Minutes', findPrevWithin(bins['Minutes'], tsSnap, half)));
    pushRow('ACD', fmtMetric('ACD', findPrevWithin(bins['ACD'], tsSnap, half)));
    const list = `<ul style="list-style:none;padding:0;margin:0;">${rows.join('')}</ul>`;
    const timeBlock = `<div><div style="font-size:11px;color:#6b7280;">Time</div><div style="font-weight:600;">${header}</div></div>`;
    const html = `
      <div style="display:flex;flex-direction:column;gap:6px;min-width:200px;">
        <div style="display:grid;grid-template-columns:1fr;row-gap:4px;">
          ${timeBlock}
        </div>
        <div style="height:1px;background:#eef2f7;margin:6px 0;"></div>
        ${list}
      </div>
    `;
    return html;
  };
}
