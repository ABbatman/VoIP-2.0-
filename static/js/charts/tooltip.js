export function makeStreamTooltip(state) {
  return {
    trigger: 'axis',
    axisPointer: { type: 'line', lineStyle: { color: '#6366f1', width: 1, type: 'solid' } },
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#374151', fontSize: 13 },
    confine: true,
    formatter: (params) => {
      if (!Array.isArray(params) || params.length === 0) return '';
      // Find the series that mouse is hovering over (last non-null in stack)
      let hoveredParam = null;
      for (let i = params.length - 1; i >= 0; i--) {
        const p = params[i];
        if (p && p.value && p.value[1] != null && Number.isFinite(p.value[1]) && p.value[1] !== 0) {
          hoveredParam = p;
          break;
        }
      }
      if (!hoveredParam) hoveredParam = params[0];
      if (!hoveredParam || !hoveredParam.value) return '';
      
      const time = new Date(hoveredParam.value[0]);
      const timeStr = time.toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const val = hoveredParam.value[1];
      // Format value: ACD with 1 decimal, others as integer
      const valStr = (val != null && Number.isFinite(val)) 
        ? (state.metric === 'ACD' ? val.toFixed(1) : Math.round(val).toLocaleString()) 
        : 'N/A';
      // Build tooltip content
      let html = `<div style="font-weight: 600; margin-bottom: 6px;">${timeStr}</div>`;
      html += `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">` +
              `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: ${hoveredParam.color};"></span>` +
              `<span><strong>${hoveredParam.seriesName}</strong></span>` +
              `</div>`;
      html += `<div style="margin-left: 16px; font-size: 12px; color: #6b7280;">` +
              `Customer: ${state.customer || 'All'} | Supplier: ${state.supplier || 'All'}` +
              `</div>`;
      html += `<div style="margin-top: 4px; margin-left: 16px;">` +
              `${state.metric}: <strong>${valStr}</strong>` +
              `</div>`;
      return html;
    }
  };
}

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
    out.sort((a,b) => a[0] - b[0]);
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
      const out = Array.from(acc.entries()).sort((a,b) => a[0] - b[0]);
      return out;
    } catch(_) { return []; }
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
  const fmt = (v) => (v == null || isNaN(v) ? '-' : (Math.round(Number(v) * 10) / 10).toFixed(1));
  return (param) => {
    if (!param) return '';
    const arr = Array.isArray(param) ? param : [param];
    // Hide if only grey (-24h) series are under cursor
    const hasPrimary = arr.some(p => typeof p?.seriesName === 'string' && !p.seriesName.endsWith(' -24h'));
    if (!hasPrimary) return '';
    // Prefer axisValue for timestamp (axis trigger)
    let ts = Number(arr[0]?.axisValue);
    if (!Number.isFinite(ts)) {
      try { ts = Date.parse(arr[0]?.axisValueLabel); } catch(_) {
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
    const lines = [];
    const header = (arr[0]?.axisValueLabel) || new Date(tsSnap).toISOString().slice(0,16).replace('T',' ');
    lines.push(`TCalls: ${fmt(findPrevWithin(bins['TCalls'], tsSnap, half))}`);
    lines.push(`ASR: ${fmt(findPrevWithin(bins['ASR'], tsSnap, half))}`);
    lines.push(`Minutes: ${fmt(findPrevWithin(bins['Minutes'], tsSnap, half))}`);
    lines.push(`ACD: ${fmt(findPrevWithin(bins['ACD'], tsSnap, half))}`);
    return [header, ...lines].join('<br/>' );
  };
}
