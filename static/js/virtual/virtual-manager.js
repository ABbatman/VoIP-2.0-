// static/js/virtual/virtual-manager.js
// Responsibility: Coordinate virtual table functionality and UI state

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
import { getMainSetProxy, getPeerSetProxy } from '../state/expansionState.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function safeAttach(fn, ctx) {
  try { return fn(); } catch (e) { logError(ErrorCategory.TABLE, ctx, e); return null; }
}

function debounce(fn, delay = 24) {
  let tid = null;
  return (...args) => {
    if (tid) clearTimeout(tid);
    tid = setTimeout(() => { tid = null; try { fn(...args); } catch (e) { logError(ErrorCategory.TABLE, 'vm:debounce', e); } }, delay);
  };
}

// ─────────────────────────────────────────────────────────────
// Class
// ─────────────────────────────────────────────────────────────

export class VirtualManager {
  constructor() {
    this.adapter = null;
    this.isActive = false;
    this.currentData = null;
    this.rawData = { mainRows: [], peerRows: [], hourlyRows: [] };
    this.lazyData = null;

    // expansion state proxies
    this.openMainGroups = getMainSetProxy();
    this.openHourlyGroups = getPeerSetProxy();

    this.boundToggleHandler = null;
    this.sortHandlersAttached = false;
    this._unsubscribers = [];
    this._floatingContainer = null;

    // memoization caches
    this._filterSortKey = '';
    this._mainFilterPass = new Map();
    this._peerRowsCache = new Map();
    this._hourlyRowsCache = new Map();

    // double-click filter binding
    this._dblFilterBound = false;
    this._dblFilterElement = null;
    this.boundDblFilterHandler = null;
  }

  sanitizeId(value) {
    return (value ?? '').toString().replace(/[^\w]+/g, '-');
  }

  // ─────────────────────────────────────────────────────────────
  // Initialize
  // ─────────────────────────────────────────────────────────────

