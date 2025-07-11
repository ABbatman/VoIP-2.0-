// static/js/dom/table.js
import {
  getState,
  setColumnFilter,
  areYColumnsVisible,
} from "../state/tableState.js"; // <-- Import areYColumnsVisible
import {
  createMainRow,
  createPeerRow,
  createHourlyRows,
} from "./table-renderers.js";
import {
  renderTableHeader,
  renderTableFooter,
  updateSortArrows,
  attachSortArrowHandlers,
} from "./table-ui.js";
import { subscribe } from "../state/eventBus.js";
import { updateTopScrollbar } from "./top-scrollbar.js";

let openMainGroups = new Set();
let openHourlyGroups = new Set();

subscribe("appState:dataChanged", () => {
  openMainGroups.clear();
  openHourlyGroups.clear();
});

/**
 * Renders the grouped table using the persistent state.
 * @param {Array} mainRows - The filtered and paged main rows to display.
 * @param {Array} peerRows - The complete list of peer rows for all main groups.
 * @param {Array} hourlyRows - The complete list of hourly rows for all peer groups.
 */
export function renderGroupedTable(mainRows, peerRows, hourlyRows) {
  // ... (весь код до `tbody.innerHTML = ""`) ...
  const activeElement = document.activeElement;
  let activeFilterKey = null;
  let selectionStart = 0;
  if (activeElement && activeElement.closest("#column-filters-row")) {
    activeFilterKey = activeElement.dataset.filterKey;
    selectionStart = activeElement.selectionStart;
  }

  renderTableHeader();
  if (typeof renderTableFooter === "function") {
    renderTableFooter();
  }

  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  // --- NEW LOGIC: Apply the visibility class to the main table element ---
  const tableElement = document.getElementById("summaryTable");
  if (tableElement) {
    if (areYColumnsVisible()) {
      tableElement.classList.remove("y-columns-hidden");
    } else {
      tableElement.classList.add("y-columns-hidden");
    }
  }
  // --- END NEW LOGIC ---

  if (!mainRows || mainRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="24">No data to display.</td></tr>`;
  } else {
    // ... (весь остальной код рендеринга строк без изменений) ...
    const fragment = document.createDocumentFragment();
    const { columnFilters, multiSort } = getState();
    const peerFilter = columnFilters.peer?.toLowerCase();

    mainRows.forEach((mainRow) => {
      const mainGroupId = `main-${mainRow.main}-${mainRow.destination}`.replace(
        /[\s.]/g,
        "-"
      );
      const isMainGroupOpen = openMainGroups.has(mainGroupId);
      const mainTr = createMainRow(mainRow, mainGroupId);
      if (isMainGroupOpen) {
        mainTr.querySelector(".toggle-btn").textContent = "−";
      }
      fragment.appendChild(mainTr);

      let relevantPeers = peerRows.filter(
        (p) => p.main === mainRow.main && p.destination === mainRow.destination
      );

      if (peerFilter) {
        relevantPeers = relevantPeers.filter((p) =>
          (p.peer ?? "").toString().toLowerCase().includes(peerFilter)
        );
      }

      if (multiSort && multiSort.length > 0) {
        relevantPeers.sort((a, b) => {
          for (let i = 0; i < multiSort.length; i++) {
            let { key, dir } = multiSort[i];
            let aVal = a[key],
              bVal = b[key];
            if (aVal == null) aVal = "";
            if (bVal == null) bVal = "";
            if (!isNaN(parseFloat(aVal)) && !isNaN(parseFloat(bVal))) {
              aVal = parseFloat(aVal);
              bVal = parseFloat(bVal);
              if (aVal !== bVal)
                return dir === "desc" ? bVal - aVal : aVal - bVal;
            } else {
              aVal = aVal.toString().toLowerCase();
              bVal = bVal.toString().toLowerCase();
              if (aVal !== bVal)
                return dir === "asc"
                  ? aVal.localeCompare(bVal)
                  : bVal.localeCompare(aVal);
            }
          }
          return 0;
        });
      }

      relevantPeers.forEach((peerRow) => {
        const peerGroupId =
          `peer-${peerRow.main}-${peerRow.peer}-${peerRow.destination}`.replace(
            /[\s.]/g,
            "-"
          );
        const isPeerGroupOpen = openHourlyGroups.has(peerGroupId);
        const peerTr = createPeerRow(peerRow, mainGroupId, peerGroupId);

        if (isMainGroupOpen) {
          peerTr.style.display = "";
        }

        if (isPeerGroupOpen) {
          peerTr.querySelector(".toggle-btn").textContent = "−";
        }
        fragment.appendChild(peerTr);

        const relevantHours = hourlyRows.filter(
          (h) =>
            h.main === peerRow.main &&
            h.peer === peerRow.peer &&
            h.destination === peerRow.destination
        );
        const hourRows = createHourlyRows(relevantHours, peerGroupId, peerRow);

        if (isMainGroupOpen && isPeerGroupOpen) {
          hourRows.forEach((hr) => (hr.style.display = ""));
        }
        hourRows.forEach((hr) => fragment.appendChild(hr));
      });
    });
    tbody.appendChild(fragment);
  }

  // ... (весь остальной код функции renderGroupedTable без изменений) ...
  updateSortArrows();
  attachSortArrowHandlers();

  const filterRow = document.getElementById("column-filters-row");
  if (filterRow) {
    const newFilterRow = filterRow.cloneNode(true);
    filterRow.parentNode.replaceChild(newFilterRow, filterRow);
    newFilterRow.addEventListener("input", (event) => {
      if (event.target.tagName === "INPUT") {
        const input = event.target;
        const key = input.dataset.filterKey;
        const value = input.value.trim();
        setColumnFilter(key, value);
      }
    });
  }

  if (activeFilterKey) {
    const newActiveInput = document.querySelector(
      `input[data-filter-key="${activeFilterKey}"]`
    );
    if (newActiveInput) {
      newActiveInput.focus();
      newActiveInput.setSelectionRange(selectionStart, selectionStart);
    }
  }

  setTimeout(updateTopScrollbar, 50);
}

// ... (остальная часть файла table.js без изменений)
export function initTableInteractions() {
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return;

  tableBody.addEventListener("click", (event) => {
    // --- EXPAND/COLLAPSE LOGIC ---
    const targetButton = event.target.closest(".toggle-btn");
    if (targetButton) {
      const parentRow = targetButton.closest("tr");
      if (!parentRow) return;
      const groupId = targetButton.dataset.targetGroup;
      const isCurrentlyExpanded = targetButton.textContent === "−";

      if (parentRow.classList.contains("main-row")) {
        const childPeerRows = tableBody.querySelectorAll(
          `tr.peer-row[data-group="${groupId}"]`
        );
        if (isCurrentlyExpanded) {
          openMainGroups.delete(groupId);
          targetButton.textContent = "+";
          childPeerRows.forEach((peerRow) => {
            peerRow.style.display = "none";
            const peerBtn = peerRow.querySelector(
              "td:nth-child(2) .toggle-btn"
            );
            if (peerBtn && peerBtn.textContent === "−") {
              const hourGroupId = peerBtn.dataset.targetGroup;
              openHourlyGroups.delete(hourGroupId);
              peerBtn.textContent = "+";
              tableBody
                .querySelectorAll(`tr.hour-row[data-group="${hourGroupId}"]`)
                .forEach((hr) => (hr.style.display = "none"));
            }
          });
        } else {
          openMainGroups.add(groupId);
          targetButton.textContent = "−";
          childPeerRows.forEach((peerRow) => {
            peerRow.style.display = "";
          });
        }
      } else if (parentRow.classList.contains("peer-row")) {
        const childHourRows = tableBody.querySelectorAll(
          `tr.hour-row[data-group="${groupId}"]`
        );
        if (isCurrentlyExpanded) {
          openHourlyGroups.delete(groupId);
          targetButton.textContent = "+";
          childHourRows.forEach((hr) => (hr.style.display = "none"));
        } else {
          openHourlyGroups.add(groupId);
          targetButton.textContent = "−";
          childHourRows.forEach((hr) => (hr.style.display = ""));
        }
      }
      setTimeout(updateTopScrollbar, 50);
      return;
    }

    // --- ROW SELECTION LOGIC ---
    const clickedRow = event.target.closest("tr");
    if (!clickedRow || !tableBody.contains(clickedRow)) return;
    const currentlySelectedRow = tableBody.querySelector("tr.row-selected");
    if (currentlySelectedRow) {
      currentlySelectedRow.classList.remove("row-selected");
    }
    if (clickedRow !== currentlySelectedRow) {
      clickedRow.classList.add("row-selected");
    }
  });

  tableBody.addEventListener("dblclick", (event) => {
    const cell = event.target.closest("td");
    if (
      !cell ||
      event.target.closest(".toggle-btn") ||
      cell.querySelector(".datetime-cell-container")
    ) {
      return;
    }

    const valueToFilter = (cell.dataset.filterValue || cell.textContent).trim();
    if (!valueToFilter || valueToFilter === "-") return;

    const columnIndex = cell.cellIndex;
    const headerCell = document.querySelector(
      `#summaryTable th:nth-child(${columnIndex + 1})`
    );
    if (!headerCell) return;

    const filterKey = headerCell.dataset.sortKey;
    if (!filterKey) return;

    const targetInput = document.querySelector(
      `#column-filters-row input[data-filter-key="${filterKey}"]`
    );
    if (!targetInput) {
      console.warn(`No filter input found for key: ${filterKey}`);
      return;
    }
    setColumnFilter(filterKey, valueToFilter);
  });
}
