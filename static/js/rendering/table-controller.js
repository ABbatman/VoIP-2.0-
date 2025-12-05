// static/js/rendering/table-controller.js
// Responsibility: Table rendering lifecycle management
import { getProcessedData } from '../data/tableProcessor.js';
import { renderGroupedTable } from '../dom/table.js';
import { updateTableFooter, renderTableHeader, renderTableFooter, showTableControls, initTableView } from '../dom/table-ui.js';
import { initTooltips } from '../dom/tooltip.js';
import { getMetricsData } from '../state/appState.js';
import { TableRenderer } from './table-renderer.js';
import { renderCoordinator } from './render-coordinator.js';
import { initTableControls } from '../dom/table-controls.js';
import { initStickyFooter, initStickyHeader } from '../dom/sticky-table-chrome.js';
import { getChartsCurrentInterval } from '../state/runtimeFlags.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { showLoadingOverlay, hideLoadingOverlay } from '../dom/ui-feedback.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const RENDER_DEBOUNCE_MS = 200;
const TABLE_BODY_ID = 'tableBody';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function safeCall(fn) {
  try { fn(); } catch (e) { logError(ErrorCategory.TABLE, 'tableController', e); }
}

function clearTableBody() {
  const tbody = document.getElementById(TABLE_BODY_ID);
  if (tbody) tbody.innerHTML = '';
}

function getHourlyRows(appData, processedHourlyRows) {
  const ci = getChartsCurrentInterval();
  if (ci === '5m' && appData?.five_min_rows?.length) {
    return appData.five_min_rows;
  }
  return processedHourlyRows || appData?.hourly_rows || [];
}

// ─────────────────────────────────────────────────────────────
// TableController class
// ─────────────────────────────────────────────────────────────

export class TableController {
  constructor() {
    this.tableRenderer = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      this.tableRenderer = new TableRenderer();
      await this.tableRenderer.initialize();
      this.isInitialized = true;
      return true;
    } catch (e) {
      logError(ErrorCategory.TABLE, 'TableController:initialize', e);
      this.tableRenderer = null;
      return false;
    }
  }

  redrawTable(loadedState = null) {
    const appData = getMetricsData();
    if (!appData) return;

    const { pagedData, peerRows, hourlyRows } = getProcessedData();
    this._renderWithData(pagedData, appData, peerRows, hourlyRows);
  }

  _renderWithData(pagedData, appData, processedPeerRows, processedHourlyRows) {
    const mainRows = pagedData || [];
    const peerRows = processedPeerRows || appData?.peer_rows || [];
    const hourlyRows = getHourlyRows(appData, processedHourlyRows);

    renderCoordinator.requestRender('table', async () => {
      // show overlay at start of actual render
      showLoadingOverlay();

      try {
        // prepare UI
        safeCall(renderTableHeader);
        safeCall(renderTableFooter);
        safeCall(showTableControls);
        safeCall(() => initTableControls(mainRows, peerRows, hourlyRows));

        // clear and render
        safeCall(clearTableBody);

        if (this.tableRenderer && this.isInitialized) {
          await this.tableRenderer.renderTable(mainRows, peerRows, hourlyRows);
        } else {
          renderGroupedTable(mainRows, peerRows, hourlyRows);
        }

        // post-render
        safeCall(initTableView);
        safeCall(initStickyHeader);
        safeCall(initStickyFooter);
        safeCall(updateTableFooter);
        safeCall(initTooltips);
      } finally {
        hideLoadingOverlay();
      }
    }, { debounceMs: RENDER_DEBOUNCE_MS });
  }

  updateTableUI() {
    updateTableFooter();
    initTooltips();
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      hasRenderer: !!this.tableRenderer,
      rendererStatus: this.tableRenderer?.getStatus() ?? null
    };
  }

  destroy() {
    if (this.tableRenderer) {
      this.tableRenderer.destroy();
      this.tableRenderer = null;
    }
    this.isInitialized = false;
  }
}
