// static/js/init/d3-dashboard.js
// D3 dashboard entry-point: prepares chart area and exposes a simple UI to switch chart types

import { ensureDefaults, getRenderer, listTypes, registerChart } from '../charts/registry.js';
import { subscribe, publish } from '../state/eventBus.js';
import { getFilters, getMetricsData, getAppStatus } from '../state/appState.js';
import { attachChartZoom } from '../charts/zoom/brushZoom.js';
import { initProviderStackControl } from '../charts/controls/providerStackControl.js';
import { shapeChartPayload, intervalToStep } from '../charts/engine/timeSeriesEngine.js';
import { parseUtc } from '../utils/date.js';
import { toast } from '../ui/notify.js';

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
        try { console.debug('[charts] init skipped (already initialized)'); } catch(_) {
          // Ignore debug logging errors
        }
        return;
      }
      window.__chartsInitDone = true;
    }
  } catch(_) {
    // Ignore init guard errors
  }
  try { console.debug('[charts] initD3Dashboard: start'); } catch(_) {
    // Ignore debug logging errors
  }
  await ensureDefaults();
  const { host, mount } = await whenReadyForCharts();
  // Always re-query mount to avoid stale references after DOM patching
  const getMount = () => document.getElementById('chart-area-1');
  try { console.debug('[charts] initD3Dashboard: dom ready', { host: !!host, mount: !!mount }); } catch(_) {
    // Ignore debug logging errors
  }

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
      available = ['line', 'bar', 'stream'];
    }
    controls.innerHTML = '';

    const makeDd = (id, items, selected) => {
      const wrap = document.createElement('div');
      wrap.className = 'charts-dd';
      wrap.id = id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'charts-dd__button';
      btn.textContent = items.find(x => x.value === selected)?.label || items[0].label;
      const menu = document.createElement('ul');
      menu.className = 'charts-dd__menu';
      items.forEach(it => {
        const li = document.createElement('li');
        li.className = 'charts-dd__item';
        li.dataset.value = it.value;
        li.textContent = it.label;
        if (it.value === selected) li.classList.add('is-selected');
        menu.appendChild(li);
      });
      wrap.appendChild(btn);
      wrap.appendChild(menu);
      return wrap;
    };

    const typeItems = available.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }));
    const typeDd = makeDd('chart-type-dropdown', typeItems, (controls.dataset.type || available[0]));
    controls.appendChild(typeDd);

    const stepItems = [
      { value: '5m', label: '5m' },
      { value: '1h', label: '1h' },
      { value: '1d', label: '1d' },
    ];
    const initialInterval = (typeof window !== 'undefined' && window.__chartsCurrentInterval) ? window.__chartsCurrentInterval : (controls.dataset.interval || '1h');
    const stepDd = makeDd('chart-interval-dropdown', stepItems, initialInterval);
    controls.appendChild(stepDd);

    try { console.debug('[charts] controls populated (dropdowns)'); } catch(_) {
      // Ignore debug logging errors
    }
    try { initProviderStackControl(); } catch(_) {
      // Ignore provider control init errors
    }
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
    } catch(_) {
      // Ignore height calculation errors
    }
    return fixed;
  };

  // Build or get controls container and populate it immediately
  let controls = ensureControls();
  try { populateButtons(controls); } catch (e) { try { console.error('[charts] populateButtons error', e); } catch(_) {
      // Ignore error logging errors
    } }

  // Do not force visibility here; renderer manages via appState.ui
  try { console.debug('[charts] controls ready'); } catch(_) {
    // Ignore debug logging errors
  }

  // State
  let currentType = (controls.dataset.type) || 'line';
  let currentInterval = '1h'; // default aggregation step for all charts
  try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = currentInterval; } catch(_) {
    // Ignore global variable update errors
  }
  let cleanup = () => {};
  const setActive = (type) => {
    try {
      const typeDd = controls.querySelector('#chart-type-dropdown');
      const btn = typeDd?.querySelector('.charts-dd__button');
      const items = Array.from(typeDd?.querySelectorAll('.charts-dd__item') || []);
      items.forEach(li => li.classList.toggle('is-selected', li.dataset.value === type));
      if (btn) btn.textContent = (items.find(li => li.dataset.value === type)?.textContent) || btn.textContent;
      // unify color to main blue and drop per-type color classes
      if (btn) btn.style.color = '#4f86ff';
      if (typeDd) typeDd.classList.remove('is-line','is-bar','is-heatmap','is-hybrid');
    } catch(_) {
      // Ignore UI update errors
    }
    try {
      const stepDd = controls.querySelector('#chart-interval-dropdown');
      const btn = stepDd?.querySelector('.charts-dd__button');
      const items = Array.from(stepDd?.querySelectorAll('.charts-dd__item') || []);
      items.forEach(li => li.classList.toggle('is-selected', li.dataset.value === currentInterval));
      if (btn) btn.textContent = (items.find(li => li.dataset.value === currentInterval)?.textContent) || btn.textContent;
      // unify color to main blue and drop per-interval color classes
      if (btn) btn.style.color = '#4f86ff';
      if (stepDd) stepDd.classList.remove('is-5m','is-1h','is-1d');
    } catch(_) {
      // Ignore UI update errors
    }
    try { controls.dataset.type = type; controls.dataset.interval = currentInterval; } catch(_) {
      // Ignore dataset update errors
    }
    // Hide interval dropdown for stream type; show otherwise
    try {
      const stepDd = controls.querySelector('#chart-interval-dropdown');
      if (stepDd) stepDd.style.display = (type === 'stream') ? 'none' : '';
    } catch(_) {
      // Ignore step dropdown toggle errors
    }
    // Remove stream-specific controls when not in stream mode
    try {
      if (type !== 'stream') {
        const sc = controls.querySelector('#stream-controls');
        if (sc) sc.remove();
      }
    } catch(_) {
      // Ignore removal errors
    }
  };

  const renderSelected = (type) => {
    // Fallback to line renderer to guarantee rendering even if specific type pipeline not provided
    const renderer = getRenderer(type) || getRenderer('line');
    if (!renderer) { console.error('[charts] renderer not found for type', type); return; }
    let stepMs = intervalToStep(currentInterval);

    // Read base filters for full data range
    const { from, to } = getFilters();
    const baseFromTs = parseUtc(from);
    const baseToTs = parseUtc(to);
    // If a zoom exists, use it only for initial visible window, not for data shaping
    const zr = (typeof window !== 'undefined' && window.__chartsZoomRange) ? window.__chartsZoomRange : null;
    try {
      // Disable auto interval switching on initial render; keep user's selection
      const hasZoom = !!(zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs);
      if (!hasZoom) {
        stepMs = intervalToStep(currentInterval);
      }
    } catch(_) {
      // Ignore auto interval switching errors
    }
    try { console.debug('[charts] renderSelected', { type, interval: currentInterval, from, to, stepMs }); } catch(_) {
      // Ignore debug logging errors
    }
    // Diagnostic: if 'to' is exactly at 00:00:00, API typically treats it as exclusive
    try {
      const toDateObj = new Date(parseUtc(to));
      if (toDateObj.getUTCHours() === 0 && toDateObj.getUTCMinutes() === 0 && toDateObj.getUTCSeconds() === 0) {
        console.warn('[charts] Note: "to" is 00:00:00 (exclusive end). The selected last day may be excluded by API.');
      }
    } catch(_) {
      // Ignore diagnostic check errors
    }

    // Make sure chart area height is fixed and reused across renders
    const fixedH = ensureFixedChartHeight();
    
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
    if (!m) { console.warn('[charts] mount not found at render time'); return; }
    // Stream: render as a single full-area chart with internal dropdowns; no interval control
    if (type === 'stream') {
      // IMPORTANT: Only global inputs (from/to) define the axis window; zoom is view-only (dataZoom)
      const streamFromTs = baseFromTs;
      const streamToTs = baseToTs;
      // Prefer 5-minute data when available for smoother curves; fallback to hourly
      const { data: shapedData, options: shapedOptions } = shapeChartPayload((fiveRows && fiveRows.length) ? fiveRows : hourRows, {
        type,
        fromTs: streamFromTs,
        toTs: streamToTs,
        stepMs,
        height: fixedH,
      });
      const mergedOptions = { ...shapedOptions };
      renderer(m, shapedData, mergedOptions);
      return;
    }
    if (currentInterval === '5m') {
      if (!useFive) {
        // Нет 5-минутных данных — переключаем на 1h без «подделки» 5m из часовых точек
        toast('5-minute data is not available for the selected range. Using 1 hour.', { type: 'info', duration: 2500 });
        currentInterval = '1h';
        try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = currentInterval; } catch(_) {
          // Ignore global variable update
        }
        try { publish('charts:intervalChanged', { interval: currentInterval }); } catch(_) {
          // Ignore event publishing errors
        }
        const step1h = intervalToStep('1h');
        const { data: shapedData, options: shapedOptions } = shapeChartPayload(hourRows || [], {
          type,
          fromTs: baseFromTs,
          toTs: baseToTs,
          stepMs: step1h,
          height: fixedH,
        });
        const mergedOptions = { ...shapedOptions, stepMs: step1h, interval: '1h',
          perProvider: !!(typeof window !== 'undefined' && window.__chartsBarPerProvider),
          providerRows: hourRows || [],
          labels: (md && md.labels) || {} // use backend labels
        };
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
      const rawOptions = { height: fixedH, fromTs: baseFromTs, toTs: baseToTs, noDefined: true, stepMs, interval: currentInterval, noFiveMinData: false,
        perProvider: !!(typeof window !== 'undefined' && window.__chartsBarPerProvider),
        providerRows: rows || [],
        labels: (md && md.labels) || {} // use backend labels
      };
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
      const mergedOptions = { ...shapedOptions, stepMs, interval: currentInterval,
        perProvider: !!(typeof window !== 'undefined' && window.__chartsBarPerProvider),
        providerRows: rows || [],
        labels: (md && md.labels) || {} // use backend labels
      };
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
            try { cleanup(); } catch(_) {
              // Ignore cleanup errors
            }
            renderSelected(type);
          }
        });
      }
    } catch(_) {
      // Ignore height adjustment errors
    }
    // Hide loading overlay and apply fade-in without changing global visibility flags
    try { const overlayEl = document.getElementById('loading-overlay'); if (overlayEl) overlayEl.classList.add('is-hidden'); } catch(_) {
      // Ignore overlay hide errors
    }
    try { m.classList.remove('chart-fade--out'); m.classList.add('chart-fade--in'); m.style.opacity = ''; } catch(_) {
      // Ignore fade animation errors
    }

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
            } catch(_) {
              // Ignore fade animation errors
            }

            // after short fade-out, cleanup and render, then fade-in
            setTimeout(() => {
              try { cleanup(); } catch(_) {
                // Ignore cleanup errors
              }
              renderSelected(currentType);
              requestAnimationFrame(() => {
                try {
                  el.classList.remove('chart-fade--out');
                  el.classList.add('chart-fade--in');
                  // remove helper classes after transition ends
                  setTimeout(() => {
                    try { el.classList.remove('chart-fade'); } catch(error) {
                      console.error('Error removing helper classes:', error);
                    }
                  }, 200);
                } catch(error) {
                  console.error('Error removing helper classes:', error);
                }
              });
            }, 120);
          },
        });
        const prevCleanup = cleanup;
        cleanup = () => {
          try { zoomCleanup && zoomCleanup(); } catch(_) {
            // Ignore zoom cleanup errors
          }
          try { prevCleanup && prevCleanup(); } catch(_) {
            // Ignore cleanup errors
          }
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
      console.warn('[charts] mount not ready after retries, skipping render');
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
      try { cleanup(); } catch(_) {
        // Ignore cleanup errors
      }
      renderWhenMountReady(currentType);
    }
    // Also honor an explicit request set by Find before subscription
    if (typeof window !== 'undefined' && window.__chartsRenderRequested) {
      try { cleanup(); } catch(_) {
        // Ignore cleanup errors
      }
      renderWhenMountReady(currentType);
    }
  } catch(_) {
    // Ignore initial render errors
  }
  const closeAllDd = () => {
    try { controls.querySelectorAll('.charts-dd').forEach(dd => dd.classList.remove('is-open')); } catch(_) {
      // Ignore dropdown close errors
    }
  };
  const onControlsClick = (e) => {
    const btn = e.target.closest('.charts-dd__button');
    const item = e.target.closest('.charts-dd__item');
    if (btn) {
      const dd = btn.parentElement;
      const open = dd.classList.contains('is-open');
      closeAllDd();
      if (!open) dd.classList.add('is-open');
      return;
    }
    if (item) {
      const dd = item.closest('.charts-dd');
      const value = String(item.dataset.value || '');
      if (dd?.id === 'chart-type-dropdown') {
        if ((value || 'line') === currentType) { closeAllDd(); return; }
        currentType = value || 'line';
        closeAllDd();
        setActive(currentType);
        try { initProviderStackControl(); } catch(_) {
          // Ignore provider control init errors
        }
        cleanup();
        renderWhenMountReady(currentType);
        return;
      }
      if (dd?.id === 'chart-interval-dropdown') {
        const requested = value || '1h';
        if (requested === currentInterval) { closeAllDd(); return; }
        try {
            const zr = (typeof window !== 'undefined') ? window.__chartsZoomRange : null;
            let fromTs, toTs;
            if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs) {
              fromTs = zr.fromTs; toTs = zr.toTs;
            } else {
              const { from, to } = getFilters();
              fromTs = parseUtc(from); toTs = parseUtc(to);
            }
            const diffDays = (toTs - fromTs) / (24 * 3600e3);
            if (requested === '5m' && diffDays > 5.0001) {
              toast('5-minute interval is available only for ranges up to 5 days. Switching to 1 hour.', { type: 'warning', duration: 3500 });
              currentInterval = '1h';
            } else {
              currentInterval = requested;
            }
        } catch(_) { currentInterval = requested; }
        try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = currentInterval; } catch(_) {
          // Ignore global variable update errors
        }
        closeAllDd();
        setActive(currentType);
        try { publish('charts:intervalChanged', { interval: currentInterval }); } catch(_) {
          // Ignore event publishing errors
        }
        return;
      }
    }
  };
  controls.addEventListener('click', onControlsClick);

  // Sync UI when interval changes programmatically (e.g., zoom > 5 days forces 1h)
  subscribe('charts:intervalChanged', (payload) => {
    try {
      const interval = payload && payload.interval ? String(payload.interval) : '';
      if (!interval) return;
      currentInterval = interval;
      try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = currentInterval; } catch(_) {
        // Ignore global variable update errors
      }
      setActive(currentType);
    } catch(_) {
      // Ignore interval change handler errors
    }
  });

  // Re-render when data changes (after Find)
  subscribe('appState:dataChanged', () => {
    // Always re-render if we have ANY data to keep charts visible
    if (!document.getElementById('charts-controls')) {
      controls = ensureControls();
    }
    populateButtons(controls);
    controls.removeEventListener('click', onControlsClick);
    controls.addEventListener('click', onControlsClick);
    try { initProviderStackControl(); } catch(_) {
      // Ignore provider control init errors
    }
    // Reflect the current active type/interval immediately
    setActive(currentType);
    cleanup();
    renderWhenMountReady(currentType);
    // Do not force visibility here; filters flow will manage UI via setUI
  });

  // Render on 'success' only
  subscribe('appState:statusChanged', (status) => {
    try { if (typeof window !== 'undefined' && window.__summaryFetchInProgress) return; } catch(_) {
      // Ignore summary fetch check errors
    }
    if (status === 'success') {
      setActive(currentType);
      try { initProviderStackControl(); } catch(_) {
        // Ignore provider control init errors
      }
      try { cleanup(); } catch(_) {
        // Ignore cleanup errors
      }
      renderWhenMountReady(currentType);
    }
  });

  // When UI indicates charts should be visible, render if we have data
  subscribe('appState:uiChanged', (ui) => {
    if (ui && ui.showCharts) {
      setActive(currentType);
      try { initProviderStackControl(); } catch(_) {
        // Ignore provider control init errors
      }
      try { cleanup(); } catch(_) {
        // Ignore cleanup errors
      }
      renderWhenMountReady(currentType);
    }
  });

  // Do NOT re-render on filters typing; wait for dataChanged after Find
  subscribe('appState:filtersChanged', () => {
    try { console.debug('[charts] filtersChanged: no re-render (await Find -> dataChanged)'); } catch(_) {
      // Ignore debug logging errors
    }
    // In case charts-controls was replaced externally, re-bind handler and re-assert active state
    const cc = document.getElementById('charts-controls');
    if (cc && cc !== controls) {
      try { controls.removeEventListener('click', onControlsClick); } catch(_) {
        // Ignore event removal errors
      }
      controls = cc;
      controls.addEventListener('click', onControlsClick);
    }
    setActive(currentType);
  });

  // Explicit hook: allow Find handler to request charts render directly
  subscribe('charts:renderRequest', () => {
    try { cleanup(); } catch(_) {
      // Ignore cleanup errors
    }
    renderWhenMountReady(currentType);
  });

  // Re-render current chart when per-provider toggle changes
  subscribe('charts:bar:perProviderChanged', (_payload) => {
    try {
      if (controls?.dataset?.type === 'bar') {
        cleanup();
        renderWhenMountReady('bar');
      }
    } catch(_) {
      // Ignore provider change handler errors
    }
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
