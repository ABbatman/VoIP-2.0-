// static/js/visualEnhancements/heatmapStyling.js

/**
 * Returns CSS style string for heatmap shading.
 * @param {string} metric - Metric name (ASR, ACD, etc.)
 * @param {number} value - Metric value
 * @returns {string} CSS style string (background-color)
 */
export function getHeatmapStyle(metric, value) {
    if (value == null || value === '') return '';
    const v = Number(value);
    if (!Number.isFinite(v)) return '';

    // Soft heatmap colors (Apple/TradingView style - subtle)
    // ASR: Red (low) -> Green (high)
    if (metric === 'ASR') {
        if (v < 10) return 'background-color: rgba(255, 59, 48, 0.15);'; // Red
        if (v < 30) return 'background-color: rgba(255, 149, 0, 0.15);'; // Orange
        if (v > 60) return 'background-color: rgba(52, 199, 89, 0.15);'; // Green
    }

    // ACD: Blue scale (higher is deeper blue)
    if (metric === 'ACD') {
        if (v > 5) return 'background-color: rgba(0, 122, 255, 0.15);';
        if (v > 2) return 'background-color: rgba(0, 122, 255, 0.08);';
    }

    // PDD: Inverse (lower is better) - not strictly requested but good for completeness
    if (metric === 'PDD') {
        if (v > 2000) return 'background-color: rgba(255, 59, 48, 0.15);';
    }

    return '';
}

/**
 * Returns color string for ECharts itemStyle.
 * @param {string} metric 
 * @param {number} value 
 * @returns {string|undefined}
 */
export function getHeatmapColor(metric, value) {
    if (value == null || value === '') return undefined;
    const v = Number(value);
    if (!Number.isFinite(v)) return undefined;

    if (metric === 'ASR') {
        if (v < 10) return 'rgba(255, 59, 48, 0.8)'; // Red
        if (v < 30) return 'rgba(255, 149, 0, 0.8)'; // Orange
        if (v > 60) return 'rgba(52, 199, 89, 0.8)'; // Green
    }

    if (metric === 'ACD') {
        if (v > 5) return 'rgba(0, 122, 255, 0.9)';
        if (v > 2) return 'rgba(0, 122, 255, 0.7)';
    }

    return undefined;
}
