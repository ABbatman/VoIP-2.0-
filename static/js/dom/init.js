// static/js/dom/init.js

import { getProcessedData } from "../data/tableProcessor.js";
import { renderGroupedTable, initTableInteractions } from "./table.js";
import { initFilters } from "./filters.js";
import { initSummary } from "./summary.js";
import { initTableView, updateTableFooter } from "./table-ui.js";
import { initUiFeedback } from "./ui-feedback.js";
import { getMetricsData, isReverseMode } from "../state/appState.js";
import { subscribe } from "../state/eventBus.js";
import { getState, setPage } from "../state/tableState.js";
import { initTooltips } from "./tooltip.js";
import { initYColumnToggle } from "./hideYColumns.js";
import { initUrlStateSync, loadStateFromUrl } from "../state/urlState.js";
import { initTopScrollbar } from "./top-scrollbar.js";
import { initLayoutSync, updateReverseButtonState } from "./layout.js";

document.addEventListener("DOMContentLoaded", () => {
  initTopScrollbar();
});

export function initApp() {
  console.log("🚀 Initializing application...");

  // 1. Load state from URL.
  const loadedState = loadStateFromUrl();

  // 2. Initialize all modules and their event listeners.
  initSummary();
  initTableView();
  initUiFeedback();
  initYColumnToggle();
  initLayoutSync();
  initUrlStateSync();
  initFilters(!!loadedState);
  initTableInteractions();

  // 3. Manually apply the initial UI state for the reverse button.
  updateReverseButtonState(isReverseMode());

  const redrawTable = () => {
    // ... (redrawTable function is unchanged)
    console.groupCollapsed("[DEBUG] redrawTable cycle");
    const appData = getMetricsData();
    if (!appData) {
      if (loadedState) {
        console.log(
          "URL state is present, but data not yet fetched. Waiting for 'Find' click."
        );
      } else {
        console.log("❌ ABORT: No appData available.");
      }
      console.groupEnd();
      return;
    }
    const { currentPage, rowsPerPage, globalFilterQuery, columnFilters } =
      getState();
    console.log("Current state:", {
      currentPage,
      rowsPerPage,
      globalFilterQuery,
      columnFilters,
    });
    const { pagedData, totalFiltered } = getProcessedData();
    console.log(
      `Data processed: ${pagedData?.length} rows for current page, ${totalFiltered} total filtered rows.`
    );
    const totalPages = Math.ceil(totalFiltered / rowsPerPage) || 1;
    console.log(
      `Page check: currentPage is ${currentPage}, totalPages is ${totalPages}.`
    );
    if (currentPage > totalPages) {
      console.warn(
        `❗️Page FIX: Current page (${currentPage}) > total pages (${totalPages}). Resetting to ${totalPages}.`
      );
      console.groupEnd();
      setPage(totalPages);
      return;
    }
    console.log("✅ OK: Proceeding to render table and footer.");
    renderGroupedTable(pagedData, appData.peer_rows, appData.hourly_rows);
    updateTableFooter(totalFiltered);
    initTooltips();
    console.groupEnd();
  };

  // --- MODIFIED: The table only redraws when its own state changes. ---
  subscribe("tableState:changed", redrawTable);
  // The subscription to appState:reverseModeChanged is removed.

  // 4. Hide main content areas initially.
  const resultsContainer = document.querySelector(".results-display");
  const summaryMetricsContainer = document.getElementById("summaryMetrics");
  if (resultsContainer) resultsContainer.style.display = "none";
  if (summaryMetricsContainer) summaryMetricsContainer.style.display = "none";

  // 5. If a state was loaded, auto-click "Find".
  if (loadedState) {
    console.log('▶️ Triggering "Find" to fetch data for the loaded URL state.');
    document.getElementById("findButton").click();
  }
}
