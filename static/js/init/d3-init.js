// static/js/init/d3-init.js
// Removed D3 usage; ECharts is the sole charting system.

export function initD3() {
  // Enable ECharts renderers globally (read by initD3Dashboard)
  window.__chartsUseEcharts = true;
  
  import('./d3-dashboard.js').then(m => m.initD3Dashboard()).catch(err => {
    console.error('[d3-init] Failed to load dashboard:', err);
  });

  console.debug('[d3-init] loaded (ECharts mode)');

  // Example: ensure a dedicated D3 root container exists (no DOM changes if present)
  const id = 'd3-root';
  if (!document.getElementById(id)) {
    const container = document.createElement('div');
    container.id = id;
    container.style.display = 'none'; // placeholder, no UI changes yet
    document.body.appendChild(container);
  }
  // No charts here; this module switches dashboard into ECharts mode only.
}
