// static/js/data/fetchMetrics.js

import { isReverseMode } from "../state/appState.js";

const API_URL = "/api/metrics";

/**
 * Fetch metrics from the backend. This function is now pure and does not depend on the DOM.
 * @param {Object} filterParams - An object containing the filter values.
 * @returns {Promise<Object|null>} Parsed response object or null on error.
 */
export async function fetchMetrics(filterParams) {
  try {
    // Add the reverse mode to the params before creating the query string
    const paramsWithReverse = {
      ...filterParams,
      reverse: isReverseMode() ? "true" : "false",
    };

    const queryString = new URLSearchParams(paramsWithReverse).toString();
    const response = await fetch(`${API_URL}?${queryString}`);

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("📦 Data received:", data);
    return data;
  } catch (err) {
    console.error("❌ Fetch error:", err);
    return null;
  }
}
