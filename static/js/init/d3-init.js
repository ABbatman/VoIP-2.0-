// static/js/init/d3-init.js
// Responsibility: Entry point for charts (ECharts mode)
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ROOT_ID = 'd3-root';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ensureRootContainer() {
  if (document.getElementById(ROOT_ID)) return;

  const container = document.createElement('div');
  container.id = ROOT_ID;
  container.style.display = 'none';
  document.body.appendChild(container);
}

async function loadDashboard() {
  try {
    const { initD3Dashboard } = await import('./d3-dashboard.js');
    await initD3Dashboard();
  } catch (e) {
    logError(ErrorCategory.INIT, 'd3Init:loadDashboard', e);
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initD3() {
  window.__chartsUseEcharts = true;
  ensureRootContainer();
  loadDashboard();
}
