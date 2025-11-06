// static/js/init/d3-dashboard.js
// D3 dashboard entry-point: prepares chart area and exposes a simple UI to switch chart types

import { initFilters } from '../dom/filters.js';
import { initChartControls } from '../charts/ui/chartControls.js';
import { renderManager } from '../charts/services/renderManager.js';
import { ensureDefaults } from '../charts/registry.js';

// init - thin facade only

export async function initD3Dashboard() {
  try {
    if (typeof window !== 'undefined') {
      if (window.__chartsInitDone) return;
      window.__chartsInitDone = true;
    }
  } catch(_) {}

  initFilters();
  // make sure registry is populated so UI lists only real types
  try { await ensureDefaults(); } catch(_) {}
  initChartControls();
  const controls = document.getElementById('charts-controls');
  const selected = (controls && controls.dataset && controls.dataset.type) ? controls.dataset.type : 'line';
  renderManager.render(selected);
}
