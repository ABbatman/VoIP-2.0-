// static/js/init/d3-init.js
// Minimal D3 bootstrap. Keeps main.js clean.

import * as d3 from 'd3';

export function initD3() {
  // Expose for console debugging only (non-breaking)
  window.d3 = d3;

  // Enable ECharts renderers globally (read by initD3Dashboard)
  window.__chartsUseEcharts = true;
  
  import('./d3-dashboard.js').then(m => m.initD3Dashboard()).catch(err => {
    console.error('[d3-init] Failed to load dashboard:', err);
  });

  console.debug('[d3-init] loaded');

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
