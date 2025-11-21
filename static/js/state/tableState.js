// static/js/state/tableState.js
import { publish } from "./eventBus.js";

// --- NEW: Separate variable for the raw data from the API ---
// This ensures that loading a state from a URL doesn't overwrite the original dataset.
// --- NEW: Separate variable for the raw data from the API ---
// This ensures that loading a state from a URL doesn't overwrite the original dataset.
const rawData = {
  mainRows: [],
  peerRows: [],
  hourlyRows: [], // Added hourlyRows
};

const tableState = {
  globalFilterQuery: "",
  columnFilters: {},
  // --- MODIFIED: fullData is no longer part of the saveable/loadable state ---
  multiSort: [
    { key: "destination", dir: "asc" },
    { key: "main", dir: "asc" }
  ],
  textFields: ["main", "peer", "destination"],
  yColumnsVisible: true,
  // Virtual Table Integration: Track rendering mode (pagination removed)
  renderingMode: 'virtual', // Always virtual now
  virtualScrollEnabled: true,

  // NEW: Table display settings
  display: {
    compactMode: false,
    showRowNumbers: true,
    showGroupHeaders: true,
    showSummaryFooter: true,
    rowHeight: 40,
    fontSize: 14,
  },

  // NEW: Column management
  columns: {
    visible: [
      "main", "peer", "destination", "calls", "duration",
      "pdd", "atime", "asr", "acd", "mos"
    ],
    order: [
      "main", "peer", "destination", "calls", "duration",
      "pdd", "atime", "asr", "acd", "mos"
    ],
    widths: {
      main: 150,
      peer: 150,
      destination: 200,
      calls: 80,
      duration: 100,
      pdd: 80,
      atime: 80,
      asr: 80,
      acd: 80,
      mos: 80,
    },
    frozen: ["main", "peer"], // Columns that stay visible during horizontal scroll
  },

  // NEW: Table behavior settings
  behavior: {
    autoExpandGroups: false,
    rememberExpandedState: true,
    showLoadingIndicators: true,
    enableRowSelection: false,
    enableMultiSelection: false,
    enableDragAndDrop: false,
  },

  // NEW: Performance settings
  performance: {
    enableVirtualization: true,
    enableLazyLoading: true,
    enableDebouncedSearch: true,
    searchDebounceMs: 300,
    maxVisibleRows: 1000,
    renderBatchSize: 50,
  },

  // NEW: Export and sharing settings
  export: {
    defaultFormat: "csv", // "csv", "excel", "json"
    includeHeaders: true,
    includeFilters: true,
    includeSorting: true,
    filenameTemplate: "metrics_{date}_{time}",
  }
};

// --- GETTERS ---
export function getState() {
  return { ...tableState };
}

export function areYColumnsVisible() {
  return tableState.yColumnsVisible;
}

export function getRenderingMode() {
  return tableState.renderingMode;
}

export function isVirtualScrollEnabled() {
  return tableState.virtualScrollEnabled;
}

// NEW: Display getters
export function getDisplaySettings() {
  return { ...tableState.display };
}

export function isCompactMode() {
  return tableState.display.compactMode;
}

export function getRowHeight() {
  return tableState.display.rowHeight;
}

export function getFontSize() {
  return tableState.display.fontSize;
}

// NEW: Column getters
export function getColumnSettings() {
  return { ...tableState.columns };
}

export function getVisibleColumns() {
  return [...tableState.columns.visible];
}

export function getColumnOrder() {
  return [...tableState.columns.order];
}

export function getColumnWidth(columnKey) {
  return tableState.columns.widths[columnKey] || 100;
}

export function getFrozenColumns() {
  return [...tableState.columns.frozen];
}

export function isColumnVisible(columnKey) {
  return tableState.columns.visible.includes(columnKey);
}

// NEW: Behavior getters
export function getBehaviorSettings() {
  return { ...tableState.behavior };
}

export function shouldAutoExpandGroups() {
  return tableState.behavior.autoExpandGroups;
}

export function shouldRememberExpandedState() {
  return tableState.behavior.rememberExpandedState;
}

export function isRowSelectionEnabled() {
  return tableState.behavior.enableRowSelection;
}

// NEW: Performance getters
export function getPerformanceSettings() {
  return { ...tableState.performance };
}

export function isLazyLoadingEnabled() {
  return tableState.performance.enableLazyLoading;
}

export function getSearchDebounceMs() {
  return tableState.performance.searchDebounceMs;
}

export function getMaxVisibleRows() {
  return tableState.performance.maxVisibleRows;
}

