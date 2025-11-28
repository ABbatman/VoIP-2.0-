// static/js/dom/table-controls.js
// This module is responsible for initializing and handling events
// for the table's user interface controls (pagination, global filter).

// Import state management functions
import {
  setFullData,
  setColumnFilter,
  resetAllFilters,
  setMultiSort,
} from "../state/tableState.js";
import { expandAllPeers, collapseAllPeers } from "../table/features/bulkToggle.js";

// Import UI update functions
import {
  showTableControls,
  updateSortArrows,
} from "./table-ui.js";
import { updateTopScrollbar } from "./top-scrollbar.js";
import { getVirtualManager } from "../state/moduleRegistry.js";

/**
 * Initializes all event handlers for the table controls.
 * @param {Array<Object>} allMainRows - The full dataset of main rows.
 * @param {Array<Object>} allPeerRows - The full dataset of peer rows.
 */
export function initTableControls(allMainRows, allPeerRows, allHourlyRows = []) {
  setFullData(allMainRows, allPeerRows, allHourlyRows);

  // rowsPerPage removed - no pagination needed

  // Pagination removed - virtualization handles all data display

  // Note: Filter event handlers are now connected in renderTableFooter()
  // to ensure they are attached after the DOM elements are created

  // Show table controls and update UI by calling functions from the DOM module
  initExpandCollapseAll();
  showTableControls();
  // Enforce default multi-sort: main ASC, destination ASC
  try {
    setMultiSort([
      { key: "destination", dir: "asc" },
      { key: "main", dir: "asc" },
    ]);
  } catch (_) { /* intentional no-op: default sort not critical */ }
  // --- REMOVED: This is now handled automatically by table-ui.js ---
  // updateColumnPlaceholders();
  updateSortArrows(); // delegated sorting handler covers clicks globally

  // Setup automatic filter clearing
  setupAutoFilterClearing();
}

// --- "Show All / Hide All" button logic ---
function initExpandCollapseAll() {
  const toggleBtn = document.getElementById("btnExpandCollapseAll");
  const tableBody = document.getElementById("tableBody");

  if (!toggleBtn || !tableBody) {
    console.warn("Expand/Collapse All button or table body not found.");
    return;
  }

  const newBtn = toggleBtn.cloneNode(true);
  toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);

  newBtn.addEventListener("click", () => {
    const state = newBtn.dataset && newBtn.dataset.state ? newBtn.dataset.state : null;
    const isShowAllAction = state ? (state !== 'shown') : (newBtn.textContent === 'Show All');

    // Delegate to centralized feature module (auto-selects mode: standard/virtual)
    if (isShowAllAction) {
      expandAllPeers();
    } else {
      collapseAllPeers();
    }

    setTimeout(updateTopScrollbar, 100);
  });
}

// --- EVENT HANDLERS ---

// Pagination handlers removed - no longer needed with virtualization
// Filter event handlers are now defined in table-ui.js

/**
 * Clear all table filters (column filters and global filter)
 */
export function clearAllTableFilters() {
  // Clear all column filters
  resetAllFilters();

  // Clear global filter input
  const globalFilterInput = document.getElementById("table-filter-input");
  if (globalFilterInput) {
    globalFilterInput.value = "";
  }

  // Clear all column filter inputs
  const filterRow = document.getElementById("column-filters-row");
  if (filterRow) {
    filterRow.querySelectorAll("input").forEach((input) => {
      input.value = "";
    });
  }

  // Force table refresh after clearing all filters
  const vm = getVirtualManager();
  if (vm && vm.isActive) {
    console.log("🔄 Refreshing table after clearing all filters...");
    vm.refreshVirtualTable();
  }

  // Reconnect filter event handlers after clearing
  try {
    // Import connectFilterEventHandlers from table-ui.js
    import("./table-ui.js").then(({ connectFilterEventHandlers }) => {
      if (typeof connectFilterEventHandlers === 'function') {
        connectFilterEventHandlers();
      }
    });
  } catch (error) {
    console.warn("⚠️ Could not reconnect filter handlers:", error);
  }

  console.log("🧹 All table filters cleared");
}

/**
 * Setup automatic filter clearing when input values are cleared
 */
export function setupAutoFilterClearing() {
  // Note: Auto-clearing is now handled by the filter event handlers in table-ui.js
  // This function is kept for compatibility but the actual clearing logic
  // is integrated into the main filter change handlers

  console.log("🔧 Auto filter clearing setup completed (handled by table-ui.js)");
}

/**
 * Clear a specific column filter
 * @param {string} columnKey - The column key to clear filter for
 */
export function clearColumnFilter(columnKey) {
  // Clear the filter in state
  setColumnFilter(columnKey, "");

  // Clear the input value
  const filterRow = document.getElementById("column-filters-row");
  if (filterRow) {
    const input = filterRow.querySelector(`input[data-filter-key="${columnKey}"]`);
    if (input) {
      input.value = "";
    }
  }

  // Force table refresh after clearing filter
  const vmFilter = getVirtualManager();
  if (vmFilter && vmFilter.isActive) {
    console.log("🔄 Refreshing table after filter clear...");
    vmFilter.refreshVirtualTable();
  }

  console.log(`🧹 Column filter "${columnKey}" cleared`);
}
