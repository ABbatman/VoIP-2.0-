// static/js/dom/table-ui.js
// This module contains functions that manage the UI aspects of the table,
// like headers, sort arrows, and controls.

import {
  getState,
  setMultiSort,
  areYColumnsVisible,
} from "../state/tableState.js";
import { isReverseMode } from "../state/appState.js";
import { subscribe } from "../state/eventBus.js";
import { getYColumnToggleIcon } from "./hideYColumns.js";

const arrowSvg = `<svg viewBox="0 0 24 24">
  <polyline points="9 6 15 12 9 18"/>
</svg>`;

/**
 * The single source of truth for the table's column structure.
 */
export function getColumnConfig() {
  // We define which columns are filterable and their placeholders
  return [
    {
      label: (rev) => (rev ? "Supplier" : "Customer"),
      key: "main",
      filterable: true,
    },
    {
      label: (rev) => (rev ? "Customer" : "Supplier"),
      key: "peer",
      filterable: true,
    },
    {
      label: () => "Destination",
      key: "destination",
      filterable: true,
      placeholder: "Destination",
    },
    { label: () => "Min", key: "Min", filterable: true },
    { label: () => "YMin", key: "YMin", filterable: true, isYColumn: true },
    {
      label: () => "Δ",
      key: "Min_delta",
      filterable: true,
      headerClass: "th-delta", // For specific styling
    },
    { label: () => "ACD", key: "ACD", filterable: true },
    { label: () => "YACD", key: "YACD", filterable: true, isYColumn: true },
    {
      label: () => "Δ",
      key: "ACD_delta",
      filterable: true,
      headerClass: "th-delta", // For specific styling
    },
    { label: () => "ASR", key: "ASR", filterable: true },
    { label: () => "YASR", key: "YASR", filterable: true, isYColumn: true },
    {
      label: () => "Δ",
      key: "ASR_delta",
      filterable: true,
      headerClass: "th-delta", // For specific styling
    },
    { label: () => "SCall", key: "SCall", filterable: true },
    { label: () => "YSCall", key: "YSCall", filterable: true, isYColumn: true },
    {
      label: () => "Δ",
      key: "SCall_delta",
      filterable: true,
      headerClass: "th-delta", // For specific styling
    },
    { label: () => "TCall", key: "TCall", filterable: true },
    { label: () => "YTCall", key: "YTCall", filterable: true, isYColumn: true },
    {
      label: () => "Δ",
      key: "TCall_delta",
      filterable: true,
      headerClass: "th-delta", // For specific styling
    },
  ];
}

export function initTableView() {
  subscribe("appState:reverseModeChanged", () => {
    console.log(
      "[Event] appState:reverseModeChanged triggered table view update."
    );
    updateTableView();
  });
}

function updateTableView() {
  console.log("🔄 Updating table view (header and footer)...");
  renderTableHeader();
  renderTableFooter(); // Also update the footer for new placeholders
  attachSortArrowHandlers();
  updateSortArrows();
}

export function renderTableHeader() {
  const reverse = isReverseMode();
  const columns = getColumnConfig();
  const table = document.querySelector(".results-display__table");
  if (!table) return;
  const thead = table.querySelector("thead");
  if (!thead) return;
  thead.innerHTML = "";
  const tr = document.createElement("tr");

  columns.forEach((col) => {
    const th = document.createElement("th");
    th.setAttribute("data-sort-key", col.key);

    if (col.isYColumn) {
      th.dataset.yToggleable = "true";
    }

    // --- CORRECTED IMPLEMENTATION (restoring your structure + adding new features) ---
    // This container uses Flexbox to correctly align all elements.
    const headerContentWrapper = document.createElement("div");
    headerContentWrapper.className = "th-content-wrapper";

    // Wrapper for the label and the toggle button.
    const leftPart = document.createElement("div");
    leftPart.className = "th-left-part";

    // Add label text
    leftPart.appendChild(document.createTextNode(col.label(reverse) + " "));

    // If it's the 'main' column, add the Y-column toggle button.
    // This is a good UX choice as it's the primary grouping column.
    if (col.key === "main") {
      const toggleButton = document.createElement("button");
      toggleButton.className = "y-column-toggle-btn";
      // Set the initial icon based on the current state.
      toggleButton.innerHTML = getYColumnToggleIcon(areYColumnsVisible());
      leftPart.appendChild(toggleButton);
    }

    // Create and add the sort arrow.
    const sortArrow = document.createElement("span");
    sortArrow.className = "sort-arrow";
    sortArrow.setAttribute("data-sort-key", col.key);

    // Assemble the header content.
    headerContentWrapper.appendChild(leftPart);
    headerContentWrapper.appendChild(sortArrow);

    th.appendChild(headerContentWrapper);

    // **NEW**: Add the special class for Delta headers from the config.
    if (col.headerClass) {
      th.classList.add(col.headerClass);
    }
    // --- END CORRECTION ---

    tr.appendChild(th);
  });
  thead.appendChild(tr);
}