// NEW: Export getters
export function getExportSettings() {
  return { ...tableState.export };
}

export function getDefaultExportFormat() {
  return tableState.export.defaultFormat;
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
export function setFullData(allMainRows, allPeerRows, allHourlyRows = []) {
  rawData.mainRows = allMainRows;
  rawData.peerRows = allPeerRows;
  rawData.hourlyRows = allHourlyRows;

  // Reset parts of the state that depend on the data
  // currentPage removed - no pagination
  tableState.globalFilterQuery = "";
  tableState.columnFilters = {};

  // Temporarily disable publish to prevent table reset loops
  // publish("tableState:changed");
}

// Pagination functions removed - virtualization handles all data display

export function setRenderingMode(mode) {
  if (['auto', 'virtual', 'standard'].includes(mode)) {
    tableState.renderingMode = mode;
    publish("tableState:changed");
  }
}

export function setVirtualScrollEnabled(enabled) {
  tableState.virtualScrollEnabled = Boolean(enabled);
  publish("tableState:changed");
}

export function setGlobalFilter(query) {
  tableState.globalFilterQuery = query;
  console.log(`🔍 setGlobalFilter: Set global filter = "${query}"`);
  // currentPage removed - no pagination
  console.log(`🔍 setGlobalFilter: Publishing tableState:changed`);
  publish("tableState:changed");
}

export function setColumnFilter(key, value) {
  if (value) {
    tableState.columnFilters[key] = value;
    console.log(`🔍 setColumnFilter: Set filter for "${key}" = "${value}"`);
  } else {
    delete tableState.columnFilters[key];
    console.log(`🧹 setColumnFilter: Cleared filter for "${key}"`);
  }
  // currentPage removed - no pagination
  console.log(`🔍 setColumnFilter: Publishing tableState:changed`);
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

export function resetAllFilters() {
  console.log("🧹 resetAllFilters: Clearing all table filters");
  // Reset column filters
  tableState.columnFilters = {};
  // Reset global filter
  tableState.globalFilterQuery = "";
  console.log("🧹 resetAllFilters: All filters cleared, publishing tableState:changed");
  publish("tableState:changed");
}

// NEW: Display setters
export function setDisplaySettings(newSettings) {
  Object.assign(tableState.display, newSettings);
  console.log("🎨 Display settings updated:", tableState.display);
  publish("tableState:displayChanged", tableState.display);
}

export function setCompactMode(enabled) {
  tableState.display.compactMode = enabled;
  tableState.display.rowHeight = enabled ? 32 : 40;
  console.log(`📱 Compact mode ${enabled ? 'enabled' : 'disabled'}`);
  publish("tableState:compactModeChanged", enabled);
}

export function setRowHeight(height) {
  tableState.display.rowHeight = Math.max(20, Math.min(100, height));
  console.log(`📏 Row height set to: ${tableState.display.rowHeight}px`);
  publish("tableState:rowHeightChanged", tableState.display.rowHeight);
}

// NEW: Column setters
export function setColumnSettings(newSettings) {
  Object.assign(tableState.columns, newSettings);
  console.log("📊 Column settings updated:", tableState.columns);
  publish("tableState:columnsChanged", tableState.columns);
}

export function setVisibleColumns(columns) {
  tableState.columns.visible = [...columns];
  console.log("👁️ Visible columns updated:", tableState.columns.visible);
  publish("tableState:visibleColumnsChanged", tableState.columns.visible);
}

export function setColumnOrder(order) {
  tableState.columns.order = [...order];
  console.log("🔄 Column order updated:", tableState.columns.order);
  publish("tableState:columnOrderChanged", tableState.columns.order);
}

export function setColumnWidth(columnKey, width) {
  if (Object.prototype.hasOwnProperty.call(tableState.columns.widths, columnKey)) {
    tableState.columns.widths[columnKey] = Math.max(50, Math.min(500, width));
    console.log(`📏 Column "${columnKey}" width set to: ${tableState.columns.widths[columnKey]}px`);
    publish("tableState:columnWidthChanged", { columnKey, width: tableState.columns.widths[columnKey] });
  }
}

export function toggleColumnVisibility(columnKey) {
  const index = tableState.columns.visible.indexOf(columnKey);
  if (index > -1) {
    tableState.columns.visible.splice(index, 1);
  } else {
    tableState.columns.visible.push(columnKey);
  }
  console.log(`👁️ Column "${columnKey}" visibility toggled`);
  publish("tableState:columnVisibilityChanged", { columnKey, visible: index === -1 });
}

export function setFrozenColumns(columns) {
  tableState.columns.frozen = [...columns];
  console.log("🧊 Frozen columns updated:", tableState.columns.frozen);
  publish("tableState:frozenColumnsChanged", tableState.columns.frozen);
}

// NEW: Behavior setters
export function setBehaviorSettings(newSettings) {
  Object.assign(tableState.behavior, newSettings);
  console.log("🎭 Behavior settings updated:", tableState.behavior);
  publish("tableState:behaviorChanged", tableState.behavior);
}

export function setAutoExpandGroups(enabled) {
  tableState.behavior.autoExpandGroups = enabled;
  console.log(`🔓 Auto-expand groups ${enabled ? 'enabled' : 'disabled'}`);
  publish("tableState:autoExpandGroupsChanged", enabled);
}

export function setRowSelectionEnabled(enabled) {
  tableState.behavior.enableRowSelection = enabled;
  console.log(`✅ Row selection ${enabled ? 'enabled' : 'disabled'}`);
  publish("tableState:rowSelectionChanged", enabled);
}

// NEW: Performance setters
export function setPerformanceSettings(newSettings) {
  Object.assign(tableState.performance, newSettings);
  console.log("⚡ Performance settings updated:", tableState.performance);
  publish("tableState:performanceChanged", tableState.performance);
}

export function setLazyLoadingEnabled(enabled) {
  tableState.performance.enableLazyLoading = enabled;
  console.log(`🦥 Lazy loading ${enabled ? 'enabled' : 'disabled'}`);
  publish("tableState:lazyLoadingChanged", enabled);
}

export function setSearchDebounceMs(ms) {
  tableState.performance.searchDebounceMs = Math.max(100, Math.min(1000, ms));
  console.log(`⏱️ Search debounce set to: ${tableState.performance.searchDebounceMs}ms`);
  publish("tableState:searchDebounceChanged", tableState.performance.searchDebounceMs);
}

// NEW: Export setters
export function setExportSettings(newSettings) {
  Object.assign(tableState.export, newSettings);
  console.log("📤 Export settings updated:", tableState.export);
  publish("tableState:exportChanged", tableState.export);
}

export function setDefaultExportFormat(format) {
  if (["csv", "excel", "json"].includes(format)) {
    tableState.export.defaultFormat = format;
    console.log(`📤 Default export format set to: ${format}`);
    publish("tableState:exportFormatChanged", format);
  }
}

// NEW: Utility functions
export function getFullTableState() {
  return {
    ...tableState,
    display: { ...tableState.display },
    columns: { ...tableState.columns },
    behavior: { ...tableState.behavior },
    performance: { ...tableState.performance },
    export: { ...tableState.export }
  };
}

export function resetToDefaults() {
  // Reset to default values
  tableState.display = {
    compactMode: false,
    showRowNumbers: true,
    showGroupHeaders: true,
    showSummaryFooter: true,
    rowHeight: 40,
    fontSize: 14,
  };

  tableState.columns = {
    visible: [
      "main", "peer", "destination", "calls", "duration",
      "pdd", "atime", "asr", "acd", "mos"
    ],
    order: [
      "main", "peer", "destination", "calls", "duration",
      "pdd", "atime", "asr", "acd", "mos"
    ],
    widths: {
      main: 150, peer: 150, destination: 200, calls: 80,
      duration: 100, pdd: 80, atime: 80, asr: 80, acd: 80, mos: 80,
    },
    frozen: ["main", "peer"],
  };

  tableState.behavior = {
    autoExpandGroups: false,
    rememberExpandedState: true,
    showLoadingIndicators: true,
    enableRowSelection: false,
    enableMultiSelection: false,
    enableDragAndDrop: false,
  };

  tableState.performance = {
    enableVirtualization: true,
    enableLazyLoading: true,
    enableDebouncedSearch: true,
    searchDebounceMs: 300,
    maxVisibleRows: 1000,
    renderBatchSize: 50,
  };

  tableState.export = {
    defaultFormat: "csv",
    includeHeaders: true,
    includeFilters: true,
    includeSorting: true,
    filenameTemplate: "metrics_{date}_{time}",
  };

  // Reset sorting defaults
  tableState.multiSort = [
    { key: "destination", dir: "asc" },
    { key: "main", dir: "asc" },
  ];

  console.log("🔄 Table state reset to defaults");
  publish("tableState:resetToDefaults");
}

// Export convenience functions for backward compatibility
export const getMultiSort = () => tableState.multiSort;
export const getColumnFilters = () => tableState.columnFilters;
export const getGlobalFilterQuery = () => tableState.globalFilterQuery;
export const getRawData = () => rawData;
