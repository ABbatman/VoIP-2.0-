// static/js/config/virtual-config.js
// Responsibility: Virtual scrolling configuration

// ─────────────────────────────────────────────────────────────
// Default values
// ─────────────────────────────────────────────────────────────

const DEFAULTS = {
  // thresholds
  VIRTUALIZATION_THRESHOLD: 50,
  MAX_STANDARD_ROWS: 100,

  // dimensions
  ROW_HEIGHT: 40,
  BUFFER_SIZE: 10,
  CONTAINER_MAX_HEIGHT: 600,

  // performance
  SCROLL_THROTTLE_MS: 12,
  RENDER_DELAY_MS: 0,

  // UI flags
  SHOW_VIRTUAL_INDICATOR: true,
  DISABLE_PAGINATION_IN_VIRTUAL: true,
  SMOOTH_SCROLL_BEHAVIOR: true,

  // debug
  DEBUG_MODE: false,
  PERFORMANCE_MONITORING: false,

  // feature flags
  ENABLE_HORIZONTAL_VIRTUALIZATION: false,
  ENABLE_DYNAMIC_ROW_HEIGHT: false,
  ENABLE_INFINITE_SCROLL: false,
  FIXED_ROW_HEIGHT: false,

  // breakpoints
  MOBILE_BREAKPOINT: 768,
  TABLET_BREAKPOINT: 1024,

  // mobile overrides
  MOBILE_ROW_HEIGHT: 35,
  MOBILE_BUFFER_SIZE: 3,
  MOBILE_CONTAINER_MAX_HEIGHT: 400
};

// ─────────────────────────────────────────────────────────────
// Data size thresholds
// ─────────────────────────────────────────────────────────────

const LARGE_DATASET_THRESHOLD = 5000;
const MEDIUM_DATASET_THRESHOLD = 1000;

const LARGE_BUFFER_MIN = 16;
const LARGE_BUFFER_MAX = 24;
const MEDIUM_BUFFER_MIN = 12;
const MEDIUM_BUFFER_MAX = 16;
const SMALL_BUFFER_MIN = 10;

const LARGE_THROTTLE_MS = 24;

// ─────────────────────────────────────────────────────────────
// Main config object
// ─────────────────────────────────────────────────────────────

export const VirtualConfig = { ...DEFAULTS };

// ─────────────────────────────────────────────────────────────
// Environment detection
// ─────────────────────────────────────────────────────────────

function isMobileDevice() {
  return window.innerWidth <= VirtualConfig.MOBILE_BREAKPOINT;
}

// ─────────────────────────────────────────────────────────────
// Config getters
// ─────────────────────────────────────────────────────────────

export function getVirtualConfig() {
  if (!isMobileDevice()) return VirtualConfig;

  return {
    ...VirtualConfig,
    ROW_HEIGHT: VirtualConfig.MOBILE_ROW_HEIGHT,
    BUFFER_SIZE: VirtualConfig.MOBILE_BUFFER_SIZE,
    CONTAINER_MAX_HEIGHT: VirtualConfig.MOBILE_CONTAINER_MAX_HEIGHT
  };
}

export function getOptimizedConfig(dataSize) {
  const config = getVirtualConfig();

  // adjust buffer based on data size
  if (dataSize > LARGE_DATASET_THRESHOLD) {
    config.BUFFER_SIZE = Math.min(Math.max(config.BUFFER_SIZE, LARGE_BUFFER_MIN), LARGE_BUFFER_MAX);
    config.SCROLL_THROTTLE_MS = LARGE_THROTTLE_MS;
  } else if (dataSize > MEDIUM_DATASET_THRESHOLD) {
    config.BUFFER_SIZE = Math.min(Math.max(config.BUFFER_SIZE, MEDIUM_BUFFER_MIN), MEDIUM_BUFFER_MAX);
  } else {
    config.BUFFER_SIZE = Math.max(config.BUFFER_SIZE, SMALL_BUFFER_MIN);
  }

  return config;
}

// ─────────────────────────────────────────────────────────────
// Config mutations
// ─────────────────────────────────────────────────────────────

export function updateVirtualConfig(updates) {
  Object.assign(VirtualConfig, updates);
}

export function resetVirtualConfig() {
  Object.assign(VirtualConfig, DEFAULTS);
}

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

export function validateConfig(config = VirtualConfig) {
  const errors = [];

  if (config.ROW_HEIGHT <= 0) errors.push('ROW_HEIGHT must be positive');
  if (config.BUFFER_SIZE < 0) errors.push('BUFFER_SIZE cannot be negative');
  if (config.CONTAINER_MAX_HEIGHT <= 0) errors.push('CONTAINER_MAX_HEIGHT must be positive');
  if (config.VIRTUALIZATION_THRESHOLD < 0) errors.push('VIRTUALIZATION_THRESHOLD cannot be negative');

  if (errors.length) {
    console.error('[VirtualConfig] Invalid configuration:', errors);
    return false;
  }

  return true;
}

