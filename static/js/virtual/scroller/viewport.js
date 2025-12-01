// static/js/virtual/scroller/viewport.js
// Responsibility: Compute scroll-derived values and visible range
import { getBufferConfig } from './buffer-config.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

export function getScrollTop(container, usesPageScroll) {
  return usesPageScroll
    ? Math.max(0, -container.getBoundingClientRect().top)
    : container.scrollTop;
}

export function computeSpeed(lastScrollTop, lastScrollTs, currentScrollTop, nowTs) {
  if (!lastScrollTs) return 0;
  return Math.abs(currentScrollTop - lastScrollTop) / Math.max(1, nowTs - lastScrollTs);
}

export function dynamicBufferMultiplier(speed, maxMult = 3) {
  if (speed > 2) return Math.min(2.5, maxMult);
  if (speed > 1) return Math.min(2, maxMult);
  if (speed > 0.5) return Math.min(1.5, maxMult);
  return 1;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function computeVisibleRange({
  container,
  usesPageScroll,
  rowHeight,
  baseBufferSize,
  lastStartIndex,
  lastEndIndex,
  forceRender,
  lastScrollTop,
  lastScrollTs
}) {
  const nowTs = performance.now();
  const scrollTop = getScrollTop(container, usesPageScroll);
  const containerHeight = container.clientHeight;
  const speed = computeSpeed(lastScrollTop || 0, lastScrollTs || 0, scrollTop, nowTs);

  const visibleRowsCount = Math.ceil(containerHeight / rowHeight);
  const { baseBufferSize: cfgBase, maxMult } = getBufferConfig({ rowHeight });
  const base = Number.isFinite(baseBufferSize) ? baseBufferSize : cfgBase;
  const mult = Math.max(1, Math.min(dynamicBufferMultiplier(speed, maxMult), maxMult));
  const effectiveBuffer = Math.max(base, Math.ceil(visibleRowsCount * mult));

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - effectiveBuffer);
  const endIndex = Math.min(Number.MAX_SAFE_INTEGER, startIndex + visibleRowsCount + effectiveBuffer * 2);

  const minDelta = Math.max(1, Math.floor(visibleRowsCount / 2));
  const shouldSkip = !forceRender &&
    lastStartIndex !== undefined &&
    Math.abs((lastStartIndex ?? 0) - startIndex) < minDelta &&
    lastEndIndex === endIndex;

  return { scrollTop, nowTs, speed, bufferMultiplier: mult, visibleRowsCount, startIndex, endIndex, shouldSkip };
}
