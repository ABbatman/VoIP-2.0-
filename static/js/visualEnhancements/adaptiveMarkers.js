// static/js/visualEnhancements/adaptiveMarkers.js
import * as echarts from 'echarts';

/**
 * Determines the visual state of the marker based on bar width.
 * @param {number} barWidth 
 * @returns {number} State 1-5
 */
export function getAdaptiveMarkerState(barWidth) {
    if (barWidth >= 40) return 5;      // Large: Full capsule
    if (barWidth >= 22) return 4;      // Medium: Pill + small text
    if (barWidth >= 12) return 3;      // Small: Pill no text
    if (barWidth >= 6) return 2;       // Narrow: Dot
    return 1;                          // Ultra-narrow: Tick
}

/**
 * Returns the shape and style for a given marker state.
 * @param {number} state - State 1-5
 * @param {Object} params - { x, y, barWidth, color, secondary, text, fontBase, defaultH, CSS_BG }
 * @returns {Object} { shape, style, textStyle, showText }
 */
export function getAdaptiveMarkerStyle(state, { x, y, barWidth, color, secondary, text, fontBase, defaultH, CSS_BG, echarts }) {
    let shape = {};
    let style = {};
    let textStyle = {};
    let showText = false;

    if (state === 1) {
        // State 1: Ultra-narrow Tick
        const w = Math.max(1, barWidth * 0.6);
        const h = 2;
        shape = { x: x - w / 2, y: y - h / 2, width: w, height: h, r: 0 };
        style = { fill: color, stroke: 'none', opacity: secondary ? 0.6 : 1 };
        showText = false;
    } else if (state === 2) {
        // State 2: Dot (Circle)
        const d = Math.min(barWidth * 0.6, 6);
        shape = { x: x - d / 2, y: y - d / 2, width: d, height: d, r: d / 2 };
        style = { fill: CSS_BG(), stroke: color, lineWidth: 1.5, opacity: secondary ? 0.8 : 1 };
        showText = false;
    } else if (state === 3) {
        // State 3: Small Pill (Capsule, no text)
        const w = barWidth * 0.7;
        const h = Math.max(4, Math.min(barWidth * 0.35, 8));
        shape = { x: x - w / 2, y: y - h / 2, width: w, height: h, r: h / 2 };
        style = { fill: CSS_BG(), stroke: color, lineWidth: 1.5, opacity: secondary ? 0.8 : 1 };
        showText = false;
    } else if (state === 4) {
        // State 4: Medium Pill + Small Text
        const w = barWidth * 0.85;
        const h = Math.max(10, barWidth * 0.35);
        const fontSize = Math.max(8, Math.min(14, barWidth * 0.25));
        shape = { x: x - w / 2, y: y - h / 2, width: w, height: h, r: h / 2 };
        style = { fill: CSS_BG(), stroke: color, lineWidth: 1, opacity: secondary ? 0.9 : 1 };
        textStyle = {
            text: text, x, y, align: 'center', verticalAlign: 'middle',
            font: `600 ${fontSize}px ${fontBase}`, fill: color, opacity: 1
        };
        showText = true;
    } else {
        // State 5: Large Full Capsule
        const fontSize = 11;
        // Calculate text width
        const tr = (echarts && echarts.format && typeof echarts.format.getTextRect === 'function')
            ? echarts.format.getTextRect(text, `600 ${fontSize}px ${fontBase}`)
            : { width: (String(text).length * 7) };

        const padX = 8;
        const reqW = tr.width + padX * 2;
        const w = Math.min(reqW, barWidth * 0.95); // Clamp to bar width
        const h = defaultH || 14;

        shape = { x: x - w / 2, y: y - h / 2, width: w, height: h, r: h / 2 };
        style = { fill: CSS_BG(), stroke: color, lineWidth: 1, opacity: secondary ? 0.9 : 1 };
        textStyle = {
            text: text, x, y, align: 'center', verticalAlign: 'middle',
            font: `600 ${fontSize}px ${fontBase}`, fill: color, opacity: 1
        };
        showText = true;
    }

    return { shape, style, textStyle, showText };
}

export function calculateMarkerLayout(api, {
    ts, grouped, metric, stepMs, align, yPos, h: defaultH, secondary, colorMap,
    formatMetricText, CSS_BG, getStableColor, PROVIDER_COLORS
}) {
    // 1. Calculate Bar Width
    const size = api.size([Number(stepMs), 0]);
    const barWidth = Array.isArray(size) ? Math.abs(size[0]) : 0;

    // 2. Determine State (1-5)
    const state = getAdaptiveMarkerState(barWidth);

    const children = [];
    const fontBase = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

    for (let i = 0; i < grouped.length; i++) {
        const { supplierId, name, value: val } = grouped[i];
        const c = api.coord([ts, val]);
        let x = Math.round(c[0]);

        // Alignment logic
        try {
            const frac = 0.18;
            const dx = (barWidth * frac);
            if (align === 'current') x = Math.round(x - dx);
            else if (align === 'prev') x = Math.round(x + dx);
        } catch (_) { }

        const y = Math.round(yPos[i]);

        // Resolve Color
        let color = undefined;
        try {
            const sidStr = supplierId != null ? String(supplierId) : undefined;
            if (colorMap) {
                if (sidStr && colorMap[sidStr]) color = colorMap[sidStr];
                else if (supplierId != null && colorMap[supplierId]) color = colorMap[supplierId];
                else if (name && colorMap[name]) color = colorMap[name];
            }
            if (!color) {
                if (sidStr == null && (name == null || String(name).trim() === '')) {
                    color = PROVIDER_COLORS[i % PROVIDER_COLORS.length] || '#ff7f0e';
                } else {
                    color = getStableColor(sidStr || String(name || 'default'));
                }
            }
        } catch (_) {
            color = getStableColor('default');
        }
        if (!color) color = PROVIDER_COLORS[i % PROVIDER_COLORS.length] || '#ff7f0e';

        const txt = formatMetricText(metric, val);

        // Get Style from Helper
        const { shape, style, textStyle, showText } = getAdaptiveMarkerStyle(state, {
            x, y, barWidth, color, secondary, text: txt, fontBase, defaultH, CSS_BG, echarts
        });

        // Add invisible text to rect for data transport/tooltip if needed
        style.text = showText ? txt : '';
        style.textFill = 'transparent';

        const rectEl = {
            type: 'rect',
            shape: shape,
            style: style,
            z2: 100,
            transition: ['shape', 'style'],
        };
        children.push(rectEl);

        if (showText) {
            const textEl = {
                type: 'text',
                style: textStyle,
                z2: 101,
                silent: true,
                transition: ['style'],
            };
            children.push(textEl);
        }
    }
    return children;
}
