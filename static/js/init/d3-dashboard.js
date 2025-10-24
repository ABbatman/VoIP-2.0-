// static/js/init/d3-dashboard.js
// D3 dashboard entry-point: prepares chart area and exposes a simple UI to switch chart types

import { ensureDefaults, getRenderer, listTypes, registerChart } from '../charts/registry.js';
import { subscribe, publish } from '../state/eventBus.js';
import { getFilters, getMetricsData, getAppStatus, setUI } from '../state/appState.js';
import { attachChartZoom } from '../charts/zoom/brushZoom.js';
import { shapeChartPayload, intervalToStep } from '../charts/engine/timeSeriesEngine.js';
import { parseUtc } from '../utils/date.js';

async function whenReadyForCharts() {
  // Wait until charts-container and chart-area-1 appear in DOM (renderer may mount later)
  return new Promise((resolve) => {
    const check = () => {
      const host = document.getElementById('charts-container');
      const mount = document.getElementById('chart-area-1');
      if (host && mount) return resolve({ host, mount });
      requestAnimationFrame(check);
    };
    check();
  });
}

export async function initD3Dashboard() {
  // Guard against double initialization
  try {
    if (typeof window !== 'undefined') {
      if (window.__chartsInitDone) {
        try { console.debug('[charts] init skipped (already initialized)'); } catch(_) {}
        return;
      }
      window.__chartsInitDone = true;
    }
  } catch(_) {}
  try { console.debug('[charts] initD3Dashboard: start'); } catch(_) {}
  await ensureDefaults();
  const { host, mount } = await whenReadyForCharts();
  // Always re-query mount to avoid stale references after DOM patching
  const getMount = () => document.getElementById('chart-area-1');
  try { console.debug('[charts] initD3Dashboard: dom ready', { host: !!host, mount: !!mount }); } catch(_) {}

  // Do not force charts visibility on init; wait for explicit Find or URL state

  // Register renderers: by default D3; if flag enabled, ECharts renderers
  try {
    const useEcharts = (typeof window !== 'undefined') && !!window.__chartsUseEcharts;
    if (useEcharts) {
      const { registerEchartsRenderers } = await import('../charts/echartsRenderer.js');
      await registerEchartsRenderers();
      console.debug('[charts] ECharts renderers registered');
    } else {
      const { renderMultiLineChart } = await import('../charts/multiLineChart.js');
      if (typeof renderMultiLineChart === 'function') {
        registerChart('line', renderMultiLineChart);
        console.debug('[charts] line renderer overridden with multiLineChart');
      }
    }
  } catch (e) {
    console.warn('[charts] failed to register renderers', e);
  }

  const icons = {
    // Minimal: line with smaller stroke and tiny markers
    line: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 19.5H21" opacity="0.3"/>
        <polyline points="3,15 8,10.6 12,13 16,9.2 21,11.3"/>
        <circle cx="8" cy="10.6" r="0.7" fill="currentColor" stroke="none"/>
        <circle cx="12" cy="13" r="0.7" fill="currentColor" stroke="none"/>
        <circle cx="16" cy="9.2" r="0.7" fill="currentColor" stroke="none"/>
      </svg>
    `,
    // Minimal: bars as thin round-capped lines
    bar: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
        <path d="M3 19.5H21" opacity="0.3"/>
        <line x1="7" y1="18" x2="7" y2="11"/>
        <line x1="12" y1="18" x2="12" y2="6"/>
        <line x1="17" y1="18" x2="17" y2="13"/>
      </svg>
    `,
    // Minimal: 3x3 dot grid heatmap (unchanged size, minimalist)
    heatmap: `
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <g opacity="0.35"><circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/></g>
        <g opacity="0.65"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/></g>
        <g opacity="0.9"><circle cx="18" cy="12" r="1.6"/></g>
        <g opacity="0.4"><circle cx="6" cy="18" r="1.6"/></g>
        <g opacity="0.7"><circle cx="12" cy="18" r="1.6"/></g>
        <g opacity="0.55"><circle cx="18" cy="18" r="1.6"/></g>
      </svg>
    `,
    // Minimal hybrid: thinner overlay line
    hybrid: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 19.5H21" opacity="0.28" stroke-width="1.4"/>
        <g stroke-width="2.2">
          <line x1="7" y1="18" x2="7" y2="12"/>
          <line x1="12" y1="18" x2="12" y2="8"/>
          <line x1="17" y1="18" x2="17" y2="14"/>
        </g>
        <polyline points="4,15 9,10.5 13,12 18,9.6 20,11" stroke-width="1.4"/>
      </svg>
    `
  };

  const ensureControls = () => {
    let controls = document.getElementById('charts-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.id = 'charts-controls';
      controls.className = 'charts-toolbar';
      const m = getMount();
      if (m && m.parentNode) {
        m.parentNode.insertBefore(controls, m.nextSibling);
      } else {
        host.appendChild(controls);
      }
    }
    return controls;
  };

  const populateButtons = (controls) => {
    let available = listTypes();
    if (!available || available.length === 0) {
      available = ['line', 'bar', 'heatmap', 'hybrid'];
    }
    // Rebuild content each time to avoid duplicates/stale buttons
    controls.innerHTML = '';
    available.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `charts-toolbar__btn charts-toolbar__btn--${t}`;
      btn.dataset.type = t;
      const title = t.charAt(0).toUpperCase() + t.slice(1);
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.innerHTML = icons[t] || icons.line;
      controls.appendChild(btn);
    });

    const intervals = document.createElement('div');
    intervals.id = 'charts-intervals';
    intervals.className = 'charts-intervals';
    const intervalDefs = [
      { key: '1m', label: '1m' },
      { key: '5m', label: '5m' },
      { key: '1h', label: '1h' },
      { key: '1d', label: '1d' },
      { key: '1w', label: '1w' },
      { key: '1M', label: '1M' },
    ];
    intervalDefs.forEach(({ key, label }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'interval-btn';
      b.dataset.interval = key;
      b.textContent = label;
      intervals.appendChild(b);
    });
    controls.appendChild(intervals);
    try { console.debug('[charts] controls populated:', { types: available.length, intervals: intervalDefs.length }); } catch(_) {}
  };

  // Compute chart area height on every render; robust against small container on first open
  const ensureFixedChartHeight = () => {
    const m = getMount();
    const fallback = 520;
    const controlsEl = document.getElementById('charts-controls');
    const controlsH = controlsEl ? (controlsEl.clientHeight || controlsEl.getBoundingClientRect().height || 0) : 0;
    // Container height may be too small immediately after show; fallback to viewport
    const containerRect = host?.getBoundingClientRect?.() || { top: 0, height: 0 };
    const containerH = Number(host?.clientHeight || containerRect.height || 0);
    const viewportH = Math.max(
      Number(window?.innerHeight || 0),
      Number(document?.documentElement?.clientHeight || 0),
      fallback
    );
    const top = Number(containerRect.top || 0);
    let base = containerH;
    if (!base || base < 300) {
      // Estimate available space from viewport bottom to container top
      base = Math.max(fallback, viewportH - top - 24);
    }
    // Keep charts a uniform, smaller height (fixed 260px)
    const fixed = 850; // px
    try {
      if (host) {
        // Ensure host expands to accommodate mount height
        host.style.minHeight = `${fixed + controlsH + 8}px`;
      }
      if (m) {
        m.style.height = `${fixed}px`;
        m.style.minHeight = `${fixed}px`;
        m.dataset.fixedHeight = String(fixed);
      }
    } catch(_) {}
    return fixed;
  };

  // Build or get controls container and populate it immediately
  let controls = ensureControls();
  try { populateButtons(controls); } catch (e) { try { console.error('[charts] populateButtons error', e); } catch(_) {} }

  // Do not force visibility here; renderer manages via appState.ui
  try { console.debug('[charts] controls ready'); } catch(_) {}

  // State
  let currentType = (controls.querySelector('.charts-toolbar__btn')?.dataset.type) || 'line';
  let currentInterval = '5m'; // default aggregation step
  try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = currentInterval; } catch(_) {}
  let cleanup = () => {};
  const setActive = (type) => {
    controls.querySelectorAll('.charts-toolbar__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.type === type));
    const intBtns = controls.querySelectorAll('.interval-btn');
    if (intBtns.length) {
      intBtns.forEach(b => b.classList.toggle('is-active', b.dataset.interval === currentInterval));
    }
  };

  const renderSelected = (type) => {
    // Fallback to line renderer to guarantee rendering even if specific type pipeline not provided
    const renderer = getRenderer(type) || getRenderer('line');
    if (!renderer) { try { console.error('[charts] renderer not found for type', type); } catch(_) {} return; }
    let stepMs = intervalToStep(currentInterval);

    // Read base filters for full data range
    const { from, to } = getFilters();
    const baseFromTs = parseUtc(from);
    const baseToTs = parseUtc(to);
    // If a zoom exists, use it only for initial visible window, not for data shaping
    const zr = (typeof window !== 'undefined' && window.__chartsZoomRange) ? window.__chartsZoomRange : null;
    let viewFromTs = zr && Number.isFinite(zr.fromTs) ? zr.fromTs : baseFromTs;
    let viewToTs = zr && Number.isFinite(zr.toTs) ? zr.toTs : baseToTs;
    const now = Date.now();
    // Fallbacks: last 24h if range not set
    if (isNaN(baseFromTs) || isNaN(baseToTs) || baseFromTs >= baseToTs) {
      // fallback base range
      const toDef = now;
      const fromDef = toDef - 24 * 3600e3;
      viewFromTs = fromDef;
      viewToTs = toDef;
    }
    try {
      const diffDays = (viewToTs - viewFromTs) / (24 * 3600e3);
      const diffHours = (viewToTs - viewFromTs) / 3600e3;
      const hasZoom = !!(zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs);
      if (diffHours <= 6 && currentInterval !== '5m') {
        currentInterval = '5m';
        try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = '5m'; } catch(_) {}
        stepMs = intervalToStep(currentInterval);
      } else if (currentInterval === '5m' && diffDays > 5.0001 && !hasZoom) {
        currentInterval = '1h';
        try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = '1h'; } catch(_) {}
        stepMs = intervalToStep(currentInterval);
      }
    } catch(_) {}
    try { console.debug('[charts] renderSelected', { type, interval: currentInterval, from, to, stepMs }); } catch(_) {}
    // Diagnostic: if 'to' is exactly at 00:00:00, API typically treats it as exclusive
    try {
      const toDateObj = new Date(parseUtc(to));
      if (toDateObj.getUTCHours() === 0 && toDateObj.getUTCMinutes() === 0 && toDateObj.getUTCSeconds() === 0) {
        console.warn('[charts] Note: "to" is 00:00:00 (exclusive end). The selected last day may be excluded by API.');
      }
    } catch(_) {}

    // Make sure chart area height is fixed and reused across renders
    const fixedH = ensureFixedChartHeight();
    let data;
    let options;

    const status = (typeof getAppStatus === 'function') ? getAppStatus() : 'idle';
    const md = getMetricsData() || {};
    const fiveRows = Array.isArray(md.five_min_rows) ? md.five_min_rows : [];
    const hourRows = Array.isArray(md.hourly_rows) ? md.hourly_rows : [];
    const useFive = currentInterval === '5m' && fiveRows.length > 0;
    let rows = useFive ? fiveRows : hourRows;
    if (currentInterval === '1h' && (!rows || rows.length === 0) && fiveRows.length > 0) {
      // Engine будет агрегировать 5m в 1h по бинам, отдельная ручная агрегация не требуется
      rows = fiveRows;
    }
    // For 5m: use raw points (no binning). Otherwise: use engine shaping (binning).
    const m = getMount();
    if (!m) { try { console.warn('[charts] mount not found at render time'); } catch(_) {} return; }
    if (currentInterval === '5m') {
      if (!useFive) {
        // Fallback: no 5m rows available -> use engine shaping with 5m bins from hourly rows
        const fiveStep = intervalToStep('5m');
        const { data: shapedData, options: shapedOptions } = shapeChartPayload(rows || [], {
          type,
          fromTs: baseFromTs,
          toTs: baseToTs,
          stepMs: fiveStep,
          height: fixedH,
        });
        const mergedOptions = { ...shapedOptions, stepMs: fiveStep, interval: '5m', noFiveMinData: true };
        renderer(m, shapedData, mergedOptions);
        return;
      }
      const parseRowTs = (raw) => {
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
      };
      const inRange = (t) => Number.isFinite(t) && t >= baseFromTs && t <= baseToTs;
      const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
      // Aggregate by exact timestamp to avoid multiple points with same X (vertical spikes)
      const agg = new Map(); // t(ms) -> { t, tcall, minutes, asrSum, acdSum, asrCnt, acdCnt }
      for (const r of (rows || [])) {
        const t = parseRowTs(r.time || r.slot || r.hour || r.timestamp);
        if (!inRange(t)) continue;
        const tcall = toNum(r.TCall ?? r.TCalls ?? r.total_calls ?? 0) ?? 0;
        const minutes = toNum(r.Min ?? r.Minutes ?? 0) ?? 0;
        const asr = toNum(r.ASR ?? 0);
        const acd = toNum(r.ACD ?? 0);
        let a = agg.get(t);
        if (!a) { a = { t, tcall: 0, minutes: 0, asrSum: 0, acdSum: 0, asrCnt: 0, acdCnt: 0 }; agg.set(t, a); }
        a.tcall += tcall;
        a.minutes += minutes;
        if (asr != null) { a.asrSum += asr; a.asrCnt += 1; }
        if (acd != null) { a.acdSum += acd; a.acdCnt += 1; }
      }
      const pts = Array.from(agg.values()).sort((a,b) => a.t - b.t);
      // Gap bridging: fill missing 5m slots up to 25 minutes with linear interpolation
      const fillLinear = (arr, step = 5 * 60e3, maxSteps = 5) => {
        if (!Array.isArray(arr) || arr.length < 2) return arr || [];
        const out = [arr[0]];
        for (let i = 1; i < arr.length; i++) {
          const prev = out[out.length - 1];
          const cur = arr[i];
          const gap = cur.x - prev.x;
          const steps = Math.round(gap / step) - 1;
          if (steps > 0 && steps <= maxSteps) {
            for (let k = 1; k <= steps; k++) {
              const x = prev.x + k * step;
              const y = prev.y + (cur.y - prev.y) * (k / (steps + 1));
              out.push({ x, y });
            }
          }
          out.push(cur);
        }
        return out;
      };
      const rawData = {
        TCalls: fillLinear(pts.map(p => ({ x: p.t, y: p.tcall }))),
        ASR: fillLinear(pts.map(p => ({ x: p.t, y: p.asrCnt ? (p.asrSum / p.asrCnt) : 0 }))),
        Minutes: fillLinear(pts.map(p => ({ x: p.t, y: p.minutes }))),
        ACD: fillLinear(pts.map(p => ({ x: p.t, y: p.acdCnt ? (p.acdSum / p.acdCnt) : 0 }))),
      };
      const rawOptions = { height: fixedH, fromTs: baseFromTs, toTs: baseToTs, noDefined: true, stepMs, interval: currentInterval, noFiveMinData: false };
      renderer(m, rawData, rawOptions);
    } else {
      // Thin-facade: delegate shaping to the engine (binning)
      const { data: shapedData, options: shapedOptions } = shapeChartPayload(rows || [], {
        type,
        fromTs: baseFromTs,
        toTs: baseToTs,
        stepMs,
        height: fixedH,
      });
      const mergedOptions = { ...shapedOptions, stepMs, interval: currentInterval };
      renderer(m, shapedData, mergedOptions);
    }
    // Post-render: once visible, reflow and adjust height if it changed, then re-render once
    try {
      const tries = Number(m.dataset.heightAdjustTries || 0);
      if (tries < 2) {
        requestAnimationFrame(() => {
          const before = Number(m.dataset.fixedHeight || 0);
          const after = ensureFixedChartHeight();
          if (after && before && Math.abs(after - before) >= 20) {
            m.dataset.heightAdjustTries = String(tries + 1);
            try { cleanup(); } catch(_) {}
            renderSelected(type);
          }
        });
      }
    } catch(_) {}
    // Hide loading overlay and apply fade-in without changing global visibility flags
    try { const overlayEl = document.getElementById('loading-overlay'); if (overlayEl) overlayEl.classList.add('is-hidden'); } catch(_) {}
    try { m.classList.remove('chart-fade--out'); m.classList.add('chart-fade--in'); m.style.opacity = ''; } catch(_) {}

    // Attach zoom overlay only for D3 charts; for ECharts we rely on built-in dataZoom
    try {
      const useEcharts = (typeof window !== 'undefined') && !!window.__chartsUseEcharts;
      if (!useEcharts) {
        const zoomCleanup = attachChartZoom(m, {
          fromTs: baseFromTs,
          toTs: baseToTs,
          onApplyRange: () => {
            // Smooth transition for zoom and rollback
            const el = getMount() || m;
            try {
              el.classList.add('chart-fade');
              el.classList.add('chart-fade--in'); // ensure base state
              // start fade-out
              // force reflow to apply the base class before toggling
              void el.offsetWidth;
              el.classList.remove('chart-fade--in');
              el.classList.add('chart-fade--out');
            } catch(_) {}

            // after short fade-out, cleanup and render, then fade-in
            setTimeout(() => {
              try { cleanup(); } catch(_) {}
              renderSelected(currentType);
              requestAnimationFrame(() => {
                try {
                  el.classList.remove('chart-fade--out');
                  el.classList.add('chart-fade--in');
                  // remove helper classes after transition ends
                  setTimeout(() => {
                    try { el.classList.remove('chart-fade'); } catch(_) {}
                  }, 200);
                } catch(_) {}
              });
            }, 120);
          },
        });
        const prevCleanup = cleanup;
        cleanup = () => {
          try { zoomCleanup && zoomCleanup(); } catch(_) {}
          try { prevCleanup && prevCleanup(); } catch(_) {}
          // Do not blank the chart mount here; next render will overwrite content
        };
      }
    } catch(_) { /* safe ignore */ }

    setActive(type);
  };
  // Helper: render when mount is ready (retry up to ~500ms)
  const renderWhenMountReady = (type, tries = 0) => {
    const m = getMount();
    if (!m) {
      if (tries < 60) {
        return setTimeout(() => renderWhenMountReady(type, tries + 1), 100);
      }
      try { console.warn('[charts] mount not ready after retries, skipping render'); } catch(_) {}
      return;
    }
    renderSelected(type);
  };

  // Do not render immediately on fresh open without state
  // If app already in loading/success (Find pressed before init), force render now
  try {
    const st = (typeof getAppStatus === 'function') ? getAppStatus() : 'idle';
    const hasUrlState = (typeof window !== 'undefined') && window.location && String(window.location.hash || '').startsWith('#state=');
    if (st === 'loading' || st === 'success' || hasUrlState) {
      try { cleanup(); } catch(_) {}
      renderWhenMountReady(currentType);
    }
    // Also honor an explicit request set by Find before subscription
    if (typeof window !== 'undefined' && window.__chartsRenderRequested) {
      try { cleanup(); } catch(_) {}
      renderWhenMountReady(currentType);
    }
  } catch(_) {}
  // Click handlers (type + interval)
  const onClick = (e) => {
    const typeBtn = e.target.closest('.charts-toolbar__btn');
    const intBtn = e.target.closest('.interval-btn');
    if (!typeBtn && !intBtn) return;
    if (typeBtn) {
      currentType = typeBtn.dataset.type;
      cleanup();
      renderWhenMountReady(currentType);
      return;
    }
    if (intBtn) {
      currentInterval = intBtn.dataset.interval;
      try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = currentInterval; } catch(_) {}
      setActive(currentType);
      // Do NOT render immediately to avoid using old granularity; wait for fresh data
      try { publish('charts:intervalChanged', { interval: currentInterval }); } catch(_) {}
      return;
    }
  };
  controls.addEventListener('click', onClick);

  // Re-render when data changes (after Find)
  subscribe('appState:dataChanged', () => {
    // Always re-render if we have ANY data to keep charts visible
    if (!document.getElementById('charts-controls')) {
      controls = ensureControls();
    }
    populateButtons(controls);
    controls.removeEventListener('click', onClick);
    controls.addEventListener('click', onClick);
    cleanup();
    renderWhenMountReady(currentType);
    // Do not force visibility here; filters flow will manage UI via setUI
  });

  // Render on 'success' only
  subscribe('appState:statusChanged', (status) => {
    if (status === 'success') {
      try { cleanup(); } catch(_) {}
      renderWhenMountReady(currentType);
    }
  });

  // When UI indicates charts should be visible, render if we have data
  subscribe('appState:uiChanged', (ui) => {
    if (ui && ui.showCharts) {
      try { cleanup(); } catch(_) {}
      renderWhenMountReady(currentType);
    }
  });

  // Do NOT re-render on filters typing; wait for dataChanged after Find
  subscribe('appState:filtersChanged', () => {
    try { console.debug('[charts] filtersChanged: no re-render (await Find -> dataChanged)'); } catch(_) {}
    // In case charts-controls was replaced externally, re-bind handler and re-assert active state
    const cc = document.getElementById('charts-controls');
    if (cc && cc !== controls) {
      try { controls.removeEventListener('click', onClick); } catch(_) {}
      controls = cc;
      controls.addEventListener('click', onClick);
    }
    setActive(currentType);
  });

  // Explicit hook: allow Find handler to request charts render directly
  subscribe('charts:renderRequest', () => {
    try { cleanup(); } catch(_) {}
    renderWhenMountReady(currentType);
  });

  // If data was loaded before dashboard init completed, render immediately
  try {
    const preloadStatus = typeof getAppStatus === 'function' ? getAppStatus() : 'idle';
    const preloadData = typeof getMetricsData === 'function' ? getMetricsData() : null;
    const hasPreloadedRows = Array.isArray(preloadData?.hourly_rows) ? preloadData.hourly_rows.length > 0 : false;
    if (preloadData && (hasPreloadedRows || preloadStatus === 'success')) {
      cleanup();
      renderWhenMountReady(currentType);
    }
  } catch (_) { /* best-effort */ }
}
