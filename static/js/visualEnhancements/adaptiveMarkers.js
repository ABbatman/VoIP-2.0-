// static/js/visualEnhancements/adaptiveMarkers.js
// Responsibility: Adaptive marker sizing for chart bars
import { clamp } from './visualMapping.js';
// Error logger available if needed
// import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const STATE = { DOT: 2, SMALL_PILL: 3, MEDIUM_PILL: 4, FULL_CAPSULE: 5 };
const THRESHOLD = { FULL: 22, MEDIUM: 12, SMALL: 6 };
const FONT_BASE = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

// ─────────────────────────────────────────────────────────────
// State detection
// ─────────────────────────────────────────────────────────────

export function getAdaptiveMarkerState(barWidth) {
  if (barWidth >= THRESHOLD.FULL) return STATE.FULL_CAPSULE;
  if (barWidth >= THRESHOLD.MEDIUM) return STATE.MEDIUM_PILL;
  if (barWidth >= THRESHOLD.SMALL) return STATE.SMALL_PILL;
  return STATE.DOT;
}

// ─────────────────────────────────────────────────────────────
// Style builders
// ─────────────────────────────────────────────────────────────

function buildDotStyle(x, y, barWidth, color, secondary, CSS_BG) {
  const d = clamp(barWidth * 0.8, 2, 5);
  return {
    shape: { x: x - d / 2, y: y - d / 2, width: d, height: d, r: d / 2 },
    style: { fill: CSS_BG(), stroke: color, lineWidth: 1.5, opacity: secondary ? 0.8 : 1 },
    textStyle: {},
    showText: false
  };
}

function buildSmallPillStyle(x, y, barWidth, color, secondary, CSS_BG) {
  const w = barWidth * 0.7;
  const h = clamp(barWidth * 0.4, 4, 8);
  return {
    shape: { x: x - w / 2, y: y - h / 2, width: w, height: h, r: h / 2 },
    style: { fill: CSS_BG(), stroke: color, lineWidth: 1.5, opacity: secondary ? 0.8 : 1 },
    textStyle: {},
    showText: false
  };
}

function buildMediumPillStyle(x, y, barWidth, color, secondary, text, CSS_BG) {
  const w = barWidth * 0.85;
  const h = Math.max(10, barWidth * 0.35);
  const fontSize = clamp(barWidth * 0.25, 8, 14);
  return {
    shape: { x: x - w / 2, y: y - h / 2, width: w, height: h, r: h / 2 },
    style: { fill: CSS_BG(), stroke: color, lineWidth: 1, opacity: secondary ? 0.9 : 1 },
    textStyle: { text, x, y, align: 'center', verticalAlign: 'middle', font: `600 ${fontSize}px ${FONT_BASE} `, fill: color, opacity: 1 },
    showText: true
  };
}

function buildFullCapsuleStyle(x, y, barWidth, color, secondary, text, defaultH, CSS_BG, echarts) {
  const fontSize = clamp(barWidth * 0.25, 10, 14);
  const tr = echarts?.format?.getTextRect?.(text, `600 ${fontSize}px ${FONT_BASE} `) ?? { width: String(text).length * 7 };
  const padX = 8;
  const w = Math.min(tr.width + padX * 2, barWidth * 0.95);
  const h = defaultH || 14;
  return {
    shape: { x: x - w / 2, y: y - h / 2, width: w, height: h, r: h / 2 },
    style: { fill: CSS_BG(), stroke: color, lineWidth: 1, opacity: secondary ? 0.9 : 1 },
    textStyle: { text, x, y, align: 'center', verticalAlign: 'middle', font: `600 ${fontSize}px ${FONT_BASE} `, fill: color, opacity: 1 },
    showText: true
  };
}

export function getAdaptiveMarkerStyle(state, { x, y, barWidth, color, secondary, text, defaultH, CSS_BG, echarts }) {
  if (state <= STATE.DOT) return buildDotStyle(x, y, barWidth, color, secondary, CSS_BG);
  if (state === STATE.SMALL_PILL) return buildSmallPillStyle(x, y, barWidth, color, secondary, CSS_BG);
  if (state === STATE.MEDIUM_PILL) return buildMediumPillStyle(x, y, barWidth, color, secondary, text, CSS_BG);
  return buildFullCapsuleStyle(x, y, barWidth, color, secondary, text, defaultH, CSS_BG, echarts);
}

// ─────────────────────────────────────────────────────────────
// Layout calculation
// ─────────────────────────────────────────────────────────────

function resolveColor(supplierId, name, colorMap, getStableColor, PROVIDER_COLORS, index) {
  const sidStr = supplierId != null ? String(supplierId) : undefined;

  if (colorMap) {
    if (sidStr && colorMap[sidStr]) return colorMap[sidStr];
    if (supplierId != null && colorMap[supplierId]) return colorMap[supplierId];
    if (name && colorMap[name]) return colorMap[name];
  }

  if (sidStr == null && (name == null || String(name).trim() === '')) {
    return PROVIDER_COLORS[index % PROVIDER_COLORS.length] || '#ff7f0e';
  }

  return getStableColor(sidStr || String(name || 'default')) || PROVIDER_COLORS[index % PROVIDER_COLORS.length] || '#ff7f0e';
}

export function calculateMarkerLayout(api, {
  ts, grouped, metric, stepMs, yPos, h: defaultH, secondary, colorMap,
  formatMetricText, CSS_BG, getStableColor, PROVIDER_COLORS, echarts
}) {
  const size = api.size([Number(stepMs), 0]);
  const barWidth = Array.isArray(size) ? Math.abs(size[0]) : 0;
  const actualBarWidth = barWidth * 0.35;
  const state = getAdaptiveMarkerState(actualBarWidth);

  // pre-calculate common values
  const dx = actualBarWidth * 0.6;
  const len = grouped.length;
  const children = [];

  for (let i = 0; i < len; i++) {
    const { supplierId, name, value: val } = grouped[i];
    const c = api.coord([ts, val]);

    // align to blue bar (left offset)
    const x = Math.round(c[0] - dx);
    const y = Math.round(yPos[i]);

    const color = resolveColor(supplierId, name, colorMap, getStableColor, PROVIDER_COLORS, i);
    const txt = formatMetricText(metric, val);

    const { shape, style, textStyle, showText } = getAdaptiveMarkerStyle(state, {
      x, y, barWidth: actualBarWidth, color, secondary, text: txt, defaultH, CSS_BG, echarts
    });

    style.text = showText ? txt : '';
    style.textFill = 'transparent';

    children.push({
      type: 'rect',
      shape,
      style,
      z2: 100,
      transition: ['shape', 'style']
    });

    if (showText) {
      children.push({
        type: 'text',
        style: textStyle,
        z2: 101,
        silent: true,
        transition: ['style']
      });
    }
  }

  return children;
}
