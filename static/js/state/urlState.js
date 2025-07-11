// static/js/state/urlState.js

import {
  getState as getTableState,
  setFullState as setTableState,
} from "./tableState.js";
import { isReverseMode, setReverseMode, getMetricsData } from "./appState.js";
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
 */
export function saveStateToUrl() {
  if (!getMetricsData()) {
    if (window.location.hash) {
      history.replaceState(
        "",
        document.title,
        window.location.pathname + window.location.search
      );
    }
    return;
  }

  const stateToSave = {
    isReversed: isReverseMode(),
    tableState: getTableState(),
    filterParams: buildFilterParams(),
  };

  const encodedState = encodeState(stateToSave);
  history.replaceState(null, "", `#state=${encodedState}`);
  console.log("📝 State saved to URL.");
}

/**
 * Loads state from the URL hash and applies it to the application state.
 * @returns {object|null} The loaded state object or null if nothing was loaded.
 */
export function loadStateFromUrl() {
  const hash = window.location.hash;
  if (hash && hash.startsWith("#state=")) {
    const encodedState = hash.substring(7);
    const decodedState = decodeState(encodedState);

    if (decodedState) {
      console.log("✅ State loaded from URL:", decodedState);

      if (decodedState.filterParams) {
        populateFiltersFromState(decodedState.filterParams);
      }

      if (typeof decodedState.isReversed === "boolean") {
        setReverseMode(decodedState.isReversed);
      }

      if (decodedState.tableState) {
        setTableState(decodedState.tableState);
      }

      return decodedState;
    }
  }
  return null;
}

/**
 * Initializes the URL state module.
 */
export function initUrlStateSync() {
  console.log("🔄 URL state module initialized.");
}
