// static/js/init/d3-init.js
// Minimal D3 bootstrap. Keeps main.js clean.

import * as d3 from 'd3';

export function initD3() {
  // Expose for console debugging only (non-breaking)
  try { window.d3 = d3; } catch (_) {}
  // Enable ECharts renderers globally (read by initD3Dashboard)
  try { window.__chartsUseEcharts = true; } catch (_) {}

  // Example: ensure a dedicated D3 root container exists (no DOM changes if present)
  const id = 'd3-root';
  if (!document.getElementById(id)) {
    const container = document.createElement('div');
    container.id = id;
    container.style.display = 'none'; // placeholder, no UI changes yet
    document.body.appendChild(container);
  }

  // No charts here; this module is a single entry-point to import d3 API where needed.
}

export { d3 };
