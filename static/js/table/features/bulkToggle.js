// static/js/table/features/bulkToggle.js
// Responsibility: encapsulate bulk expand/collapse feature for standard and virtual tables
// NOTE: This module does not change business logic; it only centralizes operations used by UI handlers.

import { getTableBody, getMainToggleButtons, getExpandAllButton, isVirtualModeActive } from '../../dom/selectors.js';
import { renderCoordinator } from '../../rendering/render-coordinator.js';

// --- Standard mode operations ---
export function expandAllPeersStandard() {
  const tbody = getTableBody();
  if (!tbody) return false;
  // Collect all main group IDs from current DOM (visible mains)
  const mains = getMainToggleButtons(tbody);
  const mainIds = mains.map(btn => btn.dataset.targetGroup || btn.dataset.group).filter(Boolean);
  // Persist as global openGroups so renderers honor expanded state regardless of filters
  try {
    const g = (window.__openGroups || { main: [], hourly: [] });
    const uniq = Array.from(new Set([...(g.main || []), ...mainIds]));
    window.__openGroups = { main: uniq, hourly: Array.from(new Set(g.hourly || [])) };
  } catch (_) {}
  // Single coordinated render to materialize peers under all mains
  renderCoordinator.requestRender('table', async () => {
    try {
      // Render standard table directly to avoid nested coordinator in TableController
      const mod = await import('../../dom/table.js');
      const app = await import('../../data/tableProcessor.js');
      const { getMetricsData } = await import('../../state/appState.js');
      const data = getMetricsData();
      const { pagedData } = app.getProcessedData();
      mod.renderGroupedTable(pagedData || [], data?.peer_rows || [], data?.hourly_rows || []);
    } catch (_) {}
  }, { debounceMs: 0, cooldownMs: 0 });
  const btn = getExpandAllButton();
  if (btn) { btn.textContent = 'Hide All'; btn.dataset.state = 'shown'; }
  return true;
}

export function collapseAllPeersStandard() {
  const tbody = getTableBody();
  if (!tbody) return false;
  // Reset global openGroups and request a single coordinated render
  try { window.__openGroups = { main: [], hourly: [] }; } catch (_) {}
  renderCoordinator.requestRender('table', async () => {
    try {
      // Render standard table directly to avoid nested coordinator in TableController
      const mod = await import('../../dom/table.js');
      const app = await import('../../data/tableProcessor.js');
      const { getMetricsData } = await import('../../state/appState.js');
      const data = getMetricsData();
      const { pagedData } = app.getProcessedData();
      mod.renderGroupedTable(pagedData || [], data?.peer_rows || [], data?.hourly_rows || []);
    } catch (_) {}
  }, { debounceMs: 0, cooldownMs: 0 });
  const btn = getExpandAllButton();
  if (btn) { btn.textContent = 'Show All'; btn.dataset.state = 'hidden'; }
  return true;
}

// --- Virtual mode operations ---
function getVM() {
  const tableRenderer = window.tableRenderer;
  if (tableRenderer && tableRenderer.virtualManager) return tableRenderer.virtualManager;
  if (window.virtualManager) return window.virtualManager;
  if (window.appInitializer && window.appInitializer.tableController && window.appInitializer.tableController.tableRenderer) {
    return window.appInitializer.tableController.tableRenderer.virtualManager || null;
  }
  return null;
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
