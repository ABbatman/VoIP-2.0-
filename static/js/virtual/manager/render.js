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
        try { vm.renderTableHeaders && vm.renderTableHeaders(); } catch (_) {
          // Ignore header rendering errors
        }
        vm.headersInitialized = true;
      } else {
        try { vm.updateSortArrowsAfterRefresh && vm.updateSortArrowsAfterRefresh(); } catch (_) {
          // Ignore sort arrow update errors
        }
      }
      // DOM handlers and sync via render layer's callback are already wired in setupDomCallbacks()
      try { vm.processQueuedExpandCollapseAll && vm.processQueuedExpandCollapseAll(); } catch (_) {
        // Ignore expand/collapse queue processing errors
      }
      return true;
    } catch (error) {
      console.error('❌ Virtual Manager: Render error', error);
      return false;
    }
  }
  function refreshVirtualTable() {
    if (!vm.lazyData || !vm.adapter) return;

    try {
      // Preserve container and window scroll to avoid jumps
      const container = document.getElementById('virtual-scroll-container');
      const prevCX = container ? container.scrollLeft : null;
      const prevCY = container ? container.scrollTop : null;
      const prevWinY = window.scrollY;
      const prevWinX = window.scrollX;
      try { if (container) container.style.overflowAnchor = 'none'; } catch(_) {}

      const visibleData = vm.selectors ? vm.selectors.getLazyVisibleData() : vm.getLazyVisibleData();
      const ok = vm.adapter.setData(visibleData);
      if (ok) {
        try { vm.syncExpandCollapseAllButtonLabel && vm.syncExpandCollapseAllButtonLabel(); } catch (_) {}
      }
      
      // Restore scroll positions immediately and on next frame
      const restore = () => {
        try {
          if (container && prevCY != null) container.scrollTop = prevCY;
          if (container && prevCX != null) container.scrollLeft = prevCX;
          if (window.scrollY !== prevWinY || window.scrollX !== prevWinX) {
            window.scrollTo(prevWinX, prevWinY);
          }
          if (container) container.style.overflowAnchor = '';
        } catch(_) {}
      };
      restore();
      requestAnimationFrame(restore);
    } catch (e) {
      console.warn('render.refreshVirtualTable error', e);
    }
  }

  function forceImmediateRender() {
    if (!vm.adapter) return;
    try { vm.adapter.forceRender(); } catch (_) {
      // Ignore force render errors
    }
  }

  function setupDomCallbacks() {
    if (!vm.adapter || typeof vm.adapter.setDOMUpdateCallback !== 'function') return;
    vm.adapter.setDOMUpdateCallback(() => {
      try { bindToggleHandlers(vm); } catch (_) {
        // Ignore toggle binding errors
      }
      try { bindDblClickHandlers(vm); } catch (_) {
        // Ignore double-click binding errors
      }
      try { vm.updateAllToggleButtons && vm.updateAllToggleButtons(); } catch (_) {
        // Ignore toggle update errors
      }
      try { vm.syncFloatingHeader && vm.syncFloatingHeader(); } catch (_) {
        // Ignore header sync errors
      }
      try { if (window.restoreFilterFocusIfPending) window.restoreFilterFocusIfPending(); } catch (_) {
        // Ignore focus restore errors
      }
      try { initTooltips(); } catch (_) {
        // Ignore tooltip init errors
      }
      try { connectFilterEventHandlers(); } catch (_) {
        // Ignore filter event handler errors
      }
    });
  }

  function teardown() {
    // no-op for now; kept for symmetry/future
  }

  return { initialRender, refreshVirtualTable, forceImmediateRender, setupDomCallbacks, teardown };
}
