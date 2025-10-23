// Virtual Configuration Module - Single Responsibility: Virtualization Settings
// Localized comments in English as requested

/**
 * Virtual Table Configuration
 * Responsibility: Centralized configuration for virtual scrolling behavior
 */
export const VirtualConfig = {
  // Rendering thresholds
  VIRTUALIZATION_THRESHOLD: 50, // Minimum rows to trigger virtualization
  MAX_STANDARD_ROWS: 100, // Maximum rows for standard rendering
  
  // Performance settings
  ROW_HEIGHT: 40, // Default row height in pixels
  BUFFER_SIZE: 10, // Extra rows to render above/below viewport (higher = smoother)
  CONTAINER_MAX_HEIGHT: 600, // Maximum height of scroll container
  
  // Scroll performance
  SCROLL_THROTTLE_MS: 12, // Slightly more frequent updates for smoother feel
  RENDER_DELAY_MS: 0, // Delay before rendering (for smoother UX)
  
  // UI settings
  SHOW_VIRTUAL_INDICATOR: true, // Show "Virtual Scrolling Active" indicator
  DISABLE_PAGINATION_IN_VIRTUAL: true, // Disable pagination controls when virtual
  SMOOTH_SCROLL_BEHAVIOR: true, // Enable smooth scrolling
  
  // Debug settings
  DEBUG_MODE: false, // Enable debug logging
  PERFORMANCE_MONITORING: false, // Track rendering performance
  
  // Feature flags
  ENABLE_HORIZONTAL_VIRTUALIZATION: false, // Future feature
  ENABLE_DYNAMIC_ROW_HEIGHT: false, // Future feature
  ENABLE_INFINITE_SCROLL: false, // Future feature
  // If true, row height is treated as fixed; runtime measurement is skipped
  FIXED_ROW_HEIGHT: false,
  
  // Responsive breakpoints
  MOBILE_BREAKPOINT: 768, // px
  TABLET_BREAKPOINT: 1024, // px
  
  // Mobile-specific settings
  MOBILE_ROW_HEIGHT: 35,
  MOBILE_BUFFER_SIZE: 3,
  MOBILE_CONTAINER_MAX_HEIGHT: 400,
};

/**
 * Get configuration based on current environment
 */
export function getVirtualConfig() {
  const isMobile = window.innerWidth <= VirtualConfig.MOBILE_BREAKPOINT;
  
  if (isMobile) {
    return {
      ...VirtualConfig,
      ROW_HEIGHT: VirtualConfig.MOBILE_ROW_HEIGHT,
      BUFFER_SIZE: VirtualConfig.MOBILE_BUFFER_SIZE,
      CONTAINER_MAX_HEIGHT: VirtualConfig.MOBILE_CONTAINER_MAX_HEIGHT,
      FIXED_ROW_HEIGHT: VirtualConfig.FIXED_ROW_HEIGHT,
    };
  }
  
  return VirtualConfig;
}

/**
 * Update configuration at runtime
 */
export function updateVirtualConfig(updates) {
  Object.assign(VirtualConfig, updates);
  console.log('🔧 Virtual Config: Updated configuration', updates);
}

/**
 * Get performance-optimized settings based on data size
 */
export function getOptimizedConfig(dataSize) {
  const config = getVirtualConfig();
  
  // Adjust buffer size based on data size
  if (dataSize > 5000) {
    config.BUFFER_SIZE = Math.min(Math.max(config.BUFFER_SIZE, 16), 24);
  } else if (dataSize > 1000) {
    config.BUFFER_SIZE = Math.min(Math.max(config.BUFFER_SIZE, 12), 16);
  } else {
    // Keep a healthy buffer even for small datasets for visual smoothness
    config.BUFFER_SIZE = Math.max(config.BUFFER_SIZE, 10);
  }
  
  // Adjust throttling for very large datasets
  if (dataSize > 5000) {
    config.SCROLL_THROTTLE_MS = 24; // Slightly reduce frame rate to keep CPU in check
  }
  
  return config;
}

/**
 * Validate configuration values
 */
export function validateConfig(config = VirtualConfig) {
  const errors = [];
  
  if (config.ROW_HEIGHT <= 0) {
    errors.push('ROW_HEIGHT must be positive');
  }
  
  if (config.BUFFER_SIZE < 0) {
    errors.push('BUFFER_SIZE cannot be negative');
  }
  
  if (config.CONTAINER_MAX_HEIGHT <= 0) {
    errors.push('CONTAINER_MAX_HEIGHT must be positive');
  }
  
  if (config.VIRTUALIZATION_THRESHOLD < 0) {
    errors.push('VIRTUALIZATION_THRESHOLD cannot be negative');
  }
  
  if (errors.length > 0) {
    console.error('❌ Virtual Config: Invalid configuration', errors);
    return false;
  }
  
  return true;
}

/**
 * Reset configuration to defaults
 */
export function resetVirtualConfig() {
  const defaults = {
    VIRTUALIZATION_THRESHOLD: 50,
    MAX_STANDARD_ROWS: 100,
    ROW_HEIGHT: 40,
    BUFFER_SIZE: 5,
    CONTAINER_MAX_HEIGHT: 600,
    SCROLL_THROTTLE_MS: 16,
    RENDER_DELAY_MS: 0,
    SHOW_VIRTUAL_INDICATOR: true,
    DISABLE_PAGINATION_IN_VIRTUAL: true,
    SMOOTH_SCROLL_BEHAVIOR: true,
    DEBUG_MODE: false,
    PERFORMANCE_MONITORING: false,
  };
  
  Object.assign(VirtualConfig, defaults);
  console.log('🔄 Virtual Config: Reset to defaults');
}

