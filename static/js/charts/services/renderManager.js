// static/js/charts/services/renderManager.js
// Responsibility: Orchestrate chart rendering
import { ensureDefaults, getRenderer } from '../registry.js';
import { getFilters, getMetricsData } from '../../state/appState.js';
import { subscribe } from '../../state/eventBus.js';
import { shapeChartPayload, intervalToStep } from '../engine/timeSeriesEngine.js';
import { parseUtc } from '../../utils/date.js';
import { ensureFixedChartHeight } from './layout.js';
import { getChartsCurrentInterval, setChartsCurrentInterval } from '../../state/runtimeFlags.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';
import { showLoadingOverlay, hideLoadingOverlay } from '../../dom/ui-feedback.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEFAULT_TYPE = 'line';
const DEFAULT_INTERVAL = '1h';
const MOUNT_ID = 'chart-area-1';
const HOST_ID = 'charts-container';

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let currentType = DEFAULT_TYPE;
let initialized = false;

// ─────────────────────────────────────────────────────────────
// DOM helpers
// ─────────────────────────────────────────────────────────────

function getMount() {
  return document.getElementById(MOUNT_ID);
}

function getHost() {
  return document.getElementById(HOST_ID);
}

// ─────────────────────────────────────────────────────────────
// Data helpers
// ─────────────────────────────────────────────────────────────

function getDataRows(metricsData) {
  const fiveRows = Array.isArray(metricsData?.five_min_rows) ? metricsData.five_min_rows : [];
  const hourRows = Array.isArray(metricsData?.hourly_rows) ? metricsData.hourly_rows : [];

  // prefer 5-minute rows as single source of truth
  return fiveRows.length ? fiveRows : hourRows;
}

function buildRenderOptions({ options, stepMs, interval, metricsData, rows }) {
  return {
    ...options,
    stepMs,
    interval,
    labels: metricsData?.labels || {},
    providerRows: rows
  };
}

// ─────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────

function handleTypeChanged(payload) {
  try {
    currentType = String(payload?.type || DEFAULT_TYPE);
  } catch (e) {
    logError(ErrorCategory.CHART, 'renderManager:typeChanged', e);
    currentType = DEFAULT_TYPE;
  }
  render(currentType);
}

function handleIntervalChanged() {
  render(currentType);
}

function handleDataChanged() {
  render(currentType);
}

function handleStatusChanged(status) {
  if (status === 'success') {
    render(currentType);
  }
}

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

function initOnce() {
  if (initialized) return;
  initialized = true;

  // sync initial interval
  if (!getChartsCurrentInterval()) {
    setChartsCurrentInterval(DEFAULT_INTERVAL);
  }

  // subscribe to events
  subscribe('charts:typeChanged', handleTypeChanged);
  subscribe('charts:intervalChanged', handleIntervalChanged);
  subscribe('appState:dataChanged', handleDataChanged);
  subscribe('appState:statusChanged', handleStatusChanged);
}

// ─────────────────────────────────────────────────────────────
// Main render
// ─────────────────────────────────────────────────────────────

export async function render(type) {
  initOnce();
  currentType = type || currentType || DEFAULT_TYPE;

  showLoadingOverlay();

  try {
    await ensureDefaults();
  } catch (e) {
    logError(ErrorCategory.CHART, 'renderManager:ensureDefaults', e);
  }

  const host = getHost();
  const mount = getMount();
  if (!host || !mount) {
    hideLoadingOverlay();
    return;
  }

  const renderer = getRenderer(currentType) || getRenderer(DEFAULT_TYPE);
  if (!renderer) {
    hideLoadingOverlay();
    return;
  }

  try {
    // get time range
    const { from, to } = getFilters();
    const fromTs = parseUtc(from);
    const toTs = parseUtc(to);

    // get interval and step
    const interval = getChartsCurrentInterval() || DEFAULT_INTERVAL;
    const stepMs = intervalToStep(interval);

    // get data
    const metricsData = getMetricsData() || {};
    const rows = getDataRows(metricsData);

    // compute layout
    const height = ensureFixedChartHeight(host, mount);

    // shape payload
    const { data, options } = shapeChartPayload(rows, {
      type: currentType,
      fromTs,
      toTs,
      stepMs,
      height
    });

    // build final options
    const renderOptions = buildRenderOptions({
      options,
      stepMs,
      interval,
      metricsData,
      rows
    });

    await renderer(mount, data, renderOptions);
  } finally {
    hideLoadingOverlay();
  }
}

// init on module load
initOnce();

export const renderManager = { render };
