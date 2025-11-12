// static/js/charts/echarts/helpers/capsuleTooltip.js
// Responsibility: attach separate DOM tooltip for capsule labels (ECharts custom series)

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
    el.style.padding = '8px 10px';
    el.style.borderRadius = '8px';
    el.style.background = 'rgba(255,255,255,0.98)';
    el.style.border = '1px solid #e5e7eb';
    el.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
    el.style.font = '500 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    el.style.whiteSpace = 'pre';
    el.style.transition = 'opacity 120ms ease';
    el.style.opacity = '0';
    document.body.appendChild(el);
  }
  el.style.color = textColor || 'var(--ds-color-fg)';
  return el;
}

function fmtBlock({ time, suppliers, customers, destinations }) { // format only
  const lines = [];
  if (time) lines.push(time);
  if (Array.isArray(suppliers) && suppliers.length) {
    const sup = suppliers.slice().sort((a,b) => (Number(b?.value)||0) - (Number(a?.value)||0));
    for (const s of sup) {
      const name = (s && (s.name ?? s.supplier ?? s.provider ?? s.id)) ?? '';
      const val = (s && s.value != null) ? s.value : '';
      lines.push(`${String(name)} → ${String(val)}`);
    }
  }
  if (Array.isArray(customers)) {
    lines.push('Customers(s) →');
    for (const c of customers) lines.push(` - ${String(c)}`);
  }
  if (Array.isArray(destinations)) {
    lines.push('Destination(s) →');
    for (const d of destinations) lines.push(` - ${String(d)}`);
  }
  return lines.join('\n');
}

function makeHandlers(chart, { getCapsuleData, textColor, metricByGridIndex }) {
  const move = (e) => {
    if (!el || el.style.opacity === '0') return;
    const x = (e && e.event && Number.isFinite(e.event.event?.clientX)) ? e.event.event.clientX : (e?.offsetX || 0);
    const y = (e && e.event && Number.isFinite(e.event.event?.clientY)) ? e.event.event.clientY : (e?.offsetY || 0);
    el.style.left = `${x + 12}px`;
    el.style.top = `${y + 12}px`;
  };
  const over = (e) => {
    try {
      if (!e || e.componentType !== 'series') return;
      // Hover over BAR series: dim others (including overlays), keep BAR tooltip intact, no capsule tooltip
      if (e.seriesType === 'bar') {
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
      const opt = chart.getOption();
      const series = Array.isArray(opt.series) ? opt.series[e.seriesIndex] : null;
      const gridIdx = Number(series?.gridIndex);
      const metric = metricByGridIndex && metricByGridIndex[gridIdx];
      const ts = Array.isArray(e.value) ? Number(e.value[0]) : Number(e?.data?.[0]);
      if (!Number.isFinite(ts)) return;
      const data = (typeof getCapsuleData === 'function') ? getCapsuleData({ metric, ts }) : null;
      if (!data) return;
      // hide default ECharts tooltip (separate capsule tooltip only)
      try { chart.dispatchAction({ type: 'hideTip' }); } catch(_) {}
      ensureEl(textColor);
      el.textContent = fmtBlock(data);
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
