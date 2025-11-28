// static/js/data/metricsCache.js
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// Lightweight in-memory LRU cache for metrics responses
const CACHE = new Map(); // key -> { data, size }
let BYTES = 0;
const MAX_ENTRIES = 12;
const MAX_BYTES = 2 * 1024 * 1024; // ~2MB

export function makeCacheKey(params) {
  try {
    const entries = Object.entries(params)
      .filter(([_k, v]) => v != null)
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(entries);
  } catch (e) { logError(ErrorCategory.STATE, 'metricsCache', e);
    return null;
  }
}

export function getCachedMetrics(params) {
  const key = makeCacheKey(params);
  if (!key) return null;
  const hit = CACHE.get(key);
  if (!hit) return null;
  // Touch for LRU
  CACHE.delete(key);
  CACHE.set(key, hit);
  return hit.data || null;
}

export function putCachedMetrics(params, data) {
  const key = makeCacheKey(params);
  if (!key) return;
  try {
    const json = JSON.stringify(data);
    const size = json ? json.length : 0;
    CACHE.set(key, { data, size });
    BYTES += size;
    // Evict LRU while over budget
    while (CACHE.size > MAX_ENTRIES || BYTES > MAX_BYTES) {
      const firstKey = CACHE.keys().next().value;
      if (!firstKey) break;
      const ev = CACHE.get(firstKey);
      CACHE.delete(firstKey);
      BYTES -= ev && ev.size ? ev.size : 0;
    }
  } catch (e) { logError(ErrorCategory.STATE, 'metricsCache', e);
    // Cache operation might fail
  }
}
