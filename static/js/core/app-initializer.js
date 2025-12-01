// static/js/core/app-initializer.js
// Responsibility: Application bootstrap orchestration
import { initFilters } from '../dom/filters.js';
import { initSummary } from '../dom/summary.js';
import { initTableView } from '../dom/table-ui.js';
import { initUiFeedback } from '../dom/ui-feedback.js';
import { initTableInteractions } from '../dom/table.js';
import { initTooltips } from '../dom/tooltip.js';
import { initEllipsisTooltip } from '../dom/ellipsis-tooltip.js';
import { initYColumnToggle } from '../dom/hideYColumns.js';
import { initTopScrollbar } from '../dom/top-scrollbar.js';
import { initLayoutSync, updateReverseButtonState } from '../dom/layout.js';
import { initUrlStateSync, loadStateFromUrl } from '../state/urlState.js';
import { hasShortLinkId, loadStateFromShortLink } from '../state/shortLinkState.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { isReverseMode } from '../state/appState.js';
import { subscribe } from '../state/eventBus.js';
import { initStickyFooter } from '../dom/sticky-table-chrome.js';
import { renderCoordinator } from '../rendering/render-coordinator.js';
import { initScrollControls } from '../dom/scroll-controls.js';
import { isRenderingInProgress, isManualFindInProgress } from '../state/runtimeFlags.js';
import { getVirtualManager } from '../state/moduleRegistry.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const AUTO_TRIGGER_DELAY_MS = 500;
const RESULTS_SELECTOR = '.results-display';
const SUMMARY_ID = 'summaryMetrics';
const FIND_BUTTON_ID = 'findButton';

const FILTER_IDS = {
  fromDate: 'fromDate',
  toDate: 'toDate',
  fromTime: 'fromTime',
  toTime: 'toTime'
};

// ─────────────────────────────────────────────────────────────
// Filter helpers
// ─────────────────────────────────────────────────────────────

function getFilterValues() {
  return {
    fromDate: document.getElementById(FILTER_IDS.fromDate)?.value,
    toDate: document.getElementById(FILTER_IDS.toDate)?.value,
    fromTime: document.getElementById(FILTER_IDS.fromTime)?.value,
    toTime: document.getElementById(FILTER_IDS.toTime)?.value
  };
}

function areFiltersPopulated() {
  const values = getFilterValues();
  return !!(values.fromDate && values.toDate && values.fromTime && values.toTime);
}

function clickFindButton() {
  const btn = document.getElementById(FIND_BUTTON_ID);
  if (btn) {
    btn.click();
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Visibility helpers
// ─────────────────────────────────────────────────────────────

function hideElement(selector, isId = false) {
  const el = isId ? document.getElementById(selector) : document.querySelector(selector);
  el?.classList.add('is-hidden');
}

// ─────────────────────────────────────────────────────────────
// UI module initialization
// ─────────────────────────────────────────────────────────────

function initCoreModules() {
  initSummary();
  initTableView();
  initUiFeedback();
}

function initFeatureModules() {
  initYColumnToggle();
  initTopScrollbar();
  initEllipsisTooltip();
  initTooltips();
}

function initLayoutModules() {
  initLayoutSync();
  initUrlStateSync();
}

function initInteractiveModules(hasState) {
  initFilters(hasState);
  initTableInteractions();
  initStickyFooter();
  initScrollControls();
}

// ─────────────────────────────────────────────────────────────
// AppInitializer class
// ─────────────────────────────────────────────────────────────

export class AppInitializer {
  constructor() {
    this.tableController = null;
    this.isInitialized = false;
  }

  // ─────────────────────────────────────────────────────────────
  // Main initialization
  // ─────────────────────────────────────────────────────────────

  async initialize() {
    try {
      const loadedState = this.loadInitialState();

      await this.initializeUIModules(loadedState);
      await this.initializeTableController();

      this.setupEventSubscriptions(loadedState);
      this.applyInitialUIState();
      this.setupInitialVisibility();
      this.autoTriggerIfNeeded(loadedState);

      this.isInitialized = true;
      return true;
    } catch (error) {
      logError(ErrorCategory.INIT, 'AppInitializer:initialize', error);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // State loading
  // ─────────────────────────────────────────────────────────────

  loadInitialState() {
    if (hasShortLinkId()) {
      return { _loadingFromShortLink: true };
    }
    return loadStateFromUrl();
  }

  // ─────────────────────────────────────────────────────────────
  // UI initialization
  // ─────────────────────────────────────────────────────────────

  async initializeUIModules(loadedState) {
    initCoreModules();
    initFeatureModules();
    initLayoutModules();
    initInteractiveModules(!!loadedState);
  }

  async initializeTableController() {
    const { TableController } = await import('../rendering/table-controller.js');
    this.tableController = new TableController();
    await this.tableController.initialize();
  }

  // ─────────────────────────────────────────────────────────────
  // Event subscriptions
  // ─────────────────────────────────────────────────────────────

  setupEventSubscriptions(loadedState) {
    if (!this.tableController) return;

    subscribe('tableState:changed', () => {
      if (isRenderingInProgress()) return;

      renderCoordinator.requestRender('table', async () => {
        try {
          const vm = getVirtualManager();
          if (vm?.isActive) {
            vm.refreshVirtualTable();
            return;
          }
          this.tableController?.redrawTable?.(loadedState);
        } catch (e) {
          logError(ErrorCategory.INIT, 'AppInitializer:tableStateChanged', e);
        }
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // UI state
  // ─────────────────────────────────────────────────────────────

  applyInitialUIState() {
    updateReverseButtonState(isReverseMode());
  }

  setupInitialVisibility() {
    hideElement(RESULTS_SELECTOR);
    hideElement(SUMMARY_ID, true);
  }

  // ─────────────────────────────────────────────────────────────
  // Auto-trigger
  // ─────────────────────────────────────────────────────────────

  autoTriggerIfNeeded(loadedState) {
    if (loadedState?._loadingFromShortLink) {
      this.handleShortLinkState();
      return;
    }

    if (loadedState) {
      this.triggerFindAfterDelay();
    }
  }

  handleShortLinkState() {
    loadStateFromShortLink()
      .then(state => {
        if (state) this.triggerFindAfterDelay();
      })
      .catch(e => logError(ErrorCategory.INIT, 'AppInitializer:shortLink', e));
  }

  triggerFindAfterDelay() {
    setTimeout(() => {
      if (isManualFindInProgress()) return;
      if (!areFiltersPopulated()) return;

      clickFindButton();
    }, AUTO_TRIGGER_DELAY_MS);
  }

  // ─────────────────────────────────────────────────────────────
  // Status & cleanup
  // ─────────────────────────────────────────────────────────────

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      hasTableController: !!this.tableController,
      tableControllerStatus: this.tableController?.getStatus?.() ?? null
    };
  }

  destroy() {
    this.tableController?.destroy?.();
    this.tableController = null;
    this.isInitialized = false;
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────

export const appInitializer = new AppInitializer();

