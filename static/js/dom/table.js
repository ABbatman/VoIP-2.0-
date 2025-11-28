// static/js/dom/table.js
import {
  getState,
  setColumnFilter,
  areYColumnsVisible,
} from "../state/tableState.js"; // <-- Import areYColumnsVisible
import { renderCoordinator } from "../rendering/render-coordinator.js";
import {
  renderMainRowString,
  renderPeerRowString,
  renderHourlyRowsString,
} from "./table-renderers.js";
import {
  renderTableHeader,
  renderTableFooter,
  updateSortArrows,
} from "./table-ui.js";
import { subscribe } from "../state/eventBus.js";
import { updateTopScrollbar } from "./top-scrollbar.js";
import {
  buildMainGroupId,
  buildPeerGroupId,
  getMainSetProxy,
  getPeerSetProxy,
  isMainExpanded,
  isPeerExpanded,
  toggleMain,
  togglePeer,
  resetExpansionState,
} from "../state/expansionState.js";
import { getVirtualManager } from "../state/moduleRegistry.js";

// Centralized expansion state proxies (shared with virtual table)
const openMainGroups = getMainSetProxy();
const openHourlyGroups = getPeerSetProxy();

subscribe("appState:dataChanged", () => {
  resetExpansionState();
});

// Allow external flows (e.g., Reverse -> Summary) to reset expansion state explicitly
export function resetRowOpenState() { resetExpansionState(); }

/**
 * Renders the grouped table using the persistent state.
 * @param {Array} mainRows - The filtered and paged main rows to display.
 * @param {Array} peerRows - The complete list of peer rows for all main groups.
 * @param {Array} hourlyRows - The complete list of hourly rows for all peer groups.
 */
