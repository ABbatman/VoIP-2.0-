// static/js/state/shortLinkState.js
// Module for short link state persistence (replaces long URL hash encoding)
import { logError, ErrorCategory } from '../utils/errorLogger.js';

import {
  setFullState as setTableState,
  getFullTableState,
} from "./tableState.js";
import {
  isReverseMode,
  setReverseMode,
  getMetricsData,
  getFullState as getAppFullState,
  updateFullState as setAppFullState,
} from "./appState.js";
import {
  buildFilterParams,
  populateFiltersFromState,
} from "../dom/filter-helpers.js";

const API_SAVE_URL = "/api/state";
const API_LOAD_URL = "/api/state/";
const URL_PARAM_KEY = "s";

/**
 * Collect current UI state for persistence.
 * Reuses existing state getters.
 */
function collectState() {
  const tableState = getFullTableState();
  const appState = getAppFullState();

  // exclude volatile settings (same as urlState.js)
  delete tableState.yColumnsVisible;
  delete tableState.multiSort;
  delete tableState.performance?.enableVirtualization;
  delete tableState.performance?.enableLazyLoading;
  delete tableState.behavior?.enableDragAndDrop;
  delete appState.settings?.debugMode;
  delete appState.settings?.performanceMonitoring;

  const filterParams = buildFilterParams();

  return {
    isReversed: isReverseMode(),
    tableState,
    appState,
    filterParams,
    timestamp: Date.now(),
    version: "2.0",
  };
}

/**
 * Apply loaded state to UI modules.
 * Reuses existing state setters.
 */
function applyState(state) {
  if (!state) return;

  // new format
  if (state.version === "2.0" || state.appState) {
    if (state.appState) {
      setAppFullState(state.appState);
    }
    if (state.tableState) {
      delete state.tableState.yColumnsVisible;
      delete state.tableState.multiSort;
      setTableState(state.tableState);
    }
    if (state.filterParams) {
      populateFiltersFromState(state.filterParams);
    }
    if (typeof state.isReversed === "boolean") {
      setReverseMode(state.isReversed);
    }
  } else {
    // legacy format
    if (state.filterParams) {
      populateFiltersFromState(state.filterParams);
    }
    if (typeof state.isReversed === "boolean") {
      setReverseMode(state.isReversed);
    }
    if (state.tableState) {
      delete state.tableState.yColumnsVisible;
      delete state.tableState.multiSort;
      setTableState(state.tableState);
    }
  }

  // log state age
  if (state.timestamp) {
    const age = Date.now() - state.timestamp;
    const ageMinutes = Math.floor(age / (1000 * 60));
    console.log(`⏰ State age: ${ageMinutes} minutes`);
  }
}

/**
 * Get short link ID from URL query param.
 */
function getShortIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get(URL_PARAM_KEY) || null;
}

/**
 * Update URL with short link ID (no page reload).
 */
function updateUrlWithShortId(shortId) {
  const url = new URL(window.location.href);
  url.searchParams.set(URL_PARAM_KEY, shortId);
  // remove hash if present
  url.hash = "";
  history.replaceState(null, "", url.toString());
}

/**
 * Clear short link from URL.
 */
function clearShortIdFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(URL_PARAM_KEY);
  url.hash = "";
  history.replaceState(null, "", url.toString());
}

/**
 * Save current state to backend and update URL with short ID.
 */
export async function saveStateToShortLink() {
  const metricsData = getMetricsData();

  if (!metricsData) {
    clearShortIdFromUrl();
    return null;
  }

  const state = collectState();

  // validate filter params
  if (
    !state.filterParams.from ||
    !state.filterParams.to ||
    state.filterParams.from === " " ||
    state.filterParams.to === " " ||
    state.filterParams.from.includes("undefined") ||
    state.filterParams.to.includes("undefined")
  ) {
    return null;
  }

  try {
    const response = await fetch(API_SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      console.error("Failed to save state:", response.status);
      return null;
    }

    const data = await response.json();
    const shortId = data.id;

    if (shortId) {
      updateUrlWithShortId(shortId);
      console.log(`🔗 State saved with short ID: ${shortId}`);
      return shortId;
    }
  } catch (e) {
    console.error("Error saving state to short link:", e);
  }

  return null;
}

/**
 * Load state from backend by short ID and apply to UI.
 * Returns loaded state or null.
 */
export async function loadStateFromShortLink() {
  const shortId = getShortIdFromUrl();

  if (!shortId) {
    return null;
  }

  // skip if data already loaded (avoid overwrite)
  const currentMetricsData = getMetricsData();
  if (currentMetricsData) {
    return null;
  }

  // skip if manual date commit was recent
  try {
    if (window._dateManuallyCommittedAt) {
      const age = Date.now() - window._dateManuallyCommittedAt;
      if (age >= 0 && age < 5000) {
        console.log("⏳ loadStateFromShortLink: Skip due to recent manual commit");
        return null;
      }
    }
  } catch (e) { logError(ErrorCategory.STATE, 'shortLinkState', e);
    // ignore
  }

  try {
    const response = await fetch(API_LOAD_URL + shortId);

    if (response.status === 404) {
      console.log(`🔗 Short link not found: ${shortId}, using defaults`);
      clearShortIdFromUrl();
      return null;
    }

    if (!response.ok) {
      console.error("Failed to load state:", response.status);
      return null;
    }

    const state = await response.json();
    console.log(`🔗 State loaded from short ID: ${shortId}`);
    applyState(state);
    return state;
  } catch (e) {
    console.error("Error loading state from short link:", e);
    return null;
  }
}

/**
 * Check if URL has a short link ID.
 */
export function hasShortLinkId() {
  return !!getShortIdFromUrl();
}

/**
 * Get current short link ID from URL (if any).
 */
export function getCurrentShortId() {
  return getShortIdFromUrl();
}

/**
 * Initialize short link state module.
 * Sets up event listeners for browser navigation.
 */
export function initShortLinkState() {
  window.addEventListener("popstate", () => {
    console.log("Browser navigation detected, loading state from short link");
    loadStateFromShortLink();
  });

  console.log("Short link state synchronization initialized");
}
