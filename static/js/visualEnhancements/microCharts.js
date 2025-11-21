// static/js/visualEnhancements/microCharts.js

/**
 * Generates a lightweight SVG sparkline for table cells.
 * @param {number[]} data - Array of numerical values.
 * @param {Object} options - Configuration options.
 * @returns {string} SVG string.
 */
export function generateSparkline(data, options = {}) {
    if (!Array.isArray(data) || data.length < 2) return '';

    const {
        width = 60,
        height = 20,
        color = '#4f86ff',
        strokeWidth = 1.5,
        fill = false,
        min = Math.min(...data),
        max = Math.max(...data)
    } = options;

    const range = max - min;
    if (range === 0) {
        // Flat line
        const y = height / 2;
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="sparkline"><line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${color}" stroke-width="${strokeWidth}" /></svg>`;
    }

    const step = width / (data.length - 1);
    const points = data.map((val, i) => {
        const x = i * step;
        const y = height - ((val - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    let pathD = `M ${points}`;
    let fillPath = '';

    if (fill) {
        fillPath = `L ${width},${height} L 0,${height} Z`;
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="sparkline">
      <path d="${pathD} ${fillPath}" fill="${color}" fill-opacity="0.1" stroke="none" />
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;
    }

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="sparkline">
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

/**
 * Generates a simple bar (sparkbar) for single value visualization relative to a max.
 * @param {number} value 
 * @param {number} max 
 * @param {Object} options 
 */
export function generateSparkbar(value, max, options = {}) {
    const {
        width = 40,
        height = 4,
        color = '#4f86ff',
        bgColor = '#e1e4e8'
    } = options;

    const pct = Math.max(0, Math.min(100, (value / max) * 100));

    return `<div class="sparkbar-container" style="width:${width}px; height:${height}px; background:${bgColor}; border-radius:2px; overflow:hidden; display:inline-block; vertical-align:middle; margin-left:4px;">
    <div class="sparkbar-fill" style="width:${pct}%; height:100%; background:${color};"></div>
  </div>`;
}
