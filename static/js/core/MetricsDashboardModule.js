// MetricsDashboardModule - Facade for Metrics Dashboard
// Responsibility: Provide a tiny API wrapper around existing initialization,
// filters and table lifecycle without changing business logic

import { appInitializer } from './app-initializer.js';
import { clearTableFilters, clearSpecificFilter } from '../dom/filters.js';
import { stateManager } from '../state/stateManager.js';
import { subscribe as storeSubscribe } from '../state/store.js';
import { dashboardRenderer } from '../dom/renderer.js';
import { domPatcher, setPatcherContainer } from '../utils/domPatcher.js';
import { dispatch } from '../state/index.js';
import { createSetFilters } from '../state/actions.js';

/**
 * Lightweight facade that orchestrates existing modules.
 * Methods:
 *  - init(containerId): bootstraps UI and table in the given container
 *  - updateFilters(filters): updates DOM inputs and re-initializes filter handlers
 *  - destroy(): cleans up initialized components
 *  - render(state, container): renders HTML framework using new renderer
 *  - updateFramework(state): updates framework based on state changes
 */
export class MetricsDashboardModule {
  constructor() {
    this._initialized = false;
    this._containerId = null;
    this._unsubscribeStore = null;
  }

  /**
   * Initialize dashboard and mount table into container (containerId kept for API symmetry).
   * The existing layout already contains the table markup; we simply run bootstrap.
   */
  async init(containerId) {
    try {
      // Re-init safety: destroy previous instance if exists
      if (this._initialized) {
        this.destroy();
      }

      this._containerId = containerId || null;
      
      // Initialize state manager first
      stateManager.initialize();
      
      // Initialize dashboard renderer
      dashboardRenderer.initialize();
      
      // Initialize DOM patcher
      domPatcher.initialize();
      
      // Render the HTML framework using morphdom via DOM patcher (no direct DOM writes here)
      if (this._containerId) {
        const container = document.getElementById(this._containerId);
        if (!container) {
          console.warn(`MetricsDashboardModule: container "${this._containerId}" not found. Proceeding with default DOM.`);
        } else {
          // Get current state and patch framework using morphdom
          const currentState = stateManager.getCompleteState();
          // Set container for DOM patcher
          setPatcherContainer(container);
          // Apply minimal DOM diff with morphdom
          await domPatcher.forcePatch(currentState);
          
          // Initialize filters after first render (safe: elements exist now)
          await this._initializeFilters();
        }
      }

      // Bootstrap full app: UI modules, filters, table controller, virtualization
      const ok = await appInitializer.initialize();
      this._initialized = !!ok;

      // Subscribe UI to centralized store updates once initialized
      if (this._initialized && !this._unsubscribeStore) {
        this._unsubscribeStore = storeSubscribe((nextState) => {
          // Use existing update path: patch DOM efficiently
          this.updateFramework(nextState);
        });
      }
      
      return this._initialized;
    } catch (error) {
      console.error('MetricsDashboardModule.init error', error);
      return false;
    }
  }

  /**
   * Initialize filters with default values
   * @private
   */
  async _initializeFilters() {
    try {
      // Check if filters are already initialized by app-initializer
      const fromDateInput = document.getElementById("fromDate");
      const toDateInput = document.getElementById("toDate");
      const fromTimeInput = document.getElementById("fromTime");
      const toTimeInput = document.getElementById("toTime");
      
      const filtersAlreadyInitialized = fromDateInput && toDateInput && fromTimeInput && toTimeInput;
      
      if (filtersAlreadyInitialized) {
        console.log("🔍 MetricsDashboardModule: Filters already initialized by app-initializer, skipping");
        return;
      }
      
      // Check if there's already state loaded from URL
      const hasUrlState = window.location.hash && window.location.hash.startsWith("#state=");
      
      if (hasUrlState) {
        console.log("🔍 MetricsDashboardModule: URL state detected, waiting for state to be fully loaded...");
        
        // Wait longer to ensure state is fully loaded and applied
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check again if state is still there and if filters are already populated
        const stillHasUrlState = window.location.hash && window.location.hash.startsWith("#state=");
        const filtersAlreadyPopulated = fromDateInput?.value && toDateInput?.value && 
                                       fromTimeInput?.value && toTimeInput?.value;
        
        if (stillHasUrlState && filtersAlreadyPopulated) {
          console.log("🔍 MetricsDashboardModule: URL state confirmed and filters populated, skipping initialization");
          // Filters are already populated from state, don't initialize
          return;
        } else if (stillHasUrlState && !filtersAlreadyPopulated) {
          console.log("🔍 MetricsDashboardModule: URL state exists but filters not populated, initializing with state loaded");
          const { initFilters } = await import('../dom/filters.js');
          initFilters(true); // true = state already loaded, don't set default dates
        } else {
          console.log("🔍 MetricsDashboardModule: URL state cleared, initializing filters with defaults");
          const { initFilters } = await import('../dom/filters.js');
          initFilters(false); // false = no state, set default dates
        }
      } else {
        console.log("🔍 MetricsDashboardModule: No URL state, initializing filters with defaults");
        const { initFilters } = await import('../dom/filters.js');
        initFilters(false); // false = no state, set default dates
      }
      
      console.log(`🔍 MetricsDashboardModule: Filters initialization completed`);
    } catch (error) {
      console.error('❌ MetricsDashboardModule: Failed to initialize filters', error);
    }
  }

