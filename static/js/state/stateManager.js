// static/js/state/stateManager.js
// Responsibility: Centralized state management facade
import { getFullState as getAppFullState, updateFullState as setAppFullState, setDashboardView, setPreferences, setSettings, resetFilters } from './appState.js';
import { resetAllFilters, getFullTableState, setFullState as setTableFullState, setDisplaySettings, resetToDefaults as resetTableToDefaults } from './tableState.js';
import { saveStateToUrl, loadStateFromUrl, clearStateFromUrl, getCurrentUrlState, hasUrlState } from './urlState.js';
import { publish, subscribe } from './eventBus.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SAVE_DEBOUNCE_MS = 1000;
const AUTO_SAVE_INTERVAL_MS = 30000;

const DEFAULT_PREFERENCES = {
  theme: 'light',
  language: 'en',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  dateFormat: 'YYYY-MM-DD',
  timeFormat: 'HH:mm:ss'
};

const DEFAULT_DASHBOARD_VIEW = {
  currentMode: 'summary',
  timeRange: '24h',
  autoRefresh: false,
  refreshInterval: 30000
};

const DEFAULT_DISPLAY_SETTINGS = {
  compactMode: false,
  showRowNumbers: true,
  showGroupHeaders: true,
  showSummaryFooter: true,
  rowHeight: 40,
  fontSize: 14
};

const DEFAULT_SETTINGS = {
  debugMode: false,
  performanceMonitoring: false,
  showTooltips: true,
  compactMode: false
};

// events to subscribe for auto-save
const APP_STATE_EVENTS = [
  'appState:filtersChanged',
  'appState:dashboardViewChanged',
  'appState:preferencesChanged',
  'appState:settingsChanged'
];

const TABLE_STATE_EVENTS = [
  'tableState:displayChanged',
  'tableState:columnsChanged',
  'tableState:behaviorChanged',
  'tableState:performanceChanged',
  'tableState:exportChanged'
];

// ─────────────────────────────────────────────────────────────
// StateManager class
// ─────────────────────────────────────────────────────────────

export class StateManager {
  constructor() {
    this.isInitialized = false;
    this.autoSaveEnabled = true;
    this.autoSaveInterval = null;
    this.saveTimeout = null;
    this.stateChangeListeners = new Set();

    this._initialize();
  }

  // ─────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────

  _initialize() {
    if (this.isInitialized) return;

    this._setupEventSubscriptions();
    this._loadInitialState();

    if (this.autoSaveEnabled) this._startAutoSave();

    this.isInitialized = true;
  }

  // public alias for external callers
  initialize() {
    this._initialize();
  }

  _setupEventSubscriptions() {
    const handler = () => this._handleStateChange();
    [...APP_STATE_EVENTS, ...TABLE_STATE_EVENTS].forEach(event => subscribe(event, handler));
  }

  _loadInitialState() {
    const urlState = loadStateFromUrl();
    if (!urlState) this._setDefaultState();
  }

  _setDefaultState() {
    setPreferences(DEFAULT_PREFERENCES);
    setDashboardView(DEFAULT_DASHBOARD_VIEW);
    setDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
  }

  // ─────────────────────────────────────────────────────────────
  // State change handling
  // ─────────────────────────────────────────────────────────────

  _handleStateChange() {
    if (this.autoSaveEnabled) this._debouncedSave();
    this._notifyListeners();
  }

  _debouncedSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveState(), SAVE_DEBOUNCE_MS);
  }

  _notifyListeners() {
    const state = this.getCompleteState();
    this.stateChangeListeners.forEach(listener => {
      try { listener(state); } catch (e) { logError(ErrorCategory.STATE, 'StateManager:listener', e); }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Auto-save
  // ─────────────────────────────────────────────────────────────

  _startAutoSave() {
    this._stopAutoSave();
    this.autoSaveInterval = setInterval(() => {
      if (this.autoSaveEnabled) this.saveState();
    }, AUTO_SAVE_INTERVAL_MS);
  }

  _stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  setAutoSaveEnabled(enabled) {
    this.autoSaveEnabled = enabled;
    enabled ? this._startAutoSave() : this._stopAutoSave();
  }

  // ─────────────────────────────────────────────────────────────
  // Public API: State operations
  // ─────────────────────────────────────────────────────────────

  saveState() {
    try { saveStateToUrl(); } catch (e) { logError(ErrorCategory.STATE, 'StateManager:save', e); }
  }

  loadState() {
    try { return loadStateFromUrl(); } catch (e) { logError(ErrorCategory.STATE, 'StateManager:load', e); }
    return null;
  }

  clearState() {
    try { clearStateFromUrl(); } catch (e) { logError(ErrorCategory.STATE, 'StateManager:clear', e); }
  }

  getCompleteState() {
    return {
      app: getAppFullState(),
      table: getFullTableState(),
      url: getCurrentUrlState(),
      hasUrlState: hasUrlState(),
      timestamp: Date.now()
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Public API: Import/Export
  // ─────────────────────────────────────────────────────────────

  exportState() {
    try {
      return JSON.stringify(this.getCompleteState(), null, 2);
    } catch (e) {
      logError(ErrorCategory.STATE, 'StateManager:export', e);
      return null;
    }
  }

  importState(jsonString) {
    try {
      const state = JSON.parse(jsonString);
      if (state.app) setAppFullState(state.app);
      if (state.table) setTableFullState(state.table);
      return true;
    } catch (e) {
      logError(ErrorCategory.STATE, 'StateManager:import', e);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Public API: Reset
  // ─────────────────────────────────────────────────────────────

  resetTableFilters() {
    try {
      resetAllFilters();
      publish('stateManager:tableFiltersReset');
    } catch (e) {
      logError(ErrorCategory.STATE, 'StateManager:resetTableFilters', e);
    }
  }

  resetAllState() {
    try {
      resetFilters();
      setDashboardView(DEFAULT_DASHBOARD_VIEW);
      setPreferences(DEFAULT_PREFERENCES);
      setSettings(DEFAULT_SETTINGS);
      resetAllFilters();
      resetTableToDefaults();
      this.clearState();
      publish('stateManager:allStateReset');
    } catch (e) {
      logError(ErrorCategory.STATE, 'StateManager:resetAll', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Public API: Listeners
  // ─────────────────────────────────────────────────────────────

  addStateChangeListener(listener) {
    this.stateChangeListeners.add(listener);
  }

  removeStateChangeListener(listener) {
    this.stateChangeListeners.delete(listener);
  }

  // ─────────────────────────────────────────────────────────────
  // Public API: Stats & Cleanup
  // ─────────────────────────────────────────────────────────────

  getStateStats() {
    const state = this.getCompleteState();
    return {
      appStateSize: JSON.stringify(state.app).length,
      tableStateSize: JSON.stringify(state.table).length,
      totalStateSize: JSON.stringify(state).length,
      hasUrlState: state.hasUrlState,
      lastSave: state.timestamp,
      autoSaveEnabled: this.autoSaveEnabled
    };
  }

  destroy() {
    this._stopAutoSave();
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.stateChangeListeners.clear();
    this.isInitialized = false;
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton & convenience exports
// ─────────────────────────────────────────────────────────────

export const stateManager = new StateManager();

export const getCompleteState = () => stateManager.getCompleteState();
export const saveState = () => stateManager.saveState();
export const loadState = () => stateManager.loadState();
export const clearState = () => stateManager.clearState();
export const resetAllState = () => stateManager.resetAllState();
export const resetTableFilters = () => stateManager.resetTableFilters();
export const exportState = () => stateManager.exportState();
export const importState = jsonString => stateManager.importState(jsonString);
