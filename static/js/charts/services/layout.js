// static/js/charts/services/layout.js
// Responsibility: Chart layout calculations
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const GRID_COUNT = 4;
const GRID_LEFT = 40;
const GRID_RIGHT = 16;
const GRID_GAP = 8;
const GRID_PADDING = 8;

const MIN_HEIGHT = 200;
const DEFAULT_HEIGHT = 520;
const MAX_HEIGHT = 850;
const LARGE_SCREEN_THRESHOLD = 600;
const BOTTOM_OFFSET = 100;

// ─────────────────────────────────────────────────────────────
// Grid layout
// ─────────────────────────────────────────────────────────────

export function computeChartGrids(heightPx) {
  const totalHeight = Math.max(MIN_HEIGHT, heightPx || DEFAULT_HEIGHT);

  // usable = total - top/bottom padding - gaps between charts
  const usable = totalHeight - GRID_PADDING * 2 - GRID_GAP * (GRID_COUNT - 1);
  const gridHeight = Math.floor(usable / GRID_COUNT);

  return Array.from({ length: GRID_COUNT }, (_, i) => ({
    left: GRID_LEFT,
    right: GRID_RIGHT,
    top: GRID_PADDING + i * (gridHeight + GRID_GAP),
    height: gridHeight
  }));
}

// ─────────────────────────────────────────────────────────────
// Height calculation
// ─────────────────────────────────────────────────────────────

function getMountElement(mount) {
  return mount || document.getElementById('chart-area-1');
}

function getElementHeight(el) {
  if (!el) return 0;
  return el.clientHeight || el.getBoundingClientRect().height || 0;
}

function getViewportHeight() {
  return Math.max(
    Number(window?.innerHeight || 0),
    Number(document?.documentElement?.clientHeight || 0),
    DEFAULT_HEIGHT
  );
}

function storeFixedHeight(el, height) {
  try {
    if (el) el.dataset.fixedHeight = String(height);
  } catch (e) {
    logError(ErrorCategory.CHART, 'layout:storeFixedHeight', e);
  }
}

export function ensureFixedChartHeight(host, mount) {
  const mountEl = getMountElement(mount);
  const mountHeight = getElementHeight(mountEl);

  // large screen: use actual container height
  if (mountHeight > LARGE_SCREEN_THRESHOLD) {
    storeFixedHeight(mountEl, mountHeight);
    return mountHeight;
  }

  // calculate based on viewport
  const viewportHeight = getViewportHeight();
  const hostTop = host?.getBoundingClientRect?.()?.top || 0;
  const computed = Math.max(DEFAULT_HEIGHT, viewportHeight - hostTop - BOTTOM_OFFSET);
  const result = Math.min(computed, MAX_HEIGHT);

  storeFixedHeight(mountEl, result);
  return result;
}
