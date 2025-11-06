// static/js/charts/registry.js
// Chart registry and router to keep modularity

const _registry = new Map();

export function registerChart(type, renderer) {
  if (!type || typeof renderer !== 'function') return;
  _registry.set(String(type).toLowerCase(), renderer);
}

export function getRenderer(type) {
  return _registry.get(String(type || '').toLowerCase()) || null;
}

export function listTypes() {
  return Array.from(_registry.keys());
}

// Bootstrap default registrations lazily to avoid circular deps
export async function ensureDefaults() {
  if (_registry.size > 0) return;
  // Removed D3 usage; ECharts is the sole charting system.
  const [{ renderMultiLineChartEcharts }, { renderBarChartEcharts }] = await Promise.all([
    import('./echartsRenderer.js'),
    import('./echartsBarChart.js'),
  ]);
  registerChart('line', renderMultiLineChartEcharts);
  registerChart('bar', renderBarChartEcharts);
}
