// static/js/utils/errorLogger.js
// Centralized error logging utility
// Replaces silent catch blocks with meaningful logging

const DEBUG = typeof window !== 'undefined' && (window.DEBUG === true || localStorage.getItem('DEBUG') === 'true');

// Error categories for filtering
export const ErrorCategory = {
  DOM: 'DOM',           // DOM manipulation errors
  STATE: 'STATE',       // State management errors  
  RENDER: 'RENDER',     // Rendering errors
  FETCH: 'FETCH',       // Network/fetch errors
  INIT: 'INIT',         // Initialization errors
  UI: 'UI',             // UI interaction errors
  CHART: 'CHART',       // Chart-related errors
  TABLE: 'TABLE',       // Table-related errors
  FILTER: 'FILTER',     // Filter-related errors
  SCROLL: 'SCROLL',     // Scroll/position errors
  UNKNOWN: 'UNKNOWN',   // Uncategorized
};

// Log levels
const LogLevel = {
  SILENT: 0,  // No logging
  ERROR: 1,   // Only errors
  WARN: 2,    // Errors + warnings
  DEBUG: 3,   // All (including debug info)
};

// Current log level (can be changed at runtime)
let currentLevel = DEBUG ? LogLevel.DEBUG : LogLevel.WARN;

/**
 * Set the logging level
 */
export function setLogLevel(level) {
  currentLevel = level;
}

/**
 * Log an error with context
 * @param {string} category - Error category from ErrorCategory
 * @param {string} context - Where the error occurred (function/module name)
 * @param {Error|any} error - The error object or message
 * @param {object} [meta] - Additional metadata
 */
export function logError(category, context, error, meta = {}) {
  if (currentLevel < LogLevel.ERROR) return;
  
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : null;
  
  console.error(`[${category}] ${context}:`, msg, meta);
  if (stack && currentLevel >= LogLevel.DEBUG) {
    console.debug(stack);
  }
}

/**
 * Log a warning (non-critical error)
 * @param {string} category - Error category
 * @param {string} context - Where it occurred
 * @param {string} message - Warning message
 */
export function logWarn(category, context, message) {
  if (currentLevel < LogLevel.WARN) return;
  console.warn(`[${category}] ${context}:`, message);
}

/**
 * Log debug info (only in debug mode)
 */
export function logDebug(category, context, message, data = null) {
  if (currentLevel < LogLevel.DEBUG) return;
  if (data) {
    console.debug(`[${category}] ${context}:`, message, data);
  } else {
    console.debug(`[${category}] ${context}:`, message);
  }
}

/**
 * Safe wrapper for operations that may fail
 * Logs error and returns fallback value
 * @param {Function} fn - Function to execute
 * @param {any} fallback - Value to return on error
 * @param {string} category - Error category
 * @param {string} context - Context description
 */
export function trySafe(fn, fallback, category = ErrorCategory.UNKNOWN, context = 'unknown') {
  try {
    return fn();
  } catch (error) {
    logError(category, context, error);
    return fallback;
  }
}

/**
 * Async version of trySafe
 */
export async function trySafeAsync(fn, fallback, category = ErrorCategory.UNKNOWN, context = 'unknown') {
  try {
    return await fn();
  } catch (error) {
    logError(category, context, error);
    return fallback;
  }
}

// Export LogLevel for external use
export { LogLevel };
