// static/js/charts/echarts/helpers/colors.js
// stable palette + mapping per supplier
// Avoid greys to keep labels visibly distinct
export const PROVIDER_COLORS = [
  '#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b',
  '#e377c2','#bcbd22','#17becf','#4e79a7','#f28e2b',
  '#59a14f','#e15759','#76b7b2','#edc949','#af7aa1',
  '#ff9da7','#9c755f','#06b6d4','#f97316','#10b981'
];

export function getStableColor(name, suggested) {
  // stable color per supplier across renders
  try {
    const w = (typeof window !== 'undefined') ? window : {};
    w.__supplierColorMap = w.__supplierColorMap || Object.create(null);
    w.__supplierColorIdx = Number.isFinite(w.__supplierColorIdx) ? w.__supplierColorIdx : 0;
    const key = String(name || '').trim();
    if (!key) return suggested || PROVIDER_COLORS[0];
    if (w.__supplierColorMap[key]) return w.__supplierColorMap[key];
    const pool = PROVIDER_COLORS;
    const color = suggested || pool[w.__supplierColorIdx % pool.length];
    w.__supplierColorMap[key] = color;
    w.__supplierColorIdx = (w.__supplierColorIdx + 1) % pool.length;
    return color;
  } catch(_) {
    return suggested || PROVIDER_COLORS[0];
  }
}

export const MAIN_BLUE = '#4f86ff';
