// static/js/visualEnhancements/adaptiveMarkers.js
import { clamp } from './visualMapping.js';

/**
 * Determines the visual state of the marker based on bar width.
 * @param {number} barWidth 
 * @returns {number} State 2-5 (User requested: Dot, Small Pill, Medium Pill, Full Capsule)
 */
export function getAdaptiveMarkerState(barWidth) {
    if (barWidth >= 22) return 5;      // Large: Full capsule
    if (barWidth >= 12) return 4;      // Medium: Pill + small text
    if (barWidth >= 6) return 3;       // Small: Pill no text
    return 2;                          // < 6px: Dot (User said "dot", previously we had Tick for <6, but request implies Dot)
}

/**
 * Returns the shape and style for a given marker state.
 * @param {number} state - State 2-5
 * @param {Object} params - { x, y, barWidth, color, secondary, text, fontBase, defaultH, CSS_BG }
 * @returns {Object} { shape, style, textStyle, showText }
 */
export function getAdaptiveMarkerStyle(state, { x, y, barWidth, color, secondary, text, fontBase, defaultH, CSS_BG, echarts }) {
    let shape = {};
    let style = {};
    let textStyle = {};
    let showText = false;

    if (state <= 2) {
        // State 2: Dot (Circle) - for < 6px
        const d = Math.min(Math.max(2, barWidth * 0.8), 5); // Adaptive dot size
        shape = { x: x - d / 2, y: y - d / 2, width: d, height: d, r: d / 2 };
        style = { fill: CSS_BG(), stroke: color, lineWidth: 1.5, opacity: secondary ? 0.8 : 1 };
        showText = false;
    } else if (state === 3) {
        // State 3: Small Pill (Capsule, no text) - for 6px <= w < 12px
        const w = barWidth * 0.7;
        const h = Math.max(4, Math.min(barWidth * 0.4, 8));
        shape = { x: x - w / 2, y: y - h / 2, width: w, height: h, r: h / 2 };
        style = { fill: CSS_BG(), stroke: color, lineWidth: 1.5, opacity: secondary ? 0.8 : 1 };
        showText = false;
    } else if (state === 4) {
        // State 4: Medium Pill + Small Text - for 12px <= w < 22px
        const w = barWidth * 0.85;
        const h = Math.max(10, barWidth * 0.35);
        const fontSize = clamp(barWidth * 0.25, 8, 14);
        shape = { x: x - w / 2, y: y - h / 2, width: w, height: h, r: h / 2 };
        style = { fill: CSS_BG(), stroke: color, lineWidth: 1, opacity: secondary ? 0.9 : 1 };
        textStyle = {
            text: text, x, y, align: 'center', verticalAlign: 'middle',
            font: `600 ${fontSize}px ${fontBase}`, fill: color, opacity: 1
        };
        showText = true;
    } else {
        // State 5: Large Full Capsule - for w >= 22px
        const fontSize = clamp(barWidth * 0.25, 10, 14); // slightly larger min for full capsule
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
    formatMetricText, CSS_BG, getStableColor, PROVIDER_COLORS, echarts
}) {
    // 1. Calculate Bar Width
    const size = api.size([Number(stepMs), 0]);
    const barWidth = Array.isArray(size) ? Math.abs(size[0]) : 0;

    // 2. Determine State (1-5) using estimated actual bar width (35% of category)
    const actualBarWidth = barWidth * 0.35;
    const state = getAdaptiveMarkerState(actualBarWidth);

    const children = [];
    const fontBase = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

    for (let i = 0; i < grouped.length; i++) {
        const { supplierId, name, value: val } = grouped[i];
        const c = api.coord([ts, val]);
        let x = Math.round(c[0]);

        // Alignment logic
        try {
            // Offset to center on the bar (gap 15% -> offset approx 60% of bar width)
            const dx = (actualBarWidth * 0.6);

            // ALWAYS align to 'current' (Blue) as per request G
            // "Markers... MUST be horizontally centered on the BLUE bar (today)"
            // Blue is on the Right (positive offset) in our side-by-side layout
            x = Math.round(x + dx);
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
            x, y, barWidth: actualBarWidth, color, secondary, text: txt, fontBase, defaultH, CSS_BG, echarts
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
