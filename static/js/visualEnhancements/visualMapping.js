/**
 * visualMapping.js
 * Global Visual Stability Framework
 * Provides universal functions for consistent rendering across all charts.
 */

/**
 * Maps a value from one range to another linearly.
 */
export function mapLinear(value, inMin, inMax, outMin, outMax) {
    const t = (value - inMin) / (inMax - inMin);
    return outMin + t * (outMax - outMin);
}

/**
 * Maps a value from one range to another with smooth easing (cubic).
 */
export function mapSmooth(value, inMin, inMax, outMin, outMax) {
    let t = (value - inMin) / (inMax - inMin);
    t = Math.max(0, Math.min(1, t));
    // Cubic easing in-out
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return outMin + eased * (outMax - outMin);
}

/**
 * Clamps a value between min and max.
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Detects the time scale based on the range in milliseconds.
 * @param {number} rangeMs - Time range in milliseconds.
 * @returns {string} 'hour', '5min', 'mixed', 'daily', or 'auto'
 */
export function detectTimeScale(rangeMs) {
    const h = 3600000;
    if (rangeMs <= 2 * h) return 'hour';
    if (rangeMs <= 8 * h) return '5min';
    if (rangeMs <= 36 * h) return 'mixed';
    if (rangeMs >= 48 * h) return 'daily';
    return 'auto';
}

/**
 * Returns a normalized zoom strength [0..1].
 * This is a heuristic based on the data zoom range.
 * @param {Object} chart - ECharts instance or option object (if available).
 * @param {number} currentRangeMs - Current visible time range in ms.
 * @param {number} totalRangeMs - Total time range in ms.
 */
export function getZoomStrength(currentRangeMs, totalRangeMs) {
    if (!totalRangeMs || !currentRangeMs) return 0;
    const ratio = currentRangeMs / totalRangeMs;
    // ratio 1.0 -> zoom 0
    // ratio 0.0 -> zoom 1
    return clamp(1 - ratio, 0, 1);
}

/**
 * Estimates bar width in pixels based on chart width and number of data points.
 * @param {number} chartWidthPx 
 * @param {number} dataCount 
 * @returns {number} Estimated bar width in pixels.
 */
export function getBarWidth(chartWidthPx, dataCount) {
    if (!dataCount || dataCount === 0) return 10; // default
    // Assuming some gap
    const available = chartWidthPx * 0.8;
    return available / dataCount;
}

/**
 * Calculates point density (points per pixel).
 * @param {number} chartWidthPx 
 * @param {number} dataCount 
 */
export function getPointDensity(chartWidthPx, dataCount) {
    if (!chartWidthPx) return 0;
    return dataCount / chartWidthPx;
}

/**
 * Returns standard visual configuration for bars based on width and scale.
 */
export function getBarVisuals(barWidth, scale) {
    let blueOpacity = mapSmooth(barWidth, 3, 30, 0.5, 1.0);
    let grayOpacity = mapSmooth(barWidth, 3, 30, 0.15, 0.6);

    const grayWidth = barWidth * 0.7;
    const blueWidth = barWidth * 1.0;

    if (scale === 'daily') {
        blueOpacity *= 0.8;
        grayOpacity *= 0.7;
    } else if (scale === 'wide-range' || scale === 'mixed') { // treating mixed as wide-range for now
        blueOpacity *= 0.6;
        grayOpacity *= 0.5;
    }

    return {
        blueOpacity: clamp(blueOpacity, 0, 1),
        grayOpacity: clamp(grayOpacity, 0, 1),
        blueWidth,
        grayWidth
    };
}

/**
 * Returns standard visual configuration for lines based on zoom and density.
 */
export function getLineVisuals(zoomStrength, pointDensity, scale) {
    const lineWidth = mapLinear(zoomStrength, 0, 1, 1, 3);

    let smoothStrength = mapLinear(pointDensity, 0, 1, 0.0, 0.4);

    if (scale === 'hour') {
        smoothStrength = 0;
    } else if (scale === 'daily') {
        smoothStrength = 0.35;
    } else if (scale === 'wide-range' || scale === 'mixed') {
        smoothStrength = 0.45;
    }

    return {
        lineWidth: clamp(lineWidth, 0.5, 5),
        smoothStrength: clamp(smoothStrength, 0, 1)
    };
}
/**
 * Calculates robust percent change (zero-division safe).
 * @param {number} curr - Current value
 * @param {number} prev - Previous value
 * @returns {number} Percent change (-100 to 100+)
 */
export function calculateTrendPercent(curr, prev) {
    const p = Math.max(Number(prev) || 0, 0.00001);
    const c = Number(curr) || 0;
    const delta = c - p;
    return (delta / p) * 100;
}

/**
 * Returns the tint color (rgba) based on trend percent.
 * @param {number} percent - Trend percent
 * @param {boolean} isGray - If true, applies gray-specific logic
 * @returns {string|null} RGBA string or null if no tint
 */
export function getTrendTint(percent, isGray = false) {
    const absP = Math.abs(percent);
    if (absP < 10) return null; // Stable, no tint

    // Map opacity: 10% -> 0.05, 60% -> 0.35 (max)
    // For gray: max 0.30
    const maxOp = isGray ? 0.30 : 0.35;
    const opacity = clamp(mapLinear(absP, 10, 60, 0.05, maxOp), 0.05, maxOp);

    if (percent > 0) {
        // Positive (Green)
        return `rgba(50,190,70, ${opacity.toFixed(3)})`;
    } else {
        // Negative (Red)
        return `rgba(230,60,50, ${opacity.toFixed(3)})`;
    }
}
