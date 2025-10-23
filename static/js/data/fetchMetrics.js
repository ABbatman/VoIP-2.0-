// static/js/data/fetchMetrics.js

import { isReverseMode } from "../state/appState.js";

const API_URL_BASE = "/api/metrics";

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

    const g = String(paramsWithReverse?.granularity || "").toLowerCase();
    let endpoint = API_URL_BASE;
    if (g === '5m') endpoint = `${API_URL_BASE}/5m`;
    else if (g === '1h') endpoint = `${API_URL_BASE}/1h`;

    const queryString = new URLSearchParams(paramsWithReverse).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout
    const response = await fetch(`${endpoint}?${queryString}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error("❌ Fetch error:", err);
    return null;
  }
}
