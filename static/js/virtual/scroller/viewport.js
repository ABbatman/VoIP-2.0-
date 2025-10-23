// static/js/virtual/scroller/viewport.js
// Responsibility: compute scroll-derived values and visible range
import { getBufferConfig } from './buffer-config.js';

export function getScrollTop(container, usesPageScroll) {
  return usesPageScroll
    ? Math.max(0, -container.getBoundingClientRect().top)
    : container.scrollTop;
}

export function computeSpeed(lastScrollTop, lastScrollTs, currentScrollTop, nowTs) {
  if (!lastScrollTs) return 0;
  const dy = Math.abs(currentScrollTop - lastScrollTop);
  const dt = Math.max(1, nowTs - lastScrollTs);
  return dy / dt; // px/ms
}

export function dynamicBufferMultiplier(speed, maxMult = 3) {
  // Thresholds: ~0.5 px/ms, 1 px/ms, 2 px/ms
  if (speed > 2) return Math.min(2.5, maxMult);
  if (speed > 1) return Math.min(2, maxMult);
  if (speed > 0.5) return Math.min(1.5, maxMult);
  return 1;
}

export function computeVisibleRange({
  container,
  usesPageScroll,
  rowHeight,
  baseBufferSize,
  lastStartIndex,
  lastEndIndex,
  forceRender,
  lastScrollTop,
  lastScrollTs,
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
  const endIndex = Math.min(
    Number.MAX_SAFE_INTEGER,
    startIndex + visibleRowsCount + effectiveBuffer * 2
  );

  const minDelta = Math.max(1, Math.floor(visibleRowsCount / 2));
  const shouldSkip = !forceRender &&
    lastStartIndex !== undefined &&
    Math.abs((lastStartIndex ?? 0) - startIndex) < minDelta &&
    lastEndIndex === endIndex;

  return {
    scrollTop,
    nowTs,
    speed,
    bufferMultiplier: mult,
    visibleRowsCount,
    startIndex,
    endIndex,
    shouldSkip,
  };
}
