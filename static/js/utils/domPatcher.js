// static/js/utils/domPatcher.js
// DOM Patcher Module - Single Responsibility: Efficient DOM Updates with morphdom

import { dashboardRenderer } from '../dom/renderer.js';
import { stateManager } from '../state/stateManager.js';
import { eventBus } from '../state/eventBus.js';
import { getSearchDebounceMs } from '../state/tableState.js';
import { logError, ErrorCategory } from './errorLogger.js';

/**
 * DOM Patcher
 * Responsibility: Efficiently update DOM using morphdom without disrupting virtualization
 */
export class DOMPatcher {
  constructor() {
    this.isInitialized = false;
    this.patchQueue = [];
    this.isPatching = false;
    this.patchTimeout = null;
    this.debounceDelay = 100;
    this.mainContainer = null;
  }

  /**
   * Initialize the DOM patcher
   */
  initialize() {
    if (this.isInitialized) return;
    
    this._setupPatchOptions();
    this._setupStateListeners();
    // Use centralized debounce setting from tableState
    try {
      const ms = typeof getSearchDebounceMs === 'function' ? getSearchDebounceMs() : this.debounceDelay;
      this.setDebounceDelay(ms);
    } catch (e) { logError(ErrorCategory.DOM, 'domPatcher', e); /* noop */ }
    this.isInitialized = true;
    console.log('✅ DOM Patcher: Initialized');
  }

  /**
   * Set the main container for patching
   * @param {HTMLElement} container - Main container element
   */
  setContainer(container) {
    this.mainContainer = container;
  }

