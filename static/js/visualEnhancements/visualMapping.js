// static/js/visualEnhancements/visualMapping.js
// Responsibility: Global visual stability framework for charts

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const HOUR_MS = 3600000;

// ─────────────────────────────────────────────────────────────
// Core math
// ─────────────────────────────────────────────────────────────

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function mapLinear(value, inMin, inMax, outMin, outMax) {
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

export function mapSmooth(value, inMin, inMax, outMin, outMax) {
  let t = clamp((value - inMin) / (inMax - inMin), 0, 1);
  const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return outMin + eased * (outMax - outMin);
}

// ─────────────────────────────────────────────────────────────
// Time scale detection
// ─────────────────────────────────────────────────────────────

export function detectTimeScale(rangeMs) {
  if (rangeMs <= 2 * HOUR_MS) return 'hour';
  if (rangeMs <= 8 * HOUR_MS) return '5min';
  if (rangeMs <= 36 * HOUR_MS) return 'mixed';
  if (rangeMs >= 48 * HOUR_MS) return 'daily';
  return 'auto';
}

export function getZoomStrength(currentRangeMs, totalRangeMs) {
  if (!totalRangeMs || !currentRangeMs) return 0;
  return clamp(1 - currentRangeMs / totalRangeMs, 0, 1);
}

// ─────────────────────────────────────────────────────────────
// Chart dimensions
// ─────────────────────────────────────────────────────────────

export const getBarWidth = (chartWidthPx, dataCount) =>
  dataCount ? (chartWidthPx * 0.8) / dataCount : 10;

export const getPointDensity = (chartWidthPx, dataCount) =>
  chartWidthPx ? dataCount / chartWidthPx : 0;

// ─────────────────────────────────────────────────────────────
// Visual configs
// ─────────────────────────────────────────────────────────────

export function getBarVisuals(barWidth, scale) {
  const blueOpacity = 1.0;
  let grayOpacity = mapSmooth(barWidth, 3, 30, 0.3, 0.7);

  if (scale === 'daily') grayOpacity *= 0.8;
  else if (scale === 'wide-range' || scale === 'mixed') grayOpacity *= 0.6;

  return {
    blueOpacity: clamp(blueOpacity, 0, 1),
    grayOpacity: clamp(grayOpacity, 0, 1),
    blueWidth: barWidth,
    grayWidth: barWidth * 0.7
  };
}

export function getLineVisuals(zoomStrength, pointDensity, scale) {
  const lineWidth = mapLinear(zoomStrength, 0, 1, 1, 3);
  let smoothStrength = mapLinear(pointDensity, 0, 1, 0.0, 0.4);

  if (scale === 'hour') smoothStrength = 0;
  else if (scale === 'daily') smoothStrength = 0.35;
  else if (scale === 'wide-range' || scale === 'mixed') smoothStrength = 0.45;

  return {
    lineWidth: clamp(lineWidth, 0.5, 5),
    smoothStrength: clamp(smoothStrength, 0, 1)
  };
}

