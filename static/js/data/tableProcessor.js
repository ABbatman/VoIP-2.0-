// static/js/data/tableProcessor.js
import { getState, getFullData } from "../state/tableState.js";

function getFilteredAndSortedData() {
  const { mainRows, peerRows } = getFullData();
  const { globalFilterQuery, columnFilters, multiSort } = getState();

  let filteredMainRows = mainRows;

  // --- NEW LOGIC FOR COLUMN FILTERS ---
  // This logic correctly handles the case where a filter is applied to the 'peer' column.
  if (Object.keys(columnFilters).length > 0) {
    const peerFilter = columnFilters.peer?.toLowerCase();

    filteredMainRows = mainRows.filter((mainRow) => {
      // Check if the main row itself passes all non-peer filters
      let mainRowPasses = true;
      for (const key in columnFilters) {
        if (key === "peer") continue; // Skip peer filter for the main row
        if (!passesColumnFilter(mainRow[key], columnFilters[key])) {
          mainRowPasses = false;
          break;
        }
      }

      // If a peer filter exists, we need to check children
      if (peerFilter) {
        // Find if any child peer of this main row passes the peer filter
        const hasMatchingPeer = peerRows.some(
          (peerRow) =>
            peerRow.main === mainRow.main &&
            peerRow.destination === mainRow.destination &&
            (peerRow.peer ?? "").toString().toLowerCase().includes(peerFilter)
        );

        // A main row is kept if:
        // 1. It passes all non-peer filters AND has a matching peer child.
        // 2. OR if there's no peer filter and it just passes its own filters.
        return mainRowPasses && hasMatchingPeer;
      }

      // If no peer filter, just return if the main row passed its own filters.
      return mainRowPasses;
    });
  }

  // --- GLOBAL FILTER (no change) ---
  if (globalFilterQuery) {
    const query = globalFilterQuery.toLowerCase();
    filteredMainRows = filteredMainRows.filter((row) => {
      for (const key in row) {
        if ((row[key] ?? "").toString().toLowerCase().includes(query)) {
          return true;
        }
      }
      return false;
    });
  }

  // --- SORTING (no change) ---
  if (multiSort && multiSort.length > 0) {
    filteredMainRows = filteredMainRows.slice().sort((a, b) => {
      for (let i = 0; i < multiSort.length; i++) {
        const { key, dir } = multiSort[i];
        let aVal = a[key],
          bVal = b[key];
        if (aVal == null) aVal = "";
        if (bVal == null) bVal = "";
        if (!isNaN(parseFloat(aVal)) && !isNaN(parseFloat(bVal))) {
          aVal = parseFloat(aVal);
          bVal = parseFloat(bVal);
          if (aVal !== bVal) return dir === "desc" ? bVal - aVal : aVal - bVal;
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

  return { data: filteredMainRows, count: filteredMainRows.length };
}

export function getProcessedData() {
  const { currentPage, rowsPerPage } = getState();
  const { data, count } = getFilteredAndSortedData();
  const pagedData = paginateData(data, currentPage, rowsPerPage);
  return { pagedData, totalFiltered: count };
}

function passesColumnFilter(value, filter) {
  const trimmed = filter.trim();
  const numericValue = parseFloat(value);
  if (
    trimmed.startsWith(">") ||
    trimmed.startsWith("<") ||
    trimmed.startsWith("=")
  ) {
    const operator = trimmed[0];
    const number = parseFloat(trimmed.slice(1));
    if (isNaN(number) || isNaN(numericValue)) return true;
    switch (operator) {
      case ">":
        return numericValue > number;
      case "<":
        return numericValue < number;
      case "=":
        return numericValue === number;
    }
  }
  if (!isNaN(trimmed) && !isNaN(numericValue)) {
    return numericValue >= parseFloat(trimmed);
  }
  return (value ?? "").toString().toLowerCase().includes(trimmed.toLowerCase());
}

function paginateData(data, page, perPage) {
  if (perPage === -1 || !data) return data;
  const start = (page - 1) * perPage;
  const end = start + parseInt(perPage, 10);
  return data.slice(start, end);
}