  async initialize() {
    try {
      this.adapter = new VirtualTableAdapter();
      if (!this.adapter.initialize()) {
        logError(ErrorCategory.TABLE, 'vm:init', 'Failed to initialize adapter');
        return false;
      }

      this.isActive = true;

      // attach facades
      this.selectors = safeAttach(() => attachSelectors(this), 'vm:selectors');
      this.toggles = safeAttach(() => attachToggles(this), 'vm:toggles');
      this.render = safeAttach(() => attachRender(this), 'vm:render');
      this.header = safeAttach(() => attachHeader(this), 'vm:header');
      this.sorting = safeAttach(() => attachSorting(), 'vm:sorting');
      this.data = safeAttach(() => attachData(this), 'vm:data');
      this.ui = safeAttach(() => attachUI(), 'vm:ui');

      // setup callbacks
      this.render?.setupDomCallbacks?.();

      // subscriptions
      const { unsubs } = safeAttach(() => attachSubscriptions(this), 'vm:subs') || {};
      if (unsubs) this._unsubscribers.push(...unsubs);

      this.updateUI(true);
      this.syncExpandCollapseAllButtonLabel?.();
      setCurrentManager(this);

      // wrap refresh in debounce
      const originalRefresh = this.refreshVirtualTable.bind(this);
      this.refreshVirtualTable = debounce(originalRefresh, 24);

      return true;
    } catch (e) {
      logError(ErrorCategory.TABLE, 'vm:init', e);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Render delegations
  // ─────────────────────────────────────────────────────────────

  renderVirtualTable(mainRows, peerRows, hourlyRows) {
    return this.render?.initialRender?.(mainRows, peerRows, hourlyRows);
  }

  renderTableHeaders() { return this.header?.renderTableHeaders?.(); }
  syncFloatingHeader() { try { return syncFloatingHeader(this); } catch (e) { logError(ErrorCategory.TABLE, 'vm:syncHeader', e); } }
  syncYToggleIcons() { return this.header?.syncYToggleIcons?.(); }
  updateSortArrowsAfterRefresh() { return this.header?.updateSortArrowsAfterRefresh?.(); }

  refreshVirtualTable() { return this.render?.refreshVirtualTable?.(); }
  forceImmediateRender() { return this.render?.forceImmediateRender?.(); }

  // ─────────────────────────────────────────────────────────────
  // Sorting delegations
  // ─────────────────────────────────────────────────────────────

  applySortingToPeerRows(rows) { return this.sorting?.applySortingToPeerRows?.(rows) ?? rows; }
  applySortingToHourlyRows(rows) { return this.sorting?.applySortingToHourlyRows?.(rows) ?? rows; }
  applySortingToMainRows(rows) { return this.sorting?.applySortingToMainRows?.(rows) ?? rows; }
  normalizeMultiSort(multiSort) { return this.sorting?.normalizeMultiSort?.(multiSort) ?? (Array.isArray(multiSort) ? multiSort : []); }
  getCurrentTableState() { return this.sorting?.getCurrentTableState?.() ?? { multiSort: [] }; }

  // ─────────────────────────────────────────────────────────────
  // Data delegations
  // ─────────────────────────────────────────────────────────────

  initializeLazyData() { return this.data?.initializeLazyData?.(); }
  _computeFilterSortKey() { return this.data?._computeFilterSortKey?.() ?? ''; }
  createMainIndex(rows) { return this.data?.createMainIndex?.(rows) ?? []; }
  createPeerIndex(rows) { return this.data?.createPeerIndex?.(rows) ?? []; }
  createHourlyIndex(rows) { return this.data?.createHourlyIndex?.(rows) ?? []; }

  getMainRowLazy(index) {
    return this.data?.getMainRowLazy?.(index) ?? this.rawData?.mainRows?.[index];
  }

  // ─────────────────────────────────────────────────────────────
  // Selectors delegations
  // ─────────────────────────────────────────────────────────────

  getLazyVisibleData() { return this.selectors?.getLazyVisibleData?.() ?? []; }
  getPeerRowsLazy(mainGroupId) { return this.selectors?.getPeerRowsLazy?.(mainGroupId) ?? []; }
  getHourlyRowsLazy(peerGroupId) { return this.selectors?.getHourlyRowsLazy?.(peerGroupId) ?? []; }

  // ─────────────────────────────────────────────────────────────
  // Toggle delegations
  // ─────────────────────────────────────────────────────────────

  closeHourlyGroupsUnderMain(mainGroupId) { return this.toggles?.closeHourlyGroupsUnderMain?.(mainGroupId) ?? 0; }
  processQueuedExpandCollapseAll() { return this.toggles?.processQueuedExpandCollapseAll?.(); }
  showAllRows() { return this.toggles?.showAllRows?.(); }
  hideAllRows() { return this.toggles?.hideAllRows?.(); }
  updateAllToggleButtons() { return this.toggles?.updateAllToggleButtons?.(); }
  syncExpandCollapseAllButtonLabel() { return this.toggles?.syncExpandCollapseAllButtonLabel?.(); }

  // ─────────────────────────────────────────────────────────────
  // UI delegations
  // ─────────────────────────────────────────────────────────────

  updateUI(isVirtualMode) { return this.ui?.updateUI?.(isVirtualMode); }
  shouldUseVirtualization() { return this.ui?.shouldUseVirtualization?.() ?? true; }

  // ─────────────────────────────────────────────────────────────
  // Status & Destroy
  // ─────────────────────────────────────────────────────────────

  getStatus() {
    return {
      active: this.isActive,
      dataCount: this.data?.getTotalDataCount?.() ?? this.currentData?.length ?? 0,
      adapter: this.adapter?.getStatus() ?? null
    };
  }

  destroy() {
    this.adapter?.destroy();
    this.adapter = null;

    import('./manager/ui-sync.js').then(m => m.unbindFloatingHeader?.(this)).catch(() => {});
    setCurrentManager(null);

    this.updateUI(false);
    this.isActive = false;
    this.currentData = [];
    this.sortHandlersAttached = false;
  }
}
