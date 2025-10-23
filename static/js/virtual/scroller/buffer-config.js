// static/js/virtual/scroller/buffer-config.js
// Responsibility: central buffer tuning configuration for VirtualScroller viewport calculations

export const BASE_BUFFER_SIZE = 5; // minimal extra rows beyond viewport
export const MAX_MULT = 3;        // max multiplier for dynamic buffer based on speed

// Optionally adapt buffer to rowHeight or other runtime traits
export function getBufferConfig({ rowHeight } = {}) {
  // For very tall rows, allow a slightly higher cap to avoid under-buffering on fast scrolls
  if (rowHeight && rowHeight > 60) {
    return { baseBufferSize: BASE_BUFFER_SIZE, maxMult: Math.max(MAX_MULT, 3.5) };
  }
  return { baseBufferSize: BASE_BUFFER_SIZE, maxMult: MAX_MULT };
}
