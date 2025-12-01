// static/js/visualEnhancements/heatmapStyling.js
// Responsibility: Heatmap color styling for metrics

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const COLORS = {
  RED: { css: 'rgba(255, 59, 48, 0.15)', chart: 'rgba(255, 59, 48, 0.8)' },
  ORANGE: { css: 'rgba(255, 149, 0, 0.15)', chart: 'rgba(255, 149, 0, 0.8)' },
  GREEN: { css: 'rgba(52, 199, 89, 0.15)', chart: 'rgba(52, 199, 89, 0.8)' },
  BLUE_STRONG: { css: 'rgba(0, 122, 255, 0.15)', chart: 'rgba(0, 122, 255, 0.9)' },
  BLUE_LIGHT: { css: 'rgba(0, 122, 255, 0.08)', chart: 'rgba(0, 122, 255, 0.7)' }
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function parseValue(value) {
  if (value == null || value === '') return null;
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
}

function getASRColor(v, forChart) {
  const key = forChart ? 'chart' : 'css';
  if (v < 10) return COLORS.RED[key];
  if (v < 30) return COLORS.ORANGE[key];
  if (v > 60) return COLORS.GREEN[key];
  return null;
}

function getACDColor(v, forChart) {
  const key = forChart ? 'chart' : 'css';
  if (v > 5) return COLORS.BLUE_STRONG[key];
  if (v > 2) return COLORS.BLUE_LIGHT[key];
  return null;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function getHeatmapStyle(metric, value) {
  const v = parseValue(value);
  if (v === null) return '';

  if (metric === 'ASR') {
    const color = getASRColor(v, false);
    return color ? `background-color: ${color};` : '';
  }

  if (metric === 'ACD') {
    const color = getACDColor(v, false);
    return color ? `background-color: ${color};` : '';
  }

  if (metric === 'PDD' && v > 2000) {
    return `background-color: ${COLORS.RED.css};`;
  }

  return '';
}

export function getHeatmapColor(metric, value) {
  const v = parseValue(value);
  if (v === null) return undefined;

  if (metric === 'ASR') return getASRColor(v, true) ?? undefined;
  if (metric === 'ACD') return getACDColor(v, true) ?? undefined;

  return undefined;
}
