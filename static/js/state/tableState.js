// static/js/state/tableState.js
import { publish } from "./eventBus.js";

// --- NEW: Separate variable for the raw data from the API ---
// This ensures that loading a state from a URL doesn't overwrite the original dataset.
let rawData = {
  mainRows: [],
  peerRows: [],
};

const tableState = {
  currentPage: 1,
  rowsPerPage: 25,
  globalFilterQuery: "",
  columnFilters: {},
  // --- MODIFIED: fullData is no longer part of the saveable/loadable state ---
  multiSort: [{ key: "TCall", dir: "desc" }],
  textFields: ["main", "peer", "destination"],
  yColumnsVisible: true,
};

// --- GETTERS ---
export function getState() {
  return { ...tableState };
}

export function areYColumnsVisible() {
  return tableState.yColumnsVisible;
}

// --- MODIFIED: getFullData now returns from the new rawData variable ---
export function getFullData() {
  return rawData;
}

// --- SETTERS ---

// --- NEW: Function to set the entire state at once (from URL) ---
export function setFullState(newState) {
  // Overwrite all properties of tableState with the new ones
  Object.assign(tableState, newState);
  console.log("🔄 Table state fully replaced from loaded state.", tableState);
  // Notify all listeners that the state has fundamentally changed.
  publish("tableState:changed");
}

export function toggleYColumnsVisible() {
  tableState.yColumnsVisible = !tableState.yColumnsVisible;
  publish("tableState:yVisibilityChanged", tableState.yColumnsVisible);
}

// --- MODIFIED: setFullData now populates the new rawData variable ---
export function setFullData(allMainRows, allPeerRows) {
  rawData.mainRows = allMainRows;
  rawData.peerRows = allPeerRows;

  // Reset parts of the state that depend on the data
  tableState.currentPage = 1;
  tableState.globalFilterQuery = "";
  tableState.columnFilters = {};

  publish("tableState:changed");
}

export function setPage(page) {
  tableState.currentPage = page;
  publish("tableState:changed");
}

export function setRowsPerPage(rpp) {
  tableState.rowsPerPage = parseInt(rpp, 10);
  tableState.currentPage = 1;
  publish("tableState:changed");
}

export function setGlobalFilter(query) {
  tableState.globalFilterQuery = query;
  tableState.currentPage = 1;
  publish("tableState:changed");
}

export function setColumnFilter(key, value) {
  if (value) {
    tableState.columnFilters[key] = value;
  } else {
    delete tableState.columnFilters[key];
  }
  tableState.currentPage = 1;
  publish("tableState:changed");
}

export function setMultiSort(sortArray) {
  tableState.multiSort = sortArray;
  publish("tableState:changed");
}

export function resetColumnFilters() {
  tableState.columnFilters = {};
  publish("tableState:changed");
}
