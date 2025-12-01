// static/js/table/features/bulkToggle.js
// Responsibility: Bulk expand/collapse for standard and virtual tables
import { getTableBody, getExpandAllButton, isVirtualModeActive } from '../../dom/selectors.js';
import { renderCoordinator } from '../../rendering/render-coordinator.js';
import { expandAllMain, collapseAll, buildMainGroupId } from '../../state/expansionState.js';
import { getVirtualManager } from '../../state/moduleRegistry.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const RENDER_OPTIONS = { debounceMs: 0, cooldownMs: 0 };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function getTableData() {
  const app = await import('../../data/tableProcessor.js');
  const { getMetricsData } = await import('../../state/appState.js');
  const data = getMetricsData();
  const { pagedData } = app.getProcessedData();
  return { pagedData, peerRows: data?.peer_rows || [], hourlyRows: data?.hourly_rows || [] };
}

async function renderStandardTable() {
  const mod = await import('../../dom/table.js');
  const { pagedData, peerRows, hourlyRows } = await getTableData();
  mod.renderGroupedTable(pagedData || [], peerRows, hourlyRows);
}

function updateButton(text, state) {
  const btn = getExpandAllButton();
  if (btn) {
    btn.textContent = text;
    btn.dataset.state = state;
  }
}

// ─────────────────────────────────────────────────────────────
// Standard mode
// ─────────────────────────────────────────────────────────────

export function expandAllPeersStandard() {
  if (!getTableBody()) return false;

  renderCoordinator.requestRender('table', async () => {
    try {
      const { pagedData } = await getTableData();
      const mainIds = Array.isArray(pagedData)
        ? pagedData.map(r => buildMainGroupId(r.main, r.destination))
        : [];
      expandAllMain(mainIds);
      await renderStandardTable();
    } catch (e) {
      logError(ErrorCategory.TABLE, 'bulkToggle:expandStandard', e);
    }
  }, RENDER_OPTIONS);

  updateButton('Hide All', 'shown');
  return true;
}

export function collapseAllPeersStandard() {
  if (!getTableBody()) return false;

  try { collapseAll(); } catch (e) { logError(ErrorCategory.TABLE, 'bulkToggle:collapseAll', e); }

  renderCoordinator.requestRender('table', async () => {
    try {
      await renderStandardTable();
    } catch (e) {
      logError(ErrorCategory.TABLE, 'bulkToggle:collapseStandard', e);
    }
  }, RENDER_OPTIONS);

  updateButton('Show All', 'hidden');
  return true;
}

// ─────────────────────────────────────────────────────────────
// Virtual mode
// ─────────────────────────────────────────────────────────────

export function expandAllPeersVirtual() {
  const vm = getVirtualManager();
  if (!vm) return false;
  if (typeof vm.showAllRows === 'function') vm.showAllRows();
  return true;
}

export function collapseAllPeersVirtual() {
  const vm = getVirtualManager();
  if (!vm) return false;
  if (typeof vm.hideAllRows === 'function') vm.hideAllRows();
  return true;
}

// ─────────────────────────────────────────────────────────────
// Facade
// ─────────────────────────────────────────────────────────────

export const expandAllPeers = () =>
  isVirtualModeActive() ? expandAllPeersVirtual() : expandAllPeersStandard();

export const collapseAllPeers = () =>
  isVirtualModeActive() ? collapseAllPeersVirtual() : collapseAllPeersStandard();
