// static/js/virtual/scroller/buffer-config.js
// Responsibility: Buffer configuration for VirtualScroller viewport

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

export const BASE_BUFFER_SIZE = 5;
export const MAX_MULT = 3;

const TALL_ROW_THRESHOLD = 60;
const TALL_ROW_MAX_MULT = 3.5;

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function getBufferConfig({ rowHeight } = {}) {
  const maxMult = rowHeight > TALL_ROW_THRESHOLD ? Math.max(MAX_MULT, TALL_ROW_MAX_MULT) : MAX_MULT;
  return { baseBufferSize: BASE_BUFFER_SIZE, maxMult };
}
