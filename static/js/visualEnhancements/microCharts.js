// static/js/visualEnhancements/microCharts.js
// Responsibility: SVG sparklines and sparkbars for table cells

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEFAULTS = {
  sparkline: { width: 60, height: 20, color: '#4f86ff', strokeWidth: 1.5, fill: false },
  sparkbar: { width: 40, height: 4, color: '#4f86ff', bgColor: '#e1e4e8' }
};

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function generateSparkline(data, options = {}) {
  if (!Array.isArray(data) || data.length < 2) return '';

  const { width, height, color, strokeWidth, fill, min = Math.min(...data), max = Math.max(...data) } = { ...DEFAULTS.sparkline, ...options };
  const range = max - min;

  if (range === 0) {
    const y = height / 2;
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="sparkline"><line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${color}" stroke-width="${strokeWidth}" /></svg>`;
  }

  const step = width / (data.length - 1);
  const points = data.map((val, i) => `${i * step},${height - ((val - min) / range) * height}`).join(' ');
  const pathD = `M ${points}`;

  if (fill) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="sparkline">
      <path d="${pathD} L ${width},${height} L 0,${height} Z" fill="${color}" fill-opacity="0.1" stroke="none" />
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="sparkline">
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

export function generateSparkbar(value, max, options = {}) {
  const { width, height, color, bgColor } = { ...DEFAULTS.sparkbar, ...options };
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return `<div class="sparkbar-container" style="width:${width}px;height:${height}px;background:${bgColor};border-radius:2px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:4px;">
    <div class="sparkbar-fill" style="width:${pct}%;height:100%;background:${color};"></div>
  </div>`;
}
