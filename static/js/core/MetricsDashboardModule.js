// static/js/core/MetricsDashboardModule.js
// Responsibility: Dashboard facade for initialization and lifecycle
import { appInitializer } from './app-initializer.js';
import { clearTableFilters, clearSpecificFilter } from '../dom/filters.js';
import { stateManager } from '../state/stateManager.js';
import { subscribe as storeSubscribe } from '../state/store.js';
import { dashboardRenderer } from '../dom/renderer.js';
import { domPatcher, setPatcherContainer } from '../utils/domPatcher.js';
import { dispatch } from '../state/index.js';
import { createSetFilters } from '../state/actions.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const URL_STATE_PREFIX = '#state=';
const STATE_LOAD_DELAY_MS = 500;

const FILTER_IDS = {
  fromDate: 'fromDate',
  toDate: 'toDate',
  fromTime: 'fromTime',
  toTime: 'toTime'
};

// ─────────────────────────────────────────────────────────────
// Filter helpers
// ─────────────────────────────────────────────────────────────

function getFilterElements() {
  return {
    fromDate: document.getElementById(FILTER_IDS.fromDate),
    toDate: document.getElementById(FILTER_IDS.toDate),
    fromTime: document.getElementById(FILTER_IDS.fromTime),
    toTime: document.getElementById(FILTER_IDS.toTime)
  };
}

function areFilterElementsPresent() {
  const els = getFilterElements();
  return !!(els.fromDate && els.toDate && els.fromTime && els.toTime);
}

function areFiltersPopulated() {
  const els = getFilterElements();
  return !!(els.fromDate?.value && els.toDate?.value && els.fromTime?.value && els.toTime?.value);
}

function hasUrlState() {
  return window.location.hash?.startsWith(URL_STATE_PREFIX);
}

async function loadFiltersModule() {
  const { initFilters } = await import('../dom/filters.js');
  return initFilters;
}

// ─────────────────────────────────────────────────────────────
// MetricsDashboardModule class
// ─────────────────────────────────────────────────────────────

export class MetricsDashboardModule {
  constructor() {
    this._initialized = false;
    this._containerId = null;
    this._unsubscribeStore = null;
  }

  // ─────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────

  async init(containerId) {
    try {
      if (this._initialized) {
        this.destroy();
      }

      this._containerId = containerId || null;

      this.initializeServices();
      await this.initializeContainer();

      const ok = await appInitializer.initialize();
      this._initialized = !!ok;

      this.subscribeToStore();

      return this._initialized;
    } catch (error) {
      logError(ErrorCategory.INIT, 'MetricsDashboardModule:init', error);
      return false;
    }
  }

  initializeServices() {
    stateManager.initialize();
    dashboardRenderer.initialize();
    domPatcher.initialize();
  }

  async initializeContainer() {
    if (!this._containerId) return;

    const container = document.getElementById(this._containerId);
    if (!container) return;

    const currentState = stateManager.getCompleteState();
    setPatcherContainer(container);
    await domPatcher.forcePatch(currentState);
    await this.initializeFilters();
  }

  subscribeToStore() {
    if (!this._initialized || this._unsubscribeStore) return;

    this._unsubscribeStore = storeSubscribe((nextState) => {
      this.updateFramework(nextState);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Filter initialization
  // ─────────────────────────────────────────────────────────────

  async initializeFilters() {
    try {
      if (areFilterElementsPresent()) return;

      const initFilters = await loadFiltersModule();

      if (!hasUrlState()) {
        initFilters(false);
        return;
      }

      // wait for URL state to be applied
      await new Promise(resolve => setTimeout(resolve, STATE_LOAD_DELAY_MS));

      if (hasUrlState() && areFiltersPopulated()) {
        return; // already populated from URL state
      }

      initFilters(hasUrlState());
    } catch (error) {
      logError(ErrorCategory.INIT, 'MetricsDashboardModule:initializeFilters', error);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────

  render(state = {}, container = null) {
    try {
      const targetContainer = container || this._containerId;
      const result = dashboardRenderer.render(state, targetContainer);

      if (result) {
        this._containerId = targetContainer;
        setPatcherContainer(result);
      }

      return result;
    } catch (error) {
      logError(ErrorCategory.INIT, 'MetricsDashboardModule:render', error);
      return null;
    }
  }

  updateFramework(state = {}) {
    if (!this._initialized) return;

    try {
      domPatcher.forcePatch(state);
    } catch (error) {
      logError(ErrorCategory.INIT, 'MetricsDashboardModule:updateFramework', error);
      this.fallbackUpdate(state);
    }
  }

  fallbackUpdate(state) {
    try {
      dashboardRenderer.updateFramework(state);
    } catch (error) {
      logError(ErrorCategory.INIT, 'MetricsDashboardModule:fallbackUpdate', error);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Filter updates
  // ─────────────────────────────────────────────────────────────

  updateFilters(filters) {
    try {
      dispatch(createSetFilters(filters));
      domPatcher.forcePatch();
    } catch (error) {
      logError(ErrorCategory.INIT, 'MetricsDashboardModule:updateFilters', error);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Table visibility
  // ─────────────────────────────────────────────────────────────

  getVirtualizedTableContainer() {
    return dashboardRenderer.getVirtualizedTableContainer();
  }

  showTable() {
    dashboardRenderer.showTable();
  }

  hideTable() {
    dashboardRenderer.hideTable();
  }

  // ─────────────────────────────────────────────────────────────
  // DOM patcher
  // ─────────────────────────────────────────────────────────────

  getPatcherStatus() {
    return domPatcher.getStatus();
  }

  forcePatch(state) {
    domPatcher.forcePatch(state);
  }

  // ─────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────

  destroy() {
    if (!this._initialized) return;

    this.unsubscribeFromStore();
    this.destroyServices();

    this._initialized = false;
    this._containerId = null;
  }

  unsubscribeFromStore() {
    if (!this._unsubscribeStore) return;

    try {
      this._unsubscribeStore();
    } catch (e) {
      logError(ErrorCategory.INIT, 'MetricsDashboardModule:unsubscribe', e);
    }

    this._unsubscribeStore = null;
  }

  destroyServices() {
    stateManager.destroy();
    dashboardRenderer.destroy();
    domPatcher.destroy();
    appInitializer.destroy();
  }
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

export const metricsDashboard = new MetricsDashboardModule();
export { clearTableFilters, clearSpecificFilter };


