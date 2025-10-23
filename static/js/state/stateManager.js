// static/js/state/stateManager.js
// State Manager Module - Single Responsibility: Centralized State Management
// Provides a unified interface for managing both app and table state

import {
  getFullState as getAppFullState,
  updateFullState as setAppFullState,
  setDashboardView,
  setPreferences,
  setSettings,
  resetFilters
} from './appState.js';

import {
  resetAllFilters
} from './tableState.js';

import {
  getFullTableState,
  setFullState as setTableFullState,
  setDisplaySettings,
  resetToDefaults as resetTableToDefaults
} from './tableState.js';

import {
  saveStateToUrl,
  loadStateFromUrl,
  clearStateFromUrl,
  getCurrentUrlState,
  hasUrlState
} from './urlState.js';

import { publish, subscribe } from './eventBus.js';

/**
 * State Manager - Centralized state management for the entire application
 * Responsibility: Provide unified interface for state operations
 */
export class StateManager {
  constructor() {
    this.isInitialized = false;
    this.autoSaveEnabled = true;
    this.autoSaveInterval = null;
    this.stateChangeListeners = new Set();
    this.saveTimeout = null;
    
    this.initialize();
  }

  /**
   * Initialize the state manager
   */
  initialize() {
    if (this.isInitialized) return;

    // Set up event subscriptions for automatic state saving
    this.setupEventSubscriptions();
    
    // Load initial state from URL if available
    this.loadInitialState();
    
    // Start auto-save if enabled
    if (this.autoSaveEnabled) {
      this.startAutoSave();
    }
    
    this.isInitialized = true;
    console.log('✅ State Manager: Initialized successfully');
  }

    /**
   * Set up event subscriptions for automatic state management
   */
    setupEventSubscriptions() {
    // Subscribe to app state changes (exclude statusChanged to prevent auto-save loops)
    // subscribe('appState:statusChanged', () => this.handleStateChange()); // DISABLED: causes save loops
    subscribe('appState:filtersChanged', () => this.handleStateChange());
    subscribe('appState:dashboardViewChanged', () => this.handleStateChange());
    subscribe('appState:preferencesChanged', () => this.handleStateChange());
    subscribe('appState:settingsChanged', () => this.handleStateChange());

    // Subscribe to table state changes
    // subscribe('tableState:changed', () => this.handleStateChange()); // DISABLED: causes save loops during data loading
    subscribe('tableState:displayChanged', () => this.handleStateChange());
    subscribe('tableState:columnsChanged', () => this.handleStateChange());
    subscribe('tableState:behaviorChanged', () => this.handleStateChange());
    subscribe('tableState:performanceChanged', () => this.handleStateChange());
    subscribe('tableState:exportChanged', () => this.handleStateChange());
  }

  /**
   * Load initial state from URL or set defaults
   */
  loadInitialState() {
    const urlState = loadStateFromUrl();
    if (urlState) {
      console.log('📥 State Manager: Initial state loaded from URL');
    } else {
      console.log('🆕 State Manager: No saved state found, using defaults');
      this.setDefaultState();
    }
  }

  /**
   * Set default state for the application
   */
  setDefaultState() {
    // Set default app preferences
    setPreferences({
      theme: 'light',
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm:ss'
    });
    
    // Set default dashboard view
    setDashboardView({
      currentMode: 'summary',
      timeRange: '24h',
      autoRefresh: false,
      refreshInterval: 30000
    });
    
    // Set default table settings
    setDisplaySettings({
      compactMode: false,
      showRowNumbers: true,
      showGroupHeaders: true,
      showSummaryFooter: true,
      rowHeight: 40,
      fontSize: 14
    });
    
    console.log('🔄 State Manager: Default state applied');
  }

  /**
   * Handle state changes and trigger auto-save
   */
  handleStateChange() {
    if (this.autoSaveEnabled) {
      this.debouncedSave();
    }
    
    // Notify state change listeners
    this.notifyStateChangeListeners();
  }

