// static/js/init/d3-dashboard.js
// Responsibility: Dashboard initialization (filters + charts)
import { initFilters } from '../dom/filters.js';
import { initChartControls } from '../charts/ui/chartControls.js';
import { renderManager } from '../charts/services/renderManager.js';
import { ensureDefaults } from '../charts/registry.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { isChartsInitDone, setChartsInitDone } from '../state/runtimeFlags.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const CONTROLS_ID = 'charts-controls';
const DEFAULT_CHART_TYPE = 'line';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getSelectedChartType() {
  const controls = document.getElementById(CONTROLS_ID);
  return controls?.dataset?.type || DEFAULT_CHART_TYPE;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export async function initD3Dashboard() {
  if (isChartsInitDone()) return;

  try { setChartsInitDone(true); } catch (e) { logError(ErrorCategory.INIT, 'initD3Dashboard', e); }

  initFilters();

  try { await ensureDefaults(); } catch (e) { logError(ErrorCategory.INIT, 'initD3Dashboard:registry', e); }

  initChartControls();
  renderManager.render(getSelectedChartType());
}
