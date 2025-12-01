// static/js/state/tableState.js
// Responsibility: Table state management (filters, columns, display, behavior)
import { publish } from './eventBus.js';

// ─────────────────────────────────────────────────────────────
// Constants: Default values
// ─────────────────────────────────────────────────────────────

const DEFAULT_COLUMNS = ['main', 'peer', 'destination', 'calls', 'duration', 'pdd', 'atime', 'asr', 'acd', 'mos'];

const DEFAULT_COLUMN_WIDTHS = {
  main: 150, peer: 150, destination: 200, calls: 80,
  duration: 100, pdd: 80, atime: 80, asr: 80, acd: 80, mos: 80
};

const DEFAULT_DISPLAY = {
  compactMode: false,
  showRowNumbers: true,
  showGroupHeaders: true,
  showSummaryFooter: true,
  rowHeight: 40,
  fontSize: 14
};

const DEFAULT_COLUMNS_CONFIG = {
  visible: [...DEFAULT_COLUMNS],
  order: [...DEFAULT_COLUMNS],
  widths: { ...DEFAULT_COLUMN_WIDTHS },
  frozen: ['main', 'peer']
};

const DEFAULT_BEHAVIOR = {
  autoExpandGroups: false,
  rememberExpandedState: true,
  showLoadingIndicators: true,
  enableRowSelection: false,
  enableMultiSelection: false,
  enableDragAndDrop: false
};

const DEFAULT_PERFORMANCE = {
  enableVirtualization: true,
  enableLazyLoading: true,
  enableDebouncedSearch: true,
  searchDebounceMs: 300,
  maxVisibleRows: 1000,
  renderBatchSize: 50
};

const DEFAULT_EXPORT = {
  defaultFormat: 'csv',
  includeHeaders: true,
  includeFilters: true,
  includeSorting: true,
  filenameTemplate: 'metrics_{date}_{time}'
};

const DEFAULT_SORT = [
  { key: 'destination', dir: 'asc' },
  { key: 'main', dir: 'asc' }
];

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

// raw data from API (not saved to URL)
const rawData = { mainRows: [], peerRows: [], hourlyRows: [] };

const tableState = {
  globalFilterQuery: '',
  columnFilters: {},
  multiSort: [...DEFAULT_SORT],
  textFields: ['main', 'peer', 'destination'],
  yColumnsVisible: true,
  renderingMode: 'virtual',
  virtualScrollEnabled: true,

  display: { ...DEFAULT_DISPLAY },
  columns: JSON.parse(JSON.stringify(DEFAULT_COLUMNS_CONFIG)),
  behavior: { ...DEFAULT_BEHAVIOR },
  performance: { ...DEFAULT_PERFORMANCE },
  export: { ...DEFAULT_EXPORT }
};

// ─────────────────────────────────────────────────────────────
// Getters: Core
// ─────────────────────────────────────────────────────────────

export const getState = () => ({ ...tableState });
export const areYColumnsVisible = () => tableState.yColumnsVisible;
export const getRenderingMode = () => tableState.renderingMode;
export const isVirtualScrollEnabled = () => tableState.virtualScrollEnabled;
export const getFullData = () => rawData;

// ─────────────────────────────────────────────────────────────
// Getters: Display
// ─────────────────────────────────────────────────────────────

export const getDisplaySettings = () => ({ ...tableState.display });
export const isCompactMode = () => tableState.display.compactMode;
export const getRowHeight = () => tableState.display.rowHeight;
export const getFontSize = () => tableState.display.fontSize;

// ─────────────────────────────────────────────────────────────
// Getters: Columns
// ─────────────────────────────────────────────────────────────

export const getColumnSettings = () => ({ ...tableState.columns });
export const getVisibleColumns = () => [...tableState.columns.visible];
export const getColumnOrder = () => [...tableState.columns.order];
export const getColumnWidth = columnKey => tableState.columns.widths[columnKey] || 100;
export const getFrozenColumns = () => [...tableState.columns.frozen];
// cache Set for O(1) visibility check
let _visibleColumnsSet = null;

