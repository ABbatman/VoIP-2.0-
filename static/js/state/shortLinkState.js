// static/js/state/shortLinkState.js
// Responsibility: Short link state persistence (URL param "s")
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { getDateManuallyCommittedAt } from './runtimeFlags.js';
import { setFullState as setTableState, getFullTableState } from './tableState.js';
import { isReverseMode, setReverseMode, getMetricsData, getFullState as getAppFullState, updateFullState as setAppFullState } from './appState.js';
import { buildFilterParams, populateFiltersFromState } from '../dom/filter-helpers.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const API_SAVE_URL = '/api/state';
const API_LOAD_URL = '/api/state/';
const URL_PARAM_KEY = 's';
const MANUAL_COMMIT_THRESHOLD_MS = 5000;
const STATE_VERSION = '2.0';

// volatile keys to exclude from persistence
const VOLATILE_TABLE_KEYS = ['yColumnsVisible', 'multiSort'];
const VOLATILE_PERF_KEYS = ['enableVirtualization', 'enableLazyLoading'];
const VOLATILE_BEHAVIOR_KEYS = ['enableDragAndDrop'];
const VOLATILE_SETTINGS_KEYS = ['debugMode', 'performanceMonitoring'];

// ─────────────────────────────────────────────────────────────
// Helpers: URL
// ─────────────────────────────────────────────────────────────

function getShortIdFromUrl() {
  return new URLSearchParams(window.location.search).get(URL_PARAM_KEY) || null;
}

function updateUrlWithShortId(shortId) {
  const url = new URL(window.location.href);
  url.searchParams.set(URL_PARAM_KEY, shortId);
  url.hash = '';
  history.replaceState(null, '', url.toString());
}

function clearShortIdFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(URL_PARAM_KEY);
  url.hash = '';
  history.replaceState(null, '', url.toString());
}

// ─────────────────────────────────────────────────────────────
// Helpers: State cleanup
// ─────────────────────────────────────────────────────────────

function cleanTableState(tableState) {
  // use indexed loops instead of forEach
  for (let i = 0; i < VOLATILE_TABLE_KEYS.length; i++) {
    delete tableState[VOLATILE_TABLE_KEYS[i]];
  }
  if (tableState.performance) {
    for (let i = 0; i < VOLATILE_PERF_KEYS.length; i++) {
      delete tableState.performance[VOLATILE_PERF_KEYS[i]];
    }
  }
  if (tableState.behavior) {
    for (let i = 0; i < VOLATILE_BEHAVIOR_KEYS.length; i++) {
      delete tableState.behavior[VOLATILE_BEHAVIOR_KEYS[i]];
    }
  }
}

function cleanAppState(appState) {
  if (appState.settings) {
    for (let i = 0; i < VOLATILE_SETTINGS_KEYS.length; i++) {
      delete appState.settings[VOLATILE_SETTINGS_KEYS[i]];
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers: State collection/application
// ─────────────────────────────────────────────────────────────

function collectState() {
  const tableState = getFullTableState();
  const appState = getAppFullState();

  cleanTableState(tableState);
  cleanAppState(appState);

  return {
    isReversed: isReverseMode(),
    tableState,
    appState,
    filterParams: buildFilterParams(),
    timestamp: Date.now(),
    version: STATE_VERSION
  };
}

function applyState(state) {
  if (!state) return;

  const isNewFormat = state.version === STATE_VERSION || state.appState;

  if (state.appState) setAppFullState(state.appState);

  if (state.tableState) {
    cleanTableState(state.tableState);
    setTableState(state.tableState);
  }

  if (state.filterParams) populateFiltersFromState(state.filterParams);

  if (typeof state.isReversed === 'boolean') {
    setReverseMode(state.isReversed);
  }
}

function isValidFilterParams(params) {
  if (!params?.from || !params?.to) return false;
  if (params.from === ' ' || params.to === ' ') return false;
  if (params.from.includes('undefined') || params.to.includes('undefined')) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export async function saveStateToShortLink() {
  if (!getMetricsData()) {
    clearShortIdFromUrl();
    return null;
  }

  const state = collectState();
  if (!isValidFilterParams(state.filterParams)) return null;

  try {
    const response = await fetch(API_SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });

    if (!response.ok) return null;

    const { id: shortId } = await response.json();
    if (shortId) {
      updateUrlWithShortId(shortId);
      return shortId;
    }
  } catch (e) {
    logError(ErrorCategory.STATE, 'saveStateToShortLink', e);
  }

  return null;
}

export async function loadStateFromShortLink() {
  const shortId = getShortIdFromUrl();
  if (!shortId) return null;

  // skip if data already loaded
  if (getMetricsData()) return null;

  // skip if recent manual commit
  const committedAt = getDateManuallyCommittedAt();
  if (committedAt && (Date.now() - committedAt) < MANUAL_COMMIT_THRESHOLD_MS) {
    return null;
  }

  try {
    const response = await fetch(API_LOAD_URL + shortId);

    if (response.status === 404) {
      clearShortIdFromUrl();
      return null;
    }

    if (!response.ok) return null;

    const state = await response.json();
    applyState(state);
    return state;
  } catch (e) {
    logError(ErrorCategory.STATE, 'loadStateFromShortLink', e);
    return null;
  }
}

export const hasShortLinkId = () => !!getShortIdFromUrl();
export const getCurrentShortId = () => getShortIdFromUrl();

export function initShortLinkState() {
  window.addEventListener('popstate', loadStateFromShortLink);
}
