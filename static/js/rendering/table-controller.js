// Table Controller Module - Single Responsibility: Control Table Rendering Logic
// Localized comments in English as requested

import { getProcessedData } from "../data/tableProcessor.js";
import { renderGroupedTable } from "../dom/table.js";
import { updateTableFooter } from "../dom/table-ui.js";
import { initTooltips } from "../dom/tooltip.js";
import { getMetricsData } from "../state/appState.js";
import { getState } from "../state/tableState.js";
import { TableRenderer } from "./table-renderer.js";
import { renderCoordinator } from "./render-coordinator.js";
import { renderTableHeader, renderTableFooter as buildTableFooter, showTableControls, initTableView } from "../dom/table-ui.js";
import { initTableControls } from "../dom/table-controls.js";
import { initStickyFooter, initStickyHeader } from "../dom/sticky-table-chrome.js";

/**
 * Table Controller - Manages table rendering lifecycle
 * Responsibility: Control when and how tables are rendered
 */
export class TableController {
  constructor() {
    this.tableRenderer = null;
    this.isInitialized = false;
  }

  /**
   * Initialize table controller with renderer
   */
  async initialize() {
    try {
      console.log("🔍 Table Controller: Initializing...");

      this.tableRenderer = new TableRenderer();
      const success = await this.tableRenderer.initialize();

      if (success) {
        console.log("✅ Table Controller: Initialized with virtual capabilities");
      } else {
        console.log("✅ Table Controller: Initialized with standard rendering only");
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error("❌ Table Controller: Initialization error", error);
      this.tableRenderer = null;
      return false;
    }
  }

  /**
   * Main table redraw function
   * Responsibility: Coordinate complete table rendering cycle
   */
  redrawTable(loadedState = null) {
    try {
      // 1. Check if we have data
      const appData = getMetricsData();
      if (!appData) {
        this.handleNoData(loadedState);
        return;
      }

      // 2. Process data
      const { pagedData, peerRows, hourlyRows } = getProcessedData();

      // 3. Render table via RenderCoordinator (same 'table' kind as Summary)
      this.renderTableWithData(pagedData, appData, peerRows, hourlyRows);
    } catch (error) {
      console.error("❌ Table Controller: Redraw error", error);
    }
  }

  /**
   * Handle case when no data is available
   */
  handleNoData(loadedState) {
    if (loadedState) {
      console.log("URL state is present, but data not yet fetched. Waiting for 'Find' click.");
    } else {
      console.log("❌ ABORT: No appData available.");
    }
    console.groupEnd();
  }

  /**
   * Get current table state for logging
   */
  getCurrentTableState() {
    const { globalFilterQuery, columnFilters } = getState();
    return {
      globalFilterQuery,
      columnFilters,
    };
  }

  /**
   * Render table with processed data
   */
  renderTableWithData(pagedData, appData, processedPeerRows, processedHourlyRows) {
    const main_rows = pagedData || [];
    // Use processed rows if available (from zoom/filter), otherwise fallback to appData
    const peer_rows = processedPeerRows || appData?.peer_rows || [];
    let hourly_rows = processedHourlyRows || appData?.hourly_rows || [];
    try {
      const ci = (typeof window !== 'undefined' && window.__chartsCurrentInterval) ? String(window.__chartsCurrentInterval) : '1h';
      if (ci === '5m' && Array.isArray(appData?.five_min_rows) && appData.five_min_rows.length > 0) {
        hourly_rows = appData.five_min_rows;
      }
    } catch (_) {
      // Ignore table controller errors
    }
    // Use coordinator; coalesce with Summary by sharing kind 'table'
    renderCoordinator.requestRender('table', async () => {
      // Prepare
      try { renderTableHeader(); } catch (_) {
        // Ignore table controller errors
      }
      try { buildTableFooter(); } catch (_) {
        // Ignore table controller errors
      }
      try { showTableControls(); } catch (_) {
        // Ignore table controller errors
      }
      try { initTableControls(main_rows, peer_rows, hourly_rows); } catch (_) {
        // Ignore table controller errors
      }
      // Clear
      try { const tb = document.getElementById('tableBody'); if (tb) tb.innerHTML = ''; } catch (_) {
        // Ignore table controller errors
      }
      // Render
      if (this.tableRenderer && this.isInitialized) {
        await this.tableRenderer.renderTable(main_rows, peer_rows, hourly_rows);
      } else {
        renderGroupedTable(main_rows, peer_rows, hourly_rows);
      }
      // Post
      try { initTableView(); } catch (_) {
        // Ignore table controller errors
      }
      try { initStickyHeader(); } catch (_) {
        // Ignore table controller errors
      }
      try { initStickyFooter(); } catch (_) {
        // Ignore table controller errors
      }
      try { updateTableFooter(); } catch (_) {
        // Ignore table controller errors
      }
      try { initTooltips(); } catch (_) {
        // Ignore table controller errors
      }
    }, { debounceMs: 200 });
  }

  /**
   * Update table UI after rendering
   */
  updateTableUI() {
    updateTableFooter();
    initTooltips();
  }

  /**
   * Get controller status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      hasRenderer: !!this.tableRenderer,
      rendererStatus: this.tableRenderer ? this.tableRenderer.getStatus() : null
    };
  }

  /**
   * Cleanup controller
   */
  destroy() {
    if (this.tableRenderer) {
      this.tableRenderer.destroy();
      this.tableRenderer = null;
    }
    this.isInitialized = false;
    console.log('🗑️ Table Controller: Destroyed');
  }
}
