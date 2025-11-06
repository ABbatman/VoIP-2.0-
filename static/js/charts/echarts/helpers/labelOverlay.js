// static/js/charts/echarts/helpers/labelOverlay.js
// overlay labels: customSeries on top of bars (no calc here)
import { getStableColor } from './colors.js';

export function buildLabelOverlay({ metric, timestamps, labels, colorMap, gridIndex, xAxisIndex, yAxisIndex, secondary = false, stepMs, align = 'current' }) {
  // custom series: draw labels via renderItem only
  const dataTs = Array.isArray(timestamps)
    ? Array.from(new Set(timestamps.map(t => Number(t)).filter(Number.isFinite))).sort((a,b) => a - b)
    : [];
  const id = `labels_overlay_${metric || ''}_${xAxisIndex}_${yAxisIndex}`;
  const getByTs = (ts) => {
    const sec = Math.floor(Number(ts) / 1000);
    return (labels && (labels[ts] || labels[String(ts)] || labels[sec] || labels[String(sec)])) || [];
  };

  return {
    id,
    name: 'LabelsOverlay',
    type: 'custom',
    coordinateSystem: 'cartesian2d',
    gridIndex: Number.isFinite(gridIndex) ? Number(gridIndex) : undefined,
    xAxisIndex: Number(xAxisIndex),
    yAxisIndex: Number(yAxisIndex),
    silent: true,
    tooltip: { show: false },
    z: 100,
    zlevel: 100,
    renderItem: (_params, api) => {
      // overlay labels: visual-only sorting and formatting
      const ts = api.value(0);
      const raw = getByTs(ts);
      if (!Array.isArray(raw) || raw.length === 0) return null;
      // normalize entries: { supplierId, value }
      const entries = raw
        .map((it, idx) => {
          if (typeof it === 'number') {
            return { supplierId: null, value: Number(it) };
          }
          const sid = (it && (it.supplierId ?? it.supplier ?? it.id ?? it.name)) ?? null;
          const val = Number(it && (it.value ?? it.v ?? it.ASR ?? it.ACD));
          return { supplierId: sid, value: val };
        })
        .filter(e => Number.isFinite(e.value));
      if (!entries.length) return null;
      // sort asc visually (no business calc)
      entries.sort((a,b) => a.value - b.value);
      const children = [];
      for (let i = 0; i < entries.length; i++) {
        const { supplierId, value } = entries[i];
        const c = api.coord([ts, value]);
        // align horizontally to a specific bar within the category band using step-based pixel shift
        let x = Math.round(c[0]);
        try {
          const frac = 0.18; // visual fraction of step to approximate bar center
          const dx = Array.isArray(api.size ? api.size([Number(stepMs) * frac, 0]) : null) ? (api.size([Number(stepMs) * frac, 0])[0] || 0) : 0;
          if (align === 'current') x = Math.round(x - dx);
          else if (align === 'prev') x = Math.round(x + dx);
        } catch(_) { /* keep center */ }
        const y = Math.round(c[1] - i * 16); // visual stacking upwards
        const color = (supplierId != null && colorMap && colorMap[supplierId]) ? colorMap[supplierId] : getStableColor(String(supplierId ?? 'default')); // color mapping
        children.push({
          type: 'text',
          style: {
            text: Number(value).toFixed(1), // visual format only
            x,
            y,
            align: 'center',
            verticalAlign: 'middle',
            fontSize: 11,
            fontWeight: 600,
            fill: color,
            opacity: secondary ? 0.6 : 1, // secondary hierarchy via opacity
          },
          silent: true,
        });
      }
      if (!children.length) return null;
      return { type: 'group', children };
    },
    data: dataTs.map(ts => [ts])
  };
}

// compatibility helper if older import name is used
export const createLabelOverlaySeries = (args) =>
  buildLabelOverlay({ metric: args?.metric, timestamps: args?.timestamps, labels: args?.labelsMap || args?.labels, colorMap: args?.colorMap, gridIndex: args?.gridIndex, xAxisIndex: args?.xAxisIndex, yAxisIndex: args?.yAxisIndex, secondary: args?.secondary });
