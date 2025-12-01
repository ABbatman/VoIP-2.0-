// static/js/utils/domPatcher.js
// Responsibility: Efficient DOM updates with morphdom (protects virtualization)
import { dashboardRenderer } from '../dom/renderer.js';
import { stateManager } from '../state/stateManager.js';
import { eventBus } from '../state/eventBus.js';
import { getSearchDebounceMs } from '../state/tableState.js';
import { logError, ErrorCategory } from './errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEFAULT_DEBOUNCE_MS = 100;
const MIN_DEBOUNCE_MS = 50;
const MAX_DEBOUNCE_MS = 1000;

// IDs protected from morphdom updates
const PROTECTED_IDS = new Set([
  'virtual-scroll-container', 'summaryTable', 'tableHead', 'tableBody',
  'charts-container', 'charts-controls', 'chart-area-1'
]);

// events that trigger DOM patch
const PATCH_EVENTS = [
  'appState:dashboardViewChanged',
  'appState:preferencesChanged',
  'tableState:displayChanged',
  'tableState:columnsChanged'
];

// ─────────────────────────────────────────────────────────────
// DOMPatcher Class
// ─────────────────────────────────────────────────────────────

export class DOMPatcher {
  constructor() {
    this.isInitialized = false;
    this.patchQueue = [];
    this.isPatching = false;
    this.patchTimeout = null;
    this.debounceDelay = DEFAULT_DEBOUNCE_MS;
    this.mainContainer = null;
    this.morphdomOptions = null;
  }

  // ───────────────────────────────────────────────────────────
  // Initialization
  // ───────────────────────────────────────────────────────────

  initialize() {
    if (this.isInitialized) return;

    this._setupMorphdomOptions();
    this._setupStateListeners();
    this._syncDebounceFromState();

    this.isInitialized = true;
  }

  setContainer(container) {
    this.mainContainer = container;
  }

  _syncDebounceFromState() {
    try {
      const ms = typeof getSearchDebounceMs === 'function' ? getSearchDebounceMs() : DEFAULT_DEBOUNCE_MS;
      this.setDebounceDelay(ms);
    } catch (e) {
      logError(ErrorCategory.DOM, 'domPatcher:syncDebounce', e);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Morphdom options (protection)
  // ───────────────────────────────────────────────────────────

  _setupMorphdomOptions() {
    this.morphdomOptions = {
      onBeforeElUpdated: el => !this._isProtected(el),
      onBeforeNodeDiscarded: node => !(node instanceof HTMLElement) || !this._isProtected(node)
    };
  }

  _isProtected(el) {
    if (PROTECTED_IDS.has(el.id)) return true;
    if (el.closest) {
      for (const id of PROTECTED_IDS) {
        if (el.closest(`#${id}`)) return true;
      }
    }
    return false;
  }

  // ───────────────────────────────────────────────────────────
  // State listeners
  // ───────────────────────────────────────────────────────────

  _setupStateListeners() {
    stateManager.addStateChangeListener(() => this._queuePatch());

    // no-op for filtersChanged to avoid overwriting inputs during typing
    eventBus.subscribe('appState:filtersChanged', () => {});

    // use indexed loop instead of forEach
    const handler = () => this._queuePatch();
    const len = PATCH_EVENTS.length;
    for (let i = 0; i < len; i++) {
      eventBus.subscribe(PATCH_EVENTS[i], handler);
    }

    eventBus.subscribe('tableState:searchDebounceChanged', ms => {
      try { this.setDebounceDelay(ms); } catch (e) { logError(ErrorCategory.DOM, 'domPatcher:debounce', e); }
    });
  }

  // ───────────────────────────────────────────────────────────
  // Patch queue
  // ───────────────────────────────────────────────────────────

  _queuePatch() {
    if (this.patchTimeout) clearTimeout(this.patchTimeout);
    this.patchTimeout = setTimeout(() => this._executePatch(), this.debounceDelay);
  }

  async _executePatch() {
    if (this.isPatching || !this.mainContainer) return;

    try {
      this.isPatching = true;
      const html = this._renderNewHTML(stateManager.getCompleteState());
      if (html) await this._patchDOM(html);
    } catch (e) {
      logError(ErrorCategory.DOM, 'domPatcher:executePatch', e);
    } finally {
      this.isPatching = false;
    }
  }

  // ───────────────────────────────────────────────────────────
  // Rendering
  // ───────────────────────────────────────────────────────────

  _renderNewHTML(state) {
    try {
      return dashboardRenderer.renderToString(state);
    } catch (e) {
      logError(ErrorCategory.DOM, 'domPatcher:renderNewHTML', e);
      return null;
    }
  }

  async _patchDOM(newHTML) {
    if (!newHTML || !this.mainContainer || !window.morphdom) return;

    try {
      await window.morphdom(this.mainContainer, newHTML, this.morphdomOptions);
      await this._reinitializeEventHandlers();
    } catch (e) {
      logError(ErrorCategory.DOM, 'domPatcher:patchDOM', e);
    }
  }

  async _reinitializeEventHandlers() {
    try {
      const { initFilters } = await import('../dom/filters.js');
      initFilters(true);

      const { initFlatpickr, initTimeControls } = await import('../dom/ui-widgets.js');
      initFlatpickr();
      initTimeControls();
    } catch (e) {
      logError(ErrorCategory.DOM, 'domPatcher:reinitHandlers', e);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────

  async forcePatch(state = null) {
    if (this.patchTimeout) clearTimeout(this.patchTimeout);

    try {
      const targetState = state || stateManager.getCompleteState();
      const html = this._renderNewHTML(targetState);
      if (html) await this._patchDOM(html);
    } catch (e) {
      logError(ErrorCategory.DOM, 'domPatcher:forcePatch', e);
      throw e;
    }
  }

  clearQueue() {
    if (this.patchTimeout) {
      clearTimeout(this.patchTimeout);
      this.patchTimeout = null;
    }
    this.patchQueue = [];
  }

  setDebounceDelay(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return;
    this.debounceDelay = Math.max(MIN_DEBOUNCE_MS, Math.min(MAX_DEBOUNCE_MS, Math.floor(n)));
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isPatching: this.isPatching,
      hasContainer: !!this.mainContainer,
      queueLength: this.patchQueue.length,
      debounceDelay: this.debounceDelay
    };
  }

  destroy() {
    this.clearQueue();
    this.isInitialized = false;
    this.mainContainer = null;
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton & convenience exports
// ─────────────────────────────────────────────────────────────

export const domPatcher = new DOMPatcher();

export const setPatcherContainer = container => domPatcher.setContainer(container);
export const forcePatch = state => domPatcher.forcePatch(state);
export const getPatcherStatus = () => domPatcher.getStatus();
export const clearPatchQueue = () => domPatcher.clearQueue();
export const setPatcherDebounceDelay = ms => domPatcher.setDebounceDelay(ms);