export function isColumnVisible(columnKey) {
  // invalidate cache if visible array changed
  if (!_visibleColumnsSet || _visibleColumnsSet._source !== tableState.columns.visible) {
    _visibleColumnsSet = new Set(tableState.columns.visible);
    _visibleColumnsSet._source = tableState.columns.visible;
  }
  return _visibleColumnsSet.has(columnKey);
}

// ─────────────────────────────────────────────────────────────
// Getters: Behavior
// ─────────────────────────────────────────────────────────────

export const getBehaviorSettings = () => ({ ...tableState.behavior });
export const shouldAutoExpandGroups = () => tableState.behavior.autoExpandGroups;
export const shouldRememberExpandedState = () => tableState.behavior.rememberExpandedState;
export const isRowSelectionEnabled = () => tableState.behavior.enableRowSelection;

// ─────────────────────────────────────────────────────────────
// Getters: Performance
// ─────────────────────────────────────────────────────────────

export const getPerformanceSettings = () => ({ ...tableState.performance });
export const isLazyLoadingEnabled = () => tableState.performance.enableLazyLoading;
export const getSearchDebounceMs = () => tableState.performance.searchDebounceMs;
export const getMaxVisibleRows = () => tableState.performance.maxVisibleRows;

// ─────────────────────────────────────────────────────────────
// Getters: Export
// ─────────────────────────────────────────────────────────────

export const getExportSettings = () => ({ ...tableState.export });
export const getDefaultExportFormat = () => tableState.export.defaultFormat;

// ─────────────────────────────────────────────────────────────
// Setters: Core
// ─────────────────────────────────────────────────────────────

export function setFullState(newState) {
  Object.assign(tableState, newState);
  publish('tableState:changed');
}

export function toggleYColumnsVisible() {
  tableState.yColumnsVisible = !tableState.yColumnsVisible;
  publish('tableState:yVisibilityChanged', tableState.yColumnsVisible);
}

export function setFullData(allMainRows, allPeerRows, allHourlyRows = []) {
  rawData.mainRows = allMainRows;
  rawData.peerRows = allPeerRows;
  rawData.hourlyRows = allHourlyRows;

  // reset filters when data changes
  tableState.globalFilterQuery = '';
  tableState.columnFilters = {};
}

// use Set for O(1) lookup
const VALID_RENDERING_MODES = new Set(['auto', 'virtual', 'standard']);

export function setRenderingMode(mode) {
  if (VALID_RENDERING_MODES.has(mode)) {
    tableState.renderingMode = mode;
    publish('tableState:changed');
  }
}

export function setVirtualScrollEnabled(enabled) {
  tableState.virtualScrollEnabled = Boolean(enabled);
  publish('tableState:changed');
}

// ─────────────────────────────────────────────────────────────
// Setters: Filters
// ─────────────────────────────────────────────────────────────

export function setGlobalFilter(query) {
  tableState.globalFilterQuery = query;
  publish('tableState:changed');
}

export function setColumnFilter(key, value) {
  if (value) {
    tableState.columnFilters[key] = value;
  } else {
    delete tableState.columnFilters[key];
  }
  publish('tableState:changed');
}

export function setMultiSort(sortArray) {
  tableState.multiSort = sortArray;
  publish('tableState:changed');
}

export function resetColumnFilters() {
  tableState.columnFilters = {};
  publish('tableState:changed');
}

export function resetAllFilters() {
  tableState.columnFilters = {};
  tableState.globalFilterQuery = '';
  publish('tableState:changed');
}

// ─────────────────────────────────────────────────────────────
// Setters: Display
// ─────────────────────────────────────────────────────────────

export function setDisplaySettings(newSettings) {
  Object.assign(tableState.display, newSettings);
  publish('tableState:displayChanged', tableState.display);
}

export function setCompactMode(enabled) {
  tableState.display.compactMode = enabled;
  tableState.display.rowHeight = enabled ? 32 : 40;
  publish('tableState:compactModeChanged', enabled);
}

export function setRowHeight(height) {
  tableState.display.rowHeight = Math.max(20, Math.min(100, height));
  publish('tableState:rowHeightChanged', tableState.display.rowHeight);
}