export function renderGroupedTable(mainRows, peerRows, hourlyRows) {
  // Centralized expansion state is already shared; no global hydration
  // Deduplicate incoming datasets by their natural keys (robust to minor casing/whitespace)
  const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());
  const uniqueBy = (arr, keyFn) => {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    const out = [];
    for (const r of arr) {
      const k = keyFn(r);
      if (!seen.has(k)) { seen.add(k); out.push(r); }
    }
    return out;
  };
  const mRows = uniqueBy(mainRows, r => [norm(r?.main), norm(r?.destination)].join('|'));
  const pRows = uniqueBy(peerRows, r => [norm(r?.main), norm(r?.peer), norm(r?.destination)].join('|'));
  const hKeyName = (Array.isArray(hourlyRows) && hourlyRows.length && Object.prototype.hasOwnProperty.call(hourlyRows[0], 'time')) ? 'time' : 'hour';
  const hRows = uniqueBy(hourlyRows, r => [norm(r?.main), norm(r?.peer), norm(r?.destination), norm(r?.[hKeyName])].join('|'));
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
  // Ensure visual state is refreshed; sorting clicks are handled by delegated handler
  try {
    updateSortArrows(); // refresh visual state (directions)
  } catch (_) { /* no-op in virtual-only paths */ }

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

  if (!mRows || mRows.length === 0) {
    // Empty state: keep header and footer visible, but remove all data rows
    // (User wants all rows to disappear when no matches)
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="${document.querySelectorAll("#summaryTable th").length}">
          No matches found
        </td>
      </tr>
    `;
  } else {
    // Build tbody HTML using pure string renderers + morphdom (no direct DOM building)
    let tbodyHTML = "";
    const { columnFilters, multiSort } = getState();
    const peerFilter = columnFilters.peer?.toLowerCase();

    mRows.forEach((mainRow) => {
      const mainGroupId = buildMainGroupId(mainRow.main, mainRow.destination);
      const isMainGroupOpen = isMainExpanded(mainGroupId);
      tbodyHTML += renderMainRowString(mainRow, { mainGroupId, isMainGroupOpen });

      let relevantPeers = pRows.filter(
        (p) => norm(p.main) === norm(mainRow.main) && norm(p.destination) === norm(mainRow.destination)
      );

      // Do not apply peer filter when main group is open: toggles must be independent from inputs
      if (peerFilter && !isMainGroupOpen) {
        relevantPeers = relevantPeers.filter((p) =>
          (p.peer ?? "").toString().toLowerCase().includes(peerFilter)
        );
      }

      if (multiSort && multiSort.length > 0) {
        relevantPeers.sort((a, b) => {
          for (let i = 0; i < multiSort.length; i++) {
            const { key, dir } = multiSort[i];
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
        const peerGroupId = buildPeerGroupId(peerRow.main, peerRow.peer, peerRow.destination);
        const isPeerGroupOpen = isPeerExpanded(peerGroupId);
        tbodyHTML += renderPeerRowString(peerRow, { mainGroupId, peerGroupId, isMainGroupOpen, isPeerGroupOpen });

        const relevantHours = hRows.filter(
          (h) =>
            norm(h.main) === norm(peerRow.main) &&
            norm(h.peer) === norm(peerRow.peer) &&
            norm(h.destination) === norm(peerRow.destination)
        );
        tbodyHTML += renderHourlyRowsString(relevantHours, { peerGroupId, isMainGroupOpen, isPeerGroupOpen, parentPeer: peerRow });
      });
    });
    // Apply minimal diff to tbody using morphdom
    try {
      if (window.morphdom) {
        const toHTML = `<tbody id="tableBody">${tbodyHTML}</tbody>`; // keep same root to avoid replacing tbody node
        // IMPORTANT: allow morphdom to update the tbody inside virtual-scroll-container for standard render
        window.morphdom(tbody, toHTML);
      } else {
        tbody.innerHTML = tbodyHTML;
      }
    } catch (e) {
      tbody.innerHTML = tbodyHTML;
    }
  }

  // ... (весь остальной код функции renderGroupedTable без изменений) ...
  updateSortArrows(); // delegated handler processes clicks; no legacy binding

  // Remove legacy direct listeners; `connectFilterEventHandlers()` in table-ui handles this with focus restore

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
  // Expansion state persists in centralized store
}

// ... (остальная часть файла table.js без изменений)
export function initTableInteractions() {
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return;

  tableBody.addEventListener("click", (event) => {
    // If virtual mode is active, delegate toggle handling to virtual manager to avoid double toggles
    const vm = getVirtualManager();
    if (vm && vm.isActive) return;
    // --- EXPAND/COLLAPSE LOGIC ---
    const targetButton = event.target.closest(".toggle-btn");
    if (targetButton) {
      // Prevent default behavior and blur the toggle to avoid focus-driven scroll changes
      try { event.preventDefault(); event.stopPropagation(); if (typeof targetButton.blur === 'function') targetButton.blur(); } catch (_) {}
      const parentRow = targetButton.closest("tr");
      if (!parentRow) return;
      const groupId = targetButton.dataset.targetGroup;
      if (parentRow.classList.contains("main-row")) {
        toggleMain(groupId);
      } else if (parentRow.classList.contains("peer-row")) {
        togglePeer(groupId);
      }
      try {
        renderCoordinator.requestRender('table', async () => {
          try {
            const ai = window.appInitializer || (window.App && window.App.appInitializer);
            if (ai && ai.tableController && typeof ai.tableController.redrawTable === 'function') {
              ai.tableController.redrawTable();
            } else {
              const mod = await import('../dom/table.js');
              const app = await import('../data/tableProcessor.js');
              const { getMetricsData } = await import('../state/appState.js');
              const data = getMetricsData();
              const { pagedData } = app.getProcessedData();
              mod.renderGroupedTable(pagedData || [], data?.peer_rows || [], data?.hourly_rows || []);
            }
          } catch (e) { console.error('Error re-rendering table:', e); }
        }, { debounceMs: 0, cooldownMs: 0 });
      } catch (_) {}
      return;
    }

    // --- ROW-LEVEL TOGGLE FOR PEER ROWS (click anywhere on peer row) ---
    const clickedRow = event.target.closest("tr");
    if (clickedRow && clickedRow.classList.contains("peer-row")) {
      // If virtual mode is active, do not emulate toggle by row click
      const vmPeer = getVirtualManager();
      if (vmPeer && vmPeer.isActive) return;
      // If the direct target wasn't the toggle button, delegate to the existing button logic
      const innerToggleBtn = clickedRow.querySelector(".toggle-btn");
      if (innerToggleBtn && !event.target.closest(".toggle-btn")) {
        try { innerToggleBtn.click(); } catch (_) {
          // Ignore click errors
        }
        try { event.preventDefault(); event.stopPropagation(); } catch (_) {
          // Ignore event handling errors
        }
        return;
      }
    }

    // --- ROW SELECTION LOGIC ---
    const clickedRow2 = event.target.closest("tr");
    if (!clickedRow2 || !tableBody.contains(clickedRow2)) return;
    const currentlySelectedRow = tableBody.querySelector("tr.row-selected");
    if (currentlySelectedRow) {
      currentlySelectedRow.classList.remove("row-selected");
    }
    if (clickedRow2 !== currentlySelectedRow) {
      clickedRow2.classList.add("row-selected");
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
    // Reflect the value in the visible filter input and update state
    targetInput.value = valueToFilter;
    setColumnFilter(filterKey, valueToFilter);
  });
}