  /**
   * Debounced save to prevent excessive URL updates
   */
  debouncedSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(() => {
      this.saveState();
    }, 1000); // 1 second debounce
  }

  /**
   * Save current state to URL
   */
  saveState() {
    try {
      saveStateToUrl();
      console.log('💾 State Manager: State saved to URL');
    } catch (error) {
      console.error('❌ State Manager: Failed to save state:', error);
    }
  }

  /**
   * Load state from URL
   */
  loadState() {
    try {
      const loadedState = loadStateFromUrl();
      if (loadedState) {
        console.log('📥 State Manager: State loaded from URL');
        return loadedState;
      }
    } catch (error) {
      console.error('❌ State Manager: Failed to load state:', error);
    }
    return null;
  }

  /**
   * Clear state from URL
   */
  clearState() {
    try {
      clearStateFromUrl();
      console.log('🗑️ State Manager: State cleared from URL');
    } catch (error) {
      console.error('❌ State Manager: Failed to clear state:', error);
    }
  }

  /**
   * Start automatic state saving
   */
  startAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    this.autoSaveInterval = setInterval(() => {
      if (this.autoSaveEnabled) {
        this.saveState();
      }
    }, 30000); // Save every 30 seconds
    
    console.log('🔄 State Manager: Auto-save started (30s interval)');
  }

  /**
   * Stop automatic state saving
   */
  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
      console.log('⏹️ State Manager: Auto-save stopped');
    }
  }

  /**
   * Enable or disable auto-save
   */
  setAutoSaveEnabled(enabled) {
    this.autoSaveEnabled = enabled;
    if (enabled) {
      this.startAutoSave();
    } else {
      this.stopAutoSave();
    }
    console.log(`🔄 State Manager: Auto-save ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get complete application state
   */
  getCompleteState() {
    return {
      app: getAppFullState(),
      table: getFullTableState(),
      url: getCurrentUrlState(),
      hasUrlState: hasUrlState(),
      timestamp: Date.now()
    };
  }

  /**
   * Export state to JSON string
   */
  exportState() {
    try {
      const state = this.getCompleteState();
      const jsonString = JSON.stringify(state, null, 2);
      return jsonString;
    } catch (error) {
      console.error('❌ State Manager: Failed to export state:', error);
      return null;
    }
  }

  /**
   * Import state from JSON string
   */
  importState(jsonString) {
    try {
      const state = JSON.parse(jsonString);
      
      if (state.app) {
        setAppFullState(state.app);
      }
      
      if (state.table) {
        setTableFullState(state.table);
      }
      
      console.log('📥 State Manager: State imported successfully');
      return true;
    } catch (error) {
      console.error('❌ State Manager: Failed to import state:', error);
      return false;
    }
  }

  /**
   * Reset only table filters (column filters and global filter)
   */
  resetTableFilters() {
    try {
      resetAllFilters();
      console.log('🔄 State Manager: Table filters reset');
      publish('stateManager:tableFiltersReset');
    } catch (error) {
      console.error('❌ State Manager: Failed to reset table filters', error);
    }
  }

  /**
   * Reset all state to defaults
   */
  resetAllState() {
    try {
      // Reset app state
      resetFilters();
      setDashboardView({
        currentMode: 'summary',
        timeRange: '24h',
        autoRefresh: false,
        refreshInterval: 30000
      });
      setPreferences({
        theme: 'light',
        language: 'en',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm:ss'
      });
      setSettings({
        debugMode: false,
        performanceMonitoring: false,
        showTooltips: true,
        compactMode: false
      });
      
      // Reset table state including all filters
      resetAllFilters();
      resetTableToDefaults();
      
      // Clear URL state
      this.clearState();
      
      console.log('🔄 State Manager: All state reset to defaults');
      publish('stateManager:allStateReset');
    } catch (error) {
      console.error('❌ State Manager: Failed to reset state:', error);
    }
  }

  /**
   * Add a listener for state changes
   * @param {Function} listener - Function to call when state changes
   */
  addStateChangeListener(listener) {
    this.stateChangeListeners.add(listener);
  }

  /**
   * Remove state change listener
   */
  removeStateChangeListener(listener) {
    this.stateChangeListeners.delete(listener);
  }

  /**
   * Notify all state change listeners
   */
  notifyStateChangeListeners() {
    this.stateChangeListeners.forEach(listener => {
      try {
        listener(this.getCompleteState());
      } catch (error) {
        console.error('❌ State Manager: Listener error:', error);
      }
    });
  }

  /**
   * Get state statistics
   */
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

  /**
   * Destroy the state manager
   */
  destroy() {
    this.stopAutoSave();
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.stateChangeListeners.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const stateManager = new StateManager();

// Export convenience functions for backward compatibility
export const getCompleteState = () => stateManager.getCompleteState();
export const saveState = () => stateManager.saveState();
export const loadState = () => stateManager.loadState();
export const clearState = () => stateManager.clearState();
export const resetAllState = () => stateManager.resetAllState();
export const resetTableFilters = () => stateManager.resetTableFilters();
export const exportState = () => stateManager.exportState();
export const importState = (jsonString) => stateManager.importState(jsonString);
