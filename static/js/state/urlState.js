// static/js/state/urlState.js
// DEPRECATED: This module now delegates to shortLinkState for persistence.
// Kept for backward compatibility with existing imports.

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
import {
  saveStateToShortLink,
  loadStateFromShortLink,
  hasShortLinkId,
  initShortLinkState,
} from "./shortLinkState.js";
// --- REMOVED: State modules should not call DOM functions ---

// Legacy encode/decode kept for backward compatibility with old hash URLs
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
 * Gathers the current relevant state and saves it via short link API.
 * Now uses backend persistence instead of URL hash encoding.
 */
export function saveStateToUrl() {
  // Delegate to short link module (async, fire-and-forget)
  saveStateToShortLink().catch((e) => {
    console.error("Failed to save state to short link:", e);
  });
}

/**
 * Loads state from short link (?s=ID) or legacy hash (#state=...).
 * Short link takes priority. Returns loaded state or null.
 * @returns {object|null} The loaded state object or null if nothing was loaded.
 */
export function loadStateFromUrl() {
  // Priority 1: short link (?s=ID)
  if (hasShortLinkId()) {
    // Short link loading is async; return a marker and let caller handle
    // For sync compatibility, we trigger async load and return null here
    // The actual state will be applied by loadStateFromShortLink
    loadStateFromShortLink().catch((e) => {
      console.error("Failed to load state from short link:", e);
    });
    // Return marker to indicate state is being loaded
    return { _loadingFromShortLink: true };
  }

  // Priority 2: legacy hash (#state=...)
  const hash = window.location.hash;
  if (hash && hash.startsWith("#state=")) {
    const encodedState = hash.substring(7);
    const decodedState = decodeState(encodedState);

    // skip if data already loaded
    const currentMetricsData = getMetricsData();
    if (currentMetricsData && decodedState) {
      return decodedState;
    }

    if (decodedState) {
      // skip if manual date commit was recent
      try {
        if (window._dateManuallyCommittedAt) {
          const age = Date.now() - window._dateManuallyCommittedAt;
          if (age >= 0 && age < 5000) {
            console.log("⏳ loadStateFromUrl: Skip applying filters due to recent manual commit");
            return decodedState;
          }
        }
      } catch(_) {
        // ignore
      }

      // apply state (new format)
      if (decodedState.version === "2.0" || decodedState.appState) {
        if (decodedState.appState) {
          setAppFullState(decodedState.appState);
        }
        if (decodedState.tableState) {
          delete decodedState.tableState.yColumnsVisible;
          delete decodedState.tableState.multiSort;
          setTableState(decodedState.tableState);
        }
        if (decodedState.filterParams) {
          populateFiltersFromState(decodedState.filterParams);
        }
        if (typeof decodedState.isReversed === "boolean") {
          setReverseMode(decodedState.isReversed);
        }
      } else {
        // legacy format
        if (decodedState.filterParams) {
          populateFiltersFromState(decodedState.filterParams);
        }
        if (typeof decodedState.isReversed === "boolean") {
          setReverseMode(decodedState.isReversed);
        }
        if (decodedState.tableState) {
          delete decodedState.tableState.yColumnsVisible;
          delete decodedState.tableState.multiSort;
          setTableState(decodedState.tableState);
        }
      }

      // log state age
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
  // Init short link state module
  initShortLinkState();

  // Listen for browser back/forward navigation
  window.addEventListener('popstate', () => {
    console.log("Browser navigation detected, loading state from URL");
    loadStateFromUrl();
  });

  // Listen for hash changes (legacy URL changes)
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
 * Checks if there's a valid state in the URL (short link or legacy hash).
 * @returns {boolean} True if there's a valid state in the URL.
 */
export function hasUrlState() {
  return hasShortLinkId() || getCurrentUrlState() !== null;
}
