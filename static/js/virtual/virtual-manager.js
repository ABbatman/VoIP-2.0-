// Virtual Manager Module - Single Responsibility: Manage Virtual Table State and UI
// Localized comments in English as requested

import { VirtualTableAdapter } from './virtual-adapter.js';
import { syncFloatingHeader } from './manager/ui-sync.js';
import { attachSelectors } from './manager/selectors.js';
import { attachToggles } from './manager/toggles.js';
import { attachRender } from './manager/render.js';
import { attachHeader } from './manager/header.js';
import { attachSorting } from './manager/sorting.js';
import { attachData } from './manager/data-cache.js';
import { attachUI } from './manager/ui-state.js';
import { attachSubscriptions } from './manager/subscriptions.js';
import { setCurrentManager } from './registry.js';

// Lightweight debug logger (controlled by window.DEBUG)
function logDebug(...args) {
  try {
    if (typeof window !== 'undefined' && window.DEBUG) {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  } catch (_) {
    /* no-op */
  }
}

/**
 * Virtual Manager
 * Responsibility: Coordinate virtual table functionality and UI state management
 */
export class VirtualManager {
  constructor() {
    this.adapter = null;
    this.isActive = false;
    this.currentData = null;
    this.rawData = { mainRows: [], peerRows: [], hourlyRows: [] };
    this.lazyData = null;
    // Track expanded/collapsed state
    this.openMainGroups = new Set();
    this.openHourlyGroups = new Set();
    // Store bound handler to properly remove event listeners
    this.boundToggleHandler = null;
    // Track if headers are initialized to avoid recreating sort handlers
    // ✅ SORT FIX: Track if sort handlers are attached to prevent duplication
    this.sortHandlersAttached = false;
    // Track event-bus unsubs and DOM listeners for cleanup
    this._unsubscribers = [];
    this._floatingContainer = null;
    // Memoization caches for filter/sort to reduce CPU during scroll
    this._filterSortKey = '';
    this._mainFilterPass = new Map(); // groupId -> boolean
    this._peerRowsCache = new Map(); // key: `${filterKey}|${mainGroupId}` -> peerRows[]
    this._hourlyRowsCache = new Map(); // key: `${filterKey}|${peerGroupId}` -> hourlyRows[]
    // Idempotent binding for cell double-click to footer filter
    this._dblFilterBound = false;
    this._dblFilterElement = null;
    this.boundDblFilterHandler = null;
  }

  // Локальный неблокирующий debounce без внешних зависимостей
  _debounce(fn, delay = 24) {
    let tid = null;
    return (...args) => {
      if (tid) clearTimeout(tid);
      tid = setTimeout(() => { tid = null; try { fn.apply(this, args); } catch(_) {} }, delay);
    };
  }

  /**
   * Clear memoization caches when filter/sort key changes
   * Sanitize value to be used inside a stable DOM/group identifier
   */
  sanitizeId(value) {
    return (value ?? '').toString().replace(/[^\w]+/g, '-');
  }

  /**
   * Initialize virtual table management
   */
  async initialize() {
    try {
      this.adapter = new VirtualTableAdapter();
      const initialized = this.adapter.initialize();
      
      if (initialized) {
        this.isActive = true;
        // Step A: attach selectors facade
        try { this.selectors = attachSelectors(this); } catch (_) { this.selectors = null; }
        // Step B: attach toggles facade
        try { this.toggles = attachToggles(this); } catch (_) { this.toggles = null; }
        // Step C: attach render facade
        try { this.render = attachRender(this); } catch (_) { this.render = null; }
        // Header/UI helpers
        try { this.header = attachHeader(this); } catch (_) { this.header = null; }
        // Sorting and data/cache layers
        try { this.sorting = attachSorting(); } catch (_) { this.sorting = null; }
        try { this.data = attachData(this); } catch (_) { this.data = null; }
        
        // Set up DOM update callback via render layer
        try { this.render && this.render.setupDomCallbacks && this.render.setupDomCallbacks(); } catch (_) {}
        // Attach UI facade
        try { this.ui = attachUI(); } catch (_) { this.ui = null; }
        try { const { unsubs } = attachSubscriptions(this); this._unsubscribers.push(...(unsubs || [])); } catch (_) {}
        this.updateUI(true);
        // Ensure Expand/Collapse All button reflects current state on init
        try { this.syncExpandCollapseAllButtonLabel(); } catch (_) { /* no-op */ }
        // Register manager in module registry (no globals)
        try { setCurrentManager(this); } catch (_) { /* no-op */ }

        // Обернуть refreshVirtualTable в лёгкий debounce, чтобы сгладить серии частых обновлений
        try {
          const originalRefresh = this.refreshVirtualTable.bind(this);
          this.refreshVirtualTable = this._debounce(() => { try { originalRefresh(); } catch(_) {} }, 24);
        } catch(_) {}
        logDebug('✅ Virtual Manager: initialized successfully');
        return true;
      } else {
        console.warn('⚠️ Virtual Manager: Failed to initialize adapter');
        return false;
      }
    } catch (error) {
      console.error('❌ Virtual Manager: Initialization error', error);
      return false;
    }
  }

  /**
   * Render data using virtual scrolling
   */
  renderVirtualTable(mainRows, peerRows, hourlyRows) {
    if (this.render && typeof this.render.initialRender === 'function') {
      return this.render.initialRender(mainRows, peerRows, hourlyRows);
    }
  }

  /**
   * Render table headers with proper sorting functionality
   */
  renderTableHeaders() {
    if (this.header && typeof this.header.renderTableHeaders === 'function') {
      return this.header.renderTableHeaders();
    }
  }

  // Thin wrapper: delegate sync to ui-sync module
  syncFloatingHeader() {
    try { return syncFloatingHeader(this); } catch (_) {}
  }

  /**
   * Compute column widths by measuring the first data row cells (fallback to thead)
   */
  // Delegate helpers to header layer
  syncYToggleIcons() {
    if (this.header && typeof this.header.syncYToggleIcons === 'function') {
      return this.header.syncYToggleIcons();
    }
  }

  /**
   * Update sort arrows after data refresh
   */
  updateSortArrowsAfterRefresh() {
    if (this.header && typeof this.header.updateSortArrowsAfterRefresh === 'function') {
      return this.header.updateSortArrowsAfterRefresh();
    }
  }

  /**
   * Apply current sorting to peer rows (same logic as standard table sorting)
   */
  applySortingToPeerRows(peerRows) {
    if (this.sorting && this.sorting.applySortingToPeerRows) {
      return this.sorting.applySortingToPeerRows(peerRows);
    }
    return peerRows;
  }

  /**
   * Apply current sorting to hourly rows (same logic as standard table sorting)
   */
  applySortingToHourlyRows(hourlyRows) {
    if (this.sorting && this.sorting.applySortingToHourlyRows) {
      return this.sorting.applySortingToHourlyRows(hourlyRows);
    }
    return hourlyRows;
  }

  /**
   * Apply sorting to main rows with normalized priority (main first, then destination)
   */
  applySortingToMainRows(mainRows) {
    if (this.sorting && this.sorting.applySortingToMainRows) return this.sorting.applySortingToMainRows(mainRows);
    return mainRows;
  }

  /**
   * Normalize multiSort so that 'main' is primary and 'destination' secondary if both present
   */
  normalizeMultiSort(multiSort) {
    if (this.sorting && this.sorting.normalizeMultiSort) return this.sorting.normalizeMultiSort(multiSort);
    return Array.isArray(multiSort) ? multiSort : [];
  }

  /**
   * Get current table state for sorting
   */
  getCurrentTableState() {
    if (this.sorting && this.sorting.getCurrentTableState) return this.sorting.getCurrentTableState();
    return { multiSort: [] };
  }

  /**
   * Initialize lazy data structure - only create metadata, don't process all data
   */
  initializeLazyData() {
    if (this.data && this.data.initializeLazyData) return this.data.initializeLazyData();
  }

  /**
   * Build a snapshot key for current filters and sorting
   */
  _computeFilterSortKey() {
    if (this.data && this.data._computeFilterSortKey) return this.data._computeFilterSortKey();
    return '';
  }

  /**
   * Create index for main rows (lightweight metadata only)
   */
  createMainIndex(mainRows) {
    if (this.data && this.data.createMainIndex) return this.data.createMainIndex(mainRows);
    return [];
  }

  /**
   * Create index for peer rows (lightweight metadata only)  
   */
  createPeerIndex(peerRows) {
    if (this.data && this.data.createPeerIndex) return this.data.createPeerIndex(peerRows);
    return [];
  }

  /**
   * Create index for hourly rows (lightweight metadata only)
   */
  createHourlyIndex(hourlyRows) {
    if (this.data && this.data.createHourlyIndex) return this.data.createHourlyIndex(hourlyRows);
    return [];
  }

  /**
   * Get lazy visible data - ULTRA LAZY - only process what's actually needed
   */
  getLazyVisibleData() {
    // Delegate to selectors facade (extracted layer)
    if (this.selectors && typeof this.selectors.getLazyVisibleData === 'function') {
      return this.selectors.getLazyVisibleData();
    }
    // Fallback (should not be used after Step A): empty
    return [];
  }

  /**
   * ULTRA LAZY: Get single main row only when needed
   */
  getMainRowLazy(index) {
    if (this.data && this.data.getMainRowLazy) return this.data.getMainRowLazy(index);
    const rows = (this.rawData && this.rawData.mainRows) ? this.rawData.mainRows : [];
    return rows[index];
  }

  /**
   * ULTRA LAZY: Get peer rows for specific main group only when expanded
   */
  getPeerRowsLazy(mainGroupId) {
    if (this.selectors && typeof this.selectors.getPeerRowsLazy === 'function') {
      return this.selectors.getPeerRowsLazy(mainGroupId);
    }
    return [];
  }

  

  /**
   * ULTRA LAZY: Get hourly rows for specific peer group only when expanded
   */
  getHourlyRowsLazy(peerGroupId) {
    if (this.selectors && typeof this.selectors.getHourlyRowsLazy === 'function') {
      return this.selectors.getHourlyRowsLazy(peerGroupId);
    }
    return [];
  }

  

  

  /**
   * Close all hourly groups under a main group
   */
  closeHourlyGroupsUnderMain(mainGroupId) {
    if (this.toggles && typeof this.toggles.closeHourlyGroupsUnderMain === 'function') {
      return this.toggles.closeHourlyGroupsUnderMain(mainGroupId);
    }
    return 0;
  }

  /**
   * Refresh virtual table with current visibility state (lazy loading)
   */
  refreshVirtualTable() {
    if (this.render && typeof this.render.refreshVirtualTable === 'function') {
      return this.render.refreshVirtualTable();
    }
  }

  /**
   * Execute queued Show All/Hide All intent if user clicked before data was ready
   */
  processQueuedExpandCollapseAll() {
    if (this.toggles && typeof this.toggles.processQueuedExpandCollapseAll === 'function') {
      return this.toggles.processQueuedExpandCollapseAll();
    }
  }

  /**
   * Force immediate visual update for toggle operations
   */
  forceImmediateRender() {
    if (this.render && typeof this.render.forceImmediateRender === 'function') {
      return this.render.forceImmediateRender();
    }
  }

  
  /**
   * Show all rows (expand all MAIN groups to show peer rows ONLY) - lazy version
   */
  showAllRows() {
    if (this.toggles && typeof this.toggles.showAllRows === 'function') {
      return this.toggles.showAllRows();
    }
  }

  /**
   * Hide all rows (collapse all groups)
   */
  hideAllRows() {
    if (this.toggles && typeof this.toggles.hideAllRows === 'function') {
      return this.toggles.hideAllRows();
    }
  }

  /**
   * Update all toggle button states after bulk operations
   */
  updateAllToggleButtons() {
    if (this.toggles && typeof this.toggles.updateAllToggleButtons === 'function') {
      return this.toggles.updateAllToggleButtons();
    }
  }

  /**
   * Update UI to reflect virtual scrolling state
   */
  updateUI(isVirtualMode) { if (this.ui && this.ui.updateUI) return this.ui.updateUI(isVirtualMode); }

  /**
   * Check if virtualization should be used
   */
  shouldUseVirtualization() { return this.ui && this.ui.shouldUseVirtualization ? this.ui.shouldUseVirtualization() : true; }

  /**
   * Get current status
   */
  getStatus() {
    return {
      active: this.isActive,
      dataCount: this.data && this.data.getTotalDataCount ? this.data.getTotalDataCount() : (this.currentData ? this.currentData.length : 0),
      adapter: this.adapter ? this.adapter.getStatus() : null
    };
  }

  /**
   * Destroy virtual manager
   */
  destroy() {
    if (this.adapter) {
      this.adapter.destroy();
      this.adapter = null;
    }
    try { import('./manager/ui-sync.js').then(m => m.unbindFloatingHeader && m.unbindFloatingHeader(this)); } catch (_) {}
    try { setCurrentManager(null); } catch (_) {}
    
    this.updateUI(false);
    this.isActive = false;
    this.currentData = [];
    // Reset sort handlers flag
    this.sortHandlersAttached = false;
    
    console.log('🗑️ Virtual Manager: Destroyed');
  }
}
