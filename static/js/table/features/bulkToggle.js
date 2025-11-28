// static/js/table/features/bulkToggle.js
// Responsibility: encapsulate bulk expand/collapse feature for standard and virtual tables
// NOTE: This module does not change business logic; it only centralizes operations used by UI handlers.

import { getTableBody, getMainToggleButtons, getExpandAllButton, isVirtualModeActive } from '../../dom/selectors.js';
import { renderCoordinator } from '../../rendering/render-coordinator.js';
import { expandAllMain, collapseAll, buildMainGroupId } from '../../state/expansionState.js';
import { getVirtualManager } from '../../state/moduleRegistry.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// --- Standard mode operations ---
export function expandAllPeersStandard() {
  const tbody = getTableBody();
  if (!tbody) return false;
  // Build full list of main group IDs from processed data to expand
  renderCoordinator.requestRender('table', async () => {
    try {
      const app = await import('../../data/tableProcessor.js');
      const { getMetricsData } = await import('../../state/appState.js');
      const data = getMetricsData();
      const { pagedData } = app.getProcessedData();
      const mainIds = Array.isArray(pagedData) ? pagedData.map(r => buildMainGroupId(r.main, r.destination)) : [];
      expandAllMain(mainIds);
      // Render standard table directly to avoid nested coordinator in TableController
      const mod = await import('../../dom/table.js');
      mod.renderGroupedTable(pagedData || [], data?.peer_rows || [], data?.hourly_rows || []);
    } catch (e) { logError(ErrorCategory.TABLE, 'bulkToggle', e); }
  }, { debounceMs: 0, cooldownMs: 0 });
  const btn = getExpandAllButton();
  if (btn) { btn.textContent = 'Hide All'; btn.dataset.state = 'shown'; }
  return true;
}

export function collapseAllPeersStandard() {
  const tbody = getTableBody();
  if (!tbody) return false;
  // Reset centralized expansion state and request a single coordinated render
  try { collapseAll(); } catch (e) { logError(ErrorCategory.TABLE, 'bulkToggle', e); }
  renderCoordinator.requestRender('table', async () => {
    try {
      // Render standard table directly to avoid nested coordinator in TableController
      const mod = await import('../../dom/table.js');
      const app = await import('../../data/tableProcessor.js');
      const { getMetricsData } = await import('../../state/appState.js');
      const data = getMetricsData();
      const { pagedData } = app.getProcessedData();
      mod.renderGroupedTable(pagedData || [], data?.peer_rows || [], data?.hourly_rows || []);
    } catch (e) { logError(ErrorCategory.TABLE, 'bulkToggle', e); }
  }, { debounceMs: 0, cooldownMs: 0 });
  const btn = getExpandAllButton();
  if (btn) { btn.textContent = 'Show All'; btn.dataset.state = 'hidden'; }
  return true;
}

// --- Virtual mode operations ---
function getVM() {
  return getVirtualManager();
}

export function expandAllPeersVirtual() {
  const vm = getVM();
  if (!vm) return false;
  if (typeof vm.showAllRows === 'function') vm.showAllRows();
  return true;
}

export function collapseAllPeersVirtual() {
  const vm = getVM();
  if (!vm) return false;
  if (typeof vm.hideAllRows === 'function') vm.hideAllRows();
  return true;
}

// --- Facade by environment ---
export function expandAllPeers() {
  return isVirtualModeActive() ? expandAllPeersVirtual() : expandAllPeersStandard();
}

export function collapseAllPeers() {
  return isVirtualModeActive() ? collapseAllPeersVirtual() : collapseAllPeersStandard();
}
