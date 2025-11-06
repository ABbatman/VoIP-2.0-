// Archived stub: D3 brush zoom overlay is deprecated.
// Reason: ECharts dataZoom is the standard chart zoom now.
// Safety: keep the same export but make it a no-op to avoid breaking imports.

export function attachChartZoom(_mount, _opts = {}) {
  // no-op; return a cleanup function for compatibility
  return () => {};
}
