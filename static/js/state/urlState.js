// static/js/state/urlState.js

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
// --- REMOVED: State modules should not call DOM functions ---

function encodeState(state) {
  try {
    const jsonString = JSON.stringify(state);
    return btoa(jsonString);
  } catch (e) {
    console.error("Failed to encode state:", e);
    return "";
  }
}

function decodeState(encodedState) {
  try {
    const jsonString = atob(encodedState);
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Failed to decode state from URL:", e);
    return null;
  }
}

/**
 * Gathers the current relevant state and saves it to the URL hash.
 * Now includes comprehensive app and table state.
 */
export function saveStateToUrl() {
  const metricsData = getMetricsData();

  if (!metricsData) {
    if (window.location.hash) {
      history.replaceState(
        "",
        document.title,
        window.location.pathname + window.location.search
      );
    }
    return;
  }

  // Get comprehensive state from both modules
  const tableState = getFullTableState();
  const appState = getAppFullState();
  
  // Do not persist Y-columns visibility; default should be visible on refresh
  delete tableState.yColumnsVisible;
  // Do not persist sorting to keep default order on refresh
  delete tableState.multiSort;
  
  // Do not persist some sensitive settings that should reset on refresh
  delete tableState.performance.enableVirtualization;
  delete tableState.performance.enableLazyLoading;
  delete tableState.behavior.enableDragAndDrop;
  
  // Do not persist some app settings that should reset on refresh
  delete appState.settings.debugMode;
  delete appState.settings.performanceMonitoring;

  // Build filter params and validate them before saving
  const filterParams = buildFilterParams();

  // Only save state if we have valid date/time values
  if (!filterParams.from || !filterParams.to ||
      filterParams.from === " " || filterParams.to === " " ||
      filterParams.from.includes("undefined") || filterParams.to.includes("undefined")) {
    return;
  }

  const stateToSave = {
    isReversed: isReverseMode(),
    tableState,
    appState,
    filterParams,
    timestamp: Date.now(),
    version: "2.0" // Version for state compatibility
  };

  const encodedState = encodeState(stateToSave);
  history.replaceState(null, "", `#state=${encodedState}`);
}

/**
 * Loads state from the URL hash and applies it to the application state.
 * Now handles comprehensive app and table state.
 * @returns {object|null} The loaded state object or null if nothing was loaded.
 */
export function loadStateFromUrl() {
  const hash = window.location.hash;
  if (hash && hash.startsWith("#state=")) {
    const encodedState = hash.substring(7);
    const decodedState = decodeState(encodedState);

    // Не перезагружаем состояние, если данные уже есть (избежать перезаписи)
    const currentMetricsData = getMetricsData();
    if (currentMetricsData && decodedState) {
      return decodedState;
    }

    if (decodedState) {
      // Защита от перезаписи сразу после ручного ввода
      try {
        if (window._dateManuallyCommittedAt) {
          const age = Date.now() - window._dateManuallyCommittedAt;
          if (age >= 0 && age < 5000) {
            console.log("⏳ loadStateFromUrl: Skip applying filters due to recent manual commit");
            return decodedState;
          }
        }
      } catch (_) {}

      // Новый формат
      if (decodedState.version === "2.0" || decodedState.appState) {
        if (decodedState.appState) {
          setAppFullState(decodedState.appState);
        }
        if (decodedState.tableState) {
          if (Object.prototype.hasOwnProperty.call(decodedState.tableState, 'yColumnsVisible')) {
            delete decodedState.tableState.yColumnsVisible;
          }
          if (Object.prototype.hasOwnProperty.call(decodedState.tableState, 'multiSort')) {
            delete decodedState.tableState.multiSort;
          }
          setTableState(decodedState.tableState);
        }
        if (decodedState.filterParams) {
          populateFiltersFromState(decodedState.filterParams);
        }
        if (typeof decodedState.isReversed === "boolean") {
          setReverseMode(decodedState.isReversed);
        }
      } else {
        // Legacy формат
        if (decodedState.filterParams) {
          populateFiltersFromState(decodedState.filterParams);
        }
        if (typeof decodedState.isReversed === "boolean") {
          setReverseMode(decodedState.isReversed);
        }
        if (decodedState.tableState) {
          if (Object.prototype.hasOwnProperty.call(decodedState.tableState, 'yColumnsVisible')) {
            delete decodedState.tableState.yColumnsVisible;
          }
          if (Object.prototype.hasOwnProperty.call(decodedState.tableState, 'multiSort')) {
            delete decodedState.tableState.multiSort;
          }
          setTableState(decodedState.tableState);
        }
      }

      // Диагностика возраста состояния
      if (decodedState.timestamp) {
        const age = Date.now() - decodedState.timestamp;
        const ageMinutes = Math.floor(age / (1000 * 60));
        console.log(`⏰ State age: ${ageMinutes} minutes`);
      }

      return decodedState;
    }
  }
  return null;
}

/**
 * Initializes the URL state module.
 * Sets up event listeners for browser navigation.
 */
export function initUrlStateSync() {
  // Listen for browser back/forward navigation
  window.addEventListener('popstate', () => {
    console.log("Browser navigation detected, loading state from URL");
    loadStateFromUrl();
  });

  // Listen for hash changes (manual URL changes)
  window.addEventListener('hashchange', () => {
    console.log("Hash change detected, loading state from URL");
    loadStateFromUrl();
  });

  console.log("URL state synchronization initialized");
}

/**
 * Clear state from URL hash
 */
export function clearStateFromUrl() {
  try {
    if (window.location.hash) {
      history.replaceState("", document.title, window.location.pathname + window.location.search);
    }
  } catch (error) {
    console.error('❌ URL State: Failed to clear URL state', error);
  }
}

/**
 * Gets the current state from the URL without applying it.
 * Useful for checking if there's saved state without loading it.
 * @returns {object|null} The current URL state or null if none exists.
 */
export function getCurrentUrlState() {
  const hash = window.location.hash;
  if (hash && hash.startsWith("#state=")) {
    const encodedState = hash.substring(7);
    return decodeState(encodedState);
  }
  return null;
}

/**
 * Checks if there's a valid state in the URL.
 * @returns {boolean} True if there's a valid state in the URL.
 */
export function hasUrlState() {
  return getCurrentUrlState() !== null;
}
