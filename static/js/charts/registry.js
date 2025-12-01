// static/js/charts/registry.js
// Responsibility: Chart renderer registry and lazy loading

// ─────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────

const registry = new Map();

// ─────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────

export function registerChart(type, renderer) {
  if (!type || typeof renderer !== 'function') return;
  registry.set(String(type).toLowerCase(), renderer);
}

export function getRenderer(type) {
  return registry.get(String(type || '').toLowerCase()) || null;
}

export function listTypes() {
  return Array.from(registry.keys());
}

// ─────────────────────────────────────────────────────────────
// Default registrations
// ─────────────────────────────────────────────────────────────

export async function ensureDefaults() {
  if (registry.size > 0) return;

  // lazy load to avoid circular deps
  const [lineModule, barModule] = await Promise.all([
    import('./echartsRenderer.js'),
    import('./echartsBarChart.js')
  ]);

  registerChart('line', lineModule.renderMultiLineChartEcharts);
  registerChart('bar', barModule.renderBarChartEcharts);
}