  /**
   * Render the complete HTML framework using the new renderer
   * @param {Object} state - Application state object
   * @param {string|HTMLElement} container - Container element or selector
   * @returns {HTMLElement} The rendered container element
   */
  render(state = {}, container = null) {
    try {
      const targetContainer = container || this._containerId;
      const result = dashboardRenderer.render(state, targetContainer);
      
      if (result) {
        this._containerId = targetContainer;
        // Update DOM patcher container
        setPatcherContainer(result);
        console.log('✅ MetricsDashboardModule: Framework rendered successfully');
      }
      
      return result;
    } catch (error) {
      console.error('MetricsDashboardModule.render error', error);
      return null;
    }
  }

  /**
   * Update the dashboard framework based on new state.
   * @param {Object} state - New state object
   */
  updateFramework(state = {}) {
    if (this._initialized) {
      try {
        // Use DOM patcher for efficient updates
        domPatcher.forcePatch(state);
      } catch (error) {
        console.error('MetricsDashboardModule.updateFramework error', error);
        // Fallback to manual update if patcher fails
        try {
          dashboardRenderer.updateFramework(state);
        } catch (fallbackError) {
          console.error('MetricsDashboardModule: Fallback update also failed', fallbackError);
        }
      }
    }
  }

  /**
   * Update filters and trigger framework update
   * @param {Object} filters - New filter values
   */
  updateFilters(filters) {
    try {
      // Update state via centralized store/dispatch
      dispatch(createSetFilters(filters));
      
      // Trigger DOM update via patcher
      domPatcher.forcePatch();
      
    } catch (error) {
      console.error('❌ MetricsDashboardModule: Failed to update filters', error);
    }
  }

  /**
   * Get the virtualized table container for the virtualization engine
   * @returns {HTMLElement|null} The virtualized table container
   */
  getVirtualizedTableContainer() {
    return dashboardRenderer.getVirtualizedTableContainer();
  }

  /**
   * Show the table section
   */
  showTable() {
    dashboardRenderer.showTable();
  }

  /**
   * Hide the table section
   */
  hideTable() {
    dashboardRenderer.hideTable();
  }

  /**
   * Get DOM patcher status for debugging
   * @returns {Object} Patcher status
   */
  getPatcherStatus() {
    return domPatcher.getStatus();
  }

  /**
   * Force a DOM patch operation
   * @param {Object} state - State to render
   */
  forcePatch(state) {
    domPatcher.forcePatch(state);
  }

  /**
   * Clean up and destroy the dashboard module.
   */
  destroy() {
    if (this._initialized) {
      // Unsubscribe from store updates
      if (this._unsubscribeStore) {
        try { this._unsubscribeStore(); } catch (_) { /* intentional no-op: best-effort unsubscribe */ }
        this._unsubscribeStore = null;
      }
      // Clean up state management
      stateManager.destroy();
      
      // Clean up dashboard renderer
      dashboardRenderer.destroy();
      
      // Clean up DOM patcher
      domPatcher.destroy();
      
      // Clean up app initializer
      appInitializer.destroy();
      
      this._initialized = false;
      this._containerId = null;
    }
  }
}

export const metricsDashboard = new MetricsDashboardModule();

// Export utility functions
export { clearTableFilters, clearSpecificFilter };


