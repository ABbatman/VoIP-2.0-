// static/js/data/metricsCache.js
// Responsibility: LRU cache for metrics API responses
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MAX_ENTRIES = 12;
const MAX_BYTES = 2 * 1024 * 1024; // ~2MB

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

const cache = new Map(); // key -> { data, size }
let totalBytes = 0;

// ─────────────────────────────────────────────────────────────
// Key generation
// ─────────────────────────────────────────────────────────────

export function makeCacheKey(params) {
  try {
    const entries = Object.entries(params)
      .filter(([, v]) => v != null)
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(entries);
  } catch (e) {
    logError(ErrorCategory.STATE, 'metricsCache:makeCacheKey', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Cache operations
// ─────────────────────────────────────────────────────────────

function touchEntry(key, entry) {
  cache.delete(key);
  cache.set(key, entry);
}

function evictOldest() {
  const firstKey = cache.keys().next().value;
  if (!firstKey) return;

  const entry = cache.get(firstKey);
  cache.delete(firstKey);
  totalBytes -= entry?.size || 0;
}

function evictWhileOverBudget() {
  while (cache.size > MAX_ENTRIES || totalBytes > MAX_BYTES) {
    evictOldest();
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function getCachedMetrics(params) {
  const key = makeCacheKey(params);
  if (!key) return null;

  const entry = cache.get(key);
  if (!entry) return null;

  // touch for LRU
  touchEntry(key, entry);
  return entry.data || null;
}

export function putCachedMetrics(params, data) {
  const key = makeCacheKey(params);
  if (!key) return;

  try {
    const json = JSON.stringify(data);
    const size = json?.length || 0;

    // subtract old size if key exists (overwrite case)
    const existing = cache.get(key);
    if (existing) {
      totalBytes -= existing.size || 0;
    }

    cache.set(key, { data, size });
    totalBytes += size;

    evictWhileOverBudget();
  } catch (e) {
    logError(ErrorCategory.STATE, 'metricsCache:putCachedMetrics', e);
  }
}
