// static/js/data/fetchMetrics.js
// Responsibility: Fetch metrics from backend API
import { isReverseMode } from '../state/appState.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const API_BASE = '/api/metrics';
const TIMEOUT_MS = 20000;

const GRANULARITY_ENDPOINTS = {
  '5m': `${API_BASE}/5m`,
  '1h': `${API_BASE}/1h`
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getEndpoint(granularity) {
  const g = String(granularity || '').toLowerCase();
  return GRANULARITY_ENDPOINTS[g] || API_BASE;
}

function buildParams(filterParams) {
  return {
    ...filterParams,
    reverse: isReverseMode() ? 'true' : 'false'
  };
}

function createAbortController() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { controller, timeoutId };
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export async function fetchMetrics(filterParams) {
  const params = buildParams(filterParams);
  const endpoint = getEndpoint(params.granularity);
  const queryString = new URLSearchParams(params).toString();
  const url = `${endpoint}?${queryString}`;

  const { controller, timeoutId } = createAbortController();

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    logError(ErrorCategory.DATA, 'fetchMetrics', err);
    return null;
  }
}