// ─────────────────────────────────────────────────────────────
// Setters: Columns
// ─────────────────────────────────────────────────────────────

export function setColumnSettings(newSettings) {
  Object.assign(tableState.columns, newSettings);
  publish('tableState:columnsChanged', tableState.columns);
}

export function setVisibleColumns(columns) {
  tableState.columns.visible = [...columns];
  _visibleColumnsSet = null; // invalidate cache
  publish('tableState:visibleColumnsChanged', tableState.columns.visible);
}

export function setColumnOrder(order) {
  tableState.columns.order = [...order];
  publish('tableState:columnOrderChanged', tableState.columns.order);
}

export function setColumnWidth(columnKey, width) {
  if (!(columnKey in tableState.columns.widths)) return;
  tableState.columns.widths[columnKey] = Math.max(50, Math.min(500, width));
  publish('tableState:columnWidthChanged', { columnKey, width: tableState.columns.widths[columnKey] });
}

export function toggleColumnVisibility(columnKey) {
  const index = tableState.columns.visible.indexOf(columnKey);
  if (index > -1) {
    tableState.columns.visible.splice(index, 1);
  } else {
    tableState.columns.visible.push(columnKey);
  }
  _visibleColumnsSet = null; // invalidate cache
  publish('tableState:columnVisibilityChanged', { columnKey, visible: index === -1 });
}

export function setFrozenColumns(columns) {
  tableState.columns.frozen = [...columns];
  publish('tableState:frozenColumnsChanged', tableState.columns.frozen);
}

// ─────────────────────────────────────────────────────────────
// Setters: Behavior
// ─────────────────────────────────────────────────────────────

export function setBehaviorSettings(newSettings) {
  Object.assign(tableState.behavior, newSettings);
  publish('tableState:behaviorChanged', tableState.behavior);
}

export function setAutoExpandGroups(enabled) {
  tableState.behavior.autoExpandGroups = enabled;
  publish('tableState:autoExpandGroupsChanged', enabled);
}

export function setRowSelectionEnabled(enabled) {
  tableState.behavior.enableRowSelection = enabled;
  publish('tableState:rowSelectionChanged', enabled);
}

// ─────────────────────────────────────────────────────────────
// Setters: Performance
// ─────────────────────────────────────────────────────────────

export function setPerformanceSettings(newSettings) {
  Object.assign(tableState.performance, newSettings);
  publish('tableState:performanceChanged', tableState.performance);
}

export function setLazyLoadingEnabled(enabled) {
  tableState.performance.enableLazyLoading = enabled;
  publish('tableState:lazyLoadingChanged', enabled);
}

export function setSearchDebounceMs(ms) {
  tableState.performance.searchDebounceMs = Math.max(100, Math.min(1000, ms));
  publish('tableState:searchDebounceChanged', tableState.performance.searchDebounceMs);
}

// ─────────────────────────────────────────────────────────────
// Setters: Export
// ─────────────────────────────────────────────────────────────

export function setExportSettings(newSettings) {
  Object.assign(tableState.export, newSettings);
  publish('tableState:exportChanged', tableState.export);
}

// use Set for O(1) lookup
const VALID_EXPORT_FORMATS = new Set(['csv', 'excel', 'json']);

export function setDefaultExportFormat(format) {
  if (!VALID_EXPORT_FORMATS.has(format)) return;
  tableState.export.defaultFormat = format;
  publish('tableState:exportFormatChanged', format);
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

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
  tableState.display = { ...DEFAULT_DISPLAY };
  tableState.columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS_CONFIG));
  tableState.behavior = { ...DEFAULT_BEHAVIOR };
  tableState.performance = { ...DEFAULT_PERFORMANCE };
  tableState.export = { ...DEFAULT_EXPORT };
  tableState.multiSort = [...DEFAULT_SORT];

  publish('tableState:resetToDefaults');
}

// ─────────────────────────────────────────────────────────────
// Convenience exports
// ─────────────────────────────────────────────────────────────

export const getMultiSort = () => tableState.multiSort;
export const getColumnFilters = () => tableState.columnFilters;
export const getGlobalFilterQuery = () => tableState.globalFilterQuery;
export const getRawData = () => rawData;
