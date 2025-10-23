// static/js/virtual/manager/render.js
// Layer: render (adapter <-> scroller integration, refresh & force render)

import { bindToggleHandlers, bindDblClickHandlers } from './events.js';
import { initTooltips } from '../../dom/tooltip.js';
import { connectFilterEventHandlers } from '../../dom/table-ui.js';

export function attachRender(vm) {
  function initialRender(mainRows, peerRows, hourlyRows) {
    if (!vm.isActive || !vm.adapter) {
      console.warn('Virtual Manager: Not active, cannot render');
      return false;
    }

    try {
      const sortedMainRows = vm.applySortingToMainRows(mainRows);
      vm.rawData = { mainRows: sortedMainRows, peerRows, hourlyRows };
      vm.initializeLazyData();
      const initialData = vm.selectors ? vm.selectors.getLazyVisibleData() : vm.getLazyVisibleData();
      const success = vm.adapter.setData(initialData);
      if (!success) {
        console.warn('Virtual Manager: Failed to set data in adapter');
        return false;
      }

      if (!vm.headersInitialized) {
        try { vm.renderTableHeaders && vm.renderTableHeaders(); } catch (_) {}
        vm.headersInitialized = true;
      } else {
        try { vm.updateSortArrowsAfterRefresh && vm.updateSortArrowsAfterRefresh(); } catch (_) {}
      }
      // DOM handlers and sync via render layer's callback are already wired in setupDomCallbacks()
      try { vm.processQueuedExpandCollapseAll && vm.processQueuedExpandCollapseAll(); } catch (_) {}
      return true;
    } catch (error) {
      console.error('❌ Virtual Manager: Render error', error);
      return false;
    }
  }
  function refreshVirtualTable() {
    if (!vm.lazyData || !vm.adapter) return;

    try {
      // Preserve only container scroll to avoid window jumps/flicker
      const container = document.getElementById('virtual-scroll-container');
      const prevCX = container ? container.scrollLeft : null;
      const prevCY = container ? container.scrollTop : null;
      try { if (container) container.style.overflowAnchor = 'none'; } catch(_) {}

      const visibleData = vm.selectors ? vm.selectors.getLazyVisibleData() : vm.getLazyVisibleData();
      const ok = vm.adapter.setData(visibleData);
      if (ok) {
        try { vm.syncExpandCollapseAllButtonLabel && vm.syncExpandCollapseAllButtonLabel(); } catch (_) {}
      }
      // Restore container scroll on the very next frame only (no window.scrollTo)
      requestAnimationFrame(() => {
        try {
          if (container && prevCY != null) container.scrollTop = prevCY;
          if (container && prevCX != null) container.scrollLeft = prevCX;
        } catch(_) {}
        try { if (container) container.style.overflowAnchor = ''; } catch(_) {}
      });
      // Microtask fallback
      Promise.resolve().then(() => { try { if (container && prevCY != null) container.scrollTop = prevCY; if (container && prevCX != null) container.scrollLeft = prevCX; if (container) container.style.overflowAnchor = ''; } catch(_) {} });
    } catch (e) {
      console.warn('render.refreshVirtualTable error', e);
    }
  }

  function forceImmediateRender() {
    if (!vm.adapter) return;
    try { vm.adapter.forceRender(); } catch (_) {}
  }

  function setupDomCallbacks() {
    if (!vm.adapter || typeof vm.adapter.setDOMUpdateCallback !== 'function') return;
    vm.adapter.setDOMUpdateCallback(() => {
      try { bindToggleHandlers(vm); } catch (_) {}
      try { bindDblClickHandlers(vm); } catch (_) {}
      try { vm.updateAllToggleButtons && vm.updateAllToggleButtons(); } catch (_) {}
      try { vm.syncFloatingHeader && vm.syncFloatingHeader(); } catch (_) {}
      try { if (window.restoreFilterFocusIfPending) window.restoreFilterFocusIfPending(); } catch (_) {}
      try { initTooltips(); } catch (_) {}
      try { connectFilterEventHandlers(); } catch (_) {}
    });
  }

  function teardown() {
    // no-op for now; kept for symmetry/future
  }

  return { initialRender, refreshVirtualTable, forceImmediateRender, setupDomCallbacks, teardown };
}