export function renderTableFooter() {
  const reverse = isReverseMode();
  const columns = getColumnConfig();
  const { columnFilters } = getState();

  const table = document.querySelector(".results-display__table");
  if (!table) return;

  let tfoot = table.querySelector("tfoot");
  if (!tfoot) {
    tfoot = document.createElement("tfoot");
    tfoot.className = "results-display__footer";
    table.appendChild(tfoot);
  }
  tfoot.innerHTML = "";

  const filterRow = document.createElement("tr");
  filterRow.id = "column-filters-row";
  filterRow.className = "results-display__column-filters";

  columns.forEach((col) => {
    const td = document.createElement("td");
    if (col.isYColumn) {
      td.dataset.yToggleable = "true";
    }
    if (col.filterable) {
      const input = document.createElement("input");
      input.type = "text";
      input.dataset.filterKey = col.key;
      if (columnFilters[col.key]) {
        input.value = columnFilters[col.key];
      }
      if (col.key === "main") {
        input.placeholder = reverse ? "Supplier" : "Customer";
      } else if (col.key === "peer") {
        input.placeholder = reverse ? "Customer" : "Supplier";
      } else {
        input.placeholder = col.placeholder || ">";
      }
      td.appendChild(input);
    }
    filterRow.appendChild(td);
  });

  tfoot.appendChild(filterRow);
}

// ... (rest of the file is correct and remains unchanged)
export function updateSortArrows() {
  const { multiSort, textFields } = getState();
  const activeKeys = multiSort.map((s) => s.key);

  document.querySelectorAll(".sort-arrow").forEach((arrow) => {
    const key = arrow.dataset.sortKey;
    arrow.classList.remove(
      "active",
      "inactive",
      "down",
      "up",
      "right",
      "secondary-sort"
    );
    arrow.innerHTML = arrowSvg;

    const idx = activeKeys.indexOf(key);
    if (idx === 0) {
      const dir = multiSort[0].dir;
      const isTextField = textFields.includes(key);
      if ((isTextField && dir === "asc") || (!isTextField && dir === "desc")) {
        arrow.classList.add("down");
      } else {
        arrow.classList.add("up");
      }
      arrow.classList.add("active");
    } else if (idx > 0) {
      arrow.classList.add("secondary-sort");
    } else {
      arrow.classList.add("inactive", "right");
    }
  });
}
export function hideTableUI() {
  const controls = document.querySelector(".results-display__controls");
  if (controls) controls.style.display = "none";

  const tableFooter = document.querySelector(".results-display__footer");
  if (tableFooter) tableFooter.classList.add("is-hidden");
}
export function showTableControls() {
  const controls = document.querySelector(".results-display__controls");
  if (controls) controls.style.display = "flex";

  const tableFooter = document.querySelector(".results-display__footer");
  if (tableFooter) tableFooter.classList.remove("is-hidden");
}
export function attachSortArrowHandlers() {
  document.querySelectorAll(".sort-arrow").forEach((arrow) => {
    const newArrow = arrow.cloneNode(true);
    arrow.parentNode.replaceChild(newArrow, arrow);

    newArrow.addEventListener("click", () => {
      const key = newArrow.dataset.sortKey;
      const { multiSort, textFields } = getState();
      let newMultiSort = [...multiSort];
      const found = newMultiSort.find((s) => s.key === key);
      if (!found) {
        newMultiSort.unshift({
          key,
          dir: textFields.includes(key) ? "asc" : "desc",
        });
      } else if (newMultiSort[0].key === key) {
        found.dir = found.dir === "asc" ? "desc" : "asc";
      } else {
        newMultiSort = [found, ...newMultiSort.filter((s) => s.key !== key)];
      }
      setMultiSort(newMultiSort.slice(0, 3));
    });
  });
}
export function updateTableFooter(totalFilteredRows) {
  const { currentPage, rowsPerPage } = getState();
  const footerInfo = document.getElementById("table-footer-info");
  if (!footerInfo) return;

  if (totalFilteredRows === 0) {
    footerInfo.textContent = "Showing 0 of 0 entries";
    return;
  }

  const startRow = (currentPage - 1) * rowsPerPage + 1;
  const endRow = Math.min(currentPage * rowsPerPage, totalFilteredRows);

  footerInfo.textContent = `Showing ${startRow} to ${endRow} of ${totalFilteredRows} entries`;
}
