// static/js/utils/errorLogger.js
// Responsibility: Centralized error logging utility
const DEBUG = typeof window !== 'undefined' && (window.DEBUG === true || localStorage.getItem('DEBUG') === 'true');

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

export const ErrorCategory = {
  DOM: 'DOM',
  STATE: 'STATE',
  RENDER: 'RENDER',
  FETCH: 'FETCH',
  INIT: 'INIT',
  UI: 'UI',
  CHART: 'CHART',
  TABLE: 'TABLE',
  FILTER: 'FILTER',
  SCROLL: 'SCROLL',
  UNKNOWN: 'UNKNOWN'
};

export const LogLevel = {
  SILENT: 0,
  ERROR: 1,
  WARN: 2,
  DEBUG: 3
};

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let currentLevel = DEBUG ? LogLevel.DEBUG : LogLevel.WARN;

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

export function setLogLevel(level) {
  currentLevel = level;
}

// ─────────────────────────────────────────────────────────────
// Logging functions
// ─────────────────────────────────────────────────────────────

export function logError(category, context, error, meta = {}) {
  if (currentLevel < LogLevel.ERROR) return;

  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : null;

  console.error(`[${category}] ${context}:`, msg, meta);
  if (stack && currentLevel >= LogLevel.DEBUG) console.debug(stack);
}

export function logWarn(category, context, message) {
  if (currentLevel < LogLevel.WARN) return;
  console.warn(`[${category}] ${context}:`, message);
}

export function logDebug(category, context, message, data = null) {
  if (currentLevel < LogLevel.DEBUG) return;
  data ? console.debug(`[${category}] ${context}:`, message, data)
       : console.debug(`[${category}] ${context}:`, message);
}

// ─────────────────────────────────────────────────────────────
// Safe wrappers
// ─────────────────────────────────────────────────────────────

export function trySafe(fn, fallback, category = ErrorCategory.UNKNOWN, context = 'unknown') {
  try {
    return fn();
  } catch (error) {
    logError(category, context, error);
    return fallback;
  }
}

export async function trySafeAsync(fn, fallback, category = ErrorCategory.UNKNOWN, context = 'unknown') {
  try {
    return await fn();
  } catch (error) {
    logError(category, context, error);
    return fallback;
  }
}
