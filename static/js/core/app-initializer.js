// App Initializer Module - Single Responsibility: Application Bootstrap
// Localized comments in English as requested

import { initFilters } from "../dom/filters.js";
import { initSummary } from "../dom/summary.js";
import { initTableView } from "../dom/table-ui.js";
import { initUiFeedback } from "../dom/ui-feedback.js";
import { initTableInteractions } from "../dom/table.js";
import { initTooltips } from "../dom/tooltip.js";
import { initEllipsisTooltip } from "../dom/ellipsis-tooltip.js";
import { initYColumnToggle } from "../dom/hideYColumns.js";
import { initTopScrollbar } from "../dom/top-scrollbar.js";
import { initLayoutSync, updateReverseButtonState } from "../dom/layout.js";
import { initUrlStateSync, loadStateFromUrl } from "../state/urlState.js";
import { isReverseMode } from "../state/appState.js";
import { subscribe } from "../state/eventBus.js";
import { initStickyFooter } from "../dom/sticky-table-chrome.js";
import { renderCoordinator } from "../rendering/render-coordinator.js";
import { initScrollControls } from "../dom/scroll-controls.js";

/**
 * Application Initializer
 * Responsibility: Bootstrap the entire application in correct order
 */
export class AppInitializer {
  constructor() {
    this.tableController = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the complete application
   */
  async initialize() {
    try {
      console.log("🚀 App Initializer: Starting application bootstrap...");

      // 1. Load state from URL first
      const loadedState = this.loadInitialState();

      // 2. Initialize all UI modules
      await this.initializeUIModules(loadedState);

      // 3. Initialize table controller
      await this.initializeTableController();

      // 4. Setup event subscriptions
      this.setupEventSubscriptions(loadedState);

      // 5. Apply initial UI state
      this.applyInitialUIState();

      // 6. Setup initial visibility
      this.setupInitialVisibility();

      // 7. Auto-trigger if state loaded
      this.autoTriggerIfNeeded(loadedState);

      this.isInitialized = true;
      console.log("✅ App Initializer: Application bootstrap completed");
      
      return true;
    } catch (error) {
      console.error("❌ App Initializer: Bootstrap failed", error);
      return false;
    }
  }

  /**
   * Load initial state from URL
   */
  loadInitialState() {
    console.log("📥 App Initializer: Loading state from URL...");
    const loadedState = loadStateFromUrl();
    
    if (loadedState) {
      console.log("✅ App Initializer: State loaded from URL");
    } else {
      console.log("ℹ️ App Initializer: No URL state found");
    }
    
    return loadedState;
  }

  /**
   * Initialize all UI modules in correct order
   */
  async initializeUIModules(loadedState) {
    console.log("🎨 App Initializer: Initializing UI modules...");

    // Core UI modules
    initSummary();
    initTableView();
    initUiFeedback();
    
    // Feature modules
    initYColumnToggle();
    initTopScrollbar();
    initEllipsisTooltip();
    initTooltips();
    
    // Layout and sync modules
    initLayoutSync();
    initUrlStateSync();
    
    // Interactive modules (need to be after layout)
    initFilters(!!loadedState);
    initTableInteractions();
    initStickyFooter();
    initScrollControls();
    
    console.log("✅ App Initializer: UI modules initialized");
  }

  /**
   * Initialize table controller
   */
  async initializeTableController() {
    console.log("📊 App Initializer: Initializing table controller...");
    
    // Lazy-load table controller to reduce initial bundle size
    const mod = await import("../rendering/table-controller.js");
    const { TableController } = mod;
    this.tableController = new TableController();
    const success = await this.tableController.initialize();
    
    if (success) {
      console.log("✅ App Initializer: Table controller initialized");
    } else {
      console.warn("⚠️ App Initializer: Table controller initialization failed");
    }
  }

  /**
   * Setup event subscriptions
   */
  setupEventSubscriptions(loadedState) {
    console.log("📡 App Initializer: Setting up event subscriptions...");
    
    if (this.tableController) {
      // Subscribe to table state changes
      subscribe("tableState:changed", () => {
        // Skip if a coordinated table render is already in progress
        // to avoid enqueuing a redundant pass triggered from inside coordinator
        if (typeof window !== 'undefined' && window.__renderingInProgress) return;
        // Always route through coordinator 'table' to avoid races/duplicates
        renderCoordinator.requestRender('table', async () => {
          try {
            // Если активен виртуальный режим — не дергать стандартный контроллер
            if (window.virtualManager && window.virtualManager.isActive) {
              try { window.virtualManager.refreshVirtualTable(); } catch (_) {}
              return;
            }
            if (this.tableController && typeof this.tableController.redrawTable === 'function') {
              this.tableController.redrawTable(loadedState);
            }
          } catch (_) {}
        });
      });
      
      console.log("✅ App Initializer: Event subscriptions setup");
    } else {
      console.warn("⚠️ App Initializer: No table controller for event subscriptions");
    }
  }

  /**
   * Apply initial UI state
   */
  applyInitialUIState() {
    console.log("🎯 App Initializer: Applying initial UI state...");
    
    // Apply reverse button state
    updateReverseButtonState(isReverseMode());
    
    console.log("✅ App Initializer: Initial UI state applied");
  }

  /**
   * Setup initial visibility of main content areas
   */
  setupInitialVisibility() {
    console.log("👁️ App Initializer: Setting up initial visibility...");
    
    const resultsContainer = document.querySelector(".results-display");
    const summaryMetricsContainer = document.getElementById("summaryMetrics");
    
    if (resultsContainer) {
      resultsContainer.classList.add('is-hidden');
    }
    
    if (summaryMetricsContainer) {
      summaryMetricsContainer.classList.add('is-hidden');
    }
    
    console.log("✅ App Initializer: Initial visibility setup");
  }

  /**
   * Auto-trigger find if state was loaded from URL
   */
  autoTriggerIfNeeded(loadedState) {
    if (loadedState) {
      console.log('▶️ App Initializer: Auto-triggering "Find" for loaded URL state...');

      // Add delay to ensure filters are restored from URL state
      setTimeout(() => {
        console.log('▶️ App Initializer: Executing auto-trigger "Find" after delay...');

        // Check if a manual find is already in progress (prevents duplicate triggers)
        if (window._isManualFindInProgress) {
          console.log('▶️ App Initializer: Manual find in progress, skipping auto-trigger');
          return;
        }

        // Check if filters are actually populated before triggering Find
        const fromDateInput = document.getElementById("fromDate");
        const toDateInput = document.getElementById("toDate");
        const fromTimeInput = document.getElementById("fromTime");
        const toTimeInput = document.getElementById("toTime");

        const filtersPopulated = fromDateInput?.value && toDateInput?.value &&
                                 fromTimeInput?.value && toTimeInput?.value;

        console.log('▶️ App Initializer: Filters populated check:', {
          fromDate: fromDateInput?.value,
          toDate: toDateInput?.value,
          fromTime: fromTimeInput?.value,
          toTime: toTimeInput?.value,
          filtersPopulated,
          isManualFindInProgress: window._isManualFindInProgress
        });

        if (filtersPopulated) {
          console.log('▶️ App Initializer: Filters are populated, triggering Find...');
          const findButton = document.getElementById("findButton");
          if (findButton) {
            findButton.click();
          } else {
            console.warn("⚠️ App Initializer: Find button not found");
          }
        } else {
          console.warn('⚠️ App Initializer: Filters are not populated, skipping auto-trigger Find');
        }
      }, 500); // Wait 500ms for filters to be restored
    }
  }

  /**
   * Get initialization status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      hasTableController: !!this.tableController,
      tableControllerStatus: this.tableController ? this.tableController.getStatus() : null
    };
  }

  /**
   * Cleanup initializer
   */
  destroy() {
    if (this.tableController) {
      this.tableController.destroy();
      this.tableController = null;
    }
    
    this.isInitialized = false;
    console.log('🗑️ App Initializer: Destroyed');
  }
}

// Export singleton instance for easy use
export const appInitializer = new AppInitializer();

