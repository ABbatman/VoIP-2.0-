// static/js/charts/services/renderManager.js
// render manager: choose renderer and orchestrate chart render

import { ensureDefaults, getRenderer } from '../registry.js';
import { getFilters, getMetricsData } from '../../state/appState.js';
import { subscribe } from '../../state/eventBus.js';
import { shapeChartPayload, intervalToStep } from '../engine/timeSeriesEngine.js';
import { parseUtc } from '../../utils/date.js';
import { ensureFixedChartHeight } from './layout.js';

function getMount() { return document.getElementById('chart-area-1'); }
function getHost() { return document.getElementById('charts-container'); }

let currentType = 'line';
let currentInterval = '1h';
let initialized = false;

function initOnce() {
  if (initialized) return;
  initialized = true;
  try { if (typeof window !== 'undefined' && !window.__chartsCurrentInterval) window.__chartsCurrentInterval = currentInterval; } catch(_) {}
  // minimal subscriptions (no business logic here)
  subscribe('charts:typeChanged', (payload) => {
    try { currentType = String(payload?.type || 'line'); } catch(_) { currentType = 'line'; }
    render(currentType);
  });
  subscribe('charts:intervalChanged', () => { render(currentType); });
  subscribe('appState:dataChanged', () => { render(currentType); });
  subscribe('appState:statusChanged', (status) => { if (status === 'success') render(currentType); });
}

// no pickRowsByInterval; engine handles shaping

export async function render(type) {
  initOnce();
  currentType = type || currentType || 'line';
  try { await ensureDefaults(); } catch(_) {}

  const host = getHost();
  const mount = getMount();
  if (!host || !mount) return;

  const fixedH = ensureFixedChartHeight(host, mount);
  const renderer = getRenderer(currentType) || getRenderer('line');
  if (!renderer) return;

  const { from, to } = getFilters();
  const fromTs = parseUtc(from);
  const toTs = parseUtc(to);
  const interval = (typeof window !== 'undefined' && window.__chartsCurrentInterval) ? String(window.__chartsCurrentInterval) : currentInterval;
  const stepMs = intervalToStep(interval);
  const md = getMetricsData() || {};
  const fiveRows = Array.isArray(md.five_min_rows) ? md.five_min_rows : [];
  const hourRows = Array.isArray(md.hourly_rows) ? md.hourly_rows : [];
  const rows = (interval === '5m') ? (fiveRows.length ? fiveRows : hourRows) : (hourRows.length ? hourRows : fiveRows);
  const { data, options } = shapeChartPayload(rows || [], { type: currentType, fromTs, toTs, stepMs, height: fixedH });
  const merged = { ...options, stepMs, interval, labels: (md && md.labels) || {}, providerRows: rows || [] };
  renderer(mount, data, merged);
}

// no post-effects; renderers handle visuals

// no zoom attach here; renderers handle zoom (ECharts)

// no 5m raw builder here; engine handles shaping

// init subscriptions on module load
initOnce();

export const renderManager = { render };