  /**
   * Setup morphdom options to protect virtualization
   */
  _setupPatchOptions() {
    this.morphdomOptions = {
      onBeforeElUpdated: (fromEl) => {
        // Never update the virtualized table container
        if (fromEl.id === 'virtual-scroll-container' || 
            fromEl.id === 'summaryTable' ||
            fromEl.id === 'tableHead' ||
            fromEl.id === 'tableBody') {
          return false;
        }

        // Never update elements inside the virtualized container
        if (fromEl.closest('#virtual-scroll-container')) {
          return false;
        }

        // Never update the charts container/controls/mount to avoid flicker/remount during unrelated DOM patches
        if (fromEl.id === 'charts-container' || fromEl.id === 'charts-controls' || fromEl.id === 'chart-area-1') {
          return false;
        }
        // And do not update children inside the charts container
        if (fromEl.closest && (fromEl.closest('#charts-container') || fromEl.closest('#charts-controls') || fromEl.closest('#chart-area-1'))) {
          return false;
        }
        
        return true;
      },
      onBeforeNodeDiscarded: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        // Protect charts and virtual table nodes from being removed by morphdom
        if (node.id === 'charts-container' || node.id === 'charts-controls' || node.id === 'chart-area-1') return false;
        if (node.closest && (node.closest('#charts-container') || node.closest('#charts-controls') || node.closest('#chart-area-1'))) return false;
        if (node.id === 'virtual-scroll-container' || node.id === 'summaryTable' || node.id === 'tableHead' || node.id === 'tableBody') return false;
        if (node.closest && node.closest('#virtual-scroll-container')) return false;
        return true;
      },
    };
  }

  /**
   * Setup state change listeners
   */
  _setupStateListeners() {
    // Listen to general state changes
    stateManager.addStateChangeListener(() => {
      this._queuePatch();
    });

    // Listen to specific events
    // For filtersChanged: do not patch at all. Inputs are source of truth until Find is pressed.
    eventBus.subscribe('appState:filtersChanged', () => {
      // no-op to avoid writing previous values back into inputs during typing
    });
    eventBus.subscribe('appState:dashboardViewChanged', () => this._queuePatch());
    eventBus.subscribe('appState:preferencesChanged', () => this._queuePatch());
    eventBus.subscribe('tableState:displayChanged', () => this._queuePatch());
    eventBus.subscribe('tableState:columnsChanged', () => this._queuePatch());
    // Keep debounce in sync with tableState configuration
    eventBus.subscribe('tableState:searchDebounceChanged', (ms) => {
      try { this.setDebounceDelay(ms); } catch (e) { logError(ErrorCategory.DOM, 'domPatcher', e); /* noop */ }
    });
  }

  /**
   * Queue a patch operation with debouncing
   */
  _queuePatch() {
    if (this.patchTimeout) {
      clearTimeout(this.patchTimeout);
    }

    this.patchTimeout = setTimeout(() => {
      this._executePatch();
    }, this.debounceDelay);
  }

  /**
   * Execute the actual DOM patch
   */
  async _executePatch() {
    if (this.isPatching || !this.mainContainer) return;

    try {
      this.isPatching = true;
      
      const currentState = stateManager.getCompleteState();
      const newElement = this._renderNewHTML(currentState);
      
      if (newElement) {
        await this._patchDOM(newElement);
      }
    } catch (error) {
      console.error('❌ DOM Patcher: Patch execution failed', error);
    } finally {
      this.isPatching = false;
    }
  }

  /**
   * Render new HTML based on current state
   * @param {Object} state - Current application state
   * @returns {HTMLElement|null} Rendered container element
   */
  _renderNewHTML(state) {
    try {
      // Render to string to allow morphdom to diff against existing DOM
      const htmlString = dashboardRenderer.renderToString(state);
      return htmlString;
    } catch (error) {
      console.error('❌ DOM Patcher: Failed to render new HTML', error);
      return null;
    }
  }

  /**
   * Patch the DOM using morphdom
   * @param {HTMLElement} newElement - New rendered element
   */
  async _patchDOM(newHTML) {
    try {
      if (newHTML && this.mainContainer && window.morphdom) {
        // apply minimal diff with morphdom using HTML string (no pre-mutation)
        await window.morphdom(this.mainContainer, newHTML, this.morphdomOptions);
        // Re-initialize event handlers after DOM update
        await this._reinitializeEventHandlers();
      } else {
        console.warn('⚠️ DOM Patcher: morphdom not available or container missing');
      }
    } catch (error) {
      console.error('❌ DOM Patcher: morphdom failed', error);
    }
  }

  /**
   * Re-initialize event handlers after DOM updates
   */
  async _reinitializeEventHandlers() {
    try {
      // Re-initialize filters (this will set up event handlers for buttons)
      // Pass true to indicate state is already loaded, so don't set default dates
      const { initFilters } = await import('../dom/filters.js');
      initFilters(true); // true = state already loaded, don't set default dates

      // Initialize UI widgets after morphdom applied the new DOM
      // (renderer.render now returns HTML string only)
      const { initFlatpickr, initTimeControls } = await import('../dom/ui-widgets.js');
      initFlatpickr(); // set up date pickers
      initTimeControls(); // attach N/Z/+/- time controls
      
    } catch (error) {
      console.error('❌ DOM Patcher: Failed to reinitialize event handlers', error);
    }
  }

  /**
   * Force immediate patch (bypasses queue)
   * @param {Object} state - State to patch with
   */
  async forcePatch(state = null) {
    console.log("🔄 DOM Patcher: forcePatch called with state:", state);
    
    if (this.patchTimeout) {
      clearTimeout(this.patchTimeout);
      console.log("🔄 DOM Patcher: Cleared existing patch timeout");
    }
    
    try {
      const targetState = state || stateManager.getCompleteState();
      console.log("🔄 DOM Patcher: Target state:", targetState);
      
      const newElement = this._renderNewHTML(targetState);
      console.log("🔄 DOM Patcher: New HTML rendered:", !!newElement);
      
      if (newElement) {
        await this._patchDOM(newElement);
      }
    } catch (error) {
      console.error('❌ DOM Patcher: Force patch failed', error);
      throw error;
    }
  }

  /**
   * Clear the patch queue
   */
  clearQueue() {
    if (this.patchTimeout) {
      clearTimeout(this.patchTimeout);
      this.patchTimeout = null;
    }
    this.patchQueue = [];
  }

  /**
   * Update debounce delay (ms) for DOM patch queueing
   * @param {number} ms
   */
  setDebounceDelay(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return;
    // Clamp to reasonable range to avoid UI stalls
    this.debounceDelay = Math.max(50, Math.min(1000, Math.floor(n)));
  }

  /**
   * Get patcher status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isPatching: this.isPatching,
      hasContainer: !!this.mainContainer,
      queueLength: this.patchQueue.length,
      debounceDelay: this.debounceDelay
    };
  }

  /**
   * Destroy the patcher
   */
  destroy() {
    this.clearQueue();
    this.isInitialized = false;
    this.mainContainer = null;
    console.log('🗑️ DOM Patcher: Destroyed');
  }
}

// Export singleton instance
export const domPatcher = new DOMPatcher();

// Export convenience functions
export const setPatcherContainer = (container) => domPatcher.setContainer(container);
export const forcePatch = (state) => domPatcher.forcePatch(state);
export const getPatcherStatus = () => domPatcher.getStatus();
export const clearPatchQueue = () => domPatcher.clearQueue();
export const setPatcherDebounceDelay = (ms) => domPatcher.setDebounceDelay(ms);
