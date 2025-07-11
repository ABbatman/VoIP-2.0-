// static/js/dom/table-controls.js
// This module is responsible for initializing and handling events
// for the table's user interface controls (pagination, global filter).

// Import state management functions
import {
  getState,
  setFullData,
  setRowsPerPage,
  setGlobalFilter,
  setColumnFilter,
} from "../state/tableState.js";

// Import UI update functions
import {
  showTableControls,
  attachSortArrowHandlers,
  updateSortArrows,
} from "./table-ui.js";
// --- REMOVED: updateColumnPlaceholders is no longer needed here ---
import { updateTopScrollbar } from "./top-scrollbar.js";

/**
 * Initializes all event handlers for the table controls.
 * @param {Array<Object>} allMainRows - The full dataset of main rows.
 * @param {Array<Object>} allPeerRows - The full dataset of peer rows.
 */
export function initTableControls(allMainRows, allPeerRows) {
  setFullData(allMainRows, allPeerRows);

  const { rowsPerPage } = getState();

  // Init rows-per-page dropdown
  const select = document.getElementById("rows-per-page");
  if (select) {
    select.value = rowsPerPage;
    select.removeEventListener("change", handleRowsPerPageChange);
    select.addEventListener("change", handleRowsPerPageChange);
  }

  // Init GLOBAL filter input
  const globalFilterInput = document.getElementById("table-filter-input");
  if (globalFilterInput) {
    globalFilterInput.value = "";
    globalFilterInput.removeEventListener("input", handleGlobalFilterChange);
    globalFilterInput.addEventListener("input", handleGlobalFilterChange);
  }

  // Init COLUMN filter inputs
  const filterRow = document.getElementById("column-filters-row");
  if (filterRow) {
    filterRow.querySelectorAll("input").forEach((input) => {
      input.value = "";
      input.removeEventListener("input", handleColumnFilterChange);
      input.addEventListener("input", handleColumnFilterChange);
    });
  }

  // Show table controls and update UI by calling functions from the DOM module
  initExpandCollapseAll();
  showTableControls();
  // --- REMOVED: This is now handled automatically by table-ui.js ---
  // updateColumnPlaceholders();
  updateSortArrows();
  attachSortArrowHandlers();
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
    const isShowAllAction = newBtn.textContent === "Show All";
    const selector = isShowAllAction
      ? ".main-row .toggle-btn:contains('+')"
      : ".main-row .toggle-btn:contains('−')";

    // A more robust way to select based on text content
    const buttonsToClick = Array.from(
      tableBody.querySelectorAll(".main-row .toggle-btn")
    ).filter((btn) => {
      return isShowAllAction
        ? btn.textContent === "+"
        : btn.textContent === "−";
    });

    buttonsToClick.forEach((btn) => btn.click());

    newBtn.textContent = isShowAllAction ? "Hide All" : "Show All";

    setTimeout(updateTopScrollbar, 100);
  });
}

// --- EVENT HANDLERS ---

function handleRowsPerPageChange(event) {
  setRowsPerPage(event.target.value);
}

function handleGlobalFilterChange(event) {
  setGlobalFilter(event.target.value);
}

function handleColumnFilterChange(event) {
  const key = event.target.dataset.filterKey;
  const value = event.target.value;
  setColumnFilter(key, value);
}
